import { setTimeout as delay } from 'node:timers/promises';
import { DEVICE } from './scenario.mjs';
import { candidates, isField, observationHash, publicObservation, resolveFresh, validateAction } from './policy.mjs';

//#region bounded execution
export async function runExperiment({ live, scenario, createDevice, createModels,
  checkpoint, maxSteps = 300, maxMs = 45 * 60000, audit, save, signal,
  sleep = ms => delay(ms, undefined, { signal }),
}) {
  if (live !== true) throw new Error('Explicit live flag required');
  const start = Date.now();
  const state = checkpoint ? structuredClone(checkpoint) : { phase: 'new_task', round: 0, prompt: scenario.turns[0].prompt,
    submitted: false, seen: [], expectedArtifacts: Object.values(scenario.artifacts) };
  const history = [];
  const evidence = [];
  let device;
  if (checkpoint && (!['reply', 'compose', 'cloud'].includes(state.phase) || !Number.isInteger(state.round) || state.round < 0 || state.round >= scenario.turns.length || state.prompt !== scenario.turns[state.round].prompt || JSON.stringify(state.expectedArtifacts) !== JSON.stringify(Object.values(scenario.artifacts)))) throw new Error('Invalid resume checkpoint');
  let roundsCompleted = checkpoint ? (state.phase === 'cloud' ? scenario.turns.length : state.round) : 0;
  let status = 'budget_exhausted';
  let failure;
  try {
    device = await createDevice();
    const models = createModels();
    for (let step = 1; step <= maxSteps && Date.now() - start < maxMs; step++) {
      signal?.throwIfAborted();
      const observation = publicObservation(await device.observe(DEVICE, { maxNodes: 500, maxDepth: 60, signal }));
      if (checkpoint && step === 1 && !observation.nodes.some(n => `${n.name ?? ''} ${n.value ?? ''}`.includes(scenario.runId))) throw new Error('Resume task identity not visible');
      const cs = candidates(observation);
      const shot = await device.screenshot(DEVICE, { signal });
      await save(step, { observation, state: structuredClone(state), pngBase64: shot.pngBase64 });
      await audit({ event: 'observe', step, phase: state.phase, round: state.round + 1, hash: observationHash(observation), truncated: observation.truncated });
      const { proposal: p, gate } = await models.decide({ scenario, state: structuredClone(state), observation, candidates: cs, history: history.slice(-8) }, shot.pngBase64);
      signal?.throwIfAborted();
      if (Date.now() - start >= maxMs) break;
      if (gate.choice === 'BLOCK' || p.action === 'blocked') { status = 'blocked'; failure = p.reason ?? 'Jev blocked'; break; }
      // 暂定演示阈值，未做置信度校准；低于阈值只重观察。
      if (gate.choice !== 'APPROVE' || gate.confidence < 0.75) {
        history.push({ step, rejected: p, gate }); await sleep(3000); continue;
      }
      validateAction(p, state, observation, cs);
      if (['round_done', 'artifact_seen'].includes(p.action) &&
          (!Array.isArray(p.evidence) || !p.evidence.length || !p.evidence.every(i => Number.isInteger(i) && observation.nodes[i] && (observation.nodes[i].name || observation.nodes[i].value)))) {
        throw new Error('Checkpoint requires actual observation evidence indices');
      }
      let result = { ok: true };
      if (['tap', 'type', 'submit', 'scroll'].includes(p.action)) {
        const fresh = publicObservation(await device.observe(DEVICE, { maxNodes: 500, maxDepth: 60, signal }));
        // 滚动也检查前台 App；目标动作还要精确核对元素与输入值。
        candidates(fresh);
        let node;
        if (p.target) node = resolveFresh(cs.find(n => n.id === p.target), fresh);
        validateAction(p, state, fresh, cs);
        signal?.throwIfAborted();
        if (p.action === 'type') {
          result = await device.tap(DEVICE, node.frame.x + node.frame.width / 2, node.frame.y + node.frame.height / 2);
          if (result.ok !== true) throw new Error('Cannot focus composer');
          // 聚焦会改变键盘布局；再验证当前只有预期的空字段，防止输到旧页面。
          const focused = publicObservation(await device.observe(DEVICE, { maxNodes: 500, maxDepth: 60, signal }));
          const fields = candidates(focused).filter(n => isField(n) && !n.value?.trim());
          if (fields.length !== 1 || fields[0].type !== node.type || fields[0].name !== node.name || fields[0].identifier !== node.identifier) throw new Error('Composer identity changed after focus');
          result = await device.type(DEVICE, state.prompt);
        } else if (p.action === 'scroll') result = await device.scroll(DEVICE, p.direction, 0.55);
        else {
          if (p.action === 'submit') {
            await audit({ event: 'draft_verified', expected: state.prompt, actual: fresh.nodes.find(n => isField(n) && n.value)?.value, normalization: 'observed English word spacing allowlist; filenames unchanged' });
            // 写前日志；异常不会重发，本轮直接停止。
            state.submitted = true;
            state.submittedHash = observationHash(fresh);
            await audit({ event: 'submit_intent', round: state.round + 1, prompt: state.prompt });
          }
          result = await device.tap(DEVICE, node.frame.x + node.frame.width / 2, node.frame.y + node.frame.height / 2);
          if (p.action === 'submit') state.phase = 'reply';
        }
        if (result.ok !== true) throw new Error(`Driver action unsupported: ${p.action}`);
      } else if (p.action === 'task_ready') state.phase = 'compose';
      else if (p.action === 'round_done') {
        if (observationHash(observation) === state.submittedHash) throw new Error('No new observation after submit');
        roundsCompleted++;
        evidence.push({ kind: 'reply', round: state.round + 1, step, nodes: p.evidence });
        if (roundsCompleted === scenario.turns.length) state.phase = 'cloud';
        else { state.round++; state.prompt = scenario.turns[state.round].prompt; state.submitted = false; state.phase = 'compose'; }
      } else if (p.action === 'artifact_seen') {
        if (!state.seen.includes(p.artifact)) state.seen.push(p.artifact);
        evidence.push({ kind: 'cloud_preview_claim', artifact: p.artifact, step, nodes: p.evidence, humanVerified: false });
      } else if (p.action === 'finish') { status = 'awaiting_visual_review'; break; }
      history.push({ step, action: p, result, phase: state.phase });
      await audit({ event: 'action', step, proposal: p, result, state: structuredClone(state), humanConfirmed: false });
      await sleep(p.action === 'wait' ? 5000 : 1800);
    }
  } catch (error) {
    status = signal?.aborted ? 'stopped' : 'failed';
    failure = error.message;
  } finally {
    if (device) {
      try { await device.dispose(); } catch { status = 'cleanup_failed'; failure = 'Owned driver cleanup failed'; }
    }
  }
  const summary = { runId: scenario.runId, status, failure, roundsCompleted, artifacts: state.seen,
    evidence, elapsedMs: Date.now() - start, humanVerified: false };
  await audit({ event: 'summary', ...summary });
  return summary;
}
//#endregion

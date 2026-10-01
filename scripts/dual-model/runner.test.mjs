import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from './runner.mjs';
import { makeScenario, BUNDLE } from './scenario.mjs';
const observed = () => ({ app: { bundleId: BUNDLE, verified: true }, screen: { width: 402, height: 874 }, nodes: [] });
test('live gate rejects before constructing device or model clients', async () => {
  assert.equal(typeof module.runExperiment, 'function');
  let touched = 0;
  await assert.rejects(module.runExperiment({ live: false, createDevice: () => { touched++; }, createModels: () => { touched++; } }), /live/);
  assert.equal(touched, 0);
});
test('bounded run disposes resources and rejects unapproved actions', async () => {
  assert.equal(typeof module.runExperiment, 'function');
  let disposed = 0, taps = 0;
  const d = { observe: async () => observed(), screenshot: async () => ({ pngBase64: 'fake' }), dispose: async () => { disposed++; }, tap: () => { taps++; } };
  const result = await module.runExperiment({ live: true, scenario: makeScenario('test'), maxSteps: 1, sleep: async () => {},
    createDevice: async () => d, createModels: () => ({ decide: async () => ({ proposal: { action: 'tap', target: 'unknown' }, gate: { choice: 'REOBSERVE', confidence: 0.99 } }) }),
    save: async () => {}, audit: async () => {}, signal: new AbortController().signal });
  assert.equal(taps, 0);
  assert.equal(disposed, 1);
  assert.equal(result.status, 'budget_exhausted');
});
test('ten replies and four cloud previews are sequenced and end awaiting human review', async () => {
  assert.equal(typeof module.runExperiment, 'function');
  const s = makeScenario('test');
  let draft = '', sent = 0, disposed = false, current, actions = [];
  const d = {
    observe: async () => ({ ...observed(), nodes: [
      { type: 'Button', name: '发送', frame: { x: 300, y: 300, width: 40, height: 40 } },
      { type: 'TextField', value: draft, frame: { x: 10, y: 200, width: 280, height: 40 } },
      { type: 'Text', name: `已完成${sent}`, frame: { x: 20, y: 100, width: 100, height: 30 } },
      ...(current?.phase === 'cloud' ? [{ type: 'Text', name: current.expectedArtifacts[current.seen.length] ?? 'done', frame: { x: 10, y: 150, width: 350, height: 30 } }] : []),
    ] }),
    screenshot: async () => ({ pngBase64: 'fake' }), tap: async (_, x) => { if (x > 300) { sent++; draft = ''; } return { ok: true }; },
    type: async (_, text) => { draft = text; return { ok: true }; }, dispose: async () => { disposed = true; },
  };
  const m = { decide: async ctx => {
    current = ctx.state;
    let p;
    if (current.phase === 'new_task') p = { action: 'task_ready' };
    else if (current.phase === 'compose') p = draft ? { action: 'submit', target: ctx.candidates.find(n => n.name === '发送').id } : { action: 'type', target: ctx.candidates.find(n => n.type === 'TextField').id };
    else if (current.phase === 'reply') p = { action: 'round_done', evidence: [2] };
    else if (current.seen.length === 4) p = { action: 'finish' };
    else {
      const artifact = current.expectedArtifacts[current.seen.length];
      p = ctx.observation.nodes.some(n => n.name === artifact) ? { action: 'artifact_seen', artifact, evidence: [3] } : { action: 'wait' };
    }
    actions.push(p.action);
    return { proposal: p, gate: { choice: 'APPROVE', confidence: 0.9 } };
  } };
  const result = await module.runExperiment({ live: true, scenario: s, maxSteps: 50, sleep: async () => {}, createDevice: async () => d, createModels: () => m, save: async () => {}, audit: async () => {}, signal: new AbortController().signal });
  assert.equal(sent, 10); assert.equal(result.roundsCompleted, 10); assert.equal(result.artifacts.length, 4);
  assert.equal(result.status, 'awaiting_visual_review'); assert.ok(disposed);
  assert.equal(actions.filter(a => a === 'type').length, 10);
});

test('resume verifies task identity before any model decision or device mutation', async () => {
  const scenario = makeScenario('resume-test');
  const state = { phase: 'reply', round: 0, prompt: scenario.turns[0].prompt, submitted: true, seen: [], expectedArtifacts: Object.values(scenario.artifacts) };
  let decisions = 0;
  const result = await module.runExperiment({ live: true, scenario, checkpoint: state, maxSteps: 1,
    createDevice: async () => ({ observe: async () => observed(), dispose: async () => {} }),
    createModels: () => ({ decide: async () => { decisions++; } }), audit: async () => {}, save: async () => {} });
  assert.equal(decisions, 0);
  assert.match(result.failure, /Resume task identity/);
});

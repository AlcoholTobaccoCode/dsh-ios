import { parseArgs } from 'node:util';
import { access, appendFile, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig, publicConfig } from './config.mjs';
import { BUNDLE, DEVICE, makeScenario } from './scenario.mjs';

//#region entrypoint
const root = fileURLToPath(new URL('../../', import.meta.url));
let redact = value => String(value);
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    resume: { type: 'string' }, env: { type: 'string' }, plan: { type: 'string' }, 'run-id': { type: 'string' }, live: { type: 'boolean', default: false },
  } });
  const command = positionals[0] ?? 'prepare';
  if (!['prepare', 'run'].includes(command) || positionals.length > 1) throw new Error('Usage: cli.mjs prepare|run --env PATH [--plan PATH] [--live]');
  if (command === 'run' && !values.live) throw new Error('Run requires --live AND explicit user instruction to start');
  if (command === 'prepare' && values.live) throw new Error('prepare does not accept --live');
  if (!values.env) throw new Error('External --env path is required');
  const c = await readConfig(resolve(values.env));
  redact = value => [c.ds.key, c.jev.key].reduce((s, key) => s.split(key).join('[REDACTED]'), String(value));
  const planPath = resolve(values.plan ?? join(root, 'artifacts/dual-model/prepared.json'));
  const driverPath = new URL('../../packages/ios-driver/lib/qa-driver.js', import.meta.url);
  const hostPath = new URL('../../packages/ios-driver/lib/sim-host.js', import.meta.url);
  await access(driverPath);
  await access(hostPath);
  if (command === 'prepare') {
    const runId = values['run-id'] ?? `picnic-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
    const manifest = { status: 'prepared_not_run', createdAt: new Date().toISOString(), mode: 'flash-proposal-jev-review',
      providers: publicConfig(c), device: { udid: DEVICE, bundleId: BUNDLE },
      limits: { maxSteps: 300, maxMinutes: 45 }, scenario: makeScenario(runId),
      liveApiVerified: false, liveDeviceVerified: false,
      acceptance: '10 replies plus four actual cloud previews; human visual review required',
    };
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, redact(JSON.stringify(manifest, null, 2)), { mode: 0o600 });
    console.log(JSON.stringify({ status: manifest.status, plan: planPath, providers: manifest.providers,
      runId, rounds: 10, expectedArtifacts: manifest.scenario.artifacts, networkCalls: 0, deviceActions: 0 }, null, 2));
  } else {
    const manifest = JSON.parse(await readFile(planPath, 'utf8'));
    if (manifest.status !== 'prepared_not_run' || JSON.stringify(manifest.providers) !== JSON.stringify(publicConfig(c))) throw new Error('Prepared provider configuration changed; prepare again');
    const scenario = makeScenario(manifest.scenario.runId);
    if (JSON.stringify(scenario) !== JSON.stringify(manifest.scenario)) throw new Error('Scenario changed; prepare again');
    const base = join(root, 'artifacts/dual-model');
    await mkdir(base, { recursive: true });
    const lockPath = join(base, `${DEVICE}.lock`);
    const lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(JSON.stringify({ pid: process.pid, runId: scenario.runId }));
    const abort = new AbortController();
    const stop = () => abort.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const deadline = setTimeout(stop, 45 * 60000);
    try {
      let checkpoint;
      if (values.resume) {
        const previous = resolve(values.resume);
        const priorManifest = JSON.parse(await readFile(join(previous, 'manifest.json'), 'utf8'));
        const priorResult = JSON.parse(await readFile(join(previous, 'result.json'), 'utf8'));
        if (priorManifest.scenario.runId !== scenario.runId || !(priorResult.status === 'stopped' || (priorResult.status === 'failed' && ['Exact draft not verified', 'Checkpoint requires actual observation evidence indices'].includes(priorResult.failure)))) throw new Error('Resume requires stopped matching run');
        const events = (await readFile(join(previous, 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
        const lastAction = events.findLastIndex(e => e.event === 'action');
        if (lastAction < 0 || events.slice(lastAction + 1).some(e => e.event === 'submit_intent')) throw new Error('Resume has uncertain submission');
        checkpoint = events[lastAction].state;
        manifest.resumedFrom = previous;
      }
      const out = join(base, values.resume ? `${scenario.runId}-continued-${Date.now()}` : scenario.runId);
      await mkdir(out, { mode: 0o700 }); // 不覆盖已有 run，避免重复发送。
      await writeFile(join(out, 'manifest.json'), redact(JSON.stringify(manifest, null, 2)), { mode: 0o600 });
      const audit = async event => {
        const item = { time: new Date().toISOString(), trigger: 'user-authorized-demo', ...event };
        await appendFile(join(out, 'events.jsonl'), redact(JSON.stringify(item)) + '\n', { mode: 0o600 });
        if (['decision', 'action', 'model_usage', 'summary'].includes(event.event)) console.log(redact(JSON.stringify(item)));
      };
      const save = async (step, data) => {
        const prefix = String(step).padStart(4, '0');
        await writeFile(join(out, `${prefix}.png`), Buffer.from(data.pngBase64, 'base64'), { mode: 0o600 });
        await writeFile(join(out, `${prefix}.json`), redact(JSON.stringify({ observation: data.observation, state: data.state }, null, 2)), { mode: 0o600 });
      };
      // 动态导入在 live 门之后；prepare 不构造驱动或模型客户端。
      const { runExperiment } = await import('./runner.mjs');
      const { createModels } = await import('./models.mjs');
      const result = await runExperiment({ live: true, scenario, checkpoint, signal: abort.signal, save, audit,
        createModels: () => createModels(c, { audit, signal: abort.signal }),
        createDevice: async () => {
          const { createIosQaBackend } = await import(driverPath);
          const { SimHostController } = await import(hostPath);
          const host = new SimHostController();
          const backend = createIosQaBackend({ sim: host });
          const timed = method => async (...args) => {
            const start = Date.now();
            try {
              const result = await backend[method](...args);
              await audit({ event: 'device_timing', operation: method, ms: Date.now() - start, ok: result?.ok !== false });
              return result;
            } catch (error) {
              await audit({ event: 'device_timing', operation: method, ms: Date.now() - start, ok: false });
              throw error;
            }
          };
          return {
            observe: timed('observe'), screenshot: timed('screenshot'),
            tap: timed('tap'), type: timed('type'), scroll: timed('scroll'),
            dispose: async () => { try { await backend.dispose(); } finally { await host.dispose(); } },
          };
        },
      });
      await writeFile(join(out, 'result.json'), redact(JSON.stringify(result, null, 2)), { mode: 0o600 });
      console.log(JSON.stringify({ evidenceDirectory: out, status: result.status }));
      if (result.status !== 'awaiting_visual_review') process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      await lock.close(); await rm(lockPath);
    }
  }
} catch (error) { console.error(redact(error.message)); process.exitCode = 1; }
//#endregion

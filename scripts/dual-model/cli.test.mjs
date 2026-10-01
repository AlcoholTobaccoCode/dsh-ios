import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('prepare and unarmed run cannot call fetch or launch child processes', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dual-prepare-test-'));
  try {
    const env = join(tmp, '.env'), plan = join(tmp, 'prepared.json'), guard = join(tmp, 'guard.mjs');
    await writeFile(env, 'DEEPSEEK_API_KEY=do-not-print-ds\nDEEPSEEK_BASE_URL=https://api.deepseek.com/v1\nDEEPSEEK_MODEL=deepseek-flash\nJEV_API_KEY=do-not-print-jev\nJEV_BASE_URL=https://api.typesafe.ai/\n');
    await writeFile(guard, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')}; for(const name of ['spawn','spawnSync','exec','execFile','execFileSync','execSync','fork'])cp[name]=()=>{throw Error('DEVICE_FORBIDDEN')};syncBuiltinESMExports();`);
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
    const invoke = args => spawnSync(process.execPath, ['--import', guard, cli, ...args, '--env', env, '--plan', plan], { encoding: 'utf8' });
    const prepared = invoke(['prepare', '--run-id', 'offline-demo']);
    assert.equal(prepared.status, 0, prepared.stderr);
    const manifest = JSON.parse(await readFile(plan, 'utf8'));
    assert.equal(manifest.status, 'prepared_not_run');
    assert.equal(manifest.scenario.turns.length, 10);
    assert.ok(!JSON.stringify(manifest).includes('do-not-print'));
    assert.ok(!prepared.stdout.includes('do-not-print'));
    const unarmed = invoke(['run']);
    assert.notEqual(unarmed.status, 0);
    assert.match(unarmed.stderr, /--live/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

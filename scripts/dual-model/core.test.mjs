import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from './config.mjs';
import * as policy from './policy.mjs';
import * as scenario from './scenario.mjs';

const env = { DEEPSEEK_API_KEY: 'secret-ds', DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1', DEEPSEEK_MODEL: 'deepseek-flash', JEV_API_KEY: 'secret-jev', JEV_BASE_URL: 'https://api.typesafe.ai/', JEV_MODEL: 'jev-latest' };
const obs = { app: { verified: true, bundleId: 'ai.ottermind.mobile.test' }, screen: { width: 402, height: 874 }, nodes: [
  { type: 'Button', name: '发送', enabled: true, frame: { x: 300, y: 300, width: 40, height: 40 } },
  { type: 'TextField', value: 'Hello', enabled: true, frame: { x: 10, y: 200, width: 280, height: 40 } },
  { type: 'Button', name: '删除', enabled: true, frame: { x: 20, y: 90, width: 40, height: 40 } },
  { type: 'Button', name: '屏外', enabled: true, frame: { x: 20, y: 900, width: 40, height: 40 } },
] };
test('configuration normalizes endpoints and never serializes keys', () => {
  assert.equal(typeof config.readConfigValues, 'function');
  const c = config.readConfigValues(env);
  assert.equal(c.ds.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(c.jev.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(c.jev.model, 'jev-1.13.0');
  assert.ok(!JSON.stringify(config.publicConfig(c)).includes('secret'));
  assert.throws(() => config.readConfigValues({ ...env, JEV_API_KEY: '' }), /JEV_API_KEY/);
  assert.throws(() => config.readConfigValues({ ...env, JEV_BASE_URL: 'https://user:pass@example.com/?key=x' }), /endpoint/);
});
test('ten linked turns have ASCII input and unique artifact names', () => {
  assert.equal(typeof scenario.makeScenario, 'function');
  const s = scenario.makeScenario('demo-123');
  assert.equal(s.turns.length, 10);
  assert.ok(s.turns.every(t => /^[\x20-\x7e]+$/.test(t.prompt)));
  assert.ok(s.turns[2].prompt.includes(s.artifacts.imageDraft));
  assert.ok(s.turns[8].prompt.includes(s.artifacts.documentFinal));
});
test('candidate policy excludes dangerous/offscreen nodes, rejects stale geometry and app', () => {
  assert.equal(typeof policy.candidates, 'function');
  const cs = policy.candidates(obs);
  assert.equal(cs.length, 2);
  assert.equal(policy.resolveFresh(cs[0], obs).name, '发送');
  const moved = structuredClone(obs); moved.nodes[0].frame.y += 30;
  assert.throws(() => policy.resolveFresh(cs[0], moved), /stale/);
  assert.throws(() => policy.candidates({ ...obs, app: { verified: false } }), /foreground/);
});
test('send requires exact current draft and stages cannot finish before sending', () => {
  assert.equal(typeof policy.validateAction, 'function');
  const cs = policy.candidates(obs);
  const state = { phase: 'compose', prompt: 'Hello', round: 0, submitted: false };
  assert.doesNotThrow(() => policy.validateAction({ action: 'submit', target: cs[0].id }, state, obs, cs));
  assert.throws(() => policy.validateAction({ action: 'submit', target: cs[0].id }, { ...state, prompt: 'Different' }, obs, cs), /draft/);
  assert.throws(() => policy.validateAction({ action: 'tap', target: cs[0].id }, state, obs, cs), /submit/);
  assert.throws(() => policy.validateAction({ action: 'round_done' }, state, obs, cs), /phase/);
  assert.throws(() => policy.validateAction({ action: 'type', target: cs[1].id }, state, obs, cs), /empty/);
});
test('completion cannot accept an unsent draft or unrelated cloud file', () => {
  const cs = policy.candidates(obs);
  assert.throws(() => policy.validateAction({ action: 'round_done' }, { phase: 'reply', submitted: true, prompt: 'Hello' }, obs, cs), /draft/);
  assert.throws(() => policy.validateAction({ action: 'artifact_seen', artifact: 'run-final.png' }, { phase: 'cloud', expectedArtifacts: ['run-final.png'], seen: [] }, obs, cs), /filename/);
});
test('Ottermind AX TextArea and queue-send label are supported explicitly', () => {
  const realShape = structuredClone(obs);
  realShape.nodes[1].type = 'TextArea';
  realShape.nodes[1].name = '输入对话内容';
  realShape.nodes[0].name = '排队发送消息';
  assert.ok(policy.isField(realShape.nodes[1]));
  assert.ok(policy.isSend(realShape.nodes[0]));
  const cs = policy.candidates(realShape);
  assert.doesNotThrow(() => policy.validateAction({ action: 'submit', target: cs[0].id }, { phase: 'compose', prompt: 'Hello', submitted: false }, realShape, cs));
});

test('only the observed iOS base name correction is permitted; filenames remain exact', () => {
  const expected = scenario.makeScenario('test').turns[2].prompt;
  const corrected = expected.replace('same basename', 'same base name');
  assert.equal(policy.matchesDraft(corrected, expected), true);
  assert.equal(policy.matchesDraft(corrected.replace('test-poster-draft', 'other-poster-draft'), expected), false);
  assert.equal(policy.matchesDraft(corrected + ' Extra', expected), false);
  const last = scenario.makeScenario('test').turns[9].prompt;
  assert.equal(policy.matchesDraft(last.replace('actual filenames and file links', 'actual file names and file links'), last), true);
});

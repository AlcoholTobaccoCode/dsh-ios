import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from './models.mjs';
const config = { ds: { url: 'https://ds.invalid/v1/chat/completions', key: 'secret-ds', model: 'deepseek-flash' }, jev: { url: 'https://jev.invalid/v1/systemone', key: 'secret-jev', model: 'jev-1.13.0' } };
test('model adapter uses Flash proposal and independent Jev gate with source evidence', async () => {
  assert.equal(typeof module.createModels, 'function');
  const calls = [], logs = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json(calls.length === 1 ? { model: 'deepseek-flash', choices: [{ message: { content: '{"action":"wait","reason":"loading"}' } }], usage: { total_tokens: 5 } } :
      { model: 'jev-1.13.0', answers: { gate: { type: 'choice', choice: 'APPROVE', confidence: 0.9, probabilities: { APPROVE: 0.95, REOBSERVE: 0.03, BLOCK: 0.02 } } }, usage: { input_tokens: 4 } });
  };
  const models = module.createModels(config, { fetchImpl, audit: event => logs.push(event) });
  assert.equal(calls.length, 0);
  const result = await models.decide({ observation: { nodes: [{ name: '原始证据' }] }, state: { phase: 'reply' } }, 'base64');
  assert.equal(result.proposal.action, 'wait');
  assert.equal(result.gate.choice, 'APPROVE');
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].body.messages[1].content[0].text).observation.nodes[0].index, 0);
  assert.ok(JSON.stringify(calls[1].body.state).includes('原始证据'));
  assert.ok(!JSON.stringify(logs).includes('secret'));
  assert.equal(calls[1].body.state.state, undefined);
  assert.match(calls[1].body.questions.gate.instructions, /waiting briefly/);
  assert.equal(calls[1].body.state.recentActions, undefined);
});
test('HTTP error stops without retrying or leaking body', async () => {
  assert.equal(typeof module.createModels, 'function');
  let count = 0;
  const m = module.createModels(config, { fetchImpl: async () => { count++; return new Response('secret-ds', { status: 401 }); } });
  await assert.rejects(m.decide({}, 'img'), e => e.message.includes('401') && !e.message.includes('secret'));
  assert.equal(count, 1);
});
test('invalid Jev choice is rejected', async () => {
  assert.equal(typeof module.createModels, 'function');
  let count = 0;
  const m = module.createModels(config, { fetchImpl: async () => Response.json(++count === 1 ? { choices: [{ message: { content: '{"action":"wait"}' } }] } :
    { answers: { gate: { choice: 'CLICK_ANYWHERE', confidence: 1 } } }) });
  await assert.rejects(m.decide({}, 'img'), /Invalid Jev/);
});

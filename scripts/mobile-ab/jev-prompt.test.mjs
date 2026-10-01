import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJevRequest, combineJevAnswers } from './jev-prompt.mjs';
test('judge gets resolved observations and receipts, never planner rationale as evidence',()=>{
 const r=buildJevRequest({goal:'Find report',nodes:[{index:1,type:'Button',name:'关闭预览',frame:{}}],candidates:[]},{action:'checkpoint',reason:'pretend success',evidence:[1]},{stage:'preview',trace:[{action:'tap',label:'打开 report'}]});
 assert.equal(JSON.stringify(r).includes('pretend success'),false);
 assert.equal(r.state.current_screen[0].english,'Close preview');
 assert.equal(r.state.executed_actions[0].label,'打开 report');
 assert.ok(Object.keys(r.questions).length>=2);
});
test('one contradicted or uncertain atomic answer prevents approval; invalid output fails closed',()=>{
 const req={questions:{a:{criteria:{YES:'x',NO:'y'}},b:{criteria:{YES:'x',NO:'y'}}},expected:{a:'YES',b:'YES'}};
 const a={choice:'YES',confidence:.99};
 assert.equal(combineJevAnswers(req,{a,b:{choice:'NO',confidence:.99}}).choice,'REOBSERVE');
 assert.equal(combineJevAnswers(req,{a,b:{...a,confidence:.4}}).confidence,.4);
 assert.throws(()=>combineJevAnswers(req,{a}),/Invalid/);
 assert.equal(combineJevAnswers(req,{a,b:a}).choice,'APPROVE');
});

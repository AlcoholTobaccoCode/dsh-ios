import test from 'node:test';
import assert from 'node:assert/strict';
import { createModels, validateAction, progressGuard } from './core.mjs';
const config={ds:{url:'https://ds.invalid',key:'private',model:'flash'},jev:{url:'https://jev.invalid',key:'private',model:'jev'}};
test('both modes send identical DeepSeek requests; single mode never calls Jev',async()=>{
 const bodies=[];
 for(const mode of ['deepseek','dual']){
  const calls=[];
  const m=createModels(config,{mode,fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json(url.includes('ds.')?{choices:[{message:{content:'{"action":"wait","reason":"loading"}'}}]}:{answers:{relevance:{choice:'RELEVANT',confidence:.99},scope:{choice:'IN_SCOPE',confidence:.99}}});}});
  await m.decide({goal:'open cloud',nodes:[],candidates:[]},'png');
  assert.equal(calls.length,mode==='dual'?2:1);bodies.push(calls[0].body);
 }assert.deepEqual(bodies[0],bodies[1]);
});
const field={id:'a',type:'TextField',name:'项目名称',value:'项目名称'};
test('input only fixed stage text into verified empty fields',()=>{
 assert.doesNotThrow(()=>validateAction({action:'type',target:'a'},{input:'AB001'},[field]));
 assert.throws(()=>validateAction({action:'type',target:'a'},{input:'AB001'},[{...field,value:'existing'}]),/empty/);
 assert.throws(()=>validateAction({action:'tap',target:''},{},[field]),/target/);
});
test('delete requires current test ownership and delete stage',()=>{
 const cs=[{id:'d',type:'Button',name:'删除项目'}];
 assert.throws(()=>validateAction({action:'tap',target:'d'},{},cs),/deletion/);
 assert.throws(()=>validateAction({action:'tap',target:'d'},{allowDelete:true,owned:true,identityVisible:false},cs),/deletion/);
 assert.doesNotThrow(()=>validateAction({action:'tap',target:'d'},{allowDelete:true,owned:true,identityVisible:true},cs));
});
test('three repeated invalid/no-op attempts stop, genuine waits separately bounded',()=>{
 const g=progressGuard();assert.equal(g('x','tap'),false);assert.equal(g('x','tap'),false);assert.equal(g('x','tap'),true);
 const w=progressGuard();for(let i=0;i<11;i++)assert.equal(w('x','wait'),false);assert.equal(w('x','wait'),true);
});
test('native cloud search exposes exact empty placeholder without a name',()=>{
 assert.doesNotThrow(()=>validateAction({action:'type',target:'s'},{input:'ZZABNOFILE92841'},[{id:'s',type:'TextField',value:'搜索云盘...'}]));
 assert.throws(()=>validateAction({action:'type',target:'s'},{input:'ZZABNOFILE92841'},[{id:'s',type:'TextField',value:'existing query'}]),/empty/);
});
test('common adapter accepts unambiguous action alias and audits original',async()=>{
 const m=createModels(config,{mode:'deepseek',fetchImpl:async()=>Response.json({choices:[{message:{content:'{"type":"wait","reason":"loading"}'}}]})});
 assert.equal((await m.decide({nodes:[],candidates:[]},'png')).proposal.action,'wait');
});
test('saving project requires exact field contents, not model claims',()=>{
 const cs=[{id:'save',type:'Button',name:'保存'},{id:'f',type:'TextField',name:'项目名称',value:'AB100'}];
 assert.throws(()=>validateAction({action:'tap',target:'save'},{id:'create',input:'AB1001'},cs),/Exact/);
 assert.doesNotThrow(()=>validateAction({action:'tap',target:'save'},{id:'create',input:'AB100'},cs));
});
test('two rejected proposals do not stop the next valid action before its resulting observation',()=>{
 const g=progressGuard();assert.equal(g('same','rejected'),false);assert.equal(g('same','rejected'),false);assert.equal(g('same','type'),false);
});

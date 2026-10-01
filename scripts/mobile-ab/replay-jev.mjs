import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readConfig} from '../dual-model/config.mjs';
import {scenario} from './scenarios.mjs';
import {visible,candidates} from './core.mjs';
import {buildJevRequest,combineJevAnswers} from './jev-prompt.mjs';
const config=await readConfig('/Users/duqings/code_project/jev-调研/jev/.env');
const cases=[['S2602',8,'search','found','positive'],['F2601',6,'favorite','favorite','positive'],['2601',11,'project','update','positive'],['S2601',10,'search','preview','positive'],['S2602',8,'search','found','missing-file'],['F2601',6,'favorite','favorite','recent-tab'],['2601',11,'project','update','unsaved'],['2602',43,'project','delete','positive']];
const results=[];
for(const [run,step,kind,stage,variant] of cases){
 const events=(await readFile(`artifacts/mobile-ab/${run}/events.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
 const o=JSON.parse(await readFile(`artifacts/mobile-ab/${run}/${step}.json`)).observation;
 let nodes=visible(o);const s=scenario(kind,run).stages.find(x=>x.id===stage);
 let trace=events.filter(e=>e.event==='action'&&e.step<step&&e.proposal.action!=='checkpoint').map(e=>({step:e.step,stage:e.stage,action:e.proposal.action,label:events.find(t=>t.step===e.step&&t.event==='tap_intent')?.target.name,input:events.find(t=>t.step===e.step&&t.event==='write_intent')?.input}));
 if(variant==='missing-file')nodes=nodes.filter(n=>!n.name?.includes('picnic-restarted-e-article-final'));
 if(variant==='recent-tab')trace=trace.map(t=>t.label==='收藏'?{...t,label:'最近'}:t);
 if(variant==='unsaved')trace=trace.filter(t=>t.stage!=='update'||t.action==='type');
 const req=buildJevRequest({goal:s.goal,input:s.input,nodes,candidates:candidates(o)},{action:'checkpoint'},{stage,trace});
 const start=Date.now();const r=await fetch(config.jev.url,{method:'POST',headers:{Authorization:`Bearer ${config.jev.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.jev.model,state:req.state,questions:req.questions}),signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);
 const data=await r.json(),gate=combineJevAnswers(req,data.answers);const local=s.check(nodes);
 const accepted=gate.choice==='APPROVE'&&gate.confidence>=.75&&local;
 const expected=variant==='positive'&&stage!=='delete';
 const row={run,step,kind,stage,variant,expected,accepted,local,gate,ms:Date.now()-start,usage:data.usage,request:req};results.push(row);console.log(JSON.stringify({...row,request:undefined}));
}
await mkdir('artifacts/mobile-ab/jev-v2',{recursive:true});await writeFile('artifacts/mobile-ab/jev-v2/replay.json',JSON.stringify(results,null,2));

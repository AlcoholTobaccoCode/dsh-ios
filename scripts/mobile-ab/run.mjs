import { mkdir,writeFile,appendFile,readFile,open,rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createIosQaBackend } from '../../packages/ios-driver/lib/qa-driver.js';
import { SimHostController } from '../../packages/ios-driver/lib/sim-host.js';
import { readConfig,publicConfig } from '../dual-model/config.mjs';
import { DEVICE } from '../dual-model/scenario.mjs';
import { createModels,validateAction,candidates,visible,hash,resolveFresh,empty,field,progressGuard } from './core.mjs';
import { scenario } from './scenarios.mjs';
//#region 逐次运行与证据
const [kind,mode,runId,live]=process.argv.slice(2);
if(live!=='--live'||!/^[A-Za-z0-9-]+$/.test(runId??'')||!['dual','deepseek'].includes(mode))throw new Error('Usage: run.mjs project|search|favorite dual|deepseek RUNID --live');
const sc=scenario(kind,runId),out=`artifacts/mobile-ab/${runId}`;
await mkdir('artifacts/mobile-ab',{recursive:true});
const lock=await open('artifacts/mobile-ab/device.lock','wx');
const config=await readConfig('/Users/duqings/code_project/jev-调研/jev/.env');
await mkdir(out);
const files=['core.mjs','scenarios.mjs','run.mjs','jev-prompt.mjs'];
const sourceHash=createHash('sha256');for(const f of files)sourceHash.update(await readFile(`scripts/mobile-ab/${f}`));
await writeFile(`${out}/manifest.json`,JSON.stringify({createdAt:new Date(),kind,mode,runId,providers:publicConfig(config),sourceHash:sourceHash.digest('hex'),scenario:sc,limits:{steps:55,ms:420000,gateThreshold:.75},manualSetupExcluded:true,independentReviewRequired:true},null,2));
const audit=async e=>{const line=JSON.stringify({at:new Date().toISOString(),trigger:'user-authorized-ab',runId,...e});await appendFile(`${out}/events.jsonl`,line+'\n');if(['action','rejected','checkpoint','summary'].includes(e.event))console.log(line);};
const host=new SimHostController(),device=createIosQaBackend({sim:host}),models=createModels(config,{mode,audit});
const started=Date.now(),history=[],judgeTrace=[],proof=[],guard=progressGuard();let stage=0,owned=false,status='budget_exhausted',failure,step=0;let interrupted=false;
process.on('SIGINT',()=>{interrupted=true;});
const observe=()=>device.observe(DEVICE,{maxNodes:1800,maxDepth:65,signal:AbortSignal.timeout(25000)});
try{
 for(step=1;step<=55&&Date.now()-started<420000&&!interrupted;step++){
  const o=await observe();if(o.truncated)throw new Error('AX truncated; refusing incomplete evidence');
  const nodes=visible(o),cs=candidates(o),s=sc.stages[stage];
  const shot=await device.screenshot(DEVICE,{signal:AbortSignal.timeout(20000)});
  await writeFile(`${out}/${step}.json`,JSON.stringify({observation:o,stage:s.id},null,2));await writeFile(`${out}/${step}.png`,Buffer.from(shot.pngBase64,'base64'));
  await audit({event:'observe',step,stage:s.id,hash:hash(o)});
  const {proposal:p,gate}=await models.decide({goal:s.goal,input:s.input,nodes,candidates:cs,history:history.slice(-8),completed:proof.map(p=>p.id)},shot.pngBase64,{stage:s.id,trace:judgeTrace});
  if(interrupted)break;
  if(Date.now()-started>=420000)break;
  if(p.action==='blocked'||gate.choice==='BLOCK'){status='blocked';failure=p.reason;break;}
  if(gate.choice!=='APPROVE'||gate.confidence<.75){history.push({step,proposal:p,rejected:gate});await audit({event:'rejected',step,stage:s.id,proposal:p,gate});if(guard(`${stage}:${hash(o)}`, 'rejected')){status='no_progress';break;}await sleep(1700);continue;}
  const state={...s,owned,identityVisible:nodes.some(n=>(n.name??'').includes(sc.name??'\u0000')||(n.value??'').includes(sc.name??'\u0000'))};
  try{validateAction(p,state,cs);}catch(e){history.push({step,proposal:p,error:e.message});await audit({event:'rejected',step,stage:s.id,proposal:p,error:e.message});if(guard(`${stage}:${hash(o)}`, 'rejected')){status='no_progress';failure=e.message;break;}continue;}
  if(p.action==='checkpoint'){
   if(!Array.isArray(p.evidence)||!p.evidence.length||!p.evidence.every(i=>nodes.some(n=>n.index===i))||!s.check(nodes)){
    history.push({step,proposal:p,error:'Checkpoint lacks required current screen evidence'});await audit({event:'rejected',step,stage:s.id,proposal:p,error:'local checkpoint oracle failed'});if(guard(`${stage}:${hash(o)}`, 'rejected')){status='no_progress';break;}continue;
   }
   proof.push({id:s.id,step,claimed:true,humanVerified:false});if(s.id==='create')owned=true;
   await audit({event:'checkpoint',step,stage:s.id,proposal:p});stage++;if(stage===sc.stages.length){status='awaiting_independent_review';break;}
  }else if(['tap','type','scroll'].includes(p.action)){
   const fresh=await observe();const fns=visible(fresh);if(fresh.truncated)throw new Error('Fresh AX truncated');
   validateAction(p,{...state,identityVisible:fns.some(n=>(n.name??'').includes(sc.name??'\u0000')||(n.value??'').includes(sc.name??'\u0000'))},cs.map(c=>{const f=fns.find(n=>n.index===c.index);return f?{...f,id:c.id}:c}));
   let result;
   if(p.action==='scroll')result=await device.scroll(DEVICE,p.direction,.5);
   else{
    const target=cs.find(c=>c.id===p.target),n=resolveFresh(target,fresh);
    if(p.action==='type'){
     result=await device.tap(DEVICE,n.frame.x+n.frame.width/2,n.frame.y+n.frame.height/2);if(!result.ok)throw new Error('Focus failed');await sleep(500);
     const focused=await observe();const fields=visible(focused).filter(x=>field(x)&&x.name===n.name&&empty(x));if(fields.length!==1)throw new Error('Input identity changed after focus');
     await audit({event:'write_intent',step,stage:s.id,input:s.input,target:n.name});result=await device.type(DEVICE,s.input);
    }else{await audit({event:'tap_intent',step,stage:s.id,target:n});result=await device.tap(DEVICE,n.frame.x+n.frame.width/2,n.frame.y+n.frame.height/2);}
   }
   if(!result.ok)throw new Error(`Driver action failed: ${p.action}`);
   if(guard(`${stage}:${hash(o)}`,p.action)){status='no_progress';break;}
  }else if(p.action==='wait'&&guard(`${stage}:${hash(o)}`,p.action)){status='no_progress';break;}
  judgeTrace.push({step,stage:s.id,action:p.action,label:cs.find(c=>c.id===p.target)?.name,input:p.action==='type'?s.input:undefined});
  history.push({step,proposal:p,result:'executed'});await audit({event:'action',step,stage:s.id,proposal:p});await sleep(p.action==='wait'?3500:1500);
 }
}catch(e){status='failed';failure=e.message;}
finally{
 try{const o=await observe();const sh=await device.screenshot(DEVICE);await writeFile(`${out}/final.json`,JSON.stringify(o,null,2));await writeFile(`${out}/final.png`,Buffer.from(sh.pngBase64,'base64'));}catch{}
 await device.dispose();await host.dispose();await lock.close();await rm('artifacts/mobile-ab/device.lock');
}
const result={kind,mode,runId,status:interrupted?'stopped':status,failure,steps:Math.min(step,55),elapsedMs:Date.now()-started,proof,completedStages:stage,totalStages:sc.stages.length,manualInterventions:0,humanVerified:false};
await audit({event:'summary',...result});await writeFile(`${out}/result.json`,JSON.stringify(result,null,2));
//#endregion

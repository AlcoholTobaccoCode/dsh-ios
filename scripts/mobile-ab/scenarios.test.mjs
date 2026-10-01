import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario,DOC } from './scenarios.mjs';
test('Markdown preview uses readable paragraphs and section heading, not arbitrary 100-character single node',()=>{
 const check=scenario('search','test').stages[2].check;
 const preview=[{name:'关闭预览',type:'Button'},{name:DOC,type:'Heading'},{name:'构想',type:'Heading'},{name:'周六下午两点到五点，城市公园的树荫下。不追节目，只追松弛。',type:'GenericElement'}];
 assert.equal(check(preview),true);
 assert.equal(check([{name:`打开 ${DOC}`,type:'Button'}]),false);
 assert.equal(check(preview.filter(n=>n.type!=='GenericElement')),false);
});

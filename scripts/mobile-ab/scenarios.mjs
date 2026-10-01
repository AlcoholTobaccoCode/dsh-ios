//#region 固定业务用例：只给子目标，不提供坐标或点选脚本
export const IMAGE='picnic-restarted-e-poster-final.png.png';
export const DOC='picnic-restarted-e-article-final.md.md';
export function scenario(kind,runId){
 const name=`AB${runId}`;
 const description='Regression description saved';
 if(kind==='project')return{name,stages:[
  {id:'create',goal:`Create an EMPTY project named exactly ${name}. Leave description empty. Save it and OPEN its actual project detail page. Do not create any tasks/files. checkpoint only when name is displayed as project title, form dismissed.`,input:name,check:n=>n.some(x=>x.type==='Heading'&&x.name===name)&&!n.some(x=>x.type==='TextField'&&x.name==='项目名称')},
  {id:'update',goal:`Edit ONLY project ${name}: use its rename/edit details form and fill the previously EMPTY description with exactly "${description}". Keep name unchanged. Save, close form, then REOPEN edit form to prove description persisted. checkpoint only when reopened description field holds exact text.`,input:description,check:n=>n.some(x=>x.value===description)&&n.some(x=>x.value===name)},
  {id:'delete',goal:`Dismiss edit form via Cancel without further changes. Delete ONLY the empty test project ${name} you just created. Confirm deletion only when named project and empty scope are shown. Return to project list and verify that ${name} is absent. checkpoint on project list after deletion.`,allowDelete:true,check:n=>n.some(x=>x.name==='搜索项目')&&!n.some(x=>(x.name??'').includes(name)||(x.value??'').includes(name))}
 ]};
 if(kind==='search')return{stages:[
  {id:'empty',goal:'From cloud drive, search exactly ZZABNOFILE92841. Verify an explicit no-results/empty state for this query. Do not switch to global task search.',input:'ZZABNOFILE92841',check:n=>n.some(x=>x.value==='ZZABNOFILE92841')&&n.some(x=>/没有|暂无|未找到|无结果/.test(x.name??''))},
  {id:'found',goal:`Clear or cancel the old cloud search, then search exactly picnic-restarted-e-article-final. Find file ${DOC} in cloud search RESULTS. checkpoint when its file row is shown for the new query.`,input:'picnic-restarted-e-article-final',check:n=>n.some(x=>(x.name??'').includes(`打开 ${DOC}`))},
  {id:'preview',goal:`Open ${DOC} from cloud search, verify actual readable Markdown body, not just file name. checkpoint only on the file preview with actual article paragraphs.`,check:n=>n.some(x=>x.name==='关闭预览')&&n.some(x=>(x.name??'').includes(DOC))&&n.some(x=>x.type==='Heading'&&x.name==='构想')&&n.some(x=>x.type==='GenericElement'&&(x.name??'').length>20)}
 ]};
 if(kind==='favorite')return{stages:[
  {id:'image',goal:`From cloud Recent, OPEN ${IMAGE} and inspect actual image rendering. checkpoint only in actual preview, initially not favorited (添加到收藏).`,check:n=>n.some(x=>x.name==='关闭预览')&&n.some(x=>(x.name??'').includes(IMAGE))&&n.some(x=>x.name==='添加到收藏')},
  {id:'favorite',goal:`Add ONLY ${IMAGE} to favorites. Close preview, open cloud 收藏 tab and verify this exact image appears in favorite results. checkpoint on favorites list.`,check:n=>n.some(x=>(x.name??'')===`打开 ${IMAGE}`)&&!n.some(x=>x.name==='关闭预览')},
  {id:'unfavorite',goal:`Open ${IMAGE} FROM the 收藏 list, remove it from favorites, close preview, and verify it disappears from the 收藏 list. Do not delete it. checkpoint on favorites list with the image gone.`,check:n=>!n.some(x=>(x.name??'').includes(IMAGE))&&!n.some(x=>x.name==='关闭预览')&&n.some(x=>x.name==='收藏')}
 ]};
 throw new Error('Unknown scenario');
}
//#endregion

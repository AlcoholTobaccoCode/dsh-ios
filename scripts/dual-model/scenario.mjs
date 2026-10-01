export const DEVICE = '063DC27F-4CD5-4465-95B7-71C1C9B1BE27';
export const BUNDLE = 'ai.ottermind.mobile.test';

export function makeScenario(runId) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(runId)) throw new Error('Invalid runId');
  const a = {
    imageDraft: `${runId}-poster-draft.png`, imageFinal: `${runId}-poster-final.png`,
    documentDraft: `${runId}-article-draft.md`, documentFinal: `${runId}-article-final.md`,
  };
  const rows = [
    ['确定主题', `Start a new project called ${runId}: a relaxing Saturday picnic in a city park, for friends, from 2 pm to 5 pm. Reply in Simplified Chinese throughout this conversation. First suggest a theme and a simple plan in under 200 Chinese characters. Do not generate files yet.`],
    ['拟定文章结构', 'Use the theme Weekend Slow Living. Propose a Chinese article outline with sections for the idea, schedule, things to bring and rain backup. No files yet.'],
    ['生成第一张图', `Generate one actual landscape illustration of friends having a picnic under trees, warm afternoon light, gentle green and cream colors, without text or logos. Save the generated image to cloud drive as ${a.imageDraft}. If PNG export is unavailable keep the same basename with the actual image extension. I need an actual image file, not a description.`],
    ['撰写配图文案', 'Write three alternative Chinese headlines and a short caption for that picnic image. Keep the tone relaxed and practical. Reply in chat only.'],
    ['保存文章初稿', `Write a Chinese article of about 500 Chinese characters based on our outline and chosen theme. Include the 2 pm to 5 pm schedule and a rain backup. Create an actual UTF-8 Markdown file named ${a.documentDraft} and save it to cloud drive.`],
    ['提出修改要求', 'Revise the plan to be family-friendly: add a low-effort activity for children, remind people to bring drinking water, and include a leave-no-trace cleanup. Summarize these changes in chat only.'],
    ['生成最终配图', `Generate a NEW landscape picnic illustration reflecting the family-friendly changes, with adults and children, a picnic blanket and reusable water bottles, warm green and cream colors, no text or logos. Save the actual image to cloud drive as ${a.imageFinal}. If needed use the actual image extension with the same basename. Keep the first image as well.`],
    ['生成发布短文案', 'Write a Chinese social post under 120 Chinese characters based on the revised family picnic plan, plus three relevant hashtags. Reply in chat only.'],
    ['保存最终文章', `Create a final Chinese Markdown article of about 600 Chinese characters incorporating the family-friendly changes, 2 pm to 5 pm schedule, water, cleanup, rain backup, and the social caption. Include a reference to ${a.imageFinal}. Save an actual file named ${a.documentFinal} to cloud drive; preserve the draft.`],
    ['核对产物清单', `List the four image/document artifacts created in this conversation, with their actual filenames and file links. Expected basenames are ${Object.values(a).map(x => x.replace(/\.[^.]+$/, '')).join(', ')}. Report missing files honestly. Do not create more files.`],
  ];
  return { runId, topic: '周末公园野餐：生图与中文文章', turns: rows.map(([label, prompt], i) => ({ round: i + 1, label, prompt })), artifacts: a };
}

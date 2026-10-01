import { createHash } from 'node:crypto';
import { BUNDLE } from './scenario.mjs';

//#region observations
const destructive = /删除|清空|退出登录|注销|购买|支付|订阅|delete|erase|sign out|purchase|subscribe/i;
const send = /^(发送|提交|发送消息|排队发送消息|send|submit)$/i;
export const isField = n => /TextField|TextView|TextInput|TextArea/i.test(n.type) && !n.secure;
export const isSend = n => send.test(n.name ?? '') || /(?:^|[._-])(send|submit)(?:$|[._-])/i.test(n.identifier ?? '');
export const observationHash = o => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
export function assertApp(o) {
  if (!o.app?.verified || o.app.bundleId !== BUNDLE) throw new Error('Unverified or wrong foreground app');
}
function eligible(n, screen) {
  const f = n.frame;
  return n.enabled !== false && n.visible !== false && !n.secure &&
    f && [f.x, f.y, f.width, f.height].every(Number.isFinite) && f.width > 0 && f.height > 0 &&
    f.x >= 0 && f.y >= 0 && f.x + f.width <= screen.width + 1 && f.y + f.height <= screen.height + 1;
}
export function candidates(o) {
  assertApp(o);
  const hash = observationHash(o);
  return o.nodes.flatMap((n, i) => eligible(n, o.screen) && !destructive.test(`${n.name ?? ''} ${n.identifier ?? ''}`) &&
    (/Button|Link|Cell|Image/i.test(n.type) || isField(n) || n.name)
    ? [{ ...n, id: `${hash}:${i}` }] : []).slice(0, 240);
}
export function resolveFresh(candidate, fresh) {
  assertApp(fresh);
  const matches = fresh.nodes.filter(n => eligible(n, fresh.screen) &&
    n.type === candidate.type && n.identifier === candidate.identifier && n.name === candidate.name &&
    n.value === candidate.value && Object.keys(candidate.frame).every(k => Math.abs(n.frame[k] - candidate.frame[k]) <= 2));
  if (matches.length !== 1) throw new Error('Ambiguous or stale target');
  return matches[0];
}
export function publicObservation(o) {
  return { ...o, nodes: o.nodes.map(n => n.secure ? { ...n, name: '[secure]', value: undefined } : n) };
}
//#endregion

//#region action validation
// 仅允许现场确认过的英文输入法分词；不能模糊匹配文件名或任意空白。
export const matchesDraft = (actual, expected) => actual === expected || actual === expected.replaceAll('same basename', 'same base name').replaceAll('actual filenames and file links', 'actual file names and file links');
export function validateAction(p, state, o, cs) {
  assertApp(o);
  const allowed = ['tap', 'type', 'submit', 'scroll', 'wait', 'task_ready', 'round_done', 'artifact_seen', 'finish', 'blocked'];
  if (!allowed.includes(p.action)) throw new Error('Invalid action');
  if (['tap', 'type', 'submit'].includes(p.action)) {
    const target = cs.find(c => c.id === p.target);
    if (!target) throw new Error('Unknown target');
    if (p.action === 'tap' && isSend(target)) throw new Error('Sending must use submit action');
    if (p.action === 'type') {
      if (state.phase !== 'compose' || !isField(target) || target.value?.trim()) throw new Error('Typing requires empty compose field');
      if (!/^[\x20-\x7e]+$/.test(state.prompt)) throw new Error('Unsupported input characters');
    }
    if (p.action === 'submit') {
      if (state.phase !== 'compose' || state.submitted) throw new Error('Invalid submit phase');
      if (!isSend(target)) throw new Error('Submit target must be a labeled send control');
      if (!o.nodes.some(n => isField(n) && eligible(n, o.screen) && matchesDraft(n.value, state.prompt))) throw new Error('Exact draft not verified');
    }
  }
  if (p.action === 'scroll' && !['up', 'down'].includes(p.direction)) throw new Error('Invalid scroll');
  if (p.action === 'task_ready' && (state.phase !== 'new_task' || !o.nodes.some(n => isField(n) && eligible(n, o.screen) && !n.value?.trim()))) throw new Error('New task needs empty composer');
  if (p.action === 'round_done' && (state.phase !== 'reply' || !state.submitted)) throw new Error('Invalid round_done phase');
  if (p.action === 'round_done' && o.nodes.some(n => isField(n) && matchesDraft(n.value, state.prompt))) throw new Error('Current draft is still present');
  if (['artifact_seen', 'finish'].includes(p.action) && state.phase !== 'cloud') throw new Error('Invalid cloud phase');
  if (p.action === 'artifact_seen' && !state.expectedArtifacts?.includes(p.artifact)) throw new Error('Unknown artifact');
  if (p.action === 'artifact_seen' && !o.nodes.some(n => eligible(n, o.screen) && `${n.name ?? ''} ${n.value ?? ''}`.includes(p.artifact.replace(/\.[^.]+$/, '')))) throw new Error('Expected filename not present in current preview');
  if (p.action === 'finish' && !state.expectedArtifacts.every(a => state.seen.includes(a))) throw new Error('Missing artifact evidence');
  return p;
}
//#endregion

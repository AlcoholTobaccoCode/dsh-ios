import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

//#region configuration
function endpoint(base, suffix) {
  const u = new URL(base);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Invalid provider endpoint');
  const path = u.pathname.replace(/\/+$/, '');
  u.pathname = path.endsWith(suffix) ? path : `${path.endsWith('/v1') ? path : `${path}/v1`}${suffix}`;
  return u.href;
}
export function readConfigValues(env) {
  for (const key of ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'JEV_API_KEY', 'JEV_BASE_URL']) {
    if (!env[key]?.trim()) throw new Error(`Missing ${key}`);
  }
  return {
    ds: { url: endpoint(env.DEEPSEEK_BASE_URL, '/chat/completions'), key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL },
    jev: { url: endpoint(env.JEV_BASE_URL, '/systemone'), key: env.JEV_API_KEY, model: 'jev-1.13.0' },
  };
}
export async function readConfig(path) { return readConfigValues(parseEnv(await readFile(path, 'utf8'))); }
export function publicConfig(c) {
  return Object.fromEntries(Object.entries(c).map(([name, p]) => [name, { url: p.url, model: p.model, keyConfigured: !!p.key }]));
}
//#endregion

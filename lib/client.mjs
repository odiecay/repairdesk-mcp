import { assertStatusWriteAllowed, validateStatusMode } from './status-policy.mjs';
import { readFileSync } from 'node:fs';

export function loadConfig(configPath, env = process.env) {
  let file = {};
  if (!env.REPAIRDESK_API_KEY && !env.REPAIRDESK_ACCESS_TOKEN) {
    try { file = JSON.parse(readFileSync(configPath, 'utf8')); }
    catch { throw new Error('Configure REPAIRDESK_API_KEY, REPAIRDESK_ACCESS_TOKEN or REPAIRDESK_CONFIG.'); }
  }
  const token = env.REPAIRDESK_ACCESS_TOKEN || file.repairdesk_access_token;
  const key = env.REPAIRDESK_API_KEY || file.repairdesk_api_key;
  if (!token && (!key || key === 'YOUR_REPAIRDESK_API_KEY_HERE')) throw new Error('RepairDesk credentials are not configured.');
  return { token, key: token ? undefined : key, base: env.REPAIRDESK_BASE_URL || file.repairdesk_base_url || 'https://api.repairdesk.co/api/web/v1' };
}

export function createClient({ getConfig, fetchImpl = fetch, interval = 1250, timeout = 60000, statusMode = 'api', userAgent = 'RepairDesk-MCP/2.0', sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  validateStatusMode(statusMode);
  let chain = Promise.resolve(), lastCall = 0;
  async function once(method, endpoint, { params, body, form } = {}, retry = false) {
    assertStatusWriteAllowed(statusMode, method, endpoint, body);
    const config = getConfig();
    // Three operations in the published spec repeat /v1 although the base already ends in /v1.
    const suffix = /\/v1\/?$/.test(config.base) ? endpoint.replace(/^\/v1\//, '/') : endpoint;
    const url = new URL(config.base.replace(/\/$/, '') + suffix);
    if (config.key) url.searchParams.set('api_key', config.key);
    for (const [key, value] of Object.entries(params || {})) {
      if (/^(api_key|access_token|authorization)$/i.test(key)) throw new Error('Pass authentication through server configuration, not tool arguments.');
      if (value !== undefined && value !== '') {
        if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key + '[]', String(v)));
        else url.searchParams.set(key, String(value));
      }
    }
    const redact = text => [config.key, config.token].filter(Boolean).reduce((s, secret) => s.split(secret).join('[REDACTED]'), String(text));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response, text;
    try {
      response = await fetchImpl(url, {
        method, signal: controller.signal, redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': userAgent,
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
          ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) },
        ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      text = await response.text();
    } catch {
      throw new Error(`${method} ${endpoint}: request failed or timed out.${method !== 'GET' ? ' Write outcome is unknown; inspect the record before retrying.' : ''}`);
    } finally { clearTimeout(timer); }
    if (response.status === 429 && method === 'GET' && !retry) {
      const header = Number(response.headers.get('retry-after'));
      // Keep waits bounded; do not retry writes, including payment/message/upload actions.
      if (header > 60) throw new Error('RepairDesk rate limited this request; retry later.');
      await sleep(header > 0 ? header * 1000 : Math.max(interval * 4, 2000));
      return once(method, endpoint, { params, body, form }, true);
    }
    if (!response.ok) throw new Error(redact(`RepairDesk ${method} ${endpoint}: HTTP ${response.status}. ${text.slice(0, 300)}${method !== 'GET' ? ' No automatic retry was made.' : ''}`));
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`RepairDesk returned non-JSON for ${method} ${endpoint}.${method !== 'GET' ? ' Write outcome unknown; inspect before retrying.' : ''}`); }
    if (json.success === false || json.data?.success === false) throw new Error(redact(`RepairDesk rejected ${method} ${endpoint}: ${json.message || json.data?.message || 'unspecified API error'}${method !== 'GET' ? ' The server may have partially saved this write; inspect the record before retrying.' : ''}`));
    return json.data ?? json;
  }
  return (method, endpoint, options) => {
    const run = chain.then(async () => {
      const wait = lastCall + interval - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      return once(method, endpoint, options);
    });
    chain = run.catch(() => {});
    return run;
  };
}

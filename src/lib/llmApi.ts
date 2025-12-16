import { getServerUrl } from './config';

function apiBase() {
  // Always use the configured server URL from runtime config.
  // The app saves this value in `src/lib/config.ts` (and via localStorage on web).
  return getServerUrl();
}

function isWeb() {
  return typeof window !== 'undefined';
}

function proxyBase() {
  return 'http://localhost:5173';
}

function buildCandidates(paths: string[]) {
  const server = getServerUrl();
  if (isWeb()) {
    const p = proxyBase();
    return paths.flatMap((pfx) => [
      { url: `${p}${pfx}`, proxy: true },
      { url: `${server}${pfx}`, proxy: false },
    ]);
  }
  return paths.map((pfx) => ({ url: `${server}${pfx}`, proxy: false }));
}
export async function listModels() {
  // On web, route requests through the local proxy to avoid CORS and pass the
  // configured server URL in the X-Target header. On native, call the server
  // URL directly.
  const server = getServerUrl();
  const useProxy = typeof window !== 'undefined';
  const proxyBase = 'http://localhost:5173';
  const candidates = useProxy
    ? [
        { url: `${proxyBase}/api/v0/models`, proxy: true },
        { url: `${proxyBase}/v1/models`, proxy: true },
        { url: `${server}/api/v0/models`, proxy: false },
        { url: `${server}/v1/models`, proxy: false },
      ]
    : [{ url: `${server}/api/v0/models`, proxy: false }, { url: `${server}/v1/models`, proxy: false }];

  let lastErr: any = null;
  for (const c of candidates) {
    try {
      const opts: any = {};
      if (c.proxy) opts.headers = { 'X-Target': server };
      const res = await fetch(c.url, opts);
      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        lastErr = new Error(`listModels failed: ${res.status} ${res.statusText} ${txt}`);
        continue;
      }
      return res.json();
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw new Error(`listModels: all attempts failed: ${lastErr?.message ?? String(lastErr)}`);
}

export async function createChatCompletion(model: string, messages: { role: string; content: string }[]) {
  const paths = ['/api/v0/chat/completions', '/v1/chat/completions'];
  const candidates = buildCandidates(paths);
  let lastErr: any = null;
  const body = JSON.stringify({ model, messages });
  for (const c of candidates) {
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (c.proxy) headers['X-Target'] = getServerUrl();
      const res = await fetch(c.url, { method: 'POST', headers, body });
      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        lastErr = new Error(`createChatCompletion failed: ${res.status} ${res.statusText} ${txt}`);
        continue;
      }
      return res.json();
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw new Error(`createChatCompletion: all attempts failed: ${lastErr?.message ?? String(lastErr)}`);
}

/**
 * Best-effort unload a model on the server. Different LM servers expose different endpoints
 * so we try a few common patterns. This function will not throw on 404 or unsupported
 * endpoints; it returns the first successful response JSON or throws if all attempts fail.
 */
export async function unloadModel(model: string) {
  const modelEnc = encodeURIComponent(model);
  const paths = [
    `/api/v0/models/${modelEnc}/unload`,
    `/api/v0/models/unload`,
    `/api/v0/unload_model`,
    `/v1/models/${modelEnc}/unload`,
    `/v1/models/unload`,
    `/v1/unload_model`,
  ];

  const candidates = buildCandidates(paths);
  let lastErr: any = null;
  for (const c of candidates) {
    try {
      const body = JSON.stringify({ model });
      const headers: any = { 'Content-Type': 'application/json' };
      if (c.proxy) headers['X-Target'] = getServerUrl();
      const res = await fetch(c.url, { method: 'POST', headers, body });
      if (res.ok) {
        try {
          return await res.json();
        } catch (e) {
          return { ok: true };
        }
      }
      const txt = await res.text().catch(() => '<no body>');
      lastErr = new Error(`unloadModel attempt failed: ${res.status} ${res.statusText} ${txt}`);
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('unloadModel: all attempts failed');
}

export async function testConnectivity() {
  const paths = ['/', '/api/v0/models', '/v1/models'];
  const candidates = buildCandidates(paths);
  let lastErr: any = null;
  for (const c of candidates) {
    try {
      const headers: any = {};
      if (c.proxy) headers['X-Target'] = getServerUrl();
      const res = await fetch(c.url, { method: 'GET', headers });
      return { ok: res.ok, status: res.status, url: res.url };
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw new Error(`Connectivity test failed: ${lastErr?.message ?? String(lastErr)}`);
}

import { getServerUrl } from './config';

function apiBase() {
  // Keep web proxy behavior if running in browser
  if (typeof window !== 'undefined') return 'http://localhost:5173';
  return getServerUrl();
}

export async function listModels() {
  const url = `${apiBase()}/v1/models`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      throw new Error(`listModels failed: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  } catch (err: any) {
    throw new Error(`Network error when fetching ${url}: ${err?.message ?? String(err)}`);
  }
}

export async function createChatCompletion(model: string, messages: { role: string; content: string }[]) {
  const url = `${apiBase()}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      throw new Error(`createChatCompletion failed: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  } catch (err: any) {
    throw new Error(`Network error when posting ${url}: ${err?.message ?? String(err)}`);
  }
}

/**
 * Best-effort unload a model on the server. Different LM servers expose different endpoints
 * so we try a few common patterns. This function will not throw on 404 or unsupported
 * endpoints; it returns the first successful response JSON or throws if all attempts fail.
 */
export async function unloadModel(model: string) {
  const candidates = [
    `${apiBase()}/v1/models/${encodeURIComponent(model)}/unload`,
    `${apiBase()}/v1/models/unload`,
    `${apiBase()}/v1/unload_model`,
  ];

  let lastErr: any = null;
  for (const url of candidates) {
    try {
      const body = JSON.stringify({ model });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.ok) {
        try {
          return await res.json();
        } catch (e) {
          return { ok: true };
        }
      }
      // ignore 404 or not implemented; keep trying
      const txt = await res.text().catch(() => '<no body>');
      lastErr = new Error(`unloadModel attempt failed: ${res.status} ${res.statusText} ${txt}`);
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('unloadModel: all attempts failed');
}

export async function testConnectivity() {
  const url = `${apiBase()}/`;
  try {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, url: res.url };
  } catch (err: any) {
    throw new Error(`Connectivity test failed to ${url}: ${err?.message ?? String(err)}`);
  }
}

// Use a local proxy for web (avoids CORS) and the direct LM Studio IP for native.
const NATIVE_API = 'http://174.116.95.195:1234';
const WEB_PROXY = 'http://localhost:5173';
export const API_BASE = typeof window !== 'undefined' ? WEB_PROXY : NATIVE_API;

export async function listModels() {
  const url = `${API_BASE}/v1/models`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '<no body>');
      throw new Error(`listModels failed: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  } catch (err: any) {
    // rethrow with more context for easier debugging in the UI
    throw new Error(`Network error when fetching ${url}: ${err?.message ?? String(err)}`);
  }
}

export async function testConnectivity() {
  const url = `${API_BASE}/`;
  try {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, url: res.url };
  } catch (err: any) {
    throw new Error(`Connectivity test failed to ${url}: ${err?.message ?? String(err)}`);
  }
}

export async function createChatCompletion(model: string, messages: { role: string; content: string }[]) {
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`createChatCompletion failed: ${res.status} ${txt}`);
  }
  return res.json();
}

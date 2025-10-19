// Simple runtime config for the LLM server URL. Not persisted (in-memory) for now.
let serverUrl = 'http://174.116.95.195:1234';
let selectedModel: string | null = null;

// Try to initialize from localStorage when running in a browser environment
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const s = window.localStorage.getItem('pocketllm:serverUrl');
    const m = window.localStorage.getItem('pocketllm:selectedModel');
    if (s) serverUrl = s;
    if (m) selectedModel = m;
  }
} catch (e) {
  // ignore
}
type Listener = (m: string | null) => void;
const listeners: Listener[] = [];

export function getServerUrl() {
  return serverUrl;
}

export function setServerUrl(url: string) {
  serverUrl = url;
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('pocketllm:serverUrl', serverUrl);
  } catch (e) {
    // ignore
  }
}

export function getSelectedModel() {
  return selectedModel;
}

export function setSelectedModel(m: string | null) {
  selectedModel = m;
  // notify listeners
  listeners.forEach((l) => {
    try {
      l(selectedModel);
    } catch (e) {
      // ignore listener errors
    }
  });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (selectedModel) window.localStorage.setItem('pocketllm:selectedModel', selectedModel);
      else window.localStorage.removeItem('pocketllm:selectedModel');
    }
  } catch (e) {
    // ignore
  }
}

export function subscribeSelectedModel(fn: Listener) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_HEADERS = {
  'user-agent': 'BourbonSignalEngine/0.1 (+https://bourbonsignal.com; research prototype)',
  'accept': 'text/html,application/json,text/plain,*/*',
  'accept-language': 'en-US,en;q=0.9'
};

export async function fetchWithMeta(url, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 18000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
      signal: controller.signal
    });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      requestedUrl: url,
      contentType,
      bytes: Buffer.byteLength(text),
      elapsedMs: Date.now() - startedAt,
      text,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'FETCH_ERROR',
      url,
      requestedUrl: url,
      contentType: '',
      bytes: 0,
      elapsedMs: Date.now() - startedAt,
      text: '',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
    if (options.politeDelayMs) await delay(options.politeDelayMs);
  }
}

export function tryParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

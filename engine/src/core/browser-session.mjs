import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_CDP_URL = process.env.BROWSER_CDP_URL || process.env.OHLQ_CDP_URL || 'http://127.0.0.1:18800';

export function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function cdpFetch(cdpUrl, route, options = {}) {
  const res = await fetch(`${cdpUrl.replace(/\/$/, '')}${route}`, options);
  if (!res.ok) throw new Error(`CDP ${route} returned ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

export async function getOrCreateTarget(cdpUrl = DEFAULT_CDP_URL, preferUrl = null) {
  const tabs = await cdpFetch(cdpUrl, '/json/list');
  const preferred = preferUrl ? tabs.find((t) => t.type === 'page' && String(t.url || '').includes(preferUrl)) : null;
  if (preferred?.webSocketDebuggerUrl) return preferred;
  const existing = tabs.find((t) => t.type === 'page' && t.url !== 'chrome://newtab/');
  if (existing?.webSocketDebuggerUrl) return existing;
  try {
    return await cdpFetch(cdpUrl, `/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  } catch {
    return await cdpFetch(cdpUrl, `/json/new?${encodeURIComponent('about:blank')}`);
  }
}

export class BrowserPage {
  constructor(wsUrl, options = {}) {
    this.wsUrl = wsUrl;
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    this.pageTimeoutMs = Number(options.pageTimeoutMs || process.env.BROWSER_PAGE_TIMEOUT_MS || 45000);
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to CDP websocket')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', (event) => { clearTimeout(timer); reject(new Error(`CDP websocket error: ${event.message || 'unknown'}`)); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method) this.events.push({ at: new Date().toISOString(), method: msg.method, params: msg.params });
      if (!msg.id) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(`${msg.error.message}${msg.error.data ? `: ${msg.error.data}` : ''}`));
      else pending.resolve(msg.result);
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable').catch(() => null);
  }

  send(method, params = {}) {
    const id = ++this.seq;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }
      }, 60000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.ws.send(payload);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, timeout: 60000 });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
    return result.result?.value;
  }

  async navigate(url, waitMs = 1600) {
    this.events = [];
    await this.send('Page.navigate', { url });
    const started = Date.now();
    while (Date.now() - started < this.pageTimeoutMs) {
      const state = await this.evaluate('document.readyState', false).catch(() => 'loading');
      if (state === 'complete' || state === 'interactive') {
        if (waitMs) await sleep(waitMs);
        return;
      }
      await sleep(500);
    }
    throw new Error(`Timed out loading ${url}`);
  }

  async extractPage() {
    return this.evaluate(`(() => {
      const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
      const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({ text: clean(a.textContent), href: a.href })).filter((x) => x.href);
      const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
      const resources = performance.getEntriesByType('resource').map((r) => ({ name: r.name, initiatorType: r.initiatorType, duration: Math.round(r.duration || 0), transferSize: r.transferSize || 0 })).slice(-500);
      return {
        url: location.href,
        title: document.title,
        csrfToken: document.documentElement.dataset.csrfToken || null,
        text: clean(document.body?.innerText || '').slice(0, 250000),
        htmlSample: document.documentElement.outerHTML.slice(0, 200000),
        links,
        scripts,
        resources
      };
    })()`);
  }

  networkSummary() {
    return this.events
      .filter((event) => event.method === 'Network.requestWillBeSent' || event.method === 'Network.responseReceived')
      .map((event) => {
        const request = event.params?.request;
        const response = event.params?.response;
        return {
          type: event.method,
          url: request?.url || response?.url || null,
          method: request?.method || null,
          status: response?.status || null,
          mimeType: response?.mimeType || null,
          resourceType: event.params?.type || null
        };
      })
      .filter((row) => row.url && /api|search|product|inventory|availability|store|locator|ccstore|webapi|asmx|ajax|json/i.test(row.url))
      .slice(-300);
  }

  close() { try { this.ws?.close(); } catch {} }
}

export async function writeJson(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload, null, 2));
}

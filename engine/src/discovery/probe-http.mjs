import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;

function secureUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Only HTTPS source probes are permitted.');
  url.hash = '';
  return url;
}

function isPublicIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if ([0, 10, 127].includes(a) || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if ((a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false;
  return true;
}

function isPublicAddress(address) {
  const normalized = String(address || '').toLowerCase().split('%')[0];
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')) return false;
  if (normalized.startsWith('::ffff:')) return isPublicIpv4(normalized.slice(7));
  return true;
}

async function assertPublicDestination(url, resolveHost) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Source probes require a public internet host.');
  const literalFamily = isIP(hostname);
  const records = literalFamily ? [{ address: hostname, family: literalFamily }] : await resolveHost(hostname);
  if (!Array.isArray(records) || !records.length || records.some((record) => !isPublicAddress(record?.address))) throw new Error('Source probes require a public internet host.');
  return records.map((record) => ({ address: record.address, family: Number(record.family) || isIP(record.address) }));
}

function compactHeaders(headers) {
  const allowed = ['content-type', 'content-length', 'location', 'etag', 'last-modified'];
  return Object.fromEntries(allowed.map((key) => [key, headers.get(key)]).filter(([, value]) => value));
}

async function textFromResponse(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error(`Probe payload exceeds ${maxBytes} byte limit.`);
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('probe payload limit exceeded').catch(() => {});
      throw new Error(`Probe payload exceeds ${maxBytes} byte limit.`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function pinnedDispatcher(records) {
  let index = 0;
  return new Agent({
    connect: {
      lookup(_hostname, _options, callback) {
        const record = records[index++ % records.length];
        callback(null, record.address, record.family);
      },
    },
  });
}

export function createBoundedHttpClient({
  fetchImpl = fetch,
  resolveHost = (hostname) => lookup(hostname, { all: true, verbatim: true }),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  perHostRequestBudget = 8,
  maxConcurrency = 2,
  minDelayMs = 0,
  userAgent = 'BourbonSignalSourceProbe/1.0 (+https://bourbonsignal.com; no-login discovery probe)',
} = {}) {
  const hostRequests = new Map();
  const hostLastStartedAt = new Map();
  const queue = [];
  let active = 0;

  function runNext() {
    if (active >= Math.max(1, maxConcurrency)) return;
    const job = queue.shift();
    if (!job) return;
    active += 1;
    job().finally(() => { active -= 1; runNext(); });
  }

  function schedule(work) {
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try { resolve(await work()); } catch (error) { reject(error); }
      });
      runNext();
    });
  }

  async function waitForHost(host) {
    const previous = hostLastStartedAt.get(host) || 0;
    const delay = Math.max(0, minDelayMs - (Date.now() - previous));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    hostLastStartedAt.set(host, Date.now());
  }

  async function get(urlValue, { headers = {}, signal: inheritedSignal } = {}) {
    const initialUrl = secureUrl(urlValue);
    return schedule(async () => {
      let currentUrl = initialUrl;
      let redirects = 0;
      while (true) {
        const publicRecords = await assertPublicDestination(currentUrl, resolveHost);
        const count = hostRequests.get(currentUrl.host) || 0;
        if (count >= perHostRequestBudget) throw new Error(`Per-host probe budget exhausted for ${currentUrl.host}.`);
        hostRequests.set(currentUrl.host, count + 1);
        await waitForHost(currentUrl.host);
        const dispatcher = pinnedDispatcher(publicRecords);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('Probe timed out.')), timeoutMs);
        const onAbort = () => controller.abort(inheritedSignal?.reason);
        inheritedSignal?.addEventListener('abort', onAbort, { once: true });
        try {
          const response = await fetchImpl(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            credentials: 'omit',
            signal: controller.signal,
            dispatcher,
            headers: {
              Accept: 'application/json,text/html;q=0.9,*/*;q=0.5',
              'User-Agent': userAgent,
              ...headers,
            },
          });
          const location = response.headers.get('location');
          if (response.status >= 300 && response.status < 400 && location) {
            if (redirects >= maxRedirects) throw new Error(`Probe redirect limit (${maxRedirects}) exceeded.`);
            currentUrl = secureUrl(new URL(location, currentUrl));
            redirects += 1;
            continue;
          }
          return {
            ok: response.ok,
            status: response.status,
            url: currentUrl.toString(),
            headers: compactHeaders(response.headers),
            text: await textFromResponse(response, maxBytes),
            redirectCount: redirects,
          };
        } finally {
          clearTimeout(timer);
          inheritedSignal?.removeEventListener('abort', onAbort);
          await dispatcher.close().catch(() => {});
        }
      }
    });
  }

  return { get, hostRequests };
}

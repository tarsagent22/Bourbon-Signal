const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 2;

function secureUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Only HTTPS source probes are permitted.');
  url.hash = '';
  return url;
}

function compactHeaders(headers) {
  const allowed = ['content-type', 'content-length', 'location', 'etag', 'last-modified'];
  return Object.fromEntries(allowed.map((key) => [key, headers.get(key)]).filter(([, value]) => value));
}

function textFromResponse(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error(`Probe payload exceeds ${maxBytes} byte limit.`);
  return response.arrayBuffer().then((buffer) => {
    if (buffer.byteLength > maxBytes) throw new Error(`Probe payload exceeds ${maxBytes} byte limit.`);
    return new TextDecoder().decode(buffer);
  });
}

export function createBoundedHttpClient({
  fetchImpl = fetch,
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
        const count = hostRequests.get(currentUrl.host) || 0;
        if (count >= perHostRequestBudget) throw new Error(`Per-host probe budget exhausted for ${currentUrl.host}.`);
        hostRequests.set(currentUrl.host, count + 1);
        await waitForHost(currentUrl.host);
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
        }
      }
    });
  }

  return { get, hostRequests };
}

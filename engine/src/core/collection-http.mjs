export const DEFAULT_COLLECTION_MAX_BYTES = 8 * 1024 * 1024;

export function requireHttpsCollectionUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Collection requires a credential-free HTTPS URL');
  return url;
}

// Historical Wake entrypoints are explicitly reviewed. Other callers must supply
// reviewed source seeds; a Location header can never expand this allowlist.
const CANONICAL_SOURCE_SEEDS = ['https://wakeabc.com/'];
function canonicalIdentity(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Canonical collection requires credential-free HTTP(S) on the default port');
  }
  return url.hostname.replace(/^www\./, '');
}

export async function fetchCollectionResponse(value, options = {}) {
  const { reviewedSeedUrls = [], maxRedirects = 3, ...requestOptions } = options;
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 3) throw new Error('Invalid collection redirect limit');
  let url = new URL(value);
  const seeds = [...CANONICAL_SOURCE_SEEDS, ...reviewedSeedUrls];
  const allowed = new Set(seeds.map(canonicalIdentity));
  // Do not let credential-bearing URLs reach even the strict nonredirect path.
  if (url.username || url.password) throw new Error('Collection URL credentials are forbidden');
  const identity = url.hostname.replace(/^www\./, '');
  const canonical = allowed.has(identity) && !url.port;
  if (canonical && url.protocol === 'http:') url.protocol = 'https:';
  requireHttpsCollectionUrl(url);
  const visited = new Set();
  for (let redirects = 0; ; redirects += 1) {
    requestOptions.signal?.throwIfAborted();
    requireHttpsCollectionUrl(url);
    if (canonical && canonicalIdentity(url) !== identity) throw new Error('Collection destination outside reviewed source identity');
    if (visited.has(url.href)) throw new Error('Collection redirect loop');
    visited.add(url.href);
    const response = await fetch(url.href, { ...requestOptions, redirect: canonical ? 'manual' : 'error' });
    if (requestOptions.signal?.aborted) {
      await response.body?.cancel?.().catch(() => {});
      requestOptions.signal.throwIfAborted();
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel?.().catch(() => {});
      if (!canonical || redirects >= maxRedirects) throw new Error('Collection redirect not allowed or limit exceeded');
      if (!['GET', 'HEAD'].includes(String(requestOptions.method || 'GET').toUpperCase())) throw new Error('Collection request method cannot redirect');
      const location = response.headers.get('location');
      if (!location) throw new Error('Collection redirect missing Location');
      const destination = requireHttpsCollectionUrl(new URL(location, url));
      if (canonicalIdentity(destination) !== identity) throw new Error('Collection destination outside reviewed source identity');
      url = destination;
      continue;
    }
    // Native manual fetch cannot auto-follow. Also fail closed for injected transports.
    if (canonical && response.url && (requireHttpsCollectionUrl(response.url), canonicalIdentity(response.url) !== identity)) {
      await response.body?.cancel?.().catch(() => {});
      throw new Error('Collection response outside reviewed source identity');
    }
    return { response, url: response.url || url.href };
  }
}

// Fetch exposes decoded bytes: this budget also bounds HTTP decompression output.
export async function readBoundedCollectionBody(response, { maxBytes = DEFAULT_COLLECTION_MAX_BYTES, signal } = {}) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('Collection byte limit must be positive and finite');
  const tooLarge = () => new Error(`Collection response exceeded ${maxBytes} bytes`);
  signal?.throwIfAborted();
  if (Number(response.headers?.get?.('content-length')) > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw tooLarge();
  }
  if (!response.body?.getReader) {
    // Compatibility for existing injected transports; native fetch streams bodies.
    const bytes = Buffer.from(await response.text());
    if (bytes.length > maxBytes) throw tooLarge();
    signal?.throwIfAborted();
    return bytes;
  }
  const reader = response.body.getReader();
  const abort = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DESCRIPTION_LENGTH = 480;

export function normalizeQuery(query) {
  return String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cachePath(cacheDir, query) {
  return path.join(cacheDir, `${createHash('sha256').update(query).digest('hex')}.json`);
}

function compactText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function normalizeBraveResult(result) {
  try {
    const parsed = new URL(String(result?.url || ''));
    if (parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const url = parsed.toString();
    return {
      title: compactText(result?.title, 180),
      url: url.endsWith('/') && parsed.pathname === '/' && !parsed.search ? url.slice(0, -1) : url,
      domain: parsed.hostname,
      description: compactText(result?.description, MAX_DESCRIPTION_LENGTH),
      age: compactText(result?.age, 80) || null,
    };
  } catch {
    return null;
  }
}

export function createBraveClient({
  apiKey = process.env.BRAVE_SEARCH_API_KEY,
  cacheDir = path.resolve('out/cache/brave-search'),
  cacheMaxAgeMs = Math.max(60 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(process.env.BOURBON_SIGNAL_BRAVE_CACHE_MAX_AGE_HOURS || 24) * 60 * 60 * 1000)) || DEFAULT_CACHE_MAX_AGE_MS,
  endpoint = BRAVE_ENDPOINT,
  fetchImpl = fetch,
  now = () => new Date(),
  maxResults = 10,
} = {}) {
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is required for direct Brave discovery.');
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:' || endpointUrl.hostname !== 'api.search.brave.com') throw new Error('Brave discovery requires the official HTTPS Brave Search API endpoint.');

  async function readCache(query) {
    try {
      const cached = JSON.parse(await readFile(cachePath(cacheDir, query), 'utf8'));
      const cachedAt = Date.parse(cached.cachedAt);
      if (!Number.isFinite(cachedAt) || now().getTime() - cachedAt > cacheMaxAgeMs) return null;
      return { ...cached, cacheHit: true };
    } catch {
      return null;
    }
  }

  async function search(query, { count = maxResults, country = 'US' } = {}) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) throw new Error('Brave search query must be non-empty.');
    const cached = await readCache(normalizedQuery);
    if (cached) return cached;
    const url = new URL(endpointUrl);
    url.searchParams.set('q', normalizedQuery);
    url.searchParams.set('count', String(Math.max(1, Math.min(Number(count) || maxResults, maxResults))));
    url.searchParams.set('country', country);
    url.searchParams.set('search_lang', 'en');
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
        'User-Agent': 'BourbonSignalDiscovery/1.0 (+https://bourbonsignal.com; discovery-only)',
      },
    });
    if (!response.ok) throw new Error(`Brave Search API returned ${response.status}.`);
    const payload = await response.json();
    const results = (payload?.web?.results || []).map(normalizeBraveResult).filter(Boolean);
    const record = {
      query: normalizedQuery,
      cachedAt: now().toISOString(),
      cacheHit: false,
      results,
    };
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath(cacheDir, normalizedQuery), JSON.stringify(record));
    return record;
  }

  return { search };
}

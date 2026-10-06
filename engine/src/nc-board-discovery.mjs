// Persist discovery knowledge, never inventory truth. Cached successes cannot
// make a failed current request fresh or expand a board's reviewed identity.
export const NC_REVIEWED_BOARD_WEBSITES = {
  'Indian Trail ABC Board': 'https://indiantrail.ncabcboards.com/',
  'Canton ABC Board': 'https://canton.ncabcboards.com/',
  'Rowan/Kannapolis ABC Board': 'https://rowankannapolisabc.com/wordpress/',
  // The board's old domain now redirects to its Commission directory entry.
  'Locust ABC Board': 'https://abc2.nc.gov/districts/board/232',
};

export function ncBoardKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function ncRouteKey(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/^www\./, '');
    url.hash = '';
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  } catch { return null; }
}

export function ncTrustedRoute(value, seeds) {
  const key = ncRouteKey(value);
  if (!key) return false;
  const host = new URL(key).hostname;
  return seeds.some(seed => {
    const seedKey = ncRouteKey(seed);
    return seedKey && new URL(seedKey).hostname === host;
  });
}

const rank = url => /lottery|allocat|barrel|drops|release|inventory|search|product/i.test(url) ? 0
  : /news|blog|announc|feed/i.test(url) ? 1 : 2;

export function selectNcBoardRoutes({ pinned = [], discovered = [], previous = {}, guesses = [], seeds = [], limit = 12 }) {
  const budget = Math.max(1, Math.min(24, Number(limit) || 12));
  const selected = new Map();
  const add = url => {
    const key = ncRouteKey(url);
    if (selected.size < budget && key && ncTrustedRoute(url, seeds)) selected.set(key, url);
  };
  // Required routes never lose their slots to guesses. Remaining real links
  // rotate oldest-first, including routes found in previous successful runs.
  pinned.forEach(add);
  const real = new Map();
  for (const url of [...discovered, ...Object.values(previous.routes || {}).filter(r => r.kind !== 'guess').map(r => r.url)]) {
    const key = ncRouteKey(url);
    if (key && ncTrustedRoute(url, seeds) && !selected.has(key)) real.set(key, url);
  }
  const sorted = [...real.entries()].sort(([ak, a], [bk, b]) => {
    const at = Date.parse(previous.routes?.[ak]?.lastCheckedAt || '') || 0;
    const bt = Date.parse(previous.routes?.[bk]?.lastCheckedAt || '') || 0;
    return at - bt || rank(a) - rank(b) || a.localeCompare(b);
  });
  const explorationSlots = Math.min(2, Math.max(0, budget - selected.size));
  for (const [, url] of sorted) {
    if (selected.size >= budget - explorationSlots) break;
    add(url);
  }
  const candidates = guesses.filter(url => ncTrustedRoute(url, seeds) && !selected.has(ncRouteKey(url)));
  const cursor = Math.max(0, Number(previous.cursor) || 0);
  for (let i = 0; i < Math.min(explorationSlots, candidates.length); i++) add(candidates[(cursor + i) % candidates.length]);
  // If exploration has nothing left, use its slots for known public links.
  for (const [, url] of sorted) add(url);
  return { urls: [...selected.values()], nextCursor: cursor + explorationSlots, discoveredCount: real.size };
}

export function updateNcBoardRegistry(previous = {}, reports, { seeds, pinned = [], discovered = [], cursor = 0 } = {}) {
  const routes = {};
  for (const route of Object.values(previous.routes || {})) {
    const key = ncRouteKey(route.url);
    if (key && ncTrustedRoute(route.url, seeds)) routes[key] = { ...route };
  }
  const pinnedKeys = new Set(pinned.map(ncRouteKey));
  const realKeys = new Set(discovered.map(ncRouteKey));
  for (const url of discovered) {
    const key = ncRouteKey(url);
    if (key && ncTrustedRoute(url, seeds) && !routes[key]) routes[key] = { url, kind: 'discovered', consecutiveFailures: 0 };
  }
  for (const report of reports) {
    const key = ncRouteKey(report.url);
    if (!key || !ncTrustedRoute(report.url, seeds)) continue;
    const old = routes[key] || {};
    routes[key] = {
      url: report.url,
      kind: pinnedKeys.has(key) ? 'pinned' : realKeys.has(key) || old.kind === 'discovered' ? 'discovered' : 'guess',
      lastCheckedAt: report.checkedAt,
      lastSuccessAt: report.ok ? report.checkedAt : old.lastSuccessAt || null,
      status: report.status,
      error: report.error || null,
      consecutiveFailures: report.ok ? 0 : Number(old.consecutiveFailures || 0) + 1,
      capabilities: report.ok ? report.capabilities : old.capabilities || [],
    };
  }
  // Bound persisted state without losing pinned routes or unvisited links.
  const entries = Object.entries(routes).sort(([, a], [, b]) =>
    Number(b.kind === 'pinned') - Number(a.kind === 'pinned') ||
    Number(a.kind === 'guess') - Number(b.kind === 'guess') ||
    (Date.parse(b.lastSuccessAt || '') || 0) - (Date.parse(a.lastSuccessAt || '') || 0));
  return { cursor, lastCheckedAt: reports.map(r => r.checkedAt).filter(Boolean).sort().at(-1) || previous.lastCheckedAt || null, routes: Object.fromEntries(entries.slice(0, 128)) };
}

export function summarizeNcBoardSources(boards, registry = {}, { now = Date.now(), shipmentObservedAt = null, shipmentRetrievedAt = null } = {}) {
  const shipmentAge = Number(now) - Date.parse(shipmentObservedAt || '');
  const shipmentStatus = Number.isFinite(shipmentAge) && shipmentAge >= -600000 && shipmentAge <= 36 * 3600000 ? 'current' : 'upstream_stale';
  const rows = [...boards].map(board => {
    const entry = registry[ncBoardKey(board.boardName)] || {};
    const reports = [...new Map((board.officialPageReports || []).map(report => [ncRouteKey(report.url) || report.url, report])).values()];
    const successes = reports.filter(r => r.ok !== false && r.sourceIdentityVerified !== false && Number(r.status) >= 200 && Number(r.status) < 300);
    const failures = reports.filter(r => r.ok === false);
    const requiredFailures = failures.filter(r => {
      const route = entry.routes?.[ncRouteKey(r.url)];
      return route?.kind !== 'guess';
    });
    return {
      boardName: board.boardName,
      website: board.website || null,
      status: !board.website && !reports.length ? 'no_public_website_registered'
        : !reports.length ? 'not_checked' : !successes.length ? 'unreachable'
          : requiredFailures.length || board.parserWarnings?.length ? 'partial' : 'healthy',
      attemptedPageCount: reports.length,
      successfulPageCount: successes.length,
      failedPageCount: failures.length,
      failedKnownRoutes: requiredFailures.map(r => ({ url: r.url, status: r.status, error: r.error || null, consecutiveFailures: Number(entry.routes?.[ncRouteKey(r.url)]?.consecutiveFailures || 0) })),
      consecutiveFailures: Math.max(0, ...requiredFailures.map(r => Number(entry.routes?.[ncRouteKey(r.url)]?.consecutiveFailures || 0))),
      lastSuccessfulPageAt: successes.map(r => r.checkedAt).filter(Boolean).sort().at(-1) || null,
      trackedShipmentRows: Number(board.trackedShipmentRows || 0),
      shipmentObservedAt,
      shipmentRetrievedAt,
      shipmentStatus,
      parserWarnings: board.parserWarnings || [],
    };
  });
  return {
    checkedAt: new Date(now).toISOString(),
    boardCount: rows.length,
    statusCounts: rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {}),
    boards: rows,
  };
}

export async function fetchNcBoardPage(url, { fetchPage, fetchOptions = {}, signal } = {}) {
  signal?.throwIfAborted();
  let response = await fetchPage(url, fetchOptions);
  const transient = response.status === 0 || response.status === 408 || response.status >= 500;
  if (!response.ok && transient) {
    signal?.throwIfAborted();
    response = await fetchPage(url, fetchOptions);
    return { ...response, attemptCount: 2 };
  }
  // 403/challenges and rate limiting require another public route or later run.
  return { ...response, attemptCount: 1 };
}

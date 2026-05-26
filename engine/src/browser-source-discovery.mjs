import { STATE_SOURCES } from './state-sources.mjs';
import { BrowserPage, DEFAULT_CDP_URL, getOrCreateTarget, sleep, writeJson } from './core/browser-session.mjs';

const STATE_IDS = (process.env.BROWSER_DISCOVERY_STATES || process.argv.find((a) => a.startsWith('--states='))?.split('=')[1] || 'OR,PA,NH,MD-MONTGOMERY,ME')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const OUT_DIR = process.env.BROWSER_DISCOVERY_OUT_DIR || 'out/browser';
const WAIT_MS = Number(process.env.BROWSER_DISCOVERY_WAIT_MS || 2500);
const MAX_SOURCES_PER_STATE = Number(process.env.BROWSER_DISCOVERY_MAX_SOURCES || 5);

function likelyApi(row) {
  return /api|search|product|inventory|availability|store|locator|ccstore|webapi|asmx|ajax|json|graphql/i.test(row.url || row.name || '');
}

function normalizeEndpoint(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function summarizePage(page, network) {
  const productLinks = (page.links || [])
    .filter((l) => /product|liquor|spirits|whiskey|bourbon|item|sku|store|location/i.test(`${l.href} ${l.text}`))
    .slice(0, 120);
  const apiResources = [...(page.resources || []).filter(likelyApi), ...(network || []).filter(likelyApi)]
    .map((r) => ({ ...r, url: normalizeEndpoint(r.url || r.name) }))
    .filter((r, i, arr) => r.url && arr.findIndex((x) => x.url === r.url && x.type === r.type) === i)
    .slice(0, 160);
  return {
    url: page.url,
    title: page.title,
    textSample: page.text,
    textLength: page.text?.length || 0,
    csrfTokenPresent: Boolean(page.csrfToken),
    productLinks,
    apiResources,
    scripts: (page.scripts || []).slice(0, 80)
  };
}

async function discoverState(page, config) {
  const pages = [];
  const roadblocks = [];
  for (const source of config.sources.slice(0, MAX_SOURCES_PER_STATE)) {
    console.log(`${config.id} browser ${source.label}`);
    try {
      await page.navigate(source.url, WAIT_MS);
      await page.evaluate(`(() => {
        const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],a'));
        const age = buttons.find((el) => /i'?m 21|21 or older|yes,? i am over 21|yes/i.test(String(el.value || el.textContent || '').trim()) && !/newsletter|submit/i.test(String(el.value || el.textContent || '').trim()));
        if (age) { age.click(); return true; }
        return false;
      })()`).catch(() => false);
      await sleep(1200);
      const extracted = await page.extractPage();
      pages.push({ source, ...summarizePage(extracted, page.networkSummary()) });
      console.log(`  ok: ${extracted.title || extracted.url} (${extracted.text?.length || 0} chars)`);
    } catch (error) {
      roadblocks.push({ source, error: error.message });
      console.log(`  blocked: ${error.message}`);
    }
  }
  const endpointCandidates = pages.flatMap((p) => p.apiResources.map((r) => ({ pageUrl: p.url, ...r })))
    .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i);
  const productLinks = pages.flatMap((p) => p.productLinks.map((l) => ({ pageUrl: p.url, ...l })))
    .filter((r, i, arr) => arr.findIndex((x) => x.href === r.href) === i);
  return {
    generatedAt: new Date().toISOString(),
    state: config.id,
    label: config.label,
    sourceCount: config.sources.length,
    renderedPageCount: pages.length,
    endpointCandidateCount: endpointCandidates.length,
    productLinkCount: productLinks.length,
    pages,
    endpointCandidates,
    productLinks,
    roadblocks
  };
}

async function main() {
  const target = await getOrCreateTarget(DEFAULT_CDP_URL);
  const page = new BrowserPage(target.webSocketDebuggerUrl, { pageTimeoutMs: process.env.BROWSER_PAGE_TIMEOUT_MS || 55000 });
  await page.connect();
  const summaries = [];
  try {
    for (const id of STATE_IDS) {
      const config = STATE_SOURCES.find((s) => s.id === id);
      if (!config) throw new Error(`Unknown state id: ${id}`);
      const result = await discoverState(page, config);
      summaries.push({ state: result.state, renderedPageCount: result.renderedPageCount, endpointCandidateCount: result.endpointCandidateCount, productLinkCount: result.productLinkCount, roadblockCount: result.roadblocks.length });
      await writeJson(`${OUT_DIR}/${id}-browser-discovery.json`, result);
    }
  } finally {
    page.close();
  }
  await writeJson(`${OUT_DIR}/browser-discovery-summary.json`, { generatedAt: new Date().toISOString(), states: summaries });
  console.log(`Browser discovery complete: ${summaries.map((s) => `${s.state}:${s.renderedPageCount}p/${s.endpointCandidateCount}api/${s.productLinkCount}links`).join(', ')}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

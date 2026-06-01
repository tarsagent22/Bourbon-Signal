import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractLinks, stableId, stripHtml, titleCase } from '../core/text.mjs';

const OUT = path.resolve('out');
const NC_STOCK_SHIPPED_DATA_URL = 'https://abc2.nc.gov/Search/StockShippedData';
const NC_STOCK_SHIPPED_PAGE_URL = 'https://abc2.nc.gov/Search/StockShipped';
const NC_WAREHOUSE_STOCK_URL = 'https://abc2.nc.gov/StoresBoards/Stocks';
const NC_BOARD_LIST_URL = 'https://abc2.nc.gov/StoresBoards/BoardList';
const NC_BOARD_HISTORY_DIR = path.join(OUT, 'history', 'nc-board-intelligence');
const NC_WAREHOUSE_HISTORY_DIR = path.join(OUT, 'history', 'nc-warehouse');
const NC_BOARD_WEBSITE_MAX = Number(process.env.BOURBON_SIGNAL_NC_BOARD_WEBSITE_MAX || 10);
const NC_BOARD_WEBSITE_URL_MAX = Number(process.env.BOURBON_SIGNAL_NC_BOARD_WEBSITE_URL_MAX || 6);
const NC_BOARD_WEBSITE_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_NC_BOARD_WEBSITE_TIMEOUT_MS || 5000);

const STRICT_TRACKED_RE = /buffalo trace|blanton|eagle rare|weller|stagg|e\.?h\.?\s*taylor|colonel\s*taylor|old fitz|fitzgerald|willett|pappy|van winkle|blood oath|old carter|elmer t|rock hill|george t|william larue|thomas h|elijah craig\s+barrel proof|four roses\s+(limited|limited edition)|michter'?s\s+10/i;
const RELEASE_LANGUAGE_RE = /allocated|allocation|lottery|limited|bourbon|barrel|drop|specialty|special release|rare|whiskey|whisky|product search|inventory|stock|coming soon|release calendar/i;
const STRONG_RELEASE_LANGUAGE_RE = /allocated|allocation|lottery|limited|specialty|special release|bourbon blast|barrel pick|release calendar|drops?\b|raffle|rare/i;
const SOURCE_POLICY = 'Official/public online sources only. No community sightings, rumors, secondary forums, or user-submitted reports.';

const STATIC_BOARD_TARGETS = [
  { boardName: 'Wake County ABC Board', urls: ['https://wakeabc.com/search-our-inventory/', 'https://wakeabc.com/search-results/'], capability: 'store_inventory_search' },
  { boardName: 'Durham County ABC Board', urls: ['https://www.durhamabc.com/drops', 'https://www.durhamabc.com/news'], capability: 'board_drop_posts' },
  { boardName: 'Mecklenburg County ABC Board', urls: ['https://www.meckabc.com/store_operations/specialty_products_lottery.php', 'https://www.meckabc.com/products/index.php'], capability: 'lottery_and_product_search' },
  { boardName: 'High Point ABC Board', urls: ['https://www.highpointabc.com/products', 'https://www.highpointabc.com/pages/view-inventory'], capability: 'inventory_or_product_search_page' },
  { boardName: 'New Hanover County ABC Board', urls: ['https://www.newhanovercountyabc.com/bourbon-blast/', 'https://www.newhanovercountyabc.com/barrels/', 'https://www.newhanovercountyabc.com/lottery/', 'https://nh.abcgo.app/'], capability: 'board_release_notifications' },
  { boardName: 'Wayne County ABC Board', urls: ['https://wayneabc.com/allocation-policy/'], capability: 'allocation_policy' },
  { boardName: 'Weaverville ABC Board', urls: ['https://weaverville.ncabcboards.com/blog/', 'https://weaverville.ncabcboards.com/abc-policy-for-allocation-and-sale-of-special-liquors/'], capability: 'lottery_and_policy_posts' },
  { boardName: 'Concord ABC Board', urls: ['https://concordabcboard.com/preparing-for-bourbon-lottery/'], capability: 'lottery_page' }
];

const CANDIDATE_PATHS = [
  '/', '/products', '/product-search', '/inventory', '/search-our-inventory', '/search-results',
  '/allocation-policy', '/lottery', '/bourbon-blast', '/barrels', '/drops', '/news', '/announcements',
  '/specialty-products', '/limited-release', '/release-calendar', '/pages/view-inventory', '/blog', '/abc-policy-for-allocation-and-sale-of-special-liquors',
  '/store_operations/specialty_products_lottery.php', '/products/index.php', '/sitemap.xml'
];

function decodeHtml(text = '') {
  return String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function normalizeWebsite(website = '') {
  const raw = String(website || '').trim();
  if (!raw || /^n\/?a$/i.test(raw)) return null;
  const cleaned = raw.replace(/^http:\/\/https?:\/\//i, 'https://').replace(/\s+/g, '').replace(/\/$/, '');
  if (!cleaned || /@/.test(cleaned)) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/\.[a-z]{2,}/i.test(cleaned)) return `https://${cleaned}`;
  return null;
}

function withTimeout(ms = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function textFetch(url, options = {}) {
  const timeout = withTimeout(options.timeoutMs || 18000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      method: options.method || 'GET',
      body: options.body,
      signal: timeout.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (BourbonSignal NC official-source collector; +https://bourbonsignal.com)',
        accept: 'text/html,application/json,application/xml,text/xml,*/*',
        referer: options.referer || 'https://abc2.nc.gov/',
        ...(options.headers || {})
      }
    });
    return { ok: res.ok, status: res.status, url: res.url, contentType: res.headers.get('content-type') || '', text: await res.text() };
  } finally {
    timeout.done();
  }
}

async function safeTextFetch(url, options = {}) {
  try {
    return await textFetch(url, options);
  } catch (error) {
    return { ok: false, status: 0, url, contentType: '', text: '', error: error.name === 'AbortError' ? 'timeout' : error.message };
  }
}

async function readLatestJson(dir) {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    if (!files.length) return null;
    const file = path.join(dir, files[files.length - 1]);
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function tsSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function isoFromNcExtract(value) {
  const text = String(value || '').trim();
  if (!text) return new Date().toISOString();
  const normalized = text.replace(' ', 'T');
  const d = new Date(`${normalized}-04:00`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function strictTrackedProduct(name) {
  return STRICT_TRACKED_RE.test(String(name || ''));
}

function signalBase(config, sourceLabel, sourceUrl, rawName, bible, confidence = 0.72) {
  const match = bible.match(rawName);
  const record = match?.record || null;
  return {
    state: config.id,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: Math.max(confidence, match?.confidence || 0),
    fetchedAt: new Date().toISOString()
  };
}

function boardKey(boardName = '') {
  return String(boardName).toLowerCase().replace(/\s+abc\s+board$/i, '').replace(/\s+county$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function createBoardRecord(boardName, seed = {}) {
  return {
    boardName,
    website: seed.website || null,
    shipmentRows: 0,
    trackedShipmentRows: 0,
    trackedUnits: 0,
    capabilities: new Set(seed.capabilities || ['official_stock_shipped_data']),
    precisionLevel: 'board_listed',
    sourceUrls: new Set(seed.sourceUrls || []),
    officialPageReports: []
  };
}

function addCapability(board, capability) {
  if (capability) board.capabilities.add(capability);
}

function classifyBoard(board) {
  if ([...board.capabilities].some((cap) => /store_inventory_search|store_level/i.test(cap))) return 'store_inventory_search';
  if (board.trackedShipmentRows > 0) return 'board_shipment';
  if ([...board.capabilities].some((cap) => /lottery|drop|release|allocation/i.test(cap))) return 'board_release_policy';
  if (board.website) return 'board_website_watch';
  return 'board_listed';
}

function pageCapability(url, text = '', linkLabels = '') {
  const hay = `${url} ${text.slice(0, 3000)} ${linkLabels}`.toLowerCase();
  const caps = [];
  if (/inventory|product search|search our inventory|store inventory|in stock|stock status/i.test(hay)) caps.push('inventory_or_product_search_page');
  if (/lottery|raffle/i.test(hay)) caps.push('lottery_page');
  if (/allocated|allocation/i.test(hay)) caps.push('allocation_policy_page');
  if (/drops?\b|bourbon blast|release calendar|special release|limited release/i.test(hay)) caps.push('release_or_drop_page');
  if (/barrel pick|single barrel/i.test(hay)) caps.push('barrel_program_page');
  if (/news|announcement|blog|post/i.test(hay)) caps.push('news_or_announcement_page');
  return [...new Set(caps)];
}

function interestingLink(link) {
  const hay = `${link.href} ${link.label}`;
  if (!/^https?:/i.test(link.href)) return false;
  if (/facebook|instagram|twitter|x\.com|youtube|tiktok|reddit|discord/i.test(link.href)) return false;
  return /inventory|product|stock|allocated|allocation|lottery|drop|bourbon|barrel|special|limited|release|news|announcement/i.test(hay);
}

function candidateUrlsForBoard(board) {
  const urls = new Set();
  const staticTarget = STATIC_BOARD_TARGETS.find((target) => boardKey(target.boardName) === boardKey(board.boardName));
  for (const url of staticTarget?.urls || []) urls.add(url);
  if (board.website) {
    for (const p of CANDIDATE_PATHS) {
      try { urls.add(new URL(p, `${board.website}/`).toString()); } catch {}
    }
  }
  return [...urls];
}

function strictBottleMentions(text, bible) {
  const mentions = [];
  const hay = String(text || '');
  if (!STRICT_TRACKED_RE.test(hay)) return mentions;
  for (const record of bible.scanText(hay)) {
    if (strictTrackedProduct(record.canonical) || (record.aliases || []).some(strictTrackedProduct)) mentions.push(record);
  }
  return [...new Map(mentions.map((r) => [r.id, r])).values()];
}

async function collectBoardDirectory(config, roadblocks, dossier, boards) {
  const res = await safeTextFetch(NC_BOARD_LIST_URL, { timeoutMs: 45000 });
  if (!res.ok) {
    roadblocks.push({ state: config.id, source: 'NC ABC Board List', url: NC_BOARD_LIST_URL, status: res.status, error: res.error || res.text.slice(0, 300), nextRoute: 'Retry official board list page or inspect updated NC ABC board directory markup.' });
    return;
  }
  let parsed = 0;
  for (const match of res.text.matchAll(/<div class=["']row\s*["'][\s\S]*?(?=<div class=["']row\s*["']|<\/body>)/gi)) {
    const block = match[0];
    const nameRaw = stripHtml(block.match(/<b>\s*<a[^>]+href=["']\/Districts\/Board\/\d+["'][^>]*>([\s\S]*?)<\/a>\s*<\/b>/i)?.[1] || '');
    if (!nameRaw) continue;
    const boardName = nameRaw.replace(/\s+-\s+\d+\s*$/i, '').trim();
    const website = normalizeWebsite(block.match(/Website:\s*<a[^>]+href=["']([^"']+)["']/i)?.[1] || '');
    const board = boards.get(boardName) || createBoardRecord(boardName, { capabilities: ['official_board_directory'] });
    addCapability(board, 'official_board_directory');
    if (website) {
      board.website ||= website;
      board.sourceUrls.add(website);
      addCapability(board, 'official_board_website');
    }
    boards.set(boardName, board);
    parsed += 1;
  }
  dossier.boardDirectory = { sourceUrl: NC_BOARD_LIST_URL, parsedBoardCount: parsed, websiteCount: [...boards.values()].filter((b) => b.website).length, observedAt: new Date().toISOString() };
}

async function collectStockShipped(config, bible, signals, roadblocks, dossier, boards) {
  const res = await textFetch(NC_STOCK_SHIPPED_DATA_URL, { headers: { accept: 'application/json,*/*' }, referer: NC_STOCK_SHIPPED_PAGE_URL, timeoutMs: 45000 });
  if (!res.ok) {
    roadblocks.push({ state: config.id, source: 'NC ABC Stock Shipped Data', url: NC_STOCK_SHIPPED_DATA_URL, status: res.status, error: res.text.slice(0, 300), nextRoute: 'Retry official StockShippedData JSON endpoint or inspect browser network for changed route.' });
    return [];
  }
  const json = JSON.parse(res.text);
  const observedAt = isoFromNcExtract(json.metadata?.extractDatetime);
  for (const boardName of json.lookups?.boards || []) {
    if (!boards.has(boardName)) boards.set(boardName, createBoardRecord(boardName));
  }

  const trackedRows = [];
  for (const row of json.records || []) {
    const boardName = row.boardName || 'Unknown NC ABC Board';
    const board = boards.get(boardName) || createBoardRecord(boardName);
    board.shipmentRows += 1;
    board.website ||= normalizeWebsite(row.website);
    if (board.website) {
      addCapability(board, 'official_board_website');
      board.sourceUrls.add(board.website);
    }
    boards.set(boardName, board);

    if (!strictTrackedProduct(row.ProductName)) continue;
    const quantity = Number(row.NUMUNITS || 0) || 0;
    board.trackedShipmentRows += 1;
    board.trackedUnits += quantity;
    addCapability(board, 'tracked_board_shipments');
    addCapability(board, 'official_board_shipment_rows');

    const sourceUrl = row.item_id ? `https://abc2.nc.gov/Pricing/ViewItemDetails/${row.item_id}` : NC_STOCK_SHIPPED_PAGE_URL;
    const signal = {
      id: stableId([config.id, 'stock-shipped', row.NCcode, row.item_id, boardName, quantity, observedAt]),
      ...signalBase(config, 'NC ABC Stock Shipped Data', sourceUrl, row.ProductName, bible, 0.82),
      eventType: 'nc_board_shipment_snapshot',
      locationPrecision: 'board_county',
      locationName: boardName,
      county: boardName.replace(/\s+ABC\s+Board$/i, '').replace(/\s+County$/i, ''),
      quantity,
      observedAt,
      evidence: `NC ABC Stock Shipped Data reports ${quantity} unit(s) of ${row.ProductName} shipped to ${boardName}. This is board-level shipment intelligence from the official state feed; it does not prove a specific store shelf quantity.`,
      raw: { ...row, precisionCaveat: 'board shipment; exact store and shelf status unknown', extractDatetime: json.metadata?.extractDatetime }
    };
    trackedRows.push(signal);
    signals.push(signal);
  }

  dossier.stockShipped = {
    sourceUrl: NC_STOCK_SHIPPED_DATA_URL,
    observedAt,
    boardCount: boards.size,
    productCount: json.lookups?.products?.length || 0,
    recordCount: json.records?.length || 0,
    trackedSignalCount: trackedRows.length,
    strictProductPolicy: 'Only explicit tracked names are accepted for shipment rows to avoid false positives from loose bottle-name matching.'
  };
  await mkdir(NC_BOARD_HISTORY_DIR, { recursive: true });
  await writeFile(path.join(NC_BOARD_HISTORY_DIR, `${tsSlug(new Date())}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), observedAt, signals: trackedRows }, null, 2));
  return trackedRows;
}

function parseWarehouseRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr[^>]*id=["']StockItemDetails["'][\s\S]*?<\/tr>/gi)) {
    const rowHtml = match[0];
    const itemId = rowHtml.match(/item_id=["']?(\d+)/i)?.[1] || rowHtml.match(/ViewItemDetails\/(\d+)/i)?.[1] || null;
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decodeHtml(stripHtml(m[1])).replace(/\s+/g, ' ').trim());
    if (cells.length < 4) continue;
    rows.push({ ncCode: cells[0], productName: cells[1], listingType: cells[2], totalAvailable: Number(String(cells[3]).replace(/,/g, '')) || 0, size: cells[4] || null, casesPerPallet: Number(cells[5]) || null, supplier: cells[6] || null, supplierAllotment: Number(String(cells[7] || '').replace(/,/g, '')) || null, brokerName: cells[8] || null, itemId });
  }
  return rows;
}

function warehouseDelta(row, previousByCode) {
  const previous = previousByCode.get(row.ncCode);
  if (!previous) return { kind: row.totalAvailable > 0 ? 'new_tracked_warehouse_row' : 'first_seen_out_of_stock', previousQty: null, deltaQty: row.totalAvailable };
  const deltaQty = row.totalAvailable - Number(previous.totalAvailable || 0);
  if (deltaQty > 0) return { kind: 'warehouse_qty_increase', previousQty: previous.totalAvailable, deltaQty };
  if (deltaQty < 0) return { kind: 'warehouse_qty_decrease', previousQty: previous.totalAvailable, deltaQty };
  return { kind: 'warehouse_qty_unchanged', previousQty: previous.totalAvailable, deltaQty: 0 };
}

async function collectWarehouse(config, bible, signals, roadblocks, dossier) {
  const res = await textFetch(NC_WAREHOUSE_STOCK_URL, { timeoutMs: 45000 });
  if (!res.ok) {
    roadblocks.push({ state: config.id, source: 'NC ABC Warehouse Stock Status', url: NC_WAREHOUSE_STOCK_URL, status: res.status, error: res.text.slice(0, 300), nextRoute: 'Retry official Stocks page or inspect form/export endpoint.' });
    return [];
  }
  const rows = parseWarehouseRows(res.text);
  const previous = await readLatestJson(NC_WAREHOUSE_HISTORY_DIR);
  const previousByCode = new Map((previous?.rows || []).map((row) => [row.ncCode, row]));
  const trackedRows = rows.filter((row) => strictTrackedProduct(row.productName));
  const observedAt = new Date().toISOString();
  const warehouseSignals = [];

  for (const row of trackedRows) {
    const sourceUrl = row.itemId ? `https://abc2.nc.gov/Pricing/ViewItemDetails/${row.itemId}` : NC_WAREHOUSE_STOCK_URL;
    const delta = warehouseDelta(row, previousByCode);
    const signal = {
      id: stableId([config.id, 'warehouse-stock', row.ncCode, row.totalAvailable, row.itemId]),
      ...signalBase(config, 'NC ABC Warehouse Stock Status', sourceUrl, row.productName, bible, 0.74),
      eventType: row.totalAvailable > 0 ? 'nc_statewide_warehouse_stock' : 'nc_statewide_warehouse_out_of_stock',
      locationPrecision: 'board_warehouse',
      locationName: 'NC ABC state warehouse',
      warehouseQty: row.totalAvailable,
      quantity: row.totalAvailable,
      observedAt,
      evidence: `NC ABC warehouse stock page shows ${row.totalAvailable} unit(s) available statewide for ${row.productName}${delta.previousQty == null ? '' : ` (${delta.deltaQty >= 0 ? '+' : ''}${delta.deltaQty} since previous Bourbon Signal snapshot)`}. This is early-warning radar only; it does not identify receiving boards or shelf inventory.`,
      raw: { ...row, ...delta, precisionCaveat: 'state warehouse availability; no board/store assignment' }
    };
    warehouseSignals.push(signal);
    signals.push(signal);
  }

  const increases = warehouseSignals.filter((s) => s.raw?.deltaQty > 0).map((s) => ({ productName: s.rawName, ncCode: s.raw.ncCode, quantity: s.quantity, previousQty: s.raw.previousQty, deltaQty: s.raw.deltaQty }));
  dossier.warehouse = {
    sourceUrl: NC_WAREHOUSE_STOCK_URL,
    rowCount: rows.length,
    trackedRowCount: trackedRows.length,
    positiveTrackedRowCount: trackedRows.filter((row) => row.totalAvailable > 0).length,
    observedAt,
    increaseCount: increases.length,
    topIncreases: increases.sort((a, b) => b.deltaQty - a.deltaQty).slice(0, 25),
    updateNote: 'Official page states warehouse stock status is refreshed frequently; treat as statewide radar, not store inventory.'
  };
  await mkdir(NC_WAREHOUSE_HISTORY_DIR, { recursive: true });
  await writeFile(path.join(NC_WAREHOUSE_HISTORY_DIR, `${tsSlug(new Date())}.json`), JSON.stringify({ generatedAt: observedAt, sourceUrl: NC_WAREHOUSE_STOCK_URL, rows: trackedRows }, null, 2));
  return warehouseSignals;
}

async function discoverBoardPages(board) {
  const reports = [];
  const seedUrls = candidateUrlsForBoard(board);
  const homeUrls = seedUrls.filter((url) => /\/$/.test(new URL(url).pathname)).slice(0, 1);
  const homeResponses = await Promise.all(homeUrls.map((url) => safeTextFetch(url, { referer: board.website || url, timeoutMs: NC_BOARD_WEBSITE_TIMEOUT_MS })));
  const discovered = [];
  for (let i = 0; i < homeResponses.length; i += 1) {
    const res = homeResponses[i];
    if (res.ok) discovered.push(...extractLinks(res.text, res.url || homeUrls[i]).filter(interestingLink).map((link) => link.href));
  }

  const urls = [...new Set([...seedUrls, ...discovered])].slice(0, NC_BOARD_WEBSITE_URL_MAX);
  const responses = await Promise.all(urls.map((url) => safeTextFetch(url, { referer: board.website || url, timeoutMs: NC_BOARD_WEBSITE_TIMEOUT_MS })));
  for (let i = 0; i < responses.length; i += 1) {
    const url = urls[i];
    const res = responses[i];
    const text = stripHtml(res.text).replace(/\s+/g, ' ').trim();
    const links = res.ok ? extractLinks(res.text, res.url || url).filter(interestingLink).slice(0, 30) : [];
    const caps = res.ok ? pageCapability(url, text, links.map((l) => l.label).join(' ')) : [];
    if (res.ok || links.length) {
      reports.push({ boardName: board.boardName, url, finalUrl: res.url, ok: res.ok, status: res.status, bytes: res.text.length, contentType: res.contentType, capabilities: caps, releaseLanguage: res.ok && RELEASE_LANGUAGE_RE.test(text), strongReleaseLanguage: res.ok && STRONG_RELEASE_LANGUAGE_RE.test(text), interestingLinks: links.slice(0, 12), textSample: text.slice(0, 600), error: res.error || null });
    }
  }
  return reports;
}

async function collectBoardWebsiteWatch(config, bible, signals, roadblocks, dossier, boards) {
  const reports = [];
  const boardList = [...boards.values()]
    .filter((board) => board.website || STATIC_BOARD_TARGETS.some((target) => boardKey(target.boardName) === boardKey(board.boardName)))
    .sort((a, b) => {
      const aStatic = STATIC_BOARD_TARGETS.some((target) => boardKey(target.boardName) === boardKey(a.boardName)) ? 1 : 0;
      const bStatic = STATIC_BOARD_TARGETS.some((target) => boardKey(target.boardName) === boardKey(b.boardName)) ? 1 : 0;
      return bStatic - aStatic || b.trackedUnits - a.trackedUnits || a.boardName.localeCompare(b.boardName);
    })
    .slice(0, NC_BOARD_WEBSITE_MAX);

  const batchSize = 6;
  for (let i = 0; i < boardList.length; i += batchSize) {
    const batch = boardList.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((board) => discoverBoardPages(board)));
    for (let j = 0; j < results.length; j += 1) {
      const board = batch[j];
      const result = results[j];
      if (result.status !== 'fulfilled') {
        roadblocks.push({ state: config.id, source: `NC board website discovery - ${board.boardName}`, url: board.website, status: 0, error: result.reason?.message || String(result.reason), nextRoute: 'Retry with browser automation or inspect board site manually.' });
        continue;
      }
      for (const report of result.value) {
        reports.push(report);
        board.officialPageReports.push({ url: report.url, status: report.status, capabilities: report.capabilities, releaseLanguage: report.releaseLanguage, strongReleaseLanguage: report.strongReleaseLanguage, matchedBottles: [] });
        for (const capability of report.capabilities) addCapability(board, capability);
        const matched = strictBottleMentions(`${report.textSample} ${report.url}`, bible);
        board.officialPageReports[board.officialPageReports.length - 1].matchedBottles = matched.map((m) => m.canonical);
        if (report.strongReleaseLanguage) addCapability(board, 'official_release_language_found');

        if (!report.ok) continue;
        for (const record of matched.slice(0, 10)) {
          const inventoryLike = report.capabilities.some((cap) => /inventory|product_search/i.test(cap));
          signals.push({
            id: stableId([config.id, 'board-site-watch', board.boardName, report.finalUrl || report.url, record.id]),
            state: config.id,
            sourceLabel: `NC board website watch - ${board.boardName}`,
            sourceUrl: report.finalUrl || report.url,
            rawName: record.canonical,
            canonicalBottleId: record.id,
            canonicalName: record.canonical,
            confidence: inventoryLike ? 0.72 : 0.6,
            eventType: inventoryLike ? 'nc_board_inventory_page_match' : 'nc_board_release_page_match',
            locationPrecision: inventoryLike ? 'store_aggregate' : 'board_county',
            locationName: board.boardName,
            observedAt: new Date().toISOString(),
            evidence: `${board.boardName} official website page references ${record.canonical}. This is a board website intelligence signal; exact shipment/store status requires the specific board feed or state shipment data.`,
            raw: { url: report.finalUrl || report.url, capabilities: report.capabilities, precisionCaveat: 'board website page match' }
          });
        }
      }
    }
  }

  dossier.boardWebsiteWatch = reports.map(({ textSample, ...report }) => report);
}

function finalizeBoards(boards) {
  return [...boards.values()].map((board) => {
    board.precisionLevel = classifyBoard(board);
    return {
      boardName: board.boardName,
      website: board.website,
      shipmentRows: board.shipmentRows,
      trackedShipmentRows: board.trackedShipmentRows,
      trackedUnits: board.trackedUnits,
      capabilities: [...board.capabilities].filter(Boolean).sort(),
      precisionLevel: board.precisionLevel,
      sourceUrls: [...board.sourceUrls].filter(Boolean).slice(0, 30),
      officialPageReports: board.officialPageReports.slice(0, 30)
    };
  }).sort((a, b) => b.trackedUnits - a.trackedUnits || b.trackedShipmentRows - a.trackedShipmentRows || a.boardName.localeCompare(b.boardName));
}

function coverageSummary(boards) {
  const list = finalizeBoards(boards);
  const withWebsite = list.filter((b) => b.website).length;
  const withTrackedShipments = list.filter((b) => b.trackedShipmentRows > 0).length;
  const withReleasePages = list.filter((b) => b.capabilities.some((cap) => /release|drop|lottery|allocation/i.test(cap))).length;
  const withInventoryPages = list.filter((b) => b.capabilities.some((cap) => /inventory|product_search/i.test(cap))).length;
  return { boardCount: list.length, withWebsite, withTrackedShipments, withReleasePages, withInventoryPages, noWebsiteYet: list.filter((b) => !b.website).map((b) => b.boardName).slice(0, 50) };
}

export async function collectNorthCarolinaIntelligence(config, bible, collectWakeFn) {
  const signals = [];
  const roadblocks = [];
  const boards = new Map();
  const dossier = {
    generatedAt: new Date().toISOString(),
    sourcePolicy: SOURCE_POLICY,
    precisionModel: {
      store_level: 'specific store inventory when an official board exposes it',
      store_aggregate: 'official board product/inventory page reference, exact store may be unclear',
      board_county: 'official board shipment/release signal; exact store/shelf unknown',
      board_warehouse: 'statewide NC ABC warehouse radar; board/store unknown',
      statewide_catalog: 'catalog/listing context only'
    }
  };

  await collectBoardDirectory(config, roadblocks, dossier, boards);
  await collectStockShipped(config, bible, signals, roadblocks, dossier, boards);
  await collectWarehouse(config, bible, signals, roadblocks, dossier);
  await collectBoardWebsiteWatch(config, bible, signals, roadblocks, dossier, boards);

  if (collectWakeFn) {
    const wake = await collectWakeFn(config, bible);
    signals.push(...wake.signals);
    roadblocks.push(...wake.roadblocks);
    const wakeBoard = [...boards.values()].find((b) => /wake/i.test(b.boardName));
    if (wakeBoard) {
      addCapability(wakeBoard, 'store_inventory_search_attached');
      addCapability(wakeBoard, 'store_level_probe_attached');
      wakeBoard.precisionLevel = 'store_inventory_search';
    }
  }

  dossier.boards = finalizeBoards(boards);
  dossier.coverage = coverageSummary(boards);
  dossier.signalCounts = signals.reduce((acc, signal) => { acc[signal.eventType] = (acc[signal.eventType] || 0) + 1; return acc; }, {});
  dossier.roadblockCount = roadblocks.length;
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'nc-board-intelligence.json'), JSON.stringify(dossier, null, 2));

  const seen = new Map();
  for (const signal of signals) seen.set(signal.id, signal);
  return { signals: [...seen.values()], roadblocks };
}

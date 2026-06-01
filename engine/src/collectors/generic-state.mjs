import { findDocumentLinks, stableId, stripHtml, titleCase } from '../core/text.mjs';
import { fetchWithMeta, tryParseJson } from '../core/fetcher.mjs';
import { FALLBACK_HINTS } from '../fallback-hints.mjs';
import { collectPrecisionProbes } from './precision-probes.mjs';
import { LOCATION_PROFILES } from '../location-precision.mjs';
import { readFile } from 'node:fs/promises';

const SIGNAL_TERMS = [
  'bourbon', 'whiskey', 'whisky', 'allocated', 'limited', 'release', 'lottery', 'barrel', 'single barrel',
  'weller', 'blanton', 'buffalo trace', 'eagle rare', 'stagg', 'taylor', 'pappy', 'van winkle', 'michter',
  'elijah craig', 'old forester', 'king of kentucky', 'russell', 'four roses', 'booker', 'maker'
];

function classifySignal(source, response, text, matchedBottles, documentLinks) {
  const lower = text.toLowerCase();
  const hasInventory = /inventory|in stock|availability|available at|store locator|locations? carry|quantity|qty/i.test(text);
  const hasRelease = /allocated|limited release|lottery|drawing|monthly|quarterly|release program|barrel pick|special release/i.test(text);
  const priceDocumentCount = documentLinks.filter((link) => /price|spa|bailment|brand|label/i.test(`${link.href} ${link.label}`)).length;
  const licenseDocumentCount = documentLinks.filter((link) => /license|licensing|permit|applicant|wholesaler|shipper/i.test(`${link.href} ${link.label}`)).length;
  const hasPriceDocument = /price|spa|bailment|brand|label/i.test(text) || priceDocumentCount > 0;
  const hasLicenseDocument = /license|licensing|permit|applicant|wholesaler|shipper/i.test(text) || licenseDocumentCount > 0;
  const hasCatalog = /product|price|catalog|search|spirits|bourbon/i.test(text);

  if (!response.ok) return 'roadblock';
  if (matchedBottles.length > 0 && hasInventory) return 'bottle_inventory_signal';
  if (matchedBottles.length > 0 && hasRelease) return 'allocated_release_signal';
  if (matchedBottles.length > 0) return 'bottle_catalog_signal';
  if (documentLinks.length > 0 && hasRelease) return 'release_document_signal';
  if (documentLinks.length > 0 && hasLicenseDocument && licenseDocumentCount >= priceDocumentCount) return 'license_document_signal';
  if (documentLinks.length > 0 && hasPriceDocument) return 'product_price_document_signal';
  if (documentLinks.length > 0) return 'document_signal';
  if (hasInventory) return 'inventory_surface_signal';
  if (hasRelease) return 'release_surface_signal';
  if (hasCatalog) return 'catalog_surface_signal';
  return 'source_reachable_no_bourbon_signal';
}

function summarizeText(text, matchedBottles) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const interesting = sentences.filter((s) => SIGNAL_TERMS.some((term) => s.toLowerCase().includes(term))).slice(0, 6);
  const bottleLine = matchedBottles.slice(0, 8).map((b) => b.canonical).join(', ');
  return [
    bottleLine ? `Matched bottles: ${bottleLine}.` : '',
    ...interesting
  ].filter(Boolean).join(' ').slice(0, 1800);
}

function recordsFromJson(source, json, bible, stateId) {
  const rows = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : Array.isArray(json?.items) ? json.items : [];
  const records = [];
  for (const row of rows) {
    const values = Object.entries(row || {});
    const preferredKeys = ['im_desc', 'item_description', 'description', 'product_name', 'name', 'brand_name', 'brand', 'item'];
    let rawName = null;
    for (const key of preferredKeys) {
      if (typeof row[key] === 'string' && /bourbon|whiskey|whisky|weller|blanton|trace|eagle|stagg|taylor|michter|pappy|winkle|fitzgerald|booker|baker|barrell|bardstown|penelope|yellowstone|willett/i.test(row[key])) {
        rawName = row[key];
        break;
      }
    }
    if (!rawName) {
      const nameEntry = values.find(([key, value]) => /description|name|product|brand|item/i.test(key) && !/category/i.test(key) && typeof value === 'string' && /bourbon|whiskey|whisky|weller|blanton|trace|eagle|stagg|taylor|michter|pappy|winkle|fitzgerald|booker|baker|barrell|bardstown|penelope|yellowstone|willett/i.test(value));
      rawName = nameEntry?.[1] || null;
    }
    if (!rawName) continue;
    const rowCategory = String(row.category_name || row.category || '').toLowerCase();
    const focusedBottle = /bourbon|weller|blanton|eagle rare|stagg|taylor|michter|pappy|winkle|fitzgerald|booker|baker|barrell|bardstown|penelope|yellowstone|willett|bowman|handy|sazerac|parker|blood oath|king of kentucky|double eagle/i.test(rawName)
      || /bourbon/.test(rowCategory);
    if (!focusedBottle) continue;
    const match = bible.match(rawName);
    records.push({
      id: stableId([stateId, source.url, rawName, JSON.stringify(row).slice(0, 200)]),
      state: stateId,
      sourceUrl: source.url,
      sourceLabel: source.label,
      eventType: 'catalog_row',
      rawName,
      canonicalBottleId: match?.record.id || null,
      canonicalName: match?.record.canonical || titleCase(rawName),
      confidence: match?.confidence || 0.35,
      quantity: Number(row.quantity || row.qty || row.on_hand || row.inventory || 0) || null,
      price: Number(row.price || row.retail_price || row.bottle_retail || 0) || null,
      location: row.store || row.store_name || row.city || row.county || null,
      locationPrecision: row.store || row.store_name ? 'store_level' : row.county ? 'board_county' : row.city ? 'store_aggregate' : 'statewide_catalog',
      locationName: row.store || row.store_name || row.location || row.city || row.county || null,
      storeName: row.store || row.store_name || row.location || null,
      storeAddress: row.address || row.street || row.store_address || null,
      city: row.city || row.store_city || null,
      county: row.county || row.store_county || null,
      stateCode: row.state || row.state_code || stateId,
      raw: row
    });
  }
  return records.slice(0, 1000);
}

async function collectBrowserDiscoverySignals(config, bible) {
  const signals = [];
  const roadblocks = [];
  let discovery = null;
  try {
    discovery = JSON.parse(await readFile(`out/browser/${config.id}-browser-discovery.json`, 'utf8'));
  } catch {
    return { signals, roadblocks };
  }

  for (const page of discovery.pages || []) {
    const text = String(page.textSample || '');
    const lower = text.toLowerCase();
    if (/just a moment|checking your browser|cloudflare/i.test(text) && text.length < 1000) {
      roadblocks.push({
        state: config.id,
        source: `${page.source?.label || 'browser discovery'} rendered browser page`,
        url: page.url,
        status: 403,
        error: 'Browser-rendered page still showed an anti-bot/Cloudflare interstitial rather than useful product content.',
        nextRoute: 'Retry with longer interactive browser session, inspect challenge completion, or locate official downloadable/API sources.'
      });
      continue;
    }
    const matchedBottles = bible.scanText(text);
    const hasInventory = /available at|find in store|in stock|availability|store locator|stores?\b|inventory/i.test(text);
    const hasRelease = /allocated|limited release|lottery|drawing|highly allocated|special release/i.test(text);
    if (matchedBottles.length || hasInventory || hasRelease) {
      const eventType = hasInventory && matchedBottles.length ? 'browser_rendered_inventory_surface_signal'
        : hasRelease && matchedBottles.length ? 'browser_rendered_release_signal'
        : matchedBottles.length ? 'browser_rendered_catalog_signal'
        : hasInventory ? 'browser_rendered_inventory_surface_signal'
        : 'browser_rendered_release_surface_signal';
      signals.push({
        id: stableId([config.id, 'browser-discovery-page', page.url, eventType]),
        state: config.id,
        sourceUrl: page.url,
        sourceLabel: `${page.source?.label || config.label} rendered browser page`,
        eventType,
        canonicalBottleId: matchedBottles[0]?.id || null,
        canonicalName: matchedBottles[0]?.canonical || null,
        matchedBottleCount: matchedBottles.length,
        matchedBottles: matchedBottles.slice(0, 20).map((b) => ({ id: b.id, name: b.canonical, tier: b.tier })),
        readableSummary: text.slice(0, 1800),
        confidence: matchedBottles.length ? 0.72 : 0.46,
        locationPrecision: hasInventory ? 'store_aggregate' : hasRelease ? 'statewide_policy' : 'statewide_catalog',
        locationName: config.label,
        fetchedAt: discovery.generatedAt || new Date().toISOString(),
        raw: { browserDiscovery: true, title: page.title, textLength: page.textLength, endpointCandidateCount: page.apiResources?.length || 0, productLinkCount: page.productLinks?.length || 0 }
      });
    }

    const productLinks = (page.productLinks || [])
      .filter((link) => /bourbon|whiskey|weller|blanton|eagle rare|buffalo trace|stagg|taylor|1792|old fitz|elmer|michter|willett|yellowstone|smoke wagon|booker|baker|barrell|bomberger/i.test(`${link.text} ${link.href}`))
      .slice(0, 60);
    for (const link of productLinks) {
      const rawName = String(link.text || '').replace(/\$[0-9,.]+.*$/, '').replace(/\s+/g, ' ').trim();
      const match = bible.match(rawName || link.href);
      signals.push({
        id: stableId([config.id, 'browser-product-link', page.url, link.href, rawName]),
        state: config.id,
        sourceUrl: link.href,
        sourceLabel: `${page.source?.label || config.label} rendered product link`,
        eventType: 'browser_rendered_product_link',
        rawName: rawName || link.href,
        canonicalBottleId: match?.record.id || null,
        canonicalName: match?.record.canonical || titleCase(rawName || link.href),
        confidence: match?.confidence || 0.45,
        locationPrecision: 'statewide_catalog',
        locationName: config.label,
        fetchedAt: discovery.generatedAt || new Date().toISOString(),
        evidence: `Browser-rendered ${config.label} page exposed product/catalog link: ${rawName || link.href}.`,
        raw: { browserDiscovery: true, pageUrl: page.url, link }
      });
    }

    if (config.id === 'PA') {
      const productRows = text.match(/[A-Z][A-Za-z0-9'’\.\- ]{6,90}\s+(?:\d+(?:ML|L)|750ML|1\.75L).*?FIND IN STORE Available at \d+ stores(?: SHIPPING \d+ Available)?/gi) || [];
      for (const row of productRows.slice(0, 25)) {
        const name = row.replace(/\s+(?:\d+(?:ML|L)|750ML|1\.75L).*$/i, '').trim();
        const stores = Number(row.match(/Available at (\d+) stores/i)?.[1] || 0) || null;
        const shipping = Number(row.match(/SHIPPING (\d+) Available/i)?.[1] || 0) || null;
        const match = bible.match(name);
        signals.push({
          id: stableId([config.id, 'fwgs-browser-row', name, stores, shipping]),
          state: config.id,
          sourceUrl: page.url,
          sourceLabel: 'FWGS browser-rendered search result row',
          eventType: 'store_pickup_search_aggregate',
          rawName: name,
          canonicalBottleId: match?.record.id || null,
          canonicalName: match?.record.canonical || titleCase(name),
          confidence: Math.max(0.62, match?.confidence || 0.45),
          locationPrecision: 'store_aggregate',
          locationName: 'Pennsylvania FWGS statewide search',
          quantity: stores,
          warehouseQty: shipping,
          fetchedAt: discovery.generatedAt || new Date().toISOString(),
          evidence: `FWGS rendered search row reports ${stores ?? 'unknown'} stores and ${shipping ?? 'unknown'} shipping units for ${name}.`,
          raw: { browserDiscovery: true, row, stores, shipping }
        });
      }
    }
  }

  if (discovery.endpointCandidateCount) {
    signals.push({
      id: stableId([config.id, 'browser-endpoint-discovery', discovery.generatedAt, discovery.endpointCandidateCount]),
      state: config.id,
      sourceUrl: `out/browser/${config.id}-browser-discovery.json`,
      sourceLabel: `${config.label} browser/API discovery artifact`,
      eventType: 'browser_api_endpoint_discovery',
      canonicalBottleId: null,
      canonicalName: null,
      confidence: 0.4,
      locationPrecision: 'statewide_catalog',
      locationName: config.label,
      fetchedAt: discovery.generatedAt || new Date().toISOString(),
      evidence: `Browser discovery captured ${discovery.endpointCandidateCount} candidate network/API resources and ${discovery.productLinkCount || 0} product links for ${config.label}.`,
      raw: { browserDiscovery: true, endpointCandidates: (discovery.endpointCandidates || []).slice(0, 25) }
    });
  }
  return { signals, roadblocks };
}

export async function collectState(config, bible) {
  const startedAt = new Date().toISOString();
  const sourceReports = [];
  const signals = [];
  const roadblocks = [];

  for (const source of config.sources) {
    const response = await fetchWithMeta(source.url, { politeDelayMs: 300 });
    const contentIsJson = response.contentType.includes('json') || source.kind === 'json' || response.text.trim().startsWith('[') || response.text.trim().startsWith('{');
    const json = contentIsJson ? tryParseJson(response.text) : null;
    const text = json ? JSON.stringify(json).slice(0, 500000) : stripHtml(response.text);
    const matchedBottles = bible.scanText(text);
    const documentLinks = json ? [] : findDocumentLinks(response.text, response.url).slice(0, 30);
    const kind = classifySignal(source, response, text, matchedBottles, documentLinks);

    if (!response.ok) {
      roadblocks.push({
        state: config.id,
        source: source.label,
        url: source.url,
        status: response.status,
        error: response.error || response.statusText,
        nextRoute: 'Try browser-rendered extraction, inspect network/API calls, or use official downloadable reports if exposed.'
      });
    }

    const jsonRecords = json ? recordsFromJson(source, json, bible, config.id) : [];
    signals.push(...jsonRecords);

    if (matchedBottles.length || documentLinks.length || response.ok) {
      signals.push({
        id: stableId([config.id, source.url, kind, response.status]),
        state: config.id,
        sourceUrl: source.url,
        sourceLabel: source.label,
        eventType: kind,
        canonicalBottleId: matchedBottles[0]?.id || null,
        canonicalName: matchedBottles[0]?.canonical || null,
        matchedBottleCount: matchedBottles.length,
        matchedBottles: matchedBottles.slice(0, 20).map((b) => ({ id: b.id, name: b.canonical, tier: b.tier })),
        documentLinks,
        readableSummary: summarizeText(text, matchedBottles),
        confidence: kind === 'roadblock' ? 0 : matchedBottles.length ? 0.75 : documentLinks.length ? 0.55 : 0.35,
        locationPrecision: kind.includes('inventory') ? 'store_aggregate' : kind.includes('release') ? 'statewide_policy' : 'statewide_catalog',
        locationName: config.label,
        fetchedAt: new Date().toISOString()
      });
    }

    sourceReports.push({
      label: source.label,
      url: source.url,
      ok: response.ok,
      status: response.status,
      contentType: response.contentType,
      bytes: response.bytes,
      elapsedMs: response.elapsedMs,
      signalType: kind,
      matchedBottleCount: matchedBottles.length,
      pdfLinkCount: documentLinks.filter((link) => /\.pdf($|[?#])/i.test(link.href)).length,
      documentLinkCount: documentLinks.length,
      error: response.error
    });
  }

  for (const url of config.apiCandidates || []) {
    const response = await fetchWithMeta(url, { headers: { accept: 'application/json,*/*' }, politeDelayMs: 250 });
    const json = tryParseJson(response.text);
    const extracted = json ? recordsFromJson({ url, label: 'API candidate' }, json, bible, config.id) : [];
    if (!response.ok || !json) {
      roadblocks.push({
        state: config.id,
        source: 'API candidate',
        url,
        status: response.status,
        error: response.error || response.statusText || 'No parseable JSON returned',
        nextRoute: 'Inspect browser network traffic for current API route and required headers/session tokens.'
      });
    }
    signals.push(...extracted);
    sourceReports.push({
      label: 'API candidate', url, ok: response.ok, status: response.status, contentType: response.contentType,
      bytes: response.bytes, elapsedMs: response.elapsedMs, signalType: extracted.length ? 'api_catalog_rows' : 'api_candidate_no_rows',
      matchedBottleCount: extracted.length, pdfLinkCount: 0, error: response.error
    });
  }

  const fallbackHints = FALLBACK_HINTS[config.id] || [];
  for (const hint of fallbackHints) {
    const matchedBottles = bible.scanText(hint.text);
    const isDocumentHint = /document|pdf|price|spa|xlsx|license_report/i.test(`${hint.type} ${hint.url} ${hint.label}`);
    const hintDocumentLinks = isDocumentHint ? [{ href: hint.url, label: hint.label }] : [];
    signals.push({
      id: stableId([config.id, hint.url, hint.type, hint.text]),
      state: config.id,
      sourceUrl: hint.url,
      sourceLabel: hint.label,
      eventType: hint.type,
      canonicalBottleId: matchedBottles[0]?.id || null,
      canonicalName: matchedBottles[0]?.canonical || null,
      matchedBottleCount: matchedBottles.length,
      matchedBottles: matchedBottles.slice(0, 20).map((b) => ({ id: b.id, name: b.canonical, tier: b.tier })),
      documentLinks: hintDocumentLinks,
      readableSummary: hint.text,
      confidence: hint.type.includes('policy') || hint.type.includes('context') ? 0.5 : 0.65,
      locationPrecision: hint.type.includes('inventory') ? 'store_aggregate' : hint.type.includes('HAL') || hint.type.includes('allocated') ? 'board_county' : 'statewide_catalog',
      locationName: config.label,
      fetchedAt: new Date().toISOString(),
      fallback: true,
      nextRoute: hint.nextRoute
    });
    sourceReports.push({
      label: `${hint.label} (fallback)`,
      url: hint.url,
      ok: true,
      status: 200,
      contentType: 'search-index/fallback',
      bytes: hint.text.length,
      elapsedMs: 0,
      signalType: hint.type,
      matchedBottleCount: matchedBottles.length,
      pdfLinkCount: hintDocumentLinks.filter((link) => /\.pdf($|[?#])/i.test(link.href)).length,
      documentLinkCount: hintDocumentLinks.length,
      error: null,
      fallback: true
    });
  }

  const browserDiscovery = await collectBrowserDiscoverySignals(config, bible);
  signals.push(...browserDiscovery.signals);
  roadblocks.push(...browserDiscovery.roadblocks);
  for (const sig of browserDiscovery.signals) {
    sourceReports.push({
      label: `${sig.sourceLabel} (browser discovery)`,
      url: sig.sourceUrl,
      ok: true,
      status: 200,
      contentType: 'browser-discovery',
      bytes: JSON.stringify(sig.raw || {}).length,
      elapsedMs: 0,
      signalType: sig.eventType,
      matchedBottleCount: sig.canonicalBottleId ? 1 : sig.matchedBottleCount || 0,
      pdfLinkCount: 0,
      error: null,
      locationPrecision: sig.locationPrecision
    });
  }

  const precisionProbe = await collectPrecisionProbes(config, bible, signals);
  signals.push(...precisionProbe.signals);
  roadblocks.push(...precisionProbe.roadblocks);
  for (const sig of precisionProbe.signals) {
    sourceReports.push({
      label: `${sig.sourceLabel} (precision probe)`,
      url: sig.sourceUrl,
      ok: true,
      status: 200,
      contentType: 'precision-probe',
      bytes: JSON.stringify(sig.raw || {}).length,
      elapsedMs: 0,
      signalType: sig.eventType,
      matchedBottleCount: sig.canonicalBottleId ? 1 : 0,
      pdfLinkCount: 0,
      error: null,
      locationPrecision: sig.locationPrecision
    });
  }

  const dedupedSignals = [...new Map(signals.map((s) => [s.id, s])).values()];
  return {
    state: config.id,
    label: config.label,
    tier: config.tier,
    strategy: config.strategy,
    cadence: config.cadence,
    value: config.value,
    locationProfile: LOCATION_PROFILES[config.id] || null,
    startedAt,
    finishedAt: new Date().toISOString(),
    sources: sourceReports,
    signals: dedupedSignals,
    roadblocks,
    status: sourceReports.some((s) => s.ok && (s.matchedBottleCount > 0 || s.pdfLinkCount > 0 || s.documentLinkCount > 0)) ? 'useful' : sourceReports.some((s) => s.ok) ? 'reachable_needs_deeper_parser' : 'blocked'
  };
}

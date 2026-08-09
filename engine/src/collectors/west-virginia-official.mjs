import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { stableId } from '../core/text.mjs';

const DIRECTORY_SOURCE_URL = 'https://www.wvabca.com/licensesearch.aspx';
const BARREL_SOURCE_URL = 'https://abca.wv.gov/spirits/wv-bourbon-whiskey-barrel-picks';
const directory = JSON.parse(readFileSync(new URL('../../data/store-universe/WV.json', import.meta.url), 'utf8'));
const DIRECTORY_FRESHNESS_MS = 24 * 60 * 60_000;
const directoryStoreDigest = createHash('sha256').update(JSON.stringify(directory.stores)).digest('hex');
if (directoryStoreDigest !== directory.source?.storeDigest) {
  throw new Error('West Virginia ABCA directory snapshot failed its normalized-store digest contract.');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function htmlText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|li|h[1-6]|div|section|ul|ol)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&ndash;|&#8211;/giu, '–')
    .replace(/&mdash;|&#8212;/giu, '—')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n\s+/gu, '\n')
    .trim();
}

export function parseWestVirginiaBarrelSelections(html, {
  observedAt = new Date().toISOString(),
  currentYear = new Date(observedAt).getUTCFullYear(),
} = {}) {
  const rawHtml = String(html || '');
  const hasCompleteSectionEnd = /Ask your local retailer or call the Spirits Department for more information![\s\S]{0,300}<h[1-6][^>]*>\s*Corazon Single Barrel[\s\S]*?<\/h[1-6]>/iu.test(rawHtml);
  if (!hasCompleteSectionEnd) return [];
  const text = htmlText(html);
  const heading = /New\s+(\d{4})\s+discounts?\s+for\s+limited\s+barrel\s+selections?/iu.exec(text);
  if (!heading || Number(heading[1]) !== Number(currentYear)) return [];

  const start = heading.index + heading[0].length;
  const tail = text.slice(start);
  const boundary = /Ask your local retailer or call the Spirits Department for more information!/iu.exec(tail);
  if (!boundary) return [];
  const section = tail.slice(0, boundary.index);
  const rows = [];
  let sectionStockRows = 0;

  for (const line of section.split(/\n+/u)) {
    const match = /^\s*(\d{5})\s*-\s*(.+?)(?:\s*-\s*\$([\d,.]+))?\s*$/u.exec(line);
    if (!match) continue;
    sectionStockRows += 1;
    const productName = cleanText(match[2]).split(/\s*:\s*/u, 1)[0];
    if (!productName
      || /\b(?:rum|tequila|vodka|gin|cream|liqueur|ready[ -]to[ -]drink|rtd|cocktail|wine|beer|multipack|multi-pack|pack of \d+)\b/iu.test(productName)
      || /\b(?:50|100|200|375)\s*ml\b/iu.test(productName)
      || /\b\d+\s*(?:pk|pack)\b/iu.test(productName)) continue;
    const stockNumber = match[1];
    const price = match[3] ? Number(match[3].replace(/,/gu, '')) : null;
    rows.push({
      id: stableId(['WV', BARREL_SOURCE_URL, heading[1], stockNumber, productName]),
      state: 'WV',
      sourceUrl: BARREL_SOURCE_URL,
      sourceLabel: 'West Virginia ABCA current barrel selections',
      sourceRuntimeId: 'official:wv-abca-barrel-selections',
      eventType: 'barrel_pick_signal',
      stockNumber,
      productName,
      price: Number.isFinite(price) ? price : null,
      quantity: null,
      canonicalBottleId: null,
      canonicalName: null,
      matchedBottleCount: 0,
      matchedBottles: [],
      locationPrecision: 'statewide_catalog',
      locationName: 'West Virginia',
      sourceAvailabilityVerified: false,
      availabilityStatus: 'official_retailer_ordering_intelligence',
      availabilityLabel: 'Official barrel selection — not live shelf inventory',
      signalCategory: 'release_watch',
      signalLabel: 'Official barrel selection',
      inventorySemantics: 'Official retailer ordering intelligence; not live shelf inventory.',
      canAlertAsInventory: false,
      canAlertAsWatch: false,
      observedAt,
      fetchedAt: observedAt,
      stale: false,
      readableSummary: `${productName} is listed by West Virginia ABCA as a current barrel selection. Retailers may be able to order it; this does not confirm shelf stock at any store.`,
      raw: {
        officialStockNumber: stockNumber,
        officialSelectionYear: Number(heading[1]),
        officialPrice: Number.isFinite(price) ? price : null,
        notLiveInventory: true,
        sourceRuntimeNonAlertable: true,
      },
    });
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.stockNumber, row])).values()];
  return sectionStockRows >= 7 && uniqueRows.length >= 6 ? uniqueRows : [];
}

export function enrichWestVirginiaBarrelSelections(rows, bible) {
  return rows.map((row) => {
    const matches = bible?.scanText?.(row.productName) || [];
    return {
      ...row,
      canonicalBottleId: matches[0]?.id || null,
      canonicalName: matches[0]?.canonical || null,
      tier: matches[0]?.tier || null,
      matchedBottleCount: matches.length,
      matchedBottles: matches.slice(0, 20).map((bottle) => ({
        id: bottle.id,
        name: bottle.canonical,
        tier: bottle.tier,
      })),
    };
  });
}

export function westVirginiaDirectorySignals({ nowAt = new Date().toISOString() } = {}) {
  const capturedAt = directory.source.capturedAt;
  const ageMs = Date.parse(nowAt) - Date.parse(capturedAt);
  const stale = !Number.isFinite(ageMs) || ageMs < 0 || ageMs > DIRECTORY_FRESHNESS_MS;
  return directory.stores.map((store) => ({
    id: stableId(['WV', store.id, 'retailer_store_location']),
    state: 'WV',
    sourceUrl: DIRECTORY_SOURCE_URL,
    sourceLabel: 'West Virginia ABCA licensed-store directory',
    sourceRuntimeId: 'official-directory:wv-abca-active-retail-liquor-stores',
    eventType: 'retailer_store_location',
    canonicalBottleId: null,
    canonicalName: null,
    matchedBottleCount: 0,
    matchedBottles: [],
    locationPrecision: 'store_level',
    locationName: store.name,
    storeId: store.id,
    storeName: store.name,
    storeAddress: store.address,
    storeCity: store.city,
    storeState: 'WV',
    inventoryCapability: 'directory_only',
    sourceAvailabilityVerified: false,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    observedAt: capturedAt,
    fetchedAt: capturedAt,
    stale,
    readableSummary: `${store.name} appeared in the West Virginia ABCA active-license directory captured ${capturedAt.slice(0, 10)}. Store information does not confirm current bottle availability.`,
    raw: {
      officialLicenseNumber: store.licenseNumber,
      directoryOnly: true,
      searchable: true,
      sourceRuntimeNonAlertable: true,
      snapshotCapturedAt: capturedAt,
      sourceDigest: directory.source.sourceDigest,
      storeDigest: directory.source.storeDigest,
    },
  }));
}

export function westVirginiaDirectorySourceReport(signals) {
  return {
    sourceRuntimeId: 'official-directory:wv-abca-active-retail-liquor-stores',
    label: 'West Virginia ABCA active Retail Liquor Stores directory',
    url: DIRECTORY_SOURCE_URL,
    ok: signals.length === directory.storeCount && signals.length > 0,
    status: null,
    contentType: 'reviewed-official-directory-snapshot',
    bytes: JSON.stringify(directory).length,
    elapsedMs: 0,
    signalType: 'retailer_store_location',
    matchedBottleCount: 0,
    locationCount: signals.length,
    pdfLinkCount: 0,
    documentLinkCount: 0,
    error: null,
    directoryOnly: true,
    snapshotCapturedAt: directory.source.capturedAt,
    stale: signals.some((signal) => signal.stale === true),
    staticSnapshot: true,
  };
}

export const WEST_VIRGINIA_DIRECTORY_STORE_COUNT = directory.storeCount;

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BourbonBible } from './core/bible.mjs';
import { cityHiveUnsafeBottleMatchReason } from './collectors/safe-bottle-match.mjs';

export const OREGON_DAILY_INVENTORY_URL = 'https://www.olcc.state.or.us/pdfs/DailyStoreInventory.csv';
export const OREGON_INVENTORY_MAX_AGE_MS = 48 * 60 * 60_000;

export function isOregonDailyInventoryObservation(row, nowMs) {
  const age = nowMs - Date.parse(row?.observedAt);
  return row?.state === 'OR' && row.sourceUrl === OREGON_DAILY_INVENTORY_URL
    && row.locationPrecision === 'store_level' && Boolean(row.storeId && row.storeAddress && row.canonicalBottleId)
    && row.sourceAvailabilityVerified === true && row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && Number.isSafeInteger(row.quantity) && row.quantity > 0
    && Number.isFinite(age) && age >= 0 && age <= OREGON_INVENTORY_MAX_AGE_MS;
}

const DEFAULT_TERMS = [];
const VERIFIED_IDENTITY_CANDIDATES = new Map([
  ['EAGLE RARE S/B BOURBON', 'Eagle Rare 10 Year'],
  ["BLANTON'S SINGLE BARREL BB", "Blanton's Single Barrel"],
  ['BLANTON GOLD BOURBON', "Blanton's Gold"],
  ['WELLER 12 YR BOURBON', 'Weller 12 Year'],
  ['WELLER 107 ANTIQUE', 'Weller Antique 107'],
  ['WELLER FULL PROOF SBS', 'Weller Full Proof'],
]);
const VERIFIED_VARIANTS = new Map([
  ['Eagle Rare 10 Year', { proof: 90, sizes: ['750 ML', '1.75 L'] }],
  ["Blanton's Gold", { proof: 103, sizes: ['750 ML'] }],
  ['Weller 12 Year', { proof: 90, sizes: ['750 ML'] }],
  ['Weller Millennium', { proof: 99, sizes: ['750 ML'] }],
]);

export function oregonIdentityCandidate(description) {
  return VERIFIED_IDENTITY_CANDIDATES.get(String(description || '').trim().toUpperCase()) || String(description || '').trim();
}

export function resolveOregonBourbonIdentity(product, bible) {
  const candidate = product?.identityCandidate || oregonIdentityCandidate(product?.name);
  const match = bible?.match?.(candidate);
  const exactMethods = new Set(['exact-normalized-alias', 'exact-library-identity', 'exact-key', 'reviewed-retailer-library-identity']);
  if (!match?.record || !exactMethods.has(match.method)) return { status: 'unresolved_or_ambiguous', candidate, match: match || null };
  const identityMismatch = cityHiveUnsafeBottleMatchReason(candidate, match.record);
  if (identityMismatch) {
    const status = identityMismatch.startsWith('missing_age:') ? 'missing_age_modifier'
      : identityMismatch.startsWith('missing_modifier:') ? 'missing_identity_modifier'
        : 'identity_modifier_mismatch';
    return { status, candidate, match, identityMismatch };
  }
  const variant = VERIFIED_VARIANTS.get(match.record.canonical);
  const size = String(product?.size || '').replace(/\s+/g, ' ').trim();
  const proof = Number(product?.proof);
  if (!Number.isFinite(proof) || proof <= 0 || proof > 200 || !/^\d+(?:\.\d+)?\s*(?:ML|L)$/i.test(size)) {
    return { status: 'invalid_proof_or_size', candidate, match };
  }
  if (variant && (variant.proof !== proof || !variant.sizes.includes(size))) {
    return { status: 'proof_or_size_mismatch', candidate, match };
  }
  return { status: 'verified_exact', candidate, match };
}

function amount(value) {
  const n = Number(String(value || '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isStandardBourbonCandidate(description, category) {
  return /domestic whiskey/i.test(category) && !/rye|flavored|liqueur|cocktail/i.test(category);
}

function inventoryDateParts(value, reportDate) {
  const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!match) return null;
  let year = Number(match[3] || String(reportDate || '').match(/\d{4}$/)?.[0]);
  if (!year) return null;
  const month = Number(match[1]), day = Number(match[2]);
  let date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const report = new Date(reportDate);
  if (date > report && date.getUTCMonth() === 11 && report.getUTCMonth() === 0) {
    year -= 1;
    date = new Date(Date.UTC(year, month - 1, day));
  }
  return { year, month, day };
}

function inventoryIso(value, reportDate) {
  const parts = inventoryDateParts(value, reportDate);
  if (!parts) return null;
  // The CSV supplies a date only. UTC 08:00 is Pacific midnight in winter and
  // 07:00 during daylight time. Resolve the offset from the IANA timezone.
  const utcMidnight = Date.UTC(parts.year, parts.month - 1, parts.day);
  const probe = new Date(utcMidnight + 12 * 60 * 60_000);
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
  }).formatToParts(probe).map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute));
  const offset = localAsUtc - probe.getTime();
  return new Date(utcMidnight - offset).toISOString();
}

function createInventoryAccumulator({ terms, generatedAt, bible }) {
  const needles = terms.map((term) => String(term).trim().toLowerCase()).filter(Boolean);
  const products = new Map();
  let columns = null, reportDate = null, rowCount = 0, staleStoreRowCount = 0, unresolvedSourceRowCount = 0;
  const sourceStoreIds = new Set();
  const candidateProductKeys = new Set();
  const unresolvedProductKeys = new Map();
  const noteUnresolved = (key, details) => {
    const prior = unresolvedProductKeys.get(key) || { ...details, sourceRows: 0 };
    prior.sourceRows += 1;
    unresolvedProductKeys.set(key, prior);
  };
  const acceptRecord = (row) => {
    if (!columns) {
      if (row[0] !== 'OLCC Daily Store Inventory' || row[1] !== 'Report Date') throw new Error('Oregon OLCC daily inventory CSV header did not match the official report.');
      columns = new Map(row.map((name, index) => [name, index]));
      return;
    }
    const get = (name) => row[columns.get(name)] ?? '';
    const storeNo = get('Store Number').trim();
    if (!storeNo) return;
    rowCount += 1;
    sourceStoreIds.add(storeNo);
    reportDate ||= get('Report Date').trim() || null;
    const name = get('Description').trim();
    const category = get('Category').trim();
    if (!isStandardBourbonCandidate(name, category) || (needles.length && !needles.some((term) => name.toLowerCase().includes(term)))) return;
    const itemCode = get('Item Code').trim();
    const size = get('Size').trim().replace(/\s+/g, ' ');
    const proof = amount(get('Proof'));
    if (!/^\d+(?:\.\d+)?\s*(?:ML|L)$/i.test(size) || !proof || proof <= 0 || proof > 200 || !itemCode || !get('New Item Code').trim()) return;
    const sourceProductKey = `${itemCode}|${size}|${proof}|${name}`;
    candidateProductKeys.add(sourceProductKey);
    const identityCandidate = oregonIdentityCandidate(name);
    const bottleMatch = bible?.match?.(identityCandidate);
    const exactMethods = ['exact-normalized-alias', 'exact-library-identity', 'exact-key', 'reviewed-retailer-library-identity'];
    if (!bottleMatch?.record || !exactMethods.includes(bottleMatch.method)) {
      unresolvedSourceRowCount += 1;
      noteUnresolved(sourceProductKey, { itemCode, name, identityCandidate, size, proof, matchMethod: bottleMatch?.method || null, closestCanonical: bottleMatch?.record?.canonical || null, status: 'non_exact_or_ambiguous_match' });
      return;
    }
    const identityMismatch = cityHiveUnsafeBottleMatchReason(identityCandidate, bottleMatch.record);
    if (identityMismatch) {
      unresolvedSourceRowCount += 1;
      noteUnresolved(sourceProductKey, { itemCode, name, identityCandidate, size, proof, matchMethod: bottleMatch.method, closestCanonical: bottleMatch.record.canonical, status: identityMismatch });
      return;
    }
    const variant = VERIFIED_VARIANTS.get(bottleMatch.record.canonical);
    if (variant && (variant.proof !== proof || !variant.sizes.includes(size))) {
      unresolvedSourceRowCount += 1;
      noteUnresolved(sourceProductKey, { itemCode, name, identityCandidate, size, proof, matchMethod: bottleMatch?.method || null, closestCanonical: bottleMatch.record.canonical, status: 'proof_or_size_mismatch' });
      return;
    }
    const key = `${bottleMatch.record.id}|${size}|${proof}`;
    let product = products.get(key);
    if (!product) {
      product = {
        itemCode,
        sourceItemCodes: [],
        newItemCode: get('New Item Code').trim(),
        canonicalBottleId: bottleMatch.record.id,
        canonicalName: bottleMatch.record.canonical,
        rarityTier: bottleMatch.record.tier || 'unknown',
        name,
        identityCandidate,
        identityMatchMethod: bottleMatch.method,
        category,
        size,
        proof,
        bottlePrice: amount(get('Bottle Price')),
        casePrice: amount(get('Case Price')),
        searchTerm: needles.find((term) => name.toLowerCase().includes(term)) || null,
        pageUrl: OREGON_DAILY_INVENTORY_URL,
        storesById: new Map(),
        stores: [],
      };
      products.set(key, product);
    }
    if (!product.sourceItemCodes.includes(itemCode)) product.sourceItemCodes.push(itemCode);
    const rawQuantity = get('Quantity').trim();
    const quantity = rawQuantity === '' ? NaN : Number(rawQuantity);
    const inventoryDate = get('Inventory Date').trim();
    const inventoryObservedAt = inventoryIso(inventoryDate, reportDate);
    const reportParts = String(reportDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const reportTime = reportParts ? Date.UTC(Number(reportParts[3]), Number(reportParts[1]) - 1, Number(reportParts[2])) : NaN;
    const inventoryParts = inventoryDateParts(inventoryDate, reportDate);
    const inventoryDay = inventoryParts ? Date.UTC(inventoryParts.year, inventoryParts.month - 1, inventoryParts.day) : NaN;
    const ageDays = Number.isFinite(reportTime) && Number.isFinite(inventoryDay) ? Math.round((reportTime - inventoryDay) / 86_400_000) : Infinity;
    if (ageDays < 0 || ageDays > 7) { staleStoreRowCount += 1; return; }
    const store = {
      storeNo,
      storeName: get('Location').trim(),
      address: get('Street Address').trim(),
      city: get('City').trim(),
      zip: get('Zip Code').trim(),
      phone: get('Phone Number').trim(),
      hours: get('Hours Of Operation').trim(),
      quantity: Number.isInteger(quantity) && quantity >= 0 ? quantity : null,
      inventoryDate: inventoryDate || null,
      inventoryObservedAt,
      reportedAt: reportDate,
      distanceMiles: null,
      sourceItemCodes: [itemCode],
    };
    const existing = product.storesById.get(storeNo);
    if (existing) {
      if (!existing.sourceItemCodes.includes(itemCode)) existing.sourceItemCodes.push(itemCode);
      if (store.inventoryObservedAt > existing.inventoryObservedAt) {
        const sourceItemCodes = [...existing.sourceItemCodes];
        Object.assign(existing, store, { sourceItemCodes });
      }
    } else product.storesById.set(storeNo, store);
  };
  return {
    acceptRecord,
    finish() {
      if (!columns) throw new Error('Oregon OLCC daily inventory CSV was empty.');
      const reportParts = String(reportDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const generated = new Date(generatedAt);
      const reportDay = reportParts ? Date.UTC(Number(reportParts[3]), Number(reportParts[1]) - 1, Number(reportParts[2])) : NaN;
      const generatedDay = Number.isFinite(generated.getTime())
        ? Date.UTC(generated.getUTCFullYear(), generated.getUTCMonth(), generated.getUTCDate())
        : NaN;
      const reportAgeDays = Number.isFinite(reportDay) && Number.isFinite(generatedDay)
        ? Math.round((generatedDay - reportDay) / 86_400_000)
        : Infinity;
      if (reportAgeDays < 0 || reportAgeDays > 2) {
        throw new Error(`Oregon OLCC report date is missing, future-dated, or older than two calendar days (${reportDate || 'missing'}).`);
      }
      for (const product of products.values()) {
        product.stores = [...product.storesById.values()];
        delete product.storesById;
      }
      return {
        schemaVersion: 'bourbon-signal-or-product-availability-v1',
        generatedAt,
        sourceReportDate: reportDate,
        sourceUrl: OREGON_DAILY_INVENTORY_URL,
        sourceFreshnessPolicy: {
          reportDateMaximumAgeCalendarDays: 2,
          storeInventoryMaximumAgeCalendarDays: 7,
          inventoryDateTimeZone: 'America/Los_Angeles',
          inventoryDateHasClockTime: false,
          stockAvailabilityIsRestockEvent: false,
        },
        status: [...products.values()].some((product) => product.stores.length) ? 'ready' : 'no_store_rows',
        zip: null,
        terms: needles,
        productCount: products.size,
        storeRowCount: [...products.values()].reduce((sum, product) => sum + product.stores.length, 0),
        sourceRowCount: rowCount,
        sourceStoreCount: sourceStoreIds.size,
        candidateProductCount: candidateProductKeys.size,
        unresolvedProductCount: unresolvedProductKeys.size,
        unresolvedSourceRowCount,
        unresolvedExamples: [...unresolvedProductKeys.values()].sort((a, b) => b.sourceRows - a.sourceRows).slice(0, 100),
        staleStoreRowCount,
        canonicalBottleCount: new Set([...products.values()].map((product) => product.canonicalBottleId)).size,
        products: [...products.values()],
        errors: [],
      };
    }
  };
}

function pushCsvChunk(parser, text, final = false) {
  text = `${parser.pending || ''}${text}`;
  parser.pending = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (parser.quoted) {
      if ((char === '"' || char === '\r') && i === text.length - 1 && !final) { parser.pending = char; break; }
      if (char === '"' && text[i + 1] === '"') { parser.field += '"'; i += 1; }
      else if (char === '"') parser.quoted = false;
      else parser.field += char;
    } else if (char === '"' && i === text.length - 1 && !final) { parser.pending = char; break; }
    else if (char === '"') parser.quoted = true;
    else if (char === ',') { parser.row.push(parser.field); parser.field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && i === text.length - 1 && !final) { parser.pending = char; break; }
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      parser.row.push(parser.field); parser.field = '';
      if (parser.row.some((value) => value !== '')) parser.acceptRecord(parser.row);
      parser.row = [];
    } else parser.field += char;
  }
  if (final && (parser.field || parser.row.length)) {
    parser.row.push(parser.field);
    parser.acceptRecord(parser.row);
    parser.row = [];
    parser.field = '';
  }
}

export function parseOregonDailyInventoryCsv(text, { terms = DEFAULT_TERMS, generatedAt = new Date().toISOString(), bible } = {}) {
  const accumulator = createInventoryAccumulator({ terms, generatedAt, bible });
  const parser = { row: [], field: '', quoted: false, pending: '', acceptRecord: accumulator.acceptRecord };
  pushCsvChunk(parser, String(text || '').replace(/^\uFEFF/, ''), true);
  return accumulator.finish();
}

async function parseOregonDailyInventoryStream(stream, accumulator, maxBytes) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  const parser = { row: [], field: '', quoted: false, pending: '', acceptRecord: accumulator.acceptRecord };
  let firstChunk = true;
  let bytes = 0;
  const digest = createHash('sha256');
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error(`Oregon OLCC inventory exceeded 150 MB limit (${bytes}).`);
      digest.update(value);
      let text = decoder.decode(value, { stream: true });
      if (firstChunk) { text = text.replace(/^\uFEFF/, ''); firstChunk = false; }
      pushCsvChunk(parser, text);
    }
    pushCsvChunk(parser, decoder.decode(), true);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { bytes, sha256: digest.digest('hex') };
}

async function loadFullAppBible() {
  const pathName = path.resolve(process.env.OR_BIBLE_FILE || 'out/bourbon-bible.json');
  let data;
  try { data = JSON.parse(await readFile(pathName, 'utf8')); }
  catch { throw new Error('Full app Bible is unavailable. Run `npm run bible` before the Oregon inventory collector.'); }
  if (data.libraryCatalog?.mode !== 'live') {
    throw new Error('Oregon collection requires the full app Bible with a live library catalog; static/fallback Bible data cannot authorize inventory identities. Set OR_BIBLE_FILE to a current live Bible file.');
  }
  return {
    bible: new BourbonBible(data.records || []),
    metadata: {
      mode: data.libraryCatalog.mode,
      generatedAt: data.generatedAt || null,
      canonicalRecordCount: data.records?.length || 0,
      libraryIdentityCount: data.libraryCatalog.count || 0,
    },
  };
}

export async function collectOregonDailyInventory({ fetchImpl = fetch, terms = [], generatedAt = new Date().toISOString(), bible } = {}) {
  const loaded = bible ? { bible, metadata: { mode: 'injected_test_fixture', generatedAt: null, canonicalRecordCount: null, libraryIdentityCount: null } } : await loadFullAppBible();
  const response = await fetchImpl(OREGON_DAILY_INVENTORY_URL, {
    headers: { accept: 'text/csv', 'user-agent': 'BourbonSignal/1.0 (+https://bourbonsignal.com)' },
    signal: AbortSignal.timeout(120_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Oregon OLCC daily inventory returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > 150_000_000) throw new Error(`Oregon OLCC inventory exceeded 150 MB limit (${declaredLength}).`);
  if (!response.body) throw new Error('Oregon OLCC daily inventory response had no readable stream.');
  const fullBible = loaded.bible;
  const accumulator = createInventoryAccumulator({ terms, generatedAt, bible: fullBible });
  const sourceFingerprint = await parseOregonDailyInventoryStream(response.body, accumulator, 150_000_000);
  const payload = accumulator.finish();
  payload.sourceBytes = sourceFingerprint.bytes;
  payload.sourceSha256 = sourceFingerprint.sha256;
  payload.bible = loaded.metadata;
  const positiveStoreRows = payload.products.flatMap((product) => product.stores.filter((store) => store.quantity > 0 && store.address && store.city && store.zip));
  payload.positiveQuantityStoreRowCount = positiveStoreRows.length;
  payload.uniqueRecentPremiseCount = new Set(positiveStoreRows.map((store) => store.storeNo)).size;
  payload.exactProductCountByRarity = Object.fromEntries([...new Set(payload.products.map((product) => product.rarityTier))]
    .map((tier) => [tier, payload.products.filter((product) => product.rarityTier === tier).length]));
  return payload;
}

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignMississippiRegion } from '../mississippi-area.mjs';

const DEFAULT_SOURCE_URL = 'https://tap.dor.ms.gov/_/';
const PERMIT_RE = /^\d{6}$/u;
const AUTHORIZED_CAPTURE_MODE = 'operator_supplied_authorized_capture';

export const MISSISSIPPI_TAP_SOURCE_POLICY = Object.freeze({
  status: 'source_policy_blocked',
  robotsPolicy: 'User-agent: *\nDisallow: /',
  autonomousFetchAllowed: false,
  authorizedImportMode: AUTHORIZED_CAPTURE_MODE,
  futureRefreshRequirement: 'official_permitted_export_or_api',
});

function sourcePolicyBlockedError() {
  const error = new Error('source_policy_blocked: TAP robots.txt disallows autonomous requests; supply an operator-authorized capture or an official permitted export/API.');
  error.code = 'source_policy_blocked';
  return error;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&nbsp;/giu, ' ');
}

function plainText(value) {
  return decodeHtml(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function attribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return decodeHtml(tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'iu'))?.[2] || '');
}

function normalizedPermitRow(cells) {
  if (cells.length < 6) return null;
  const [dba, address, city, county, permitType, permitNumber] = cells.map(plainText);
  if (permitType !== 'Package Retailer' || !PERMIT_RE.test(permitNumber)) return null;
  return {
    dba,
    address,
    city,
    county,
    permitType,
    permitNumber,
    wholesaler: false,
    status: 'current',
  };
}

function safeNextPageUrl(html, pageUrl) {
  for (const match of String(html || '').matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/giu)) {
    const tag = match[0].slice(0, match[0].indexOf('>') + 1);
    if (!/\bnext\b/iu.test(plainText(match[0])) && !/\bnext\b/iu.test(attribute(tag, 'rel'))) continue;
    try {
      const url = new URL(attribute(tag, 'href'), pageUrl);
      const origin = new URL(pageUrl).origin;
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || url.hash) return null;
      return url.href;
    } catch {
      return null;
    }
  }
  return null;
}

export function parseMississippiTapPage(html, { pageUrl = DEFAULT_SOURCE_URL } = {}) {
  const rows = [];
  for (const match of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)].map((cell) => cell[1]);
    const row = normalizedPermitRow(cells);
    if (row) rows.push(row);
  }
  return {
    rows,
    nextPageUrl: safeNextPageUrl(html, pageUrl),
  };
}

function digestPages(pages) {
  const hash = createHash('sha256');
  for (const page of pages) {
    hash.update(String(page.url));
    hash.update('\0');
    hash.update(String(page.text));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function collectMississippiPackageDirectory({
  startUrl = DEFAULT_SOURCE_URL,
  expectedCount,
  maxPages = 10,
  maxBytesPerPage = 4 * 1024 * 1024,
  authorizedCapture,
  signal,
} = {}) {
  const usingAuthorizedCapture = authorizedCapture?.mode === AUTHORIZED_CAPTURE_MODE && Array.isArray(authorizedCapture?.pages);
  if (!usingAuthorizedCapture) throw sourcePolicyBlockedError();
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 25) throw new TypeError('maxPages must be between 1 and 25.');
  const suppliedPages = new Map();
  for (const page of authorizedCapture?.pages || []) {
    const url = new URL(String(page?.url || '')).href;
    if (suppliedPages.has(url)) throw new Error(`Authorized Mississippi TAP capture repeats ${url}.`);
    suppliedPages.set(url, String(page?.text || ''));
  }
  const visited = new Set();
  const pages = [];
  const rows = [];
  let pageUrl = new URL(startUrl).href;

  while (pageUrl) {
    signal?.throwIfAborted?.();
    if (visited.has(pageUrl)) throw new Error(`Mississippi TAP pagination repeated ${pageUrl}.`);
    if (visited.size >= maxPages) throw new Error(`Mississippi TAP pagination exceeded the ${maxPages}-page bound.`);
    visited.add(pageUrl);
    if (!suppliedPages.has(pageUrl)) throw new Error(`Authorized Mississippi TAP capture is missing ${pageUrl}.`);
    const text = suppliedPages.get(pageUrl);
    if (!text || Buffer.byteLength(text) > maxBytesPerPage) throw new Error(`Mississippi TAP page ${pageUrl} was empty or exceeded the byte bound.`);
    const parsed = parseMississippiTapPage(text, { pageUrl });
    if (!parsed.rows.length) throw new Error(`Mississippi TAP page ${pageUrl} contained no current Package Retailer rows.`);
    pages.push({
      url: pageUrl,
      text,
      rowCount: parsed.rows.length,
      digest: createHash('sha256').update(text).digest('hex'),
    });
    rows.push(...parsed.rows);
    pageUrl = parsed.nextPageUrl;
  }
  if (usingAuthorizedCapture && visited.size !== suppliedPages.size) throw new Error('Authorized Mississippi TAP capture contains unreferenced or out-of-chain pages.');

  const unique = new Map();
  for (const row of rows) {
    const existing = unique.get(row.permitNumber);
    if (existing && JSON.stringify(existing) !== JSON.stringify(row)) {
      throw new Error(`Mississippi TAP permit ${row.permitNumber} changed across pages.`);
    }
    unique.set(row.permitNumber, row);
  }
  const uniqueRows = [...unique.values()].sort((left, right) => left.permitNumber.localeCompare(right.permitNumber));
  if (expectedCount != null && uniqueRows.length !== Number(expectedCount)) {
    throw new Error(`Mississippi TAP directory expected ${expectedCount} unique current permits but collected ${uniqueRows.length}.`);
  }
  return {
    contractVersion: 'bourbon-signal/ms-package-directory-capture@1',
    generatedAt: authorizedCapture?.generatedAt || new Date().toISOString(),
    sourceUrl: startUrl,
    sourcePolicy: {
      status: MISSISSIPPI_TAP_SOURCE_POLICY.status,
      autonomousFetchAllowed: false,
      collectionMode: AUTHORIZED_CAPTURE_MODE,
    },
    permitType: 'Package Retailer',
    pageCount: pages.length,
    pages: pages.map(({ text: _text, ...page }) => page),
    rowCount: rows.length,
    uniquePermitCount: uniqueRows.length,
    responseDigest: digestPages(pages),
    rows: uniqueRows,
  };
}

function normalizedPlace(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function reviewedCounty(row, permitNumber, program) {
  const correction = (program?.officialDirectory?.countyCorrections || []).find((candidate) => (
    candidate.permitNumber === permitNumber
    || (candidate.city && String(candidate.city).toUpperCase() === String(row.city || '').toUpperCase())
  ));
  return normalizedPlace(row.county) || normalizedPlace(correction?.county);
}

export function importMississippiPackageDirectory(capture, program) {
  if (!capture || !Array.isArray(capture.rows)) throw new TypeError('Mississippi package-directory capture requires rows.');
  const expectedCount = Number(program?.officialDirectory?.reviewedCurrentPermitCount);
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) throw new TypeError('Mississippi program requires a reviewed current permit count.');
  if (capture.uniquePermitCount !== expectedCount || capture.rows.length !== expectedCount) {
    throw new Error(`Mississippi package-directory import expected ${expectedCount} current permits and received ${capture.rows.length}.`);
  }
  if (capture.permitType !== 'Package Retailer'
    || Number(capture.pageCount) !== Number(program?.officialDirectory?.reviewedPageCount)
    || Number(capture.rowCount) < expectedCount) {
    throw new Error('Mississippi package-directory import failed reviewed permit type, page-count, or row-count validation.');
  }
  const rowsDigest = createHash('sha256').update(JSON.stringify(capture.rows)).digest('hex');
  const expectedRowsDigest = String(program?.officialDirectory?.reviewedCaptureRowsSha256 || '');
  if (!/^[a-f0-9]{64}$/iu.test(expectedRowsDigest) || rowsDigest !== expectedRowsDigest) {
    throw new Error('Mississippi package-directory import digest does not match the reviewed operator-supplied capture.');
  }

  const ids = new Set();
  const stores = capture.rows.map((row) => {
    if (row.permitType !== 'Package Retailer' || !PERMIT_RE.test(String(row.permitNumber || ''))) {
      throw new Error(`Invalid Mississippi Package Retailer row ${JSON.stringify(row)}.`);
    }
    const permitNumber = row.permitNumber;
    const county = reviewedCounty(row, permitNumber, program);
    const regionId = assignMississippiRegion({ city: row.city, county });
    const id = `ms-permit-${permitNumber}`;
    if (ids.has(id)) throw new Error(`Duplicate canonical Mississippi permit ID ${id}.`);
    if (!regionId) throw new Error(`Mississippi permit ${permitNumber} has no reviewed region assignment.`);
    ids.add(id);
    return {
      id,
      state: 'MS',
      permitNumber,
      permitType: 'Package Retailer',
      status: 'current',
      dba: normalizedPlace(row.dba),
      legalName: normalizedPlace(row.dba),
      address: normalizedPlace(row.address),
      city: normalizedPlace(row.city),
      county,
      zip: String(row.address || '').match(/\bMS\s+(\d{5})(?:-\d{4})?\s*$/iu)?.[1] || null,
      regionId,
      sourceLayer: 'directory',
      disposition: 'directory_only',
      inventoryAlertable: false,
      watchAlertable: false,
      officialUrl: capture.sourceUrl || DEFAULT_SOURCE_URL,
      provenance: {
        source: 'Mississippi DOR TAP Search ABC Permits',
        sourceUrl: capture.sourceUrl || DEFAULT_SOURCE_URL,
        capturedAt: capture.generatedAt || null,
        responseDigest: capture.responseDigest || rowsDigest,
        pageCount: capture.pageCount,
      },
    };
  }).sort((left, right) => left.permitNumber.localeCompare(right.permitNumber));

  return {
    schemaVersion: 1,
    state: 'MS',
    generatedAt: capture.generatedAt || null,
    reviewedAt: program.reviewedAt,
    source: {
      label: 'Mississippi DOR TAP Search ABC Permits',
      url: capture.sourceUrl || DEFAULT_SOURCE_URL,
      permitType: 'Package Retailer',
      pageCount: capture.pageCount,
      responseDigest: capture.responseDigest || rowsDigest,
      captureDigest: capture.responseDigest || createHash('sha256').update(JSON.stringify(capture.rows)).digest('hex'),
    },
    reviewedCurrentPermitCount: expectedCount,
    stores,
    summary: {
      storeCount: stores.length,
      cityCount: Number(program.officialDirectory.reviewedCityCount),
      countyCount: Number(program.officialDirectory.reviewedCountyCount),
      regionCount: new Set(stores.map((store) => store.regionId)).size,
      inventoryAlertable: 0,
      watchAlertable: 0,
    },
  };
}

async function atomicJsonWrite(filePath, value) {
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, resolved);
}

export async function refreshMississippiPackageDirectory({
  lastGoodPath,
  outputPath,
  expectedCount,
  minimumRetainedRatio = 0.98,
  collect = () => collectMississippiPackageDirectory({ expectedCount }),
  program,
} = {}) {
  let previous = null;
  try { previous = JSON.parse(await readFile(lastGoodPath, 'utf8')); } catch { /* first successful capture establishes last-good */ }
  const candidate = await collect();
  const count = Number(candidate?.uniquePermitCount);
  if (!Number.isInteger(count) || count !== Number(expectedCount) || !Array.isArray(candidate?.rows) || candidate.rows.length !== count) {
    throw new Error(`Mississippi directory refresh is incomplete: expected ${expectedCount}, received ${count || 0}.`);
  }
  if (!/^[a-f0-9]{64}$/iu.test(String(candidate.responseDigest || ''))) {
    throw new Error('Mississippi directory refresh is missing a response digest.');
  }
  const previousCount = Number(previous?.uniquePermitCount || 0);
  if (previousCount > 0 && count < Math.ceil(previousCount * minimumRetainedRatio)) {
    throw new Error(`Mississippi directory refresh shrink from ${previousCount} to ${count} was rejected.`);
  }
  const output = program ? importMississippiPackageDirectory(candidate, program) : candidate;
  await atomicJsonWrite(outputPath, output);
  await atomicJsonWrite(lastGoodPath, candidate);
  return program ? { capture: candidate, universe: output } : candidate;
}

async function main() {
  const value = (flag, fallback = null) => {
    const inline = process.argv.find((item) => item.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1);
    const index = process.argv.indexOf(flag);
    return index >= 0 ? process.argv[index + 1] : fallback;
  };
  const capturePath = value('--capture');
  const programPath = value('--program', path.resolve('..', 'src', 'config', 'mississippi-program.json'));
  const outputPath = value('--out', path.resolve('data', 'store-universe', 'MS.json'));
  const program = await readFile(path.resolve(programPath), 'utf8').then(JSON.parse);
  if (capturePath) {
    const capture = await readFile(path.resolve(capturePath), 'utf8').then(JSON.parse);
    const universe = importMississippiPackageDirectory(capture, program);
    await atomicJsonWrite(outputPath, universe);
    console.log(`Wrote ${universe.stores.length} reviewed Mississippi package retailers to ${outputPath}.`);
    return;
  }
  const lastGoodPath = value('--last-good', path.resolve('out', 'directory', 'MS-last-good.json'));
  const result = await refreshMississippiPackageDirectory({
    lastGoodPath,
    outputPath,
    expectedCount: program.officialDirectory.reviewedCurrentPermitCount,
    minimumRetainedRatio: 0.98,
    program,
  });
  console.log(`Refreshed ${result.universe.stores.length} reviewed Mississippi package retailers to ${outputPath}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

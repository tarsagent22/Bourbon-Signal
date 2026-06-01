import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableId } from './core/text.mjs';

const OUT_FILE = path.resolve('out/location-bible-official.json');
const USER_AGENT = 'BourbonSignalLocationBible/0.1 (+https://bourbonsignal.com)';

const SOURCES = [
  {
    id: 'VA_ARCGIS', state: 'VA', source: 'Virginia ABC stores ArcGIS', sourceUrl: 'https://vgin.vdem.virginia.gov/datasets/virginia-abc-stores/',
    url: "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Landmarks/FeatureServer/1/query?where=UPPER(LandmkName)%20LIKE%20%27%25ABC%25%27&outFields=*&returnGeometry=false&f=json",
    parser: parseVirginiaArcgis
  },
  {
    id: 'OR_ARCGIS', state: 'OR', source: 'Oregon OLCC liquor stores ArcGIS', sourceUrl: 'https://www.oregon.gov/olcc/liquorstores/pages/liquor-store-map.aspx',
    url: 'https://services.arcgis.com/uUvqNMGPm7axC2dD/arcgis/rest/services/Liquor_Stores_app_view/FeatureServer/1/query?where=1%3D1&outFields=*&returnGeometry=false&f=json',
    parser: parseOregonArcgis
  },
  {
    id: 'UT_ARCGIS', state: 'UT', source: 'Utah DABS liquor stores ArcGIS', sourceUrl: 'https://gis.utah.gov/products/sgid/society/liquor-stores/',
    url: 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahLiquorStores/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json',
    parser: parseUtahArcgis
  },
  {
    id: 'ME_AGENCIES', state: 'ME', source: 'Maine active agency liquor resellers', sourceUrl: 'https://www.maine.gov/dafs/bablo/active_liquor/active_reseller_licenses.htm',
    url: 'https://www.maine.gov/dafs/bablo/active_liquor/active_reseller_licenses.htm',
    parser: parseMaineAgencies
  },
  {
    id: 'MT_AGENCIES', state: 'MT', source: 'Montana agency liquor stores', sourceUrl: 'https://revenue.mt.gov/card/alcoholic-beverages/agency-liquor-stores/list',
    url: 'https://revenue.mt.gov/card/alcoholic-beverages/agency-liquor-stores/list',
    parser: parseMontanaAgencies
  },
  {
    id: 'AL_STORES', state: 'AL', source: 'Alabama ABC store locator', sourceUrl: 'https://alabcboard.gov/store-locator',
    url: 'https://alabcboard.gov/store-locator',
    parser: parseAlabamaStores
  },
  {
    id: 'VT_OUTLETS', state: 'VT', source: 'Vermont DLC outlet text list', sourceUrl: 'https://liquorcontrol.vermont.gov/sites/dlc/files/documents/Downloads/outlets.txt',
    url: 'https://liquorcontrol.vermont.gov/sites/dlc/files/documents/Downloads/outlets.txt',
    parser: parseVermontOutlets
  }
];

const NC_STORE_LOCATOR_URL = 'https://abc2.nc.gov/Search/ABCStoreLocator';
const NC_STORE_SEARCH_URL = 'https://abc2.nc.gov/Search/StoreSearch';

function clean(value) {
  if (value == null) return null;
  const text = String(value).replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

function stripHtml(value) {
  return clean(String(value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function makeLocation(input) {
  const type = input.type || 'store';
  const state = clean(input.state);
  const name = clean(input.name);
  const address = clean(input.address);
  const city = clean(input.city);
  const county = clean(input.county);
  const id = stableId(['official-location', state, type, name, address, city, county, input.source]);
  return {
    id,
    state,
    type,
    locationType: type,
    name,
    address,
    city,
    county,
    zip: clean(input.zip),
    lat: number(input.lat),
    lng: number(input.lng),
    precision: input.precision || 'store_level',
    source: clean(input.source),
    sourceUrl: clean(input.sourceUrl),
    inventoryCapability: input.inventoryCapability || 'store_level',
    searchable: true,
    collectorAttached: false,
    hasSignals: false,
    signalCount: 0,
    lastSignalAt: null,
    lastVerifiedAt: input.lastVerifiedAt || new Date().toISOString(),
    notes: clean(input.notes)
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: '*/*' }, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function postForm(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,*/*',
        referer: NC_STORE_LOCATOR_URL,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function parseFeatures(text) {
  const json = JSON.parse(text);
  return Array.isArray(json.features) ? json.features : [];
}

function parseVirginiaArcgis(text, source) {
  return parseFeatures(text).map(({ attributes: a }) => makeLocation({
    state: 'VA', type: 'store', name: a.LandmkName, address: a.Address, city: a.City, county: a.FIPSname, zip: a.Zip,
    lat: a.Y, lng: a.X, source: source.source, sourceUrl: source.sourceUrl,
    notes: `Official Virginia ABC store point${a.Phone && a.Phone !== '-' ? `; phone ${a.Phone}` : ''}.`
  })).filter((l) => l.name && /abc/i.test(l.name));
}

function parseOregonArcgis(text, source) {
  return parseFeatures(text).map(({ attributes: a }) => makeLocation({
    state: 'OR', type: 'store', name: a.name || (a.Store_Numb ? `OLCC Store ${a.Store_Numb}` : null), address: a.Store_Addr, city: a.City,
    lat: a.latitude || a.Latitude, lng: a.longitude || a.Longitude, source: source.source, sourceUrl: source.sourceUrl,
    notes: [a.weekday ? `Weekday hours: ${a.weekday}` : null, a.sunday ? `Sunday: ${a.sunday}` : null].filter(Boolean).join('; ')
  })).filter((l) => l.name || l.address);
}

function parseUtahArcgis(text, source) {
  return parseFeatures(text).map(({ attributes: a }) => makeLocation({
    state: 'UT', type: 'store', name: a.NAME || (a.STORENUMBER ? `DABS Store ${a.STORENUMBER}` : a.TYPE), address: a.ADDRESS, city: a.CITY, county: a.COUNTY, zip: a.ZIP,
    lat: a.LAT, lng: a.LONG, source: source.source, sourceUrl: source.sourceUrl,
    notes: [a.TYPE, a.PHONE ? `Phone ${a.PHONE}` : null].filter(Boolean).join('; ')
  })).filter((l) => l.address || l.name);
}

function parseTableRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => stripHtml(c[1])))
    .filter((cells) => cells.length >= 3 && !cells.some((cell) => /^town$|^trade name$|^address$/i.test(cell || '')));
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parseOptions(html, selectName) {
  const select = html.match(new RegExp(`<select[^>]+name=["']${selectName}["'][\\s\\S]*?<\\/select>`, 'i'))?.[0] || '';
  return [...select.matchAll(/<option\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)]
    .map((m) => ({ value: clean(m[1]), label: stripHtml(m[2]) }))
    .filter((option) => option.value && option.label && !/^select /i.test(option.label));
}

function parseNorthCarolinaStores(html, board) {
  return [...html.matchAll(/<div class="row p-1 list-generic"[\s\S]*?<div class="col-2">/gi)].map((m) => {
    const block = m[0];
    const map = decodeHtml(block.match(/maps\?q=([^"']+)/i)?.[1] || '').replace(/\+/g, ' ');
    const details = [...block.matchAll(/<div>([\s\S]*?)<\/div>/gi)].map((d) => stripHtml(d[1])).filter(Boolean);
    const address = details[0] || clean(map.split(',').slice(0, -2).join(', '));
    const cityStateZip = details[1] || '';
    const cityMatch = cityStateZip.match(/^(.+?)\s+NC,?\s*(\d{5})/i) || map.match(/,\s*([^,]+),\s*NC\s+(\d{5})/i);
    const phone = block.match(/<b>Phone:\s*<\/b>\s*([^<]+)/i)?.[1];
    const hours = block.match(/<b>Hours:\s*<\/b>\s*([^<]+)/i)?.[1];
    return makeLocation({
      state: 'NC',
      type: 'store',
      name: `${board.label.replace(/\s+ABC Board\s*$/i, '')} ABC Store`,
      address,
      city: cityMatch?.[1],
      zip: cityMatch?.[2],
      source: 'NC ABC Commission store locator',
      sourceUrl: NC_STORE_LOCATOR_URL,
      inventoryCapability: /wake/i.test(board.label) ? 'store_level_partial' : 'board_store_locator_only',
      precision: 'store_level',
      notes: [
        `Official NC ABC store locator row for ${board.label} (board id ${board.value}).`,
        phone ? `Phone ${clean(phone)}` : null,
        hours ? `Hours ${clean(hours)}` : null,
        /wake/i.test(board.label) ? 'Wake has a product inventory probe attached; most NC boards do not expose public store-level inventory through this locator.' : null
      ].filter(Boolean).join(' ')
    });
  }).filter((l) => l.address && l.city);
}

async function collectNorthCarolinaOfficialLocations() {
  const locatorHtml = await fetchText(NC_STORE_LOCATOR_URL);
  const boards = parseOptions(locatorHtml, 'StoreLocatorBoard');
  const locations = boards.map((board) => makeLocation({
    state: 'NC',
    type: 'county_board',
    name: board.label,
    source: 'NC ABC Commission board list',
    sourceUrl: NC_STORE_LOCATOR_URL,
    inventoryCapability: /wake/i.test(board.label) ? 'store_level_partial' : 'county_board_watch',
    precision: 'county_board',
    notes: `Official NC ABC board option id ${board.value}. Store locator is available; public bottle inventory varies by board.`
  }));

  let failures = 0;
  const batchSize = 12;
  for (let i = 0; i < boards.length; i += batchSize) {
    const batch = boards.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(async (board) => {
      const html = await postForm(NC_STORE_SEARCH_URL, { StoreLocatorCity: '', StoreLocatorZipCode: '', StoreLocatorMiles: '10', StoreLocatorBoard: board.value });
      return { board, stores: parseNorthCarolinaStores(html, board) };
    }));
    for (const result of results) {
      if (result.status === 'fulfilled') locations.push(...result.value.stores);
      else {
        failures += 1;
        console.warn(`NC board store locator failed - ${result.reason?.message || result.reason}`);
      }
    }
  }

  return { locations, report: { id: 'NC_ABC_STORE_LOCATOR', state: 'NC', status: failures ? 'partial' : 'ok', count: locations.length, boards: boards.length, failures, sourceUrl: NC_STORE_LOCATOR_URL } };
}

function parseMaineAgencies(html, source) {
  return parseTableRows(html).map((cells) => makeLocation({
    state: 'ME', type: 'agency_store', city: cells[0], name: cells[1], address: cells[2],
    source: source.source, sourceUrl: source.sourceUrl, inventoryCapability: 'agency_store', precision: 'agency_store',
    notes: cells[3] ? `Phone ${cells[3]}` : 'Official active agency liquor reseller.'
  })).filter((l) => l.name && l.address);
}

function parseMontanaAgencies(html, source) {
  const rows = parseTableRows(html);
  return rows.map((cells) => {
    const joined = cells.join(' | ');
    return makeLocation({
      state: 'MT', type: 'agency_store', name: cells[0], address: cells[1], city: cells[2],
      source: source.source, sourceUrl: source.sourceUrl, inventoryCapability: 'agency_store', precision: 'agency_store',
      notes: `Official Montana agency store row: ${joined.slice(0, 220)}`
    });
  }).filter((l) => l.name && (l.address || l.city));
}

function parseAlabamaStores(html, source) {
  const blocks = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const storeNo = block.match(/<a href="\/([0-9]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i)?.[2];
    const lat = block.match(/property="latitude" content="([^"]+)"/i)?.[1];
    const lng = block.match(/property="longitude" content="([^"]+)"/i)?.[1];
    const line1 = stripHtml(block.match(/class="address-line1">([\s\S]*?)<\/span>/i)?.[1]);
    const line2 = stripHtml(block.match(/class="address-line2">([\s\S]*?)<\/span>/i)?.[1]);
    const city = stripHtml(block.match(/class="locality">([\s\S]*?)<\/span>/i)?.[1]);
    const zip = stripHtml(block.match(/class="postal-code">([\s\S]*?)<\/span>/i)?.[1]);
    const phone = stripHtml(block.match(/href="tel:[^"]+">([\s\S]*?)<\/a>/i)?.[1]);
    return makeLocation({
      state: 'AL',
      type: 'store',
      name: storeNo ? `Alabama ABC Store ${storeNo}` : 'Alabama ABC Store',
      address: [line1, line2].filter(Boolean).join(', '),
      city,
      zip,
      lat,
      lng,
      source: source.source,
      sourceUrl: source.sourceUrl,
      notes: phone ? `Phone ${phone}` : 'Official Alabama ABC store locator row.'
    });
  }).filter((l) => l.address || l.city);
}

function parseVermontOutlets(text, source) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0]?.split(/\t|,/).map((h) => h.toLowerCase()) || [];
  const records = [];
  for (const line of lines.slice(1)) {
    const cells = line.includes('\t') ? line.split('\t') : line.split(',');
    const get = (...names) => {
      for (const name of names) {
        const index = header.findIndex((h) => h.includes(name));
        if (index >= 0) return cells[index];
      }
      return null;
    };
    records.push(makeLocation({
      state: 'VT', type: 'agency_store', name: get('name','outlet'), address: get('address','street'), city: get('city','town'), zip: get('zip'),
      source: source.source, sourceUrl: source.sourceUrl, inventoryCapability: 'agency_store', precision: 'agency_store',
      notes: 'Official Vermont DLC outlet row.'
    }));
  }
  return records.filter((l) => l.name && (l.address || l.city));
}

async function main() {
  const all = [];
  const sourceReports = [];
  try {
    const nc = await collectNorthCarolinaOfficialLocations();
    all.push(...nc.locations);
    sourceReports.push(nc.report);
    console.log(`NC_ABC_STORE_LOCATOR: ${nc.locations.length} locations (${nc.report.boards} boards, ${nc.report.failures} failures)`);
  } catch (error) {
    sourceReports.push({ id: 'NC_ABC_STORE_LOCATOR', state: 'NC', status: 'failed', error: error.message, sourceUrl: NC_STORE_LOCATOR_URL });
    console.warn(`NC_ABC_STORE_LOCATOR: failed - ${error.message}`);
  }

  for (const source of SOURCES) {
    try {
      const text = await fetchText(source.url);
      const records = source.parser(text, source);
      all.push(...records);
      sourceReports.push({ id: source.id, state: source.state, status: 'ok', count: records.length, sourceUrl: source.sourceUrl });
      console.log(`${source.id}: ${records.length} locations`);
    } catch (error) {
      sourceReports.push({ id: source.id, state: source.state, status: 'failed', error: error.message, sourceUrl: source.sourceUrl });
      console.warn(`${source.id}: failed - ${error.message}`);
    }
  }

  const byId = new Map();
  for (const location of all) if (location.id && !byId.has(location.id)) byId.set(location.id, location);
  const locations = [...byId.values()].sort((a, b) => String(a.state).localeCompare(String(b.state)) || String(a.name).localeCompare(String(b.name)));
  const payload = { generatedAt: new Date().toISOString(), count: locations.length, sourceReports, locations };
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${locations.length} official locations -> ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

import { stableId } from './core/text.mjs';
import { STATE_SOURCES } from './state-sources.mjs';

const NC_COUNTIES = [
  'Alamance','Alexander','Alleghany','Anson','Ashe','Avery','Beaufort','Bertie','Bladen','Brunswick','Buncombe','Burke','Cabarrus','Caldwell','Camden','Carteret','Caswell','Catawba','Chatham','Cherokee','Chowan','Clay','Cleveland','Columbus','Craven','Cumberland','Currituck','Dare','Davidson','Davie','Duplin','Durham','Edgecombe','Forsyth','Franklin','Gaston','Gates','Graham','Granville','Greene','Guilford','Halifax','Harnett','Haywood','Henderson','Hertford','Hoke','Hyde','Iredell','Jackson','Johnston','Jones','Lee','Lenoir','Lincoln','Macon','Madison','Martin','McDowell','Mecklenburg','Mitchell','Montgomery','Moore','Nash','New Hanover','Northampton','Onslow','Orange','Pamlico','Pasquotank','Pender','Perquimans','Person','Pitt','Polk','Randolph','Richmond','Robeson','Rockingham','Rowan','Rutherford','Sampson','Scotland','Stanly','Stokes','Surry','Swain','Transylvania','Tyrrell','Union','Vance','Wake','Warren','Washington','Watauga','Wayne','Wilkes','Wilson','Yadkin','Yancey'
];

const STATEWIDE_LOCATION_SEEDS = [
  { state: 'OH', name: 'Ohio OHLQ', type: 'state_board', precision: 'store_level', sourceUrl: 'https://www.ohlq.com/store-locator', source: 'OHLQ store locator and availability map', notes: 'State-controlled OHLQ locations; site can already attach OHLQ store-level hits when the product API exposes availability.' },
  { state: 'VA', name: 'Virginia ABC', type: 'state_board', precision: 'store_level', sourceUrl: 'https://www.abc.virginia.gov/stores', source: 'Virginia ABC store locator', notes: 'State-controlled stores; limited-availability releases may be hidden until release, but normal inventory/store metadata is location-ready.' },
  { state: 'IA', name: 'Iowa ABD', type: 'state_board', precision: 'store_level', sourceUrl: 'https://abd.iowa.gov/alcohol/snapshot', source: 'Iowa ABD delivery snapshot', notes: 'Iowa public data does not always ship lat/lng in the delivery snapshot, but store names/cities are location-ready.' },
  { state: 'OR', name: 'Oregon Liquor Search', type: 'state_board', precision: 'store_level', sourceUrl: 'https://www.oregonliquorsearch.com/', source: 'Oregon Liquor Search', notes: 'Search exposes carrying stores/product availability with freshness caveats.' },
  { state: 'UT', name: 'Utah DABS', type: 'state_board', precision: 'store_level', sourceUrl: 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', source: 'Utah DABS product locator', notes: 'Product locator can support store-level location records when collector coverage is expanded.' },
  { state: 'AL', name: 'Alabama ABC', type: 'state_board', precision: 'release_event', sourceUrl: 'https://alabcboard.gov/stores/events/limited-release-programs/monthly', source: 'Alabama ABC limited release programs', notes: 'Useful release/store-event infrastructure; not a continuous live inventory source.' },
  { state: 'PA', name: 'Pennsylvania FWGS / PLCB', type: 'state_board', precision: 'store_level', sourceUrl: 'https://www.finewineandgoodspirits.com/store-locator', source: 'FWGS store locator', notes: 'Large store/ecommerce footprint; bot protection may require browser/API discovery.' },
  { state: 'NH', name: 'New Hampshire Liquor & Wine Outlets', type: 'state_board', precision: 'store_level', sourceUrl: 'https://www.liquorandwineoutlets.com/store-locator', source: 'NH Liquor & Wine Outlets store locator', notes: 'State outlet catalog and limited release categories; store locator is infrastructure-ready.' },
  { state: 'ID', name: 'Idaho State Liquor Division', type: 'state_board', precision: 'store_level', sourceUrl: 'https://idaholiquor.com/stores/', source: 'Idaho State Liquor Division store finder', notes: 'Store list/product allocation watch candidate.' },
  { state: 'ME', name: 'Maine Spirits', type: 'state_board', precision: 'agency_store', sourceUrl: 'https://www.mainespirits.com/agency-liquor-store-finder', source: 'Maine Spirits agency store finder', notes: 'Agency store finder infrastructure; inventory granularity needs per-source verification.' },
  { state: 'VT', name: 'Vermont 802Spirits', type: 'state_board', precision: 'agency_store', sourceUrl: 'https://www.802spirits.com/locations', source: '802Spirits location finder', notes: 'Agency/location infrastructure; product availability is weaker than store inventory.' },
  { state: 'MT', name: 'Montana Agency Liquor Stores', type: 'state_board', precision: 'agency_store', sourceUrl: 'https://revenue.mt.gov/alcoholic-beverage-control/agency-liquor-stores/', source: 'Montana agency liquor stores', notes: 'Agency-store list candidate; public inventory likely weak.' },
  { state: 'WV', name: 'West Virginia ABCA', type: 'state_board', precision: 'statewide_catalog', sourceUrl: 'https://www.wvabca.com/liquorsearch.aspx', source: 'WV ABCA liquor search', notes: 'Catalog/barrel-pick watch source; no obvious live store inventory yet.' },
  { state: 'WY', name: 'Wyoming Liquor Division', type: 'state_board', precision: 'statewide_catalog', sourceUrl: 'https://liquor365.wyo.gov/', source: 'Wyoming Liquor Division', notes: 'Wholesale/product-listing infrastructure; weak consumer location signal until better public data is found.' },
  { state: 'MS', name: 'Mississippi ABC', type: 'state_board', precision: 'statewide_catalog', sourceUrl: 'https://www.dor.ms.gov/abc', source: 'Mississippi ABC', notes: 'Vendor/product-registration watch source; weak public consumer inventory.' },
  { state: 'MD-MONTGOMERY', name: 'Montgomery County ABS', type: 'county_board', precision: 'county_board', county: 'Montgomery', sourceUrl: 'https://www.montgomerycountymd.gov/ABS/Stores/', source: 'Montgomery County ABS stores', notes: 'County-run ABS stores and highly allocated liquor program.' }
];

function clean(value) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
}

function locationId(location) {
  return stableId([
    'loc',
    location.state,
    location.type || location.locationType,
    location.name,
    location.address,
    location.city,
    location.county,
    location.sourceUrl
  ]);
}

function makeLocation(input) {
  const type = input.type || input.locationType || 'store';
  const record = {
    id: input.id || null,
    state: clean(input.state),
    type,
    locationType: type,
    name: clean(input.name),
    address: clean(input.address),
    city: clean(input.city),
    county: clean(input.county),
    zip: clean(input.zip),
    lat: typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : null,
    lng: typeof input.lng === 'number' && Number.isFinite(input.lng) ? input.lng : null,
    precision: clean(input.precision) || (type === 'store' ? 'store_level' : type === 'county_board' ? 'county_board' : 'statewide_catalog'),
    source: clean(input.source),
    sourceUrl: clean(input.sourceUrl),
    inventoryCapability: clean(input.inventoryCapability) || clean(input.precision) || (type === 'store' ? 'store_level' : 'watch'),
    searchable: input.searchable !== false,
    collectorAttached: input.collectorAttached === true,
    hasSignals: input.hasSignals === true,
    signalCount: Number.isFinite(input.signalCount) ? input.signalCount : 0,
    lastSignalAt: clean(input.lastSignalAt),
    lastVerifiedAt: clean(input.lastVerifiedAt),
    notes: clean(input.notes)
  };
  record.id = record.id || locationId(record);
  return record;
}

export function buildLocationBible(signals = [], officialLocations = []) {
  const locations = [];
  const activeStateIds = new Set(STATE_SOURCES.map((s) => s.id));

  for (const seed of STATEWIDE_LOCATION_SEEDS) {
    if (!activeStateIds.has(seed.state)) continue;
    locations.push(makeLocation({ ...seed, collectorAttached: Boolean(STATE_SOURCES.find((s) => s.id === seed.state)) }));
  }

  const activeOfficialLocations = officialLocations.filter((location) => activeStateIds.has(location.state));
  const hasOfficialNc = activeOfficialLocations.some((location) => location.state === 'NC');
  if (!hasOfficialNc) {
    for (const county of NC_COUNTIES) {
      locations.push(makeLocation({
        state: 'NC',
        type: 'county_board',
        name: `${county} County ABC Board`,
        county,
        precision: 'county_board',
        source: 'NC ABC boards and stores',
        sourceUrl: 'https://www.abc.nc.gov/nc-abc-boards-and-stores',
        inventoryCapability: county === 'Wake' ? 'store_level_partial' : 'county_board_watch',
        collectorAttached: county === 'Wake',
        notes: county === 'Wake'
          ? 'Wake County has a current inventory collector attached; other NC boards are preloaded for future board/store collectors.'
          : 'Preloaded NC board/county infrastructure; board-specific store/inventory collectors can attach later.'
      }));
    }
  }

  for (const officialLocation of activeOfficialLocations) {
    locations.push(makeLocation({
      ...officialLocation,
      collectorAttached: officialLocation.collectorAttached === true,
      hasSignals: officialLocation.hasSignals === true,
      signalCount: Number.isFinite(officialLocation.signalCount) ? officialLocation.signalCount : 0
    }));
  }

  const groupedSignals = new Map();
  for (const signal of signals) {
    const isStore = signal.locationPrecision === 'store_level' && (signal.storeName || signal.locationName || signal.storeAddress);
    const isBoard = !isStore && (signal.locationName || signal.county || signal.city);
    if (!isStore && !isBoard) continue;

    const location = makeLocation({
      id: isStore
        ? (signal.storeId ? String(signal.storeId) : stableId(['store', signal.state, signal.storeName || signal.locationName, signal.storeAddress || signal.city || signal.county]))
        : undefined,
      state: signal.state,
      type: isStore ? 'store' : signal.county ? 'county_board' : 'area',
      name: signal.storeName || signal.locationName || (signal.county ? `${signal.county} County` : signal.city),
      address: signal.storeAddress,
      city: signal.city,
      county: signal.county,
      zip: signal.zip,
      lat: signal.lat,
      lng: signal.lng,
      precision: signal.locationPrecision,
      source: signal.sourceLabel,
      sourceUrl: signal.sourceUrl,
      inventoryCapability: signal.locationPrecision,
      collectorAttached: true,
      hasSignals: true,
      signalCount: 1,
      lastSignalAt: signal.observedAt,
      notes: signal.inventorySemantics
    });
    const key = location.id;
    const existing = groupedSignals.get(key);
    if (!existing) groupedSignals.set(key, location);
    else {
      existing.signalCount += 1;
      existing.hasSignals = true;
      existing.collectorAttached = true;
      if (location.lastSignalAt && (!existing.lastSignalAt || location.lastSignalAt > existing.lastSignalAt)) existing.lastSignalAt = location.lastSignalAt;
      for (const field of ['name', 'address', 'city', 'county', 'zip', 'lat', 'lng', 'source', 'sourceUrl', 'notes']) {
        if ((existing[field] == null || existing[field] === '') && location[field] != null) existing[field] = location[field];
      }
    }
  }

  locations.push(...groupedSignals.values());

  const byId = new Map();
  for (const location of locations) {
    const key = location.id;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, location);
      continue;
    }
    existing.signalCount += location.signalCount || 0;
    existing.hasSignals = existing.hasSignals || location.hasSignals;
    existing.collectorAttached = existing.collectorAttached || location.collectorAttached;
    if (location.lastSignalAt && (!existing.lastSignalAt || location.lastSignalAt > existing.lastSignalAt)) existing.lastSignalAt = location.lastSignalAt;
  }

  const byVisibleArea = new Map();
  for (const location of byId.values()) {
    if (location.type === 'store' || location.locationType === 'store') {
      byVisibleArea.set(location.id, location);
      continue;
    }
    const visibleKey = [location.state, location.type || location.locationType, location.name, location.city || '', location.county || '', location.address || '']
      .map((part) => String(part || '').toLowerCase().trim())
      .join('|');
    const existing = byVisibleArea.get(visibleKey);
    if (!existing) {
      byVisibleArea.set(visibleKey, location);
      continue;
    }
    existing.signalCount += location.signalCount || 0;
    existing.hasSignals = existing.hasSignals || location.hasSignals;
    existing.collectorAttached = existing.collectorAttached || location.collectorAttached;
    if (location.lastSignalAt && (!existing.lastSignalAt || location.lastSignalAt > existing.lastSignalAt)) existing.lastSignalAt = location.lastSignalAt;
    for (const field of ['source', 'sourceUrl', 'notes']) {
      if ((existing[field] == null || existing[field] === '') && location[field] != null) existing[field] = location[field];
    }
  }

  return [...byVisibleArea.values()].sort((a, b) =>
    String(a.state).localeCompare(String(b.state)) ||
    String(a.type).localeCompare(String(b.type)) ||
    String(a.county || '').localeCompare(String(b.county || '')) ||
    String(a.name || '').localeCompare(String(b.name || ''))
  );
}

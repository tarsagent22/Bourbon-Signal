// Pure, supplied-public-data identity comparison. No collection, I/O, admission,
// merchant alias approval or historical absence decision belongs in this module.
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const WORDS = Object.freeze({ north:'n',south:'s',east:'e',west:'w',northeast:'ne',northwest:'nw',southeast:'se',southwest:'sw',
  avenue:'ave',street:'st',boulevard:'blvd',road:'rd',drive:'dr',court:'ct',lane:'ln',place:'pl',parkway:'pkwy',highway:'hwy' });
const clean = (v, max = 500) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v) ? v.trim() : '';
const token = v => clean(v).normalize('NFKD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[’']/gu,'').replace(/[^a-z0-9]+/gu,' ').trim().replace(/\s+/gu,' ');
const identifier = v => /^[a-z0-9][a-z0-9:._-]{0,179}$/iu.test(clean(v,180)) ? clean(v,180) : null;
const zip5 = v => /^(\d{5})(?:-\d{4})?$/u.exec(clean(v))?.[1] || null;
function publicUrl(value) {
  try { const u = new URL(clean(value)); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.origin + u.pathname : null; }
  catch { return null; }
}

/** State, city, ZIP and meaningful units are retained. Never supplies a unit alias. */
export function normalizeDirectoryPremise(row = {}) {
  const address = clean(row.address), state = clean(row.state).toUpperCase(), city = token(row.city);
  const suffix = address.match(/\b([a-z]{2})\s+(\d{5}(?:-\d{4})?)\b/iu);
  const declaredZip = zip5(row.zip), addressZip = suffix ? zip5(suffix[2]) : null, zip = declaredZip || addressZip;
  const reasons = [];
  if (!STATES.has(state)) reasons.push('invalid_state');
  if (!city) reasons.push('missing_city');
  if (!zip) reasons.push('missing_zip');
  if (clean(row.zip) && !declaredZip) reasons.push('invalid_declared_zip');
  if (suffix && suffix[1].toUpperCase() !== state) reasons.push('address_state_conflict');
  if (declaredZip && addressZip && declaredZip !== addressZip) reasons.push('address_zip_conflict');
  let street = address.replace(/\b(?:United States(?: of America)?|USA)\s*$/iu,'').trim();
  if (suffix) street = street.slice(0, suffix.index);
  street = street.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/gu,'').replace(/[,.]/gu,' ').replace(/\s+/gu,' ').trim();
  // Remove only the explicitly supplied city's trailing address component.
  if (city && token(street).endsWith(' ' + city)) {
    const cityPattern = clean(row.city).replace(/[.*+?^${}()|[\]\\]/gu,'\\$&').replace(/\s+/gu,'\\s+');
    street = street.replace(new RegExp('\\s+' + cityPattern + '\\s*$','iu'),'').trim();
  }
  let unit = null, unitKind = null;
  const explicit = /(?:\b(unit|suite|ste|apt|apartment)\s*#?\s*|(#)\s*)([a-z0-9]+(?:-[a-z0-9]+)?)$/u.exec(street);
  if (explicit) {
    unit = explicit[3];
    unitKind = ['apt','apartment'].includes(explicit[1]) ? 'apartment' : ['suite','ste'].includes(explicit[1]) ? 'suite' : 'unit';
    street = street.slice(0,explicit.index).trim();
  }
  // Hyphens in house numbers are meaningful (notably Queens-style addresses).
  // Preserve them instead of passing the street through the name/search tokenizer.
  street = street.replace(/[’']/gu,'').replace(/[^a-z0-9-]+/gu,' ').trim().replace(/\s+/gu,' ')
    .split(' ').map(w => WORDS[w] || w).join(' ');
  if (!unit) {
    const implicit = /\b(?:ave|st|blvd|rd|dr|ct|ln|pl|pkwy)\s+(\d+[a-z]?)$/u.exec(street);
    if (implicit) { unit = implicit[1]; unitKind = 'implicit'; street = street.slice(0,-unit.length).trim(); }
  }
  if (!/^\d+[a-z]?(?:-\d+[a-z]?)?(?:\s+\d+)?\s+[a-z0-9]/u.test(street) || /\b(?:po box|p o box)\b/u.test(street)) reasons.push('invalid_street');
  // Unparsed repeated markers and second address/unit fragments never become exact.
  if (/\b(?:unit|suite|ste|apt|apartment)\b/u.test(street)) reasons.push('unparsed_unit_marker');
  const usable = reasons.length === 0;
  return { state, city, zip, street, unit, unitKind, usable, reasons,
    addressState:suffix?.[1].toUpperCase() || null,
    key:usable ? JSON.stringify([state,city,zip,street,unit]) : null };
}

function publicRow(row) {
  return { directoryId:identifier(row.id), licensedName:clean(row.name), address:clean(row.address), city:clean(row.city),
    state:clean(row.state).toUpperCase(), zip:clean(row.zip), source:clean(row.source), sourceUrl:publicUrl(row.sourceUrl) };
}

/**
 * Candidates are already reviewed physical identities: {sourceId?, storeId?,
 * name, address, city, state, zip, literalAddress?}. A caller applying a reviewed
 * canonical address must independently bind its alias evidence; this function
 * does not approve an omitted unit or mutate the supplied collector configuration.
 */
export function reconcilePremisesDirectory(candidates, directoryRows) {
  if (!Array.isArray(candidates) || candidates.length > 25 || !Array.isArray(directoryRows) || directoryRows.length > 100_000)
    throw new TypeError('Directory reconciliation bounds exceeded');
  const prepared = candidates.map(candidate => {
    const physical = normalizeDirectoryPremise(candidate);
    if (!physical.usable || !clean(candidate.name)) throw new TypeError('Complete candidate physical identity required');
    return { candidate, physical };
  });
  if (new Set(prepared.map(c => c.physical.key)).size !== prepared.length) throw new TypeError('Duplicate candidate physical premises');
  const entries = [], keyCounts = new Map(), idCounts = new Map();
  let incompleteDirectoryRows = 0;
  for (const input of directoryRows) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) { incompleteDirectoryRows++; continue; }
    const row = publicRow(input), physical = normalizeDirectoryPremise(input);
    if (!physical.usable) incompleteDirectoryRows++;
    entries.push({ row, physical });
    if (physical.key) keyCounts.set(physical.key,(keyCounts.get(physical.key) || 0)+1);
    if (row.directoryId) idCounts.set(row.directoryId,(idCounts.get(row.directoryId) || 0)+1);
  }
  const results = prepared.map(({ candidate, physical:target }) => {
    let totalMatches = 0, exactPhysicalMatches = 0, ambiguousPhysicalMatches = 0;
    const matches = [];
    for (const { row, physical:other } of entries) {
      const sameState = other.state === target.state || other.addressState === target.state;
      const numericPunctuationDiffers = other.street !== target.street
        && other.street.replace(/-/gu,' ') === target.street.replace(/-/gu,' ');
      if (!sameState || other.street !== target.street && !numericPunctuationDiffers) continue;
      const reasons = [...other.reasons];
      if (numericPunctuationDiffers) reasons.push('street_numeric_punctuation_differs');
      if (other.state !== target.state) reasons.push('declared_state_differs');
      if (other.city !== target.city) reasons.push('city_differs');
      if (other.zip && other.zip !== target.zip) reasons.push('zip_differs');
      if (other.unit !== target.unit) reasons.push(other.unit && target.unit ? 'unit_conflict' : 'unit_missing_on_one_side');
      if (!row.directoryId || !row.licensedName) reasons.push('directory_identity_incomplete');
      if (other.key && keyCounts.get(other.key) > 1) reasons.push('duplicate_directory_physical_premise');
      if (row.directoryId && idCounts.get(row.directoryId) > 1) reasons.push('duplicate_directory_id');
      const reviewReasons = [];
      if (token(row.licensedName) !== token(candidate.name)) reviewReasons.push('licensed_name_differs_from_merchant_name');
      if (other.unit === target.unit && other.unit && new Set([other.unitKind,target.unitKind]).has('apartment') && other.unitKind !== target.unitKind)
        reasons.push('apartment_vs_other_unit_designator_requires_review');
      if (other.unitKind === 'implicit' || target.unitKind === 'implicit') reviewReasons.push('implicit_unit_number_requires_review');
      const category = reasons.length ? 'ambiguous_physical_address' : 'exact_physical_address';
      totalMatches++; if (reasons.length) ambiguousPhysicalMatches++; else exactPhysicalMatches++;
      if (matches.length < 100) matches.push({ ...row, normalized:other, category, reasons:[...new Set(reasons)], reviewReasons,
        merchantIdentity:'not_established_by_directory_match' });
    }
    return { candidate:{sourceId:identifier(candidate.sourceId),storeId:identifier(candidate.storeId),merchantName:clean(candidate.name),
      address:clean(candidate.address),literalAddress:clean(candidate.literalAddress) || clean(candidate.address),city:clean(candidate.city),state:target.state,zip:target.zip},
      normalized:target, counts:{exactPhysicalMatches,ambiguousPhysicalMatches,totalMatches},matches,matchesTruncated:totalMatches > matches.length,
      result:totalMatches ? 'directory_identity_context_found' : 'no_match_in_supplied_directory' };
  });
  return {contractVersion:'bourbon-signal/premises-directory-reconciliation@1',scope:'directory_identity_context_only',
    inputCounts:{candidates:candidates.length,directoryRows:directoryRows.length,incompleteDirectoryRows},results};
}

import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';

export const INDIANA_PAYLESS_SOURCE = Object.freeze({
  label: 'Payless Liquors East Street barrel selections',
  url: 'https://www.paylessliquors.info/barrel-selections',
  storeId: 'payless-liquors:east-street',
  storeAddress: '3825 S. East Street, Indianapolis, IN 46227',
  contractVersion: 'bourbon-signal-indiana-payless-pickup-v1',
});

const text = (value) => String(value || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const words = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function normalizeIndianaCityHiveQuantity(value) {
  const reportedQuantity = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  const valid = Number.isSafeInteger(reportedQuantity) && reportedQuantity >= 0;
  const binaryAvailability = valid && reportedQuantity >= 100;
  return {
    reportedQuantity: valid ? reportedQuantity : null,
    binaryAvailability,
    quantity: valid && !binaryAvailability ? reportedQuantity : 0,
    quantityIsExact: valid && !binaryAvailability,
    sourceAvailabilityVerified: valid && reportedQuantity > 0,
    quantitySemantics: binaryAvailability ? 'binary_cityhive_availability_no_exact_count' : valid ? 'exact_retailer_reported_quantity' : 'unverified_quantity',
  };
}

// Keep these source corrections local: the Bible has no reviewed Woodford Rye family.
export function indianaSourceBottleMismatchReason(signal) {
  const raw = words(signal?.rawName || signal?.raw?.product?.name);
  const canonical = words(signal?.canonicalName || signal?.canonical || signal?.bottle);
  if (/\bwoodford\b/.test(raw) && /\brye\b/.test(raw) && canonical && !/\brye\b/.test(canonical)) return 'woodford_rye_matched_non_rye';
  if (/\bwild turkey\b/.test(canonical) && /\bmaster(?:s)?\b/.test(canonical) && !/\bmaster(?:s)?\b/.test(raw)) return 'wild_turkey_master_expression_missing';
  return null;
}

export function reviewedIndianaCityHiveBottleMatch(rawName, bible) {
  const result = cityHiveSafeBottleMatch(rawName, bible);
  const unsafeReason = result.record && indianaSourceBottleMismatchReason({ rawName, canonicalName: result.record.canonical });
  return unsafeReason ? { ...result, record: null, unsafeReason } : result;
}

export function reviewedIndianaPaylessBottleMatch(rawName, bible) {
  if (words(rawName) === 'maker s mark private selections') {
    const record = bible.records.find((row) => row.canonical === "Maker's Mark Private Selection");
    return { match: record ? { record, confidence: 1, method: 'reviewed-indiana-payless-title' } : null, record: record || null, unsafeReason: record ? null : 'reviewed_family_missing' };
  }
  return reviewedIndianaCityHiveBottleMatch(rawName, bible);
}

export function buildIndianaPaylessAvailabilityProof({ rawName, observedAt, sourceUrl, storeAddress, pickupText } = {}) {
  const evidence = text(pickupText);
  if (!text(rawName) || sourceUrl !== INDIANA_PAYLESS_SOURCE.url || storeAddress !== INDIANA_PAYLESS_SOURCE.storeAddress
    || !Number.isFinite(Date.parse(observedAt || ''))
    || !words(evidence).includes(words(rawName))
    || !/Available at our East Street location/i.test(evidence)
    || !/Stop by and pick your bottle up today!/i.test(evidence)) return null;
  return {
    quantity: 0,
    storeQty: 0,
    quantityIsExact: false,
    quantitySemantics: 'binary_retailer_pickup_no_exact_count',
    sourceAvailabilityVerified: true,
    availabilityStatus: 'in_stock',
    sourceProductBinding: {
      contractVersion: INDIANA_PAYLESS_SOURCE.contractVersion,
      sourceTitle: text(rawName),
      sourceProductUrl: sourceUrl,
      storeId: INDIANA_PAYLESS_SOURCE.storeId,
      storeAddress,
      observedAt,
      pickupLocationEvidence: 'Available at our East Street location',
      pickupAvailabilityEvidence: 'Stop by and pick your bottle up today!',
    },
  };
}

export function hasIndianaPaylessPickupProof(signal) {
  const proof = signal?.sourceProductBinding || signal?.raw?.productBinding;
  return proof?.contractVersion === INDIANA_PAYLESS_SOURCE.contractVersion
    && signal.sourceUrl === INDIANA_PAYLESS_SOURCE.url
    && signal.storeId === INDIANA_PAYLESS_SOURCE.storeId
    && signal.storeAddress === INDIANA_PAYLESS_SOURCE.storeAddress
    && proof.sourceTitle === text(signal.rawName)
    && proof.sourceProductUrl === signal.sourceUrl
    && proof.storeId === signal.storeId
    && proof.storeAddress === signal.storeAddress
    && proof.observedAt === signal.observedAt
    && Number.isFinite(Date.parse(proof.observedAt || ''))
    && proof.pickupLocationEvidence === 'Available at our East Street location'
    && proof.pickupAvailabilityEvidence === 'Stop by and pick your bottle up today!'
    && Number(signal.quantity) === 0
    && Number(signal.storeQty ?? signal.quantity) === 0
    && signal.quantityIsExact === false
    && signal.quantitySemantics === 'binary_retailer_pickup_no_exact_count'
    && signal.sourceAvailabilityVerified === true
    && signal.availabilityStatus === 'in_stock';
}

import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';

// Exact Safeway XAPI identity reviewed in both Arizona captures on 2026-10-22.
// This source's title includes a stock caveat that is not a bottle expression.
const BUFFALO_TRACE = Object.freeze({
  id: '960051942',
  upc: '0008024400923',
  name: 'Buffalo Trace Bourbon 90 Proof - 750 Ml (limited quantities may be available in store)',
  canonical: 'Buffalo Trace Bourbon',
});

function exactText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function reviewedArizonaXapiBottleMatch(product, bible, { storeId } = {}) {
  const name = String(product?.name || '');
  const referencesReviewedProduct = [product?.id, product?.pid].some((value) => String(value || '') === BUFFALO_TRACE.id)
    || String(product?.upc || '') === BUFFALO_TRACE.upc
    || exactText(name) === exactText(BUFFALO_TRACE.name);
  if (!referencesReviewedProduct) return cityHiveSafeBottleMatch(name, bible);

  const rejected = { match: null, record: null, unsafeReason: 'unverified_arizona_xapi_product_identity' };
  if (String(product?.id || '') !== BUFFALO_TRACE.id
    || String(product?.pid || '') !== BUFFALO_TRACE.id
    || String(product?.upc || '') !== BUFFALO_TRACE.upc
    || exactText(name) !== exactText(BUFFALO_TRACE.name)
    || product?.containsAlcohol !== true
    || Number(product?.alcoholVolumePct) !== 45
    || Number(product?.dispItemSizeQty) !== 750
    || exactText(product?.dispUnitOfMeasure) !== 'ml'
    || exactText(product?.unitOfMeasure) !== 'ml'
    || Number(product?.dispItemPackageQty) !== 1
    || !/^\d{2,6}$/.test(String(storeId || ''))
    || String(product?.storeId || '') !== String(storeId)) return rejected;

  const match = bible.match(BUFFALO_TRACE.canonical);
  if (!match?.record || match.record.canonical !== BUFFALO_TRACE.canonical) return rejected;
  return {
    match: { ...match, confidence: 1, method: 'reviewed-arizona-xapi-product-identity' },
    record: match.record,
    unsafeReason: null,
  };
}

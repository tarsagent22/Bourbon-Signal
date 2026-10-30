import {xapiExpressionTitleSupported} from './grocery-xapi-expression-title.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { arizonaXapiLibraryIdentity } from './arizona-xapi-library-identity.mjs';

// Exact Safeway XAPI identity reviewed in both Arizona captures on 2026-10-22.
// This source's title includes a stock caveat that is not a bottle expression.
const BUFFALO_TRACE = Object.freeze({
  id: '960051942',
  upc: '0008024400923',
  name: 'Buffalo Trace Bourbon 90 Proof - 750 Ml (limited quantities may be available in store)',
  canonical: 'Buffalo Trace Bourbon',
});

// Source-specific exact identities, reviewed against current producer product
// specifications. These are not aliases for other retailers or expressions.
const REVIEWED_PRODUCTS = Object.freeze([BUFFALO_TRACE,
  { id: '970022436', upc: '0009674900242', name: 'Heaven Hill Kentucky Straight 7 Year 100 Proof - 750 Ml (Limited quantities may be avaliable in store)', canonical: 'Heaven Hill Bottled-in-Bond 7 Year', abv: 50 },
  { id: '970468334', upc: '0081008055003', name: 'Whistlepig Piggyback 6 Yr Bourbon - 750 ML', canonical: 'WhistlePig PiggyBack 6 Year Bourbon', abv: 50 },
  { id: '960293806', upc: '0008800400549', name: 'E.H. Taylor Small Batch Kentucky Straight Bourbon Whiskey 100 Proof - 750 Ml (limited quantities may be available in store)', canonical: 'E.H. Taylor Small Batch', abv: 50 },
]);

function exactText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function reviewedArizonaXapiBottleMatch(product, bible, { storeId } = {}) {
  const name = String(product?.name || '');
  const reviewed = REVIEWED_PRODUCTS.find(row => [product?.id, product?.pid].some(value => String(value || '') === row.id)
    || String(product?.upc || '') === row.upc || exactText(name) === exactText(row.name));
  if (!reviewed) {
    const legacy = cityHiveSafeBottleMatch(name, bible);
    const candidate=legacy.record?legacy:arizonaXapiLibraryIdentity(product,bible,{storeId});
    return candidate.record&&!xapiExpressionTitleSupported(name,candidate.record.canonical)
      ?{match:null,record:null,unsafeReason:'unverified_xapi_master_expression_title'}:candidate;
  }

  const rejected = { match: null, record: null, unsafeReason: 'unverified_arizona_xapi_product_identity' };
  if (String(product?.id || '') !== reviewed.id
    || String(product?.pid || '') !== reviewed.id
    || String(product?.upc || '') !== reviewed.upc
    || exactText(name) !== exactText(reviewed.name)
    || product?.containsAlcohol !== true
    || Number(product?.alcoholVolumePct) !== (reviewed.abv ?? 45)
    || Number(product?.dispItemSizeQty) !== 750
    || exactText(product?.dispUnitOfMeasure) !== 'ml'
    || exactText(product?.unitOfMeasure) !== 'ml'
    || Number(product?.dispItemPackageQty) !== 1
    || !/^\d{2,6}$/.test(String(storeId || ''))
    || String(product?.storeId || '') !== String(storeId)) return rejected;

  const match = bible.match(reviewed.canonical);
  if (!match?.record || match.record.canonical !== reviewed.canonical) return rejected;
  return {
    match: { ...match, confidence: 1, method: 'reviewed-arizona-xapi-product-identity' },
    record: match.record,
    unsafeReason: null,
  };
}

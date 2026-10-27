import { cityHiveUnsafeBottleMatchReason } from './safe-bottle-match.mjs';

const indexes = new WeakMap();

// Retailer formatting only: keep ages, finishes, batches, rye, single barrel,
// full proof and barrel proof. Numeric strength is checked separately against
// the product's ABV. No containment, edit distance or family-name fallback.
function identity(value) {
  const text = String(value || '').normalize('NFKD');
  const proofs = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:proof|pf)\b/gi)].map(m => Number(m[1]));
  const key = text.toLowerCase()
    .replace(/\s*\(limited quantities may be (?:available|avaliable) in store\)\s*$/i, '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ml|liters?|lt)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:proof|pf)\b/gi, ' ')
    .replace(/\bcolonel\s+(?=e\.?\s*h\.?\s*taylor\b)/g, '')
    .replace(/\b(?:variable|varying) proof\b/g, phrase => /\bbarrel proof\b/i.test(text) ? '' : phrase)
    .replace(/\b(?:kentucky|ky|straight|bourbon|whiskey|whisky|in bottle)\b/g, ' ')
    .replace(/\b(\d{1,2})\s*(?:years? old|years?|yrs?|yr|y)\b/g, '$1 year')
    .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\be h taylor jr\b/g, 'e h taylor')
    .replace(/\bbib\b/g, 'bottled in bond')
    .replace(/\bbottled in bond (\d+ year)\b/g, '$1 bottled in bond');
  return { key, proofs };
}

function libraryIndex(bible) {
  if (indexes.has(bible)) return indexes.get(bible);
  const index = new Map();
  for (const record of bible.records || []) {
    for (const bottle of record.libraryIdentities || []) {
      for (const name of [bottle.canonicalName, ...bottle.aliases]) {
        const entry = identity(name);
        if (!entry.key) continue;
        if (!index.has(entry.key)) index.set(entry.key, []);
        index.get(entry.key).push({ record, proofs: entry.proofs, canonical: name === bottle.canonicalName });
      }
    }
  }
  indexes.set(bible, index);
  return index;
}

export function arizonaXapiLibraryIdentity(product, bible, { storeId } = {}) {
  const rejected = { match: null, record: null, unsafeReason: 'unverified_arizona_xapi_library_identity' };
  const strength = Number(product?.alcoholVolumePct);
  const volume = Number(product?.dispItemSizeQty);
  const unit = String(product?.dispUnitOfMeasure || '').toLowerCase();
  const sizeMl = unit === 'ml' ? volume : unit === 'l' ? volume * 1000 : NaN;
  const titleSizes = [...String(product?.name || '').matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|liters?|lt|l)\b/gi)]
    .map(m => Number(m[1]) * (m[2].toLowerCase() === 'ml' ? 1 : 1000));
  if (!/^\d+$/.test(String(product?.id || '')) || String(product?.id) !== String(product?.pid)
    || !/^\d{12,14}$/.test(String(product?.upc || ''))
    || !/^\d{2,6}$/.test(String(storeId || '')) || String(product?.storeId) !== String(storeId)
    || product?.containsAlcohol !== true || !Number.isFinite(strength) || strength < 20 || strength > 80
    || !Number.isFinite(sizeMl) || sizeMl < 375 || sizeMl > 1750
    || String(product?.unitOfMeasure || '').toLowerCase() !== unit || Number(product?.dispItemPackageQty) !== 1
    || !titleSizes.length || titleSizes.some(size => size !== sizeMl)) return rejected;
  const raw = identity(product.name);
  const strengthMatches = proofs => proofs.every(proof => Math.abs(proof - strength * 2) < 0.05);
  if (!raw.key || !strengthMatches(raw.proofs)
    || (/\bbib\b|\bbottled[ -]in[ -]bond\b/i.test(product.name) && strength !== 50)) return rejected;
  const candidates = new Map();
  // Ambiguous normalized identities remain excluded, even if ABV could choose
  // one. Strength must corroborate an identity, never select an expression.
  const indexed = libraryIndex(bible).get(raw.key) || [];
  const canonical = indexed.filter(entry => entry.canonical);
  const entries = canonical.length ? canonical : indexed;
  if (new Set(entries.map(entry => entry.record.id)).size !== 1) return rejected;
  for (const { record, proofs } of entries) {
    const explicitType = !/\bbourbon\b/i.test(record.canonical) || /\bbourbon\b/i.test(product.name);
    const modifierTitle = product.name.replace(/\bbib\b/gi, 'bottled in bond');
    if (explicitType && strengthMatches(proofs) && !cityHiveUnsafeBottleMatchReason(modifierTitle, record)) candidates.set(record.id, record);
  }
  if (candidates.size !== 1) return rejected;
  const record = [...candidates.values()][0];
  return { record, match: { record, confidence: 1, method: 'exact-arizona-library-identity' }, unsafeReason: null };
}

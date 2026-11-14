import { LOUISIANA_ALASKA_GROCERY_SOURCES } from './collectors/louisiana-alaska-grocery-premises.mjs';

export function louisianaAlaskaGrocerySourceForSignal(row) {
  return LOUISIANA_ALASKA_GROCERY_SOURCES.find(source => source.stateCode === row?.state
    && source.id === row.sourceChain && source.merchantId === row.merchantId) || null;
}

export function isLouisianaAlaskaGrocerySignalIdentity(row) {
  const source = louisianaAlaskaGrocerySourceForSignal(row), proof = row?.sourceProductBinding;
  if (!source || row.stateCode !== source.stateCode || row.sourceLabel !== source.sourceLabel
    || row.storeId !== source.storeId || row.storeAddress !== source.address || row.city !== source.city
    || Number(row.lat) !== source.lat || Number(row.lng) !== source.lng
    || !row.productId || row.variantId !== row.productId
    || proof?.schemaVersion !== 1 || proof.source !== 'grocery-xapi'
    || proof.storeId !== row.storeId || proof.storeAddress !== row.storeAddress
    || proof.merchantId !== row.merchantId || proof.productId !== row.productId || proof.variantId !== row.variantId
    || proof.rawName !== row.rawName || proof.canonicalBottleId !== row.canonicalBottleId
    || proof.price !== row.price || proof.observedAt !== row.observedAt
    || proof.premisesVerified !== true || proof.inStoreChannelVerified !== true) return false;
  try {
    const url = new URL(row.sourceUrl);
    return url.protocol === 'https:' && url.hostname === source.host && !url.port && !url.username && !url.password
      && !url.search && !url.hash && url.pathname === `/shop/product-details.${row.productId}.html`;
  } catch { return false; }
}

export function isLouisianaAlaskaGroceryInventory(row) {
  if (!isLouisianaAlaskaGrocerySignalIdentity(row) || row.stale === true || row.sourceStale === true
    || row.sourceAvailabilityVerified !== true || row.availabilityStatus !== 'in_stock'
    || String(row.eventType || row.type) !== 'retailer_store_inventory_result'
    || row.locationPrecision !== 'store_level' || !Number.isFinite(Date.parse(row.observedAt))
    || typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price <= 0) return false;
  const product = row.raw?.product || row.sourceProductBinding.productSnapshot;
  if(row.canonicalName==='Wild Turkey Master'&&!/\bmaster\b/i.test(row.rawName||''))return false;
  if (!product || String(product.id) !== row.productId || String(product.pid) !== row.variantId
    || String(product.storeId) !== row.merchantId || product.containsAlcohol !== true
    || !/^\d{12,14}$/.test(String(product.upc || ''))
    || Number(product.dispItemPackageQty) !== 1 || Number(product.price) !== row.price
    || product.channelEligibility?.inStore !== true
    || String(product.channelInventory?.instore ?? product.channelInventory?.inStore) !== '1'
    || String(product.name || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim() !== row.rawName) return false;
  const abv = Number(product.alcoholVolumePct), unit = String(product.dispUnitOfMeasure || '').toLowerCase();
  const ml = Number(product.dispItemSizeQty) * (unit === 'ml' ? 1 : unit === 'l' ? 1000 : NaN);
  const sizes = [...String(product.name).matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|liters?|lt|l)\b/gi)].map(m=>Number(m[1])*(m[2].toLowerCase()==='ml'?1:1000));
  const proofs = [...String(product.name).matchAll(/\b(\d+(?:\.\d+)?)\s*(?:proof|pf)\b/gi)].map(m=>Number(m[1]));
  if (!Number.isFinite(abv) || abv < 20 || abv > 80 || !Number.isFinite(ml) || ml <= 375 || ml > 1750
    || String(product.unitOfMeasure || '').toLowerCase() !== unit
    || !sizes.length || sizes.some(size=>size!==ml) || proofs.some(proof=>Math.abs(proof-abv*2)>=.05)) return false;
  const quantity = product.channelInventory.instoreItemQty ?? product.channelInventory.inStoreItemQty;
  if (quantity != null && (quantity === '' || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) return false;
  const exact = quantity != null && Number.isInteger(Number(quantity)) && Number(quantity) < 100;
  return row.quantityIsExact === exact && typeof row.quantity === 'number'
    && row.quantity === (exact ? Number(quantity) : 0)
    && (row.raw?.inventorySemantics || row.sourceProductBinding.inventorySemantics)
      === (exact ? 'exact_retailer_quantity' : 'binary_retailer_orderable_no_exact_count');
}

export function louisianaAlaskaGroceryLibraryTier(row, bible) {
  if (!isLouisianaAlaskaGroceryInventory(row)) return null;
  const record = bible.records.find(record=>record.id===row.canonicalBottleId);
  if (!record || record.libraryAlertEligible===false) return null;
  const key = value=>String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const identities=record.libraryIdentities || [];
  const canonical=identities.filter(identity=>key(identity.canonicalName)===key(row.canonicalName));
  const candidates=canonical.length ? canonical : identities.filter(identity=>(identity.aliases || []).some(alias=>key(alias)===key(row.canonicalName)));
  if (new Set(candidates.map(identity=>identity.id)).size!==1 || candidates[0].isAlertEligible!==true) return null;
  const identity=candidates[0];
  const tier=identity.stateOverrides?.find(override=>override.jurisdiction===row.state)?.tier || identity.nationalTier;
  return ({regular:'standard',common:'standard',highly_allocated:'unicorn',unicorn:'unicorn',allocated:'allocated',limited:'limited'})[tier] || null;
}

// Closed first-party on-site evidence may show binary availability without
// granting watch/notification authority or inventing an exact quantity.
export function isLouisianaAlaskaGroceryOnSiteSignal(row) {
  return ['LA', 'AK'].includes(row?.state) && isLouisianaAlaskaGroceryInventory(row)
    && row.previewOnly !== true && row.researchOnly !== true && row.customerVisible !== false
    && row.raw?.shadowOnly !== true && row.sourceProductBinding?.shadowOnly !== true
    && row.quarantined !== true && row.raw?.sourceRuntimeNonAlertable !== true && row.raw?.staleFallback !== true
    && row.inventorySemantics === row.sourceProductBinding.inventorySemantics
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true
    && row.alertable === false && row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && row.can_alert_as_inventory !== true && row.can_alert_as_watch !== true && row.deliveryEligible !== true
    && row.eligibleForWatch === false && row.eligibleForDelivery === false
    && row.eligibleForEmail === false && row.eligibleForSms === false;
}

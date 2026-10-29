import { reviewedArizonaXapiBottleMatch } from './arizona-xapi-matching.mjs';

export function parseBoundGroceryXapiInventory(payload, source, bible) {
  const result = [];
  const seen = new Set();
  for (const product of Array.isArray(payload?.response?.docs) ? payload.response.docs : []) {
    const productId = String(product?.id || '');
    if (!/^\d+$/.test(productId) || seen.has(productId) || String(product?.storeId || '') !== source.merchantId) continue;
    const strength=Number(product.alcoholVolumePct), volume=Number(product.dispItemSizeQty);
    const unit=String(product.dispUnitOfMeasure || '').toLowerCase();
    const sizeMl=unit==='ml'?volume:unit==='l'?volume*1000:NaN;
    if(String(product.pid)!==productId || !/^\d{12,14}$/.test(String(product.upc || ''))
      || product.containsAlcohol!==true || !Number.isFinite(strength) || strength<20 || strength>80
      || !Number.isFinite(sizeMl) || sizeMl<=375 || sizeMl>1750
      || String(product.unitOfMeasure || '').toLowerCase()!==unit || Number(product.dispItemPackageQty)!==1)continue;
    const declaredSizes=[...String(product.name || '').matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|liters?|lt|l)\b/gi)].map(m=>Number(m[1])*(m[2].toLowerCase()==='ml'?1:1000));
    const proofs=[...String(product.name || '').matchAll(/\b(\d+(?:\.\d+)?)\s*(?:proof|pf)\b/gi)].map(m=>Number(m[1]));
    if(!declaredSizes.length || declaredSizes.some(size=>size!==sizeMl) || proofs.some(proof=>Math.abs(proof-strength*2)>=.05))continue;
    if (String(product?.channelInventory?.instore ?? product?.channelInventory?.inStore ?? '') !== '1'
      || product?.channelEligibility?.inStore !== true) continue;
    const quantity = product.channelInventory.instoreItemQty ?? product.channelInventory.inStoreItemQty;
    if (quantity != null && (quantity === '' || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0)) continue;
    const title = String(product.name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(?:gift\s*(?:set|box)|bundle|sampler|cocktail|liqueur|rtd|pack|miniatures?)\b/i.test(title)) continue;
    const size = title.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|liter)\b/i);
    if (!size || Number(size[1]) * (/^l/i.test(size[2]) ? 1000 : 1) <= 375) continue;
    // Reuse the existing strict XAPI product/store/UPC/strength identity proof.
    // It retains expression/proof conflicts rather than making a family match.
    const { record, match } = reviewedArizonaXapiBottleMatch(product, bible, { storeId: source.merchantId });
    if (!record) continue;
    const exact = quantity != null && Number.isInteger(Number(quantity)) && Number(quantity) < 100;
    seen.add(productId);
    result.push({ productId, variantId: String(product.pid || productId), handle: String(product.pid || productId),
      title, size: product.size || null, price: Number.isFinite(Number(product.price)) && Number(product.price) > 0 ? Number(product.price) : null,
      quantity: exact ? Number(quantity) : 0, reportedQuantity: quantity == null ? null : Number(quantity),
      inventorySemantics: exact ? 'exact_retailer_quantity' : 'binary_retailer_orderable_no_exact_count',
      record, matchMethod: match?.method, rawProduct: product });
  }
  return result;
}

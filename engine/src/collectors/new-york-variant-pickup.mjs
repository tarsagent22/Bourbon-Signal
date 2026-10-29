import reviewed from '../../data/new-york-variant-pickup-retailers.json' with { type: 'json' };
import { collectShopifyVariantPickup, validateShopifyVariantSource } from './shopify-variant-pickup.mjs';

// These are exact reviewed product/variant probes, not catalog availability.
// The ordinary metro runner owns refresh, durable denial cooldown and expiry.
export const NEW_YORK_VARIANT_PICKUP_SOURCES = Object.freeze(reviewed.sources.map(input => {
  const definition = validateShopifyVariantSource(input);
  return Object.freeze({ id: definition.id, chainName: definition.stores[0].name,
    sourceLabel: definition.sourceLabel, platform: 'shopify-variant-pickup',
    inventoryMode: 'variant_pickup', inventoryEligible: true,
    stateCode: 'NY', area: definition.id === 'grand-wine-cellar' ? 'Nassau County'
      : definition.id === 'winecity-east-northport' ? 'Suffolk County' : 'New York City', baseUrl: definition.baseUrl,
    host: new URL(definition.baseUrl).hostname, productsUrl: definition.products[0].evidence.product.url,
    fulfillmentPolicyUrl: definition.products[0].evidence.pickup.url,
    stores: Object.freeze(definition.stores.map(store => Object.freeze({ ...store, merchantId: definition.merchantId, state: 'NY', stateCode: 'NY' }))),
    pickupDefinition: definition,
  });
}));

export async function collectNewYorkVariantPickup(config, bible, candidate, observedAt, options = {}) {
  const source = NEW_YORK_VARIANT_PICKUP_SOURCES.find(item => item.id === candidate?.id);
  if (config?.id !== 'NY' || !source || candidate.platform !== source.platform
    || candidate.baseUrl !== source.baseUrl || candidate.productsUrl !== source.productsUrl) {
    throw new Error('Unregistered New York variant/premises pickup source');
  }
  const result = await collectShopifyVariantPickup(bible, source.pickupDefinition, { ...options, observedAt });
  result.signals = result.signals.map(signal => ({ ...signal, variantAvailable: true,
    sourceProductBinding: { schemaVersion: 1, source: 'metro-library-identity',
      productIdentityMode: 'shopify_variant_pickup', rawName: signal.rawName,
      canonicalName: signal.canonicalName, canonicalBottleId: signal.canonicalBottleId,
      merchantId: signal.merchantId, storeId: signal.storeId,
      productId: signal.productId, variantId: signal.variantId,
      variantAvailable: signal.raw?.variant?.available === true,
      pickupUrl: signal.sourceProductBinding, observedAt },
    raw: { ...signal.raw, platform: source.platform } }));
  return { ...result, metadata: { ...result.metadata, completeSnapshot: true,
    reviewedProductCount: source.pickupDefinition.products.length, exhaustiveCatalogVerified: false } };
}

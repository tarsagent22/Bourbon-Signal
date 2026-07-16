import { getStateName } from './state-name-registry.mjs';

export const STATE_SOURCE_QUERY_TEMPLATES = Object.freeze([
  { id: 'official_control', build: (state) => `${state} liquor control board bourbon official` },
  { id: 'retailer_storefront', build: (state) => `${state} bourbon liquor retailer online store` },
  { id: 'product_category', build: (state) => `${state} bourbon whiskey category product store` },
  { id: 'platform_surface', build: (state) => `${state} liquor CityHive Shopify WooCommerce bourbon` },
  { id: 'allocated_release', build: (state) => `${state} allocated bourbon release lottery official` },
]);

export function queriesForState(stateId) {
  const state = getStateName(stateId);
  if (!state) throw new Error(`Unknown state ${stateId}.`);
  return STATE_SOURCE_QUERY_TEMPLATES.map((template) => ({ id: template.id, query: template.build(state) }));
}

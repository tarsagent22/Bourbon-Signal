import {
  GEORGIA_CITYHIVE_SOURCES,
  GEORGIA_GOTOLIQUOR_STORES,
  GEORGIA_LIGHTSPEED_STORES,
} from './collectors/georgia-retailer-surfaces.mjs';
import { TENNESSEE_RETAILER_STORES } from './collectors/tennessee-retailer-surfaces.mjs';
import { demandMetroAreaLabel, demandMetroAreaMatchesFields } from './demand-metro-areas.mjs';

function georgiaRegisteredStores() {
  return [
    ...GEORGIA_CITYHIVE_SOURCES.flatMap((source) => [...source.merchants.values()].map((item) => ({
      state: 'GA',
      sourceId: source.id,
      sourceLabel: source.sourceLabel,
      sourceUrl: source.categoryUrl,
      merchantId: item.id,
      storeId: `${source.id}:${item.id}`,
      name: item.name,
      address: item.address,
      city: item.city,
      zip: item.zip,
    }))),
    ...GEORGIA_GOTOLIQUOR_STORES.map((item) => ({
      state: 'GA',
      sourceId: item.chain,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.categoryUrl,
      merchantId: item.merchantId,
      storeId: item.storeId,
      name: item.name,
      address: item.address,
      city: item.city,
      zip: item.zip,
    })),
    ...GEORGIA_LIGHTSPEED_STORES.map((item) => ({
      state: 'GA',
      sourceId: item.chain,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.categoryUrl,
      merchantId: item.merchantId,
      storeId: item.storeId,
      name: item.name,
      address: item.address,
      city: item.city,
      zip: item.zip,
    })),
  ];
}

export function registeredDemandMetroStores() {
  const stores = [
    ...georgiaRegisteredStores(),
    ...TENNESSEE_RETAILER_STORES.map((item) => ({
      state: 'TN',
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      sourceUrl: `https://${item.hostname}/`,
      merchantId: item.merchantId,
      storeId: item.storeId,
      name: item.name,
      address: item.address,
      city: item.city,
      zip: item.zip,
    })),
  ];
  return stores
    .filter((item) => demandMetroAreaMatchesFields(item.state, [item.city, item.address], [demandMetroAreaLabel(item.state)]))
    .map((item) => ({ ...item, area: demandMetroAreaLabel(item.state) }));
}

export function registeredDemandMetroLocations() {
  return registeredDemandMetroStores().map((item) => ({
    id: item.storeId,
    state: item.state,
    type: 'store',
    locationType: 'store',
    name: item.name,
    address: item.address,
    city: item.city,
    zip: item.zip,
    area: item.area,
    precision: 'store_level',
    source: 'Bourbon Signal first-party exact-store registry',
    sourceUrl: item.sourceUrl,
    inventoryCapability: 'exact_store_source_registered',
    searchable: true,
    collectorAttached: true,
    hasSignals: false,
    signalCount: 0,
    sourceAvailabilityVerified: false,
    notes: 'Configured exact-store source identity. This stable directory row is not current bottle inventory.',
  }));
}

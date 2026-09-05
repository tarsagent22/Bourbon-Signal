import { LIQUOR_LIBRARY_SOURCE as src } from '../../engine/src/collectors/south-carolina-square.mjs';
export function transport(source: any, quantity: number): typeof fetch {
  const pagination = (n: number) => ({ total: n, count: n, per_page: 100, current_page: 1, total_pages: 1 });
  return async (input: any) => {
    const url = String(input);
    let data: any[];
    if (url.includes('/store-locations?')) data = [{ id: src.locationId, square_id: src.locationId, owner_id: src.ownerId, site_id: src.siteId,
      display_name: src.store.name, pickup_timezone: 'America/New_York', pickup_enabled: true,
      address: { data: { is_primary: true, is_valid: true, business_name: src.store.name, street: '270 Hwy 17 N', street2: '', city: src.store.city,
        region_code: 'SC', postal_code: src.store.zip, country_code: 'US', latitude: src.store.lat, longitude: src.store.lng } } }];
    else if (url.includes('/skus?')) {
      const s = source.subjects.find((s: any) => url.includes(`/products/${s.siteProductId}/`));
      data = [{ id: s.variationId, square_id: s.variationId, site_product_sku_id: s.variationId, sku: 'fixture-sku', owner_id: src.ownerId, site_id: src.siteId,
        merchant_id: src.merchantId, site_product_id: s.siteProductId, product_square_id: s.productId, product_type: 'physical', fulfillable: true,
        fulfillment: { methods: { pickup: true }, methods_at_any_location: { pickup: true } }, inventory_tracking_enabled: true, sold_out: quantity === 0,
        stockable: true, sellable: true, inventory: quantity, total_inventory: quantity, price: { current: 50 } }];
    } else data = source.subjects.map((s: any) => ({ id: s.productId, square_id: s.productId, owner_id: src.ownerId, site_id: src.siteId, merchant_id: src.merchantId,
      site_product_id: s.siteProductId, name: s.rawName, visibility: 'visible', product_type: 'physical', fulfillable: true,
      absolute_site_link: `${src.baseUrl}/product/fixture/${s.siteProductId}`, categoryIds: [src.categoryId, src.categoryPageId],
      badges: { out_of_stock: quantity === 0 }, inventory: { total: quantity, all_inventory_total: quantity, lowest: quantity,
        all_variations_sold_out: quantity === 0, marked_sold_out_at_all_existing_locations: false, marked_sold_out_skus_count: 0, has_location_not_tracking: false }, price: { low: 50, high: 50 } }));
    return new Response(JSON.stringify({ data, meta: { pagination: pagination(data.length) } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

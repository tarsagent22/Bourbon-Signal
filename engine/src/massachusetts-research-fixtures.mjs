import { collectMassachusettsJulios } from './collectors/massachusetts-retailer-collector.mjs';
import { MA_JULIOS_SOURCE as store } from './collectors/massachusetts-retailer-surfaces.mjs';
import { bibleLookup, buildDrops, isActiveCustomerStateRow } from './export-site-contract.mjs';

// Synthetic first-party response shape. Every assertion runs the real parser,
// identity matcher and public export projection; this does not fetch a source.
function publicPage(input) {
  const name = input.rawName || 'WILD TURKEY RARE BREED';
  const address = input.wrongPremises ? '999 Wrong Road, Boston, MA' : store.address;
  const merchantId = input.wrongMerchant ? 'another-merchant' : store.merchantId;
  const size = { measure: 'ml', quantity: input.size || '750' };
  const option = { product_id: 'product-1', option_id: 'variant-1', merchant_id: merchantId,
    full_address: address, price: 54.99, quantity: input.stock ?? 2,
    preorder_details: input.preorder ? { available: true } : null,
    allowed_offer_types: input.shippingOnly ? ['shipping'] : null,
    option_params: { size }, original_option_params: { size }, units_of_measure: [],
    option_display_data: { name, size },
    product_url: `${input.wrongHost ? 'https://unrelated.example' : store.baseUrl}/shop/product/rare-breed/product-1?option-id=variant-1` };
  const data = { merchant_configs: [{ merchant: { id: merchantId, full_address: address } }],
    products: [{ id: 'product-1', name, merchants: [{ merchant_id: merchantId,
      full_address: address, offer_types: ['pick_up', 'shipping'], product_options: [option] }] }] };
  return `<script>decodeURIComponent("${encodeURIComponent(JSON.stringify(data))}")</script>`;
}

export async function executeMassachusettsResearchFixtures(payload, { bible } = {}) {
  const failures = [];
  for (const item of payload.cases || []) {
    const input = item.input || {};
    const observedAt = new Date(Date.now() - Number(input.ageMinutes || 0) * 60_000).toISOString();
    const result = await collectMassachusettsJulios({ id: 'MA' }, bible, {
      shadowMode: true, now: () => observedAt,
      fetchImpl: async () => new Response(publicPage(input), { status: 200 }),
    });
    const candidates = buildDrops(result.signals, bibleLookup(bible.records), result.signals);
    const actual = {
      sourceRows: result.signals.length, researchCandidateCount: candidates.length,
      canonicalName: candidates[0]?.canonicalName || null,
      quantity: candidates[0]?.quantity ?? null,
      quantityIsExact: candidates[0]?.quantityIsExact ?? null,
      inventorySemantics: candidates[0]?.inventorySemantics || null,
      preserveOriginalTimestamp: result.signals.every(row => row.observedAt === observedAt)
        && candidates.every(row => row.observedAt === observedAt),
      deliveryEligible: candidates.some(row => row.eligibleForDelivery === true || row.eligibleForEmail === true || row.eligibleForSms === true),
      customerActive: isActiveCustomerStateRow({ state: 'MA' }),
    };
    for (const [key, expected] of Object.entries(item.expected || {})) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected)) failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}.`);
    }
  }
  return { ok: failures.length === 0, failures };
}

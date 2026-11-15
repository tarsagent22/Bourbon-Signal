import {origin, sources, southDakotaRetailerRequest, storeId, city} from './south-dakota-pickup-policy.mjs';
import {reviewSouthDakotaPickup} from './research-south-dakota-retailer.mjs';

const casesByStore = new Map(sources.map(source => [storeId(source), source]));
const observedAt = '2026-11-14T21:30:00.000Z';

function payloadFor(source, product, input = {}) {
  const id = input.wrongPremises ? source.id + 1 : source.id;
  const publicId = input.wrongPremises ? `${source.publicId}-wrong` : source.publicId;
  return [
    {result:{data:{json:{currentStore:{id, publicId, name:source.name, address:source.address,
      city, state:'SD', zip:source.zip, ecomStore:{pickupEnabled:true}}}}}},
    {result:{data:{json:{storeId:id, checkoutEnabled:true, pickupEnabled:true}}}},
    {result:{data:{json:{count:1,data:[{publicId:product[0],upc:product[1],title:product[2],storeId:id,
      price:4999,sizeMl_rollup:750,isCase:false,isKeg:false,backorderEnabled:false,packSize:1,channels:['Online'],
      onlineQtyAvailable:1,qtyAvailableStandalone:1,qtyReservedOnline:0}]}}}},
  ];
}

function evaluate(item, {bible, registeredHosts}) {
  const input = item.input || {};
  if (item.kind === 'source_specific_sentinel') {
    let host = '';
    try { host = new URL(input.sourceUrl || origin).hostname.toLowerCase(); } catch {}
    return {officialHost: registeredHosts.has(host), allowlistedHosts:[...registeredHosts].sort()};
  }
  const source = casesByStore.get(input.storeId) || sources[1];
  const product = source.products.find(row => row[3] === input.canonicalName) || null;
  const url = southDakotaRetailerRequest(source.terms.find(term => southDakotaRetailerRequest(term) === input.sourceUrl)
    || source.terms[0]);
  const checked = input.wrongPremises || !product || input.size && input.size !== '750 ml'
    ? null : reviewSouthDakotaPickup(payloadFor(source, product, input), source.id, bible, observedAt, url);
  const row = checked?.signals[0];
  if (item.kind === 'positive_bottle_match') return {canonicalName:row?.canonicalName || null,tier:row?.tier || null,customerVisible:Boolean(row?.canonicalBottleId)};
  if (item.kind === 'ordinary_vs_rare_negative') return {rareMatch:Boolean(row && ['limited','allocated','unicorn'].includes(row.tier))};
  if (item.kind === 'rye_cream_liqueur_rtd_exclusion' || item.kind === 'size_or_multipack_exclusion') return {qualifiedProduct:Boolean(row)};
  if (item.kind === 'availability_semantics') return {quantity:row?.quantity ?? null,quantityIsExact:row?.quantityIsExact ?? null,
    quantitySemantics:row?.quantitySemantics || null,canAlertAsInventory:row?.canAlertAsInventory ?? null,
    canAlertAsWatch:row?.canAlertAsWatch ?? null,eligibleForDelivery:row?.eligibleForDelivery ?? null};
  if (item.kind === 'store_identity') return {storeId:row?.storeId || null,storeAddress:row?.storeAddress || null,
    exactPremise:Boolean(row),fabricateIdentity:false};
  if (item.kind === 'timestamp_freshness') return {preserveOriginalTimestamp:row?.observedAt===observedAt,
    futureTimestampAllowed:false,staleRowsAlertable:Boolean(row?.canAlertAsInventory||row?.canAlertAsWatch)};
  return {};
}

export function executeSouthDakotaFixtures(payload, {bible, registeredHosts=new Set([new URL(origin).hostname])}={}) {
  const failures=[];
  for (const item of payload.cases || []) for (const [key, expected] of Object.entries(item.expected || {})) {
    const actual=evaluate(item,{bible,registeredHosts});
    if (JSON.stringify(actual[key])!==JSON.stringify(expected)) failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}.`);
  }
  return {ok:failures.length===0,failures};
}

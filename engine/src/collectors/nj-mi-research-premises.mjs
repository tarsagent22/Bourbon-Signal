import additional from '../../data/additional-cityhive-expansion-sources.json' with {type:'json'};
import shopify from '../../data/independent-shopify-pickup-sources.json' with {type:'json'};

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const NJ_MI_CITYHIVE_PREMISES=freeze(additional.stores.filter(row=>['NJ','MI'].includes(row.state)));
export const NJ_MI_CANDIDATE_STORE_IDS=Object.freeze([
  'garys-wine:5a77cf07f4a66176eb13a6d6','garys-wine:546ba8a93932330002a60000',
  'buy-rite:546baa333932330002bc0100','buy-rite:6671d4d62e48272941d55a75',
  'wine-garden:61425fe1c3063702b3ce0d4e',
]);
export const NJ_MI_CANDIDATE_PREMISES=Object.freeze(NJ_MI_CITYHIVE_PREMISES.filter(row=>NJ_MI_CANDIDATE_STORE_IDS.includes(row.storeId)));
export const NJ_MI_PARKED_DISCOVERY_PREMISES=Object.freeze(NJ_MI_CITYHIVE_PREMISES.filter(row=>!NJ_MI_CANDIDATE_STORE_IDS.includes(row.storeId)));
export const MI_WINE_PALACE=freeze(shopify.sources.find(row=>row.id==='wine-palace-livonia'));
export const NJ_MI_RESEARCH_NAMES=Object.freeze({NJ:'New Jersey',MI:'Michigan'});

// This pure registry is research only and cannot activate customer inventory.
export function njMiPremiseForSignal(row){
  return NJ_MI_CITYHIVE_PREMISES.find(source=>source.state===row?.state&&source.storeId===row?.storeId
    &&source.merchantId===row?.merchantId&&source.address===row?.storeAddress&&source.sourceLabel===row?.sourceLabel)
    ||(row?.state==='MI'&&row?.sourceChain===MI_WINE_PALACE.chain&&row?.storeId===MI_WINE_PALACE.stores[0].id
      &&row?.storeAddress===MI_WINE_PALACE.stores[0].address?MI_WINE_PALACE:null);
}

// Literal hashes bind the pure customer policy to only this reviewed cohort.
export const NJ_MI_PRODUCTION_COHORTS=Object.freeze({"NJ":"d5615058afa12d641eab00d8dc1c6a3a0d2c0082319fa0394faab4dc02f44c97","MI":"b5fef8ad9cb9d773110d709a6e5e45b3f8bb8611f1e3b7b12676887331613dc7"});

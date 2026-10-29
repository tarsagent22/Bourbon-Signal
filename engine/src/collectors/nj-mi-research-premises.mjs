import additional from '../../data/additional-cityhive-expansion-sources.json' with {type:'json'};
import shopify from '../../data/independent-shopify-pickup-sources.json' with {type:'json'};

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const NJ_MI_CITYHIVE_PREMISES=freeze(additional.stores.filter(row=>['NJ','MI'].includes(row.state)));
export const MI_WINE_PALACE=freeze(shopify.sources.find(row=>row.id==='wine-palace-livonia'));
export const NJ_MI_RESEARCH_NAMES=Object.freeze({NJ:'New Jersey',MI:'Michigan'});

// This pure registry is research only and cannot activate customer inventory.
export function njMiPremiseForSignal(row){
  return NJ_MI_CITYHIVE_PREMISES.find(source=>source.state===row?.state&&source.storeId===row?.storeId
    &&source.merchantId===row?.merchantId&&source.address===row?.storeAddress&&source.sourceLabel===row?.sourceLabel)
    ||(row?.state==='MI'&&row?.sourceChain===MI_WINE_PALACE.chain&&row?.storeId===MI_WINE_PALACE.stores[0].id
      &&row?.storeAddress===MI_WINE_PALACE.stores[0].address?MI_WINE_PALACE:null);
}

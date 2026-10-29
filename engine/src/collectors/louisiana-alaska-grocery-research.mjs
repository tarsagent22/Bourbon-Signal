import {LOUISIANA_ALASKA_GROCERY_SOURCES} from './louisiana-alaska-grocery-premises.mjs';
import {groceryExpansionPremiseMatches} from './grocery-xapi-expansion.mjs';
import {parseBoundGroceryXapiInventory} from './grocery-xapi-identity.mjs';

const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const tiers=new Set(['limited','allocated','highly_allocated','unicorn']);
function currentLibraryTier(record,state){
  if(record.libraryAlertEligible===false)return null;
  const identities=record.libraryIdentities||[],canonical=identities.filter(identity=>key(identity.canonicalName)===key(record.canonical));
  const candidates=canonical.length?canonical:identities.filter(identity=>identity.aliases?.some(alias=>key(alias)===key(record.canonical)));
  if(new Set(candidates.map(identity=>identity.id)).size!==1||candidates[0].isAlertEligible!==true)return null;
  return candidates[0].stateOverrides?.find(override=>override.jurisdiction===state)?.tier||candidates[0].nationalTier;
}

export function louisianaAlaskaGroceryPremiseMatches(source,resolverStore){
  return LOUISIANA_ALASKA_GROCERY_SOURCES.includes(source)&&groceryExpansionPremiseMatches(source,resolverStore);
}

// Pure capture replay only. No state wiring, HTTP, publication or promotion.
// This deliberately cannot create customer-facing signals or alert candidates.
export function parseLouisianaAlaskaGroceryResearch(payload,source,bible,{resolverStore,observedAt}={}){
  if(!louisianaAlaskaGroceryPremiseMatches(source,resolverStore)||!Number.isFinite(Date.parse(observedAt)))return[];
  return parseBoundGroceryXapiInventory(payload,source,bible).flatMap(row=>{
    const tier=currentLibraryTier(row.record,source.stateCode);
    // The current library has a broad alias that cannot establish this named
    // expression. Preserve the excluded raw row in research evidence only.
    if(!tiers.has(tier)||!Number.isFinite(row.price)||row.price<=0
      ||row.record.canonical==='Wild Turkey Master'&&!/\bmaster\b/i.test(row.title))return[];
    return[{...row,tier,sourceId:source.id,storeId:source.storeId,state:source.stateCode,observedAt,
      researchOnly:true,customerVisible:false,productionActivated:false,canAlertAsInventory:false,canAlertAsWatch:false,
      eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}];
  });
}

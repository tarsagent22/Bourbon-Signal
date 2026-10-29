import {NEW_ENGLAND_RESEARCH_SOURCES,parseNewEnglandResearchInventory} from './new-england-research.mjs';
import {cityHiveSafeBottleMatch} from './safe-bottle-match.mjs';
import {centralCityHiveRecordMarketTier} from './central-cityhive-market-policy.mjs';
import {isNewEnglandInventory} from '../new-england-policy.mjs';
export function newEnglandLibraryTier(row,bible){
  if(!isNewEnglandInventory(row))return null;
  const match=cityHiveSafeBottleMatch(row.sourceProductBinding.identityName,bible).match;
  if(match?.confidence!==1||match.record?.id!==row.canonicalBottleId||match.record.canonical!==row.canonicalName)return null;
  return centralCityHiveRecordMarketTier(match.record,row.state);
}
export async function collectNewEnglandCandidateInventory(config,bible,{fetchText,signal}={}){
  if(!['MA','CT','RI'].includes(config.id)||typeof fetchText!=='function')throw Error('Reviewed New England source and bounded transport required');
  const sources=NEW_ENGLAND_RESEARCH_SOURCES.filter(source=>source.state===config.id),signals=[],requests=[],verifiedPremises=new Set();
  for(const source of sources){
    signal?.throwIfAborted();const url=new URL(source.categoryUrl);url.searchParams.delete('subtype');url.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');
    const response=await fetchText(url.href,{signal,timeoutMs:10_000,maxBytes:2*1024*1024,maxRedirects:0});signal?.throwIfAborted();
    const observedAt=new Date().toISOString();requests.push({sourceId:source.id,url:url.href,ok:response.ok===true,status:response.status,observedAt});
    if(!response.ok)break;
    signals.push(...parseNewEnglandResearchInventory(response.text,source,bible,{observedAt,onVerifiedPremise:source=>verifiedPremises.add(source.storeId)}));
  }
  const selectedStores=sources.map(source=>source.storeId);
  return{signals,roadblocks:[],metadata:{requests,selectedStores,verifiedPremises:[...verifiedPremises],
    complete:requests.length===sources.length&&requests.every(row=>row.ok&&row.status===200)&&selectedStores.every(id=>verifiedPremises.has(id)),exhaustiveCatalogVerified:false}};
}

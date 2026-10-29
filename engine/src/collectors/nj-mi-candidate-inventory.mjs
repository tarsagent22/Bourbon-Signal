import {ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './central-cityhive-expansion.mjs';
import {NJ_MI_CANDIDATE_STORE_IDS} from './nj-mi-research-premises.mjs';
// One reviewed query per exact admitted premise. The other ten discovery
// premises and the separate native fallback never enter this production cohort.
export async function collectNjMiCandidateInventory(config,bible,{fetchText,signal,nowMs=Date.now()}={}){
  const sources=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===config.id&&NJ_MI_CANDIDATE_STORE_IDS.includes(source.storeId));
  if(!['NJ','MI'].includes(config.id)||typeof fetchText!=='function')throw Error('A reviewed NJ/MI candidate and bounded transport are required');
  const signals=[],requests=[],verifiedPremises=new Set();
  for(const source of sources){
    signal?.throwIfAborted();const url=new URL(source.categoryUrl);
    url.searchParams.delete('subtype');url.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');
    const response=await fetchText(url.href,{signal,timeoutMs:10_000,maxBytes:2*1024*1024,maxRedirects:0});
    signal?.throwIfAborted();const observedAt=new Date().toISOString();
    requests.push({sourceId:source.id,url:url.href,status:response.status,ok:response.ok===true,observedAt});
    if(response.ok!==true)break;
    signals.push(...parseCentralCityHiveInventory(response.text,source,bible,{observedAt,onVerifiedPremise:premise=>verifiedPremises.add(premise.storeId)}));
  }
  const selectedStores=sources.map(source=>source.storeId);
  return{signals,roadblocks:[],metadata:{requests,selectedStores,verifiedPremises:[...verifiedPremises],
    complete:requests.length===sources.length&&requests.every(row=>row.ok&&row.status===200)&&selectedStores.every(id=>verifiedPremises.has(id)),exhaustiveCatalogVerified:false}};
}

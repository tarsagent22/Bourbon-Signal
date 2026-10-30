import {MINNESOTA_CITYHIVE_EXPANSION_SOURCES,MIDWEST_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './central-cityhive-expansion.mjs';
import {MN_MO_COHORTS,mnMoSourcesForState,mnMoResearchRuntimeId} from './mn-mo-cityhive-premises.mjs';
import {isMnMoCityHiveResearchInventory} from '../mn-mo-cityhive-policy.mjs';
const legacy=[...MINNESOTA_CITYHIVE_EXPANSION_SOURCES,...MIDWEST_CITYHIVE_EXPANSION_SOURCES];
export function parseMnMoCityHiveResearch(text,source,bible,{observedAt,profile='core5',onVerifiedPremise}={}){
 if(!mnMoSourcesForState(source?.state,profile).includes(source))throw Error('Exact reviewed MN/MO native premise required');
 const candidate=legacy.find(s=>s.state===source.state&&s.storeId===source.storeId);
 if(!candidate||['merchantId','address','city','zip','lat','lng','hostname','baseUrl','chainId','sourceLabel'].some(k=>candidate[k]!==source[k]))throw Error('Existing native parser premise changed; explicit cohort review required');
 return parseCentralCityHiveInventory(text,candidate,bible,{observedAt,onVerifiedPremise:()=>onVerifiedPremise?.(source)}).map(row=>({...row,
  sourceRuntimeId:mnMoResearchRuntimeId(source,profile),canAlertAsInventory:false,canAlertAsWatch:false,can_alert_as_inventory:false,can_alert_as_watch:false,alertable:false,
  eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false,
  sourceProductBinding:{...row.sourceProductBinding,source:'mn-mo-native-cityhive',collectorVersion:'mn-mo-native-cityhive-v1',profile,cohortSha256:MN_MO_COHORTS[profile][source.state],shadowOnly:true},raw:{...row.raw,shadowOnly:true}}))
  .filter(row=>isMnMoCityHiveResearchInventory(row,{nowMs:Date.parse(observedAt)}));
}

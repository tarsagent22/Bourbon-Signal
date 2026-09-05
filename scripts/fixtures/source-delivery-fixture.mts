import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync(new URL('../../src/lib/alert-delivery.ts',import.meta.url),'utf8');
const code = ts.transpile(source.slice(source.indexOf('export async function deliverPreferenceAlerts(')).replace('export async','async'),{target:ts.ScriptTarget.ES2022});
// Executes the actual delivery function with synthetic external services. Lane
// authority and tracing are supplied by the caller's real SQL repository.
export function deliveryFixture(candidates: any[], lane: any, overrides: any = {}, channel = 'email') {
  const events: any[] = [], sends: any[] = [];
  const prefs={push:{enabled:channel==='push'},onSite:{enabled:channel==='onSite'},email:{enabled:channel==='email',mode:'all'},sms:{enabled:channel==='sms',verified:true,phone:'+15555550123',mode:'all'},sightings:{enabled:true},rarityTiers:['allocated']};
  const user={id:'synthetic-member',publicMetadata:{paid:true,notificationPreferences:prefs,areaPreferences:{saved:true},bottleAlertPreferences:{bottleNames:[],bottleKeys:[]}},privateMetadata:{alertDelivery:{dedupeIdentityVersion:2,recent:[]},pushDevices:['synthetic-device']}};
  const queue={recoverStaleClaims:async()=>0,acquireLease:async()=>true,releaseLease:async()=>{},registerSnapshot:async()=>{},readRecipientCursor:async()=>0,writeRecipientCursor:async()=>{},markBatchDelivered:async()=>{},markFailed:async()=>{},markBatchFailed:async()=>{}};
  const send=async(kind: string)=>{sends.push(kind);events.push('send:'+kind);return {data:{id:'synthetic-accepted'},sid:'synthetic-sid',status:'queued',accepted:1,rejected:0,tickets:[],invalidTokens:[]};};
  const context: any={
    process:{env:{}},Date,Set,Map,Math,Number,String,createHash,
    pollRuntimeSourceLanes:async()=>{},mergeRuntimeSourceCandidates:async(c:any)=>c,persistRuntimeSourceDemand:async()=>{},
    traceRuntimeSourceCandidates:async(_c:any,stage:string,ch:string)=>{events.push('trace:'+stage+':'+ch);},runtimeSourceCandidatesStillValid:async()=>true,invokeSourceProvider:lane.invokeSourceProvider,
    classifyCompanyMember:()=>({isOwner:false,isRetailer:false}),
    assertAlertDeliveryAuthorized:()=>{},readAlertCandidateBatch:async()=>({candidates,snapshot:{snapshotId:'synthetic-review',generatedAt:new Date().toISOString()}}),
    evaluateAlertSnapshotSafety:()=>({safe:true}),loadSiteLocationLookupRecords:async()=>{},
    asString:(v:any,d='')=>typeof v==='string'?v:d,asNumber:(v:any,d=0)=>typeof v==='number'?v:d,asBoolean:(v:any)=>v===true,
    candidateCanUseOnSite:()=>true,candidatePassesFreshOnSiteGuardrails:()=>true,candidatePassesFreshEmailGuardrails:()=>true,candidatePassesFreshSmsGuardrails:()=>true,
    ALERT_DELIVERY_ENABLED:true,ALERT_ONSITE_DELIVERY_ENABLED:true,ALERT_EMAIL_DELIVERY_ENABLED:true,ALERT_SMS_DELIVERY_ENABLED:true,
    MAX_DELIVERY_USERS:10,MAX_RECIPIENT_SCAN_USERS:100,MAX_ONSITE_ALERTS_PER_USER:2,CANDIDATE_POOL_PER_USER:25,MAX_RECENT_DELIVERIES_PER_USER:250,MAX_RECENT_ONSITE_ALERTS_PER_USER:100,MAX_EMAILS_PER_RUN:10,MAX_EMAILS_PER_USER:2,MAX_SMS_PER_RUN:10,MAX_SMS_PER_USER:2,
    alertQueueDatabaseConfigured:()=>true,createProductionAlertQueueRepository:()=>queue,
    reserveAlertDeliveryBatch:async(_repo:any,input:any)=>({claimed:input.children.map((c:any,i:number)=>({id:'queue-'+i,payload:c.payload,stableMatchKey:c.stableMatchKey}))}),
    candidateWithUnderlyingChildren:(_c:any,children:any[])=>children[0] || null,
    randomUUID:()=> 'synthetic-worker',getResendClient:()=>({emails:{send:()=>send('email')}}),sendTwilioSms:()=>send('sms'),assertTwilioSmsConfigured:()=>{},DefinitiveSmsSendError:class extends Error{},
    clerkClient:async()=>({users:{getUser:async()=>structuredClone(user),updateUserMetadata:async(_id:any,patch:any)=>{if(patch.privateMetadata?.alertInbox)events.push('inbox');Object.assign(user.privateMetadata,structuredClone(patch.privateMetadata||{}));}}}),
    getUsersPage:async(_c:any,offset:number)=>({data:offset?[]:[structuredClone(user)],totalCount:1}),
    getServerEntitlements:async()=>({tier:'standard',canReceiveSightingsAlerts:true}),
    normalizeNotificationPreferences:(v:any)=>v,normalizeAreaPrefs:(v:any)=>v,hasSavedAreaPreferences:(v:any)=>v?.saved,
    normalizeBottleAlertPreferences:(v:any)=>v,normalizeDeliveryMetadata:(v:any)=>v,normalizeAlertInboxMetadata:(v:any)=>v||{recent:[]},normalizePendingExpoPushTickets:()=>[],
    pushPreferenceProjectionAllowsDelivery:()=>true,
    groupCandidatesByLocation:(cs:any)=>cs,enumerateUnderlyingAlertChildren:(c:any)=>[c],stableUnderlyingAlertKey:(c:any)=>c.availabilityEpisodeId,
    alertRarityIsSelected:()=>true,candidateMatchesArea:()=>true,candidateMatchesBottlePrefs:()=>true,candidateMatchesEmailMode:()=>true,candidateMatchesSmsMode:()=>true,
    sortCandidatesForMember:()=>0,selectUnseenCandidate:(c:any)=>c,
    candidateStoreLabel:()=> 'Synthetic store',candidateToMemberAlert:(_u:any,c:any,now:any)=>({id:c.id,dedupeKey:c.dedupeKey,underlyingStableKeys:[c.availabilityEpisodeId],bottleName:c.bottle,storeLabel:'Synthetic',matchedArea:'SC',signalAt:c.signalAt,freshnessLimitHours:2}),
    memberAlertPassesFinalFreshness:()=>true,uniqueStrings:(v:any)=>[...new Set(v)],firstAlertCreatedMetadata:()=>({activation:{}}),primaryEmailForUser:()=> 'synthetic@example.invalid',
    recentDeliverySet:()=>new Set(),recentUnderlyingDeliverySet:()=>new Set(),underlyingStableKeys:(c:any)=>[c.availabilityEpisodeId],flattenUnderlyingStableKeys:(cs:any)=>cs.map((c:any)=>c.availabilityEpisodeId),
    emailRecipientAllowed:()=>true,smsRecipientAllowed:()=>true,normalizePhoneNumber:(v:any)=>v,maskPhone:()=> 'synthetic',smsBodyForCandidate:()=> 'synthetic',
    candidateMatchedArea:()=> 'SC',candidateSubjectLocationLabel:()=> 'Synthetic',candidateTimestampLabel:()=>'',candidateQuantityLabel:()=>'',candidateEvidenceLabel:()=>'',candidateSourceLabel:()=>'',candidateSourceUrl:()=>'',PaidDropAlertEmail:()=>null,ALERT_FROM:'synthetic@example.invalid',ALERT_REPLY_TO:'synthetic@example.invalid',ALERT_SAFE_SUBJECT_PREFIX:'Synthetic',
    ownedPushDevices:async(_u:any,d:any)=>d,enabledPushTokens:(d:any)=>d,buildExpoPushMessages:()=>[{to:'synthetic-device'}],disablePushTokens:(d:any)=>d,
    createProductionPushOutbox:()=>({enqueue:async()=>{},assertHeld:async()=>{}}),
    drainPushOutbox:async(_r:any,_u:any,_w:any,callbacks:any)=>{
      const resolved=await callbacks.resolve({alertId:candidates[0].id,stableKeys:candidates.map(c=>c.availabilityEpisodeId)});
      if(resolved){const result=await callbacks.send(user.id,resolved.devices,resolved.messages);await callbacks.accepted(result);}
    },
    sendOwnedExpoPushMessages:async(_u:any,_d:any,m:any,options:any)=>options.send(m),sendExpoPushMessages:()=>send('push'),
  };
  Object.assign(context,overrides);
  const ctx=vm.createContext(context);vm.runInContext(code,ctx);
  return {context:ctx,events,sends,run:(options={})=>ctx.deliverPreferenceAlerts({},options)};
}

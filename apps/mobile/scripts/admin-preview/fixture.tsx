export const CellarBottleArtwork = () => null;
export const randomUUID=()=>crypto.randomUUID();
const rows=Array.from({length:83},(_,i)=>({id:`member-${i}`,name:`Member ${i+1}`,email:`member${i+1}@example.test`,tier:i%2?'standard':'free',billingStatus:i%2?'active':'free',billingProvider:i%2?'stripe':'Unspecified',accessSources:i%2?['paid']:['free'],number:i+1,numberLabel:'Member',createdAt:Date.now()-i*86400000,lastSignInAt:Date.now(),mobileActivity:i%2?[{platform:'ios',appVersion:'1.1.0',firstSeenAt:'2026-10-08T12:00:00Z',lastSeenAt:'2026-10-08T18:00:00Z'}]:[]}));
const api={getAdminAccess:async()=>({allowed:true}),getAdminData:async(part:string,query='')=>{
 const p=new URLSearchParams(query.slice(1)),offset=Number(p.get('offset')||0),q=p.get('q')||'',filter=p.get('filter')||'all';
 if(part==='overview')return {feedback:3,coverage:8,community:0,bottles:2,rewards:0,founderShipping:0,unavailable:[],checkedAt:new Date().toISOString()};
 if(part==='operations'){
  const scenario=new URLSearchParams(location.search).get('scenario');
  const now=Date.now(), at=(minutes:number)=>new Date(now-minutes*60_000).toISOString();
  if(p.get('view')==='history')return {audit:[]};
  if(p.get('view')==='setup'){
   if(scenario==='unavailable')throw new Error('Operations could not refresh.');
   return {setup:{windowDays:30,complete:scenario!=='partial',accounts:146,appOpened:112,areaSaved:93,watchlistSaved:74,setupComplete:39,alertMembers:58,missingArea:7,missingWatchlist:8,missingPush:4,activityAfter24Hours:63,eligibleForLaterActivity:96}};
  }
  return {
   health:{
    checkedAt:at(0),
    engine:scenario==='unavailable'?{status:'unknown'}:{status:'degraded',generatedAt:at(27),ageMinutes:27,staleAfterMinutes:45,dataSource:'remote-snapshot'},
    cron:scenario==='unavailable'?{status:'unknown'}:{status:'healthy',ageMinutes:3,staleAfterMinutes:12,lastRunAt:at(3),lastRunOk:true},
    release:scenario==='unavailable'?{status:'unknown'}:{status:'healthy',commit:'b8a24c5e1024'},
    delivery:scenario==='unavailable'?{}:{alertAudit:{status:'ok',windowStart:at(3).slice(0,10)+'T00:00:00.000Z',deliveredRows:126,uniqueRecipients:72,repeatedUnderlyingBottleGroups:3}},
   },
   states:scenario==='unavailable'?null:['NC','OR','KY','OH','CA','WA','VA','PA'].map((state,i)=>({
    state,health:['blocked','stale_useful','degraded'][i]||'healthy',customerVisibleDropCount:45-i,collection:{lastSuccessAt:at(60+i)},lastPublicationAt:at(30+i),
    recoveryAction:i===0?'manual_validation_required':'none',anomalyCodes:i===0?['inventory_confirmation_overdue']:[],
   })),
  };
 }
 if(part==='native-diagnostics'){
  const scenario=new URLSearchParams(location.search).get('scenario');
  return {diagnostics:scenario==='unavailable'?[]:[{metadata:{platform:'ios',errorKind:'TypeError',build:'31',runtime:'1.1.1-ios',update:'preview-update',fingerprint:'a'.repeat(64)},occurrences:4,lastSeenAt:new Date().toISOString()}]};
 }
 if(part==='members'){const found=rows.filter(r=>(p.get('app')!=='mobile'||r.mobileActivity.length>0)&&(filter==='all'||filter==='paid'&&r.tier!=='free'||filter===r.tier)&&`${r.name} ${r.email} ${r.number}`.toLowerCase().includes(q.toLowerCase()));return {members:found.slice(offset,offset+40),total:found.length,nextOffset:offset+40<found.length?offset+40:null};}
 if(part==='member-detail')return {member:rows.find(r=>r.id===p.get('id')),points:{balance:12,activity:[],redemptions:[]},history:[],posts:[{count:2}],activity:[{activity:{counts:[{kind:'bottles',status:'new',count:1}],items:[{kind:'bottles',id:'submission-1',title:'Exact Bourbon',status:'new',occurred_at:new Date().toISOString()}]}}],unavailable:[]};
 if(part==='catalog')return {bottles:[],total:0,nextOffset:null};
 if(part==='bottle-contributions')return {contributions:[{id:'submission-1',rawName:'Exact Bourbon',source:'collection',userId:'member-1',status:'new',updatedAt:new Date().toISOString(),createdAt:new Date().toISOString()}]};
 return {items:[],unavailable:[],history:[]};},saveAdminReview:async()=>({ok:true})};
export function useMobileApi(){return api;}

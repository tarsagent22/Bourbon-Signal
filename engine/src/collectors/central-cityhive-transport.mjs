import {readFile} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {readBoundedCollectionBody,requireHttpsCollectionUrl} from '../core/collection-http.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from './central-cityhive-premises.mjs';

export const CITYHIVE_DENIAL_STATUSES=new Set([401,403,429,435]);
export const CITYHIVE_DENIAL_MINIMUM_MS=86_400_000;
// Transport is independent of production activation. Each caller supplies its
// authoritative closed premise registry; redirects never expand that registry.
export async function fetchReviewedFirstPartyText(value,{signal,timeoutMs=10_000,maxTimeoutMs=10_000,maxBytes=2*1024*1024,onResponse,headers={},isAllowedUrl}={}){
  const url=requireHttpsCollectionUrl(value);
  if(typeof isAllowedUrl!=='function'||!isAllowedUrl(url))throw Error('Unreviewed first-party URL');
  const deadline=AbortSignal.timeout(Math.min(timeoutMs,maxTimeoutMs)),bounded=signal?AbortSignal.any([signal,deadline]):deadline;
  bounded.throwIfAborted();
  const response=await fetch(url.href,{signal:bounded,redirect:'error',headers:{
    'user-agent':'BourbonSignalEngine/0.1 (+https://bourbonsignal.com; research prototype)',
    accept:'text/html,application/json,text/plain,*/*','accept-language':'en-US,en;q=0.9',...headers}});
  const retryAfter=response.headers.get('retry-after')||'';
  const metadata={ok:response.ok,status:response.status,url:response.url||'',
    retryAfterSeconds:Math.max(0,Number(retryAfter)||(Date.parse(retryAfter)-Date.now())/1000||0)};
  try{await onResponse?.(metadata);}catch(error){await response.body?.cancel?.().catch(()=>{});throw error;}
  if(!response.ok){await response.body?.cancel?.().catch(()=>{});return{...metadata,text:''};}
  bounded.throwIfAborted();
  return{...metadata,text:(await readBoundedCollectionBody(response,{signal:bounded,maxBytes})).toString('utf8')};
}
export function fetchReviewedCityHiveText(value,{reviewedSources=CENTRAL_CITYHIVE_EXPANSION_SOURCES,...options}={}){
  return fetchReviewedFirstPartyText(value,{...options,maxTimeoutMs:10_000,isAllowedUrl:url=>reviewedSources.some(source=>source.baseUrl===url.origin)&&url.pathname==='/shop/'});
}

export function validateCityHiveIncidentJournal(value,state,reviewedSources=CENTRAL_CITYHIVE_EXPANSION_SOURCES){
  if(value===null)return{schemaVersion:1,state,hosts:{},inFlight:null};
  const hosts=new Set(reviewedSources.filter(source=>source.state===state).map(source=>source.hostname));
  if(value.schemaVersion!==1||value.state!==state||!value.hosts||typeof value.hosts!=='object'||Array.isArray(value.hosts)
    ||Object.keys(value).some(key=>!['schemaVersion','state','hosts','inFlight'].includes(key)))throw Error('CityHive incident journal is malformed');
  for(const[host,entry]of Object.entries(value.hosts))if(!hosts.has(host)||!entry||!CITYHIVE_DENIAL_STATUSES.has(entry.httpStatus)
    ||Object.keys(entry).some(key=>!['httpStatus','lastAttemptAt','nextAllowedAt'].includes(key))
    ||!Number.isFinite(Date.parse(entry.lastAttemptAt))||!Number.isFinite(Date.parse(entry.nextAllowedAt))
    ||Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)<CITYHIVE_DENIAL_MINIMUM_MS)throw Error('CityHive incident journal has invalid host cooldowns');
  if(value.inFlight!==null&&(!value.inFlight||Object.keys(value.inFlight).some(key=>!['attemptId','startedAt'].includes(key))
    ||!/^[a-f0-9-]{36}$/.test(value.inFlight.attemptId)||!Number.isFinite(Date.parse(value.inFlight.startedAt))))throw Error('CityHive incident journal has an invalid in-flight latch');
  return value;
}
export async function readCityHiveIncidentJournal(file,state,reviewedSources){
  let value;try{value=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return validateCityHiveIncidentJournal(null,state,reviewedSources);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Existing CityHive incident journal must be an object');
  return validateCityHiveIncidentJournal(value,state,reviewedSources);
}
// Only incident metadata crosses aborts. Inventory always uses the separately
// abort-aware collection writer. A pre-HTTP latch survives failed denial writes.
export function persistCityHiveIncidentJournal(file,value){
  mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temporary,JSON.stringify(value,null,2));renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}
}

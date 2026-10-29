import {mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {readBoundedCollectionBody} from '../core/collection-http.mjs';
import {LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS} from '../louisiana-alaska-grocery-production-config.mjs';
import {collectionRequestSignal} from '../core/collection-context.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES,LOUISIANA_ALASKA_RESOLVER_ZIPS} from './louisiana-alaska-grocery-premises.mjs';

const DENIALS=new Set([401,403,429,435]),DAY=86_400_000;
const keys={resolver:'7bad9afbb87043b28519c4443106db06',inventory:'e914eec9448c4d5eb672debf5011cf8f'};
export function louisianaAlaskaRequestIdentity(value){
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error('Unreviewed grocery transport identity');
  if(u.hostname==='www.safeway.com'&&u.pathname==='/abs/pub/xapi/storeresolver/v2/all'
    &&Object.values(LOUISIANA_ALASKA_RESOLVER_ZIPS).flat().includes(u.searchParams.get('zipcode'))
    &&u.searchParams.get('radius')==='50'&&u.searchParams.get('size')==='100'&&[...u.searchParams].length===3)return'resolver';
  const source=LOUISIANA_ALASKA_GROCERY_SOURCES.find(source=>source.host===u.hostname&&source.merchantId===u.searchParams.get('storeid')&&source.banner===u.searchParams.get('banner'));
  const expected={url:`https://${u.hostname}`,pageurl:`https://${u.hostname}`,pagename:'search',rows:'100',start:'0','search-type':'keyword',featured:'true','search-uid':'',channel:'instore'};
  if(!source||u.pathname!=='/abs/pub/xapi/search/substitute'||Object.entries(expected).some(([key,value])=>u.searchParams.get(key)!==value)
    ||!/^\d+$/.test(u.searchParams.get('request-id')||'')||!u.searchParams.get('q')||u.searchParams.get('q').length>200
    ||[...u.searchParams].length!==Object.keys(expected).length+4)throw Error('Unreviewed grocery store/channel request');
  return'inventory';
}
export function validateLouisianaAlaskaIncidentJournal(value,state){
  const hosts=new Set(['www.safeway.com',...LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===state).map(source=>source.host)]);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Grocery incident journal is malformed');
  for(const[key,entry]of Object.entries(value)){
    if(!key.startsWith('host:')||!hosts.has(key.slice(5))||!['in_flight','access_denied'].includes(entry?.status)
      ||entry.status==='access_denied'&&(!DENIALS.has(Number(entry.httpStatus))||entry.reviewRequired!==true)
      ||entry.status==='in_flight'&&(entry.httpStatus!==null||!entry.requestId||!/^[a-f0-9]{64}$/.test(entry.urlSha256||''))
      ||!Number.isFinite(Date.parse(entry.lastAttemptAt))||!Number.isFinite(Date.parse(entry.nextAllowedAt))
      ||Date.parse(entry.nextAllowedAt)-Date.parse(entry.lastAttemptAt)<DAY)throw Error('Grocery incident journal contains an invalid host or suspension');
  }
  return value;
}
// These small writes must survive cancellation of the inventory publication.
export function persistLouisianaAlaskaIncidentJournal(file,value){
  mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temporary,JSON.stringify(value,null,2));renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}
}
export async function fetchReviewedLouisianaAlaskaText(value,options={}){
  const kind=louisianaAlaskaRequestIdentity(value),timeout=AbortSignal.timeout(Math.min(LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS,Number(options.timeoutMs)||LOUISIANA_ALASKA_GROCERY_REQUEST_TIMEOUT_MS));
  const signal=collectionRequestSignal(options.signal?AbortSignal.any([options.signal,timeout]):timeout);
  signal?.throwIfAborted();
  // Native redirect:error cannot follow a Location header. Keep the response
  // available long enough to durably record denied headers even on late abort.
  const response=await fetch(value,{signal,redirect:'error',headers:{accept:'application/json','ocp-apim-subscription-key':keys[kind]}});
  const finalUrl=response.url||String(value),retryHeader=response.headers.get('retry-after');
  const retryAfterSeconds=/^\d+$/.test(retryHeader||'')?Number(retryHeader):Math.max(0,(Date.parse(retryHeader||'')-Date.now())/1000)||0;
  const result={ok:response.ok,status:response.status,url:finalUrl,text:'',contentType:response.headers.get('content-type')||'',retryAfterSeconds};
  try{
    const canonical=value=>{const u=new URL(value);u.searchParams.sort();return u.href;};
    if(canonical(finalUrl)!==canonical(value))throw Error('Grocery transport final URL changed');
    // Record bound denied headers before attempting to read a challenged/aborted body.
    await options.onResponse?.(result);
    if(DENIALS.has(response.status)){await response.body?.cancel?.().catch(()=>{});return result;}
    result.text=(await readBoundedCollectionBody(response,{maxBytes:Math.min(4*1024*1024,Number(options.maxBytes)||4*1024*1024),signal})).toString('utf8');return result;
  }catch(error){await response.body?.cancel?.().catch(()=>{});throw error;}
}

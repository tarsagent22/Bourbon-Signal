import {readFile} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sourceErrorForHttp} from './sources/source-error.mjs';

export const NJ_MI_DENIAL_STATUSES=new Set([401,403,429,435]);
const minimum=24*60*60_000;
export async function readNjMiResearchJournal(file){
  let text;try{text=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return{schemaVersion:1,hosts:{}};throw error;}
  const value=JSON.parse(text);
  if(value?.schemaVersion!==1||!value.hosts||typeof value.hosts!=='object'||Array.isArray(value.hosts)
    ||Object.keys(value).some(key=>!['schemaVersion','hosts'].includes(key)))throw Error('Invalid NJ/MI incident journal');
  for(const[hostname,row]of Object.entries(value.hosts))if(!/^[a-z0-9.-]+$/.test(hostname)||!row||row.reviewRequired!==true
    ||!['http_denial','zero_qualified_inventory'].includes(row.reason)||!Number.isFinite(Date.parse(row.observedAt))
    ||!Number.isFinite(Date.parse(row.nextAllowedAt))||Date.parse(row.nextAllowedAt)-Date.parse(row.observedAt)<minimum
    ||(row.reason==='http_denial'&&!NJ_MI_DENIAL_STATUSES.has(row.httpStatus)))throw Error('Invalid NJ/MI host incident');
  return value;
}
export function writeNjMiResearchIncident(file,journal,hostname,{httpStatus,observedAt,reason='http_denial',retryAfterSeconds=0}={}){
  const delay=Math.max(minimum,Number.isFinite(Number(retryAfterSeconds))?Math.max(0,Number(retryAfterSeconds))*1000:0);
  const nextAllowedAt=new Date(Math.min(8_640_000_000_000_000,Date.parse(observedAt)+delay)).toISOString();
  const next={schemaVersion:1,hosts:{...journal.hosts,[hostname]:{reason,httpStatus,observedAt,nextAllowedAt,reviewRequired:true}}};
  const temporary=`${file}.${process.pid}.${randomUUID()}.tmp`;
  try{
    mkdirSync(path.dirname(file),{recursive:true});writeFileSync(temporary,JSON.stringify(next,null,2));renameSync(temporary,file);
  }catch(error){
    if(NJ_MI_DENIAL_STATUSES.has(httpStatus))throw sourceErrorForHttp(httpStatus,'NJ/MI denial incident persistence failed',{
      cause:error,details:{incidentWriteFailed:true,retryAfterSeconds:delay/1000}});
    throw error;
  }finally{rmSync(temporary,{force:true});}
  return next;
}

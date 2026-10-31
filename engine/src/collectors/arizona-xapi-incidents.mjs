import {readFile} from 'node:fs/promises';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function arizonaXapiIncidents({file=path.resolve('out/browser/AZ-grocery-xapi-incidents.json'),persist=true,nowMs=Date.now()}={}) {
  let incidents={};
  if(persist)try{incidents=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Arizona grocery denial ledger is unreadable',{cause:error});}
  if(!incidents||typeof incidents!=='object'||Array.isArray(incidents))throw new Error('Invalid Arizona grocery denial ledger');
  for(const [host,entry]of Object.entries(incidents))if(!['www.safeway.com','www.albertsons.com'].includes(host)
    ||![401,403,429,435].includes(entry?.httpStatus)||!Number.isFinite(Date.parse(entry.observedAt))
    ||!Number.isFinite(Date.parse(entry.nextAllowedAt))||Date.parse(entry.nextAllowedAt)-Date.parse(entry.observedAt)<86_400_000)
    throw new Error('Invalid Arizona grocery denial incident');
  const blocked=new Set(Object.entries(incidents).filter(([,entry])=>Date.parse(entry.nextAllowedAt)>nowMs).map(([host])=>host));
  return {blocked,record(host,httpStatus){
    const observedAt=new Date().toISOString();blocked.add(host);
    incidents[host]={httpStatus,observedAt,nextAllowedAt:new Date(Date.parse(observedAt)+86_400_000).toISOString()};
    if(persist){mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,JSON.stringify(incidents));renameSync(temporary,file);}
  }};
}

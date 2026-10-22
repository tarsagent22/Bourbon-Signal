import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { signPilotReceipt, PILOT_RECEIPT_HEADER, PILOT_RECEIPT_SOURCES, PILOT_RECEIPT_CONTRACT } from '../src/lib/nationwide-pilot-receipt.ts';

const base='https://www.bourbonsignal.com';
const out=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9) || '.operator/nationwide-pilot-capture.json');
const evidence={contractVersion:'bourbon-signal/pilot-capture@1',capturedAt:new Date().toISOString(),
  commit:process.env.GITHUB_SHA || null,verificationRunId:process.env.GITHUB_RUN_ID || null,
  scheduler:null,receipts:[],errors:[]};
async function get(url,headers={}) {
  const response=await fetch(url,{headers:{...headers,'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
  const text=await response.text();
  if(Buffer.byteLength(text)>2*1024*1024) throw new Error('Evidence response exceeded size budget.');
  let payload;try{payload=JSON.parse(text);}catch{throw new Error('Evidence response was not JSON.');}
  return {url:String(url),status:response.status,receivedAt:new Date().toISOString(),sha256:createHash('sha256').update(text).digest('hex'),payload};
}
try {
  const key=process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || '';
  const secret=process.env.SOURCE_SCHEDULER_SECRET || '';
  if(key.length<32 || !secret) throw new Error('Pilot evidence credentials unavailable.');
  // Older deployments recognize monitor, so a rolling deployment can never
  // interpret this evidence read as an inventory collection request.
  evidence.scheduler=await get(`${base}/api/ops/source-scheduler?read=1&monitor=1`,{authorization:`Bearer ${secret}`});
  for(const [sourceId,{state}] of Object.entries(PILOT_RECEIPT_SOURCES)) for(const endpoint of ['drops','coverage']) {
    const url=new URL(`/api/${endpoint}`,base);
    url.search=new URLSearchParams({state,limit:'1',source_receipt:sourceId,_bs_verify:`${Date.now()}-${randomBytes(6).toString('hex')}`}).toString();
    evidence.receipts.push(await get(url,{[PILOT_RECEIPT_HEADER]:signPilotReceipt(url,key)}));
  }
} catch(error) {evidence.errors.push(error instanceof Error?error.message:'Pilot evidence unavailable.');}
await mkdir(path.dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(evidence,null,2)+'\n');
const ok=evidence.errors.length===0 && evidence.scheduler?.status===200 && evidence.receipts.length===4
  && evidence.receipts.every(row=>row.status===200 && row.payload?.contractVersion===PILOT_RECEIPT_CONTRACT);
console.log(JSON.stringify({ok,capturedAt:evidence.capturedAt,receipts:evidence.receipts.length,errors:evidence.errors}));
if(!ok)process.exitCode=1;

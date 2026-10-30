import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepareGroceryCanary} from './prepare-grocery-canary.mjs';
import {prepareCentralCityHiveCanary} from './prepare-central-cityhive-canary.mjs';
import {isVerifiedActiveRenewalCanary} from './active-renewal-capture-proof.mjs';

const attestations=new WeakMap(),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const states=new Set(['WA','NM','WI','OK']);
const locationIdentity=rows=>rows.map(row=>[row.state,row.storeId||row.id,row.storeName||row.name,
  row.storeAddress||row.address,row.city,row.zip,row.lat,row.lng]).sort((a,b)=>String(a[1]).localeCompare(String(b[1])));

// A serialized marker is insufficient. Re-run the existing exact-head full raw
// source preparer in this process, then bind the identical candidate privately.
export async function attestActiveRenewalCanaryHealth(candidate,options={}){
  assert.ok(states.has(candidate?.state),'Only admitted active-four raw renewal is reviewed for canary health');
  const prepare=['WA','NM'].includes(candidate.state)?prepareGroceryCanary:prepareCentralCityHiveCanary;
  const parsed=await prepare({...options,state:candidate.state});
  assert.equal(JSON.stringify(parsed),JSON.stringify(candidate),'Serialized canary input differs from its complete immutable raw reparse');
  assert.ok(isVerifiedActiveRenewalCanary(parsed,{nowMs:options.nowMs??Date.now(),lifecycle:options.lifecycleConfig}),'Current complete native renewal proof required');
  const token=Object.freeze({state:candidate.state});
  attestations.set(token,{candidate,digest:digest(candidate)});
  return token;
}

export function verifiedCanaryReplacementProof(token,{state,rows,locations,generatedAt}={}){
  const record=token&&typeof token==='object'?attestations.get(token):null;
  if(!record||record.digest!==digest(record.candidate)||!isVerifiedActiveRenewalCanary(record.candidate))return null;
  const candidate=record.candidate;
  if(candidate.state!==state||candidate.generatedAt!==generatedAt||JSON.stringify(candidate.drops)!==JSON.stringify(rows)
    ||JSON.stringify(locationIdentity(candidate.locations))!==JSON.stringify(locationIdentity(locations)))return null;
  return candidate.activeRenewalProof;
}

// CLI artifact paths are fixed by the existing reviewed family downloaders.
export async function attestActiveRenewalCanaryHealthFromArtifact(candidate,{bible,artifactDirectory,provenanceFile,nowMs=Date.now()}={}){
  assert.ok(states.has(candidate?.state));
  const provenance=JSON.parse(await readFile(provenanceFile,'utf8')),reports=[];
  let entries=0;async function visit(directory,depth=0){assert.ok(depth<=5,'Unbounded source artifact depth');for(const entry of await readdir(directory,{withFileTypes:true})){assert.ok(++entries<=600,'Unbounded source artifact entries');const file=path.join(directory,entry.name);if(entry.isDirectory())await visit(file,depth+1);else if(entry.name==='report.json'){const bytes=await readFile(file);assert.ok(bytes.length<=8*1024*1024);const report=JSON.parse(bytes);if(report.state===candidate.state&&String(report.metadata?.origin?.workflowRunId)===provenance.workflowRunId)reports.push({report,reportDirectory:path.dirname(file)});}}}
  await visit(artifactDirectory);assert.equal(reports.length,1,'One exact original state source report is required');
  return attestActiveRenewalCanaryHealth(candidate,{...reports[0],bible,provenance,nowMs});
}

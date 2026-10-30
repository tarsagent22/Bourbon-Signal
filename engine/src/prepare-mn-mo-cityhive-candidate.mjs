import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {MN_MO_COHORTS,mnMoSourcesForState} from './collectors/mn-mo-cityhive-premises.mjs';
import {parseMnMoCityHiveResearch} from './collectors/mn-mo-cityhive-research.mjs';
import {isMnMoCityHiveResearchInventory} from './mn-mo-cityhive-policy.mjs';
// Source-only preparation. It neither creates a canary authority nor overrides
// inactive lifecycle or the normal customer inventory gates.
export async function prepareMnMoCityHiveCandidate({state,profile='core5',report,reportDirectory,bible,provenance,nowMs=Date.now()}={}){
 const sources=mnMoSourcesForState(state,profile),start=Date.parse(report?.startedAt||''),finish=Date.parse(report?.finishedAt||'');if(!sources.length||report?.state!==state||report.profile!==profile||report.status!=='useful'||report.stale===true||!Number.isFinite(start)||!Number.isFinite(finish)||start>finish||finish>nowMs
  ||report.metadata?.scope!=='inactive_closed_mn_mo_native_candidate_preparation'||report.metadata.complete!==true||report.metadata.profile!==profile||report.metadata.requestCount!==sources.length||report.roadblocks?.length!==0
  ||report.metadata.cohortSha256!==MN_MO_COHORTS[profile]?.[state]||report.metadata.shadowOnly!==true||report.metadata.productionActivationAllowed!==false||report.metadata.customerDeliveryAllowed!==false
  ||JSON.stringify(report.metadata.selectedStores)!==JSON.stringify(sources.map(s=>s.storeId))||report.sources?.length!==sources.length||report.sources.some(s=>s.ok!==true||s.matchedBottleCount<1)
  ||new Set(report.metadata.verifiedPremises||[]).size!==sources.length||sources.some(s=>!report.metadata.verifiedPremises.includes(s.storeId)||!report.sources.some(r=>r.sourceRuntimeId===`research:${state.toLowerCase()}:mn-mo-cityhive:${profile}:${s.merchantId}`&&r.url===s.queryUrl)))throw Error('Complete exact inactive candidate report required');
 const origin=report.metadata.origin;
 if(origin?.kind!=='github_actions'||origin.repository!=='tarsagent22/Bourbon-Signal'||origin.runAttempt!=='1'
  ||provenance?.status!=='verified_github_shadow_artifact'||provenance.state!==state||provenance.repository!==origin.repository||String(origin.workflowRunId)!==provenance.workflowRunId
  ||origin.commitSha!==provenance.headSha||provenance.headSha!==provenance.currentHead||!/^[a-f0-9]{40}$/.test(provenance.headSha||'')
  ||!/^[a-f0-9]{64}$/.test(provenance.artifactDigest||'')||!/^\d+$/.test(provenance.artifactId||''))throw Error('Future verified exact-head GitHub download proof required; historical/local fixtures are not qualification');
 const receipts=report.metadata.receipts;if(!Array.isArray(receipts)||receipts.length!==sources.length)throw Error('Exact candidate receipt profile required');const seen=new Set(),rows=[];
 for(const receipt of receipts){const source=sources.find(s=>s.storeId===receipt.storeId&&s.queryUrl===receipt.url),observed=Date.parse(receipt.observedAt||''),age=nowMs-observed;
  if(!source||seen.has(source.storeId)||receipt.finalUrl!==receipt.url||receipt.status!==200||!Number.isFinite(age)||age<0||age>2*60*60_000||observed<Date.parse(report.startedAt)||observed>Date.parse(report.finishedAt)
   ||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024||!/^source-captures\/[a-zA-Z0-9_.-]+\.txt$/.test(receipt.artifactPath||''))throw Error('Foreign, stale, duplicate or malformed native receipt');
  const body=await readFile(path.join(reportDirectory,receipt.artifactPath));if(body.length!==receipt.bytes||createHash('sha256').update(body).digest('hex')!==receipt.sha256)throw Error('Native candidate body hash/length mismatch');
  const parsed=parseMnMoCityHiveResearch(body.toString(),source,bible,{observedAt:receipt.observedAt,profile});if(!parsed.length||!parsed.every(row=>isMnMoCityHiveResearchInventory(row,{nowMs})))throw Error('Current raw product/premise/pickup proof required');rows.push(...parsed);seen.add(source.storeId);
 }
 if(seen.size!==sources.length)throw Error('Incomplete reviewed candidate cohort');
 return{schemaVersion:1,state,profile,scope:'RAW_REPARSED_INACTIVE_SOURCE_CANDIDATE_NOT_CANARY_OR_PRODUCTION_ADMISSION',generatedAt:report.finishedAt,cohortSha256:MN_MO_COHORTS[profile][state],workflowSource:provenance,sourceReceipts:receipts,originalSourceClockPreserved:true,selectedStoreIds:sources.map(s=>s.storeId),rows,
  requiredFutureShadowRuns:3,requiredFutureCanaryRuns:2,productionActivationAllowed:false,customerDeliveryAllowed:false,customerStoresAdded:0};
}

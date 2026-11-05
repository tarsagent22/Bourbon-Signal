import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {reviewedActiveGroceryCohort,partitionCandidatePremises} from './engine-expansion-delivery-policy.mjs';
const arg=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=file=>readFile(file,'utf8').then(JSON.parse);
const save=async(file,value)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');};
const must=(condition,message)=>{if(!condition)throw Error(message);};

async function main(){
 if(process.argv.includes('--help')){console.log('Node24. Capture before release: --mode=baseline --repo=<checkout> --out=<new-baseline-dir>. Verify after guarded merge+successful CA,NV refresh: --mode=verify --repo=<checkout> --out=<new-proof-dir> --baseline=<baseline-dir> --commit=<40hex> --run=<workflow-id> --minimum=100. Requires existing BLOB_READ_WRITE_TOKEN and ENGINE_SNAPSHOT_ENCRYPTION_KEY. Default proof combines immutable exact-store inventory, authorized signed canonical Feed counts, and exact-address live Coverage using shared Feed eligibility. Optional authorized paid customer session in BOURBON_SIGNAL_CUSTOMER_COOKIE or BOURBON_SIGNAL_CUSTOMER_BEARER adds individual store-filtered Feed proof. Secrets are never saved. This script only reads production.');return;}
 const repo=path.resolve(arg('repo')||''),mode=arg('mode'),out=arg('out');
 must(['baseline','verify'].includes(mode)&&arg('repo')&&out,'Explicit --repo, --mode and --out required');
 must(process.env.BLOB_READ_WRITE_TOKEN&&process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY,'Existing production read credentials are required');
 const module=relative=>import(pathToFileURL(path.join(repo,relative)).href);
 const {VercelBlobSnapshotStorage}=await module('src/lib/vercel-blob-snapshot-storage.ts');
 const {canonicalJson,decryptSnapshotObject}=await module('engine/src/data-plane/site-snapshot-contract.mjs');
 const {isPublicDropFeedEligible,isCurrentInventoryEvidence,normalizePublicDropEvidenceInput,publicEvidenceAddressKey}=await module('src/lib/public-drop-evidence.ts');
 const {signEngineFeedVerification,ENGINE_FEED_VERIFICATION_HEADER}=await module('src/lib/engine-feed-verification.ts');
 const registry=await module('engine/src/collectors/national-grocery-reviewed-premises.mjs');
 const storage=new VercelBlobSnapshotStorage(),base='https://www.bourbonsignal.com';
 const keyFor=row=>{const r=normalizePublicDropEvidenceInput(row);return publicEvidenceAddressKey(r.state,r.storeAddress,r.city);};
 const cohort=arg('cohort')||'reviewed-additions';must(['reviewed-additions','active-CA-NV','active-CA-NV-IL'].includes(cohort),'Unreviewed cohort selection');
 const active=cohort.startsWith('active-');
 const ca=active?(await module('engine/src/collectors/california-grocery-premises.mjs')).CALIFORNIA_GROCERY_SOURCES:registry.CALIFORNIA_REVIEWED_BREADTH_SOURCES;
 const nv=active?(await module('engine/src/collectors/nevada-retailer-surfaces.mjs')).NEVADA_RETAILER_SOURCES.filter(source=>source.platform==='albertsons-xapi'&&source.inventoryEligible===true):registry.NEVADA_REVIEWED_BREADTH_SOURCES;
 const il=cohort==='active-CA-NV-IL'?(await module('engine/src/collectors/illinois-grocery-premises.mjs')).ILLINOIS_GROCERY_SOURCES:[];
 const expected=reviewedActiveGroceryCohort({california:ca,nevada:nv,illinois:il}),states=cohort==='active-CA-NV-IL'?['CA','NV','IL']:['CA','NV'];
 must(expected.length&&new Set(expected.map(store=>keyFor({...store,storeAddress:store.address}))).size===expected.length,'Reviewed registry must contain distinct exact premises');
 const request=async(route,{body,customer=false,verification=false,allow503=false}={})=>{
  const url=new URL(route,base);url.searchParams.set('_bs_verify',`${Date.now()}-${randomBytes(6).toString('hex')}`);
  const headers={'cache-control':'no-cache','content-type':'application/json'};
  if(customer){if(process.env.BOURBON_SIGNAL_CUSTOMER_COOKIE)headers.cookie=process.env.BOURBON_SIGNAL_CUSTOMER_COOKIE;if(process.env.BOURBON_SIGNAL_CUSTOMER_BEARER)headers.authorization='Bearer '+process.env.BOURBON_SIGNAL_CUSTOMER_BEARER;}
  if(verification)headers[ENGINE_FEED_VERIFICATION_HEADER]=signEngineFeedVerification(url,process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY);
  const response=await fetch(url,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
  must(response.ok||allow503&&response.status===503,`Customer API ${url.pathname} returned ${response.status}`);
  return{status:response.status,snapshotId:response.headers.get('x-engine-snapshot'),payload:await response.json()};
 };
 const pointer=await storage.readPointer();must(pointer?.active,'No authoritative active snapshot');
 const manifest=JSON.parse(await storage.readObject(`engine/snapshots/${pointer.active}/manifest.json`));
 const {snapshotId,manifestHash,...unsigned}=manifest;
 must(snapshotId===pointer.active&&hash(canonicalJson(unsigned))===manifestHash&&snapshotId.endsWith(manifestHash.slice(0,16)),'Authoritative manifest integrity failed');
 const files={};
 for(const name of ['stats.json','drops.json',...states.map(state=>`states/${state}/drops.json`)]){
  const descriptor=manifest.files[name];must(descriptor&&descriptor.path===name,'Required snapshot partition missing: '+name);
  const encrypted=await storage.readObject(`engine/snapshots/${snapshotId}/files/${name}.enc`);must(encrypted,'Missing encrypted partition');
  const plaintext=decryptSnapshotObject(encrypted,process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY);
  must(Buffer.byteLength(plaintext)===descriptor.bytes&&hash(plaintext)===descriptor.sha256,'Snapshot partition hash mismatch: '+name);
  files[name]=JSON.parse(plaintext);
 }
 const coverage=await request('/api/coverage'),stats=await request('/api/stats');
 must(stats.snapshotId===snapshotId,'Customer Stats serves another snapshot');
 const capture={schemaVersion:1,kind:mode==='baseline'?'pre_release_authoritative_baseline':'post_refresh_authoritative_capture',capturedAt:new Date().toISOString(),pointer,manifest,files,coverage,stats,registry:expected};
 if(mode==='baseline'){
  must((await storage.readPointer())?.active===snapshotId,'Snapshot changed during baseline capture');
  const serialized=JSON.stringify(capture,null,2)+'\n';await mkdir(out,{recursive:true});
  const target=path.join(out,'baseline.json');await writeFile(target,serialized,{flag:'wx'});await writeFile(path.join(out,'baseline.sha256'),hash(serialized)+'\n',{flag:'wx'});
  console.log(JSON.stringify({stage:'baseline_captured',snapshotId,manifestHash,capturedAt:capture.capturedAt,coverageGainClaimed:false}));return;
 }
 must(arg('baseline')&&/^[a-f0-9]{40}$/.test(arg('commit')||'')&&/^\d+$/.test(arg('run')||''),'Verification requires --baseline, exact --commit and --run');
 const individualFeedProof=Boolean(process.env.BOURBON_SIGNAL_CUSTOMER_COOKIE||process.env.BOURBON_SIGNAL_CUSTOMER_BEARER);
 const minimum=Number(arg('minimum')||100);must(Number.isInteger(minimum)&&minimum>=100,'Acceptance minimum must be at least100');
 const baselineDir=path.resolve(arg('baseline')),raw=await readFile(path.join(baselineDir,'baseline.json'),'utf8');
 must(hash(raw)===(await readFile(path.join(baselineDir,'baseline.sha256'),'utf8')).trim(),'Baseline file changed');
 const baseline=JSON.parse(raw);must(baseline.kind==='pre_release_authoritative_baseline'&&Date.parse(baseline.capturedAt)<Date.parse(manifest.generatedAt)&&baseline.manifest.snapshotId!==snapshotId,'A distinct pre-release baseline is required');
 const exec=promisify(execFile),run=JSON.parse((await exec(process.platform==='win32'?'gh.exe':'gh',['run','view',arg('run'),'--repo','tarsagent22/Bourbon-Signal','--json','databaseId,headSha,status,conclusion,workflowName,createdAt,updatedAt,url'],{windowsHide:true,maxBuffer:1024*1024})).stdout);
 must(run.headSha===arg('commit')&&run.status==='completed'&&run.conclusion==='success'&&run.workflowName==='Refresh production inventory feed','Targeted refresh must succeed at the expected commit');
 must(manifest.engineCommit===arg('commit')&&manifest.appCommit===arg('commit'),'Production manifest source/app commit mismatch');
 const health=await request('/api/ops/health',{allow503:true});
 must(health.snapshotId===snapshotId&&health.payload.release?.commit===arg('commit')&&health.payload.release?.deploymentId,'Live application deployment does not match the expected commit and snapshot');
 must(Date.parse(baseline.capturedAt)<Date.parse(run.createdAt)&&Date.parse(manifest.generatedAt)>=Date.parse(run.createdAt)&&Date.parse(manifest.generatedAt)<=Date.parse(run.updatedAt)+60000,'Baseline/refresh/manifest ordering mismatch');
 const oldId=baseline.manifest?.snapshotId;
 must(typeof oldId==='string'&&/^[0-9TZ-]+-[a-f0-9]{16}$/.test(oldId),'Invalid baseline snapshot identity');
 const remoteOldManifest=JSON.parse(await storage.readObject(`engine/snapshots/${oldId}/manifest.json`));
 const {snapshotId:oldSnapshot,manifestHash:oldHash,...oldUnsigned}=remoteOldManifest;
 must(oldSnapshot===oldId&&hash(canonicalJson(oldUnsigned))===oldHash&&canonicalJson(remoteOldManifest)===canonicalJson(baseline.manifest),'Saved baseline is not the immutable published manifest');
 const priorPlaintext=decryptSnapshotObject(await storage.readObject(`engine/snapshots/${oldId}/files/drops.json.enc`),process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY);
 must(Buffer.byteLength(priorPlaintext)===remoteOldManifest.files['drops.json'].bytes&&hash(priorPlaintext)===remoteOldManifest.files['drops.json'].sha256,'Published baseline drops hash mismatch');
 must(canonicalJson(JSON.parse(priorPlaintext))===canonicalJson(baseline.files?.['drops.json']),'Saved baseline drops do not match published immutable baseline');
 const beforeRows=JSON.parse(priorPlaintext).drops;must(Array.isArray(beforeRows),'Baseline has no authoritative inventory rows');
 const allRows=files['drops.json'].drops;
 must(Array.isArray(allRows),'Published global drops missing');
 const gained=[],{candidates,excluded}=partitionCandidatePremises(expected,{baselineRows:beforeRows,currentRows:allRows,premiseKey:keyFor,isEligible:row=>isPublicDropFeedEligible(row,{asOf:Date.now()})&&isCurrentInventoryEvidence(row,Date.now())});
 for(const {store,premise,rows} of candidates){
  const partition=files[`states/${store.state}/drops.json`].drops;must(Array.isArray(partition)&&rows.every(row=>partition.some(candidate=>candidate.id===row.id&&keyFor(candidate)===premise)),'Global/state partition mismatch');
  let feed=null,matching=[];
  if(individualFeedProof){
   feed=await request(`/api/drops?state=${store.state}&store=${encodeURIComponent(store.name)}&limit=100`,{customer:true});
   must(feed.snapshotId===snapshotId,'Live Feed serves another snapshot');
   matching=(feed.payload.drops||[]).filter(row=>keyFor(row)===premise&&isPublicDropFeedEligible(row,{asOf:Date.now()})&&isCurrentInventoryEvidence(row,Date.now()));
   if(!matching.length){excluded.push({...store,reason:'missing_live_customer_feed'});continue;}
   must(matching.some(row=>rows.some(published=>String(published.productId||published.product_id)===String(row.productId||row.product_id)&&Number(published.price)===Number(row.price))),'Live Feed product/price disagrees with immutable artifact');
  }
  const search=await request('/api/coverage',{body:{state:store.state,query:store.address}});
  const covered=(search.payload.results||[]).find(result=>result.kind==='store'&&publicEvidenceAddressKey(store.state,result.address,result.city)===premise&&['actively-monitored','covered','partially-covered'].includes(result.status));
  if(!covered){excluded.push({...store,reason:'missing_exact_premise_customer_coverage'});continue;}
  gained.push({...store,rows:rows.length,...(individualFeedProof?{liveFeedRows:matching.length}:{}),coverageStatus:covered.status,proof:{...(feed?{feed}:{}),coverage:search}});
 }
 const stateCounts=[];
 for(const state of states){
  const count=await request(`/api/drops?state=${state}&limit=1`,{verification:true});
  must(count.snapshotId===snapshotId&&count.payload.contractVersion==='bourbon-signal/engine-feed-count@1'&&count.payload.state===state,'Canonical Feed count snapshot/contract mismatch');
  const entry=coverage.payload.states?.find(entry=>entry.code===state);must(entry&&entry.freshness?.staleInventoryStores===0,'State Coverage missing or stale stores present');
  const eligible=allRows.filter(row=>normalizePublicDropEvidenceInput(row).state===state&&isPublicDropFeedEligible(row,{asOf:Date.now()})&&isCurrentInventoryEvidence(row,Date.now()));
  must(count.payload.total>=eligible.length,'Live canonical Feed count dropped published eligible inventory');stateCounts.push({state,liveFeedTotal:count.payload.total,eligiblePublishedRows:eligible.length,coverage:entry});
 }
 must((await storage.readPointer())?.active===snapshotId,'Active snapshot changed during acceptance; rerun against a stable publication');
 const result={stage:gained.length>=minimum?'production_delivery_verified':'production_delivery_target_not_met',verifiedAt:new Date().toISOString(),minimum,cohort,reviewedExpectedPremises:expected.length,productionNewStores:gained.length,productionNewListings:gained.reduce((sum,store)=>sum+store.rows,0),run,manifestHash,snapshotId,baselineSnapshotId:baseline.manifest.snapshotId,definition:'new relative to latest pre-release authoritative artifact, with fresh immutable inventory and live customer Feed/Coverage proof',feedProofMode:individualFeedProof?'individual_customer_store_filter_plus_canonical_counts':'immutable_default_feed_evidence_plus_signed_canonical_counts_and_live_shared_policy_coverage',health,stateCounts,gained,excluded};
 await save(path.join(out,'post-refresh-capture.json'),capture);await save(path.join(out,'acceptance.json'),result);
 console.log(JSON.stringify({...result,gained:undefined,excluded:undefined,stateCounts:undefined}));must(gained.length>=minimum,`Only${gained.length} genuinely new customer-visible stores verified; minimum${minimum} not met`);
}
main().catch(error=>{console.error(JSON.stringify({stage:'acceptance_failed',error:error.message}));process.exitCode=1;});

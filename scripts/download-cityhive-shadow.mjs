import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {decodeBoundedShadowArchive} from './download-grocery-shadow.mjs';
export {decodeBoundedShadowArchive};

const northDakotaCanarySiteFiles=new Set([
  'engine/data/canary-site/nd-active-candidate/alerts.json',
  'engine/data/canary-site/nd-active-candidate/canary-preview-policy.json',
  'engine/data/canary-site/nd-active-candidate/drops.json',
  'engine/data/canary-site/nd-active-candidate/locations.json',
  'engine/data/canary-site/nd-active-candidate/manifest.json',
  'engine/data/canary-site/nd-active-candidate/source-proof.json',
  'engine/data/canary-site/nd-active-candidate/stats.json',
  'engine/data/canary-site/nd-active-candidate/states/index.json',
  'engine/data/canary-site/nd-active-candidate/states/ND/drops.json',
]);
// These are output/provenance contracts and tests. They do not change ND's
// exact retailer request plans, premises, raw parsers, or denial handling.
const northDakotaReplayPreparationFiles=new Set([
  '.github/workflows/refresh-feed.yml',
  'engine/src/export-site-contract.mjs',
  'engine/src/operational-report.mjs',
  'engine/src/verification/historical-implementation.mjs',
  'engine/test/de-first-publication.test.mjs',
  'engine/test/north-dakota-public-policy.test.mjs',
  'engine/test/north-dakota-retail-production.test.mjs',
  'scripts/test-ms-bundle-boundary.mjs',
  'scripts/test-drop-feed-classification.mts',
  'scripts/test-nd-active-ci-fixture.mjs',
  'scripts/test-north-dakota-public-projection.mts',
  'scripts/verify-active-state-integration-ci.mjs',
]);

const preparationOnly=(state,file)=>[
  '.github/workflows/state-expansion-canary.yml','.github/workflows/state-promotion-provenance.yml',
  'engine/src/prepare-central-cityhive-canary.mjs','engine/src/prepare-central-cityhive-canary-manifest.mjs','engine/src/central-cityhive-fixtures.mjs','engine/src/verify-state-fixtures.mjs','scripts/download-cityhive-shadow.mjs',
  'engine/test/central-cityhive-canary.test.mjs','engine/test/prepare-central-cityhive-canary-manifest.test.mjs','scripts/test-cityhive-shadow-download.mjs','scripts/test-promotion-provenance-runtime-bindings.mjs',
  'scripts/test-central-cityhive-public-canary.mjs','scripts/build-promotion-provenance.mjs','src/lib/drop-feed-visibility.ts',
  'engine/src/build-state-canary-preview.mjs','next.config.ts','src/lib/site-engine-contract.ts',
].includes(file)||/^engine\/data\/(?:state-fixtures|state-integration)\/(?:WI|OK|RI|KS|MO)\.json$/.test(file)
  ||(state==='DE'&&/^engine\/data\/(?:state-fixtures|state-integration)\/DE\.json$/.test(file))
  ||(state==='DE'&&['engine/data/canary-site/de-active-candidate/alerts.json','engine/data/canary-site/de-active-candidate/canary-preview-policy.json',
    'engine/data/canary-site/de-active-candidate/drops.json','engine/data/canary-site/de-active-candidate/locations.json',
    'engine/data/canary-site/de-active-candidate/manifest.json','engine/data/canary-site/de-active-candidate/source-proof.json',
    'engine/data/canary-site/de-active-candidate/stats.json','engine/data/canary-site/de-active-candidate/states/index.json',
    'engine/data/canary-site/de-active-candidate/states/DE/drops.json'].includes(file))
  ||(state==='DE'&&file==='engine/src/central-cityhive-fixtures.mjs')
  ||(state==='DE'&&/^engine\/test\/fixtures\/ks-de-cityhive\/[a-z0-9-]+\.json$/.test(file))
  ||(state==='ND'&&northDakotaCanarySiteFiles.has(file))
  ||(state==='ND'&&northDakotaReplayPreparationFiles.has(file))
  ||(state==='AR'&&/^engine\/data\/(?:state-fixtures|state-integration)\/AR(?:-canary)?\.json$/.test(file))
  ||(state==='MN'&&/^engine\/data\/(?:state-fixtures|state-integration)\/MN\.json$/.test(file))
  ||(state==='MO'&&file==='engine/test/fixtures/central-cityhive/barrel-blends-6226405682c4ff6dfe6d578a.json')
  ||/^engine\/test\/fixtures\/ri-cityhive\/[a-z0-9-]+\.json$/.test(file);
const minnesotaAdapterFiles=new Set([
  'engine/data/state-integration/MN.json',
  'engine/src/central-cityhive-policy.mjs',
  'engine/src/collectors/generic-state.mjs',
  'engine/src/collectors/minnesota-cityhive-production.mjs',
  'engine/src/minnesota-cityhive-production-config.mjs',
  'engine/test/minnesota-cityhive-production.test.mjs',
  'engine/test/fixtures/central-cityhive/mn-top-ten-blaine.json',
]);
const missouriCanarySiteFiles=new Set([
  'engine/data/canary-site/mo-active-candidate/manifest.json',
  'engine/data/canary-site/mo-active-candidate/stats.json',
  'engine/data/canary-site/mo-active-candidate/alerts.json',
  'engine/data/canary-site/mo-active-candidate/locations.json',
  'engine/data/canary-site/mo-active-candidate/drops.json',
  'engine/data/canary-site/mo-active-candidate/canary-preview-policy.json',
  'engine/data/canary-site/mo-active-candidate/states/index.json',
  'engine/data/canary-site/mo-active-candidate/states/MO/drops.json',
]);
const kansasActivationOnlyFiles=new Set([
  '.gitattributes','engine/data/state-integration/KS.json','engine/data/state-fixtures/KS.json','scripts/download-cityhive-shadow.mjs','scripts/test-cityhive-shadow-download.mjs',
  'engine/data/canary-site/kansas-20261114/alerts.json','engine/data/canary-site/kansas-20261114/canary-preview-policy.json',
  'engine/data/canary-site/kansas-20261114/locations.json','engine/data/canary-site/kansas-20261114/manifest.json',
  'engine/data/canary-site/kansas-20261114/source-proof.json','engine/data/canary-site/kansas-20261114/states/KS/drops.json',
  'engine/data/canary-site/kansas-20261114/states/index.json','engine/data/canary-site/kansas-20261114/stats.json',
  'engine/src/verify-ks-first-publication.mjs','engine/src/verification/historical-implementation.mjs','engine/test/helpers/synthetic-central-production.mjs',
  'scripts/test-central-cityhive-public-canary.mjs','engine/test/central-cityhive-production.test.mjs','engine/test/ks-first-publication.test.mjs','engine/test/ks-hosted-preview-evidence.test.mjs',
  'engine/src/central-cityhive-fixtures.mjs','engine/src/central-cityhive-production-config.mjs','engine/src/central-cityhive-state-config.mjs',
  'engine/src/collectors/central-cityhive-expansion.mjs','engine/src/collectors/central-cityhive-premises.mjs','engine/src/collectors/central-cityhive-production.mjs',
  'engine/src/collectors/central-cityhive-transport.mjs','engine/src/run.mjs','.github/workflows/refresh-feed.yml',
  'engine/test/fixtures/ks-cityhive/hosted-coverage-receipt.json','engine/test/fixtures/ks-cityhive/hosted-deployment-receipt.json',
  'engine/test/fixtures/ks-cityhive/hosted-finder-feed-receipt.json','engine/test/fixtures/ks-cityhive/hosted-finder-feed.json',
  'engine/test/fixtures/ks-cityhive/hosted-public-protection-receipt.json','engine/test/fixtures/ks-cityhive/hosted-search-receipt.json',
  'scripts/build-promotion-provenance.mjs','scripts/prepare-legacy-site-fixture-ci.mjs','scripts/sync-sighting-store-directory.mjs',
  'scripts/test-ms-bundle-boundary.mjs','scripts/test-sighting-store-directory.mts','scripts/verify-active-state-integration-ci.mjs',
  'src/config/state-lifecycle.json','src/config/stateLifecycle.ts','src/data/sighting-store-directory.generated.json',
  'engine/test/fixtures/ks-cityhive/receipts.json','engine/test/fixtures/ks-cityhive/kings-weller-special-reserve.json',
  'engine/test/fixtures/ks-cityhive/rj-elijah-and-larceny-barrel-proof.json','engine/test/fixtures/ks-cityhive/verns-larceny-barrel-proof.json',
]);

export function validateInactiveMinnesotaShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison,commit}){
  const lifecyclePath='src/config/state-lifecycle.json';
  if(comparison?.status!=='ahead'||comparison.ahead_by!==1||comparison.behind_by!==0
    ||!Array.isArray(comparison.files)||comparison.files.filter(file=>file.filename===lifecyclePath).length!==1
    ||!Array.isArray(commit?.parents)||commit.parents.length!==1||commit.parents[0].sha!==comparison.base_commit?.sha
    ||!Array.isArray(candidateLifecycle?.activeStates)||!candidateLifecycle.activeStates.includes('MN')
    ||candidateLifecycle.states?.MN?.publicStatus!=='active')return false;
  const expectedShadow=structuredClone(candidateLifecycle);
  expectedShadow.activeStates=expectedShadow.activeStates.filter(id=>id!=='MN');
  expectedShadow.states.MN.publicStatus='research_only';
  return JSON.stringify(expectedShadow)===JSON.stringify(shadowLifecycle);
}

export function validateInactiveMissouriShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison,shadowHeadSha}){
  const lifecyclePath='src/config/state-lifecycle.json';
  if(comparison?.status!=='ahead'||comparison?.base_commit?.sha!==shadowHeadSha
    ||!Array.isArray(comparison?.files)||comparison.files.filter(file=>file.filename===lifecyclePath).length!==1
    ||!Array.isArray(candidateLifecycle?.activeStates)||!candidateLifecycle.activeStates.includes('MO')
    ||candidateLifecycle.states?.MO?.publicStatus!=='active')return false;
  const expectedShadow=structuredClone(candidateLifecycle);
  expectedShadow.activeStates=expectedShadow.activeStates.filter(id=>id!=='MO');
  expectedShadow.states.MO={customerLabel:'Missouri',sourceLabel:'Missouri Costco warehouse bourbon watch',
    publicStatus:'research_only',shadowEligible:true,lifecycle:'blocked_costco_inventory_research',coverageTier:'blocked',
    refinementLevel:'warehouse',inventoryAlertable:false,watchAlertable:false,
    customerSummary:'Research-only: Missouri has Costco warehouse research configuration but no recurring verified observations, so customer coverage and alerts remain blocked.'};
  return JSON.stringify(expectedShadow)===JSON.stringify(shadowLifecycle);
}

export function validateInactiveKansasShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison}){
  if(comparison?.status!=='ahead'||comparison?.ahead_by<1||comparison?.behind_by!==0
    ||comparison?.base_commit?.sha!==comparison.runHeadSha
    ||!Array.isArray(comparison?.files)||comparison.files.filter(file=>file.filename==='src/config/state-lifecycle.json').length!==1
    ||!Array.isArray(candidateLifecycle?.activeStates)||!candidateLifecycle.activeStates.includes('KS')
    ||candidateLifecycle.states?.KS?.publicStatus!=='active'||candidateLifecycle.states?.KS?.promotionStage!=='active'
    ||!Array.isArray(shadowLifecycle?.activeStates)||shadowLifecycle.activeStates.includes('KS')
    ||shadowLifecycle.states?.KS?.publicStatus!=='research_only')return false;
  const expected=structuredClone(candidateLifecycle);expected.activeStates=expected.activeStates.filter(id=>id!=='KS');
  const research=expected.states.KS;research.publicStatus='research_only';
  research.sourceLabel='Kansas reviewed CityHive pickup inventory';research.lifecycle='retailer_inventory_research';
  research.customerSummary='Research-only: a closed three-store Kansas CityHive pickup cohort is being evaluated. This entry does not enable production collection, customer visibility, alerts or delivery.';
  delete research.promotionStage;delete research.promotionEvidence;
  expected.reliabilityPolicy.stateExpectedRunMs.KS=shadowLifecycle.reliabilityPolicy.stateExpectedRunMs.KS;
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  return JSON.stringify(canonical(expected))===JSON.stringify(canonical(shadowLifecycle));
}

export function validateNorthDakotaCohortManifestTransition({candidateManifest,shadowManifest,comparison}){
  const file='engine/data/state-integration/ND.json';
  if(comparison?.status!=='ahead'||comparison?.base_commit?.sha!==comparison.runHeadSha
    ||!Array.isArray(comparison?.files)||comparison.files.filter(row=>row.filename===file).length!==1
    ||comparison.files.some(row=>row.filename!==file))return false;
  const candidate=structuredClone(candidateManifest),shadow=structuredClone(shadowManifest);
  if(candidate?.state!=='ND'||shadow?.state!=='ND'
    ||candidate.collector?.cohortSha256!=='e4fe87fee52a06bd2ae78fa3c541dbc2b578321961a374acf6ae9a62760b767c')return false;
  delete candidate.collector.cohortSha256;
  return JSON.stringify(candidate)===JSON.stringify(shadow);
}

export function validateCityHiveShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison}){
  if(!['WI','OK','RI','MN','KS','AR','MO','MD','DE','ND'].includes(state)||repository!=='tarsagent22/Bourbon-Signal')throw new Error('Unreviewed CityHive research state or repository');
  if(run?.conclusion!=='success'||run.status!=='completed'||run.repository?.full_name!==repository
    ||run.path!=='.github/workflows/state-expansion-shadow.yml'||!/^\d+$/.test(String(run.id))
    ||!/^[a-f0-9]{40}$/.test(run.head_sha||'')||!/^[a-f0-9]{40}$/.test(currentHead||''))throw new Error('Shadow run is not a successful repository-issued shadow workflow');
  if(artifact?.name!==`state-expansion-shadow-${run.id}`||artifact.expired===true
    ||!/^\d+$/.test(String(artifact.id))||!/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    ||!(artifact.size_in_bytes>0&&artifact.size_in_bytes<=128*1024*1024))throw new Error('Missing, expired, oversized or unbound shadow artifact');
  const changes=run.head_sha===currentHead?[]:comparison?.files;
  const inactiveMnShadowTransition=state==='MN'&&changes?.filter(file=>file.filename==='src/config/state-lifecycle.json').length===1
    &&comparison?.status==='ahead'&&Number(comparison.ahead_by)===1&&Number(comparison.behind_by)===0
    &&comparison?.mnShadowLifecycleProof===true;
  const inactiveMoShadowTransition=state==='MO'&&changes?.filter(file=>file.filename==='src/config/state-lifecycle.json').length===1
    &&comparison?.status==='ahead'&&comparison?.moShadowLifecycleProof===true;
  const inactiveKsShadowTransition=state==='KS'&&comparison?.ksShadowLifecycleProof===true;
  const unreviewedChanges=Array.isArray(changes)?changes.filter(file=>!(preparationOnly(state,file.filename)
    ||state==='MO'&&missouriCanarySiteFiles.has(file.filename)
    ||state==='KS'&&kansasActivationOnlyFiles.has(file.filename)
    ||state==='MO'&&['engine/src/verification/historical-implementation.mjs','scripts/test-ms-bundle-boundary.mjs'].includes(file.filename)
    ||state==='MO'&&file.filename==='src/config/state-lifecycle.json'&&inactiveMoShadowTransition
    ||state==='KS'&&file.filename==='src/config/state-lifecycle.json'&&inactiveKsShadowTransition
    ||state==='ND'&&file.filename==='engine/data/state-integration/ND.json'&&comparison?.ndCohortManifestProof===true
    ||state==='MN'&&minnesotaAdapterFiles.has(file.filename)
    ||state==='MN'&&['src/lib/public-drop-evidence.ts','scripts/test-laak-production-projection.mjs','.github/workflows/refresh-feed.yml','engine/test/engine-continuity.test.mjs'].includes(file.filename)
    ||state==='MN'&&file.filename==='src/config/state-lifecycle.json'&&inactiveMnShadowTransition)):[];
  if(run.head_sha!==currentHead&&(!['ahead','identical'].includes(comparison?.status)||!Array.isArray(changes)
    ||changes.length>=300||unreviewedChanges.length>0))
    throw new Error('Shadow collector source changed; issue new shadow runs before canary');
  return {status:'verified_github_shadow_artifact',state,repository,workflowRunId:String(run.id),workflowRunUrl:run.html_url,
    headSha:run.head_sha,currentHead,sourceEquivalentPreparationChanges:changes.map(file=>file.filename),
    inactiveMinnesotaShadowLifecycleTransition:inactiveMnShadowTransition,
    inactiveMissouriShadowLifecycleTransition:inactiveMoShadowTransition,inactiveKansasShadowLifecycleTransition:inactiveKsShadowTransition,
    artifactId:String(artifact.id),artifactName:artifact.name,artifactDigest:artifact.digest.slice(7),verifiedAt:new Date().toISOString()};
}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),runId=argument('--run'),output=argument('--out-dir');
  if(!['WI','OK','RI','MN','KS','AR','MO','MD','DE','ND'].includes(state)||!/^[0-9]+$/.test(runId||'')||!output)throw new Error('Use --state=WI|OK|RI|MN|KS|AR|MO|MD|DE|ND --run=<actual successful workflow run> --out-dir=<new directory>');
  const repository='tarsagent22/Bourbon-Signal',gh=process.platform==='win32'?'gh.exe':'gh',out=path.resolve(output);
  const api=endpoint=>JSON.parse(execFileSync(gh,['api',`repos/${repository}/${endpoint}`],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}));
  const run=api(`actions/runs/${runId}`),artifacts=api(`actions/runs/${runId}/artifacts?per_page=100`);
  const artifact=artifacts.artifacts?.find(row=>row.name===`state-expansion-shadow-${runId}`);
  const currentHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  let comparison=null;
  if(run.head_sha!==currentHead){
    comparison=api(`compare/${run.head_sha}...${currentHead}`);
    if(state==='MN'&&comparison.status==='ahead'&&comparison.ahead_by===1&&comparison.behind_by===0){
      const lifecyclePath='src/config/state-lifecycle.json';
      const runLifecycle=api(`contents/${lifecyclePath}?ref=${run.head_sha}`);
      const candidateLifecycle=JSON.parse(execFileSync('git',['show',`${currentHead}:${lifecyclePath}`],{encoding:'utf8',maxBuffer:2*1024*1024}));
      const shadowLifecycle=JSON.parse(Buffer.from(runLifecycle.content,'base64').toString('utf8'));
      const commit=api(`commits/${currentHead}`);
      comparison.mnShadowLifecycleProof=run.head_sha===comparison.base_commit?.sha
        &&validateInactiveMinnesotaShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison,commit});
    }
    if(state==='MO'&&comparison.status==='ahead'){
      const lifecyclePath='src/config/state-lifecycle.json';
      const runLifecycle=api(`contents/${lifecyclePath}?ref=${run.head_sha}`);
      const candidateLifecycle=JSON.parse(execFileSync('git',['show',`${currentHead}:${lifecyclePath}`],{encoding:'utf8',maxBuffer:2*1024*1024}));
      const shadowLifecycle=JSON.parse(Buffer.from(runLifecycle.content,'base64').toString('utf8'));
      comparison.moShadowLifecycleProof=validateInactiveMissouriShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison,shadowHeadSha:run.head_sha});
    }
    if(state==='KS'&&comparison.status==='ahead'&&comparison.ahead_by>=1&&comparison.behind_by===0){
      const lifecyclePath='src/config/state-lifecycle.json',runLifecycle=api(`contents/${lifecyclePath}?ref=${run.head_sha}`);
      const candidateLifecycle=JSON.parse(execFileSync('git',['show',`${currentHead}:${lifecyclePath}`],{encoding:'utf8',maxBuffer:2*1024*1024}));
      const shadowLifecycle=JSON.parse(Buffer.from(runLifecycle.content,'base64').toString('utf8'));
      comparison.ksShadowLifecycleProof=validateInactiveKansasShadowLifecycleTransition({candidateLifecycle,shadowLifecycle,comparison:{...comparison,runHeadSha:run.head_sha}});
    }
    if(state==='ND'&&comparison.status==='ahead'){
      const manifestPath='engine/data/state-integration/ND.json',runManifest=api(`contents/${manifestPath}?ref=${run.head_sha}`);
      const candidateManifest=JSON.parse(execFileSync('git',['show',`${currentHead}:${manifestPath}`],{encoding:'utf8',maxBuffer:2*1024*1024}));
      const shadowManifest=JSON.parse(Buffer.from(runManifest.content,'base64').toString('utf8'));
      comparison.ndCohortManifestProof=validateNorthDakotaCohortManifestTransition({candidateManifest,shadowManifest,
        comparison:{...comparison,runHeadSha:run.head_sha}});
    }
  }
  const provenance=validateCityHiveShadowWorkflowOrigin({state,repository,run,artifact,currentHead,comparison});
  const bytes=execFileSync(gh,['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{maxBuffer:128*1024*1024,windowsHide:true});
  const files=decodeBoundedShadowArchive(bytes,provenance.artifactDigest);
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});await writeFile(path.join(out,'artifact.zip'),bytes);
  for(const[name,body]of Object.entries(files)){const file=path.resolve(out,'extracted',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,body);}
  await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({state,workflowRunId:runId,artifactId:provenance.artifactId,artifactDigest:provenance.artifactDigest,out}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});

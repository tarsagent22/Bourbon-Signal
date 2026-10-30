#!/usr/bin/env node
// CI-only artifact selection. Production continues to run the unchanged
// engine/src/verify-state-integration.mjs against its actual refresh output.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyStateIntegration} from '../engine/src/verify-state-integration.mjs';

const execFileAsync=promisify(execFile);
const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REVIEWED_SITE_BY_STATE=Object.freeze({
  WA:'engine/data/canary-site/four-state-20261029',NM:'engine/data/canary-site/four-state-20261029',
  WI:'engine/data/canary-site/four-state-20261029',OK:'engine/data/canary-site/four-state-20261029',
  LA:'engine/data/canary-site/five-state-20261029',AK:'engine/data/canary-site/five-state-20261029',
  MA:'engine/data/canary-site/five-state-20261029',CT:'engine/data/canary-site/five-state-20261029',RI:'engine/data/canary-site/five-state-20261029',
});
const REVIEWED_STATES=new Set(Object.keys(REVIEWED_SITE_BY_STATE));
const array=value=>Array.isArray(value)?value:[];
const readJson=async(file,fallback)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch{return fallback;}};
async function readSource(root,file){try{return await readFile(path.join(root,file),'utf8');}catch{return null;}}

// Same site shape and source-contract inputs as the production CLI. The shared
// validator receives original manifests and requires immutable evidence.
async function loadSite(siteDir,state){
  const manifest=await readJson(path.join(siteDir,'manifest.json'),{});
  const stateIndex=await readJson(path.join(siteDir,manifest.files?.stateDrops||'states/index.json'),{});
  const partition=array(stateIndex.states).find(row=>row.state===state);
  return{manifest,stateIndex,stats:await readJson(path.join(siteDir,'stats.json'),{}),
    drops:await readJson(path.join(siteDir,'drops.json'),{drops:[]}),alerts:await readJson(path.join(siteDir,'alerts.json'),{alerts:[]}),
    locations:await readJson(path.join(siteDir,'locations.json'),{locations:[]}),previewPolicy:await readJson(path.join(siteDir,'canary-preview-policy.json'),null),
    stateDrops:partition?{[state]:await readJson(path.join(siteDir,partition.file),null)}:{}};
}

export async function verifyActiveStateIntegrationForCi({root=DEFAULT_ROOT,states=null,siteDir=path.join(root,'engine/out/site')}={}){
  const config=JSON.parse(await readFile(path.join(root,'src/config/state-lifecycle.json'),'utf8'));
  const selected=states||config.activeStates,results=[];
  const sourcePaths={statePreferences:'src/lib/statePreferences.ts',dropApi:'src/app/api/drops/route.ts',locationsApi:'src/app/api/locations/route.ts',preferencesApi:'src/app/api/user/preferences/route.ts',dashboard:'src/app/dashboard/page.tsx',dropFeed:'src/components/sections/DropFeed.tsx',alertDelivery:'src/lib/alert-delivery.ts',productionWatchdog:'scripts/production-engine-watchdog.mjs'};
  const sourceFiles=Object.fromEntries(await Promise.all(Object.entries(sourcePaths).map(async([key,file])=>[key,await readSource(root,file)])));
  for(const state of selected){
    if(!config.activeStates.includes(state))throw Error(`${state}: CI cannot select a non-active state`);
    const reviewedSite=REVIEWED_SITE_BY_STATE[state];
    const manifest=await readJson(path.join(root,`engine/data/state-integration/${state}.json`),null);
    if(REVIEWED_STATES.has(state)&&manifest?.evidence?.production?.status==='pending_release')throw Error(`${state}: pending_release would redirect the production verifier; it is not permitted for this admission`);
    if(REVIEWED_STATES.has(state)&&manifest?.evidence?.production?.status==='awaiting_first_publication'){
      if(manifest.evidence.canary?.siteArtifact!==reviewedSite)throw Error(`${state}: CI artifact must be the exact reviewed state canary path`);
      const fixtures=await readJson(path.join(root,`engine/data/state-fixtures/${state}.json`),null);
      const result=verifyStateIntegration({state,config,manifest,fixtures,site:await loadSite(path.join(root,reviewedSite),state),sourceFiles,promotionEvidenceRequired:true});
      if(!result.ok)throw Error(result.failures.join('\n'));
      results.push({state,mode:'explicit_ci_only_reviewed_canary',immutableEvidenceRequired:true});
    }else{
      // Preserve every other state's normal artifact/grandfathering contract.
      await execFileAsync(process.execPath,['src/verify-state-integration.mjs',`--state=${state}`,`--site-dir=${path.resolve(siteDir)}`],{cwd:path.join(root,'engine'),windowsHide:true});
      results.push({state,mode:'unchanged_production_cli'});
    }
  }
  return results;
}
const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(import.meta.url===invoked)verifyActiveStateIntegrationForCi().then(results=>console.log(`CI state integration passed for ${results.map(row=>row.state).join(', ')}; production verifier remains bound to actual output.`)).catch(error=>{console.error(error.message);process.exitCode=1;});

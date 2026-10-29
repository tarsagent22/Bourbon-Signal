import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mock} from 'node:test';
import {buildDrops,bibleLookup} from '../engine/src/export-site-contract.mjs';
import {mergePartialRefreshDrops,mergeHistoricalBoardShipmentDrops,mergeHistoricalTimelineDrops} from '../engine/src/partial-refresh-contract.mjs';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {projectCustomerSurfaces} from '../engine/src/customer-surface-policy.mjs';
const artifact=path.resolve('engine/out/offline-capture'),legacyRoot=process.env.FLEET_LEGACY_ROOT;

if(process.argv.includes('--prepare')){
 const repo='tarsagent22/Bourbon-Signal',api=route=>JSON.parse(execFileSync('gh',['api','repos/'+repo+'/'+route],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const run=api('actions/runs/40907316461'),a=api('actions/artifacts/12913409523');
 const expectedDigest='sha256:1f8537e1d7b0a63c8ddc945ff86dc10745e1e01ebd2e32539ceacf73c63484b2';
 if(run.conclusion!=='success'||run.head_sha!=='6deae85aaa1b78900cb5eafab03570613c95a8d7'||a.workflow_run.id!==40907316461||a.name!=='inventory-refresh-40907316461'||a.expired||a.digest!==expectedDigest)throw Error('Immutable capture identity mismatch');
 const zip=execFileSync('gh',['api','repos/'+repo+'/actions/artifacts/12913409523/zip'],{maxBuffer:32*1024*1024});
 if('sha256:'+createHash('sha256').update(zip).digest('hex')!==expectedDigest)throw Error('Capture ZIP digest mismatch');
 await mkdir(artifact,{recursive:true});const zipPath=path.join(artifact,'capture.zip');await writeFile(zipPath,zip);
 const python="import sys,zipfile,pathlib\nallowed={'bourbon-bible.json','library-catalog.json','site/stats.json','site/state-health.json','site-refresh-status.json','scheduled-state-verification.json'}\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for x in z.infolist():\n  if x.filename not in allowed: continue\n  if x.file_size>8*1024*1024: raise ValueError('capture file exceeds limit')\n  p=pathlib.Path(sys.argv[2])/x.filename; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(z.read(x))\n";
 execFileSync('python3',['-c',python.replaceAll('\\n','\n'),zipPath,artifact]);
 const caches={};for(const key of ['inventory-collector-state-Linux-40907316461','inventory-published-site-Linux-40897791021']){const matches=api('actions/caches?key='+key).actions_caches.filter(c=>c.key===key&&c.ref==='refs/heads/main');if(matches.length!==1)throw Error('Ambiguous immutable cache '+key);caches[key]=matches[0];}
 const hashes={};for(const file of ['bourbon-bible.json','library-catalog.json','site/stats.json','site/state-health.json','site-refresh-status.json','scheduled-state-verification.json'])hashes[file]=createHash('sha256').update(await readFile(path.join(artifact,file))).digest('hex');
 await writeFile(path.join(artifact,'source-origin.json'),JSON.stringify({sourceRunId:'40907316461',headSha:run.head_sha,artifactId:'12913409523',artifactDigest:expectedDigest,caches,hashes},null,2));
 console.log(JSON.stringify({verifiedArtifactId:a.id,artifactDigest:a.digest,sourceHead:run.head_sha,cacheKeys:Object.keys(caches)}));process.exit(0);
}

if(!legacyRoot)throw Error('Missing immutable legacy checkout');
if(process.env.FLEET_COLLECTOR_CACHE_EXACT!=='true'||process.env.FLEET_PUBLISHED_CACHE_EXACT!=='true')throw Error('Cache restore was not an exact immutable key hit');
const origin=JSON.parse(await readFile(path.join(artifact,'source-origin.json'),'utf8'));
const stats=JSON.parse(await readFile(path.join(artifact,'site/stats.json'),'utf8'));
const stageReport=JSON.parse(await readFile(path.join(artifact,'site-refresh-status.json'),'utf8'));
const operationalStage=stageReport.steps.filter(step=>step.script==='src/operational-report.mjs');if(operationalStage.length!==1||operationalStage[0].code!==0)throw Error('Operational stage receipt is not unique/successful');
const windowStart=Date.parse(operationalStage[0].startedAt),windowEnd=Date.parse(operationalStage[0].finishedAt);
if(stats.signalCount!==61485||stats.historicalSignalCount!==1045896||stats.generatedAt!=='2026-10-29T16:27:58.626Z')throw Error('Unexpected immutable capture counts/clock');
mock.timers.enable({apis:['Date'],now:Date.parse(stats.generatedAt)});
globalThis.fetch=async()=>{throw Error('Offline fleet replay prohibits source HTTP');};
const original=await readFile(path.join(legacyRoot,'engine/src/export-site-contract.mjs'),'utf8');
const line=original.split(/\r?\n/).find(line=>line.includes('.filter((drop, index, drops) => drops.findIndex'));
if(!line)throw Error('Unknown legacy dedup semantics');
let equivalent=original.replace('  const seenSourceIds = new Set();','  const seenSourceIds = new Set();\n  const seenProjected = new Set();')
 .replace(line,"    .filter(drop => {const key = [drop.state, drop.type, drop.canonicalId, drop.ncCode, drop.sourceUrl, drop.storeId, drop.locationName, drop.storeAddress, drop.quantity, drop.availabilityStatus, drop.price].join('|');if(seenProjected.has(key))return false;seenProjected.add(key);return true;})");
equivalent+='\nexport{uniqueHistoricalSignals,enrichNcSingleStoreShipmentSignals,enforceArchivedSourceAlertPolicy,detectDropCollapseFallbacks,mergePartialRefreshDrops,mergeHistoricalBoardShipmentDrops,mergeHistoricalTimelineDrops};\n';
const oldFile=path.join(legacyRoot,'engine/src/.readonly-fleet-replay.mjs');await writeFile(oldFile,equivalent);
const legacy=await import(pathToFileURL(oldFile).href);
const active=JSON.parse(await readFile(path.join(legacyRoot,'src/config/state-lifecycle.json'),'utf8')).activeStates;
const activeSet=new Set(active),historyDir='engine/out/history/snapshots';
const files=(await readdir(historyDir)).filter(file=>file.endsWith('.json')).sort().reverse().slice(0,40);
let snapshot;const snapshotCandidates=[];const snapshotHashes={};const historicalByKey=new Map();const timings={};const tick=()=>Number(process.hrtime.bigint())/1e9;let started=tick();
for(const file of files){const input=await readFile(path.join(historyDir,file));const item=JSON.parse(input);snapshotHashes[file]=createHash('sha256').update(input).digest('hex');
 const at=Date.parse(item.generatedAt);if(at>=windowStart&&at<=windowEnd&&item.signalCount===stats.signalCount&&item.signals?.length===stats.signalCount){snapshotCandidates.push({file,generatedAt:item.generatedAt,signalCount:item.signalCount,sha256:snapshotHashes[file]});snapshot=item;}
 for(const signal of item.signals||[]){if(!activeSet.has(signal.state))continue;const key=[signal.key||signal.id||signal.sourceSignalId,signal.observedAt||item.generatedAt,signal.quantity||0,signal.availabilityStatus||'',signal.price||0].join('|');historicalByKey.set(key,signal);}
 global.gc?.();}
timings.readDeduplicatedSnapshotsSeconds=tick()-started;
if(snapshotCandidates.length!==1)throw Error('Operational snapshot must uniquely match the immutable successful stage window and exact61485count: '+JSON.stringify(snapshotCandidates));
const official=JSON.parse(await readFile('engine/out/location-bible-official.json','utf8'));
const signals=legacy.enrichNcSingleStoreShipmentSignals(snapshot.signals.filter(row=>activeSet.has(row.state)).map(legacy.enforceArchivedSourceAlertPolicy),official.locations.filter(row=>activeSet.has(row.state)));
for(const signal of signals){const key=[signal.key||signal.id||signal.sourceSignalId,signal.observedAt||'',signal.quantity||0,signal.availabilityStatus||'',signal.price||0].join('|');historicalByKey.set(key,signal);}
const historical=[...historicalByKey.values()].map(legacy.enforceArchivedSourceAlertPolicy);historicalByKey.clear();global.gc?.();
if(historical.length!==stats.historicalSignalCount||signals.length!==stats.signalCount)throw Error('Cache cohort is incomplete/mismatched; no partial historical claim is permitted: '+JSON.stringify({historical:historical.length,current:signals.length}));
const bible=await BourbonBible.load(path.join(artifact,'bourbon-bible.json')),lookup=bibleLookup(bible.records);
const previous=JSON.parse(await readFile('engine/out/site/drops.json','utf8')),previousDrops=previous.drops||previous;
const previousQuality=JSON.parse(await readFile('engine/out/site/state-quality.json','utf8'));
const counts=rows=>Object.fromEntries(active.map(state=>{const a=rows.filter(row=>row.state===state);return[state,{rows:a.length,onSite:a.filter(row=>projectCustomerSurfaces(row).onSite).length,
 stores:new Set(a.filter(row=>projectCustomerSurfaces(row).onSite).map(row=>row.storeId).filter(Boolean)).size}]}));
const result={sourceRunId:'40907316461',collectorCacheKey:'inventory-collector-state-Linux-40907316461',previousSiteCacheKey:'inventory-published-site-Linux-40897791021',
 sourceGeneratedAt:stats.generatedAt,sourceSnapshotAt:snapshot.generatedAt,historicalSignals:historical.length,expectedHistoricalSignals:stats.historicalSignalCount,currentSignals:signals.length,
 historicalCountMatches:historical.length===stats.historicalSignalCount,sourceOrigin:origin,operationalStage:operationalStage[0],operationalSnapshot:snapshotCandidates[0],snapshotHashes,legacyHead:process.env.FLEET_LEGACY_SHA,legacyExportSha256:createHash('sha256').update(original).digest('hex'),
 equivalentDedupOnly:true,sourceHTTPRequests:0,cacheWrites:0,publicationWrites:0,proofBoundary:'Immutable-cache offline replay at original captured clock; not new source collection or publication.'};
console.log(JSON.stringify({...result,phase:'inputs'}));
started=tick();const oldCurrent=legacy.buildDrops(signals,lookup,signals,previousDrops,historical);timings.legacyCurrentSeconds=tick()-started;
started=tick();const oldCandidates=legacy.buildDrops(historical,lookup,signals,previousDrops);timings.legacyHistoricalSeconds=tick()-started;global.gc?.();
Object.assign(result,{legacyCurrent:counts(oldCurrent),legacyHistoricalCandidates:counts(oldCandidates),legacyCandidateTotal:oldCandidates.length});
console.log(JSON.stringify({phase:'legacy',current:result.legacyCurrent,historical:result.legacyHistoricalCandidates}));
started=tick();const newCurrent=buildDrops(signals,lookup,signals,previousDrops,historical);timings.repairedCurrentSeconds=tick()-started;
started=tick();const newCandidates=buildDrops(historical,lookup,signals,previousDrops);timings.repairedHistoricalSeconds=tick()-started;global.gc?.();result.timings=timings;result.peakRssBytes=process.resourceUsage().maxRSS*1024;
const rowBytes=rows=>2+rows.reduce((sum,row)=>sum+Buffer.byteLength(JSON.stringify(row))+1,0);
const va=newCurrent.filter(row=>row.state==='VA'),vaSizes=va.map(row=>Buffer.byteLength(JSON.stringify(row))+1).sort((a,b)=>a-b);
result.currentByteBudget={rows:newCurrent.length,bytes:rowBytes(newCurrent),budget:60*1024*1024,headroom:60*1024*1024-rowBytes(newCurrent),byState:Object.fromEntries(active.map(state=>[state,{rows:newCurrent.filter(row=>row.state===state).length,bytes:rowBytes(newCurrent.filter(row=>row.state===state))}]))};
result.virginiaFutureRestoration={existingRows:va.length,existingMeanRowBytes:vaSizes.length?vaSizes.reduce((a,b)=>a+b,0)/vaSizes.length:0,p95RowBytes:vaSizes[Math.floor(vaSizes.length*.95)]||0,maxRowBytes:vaSizes.at(-1)||0,additionalRowsUnproven:true,reason:'Source capture cannot reconstruct positive rows rejected by the old collector; no future VA gain or byte forecast is treated as measured.'};
Object.assign(result,{repairedCurrent:counts(newCurrent),repairedHistoricalCandidates:counts(newCandidates),repairedCandidateTotal:newCandidates.length,repairedCandidateBytes:Buffer.byteLength(JSON.stringify(newCandidates))});
const detected=legacy.detectDropCollapseFallbacks(previousQuality,oldCurrent,active);
const partial=['NC','NY']; // Exactly the initial export's immutable workflow log; not promotion authority.
const full=detected.filter(state=>!partial.includes(state));
result.initialFallbackReplay={detected,full,partial,assumption:'Initial log explicitly reports NC/NY partial and AL/MD-MONTGOMERY/OH/UT/WV full; active24 attempted for controlled merge replay.'};
for(const [label,api,current,candidates] of [['legacy',legacy,oldCurrent,oldCandidates],['repaired',{mergePartialRefreshDrops,mergeHistoricalBoardShipmentDrops,mergeHistoricalTimelineDrops},newCurrent,newCandidates]]){
 try{const refreshed=api.mergePartialRefreshDrops({previousDrops,currentDrops:candidates,currentSourceDrops:current,partialRefresh:false,attemptedStateIds:active,fallbackStateIds:full,partialFallbackStateIds:partial});
 const board=api.mergeHistoricalBoardShipmentDrops({currentDrops:refreshed,currentSourceDrops:current,previousDrops,now:stats.generatedAt});
 const final=api.mergeHistoricalTimelineDrops({currentDrops:board,previousDrops,now:stats.generatedAt});
 result[label+'FinalControlledMerge']=counts(final);result[label+'FinalTotal']=final.length;result[label+'FinalCompactBytes']=rowBytes(final);result[label+'FinalEnvelopeBytes']=Buffer.byteLength(JSON.stringify({contractVersion:'bourbon-signal-site-v0.1',generatedAt:stats.generatedAt,engineGeneratedAt:stats.engineGeneratedAt,runId:stats.runId,count:final.length,drops:final}));
 }catch(error){result[label+'MergeError']=error.message;}
}
await mkdir('engine/out/fleet-replay',{recursive:true});await writeFile('engine/out/fleet-replay/summary.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));mock.timers.reset();

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
if(!legacyRoot)throw Error('Missing immutable legacy checkout');
const stats=JSON.parse(await readFile(path.join(artifact,'site/stats.json'),'utf8'));
mock.timers.enable({apis:['Date'],now:Date.parse(stats.generatedAt)});
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
const snapshots=[];for(const file of files)snapshots.push(JSON.parse(await readFile(path.join(historyDir,file),'utf8')));
const snapshot=snapshots.find(row=>row.generatedAt===stats.engineGeneratedAt)||snapshots[0];
if(snapshot.generatedAt!==stats.engineGeneratedAt)throw Error('Current snapshot clock does not match captured artifact');
const official=JSON.parse(await readFile('engine/out/location-bible-official.json','utf8'));
const signals=legacy.enrichNcSingleStoreShipmentSignals(snapshot.signals.filter(row=>activeSet.has(row.state)).map(legacy.enforceArchivedSourceAlertPolicy),official.locations.filter(row=>activeSet.has(row.state)));
const historical=legacy.uniqueHistoricalSignals(snapshots,signals).filter(row=>activeSet.has(row.state)).map(legacy.enforceArchivedSourceAlertPolicy);
const bible=await BourbonBible.load(path.join(artifact,'bourbon-bible.json')),lookup=bibleLookup(bible.records);
const previous=JSON.parse(await readFile('engine/out/site/drops.json','utf8')),previousDrops=previous.drops||previous;
const previousQuality=JSON.parse(await readFile('engine/out/site/state-quality.json','utf8'));
const counts=rows=>Object.fromEntries(active.map(state=>{const a=rows.filter(row=>row.state===state);return[state,{rows:a.length,onSite:a.filter(row=>projectCustomerSurfaces(row).onSite).length,
 stores:new Set(a.filter(row=>projectCustomerSurfaces(row).onSite).map(row=>row.storeId).filter(Boolean)).size}]}));
const result={sourceRunId:'40907316461',collectorCacheKey:'inventory-collector-state-Linux-40907316461',previousSiteCacheKey:'inventory-published-site-Linux-40897791021',
 sourceGeneratedAt:stats.generatedAt,sourceSnapshotAt:snapshot.generatedAt,historicalSignals:historical.length,expectedHistoricalSignals:stats.historicalSignalCount,currentSignals:signals.length,
 historicalCountMatches:historical.length===stats.historicalSignalCount,legacyHead:process.env.FLEET_LEGACY_SHA,legacyExportSha256:createHash('sha256').update(original).digest('hex'),
 equivalentDedupOnly:true,sourceHTTPRequests:0,cacheWrites:0,publicationWrites:0,proofBoundary:'Immutable-cache offline replay at original captured clock; not new source collection or publication.'};
console.log(JSON.stringify({...result,phase:'inputs'}));
const oldCurrent=legacy.buildDrops(signals,lookup,signals,previousDrops,historical);
const oldCandidates=legacy.buildDrops(historical,lookup,signals,previousDrops);
Object.assign(result,{legacyCurrent:counts(oldCurrent),legacyHistoricalCandidates:counts(oldCandidates),legacyCandidateTotal:oldCandidates.length});
console.log(JSON.stringify({phase:'legacy',current:result.legacyCurrent,historical:result.legacyHistoricalCandidates}));
const newCurrent=buildDrops(signals,lookup,signals,previousDrops,historical),newCandidates=buildDrops(historical,lookup,signals,previousDrops);
Object.assign(result,{repairedCurrent:counts(newCurrent),repairedHistoricalCandidates:counts(newCandidates),repairedCandidateTotal:newCandidates.length,repairedCandidateBytes:Buffer.byteLength(JSON.stringify(newCandidates))});
const detected=legacy.detectDropCollapseFallbacks(previousQuality,oldCurrent,active);
const partial=['NC','NY']; // Exactly the initial export's immutable workflow log; not promotion authority.
const full=detected.filter(state=>!partial.includes(state));
result.initialFallbackReplay={detected,full,partial,assumption:'Initial log explicitly reports NC/NY partial and AL/MD-MONTGOMERY/OH/UT/WV full; active24 attempted for controlled merge replay.'};
for(const [label,api,current,candidates] of [['legacy',legacy,oldCurrent,oldCandidates],['repaired',{mergePartialRefreshDrops,mergeHistoricalBoardShipmentDrops,mergeHistoricalTimelineDrops},newCurrent,newCandidates]]){
 try{const refreshed=api.mergePartialRefreshDrops({previousDrops,currentDrops:candidates,currentSourceDrops:current,partialRefresh:false,attemptedStateIds:active,fallbackStateIds:full,partialFallbackStateIds:partial});
 const board=api.mergeHistoricalBoardShipmentDrops({currentDrops:refreshed,currentSourceDrops:current,previousDrops,now:stats.generatedAt});
 const final=api.mergeHistoricalTimelineDrops({currentDrops:board,previousDrops,now:stats.generatedAt});
 result[label+'FinalControlledMerge']=counts(final);result[label+'FinalTotal']=final.length;
 }catch(error){result[label+'MergeError']=error.message;}
}
await mkdir('engine/out/fleet-replay',{recursive:true});await writeFile('engine/out/fleet-replay/summary.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));mock.timers.reset();

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {decodeLaakArchive,LA_AK_CANARY_SOURCE_FILES,validateLaakOrigin} from '../../scripts/download-laak-shadow.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const run={id:43565682813,conclusion:'success',status:'completed',repository:{full_name:'tarsagent22/Bourbon-Signal'},
 path:'.github/workflows/state-expansion-shadow.yml',head_sha:'a'.repeat(40),html_url:'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/43565682813'};
const artifact={id:14101879455,name:`state-expansion-shadow-${run.id}`,expired:false,digest:`sha256:${'b'.repeat(64)}`,size_in_bytes:1_000_000};
const sourceBlobs=Object.fromEntries(LA_AK_CANARY_SOURCE_FILES.map(file=>[file,'c'.repeat(40)]));
function report(state,count){return{state,status:'useful',stale:false,startedAt:'2026-11-14T06:18:55.649Z',finishedAt:'2026-11-14T06:19:54.102Z',
 signals:[{state,sourceProductBinding:{shadowOnly:true},raw:{shadowOnly:true},canAlertAsInventory:false,canAlertAsWatch:false,
  eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForDelivery:false}],metadata:{origin:{kind:'github_actions',workflowRunId:String(run.id),repository:'tarsagent22/Bourbon-Signal',commitSha:run.head_sha},
  shadowOnly:true,productionActivationAllowed:false,customerDeliveryAllowed:false,receipts:Array(count).fill({}),requests:Array(count).fill({})}};}
function validArgs(){const reports={AK:report('AK',53),LA:report('LA',43)};return{run,artifact,currentHead:'d'.repeat(40),
 comparison:{status:'diverged',files:[{filename:'engine/src/research-state-registry.mjs'}]},runSourceBlobs:sourceBlobs,currentSourceBlobs:sourceBlobs,
 summary:{mode:'shadow',complete:true,generatedAt:'2026-11-14T06:21:47.096Z',results:['AK','LA'].map(state=>({state,complete:true,outcome:'complete',
  publication:{allowed:false,productionSnapshotTouched:false},alerts:{disabled:true,deliveryAttempted:false},metrics:{signalCount:reports[state].signals.length,customerVisibleExportPreviewCount:0}}))},reports};}

test('LA/AK downloader accepts exact run-source tree identity across diverged branch history',()=>{
 const provenance=validateLaakOrigin(validArgs());assert.equal(provenance.stateSet.join(','),'AK,LA');
 assert.throws(()=>validateLaakOrigin({...validArgs(),currentSourceBlobs:{...sourceBlobs,[LA_AK_CANARY_SOURCE_FILES[0]]:'e'.repeat(40)}}),/collector source changed/);
});
test('LA/AK downloader rejects a source report that has candidate or delivery alerts',()=>{
 const args=validArgs();args.reports.LA.signals[0].eligibleForOnSite=true;
 assert.throws(()=>validateLaakOrigin(args),/not alert-disabled/);
});
test('LA/AK archive decoder requires exact digest and safe bounded paths',()=>{
 const bytes=Buffer.from(zipSync({'LA/report.json':Buffer.from('{}')})),hash=digest(bytes);
 assert.equal(decodeLaakArchive(bytes,hash)['LA/report.json'].toString(),'{}');
 assert.throws(()=>decodeLaakArchive(bytes,'0'.repeat(64)),/digest/);
 const unsafe=Buffer.from(zipSync({'../escape.json':Buffer.from('{}')}));
 assert.throws(()=>decodeLaakArchive(unsafe,digest(unsafe)),/Unsafe shadow archive/);
});

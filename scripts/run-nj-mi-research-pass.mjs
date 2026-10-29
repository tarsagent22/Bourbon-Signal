import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {collectNjMiResearchReport,njMiResearchSourceForState} from '../engine/src/nj-mi-research-runtime.mjs';
import {classifyShadowReadiness,buildShadowEvidence} from '../engine/src/run-expansion-shadow.mjs';

if(process.env.BOURBON_SIGNAL_SHADOW_MODE!=='1')throw Error('Isolated shadow mode is required');
const root=path.resolve('engine/out/nj-mi-research'),bible=await BourbonBible.load(path.resolve('engine/out/bourbon-bible.json'));
const states=String(process.env.NJ_MI_RESEARCH_STATES||'NJ,MI').split(',');
if(!states.length||states.some(state=>!['NJ','MI'].includes(state)))throw Error('Only NJ and MI research are registered');
const summary=[];
for(const state of states){
  const reportDirectory=path.join(root,state),config=njMiResearchSourceForState(state);
  await mkdir(reportDirectory,{recursive:true});
  const report=await collectNjMiResearchReport(config,bible,{reportDirectory,
    journalFile:path.resolve('engine/out/research-source-attempts/nj-mi-incidents.json')});
  await writeFile(path.join(reportDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(path.join(reportDirectory,'evidence.json'),JSON.stringify(buildShadowEvidence(state,report),null,2)+'\n');
  summary.push({state,sourceRequests:report.metadata.receipts.length,qualifiedRows:report.signals.length,
    premises:[...new Set(report.signals.map(row=>row.storeId))],canonicalNames:[...new Set(report.signals.map(row=>row.canonicalName))],
    readiness:classifyShadowReadiness(report),customerDeliveryAllowed:false});
}
await writeFile(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

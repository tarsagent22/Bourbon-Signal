import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BourbonBible} from '../engine/src/core/bible.mjs';
import {collectNjMiResearchReport,njMiResearchSourceForState} from '../engine/src/nj-mi-research-runtime.mjs';
import {canonicalizeSignal} from '../engine/src/operational-report.mjs';
import {bibleLookup,buildDrops} from '../engine/src/export-site-contract.mjs';
import * as classificationModule from '../src/lib/drop-classification';
import * as evidenceModule from '../src/lib/public-drop-evidence';
import * as contractModule from '../src/lib/site-engine-contract';
import * as coverageModule from '../src/lib/coverage-model';
const {classifyPublicDrop,getDropClassificationIndex}=classificationModule.default||classificationModule;
const {normalizePublicDropEvidenceInput,isPublicDropFeedEligible,isCurrentInventoryEvidence}=evidenceModule.default||evidenceModule;
const {normalizeDropForSite}=contractModule.default||contractModule;
const {buildCoverageContract}=coverageModule.default||coverageModule;

const read=async file=>JSON.parse(await readFile(file,'utf8'));
const bible=await BourbonBible.load(path.resolve('engine/out/bourbon-bible.json'));
const index=getDropClassificationIndex((await read('src/data/drop-feed-classification.generated.json')).records);
const lifecycle=await read('src/config/state-lifecycle.json');
const directory=await mkdtemp(path.join(tmpdir(),'bs-nj-mi-public-'));
assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));
try{
  for(const state of ['NJ','MI']){
    const fixture=await read(`engine/test/fixtures/additional-cityhive-expansion/${state}.json`);
    const hostname=new URL(fixture.sourceUrl).hostname;
    const report=await collectNjMiResearchReport(njMiResearchSourceForState(state),bible,{
      env:{BOURBON_SIGNAL_SHADOW_MODE:'1'},reportDirectory:path.join(directory,state),journalFile:path.join(directory,state,'incidents.json'),
      fetchText:async url=>({url,ok:new URL(url).hostname===hostname,status:new URL(url).hostname===hostname?200:403,
        text:new URL(url).hostname===hostname?`<script type="application/json">${JSON.stringify(fixture)}</script>`:''}),
    });
    assert.ok(report.signals.length>0,`${state}: fixture must exercise a real qualified source row`);
    const operational=report.signals.map(row=>canonicalizeSignal(row,bible));
    const candidates=buildDrops(operational,bibleLookup(bible.records),operational);
    const normalized=candidates.map(row=>normalizePublicDropEvidenceInput(classifyPublicDrop(normalizeDropForSite(row),index)));
    assert.ok(normalized.every(row=>!isPublicDropFeedEligible(row)),`${state}: inactive research escaped public Feed policy`);
    assert.equal(normalized.filter(row=>isPublicDropFeedEligible(row)&&isCurrentInventoryEvidence(row)).length,0,
      `${state}: inactive research became current public inventory`);
    const coverage=buildCoverageContract({lifecycle,stateRows:[],locations:[],stores:[],drops:normalized,
      degradedStates:[],generatedAt:new Date().toISOString(),asOf:new Date().toISOString(),healthLimited:false});
    const entry=coverage.states.find(row=>row.code===state);
    assert.equal(entry?.capabilities.currentBottleAvailability,false);
    assert.equal(entry?.freshness.currentInventoryStores,0);
    assert.equal(entry?.capabilities.restockAlerts,false);
    console.log(JSON.stringify({state,scope:'local_fixture_full_normalize_classify_public_coverage_not_delivery',
      qualifiedSourceRows:report.signals.length,publicCurrentRows:0,publicCurrentStores:0,productionInactive:true}));
  }
}finally{await rm(directory,{recursive:true,force:true});}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { alabamaExpiredReleaseAbsence } from '../src/alabama-drop-presence.mjs';
import { CUSTOMER_ACTIVE_STATE_IDS } from '../src/state-sources.mjs';

function evidence(date = '5/23/2026') {
  const row = {
    state: 'AL', eventType: 'alabc_limited_release_store_drop', releaseDate: date,
    sourceUrl: 'https://alabcboard.gov/sites/default/files/inline-files/Web%20Hold_20.pdf',
    storeId: 'alabc:461', storeAddress: '100 Main St, Montgomery, AL 36117', locationPrecision: 'store_level',
    canonicalBottleId: 'blantons', quantity: 0, price: 81.99, canAlertAsInventory: false,
    observedAt: '2026-10-29T12:57:00Z', raw: { release: { releaseDate: date, storeNumber: '461' } },
  };
  return {
    now: Date.parse('2026-10-29T12:57:00Z'), historyDays: 30,
    stateReport: { state: 'AL', status: 'useful', signals: [row] },
    coverage: { state: 'AL', publicStatus: 'active', lifecycle: 'scheduled_release_leads', coverageTier: 'shipment_drop_intelligence', signalCount: 1 },
    partition: { state: 'AL', count: 0, drops: [] }, events: [], alerts: [],
  };
}

test('expired Alabama releases permit an explicit empty Feed without changing dates or source evidence', () => {
  const input = evidence(), original = structuredClone(input);
  input.events.push({state:'AL', category:'lottery', eventDate:'2026-12-12', canAlertAsInventory:false});
  original.events = structuredClone(input.events);
  const result = alabamaExpiredReleaseAbsence(input);
  assert.equal(result.allowed, true);
  assert.equal(result.latestReleaseDate, '2026-05-23');
  assert.equal(result.historyCutoff, '2026-09-29');
  assert.match(result.diagnostic, /original dates remain/);
  assert.deepEqual(input, original);
});

test('missing current, boundary-day, future and undated Alabama releases remain publication failures', () => {
  for (const date of ['10/24/2026', '9/29/2026', '12/12/2026', '', '2/30/2026']) {
    assert.equal(alabamaExpiredReleaseAbsence(evidence(date)).allowed, false, date);
  }
  assert.equal(alabamaExpiredReleaseAbsence(evidence('9/28/2026')).allowed, true);
});

test('expired-release absence fails closed on missing coverage, partitions or intact original official dates', () => {
  for (const mutate of [
    input => { input.coverage = null; },
    input => { input.coverage.coverageTier = 'live_store_inventory'; },
    input => { input.partition = null; },
    input => { input.partition.count = 1; },
    input => { input.stateReport = null; },
    input => { input.coverage.signalCount = 2; },
    input => { input.stateReport.signals = []; input.coverage.signalCount = 0; },
    input => { input.stateReport.signals[0].raw.release.releaseDate = '10/24/2026'; },
    input => { input.stateReport.signals[0].sourceUrl = 'https://example.com/release.pdf'; },
  ]) {
    const input = evidence(); mutate(input);
    assert.equal(alabamaExpiredReleaseAbsence(input).allowed, false);
  }
});

test('future lottery and calendar material cannot masquerade as Alabama inventory', () => {
  for (const claim of [{canAlertAsInventory:true}, {can_alert_as_inventory:true}, {dataLane:'inventory'}, {changeType:'current_inventory_signal'}, {availabilityStatus:'in_stock'}]) {
    for (const collection of ['events', 'alerts']) {
      const input=evidence(); input[collection].push({state:'AL',category:'lottery',eventDate:'2026-12-12',...claim});
      assert.equal(alabamaExpiredReleaseAbsence(input).allowed,false);
    }
  }
});

function verifyContract(t, { date = '5/23/2026', missingOtherState = null } = {}) {
  const temporaryRoot=realpathSync(tmpdir()), directory=mkdtempSync(path.join(temporaryRoot,'bs-al-presence-'));
  assert.ok(realpathSync(directory).startsWith(temporaryRoot+path.sep));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const root=path.join(directory,'engine'),active=[...CUSTOMER_ACTIVE_STATE_IDS],input=evidence(date);
  // Date is fixed relative to the verifier's real clock; no refreshed timestamps are manufactured.
  const expired=new Date(Date.now()-120*86_400_000).toISOString().slice(0,10);
  const current=new Date(Date.now()-2*86_400_000).toISOString().slice(0,10);
  input.stateReport.signals[0].releaseDate=date==='current'?current:expired;
  input.stateReport.signals[0].raw.release.releaseDate=input.stateReport.signals[0].releaseDate;
  const drops=['IL','NC','PA','TN'].filter(state=>state!==missingOtherState).map(state=>({state,id:`fixture-${state}`,type:'fixture_lead'}));
  const coverage=active.map(state=>({state,label:state,coverageTier:'shipment_drop_intelligence'}));
  Object.assign(coverage.find(row=>row.state==='AL'),input.coverage);
  Object.assign(coverage.find(row=>row.state==='MD-MONTGOMERY'),{label:'Maryland',customerAreaLabel:'Montgomery County'});
  Object.assign(coverage.find(row=>row.state==='IA'),{customerSummary:'Delivery leads, not live shelf inventory'});
  const files={
    '../src/config/state-lifecycle.json':JSON.parse(readFileSync(new URL('../../src/config/state-lifecycle.json',import.meta.url),'utf8')),
    'out/states/AL.json':input.stateReport,
    'out/site/manifest.json':{files:{stateDrops:'state-drops.json'}},
    'out/site/stats.json':{stateCount:active.length,dropCount:drops.length,historyDays:30,stateCoverage:{states:coverage}},
    'out/site/drops.json':{drops},'out/site/bottles.json':{},'out/site/stores.json':{},'out/site/locations.json':{},
    'out/site/events.json':{events:[{state:'AL',category:'lottery',eventDate:'2099-12-12',canAlertAsInventory:false}]},
    'out/site/alerts.json':{alerts:[]},
    'out/site/state-quality.json':{states:active.map(state=>({state,score:80,weaknesses:[]})),summary:{stateCount:active.length},regression:{ok:true}},
    'out/site/state-drops.json':{totalCount:drops.length,states:active.map(state=>({state,file:`states/${state}/drops.json`,count:drops.filter(row=>row.state===state).length}))},
  };
  const lifecycle=files['../src/config/state-lifecycle.json'];
  for(const state of lifecycle.activeStates){
    if(!lifecycle.reliabilityPolicy.grandfatheredActiveStates.includes(state))files[`data/state-integration/${state}.json`]={state};
  }
  for(const state of active){const rows=drops.filter(row=>row.state===state);files[`out/site/states/${state}/drops.json`]={state,count:rows.length,drops:rows};}
  for(const[relative,value]of Object.entries(files)){
    const target=path.join(root,relative);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(value));
  }
  return spawnSync(process.execPath,[fileURLToPath(new URL('../src/verify-site-contract.mjs',import.meta.url))],{
    cwd:root,encoding:'utf8',windowsHide:true,timeout:10_000,
    env:{...process.env,BOURBON_SIGNAL_VERIFY_SITE_REQUIRED_DROP_STATES:'AL,IL,NC,PA,TN'},
  });
}

test('actual site verifier allows expired-only Alabama, rejects missing current releases and keeps other state guards',t=>{
  const expired=verifyContract(t);
  assert.equal(expired.status,0,expired.stderr||expired.error?.message);
  assert.match(expired.stdout,/AL has no Feed drops/);
  const current=verifyContract(t,{date:'current'});
  assert.notEqual(current.status,0);
  assert.match(current.stderr,/current_or_upcoming_release_requires_drops/);
  const missingIllinois=verifyContract(t,{missingOtherState:'IL'});
  assert.notEqual(missingIllinois.status,0);
  assert.match(missingIllinois.stderr,/should still include customer-facing state IL/);
});

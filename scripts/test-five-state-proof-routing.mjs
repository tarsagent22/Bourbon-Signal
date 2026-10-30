import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{researchSourceForState,withResearchLifecycle}from'../engine/src/research-state-registry.mjs';
import{STATE_LIFECYCLE_CONFIG}from'../engine/src/state-lifecycle.mjs';
test('five reviewed cohorts remain isolated, preserve active production entries and replace legacy MA research only',()=>{
 const before=JSON.stringify(STATE_LIFECYCLE_CONFIG),config=withResearchLifecycle(STATE_LIFECYCLE_CONFIG);
 assert.equal(JSON.stringify(STATE_LIFECYCLE_CONFIG),before);assert.deepEqual(config.activeStates,STATE_LIFECYCLE_CONFIG.activeStates);
 for(const state of ['LA','AK','MA','CT','RI']){assert.equal(researchSourceForState(state,{shadowMode:false}),null);const source=researchSourceForState(state,{shadowMode:true});assert.equal(source.active,false);assert.equal(config.states[state].publicStatus,'research_only');assert.equal(config.states[state].inventoryAlertable,false);assert.equal(config.states[state].watchAlertable,false);}
 assert.ok(researchSourceForState('MA',{shadowMode:true}).sources.every(source=>!source.url.includes('juliosliquors')));
 for(const state of STATE_LIFECYCLE_CONFIG.activeStates)assert.deepEqual(config.states[state],STATE_LIFECYCLE_CONFIG.states[state]);
});
test('future workflows bind correct native family, durable ledgers and three independently reparsed NE sources',async()=>{
 for(const name of ['state-expansion-canary.yml','state-promotion-provenance.yml']){const text=await readFile('.github/workflows/'+name,'utf8');assert.ok(text.includes('MA|CT|RI) family=new-england; preparer=prepare-new-england-canary.mjs'));assert.ok(text.includes('MA|CT|RI) verifier=test-new-england-public-canary.mjs'));assert.ok(text.includes('scripts/test-new-england-member-path.mts'));}
 const shadow=await readFile('.github/workflows/state-expansion-shadow.yml','utf8');for(const value of ['new-england-research-${{ github.run_id }}','engine/out/new-england-research','engine/out/library-catalog.json','engine/out/bourbon-bible.json','engine/out/source-incidents/new-england-cityhive'])assert.ok(shadow.includes(value),value);
 const issuer=await readFile('.github/workflows/state-promotion-provenance.yml','utf8');for(const value of ['source_shadow_runs:','Source run IDs must be distinct','scripts/build-new-england-source-proof.mjs','engine/out/new-england-source-inputs','--input-dirs="$input_dirs"'])assert.ok(issuer.includes(value),value);
});

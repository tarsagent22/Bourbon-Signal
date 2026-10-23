import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { readSourcePremisesBaseline, SOURCE_PREMISES_BASELINE_SQL, type PremisesSourceRegistration } from '../src/lib/source-premises-baseline.ts';

const now = Date.parse('2026-10-23T04:00:00Z');
const registered: PremisesSourceRegistration = { id:'ca:test',state:'CA',kind:'ca',expiryHours:1 };
const head = (overrides = {}) => ({ storage:'poll',source_id:'ca:test',generation:'5',revision:null,accepted_at:'2026-10-23T03:50:00Z',last_reason:'accepted',failures:0,healthy:null,policy_id:'snapshot-1',shape_valid:true,...overrides });
const premise = (overrides = {}) => ({ storage:'poll',source_id:'ca:test',origin:'poll_current',state:'CA',store_id:'public-store:1',address:'123 Main Street Unit 2, San Diego CA 92101',name:'Public Store',city:'San Diego',zip:'92101',chain:'public-chain',event_type:'retailer_store_inventory_result',precision:'store_level',observed_at:'2026-10-23T03:49:00Z',availability:'in_stock',source_host:'example.com',inventory_flag:true,stale:false,closed:false,subject_availability:null,...overrides });
function fixture(heads = [head()], premises = [premise()]) {
  const calls: Array<{ text:string;params?:unknown[] }> = [];
  const executor = { query: async (text:string,params?:unknown[]) => { calls.push({text,params}); return { rows:[{statement_at:'2026-10-23 04:00:00+00',heads,premises}] }; } };
  return { executor,calls };
}

test('one fixed SELECT projects only public premise/head fields with coherent provenance', async () => {
  const {executor,calls} = fixture([head({payload:'SECRET_MEMBER'})],[premise({canonicalName:'SECRET_BOTTLE',price:123,source_url:'https://example.com/?secret=SECRET_TOKEN',payload:{email:'SECRET_MEMBER'}})]);
  const output = await readSourcePremisesBaseline(executor,{now,registry:[registered]});
  assert.equal(calls.length,1); assert.equal(calls[0].text,SOURCE_PREMISES_BASELINE_SQL); assert.equal(calls[0].params,undefined);
  assert.equal(output.contractVersion,'bourbon-signal/source-premises-baseline@1'); assert.equal(output.statementAt,'2026-10-23T04:00:00.000Z');
  assert.equal(output.premises[0].current,true); assert.equal(output.premises[0].inventoryObserved,true);
  assert.equal(output.premises[0].address,'123 Main Street Unit 2, San Diego CA 92101'); assert.equal(output.heads[0].generation,5);
  assert.ok(!JSON.stringify(output).includes('SECRET_')); assert.ok(!('price' in output.premises[0]));
  assert.match(output.provenance.headsSha256,/^[a-f0-9]{64}$/); assert.equal(output.completeness.historicalAbsenceProven,false);
  assert.equal(output.completeness.retainedHistoryComplete,false); assert.equal(output.completeness.verifiedRetailerPremisesIncluded,false);
});

test('failure, disable, expiry, future clocks and missing acceptance never claim current stock', async () => {
  for (const [change,source] of [[{last_reason:'source_identity_or_schema_failure'},registered],[{failures:1},registered],
    [{accepted_at:'2026-10-23T01:00:00Z'},registered],[{accepted_at:'2026-10-23T05:00:00Z'},registered],
    [{accepted_at:null},registered],[{policy_id:null},registered],[{}, {...registered,disabled:true}]] as const) {
    const {executor}=fixture([head(change)]); const output=await readSourcePremisesBaseline(executor,{now,registry:[source]});
    assert.equal(output.premises[0].current,false); assert.equal(output.premises[0].inventoryObserved,true);
    assert.equal(output.premises[0].staleOrUnconfirmed,true);
  }
  for (const observed_at of ['2020-01-01T00:00:00Z','2026-10-23T05:00:00Z','2026']) {
    const output=await readSourcePremisesBaseline(fixture([head()],[premise({observed_at})]).executor,{now,registry:[registered]});
    assert.equal(output.premises[0].current,false);
  }
});

test('retained episode seed or disabled alert remains prior inventory, never current', async () => {
  for (const change of [{origin:'poll_retained_seed'},{inventory_flag:false},{stale:true},{availability:'out_of_stock',inventory_flag:false}]) {
    const output=await readSourcePremisesBaseline(fixture([head()],[premise(change)]).executor,{now,registry:[registered]});
    assert.equal(output.premises[0].current,false); assert.equal(output.premises[0].inventoryObserved,true);
  }
});

test('inventory, intelligence and directory are distinct even with copied alert flags', async () => {
  for (const [event_type,kind] of [['nc_board_shipment_snapshot','intelligence'],['public_directory','directory'],['retailer_catalog_availability','catalog']]) {
    const output=await readSourcePremisesBaseline(fixture([head()],[premise({event_type})]).executor,{now,registry:[registered]});
    assert.equal(output.premises[0].kind,kind); assert.equal(output.premises[0].inventoryObserved,false); assert.equal(output.premises[0].current,false);
  }
});

test('unknown source keeps prior inventory provenance and an explicit orphan gap', async () => {
  const output=await readSourcePremisesBaseline(fixture([head()],[premise({inventory_flag:false})]).executor,{now,registry:[]});
  assert.equal(output.heads[0].orphan,true); assert.equal(output.premises[0].orphan,true); assert.equal(output.premises[0].inventoryObserved,true);
  assert.equal(output.premises[0].current,false); assert.equal(output.completeness.currentPremisesComplete,false);
  assert.deepEqual(output.gaps,[{sourceId:'ca:test',reason:'unregistered_source'}]);
});

test('lane current/retained/negative rows use exact public-store fallback and head revision', async () => {
  const source: PremisesSourceRegistration={id:'liquor-library:sc',state:'SC',kind:'source-lane',expiryHours:1,
    stores:[{id:'liquor-library:store',name:'Liquor Library',address:'270 Hwy 17 N, North Myrtle Beach SC 29582'}]};
  const laneHead=head({storage:'lane',source_id:source.id,revision:'42',healthy:true});
  const laneRow=premise({storage:'lane',source_id:source.id,origin:'lane_current_subject',state:'SC',store_id:'liquor-library:store',subject_availability:'available'});
  const output=await readSourcePremisesBaseline(fixture([laneHead],[laneRow,{...laneRow,origin:'lane_retained_opportunity',closed:true},
    {...laneRow,state:'unavailable',address:null,name:null,subject_availability:'unavailable',inventory_flag:false,availability:null}]).executor,{now,registry:[source]});
  assert.equal(output.premises[0].current,true); assert.equal(output.premises[0].revision,42);
  assert.equal(output.premises[1].current,false); assert.equal(output.premises[1].retained,true); assert.equal(output.premises[1].closed,true);
  assert.equal(output.premises[2].state,'SC'); assert.equal(output.premises[2].address,source.stores![0].address);
  assert.equal(output.premises[2].negative,true); assert.equal(output.premises[2].inventoryObserved,true); assert.equal(output.premises[2].current,false);
});

test('incomplete identities and conflicting state become gaps rather than absence/current proof', async () => {
  const missing=await readSourcePremisesBaseline(fixture([head()],[premise({address:null})]).executor,{now,registry:[registered]});
  assert.equal(missing.premises.length,0); assert.equal(missing.completeness.currentPremisesComplete,false);
  const conflict=await readSourcePremisesBaseline(fixture([head()],[premise({state:'NY'})]).executor,{now,registry:[registered]});
  assert.equal(conflict.premises[0].current,false); assert.ok(conflict.gaps.some(row=>row.reason==='premise_state_conflict'));
  const absent=await readSourcePremisesBaseline(fixture([],[]).executor,{now,registry:[registered]});
  assert.equal(absent.completeness.currentHeadsComplete,false); assert.ok(absent.gaps.some(row=>row.reason==='registered_source_missing_head'));
  const invalid=await readSourcePremisesBaseline(fixture([head()],[premise({state:'SECRET_STATE'})]).executor,{now,registry:[registered]});
  assert.equal(invalid.premises[0].current,false);assert.ok(invalid.gaps.some(row=>row.reason==='premise_state_invalid'));
  const otherStore=await readSourcePremisesBaseline(fixture().executor,{now,registry:[{...registered,stores:[{id:'different-store:1',address:'456 Main Street'}]}]});
  assert.equal(otherStore.premises[0].current,false);assert.ok(otherStore.gaps.some(row=>row.reason==='premise_store_unregistered'));
});

test('unsafe typed fields cannot expose nested values and invalid generations fail closed', async () => {
  const output=await readSourcePremisesBaseline(fixture([head()],[premise({name:{email:'SECRET_MEMBER'},source_host:'example.com/SECRET_TOKEN',zip:['SECRET_MEMBER']})]).executor,{now,registry:[registered]});
  assert.equal(output.premises[0].name,null); assert.equal(output.premises[0].sourceHost,null); assert.ok(!JSON.stringify(output).includes('SECRET_'));
  for (const generation of ['9007199254740993','abc',-1,{},Infinity]) await assert.rejects(()=>readSourcePremisesBaseline(fixture([head({generation})]).executor,{now,registry:[registered]}));
});

test('hard head/record/byte bounds fail closed, with no truncated absence artifact', async () => {
  const manyHeads=Array.from({length:101},(_,i)=>head({source_id:`source:${i}`}));
  await assert.rejects(()=>readSourcePremisesBaseline(fixture(manyHeads,[]).executor,{now,registry:[]}));
  await assert.rejects(()=>readSourcePremisesBaseline(fixture([head()],Array.from({length:10001},()=>premise())).executor,{now,registry:[registered]}));
  await assert.rejects(()=>readSourcePremisesBaseline(fixture([head()],[premise({address:'x'.repeat(2*1024*1024)})]).executor,{now,registry:[registered]}));
});

test('statement is fixed read-only public projection, with overflow sentinels and no customer tables', () => {
  assert.ok(!/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|CALL)\b/iu.test(SOURCE_PREMISES_BASELINE_SQL));
  assert.ok(!/SELECT\s+\*/iu.test(SOURCE_PREMISES_BASELINE_SQL));
  assert.ok(!/\b(?:members|users|alerts|retailer_submissions|source_lane_demand|source_lane_trace|source_poll_trace)\b/iu.test(SOURCE_PREMISES_BASELINE_SQL));
  for(const clause of ['LIMIT 101','LIMIT 10001',"projection->'episodeSeeds'",'source_lane_subjects','source_lane_opportunities','statement_timestamp()','jsonb_typeof(source_url)']) assert.ok(SOURCE_PREMISES_BASELINE_SQL.includes(clause));
  assert.match(SOURCE_PREMISES_BASELINE_SQL,/jsonb_agg\(to_jsonb\(p\)/);
});

test('safe digest changes with authority generation and executor errors are sanitized', async () => {
  const first=await readSourcePremisesBaseline(fixture().executor,{now,registry:[registered]});
  const second=await readSourcePremisesBaseline(fixture([head({generation:'6'})]).executor,{now,registry:[registered]});
  assert.notEqual(first.provenance.headsSha256,second.provenance.headsSha256);
  await assert.rejects(()=>readSourcePremisesBaseline({query:async()=>{throw new Error('SECRET_TOKEN');}},{now,registry:[registered]}),error=>!String(error).includes('SECRET_TOKEN'));
});

test('fixed query executes against real existing schemas in local in-memory PostgreSQL', async () => {
  const database=new PGlite();
  try {
    await database.exec(await readFile(new URL('../src/lib/source-scheduler-schema.sql',import.meta.url),'utf8'));
    await database.exec(await readFile(new URL('../src/lib/source-lane-schema.sql',import.meta.url),'utf8'));
    const drop={state:'CA',storeId:'public-store:1',storeAddress:'123 Main St Unit 2, San Diego CA 92101',storeName:'Public Store',city:'San Diego',zip:'92101',
      sourceChain:'public-chain',eventType:'retailer_store_inventory_result',locationPrecision:'store_level',observedAt:'2026-10-23T03:49:00Z',availabilityStatus:'in_stock',
      canAlertAsInventory:true,canonicalName:'SECRET_BOTTLE',price:123,email:'SECRET_MEMBER',sourceUrl:'https://example.com/products/SECRET_BOTTLE?token=SECRET_TOKEN'};
    await database.query(`INSERT INTO source_poll_jobs(source_id,cadence_seconds,generation,accepted_at,last_reason,projection)
      VALUES('ca:test',1800,5,'2026-10-23T03:50:00Z','accepted',$1::jsonb)`,[JSON.stringify({policyId:'snapshot-1',drops:[drop],episodeSeeds:[drop],candidates:[{email:'SECRET_MEMBER'}]})]);
    await database.exec(`INSERT INTO source_lane_heads(source_id,generation,revision,accepted_at,last_reason,healthy) VALUES('liquor-library:sc',6,42,'2026-10-23T03:50:00Z','accepted',true);
      INSERT INTO source_lane_batches(source_id,run_id,revision,digest,observed_at,policy_id,accounting) VALUES('liquor-library:sc','fixture-run',42,'fixture-digest','2026-10-23T03:49:00Z','snapshot-1','{}');`);
    const laneDrop={...drop,state:'SC',storeId:'liquor-library:store',storeAddress:'270 Hwy 17 N, North Myrtle Beach SC 29582'};
    await database.query(`INSERT INTO source_lane_subjects(source_id,subject_id,payload) VALUES('liquor-library:sc','positive',$1::jsonb),('liquor-library:sc','negative',$2::jsonb)`,
      [JSON.stringify({state:'available',sourceDrop:laneDrop}),JSON.stringify({state:'unavailable',storeId:'liquor-library:store',observedAt:'2026-10-23T03:49:00Z'})]);
    await database.query(`INSERT INTO source_lane_opportunities(episode_id,source_id,subject_id,revision,run_id,observed_at,expires_at,closed,payload)
      VALUES('fixture-episode','liquor-library:sc','positive',42,'fixture-run','2026-10-23T03:49:00Z','2026-10-23T05:00:00Z',true,$1::jsonb)`,[JSON.stringify({sourceDrop:laneDrop,email:'SECRET_MEMBER'})]);
    let reads=0;
    const output=await readSourcePremisesBaseline({query:async text=>{reads++;const result=await database.query(text);assert.ok(!JSON.stringify(result.rows).includes('SECRET_'));return result as any;}},
      {now,registry:[registered,{id:'liquor-library:sc',state:'SC',expiryHours:1,stores:[{id:'liquor-library:store',address:'270 Hwy 17 N, North Myrtle Beach SC 29582'}]}]});
    assert.equal(reads,1);assert.equal(output.heads.length,2);assert.equal(output.premises.length,5);
    assert.equal(output.premises.filter(row=>row.current).length,2);
    assert.ok(output.premises.some(row=>row.negative&&row.address==='270 Hwy 17 N, North Myrtle Beach SC 29582'));
    assert.ok(output.premises.some(row=>row.origin==='lane_retained_opportunity'&&row.closed===true&&row.current===false));
    assert.equal(output.completeness.currentPremisesComplete,true);
    await database.query(`UPDATE source_poll_jobs SET projection=$1::jsonb WHERE source_id='ca:test'`,[JSON.stringify({policyId:{email:'SECRET_MEMBER'},drops:{email:'SECRET_MEMBER'}})]);
    const malformed=await readSourcePremisesBaseline({query:async text=>{const result=await database.query(text);assert.ok(!JSON.stringify(result.rows).includes('SECRET_'));return result as any;}},{now,registry:[registered]});
    assert.ok(malformed.gaps.some(row=>row.reason==='projection_schema_invalid'));
  } finally { await database.close(); }
});

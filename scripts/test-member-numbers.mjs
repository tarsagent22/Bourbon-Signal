import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('tsx/cjs');
const {ensureMemberNumber,memberNumberRepository}=require('../src/lib/member-numbers.ts');
const {publicSignalIdentityFromMetadata}=require('../src/lib/signals/signal-api-contract.ts');
const {founderNumberFromMetadata}=require('../src/lib/founder-allocation.ts');
const {directFounderRevocationMetadata}=require('../src/lib/direct-founder-revocation.ts');
const db=new PGlite();
try {
  await db.exec(await readFile(new URL('../src/lib/member-number-schema.sql',import.meta.url),'utf8'));
  const repo=memberNumberRepository({query:async(sql,params)=>(await db.query(sql,params)).rows});
  const users=[
    {id:'later',createdAt:2000,publicMetadata:{tier:'standard'}},
    {id:'founder',createdAt:1000,publicMetadata:{tier:'bottled-in-bond',founderNumber:8,memberNumber:8}},
    {id:'free',createdAt:3000,publicMetadata:{tier:'free'}},
  ];
  const rows=await repo.reconcile(users);
  assert.deepEqual(rows.map(r=>[r.user_id,Number(r.member_number)]),[['founder',1],['later',2],['free',3]]);
  assert.deepEqual(await repo.reconcile(users),rows,'retries must preserve numbers');
  const newest={id:'new',createdAt:4000,publicMetadata:{tier:'free',communityDisplayName:'Mikey'}};
  const [a,b]=await Promise.all([repo.reconcile([...users,newest]),repo.reconcile([...users,newest])]);
  assert.equal(Number(a.find(r=>r.user_id==='new')?.member_number),4);
  assert.deepEqual(a,b,'simultaneous attempts cannot allocate two numbers');
  const writes=[];
  const client={users:{getUserList:async()=>({data:[...users,newest],totalCount:4}),updateUserMetadata:async(id,patch)=>{writes.push({id,patch});}}};
  const reconciled=await ensureMemberNumber(client,newest,repo);
  assert.equal(reconciled.publicMetadata.memberNumber,4);
  assert.equal(reconciled.publicMetadata.communityDisplayName,'Mikey');
  assert.deepEqual(writes,[{id:'new',patch:{publicMetadata:{memberNumber:4,memberNumberVersion:'signup-order-v1'}}}],'only owned numbering keys are patched');
  assert.equal(founderNumberFromMetadata({tier:'bottled-in-bond',memberNumber:4,memberNumberVersion:'signup-order-v1'}),null,'a new Founder must allocate a Founder number independently');
  assert.equal(publicSignalIdentityFromMetadata({...users[1].publicMetadata,memberNumber:1})?.label,'Founder #8');
  assert.equal(founderNumberFromMetadata(reconciled.publicMetadata),null,'regular member numbers are not Founder entitlements');
  assert.equal(Object.hasOwn(directFounderRevocationMetadata(),'memberNumber'),false,'revocation never clears permanent identity');
  await db.query('UPDATE member_numbers SET user_id=$2 WHERE user_id=$1',['new','deleted:subject']);
  const after=await repo.reconcile([{id:'next',createdAt:5000,publicMetadata:{}}]);
  assert.equal(Number(after[0].member_number),5,'deleted numbers are never reused');
  await assert.rejects(repo.reconcile([{id:'collision',createdAt:6000,publicMetadata:{memberNumber:2}}]));
  assert.equal(await repo.get('collision'),null,'conflicting legacy numbers fail atomically');
  console.log('Member numbers: signup ordering, retries, concurrency, Founder display, metadata isolation and deletion retention passed.');
} finally {await db.close();}

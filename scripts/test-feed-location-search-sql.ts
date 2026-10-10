import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {CommunitySightingsRepository} from '../src/lib/community-sightings-repository';

test('Community searches the database before pagination, preserves filters and treats state codes and wildcard characters literally',async()=>{
  const db=new PGlite();
  try {
    await db.exec(readFileSync('src/lib/community-safety.sql','utf8'));
    await db.exec('CREATE TABLE community_sightings(id text PRIMARY KEY,reporter_user_id text,created_at timestamptz,payload jsonb)');
    const repository=new CommunitySightingsRepository({query:async(sql:string,params:unknown[])=> (await db.query(sql,params)).rows} as never);
    const rows=[
      ...Array.from({length:90},(_,index)=>({id:`unrelated-${index}`,bottleName:'French Oak',storeName:'Other Shop',storeCity:'Richmond',storeState:'VA',rarityTier:'allocated',createdAt:'2026-10-09T12:00:00Z'})),
      {id:'nc-1',bottleName:'Weller Antique',storeName:'Wake County ABC',storeCity:'Raleigh',storeState:'NC',rarityTier:'allocated',createdAt:'2026-10-09T11:00:00Z'},
      {id:'nc-2',bottleName:'Eagle Rare',storeName:'Wake County ABC',storeCity:'Raleigh',storeState:'NC',rarityTier:'unicorn',createdAt:'2026-10-09T10:00:00Z'},
      {id:'ca-1',bottleName:'Single Barrel',storeName:'West Shop',storeCity:'Los Angeles',storeState:'CA',rarityTier:'limited',createdAt:'2026-10-09T09:00:00Z'},
    ];
    for(const row of rows) await db.query('INSERT INTO community_sightings VALUES($1,$2,$3,$4::jsonb)',[row.id,'author',row.createdAt,JSON.stringify(row)]);
    const first=await repository.listSightingsFeed('reader',1,null,{search:'Raleigh'});
    assert.deepEqual(first.sightings.map(row=>row.id),['nc-1']);
    assert.equal(first.totalSightings,2);
    const second=await repository.listSightingsFeed('reader',1,{createdAt:rows[90].createdAt,id:'nc-1'},{search:'Raleigh'});
    assert.deepEqual(second.sightings.map(row=>row.id),['nc-2']);
    assert.equal(second.totalSightings,2);
    for(const search of ['NC','North Carolina','Wake County ABC']) assert.equal((await repository.listSightingsFeed('reader',100,null,{search})).totalSightings,2);
    assert.deepEqual((await repository.listSightingsFeed('reader',100,null,{search:'CA'})).sightings.map(row=>row.id),['ca-1']);
    assert.deepEqual((await repository.listSightingsFeed('reader',100,null,{search:'Wake',rarities:['allocated']})).sightings.map(row=>row.id),['nc-1']);
    assert.equal((await repository.listSightingsFeed('reader',100,null,{search:'Raleigh',states:['VA']})).sightings.length,0);
    assert.deepEqual((await repository.listSightingsFeed('reader',100,null,{search:'Weller'})).sightings.map(row=>row.id),['nc-1']);
    for(const search of ['%','_',"' OR true --"]) assert.equal((await repository.listSightingsFeed('reader',100,null,{search})).sightings.length,0);
    await db.query('INSERT INTO community_member_blocks(user_id,blocked_user_id) VALUES($1,$2)',['reader','author']);
    assert.equal((await repository.listSightingsFeed('reader',100,null,{search:'Raleigh'})).sightings.length,0);
  } finally { await db.close(); }
});

test('Community uses current catalog rarity before LIMIT, even when old stored tiers disagree',async()=>{
 const db=new PGlite();
 try {
  await db.exec(readFileSync('src/lib/community-safety.sql','utf8'));
  await db.exec('CREATE TABLE community_sightings(id text PRIMARY KEY,reporter_user_id text,created_at timestamptz,payload jsonb)');
  const repository=new CommunitySightingsRepository({query:async(sql:string,params:unknown[])=> (await db.query(sql,params)).rows} as never);
  const rows=[{id:'common',bottleName:'Standard Bourbon',rarityTier:'unicorn',createdAt:'2026-10-09T12:00:00Z'}, {id:'corrected',bottleName:'E.H. Taylor Barrel Proof',rarityTier:'limited',createdAt:'2026-10-09T11:00:00Z'}, {id:'later',bottleName:'E.H. Taylor Barrel Proof',rarityTier:'allocated',createdAt:'2026-10-09T10:00:00Z'}];
  for(const row of rows) await db.query('INSERT INTO community_sightings VALUES($1,$2,$3,$4::jsonb)',[row.id,'author',row.createdAt,JSON.stringify(row)]);
  const filters={rarities:['allocated'],catalogRarityTiers:{'standard bourbon':'unclassified','e h taylor barrel proof':'allocated'}};
  const first=await repository.listSightingsFeed('reader',1,null,filters);
  assert.deepEqual(first.sightings.map(row=>row.id),['corrected']);assert.equal(first.totalSightings,2);
  const second=await repository.listSightingsFeed('reader',1,{createdAt:rows[1].createdAt,id:'corrected'},filters);
  assert.deepEqual(second.sightings.map(row=>row.id),['later']);
  assert.equal((await repository.listSightingsFeed('reader',1,null,{...filters,rarities:['unicorn']})).totalSightings,0);
 } finally {await db.close();}
});

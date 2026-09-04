import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { withCollectionContext, writeCollectionFile, collectionRequestSignal } from '../src/core/collection-context.mjs';

test('F01 cancellation cannot truncate a previously committed collector cache',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'astra-cache-'));
  const file=path.join(dir,'cache.json');
  try {
    await writeFile(file,'previous fixture');
    const controller=new AbortController();
    await assert.rejects(withCollectionContext({signal:controller.signal},async()=>{
      const writing=writeCollectionFile(file,Buffer.alloc(8*1024*1024));
      setImmediate(()=>controller.abort());
      await writing;
    }));
    assert.equal(await readFile(file,'utf8'),'previous fixture');
    assert.deepEqual(await readdir(dir),['cache.json']);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('F01 pre-aborted context performs no request and does not affect siblings',async()=>{
  let calls=0;
  await assert.rejects(withCollectionContext({signal:AbortSignal.abort()},async()=>{calls++;}));
  await withCollectionContext({},async()=>{collectionRequestSignal();calls++;});
  assert.equal(calls,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithMeta } from '../src/core/fetcher.mjs';
import { fetchCollectionResponse } from '../src/core/collection-http.mjs';
import { ncBoardPageSourceIdentity } from '../src/collectors/north-carolina-intelligence.mjs';

async function fixture(fn, run) {
  const original=globalThis.fetch;
  try {globalThis.fetch=fn; await run();} finally {globalThis.fetch=original;}
}
const options={reviewedSeedUrls:['https://reviewed.example/']};
for (const destination of ['https://evil.example/','https://reviewed.example.evil.example/','https://sub.reviewed.example/','http://reviewed.example/','https://user:secret@reviewed.example/','https://reviewed.example:444/','https://127.0.0.1/','https://[::1]/','file:///etc/passwd','https://abc2.nc.gov/Pricing/SpecialItems']) {
  test(`R1 rejects destination BEFORE request: ${destination}`,async()=>{
    let calls=0,cancelled=0;
    await fixture(async(_url,opts)=>{calls++;assert.equal(opts.redirect,'manual');return {status:302,headers:new Headers({location:destination}),body:{cancel:async()=>{cancelled++;}}};},async()=>{
      const result=await fetchWithMeta('https://reviewed.example/',options);
      assert.equal(result.ok,false);assert.equal(calls,1);assert.equal(cancelled,1);
    });
  });
}
for (const url of ['http://unreviewed.example/','https://user:secret@reviewed.example/','http://user:secret@reviewed.example/']) test(`R1 unsafe start makes no request: ${url}`,async()=>{
  let calls=0;
  await fixture(async()=>{calls++;throw Error('unexpected');},async()=>{assert.equal((await fetchWithMeta(url,options)).ok,false);assert.equal(calls,0);});
});
test('R1 source list cannot permit a cross-identity hop even between two reviewed hosts',async()=>{
  let calls=0;
  await fixture(async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://other.example/'}});},async()=>{
    assert.equal((await fetchWithMeta('https://reviewed.example/',{reviewedSeedUrls:['https://reviewed.example/','https://other.example/']})).ok,false);
    assert.equal(calls,1);
  });
});
test('R1 relative redirects are bounded; loop cannot issue a duplicate request',async()=>{
  let calls=0;
  await fixture(async()=>new Response(null,{status:302,headers:{location:`/hop${++calls}`}}),async()=>{
    assert.equal((await fetchWithMeta('https://reviewed.example/',options)).ok,false);assert.equal(calls,4);
  });
  calls=0;
  await fixture(async()=>{calls++;return new Response(null,{status:302,headers:{location:'/'}});},async()=>{
    assert.equal((await fetchWithMeta('https://reviewed.example/',options)).ok,false);assert.equal(calls,1);
  });
});
test('R1 abort between redirects prevents next request and cancels response',async()=>{
  const controller=new AbortController();let calls=0,cancelled=0;
  await fixture(async()=>{calls++;controller.abort();return {status:302,headers:new Headers({location:'/next'}),body:{cancel:async()=>{cancelled++;}}};},async()=>{
    assert.equal((await fetchWithMeta('https://reviewed.example/',{...options,signal:controller.signal})).ok,false);
    assert.equal(calls,1);assert.equal(cancelled,1);
  });
});
test('R1 final redirected body stays bounded and cancels stream',async()=>{
  let calls=0,cancelled=0;
  await fixture(async()=>++calls===1 ? new Response(null,{status:301,headers:{location:'https://www.reviewed.example/next'}}) : new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(20));},cancel(){cancelled++;}})),async()=>{
    const result=await fetchWithMeta('https://reviewed.example/',{...options,maxBytes:10});
    assert.equal(result.ok,false);assert.match(result.error,/exceeded/);assert.equal(cancelled,1);assert.equal(calls,2);
  });
});
test('R1 POST never replays body on canonical redirect',async()=>{
  let calls=0;
  await fixture(async()=>{calls++;return new Response(null,{status:307,headers:{location:'/next'}});},async()=>{
    await assert.rejects(fetchCollectionResponse('https://reviewed.example/',{...options,method:'POST',body:'fixture'}),/method cannot redirect/);assert.equal(calls,1);
  });
});
test('R1 NC identity agrees with safe Wake topology and rejects userinfo',()=>{
  assert.equal(ncBoardPageSourceIdentity('http://www.wakeabc.com/','https://wakeabc.com/', ['https://wakeabc.com/']).verified,true);
  assert.equal(ncBoardPageSourceIdentity('https://user:secret@wakeabc.com/','https://wakeabc.com/', ['https://wakeabc.com/']).verified,false);
});

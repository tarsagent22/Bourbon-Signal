import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
test('mobile JavaScript/tooling dependency graph excludes audited parser ranges',()=>{
  const decoderEntries=Object.entries(lock.packages).filter(([key])=>key.endsWith('/decode-uri-component'));
  assert.equal(decoderEntries.length,1);
  assert.equal(decoderEntries[0][1].version,'0.5.1');
  const rpcEntries=Object.entries(lock.packages).filter(([key])=>key.endsWith('/jayson'));
  assert.ok(rpcEntries.length);
  for(const [,entry] of rpcEntries)assert.equal(entry.version,'4.1.3');
  assert.ok(!Object.keys(lock.packages).some(k=>k.endsWith('/stream-json')));
  for(const [key,value] of Object.entries(lock.packages))if(key.endsWith('/@xmldom/xmldom'))assert.equal(value.version,'0.9.12');
});
test('query parsing used by routing preserves arrays, Unicode, null and malformed input',async()=>{
  const q=(await import('query-string')).default;
  const parsed=q.parse('bottle=Eagle%20Rare&bottle=Blanton%27s&state=NC&empty&unicode=%E2%9C%93');
  assert.deepEqual([...parsed.bottle],['Eagle Rare',"Blanton's"]);
  assert.equal(parsed.state,'NC');assert.equal(parsed.empty,null);assert.equal(parsed.unicode,'✓');
  assert.deepEqual({...q.parse(q.stringify(parsed))},{...parsed});
  assert.equal(typeof q.parse('x=%E0%A4%A').x,'string');
});

test('patched decoder keeps normal and malformed decoding semantics',async()=>{
  const decode=(await import('decode-uri-component')).default;
  for(const [encoded,expected] of [
    ['Blanton%27s%20Original',"Blanton's Original"],['%E2%9C%93','✓'],
    ['%%7Bst%C3%A5le%7D%','%{ståle}%'],['%E0%A4%A','%E0%A4%A'],
    ['%zz%41%','%zzA%'],['%C2','�'],['%FE%FF','��'],
  ])assert.equal(decode(encoded),expected,encoded);
  assert.throws(()=>decode(null),TypeError);
});

test('GHSA-qr28-fpjm-wq7f malformed distinct runs complete within a bounded child process',()=>{
  // Upstream advisory: https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-qr28-fpjm-wq7f
  // Isolate the former event-loop stall; a vulnerable decoder cannot hang tests.
  const source=`import assert from 'node:assert/strict';import decode from 'decode-uri-component';import q from 'query-string';
    const payload=Array.from({length:32000},(_,index)=>'%'+Math.floor(index/256).toString(16).padStart(2,'0')+'%'+(index%256).toString(16).padStart(2,'0')+'x').join('')+'%zz';
    const decoded=decode(payload);assert.ok(decoded.endsWith('%zz'));assert.equal(q.parse('route='+payload).route,decoded);
    console.log(JSON.stringify({inputBytes:Buffer.byteLength(payload),directAndRoutingDecodersPassed:true}));`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:5000,windowsHide:true});
  assert.equal(run.error,undefined,String(run.error));assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{inputBytes:224003,directAndRoutingDecodersPassed:true});
});
test('Expo tooling property lists and JSON-RPC still roundtrip',async()=>{
  const plist=require('plist');const source={Title:'value & <>',Count:2};assert.deepEqual(plist.parse(plist.build(source)),source);
  const rpcPath=Object.keys(lock.packages).find(key=>key.endsWith('/jayson'));
  const jayson=require(fileURLToPath(new URL(`../${rpcPath}`,import.meta.url)));const server=new jayson.Server({sum:(args,callback)=>callback(null,args[0]+args[1])});
  const response=await new Promise((resolve,reject)=>server.call({jsonrpc:'2.0',method:'sum',params:[2,3],id:1},(error,result)=>error?reject(error):resolve(result)));
  assert.equal(response.result,5);
});

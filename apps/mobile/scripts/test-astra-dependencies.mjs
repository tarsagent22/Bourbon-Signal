import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
test('mobile JavaScript/tooling dependency graph excludes audited parser ranges',()=>{
  assert.equal(lock.packages['node_modules/decode-uri-component'].version,'0.5.0');
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
test('Expo tooling property lists and JSON-RPC still roundtrip',async()=>{
  const plist=require('plist');const source={Title:'value & <>',Count:2};assert.deepEqual(plist.parse(plist.build(source)),source);
  const rpcPath=Object.keys(lock.packages).find(key=>key.endsWith('/jayson'));
  const jayson=require(fileURLToPath(new URL(`../${rpcPath}`,import.meta.url)));const server=new jayson.Server({sum:(args,callback)=>callback(null,args[0]+args[1])});
  const response=await new Promise((resolve,reject)=>server.call({jsonrpc:'2.0',method:'sum',params:[2,3],id:1},(error,result)=>error?reject(error):resolve(result)));
  assert.equal(response.result,5);
});

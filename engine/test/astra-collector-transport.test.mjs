import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithMeta } from '../src/core/fetcher.mjs';
import { collectPrecisionProbes } from '../src/collectors/precision-probes.mjs';

function hugeResponse(onText, onCancel) {
  return {ok:true,status:200,url:'https://fixture.example',headers:new Headers(),
    text:async()=>{onText();return 'x'.repeat(9*1024*1024);},
    body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){onCancel();}})};
}
test('F09 core streams and cancels oversized bodies without whole-body buffering',async()=>{
  const original=globalThis.fetch;let textCalls=0,cancelled=0;
  globalThis.fetch=async()=>hugeResponse(()=>textCalls++,()=>cancelled++);
  try {const result=await fetchWithMeta('https://fixture.example',{maxBytes:1024});assert.equal(result.ok,false);assert.equal(textCalls,0);assert.equal(cancelled,1);}
  finally{globalThis.fetch=original;}
});
test('F09 core does not follow redirects or accept HTTP destinations',async()=>{
  const original=globalThis.fetch;let called=0;
  globalThis.fetch=async(_url,options)=>{called++;assert.equal(options.redirect,'error');return new Response('',{status:302,headers:{location:'http://127.0.0.1/'}});};
  try {const result=await fetchWithMeta('https://fixture.example');assert.equal(result.ok,false);await fetchWithMeta('http://fixture.example');assert.equal(called,1);}
  finally{globalThis.fetch=original;}
});
test('F09 already aborted core request never calls transport',async()=>{
  const original=globalThis.fetch;let called=0;
  globalThis.fetch=async()=>{called++;return new Response('');};
  try {await fetchWithMeta('https://fixture.example',{signal:AbortSignal.abort()});assert.equal(called,0);}
  finally{globalThis.fetch=original;}
});
test('F09 Mississippi POST uses streaming limit too',async()=>{
  const original=globalThis.fetch;let textCalls=0,cancelled=0,posts=0;
  globalThis.fetch=async(_url,options)=>{if(options.method==='POST'){posts++;return hugeResponse(()=>textCalls++,()=>cancelled++);} return new Response('',{status:403});};
  try {await collectPrecisionProbes({id:'MS'},{match:()=>null},[],{sourceRunnerOptions:{schedule:false,maxAttempts:1}});assert.ok(posts>0);assert.equal(textCalls,0);assert.equal(cancelled,posts);}
  finally{globalThis.fetch=original;}
});
test('F09 oversized 429 body preserves HTTP provenance',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>({...hugeResponse(()=>{},()=>{}),ok:false,status:429});
  try {const result=await fetchWithMeta('https://fixture.example',{maxBytes:1024});assert.equal(result.status,429);assert.equal(result.ok,false);assert.match(result.error,/exceed/i);}
  finally{globalThis.fetch=original;}
});
for(const state of ['NC','TX']) test(`F09 ${state} precision transport bounds bodies and rejects redirect following`,async()=>{
  const original=globalThis.fetch;let textCalls=0,cancelled=0,calls=0,redirect;
  globalThis.fetch=async(_url,options)=>{calls++;redirect=options.redirect;if(calls===1)return hugeResponse(()=>textCalls++,()=>cancelled++);return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
  try {await collectPrecisionProbes({id:state,label:state,sources:[]},{match:()=>null},[],{sourceRunnerOptions:{schedule:false,maxAttempts:1,timeoutMs:50}});assert.equal(textCalls,0);assert.equal(cancelled,1);assert.equal(redirect,'error');}
  finally{globalThis.fetch=original;}
});

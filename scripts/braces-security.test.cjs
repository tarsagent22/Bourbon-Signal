'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const path=require('node:path');
const fs=require('node:fs');
const {createRequire}=require('node:module');
const {spawnSync}=require('node:child_process');
const projectRequire=createRequire(path.join(process.cwd(),'package.json'));
const braces=projectRequire('braces');
const entry=projectRequire.resolve('braces');
const deepAst=()=>{let ast={type:'text',value:'x'};for(let i=0;i<2000;i++)ast={type:'root',nodes:[ast]};return ast;};
const depthError=error=>error instanceof RangeError&&error.code==='ERR_BRACES_DEPTH';

test('normal Metro and ESLint glob behavior remains compatible',()=>{
 assert.deepEqual(braces.expand('src/{app,lib}/file.{ts,tsx}'),['src/app/file.ts','src/app/file.tsx','src/lib/file.ts','src/lib/file.tsx']);
 assert.deepEqual(braces.expand('{a,{b,c}}'),['a','b','c']);
 assert.deepEqual(braces.expand('{01..03}'),['01','02','03']);
 assert.equal(braces.compile('src/{app,lib}/*.js'),'src/(app|lib)/*.js');
 const input='src/{a,{b,c}}/*.js';assert.equal(braces.stringify(braces.parse(input)),input);
 assert.deepEqual(braces(['{a,b}','{c,d}'],{expand:true}),['a','b','c','d']);
});

test('deep brace and parenthesis patterns reject before recursive walkers',()=>{
 for(const input of ['{'.repeat(4000)+'x'+'}'.repeat(4000),'('.repeat(4000)+'x'+')'.repeat(4000),'{'.repeat(4000)+'x']){
  for(const api of ['parse','compile','expand','stringify']) assert.throws(()=>braces[api](input),depthError,api);
  assert.throws(()=>braces(input),depthError);
  assert.throws(()=>braces(input,{expand:true,maxDepth:Infinity,maxLength:Infinity}),depthError);
 }
});

test('caller-supplied deep or cyclic ASTs are bounded through every walker entry',()=>{
 const ast=deepAst();const cycle={type:'root',nodes:[]};cycle.nodes.push(cycle);
 for(const api of ['compile','expand','stringify']){
  assert.throws(()=>braces[api](ast),depthError,api);
  assert.throws(()=>braces[api](cycle),depthError,api);
  const raw=require(path.join(path.dirname(entry),'lib',api));
  assert.throws(()=>raw(ast),depthError,'direct '+api);
  assert.throws(()=>raw(cycle),depthError,'direct cycle '+api);
 }
});

test('bounded nested patterns and shared leaf ASTs remain supported',()=>{
 const input='{'.repeat(30)+'x'+'}'.repeat(30);
 const ast=braces.parse(input);assert.equal(braces.stringify(ast),input);
 const leaf={type:'text',value:'x'};assert.equal(braces.stringify({type:'root',nodes:[leaf,leaf]}),'xx');
});

test('untrusted deep input completes in an isolated process without stack exhaustion',()=>{
 const program=`const b=require(${JSON.stringify(entry)});try{b.expand('{'.repeat(4000)+'x'+'}'.repeat(4000));process.exit(2);}catch(e){if(e.code!=='ERR_BRACES_DEPTH')throw e;process.stdout.write('bounded');}`;
 const result=spawnSync(process.execPath,['-e',program],{encoding:'utf8',timeout:3000});
 assert.equal(result.error,undefined);assert.equal(result.status,0);assert.equal(result.stdout,'bounded');
});

'use strict';
// A file dependency is not certified by npm audit. Verify its tested patch and
// freshly query its published base; only this specifically fixed advisory is accepted.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
async function main(){
 const repo=path.resolve(__dirname,'..');
 const project=process.cwd();
 const requireProject=createRequire(path.join(project,'package.json'));
 const installed=path.dirname(requireProject.resolve('braces'));
 const canonical=path.join(repo,'vendor/braces');
 const mobile=path.join(repo,'apps/mobile/vendor/braces');
 const provenance=JSON.parse(fs.readFileSync(path.join(canonical,'provenance.json'),'utf8'));
 assert.equal(provenance.upstreamVersion,'3.0.3');
 assert.equal(provenance.advisory,'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm');
 for(const folder of [canonical,mobile,installed]){
  assert.equal(JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8')).version,'3.0.4-bs.1');
  for(const [file,hash] of Object.entries(provenance.patchedHashes)){
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,file))).digest('hex'),hash,folder+'/'+file);
  }
 }
 const lock=JSON.parse(fs.readFileSync(path.join(project,'package-lock.json'),'utf8'));
 const entries=Object.entries(lock.packages).filter(([name])=>name==='node_modules/braces'||name.endsWith('/node_modules/braces'));
 assert.ok(entries.length);
 for(const [name,entry] of entries){
  assert.ok((entry.link===true&&entry.resolved==='vendor/braces')||(entry.version==='3.0.4-bs.1'&&entry.resolved==='file:vendor/braces'),'Unpatched locked braces: '+name);
 }
 execFileSync(process.execPath,['--test',path.join(__dirname,'braces-security.test.cjs')],{stdio:'inherit',cwd:project});
 const response=await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({braces:[provenance.upstreamVersion]}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Brace advisory lookup failed: HTTP '+response.status);
 const report=await response.json();assert.ok(report&&typeof report==='object'&&!Array.isArray(report));
 for(const [name,advisories] of Object.entries(report)){
  assert.equal(name,'braces');assert.ok(Array.isArray(advisories));
  for(const advisory of advisories)assert.equal(advisory.url,provenance.advisory,'Unaddressed advisory in braces base: '+JSON.stringify(advisory));
 }
 console.log('Fresh braces base advisories and installed bounded-depth backport verified.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');
async function main() {
 const root = path.resolve(__dirname, '..');
 const project = process.cwd();
 const loader = createRequire(path.join(project, 'package.json'));
 const mm = loader('minimatch');
 assert.equal(typeof mm, 'function');
 assert.equal(mm('src/a.js', '**/*.js'), true);
 assert.equal(mm('src/a.ts', '**/*.js'), false);
 assert.deepEqual(['a.js','a.ts'].filter(mm.filter('*.js')), ['a.js']);
 assert.equal(new mm.Minimatch('*.js').match('a.js'), true);
 assert.equal(mm.defaults({nocase:true})('A.JS','*.js'), true);
 assert.equal(loader('minimatch-upstream/package.json').version, '11.0.3');
 const esm = await import(require('node:url').pathToFileURL(loader.resolve('minimatch')).href.replace('index.cjs','index.mjs'));
 assert.equal(new esm.Minimatch('*.js').match('a.js'), true);
 assert.equal(esm.minimatch('a.js','*.js'), true);
 assert.equal(esm.default('a.js','*.js'), true);
 for(const file of ['package.json','index.cjs','index.mjs']) {
  assert.deepEqual(fs.readFileSync(path.join(root,'vendor/minimatch',file)),fs.readFileSync(path.join(root,'apps/mobile/vendor/minimatch',file)));
 }
 const lock = JSON.parse(fs.readFileSync(path.join(project,'package-lock.json')));
 const globs = Object.entries(lock.packages).filter(([name]) => name.endsWith('node_modules/glob'));
 assert.ok(globs.length);
 for(const [name,entry] of globs) {
  const glob = loader(path.join(project,name));
  if(entry.version.startsWith('7.')) {
   assert.equal(typeof glob,'function');
   assert.deepEqual(glob.sync('vendor/minimatch/*.cjs',{cwd:project}), [path.join('vendor','minimatch','index.cjs')]);
  } else {
   assert.equal(entry.version,'14.0.3');
   assert.deepEqual(await glob.glob('vendor/minimatch/*.cjs',{cwd:project}), [path.join('vendor','minimatch','index.cjs')]);
   const controller = new AbortController(); controller.abort(new Error('regression abort'));
   await assert.rejects(glob.glob('**/*',{cwd:project,signal:controller.signal}), /regression abort/);
  }
 }
 if (JSON.parse(fs.readFileSync(path.join(project,'package.json'))).devDependencies?.eslint) {
 const {ESLint} = loader('eslint');
 const eslint = new ESLint({overrideConfigFile:true,overrideConfig:[{files:['**/*.js'],rules:{'no-unused-vars':'error'}}]});
 const result = await eslint.lintText('const unusedSecurityFixture = 1;', {filePath:'security-fixture.js'});
 assert.ok(result[0].messages.some(message=>message.ruleId==='no-unused-vars'));
 }
 // Exercise the high-optimization parser in an isolated process with a hard deadline.
 execFileSync(process.execPath,['-e',`const assert=require('node:assert/strict');const mm=require('minimatch');const p=Array(32).fill('**/../x').join('/'); try { const x=new mm.Minimatch(p,{optimizationLevel:2});assert.ok(x.set.length<=100000); } catch(e) { assert.match(e.message,/brace|expand|limit|complex|pattern|maximum/i); }`],{cwd:project,timeout:5000,stdio:'inherit'});
 const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({minimatch:['11.0.3'],glob:['14.0.3']}),signal:AbortSignal.timeout(30000)
 });
 assert.equal(response.ok,true);assert.deepEqual(await response.json(),{});
 console.log('Patched glob/minimatch legacy and modern consumers, abort, lint, bounded parser, and advisory checks passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

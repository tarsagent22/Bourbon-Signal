// Offline-only harness: runs authored TypeScript, never resolves provider modules.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function functions(file, names, bindings = {}) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
  if (declarations.length !== names.length) throw new Error(`Missing test target in ${file}`);
  const text = declarations.map(n => n.getText(source).replace(/^export /, '')).join('\n');
  const context = vm.createContext({ console, Date, URL, ...bindings });
  vm.runInContext(ts.transpile(text, { target: ts.ScriptTarget.ES2022 }), context, { filename: file });
  return context;
}
function moduleFrom(file, stubs = {}, cache = new Map()) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full);
  const exports = {};
  cache.set(full, exports);
  const text = fs.readFileSync(full, 'utf8');
  const requireLocal = id => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id.startsWith('node:')) return require(id);
    if (id.startsWith('./') || id.startsWith('../')) {
      let target = path.resolve(path.dirname(full), id);
      if (!path.extname(target)) target += '.ts';
      return moduleFrom(target, stubs, cache);
    }
    throw new Error(`Unstubbed import (network blocked): ${id} in ${file}`);
  };
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: requireLocal, console, Date, URL, process: { env: { STRIPE_SECRET_KEY: 'offline-fixture', STRIPE_WEBHOOK_SECRET: 'offline-fixture' }, cwd: () => root }, setTimeout, clearTimeout, Buffer }, { filename: full });
  return exports;
}
module.exports = { functions, moduleFrom, root };

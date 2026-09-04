import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Execute authored TS/TSX with explicitly injected native boundaries, no device/network.
export function loadWithMocks(file: string, mocks: Record<string, unknown>) {
  const absolute = path.resolve(file);
  const localRequire = createRequire(absolute);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((id: string) => id in mocks ? mocks[id] : localRequire(id), module, module.exports);
  return module.exports;
}

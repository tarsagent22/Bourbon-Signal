import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const conversionTracking = { useConversionTracking: () => () => {} };

// Execute authored TS/TSX with explicitly injected native boundaries, no device/network.
export function loadWithMocks(file: string, mocks: Record<string, unknown>) {
  const absolute = path.resolve(file);
  const localRequire = createRequire(absolute);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  const requireWithMocks = (id: string) => {
    if (id in mocks) return mocks[id];
    if (id.endsWith('/activity/useConversionTracking')) return conversionTracking;
    return localRequire(id);
  };
  new Function('require', 'module', 'exports', code)(requireWithMocks, module, module.exports);
  return module.exports;
}

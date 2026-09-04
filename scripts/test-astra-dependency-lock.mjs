import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const semver = require('semver');
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
// Regression ranges from the pinned Astra npm-advisory fixtures (2026-09-04).
// This is NOT a replacement for the fresh, all-lockfile CI advisory gate.
for (const [name, vulnerable] of Object.entries({
  '@humanfs/node': '<0.16.8', 'fast-uri': '>=3.0.0 <3.1.6',
  fflate: '>=0.8.0 <0.8.3', nanoid: '<3.3.18', postcss: '<=8.5.22',
})) {
  test(`every locked ${name} instance excludes the audited vulnerable range`, () => {
    const nodes = Object.entries(lock.packages).filter(([path]) => path.endsWith(`node_modules/${name}`));
    assert.ok(nodes.length, `must inspect actual locked ${name}`);
    for (const [path, entry] of nodes) assert.equal(semver.satisfies(entry.version, vulnerable), false, `${path}@${entry.version}`);
  });
}

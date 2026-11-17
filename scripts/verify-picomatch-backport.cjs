'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

async function verify() {
  const project = process.cwd();
  const vendor = path.resolve(__dirname, '../apps/mobile/vendor');
  const provenance = require(path.join(vendor, 'picomatch-provenance.json'));
  const packages = require(path.join(project, 'package-lock.json')).packages;
  const consumers = new Set();

  for (const [directory, pkg] of Object.entries(packages)) {
    const requested = pkg.dependencies?.picomatch || pkg.peerDependencies?.picomatch;
    if (!requested) continue;
    const major = requested.startsWith('^2') ? 2 : 4;
    const loader = createRequire(path.join(project, directory, 'package.json'));
    const installed = fs.realpathSync(path.dirname(loader.resolve('picomatch/package.json')));
    const expected = fs.realpathSync(path.join(vendor, 'picomatch-v' + major));
    assert.equal(installed, expected, directory + ' must use the reviewed parser for its major');
    consumers.add(major);
  }
  assert.deepEqual([...consumers].sort(), [2, 4]);

  for (const [major, record] of Object.entries(provenance.packages)) {
    const directory = path.join(vendor, 'picomatch-v' + major);
    for (const [name, hash] of Object.entries(record.files)) {
      const bytes = fs.readFileSync(path.join(directory, name));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash, name);
    }
    const pico = require(directory);
    assert.ok(pico('**/*.{ts,tsx}')('src/Home.tsx'));
    assert.ok(pico('reports/+(Oak|Elm)/*.json')('reports/OakElm/feed.json'));
    for (const options of [{}, { maxExtglobRecursion: false }]) {
      const glob = 'reports/+(Oak*)/*.json';
      const matcher = pico(glob, options);
      assert.ok(matcher('reports/OakHill/data.json'));
      assert.equal(matcher('reports/Elm/data.json'), false);
      // Verify the compiler actually removed the redundant repetition.
      assert.equal(pico.makeRe(glob, options).source.includes(')+'), false);
    }
  }

  // npm's registry audit cannot see inside file dependencies. Audit the exact
  // published bases separately and fail closed if another advisory appears.
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ picomatch: Object.values(provenance.packages).map(p => p.base) }),
    signal: AbortSignal.timeout(30000)
  });
  assert.ok(response.ok, 'Registry advisory check failed with HTTP ' + response.status);
  const advisories = await response.json();
  assert.ok(advisories && typeof advisories === 'object' && !Array.isArray(advisories));
  for (const [name, entries] of Object.entries(advisories)) {
    assert.equal(name, 'picomatch');
    for (const entry of entries) assert.equal(entry.url, provenance.advisory, 'New picomatch advisory: ' + entry.url);
  }
  console.log('Verified installed picomatch consumers, parser backports and fresh base advisories.');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });

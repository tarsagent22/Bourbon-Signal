// npm audit cannot certify a local package. Keep checking its published base,
// accepting only the advisory fixed and regression-tested by this backport.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
async function main() {
  execFileSync(process.execPath, ['--test', path.join(__dirname, 'forge-security.test.cjs')], { stdio: 'inherit' });
  const provenance = require('../vendor/node-forge/provenance.json');
  assert.equal(provenance.upstreamVersion, '1.4.0');
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 'node-forge': [provenance.upstreamVersion] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Advisory lookup failed: HTTP ${response.status}`);
  const report = await response.json();
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Invalid advisory response');
  for (const [name, advisories] of Object.entries(report)) {
    assert.equal(name, 'node-forge');
    assert.ok(Array.isArray(advisories));
    for (const advisory of advisories) {
      assert.equal(advisory.url, 'https://github.com/advisories/GHSA-86w9-cpqp-85rv', `Unaddressed advisory in vendored base: ${JSON.stringify(advisory)}`);
    }
  }
  console.log('Published node-forge base has no unaddressed advisories; local RSA backport verified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

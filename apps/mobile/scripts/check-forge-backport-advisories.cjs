// Verify installed published cryptography and reject every current advisory.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
async function main() {
  execFileSync(process.execPath, ['--test', path.join(__dirname, 'forge-security.test.cjs')], { stdio: 'inherit' });
  const version = require('node-forge/package.json').version;
  assert.equal(version, '1.4.2');
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 'node-forge': [version] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Advisory lookup failed: HTTP ${response.status}`);
  const report = await response.json();
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Invalid advisory response');
  assert.deepEqual(report, {}, 'Published node-forge must have no current advisories');
  console.log('Published node-forge cryptography and advisory checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, generateKeyPairSync } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const vendor = path.resolve(__dirname, '../vendor/node-forge');
const forge = require(vendor);
const provenance = require(path.join(vendor, 'provenance.json'));
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = forge.pki.privateKeyFromPem(key.privateKey.export({ type: 'pkcs1', format: 'pem' }));
const publicKey = forge.pki.publicKeyFromPem(key.publicKey.export({ type: 'pkcs1', format: 'pem' }));
const digest = forge.md.sha256.create().update('local security regression fixture').digest().getBytes();
const a = forge.asn1;
const oid = a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(forge.pki.oids.sha256).getBytes());
const nil = () => a.create(a.Class.UNIVERSAL, a.Type.NULL, false, '');
function signature(children, outerExtra = []) {
  const info = a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, children),
    a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, digest), ...outerExtra,
  ]);
  return privateKey.sign(a.toDer(info).getBytes(), 'NONE');
}

test('only the reviewed RSA backport differs from published upstream library source', () => {
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  for (const [file, expected] of Object.entries(provenance.originalFiles)) {
    if (!file.startsWith('lib/') && file !== 'LICENSE' && file !== 'README.md') continue;
    assert.equal(hash(path.join(vendor, file)), file === 'lib/rsa.js' ? provenance.patchedRsaSha256 : expected, file);
  }
  const rsa = readFileSync(path.join(vendor, 'lib/rsa.js'), 'utf8');
  const patch = "obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {";
  const original = rsa.replace(patch, 'obj.value.length !== 2) {');
  assert.notEqual(original, rsa);
  assert.equal(createHash('sha256').update(original).digest('hex'), provenance.originalFiles['lib/rsa.js']);
  assert.deepEqual(readdirSync(path.join(vendor, 'lib')).sort(), Object.keys(provenance.originalFiles).filter(x => x.startsWith('lib/')).map(x => x.slice(4)).sort());
});

test('valid SHA-256 DigestInfo with absent or NULL parameters still verifies', () => {
  for (const children of [[oid], [oid, nil()]]) assert.equal(publicKey.verify(digest, signature(children)), true);
  const md = forge.md.sha256.create().update('real signing flow');
  assert.equal(publicKey.verify(md.digest().getBytes(), privateKey.sign(md)), true);
});

test('nested DigestAlgorithm garbage reproduces on upstream but is rejected after the backport', () => {
  const garbage = a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, 'injected bytes');
  const badSignature = signature([oid, nil(), garbage]);
  // Run the original, provenance-verified rsa.js in a fresh CommonJS module
  // against the same forge modules, then restore the patched implementation.
  const Module = require('node:module');
  const file = path.join(vendor, 'lib/rsa.js');
  const original = readFileSync(file, 'utf8').replace("obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {", 'obj.value.length !== 2) {');
  const module = new Module(file, moduleParent());
  module.filename = file; module.paths = Module._nodeModulePaths(path.dirname(file));
  try {
    module._compile(original, file);
    const unpatchedKey = forge.pki.setRsaPublicKey(publicKey.n, publicKey.e);
    assert.equal(unpatchedKey.verify(digest, badSignature), true, 'must demonstrate the original flaw');
  } finally {
    delete require.cache[require.resolve(file)]; require(file);
  }
  const patchedKey = forge.pki.setRsaPublicKey(publicKey.n, publicKey.e);
  assert.throws(() => patchedKey.verify(digest, badSignature), /DigestInfo/);
  assert.throws(() => patchedKey.verify(digest, signature([oid, nil(), nil()])), /DigestInfo/);
  assert.throws(() => patchedKey.verify(digest, signature([oid, nil()], [nil()])), /DigestInfo/);
  assert.equal(patchedKey.verify('wrong digest', signature([oid, nil()])), false);
});
function moduleParent() { return module; }

test('Expo CLI and certificate tooling resolve the patched local dependency and still sign certificates', () => {
  const cliRequire = createRequire(require.resolve('expo/package.json'));
  const expoCliRequire = createRequire(cliRequire.resolve('@expo/cli/package.json'));
  const certRequire = createRequire(require.resolve('@expo/code-signing-certificates/package.json'));
  for (const loader of [expoCliRequire, certRequire]) {
    assert.equal(require('node:fs').realpathSync(loader.resolve('node-forge/lib/rsa.js')), path.join(vendor, 'lib/rsa.js'));
    assert.equal(loader('node-forge/package.json').version, '1.4.1-bs.1');
  }
  const certs = require('@expo/code-signing-certificates');
  const pair = { publicKey: forge.pki.setRsaPublicKey(publicKey.n, publicKey.e), privateKey };
  const certificate = certs.generateSelfSignedCodeSigningCertificate({ keyPair: pair, commonName: 'Security regression only', validityNotBefore: new Date('2020-01-01'), validityNotAfter: new Date('2040-01-01') });
  certs.validateSelfSignedCertificate(certificate, pair);
  assert.equal(certificate.verify(certificate), true);
});

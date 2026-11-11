const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, generateKeyPairSync } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const forge = require('node-forge');
const provenance = require('../security/node-forge-1.4.3.json');
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

test('published cryptography version and security-critical source match reviewed provenance', () => {
  assert.equal(require('node-forge/package.json').version, provenance.version);
  for (const [file, expected] of Object.entries(provenance.sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(require.resolve('node-forge/' + file))).digest('hex'), expected);
  }
});

test('valid SHA-256 DigestInfo with absent or NULL parameters still verifies', () => {
  for (const children of [[oid], [oid, nil()]]) assert.equal(publicKey.verify(digest, signature(children)), true);
  const md = forge.md.sha256.create().update('real signing flow');
  assert.equal(publicKey.verify(md.digest().getBytes(), privateKey.sign(md)), true);
});

test('malformed RSA DigestInfo is rejected by published upstream', () => {
  const garbage = a.create(a.Class.UNIVERSAL, a.Type.OCTETSTRING, false, 'injected bytes');
  assert.throws(() => publicKey.verify(digest, signature([oid, nil(), garbage])), /DigestInfo/);
  assert.throws(() => publicKey.verify(digest, signature([oid, nil(), nil()])), /DigestInfo/);
  assert.throws(() => publicKey.verify(digest, signature([oid, nil()], [nil()])), /DigestInfo/);
  assert.equal(publicKey.verify('wrong digest', signature([oid, nil()])), false);
});

test('interleaved TLS records after fragmented handshake close cleanly without crashing', () => {
  for (const server of [true, false]) for (const type of [20, 21, 23, 24]) {
    const errors = [];
    const connection = forge.tls.createConnection({ server, caStore: [],
      tlsDataReady() {}, dataReady() {}, connected() {}, closed() {},
      error(c, error) { errors.push(error); }
    });
    if (!server) connection.handshake();
    const hello = server ? '01' : '02';
    const fragment = '1603010006' + hello + '0000100301';
    const interleaved = type.toString(16) + '030100020228';
    assert.doesNotThrow(() => connection.process(forge.util.hexToBytes(fragment + interleaved)));
    assert.equal(connection.fail, true);
    assert.ok(errors.some(error => error.message === 'Invalid fragmented record.' &&
      error.alert.level === forge.tls.Alert.Level.fatal &&
      error.alert.description === forge.tls.Alert.Description.unexpected_message));
    assert.doesNotThrow(() => connection.process(forge.util.hexToBytes(interleaved)));
  }
});

test('Expo CLI and certificate tooling resolve the published secure dependency and still sign certificates', () => {
  const cliRequire = createRequire(require.resolve('expo/package.json'));
  const expoCliRequire = createRequire(cliRequire.resolve('@expo/cli/package.json'));
  const certRequire = createRequire(require.resolve('@expo/code-signing-certificates/package.json'));
  for (const loader of [expoCliRequire, certRequire]) {
    assert.equal(require('node:fs').realpathSync(loader.resolve('node-forge/lib/rsa.js')), require('node:fs').realpathSync(require.resolve('node-forge/lib/rsa.js')));
    assert.equal(loader('node-forge/package.json').version, provenance.version);
  }
  const certs = require('@expo/code-signing-certificates');
  const pair = { publicKey: forge.pki.setRsaPublicKey(publicKey.n, publicKey.e), privateKey };
  const certificate = certs.generateSelfSignedCodeSigningCertificate({ keyPair: pair, commonName: 'Security regression only', validityNotBefore: new Date('2020-01-01'), validityNotAfter: new Date('2040-01-01') });
  certs.validateSelfSignedCertificate(certificate, pair);
  assert.equal(certificate.verify(certificate), true);
});

test('Ed25519 rejects forged signatures under a small-order identity public key', () => {
  const identity = Buffer.alloc(32); identity[0] = 1;
  const signature = Buffer.alloc(64); signature[0] = 1;
  assert.equal(forge.ed25519.verify({ message: Buffer.from('attacker-selected message'), signature, publicKey: identity }), false);
  const pair = forge.ed25519.generateKeyPair({seed:Buffer.alloc(32,42)});
  const message = Buffer.from('valid Ed25519 signing flow');
  const valid = forge.ed25519.sign({message,privateKey:pair.privateKey});
  assert.equal(forge.ed25519.verify({message,signature:valid,publicKey:pair.publicKey}),true);
});

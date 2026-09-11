const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = require('../app.json').expo;
const pkg = require('../package.json');

test('iOS recovery is isolated from runtime 1.1.0 without changing Android', () => {
  assert.equal(app.ios.runtimeVersion, '1.1.0-ios-recovery-1');
  assert.equal(app.version, '1.1.0');
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.equal(app.android.runtimeVersion, undefined);
  assert.equal(app.updates.checkAutomatically, 'ON_LOAD');
});
test('release entry cannot use the diagnostic fixture', () => {
  assert.equal(pkg.main, 'expo-router/entry');
  assert.equal(fs.existsSync('metro.config.js'), false);
});
test('secure locked plist parser handles Expo generated XML', () => {
  const plist = require('@expo/plist').default;
  const xml = '\n<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>ready</key><true/></dict></plist>';
  assert.equal(plist.parse(xml).ready, true);
});

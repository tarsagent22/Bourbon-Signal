const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = require('../app.json').expo;
const pkg = require('../package.json');

test('Scanner binaries are isolated from prior OTA runtimes and each other', () => {
  assert.equal(app.ios.runtimeVersion, '1.1.0-ios-scan-1');
  assert.equal(app.version, '1.1.0');
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.equal(app.android.runtimeVersion, '1.1.0-android-scan-1');
  assert.equal(app.updates.checkAutomatically, 'ON_LOAD');
});
test('release entry cannot use the diagnostic fixture', () => {
  assert.equal(pkg.main, 'expo-router/entry');
  const metro = fs.readFileSync('metro.config.js','utf8');
  assert.match(metro,/getDefaultConfig/);
  assert.match(metro,/shared/);
  assert.doesNotMatch(metro,/native-home|diagnostic|resolveRequest|entryFile/);
});
test('secure locked plist parser handles Expo generated XML', () => {
  const plist = require('@expo/plist').default;
  const xml = '\n<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>ready</key><true/></dict></plist>';
  assert.equal(plist.parse(xml).ready, true);
});

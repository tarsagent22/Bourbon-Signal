const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = require('../app.json').expo;
const pkg = require('../package.json');

test('Native map binaries are isolated from prior OTA runtimes and each other', () => {
  assert.equal(app.ios.runtimeVersion, '1.1.1-ios-nearby-native-1');
  assert.equal(app.version, '1.1.1');
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.equal(app.android.runtimeVersion, '1.1.1-android-nearby-native-1');
  assert.equal(app.updates.checkAutomatically, 'ON_LOAD');
});
test('release entry cannot use the diagnostic fixture', () => {
  assert.equal(pkg.main, 'expo-router/entry');
  const metro = fs.readFileSync('metro.config.js','utf8');
  assert.match(metro,/getDefaultConfig/);
  assert.match(metro,/shared/);
  assert.doesNotMatch(metro,/native-home|native-nearby|diagnostic|resolveRequest|entryFile/);
});
test('secure locked plist parser handles Expo generated XML', () => {
  const plist = require('@expo/plist').default;
  const xml = '\n<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>ready</key><true/></dict></plist>';
  assert.equal(plist.parse(xml).ready, true);
});

test('generated iOS permissions retain metadata required by linked native SDKs', () => {
  // A false expo-location motion option deletes the plist key, not CoreMotion.
  // Apple rejected Build 27 despite the app never requesting motion activity.
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const cli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli');
  const config = JSON.parse(execFileSync(process.execPath,
    [cli, 'config', '--type', 'introspect', '--json'],
    { encoding: 'utf8', env: { ...process.env, EXPO_NO_DOTENV: '1' }, maxBuffer: 10 * 1024 * 1024 }));
  const plist = config._internal.modResults.ios.infoPlist;
  for (const key of ['NSMotionUsageDescription', 'NSLocationWhenInUseUsageDescription',
    'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription']) {
    assert.equal(typeof plist[key], 'string', `${key} must survive config plugins`);
    assert.ok(plist[key].trim().length > 20, `${key} needs a meaningful description`);
  }
  assert.match(plist.NSMotionUsageDescription, /does not request or collect your motion activity/);
  assert.equal(plist.NSLocationAlwaysUsageDescription, undefined);
  assert.equal(plist.NSLocationAlwaysAndWhenInUseUsageDescription, undefined);
  assert.ok(!(plist.UIBackgroundModes || []).includes('location'));
});

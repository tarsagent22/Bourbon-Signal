const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setReleaseProperties, useOptimizingRules, useCompatibleCompiler } = require('../plugins/with-android-release-optimization.cjs');

test('release optimization replaces conflicting properties without changing unrelated native settings', () => {
  const input = [
    { type: 'comment', value: 'Native settings' },
    { type: 'property', key: 'newArchEnabled', value: 'true' },
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
    { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'false' },
  ];
  const output = setReleaseProperties(input);
  assert.deepEqual(output.slice(0, 2), input.slice(0, 2));
  for (const key of ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds', 'android.r8.optimizedResourceShrinking']) {
    assert.deepEqual(output.filter(item => item.key === key), [{ type: 'property', key, value: 'true' }]);
  }
  assert.deepEqual(setReleaseProperties(output), output);
});

test('SDK optimization preserves application keep rules and survives repeated prebuilds', () => {
  const input = `release {\n minifyEnabled enableMinifyInReleaseBuilds\n proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'\n}`;
  const output = useOptimizingRules(input);
  assert.ok(output.includes('getDefaultProguardFile("proguard-android-optimize.txt"), \'proguard-rules.pro\''));
  assert.ok(output.includes('minifyEnabled enableMinifyInReleaseBuilds'));
  assert.equal(useOptimizingRules(output), output);
});

test('an unsupported future Gradle template cannot silently produce an unoptimized release', () => {
  assert.throws(() => useOptimizingRules('release { proguardFiles "unknown-rules.pro" }'), /template changed/);
});

test('Kotlin-compatible R8 is loaded before Android plugins without replacing their management', () => {
  const input = `pluginManagement {\n includeBuild("react-native-gradle-plugin")\n}\nplugins { id("com.facebook.react.settings") }`;
  const output = useCompatibleCompiler(input);
  assert.ok(output.includes('classpath("com.android.tools:r8:9.1.56")'));
  assert.ok(output.includes('includeBuild("react-native-gradle-plugin")'));
  assert.ok(output.indexOf('classpath("com.android.tools:r8:9.1.56")') < output.indexOf('plugins {'));
  assert.equal(useCompatibleCompiler(output), output);
  assert.throws(() => useCompatibleCompiler('plugins { id("unknown") }'), /template changed/);
});

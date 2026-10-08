const { withGradleProperties, withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const compilerMarker = '// bourbon-signal: R8 supports Clerk Kotlin 2.3 metadata';
const compilerConfiguration = `
  ${compilerMarker}
  buildscript {
    repositories {
      google()
      mavenCentral()
    }
    dependencies {
      classpath("com.android.tools:r8:8.13.19")
    }
  }
`;

const releaseProperties = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  // Required for optimized resource shrinking on our Android Gradle Plugin 8.12.
  'android.r8.optimizedResourceShrinking': 'true',
};

function setReleaseProperties(properties) {
  const retained = properties.filter(item => item.type !== 'property' || !(item.key in releaseProperties));
  return [...retained, ...Object.entries(releaseProperties).map(([key, value]) => ({ type: 'property', key, value }))];
}

function useOptimizingRules(contents) {
  // proguard-android.txt includes -dontoptimize. Merely enabling R8 would still
  // leave optimization disabled, so use the Android SDK's optimizing defaults.
  const rules = /getDefaultProguardFile\((['"])proguard-android(?:-optimize)?\.txt\1\)/g;
  if (!rules.test(contents)) throw new Error('Android release ProGuard template changed; review optimization before building.');
  return contents.replace(rules, 'getDefaultProguardFile("proguard-android-optimize.txt")');
}

function useCompatibleCompiler(contents) {
  if (contents.includes(compilerMarker)) return contents;
  const management = /^pluginManagement\s*\{/m;
  if (!management.test(contents)) throw new Error('Android plugin management template changed; review the R8 compiler before building.');
  // Override the embedded compiler in pluginManagement as documented by R8.
  // Clerk's serialization dependencies contain Kotlin 2.3 metadata, which the
  // compiler bundled with AGP 8.12 cannot rewrite correctly during minification.
  return contents.replace(management, match => `${match}${compilerConfiguration}`);
}

module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, mod => {
    mod.modResults = setReleaseProperties(mod.modResults);
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Android release Gradle format is unsupported.');
    mod.modResults.contents = useOptimizingRules(mod.modResults.contents);
    return mod;
  });
  return withSettingsGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Android settings Gradle format is unsupported.');
    mod.modResults.contents = useCompatibleCompiler(mod.modResults.contents);
    return mod;
  });
};

module.exports.setReleaseProperties = setReleaseProperties;
module.exports.useOptimizingRules = useOptimizingRules;
module.exports.useCompatibleCompiler = useCompatibleCompiler;

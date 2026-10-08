const { withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');

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

module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, mod => {
    mod.modResults = setReleaseProperties(mod.modResults);
    return mod;
  });
  return withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Android release Gradle format is unsupported.');
    mod.modResults.contents = useOptimizingRules(mod.modResults.contents);
    return mod;
  });
};

module.exports.setReleaseProperties = setReleaseProperties;
module.exports.useOptimizingRules = useOptimizingRules;

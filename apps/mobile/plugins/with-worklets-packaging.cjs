const { withProjectBuildGradle } = require('@expo/config-plugins');
const marker = '// bourbon-signal: Worklets has one native packaging owner';
const packaging = `
${marker}
subprojects { subproject ->
    subproject.plugins.withId('com.android.library') {
        if (subproject.name != 'react-native-worklets') {
            subproject.android.packagingOptions.jniLibs.excludes.add('**/libworklets.so')
        }
    }
}
`;
module.exports = function withWorkletsPackaging(config) {
  return withProjectBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Android root Gradle format is unsupported.');
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += packaging;
    return mod;
  });
};
module.exports.packaging = packaging;

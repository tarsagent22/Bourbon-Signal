const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(root);
const fixture = path.join(__dirname, 'fixture.ts');
const target = path.join(root, 'src/hooks/useMobileApi.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@clerk/expo') return {type:'sourceFile',filePath:fixture};
  const result = context.resolveRequest(context, moduleName, platform);
  if (result.type === 'sourceFile' && path.normalize(result.filePath) === target) return {type:'sourceFile',filePath:fixture};
  return result;
};
module.exports = config;

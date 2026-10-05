const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Shared product copy and owner DTOs have no platform dependencies.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../../shared')];
module.exports = config;

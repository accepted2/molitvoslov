const {getDefaultConfig} = require('expo/metro-config');

// Generate only lossless compressed calendar modules before Metro resolves them.
require('./scripts/pack-calendar-for-metro').prepareCalendarModules(__dirname);
const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('db')) {
  config.resolver.assetExts.push('db');
}
module.exports = config;

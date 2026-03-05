// Polyfill for Node.js < 18.14 — os.availableParallelism was added in 18.14.0
// EAS Build workers may run an older Node version that lacks this function.
const os = require("os");
if (typeof os.availableParallelism !== "function") {
  os.availableParallelism = () => Math.max(1, os.cpus().length - 1);
}

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;

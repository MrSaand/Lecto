// Polyfills for Node.js < 20 — EAS Build workers may run an older Node version.
const os = require("os");
if (typeof os.availableParallelism !== "function") {
  os.availableParallelism = () => Math.max(1, os.cpus().length - 1);
}
if (typeof Array.prototype.toReversed !== "function") {
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}
if (typeof Array.prototype.toSorted !== "function") {
  Array.prototype.toSorted = function (compareFn) {
    return [...this].sort(compareFn);
  };
}
if (typeof Array.prototype.toSpliced !== "function") {
  Array.prototype.toSpliced = function (start, deleteCount, ...items) {
    const copy = [...this];
    copy.splice(start, deleteCount, ...items);
    return copy;
  };
}
if (typeof Array.prototype.with !== "function") {
  Array.prototype.with = function (index, value) {
    const copy = [...this];
    copy[index < 0 ? this.length + index : index] = value;
    return copy;
  };
}

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

module.exports = config;

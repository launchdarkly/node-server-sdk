
exports.deprecated = function(oldName, newName) {
  return '[LaunchDarkly] "' + oldName + '" is deprecated, please use "' + newName + '"';
}

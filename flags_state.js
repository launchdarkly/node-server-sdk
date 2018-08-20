
function FlagsStateBuilder(valid) {
  var builder = {};
  var flagValues = {};
  var flagMetadata = {};

  builder.addFlag = function(flag, value, variation) {
    flagValues[flag.key] = value;
    var meta = {
      version: flag.version,
      trackEvents: flag.trackEvents
    };
    if (variation !== undefined && variation !== null) {
      meta.variation = variation;
    }
    if (flag.debugEventsUntilDate !== undefined && flag.debugEventsUntilDate !== null) {
      meta.debugEventsUntilDate = flag.debugEventsUntilDate;
    }
    flagMetadata[flag.key] = meta;
  };

  builder.build = function() {
    return {
      valid: valid,
      allValues: function() { return flagValues; },
      getFlagValue: function(key) { return flagValues[key]; },
      toJson: function() {
        return Object.assign({}, flagValues, { $flagsState: flagMetadata });
      }
    };
  }

  return builder;
}

module.exports = FlagsStateBuilder;

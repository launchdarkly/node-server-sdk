
function FlagsStateBuilder(valid) {
  var builder = {};
  var flagValues = {};
  var flagMetadata = {};

  builder.addFlag = function(flag, value, variation, reason) {
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
    if (reason) {
      meta.reason = reason;
    }
    flagMetadata[flag.key] = meta;
  };

  builder.build = function() {
    return {
      valid: valid,
      allValues: function() { return flagValues; },
      getFlagValue: function(key) { return flagValues[key]; },
      getFlagReason: function(key) {
        return flagMetadata[key] ? flagMetadata[key].reason : null;
      },
      toJSON: function() {
        return Object.assign({}, flagValues, { $flagsState: flagMetadata, $valid: valid });
      }
    };
  }

  return builder;
}

module.exports = FlagsStateBuilder;

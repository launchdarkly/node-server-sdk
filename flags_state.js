function FlagsStateBuilder(valid) {
  const builder = {};
  const flagValues = {};
  const flagMetadata = {};

  builder.addFlag = (flag, value, variation, reason, detailsOnlyIfTracked) => {
    flagValues[flag.key] = value;
    const meta = {};
    if (!detailsOnlyIfTracked || flag.trackEvents || flag.debugEventsUntilDate) {
      meta.version = flag.version;
      if (reason) {
        meta.reason = reason;
      }
    }
    if (variation !== undefined && variation !== null) {
      meta.variation = variation;
    }
    if (flag.trackEvents) {
      meta.trackEvents = true;
    }
    if (flag.debugEventsUntilDate !== undefined && flag.debugEventsUntilDate !== null) {
      meta.debugEventsUntilDate = flag.debugEventsUntilDate;
    }
    flagMetadata[flag.key] = meta;
  };

  builder.build = () => ({
    valid: valid,
    allValues: () => flagValues,
    getFlagValue: key => flagValues[key],
    getFlagReason: key => (flagMetadata[key] ? flagMetadata[key].reason : null),
    toJSON: () => Object.assign({}, flagValues, { $flagsState: flagMetadata, $valid: valid }),
  });

  return builder;
}

module.exports = FlagsStateBuilder;

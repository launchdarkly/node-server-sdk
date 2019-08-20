
function EventFactory(withReasons) {
  var ef = {};
  
  function isExperiment(flag, reason) {
    if (reason) {
      switch (reason.kind) {
        case 'RULE_MATCH':
          var index = reason.ruleIndex;
          if (index !== undefined) {
            var rules = flag.rules || [];
            return index >= 0 && index < rules.length && !!rules[index].trackEvents;
          }
          break;
        case 'FALLTHROUGH':
          return !!flag.trackEventsFallthrough;
          break;
      }
    }
    return false;
  }

  ef.newEvalEvent = function(flag, user, detail, defaultVal, prereqOfFlag) {
    var addExperimentData = isExperiment(flag, detail.reason);
    var e = {
      kind: 'feature',
      creationDate: new Date().getTime(),
      key: flag.key,
      user: user,
      value: detail.value,
      variation: detail.variationIndex,
      default: defaultVal,
      version: flag.version
    };
    // the following properties are handled separately so we don't waste bandwidth on unused keys
    if (addExperimentData || flag.trackEvents) {
      e.trackEvents = true;
    }
    if (flag.debugEventsUntilDate) {
      e.debugEventsUntilDate = flag.debugEventsUntilDate;
    }
    if (prereqOfFlag) {
      e.prereqOf = prereqOfFlag.key;
    }
    if (addExperimentData || withReasons) {
      e.reason = detail.reason;
    }
    return e;
  };

  ef.newDefaultEvent = function(flag, user, detail) {
    var e = {
      kind: 'feature',
      creationDate: new Date().getTime(),
      key: flag.key,
      user: user,
      value: detail.value,
      default: detail.value,
      version: flag.version
    };
    // the following properties are handled separately so we don't waste bandwidth on unused keys
    if (flag.trackEvents) {
      e.trackEvents = true;
    }
    if (flag.debugEventsUntilDate) {
      e.debugEventsUntilDate = flag.debugEventsUntilDate;
    }
    if (withReasons) {
      e.reason = detail.reason;
    }
    return e;
  };

  ef.newUnknownFlagEvent = function(key, user, detail) {
    var e = {
      kind: 'feature',
      creationDate: new Date().getTime(),
      key: key,
      user: user,
      value: detail.value,
      default: detail.value
    };
    if (withReasons) {
      e.reason = detail.reason;
    }
    return e;
  };

  ef.newIdentifyEvent = function(user) {
    return {
      kind: 'identify',
      creationDate: new Date().getTime(),
      key: user.key,
      user: user
    };
  };

  ef.newCustomEvent = function(eventName, user, data, metricValue) {
    var e = {
      kind: 'custom',
      creationDate: new Date().getTime(),
      key: eventName,
      user: user
    };
    if (data !== null && data !== undefined) {
      e.data = data;
    }
    if (metricValue !== null && metricValue !== undefined) {
      e.metricValue = metricValue;
    }
    return e;
  };

  return ef;
}

module.exports = EventFactory;


function EventSummarizer(config) {
  var es = {};

  var startDate = 0,
      endDate = 0,
      counters = {};
  
  es.summarizeEvent = function(event) {
    if (event.kind === 'feature') {
      var counterKey = event.key +
        ':' +
        ((event.variation !== null && event.variation !== undefined) ? event.variation : '') +
        ':' +
        ((event.version !== null && event.version !== undefined) ? event.version : '');
      var counterVal = counters[counterKey];
      if (counterVal) {
        counterVal.count = counterVal.count + 1;
      } else {
        counters[counterKey] = {
          count: 1,
          key: event.key,
          version: event.version,
          variation: event.variation,
          value: event.value,
          default: event.default
        };
      }
      if (startDate === 0 || event.creationDate < startDate) {
        startDate = event.creationDate;
      }
      if (event.creationDate > endDate) {
        endDate = event.creationDate;
      }
    }
  }

  es.getSummary = function() {
    var flagsOut = {};
    for (var i in counters) {
      var c = counters[i];
      var flag = flagsOut[c.key];
      if (!flag) {
        flag = {
          default: c.default,
          counters: []
        };
        flagsOut[c.key] = flag;
      }
      var counterOut = {
        value: c.value,
        count: c.count
      };
      if (c.variation !== undefined && c.variation !== null) {
        counterOut.variation = c.variation;
      }
      if (c.version) {
        counterOut.version = c.version;
      } else {
        counterOut.unknown = true;
      }
      flag.counters.push(counterOut);
    }
    return {
      startDate: startDate,
      endDate: endDate,
      features: flagsOut
    };
  }

  es.clearSummary = function() {
    startDate = 0;
    endDate = 0;
    counters = {};
  }

  return es;
}

module.exports = EventSummarizer;

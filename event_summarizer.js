const { getContextKinds } = require('./context');

function getKinds(event) {
  if (event.context) {
    return getContextKinds(event.context);
  }
  if (event.contextKeys) {
    return Object.keys(event.contextKeys);
  }
  return [];
}

function EventSummarizer() {
  const es = {};

  let startDate = 0,
    endDate = 0,
    counters = {},
    contextKinds = {};

  es.summarizeEvent = event => {
    if (event.kind === 'feature') {
      const counterKey =
        event.key +
        ':' +
        (event.variation !== null && event.variation !== undefined ? event.variation : '') +
        ':' +
        (event.version !== null && event.version !== undefined ? event.version : '');
      const counterVal = counters[counterKey];
      let kinds = contextKinds[event.key];
      if (!kinds) {
        kinds = new Set();
        contextKinds[event.key] = kinds;
      }
      getKinds(event).forEach(kind => kinds.add(kind));

      if (counterVal) {
        counterVal.count = counterVal.count + 1;
      } else {
        counters[counterKey] = {
          count: 1,
          key: event.key,
          version: event.version,
          variation: event.variation,
          value: event.value,
          default: event.default,
        };
      }
      if (startDate === 0 || event.creationDate < startDate) {
        startDate = event.creationDate;
      }
      if (event.creationDate > endDate) {
        endDate = event.creationDate;
      }
    }
  };

  es.getSummary = () => {
    const flagsOut = {};
    for (const c of Object.values(counters)) {
      let flag = flagsOut[c.key];
      if (!flag) {
        flag = {
          default: c.default,
          counters: [],
          contextKinds: [...contextKinds[c.key]],
        };
        flagsOut[c.key] = flag;
      }
      const counterOut = {
        value: c.value,
        count: c.count,
      };
      if (c.variation !== undefined && c.variation !== null) {
        counterOut.variation = c.variation;
      }
      if (c.version !== undefined && c.version !== null) {
        counterOut.version = c.version;
      } else {
        counterOut.unknown = true;
      }
      flag.counters.push(counterOut);
    }
    return {
      startDate: startDate,
      endDate: endDate,
      features: flagsOut,
    };
  };

  es.clearSummary = () => {
    startDate = 0;
    endDate = 0;
    counters = {};
    contextKinds = {};
  };

  return es;
}

module.exports = EventSummarizer;

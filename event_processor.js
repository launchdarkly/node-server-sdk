var LRUCache = require('lrucache');
var request = require('request');
var EventSummarizer = require('./event_summarizer');
var UserFilter = require('./user_filter');
var errors = require('./errors');
var messages = require('./messages');
var stringifyAttrs = require('./utils/stringifyAttrs');
var wrapPromiseCallback = require('./utils/wrapPromiseCallback');

var userAttrsToStringifyForEvents = [ "key", "secondary", "ip", "country", "email", "firstName", "lastName", "avatar", "name" ];

function EventProcessor(sdkKey, config, errorReporter) {
  var ep = {};

  var userFilter = UserFilter(config),
      summarizer = EventSummarizer(config),
      userKeysCache = LRUCache(config.userKeysCapacity),
      queue = [],
      lastKnownPastTime = 0,
      exceededCapacity = false,
      shutdown = false,
      flushTimer,
      flushUsersTimer;

  function enqueue(event) {
    if (queue.length < config.capacity) {
      queue.push(event);
      exceededCapacity = false;
    } else {
      if (!exceededCapacity) {
        exceededCapacity = true;
        config.logger.warn("Exceeded event queue capacity. Increase capacity to avoid dropping events.");
      }
    }
  }

  function shouldDebugEvent(event) {
    if (event.debugEventsUntilDate) {
      if (event.debugEventsUntilDate > lastKnownPastTime &&
        event.debugEventsUntilDate > new Date().getTime()) {
        return true;
      }
    }
    return false;
  }

  function makeOutputEvent(event) {
    switch (event.kind) {
      case 'feature':
        var debug = !!event.debug;
        var out = {
          kind: debug ? 'debug' : 'feature',
          creationDate: event.creationDate,
          key: event.key,
          value: event.value,
          default: event.default,
          prereqOf: event.prereqOf
        };
        if (event.variation !== undefined && event.variation !== null) {
          out.variation = event.variation;
        }
        if (event.version) {
          out.version = event.version;
        }
        if (event.reason) {
          out.reason = event.reason;
        }
        if (config.inlineUsersInEvents || debug) {
          out.user = processUser(event);
        } else {
          out.userKey = getUserKey(event);
        }
        return out;
      case 'identify':
        return {
          kind: 'identify',
          creationDate: event.creationDate,
          key: getUserKey(event),
          user: processUser(event)
        };
      case 'custom':
        var out = {
          kind: 'custom',
          creationDate: event.creationDate,
          key: event.key
        };
        if (config.inlineUsersInEvents) {
          out.user = processUser(event);
        } else {
          out.userKey = getUserKey(event);
        }
        if (event.data !== null && event.data !== undefined) {
          out.data = event.data;
        }
        if (event.metricValue !== null && event.metricValue !== undefined) {
          out.metricValue = event.metricValue;
        }
        return out;
      default:
        return event;
    }
  }

  function processUser(event) {
    var filtered = userFilter.filterUser(event.user);
    return stringifyAttrs(filtered, userAttrsToStringifyForEvents);
  }

  function getUserKey(event) {
    return event.user && String(event.user.key);
  }

  ep.sendEvent = function(event) {
    var addIndexEvent = false,
        addFullEvent = false,
        addDebugEvent = false;

    if (shutdown) {
      return;
    }

    // Always record the event in the summarizer.
    summarizer.summarizeEvent(event);

    // Decide whether to add the event to the payload. Feature events may be added twice, once for
    // the event (if tracked) and once for debugging.
    if (event.kind === 'feature') {
      addFullEvent = event.trackEvents;
      addDebugEvent = shouldDebugEvent(event);
    } else {
      addFullEvent = true;
    }

    // For each user we haven't seen before, we add an index event - unless this is already
    // an identify event for that user.
    if (!addFullEvent || !config.inlineUsersInEvents) {
      if (event.user && !userKeysCache.get(event.user.key)) {
        userKeysCache.set(event.user.key, true);
        if (event.kind != 'identify') {
          addIndexEvent = true;
        }
      }
    }

    if (addIndexEvent) {
      enqueue({
        kind: 'index',
        creationDate: event.creationDate,
        user: processUser(event)
      });
    }
    if (addFullEvent) {
      enqueue(makeOutputEvent(event));
    }
    if (addDebugEvent) {
      var debugEvent = Object.assign({}, event, { debug: true });
      enqueue(makeOutputEvent(debugEvent));
    }
  }

  ep.flush = function(callback) {
    return wrapPromiseCallback(new Promise(function(resolve, reject) {
      var worklist;
      var summary;
      
      if (shutdown) {
        var err = new errors.LDInvalidSDKKeyError("Events cannot be posted because SDK key is invalid");
        reject(err);
        return;
      }

      worklist = queue;
      queue = [];
      summary = summarizer.getSummary();
      summarizer.clearSummary();
      if (Object.keys(summary.features).length) {
        summary.kind = 'summary';
        worklist.push(summary);
      }

      if (!worklist.length) {
        resolve();
        return;
      }

      config.logger.debug("Flushing %d events", worklist.length);

      tryPostingEvents(worklist, resolve, reject, true);
    }.bind(this)), callback);
  }

  function tryPostingEvents(events, resolve, reject, canRetry) {
    var retryOrReject = function(err) {
      if (canRetry) {
        config.logger && config.logger.warn("Will retry posting events after 1 second");
        setTimeout(function() {
          tryPostingEvents(events, resolve, reject, false);
        }, 1000);
      } else {
        reject(err);
      }
    }

    var options = Object.assign({}, config.tlsParams, {
      method: 'POST',
      url: config.eventsUri + '/bulk',
      headers: {
        'Authorization': sdkKey,
        'User-Agent': config.userAgent,
        'X-LaunchDarkly-Event-Schema': '3'
      },
      json: true,
      body: events,
      timeout: config.timeout * 1000,
      agent: config.proxyAgent
    });
    request(options).on('response', function(resp, body) {
      if (resp.headers['date']) {
        var date = Date.parse(resp.headers['date']);
        if (date) {
          lastKnownPastTime = date;
        }
      }
      if (resp.statusCode > 204) {
        var err = new errors.LDUnexpectedResponseError(messages.httpErrorMessage(resp.statusCode, 'event posting', 'some events were dropped'));
        errorReporter && errorReporter(err);
        if (!errors.isHttpErrorRecoverable(resp.statusCode)) {
          reject(err);
          shutdown = true;
        } else {
          retryOrReject(err);
        }
      } else {
        resolve(resp, body);
      }
    }).on('error', function(err) {
      retryOrReject(err);
    });
  }

  ep.close = function() {
    clearInterval(flushTimer);
    clearInterval(flushUsersTimer);
  }

  flushTimer = setInterval(function() {
      ep.flush().then(function() { } , function() { });
    }, config.flushInterval * 1000);
  flushUsersTimer = setInterval(function() {
      userKeysCache.removeAll();
    }, config.userKeysFlushInterval * 1000);

  return ep;
}

module.exports = EventProcessor;

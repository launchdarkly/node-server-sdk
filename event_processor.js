var request = require('request');
var EventSummarizer = require('./event_summarizer');
var UserFilter = require('./user_filter');
var errors = require('./errors');
var wrapPromiseCallback = require('./utils/wrapPromiseCallback');

function EventProcessor(sdk_key, config, error_reporter) {
  var ep = {};

  var userFilter = UserFilter(config),
      summarizer = EventSummarizer(config),
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
        config.logger && config.logger.warn("Exceeded event queue capacity. Increase capacity to avoid dropping events.");
      }
    }
  }

  function should_debug_event(event) {
    if (event.debugEventsUntilDate) {
      if (event.debugEventsUntilDate > lastKnownPastTime &&
        event.debugEventsUntilDate > new Date().getTime()) {
        return true;
      }
    }
    return false;
  }

  function make_output_event(event) {
    if (event.kind === 'feature') {
      debug = !!event.debug;
      var out = {
        kind: debug ? 'debug' : 'feature',
        creationDate: event.creationDate,
        key: event.key,
        version: event.version,
        value: event.value,
        default: event.default,
        prereqOf: event.prereqOf
      };
      if (config.inline_users_in_events || debug) {
        out.user = userFilter.filter_user(event.user);
      } else {
        out.userKey = event.user.key;
      }
      return out;
    } else if (event.kind === 'identify') {
      return {
        kind: 'identify',
        creationDate: event.creationDate,
        user: userFilter.filter_user(event.user)
      };
    } else if (event.kind === 'custom') {
      var out = {
        kind: 'custom',
        creationDate: event.creationDate,
        key: event.key,
        data: event.data
      };
      if (config.inline_users_in_events) {
        out.user = userFilter.filter_user(event.user);
      } else {
        out.userKey = event.user.key;
      }
      return out;
    }
    return event;
  }

  ep.send_event = function(event) {
    if (shutdown) {
      return;
    }
    config.logger && config.logger.debug("Sending event", JSON.stringify(event));

    // Always record the event in the summarizer.
    summarizer.summarize_event(event);

    // Decide whether to add the event to the payload. Feature events may be added twice, once for
    // the event (if tracked) and once for debugging.
    var willAddFullEvent = false,
        debugEvent = null;
    if (event.kind === 'feature') {
      willAddFullEvent = event.trackEvents;
      if (should_debug_event(event)) {
        debugEvent = Object.assign({}, event, { debug: true });
      }
    } else {
      willAddFullEvent = true;
    }

    // For each user we haven't seen before, we add an index event - unless this is already
    // an identify event for that user.
    if (!(willAddFullEvent && config.inline_users_in_events)) {
      if (event.user && !summarizer.notice_user(event.user)) {
        if (event.kind != 'identify') {
          enqueue({
            kind: 'index',
            creationDate: event.creationDate,
            user: userFilter.filter_user(event.user)
          });
        }
      }
    }

    if (willAddFullEvent) {
      enqueue(make_output_event(event));
    }
    if (debugEvent) {
      enqueue(make_output_event(debugEvent));
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
      summary = summarizer.get_summary();
      summarizer.clear_summary();
      if (Object.keys(summary.features).length) {
        summary.kind = 'summary';
        worklist.push(summary);
      }

      if (!worklist.length) {
        resolve();
        return;
      }

      config.logger && config.logger.debug("Flushing %d events", worklist.length);

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

    request({
      method: "POST",
      url: config.events_uri + '/bulk',
      headers: {
        'Authorization': sdk_key,
        'User-Agent': config.user_agent
      },
      json: true,
      body: events,
      timeout: config.timeout * 1000,
      agent: config.proxy_agent
    }).on('response', function(resp, body) {
      if (resp.headers['date']) {
        var date = Date.parse(resp.headers['date']);
        if (date) {
          lastKnownPastTime = date;
        }
      }
      if (resp.statusCode > 204) {
        var err = new errors.LDUnexpectedResponseError("Unexpected status code " + resp.statusCode + "; events may not have been processed",
          resp.statusCode);
        error_reporter && error_reporter(err);
        if (resp.statusCode === 401) {
          reject(err);
          var err1 = new errors.LDInvalidSDKKeyError("Received 401 error, no further events will be posted since SDK key is invalid");
          error_reporter && error_reporter(err1);
          shutdown = true;
        } else if (resp.statusCode >= 500) {
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

  flushTimer = setInterval(ep.flush.bind(ep), config.flush_interval * 1000);
  flushUsersTimer = setInterval(summarizer.reset_users.bind(summarizer),
    config.user_keys_flush_interval * 1000);

  return ep;
}

module.exports = EventProcessor;

var fs = require('fs'),
    winston = require('winston'),
    yaml = require('yaml'),
    dataKind = require('./versioned_data_kind');

/*
  FileDataSource provides a way to use local files as a source of feature flag state, instead of
  connecting to LaunchDarkly. This would typically be used in a test environment.

  See documentation in index.d.ts.
*/
function FileDataSource(options) {
  var paths = (options && options.paths) || [];
  var autoUpdate = !!options.autoUpdate;

  return config => {
    var featureStore = config.featureStore;
    var watchers = [];
    var pendingUpdate = false;
    var logger = options.logger || config.logger || defaultLogger();
    var inited = false;

    function defaultLogger() {
      return new winston.Logger({
        level: 'info',
        transports: [ new (winston.transports.Console)() ]
      });
    }

    function loadFilePromise(path, allData) {
      return new Promise((resolve, reject) =>
        fs.readFile(path, 'utf8', (err, data) =>
          err ? reject(err) : resolve(data))
      ).then(data => {
        var parsed = parseData(data) || {};
        var addItem = (kind, item) => {
          if (!allData[kind.namespace]) {
            allData[kind.namespace] = {};
          }
          if (allData[kind.namespace][item.key]) {
            throw new Error('found duplicate key: "' + item.key + '"');
          } else {
            allData[kind.namespace][item.key] = item;
          }
        }
        Object.keys(parsed.flags || {}).forEach(key => {
          addItem(dataKind.features, parsed.flags[key]);
        });
        Object.keys(parsed.flagValues || {}).forEach(key => {
          addItem(dataKind.features, makeFlagWithValue(key, parsed.flagValues[key]));
        });
        Object.keys(parsed.segments || {}).forEach(key => {
          addItem(dataKind.segments, parsed.segments[key]);
        });
      });
    }

    function loadAllPromise() {
      pendingUpdate = false;
      var allData = {};
      var p = Promise.resolve();
      for (var i = 0; i < paths.length; i++) {
        (path => {
          p = p.then(() => loadFilePromise(path, allData))
            .catch(e => {
              throw new Error('Unable to load flags: ' + e + ' [' + path + ']');
            });
        })(paths[i]);
      }
      return p.then(() => initStorePromise(allData));
    }

    function initStorePromise(data) {
      return new Promise(resolve => featureStore.init(data, () => {
        inited = true;
        resolve();
      }));
    }

    function parseData(data) {
      // Every valid JSON document is also a valid YAML document (for parsers that comply
      // with the spec, which this one does) so we can parse both with the same parser.
      return yaml.parse(data);
    }

    function makeFlagWithValue(key, value) {
      return {
        key: key,
        on: true,
        fallthrough: { variation: 0 },
        variations: [ value ]
      };
    }

    function startWatching() {
      var reload = () => {
        loadAllPromise().then(() => {
          logger && logger.warn('Reloaded flags from file data');
        }).catch(() => {});
      };
      paths.forEach(path => {
        var watcher = fs.watch(path, { persistent: false }, (event, filename) => {
          if (!pendingUpdate) { // coalesce updates to avoid reloading repeatedly
            pendingUpdate = true;
            setTimeout(reload, 0);
          }
        });
        watchers.push(watcher);
      });
    }

    function stopWatching() {
      watchers.forEach(w => w.close());
      watchers = [];
    }

    var fds = {};

    fds.start = fn => {
      var cb = fn || (() => {});

      if (autoUpdate) {
        startWatching();
      }

      loadAllPromise().then(() => cb(), err => cb(err));
    };

    fds.stop = () => {
      if (autoUpdate) {
        stopWatching();
      }
    };

    fds.initialized = () => {
      return inited;
    };

    fds.close = () => {
      fds.stop();
    };

    return fds;
  }
}

module.exports = FileDataSource;

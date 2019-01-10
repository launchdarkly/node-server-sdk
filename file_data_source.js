var fs = require('fs'),
    winston = require('winston'),
    yaml = require('yaml'),
    dataKind = require('./versioned_data_kind');

/*
  FileDataSource provides a way to use local files as a source of feature flag state, instead of
  connecting to LaunchDarkly. This would typically be used in a test environment.

  To use this component, call FileDataSource(options) and store the result in the "updateProcessor"
  property of your LaunchDarkly client configuration. In the options, set "paths" to the file
  paths of your data file(s):

      var dataSource = LaunchDarkly.FileDataSource({ paths: [ myFilePath ] });
      var config = { updateProcessor: dataSource };

  Flag data files can be either JSON or YAML. They contain an object with three possible
  properties:

  - "flags": Full feature flag definitions.
  - "flagValues": Simplified feature flags, just a map of flag keys to values.
  - "segments": User segment definitions.

  The format of the data in "flags" and "segments" is defined by the LaunchDarkly application
  and is subject to change. You can query existing flags and segments from LaunchDarkly in JSON
  format by querying https://app.launchdarkly.com/sdk/latest-all and passing your SDK key in
  the Authorization header.

  You can also specify that flags should be reloaded whenever a file is modified, by setting
  "autoUpdate: true" in the options. This feature uses Node's fs.watch() API, so it is subject to
  the limitations described here: https://nodejs.org/docs/latest/api/fs.html#fs_fs_watch_filename_options_listener

  For more details, see the LaunchDarkly reference guide:
  https://docs.launchdarkly.com/v2.0/docs/reading-flags-from-a-file
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

const fs = require('fs'),
  winston = require('winston'),
  yaml = require('yaml'),
  dataKind = require('./versioned_data_kind');

/*
  FileDataSource provides a way to use local files as a source of feature flag state, instead of
  connecting to LaunchDarkly. This would typically be used in a test environment.

  See documentation in index.d.ts.
*/
function FileDataSource(options) {
  const paths = (options && options.paths) || [];
  const autoUpdate = !!options.autoUpdate;

  return config => {
    const logger = options.logger || config.logger || defaultLogger();
    const featureStore = config.featureStore;
    const timestamps = {};
    let watchers = [];
    let pendingUpdate = false;
    let inited = false;

    function defaultLogger() {
      return winston.createLogger({
        level: 'info',
        transports: [new winston.transports.Console()],
      });
    }

    function getFileTimestampPromise(path) {
      return new Promise((resolve, reject) => {
        fs.stat(path, (err, stat) => {
          if (err) {
            reject(err);
          } else {
            resolve(stat.mtimeMs || stat.mtime); // mtimeMs isn't always available; either of these values will work for  us
          }
        });
      });
    }

    function loadFilePromise(path, allDataIn) {
      const allData = allDataIn;
      return new Promise((resolve, reject) =>
        fs.readFile(path, 'utf8', (err, data) => (err ? reject(err) : resolve(data)))
      )
        .then(data => {
          const parsed = parseData(data) || {};
          const addItem = (kind, item) => {
            if (!allData[kind.namespace]) {
              allData[kind.namespace] = {};
            }
            if (allData[kind.namespace][item.key]) {
              throw new Error('found duplicate key: "' + item.key + '"');
            } else {
              allData[kind.namespace][item.key] = item;
            }
          };
          Object.keys(parsed.flags || {}).forEach(key => {
            addItem(dataKind.features, parsed.flags[key]);
          });
          Object.keys(parsed.flagValues || {}).forEach(key => {
            addItem(dataKind.features, makeFlagWithValue(key, parsed.flagValues[key]));
          });
          Object.keys(parsed.segments || {}).forEach(key => {
            addItem(dataKind.segments, parsed.segments[key]);
          });
          logger.info('Loaded flags from ' + path);
        })
        .then(() => getFileTimestampPromise(path))
        .then(timestamp => {
          timestamps[path] = timestamp;
        });
    }

    function loadAllPromise() {
      pendingUpdate = false;
      const allData = {};
      let p = Promise.resolve();
      for (let i = 0; i < paths.length; i++) {
        (path => {
          p = p
            .then(() => loadFilePromise(path, allData))
            .catch(e => {
              throw new Error('Unable to load flags: ' + e + ' [' + path + ']');
            });
        })(paths[i]);
      }
      return p.then(() => initStorePromise(allData));
    }

    function initStorePromise(data) {
      return new Promise(resolve =>
        featureStore.init(data, () => {
          inited = true;
          resolve();
        })
      );
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
        variations: [value],
      };
    }

    function maybeReloadForPath(path) {
      if (pendingUpdate) {
        return; // coalesce updates so we don't do multiple reloads if a whole set of files was just updated
      }
      const reload = () => {
        loadAllPromise()
          .then(() => {
            logger.warn('Reloaded flags from file data');
          })
          .catch(() => {});
      };
      getFileTimestampPromise(path)
        .then(timestamp => {
          // We do this check of the modified time because there's a known issue with fs.watch()
          // reporting multiple changes when really the file has only changed once.
          if (timestamp !== timestamps[path]) {
            pendingUpdate = true;
            setTimeout(reload, 10);
            // The 10ms delay above is arbitrary - we just don't want to have the number be zero,
            // because in a case where multiple fs.watch events are fired off one after another,
            // we want the reload to happen only after all of the event handlers have executed.
          }
        })
        .catch(() => {
          logger.warn('Unexpected error trying to get timestamp of file: ' + path);
        });
    }

    function startWatching() {
      paths.forEach(path => {
        const watcher = fs.watch(path, { persistent: false }, () => {
          maybeReloadForPath(path);
        });
        watchers.push(watcher);
      });
    }

    function stopWatching() {
      watchers.forEach(w => w.close());
      watchers = [];
    }

    const fds = {};

    fds.start = fn => {
      const cb = fn || (() => {});

      if (autoUpdate) {
        startWatching();
      }

      loadAllPromise().then(
        () => cb(),
        err => cb(err)
      );
    };

    fds.stop = () => {
      if (autoUpdate) {
        stopWatching();
      }
    };

    fds.initialized = () => inited;

    fds.close = () => {
      fds.stop();
    };

    return fds;
  };
}

module.exports = FileDataSource;

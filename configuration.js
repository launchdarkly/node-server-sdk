var winston = require('winston');
var InMemoryFeatureStore = require('./feature_store');
var messages = require('./messages');
var package_json = require('./package.json');

module.exports = (function() {
  var defaults = {
    baseUri: 'https://app.launchdarkly.com',
    streamUri: 'https://stream.launchdarkly.com',
    eventsUri: 'https://events.launchdarkly.com',
    stream: true,
    sendEvents: true,
    timeout: 5,
    capacity: 1000,
    flushInterval: 5,
    pollInterval: 30,
    offline: false,
    useLdd: false,
    allAttributesPrivate: false,
    privateAttributeNames: [],
    userKeysCapacity: 1000,
    userKeysFlushInterval: 300,
    featureStore: InMemoryFeatureStore()
  };

  var deprecatedOptions = {
    base_uri: 'baseUri',
    stream_uri: 'streamUri',
    events_uri: 'eventsUri',
    send_events: 'sendEvents',
    flush_interval: 'flushInterval',
    poll_interval: 'pollInterval',
    proxy_host: 'proxyHost',
    proxy_port: 'proxyPort',
    proxy_auth: 'proxyAuth',
    feature_store: 'featureStore',
    use_ldd: 'useLdd',
    all_attributes_private: 'allAttributesPrivate',
    private_attribute_names: 'privateAttributeNames'
  };

  function checkDeprecatedOptions(config) {
    Object.keys(deprecatedOptions).forEach(function(oldName) {
      if (config[oldName] !== undefined) {
        var newName = deprecatedOptions[oldName];
        config.logger.warn(messages.deprecated(oldName, newName));
        if (config[newName] === undefined) {
          config[newName] = config[oldName];
        }
        delete config[oldName];
      }
    });
  }

  function canonicalizeUri(uri) {
    return uri.replace(/\/+$/, "");
  }

  function validate(options) {
    var config = Object.assign({}, options || {});
    
    config.userAgent = 'NodeJSClient/' + package_json.version;
    config.logger = (config.logger ||
      new winston.Logger({
        level: 'info',
        transports: [
          new (winston.transports.Console)(({
            formatter: function(options) {
              return '[LaunchDarkly] ' + (options.message ? options.message : '');
            }
          })),
        ]
      })
    );
    
    checkDeprecatedOptions(config);

    config = Object.assign({}, defaults, config);

    config.baseUri = canonicalizeUri(config.baseUri);
    config.streamUri = canonicalizeUri(config.streamUri);
    config.eventsUri = canonicalizeUri(config.eventsUri);
    config.pollInterval = config.pollInterval > 30 ? config.pollInterval : 30;

    return config;
  }

  return {
    validate: validate
  };
})();

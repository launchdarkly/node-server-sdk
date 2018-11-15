var configuration = require('../configuration');

describe('configuration', function() {
  function checkDefault(name, value) {
    it('applies defaults correctly for "' + name + "'", function() {
      var configWithUnspecifiedValue = {};
      expect(configuration.validate(configWithUnspecifiedValue)[name]).toEqual(value);
      var configWithNullValue = {};
      configWithNullValue[name] = null;
      expect(configuration.validate(configWithNullValue)[name]).toEqual(value);
      var configWithSpecifiedValue = {};
      configWithSpecifiedValue[name] = 'value';
      expect(configuration.validate(configWithSpecifiedValue)[name]).toEqual('value');
    });
  }

  checkDefault('sendEvents', true);
  checkDefault('stream', true);
  checkDefault('offline', false);
  checkDefault('useLdd', false);

  function checkDeprecated(oldName, newName, value) {
    it('allows "' + oldName + '" as a deprecated equivalent to "' + newName + '"', function() {
      var logger = {
        warn: jest.fn()
      };
      var config0 = {
        logger: logger
      };
      config0[oldName] = value;
      var config1 = configuration.validate(config0);
      expect(config1[newName]).toEqual(value);
      expect(config1[oldName]).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  }

  checkDeprecated('base_uri', 'baseUri', 'http://test.com');
  checkDeprecated('stream_uri', 'streamUri', 'http://test.com');
  checkDeprecated('events_uri', 'eventsUri', 'http://test.com');
  checkDeprecated('send_events', 'sendEvents', true);
  checkDeprecated('flush_interval', 'flushInterval', 10);
  checkDeprecated('poll_interval', 'pollInterval', 60);
  checkDeprecated('use_ldd', 'useLdd', true);
  checkDeprecated('all_attributes_private', 'allAttributesPrivate', true);
  checkDeprecated('private_attribute_names', 'privateAttributeNames', ['foo']);
  checkDeprecated('proxy_host', 'proxyHost', 'test.com');
  checkDeprecated('proxy_port', 'proxyPort', 8888);
  checkDeprecated('proxy_auth', 'proxyAuth', 'basic');
  checkDeprecated('feature_store', 'featureStore', {});

  function checkUriProperty(name) {
    var config0 = {};
    config0[name] = 'http://test.com/';
    var config1 = configuration.validate(config0);
    expect(config1[name]).toEqual('http://test.com');
  }

  checkUriProperty('baseUri');
  checkUriProperty('streamUri');
  checkUriProperty('eventsUri');

  it('enforces minimum poll interval', function() {
    var config = configuration.validate({ pollInterval: 29 });
    expect(config.pollInterval).toEqual(30);
  });

  it('allows larger poll interval', function() {
    var config = configuration.validate({ pollInterval: 31 });
    expect(config.pollInterval).toEqual(31);
  });

  it('should not share the default featureStore across different config instances', function() {
    var config1 = configuration.validate({});
    var config2 = configuration.validate({});
    expect(config1.featureStore).not.toEqual(config2.featureStore);
  });
});

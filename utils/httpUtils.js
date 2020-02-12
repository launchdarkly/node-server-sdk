const packageJson = require('../package.json');

const userAgent = 'NodeJSClient/' + packageJson.version;

module.exports.getDefaultHeaders = (sdkKey, config) => {
  // Use lowercase header names for convenience in our test code, where we may be checking for headers in a
  // real HTTP request that will be lowercased by the request API
  const ret = {
    authorization: sdkKey,
    'user-agent': userAgent,
  };
  if (config.wrapperName) {
    ret['x-launchdarkly-wrapper'] = config.wrapperVersion
      ? config.wrapperName + '/' + config.wrapperVersion
      : config.wrapperName;
  }
  return ret;
};

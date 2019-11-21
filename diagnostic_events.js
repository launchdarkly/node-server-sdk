const os = require('os');
const uuidv4 = require('uuid/v4');
const configuration = require('./configuration');
const packageJson = require('./package.json');

// An object that maintains information that will go into diagnostic events, and knows how to format
// those events. It is instantiated by the SDK client, and shared with the event processor.
function DiagnosticsManager(config, diagnosticId, startTime) {
  let dataSinceDate;
  const acc = {};

  dataSinceDate = startTime;

  // Creates the initial event that is sent by the event processor when the SDK starts up. This will not
  // be repeated during the lifetime of the SDK client.
  acc.createInitEvent = () => ({
    kind: 'diagnostic-init',
    id: diagnosticId,
    creationDate: startTime,
    sdk: makeSdkData(config),
    configuration: makeConfigData(config),
    platform: makePlatformData()
  });

  // Creates a periodic event containing time-dependent stats, and resets the state of the manager with
  // regard to those stats.
  // Note: the reason droppedEvents, deduplicatedUsers, and eventsInQueue are passed into this function,
  // instead of being properties of the DiagnosticsManager, is that the event processor is the one who's
  // calling this function and is also the one who's tracking those stats.
  acc.createStatsEventAndReset = (droppedEvents, deduplicatedUsers, eventsInQueue) => {
    const currentTime = new Date().getTime();
    const ret = {
      kind: 'diagnostic',
      id: diagnosticId,
      creationDate: currentTime,
      dataSinceDate: dataSinceDate,
      droppedEvents: droppedEvents,
      deduplicatedUsers: deduplicatedUsers,
      eventsInQueue: eventsInQueue
    };
    dataSinceDate = currentTime;
    return ret;
  };

  return acc;
}

function DiagnosticId(sdkKey) {
  const ret = {
    diagnosticId: uuidv4()
  };
  if (sdkKey) {
    ret.sdkKeySuffix = sdkKey.length > 6 ? sdkKey.substring(sdkKey.length - 6) : sdkKey;
  }
  return ret;
}

function makeSdkData(config) {
  const sdkData = {
    name: 'node-server-sdk',
    version: packageJson.version
  };
  if (config.wrapperName) {
    sdkData.wrapperName = config.wrapperName;
  }
  if (config.wrapperVersion) {
    sdkData.wrapperVersion = config.wrapperVersion;
  }
  return sdkData;
}

function makeConfigData(config) {
  const defaults = configuration.defaults();
  const secondsToMillis = sec => Math.trunc(sec * 1000);

  const configData = {
    customBaseURI: config.baseUri !== defaults.baseUri,
    customStreamURI: config.streamUri !== defaults.streamUri,
    customEventsURI: config.eventsUri !== defaults.eventsUri,
    eventsCapacity: config.capacity,
    connectTimeoutMillis: secondsToMillis(config.timeout),
    socketTimeoutMillis: secondsToMillis(config.timeout), // Node doesn't distinguish between these two kinds of timeouts
    eventsFlushIntervalMillis: secondsToMillis(config.flushInterval),
    pollingIntervalMillis: secondsToMillis(config.pollInterval),
    // startWaitMillis: n/a (Node SDK does not have this feature)
    // samplingInterval: n/a (Node SDK does not have this feature)
    reconnectTimeMillis: 1000, // hard-coded in eventsource.js
    streamingDisabled: !config.stream,
    usingRelayDaemon: !!config.useLdd,
    offline: !!config.offline,
    allAttributesPrivate: !!config.allAttributesPrivate,
    eventReportingDisabled: !config.sendEvents,
    inlineUsersInEvents: !!config.inlineUsersInEvents,
    userKeysCapacity: config.userKeysCapacity,
    userKeysFlushIntervalMillis: secondsToMillis(config.userKeysFlushInterval),
    usingProxy: !!(config.proxyAgent || config.proxyHost),
    usingProxyAuthenticator: !!config.proxyAuth,
    diagnosticRecordingIntervalMillis: secondsToMillis(config.diagnosticRecordingInterval)
  };
  if (config.featureStore && config.featureStore.description) {
    configData.featureStore = config.featureStore.description;
  }

  return configData;
}

function makePlatformData() {
  return {
    name: 'Node',
    osArch: os.arch(),
    osName: os.platform(),
    osVersion: os.release()
    // Note that os.release() is not the same OS version string that would be reported by other languages.
    // It's defined as being the value returned by "uname -r" (e.g. on Mac OS 10.14, this is "18.7.0"; on
    // Ubuntu 16.04, it is "4.4.0-1095-aws"), or GetVersionExW in Windows.
  };
}

module.exports = {
  DiagnosticsManager: DiagnosticsManager,
  DiagnosticId: DiagnosticId
};

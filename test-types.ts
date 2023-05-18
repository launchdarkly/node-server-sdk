
// This file exists only so that we can run the TypeScript compiler in the CI build
// to validate our index.d.ts file. This code will not actually be run - the point is
// just to verify that the type declarations exist and are correct so a TypeScript
// developer can use all of the SDK features.

import * as ld from 'launchdarkly-node-server-sdk';
import * as integrations from 'launchdarkly-node-server-sdk/integrations';
import * as interfaces from 'launchdarkly-node-server-sdk/interfaces';

const logger: ld.LDLogger = {
  error: (...args) => { },
  warn: (...args) => { },
  info: (...args) => { },
  debug: (...args) => { }
};
const emptyOptions: ld.LDOptions = {};
const allOptions: ld.LDOptions = {
  baseUri: '',
  eventsUri: '',
  streamUri: '',
  stream: true,
  streamInitialReconnectDelay: 1.5,
  sendEvents: true,
  allAttributesPrivate: true,
  privateAttributes: [ 'x' ],
  capacity: 100,
  flushInterval: 1,
  contextKeysCapacity: 100,
  contextKeysFlushInterval: 1,
  pollInterval: 5,
  timeout: 1,
  logger: logger,
  tlsParams: {
    ca: 'x',
    cert: 'y',
    key: 'z'
  },
  diagnosticOptOut: true,
  diagnosticRecordingInterval: 100,
  wrapperName: 'x',
  wrapperVersion: 'y',
  application: {
    id: 'test-id',
    version: 'test-version'
  }
};
const userWithKeyOnly: ld.LDUser = { key: 'user' };
const anonymousUser: ld.LDUser = { key: 'anon-user', anonymous: true };
const user: ld.LDUser = {
  key: 'user',
  name: 'name',
  firstName: 'first',
  lastName: 'last',
  email: 'test@example.com',
  avatar: 'http://avatar.url',
  ip: '1.1.1.1',
  country: 'us',
  anonymous: true,
  custom: {
    'a': 's',
    'b': true,
    'c': 3,
    'd': [ 'x', 'y' ],
    'e': [ true, false ],
    'f': [ 1, 2 ]
  },
  privateAttributeNames: [ 'name', 'email' ]
};

const singleKindContextWithOnlyKey: ld.LDContext = {
  kind: 'user',
  key: 'user'
};

const anonymousContext: ld.LDContext = {
  kind: 'user',
  key: 'user',
  anonymous: true,
};

const singleKindContext: ld.LDContext = {
  kind: 'user',
  key: 'user',
  name: 'name',
  firstName: 'first',
  lastName: 'last',
  email: 'test@example.com',
  avatar: 'http://avatar.url',
  ip: '1.1.1.1',
  country: 'us',
  anonymous: true,
  custom: {
    'a': 's',
    'b': true,
    'c': 3,
    'd': [ 'x', 'y' ],
    'e': [ true, false ],
    'f': [ 1, 2 ]
  },
  _meta: {
    privateAttributes: [ 'name', 'email' ]
  }
}

const singleKindPart: ld.LDContextCommon = {...singleKindContext};
delete singleKindPart["kind"];

const multiKindContext: ld.LDContext = {
  kind: 'multi',
  user: singleKindPart,
  org: {
    key: 'org',
  }
}

const client: ld.LDClient = ld.init('sdk-key', allOptions);

client.identify(user);
client.identify(singleKindContext);

client.track('key', user);
client.track('key', user, { ok: 1 });
client.track('key', user, null, 1.5);

client.track('key', singleKindContext);
client.track('key', singleKindContext, { ok: 1 });
client.track('key', singleKindContext, null, 1.5);

client.track('key', multiKindContext);
client.track('key', multiKindContext, { ok: 1 });
client.track('key', multiKindContext, null, 1.5);

// evaluation methods with callbacks
client.variation('key', user, false, (value: ld.LDFlagValue) => { });
client.variation('key', user, 2, (value: ld.LDFlagValue) => { });
client.variation('key', user, 'default', (value: ld.LDFlagValue) => { });
client.variationDetail('key', user, 'default', (detail: ld.LDEvaluationDetail) => {
  const detailValue: ld.LDFlagValue = detail.value;
  const detailIndex: number | undefined = detail.variationIndex;
  const detailReason: ld.LDEvaluationReason = detail.reason;  
});
client.allFlagsState(user, {}, (err: Error, flagSet: ld.LDFlagsState) => { });

client.variation('key', singleKindContext, false, (value: ld.LDFlagValue) => { });
client.variation('key', singleKindContext, 2, (value: ld.LDFlagValue) => { });
client.variation('key', singleKindContext, 'default', (value: ld.LDFlagValue) => { });
client.variationDetail('key', singleKindContext, 'default', (detail: ld.LDEvaluationDetail) => {
  const detailValue: ld.LDFlagValue = detail.value;
  const detailIndex: number | undefined = detail.variationIndex;
  const detailReason: ld.LDEvaluationReason = detail.reason;  
});
client.allFlagsState(singleKindContext, {}, (err: Error, flagSet: ld.LDFlagsState) => { });

client.variation('key', multiKindContext, false, (value: ld.LDFlagValue) => { });
client.variation('key', multiKindContext, 2, (value: ld.LDFlagValue) => { });
client.variation('key', multiKindContext, 'default', (value: ld.LDFlagValue) => { });
client.variationDetail('key', multiKindContext, 'default', (detail: ld.LDEvaluationDetail) => {
  const detailValue: ld.LDFlagValue = detail.value;
  const detailIndex: number | undefined = detail.variationIndex;
  const detailReason: ld.LDEvaluationReason = detail.reason;  
});
client.allFlagsState(multiKindContext, {}, (err: Error, flagSet: ld.LDFlagsState) => { });

// evaluation methods with promises
client.variation('key', singleKindContext, false).then((value: ld.LDFlagValue) => { });
client.variation('key', singleKindContext, 2).then((value: ld.LDFlagValue) => { });
client.variation('key', singleKindContext, 'default').then((value: ld.LDFlagValue) => { });
client.variationDetail('key', singleKindContext, 'default').then((detail: ld.LDEvaluationDetail) => { });
client.allFlagsState(singleKindContext).then((flagSet: ld.LDFlagsState) => { });

client.variation('key', singleKindContext, false).then((value: ld.LDFlagValue) => { });
client.variation('key', singleKindContext, 2).then((value: ld.LDFlagValue) => { });
client.variation('key', singleKindContext, 'default').then((value: ld.LDFlagValue) => { });
client.variationDetail('key', singleKindContext, 'default').then((detail: ld.LDEvaluationDetail) => { });
client.allFlagsState(singleKindContext).then((flagSet: ld.LDFlagsState) => { });

client.variation('key', multiKindContext, false).then((value: ld.LDFlagValue) => { });
client.variation('key', multiKindContext, 2).then((value: ld.LDFlagValue) => { });
client.variation('key', multiKindContext, 'default').then((value: ld.LDFlagValue) => { });
client.variationDetail('key', multiKindContext, 'default').then((detail: ld.LDEvaluationDetail) => { });
client.allFlagsState(multiKindContext).then((flagSet: ld.LDFlagsState) => { });

// basicLogger
const logger1: ld.LDLogger = ld.basicLogger();
const logger2: ld.LDLogger = ld.basicLogger({ level: 'info' });
const logger3: ld.LDLogger = ld.basicLogger({ destination: console.log });

// integrations module:

// FileDataSource
const fdsOptions: integrations.FileDataSourceOptions = {
  paths: [ 'filepath' ],
  autoUpdate: true,
  logger: ld.basicLogger(),
};
const fds = integrations.FileDataSource(fdsOptions);

// TestData
const td: integrations.TestData = integrations.TestData();
const fb: integrations.TestDataFlagBuilder = td.flag('key');
td.update(fb);
fb.ifMatch('name', 'x').thenReturn(true);

// interfaces module:

// BigSegmentStoreStatusProvider
const bsssp: interfaces.BigSegmentStoreStatusProvider = client.bigSegmentStoreStatusProvider
const bssStatus: interfaces.BigSegmentStoreStatus | undefined = bsssp.getStatus();
bsssp.requireStatus().then((value: interfaces.BigSegmentStoreStatus) => { });

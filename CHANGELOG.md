# Change log

All notable changes to the LaunchDarkly Server-Side SDK for Node.js will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

## [5.9.0] - 2019-08-20
### Added:
- Added support for upcoming LaunchDarkly experimentation features. See `LDClient.track()`.

## [5.8.2] - 2019-06-06
### Fixed:
- Resolved a [low-severity security vulnerability](https://nvd.nist.gov/vuln/detail/CVE-2018-16492) in an `extend` transitive dependency.


## [5.8.1] - 2019-05-13
### Changed:
- Changed the package name from `ldclient-node` to `launchdarkly-node-server-sdk`.
 
There are no other changes in this release. Substituting `ldclient-node` version 5.8.0 with `launchdarkly-node-server-sdk` version 5.8.1 (and updating any `require` or `import` lines that referred to the old package name) will not affect functionality.

## [5.8.0] - 2019-04-06
### Added:
- Generated TypeDoc documentation for all types, properties, and methods is now available online at [https://launchdarkly.github.io/node-server-sdk/](https://launchdarkly.github.io/node-server-sdk/). Currently this will only be for the latest released version.
- It is now possible to specify any of the TLS configuration parameters supported by Node's `https.request()` in the client configuration, so that they will apply to all HTTPS requests made by the SDK. In your client options, add a property called `tlsParams` whose value is an object containing those parameters, e.g. `tlsParams: { ca: 'my trusted CA certificate data' }`.

### Fixed:
- Running the SDK unit tests is now simpler in that the Redis integration can be skipped. See `CONTRIBUTING.md`.

# Note on future releases

The LaunchDarkly SDK repositories are being renamed for consistency. This repository is now `node-server-sdk` rather than `node-client`. (Note that `node-client-sdk` also exists, which is the _client-side_ Node SDK.)

The package name will also change. In the 5.8.0 release, it is still `ldclient-node`; in all future releases, it will be `launchdarkly-node-server-sdk`. No further updates to the `ldclient-node` package will be published after this release.

## [5.7.4] - 2019-04-02
### Fixed:
- Setting user attributes to non-string values when a string was expected would cause analytics events not to be processed. The SDK will now convert attribute values to strings as needed. ([#147](https://github.com/launchdarkly/node-client/issues/147))
- If `track` or `identify` is called without a user, the SDK now logs a warning, and does not send an analytics event to LaunchDarkly (since it would not be processed without a user).


## [5.7.3] - 2019-03-21
### Changed:
- The default value for the configuration property `capacity` (maximum number of events that can be stored at once) is now 10000, consistent with the other SDKs, rather than 1000.

### Fixed:
- A missing `var` keyword could cause an error in strict mode when evaluating a flag with rollouts. (Thanks, [phillipb](https://github.com/launchdarkly/node-client/pull/145)!)
- The user attribute `secondary` was not included in the TypeScript declarations and therefore could not be used from TypeScript code.

## [5.7.2] - 2019-02-22
### Fixed:
- Calling `identify()` or `track()` with no user object, or with a user that has no key, will now cause the SDK to log a warning (as the other SDKs do). The SDK no longer sends an analytics event in this case, since LaunchDarkly would discard the event as invalid anyway. Also, previously, calling `identify()` with no user object would throw an exception.
- `FileDataSource`, in auto-update mode, could sometimes reload files more than once when they were only modified once (due to a known issue with Node's `fs.watch`). This should no longer happen. ([#138](https://github.com/launchdarkly/node-client/issues/138))
- Fixed dependency vulnerabilities flagged by `npm audit`. These were all for test-only dependencies, so would not affect production code.
- Previously, CI tests were only running on Linux. We have added a CI test suite that runs on Windows, using the latest stable version of Node.
- A supported user property, `privateAttributeNames`, was not usable from TypeScript because it was omitted from the TypeScript declarations.
- In TypeScript, asynchronous methods that can either take a callback or return a Promise were not usable in the Promise style, because the return types were declared incorrectly. ([#141](https://github.com/launchdarkly/node-client/issues/141))
- Some TypeScript declarations that used `type` now use `interface` instead, except for `LDFlagValue` which is a type alias. This should not affect regular usage of the SDK in TypeScript, but it is easier to extend an `interface` than a `type` if desired.

## [5.7.1] - 2019-01-16

Changes are only in test code used by other libraries. There is no need to upgrade to this release.

## [5.7.0] - 2019-01-11
### Added:
- It is now possible to inject feature flags into the client from local JSON or YAML files, replacing the normal LaunchDarkly connection. This would typically be for testing purposes. See `FileDataSource` in the [TypeScript API documentation](https://github.com/launchdarkly/node-client/blob/master/index.d.ts), and ["Reading flags from a file"](https://docs.launchdarkly.com/v2.0/docs/reading-flags-from-a-file).

### Fixed:
- Fixed a potential race condition that could happen when using a DynamoDB or Consul feature store. The Redis feature store was not affected.

## [5.6.2] - 2018-11-15
### Fixed:
- Creating multiple clients with the default in-memory feature store (i.e. leaving `config.featureStore` unset) was causing all of the clients to share the _same_ feature store instance. This has been fixed so they will now each get their own in-memory store. (Thanks, [seanparmelee](https://github.com/launchdarkly/node-client/pull/130)!)

## [5.6.1] - 2018-11-15
### Fixed:
- Fixed a bug introduced in v5.6.0 that could cause an unhandled promise rejection if a Redis error occurred while trying to query all flags from Redis.
- Fixed a bug introduced in v5.6.0 that could cause an exception when calling `close()` on a client that was using a Redis feature store _without_ in-memory caching.

## [5.6.0] - 2018-11-14
### Added:
- To make it easier to build feature store integrations for databases other than Redis, some of the feature store support logic has been made into a reusable component in `caching_store_wrapper.js`.

### Changed:
- For proxy support, the SDK now uses the published version of the `tunnel` package from NPM, rather than a Git reference to a fork.

## [5.5.0] - 2018-10-08
### Added:
- The `allFlagsState` method now accepts a new option, `detailsOnlyForTrackedFlags`, which reduces the size of the JSON representation of the flag state by omitting some metadata. Specifically, it omits any data that is normally used for generating detailed evaluation events if a flag does not have event tracking or debugging turned on.

### Fixed:
- Fixed an error that would occur in two cases where the client should return a default value: evaluating a flag when the client and the feature store are not yet initialized, and evaluating with no flag key. (Thanks, [SharkofMirkwood](https://github.com/launchdarkly/node-client/pull/123)!)
- JSON data from `allFlagsState` is now slightly smaller even if you do not use the new option described above, because it completely omits the flag property for event tracking unless that property is true.

## [5.4.2] - 2018-09-05
### Fixed:
- Fixed a bug that would sometimes cause an unhandled promise rejection warning-- and, depending on your Node configuration, a crash-- if there was an HTTP error during an automatic event flush. This was a partial regression of [#85](https://github.com/launchdarkly/node-client/issues/85) which was introduced in v5.0.0, although unlike the earlier bug, it happened nondeterministically rather than for all errors.

## [5.4.1] - 2018-09-05
### Fixed:
- Fixed a ReferenceError that occurred if a feature flag had invalid properties, e.g. a rule referred to a nonexistent variation index. Instead, an error will be written to the log and the flag will return the default value. ([#119](https://github.com/launchdarkly/node-client/issues/119))

## [5.4.0] - 2018-08-30
### Added:
- The new `LDClient` method `variationDetail` allows you to evaluate a feature flag (using the same parameters as you would for `variation`) and receive more information about how the value was calculated. This information is returned in an object that contains both the result value and a "reason" object which will tell you, for instance, if the user was individually targeted for the flag or was matched by one of the flag's rules, or if the flag returned the default value due to an error.

### Fixed:
- Evaluating a prerequisite feature flag did not produce an analytics event if the prerequisite flag was off.

## [5.3.2] - 2018-08-29
### Fixed:
- Fixed TypeScript syntax errors in `index.d.ts`. We are now running the TypeScript compiler in our automated builds to avoid such problems. (Thanks, [PsychicCat](https://github.com/launchdarkly/node-client/pull/116)!)

## [5.3.1] - 2018-08-27
### Fixed:
- Calling `allFlagsState()` did not work if you omitted the optional second parameter, `options`, but did provide a `callback`. ([#114](https://github.com/launchdarkly/node-client/issues/114))

## [5.3.0] - 2018-08-27
### Added:
- The new `LDClient` method `allFlagsState()` should be used instead of `allFlags()` if you are passing flag data to the front end for use with the JavaScript SDK. It preserves some flag metadata that the front end requires in order to send analytics events correctly. Versions 2.5.0 and above of the JavaScript SDK are able to use this metadata, but the output of `allFlagsState()` will still work with older versions.
- The `allFlagsState()` method also allows you to select only client-side-enabled flags to pass to the front end, by using the option `clientSideOnly: true`.

### Deprecated:
- `LDClient.allFlags()`

## [5.2.1] - 2018-08-22

### Fixed:
- Problematic dependencies flagged by `npm audit` have been fixed. Note that these were all development-only dependencies, so should not have affected any production code. ([#108](https://github.com/launchdarkly/node-client/issues/108))
- Type definitions for `LDFeatureStore` are now correct.
- Fixed an accidental global variable reference in `event_summarizer.js`. (Thanks, [jwenzler](https://github.com/launchdarkly/node-client/pull/111#pullrequestreview-148668257)!)

## [5.2.0] - 2018-08-01

### Changed:
- The promise from `waitForInitialization()`, if successful, now resolves with a value: the client. Previously, it resolved with no value. (Thanks, [rmanalan](https://github.com/launchdarkly/node-client/pull/106)!)

### Fixed:
- Receiving an HTTP 400 error from LaunchDarkly should not make the client give up on sending any more requests to LaunchDarkly (unlike a 401 or 403).

## [5.1.2] - 2018-07-26

### Removed:
- Removed a dependency on the deprecated [`crypto`](https://www.npmjs.com/package/crypto) module. ([#92](https://github.com/launchdarkly/node-client/issues/92))

## [5.1.1] - 2018-07-19

### Fixed:
- Now outputs a more descriptive log message if `allFlags` is called with a null user object. (Thanks, [jbatchelor-atlassian](https://github.com/launchdarkly/node-client/pull/103)!)
- Added TypeScript definitions for some previously undefined types.
- Updated `request` package dependency to `2.87.0`, to avoid a [security vulnerability](https://snyk.io/vuln/npm:cryptiles:20180710) in a package used by `request`.

## [5.1.0] - 2018-06-26

### Added:
- The new event `"failed"` will fire if client initialization failed due to any of the unrecoverable errors described below. If you prefer to use Promises, there is a new method `waitForInitialization()`, which behaves exactly like `waitUntilReady()` except that its Promise will be rejected if the "failed" event fires. (For backward compatibility, the Promise returned by `waitUntilReady()` will never be rejected.) ([#96](https://github.com/launchdarkly/node-client/issues/96))

### Changed:
- The client now treats most HTTP 4xx errors as unrecoverable: that is, after receiving such an error, it will not make any more HTTP requests for the lifetime of the client instance, in effect taking the client offline. This is because such errors indicate either a configuration problem (invalid SDK key) or a bug, which is not likely to resolve without a restart or an upgrade. This does not apply if the error is 400, 408, 429, or any 5xx error.

### Fixed:
- Fixed a bug that would cause a null reference error if you called `close()` on an offline client. (Thanks, [dylanlingelbach](https://github.com/launchdarkly/node-client/pull/100)!)

### Deprecated:
- The `waitUntilReady()` method is now deprecated in favor of `waitForInitialization()` (see above).

## [5.0.2] - 2018-06-15

### Fixed:
- Removed an indirect dependency on an old version of the `querystringify` module, which had a [security flaw](https://github.com/unshiftio/querystringify/pull/19). ([#97](https://github.com/launchdarkly/node-client/issues/97))
- Updated TypeScript definitions for client options. (Thanks, [stepanataccolade](https://github.com/launchdarkly/node-client/pull/95#pullrequestreview-126088214)!)

## [5.0.1] - 2018-05-31

### Fixed:
- Fixed a bug that caused summary events to combine two different counters: a) flag evaluations that produced the flag's first variation, and b) counts for flag evaluations that fell through to the default value.

### Removed:
- Removed debug-level logging that was listing every analytics event.

## [5.0.0] - 2018-05-10

### Changed:
- To reduce the network bandwidth used for analytics events, feature request events are now sent as counters rather than individual events, and user details are now sent only at intervals rather than in each event. These behaviors can be modified through the LaunchDarkly UI and with the new configuration option `inlineUsersInEvents`. For more details, see [Analytics Data Stream Reference](https://docs.launchdarkly.com/v2.0/docs/analytics-data-stream-reference).
- Pending analytics events are now flushed if 1. the configured `flush_interval` elapses or 2. you explicitly call `flush()`. Previously, if the number of events exceeded the configured capacity it would also trigger a flush; now, the client will simply drop events until the next timed or explicit flush occurs. This makes the Node SDK consistent with the other SDKs, and prevents unbounded use of network resources if you are generating analytics events rapidly.
- When sending analytics events, if there is a connection error or an HTTP 5xx response, the client will try to send the events again one more time after a one-second delay.
- In every function that takes an optional callback parameter, if you provide a callback, the function will not return a promise; a promise will be returned only if you omit the callback. Previously, it would always return a promise which would be resolved/rejected at the same time that the callback (if any) was called; this caused problems if you had not registered an error handler for the promise.

### Fixed:
- Removed a dependency on `hoek` v4.2.0, which had a [security flaw](https://nodesecurity.io/advisories/566); now uses 4.2.1 instead.

### Deprecated:
- All function and property names that used underscores are now deprecated; please use their camelCase equivalent instead (e.g. `allFlags` instead of `all_flags`). The deprecated names will still work for now, but will trigger a warning message in the log.


## [4.0.5] - 2018-05-03
### Fixed
- The waitUntilReady Promise will now resolve even after the ready event was emitted — thanks @dylanjha

## [4.0.4] - 2018-04-17
### Fixed
- Fixed a bug that could cause a call stack overflow when calling `all_flags` with a very large number of flags, or evaluating a flag with a very large number of rules. This should no longer happen no matter how many flags or rules there are.

## [4.0.3] - 2018-03-27
### Fixed
- Fixed a [bug](https://github.com/launchdarkly/node-client/issues/85) that would cause an unhandled promise rejection warning-- and, depending on your Node configuration, a crash-- if there was an HTTP error during an automatic event flush.

## [4.0.2] - 2018-03-14
### Fixed
- In the Redis feature store, fixed synchronization problems that could cause a feature flag update to be missed if several of them happened in rapid succession.

## [4.0.1] - 2018-03-09
### Fixed
- Any Redis connection failure will now be logged and will trigger reconnection attempts transparently. Previously, it caused an uncaught exception. Note that during a Redis outage, flag evaluations will use the last known value from the in-memory cache if available (if this cache was enabled with the `cache_ttl` parameter to `RedisFeatureStore`), or otherwise the default value.
- Fixed a bug in the Redis adapter that caused an error ("Transaction discarded because of previous errors") at startup time if there were either no feature flags or no user segments.
- Fixed a bug that caused a spurious Redis query for the key "launchdarkly:undefined".
- Fixed a bug that could cause analytics events not to be reported for feature flags that were evaluated due to being prerequisites of other flags.

## [4.0.0] - 2018-02-21
### Added
- Support for a new LaunchDarkly feature: reusable user segments.

### Changed
- The feature store interface has been changed to support user segment data as well as feature flags. Existing code that uses `RedisFeatureStore` should work as before, but custom feature store implementations will need to be updated.

## [3.4.0] - 2018-02-13
### Added
- Adds support for a future LaunchDarkly feature, coming soon: semantic version user attributes.

### Fixed
- When using a Redis feature store, if the client has not finished initializing but the store has already been populated, checking a feature flag will use the last known data from the store rather than returning the default value.
- For consistency with the other SDKs, it is no longer possible to compute rollouts based on a user attribute whose value is a floating-point number or a boolean. String and int attributes are allowed.

## [3.3.2] - 2018-01-31
### Fixed
- The TypeScript definition for the `all` method of `LDFeatureStore` is now correct — [#77](https://github.com/launchdarkly/node-client/issues/77)

## [3.3.1] - 2018-01-23
### Fixed
- Methods that expose a `Promise` interface now properly return the resolution or rejection value to the caller. #75 

## [3.3.0] - 2018-01-19
### Added
- Support for [private user attributes](https://docs.launchdarkly.com/docs/private-user-attributes).

## [3.2.1] - 2017-12-13
### Fixed
- Only emit stream 401 errors once

## [3.2.0] - 2017-12-13
### Added
- New `send_events` option to control whether the SDK should send events back to LaunchDarkly or not. Defaults to `true`.
### Changed
- If the SDK gets a 401 from LaunchDarkly it will stop retrying to connect since there is no way for the
SDK key to become valid again.

## [3.1.0] - 2017-12-12
### Changed
- Asynchronous SDK methods now return a `Promise`; the SDK now supports both the Node.js error callback interface and the `Promise` interface. (https://github.com/launchdarkly/node-client/issues/58)
- The SDK now emits an `error` event. If no `error` event handler exists, errors will be logged using the configured logger. (https://github.com/launchdarkly/node-client/issues/55)
- The SDK now returns context-specific error objects to make it easier to handle errors from consumer code. (https://github.com/launchdarkly/node-client/issues/56)
- A new `update` event is available on the client to be notified whenever the SDK receives feature flag updates from LaunchDarkly.
### Fixed
- Callbacks to asynchronous methods are now always called asynchronously (to avoid [zalgo](http://blog.izs.me/post/59142742143/designing-apis-for-asynchrony)) (https://github.com/launchdarkly/node-client/issues/69)


## [3.0.15] - 2017-07-21
### Changed
- More consistent User-Agent header usage
### Added
- Release script


## [3.0.14] - 2017-06-26
### Fixed
- Fixed implicit any in typescript definition
### Changed
- Improved error logging when polling

## [3.0.13] - 2017-05-16
### Changed
- Update typescript definitions

## [3.0.12] - 2017-05-16
### Changed
- Improve compatibility with ts-node parser

## [3.0.11] - 2017-05-16
### Changed
- Fix incorrect typescript definition for init()

## [3.0.10] - 2017-05-16
### Changed
- Add typescript definitions

## [3.0.9] - 2017-05-01
### Changed
- Log shorter messages, with a stack trace, for known errors with messages

## [3.0.8] - 2017-03-10
### Changed
- Fixed a bug where all_flags would not display correct flag result for user

## [3.0.7] - 2017-01-16
### Changed
- Fixed a bug in initialization that caused high CPU usage

## [3.0.6] - 2016-12-19
### Fixed
- Bug fix for receiving updates to large feature flags

## [3.0.5] - 2016-10-20
### Fixed
- Numerous bug fixes for the Redis feature store

## [3.0.4] - 2016-10-19
### Fixed
- The event queue is no longer a global property, so multiple clients initialized in one node process now send events to the correct environment 

## [3.0.3] - 2016-09-09
### Added
- The `RedisFeatureStore` now takes an optional prefix parameter
### Fixed
- Mark the client initialized immediately in LDD mode

## [3.0.2] - 2016-08-19
### Fixed
- Fixed a bug in the secure_mode_hash function

## [3.0.1] - 2016-08-18
### Changed
- The `ready` event now gets properly emitted in offline mode.

## [3.0.0] - 2016-08-08
### Added
- Support for multivariate feature flags. In addition to booleans, feature flags can now return numbers, strings, dictionaries, or arrays via the `variation` method.
- New `all_flags` method returns all flag values for a specified user.
- New `secure_mode_hash` function computes a hash suitable for the new LaunchDarkly JavaScript client's secure mode feature.
- New `initialized` function returns whether or not the client has finished initialization.

### Deprecated
- The `toggle` call has been deprecated in favor of `variation`.

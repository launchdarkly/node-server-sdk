# Change log

All notable changes to the LaunchDarkly Node.js SDK will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

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

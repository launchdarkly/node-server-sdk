# Change log

All notable changes to the LaunchDarkly Node.js SDK will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

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

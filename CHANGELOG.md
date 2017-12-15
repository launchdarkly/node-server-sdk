# Change log

All notable changes to the LaunchDarkly Node.js SDK will be documented in this file. This project adheres 
to [Semantic Versioning](http://semver.org).

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

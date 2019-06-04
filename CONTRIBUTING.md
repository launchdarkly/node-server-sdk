# Contributing to the LaunchDarkly Server-Side SDK for Node.js

LaunchDarkly has published an [SDK contributor's guide](https://docs.launchdarkly.com/docs/sdk-contributors-guide) that provides a detailed explanation of how our SDKs work. See below for additional information on how to contribute to this SDK.

## Submitting bug reports and feature requests
 
The LaunchDarkly SDK team monitors the [issue tracker](https://github.com/launchdarkly/node-server-sdk/issues) in the SDK repository. Bug reports and feature requests specific to this SDK should be filed in this issue tracker. The SDK team will respond to all newly filed issues within two business days.

## Submitting pull requests
 
We encourage pull requests and other contributions from the community. Before submitting pull requests, ensure that all temporary or unintended code is removed. Don't worry about adding reviewers to the pull request; the LaunchDarkly SDK team will add themselves. The SDK team will acknowledge all pull requests within two business days.

## Build instructions

### Prerequisites

The project uses `npm`, which is bundled in all supported versions of Node.

### Setup

To install project dependencies, from the project root directory:

```
npm install
```

### Testing

To run all unit tests:

```
npm test
```

By default, the full unit test suite includes live tests of the Redis integration. Those tests expect you to have a Redis instance running locally. To skip them, set the environment variable `LD_SKIP_DATABASE_TESTS=1` before running the tests.

To verify that the TypeScript declarations compile correctly (this involves compiling the file `test-types.ts`, so if you have changed any types or interfaces, you will want to update that code):

```
npm run check-typescript
```

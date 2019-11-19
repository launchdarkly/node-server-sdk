const httpUtils = require('../httpUtils');
const packageJson = require('../../package.json');

it('sets SDK key', () => {
  const h = httpUtils.getDefaultHeaders('my-sdk-key', {});
  expect(h).toMatchObject({ Authorization: 'my-sdk-key' });
});

it('sets user agent', () => {
  const h = httpUtils.getDefaultHeaders('my-sdk-key', {});
  expect(h).toMatchObject({ 'User-Agent': 'NodeJSClient/' + packageJson.version });
});

it('does not include wrapper header by default', () => {
  const h = httpUtils.getDefaultHeaders('my-sdk-key', {});
  expect(h['X-LaunchDarkly-Wrapper']).toBeUndefined();
});

it('sets wrapper header with name only', () => {
  const h = httpUtils.getDefaultHeaders('my-sdk-key', { wrapperName: 'my-wrapper' });
  expect(h).toMatchObject({ 'X-LaunchDarkly-Wrapper': 'my-wrapper' });
});

it('sets wrapper header with name and version', () => {
  const h = httpUtils.getDefaultHeaders('my-sdk-key', { wrapperName: 'my-wrapper', wrapperVersion: '2.0' });
  expect(h).toMatchObject({ 'X-LaunchDarkly-Wrapper': 'my-wrapper/2.0' });
});

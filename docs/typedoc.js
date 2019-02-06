
module.exports = {
  out: './docs/build/html',
  includes: '.',
  exclude: [
    '**/node_modules/**',
    'test-types.ts'
  ],
  name: 'LaunchDarkly Node SDK',
  theme: 'default',
  includeDeclarations: true
};

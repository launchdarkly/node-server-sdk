
// Note that the format of this file is barely documented on the TypeDoc site. In general,
// the properties are equivalent to the command-line options described here:
// https://typedoc.org/api/

module.exports = {
  out: './docs/build/html',
  exclude: [
    '**/node_modules/**',
    'test-types.ts'
  ],
  name: 'LaunchDarkly Node SDK',
  readme: 'none',                // don't add a home page with a copy of README.md
  mode: 'file',                  // don't treat "index.d.ts" itself as a parent module
  includeDeclarations: true,     // allows it to process a .d.ts file instead of actual TS code
  entryPoint: '"ldclient-node"'  // note extra quotes - workaround for a TypeDoc bug
};

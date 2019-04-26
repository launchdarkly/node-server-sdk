#!/usr/bin/env bash
# This script publishes a new version of the SDK to NPM. It also updates the version in package.json.

# It takes exactly one argument: the new version.
# It should be run from the root of this git repo like this:
#   ./scripts/release.sh 4.0.9

# When done you should commit and push the changes made.

set -uxe
echo "Starting node-server-sdk release."

VERSION=$1
npm --version

# Update version in package.json
# We're intentionally not running 'npm version' because it does a git commit, which interferes
# with other parts of this automated release process.

PACKAGE_JSON_TEMP=./package.json.tmp
sed "s/\"version\".*/\"version\": \"${VERSION}\",/g" package.json > ${PACKAGE_JSON_TEMP}
mv ${PACKAGE_JSON_TEMP} package.json

npm install

npm publish

if [[ $VERSION =~ '-' ]]; then
	echo "Not publishing documentation because this is not a production release"
else
  ./scripts/release-docs.sh $VERSION
fi

echo "Done with node-server-sdk release"

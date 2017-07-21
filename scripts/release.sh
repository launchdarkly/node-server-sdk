#!/usr/bin/env bash
# This script publishes a new version of the ldclient-node SDK to NPM. It also updates the version in package.json.

# It takes exactly one argument: the new version.
# It should be run from the root of this git repo like this:
#   ./scripts/release.sh 4.0.9

# When done you should commit and push the changes made.

set -uxe
echo "Starting node-client release."

VERSION=$1
npm --version

# Update version in package.json
# We're intentionally not running 'npm version' because it does a git commit, which interferes
# with other parts of this automated release process.

# Update version in setup.py
PACKAGE_JSON_TEMP=./package.json.tmp
sed "s/\"version\".*/\"version\": \"${VERSION}\",/g" package.json > ${PACKAGE_JSON_TEMP}
mv ${PACKAGE_JSON_TEMP} package.json
npm publish

echo "Done with node-client release"

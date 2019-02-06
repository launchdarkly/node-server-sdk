
TYPEDOC_OPTIONS=--name "LaunchDarkly Node SDK" --includeDeclarations --exclude "**/node_modules/**" --exclude test-types.ts

.PHONY: html

html:
	rm -rf build/*
	cd .. && ./node_modules/.bin/typedoc --options ./docs/typedoc.js

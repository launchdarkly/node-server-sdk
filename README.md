LaunchDarkly SDK for Node.js
===========================

Quick setup
-----------

0. Install the Node.js SDK with `npm`

        npm install ldclient-node --save

1. Require the LaunchDarkly client:

        var LaunchDarkly = require('ldclient-node');


2. Create a new LDClient with your API key:

        ld_client = LaunchDarkly.init("YOUR API KEY")

Your first feature flag
-----------------------

1. Create a new feature flag on your [dashboard](https://app.launchdarkly.com)
2. In your application code, use the feature's key to check whether the flag is on for each user:

        ld_client.toggle("your.flag.key", {"key" : "user@test.com"}, false, function(show_feature) {
          if (show_feature) {
              # application code to show the feature
          }
          else {
              # the code to run if the feature is off 
          }
        });


Learn more
-----------

Check out our [documentation](http://docs.launchdarkly.com) for in-depth instructions on configuring and using LaunchDarkly. You can also head straight to the [complete reference guide for this SDK](http://docs.launchdarkly.com/v1.0/docs/node-sdk-reference).
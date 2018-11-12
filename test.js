
var LaunchDarkly = require('ldclient-node');

var config = {
  baseUri: 'https://ld-stg.global.ssl.fastly.net',
  streamUri: 'https://stream-stg.launchdarkly.com',
  eventsUri: 'https://events-stg.launchdarkly.comx',
  stream: true
};

// TODO : Enter your LaunchDarkly SDK key here
var ldclient = LaunchDarkly.init("sdk-1bac0f17-f688-4b56-a699-57094f34703b", config);

user = {
   "firstName":"Bob",
   "lastName":"Loblaw",
   "key":"bob@example.com",
   "custom":{
      "groups":"beta_testers"
   }
};

// ldclient.on('error', function(e) {
//   console.log("*** " + e);
// });

ldclient.once('ready', function() {
  function doit() {
    ldclient.variation("YOUR_FEATURE_FLAG_KEY", user, false, function(err, showFeature) {
      if (showFeature) {
        // application code to show the feature
        console.log("Showing your feature to " + user.key );
      } else {
        // the code to run if the feature is off 
        console.log("Not showing your feature to " + user.key);
      }
    });
    setTimeout(doit, 1000);
  }
  setTimeout(doit, 1000);
});

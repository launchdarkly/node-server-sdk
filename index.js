var requestify = require('requestify');
var sha1 = require('node-sha1');
var util = require('util');

var defaultConfig = {
  base_uri : 'https://app.launchdarkly.com'
};

var VERSION = "0.0.1";

var new_client = function(api_key, config) {
  var client = {};

  if (!config) {
    client.config = defaultConfig;
  } 
  else {
    client.config = config;
  }

  if (!api_key) {
    throw new Error("You must configure the client with an API key");
  }
  
  client.api_key = api_key;

  requestify.cacheTransporter({
    cache: {},
    get: function(url, fn) {
      fn(null, cache[url]);
    },

    set: function(url, response, fn) {
      cache[url] = response;
      fn();
    },
    purge: function(url, fn) {
      delete cache[url];
      fn();
    }
  });

  client.get_flag = function(key, user, default_val, fn) {
    if (!key || !user) {
      fn(default_val);
    }

    requestify.request(client.config.base_uri + '/api/eval/features/' + key, {
      method: "GET",
      headers: {
        'Authorization': 'api_key ' + client.api_key,
        'User-Agent': 'NodeJSClient/' + VERSION
      }
    })
    .then(function(response) {      
      var result = evaluate(response.getBody(), user);
      if (result == null) {
        fn(default_val);
      } else {
        fn(result);
      }
    });
  }


  return client;
};

module.exports = {
  init: new_client
}

function param_for_user(feature, user) {
  var idHash, hashKey, hashVal, result;
  
  if (user.key) {
    idHash = user.key;
  }

  if (user.secondary) {
    idHash += "." + user.secondary;
  }

  hashKey = util.format("%s.%s.%s", feature.key, feature.salt, idHash);
  hashVal = parseInt(sha1(hashKey).substring(0,15), 16)

  result = hashVal / 0xFFFFFFFFFFFFFFF
  return result
}

function match_target(target, user) {
  var uValue;
  var attr = target.attribute;

  if (attr === 'key' || attr === 'ip' || attr === 'country') {
    uValue = user[attr];
    if (uValue) {
      return target.values.indexOf(uValue) >= 0;
    }
    else {
      return false;
    }
  }
  else { // custom attribute
    if (!user.custom) {
      return false;
    }
    if (!user.custom[attr]) {
      return false;
    }
    uValue = user.custom[attr];

    if (typeof uValue === 'string' || typeof uValue === 'number') {
      return target.values.indexOf(uValue) >= 0;
    }
    else if (uValue instanceof Array) {
      return intersect_safe(uValue, target.values).length > 0;
    }
    return false;
  }
}

function match_variation(variation, user) {
  for (i = 0; i < variation.targets.length; i++) {
    if (match_target(variation.targets[i], user)) {
      return true;
    }
  }
  return false;
}

function evaluate(feature, user) {
  if (!feature.on) {
    return null;
  }

  param = param_for_user(feature, user);

  if (!param) {
    return null;
  }

  for (i = 0; i < feature.variations.length; i ++) {
    if (match_variation(feature.variations[i], user)) {
      return feature.variations[i].value;
    }
  }

  var total = 0.0;   
  for (i = 0; i < feature.variations.length; i++) {
    total += feature.variations[i].weight / 100.0
    if (param < total) {
      return feature.variations[i].value;
    }
  }

  return null;
}

function intersect_safe(a, b)
{
  var ai=0, bi=0;
  var result = new Array();

  while( ai < a.length && bi < b.length )
  {
     if      (a[ai] < b[bi] ){ ai++; }
     else if (a[ai] > b[bi] ){ bi++; }
     else /* they're equal */
     {
       result.push(a[ai]);
       ai++;
       bi++;
     }
  }

  return result;
}

var main = function(){
  var client = new_client("7f60f21f-0552-4756-ae32-ca65a0c96ca8", {base_uri: "http://localhost:3000"});
  client.get_flag("engine.enable", {"key": "user@test.com"}, false, function(flag) {
    console.log(flag);
  });
}

if (require.main === module) {
    main();
}
var util = require('util');
var sha1 = require('node-sha1');


function param_for_user(feature, user) {
  var idHash, hashKey, hashVal, result;
  
  if (user.key) {
    idHash = user.key;
  }

  if (user.secondary) {
    idHash += "." + user.secondary;
  }

  hashKey = util.format("%s.%s.%s", feature.key, feature.salt, idHash);
  hashVal = parseInt(sha1(hashKey).substring(0,15), 16);

  result = hashVal / 0xFFFFFFFFFFFFFFF;
  return result;
}

var builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];

function match_target(target, user) {
  var uValue;
  var attr = target.attribute;

  if (builtins.indexOf(attr) >= 0) {
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
    if (!user.custom.hasOwnProperty(attr)) {
      return false;
    }
    uValue = user.custom[attr];

    if (uValue instanceof Array) {
      return intersect_safe(uValue, target.values).length > 0;
    }
    return target.values.indexOf(uValue) >= 0;
  }
}

function match_user(variation, user) {
  if (variation.userTarget) {
    return match_target(variation.userTarget, user);
  }
  return false;
}

function match_variation(variation, user) {
  var i;
  for (i = 0; i < variation.targets.length; i++) {
    if (variation.userTarget && variation.targets[i].attribute === 'key') {
      continue;
    }

    if (match_target(variation.targets[i], user)) {
      return true;
    }
  }
  return false;
}

function evaluate(feature, user) {
  var param, i;
  if (!feature) {
    return null;
  }

  if (feature.deleted || !feature.on) {
    return null;
  }

  param = param_for_user(feature, user);

  if (!param) {
    return null;
  }

  for (i = 0; i < feature.variations.length; i ++) {
    if (match_user(feature.variations[i], user)) {
      return feature.variations[i].value;
    }
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
  return a.filter(function(value) {
    return b.indexOf(value) > -1;
  });
}

module.exports = evaluate;
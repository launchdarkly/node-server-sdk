var RedisStore = require('./redis_store');

var RedisFeatureStore = RedisStore("feature", ":features");

module.exports = RedisFeatureStore;
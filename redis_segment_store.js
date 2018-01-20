var RedisStore = require('./redis_store');

var RedisSegmentStore = RedisStore("segment", ":segments");

module.exports = RedisSegmentStore;
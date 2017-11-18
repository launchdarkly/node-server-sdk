function FeatureStoreEventWrapper(featureStore, emitter) {
  function differ(key, oldValue, newValue) {
    if(newValue && oldValue && newValue.version < oldValue.version) return;
    setTimeout(function(){
      emitter.emit("update", newValue);
      emitter.emit(`update:${key}`, oldValue, newValue);
    }, 0);
  }

  return {
    get: featureStore.get.bind(featureStore),
    all: featureStore.all.bind(featureStore),
    initialized: featureStore.initialized,
    close: featureStore.close.bind(featureStore),

    init: function(newFlags, callback) {
      featureStore.all(function(oldFlags){
        featureStore.init(newFlags, function(){
          var allFlags = {};
          Object.assign(allFlags, oldFlags, newFlags);
          var handledFlags = {};

          for (var key in allFlags) {
            if(handledFlags[key]) continue;
            differ(key, oldFlags[key], allFlags[key]);
            handledFlags[key] = true;
          }

          callback && callback.apply(null, arguments);
        });
      });      
    },

    delete: function(key, version, callback) {
      featureStore.get(function(oldFlag) {
        featureStore.delete(key, version, function() {
          differ(key, oldFlag, {});
          callback && callback.apply(null, arguments);
        });
      });
    },

    upsert: function(key, flag, callback) {
      featureStore.get(function(oldFlag) {
        featureStore.upsert(key, newFlag, function() {
          differ(key, oldFlag, newFlag);
          callback && callback.apply(null, arguments);
        });
      });
    }
  }
}

module.exports = FeatureStoreEventWrapper;
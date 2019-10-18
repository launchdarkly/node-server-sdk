const dataKind = require('./versioned_data_kind');

function FeatureStoreEventWrapper(featureStore, emitter) {
  function differ(key, oldValue, newValue) {
    if(newValue && oldValue && newValue.version < oldValue.version) return;
    setTimeout(function(){
      emitter.emit('update', newValue);
      emitter.emit(`update:${key}`, oldValue, newValue);
    }, 0);
  }

  return {
    get: featureStore.get.bind(featureStore),
    all: featureStore.all.bind(featureStore),
    initialized: featureStore.initialized.bind(featureStore),
    close: featureStore.close.bind(featureStore),

    init: (newData, callback) => {
      featureStore.all(dataKind.features, function(oldFlags){
        featureStore.init(newData, function(){
          const allFlags = {};
          const newFlags = newData[dataKind.features.namespace] || {};
          Object.assign(allFlags, oldFlags, newFlags);
          const handledFlags = {};

          for (let key in allFlags) {
            if(handledFlags[key]) continue;
            differ(key, oldFlags[key], newFlags[key]);
            handledFlags[key] = true;
          }

          callback && callback.apply(null, arguments);
        });
      });      
    },

    delete: (kind, key, version, callback) => {
      featureStore.get(kind, key, function(oldFlag) {
        featureStore.delete(kind, key, version, function() {
          if (kind === dataKind.features) {
            differ(key, oldFlag, {});
          }
          callback && callback.apply(null, arguments);
        });
      });
    },

    upsert: (kind, newItem, callback) => {
      featureStore.get(kind, newItem.key, function(oldItem) {
        featureStore.upsert(kind, newItem, function() {
          if (kind === dataKind.features) {
            differ(oldItem ? oldItem.key : null, oldItem, newItem);
          }
          callback && callback.apply(null, arguments);
        });
      });
    }
  };
}

module.exports = FeatureStoreEventWrapper;
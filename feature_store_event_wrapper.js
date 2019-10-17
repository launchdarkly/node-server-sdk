var dataKind = require('./versioned_data_kind');

function NamespacedDataSet() {
  let itemsByNamespace = {};

  function get(namespace, key) {
    const items = itemsByNamespace[namespace];
    return items && items[key];
  }

  function set(namespace, key, value) {
    let items = itemsByNamespace[namespace];
    if (!items) {
      items = {};
      itemsByNamespace[namespace] = items;
    }
    items[key] = value;
  }

  function remove(namespace, key) {
    const items = itemsByNamespace[namespace];
    if (items) {
      delete items[key];
    }
  }

  function removeAll() {
    itemsByNamespace = {};
  }

  function enumerate(callback) {
    for (var ns in itemsByNamespace) {
      const items = itemsByNamespace[ns];
      const keys = Object.keys(items).sort(); // sort to make tests determinate
      for (let i in keys) {
        const key = keys[i];
        callback(ns, key, items[key]);
      }
    }
  }

  function mergeFrom(otherSet) {
    otherSet.enumerate(set);
  }

  return {
    get: get,
    set: set,
    remove: remove,
    removeAll: removeAll,
    enumerate: enumerate,
    mergeFrom: mergeFrom,
    toString: () => JSON.stringify(itemsByNamespace)
  };
}

function DependencyTracker() {
  const dependenciesFrom = NamespacedDataSet();
  const dependenciesTo = NamespacedDataSet();
  // dependenciesFrom: for a given flag/segment key, what are the flags/segments it relies on
  // dependenciesTo: for a given flag/segment key, what are the flags/segments that rely on it

  function updateDependenciesFrom(namespace, key, newDependencySet) {
    const oldDependencySet = dependenciesFrom.get(namespace, key);
    oldDependencySet && oldDependencySet.enumerate(function(depNs, depKey) {
      const depsToThisDep = dependenciesTo.get(depNs, depKey);
      depsToThisDep && depsToThisDep.remove(namespace, key);
    });

    if (newDependencySet) {
      dependenciesFrom.set(namespace, key, newDependencySet);
      newDependencySet && newDependencySet.enumerate(function(depNs, depKey) {
        let depsToThisDep = dependenciesTo.get(depNs, depKey);
        if (!depsToThisDep) {
          depsToThisDep = NamespacedDataSet();
          dependenciesTo.set(depNs, depKey, depsToThisDep);
        }
        depsToThisDep && depsToThisDep.set(namespace, key, true);
      });
    }
  }

  function updateModifiedItems(inDependencySet, modifiedNamespace, modifiedKey) {
    if (!inDependencySet.get(modifiedNamespace, modifiedKey)) {
      inDependencySet.set(modifiedNamespace, modifiedKey, true);
      const affectedItems = dependenciesTo.get(modifiedNamespace, modifiedKey);
      affectedItems && affectedItems.enumerate(function(ns, key) {
        updateModifiedItems(inDependencySet, ns, key);
      });
    }
  }

  function reset() {
    dependenciesFrom.removeAll();
    dependenciesTo.removeAll();
  }
  
  return {
    updateDependenciesFrom: updateDependenciesFrom,
    updateModifiedItems: updateModifiedItems,
    reset: reset
  };
}

function FeatureStoreEventWrapper(featureStore, emitter) {
  const dependencyTracker = DependencyTracker();

  function addIfModified(namespace, key, oldValue, newValue, toDataSet) {
    if (newValue && oldValue && newValue.version <= oldValue.version) return;
    dependencyTracker.updateModifiedItems(toDataSet, namespace, key);
  }

  function sendChangeEvents(dataSet) {
    dataSet.enumerate(function(namespace, key) {
      if (namespace === dataKind.features.namespace) {
        const arg = { key: key };
        setImmediate(function() { emitter.emit(`update`, arg); });
        setImmediate(function() { emitter.emit(`update:${key}`, arg); });
      }
    });
  }

  function computeDependencies(kind, item) {
    const ret = NamespacedDataSet();
    if (kind === dataKind.features) {
      for (let i in item.prerequisites || []) {
        ret.set(dataKind.features.namespace, item.prerequisites[i].key, true);
      }
      for (let i in item.rules || []) {
        const rule = item.rules[i];
        for (let j in rule.clauses || []) {
          const clause = rule.clauses[j];
          if (clause.op === 'segmentMatch') {
            for (let k in clause.values) {
              ret.set(dataKind.segments.namespace, clause.values[k], true);
            }
          }
        }
      }
    }
    return ret;
  }

  function getMergedData(callback) {
    featureStore.all(dataKind.features, function(oldFlags) {
      featureStore.all(dataKind.segments, function(oldSegments) {
        const data = {};
        data[dataKind.features.namespace] = oldFlags;
        data[dataKind.segments.namespace] = oldSegments;
        callback(data);
      });
    });
  }

  return {
    get: featureStore.get.bind(featureStore),
    all: featureStore.all.bind(featureStore),
    initialized: featureStore.initialized.bind(featureStore),
    close: featureStore.close.bind(featureStore),

    init: function(newData, callback) {
      getMergedData(function(oldData) {
        featureStore.init(newData, function() {
          dependencyTracker.reset();

          for (let namespace in newData) {
            const items = newData[namespace];
            const kind = dataKind[namespace];
            for (let key in items) {
              const item = items[key];
              dependencyTracker.updateDependenciesFrom(namespace, key, computeDependencies(kind, item));
            }
          }

          const updatedItems = NamespacedDataSet();
          for (let namespace in newData) {
            const oldDataForKind = oldData[namespace];
            const newDataForKind = newData[namespace]
            const mergedData = Object.assign({}, oldDataForKind, newDataForKind);
            for (var key in mergedData) {
              addIfModified(namespace, key,
                oldDataForKind && oldDataForKind[key],
                newDataForKind && newDataForKind[key],
                updatedItems);
            }
          }
          sendChangeEvents(updatedItems);

          callback && callback.apply(null, arguments);
        });
      }); 
    },

    delete: function(kind, key, version, callback) {
      featureStore.get(kind, key, function(oldItem) {
        featureStore.delete(kind, key, version, function() {
          dependencyTracker.updateDependenciesFrom(kind.namespace, key, null);
          const updatedItems = NamespacedDataSet();
          addIfModified(kind.namespace, key, oldItem, {}, updatedItems);
          sendChangeEvents(updatedItems);
          callback && callback.apply(null, arguments);
        });
      });
    },

    upsert: function(kind, newItem, callback) {
      const key = newItem.key;
      featureStore.get(kind, key, function(oldItem) {
        featureStore.upsert(kind, newItem, function() {
          dependencyTracker.updateDependenciesFrom(kind.namespace, key, computeDependencies(kind, newItem));
          const updatedItems = NamespacedDataSet();
          addIfModified(kind.namespace, key, oldItem, newItem, updatedItems);
          sendChangeEvents(updatedItems);
          callback && callback.apply(null, arguments);
        });
      });
    }
  }
}

module.exports = FeatureStoreEventWrapper;
const dataKind = require('./versioned_data_kind');

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
    for (const ns in itemsByNamespace) {
      const items = itemsByNamespace[ns];
      const keys = Object.keys(items).sort(); // sort to make tests determinate
      for (const i in keys) {
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
    toString: () => JSON.stringify(itemsByNamespace),
  };
}

function DependencyTracker() {
  const dependenciesFrom = NamespacedDataSet();
  const dependenciesTo = NamespacedDataSet();
  // dependenciesFrom: for a given flag/segment key, what are the flags/segments it relies on
  // dependenciesTo: for a given flag/segment key, what are the flags/segments that rely on it

  function updateDependenciesFrom(namespace, key, newDependencySet) {
    const oldDependencySet = dependenciesFrom.get(namespace, key);
    oldDependencySet &&
      oldDependencySet.enumerate((depNs, depKey) => {
        const depsToThisDep = dependenciesTo.get(depNs, depKey);
        depsToThisDep && depsToThisDep.remove(namespace, key);
      });

    dependenciesFrom.set(namespace, key, newDependencySet);
    newDependencySet &&
      newDependencySet.enumerate((depNs, depKey) => {
        let depsToThisDep = dependenciesTo.get(depNs, depKey);
        if (!depsToThisDep) {
          depsToThisDep = NamespacedDataSet();
          dependenciesTo.set(depNs, depKey, depsToThisDep);
        }
        depsToThisDep.set(namespace, key, true);
      });
  }

  function updateModifiedItems(inDependencySet, modifiedNamespace, modifiedKey) {
    if (!inDependencySet.get(modifiedNamespace, modifiedKey)) {
      inDependencySet.set(modifiedNamespace, modifiedKey, true);
      const affectedItems = dependenciesTo.get(modifiedNamespace, modifiedKey);
      affectedItems &&
        affectedItems.enumerate((ns, key) => {
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
    reset: reset,
  };
}

function FeatureStoreEventWrapper(featureStore, emitter) {
  const dependencyTracker = DependencyTracker();

  function hasEventListeners() {
    // Before we do something that could generate a change event, we'll check whether anyone is
    // currently listening for such events. If they're not, then we can skip the whole "query the
    // old data so we can compare it to the new data and see if there was a change" step, which
    // could be expensive with a persistent feature store.
    return emitter.eventNames().some(name => name === 'update' || name.substring(0, 7) === 'update:'); // Node 6 may not have startsWith()
  }

  function addIfModified(namespace, key, oldValue, newValue, toDataSet) {
    if (newValue && oldValue && newValue.version <= oldValue.version) {
      return;
    }
    dependencyTracker.updateModifiedItems(toDataSet, namespace, key);
  }

  function sendChangeEvents(dataSet) {
    dataSet.enumerate((namespace, key) => {
      if (namespace === dataKind.features.namespace) {
        const arg = { key: key };
        setImmediate(() => {
          emitter.emit('update', arg);
        });
        setImmediate(() => {
          emitter.emit(`update:${key}`, arg);
        });
      }
    });
  }

  function computeDependencies(kind, item) {
    const ret = NamespacedDataSet();
    if (kind === dataKind.features) {
      for (const i in item.prerequisites || []) {
        ret.set(dataKind.features.namespace, item.prerequisites[i].key, true);
      }
      for (const i in item.rules || []) {
        const rule = item.rules[i];
        for (const j in rule.clauses || []) {
          const clause = rule.clauses[j];
          if (clause.op === 'segmentMatch') {
            for (const k in clause.values) {
              ret.set(dataKind.segments.namespace, clause.values[k], true);
            }
          }
        }
      }
    }
    return ret;
  }

  return {
    get: featureStore.get.bind(featureStore),
    all: featureStore.all.bind(featureStore),
    initialized: featureStore.initialized.bind(featureStore),
    close: featureStore.close.bind(featureStore),

    init: (newData, callback) => {
      const checkForChanges = hasEventListeners();
      const doInit = oldData => {
        featureStore.init(newData, () => {
          dependencyTracker.reset();

          for (const namespace in newData) {
            const items = newData[namespace];
            const kind = dataKind[namespace];
            for (const key in items) {
              const item = items[key];
              dependencyTracker.updateDependenciesFrom(namespace, key, computeDependencies(kind, item));
            }
          }

          if (checkForChanges) {
            const updatedItems = NamespacedDataSet();
            for (const namespace in newData) {
              const oldDataForKind = oldData[namespace];
              const newDataForKind = newData[namespace];
              const mergedData = Object.assign({}, oldDataForKind, newDataForKind);
              for (const key in mergedData) {
                addIfModified(
                  namespace,
                  key,
                  oldDataForKind && oldDataForKind[key],
                  newDataForKind && newDataForKind[key],
                  updatedItems
                );
              }
            }
            sendChangeEvents(updatedItems);
          }

          callback && callback();
        });
      };

      if (checkForChanges) {
        featureStore.all(dataKind.features, oldFlags => {
          featureStore.all(dataKind.segments, oldSegments => {
            const oldData = {};
            oldData[dataKind.features.namespace] = oldFlags;
            oldData[dataKind.segments.namespace] = oldSegments;
            doInit(oldData);
          });
        });
      } else {
        doInit();
      }
    },

    delete: (kind, key, version, callback) => {
      const checkForChanges = hasEventListeners();
      const doDelete = oldItem => {
        featureStore.delete(kind, key, version, () => {
          dependencyTracker.updateDependenciesFrom(kind.namespace, key, null);
          if (checkForChanges) {
            const updatedItems = NamespacedDataSet();
            addIfModified(kind.namespace, key, oldItem, { version: version, deleted: true }, updatedItems);
            sendChangeEvents(updatedItems);
          }
          callback && callback();
        });
      };
      if (checkForChanges) {
        featureStore.get(kind, key, doDelete);
      } else {
        doDelete();
      }
    },

    upsert: (kind, newItem, callback) => {
      const key = newItem.key;
      const checkForChanges = hasEventListeners();
      const doUpsert = oldItem => {
        featureStore.upsert(kind, newItem, () => {
          dependencyTracker.updateDependenciesFrom(kind.namespace, key, computeDependencies(kind, newItem));
          if (checkForChanges) {
            const updatedItems = NamespacedDataSet();
            addIfModified(kind.namespace, key, oldItem, newItem, updatedItems);
            sendChangeEvents(updatedItems);
          }
          callback && callback();
        });
      };
      if (checkForChanges) {
        featureStore.get(kind, key, doUpsert);
      } else {
        doUpsert();
      }
    },
  };
}

module.exports = FeatureStoreEventWrapper;

/*
  DevDataSource provides a way to pass features in to dev without connecting to LaunchDarkly's live service.
  This would typically be used in a local development environment.
*/

export default function InMemoryDataSource(features) {
  if (!features) {
    return;
  }

  const flags = {};
  Object.keys(features).forEach(key => {
    flags[key] = {
      key,
      on: features[key],
    };
  });
  const ld_features = {
    flags,
    segments: {},
  };

  return (config) => {
    let inited = false;
    const featureStore = config.featureStore;

    const dev_ds = {
      start: fn => {
        featureStore.init(ld_features, () => {
          inited = true;
        });
        const cb = fn || (() => {});
        cb();
      },
      stop: () => {},
      initialized: () => inited,
      close: () => {
        dev_ds.stop();
      },
    };
    return dev_ds;
  };
}

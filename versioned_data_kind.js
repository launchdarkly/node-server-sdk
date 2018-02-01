
/*
  These objects denote the types of data that can be stored in the feature store and
  referenced in the API.  If we add another storable data type in the future, as long as it
  follows the same pattern (having "key", "version", and "deleted" properties), we only need
  to add a corresponding constant here and the existing store should be able to handle it.
*/

var features = {
  namespace: 'features',
  streamApiPath: '/flags/'
};

var segments = {
  namespace: 'segments',
  streamApiPath: '/segments/'
};

module.exports = {
  features: features,
  segments: segments
};

/**
 * The EventSerializer object transforms the internal representation of events into objects suitable to be sent
 * as JSON to the server. This includes hiding any private user attributes.
 *
 * @param {Object} the LaunchDarkly client configuration object
 **/
function EventSerializer(config) {
  var serializer = {};
  var allAttrsPrivate = config.all_attrs_private;
  var privateAttrNames = config.private_attr_names || [];

  serializer.serialize_events = function(events) {
    return events.map(serialize_event);
  }

  function serialize_event(event) {
    return Object.keys(event).map(function(key) {
        return [key, (key === 'user') ? filter_user(event[key]) : event[key]];
      }).reduce(function(acc, p) {
        acc[p[0]] = p[1];
        return acc;
      }, {});
  }

  function filter_user(user) {
    var allPrivateAttrs = {};
    var userPrivateAttrs = user.privateAttrs || [];
    var ignoreAttrs = { key: true, custom: true, privateAttrs: true };
    var isPrivateAttr = function(name) {
      return !ignoreAttrs[name] && (
        allAttrsPrivate || userPrivateAttrs.indexOf(name) !== -1 ||
        privateAttrNames.indexOf(name) !== -1);
    }
    var filterAttrs = function(props) {
      return Object.keys(props).reduce(function(acc, name) {
        if (isPrivateAttr(name)) {
          // add to hidden list
          acc[1][name] = true;
        } else {
          acc[0][name] = props[name];
        }
        return acc;
      }, [{}, {}]);
    }
    var result = filterAttrs(user);
    var filteredProps = result[0];
    var removedAttrs = result[1];
    if (user.custom) {
      var customResult = filterAttrs(user.custom);
      filteredProps.custom = customResult[0];
      Object.assign(removedAttrs, customResult[1]);
    }
    var removedAttrNames = Object.keys(removedAttrs);
    if (removedAttrNames.length) {
      removedAttrNames.sort();
      filteredProps.privateAttrs = removedAttrNames;
    }
    return filteredProps;
  }

  return serializer;
}

module.exports = EventSerializer;

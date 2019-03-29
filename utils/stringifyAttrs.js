
module.exports = function stringifyAttrs(object, attrs) {
  var newObject;
  for (var i in attrs) {
    var attr = attrs[i];
    var value = object[attr];
    if (value !== undefined && typeof value !== 'string') {
      newObject = newObject || Object.assign({}, object);
      newObject[attr] = String(value);
    }
  }
  return newObject || object;
}

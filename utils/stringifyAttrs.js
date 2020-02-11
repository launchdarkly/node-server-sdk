module.exports = function stringifyAttrs(object, attrs) {
  if (!object) {
    return object;
  }
  let newObject;
  for (const i in attrs) {
    const attr = attrs[i];
    const value = object[attr];
    if (value !== undefined && typeof value !== 'string') {
      newObject = newObject || Object.assign({}, object);
      newObject[attr] = String(value);
    }
  }
  return newObject || object;
};

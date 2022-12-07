/**
 * Take a key string and escape the characters to allow it to be used as a reference.
 * @param {string} key
 * @returns {string} The processed key.
 */
function processEscapeCharacters(key) {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * @param {string} reference The reference to get the components of.
 * @returns {string[]} The components of the reference. Escape characters will be converted to their representative values.
 */
function getComponents(reference) {
  const referenceWithoutPrefix = reference.startsWith('/') ? reference.substring(1) : reference;
  return referenceWithoutPrefix
    .split('/')
    .map(component => (component.indexOf('~') >= 0 ? component.replace(/~1/g, '/').replace(/~0/g, '~') : component));
}

/**
 * @param {string} reference The reference to check if it is a literal.
 * @returns true if the reference is a literal.
 */
function isLiteral(reference) {
  return !reference.startsWith('/');
}

/**
 * Get an attribute value from a literal.
 * @param {Object} target
 * @param {string} literal
 */
function getFromLiteral(target, literal) {
  if (target !== null && target !== undefined && Object.prototype.hasOwnProperty.call(target, literal)) {
    return target[literal];
  }
}

/**
 * Gets the `target` object's value at the `reference`'s location.
 *
 * This method method follows the rules for accessing attributes for use
 * in evaluating clauses.
 *
 * Accessing the root of the target will always result in undefined.
 *
 * @param {Object} target
 * @param {string} reference
 * @returns The `target` object's value at the `reference`'s location.
 * Undefined if the field does not exist or if the reference is not valid.
 */
function get(target, reference) {
  if (reference === '' || reference === '/') {
    return undefined;
  }

  if (isLiteral(reference)) {
    return getFromLiteral(target, reference);
  }

  const components = getComponents(reference);
  let current = target;
  for (const component of components) {
    if (
      current !== null &&
      current !== undefined &&
      typeof current === 'object' &&
      // We do not want to allow indexing into an array.
      !Array.isArray(current) &&
      // For arrays and strings, in addition to objects, a hasOwnProperty check
      // will be true for indexes (as strings or numbers), which are present
      // in the object/string/array.
      Object.prototype.hasOwnProperty.call(current, component)
    ) {
      current = current[component];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Compare two references and determine if they are equivalent.
 * @param {string} a
 * @param {string} b
 */
function compare(a, b) {
  const aIsLiteral = isLiteral(a);
  const bIsLiteral = isLiteral(b);
  if (aIsLiteral && bIsLiteral) {
    return a === b;
  }
  if (aIsLiteral) {
    const bComponents = getComponents(b);
    if (bComponents.length !== 1) {
      return false;
    }
    return a === bComponents[0];
  }
  if (bIsLiteral) {
    const aComponents = getComponents(a);
    if (aComponents.length !== 1) {
      return false;
    }
    return b === aComponents[0];
  }
  return a === b;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns The two strings joined by '/'.
 */
function join(a, b) {
  return `${a}/${b}`;
}

/**
 * There are cases where a field could have been named with a preceeding '/'.
 * If that attribute was private, then the literal would appear to be a reference.
 * This method can be used to convert a literal to a reference in such situations.
 * @param {string} literal The literal to convert to a reference.
 * @returns A literal which has been converted to a reference.
 */
function literalToReference(literal) {
  return `/${processEscapeCharacters(literal)}`;
}

/**
 * Clone an object excluding the values referenced by a list of references.
 * @param {Object} target The object to clone.
 * @param {string[]} references A list of references from the cloned object.
 * @returns {{cloned: Object, excluded: string[]}} The cloned object and a list of excluded values.
 */
function cloneExcluding(target, references) {
  const stack = [];
  const cloned = {};
  const excluded = [];

  stack.push(
    ...Object.keys(target).map(key => ({
      key,
      ptr: literalToReference(key),
      source: target,
      parent: cloned,
      visited: [target],
    }))
  );

  while (stack.length) {
    const item = stack.pop();
    if (!references.some(ptr => compare(ptr, item.ptr))) {
      const value = item.source[item.key];

      // Handle null because it overlaps with object, which we will want to handle later.
      if (value === null) {
        item.parent[item.key] = value;
      } else if (Array.isArray(value)) {
        item.parent[item.key] = [...value];
      } else if (typeof value === 'object') {
        //Arrays and null must already be handled.

        //Prevent cycles by not visiting the same object
        //with in the same branch. Parallel branches
        //may contain the same object.
        if (item.visited.includes(value)) {
          continue;
        }

        item.parent[item.key] = {};

        stack.push(
          ...Object.keys(value).map(key => ({
            key,
            ptr: join(item.ptr, processEscapeCharacters(key)),
            source: value,
            parent: item.parent[item.key],
            visited: [...item.visited, value],
          }))
        );
      } else {
        item.parent[item.key] = value;
      }
    } else {
      excluded.push(item.ptr);
    }
  }
  return { cloned, excluded: excluded.sort() };
}

function isValidReference(reference) {
  return !reference.match(/\/\/|(^\/.*~[^0|^1])|~$/);
}

/**
 * Check if the given attribute reference is for the "kind" attribute.
 * @param {string} reference String containing an attribute reference.
 */
function isKind(reference) {
  // There are only 2 valid ways to specify the kind attribute,
  // so this just checks them. Given the current flow of evaluation
  // this is much less intense a process than doing full validation and parsing.
  return reference === 'kind' || reference === '/kind';
}

module.exports = {
  cloneExcluding,
  compare,
  get,
  isValidReference,
  literalToReference,
  isKind,
};

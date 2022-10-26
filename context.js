/**
 * Validate a context kind.
 * @param {string} kind
 * @returns true if the kind is valid.
 */
function validKind(kind) {
  return typeof kind === 'string' && kind !== 'kind' && kind.match(/^(\w|\.|-)+$/);
}

/**
 * Validate a context key.
 * @param {string} key
 * @returns true if the key is valid.
 */
function validKey(key) {
  return key !== undefined && key !== null && key !== '' && typeof key === 'string';
}

/**
 * Perform a check of basic context requirements.
 * @param {Object} context
 * @param {boolean} allowLegacyKey If true, then a legacy user can have an
 * empty or non-string key. A legacy user is a context without a kind.
 * @returns true if the context meets basic requirements.
 */
function checkContext(context, allowLegacyKey) {
  if (context) {
    if (allowLegacyKey && (context.kind === undefined || context.kind === null)) {
      return context.key !== undefined && context.key !== null;
    }
    const key = context.key;
    const kind = context.kind === undefined ? 'user' : context.kind;
    const kindValid = validKind(kind);
    const keyValid = kind === 'multi' || validKey(key);
    if (kind === 'multi') {
      const kinds = Object.keys(context).filter(key => key !== 'kind');
      return keyValid && kinds.every(key => validKind(key)) && kinds.every(key => validKey(context[key].key));
    }
    return keyValid && kindValid;
  }
  return false;
}

/**
 * The partial URL encoding is needed because : is a valid character in context keys.
 *
 * Partial encoding is the replacement of all colon (:) characters with the URL
 * encoded equivalent (%3A) and all percent (%) characters with the URL encoded
 * equivalent (%25).
 * @param {string} key The key to encode.
 * @returns {string} Partially URL encoded key.
 */
function encodeKey(key) {
  if (key.includes('%') || key.includes(':')) {
    return key.replace(/%/g, '%25').replace(/:/g, '%3A');
  }
  return key;
}

/**
 * For a given context get a list of context kinds.
 * @param {Object} context
 * @returns A list of kinds in the context.
 */
function getContextKinds(context) {
  if (context) {
    if (context.kind === null || context.kind === undefined) {
      return ['user'];
    }
    if (context.kind !== 'multi') {
      return [context.kind];
    }
    return Object.keys(context).filter(kind => kind !== 'kind');
  }
  return [];
}

function getCanonicalKey(context) {
  if (context) {
    if ((context.kind === undefined || context.kind === null || context.kind === 'user') && context.key) {
      return context.key;
    } else if (context.kind !== 'multi' && context.key) {
      return `${context.kind}:${encodeKey(context.key)}`;
    } else if (context.kind === 'multi') {
      return Object.keys(context)
        .sort()
        .filter(key => key !== 'kind')
        .map(key => `${key}:${encodeKey(context[key].key)}`)
        .join(':');
    }
  }
}

module.exports = {
  checkContext,
  getContextKinds,
  getCanonicalKey,
};

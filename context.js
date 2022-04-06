/**
 * Validate a context kind.
 * @param {string} kind
 * @returns true if the kind is valid.
 */
function validKind(kind) {
  return typeof kind === 'string' && kind !== 'kind' && kind.match(/^(\w|\.|-)+$/);
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
    const keyValid = kind === 'multi' || (key !== undefined && key !== null && key !== '');
    if (kind === 'multi') {
      const kinds = Object.keys(context).filter(key => key !== 'kind');
      return (
        keyValid &&
        kinds.every(key => validKind(key)) &&
        kinds.every(key => {
          const contextKey = context[key].key;
          return contextKey !== undefined && contextKey !== null && contextKey !== '';
        })
      );
    }
    return keyValid && kindValid;
  }
  return false;
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
      return `${context.kind}:${encodeURIComponent(context.key)}`;
    } else if (context.kind === 'multi') {
      return Object.keys(context)
        .sort()
        .filter(key => key !== 'kind')
        .map(key => `${key}:${encodeURIComponent(context[key].key)}`)
        .join(':');
    }
  }
}

module.exports = {
  checkContext,
  getContextKinds,
  getCanonicalKey,
};

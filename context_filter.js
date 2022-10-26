const AttributeReference = require('./attribute_reference');

function ContextFilter(config) {
  const filter = {};

  const allAttributesPrivate = config.allAttributesPrivate;
  const privateAttributes = config.privateAttributes || [];

  // These attributes cannot be removed via a private attribute.
  const protectedAttributes = ['key', 'kind', '_meta', 'anonymous'];

  const legacyTopLevelCopyAttributes = ['name', 'ip', 'firstName', 'lastName', 'email', 'avatar', 'country'];

  /**
   * For the given context and configuration get a list of attributes to filter.
   * @param {Object} context
   * @returns {string[]} A list of the attributes to filter.
   */
  const getAttributesToFilter = context =>
    (allAttributesPrivate
      ? Object.keys(context)
      : [...privateAttributes, ...((context._meta && context._meta.privateAttributes) || [])]
    ).filter(attr => !protectedAttributes.some(protectedAttr => AttributeReference.compare(attr, protectedAttr)));

  /**
   * @param {Object} context
   * @returns {Object} A copy of the context with private attributes removed,
   * and the redactedAttributes meta populated.
   */
  const filterSingleKind = context => {
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      return undefined;
    }

    const { cloned, excluded } = AttributeReference.cloneExcluding(context, getAttributesToFilter(context));
    cloned.key = String(cloned.key);
    if (excluded.length) {
      if (!cloned._meta) {
        cloned._meta = {};
      }
      cloned._meta.redactedAttributes = excluded;
    }
    if (cloned._meta) {
      delete cloned._meta['privateAttributes'];
      if (Object.keys(cloned._meta).length === 0) {
        delete cloned._meta;
      }
    }
    // Make sure anonymous is boolean if present.
    // Null counts as present, and would be falsy, which is the default.
    if (cloned.anonymous !== undefined) {
      cloned.anonymous = !!cloned.anonymous;
    }

    return cloned;
  };

  /**
   * @param {Object} context
   * @returns {Object} A copy of the context with the private attributes removed,
   * and the redactedAttributes meta populated for each sub-context.
   */
  const filterMultiKind = context => {
    const filtered = {
      kind: context.kind,
    };
    const contextKeys = Object.keys(context);

    for (const contextKey of contextKeys) {
      if (contextKey !== 'kind') {
        const filteredContext = filterSingleKind(context[contextKey]);
        if (filteredContext) {
          filtered[contextKey] = filteredContext;
        }
      }
    }
    return filtered;
  };

  /**
   * Convert the LDUser object into an LDContext object.
   * @param {Object} user The LDUser to produce an LDContext for.
   * @returns {Object} A single kind context based on the provided user.
   */
  const legacyToSingleKind = user => {
    const filtered = {
      /* Destructure custom items into the top level.
         Duplicate keys will be overridden by previously
         top level items.
      */
      ...(user.custom || {}),

      // Implicity a user kind.
      kind: 'user',

      key: user.key,
    };

    if (user.anonymous !== undefined) {
      filtered.anonymous = !!user.anonymous;
    }

    // Copy top level keys and convert them to strings.
    // Remove keys that may have been destructured from `custom`.
    for (const key of legacyTopLevelCopyAttributes) {
      delete filtered[key];
      if (user[key] !== undefined && user[key] !== null) {
        filtered[key] = String(user[key]);
      }
    }

    if (user.privateAttributeNames !== undefined && user.privateAttributeNames !== null) {
      filtered._meta = filtered._meta || {};
      // If any private attributes started with '/' we need to convert them to references, otherwise the '/' will
      // cause the literal to incorrectly be treated as a reference.
      filtered._meta.privateAttributes = user.privateAttributeNames.map(literal =>
        literal.startsWith('/') ? AttributeReference.literalToReference(literal) : literal
      );
    }

    return filtered;
  };

  filter.filter = context => {
    if (context.kind === undefined || context.kind === null) {
      return filterSingleKind(legacyToSingleKind(context));
    } else if (context.kind === 'multi') {
      return filterMultiKind(context);
    } else {
      return filterSingleKind(context);
    }
  };

  return filter;
}

module.exports = ContextFilter;

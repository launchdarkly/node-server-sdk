const ContextFilter = require('../context_filter');

describe('when handling legacy user contexts', () => {
  // users to serialize
  const user = {
    'key': 'abc',
    'firstName': 'Sue',
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' }
  };

  const userSpecifyingOwnPrivateAttr = {
    'key': 'abc',
    'firstName': 'Sue',
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' },
    'privateAttributeNames': ['dizzle', 'unused']
  };

  const userWithUnknownTopLevelAttrs = {
    'key': 'abc',
    'firstName': 'Sue',
    'species': 'human',
    'hatSize': 6,
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' }
  };

  const anonUser = {
    'key': 'abc',
    'anonymous': true,
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' }
  };

  const userWithNonStringsInStringRequiredFields = {
    'key': -1,
    'name': 0,
    'ip': 1,
    'firstName': 2,
    'lastName': ['a', 99, null],
    'email': 4,
    'avatar': 5,
    'country': 6,
    'custom': {
      'validNumericField': 7
    }
  }


  // expected results from serializing user
  const userWithNothingHidden = {
    'bizzle': 'def',
    'dizzle': 'ghi',
    'firstName': 'Sue',
    'key': 'abc',
    'kind': 'user'
  };

  const userWithAllAttrsHidden = {
    'kind': 'user',
    'key': 'abc',
    '_meta': {
      'redactedAttributes': ['/bizzle', '/dizzle', '/firstName']
    }
  };

  const userWithSomeAttrsHidden = {
    'kind': 'user',
    'key': 'abc',
    'dizzle': 'ghi',
    '_meta': {
      'redactedAttributes': ['/bizzle', '/firstName']
    }
  };

  const userWithOwnSpecifiedAttrHidden = {
    'kind': 'user',
    'key': 'abc',
    'firstName': 'Sue',
    'bizzle': 'def',
    '_meta': {
      'redactedAttributes': ['/dizzle']
    }
  };

  const anonUserWithAllAttrsHidden = {
    'kind': 'user',
    'key': 'abc',
    'anonymous': true,
    '_meta': {
      'redactedAttributes': ['/bizzle', '/dizzle']
    },
  };

  const userWithStringFieldsConverted = {
    'key': '-1',
    'kind': 'user',
    'name': '0',
    'ip': '1',
    'firstName': '2',
    'lastName': 'a,99,',
    'email': '4',
    'avatar': '5',
    'country': '6',
    'validNumericField': 7
  }

  const userWithPrivateFieldsWithAPrecedingSlash = {
    'key': 'annoying',
    'custom': {
      '/why': 'not',
      'why': 'because',
    },
    'privateAttributeNames': ['/why']
  }


  const userWithPrivateFieldsWithAPrecedingSlashFiltered = {
    'kind': 'user',
    'key': 'annoying',
    'why': 'because',
    '_meta': {
      'redactedAttributes': ['/~1why']
    }
  }


  it('includes all user attributes by default', () => {
    const uf = ContextFilter({});
    expect(uf.filter(user)).toEqual(userWithNothingHidden);
  });

  it('hides all except key if allAttributesPrivate is true', () => {
    const uf = ContextFilter({ allAttributesPrivate: true });
    expect(uf.filter(user)).toEqual(userWithAllAttrsHidden);
  });

  it('hides some attributes if privateAttributes is set', () => {
    const uf = ContextFilter({ privateAttributes: ['firstName', 'bizzle'] });
    expect(uf.filter(user)).toEqual(userWithSomeAttrsHidden);
  });

  it('hides attributes specified in per-user redactedAttributes', () => {
    const uf = ContextFilter({});
    expect(uf.filter(userSpecifyingOwnPrivateAttr)).toEqual(userWithOwnSpecifiedAttrHidden);
  });

  it('looks at both per-user redactedAttributes and global config', () => {
    const uf = ContextFilter({ privateAttributes: ['firstName', 'bizzle'] });
    expect(uf.filter(userSpecifyingOwnPrivateAttr)).toEqual(userWithAllAttrsHidden);
  });

  it('strips unknown top-level attributes', () => {
    const uf = ContextFilter({});
    expect(uf.filter(userWithUnknownTopLevelAttrs)).toEqual(userWithNothingHidden);
  });

  it('anonymous persists in the conversion to a single kind context', () => {
    const uf = ContextFilter({ allAttributesPrivate: true });
    expect(uf.filter(anonUser)).toEqual(anonUserWithAllAttrsHidden);
  });


  it('converts non-boolean "anonymous" to boolean "anonymous"', () => {
    const uf = ContextFilter({ allAttributesPrivate: true });
    expect(uf.filter({ key: "user", anonymous: "yes" }))
      .toEqual({ key: "user", kind: "user", anonymous: true });
  });

  it('converts fields to string types when needed', () => {
    const uf = ContextFilter({});
    expect(uf.filter(userWithNonStringsInStringRequiredFields)).toEqual(userWithStringFieldsConverted);
  });

  it('it handles legacy names which had a preceding slash', () => {
    const uf = ContextFilter({});
    expect(uf.filter(userWithPrivateFieldsWithAPrecedingSlash)).toEqual(userWithPrivateFieldsWithAPrecedingSlashFiltered);
  });

  it.each([null, undefined])('handles null and undefined the same for built-in attributes', (value) => {
    const cf = ContextFilter({});
    const user = {
      key: "userKey",
      name: value,
      ip: value,
      firstName: value,
      lastName: value,
      email: value,
      avatar: value,
      country: value,
    };
    expect(cf.filter(user)).toEqual({key: 'userKey', kind: 'user'});
  });
});

describe('when handling single kind contexts', () => {
  // users to serialize
  const context = {
    'kind': 'organization',
    'key': 'abc',
    'firstName': 'Sue',
    'bizzle': 'def',
    'dizzle': 'ghi'
  };

  const contextSpecifyingOwnPrivateAttr = {
    'kind': 'organization',
    'key': 'abc',
    'firstName': 'Sue',
    'bizzle': 'def',
    'dizzle': 'ghi',
    '_meta': {
      'privateAttributes': ['dizzle', 'unused']
    }
  };

  const anonymousContext = {
    'kind': 'organization',
    'key': 'abc',
    'anonymous': true,
    'bizzle': 'def',
    'dizzle': 'ghi'
  };

  // expected results from serializing context
  const userWithAllAttrsHidden = {
    'kind': 'organization',
    'key': 'abc',
    '_meta': {
      'redactedAttributes': ['/bizzle', '/dizzle', '/firstName']
    }
  };

  const contextWithSomeAttrsHidden = {
    'kind': 'organization',
    'key': 'abc',
    'dizzle': 'ghi',
    '_meta': {
      'redactedAttributes': ['/bizzle', '/firstName']
    }
  };

  const contextWithOwnSpecifiedAttrHidden = {
    'kind': 'organization',
    'key': 'abc',
    'firstName': 'Sue',
    'bizzle': 'def',
    '_meta': {
      'redactedAttributes': ['/dizzle']
    }
  };

  const contextWithAllAttrsHidden = {
    'kind': 'organization',
    'key': 'abc',
    'anonymous': true,
    '_meta': {
      'redactedAttributes': ['/bizzle', '/dizzle']
    },
  };

  it('includes all attributes by default', () => {
    const uf = ContextFilter({});
    expect(uf.filter(context)).toEqual(context);
  });

  it('hides all except key if allAttributesPrivate is true', () => {
    const uf = ContextFilter({ allAttributesPrivate: true });
    expect(uf.filter(context)).toEqual(userWithAllAttrsHidden);
  });

  it('hides some attributes if privateAttributes is set', () => {
    const uf = ContextFilter({ privateAttributes: ['firstName', 'bizzle'] });
    expect(uf.filter(context)).toEqual(contextWithSomeAttrsHidden);
  });

  it('hides attributes specified in per-context redactedAttributes', () => {
    const uf = ContextFilter({});
    expect(uf.filter(contextSpecifyingOwnPrivateAttr)).toEqual(contextWithOwnSpecifiedAttrHidden);
  });

  it('looks at both per-context redactedAttributes and global config', () => {
    const uf = ContextFilter({ privateAttributes: ['firstName', 'bizzle'] });
    expect(uf.filter(contextSpecifyingOwnPrivateAttr)).toEqual(userWithAllAttrsHidden);
  });

  it('context remains anonymous even when all attributes are hidden', () => {
    var uf = ContextFilter({ allAttributesPrivate: true });
    expect(uf.filter(anonymousContext)).toEqual(contextWithAllAttrsHidden);
  });

  it('converts non-boolean anonymous to boolean.', () => {
    var uf = ContextFilter({});
    expect(uf.filter({ kind: 'user', key: 'user', anonymous: "string" }))
      .toEqual({ kind: 'user', key: 'user', anonymous: true });

    expect(uf.filter({ kind: 'user', key: 'user', anonymous: null }))
      .toEqual({ kind: 'user', key: 'user', anonymous: false });
  });
});

describe('when handling mult-kind contexts', () => {
  const contextWithBadContexts = {
    kind: 'multi',
    string: 'string',
    null: null,
    number: 0,
    real: {
      key: "real"
    }
  };

  const contextWithBadContextsRemoved = {
    kind: 'multi',
    real: {
      key: "real"
    }
  };

  const orgAndUserContext = {
    kind: 'multi',
    organization: {
      key: 'LD',
      rocks: true,
      name: 'name',
      department: {
        name: 'sdk'
      }
    },
    user: {
      key: 'abc',
      name: 'alphabet',
      letters: ['a', 'b', 'c'],
      order: 3,
      object: {
        a: 'a',
        b: 'b'
      },
      _meta: {
        privateAttributes: ['letters', '/object/b']
      }
    }
  };

  const orgAndUserContextAllPrivate = {
    kind: 'multi',
    organization: {
      key: 'LD',
      _meta: {
        redactedAttributes: ['/department', '/name', '/rocks']
      }
    },
    user: {
      key: 'abc',
      _meta: {
        redactedAttributes: ['/letters', '/name', '/object', '/order']
      }
    }
  };

  const orgAndUserGlobalNamePrivate = {
    kind: 'multi',
    organization: {
      key: 'LD',
      rocks: true,
      department: {
        name: 'sdk'
      },
      _meta: {
        redactedAttributes: ['/name']
      }
    },
    user: {
      key: 'abc',
      order: 3,
      object: {
        a: 'a',
      },
      _meta: {
        redactedAttributes: ['/letters', '/name', '/object/b']
      }
    }
  };

  const orgAndUserContextIncludedPrivate = {
    kind: 'multi',
    organization: {
      key: 'LD',
      rocks: true,
      name: 'name',
      department: {
        name: 'sdk'
      }
    },
    user: {
      key: 'abc',
      name: 'alphabet',
      order: 3,
      object: {
        a: 'a',
      },
      _meta: {
        redactedAttributes: ['/letters', '/object/b']
      }
    }
  };

  it('it should not include invalid contexts', () => {
    const uf = ContextFilter({});
    expect(uf.filter(contextWithBadContexts)).toEqual(contextWithBadContextsRemoved);
  });

  it('it should remove attributes from all contexts when all attributes are private.', () => {
    const uf = ContextFilter({ allAttributesPrivate: true });
    expect(uf.filter(orgAndUserContext)).toEqual(orgAndUserContextAllPrivate);
  });

  it('it should apply private attributes from the context to the context.', () => {
    const uf = ContextFilter({});
    expect(uf.filter(orgAndUserContext)).toEqual(orgAndUserContextIncludedPrivate);
  });

  it('it should apply global private attributes to all contexts.', () => {
    const uf = ContextFilter({ privateAttributes: ['name'] });
    expect(uf.filter(orgAndUserContext)).toEqual(orgAndUserGlobalNamePrivate);
  });
});
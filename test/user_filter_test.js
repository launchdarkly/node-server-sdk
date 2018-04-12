var assert = require('assert');
var UserFilter = require('../user_filter');

describe('user_filter', function() {
  var warnSpy;

  // users to serialize
  var user = {
    'key': 'abc',
    'firstName': 'Sue',
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' }
  };

  var user_specifying_own_private_attr = {
    'key': 'abc',
    'firstName': 'Sue',
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' },
    'privateAttributeNames': [ 'dizzle', 'unused' ]
  };

  var user_with_unknown_top_level_attrs = {
    'key': 'abc',
    'firstName': 'Sue',
    'species': 'human',
    'hatSize': 6,
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' }
  };

  var anon_user = {
    'key': 'abc',
    'anonymous': true,
    'custom': { 'bizzle': 'def', 'dizzle': 'ghi' }
  };

  // expected results from serializing user
  var user_with_all_attrs_hidden = {
    'key': 'abc',
    'custom': { },
    'privateAttrs': [ 'bizzle', 'dizzle', 'firstName' ]
  };

  var user_with_some_attrs_hidden = {
    'key': 'abc',
    'custom': {
        'dizzle': 'ghi'
    },
    'privateAttrs': [ 'bizzle',  'firstName' ]
  };

  var user_with_own_specified_attr_hidden = {
    'key': 'abc',
    'firstName': 'Sue',
    'custom': {
      'bizzle': 'def'
    },
    'privateAttrs': [ 'dizzle' ]
  };

  var anon_user_with_all_attrs_hidden = {
    'key': 'abc',
    'anonymous': true,
    'custom': { },
    'privateAttrs': [ 'bizzle', 'dizzle' ]
  };

  beforeEach(function() {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(function() {});
  });

  afterEach(function() {
    warnSpy.mockRestore();
  });

  it('includes all user attributes by default', function() {
    var uf = UserFilter({});
    assert.deepEqual(uf.filterUser(user), user);
  });

  it('hides all except key if allAttributesPrivate is true', function() {
    var uf = UserFilter({ allAttributesPrivate: true});
    assert.deepEqual(uf.filterUser(user), user_with_all_attrs_hidden);
  });

  it('allows all_attributes_private as deprecated synonym for allAttributesPrivate', () => {
    const uf = UserFilter({ all_attributes_private: true });
    expect(uf.filterUser(user)).toEqual(userWithAllAttrsHidden);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('hides some attributes if privateAttributeNames is set', function() {
    var uf = UserFilter({ privateAttributeNames: [ 'firstName', 'bizzle' ]});
    assert.deepEqual(uf.filterUser(user), user_with_some_attrs_hidden);
  });

  it('allows private_attribute_names as deprecated synonym for privateAttributeNames', () => {
    const uf = UserFilter({ private_attribute_names: [ 'firstName', 'bizzle' ]});
    expect(uf.filterUser(user)).toEqual(userWithSomeAttrsHidden);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('hides attributes specified in per-user privateAttrs', function() {
    var uf = UserFilter({});
    assert.deepEqual(uf.filterUser(user_specifying_own_private_attr), user_with_own_specified_attr_hidden);
  });

  it('looks at both per-user privateAttrs and global config', function() {
    var uf = UserFilter({ privateAttributeNames: [ 'firstName', 'bizzle' ]});
    assert.deepEqual(uf.filterUser(user_specifying_own_private_attr), user_with_all_attrs_hidden);
  });

  it('strips unknown top-level attributes', function() {
    var uf = UserFilter({});
    assert.deepEqual(uf.filterUser(user_with_unknown_top_level_attrs), user);
  });

  it('leaves the "anonymous" attribute as is', function() {
    var uf = UserFilter({ allAttributesPrivate: true});
    assert.deepEqual(uf.filterUser(anon_user), anon_user_with_all_attrs_hidden);
  });
});

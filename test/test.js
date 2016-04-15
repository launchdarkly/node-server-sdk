var rewire = require('rewire');
var assert = require('assert');

var ld = rewire('../index.js');

match_target = ld.__get__('match_target');
match_user = ld.__get__('match_user');
sanitize_user = ld.__get__('sanitize_user');

describe('match_target', function() {
  it('should match users based on top-level attributes', function () {
    var u = {key: 'foo', firstName: 'alice'};
    var t = {
              attribute: 'firstName',
              op: 'in',
              values: [ 'alice', 'bob']
            }
    assert(match_target(t, u));
  });
  it('should not match users based on non-matching top-level attributes', function () {
    var u = {key: 'foo', firstName: 'clarisse'};
    var t = {
              attribute: 'firstName',
              op: 'in',
              values: [ 'alice', 'bob']
            }
    assert(!match_target(t, u));
  });
  it('should match users based single-value custom string attributes', function () {
    var u = {
              key: 'foo', 
              custom: {
                favoriteColor: 'green'
              }
            };
    var t = {
              attribute: 'favoriteColor',
              op: 'in',
              values: [ 'green', 'red' ]
            }
    assert(match_target(t, u));
  });
  it('should not match users without single-value custom attributes', function () {
    var u = {
              key: 'foo', 
              custom: {
                favoriteDog: 'labrador'
              }
            };
    var t = {
              attribute: 'favoriteColor',
              op: 'in',
              values: [ 'green', 'red' ]
            }
    assert(!match_target(t, u));
  });
  it('should not match users with non-matching single-value custom attributes', function () {
    var u = {
              key: 'foo', 
              custom: {
                favoriteDog: 'labrador'
              }
            };
    var t = {
              attribute: 'favoriteColor',
              op: 'in',
              values: [ 'green', 'red' ]
            }
    assert(!match_target(t, u));
  });
  it('should match users based intersecting list custom string attributes', function () {
    var u = {
              key: 'foo', 
              custom: {
                favoriteColor: [ 'green', 'blue' ]
              }
            };
    var t = {
              attribute: 'favoriteColor',
              op: 'in',
              values: [ 'green', 'red' ]
            };
    assert(match_target(t, u));
  });
  it('should not match users based non-intersecting list custom string attributes', function () {
    var u = {
              key: 'foo', 
              custom: {
                favoriteColor: [ 'purple', 'blue' ]
              }
            };
    var t = {
              attribute: 'favoriteColor',
              op: 'in',
              values: [ 'green', 'red' ]
            };
    assert(!match_target(t, u));
  });
});

describe('match_user', function() {
  it('should match the user when the key matches', function () {
    var u = {key: 'foo', firstName: 'alice'};
    var v = {
      value: true,
      weight: 0,
      userTarget: {
        attribute: 'key',
        op: 'in',
        values: ['bar', 'foo']
      },
      targets: []
    };
    assert(match_user(v, u));
  });
  it('should not match the user when the key does not match', function () {
    var u = {key: 'foo', firstName: 'alice'};
    var v = {
      value: true,
      weight: 0,
      userTarget: {
        attribute: 'key',
        op: 'in',
        values: ['bar', 'fiz']
      },
      targets: []
    };
    assert(!match_user(v, u));
  });
  it('should not match the user when the user target is empty', function () {
    var u = {key: 'foo', firstName: 'alice'};
    var v = {
      value: true,
      weight: 0,
      userTarget: {
        attribute: 'key',
        op: 'in',
        values: []
      },
      targets: []
    };
    assert(!match_user(v, u));
  });
  it('should not match the user when the user target is missing', function () {
    var u = {key: 'foo', firstName: 'alice'};
    var v = {
      value: true,
      weight: 0,
      targets: []
    };
    assert(!match_user(v, u));
  });
});

describe('sanitize_user', function () {
  it('should do nothing when the key is already a string', function () {
    var u = {key: 'foo', firstName: 'alice'};
    var u0 = {key: 'foo', firstName: 'alice'};
    sanitize_user(u);
    assert.deepStrictEqual(u0, u);
  });
  it('should coerce a numeric key to a string', function () {
    var u = {key: 33, firstName: 'alice'};
    var u0 = {key: '33', firstName: 'alice'};
    sanitize_user(u);
    assert.deepStrictEqual(u0, u);
  });
  it('should coerce a boolean key to a string', function () {
    var u = {key: true, firstName: 'alice'};
    var u0 = {key: 'true', firstName: 'alice'};
    sanitize_user(u);
    assert.deepStrictEqual(u0, u);
  });
  it('should not blow up if the key is missing', function () {
    var u = {firstName: 'alice'};
    var u0 = {firstName: 'alice'};
    sanitize_user(u);
    assert.deepStrictEqual(u0, u);
  });
});
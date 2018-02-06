var evaluate = require('../evaluate_flag.js');

describe('bucket_user', function() {
  it('gets expected bucket values for specific keys', function() {
    var user = { key: 'userKeyA' };
    var bucket = evaluate.bucket_user(user, 'hashKey', 'key', 'saltyA');
    expect(bucket).toBeCloseTo(0.42157587, 7);

    user = { key: 'userKeyB' };
    bucket = evaluate.bucket_user(user, 'hashKey', 'key', 'saltyA');
    expect(bucket).toBeCloseTo(0.6708485, 7);

    user = { key: 'userKeyC' };
    bucket = evaluate.bucket_user(user, 'hashKey', 'key', 'saltyA');
    expect(bucket).toBeCloseTo(0.10343106, 7);
  });

  it('can bucket by int value (equivalent to string)', function() {
    var user = {
      key: 'userKey',
      custom: {
        intAttr: 33333,
        stringAttr: '33333'
      }
    };
    var bucket = evaluate.bucket_user(user, 'hashKey', 'intAttr', 'saltyA');
    var bucket2 = evaluate.bucket_user(user, 'hashKey', 'stringAttr', 'saltyA');
    expect(bucket).toBeCloseTo(0.54771423, 7);
    expect(bucket2).toBe(bucket);
  });

  it('cannot bucket by float value', function() {
    var user = {
      key: 'userKey',
      custom: {
        floatAttr: 33.5
      }
    };
    var bucket = evaluate.bucket_user(user, 'hashKey', 'floatAttr', 'saltyA');
    expect(bucket).toBe(0);
  });
});

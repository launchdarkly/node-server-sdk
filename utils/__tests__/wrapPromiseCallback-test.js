var wrapPromiseCallback =  require('../wrapPromiseCallback');

const wait = ms => new Promise(function(resolve) { setTimeout(resolve, ms); });

describe('wrapPromiseCallback',function() {
  it('should resolve to the value', function() {
    const promise = wrapPromiseCallback(Promise.resolve('woohoo'));
    return expect(promise).resolves.toBe('woohoo');
  });

  it('should reject with the error', function() {
    const error = new Error('something went wrong');
    const promise = wrapPromiseCallback(Promise.reject(error));
    return expect(promise).rejects.toBe(error);
  });

  it('should call the callback with a value if the promise resolves', function(done) {
    const promise = wrapPromiseCallback(Promise.resolve('woohoo'), function(error, value) {
      expect(promise).toBeUndefined();
      expect(error).toBeNull();
      expect(value).toBe('woohoo');
      done()
    });
  });

  it('should call the callback with an error if the promise rejects', function(done) {
    const actualError = new Error('something went wrong');
    const promise = wrapPromiseCallback(Promise.reject(actualError), function(error, value) {
      expect(promise).toBeUndefined();
      expect(error).toBe(actualError);
      expect(value).toBeNull();
      done();
    });
  });
});
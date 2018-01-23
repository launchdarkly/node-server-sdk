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

  it('should call the callback with a value if the promise resolves', function() {
    const callback = jest.fn();
    const promise = wrapPromiseCallback(Promise.resolve('woohoo'), callback);

    return promise.then(function(result) {
      expect(result).toEqual('woohoo');
      // callback run on next tick to maintain asynchronous expections
      setTimeout(function() {
        expect(callback).toHaveBeenCalledWith(null, 'woohoo');
      }, 0);
    });
  });

  it('should call the callback with an error if the promise rejects', function() {
    const error = new Error('something went wrong');
    const callback = jest.fn();
    const promise = wrapPromiseCallback(Promise.reject(error), callback);
    
    return promise.catch(function(error) {
      expect(promise).rejects.toBe(error);
      // callback run on next tick to maintain asynchronous expections
      setTimeout(function() {
        expect(callback).toHaveBeenCalledWith(error, null);
      }, 0);
    });
  });
});
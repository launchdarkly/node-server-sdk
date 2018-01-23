var wrapPromiseCallback =  require('../wrapPromiseCallback');

const wait = ms => new Promise(function(resolve) { setTimeout(resolve, ms); });

describe('wrapPromiseCallback',function() {
  it('should resolve to the value', async function() {
    const promise = wrapPromiseCallback(Promise.resolve('woohoo'));
    await expect(promise).resolves.toBe('woohoo');
  });

  it('should reject with the error', async function() {
    const error = new Error('something went wrong');
    const promise = wrapPromiseCallback(Promise.reject(error));
    await expect(promise).rejects.toBe(error);
  });

  it('should call the callback with a value if the promise resolves', async function() {
    const callback = jest.fn();
    const result = await wrapPromiseCallback(Promise.resolve('woohoo'), callback);
    expect(result).toEqual('woohoo');

    // callback run on next tick to maintain asynchronous expections
    await wait(0);

    expect(callback).toHaveBeenCalledWith(null, 'woohoo');
  });

  it('should call the callback with an error if the promise rejects', async function() {
    const error = new Error('something went wrong');
    const callback = jest.fn();
    const promise = wrapPromiseCallback(Promise.reject(error), callback);
    await expect(promise).rejects.toBe(error);

    // callback run on next tick to maintain asynchronous expections
    await wait(0);

    expect(callback).toHaveBeenCalledWith(error, null);
  });
});
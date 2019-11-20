
// Converts a function that takes a single-parameter callback (like most SDK methods) into a Promise.
// This is different from util.promisify, which uses Node-style callbacks with two parameters.
// Usage: await asyncify(callback => doSomething(params, callback))
function asyncify(f) {
  return new Promise(resolve => f(resolve));
}

// Usage: await sleepAsync(5000)
function sleepAsync(millis) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}

// Calls the entity's close() method after passing the entity to the callback. Usages:
//     await withCloseable(myExistingObject, async o => doSomething(o));
//     await withCloseable(() => makeNewObject(), async o => doSomething(o));
//     await withCloseable(async () => await makeObjectAsync(), async o => doSomething(o));
function withCloseable(entityOrCreateFn, asyncCallback) {
  // Using Promise.resolve allows promises and simple values to be treated as promises
  return Promise.resolve(typeof entityOrCreateFn === 'function' ? entityOrCreateFn() : entityOrCreateFn)
    .then(entity =>
      asyncCallback(entity)
        .then(result => {
          entity.close();
          return result;
        })
        .catch(err => {
          entity.close();
          return Promise.reject(err);
        })
        // Note that we can't use Promise.finally() because it's not supported in Node 6.
    );
}

// Promise-based blocking queue. 
function AsyncQueue() {
  const items = [];
  const awaiters = [];
  let closed = false;
  const closedError = () => new Error("queue was closed");

  return {
    // Adds an item.
    add: item => {
      if (awaiters.length) {
        awaiters.shift().resolve(item);
      } else {
        items.push(item);
      }
    },

    // Blocks for the next item (async). Throws an exception if there are no more items and the queue has
    // been closed.
    take: () => {
      if (items.length) {
        return Promise.resolve(items.shift());
      }
      if (closed) {
        return Promise.reject(closedError());
      }
      return new Promise((resolve, reject) => {
        awaiters.push({ resolve, reject });
      });
    },

    isEmpty: () => {
      return items.length === 0;
    },

    length: () => items.length,

    // Allows any remaining items to be consumed, but causes take() to throw an exception after that.
    close: () => {
      while (awaiters.length > 0) {
        awaiters.shift().reject(closedError());
      }
      closed = true;
    }
  };
}

module.exports = {
  asyncify,
  sleepAsync,
  withCloseable,
  AsyncQueue,
};

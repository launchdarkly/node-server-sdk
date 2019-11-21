
// Converts a function that takes a Node-style callback (err, result) as its last argument into a
// function that returns a Promise. This is equivalent to util.promisify, but is reimplemented here
// because promisify isn't supported in Node 6.
// Usage: await promisify(doSomething)(allParamsExceptCallback)
function promisify(f) {
  return (...args) =>
    new Promise((resolve, reject) =>
      f(...args, (err, result) => err ? reject(err) : resolve(result)));
}

// Similar to promisify, but for functions whose callback takes only a single parameter (result)
// instead of Node-style (err, result). Some internal LaunchDarkly code uses these semantics.
// Usage: await promisifySingle(doSomething)(allParamsExceptCallback);
function promisifySingle(f) {
  return (...args) =>
    new Promise(resolve => f(...args, resolve));
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
  promisify,
  promisifySingle,
  sleepAsync,
  withCloseable,
  AsyncQueue,
};

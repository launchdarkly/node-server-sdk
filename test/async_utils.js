
// Converts a function that takes a single-parameter callback (like most SDK methods) into a Promise.
// Usage: asyncify(callback => doSomething(params, callback))
function asyncify(f) {
  return new Promise(resolve => f(resolve));
}

// Converts a function that takes a Node-style callback (err, result) into a Promise.
// Usage: asyncifyNode(callback => doSomething(params, callback))
function asyncifyNode(f) {
  return new Promise((resolve, reject) => f((err, result) => err ? reject(err) : resolve(result)));
}

function sleepAsync(millis) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}

function AsyncQueue() {
  const items = [];
  const awaiters = [];

  return {
    add: item => {
      if (awaiters.length) {
        awaiters.shift()(item);
      } else {
        items.push(item);
      }
    },

    take: () => {
      if (items.length) {
        return Promise.resolve(items.shift());
      }
      return new Promise(resolve => {
        awaiters.push(resolve);
      });
    },

    isEmpty: () => {
      return items.length === 0;
    }
  };
}

module.exports = {
  asyncify: asyncify,
  asyncifyNode: asyncifyNode,
  sleepAsync: sleepAsync,
  AsyncQueue: AsyncQueue
};

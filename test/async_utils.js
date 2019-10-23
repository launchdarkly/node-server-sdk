
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

module.exports = {
  asyncify: asyncify,
  asyncifyNode: asyncifyNode,
  sleepAsync: sleepAsync
};

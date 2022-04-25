
function failIfResolves(promise, timeout, waitingForWhat) {
  let timer;
  return Promise.race([
    new Promise(
      (resolve, reject) => {
        promise.then(() => {
          timer && clearTimeout(timer);
          reject('received unexpected ' + (waitingForWhat || 'value'));
        })
      }
    ),
    new Promise(
      (resolve) => {
        timer = setTimeout(resolve, timeout);
      }
    ),
    ]);
}

function failIfTimeout(promise, timeout, waitingForWhat) {
  let timer;
  return Promise.race([
    promise.finally(timer && clearTimeout(timer)),
    new Promise(
      (resolve, reject) => {
        timer = setTimeout(() => {
          reject(waitingForWhat ? 'timed out waiting for ' + waitingForWhat : 'timed out');
        }, timeout);
      }
    ),
    ]);
}

module.exports = {
  failIfResolves,
  failIfTimeout,
};

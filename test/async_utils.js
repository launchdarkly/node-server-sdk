
function asyncify(f) {
  return new Promise(resolve => f(resolve));
}

function sleepAsync(millis) {
  return new Promise(resolve => {
    setTimeout(resolve, millis);
  });
}

module.exports = {
  asyncify: asyncify,
  sleepAsync: sleepAsync
};

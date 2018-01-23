/**
 * Wrap a promise to invoke an optional callback upon resolution or rejection.
 * 
 * This function assumes the callback follows the Node.js callback type: (err, value) => void
 * 
 * If a callback is provided:
 *   - if the promise is resolved, invoke the callback with (null, value)
 *   - if the promise is rejected, invoke the callback with (error, null)
 * 
 * @param {Promise<any>} promise 
 * @param {Function} callback 
 * @returns Promise<any>
 */
module.exports = function wrapPromiseCallback(promise, callback) {
  return promise.then(
    function(value) {
      if (callback) {
        setTimeout(function() { callback(null, value); }, 0);
      }
      return value;
    },
    function(error) {
      if (callback) {
        setTimeout(function() { callback(error, null); }, 0);
      }
      return Promise.reject(error);
    }
  );
}
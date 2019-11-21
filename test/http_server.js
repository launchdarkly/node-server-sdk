const http = require('http');
const https = require('https');
const { AsyncQueue } = require('./async_utils');

// This file provides a simple interface for using an embedded HTTP or HTTPS server to handle
// requests in an end-to-end integration test. The implementation is based on Node's built-in
// server functionality, but the Node APIs are not exposed directly so test code can just use
// our abstraction.

// The original design was based on helper code in https://github.com/EventSource/eventsource/blob/master/test/eventsource_test.js

let nextPort = 8000;
let allServerWrappers = [];

function preprocessRequest(req) {
  const method = req.method.toLowerCase();
  const bodyPromise = new Promise(resolve => {
    if (method === 'post' || method === 'put') {
      let body = '';
      req.on('data', data => {
        body += data;
      });
      req.on('end', () => resolve(body));
    } else {
      resolve();
    }
  });

  return bodyPromise.then(body => ({
    method,
    path: req.url,
    headers: req.headers,
    body
  }));
}

export async function createServer(secure, options) {
  const realServer = secure ? https.createServer(options) : http.createServer(options);

  const requests = AsyncQueue();
  const responses = [];
  const handlers = [];

  realServer.on('request', (req, res) => {
    preprocessRequest(req).then(reqWrapper => {
      requests.add(reqWrapper);
      responses.push(res);
      for (let i in handlers) {
        if (handlers[i](reqWrapper, res)) {
          break;
        }
      }
    });
  });

  const serverWrapper = {
    // An AsyncQueue of all requests handled so far. Call "await server.requests.take()" to block
    // until the server has handled a request. Each request is a simple object with the properties
    // "method", "path", "headers", and "body".
    requests,

    // Blocks to retrieve the next handled request.
    nextRequest: () => requests.take(),

    // Returns the number of handled requests not yet retrieved.
    requestCount: () => requests.length(),

    // Specify a function to be called by default. It takes a single parameter that is the Node
    // ClientResponse object. You'll normally use the "respond" functions in this module:
    //    server.always(respondJson({ message: 'hi' }));
    default: responderFn => {
      handlers.push((req, res) => {
        responderFn(res);
        return true;
      });
    },

    // Specifies a function to be called only for the given method and path. Same responder semantics
    // as default(). Overrides any previous handler for the same method and path.
    forMethodAndPath: (method, path, responderFn) => {
      handlers.unshift((req, res) => {
        if (req.method === method.toLowerCase() && req.path === path) {
          responderFn(res);
          return true;
        }
        return false;
      });
    },

    close: async () => {
      responses.forEach(res => res.end());
      requests.close(); // causes anyone waiting on the queue to get an exception
      return new Promise(resolve => {
        realServer.close(resolve);
      });
    }
  };

  allServerWrappers.push(serverWrapper);

  while (true) {
    const port = nextPort++;
    try {
      await new Promise((resolve, reject) => {
        realServer.listen(port);
        realServer.on('error', reject);
        realServer.on('listening', resolve);
      });
      serverWrapper.url = (secure ? 'https' : 'http') + '://localhost:' + port;
      return serverWrapper;
    } catch (err) {
      if (!err.message.match(/EADDRINUSE/)) {
        throw err;
      }
    }
  }
}

export async function closeServers() {
  const all = [...allServerWrappers];
  allServerWrappers = [];
  for (let i in all) {
    await all[i].close();
  }
}

// Usage:
// server.forMethodAndPath('get', '/path', respond(200, { 'content-type': 'text/plain' }, 'hello'));
export function respond(status, headers, body) {
  return res => {
    res.writeHead(status, headers);
    body && res.write(body);
    res.end();
  };
}

// Usage:
// server.forMethodAndPath('get', '/path', respondJson({ message: 'I am a JSON object' }));
export function respondJson(data) {
  return respond(200, { 'Content-Type': 'application/json' }, JSON.stringify(data));
}

// Usage:
// const chunkQueue = AsyncQueue();
// server.forMethodAndPath('get', '/path', respondChunked(200, {}, chunkQueue));
// chunkQueue.add('a chunk of data');
// chunkQueue.add('another one');
// chunkQueue.close();  // closing the queue ends the response
export function respondChunked(status, headers, chunkQueue) {
  return async res => {
    res.writeHead(status, headers);
    res.write(''); // this just avoids response buffering, and causes all subsequent writes to be chunked
    while (true) {
      try {
        const chunk = await chunkQueue.take();
        res.write(chunk);
      } catch (e) {
        // queue was probably closed
        res.end();
        break;
      }
    }
  }
}

// Usage:
// const eventQueue = AsyncQueue();
// server.forMethodAndPath('get', '/path', respondSSE(200, {}, eventQueue));
// eventQueue.add({ type: 'patch', data: { path: '/flags', key: 'x' } });
// eventQueue.add({ comment: '' });
// eventQueue.close();  // closing the queue ends the response
export function respondSSE(eventQueue) {
  const chunkQueue = AsyncQueue();
  (async () => { // we're not awaiting this task - it keeps running after we return
    while (true) {
      let event, chunk;
      try {
        event = await eventQueue.take();
      } catch (e) {
        chunkQueue.close();
        break;
      }
      if (event.comment !== undefined) {
        chunk = ':' + event.comment + '\n';
      } else {
        chunk = 'event: ' + event.type + '\n';
        chunk += 'data: ';
        chunk += (typeof event.data === 'string') ? event.data : JSON.stringify(event.data);
        chunk += '\n\n';
      }
      chunkQueue.add(chunk);
    }
  })();
  return respondChunked(200, { 'Content-Type': 'text/event-stream' }, chunkQueue);
}

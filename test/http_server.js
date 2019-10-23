const http = require('http');
const https = require('https');

// This is adapted from some helper code in https://github.com/EventSource/eventsource/blob/master/test/eventsource_test.js

let nextPort = 8000;
let servers = [];

export async function createServer(secure, options) {
  const server = secure ? https.createServer(options) : http.createServer(options);
  let port = nextPort++;

  server.requests = [];
  const responses = [];

  server.on('request', (req, res) => {
    server.requests.push(req);
    responses.push(res);
  });

  const realClose = server.close;
  server.close = callback => {
    responses.forEach(res => res.end());
    realClose.call(server, callback);
  };

  servers.push(server);

  while (true) {
    try {
      await new Promise((resolve, reject) => {
        server.listen(port);
        server.on('error', reject);
        server.on('listening', resolve);
      });
      server.url = (secure ? 'https' : 'http') + '://localhost:' + port;
      return server;
    } catch (err) {
      if (err.message.match(/EADDRINUSE/)) {
        port = nextPort++;
      } else {
        throw err;
      }
    }
  }
}

export function closeServers() {
  servers.forEach(server => server.close());
  servers = [];
}

export function readAll(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', data => {
      body += data;
    });
    req.on('end', () => resolve(body));
  });
}

export function respond(res, status, headers, body) {
  res.writeHead(status, headers);
  body && res.write(body);
  res.end();
}

export function respondJson(res, data) {
  respond(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify(data));
}

export function respondSSEEvent(res, eventType, eventData) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  res.write('event: ' + eventType + '\ndata: ' + JSON.stringify(eventData) + '\n\n');
  res.write(':\n');
  // purposely do not close the stream
}

export function autoRespond(server, respondFn) {
  server.on('request', (req, res) => respondFn(res));
}

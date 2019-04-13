import * as http from 'http';
import * as https from 'https';

// This is adapted from some helper code in https://github.com/EventSource/eventsource/blob/master/test/eventsource_test.js

let nextPort = 20000;
let servers = [];

export function createServer(secure, options) {
  const server = secure ? https.createServer(options) : http.createServer(options);
  const port = nextPort++;

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

  server.url = (secure ? 'https' : 'http') + '://localhost:' + port;

  servers.push(server);

  return new Promise((resolve, reject) => {
    server.listen(port, err => (err ? reject(err) : resolve(server)));
  });
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

export function respond(res, status, headers, body, leaveOpen) {
  res.writeHead(status, headers);
  body && res.write(body);
  if (!leaveOpen) {
    res.end();
  } else {
    res.write(':\n');
  }
}

export function respondJson(res, data) {
  respond(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify(data));
}

export function respondSSEEvent(res, eventType, eventData) {
  respond(
    res,
    200,
    { 'Content-Type': 'text/event-stream' },
    'event: ' + eventType + '\ndata: ' + JSON.stringify(eventData) + '\n\n',
    true,
  );
}

export function autoRespond(server, respondFn) {
  server.on('request', (req, res) => respondFn(res));
}

'use strict';

// A malformed request must never crash the server. Before Oct 29 a POST body of
// just `null` (valid JSON, but not an object) threw inside the handler; the
// rejected promise was never caught, so Node exited and every match dropped.
// Now any non-object body reads as {} (each handler then answers its usual
// 400/404), a throw answers 500, and an oversized body answers 413.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createServer } = require('../server');

let server;
let port;

function raw(method, path, body, headers = { 'Content-Type': 'application/json' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method, hostname: '127.0.0.1', port, path, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

// Every POST route the browser uses (the test-only rig is off without CHINCHON_TEST_HOOKS).
const POSTS = [
  '/api/lobby/enter', '/api/lobby/chat', '/api/lobby/leave', '/api/lobby/rejoin',
  '/api/room/new', '/api/room/join', '/api/room/start', '/api/room/wait', '/api/room/continue',
  '/api/room/rematch', '/api/room/join-rematch', '/api/room/rematch/hold', '/api/room/rejoin',
  '/api/room/leave', '/api/room/kick', '/api/tutorial/ack', '/api/room/chat',
  '/api/draw', '/api/discard', '/api/layoff/lay', '/api/layoff/attach', '/api/layoff/ready', '/api/layoff/pass',
];
const BODIES = ['null', '[]', '[null]', '42', '"text"', 'true', '{not json', ''];

test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
test.after(() => { if (server) server.close(); });

test('a body of null on /api/lobby/enter answers 400 and the server keeps running', async () => {
  const r = await raw('POST', '/api/lobby/enter', 'null');
  assert.strictEqual(r.status, 400);
  assert.ok(r.json && r.json.error, 'a JSON error message comes back');
  const after = await raw('GET', '/api/lobby/state', null, {});
  assert.strictEqual(after.status, 200, 'the server still answers after the bad request');
});

test('no POST route answers 5xx or crashes on a non-object or broken JSON body (it answers as for {})', async () => {
  for (const p of POSTS) {
    for (const b of BODIES) {
      const r = await raw('POST', p, b);
      // Same answer as an empty {} body (leave is idempotent, so it says ok).
      assert.ok(r.status < 500, `${p} with body ${JSON.stringify(b)} answered ${r.status}`);
      assert.ok(r.json && typeof r.json === 'object', `${p} with body ${JSON.stringify(b)} answers JSON`);
    }
  }
  const after = await raw('GET', '/api/lobby/state', null, {});
  assert.strictEqual(after.status, 200);
});

test('a body over 1 MB answers 413 instead of hanging', async () => {
  const big = JSON.stringify({ name: 'x'.repeat(1_100_000) });
  const r = await raw('POST', '/api/lobby/enter', big);
  assert.strictEqual(r.status, 413);
  assert.deepStrictEqual(r.json, { error: 'request body too large' });
  const after = await raw('GET', '/api/lobby/state', null, {});
  assert.strictEqual(after.status, 200);
});

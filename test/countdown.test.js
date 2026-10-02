'use strict';

// R40 (Oct 2, 2026): the pre-start countdown for a new multi room is 60s,
// public or private. The 90s rematch window is a separate timer (not R40).

const assert = require('node:assert');
const test = require('node:test');
const { createServer, rooms } = require('../server');

let server;
let base;

function post(path, body) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { if (server) server.close(); });

for (const visibility of ['public', 'private']) {
  test(`R40: a new ${visibility} room counts down from 60s`, async () => {
    const before = Date.now();
    const created = await post('/api/room/new', { mode: 'multi', name: 'Host', visibility });
    assert.ok(created.pending, 'room is waiting on a countdown');
    assert.strictEqual(created.pending.secondsLeft, 60);
    const room = rooms.get(created.code);
    const ms = room.pending.until - before;
    assert.ok(ms > 59000 && ms <= 60000 + 1000, `countdown is ~60000ms, got ${ms}`);
  });
}

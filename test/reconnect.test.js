'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createServer, rooms } = require('../server');

const PORT = 0;
function req(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ method, host: '127.0.0.1', port, path,
      headers: { 'Content-Type': 'application/json' } }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function state(port, code, seat) {
  return req(port, 'GET', `/api/state?code=${code}&seat=${seat}`).then((r) => r.body);
}
// Advance the turn by one full human action: draw stock, discard first card.
async function passTurn(port, code, seat) {
  await req(port, 'POST', '/api/draw', { code, seat, from: 'stock' });
  const v = await state(port, code, seat);
  const card = v.yourHand[0];
  await req(port, 'POST', '/api/discard', { code, seat, cardId: card.id, close: false });
}

let server, port;
function setup() { server = createServer(); return new Promise((res) => server.listen(PORT, () => { port = server.address().port; res(); })); }
function teardown() { return new Promise((res) => server.close(res)); }

async function newMulti(port, nHumans) {
  const created = (await req(port, 'POST', '/api/room/new', { mode: 'multi', name: 'H' })).body;
  const code = created.code; const host = created.seatId;
  const seats = [host];
  for (let i = 1; i < nHumans; i++) {
    const j = (await req(port, 'POST', '/api/room/join', { code, name: `P${i + 1}` })).body;
    seats.push(j.seatId);
  }
  await req(port, 'POST', '/api/room/start', { code, seat: host });
  return { code, host, seats };
}

test('away player on turn freezes the match; room enters waiting', async () => {
  await setup();
  try {
    const { code, host, seats } = await newMulti(port, 3);
    await state(port, code, host);
    await state(port, code, seats[1]);
    await state(port, code, seats[2]);
    // advance turn to seat 1 (P2)
    await passTurn(port, code, host);
    // P2 (seat 1) goes away
    rooms.get(code).players[1].lastSeen = Date.now() - 999999;
    const v = await state(port, code, host);
    assert.ok(v.waiting, 'room should be waiting on the away player');
    assert.equal(v.waiting.seat, 1);
    assert.equal(v.waiting.canContinue, false, 'cannot continue before 90s window');
  } finally { await teardown(); }
});

test('2-player match holds forever (continue rejected)', async () => {
  await setup();
  try {
    const { code, host, seats } = await newMulti(port, 2);
    await state(port, code, host);
    await state(port, code, seats[1]);
    await passTurn(port, code, host); // turn -> seat 1
    rooms.get(code).players[1].lastSeen = Date.now() - 999999;
    const v = await state(port, code, host);
    assert.ok(v.waiting);
    const cont = await req(port, 'POST', '/api/room/continue', { code, seat: host });
    assert.equal(cont.status, 400);
    assert.match(cont.body.error, /2-player/);
  } finally { await teardown(); }
});

test('host continue converts away player to spectator and advances turn', async () => {
  await setup();
  try {
    const { code, host, seats } = await newMulti(port, 3);
    await state(port, code, host);
    await state(port, code, seats[2]);
    await passTurn(port, code, host); // turn -> seat 1 (P2 away)
    const room = rooms.get(code);
    room.players[1].lastSeen = Date.now() - 999999;
    await state(port, code, host); // sets waiting
    room.waiting.since = Date.now() - 999999; // simulate 90s+ elapsed
    const cont = await req(port, 'POST', '/api/room/continue', { code, seat: host });
    assert.equal(cont.status, 200, cont.body && cont.body.error);
    assert.equal(room.players[1].spectator, true);
    assert.ok(!room.waiting, 'waiting cleared after continue');
  } finally { await teardown(); }
});

test('rejoin with seatId resumes the same seat', async () => {
  await setup();
  try {
    const { code, seats } = await newMulti(port, 2);
    const p2 = seats[1];
    const re = (await req(port, 'POST', '/api/room/join', { code, seatId: p2 })).body;
    assert.equal(re.seatId, p2);
    assert.equal(re.rejoined, true);
    const bad = await req(port, 'POST', '/api/room/join', { code, seatId: 'nope' });
    assert.equal(bad.status, 404);
  } finally { await teardown(); }
});

test('only the host may continue/wait', async () => {
  await setup();
  try {
    const { code, host, seats } = await newMulti(port, 3);
    await state(port, code, host);
    await state(port, code, seats[1]);
    await state(port, code, seats[2]);
    await passTurn(port, code, host);
    rooms.get(code).players[1].lastSeen = Date.now() - 999999;
    await state(port, code, host); // waiting
    const p2 = seats[1];
    assert.equal((await req(port, 'POST', '/api/room/continue', { code, seat: p2 })).status, 403);
    assert.equal((await req(port, 'POST', '/api/room/wait', { code, seat: p2 })).status, 403);
  } finally { await teardown(); }
});

test('host away 60s promotes next-oldest human to host', async () => {
  await setup();
  try {
    const { code, host, seats } = await newMulti(port, 3);
    await state(port, code, host);
    const room = rooms.get(code);
    room.players[0].lastSeen = Date.now() - 999999; // host away
    room.hostGraceSince = Date.now() - 999999; // grace elapsed
    await state(port, code, seats[1]); // evaluateWaiting promotes
    assert.equal(room.hostId, seats[1], 'next-oldest human promoted');
  } finally { await teardown(); }
});

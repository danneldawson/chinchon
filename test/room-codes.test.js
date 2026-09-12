'use strict';

// Room codes are real 4-letter words (English/Spanish) and seat ids are 3-digit
// numbers, because both get read aloud and typed by hand across a table.
//
// The word-list invariants below are the safety net for src/room-words.js: any
// 3/5-letter entry, stray accent, duplicate or lowercase slip fails here rather
// than at a family game night.

const test = require('node:test');
const assert = require('node:assert');

const { createServer } = require('../server');
const { WORDS, EN, ES } = require('../src/room-words');

let server;
let base;

test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { if (server) server.close(); });

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + path);
    const req = require('http').request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: data ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json;
          try { json = buf ? JSON.parse(buf) : {}; } catch { json = {}; }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ------------------------------------------------------------ the word list

test('every room word is exactly 4 ASCII uppercase letters', () => {
  const bad = WORDS.filter((w) => !/^[A-Z]{4}$/.test(w));
  assert.deepStrictEqual(bad, [], `these are not 4-letter A-Z words: ${bad.join(', ')}`);
});

test('room words are unique across both languages', () => {
  const dupes = WORDS.filter((w, i) => WORDS.indexOf(w) !== i);
  assert.deepStrictEqual(dupes, [], `duplicated: ${dupes.join(', ')}`);
});

test('both languages are represented', () => {
  assert.ok(EN.length >= 100, `English words: ${EN.length}`);
  assert.ok(ES.length >= 80, `Spanish words: ${ES.length}`);
});

// ------------------------------------------------------- codes + seat ids

test('a new room gets a word code and a 3-digit seat id', async () => {
  const { status, json } = await api('POST', '/api/room/new', {
    mode: 'multi', name: 'Host', visibility: 'private', lobbyToken: 'h-word',
  });
  assert.strictEqual(status, 200);
  assert.ok(WORDS.includes(json.code), `code ${json.code} is not a word from the list`);
  assert.match(String(json.seatId), /^\d{3}$/, `seat id ${json.seatId} is not 3 digits`);
});

test('the word code round-trips through the join endpoint', async () => {
  const { json: room } = await api('POST', '/api/room/new', {
    mode: 'multi', name: 'Host', visibility: 'private', lobbyToken: 'h-rt',
  });
  const { status, json } = await api('POST', '/api/room/join', {
    code: room.code, name: 'P2', lobbyToken: 'p2-rt',
  });
  assert.strictEqual(status, 200, `join with code ${room.code} failed`);
  assert.match(String(json.seatId), /^\d{3}$/);
  assert.notStrictEqual(json.seatId, room.seatId, 'two players must not share a seat id');
});

test('seat ids stay unique across every live room', async () => {
  const seats = [];
  const codes = [];
  for (let i = 0; i < 6; i++) {
    const { json } = await api('POST', '/api/room/new', {
      mode: 'multi', name: `Host${i}`, visibility: 'private', lobbyToken: `h-u${i}`,
    });
    seats.push(String(json.seatId));
    codes.push(json.code);
    const { json: joined } = await api('POST', '/api/room/join', {
      code: json.code, name: `P${i}`, lobbyToken: `p-u${i}`,
    });
    seats.push(String(joined.seatId));
  }
  assert.strictEqual(new Set(seats).size, seats.length, `duplicate seat ids: ${seats.join(', ')}`);
  assert.strictEqual(new Set(codes).size, codes.length, `duplicate room codes: ${codes.join(', ')}`);
  assert.ok(codes.every((c) => WORDS.includes(c)), 'every code came from the word list');
});

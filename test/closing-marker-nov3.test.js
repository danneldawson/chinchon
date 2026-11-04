'use strict';

// Nov 3, 2026 (Dannel: "place a distinctive marker when someone is in the
// process of closing"). A player in close mode shows a pulsing "Closing…" /
// "Cerrando…" badge on their seat to everyone else; it clears when the close
// (or any discard) completes. Bots get the same badge during the replay.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const { createServer } = require('../server');

let server; let base;
const api = (method, p, body) => fetch(base + p, {
  method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const state = (code, seat) => api('GET', `/api/state?code=${code}&seat=${seat}`).then((r) => r.json);

test.before(async () => {
  process.env.CHINCHON_TEST_HOOKS = '1';
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { delete process.env.CHINCHON_TEST_HOOKS; if (server) server.close(); });

async function twoHumansAtDiscard() {
  const { json: a } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Dan' });
  const { json: b } = await api('POST', '/api/room/join', { code: a.code, name: 'Ana' });
  await api('POST', '/api/room/start', { code: a.code, seat: a.seatId });
  const seats = [a.seatId, b.seatId];
  for (const s of seats) {
    const v = await state(a.code, s);
    if (v.isYourTurn && v.phase === 'draw') {
      await api('POST', '/api/draw', { code: a.code, seat: s, from: 'stock' });
      return { code: a.code, me: s, other: seats.find((x) => x !== s) };
    }
  }
  throw new Error('nobody on turn');
}

test('close mode shows on the closer\'s seat for everyone, and clears on cancel and after the discard', async () => {
  const { code, me, other } = await twoHumansAtDiscard();
  const before = await state(code, other);
  assert.strictEqual(before.closingSeat, null);
  assert.strictEqual((await api('POST', '/api/close-intent', { code, seat: other, closing: true })).status, 400, 'only the player on turn');
  assert.strictEqual((await api('POST', '/api/close-intent', { code, seat: me, closing: true })).status, 200);
  const ov = await state(code, other);
  const meSeat = (await state(code, me)).opponents.find((o) => o.isYou).seat;
  assert.strictEqual(ov.closingSeat, meSeat);
  assert.strictEqual(ov.opponents.find((o) => o.seat === meSeat).closing, true);
  await api('POST', '/api/close-intent', { code, seat: me, closing: false });
  assert.strictEqual((await state(code, other)).closingSeat, null, 'Cancel clears it');
  await api('POST', '/api/close-intent', { code, seat: me, closing: true });
  const mv = await state(code, me);
  await api('POST', '/api/discard', { code, seat: me, cardId: mv.yourHand[0].id });
  assert.strictEqual((await state(code, other)).closingSeat, null, 'gone once the turn is over');
});

test('client: badge text in both languages, pulsing gold CSS, sent on close-mode change, bots in replay', () => {
  assert.match(APP, /closingBadge: '🔒 Closing…'/);
  assert.match(APP, /closingBadge: '🔒 Cerrando…'/);
  assert.match(APP, /\/api\/close-intent/);
  assert.match(APP, /syncCloseIntent\(\);/);
  assert.match(APP, /state\.shadow\.closingSeat = step\.seat;/, 'a bot close replays with the badge first');
  assert.match(CSS, /\.closing-badge \{[^}]*animation: closing-pulse/);
  assert.match(CSS, /\.closing-badge \{[^}]*background: #f5c542/);
});

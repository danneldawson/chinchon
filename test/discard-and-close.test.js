'use strict';

// Discard & close (Dannel). With 8 cards and a legal close somewhere:
//   - each card says whether throwing it leaves a close (no meld lists)
//   - throwing a legal card with close:true and no melds discards it and
//     commits the close; the other seven are arranged next
//   - a bad confirm stays in that arrange step and does not reopen discard
//   - a normal discard (close omitted) still just throws the card
//   - the arrange screen offers Make meld and Confirm only

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { createServer } = require('../server');
let server;
let base;
const api = (method, p, body) => fetch(base + p, {
  method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const state = (code, seat) => api('GET', `/api/state?code=${code}&seat=${seat}`).then((r) => r.json);

const CLOSER8 = ['5-Copas-0', '6-Copas-0', '7-Copas-0', '11-Oros-0', '11-Espadas-0', '11-Bastos-0', '2-Bastos-0', '12-Espadas-0'];
const GOOD = [['5-Copas-0', '6-Copas-0', '7-Copas-0'], ['11-Oros-0', '11-Espadas-0', '11-Bastos-0']];

test.before(async () => {
  process.env.CHINCHON_TEST_HOOKS = '1';
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { delete process.env.CHINCHON_TEST_HOOKS; if (server) server.close(); });

async function discardTurn(mode) {
  const { json: created } = await api('POST', '/api/room/new', { mode, name: 'You', bots: mode === 'solo' ? 2 : 0 });
  const code = created.code;
  let me = created.seatId;
  let other = null;
  if (mode === 'multi') {
    const joined = await api('POST', '/api/room/join', { code, name: 'Ana' });
    other = joined.json.seatId;
    await api('POST', '/api/room/start', { code, seat: me });
  }
  const seats = other ? [me, other] : [me];
  for (const s of seats) {
    const v = await state(code, s);
    if (v.isYourTurn && v.phase === 'draw') {
      await api('POST', '/api/draw', { code, seat: s, from: 'stock' });
      return { code, me: s, other };
    }
    if (v.isYourTurn && v.phase === 'discard') return { code, me: s, other };
  }
  throw new Error('no human discard turn');
}

async function rigged(mode) {
  const seat = await discardTurn(mode);
  const rig = await api('POST', '/api/test/rig', { code: seat.code, seat: seat.me, cardIds: CLOSER8 });
  assert.strictEqual(rig.status, 200);
  return seat;
}

test('closeCards marks each of the 8 throws, and hides that list from the other player', async () => {
  const { code, me, other } = await rigged('multi');
  const v = await state(code, me);
  assert.strictEqual(v.canClose, true);
  assert.strictEqual(v.closeCards.length, 8);
  const byId = new Map(v.closeCards.map((c) => [c.id, c]));
  assert.strictEqual(byId.get('12-Espadas-0').ok, true, 'throwing the 12 leaves a close');
  assert.strictEqual(byId.get('2-Bastos-0').ok, false);
  assert.strictEqual(byId.get('2-Bastos-0').reason, 'no');
  assert.ok(!JSON.stringify(v.closeCards).includes('"split"'));
  assert.ok(!('closeOptions' in v));
  const them = await state(code, other);
  assert.strictEqual(them.closeCards, null);
});

test('Discard & close commits the throw; a bad confirm stays in arrange; a good one lays the melds', async () => {
  const { code, me } = await rigged('multi');
  const refused = await api('POST', '/api/discard', { code, seat: me, cardId: '2-Bastos-0', close: true });
  assert.strictEqual(refused.status, 400);
  assert.strictEqual(refused.json.error, 'throwing this card does not close');
  assert.strictEqual((await state(code, me)).phase, 'discard', 'a refused throw changes nothing');

  const ok = await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.phase, 'arrange');
  assert.strictEqual(ok.json.yourHand.length, 7);
  assert.ok(!ok.json.yourHand.some((c) => c.id === '12-Espadas-0'));
  assert.strictEqual(ok.json.discardTop.id, '12-Espadas-0');
  assert.strictEqual(ok.json.isYourTurn, true);
  assert.strictEqual(ok.json.closeCards, null, 'the throw is already done');

  const bad = await api('POST', '/api/close-confirm', {
    code, seat: me, melds: [['5-Copas-0', '6-Copas-0', '11-Oros-0']],
  });
  assert.strictEqual(bad.status, 400);
  const stayed = await state(code, me);
  assert.strictEqual(stayed.phase, 'arrange', 'a bad layout does not reopen discard');
  assert.strictEqual(stayed.yourHand.length, 7);
  assert.strictEqual(stayed.discardTop.id, '12-Espadas-0');

  const done = await api('POST', '/api/close-confirm', { code, seat: me, melds: GOOD });
  assert.strictEqual(done.status, 200);
  assert.ok(done.json.layoff, 'confirm starts the lay-off');
  assert.notStrictEqual(done.json.phase, 'arrange');
  assert.notStrictEqual(done.json.phase, 'discard');
});

test('a plain discard still throws the card and does not close', async () => {
  const { code, me } = await rigged('multi');
  const r = await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.phase, 'draw', 'play continues');
  assert.ok(!r.json.layoff);
  assert.strictEqual(r.json.discardTop.id, '12-Espadas-0');
});

test('solo uses the same Discard & close commit', async () => {
  const { code, me } = await rigged('solo');
  const ok = await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.phase, 'arrange');
  assert.strictEqual(ok.json.yourHand.length, 7);
  const done = await api('POST', '/api/close-confirm', { code, seat: me, melds: GOOD });
  assert.strictEqual(done.status, 200, done.json && done.json.error);
  // Solo bots play their lay-off turns immediately, so the closer may already
  // be looking at the lay-off, or the round may have paused on the felt.
  assert.ok(done.json.layoff || done.json.roundEnd, done.json.phase);
  assert.notStrictEqual(done.json.phase, 'arrange');
  assert.notStrictEqual(done.json.phase, 'discard');
});

test('the arrange step offers only Confirm, and a legal selection groups itself', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const arrange = js.slice(js.indexOf('if (arranging && cm && cm.arrange)'), js.indexOf('} else {', js.indexOf('if (arranging && cm && cm.arrange)')));
  assert.match(arrange, /btn-close-confirm/);
  assert.ok(!/btn-make-meld|btn-discard-close|btn-discard-plain|btn-close-mode|btn-close-cancel|undo/.test(arrange), arrange);
  assert.match(js, /if \(legalMeld\(chosen\)\)/);
  assert.match(js, /function arrangeTap/);
  const { isValidMeld } = require('../src/melds');
  const start = js.indexOf('function legalMeld(');
  const legalMeld = new Function(`${js.slice(start, js.indexOf('window.__legalMeld', start))}\nreturn legalMeld;`)();
  const c = (rank, suit) => ({ rank, suit, id: `${rank}-${suit}` });
  const samples = [
    [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')],
    [c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')],
    [c(11, 'Copas'), c(12, 'Copas'), c(1, 'Copas')],
    [c(12, 'Copas'), c(1, 'Copas'), c(2, 'Copas')],
    [c(5, 'Copas'), c(6, 'Copas'), c(1, 'Oros')],
    [c(5, 'Copas'), c(5, 'Copas'), c(7, 'Copas')],
    [c(4, 'Oros'), c(4, 'Copas')],
  ];
  for (const cards of samples) {
    assert.strictEqual(legalMeld(cards), isValidMeld(cards), cards.map((x) => x.id).join(','));
  }
});

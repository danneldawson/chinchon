'use strict';

// Card-based close (Dannel, Oct 8, 2026).
//   - The closer lays out their OWN melds; the server judges exactly that
//     declaration (scoring.validateDeclaredClose). No decompositions or meld
//     hints ever leave the server: only canClose (the rules gate).
//   - An invalid declaration is a false close (R24): the hand is shown to
//     everyone and play continues.
//   - A chinchon hand laid down as 4+3 scores as declared (-10); a chinchon is
//     only one declared 7-card group.
//   - The closer's leftover (and so their score) follows the declaration, not
//     the engine's own split (regression: it used to score -10 regardless).
//   - Lay-off: table melds carry their owner seat; tap-to-attach uses
//     /api/layoff/attach; Suggest/Auto are gone from the client and the API.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { validateDeclaredClose } = require('../src/scoring');
const lo = require('../src/layoff-interactive');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });
const ids = (cards) => cards.map((x) => x.id);

// ------------------------------------------------------------ validator: accept

test('declared close: 4+3 covering all 7 is a clean close (-10)', () => {
  const set4 = [c(4, 'Oros'), c(4, 'Copas'), c(4, 'Espadas'), c(4, 'Bastos')];
  const run3 = [c(10, 'Oros'), c(11, 'Oros'), c(12, 'Oros')];
  const v = validateDeclaredClose([...set4, ...run3], [set4, run3]);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.kind, 'clean');
  assert.strictEqual(v.score, -10);
  assert.deepStrictEqual(v.leftovers, []);
});

test('declared close: 3+3 plus one leftover worth <=5 scores that card', () => {
  const a = [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  const b = [c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')];
  const v = validateDeclaredClose([...a, ...b, c(2, 'Bastos')], [a, b]);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.kind, 'leftover');
  assert.strictEqual(v.score, 2);
  assert.deepStrictEqual(ids(v.leftovers), ['2-Bastos-0']);
});

test('declared close: one 6-card meld plus a leftover <=5 is legal (R19)', () => {
  const run6 = [1, 2, 3, 4, 5, 6].map((r) => c(r, 'Espadas'));
  const v = validateDeclaredClose([...run6, c(3, 'Copas')], [run6]);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.score, 3);
});

test('declared close: all 7 in ONE group is a chinchon', () => {
  const run7 = [1, 2, 3, 4, 5, 6, 7].map((r) => c(r, 'Bastos'));
  const v = validateDeclaredClose(run7, [run7]);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.kind, 'chinchon');
});

test('declared close: a chinchon hand laid down as 4+3 scores as declared (-10, not chinchon)', () => {
  const run7 = [1, 2, 3, 4, 5, 6, 7].map((r) => c(r, 'Bastos'));
  const v = validateDeclaredClose(run7, [run7.slice(0, 4), run7.slice(4)]);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.kind, 'clean');
  assert.strictEqual(v.score, -10);
});

test('declared close: the wild left over closes for 0 (R38)', () => {
  const a = [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  const b = [c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')];
  const v = validateDeclaredClose([...a, ...b, c(1, 'Oros')], [a, b]);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.score, 0);
});

// ------------------------------------------------------------ validator: reject

const seven = () => [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'), c(2, 'Bastos')];

test('declared close rejects: a group that is not a meld', () => {
  const h = seven();
  const v = validateDeclaredClose(h, [[h[0], h[3], h[6]], [h[1], h[2], h[4]]]);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.badGroup, 0);
});

test('declared close rejects: two wilds in one meld', () => {
  const h = [c(1, 'Oros', 0), c(1, 'Oros', 1), c(5, 'Copas'), c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'), c(2, 'Bastos')];
  const v = validateDeclaredClose(h, [[h[0], h[1], h[2]], [h[3], h[4], h[5]]]);
  assert.strictEqual(v.ok, false);
});

test('declared close rejects: a group of two cards', () => {
  const h = seven();
  const v = validateDeclaredClose(h, [[h[0], h[1]], [h[3], h[4], h[5]]]);
  assert.strictEqual(v.ok, false);
});

test('declared close rejects: a leftover worth 6 or more', () => {
  const h = [...seven().slice(0, 6), c(12, 'Copas')];
  const v = validateDeclaredClose(h, [h.slice(0, 3), h.slice(3, 6)]);
  assert.strictEqual(v.ok, false);
  assert.match(v.reason, /exceeds 5/);
});

test('declared close rejects: more than one leftover card', () => {
  const h = seven();
  const v = validateDeclaredClose(h, [h.slice(0, 3)]);
  assert.strictEqual(v.ok, false);
  assert.match(v.reason, /too many leftover/);
});

test('declared close rejects: no groups, a card not held, a card used twice', () => {
  const h = seven();
  assert.strictEqual(validateDeclaredClose(h, []).ok, false);
  assert.strictEqual(validateDeclaredClose(h, [[h[0], h[1], c(4, 'Copas')], h.slice(3, 6)]).ok, false);
  assert.strictEqual(validateDeclaredClose(h, [h.slice(0, 3), [h[2], h[3], h[4]]]).ok, false);
});

// ------------------------------------------------------- lay-off follows the declaration

test('closer leftover regression: a declared non-best split keeps its leftover and scores it (not -10)', () => {
  // 1C 2C 3C 4C + 4E 4B 4O: the engine would meld all 7 (clean). The closer
  // declares 2-3-4 Copas + 4-4-4 and keeps the 1 de Copas -> scores 1.
  const closer = [c(1, 'Copas'), c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(4, 'Espadas'), c(4, 'Bastos'), c(4, 'Oros')];
  const other = [c(12, 'Copas'), c(12, 'Espadas'), c(10, 'Bastos'), c(7, 'Oros'), c(6, 'Espadas'), c(5, 'Bastos'), c(3, 'Oros')];
  const decl = validateDeclaredClose(closer, [[closer[1], closer[2], closer[3]], [closer[4], closer[5], closer[6]]]);
  assert.strictEqual(decl.ok, true);
  const s = lo.beginLayoff([closer, other], 0, [0, 1], decl);
  assert.deepStrictEqual(ids(s.remaining[0]), ['1-Copas-0'], 'the undeclared card is all the closer holds');
  assert.deepStrictEqual(s.owners, [0, 0]);
  lo.declareReady(s); // closer
  assert.strictEqual(s.scores[0], 1, 'closer pays the declared leftover');
});

test('a declared clean close still scores -10; a chinchon hand declared 4+3 lays off normally', () => {
  const run7 = [1, 2, 3, 4, 5, 6, 7].map((r) => c(r, 'Bastos'));
  const other = [c(12, 'Copas'), c(12, 'Espadas'), c(10, 'Bastos'), c(7, 'Oros'), c(6, 'Espadas'), c(5, 'Oros'), c(3, 'Oros')];
  const decl = validateDeclaredClose(run7, [run7.slice(0, 4), run7.slice(4)]);
  const s = lo.beginLayoff([run7, other], 0, [0, 1], decl);
  assert.strictEqual(s.phase, 'layoff', 'not a chinchon: the lay-off happens');
  assert.strictEqual(s.chinchon, false);
  lo.declareReady(s);
  assert.strictEqual(s.scores[0], -10);
});

test('R29 last word with declared melds: the closer sheds the leftover on the wrap and scores 0', () => {
  const closer = [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'), c(2, 'Bastos')];
  const other = [c(2, 'Espadas'), c(2, 'Oros'), c(2, 'Copas'), c(4, 'Copas'), c(11, 'Copas'), c(12, 'Bastos'), c(10, 'Oros')];
  const decl = validateDeclaredClose(closer, [closer.slice(0, 3), closer.slice(3, 6)]);
  const s = lo.beginLayoff([closer, other], 0, [0, 1], decl);
  assert.ok(lo.passTurn(s).ok, 'closer: Not yet');
  assert.ok(lo.layMeld(s, [other[0], other[1], other[2]]).ok);
  assert.ok(lo.attachCard(s, other[3], 0).ok, '4 de Copas onto 5-6-7');
  assert.deepStrictEqual(s.table[0].map((x) => x.rank), [4, 5, 6, 7], 'runs are kept in rank order');
  assert.ok(lo.attachCard(s, other[4], 1).ok, '11 de Copas onto the 11s');
  assert.deepStrictEqual(s.owners, [0, 0, 1]);
  lo.declareReady(s);
  assert.strictEqual(s.scores[1], 20);
  assert.strictEqual(lo.currentPlayer(s), 0, 'wraps back to the closer');
  assert.ok(lo.attachCard(s, closer[6], 2).ok, 'closer sheds the 2 onto 2-2-2');
  lo.declareReady(s);
  assert.strictEqual(s.scores[0], 0);
  assert.strictEqual(s.phase, 'done');
});

// ------------------------------------------------------------------- HTTP

const { createServer, rooms } = require('../server');
let server;
let base;
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

// Two humans; returns the seat whose turn it is (after drawing) and the other.
async function twoHumansAtDiscard() {
  const { json: a } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Dan' });
  const { json: b } = await api('POST', '/api/room/join', { code: a.code, name: 'Ana' });
  await api('POST', '/api/room/start', { code: a.code, seat: a.seatId });
  const code = a.code;
  const seats = [a.seatId, b.seatId];
  for (const s of seats) {
    const v = await state(code, s);
    if (v.isYourTurn && v.phase === 'draw') {
      await api('POST', '/api/draw', { code, seat: s, from: 'stock' });
      return { code, me: s, other: seats.find((x) => x !== s) };
    }
  }
  throw new Error('nobody on turn');
}
const rig = (code, seat, cardIds) => api('POST', '/api/test/rig', { code, seat, cardIds });
const CLOSER8 = ['5-Copas-0', '6-Copas-0', '7-Copas-0', '11-Oros-0', '11-Espadas-0', '11-Bastos-0', '2-Bastos-0', '12-Espadas-0'];

test('HTTP: canClose is the only close signal; no decompositions or meld hints are sent', async () => {
  const { code, me } = await twoHumansAtDiscard();
  assert.strictEqual((await rig(code, me, CLOSER8)).status, 200);
  const v = await state(code, me);
  assert.strictEqual(v.canClose, true);
  assert.ok(!('closeOptions' in v), 'no closeOptions');
  assert.ok(!('yourMelds' in v), 'no yourMelds');
  assert.ok(!JSON.stringify(v).includes('"split"'), 'no split anywhere in the view');
  assert.strictEqual(typeof v.yourDeadwood, 'number', 'deadwood is kept');
  assert.strictEqual((await api('GET', `/api/layoff/suggest?code=${code}&seat=${me}`)).status, 404, 'suggest route is gone');
  assert.strictEqual((await api('POST', '/api/layoff/auto', { code, seat: me })).status, 404, 'auto route is gone');
});

test('HTTP: declared melds go on the table exactly as declared; tap-to-attach, Not yet and Ready all work', async () => {
  const { code, me, other } = await twoHumansAtDiscard();
  await rig(code, me, CLOSER8);
  await rig(code, other, ['2-Espadas-0', '2-Oros-0', '2-Copas-0', '4-Copas-0', '11-Copas-0', '12-Bastos-0', '10-Oros-0']);
  const melds = [['7-Copas-0', '5-Copas-0', '6-Copas-0'], ['11-Oros-0', '11-Espadas-0', '11-Bastos-0']];
  const r = await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true, melds });
  assert.strictEqual(r.status, 200);
  const l = r.json.layoff;
  assert.deepStrictEqual(l.table.map(ids), [['5-Copas-0', '6-Copas-0', '7-Copas-0'], melds[1]], 'the declared groups (run shown in rank order)');
  const meSeat = r.json.opponents.find((o) => o.isYou).seat;
  assert.deepStrictEqual(l.owners, [meSeat, meSeat]);
  assert.deepStrictEqual(ids(l.yourRemaining), ['2-Bastos-0'], 'closer holds only the undeclared card');
  // Opponent view: the same table, owner seats included.
  const ov = await state(code, other);
  assert.deepStrictEqual(ov.layoff.table.map(ids), l.table.map(ids));
  // Closer: Not yet (used to crash the server: `room` was undefined).
  assert.strictEqual((await api('POST', '/api/layoff/pass', { code, seat: me })).status, 200);
  assert.strictEqual((await api('POST', '/api/layoff/lay', { code, seat: other, cardIds: ['2-Espadas-0', '2-Oros-0', '2-Copas-0'] })).status, 200);
  const bad = await api('POST', '/api/layoff/attach', { code, seat: other, cardId: '12-Bastos-0', meldIndex: 0 });
  assert.strictEqual(bad.status, 400, 'a card that does not fit is rejected');
  assert.strictEqual((await api('POST', '/api/layoff/attach', { code, seat: other, cardId: '4-Copas-0', meldIndex: 0 })).status, 200);
  const ready = await api('POST', '/api/layoff/ready', { code, seat: other });
  assert.strictEqual(ready.status, 200, 'Ready works (used to crash the server)');
  assert.strictEqual((await api('POST', '/api/layoff/attach', { code, seat: me, cardId: '2-Bastos-0', meldIndex: 2 })).status, 200);
  const done = await api('POST', '/api/layoff/ready', { code, seat: me });
  assert.strictEqual(done.status, 200);
  // Closer shed their leftover on the wrap (R29): 0. Ana kept 11C + 12B + 10O = 30.
  const totals = Object.fromEntries(done.json.scoreboard.map((p) => [p.id === me ? 'closer' : 'other', p.total]));
  assert.deepStrictEqual(totals, { closer: 0, other: 30 });
});

test('HTTP: an invalid declaration is a false close: hand shown to everyone, play continues, nobody scores', async () => {
  const { code, me, other } = await twoHumansAtDiscard();
  await rig(code, me, CLOSER8);
  const before = await state(code, me);
  const r = await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true, melds: [['5-Copas-0', '11-Oros-0', '2-Bastos-0']] });
  assert.strictEqual(r.status, 200);
  const o = await state(code, other);
  assert.ok(o.falseClose, 'the other player sees the false close');
  assert.strictEqual(o.falseClose.name, before.scoreboard.find((p) => p.id === me).name);
  assert.deepStrictEqual(ids(o.falseClose.hand).sort(), CLOSER8.filter((x) => x !== '12-Espadas-0').sort(), 'the 7 kept cards, face up');
  assert.strictEqual(o.isYourTurn, true, 'play continues with the next player');
  assert.strictEqual(o.phase, 'draw');
  assert.strictEqual(o.layoff, null, 'no lay-off');
  assert.deepStrictEqual(o.scoreboard.map((p) => p.total), [0, 0], 'nobody scores');
  // The shown hand stays up until the false-closer discards again.
  await api('POST', '/api/draw', { code, seat: other, from: 'stock' });
  const ov = await state(code, other);
  await api('POST', '/api/discard', { code, seat: other, cardId: ov.yourHand[0].id });
  assert.ok((await state(code, other)).falseClose, 'still shown during the lap');
  await api('POST', '/api/draw', { code, seat: me, from: 'stock' });
  const mv = await state(code, me);
  await api('POST', '/api/discard', { code, seat: me, cardId: mv.yourHand[0].id });
  assert.strictEqual((await state(code, other)).falseClose, null, 'cleared after their next discard');
});

test('HTTP: malformed close requests are refused without changing anything', async () => {
  const { code, me } = await twoHumansAtDiscard();
  await rig(code, me, CLOSER8);
  const g = [['5-Copas-0', '6-Copas-0', '7-Copas-0'], ['11-Oros-0', '11-Espadas-0', '11-Bastos-0']];
  assert.strictEqual((await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true })).status, 400, 'no melds');
  assert.strictEqual((await api('POST', '/api/discard', { code, seat: me, cardId: '7-Copas-0', close: true, melds: g })).status, 400, 'discard inside a meld');
  assert.strictEqual((await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true, melds: [g[0], ['11-Oros-0', '11-Espadas-0', '9-Bastos-0']] })).status, 400, 'card not held');
  assert.strictEqual((await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true, melds: [g[0], ['7-Copas-0', '11-Oros-0', '11-Espadas-0']] })).status, 400, 'card twice');
  const v = await state(code, me);
  assert.strictEqual(v.phase, 'discard');
  assert.strictEqual(v.isYourTurn, true);
  assert.strictEqual(v.yourHand.length, 8);
  assert.strictEqual(v.falseClose, null);
});

test('HTTP: a chinchon is only a single declared 7-card group', async () => {
  const run7 = ['1-Bastos-0', '2-Bastos-0', '3-Bastos-0', '4-Bastos-0', '5-Bastos-0', '6-Bastos-0', '7-Bastos-0'];
  const first = await twoHumansAtDiscard();
  await rig(first.code, first.me, [...run7, '12-Copas-0']);
  const split = await api('POST', '/api/discard', { code: first.code, seat: first.me, cardId: '12-Copas-0', close: true, melds: [run7.slice(0, 4), run7.slice(4)] });
  assert.strictEqual(split.json.gameOver, false, '4+3 is not a chinchon');
  assert.strictEqual(split.json.layoff.phase, 'layoff');
  const second = await twoHumansAtDiscard();
  await rig(second.code, second.me, [...run7, '12-Copas-0']);
  const one = await api('POST', '/api/discard', { code: second.code, seat: second.me, cardId: '12-Copas-0', close: true, melds: [run7] });
  assert.strictEqual(one.json.gameOver, true, 'one 7-card group wins the match');
  assert.strictEqual(one.json.chinchonWin, true);
});

test('the test hook does not exist unless CHINCHON_TEST_HOOKS=1', async () => {
  delete process.env.CHINCHON_TEST_HOOKS;
  try {
    const r = await api('POST', '/api/test/rig', { code: 'NONE', seat: 'x', cardIds: [] });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.json.error, 'unknown api route');
  } finally { process.env.CHINCHON_TEST_HOOKS = '1'; }
});

// ------------------------------------------------------------------- client

const pub = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');

test('client: no close decompositions, Keep playing, Suggest or Auto remain', () => {
  for (const gone of ['closeOptions', 'splitIdx', 'yourMelds', 'keepPlaying', "'suggest'", 'layoff/suggest', "doLayoffAction('auto'"]) {
    assert.ok(!js.includes(gone), `app.js still has ${gone}`);
  }
  for (const id of ['close-offer', 'btn-close-accept', 'btn-close-continue', 'btn-layoff-auto', 'btn-layoff-suggest', 'layoff-table']) {
    assert.ok(!html.includes(`id="${id}"`), `index.html still has #${id}`);
  }
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'src', 'hints.js')), 'dead hints.js removed');
});

test('client: close mode sends the player-built melds; tap-to-attach posts to /api/layoff/attach', () => {
  assert.match(js, /if \(close\) body\.melds = melds \|\| \[\];/);
  assert.match(js, /doDiscard\(card, true, melds\)/);
  assert.match(js, /doLayoffAction\('attach', \{ cardId: \[\.\.\.state\.selected\]\[0\], meldIndex \}\)/);
  assert.ok(html.includes('id="felt-melds"') && html.includes('id="false-close"'));
  // The Close button is only rendered behind the server's canClose gate.
  assert.match(js, /if \(discarding && v\.canClose\) \{/);
});

test('client: close-mode and lay-off strings exist in English and Spanish', () => {
  const block = (lang) => js.slice(js.indexOf(`  ${lang}: {`), js.indexOf('\n  },', js.indexOf(`  ${lang}: {`)));
  for (const key of ['makeMeld', 'discardClose', 'cancel', 'pickOneDiscard', 'needMeld', 'falseClose', 'handShown', 'attachHelp']) {
    assert.match(block('en'), new RegExp(`\\b${key}:`), `en.${key}`);
    assert.match(block('es'), new RegExp(`\\b${key}:`), `es.${key}`);
  }
});

test('client (Oct 8 clean-up): no "N cards" under seat names and no standing close-mode instructions', () => {
  // Everybody always holds 7 cards, so seats show only the name (+ "out" when eliminated).
  assert.ok(!/cardsCount/.test(js), 'cardsCount string removed');
  assert.ok(!/o\.handCount\} /.test(js), 'hand count not printed under the seat name');
  assert.match(js, /\(o\.out \? `<div class="seat-count">\$\{t\('out'\)\}<\/div>` : ''\)/);
  // Close mode shows only the buttons; a message appears only after a wrong tap.
  assert.ok(!/closeHelp/.test(js), 'closeHelp instruction removed');
  assert.match(js, /if \(cm\.msg\) \{\n\s+const help = document\.createElement\('div'\);/);
});

'use strict';

// Watched turns (Oct 8, 2026): the server records each draw, discard, close,
// false close and lay-off action as a numbered step. Clients replay from a cursor.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createServer, rooms, _internals } = require('../server');
const { pushStep, stepsFor } = require('../src/steps');

const pub = (c) => ({ id: c.id, suit: c.suit, rank: c.rank, deckId: c.deckId });

test('stepsFor hides a stock card from everyone but the drawer, except the open tutorial bot', () => {
  const room = {
    tutorial: true,
    players: [{}, { reveal: true }, { reveal: false }],
    steps: [],
  };
  const card = { id: '3-Oros-0', suit: 'Oros', rank: 3, deckId: 0 };
  pushStep(room, { type: 'draw', seat: 1, from: 'stock', card });
  pushStep(room, { type: 'draw', seat: 2, from: 'stock', card });
  pushStep(room, { type: 'draw', seat: 0, from: 'discard', card });
  pushStep(room, { type: 'discard', seat: 0, card });

  const open = stepsFor(room, 0, 0);
  assert.strictEqual(open.snap, false);
  assert.ok(open.steps[0].card && open.steps[0].card.id === '3-Oros-0', 'open tutorial bot is face up');
  assert.strictEqual(open.steps[1].card, null, 'hidden stock draw has no card');
  assert.ok(open.steps[2].card && open.steps[2].card.id, 'a taken upcard is public');
  assert.ok(open.steps[3].card && open.steps[3].card.id, 'a discard is public');

  const drawer = stepsFor(room, 0, 2);
  assert.ok(drawer.steps[1].card && drawer.steps[1].card.id === '3-Oros-0', 'the drawer sees their own stock card');

  const caughtUp = stepsFor(room, room.stepSeq, 0);
  assert.strictEqual(caughtUp.snap, false);
  assert.deepStrictEqual(caughtUp.steps, []);

  const freshTab = stepsFor(room, undefined, 0);
  assert.strictEqual(freshTab.snap, true);
  assert.deepStrictEqual(freshTab.steps, []);
});

test('stepsFor snaps when the cursor is older than the log or more than one circuit behind', () => {
  const room = { players: [{}, {}, {}], steps: [] };
  for (let i = 0; i < 4; i++) pushStep(room, { type: 'draw', seat: i % 3, from: 'stock', card: { id: 'a' + i, suit: 'Oros', rank: 1, deckId: 0 } });
  assert.strictEqual(stepsFor(room, 0, 0).snap, false, 'a short gap replays');
  for (let i = 0; i < 6; i++) pushStep(room, { type: 'discard', seat: i % 3, card: { id: 'b' + i, suit: 'Copas', rank: 2, deckId: 0 } });
  // 4 draws + 6 discards = 10 play steps, and one circuit of 3 players is 6.
  assert.strictEqual(stepsFor(room, 0, 0).snap, true, 'more than one circuit snaps');
  const oldest = room.steps[0].seq;
  room.steps.splice(0, room.steps.length - 1);
  assert.strictEqual(stepsFor(room, oldest - 2, 0).snap, true, 'a cursor the log no longer covers snaps');
});

// ------------------------------------------------------------------- HTTP

let server;
let base;
const api = (method, p, body) => fetch(base + p, {
  method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const state = (code, seat, since) => api('GET', `/api/state?code=${code}&seat=${seat}${since == null ? '' : `&since=${since}`}`).then((r) => r.json);

test.before(async () => {
  process.env.CHINCHON_TEST_HOOKS = '1';
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { delete process.env.CHINCHON_TEST_HOOKS; if (server) server.close(); });

const CLEAN = ['1-Copas-0', '2-Copas-0', '3-Copas-0', '4-Copas-0', '10-Oros-0', '10-Copas-0', '10-Espadas-0'];

test('HTTP solo: both bots are draw-then-discard, and a stock card is hidden', async () => {
  const { json: room } = await api('POST', '/api/room/new', { mode: 'solo', name: 'Dan' });
  const code = room.code;
  const seat = room.seatId;
  const first = await state(code, seat);
  assert.strictEqual(first.snap, true, 'a new tab snaps');
  assert.deepStrictEqual(first.steps, []);
  const cursor = first.stepSeq;

  let v = await state(code, seat, cursor);
  assert.strictEqual(v.isYourTurn, true);
  if (v.phase === 'draw') await api('POST', '/api/draw', { code, seat, from: 'stock' });
  v = await state(code, seat, cursor);
  const card = v.yourHand[v.yourHand.length - 1];
  const res = await api('POST', '/api/discard', { code, seat, cardId: card.id });
  assert.strictEqual(res.status, 200);
  const after = await state(code, seat, cursor);
  assert.strictEqual(after.snap, false);
  const me = after.opponents.find((o) => o.isYou).seat;
  const bots = after.steps.filter((s) => s.seat !== me);
  const types = bots.map((s) => s.type);
  if (!types.includes('close')) assert.deepStrictEqual(types, ['draw', 'discard', 'draw', 'discard']);
  else assert.ok(types.indexOf('draw') < types.indexOf('discard'));
  for (const s of bots) {
    if (s.type === 'draw' && s.from === 'stock') assert.strictEqual(s.card, null, 'stock draw hidden');
    if (s.type === 'draw' && s.from === 'discard') assert.ok(s.card && s.card.id, 'taken upcard shown');
    if (s.type === 'discard') assert.ok(s.card && s.card.id, 'discard shown');
  }
  const ownDraw = after.steps.find((s) => s.seat === me && s.type === 'draw');
  if (ownDraw && ownDraw.from === 'stock') {
    assert.ok(ownDraw.card && ownDraw.card.id, 'you see the card you drew');
    assert.ok(after.steps.some((s) => s.seat === me && s.type === 'discard'));
  }
  const caught = await state(code, seat, after.stepSeq);
  assert.deepStrictEqual(caught.steps, []);
  assert.strictEqual(caught.snap, false);
});

test('HTTP: the other human sees a face-down stock draw, a face-up taken discard, and the discard', async () => {
  const { json: a } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Dan' });
  const { json: b } = await api('POST', '/api/room/join', { code: a.code, name: 'Ana' });
  await api('POST', '/api/room/start', { code: a.code, seat: a.seatId });
  const code = a.code;
  const seats = [a.seatId, b.seatId];
  let actor = null;
  let other = null;
  for (const s of seats) {
    const v = await state(code, s);
    if (v.isYourTurn && v.phase === 'draw') { actor = s; other = seats.find((x) => x !== s); break; }
  }
  const before = (await state(code, other)).stepSeq;
  await api('POST', '/api/draw', { code, seat: actor, from: 'stock' });
  const seen = await state(code, other, before);
  const draw = seen.steps.find((s) => s.type === 'draw');
  assert.ok(draw, 'watcher got the draw step');
  assert.strictEqual(draw.from, 'stock');
  assert.strictEqual(draw.card, null, 'watcher does not see the stock card');
  const actorView = await state(code, actor, before);
  const mine = actorView.steps.find((s) => s.type === 'draw');
  assert.ok(mine.card && actorView.yourHand.some((c) => c.id === mine.card.id));

  const hand = actorView.yourHand;
  const thrown = hand.find((c) => c.id !== mine.card.id) || hand[0];
  const cursor2 = actorView.stepSeq;
  await api('POST', '/api/discard', { code, seat: actor, cardId: thrown.id });
  const afterDiscard = await state(code, other, cursor2);
  const dstep = afterDiscard.steps.find((s) => s.type === 'discard');
  assert.ok(dstep && dstep.card && dstep.card.id === thrown.id, 'discard card is public');

  // The other player takes that card off the tray.
  const takerView = await state(code, other, afterDiscard.stepSeq);
  if (takerView.isYourTurn && takerView.phase === 'draw' && takerView.discardTop) {
    const top = takerView.discardTop.id;
    await api('POST', '/api/draw', { code, seat: other, from: 'discard' });
    const back = await state(code, actor, afterDiscard.stepSeq);
    const took = back.steps.find((s) => s.type === 'draw');
    assert.ok(took && took.from === 'discard' && took.card && took.card.id === top);
  }
});

test('HTTP: a bot close records the melds, then one lay-off step per lay and Ready', async () => {
  const { json: room } = await api('POST', '/api/room/new', { mode: 'solo', name: 'Dan' });
  const code = room.code;
  const seat = room.seatId;
  let v = await state(code, seat);
  const cursor = v.stepSeq;
  if (v.phase === 'draw') await api('POST', '/api/draw', { code, seat, from: 'stock' });
  v = await state(code, seat, cursor);
  const bot = v.scoreboard.find((p) => p.isBot);
  const rig = await api('POST', '/api/test/rig', { code, seat: bot.id, cardIds: CLEAN });
  assert.strictEqual(rig.status, 200, rig.json.error || 'rig');
  const card = v.yourHand[v.yourHand.length - 1];
  await api('POST', '/api/discard', { code, seat, cardId: card.id });
  const after = await state(code, seat, cursor);
  assert.strictEqual(after.snap, false, 'a close plus one lay-off is not a whole round behind');
  const close = after.steps.find((s) => s.type === 'close');
  assert.ok(close, 'close step: ' + after.steps.map((s) => s.type).join(','));
  assert.ok(close.melds && close.melds.length >= 1 && close.melds[0].length >= 3, 'melds on the close step');
  const afterClose = after.steps.slice(after.steps.indexOf(close) + 1);
  assert.ok(afterClose.some((s) => s.type === 'ready'), 'Ready is its own step');
  assert.ok(afterClose.some((s) => s.type === 'lay' || s.type === 'ready'));
  for (const s of afterClose) {
    if (s.type === 'lay') assert.ok(s.cards && s.cards.length >= 3);
    if (s.type === 'attach') assert.ok(s.card && s.card.id && Number.isInteger(s.meldIndex));
  }
});

test('the step log round-trips through the room snapshot', async () => {
  const { json: room } = await api('POST', '/api/room/new', { mode: 'solo', name: 'Dan' });
  const v = await state(room.code, room.seatId);
  if (v.phase === 'draw') await api('POST', '/api/draw', { code: room.code, seat: room.seatId, from: 'stock' });
  const snap = JSON.parse(JSON.stringify(_internals.snapshot()));
  const saved = snap.rooms.find((r) => r.code === room.code);
  assert.ok(saved && Array.isArray(saved.steps) && saved.steps.length > 0, 'steps are on the room');
  assert.strictEqual(saved.stepSeq, saved.steps[saved.steps.length - 1].seq);
  const again = JSON.parse(JSON.stringify(saved));
  assert.deepStrictEqual(again.steps.map((s) => s.seq), saved.steps.map((s) => s.seq));
});

test('client replays steps, keeps one pace constant, and does not add a skip control', () => {
  const js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
  assert.match(js, /const STEP_MS = 800;/);
  assert.match(js, /const CATCHUP_MS = 250;/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /sessionStorage/);
  assert.match(js, /chinchon-playing/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(js, /const canAct = !!live\.isYourTurn;/);
  assert.ok(!/skip|fast-forward|btn-speed/i.test(html), 'no skip control');
  assert.ok(!html.includes('btn-watch-skip'));
});

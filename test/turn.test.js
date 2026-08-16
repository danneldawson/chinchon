'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const {
  startRound, topOfDiscard, drawFromStock, drawFromDiscard,
  discardCard, closeOptions, replenishStock, nextDealer,
} = require('../src/turn');

const c = (rank, suit, deckId = 0) => ({
  rank, suit, deckId, id: `${rank}-${suit}-${deckId}`,
});

// Deterministic shuffle for reproducible tests.
const fixedRng = () => 0.5;

// ---------------------------------------------------------------- dealing

test('a round deals 7 cards to every player', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    const s = startRound(n, fixedRng);
    assert.strictEqual(s.hands.length, n);
    for (const h of s.hands) assert.strictEqual(h.length, 7);
  }
});

test('stock plus hands plus discard always totals 80', () => {
  const s = startRound(4, fixedRng);
  const total = s.stock.length + s.discard.length + s.hands.flat().length;
  assert.strictEqual(total, 80);
});

test('seven players leaves a usable stock', () => {
  const s = startRound(7, fixedRng);
  // 80 - 49 dealt - 1 discard = 30
  assert.strictEqual(s.stock.length, 30);
});

test('player counts outside 2-7 are rejected', () => {
  assert.throws(() => startRound(1, fixedRng));
  assert.throws(() => startRound(8, fixedRng));
});

test('the round opens in the draw phase', () => {
  const s = startRound(3, fixedRng);
  assert.strictEqual(s.phase, 'draw');
});

test('dealing is clockwise from the dealer and everyone gets 7', () => {
  const s = startRound(5, fixedRng, 2);
  for (const h of s.hands) assert.strictEqual(h.length, 7);
  const ids = new Set(s.hands.flat().map((x) => x.id));
  assert.strictEqual(ids.size, 35, 'no card dealt twice');
});

// ---------------------------------------------------------------- drawing

test('drawing from stock gives an 8th card and moves to discard phase', () => {
  const s = startRound(2, fixedRng);
  const before = s.stock.length;
  const res = drawFromStock(s);
  assert.ok(res.ok);
  assert.strictEqual(s.hands[0].length, 8);
  assert.strictEqual(s.stock.length, before - 1);
  assert.strictEqual(s.phase, 'discard');
});

test('drawing from the discard pile takes the visible top card', () => {
  const s = startRound(2, fixedRng);
  const top = topOfDiscard(s);
  const res = drawFromDiscard(s);
  assert.ok(res.ok);
  assert.strictEqual(res.card.id, top.id);
  assert.ok(s.hands[0].some((x) => x.id === top.id));
});

test('you cannot draw twice in one turn', () => {
  const s = startRound(2, fixedRng);
  drawFromStock(s);
  const res = drawFromStock(s);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /not the draw phase/);
});

test('you cannot discard before drawing', () => {
  const s = startRound(2, fixedRng);
  const res = discardCard(s, s.hands[0][0]);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /not the discard phase/);
});

// ---------------------------------------------------------------- discarding

test('discarding returns you to 7 cards and passes the turn', () => {
  const s = startRound(3, fixedRng);
  drawFromStock(s);
  const res = discardCard(s, s.hands[0][0]);
  assert.ok(res.ok);
  assert.strictEqual(s.hands[0].length, 7);
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.phase, 'draw');
});

test('the discarded card lands on top of the pile', () => {
  const s = startRound(2, fixedRng);
  drawFromStock(s);
  const thrown = s.hands[0][2];
  discardCard(s, thrown);
  assert.strictEqual(topOfDiscard(s).id, thrown.id);
});

test('you cannot discard a card you do not hold', () => {
  const s = startRound(2, fixedRng);
  drawFromStock(s);
  const res = discardCard(s, c(99, 'Fake'));
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /do not hold/);
});

test('a card taken from the discard MAY be thrown straight back', () => {
  const s = startRound(2, fixedRng);
  const taken = drawFromDiscard(s).card;
  const res = discardCard(s, taken);
  assert.strictEqual(res.ok, true, 'you may change your mind and drop it');
});

test('the dealer plays last, the player to their left leads', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    const st = startRound(n, fixedRng);
    assert.strictEqual(st.dealer, n - 1, 'default dealer is the last seat');
    assert.strictEqual(st.turn, 0, 'player to the dealer left leads');
  }
});

test('an explicit dealer sets who leads', () => {
  const st = startRound(4, fixedRng, 1);
  assert.strictEqual(st.dealer, 1);
  assert.strictEqual(st.turn, 2, 'the seat after the dealer leads');
});

test('the deal rotates to the left each round', () => {
  let st = startRound(4, fixedRng);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    seen.push(st.dealer);
    st = startRound(4, fixedRng, nextDealer(st));
  }
  assert.deepStrictEqual(seen, [3, 0, 1, 2, 3]);
});

test('one card is always turned face up at the deal', () => {
  for (const n of [2, 4, 7]) {
    const st = startRound(n, fixedRng);
    assert.strictEqual(st.discard.length, 1, 'exactly one upcard');
    assert.ok(topOfDiscard(st), 'it is visible');
  }
});

test('the leading player may take the upcard on the very first turn', () => {
  const st = startRound(3, fixedRng);
  const up = topOfDiscard(st);
  const res = drawFromDiscard(st);
  assert.ok(res.ok);
  assert.strictEqual(res.card.id, up.id);
  assert.ok(st.hands[st.turn].some((x) => x.id === up.id));
});

test('a card drawn from STOCK may be discarded straight away', () => {
  const s = startRound(2, fixedRng);
  const drawn = drawFromStock(s).card;
  const res = discardCard(s, drawn);
  assert.strictEqual(res.ok, true);
});

test('turn order wraps around the table', () => {
  const s = startRound(3, fixedRng);
  for (let i = 0; i < 3; i++) {
    drawFromStock(s);
    discardCard(s, s.hands[s.turn][0]);
  }
  assert.strictEqual(s.turn, 0);
});

// ---------------------------------------------------------------- closing

test('a valid close ends the round and records the closer', () => {
  const s = startRound(2, fixedRng);
  // Rig player 0 with a winning 4+3 plus one junk card to throw.
  s.hands[0] = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(12, 'Bastos'), // the card being discarded
  ];
  s.phase = 'discard';

  const res = discardCard(s, c(12, 'Bastos'), true);
  assert.ok(res.ok);
  assert.strictEqual(res.closed, true);
  assert.strictEqual(s.closerIndex, 0);
  assert.strictEqual(s.phase, 'closed');
});

test('a FALSE close exposes the hand and play continues', () => {
  const s = startRound(2, fixedRng);
  s.hands[0] = [
    c(2, 'Copas'), c(5, 'Espadas'), c(7, 'Bastos'), c(10, 'Oros'),
    c(12, 'Copas'), c(11, 'Bastos'), c(4, 'Espadas'),
    c(3, 'Oros'),
  ];
  s.phase = 'discard';

  const res = discardCard(s, c(3, 'Oros'), true);
  assert.ok(res.ok);
  assert.strictEqual(res.falseClose, true);
  assert.ok(res.revealedHand, 'the hand must be shown to everyone');
  assert.strictEqual(s.closerIndex, null, 'nobody closed');
  assert.strictEqual(s.phase, 'draw', 'play continues');
  assert.strictEqual(s.turn, 1, 'turn passes normally');
});

test('closing is judged on the 7 kept cards, not the 8 held', () => {
  const s = startRound(2, fixedRng);
  s.hands[0] = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(2, 'Bastos'),
  ];
  s.phase = 'discard';
  // Throwing the 2 leaves a perfect 4+3.
  assert.ok(discardCard(s, c(2, 'Bastos'), true).closed);
});

test('you cannot close when the leftover would exceed 5', () => {
  const s = startRound(2, fixedRng);
  s.hands[0] = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(12, 'Bastos'), // leftover worth 10
    c(2, 'Oros'),
  ];
  s.phase = 'discard';
  const res = discardCard(s, c(2, 'Oros'), true);
  assert.strictEqual(res.falseClose, true);
});

test('closeOptions spots every legal closing discard', () => {
  const s = startRound(2, fixedRng);
  s.hands[0] = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(12, 'Bastos'),
  ];
  s.phase = 'discard';

  const opts = closeOptions(s);
  assert.ok(opts.length >= 1);
  assert.ok(opts.some((o) => o.discard.rank === 12));
});

test('closeOptions is empty for a hopeless hand', () => {
  const s = startRound(2, fixedRng);
  s.hands[0] = [
    c(2, 'Copas'), c(5, 'Espadas'), c(7, 'Bastos'), c(10, 'Oros'),
    c(12, 'Copas'), c(11, 'Bastos'), c(4, 'Espadas'), c(3, 'Oros'),
  ];
  s.phase = 'discard';
  assert.strictEqual(closeOptions(s).length, 0);
});

// ---------------------------------------------------------------- stock

test('an empty stock is refilled from the discard pile', () => {
  const s = startRound(2, fixedRng);
  s.discard = [...s.stock, ...s.discard];
  s.stock = [];
  const top = topOfDiscard(s);

  assert.ok(replenishStock(s, fixedRng));
  assert.ok(s.stock.length > 0);
  assert.strictEqual(s.discard.length, 1);
  assert.strictEqual(topOfDiscard(s).id, top.id, 'visible card stays visible');
});

test('drawFromStock reports reshuffled and keeps one card face up', () => {
  const s = startRound(2, fixedRng);
  s.discard = [...s.stock, ...s.discard];
  s.stock = [];
  const topId = topOfDiscard(s).id;
  const r = drawFromStock(s, fixedRng);
  assert.ok(r.ok);
  assert.strictEqual(r.reshuffled, true, 'flag set so the UI can show the note');
  assert.strictEqual(s.discard.length, 1, 'exactly one card stays face up');
  assert.strictEqual(topOfDiscard(s).id, topId, 'same visible card remains');
  assert.strictEqual(s.stock.length, 80 - 7 * 2 - 1 - 1, 'rest minus the card just drawn became the new stock');
});

test('no cards are lost when the stock is refilled', () => {
  const s = startRound(3, fixedRng);
  const before = s.stock.length + s.discard.length + s.hands.flat().length;
  s.discard = [...s.stock, ...s.discard];
  s.stock = [];
  replenishStock(s, fixedRng);
  const after = s.stock.length + s.discard.length + s.hands.flat().length;
  assert.strictEqual(after, before);
  assert.strictEqual(after, 80);
});

// ---------------------------------------------------------------- full game

test('a full round can be played to a close without crashing', () => {
  const s = startRound(4, fixedRng);
  let guard = 0;

  while (s.phase !== 'closed' && s.phase !== 'over' && guard < 500) {
    guard += 1;
    drawFromStock(s);
    if (s.phase !== 'discard') break;

    const opts = closeOptions(s);
    if (opts.length > 0) {
      discardCard(s, opts[0].discard, true);
    } else {
      discardCard(s, s.hands[s.turn][0]);
    }
  }

  assert.ok(guard < 500, 'the round must terminate');
  assert.ok(['closed', 'over'].includes(s.phase));
  // Card conservation holds all the way through.
  const total = s.stock.length + s.discard.length + s.hands.flat().length;
  assert.strictEqual(total, 80);
});

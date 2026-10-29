'use strict';

// R41 (Oct 29, 2026, Dannel): one 6-card meld plus one leftover worth 5 or less
// IS a valid close, because the 6-card meld counts as two 3-card melds. It must
// score exactly like any other 3 + 3 + leftover close (the leftover's value), and
// every judge must agree: the engine/bot check (canClose), the Close button gate
// (allCloseSplits, used by server closeAvailable) and a player's declared close
// (validateDeclaredClose).

const test = require('node:test');
const assert = require('node:assert');
const { canClose, allCloseSplits, validateDeclaredClose } = require('../src/scoring');
const { isValidMeld } = require('../src/melds');
const { startRound, discardCard } = require('../src/turn');
const { chooseTurn } = require('../src/bot');
const { resolveRound } = require('../src/layoff');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });
const WILD = (deckId = 0) => c(1, 'Oros', deckId);

// Every judge's verdict on a 7-card kept hand.
function verdicts(hand, groups) {
  const cc = canClose(hand);
  const splits = allCloseSplits(hand);
  const declared = validateDeclaredClose(hand, groups);
  return { cc, splits, declared };
}

function assertSixMeldClose(six, leftover) {
  const hand = [...six, leftover];
  assert.ok(isValidMeld(six), 'the six cards are one meld');
  assert.ok(isValidMeld(six.slice(0, 3)) && isValidMeld(six.slice(3)), 'and it splits 3 + 3');
  const value = leftover.rank <= 7 ? leftover.rank : 10;
  const { cc, splits, declared } = verdicts(hand, [six]);
  assert.ok(cc.ok, `canClose accepts it (${cc.reason})`);
  assert.strictEqual(cc.score, value);
  assert.ok(splits.length > 0, 'the Close button gate accepts it');
  assert.strictEqual(splits[0].score, value);
  assert.ok(declared.ok, 'declared as one 6-card group, it is a legal close');
  assert.strictEqual(declared.kind, 'leftover');
  assert.strictEqual(declared.score, value);
  const as33 = validateDeclaredClose(hand, [six.slice(0, 3), six.slice(3)]);
  assert.ok(as33.ok);
  assert.strictEqual(as33.score, declared.score, 'same score as declaring it 3 + 3');
}

test('R41: a 6-card run + leftover <= 5 closes and scores the leftover, like 3 + 3', () => {
  const run = [c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  assertSixMeldClose(run, c(4, 'Espadas'));
  // Across the 7 -> 10 bridge and the 12 -> 1 wrap.
  const bridge = [c(5, 'Bastos'), c(6, 'Bastos'), c(7, 'Bastos'), c(10, 'Bastos'), c(11, 'Bastos'), c(12, 'Bastos')];
  assertSixMeldClose(bridge, c(2, 'Copas'));
  const wrap = [c(10, 'Espadas'), c(11, 'Espadas'), c(12, 'Espadas'), c(1, 'Espadas'), c(2, 'Espadas'), c(3, 'Espadas')];
  assertSixMeldClose(wrap, c(5, 'Oros'));
});

test('R41: a 6-card run + leftover worth 6 or more is not a close (R20)', () => {
  const run = [c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  const hand = [...run, c(6, 'Espadas')];
  const { cc, splits, declared } = verdicts(hand, [run]);
  assert.strictEqual(cc.ok, false);
  assert.strictEqual(splits.length, 0);
  assert.strictEqual(declared.ok, false);
});

// Same rank: with two decks there are 8 copies of each rank, so a 6-card set
// (duplicate suits) does exist, and it splits 3 + 3 just the same.
test('R41: a 6-card set (two decks) + leftover <= 5 closes the same way', () => {
  const set = [c(11, 'Oros'), c(11, 'Oros', 1), c(11, 'Copas'), c(11, 'Copas', 1), c(11, 'Espadas'), c(11, 'Bastos')];
  assertSixMeldClose(set, c(3, 'Bastos'));
});

test('R41: a 6-card run using the wild + leftover <= 5 closes (one wild per meld)', () => {
  // 2-3-[wild as 4]-5-6-7 de Copas; the wild sits in the first or second half.
  const run = [c(2, 'Copas'), c(3, 'Copas'), WILD(), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  assertSixMeldClose(run, c(1, 'Bastos'));
  // The wild filling an end: [wild as 2]-3-4-5-6-7.
  const end = [WILD(), c(3, 'Copas'), c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  assertSixMeldClose(end, c(5, 'Espadas'));
});

// Regression for the merge found while making one source of truth: the least-
// deadwood split (one 5-card meld, two low cards left) is not a close, but a
// 3 + 3 + 5 close exists. The Close button offered it; the bots' check did not.
test('canClose accepts every close the Close button accepts (least-deadwood split was not a close)', () => {
  const hand = [c(5, 'Oros'), c(1, 'Oros', 1), c(11, 'Oros', 1), c(2, 'Oros'), c(2, 'Oros', 1), c(10, 'Oros'), c(7, 'Oros', 1)];
  assert.ok(allCloseSplits(hand).length > 0);
  const cc = canClose(hand);
  assert.ok(cc.ok, cc.reason);
  assert.strictEqual(cc.score, 5);
  assert.strictEqual(cc.split.melds.length, 2);
  assert.deepStrictEqual(cc.split.leftovers.map((x) => x.id), ['5-Oros-0']);
});

// A bot holding a 6-card run + a low card + one junk card discards the junk and
// closes, and the round resolves with the closer scoring the leftover.
test('R41: a bot closes with a 6-card meld + leftover, and the round scores it', () => {
  const state = startRound(2, () => 0.5);
  const six = [c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  const leftover = c(1, 'Bastos');
  const junk = c(12, 'Espadas');
  state.hands[0] = [...six, leftover, junk];
  state.turn = 0;
  state.phase = 'discard';

  for (const skill of ['aggressive', 'balanced']) {
    const d = chooseTurn(state, skill);
    assert.strictEqual(d.close, true, `${skill} bot closes`);
    assert.strictEqual(d.card.id, junk.id, `${skill} bot throws the junk card`);
  }

  const res = discardCard(state, junk, true);
  assert.ok(res.ok, res.reason);
  assert.strictEqual(state.phase, 'closed');
  const round = resolveRound(state.hands, 0);
  assert.ok(round.valid, round.reason);
  assert.deepStrictEqual(round.laidOff[0].stuck.map((x) => x.id), [leftover.id], 'nowhere to shed the 1 de Bastos');
  assert.strictEqual(round.scores[0], 1, 'closer scores the leftover, like any 3 + 3 + leftover');
});

test('an aggressive bot now closes in that spot too (it used to miss it)', () => {
  const state = startRound(2, () => 0.5);
  const kept = [c(5, 'Oros'), c(1, 'Oros', 1), c(11, 'Oros', 1), c(2, 'Oros'), c(2, 'Oros', 1), c(10, 'Oros'), c(7, 'Oros', 1)];
  const junk = c(12, 'Bastos', 1);
  state.hands[0] = [...kept, junk];
  state.turn = 0;
  state.phase = 'discard';
  const d = chooseTurn(state, 'aggressive');
  assert.strictEqual(d.close, true);
  assert.strictEqual(d.card.id, junk.id);
  assert.ok(discardCard(state, junk, true).ok);
  const round = resolveRound(state.hands, 0);
  assert.ok(round.valid, round.reason);
  // The closer pays the 5 unless the lay-off opened a spot for it (R29).
  const stuck = round.laidOff[0].stuck;
  assert.strictEqual(round.scores[0], stuck.length ? 5 : 0);
  assert.deepStrictEqual([...stuck, ...round.laidOff[0].shed].map((x) => x.id), ['5-Oros-0']);
});

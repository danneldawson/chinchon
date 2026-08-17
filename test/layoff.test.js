'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const { canAttach, shedOnto, layoffOrder, resolveRound } = require('../src/layoff');
const {
  createMatch, applyRound, isEliminated, playRound, activePlayers,
} = require('../src/match');

const c = (rank, suit, deckId = 0) => ({
  rank, suit, deckId, id: `${rank}-${suit}-${deckId}`,
});
const WILD = (deckId = 0) => c(1, 'Oros', deckId);

// A clean 4+3 closing hand: run 4-5-6-7 Copas + set of three 11s.
const closingHand = () => [
  c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
];

// A hand with nothing: pure deadwood.
const junkHand = () => [
  c(2, 'Copas'), c(5, 'Espadas'), c(7, 'Bastos'),
  c(10, 'Oros'), c(12, 'Copas'), c(11, 'Bastos'), c(4, 'Espadas'),
];

// ---------------------------------------------------------------- attaching

test('a card that extends a run can be attached', () => {
  const meld = [c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas')];
  assert.ok(canAttach(meld, c(7, 'Copas')));
  assert.ok(canAttach(meld, c(3, 'Copas')));
});

test('a run can be extended across the 8/9 gap', () => {
  const meld = [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  assert.ok(canAttach(meld, c(10, 'Copas')));
});

test('a fourth card of the same rank attaches to a set', () => {
  const meld = [c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')];
  assert.ok(canAttach(meld, c(11, 'Copas')));
});

test('a duplicate card attaches to a set (two decks)', () => {
  const meld = [c(11, 'Oros', 0), c(11, 'Espadas', 0), c(11, 'Bastos', 0)];
  assert.ok(canAttach(meld, c(11, 'Oros', 1)));
});

test('an unrelated card cannot be attached', () => {
  const meld = [c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas')];
  assert.ok(!canAttach(meld, c(12, 'Bastos')));
});

test('a wild cannot attach to a meld that already contains a wild', () => {
  const meld = [c(4, 'Copas'), WILD(0), c(6, 'Copas')];
  assert.ok(!canAttach(meld, WILD(1)));
});

test('a wild CAN attach to a meld with no wild in it', () => {
  const meld = [c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas')];
  assert.ok(canAttach(meld, WILD()));
});

// ---------------------------------------------------------------- shedding

test('shedding places what fits and returns what does not', () => {
  const table = [[c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas')]];
  const stuck = shedOnto(table, [c(7, 'Copas'), c(12, 'Bastos')]);
  assert.strictEqual(stuck.length, 1);
  assert.strictEqual(stuck[0].rank, 12);
  assert.strictEqual(table[0].length, 4);
});

test('cascading shed: one card opens the way for the next', () => {
  // Table run is 5-6-7 Copas. Player holds 10 and 11 Copas.
  // 10 attaches after 7, then 11 attaches after 10.
  const table = [[c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')]];
  const stuck = shedOnto(table, [c(11, 'Copas'), c(10, 'Copas')]);
  assert.strictEqual(stuck.length, 0);
  assert.strictEqual(table[0].length, 5);
});

// ---------------------------------------------------------------- turn order

test('lay-off order starts with the player after the closer and wraps', () => {
  assert.deepStrictEqual(layoffOrder(4, 2), [3, 0, 1]);
  assert.deepStrictEqual(layoffOrder(3, 0), [1, 2]);
  assert.deepStrictEqual(layoffOrder(7, 6), [0, 1, 2, 3, 4, 5]);
});

// ---------------------------------------------------------------- false close

test('FALSE CLOSE: no game means nobody is scored and play continues', () => {
  const hands = [junkHand(), closingHand()];
  const result = resolveRound(hands, 0); // player 0 has nothing
  assert.strictEqual(result.valid, false);
  assert.ok(!result.scores);
  assert.ok(result.revealedHand, 'the bad closer must expose their hand');
});

test('FALSE CLOSE: leftover above 5 is rejected, round continues', () => {
  const bad = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(12, 'Bastos'),
  ];
  const result = resolveRound([bad, junkHand()], 0);
  assert.strictEqual(result.valid, false);
});

// ---------------------------------------------------------------- valid round

test('clean 4+3 close scores -10 for the closer', () => {
  const result = resolveRound([closingHand(), junkHand()], 0);
  assert.ok(result.valid);
  assert.strictEqual(result.scores[0], -10);
});

test('a player holding pure junk is charged full deadwood', () => {
  const result = resolveRound([closingHand(), junkHand()], 0);
  // junk: 2+5+7+10+10+10+4 = 48, minus anything sheddable onto the table.
  assert.ok(result.scores[1] > 0);
});

test('a player sheds onto the closer table and pays less', () => {
  // Opponent holds 3 Copas which extends the closer run 4-5-6-7 Copas.
  const opponent = [
    c(3, 'Copas'),
    c(2, 'Espadas'), c(10, 'Bastos'), c(12, 'Espadas'),
    c(10, 'Copas'), c(12, 'Bastos'), c(2, 'Bastos'),
  ];
  const result = resolveRound([closingHand(), opponent], 0);
  const shed = result.laidOff[1].shed.map((x) => x.rank);
  assert.ok(shed.includes(3), 'the 3 de Copas should have been laid off');
});

test('CHINCHON ends the match immediately and skips lay-off', () => {
  const chinchon = [
    c(1, 'Copas'), c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  ];
  const result = resolveRound([chinchon, junkHand()], 0);
  assert.ok(result.valid);
  assert.strictEqual(result.chinchon, true);
  assert.strictEqual(result.gameOver, true);
  assert.strictEqual(result.winner, 0);
});

test('the closer may shed their leftover into a gap opened during lay-off', () => {
  // Closer: 3+3 with a leftover 2 de Bastos.
  const closer = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(2, 'Bastos'),
  ];
  // Opponent lays down a run of 3-4-5 Bastos, which the 2 can extend.
  const opponent = [
    c(3, 'Bastos'), c(4, 'Bastos'), c(5, 'Bastos'),
    c(12, 'Oros'), c(12, 'Copas'), c(12, 'Espadas'),
    c(7, 'Espadas'),
  ];
  const result = resolveRound([closer, opponent], 0);
  assert.strictEqual(result.scores[0], 0, 'closer shed their leftover, pays nothing');
});

test('seven players are handled', () => {
  const hands = [closingHand(), ...Array.from({ length: 6 }, junkHand)];
  const result = resolveRound(hands, 0);
  assert.ok(result.valid);
  assert.strictEqual(result.scores.length, 7);
});

// ---------------------------------------------------------------- match loop

test('exactly 100 survives, 101 is eliminated', () => {
  assert.ok(!isEliminated(100));
  assert.ok(isEliminated(101));
  assert.ok(isEliminated(150));
});

test('a player crossing 101 is knocked out permanently', () => {
  const match = createMatch(['Ana', 'Beto']);
  match.players[1].total = 95;
  applyRound(match, { valid: true, chinchon: false, scores: [-10, 20] });
  assert.strictEqual(match.players[1].out, true);
  assert.strictEqual(match.gameOver, true);
  assert.strictEqual(match.winner, 0);
});

test('a player at exactly 100 stays in the game', () => {
  const match = createMatch(['Ana', 'Beto', 'Cami']);
  match.players[1].total = 90;
  applyRound(match, { valid: true, chinchon: false, scores: [0, 10, 5] });
  assert.strictEqual(match.players[1].total, 100);
  assert.strictEqual(match.players[1].out, false);
  assert.strictEqual(match.gameOver, false);
});

test('negative totals from -10 closes are allowed', () => {
  const match = createMatch(['Ana', 'Beto']);
  applyRound(match, { valid: true, chinchon: false, scores: [-10, 30] });
  assert.strictEqual(match.players[0].total, -10);
});

test('totals never go below the -50 floor', () => {
  const match = createMatch(['Ana', 'Beto']);
  match.players[0].total = -45;
  applyRound(match, { valid: true, chinchon: false, scores: [-10, 0] }); // -45 + -10 = -55 -> clamps to -50
  assert.strictEqual(match.players[0].total, -50);
  // A subsequent -10 does not push further down.
  applyRound(match, { valid: true, chinchon: false, scores: [-10, 0] });
  assert.strictEqual(match.players[0].total, -50);
});

test('a -10 then a +20 lands at +10 (negative is real, no clamp going up)', () => {
  const match = createMatch(['Ana', 'Beto']);
  applyRound(match, { valid: true, chinchon: false, scores: [-10, 0] }); // -10
  applyRound(match, { valid: true, chinchon: false, scores: [20, 0] });  // -10 + 20 = +10
  assert.strictEqual(match.players[0].total, 10);
});

test('match ends when only one player remains', () => {
  const match = createMatch(['Ana', 'Beto', 'Cami']);
  match.players[0].total = 99;
  match.players[2].total = 99;
  applyRound(match, { valid: true, chinchon: false, scores: [10, 0, 10] });
  assert.strictEqual(match.gameOver, true);
  assert.strictEqual(match.winner, 1);
  assert.strictEqual(activePlayers(match).length, 1);
});

test('a false close does not touch the match totals', () => {
  const match = createMatch(['Ana', 'Beto']);
  const { result } = playRound(match, [junkHand(), closingHand()], 0);
  assert.strictEqual(result.valid, false);
  assert.strictEqual(match.players[0].total, 0);
  assert.strictEqual(match.players[1].total, 0);
  assert.strictEqual(match.round, 0, 'round counter must not advance');
});

test('chinchon wins the match regardless of totals', () => {
  const match = createMatch(['Ana', 'Beto']);
  match.players[0].total = 98; // nearly out, still wins outright
  const chinchon = [
    c(1, 'Copas'), c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  ];
  playRound(match, [chinchon, junkHand()], 0);
  assert.strictEqual(match.gameOver, true);
  assert.strictEqual(match.winner, 0);
});

test('player count is validated: 2 to 7', () => {
  assert.throws(() => createMatch(['solo']));
  assert.throws(() => createMatch(Array.from({ length: 8 }, (_, i) => `P${i}`)));
  assert.ok(createMatch(['a', 'b']));
  assert.ok(createMatch(Array.from({ length: 7 }, (_, i) => `P${i}`)));
});

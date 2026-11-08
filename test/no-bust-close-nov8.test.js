'use strict';
// R46 (Nov 8, 2026, Dannel): no close with a leftover that would take your
// total over 100. Clean (-10) closes and a Chinchon stay legal.
const assert = require('node:assert');
const { test } = require('node:test');
const { canClose, allCloseSplits, validateDeclaredClose } = require('../src/scoring');
const { closeOptions, discardCard } = require('../src/turn');
const { createMatch, applyRound } = require('../src/match');
const c = (r, s) => ({ rank: r, suit: s, deckId: 0, id: `${r}-${s}-0` });

// 3+3 + leftover 1 de Copas (value 1)
const kept1 = [c(5, 'Copas'), c(5, 'Espadas'), c(5, 'Bastos'), c(12, 'Copas'), c(12, 'Espadas'), c(12, 'Bastos'), c(1, 'Copas')];
// 3+3 + leftover 5 de Oros (value 5)
const kept5 = [c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(12, 'Copas'), c(12, 'Espadas'), c(12, 'Bastos'), c(5, 'Oros')];
// 4+3 clean
const clean = [c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')];
const chin = [c(1, 'Bastos'), c(2, 'Bastos'), c(3, 'Bastos'), c(4, 'Bastos'), c(5, 'Bastos'), c(6, 'Bastos'), c(7, 'Bastos')];

test('on 100, a 3+3 close with a leftover of 1 is refused', () => {
  assert.strictEqual(canClose(kept1, 99).ok, true);
  const v = canClose(kept1, 100);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(allCloseSplits(kept1, 100).length, 0);
  const d = validateDeclaredClose(kept1, [kept1.slice(0, 3), kept1.slice(3, 6)], 100);
  assert.strictEqual(d.ok, false);
  assert.strictEqual(d.overHundred, true);
});

test('on 95 a leftover of 5 is allowed; on 96 it is not', () => {
  assert.strictEqual(canClose(kept5, 95).ok, true);
  assert.strictEqual(canClose(kept5, 95).score, 5);
  assert.strictEqual(canClose(kept5, 96).ok, false);
});

test('on 100, a -10 close and a Chinchon are allowed', () => {
  const v = canClose(clean, 100);
  assert.ok(v.ok); assert.strictEqual(v.score, -10);
  assert.ok(validateDeclaredClose(clean, [clean.slice(0, 4), clean.slice(4)], 100).ok);
  assert.ok(canClose(chin, 100).ok);
  assert.ok(validateDeclaredClose(chin, [chin], 100).ok);
});

test('a bot on 100 never attempts a leftover close', () => {
  const extra = c(10, 'Oros');
  const state = { phase: 'discard', turn: 0, hands: [[...kept1, extra], []], discard: [], stock: [], active: [0, 1], totals: [100, 0] };
  assert.strictEqual(closeOptions(state).length, 0);
  state.totals = [94, 0];
  assert.ok(closeOptions(state).length > 0, 'same hand closes on 94');
  // and the engine treats a forced attempt on 100 as not a close
  state.totals = [100, 0];
  const r = discardCard(state, extra, true);
  assert.ok(r.falseClose);
});

test('a round always leaves someone standing: the closer stays <= 100', () => {
  const m = createMatch(['A', 'B', 'C']);
  m.players.forEach((p) => { p.total = 100; });
  applyRound(m, { valid: true, chinchon: false, scores: [-10, 20, 30] });
  assert.strictEqual(m.gameOver, true);
  assert.strictEqual(m.winner, 0);
});

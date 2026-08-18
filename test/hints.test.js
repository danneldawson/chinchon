'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { drawRunHint } = require('../src/hints');
const { isValidRun } = require('../src/melds');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });

// A run meld with the drawn card inside it.
const run34 = [c(10, 'Oros'), c(11, 'Oros'), c(12, 'Oros')];   // 3-card run
const run4 = [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), c(10, 'Copas')]; // 4-card run
const set3 = [c(7, 'Oros'), c(7, 'Copas'), c(7, 'Espadas')];    // a SET (must be excluded)
const chin = [c(2, 'Bastos'), c(3, 'Bastos'), c(4, 'Bastos'), c(5, 'Bastos'), c(6, 'Bastos'), c(7, 'Bastos'), c(10, 'Bastos')]; // chinchon run

const drawnId = run34[1].id; // 11 de Oros drawn

test('returns a 3-card run that contains the drawn card', () => {
  const opts = [{ split: [run34], chinchon: false, cardId: 'x', score: 0, kind: 'clean' }];
  const hint = drawRunHint(opts, drawnId);
  assert.ok(hint);
  assert.strictEqual(hint.run.length, 3);
  assert.ok(isValidRun(hint.run));
  assert.ok(hint.run.some((x) => x.id === drawnId));
});

test('no hint when no close is available', () => {
  assert.strictEqual(drawRunHint([], drawnId), null);
  assert.strictEqual(drawRunHint(undefined, drawnId), null);
});

test('never reveals a chinchon even when it is a run', () => {
  const opts = [{ split: [chin], chinchon: true, cardId: 'x', score: 0, kind: 'chinchon' }];
  assert.strictEqual(drawRunHint(opts, chin[3].id), null);
});

test('excludes sets even when a close is available', () => {
  const opts = [{ split: [set3], chinchon: false, cardId: 'x', score: 0, kind: 'clean' }];
  assert.strictEqual(drawRunHint(opts, set3[0].id), null);
});

test('excludes runs longer than 4 cards', () => {
  const longRun = [c(3, 'Espadas'), c(4, 'Espadas'), c(5, 'Espadas'), c(6, 'Espadas'), c(7, 'Espadas')];
  const opts = [{ split: [longRun], chinchon: false, cardId: 'x', score: 0, kind: 'clean' }];
  assert.strictEqual(drawRunHint(opts, longRun[2].id), null);
});

test('returns a 4-card run when present', () => {
  const opts = [{ split: [run4], chinchon: false, cardId: 'x', score: 0, kind: 'clean' }];
  const hint = drawRunHint(opts, run4[2].id);
  assert.ok(hint);
  assert.strictEqual(hint.run.length, 4);
});

test('does not hint a run when the close was already available in the dealt cards', () => {
  // Clean close available: kept 7 = run 10-11-12 Oros + a set of four 5s.
  // But the drawn card (9 de Copas, the discard) is NOT in that run, so the
  // run was NOT formed "on the spot" by the draw -> no hint.
  const set4 = [c(5, 'Oros'), c(5, 'Copas'), c(5, 'Espadas'), c(5, 'Bastos')];
  const opts = [{ split: [run34, set4], chinchon: false, cardId: '9-Copas-0', score: -10, kind: 'clean' }];
  assert.strictEqual(drawRunHint(opts, '9-Copas-0'), null);
});

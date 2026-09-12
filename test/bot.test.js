'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { shouldClose } = require('../src/bot');

const leftover5 = { discard: { id: 'a' }, reason: 'leftover', score: 5 };
const leftover3 = { discard: { id: 'b' }, reason: 'leftover', score: 3 };
const leftover2 = { discard: { id: 'c' }, reason: 'leftover', score: 2 };
const leftover1 = { discard: { id: 'd' }, reason: 'leftover', score: 1 };
const clean = { discard: { id: 'e' }, reason: 'clean', score: -10 };
const chinchon = { discard: { id: 'f' }, reason: 'chinchon', score: 0 };

test('aggressive dumps any legal close, preferring chinchon then clean', () => {
  assert.equal(shouldClose({}, 'aggressive', [leftover5]), leftover5);
  assert.equal(shouldClose({}, 'aggressive', [leftover5, clean]), clean);
  assert.equal(shouldClose({}, 'aggressive', [leftover5, clean, chinchon]), chinchon);
});

test('balanced dumps leftover 0-2 or better, holds leftover 3-5', () => {
  assert.equal(shouldClose({}, 'balanced', [leftover2]), leftover2);
  assert.equal(shouldClose({}, 'balanced', [leftover1]), leftover1);
  assert.equal(shouldClose({}, 'balanced', [clean]), clean);
  assert.equal(shouldClose({}, 'balanced', [chinchon]), chinchon);
  assert.equal(shouldClose({}, 'balanced', [leftover5]), null, 'hold a leftover of 5');
  assert.equal(shouldClose({}, 'balanced', [leftover3]), null, 'hold a leftover of 3');
});

test('cautious only closes on chinchon or clean -10', () => {
  assert.equal(shouldClose({}, 'cautious', [leftover5]), null);
  assert.equal(shouldClose({}, 'cautious', [leftover2]), null);
  assert.equal(shouldClose({}, 'cautious', [leftover1]), null);
  assert.equal(shouldClose({}, 'cautious', [clean]), clean);
  assert.equal(shouldClose({}, 'cautious', [chinchon]), chinchon);
  assert.equal(shouldClose({}, 'cautious', [leftover5, clean]), clean);
});

test('no options means nobody closes', () => {
  assert.equal(shouldClose({}, 'aggressive', []), null);
  assert.equal(shouldClose({}, 'balanced', []), null);
  assert.equal(shouldClose({}, 'cautious', []), null);
});

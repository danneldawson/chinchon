'use strict';

// The browser client (public/app.js) cannot `require` the engine, so it carries
// its own copy of two card rules. These tests EVALUATE the client's expressions
// and compare them against src/cards.js across the whole deck, so a change to
// cardValue/isWild in the engine can never silently desync the UI.
//
// The client's copy is not decorative: the close-options UI uses __cardVal to
// pick the worst leftover card to keep, so a drifted value table would show the
// wrong suggestion with no failing test anywhere else.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const { buildDeck, cardValue, isWild, SUITS, RANKS } = require('../src/cards');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// Every `window.<name> = <expression>;` found in the client source.
function clientDefs(name) {
  return [...APP.matchAll(new RegExp(`window\\.${name}\\s*=\\s*([^;]+);`, 'g'))].map((m) => m[1]);
}

// Build the function the browser actually runs, straight from the source text.
function clientFn(name) {
  const defs = clientDefs(name);
  assert.strictEqual(
    defs.length,
    1,
    `expected exactly 1 definition of window.${name} in public/app.js, found ${defs.length}`
  );
  return new Function(`return (${defs[0]});`)();
}

test('each client card rule is defined exactly once', () => {
  for (const name of ['__isWild', '__cardVal']) {
    assert.strictEqual(clientDefs(name).length, 1, `window.${name} is duplicated in public/app.js`);
  }
});

test("the client's wild rule matches the engine for all 80 cards", () => {
  const fn = clientFn('__isWild');
  for (const card of buildDeck()) {
    assert.strictEqual(fn(card), isWild(card), `${card.rank} de ${card.suit} (deck ${card.deckId})`);
  }
});

test("the client's card values match the engine for every rank", () => {
  const fn = clientFn('__cardVal');
  for (const rank of RANKS) {
    assert.strictEqual(
      fn({ rank, suit: 'Copas' }),
      cardValue({ rank, suit: 'Copas' }),
      `rank ${rank}`
    );
  }
});

test('every suit has its own emblem case (no silent default fallback)', () => {
  const src = APP.slice(APP.indexOf('function suitEmblem'), APP.indexOf('function renderCardEl'));
  for (const suit of SUITS) {
    assert.match(src, new RegExp(`case '${suit}':`), `${suit} has no explicit case in suitEmblem()`);
  }
});

test('an unknown suit warns and draws nothing rather than a bastos club', () => {
  const src = APP.slice(APP.indexOf('function suitEmblem'), APP.indexOf('function renderCardEl'));
  const fallback = src.slice(src.lastIndexOf('default:'));
  assert.match(fallback, /console\.warn/, 'the default branch must warn');
  assert.doesNotMatch(fallback, /<svg/, 'the default branch must not draw a suit');
});

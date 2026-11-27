'use strict';

// The BIRRA deck is a second art deck. It uses the same file names as the
// stained-glass set, in its own folder, and a room keeps it like any other deck.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { SUITS, RANKS } = require('../src/cards');
const { _internals } = require('../server');

const PUB = path.join(__dirname, '..', 'public');
const DECK = path.join(PUB, 'decks', 'birra');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

function srcFor(cardDeck) {
  const start = APP.indexOf('const SG_SUIT_FILE');
  const end = APP.indexOf('function chosenCardDeck');
  return new Function('state', APP.slice(start, end) + '\nreturn stainedGlassSrc;')({ cardDeck });
}

test('birra files cover every rank and suit and stay small', () => {
  const src = srcFor('birra');
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const file = `${String(rank).padStart(2, '0')}-${suit.toLowerCase()}.webp`;
      assert.strictEqual(src({ suit, rank }), '/decks/birra/' + file);
      assert.ok(fs.existsSync(path.join(DECK, file)), file);
    }
  }
  assert.ok(fs.existsSync(path.join(DECK, 'preview.webp')));
  let bytes = 0;
  for (const n of fs.readdirSync(DECK)) bytes += fs.statSync(path.join(DECK, n)).size;
  assert.ok(bytes < 450 * 1024, `birra assets grew to ${bytes} bytes`);
  assert.strictEqual(srcFor('stained-glass')({ suit: 'Oros', rank: 1 }), '/decks/stained-glass/01-oros.webp');
});

test('the server keeps birra and both pickers offer it', () => {
  assert.strictEqual(_internals.cardDeckOf('birra'), 'birra');
  assert.strictEqual(_internals.cardDeckOf('fournier'), 'classic');
  assert.match(HTML, /name="card-deck"[^>]*value="birra"/);
  assert.match(HTML, /name="card-deck-solo"[^>]*value="birra"/);
  assert.doesNotMatch(HTML, /id="deck-birra-preview[^"]*"[^>]*src=/);
});

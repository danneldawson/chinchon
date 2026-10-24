'use strict';

// Oct 23, 2026 (Dannel): in Spanish the label over the hand on the table read
// "Your hand". It now goes through the i18n keys like every other label.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');

test('hand label uses the yourHand key (Tu mano in Spanish); deadwood span kept', () => {
  const h2 = html.match(/<h2 id="your-hand-h2">([\s\S]*?)<\/h2>/);
  assert.ok(h2, 'hand heading present');
  assert.match(h2[1], /<span data-i18n="yourHand">Your hand<\/span>/);
  assert.match(h2[1], /<span id="deadwood" class="dim"><\/span>/);
  // The translated span is separate from #deadwood, so applying the language
  // (textContent on [data-i18n]) never wipes the deadwood count.
  assert.ok(!/<h2 id="your-hand-h2" data-i18n/.test(html));
  assert.match(js, /yourHand: 'Your hand'/);
  assert.match(js, /yourHand: 'Tu mano'/);
});

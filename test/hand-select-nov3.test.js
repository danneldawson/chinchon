'use strict';

// Nov 3, 2026 (Dannel):
//   - In close mode the 8th card sits in line with the hand (no arrow, no gap,
//     no dashed slot) and is selectable like the rest.
//   - Selected cards are noticeably bigger and lifted, with a clearer outline.
//   - Game over shows the winner and final scores as a panel OVER the table;
//     the last round's melds stay on the felt, the chat stays usable, and each
//     player picks Play again or Leave.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('close mode: the drawn card gets no arrow and no locked slot, and stays tappable', () => {
  assert.match(APP, /if \(!cm\) \{\s*const sep = document\.createElement\('div'\);\s*sep\.className = 'hand-sep';/);
  assert.match(APP, /if \(!cm\) el\.classList\.add\('drawn-locked'\);/);
  assert.match(APP, /if \(state\.closeMode\) \{ toggleCloseSel\(drawn\.id\); return; \}/);
  assert.match(CSS, /#hand\.close-mode \{ padding-top: 18px;/, 'room for the lift inside the clipped row');
});

test('selected cards: bigger, lifted, thick outline with a white rim', () => {
  const rule = CSS.match(/\n\.card\.selected \{([^}]*)\}/);
  assert.ok(rule);
  assert.match(rule[1], /outline: 4px solid var\(--accent\)/);
  assert.match(rule[1], /translateY\(-12px\) scale\(1\.1\)/);
  assert.match(rule[1], /box-shadow: 0 0 0 2px #fff/);
});


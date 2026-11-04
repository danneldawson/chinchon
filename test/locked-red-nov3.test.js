'use strict';

// R42 styling (Dannel, Nov 3, 2026: "the -10 melds make the around it red so
// people know that those are the melds no one could feed").

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('R42 styling: only -10-locked melds get the red border and glow', () => {
  const rule = CSS.match(/\.felt-meld\.locked \{([^}]*)\}/);
  assert.ok(rule, 'locked rule exists');
  assert.match(rule[1], /border: 2px solid #ff3b30/);
  assert.match(rule[1], /box-shadow:[^;]*rgba\(255, 59, 48/);
  assert.doesNotMatch(rule[1], /opacity/, 'not dimmed on the blue felt');
  assert.doesNotMatch(CSS, /\.felt-meld(\.mine)? \{[^}]*#ff3b30/, 'ordinary melds stay unbordered');
  assert.match(APP, /\(g\.locked \? ' locked' : ''\)/);
  assert.match(APP, /\$\{g\.locked \? '🔒 ' : ''\}/);
});

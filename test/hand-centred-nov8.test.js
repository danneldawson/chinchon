'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('hand row is centred as a group without breaking the scroll fallback', () => {
  assert.match(CSS, /#hand > :first-child \{ margin-left: auto; \}/);
  assert.match(CSS, /#hand > :last-child \{ margin-right: auto; \}/);
  // justify-content:center would clip the first cards of an overflowing row
  assert.ok(!/#hand\s*\{[^}]*justify-content:\s*center/.test(CSS));
  // the one-row, swipe-inside rule is still there
  assert.match(CSS, /#hand \{\s*--hgap[^}]*flex-wrap: nowrap; overflow-x: auto;/);
});

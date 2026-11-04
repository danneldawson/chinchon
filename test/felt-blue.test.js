'use strict';

// Nov 3, 2026 (Dannel): "make the table cloth blue instead".
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('the table felt is blue, with no green felt tints left', () => {
  const table = CSS.slice(CSS.indexOf('#table {'), CSS.indexOf('}', CSS.indexOf('#table {')));
  assert.match(table, /#2f6aa8/);
  for (const old of ['#2e7a4d', '#23633d', '#194a2d', 'rgba(8, 22, 14', '#1c2a20']) {
    assert.ok(!CSS.includes(old), `old green felt colour still present: ${old}`);
  }
});

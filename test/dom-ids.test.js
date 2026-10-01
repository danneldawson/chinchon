// Regression: a listener bound to an element id that is missing from
// index.html threw at startup and left players on a black screen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');

test('every top-level addEventListener target exists in index.html', () => {
  const ids = new Set();
  for (const m of js.matchAll(/^\$\('([\w-]+)'\)\.addEventListener/gm)) ids.add(m[1]);
  const missing = [...ids].filter((id) => !html.includes(`id="${id}"`));
  assert.deepStrictEqual(missing, []);
});

test('$() stub for a missing element supports addEventListener', () => {
  assert.match(js, /if \(!el\) return \{[^}]*\}[^;]*addEventListener\(\) \{\}/);
});

'use strict';

// Nov 3, 2026: "⚠ Script error." on Dannel's iPad during a close. Safari
// reports any error from a script of another origin (extension content
// scripts, injected in-app code) as "Script error." with no file or line. The
// page loads only same-origin /app.js, so those must never overwrite the game
// status; our own errors still show, with file:line.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
function fnSource(name) {
  const start = APP.indexOf(`function ${name}(`);
  let i = APP.indexOf('{', start); let depth = 0;
  for (; i < APP.length; i++) { if (APP[i] === '{') depth++; else if (APP[i] === '}' && --depth === 0) break; }
  return APP.slice(start, i + 1);
}
function load() {
  const status = { textContent: 'Tu turno' };
  const doc = { getElementById: () => status, body: status };
  const loc = { href: 'https://chinchon.example/', origin: 'https://chinchon.example' };
  const con = { error() {} };
  const fn = new Function('document', 'location', 'console',
    `${fnSource('isOwnClientError')}\n${fnSource('reportClientError')}\nreturn reportClientError;`)(doc, loc, con);
  return { fn, status };
}

test('opaque "Script error." (cross-origin / extension) is not shown', () => {
  const { fn, status } = load();
  assert.strictEqual(fn({ message: 'Script error.', filename: '', lineno: 0 }), false);
  assert.strictEqual(status.textContent, 'Tu turno');
  assert.strictEqual(fn({ message: 'TypeError: x', filename: 'safari-web-extension://abc/content.js', lineno: 3 }), false);
  assert.strictEqual(fn({ message: 'boom', filename: '' }), false, 'no source = injected code');
  assert.strictEqual(status.textContent, 'Tu turno');
});

test('our own errors still show, with file:line', () => {
  const { fn, status } = load();
  assert.strictEqual(fn({ message: 'TypeError: lo is null', filename: 'https://chinchon.example/app.js', lineno: 1712 }), true);
  assert.strictEqual(status.textContent, '⚠ TypeError: lo is null (app.js:1712)');
});

test('the page loads no cross-origin script', () => {
  const srcs = [...HTML.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(srcs, ['/app.js']);
});

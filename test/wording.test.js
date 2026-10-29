'use strict';

// Oct 29, 2026 English wording pass. Guards the string-table bugs it found:
// a missing en.rules (the lobby Rules pill went blank), duplicate keys whose
// later copy silently won (the Discard pile read "discard" / "descartar"), and
// English copies at the end of the Spanish table.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function table(lang) {
  const start = APP.indexOf(`  ${lang}: {`);
  const end = APP.indexOf('\n  },', start);
  const body = APP.slice(start, end);
  const entries = [...body.matchAll(/^    (\w+): '((?:[^'\\]|\\.)*)',/gm)].map((m) => [m[1], m[2]]);
  return entries;
}

test('every data-i18n key used in index.html exists in English (t() falls back to English)', () => {
  const en = new Map(table('en'));
  const keys = new Set([...HTML.matchAll(/data-i18n(?:-placeholder)?="(\w+)"/g)].map((m) => m[1]));
  for (const k of keys) {
    assert.ok(en.has(k), `en.${k} missing (the element would go blank)`);
  }
  assert.strictEqual(en.get('rules'), 'Rules');
});

test('no duplicate key in a table carries a different value (a later copy silently wins)', () => {
  for (const lang of ['en', 'es']) {
    const seen = new Map();
    for (const [k, v] of table(lang)) {
      if (seen.has(k)) assert.strictEqual(v, seen.get(k), `${lang}.${k} is defined twice with different text`);
      seen.set(k, v);
    }
  }
  assert.strictEqual(new Map(table('en')).get('discard'), 'Discard');
  assert.strictEqual(new Map(table('es')).get('discard'), 'Descarte');
});

test('the Spanish table holds no English copies', () => {
  const es = new Map(table('es'));
  assert.strictEqual(es.get('seatReconnectedMsg'), 'Este asiento se reconecto desde otro dispositivo.');
  assert.strictEqual(es.get('makeANewGame'), 'Crear una partida nueva');
  assert.ok(![...es.keys()].some((k) => /En$/.test(k)), 'no *En mirror keys in the Spanish table');
  assert.strictEqual(es.get('yourHand'), 'Tu mano');
});

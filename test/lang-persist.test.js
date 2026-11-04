'use strict';

// Nov 3, 2026 (Dannel): "during game the other players table switched language
// out of the blue and prevailed for the rest of the round". The language lives
// only in each browser (the server never sends or stores it), but it was not
// saved: every page load started in English. A refresh mid-hand (or a phone
// reloading a backgrounded tab) resumes the hand from sessionStorage, so a
// Spanish table came back in English and stayed that way. Now each device saves
// its own choice and reloads into it.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function fnSource(name) {
  const start = APP.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} missing`);
  let i = APP.indexOf('{', start);
  let depth = 0;
  for (; i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}' && --depth === 0) break;
  }
  return APP.slice(start, i + 1);
}

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('the page starts in the language saved on this device', () => {
  assert.match(APP, /let lang = loadLang\(\);/);
});

test('choosing Español survives a reload (refresh mid-hand)', () => {
  const localStorage = fakeStorage();
  const ctx = {
    LANG_KEY: 'chinchonLang', localStorage, lang: 'en',
    document: { querySelectorAll: () => [] },
    $: () => ({ classList: { contains: () => true } }),
    applyLang: () => {}, renderGameplayRules: () => {},
  };
  const setLang = new Function('ctx', `with (ctx) { ${fnSource('setLang')}; return setLang; }`)(ctx);
  setLang('es');
  // A reload runs loadLang() again against the same device storage.
  const loadLang = new Function('ctx', `with (ctx) { ${fnSource('loadLang')}; return loadLang; }`)(ctx);
  assert.strictEqual(loadLang(), 'es');
  setLang('en');
  assert.strictEqual(loadLang(), 'en');
});

test('a device without storage (private mode) falls back to English, no crash', () => {
  const ctx = { LANG_KEY: 'chinchonLang', localStorage: { getItem() { throw new Error('denied'); } } };
  const loadLang = new Function('ctx', `with (ctx) { ${fnSource('loadLang')}; return loadLang; }`)(ctx);
  assert.strictEqual(loadLang(), 'en');
});

test('language is never shared through the room: the server has no language state', () => {
  assert.ok(!/\blang\b/.test(SERVER.replace(/\/\/.*$/gm, '')), 'server.js should not read or store a language');
});

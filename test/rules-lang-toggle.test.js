'use strict';

// Oct 29, 2026: the Rules screen's English / Español buttons did nothing. The
// global .lang-btn handler set the language, but a later line assigned the two
// Rules buttons' onclick again (`renderGameplayRules()` only), which REPLACED the
// handler, so a tap re-drew the rules in the language already showing.
// Now every .lang-btn goes through setLang(), and nothing reassigns them.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const PUB = path.join(__dirname, '..', 'public');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

function fnSource(name) {
  const start = APP.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} missing`);
  // Walk braces from the first "{" to its match.
  let i = APP.indexOf('{', start);
  let depth = 0;
  for (; i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}' && --depth === 0) break;
  }
  return APP.slice(start, i + 1);
}

test('no code reassigns the Rules screen language buttons after the global handler', () => {
  assert.ok(!/\$\('btn-lang-(en|es)'\)\.onclick\s*=/.test(APP),
    "a $('btn-lang-en'/'btn-lang-es').onclick assignment would replace the setLang handler");
  assert.match(APP, /document\.querySelectorAll\('\.lang-btn'\)\.forEach\(\(b\) => \{\s*b\.onclick = \(\) => setLang\(b\.dataset\.lang\);/);
  // The Rules buttons really are .lang-btn, so the global handler covers them.
  assert.match(HTML, /id="btn-lang-en" class="lang-btn[^"]*" data-lang="en"/);
  assert.match(HTML, /id="btn-lang-es" class="lang-btn[^"]*" data-lang="es"/);
});

test('setLang switches the language, lights both toggles and re-draws open Rules', () => {
  const mkBtn = (l) => ({ dataset: { lang: l }, cls: new Set(l === 'en' ? ['active'] : []),
    get classList() { const c = this.cls; return { toggle: (n, on) => (on ? c.add(n) : c.delete(n)), contains: (n) => c.has(n) }; } });
  const buttons = [mkBtn('en'), mkBtn('es'), mkBtn('en'), mkBtn('es')]; // landing + Rules
  let hidden = false;
  const calls = { apply: 0, rules: [] };
  const ctx = {
    lang: 'en',
    document: { querySelectorAll: () => buttons },
    $: () => ({ classList: { contains: () => hidden } }),
    applyLang: () => { calls.apply++; },
    renderGameplayRules: () => { calls.rules.push(ctx.lang); },
  };
  const run = new Function('ctx', `with (ctx) { ${fnSource('setLang')}; return setLang; }`)(ctx);
  // `lang` is assigned inside the with-block, so it lands on ctx.
  run('es');
  assert.strictEqual(ctx.lang, 'es');
  assert.deepStrictEqual(buttons.map((b) => b.cls.has('active')), [false, true, false, true]);
  assert.strictEqual(calls.apply, 1);
  assert.deepStrictEqual(calls.rules, ['es'], 'open Rules screen re-drawn in the NEW language');

  hidden = true; // Rules screen closed: no re-draw
  run('en');
  assert.strictEqual(ctx.lang, 'en');
  assert.deepStrictEqual(buttons.map((b) => b.cls.has('active')), [true, false, true, false]);
  assert.deepStrictEqual(calls.rules, ['es']);

  run('xx'); // unknown → English
  assert.strictEqual(ctx.lang, 'en');
});

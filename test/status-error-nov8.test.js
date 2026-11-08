'use strict';
// Nov 8, 2026 (Dannel): "not the draw phase" / "not the discard phase" stuck
// under the hand while the table said it WAS that phase. The status line was
// never cleared and a second tap raced the first action.
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function clientFn(name, prelude = '') {
  const m = APP.match(new RegExp(`window\\.${name}\\s*=\\s*([^;]+);`));
  assert.ok(m, name);
  return new Function(`${prelude}\nreturn (${m[1]});`)();
}
const ERRK = APP.match(/const ERR_KEYS = (\{[^}]+\});/)[1];

test('server errors are translated through the EN/ES tables', () => {
  const errText = clientFn('__errText', `const ERR_KEYS = ${ERRK};`);
  const es = { errNotDrawPhase: 'Ya has robado. Descarta una carta.' };
  assert.strictEqual(errText('not the draw phase', (k) => es[k]), es.errNotDrawPhase);
  assert.strictEqual(errText('room full (7 humans)', (k) => k), 'room full (7 humans)');
  for (const k of Object.values(eval(`(${ERRK})`))) {
    assert.ok(APP.includes(`    ${k}: '`), `${k} defined`);
    assert.strictEqual(APP.split(`    ${k}: '`).length - 1, 2, `${k} in EN and ES`);
  }
});

test('a phase error from an action the state already moved past is dropped', () => {
  const stale = clientFn('__staleActionError');
  assert.strictEqual(stale('not the draw phase', '0|0|draw|true', '0|0|discard|true'), true);
  assert.strictEqual(stale('not the discard phase', '0|0|discard|true', '0|1|draw|false'), true);
  assert.strictEqual(stale('not the draw phase', '0|0|draw|true', '0|0|draw|true'), false);
  assert.strictEqual(stale('you do not hold that card', 'a', 'b'), false, 'real errors stay');
});

test('status key changes with turn and phase, and render clears the line', () => {
  const key = clientFn('__statusKey');
  assert.notStrictEqual(key({ turnSeat: 0, phase: 'draw', isYourTurn: true }), key({ turnSeat: 0, phase: 'discard', isYourTurn: true }));
  assert.notStrictEqual(key({ turnSeat: 0, phase: 'draw', isYourTurn: true }), key({ turnSeat: 1, phase: 'draw', isYourTurn: false }));
  const render = APP.slice(APP.indexOf('function render() {'), APP.indexOf('function render() {') + 2500);
  assert.match(render, /if \(sk !== _statusKey\) \{ _statusKey = sk; \$\('status'\)\.textContent = ''; \}/);
});

test('only one game action is in flight at a time (no duplicate draw/discard)', () => {
  for (const fn of ['async function apiPost', 'async function doDiscard']) {
    const body = APP.slice(APP.indexOf(fn), APP.indexOf(fn) + 900);
    assert.match(body, /if \(_actionBusy\) return;/, fn);
    assert.match(body, /finally \{ _actionBusy = false; \}/, fn);
  }
  assert.ok(!/\$\('status'\)\.textContent = res\.error/.test(APP), 'no raw server text');
});

'use strict';

// Oct 29, 2026 (Dannel): YOUR TURN must not appear while a bot's move is still
// replaying on the table (watched turns, ui-and-design.md §6a). The banner, the
// phase pill and the marker over the table wait for the replay (state.shadow) to
// end; the controls still follow the server.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function clientFn(name) {
  const defs = [...APP.matchAll(new RegExp(`window\\.${name}\\s*=\\s*([^;]+);`, 'g'))].map((m) => m[1]);
  assert.strictEqual(defs.length, 1, `expected one window.${name}`);
  return new Function(`return (${defs[0]});`)();
}

test('__yourTurnShown: only your turn AND no replay running shows YOUR TURN', () => {
  const shown = clientFn('__yourTurnShown');
  assert.strictEqual(shown({ isYourTurn: true }, false), true);
  assert.strictEqual(shown({ isYourTurn: true }, true), false, 'bot still moving: hold it');
  assert.strictEqual(shown({ isYourTurn: false }, false), false);
  assert.strictEqual(shown({ isYourTurn: false }, true), false);
  assert.strictEqual(shown(null, false), false);
});

test('render() drives banner, pill and marker from the held value, controls from the server', () => {
  const body = APP.slice(APP.indexOf('function render() {'));
  const head = body.slice(0, body.indexOf('renderTableSeats(v);'));
  assert.match(head, /const replaying = !!state\.shadow;/);
  assert.match(head, /const mineShown = window\.__yourTurnShown\(live, replaying\);/);
  assert.match(head, /\} else if \(mineShown\) \{\s*const phaseLabel/, 'turn banner waits');
  assert.match(head, /\} else if \(mineShown && !v\.gameOver\) \{/, 'phase pill waits');
  assert.match(head, /renderTurnMarker\(v, mineShown, replaying\);/, 'marker waits');
  assert.ok(!/else if \(v\.isYourTurn/.test(head), 'no indicator reads the live isYourTurn directly');
  assert.match(head, /const canAct = !!live\.isYourTurn;/, 'controls still follow the server');
  const marker = APP.slice(APP.indexOf('function renderTurnMarker('), APP.indexOf('function renderLayoff('));
  assert.match(marker, /const mine = lo \? !!lo\.isYourTurn && !replaying : !!mineShown;/);
});

test('playWatch clears the shadow and re-renders when the replay finishes', () => {
  const pw = APP.slice(APP.indexOf('async function playWatch()'), APP.indexOf('function ingestSteps('));
  assert.match(pw, /if \(finished\) \{\s*state\.watchQueue = \[\];\s*state\.shadow = null;\s*state\.watchPlaying = false;\s*render\(\);/);
});

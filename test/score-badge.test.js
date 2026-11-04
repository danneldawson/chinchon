'use strict';

// Nov 3, 2026 (Dannel): "on the score make the numbers on a different color
// that the font in the name, make the numbers black over a white square or
// circle and perhaps bigger". Applies wherever a score sits next to a name:
// the in-game scoreboard, the game-over board and the lobby match cards.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

function fnSource(name) {
  const start = APP.indexOf(`function ${name}(`);
  let i = APP.indexOf('{', start); let depth = 0;
  for (; i < APP.length; i++) { if (APP[i] === '{') depth++; else if (APP[i] === '}' && --depth === 0) break; }
  return APP.slice(start, i + 1);
}

test('scoreBadge wraps the number (escaped) in a .score-badge span', () => {
  const escapeHtml = new Function(`${fnSource('escapeHtml')}; return escapeHtml;`)();
  const scoreBadge = new Function('escapeHtml', `${fnSource('scoreBadge')}; return scoreBadge;`)(escapeHtml);
  assert.strictEqual(scoreBadge(47), '<span class="score-badge">47</span>');
  assert.strictEqual(scoreBadge('–'), '<span class="score-badge">–</span>');
});

test('scoreboard, game over and lobby match cards all use the badge', () => {
  assert.match(APP, /\$\{escapeHtml\(p\.name\)\} \$\{scoreBadge\(score\)\}/, 'in-game scoreboard');
  assert.match(APP, /'go-score score-badge'/, 'game-over board');
  assert.match(APP, /mc-row.*\$\{scoreBadge\(p\.total\)\}/, 'lobby match card');
});

test('the badge is bold black on white, bigger than the name text', () => {
  const rule = CSS.slice(CSS.indexOf('.score-badge {'), CSS.indexOf('}', CSS.indexOf('.score-badge {')));
  assert.match(rule, /background: #fff/);
  assert.match(rule, /color: #000/);
  assert.match(rule, /font-weight: 800/);
  assert.match(rule, /font-size: 1\.1\d*em/);
  assert.match(rule, /border-radius: 999px/);
});

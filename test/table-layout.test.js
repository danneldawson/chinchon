// The game board is a table: opponents around an oval rim, the stock and a
// discard tray in the centre, you at the near rim, and a turn ring.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8');

test('table wraps the seats, the stock, the discard tray and the near-rim seat', () => {
  const table = html.slice(html.indexOf('id="table"'), html.indexOf('id="reshuffle-note"'));
  for (const id of ['opponents', 'center', 'stock', 'discard-zone', 'discard-tray', 'discard', 'discard-top', 'me-seat']) {
    assert.ok(table.includes(`id="${id}"`), `#${id} is inside #table`);
  }
  // Only the top card is drawable: the tray is outside #discard and inert.
  const discardEl = table.slice(table.indexOf('id="discard"'));
  assert.ok(table.indexOf('id="discard-tray"') < table.indexOf('id="discard"'), 'tray sits before (left of) the top card');
  assert.ok(!discardEl.slice(0, discardEl.indexOf('</div>\n          </div>')).includes('discard-tray'), 'tray is not inside #discard');
  assert.match(css, /\.tray-card \{[^}]*pointer-events: none/, 'tray cards are not clickable');
  // The existing pile handlers are unchanged.
  assert.match(js, /\$\('stock'\)\.onclick = \(\) => \{ if \(state\.view && state\.view\.isYourTurn && state\.view\.phase === 'draw'\) doDraw\('stock'\); \};/);
  assert.match(js, /\$\('discard'\)\.onclick = \(\) => \{ if \(state\.view && state\.view\.isYourTurn && state\.view\.phase === 'draw'\) doDraw\('discard'\); \};/);
});

test('seat angles spread 1-6 opponents over the far rim without collisions', () => {
  const src = js.slice(js.indexOf('function seatAngle('), js.indexOf('function renderTableSeats('));
  const seatAngle = new Function(`${src}; return seatAngle;`)();
  for (let n = 1; n <= 6; n++) {
    for (const maxSpan of [160, 140]) {
      const a = Array.from({ length: n }, (_, i) => seatAngle(i, n, maxSpan));
      assert.ok(a.every((d) => d >= 190 && d <= 350), `n=${n}: angles stay on the far rim (${a})`);
      for (let i = 1; i < n; i++) assert.ok(a[i] - a[i - 1] >= 25, `n=${n}: seats at least 25deg apart`);
      if (n === 1) assert.strictEqual(a[0], 270, 'a lone opponent sits straight across');
    }
  }
});

test('tray shows the discards under the top card, read from discardHistory', () => {
  const fn = js.slice(js.indexOf('function renderDiscardTray('), js.indexOf('// The big whose-turn marker'));
  assert.match(fn, /v\.discardHistory/);
  assert.match(fn, /hist\.slice\(0, -1\)\.slice\(-TRAY_MAX\)/, 'excludes the top card, keeps the last few');
  assert.match(js, /const TRAY_MAX = 4;/);
});

test('turn ring orbits (CSS animation) and respects prefers-reduced-motion', () => {
  assert.match(css, /@keyframes seatOrbit/);
  assert.match(css, /\.seat\.turn\.mid-move \{ animation: seatPulse/);
  const reduced = css.split('@media (prefers-reduced-motion: reduce)').slice(1).join('');
  assert.match(reduced, /\.seat\.turn::before \{ background: #ffcf4d; animation: none !important; \}/);
  assert.match(js, /el\.className = 'seat opp' \+ \(turn \? ' turn active' : ''\) \+ \(turn && midMove \? ' mid-move' : ''\)/);
});

'use strict';

// Nov 27, 2026 (Dannel, live game in room ABLE): the closer pressed Confirmar
// with one run laid, got "too many leftover cards", then laid the second run,
// and the old refusal stayed on screen as if the close were stuck. Any arrange
// edit must clear that refusal.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function body(name) {
  const start = APP.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = APP.indexOf('\nfunction ', start + 1);
  return APP.slice(start, next);
}

test('clearArrangeError empties the status line', () => {
  assert.match(body('clearArrangeError'), /\$\('status'\)[\s\S]*textContent = ''/);
});

test('every arrange edit clears an old refusal', () => {
  const tap = body('arrangeTap');
  assert.strictEqual((tap.match(/clearArrangeError\(\)/g) || []).length, 3, 'lifting a card, joining a group, and selecting');
  assert.match(body('makeMeld'), /clearArrangeError\(\)/);
});

// Nov 27, 2026 (Dannel, same game): four 11s could not be laid as one set,
// because three group on their own and the fourth had nowhere to go.
test('a loose card that extends a laid group joins it (fourth 11 for -10)', () => {
  const vm = require('node:vm');
  const tap = body('arrangeTap');
  const legal = body('legalMeld');
  const hand = [
    { id: 'a', rank: 11, suit: 'Oros' }, { id: 'b', rank: 11, suit: 'Copas' },
    { id: 'c', rank: 11, suit: 'Espadas' }, { id: 'd', rank: 11, suit: 'Bastos' },
    { id: 'e', rank: 4, suit: 'Copas' },
  ];
  const ctx = { state: { closeMode: { groups: [], sel: new Set(), msg: '' }, view: { yourHand: hand } }, render() {}, clearArrangeError() {}, window: {} };
  vm.createContext(ctx);
  vm.runInContext(legal + '\n' + tap, ctx);
  ['a', 'b', 'c'].forEach((id) => ctx.arrangeTap(id));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.state.closeMode.groups)), [['a', 'b', 'c']]);
  ctx.arrangeTap('d');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.state.closeMode.groups)), [['a', 'b', 'c', 'd']], 'fourth 11 joins the set');
  ctx.arrangeTap('e');
  assert.deepStrictEqual(JSON.parse(JSON.stringify([...ctx.state.closeMode.sel])), ['e'], 'a card that fits no group is just selected');
});

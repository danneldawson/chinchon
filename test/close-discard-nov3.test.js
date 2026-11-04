'use strict';

// Item 11 (Dannel, Nov 3, 2026): the closing process.
//   - Holding 6-6-6, 4-4-4, 7, 1 and laying the two sets, the discard must be
//     the 7 (the HIGHER leftover) so the 1 stays as the leftover (<= 5).
//   - Default = highest-value leftover that still leaves a legal close; a tap
//     overrides it. Bots use the same preference (turn.closeOptions).
//   - R44: "once this step of laying down melds is done, the turn should pass
//     to the next player without the closer having to do anything else".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const scoring = require('../src/scoring');
const turn = require('../src/turn');
const bot = require('../src/bot');
const lo = require('../src/layoff-interactive');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });

const SIX = [c(6, 'Copas'), c(6, 'Espadas'), c(6, 'Bastos')];
const FOUR = [c(4, 'Copas'), c(4, 'Espadas'), c(4, 'Bastos')];
const SEVEN = c(7, 'Oros');
const ONE = c(1, 'Copas'); // not the wild (that is the 1 de Oros)
const DANNEL8 = [...SIX, ...FOUR, SEVEN, ONE];

function fnSource(name) {
  const start = APP.indexOf(`function ${name}(`);
  let i = APP.indexOf('{', start); let depth = 0;
  for (; i < APP.length; i++) { if (APP[i] === '{') depth++; else if (APP[i] === '}' && --depth === 0) break; }
  return APP.slice(start, i + 1);
}
const client = new Function(
  `${fnSource('closeCardValue')}\n${fnSource('defaultDiscardAmong')}\n${fnSource('closeDiscardFor')}\nreturn { defaultDiscardAmong, closeDiscardFor };`,
)();

test("Dannel's hand: with 6-6-6 and 4-4-4 laid, the default discard is the 7, keeping the 1", () => {
  const d = scoring.defaultCloseDiscard(DANNEL8, [SIX, FOUR]);
  assert.strictEqual(d && d.id, '7-Oros-0');
  const keep1 = scoring.validateDeclaredClose(DANNEL8.filter((x) => x.id !== '7-Oros-0'), [SIX, FOUR]);
  assert.strictEqual(keep1.ok, true);
  assert.strictEqual(keep1.score, 1);
  const keep7 = scoring.validateDeclaredClose(DANNEL8.filter((x) => x.id !== '1-Copas-0'), [SIX, FOUR]);
  assert.strictEqual(keep7.ok, false, 'throwing the 1 keeps the 7 (> 5): not a close');
});

test('client close mode marks the same default (7) and a single tap overrides it', () => {
  const groups = [SIX.map((x) => x.id), FOUR.map((x) => x.id)];
  assert.strictEqual(client.closeDiscardFor({ groups, sel: new Set() }, DANNEL8), '7-Oros-0');
  assert.strictEqual(client.closeDiscardFor({ groups, sel: new Set(['1-Copas-0']) }, DANNEL8), '1-Copas-0', 'tap wins');
  assert.strictEqual(client.closeDiscardFor({ groups, sel: new Set(['1-Copas-0', '7-Oros-0']) }, DANNEL8), null);
  assert.strictEqual(client.closeDiscardFor({ groups: [], sel: new Set() }, DANNEL8), null, 'no melds yet: nothing marked');
});

test('client default agrees with the engine on assorted leftovers', () => {
  const cases = [
    [c(7, 'Oros'), c(1, 'Copas')],
    [c(12, 'Oros'), c(5, 'Copas')],
    [c(12, 'Oros'), c(6, 'Oros')], // no legal close: none
    [c(1, 'Oros'), c(10, 'Bastos')], // the wild (0) stays
  ];
  for (const left of cases) {
    const hand = [...SIX, ...FOUR, ...left];
    const eng = scoring.defaultCloseDiscard(hand, [SIX, FOUR]);
    const cli = client.defaultDiscardAmong(left);
    assert.strictEqual(cli && cli.id, eng && eng.id, left.map((x) => x.id).join(','));
  }
});

function discardState(hand) {
  return { phase: 'discard', turn: 0, hands: [hand, []] };
}

test("bots: on Dannel's hand the bot closes by throwing the 7 (score 1)", () => {
  const opts = turn.closeOptions(discardState(DANNEL8));
  assert.strictEqual(opts[0].discard.id, '7-Oros-0');
  assert.strictEqual(opts[0].score, 1);
  const pick = bot.chooseTurn(discardState(DANNEL8), 'aggressive');
  assert.strictEqual(pick.close, true);
  assert.strictEqual(pick.card.id, '7-Oros-0');
});

test('bots: when throwing the highest card would break a meld, a lower card goes', () => {
  // 10-11-12 de Copas, 5-5-5, 2, 7: throwing any 10/11/12 breaks the run, so
  // the highest legal discard is the 7 (leftover 2).
  const hand = [c(10, 'Copas'), c(11, 'Copas'), c(12, 'Copas'), c(5, 'Oros'), c(5, 'Espadas'), c(5, 'Bastos'), c(2, 'Bastos'), c(7, 'Espadas')];
  const opts = turn.closeOptions(discardState(hand));
  assert.ok(opts.length >= 1);
  assert.strictEqual(opts[0].discard.id, '7-Espadas-0');
  assert.strictEqual(opts[0].score, 2);
  assert.ok(!opts.some((o) => o.discard.rank >= 10), 'no 10/11/12 discard closes');
  assert.strictEqual(bot.chooseTurn(discardState(hand), 'aggressive').card.id, '7-Espadas-0');
});

// ---------------------------------------------------------------- R44 engine

function begun(closerKept, others, groups) {
  const verdict = scoring.validateDeclaredClose(closerKept, groups);
  assert.strictEqual(verdict.ok, true);
  const s = lo.beginLayoff([closerKept, ...others], 0, [0, 1, 2].slice(0, 1 + others.length), verdict);
  return lo.openPastCloser(s);
}

test('R44: after the close the turn is already the next player; the closer never acts', () => {
  const kept = DANNEL8.filter((x) => x.id !== '7-Oros-0');
  const s = begun(kept, [[c(2, 'Oros'), c(3, 'Oros'), c(4, 'Oros'), c(9 > 7 ? 10 : 9, 'Bastos'), c(11, 'Bastos'), c(12, 'Oros'), c(12, 'Copas')]], [SIX, FOUR]);
  assert.strictEqual(lo.currentPlayer(s), 1, 'next player is up straight away');
  assert.strictEqual(s.ready[0], false, 'closer still has their last word (R29)');
  lo.layMeld(s, [c(2, 'Oros'), c(3, 'Oros'), c(4, 'Oros')]);
  const r = lo.declareReady(s);
  // The wrap reached the closer: played for them (1 de Copas fits nothing), round ends.
  assert.strictEqual(r.phase, 'done');
  assert.strictEqual(s.scores[0], 1);
});

test('R44: the closer\'s last word sheds a leftover that now fits, for 0', () => {
  const a = [c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas')];
  const b = [c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')];
  const kept = [...a, ...b, c(3, 'Oros')];
  const s = begun(kept, [[c(4, 'Oros'), c(5, 'Oros'), c(6, 'Oros'), c(10, 'Bastos'), c(12, 'Bastos'), c(12, 'Copas'), c(2, 'Espadas')]], [a, b]);
  assert.strictEqual(lo.currentPlayer(s), 1);
  lo.layMeld(s, [c(4, 'Oros'), c(5, 'Oros'), c(6, 'Oros')]);
  lo.declareReady(s);
  assert.strictEqual(s.phase, 'done');
  assert.strictEqual(s.scores[0], 0, 'the 3 de Oros went onto 4-5-6 de Oros for them');
  assert.strictEqual(s.closerAuto.shed.length, 1);
});

test('R44: a clean -10 close is counted at once and never comes back to the closer', () => {
  const set4 = [c(4, 'Oros'), c(4, 'Copas'), c(4, 'Espadas'), c(4, 'Bastos')];
  const run3 = [c(10, 'Oros'), c(11, 'Oros'), c(12, 'Oros')];
  const s = begun([...set4, ...run3], [[c(2, 'Bastos'), c(3, 'Bastos'), c(5, 'Copas'), c(6, 'Espadas'), c(7, 'Bastos'), c(10, 'Copas'), c(12, 'Bastos')]], [set4, run3]);
  assert.strictEqual(s.ready[0], true);
  assert.strictEqual(s.scores[0], -10);
  assert.strictEqual(lo.currentPlayer(s), 1);
  lo.declareReady(s);
  assert.strictEqual(s.phase, 'done');
});

// ---------------------------------------------------------- closer's screen

test("closer's screen: lay-off buttons only on your own lay-off turn, else a passive status", () => {
  const src = fnSource('renderLayoff');
  assert.match(src, /const myTurn = lo\.isYourTurn && !lo\.done;/);
  for (const b of ['layBtn', 'readyBtn', 'passBtn']) {
    assert.match(src, new RegExp(`${b}\\.classList\\.toggle\\('hidden', !myTurn\\)`));
  }
  assert.match(src, /else if \(!myTurn\) \{\s*\$\('layoff-status'\)\.textContent = t\('waitingLayoff'\);/);
  assert.match(APP, /waitingLayoff: 'Esperando a los demás…'/);
});

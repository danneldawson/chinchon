#!/usr/bin/env node
'use strict';
/* Read-only deck + card-face audit for an engine-first card game.
 *
 * Written for the Chinchón project layout: pure engine modules in src/ that can
 * be require()d (buildDeck / isWild / cardValue in cards.js, the validators in
 * melds.js, startRound in turn.js) and a browser client in public/.
 *
 * It CHANGES NOTHING — it only reads modules and files. Use it to answer 'audit
 * the cards' without hand-typing the checks:
 *
 *   node scripts/cards-audit.js
 *   node scripts/cards-audit.js /path/to/project      # or export CHINCHON_ROOT
 *
 * Exit code 0 = all checks passed, 1 = at least one failed, 2 = wrong project.
 *
 * The composition/discard expectations below are the Chinchón house ruleset
 * (80 cards = two 40-card Spanish decks, no 8s/9s, wild = the 1 de Oros, max one
 * wild per meld). Change these counts for a different game; the METHOD is the
 * reusable part. Rules authority: rules/house-rules.md in this knowledge pack
 * (originally Hermes' references/chinchon-ruleset.md).
 *
 * Note (Oct 2, 2026): two checks below still encode the engine's OLD behaviour:
 * 'run does not wrap at the ends (12,1,2)' and 'wild scores 1'. Dannel has since
 * ruled that runs DO wrap from 12 to 1 (house-rules.md R37) and that the wild
 * scores 0 (R38). The engine hasn't been changed yet; flip both checks in the same
 * change that updates src/melds.js and src/cards.js.
 *
 * Source: Hermes Agent skill game-rules-engine-first/scripts/cards-audit.js
 * (Sep 12, 2026). Behaviour unchanged; only this header was edited.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.argv[2] || process.env.CHINCHON_ROOT ||
  path.join(os.homedir(), 'Desktop', 'chinchon');

for (const rel of ['src/cards.js', 'src/melds.js', 'src/turn.js', 'public/app.js', 'public/style.css']) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`not a card-game project at ${ROOT} (missing ${rel})`);
    console.error('pass the project path as argv[2] or set CHINCHON_ROOT');
    process.exit(2);
  }
}

const cards = require(path.join(ROOT, 'src/cards.js'));
const melds = require(path.join(ROOT, 'src/melds.js'));
const { startRound } = require(path.join(ROOT, 'src/turn.js'));

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

// ------------------------------------------------------------- A. deck model
const deck = cards.buildDeck();
check('deck is 80 cards', deck.length === 80, `got ${deck.length}`);
check('exactly 4 suits', new Set(cards.SUITS).size === 4, cards.SUITS.join(', '));
check('suits are Oros/Copas/Espadas/Bastos',
  ['Oros', 'Copas', 'Espadas', 'Bastos'].every((s) => cards.SUITS.includes(s)),
  cards.SUITS.join(', '));
check('ranks are 1-7,10,11,12',
  [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].every((r) => cards.RANKS.includes(r)) && cards.RANKS.length === 10,
  cards.RANKS.join(','));
const countRank = (r) => deck.filter((c) => c.rank === r).length;
check('no 8s', countRank(8) === 0, `${countRank(8)} found`);
check('no 9s', countRank(9) === 0, `${countRank(9)} found`);

const faces = new Map();
for (const c of deck) {
  const key = `${c.rank}-${c.suit}`;
  faces.set(key, (faces.get(key) || 0) + 1);
}
const badFaces = [...faces.entries()].filter(([, n]) => n !== 2);
check('all 40 faces exist exactly twice', faces.size === 40 && badFaces.length === 0,
  `distinct=${faces.size} wrong=${JSON.stringify(badFaces)}`);

const ids = deck.map((c) => c.id);
check('ids unique across BOTH decks', new Set(ids).size === 80, `unique=${new Set(ids).size}`);
check('ids carry a deck marker', new Set(deck.map((c) => c.deckId)).size === 2,
  `deckIds=${[...new Set(deck.map((c) => c.deckId))].join(',')}`);

const wilds = deck.filter(cards.isWild);
check('exactly 2 wilds in play', wilds.length === 2, `got ${wilds.length}`);
check('wilds are both the 1 de Oros',
  wilds.every((c) => c.rank === 1 && c.suit === 'Oros'), wilds.map(cards.cardName).join(' | '));
check('the other 1s are NOT wild',
  deck.filter((c) => c.rank === 1 && c.suit !== 'Oros').every((c) => !cards.isWild(c)),
  'the wild is one EXISTING card, not an extra one');

const valueBad = deck.filter((c) => cards.cardValue(c) !== (c.rank <= 7 ? c.rank : 10));
check('deadwood values: 1-7 face, 10/11/12 = 10', valueBad.length === 0,
  valueBad.map(cards.cardName).join(', '));
check('wild scores 1', cards.cardValue({ rank: 1, suit: 'Oros' }) === 1);

// --------------------------------------------------------------- B. meld rules
const C = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });
const WILD = C(1, 'Oros');
check('run bridges the 8/9 gap (7,10,11,12 same suit)',
  melds.isValidRun([C(7, 'Copas'), C(10, 'Copas'), C(11, 'Copas'), C(12, 'Copas')]));
check('run does not wrap at the ends (12,1,2 same suit)',
  !melds.isValidRun([C(12, 'Oros'), C(1, 'Oros'), C(2, 'Oros')]));
check('run rejects a missing interior card (7,10,12)',
  !melds.isValidRun([C(7, 'Oros'), C(10, 'Oros'), C(12, 'Oros')]));
check('run rejects duplicate ranks from the 2nd deck',
  !melds.isValidRun([C(5, 'Oros', 0), C(5, 'Oros', 1), C(6, 'Oros', 0)]));
check('run rejects mixed suits',
  !melds.isValidRun([C(5, 'Oros'), C(6, 'Copas'), C(7, 'Espadas')]));
check('set of same rank across duplicate suits is valid',
  melds.isValidSet([C(5, 'Copas', 0), C(5, 'Copas', 1), C(5, 'Espadas', 0)]));
check('set rejects mixed ranks', !melds.isValidSet([C(5, 'Copas'), C(6, 'Copas'), C(7, 'Copas')]));
check('ONE wild allowed in a meld', melds.isValidMeld([C(7, 'Oros'), C(11, 'Oros'), WILD]));
check('TWO wilds rejected, even to win',
  !melds.isValidMeld([C(1, 'Oros', 0), C(1, 'Oros', 1), C(5, 'Copas')]), 'comodin cap = 1 per meld');
check('a meld needs 3+ cards', !melds.isValidMeld([C(5, 'Oros'), C(6, 'Oros')]));
check('MAX_WILDS_PER_MELD is 1', melds.MAX_WILDS_PER_MELD === 1);

// ---------------------------------------------------------------- C. the deal
const deckIds = new Set(ids);
for (let n = 2; n <= 7; n++) {
  const st = startRound(n);
  const handCards = st.hands.flat();
  const total = st.stock.length + st.discard.length + handCards.length;
  const dealt = [...st.stock, ...st.discard, ...handCards].map((c) => c.id);
  check(`${n}p: stock + discard + hands = 80`, total === 80,
    `stock=${st.stock.length} discard=${st.discard.length} hands=${handCards.length}`);
  check(`${n}p: every hand is 7`, st.hands.every((h) => h.length === 7),
    st.hands.map((h) => h.length).join(','));
  check(`${n}p: no card appears twice in play`, new Set(dealt).size === 80,
    `distinct=${new Set(dealt).size}`);
  check(`${n}p: one card face up at the deal`, st.discard.length === 1,
    `discard=${st.discard.length}`);
  check(`${n}p: every dealt card comes from the real deck`, dealt.every((id) => deckIds.has(id)));
}
for (const n of [1, 8]) {
  let threw = false;
  try { startRound(n); } catch { threw = true; }
  check(`startRound rejects ${n} player(s)`, threw);
}

// ------------------------------------- D. presentation layer (static, no browser)
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

const emblemSrc = (appSrc.match(/function suitEmblem[\s\S]*?\n}/) || [''])[0];
for (const suit of cards.SUITS) {
  const covered = emblemSrc.includes(`case '${suit}'`) || (suit === 'Bastos' && /default:/.test(emblemSrc));
  check(`emblem exists for ${suit}`, covered, covered ? '' : 'no case and no default covers it');
}
check('the last suit is reached via `default:` (silent fallback)',
  /default:/.test(emblemSrc),
  'an unknown/misspelled suit silently renders the fallback emblem');

const iconLine = (appSrc.match(/const SUIT_ICON = \{[^}]*\}/) || [''])[0];
for (const suit of cards.SUITS) check(`SUIT_ICON has ${suit}`, iconLine.includes(`${suit}:`));
check('cardLabel cannot print ? for a real suit',
  cards.SUITS.every((s) => iconLine.includes(`${s}:`)));

for (const cls of ['.card', '.card-mini', '.discard-top', '.meld-chip']) {
  const missing = cards.SUITS.filter((s) => !cssSrc.includes(`${cls}.${s.toLowerCase()}`));
  check(`CSS colours all 4 suits for ${cls}`, missing.length === 0, missing.join(','));
}
check('every suit colour is distinct', (() => {
  const cols = cards.SUITS.map((s) =>
    (cssSrc.match(new RegExp(`\\.card\\.${s.toLowerCase()} \\{ color: ([^;]+);`)) || [])[1]);
  return cols.every(Boolean) && new Set(cols).size === 4;
})());

check('wild shows the star on a full card', /__isWild\(c\) \? '<span class="wild"/.test(appSrc));
check('wild gets a gold border',
  /has-wild/.test(appSrc) && /\.card\.has-wild \{ border-color: #c9971b; \}/.test(cssSrc));
check('discard renders the star too', /isWild \? '<span class="wild"/.test(appSrc));
check('ranks render as numbers (no letters)',
  /<span class="rank">\$\{c\.rank\}<\/span>/.test(appSrc));

const isWildDefs = (appSrc.match(/window\.__isWild = /g) || []).length;
check('single wild-detection helper in the client', isWildDefs === 1,
  `found ${isWildDefs} — a client-side mirror of engine rules can drift silently`);

check('card back CSS points at the photo asset',
  /url\("card-back\.jpg"\)/.test(cssSrc) && fs.existsSync(path.join(ROOT, 'public/card-back.jpg')));
check('discard stack has no card backs behind it',
  !/discard-back/.test(htmlSrc) && !/discard-back/.test(cssSrc));
check('stock + discard piles are the same size',
  /\.pile-stock \.stock-stack \{ position: relative; width: 66px; height: 96px; \}/.test(cssSrc) &&
  /\.discard-stack \{ position: relative; width: 66px; height: 96px; \}/.test(cssSrc));

// ------------------------------------------------------------------ report
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks passed\n`);
for (const r of results) {
  console.log(`  ${r.ok ? '\u2714' : '\u2718'} ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
if (fails.length) {
  console.log('\nFAILED:');
  for (const f of fails) console.log(`  - ${f.name}: ${f.detail}`);
}
console.log(`\n${fails.length === 0 ? 'ALL CHECKS PASSED' : `${fails.length} CHECK(S) FAILED`}`);
process.exit(fails.length ? 1 : 0);

'use strict';

// Oct 5, 2026 (Dannel): the game screen must fit the viewport with NO page
// scrolling, on desktop and on phones in portrait and landscape, for 2-7
// players and a 7- or 8-card hand. Layout/sizing only. These are CSS/JS
// guards in the style of phone-chat.test.js; the real check is a headless
// browser run (scrollHeight <= innerHeight at 390x844, 360x740, 844x390,
// 740x360, 1280x800, 1366x650, 1920x1080).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8');

// The fit section is appended at the end of style.css so it wins the cascade.
const fit = css.slice(css.indexOf('Fit to the viewport (Oct 5, 2026)'));

function block(src, header) {
  const i = src.indexOf(header);
  assert.ok(i !== -1, `missing block: ${header}`);
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('unterminated block ' + header);
}
const rule = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = src.match(new RegExp(`(^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `missing rule ${sel}`);
  return m[2];
};

test('fit section exists and comes after the old phone block (so it overrides it)', () => {
  assert.ok(css.indexOf('Fit to the viewport (Oct 5, 2026)') > css.indexOf('@media (max-width: 640px)'));
});

test('game screen is a viewport-capped column; only the table flexes', () => {
  const game = rule(fit, '#game');
  assert.match(game, /display:\s*flex/);
  assert.match(game, /flex-direction:\s*column/);
  assert.match(game, /max-height:\s*calc\(100dvh - 16px\)/);
  assert.match(game, /max-height:\s*calc\(100vh - 16px\)/, 'vh fallback for browsers without dvh');
  assert.match(rule(fit, '#game > *'), /flex-shrink:\s*0/);
  const table = rule(fit, '#game > #table');
  assert.match(table, /flex:\s*1 1 430px/, 'never taller than the old 430px table');
  assert.match(table, /height:\s*auto/);
  assert.match(table, /container:\s*table \/ size/, 'piles and seats scale with the table');
});

test('piles and seats scale with the table, capped at their old sizes', () => {
  assert.match(rule(fit, '#center'), /--pc-h:\s*clamp\(46px, min\(26cqh, 24cqw\), 96px\)/);
  assert.match(fit, /@container table \(max-width: 560px\) or \(max-height: 330px\)/);
});

test('hand is one row; cards size to the row (36-66px) so 8 cards + the arrow fit', () => {
  const hand = rule(fit, '#hand');
  assert.match(hand, /flex-wrap:\s*nowrap/);
  assert.match(hand, /overflow-x:\s*auto/, 'last resort: swipe inside the hand, never the page');
  assert.match(hand, /--hc-w:\s*clamp\(36px, calc\(\(100cqw - 8 \* var\(--hgap\) - 4px\) \/ 8\.4\), 66px\)/);
  const card = rule(fit, '#hand .card');
  assert.match(card, /width:\s*var\(--hc-w\)/);
  assert.match(card, /height:\s*calc\(var\(--hc-w\) \* 1\.4545\)/, 'same 66x96 proportions');
  assert.match(rule(fit, '#your-area'), /container:\s*hand \/ inline-size/);
});

test('phones (portrait): collapsed chat is a compact in-flow bar under the hand', () => {
  const phone = block(fit, '@media (max-width: 640px)');
  assert.match(rule(phone, '#game'), /max-height:\s*calc\(100dvh - 8px\)/);
  assert.match(rule(phone, '#chat.collapsed'), /margin:\s*4px 0 env\(safe-area-inset-bottom, 0px\)/);
  assert.ok(html.indexOf('id="chat"') > html.indexOf('id="hand"'), 'chat is after the hand in the DOM');
});

test('phones (landscape): table left, the rest right; chat bar at the foot of the right column', () => {
  const land = block(fit, '@media (orientation: landscape) and (max-height: 500px)');
  const game = rule(land, '#game');
  assert.match(game, /display:\s*grid/);
  assert.match(game, /height:\s*calc\(100dvh - 8px\)/);
  assert.match(game, /grid-template-columns:\s*minmax\(0, 45fr\) minmax\(0, 55fr\)/);
  assert.match(rule(land, '#game > *'), /grid-column:\s*2/);
  assert.match(rule(land, '#game > #table'), /grid-column:\s*1;\s*grid-row:\s*1 \/ -1/);
  const collapsed = rule(land, '#game > #chat.collapsed');
  assert.match(collapsed, /position:\s*static/);
  assert.match(collapsed, /grid-row:\s*13/);
  assert.match(rule(land, '#chat'), /position:\s*fixed/, 'expanded chat is an overlay sheet');
  // The arrow hint only on the room chat, not the lobby chat head.
  assert.match(land, /#chat \.chat-head::after/);
  assert.ok(!/\n\s*\.chat-head::after/.test(land));
});

test('JS: landscape phones count as compact (seat arc + chat starts collapsed)', () => {
  assert.match(js, /const COMPACT_MQ = '\(max-width: 640px\), \(orientation: landscape\) and \(max-height: 500px\)';/);
  assert.match(js, /const narrow = window\.matchMedia && window\.matchMedia\(COMPACT_MQ\)\.matches;/);
  assert.match(js, /if \(window\.matchMedia\(COMPACT_MQ\)\.matches\) \$\('chat'\)\.classList\.add\('collapsed'\);/);
  // Defined before the top-level chat-collapse line runs.
  assert.ok(js.indexOf('const COMPACT_MQ') < js.indexOf("matchMedia(COMPACT_MQ).matches) $('chat')"));
});

test('wide desktop: the chat floats in the margin beside the board, not over it', () => {
  const wide = block(fit, '@media (min-width: 1280px) and (min-height: 501px)');
  assert.match(rule(wide, '#chat'), /position:\s*fixed;\s*top:\s*64px;\s*right:\s*auto;\s*left:\s*calc\(50% \+ 376px\)/);
  assert.match(css, /#app \{ max-width: 760px;/, 'board width the gutter maths relies on');
});

test('lobby fills the viewport; its list and chat log scroll inside their panels', () => {
  assert.match(rule(fit, '#app:has(> #globby:not(.hidden) > #lobby-main:not(.hidden))'), /height:\s*100dvh/);
  assert.match(rule(fit, '#lobby-main #lobby-members'), /overflow-y:\s*auto/);
  assert.match(rule(fit, '#lobby-main #lobby-chat-log'), /overflow-y:\s*auto/);
});

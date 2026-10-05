'use strict';

// Oct 4, 2026 (Dannel):
//  1. The WhatsApp share button is gone from the room waiting screen; the room
//     code and the Copy button stay.
//  2. On phones the collapsed Room chat bar was fixed to the bottom of the
//     screen and covered the last cards of the hand. Collapsed, it now sits in
//     the page flow below the hand; expanded, it is a bottom sheet.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8');

test('no WhatsApp share button or string anywhere in the client', () => {
  for (const src of [html, js]) {
    assert.ok(!/btn-share-wa|shareWhatsApp|whatsapp/i.test(src));
  }
});

test('waiting screen keeps the room code and the Copy button', () => {
  const room = html.slice(html.indexOf('<div id="room-info"'), html.indexOf('id="btn-host-start"'));
  assert.match(room, /id="room-code"/);
  assert.match(room, /id="btn-copy-code"/);
});

function phoneBlock() {
  const i = css.indexOf('@media (max-width: 640px)');
  assert.ok(i !== -1);
  // Walk braces to the end of the media block.
  let depth = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(i, j + 1);
  }
  throw new Error('unterminated media block');
}

test('phone: collapsed chat is in the page flow (cannot cover the hand); expanded is a bottom sheet', () => {
  const block = phoneBlock();
  const collapsed = block.match(/#chat\.collapsed\s*\{([^}]*)\}/);
  assert.ok(collapsed, 'phone block styles #chat.collapsed');
  assert.match(collapsed[1], /position:\s*static/);
  assert.ok(!/position:\s*(fixed|absolute|sticky)/.test(collapsed[1]));
  const expanded = block.match(/\n\s*#chat\s*\{([^}]*)\}/);
  assert.match(expanded[1], /position:\s*fixed/);
  assert.match(expanded[1], /bottom:\s*0/);
  assert.match(expanded[1], /safe-area-inset-bottom/);
  // The DOM puts the chat after the hand, so in-flow means "below the hand".
  assert.ok(html.indexOf('id="chat"') > html.indexOf('id="hand"'));
});

test('desktop chat float is unchanged', () => {
  assert.match(css, /#chat \{ position: absolute; top: 56px; right: 14px; width: 230px;/);
});

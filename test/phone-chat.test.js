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

// Oct 23, 2026 (Dannel): the in-game chat sat right under the hand, so it
// looked like part of playing the cards. It is now a round bubble floating over
// a free corner of the table on every screen size; tapping it opens the chat
// as a panel over the table. The old collapsed strip under the hand is gone.

test('in-game chat is a floating bubble + overlay panel (no strip under the hand)', () => {
  assert.match(html, /<button id="chat-bubble"[^>]*aria-controls="chat"/);
  assert.match(html, /id="chat-badge"/);
  assert.match(html, /id="btn-chat-close"/);
  for (const id of ['chat', 'chat-log', 'chat-input', 'btn-chat-send']) assert.match(html, new RegExp(`id="${id}"`));
  const bubble = css.match(/\n\.chat-bubble\s*\{([^}]*)\}/)[1];
  assert.match(bubble, /position:\s*fixed/);
  assert.match(bubble, /border-radius:\s*50%/);
  assert.match(bubble, /width:\s*52px;\s*height:\s*52px/);
  const panel = css.match(/\n#chat\s*\{([^}]*)\}/)[1];
  assert.match(panel, /position:\s*fixed/);
  assert.match(panel, /display:\s*none/, 'closed until the bubble is tapped');
  assert.match(css, /#chat\.open:not\(\.hidden\)\s*\{\s*display:\s*flex/);
  assert.ok(!/#chat\.collapsed|chat-head::after/.test(css), 'old collapsed strip CSS removed');
  assert.ok(!/classList\.(add|toggle)\('collapsed'\)/.test(js), 'no collapse toggling left');
});

test('bubble is pinned to the table corner; X, bubble and Esc close; unread badge', () => {
  assert.match(js, /function placeChatBubble\(\)/);
  assert.match(js, /\$\('table'\)/);
  assert.match(js, /--cb-right/);
  assert.match(js, /\$\('chat-bubble'\)\.addEventListener\('click', \(\) => setChatOpen\(!chatIsOpen\(\)\)\)/);
  assert.match(js, /\$\('btn-chat-close'\)\.addEventListener\('click', \(\) => setChatOpen\(false\)\)/);
  assert.match(js, /e\.key === 'Escape' && chatIsOpen\(\)/);
  assert.match(js, /if \(fresh && !chatIsOpen\(\) && m\.name !== myName\) _chatUnread\+\+;/);
});

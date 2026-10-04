// Landing page = title, tagline, language buttons, name input and ONE
// "Join lobby" button. Solo / multiplayer / rejoin choices live in the lobby.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const section = (startId, endId) => {
  const a = html.indexOf(`id="${startId}"`);
  const b = html.indexOf(`id="${endId}"`);
  assert.ok(a >= 0 && b > a, `${startId} before ${endId}`);
  return html.slice(a, b);
};

test('landing has only the Join lobby button (no Solo, no rejoin row)', () => {
  const landing = section('lobby-enter', 'lobby-main');
  assert.match(landing, /id="btn-go-lobby"[^>]*data-i18n="joinLobby"/);
  assert.ok(!html.includes('id="btn-solo-play"'), 'btn-solo-play removed');
  assert.ok(!js.includes('btn-solo-play'), 'no JS reference to btn-solo-play');
  assert.ok(!landing.includes('id="rejoin-row"'), 'rejoin row moved off the landing page');
  assert.match(js, /joinLobby: 'Join lobby'/);
  assert.match(js, /joinLobby: 'Entrar al lobby'/);
  assert.match(js, /\$\('btn-go-lobby'\)\.onclick = enterLobby;/);
});

test('lobby offers Play solo, Multiplayer room, Join room and Rejoin', () => {
  const lobby = html.slice(html.indexOf('id="lobby-main"'));
  for (const id of ['btn-gameplay', 'btn-go-create', 'btn-go-join', 'rejoin-row', 'rejoin-code', 'btn-rejoin']) {
    assert.ok(lobby.includes(`id="${id}"`), `${id} in the lobby screen`);
  }
  // Play solo still starts a solo game directly.
  assert.match(js, /\$\('btn-gameplay'\)\.onclick = \(\) => \{[^}]*createRoom\('private', 2, false, false, 'solo'\)/);
});

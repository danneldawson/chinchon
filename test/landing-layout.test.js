// Landing page = title, tagline, language buttons, name input and ONE
// "Join lobby" button. Solo / multiplayer choices live in the lobby. The manual
// Rejoin box (room code + Rejoin button) was removed from the game entirely.
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

test('landing has only the Join lobby button (no Solo button)', () => {
  const landing = section('lobby-enter', 'lobby-main');
  assert.match(landing, /id="btn-go-lobby"[^>]*data-i18n="joinLobby"/);
  assert.ok(!html.includes('id="btn-solo-play"'), 'btn-solo-play removed');
  assert.ok(!js.includes('btn-solo-play'), 'no JS reference to btn-solo-play');
  assert.match(js, /joinLobby: 'Join lobby'/);
  assert.match(js, /joinLobby: 'Entrar al lobby'/);
  assert.match(js, /\$\('btn-go-lobby'\)\.onclick = enterLobby;/);
});

test('lobby offers Play solo, Multiplayer room and Join room', () => {
  const lobby = html.slice(html.indexOf('id="lobby-main"'));
  for (const id of ['btn-gameplay', 'btn-go-create', 'btn-go-join', 'join-code', 'btn-join']) {
    assert.ok(lobby.includes(`id="${id}"`), `${id} in the lobby screen`);
  }
  // Join room (enter a friend's code) is still wired.
  assert.match(js, /\$\('btn-join'\)\.onclick = async/);
  // Play solo still starts a solo game directly.
  assert.match(js, /\$\('btn-gameplay'\)\.onclick = \(\) => \{[^}]*createRoom\('private', 2, false, false, 'solo'\)/);
});

test('manual Rejoin UI is gone everywhere (HTML and JS)', () => {
  for (const id of ['rejoin-row', 'rejoin-code', 'btn-rejoin', 'rejoin-msg']) {
    assert.ok(!html.includes(`id="${id}"`), `${id} removed from index.html`);
    assert.ok(!js.includes(`'${id}'`), `no app.js reference to ${id}`);
  }
});

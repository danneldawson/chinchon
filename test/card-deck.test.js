'use strict';

// The host picks a visual deck when creating a room. The original emblem deck
// stays the default (omitted, unknown, and rooms saved before this field all
// come back as "classic"). "stained-glass" is stored on the room and sent to
// every player, including someone who joins later. Card faces for that deck
// are files the client asks for only once a room is using it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { SUITS, RANKS } = require('../src/cards');
const { createServer, rooms, _internals } = require('../server');

const PUB = path.join(__dirname, '..', 'public');
const DECK = path.join(PUB, 'decks', 'stained-glass');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');

function clientStainedGlassSrc() {
  const start = APP.indexOf('const SG_SUIT_FILE');
  const end = APP.indexOf('function chosenCardDeck');
  assert.ok(start >= 0 && end > start, 'stained-glass helpers missing');
  return new Function(APP.slice(start, end) + '\nreturn stainedGlassSrc;')();
}

function api(base, method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + p);
    const req = http.request({
      method, hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      headers: data ? { 'Content-Type': 'application/json' } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        const type = String(res.headers['content-type'] || '');
        if (type.includes('json')) {
          try { json = JSON.parse(buf.toString()); } catch { json = null; }
        }
        resolve({ status: res.statusCode, type, json, buf });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('stained-glass files cover every rank and suit, and nothing else is fetched up front', () => {
  const src = clientStainedGlassSrc();
  const names = new Set();
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const file = `${String(rank).padStart(2, '0')}-${suit.toLowerCase()}.webp`;
      names.add(file);
      assert.strictEqual(src({ suit, rank }), '/decks/stained-glass/' + file, `${rank} de ${suit}`);
      assert.ok(fs.existsSync(path.join(DECK, file)), file);
    }
  }
  assert.strictEqual(names.size, 40);
  // No joker file: the wild is the 1 de Oros, which the set includes.
  assert.strictEqual(src({ suit: 'Oros', rank: 1 }), '/decks/stained-glass/01-oros.webp');
  assert.strictEqual(src({ suit: 'Oros', rank: 8 }), '');
  assert.strictEqual(src({ suit: 'Joker', rank: 1 }), '');
  assert.strictEqual(src(null), '');

  let bytes = 0;
  for (const name of fs.readdirSync(DECK)) {
    assert.ok(name.endsWith('.webp'), name);
    bytes += fs.statSync(path.join(DECK, name)).size;
  }
  assert.ok(fs.existsSync(path.join(DECK, 'preview.webp')));
  // The source PNGs were ~4.5MB. Keep the shipped set small.
  assert.ok(bytes < 400 * 1024, `deck assets grew to ${bytes} bytes`);

  assert.doesNotMatch(HTML, /src="\/decks\//, 'the page must not request deck art on load');
  assert.doesNotMatch(CSS, /url\([^)]*decks/, 'CSS must not url() the deck');
  const show = APP.slice(APP.indexOf('function showCreatePane'), APP.indexOf('function showWaitingView'));
  assert.match(show, /deck-stained-preview/);
  assert.match(show, /\/decks\/stained-glass\/preview\.webp/);
  const note = APP.slice(APP.indexOf('function noteCardDeck'), APP.indexOf('function usingStainedGlass'));
  assert.match(note, /deck === 'stained-glass'/);
  assert.match(note, /warmStainedGlass\(\)/);
});

test('the create-room picker is a labelled, keyboard-operable choice and classic is the default', () => {
  const pane = HTML.slice(HTML.indexOf('id="create-choices"'), HTML.indexOf('id="create-status"'));
  assert.match(pane, /<fieldset id="deck-picker"/);
  assert.match(pane, /<legend[^>]*data-i18n="deckLabel"/);
  assert.match(pane, /name="card-deck" value="classic" checked/);
  assert.match(pane, /name="card-deck" value="stained-glass"/);
  assert.match(pane, /data-i18n="deckClassic"/);
  assert.match(pane, /data-i18n="deckStained"/);
  // The preview image is decorative; the radio's name is the visible text.
  assert.match(pane, /id="deck-stained-preview" alt=""/);
  assert.doesNotMatch(pane, /id="deck-stained-preview"[^>]*src=/);
  for (const line of [
    "deckLabel: 'Card deck'", "deckClassic: 'Classic'", "deckStained: 'Stained Glass'",
    "deckLabel: 'Baraja'", "deckClassic: 'Clásica'", "deckStained: 'Vitral'",
  ]) {
    assert.ok(APP.includes(line), line);
  }
  assert.match(APP, /createRoom\(visibility, bots, learning, tutorial, mode, chosenCardDeck\(\)\)/);
  assert.match(APP, /if \(deck === 'stained-glass' \|\| deck === 'classic'\) payload\.deck = deck/);
  // Play solo still does not pass a deck, so it stays on the default.
  assert.match(APP, /\$\('btn-gameplay'\)\.onclick = \(\) => \{[^}]*createRoom\('private', 2, false, false, 'solo'\)/);
});

test('a room remembers the deck the host picked, and a later player gets the same one', async () => {
  rooms.clear();
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const omitted = await api(base, 'POST', '/api/room/new', { mode: 'multi', name: 'Host', visibility: 'private' });
    assert.strictEqual(omitted.json && omitted.status, 200);
    const classicView = await api(base, 'GET', `/api/state?code=${omitted.json.code}&seat=${omitted.json.seatId}`);
    assert.strictEqual(classicView.json.cardDeck, 'classic');
    assert.strictEqual(rooms.get(omitted.json.code).cardDeck, 'classic');

    const made = await api(base, 'POST', '/api/room/new', {
      mode: 'multi', name: 'Host', visibility: 'private', deck: 'stained-glass',
    });
    assert.strictEqual(made.status, 200);
    const hostWaiting = await api(base, 'GET', `/api/state?code=${made.json.code}&seat=${made.json.seatId}`);
    assert.strictEqual(hostWaiting.json.started, false);
    assert.strictEqual(hostWaiting.json.cardDeck, 'stained-glass');

    const joined = await api(base, 'POST', '/api/room/join', { code: made.json.code, name: 'Later' });
    assert.strictEqual(joined.status, 200);
    const guestWaiting = await api(base, 'GET', `/api/state?code=${made.json.code}&seat=${joined.json.seatId}`);
    assert.strictEqual(guestWaiting.json.cardDeck, 'stained-glass');

    assert.strictEqual((await api(base, 'POST', '/api/room/start', { code: made.json.code, seat: made.json.seatId })).status, 200);
    const hostPlaying = await api(base, 'GET', `/api/state?code=${made.json.code}&seat=${made.json.seatId}`);
    const guestPlaying = await api(base, 'GET', `/api/state?code=${made.json.code}&seat=${joined.json.seatId}`);
    assert.strictEqual(hostPlaying.json.cardDeck, 'stained-glass');
    assert.strictEqual(guestPlaying.json.cardDeck, 'stained-glass');
    assert.ok(hostPlaying.json.yourHand.length >= 7);
    const card = hostPlaying.json.yourHand[0];
    assert.ok(card.suit && card.rank && card.id);
    assert.strictEqual(card.src, undefined, 'art stays a client concern; the engine card is unchanged');

    const junk = await api(base, 'POST', '/api/room/new', { mode: 'solo', name: 'You', deck: 'fournier' });
    const junkView = await api(base, 'GET', `/api/state?code=${junk.json.code}&seat=${junk.json.seatId}`);
    assert.strictEqual(junkView.json.cardDeck, 'classic');

    const file = await api(base, 'GET', '/decks/stained-glass/01-oros.webp');
    assert.strictEqual(file.status, 200);
    assert.match(file.type, /image\/webp/);
    assert.ok(file.buf.length > 500);
    // A room that is not using the deck never points at these files. The
    // asset is still servable; the client is what stays lazy.
    assert.strictEqual(classicView.json.cardDeck, 'classic');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('a saved room with no cardDeck restores as classic, and stained-glass survives a restart', () => {
  rooms.clear();
  const old = _internals.createRoom({ mode: 'multi', name: 'Old', countdownMs: 60000 });
  delete old.cardDeck;
  const kept = _internals.createRoom({ mode: 'multi', name: 'Glass', countdownMs: 60000, deck: 'stained-glass' });
  assert.strictEqual(kept.cardDeck, 'stained-glass');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-deck-')), 'rooms.json');
  assert.ok(_internals.saveRooms(file));
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(raw.rooms.find((r) => r.code === old.code).cardDeck, undefined);
  assert.strictEqual(raw.rooms.find((r) => r.code === kept.code).cardDeck, 'stained-glass');
  rooms.clear();
  const savedAt = raw.savedAt;
  assert.strictEqual(_internals.loadRooms(file, savedAt), 2);
  assert.strictEqual(rooms.get(old.code).cardDeck, 'classic');
  assert.strictEqual(rooms.get(kept.code).cardDeck, 'stained-glass');
  assert.strictEqual(_internals.serialize(rooms.get(old.code), rooms.get(old.code).players[0].id).cardDeck, 'classic');
  assert.strictEqual(_internals.serialize(rooms.get(kept.code), rooms.get(kept.code).players[0].id).cardDeck, 'stained-glass');
});

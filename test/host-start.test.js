'use strict';

// Bug (Oct 4, 2026): in a room the player CREATES, the host's "Start game"
// button did nothing: its click handler was only wired in the join flow
// (btn-join), so the match only began when the 60s countdown ran out.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function body(startMarker) {
  const i = app.indexOf(startMarker);
  assert.ok(i !== -1, `missing ${startMarker}`);
  // Up to the next top-level declaration.
  const rest = app.slice(i + startMarker.length);
  const j = rest.search(/\n(?:async function |function |\$\(')/);
  return rest.slice(0, j === -1 ? undefined : j);
}

test('the host Start game button exists in the waiting view', () => {
  assert.match(html, /id="btn-host-start"/);
});

test('one wireHostStart() helper owns the Start game click handler', () => {
  const fn = body('function wireHostStart()');
  assert.match(fn, /\$\('btn-host-start'\)/);
  assert.match(fn, /\.onclick\s*=/);
  assert.match(fn, /\/api\/room\/start/);
  assert.match(fn, /disabled = false/, 're-enables a button left disabled by a previous room');
  // Nobody else assigns the handler (no duplicate copies drifting apart).
  const assigns = app.match(/btn-host-start'\)[\s\S]{0,40}?\.onclick\s*=|startBtn\.onclick\s*=/g) || [];
  assert.strictEqual(assigns.length, 1);
});

test('createRoom (host path) AND the join flow both wire the Start button', () => {
  assert.match(body('async function createRoom('), /wireHostStart\(\)/, 'createRoom must wire Start game');
  assert.match(body("$('btn-join').onclick = async () => {"), /wireHostStart\(\)/, 'join flow must wire Start game');
});

// The client shows Start game to a LONE host only in a private room, keyed on
// res.visibility; the pre-start state never sent it, so the button stayed hidden.
test('pre-start /api/state tells the host the room visibility (so a lone private host sees Start)', async () => {
  const http = require('http');
  const { createServer } = require('../server');
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, b) => new Promise((resolve, reject) => {
    const d = b ? JSON.stringify(b) : null; const u = new URL(base + p);
    const req = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: d ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c)); res.on('end', () => resolve(JSON.parse(buf)));
    });
    req.on('error', reject); if (d) req.write(d); req.end();
  });
  try {
    for (const vis of ['private', 'public']) {
      const r = await call('POST', '/api/room/new', { mode: 'multi', name: 'Host', visibility: vis, bots: 0 });
      const v = await call('GET', `/api/state?code=${r.code}&seat=${r.seatId}`);
      assert.strictEqual(v.started, false);
      assert.strictEqual(v.isHost, true);
      assert.strictEqual(v.visibility, vis);
      // Mirror the client's rule in watchRoom(): lone host => button only in private rooms.
      const humans = v.lobby.filter((p) => !p.isBot).length;
      const show = v.isHost && (humans >= 2 || (v.visibility === 'private' && humans >= 1));
      assert.strictEqual(show, vis === 'private');
      // And a lone private host's Start really starts (bots fill in).
      if (vis === 'private') {
        assert.ok((await call('POST', '/api/room/start', { code: r.code, seat: r.seatId })).ok);
        const after = await call('GET', `/api/state?code=${r.code}&seat=${r.seatId}`);
        assert.strictEqual(after.started, true);
      }
    }
  } finally { await new Promise((r) => server.close(r)); }
});

// Bug found while verifying the Start fix (Oct 4, 2026): leave a match with
// "Leave match", start another game in the same tab, and the first poll of the
// new game saw the OLD room's session token, treated it as a takeover and
// showed the "displaced" screen (state.code = null) as the match began.
test('a session token from a previous seat never displaces you from the next game', () => {
  const pollFn = body('async function poll()');
  const guard = pollFn.indexOf('state.sessionSeat !== state.seatId');
  const compare = pollFn.indexOf('res.sessionToken !== state.sessionToken');
  assert.ok(guard !== -1 && compare !== -1 && guard < compare, 'poll() must drop a token that belongs to another seat before comparing');
  // Every place that takes a new seat resets the token.
  const seatAssigns = app.match(/state\.seatId = res\.seatId;\n\s*state\.sessionToken = null;/g) || [];
  assert.strictEqual(seatAssigns.length, (app.match(/state\.seatId = res\.seatId;/g) || []).length);
  // Leaving a match forgets the token too.
  assert.match(body("$('btn-leave-match').onclick = async () => {"), /state\.sessionToken = null/);
});

'use strict';

// Server slice. Nov 3, 2026 (Dannel): the host may paste a voice-call link in the waiting
// room; once the table launches every player sees "Join voice call". Only https
// links to call.whatsapp.com, chat.whatsapp.com and facetime.apple.com are
// accepted, at most 300 characters, validated on the server.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

let server;
let base;
function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + p);
    const req = http.request({ method, hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      headers: data ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let json = {}; try { json = buf ? JSON.parse(buf) : {}; } catch { /* ignore */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
test.before(async () => {
  rooms.clear();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

const WA = 'https://call.whatsapp.com/voice/AbCdEf123';

test('server: the host sets it in the waiting room and every player sees it in game', async () => {
  const host = (await api('POST', '/api/room/new', { mode: 'multi', name: 'VoiceHost', visibility: 'private', bots: 0 })).json;
  const guest = (await api('POST', '/api/room/join', { code: host.code, name: 'VoiceGuest' })).json;
  rooms.get(host.code).pending.hold = true;
  assert.strictEqual((await api('POST', '/api/room/voice', { code: host.code, seat: guest.seatId, url: WA })).status, 403, 'guests cannot set it');
  const bad = await api('POST', '/api/room/voice', { code: host.code, seat: host.seatId, url: 'https://evil.example/x' });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await api('POST', '/api/room/voice', { code: host.code, seat: host.seatId, url: 'x'.repeat(5000) })).status, 400);
  const ok = await api('POST', '/api/room/voice', { code: host.code, seat: host.seatId, url: WA });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(rooms.get(host.code).voiceLink, { url: WA, host: 'call.whatsapp.com' });
  const waiting = (await api('GET', `/api/state?code=${host.code}&seat=${guest.seatId}`)).json;
  assert.strictEqual(waiting.voiceLink.url, WA, 'shown in the waiting room');
  assert.strictEqual((await api('POST', '/api/room/start', { code: host.code, seat: host.seatId })).status, 200);
  const inGame = (await api('GET', `/api/state?code=${host.code}&seat=${guest.seatId}`)).json;
  assert.ok(inGame.started);
  assert.deepStrictEqual(inGame.voiceLink, { url: WA, host: 'call.whatsapp.com' }, 'every player gets it in game');
  assert.strictEqual((await api('POST', '/api/room/voice', { code: host.code, seat: host.seatId, url: '' })).status, 409, 'not changed mid-game');
});
test('no link: the view carries null; a tampered state file link is dropped on load', async () => {
  const solo = (await api('POST', '/api/room/new', { mode: 'solo', name: 'NoVoice', bots: 2 })).json;
  assert.strictEqual((await api('GET', `/api/state?code=${solo.code}&seat=${solo.seatId}`)).json.voiceLink, null);
  const snap = JSON.parse(JSON.stringify(_internals.snapshot()));
  const r = snap.rooms.find((x) => x.code === solo.code);
  r.voiceLink = { url: 'javascript:alert(1)', host: 'x' };
  const file = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'chinchon-voice-')), 'rooms.json');
  fs.writeFileSync(file, JSON.stringify(snap));
  rooms.clear();
  _internals.loadRooms(file);
  assert.strictEqual(rooms.get(solo.code).voiceLink, null);
});

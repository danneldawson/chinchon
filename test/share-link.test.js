'use strict';

// Room link (Oct 18, 2026, Dannel). The host's waiting screen shows a link to
// the room (https://<origin>/?room=CODE) with Copy link and, where the device
// has one, the native Share sheet. Opening the link takes you to that room,
// but the name is the gate: with no saved name you go through the landing name
// entry first, and only after it does the link join. No WhatsApp button.
//
// The pure helpers are EVALUATED from the client source (as in
// client-cards.test.js); the flow is guarded on the source; and the server is
// checked to serve the app on the link URL. The real flow is a headless run.

const fs = require('fs');
const path = require('path');
const http = require('http');
const test = require('node:test');
const assert = require('node:assert');

const PUB = path.join(__dirname, '..', 'public');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

function clientFn(name) {
  const defs = [...APP.matchAll(new RegExp(`window\\.${name}\\s*=\\s*(.+);\\n`, 'g'))].map((m) => m[1]);
  assert.strictEqual(defs.length, 1, `expected exactly 1 definition of window.${name}`);
  return new Function(`return (${defs[0]});`)();
}
function fnBody(name) {
  const i = APP.indexOf(name);
  assert.ok(i !== -1, `missing ${name}`);
  return APP.slice(i, i + 1600);
}

test('link format is <origin>/?room=CODE', () => {
  const linkFor = clientFn('__roomLinkFor');
  assert.strictEqual(linkFor('https://chinchon-production.up.railway.app', 'LUNA'),
    'https://chinchon-production.up.railway.app/?room=LUNA');
});

test('the room code is read back from the link, and junk is ignored', () => {
  const fromSearch = clientFn('__roomFromSearch');
  const linkFor = clientFn('__roomLinkFor');
  assert.strictEqual(fromSearch(new URL(linkFor('http://x', 'LUNA')).search), 'LUNA');
  assert.strictEqual(fromSearch('?room=luna'), 'LUNA');
  assert.strictEqual(fromSearch('?room=%20casa%20'), 'CASA');
  for (const bad of ['', '?', '?room=', '?room=AB', '?room=TOOLONG', '?room=L1NA', '?room=<b>x', '?code=LUNA']) {
    assert.strictEqual(fromSearch(bad), null, `should ignore ${JSON.stringify(bad)}`);
  }
});

test('waiting screen has the link row: Copy link + Share (hidden until navigator.share), no WhatsApp', () => {
  assert.match(HTML, /id="share-link-row" class="share-buttons hidden"/);
  assert.match(HTML, /id="share-link" type="text" readonly/);
  assert.match(HTML, /id="btn-copy-link"[^>]*>Copy link</);
  assert.match(HTML, /id="btn-share-link" class="small hidden"[^>]*>Share</);
  assert.match(HTML, /id="btn-copy-code"/, 'the room code Copy button stays');
  assert.doesNotMatch(HTML + APP, /whatsapp|wa\.me|btn-share-wa/i);
  const room = HTML.slice(HTML.indexOf('id="room-info"'), HTML.indexOf('id="btn-host-start"'));
  assert.match(room, /id="share-link-row"/, 'the link row lives in the waiting view');
  const show = fnBody('function showShareLink(');
  assert.match(show, /typeof navigator\.share !== 'function'/, 'Share hides where navigator.share is missing');
  assert.match(APP, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(APP, /navigator\.share\(\{ title: 'Chinchon', url:/);
});

test('only the host of a multiplayer room gets the link (not joiners, solo or tutorial)', () => {
  const waiting = fnBody('function showWaitingView()').slice(0, 400);
  assert.match(waiting, /\$\('share-link-row'\)\.classList\.add\('hidden'\)/, 'every waiting view starts without the link');
  const create = fnBody('async function createRoom(');
  assert.match(create, /showWaitingView\(\);\n\s*if \(mode === 'multi' && !learning && !tutorial\) showShareLink\(res\.code\);/);
  assert.strictEqual(APP.split('showShareLink(res.code)').length - 1, 1, 'only createRoom reveals the link');
});

test('opening the link: saved name joins straight away; no name waits for the name entry', () => {
  const boot = fnBody('(function boot()');
  // Read once, then drop ?room from the address bar so a refresh does not re-join.
  assert.match(boot, /window\.__roomFromSearch\(location\.search\)/);
  assert.match(boot, /history\.replaceState\(null, '', location\.pathname\)/);
  const linkBranch = boot.slice(boot.indexOf('if (linkRoom) {'));
  assert.match(linkBranch, /const saved = loadLobby\(\);/);
  assert.match(linkBranch, /saved\.name\)\.trim\(\)\.length >= 3\) \{[\s\S]*?joinByCode\(linkRoom\);[\s\S]*?return;/);
  // Without a saved name it only remembers the room; it never joins from boot.
  const noName = linkBranch.slice(linkBranch.indexOf('// No name yet'));
  assert.match(noName.slice(0, 200), /state\.linkRoom = linkRoom;/);
  assert.strictEqual(boot.split('joinByCode(').length - 1, 1, 'boot joins only on the saved-name path');
});

test('after the name entry succeeds, the remembered room is joined (the name is the gate)', () => {
  const enter = fnBody('async function enterLobby()');
  const ok = enter.indexOf('persistLobby(res.token, res.name);');
  const err = enter.indexOf('if (!res || res.error)');
  const join = enter.indexOf('joinByCode(code);');
  assert.ok(err !== -1 && ok > err && join > ok, 'join only after the server accepted the name');
  assert.match(enter, /if \(state\.linkRoom\) \{\s*const code = state\.linkRoom;\s*state\.linkRoom = null;/);
});

test('a bad, expired or full code shows the server error on the join pane', () => {
  const join = fnBody('async function joinByCode(');
  assert.match(join, /if \(res\.error\) \{[\s\S]*?showJoinPane\(\);[\s\S]*?\$\('join-code'\)\.value = code;[\s\S]*?\$\('join-msg'\)\.textContent = res\.error;[\s\S]*?return;/);
  // The Join room button goes through the same path.
  assert.match(APP, /\$\('btn-join'\)\.onclick = \(\) => \{[\s\S]{0,200}joinByCode\(code\);/);
});

test('server serves the app on the link URL, and join errors read clearly', async () => {
  const { createServer } = require('../server');
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => new Promise((resolve, reject) => {
    http.get(base + p, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
  });
  const post = (p, body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(b || '{}') }));
    });
    req.on('error', reject); req.write(data); req.end();
  });
  try {
    const page = await get('/?room=LUNA');
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="share-link-row"/);
    const missing = await post('/api/room/join', { code: 'ZZZZ', name: 'Ana' });
    assert.strictEqual(missing.json.error, 'no such room');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

'use strict';
// Dannel, Nov 26: an iPad tab opened before a redeploy kept the old close
// buttons. Every state now carries the build id, and the page reloads once
// when it differs from the one it loaded with.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');

test('state carries the same build id the page was served with', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await fetch(base + '/').then((r) => r.text());
    const v = html.match(/app\.js\?v=([^"]+)"/)[1];
    const room = await fetch(base + '/api/room/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'solo', name: 'You', bots: 1 }) }).then((r) => r.json());
    const st = await fetch(`${base}/api/state?code=${room.code}&seat=${room.seatId}`).then((r) => r.json());
    assert.strictEqual(st.build, v);
  } finally { server.close(); }
});

test('the page reloads once on a new build, before acting on the state', () => {
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const poll = app.slice(app.indexOf('async function poll() {'));
  assert.ok(poll.indexOf('staleBuild(res.build)') > 0 && poll.indexOf('staleBuild(res.build)') < poll.indexOf('if (res.error'));
  assert.match(app, /chinchon-reloaded-for/);
});

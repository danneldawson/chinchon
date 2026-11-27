'use strict';
// Dannel, Nov 26: "I haven't played in days, and I still see my name in the
// lobby." An old tab re-entered itself with its saved token after restarts.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');

const post = (base, p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }));

test('an old tab re-entering with a token but no build is told to reload and adds no name', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const zombie = await post(base, '/api/lobby/enter', { name: 'Ghosty', token: 'stale-token' });
    assert.strictEqual(zombie.status, 409);
    assert.strictEqual(zombie.json.reload, true);
    const fresh = await post(base, '/api/lobby/enter', { name: 'Fresh', build: 'x' });
    assert.strictEqual(fresh.status, 200);
    const st = await fetch(`${base}/api/lobby/state?token=${fresh.json.token}`).then((r) => r.json());
    assert.ok(!st.members.some((m) => m.name === 'Ghosty'));
    assert.ok(st.build, 'lobby state carries the build id');
    const heal = await post(base, '/api/lobby/enter', { name: 'Fresh', token: fresh.json.token, build: 'x' });
    assert.strictEqual(heal.status, 200, 'a current page can still re-enter itself');
  } finally { server.close(); }
});

test('the lobby page sends its build and reloads on a new one', () => {
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.strictEqual((app.match(/\/api\/lobby\/enter', \{[^}]*build: PAGE_BUILD/g) || []).length, 2);
  const lp = app.slice(app.indexOf('async function lobbyPoll() {'));
  assert.ok(lp.indexOf('staleBuild(res.build)') > 0 && lp.indexOf('staleBuild(res.build)') < lp.indexOf("res.removed === 'idle'"));
});

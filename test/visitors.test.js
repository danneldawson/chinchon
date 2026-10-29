'use strict';

// Visitor counter (Oct 29, 2026): distinct real visitors per day in Pacific time,
// who is here now, no personal data, saved next to the rooms file.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const V = require('../src/visitors');

const CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// Oct 29, 2026 12:00 PT = 19:00 UTC
const NOON = Date.parse('2026-10-29T19:00:00Z');

test('classify: pages and API calls from browsers count; scripts, bots, health checks and assets do not', () => {
  assert.strictEqual(V.classify({ method: 'GET', path: '/', userAgent: CHROME }), 'visit');
  assert.strictEqual(V.classify({ method: 'GET', path: '/api/state', userAgent: CHROME }), 'visit');
  assert.strictEqual(V.classify({ method: 'POST', path: '/api/room/new', userAgent: CHROME }), 'play');
  assert.strictEqual(V.classify({ method: 'POST', path: '/api/lobby/enter', userAgent: MAC }), 'play');
  for (const ua of ['curl/8.4.0', 'node', 'undici', 'Python-urllib/3.11', 'python-requests/2.31',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'RailwayHealthCheck/1.0',
    'Mozilla/5.0 (compatible; UptimeRobot/2.0)', 'WhatsApp/2.23.20.0', '']) {
    assert.strictEqual(V.classify({ method: 'GET', path: '/', userAgent: ua }), 'excluded', ua || '(empty)');
  }
  for (const p of ['/api/activity', '/api/visitors', '/health', '/app.js', '/style.css', '/card-back.jpg']) {
    assert.strictEqual(V.classify({ method: 'GET', path: p, userAgent: CHROME }), 'skip', p);
  }
});

test('days are Pacific dates', () => {
  assert.strictEqual(V.dayOf(Date.parse('2026-10-30T06:59:00Z')), '2026-10-29'); // 11:59 PM PT
  assert.strictEqual(V.dayOf(Date.parse('2026-10-30T07:01:00Z')), '2026-10-30');
});

test('distinct visitors and players per day, active now, no IPs or user agents stored', () => {
  const log = V.createVisitorLog({ salt: 'test-salt' });
  log.record({ method: 'GET', path: '/', userAgent: CHROME, ip: '203.0.113.7' }, NOON);
  for (let i = 0; i < 50; i++) log.record({ method: 'GET', path: '/api/state', userAgent: CHROME, ip: '203.0.113.7' }, NOON + i * 1200);
  log.record({ method: 'POST', path: '/api/room/new', userAgent: CHROME, ip: '203.0.113.7' }, NOON + 1000);
  log.record({ method: 'GET', path: '/', userAgent: MAC, ip: '198.51.100.9' }, NOON + 2000);
  log.record({ method: 'GET', path: '/', userAgent: 'curl/8.4.0', ip: '198.51.100.9' }, NOON + 3000);
  log.record({ method: 'GET', path: '/api/activity', userAgent: 'node', ip: '198.51.100.9' }, NOON + 3000);

  let s = log.summary(NOON + 60000);
  assert.strictEqual(s.timeZone, 'America/Los_Angeles');
  assert.deepStrictEqual(s.today, { date: '2026-10-29', visitors: 2, players: 1, excluded: 1 });
  assert.strictEqual(s.activeNow, 2);
  s = log.summary(NOON + 2000 + V.ACTIVE_MS + 1);
  assert.strictEqual(s.activeNow, 1, 'the MAC visitor went quiet 5+ minutes ago; the phone polled later');
  assert.strictEqual(log.summary(NOON + 10 * V.ACTIVE_MS).activeNow, 0);

  const raw = JSON.stringify(log._data());
  for (const secret of ['203.0.113.7', '198.51.100.9', 'iPhone', 'Macintosh', 'curl']) {
    assert.ok(!raw.includes(secret), `stored data leaks ${secret}`);
  }

  // Next day: yesterday keeps only its counts (hashes dropped); a returning
  // visitor gets a new hash, so days cannot be linked.
  const yesterdayHash = log._data().days['2026-10-29'].v[0];
  const TOMORROW = NOON + 24 * 3600 * 1000;
  log.record({ method: 'GET', path: '/', userAgent: CHROME, ip: '203.0.113.7' }, TOMORROW);
  s = log.summary(TOMORROW);
  assert.deepStrictEqual(s.today, { date: '2026-10-30', visitors: 1, players: 0, excluded: 0 });
  assert.deepStrictEqual(s.days.map((d) => [d.date, d.visitors, d.players]), [['2026-10-30', 1, 0], ['2026-10-29', 2, 1]]);
  const days = log._data().days;
  assert.strictEqual(days['2026-10-29'].v, undefined, 'finished day keeps no hashes');
  assert.notStrictEqual(days['2026-10-30'].v[0], yesterdayHash);
});

test('the counter survives a restart through its file (and a corrupt file starts fresh)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-vis-'));
  const file = path.join(dir, 'visitors.json');
  const a = V.createVisitorLog({ file });
  a.record({ method: 'GET', path: '/', userAgent: CHROME, ip: '1.2.3.4' }, NOON);
  a.record({ method: 'POST', path: '/api/room/new', userAgent: CHROME, ip: '1.2.3.4' }, NOON);
  assert.strictEqual(a.save(), true);
  assert.strictEqual(a.save(), false, 'nothing new: no write');
  const b = V.createVisitorLog({ file });
  assert.strictEqual(b.load(), true);
  // Same person again after the restart is still ONE visitor (salt restored).
  b.record({ method: 'GET', path: '/', userAgent: CHROME, ip: '1.2.3.4' }, NOON + 5000);
  assert.deepStrictEqual(b.summary(NOON + 5000).today, { date: '2026-10-29', visitors: 1, players: 1, excluded: 0 });
  fs.writeFileSync(file, '{not json');
  const c = V.createVisitorLog({ file });
  assert.strictEqual(c.load(), false);
  assert.strictEqual(c.summary(NOON).today.visitors, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('defaultFile sits beside CHINCHON_STATE_FILE', () => {
  assert.strictEqual(V.defaultFile({ CHINCHON_STATE_FILE: '/data/rooms.json' }), '/data/visitors.json');
  assert.strictEqual(V.defaultFile({ CHINCHON_VISITORS_FILE: '/x/v.json', CHINCHON_STATE_FILE: '/data/rooms.json' }), '/x/v.json');
  assert.strictEqual(V.defaultFile({}), null);
});

test('clientIp uses the first X-Forwarded-For address', () => {
  assert.strictEqual(V.clientIp({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } }), '203.0.113.7');
  assert.strictEqual(V.clientIp({ headers: {}, socket: { remoteAddress: '::1' } }), '::1');
});

test('HTTP: GET /api/visitors counts browser visits and ignores scripts', async () => {
  const { createServer } = require('../server');
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const get = (p, ua, ip) => new Promise((resolve, reject) => {
    const headers = {};
    if (ua != null) headers['User-Agent'] = ua;
    if (ip) headers['X-Forwarded-For'] = ip;
    http.get({ hostname: '127.0.0.1', port, path: p, headers }, (res) => {
      let buf = ''; res.on('data', (c) => (buf += c)); res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    }).on('error', reject);
  });
  try {
    const before = JSON.parse((await get('/api/visitors', 'curl/8')).body);
    await get('/', CHROME, '203.0.113.50');
    await get('/api/lobby/state', CHROME, '203.0.113.50');
    await get('/', MAC, '203.0.113.51');
    await get('/', 'curl/8', '203.0.113.52');
    await get('/', null, '203.0.113.53');
    const r = await get('/api/visitors?days=3', 'curl/8');
    assert.strictEqual(r.status, 200);
    const s = JSON.parse(r.body);
    assert.strictEqual(s.today.visitors - before.today.visitors, 2);
    assert.strictEqual(s.today.excluded - before.today.excluded, 2);
    assert.ok(s.activeNow >= 2);
    assert.ok(s.days.length >= 1 && s.days.length <= 3);
    assert.ok(!/203\.0\.113/.test(r.body), 'no IP in the response');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

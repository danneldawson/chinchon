#!/usr/bin/env node
'use strict';
// Is it safe to push to main (which restarts the Railway server)?
// Rule: a deploy must NEVER kick players out of a match. Exit 0 = nobody is
// playing; exit 1 = someone is (or the check failed). With --wait it re-checks
// every 45s for up to 30 minutes and gives up (exit 1) rather than pushing.
//
//   node scripts/safe-to-deploy.js            # one check
//   node scripts/safe-to-deploy.js --wait     # hold until clear (max 30 min)
//   node scripts/safe-to-deploy.js && git push origin main
//
// Signal: GET /api/activity (any room started or counting down, any
// visibility incl. private and solo, with a human seen in the last 60s).
// Falls back to /api/lobby/state `matches` on a server that predates it; that
// list misses private rooms still in their countdown, so the fallback is weaker.
const BASE = process.env.CHINCHON_URL || 'https://chinchon-production.up.railway.app';
const WAIT = process.argv.includes('--wait');
const INTERVAL_MS = 45 * 1000;
const MAX_MS = 30 * 60 * 1000;

async function check() {
  const r = await fetch(`${BASE}/api/activity`, { cache: 'no-store' });
  if (r.ok) {
    const a = await r.json();
    return { busy: a.activeRooms > 0, detail: `${a.activeRooms} active room(s), ${a.activeHumans} human(s) ${JSON.stringify(a.rooms)}` };
  }
  const l = await (await fetch(`${BASE}/api/lobby/state`, { cache: 'no-store' })).json();
  const m = (l.matches || []);
  return { busy: m.length > 0, detail: `[fallback: /api/activity missing] ${m.length} match(es) in /api/lobby/state` };
}

(async () => {
  const start = Date.now();
  for (;;) {
    let res;
    try { res = await check(); } catch (e) { res = { busy: true, detail: `check failed: ${e.message}` }; }
    const stamp = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }) + ' PT';
    console.log(`${stamp} ${res.busy ? 'BUSY' : 'CLEAR'} ${res.detail}`);
    if (!res.busy) process.exit(0);
    if (!WAIT || Date.now() - start + INTERVAL_MS > MAX_MS) {
      console.log(WAIT ? 'Still busy after 30 minutes: HOLD the deploy.' : 'Busy: do not deploy now.');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
})();

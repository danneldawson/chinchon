#!/usr/bin/env node
'use strict';
// Who is playing Chinchon? Reads GET /api/visitors (counts only, Pacific days).
//
//   node scripts/visitors.js            # live server, last 14 days
//   node scripts/visitors.js 30         # last 30 days
//   CHINCHON_URL=http://localhost:3000 node scripts/visitors.js
//
// visitors = distinct browsers that opened the game that day
// players  = of those, how many entered the lobby or a room
// excluded = requests from scripts, bots and health checks (not counted)
const BASE = process.env.CHINCHON_URL || 'https://chinchon-production.up.railway.app';
const days = Number(process.argv[2]) || 14;

(async () => {
  const r = await fetch(`${BASE}/api/visitors?days=${days}`, { cache: 'no-store' });
  if (!r.ok) { console.error(`GET /api/visitors -> HTTP ${r.status} (is the server on a build that has it?)`); process.exit(1); }
  const s = await r.json();
  console.log(`Here now (last ${s.activeWindowMinutes} min): ${s.activeNow}`);
  console.log(`Today ${s.today.date}: ${s.today.visitors} visitor(s), ${s.today.players} player(s)`);
  console.log('');
  console.log('date        visitors  players  excluded');
  for (const d of s.days) {
    console.log(`${d.date}  ${String(d.visitors).padStart(8)}  ${String(d.players).padStart(7)}  ${String(d.excluded).padStart(8)}`);
  }
  console.log(`\n(${s.timeZone} days; checked ${s.checkedAt})`);
})().catch((e) => { console.error('visitors check failed:', e.message); process.exit(1); });

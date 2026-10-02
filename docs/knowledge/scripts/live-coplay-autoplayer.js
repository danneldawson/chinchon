// live-coplay-autoplayer.js - keep a live Chinchon game moving by auto-playing
// ONE seat (e.g. the agent's guest seat) while Dannel plays his own seat.
//
// PURPOSE
//   In a live 2-human game on Railway, auto-play the other seat unattended so
//   Dannel never has to prompt "your turn", while you inspect HIS seat's
//   /api/state (closeOptions etc.) to separate server bugs from client/cache bugs.
//
// USAGE
//   1. Join the room as a second player and note the returned seatId:
//        curl -s -X POST "https://chinchon-production.up.railway.app/api/room/join" \
//          -H "Content-Type: application/json" -d '{"code":"<ROOM>","name":"Guest2"}'
//   2. Run:  node live-coplay-autoplayer.js <ROOM> <SEAT_ID> [HOST]
//      HOST defaults to https://chinchon-production.up.railway.app
//      e.g.  node live-coplay-autoplayer.js WORD 123 > /tmp/coplay.out 2>&1 &
//   3. Tail the log; it prints a line per action and exits on game over / room gone.
//
// WHY curl AND NOT Node http
//   In Hermes' sandbox, Node's http/https requests to the Railway host silently
//   never completed, while curl worked. The loop therefore shells out to curl.
//   (Requires curl on PATH.)
//
// STRATEGY (diagnostic, not smart)
//   draw from stock; if closeOptions exist, close with option 0; otherwise discard
//   the first card in hand; during a lay-off call /api/layoff/auto (auto + Ready).
//
// Source: adapted from Hermes' chinchon-engineering/references/live-coplay.md
// (Aug 31, 2026): same loop, with CLI arguments instead of hard-coded
// placeholders and a log line per action.

const { execSync } = require('child_process');

const [code, mySeat, HOST = 'https://chinchon-production.up.railway.app'] = process.argv.slice(2);
if (!code || !mySeat) {
  console.error('usage: node live-coplay-autoplayer.js <ROOM> <SEAT_ID> [HOST]');
  process.exit(2);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function api(path, body) {
  const url = HOST + path;
  const args = body
    ? `-X POST -H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`
    : '';
  try {
    return JSON.parse(execSync(`curl -s -m 10 ${args} "${url}"`, { encoding: 'utf8' }) || '{}');
  } catch (e) {
    return { error: e.message };
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  while (true) {
    const me = api(`/api/state?code=${code}&seat=${mySeat}`);
    if (me.gone || me.gameOver) { log('game over / room gone'); break; }
    if (me.phase === 'layoff') {
      if (me.isYourTurn) { api('/api/layoff/auto', { code, seat: mySeat }); log('layoff auto'); }
      await wait(700);
      continue;
    }
    if (!me.isYourTurn) { await wait(700); continue; }
    if (me.phase === 'draw') {
      api('/api/draw', { code, seat: mySeat, from: 'stock' });
      log('draw ok');
      await wait(250);
      continue;
    }
    if (me.phase === 'discard') {
      const o = me.closeOptions || [];
      if (o.length) {
        api('/api/discard', { code, seat: mySeat, cardId: o[0].cardId, close: true, splitIdx: 0 });
        log('close');
      } else {
        api('/api/discard', { code, seat: mySeat, cardId: me.yourHand[0].id });
        log('discard ok');
      }
      await wait(250);
      continue;
    }
    await wait(700);
  }
})();

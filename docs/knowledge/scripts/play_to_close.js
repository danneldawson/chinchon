// play_to_close.js - drive a real Chinchon solo game over the HTTP API until a
// close becomes available, then attempt it.
//
// PURPOSE
//   Reproduce a specific game state (a legal close on the human's discard turn)
//   WITHOUT a browser. Browser automation caps page-eval at ~30s and freezes on
//   multi-turn loops, and closes are only occasional in random play.
//   Each human turn it logs isYourTurn / phase / canClose;
//   when a close appears it prints the serialized summary and calls
//   POST /api/discard with close:true. This separates SERVER bugs (data layer)
//   from CLIENT bugs (UI rendering): if the server sends canClose and the
//   close succeeds, the client's close mode (same endpoint) is the suspect.
//   During a lay-off it calls POST /api/layoff/ready so rounds keep progressing.
//   (Updated Oct 8, 2026 for the card-based close: melds are declared by id.)
//
// USAGE
//   cd ~/Desktop/chinchon && PORT=3000 node server.js &     # server on :3000
//   node /path/to/play_to_close.js
//   Output: ">>> CLOSE AVAILABLE: {...}", ">>> close result: {...}", "DONE"
//   (or "gameOver" if the match ended first). Gives up after 400 polls.
//
// NOTES
//   - Host/port are hard-coded to localhost:3000.
//   - It always discards the first card in hand when no close is offered, so it
//     is a diagnostic driver, not a strategy.
//   - Source: Hermes Agent skill chinchon-engineering/scripts/play_to_close.js
//     (Aug 20, 2026). Reformatted with this header; behaviour unchanged.

const http = require('http');

// Oct 8, 2026: the server only says canClose (no decompositions) and the closer
// declares their own melds. This diagnostic finds a legal declaration itself
// with the engine (repo-relative require), like a player reading their hand.
const { allCloseSplits } = require('../../../src/scoring');
function declareClose(hand) {
  for (let i = 0; i < hand.length; i++) {
    const sp = allCloseSplits(hand.filter((_, j) => j !== i))[0];
    if (sp) return { cardId: hand[i].id, melds: sp.melds.map((m) => m.map((c) => c.id)) };
  }
  return null;
}

const post = (p, b) => new Promise((res, rej) => {
  const d = JSON.stringify(b);
  const r = http.request(
    {
      host: 'localhost',
      port: 3000,
      path: p,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) },
    },
    (x) => {
      let s = '';
      x.on('data', (c) => (s += c));
      x.on('end', () => res(JSON.parse(s || '{}')));
    }
  );
  r.on('error', rej);
  r.write(d);
  r.end();
});

const get = (p) => new Promise((res, rej) => {
  http.get({ host: 'localhost', port: 3000, path: p }, (x) => {
    let s = '';
    x.on('data', (c) => (s += c));
    x.on('end', () => res(JSON.parse(s || '{}')));
  }).on('error', rej);
});

(async () => {
  const room = await post('/api/room/new', {
    mode: 'solo', name: 'Me', visibility: 'private', bots: 2, lobbyToken: null,
  });
  const code = room.code, seat = room.seatId;

  for (let turn = 0; turn < 400; turn++) {
    const st = await get(`/api/state?code=${code}&seat=${seat}`);
    const phase = st.phase;
    const isYours = st.isYourTurn;
    const decl = st.canClose ? declareClose(st.yourHand) : null;

    if (st.gameOver) { console.log('gameOver'); break; }

    if (phase === 'layoff') {
      await post('/api/layoff/ready', { code, seat }).catch(() => {});
      await new Promise((r) => setTimeout(r, 30));
      continue;
    }
    if (!isYours) { await new Promise((r) => setTimeout(r, 40)); continue; }
    if (phase === 'draw') {
      await post('/api/draw', { code, seat, from: 'stock' }).catch(() => {});
      continue;
    }
    if (phase === 'discard') {
      if (decl) {
        console.log('>>> CLOSE AVAILABLE:', JSON.stringify({ isYourTurn: isYours, phase, canClose: st.canClose, decl }));
        const r = await post('/api/discard', { code, seat, cardId: decl.cardId, close: true, melds: decl.melds });
        console.log('>>> close result:', JSON.stringify(r).slice(0, 140));
        break;
      }
      const c = st.yourHand[0];
      await post('/api/discard', { code, seat, cardId: c.id }).catch(() => {});
      continue;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  console.log('DONE');
})().catch((e) => console.error('ERR', e.message));

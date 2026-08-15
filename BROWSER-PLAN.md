# CHINCHÓN — BROWSER UI PLAN (v2, decisions locked)

Reuses the existing engine EXACTLY as-is (zero new game logic, zero dependencies:
a Node `http` server + static files). Verified engine: 111 tests pass, 500-match
soak passes (no crashes/leaks).

## LOCKED DECISIONS (from user)
1. BOTS ONLY IN SOLO MODE. 1 human alone may add 0–6 bots. The moment a room has
   2+ humans, bots are NEVER offered and NEVER added. Enforced server-side: a room
   with >1 human rejects any bot seat. bot.js is only ever called for isBot seats.
2. NETWORK = OVER THE INTERNET (different homes). Server must be reachable publicly.
3. LOBBY = YES. "Create room → get code → friend joins with code" flow.

## Two game modes
- SOLO:    1 human + optional bots (0–6). Bot seats flagged isBot:true.
- MULTI:   2–7 humans, room code, bots ALWAYS 0 (server rejects bots in multi).
           Up to 7 humans may join the same room (engine cap + house rules).
           Each human = one seat, sees only their own hand; opponents shown
           face-down as counts. Bots never added in multi regardless of count.

## Lobby flow (multi mode) — explicit Start trigger
- Host creates a MULTI room -> gets a room code + a "share this link" URL.
- Other humans join via code/link as their own seat, 2nd .. 7th.
- Room is FULL at 7 humans; further joins are rejected with a clear message.
- A "Start game" button (host only) deals the first round once the host
  decides the table is full. The server does NOT deal on the 2nd join — it
  waits for Start so latecomers aren't locked out before the deal.
- After Start, seats are fixed for the match; the room code stays valid for
  a "play again" rematch (Slice 3).
- SOLO mode needs no lobby/Start: creating the room with 1 human + N bots
  deals immediately.

## Architecture — room-based, multi-player, in-memory
    rooms = new Map()   // code -> Room
    Room = {
      code, mode: 'solo'|'multi',
      players: [ { id, name, seat, isBot, connected } ],
      match,        // match.js createMatch / applyRound
      state,        // turn.js startRound
    }
  Server advances state after each action. If next seat isBot -> auto-play via
  bot.js. If next seat is a human -> STOP and return state. Multi rooms never hit bot.js.

## Files to add
| File | Role |
|---|---|
| `server.js` | `http` server. `rooms` Map. Serves `public/*`. Routes `/api/*`. Bots ONLY for isBot seats. Rejects bots in multi rooms. |
| `public/index.html` | Scoreboard, your hand, discard, opponents (face-down counts), buttons. |
| `public/style.css` | Card/suit styling — mirrors render.js colors; `*` = wild. |
| `public/app.js` | fetch loop + render. Polls /api/state for your seat. |
| `test/server.test.js` | Boot + a full 2-human multi match via two seats; assert no bot seat and bot.js never called. |

## Engine reuse (require() from src/, unchanged)
- `turn.js`    : startRound, topOfDiscard, drawFromStock, drawFromDiscard, discardCard, closeOptions, nextDealer
- `scoring.js` : bestSplit, canClose
- `match.js`   : createMatch, applyRound, activePlayers
- `bot.js`     : chooseDraw, chooseTurn, planLayoff, findAttach  (SOLO isBot seats ONLY)
- `layoff-interactive.js` : beginLayoff, currentPlayer, layMeld, attachCard, declareReady, suggest
- `cards.js`   : isWild, cardValue

## API surface
- `POST /api/room/new`   { mode:'solo'|'multi', name, bots? }      -> { code, seatId, shareUrl }
      solo: bots 0–6 allowed, deals immediately.
      multi: bots ignored/forced 0, capacity 2–7 humans, waits for Start.
- `POST /api/room/join`  { code, name }                           -> { seatId }  (2nd..7th human)
      Rejects if room full (7 humans) or if room is multi+started.
- `POST /api/room/start` { code, seat }                           -> deals first round (host only, multi)
- `GET  /api/room/players` ?code=                                -> list of joined human names/seats (lobby view)
- `GET  /api/state`      ?code=&seat=                            -> per-seat serialized state
      own hand full + melds/deadwood; opponents face-down COUNT only; stock count;
      face-up discard; scoreboard; whose turn.
- `POST /api/draw`       { code, seat, from:'stock'|'discard' }
- `POST /api/discard`    { code, seat, cardId, close? }
- `POST /api/layoff/...` (slice 2)

## Internet reachability (decision #2)
- The server is plain Node http — runs on your Mac. For OTHER HOMES to reach it:
  - Easiest: a tunnel. `npx cloudflared tunnel --url http://localhost:3000`
    (or ngrok) gives a public URL to share. Server stays on your Mac.
  - Or deploy to a free Node host (Render/Railway) — needs a git push; single
    instance is fine (in-memory rooms).
- Slice 1 is verified on localhost with two browser tabs / curl (proves logic,
  lobby, and the no-bot rule). The tunnel is a one-line runtime step, not code.

## Build in layers (proven, each verified)
- SLICE 1 — full loop, lobby, both modes.
    * Create a MULTI room (2 humans). Join from a 2nd seat. Play a full match
      via two tabs/curl to a winner. Auto-resolve every seat's lay-off.
      ASSERT: no bot seat existed, bot.js never called.
    * Also create a SOLO room (1 human + 2 bots); confirm bots auto-play their turns.
    * VERIFY both paths run green.
- SLICE 2 — interactive lay-off for humans (l / a / auto / r).
- SLICE 3 — polish: animations, elimination display, "play again", share-link copy button.

## Notes
- One server process, in-memory rooms, random seat token (no real auth). Fine for
  friendly play. Revisit for public hosting (persistence, instance affinity).
- Fairness: opponents' hands are face-down counts only; only your own hand is shown.

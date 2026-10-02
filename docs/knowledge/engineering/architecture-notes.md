# Architecture notes

These notes cover how the pieces fit together: the engine ↔ server ↔ browser, polling
"realtime", reconnect, gating, the lay-off rotation, elimination and presence. All of it
is zero-dependency.

## 1. The big picture

```
 src/*.js  (pure CommonJS engine, node --test)          <- the ONLY source of game truth
     ▲ require()
 server.js (bare http: static public/ + JSON /api/*)    <- holds rooms in memory, runs bots
     ▲ fetch() every ~1.2 s (game) / ~2 s (lobby)
 public/app.js (vanilla, tap-based UI, i18n)            <- renders the per-seat view
```

- **The server is authoritative.** Every action is re-validated by the engine. The
  client only renders `serialize(room, viewerSeat)`, a fair per-seat view: your hand,
  opponents' hand *counts*, piles, scoreboard, phase, `isYourTurn`, `closeOptions`,
  `layoff`, `pending` and `waiting`.
- **There's no WebSocket.** Polling is the only realtime mechanism, and it does triple
  duty:
  - the heartbeat (`lastSeen`);
  - the scheduler (countdowns fire inside `serialize`);
  - the sync.

  For a family game this scales fine. Each player makes about one request per second,
  as Hermes explained when Dannel asked about it on Aug 18.
- **All state lives in memory** (`rooms` Map, `lobby.members` Map). A Railway
  restart or sleep wipes it, and the client recovers by going back to the landing
  screen. See `deploy.md`.
- **Bots run server-side** in `runBotTurns`, called after each human action and at room
  creation, with `skill` coming from the family-bot roster entry. A crash there leaves
  the request hanging, which looks like a hang rather than an error.

## 2. Engine ↔ browser sync

- The browser can't `require()` the engine, so a tiny subset of rules is **mirrored**
  in `app.js` as single-expression globals: `window.__isWild` and `window.__cardVal`.
  - When the pending wild = 0 change (house rule R38) lands, change `cardValue` and
    `__cardVal` together; the drift test below compares them.
- `test/client-cards.test.js` reads `app.js` as text, extracts each expression with a
  regex, builds it with `new Function`, and compares it with `src/cards.js` across all
  80 cards. It also asserts **exactly one** definition of each.
  - Duplicate globals "win by order", silently. The Sep 12 audit found two copies.
  - Prove the guard can fail: mutate the source once, watch the test go red, restore it,
    and compare hashes.
- Other DOM-flow invariants are pinned by tests that read `public/*.html` and `app.js`
  as text, because jsdom isn't allowed (it's a dependency). One example is
  `test/client-lobby-flow.test.js`.
- `src/hints.js` (the run hint) follows the same pattern: a pure function plus a test,
  mirrored in the client.

## 3. The room lifecycle

```
create ──► pending (countdown; code shown in lobby if public) ──► started (match dealt)
   │            │  host Start / timer expiry / (solo: immediate)        │
   │            └─ every start path: room.pending = null; room.started = true
   ▼                                                                    ▼
 solo: 2 random family bots, starts immediately            game over ──► Rematch (90 s pending, Hold)
```

**Countdown without a scheduler.**
- `room.pending = {until, hold, hostName, startedBy}`.
- On each `serialize`, if `!hold && now >= until`, it calls
  `startFreshMatch`/`startPendingMatch`, then destructures `room.state`. The order
  matters, because the reverse gives a black screen.
- Hold sets `hold=true`. Resume sets `until = now + 90s`. There is intentionally **no
  start-now endpoint** for a rematch.
- **Pre-start countdown length:** the Sep code runs about 90s. Dannel's Oct 2, 2026
  ruling is **60s** (house rule R40), so the server still needs changing. (The 90s
  rematch window above is a separate timer and isn't affected.)

**Lone human in a multi room.** This is disputed; see the lobby doc's open questions.
- The Sep 11 code gave a lone host 2 bots.
- The Sep 14 audit made `startFreshMatch` delete multi rooms that have fewer than 2
  humans.

## 4. Turn engine and closing

- **Strict two-phase state machine,** `'draw'` → `'discard'`. Out-of-phase calls are
  rejected.
- **Closes are judged on the 7 kept cards.**
  - `closeOptions` and `allCloseSplits` enumerate every legal decomposition (chinchón,
    clean, leftover), deduplicated, each with `cardId`, `splitIdx` and `score`.
  - They're serialized only on your own discard turn.
  - The chosen melds are threaded into the lay-off as the closer's table.
- **False close** returns a distinct non-scoring result: the hand is exposed, the turn
  advances, and the totals are untouched. Capture `closer = state.turn` *before*
  advancing, so `revealedBy` is correct.
- **Stock reshuffle** happens inside `drawFromStock`, which keeps the top discard,
  reshuffles the rest, and returns `reshuffled:true`. The client shows a 3s note.

## 5. The lay-off rotation (Sep 12 model, `c314ca9`)

- `beginLayoff` builds `order = [closer, ...layoffOrder(after closer, skipping
  inactive)]`.
  - `placed[closer]` is pre-filled, because the closer's melds are already on the table.
  - Older notes (`chinchon-project`, `chinchon-elimination`) still describe
    `[...others, closer]`. **That's outdated.**
- `advance()` means "next **unconfirmed** seat, wrapping". The phase is `'done'` when
  every seat is ready.
- **Actions:**
  - `layMeld` and `attachCard`: validated, including the wild cap and card ownership;
  - `passTurn` ("Not yet"): advances without confirming;
  - `declareReady`: the only exit, and the moment the score locks;
  - `suggest`: a hint.
- **Bots confirm in the same visit they act.** `/api/layoff/auto` means "do everything
  and confirm", which gives up the wrap by design.
- `resolveRound` (greedy, used by bots and the soak) still scores others first and the
  closer last. That's fine, because turn order and scoring order are separate concerns.
- **No timer.** Dannel confirmed on Oct 2, 2026 that there's no lay-off timer, nudge
  or timeout (house rule R39). The YOUR TURN / WAITING FOR *name* marker, placed above
  the piles in normal flow and never as an overlay on the cards, is a requirement
  because of this.
- **The guarding test encodes Dannel's worked example** (the 3/4 de Oros). An
  order-only assertion passes under both the old and new models, so it isn't enough.

## 6. Elimination (`active` seat list)

- An optional `active` array is threaded through `startRound`, `nextActiveTurn`,
  `nextDealer`, `layoffOrder`, `resolveRound` and `beginLayoff`.
  - It defaults to all seats, so the old tests stay valid.
  - Out seats get `[]` hands, no turns, no lay-off, and score 0.
  - Card conservation still holds, because fewer cards are dealt.
- `out` resets only in `createMatch`, so there's no buy-back.
- **Spectators** (players continued past while away) are filtered alongside `out`
  everywhere a seat is iterated: `!out && !spectator`.

## 7. Reconnect, presence and gating

**Heartbeat.** Each `/api/state` poll stamps `lastSeen`.
- `connected` = within 45s, so the seat stays green; past that it turns red.
- `away` = silent for more than 120s (amber).
- **There are two independent clocks:** `AWAY_MS` counts from the last heartbeat,
  whatever turn it is; the hold on the away player's turn starts only when the turn
  reaches them. Explain them separately to Dannel.

**`evaluateWaiting(room)`** runs on every poll and every action.
- If it's an away human's turn, it sets `room.waiting = {seat, since}` and the table
  **holds**; it clears automatically when they're back.
- If a player has been away for more than `AWAY_END_MS` (8 min), the match **ends**.
- **Away players are never skipped.** The Aug 15 host **Continue** (after
  `CONTINUE_WAIT_MS` = 90s, turning the player into a spectator) was reverted on Aug 20
  (`ef4817f`). The reference notes in Hermes' `reconnect.md` predate that change.
- If the host is away for 60s in a game of 3 or more, the next-oldest human is
  promoted.

**Identity.**
- `lobbyToken` identifies a human. Seats are deduplicated per token, so reopening a
  bookmark doesn't create a second seat.
- Kick bans by token, which still works after a rename.
- Long secret tokens are kept separate from the short display IDs: the 3-digit SeatID
  and the 4-letter room word.
- Reclaim rotates `sessionToken`; the old device sees the displaced screen.

**Gates** (tutorial pause, close offer) are **stored flags**.
- They're set at turn-transition choke points and re-armed only at `phase==='draw'`, so
  they don't re-pause mid-turn.
- Action endpoints enforce them with a 409; `serialize` only reads them.

**Sweeps** run every 5 min:
- `sweepRooms`: waiting or finished rooms idle for 15 min; active games where every
  human has been idle for 30 min;
- `sweepLobby`: members idle for 30 min.

Put `return srv` *inside* `createServer()` when you add the interval.

## 8. Client rendering

- **`render()` rebuilds from the view on every poll.** Client-only state (`handOrder`,
  `swapPick`, `chatSeen`, `selected`) is reconciled against the live card ids.
- **Animations are edge-triggered** (`_animState` plus `onceAnimate`) so polls don't
  replay them. They use transform and opacity only, last at most 250ms, and honour
  reduced motion.
  - The reduced-motion override must force `opacity:1`, or fade-in elements stay
    invisible.
- **`show()` is the only screen switcher.** Overlays must be added to its hide list.
- Static assets are served with `Cache-Control: no-cache, no-store, must-revalidate`,
  plus `?v=<mtime>` rewriting in `index.html`.

## 9. Known structural risks / ideas Hermes flagged (Sep 12)

1. Railway sleep or restart wipes live rooms. Mitigations: the client self-heals, and
   the keep-awake ping (`deploy.md`) helps.
2. A false close isn't visible to other players on the web.
3. Public rooms shouldn't fill up with bots (now enforced by the Sep 14 change, if
   that's kept).
4. A stray `app.js.public` file should be deleted.
5. Bots holding vs dumping: done in `1b5b41c`.

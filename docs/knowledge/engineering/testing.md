# Testing and verification recipes

Dannel's rule of thumb is "working, verified code", which means **real execution
output**. There are five tiers of evidence, from fastest to most decisive:

1. `node --check` on each changed file.
2. `npm test`: unit and integration tests (Node's built-in runner, `test/*.test.js`).
3. `npm run soak`: 500 random full matches.
4. **Driving the HTTP API** against a real local or live server, using Python `urllib`,
   `curl` or a Node script.
5. **Dannel playing on a real phone** against the Railway link. This one is final.

A simulated or automated browser is best-effort only:
- Hermes' browser tool blocked localhost.
- It returned empty snapshots.
- It served a stale `app.js`.
- It froze on multi-turn loops longer than about 30s.

Prefer the API.

---

## 1. Starting a clean local server (avoid the stale-instance trap)

```bash
lsof -ti :3000 | xargs -r kill -9; sleep 1     # an old server may still hold :3000
cd ~/Desktop/chinchon && PORT=3000 node server.js &
sleep 1.5
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/
```

If the new server can't bind (EADDRINUSE), you're silently testing the **old** code.

## 2. API reference (used by every harness)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/lobby/enter` | POST `{name}` | enter the lobby → `{token, name}` (CHINCHON and `*.Bot` reserved) |
| `/api/lobby/state?token=` | GET | lobby members/chat/matches; stamps `lastSeen` |
| `/api/room/new` | POST `{mode:'multi'\|'solo', name, visibility, bots, tutorial?, lobbyToken}` | create a room → `{code, seatId}` |
| `/api/room/join` | POST `{code, name, lobbyToken, seatId?}` | join (or resume with `seatId`) |
| `/api/room/start` | POST `{code, seat}` | host starts; `seat` = the host's real seatId |
| `/api/state?code=&seat=` | **GET** | per-seat view; stamps `lastSeen`. **No seat = seat 0's view** |
| `/api/draw` | POST `{code, seat, from:'stock'\|'discard'}` | draw |
| `/api/discard` | POST `{code, seat, cardId, close?, melds?}` | discard; to close, `melds` = the player's own groups as arrays of card ids (Oct 8, 2026). Invalid groups = false close (R24) |
| `/api/layoff/lay` / `attach` / `pass` / `ready` | POST `{code, seat, cardIds}` / `{…, cardId, meldIndex}` / `{code, seat}` | lay-off actions (`/api/layoff/auto` and `/suggest` were removed Oct 8, 2026) |
| `/api/test/rig` | POST `{code, seat, cardIds}` | **test-only**: swaps those cards into a seat's hand; exists only when the server runs with `CHINCHON_TEST_HOOKS=1` (404 otherwise, including production) |
| `/api/tutorial/ack` | POST `{code, seat}` | release the tutorial pause |
| `/api/room/leave`, `/api/room/kick`, `/api/room/chat`, `/api/room/rejoin`, `/api/room/join-rematch`, `/api/room/by-seat`, `/api/lobby/rejoin` | — | lobby/session flows (see `../rules/lobby-and-session.md`) |

**Gotchas**
- `canClose` is **false until you have drawn**: it's only set when `phase==='discard'`
  and it's your turn. Draw first, then check. It is a yes/no only; the server never
  sends decompositions (no `closeOptions`, no `yourMelds` since Oct 8, 2026).
- Close with `{cardId, close: true, melds: [[ids…], [ids…]]}`. A driver works out its
  own melds (e.g. `scoring.allCloseSplits` on the 7 kept cards, as `test/server.test.js`
  `declareClose` does).
- After a close, `phase==='layoff'`. Whoever has `isYourTurn` calls
  `/api/layoff/ready` (or lays/attaches first). A **driver must make legal closes** or
  the match never ends.
- `/api/state` is a **GET**; a POST returns an empty body.
- Seat ids are random strings (or 3-digit SeatIDs for reclaim), never 0/1.
- `yourScore` isn't a serialized field. Read `scoreboard` instead.

## 3. Full 2-human game via the API (Python, proven Sep 3)

```python
import json, urllib.request
BASE = 'http://localhost:3000'          # or the Railway URL
def api(path, method='GET', body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

p1 = api('/api/lobby/enter', 'POST', {'name': 'Alice'})
p2 = api('/api/lobby/enter', 'POST', {'name': 'Bobby'})
room = api('/api/room/new', 'POST', {'mode': 'multi', 'name': 'Alice', 'visibility': 'private',
                                     'bots': 0, 'lobbyToken': p1['token']})
code, s1 = room['code'], room['seatId']
s2 = api('/api/room/join', 'POST', {'code': code, 'name': 'Bobby', 'lobbyToken': p2['token']})['seatId']
api('/api/room/start', 'POST', {'code': code, 'seat': s1})

while True:
    for seat in (s1, s2):                 # act for WHOEVER is current (see §5)
        st = api(f'/api/state?code={code}&seat={seat}')
        if st.get('gameOver'):
            print('winner', st.get('winner')); raise SystemExit
        if st.get('phase') == 'layoff':
            if st.get('isYourTurn'): api('/api/layoff/ready', 'POST', {'code': code, 'seat': seat})
            continue
        if not st.get('isYourTurn'): continue
        if st.get('phase') == 'draw':
            api('/api/draw', 'POST', {'code': code, 'seat': seat, 'from': 'stock'})
            st = api(f'/api/state?code={code}&seat={seat}')
        # Oct 8, 2026: closing needs the player's own melds (card ids), so this trimmed
        # driver never closes; see test/server.test.js declareClose for one that does.
        # Throw the highest unpaired card that isn't the one just drawn (simple heuristic).
        hand = st['yourHand']; drawn = st.get('lastDrawnId')
        counts = {}
        for c in hand: counts[c['rank']] = counts.get(c['rank'], 0) + 1
        pick = max((c for c in hand if c['id'] != drawn) or hand,
                   key=lambda c: (-counts[c['rank']], c['rank']))
        api('/api/discard', 'POST', {'code': code, 'seat': seat, 'cardId': pick['id']})
```

On Sep 3 a run like this finished cleanly: Bob won, and Alice was eliminated at 105.
(That version closed with the old `closeOptions`/`splitIdx`; since Oct 8, 2026 a
driver has to declare melds to close, so this trimmed copy never closes and needs a
`declareClose` step added before it can finish a match.)

## 4. Solo close driver: `scripts/play_to_close.js`

With the server up on :3000, this plays a solo game and logs
`isYourTurn/phase/canClose` every turn, then declares a close when one appears. Use it
to **separate server bugs from client bugs**. If the server sends `canClose: true` and
the browser shows no Close button, the problem is the client or the cache.

## 5. Stress-harness discipline (a broken harness reports false bugs)

- **Act for the CURRENT actor.** Check `isYourTurn` on every seat.
  - Never `break` after the first seat without acting.
  - In Aug 2026 that bug produced "3924 lay-offs, STUCK" when the game was fine.
- **When something looks stuck, suspect the harness first.** Add a temporary
  server-side log inside the handler (for example turnPointer and phase), re-run, and
  remove the log before committing.
  - The serialized `layoff` view is limited, so internal fields aren't visible to the
    client.
- **Assert on real fields only.** Compare the scoreboard length with the room's player
  count, not the harness's seat count; solo rooms have 3 players.
- **Wait for the start properly.**
  - Private and public rooms auto-start after the pre-start countdown (about 90s in the
    Sep code; the rule is 60s per R40, Oct 2, 2026, once the server change lands), so
    poll `started` until it's true, up to about 100 × 1s.
  - Or call `/api/room/start` with 2+ humans. The Sep 14 audit says multi rooms with
    fewer than 2 humans are deleted.
- A full sweep in late Aug ran 3 solo and 2 two-human matches to game over with **no
  engine bugs**. It also exercised the away rule: hold, then auto-end at 8 minutes.

## 6. Verification recipe: tutorial pause, close gate and reserved names

```python
r = post("/api/room/new", {"mode":"multi","name":"Novice","visibility":"private","bots":2,"tutorial":True})
code, seat = r["code"], r["seatId"]
get(f"/api/state?code={code}&seat={seat}")          # tutorialPaused True, tutorialRuleIndex 0
# draw while paused -> HTTP 409 (assert ENFORCEMENT, not just the flag)
post("/api/tutorial/ack", {"code":code,"seat":seat}) # paused False, isYourTurn True
post("/api/draw", {"code":code,"seat":seat,"from":"stock"})
get(f"/api/state?code={code}&seat={seat}")          # canClose now meaningful
```

- After the discard, the next draw turn should **re-arm** the pause.
- If closes are rare, loop room creation until the gate fires.
- Reserved name check:

  ```bash
  curl -s -X POST localhost:3000/api/room/new -H 'Content-Type: application/json' \
    -d '{"mode":"multi","name":"Cheater.Bot"}'   # -> {"error":"that name is reserved for bots"}
  ```

- Join-cap checks work the same way. For example, a 4th human joining a learning room
  should get "room full (3 humans)".

## 7. Live co-play: auto-play the other seat on Railway

Dannel sometimes plays a live 2-human game against an agent-driven seat. Use
`scripts/live-coplay-autoplayer.js`.

- It **shells out to `curl`**, because Node's `http`/`https` to Railway failed silently
  in Hermes' sandbox.
- Seed the second seat with
  `curl -s -X POST "$HOST/api/room/join" -H "Content-Type: application/json" -d '{"code":"<ROOM>","name":"Guest2"}'`.
- **Watch Dannel's seat with *his* seatId.** With `canClose: true` on his discard turn
  but no Close button on his screen, the problem is the cache or client. With false,
  it's the data layer.

## 8. "It still doesn't work after the deploy": diagnosis order

1. `curl "<url>/api/state?code=<ROOM>&seat=<SEAT>"`: are
   `phase/turnSeat/isYourTurn/canClose` correct? If they are, it's
   not the server.
2. `curl -s <url>/app.js | grep -n '<feature marker>'`: did the code actually ship?
3. `curl -s -D - -o /dev/null <url>/app.js | grep -i cache-control`: should be
   `no-cache, no-store, must-revalidate` (`5fd037d`).
4. Ask Dannel to close the tab and reopen the link, or use a private window.
   Chinchon's state is in localStorage, not cookies.
5. Only then touch client logic. If the data is right and the code shipped, add a
   **temporary** `DIAG co=… canAct=… phase=…` line to `#status`, wrap the block in
   try/catch, have Dannel read it back, and **remove it** afterwards.

For load-time throws, a browser-console eval helps:
`new Function(await (await fetch('/app.js')).text())()` inside try/catch. That's how a
null `.onclick` that blanked the whole app was found.

## 9. Deterministic visual checks (a state that appears only on a specific deal)

1. Temporarily inject a seeded RNG behind an env var.
2. Brute-force a seed with the **real** engine until the target predicate holds.
3. Restart the server and test the **first** room only (the seed advances per deal).
4. Screenshot with the animation forced visible.
5. **Remove the hook** afterwards. `CHINCHON_SEED` was removed Aug 18.

## 10. Soak harness (`npm run soak`, `test/soak.js`)

- **Setup:** seeded `mulberry32(i+1)` so any failure replays exactly; player counts
  cycle 2–7 (`2 + i % 6`).
- **Asserted inside the loop:**
  - card conservation (exactly 80);
  - termination guards that throw (round guard 2000, match guard 300 rounds);
  - progress (a rejected action throws);
  - exactly one winner.
- **Unhappy paths:** about 30% suboptimal draws, about 30% declined wins, about 5%
  false closes.
- **Evidence block, Aug 2:** 500 matches, 2,818 rounds, average 5.6 rounds per match,
  83–84 matches per player count, no leaks.

## 11. Card audit (`scripts/cards-audit.js`) — read-only

Run it from the repo root: `node /path/to/scripts/cards-audit.js [repoRoot]`.

**What it checks:**
- deck composition, unique ids, no 8s/9s;
- exactly 2 wilds, with the other 1s still natural;
- values;
- positive and negative melds (bridged run, gapped run, duplicate-rank run vs duplicate-
  suit set, no wrap, two wilds rejected);
- deal integrity for 2–7 players;
- a static pass over `public/` (emblem and colour per suit, wild marker, numeric
  ranks).

**Pending rule changes (Oct 2, 2026):** two checks encode the *pre-ruling* engine:
"run does not wrap at the ends (12,1,2)" and "wild scores 1". Dannel has ruled that
runs wrap 12 → 1 (R37) and the wild scores 0 (R38). Flip both checks in the same
change that updates the engine; until then they pass against the old engine.

**History:** Sep 12 it found 79/80. The fixes (one client definition of
`__isWild`/`__cardVal`, a Bastos `suitEmblem` case, and a drift test) brought it to
81/81.

## 12. Card-back photo recipe (if Dannel sends a new photo)

1. Measure the card bounds numerically: the card field has grey > 238 against a surface
   of about 226. Exclude the cast shadow on the right and bottom.
2. Crop tight with PIL, apply a mild `autocontrast(cutoff=0.5)`, resize to **132×188**
   (2× the 66×96 card), and save as JPEG at quality 88, about 7 KB.
3. Keep the raw photo out of `public/`.
4. Verify:
   - `file` reports a valid JPEG;
   - all edge strips are light;
   - `curl -w '%{content_type}'` returns `image/jpeg`.

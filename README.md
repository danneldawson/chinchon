# Chinchón

A browser-based **Chinchón** card game implementing one family's house rules
(Spanish 40-card deck × 2, every card duplicated; the 1 de Oros is wild; close
with 4+3 clean or 3+3 with leftover ≤ 5; chinchón wins the match; out at 101+).

- **Zero runtime dependencies.** The server is plain Node (`node server.js`); the
  UI is vanilla HTML/CSS/JS. No framework, no build step.
- **Engine-first.** All rules live in `src/` and are covered by tests
  (`npm test` → 121 passing).
- **Two ways to play:**
  - **Play with friends** — 2–7 humans in one room (room code). **No bots, ever.**
  - **Solo vs bots** — you + 1–6 bots (auto-play their turns).

## Run it locally
```bash
npm start            # serves http://localhost:3000
npm test             # runs the 121 rule/engine/server tests
```
Open the URL, create or join a room, and share the room link with family.

## How a round plays
1. Draw from stock or discard; discard one card.
2. When you can close, the game lists **every legal closing** (each meld set +
   its score) — you pick which to reveal, because opponents lay off onto *your*
   melds, so the choice is real strategy.
3. **Lay-off** is interactive: players (in turn order after the closer) reveal
   their combinations and shed leftovers onto any table meld, then declare ready.
4. Lowest total wins the round; scores pile up; **out at 101+**. When one player
   remains, they win the match. "Play again" deals a fresh match, same players.

## Project layout
```
server.js                 HTTP API + room/state machine
public/                   browser UI (index.html, app.js, style.css)
src/cards.js  melds.js     deck, wild, meld validation
src/scoring.js            close detection + all legal close splits
src/layoff.js             auto-resolve a round's lay-off
src/layoff-interactive.js manual, per-player lay-off (l / a / auto / r)
src/turn.js  match.js     deal/draw/discard + match/elimination rules
src/bot.js                bot turn + lay-off planning
test/                     node --test suites (engine + server integration)
```

## Deploy (Railway)
The repo is set up for [Railway](https://railway.app): `package.json` declares
`start` and `engines`. Connect the GitHub repo, deploy, and you get a fixed URL
that runs 24/7. Pushing to `main` redeploys automatically.

## Rules enforced server-side
- Multi rooms **never** contain bots (hard requirement).
- Claimed melds/attaches are always re-validated against the engine.
- The 1 de Oros is the only wild; at most one wild per meld.

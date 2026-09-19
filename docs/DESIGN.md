# Chinchón — design notes

Engine-first browser game: Spanish deck, family house rules. Zero runtime dependencies (`node server.js` + vanilla UI).

## Rules (current)

- **Deck:** 80 cards (40-card Spanish × 2). No 8s or 9s.
- **Wild:** 1 de Oros only; at most one wild per meld; also counts as a natural 1.
- **Runs:** same suit, including 7-10-11-12 (ranks skip 8/9).
- **Close:** 4+3 clean (−10 to closer only) or 3+3 with leftover (sobrante) ≤ 5.
- **Chinchón:** wins the match immediately.
- **Match:** scores accumulate; out at ≥ 101; score floor −50; 2–7 players.

## Modes

- **Solo vs bots:** human + 1–6 bots (bots auto-play). Bots exist **only** here.
- **Play with friends (multi):** 2–7 humans in a room. **Hard rule: no bots.**

## Architecture

| Layer | Role |
|-------|------|
| `src/` | Engine: cards, melds, scoring, turn, match, layoff, bot |
| `server.js` | HTTP API, rooms, lobby, serialisation |
| `public/` | Vanilla UI (card taps; `card-back.jpg`) |
| `test/` | `npm test` → `node --test` |

**Serialize gotcha:** `serialize()` has a main path and an early `if (!state)` path — new client fields must be added in **both**.

## Lobby / rematch (known behaviour)

- Landing: name first, then lobby; name `CHINCHON` reserved.
- Rematch: timed pending window; host hold toggle; leave anytime; kick → lobby with ban by lobby token.

## Deployment

- Source of truth: local `~/Desktop/chinchon`.
- GitHub: `danneldawson/chinchon`. Railway historically auto-deployed from `main` (`PORT` from env).
- See `docs/STATUS-CHECK.md` for hosting upgrade markers.

## Known gaps

- Live Railway URL may be recreated; keep STATUS-CHECK / family link updated.
- Landing HTML removed `#btn-lobby-enter`; client `$()` stubs missing nodes (safe but messy — clean up when touching lobby UI).
- Untracked `public/index.html.backup` should stay out of git unless intentionally restored.
- GitHub HTTPS push from Skinny Macintosh needs an authenticated credential (`gh`, SSH, or keychain login) before auto-deploy can pick up local commits.

# Chinchon knowledge pack

This is everything a coding agent (or a person) needs to keep working on **Dannel
Dawson's Chinchon card game**:
- a Spanish-deck card game with the family's house rules;
- engine-first, built in vanilla Node and vanilla JS;
- the code lives at `~/Desktop/chinchon` on his Mac
  (https://github.com/danneldawson/chinchon);
- it's live at https://chinchon-production.up.railway.app.

**Provenance.** Distilled from the backup of **Hermes Agent**, the AI assistant that
worked with Dannel on the game from **Aug 2 to Sep 14, 2026**. The sources were:
- Hermes' memory files and pending memory notes;
- its Chinchon skills, with their references and scripts;
- its chat history (51 sessions, of which 25 are about Chinchon).

Everything was rewritten into clean documents. Where sources disagreed, the newest
statement from Dannel wins, and the disagreement is recorded. Four rulings Dannel made
on **Oct 2, 2026**, after Hermes was retired, have been added (house rules R37–R40).

**Public and private parts.** This public copy holds the rules, design notes,
engineering docs, scripts and the decision log. The session transcripts and the
personal working-style notes are **kept in a separate private repo
(danneldawson/chinchon-transcripts)** and are not included here.

> **Read this first**
> 1. **The repo is the truth for the code, and real `npm test` output beats any number
>    written here.** Test counts, commit hashes and file layouts in this pack are
>    historical, as of Sep 14, 2026.
> 2. **If anything here conflicts with the current repo or with what Dannel says now,
>    check with Dannel.** Don't silently "fix" either side. Open questions are listed in
>    `rules/house-rules.md` and `rules/lobby-and-session.md`. The exception is the
>    Oct 2, 2026 rulings below: those are decided, and the code is what needs to change.
> 3. **The house rules are the family's, not "standard" Chinchon.** Never fill gaps
>    from Rummy or Gin.

## Repo state when Hermes stopped (Sep 14, 2026); verify before doing anything

- **Last commit known to be pushed:** `8c1aab6` "throw-pop on own discard + GPU layer
  promotion" (Sep 13, 179 tests).
- **Local commit `80bbfe7`** "feat: multi mode — no bots, requires 2+ humans" was
  created on Sep 14 at 19:10 PT, but **the push failed** (GitHub rejected HTTPS
  password auth). It bundles:
  - the Sep 14 "audit" change to `startFreshMatch`, which reverses Dannel's Sep 11
    lone-host-gets-bots decision;
  - partial, unverified edits from Dannel's Sep 14 eight-point redesign spec;
  - an untracked `public/index.html.backup` may also be present.
- So run `git status` / `git log origin/main..HEAD` first, then ask Dannel what he
  wants to keep. Set up SSH or a PAT for pushing (`engineering/deploy.md`).

## Code status of the 2026-10-02 rulings (none pending)

On Oct 2, 2026 Dannel settled four rule questions. **All four are in the code now**
(checked Oct 8, 2026), so nothing is pending from them:

| Rule | Ruling | Where it landed |
|---|---|---|
| R37 | A run can wrap from 12 round to 1 (…11‑12‑1…) | `d8cc416`: `isValidRun` in `src/melds.js`; the audit checks the wrap |
| R38 | The wild (1 de Oros) scores **0** | `d8cc416`: `cardValue` in `src/cards.js` and the client mirror `window.__cardVal` |
| R39 | No lay-off timer, nudge or timeout | Always matched the code |
| R40 | The pre-start countdown is **60s** | `6ef221e`: `server.js` (the rematch window is a separate 90s) |

**Still open** (check with Dannel before changing behaviour):
- a lone human in a multi room: 2 random bots (Sep 11) vs the Sep 14 audit that deletes
  the room (`rules/lobby-and-session.md` §9);
- share links: no link (Aug 20) vs Copy table link + WhatsApp (Sep 14 spec);
- how much of the Sep 14 redesign spec was actually built (`preferences/ui-and-design.md`
  §10);
- the remaining items in `rules/house-rules.md` (Q3) and `rules/lobby-and-session.md` §9.

## Index

| Path | What it is |
|---|---|
| `README.md` | This index, provenance and the caveats above |
| **rules/** | |
| `rules/house-rules.md` | **THE authoritative family ruleset**: 40 numbered rules (R1–R40, including the Oct 2, 2026 rulings R37–R40), quick-reference table, code map, open question Q3 and resolved conflicts (C1–C15) |
| `rules/lobby-and-session.md` | Landing, lobby, room types (solo/public/private/tutorial), room codes and SeatIDs, start/leave/kick, chat, reconnect/away rule, rematch/Hold, sweeps, open questions |
| **preferences/** | |
| `preferences/ui-and-design.md` | Cards and suit emblems, theme, piles and card-back photo, hand interaction, close/lay-off UI, animation rules, mobile, i18n, family-bot roster, the Sep 14 redesign spec, deferred/cancelled items |
| **engineering/** | |
| `engineering/guide.md` | Build, test and verify: project map, engine-first layering, the check gate, rules discipline, server/client pitfalls, commit hygiene, audits |
| `engineering/testing.md` | API reference, full 2-human API game test, solo close driver, stress-harness discipline, verification recipes, live co-play, post-deploy diagnosis, soak, card audit, card-back recipe |
| `engineering/architecture-notes.md` | Engine ↔ server ↔ browser, polling as realtime, room lifecycle and countdowns, closing, lay-off rotation, elimination, reconnect/presence/gating, rendering |
| `engineering/deploy.md` | GitHub + Railway recipe, pushing (and the Sep 14 auth failure), deploy verification by hash, host-only pitfalls, always-on keep-awake |
| **scripts/** | |
| `scripts/play_to_close.js` | Drives a local solo game over the API until a close is offered, then closes (server vs client bug triage) |
| `scripts/cards-audit.js` | Read-only deck, meld, deal and card-face audit against the real engine and `public/` (prints `n/m passed`) |
| `scripts/live-coplay-autoplayer.js` | Auto-plays one seat of a live Railway game through `curl` so a live test keeps moving |
| **history/** | |
| `history/decision-log.md` | Dated log of rule and design decisions with reasons (Aug 2 → Sep 14, plus the Oct 2, 2026 rulings), table of bugs fixed with root causes, lessons learned |

The per-session transcripts and the working-style notes (how Dannel likes to work) are
kept in a separate private repo (danneldawson/chinchon-transcripts).

## Quick start for a new agent

1. If you have access to the private repo (danneldawson/chinchon-transcripts), read
   its working-style notes first. They're short and they matter. The essentials: confirm
   your understanding before acting, one feature at a time, small verified layers.
2. Read `rules/house-rules.md` before touching any game logic, then the "Code status
   of the 2026-10-02 rulings" section above.
3. On his Mac:
   ```bash
   cd ~/Desktop/chinchon && git status && git log --oneline -5
   npm test
   ```
   The real counts replace the ones written here.
4. Mirror your plan back to Dannel, get a go-ahead, and build one verified layer at a
   time (`engineering/guide.md`).

## What was deliberately left out

- **Raw chat database** (`hermes-state.db`) and its lock files: only distilled
  transcripts were kept, and those live in the separate private repo.
- **`MEMORY.md.bak.*` snapshots:** older copies, mined for rule history and otherwise
  duplicates.
- **Hermes bookkeeping:** curator backups, logs, caches, `SOUL.md` (the persona) and
  `README.md` of the backup.
- **Non-Chinchon material:** other projects, assistant setup and personal notes, and
  the generic or non-Chinchon parts of skills.
- **Secrets** (tokens and the like) are replaced with `[REDACTED]` everywhere.

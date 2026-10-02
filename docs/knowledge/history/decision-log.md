# Decision log (Aug 2 – Sep 14, 2026, plus Oct 2 rulings)

This was distilled from the 25 Chinchón sessions in Hermes Agent's chat history (the
transcripts are kept in a separate private repo, danneldawson/chinchon-transcripts),
cross-checked against Hermes' memory, skill notes and context
summaries.
- Dates are **PT**.
- "D:" marks something Dannel said or decided; "H:" marks Hermes' reasoning or action.
- Commit hashes are from the `danneldawson/chinchon` repo.
- Test counts are as reported at the time; **real `npm test` output beats them**.

---

## Timeline

### Sun Aug 2: rescue, rules interview, engine
- H audited the abandoned Gemini project (`~/Desktop/Chinchon game`). Finding: not
  broken so much as *not a game yet* (deck and deal, but no turns, melds or scoring).
  **D: start fresh** in `~/Desktop/chinchon`, engine first. *Reason:* Dannel had been
  burned by untested generated code and wants small, proven layers.
- **Rules interview, in batches, each confirmed in a table:**
  - 2 Spanish decks;
  - **the wild is the existing 1 de Oros**, so 80 cards, not 82. H had first modelled
    an added joker, and D corrected it;
  - one wild per meld;
  - sets may repeat suits (D corrected H's "three different suits");
  - runs bridge 7→10;
  - 4+3 = −10;
  - 3+3 plus a leftover ≤5;
  - chinchón wins the match;
  - 101 is out;
  - 2–7 players.
- **Engine and tests grew in layers:** 35 → 61 → 75 → 99 → 105.
  - Added the interactive lay-off with explicit **declare-ready**. *Reason:* "real
    players decide when they're done", so nothing is auto-shed.
  - Added the false close (hand exposed, nobody scores).
  - Added the terminal game `play.js`, `CHEATSHEET.md` and an in-game `?`.
  - Added the soak test: 500 matches clean, average 5.6 rounds.
- **The first play-test found invented and missing rules:**
  - H had coded the Gin Rummy rule "can't discard the card you just took". **D: "if I
    pick one from the pile and it doesn't work, I can just drop it off."** It was
    removed, and the test that asserted it was fixed.
  - **Dealer rules** had been omitted entirely. They were added: deal clockwise from
    the dealer's left, the dealer plays last, the deal rotates left, and one card goes
    face up.
- The piped-stdin `readline` stall was fixed with the `src/input.js` shim. *Reason:*
  you can't verify a CLI you can't script.

### Wed Aug 5: elimination
- Eliminated players (≥101) get no cards, no turns and no lay-off, and they're skipped
  as dealer. Implemented by threading an `active` seat list everywhere; it defaults to
  all seats so the old tests stay valid. **111 tests.** No buy-back.

### Thu Aug 13: browser and online play plan, slice 1
- H: the browser layer is a **thin server over the unchanged engine**: a bare `http`
  server, no deps, in-memory rooms. Bots are **solo only**, enforced server-side. A
  host Start button replaces dealing on join.
- Slice 1 built and tested (114 tests). Internet play went through a `cloudflared`
  tunnel from the Mac. Fixed `publicBase` so share links don't say localhost.

### Sat Aug 15: cards, close choice, lay-off UI, deploy, lobby, rematch
- **Card art:**
  - No copyrighted Fournier art; original SVG emblems instead: gold coin, red cup, blue
    sword, green club.
  - D: keep the cup as it is, rework the sword into a stick-sword, make Oros identical
    on every card. No `♥` anywhere.
  - The black background with cream cards stays (D loves it).
- **Player-choice close:** every legal decomposition is shown and the closer picks.
  *Reason:* opponents lay off onto the revealed melds, so it's strategy. The options
  are enumerated on the **7 kept cards**.
- **Slice 2:** interactive lay-off in the browser.
  - Fixed the `sendJson`-as-error crash.
  - Fixed the lay-off `isYourTurn` and `phase` serialization deadlock.
  - Solo with 0 bots is clamped to at least 1 bot (the rules need 2+ players).
- **Deployed:** GitHub (`danneldawson/chinchon`) plus Railway (Dannel's token was
  pasted into chat; it's redacted here). *Reason:* "an always-up link lets the family
  play without me."
- **Reconnect via heartbeat** (no WebSocket). Edge-triggered animations: deal-in,
  discard slide, panel fades (D accepted "the minimum" animation set).
- **Lobby and session:**
  - global lobby, landing with name first;
  - CHINCHON is a reserved name;
  - **Rematch = a 90s pending window with a host Hold toggle and no start-now**;
  - Leave any time; Kick goes to the lobby plus a ban by lobbyToken, and a bot host
    never kicks;
  - per-room chat (a rematch keeps it);
  - automatic `?v=` cache-bust.

### Sun Aug 16: scoring edge cases
- D: a **second 1 de Oros is allowed in a chinchón only when played as the natural
  card**.
- D: the score **floor is −50**, and "−15" was a misunderstanding. Exactly one winner;
  everyone else is ranked by elimination order; a chinchón win shows the word instead
  of points.

### Mon Aug 17 – Tue Aug 18: lobby redesign, agency, tutorial, family bots
- **Lobby:** three stacked boxes (Players here / Create + Join + Active matches / Chat).
  The language selector is on the landing screen only. Leave buttons need a confirm.
- **Timed-pending lobby** (60s; public rooms listed, private hidden) decided. *Reason:*
  it kills the "2 players, no hand dealt" bug. (The Sep code ran about 90s; Dannel
  reconfirmed 60s on Oct 2, 2026, R40.)
- **Agency:**
  - **Full discard history: CANCELLED.** Players track throws in their heads.
  - **Live meld hints removed, deadwood kept.**
  - The close offer stays as a *rules gate*.
- **Learning room** (max 3) and **tutorial** with **Pro.Bot** and **Dee.Bot**: rule
  cards gate the novice's turns. `.Bot` names are reserved.
- **Family bot roster** (10, solo only, 2 random per game). D supplied 7 entries and H
  proposed 3. H scaffolded `src/bots.js` *before* the roster arrived and had to delete
  it. Lesson: don't build ahead of the data.
- **Aug 18:**
  - run-hint banner shipped and `CHINCHON_SEED` removed (144 tests);
  - duplicate seats deduplicated by lobbyToken;
  - a real red dot (45s);
  - room sweep;
  - D asked about scaling; H: polling is about 1 request per second per player, fine
    for a family game.
- *Rules drift begins here:* Hermes' tutorial text says "11-12-1 is valid" and "the
  wild counts 0". The engine disagrees. **Resolved Oct 2, 2026** in favour of the
  tutorial text: runs wrap 12 → 1 (R37) and the wild counts 0 (R38); the engine still
  needs changing.

### Thu Aug 20: tutorial optional, close offer, stock rule, away rule
- The tutorial is optional. The close/continue offer fires for **all** legal closes,
  including chinchón; **a mis-discard just continues**.
- **D: "when stock pile ends reshuffle the same pile and continue, that's the rule."**
- D: cautious bots should close whenever a legal close exists (`8d24f6e`). *Reason:*
  matches must terminate. This was superseded on Sep 12.
- Leave during a match goes back to the **lobby**, not the landing screen. The
  "Gameplay" button became "Play solo".
- **D: no auto-generated share link.** The host shares the raw code. (Reversed by the
  Sep 14 spec.)
- **D: "one by one".** Keep one task list, finish and mark each item, then move on.
- Live room USLZ, "close didn't show": it was the *other* player's turn, and they were
  away. **D: "don't skip the away player, just wait until they play or apply the 8
  minute rule"** (`ef4817f`). The Continue-to-spectator mechanism was reverted.
- Monetisation ideas: H flagged token or gift models as a gambling risk and suggested
  cosmetics, a family pass, merch and similar. Nothing was decided.

### Aug 28 – 31: close UI and stale caches
- **Close UI final:** on your own discard turn, show every close option as a direct
  button ("discard this and close") plus **Keep playing**. No intermediate banner, and
  the hand isn't locked. D rejected the banner variants.
- Kick appears only in all-human games, host only, with a confirm. The joiner's
  waiting view was invisible inside a hidden pane, so it was moved out of
  `#create-pane`.
- **Stale browser cache** was the root cause of repeated "still broken" reports.
  `Cache-Control: no-store` on every asset (`5fd037d`).
- A stress test proved there was **no lay-off "stuck" bug**; the harness had a `break`
  bug. A temporary `DIAG` line shipped by mistake (`df59cef`), and D spotted it.

### Thu Sep 3: status and lay-off order
- Clean tree, 150 tests. A full 2-human API game completed.
- **Sweeps:** lobby members and active games idle for 30 min are removed (153 tests).
- Fixed the `hintEl` orphan (introduced in `d65289d`). Removed the DIAG line.
- `room.pending` is now cleared on start (154). It had restarted matches mid-game: D
  reported "the game closes after the first close".
- **D: lay-off goes closer FIRST** ("the person who close the game first with their
  closing game selection then everybody else") (155).

### Sep 6: TDD skill check (meta, short).

### Mon Sep 7: quick wins, i18n, SeatID, room flow
- Quick wins (`7e56826`): "Your turn — Draw/Discard" banner, DRAW/DISCARD pill,
  66×96 mobile cards. Full `data-i18n` auto-scan (`9929e29`).
- **SeatID v1:** a 3-digit lobby code, `/api/room/by-seat`, `/api/lobby/rejoin`.
  "Leave room" became "Leave".
- **D: confirm your understanding before acting.**
- **Room flow** (pushed Sep 8):
  - solo = 2 random family bots and starts immediately;
  - no private bot dialog;
  - create goes straight to the room view;
  - private rooms show 2 characters of the code and no Join;
  - the last human out deletes the room;
  - a 2-human leave shows "You're the only player left; the game will close".
- **Sweeps clarified:** waiting or finished rooms 15 min, active games 30 min, and
  `AWAY_END_MS` 8 min. D asked for finished matches to be hidden and for clearer
  create feedback.

### Tue Sep 8: Start button, card back, seat model
- `4e08c01`: Start button wired once. Name length 4–14. A CHI/N/CHO card back in
  embedded Bebas Neue. *Reason:* cross-OS fidelity; D chose the complete version.
- `edcd691`: discard pile with backs under the top card. **Reverted Sep 12** at D's
  request.
- Seat-reclaim design: room code + SeatID, a binary result, session-token rotation, and
  a hard displaced screen.

### Sep 9 – 11: reclaim, room fixes, the black-screen family
- Shipped:
  - `d7c9600`: reclaim;
  - `dc500b7`: double-Enter guard;
  - `a67d00e`: SeatID privacy (`kickSeatId`, `isHost`/`isStarter`);
  - `9570362`: "Creating room…" lock.
- **Sep 11 (D):** "if there is only one human in the room let the game begin with 2
  random bots", and the private host's Start with nobody else gives 2 bots. Built and
  verified live. (Reversed by Hermes' Sep 14 audit.)
- D: put players at the table straight away and deal only when the game starts. This
  went in through the `serialize` pre-start branch and the `started` flag.
- **Fixes:**
  - `watchRoom` `.catch`;
  - room code wiped by `applyLang` (`0435caa`);
  - `enterGame` hides room-info;
  - scoreboard `id`;
  - pre-start `serialize` shape (`a968510`);
  - `p.seat`;
  - `startPendingMatch` sets `started`.
- **Q58L incident:** the cause was a stale cache, not the deploy. H replied in Spanish
  once; **D: "why you're responding in spanish"**. English only from then on.

### Sat Sep 12: black screen, hold vs dump, card audit, lay-off rotation
- `370e3e6`: black screen after the countdown, caused by destructuring state before the
  auto-start, a first poll that displaced the host, and `show(displaced-panel)` (156
  tests).
- H proposed improvements: public rooms shouldn't grow bots; the false close is
  invisible; Railway sleep wipes rooms; bots hold vs dump; delete the stray
  `app.js.public`. **D: "push 4 and 5".**
- `1b5b41c` (160): **hold vs dump.** Aggressive dumps any legal close; balanced dumps a
  leftover of 0–2, clean or chinchón, and holds 3–5; cautious dumps only chinchón or
  clean.
- `fc60210` (163): D: "cards are flipped, we are supposed to see the card". Now a
  **face-up discard, equal pile sizes, and D's photo as the card back**
  (`card-back.jpg`, 132×188). `style.css` went from 177 KB to 26 KB.
- **Card audit** (read-only): 79/80. Fixed: two definitions of
  `__isWild`/`__cardVal`, a Bastos emblem case, and a drift test. Now 81/81
  (`ab60089`, 168 tests).
- `c314ca9` (170): **the lay-off becomes a rotation.**
  - The closer leads, it wraps, and **Not yet** (`passTurn`) and **Ready** were added.
  - The YOUR TURN / WAITING FOR marker.
  - **A 6-card meld plus a leftover ≤5 is a legal close.**
  - A regression test uses D's 3/4 de Oros example.
  - *Reason:* a single pass robbed the closer, and a later player, of points.
- `c678ac5` (176): marker above the piles; **room codes are 4-letter EN/ES words**;
  SeatIDs are 3 digits and unique across rooms; fixed a rematch-join token bug.
- `b59e247` (179): `showWaitingView()` hides the panes, and the dead "Join a room
  instead" button was removed.

### Sun Sep 13: card transitions
- D handed in standalone card-transition CSS. H **refused to paste it in**, because
  `.card{position:absolute}` would have collapsed the hand, and ported the intent
  instead: **throw-pop on your own discard** plus GPU layer promotion (`8c1aab6`, 179
  tests). **This is the last commit known to be pushed.**

### Mon Sep 14: audit, redesign spec, failed push
- 02:55: D asked for an "audit the game code". H **changed** `startFreshMatch` so multi
  rooms with fewer than 2 humans are deleted and never get bots (179 tests). That
  contradicts the Sep 11 decision, and an audit should have been read-only. **Open.**
- 15:10: D dictated an **8-point redesign spec**: Play first, SeatID gone, share links
  plus WhatsApp, green felt, bots-stay sheet, CHINCHÓN pop, quiet empty states,
  Auto + Ready lay-off. H made partial edits with no reply and left `.backup` files.
- 19:10: D said "push". H committed locally as `80bbfe7` "feat: multi mode — no bots,
  requires 2+ humans". **The push failed** (GitHub HTTPS password rejected). H offered
  SSH or PAT setup. **Unresolved when Hermes was retired.**

### Fri Oct 2, 2026: four rulings from Dannel (after Hermes)
These settle questions the pack had listed as open. Three of them need code changes
that **have not been made yet** (see "Pending code changes" in `../README.md`).
- **D: a run can wrap from 12 round to 1** (…11‑12‑1…). *Reason:* Dannel's ruling.
  Overrides the current engine (`src/melds.js`) and `scripts/cards-audit.js`, which
  say no. **Engine change pending.** (House rule R37; was house-rules Q1.)
- **D: the wild (1 de Oros) is worth 0 when scoring.** *Reason:* it can sit with any
  other card at the table. The engine currently scores it 1. **Engine change
  pending.** (R38; was Q2.)
- **D: no lay-off timer.** Slow players get no nudge and no timeout during lay-offs.
  *Reason:* Dannel's ruling. Matches current behaviour. (R39; was Q4.)
- **D: the pre-start countdown is 60 seconds,** not the ~90s the code currently runs.
  *Reason:* Dannel's ruling. **Server change pending.** (R40; was lobby open
  question 2.)

---

## Bugs fixed (selected, with root causes)

| When | Bug | Root cause → fix |
|---|---|---|
| Aug 2 | Couldn't discard a card just picked up | Invented Gin Rummy rule → removed |
| Aug 2 | No dealer, seat 0 always first | Rule never asked → dealer/rotation modelled |
| Aug 2 | CLI stopped silently when scripted | `readline` on piped stdin → buffered reader shim |
| Aug 2 | Two "failing" lay-off tests | Tests hard-coded meld index 0 → `findMeld` by content |
| Aug 5 | False-close `revealedBy` wrong seat | Computed after turn advance → capture closer first |
| Aug 15 | Close UI never appeared | Options enumerated on 8 held cards → 7 kept cards |
| Aug 15 | 7-human match deadlock in lay-off | `isYourTurn` ignored the lay-off phase → OR in the phase turn |
| Aug 15 | Lay-off board blank | layoff view lacked `phase` |
| Aug 15 | Server crash on double-click | Guard returned `sendJson()`'s `undefined` → truthy error marker |
| Aug 15 | Share links said localhost | Railway port fallback → `publicBase(req)` |
| Aug 15 | Solo with 0 bots crashed | <2 players → clamp to ≥1 bot |
| Aug 17 | Lobby stayed English in Spanish | `applyLang()` only did in-game labels |
| Aug 18 | "Two of me" in a room | Seat dedupe by name → by lobbyToken |
| Aug 18 | Red dot never shown | `connected` always true → derived from `lastSeen` |
| Aug 16 | Every poll threw | Called `goToLobby()` before defining it |
| Aug 20 | Kick shown in bot games | Scoreboard lacked `isBot` |
| Aug 20 | Bot turn "hang" (180s timeout) | Called non-existent `cardRank` → `card.rank` |
| Aug 28 | Joiners saw blank waiting screen | `#room-info` inside hidden `#create-pane` → sibling |
| Aug 31 | "Close still broken" after deploys | Assets cached without `Cache-Control` → no-store headers (`5fd037d`) |
| Aug 31 | Lay-off "stuck" in stress test | Harness `break` bug, not the game |
| Sep 3 | `hintEl is not defined` on every render | Orphaned reference after a refactor (`d65289d`) |
| Sep 3 | Match restarted after first close | `room.pending` not cleared on start |
| Sep 3 | DIAG text visible in production | Temp diagnostic committed (`df59cef`) → removed |
| Sep 8 | Start button double-fired | Handler bound repeatedly → wired once |
| Sep 12 | `.jpg` served as text/plain | MIME map lacked `.jpg` |
| Sep 11 | Room code vanished | `applyLang()` overwrote it (`0435caa`) |
| Sep 11 | Black page / bounced to empty lobby | Scoreboard missing `id`; `seat: i` vs `p.seat`; pre-start `serialize` shape (`a968510`) |
| Sep 11 | Room never "started" | `startPendingMatch` didn't set `started` |
| Sep 12 | Black screen after countdown | State destructured before auto-start; first poll displaced host; `show()` hid `#game` (`370e3e6`) |
| Sep 12 | Client wild/value rules could drift | Two inline definitions → one + drift test |
| Sep 12 | Closer/others lost points in lay-off | Single pass → rotation with wrap + Not yet (`c314ca9`) |
| Sep 12 | Rematch join failed | Token bug (`c678ac5`) |
| Sep 12 | Dead "Join a room instead" button | Removed (`b59e247`) |

## Lessons learned

1. **Every rule must trace to Dannel's words.** Invented rules pass their own tests.
   Familiarity with neighbouring games is the hazard.
2. **Ask with a concrete example and numbers.** Abstract questions ("2 jokers or
   none?") wasted round trips.
3. **The newest instruction wins,** and so does the latest voice correction mid-build.
   Track reversals explicitly; this project had several (lay-off order, share links,
   lone-host bots, discard pile, card back, away handling).
4. **Separate server from client first.** Curl `/api/state` with the real seat. If the
   data is right, check the shipped bytes, then the cache, and only then client code.
5. **A stale browser cache was the default culprit** for "still broken after deploy".
6. **Suspect the test harness** before declaring an engine bug.
7. **Silent hangs are usually uncaught throws** in server-side bot or route code.
8. **Two `serialize` branches:** update both. Destructure after the auto-start.
9. **Remove all diagnostics and throwaway scripts** before committing.
10. **Audits are read-only.** Don't change behaviour under an "audit" label.
11. **Don't build ahead of promised data,** and keep cancelled features cancelled.
12. **Verify deploys by hash, not by a 200.** Say what you verified and what Dannel
    should eyeball.
13. **Never paste standalone CSS or JS blindly.** Port the intent and check its side
    effects (the `position:absolute` hand collapse).
14. **Credentials: keep tokens out of remotes, chats and logs.** Have a working push
    method (SSH) set up *before* it's needed. The Sep 14 push failed at the finish
    line.

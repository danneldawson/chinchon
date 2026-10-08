# Engineering guide: build, test, verify

How to work on `~/Desktop/chinchon` (github.com/danneldawson/chinchon). This was
distilled from Hermes' `chinchon-engineering`, `game-rules-engine-first` and
`chinchon-project` skills. Any test counts quoted below are historical; **the real
`npm test` output always wins.**

## 1. Project at a glance

- **Stack:** vanilla Node, CommonJS, **zero dependencies**, `node --test`. No Express,
  React, TypeScript or bundler.
- **Where things live:**
  - the engine is in `src/`;
  - a bare `http` server (`server.js`) serves `public/` plus a JSON API under `/api/`;
  - the client is `public/index.html`, `public/app.js` and `public/style.css`.
- **Don't confuse the two folders.** `~/Desktop/Chinchon game` is the abandoned Gemini
  attempt. Work only in `~/Desktop/chinchon`.

| File | Owns |
|---|---|
| `src/cards.js` | 80-card deck, `buildDeck`, `shuffle`, `cardValue`, `isWild`, `rankIndex`, `RANKS=[1,2,3,4,5,6,7,10,11,12]`. Card objects are `{rank, suit, deckId, id}`; there is **no** `cardRank`/`cardSuit` export |
| `src/melds.js` | `isValidSet`/`isValidRun`/`isValidMeld`, `countWilds`, `MAX_WILDS_PER_MELD` |
| `src/scoring.js` | `bestSplit` (brute-forces every split of 7 cards), `canClose`, `allCloseSplits`, `isChinchon`, `scoreHand` |
| `src/turn.js` | `startRound(playerCount, rng, dealer, active)`, draw/discard state machine (`'draw'`→`'discard'`), `closeOptions`, false close, `nextDealer`, stock reshuffle |
| `src/layoff.js` | greedy `resolveRound` (bots and simulation), `layoffOrder` |
| `src/layoff-interactive.js` | human lay-off rotation: `beginLayoff` (takes the closer's declared melds), `layMeld`, `attachCard`, `passTurn`, `declareReady`; `suggest` only for `play.js` |
| `src/match.js` | `createMatch`, `applyRound`, `isEliminated` (≥101), `MIN_SCORE=-50`, `activePlayers` |
| `src/bot.js` | `chooseDraw`/`chooseTurn`/`planLayoff`/`findAttach`/`shouldClose`, by skill |
| `src/room-words.js` | 4-letter EN/ES room-code words |
| `src/render.js`, `play.js`, `src/input.js` | terminal game (CLI) and piped-stdin shim |
| `test/*.test.js` | unit + integration tests; `test/soak.js` is the 500-match soak |
| `CHEATSHEET.md` | terminal quick reference for a non-technical player |

## 2. The core principle: engine first, small verified layers

Game bugs are **logic** bugs, and you can't debug logic through a browser. Build in this
order and never skip ahead:

1. a pure engine in `src/`, with no I/O;
2. exhaustive rule tests, green before moving on;
3. a terminal game, so Dannel can check that it *feels* right;
4. a bot plus a soak test (500 random matches);
5. only then the server and browser, as a thin wrapper that `require()`s the engine
   unchanged.

That's how the project was built (Aug 2 → Aug 15). Keep the discipline for every
change.

## 3. The gate: run after EVERY edit

```bash
cd ~/Desktop/chinchon
node --check server.js && node --check public/app.js   # plus any other changed file
npm test            # = node --test test/*.test.js ; must be 0 fail
npm run soak        # after any engine change: 500 matches, 2–7 players, no leaks, one winner
```

- **Test the glob, not a bare directory.** Use `node --test test/*.test.js`; a bare
  `test/` fails with MODULE_NOT_FOUND on some Node versions.
- **Re-run after the last edit,** even a one-character fix. A stale green run doesn't
  count.
- **Never describe a passing test you didn't run,** and never quote an old count as if
  it were current.
- **New behaviour gets a new test.** If a change breaks a test, decide which side is
  wrong, the test or the code; don't just patch the test.

## 4. Rules discipline

- **The house rules are in `../rules/house-rules.md`.** Every restriction in the engine
  must trace back to something Dannel actually said. If you can't quote the sentence,
  it's a guess. **Ask instead of guessing.**
- **Don't import rules from neighbouring games** (Gin Rummy, Rummy, Canasta). The
  "can't discard the card you just picked up" rule shipped with a green test and was
  wrong.
- **Test both directions:**
  - too many wilds is rejected;
  - a leftover exactly at 5 is allowed and 6 is rejected;
  - a duplicate rank in a run is rejected, but allowed in a set;
  - scoring picks the *best* split.
- **Closes are judged on the 7 KEPT cards.** When you enumerate close options, run the
  split finder once per candidate discard. Running it on the 8 held cards returns
  nothing, and the close UI never appears.
- **Trust nothing the caller claims.**
  - Re-validate that the cards are really in the hand: match on the unique `id` and
    decrement a count, which handles second-deck duplicates.
  - Re-validate the meld, and that the attach target really accepts the card.
- **Model declared actions.** Bots use the greedy resolver; humans use the interactive
  one with an explicit `declareReady`. The interactive score can legitimately be
  *higher* than the greedy one.
- **Don't hard-code meld indexes in tests.** Look melds up by content (`findMeld`).
- **Keep the client's copy of the rules from drifting.** The browser can't `require`
  the engine, so `window.__isWild` and `window.__cardVal` are duplicated in `app.js`.
  `test/client-cards.test.js` evaluates those expressions and compares them with
  `src/cards.js` for all 80 cards, and asserts exactly one definition of each. If the
  client needs another rule value, add it to that test rather than inlining a third
  copy. Prove a new guard can fail by mutating the source once, then restoring it.

## 5. Server and client pitfalls (each of these burned a session)

**Server**
- **`serialize()` has two return branches:** the main one and an early `if (!state)`
  pre-start one.
  - New fields go in **both**, otherwise the pre-start client gets `undefined`.
  - The pre-start branch must return the full shape (`a968510`).
  - Opponent seats must use `p.seat`, not the loop index.
- **Destructure `room.state` *after* the pending auto-start inside `serialize`.**
  Otherwise the first post-timer poll returns `started:true` with an empty hand, and
  the client shows a black screen.
- **Every transition that starts a game clears `room.pending` and sets
  `room.started = true`.** That applies to `/api/room/start`, `startFreshMatch` and
  `startPendingMatch`. Forgetting it restarted matches mid-game, and a forgotten
  `started` flag kept clients stuck pre-start.
- **Guards must return a truthy error.** Call `sendJson(res, 400, …)` first, *then*
  `return {error:true}`. `sendJson` returns `undefined`, so returning its result let a
  double-click crash the whole server.
  - Handlers read `g.room`, not an outer `room`.
  - Guard every route before touching engine state. An uncaught throw made
    `npm test` **hang**, not fail.
- **Sub-phases need `isYourTurn` *and* their own `phase` field** (for example
  `layoff.phase`), or the polling client skips its turn and deadlocks.
- **Scoreboard entries need the fields the client reads:**
  - `id` (or the current `kickSeatId`/`isHost`/`isStarter` scheme);
  - `isBot`.

  Dropping `id` bounced every client to a blank lobby. Missing `isBot` showed Kick in
  every game.
- **The `MIME` map must list every asset type.** `.jpg` was missing, so the card back
  was served as `text/plain`. A test asserts `image/jpeg` plus the JPEG magic bytes.
- **Bot crashes look like hangs.** A `TypeError` inside `runBotTurns` (calling a
  non-existent `cardRank`) leaves the HTTP request unanswered, which shows up as a
  silent 180s test timeout. To isolate it:
  1. `node --test --test-name-pattern="…"`;
  2. `git stash` to confirm it's your change;
  3. a repro with `req.setTimeout(2000)`;
  4. temporary `BOT_DEBUG` logs, removed afterwards.
- **Every bot skill must close on *some* legal close.** Stock exhaustion never scores,
  so a table of never-closing bots loops forever.
- **Feature gates are real stored flags** (`room.tutorialPaused`), updated at turn
  transitions, not computed only inside `serialize`. Then prove the gate *blocks*: a
  draw while paused must return 409.
- **`.Bot` names are reserved for bots,** and so is CHINCHON. Both are rejected
  server-side.
- **Keep code and UI strings ASCII-only** (CHINCHON without the accent).

**Client**
- **Define a helper before you call it.** Calling `goToLobby()` before it existed threw
  on every poll and froze the UI. Use a single `goToLobby()`; don't inline a second
  copy.
- **Guard `$()` against missing elements.** The client's `$()` returns a no-op object
  for missing ids, so a stale id can't kill the whole call chain.
  - Grep for orphaned references after every refactor. Removing `const hintEl` left
    dangling references that crashed every render.
- **`show()` hides `globby`, `lobby` and `game`.** Any new full-screen overlay must be
  added to it. The special case: `displaced-panel` lives inside `#game`.
- **A shared element inside a hidden pane is invisible** even when it has the right
  content. `offsetParent === null` gives it away. Make it a sibling of the panes.
- **The first poll adopts `sessionToken`;** only a real mismatch means displaced.
- **`poll()` returns early if `!state.code`,** so an in-flight poll can't undo a Leave.
- **Guard async re-entry** with flags like `creatingRoom` and the double-Enter guard,
  and show loading feedback before every fetch ("Creating room…").
- **i18n:**
  - `data-i18n` is auto-scanned, and it goes on the inner text span;
  - dynamic strings go through `t()`;
  - `applyLang()` must not overwrite dynamic text such as the room code.
- **Inject SVG with `.innerHTML`.** `suitEmblem` returns markup; `.textContent` prints
  the tags literally.
- **Don't use the `patch` tool on huge base64 lines.** Use line-indexed Python with
  asserts. Mostly historical now that the card back is a JPEG.

## 6. Hygiene before every commit

- Scan the diff for `DIAG`, `dbg`, `console.log`/`console.error`, and `// TEMP` or
  `// DEBUG`. A `DIAG` status line once shipped to production (`df59cef`) and Dannel
  spotted it.
- Delete throwaway scripts (`mkroom.js`, `verify_*.js`, `find_seed.js`) and debug hooks
  such as `CHINCHON_SEED`, which was removed Aug 18.
- **`search_files` times out on the big files.** Use `grep -n` instead.
- Don't commit `.backup` files. The Sep 14 session left `public/index.html.backup`
  untracked.

## 7. Audits

"Audit the cards" or "audit the code" is **read-only**:
- find the issues and rank them by severity;
- show an `n/m passed` run;
- **change nothing**, then offer the fixes.

Use `../scripts/cards-audit.js`, which `require`s the real engine and never
re-implements it. The Sep 12 card audit (79/80, then 81/81 after fixes) is the model.
The Sep 14 code "audit", which changed behaviour, is the counter-example.

## 8. Test-count history (for orientation only)

35 → 61 → 75 → 99 → 105 → 111 → 114 (browser slice 1, Aug 13) → 121 → 136 → 144
(Aug 18) → 149 → 150 (Sep 3) → 155 → 156 → 160 (hold-vs-dump) → 163 → 168 (card audit)
→ 170 (lay-off rotation) → 176 → **179** (`8c1aab6`, Sep 13; also the Sep 14 audit
run).

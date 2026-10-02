# Chinchón: Dannel's family house rules (authoritative)

This is the **family's own variant**. It differs from the rules you'll find online, so
**do not fill gaps from "standard" Chinchón, Gin Rummy or Rummy**. One earlier build
did that (it imported a Gin Rummy discard restriction) and it shipped with a passing
test that asserted the wrong behaviour.

**Sources, merged here:**
- The confirmed ruleset Hermes kept (`chinchon-ruleset.md`, Aug–Sep 2026).
- The rule shorthand in Hermes' `MEMORY.md` and `USER.md`.
- Older memory snapshots and pending memory notes.
- Dannel's own words in the chat history (the transcripts, kept in a separate private
  repo, danneldawson/chinchon-transcripts).
- Dannel's rulings of Oct 2, 2026 (R37–R40).

**When sources disagree,** the newest statement from Dannel wins, and the disagreement
is listed under [Open questions & resolved conflicts](#open-questions--resolved-conflicts).

**Oct 2, 2026 rulings.** Dannel settled four questions that were open here (run wrap,
wild value, lay-off timer, pre-start countdown). They are rules **R37–R40**. Three of
them (R37, R38, R40) are **not in the engine/server yet**; see "Pending code changes"
in `../README.md`.

**Where the code lives:** `src/` in the repo is the implementation. If the code and this
file disagree, **ask Dannel** rather than "fixing" either one quietly. (Exception: R37,
R38 and R40 are decided rulings the code hasn't caught up with yet; there, the code is
what needs changing.)

> Notation: *1 de Oros* = the ace of coins. *Meld* = a combination (set or run).
> *Deadwood* / *leftover* = cards not in a meld. In the Spanish UI the deadwood label
> is **"sobrante"**.

---

## Quick reference

| Topic | Rule |
|---|---|
| Deck | 2 × 40-card Spanish decks = **80 cards**; ranks 1–7, 10, 11, 12 (no 8/9); every card exists twice |
| Wild | **1 de Oros** (an existing card, so there are exactly **2 wilds**); max **one wild per meld** |
| Values | 1–7 = face value; 10/11/12 = **10**; 1 de Oros (wild) = **0** (R38; engine still scores 1, change pending) |
| Set | 3+ of the same rank; duplicate suits allowed |
| Run | 3+ of the same suit in sequence; **7 → 10 is consecutive** (7‑10‑11‑12); runs **wrap 12 → 1** (…11‑12‑1…) (R37; engine doesn't wrap yet, change pending) |
| Players | **2–7**; hands hidden until someone closes |
| Turn | draw 1 (stock or face-up discard) → discard 1; a card just taken from the discard may be thrown straight back |
| Close: clean | two melds using all 7 kept cards (4+3) → closer scores **−10** |
| Close: leftover | 3+3 (or one 6-card meld) + one leftover card worth **≤5** → closer scores that card's value |
| Can't close | leftover worth 6+, or more than one leftover |
| Chinchón | all 7 cards in **one** meld → **wins the whole match on the spot**, no lay-off |
| False close | nobody scores, round doesn't advance, closer's hand is exposed, play continues |
| Lay-off | rotation that starts with the closer and wraps; explicit **Ready**, optional **Not yet**; **no timer**, nudge or timeout (R39) |
| Elimination | **≥101 is out for good** (100 survives); no buy-back |
| Score floor | totals never go below **−50** |
| Winner | last player standing (or a chinchón); exactly one winner |
| Pre-start countdown | **60 s** before a game starts (R40; server currently runs ~90 s, change pending) |

---

## The rules (numbered)

### A. Deck and cards

**R1. Two decks.** Two 40-card Spanish decks are shuffled together into one **80-card**
deck.

**R2. Ranks and suits.**
- Ranks are **1, 2, 3, 4, 5, 6, 7, 10, 11, 12**. There are **no 8s or 9s**.
- Suits are **Oros, Copas, Espadas, Bastos**.
- **Every card exists exactly twice**, once per deck. Holding two identical cards
  (two 5 de Copas, say) is legal.

**R3. The wild is the 1 de Oros.**
- It is *not* an extra card; it's one of the existing 40 in each deck. So there are
  **exactly two wilds** in play, and one lucky player can hold both.
- The other three 1s (Copas, Espadas, Bastos) are ordinary cards.

**R4. What the wild can do.** It can stand in for any card in a set or a run. It can
also be played as itself, a natural 1 de Oros (for example in 1‑2‑3 de Oros).

**R5. One wild per meld.**
- A meld may contain **at most one wild**. Never two, not even to win with a chinchón
  (the one exception for chinchón is in R23).
- Both wilds can still be used in the same hand if they sit in **separate** melds.
- The cap is enforced during the lay-off too, so you can't attach a wild to a meld that
  already has one.

**R6. Card values (for deadwood and leftovers).**

| Card | Points |
|---|---|
| 1–7 | face value |
| 10, 11, 12 | 10 each, any suit |
| 1 de Oros (wild) | **0** (R38, Oct 2, 2026; the engine still scores it 1, change pending) |

Dannel's reasoning on the wild: it "can never not be placed", because when someone
closes there is always a meld on the table to drop it onto. On Oct 2, 2026 he ruled it
is worth **0** for that reason: it can sit with any other card at the table (R38).

### B. Melds

**R7. Set.** Three or more cards of the **same rank**. Because there are two decks,
**duplicate suits are allowed**: 5 de Copas + 5 de Copas + 5 de Espadas is a valid set.

**R8. Run.** Three or more cards of the **same suit in consecutive order**.
- Since 8 and 9 don't exist, **7 → 10 is consecutive**, so 6‑7‑10 and 7‑10‑11‑12 are
  valid runs.
- A run can't contain the same rank twice. If you hold the second deck's copy of a
  rank that's already in the run, that copy is blocked.
- A run with a real gap is invalid.
- A run **can wrap from 12 back to 1** (…11‑12‑1…). Dannel ruled this on Oct 2, 2026
  (R37). The current engine and `scripts/cards-audit.js` still say no; that code change
  is pending.

### C. Players and visibility

**R9. Player count.** 2 to 7 players. Seven players use 49 cards, which leaves 31 for
the stock.

**R10. Hidden hands.**
- Nobody sees anyone else's cards until someone closes.
- Melds are **not** laid on the table during normal play.
- This hidden information is the heart of the game: the closer is trying to catch
  everyone else holding high, unusable cards.

### D. Dealing and turns

**R11. Dealing.**
- The dealer deals **7 cards to each player**, one at a time, **clockwise starting with
  the player on their left**.
- The player on the dealer's left plays first, and the **dealer plays last**.

**R12. Rotation.** The deal moves **one seat to the left** after every round.
Eliminated players are skipped.

**R13. The face-up card.**
- After the deal, one card is turned **face up** beside the stock to start the discard
  pile.
- The first player may take it on the very first turn.
- The discard pile never has fewer than one card.

**R14. A turn.**
- Draw **one** card, either from the stock or the top of the face-up discard pile.
- Then discard **one** card.
- You always end your turn holding seven cards.

**R15. No discard restriction.**
- A card you just took from the discard pile **may be discarded again on the same
  turn**. In Dannel's words: "if I pick one from the pile and it doesn't work, I can
  just drop it off."
- The drawn 8th card is always discardable, whether it came from the stock or the
  discard pile.
- Do **not** import the Gin Rummy restriction.

**R16. Empty stock.**
- When the stock runs out, flip the discard pile, **keep its top card face up**,
  reshuffle the rest into a new stock, and carry on.
- There's **no limit** on how many times this can happen.
- Running out of stock **never ends or scores a round**; only a close does.
- Dannel confirmed this on Aug 20: "when stock pile ends reshuffle the same pile and
  continue, that's the rule".
- The UI shows a short "Stock reshuffled" note.

### E. Closing a round

**R17. When you can close.**
- You close as part of your discard.
- The close is judged on the **7 cards you keep after discarding**, not on the 8 you
  hold during the discard step.

**R18. Clean close (−10).** If your 7 kept cards form **two melds with nothing left
over** (a 4 and a 3), you score **−10** for the round.

**R19. Close with a leftover.**
- **Shape:** two 3-card melds plus **one leftover card worth 5 or less**. You score
  that card's value.
- **6-card meld:** a single 6-card meld plus one leftover worth 5 or less is also
  legal. Dannel confirmed this on Sep 12, and a test pins it. In the family's words:
  "6 card meld is a legal close but normally people don't close but wait for the needed
  card to Chinchón and win the game."
- Don't "tidy" this into a two-melds-only rule.

**R20. When you can't close.** A leftover worth **6 or more**, or **more than one**
leftover card, blocks the close completely.

**R21. The closer picks which melds to reveal.**
- If your hand splits into melds in more than one way, the game shows **every** legal
  decomposition with its score, and you choose one.
- This is real strategy, not cosmetics: everyone else lays off onto the melds you
  reveal, so what you show (and what you hide) matters.

**R22. A mis-discard just continues the hand.**
- The game offers the close (it has already checked that the close is legal), but you
  still choose which card to discard.
- If you throw a card that ruins your own close, the hand simply continues. Other
  players may not even notice.
- Dannel wants players to have this agency.

**R23. Chinchón.**
- All **7 cards in a single meld**: either a 7-card run in one suit, or 7 cards of the
  same rank.
- It **wins the entire match immediately**, whatever the scores. A player sitting on
  98 can still win this way.
- There is no lay-off.
- **One** wild is allowed. The only exception: a second 1 de Oros is allowed when it is
  being played as the **natural 1 de Oros** in the sequence, not as a wild. This is
  from Dannel on Aug 16.

**R24. False close.**
- **What triggers it:** a player declares a close without actually having a valid game.
- **Scoring:** nobody scores, no points move, and the round counter doesn't advance.
- **Penalty:** the would-be closer's hand is **exposed** to the table, so everyone now
  knows what they hold.
- **Afterwards:** play continues from that state.

### F. Lay-off (after a valid close)

**R25. Only after a valid close.** The lay-off only happens after a real close. The
closer's chosen melds go **face-up on the table first**.

**R26. The lay-off is a rotation.**
- It **starts with the closer**, whose game is already face up, then goes round the
  table in turn order and **wraps around**.
- It ends only when **every active player has declared Ready**.
- Dannel described the order this way: "the person who close the game first with their
  closing game selection then everybody else."
- The order is there to keep things tidy so the close isn't chaos, not to hide
  anything.

**R27. What you can do on your lay-off turn.**
- Lay down your own valid melds, which then become available to everyone after you.
- Attach cards to **any** meld on the table, not just the closer's.
- **Nobody is trusted:** every play goes through the same validator as the closer's.
  You can't lay junk, you can't lay cards you don't hold, and a card that doesn't fit
  is rejected.

**R28. "Not yet" and "Ready".**
- Shedding is **never automatic**. You act, then you explicitly declare **Ready**
  ("count me").
- Whatever is still in your hand at that moment is what you pay.
- If you need a later chance (because a gap might open after others lay down), choose
  **Not yet**. You stay in the rotation, aren't counted yet, and can act again on the
  wrap.

**R29. The closer's last word.**
- On the wrap-around turn, the closer may shed the leftover card that didn't fit
  earlier.
- If they do, they score **0** for the round. A clean close stays −10.
- Worked example (Dannel, Sep 12, 3 players):
  1. The closer lays 5‑6‑7 de Oros and keeps the 3 de Oros as their leftover.
  2. Player 2 lays their game and attaches the 4 de Oros.
  3. Player 3 holds the *other* 4 de Oros (now a duplicate, so blocked) and a 2 de
     Oros. They choose **Not yet**.
  4. The rotation comes back to the closer, who sheds the 3 and scores 0.
  5. That 3 is what lets player 3 shed the 2 afterwards.
- A single pass would have cost the closer 3 points and player 3 their 2.

**R30. Lay-off is damage control.**
- The closer gains nothing from other players' lay-offs.
- **Only the closer can score −10.** Another player who empties their hand during the
  lay-off scores **0**.

### G. Scoring, elimination, winning

**R31. The computer keeps score.** Round scores are added to running totals. Dannel
was explicit: "I need the computer keeping the score for them."

**R32. Score floor.**
- Totals never drop below **−50**. Repeated clean closes stack until they hit −50.
- Going up isn't affected: −10 followed by +20 gives +10.
- An earlier "−15" figure was a misunderstanding, which Dannel confirmed on Aug 16.

**R33. Elimination.**
- A total of **101 or more** knocks you out **permanently**. Exactly 100 is still
  alive.
- There is **no buy-back** (no *recompra*, no re-entry).

**R34. Eliminated players.**
- They get **no cards**, **no turns**, take no part in the lay-off, score nothing more,
  and are skipped when the deal rotates.
- They only get dealt back in when a fresh match starts.
- The scoreboard still shows their final score.

**R35. Winning.**
- The **last player standing** wins, or whoever makes a chinchón.
- There is **exactly one winner**; second place is not "a winner".

**R36. Leaderboard at match end.**
- The winner is shown at the top with a 🏆 and their points.
- If they won with a chinchón, the word **"Chinchón"** is shown **instead of points**.
- Everyone else is ranked by **elimination order**: the last player eliminated sits just
  below the winner, and the first player eliminated is at the bottom.

### H. Rulings confirmed by Dannel on Oct 2, 2026

These were open questions until Oct 2, 2026 (see C12–C15 below). **R37, R38 and R40
are not implemented yet**; the code still behaves the old way until the pending changes
listed in `../README.md` land.

**R37. Runs wrap from 12 to 1.** A run may continue from 12 round to 1, so …11‑12‑1…
in one suit is consecutive (this is on top of the 7 → 10 bridge in R8). Dannel's
ruling. *Code status:* `src/melds.js` and `scripts/cards-audit.js` still reject the
wrap; pending change.

**R38. The wild scores 0.** A 1 de Oros left in your hand counts **0** points, because
it can sit with any other card at the table. *Code status:* `cardValue` in
`src/cards.js` (and its client mirror `window.__cardVal`) still score it **1**; pending
change.

**R39. No lay-off timer.** Slow players get **no nudge and no timeout** during the
lay-off; the table waits until they act, pass (**Not yet**) or declare **Ready**. The
YOUR TURN / WAITING FOR *name* marker shows who everyone is waiting on. Dannel's
ruling. *Code status:* matches current behaviour.

**R40. Pre-start countdown is 60 seconds.** A room's countdown before a game starts is
**60s**. Dannel's ruling (it restates the Aug 18 decision). Details of the room flow
are in `lobby-and-session.md` §3. *Code status:* the server currently runs about
**90s**; pending change.

**Total: 40 numbered house rules (R1–R40).** Presentation rules (suit emblems, colours,
card faces) aren't game rules and live in `../preferences/ui-and-design.md`. Lobby,
room and session behaviour is in `lobby-and-session.md`.

---

## Where the rules live in the code (as of Sep 14, 2026)

| File | Owns |
|---|---|
| `src/cards.js` | 80-card deck, `cardValue`, `isWild`, `rankIndex`, shuffle |
| `src/melds.js` | `isValidSet` / `isValidRun` / `isValidMeld`, `MAX_WILDS_PER_MELD` |
| `src/scoring.js` | `bestSplit`, `canClose`, `allCloseSplits`, `isChinchon`, `CLOSE_BONUS` |
| `src/turn.js` | deal, dealer rotation, draw/discard, `closeOptions`, false close, `replenishStock` |
| `src/layoff.js` | automatic lay-off resolver (bots / soak), `layoffOrder` |
| `src/layoff-interactive.js` | human lay-off rotation: `beginLayoff`, `layMeld`, `attachCard`, `passTurn` (Not yet), `declareReady`, `suggest` |
| `src/match.js` | totals, `MIN_SCORE = -50`, elimination at 101, `eliminatedOrder`, winner |
| `public/app.js` | client mirrors `__isWild` / `__cardVal`, guarded by `test/client-cards.test.js` |

The hard invariants the engine must never break:
- Exactly 80 cards at all times: `stock + discard + all hands = 80`.
- 2–7 players.
- One wild per meld.
- 101 means out.
- A chinchón wins outright.
- Eliminated seats get no cards and no turns.

---

## Open questions & resolved conflicts

Check every **Open** item with Dannel before you change behaviour.

### Open

**Q3. Chinchón with a natural 1 de Oros plus a wild.** Dannel's exception (R23) allows
two 1 de Oros in a chinchón if one of them plays as the natural card. Check that the
engine's chinchón test accepts that hand. The early tests only say "chinchón with two
wilds is rejected".

(Q1, Q2 and Q4 were resolved by Dannel on Oct 2, 2026; see C12–C14 below. The
numbering is kept so older references still point at the right item.)

### Resolved (the newest rule wins; kept here for history)

| # | Topic | Older version | Current rule (newest) |
|---|---|---|---|
| C1 | Lay-off order | Aug 2–Sep 2: players after the closer go first, **closer last** (the `chinchon-project` and `chinchon-elimination` skills still say this) | Sep 3: **closer first**. Sep 12: a full **rotation with wrap + Not yet** (R26–R29) |
| C2 | Sets with duplicate suits | Aug 2, Hermes' first assumption: a set needs three different suits | Dannel: duplicates allowed ("it can repeat") (R7) |
| C3 | Deck size | Aug 2, first reading: two decks plus a joker each = 82 | Dannel corrected it: the wild **is** the 1 de Oros, so 80 cards (R1, R3) |
| C4 | Discarding a card you just picked up | Early engine blocked it (Gin Rummy rule, with a test) | Allowed (R15) |
| C5 | Dealer | Early engine had no dealer; seat 0 always started | Dealer deals clockwise, plays last, rotates left (R11–R12) |
| C6 | Score floor | "−15" mentioned | Misunderstanding; the floor is **−50** (R32). The old ruleset's "do not clamp at zero" still holds, because the clamp is at −50, not 0 |
| C7 | Who can score −10 | unclear | Only the closer; others who go clean in the lay-off score 0 (R30) |
| C8 | 6-card meld + leftover | `canClose` comment said "needs two combinations" | Legal close, confirmed Sep 12 and pinned by a test (R19) |
| C9 | Stock exhaustion | Hermes asked whether it should end the round | Reshuffle and continue, no cap, never scores (R16) |
| C10 | Buy-back | Hermes asked about *recompra* | No buy-back; 101 is out for good (R33) |
| C11 | Single winner | — | Exactly one winner; others ranked by elimination order (R35–R36) |
| C12 | Run wrap 12 → 1 (was Q1) | Aug 2: Dannel described the 7→10 bridge only. Aug 17–18: Hermes' notes and tutorial text said "11‑12‑1 is also a valid run" (source message lost). The engine (`src/melds.js`) and `scripts/cards-audit.js` treat runs as **not** wrapping; only the bot's run heuristic in `src/bot.js` uses cyclic adjacency | Oct 2, 2026, Dannel's ruling: runs **wrap** (…11‑12‑1…) (R37). Engine and audit still need changing, and the bot heuristic and in-game rules text should be checked to agree |
| C13 | Value of a stranded wild (was Q2) | Engine and the Sep 12 card audit: wild = **1**. Aug 18 tutorial draft: "counts as 0 (it's wild)" | Oct 2, 2026: the wild is worth **0**, because it can sit with any other card at the table (R38). Engine and client mirror still need changing |
| C14 | Lay-off timer (was Q4) | No timer; Hermes asked on Sep 12 whether Dannel wanted a nudge or timeout, with no answer | Oct 2, 2026, Dannel's ruling: **no timer, no nudge, no timeout** (R39). Matches current behaviour |
| C15 | Pre-start countdown | Aug 18 decision: 60s. The code as described in Sep notes: about 90s | Oct 2, 2026, Dannel's ruling: **60s** (R40). Server still needs changing |

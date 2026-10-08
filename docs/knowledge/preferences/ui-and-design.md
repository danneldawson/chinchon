# UI, animation and design decisions

This covers the visual and interaction decisions for the web client (`public/index.html`,
`public/app.js`, `public/style.css`), roughly in the order they were made, with the
newest winning. Status is **[live]** unless marked otherwise. Lobby flow is in
`../rules/lobby-and-session.md`.

## 1. Cards and suits

- **Fournier *style*, but no copyrighted Fournier art.** The suit emblems are original
  SVGs:

  | Suit | Emblem | Colour |
  |---|---|---|
  | Oros | gold coin/circle | gold |
  | Copas | red **cup** (never a heart) | red |
  | Espadas | blue sword | blue |
  | Bastos | green plant/club | green |

- **Never render `♥` for Copas anywhere.**
- Every suit marker on screen uses the same `suitEmblem` SVG: hand, discard top, the
  discard tray, and the small face-up cards on the felt (melds, false-close hand).
  - Bastos has an explicit case (Sep 12 audit).
  - Inject the SVG with `.innerHTML`, not `.textContent`.
- **Ranks print as numbers** (1–7, 10, 11, 12), large and readable.
- The **wild (1 de Oros)** gets a visible wild marker/border in every renderer.
- **Card size:** about 66×96 on mobile (Sep 7 quick wins). The hand is one swipeable
  row on phones, so all 8 cards stay big enough to tap.

## 2. Theme

- **The current theme is black with cream cards:** `--bg:#0f1115`, `--card:#f7f3e9`.
  Dannel "LOVES" the high contrast, so keep it.
- **[decided, Sep 14, unbuilt] "Felt":** a green table, card shadows, and the
  Draw/Discard buttons removed in favour of tapping the piles. This would replace the
  black background, so **confirm with Dannel** before changing the theme. It was in the
  partly applied, uncommitted Sep 14 edits.

## 3. Table layout and piles

- **Tappable piles** give the game its physical feel: during your draw turn, tap
  `#stock` or `#discard` to draw.
  - Piles get a `.tappable` hover lift.
  - The labelled buttons stayed as a fallback; the Sep 14 spec removes them.
- **Stock:** a cream card-back stack with a big live count.
  - [decided, Sep 14] The "?" on the stock should be blank.
- **Discard pile:** a single face-up top card, the **same 66×96 size as the stock**
  (`fc60210`, Sep 12; three tests in `test/server.test.js` guard it).
  - The Sep 8 version (`edcd691`) stacked 3 card backs under the top card. Dannel
    rejected it: "cards are flipped, we are supposed to see the card". Don't bring back
    `.discard-back` layers.
  - Only the top card is visible.
  - **Full discard history was CANCELLED.** Players track the throws in their heads.
- **Card back = Dannel's own photo**, cropped from `IMG_4062.JPG` to
  `public/card-back.jpg` (132×188, about 7 KB). Shipped Sep 12.
  - It replaced the embedded Bebas Neue "CHI / N / mirrored CHO" SVG back from Sep 8
    (`4e08c01`). `style.css` shrank from 177 KB to 26 KB as a result.
  - **Don't reintroduce the data-URI back.** The crop recipe is in
    `../engineering/testing.md` §12.
  - A later memory consolidation dropped this note, but only to save space; the photo
    is still the newest decision.
- **Turn marker:** **YOUR TURN** or **WAITING FOR *name***, placed **above the piles**
  (Sep 12).
  - It also shows whose turn it is during the lay-off rotation.
  - Turn banner: "Your turn — Draw" / "Your turn — Discard", plus a **DRAW / DISCARD**
    phase pill (Sep 7).
- **Room code** is shown above the scoreboard ("Room WORD").

## 4. Your hand

- **Reorder by tap-to-swap.** While waiting or on the draw turn (not the discard
  phase), tap one card, then another, to swap them.
  - This is a pure client view preference stored in `state.handOrder`.
  - Drag-and-drop was rejected as unreliable on touch screens.
- **Locked 8th slot:** after you draw, the new card sits in a separate locked slot
  (`⟶`) and never enters `handOrder`.
  - **All 8 cards are discardable,** including the drawn one.
- **Hints:**
  - **Live meld hints were removed** ("Combinations found" is gone).
  - **The deadwood total is kept** as a reference readout ("sobrante" in Spanish).
  - Dannel: "remove live hand hints yes but keep deadwood".
- **Run-hint banner (Aug 18):** a purple banner, "you can close with this run", that
  appears after you draw the card that completes a closeable run, then fades after 10s.
  - It was briefly orphaned by a refactor (`hintEl`) and fixed on Sep 3.

## 5. Closing and lay-off UI

- **Card-based close (Oct 8, 2026, Dannel; replaces the list of close options).**
  - **Close button = rules gate.** One **Close** button appears only on your own
    discard turn when a close exists. The server sends just `canClose: true`; it never
    sends decompositions or `yourMelds`. Without closing you just tap a card to
    discard as normal. The numbered close-option buttons and **Keep playing** are gone.
  - **Close mode:** tap cards, then **Make meld**; the group goes face up on the felt
    (the piles hide meanwhile). Tap a group on the felt to take it back. Then select
    the card to throw and **Discard & close**. **Cancel** leaves close mode.
  - **No hints:** the client only checks counts (a meld is 3+ cards, exactly one card
    to throw). Whether the melds are valid is the server's call.
  - **Invalid declared melds = false close (R24):** the hand is shown to everyone in a
    banner above the table (until that player's next discard) and play continues. No
    reject-and-rearrange.
  - **Scored as declared:** a chinchon hand laid down as 4+3 is −10; chinchon only as
    one 7-card group. The closer's leftover is what they did not declare.
- **A mis-discard is allowed.** If the player throws the wrong card, the hand just
  continues.
- **Lay-off (Oct 8, 2026).**
  - Every table meld is shown face up on the felt with the name of the seat that laid
    it (runs in rank order); the cards shrink to fit, so nothing scrolls.
  - Actions: select 3+ cards and **Lay selected**; **attach** by selecting one card and
    tapping a meld on the felt; **Not yet** (pass); **Ready** (lock in your score).
  - **Suggest and Auto were removed** (buttons and their API routes). Bots still play
    their lay-off automatically on the server.
  - The marker shows whose lay-off turn it is.
  - **No lay-off timer:** no nudge and no timeout for slow players (house rule R39,
    confirmed Oct 2, 2026).
  - ~~[decided, Sep 14, unbuilt] Show **Auto + Ready** up front, and put Lay / Suggest /
    Not yet behind a **More** menu.~~ Superseded Oct 8, 2026: no Auto, no Suggest.
- **[decided, Sep 14, unbuilt] Chinchon moment:** a 7-card chinchon pops a
  **CHINCHON** full-screen celebration once.
- **Game over:**
  - The leaderboard shows the 🏆 winner with their points, or the word "Chinchon" alone.
  - Everyone else is listed in elimination order.
  - Chat stays usable on top of the overlay.
  - Buttons: Rematch / Leave.

## 6. Animation rules

- **Transform and opacity only.** Never toggle `display` or `pointer-events` in the
  middle of an animation, so nothing ends up looking tappable when it isn't.
- **Edge-triggered.** Animate only when the state actually changes (`onceAnimate`), not
  on every 1.2s poll, which would make things flicker.
- **Respect `prefers-reduced-motion`.**
- **What has shipped:**
  - deal-in, discard slide and panel fades (Aug 15);
  - a **throw-pop on your own discard** with GPU layer promotion (`8c1aab6`, Sep 13).
    That was ported from a standalone CSS file Dannel handed over. It **wasn't pasted
    in**, because its `.card{position:absolute}` would have collapsed the hand.
- The server is always the source of truth, so a broken animation can never corrupt
  the game. The worst case is a refresh.

## 6a. Watching turns play out (built Oct 8, 2026, 2:28 PM PT)

Dannel, by voice at 2:24 PM PT: in solo, each bot's turn should play out on its own,
with a short pause, so he can watch the bot pick a card and then discard. Same
addition: in a multiplayer game, each player should watch the other humans' turns
the same way, live, instead of only seeing the result. One animation, shared by
bots and humans. This is a design note only. No game code changes with it.

**Built the same day.** Dannel said "go with the proposal" at 2:28 PM PT, and the
open questions were settled as follows. One constant, `STEP_MS = 800` (about 0.8s
a step, so a bot turn is about 1.6s). No skip or speed button. A backlog of more
than one turn that is already a few seconds old replays at `CATCHUP_MS = 250`;
fresh steps, including the bots that just played after your discard, stay at 0.8s
so you can actually watch them. The server snaps (no replay) when the cursor is
older than the log or more than one circuit of the table behind (each seat drawing
and discarding once). Lay-off steps use the same pause. The tutorial's open bot
shows the card it drew; every other stock draw stays face down to everyone but the
drawer. `prefers-reduced-motion` skips the travel. The server still resolves turns
instantly; `src/steps.js` records the log on the room (it is in the snapshot) and
`serialize` returns the steps after `?since=`. The client replays them on a shadow
of the table and then snaps to the server. Your controls follow the server, so they
unlock the moment it is your turn, and the moving card cannot take a tap or sit
over the hand.


### How it works today

**Solo bots are resolved in one go, on the server, inside the request.**
`runBotTurns` (`server.js`) runs at the end of the request that triggered it: creating
a solo room, the human's discard, and the deal of the next round. While the phase is
`draw` or `discard` it loops (up to 500 steps). If the seat to play is a bot, the bot
draws at once and then discards or closes at once, and the loop moves to the next
seat. It stops when the next seat is a human. Nothing is sent to the browser between
those steps. The response, and every later poll, is the table *after* all of those
bots have finished. With the two bots in a solo game, both full turns collapse into
one jump. A bot's draw choice is `bot.chooseDraw`: the face-up discard when taking it
improves the hand (an aggressive bot also takes it when it builds toward a meld),
otherwise the stock. The discard or close is `bot.chooseTurn`.

If a bot closes, `runBotLayoffTurns` then plays every following bot's whole lay-off
in that same call: lay its melds, attach whatever fits, and Ready, until it is a
human's lay-off turn or the lay-off is done. That dumps at the end too.

A human's own draw does not run the bots. The draw and the discard are two requests,
and `runBotTurns` only finds bots to play once the human has discarded (or at the
start of a round, for any bot seated before the human).

**There is no live channel.** A started game polls `GET /api/state` every 1.2
seconds and re-renders the snapshot. The snapshot has: your own hand; `lastDrawnId`
for *your* last draw only; the face-up discard and the last 5 discards
(`discardHistory`); each other seat's name and a hand *count*, never their cards;
the stock count; whose turn it is. An opponent's stock draw is never a card. A poll
that arrives after a finished turn shows only the new discard and the hand count
back at 7. There is no list of moves, so a missed poll cannot be replayed. The only
motion shipped is your own throw-pop and a few fades (section 6). Other seats jump.

**Other humans are one step ahead of that, and still invisible as motion.** A
person's draw and discard are separate requests, so the server really is mid-turn
between them. Everyone else notices only on their next poll, as a new snapshot: the
upcard gone or the stock one shorter, then a new upcard. No card travels from the
pile to a seat. If they draw and discard between your polls (1.2 seconds, longer if
the tab was in the background), you only ever see the result. Remembering the old
upcard is the only way to tell "took the discard" from "drew from the stock", and
the client does not even do that.

**Who has bots.** A normal multiplayer room has no bots (since Sep 14). Solo is the
bot game: 2 random family bots, started immediately. Tutorial rooms are the
exception, with two bots, one of whose hands is face up.

### The sequence (bots and other humans, same animation)

For each seat that is not you, in order:

1. The turn ring moves to that seat.
2. **Draw.** From the stock: a face-down card travels from the stock to that seat.
   From the discard: the face-up card travels from the tray to that seat. The card
   an opponent drew from the stock is never turned over. Only the seat who drew it
   learns which card it was (as today, via their own hand).
3. A short pause.
4. **Discard.** The card they throw travels from their seat to the tray, face up.
5. Pause, then the next seat.

**Proposed timings, adjustable, not decided:** about 0.6–1 second for the draw,
the same for the discard, so roughly 1.5–2.5 seconds for one bot. A lay-off step
(a meld landing on the felt, an attach) uses the same length unless Dannel wants it
shorter.

**A bot that closes.** The close is a step of its own: the discard plays, then the
melds the bot actually used (the engine's split, since a bot does not tap cards)
land face up on the felt, the same way a declared human close does. The lay-off
then plays one action at a time (lay, attach, Ready), not as one dump. A human
close is unchanged for the closer; everyone else sees the discard and then the
melds, in that order, instead of a jump. A false close stays today's banner (the
hand shown); it should appear in this same order so it is not skipped.

**Your own turn.** Your draw and your discard happen immediately, as they do now,
including the card you took from the stock. You do not watch your own stock draw as
a face-down card. While bots are playing it is not your turn, so the hand stays
locked the way it already does. In a multiplayer game your controls turn on the
moment the server says it is your turn, even if a short catch-up animation is still
finishing. That animation must not cover the hand or take taps.

**Phones and the no-scroll layout.** The moving card is a transform (and opacity)
between places that already exist: stock, discard tray, a seat's fan, the felt. No
new panel, no page scroll, and the viewport-fit checks still have to pass.
`prefers-reduced-motion` skips the travel and just shows the result of that step
(section 6).

**Falling behind, refresh, restart.** The client remembers the last step it has
played (for that room, so a refresh can continue). Steps it missed play in order,
faster when more than one turn is queued (proposed: about 0.25 seconds a step). A
brand-new tab, or a gap older than the log, jumps to the current table and starts
from now, so joining late does not replay the round. The log lives on the room, so
the existing snapshot (`CHINCHON_STATE_FILE`) keeps it across a restart. There is
no timer to re-arm. If the animation and the server's snapshot ever disagree, the
snapshot wins.

**Tutorial.** The open bot's hand is already public, so its drawn card may be shown
face up. The hidden bot, and every human's stock draw, stay face down to everyone
else. The tutorial pause before your own turn is unchanged.

### How to build it (recommendation)

**Keep the server instant, and have the client replay a move log.** Do not make
`runBotTurns` wait on a timer.

Each draw and each discard (bot or human) is appended to the room as a numbered
step: who, `stock` or `discard`, and, for a discard or a taken upcard, the card.
A stock draw is stored with its card on the server but the serialized step for
every *other* seat omits it. A close step carries the melds. `serialize` returns
the steps after the cursor the client sends.

The client keeps a local shadow of the table and plays the steps against it, then
snaps to the server snapshot once it is caught up. That is what makes a 1.2 second
poll still show draw-then-discard: the steps are events, not "whatever the table
looks like right now". A timer on the server would not survive that poll, would
have to be re-armed after every restart, and would make the rules and the tests
depend on the clock. The pause is only visual. The game, the scores and the tests
stay synchronous.

### Tests to add when this is built

- A bot turn appends a draw step and then a discard step, in that order. Two bots
  before the human append four steps before the response returns.
- For any seat but the one who drew, a stock step has no card. The seat who drew
  still gets the real card in their hand, as today.
- A taken upcard and a discard both carry the face-up card.
- A bot close appends the melds it used, then one lay-off step per lay, attach and
  Ready.
- Asking for steps after a cursor returns only the later ones, in order. A cursor
  older than the log returns a "snap" instead of the whole round.
- The log round-trips through the room snapshot.
- Client: steps play draw then discard; reduced motion does not travel; the hand
  is tappable the moment it is your turn; no new page scroll.

### Open decisions — resolved Oct 8, 2:28 PM PT (see the note at the top of this section)

- Are the proposed times right (0.6–1 second a step, 1.5–2.5 seconds a bot), or
  does he want them shorter or longer?
- Does he want a skip / go-faster control, or is a faster catch-up when you are
  behind enough?
- How fast should catch-up be, and after how many missed turns should it snap
  instead of replaying?
- Should a bot's lay-off steps take the same pause as a draw and a discard?
- For the tutorial's open bot, show the card it drew, or a face-down card like
  everyone else?

## 7. Mobile

- **Tap handling:** `touch-action: manipulation` and
  `-webkit-tap-highlight-color: transparent` remove the 300ms delay, double-tap zoom and
  the blue flash.
- **Small screens (`@media max-width:640px`):**
  - the hand is a single horizontally scrolling row;
  - the gap between piles is tighter;
  - close buttons stack at full width;
  - chat docks to the bottom, collapsed.
- **Fit to the viewport (Oct 5, 2026, Dannel): the game screen never scrolls the page**,
  on desktop and on phones in portrait and landscape, for 2-7 players and 7 or 8 cards.
  - Layout/sizing only (no new features or visual changes): `#game` is a column capped
    at `100dvh`; the oval table takes the leftover height (never taller than the old
    430px) and is a size container, so piles and seats scale with it; hand cards size
    to the row width (36-66px, same 66x96 proportions), all 8 visible from 360px wide.
  - Phones in landscape (`orientation: landscape` and height <= 500px): table on the
    left, header/hand/chat bar on the right. Chat starts collapsed there too.
  - Collapsed chat stays a compact bar under the hand; expanded it is an overlay sheet.
    On desktops >= 1280px wide the chat floats in the margin beside the board.
  - The lobby fills the viewport too (player list / chat log scroll inside their panels).
  - Guarded by `test/viewport-fit.test.js`; verified headless at 390x844, 360x740,
    844x390, 740x360, 1280x800, 1366x650, 1920x1080.
- **"Make it an app":** Share → **Add to Home Screen** opens full-screen like an app, so
  no rewrite is needed.

## 8. Language (i18n)

- **English and Spanish.** The selector is on the landing screen only, and `applyLang()`
  translates every string.
  - Strings are auto-scanned through `data-i18n` (`9929e29`), which goes on the inner
    span.
  - **Keep `applyLang()` from wiping dynamic text.** It once erased the room code
    (`0435caa`).
- **Bot chat mirrors the language of the last message in the chat.** If that language
  isn't recognised, bots fall back to a couple of preset "don't understand" lines.
  Detection is a pure local function with no API.

## 9. Bots and presence visuals

- **Family roster (solo opponents; 2 picked at random per solo game):**

  | # | Name | Role | Persona | Skill | Look |
  |---|---|---|---|---|---|
  | 1 | Sunilde.Bot | aunt | hyped/aggressive | aggressive | 🍺 amber |
  | 2 | Grisel.Bot | grandma | serious/knowledgeable | cautious | 👓 grey |
  | 3 | Flor.Bot | neighbour | hyped | balanced | 🎀 red |
  | 4 | Clavillazo.Bot | neighbour | hyped underdog | cautious | 👖 blue |
  | 5 | Yoya.Bot | aunt | happy/laughing | cautious | 👗 coral |
  | 6 | Ernesto.Bot | uncle | calm/dry | balanced | 🎩 green |
  | 7 | Barrabah.Bot | uncle | hyped/aggressive | aggressive | 🔥 orange-red |
  | 8 | Tibursio.Bot | cousin | playful/competitive | aggressive | 🎮 purple |
  | 9 | Chon.Bot | kid | excited/naive | cautious | 🧸 yellow |
  | 10 | Matea.Bot | big sister | encouraging/steady | balanced | 🌟 teal |

  - Dannel supplied 1–7. Hermes proposed 8–10 and Barrabah's look and quirk, then built
    them. Each bot has a name ending in `.Bot`, a family role, a persona, a skill
    level, a language that mirrors chat, a colour + emoji look, and a signature quirk.
- **Tutorial pair (never mixed with the roster):**
  - **Pro.Bot**: an older English professor with a soothing UK voice.
  - **Dee.Bot**: a young American with a hyped voice.
- **How the skill levels play their closes** (Sep 12, `1b5b41c`; supersedes "cautious
  closes whenever possible" from Aug 20):

  | Skill | Closes when |
  |---|---|
  | aggressive | it has any legal close |
  | balanced | the leftover is worth 0–2, or it's a clean close or a chinchon; holds on 3–5 |
  | cautious | only a chinchon or a clean −10 |

- **Status dots:**
  - green = active;
  - amber = away (2 min);
  - red = disconnected (45s) or spectator, shown with "–";
  - an eliminated player still watching gets green plus their score.

## 10. Sep 14 redesign spec (Dannel's 8 points), status unbuilt or partial

Dannel dictated this at 15:10 PT on Sep 14:

1. **Play first.** The landing screen no longer shows "Players here (0)".
   - A big **Play** button starts solo against bots.
   - **Play with friends** goes to the lobby.
   - Names can be as short as 2 letters ("Ana").
2. **SeatID gone.**
   - It's saved in the browser, and the table resumes if you had a game.
   - `?code=` in the URL sits you down.
   - Nobody types a SeatID.
3. **Share.** The waiting room gets **Copy table link** and **WhatsApp** buttons:
   "That's how family actually joins."
   - **Oct 4, 2026:** WhatsApp button removed (Dannel). Room code + Copy remain.
4. **Felt.** A green table, card shadows, and the Draw/Discard buttons removed; you tap
   the piles.
5. **Bots stay.** If a bot is still seated, the "only player, game will close" sheet
   doesn't show.
6. **Chinchon.** A 7-card run pops **CHINCHON** full-screen, once.
7. **Quiet empty.** No "no matches yet". The chat waits for two people. The stock "?"
   is blank.
8. **Lay-off.** Auto + Ready, with Lay / Suggest / Not yet behind **More**.

**Status of the spec:**
- Hermes started editing `index.html` and `app.js` (landing buttons, SeatID removal,
  boot, share buttons) but never replied and left `.backup` files.
- Those edits, together with the Sep 14 audit change to `server.js`, were committed
  locally as `80bbfe7`, and the **push failed**.
- Treat every item as **not done** until it's verified in the repo.

## 11. Deferred and cancelled

| Item | Status |
|---|---|
| Full discard-pile history | **Cancelled** (don't re-propose) |
| Live meld hints | **Removed** (deadwood kept) |
| Bot voices / TTS / voice clone | Deferred |
| Leagues | Paused |
| Merch | Idea only |
| Custom domain (~$2/yr) | Deferred |
| Showing opponents' partial info | Never requested; hands stay hidden |

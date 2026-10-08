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

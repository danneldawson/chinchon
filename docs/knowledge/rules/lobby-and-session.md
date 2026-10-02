# Lobby, rooms and session behaviour

This file covers how players get into a game and what happens around it: the landing
screen, lobby, room types, room codes and seats, starting, leaving, kicking, chat,
reconnecting, rematch/Hold, and clean-up sweeps. Card rules are in `house-rules.md`.

Status markers:
- **[live]**: shipped and verified on Railway, as far as the Hermes history shows.
- **[decided]**: agreed with Dannel but not built yet, or only partly built.
- **[open]**: unclear or contradictory; check with Dannel.

Where Dannel changed his mind, the newest decision is the one listed, with the history
noted alongside.

---

## 1. Hard rules (Dannel enforces these)

1. **Bots are SOLO-only.** A multi-human room (2–7 humans) **never** gets bots, and a
   dropped human's seat is **never** filled by a bot. The seat is held and the player
   rejoins it.
   - Exceptions Dannel asked for on Sep 11 ("only one human → 2 random bots" and
     "private host taps Start alone → 2 random bots") were later reversed by Hermes'
     Sep 14 audit. See [open](#9-open-questions).
2. **"CHINCHON" / "CHINCHÓN" is a reserved name**, because the system posts its
   automatic chat messages under that name. `/api/lobby/enter` rejects it with a 400.
3. In code and UI strings, **spell CHINCHON without the accent** (encoding safety). The
   word appears on the landing screen only, not repeated in the lobby.
4. **The app always boots to the landing screen** (name + language). It never resumes
   straight into a game on boot. If the in-memory state has been wiped (Railway
   restart), the client heals itself and goes back to the landing screen.

## 2. Landing and lobby [live]

- **Landing:** you enter a name first. The "Your name" label lives *inside* the input,
  not repeated outside it.
  - Name length is **min 4, max 14** characters (Sep 8).
  - The Sep 14 spec wanted to allow 2-letter names ("Ana"); that was not built.
- **Language:** the English/Spanish selector is **on the landing screen only**.
  `applyLang()` must translate **every** string, including the lobby. An early bug left
  the lobby in English.
  - Translation uses `data-i18n` attributes that are auto-scanned.
  - Put `data-i18n` on the inner span so a button's icon isn't wiped.
  - The Spanish deadwood label is "sobrante".
- **Lobby layout:** three stacked boxes under a **LOBBY** title.
  1. Players here: a count and the names currently in the lobby.
  2. Create + Join buttons, then **Active matches**.
  3. General chat.
- **Active matches** shows every started match, whatever its mix of humans, bots,
  private or public.
  - Each entry shows the code, mode, live scoreboard, a Playtime timer, and any pending
    rematch countdown.
  - **Private rooms show only the first 2 characters of the code and no Join button**
    (Sep 7).
- **Lobby chat:** capped at 25 messages, 160 characters each. It is separate from the
  per-room chat.
- **Leaving the lobby** needs a red confirm.
- **Presence:** members are deduplicated by `lobbyToken`. The lobby is polled every 2s.

## 3. Room types

| Type | Behaviour |
|---|---|
| **Solo** (vs bots) | Picks **2 random family bots** from the roster and **starts immediately** (Sep 7). There is no bot-picker dialog. |
| **Public** (multi) | Code is posted in Active matches during the pre-start countdown so others can join; auto-starts at 0. |
| **Private** (multi) | Goes straight to the room view with a **host Start button**. Code is hidden in the lobby (2 characters only) and there's no bots dialog (Sep 7). |
| **Tutorial / Learning session** (launched from the Rules overlay; the separate lobby button was removed) | A solo game capped at 3 players, with the fixed tutorial pair **Pro.Bot** and **Dee.Bot**. The tutorial pauses with a 409 while waiting for the learner. Never mixed with the family roster. |

- **Every create goes straight to the room view.** The buttons disable immediately and
  show "Creating room…", with a lock against double-taps (Sep 9–11).
- The table appears with the code plus either the countdown or the Start button.
  Players who join are put at the table straight away, and **cards are dealt only when
  the game actually starts** (Sep 11 request, built through the
  `serialize` pre-start branch and the `started` flag).
- **Pre-start countdown [decided, Oct 2, 2026; server change pending]:** **60s**
  (house rule R40).
  - Decided Aug 18: **60s** for both public and private rooms; Dannel confirmed 60s on
    Oct 2, 2026.
  - The code as described in Sep notes runs about **90s**, so the server still needs
    changing to 60s. See `../README.md`, "Pending code changes".

## 4. Room codes, seats and identity [live, Sep 12]

- **Room codes are 4-letter English/Spanish words**, family-safe and A–Z only (from
  `src/room-words.js`). They replaced random codes.
- **Seat ID = 3 digits, unique across all live rooms.** You reclaim a seat with room
  code + seat ID.
  - The reclaim and lobby tokens behind it stay long and private.
  - Seat IDs are kept private: the client gets `isHost`/`isStarter` booleans and a
    `kickSeatId`, never other players' tokens.
- **Reclaiming a seat on another device (Sep 8–9 design):**
  - The result is binary: success or a clear error.
  - The session token rotates on reclaim.
  - The old device sees a hard *displaced* screen: "This seat was reconnected from
    another device".
  - The first poll after create/join **adopts** the session token; it must not treat
    the new token as a theft.
- **Resume:** `localStorage['chinchon:'+code] = seatId`.
  - The share link embeds `?code=…&seat=…`.
  - Lobby token and name are kept in localStorage (`chinchonLobby`). These are not
    cookies, so clearing cookies alone doesn't reset the game.
- **[decided, Sep 14, unbuilt]** Drop SeatID from the UI completely ("nobody types
  SeatID"):
  - save it in the browser and resume the table automatically;
  - `?code=` in the URL sits you down;
  - the waiting room gets **Copy table link** and **WhatsApp** share buttons.

## 5. Starting, leaving, kicking

- **Start (private):** the host taps Start. The button is wired once, which fixed a
  double-binding bug on Sep 8.
- Any transition that starts a game **must clear `room.pending`**. Otherwise the
  leftover countdown restarts the match mid-game; this happened on Sep 3.
- **Leave:** the button label is just **"Leave"** (Sep 7). Leaving the lobby or a match
  needs a `confirm()`.
  - You can leave at any time without disrupting the others.
  - **Leave from a match returns you to the LOBBY** (with Create/Join visible), never
    to the name/landing screen. Dannel: "bring me back to the lobby."
  - `poll()` must ignore a response that arrives after Leave.
  - **Leaving a 2-player game is allowed** (Dannel: "anybody to leave the game, any
    game, whenever"). It ends the match.
  - If the **host** leaves (or is kicked), the next player is promoted to host.
  - **When the last human leaves, the room is deleted** (Sep 7).
  - **2-human game:** when one leaves, the other sees "You're the only player left; the
    game will close" with an OK button (Sep 7). This replaced the older rule, where the
    server refused with "cannot leave a 2-player game".
  - **[decided, Sep 14, unbuilt]** If a bot is still seated, the "only player" sheet
    should **not** show.
- **Kick:** host only, behind a confirm, and **only in all-human games** (it's hidden
  whenever bots are seated). A **bot host can never kick** (403).
  - The kicked player returns to the lobby and is **banned from that room by
    `lobbyToken`**, so they can't rejoin by code.
  - A client whose seat disappears from the scoreboard bounces to the lobby through a
    single `goToLobby()` helper.

## 6. Room chat [live]

- Each room has its own chat: the last 10 messages, 160 characters each.
  - Desktop: it floats top-right, above the game-over overlay.
  - Phone: it docks to the bottom and starts collapsed.
- **A new room starts with empty chat.** A **rematch keeps** the chat history. A player
  who leaves goes back to the lobby; the room and its chat stay for the others.
- **[decided, Sep 14, unbuilt]** The chat should wait until there are two people, with
  no "no matches yet" filler.

## 7. Reconnect and presence [live]

| Constant | Value | Meaning |
|---|---|---|
| `CONNECTED_MS` | 45 s | no poll for 45s → **red** dot (disconnected) |
| `AWAY_MS` | 120 s | no poll for 2 min → **amber** (away) |
| `AWAY_END_MS` | 8 min | a player away this long → **the match ends** (`gameOver`) |
| `HOST_GRACE_MS` | 60 s | host away this long (3+ players) → next-oldest human is promoted |

- There's no WebSocket: every `/api/state` poll (about every 1.2–2s) stamps `lastSeen`.
- **Away players are never skipped** (Dannel, Aug 20: "don't skip the away player,
  just wait until they play or apply the 8 minute rule", commit `ef4817f`).
  - When it's an away player's turn, the room **holds** until they come back and play.
  - If they're away for **8 minutes**, the match ends.
  - The older "host can **Continue** after 90s and turn the away player into a
    spectator" mechanism (`CONTINUE_WAIT_MS`, still described in Hermes' reconnect
    notes) was **reverted**.
  - Dropped seats are never filled with bots.
- **Scoreboard markers:**
  - spectator, if that state still exists: red dot and "–"
  - eliminated player still watching: green dot and their score
- **Server memory is wiped when Railway restarts or sleeps,** so rooms disappear. The
  client recovers by going back to the landing screen.

## 8. Rematch, Hold and sweeps [live]

- **When a match ends,** the game-over screen offers **Rematch** and **Leave**.
- **Rematch** opens a **90-second pending window**.
  - It does not restart instantly, and there is deliberately **no "start now"**
    button.
  - The lobby announces "A new game in room XXXX starts in 90s — join the rematch!".
  - People watching the lobby can join the rematch, up to 7 humans.
- **Hold toggle:** only the human who started the rematch can use it, and **never a
  bot**.
  - The first tap pauses the countdown, and the lobby shows that the room is held by
    the host.
  - A second tap resumes it with a fresh 90s.
  - The countdown fires inside `serialize()`, since there's no scheduler.
- **Sweeps** run every 5 minutes (`sweepRooms`/`sweepLobby`, Sep 3 and Sep 7). A room
  is evicted only when **all** of its humans are idle:
  - waiting or finished rooms: after more than **15 min**;
  - active games: after more than **30 min**;
  - lobby members: after more than **30 min** idle.

  On Sep 7 Dannel also asked for finished matches to be hidden from the lobby
  straight away, and for clearer feedback when you create a room.
- **Learning room cap:** 3 players.

## 9. Open questions

1. **A lone human in a multi room.**
   - Dannel, Sep 11: "if there is only one human in the room let the game begin with 2
     random bots", and "on the private room … if he hits start and there is no human
     apart from him start the room with 2 random bots". Hermes shipped this and
     verified it live.
   - **Sep 14, 03:09 PT:** Hermes' unprompted "audit" changed `startFreshMatch` so a
     multi room with fewer than 2 humans is **deleted** and never gets bots (179 tests
     passing).
   - **Sep 14, 19:10 PT:** a local commit `80bbfe7` "feat: multi mode — no bots,
     requires 2+ humans" was made, but **the push failed** (GitHub auth).
   - Both directions came from Dannel at different times (the bots-solo-only hard rule,
     then the Sep 11 exception). **Ask which one he wants now.**
2. **The Sep 14 eight-point redesign spec** was only partly applied, in the uncommitted
   edits on his Mac, which also left `.backup` files. Check the repo state before
   assuming any of it exists. The full spec is in `../preferences/ui-and-design.md` §10.
3. **Leaving a 2-player game:** the engineering notes say the server's "cannot leave a
   2-player game" 400 was removed, so leaving now ends the match. The Sep 7 client
   sheet tells the remaining player. Verify both behave this way in the current repo.
4. **Share links have changed direction more than once.**
   - Aug: the share link embedded `&seat=`.
   - Aug 20: Dannel said "don't make a link with the code; just create the
     room code and the host can share it on his own way". The copy-link button and the
     `?code=` auto-join were removed, so joiners type the code after entering their
     name.
   - The Sep 14 spec reverses that again: **Copy table link + WhatsApp**, and `?code=`
     sits you down.
   - The newest decision is the Sep 14 one, but it's unbuilt; confirm before
     implementing.
5. **Seat reclaim** stays as it is (code + 3-digit SeatID) until the Sep 14 "SeatID
   gone" item is built.

### Resolved on Oct 2, 2026

- **Pre-start countdown length** (was open question 2): **60s**, Dannel's ruling
  (house rule R40). The server still runs about 90s; that change is pending.

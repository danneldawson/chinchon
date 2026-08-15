# CHINCHÓN — Cheat Sheet

Keep this open while you play.

---

## START THE GAME

Open Terminal (⌘ + Space → type `Terminal` → Enter), then paste:

```
cd ~/Desktop/chinchon

```

More opponents: `node play.js 4`  (any number 2 to 7)

Quit any time: **Control + C**

---

## READING YOUR CARDS

```
  1●*  10♠  5♣   2♣   11♠  7♠   7♥
  1    2    3    4    5    6    7
```

The small numbers underneath are what you type.
To play the `5♣`, you type `3`.

### The four suits

| Symbol | Suit    | Color  |
|--------|---------|--------|
| `●`    | Oros    | yellow |
| `♥`    | Copas   | red    |
| `♠`    | Espadas | cyan   |
| `♣`    | Bastos  | green  |

`*` after a card = **the wild card** (1 de Oros). There are two in the deck.

---

## EVERY TURN IS TWO STEPS

### Step 1 — Draw

```
Draw from [s]tock or [d]iscard (4♣)?
```

- `s` = take the unknown top card from the pile
- `d` = take the face-up card shown

**Take from the discard only if it actually helps you.** It tells the other
players what you are collecting.

### Step 2 — Discard

```
Discard which card? (number, or "c N" to close)
```

- `3` = throw away card number 3, turn passes
- `c 3` = throw card 3 **and close the round**

⚠️ You cannot throw back the card you just took from the discard pile.

---

## WHEN CAN I CLOSE?

The game tells you. It looks like this:

```
  You can CLOSE this turn.
    throw 7♥ → score 2
```

You never have to work it out yourself. If that message is not on screen,
you cannot close.

### What closing needs

You must have **two combinations**, and then either:

| Your hand | Result |
|---|---|
| 4 + 3 = all seven cards used | **−10 points** (best) |
| 3 + 3 + one card left over of **5 or less** | that card's value counts |
| One card left over worth **6 or more** | ❌ you cannot close |

### What counts as a combination

- **Run** — same suit, in order: `4♥ 5♥ 6♥`
- **Set** — same number: `11● 11♠ 11♣`
- Minimum 3 cards.
- Remember: **7 → 10 → 11 → 12 are consecutive** (no 8s or 9s in the deck).
- **Only one wild per combination.** Never two.
- Two identical cards in a set is fine — there are two decks.

---

## CHINCHÓN — winning outright

All **seven** cards in **one single** combination:

- `1♥ 2♥ 3♥ 4♥ 5♥ 6♥ 7♥` — a seven-card run
- or seven of the same number

**You win the whole game instantly.** Everyone else loses, whatever the score.

You may use one wild in it. Not two.

---

## THE LAY-OFF (after someone closes)

This is your chance to dump cards so they don't count against you.

```
[l] lay a combination   [a] attach a card   [auto] do it all   [r] ready
```

**Easiest: type `auto`, then `r`.**
`auto` lays down everything it can find and attaches every card that fits.
`r` means "count me, I'm done."

### Doing it by hand

- `l` → then type the card numbers, e.g. `1 2 3`
- `a` → then the card number, then which table pile to add it to
- `r` → finish your turn

### The rules of this phase

- Everything still in your hand when you type `r` is **counted against you**
- You can attach to **anyone's** combination, not just the closer's
- Order goes: the player after the closer first, closer last
- The closer gets a final chance to dump their leftover card

The game shows you hints:

```
  You could lay:
    [ 10♠ 11♠ 7♠ ]
  You could attach:
    5♣ → table 1
  Costs you 47 pts if you stop now
```

---

## SCORING

| Card | Points against you |
|---|---|
| 1 to 7 | face value |
| 10, 11, 12 | **10 each** |

**101 or more = you are out.** Permanently. No buying back in.
Exactly 100 is still alive.

Last player standing wins.

A −10 close can push your total **negative**. That is good.

---

## QUICK REFERENCE

| Prompt | Type |
|---|---|
| Draw from [s]tock or [d]iscard | `s` or `d` |
| Discard which card? | a number, e.g. `4` |
| Discard — and close | `c 4` |
| Lay-off | `auto` then `r` |
| `(enter)` | just press Enter |
| Quit | Control + C |

---

## STRATEGY

1. **Dump 10s, 11s and 12s early.** They cost 10 each if you get caught.
2. **Keep the wild.** It fits almost anywhere, including someone else's pile
   during the lay-off.
3. **Watch what the bots take from the discard** — it tells you what they need.
4. **Close early even for a few points.** Sitting on a good hand while someone
   else closes is how you get caught with 40 points.
5. **A −10 close is worth chasing** when you are close to 101.
6. Don't feed the discard pile with cards next to what someone just took.

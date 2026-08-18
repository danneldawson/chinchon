'use strict';

// Narrow, deliberate close hint.
//
// RULE (from the player's house rules):
//   The ONLY hint ever shown is a RUN (sequence) of <=4 cards that forms ON THE
//   SPOT when the player draws and keeps a card that makes a close possible.
//   - Never shows sets.
//   - Never shows the full combination list.
//   - Never reveals a CHINCHON (the whole-game win stays hidden).
//   - Shows for ~10s, then disappears (UI duty).
//
// Inputs:
//   closeOptions : the view's closeOptions array
//                  [{ split: [[card,...],[card,...]], chinchon, cardId, score, kind }]
//   lastDrawnId  : id of the card just drawn (or null for the opening 7)
// Returns:
//   { run: [card,...] } | null   -- a run of length 3..4 spanning the drawn card,
//                                    only when a close is currently available and
//                                    it is NOT a chinchon.

const { isWild, rankIndex } = require('./cards');
const { isValidRun } = require('./melds');

// Longest run (by rank) inside a meld, used only to surface the run hint.
function longestRunIn(meld) {
  const naturals = meld.filter((c) => !isWild(c));
  if (naturals.length < 2) return [];
  const idxs = naturals.map((c) => rankIndex(c.rank)).sort((a, b) => a - b);
  let best = [idxs[0]];
  let run = [idxs[0]];
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] === idxs[i - 1] + 1) {
      run.push(idxs[i]);
    } else {
      run = [idxs[i]];
    }
    if (run.length > best.length) best = run.slice();
  }
  return best; // array of rank indices
}

// Find the first close option (non-chinchon) whose decomposition includes a run
// of length 3 or 4 that contains the drawn card. Returns that run's cards, or
// null. We scan splits for a meld that is a valid run, length 3..4, containing
// lastDrawnId.
function drawRunHint(closeOptions, lastDrawnId) {
  if (!Array.isArray(closeOptions) || closeOptions.length === 0) return null;

  // Never hint a chinchon win.
  const nonChinchon = closeOptions.filter((o) => !o.chinchon);
  if (nonChinchon.length === 0) return null;

  for (const opt of nonChinchon) {
    const splits = Array.isArray(opt.split) ? opt.split : [];
    for (const meld of splits) {
      if (!isValidRun(meld)) continue;          // sets excluded
      if (meld.length < 3 || meld.length > 4) continue; // <=4 only
      const ids = meld.map((c) => c.id);
      // "on the spot" => the drawn card is part of the run
      if (lastDrawnId && !ids.includes(lastDrawnId)) continue;
      return { run: meld.slice() };
    }
  }
  return null;
}

module.exports = { drawRunHint, longestRunIn };

'use strict';

// Watched-turn log (Oct 8, 2026). The rules still resolve instantly inside the
// request; this only records what happened, in order, so a client can replay it.
// The log lives on the room, so the existing snapshot persists it.

const { orderRun } = require('./melds');

// One circuit of the table (each seat draws and discards) is 2 steps per player.
// A cursor further behind than that, or older than what we still keep, snaps.
const STEP_CAP = 80;

function pub(c) {
  if (!c || typeof c !== 'object') return null;
  return { id: c.id, suit: c.suit, rank: c.rank, deckId: c.deckId };
}

function ensure(room) {
  if (!Array.isArray(room.steps)) room.steps = [];
  if (typeof room.stepSeq !== 'number') {
    room.stepSeq = room.steps.reduce((m, s) => Math.max(m, s.seq || 0), 0);
  }
}

function pushStep(room, step) {
  ensure(room);
  const seq = ++room.stepSeq;
  const stored = { seq, t: Date.now(), type: step.type, seat: step.seat };
  if (step.from) stored.from = step.from;
  if (step.card) stored.card = pub(step.card);
  if (step.hand) stored.hand = step.hand.map(pub);
  if (step.melds) stored.melds = step.melds.map((m) => orderRun(m).map(pub));
  if (step.cards) stored.cards = step.cards.map(pub);
  if (step.meldIndex != null) stored.meldIndex = step.meldIndex;
  if ('nextSeat' in step) stored.nextSeat = step.nextSeat == null ? null : step.nextSeat;
  room.steps.push(stored);
  const cap = Math.max(STEP_CAP, 8 * ((room.players && room.players.length) || 2));
  if (room.steps.length > cap) room.steps.splice(0, room.steps.length - cap);
  return stored;
}

function meldsFromCheck(check) {
  if (!check) return [];
  if (Array.isArray(check.melds) && check.melds.length) return check.melds;
  if (check.split && Array.isArray(check.split.melds)) return check.split.melds;
  return [];
}

// A discard, and the close or false close that came with it, as separate steps.
function recordDiscard(room, seat, card, res) {
  pushStep(room, { type: 'discard', seat, card });
  if (res && res.falseClose) pushStep(room, { type: 'falseClose', seat, hand: res.revealedHand || [] });
  if (res && res.closed) pushStep(room, { type: 'close', seat, melds: meldsFromCheck(res.check) });
}

function redact(step, viewerSeat, room) {
  const out = { ...step };
  if (out.card) out.card = { ...out.card };
  if (out.hand) out.hand = out.hand.map((c) => ({ ...c }));
  if (out.cards) out.cards = out.cards.map((c) => ({ ...c }));
  if (out.melds) out.melds = out.melds.map((m) => m.map((c) => ({ ...c })));
  // A stock draw is private. Everyone but the drawer sees a face-down card.
  // The tutorial's open bot is the exception: that hand is already public.
  if (step.type === 'draw' && step.from === 'stock' && step.seat !== viewerSeat) {
    const p = room.players && room.players[step.seat];
    const open = !!(p && p.reveal && room.tutorial);
    if (!open) out.card = null;
  }
  return out;
}

// `since` is the last seq the client has played. Omit it (a new tab) and the
// client is told to jump to now. A cursor the log no longer covers, or more
// than one full circuit behind, also snaps.
function stepsFor(room, sinceRaw, viewerSeat) {
  ensure(room);
  const last = room.stepSeq || 0;
  const n = (room.players && room.players.length) || 1;
  const missing = sinceRaw == null || sinceRaw === '';
  const since = missing ? NaN : Number(sinceRaw);
  if (missing || !Number.isFinite(since)) return { stepSeq: last, steps: [], snap: true };
  if (since >= last) return { stepSeq: last, steps: [], snap: false };
  const oldest = room.steps.length ? room.steps[0].seq : last + 1;
  if (!room.steps.length || since < oldest - 1) return { stepSeq: last, steps: [], snap: true };
  const raw = room.steps.filter((s) => s.seq > since);
  const play = raw.filter((s) => s.type === 'draw' || s.type === 'discard' || s.type === 'close' || s.type === 'falseClose');
  if (play.length > 2 * n) return { stepSeq: last, steps: [], snap: true };
  return {
    stepSeq: last,
    steps: raw.map((s) => redact(s, viewerSeat, room)),
    snap: false,
  };
}

module.exports = { pushStep, recordDiscard, stepsFor, meldsFromCheck, pub };

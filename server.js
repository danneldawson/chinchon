'use strict';

// Chinchon — browser server (zero dependencies).
//
// Hosts playable rooms over HTTP. Reuses the existing engine EXACTLY as-is
// (turn.js, scoring.js, match.js, bot.js, layoff-interactive.js, cards.js).
//
// RULES ENFORCED HERE (from BROWSER-PLAN.md):
//   - MULTI mode: 2-7 humans, bots ALWAYS 0 (rejected at the API).
//   - SOLO mode: 1 human + bots (1-6). Bots auto-play their turns. Chinchón
//     needs at least 2 players, so a solo game is forced to have >= 1 bot.
//   - bot.js is only ever called for seats flagged isBot === true.

const http = require('http');
const fs = require('fs');
const path = require('path');

const turn = require('./src/turn');
const scoring = require('./src/scoring');
const matchMod = require('./src/match');
const bot = require('./src/bot');
const layoffCore = require('./src/layoff');
const layoffInteractive = require('./src/layoff-interactive');
const cards = require('./src/cards');

// ----------------------------------------------------------------- global lobby
// A single shared lobby for the whole app. Anyone can enter with a username,
// see who's present, and use the general chat. No 7-cap here (it's a waiting
// area; rooms created from it still cap at 7). Rooms list their live state
// so lobby watchers can see active matches and join a rematch in progress.

const LOBBY_CHAT_CAP = 25;
const REMATCH_COUNTDOWN_MS = 90000;
const lobby = {
  members: new Map(), // token -> { token, name, at }
  chat: [],
};

function lobbyEnter(name) {
  const clean = String(name || '').trim().slice(0, 24) || 'Player';
  // The name "CHINCHON" is reserved for the system's auto-messages.
  if (clean.toLowerCase() === 'chinchon') return { error: 'name reserved' };
  // Unique-ish name within the lobby (append a number if taken).
  const taken = new Set([...lobby.members.values()].map((m) => m.name.toLowerCase()));
  let finalName = clean;
  let n = 2;
  while (taken.has(finalName.toLowerCase())) finalName = `${clean}${n++}`;
  const token = newSeatId();
  lobby.members.set(token, { token, name: finalName, at: Date.now() });
  return { token, name: finalName };
}

function lobbyChatPush(name, text) {
  const t = String(text || '').trim().slice(0, 160);
  if (!t) return;
  lobby.chat.push({ name, text: t, at: Date.now(), system: false });
  if (lobby.chat.length > LOBBY_CHAT_CAP) lobby.chat = lobby.chat.slice(-LOBBY_CHAT_CAP);
}

function lobbySystem(text) {
  lobby.chat.push({ name: 'CHINCHÓN', text, at: Date.now(), system: true });
  if (lobby.chat.length > LOBBY_CHAT_CAP) lobby.chat = lobby.chat.slice(-LOBBY_CHAT_CAP);
}

// Active matches feed for the lobby: each room's code, elapsed time, live
// scoreboard (totals), and whether it's at a rematch-countdown or game-over.
function lobbyMatches() {
  const out = [];
  for (const room of rooms.values()) {
    const m = room.match;
    out.push({
      code: room.code,
      mode: room.mode,
      started: !!room.started,
      gameOver: m ? !!m.gameOver : false,
      round: m ? m.round : 0,
      elapsedMs: room.started && room.startedAt ? Date.now() - room.startedAt : 0,
      pending: room.pending
        ? { code: room.code, secondsLeft: room.pending.hold ? null : Math.max(0, Math.ceil((room.pending.until - Date.now()) / 1000)), hold: !!room.pending.hold, hostName: room.pending.hostName }
        : null,
      scoreboard: m ? m.players.map((p) => ({ name: p.name, total: p.total, out: p.out })) : [],
    });
  }
  return out;
}

function lobbyState() {
  return {
    members: [...lobby.members.values()].map((m) => ({ name: m.name })),
    total: lobby.members.size,
    chat: lobby.chat,
    matches: lobbyMatches(),
  };
}

// View of a room's pending rematch for clients (counts down live).
function pendingView(room) {
  const pending = room.pending;
  return {
    code: room.code,
    secondsLeft: pending.hold ? null : Math.max(0, Math.ceil((pending.until - Date.now()) / 1000)),
    hold: !!pending.hold,
    hostName: pending.hostName,
    startedBy: pending.startedBy,
  };
}



function startPendingMatch(room) {
  room.match = matchMod.createMatch(room.players.map((pl) => pl.name));
  room.state = turn.startRound(room.players.length, Math.random);
  room.layoff = null;
  room.pending = null;
  room.startedAt = Date.now();
  // Chat is kept across rematches (same room, same players) — no clearing.
  lobbySystem(`Room ${room.code} started a new match.`);
  runBotTurns(room);
}


const rooms = new Map();
let roomSeq = 0;

function makeCode() {
  // Short, unambiguous, human-typeable code (no 0/O/1/I confusion).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s;
  do {
    s = '';
    for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(s));
  return s;
}

function newSeatId() {
  return Math.random().toString(36).slice(2, 10);
}

function createRoom({ mode, name, bots }) {
  const code = makeCode();
  const players = [];

  if (mode === 'solo') {
    // Chinchón needs at least 2 players, so a solo game must have >= 1 bot.
    // Clamp the requested count (the UI labels this 1-6).
    const nBots = Math.max(1, Math.min(6, bots | 0));
    players.push({ id: newSeatId(), name: name || 'You', seat: 0, isBot: false, connected: true, lastSeen: Date.now() });
    for (let i = 0; i < nBots; i++) {
      players.push({ id: newSeatId(), name: `Bot ${i + 1}`, seat: i + 1, isBot: true, connected: true, lastSeen: Date.now() });
    }
    const match = matchMod.createMatch(players.map((p) => p.name));
    const state = turn.startRound(players.length, Math.random);
    const room = { code, mode, players, match, state, started: true, startedAt: Date.now(), hostId: players[0].id, chat: [], pending: null };
    rooms.set(code, room);
    return room;
  }

  // multi: humans only, capacity 2-7, wait for Start.
  const host = { id: newSeatId(), name: name || 'Host', seat: 0, isBot: false, connected: true, lastSeen: Date.now() };
  players.push(host);
  const room = { code, mode, players, match: null, state: null, started: false, startedAt: null, hostId: host.id, chat: [], pending: null };
  rooms.set(code, room);
  return room;
}

// Advance the round state by auto-playing any bot seats. Returns when the
// next actor is a human, or the round phase is no longer 'draw'/'discard'.
function runBotTurns(room) {
  const { state, match, players } = room;
  let guard = 0;
  while (state && (state.phase === 'draw' || state.phase === 'discard') && guard < 500) {
    guard++;
    const seat = state.turn;
    const p = players[seat];
    if (!p || !p.isBot) return; // hand back to a human
    if (p.out) { state.turn = turn.nextDealer(state); continue; }

    // Bot draw.
    if (state.phase === 'draw') {
      const src = bot.chooseDraw(state);
      if (src === 'discard' && topOfDiscardOk(state)) turn.drawFromDiscard(state);
      else {
        const r = turn.drawFromStock(state);
        if (r.reshuffled) room.lastReshuffle = Date.now();
        if (!r.ok) return; // stock exhausted; round over
      }
    }
    // Bot discard / close.
    if (state.phase === 'discard') {
      const decision = bot.chooseTurn(state);
      const res = turn.discardCard(state, decision.card, decision.close);
      if (!res.ok) return;
    }
  }
  // If the round just closed, set up an interactive lay-off (Slice 2). Bots
  // auto-play their lay-off turns; humans act via /api/layoff/*.
  if (state && state.phase === 'closed') {
    beginLayoffForRoom(room);
  }
  // If a lay-off is in progress and it's a bot's turn, auto-play it.
  if (room.layoff && room.layoff.phase === 'layoff') {
    runBotLayoffTurns(room);
  }
}

function topOfDiscardOk(state) {
  const top = turn.topOfDiscard(state);
  return top && bot.improvesHand(state.hands[state.turn], top);
}

// ----------------------------------------------------------- reconnection
// No WebSocket: a client stamps lastSeen on every /api/state poll (~1.2s).
const AWAY_MS = 120000;        // no poll in 2 min => considered away (lenient: wifi blips / backgrounded tabs don't flip to amber)
const HOST_GRACE_MS = 60000;    // host away this long => promote next-oldest
const CONTINUE_WAIT_MS = 90000; // host must wait this long before "continue"

function stampSeen(room, seatId) {
  const p = room.players.find((x) => x.id === seatId);
  if (p) { p.lastSeen = Date.now(); p.connected = true; }
}
function isAway(p) {
  if (!p) return true;
  if (p.isBot) return false;
  return Date.now() - (p.lastSeen || 0) > AWAY_MS;
}
function humanSeats(room) {
  return room.players.filter((p) => !p.isBot);
}
// Next seat that is allowed to act (skips bots — runBotTurns handles those —
// and skips out/spectator humans).
function nextActiveSeat(room) {
  const n = room.players.length;
  let s = room.state.turn;
  for (let i = 0; i < n; i++) {
    s = (s + 1) % n;
    const p = room.players[s];
    if (p.isBot) return s; // bots resolved by runBotTurns
    if (p.out || p.spectator) continue;
    return s;
  }
  return room.state.turn;
}
function canContinue(room) {
  if (!room.waiting) return false;
  if (humanSeats(room).length <= 2) return false; // 2-player: always hold
  return Date.now() - room.waiting.since >= CONTINUE_WAIT_MS;
}
// Promote the next-oldest joined human to host after the grace window.
function promoteHost(room) {
  const cands = humanSeats(room).filter((p) => p.id !== room.hostId && !p.spectator);
  if (!cands.length) return;
  cands.sort((a, b) => a.seat - b.seat);
  room.hostId = cands[0].id;
  room.hostGraceSince = null;
  room.waiting = null;
}
// Called on every poll/action: update waiting state, host grace, rejoins.
function evaluateWaiting(room) {
  if (!room.started || !room.state) return;
  const phase = room.state.phase;
  if (phase !== 'draw' && phase !== 'discard') { room.waiting = null; }
  if (room.waiting) {
    const wp = room.players[room.waiting.seat];
    if (wp && !isAway(wp) && !wp.spectator) room.waiting = null; // they're back
  }
  const host = room.players.find((p) => p.id === room.hostId);
  if (host && !host.isBot && isAway(host) && !host.spectator) {
    if (!room.hostGraceSince) room.hostGraceSince = Date.now();
    else if (Date.now() - room.hostGraceSince > HOST_GRACE_MS) promoteHost(room);
  } else {
    room.hostGraceSince = null;
  }
  if (!room.waiting && (phase === 'draw' || phase === 'discard')) {
    const cur = room.players[room.state.turn];
    if (cur && !cur.isBot && isAway(cur) && !cur.spectator) {
      room.waiting = { seat: room.state.turn, since: Date.now() };
    }
  }
}

// Start an interactive lay-off from a closed round. Honors the closer's chosen
// meld decomposition (room.pendingCloseChoice) when a human picked one.
function beginLayoffForRoom(room) {
  const { state, players } = room;
  const active = players.map((_, i) => i).filter((i) => !players[i].out && !players[i].spectator);
  const chosen = room.pendingCloseChoice || null;
  room.pendingCloseChoice = null;
  const lo = layoffInteractive.beginLayoff(state.hands, state.closerIndex, active, chosen);
  if (!lo.valid) { state.phase = 'discard'; return; }
  room.layoff = lo;
  room.state.phase = 'layoff';
  runBotLayoffTurns(room);
}

// Auto-play any bot seats during the lay-off. A bot lays its best melds, sheds
// every attachable leftover, then declares ready. Stops when it's a human's turn
// or the lay-off is done.
function runBotLayoffTurns(room) {
  const { layoff: lo, players } = room;
  let guard = 0;
  while (lo && lo.phase === 'layoff' && guard < 200) {
    guard++;
    const seat = layoffInteractive.currentPlayer(lo);
    const p = players[seat];
    if (!p || !p.isBot) return; // hand back to a human
    if (p.out) { layoffInteractive.declareReady(lo); continue; }

    // Bot lays its melds, then attaches leftovers, then readies.
    const plan = bot.planLayoff(lo, seat);
    for (const meld of plan.melds) {
      layoffInteractive.layMeld(lo, meld);
    }
    // Greedily attach leftovers the engine says fit.
    let progressed = true;
    while (progressed) {
      progressed = false;
      const split = scoring.bestSplit(lo.remaining[seat]);
      for (const card of split.leftovers) {
        const idx = bot.findAttach(lo.table, card);
        if (idx !== -1) {
          const r = layoffInteractive.attachCard(lo, card, idx);
          if (r.ok) { progressed = true; break; }
        }
      }
    }
    layoffInteractive.declareReady(lo);
  }
  if (lo.phase === 'done') finishLayoff(room);
}

// Apply the finished lay-off scores to the match and deal the next round.
function finishLayoff(room) {
  const { layoff: lo, match, state } = room;
  // lo.scores is indexed by player seat (same shape as hands), so pass it
  // straight through. Nulls (shouldn't happen at 'done') become 0.
  const scores = lo.scores.map((s) => (s == null ? 0 : s));
  matchMod.applyRound(match, {
    valid: true,
    chinchon: lo.chinchon,
    winner: lo.chinchon ? lo.winner : null,
    scores,
  });
  room.layoff = null;
  state.phase = 'over';
  maybeRedeal(room);
}

// After a round resolves, deal the next one if the match isn't over.
function maybeRedeal(room) {
  const { match, players, state } = room;
  if (match.gameOver) { room.state.phase = 'over'; return; }
  const active = players.map((_, i) => i).filter((i) => !players[i].out && !players[i].spectator);
  room.state = turn.startRound(players.length, Math.random, state.dealer, active);
  runBotTurns(room);
}

// ----------------------------------------------------------- serialization

// Enumerate every legal close for an 8-card hand: for each candidate discard,
// the legal meld decompositions of the 7 kept cards. Deduped by (meld-set,
// discard-card) so identical choices collapse. Returns the SAME indexable list
// used by both serialize (for display) and the discard handler (for validation),
// so a splitIdx from the UI always resolves to the same decomposition.
function closeOptionsFor(hand) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < hand.length; i++) {
    const kept = [...hand.slice(0, i), ...hand.slice(i + 1)];
    const disc = hand[i];
    for (const sp of scoring.allCloseSplits(kept)) {
      const key = scoring.splitKey(sp.melds) + '#' + disc.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        splitIdx: out.length,
        cardId: disc.id,
        score: sp.score,
        kind: sp.kind,
        chinchon: sp.kind === 'chinchon',
        split: sp.melds,
      });
    }
  }
  return out;
}

function serialize(room, seatId) {
  const { state, match, players } = room;
  // Auto-start a pending rematch once its 90s window elapses (no hold).
  if (room.pending && !room.pending.hold && Date.now() >= room.pending.until) {
    startPendingMatch(room);
  }
  if (!state) {
    return { code: room.code, mode: room.mode, started: room.started, pending: room.pending ? pendingView(room) : null, lobby: players.map((p) => ({ name: p.name, isBot: p.isBot })), chat: room.chat || [] };
  }
  const viewer = players.find((p) => p.id === seatId);
  const viewerSeat = viewer ? viewer.seat : 0;
  const hand = state.hands[viewerSeat] || [];

  const opponents = players.map((p, i) => ({
    seat: i,
    name: p.name,
    isBot: p.isBot,
    out: match.players[i].out,
    spectator: !!p.spectator,
    away: isAway(p),
    total: match.players[i].total,
    handCount: state.hands[i] ? state.hands[i].length : 0,
    isYou: p.id === seatId,
  }));

  const split = scoring.bestSplit(hand);
  const opts = state.turn === viewerSeat && state.phase === 'discard'
    ? closeOptionsFor(hand)
    : [];

  // Lay-off view (Slice 2): only show each player their own remaining cards.
  let layoffView = null;
  let layoffYourTurn = false;
  if (room.layoff && room.layoff.phase === 'layoff') {
    const lo = room.layoff;
    const cur = layoffInteractive.currentPlayer(lo);
    layoffYourTurn = cur === viewerSeat;
    layoffView = {
      phase: 'layoff',
      table: lo.table,
      currentSeat: cur,
      isYourTurn: layoffYourTurn,
      yourRemaining: lo.remaining[viewerSeat] || [],
      order: lo.order,
      ready: lo.ready,
      scores: lo.scores,
      closerIndex: lo.closerIndex,
    };
  } else if (room.layoff && room.layoff.phase === 'done') {
    layoffView = {
      done: true,
      table: room.layoff.table,
      scores: room.layoff.scores,
      closerIndex: room.layoff.closerIndex,
    };
  }

  return {
    code: room.code,
    mode: room.mode,
    started: room.started,
    gameOver: match.gameOver,
    pending: room.pending ? pendingView(room) : null,
    chinchonWin: !!match.chinchonWinner,
    winner: match.winner !== null ? players[match.winner].name : null,
    hostId: room.hostId,
    isHost: !!viewer && viewer.id === room.hostId,
    spectator: !!viewer && !!viewer.spectator,
    waiting: room.waiting
      ? {
          seat: room.waiting.seat,
          name: players[room.waiting.seat].name,
          canContinue: canContinue(room),
          secondsLeft: Math.max(0, Math.ceil((CONTINUE_WAIT_MS - (Date.now() - room.waiting.since)) / 1000)),
        }
      : null,
    phase: state.phase,
    turnSeat: state.turn,
    isYourTurn: state.turn === viewerSeat && (state.phase === 'draw' || state.phase === 'discard') || layoffYourTurn,
    layoff: layoffView,
    stockCount: state.stock.length,
    lastReshuffle: room.lastReshuffle || 0,
    discardTop: turn.topOfDiscard(state),
    yourHand: hand,
    lastDrawnId: state.lastDrawn ? state.lastDrawn.id : null,
    yourMelds: split.melds,
    yourDeadwood: split.deadwood,
    closeOptions: opts,
    opponents,
    scoreboard: match.players.map((p, i) => ({
      name: p.name,
      total: p.total,
      out: p.out,
      eliminatedRank: match.eliminatedOrder.indexOf(i) + 1, // 1=first out, 0=still in/winner
      away: isAway(players[i]),
      spectator: !!players[i].spectator,
    })),
    chat: room.chat || [],
  };
}

// Public base URL for share links. Priority:
//   1. An explicit tunnel URL dropped into .tunnel-url (local dev via cloudflared).
//   2. The actual Host the request arrived on (correct for any deployed host
//      like Railway, which listens on a non-3000 port behind its own domain).
//   3. localhost fallback.
const TUNNEL_URL_FILE = path.join(__dirname, '.tunnel-url');
function publicBase(req) {
  try {
    const u = fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
    if (u) return u;
  } catch { /* no tunnel */ }
  if (req && req.headers && req.headers.host) {
    const proto = (req.socket && req.socket.encrypted) || (req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    return `${proto}://${req.headers.host}`;
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

// ----------------------------------------------------------------- request

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  // ---- global lobby ----------------------------------------------------
  if (method === 'POST' && p === '/api/lobby/enter') {
    return readBody(req).then((body) => {
      const entered = lobbyEnter(body.name);
      if (entered.error) return sendJson(res, 400, { error: entered.error });
      return sendJson(res, 200, { token: entered.token, name: entered.name });
    });
  }
  if (method === 'POST' && p === '/api/lobby/chat') {
    return readBody(req).then((body) => {
      const member = lobby.members.get(body.token);
      if (!member) return sendJson(res, 403, { error: 'not in lobby' });
      lobbyChatPush(member.name, body.text);
      return sendJson(res, 200, { ok: true });
    });
  }
  if (method === 'GET' && p === '/api/lobby/state') {
    return sendJson(res, 200, lobbyState());
  }

  if (method === 'GET' && p === '/api/state') {
    const code = url.searchParams.get('code');
    const seat = url.searchParams.get('seat');
    const room = rooms.get(code);
    if (!room) return sendJson(res, 404, { error: 'no such room' });
    if (seat) stampSeen(room, seat);
    evaluateWaiting(room);
    return sendJson(res, 200, serialize(room, seat));
  }

  if (method === 'GET' && p === '/api/room/players') {
    const code = url.searchParams.get('code');
    const room = rooms.get(code);
    if (!room) return sendJson(res, 404, { error: 'no such room' });
    return sendJson(res, 200, { code, started: room.started, players: room.players.map((pl) => ({ name: pl.name, isBot: pl.isBot })) });
  }

  if (method === 'POST' && p === '/api/room/new') {
    return readBody(req).then((body) => {
      const mode = body.mode === 'solo' ? 'solo' : 'multi';
      if (mode === 'multi') {
        const room = createRoom({ mode, name: body.name });
        return sendJson(res, 200, { code: room.code, seatId: room.players[0].id, shareUrl: `${publicBase(req)}/?code=${room.code}` });
      }
      const room = createRoom({ mode, name: body.name, bots: body.bots || 0 });
      runBotTurns(room);
      return sendJson(res, 200, { code: room.code, seatId: room.players[0].id, shareUrl: `${publicBase(req)}/?code=${room.code}` });
    });
  }

  if (method === 'POST' && p === '/api/room/join') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });

      // Rejoin: a returning player supplies their existing seatId to resume the
      // SAME seat (spectator if eliminated/match moved on, active if just back).
      if (body.seatId) {
        const existing = room.players.find((pl) => pl.id === body.seatId);
        if (existing && !existing.isBot) {
          stampSeen(room, body.seatId);
          evaluateWaiting(room);
          return sendJson(res, 200, { seatId: existing.id, rejoined: true });
        }
        return sendJson(res, 404, { error: 'no such seat to rejoin' });
      }

      if (room.started) return sendJson(res, 400, { error: 'game already started' });
      const humans = room.players.filter((pl) => !pl.isBot).length;
      if (humans >= 7) return sendJson(res, 400, { error: 'room full (7 humans)' });
      const seat = room.players.length;
      const id = newSeatId();
      room.players.push({ id, name: body.name || `Player ${seat + 1}`, seat, isBot: false, connected: true, lastSeen: Date.now() });
      return sendJson(res, 200, { seatId: id });
    });
  }

  if (method === 'POST' && p === '/api/room/start') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      if (room.started) return sendJson(res, 400, { error: 'already started' });
      if (body.seat !== room.hostId) return sendJson(res, 403, { error: 'only the host can start' });
      const humans = room.players.filter((pl) => !pl.isBot);
      if (humans.length < 2) return sendJson(res, 400, { error: 'need at least 2 players' });
      room.started = true;
      room.startedAt = Date.now();
      room.match = matchMod.createMatch(room.players.map((pl) => pl.name));
      room.state = turn.startRound(room.players.length, Math.random);
      runBotTurns(room);
      return sendJson(res, 200, { ok: true });
    });
  }

  // Host controls when a player is away: wait/extend, or continue without them
  // (the away player becomes a spectator for the rest of the match).
  if (method === 'POST' && p === '/api/room/wait') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      const viewer = room.players.find((pl) => pl.id === body.seat);
      if (!viewer || viewer.id !== room.hostId) return sendJson(res, 403, { error: 'only the host can wait' });
      if (room.waiting) room.waiting.since = Date.now(); // extend the window
      room.hostGraceSince = null;
      return sendJson(res, 200, { ok: true });
    });
  }

  if (method === 'POST' && p === '/api/room/continue') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      const viewer = room.players.find((pl) => pl.id === body.seat);
      if (!viewer || viewer.id !== room.hostId) return sendJson(res, 403, { error: 'only the host can continue' });
      if (!room.waiting) return sendJson(res, 400, { error: 'nobody is waiting' });
      if (humanSeats(room).length <= 2) return sendJson(res, 400, { error: 'cannot continue a 2-player game' });
      if (!canContinue(room)) {
        const left = Math.ceil((CONTINUE_WAIT_MS - (Date.now() - room.waiting.since)) / 1000);
        return sendJson(res, 400, { error: `wait ${left}s before continuing`, secondsLeft: left });
      }
      const wp = room.players[room.waiting.seat];
      wp.spectator = true;
      room.waiting = null;
      room.state.turn = nextActiveSeat(room);
      runBotTurns(room);
      return sendJson(res, 200, { ok: true });
    });
  }

  // Play again: same room, same players, fresh match from scratch.
  if (method === 'POST' && p === '/api/room/rematch') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      const viewer = room.players.find((pl) => pl.id === body.seat);
      if (!viewer || viewer.isBot) return sendJson(res, 403, { error: 'only a player can rematch' });
      if (room.players.length < 2) return sendJson(res, 400, { error: 'need 2+ players to rematch' });
      if (!room.match || !room.match.gameOver) return sendJson(res, 400, { error: 'match is not over' });
      // Enter a 90s pending window (others in the lobby may join the rematch).
      room.pending = { until: Date.now() + REMATCH_COUNTDOWN_MS, hold: false, hostName: viewer.name, startedBy: viewer.id };
      lobbySystem(`A new game in room ${room.code} starts in ${Math.round(REMATCH_COUNTDOWN_MS / 1000)}s — join the rematch!`);
      return sendJson(res, 200, { ok: true, pending: room.pending });
    });
  }

  // Lobby watchers (or anyone not yet in the room) join a rematch during its
  // pending window. Same rules as a normal join: humans only, cap 7.
  if (method === 'POST' && p === '/api/room/join-rematch') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      if (!room.pending) return sendJson(res, 403, { error: 'no rematch pending' });
      if (room.players.filter((pl) => !pl.isBot).length >= 7) return sendJson(res, 400, { error: 'room full (7 humans)' });
      const seat = room.players.length;
      const id = newSeatId();
      room.players.push({ id, name: body.name || `Player ${seat + 1}`, seat, isBot: false, connected: true, lastSeen: Date.now() });
      lobbySystem(`${body.name || 'A player'} joined the rematch in room ${room.code}.`);
      return sendJson(res, 200, { seatId: id, code: room.code });
    });
  }

  // Host toggles the rematch hold. Hold pauses the 90s countdown indefinitely;
  // tapping again resumes it (resets the 90s window from now). There is NO
  // immediate-start button — the match auto-starts when the countdown hits 0.
  if (method === 'POST' && p === '/api/room/rematch/hold') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room || !room.pending) return sendJson(res, 404, { error: 'no rematch pending' });
      if (body.seat !== room.pending.startedBy) return sendJson(res, 403, { error: 'only the rematch starter can hold' });
      if (room.pending.hold) {
        // Resume: restart the 90s window.
        room.pending.hold = false;
        room.pending.until = Date.now() + REMATCH_COUNTDOWN_MS;
        lobbySystem(`Rematch in room ${room.code} resumes — starts in ${Math.round(REMATCH_COUNTDOWN_MS / 1000)}s.`);
      } else {
        room.pending.hold = true;
        lobbySystem(`Rematch in room ${room.code} held by host — waiting to start.`);
      }
      return sendJson(res, 200, { ok: true, pending: room.pending });
    });
  }

  // A player leaves the room (used from the game-over screen). The room, its
  // code, and the chat history stay alive for everyone else. No new room is
  // created. If the host leaves, the next player is promoted to host.
  if (method === 'POST' && p === '/api/room/leave') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      const idx = room.players.findIndex((pl) => pl.id === body.seat);
      if (idx < 0) return sendJson(res, 404, { error: 'not in this room' });
      const leaving = room.players[idx];
      room.players.splice(idx, 1);
      // Rebuild match players preserving final totals where possible. If the
      // room was never started, there is no match yet — just drop the player.
      if (room.match) {
        const totalsByName = Object.fromEntries(room.match.players.map((m) => [m.name, m]));
        room.match.players = room.players.map((p) => totalsByName[p.name] || { name: p.name, total: 0, out: false });
        room.match.eliminatedOrder = [];
        room.match.winner = null;
        room.match.chinchonWinner = false;
        room.match.gameOver = room.players.length < 2; // can't continue a 1-player room
      }
      if (room.hostId === leaving.id) room.hostId = room.players[0] ? room.players[0].id : null;
      return sendJson(res, 200, { ok: true, remaining: room.players.length });
    });
  }

  // Per-room chat: short gameplay notes only, capped at the last 10 messages.
  // Available while the room is up; cleared on rematch (fresh match).
  if (method === 'POST' && p === '/api/room/chat') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room) return sendJson(res, 404, { error: 'no such room' });
      const viewer = room.players.find((pl) => pl.id === body.seat);
      if (!viewer || viewer.isBot) return sendJson(res, 403, { error: 'only players can chat' });
      const text = String(body.text || '').trim().slice(0, 160);
      if (!text) return sendJson(res, 400, { error: 'empty message' });
      room.chat.push({ name: viewer.name, text, at: Date.now() });
      if (room.chat.length > 10) room.chat = room.chat.slice(-10);
      return sendJson(res, 200, { ok: true });
    });
  }

  if (method === 'POST' && p === '/api/draw') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room || !room.state) return sendJson(res, 404, { error: 'no such room/state' });
      const viewer = room.players.find((pl) => pl.id === body.seat);
      if (!viewer || room.state.turn !== viewer.seat) return sendJson(res, 400, { error: 'not your turn' });
      if (room.state.phase !== 'draw') return sendJson(res, 400, { error: 'not the draw phase' });
      const r = body.from === 'discard' ? turn.drawFromDiscard(room.state) : turn.drawFromStock(room.state);
      if (r.reshuffled) room.lastReshuffle = Date.now();
      if (!r.ok) return sendJson(res, 400, { error: r.reason });
      runBotTurns(room);
      return sendJson(res, 200, serialize(room, body.seat));
    });
  }

  if (method === 'POST' && p === '/api/discard') {
    return readBody(req).then((body) => {
      const room = rooms.get(body.code);
      if (!room || !room.state) return sendJson(res, 404, { error: 'no such room/state' });
      const viewer = room.players.find((pl) => pl.id === body.seat);
      if (!viewer || room.state.turn !== viewer.seat) return sendJson(res, 400, { error: 'not your turn' });
      if (room.state.phase !== 'discard') return sendJson(res, 400, { error: 'not the discard phase' });
      const hand = room.state.hands[viewer.seat];
      const card = hand.find((c) => c.id === body.cardId);
      if (!card) return sendJson(res, 400, { error: 'you do not hold that card' });
      // If the human is closing AND picked a specific meld decomposition, stash
      // it so the lay-off resolver reveals exactly those melds. Use the same
      // enumeration as the UI so splitIdx resolves to the same decomposition.
      if (body.close && body.splitIdx != null) {
        const chosen = closeOptionsFor(hand)[body.splitIdx];
        if (chosen) room.pendingCloseChoice = chosen.split;
      }
      const res2 = turn.discardCard(room.state, card, !!body.close);
      if (!res2.ok) return sendJson(res, 400, { error: res2.reason });
      runBotTurns(room);
      return sendJson(res, 200, serialize(room, body.seat));
    });
  }

  // ---- Slice 2: interactive lay-off -------------------------------------
  // All lay-off actions share: room must exist, a lay-off must be in progress,
  // and it must be the requesting human's turn. After a human acts, bots auto-
  // play their turns, and the round resolves when the lay-off is 'done'.

  function layoffGuard(body) {
    const room = rooms.get(body.code);
    if (!room) { sendJson(res, 404, { error: 'no such room' }); return { error: true }; }
    if (!room.layoff || room.layoff.phase !== 'layoff') {
      sendJson(res, 400, { error: 'no lay-off in progress' });
      return { error: true };
    }
    const viewer = room.players.find((pl) => pl.id === body.seat);
    if (!viewer) { sendJson(res, 404, { error: 'no such seat' }); return { error: true }; }
    const cur = layoffInteractive.currentPlayer(room.layoff);
    if (cur !== viewer.seat) {
      sendJson(res, 400, { error: 'not your turn in the lay-off' });
      return { error: true };
    }
    return { room, viewer };
  }

  function afterLayoffAction(room, seat) {
    runBotLayoffTurns(room);
    if (room.layoff && room.layoff.phase === 'done') finishLayoff(room);
    return sendJson(res, 200, serialize(room, seat));
  }

  if (method === 'POST' && p === '/api/layoff/lay') {
    return readBody(req).then((body) => {
      const g = layoffGuard(body);
      if (g.error) return g.error;
      const cards = (body.cardIds || []).map((id) =>
        g.room.layoff.remaining[g.viewer.seat].find((c) => c.id === id)).filter(Boolean);
      const r = layoffInteractive.layMeld(g.room.layoff, cards);
      if (!r.ok) return sendJson(res, 400, { error: r.reason });
      return afterLayoffAction(g.room, body.seat);
    });
  }

  if (method === 'POST' && p === '/api/layoff/attach') {
    return readBody(req).then((body) => {
      const g = layoffGuard(body);
      if (g.error) return g.error;
      const card = g.room.layoff.remaining[g.viewer.seat].find((c) => c.id === body.cardId);
      if (!card) return sendJson(res, 400, { error: 'you do not hold that card' });
      const r = layoffInteractive.attachCard(g.room.layoff, card, body.meldIndex);
      if (!r.ok) return sendJson(res, 400, { error: r.reason });
      return afterLayoffAction(g.room, body.seat);
    });
  }

  if (method === 'POST' && p === '/api/layoff/ready') {
    return readBody(req).then((body) => {
      const g = layoffGuard(body);
      if (g.error) return g.error;
      const r = layoffInteractive.declareReady(room.layoff);
      if (!r.ok) return sendJson(res, 400, { error: r.reason });
      return afterLayoffAction(g.room, body.seat);
    });
  }

  // Auto: shed everything the engine can, then declare ready. Convenience for
  // players who don't want to place each meld/attach by hand.
  if (method === 'POST' && p === '/api/layoff/auto') {
    return readBody(req).then((body) => {
      const g = layoffGuard(body);
      if (g.error) return g.error;
      const lo = g.room.layoff;
      const seat = g.viewer.seat;
      const plan = bot.planLayoff(lo, seat);
      for (const meld of plan.melds) layoffInteractive.layMeld(lo, meld);
      let progressed = true;
      while (progressed) {
        progressed = false;
        const split = scoring.bestSplit(lo.remaining[seat]);
        for (const card of split.leftovers) {
          const idx = bot.findAttach(lo.table, card);
          if (idx !== -1) {
            const r = layoffInteractive.attachCard(lo, card, idx);
            if (r.ok) { progressed = true; break; }
          }
        }
      }
      layoffInteractive.declareReady(lo);
      return afterLayoffAction(g.room, body.seat);
    });
  }

  if (method === 'GET' && p === '/api/layoff/suggest') {
    const code = url.searchParams.get('code');
    const seat = url.searchParams.get('seat');
    const room = rooms.get(code);
    if (!room || !room.layoff) return sendJson(res, 404, { error: 'no lay-off' });
    const viewer = room.players.find((pl) => pl.id === seat);
    if (!viewer) return sendJson(res, 404, { error: 'no such seat' });
    return sendJson(res, 200, layoffInteractive.suggest(room.layoff, viewer.seat));
  }

  return sendJson(res, 404, { error: 'unknown api route' });
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      return handleApi(req, res, url);
    }
    // Serve static files from public/.
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      // Cache-bust: derive a version from asset mtimes so every edit to
      // app.js/style.css forces browsers to refetch (no manual hard-refresh).
      const ver = (() => {
        try {
          const a = fs.statSync(path.join(PUBLIC_DIR, 'app.js')).mtimeMs;
          const s = fs.statSync(path.join(PUBLIC_DIR, 'style.css')).mtimeMs;
          return Math.round(a + s).toString(36);
        } catch { return '1'; }
      })();
      if (path.extname(filePath) === '.html') {
        let html = data.toString();
        html = html.replace('/app.js"', `/app.js?v=${ver}"`);
        html = html.replace('/style.css"', `/style.css?v=${ver}"`);
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
        return res.end(html);
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  createServer().listen(PORT, () => {
    console.log(`Chinchon server on http://localhost:${PORT}`);
  });
}

module.exports = { createServer, rooms, _internals: { createRoom, runBotTurns, serialize } };

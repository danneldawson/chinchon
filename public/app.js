'use strict';

// Chinchon browser client. Talks to the server via fetch and renders state.
// State lives server-side; we only ever send our seat's actions.

const SUIT_ICON = { Oros: '●', Copas: '♥', Espadas: '♠', Bastos: '♣' };

// ----------------------------------------------------------- i18n
const I18N = {
  en: {
    title: 'CHINCHÓN',
    sub: "Play your family's house rules online.",
    tabMulti: 'Play with friends',
    tabSolo: 'Solo vs bots',
    subCreate: 'Create a room',
    subJoin: 'Have a code? Join',
    backToCreate: '← Back to create',
    yourName: 'Your name',
    createRoom: 'Create room',
    roomCode: 'Room code:',
    shareLink: 'Share link:',
    copy: 'Copy',
    playersJoined: 'Players joined:',
    startGame: 'Start game',
    roomCodeLabel: 'Room code',
    joinRoom: 'Join room',
    host: 'Host',
    player: 'Player',
    gameOver: 'wins!',
    yourTurn: 'Your turn',
    waiting: 'Waiting for others…',
    drawStock: 'Draw from stock',
    drawDiscard: 'Draw from discard',
    deadwood: 'deadwood',
    keepPlaying: 'Keep playing (don’t close)',
    chinchon: 'CHINCHÓN — win!',
    close: 'Close',
    discard: 'discard',
    out: 'OUT',
    soloName: 'Your name',
    soloBots: 'Number of bots (1–6)',
    startSolo: 'Start solo game',
    layoffTitle: 'Lay-off — reveal your combinations',
    table: 'Table',
    yourCards: 'Your remaining cards',
    laySelected: 'Lay selected',
    auto: 'Auto (lay all + shed)',
    ready: 'Ready — count me',
    waitingLayoff: 'Waiting for others to lay off…',
    suggest: 'Suggest',
    goTitle: 'Match over',
    goWinner: 'Winner',
    eliminated: 'Eliminated',
    rematch: 'Play again (same players)',
    toLobby: 'Back to lobby',
  },
  es: {
    title: 'CHINCHÓN',
    sub: 'Juega las reglas de tu familia en línea.',
    tabMulti: 'Jugar con amigos',
    tabSolo: 'Solo vs bots',
    subCreate: 'Crear una sala',
    subJoin: '¿Tienes un código? Únete',
    backToCreate: '← Volver a crear',
    yourName: 'Tu nombre',
    createRoom: 'Crear sala',
    roomCode: 'Código de sala:',
    shareLink: 'Enlace para compartir:',
    copy: 'Copiar',
    playersJoined: 'Jugadores unidos:',
    startGame: 'Empezar partida',
    roomCodeLabel: 'Código de sala',
    joinRoom: 'Unirse a sala',
    host: 'Anfitrión',
    player: 'Jugador',
    gameOver: '¡gana!',
    yourTurn: 'Tu turno',
    waiting: 'Esperando a los demás…',
    drawStock: 'Robar del mazo',
    drawDiscard: 'Robar del descarte',
    deadwood: 'muerto',
    keepPlaying: 'Seguir jugando (no cerrar)',
    chinchon: 'CHINCHÓN — ¡ganas!',
    close: 'Cerrar',
    discard: 'descartar',
    out: 'FUERA',
    soloName: 'Tu nombre',
    soloBots: 'Número de bots (1–6)',
    startSolo: 'Empezar partida solo',
    layoffTitle: 'Descarte — muestra tus combinaciones',
    table: 'Mesa',
    yourCards: 'Tus cartas restantes',
    laySelected: 'Poner seleccionadas',
    auto: 'Auto (poner todo + soltar)',
    ready: 'Listo — contadme',
    waitingLayoff: 'Esperando a los demás…',
    suggest: 'Sugerir',
    goTitle: 'Partida terminada',
    goWinner: 'Ganador',
    eliminated: 'Eliminados',
    rematch: 'Jugar otra (mismos jugadores)',
    toLobby: 'Volver al lobby',
  },
};

let lang = 'en';
const t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.en[key];

const state = {
  code: null,
  seatId: null,
  view: null,    // last serialized state
  pollTimer: null,
  chosenSplit: null, // index into view.closeOptions when the player picks a meld set
  selected: new Set(), // card ids selected in the lay-off hand
};

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------- lobby wiring

function show(panel) {
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  panel.classList.remove('hidden');
}

function setTab(mode) {
  const multi = mode === 'multi';
  $('tab-multi').classList.toggle('active', multi);
  $('tab-solo').classList.toggle('active', !multi);
  $('multi-pane').classList.toggle('hidden', !multi);
  $('solo-pane').classList.toggle('hidden', multi);
  if (multi) showSub('create');
}

function showSub(which) {
  const create = which === 'create';
  $('sub-create').classList.toggle('active', create);
  $('sub-join').classList.toggle('active', !create);
  $('create-pane').classList.toggle('hidden', !create);
  $('join-pane').classList.toggle('hidden', create);
}

function applyLang() {
  document.documentElement.lang = lang;
  $('title').textContent = t('title');
  document.title = t('title');
  $('subtitle').textContent = t('sub');
  $('tab-multi').textContent = t('tabMulti');
  $('tab-solo').textContent = t('tabSolo');
  $('sub-create').textContent = t('subCreate');
  $('sub-join').textContent = t('subJoin');
  $('back-to-create').textContent = t('backToCreate');
  $('host-name').placeholder = t('yourName');
  $('btn-create').textContent = t('createRoom');
  $('join-code').placeholder = 'ABCD';
  $('join-name').placeholder = t('yourName');
  $('btn-join').textContent = t('joinRoom');
  $('btn-start').textContent = t('startGame');
  $('solo-name').placeholder = t('soloName');
  $('solo-bots-label').childNodes[0].textContent = t('soloBots') + ' ';
  $('btn-solo').textContent = t('startSolo');
  $('btn-rematch').textContent = t('rematch');
  $('btn-tolobby').textContent = t('toLobby');
  // Re-render game if we're already in it (so labels update live).
  if (state.view) render();
}

$('tab-multi').onclick = () => { setTab('multi'); };
$('tab-solo').onclick = () => { setTab('solo'); };
$('sub-create').onclick = () => showSub('create');
$('sub-join').onclick = () => showSub('join');
$('back-to-create').onclick = () => showSub('create');

// Language selector
document.querySelectorAll('.lang-btn').forEach((b) => {
  b.onclick = () => {
    lang = b.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach((x) => x.classList.toggle('active', x === b));
    applyLang();
  };
});

// If opened with ?code=ABCD, jump straight to join form.
(function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    setTab('multi');
    showSub('join');
    $('join-code').value = code.toUpperCase();
  }
})();

$('btn-create').onclick = async () => {
  const name = $('host-name').value.trim() || t('host');
  const res = await fetch('/api/room/new', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'multi', name }),
  }).then((r) => r.json());
  state.code = res.code;
  state.seatId = res.seatId;
  $('room-code').textContent = res.code;
  const link = location.origin + res.shareUrl;
  $('share-link').textContent = link;
  $('share-link').href = link;
  $('room-info').classList.remove('hidden');
  $('btn-create').classList.add('hidden');
  refreshLobby();
  state.pollTimer = setInterval(refreshLobby, 1500);
};

$('btn-copy').onclick = () => {
  const link = location.origin + '/?code=' + state.code;
  copyText(link);
  $('btn-copy').textContent = t('copy') + '!';
  setTimeout(() => ($('btn-copy').textContent = t('copy')), 1200);
};

// Robust clipboard copy: navigator.clipboard only works in a secure context
// (https or localhost). Fall back to a hidden textarea + execCommand so the
// share link still copies when served over a plain-http tunnel.
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

$('btn-start').onclick = async () => {
  await fetch('/api/room/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  });
  clearInterval(state.pollTimer);
  enterGame();
};

$('btn-join').onclick = async () => {
  const code = $('join-code').value.trim().toUpperCase();
  const name = $('join-name').value.trim() || t('player');
  const res = await fetch('/api/room/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
  }).then((r) => r.json());
  if (res.error) { $('join-msg').textContent = res.error; return; }
  state.code = code;
  state.seatId = res.seatId;
  enterGame();
};

$('btn-solo').onclick = async () => {
  const name = $('solo-name').value.trim() || t('player');
  const bots = Math.max(0, Math.min(6, parseInt($('solo-bots').value, 10) || 0));
  const res = await fetch('/api/room/new', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'solo', name, bots }),
  }).then((r) => r.json());
  state.code = res.code;
  state.seatId = res.seatId;
  enterGame();
};

async function refreshLobby() {
  const res = await fetch(`/api/room/players?code=${state.code}`).then((r) => r.json());
  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (const p of res.players) {
    const li = document.createElement('li');
    li.textContent = (p.isBot ? '🤖 ' : '') + p.name;
    ul.appendChild(li);
  }
}

// ----------------------------------------------------------- game wiring

async function enterGame() {
  show($('game'));
  state.pollTimer = setInterval(poll, 1200);
  await poll();
}

async function poll() {
  const res = await fetch(`/api/state?code=${state.code}&seat=${state.seatId}`).then((r) => r.json());
  state.view = res;
  render();
}

function cardLabel(c) {
  return `${c.rank}${SUIT_ICON[c.suit] || '?'}`;
}

// Original Spanish-deck suit emblems (Fournier-STYLE, not the copyrighted art):
//   Oros    = a gold coin
//   Copas   = a goblet / cup
//   Espadas = a sword
//   Bastos  = a club / baton
// Drawn as inline SVG so they scale crisply and carry their own colour.
function suitEmblem(suit) {
  switch (suit) {
    case 'Oros':
      return '<svg viewBox="0 0 24 24" class="emblem"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="1.5"/></svg>';
    case 'Copas':
      return '<svg viewBox="0 0 24 24" class="emblem"><path d="M6 4 h12 v5 a6 6 0 0 1 -12 0 z" fill="currentColor"/><line x1="12" y1="15" x2="12" y2="20" stroke="currentColor" stroke-width="2"/><line x1="8" y1="20" x2="16" y2="20" stroke="currentColor" stroke-width="2"/></svg>';
    case 'Espadas':
      return '<svg viewBox="0 0 24 24" class="emblem"><path d="M12 3 L14 14 L12 17 L10 14 z" fill="currentColor"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2"/><line x1="9" y1="20" x2="15" y2="20" stroke="currentColor" stroke-width="2"/></svg>';
    default: // Bastos
      return '<svg viewBox="0 0 24 24" class="emblem"><rect x="10.5" y="3" width="3" height="18" rx="1.5" fill="currentColor"/><path d="M12 6 q6 -2 8 2 q-5 1 -8 -2 z" fill="currentColor"/><path d="M12 9 q-6 -2 -8 2 q5 1 8 -2 z" fill="currentColor"/></svg>';
  }
}

// Full card as a styled element with a BIG number and the suit emblem.
function renderCardEl(c, { clickable, onClick } = {}) {
  const el = document.createElement('div');
  el.className = `card ${c.suit.toLowerCase()}`;
  if (window.__isWild(c)) el.classList.add('has-wild');
  el.innerHTML =
    `<span class="rank">${c.rank}</span>` +
    `<span class="emblem-wrap">${suitEmblem(c.suit)}</span>` +
    (window.__isWild(c) ? '<span class="wild" title="wild (1 de Oros)">★</span>' : '');
  if (clickable) el.onclick = onClick; else el.classList.add('disabled');
  return el;
}

// Describe a meld set for the close-choice UI, in the player's language.
function meldsText(split) {
  const parts = split.map((m) =>
    '[ ' + m.map((c) => cardLabel(c)).join(' ') + ' ]'
  );
  return parts.join('  ');
}

function render() {
  const v = state.view;
  if (!v || !v.started) return;

  // Scoreboard
  $('scoreboard').innerHTML = v.scoreboard
    .map((p) => `<div class="row ${p.out ? 'out' : ''}">${p.name}: ${p.total}${p.out ? ' · ' + t('out') : ''}</div>`)
    .join('');

  // Turn banner
  if (v.gameOver) {
    $('turn-banner').textContent = `🏆 ${v.winner} ${t('gameOver')}`;
  } else {
    $('turn-banner').textContent = v.isYourTurn ? t('yourTurn') : t('waiting');
  }

  // Game-over panel (Slice 3)
  const go = $('gameover');
  if (v.gameOver) {
    go.classList.remove('hidden');
    $('go-title').textContent = t('goTitle');
    $('go-winner').textContent = `${t('goWinner')}: ${v.winner}`;
    const outNames = (v.scoreboard || []).filter((p) => p.out).map((p) => p.name);
    $('go-eliminated').textContent = outNames.length
      ? `${t('eliminated')}: ${outNames.join(', ')}`
      : '';
  } else {
    go.classList.add('hidden');
  }

  // Opponents (face-down counts only)
  const oppWrap = $('opponents');
  oppWrap.innerHTML = '';
  for (const o of v.opponents) {
    if (o.isYou) continue;
    const el = document.createElement('div');
    el.className = 'opp' + (v.turnSeat === o.seat ? ' active' : '');
    el.innerHTML = `<div class="name">${o.name}</div><div class="count">${o.handCount} cards${o.out ? ' · ' + t('out') : ''}</div>`;
    oppWrap.appendChild(el);
  }

  // Center piles
  $('stock-count').textContent = v.stockCount;
  $('discard-top').textContent = v.discardTop ? cardLabel(v.discardTop) : '—';
  $('discard-top').className = v.discardTop ? `card-mini ${v.discardTop.suit.toLowerCase()}` : '';

  // Your hand
  const handWrap = $('hand');
  handWrap.innerHTML = '';
  const canAct = v.isYourTurn;
  const phase = v.phase;
  for (const c of v.yourHand) {
    const clickable = canAct && phase === 'discard'; // discard phase: click a card to throw
    handWrap.appendChild(renderCardEl(c, {
      clickable,
      onClick: () => doDiscard(c, false),
    }));
  }

  // Melds + deadwood
  $('deadwood').textContent = `${t('deadwood')} ${v.yourDeadwood}`;
  const melds = $('melds');
  melds.innerHTML = '';
  if (v.yourMelds && v.yourMelds.length) {
    for (const m of v.yourMelds) {
      const d = document.createElement('div');
      d.className = 'meld';
      d.textContent = '[ ' + m.map(cardLabel).join(' ') + ' ]';
      melds.appendChild(d);
    }
  }

  // Controls
  $('btn-draw-stock').textContent = t('drawStock');
  $('btn-draw-discard').textContent = t('drawDiscard');
  $('btn-draw-stock').classList.toggle('hidden', !(canAct && phase === 'draw'));
  $('btn-draw-discard').classList.toggle('hidden', !(canAct && phase === 'draw'));

  const co = $('close-options');
  co.innerHTML = '';
  if (canAct && phase === 'discard' && v.closeOptions && v.closeOptions.length) {
    // Prompt: choose how to close (each option is a distinct meld decomposition).
    const prompt = document.createElement('div');
    prompt.className = 'close-prompt';
    prompt.textContent = lang === 'es' ? '¿Cómo quieres cerrar?' : 'How do you want to close?';
    co.appendChild(prompt);

    v.closeOptions.forEach((o, idx) => {
      const b = document.createElement('button');
      b.className = 'close-btn';
      const disc = cardLabel(findCard(o.cardId));
      if (o.chinchon) {
        b.textContent = `${t('chinchon')} (${t('discard')} ${disc})`;
      } else {
        const sign = o.score < 0 ? '' : '+';
        b.textContent = `${t('close')} ${sign}${o.score} · ${t('discard')} ${disc} · ${meldsText(o.split)}`;
      }
      b.onclick = () => doDiscard(findCard(o.cardId), true, idx);
      co.appendChild(b);
    });

    // Explicit "keep playing" alternative: discard the highest-value card
    // WITHOUT declaring a close, so the player keeps the same hand shape and
    // can chase a better/wild draw next turn.
    const keep = document.createElement('button');
    keep.className = 'keep-btn';
    keep.textContent = t('keepPlaying');
    keep.onclick = () => {
      const hand = state.view.yourHand;
      // Prefer discarding the card with the highest deadwood value that is NOT
      // part of the first close option's kept melds (keeps melds intact).
      const keepIds = new Set(v.closeOptions[0].split.flat().map((c) => c.id));
      const candidates = hand.filter((c) => !keepIds.has(c.id));
      const pool = candidates.length ? candidates : hand;
      const worst = pool.reduce((a, b) => (window.__cardVal(b) > window.__cardVal(a) ? b : a), pool[0]);
      doDiscard(worst, false);
    };
    co.appendChild(keep);
  }

  // ---- Slice 2: interactive lay-off board ----
  const inLayoff = !!(v.layoff && (v.layoff.phase === 'layoff' || v.layoff.done));
  $('layoff-area').classList.toggle('hidden', !inLayoff);
  // During lay-off, hide the normal hand/discard controls.
  $('your-area').classList.toggle('hidden', inLayoff);
  $('controls').classList.toggle('hidden', inLayoff);
  if (inLayoff) renderLayoff(v.layoff);
}

// Render the lay-off board. `lo` is the serialized layoff view from the server.
function renderLayoff(lo) {
  $('layoff-title').textContent = lo.done ? t('gameOver') : t('layoffTitle');
  $('layoff-cards-label').textContent = t('yourCards');

  // Table melds.
  const tableWrap = $('layoff-table');
  tableWrap.innerHTML = '';
  const tableLabel = document.createElement('div');
  tableLabel.className = 'dim';
  tableLabel.textContent = t('table');
  tableWrap.appendChild(tableLabel);
  (lo.table || []).forEach((meld, i) => {
    const d = document.createElement('div');
    d.className = 'meld on-table';
    d.textContent = `[${i + 1}] ` + meld.map(cardLabel).join(' ');
    d.dataset.meldIndex = i;
    tableWrap.appendChild(d);
  });

  // Your remaining cards (only shown while it's your turn; otherwise hide).
  const handWrap = $('layoff-hand');
  handWrap.innerHTML = '';
  const myTurn = lo.isYourTurn && !lo.done;
  if (lo.yourRemaining) {
    for (const c of lo.yourRemaining) {
      const el = renderCardEl(c, {
        clickable: myTurn,
        onClick: () => toggleSelect(c.id),
      });
      if (state.selected.has(c.id)) el.classList.add('selected');
      handWrap.appendChild(el);
    }
  }

  // Controls.
  const layBtn = $('btn-layoff-lay');
  const autoBtn = $('btn-layoff-auto');
  const readyBtn = $('btn-layoff-ready');
  const sugBtn = $('btn-layoff-suggest');
  layBtn.textContent = t('laySelected');
  autoBtn.textContent = t('auto');
  readyBtn.textContent = t('ready');
  sugBtn.textContent = t('suggest');
  layBtn.classList.toggle('hidden', !myTurn);
  autoBtn.classList.toggle('hidden', !myTurn);
  readyBtn.classList.toggle('hidden', !myTurn);
  sugBtn.classList.toggle('hidden', !myTurn);

  if (lo.done) {
    $('layoff-status').textContent = lo.scores
      ? 'Scores: ' + lo.scores.map((s) => (s == null ? '—' : (s < 0 ? s : '+' + s))).join('  ')
      : '';
  } else if (!myTurn) {
    $('layoff-status').textContent = t('waitingLayoff');
  } else {
    $('layoff-status').textContent = state.selected.size
      ? `${state.selected.size} selected`
      : '';
  }
}

function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  // Re-render just the lay-off hand to reflect selection.
  if (state.view && state.view.layoff) renderLayoff(state.view.layoff);
}

async function doLayoffAction(kind, payload) {
  const body = { code: state.code, seat: state.seatId, ...payload };
  const res = await fetch(`/api/layoff/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  if (res.error) $('layoff-status').textContent = res.error;
  state.selected.clear();
  await poll();
}

function findCard(id) {
  return state.view.yourHand.find((c) => c.id === id) || { id, rank: '?', suit: 'Oros' };
}

// ----------------------------------------------------------- actions

async function doDraw(from) {
  const res = await fetch('/api/draw', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId, from }),
  }).then((r) => r.json());
  if (res.error) $('status').textContent = res.error;
  await poll();
}

// discardCard close: which close decomposition to use (idx into closeOptions).
async function doDiscard(card, close = false, splitIdx = null) {
  const body = { code: state.code, seat: state.seatId, cardId: card.id, close };
  if (close && splitIdx != null) body.splitIdx = splitIdx;
  const res = await fetch('/api/discard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  if (res.error) $('status').textContent = res.error;
  await poll();
}

$('btn-draw-stock').onclick = () => doDraw('stock');
$('btn-draw-discard').onclick = () => doDraw('discard');

// ---- Lay-off controls (Slice 2) ----
// Lay selected (l): send the currently-selected cards as one meld.
$('btn-layoff-lay').onclick = () => {
  if (state.selected.size >= 3) doLayoffAction('lay', { cardIds: [...state.selected] });
  else $('layoff-status').textContent = 'Select ≥3 cards to lay';
};
$('btn-layoff-auto').onclick = () => doLayoffAction('auto', {});
$('btn-layoff-ready').onclick = () => doLayoffAction('ready', {});
$('btn-layoff-suggest').onclick = async () => {
  const res = await fetch(`/api/layoff/suggest?code=${state.code}&seat=${state.seatId}`).then((r) => r.json());
  if (res.melds) {
    const parts = (res.melds || []).map((m) => m.map(cardLabel).join(' '));
    const att = (res.attachable || []).map((a) => cardLabel(a.card) + '→' + (a.meldIndex + 1));
    $('layoff-status').textContent = `Lay: [${parts.join('] [')}]` + (att.length ? `  Shed: ${att.join(', ')}` : '');
  }
};

// ---- Game over (Slice 3) ----
$('btn-rematch').onclick = async () => {
  await fetch('/api/room/rematch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  });
  state.selected.clear();
  await poll();
};
$('btn-tolobby').onclick = () => {
  clearInterval(state.pollTimer);
  state.code = null;
  state.seatId = null;
  state.view = null;
  state.selected.clear();
  show($('lobby'));
};

// Inject isWild / cardValue from the server's cards module via a tiny endpoint
// is overkill; we replicate the simple rules: wild = rank 1 suit Oros; value
// 1-7 face, 10/11/12 worth 10.
window.__isWild = (c) => c.suit === 'Oros' && c.rank === 1;
window.__cardVal = (c) => (c.rank <= 7 ? c.rank : 10);

show($('lobby'));
setTab('multi');
applyLang();

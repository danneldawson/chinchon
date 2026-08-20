'use strict';

// Chinchon browser client. Talks to the server via fetch and renders state.
// State lives server-side; we only ever send our seat's actions.

const SUIT_ICON = { Oros: '●', Copas: '♥', Espadas: '♠', Bastos: '♣' };

// ----------------------------------------------------------- i18n
const I18N = {
  en: {
    title: 'CHINCHON',
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
    stock: 'Stock',
    discard: 'Discard',
    yourHand: 'Your hand',
    roomChat: 'Room chat',
    quickNote: 'Quick note to the table…',
    reshuffle: 'Stock reshuffled',
    keepPlaying: 'Keep playing (don’t close)',
    closeOffer: 'You can close now — Close, or keep playing?',
    closeOfferContinue: 'Keep playing',
    chinchon: 'CHINCHON — win!',
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
    chinchon: 'Chinchón',
    rematch: 'Play again (same players)',
    toLobby: 'Leave',
    leave: 'Leave room',
    matchEnded: 'Match ended',
    hold: 'Hold',
    resume: 'Resume',
    startNow: 'Start now',
    // Lobby (global landing) strings — these were previously hardcoded English.
    lobbyTitle: 'LOBBY',
    playersHere: 'Players here',
    activeMatches: 'Active matches',
    generalChat: 'General chat',
    leaveLobby: 'Leave lobby',
    saySomething: 'Say something…',
    noMatches: 'No matches running yet.',
    pendingMatch: 'Starting soon',
    joinThis: 'Join this game',
    publicRoom: 'Public room',
    privateRoom: 'Private room',
    playWithBots: 'Play with bots?',
    howManyBots: 'How many bots? (2–6)',
    enterLobby: 'Enter lobby →',
    backToLobby: '← Back to lobby',
    createPublic: 'Create public room',
    createPrivate: 'Create private room',
    language: 'Language:',
    learnSession: 'Learning session',
    learnSessionDesc: 'Practice with up to 3 players (and bots). No pressure — learn the game.',
  },
  es: {
    title: 'CHINCHON',
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
    deadwood: 'sobrante',
    stock: 'Mazo',
    discard: 'Descarte',
    yourHand: 'Tu mano',
    roomChat: 'Chat de sala',
    quickNote: 'Nota rápida para la mesa…',
    reshuffle: 'Mazo rebarajado',
    keepPlaying: 'Seguir jugando (no cerrar)',
    closeOffer: 'Puedes cerrar ahora — ¿Cerrar o seguir jugando?',
    closeOfferContinue: 'Seguir jugando',
    chinchon: 'CHINCHON — ¡ganas!',
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
    chinchon: 'Chinchón',
    rematch: 'Jugar otra (mismos jugadores)',
    toLobby: 'Salir',
    leave: 'Salir de la sala',
    matchEnded: 'Partida terminada',
    hold: 'Pausar',
    resume: 'Reanudar',
    startNow: 'Empezar ya',
    lobbyTitle: 'LOBBY',
    playersHere: 'Jugadores aquí',
    activeMatches: 'Partidas activas',
    generalChat: 'Chat general',
    leaveLobby: 'Salir del lobby',
    saySomething: 'Escribe algo…',
    noMatches: 'Aún no hay partidas.',
    pendingMatch: 'Empieza pronto',
    joinThis: 'Unirse a esta partida',
    publicRoom: 'Sala pública',
    privateRoom: 'Sala privada',
    playWithBots: '¿Jugar con bots?',
    howManyBots: '¿Cuántos bots? (2–6)',
    enterLobby: 'Entrar al lobby →',
    backToLobby: '← Volver al lobby',
    createPublic: 'Crear sala pública',
    createPrivate: 'Crear sala privada',
    language: 'Idioma:',
    learnSession: 'Sesión de aprendizaje',
    learnSessionDesc: 'Practica con hasta 3 jugadores (y bots). Sin presión — aprende el juego.',
  },
};

// Rules text shown in the lobby "Gameplay" screen and read aloud one-by-one in
// a tutorial match. No numbers, bold titles (rendered), EN only until ES review.
// Order = reading order the user approved (win -> deck -> hand -> runs -> sets
// -> closing -> scoring -> out/match).
const RULES_EN = [
  { title: 'How to win', body: 'You win Chinchón by getting all 7 of your cards into melds, with nothing left over — that\'s a chinchón, and you win the hand outright. If you can\'t make a perfect hand, you win by having the lowest leftover points when the match ends.' },
  { title: 'The deck', body: 'We play with 80 cards: two Spanish decks of 40. Each suit — Oros (coins), Copas (cups), Espadas (swords), Bastos (clubs) — has ranks 1 through 7, plus 10, 11, and 12. The 1 of Oros is wild: it can stand in for any card in a meld (only one wild per meld), but it can also be used as a natural 1.' },
  { title: 'Your hand', body: 'You will always hold seven cards. On your turn, draw one card from the stockpile or the discard pile, then you must discard one — so you always have seven cards in your hand.' },
  { title: 'Runs', body: 'A run is three or more cards of the same suit, in order. Because the deck skips 8 and 9, the sequence flows right from 7 to 10 — so 6-7-10 is a valid run, and 11-12-1 is also a valid run. The wild 1 of Oros can fill in anywhere a card is needed. Two limits: it cannot be used as a second wild in a chinchón win — but if two 1-of-Oros are in a trio, one must be the actual 1 of Oros. Otherwise it can be anyone, anywhere.' },
  { title: 'Sets', body: 'A set is three or more cards of the same rank, any suits — like three 10s.' },
  { title: 'Closing', body: 'When your 7 cards are melds with a small leftover, you can close. A clean close is a 4-card meld plus a 3-card meld with nothing left — that scores −10. Or two 3-card melds with one leftover card worth 5 or less.' },
  { title: 'Scoring', body: 'The computer keeps the score — you never do. After everyone reveals their hands, the computer counts each player\'s leftover cards. Face cards 10, 11, 12 count as 10 each; the 1 of Oros counts as 0 (it\'s wild); other cards count their number. A clean close by the closer scores −10. The floor is −50 — but you don\'t win automatically at −50; it just means you\'re the farthest from the 101-out line.' },
  { title: 'Out and match', body: 'When a player reaches 101 or more points, they are out — eliminated on their own, by their own score. One player at a time is eliminated until only one stands. That last player, with the lowest total, wins the match. 2 to 7 players.' },
];

// Spanish mirror of the locked EN rules (same order, no numbers, bold titles).
const RULES_ES = [
  { title: 'Cómo ganar', body: 'Ganas el Chinchón dejando las 7 cartas en melés, sin nada de sobrante — eso es un chinchón, y ganas la mano directamente. Si no puedes armar la mano perfecta, ganas teniendo los puntos sobrantes más bajos cuando termina la partida.' },
  { title: 'La baraja', body: 'Jugamos con 80 cartas: dos barajas españolas de 40. Cada palo — Oros, Copas, Espadas, Bastos — tiene los números del 1 al 7, más el 10, el 11 y el 12. El 1 de Oros es comodín: puede ocupar el lugar de cualquier carta en un melé (solo un comodín por melé), pero también puede usarse como un 1 natural.' },
  { title: 'Tu mano', body: 'Siempre tendrás siete cartas. En tu turno, robas una carta del mazo o de la pila de descarte, y luego debes descartar una — así siempre tienes siete cartas en la mano.' },
  { title: 'Escaleras', body: 'Una escalera es tres o más cartas del mismo palo, en orden. Como la baraja salta el 8 y el 9, la secuencia pasa del 7 al 10 — así que 6-7-10 es una escalera válida, y también lo es 11-12-1. El comodín 1 de Oros puede llenar cualquier hueco. Dos límites: no puede usarse como segundo comodín en un chinchón — pero si hay dos 1 de Oros en un trío, uno debe ser el 1 de Oros real. Fuera de eso, puede ser cualquiera, en cualquier lugar.' },
  { title: 'Grupos', body: 'Un grupo es tres o más cartas del mismo número, de cualquier palo — como tres 10.' },
  { title: 'Cerrar', body: 'Cuando tus 7 cartas forman melés con un pequeño sobrante, puedes cerrar. Un cierre limpio es un melé de 4 más un melé de 3 sin nada de sobrante — eso suma −10. O dos melés de 3 con una carta sobrante que valga 5 o menos.' },
  { title: 'Puntaje', body: 'La computadora lleva el puntaje — tú nunca. Cuando todos muestran sus manos, la computadora cuenta las cartas sobrantes de cada jugador. Las figuras 10, 11, 12 valen 10 cada una; el 1 de Oros vale 0 (es comodín); las demás cartas valen su número. Un cierre limpio del que cierra suma −10. El piso es −50 — pero no ganas automáticamente con −50; solo significa que estás más lejos de la línea de salida en 101.' },
  { title: 'Salida y partida', body: 'Cuando un jugador llega a 101 puntos o más, queda fuera — eliminado por su propia cuenta, por su propio puntaje. Se elimina un jugador a la vez hasta que queda uno solo. Ese último jugador, con el total más bajo, gana la partida. De 2 a 7 jugadores.' },
];

function rulesForLang(l) { return l === 'es' ? RULES_ES : RULES_EN; }

let lang = 'en';
const t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.en[key];

const state = {
  code: null,
  seatId: null,
  view: null,    // last serialized state
  pollTimer: null,
  chosenSplit: null, // index into view.closeOptions when the player picks a meld set
  selected: new Set(), // card ids selected in the lay-off hand
  handOrder: [],  // card ids in the player's preferred display order (reorderable)
  swapPick: null, // card id currently "picked up" for swapping during reorder
  chatSeen: 0,    // how many chat messages already rendered (append-only)
  lobbyToken: null,
  lobbyName: null,
};

const $ = (id) => document.getElementById(id);

// Resume token: remember each room's seat on this device so a dropped player
// can rejoin their SAME seat by reopening the (seat-embedded) link or just the
// room code on the same phone.
function persistSeat(code, seatId) {
  try { localStorage.setItem('chinchon:' + code, seatId); } catch { /* ignore */ }
}
function loadSeat(code) {
  try { return localStorage.getItem('chinchon:' + code) || null; } catch { return null; }
}
function clearSeat(code) {
  try { localStorage.removeItem('chinchon:' + code); } catch { /* ignore */ }
}
// Share link embeds the seat so it doubles as a rejoin link on any device.
function shareLinkFor(code, seatId) {
  return location.origin + '/?code=' + code + (seatId ? '&seat=' + seatId : '');
}

// ----------------------------------------------------------- lobby wiring

function show(panel) {
  $('globby').classList.add('hidden');
  $('lobby').classList.add('hidden');
  $('game').classList.add('hidden');
  panel.classList.remove('hidden');
}

// Lobby room-setup panes (create vs join). Replaces the old multi/solo tabs.
function showCreatePane() {
  $('create-pane').classList.remove('hidden');
  $('join-pane').classList.add('hidden');
  // Reset to the initial create choices (hide any in-progress private dialogue).
  $('create-choices').classList.remove('hidden');
  $('private-dialogue').classList.add('hidden');
  $('pd-bots-count').classList.add('hidden');
  $('room-info').classList.add('hidden');
  $('room-waiting').textContent = '';
  // Drop any pending learning-session intent when returning to a normal create.
  const lm = $('lobby-msg'); if (lm) lm.textContent = '';
}
function showJoinPane() {
  $('join-pane').classList.remove('hidden');
  $('create-pane').classList.add('hidden');
}

function applyLang() {
  document.documentElement.lang = lang;
  $('title').textContent = t('title');
  document.title = t('title');
  // (tab-multi / tab-solo / sub-create / sub-join were removed in the lobby rework)
  const createH = $('create-h'); if (createH) createH.textContent = t('createRoom');
  const joinH = $('join-h'); if (joinH) joinH.textContent = t('joinRoom');
  const backToCreate = $('back-to-create'); if (backToCreate) backToCreate.textContent = t('backToCreate');
  // (host-name / btn-create / btn-start / solo-* were removed in the lobby rework)
  $('join-code').placeholder = 'ABCD';
  $('join-name').placeholder = t('yourName');
  const joinBtn = $('btn-join'); if (joinBtn) joinBtn.textContent = t('joinRoom');
  const createPublic = $('btn-create-public'); if (createPublic) createPublic.textContent = t('createPublic');
  const createPrivate = $('btn-create-private'); if (createPrivate) createPrivate.textContent = t('createPrivate');
  const pdQ1 = $('pd-q1'); if (pdQ1) pdQ1.textContent = t('playWithBots');
  const pdQ2 = $('pd-q2'); if (pdQ2) pdQ2.textContent = t('howManyBots');
  $('btn-rematch').textContent = t('rematch');
  $('btn-tolobby').textContent = t('toLobby');
  // In-game static labels (the ones not rebuilt on every render()).
  const lblStock = $('lbl-stock'); if (lblStock) lblStock.textContent = t('stock');
  const lblDiscard = $('lbl-discard'); if (lblDiscard) lblDiscard.textContent = t('discard');
  const yourHandH2 = $('your-hand-h2'); if (yourHandH2) yourHandH2.firstChild.textContent = t('yourHand') + ' ';
  const btnStock = $('btn-draw-stock'); if (btnStock) btnStock.textContent = t('drawStock');
  const btnDiscard = $('btn-draw-discard'); if (btnDiscard) btnDiscard.textContent = t('drawDiscard');
  const roomChat = document.querySelector('#chat .chat-head span'); if (roomChat) roomChat.textContent = t('roomChat');
  const chatInput = $('chat-input'); if (chatInput) chatInput.placeholder = t('quickNote');
  const reshuffle = $('reshuffle-note'); if (reshuffle) reshuffle.textContent = t('reshuffle');
  // Lobby (global landing) strings — previously hardcoded English.
  const lobbyTitle = $('lobby-title'); if (lobbyTitle) lobbyTitle.textContent = t('lobbyTitle');
  const playersLabel = $('lobby-players-label'); if (playersLabel) playersLabel.textContent = t('playersHere');
  const matchesLabel = $('lobby-matches-label'); if (matchesLabel) matchesLabel.textContent = t('activeMatches');
  const chatLabel = $('lobby-chat-label'); if (chatLabel) chatLabel.textContent = t('generalChat');
  const langLabel = $('lang-label'); if (langLabel) langLabel.textContent = t('language');
  const noMatches = $('no-matches'); if (noMatches) noMatches.textContent = t('noMatches');
  const lobbyChatInput = $('lobby-chat-input'); if (lobbyChatInput) lobbyChatInput.placeholder = t('saySomething');
  const enterBtn = $('btn-lobby-enter'); if (enterBtn) enterBtn.textContent = t('enterLobby');
  const leaveBtn = $('btn-leave-lobby'); if (leaveBtn) leaveBtn.textContent = t('leaveLobby');
  const goCreate = $('btn-go-create'); if (goCreate) goCreate.textContent = t('createRoom');
  const goJoin = $('btn-go-join'); if (goJoin) goJoin.textContent = t('joinRoom');
  const backLobby = $('btn-back-lobby'); if (backLobby) backLobby.textContent = t('backToLobby');
  const leaveMatch = $('btn-leave-match'); if (leaveMatch) leaveMatch.textContent = t('leaveLobby');
  // Re-render game if we're already in it (so labels update live).
  if (state.view) render();
}

// Language selector
document.querySelectorAll('.lang-btn').forEach((b) => {
  b.onclick = () => {
    lang = b.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach((x) => x.classList.toggle('active', x === b));
    applyLang();
  };
});

// If opened with ?code=ABCD[&seat=ZZZ], jump straight to the room. With a seat
// we auto-rejoin that exact seat (spectator if eliminated/match moved on).
(function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return;
  const seat = params.get('seat') || loadSeat(code.toUpperCase());
  if (seat) {
    (async () => {
      const res = await fetch('/api/room/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.toUpperCase(), seatId: seat, lobbyToken: state.lobbyToken }),
      }).then((r) => r.json()).catch(() => null);
      if (res && res.seatId) {
        state.code = code.toUpperCase();
        state.seatId = res.seatId;
        persistSeat(state.code, res.seatId);
        enterGame();
      }
    })();
    return;
  }
  // No seat: just prefill the join code and show the join pane.
  showJoinPane();
  $('join-code').value = code.toUpperCase();
})();
$('btn-create-public').onclick = () => createRoom('public', 0);
$('btn-create-private').onclick = () => {
  $('create-choices').classList.add('hidden');
  $('private-dialogue').classList.remove('hidden');
  $('pd-summary').textContent = '';
};
// Private dialogue — Q1: play with bots?
document.querySelectorAll('.pd-answer').forEach((b) => {
  b.onclick = () => {
    if (b.dataset.ans === 'bots-yes') {
      $('pd-bots-count').classList.remove('hidden');
    } else {
      // No bots -> private (unlisted) countdown waiting for humans.
      createRoom('private', 0);
    }
  };
});
// Private dialogue — Q2: how many bots? (2–6) -> immediate start.
$('pd-bots-go').onclick = () => {
  const n = Math.max(2, Math.min(6, parseInt($('pd-bots-input').value, 10) || 2));
  createRoom('private', n);
};

async function createRoom(visibility, bots, learning = false, tutorial = false) {
  const name = state.lobbyName || 'Host';
  const res = await fetch('/api/room/new', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'multi', name, visibility, bots, learning, tutorial, lobbyToken: state.lobbyToken }),
  }).then((r) => r.json()).catch(() => null);
  if (!res || !res.code) { $('pd-summary').textContent = 'Could not create the room. Try again.'; return; }
  state.code = res.code;
  state.seatId = res.seatId;
  persistSeat(res.code, res.seatId);
  $('room-code').textContent = res.code;
  const link = shareLinkFor(res.code, res.seatId);
  $('share-link').textContent = link;
  $('share-link').href = link;
  $('room-info').classList.remove('hidden');
  $('create-choices').classList.add('hidden');
  $('private-dialogue').classList.add('hidden');
  if (res.pending) {
    // Public or private-humans: wait for the countdown, then auto-enter the game.
    watchRoom();
    state.pollTimer = setInterval(watchRoom, 1500);
  } else {
    // Private + bots: started immediately.
    clearInterval(state.pollTimer);
    enterGame();
  }
}

$('btn-copy').onclick = () => {
  const link = shareLinkFor(state.code, state.seatId);
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

// Polls a pending room (host or joiner) and transitions into the game once it
// starts. If a private room expires with no humans, bounces back to the lobby.
async function watchRoom() {
  const res = await fetch(`/api/state?code=${state.code}&seat=${state.seatId}`).then((r) => r.json()).catch(() => null);
  if (!res) return;
  if (res.gone) { goToLobby(); return; }
  if (res.started) { clearInterval(state.pollTimer); enterGame(); return; }
  // Still waiting: list who's in and show the countdown.
  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (const p of (res.lobby || [])) {
    const li = document.createElement('li');
    li.textContent = (p.isBot ? '🤖 ' : '') + p.name;
    ul.appendChild(li);
  }
  const secs = res.pending ? res.pending.secondsLeft : null;
  $('room-waiting').textContent = secs != null ? `Match starts in ${secs}s…` : 'Waiting for the match to start…';
}

$('btn-join').onclick = async () => {
  const code = $('join-code').value.trim().toUpperCase();
  const name = $('join-name').value.trim() || state.lobbyName || t('player');
  const res = await fetch('/api/room/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name, lobbyToken: state.lobbyToken }),
  }).then((r) => r.json());
  if (res.error) { $('join-msg').textContent = res.error; return; }
  state.code = code;
  state.seatId = res.seatId;
  persistSeat(code, res.seatId);
  // Joining an already-started room -> straight into the game; a pending one
  // (public countdown or private-humans) -> watch until it starts.
  const st = await fetch(`/api/state?code=${code}&seat=${res.seatId}`).then((r) => r.json()).catch(() => null);
  if (st && st.started) { enterGame(); return; }
  // Show the room-info waiting view and watch.
  $('room-code').textContent = code;
  const link = shareLinkFor(code, res.seatId);
  $('share-link').textContent = link;
  $('share-link').href = link;
  $('room-info').classList.remove('hidden');
  watchRoom();
  state.pollTimer = setInterval(watchRoom, 1500);
};

// ----------------------------------------------------------- game wiring

async function enterGame() {
  show($('game'));
  state.pollTimer = setInterval(poll, 1200);
  await poll();
}

async function poll() {
  const res = await fetch(`/api/state?code=${state.code}&seat=${state.seatId}`).then((r) => r.json());
  // If this seat is no longer in the room (kicked, or left), drop back to lobby.
  if (res.error || (res.scoreboard && !res.scoreboard.some((p) => p.seat === state.seatId))) {
    goToLobby();
    return;
  }
  state.view = res;
  render();
}

function cardLabel(c) {
  return `${c.rank}${SUIT_ICON[c.suit] || '?'}`;
}

// Compact meld chip: rank + the SAME SVG emblem used on the cards, so meld
// lists match the actual suit icons (cup/sword/coin/plant), not just a glyph.
function meldChip(c) {
  return `<span class="meld-chip ${c.suit.toLowerCase()}">${c.rank}${suitEmblem(c.suit)}</span>`;
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
      return '<svg viewBox="0 0 24 24" class="emblem"><path d="M12 2 L13.6 13 L12 15 L10.4 13 Z" fill="currentColor"/><line x1="8.5" y1="15" x2="15.5" y2="15" stroke="currentColor" stroke-width="2"/><line x1="12" y1="15" x2="12" y2="21" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="21.5" r="1.4" fill="currentColor"/></svg>';
    default: // Bastos
      return '<svg viewBox="0 0 24 24" class="emblem"><rect x="10.5" y="3" width="3" height="18" rx="1.5" fill="currentColor"/><path d="M12 6 q6 -2 8 2 q-5 1 -8 -2 z" fill="currentColor"/><path d="M12 9 q-6 -2 -8 2 q5 1 8 -2 z" fill="currentColor"/></svg>';
  }
}

// Full card as a styled element with a BIG number and the suit emblem.
function renderCardEl(c, { clickable, onClick, reorderable } = {}) {
  const el = document.createElement('div');
  el.className = `card ${c.suit.toLowerCase()}`;
  if (window.__isWild(c)) el.classList.add('has-wild');
  el.innerHTML =
    `<span class="rank">${c.rank}</span>` +
    `<span class="emblem-wrap">${suitEmblem(c.suit)}</span>` +
    (window.__isWild(c) ? '<span class="wild" title="wild (1 de Oros)">★</span>' : '');
  if (onClick) el.onclick = onClick;            // wire the handler whenever one is given
  if (clickable) el.classList.add('clickable');
  else if (!onClick) el.classList.add('disabled'); // grey only if truly inert
  if (reorderable) el.classList.add('reorderable');
  return el;
}

// Describe a meld set for the close-choice UI, in the player's language.
// Compact, suit-COLOURED label that ALSO carries the real SVG emblem, so every
// inline spot (discard, close-choice, layoff suggestions) matches the cards.
function coloredLabel(c) {
  return meldChip(c);
}

function meldsText(split) {
  const parts = split.map((m) =>
    '[ ' + m.map((c) => coloredLabel(c)).join(' ') + ' ]'
  );
  return parts.join('  ');
}

// (Close-hint rule, kept here for reference:)
// The ONLY close prompt shown is a generic "You can close now — or keep
// playing", fired whenever any NON-chinchon close is available. It never lists
// cards, never reveals a run, and NEVER reveals a chinchon (whole-game win stays
// hidden — everyone knows the game by this point). It fades after ~10s. The
// authoritative run/chinchon detection for scoring lives in src/hints.js +
// src/melds.js (unit-tested) and is what the close-options UI relies on.

// Edge-triggered animations: only fire once per meaningful state change, so the
// 1.2s poll re-render never replays them.
const _animState = { roundKey: null, discardId: null, close: false, layoff: false, gameover: false, reshuffleSeen: 0, reshuffleTimer: null, runHintKey: '', runHintTimer: null, closeOfferDismissed: false };
function onceAnimate(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

function render() {
  const v = state.view;
  if (!v || !v.started) return;
  const canAct = v.isYourTurn;
  const phase = v.phase;

  // Room code shown on top of the scoreboard (localized "Room XXXX").
  $('room-code-tag').textContent = v.code ? `${t('roomCodeLabel')} ${v.code}` : '';

  // Scoreboard: order = join order (host first). Dot = live connection status.
  // Playing/eliminated show their score; a dropped (spectator) player shows "–".
  // The host sees a Kick button on every other player (sends them back to lobby).
  $('scoreboard').innerHTML = v.scoreboard
    .map((p) => {
      const dot = p.spectator ? 'red' : !p.connected ? 'red' : p.away ? 'amber' : 'green';
      const title = p.spectator ? 'disconnected' : !p.connected ? 'disconnected' : p.away ? 'idle' : 'connected';
      const dotEl = `<span class="dot dot-${dot}" title="${title}"></span>`;
      const score = p.spectator ? '–' : p.total;
      const kick = (v.isHost && p.seat && p.seat !== state.seatId)
        ? ` <button class="kick" data-kick="${p.seat}" title="Kick to lobby">✕</button>`
        : '';
      return `<div class="row ${p.out ? 'out' : ''}">${dotEl}${escapeHtml(p.name)}: ${score}${p.out ? ' · ' + t('out') : ''}${kick}</div>`;
    })
    .join('');

  // Turn banner
  if (v.gameOver) {
    $('turn-banner').textContent = `🏆 ${v.winner} ${t('gameOver')}`;
  } else {
    $('turn-banner').textContent = v.isYourTurn ? t('yourTurn') : t('waiting');
  }

  // Connection / waiting / spectator banner
  renderStatusBanner(v);

  // Per-room chat (shown while the room/game is up; cleared on rematch)
  renderChat(v);

  // Game-over panel (Slice 3)
  const go = $('gameover');
  if (v.gameOver) {
    if (!_animState.gameover) onceAnimate(go, 'appear');
    _animState.gameover = true;
    go.classList.remove('hidden');
    $('go-title').textContent = t('goTitle');

    // Special celebration in LEARNING rooms: if a human (not a bot) wins,
    // congratulate them on beating the bots — that's the point of practice.
    if (v.learning && v.winner) {
      const winnerIsBot = (v.scoreboard || []).some((p) => p.name === v.winner && p.isBot);
      if (!winnerIsBot) {
        const msg = lang === 'es'
          ? `¡Felicidades ${v.winner}! Derrotaste a los bots. 🎉`
          : `Congrats ${v.winner} — you beat the bots! 🎉`;
        $('go-winner').textContent += `  ${msg}`;
      }
    }

    // Leaderboard: winner first, then everyone else by ELIMINATION ORDER
    // (last eliminated just under the winner, first eliminated at the bottom).
    // Players still in the game (eliminatedRank 0) rank just below the winner.
    const board = $('go-board');
    board.innerHTML = '';
    const players = (v.scoreboard || []).slice();
    const rank = (p) => (p.name === v.winner ? Infinity : (p.eliminatedRank || 0) === 0 ? Infinity - 1 : p.eliminatedRank);
    const ranked = players.slice().sort((a, b) => rank(b) - rank(a));
    for (const p of ranked) {
      const row = document.createElement('div');
      row.className = 'go-row' + (p.name === v.winner ? ' winner' : '') + (p.out ? ' out' : '');
      const name = document.createElement('span');
      name.className = 'go-name';
      name.textContent = (p.name === v.winner ? '🏆 ' : '') + p.name;
      const score = document.createElement('span');
      score.className = 'go-score';
      // Chinchón winner: no points shown (already in the header). Others: their total.
      score.textContent = (p.name === v.winner && v.chinchonWin) ? '' : p.total;
      row.appendChild(name);
      row.appendChild(score);
      board.appendChild(row);
    }

    const outNames = (v.scoreboard || []).filter((p) => p.out).map((p) => p.name);
    $('go-eliminated').textContent = outNames.length
      ? `${t('eliminated')}: ${outNames.join(', ')}`
      : '';

    // Rematch pending window (90s countdown, or held by host). Lobby watchers
    // can join the rematch; the starter (host) may HOLD the countdown (tap
    // again to resume) — there is no "start now" button; it auto-starts at 0.
    const pendingEl = $('go-pending');
    const holdBtn = $('btn-hold');
    if (v.pending) {
      pendingEl.classList.remove('hidden');
      pendingEl.textContent = v.pending.hold
        ? `HELD BY HOST ${v.pending.hostName} — waiting to start`
        : `New game starts in ${v.pending.secondsLeft}s (room ${v.pending.code})`;
      const isStarter = v.pending.startedBy === state.seatId;
      holdBtn.classList.toggle('hidden', !isStarter);
      holdBtn.textContent = v.pending.hold ? t('resume') : t('hold');
    } else {
      pendingEl.classList.add('hidden');
      holdBtn.classList.add('hidden');
    }
  } else {
    go.classList.add('hidden');
    _animState.gameover = false;
  }

  // Opponents (face-down counts only)
  const oppWrap = $('opponents');
  oppWrap.innerHTML = '';
  for (const o of v.opponents) {
    if (o.isYou) continue;
    const el = document.createElement('div');
    el.className = 'opp' + (v.turnSeat === o.seat ? ' active' : '');
    const avatar = o.botEmoji
      ? `<span class="bot-avatar" style="background:${o.botColor || '#7c4dff'}">${o.botEmoji}</span>`
      : '';
    el.innerHTML = `<div class="name">${avatar}${o.name}</div><div class="count">${o.handCount} cards${o.out ? ' · ' + t('out') : ''}</div>`;
    oppWrap.appendChild(el);
  }

  // Center piles
  $('stock-count').textContent = v.stockCount;
  const stockPile = $('stock');
  const discardPile = $('discard');
  const canDraw = canAct && phase === 'draw';
  stockPile.classList.toggle('tappable', canDraw);
  discardPile.classList.toggle('tappable', canDraw);
  stockPile.classList.toggle('disabled-pile', !canDraw);
  discardPile.classList.toggle('disabled-pile', !canDraw);
  // Surface a stock reshuffle as a brief note (no cap on recycles per your rules).
  const rn = $('reshuffle-note');
  if (v.lastReshuffle && v.lastReshuffle !== _animState.reshuffleSeen && Date.now() - v.lastReshuffle < 6000) {
    _animState.reshuffleSeen = v.lastReshuffle;
    rn.classList.remove('hidden');
    clearTimeout(_animState.reshuffleTimer);
    _animState.reshuffleTimer = setTimeout(() => rn.classList.add('hidden'), 3000);
  }
  const dt = $('discard-top');
  const dtKey = v.discardTop ? `${v.discardTop.suit}-${v.discardTop.rank}` : null;
  if (dtKey !== _animState.discardId) {
    _animState.discardId = dtKey;
    if (v.discardTop) onceAnimate(dt, 'slide-in');
  }
  dt.innerHTML = v.discardTop ? meldChip(v.discardTop) : '—';
  dt.className = v.discardTop ? `card-mini ${v.discardTop.suit.toLowerCase()}` : '';

  // Your hand. The freshly-drawn card is pinned to a LOCKED 8th slot; the
  // player chooses which of the original 7 to throw (tap-to-discard). The 7
  // are reorderable while waiting / on the draw turn.
  const handWrap = $('hand');
  handWrap.innerHTML = '';
  const handLen = v.yourHand.length;
  if (handLen === 7 && _animState.handLen !== 7) onceAnimate(handWrap, 'deal-anim');
  _animState.handLen = handLen;

  const drawn = v.lastDrawnId ? v.yourHand.find((c) => c.id === v.lastDrawnId) : null;
  const seven = drawn ? v.yourHand.filter((c) => c.id !== drawn.id) : v.yourHand.slice();

  // Reconcile the saved display order against the 7 (the drawn card is never
  // reorderable, so it stays out of handOrder).
  const liveIds = new Set(seven.map((c) => c.id));
  state.handOrder = state.handOrder.filter((id) => liveIds.has(id));
  for (const c of seven) if (!state.handOrder.includes(c.id)) state.handOrder.push(c.id);
  const byId = new Map(seven.map((c) => [c.id, c]));
  const ordered = state.handOrder.map((id) => byId.get(id)).filter(Boolean);

  const reorderable = !canAct || phase === 'draw'; // not while discarding
  const discarding = canAct && phase === 'discard';
  for (const c of ordered) {
    const el = renderCardEl(c, {
      clickable: discarding,
      reorderable,
      onClick: () => {
        if (discarding) { doDiscard(c, false); return; }
        // Reorder mode: tap to pick up, tap another to swap.
        if (state.swapPick === c.id) { state.swapPick = null; return; }
        if (!state.swapPick) { state.swapPick = c.id; return; }
        const i = state.handOrder.indexOf(state.swapPick);
        const j = state.handOrder.indexOf(c.id);
        [state.handOrder[i], state.handOrder[j]] = [state.handOrder[j], state.handOrder[i]];
        state.swapPick = null;
        render();
      },
    });
    if (reorderable && state.swapPick === c.id) el.classList.add('picked');
    if (reorderable) el.classList.add('reorderable');
    handWrap.appendChild(el);
  }

  // Locked 8th slot: the card just drawn. It IS discardable (you only learn its
  // identity after drawing, so it must be a valid throw) — but not reorderable.
  if (drawn) {
    const sep = document.createElement('div');
    sep.className = 'hand-sep';
    sep.textContent = '⟶';
    handWrap.appendChild(sep);
    const el = renderCardEl(drawn, {
      clickable: discarding,
      onClick: () => { if (discarding) doDiscard(drawn, false); },
    });
    el.classList.add('drawn-locked');
    handWrap.appendChild(el);
  }

  // Deadwood stays as a reference; live combination hints are intentionally
  // NOT shown so the player does their own counting (mirrors the TTY client).
  $('deadwood').textContent = `${t('deadwood')} ${v.yourDeadwood}`;
  const melds = $('melds');
  melds.innerHTML = '';

  // Close prompt. Normal rooms: a small generic "you can close now" that fades
  // after ~10s (everyone knows the game). LEARNING rooms: a bigger, didactic
  // banner that spells out the possible close(s) and stays up while available,
  // so a newcomer can study it. Never reveals a chinchon in either mode.
  const hintEl = $('run-hint');
  const canCloseNow = (v.closeOptions || []).some((o) => !o.chinchon);
  const hintKey = canCloseNow ? 'on' : '';
  if (canCloseNow) {
    if (v.learning) {
      // Didactic: list the actual possible close(s) and persist (no auto-hide).
      const lines = (v.closeOptions || [])
        .filter((o) => !o.chinchon)
        .map((o) => {
          const disc = coloredLabel(findCard(o.cardId));
          const sign = o.score < 0 ? '' : '+';
          return `${t('close')} ${sign}${o.score} · ${t('discard')} ${disc} · ${meldsText(o.split)}`;
        });
      hintEl.innerHTML = `<div class="run-hint-title">${lang === 'es' ? 'Cierre posible:' : 'Possible close:'}</div>`
        + lines.map((l) => `<div class="run-hint-line">${l}</div>`).join('');
      hintEl.classList.remove('hidden', 'show', 'learning');
      void hintEl.offsetWidth;
      hintEl.classList.add('show', 'learning');
      if (_animState.runHintTimer) { clearTimeout(_animState.runHintTimer); _animState.runHintTimer = null; }
      _animState.runHintKey = hintKey;
    } else if (hintKey !== _animState.runHintKey) {
      hintEl.innerHTML = (lang === 'es' ? 'Puedes cerrar ahora — o seguir jugando.' : 'You can close now — or keep playing.');
      hintEl.classList.remove('hidden', 'show', 'learning');
      void hintEl.offsetWidth;
      hintEl.classList.add('show');
      if (_animState.runHintTimer) clearTimeout(_animState.runHintTimer);
      _animState.runHintTimer = setTimeout(() => {
        hintEl.classList.add('hidden');
        hintEl.classList.remove('show');
      }, 10000);
      _animState.runHintKey = hintKey;
    }
  } else {
    hintEl.classList.add('hidden');
    hintEl.classList.remove('show', 'learning');
    if (_animState.runHintTimer) { clearTimeout(_animState.runHintTimer); _animState.runHintTimer = null; }
    _animState.runHintKey = '';
  }

  // Close/Continue offer: on the human's discard turn, when a legal close exists
  // (incl. chinchon). The computer has VERIFIED the close is legal — it never
  // reveals the melds or suggests a card. Agency stays with the player.
  // Reset the "Keep playing" dismissal at the start of each turn (draw phase)
  // so the offer re-appears on every discard turn a close is available.
  if (isYourTurn && phase === 'draw') _animState.closeOfferDismissed = false;
  const closeOfferEl = $('close-offer');
  const showCloseOffer = isYourTurn && phase === 'discard' && !!v.canClose && !_animState.closeOfferDismissed;
  if (showCloseOffer) {
    $('close-offer-text').textContent = t('closeOffer');
    $('btn-close-continue').textContent = t('closeOfferContinue');
    closeOfferEl.classList.remove('hidden');
  } else {
    closeOfferEl.classList.add('hidden');
  }

  // Controls
  $('btn-draw-stock').textContent = t('drawStock');
  $('btn-draw-discard').textContent = t('drawDiscard');
  $('btn-draw-stock').classList.toggle('hidden', !(canAct && phase === 'draw'));
  $('btn-draw-discard').classList.toggle('hidden', !(canAct && phase === 'draw'));

  // Tutorial gating: while a rule is pending, the human cannot act. Show the
  // current rule (text) with a Continue button that acknowledges it server-side.
  // Voice is added later (the user approved text-only first).
  const tutEl = $('tutorial-rule');
  if (v.tutorial && v.tutorialPaused && v.tutorialRuleIndex < RULES_EN.length) {
    const rule = rulesForLang(lang)[v.tutorialRuleIndex];
    tutEl.querySelector('.tutorial-rule-title').textContent = rule.title;
    tutEl.querySelector('.tutorial-rule-body').textContent = rule.body;
    tutEl.classList.remove('hidden');
    $('btn-draw-stock').classList.add('hidden');
    $('btn-draw-discard').classList.add('hidden');
  } else {
    tutEl.classList.add('hidden');
  }

  const co = $('close-options');
  co.innerHTML = '';
  if (canAct && phase === 'discard' && v.closeOptions && v.closeOptions.length) {
    if (!_animState.close) { onceAnimate(co, 'appear'); }
    _animState.close = true;
    // Prompt: choose how to close (each option is a distinct meld decomposition).
    const prompt = document.createElement('div');
    prompt.className = 'close-prompt';
    prompt.textContent = lang === 'es' ? '¿Cómo quieres cerrar?' : 'How do you want to close?';
    co.appendChild(prompt);

    v.closeOptions.forEach((o, idx) => {
      const b = document.createElement('button');
      b.className = 'close-btn';
      const disc = coloredLabel(findCard(o.cardId));
      if (o.chinchon) {
        b.innerHTML = `${t('chinchon')} (${t('discard')} ${disc})`;
      } else {
        const sign = o.score < 0 ? '' : '+';
        b.innerHTML = `${t('close')} ${sign}${o.score} · ${t('discard')} ${disc} · ${meldsText(o.split)}`;
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
  } else {
    _animState.close = false;
  }

  // ---- Slice 2: interactive lay-off board ----
  const inLayoff = !!(v.layoff && (v.layoff.phase === 'layoff' || v.layoff.done));
  $('layoff-area').classList.toggle('hidden', !inLayoff);
  if (inLayoff && !_animState.layoff) onceAnimate($('layoff-area'), 'appear');
  _animState.layoff = inLayoff;
  // During lay-off, hide the normal hand/discard controls.
  $('your-area').classList.toggle('hidden', inLayoff);
  $('controls').classList.toggle('hidden', inLayoff);
  if (inLayoff) renderLayoff(v.layoff);
}

// Connection / waiting / spectator banner. Shows drops, the host's wait/continue
// controls, and a spectator notice for a player who rejoined (or was continued).
function renderStatusBanner(v) {
  const el = $('status-banner');
  el.innerHTML = '';
  if (v.spectator) {
    el.classList.remove('hidden');
    el.className = 'banner spectator';
    el.textContent = (lang === 'es') ? 'Estás como espectador; vuelves en la próxima partida.' : 'You are spectating — you rejoin the next match.';
    return;
  }
  if (v.waiting) {
    el.classList.remove('hidden');
    el.className = 'banner waiting';
    const secs = v.waiting.secondsLeft;
    const head = (lang === 'es')
      ? `Esperando a ${v.waiting.name}… (${secs}s)`
      : `Waiting for ${v.waiting.name}… (${secs}s)`;
    el.textContent = head;
    if (v.isHost) {
      const wait = document.createElement('button');
      wait.className = 'small';
      wait.textContent = (lang === 'es') ? 'Esperar más' : 'Wait / extend';
      wait.onclick = () => apiPost('/api/room/wait');
      el.appendChild(wait);
      const cont = document.createElement('button');
      cont.className = 'small primary';
      cont.textContent = (lang === 'es') ? 'Continuar sin él' : 'Continue without them';
      cont.disabled = !v.waiting.canContinue;
      cont.onclick = () => apiPost('/api/room/continue');
      el.appendChild(cont);
    }
    return;
  }
  el.classList.add('hidden');
}

// Per-room chat: only while the room/game is up; last 10 messages; cleared on
// rematch by the server (v.chat resets to []). Append only unseen messages so
// the log doesn't flicker or steal focus from the input.
function renderChat(v) {
  const box = $('chat');
  const log = $('chat-log');
  if (!v.started) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const msgs = v.chat || [];
  // Reset view if the server cleared (rematch) or we rejoined a shorter log.
  if (_animState.chatSeen > msgs.length) _animState.chatSeen = 0;
  for (let i = _animState.chatSeen; i < msgs.length; i++) {
    const m = msgs[i];
    const row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = `<span class="chat-name"></span><span class="chat-text"></span>`;
    row.querySelector('.chat-name').textContent = m.name + ': ';
    row.querySelector('.chat-text').textContent = m.text;
    log.appendChild(row);
  }
  _animState.chatSeen = msgs.length;
  // Keep at most 10 rows visible (server caps at 10 too).
  while (log.children.length > 10) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
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
    d.innerHTML = `[${i + 1}] ` + meld.map(meldChip).join(' ');
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

// Generic POST for room control actions (wait/continue/rematch).
async function apiPost(path) {
  const res = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  }).then((r) => r.json());
  if (res.error) $('status').textContent = res.error;
  await poll();
}

// Per-room chat send (short gameplay notes; server caps at 10 + 160 chars).
async function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await fetch('/api/room/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId, text }),
  }).then((r) => r.json()).catch(() => null);
  await poll();
}
$('btn-chat-send').onclick = sendChat;
$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
// Tap the chat header to collapse/expand (mostly for the mobile bottom dock).
$('chat').querySelector('.chat-head').addEventListener('click', (e) => {
  if (e.target.id === 'btn-chat-send') return; // don't toggle when tapping Send
  $('chat').classList.toggle('collapsed');
});
// Start collapsed on small screens so the board is clear on load.
if (window.matchMedia('(max-width: 640px)').matches) $('chat').classList.add('collapsed');

// Close/Continue offer: "Close" just focuses the existing close buttons (the
// player still chooses the meld + card there); "Keep playing" dismisses the
// prominent offer for this turn (the close buttons stay available).
$('btn-close-accept').onclick = () => {
  const co = document.getElementById('close-options');
  if (co) { co.scrollIntoView({ behavior: 'smooth', block: 'center' }); co.classList.add('flash'); setTimeout(() => co.classList.remove('flash'), 700); }
};
$('btn-close-continue').onclick = () => {
  _animState.closeOfferDismissed = true;
  $('close-offer').classList.add('hidden');
};

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
// Tutorial: acknowledge the current rule so the game may proceed. Calls the
// server to advance the rule queue and unpause; render() will hide the prompt.
$('btn-tutorial-continue').onclick = async () => {
  if (!state.code || !state.seatId) return;
  await fetch('/api/tutorial/ack', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  }).catch(() => null);
  if (state.view) render(state.view);
};
// Piles are directly tappable (the "physical game" feel). Gated to the draw
// turn inside render() via the .tappable class, but guard here too.
$('stock').onclick = () => { if (state.view && state.view.isYourTurn && state.view.phase === 'draw') doDraw('stock'); };
$('discard').onclick = () => { if (state.view && state.view.isYourTurn && state.view.phase === 'draw') doDraw('discard'); };

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
    const parts = (res.melds || []).map((m) => m.map(coloredLabel).join(' '));
    const att = (res.attachable || []).map((a) => coloredLabel(a.card) + '→' + (a.meldIndex + 1));
    $('layoff-status').innerHTML = `Lay: [${parts.join('] [')}]` + (att.length ? `  Shed: ${att.join(', ')}` : '');
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
$('btn-hold').onclick = async () => {
  await fetch('/api/room/rematch/hold', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  });
  await poll();
};
// Host kick: send a player back to the lobby.
$('scoreboard').addEventListener('click', (e) => {
  const btn = e.target.closest('.kick');
  if (!btn) return;
  const target = btn.getAttribute('data-kick');
  fetch('/api/room/kick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId, target }),
  }).then(() => poll()).catch(() => null);
});

// Leave the current match (with confirmation) and return to the lobby.
$('btn-leave-match').onclick = async () => {
  if (!window.confirm('Leave this match? You will return to the lobby.')) return;
  const res = await fetch('/api/room/leave', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  }).then((r) => r.json()).catch(() => null);
  if (res && res.error) { alert(res.error); return; }
  goToLobby();
};
$('btn-tolobby').onclick = async () => {
  // Leave the room server-side (room + code + chat stay for the others).
  await fetch('/api/room/leave', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: state.code, seat: state.seatId }),
  }).catch(() => null);
  clearInterval(state.pollTimer);
  clearSeat(state.code);
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

// ----------------------------------------------------------- global lobby
// The new landing screen. Anyone enters with a name, sees who's present, the
// active matches, and a general chat. From here they create or join a room.

function persistLobby(token, name) {
  try { localStorage.setItem('chinchonLobby', JSON.stringify({ token, name })); } catch { /* ignore */ }
}
function loadLobby() {
  try { return JSON.parse(localStorage.getItem('chinchonLobby') || 'null'); } catch { return null; }
}
function clearLobby() { try { localStorage.removeItem('chinchonLobby'); } catch { /* ignore */ } }

let lobbyTimer = null;
let lobbyChatSeen = 0;
let matchIdx = 0;

async function enterLobby() {
  const name = $('lobby-name').value.trim();
  if (!name) { $('lobby-name').focus(); return; }
  const res = await fetch('/api/lobby/enter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r) => r.json()).catch(() => null);
  if (!res || res.error) {
    $('lobby-msg').textContent = res && res.error === 'name reserved'
      ? 'That name is reserved — pick another.'
      : 'Could not enter the lobby. Try again.';
    return;
  }
  state.lobbyToken = res.token;
  state.lobbyName = res.name;
  persistLobby(res.token, res.name);
  $('lobby-enter').classList.add('hidden');
  $('lobby-main').classList.remove('hidden');
  applyLang(); // translate the lobby strings to the chosen language
  $('lobby-name').value = res.name;
  lobbyChatSeen = 0;
  await lobbyPoll();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(lobbyPoll, 2000);
}

async function lobbyPoll() {
  if (!state.lobbyToken) return;
  const res = await fetch('/api/lobby/state').then((r) => r.json()).catch(() => null);
  if (!res) return;
  // Self-heal: if we have a token but the server no longer lists us (e.g. the
  // free instance restarted and wiped the in-memory lobby), re-enter so we stay
  // visible instead of showing "Players here (0)". Guard against a loop.
  if (!lobbyPoll._healing && state.lobbyName && !res.members.some((m) => m.name === state.lobbyName)) {
    lobbyPoll._healing = true;
    const r2 = await fetch('/api/lobby/enter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.lobbyName }),
    }).then((r) => r.json()).catch(() => null);
    if (r2 && r2.token) {
      state.lobbyToken = r2.token;
      state.lobbyName = r2.name;
      persistLobby(r2.token, r2.name);
    }
    lobbyPoll._healing = false;
    return lobbyPoll();
  }
  // Members + total.
  $('lobby-total').textContent = res.total;
  const ul = $('lobby-members');
  ul.innerHTML = '';
  for (const m of res.members) {
    const li = document.createElement('li');
    li.textContent = (m.name === state.lobbyName ? '★ ' : '') + m.name;
    ul.appendChild(li);
  }
  // Active matches.
  renderLobbyMatches(res.matches);
  // General chat (append only unseen).
  const log = $('lobby-chat-log');
  const msgs = res.chat || [];
  if (msgs.length < lobbyChatSeen) lobbyChatSeen = 0;
  for (let i = lobbyChatSeen; i < msgs.length; i++) {
    const m = msgs[i];
    const div = document.createElement('div');
    div.className = 'chat-msg' + (m.system ? ' system' : '');
    div.innerHTML = `<b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}`;
    log.appendChild(div);
  }
  lobbyChatSeen = msgs.length;
  log.scrollTop = log.scrollHeight;
}

function renderLobbyMatches(matches) {
  const board = $('matches-board');
  const none = $('no-matches');
  if (!matches || matches.length === 0) {
    board.classList.add('hidden');
    none.classList.remove('hidden');
    return;
  }
  none.classList.add('hidden');
  board.classList.remove('hidden');
  $('matches-count').textContent = `(${matches.length})`;
  if (matchIdx >= matches.length) matchIdx = 0;
  const m = matches[matchIdx];
  const elapsed = Math.floor((m.elapsedMs || 0) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  let html = `<div class="mc-code">Room ${m.code} · ${m.mode === 'solo' ? 'vs bots' : (m.visibility === 'public' ? 'public' : 'private')}</div>`;
  if (m.pending) {
    if (m.pending.hold) {
      html += `<div class="mc-pending">HELD BY HOST ${m.pending.hostName}</div>`;
    } else if (m.pending.type === 'fresh') {
      html += `<div class="mc-pending">${t('pendingMatch')} · ${m.pending.secondsLeft}s</div>`;
    } else {
      html += `<div class="mc-pending">New game in ${m.pending.secondsLeft}s</div>`;
    }
  } else {
    html += `<div class="mc-timer">⏱ Playtime ${mm}:${ss}</div>`;
  }
  html += m.scoreboard.map((p) => `<div class="mc-row"><span>${escapeHtml(p.name)}${p.out ? ' (out)' : ''}</span><span>${p.total}</span></div>`).join('');
  if (m.pending) {
    const label = m.pending.type === 'fresh' ? t('joinThis') : 'Join rematch';
    html += `<button class="small" data-joinmatch="${m.code}">${label}</button>`;
  }
  $('match-card').innerHTML = html;
  const jb = $('match-card').querySelector('[data-joinmatch]');
  if (jb) jb.onclick = () => joinPublicOrRematch(m.code, m.pending && m.pending.type === 'fresh');
  $('btn-match-next').classList.toggle('hidden', matches.length <= 1);
}

// Joining a pending public room (fresh) vs a rematch pending window.
async function joinPublicOrRematch(code, isFresh) {
  if (isFresh) {
    const name = state.lobbyName || $('lobby-name').value.trim() || 'Player';
    const res = await fetch('/api/room/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, lobbyToken: state.lobbyToken }),
    }).then((r) => r.json());
    if (res.error) { alert(res.error); return; }
    state.code = code;
    state.seatId = res.seatId;
    persistSeat(code, res.seatId);
    clearInterval(lobbyTimer);
    // Show the waiting view and watch until the countdown ends, then join game.
    show($('lobby'));
    showJoinPane();
    $('room-code').textContent = code;
    const link = shareLinkFor(code, res.seatId);
    $('share-link').textContent = link;
    $('share-link').href = link;
    $('room-info').classList.remove('hidden');
    watchRoom();
    state.pollTimer = setInterval(watchRoom, 1500);
    return;
  }
  joinRematch(code);
}

async function joinRematch(code) {
  const res = await fetch('/api/room/join-rematch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name: state.lobbyName || $('lobby-name').value.trim() || 'Player' }),
  }).then((r) => r.json());
  if (res.error) { alert(res.error); return; }
  state.code = res.code;
  state.seatId = res.seatId;
  persistSeat(res.code, res.seatId);
  clearInterval(lobbyTimer);
  enterGame();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('btn-lobby-enter').onclick = enterLobby;
$('lobby-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') enterLobby(); });
$('btn-lobby-chat-send').onclick = async () => {
  const input = $('lobby-chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await fetch('/api/lobby/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: state.lobbyToken, text }),
  }).catch(() => null);
  await lobbyPoll();
};
$('lobby-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-lobby-chat-send').click(); });
$('btn-match-next').onclick = () => { matchIdx++; lobbyPoll(); };

// Create / Join from the lobby route into the room-setup screen.
$('btn-go-create').onclick = () => {
  clearInterval(lobbyTimer);
  show($('lobby'));
  showCreatePane();
};
// Learning session: one tap starts a didactic tutorial game — 1 novice (you)
// (Leave-lobby handler is wired below. The old "Learning session" lobby button
// was removed — the tutorial is launched from the Rules overlay's
// "Start tutorial match" button instead. Keep this guarded in case the id
// returns later, but do not let a missing element crash startup.)
const goLearn = $('btn-go-learn');
if (goLearn) goLearn.onclick = () => {
  clearInterval(lobbyTimer);
  createRoom('private', 2, true, true);
};
$('btn-go-join').onclick = () => {
  const name = state.lobbyName || $('lobby-name').value.trim();
  $('join-name').value = name;
  clearInterval(lobbyTimer);
  show($('lobby'));
  showJoinPane();
};
$('btn-go-join-2').onclick = () => {
  const name = state.lobbyName || $('lobby-name').value.trim();
  $('join-name').value = name;
  showJoinPane();
};
$('back-to-create').onclick = showCreatePane;
function goToLobby() {
  clearInterval(state.pollTimer);
  state.code = null;
  state.seatId = null;
  show($('globby'));
  $('lobby-main').classList.remove('hidden');
  $('lobby-enter').classList.add('hidden');
  lobbyPoll();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(lobbyPoll, 2000);
}
$('btn-back-lobby').onclick = goToLobby;

// Gameplay rules screen: a black, in-game-styled reference of every rule (no
// numbers; bold titles). Opens from the lobby; no voice yet — just readable.
function renderGameplayRules() {
  const wrap = $('gameplay-rules');
  wrap.innerHTML = '';
  for (const r of rulesForLang(lang)) {
    const block = document.createElement('div');
    block.className = 'rule-block';
    const title = document.createElement('span');
    title.className = 'rule-title';
    title.textContent = r.title;
    const body = document.createElement('span');
    body.className = 'rule-body';
    body.textContent = r.body;
    block.appendChild(title);
    block.appendChild(body);
    wrap.appendChild(block);
  }
};
$('btn-gameplay').onclick = () => {
  clearInterval(lobbyTimer);
  renderGameplayRules();
  show($('gameplay'));
};
// Language is handled globally by the .lang-btn handler (lobby + gameplay share
// the same lang state), so the gameplay toggle just needs the rules re-render.
$('btn-lang-en').onclick = () => renderGameplayRules();
$('btn-lang-es').onclick = () => renderGameplayRules();
$('btn-gameplay-close').onclick = () => {
  show($('globby'));
  $('lobby-main').classList.remove('hidden');
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(lobbyPoll, 2000);
};
// Top-bar Rules pill (next to Leave) opens the same Gameplay rules overlay.
$('btn-rules-top').onclick = () => {
  clearInterval(lobbyTimer);
  renderGameplayRules();
  show($('gameplay'));
};
// Inside the rules overlay: launch the optional tutorial match (readable rules
// only — no voice). Closes the overlay and starts a Learning session.
$('btn-gameplay-tutorial').onclick = () => {
  clearInterval(lobbyTimer);
  createRoom('private', 2, true, true);
};

// Leave the global lobby entirely: drop the name + token on the server, clear
// localStorage, stop polling, and return to the landing (name-entry) screen.
$('btn-leave-lobby').onclick = async () => {
  if (!window.confirm('Leave the lobby? You will return to the landing page.')) return;
  await fetch('/api/lobby/leave', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: state.lobbyToken }),
  }).catch(() => null);
  clearInterval(lobbyTimer);
  clearLobby();
  state.lobbyToken = null;
  state.lobbyName = null;
  show($('globby'));
  $('lobby-main').classList.add('hidden');
  $('lobby-enter').classList.remove('hidden');
  $('lobby-name').value = '';
  $('lobby-msg').textContent = '';
  $('lobby-name').focus();
};

// ----------------------------------------------------------- boot
// ALWAYS start on the landing page (name + language) first, never auto-resume
// into the lobby — that confused people who expected the entry screen.
(function boot() {
  show($('globby'));
  $('lobby-enter').classList.remove('hidden');
  $('lobby-main').classList.add('hidden');
  $('lobby-name').value = '';
  $('lobby-name').focus();
})();

window.__isWild = (c) => c.suit === 'Oros' && c.rank === 1;
window.__cardVal = (c) => (c.rank <= 7 ? c.rank : 10);
applyLang();

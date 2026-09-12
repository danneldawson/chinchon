const { createRoom } = require('./server.js')._internals;

// create a room in lobby (no state yet)
const room = createRoom('TESTCODE', 'hostId', 'Host', false, 'public', false);
// room is pending, state is undefined

const view = require('./server.js')._internals.serialize(room, 'hostId');
console.log('View keys:', Object.keys(view).sort());
// Ensure expected keys exist
const expected = [
  'code','mode','learning','tutorial','tutorialRuleIndex','tutorialPaused',
  'started','gameOver','pending','chinchonWin','winner','hostId','isHost',
  'spectator','waiting','phase','turnSeat','isYourTurn','layoff','stockCount',
  'lastReshuffle','discardTop','yourHand','lastDrawnId','yourMelds','yourDeadwood',
  'closeOptions','canClose','opponents','scoreboard','chat','aloneNotice','sessionToken'
];
const missing = expected.filter(k => !(k in view));
console.log('Missing keys:', missing);
console.log('View:', JSON.stringify(view, null, 2));
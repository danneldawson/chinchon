#!/usr/bin/env node
'use strict';

// Chinchon — playable in the terminal.
//   node play.js            2 players (you + 1 bot)
//   node play.js 4          you + 3 bots



const { createInput } = require('./src/input');

const { cardValue } = require('./src/cards');
const { bestSplit, canClose } = require('./src/scoring');
const {
  startRound, topOfDiscard, drawFromStock, drawFromDiscard,
  discardCard, closeOptions, nextDealer,
} = require('./src/turn');
const {
  beginLayoff, currentPlayer, layMeld, attachCard, declareReady, suggest,
} = require('./src/layoff-interactive');
const { createMatch, applyRound, activePlayers } = require('./src/match');
const { chooseDraw, chooseTurn, planLayoff, findAttach } = require('./src/bot');
const R = require('./src/render');

const YOU = 0;

const io = createInput();
const ask = io.ask;
const pause = (q = `${R.DIM}(enter)${R.RESET} `) => ask(q);

function clear() {
  if (io.scripted) { console.log(''); return; }
  process.stdout.write('\x1b[2J\x1b[H');
}

// ---------------------------------------------------------------- display

function showTable(state, match) {
  console.log(R.rule('═'));
  console.log(R.title('  CHINCHÓN'));
  console.log(R.rule('═'));
  console.log(R.scoreboard(match));
  console.log(R.rule());
  console.log(`  Stock: ${state.stock.length} cards     Discard: ${R.card(topOfDiscard(state))}`);
  console.log(R.rule());
}

function showHand(state) {
  const h = state.hands[YOU];
  const split = bestSplit(h);
  console.log(`\n${R.title('  Your hand:')}`);
  console.log('  ' + R.hand(h).split('\n').join('\n  '));

  if (split.melds.length > 0) {
    console.log(`\n  ${R.DIM}Combinations found:${R.RESET}`);
    for (const m of split.melds) console.log(`    ${R.meld(m)}`);
  }
  console.log(`  ${R.DIM}Deadwood: ${split.deadwood} pts${R.RESET}\n`);
}

// ---------------------------------------------------------------- your turn

function showHelp() {
  console.log(`
${R.rule()}
${R.title('  QUICK HELP')}
${R.rule()}
  Suits:  ${R.DIM}● Oros   ♥ Copas   ♠ Espadas   ♣ Bastos${R.RESET}
  ${R.DIM}* after a card = wild (1 de Oros)${R.RESET}

  ${R.title('Draw:')}     s = stock (unknown)   d = discard (face up)
  ${R.title('Discard:')}  a number, e.g. 3
  ${R.title('Close:')}    c 3   ${R.DIM}(only when the game says you can)${R.RESET}
  ${R.title('Lay-off:')}  auto  then  r
  ${R.title('Help:')}     ?

  ${R.DIM}Combinations: 3+ cards. Run = same suit in order (7-10-11-12
  are consecutive). Set = same number. One wild per combination.${R.RESET}

  ${R.DIM}Closing needs two combinations. 4+3 = -10 pts.
  3+3 with one card left over = that card must be 5 or lower.${R.RESET}

  ${R.DIM}Cards 1-7 cost face value. 10, 11, 12 cost 10 each.
  101 or more and you are out.${R.RESET}
${R.rule()}
  Full sheet: ${R.DIM}~/Desktop/chinchon/CHEATSHEET.md${R.RESET}
`);
}

async function yourTurn(state, match) {
  clear();
  showTable(state, match);
  showHand(state);

  // DRAW
  const top = topOfDiscard(state);
  let drew;
  for (;;) {
    const a = (await ask(
      `  Draw from ${R.title('[s]')}tock or ${R.title('[d]')}iscard (${R.card(top)})? `,
    )).toLowerCase();

    if (a === '?') { showHelp(); continue; }
    if (a === 's' || a === '') { drew = drawFromStock(state); break; }
    if (a === 'd') {
      drew = drawFromDiscard(state);
      if (!drew.ok) { console.log(`  ${drew.reason}`); continue; }
      break;
    }
    console.log('  Type s or d.');
  }

  if (!drew.ok) {
    console.log(`\n  ${drew.reason}`);
    return;
  }

  console.log(`\n  You drew ${R.card(drew.card)}`);
  showHand(state);

  // DISCARD
  const opts = closeOptions(state);
  if (opts.length > 0) {
    console.log(`  ${R.BOLD}You can CLOSE this turn.${R.RESET}`);
    for (const o of opts) {
      const label = o.reason === 'chinchon'
        ? `${R.BOLD}CHINCHÓN — wins the whole game${R.RESET}`
        : `score ${o.score}`;
      console.log(`    throw ${R.card(o.discard)} → ${label}`);
    }
    console.log('');
  }

  for (;;) {
    const a = await ask('  Discard which card? (number, "c N" to close, ? for help) ');
    if (a === '?') { showHelp(); continue; }
    const closing = a.toLowerCase().startsWith('c');
    const numText = closing ? a.slice(1).trim() : a;
    const idx = parseInt(numText, 10) - 1;

    const hand = state.hands[YOU];
    if (Number.isNaN(idx) || idx < 0 || idx >= hand.length) {
      console.log('  Pick a card number from your hand.');
      continue;
    }

    const res = discardCard(state, hand[idx], closing);
    if (!res.ok) { console.log(`  ${res.reason}`); continue; }

    if (res.falseClose) {
      console.log(`\n  ${R.BOLD}FALSE CLOSE${R.RESET} — ${res.reason}`);
      console.log(`  Your hand is now shown to everyone. Play continues.`);
      await pause();
    } else if (res.closed) {
      console.log(`\n  ${R.BOLD}You closed the round.${R.RESET}`);
      await pause();
    }
    return;
  }
}

// ---------------------------------------------------------------- bot turn

function botTurn(state, log) {
  const p = state.turn;
  const name = `Bot ${p}`;

  if (chooseDraw(state) === 'discard') {
    const took = topOfDiscard(state);
    drawFromDiscard(state);
    log.push(`${name} took ${R.card(took)} from the discard pile`);
  } else {
    const res = drawFromStock(state);
    if (!res.ok) return;
    log.push(`${name} drew from the stock`);
  }

  const decision = chooseTurn(state);
  const res = discardCard(state, decision.card, decision.close);

  if (res.closed) {
    log.push(`${R.BOLD}${name} CLOSED the round${R.RESET}`);
  } else {
    log.push(`${name} discarded ${R.card(decision.card)}`);
  }
}

// ---------------------------------------------------------------- lay-off

async function runLayoff(state, match) {
  const active = match.players.map((p, i) => i).filter((i) => !match.players[i].out);
  const lay = beginLayoff(state.hands, state.closerIndex, active);

  const who = state.closerIndex === YOU
    ? 'YOU closed the round'
    : `${match.players[state.closerIndex].name} CLOSED the round`;

  clear();
  console.log(R.rule('═'));
  console.log(R.title(`  ROUND OVER — ${who}`));
  console.log(R.rule('═'));

  if (state.closerIndex !== YOU) {
    console.log(`\n  ${R.DIM}They had a complete game, so the round ends here.`);
    console.log(`  Everything left in your hand now counts against you —`);
    console.log(`  unless you can lay it off onto the table below.${R.RESET}`);
  }

  if (!lay.valid) {
    console.log(`  False close: ${lay.reason}. Nobody scores.`);
    await pause();
    return null;
  }

  if (lay.chinchon) {
    console.log(`\n  ${R.BOLD}¡CHINCHÓN!${R.RESET}  ${R.cards(lay.table[0])}`);
    console.log(`  ${match.players[lay.winner].name} wins the entire game.\n`);
    await pause();
    return lay;
  }

  console.log(`\n  On the table:`);
  console.log(R.table(lay.table));

  while (lay.phase === 'layoff') {
    const p = currentPlayer(lay);

    if (p === YOU) {
      await yourLayoff(lay);
    } else {
      // Bot lays everything it can, then declares.
      const plan = planLayoff(lay, p);
      for (const m of plan.melds) layMeld(lay, m);
      for (const c of [...lay.remaining[p]]) {
        const idx = findAttach(lay.table, c);
        if (idx !== -1) attachCard(lay, c, idx);
      }
      const r = declareReady(lay);
      console.log(`\n  ${match.players[p].name} is counted: ${R.BOLD}${r.score}${R.RESET} pts`);
    }
  }

  console.log(`\n${R.rule()}`);
  console.log(R.title('  Round scores'));
  lay.scores.forEach((s, i) => {
    console.log(`    ${match.players[i].name.padEnd(10)} ${String(s).padStart(4)}`);
  });
  await pause();
  return lay;
}

async function yourLayoff(lay) {
  for (;;) {
    console.log(`\n${R.rule()}`);
    console.log(R.title('  Your turn to lay off'));
    console.log(`\n  Table:`);
    console.log(R.table(lay.table));

    const mine = lay.remaining[YOU];
    if (mine.length === 0) {
      console.log(`\n  ${R.BOLD}Nothing left in your hand.${R.RESET}`);
      declareReady(lay);
      return;
    }

    console.log(`\n  Still in your hand:`);
    console.log('  ' + R.hand(mine).split('\n').join('\n  '));
    console.log(`  ${R.DIM}Costs you ${mine.reduce((s, c) => s + cardValue(c), 0)} pts if you stop now${R.RESET}`);

    const advice = suggest(lay, YOU);
    if (advice.melds.length > 0) {
      console.log(`\n  ${R.DIM}You could lay:${R.RESET}`);
      for (const m of advice.melds) console.log(`    ${R.meld(m)}`);
    }
    if (advice.attachable.length > 0) {
      console.log(`  ${R.DIM}You could attach:${R.RESET}`);
      for (const a of advice.attachable) {
        console.log(`    ${R.card(a.card)} → table ${a.meldIndex + 1}`);
      }
    }

    console.log(`\n  ${R.title('[l]')} lay a combination   ${R.title('[a]')} attach a card   ${R.title('[auto]')} do it all   ${R.title('[r]')} ready`);
    const a = (await ask('  > ')).toLowerCase();

    if (a === '?') { showHelp(); continue; }
    if (a === 'r') {
      declareReady(lay);
      return;
    }

    if (a === 'auto') {
      for (const m of advice.melds) layMeld(lay, m);
      for (const c of [...lay.remaining[YOU]]) {
        const idx = findAttach(lay.table, c);
        if (idx !== -1) attachCard(lay, c, idx);
      }
      continue;
    }

    if (a === 'l') {
      const pick = await ask('  Card numbers for the combination (e.g. 1 2 3): ');
      const idxs = pick.split(/\s+/).map((n) => parseInt(n, 10) - 1);
      const chosen = idxs.map((i) => mine[i]).filter(Boolean);
      const res = layMeld(lay, chosen);
      console.log(res.ok ? '  Laid down.' : `  ${res.reason}`);
      continue;
    }

    if (a === 'a') {
      const cardNum = parseInt(await ask('  Which card number? '), 10) - 1;
      const meldNum = parseInt(await ask('  Onto which table combination? '), 10) - 1;
      const chosen = mine[cardNum];
      if (!chosen) { console.log('  No such card.'); continue; }
      const res = attachCard(lay, chosen, meldNum);
      console.log(res.ok ? '  Attached.' : `  ${res.reason}`);
      continue;
    }

    console.log('  Type l, a, auto or r.');
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const playerCount = Math.min(7, Math.max(2, parseInt(process.argv[2], 10) || 2));
  const names = ['You', ...Array.from({ length: playerCount - 1 }, (_, i) => `Bot ${i + 1}`)];
  const match = createMatch(names);

  clear();
  console.log(R.rule('═'));
  console.log(R.title('  CHINCHÓN'));
  console.log(R.rule('═'));
  console.log(`  ${playerCount} players. First to 101 is out. Last one standing wins.`);
  console.log(`  ${R.DIM}Wild card: 1 de Oros (marked *)${R.RESET}`);
  await pause('\n  (enter to deal) ');

  let dealer = null;

  while (!match.gameOver) {
    const active = match.players.map((p, i) => i).filter((i) => !match.players[i].out);
    const state = startRound(playerCount, Math.random, dealer, active);
    dealer = state.dealer;
    const log = [];

    console.log(`\n  ${R.DIM}${match.players[state.dealer].name} deals. `
      + `${match.players[state.turn].name} plays first.${R.RESET}`);
    console.log(`  ${R.DIM}Face-up card: ${R.RESET}${R.card(topOfDiscard(state))}`);
    await pause();

    while (state.phase === 'draw' || state.phase === 'discard') {
      if (match.players[state.turn].out) {
        state.turn = (state.turn + 1) % playerCount;
        continue;
      }

      if (state.turn === YOU && !match.players[YOU].out) {
        if (log.length > 0) {
          clear();
          showTable(state, match);
          console.log(`\n  ${R.DIM}Since your last turn:${R.RESET}`);
          for (const line of log) console.log(`    ${line}`);
          log.length = 0;
          await pause('\n  (enter) ');
        }
        await yourTurn(state, match);
      } else {
        botTurn(state, log);
      }
    }

    if (state.phase !== 'closed') {
      console.log('\n  Stock ran out. Redealing.');
      dealer = nextDealer(state);
      await pause();
      continue;
    }

    // Show everything that happened since your last turn, including the close.
    if (log.length > 0) {
      clear();
      showTable(state, match);
      console.log(`\n  ${R.DIM}Since your last turn:${R.RESET}`);
      for (const line of log) console.log(`    ${line}`);
      log.length = 0;
      await pause('\n  (enter) ');
    }

    const lay = await runLayoff(state, match);
    if (!lay || !lay.valid) continue;

    applyRound(match, lay.chinchon
      ? { valid: true, chinchon: true, winner: lay.winner, scores: lay.scores }
      : { valid: true, chinchon: false, scores: lay.scores });

    clear();
    console.log(R.rule('═'));
    console.log(R.title('  STANDINGS'));
    console.log(R.rule('═'));
    console.log(R.scoreboard(match));
    console.log('');

    for (const p of match.players) {
      if (p.out) console.log(`  ${R.BOLD}${p.name} is eliminated.${R.RESET}`);
    }

    dealer = nextDealer(state);

    if (!match.gameOver) await pause('\n  (enter for next round) ');
  }

  console.log(`\n${R.rule('═')}`);
  console.log(R.title(`  ${match.players[match.winner].name} WINS`));
  console.log(R.rule('═') + '\n');
  io.close();
}

main().catch((err) => {
  console.error(err);
  io.close();
  process.exit(1);
});

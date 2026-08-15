'use strict';

// Terminal rendering: Spanish suits, coloured, with card indexes.

const { isWild, cardValue } = require('./cards');

const SUIT_ICON = {
  Oros: '●',      // gold coin
  Copas: '♥',     // cup
  Espadas: '♠',   // sword
  Bastos: '♣',    // club
};

const SUIT_COLOR = {
  Oros: '\x1b[33m',    // yellow
  Copas: '\x1b[31m',   // red
  Espadas: '\x1b[36m', // cyan
  Bastos: '\x1b[32m',  // green
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

function card(c) {
  if (!c) return `${DIM}--${RESET}`;
  const color = SUIT_COLOR[c.suit] || '';
  const icon = SUIT_ICON[c.suit] || '?';
  const wild = isWild(c) ? `${BOLD}*${RESET}` : '';
  return `${color}${c.rank}${icon}${RESET}${wild}`;
}

function cards(list) {
  return list.map(card).join(' ');
}

// Hand with 1-based selection numbers underneath.
function hand(list) {
  const top = list.map((c, i) => {
    const s = card(c);
    return s.padEnd(s.length + (String(i + 1).length > 2 ? 0 : 0));
  });
  const nums = list.map((_, i) => `${DIM}${String(i + 1).padStart(2)}${RESET}`);

  // Align numbers under cards by using a fixed column width.
  const width = 5;
  const cardRow = list.map((c) => {
    const plain = `${c.rank}${SUIT_ICON[c.suit]}${isWild(c) ? '*' : ''}`;
    const pad = ' '.repeat(Math.max(0, width - plain.length));
    return card(c) + (isWild(c) ? '' : '') + pad;
  }).join('');
  const numRow = list.map((_, i) => {
    const label = String(i + 1);
    return `${DIM}${label}${RESET}` + ' '.repeat(Math.max(0, width - label.length));
  }).join('');

  return `${cardRow}\n${numRow}`;
}

function meld(list) {
  return `[ ${cards(list)} ]`;
}

function table(melds) {
  if (melds.length === 0) return `${DIM}(nothing on the table)${RESET}`;
  return melds.map((m, i) => `  ${DIM}${i + 1}.${RESET} ${meld(m)}`).join('\n');
}

function deadwood(list) {
  const total = list.reduce((s, c) => s + cardValue(c), 0);
  return `${cards(list)}  ${DIM}= ${total} pts${RESET}`;
}

function scoreboard(match) {
  const rows = match.players.map((p, i) => {
    const status = p.out ? `${DIM}OUT${RESET}` : `${p.total}`;
    const name = p.name.padEnd(10);
    const bar = p.out ? '' : ' ' + '█'.repeat(Math.max(0, Math.round(p.total / 5)));
    return `  ${name} ${String(status).padStart(4)}${DIM}${bar}${RESET}`;
  });
  return rows.join('\n');
}

function rule(char = '─', width = 52) {
  return `${DIM}${char.repeat(width)}${RESET}`;
}

function title(text) {
  return `${BOLD}${text}${RESET}`;
}

module.exports = {
  card, cards, hand, meld, table, deadwood, scoreboard, rule, title,
  DIM, BOLD, RESET,
};

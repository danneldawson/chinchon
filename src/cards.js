'use strict';

// Chinchón — card model
// Two Spanish decks of 40 shuffled together = 80 cards. Every card exists twice.
// The 1 de Oros is the wild card (comodín). There are exactly 2 of them.
// 8 and 9 do not exist. Runs treat 7 -> 10 -> 11 -> 12 as consecutive.

const SUITS = ['Oros', 'Copas', 'Espadas', 'Bastos'];

// Rank order for runs. Index position is what matters, not the printed number.
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const WILD_SUIT = 'Oros';
const WILD_RANK = 1;

function isWild(card) {
  return card.rank === WILD_RANK && card.suit === WILD_SUIT;
}

// Deadwood value: 1-7 face value, 10/11/12 are worth 10 each.
function cardValue(card) {
  return card.rank <= 7 ? card.rank : 10;
}

function rankIndex(rank) {
  return RANKS.indexOf(rank);
}

function cardName(card) {
  return `${card.rank} de ${card.suit}${isWild(card) ? ' (wild)' : ''}`;
}

// Build one 40-card Spanish deck.
function buildSingleDeck(deckId) {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, deckId, id: `${rank}-${suit}-${deckId}` });
    }
  }
  return deck;
}

// Full 80-card game deck (two decks combined).
function buildDeck() {
  return [...buildSingleDeck(0), ...buildSingleDeck(1)];
}

function shuffle(array, rng = Math.random) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = {
  SUITS,
  RANKS,
  WILD_SUIT,
  WILD_RANK,
  isWild,
  cardValue,
  rankIndex,
  cardName,
  buildSingleDeck,
  buildDeck,
  shuffle,
};

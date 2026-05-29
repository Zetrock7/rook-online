// deck.js — builds and manages the Rook card deck
// A standard Rook deck has 4 colored suits (Red, Yellow, Green, Black)
// with cards numbered 1–14, plus the Rook bird card (acts as a trump)

const SUITS = ["Red", "Yellow", "Green", "Black"];
const MIN_VALUE = 1;
const MAX_VALUE = 14;

/**
 * Builds a full Rook deck (56 cards + Rook bird card = 57 total)
 * Each card: { suit, value, id }
 */
function buildDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (let value = MIN_VALUE; value <= MAX_VALUE; value++) {
      deck.push({
        id: `${suit}-${value}`,
        suit,
        value,
        isRook: false,
      });
    }
  }

  // Add the Rook bird card (the wildcard trump)
  deck.push({
    id: "Rook",
    suit: null,
    value: 0,
    isRook: true,
  });

  return deck; // 57 cards total
}

/**
 * Shuffles a deck in place using Fisher-Yates algorithm
 */
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deals cards evenly to players, with remainder going to the "nest" (kitty)
 * @param {Array} deck - shuffled deck
 * @param {number} playerCount - number of players (typically 4)
 * @param {number} nestSize - how many cards go to the nest (typically 5)
 * @returns {{ hands: Array[], nest: Array }}
 */
function dealCards(deck, playerCount = 4, nestSize = 5) {
  const shuffled = shuffleDeck(deck);
  const nest = shuffled.splice(0, nestSize); // first N cards go to nest
  const hands = Array.from({ length: playerCount }, () => []);

  shuffled.forEach((card, i) => {
    hands[i % playerCount].push(card);
  });  

  return { hands, nest };
}

/**
 * Returns the point value of a card for scoring
 * In standard Rook: 5s = 5pts, 10s and 14s = 10pts, Rook = 20pts
 */
function getCardPoints(card) {
  if (card.isRook) return 20;
  if (card.value === 5) return 5;
  if (card.value === 10 || card.value === 14) return 10;
  if (card.value === 1) return 15; // Optional: treat Ones as 15 points
  return 0;
}

/**
 * Returns total points in a set of cards (e.g. tricks won)
 */
function countPoints(cards) {
  return cards.reduce((total, card) => total + getCardPoints(card), 0);
}

module.exports = { buildDeck, shuffleDeck, dealCards, getCardPoints, countPoints };
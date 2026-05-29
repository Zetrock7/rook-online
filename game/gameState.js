// gameState.js — handles bidding, trick-taking, and scoring logic
const { countPoints } = require("./deck");
const { getPlayer, getNextPlayerIndex } = require("./room");

const MIN_BID = 50;
const MAX_BID = 180; // total points in a deck
const BID_INCREMENT = 5;

// ─── BIDDING ─────────────────────────────────────────────────────────────────

/**
 * Places a bid for a player. Returns updated room or error.
 * Pass bid = null to "pass" (sit out of bidding)
 */
function placeBid(room, socketId, bid) {
  if (room.state !== "bidding") return { error: "Not in bidding phase" };
  if (room.currentTurn !== socketId) return { error: "Not your turn to bid" };

  const player = getPlayer(room, socketId);
  if (!player) return { error: "Player not found" };

  if (bid !== null) {
    if (bid < MIN_BID) return { error: `Minimum bid is ${MIN_BID}` };
    if (bid % BID_INCREMENT !== 0) return { error: `Bids must be in multiples of ${BID_INCREMENT}` };
    if (bid <= room.currentBid) return { error: "Bid must be higher than current bid" };

    room.currentBid = bid;
    room.highBidder = socketId;
    player.bid = bid;
  } else {
    player.bid = "pass";
  }

  // Check if bidding is over (all players have bid or passed)
  const stillBidding = room.players.filter((p) => p.bid === null);
  const activeBidders = room.players.filter((p) => p.bid !== "pass" && p.bid !== null);

  if (stillBidding.length === 0 && activeBidders.length === 1) {
    // Bidding over — move to nest swap phase
    room.state = "nestSwap";
    room.currentTurn = room.highBidder;
  } else {
    // Next player's turn (skip players who have passed)
    let nextIdx = getNextPlayerIndex(room, socketId);
    let loopCount = 0;
    while (room.players[nextIdx].bid === "pass" && loopCount < room.players.length) {
      nextIdx = getNextPlayerIndex(room, room.players[nextIdx].id);
      loopCount++;
    }
    room.currentTurn = room.players[nextIdx].id;
  }

  return room;
}

// ─── NEST SWAP ────────────────────────────────────────────────────────────────

/**
 * High bidder swaps cards with the nest, then declares trump
 * @param {Object} room
 * @param {string} socketId
 * @param {string[]} cardIdsToDiscard - card ids the player wants to put back
 * @param {string} trumpSuit - "Red" | "Yellow" | "Green" | "Black"
 */
function swapNest(room, socketId, cardIdsToDiscard, trumpSuit) {
  if (room.state !== "nestSwap") return { error: "Not in nest swap phase" };
  if (room.currentTurn !== socketId) return { error: "Only the high bidder can swap the nest" };
  if (!["Red", "Yellow", "Green", "Black"].includes(trumpSuit)) {
    return { error: "Invalid trump suit" };
  }
  if (cardIdsToDiscard.length !== room.nest.length) {
    return { error: `Must discard exactly ${room.nest.length} cards` };
  }

  const player = getPlayer(room, socketId);

  // Give player the nest cards
  player.hand = [...player.hand, ...room.nest];

  // Remove discarded cards from hand
  const discarded = cardIdsToDiscard.map((id) => {
    const card = player.hand.find((c) => c.id === id);
    if (!card) throw new Error(`Card ${id} not found in hand`);
    return card;
  });

  player.hand = player.hand.filter((c) => !cardIdsToDiscard.includes(c.id));
  room.nest = discarded; // discarded cards go back to nest (count for high bidder's score)

  room.trumpSuit = trumpSuit;
  room.state = "playing";
  room.currentTurn = room.highBidder; // high bidder leads first trick
  room.currentTrick = [];

  return room;
}

// ─── TRICK TAKING ─────────────────────────────────────────────────────────────

/**
 * Plays a card from a player's hand into the current trick
 */
function playCard(room, socketId, cardId) {
  
  if (room.state !== "playing") return { error: "Game is not in playing phase" };
  if (room.currentTurn !== socketId) return { error: "Not your turn" };

  const player = getPlayer(room, socketId);
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return { error: "Card not in your hand" };

  const playedCard = player.hand[cardIndex]; // Get the actual card object

  // Validate follow-suit rule
  const ledSuit = room.currentTrick[0]?.card.suit;
  if (ledSuit) {
    const trumpLed = ledSuit === room.trumpSuit; // Added 'const' here
    
    let followingSuit;
    let canFollowSuit;

    if (trumpLed) {
        followingSuit = playedCard.suit === room.trumpSuit || playedCard.isRook;
        canFollowSuit = player.hand.some((c) => c.suit === room.trumpSuit) || player.hand.some((c) => c.isRook);
    } else {
        followingSuit = playedCard.suit === ledSuit;
        canFollowSuit = player.hand.some((c) => c.suit === ledSuit);
    }

    if (!followingSuit && canFollowSuit) {
      return { error: "Must follow suit if possible" };
    }
  }

  // Remove card from hand and add to trick
  const [card] = player.hand.splice(cardIndex, 1);
  room.currentTrick.push({ playerId: socketId, card });

  // If all 4 players have played, resolve the trick
  if (room.currentTrick.length === room.players.length) {
    return resolveTrick(room);
  }

  // Next player's turn
  const nextIdx = getNextPlayerIndex(room, socketId);
  room.currentTurn = room.players[nextIdx].id;

  return room;
}

/**
 * Determines who won the current trick and awards the cards
 */
function resolveTrick(room) {
  const trick = room.currentTrick;
  const ledSuit = trick[0].card.suit;
  const trump = room.trumpSuit;

  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const challenger = trick[i];
    winner = compareCards(winner, challenger, ledSuit, trump);
  }

  // Award trick cards to winner
  const winnerPlayer = getPlayer(room, winner.playerId);

  room.lastTrick = trick;
  room.lastTrickWinner = winnerPlayer.id;

  room.state = "sweep"; // Move to sweep phase where winner can collect cards before next trick

  return room;
}

function sweepTrick(room, socketId) {
  if (room.state !== "sweep") return { error: "No trick to sweep" };
  if (socketId !== room.lastTrickWinner) return { error: "Only the trick winner can sweep" };

  const trick = room.currentTrick;
  const winnerPlayer = getPlayer(room, room.lastTrickWinner);
  winnerPlayer.tricks.push(...trick.map((t) => t.card));

  room.currentTrick = [];
  room.currentTurn = room.lastTrickWinner;
  room.state = "playing";

  const handsEmpty = room.players.every((p) => p.hand.length === 0);
  if (handsEmpty) return scoreHand(room);

  return room;
}

/**
 * Compares two played cards, returns the winner
 */
function compareCards(current, challenger, ledSuit, trump) {
  const c = current.card;
  const ch = challenger.card;

  if(ledSuit === trump) {
    if (c.value === 1 && c.suit === trump) return current; // 1 of trump is highest card
    if (ch.value === 1 && ch.suit === trump) return challenger;
    if ((c.suit === trump || c.isRook) && ch.suit !== trump) return current; // Rook or trump beats non-trump
    if ((ch.suit === trump || ch.isRook) && c.suit !== trump) {
        return { error: "Invalid state: challenger is trump but current isn't?" };
        // Should never happen since the current card should be a trump since trump was led and only trump beats trump
    }
    if((c.suit === trump || c.isRook) && (ch.suit === trump || ch.isRook)) { // Both trump, higher value wins
      // Note: can use the comparison logic here, since Rook has lowest value of 0, and 1, despite only having a value of 1
      // already wins since we took care of that logic earlier
      return c.value > ch.value ? current : challenger;
    }
    return { error: "Invalid state: led suit is trump but current card isn't trump?" };
    // Should never happen since current should be a trump, so we shouldn't have a case of comparing
    // non-trump to non-trump when trump is led
  } else { 
    if(c.suit === trump && c.value === 1) return current; // 1 of trump beats everything
    if(ch.suit === trump && ch.value === 1) return challenger;
    if(c.suit === trump && ch.suit === trump) return c.value > ch.value ? current : challenger; // Both trump, higher value wins
    if(c.suit === trump && ch.suit !== trump) return current; // Trump beats non-trump + Rook
    if(ch.suit === trump && c.suit !== trump) return challenger;
    if(c.isRook) return current; // Rook beats everything remaining (non-trumps)
    if(ch.isRook) return challenger;
    if(c.suit === ledSuit && c.value === 1) return current; // 1 of led suit beats all other non-trumps
    if(ch.suit === ledSuit && ch.value === 1) return challenger; 
    if(c.suit === ledSuit && ch.suit === ledSuit) return c.value > ch.value ? current : challenger; // Both follow suit, higher value wins
    if(c.suit === ledSuit && ch.suit !== ledSuit) return current; // Follow suit beats non-follow suit
    if(ch.suit === ledSuit && c.suit !== ledSuit) return challenger;
    return { error: "Invalid state: neither card is following suit or is trump" };
    // Should never happen since current must either be the led suit or trump or Rook, since if it was led it has to be of led suit
    // and if it wasn't led, then it has to be trump, Rook, or led suit to win over the first card
  }
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

/**
 * Scores the hand at the end of all tricks
 * Teams: players 0 & 2 = Team A, players 1 & 3 = Team B
 */
function scoreHand(room) {
  room.state = "scoring";

  const teamA = [room.players[0], room.players[2]];
  const teamB = [room.players[1], room.players[3]];

  const highBidderPlayer = getPlayer(room, room.highBidder);
  const highBidderTeam = teamA.find((p) => p.id === room.highBidder) ? teamA : teamB;
  // highBidderTeam[0].tricks.push(...room.nest);

  
  const lastTrickWinningTeam = teamA.find((p) => p.id === room.currentTurn) ? teamA : teamB;
  lastTrickWinningTeam[0].tricks.push(...room.nest);

  const teamACards = teamA.flatMap((p) => p.tricks);
  const teamBCards = teamB.flatMap((p) => p.tricks);

  const teamAPoints = countPoints(teamACards);
  const teamBPoints = countPoints(teamBCards);

  // Did the high bidder's team make their bid?
  const bidTeamPoints = highBidderTeam === teamA ? teamAPoints : teamBPoints;
  const bidMade = bidTeamPoints >= room.currentBid;

  if (highBidderTeam === teamA) {
    room.scores.teamA = (room.scores.teamA || 0) + (bidMade ? teamAPoints : -room.currentBid);
    room.scores.teamB = (room.scores.teamB || 0) + teamBPoints;
  } else {
    room.scores.teamB = (room.scores.teamB || 0) + (bidMade ? teamBPoints : -room.currentBid);
    room.scores.teamA = (room.scores.teamA || 0) + teamAPoints;
  }

  room.lastHandResult = {
    teamAPoints,
    teamBPoints,
    bid: room.currentBid,
    bidMade,
    highBidder: highBidderPlayer.username,
    trumpSuit: room.trumpSuit,
    nestCards: [...room.nest], // save before clearing
  };

  room.highBidder = null;
  room.currentBid = 0;
  room.trumpSuit = null;
  const currentIndex = room.players.findIndex(p => p.id === room.firstBidder);
  const nextIndex = (currentIndex + 1) % room.players.length;
  room.firstBidder = room.players[nextIndex].id;
  room.nest = [];
  room.currentTrick = [];
  room.handNumber += 1;
  room.lastTrick = [];
  room.lastTrickWinner = null;

  return room;
}

module.exports = { placeBid, swapNest, playCard, sweepTrick, MIN_BID, MAX_BID, BID_INCREMENT };
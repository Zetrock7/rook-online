// room.js — manages rooms and players
const { buildDeck, dealCards } = require("./deck");

/**
 * Creates a fresh room object
 */
function createRoom(roomId) {
  return {
    id: roomId,
    players: [],       // { id, username, hand, tricks }
    nest: [],          // the kitty/nest cards
    state: "waiting",  // waiting | bidding | nestSwap | playing | scoring
    currentBid: 0,
    highBidder: null,
    trumpSuit: null,
    currentTrick: [],  // cards played in the current trick
    currentTurn: null, // socket id of whose turn it is
    scores: {},        // { teamA: 0, teamB: 0 }
    firstBidder: null,    // socket id of who bid first (for determining who bids first next time)
    handNumber: 1, // current hand number
    lastTrick: [],
    lastTrickWinner: null,
  };
}

/**
 * Adds a player to a room. Returns updated room or error string.
 */
function addPlayer(room, socketId, username) {
  if (room.players.length >= 4) {
    return { error: "Room is full (max 4 players)" };
  }
  if (room.state !== "waiting") {
    return { error: "Game already in progress" };
  }

  room.players.push({
    id: socketId,
    username,
    hand: [],
    tricks: [],   // cards won in tricks
    bid: null,
  });

  return room;
}

/**
 * Removes a player by socket id
 */
function removePlayer(room, socketId) {
  room.players = room.players.filter((p) => p.id !== socketId);
  return room;
}

/**
 * Deals cards to all players in the room and moves to bidding phase
 */
function startGame(room) {
  if (room.players.length !== 4) {
    return { error: "Need exactly 4 players to start" };
  }

  const deck = buildDeck();
  const { hands, nest } = dealCards(deck, 4, 5);

  room.players.forEach((player, i) => {
    player.hand = hands[i];
    player.tricks = [];
    player.bid = null;
  });

  room.nest = nest;
  room.state = "bidding";
  room.currentBid = 0;
  room.highBidder = null;
  room.trumpSuit = null;
  room.currentTrick = [];

  if(room.handNumber === 1) {
    room.currentTurn = room.players[0].id; // first player bids first
    room.scores = { teamA: 0, teamB: 0 };
    room.firstBidder = room.currentTurn;
  }

  room.currentTurn = room.firstBidder; // reset to first bidder for new hand


  return room;
}

/**
 * Returns a "safe" version of the room to send to a specific player
 * (hides other players' hands)
 */
function getRoomViewForPlayer(room, socketId) {
  return {
    ...room,
    upcard: (room.state === "bidding" && room.nest?.length > 0) ? room.nest[0] : null,
    players: room.players.map((p) => ({
      id: p.id,
      username: p.username,
      cardCount: p.hand.length,
      bid: p.bid,
      hand: p.id === socketId
        ? (room.state === "nestSwap" && p.id === room.highBidder
            ? [...p.hand, ...room.nest]  // show all 18 cards
            : p.hand)
        : [],
    })),
  };
}

/**
 * Gets a player object by socket id
 */
function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

/**
 * Returns the index of the next player (wraps around)
 */
function getNextPlayerIndex(room, currentSocketId) {
  const idx = room.players.findIndex((p) => p.id === currentSocketId);
  return (idx + 1) % room.players.length;
}

module.exports = {
  createRoom,
  addPlayer,
  removePlayer,
  startGame,
  getRoomViewForPlayer,
  getPlayer,
  getNextPlayerIndex,
};
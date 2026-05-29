// game.js — client-side interaction logic

// ─── LOBBY ────────────────────────────────────────────────────────────────────

function onJoinClick() {
  const username = document.getElementById("input-username").value.trim();
  const roomId   = document.getElementById("input-room").value.trim();
  if (!username) return showToast("Enter your name", "error");
  if (!roomId)   return showToast("Enter a room code", "error");
  joinRoom(roomId, username);
}

function onStartClick() {
  startGame();
}

// ─── BIDDING ──────────────────────────────────────────────────────────────────

function onBidClick() {
  const input = document.getElementById("bid-input");
  const bid = parseInt(input?.value);
  if (isNaN(bid)) return showToast("Enter a valid bid", "error");
  placeBid(bid);
}

function onPassClick() {
  placeBid(null);
}

// ─── NEST SWAP ────────────────────────────────────────────────────────────────

function onNestCardClick(cardId) {
  // Search only within the nest overlay container
  const container = document.getElementById("nest-hand-container");
  const elements  = container ? container.querySelectorAll(`[data-card-id="${cardId}"]`) : [];
  if (!elements.length) return;

  if (selectedCards.has(cardId)) {
    selectedCards.delete(cardId);
    elements.forEach(el => el.classList.remove("selected"));
  } else {
    selectedCards.add(cardId);
    elements.forEach(el => el.classList.add("selected"));
  }

  updateSwapButton(currentRoom?.nest?.length || 5);
}

function onConfirmSwapClick() {
  const trumpSuit = document.getElementById("trump-select")?.value;
  if (!trumpSuit) return showToast("Select a trump suit", "error");

  const nestSize = currentRoom?.nest?.length || 5;
  if (selectedCards.size !== nestSize) {
    return showToast(`Select exactly ${nestSize} cards to discard`, "error");
  }

  swapNest([...selectedCards], trumpSuit);
  selectedCards.clear();
}

// ─── PLAYING ──────────────────────────────────────────────────────────────────

function onCardClick(cardId) {
  if (!currentRoom) return;

  if (currentRoom.state === "nestSwap") {
    onNestCardClick(cardId);
    return;
  }

  if (currentRoom.state !== "playing") return;
  if (currentRoom.currentTurn !== socket.id) {
    return showToast("It's not your turn", "error");
  }

  playCard(cardId);
}

// ─── SCORING ──────────────────────────────────────────────────────────────────

function onPlayAgainClick() {
  startGame();
}
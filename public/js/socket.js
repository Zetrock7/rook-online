// socket.js — manages the Socket.io connection and all server events
// Imported by index.html via <script src="/js/socket.js">

const socket = io();  // connects to whatever server served this page

// ─── CONNECTION ───────────────────────────────────────────────────────────────

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  showToast("Disconnected from server", "error");
});

socket.on("error", ({ message }) => {
  console.warn("Server error:", message);
  showToast(message, "error");
});

// ─── GAME EVENTS ──────────────────────────────────────────────────────────────

// Server sends this whenever room state changes
socket.on("roomUpdate", (room) => {
  console.log("Room update:", room);
  updateUI(room);  // defined in ui.js
});

// ─── EMIT HELPERS (called from ui.js / game.js) ───────────────────────────────

function joinRoom(roomId, username) {
  socket.emit("joinRoom", { roomId, username });
}

function startGame() {
  socket.emit("startGame");
}

function placeBid(bid) {
  socket.emit("placeBid", { bid }); // pass null to "pass"
}

function swapNest(cardIdsToDiscard, trumpSuit) {
  socket.emit("swapNest", { cardIdsToDiscard, trumpSuit });
}

function playCard(cardId) {
  socket.emit("playCard", { cardId });
}

function sweepTrick() {
  socket.emit("sweepTrick");
}
// server.js — main entry point, wires together Express + Socket.io + game logic
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const { createRoom, addPlayer, removePlayer, startGame, getRoomViewForPlayer } = require("./game/room");
const { placeBid, swapNest, playCard, sweepTrick } = require("./game/gameState");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

// In-memory store of all active rooms
const rooms = {};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Broadcasts the room state to all players in the room (each gets their own view) */
function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.players.forEach((player) => {
    const view = getRoomViewForPlayer(room, player.id);
    io.to(player.id).emit("roomUpdate", view);
  });
}

/** Sends an error message back to a single socket */
function sendError(socket, message) {
  socket.emit("error", { message });
}

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ── Join a room ──────────────────────────────────────────────────────────
  socket.on("joinRoom", ({ roomId, username }) => {
    if (!roomId || !username) return sendError(socket, "roomId and username are required");

    if (!rooms[roomId]) {
      rooms[roomId] = createRoom(roomId);
      console.log(`Room created: ${roomId}`);
    }

    const result = addPlayer(rooms[roomId], socket.id, username);
    if (result.error) return sendError(socket, result.error);

    socket.join(roomId);
    socket.data.roomId = roomId; // remember which room this socket is in
    socket.data.username = username;

    console.log(`${username} joined ${roomId} (${rooms[roomId].players.length}/4)`);
    broadcastRoom(roomId);
  });

  // ── Start the game ───────────────────────────────────────────────────────
  socket.on("startGame", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return sendError(socket, "Not in a room");

    const result = startGame(rooms[roomId]);
    if (result.error) return sendError(socket, result.error);

    console.log(`Game started in room ${roomId}`);
    broadcastRoom(roomId);
  });

  // ── Place a bid ──────────────────────────────────────────────────────────
  socket.on("placeBid", ({ bid }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return sendError(socket, "Not in a room");

    const result = placeBid(rooms[roomId], socket.id, bid); // bid = number or null (pass)
    if (result.error) return sendError(socket, result.error);

    broadcastRoom(roomId);
  });

  // ── Swap nest cards and declare trump ────────────────────────────────────
  socket.on("swapNest", ({ cardIdsToDiscard, trumpSuit }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return sendError(socket, "Not in a room");

    const result = swapNest(rooms[roomId], socket.id, cardIdsToDiscard, trumpSuit);
    if (result.error) return sendError(socket, result.error);

    broadcastRoom(roomId);
  });

  // ── Play a card ──────────────────────────────────────────────────────────
  socket.on("playCard", ({ cardId }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return sendError(socket, "Not in a room");

    const result = playCard(rooms[roomId], socket.id, cardId);
    if (result.error) return sendError(socket, result.error);

    broadcastRoom(roomId);
  });

  // ── Sweep a trick ────────────────────────────────────────────────────────
  socket.on("sweepTrick", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return sendError(socket, "Not in a room");

    const result = sweepTrick(rooms[roomId], socket.id);
    if (result.error) return sendError(socket, result.error);

    broadcastRoom(roomId);
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    console.log("User disconnected:", socket.id, socket.data.username);

    if (roomId && rooms[roomId]) {
      removePlayer(rooms[roomId], socket.id);
      broadcastRoom(roomId);

      // Clean up empty rooms
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
  });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

server.listen(process.env.PORT || 3000, () => {
  console.log("Rook server running on http://localhost:3000");
});
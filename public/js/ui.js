// ui.js — all DOM updates and rendering

let currentRoom = null;
let selectedCards = new Set();

// ─── SEAT HELPERS ─────────────────────────────────────────────────────────────

/**
 * Returns { me, partner, left, right } as player objects
 * Left = next player after me (bids/plays after me)
 * Partner = 2 seats away
 * Right = 3 seats away (bids/plays before me)
 */
function getSeats(room) {
  const myIdx = room.players.findIndex((p) => p.id === socket.id);
  if (myIdx === -1) return null;
  const get = (offset) => room.players[(myIdx + offset) % 4];
  return {
    me:      get(0),
    left:    get(1),
    partner: get(2),
    right:   get(3),
  };
}

// ─── MAIN UPDATE ENTRY POINT ──────────────────────────────────────────────────

function updateUI(room) {
  currentRoom = room;
  document.getElementById("lobby").style.display = "none";
  document.getElementById("table").classList.add("visible");

  updateTopBar(room);
  updatePlayerZones(room);
  updatePlaySlots(room);
  updateMyHand(room);
  updateOverlays(room);
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────

function updateTopBar(room) {
  const phases = { waiting:"Waiting for players", bidding:"Bidding", nestSwap:"Nest Swap", playing:"Playing", scoring:"Scoring", sweep:"Sweep" };
  document.getElementById("phase-indicator").textContent = phases[room.state] || room.state;

  const trumpEl = document.getElementById("trump-badge");
  if (room.trumpSuit) {
    trumpEl.className = `trump-badge trump-${room.trumpSuit}`;
    trumpEl.textContent = room.trumpSuit;
  } else {
    trumpEl.className = "trump-badge";
    trumpEl.textContent = "—";
  }

  // Upcard — full size, top right, only during bidding
  const upcardArea = document.getElementById("upcard-area");
  const upcardCard = document.getElementById("upcard-card");

  if(upcardArea && upcardCard) {
    if (room.state === "bidding" && room.upcard) {
      upcardArea.classList.add("visible");
      const card  = room.upcard;
      const suit  = card.suit ? card.suit.toLowerCase() : "rook";
      const label = card.isRook ? "🐦" : card.value;
      upcardCard.className = `card ${suit}`;
      upcardCard.style.width  = "88px";
      upcardCard.style.height = "136px";
      upcardCard.innerHTML = `
        <span class="card-value" style="font-size:2rem;">${label}</span>
        <span class="card-suit" style="font-size:1rem;">${card.suit || "Rook"}</span>
      `;
    } else if (room.state === "waiting") {
      // Hide entirely in the lobby/waiting screen
      upcardArea.classList.remove("visible");
      upcardCard.innerHTML = "";
      upcardCard.className = "";
    } else {
      // All other states — show empty slot
      upcardArea.classList.add("visible");
      upcardCard.innerHTML = "";
      upcardCard.className = "upcard-empty";
      upcardCard.style.width  = "";
      upcardCard.style.height = "";
    }
  }

  // Score display — always visible once game starts
  const teamA = room.players[0] && room.players[2]
    ? `${room.players[0].username} & ${room.players[2].username}`
    : "Team A";
  const teamB = room.players[1] && room.players[3]
    ? `${room.players[1].username} & ${room.players[3].username}`
    : "Team B";

  const scoreAEl = document.getElementById("top-score-a");
  const scoreBEl = document.getElementById("top-score-b");
  if (scoreAEl) scoreAEl.textContent = `${teamA}: ${room.scores?.teamA ?? 0}`;
  if (scoreBEl) scoreBEl.textContent = `${teamB}: ${room.scores?.teamB ?? 0}`;

  // Bid info — visible during bidding, nestSwap, and playing
  const bidInfoEl   = document.getElementById("bid-info-display");
  const bidAmountEl = document.getElementById("top-bid-amount");
  const bidNameEl   = document.getElementById("top-bid-name");
  if(bidInfoEl) {
    if (["bidding", "nestSwap", "playing", "sweep"].includes(room.state)) {
      bidInfoEl.style.display = "flex";
      const bidder = room.players.find(p => p.id === room.highBidder);
      if (bidAmountEl) bidAmountEl.textContent = room.currentBid || "—";
      if (bidNameEl)   bidNameEl.textContent   = bidder ? `(${bidder.username})` : "";
    } else {
      bidInfoEl.style.display = "none";
    }
  }
}

// ─── PLAYER ZONES ─────────────────────────────────────────────────────────────

function updatePlayerZones(room) {
  if (room.players.length < 4) {
    ["top","left","right","bottom"].forEach(pos => {
      document.getElementById(`name-${pos}`).textContent = "—";
      document.getElementById(`bid-${pos}`).textContent = "";
      const c = document.getElementById(`count-${pos}`);
      if (c) c.textContent = "";
    });
    return;
  }

  const seats = getSeats(room);
  if (!seats) return;

  const positions = { bottom: seats.me, top: seats.partner, left: seats.left, right: seats.right };

  for (const [pos, player] of Object.entries(positions)) {
    const nameEl  = document.getElementById(`name-${pos}`);
    const bidEl   = document.getElementById(`bid-${pos}`);
    const countEl = document.getElementById(`count-${pos}`);

    const isMe = player.id === socket.id;
    nameEl.textContent = isMe ? `${player.username} (you)` : player.username;
    nameEl.className = "player-name-tag" +
      (isMe ? " me" : "") +
      (player.id === room.currentTurn ? " active-turn" : "");

    // Bid display during bidding/nestSwap
    if (room.state === "bidding" || room.state === "nestSwap") {
      if (player.bid === "pass") {
        bidEl.textContent = "Pass";
        bidEl.style.color = "rgba(245,239,224,0.3)";
      } else if (player.bid) {
        bidEl.textContent = String(player.bid);
        bidEl.style.color = "var(--gold)";
      } else {
        bidEl.textContent = "";
      }
    } else {
      bidEl.textContent = "";
    }

    if (countEl) {
      if (room.state === "playing" || room.state === "nestSwap") {
        const count = player.cardCount ?? player.hand?.length ?? 0;
        countEl.textContent = count > 0 ? `${count} cards` : "";
      } else {
        countEl.textContent = "";
      }
    }
  }
}

// ─── CENTER PLAY SLOTS ────────────────────────────────────────────────────────

function updatePlaySlots(room) {
  ["top","bottom","left","right"].forEach(pos => {
    const slotEl  = document.getElementById(`slot-${pos}`);
    const labelEl = document.getElementById(`slot-${pos}-label`);
    if (slotEl) {
      slotEl.className = "slot-placeholder";
      slotEl.innerHTML = "";
      slotEl.removeAttribute("data-card-id");
    }
    if (labelEl) labelEl.textContent = "";
  });

  if (!room.players || room.players.length < 4) return;

  const seats = getSeats(room);
  if (!seats) return;

  const posMap = { bottom: seats.me, top: seats.partner, left: seats.left, right: seats.right };

  if ((room.state === "playing" || room.state === "sweep") && room.currentTrick?.length > 0) {
    room.currentTrick.forEach((play) => {
      const pos = getPosForPlayer(play.playerId, posMap);
      if (!pos) return;
      const slotEl = document.getElementById(`slot-${pos}`);
      if (!slotEl) return;
      const card = play.card;
      const suit = card.suit ? card.suit.toLowerCase() : "rook";
      const label = card.isRook ? "🐦" : card.value;
      slotEl.className = `card ${suit}`;
      slotEl.dataset.cardId = card.id;
      slotEl.innerHTML = `
        <span class="card-value">${label}</span>
        <span class="card-suit">${card.suit || "Rook"}</span>
      `;
    });
  } else if (room.state === "bidding") {
    for (const [pos, player] of Object.entries(posMap)) {
      const labelEl = document.getElementById(`slot-${pos}-label`);
      if (!labelEl) continue;
      if (player.bid === "pass") { 
        labelEl.style.color = "rgba(245,239,224,0.3)";
        labelEl.textContent = "Pass";
        labelEl.style.fontStyle = "italic";
      } else if (player.bid) { 
        labelEl.style.color = "rgba(255, 255, 255, 0.3)";
        labelEl.textContent = `Bid: ${player.bid}`;
        labelEl.style.fontStyle = "normal";
        if(player.id === room.highBidder) {
          labelEl.style.color = "var(--gold)";
        }
      }
    }
  }
}

function getPosForPlayer(playerId, posMap) {
  for (const [pos, player] of Object.entries(posMap)) {
    if (player.id === playerId) return pos;
  }
  return null;
}

// ─── MY HAND ──────────────────────────────────────────────────────────────────

function updateMyHand(room) {
  const handArea = document.getElementById("my-hand-area");
  const seats = getSeats(room);
  if (!seats) { handArea.innerHTML = ""; return; }

  const me = seats.me;
  if (!me?.hand?.length) { handArea.innerHTML = ""; return; }

  const isMyTurn = room.currentTurn === socket.id;
  const selectable = room.state === "playing" && isMyTurn;
  const sorted = sortHand(me.hand);

  handArea.innerHTML = "";
  sorted.forEach((card) => {
    const el = document.createElement("div");
    const suit = card.suit ? card.suit.toLowerCase() : "rook";
    el.className = `card ${suit}${selectable ? " selectable" : ""}`;
    el.dataset.cardId = card.id;
    el.innerHTML = `
      <span class="card-value">${card.isRook ? "🐦" : card.value}</span>
      <span class="card-suit">${card.suit || "Rook"}</span>
    `;
    if (selectable) {
      el.addEventListener("click", () => onCardClick(card.id));
    }
    handArea.appendChild(el);
  });
}

// ─── OVERLAYS ─────────────────────────────────────────────────────────────────

function updateOverlays(room) {
  document.getElementById("waiting-overlay").classList.add("hidden");
  document.getElementById("nest-overlay").classList.add("hidden");
  document.getElementById("scoring-overlay").classList.add("hidden");
  document.getElementById("action-panel").classList.add("hidden");

  switch (room.state) {
    case "waiting":
      renderWaitingOverlay(room);
      document.getElementById("waiting-overlay").classList.remove("hidden");
      break;
    case "bidding":
      renderBiddingAction(room);
      break;
    case "nestSwap":
      renderNestOverlay(room);
      document.getElementById("nest-overlay").classList.remove("hidden");
      break;
    case "playing":
      renderPlayingAction(room);
      if (room.lastTrick) updateLastTrickPanel(room);
      break;
    case "sweep":
      renderSweepAction(room);
      break;
    case "scoring":
      renderScoringOverlay(room);
      document.getElementById("scoring-overlay").classList.remove("hidden");
      break;
  }
}

// ─── WAITING OVERLAY ──────────────────────────────────────────────────────────

function renderWaitingOverlay(room) {
  document.getElementById("waiting-sub").textContent =
    `${room.players.length}/4 players — share the room code to invite family!`;

  document.getElementById("waiting-player-list").innerHTML = room.players.map(p => `
    <div class="player-list-item">
      <div class="dot"></div>
      <span>${p.username}${p.id === socket.id ? " (you)" : ""}</span>
    </div>
  `).join("");

  const btn = document.getElementById("btn-start");
  btn.disabled = room.players.length !== 4;
  btn.textContent = room.players.length === 4
    ? "Start Game →"
    : `Need ${4 - room.players.length} more player${4 - room.players.length !== 1 ? "s" : ""}`;
}

// ─── BIDDING ACTION ───────────────────────────────────────────────────────────

function renderBiddingAction(room) {
  const panel    = document.getElementById("action-panel");
  const title    = document.getElementById("action-title");
  const row      = document.getElementById("action-row");
  const isMyTurn = room.currentTurn === socket.id;

  panel.classList.remove("hidden");

  if (isMyTurn) {
    const minNext = Math.max(50, (room.currentBid || 45) + 5);
    title.innerHTML = `<span class="your-turn-pulse">✦ Your turn to bid ✦</span>`;
    row.innerHTML = `
      <input type="number" id="bid-input" min="${minNext}" max="180" step="5" value="${minNext}" />
      <button class="btn btn-gold" onclick="onBidClick()">Bid</button>
      <button class="btn btn-outline" onclick="onPassClick()">Pass</button>
    `;
  } else {
    const active = room.players.find(p => p.id === room.currentTurn);
    title.textContent = `Waiting for ${active?.username || "…"} to bid…`;
    row.innerHTML = `<span style="color:rgba(245,239,224,0.4);font-style:italic;">
      Current bid: ${room.currentBid || "None"}
    </span>`;
  }
}

// ─── NEST SWAP OVERLAY ────────────────────────────────────────────────────────

function renderNestOverlay(room) {
  const isHighBidder = room.highBidder === socket.id;
  const instructions = document.getElementById("nest-instructions");
  const container    = document.getElementById("nest-hand-container");
  const controls     = document.getElementById("nest-controls");

  if (!isHighBidder) {
    const bidder = room.players.find(p => p.id === room.highBidder);
    instructions.textContent = `Waiting for ${bidder?.username || "…"} to swap the nest and declare trump…`;
    container.innerHTML = "";
    controls.innerHTML = "";
    return;
  }

  instructions.textContent = "Pick up the nest — select 5 cards to discard, then declare trump.";

  const seats = getSeats(room);
  const me = seats?.me;
  if (!me?.hand?.length) return;

  // Only rebuild when card count changes (i.e. nest just merged in)
  if (container.children.length !== me.hand.length) {
    container.innerHTML = "";
    sortHand(me.hand).forEach((card) => {
      const el = document.createElement("div");
      const suit = card.suit ? card.suit.toLowerCase() : "rook";
      el.className = `card ${suit} selectable`;
      el.dataset.cardId = card.id;
      el.innerHTML = `
        <span class="card-value">${card.isRook ? "🐦" : card.value}</span>
        <span class="card-suit">${card.suit || "Rook"}</span>
      `;
      el.addEventListener("click", () => onCardClick(card.id));
      container.appendChild(el);
    });

    // Re-apply any already-selected cards
    selectedCards.forEach((cardId) => {
      const el = container.querySelector(`[data-card-id="${cardId}"]`);
      if (el) el.classList.add("selected");
    });
  }

  const nestSize = room.nest?.length || 5;
  controls.innerHTML = `
    <select id="trump-select">
      <option value="">— Choose trump —</option>
      <option value="Red">🔴 Red</option>
      <option value="Yellow">🟡 Yellow</option>
      <option value="Green">🟢 Green</option>
      <option value="Black">⚫ Black</option>
    </select>
    <button id="btn-confirm-swap" class="btn btn-gold" onclick="onConfirmSwapClick()" disabled>
      Discard 0/${nestSize} cards
    </button>
  `;
  updateSwapButton(nestSize);
}

function updateSwapButton(nestSize) {
  const btn = document.getElementById("btn-confirm-swap");
  if (!btn) return;
  const n = nestSize ?? currentRoom?.nest?.length ?? 5;
  btn.textContent = `Discard ${selectedCards.size}/${n} cards`;
  btn.disabled = selectedCards.size !== n;
}

// ─── PLAYING ACTION ───────────────────────────────────────────────────────────

function renderPlayingAction(room) {
  const panel    = document.getElementById("action-panel");
  const title    = document.getElementById("action-title");
  const row      = document.getElementById("action-row");
  const isMyTurn = room.currentTurn === socket.id;

  if (isMyTurn) {
    panel.classList.remove("hidden");
    title.innerHTML = `<span class="your-turn-pulse">✦ Your turn — play a card ✦</span>`;
    row.innerHTML = "";
  } else {
    panel.classList.add("hidden");
  }
}

// ─── SWEEP ACTION ─────────────────────────────────────────────────────────────

function renderSweepAction(room) {
  const panel    = document.getElementById("action-panel");
  const title    = document.getElementById("action-title");
  const row      = document.getElementById("action-row");
  const isWinner = room.lastTrickWinner === socket.id;

  panel.classList.remove("hidden");

  if (isWinner) {
    title.innerHTML = `<span class="your-turn-pulse">✦ You won the trick! ✦</span>`;
    row.innerHTML = `<button class="btn btn-gold" onclick="sweepTrick()">Sweep →</button>`;
  } else {
    const winner = room.players.find(p => p.id === room.lastTrickWinner);
    title.textContent = `${winner?.username || "…"} won the trick`;
    row.innerHTML = `<span style="color:rgba(245,239,224,0.4);font-style:italic;">Waiting for them to sweep…</span>`;
  }
}

// ─── LAST TRICK PANEL ─────────────────────────────────────────────────────────

function updateLastTrickPanel(room) {
  if (!room.lastTrick) return;
  const panel = document.getElementById("last-trick-panel");
  const grid  = document.getElementById("last-trick-grid");
  panel.classList.add("visible");

  const seats = getSeats(room);
  if (!seats) return;

  const posMap = { bottom: seats.me, top: seats.partner, left: seats.left, right: seats.right };
  const gridOrder = ["top", "right", "left", "bottom"];

  grid.innerHTML = gridOrder.map((pos) => {
    const player = posMap[pos];
    const play   = room.lastTrick.find(t => t.playerId === player?.id);
    if (!play) return `<div class="last-trick-slot"></div>`;

    const suit     = play.card.suit ? play.card.suit.toLowerCase() : "rook";
    const label    = play.card.isRook ? "🐦" : play.card.value;
    const isWinner = play.playerId === room.lastTrickWinner;
    const isLed    = room.lastTrick[0]?.playerId === play.playerId;

    const colorMap = { red: "var(--red)", yellow: "var(--yellow)", green: "var(--green)", black: "var(--black)", rook: "var(--gold)" };

    return `
      <div class="last-trick-slot ${isWinner ? "winner" : ""} ${isLed ? "led" : ""}">
        <div class="lt-card-val" style="color:${colorMap[suit] || "var(--cream)"}">${label}</div>
        <div class="lt-player">${player.username}</div>
        <div class="lt-badges">
          ${isLed    ? '<span class="lt-badge lt-badge-led">LED</span>' : ""}
          ${isWinner ? '<span class="lt-badge lt-badge-won">WON</span>' : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ─── SCORING OVERLAY ──────────────────────────────────────────────────────────

function renderScoringOverlay(room) {
  const result = room.lastHandResult;
  if (!result) return;

  document.getElementById("score-summary-text").textContent =
    `${result.highBidder} bid ${result.bid} (${result.trumpSuit} trump) — ${result.bidMade ? "✅ Made it!" : "❌ Set!"}`;

  const teamA = [room.players[0], room.players[2]];
  const teamB = [room.players[1], room.players[3]];

  document.getElementById("score-team-a-name").textContent = teamA.map(p => p.username).join(" & ");
  document.getElementById("score-team-b-name").textContent = teamB.map(p => p.username).join(" & ");
  document.getElementById("score-team-a-pts").textContent  = room.scores.teamA ?? 0;
  document.getElementById("score-team-b-pts").textContent  = room.scores.teamB ?? 0;

  // Render nest cards
  const nestArea = document.getElementById("nest-cards-area");
  if (nestArea && Array.isArray(result.nestCards)) {
    if (result.nestCards.length === 0) {
      nestArea.innerHTML = "";
      return;
    }
    nestArea.innerHTML = `<div style='margin-bottom:0.4rem;font-weight:600;'>Nest Cards</div><div style='display:flex;gap:6px;justify-content:center;'>` +
      result.nestCards.map(card => {
        const suit = card.suit ? card.suit.toLowerCase() : "rook";
        const value = card.isRook ? "🐦" : card.value;
        return `<div class='card ${suit}' style='width:44px;height:68px;font-size:1.1rem;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 0;'>
          <span class='card-value'>${value}</span>
          <span class='card-suit' style='font-size:0.7rem;'>${card.suit || "Rook"}</span>
        </div>`;
      }).join("") + "</div>";
  }
}

// ─── SORT HAND ────────────────────────────────────────────────────────────────

function sortHand(hand) {
  const suitOrder = { "Black": 0, "Red": 1, "Green": 2, "Yellow": 3 };
  return [...hand].sort((a, b) => {
    const suitDiff = (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4);
    if (suitDiff !== 0) return suitDiff;
    if (a.value === 1) return -1;
    if (b.value === 1) return 1;
    return b.value - a.value;
  });
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
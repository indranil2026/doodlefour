// public/js/network.js
// Socket.IO client wrapper — handles all server communication

import { GameState } from './gameState.js';
import { UI } from './ui.js';
import { startGame } from './gameEngine.js';

let socket = null;

export function initNetwork() {
  // Connect to server (same origin)
  socket = io({ autoConnect: true, reconnection: true });
  GameState.socket = socket;

  socket.on('connect', () => {
    GameState.connected = true;
    console.log('[Network] Connected:', socket.id);
  });

  socket.on('disconnect', () => {
    GameState.connected = false;
    console.log('[Network] Disconnected');
    if (GameState.screen === 'game') {
      UI.showOpponentDisconnected();
    }
  });

  // ─── Matchmaking ───────────────────────────────────────────────────────────

  socket.on('match_found', async (data) => {
    console.log('[Network] Match found:', data.matchId);
    GameState.matchId = data.matchId;
    GameState.playerId = data.playerId;
    GameState.mapData = data.mapData;
    GameState.myPosition = { ...data.mapData.start };
    GameState.opponentPosition = { ...data.mapData.start };

    // Update badge labels
    const badge = document.getElementById('badge-label');
    if (badge) badge.textContent = 'YOU';

    // Show game screen and initialize
    UI.showScreen('game');
    await startGame(data.mapData);

    // Signal ready to server
    socket.emit('player_ready');
  });

  socket.on('matchmaking_cancelled', () => {
    UI.showScreen('home');
  });

  socket.on('opponent_disconnected', () => {
    UI.showOpponentDisconnected();
  });

  // ─── Countdown ────────────────────────────────────────────────────────────

  socket.on('countdown', ({ count }) => {
    UI.showCountdown(count);
  });

  socket.on('game_start', ({ timestamp }) => {
    GameState.gameStartTime = timestamp;
    UI.hideCountdown();
    // Unlock movement and enable joystick
    import('./playerController.js').then(m => m.unlockMovement());
    import('./gameEngine.js').then(m => m.enableJoystick());
  });

  // ─── Game ─────────────────────────────────────────────────────────────────

  socket.on('opponent_update', (data) => {
    import('./interpolation.js').then(m => {
      m.updateOpponentTarget(data.x, data.y, data.timestamp);
    });
  });

  socket.on('match_result', (data) => {
    const isMe = data.winnerPlayerId === GameState.playerId;
    GameState.winner = isMe ? 'me' : 'opponent';
    GameState.winnerPlayerId = data.winnerPlayerId;
    GameState.matchDurationMs = data.timeMs;

    import('./gameEngine.js').then(m => m.stopGame());
    UI.showResult(isMe, data.timeMs);
  });

  // ─── Rematch ──────────────────────────────────────────────────────────────

  socket.on('opponent_wants_rematch', () => {
    UI.showOpponentWantsRematch();
  });

  socket.on('rematch_start', async (data) => {
    GameState.matchId = data.matchId;
    GameState.mapData = data.mapData;
    GameState.myPosition = { ...data.mapData.start };
    GameState.opponentPosition = { ...data.mapData.start };

    UI.showScreen('game');
    await startGame(data.mapData);
    socket.emit('player_ready');
  });
}

export function joinMatchmaking() {
  if (socket) socket.emit('join_matchmaking');
}

export function cancelMatchmaking() {
  if (socket) socket.emit('cancel_matchmaking');
}

export function sendPlayerUpdate(x, y) {
  if (socket && GameState.screen === 'game') {
    socket.emit('player_update', { x, y });
  }
}

export function sendPlayerWon() {
  if (socket) socket.emit('player_won');
}

export function sendRematchRequest() {
  if (socket) socket.emit('rematch_request');
}

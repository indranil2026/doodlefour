// server/matchmaking.js
// Manages match rooms and player pairing

'use strict';

const { v4: uuidv4 } = require('uuid');
const { generateMap } = require('./mapGenerator');

const MATCH_PLAYER_COUNT = 2;

class MatchmakingManager {
  constructor(svgData, byFolder) {
    this.svgData = svgData;
    this.byFolder = byFolder || {};
    this.queue = [];          // sockets waiting for a match
    this.matches = new Map(); // matchId -> matchState
    this.socketToMatch = new Map(); // socketId -> matchId
  }

  /**
   * Add a player to matchmaking queue.
   * Returns true if a match was created.
   */
  async addToQueue(socket) {
    // Remove any existing entry for this socket
    this.removeFromQueue(socket.id);

    this.queue.push(socket);
    console.log(`[Matchmaking] Player ${socket.id} joined queue. Queue size: ${this.queue.length}`);

    if (this.queue.length >= MATCH_PLAYER_COUNT) {
      const players = this.queue.splice(0, MATCH_PLAYER_COUNT);
      await this._createMatch(players);
      return true;
    }
    return false;
  }

  removeFromQueue(socketId) {
    const idx = this.queue.findIndex(s => s.id === socketId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      console.log(`[Matchmaking] Player ${socketId} removed from queue`);
    }
  }

  async _createMatch(players) {
    const matchId = uuidv4();
    console.log(`[Matchmaking] Creating match ${matchId} for players:`, players.map(s => s.id));

    // Generate validated map
    const mapData = await generateMap(this.svgData, this.byFolder);
    mapData.matchId = matchId;

    const match = {
      id: matchId,
      players: players.map((socket, i) => ({
        socket,
        playerId: i + 1,
        position: { ...mapData.start },
        ready: false,
        won: false
      })),
      mapData,
      startTime: null,
      status: 'waiting', // waiting | countdown | playing | finished
      countdownTimer: null
    };

    this.matches.set(matchId, match);
    for (const p of match.players) {
      this.socketToMatch.set(p.socket.id, matchId);
      p.socket.join(matchId);
    }

    // Notify both players
    for (const p of match.players) {
      p.socket.emit('match_found', {
        matchId,
        playerId: p.playerId,
        mapData,
        opponentId: match.players.find(q => q.socket.id !== p.socket.id)?.socket.id
      });
    }

    console.log(`[Match ${matchId}] Map generated with ${mapData.obstacles.length} obstacles`);
    return match;
  }

  getMatchBySocket(socketId) {
    const matchId = this.socketToMatch.get(socketId);
    return matchId ? this.matches.get(matchId) : null;
  }

  getPlayerInMatch(match, socketId) {
    return match.players.find(p => p.socket.id === socketId);
  }

  startCountdown(io, match) {
    if (match.status !== 'waiting') return;
    match.status = 'countdown';

    let count = 3;
    io.to(match.id).emit('countdown', { count });

    match.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        io.to(match.id).emit('countdown', { count });
      } else {
        clearInterval(match.countdownTimer);
        match.status = 'playing';
        match.startTime = Date.now();
        io.to(match.id).emit('game_start', { timestamp: match.startTime });
      }
    }, 1000);
  }

  handlePlayerReady(io, socket) {
    const match = this.getMatchBySocket(socket.id);
    if (!match) return;

    const player = this.getPlayerInMatch(match, socket.id);
    if (!player) return;

    player.ready = true;
    const allReady = match.players.every(p => p.ready);

    if (allReady && match.status === 'waiting') {
      this.startCountdown(io, match);
    }
  }

  handlePlayerInput(io, socket, data) {
    const match = this.getMatchBySocket(socket.id);
    if (!match || match.status !== 'playing') return;

    const player = this.getPlayerInMatch(match, socket.id);
    if (!player) return;

    // Update position from client (client is authoritative for own position)
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      player.position = { x: data.x, y: data.y };
    }

    // Broadcast to opponent(s)
    socket.to(match.id).emit('opponent_update', {
      playerId: player.playerId,
      x: player.position.x,
      y: player.position.y,
      timestamp: Date.now()
    });
  }

  handlePlayerWin(io, socket) {
    const match = this.getMatchBySocket(socket.id);
    if (!match || match.status !== 'playing') return;

    const player = this.getPlayerInMatch(match, socket.id);
    if (!player || player.won) return;

    player.won = true;
    match.status = 'finished';
    const elapsed = Date.now() - match.startTime;

    io.to(match.id).emit('match_result', {
      winnerId: player.socket.id,
      winnerPlayerId: player.playerId,
      timeMs: elapsed
    });

    console.log(`[Match ${match.id}] Player ${player.playerId} won in ${elapsed}ms`);
  }

  handleRematch(io, socket) {
    const match = this.getMatchBySocket(socket.id);
    if (!match) return;

    const player = this.getPlayerInMatch(match, socket.id);
    if (!player) return;

    player.rematchRequested = true;
    const allWantRematch = match.players.every(p => p.rematchRequested);

    if (allWantRematch) {
      // Re-queue all players
      match.players.forEach(p => {
        p.rematchRequested = false;
        p.ready = false;
        p.won = false;
      });
      this._resetAndRegenerate(io, match);
    } else {
      // Notify other player
      socket.to(match.id).emit('opponent_wants_rematch', {});
    }
  }

  async _resetAndRegenerate(io, match) {
    match.status = 'waiting';
    const mapData = await generateMap(this.svgData, this.byFolder);
    mapData.matchId = match.id;
    match.mapData = mapData;

    for (const p of match.players) {
      p.position = { ...mapData.start };
      p.socket.emit('rematch_start', {
        matchId: match.id,
        playerId: p.playerId,
        mapData,
      });
    }
  }

  handleDisconnect(io, socket) {
    this.removeFromQueue(socket.id);
    const match = this.getMatchBySocket(socket.id);
    if (match && match.status !== 'finished') {
      // Notify remaining player
      socket.to(match.id).emit('opponent_disconnected', {});
      if (match.countdownTimer) clearInterval(match.countdownTimer);
      match.status = 'finished';
    }
    if (match) {
      this.socketToMatch.delete(socket.id);
      // Clean up match if both players gone
      const activeCount = match.players.filter(p => this.socketToMatch.has(p.socket.id)).length;
      if (activeCount === 0) {
        this.matches.delete(match.id);
      }
    }
  }
}

module.exports = { MatchmakingManager };

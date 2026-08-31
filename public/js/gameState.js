// public/js/gameState.js
// Central game state store — single source of truth for client

export const GameState = {
  // Connection
  socket: null,
  connected: false,

  // Match
  matchId: null,
  playerId: null,        // 1 or 2
  mapData: null,

  // Screen: 'home' | 'matchmaking' | 'countdown' | 'game' | 'result'
  screen: 'home',

  // Player positions
  myPosition: { x: 180, y: 60 },
  opponentPosition: { x: 180, y: 60 },
  opponentLastUpdate: 0,

  // Game timing
  gameStartTime: null,
  matchDurationMs: null,

  // Result
  winner: null,   // 'me' | 'opponent'
  winnerPlayerId: null,

  // SVG polygon cache: { svgName: [[x,y],...] }
  svgPolygons: {},

  // Collision geometry for current map: array of { polygon, ...obsData }
  obstacleColliders: [],

  // Joystick state
  joystickDir: { x: 0, y: 0 },

  reset() {
    this.matchId = null;
    this.playerId = null;
    this.mapData = null;
    this.myPosition = { x: 180, y: 60 };
    this.opponentPosition = { x: 180, y: 60 };
    this.opponentLastUpdate = 0;
    this.gameStartTime = null;
    this.matchDurationMs = null;
    this.winner = null;
    this.winnerPlayerId = null;
    this.obstacleColliders = [];
    this.joystickDir = { x: 0, y: 0 };
  }
};

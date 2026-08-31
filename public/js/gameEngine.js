// public/js/gameEngine.js
// Main game loop: orchestrates rendering, physics, and input

import { GameState } from './gameState.js';
import { renderMap, renderPlayers, preloadObstacleImages } from './mapRenderer.js';
import { buildAllColliders } from './collisionSystem.js';
import { updatePlayer, lockMovement } from './playerController.js';
import { getInterpolatedOpponentPosition, resetInterpolation } from './interpolation.js';
import { preloadMapSvgs } from './svgLoader.js';
import { VirtualJoystick } from './joystick.js';

// Canvas & rendering
let canvas = null;
let ctx = null;
let animFrameId = null;
let lastFrameTime = 0;
let running = false;

// Joystick instance
let joystick = null;

// Update rate limiter for network sends (~20 fps)
let lastNetworkSend = 0;
const NETWORK_SEND_INTERVAL = 50; // ms

/**
 * Initialize the game with map data.
 * Called once per match.
 */
export async function startGame(mapData) {
  // Get or create canvas
  canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[GameEngine] Canvas not found');
    return;
  }
  ctx = canvas.getContext('2d');

  // Set canvas to field size (CSS will scale it to fit screen)
  canvas.width = mapData.fieldWidth || 360;
  canvas.height = mapData.fieldHeight || 640;

  // Lock movement until countdown finishes
  lockMovement();

  // Reset positions
  GameState.myPosition = { ...mapData.start };
  GameState.opponentPosition = { ...mapData.start };
  resetInterpolation(mapData.start.x, mapData.start.y);

  // Preload SVGs for rendering and collision
  await preloadMapSvgs(mapData.obstacles);
  preloadObstacleImages(mapData.obstacles);

  // Build collision geometry
  buildAllColliders(mapData.obstacles);

  // Setup joystick
  if (joystick) { joystick.destroy(); joystick = null; }
  const joystickContainer = document.getElementById('joystick-container');
  if (joystickContainer) {
    joystick = new VirtualJoystick(joystickContainer, (jx, jy) => {
      GameState.joystickDir = { x: jx, y: jy };
    });
    joystick.disable(); // enabled at game_start
  }

  // Start render loop
  if (animFrameId) cancelAnimationFrame(animFrameId);
  running = true;
  lastFrameTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);

  console.log('[GameEngine] Game initialized with', mapData.obstacles.length, 'obstacles');
}

export function stopGame() {
  running = false;
  lockMovement();
  if (joystick) joystick.disable();
}

/**
 * Called by network.js when game_start is received.
 */
export function onGameStart() {
  if (joystick) joystick.enable();
}

function gameLoop(timestamp) {
  if (!running) return;

  const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05); // cap at 50ms
  lastFrameTime = timestamp;

  // Update opponent interpolation
  const interpPos = getInterpolatedOpponentPosition(dt);
  GameState.opponentPosition = interpPos;

  // Update own movement
  updatePlayer(dt);

  // Render
  renderFrame();

  animFrameId = requestAnimationFrame(gameLoop);
}

function renderFrame() {
  const mapData = GameState.mapData;
  if (!mapData || !ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Draw map + obstacles
  renderMap(ctx, W, H);

  // Draw players
  renderPlayers(ctx, GameState.myPosition, GameState.opponentPosition, GameState.playerId);
}

/**
 * Enable the joystick (called from network when game starts).
 */
export function enableJoystick() {
  if (joystick) joystick.enable();
}

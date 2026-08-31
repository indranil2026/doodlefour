import { GameState } from './gameState.js';
import { moveWithCollision, checkDestination } from './collisionSystem.js';
import { sound } from './soundManager.js';

// Lazy-loaded network functions (break circular dependency)
let _sendPlayerUpdate = null;
let _sendPlayerWon = null;

async function getNetworkFns() {
  if (!_sendPlayerUpdate) {
    const net = await import('./network.js');
    _sendPlayerUpdate = net.sendPlayerUpdate;
    _sendPlayerWon = net.sendPlayerWon;
  }
}

const PLAYER_SPEED = 42; // pixels per second (slower constant speed)
let movementLocked = true;
let wonAlready = false;

export function lockMovement() {
  movementLocked = true;
}

export function unlockMovement() {
  movementLocked = false;
  wonAlready = false;
}

export function resetWin() {
  wonAlready = false;
}

/**
 * Update player position based on joystick direction and delta time.
 * Called each frame by the game engine.
 * @param {number} dt - delta time in seconds
 */
export async function updatePlayer(dt) {
  if (movementLocked || wonAlready) return;

  const { x: jx, y: jy } = GameState.joystickDir;
  if (jx === 0 && jy === 0) return; // no movement

  // Normalize diagonal speed fully (no analog acceleration)
  const len = Math.sqrt(jx*jx + jy*jy);
  const nx = jx / len;
  const ny = jy / len;

  const dx = nx * PLAYER_SPEED * dt;
  const dy = ny * PLAYER_SPEED * dt;

  const { x: px, y: py } = GameState.myPosition;
  const moveRes = moveWithCollision(px, py, dx, dy, GameState.obstacleColliders);

  // Sound triggers based on movement & collision state
  if (moveRes.hit) {
    if (moveRes.squeeze) {
      sound.playNarrowSqueeze();
    } else {
      sound.playWallBump();
    }
  } else {
    sound.playRunningStep();
  }

  if (moveRes.x !== px || moveRes.y !== py) {
    GameState.myPosition = { x: moveRes.x, y: moveRes.y };

    // Lazy-load network fns and send update
    await getNetworkFns();
    _sendPlayerUpdate(moveRes.x, moveRes.y);

    // Check destination
    if (checkDestination(moveRes.x, moveRes.y, GameState.mapData.destination)) {
      wonAlready = true;
      movementLocked = true;
      sound.playFinishChime();
      _sendPlayerWon();
    }
  }
}

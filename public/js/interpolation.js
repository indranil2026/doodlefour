// public/js/interpolation.js
// Smooth opponent position interpolation

let targetX = 180;
let targetY = 60;
let currentX = 180;
let currentY = 60;
let lastTimestamp = 0;

const INTERP_SPEED = 0.25; // lerp factor per frame (at 60fps)

/**
 * Called when server sends a new opponent position.
 */
export function updateOpponentTarget(x, y, timestamp) {
  targetX = x;
  targetY = y;
  lastTimestamp = timestamp;
}

/**
 * Interpolate toward target. Called each frame.
 * @param {number} dt - delta time in seconds
 * @returns {{ x, y }} smoothed position
 */
export function getInterpolatedOpponentPosition(dt) {
  // Exponential approach (lerp)
  const t = 1 - Math.pow(1 - INTERP_SPEED, dt * 60);
  currentX += (targetX - currentX) * t;
  currentY += (targetY - currentY) * t;
  return { x: currentX, y: currentY };
}

/**
 * Reset interpolation to a specific position (e.g. match start).
 */
export function resetInterpolation(x, y) {
  targetX = x;
  targetY = y;
  currentX = x;
  currentY = y;
}

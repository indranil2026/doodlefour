// public/js/mapRenderer.js
// Renders the game field: background, obstacles (SVG), start, destination

import { GameState } from './gameState.js';

// Cache for loaded Image elements (for SVG rendering)
const svgImageCache = {};

/**
 * Load an SVG as an Image element for canvas drawImage.
 */
function loadSvgImage(svgName) {
  if (svgImageCache[svgName]) return svgImageCache[svgName];
  const img = new Image();
  img.src = `/svg/field/${svgName}`;
  svgImageCache[svgName] = img;
  return img;
}

/**
 * Preload all SVG images used in obstacles.
 */
export function preloadObstacleImages(obstacles) {
  for (const obs of obstacles) {
    loadSvgImage(obs.svg);
  }
}

/**
 * Render the full game field.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} fieldW
 * @param {number} fieldH
 */
export function renderMap(ctx, fieldW, fieldH) {
  const mapData = GameState.mapData;
  if (!mapData) return;

  // Background
  ctx.fillStyle = '#fdfdfd';
  ctx.fillRect(0, 0, fieldW, fieldH);

  // Render obstacles
  renderObstacles(ctx, mapData.obstacles);

  // Render start zone
  renderStart(ctx, mapData.start);

  // Render destination zone
  renderDestination(ctx, mapData.destination);
}

function renderObstacles(ctx, obstacles) {
  for (const obs of obstacles) {
    const img = loadSvgImage(obs.svg);
    if (!img.complete) continue;

    ctx.save();

    // Translate to centre of obstacle, rotate, draw
    const cx = obs.x + obs.width / 2;
    const cy = obs.y + obs.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((obs.rotation * Math.PI) / 180);

    ctx.drawImage(img, -obs.width / 2, -obs.height / 2, obs.width, obs.height);

    ctx.restore();
  }
}

function renderStart(ctx, start) {
  // Pulsing gold ring
  const now = Date.now();
  const pulse = 0.7 + 0.3 * Math.sin(now / 600);

  // Outer glow
  const grad = ctx.createRadialGradient(start.x, start.y, 0, start.x, start.y, 28 * pulse);
  grad.addColorStop(0, 'rgba(255,215,0,0.25)');
  grad.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 28 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Ring
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 18, 0, Math.PI * 2);
  ctx.stroke();

  // Label
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START', start.x, start.y);
}

function renderDestination(ctx, dest) {
  const now = Date.now();
  const wave = Math.sin(now / 200) * 2; // subtle wave animation for the flag

  ctx.save();
  ctx.translate(dest.x - 10, dest.y - 15); // Offset to center the flag around dest

  // Flag pole
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 3, 30);
  
  // Flag base (little circle at bottom)
  ctx.beginPath();
  ctx.arc(1.5, 30, 4, 0, Math.PI * 2);
  ctx.fill();

  // Red Flag fabric
  ctx.fillStyle = '#d32f2f'; // Red flag
  ctx.beginPath();
  ctx.moveTo(3, 0);
  // wavy top
  ctx.quadraticCurveTo(12, wave, 20, 0);
  ctx.lineTo(20, 12);
  // wavy bottom
  ctx.quadraticCurveTo(12, 12 + wave, 3, 12);
  ctx.closePath();
  ctx.fill();

  // Black outline
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Label
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 8px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FINISH', 10, 42);

  ctx.restore();
}

/**
 * Render both player dots.
 */
export function renderPlayers(ctx, myPos, opponentPos, myPlayerId) {
  // Render opponent first (behind) in red without "YOU" label
  if (opponentPos) {
    renderDot(ctx, opponentPos.x, opponentPos.y, '#ff6b6b', false);
  }

  // Render local player on top in blue with "YOU" label
  if (myPos) {
    renderDot(ctx, myPos.x, myPos.y, '#4fc3f7', true);
  }
}

function renderDot(ctx, x, y, color, isMe) {
  const r = 5; // 10px diameter

  // Dot body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // White border
  ctx.strokeStyle = isMe ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.5)';
  ctx.lineWidth = isMe ? 1.5 : 1;
  ctx.stroke();

  // "YOU" label on self
  if (isMe) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.font = 'bold 7px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('YOU', x, y - r - 2);
  }
}

/**
 * Debug: render collision polygons (dev mode only).
 */
export function renderDebugColliders(ctx) {
  if (!GameState.obstacleColliders) return;
  ctx.strokeStyle = 'rgba(255,0,0,0.4)';
  ctx.lineWidth = 1;
  for (const col of GameState.obstacleColliders) {
    if (!col.worldPoly) continue;
    ctx.beginPath();
    ctx.moveTo(col.worldPoly[0][0], col.worldPoly[0][1]);
    for (let i = 1; i < col.worldPoly.length; i++) {
      ctx.lineTo(col.worldPoly[i][0], col.worldPoly[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

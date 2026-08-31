// public/js/collisionSystem.js
// Client-side collision detection using polygon geometry

import { getCachedPolygon } from './svgLoader.js';
import { GameState } from './gameState.js';

const PLAYER_RADIUS = 5;
const FIELD_WIDTH = 360;
const FIELD_HEIGHT = 640;

/**
 * Build world-space collision polygon for an obstacle.
 * Transforms the normalized SVG polygon using the obstacle's
 * position, scale, and rotation.
 */
export function buildObstacleCollider(obstacle) {
  const svgInfo = getCachedPolygon(obstacle.svg);
  if (!svgInfo) return null;

  const { polygon, viewBoxW, viewBoxH } = svgInfo;
  const { x: ox, y: oy, width: obsW, height: obsH, rotation } = obstacle;

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const worldPoly = polygon.map(([px, py]) => {
    // Scale from SVG viewBox to rendered size
    let sx = (px / viewBoxW) * obsW;
    let sy = (py / viewBoxH) * obsH;

    // Rotate around centre
    const cx = obsW / 2, cy = obsH / 2;
    const rx = cos * (sx - cx) - sin * (sy - cy) + cx;
    const ry = sin * (sx - cx) + cos * (sy - cy) + cy;

    return [rx + ox, ry + oy];
  });

  return { ...obstacle, worldPoly };
}

/**
 * Build all colliders for the current map.
 */
export function buildAllColliders(obstacles) {
  const colliders = [];
  for (const obs of obstacles) {
    const c = buildObstacleCollider(obs);
    if (c) colliders.push(c);
  }
  GameState.obstacleColliders = colliders;
  return colliders;
}

/**
 * Check if a circle (player dot) collides with any obstacle polygon.
 * Returns true if collision detected.
 */
export function checkCollision(x, y, colliders) {
  for (const col of colliders) {
    if (circleVsPolygon(x, y, PLAYER_RADIUS, col.worldPoly)) {
      return true;
    }
  }
  return false;
}

/**
 * Test if a circle at (cx,cy) with radius r collides with a polygon.
 * Checks:
 * 1. Centre inside polygon
 * 2. Distance to any edge < radius
 */
function circleVsPolygon(cx, cy, r, polygon) {
  if (polygon.length < 3) return false;

  // Quick AABB check
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const [x,y] of polygon) {
    if(x<minX)minX=x; if(y<minY)minY=y;
    if(x>maxX)maxX=x; if(y>maxY)maxY=y;
  }
  if (cx+r < minX || cx-r > maxX || cy+r < minY || cy-r > maxY) return false;

  // Point in polygon (ray casting)
  if (pointInPolygon(cx, cy, polygon)) return true;

  // Edge distance check
  const r2 = r * r;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [ax,ay] = polygon[i];
    const [bx,by] = polygon[(i+1) % n];
    if (distToSegmentSq(cx,cy,ax,ay,bx,by) < r2) return true;
  }

  return false;
}

function pointInPolygon(px, py, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n-1; i < n; j = i++) {
    const [xi,yi] = polygon[i];
    const [xj,yj] = polygon[j];
    if (((yi>py) !== (yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegmentSq(px,py,ax,ay,bx,by) {
  const dx=bx-ax, dy=by-ay;
  const lenSq = dx*dx+dy*dy;
  if (lenSq===0) return (px-ax)**2+(py-ay)**2;
  let t = ((px-ax)*dx+(py-ay)*dy)/lenSq;
  t = Math.max(0,Math.min(1,t));
  return (px-(ax+t*dx))**2+(py-(ay+t*dy))**2;
}

/**
 * Count how many obstacle colliders a circle touches or is close to (< gap threshold)
 */
export function countCollidingObstacles(cx, cy, r, colliders) {
  let count = 0;
  for (const col of colliders) {
    if (circleVsPolygon(cx, cy, r, col.worldPoly)) {
      count++;
    }
  }
  return count;
}

/**
 * Move a point by (dx,dy) while checking collisions.
 * Returns { x, y, hit: boolean, squeeze: boolean }
 */
export function moveWithCollision(x, y, dx, dy, colliders) {
  const newX = Math.max(PLAYER_RADIUS, Math.min(FIELD_WIDTH - PLAYER_RADIUS, x + dx));
  const newY = Math.max(PLAYER_RADIUS, Math.min(FIELD_HEIGHT - PLAYER_RADIUS, y + dy));

  if (!checkCollision(newX, newY, colliders)) {
    return { x: newX, y: newY, hit: false, squeeze: false };
  }

  // Check if player is stuck/squeezing between multiple close obstacles
  const nearbyObstacles = countCollidingObstacles(x, y, PLAYER_RADIUS + 3.5, colliders);
  const isSqueeze = nearbyObstacles >= 2;

  // Try axis separately for wall-sliding
  const xOnly = Math.max(PLAYER_RADIUS, Math.min(FIELD_WIDTH - PLAYER_RADIUS, x + dx));
  if (!checkCollision(xOnly, y, colliders)) {
    return { x: xOnly, y, hit: true, squeeze: isSqueeze };
  }

  const yOnly = Math.max(PLAYER_RADIUS, Math.min(FIELD_HEIGHT - PLAYER_RADIUS, y + dy));
  if (!checkCollision(x, yOnly, colliders)) {
    return { x, y: yOnly, hit: true, squeeze: isSqueeze };
  }

  return { x, y, hit: true, squeeze: isSqueeze }; // completely blocked
}

/**
 * Check if player has reached the destination.
 */
export function checkDestination(x, y, destination, threshold = 20) {
  const dx = x - destination.x;
  const dy = y - destination.y;
  return Math.sqrt(dx*dx + dy*dy) < threshold;
}

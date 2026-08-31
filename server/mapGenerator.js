// server/mapGenerator.js
// Procedural map generation with seeded PRNG and A* validation

'use strict';

const { hasPath, pointNearOrInPolygon } = require('./pathValidator');
const { parseSvgPaths } = require('./svgParser');
const path = require('path');
const fs = require('fs');

// Game field dimensions
const FIELD_WIDTH = 360;
const FIELD_HEIGHT = 640;

// Obstacle constraints
const MAX_OBS_WIDTH = 90;
const MAX_OBS_HEIGHT = 40;
const MIN_GAP = 11;           // minimum passable gap (px)
const PLAYER_RADIUS = 5;      // dot is 10px diameter

// Safe zone radii around start/destination
const SAFE_RADIUS = 40;

// Max generation attempts
const MAX_MAP_ATTEMPTS = 50;
const MAX_OBS_ATTEMPTS = 20000; // high attempt count for dense packing

// SVG files available — now dynamically loaded from field folders (see server.js)
// SVG_NAMES is no longer used; folder selection happens inside generateMap()

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate a random integer in [min, max] inclusive
 */
function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Transform SVG polygon points by scale + rotation + translation
 * @param {Array} points - [[x,y],...] in normalized SVG space [0..1, 0..1]
 * @param {number} svgW - original SVG viewBox width
 * @param {number} svgH - original SVG viewBox height
 * @param {number} obsW - rendered width in px
 * @param {number} obsH - rendered height in px
 * @param {number} ox - obstacle top-left x
 * @param {number} oy - obstacle top-left y
 * @param {number} rotation - degrees (0/90/180/270)
 */
function transformPolygon(points, svgW, svgH, obsW, obsH, ox, oy, rotation) {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return points.map(([px, py]) => {
    // Scale from SVG coords to rendered size
    let x = (px / svgW) * obsW;
    let y = (py / svgH) * obsH;

    // Rotate around centre of rendered bounding box
    const cx = obsW / 2;
    const cy = obsH / 2;
    const rx = cos * (x - cx) - sin * (y - cy) + cx;
    const ry = sin * (x - cx) + cos * (y - cy) + cy;

    // Translate to world position
    return [rx + ox, ry + oy];
  });
}

/**
 * Check if two polygons (convex or not) overlap using SAT-ish AABB + separating axis
 * We use a simplified bounding-box + polygon intersection check.
 */
function getNormals(poly) {
  const normals = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i+1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) continue;
    normals.push([-dy/len, dx/len]);
  }
  return normals;
}

function projectPolygon(poly, normal) {
  let min = Infinity;
  let max = -Infinity;
  for (const pt of poly) {
    const proj = pt[0]*normal[0] + pt[1]*normal[1];
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return { min, max };
}

function polygonsOverlapWithGap(polyA, polyB, gap) {
  // Quick AABB rejection
  const aabb = (poly) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x,y] of poly) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  };
  const a = aabb(polyA);
  const b = aabb(polyB);
  if (a.maxX + gap < b.minX || b.maxX + gap < a.minX ||
      a.maxY + gap < b.minY || b.maxY + gap < a.minY) {
    return false; // clearly separated
  }

  // SAT Check
  const normals = [...getNormals(polyA), ...getNormals(polyB)];
  for (const normal of normals) {
    const projA = projectPolygon(polyA, normal);
    const projB = projectPolygon(polyB, normal);
    if (projA.max + gap < projB.min || projB.max + gap < projA.min) {
      return false; // Separating axis found
    }
  }

  return true; // Overlap
}

function distToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return (px-ax)**2 + (py-ay)**2;
  let t = ((px-ax)*dx + (py-ay)*dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (px-(ax+t*dx))**2 + (py-(ay+t*dy))**2;
}

/**
 * Check if obstacle polygon overlaps with safe zone (circle) around a point
 */
function obsOverlapsSafeZone(polygon, cx, cy, radius) {
  // Check if any point of polygon is within radius, or if circle centre is near polygon
  for (const [px, py] of polygon) {
    const d2 = (px-cx)**2 + (py-cy)**2;
    if (d2 < radius*radius) return true;
  }
  // Check polygon edges vs circle
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i+1)%n];
    if (distToSegmentSq(cx, cy, ax, ay, bx, by) < radius*radius) return true;
  }
  return false;
}

/**
 * Generate a complete validated map.
 * @param {Object} svgData   - { "folder/file.svg": { polygon, viewBoxW, viewBoxH }, ... }
 * @param {Object} byFolder  - { "folderName": ["folder/file.svg", ...], ... }
 * @returns {Object} mapData
 */
async function generateMap(svgData, byFolder) {
  // Pick a random theme folder for this match
  const folderNames = Object.keys(byFolder || {});
  let svgNamesForMatch;
  let chosenFolder = null;
  if (folderNames.length > 0) {
    chosenFolder = folderNames[Math.floor(Math.random() * folderNames.length)];
    svgNamesForMatch = byFolder[chosenFolder];
    console.log(`[MapGen] Using field theme: "${chosenFolder}" (${svgNamesForMatch.length} SVGs)`);
  } else {
    // Fallback to all keys if byFolder is empty
    svgNamesForMatch = Object.keys(svgData);
    console.log('[MapGen] No theme folders found, using all SVGs');
  }
  for (let attempt = 0; attempt < MAX_MAP_ATTEMPTS; attempt++) {
    const seed = Math.floor(Math.random() * 0xFFFFFFFF);
    const rng = mulberry32(seed);

    // Dynamic start and destination positions:
    // Start is always at the top side, Finish flag is always at the bottom side.
    // Distance between them spans 84% to 90% of field height (537.6px to 576px)
    const marginX = 40;
    const marginY = 32;
    const targetDist = FIELD_HEIGHT * (0.84 + rng() * 0.06); // 84% - 90% of field height

    let start, destination;
    let foundEndpoints = false;

    // Pick random top start position and calculate bottom destination
    for (let tryPt = 0; tryPt < 200; tryPt++) {
      const sx = randInt(rng, marginX, FIELD_WIDTH - marginX);
      const sy = randInt(rng, marginY, marginY + 30); // Top zone

      // Downward angles (pointing towards bottom)
      const angle = (Math.PI * 0.25) + rng() * (Math.PI * 0.5); // 45 deg to 135 deg downwards

      const dx = Math.round(sx + Math.cos(angle) * targetDist);
      const dy = Math.round(sy + Math.sin(angle) * targetDist);

      if (dx >= marginX && dx <= FIELD_WIDTH - marginX && dy >= FIELD_HEIGHT - marginY - 45 && dy <= FIELD_HEIGHT - marginY) {
        start = { x: sx, y: sy };
        destination = { x: dx, y: dy };
        foundEndpoints = true;
        break;
      }
    }

    if (!foundEndpoints) {
      // Direct top-to-bottom fallback ensuring 84-90% distance
      const startX = randInt(rng, marginX, FIELD_WIDTH - marginX);
      const destX = randInt(rng, marginX, FIELD_WIDTH - marginX);
      start = { x: startX, y: marginY + 10 };
      destination = { x: destX, y: Math.min(FIELD_HEIGHT - marginY, Math.round(start.y + targetDist)) };
    }

    const obstacles = [];

    // Try to place as many obstacles as possible
    for (let i = 0; i < MAX_OBS_ATTEMPTS; i++) {
      // Yield to event loop every 500 iterations to avoid blocking
      if (i > 0 && i % 500 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
      // Pick random SVG from the chosen theme folder
      const svgName = svgNamesForMatch[randInt(rng, 0, svgNamesForMatch.length - 1)];
      const svgInfo = svgData[svgName];
      if (!svgInfo) continue;

      const { polygon: svgPolygon, viewBoxW, viewBoxH } = svgInfo;
      const aspect = viewBoxW / viewBoxH;

      // Width should be exactly 36 px while maintaining ratio
      const obsW = 36;
      const obsH = Math.round(obsW / aspect);

      // Fully random rotation 0-359
      const rotation = randInt(rng, 0, 359);

      // Use max dimension for placement to avoid boundary issues during rotation
      const effectiveW = Math.max(obsW, obsH);
      const effectiveH = Math.max(obsW, obsH);

      // Random position (keep within field bounds, allowing corners)
      const margin = 0; // Use 0 margin so obstacles can touch the walls/corners
      const ox = randInt(rng, margin, FIELD_WIDTH - effectiveW - margin);
      const oy = randInt(rng, margin, FIELD_HEIGHT - effectiveH - margin);

      // Transform polygon to world coords
      const worldPoly = transformPolygon(svgPolygon, viewBoxW, viewBoxH, obsW, obsH, ox, oy, rotation);

      // Check overlap with safe zones
      if (obsOverlapsSafeZone(worldPoly, start.x, start.y, SAFE_RADIUS)) continue;
      if (obsOverlapsSafeZone(worldPoly, destination.x, destination.y, SAFE_RADIUS)) continue;

      // Check overlap with existing obstacles (+ gap)
      let overlaps = false;
      // 8% chance to place a tight blockage gap (2–9px): impassable for the 10px dot
      // 92% of the time use MIN_GAP (11px): just barely passable
      const isBlockage = randInt(rng, 0, 99) < 8;
      const currentGap = isBlockage ? randInt(rng, 2, 9) : MIN_GAP;

      for (const existing of obstacles) {
        if (polygonsOverlapWithGap(worldPoly, existing.worldPoly, currentGap)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      // Check obstacle stays within field bounds
      let outOfBounds = false;
      for (const [px, py] of worldPoly) {
        if (px < 0 || px > FIELD_WIDTH || py < 0 || py > FIELD_HEIGHT) {
          outOfBounds = true;
          break;
        }
      }
      if (outOfBounds) continue;

      obstacles.push({
        id: `obs-${obstacles.length}`,
        svg: svgName,
        x: ox,
        y: oy,
        width: obsW,
        height: obsH,
        rotation,
        worldPoly
      });
    }

    // Validate path exists
    const obsForPath = obstacles.map(o => ({ polygon: o.worldPoly }));
    if (!hasPath(FIELD_WIDTH, FIELD_HEIGHT, obsForPath, start, destination)) {
      continue; // regenerate
    }

    // Strip worldPoly from output (clients reconstruct from x,y,w,h,rotation,svgName)
    const cleanObstacles = obstacles.map(({ worldPoly: _, ...rest }) => rest);

    return {
      matchId: null, // set by matchmaking
      seed,
      fieldTheme: chosenFolder,
      fieldWidth: FIELD_WIDTH,
      fieldHeight: FIELD_HEIGHT,
      start,
      destination,
      obstacles: cleanObstacles
    };
  }

  // Fallback: return minimal map with no obstacles (should not happen normally)
  console.warn('[MapGen] All attempts failed, returning minimal map');
  return {
    seed: 0,
    fieldWidth: FIELD_WIDTH,
    fieldHeight: FIELD_HEIGHT,
    start: { x: 180, y: 60 },
    destination: { x: 180, y: 580 },
    obstacles: []
  };
}

module.exports = { generateMap };

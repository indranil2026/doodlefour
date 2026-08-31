// server/pathValidator.js
// A* pathfinding for map validation
// Validates that a 10px player dot can navigate from start to destination

'use strict';

const CELL_SIZE = 5;         // grid resolution in pixels
const PLAYER_RADIUS = 5;     // half of 10px dot

/**
 * Build a boolean occupancy grid from obstacle polygons.
 * @param {number} width  - game field width in px
 * @param {number} height - game field height in px
 * @param {Array}  obstacles - array of { polygon: [[x,y],...] }
 * @returns {Uint8Array} flat grid: 0=free, 1=blocked
 */
function buildGrid(width, height, obstacles) {
  const cols = Math.ceil(width / CELL_SIZE);
  const rows = Math.ceil(height / CELL_SIZE);
  const grid = new Uint8Array(cols * rows); // all 0

  for (const obs of obstacles) {
    if (!obs.polygon || obs.polygon.length < 3) continue;

    // Get bounding box of polygon (inflated by player radius)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of obs.polygon) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    minX -= PLAYER_RADIUS;
    minY -= PLAYER_RADIUS;
    maxX += PLAYER_RADIUS;
    maxY += PLAYER_RADIUS;

    // For each grid cell in bounding box, check if centre is inside
    // the inflated polygon (Minkowski sum approximation via point test on inflated poly)
    const cMinX = Math.max(0, Math.floor(minX / CELL_SIZE));
    const cMinY = Math.max(0, Math.floor(minY / CELL_SIZE));
    const cMaxX = Math.min(cols - 1, Math.ceil(maxX / CELL_SIZE));
    const cMaxY = Math.min(rows - 1, Math.ceil(maxY / CELL_SIZE));

    for (let cy = cMinY; cy <= cMaxY; cy++) {
      for (let cx = cMinX; cx <= cMaxX; cx++) {
        const wx = cx * CELL_SIZE + CELL_SIZE / 2;
        const wy = cy * CELL_SIZE + CELL_SIZE / 2;
        // Check distance to nearest edge of polygon >= PLAYER_RADIUS
        // We use point-in-inflated-polygon: test the original polygon
        // expanded by PLAYER_RADIUS using a simple circle-swept approach
        if (pointNearOrInPolygon(wx, wy, obs.polygon, PLAYER_RADIUS)) {
          grid[cy * cols + cx] = 1;
        }
      }
    }
  }

  return { grid, cols, rows };
}

/**
 * Returns true if point (px,py) is inside the polygon or within `radius` of any edge.
 */
function pointNearOrInPolygon(px, py, polygon, radius) {
  // 1. Point in polygon test (ray casting)
  if (pointInPolygon(px, py, polygon)) return true;
  // 2. Distance to any edge < radius
  const r2 = radius * radius;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % n];
    if (distToSegmentSq(px, py, ax, ay, bx, by) < r2) return true;
  }
  return false;
}

function pointInPolygon(px, py, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}

/**
 * A* search on the occupancy grid.
 * @returns {boolean} true if a valid path exists
 */
function hasPath(width, height, obstacles, start, destination) {
  const { grid, cols, rows } = buildGrid(width, height, obstacles);

  const toCell = (x, y) => ({
    c: Math.floor(x / CELL_SIZE),
    r: Math.floor(y / CELL_SIZE)
  });

  const sc = toCell(start.x, start.y);
  const dc = toCell(destination.x, destination.y);

  // If start or destination cells are blocked, invalid
  if (grid[sc.r * cols + sc.c] === 1) return false;
  if (grid[dc.r * cols + dc.c] === 1) return false;

  const key = (c, r) => r * cols + c;
  const heuristic = (c, r) => Math.abs(c - dc.c) + Math.abs(r - dc.r);

  const open = new MinHeap((a, b) => a.f - b.f);
  const gScore = new Map();
  const startKey = key(sc.c, sc.r);
  gScore.set(startKey, 0);
  open.push({ c: sc.c, r: sc.r, f: heuristic(sc.c, sc.r) });

  const dirs = [
    [1,0],[-1,0],[0,1],[0,-1],
    [1,1],[1,-1],[-1,1],[-1,-1]
  ];

  while (open.size() > 0) {
    const cur = open.pop();
    if (cur.c === dc.c && cur.r === dc.r) return true;

    const curKey = key(cur.c, cur.r);
    const curG = gScore.get(curKey);

    for (const [dc2, dr2] of dirs) {
      const nc = cur.c + dc2;
      const nr = cur.r + dr2;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (grid[nr * cols + nc] === 1) continue;

      const stepCost = (dc2 !== 0 && dr2 !== 0) ? 1.414 : 1;
      const ng = curG + stepCost;
      const nk = key(nc, nr);
      if (!gScore.has(nk) || ng < gScore.get(nk)) {
        gScore.set(nk, ng);
        open.push({ c: nc, r: nr, f: ng + heuristic(nc, nr) });
      }
    }
  }

  return false;
}

// Simple binary heap (min-heap)
class MinHeap {
  constructor(comparator) {
    this._data = [];
    this._cmp = comparator;
  }
  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }
  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  size() { return this._data.length; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._cmp(this._data[i], this._data[parent]) < 0) {
        [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
        i = parent;
      } else break;
    }
  }
  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this._cmp(this._data[l], this._data[smallest]) < 0) smallest = l;
      if (r < n && this._cmp(this._data[r], this._data[smallest]) < 0) smallest = r;
      if (smallest !== i) {
        [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]];
        i = smallest;
      } else break;
    }
  }
}

module.exports = { hasPath, buildGrid, pointInPolygon, pointNearOrInPolygon };

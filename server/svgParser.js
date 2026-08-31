// server/svgParser.js
// Parses SVG files to extract polygon points for collision detection
// Uses a simplified path data sampler

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse a number from path data string at given index.
 * Returns { value, newIndex }
 */
function parseNumber(str, i) {
  let start = i;
  // skip whitespace and commas
  while (i < str.length && (str[i] === ' ' || str[i] === ',' || str[i] === '\n' || str[i] === '\r' || str[i] === '\t')) i++;
  start = i;
  if (i < str.length && (str[i] === '-' || str[i] === '+')) i++;
  while (i < str.length && ((str[i] >= '0' && str[i] <= '9') || str[i] === '.')) i++;
  // handle exponent
  if (i < str.length && (str[i] === 'e' || str[i] === 'E')) {
    i++;
    if (i < str.length && (str[i] === '-' || str[i] === '+')) i++;
    while (i < str.length && str[i] >= '0' && str[i] <= '9') i++;
  }
  return { value: parseFloat(str.substring(start, i)), newIndex: i };
}

/**
 * Parse SVG path 'd' attribute into an array of polygon points.
 * We sample points along the path curves and straight segments.
 * Returns [[x, y], ...]
 */
function parseSvgPathD(d) {
  const points = [];
  let i = 0;
  let cx = 0, cy = 0;  // current position
  let startX = 0, startY = 0;

  const readNum = () => {
    const res = parseNumber(d, i);
    i = res.newIndex;
    // skip separators after
    while (i < d.length && (d[i] === ' ' || d[i] === ',' || d[i] === '\t')) i++;
    return res.value;
  };

  const addPt = (x, y) => points.push([x, y]);

  // Sample a cubic bezier curve
  const sampleCubic = (x0, y0, x1, y1, x2, y2, x3, y3, steps = 8) => {
    for (let t = 0; t <= 1; t += 1/steps) {
      const mt = 1 - t;
      const bx = mt**3*x0 + 3*mt**2*t*x1 + 3*mt*t**2*x2 + t**3*x3;
      const by = mt**3*y0 + 3*mt**2*t*y1 + 3*mt*t**2*y2 + t**3*y3;
      addPt(bx, by);
    }
  };

  // Sample a quadratic bezier
  const sampleQuad = (x0, y0, x1, y1, x2, y2, steps = 6) => {
    for (let t = 0; t <= 1; t += 1/steps) {
      const mt = 1 - t;
      const bx = mt**2*x0 + 2*mt*t*x1 + t**2*x2;
      const by = mt**2*y0 + 2*mt*t*y1 + t**2*y2;
      addPt(bx, by);
    }
  };

  let lastCmd = '';
  let lastCPX = 0, lastCPY = 0; // for smooth curves

  while (i < d.length) {
    // skip whitespace
    while (i < d.length && (d[i] === ' ' || d[i] === '\n' || d[i] === '\r' || d[i] === '\t')) i++;
    if (i >= d.length) break;

    let cmd = d[i];
    if (/[a-zA-Z]/.test(cmd)) {
      i++;
    } else {
      cmd = lastCmd; // implicit repetition
    }
    lastCmd = cmd;

    const abs = cmd === cmd.toUpperCase();

    switch (cmd.toUpperCase()) {
      case 'M': {
        let x = readNum(), y = readNum();
        if (!abs) { x += cx; y += cy; }
        cx = x; cy = y; startX = x; startY = y;
        addPt(cx, cy);
        // Subsequent coords are L
        lastCmd = abs ? 'L' : 'l';
        break;
      }
      case 'L': {
        let x = readNum(), y = readNum();
        if (!abs) { x += cx; y += cy; }
        cx = x; cy = y;
        addPt(cx, cy);
        break;
      }
      case 'H': {
        let x = readNum();
        if (!abs) x += cx;
        cx = x;
        addPt(cx, cy);
        break;
      }
      case 'V': {
        let y = readNum();
        if (!abs) y += cy;
        cy = y;
        addPt(cx, cy);
        break;
      }
      case 'C': {
        let x1 = readNum(), y1 = readNum();
        let x2 = readNum(), y2 = readNum();
        let x = readNum(), y = readNum();
        if (!abs) { x1+=cx; y1+=cy; x2+=cx; y2+=cy; x+=cx; y+=cy; }
        sampleCubic(cx, cy, x1, y1, x2, y2, x, y);
        lastCPX = x2; lastCPY = y2;
        cx = x; cy = y;
        break;
      }
      case 'S': {
        let x2 = readNum(), y2 = readNum();
        let x = readNum(), y = readNum();
        if (!abs) { x2+=cx; y2+=cy; x+=cx; y+=cy; }
        const x1 = 2*cx - lastCPX;
        const y1 = 2*cy - lastCPY;
        sampleCubic(cx, cy, x1, y1, x2, y2, x, y);
        lastCPX = x2; lastCPY = y2;
        cx = x; cy = y;
        break;
      }
      case 'Q': {
        let x1 = readNum(), y1 = readNum();
        let x = readNum(), y = readNum();
        if (!abs) { x1+=cx; y1+=cy; x+=cx; y+=cy; }
        sampleQuad(cx, cy, x1, y1, x, y);
        lastCPX = x1; lastCPY = y1;
        cx = x; cy = y;
        break;
      }
      case 'T': {
        let x = readNum(), y = readNum();
        if (!abs) { x+=cx; y+=cy; }
        const x1 = 2*cx - lastCPX;
        const y1 = 2*cy - lastCPY;
        sampleQuad(cx, cy, x1, y1, x, y);
        lastCPX = x1; lastCPY = y1;
        cx = x; cy = y;
        break;
      }
      case 'A': {
        // Arc — sample as line segments approximation
        const rx = Math.abs(readNum());
        const ry = Math.abs(readNum());
        const xRot = readNum();
        const largeArc = readNum();
        const sweep = readNum();
        let x = readNum(), y = readNum();
        if (!abs) { x+=cx; y+=cy; }
        // Simple approximation: sample 8 points
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          addPt(cx + (x-cx)*t, cy + (y-cy)*t);
        }
        cx = x; cy = y;
        break;
      }
      case 'Z': {
        cx = startX; cy = startY;
        addPt(cx, cy);
        break;
      }
      default: {
        // Unknown command, skip
        i++;
        break;
      }
    }
  }

  return points;
}

/**
 * Load an SVG file and extract polygon points + viewBox dimensions.
 */
function loadSvgFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract viewBox
  const vbMatch = content.match(/viewBox=["']([^"']+)["']/);
  let viewBoxW = 100, viewBoxH = 100;
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/);
    viewBoxW = parseFloat(parts[2]) || 100;
    viewBoxH = parseFloat(parts[3]) || 100;
  } else {
    // Try width/height attrs — match with or without px/quotes styles
    const wm = content.match(/\bwidth=["']?([0-9.]+)["']?/);
    const hm = content.match(/\bheight=["']?([0-9.]+)["']?/);
    if (wm) viewBoxW = parseFloat(wm[1]);
    if (hm) viewBoxH = parseFloat(hm[1]);
  }

  // Extract all path d attributes
  const allPoints = [];
  const pathRegex = /\bd=["']([^"']+)["']/g;
  let match;
  while ((match = pathRegex.exec(content)) !== null) {
    const pts = parseSvgPathD(match[1]);
    allPoints.push(...pts);
  }

  // Compute convex hull to get a clean polygon
  const hull = convexHull(allPoints);

  return { polygon: hull, viewBoxW, viewBoxH };
}

/**
 * Compute convex hull using Graham scan
 */
function convexHull(points) {
  if (points.length < 3) return points;

  // Remove duplicates
  const unique = [...new Set(points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`))].map(s => s.split(',').map(Number));

  if (unique.length < 3) return unique;

  // Find pivot (lowest y, then leftmost x)
  let pivot = unique.reduce((best, p) =>
    p[1] < best[1] || (p[1] === best[1] && p[0] < best[0]) ? p : best
  );

  // Sort by polar angle from pivot
  const sorted = unique.filter(p => p !== pivot).sort((a, b) => {
    const angA = Math.atan2(a[1]-pivot[1], a[0]-pivot[0]);
    const angB = Math.atan2(b[1]-pivot[1], b[0]-pivot[0]);
    if (angA !== angB) return angA - angB;
    const dA = (a[0]-pivot[0])**2 + (a[1]-pivot[1])**2;
    const dB = (b[0]-pivot[0])**2 + (b[1]-pivot[1])**2;
    return dA - dB;
  });

  const hull = [pivot, sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    while (hull.length > 1 && cross(hull[hull.length-2], hull[hull.length-1], sorted[i]) <= 0) {
      hull.pop();
    }
    hull.push(sorted[i]);
  }

  return hull;
}

function cross(O, A, B) {
  return (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
}

/**
 * Load all SVG files from a directory.
 * Returns { filename: { polygon, viewBoxW, viewBoxH }, ... }
 */
function loadAllSvgs(svgDir) {
  const svgData = {};
  const files = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg'));
  for (const file of files) {
    try {
      svgData[file] = loadSvgFile(path.join(svgDir, file));
      console.log(`[SVGParser] Loaded ${file}: ${svgData[file].polygon.length} hull points, viewBox ${svgData[file].viewBoxW}x${svgData[file].viewBoxH}`);
    } catch (e) {
      console.error(`[SVGParser] Failed to load ${file}:`, e.message);
    }
  }
  return svgData;
}

/**
 * Load all SVG files from themed subfolders inside a field directory.
 * Returns:
 *   svgData:   { "folderName/filename.svg": { polygon, viewBoxW, viewBoxH }, ... }
 *   byFolder:  { "folderName": ["folderName/filename.svg", ...], ... }
 */
function loadAllSvgsFromFieldFolders(fieldDir) {
  const svgData = {};
  const byFolder = {};

  let folders;
  try {
    folders = fs.readdirSync(fieldDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (e) {
    console.error(`[SVGParser] Cannot read field dir ${fieldDir}:`, e.message);
    return { svgData, byFolder };
  }

  for (const folder of folders) {
    const folderPath = path.join(fieldDir, folder);
    let files;
    try {
      files = fs.readdirSync(folderPath).filter(f => f.endsWith('.svg'));
    } catch (e) {
      console.error(`[SVGParser] Cannot read folder ${folderPath}:`, e.message);
      continue;
    }

    byFolder[folder] = [];

    for (const file of files) {
      const key = `${folder}/${file}`;
      try {
        svgData[key] = loadSvgFile(path.join(folderPath, file));
        byFolder[folder].push(key);
        console.log(`[SVGParser] Loaded field/${key}: ${svgData[key].polygon.length} hull points, viewBox ${svgData[key].viewBoxW}x${svgData[key].viewBoxH}`);
      } catch (e) {
        console.error(`[SVGParser] Failed to load field/${key}:`, e.message);
      }
    }

    if (byFolder[folder].length === 0) delete byFolder[folder];
  }

  return { svgData, byFolder };
}

module.exports = { loadAllSvgs, loadSvgFile, parseSvgPathD, convexHull, loadAllSvgsFromFieldFolders };

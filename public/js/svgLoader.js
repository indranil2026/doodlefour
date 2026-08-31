// public/js/svgLoader.js
// Loads and caches SVG polygon data from server for client-side collision

const cache = {}; // svgName -> polygon [[x,y],...]

/**
 * Fetch and parse an SVG file to extract polygon points (convex hull).
 * Uses the same path sampling approach as the server.
 */
export async function loadSvgPolygon(svgName) {
  if (cache[svgName]) return cache[svgName];

  try {
    const res = await fetch(`/svg/field/${svgName}`);
    const text = await res.text();

    const { polygon, viewBoxW, viewBoxH } = parseSvgContent(text);
    cache[svgName] = { polygon, viewBoxW, viewBoxH };
    return cache[svgName];
  } catch (e) {
    console.error(`[SVGLoader] Failed to load ${svgName}:`, e);
    return { polygon: [[0,0],[1,0],[1,1],[0,1]], viewBoxW: 1, viewBoxH: 1 };
  }
}

/**
 * Preload all SVGs in a map's obstacle list.
 */
export async function preloadMapSvgs(obstacles) {
  const names = [...new Set(obstacles.map(o => o.svg))];
  await Promise.all(names.map(name => loadSvgPolygon(name)));
}

/**
 * Parse SVG content and extract convex hull polygon + viewBox.
 */
function parseSvgContent(text) {
  // Extract viewBox
  const vbMatch = text.match(/viewBox=["']([^"']+)["']/);
  let viewBoxW = 100, viewBoxH = 100;
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/);
    viewBoxW = parseFloat(parts[2]) || 100;
    viewBoxH = parseFloat(parts[3]) || 100;
  } else {
    // Fall back to width/height attributes (with or without px)
    const wm = text.match(/\bwidth=["']?([0-9.]+)["']?/);
    const hm = text.match(/\bheight=["']?([0-9.]+)["']?/);
    if (wm) viewBoxW = parseFloat(wm[1]);
    if (hm) viewBoxH = parseFloat(hm[1]);
  }

  // Extract all path d attributes
  const allPoints = [];
  const pathRegex = /\bd=["']([^"']+)["']/g;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    const pts = parseSvgPathD(match[1]);
    allPoints.push(...pts);
  }

  const hull = convexHull(allPoints);
  return { polygon: hull, viewBoxW, viewBoxH };
}

function parseSvgPathD(d) {
  const points = [];
  let i = 0;
  let cx = 0, cy = 0;
  let startX = 0, startY = 0;

  const readNum = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
    const start = i;
    if (i < d.length && /[+-]/.test(d[i])) i++;
    while (i < d.length && /[0-9.]/.test(d[i])) i++;
    if (i < d.length && /[eE]/.test(d[i])) {
      i++;
      if (i < d.length && /[+-]/.test(d[i])) i++;
      while (i < d.length && /[0-9]/.test(d[i])) i++;
    }
    const v = parseFloat(d.substring(start, i));
    while (i < d.length && /[\s,]/.test(d[i])) i++;
    return isNaN(v) ? 0 : v;
  };

  const addPt = (x, y) => points.push([x, y]);

  const sampleCubic = (x0,y0,x1,y1,x2,y2,x3,y3,steps=8) => {
    for (let t=0; t<=1; t+=1/steps) {
      const mt=1-t;
      addPt(mt**3*x0+3*mt**2*t*x1+3*mt*t**2*x2+t**3*x3,
            mt**3*y0+3*mt**2*t*y1+3*mt*t**2*y2+t**3*y3);
    }
  };

  const sampleQuad = (x0,y0,x1,y1,x2,y2,steps=6) => {
    for (let t=0; t<=1; t+=1/steps) {
      const mt=1-t;
      addPt(mt**2*x0+2*mt*t*x1+t**2*x2, mt**2*y0+2*mt*t*y1+t**2*y2);
    }
  };

  let lastCmd = 'M';
  let lastCPX = 0, lastCPY = 0;

  while (i < d.length) {
    while (i < d.length && /\s/.test(d[i])) i++;
    if (i >= d.length) break;

    let cmd = d[i];
    if (/[a-zA-Z]/.test(cmd)) { i++; }
    else { cmd = lastCmd; }
    lastCmd = cmd;

    const abs = cmd === cmd.toUpperCase();

    switch (cmd.toUpperCase()) {
      case 'M': {
        let x=readNum(), y=readNum();
        if (!abs){x+=cx;y+=cy;}
        cx=x;cy=y;startX=x;startY=y;addPt(cx,cy);
        lastCmd = abs?'L':'l';
        break;
      }
      case 'L': {
        let x=readNum(),y=readNum();
        if(!abs){x+=cx;y+=cy;}
        cx=x;cy=y;addPt(cx,cy);
        break;
      }
      case 'H': {
        let x=readNum();if(!abs)x+=cx;cx=x;addPt(cx,cy);break;
      }
      case 'V': {
        let y=readNum();if(!abs)y+=cy;cy=y;addPt(cx,cy);break;
      }
      case 'C': {
        let x1=readNum(),y1=readNum(),x2=readNum(),y2=readNum(),x=readNum(),y=readNum();
        if(!abs){x1+=cx;y1+=cy;x2+=cx;y2+=cy;x+=cx;y+=cy;}
        sampleCubic(cx,cy,x1,y1,x2,y2,x,y);
        lastCPX=x2;lastCPY=y2;cx=x;cy=y;
        break;
      }
      case 'S': {
        let x2=readNum(),y2=readNum(),x=readNum(),y=readNum();
        if(!abs){x2+=cx;y2+=cy;x+=cx;y+=cy;}
        sampleCubic(cx,cy,2*cx-lastCPX,2*cy-lastCPY,x2,y2,x,y);
        lastCPX=x2;lastCPY=y2;cx=x;cy=y;
        break;
      }
      case 'Q': {
        let x1=readNum(),y1=readNum(),x=readNum(),y=readNum();
        if(!abs){x1+=cx;y1+=cy;x+=cx;y+=cy;}
        sampleQuad(cx,cy,x1,y1,x,y);lastCPX=x1;lastCPY=y1;cx=x;cy=y;
        break;
      }
      case 'T': {
        let x=readNum(),y=readNum();
        if(!abs){x+=cx;y+=cy;}
        sampleQuad(cx,cy,2*cx-lastCPX,2*cy-lastCPY,x,y);
        lastCPX=2*cx-lastCPX;lastCPY=2*cy-lastCPY;cx=x;cy=y;
        break;
      }
      case 'A': {
        readNum();readNum();readNum();readNum();readNum();
        let x=readNum(),y=readNum();
        if(!abs){x+=cx;y+=cy;}
        for(let s=1;s<=8;s++) addPt(cx+(x-cx)*s/8, cy+(y-cy)*s/8);
        cx=x;cy=y;
        break;
      }
      case 'Z': {
        cx=startX;cy=startY;addPt(cx,cy);break;
      }
      default: i++; break;
    }
  }
  return points;
}

function convexHull(points) {
  if (points.length < 3) return points;
  const unique = [...new Map(points.map(p => [`${p[0].toFixed(1)},${p[1].toFixed(1)}`, p])).values()];
  if (unique.length < 3) return unique;

  let pivot = unique.reduce((b,p) => p[1]<b[1]||(p[1]===b[1]&&p[0]<b[0])?p:b);
  const sorted = unique.filter(p=>p!==pivot).sort((a,b)=>{
    const aa=Math.atan2(a[1]-pivot[1],a[0]-pivot[0]);
    const bb=Math.atan2(b[1]-pivot[1],b[0]-pivot[0]);
    if(aa!==bb) return aa-bb;
    return ((a[0]-pivot[0])**2+(a[1]-pivot[1])**2)-((b[0]-pivot[0])**2+(b[1]-pivot[1])**2);
  });

  const hull=[pivot,sorted[0]];
  for(let i=1;i<sorted.length;i++){
    while(hull.length>1){
      const [O,A,B]=[hull[hull.length-2],hull[hull.length-1],sorted[i]];
      if((A[0]-O[0])*(B[1]-O[1])-(A[1]-O[1])*(B[0]-O[0])>0) break;
      hull.pop();
    }
    hull.push(sorted[i]);
  }
  return hull;
}

export function getCachedPolygon(svgName) {
  return cache[svgName] || null;
}

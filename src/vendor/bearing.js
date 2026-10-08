// ⚠ VENDORED — DO NOT EDIT. @gcu/bearing, the structural-geology engine (projections, vectors, statistics),
// copied from ../auditable/ext/bearing/index.js, itself synced from gentropic/bearing.js dist/bearing.mjs.
// Re-vendor by copying that file here. golem uses conversions, vec3 and equalArea.

// ⚠ VENDORED — DO NOT EDIT. @gcu/bearing v0.2.2, built ESM bundle.
// Source of truth: gentropic/bearing.js (dist/bearing.mjs). Update with:
//   node ext/bearing/sync.mjs
// See ext/bearing/README.md.

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/conversions.js
var conversions_exports = {};
__export(conversions_exports, {
  dcosToLine: () => dcosToLine,
  dcosToPlane: () => dcosToPlane,
  lineOnPlane: () => lineOnPlane,
  lineToDcos: () => lineToDcos,
  linesToDcos: () => linesToDcos,
  planeIntersectionLine: () => planeIntersectionLine,
  planeToDcos: () => planeToDcos,
  planesToDcos: () => planesToDcos,
  rakeToDcos: () => rakeToDcos,
  rakeToLine: () => rakeToLine,
  rotateDcos: () => rotateDcos,
  rotateDcosArray: () => rotateDcosArray,
  strikeToDD: () => strikeToDD
});

// src/core/vec3.js
var vec3_exports = {};
__export(vec3_exports, {
  add: () => add,
  angle: () => angle,
  create: () => create,
  cross: () => cross,
  dot: () => dot,
  length: () => length,
  negate: () => negate,
  normalize: () => normalize,
  rotate: () => rotate,
  scale: () => scale,
  sub: () => sub
});
function create(x = 0, y = 0, z = 0) {
  return [x, y, z];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function length(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
function normalize(v) {
  const len = length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}
function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function negate(v) {
  return [-v[0], -v[1], -v[2]];
}
function angle(a, b) {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}
function rotate(v, axis, theta) {
  const k = normalize(axis);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const kDotV = dot(k, v);
  const kCrossV = cross(k, v);
  return [
    v[0] * cosT + kCrossV[0] * sinT + k[0] * kDotV * (1 - cosT),
    v[1] * cosT + kCrossV[1] * sinT + k[1] * kDotV * (1 - cosT),
    v[2] * cosT + kCrossV[2] * sinT + k[2] * kDotV * (1 - cosT)
  ];
}

// src/core/conversions.js
var DEG = Math.PI / 180;
var INV_DEG = 180 / Math.PI;
function planeToDcos(dd, dip) {
  const ddR = dd * DEG;
  const dipR = dip * DEG;
  return [
    -Math.sin(dipR) * Math.sin(ddR),
    -Math.sin(dipR) * Math.cos(ddR),
    -Math.cos(dipR)
  ];
}
function dcosToPlane(dcos) {
  let [x, y, z] = dcos;
  if (z > 0) {
    x = -x;
    y = -y;
    z = -z;
  }
  const dip = Math.acos(Math.max(-1, Math.min(1, -z))) * INV_DEG;
  let dd = Math.atan2(-x, -y) * INV_DEG;
  if (dd < 0) dd += 360;
  return [dd, dip];
}
function lineToDcos(trend, plunge) {
  const tR = trend * DEG;
  const pR = plunge * DEG;
  return [
    Math.cos(pR) * Math.sin(tR),
    Math.cos(pR) * Math.cos(tR),
    -Math.sin(pR)
  ];
}
function dcosToLine(dcos) {
  let [x, y, z] = dcos;
  if (z > 0) {
    x = -x;
    y = -y;
    z = -z;
  }
  const plunge = Math.asin(Math.max(-1, Math.min(1, -z))) * INV_DEG;
  let trend = Math.atan2(x, y) * INV_DEG;
  if (trend < 0) trend += 360;
  return [trend, plunge];
}
function strikeToDD(strike, dip) {
  return [(strike + 90) % 360, dip];
}
function planesToDcos(planes) {
  return planes.map(([dd, dip]) => planeToDcos(dd, dip));
}
function linesToDcos(lines) {
  return lines.map(([t, p]) => lineToDcos(t, p));
}
function rakeToDcos(dd, dip, rake) {
  const ddR = dd * DEG;
  const dR = dip * DEG;
  const rk = rake * DEG;
  return [
    Math.sin(rk) * Math.cos(dR) * Math.sin(ddR) - Math.cos(rk) * Math.cos(ddR),
    Math.sin(rk) * Math.cos(dR) * Math.cos(ddR) + Math.cos(rk) * Math.sin(ddR),
    -Math.sin(rk) * Math.sin(dR)
  ];
}
function rakeToLine(dd, dip, rake) {
  return dcosToLine(rakeToDcos(dd, dip, rake));
}
function lineOnPlane(dd, dip, trend, plunge) {
  const ddR = dd * DEG;
  const dR = dip * DEG;
  const tR = trend * DEG;
  const pR = plunge * DEG;
  const lx = Math.cos(pR) * Math.sin(tR);
  const ly = Math.cos(pR) * Math.cos(tR);
  const lz = -Math.sin(pR);
  const sx = -Math.cos(ddR);
  const sy = Math.sin(ddR);
  const dx = Math.cos(dR) * Math.sin(ddR);
  const dy = Math.cos(dR) * Math.cos(ddR);
  const dz = -Math.sin(dR);
  const alongStrike = lx * sx + ly * sy;
  const alongDip = lx * dx + ly * dy + lz * dz;
  return Math.atan2(alongDip, alongStrike) * INV_DEG;
}
function planeIntersectionLine(dd1, dip1, dd2, dip2) {
  const pole1 = planeToDcos(dd1, dip1);
  const pole2 = planeToDcos(dd2, dip2);
  const c = cross(pole1, pole2);
  const len = length(c);
  if (len < 1e-10) return null;
  const n = normalize(c);
  return dcosToLine(n);
}
function rotateDcos(dcos, axis, angle3) {
  const theta = angle3 * DEG;
  return rotate(dcos, axis, theta);
}
function rotateDcosArray(dcosArray, axis, angle3) {
  const theta = angle3 * DEG;
  return dcosArray.map((d) => rotate(d, axis, theta));
}

// src/core/curves.js
var curves_exports = {};
__export(curves_exports, {
  arc: () => arc,
  ellipse: () => ellipse,
  greatCircle: () => greatCircle,
  planeIntersection: () => planeIntersection,
  smallCircle: () => smallCircle
});
function greatCircle(pole, nPoints = 180) {
  const p = normalize(pole);
  const ref = Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(p, ref));
  const v = cross(p, u);
  const step = 2 * Math.PI / nPoints;
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const theta = i * step;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push([
      u[0] * cos + v[0] * sin,
      u[1] * cos + v[1] * sin,
      u[2] * cos + v[2] * sin
    ]);
  }
  return points;
}
function smallCircle(axis, halfAngle, nPoints = 180) {
  const a = normalize(axis);
  const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(a, ref));
  const v = cross(a, u);
  const cosH = Math.cos(halfAngle);
  const sinH = Math.sin(halfAngle);
  const step = 2 * Math.PI / nPoints;
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const theta = i * step;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push([
      a[0] * cosH + (u[0] * cos + v[0] * sin) * sinH,
      a[1] * cosH + (u[1] * cos + v[1] * sin) * sinH,
      a[2] * cosH + (u[2] * cos + v[2] * sin) * sinH
    ]);
  }
  return points;
}
function ellipse(axis, majorDir, semiMajor, semiMinor, nPoints = 120) {
  const a = normalize(axis);
  let u = sub(majorDir, scale(a, dot(majorDir, a)));
  if (length(u) < 1e-10) {
    const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    u = cross(a, ref);
  }
  u = normalize(u);
  const w = cross(a, u);
  const step = 2 * Math.PI / nPoints;
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const phi = i * step;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const denom = Math.sqrt(
      semiMinor * semiMinor * cp * cp + semiMajor * semiMajor * sp * sp
    );
    const rho = denom > 1e-12 ? semiMajor * semiMinor / denom : 0;
    const cr = Math.cos(rho), sr = Math.sin(rho);
    const t0 = u[0] * cp + w[0] * sp;
    const t1 = u[1] * cp + w[1] * sp;
    const t2 = u[2] * cp + w[2] * sp;
    points.push([a[0] * cr + t0 * sr, a[1] * cr + t1 * sr, a[2] * cr + t2 * sr]);
  }
  return points;
}
function arc(a, b, nPoints = 60) {
  const na = normalize(a);
  const nb = normalize(b);
  const theta = angle(na, nb);
  if (theta < 1e-10) return [na];
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    const angle3 = t * theta;
    points.push(rotate(na, normalize(cross(na, nb)), angle3));
  }
  return points;
}
function planeIntersection(pole1, pole2) {
  const c = cross(pole1, pole2);
  const len = length(c);
  if (len < 1e-10) return null;
  const n = normalize(c);
  return [n, negate(n)];
}

// src/core/mat3.js
var mat3_exports = {};
__export(mat3_exports, {
  identity: () => identity,
  multiply: () => multiply,
  orthonormalize: () => orthonormalize,
  rotationBetween: () => rotationBetween,
  rotationFromAxisAngle: () => rotationFromAxisAngle,
  transformVec3: () => transformVec3,
  transpose: () => transpose
});
function identity() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}
function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}
function transformVec3(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
  ];
}
function rotationFromAxisAngle(axis, theta) {
  const [kx, ky, kz] = axis;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;
  return [
    c + kx * kx * t,
    kx * ky * t - kz * s,
    kx * kz * t + ky * s,
    ky * kx * t + kz * s,
    c + ky * ky * t,
    ky * kz * t - kx * s,
    kz * kx * t - ky * s,
    kz * ky * t + kx * s,
    c + kz * kz * t
  ];
}
function rotationBetween(a, b) {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const dot2 = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const angle3 = Math.atan2(crossLen, dot2);
  if (angle3 < 1e-9) return identity();
  let axis;
  if (crossLen < 1e-9) {
    const ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    axis = [
      a[1] * ref[2] - a[2] * ref[1],
      a[2] * ref[0] - a[0] * ref[2],
      a[0] * ref[1] - a[1] * ref[0]
    ];
  } else {
    axis = [cx, cy, cz];
  }
  const len = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
  return rotationFromAxisAngle([axis[0] / len, axis[1] / len, axis[2] / len], angle3);
}
function transpose(m) {
  return [
    m[0],
    m[3],
    m[6],
    m[1],
    m[4],
    m[7],
    m[2],
    m[5],
    m[8]
  ];
}
function orthonormalize(m) {
  let r0 = [m[0], m[1], m[2]];
  let r1 = [m[3], m[4], m[5]];
  let r23;
  let len = Math.sqrt(r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2]);
  r0 = [r0[0] / len, r0[1] / len, r0[2] / len];
  let d = r1[0] * r0[0] + r1[1] * r0[1] + r1[2] * r0[2];
  r1 = [r1[0] - d * r0[0], r1[1] - d * r0[1], r1[2] - d * r0[2]];
  len = Math.sqrt(r1[0] * r1[0] + r1[1] * r1[1] + r1[2] * r1[2]);
  r1 = [r1[0] / len, r1[1] / len, r1[2] / len];
  r23 = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0]
  ];
  return [
    r0[0],
    r0[1],
    r0[2],
    r1[0],
    r1[1],
    r1[2],
    r23[0],
    r23[1],
    r23[2]
  ];
}

// src/projections/equal-area.js
var equal_area_exports = {};
__export(equal_area_exports, {
  inverse: () => inverse,
  project: () => project
});
function project(dcos) {
  let [x, y, z] = dcos;
  if (z > 0) {
    x = -x;
    y = -y;
    z = -z;
  }
  const denom = 1 - z;
  const scale2 = Math.sqrt(2 / denom);
  return [x * scale2, y * scale2];
}
function inverse(px, py) {
  const r23 = px * px + py * py;
  if (r23 > 2) return null;
  const z = -(1 - r23 / 2);
  const scale2 = Math.sqrt(1 - r23 / 4);
  return [px * scale2, py * scale2, z];
}

// src/projections/equal-angle.js
var equal_angle_exports = {};
__export(equal_angle_exports, {
  inverse: () => inverse2,
  project: () => project2
});
function project2(dcos) {
  let [x, y, z] = dcos;
  if (z > 0) {
    x = -x;
    y = -y;
    z = -z;
  }
  const denom = 1 - z;
  return [x / denom, y / denom];
}
function inverse2(px, py) {
  const r23 = px * px + py * py;
  if (r23 > 1) return null;
  const denom = 1 + r23;
  return [
    2 * px / denom,
    2 * py / denom,
    -(1 - r23) / denom
  ];
}

// src/render/net.js
function generateNet(interval = 10, type = "equatorial") {
  return type === "polar" ? generatePolarNet(interval) : generateEquatorialNet(interval);
}
function generateEquatorialNet(interval) {
  const DEG10 = Math.PI / 180;
  const greatCircles = [];
  const smallCircles = [];
  for (let alpha = 0; alpha < 180; alpha += interval) {
    const alphaR = alpha * DEG10;
    greatCircles.push(
      greatCircle([Math.sin(alphaR), 0, Math.cos(alphaR)], 360)
    );
  }
  for (let alpha = interval; alpha < 180; alpha += interval) {
    smallCircles.push(
      smallCircle([0, 1, 0], alpha * DEG10, 360)
    );
  }
  return { greatCircles, smallCircles };
}
function generatePolarNet(interval) {
  const DEG10 = Math.PI / 180;
  const greatCircles = [];
  const smallCircles = [];
  for (let az = 0; az < 180; az += interval) {
    const azR = az * DEG10;
    greatCircles.push(
      greatCircle([Math.cos(azR), -Math.sin(azR), 0], 360)
    );
  }
  for (let dip = interval; dip <= 90; dip += interval) {
    smallCircles.push(
      smallCircle([0, 0, -1], dip * DEG10, 360)
    );
  }
  return { greatCircles, smallCircles };
}
function cardinalPoints(radius, cx, cy, offset) {
  return [
    { label: "N", x: cx, y: cy - radius - offset },
    { label: "E", x: cx + radius + offset, y: cy },
    { label: "S", x: cx, y: cy + radius + offset },
    { label: "W", x: cx - radius - offset, y: cy }
  ];
}

// src/render/svg.js
function attr(obj) {
  return Object.entries(obj).filter(([, v]) => v !== void 0 && v !== null).map(([k, v]) => `${k}="${v}"`).join(" ");
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var SvgBuilder = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.elements = [];
  }
  circle(cx, cy, r, style = {}) {
    this.elements.push(`<circle ${attr({ cx, cy, r, ...style })}/>`);
    return this;
  }
  line(x1, y1, x2, y2, style = {}) {
    this.elements.push(`<line ${attr({ x1, y1, x2, y2, ...style })}/>`);
    return this;
  }
  polyline(points, style = {}) {
    const pts = points.map(([x, y]) => `${x},${y}`).join(" ");
    this.elements.push(`<polyline ${attr({ points: pts, fill: "none", ...style })}/>`);
    return this;
  }
  path(d, style = {}) {
    this.elements.push(`<path ${attr({ d, ...style })}/>`);
    return this;
  }
  rect(x, y, width, height, style = {}) {
    this.elements.push(`<rect ${attr({ x, y, width, height, ...style })}/>`);
    return this;
  }
  text(x, y, content, style = {}) {
    const { "text-anchor": anchor, ...rest } = style;
    const anchorAttr = anchor ? ` text-anchor="${anchor}"` : "";
    this.elements.push(`<text ${attr({ x, y, ...rest })}${anchorAttr}>${esc(content)}</text>`);
    return this;
  }
  group(id, children) {
    const idAttr = id ? ` id="${id}"` : "";
    this.elements.push(`<g${idAttr}>${children}</g>`);
    return this;
  }
  /**
   * Add a clipping circle definition and return a group opener string.
   */
  clipCircle(id, cx, cy, r) {
    this.elements.push(
      `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>`
    );
    return this;
  }
  openClipGroup(clipId) {
    this.elements.push(`<g clip-path="url(#${clipId})">`);
    return this;
  }
  closeGroup() {
    this.elements.push("</g>");
    return this;
  }
  toString() {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">`,
      ...this.elements,
      "</svg>"
    ].join("\n");
  }
  /**
   * Parse SVG string into a DOM element (browser only).
   */
  toElement() {
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.toString(), "image/svg+xml");
    return doc.documentElement;
  }
};

// src/render/style.js
function deepMerge(target, ...sources) {
  const result = { ...target };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (source[key] === void 0) continue;
      if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]) && result[key] !== null && typeof result[key] === "object" && !Array.isArray(result[key])) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}
function resolveStyle(category, instanceStyle, itemStyle) {
  const base = defaults[category];
  if (typeof base === "object" && base !== null) {
    const result = { ...base };
    const inst2 = instanceStyle?.[category];
    if (inst2 && typeof inst2 === "object") {
      for (const [k, v] of Object.entries(inst2)) {
        if (v !== void 0) result[k] = v;
      }
    }
    if (itemStyle && typeof itemStyle === "object") {
      for (const [k, v] of Object.entries(itemStyle)) {
        if (v !== void 0) result[k] = v;
      }
    }
    return result;
  }
  if (itemStyle !== void 0) return itemStyle;
  const inst = instanceStyle?.[category];
  if (inst !== void 0) return inst;
  return base;
}
var defaults = {
  size: 500,
  padding: 30,
  background: "#ffffff",
  primitive: {
    stroke: "#000000",
    strokeWidth: 1.5,
    fill: "none"
  },
  grid: {
    stroke: "#cccccc",
    strokeWidth: 0.5,
    majorStroke: "#999999",
    majorStrokeWidth: 0.75
  },
  cardinals: {
    fontSize: 14,
    fontFamily: "sans-serif",
    fill: "#000000",
    offset: 16
  },
  pole: {
    r: 3,
    fill: "#000000",
    stroke: "none"
  },
  line: {
    r: 4,
    fill: "#000000",
    stroke: "none"
  },
  plane: {
    stroke: "#000000",
    strokeWidth: 1.2,
    fill: "none"
  },
  cone: {
    stroke: "#000000",
    strokeWidth: 1,
    fill: "none",
    strokeDasharray: "4,3"
  },
  ellipse: {
    stroke: "#000000",
    strokeWidth: 1,
    fill: "none",
    strokeDasharray: "4,3"
  }
};

// src/contouring.js
var DEG2 = Math.PI / 180;
function densityGrid(dcos, options = {}) {
  if (options.grid) return options.grid;
  const {
    projection = "equal-area",
    rotation = null,
    gridSize = 40,
    method = "fisher"
  } = options;
  const projR = projection === "equal-angle" ? 1 : Math.SQRT2;
  const step = 2 * projR / (gridSize - 1);
  const grid = new Float64Array(gridSize * gridSize);
  const n = dcos.length;
  if (n === 0) {
    grid.fill(NaN);
    return { grid, gridSize, step, projR, projection, method };
  }
  const inverseFn = projection === "equal-angle" ? inverse2 : inverse;
  const data = rotation ? dcos.map((d) => transformVec3(rotation, d)) : dcos;
  if (method === "kamb") {
    const k = options.kambSigma != null ? options.kambSigma : 3;
    const cosTheta = n / (n + k * k);
    const A = 1 - cosTheta;
    const E = n * A;
    const sd = Math.sqrt(n * A * (1 - A)) || 1;
    for (let j = 0; j < gridSize; j++) {
      const py = projR - j * step;
      for (let i = 0; i < gridSize; i++) {
        const px = -projR + i * step;
        if (px * px + py * py > projR * projR * 1.02) {
          grid[j * gridSize + i] = NaN;
          continue;
        }
        const d = inverseFn(px, py);
        if (!d) {
          grid[j * gridSize + i] = NaN;
          continue;
        }
        let count = 0;
        for (let m = 0; m < n; m++) {
          const rd = data[m];
          if (Math.abs(d[0] * rd[0] + d[1] * rd[1] + d[2] * rd[2]) >= cosTheta) count++;
        }
        grid[j * gridSize + i] = (count - E) / sd;
      }
    }
    return { grid, gridSize, step, projR, projection, method };
  }
  const sigma = (options.sigma != null ? options.sigma : 90 / Math.sqrt(n)) * DEG2;
  const cosSigma = Math.cos(sigma);
  const kappa = 1 / (1 - cosSigma);
  for (let j = 0; j < gridSize; j++) {
    const py = projR - j * step;
    for (let i = 0; i < gridSize; i++) {
      const px = -projR + i * step;
      if (px * px + py * py > projR * projR * 1.02) {
        grid[j * gridSize + i] = NaN;
        continue;
      }
      const d = inverseFn(px, py);
      if (!d) {
        grid[j * gridSize + i] = NaN;
        continue;
      }
      let density = 0;
      for (let m = 0; m < n; m++) {
        const rd = data[m];
        const dot2 = d[0] * rd[0] + d[1] * rd[1] + d[2] * rd[2];
        density += Math.exp(kappa * (dot2 - 1));
      }
      grid[j * gridSize + i] = kappa * density / n;
    }
  }
  return { grid, gridSize, step, projR, projection, method };
}
function computeContours(dcos, options = {}) {
  const { levels = [2, 4, 6, 8] } = options;
  if (!options.grid && dcos.length === 0) return levels.map((level) => ({ level, paths: [] }));
  const { grid, gridSize, step, projR } = options.grid || densityGrid(dcos, options);
  return levels.map((level) => ({
    level,
    paths: assembleSegments(
      marchingSquares(grid, gridSize, step, projR, level)
    )
  }));
}
function marchingSquares(grid, size, step, projR, level) {
  const segments = [];
  for (let j = 0; j < size - 1; j++) {
    for (let i = 0; i < size - 1; i++) {
      const vTL = grid[j * size + i];
      const vTR = grid[j * size + i + 1];
      const vBL = grid[(j + 1) * size + i];
      const vBR = grid[(j + 1) * size + i + 1];
      if (isNaN(vTL) || isNaN(vTR) || isNaN(vBL) || isNaN(vBR)) continue;
      const code = (vTL >= level ? 8 : 0) | (vTR >= level ? 4 : 0) | (vBR >= level ? 2 : 0) | (vBL >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x0 = -projR + i * step;
      const x1 = x0 + step;
      const y0 = projR - j * step;
      const y1 = y0 - step;
      const lerp = (va, vb, pa, pb) => pa + (level - va) / (vb - va) * (pb - pa);
      const T = [lerp(vTL, vTR, x0, x1), y0];
      const B = [lerp(vBL, vBR, x0, x1), y1];
      const L = [x0, lerp(vTL, vBL, y0, y1)];
      const R = [x1, lerp(vTR, vBR, y0, y1)];
      switch (code) {
        case 1:
        case 14:
          segments.push([B, L]);
          break;
        case 2:
        case 13:
          segments.push([R, B]);
          break;
        case 3:
        case 12:
          segments.push([R, L]);
          break;
        case 4:
        case 11:
          segments.push([T, R]);
          break;
        case 6:
        case 9:
          segments.push([T, B]);
          break;
        case 7:
        case 8:
          segments.push([T, L]);
          break;
        case 5: {
          const ctr = (vTL + vTR + vBL + vBR) / 4;
          if (ctr >= level) {
            segments.push([L, T]);
            segments.push([B, R]);
          } else {
            segments.push([B, L]);
            segments.push([T, R]);
          }
          break;
        }
        case 10: {
          const ctr = (vTL + vTR + vBL + vBR) / 4;
          if (ctr >= level) {
            segments.push([T, R]);
            segments.push([L, B]);
          } else {
            segments.push([T, L]);
            segments.push([R, B]);
          }
          break;
        }
      }
    }
  }
  return segments;
}
var SNAP = 1e-8;
function close(a, b) {
  return Math.abs(a[0] - b[0]) < SNAP && Math.abs(a[1] - b[1]) < SNAP;
}
function assembleSegments(segments) {
  if (segments.length === 0) return [];
  const used = new Uint8Array(segments.length);
  const paths = [];
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const path = [segments[s][0], segments[s][1]];
    let changed = true;
    while (changed) {
      changed = false;
      const tail = path[path.length - 1];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        if (close(tail, segments[i][0])) {
          path.push(segments[i][1]);
          used[i] = 1;
          changed = true;
          break;
        }
        if (close(tail, segments[i][1])) {
          path.push(segments[i][0]);
          used[i] = 1;
          changed = true;
          break;
        }
      }
    }
    changed = true;
    while (changed) {
      changed = false;
      const head = path[0];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        if (close(head, segments[i][1])) {
          path.unshift(segments[i][0]);
          used[i] = 1;
          changed = true;
          break;
        }
        if (close(head, segments[i][0])) {
          path.unshift(segments[i][1]);
          used[i] = 1;
          changed = true;
          break;
        }
      }
    }
    paths.push(path);
  }
  return paths;
}

// src/statistics.js
var statistics_exports = {};
__export(statistics_exports, {
  bootstrapEigenvectorConfidence: () => bootstrapEigenvectorConfidence,
  bootstrapMeanConfidence: () => bootstrapMeanConfidence,
  commonMeanTest: () => commonMeanTest,
  confidenceCone: () => confidenceCone,
  confidenceEllipse: () => confidenceEllipse,
  fisherStats: () => fisherStats,
  meanVector: () => meanVector,
  orientationTensor: () => orientationTensor,
  principalAxes: () => principalAxes,
  resultant: () => resultant,
  uniformityTest: () => uniformityTest
});

// src/core/eigen.js
var TWO_PI_OVER_3 = 2 * Math.PI / 3;
function symmetricEigen3(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a11 = m[4], a12 = m[5];
  const a22 = m[8];
  const p1 = a01 * a01 + a02 * a02 + a12 * a12;
  if (p1 < 1e-30) {
    const vals = [a00, a11, a22];
    const vecs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const idx = [0, 1, 2];
    idx.sort((i, j) => vals[j] - vals[i]);
    return {
      values: [vals[idx[0]], vals[idx[1]], vals[idx[2]]],
      vectors: [vecs[idx[0]], vecs[idx[1]], vecs[idx[2]]]
    };
  }
  const q = (a00 + a11 + a22) / 3;
  const p2 = (a00 - q) * (a00 - q) + (a11 - q) * (a11 - q) + (a22 - q) * (a22 - q) + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const b00 = (a00 - q) / p, b01 = a01 / p, b02 = a02 / p;
  const b11 = (a11 - q) / p, b12 = a12 / p;
  const b22 = (a22 - q) / p;
  const detB = b00 * (b11 * b22 - b12 * b12) - b01 * (b01 * b22 - b12 * b02) + b02 * (b01 * b12 - b11 * b02);
  const r = Math.max(-1, Math.min(1, detB / 2));
  const phi = Math.acos(r) / 3;
  const eig1 = q + 2 * p * Math.cos(phi);
  const eig3 = q + 2 * p * Math.cos(phi + TWO_PI_OVER_3);
  const eig2 = 3 * q - eig1 - eig3;
  const v1 = nullVec(a00, a01, a02, a11, a12, a22, eig1);
  const v3 = nullVec(a00, a01, a02, a11, a12, a22, eig3);
  let v2 = cross3(v1, v3);
  let len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);
  if (len2 > 1e-10) {
    v2 = [v2[0] / len2, v2[1] / len2, v2[2] / len2];
  } else {
    v2 = perpendicular(v1);
    const v3new = cross3(v1, v2);
    v3[0] = v3new[0];
    v3[1] = v3new[1];
    v3[2] = v3new[2];
  }
  return {
    values: [eig1, eig2, eig3],
    vectors: [v1, v2, v3]
  };
}
function nullVec(a00, a01, a02, a11, a12, a22, lam) {
  const r0 = [a00 - lam, a01, a02];
  const r1 = [a01, a11 - lam, a12];
  const r23 = [a02, a12, a22 - lam];
  const c01 = cross3(r0, r1);
  const c02 = cross3(r0, r23);
  const c12 = cross3(r1, r23);
  const l01 = c01[0] * c01[0] + c01[1] * c01[1] + c01[2] * c01[2];
  const l02 = c02[0] * c02[0] + c02[1] * c02[1] + c02[2] * c02[2];
  const l12 = c12[0] * c12[0] + c12[1] * c12[1] + c12[2] * c12[2];
  let v, len;
  if (l01 >= l02 && l01 >= l12) {
    v = c01;
    len = Math.sqrt(l01);
  } else if (l02 >= l12) {
    v = c02;
    len = Math.sqrt(l02);
  } else {
    v = c12;
    len = Math.sqrt(l12);
  }
  if (len < 1e-14) return [1, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}
function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function perpendicular(v) {
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  let u;
  if (ax <= ay && ax <= az) u = [0, -v[2], v[1]];
  else if (ay <= ax && ay <= az) u = [-v[2], 0, v[0]];
  else u = [-v[1], v[0], 0];
  const len = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
  return [u[0] / len, u[1] / len, u[2] / len];
}

// src/core/special.js
var LANCZOS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9984369578019572e-21,
  15056327351493116e-23
];
var TINY = 1e-300;
function gammaln(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  }
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function gser(a, x) {
  let ap = a, del = 1 / a, sum = del;
  for (let n = 0; n < 300; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}
function gcf(a, x) {
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}
function regularizedGammaP(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
}
function chiSquareCDF(x, k) {
  return x <= 0 ? 0 : regularizedGammaP(k / 2, x / 2);
}
function chiSquareSF(x, k) {
  return 1 - chiSquareCDF(x, k);
}
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}
function regularizedBetaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
function fCDF(F, d1, d2) {
  if (F <= 0) return 0;
  return regularizedBetaI(d1 * F / (d1 * F + d2), d1 / 2, d2 / 2);
}
function fSF(F, d1, d2) {
  return 1 - fCDF(F, d1, d2);
}

// src/statistics.js
var RAD2DEG = 180 / Math.PI;
function resultant(dcos) {
  const s = [0, 0, 0];
  for (const d of dcos) {
    s[0] += d[0];
    s[1] += d[1];
    s[2] += d[2];
  }
  return s;
}
function meanVector(dcos) {
  return normalize(resultant(dcos));
}
function fisherStats(dcos) {
  const n = dcos.length;
  const res = resultant(dcos);
  const R = length(res);
  const Rbar = R / n;
  const mean = R > 1e-10 ? scale(res, 1 / R) : [0, 0, -1];
  let kappa = Infinity;
  if (n > R + 1e-10) {
    kappa = n >= 3 ? (n - 2) / (n - R) : (n - 1) / (n - R);
  }
  let alpha95 = 0;
  if (n >= 2 && R > 1e-10 && n - R > 1e-10) {
    const cosA = 1 - (n - R) / R * (Math.pow(20, 1 / (n - 1)) - 1);
    alpha95 = Math.acos(Math.max(-1, Math.min(1, cosA))) * (180 / Math.PI);
  }
  return { n, R, Rbar, mean, kappa, alpha95 };
}
function confidenceCone(dcos, confidence = 0.95) {
  const n = dcos.length;
  const res = resultant(dcos);
  const R = length(res);
  const meanVec = R > 1e-10 ? scale(res, 1 / R) : [0, 0, -1];
  let halfAngle = 0;
  if (n >= 2 && R > 1e-10 && n - R > 1e-10) {
    const p = 1 - confidence;
    const cosA = 1 - (n - R) / R * (Math.pow(1 / p, 1 / (n - 1)) - 1);
    halfAngle = Math.acos(Math.max(-1, Math.min(1, cosA))) * RAD2DEG;
  }
  return { mean: dcosToLine(meanVec), halfAngle, confidence };
}
function uniformityTest(dcos) {
  const n = dcos.length;
  if (n === 0) return { n: 0, eigenvalues: [1 / 3, 1 / 3, 1 / 3], statistic: 0, df: 5, p: 1 };
  const { values } = symmetricEigen3(orientationTensor(dcos));
  const sumSq = values[0] * values[0] + values[1] * values[1] + values[2] * values[2];
  const statistic = 15 * n / 2 * (sumSq - 1 / 3);
  return { n, eigenvalues: values, statistic, df: 5, p: chiSquareSF(statistic, 5) };
}
function commonMeanTest(a, b) {
  const N = a.length + b.length;
  const Ra = length(resultant(a));
  const Rb = length(resultant(b));
  const R = length(resultant(a.concat(b)));
  const F = (N - 2) * (Ra + Rb - R) / (N - Ra - Rb);
  const df1 = 2, df2 = 2 * (N - 2);
  return { F, df1, df2, p: fSF(F, df1, df2), Ra, Rb, R };
}
function orientationTensor(dcos) {
  const n = dcos.length;
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const d of dcos) {
    T[0] += d[0] * d[0];
    T[1] += d[0] * d[1];
    T[2] += d[0] * d[2];
    T[3] += d[1] * d[0];
    T[4] += d[1] * d[1];
    T[5] += d[1] * d[2];
    T[6] += d[2] * d[0];
    T[7] += d[2] * d[1];
    T[8] += d[2] * d[2];
  }
  for (let k = 0; k < 9; k++) T[k] /= n;
  return T;
}
function principalAxes(dcos) {
  const T = orientationTensor(dcos);
  const { values, vectors } = symmetricEigen3(T);
  for (let i = 0; i < 3; i++) {
    if (vectors[i][2] > 0) {
      vectors[i] = negate(vectors[i]);
    }
  }
  const s1 = values[0], s2 = values[1], s3 = values[2];
  const K = Math.log(s1 / s2) / Math.log(s2 / s3);
  const C = Math.log(s1 / s3);
  const P = s1 - s2;
  const G = 2 * (s2 - s3);
  const R = 3 * s3;
  const n = dcos.length;
  const kappa1 = n * (s2 - s1);
  const kappa2 = n * (s3 - s1);
  return { eigenvalues: values, eigenvectors: vectors, K, C, P, G, R, kappa1, kappa2 };
}
function confidenceEllipse(dcos, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const about = options.about || "max";
  const n = dcos.length;
  const { eigenvalues, eigenvectors } = principalAxes(dcos);
  const ci = about === "min" ? 2 : 0;
  const others = [0, 1, 2].filter((k) => k !== ci);
  const chi2 = -2 * Math.log(1 - confidence);
  const li = eigenvalues[ci];
  const semi = others.map((j) => {
    const lj = eigenvalues[j];
    const denom = (li - lj) * (li - lj);
    const variance = denom > 1e-12 ? chi2 * (li * lj) / (n * denom) : Infinity;
    return { j, angle: Math.min(Math.PI / 2, Math.sqrt(variance)) };
  });
  semi.sort((p, q) => q.angle - p.angle);
  const [major, minor] = semi;
  return {
    center: dcosToLine(eigenvectors[ci]),
    azimuth: dcosToLine(eigenvectors[major.j]),
    a: major.angle * RAD2DEG,
    b: minor.angle * RAD2DEG,
    centerDir: eigenvectors[ci],
    majorDir: eigenvectors[major.j],
    minorDir: eigenvectors[minor.j],
    confidence
  };
}
function tangentBasis(a) {
  const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(a, ref));
  return [u, cross(a, u)];
}
function resample(arr, rng) {
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[rng() * n | 0];
  return out;
}
function bootstrapMeanConfidence(dcos, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const iterations = options.iterations || 1e3;
  const rng = options.rng || Math.random;
  const mean0 = meanVector(dcos);
  const angles = [];
  for (let it = 0; it < iterations; it++) {
    const m = meanVector(resample(dcos, rng));
    let d = m[0] * mean0[0] + m[1] * mean0[1] + m[2] * mean0[2];
    if (d < 0) d = -d;
    angles.push(Math.acos(Math.max(-1, Math.min(1, d))));
  }
  angles.sort((x, y) => x - y);
  const idx = Math.min(angles.length - 1, Math.floor(confidence * angles.length));
  return {
    mean: dcosToLine(mean0),
    meanDir: mean0,
    halfAngle: angles[idx] * RAD2DEG,
    confidence,
    iterations
  };
}
function bootstrapEigenvectorConfidence(dcos, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const iterations = options.iterations || 1e3;
  const about = options.about || "max";
  const rng = options.rng || Math.random;
  const ci = about === "min" ? 2 : 0;
  const ref = principalAxes(dcos).eigenvectors[ci];
  const [u, w] = tangentBasis(ref);
  let sxx = 0, sxy = 0, syy = 0, count = 0;
  for (let it = 0; it < iterations; it++) {
    let v = principalAxes(resample(dcos, rng)).eigenvectors[ci];
    if (v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2] < 0) v = negate(v);
    const x = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    const y = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    count += 1;
  }
  sxx /= count;
  sxy /= count;
  syy /= count;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  let ax = sxy, ay = l1 - sxx;
  if (Math.abs(ax) < 1e-15 && Math.abs(ay) < 1e-15) {
    ax = 1;
    ay = 0;
  }
  const an = Math.hypot(ax, ay) || 1;
  ax /= an;
  ay /= an;
  const chi2 = -2 * Math.log(1 - confidence);
  const majorDir = [
    u[0] * ax + w[0] * ay,
    u[1] * ax + w[1] * ay,
    u[2] * ax + w[2] * ay
  ];
  const minorDir = [
    u[0] * -ay + w[0] * ax,
    u[1] * -ay + w[1] * ax,
    u[2] * -ay + w[2] * ax
  ];
  return {
    center: dcosToLine(ref),
    a: Math.min(90, Math.sqrt(chi2 * Math.max(0, l1)) * RAD2DEG),
    b: Math.min(90, Math.sqrt(chi2 * Math.max(0, l2)) * RAD2DEG),
    centerDir: ref,
    majorDir,
    minorDir,
    confidence,
    iterations
  };
}

// src/stereonet.js
var DEG3 = Math.PI / 180;
var SVG_NS = "http://www.w3.org/2000/svg";
var nextClipId = 0;
var HEATMAP_STOPS = [
  [0, [255, 245, 200]],
  [0.35, [246, 177, 74]],
  [0.7, [224, 96, 62]],
  [1, [120, 20, 30]]
];
function defaultHeatmapColor(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < HEATMAP_STOPS.length; i++) {
    const [t1, c1] = HEATMAP_STOPS[i];
    if (x <= t1) {
      const [t0, c0] = HEATMAP_STOPS[i - 1];
      const f = t1 - t0 > 0 ? (x - t0) / (t1 - t0) : 0;
      const r = Math.round(c0[0] + f * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + f * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + f * (c1[2] - c0[2]));
      return `rgb(${r},${g},${b})`;
    }
  }
  const last = HEATMAP_STOPS[HEATMAP_STOPS.length - 1][1];
  return `rgb(${last[0]},${last[1]},${last[2]})`;
}
function equatorCrossing(a, b) {
  const t = a[2] / (a[2] - b[2]);
  const x = a[0] + t * (b[0] - a[0]);
  const y = a[1] + t * (b[1] - a[1]);
  const len = Math.sqrt(x * x + y * y);
  return len > 1e-10 ? [x / len, y / len, 0] : [x, y, 0];
}
function clipToLowerHemisphere(points) {
  const segments = [];
  let current = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p[2] <= 0) {
      if (current.length === 0 && i > 0 && points[i - 1][2] > 0) {
        current.push(equatorCrossing(points[i - 1], p));
      }
      current.push(p);
    } else {
      if (current.length > 0) {
        current.push(equatorCrossing(points[i - 1], p));
        segments.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}
function segmentsToPathD(segments) {
  const parts = [];
  for (const seg of segments) {
    if (seg.length > 1) {
      parts.push("M" + seg.map(([x, y]) => `${x},${y}`).join("L"));
    }
  }
  return parts.join("");
}
var Stereonet = class _Stereonet {
  constructor(options = {}) {
    this.size = options.size || defaults.size;
    this.padding = options.padding ?? defaults.padding;
    this.projection = options.projection || "equal-area";
    this.net = options.net || "equatorial";
    this.gridSpacing = options.gridSpacing || 10;
    this.hemisphere = options.hemisphere || "lower";
    this.rotation = options.rotation ?? (options.center ? _Stereonet.rotationFromCenter(options.center[0], options.center[1]) : options.northPole ? _Stereonet.rotationFromNorthPole(options.northPole[0], options.northPole[1], options.northPole[2] || 0) : null);
    this._instanceStyle = options.style || null;
    this._classPrefix = options.classPrefix !== void 0 ? options.classPrefix : "bearing";
    this._items = [];
    this._clipId = `bearing-clip-${nextClipId++}`;
    this._contourDcos = null;
    this._contourOptions = null;
    this._contourPaths = null;
    this._heatmapDcos = null;
    this._heatmapOptions = null;
    this._heatmapData = null;
    this._el = null;
    this._bgEl = null;
    this._heatmapGroup = null;
    this._gcPath = null;
    this._scPath = null;
    this._contourGroup = null;
    this._dataGroup = null;
    this._primEl = null;
    this._cardinalEls = null;
  }
  /**
   * Build a rotation matrix that maps direction (trend, plunge) to the
   * center of the stereonet [0, 0, -1].
   * @param {number} trend - trend in degrees
   * @param {number} plunge - plunge in degrees
   * @returns {Array<number>} 3x3 rotation matrix (flat row-major)
   */
  static rotationFromCenter(trend, plunge) {
    const d = lineToDcos(trend, plunge);
    const target = [0, 0, -1];
    const axis = cross(d, target);
    const len = length(axis);
    if (len < 1e-10) {
      return dot(d, target) > 0 ? identity() : rotationFromAxisAngle([1, 0, 0], Math.PI);
    }
    const theta = angle(d, target);
    return rotationFromAxisAngle(normalize(axis), theta);
  }
  /**
   * Build a rotation matrix from north pole placement + spin.
   * (trend, plunge) specifies where geographic North [0,1,0] ends up;
   * spin is an additional rotation around the North axis before tilting.
   * @param {number} trend - trend of new North position in degrees
   * @param {number} plunge - plunge of new North position in degrees
   * @param {number} [spin=0] - rotation about the North axis in degrees
   * @returns {Array<number>} 3x3 rotation matrix (flat row-major)
   */
  static rotationFromNorthPole(trend, plunge, spin = 0) {
    const north = [0, 1, 0];
    const target = lineToDcos(trend, plunge);
    const Rspin = rotationFromAxisAngle(north, spin * DEG3);
    const axis = cross(north, target);
    const len = length(axis);
    let Rtilt;
    if (len < 1e-10) {
      Rtilt = dot(north, target) > 0 ? identity() : rotationFromAxisAngle([1, 0, 0], Math.PI);
    } else {
      const theta = angle(north, target);
      Rtilt = rotationFromAxisAngle(normalize(axis), theta);
    }
    return multiply(Rtilt, Rspin);
  }
  get _projectFn() {
    return this.projection === "equal-angle" ? project2 : project;
  }
  /** Primitive circle radius in SVG coordinates. */
  get _radius() {
    return (this.size - 2 * this.padding) / 2;
  }
  get _center() {
    return this.size / 2;
  }
  /**
   * Scale factor: maps projection output (radius √2 for equal-area, 1 for equal-angle)
   * to SVG pixel coordinates.
   */
  get _scale() {
    const projRadius = this.projection === "equal-angle" ? 1 : Math.SQRT2;
    return this._radius / projRadius;
  }
  /**
   * Public geometry of the rendered net, for host apps that place their own
   * overlays (heatmaps, leaders, hit-testing) without reaching into private fields.
   * A projected point [px, py] maps to SVG [center + px*scale, center - py*scale].
   * @returns {{center:number, radius:number, scale:number, projR:number}}
   *   center: px of the net centre (both axes); radius: primitive-circle radius in px;
   *   scale: px per unit of projected coordinate; projR: projected radius of the
   *   primitive circle (√2 for equal-area, 1 for equal-angle).
   */
  get layout() {
    const projR = this.projection === "equal-angle" ? 1 : Math.SQRT2;
    return { center: this._center, radius: this._radius, scale: this._scale, projR };
  }
  /** Convert projected [px, py] to SVG [x, y]. */
  _toSvg(px, py) {
    const c = this._center;
    const s = this._scale;
    return [c + px * s, c - py * s];
  }
  /**
   * Inverse of the full forward pipeline: SVG pixel → geographic unit vector.
   * Accounts for the pixel transform, the projection, and the current rotation.
   * @param {number} sx - x in SVG/viewBox coordinates
   * @param {number} sy - y in SVG/viewBox coordinates
   * @returns {number[]|null} geographic direction cosine [x,y,z] (z<=0), or null if outside the net
   */
  unproject(sx, sy) {
    let px = (sx - this._center) / this._scale;
    let py = (this._center - sy) / this._scale;
    const lim = this.projection === "equal-angle" ? 1 : 2;
    const r23 = px * px + py * py;
    if (r23 >= lim) {
      if (r23 > lim * 1.01) return null;
      const k = Math.sqrt(lim * (1 - 1e-9) / r23);
      px *= k;
      py *= k;
    }
    const inverseFn = this.projection === "equal-angle" ? inverse2 : inverse;
    const lower = inverseFn(px, py);
    if (!lower) return null;
    const d = this._reflect(lower);
    return this.rotation ? transformVec3(transpose(this.rotation), d) : d;
  }
  /**
   * Forward pipeline: geographic unit vector → SVG pixel coordinates.
   * Mirror of unproject(). Applies the current rotation, projection, and pixel transform.
   * @param {number[]} dcos - geographic direction cosine [x,y,z]
   * @returns {{x:number,y:number,upper:boolean}} SVG coords; `upper` is true when the
   *   rotated point falls on the upper hemisphere (not shown on the lower-hemisphere net).
   */
  project(dcos) {
    const d = this._rotate(dcos);
    const [px, py] = this._projectFn(d);
    const [x, y] = this._toSvg(px, py);
    return { x, y, upper: d[2] > 1e-9 };
  }
  /** Convenience: project a trend/plunge line directly to SVG coords. */
  projectLine(trend, plunge) {
    return this.project(lineToDcos(trend, plunge));
  }
  /**
   * Map an SVG point onto the projection sphere in the view frame (z ≤ 0),
   * using the same inverse as unproject(). Points outside the primitive circle
   * are clamped to the equator (z = 0). Basis for arcball drag rotation.
   */
  _arcballPoint(sx, sy) {
    const px = (sx - this._center) / this._scale;
    const py = (this._center - sy) / this._scale;
    const lim = this.projection === "equal-angle" ? 1 : 2;
    const r23 = px * px + py * py;
    if (r23 < lim) {
      const inverseFn = this.projection === "equal-angle" ? inverse2 : inverse;
      const d = inverseFn(px, py);
      if (d) return this._reflect(d);
    }
    const r = Math.sqrt(r23) || 1;
    return [px / r, py / r, 0];
  }
  /**
   * Arcball drag rotation: the shortest-arc rotation taking the sphere point
   * under SVG (x0,y0) onto the point under (x1,y1). Frame-consistent — no
   * gimbal flip on sustained dragging. Premultiply onto the current rotation:
   *
   *   const R = mat3.multiply(sn.arcball(x0,y0,x1,y1), sn.rotation || mat3.identity());
   *   sn.setRotation(mat3.orthonormalize(R));
   *
   * With no current rotation, the grabbed geographic point stays exactly under
   * the cursor for in-net drags.
   * @returns {number[]} 3×3 rotation matrix (flat row-major)
   */
  arcball(x0, y0, x1, y1) {
    return rotationBetween(this._arcballPoint(x0, y0), this._arcballPoint(x1, y1));
  }
  /** Resolve style for a category using the three-level cascade. */
  _resolveCategory(category, itemStyle) {
    return resolveStyle(category, this._instanceStyle, itemStyle);
  }
  /** Build CSS class string for an SVG element. Returns undefined if classes disabled. */
  _classFor(suffix, extraClass) {
    if (this._classPrefix === null) return void 0;
    const base = `${this._classPrefix}-${suffix}`;
    return extraClass ? `${base} ${extraClass}` : base;
  }
  /**
   * Update the instance-level style at runtime. Call render() to apply.
   * @param {Object} style - instance style overrides
   * @returns {this}
   */
  setStyle(style) {
    this._instanceStyle = style;
    return this;
  }
  /**
   * Upper-hemisphere view = lower-hemisphere projection of the z-reflected vector
   * (upper_project([x,y,z]) === lower_project([x,y,−z])). For 'lower' this is a
   * no-op, so the default path is untouched. Its own inverse.
   */
  _reflect(p) {
    return this.hemisphere === "upper" ? [p[0], p[1], -p[2]] : p;
  }
  /** Rotate a 3D point by the stereonet's rotation, then orient to the hemisphere. */
  _rotate(p) {
    return this._reflect(this.rotation ? transformVec3(this.rotation, p) : p);
  }
  /**
   * Process a 3D curve: rotate + hemisphere-orient, clip to the shown hemisphere,
   * project to SVG. Returns one SVG coordinate array per visible segment.
   */
  _projectCurve(points3d) {
    const rotated = points3d.map((p) => this._reflect(this.rotation ? transformVec3(this.rotation, p) : p));
    const segments = clipToLowerHemisphere(rotated);
    return segments.map(
      (seg) => seg.map((p) => {
        const [px, py] = this._projectFn(p);
        return this._toSvg(px, py);
      })
    );
  }
  // ---------------------------------------------------------------------------
  //  Data methods — push items, return `this` for chaining
  // ---------------------------------------------------------------------------
  /** Read-only access to the items array. */
  get items() {
    return this._items;
  }
  /**
   * Plot pole to a plane. dd = dip direction, dip = dip angle (degrees).
   */
  pole(dd, dip, style = {}) {
    this._items.push({ type: "pole", dd, dip, style, _el: null });
    return this;
  }
  /**
   * Plot a line (trend/plunge). trend and plunge in degrees.
   */
  line(trend, plunge, style = {}) {
    this._items.push({ type: "line", trend, plunge, style, _el: null });
    return this;
  }
  /**
   * Plot a great circle for a plane. dd = dip direction, dip = dip angle.
   */
  plane(dd, dip, style = {}) {
    this._items.push({ type: "plane", dd, dip, style, _el: null });
    return this;
  }
  /**
   * Plot a small circle (cone). trend/plunge in degrees, halfAngle in degrees.
   */
  cone(trend, plunge, halfAngle, style = {}) {
    this._items.push({ type: "cone", trend, plunge, halfAngle, style, _el: null });
    return this;
  }
  /**
   * Plot an arbitrary 3-D curve/polyline (array of unit direction cosines),
   * projected and clipped to the net. Use for arcs (see curves.arc), great-circle
   * segments, slip paths, etc. Style: stroke, strokeWidth, strokeDasharray, fill.
   * @param {Array<number[]>} points - direction cosines [[x,y,z], …]
   * @param {Object} [style]
   * @returns {this}
   */
  curve(points, style = {}) {
    this._items.push({ type: "curve", points, style, _el: null });
    return this;
  }
  /**
   * Plot an elliptical "small circle" centred on a direction, with angular
   * semi-axes in degrees. The major axis points toward `majorDir`.
   * @param {number[]} centerDir - centre direction cosine [x,y,z]
   * @param {number[]} majorDir - direction the major axis points toward [x,y,z]
   * @param {number} semiMajorDeg - major angular semi-axis (degrees)
   * @param {number} semiMinorDeg - minor angular semi-axis (degrees)
   * @param {Object} [style]
   * @returns {this}
   */
  ellipse(centerDir, majorDir, semiMajorDeg, semiMinorDeg, style = {}) {
    this._items.push({
      type: "ellipse",
      centerDir,
      majorDir,
      aRad: semiMajorDeg * DEG3,
      bRad: semiMinorDeg * DEG3,
      style,
      _el: null
    });
    return this;
  }
  /**
   * Plot the confidence ellipse about a principal eigenvector of `dcos`
   * (see statistics.confidenceEllipse). Convenience over ellipse().
   * @param {Array<number[]>} dcos - unit vectors (lower hemisphere)
   * @param {Object} [options] - confidence/about (statistics) plus { style }
   * @returns {this}
   */
  confidenceEllipse(dcos, options = {}) {
    const e = confidenceEllipse(dcos, options);
    return this.ellipse(e.centerDir, e.majorDir, e.a, e.b, options.style || {});
  }
  /**
   * Plot a text label anchored at a trend/plunge direction (treated like a line/point).
   * Style supports: dx, dy (pixel offset from the anchor), fill, fontSize, fontFamily,
   * fontWeight, textAnchor ('start'|'middle'|'end'), and class.
   * @param {number} trend - trend in degrees
   * @param {number} plunge - plunge in degrees
   * @param {string} content - label text
   * @param {Object} [style]
   * @returns {this}
   */
  text(trend, plunge, content, style = {}) {
    this._items.push({ type: "text", trend, plunge, content: String(content), style, _el: null });
    return this;
  }
  /**
   * Add density contour lines for a set of direction cosines.
   * @param {Array<number[]>} dcos - unit vectors (lower hemisphere)
   * @param {Object} [options]
   * @param {number[]} [options.levels=[2,4,6,8]] - MUD levels
   * @param {number}  [options.sigma] - kernel half-width degrees (auto if omitted)
   * @param {number}  [options.gridSize=40] - grid resolution
   * @param {string}  [options.stroke='#333'] - line colour
   * @param {number}  [options.strokeWidth=0.8]
   * @param {string[]} [options.colors] - per-level stroke colours (overrides stroke)
   * @returns {this}
   */
  contour(dcos, options = {}) {
    this._contourDcos = dcos;
    this._contourOptions = options;
    this._computeContours();
    return this;
  }
  /** Recompute contours (call after rotation changes if contours are active). */
  updateContours() {
    this._computeContours();
    return this;
  }
  /** Remove contour data. Returns `this`. */
  clearContours() {
    this._contourDcos = null;
    this._contourOptions = null;
    this._contourPaths = null;
    if (this._contourGroup) {
      while (this._contourGroup.firstChild) this._contourGroup.firstChild.remove();
    }
    return this;
  }
  _computeContours() {
    if (!this._contourDcos || this._contourDcos.length === 0) {
      this._contourPaths = null;
      return;
    }
    this._contourPaths = computeContours(this._contourDcos, {
      projection: this.projection,
      rotation: this.rotation,
      ...this._contourOptions
    });
  }
  /**
   * Add a filled density heatmap (Fisher-kernel raster) for a set of direction
   * cosines. Rendered beneath the grid; rotation-aware (call updateHeatmap()
   * after changing rotation, mirroring updateContours()).
   * @param {Array<number[]>} dcos - unit vectors (lower hemisphere)
   * @param {Object} [options]
   * @param {number} [options.gridSize=48] - raster resolution
   * @param {number} [options.sigma] - kernel half-width in degrees (auto if omitted)
   * @param {(t:number)=>string} [options.color] - maps normalised density t∈[0,1] to a CSS colour
   * @param {number} [options.max] - density value mapped to t=1 (default: grid maximum)
   * @param {number} [options.threshold=0.04] - skip cells whose normalised density is below this
   * @param {number} [options.opacity] - per-cell fill-opacity
   * @returns {this}
   */
  heatmap(dcos, options = {}) {
    this._heatmapDcos = dcos;
    this._heatmapOptions = options;
    this._computeHeatmap();
    return this;
  }
  /** Recompute the heatmap grid (call after rotation changes if a heatmap is active). */
  updateHeatmap() {
    this._computeHeatmap();
    return this;
  }
  /** Remove heatmap data. Returns `this`. */
  clearHeatmap() {
    this._heatmapDcos = null;
    this._heatmapOptions = null;
    this._heatmapData = null;
    if (this._heatmapGroup) {
      while (this._heatmapGroup.firstChild) this._heatmapGroup.firstChild.remove();
    }
    return this;
  }
  _computeHeatmap() {
    if (!this._heatmapDcos || this._heatmapDcos.length === 0) {
      this._heatmapData = null;
      return;
    }
    this._heatmapData = densityGrid(this._heatmapDcos, {
      projection: this.projection,
      rotation: this.rotation,
      gridSize: 48,
      ...this._heatmapOptions
    });
  }
  /**
   * Walk the heatmap raster, invoking cb(x, y, size, fill) per drawable cell in
   * SVG coordinates. Shared by the string and DOM renderers. No-op if no heatmap.
   */
  _heatmapCells(cb) {
    const data = this._heatmapData;
    if (!data) return;
    const { grid, gridSize, step, projR } = data;
    const opts = this._heatmapOptions || {};
    const color = opts.color || defaultHeatmapColor;
    const threshold = opts.threshold != null ? opts.threshold : 0.04;
    let max = opts.max;
    if (max == null) {
      max = 0;
      for (const v of grid) if (!Number.isNaN(v) && v > max) max = v;
    }
    if (!(max > 0)) return;
    const { center, scale: scale2 } = this.layout;
    const cell = step * scale2;
    for (let j = 0; j < gridSize; j++) {
      const py = projR - j * step;
      for (let i = 0; i < gridSize; i++) {
        const v = grid[j * gridSize + i];
        if (Number.isNaN(v)) continue;
        const t = v / max;
        if (t < threshold) continue;
        const px = -projR + i * step;
        const x = center + px * scale2;
        const y = center - py * scale2;
        cb(x - cell / 2, y - cell / 2, cell, color(t));
      }
    }
  }
  /** Remove all data items. Returns `this`. */
  clear() {
    for (const item of this._items) {
      if (item._el) item._el.remove();
    }
    this._items.length = 0;
    return this;
  }
  /** Remove a specific item (by reference from .items). Returns `this`. */
  remove(item) {
    const idx = this._items.indexOf(item);
    if (idx >= 0) {
      if (item._el) item._el.remove();
      this._items.splice(idx, 1);
    }
    return this;
  }
  // ---------------------------------------------------------------------------
  //  View control
  // ---------------------------------------------------------------------------
  /** Set rotation matrix. Call render() to apply. Returns `this`. */
  setRotation(rotation) {
    this.rotation = rotation;
    return this;
  }
  /** Set rotation by center direction. Call render() to apply. Returns `this`. */
  setCenter(trend, plunge) {
    this.rotation = _Stereonet.rotationFromCenter(trend, plunge);
    return this;
  }
  /** Set rotation by north pole placement + spin. Call render() to apply. Returns `this`. */
  setNorthPole(trend, plunge, spin = 0) {
    this.rotation = _Stereonet.rotationFromNorthPole(trend, plunge, spin);
    return this;
  }
  // ---------------------------------------------------------------------------
  //  Static SVG string output (works in Node, no DOM)
  // ---------------------------------------------------------------------------
  /**
   * Build and return the SVG as a string.
   */
  svg() {
    const svg = new SvgBuilder(this.size, this.size);
    const c = this._center;
    const r = this._radius;
    svg.circle(c, c, r, {
      fill: this._resolveCategory("background"),
      stroke: "none",
      class: this._classFor("background")
    });
    svg.clipCircle(this._clipId, c, c, r);
    svg.openClipGroup(this._clipId);
    if (this._heatmapData) {
      this._renderHeatmapString(svg);
    }
    const gridStyle = this._resolveCategory("grid");
    const { greatCircles, smallCircles } = generateNet(this.gridSpacing, this.net);
    for (const gc of greatCircles) {
      for (const seg of this._projectCurve(gc)) {
        if (seg.length > 1) {
          svg.polyline(seg, {
            stroke: gridStyle.stroke,
            "stroke-width": gridStyle.strokeWidth,
            class: this._classFor("grid")
          });
        }
      }
    }
    for (const sc of smallCircles) {
      for (const seg of this._projectCurve(sc)) {
        if (seg.length > 1) {
          svg.polyline(seg, {
            stroke: gridStyle.stroke,
            "stroke-width": gridStyle.strokeWidth,
            class: this._classFor("grid")
          });
        }
      }
    }
    if (this._contourPaths) {
      this._renderContoursString(svg);
    }
    for (const item of this._items) {
      this._renderItemString(svg, item);
    }
    svg.closeGroup();
    const primStyle = this._resolveCategory("primitive");
    svg.circle(c, c, r, {
      fill: "none",
      stroke: primStyle.stroke,
      "stroke-width": primStyle.strokeWidth,
      class: this._classFor("primitive")
    });
    this._renderCardinalsString(svg, c, r);
    return svg.toString();
  }
  _renderCardinalsString(svg, cx, r) {
    const cardStyle = this._resolveCategory("cardinals");
    const offset = cardStyle.offset;
    const style = {
      "font-size": cardStyle.fontSize,
      "font-family": cardStyle.fontFamily,
      fill: cardStyle.fill,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      class: this._classFor("cardinal")
    };
    const directions = [
      { label: "N", dcos: [0, 1, 0] },
      { label: "E", dcos: [1, 0, 0] },
      { label: "S", dcos: [0, -1, 0] },
      { label: "W", dcos: [-1, 0, 0] }
    ];
    for (const { label, dcos } of directions) {
      const d = this._rotate(dcos);
      const hLen = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      if (hLen < 0.05) continue;
      svg.text(
        cx + (r + offset) * d[0] / hLen,
        cx - (r + offset) * d[1] / hLen,
        label,
        style
      );
    }
  }
  _renderHeatmapString(svg) {
    const opacity = (this._heatmapOptions || {}).opacity;
    const cls = this._classFor("heatmap");
    this._heatmapCells((x, y, size, fill) => {
      svg.rect(x, y, size, size, {
        fill,
        "fill-opacity": opacity,
        "shape-rendering": "crispEdges",
        class: cls
      });
    });
  }
  _renderContoursString(svg) {
    const opts = this._contourOptions || {};
    const defaultStroke = opts.stroke || "#333";
    const defaultWidth = opts.strokeWidth || 0.8;
    const colors = opts.colors;
    const cls = this._classFor("contour");
    for (let k = 0; k < this._contourPaths.length; k++) {
      const { paths } = this._contourPaths[k];
      const stroke = colors && colors[k] ? colors[k] : defaultStroke;
      for (const path of paths) {
        const svgPts = path.map(([px, py]) => this._toSvg(px, py));
        if (svgPts.length > 1) {
          svg.polyline(svgPts, {
            stroke,
            "stroke-width": defaultWidth,
            fill: "none",
            class: cls
          });
        }
      }
    }
  }
  _renderItemString(svg, item) {
    switch (item.type) {
      case "pole": {
        const dcos = planeToDcos(item.dd, item.dip);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory("pole", item.style);
        svg.circle(sx, sy, s.r, {
          fill: s.fill,
          stroke: s.stroke,
          class: this._classFor("pole", item.style.class)
        });
        break;
      }
      case "line": {
        const dcos = lineToDcos(item.trend, item.plunge);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory("line", item.style);
        svg.circle(sx, sy, s.r, {
          fill: s.fill,
          stroke: s.stroke,
          class: this._classFor("line", item.style.class)
        });
        break;
      }
      case "plane": {
        const pole = planeToDcos(item.dd, item.dip);
        const pts3d = greatCircle(pole, 180);
        const s = this._resolveCategory("plane", item.style);
        for (const seg of this._projectCurve(pts3d)) {
          if (seg.length > 1) {
            svg.polyline(seg, {
              stroke: s.stroke,
              "stroke-width": s.strokeWidth,
              fill: "none",
              class: this._classFor("plane", item.style.class)
            });
          }
        }
        break;
      }
      case "cone": {
        const axis = lineToDcos(item.trend, item.plunge);
        const halfAngle = item.halfAngle * DEG3;
        const pts3d = smallCircle(axis, halfAngle, 180);
        const s = this._resolveCategory("cone", item.style);
        for (const seg of this._projectCurve(pts3d)) {
          if (seg.length > 1) {
            svg.polyline(seg, {
              stroke: s.stroke,
              "stroke-width": s.strokeWidth,
              fill: "none",
              "stroke-dasharray": s.strokeDasharray,
              class: this._classFor("cone", item.style.class)
            });
          }
        }
        break;
      }
      case "ellipse": {
        const pts3d = ellipse(item.centerDir, item.majorDir, item.aRad, item.bRad);
        const s = this._resolveCategory("ellipse", item.style);
        for (const seg of this._projectCurve(pts3d)) {
          if (seg.length > 1) {
            svg.polyline(seg, {
              stroke: s.stroke,
              "stroke-width": s.strokeWidth,
              fill: s.fill,
              "stroke-dasharray": s.strokeDasharray,
              class: this._classFor("ellipse", item.style.class)
            });
          }
        }
        break;
      }
      case "curve": {
        const st = item.style || {};
        for (const seg of this._projectCurve(item.points)) {
          if (seg.length > 1) {
            svg.polyline(seg, {
              stroke: st.stroke || "#000",
              "stroke-width": st.strokeWidth != null ? st.strokeWidth : 1,
              fill: "none",
              "stroke-dasharray": st.strokeDasharray,
              class: this._classFor("curve", st.class)
            });
          }
        }
        break;
      }
      case "text": {
        const dcos = lineToDcos(item.trend, item.plunge);
        const d = this._rotate(dcos);
        if (d[2] > 1e-9) break;
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const st = item.style || {};
        svg.text(sx + (st.dx || 0), sy + (st.dy || 0), item.content, {
          fill: st.fill || "#000",
          "font-size": st.fontSize || 11,
          "font-family": st.fontFamily || "sans-serif",
          "font-weight": st.fontWeight || 400,
          "text-anchor": st.textAnchor || "start",
          class: this._classFor("text", st.class)
        });
        break;
      }
    }
  }
  // ---------------------------------------------------------------------------
  //  DOM rendering — persistent SVG element, in-place attribute updates
  // ---------------------------------------------------------------------------
  /**
   * Return the persistent SVG DOM element (browser only).
   * Creates and renders on first call; subsequent calls return the same element.
   * Call render() after changing data or rotation to update.
   */
  element() {
    if (!this._el) {
      this._buildDOM();
      this.render();
    }
    return this._el;
  }
  /** Build the persistent SVG DOM structure. */
  _buildDOM() {
    const s = this.size;
    const c = this._center;
    const r = this._radius;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("width", s);
    svg.setAttribute("height", s);
    svg.setAttribute("viewBox", `0 0 ${s} ${s}`);
    this._bgEl = document.createElementNS(SVG_NS, "circle");
    setAttrs(this._bgEl, {
      cx: c,
      cy: c,
      r,
      fill: this._resolveCategory("background"),
      stroke: "none",
      class: this._classFor("background")
    });
    svg.appendChild(this._bgEl);
    const defs = document.createElementNS(SVG_NS, "defs");
    const clipPath = document.createElementNS(SVG_NS, "clipPath");
    clipPath.setAttribute("id", this._clipId);
    const clipCircle = document.createElementNS(SVG_NS, "circle");
    setAttrs(clipCircle, { cx: c, cy: c, r });
    clipPath.appendChild(clipCircle);
    defs.appendChild(clipPath);
    svg.appendChild(defs);
    const clipGroup = document.createElementNS(SVG_NS, "g");
    clipGroup.setAttribute("clip-path", `url(#${this._clipId})`);
    this._heatmapGroup = document.createElementNS(SVG_NS, "g");
    clipGroup.appendChild(this._heatmapGroup);
    const gridStyle = this._resolveCategory("grid");
    this._gcPath = document.createElementNS(SVG_NS, "path");
    setAttrs(this._gcPath, {
      stroke: gridStyle.stroke,
      "stroke-width": gridStyle.strokeWidth,
      fill: "none",
      class: this._classFor("grid")
    });
    clipGroup.appendChild(this._gcPath);
    this._scPath = document.createElementNS(SVG_NS, "path");
    setAttrs(this._scPath, {
      stroke: gridStyle.stroke,
      "stroke-width": gridStyle.strokeWidth,
      fill: "none",
      class: this._classFor("grid")
    });
    clipGroup.appendChild(this._scPath);
    this._contourGroup = document.createElementNS(SVG_NS, "g");
    clipGroup.appendChild(this._contourGroup);
    this._dataGroup = document.createElementNS(SVG_NS, "g");
    clipGroup.appendChild(this._dataGroup);
    svg.appendChild(clipGroup);
    const primStyle = this._resolveCategory("primitive");
    this._primEl = document.createElementNS(SVG_NS, "circle");
    setAttrs(this._primEl, {
      cx: c,
      cy: c,
      r,
      fill: "none",
      stroke: primStyle.stroke,
      "stroke-width": primStyle.strokeWidth,
      class: this._classFor("primitive")
    });
    svg.appendChild(this._primEl);
    const cardStyle = this._resolveCategory("cardinals");
    this._cardinalEls = [];
    for (const label of ["N", "E", "S", "W"]) {
      const text = document.createElementNS(SVG_NS, "text");
      setAttrs(text, {
        "font-size": cardStyle.fontSize,
        "font-family": cardStyle.fontFamily,
        fill: cardStyle.fill,
        "text-anchor": "middle",
        "dominant-baseline": "central",
        class: this._classFor("cardinal")
      });
      text.textContent = label;
      svg.appendChild(text);
      this._cardinalEls.push(text);
    }
    this._el = svg;
  }
  /**
   * Update the persistent DOM element in place.
   * No-op if element() hasn't been called yet.
   * Returns `this`.
   */
  render() {
    if (!this._el) return this;
    const gridStyle = this._resolveCategory("grid");
    const primStyle = this._resolveCategory("primitive");
    this._bgEl.setAttribute("fill", this._resolveCategory("background"));
    setAttrs(this._gcPath, { stroke: gridStyle.stroke, "stroke-width": gridStyle.strokeWidth });
    setAttrs(this._scPath, { stroke: gridStyle.stroke, "stroke-width": gridStyle.strokeWidth });
    setAttrs(this._primEl, { stroke: primStyle.stroke, "stroke-width": primStyle.strokeWidth });
    const { greatCircles, smallCircles } = generateNet(this.gridSpacing, this.net);
    this._gcPath.setAttribute("d", this._curvesToPathD(greatCircles));
    this._scPath.setAttribute("d", this._curvesToPathD(smallCircles));
    this._renderHeatmapDOM();
    this._renderContoursDOM();
    for (const item of this._items) {
      this._renderItemDOM(item);
    }
    this._renderCardinalsDOM();
    return this;
  }
  /** Convert an array of 3D curves to a combined SVG path d string. */
  _curvesToPathD(curves3d) {
    const parts = [];
    for (const curve of curves3d) {
      for (const seg of this._projectCurve(curve)) {
        if (seg.length > 1) {
          parts.push("M" + seg.map(([x, y]) => `${x},${y}`).join("L"));
        }
      }
    }
    return parts.join("");
  }
  /** Create or update the DOM element for a data item. */
  _renderItemDOM(item) {
    switch (item.type) {
      case "pole": {
        const dcos = planeToDcos(item.dd, item.dip);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory("pole", item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "circle");
          setAttrs(item._el, { class: this._classFor("pole", item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          cx: sx,
          cy: sy,
          r: s.r,
          fill: s.fill,
          stroke: s.stroke
        });
        break;
      }
      case "line": {
        const dcos = lineToDcos(item.trend, item.plunge);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory("line", item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "circle");
          setAttrs(item._el, { class: this._classFor("line", item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          cx: sx,
          cy: sy,
          r: s.r,
          fill: s.fill,
          stroke: s.stroke
        });
        break;
      }
      case "plane": {
        const pole = planeToDcos(item.dd, item.dip);
        const pts3d = greatCircle(pole, 180);
        const d = segmentsToPathD(this._projectCurve(pts3d));
        const s = this._resolveCategory("plane", item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "path");
          setAttrs(item._el, { class: this._classFor("plane", item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          d,
          stroke: s.stroke,
          "stroke-width": s.strokeWidth,
          fill: "none"
        });
        break;
      }
      case "cone": {
        const axis = lineToDcos(item.trend, item.plunge);
        const halfAngle = item.halfAngle * DEG3;
        const pts3d = smallCircle(axis, halfAngle, 180);
        const d = segmentsToPathD(this._projectCurve(pts3d));
        const s = this._resolveCategory("cone", item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "path");
          setAttrs(item._el, { class: this._classFor("cone", item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          d,
          stroke: s.stroke,
          "stroke-width": s.strokeWidth,
          fill: "none",
          "stroke-dasharray": s.strokeDasharray
        });
        break;
      }
      case "ellipse": {
        const pts3d = ellipse(item.centerDir, item.majorDir, item.aRad, item.bRad);
        const d = segmentsToPathD(this._projectCurve(pts3d));
        const s = this._resolveCategory("ellipse", item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "path");
          setAttrs(item._el, { class: this._classFor("ellipse", item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          d,
          stroke: s.stroke,
          "stroke-width": s.strokeWidth,
          fill: s.fill,
          "stroke-dasharray": s.strokeDasharray
        });
        break;
      }
      case "curve": {
        const d = segmentsToPathD(this._projectCurve(item.points));
        const st = item.style || {};
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "path");
          setAttrs(item._el, { class: this._classFor("curve", st.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          d,
          stroke: st.stroke || "#000",
          "stroke-width": st.strokeWidth != null ? st.strokeWidth : 1,
          fill: "none",
          "stroke-dasharray": st.strokeDasharray
        });
        break;
      }
      case "text": {
        const dcos = lineToDcos(item.trend, item.plunge);
        const d = this._rotate(dcos);
        const st = item.style || {};
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, "text");
          setAttrs(item._el, { class: this._classFor("text", st.class) });
          this._dataGroup.appendChild(item._el);
        }
        if (d[2] > 1e-9) {
          setAttrs(item._el, { display: "none" });
          item._el.textContent = item.content;
          break;
        }
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        setAttrs(item._el, {
          display: "",
          x: sx + (st.dx || 0),
          y: sy + (st.dy || 0),
          fill: st.fill || "#000",
          "font-size": st.fontSize || 11,
          "font-family": st.fontFamily || "sans-serif",
          "font-weight": st.fontWeight || 400,
          "text-anchor": st.textAnchor || "start"
        });
        item._el.textContent = item.content;
        break;
      }
    }
  }
  /** Update the heatmap raster in the DOM. */
  _renderHeatmapDOM() {
    if (!this._heatmapGroup) return;
    while (this._heatmapGroup.firstChild) this._heatmapGroup.firstChild.remove();
    if (!this._heatmapData) return;
    const opacity = (this._heatmapOptions || {}).opacity;
    const cls = this._classFor("heatmap");
    this._heatmapCells((x, y, size, fill) => {
      const el = document.createElementNS(SVG_NS, "rect");
      setAttrs(el, {
        x,
        y,
        width: size,
        height: size,
        fill,
        "fill-opacity": opacity,
        "shape-rendering": "crispEdges",
        class: cls
      });
      this._heatmapGroup.appendChild(el);
    });
  }
  /** Update contour paths in the DOM. */
  _renderContoursDOM() {
    if (!this._contourGroup) return;
    while (this._contourGroup.firstChild) this._contourGroup.firstChild.remove();
    if (!this._contourPaths) return;
    const opts = this._contourOptions || {};
    const defaultStroke = opts.stroke || "#333";
    const defaultWidth = opts.strokeWidth || 0.8;
    const colors = opts.colors;
    const cls = this._classFor("contour");
    for (let k = 0; k < this._contourPaths.length; k++) {
      const { paths } = this._contourPaths[k];
      const stroke = colors && colors[k] ? colors[k] : defaultStroke;
      for (const path of paths) {
        const svgPts = path.map(([px, py]) => this._toSvg(px, py));
        if (svgPts.length > 1) {
          const d = "M" + svgPts.map(([x, y]) => `${x},${y}`).join("L");
          const el = document.createElementNS(SVG_NS, "path");
          setAttrs(el, { d, stroke, "stroke-width": defaultWidth, fill: "none", class: cls });
          this._contourGroup.appendChild(el);
        }
      }
    }
  }
  /**
   * Return the SVG as a data: URI suitable for an <img> src or download.
   * @returns {string} data:image/svg+xml;... URI
   */
  svgDataURL() {
    const svgStr = this.svg();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  }
  /**
   * Trigger a browser download of the SVG (browser-only).
   * @param {string} [filename='stereonet.svg']
   */
  download(filename = "stereonet.svg") {
    const url = this.svgDataURL();
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  /**
   * Output pixel size for raster export. Square (the net is square).
   * @param {Object} [options] - { width } overrides { scale } (default scale 2)
   * @returns {number} side length in pixels
   */
  _pngSize(options = {}) {
    if (options.width) return Math.round(options.width);
    return Math.round(this.size * (options.scale || 2));
  }
  /**
   * Rasterise the stereonet to a PNG data URL. Browser-only (uses Image + canvas).
   * @param {Object} [options]
   * @param {number} [options.scale=2] - pixel scale factor (e.g. 2 for retina)
   * @param {number} [options.width] - explicit output side in px (overrides scale)
   * @param {string} [options.background] - colour painted behind the SVG (default transparent)
   * @returns {Promise<string>} data:image/png;base64,... URL
   */
  toPNG(options = {}) {
    return new Promise((resolve, reject) => {
      const side = this._pngSize(options);
      const url = this.svgDataURL();
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = side;
          canvas.height = side;
          const ctx = canvas.getContext("2d");
          if (options.background) {
            ctx.fillStyle = options.background;
            ctx.fillRect(0, 0, side, side);
          }
          ctx.drawImage(img, 0, 0, side, side);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Failed to rasterise stereonet SVG"));
      img.src = url;
    });
  }
  /**
   * Trigger a browser download of the stereonet as a PNG (browser-only).
   * @param {string} [filename='stereonet.png']
   * @param {Object} [options] - same as toPNG()
   * @returns {Promise<void>}
   */
  async downloadPNG(filename = "stereonet.png", options = {}) {
    const url = await this.toPNG(options);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  /** Update cardinal label positions in the DOM. */
  _renderCardinalsDOM() {
    const cx = this._center;
    const r = this._radius;
    const cardStyle = this._resolveCategory("cardinals");
    const offset = cardStyle.offset;
    const directions = [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]];
    for (let i = 0; i < 4; i++) {
      const d = this._rotate(directions[i]);
      const hLen = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      const el = this._cardinalEls[i];
      if (hLen < 0.05) {
        el.setAttribute("display", "none");
      } else {
        el.removeAttribute("display");
        el.setAttribute("x", cx + (r + offset) * d[0] / hLen);
        el.setAttribute("y", cx - (r + offset) * d[1] / hLen);
        el.setAttribute("font-size", cardStyle.fontSize);
        el.setAttribute("font-family", cardStyle.fontFamily);
        el.setAttribute("fill", cardStyle.fill);
      }
    }
  }
};
function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== void 0 && v !== null) el.setAttribute(k, v);
  }
}

// src/core/quat.js
var quat_exports = {};
__export(quat_exports, {
  angle: () => angle2,
  conjugate: () => conjugate,
  fromAxisAngle: () => fromAxisAngle,
  fromMatrix: () => fromMatrix,
  identity: () => identity2,
  multiply: () => multiply2,
  normalize: () => normalize2,
  slerp: () => slerp,
  toAxisAngle: () => toAxisAngle,
  toMatrix: () => toMatrix
});
function identity2() {
  return [1, 0, 0, 0];
}
function normalize2(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function conjugate(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}
function multiply2(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
  ];
}
function fromAxisAngle(axis, angle3) {
  const a = normalize(axis);
  const h = angle3 / 2, s = Math.sin(h);
  return [Math.cos(h), a[0] * s, a[1] * s, a[2] * s];
}
function toAxisAngle(q) {
  let [w, x, y, z] = normalize2(q);
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const angle3 = 2 * Math.acos(Math.min(1, w));
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-9) return { axis: [0, 0, 1], angle: 0 };
  return { axis: [x / s, y / s, z / s], angle: angle3 };
}
function angle2(q) {
  return 2 * Math.acos(Math.min(1, Math.abs(normalize2(q)[0])));
}
function toMatrix(q) {
  const [w, x, y, z] = normalize2(q);
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y)
  ];
}
function fromMatrix(m) {
  const tr = m[0] + m[4] + m[8];
  let w, x, y, z;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    w = 0.25 * S;
    x = (m[7] - m[5]) / S;
    y = (m[2] - m[6]) / S;
    z = (m[3] - m[1]) / S;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const S = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / S;
    x = 0.25 * S;
    y = (m[1] + m[3]) / S;
    z = (m[2] + m[6]) / S;
  } else if (m[4] > m[8]) {
    const S = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / S;
    x = (m[1] + m[3]) / S;
    y = 0.25 * S;
    z = (m[5] + m[7]) / S;
  } else {
    const S = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / S;
    x = (m[2] + m[6]) / S;
    y = (m[5] + m[7]) / S;
    z = 0.25 * S;
  }
  return normalize2([w, x, y, z]);
}
function slerp(a, b, t) {
  let [aw, ax, ay, az] = normalize2(a);
  let [bw, bx, by, bz] = normalize2(b);
  let dot2 = aw * bw + ax * bx + ay * by + az * bz;
  if (dot2 < 0) {
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
    dot2 = -dot2;
  }
  if (dot2 > 0.9995) {
    return normalize2([aw + t * (bw - aw), ax + t * (bx - ax), ay + t * (by - ay), az + t * (bz - az)]);
  }
  const theta0 = Math.acos(dot2), theta = theta0 * t;
  const sinTheta0 = Math.sin(theta0);
  const s1 = Math.sin(theta) / sinTheta0;
  const s0 = Math.cos(theta) - dot2 * s1;
  return [s0 * aw + s1 * bw, s0 * ax + s1 * bx, s0 * ay + s1 * by, s0 * az + s1 * bz];
}

// src/io.js
var io_exports = {};
__export(io_exports, {
  parse: () => parse,
  parseDip: () => parseDip,
  parseDirection: () => parseDirection,
  parseLines: () => parseLines,
  parsePlanes: () => parsePlanes,
  translateAttitude: () => translateAttitude
});
function parseDirection(s) {
  s = s.trim().toUpperCase();
  if (/^-?\d+(\.\d+)?$/.test(s)) return (parseFloat(s) % 360 + 360) % 360;
  const m = s.match(/^([NS])(\d+(?:\.\d+)?)([EW])?$/);
  if (!m) throw new Error(`Cannot parse direction: "${s}"`);
  const from = m[1];
  const angle3 = parseFloat(m[2]);
  const to = m[3] || "";
  if (from === "N") {
    if (to === "E" || to === "") return angle3;
    if (to === "W") return (360 - angle3) % 360;
  }
  if (from === "S") {
    if (to === "E") return 180 - angle3;
    if (to === "W") return 180 + angle3;
    return 180 - angle3;
  }
  throw new Error(`Cannot parse direction: "${s}"`);
}
function parseDip(s) {
  s = s.trim().toUpperCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([NESW]{0,2})$/);
  if (!m) throw new Error(`Cannot parse dip: "${s}"`);
  return { dip: parseFloat(m[1]), quadrant: m[2] || "" };
}
function quadrantToAzimuth(q) {
  const map = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315
  };
  if (!(q in map)) throw new Error(`Unknown dip quadrant: "${q}"`);
  return map[q];
}
function translateAttitude(direction, dip, quadrant, strike = false) {
  if (!strike) {
    return [(direction % 360 + 360) % 360, dip];
  }
  if (!quadrant) {
    return [((direction + 90) % 360 + 360) % 360, dip];
  }
  const qAz = quadrantToAzimuth(quadrant);
  const dd1 = ((direction + 90) % 360 + 360) % 360;
  const dd2 = ((direction - 90) % 360 + 360) % 360;
  const diff1 = Math.abs(angleDiff(dd1, qAz));
  const diff2 = Math.abs(angleDiff(dd2, qAz));
  return [diff1 <= diff2 ? dd1 : dd2, dip];
}
function angleDiff(a, b) {
  let d = ((b - a) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}
function parse(text) {
  const results = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/[\/,\s\t]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    if (isNaN(a) || isNaN(b)) continue;
    results.push([a, b]);
  }
  return results;
}
function parsePlanes(text, options = {}) {
  const strike = !!options.strike;
  const results = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/[\/,\s\t]+/).filter(Boolean);
    if (parts.length < 2) continue;
    let direction, dipVal, quadrant;
    try {
      direction = parseDirection(parts[0]);
      const parsed = parseDip(parts[1]);
      dipVal = parsed.dip;
      quadrant = parsed.quadrant;
    } catch {
      continue;
    }
    const [dd, dip] = translateAttitude(direction, dipVal, quadrant, strike);
    results.push(planeToDcos(dd, dip));
  }
  return results;
}
function parseLines(text) {
  const results = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/[\/,\s\t]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const trend = parseFloat(parts[0]);
    const plunge = parseFloat(parts[1]);
    if (isNaN(trend) || isNaN(plunge)) continue;
    results.push(lineToDcos(trend, plunge));
  }
  return results;
}

// src/circular.js
var circular_exports = {};
__export(circular_exports, {
  circularMean: () => circularMean,
  circularStdDev: () => circularStdDev,
  circularVariance: () => circularVariance,
  rayleighTest: () => rayleighTest,
  resultant: () => resultant2,
  vonMisesKappa: () => vonMisesKappa
});
var DEG4 = Math.PI / 180;
var RAD = 180 / Math.PI;
function components(azimuths, axial) {
  const k = axial ? 2 : 1;
  let C = 0, S = 0, n = 0;
  for (const az of azimuths) {
    if (!Number.isFinite(az)) continue;
    const a = az * k * DEG4;
    C += Math.cos(a);
    S += Math.sin(a);
    n += 1;
  }
  return { C, S, n, k };
}
function resultant2(azimuths, options = {}) {
  const axial = !!options.axial;
  const { C, S, n, k } = components(azimuths, axial);
  const R = Math.hypot(C, S);
  let mean = NaN;
  if (R > 1e-12) {
    let m = Math.atan2(S, C) * RAD / k;
    m = (m % 360 + 360) % 360;
    mean = m;
  }
  return { n, R, Rbar: n > 0 ? R / n : 0, mean };
}
function circularMean(azimuths, options = {}) {
  return resultant2(azimuths, options).mean;
}
function circularVariance(azimuths, options = {}) {
  return 1 - resultant2(azimuths, options).Rbar;
}
function circularStdDev(azimuths, options = {}) {
  const { Rbar } = resultant2(azimuths, options);
  if (Rbar <= 0) return Infinity;
  return Math.sqrt(-2 * Math.log(Rbar)) * RAD;
}
function vonMisesKappa(azimuths, options = {}) {
  const { Rbar } = resultant2(azimuths, options);
  if (Rbar < 1e-12) return 0;
  if (Rbar < 0.53) return 2 * Rbar + Rbar ** 3 + 5 * Rbar ** 5 / 6;
  if (Rbar < 0.85) return -0.4 + 1.39 * Rbar + 0.43 / (1 - Rbar);
  return 1 / (Rbar ** 3 - 4 * Rbar ** 2 + 3 * Rbar);
}
function rayleighTest(azimuths, options = {}) {
  const { n, Rbar } = resultant2(azimuths, options);
  if (n === 0) return { n: 0, Rbar: 0, z: 0, p: 1 };
  const z = n * Rbar * Rbar;
  const p = Math.exp(-z) * (1 + (2 * z - z * z) / (4 * n) - (24 * z - 132 * z * z + 76 * z ** 3 - 9 * z ** 4) / (288 * n * n));
  return { n, Rbar, z, p: Math.max(0, Math.min(1, p)) };
}

// src/rose.js
var rose_exports = {};
__export(rose_exports, {
  roseBins: () => roseBins,
  rosePetals: () => rosePetals,
  roseSVG: () => roseSVG
});
var DEG5 = Math.PI / 180;
function petalPoint(cx, cy, r, azDeg) {
  const a = azDeg * DEG5;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
function roseBins(azimuths, options = {}) {
  const binWidth = options.binWidth || 10;
  const axial = !!options.axial;
  const nBins = Math.round(360 / binWidth);
  const counts = new Array(nBins).fill(0);
  const add2 = (az) => {
    const a = (az % 360 + 360) % 360;
    const idx = Math.floor((a + binWidth / 2) / binWidth) % nBins;
    counts[idx]++;
  };
  for (const az of azimuths) {
    if (!Number.isFinite(az)) continue;
    add2(az);
    if (axial) add2(az + 180);
  }
  let n = 0, maxCount = 0;
  for (const c of counts) {
    n += c;
    if (c > maxCount) maxCount = c;
  }
  const bins = counts.map((count, i) => {
    const midDeg = i * binWidth;
    return {
      startDeg: midDeg - binWidth / 2,
      endDeg: midDeg + binWidth / 2,
      midDeg,
      count,
      frequency: n > 0 ? count / n : 0
    };
  });
  return {
    bins,
    binWidth,
    n,
    maxCount,
    maxFrequency: n > 0 ? maxCount / n : 0,
    axial
  };
}
function rosePetals(binned, options = {}) {
  const cx = options.cx ?? 0;
  const cy = options.cy ?? 0;
  const R = options.radius ?? 100;
  const r0 = options.innerRadius ?? 0;
  const scale2 = options.scale || "linear";
  const max = binned.maxCount || 1;
  const samples = Math.max(1, Math.round(binned.binWidth / 5));
  const petals = [];
  for (const bin of binned.bins) {
    if (bin.count <= 0) continue;
    const frac = scale2 === "sqrt" ? Math.sqrt(bin.count / max) : bin.count / max;
    const r1 = r0 + (R - r0) * frac;
    const points = [];
    if (r0 > 1e-9) points.push(petalPoint(cx, cy, r0, bin.startDeg));
    else points.push([cx, cy]);
    for (let s = 0; s <= samples; s++) {
      const az = bin.startDeg + (bin.endDeg - bin.startDeg) * (s / samples);
      points.push(petalPoint(cx, cy, r1, az));
    }
    if (r0 > 1e-9) {
      for (let s = samples; s >= 0; s--) {
        const az = bin.startDeg + (bin.endDeg - bin.startDeg) * (s / samples);
        points.push(petalPoint(cx, cy, r0, az));
      }
    }
    petals.push({ bin, points, radius: r1 });
  }
  return petals;
}
var r2 = (x) => Math.round(x * 100) / 100;
function roseSVG(azimuths, options = {}) {
  const size = options.size || 300;
  const pad = options.padding ?? 20;
  const cx = size / 2, cy = size / 2;
  const radius = (size - 2 * pad) / 2;
  const binned = roseBins(azimuths, options);
  const svg = new SvgBuilder(size, size);
  svg.circle(cx, cy, radius, {
    fill: options.background || "none",
    stroke: options.frameStroke || "#999",
    "stroke-width": 1
  });
  const rings = options.rings ?? 0;
  for (let i = 1; i < rings; i++) {
    svg.circle(cx, cy, radius * i / rings, { fill: "none", stroke: "#ddd", "stroke-width": 0.5 });
  }
  const petals = rosePetals(binned, {
    cx,
    cy,
    radius,
    scale: options.scale,
    innerRadius: options.innerRadius
  });
  for (const p of petals) {
    const d = "M" + p.points.map(([x, y]) => `${r2(x)},${r2(y)}`).join("L") + "Z";
    svg.path(d, {
      fill: options.fill || "#e8920c",
      "fill-opacity": options.fillOpacity ?? 0.8,
      stroke: options.petalStroke || "#7a4a06",
      "stroke-width": options.petalStrokeWidth ?? 0.5
    });
  }
  return svg.toString();
}

// src/analysis.js
var analysis_exports = {};
__export(analysis_exports, {
  bestFitGreatCircle: () => bestFitGreatCircle,
  bestFitPlane: () => bestFitPlane,
  foldAxis: () => foldAxis,
  rotateData: () => rotateData,
  unfold: () => unfold
});
function bestFitGreatCircle(dcos) {
  const { eigenvalues, eigenvectors } = principalAxes(dcos);
  const pole = eigenvectors[2];
  return {
    pole,
    axis: dcosToLine(pole),
    plane: dcosToPlane(pole),
    eigenvalues,
    girdle: 2 * (eigenvalues[1] - eigenvalues[2])
  };
}
function bestFitPlane(dcos) {
  const { pole, plane, eigenvalues, girdle } = bestFitGreatCircle(dcos);
  return { pole, plane, eigenvalues, girdle };
}
function foldAxis(poles) {
  return bestFitGreatCircle(poles).axis;
}
function rotateData(dcos, axis, angleDeg) {
  return rotateDcosArray(dcos, axis, angleDeg);
}
function unfold(dcos, dipDir, dip) {
  const strike = lineToDcos(dipDir - 90, 0);
  return rotateDcosArray(dcos, strike, -dip);
}

// src/compass.js
var compass_exports = {};
__export(compass_exports, {
  deviceOrientationMatrix: () => deviceOrientationMatrix,
  lineFromDeviceOrientation: () => lineFromDeviceOrientation,
  planeFromDeviceOrientation: () => planeFromDeviceOrientation
});
var DEG6 = Math.PI / 180;
function deviceOrientationMatrix(alpha, beta, gamma) {
  const a = alpha * DEG6, b = beta * DEG6, g = gamma * DEG6;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return [
    cA * cG - sA * sB * sG,
    -sA * cB,
    cA * sG + sA * sB * cG,
    sA * cG + cA * sB * sG,
    cA * cB,
    sA * sG - cA * sB * cG,
    -cB * sG,
    sB,
    cB * cG
  ];
}
function enuToBearing(v) {
  return [v[0], v[1], -v[2]];
}
function applyDeclination(azimuth, declination) {
  return ((azimuth + (declination || 0)) % 360 + 360) % 360;
}
function planeFromDeviceOrientation(alpha, beta, gamma, options = {}) {
  const R = deviceOrientationMatrix(alpha, beta, gamma);
  const normalENU = [R[2], R[5], R[8]];
  const [dipDir, dip] = dcosToPlane(enuToBearing(normalENU));
  return [applyDeclination(dipDir, options.declination), dip];
}
function lineFromDeviceOrientation(alpha, beta, gamma, options = {}) {
  const R = deviceOrientationMatrix(alpha, beta, gamma);
  const dirENU = [R[1], R[4], R[7]];
  const [trend, plunge] = dcosToLine(enuToBearing(dirENU));
  return [applyDeclination(trend, options.declination), plunge];
}

// src/fault.js
var fault_exports = {};
__export(fault_exports, {
  dihedraGrid: () => dihedraGrid,
  dipVector: () => dipVector,
  michael: () => michael,
  principalStresses: () => principalStresses,
  ptAxes: () => ptAxes,
  resolveSense: () => resolveSense
});
function dipVector(normal) {
  let n = normalize(normal);
  if (n[2] > 0) n = negate(n);
  const down = [0, 0, -1];
  const proj = sub(down, scale(n, dot(down, n)));
  const len = length(proj);
  return len < 1e-10 ? [1, 0, 0] : scale(proj, 1 / len);
}
function resolveSense(normal, line, sense) {
  let n = normalize(normal);
  if (n[2] > 0) n = negate(n);
  const s = String(sense).toLowerCase()[0];
  if (s === "u" || s === "f" || s === "0" || s === "5" || s === "?") return { slip: line, defined: false };
  if (s === "n" || s === "2" || s === "-") return { slip: line, defined: true };
  if (s === "i" || s === "1" || s === "+") return { slip: negate(line), defined: true };
  const lineSense = dot(dipVector(n), line);
  if (s === "d" || s === "3") return { slip: lineSense > 0 ? line : negate(line), defined: true };
  if (s === "s" || s === "4") return { slip: lineSense < 0 ? line : negate(line), defined: true };
  return { slip: line, defined: true };
}
function ptAxes(normal, slip) {
  const n = normalize(normal);
  const s = normalize(slip);
  return { p: normalize(sub(n, s)), t: normalize(add(n, s)) };
}
function solveLinear(M, b) {
  const n = b.length;
  const A = M.map((row, i) => row.concat(b[i]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-300) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[n] / A[i][i]);
}
function michael(planes, slips) {
  const AtA = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const Atb = new Array(5).fill(0);
  let btb = 0;
  for (let i = 0; i < planes.length; i++) {
    const [n1, n2, n3] = planes[i];
    const s = slips[i];
    const rows = [
      [n1 - n1 ** 3 + n1 * n3 ** 2, n2 - 2 * n2 * n1 ** 2, n3 - 2 * n3 * n1 ** 2, -n1 * n2 ** 2 + n1 * n3 ** 2, -2 * n1 * n2 * n3],
      [-n2 * n1 ** 2 + n2 * n3 ** 2, n1 - 2 * n1 * n2 ** 2, -2 * n1 * n2 * n3, n2 - n2 ** 3 + n2 * n3 ** 2, n3 - 2 * n3 * n2 ** 2],
      [-n3 * n1 ** 2 - n3 + n3 ** 3, -2 * n1 * n2 * n3, n1 - 2 * n1 * n3 ** 2, -(n2 ** 2) * n3 - n3 + n3 ** 3, n2 - 2 * n2 * n3 ** 2]
    ];
    for (let k = 0; k < 3; k++) {
      const row = rows[k], bk = s[k];
      btb += bk * bk;
      for (let a = 0; a < 5; a++) {
        Atb[a] += row[a] * bk;
        for (let c = 0; c < 5; c++) AtA[a][c] += row[a] * row[c];
      }
    }
  }
  const x = solveLinear(AtA, Atb);
  let residual = btb;
  for (let a = 0; a < 5; a++) residual -= x[a] * Atb[a];
  const [s11, s12, s13, s22, s23] = x.map((v) => -v);
  const stress = [s11, s12, s13, s12, s22, s23, s13, s23, -(s11 + s22)];
  return { stress, residual: Math.max(0, residual) };
}
function principalStresses(stress) {
  const { values, vectors } = symmetricEigen3(stress);
  return { axes: [vectors[2], vectors[1], vectors[0]], values: [values[2], values[1], values[0]] };
}
function dihedraGrid(planes, slips, options = {}) {
  const projection = options.projection || "equal-area";
  const gridSize = options.gridSize || 40;
  const projR = projection === "equal-angle" ? 1 : Math.SQRT2;
  const step = 2 * projR / (gridSize - 1);
  const grid = new Float64Array(gridSize * gridSize);
  const inverseFn = projection === "equal-angle" ? inverse2 : inverse;
  const m = planes.length || 1;
  for (let j = 0; j < gridSize; j++) {
    const py = projR - j * step;
    for (let i = 0; i < gridSize; i++) {
      const px = -projR + i * step;
      if (px * px + py * py > projR * projR * 1.02) {
        grid[j * gridSize + i] = NaN;
        continue;
      }
      const d = inverseFn(px, py);
      if (!d) {
        grid[j * gridSize + i] = NaN;
        continue;
      }
      let sum = 0;
      for (let k = 0; k < planes.length; k++) {
        const n = planes[k], s = slips[k];
        sum += 2 * (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) * (d[0] * s[0] + d[1] * s[1] + d[2] * s[2]);
      }
      grid[j * gridSize + i] = sum / m;
    }
  }
  return { grid, gridSize, step, projR, projection };
}

// src/cluster.js
var cluster_exports = {};
__export(cluster_exports, {
  fitSets: () => fitSets,
  fitSetsEM: () => fitSetsEM,
  selectSets: () => selectSets
});
function leadingAxis(members) {
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const d of members) {
    T[0] += d[0] * d[0];
    T[1] += d[0] * d[1];
    T[2] += d[0] * d[2];
    T[4] += d[1] * d[1];
    T[5] += d[1] * d[2];
    T[8] += d[2] * d[2];
  }
  T[3] = T[1];
  T[6] = T[2];
  T[7] = T[5];
  const n = members.length || 1;
  for (let i = 0; i < 9; i++) T[i] /= n;
  const { values, vectors } = symmetricEigen3(T);
  return { axis: vectors[0], concentration: values[0] };
}
var adot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
function runOnce(dcos, centers, maxIter) {
  const n = dcos.length;
  const assign = new Array(n).fill(0);
  let cost = Infinity;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestSim = -1;
      for (let c = 0; c < centers.length; c++) {
        const sim = adot(dcos[i], centers[c]);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    for (let c = 0; c < centers.length; c++) {
      const members = [];
      for (let i = 0; i < n; i++) if (assign[i] === c) members.push(dcos[i]);
      if (members.length === 0) {
        let worst = 0, worstSim = Infinity;
        for (let i = 0; i < n; i++) {
          const sim = adot(dcos[i], centers[assign[i]]);
          if (sim < worstSim) {
            worstSim = sim;
            worst = i;
          }
        }
        centers[c] = dcos[worst].slice();
      } else {
        centers[c] = leadingAxis(members).axis;
      }
    }
    cost = 0;
    for (let i = 0; i < n; i++) {
      const s = adot(dcos[i], centers[assign[i]]);
      cost += 1 - s * s;
    }
    if (!changed && iter > 0) break;
  }
  return { centers, assign, cost };
}
function seedCenters(dcos, k, rng) {
  const n = dcos.length;
  const centers = [dcos[rng() * n | 0].slice()];
  while (centers.length < k) {
    const d2 = new Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      let nearest = 0;
      for (const c of centers) {
        const s = adot(dcos[i], c);
        if (s * s > nearest) nearest = s * s;
      }
      d2[i] = 1 - nearest;
      total += d2[i];
    }
    let r = rng() * (total || 1), pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centers.push(dcos[pick].slice());
  }
  return centers;
}
function fitSets(dcos, k, options = {}) {
  const n = dcos.length;
  const restarts = options.restarts || 8;
  const maxIter = options.maxIter || 50;
  const rng = options.rng || Math.random;
  if (n === 0 || k < 1) return { clusters: [], assignments: [], cost: 0 };
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const res = runOnce(dcos, seedCenters(dcos, Math.min(k, n), rng), maxIter);
    if (!best || res.cost < best.cost) best = res;
  }
  const raw = best.centers.map(() => []);
  best.assign.forEach((c, i) => raw[c].push(i));
  let clusters = raw.map((members) => {
    const vecs = members.map((i) => dcos[i]);
    const { axis, concentration } = members.length ? leadingAxis(vecs) : { axis: [0, 0, -1], concentration: 1 / 3 };
    return { axisDir: axis, axis: dcosToLine(axis), size: members.length, fraction: members.length / n, concentration, members };
  }).filter((c) => c.size > 0);
  clusters.sort((a, b) => b.size - a.size);
  const remap = /* @__PURE__ */ new Map();
  clusters.forEach((c, newIdx) => c.members.forEach((i) => remap.set(i, newIdx)));
  const assignments = best.assign.map((_, i) => remap.get(i));
  return { clusters, assignments, cost: best.cost };
}
function watsonM(kappa) {
  if (kappa > 100) return Math.exp(kappa) / (2 * kappa);
  let term = 1, sum = 1;
  for (let i = 1; i < 200; i++) {
    term *= kappa / i;
    const add2 = term / (2 * i + 1);
    sum += add2;
    if (add2 < sum * 1e-15) break;
  }
  return sum;
}
function watsonMprime(kappa) {
  if (kappa > 100) return Math.exp(kappa) / (2 * kappa);
  let term = 1, sum = 1 / 3;
  for (let i = 2; i < 200; i++) {
    term *= kappa / (i - 1);
    const add2 = term / (2 * i + 1);
    sum += add2;
    if (add2 < sum * 1e-15) break;
  }
  return sum;
}
function rOfKappa(kappa) {
  if (kappa < 1e-9) return 1 / 3;
  if (kappa > 100) return 1 - 1 / (2 * kappa);
  return watsonMprime(kappa) / watsonM(kappa);
}
function kappaFromR(r) {
  if (r <= 1 / 3) return 0;
  if (r >= 0.9995) return 200;
  let lo = 0, hi = 200;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (rOfKappa(mid) < r) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function lnWatsonNorm(kappa) {
  const lnM = kappa > 100 ? kappa - Math.log(2 * kappa) : Math.log(watsonM(kappa));
  return -Math.log(4 * Math.PI) - lnM;
}
function weightedAxis(dcos, weights) {
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let W = 0;
  for (let i = 0; i < dcos.length; i++) {
    const w = weights[i], d = dcos[i];
    if (w <= 0) continue;
    W += w;
    T[0] += w * d[0] * d[0];
    T[1] += w * d[0] * d[1];
    T[2] += w * d[0] * d[2];
    T[4] += w * d[1] * d[1];
    T[5] += w * d[1] * d[2];
    T[8] += w * d[2] * d[2];
  }
  T[3] = T[1];
  T[6] = T[2];
  T[7] = T[5];
  const inv = W > 0 ? 1 / W : 0;
  for (let i = 0; i < 9; i++) T[i] *= inv;
  const { values, vectors } = symmetricEigen3(T);
  return { axis: vectors[0], concentration: values[0], weight: W };
}
function emOnce(dcos, k, centers, maxIter, tol) {
  const n = dcos.length;
  const mu = centers.map((c) => c.slice());
  const kappa = new Array(k).fill(10);
  const w = new Array(k).fill(1 / k);
  const resp = Array.from({ length: n }, () => new Array(k).fill(0));
  let ll = -Infinity;
  for (let iter = 0; iter < maxIter; iter++) {
    let newLl = 0;
    for (let i = 0; i < n; i++) {
      const lp = new Array(k);
      let mx = -Infinity;
      for (let c = 0; c < k; c++) {
        const dot2 = dcos[i][0] * mu[c][0] + dcos[i][1] * mu[c][1] + dcos[i][2] * mu[c][2];
        lp[c] = Math.log(w[c] + 1e-300) + lnWatsonNorm(kappa[c]) + kappa[c] * dot2 * dot2;
        if (lp[c] > mx) mx = lp[c];
      }
      let se = 0;
      for (let c = 0; c < k; c++) se += Math.exp(lp[c] - mx);
      const lse = mx + Math.log(se);
      newLl += lse;
      for (let c = 0; c < k; c++) resp[i][c] = Math.exp(lp[c] - lse);
    }
    for (let c = 0; c < k; c++) {
      const col = resp.map((r) => r[c]);
      const { axis, concentration, weight } = weightedAxis(dcos, col);
      if (weight < 1e-6) {
        mu[c] = dcos[(iter + c) % n].slice();
        kappa[c] = 1;
        w[c] = 1e-6;
        continue;
      }
      mu[c] = axis;
      kappa[c] = kappaFromR(Math.min(0.999, concentration));
      w[c] = weight / n;
    }
    if (Math.abs(newLl - ll) < tol * Math.abs(newLl)) {
      ll = newLl;
      break;
    }
    ll = newLl;
  }
  return { mu, kappa, w, resp, logLikelihood: ll };
}
function fitSetsEM(dcos, k, options = {}) {
  const n = dcos.length;
  if (n === 0 || k < 1) return { components: [], responsibilities: [], assignments: [], logLikelihood: 0, bic: Infinity };
  const restarts = options.restarts || 5;
  const maxIter = options.maxIter || 100;
  const tol = options.tol || 1e-7;
  const rng = options.rng || Math.random;
  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    const res = emOnce(dcos, Math.min(k, n), seedCenters(dcos, Math.min(k, n), rng), maxIter, tol);
    if (!best || res.logLikelihood > best.logLikelihood) best = res;
  }
  const order = best.w.map((_, i) => i).sort((a, b) => best.w[b] - best.w[a]);
  const components2 = order.map((c) => ({
    axis: dcosToLine(best.mu[c]),
    axisDir: best.mu[c],
    weight: best.w[c],
    kappa: best.kappa[c],
    concentration: rOfKappa(best.kappa[c])
  }));
  const responsibilities = best.resp.map((r) => order.map((c) => r[c]));
  const assignments = responsibilities.map((r) => {
    let bi = 0;
    for (let c = 1; c < r.length; c++) if (r[c] > r[bi]) bi = c;
    return bi;
  });
  const bic = -2 * best.logLikelihood + (4 * k - 1) * Math.log(n);
  return { components: components2, responsibilities, assignments, logLikelihood: best.logLikelihood, bic };
}
function selectSets(dcos, options = {}) {
  const kMin = options.kMin || 1;
  const kMax = options.kMax || 5;
  const rng = options.rng || Math.random;
  let best = null, bestK = kMin;
  const bics = [];
  for (let k = kMin; k <= kMax; k++) {
    const fit = fitSetsEM(dcos, k, { ...options, rng });
    bics.push({ k, bic: fit.bic });
    if (!best || fit.bic < best.bic) {
      best = fit;
      bestK = k;
    }
  }
  return { best, bestK, bics };
}

// src/simulate.js
var simulate_exports = {};
__export(simulate_exports, {
  defaultKappa: () => defaultKappa,
  randomRotation: () => randomRotation,
  sampleFisher: () => sampleFisher,
  sampleRotation: () => sampleRotation,
  smoothedBootstrap: () => smoothedBootstrap
});

// src/rotation.js
var rotation_exports = {};
__export(rotation_exports, {
  apply: () => apply,
  applyToLine: () => applyToLine,
  applyToPlane: () => applyToPlane,
  bootstrapMeanRotation: () => bootstrapMeanRotation,
  compose: () => compose,
  eulerPole: () => eulerPole,
  frameFromPlaneLine: () => frameFromPlaneLine,
  fromPoleAngle: () => fromPoleAngle,
  fromRotationVector: () => fromRotationVector,
  inverse: () => inverse3,
  meanRotation: () => meanRotation,
  misorientation: () => misorientation,
  relative: () => relative,
  rotationVector: () => rotationVector,
  slerp: () => slerp2
});
var RAD2DEG2 = 180 / Math.PI;
var DEG7 = Math.PI / 180;
function frameFromPlaneLine(dd, dip, trend, plunge) {
  const z = normalize(planeToDcos(dd, dip));
  const l = lineToDcos(trend, plunge);
  let x = sub(l, scale(z, dot(l, z)));
  if (length(x) < 1e-10) {
    const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    x = cross(z, ref);
  }
  x = normalize(x);
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
function misorientation(R1, R2) {
  const dR = multiply(R2, transpose(R1));
  const { axis, angle: angle3 } = toAxisAngle(fromMatrix(dR));
  return { angle: angle3 * RAD2DEG2, axis };
}
function compose(...rotations) {
  return rotations.reduce((acc, R) => multiply(R, acc), identity());
}
function slerp2(R0, R1, t) {
  return toMatrix(slerp(fromMatrix(R0), fromMatrix(R1), t));
}
function eulerPole(R) {
  const { axis, angle: angle3 } = toAxisAngle(fromMatrix(R));
  return { axis: dcosToLine(axis), angle: angle3 * RAD2DEG2 };
}
function dominantEigen(M, n, iters = 300) {
  let v = new Array(n).fill(0);
  v[0] = 1;
  for (let it = 0; it < iters; it++) {
    const w = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[i] += M[i * n + j] * v[j];
    const len = Math.hypot(...w) || 1;
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const nv = w[i] / len;
      delta += Math.abs(nv - v[i]);
      v[i] = nv;
    }
    if (delta < 1e-13) break;
  }
  let lambda = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += M[i * n + j] * v[j];
    lambda += v[i] * s;
  }
  return { vector: v, value: lambda };
}
function meanRotation(rotations) {
  const n = rotations.length;
  if (n === 0) return { mean: identity(), quaternion: identity2(), concentration: 0, spread: 0 };
  const M = new Array(16).fill(0);
  for (const R of rotations) {
    const q = fromMatrix(R);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) M[a * 4 + b] += q[a] * q[b] / n;
  }
  const { vector, value } = dominantEigen(M, 4);
  const meanQ = normalize2(vector);
  const mean = toMatrix(meanQ);
  let spread = 0;
  for (const R of rotations) spread += misorientation(mean, R).angle;
  return { mean, quaternion: meanQ, concentration: value, spread: spread / n };
}
function apply(R, data) {
  return Array.isArray(data[0]) ? data.map((d) => transformVec3(R, d)) : transformVec3(R, data);
}
function applyToPlane(R, dd, dip) {
  return dcosToPlane(transformVec3(R, planeToDcos(dd, dip)));
}
function applyToLine(R, trend, plunge) {
  return dcosToLine(transformVec3(R, lineToDcos(trend, plunge)));
}
function inverse3(R) {
  return transpose(R);
}
function relative(R1, R2) {
  return multiply(R2, transpose(R1));
}
function fromPoleAngle(trend, plunge, angle3) {
  return rotationFromAxisAngle(lineToDcos(trend, plunge), angle3 * DEG7);
}
function rotationVector(R) {
  const { axis, angle: angle3 } = toAxisAngle(fromMatrix(R));
  return [axis[0] * angle3, axis[1] * angle3, axis[2] * angle3];
}
function fromRotationVector(v) {
  const angle3 = Math.hypot(v[0], v[1], v[2]);
  if (angle3 < 1e-12) return identity();
  return rotationFromAxisAngle([v[0] / angle3, v[1] / angle3, v[2] / angle3], angle3);
}
function bootstrapMeanRotation(rotations, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const iterations = options.iterations || 500;
  const rng = options.rng || Math.random;
  const n = rotations.length;
  const mean0 = meanRotation(rotations).mean;
  const angles = [];
  for (let it = 0; it < iterations; it++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) sample[i] = rotations[rng() * n | 0];
    angles.push(misorientation(mean0, meanRotation(sample).mean).angle);
  }
  angles.sort((a, b) => a - b);
  const idx = Math.min(angles.length - 1, Math.floor(confidence * angles.length));
  return { mean: mean0, halfAngle: angles[idx], confidence, iterations };
}

// src/simulate.js
var DEG8 = Math.PI / 180;
function tangentBasis2(mu) {
  const ref = Math.abs(mu[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(mu, ref));
  return [u, cross(mu, u)];
}
function defaultKappa(n) {
  const sigma = 90 / Math.sqrt(Math.max(1, n)) * DEG8;
  return 1 / (1 - Math.cos(sigma));
}
function sampleFisher(mean, kappa, n, rng = Math.random) {
  const mu = normalize(mean);
  const [u, v] = tangentBasis2(mu);
  const out = [];
  for (let i = 0; i < n; i++) {
    const U = rng();
    let w = kappa < 1e-6 ? 2 * U - 1 : 1 + Math.log(U + (1 - U) * Math.exp(-2 * kappa)) / kappa;
    w = Math.max(-1, Math.min(1, w));
    const phi = 2 * Math.PI * rng();
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    const cp = Math.cos(phi), sp = Math.sin(phi);
    out.push([
      s * (cp * u[0] + sp * v[0]) + w * mu[0],
      s * (cp * u[1] + sp * v[1]) + w * mu[1],
      s * (cp * u[2] + sp * v[2]) + w * mu[2]
    ]);
  }
  return out;
}
function smoothedBootstrap(dcos, m, options = {}) {
  const n = dcos.length;
  if (n === 0) return [];
  const count = m != null ? m : n;
  const rng = options.rng || Math.random;
  const kappa = options.kappa != null ? options.kappa : defaultKappa(n);
  const fold = options.lowerHemisphere !== false;
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = dcos[rng() * n | 0];
    const p = sampleFisher(d, kappa, 1, rng)[0];
    if (fold && p[2] > 0) {
      p[0] = -p[0];
      p[1] = -p[1];
      p[2] = -p[2];
    }
    out.push(p);
  }
  return out;
}
function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function randomRotation(rng = Math.random) {
  const u1 = rng(), u2 = rng(), u3 = rng();
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  const q = [
    b * Math.cos(2 * Math.PI * u3),
    a * Math.sin(2 * Math.PI * u2),
    a * Math.cos(2 * Math.PI * u2),
    b * Math.sin(2 * Math.PI * u3)
  ];
  return toMatrix(q);
}
function sampleRotation(meanR, sigmaDeg, n, rng = Math.random) {
  const s = sigmaDeg * DEG8;
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = [gaussian(rng) * s, gaussian(rng) * s, gaussian(rng) * s];
    out.push(multiply(fromRotationVector(v), meanR));
  }
  return out;
}

// src/euler.js
var euler_exports = {};
__export(euler_exports, {
  bungeToMatrix: () => bungeToMatrix,
  conventions: () => conventions,
  eulerToMatrix: () => eulerToMatrix,
  eulerToQuat: () => eulerToQuat,
  frameFromDipDirRake: () => frameFromDipDirRake,
  gslibToMatrix: () => gslibToMatrix,
  matrixToBunge: () => matrixToBunge,
  matrixToDipDirRake: () => matrixToDipDirRake,
  matrixToEuler: () => matrixToEuler,
  matrixToGslib: () => matrixToGslib,
  quatToEuler: () => quatToEuler
});
var DEG9 = Math.PI / 180;
var AXIS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
var IDX = { X: 0, Y: 1, Z: 2 };
var EUL_NEXT = [1, 2, 0, 1];
function eulerToMatrix(angles, order = "XYZ", options = {}) {
  const o = order.toUpperCase();
  const k = options.radians ? 1 : DEG9;
  const s = options.signs || [1, 1, 1];
  const Ra = rotationFromAxisAngle(AXIS[o[0]], angles[0] * s[0] * k);
  const Rb = rotationFromAxisAngle(AXIS[o[1]], angles[1] * s[1] * k);
  const Rc = rotationFromAxisAngle(AXIS[o[2]], angles[2] * s[2] * k);
  return options.intrinsic ? multiply(Ra, multiply(Rb, Rc)) : multiply(Rc, multiply(Rb, Ra));
}
function getOrd(order) {
  const i = IDX[order[0]], mid = IDX[order[1]], last = IDX[order[2]];
  const rep = order[0] === order[2];
  let parity;
  if (rep) {
    parity = EUL_NEXT[i] === mid ? 0 : 1;
  } else {
    const even = i === 0 && mid === 1 && last === 2 || i === 1 && mid === 2 && last === 0 || i === 2 && mid === 0 && last === 1;
    parity = even ? 0 : 1;
  }
  return { i, j: EUL_NEXT[i + parity], k: EUL_NEXT[i + 1 - parity], rep, parity };
}
function extractExtrinsic(R, order) {
  const { i, j, k, rep, parity } = getOrd(order);
  const M = (r, c2) => R[r * 3 + c2];
  let a, b, c;
  if (rep) {
    const sy = Math.hypot(M(i, j), M(i, k));
    if (sy > 1e-12) {
      a = Math.atan2(M(i, j), M(i, k));
      b = Math.atan2(sy, M(i, i));
      c = Math.atan2(M(j, i), -M(k, i));
    } else {
      a = Math.atan2(-M(j, k), M(j, j));
      b = Math.atan2(sy, M(i, i));
      c = 0;
    }
  } else {
    const cy = Math.hypot(M(i, i), M(j, i));
    if (cy > 1e-12) {
      a = Math.atan2(M(k, j), M(k, k));
      b = Math.atan2(-M(k, i), cy);
      c = Math.atan2(M(j, i), M(i, i));
    } else {
      a = Math.atan2(-M(j, k), M(j, j));
      b = Math.atan2(-M(k, i), cy);
      c = 0;
    }
  }
  if (parity) {
    a = -a;
    b = -b;
    c = -c;
  }
  return [a, b, c];
}
function matrixToEuler(R, order = "XYZ", options = {}) {
  const o = order.toUpperCase();
  let res;
  if (options.intrinsic) {
    const e = extractExtrinsic(R, o[2] + o[1] + o[0]);
    res = [e[2], e[1], e[0]];
  } else {
    res = extractExtrinsic(R, o);
  }
  const s = options.signs || [1, 1, 1];
  const div = options.radians ? 1 : DEG9;
  return res.map((v, idx) => v * s[idx] / div);
}
function eulerToQuat(angles, order = "XYZ", options = {}) {
  return fromMatrix(eulerToMatrix(angles, order, options));
}
function quatToEuler(q, order = "XYZ", options = {}) {
  return matrixToEuler(toMatrix(q), order, options);
}
var conventions = {
  bunge: { order: "ZXZ", intrinsic: true },
  // crystallography (φ1, Φ, φ2)
  xyz: { order: "XYZ", intrinsic: false },
  zyx: { order: "ZYX", intrinsic: false }
  // yaw-pitch-roll (aerospace, extrinsic)
};
function frameFromDipDirRake(dipDir, dip, rake) {
  const z = normalize(planeToDcos(dipDir, dip));
  const x = normalize(rakeToDcos(dipDir, dip, rake));
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
function matrixToDipDirRake(R) {
  const x = [R[0], R[3], R[6]];
  const z = [R[2], R[5], R[8]];
  const [dipDir, dip] = dcosToPlane(z);
  const ddR = dipDir * DEG9, dR = dip * DEG9;
  const s = [-Math.cos(ddR), Math.sin(ddR), 0];
  const d = [Math.cos(dR) * Math.sin(ddR), Math.cos(dR) * Math.cos(ddR), -Math.sin(dR)];
  const rake = Math.atan2(
    x[0] * d[0] + x[1] * d[1] + x[2] * d[2],
    x[0] * s[0] + x[1] * s[1] + x[2] * s[2]
  ) / DEG9;
  return [dipDir, dip, rake];
}
function bungeToMatrix(phi1, Phi, phi2, options = {}) {
  return eulerToMatrix([phi1, Phi, phi2], "ZXZ", { intrinsic: true, radians: options.radians });
}
function matrixToBunge(R, options = {}) {
  return matrixToEuler(R, "ZXZ", { intrinsic: true, radians: options.radians });
}
function gslibToMatrix(ang1, ang2, ang3) {
  const alpha = (ang1 >= 0 && ang1 < 270 ? 90 - ang1 : 450 - ang1) * DEG9;
  const beta = -ang2 * DEG9;
  const theta = ang3 * DEG9;
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  const sb = Math.sin(beta), cb = Math.cos(beta);
  const st = Math.sin(theta), ct = Math.cos(theta);
  return [
    cb * ca,
    cb * sa,
    -sb,
    -ct * sa + st * sb * ca,
    ct * ca + st * sb * sa,
    st * cb,
    st * sa + ct * sb * ca,
    -st * ca + ct * sb * sa,
    ct * cb
  ];
}
function matrixToGslib(R) {
  const M = (r, c) => R[r * 3 + c];
  const sb = -M(0, 2);
  const beta = Math.asin(Math.max(-1, Math.min(1, sb)));
  const cb = Math.cos(beta);
  let alpha, theta;
  if (Math.abs(cb) > 1e-9) {
    alpha = Math.atan2(M(0, 1), M(0, 0));
    theta = Math.atan2(M(1, 2), M(2, 2));
  } else {
    alpha = Math.atan2(-M(1, 0), M(1, 1));
    theta = 0;
  }
  let ang1 = 90 - alpha / DEG9;
  ang1 = (ang1 % 360 + 360) % 360;
  const ang2 = -beta / DEG9;
  const ang3 = theta / DEG9;
  return [ang1, ang2, ang3];
}

// src/fabricplot.js
var fabricplot_exports = {};
__export(fabricplot_exports, {
  vollmerPoint: () => vollmerPoint,
  vollmerSVG: () => vollmerSVG,
  woodcockPoint: () => woodcockPoint,
  woodcockSVG: () => woodcockSVG
});
function asDatasets(input) {
  if (input.length && Array.isArray(input[0]) && typeof input[0][0] === "number") {
    return [{ dcos: input }];
  }
  return input;
}
var r22 = (x) => Math.round(x * 100) / 100;
function woodcockPoint(dcos) {
  const { eigenvalues } = principalAxes(dcos);
  const [s1, s2, s3] = eigenvalues;
  const x = Math.log(s2 / s3);
  const y = Math.log(s1 / s2);
  return { x, y, K: x !== 0 ? y / x : Infinity, C: x + y, eigenvalues };
}
function woodcockSVG(datasets, options = {}) {
  const size = options.size || 320;
  const pad = options.padding ?? 44;
  const max = options.max || 7;
  const plot = size - 2 * pad;
  const sx = (v) => pad + v / max * plot;
  const sy = (v) => size - pad - v / max * plot;
  const svg = new SvgBuilder(size, size);
  svg.rect(pad, pad, plot, plot, { fill: options.background || "none", stroke: "#999", "stroke-width": 1 });
  svg.line(sx(0), sy(0), sx(max), sy(max), { stroke: "#bbb", "stroke-width": 1, "stroke-dasharray": "4,3" });
  svg.text(sx(max) - 4, sy(max) + 12, "K=1", { fill: "#888", "font-size": 10, "text-anchor": "end" });
  svg.text(pad + plot / 2, size - 10, "ln(S2/S3)  \u2014 girdle \u2192", { fill: "#555", "font-size": 11, "text-anchor": "middle" });
  svg.text(14, pad + plot / 2, "ln(S1/S2)  \u2014 cluster \u2192", { fill: "#555", "font-size": 11, "text-anchor": "middle", transform: `rotate(-90 14 ${pad + plot / 2})` });
  for (const ds of asDatasets(datasets)) {
    const p = woodcockPoint(ds.dcos);
    svg.circle(sx(Math.min(max, p.x)), sy(Math.min(max, p.y)), 4, { fill: ds.color || "#e8920c", stroke: "#333", "stroke-width": 0.7 });
    if (ds.label) svg.text(sx(Math.min(max, p.x)) + 7, sy(Math.min(max, p.y)) + 3, ds.label, { fill: "#333", "font-size": 10 });
  }
  return svg.toString();
}
function vollmerPoint(dcos) {
  const [s1, s2, s3] = principalAxes(dcos).eigenvalues;
  return { P: s1 - s2, G: 2 * (s2 - s3), R: 3 * s3 };
}
function vollmerSVG(datasets, options = {}) {
  const size = options.size || 320;
  const pad = options.padding ?? 36;
  const side = size - 2 * pad;
  const h = side * Math.sqrt(3) / 2;
  const yTop = pad + (side - h) / 2;
  const P = [size / 2, yTop];
  const G = [pad, yTop + h];
  const R = [size - pad, yTop + h];
  const svg = new SvgBuilder(size, size);
  svg.path(
    `M${r22(P[0])},${r22(P[1])}L${r22(G[0])},${r22(G[1])}L${r22(R[0])},${r22(R[1])}Z`,
    { fill: options.background || "none", stroke: "#999", "stroke-width": 1 }
  );
  svg.text(P[0], P[1] - 8, "P", { fill: "#555", "font-size": 12, "text-anchor": "middle" });
  svg.text(G[0] - 4, G[1] + 14, "G", { fill: "#555", "font-size": 12, "text-anchor": "middle" });
  svg.text(R[0] + 4, R[1] + 14, "R", { fill: "#555", "font-size": 12, "text-anchor": "middle" });
  for (const ds of asDatasets(datasets)) {
    const { P: p, G: g, R: r } = vollmerPoint(ds.dcos);
    const x = p * P[0] + g * G[0] + r * R[0];
    const y = p * P[1] + g * G[1] + r * R[1];
    svg.circle(x, y, 4, { fill: ds.color || "#1aa39a", stroke: "#333", "stroke-width": 0.7 });
    if (ds.label) svg.text(x + 7, y + 3, ds.label, { fill: "#333", "font-size": 10 });
  }
  return svg.toString();
}

// src/color.js
var color_exports = {};
__export(color_exports, {
  colorScale: () => colorScale,
  mapValue: () => mapValue,
  sampleScale: () => sampleScale,
  scales: () => scales
});
var scales = {
  viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
  magma: [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]],
  inferno: [[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]],
  plasma: [[13, 8, 135], [126, 3, 168], [204, 71, 120], [248, 149, 64], [240, 249, 33]],
  grayscale: [[0, 0, 0], [255, 255, 255]],
  // Matches the Stereonet default heatmap ramp (pale paper → maroon).
  thermal: [[255, 245, 200], [246, 177, 74], [224, 96, 62], [120, 20, 30]]
};
function interp(stops, t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const seg = (stops.length - 1) * x;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i], b = stops[i + 1];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2]))
  ];
}
function sampleScale(name, t) {
  const [r, g, b] = interp(scales[name] || scales.viridis, t);
  return `rgb(${r},${g},${b})`;
}
function colorScale(name, options = {}) {
  const stops = scales[name] || scales.viridis;
  const reverse = !!options.reverse;
  return (t) => {
    const [r, g, b] = interp(stops, reverse ? 1 - t : t);
    return `rgb(${r},${g},${b})`;
  };
}
function mapValue(name, value, min, max, options) {
  const t = max > min ? (value - min) / (max - min) : 0;
  return colorScale(name, options)(t);
}
export {
  Stereonet,
  SvgBuilder,
  analysis_exports as analysis,
  cardinalPoints,
  circular_exports as circular,
  cluster_exports as cluster,
  color_exports as color,
  compass_exports as compass,
  computeContours,
  conversions_exports as conversions,
  curves_exports as curves,
  densityGrid,
  equal_angle_exports as equalAngle,
  equal_area_exports as equalArea,
  euler_exports as euler,
  fabricplot_exports as fabricplot,
  fault_exports as fault,
  generateNet,
  io_exports as io,
  mat3_exports as mat3,
  deepMerge as mergeStyles,
  quat_exports as quat,
  rose_exports as rose,
  rotation_exports as rotation,
  simulate_exports as simulate,
  statistics_exports as statistics,
  defaults as styleDefaults,
  symmetricEigen3,
  vec3_exports as vec3
};

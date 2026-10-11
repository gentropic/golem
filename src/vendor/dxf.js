// ⚠ VENDORED — DO NOT EDIT. @gcu/dxf, the DXF reader and writer (R2000 ASCII), copied from ../auditable/ext/dxf/index.js at auditable 5fa5f72e (MIT).
// Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/dxf — A bulletproof, round-trippable DXF reader/writer (R2000 ASCII) for the GCU geometry stack. Never silently mutates coordinates — original WCS is canonical, any offset is an explicit @gcu/frame; never throws on malformed input, always logs what it tessellated or punted. Bulge-arc native (true arcs, not faceted), preserves blocks + XDATA + un-flattened colour. Defines the canonical 2D primitive @gcu/regula builds on.

// ── src/tokenize.js ──

// DXF group-code pair reader/writer — the bulletproof spine of the parser.
//
// A DXF file is a flat stream of (integer code, value) pairs, one per two lines: the
// group code on one line, its value on the next. The value's TYPE is dictated by the
// code's numeric range, not by how the value looks — a whole-numbered coordinate is
// still a double (the same code-driven-type rule as the AutoLISP entity model). The
// reader is a TOTAL function: malformed input never throws, it resyncs by skipping a
// bad code line. "Bulletproof" starts here.

// Value kind by group-code range — the fixed DXF code→type table, common ranges.
function valueKind(code) {
  if (code >= 10 && code <= 59) return 'num';      // primary doubles (coordinates / reals)
  if (code >= 60 && code <= 79) return 'int';      // int16 (incl. 62 = ACI colour, 70 = flags)
  if (code >= 90 && code <= 99) return 'int';      // int32
  if (code >= 140 && code <= 149) return 'num';    // doubles
  if (code >= 160 && code <= 179) return 'int';    // int64 / int16
  if (code >= 210 && code <= 239) return 'num';    // extrusion / OCS doubles
  if (code >= 270 && code <= 289) return 'int';
  if (code >= 290 && code <= 299) return 'bool';
  if (code >= 370 && code <= 389) return 'int';    // lineweight / flags
  if (code >= 400 && code <= 409) return 'int';
  if (code === 420 || code === 440) return 'int';  // 24-bit true colour / transparency
  if (code >= 1010 && code <= 1059) return 'num';  // XDATA doubles (points / reals)
  if (code >= 1060 && code <= 1071) return 'int';  // XDATA ints
  return 'str';                                    // 0-9, 100/102/105, 300-369, 430, 1000-1009, names, handles
}

function coerce(code, raw) {
  const kind = valueKind(code);
  if (kind === 'num') { const n = parseFloat(raw); return Number.isNaN(n) ? 0 : n; }
  if (kind === 'int') { const n = parseInt(raw, 10); return Number.isNaN(n) ? 0 : n; }
  if (kind === 'bool') return raw.trim() !== '0';
  return raw;                                       // string: keep verbatim (trailing \r already stripped)
}

// Parse DXF text into an array of { code, value } pairs. Handles LF and CRLF, blank
// lines, and a desynced stream (a non-integer where a code is expected → skip one line
// and retry, rather than throw).
function parsePairs(text) {
  const lines = String(text).split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length; ) {
    const head = lines[i].trim();
    if (head === '') { i++; continue; }
    const code = Number(head);
    if (!Number.isInteger(code)) { i++; continue; }               // desync guard
    const raw = i + 1 < lines.length ? lines[i + 1].replace(/\r$/, '') : '';
    pairs.push({ code, value: coerce(code, raw) });
    i += 2;
  }
  return pairs;
}

// Decimal formatting that avoids exponential notation across the coordinate ranges DXF
// readers expect (UTM magnitudes round-trip via String; only tiny/huge values fall back
// to a fixed expansion).
function fmtNum(n) {
  if (!Number.isFinite(n)) return '0.0';
  if (n === 0) return '0.0';
  const s = String(n);
  return (s.includes('e') || s.includes('E')) ? n.toFixed(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0') : s;
}

function fmtValue(code, value) {
  const kind = valueKind(code);
  if (kind === 'num') return fmtNum(value);
  if (kind === 'int') return String(Math.trunc(value));
  if (kind === 'bool') return value ? '1' : '0';
  return String(value);
}

// Serialize { code, value } pairs back to DXF text (CRLF, as is traditional — readers
// accept LF too, but CRLF is the safe default). Round-trips with parsePairs.
function serializePairs(pairs) {
  const out = [];
  for (const { code, value } of pairs) out.push(String(code), fmtValue(code, value));
  return out.join('\r\n') + '\r\n';
}

// Exposed for the reader/entity layer (code-driven type decisions, e.g. XDATA walking).

// ── src/arc.js ──

// Bulge ↔ arc conversions — the heart of the one-curve-type throughline.
//
// An arc span is stored as endpoint + bulge: `bulge = tan(θ/4)`, where θ is the signed
// swept angle (+ = CCW). center / radius / angles are DERIVED here, never stored — a
// gentle arc has a huge, far-flung center, which would drag the large-coordinate problem
// (@gcu/frame) back in, and stored endpoints are what let adjacent spans meet watertight
// (SPEC-curves §1). A straight span is just `bulge = 0`, so lines and arcs are the same
// primitive. All angles here are RADIANS; the DXF degree boundary converts in read/write.

const TAU = Math.PI * 2;

// Endpoint + bulge → derived { center, radius, startAngle, endAngle, sweep, ccw }.
// Returns null for a straight (bulge 0) or degenerate (coincident endpoints) span —
// callers treat those as line segments.
function arcFromBulge(p0, p1, bulge) {
  if (!bulge) return null;
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const c = Math.hypot(dx, dy);
  if (c === 0) return null;
  const theta = 4 * Math.atan(bulge);              // signed swept angle
  const half = c / 2;
  const r = half / Math.abs(Math.sin(theta / 2));
  const m = half / Math.tan(theta / 2);            // signed offset from chord-mid along left normal
  const nx = -dy / c, ny = dx / c;                 // unit left normal of p0→p1
  const cx = p0[0] + dx / 2 + nx * m;
  const cy = p0[1] + dy / 2 + ny * m;
  return {
    center: [cx, cy],
    radius: r,
    startAngle: Math.atan2(p0[1] - cy, p0[0] - cx),
    endAngle: Math.atan2(p1[1] - cy, p1[0] - cx),
    sweep: theta,
    ccw: bulge > 0,
  };
}

// Center-form arc (a DXF ARC: CCW from start to end, angles in RADIANS) → endpoint +
// bulge canonical form `{ start, end, bulge }`. The inverse of `arcFromBulge` for a CCW
// arc — this is how an ARC entity enters the bulge-native model losslessly.
function bulgeFromArc(center, radius, startAngle, endAngle) {
  let theta = ((endAngle - startAngle) % TAU + TAU) % TAU;   // normalize CCW sweep into (0, TAU]
  if (theta === 0) theta = TAU;
  const [cx, cy] = center;
  return {
    start: [cx + radius * Math.cos(startAngle), cy + radius * Math.sin(startAngle)],
    end: [cx + radius * Math.cos(endAngle), cy + radius * Math.sin(endAngle)],
    bulge: Math.tan(theta / 4),
  };
}

// The point at the middle of an arc span — on the arc, not on the chord (snapping,
// labels, midpoint object snap). Falls back to the chord midpoint for a straight span.
function arcMidpoint(p0, p1, bulge) {
  const a = arcFromBulge(p0, p1, bulge);
  if (!a) return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  const mid = a.startAngle + a.sweep / 2;
  return [a.center[0] + a.radius * Math.cos(mid), a.center[1] + a.radius * Math.sin(mid)];
}

// ── src/color.js ──

// DXF colour resolution — kept UN-FLATTENED (SPEC-dxf §4).
//
// An ACI palette index, a BYLAYER / BYBLOCK reference, and a 24-bit true colour are
// DISTINCT and must not collapse into one RGB triple. Flattening ACI → RGB discards the
// layer-driven colour scheme mining/geology drawings rely on (the colour IS data). So
// the model preserves the mode; aciToRgb is a render-time convenience, never canonical.

const BYLAYER = 256, BYBLOCK = 0;

// Resolve raw colour group codes into the typed colour model. `aci` is group 62 (may be
// null/absent), `trueColor` is group 420 (24-bit packed RGB, may be null). True colour
// wins when present (that's the DXF precedence). A negative ACI marks a layer turned off.
function resolveColor({ aci = null, trueColor = null } = {}) {
  if (trueColor != null) {
    return { mode: 'rgb', r: (trueColor >> 16) & 0xff, g: (trueColor >> 8) & 0xff, b: trueColor & 0xff };
  }
  if (aci == null || aci === BYLAYER) return { mode: 'bylayer' };
  if (aci === BYBLOCK) return { mode: 'byblock' };
  if (aci < 0) return { mode: 'aci', index: -aci, off: true };
  return { mode: 'aci', index: aci };
}

// Serialize the colour model back to the group-code pairs the writer emits, preserving
// the distinction (rgb → 420, byblock → 62/0, bylayer → 62/256, aci → 62/index).
function colorToPairs(color) {
  if (!color) return [];
  switch (color.mode) {
    case 'rgb': return [{ code: 420, value: ((color.r & 0xff) << 16) | ((color.g & 0xff) << 8) | (color.b & 0xff) }];
    case 'byblock': return [{ code: 62, value: BYBLOCK }];
    case 'bylayer': return [{ code: 62, value: BYLAYER }];
    case 'aci': return [{ code: 62, value: color.off ? -color.index : color.index }];
    default: return [];
  }
}

// The FULL ACI ramp. 1–9 are the named colours; 10–249 follow the published
// derivation (24 hues 15° apart × 5 value levels × {saturated, half-saturated},
// decade-packed: hue = ((i−10)÷10)·15°, value level = (i−10)%10 >> 1 from
// [255,204,153,127,76], odd offsets halve the chroma); 250–255 are the gray
// ramp. Spot-checked against the canonical table (ACI 30 = FF7F00, 11 =
// FF7F7F, 250 = 333333). Index 7 is "foreground" — white here, a renderer on
// a light theme may substitute. The model keeps the index; this is the RGB view.
const ACI_NAMED = {
  1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255],
  5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255],
  8: [128, 128, 128], 9: [192, 192, 192],
};
const ACI_GRAYS = { 250: 51, 251: 91, 252: 132, 253: 173, 254: 214, 255: 255 };
const ACI_V = [255, 204, 153, 127, 76];

function hueRgb(h, hi, lo) {
  const sect = Math.floor(h / 60) % 6, f = h / 60 - Math.floor(h / 60);
  const up = Math.floor(lo + (hi - lo) * f), dn = Math.floor(hi - (hi - lo) * f);
  switch (sect) {
    case 0: return [hi, up, lo];
    case 1: return [dn, hi, lo];
    case 2: return [lo, hi, up];
    case 3: return [lo, dn, hi];
    case 4: return [up, lo, hi];
    default: return [hi, lo, dn];
  }
}

function aciToRgb(index) {
  if (ACI_NAMED[index]) return ACI_NAMED[index];
  if (ACI_GRAYS[index] != null) { const v = ACI_GRAYS[index]; return [v, v, v]; }
  if (index >= 10 && index <= 249) {
    const k = index - 10;
    const hue = ((k / 10) | 0) * 15;
    const within = k % 10;
    const hi = ACI_V[within >> 1];
    const lo = (within & 1) ? Math.floor(hi / 2) : 0;
    return hueRgb(hue, hi, lo);
  }
  return null;
}

// Resolve a feature's colour model to RGB for rendering: rgb → itself, aci →
// the ramp, bylayer/byblock → the layer table's colour (byblock loses its
// insert context after explode — the layer is the honest stand-in).
function colorToRgb(color, layerName, layers) {
  if (!color) return null;
  if (color.mode === 'rgb') return [color.r, color.g, color.b];
  if (color.mode === 'aci' && !color.off) return aciToRgb(color.index);
  if (color.mode === 'bylayer' || color.mode === 'byblock') {
    const lc = layers && layers[layerName] && layers[layerName].color;
    if (lc && lc.mode === 'aci' && !lc.off && lc.index != null) return aciToRgb(lc.index);
    if (lc && lc.mode === 'rgb') return [lc.r, lc.g, lc.b];
  }
  return null;
}

// ── ../frame/src/frame.js ──

// @gcu/frame — the coordinate-frame contract for the whole GCU geometry stack.
//
// Geological work lives at projected-coordinate magnitudes (UTM easting ~5e5,
// northing ~7.7e6, RL ~1e3). Two failures follow and share one cause — doing math
// and rendering directly in those large numbers:
//   • the float32 wall — at northing 7.7e6 a 32-bit float resolves to ~1 m, so any
//     GPU/Float32Array path jitters and z-fights;
//   • catastrophic cancellation — derived quantities (lengths, cross products,
//     intersection params) lose relative precision, and a fixed ε like 1e-9 is
//     meaningless against operands of magnitude 1e6.
// The fix is to work in a small-magnitude LOCAL frame and keep the offset to WORLD
// as explicit, inspectable metadata. This module is that contract — a tiny value
// type plus pure functions, zero-dependency, that every coordinate-bearing package
// can speak.
//
// A Frame has two faculties with different reach:
//   1. numerical framing — the world↔local offset (`origin`), for the precision path
//      (dee/voxmesh/groma/regula/dxf/moncad compute in it; it gates every F32 downcast);
//   2. coordinate identity — the `crs` descriptor + `units`, universal provenance so
//      "what do these world numbers mean" is never silent.
//
// HARD BOUNDARY: frame NAMES a CRS, it never CHANGES one. Reprojection (datum shifts,
// projection changes) is a geodetic operation that lives elsewhere (spinifex/proj4
// today, a future @gcu/proj if it ever becomes a stack primitive). Crossing CRS here
// throws — see `delta`. A working offset is a translation for numerical convenience,
// not a reprojection.
//
// Points and origins are ARRAYS — [x, y] or [x, y, z] — matching the rest of the tree
// (dee.origin, grid.origin, flat Float64/Float32 vertex buffers), not the {x,y,z}
// objects the prose spec sketches. The frame is pure translation: rotation/scale are
// deliberately out of scope (a block model's own dip/rake orientation is intrinsic
// model geometry, a separate concern from the local frame — never conflated).

// A Frame value. `origin` is the WORLD coordinate of the local origin, so
// `local = world − origin`. `crs` is an optional projection descriptor (e.g. an EPSG
// code) — null means "unstated", which opts out of cross-frame CRS checking. `units`
// defaults to metres.
function makeFrame({ origin, crs = null, units = 'm' } = {}) {
  const o = origin ? Array.from(origin, Number) : [0, 0, 0];
  while (o.length < 3) o.push(0);
  return { origin: o.slice(0, 3), crs, units };
}

// The identity frame: origin at world zero. World == local. Useful as a default and
// as the "already in world coordinates" marker.
const WORLD = makeFrame({ origin: [0, 0, 0] });

// Normalise a CRS code for IDENTITY comparison: uppercase + strip a leading `EPSG:`, so
// `'EPSG:31983'`, `'epsg:31983'`, and `'31983'` all compare equal. It lives HERE, not in a
// geo/reprojection layer: frame is zero-dep and sits *under* any such layer, so importing a
// helper from geo would invert the dependency. A reprojection layer's richer code resolution
// is a superset built on this. Comparison only — the stored `crs` keeps its original spelling.
function canonCrs(code) {
  return code == null ? null : String(code).trim().toUpperCase().replace(/^EPSG:/, '');
}

// Two frames describe the same projection iff their (canonicalised) CRS agree (a null CRS on
// either side is a wildcard — you can't assert a mismatch you never declared) and their units
// match. This is the gate that keeps a frame shift from masquerading as a reprojection.
function sameProjection(a, b) {
  const ca = canonCrs(a.crs), cb = canonCrs(b.crs);
  if (ca != null && cb != null && ca !== cb) return false;
  return (a.units ?? 'm') === (b.units ?? 'm');
}

// Full structural equality: same origin, (canonicalised) CRS, and units.
function frameEq(a, b) {
  return canonCrs(a.crs) === canonCrs(b.crs) && (a.units ?? 'm') === (b.units ?? 'm') &&
    a.origin[0] === b.origin[0] && a.origin[1] === b.origin[1] && a.origin[2] === b.origin[2];
}

// ── Point transforms (single [x,y] or [x,y,z]) ──────────────────────────────────

// World → local: subtract the origin component-wise. Round-trips losslessly with
// `toWorld` at f64 (invariant 3) — exact when the origin is chosen near the data, the
// intended use.
function toLocal(worldPt, frame) {
  const o = frame.origin, r = new Array(worldPt.length);
  for (let i = 0; i < worldPt.length; i++) r[i] = worldPt[i] - (o[i] || 0);
  return r;
}

// Local → world: add the origin back. The inverse of `toLocal`.
function toWorld(localPt, frame) {
  const o = frame.origin, r = new Array(localPt.length);
  for (let i = 0; i < localPt.length; i++) r[i] = localPt[i] + (o[i] || 0);
  return r;
}

// ── Bulk buffer transforms (flat x,y,z,x,y,z,… arrays) ──────────────────────────
// These consolidate the hand-rolled F64-recentre loops currently duplicated in the
// dee importers (lfm/msh adapters): subtract the origin at full f64 precision and hand
// the small local magnitudes to the F32/GPU downcast. The one hard rule of §5 —
// anything bound for a Float32Array passes through the local frame FIRST — is this
// call. Returns a NEW Float64Array; input is never mutated.

function toLocalCoords(coords, frame, { stride = 3 } = {}) {
  const o = frame.origin, out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i += stride)
    for (let j = 0; j < stride; j++) out[i + j] = coords[i + j] - (o[j] || 0);
  return out;
}

function toWorldCoords(coords, frame, { stride = 3 } = {}) {
  const o = frame.origin, out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i += stride)
    for (let j = 0; j < stride; j++) out[i + j] = coords[i + j] + (o[j] || 0);
  return out;
}

// ── Choosing an origin ──────────────────────────────────────────────────────────

// Pick a sticky origin from world-coordinate bounds. Default strategy 'centroid'
// (bbox centre); 'floor' keeps locals strictly positive (handy across tiled exports).
// The result is rounded to `round` so the anchor reads as a "nice" number in logs and
// diffs rather than an arbitrary fractional point. bounds = { min:[…], max:[…] }.
// The origin is chosen ONCE per document/session and is sticky — recomputing it
// per-operation drifts the frame and invalidates cached geometry (§4).
function originFromBounds(bounds, { round = 1, strategy = 'centroid' } = {}) {
  const { min, max } = bounds, n = Math.min(min.length, max.length), o = [];
  for (let i = 0; i < n; i++) {
    const c = strategy === 'floor' ? min[i] : (min[i] + max[i]) / 2;
    o.push(round ? Math.round(c / round) * round : c);
  }
  while (o.length < 3) o.push(0);
  return o.slice(0, 3);
}

// Convenience: a Frame straight from bounds (origin via `originFromBounds`, carrying
// the given CRS/units).
function frameFromBounds(bounds, opts = {}) {
  return makeFrame({
    origin: originFromBounds(bounds, opts),
    crs: opts.crs ?? null,
    units: opts.units ?? 'm',
  });
}

// ── Frame-relative tolerance ────────────────────────────────────────────────────

// A tolerance scaled to the working extent, so coincidence / parallel / on-curve tests
// stay meaningful at any magnitude — a fixed absolute 1e-9 is meaningless against UTM
// operands, the same failure class as the original silent-shift bug. `extent` is the
// working span (e.g. the local bbox diagonal); `rel` is the relative floor. Feeds the
// @gcu/regula tolerance model. Note exact sign/orientation tests stay EXACT (groma
// predicates) — this ε is only for constructed quantities.
function extentTolerance(frame, extent, { rel = 1e-9 } = {}) {
  const e = Math.abs(extent) || 1;
  return { eps: rel * e, rel, extent: e, units: frame.units };
}

// ── Frame ↔ frame ───────────────────────────────────────────────────────────────

// The translation to add to a point expressed local-in `from` to re-express it
// local-in `to`:  localTo = localFrom + (fromOrigin − toOrigin). Throws if the frames
// describe different projections — moving between those is a reprojection, which frame
// does not perform (the hard boundary).
function delta(from, to) {
  if (!sameProjection(from, to)) {
    throw new Error(
      `frame.delta: frames differ in CRS/units (${from.crs}/${from.units} → ${to.crs}/${to.units}); ` +
      'that is a reprojection, which @gcu/frame does not perform',
    );
  }
  return [
    from.origin[0] - to.origin[0],
    from.origin[1] - to.origin[1],
    from.origin[2] - to.origin[2],
  ];
}

// Declare an artifact's frame WITHOUT moving its coordinates (invariant 2: a coordinate
// expressed in a local frame always carries an inspectable origin). Shallow, pure —
// returns a copy with `.frame` stamped. Re-EXPRESSING coordinates into a different
// frame is `rebaseCoords`, a separate and logged transform.
function withFrame(artifact, frame) {
  return { ...artifact, frame };
}

// Re-express a flat coordinate buffer from one frame into another. Returns BOTH the new
// Float64Array and a provenance record — rebasing is an explicit, accountable transform
// (invariants 4/5), so you cannot get the moved coordinates without the record of what
// moved them (the same "numbers plus an account of what I did to them" discipline as
// the DXF contract). Throws via `delta` on a CRS/units mismatch. Pure; input untouched.
function rebaseCoords(coords, from, to, { stride = 3 } = {}) {
  const d = delta(from, to);
  const out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i += stride)
    for (let j = 0; j < stride; j++) out[i + j] = coords[i + j] + (d[j] || 0);
  return { coords: out, record: rebaseRecord(from, to, d) };
}

// A provenance entry for a rebase — what the caller pushes onto its frame log.
function rebaseRecord(from, to, d) {
  return {
    op: 'rebase',
    from: { origin: [...from.origin], crs: from.crs, units: from.units },
    to: { origin: [...to.origin], crs: to.crs, units: to.units },
    delta: d,
  };
}

// ── src/read.js ──

// @gcu/dxf reader — the Document assembler.
//
// Walks a DXF group-code stream into a typed Document: sections → entities → features,
// with the coordinate-provenance contract front and centre. WORLD coordinates are
// CANONICAL and never mutated — the reader computes a RECOMMENDED working offset (an
// @gcu/frame) as metadata and attaches it; consumers derive local coordinates on demand
// (`toLocalCoords(geom, doc.frame)`). The reader is bulletproof: a malformed entity is
// punted to a null-geometry feature (its property bag preserved) plus a `warnings[]`
// entry — never a throw.
//
// Geometry is normalised to 3D world coordinates in flat Float64Array buffers, and the
// curve primitive is the bulge-polyline: LINE, LWPOLYLINE, POLYLINE, and ARC all become
// `{ kind:'polyline', vertices, bulges, closed }` (ARC = a single bulge span) — the
// one-curve-type throughline. CIRCLE and POINT stay distinct (a full circle has no
// endpoints), 3DFACE is a face, INSERT is a block reference resolved by explode().


const DEG$read = Math.PI / 180;
const IMPORTER = '@gcu/dxf@0.1.0';

// $INSUNITS → a units string (the common subset; default metres for a geo stack).
const INSUNITS = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm', 9: 'mm', 10: 'm', 14: 'dm' };

// ── small helpers ──────────────────────────────────────────────────────────────

// First value for a group code in an entity's pairs (simple entities are last-wins-safe
// because their codes don't repeat; vertex streams are iterated in order instead).
function val(pairs, code, dflt) {
  for (const p of pairs) if (p.code === code) return p.value;
  return dflt;
}

const mkFeature = (type, geometry, properties) => ({ type, geometry, properties });

// The shared attribute bag — hoard everything the format carries that means something.
function readCommon(pairs) {
  const props = {};
  let aci = null, trueColor = null, xApp = null, xdata = null, ext = null;
  for (const { code, value } of pairs) {
    switch (code) {
      case 5: props.handle = value; break;
      case 8: props.layer = value; break;
      case 6: props.linetype = value; break;
      case 62: aci = value; break;
      case 420: trueColor = value; break;
      case 370: props.lineweight = value; break;
      case 38: props.elevation = value; break;
      case 39: props.thickness = value; break;
      case 210: (ext ??= [0, 0, 1])[0] = value; break;
      case 220: (ext ??= [0, 0, 1])[1] = value; break;
      case 230: (ext ??= [0, 0, 1])[2] = value; break;
      default:
        if (code === 1001) { xApp = value; (xdata ??= {})[xApp] = []; }
        else if (code >= 1000 && code <= 1071 && xApp) xdata[xApp].push({ code, value });
    }
  }
  props.color = resolveColor({ aci, trueColor });
  if (ext) props.extrusion = ext;
  if (xdata) props.xdata = xdata;
  return props;
}

// Pack an array of [x,y,z] points into a flat Float64Array.
function packPts(pts) {
  const out = new Float64Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) { out[i * 3] = pts[i][0]; out[i * 3 + 1] = pts[i][1]; out[i * 3 + 2] = pts[i][2] || 0; }
  return out;
}

// ── per-entity parsers ───────────────────────────────────────────────────────────

function parseLine(rec) {
  const p = rec.pairs;
  const v = packPts([[val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], [val(p, 11, 0), val(p, 21, 0), val(p, 31, 0)]]);
  return mkFeature('line', { kind: 'polyline', vertices: v, bulges: null, closed: false }, readCommon(p));
}

function parseLwpolyline(rec) {
  const p = rec.pairs;
  const closed = (val(p, 70, 0) & 1) === 1, elev = val(p, 38, 0);
  const xs = [], ys = [], bs = [];
  let x = null, y = 0, b = 0, open = false;
  const flush = () => { if (open) { xs.push(x); ys.push(y); bs.push(b); } x = null; y = 0; b = 0; open = false; };
  for (const { code, value } of p) {
    if (code === 10) { flush(); x = value; open = true; }
    else if (code === 20 && open) y = value;
    else if (code === 42 && open) b = value;
  }
  flush();
  const vertices = new Float64Array(xs.length * 3);
  for (let i = 0; i < xs.length; i++) { vertices[i * 3] = xs[i]; vertices[i * 3 + 1] = ys[i]; vertices[i * 3 + 2] = elev; }
  const bulges = bs.some((v) => v !== 0) ? Float64Array.from(bs) : null;
  return mkFeature('polyline', { kind: 'polyline', vertices, bulges, closed }, readCommon(p));
}

// Old-style POLYLINE: a header + a VERTEX stream + SEQEND. Returns the feature and the
// index just past SEQEND. The 3D mesh tier (v0.2): polyface meshes (flag 64) and
// polygon meshes (flag 16) become 'mesh' features — the shape mine software exports
// solids and surfaces in.
function parsePolyline(rec, recs, i, warnings) {
  const flags = val(rec.pairs, 70, 0);
  let j = i + 1;
  const vrecs = [];
  while (j < recs.length && recs[j].type === 'VERTEX') { vrecs.push(recs[j].pairs); j++; }
  if (j < recs.length && recs[j].type === 'SEQEND') j++;

  if (flags & 64) return { feature: parsePolyfaceMesh(rec, vrecs, warnings), next: j };
  if (flags & 16) return { feature: parsePolygonMesh(rec, vrecs, warnings), next: j };

  const pts = vrecs.map((vp) => [val(vp, 10, 0), val(vp, 20, 0), val(vp, 30, 0)]);
  const bs = vrecs.map((vp) => val(vp, 42, 0));
  const vertices = packPts(pts);
  const bulges = bs.some((v) => v !== 0) ? Float64Array.from(bs) : null;
  return { feature: mkFeature('polyline', { kind: 'polyline', vertices, bulges, closed: (flags & 1) === 1 }, readCommon(rec.pairs)), next: j };
}

// Polyface mesh (POLYLINE flag 64): the VERTEX stream carries two record kinds —
// geometry vertices (vertex flag 64|128) and FACE records (flag 128 alone) whose
// codes 71–74 are 1-based indices into the geometry vertices (negative = the edge
// is invisible; only |index| matters here). A 4-index face splits into two triangles.
function parsePolyfaceMesh(rec, vrecs, warnings) {
  const pts = [], faces = [];
  for (const vp of vrecs) {
    const vf = val(vp, 70, 0);
    if (vf & 128 && !(vf & 64)) {
      const idx = [val(vp, 71, 0), val(vp, 72, 0), val(vp, 73, 0), val(vp, 74, 0)].map((v) => Math.abs(v)).filter((v) => v > 0);
      if (idx.length >= 3) faces.push(idx);
    } else {
      pts.push(val(vp, 10, 0), val(vp, 20, 0), val(vp, 30, 0));
    }
  }
  const nV = pts.length / 3;
  const tris = [];
  let dropped = 0;
  for (const f of faces) {
    if (f.some((ix) => ix > nV)) { dropped++; continue; }  // index past the vertex table
    tris.push(f[0] - 1, f[1] - 1, f[2] - 1);
    if (f.length === 4) tris.push(f[0] - 1, f[2] - 1, f[3] - 1);
  }
  if (dropped) warnings.push({ handle: val(rec.pairs, 5, null), entity: 'POLYLINE(polyface)', reason: `${dropped} face(s) referenced vertices past the table — dropped` });
  if (!tris.length) {
    warnings.push({ handle: val(rec.pairs, 5, null), entity: 'POLYLINE(polyface)', reason: 'no resolvable faces' });
    return nullFeature(rec);
  }
  return mkFeature('mesh', { kind: 'mesh', vertices: Float64Array.from(pts), triangles: Uint32Array.from(tris) }, readCommon(rec.pairs));
}

// Polygon mesh (POLYLINE flag 16): an M×N vertex grid (codes 71/72 on the header),
// vertices in row-major M-then-N order; faces are the grid quads, wrapping when the
// mesh is closed in M (flag 1) and/or N (flag 32).
function parsePolygonMesh(rec, vrecs, warnings) {
  const M = val(rec.pairs, 71, 0), N = val(rec.pairs, 72, 0);
  const flags = val(rec.pairs, 70, 0);
  const gverts = vrecs.filter((vp) => !(val(vp, 70, 0) & 128) || (val(vp, 70, 0) & 64));
  if (M < 2 || N < 2 || gverts.length < M * N) {
    warnings.push({ handle: val(rec.pairs, 5, null), entity: 'POLYLINE(polygon mesh)', reason: `grid ${M}×${N} but ${gverts.length} vertices — skipped` });
    return nullFeature(rec);
  }
  const pts = new Float64Array(M * N * 3);
  for (let k = 0; k < M * N; k++) {
    const vp = gverts[k];
    pts[k * 3] = val(vp, 10, 0); pts[k * 3 + 1] = val(vp, 20, 0); pts[k * 3 + 2] = val(vp, 30, 0);
  }
  const closedM = (flags & 1) === 1, closedN = (flags & 32) === 32;
  const tris = [];
  const at = (m, n) => m * N + n;
  for (let m = 0; m < (closedM ? M : M - 1); m++) {
    for (let n = 0; n < (closedN ? N : N - 1); n++) {
      const a = at(m, n), b = at((m + 1) % M, n), c = at((m + 1) % M, (n + 1) % N), d = at(m, (n + 1) % N);
      tris.push(a, b, c, a, c, d);
    }
  }
  return mkFeature('mesh', { kind: 'mesh', vertices: pts, triangles: Uint32Array.from(tris) }, readCommon(rec.pairs));
}

function parseCircle(rec) {
  const p = rec.pairs;
  return mkFeature('circle', { kind: 'circle', center: [val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], radius: val(p, 40, 0) }, readCommon(p));
}

// ARC enters the bulge-native model: center-form (CCW, degrees) → endpoint + bulge.
function parseArc(rec) {
  const p = rec.pairs;
  const center = [val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], radius = val(p, 40, 0), z = center[2];
  const { start, end, bulge } = bulgeFromArc(center, radius, val(p, 50, 0) * DEG$read, val(p, 51, 0) * DEG$read);
  const vertices = packPts([[start[0], start[1], z], [end[0], end[1], z]]);
  return mkFeature('arc', { kind: 'polyline', vertices, bulges: Float64Array.from([bulge]), closed: false }, readCommon(p));
}

function parsePoint(rec) {
  const p = rec.pairs;
  return mkFeature('point', { kind: 'point', position: [val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)] }, readCommon(p));
}

// TEXT: insertion point (10/20/30), height (40), the string (1), rotation degrees (50).
// MTEXT and the alignment codes (11/21/72/73) are v0.2 — single-line left-baseline for now.
function parseText(rec) {
  const p = rec.pairs;
  let str = '';
  for (const { code, value } of p) if (code === 1) str = value;
  return mkFeature('text', { kind: 'text', position: [val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], height: val(p, 40, 1), rotation: val(p, 50, 0), value: str }, readCommon(p));
}

// ATTDEF: an attribute-definition template inside a block — TEXT plus tag (2), prompt (3)
// and a default value (1). The per-instance value is an ATTRIB on the INSERT (parseInsert).
function parseAttdef(rec) {
  const p = rec.pairs;
  let value = '', tag = '', prompt = '';
  for (const { code, value: v } of p) { if (code === 1) value = v; else if (code === 2) tag = v; else if (code === 3) prompt = v; }
  return mkFeature('attdef', { kind: 'attdef', position: [val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], height: val(p, 40, 1), rotation: val(p, 50, 0), tag, prompt, value }, readCommon(p));
}

function parse3dface(rec) {
  const p = rec.pairs;
  const c = [[val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], [val(p, 11, 0), val(p, 21, 0), val(p, 31, 0)],
    [val(p, 12, 0), val(p, 22, 0), val(p, 32, 0)], [val(p, 13, 0), val(p, 23, 0), val(p, 33, 0)]];
  const tri = c[3][0] === c[2][0] && c[3][1] === c[2][1] && c[3][2] === c[2][2];   // 4th==3rd → triangle
  return mkFeature('face', { kind: 'face', vertices: packPts(tri ? c.slice(0, 3) : c) }, readCommon(p));
}

// INSERT: a placed block + (when flag 66=1) an ATTRIB stream folded into the bag. The
// block geometry is referenced, not exploded — explode() resolves it on demand.
function parseInsert(rec, recs, i) {
  const p = rec.pairs;
  const props = readCommon(p);
  const geometry = {
    kind: 'insert', block: val(p, 2, ''),
    transform: { position: [val(p, 10, 0), val(p, 20, 0), val(p, 30, 0)], scale: [val(p, 41, 1), val(p, 42, 1), val(p, 43, 1)], rotation: val(p, 50, 0) },
  };
  let j = i + 1;
  if (val(p, 66, 0) === 1) {
    const attribs = [];
    while (j < recs.length && recs[j].type === 'ATTRIB') {
      const ap = recs[j].pairs;
      attribs.push({ tag: val(ap, 2, ''), value: val(ap, 1, ''), position: [val(ap, 10, 0), val(ap, 20, 0), val(ap, 30, 0)] });
      j++;
    }
    if (j < recs.length && recs[j].type === 'SEQEND') j++;
    if (attribs.length) props.attribs = attribs;
  }
  return { feature: mkFeature('insert', geometry, props), next: j };
}

// An unsupported/unrecognised entity: geometry dropped, property bag (handle/layer/
// XDATA) preserved so it round-trips as metadata and the gap is a logged decision.
function nullFeature(rec) {
  const props = readCommon(rec.pairs);
  props.dropped = rec.type;
  return mkFeature(null, null, props);
}

// ── structure ────────────────────────────────────────────────────────────────────

// Split a flat pair list into entity records at each code-0 boundary.
function splitRecords(pairs) {
  const recs = [];
  let cur = null;
  for (const p of pairs) {
    if (p.code === 0) recs.push((cur = { type: p.value, pairs: [] }));
    else if (cur) cur.pairs.push(p);
  }
  return recs;
}

// Partition into named sections → arrays of entity records (HEADER body is empty here;
// its variables are read directly via headerVar over the raw pairs).
function partitionSections(pairs) {
  const recs = splitRecords(pairs), sections = {};
  for (let i = 0; i < recs.length; i++) {
    if (recs[i].type !== 'SECTION') continue;
    const name = val(recs[i].pairs, 2, '');
    const body = [];
    for (i++; i < recs.length && recs[i].type !== 'ENDSEC'; i++) body.push(recs[i]);
    sections[name] = body;
  }
  return sections;
}

// A header variable: code 9 names it, the next pair carries the value.
function headerVar(pairs, name) {
  for (let i = 0; i < pairs.length - 1; i++) if (pairs[i].code === 9 && pairs[i].value === name) return pairs[i + 1].value;
  return undefined;
}

function parseLayers(records) {
  const layers = {};
  for (const r of records) {
    if (r.type !== 'LAYER') continue;
    const name = val(r.pairs, 2, '');
    layers[name] = { name, color: resolveColor({ aci: val(r.pairs, 62, null) }), linetype: val(r.pairs, 6, undefined) };
  }
  return layers;
}

function parseBlocks(records, warnings) {
  const blocks = {};
  for (let i = 0; i < records.length; i++) {
    if (records[i].type !== 'BLOCK') continue;
    const name = val(records[i].pairs, 2, '');
    const base = [val(records[i].pairs, 10, 0), val(records[i].pairs, 20, 0), val(records[i].pairs, 30, 0)];
    const body = [];
    for (i++; i < records.length && records[i].type !== 'ENDBLK'; i++) body.push(records[i]);
    blocks[name] = { name, base, features: assembleEntities(body, warnings) };
  }
  return blocks;
}

// Walk entity records → features, resolving the compound entities (POLYLINE vertex
// streams, INSERT attribute streams) and isolating per-entity parse errors.
function assembleEntities(records, warnings) {
  const features = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    try {
      switch (rec.type) {
        case 'LINE': features.push(parseLine(rec)); break;
        case 'LWPOLYLINE': features.push(parseLwpolyline(rec)); break;
        case 'CIRCLE': features.push(parseCircle(rec)); break;
        case 'ARC': features.push(parseArc(rec)); break;
        case 'POINT': features.push(parsePoint(rec)); break;
        case 'TEXT': features.push(parseText(rec)); break;
        case 'ATTDEF': features.push(parseAttdef(rec)); break;
        case '3DFACE': features.push(parse3dface(rec)); break;
        case 'POLYLINE': { const r = parsePolyline(rec, records, i, warnings); features.push(r.feature); i = r.next - 1; break; }
        case 'INSERT': { const r = parseInsert(rec, records, i); features.push(r.feature); i = r.next - 1; break; }
        case 'VERTEX': case 'SEQEND': case 'ATTRIB': break;        // consumed by their parent; stray → skip
        default:
          warnings.push({ handle: val(rec.pairs, 5, null), entity: rec.type, reason: 'unsupported entity (metadata kept)' });
          features.push(nullFeature(rec));
      }
    } catch (e) {
      warnings.push({ handle: val(rec.pairs, 5, null), entity: rec.type, reason: `parse error: ${e.message}` });
      features.push(nullFeature(rec));
    }
  }
  return features;
}

// Bounding box over all world geometry — drives the recommended working frame.
function computeBounds(features) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const ext = (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
    const zz = Number.isFinite(z) ? z : 0;
    if (zz < min[2]) min[2] = zz; if (zz > max[2]) max[2] = zz;
  };
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.kind === 'polyline' || g.kind === 'face') for (let i = 0; i < g.vertices.length; i += 3) ext(g.vertices[i], g.vertices[i + 1], g.vertices[i + 2]);
    else if (g.kind === 'circle') { ext(g.center[0] - g.radius, g.center[1] - g.radius, g.center[2]); ext(g.center[0] + g.radius, g.center[1] + g.radius, g.center[2]); }
    else if (g.kind === 'point' || g.kind === 'text' || g.kind === 'attdef') ext(...g.position);
    else if (g.kind === 'insert') ext(...g.transform.position);
  }
  return min[0] === Infinity ? null : { min, max };
}

// Read DXF text into a Document. Options: { offsetStrategy:'floor'|'centroid', round,
// crs, units }. Total function — never throws on malformed input.
function read(text, opts = {}) {
  const warnings = [];
  const pairs = parsePairs(text);
  const sections = partitionSections(pairs);
  const insunits = headerVar(pairs, '$INSUNITS');
  const units = INSUNITS[insunits] ?? opts.units ?? 'm';
  const layers = parseLayers(sections.TABLES || []);
  const blocks = parseBlocks(sections.BLOCKS || [], warnings);
  const features = assembleEntities(sections.ENTITIES || [], warnings);
  const bounds = computeBounds(features);
  const strategy = opts.offsetStrategy || 'floor';
  const frame = bounds
    ? frameFromBounds(bounds, { strategy, round: opts.round ?? 1, crs: opts.crs ?? null, units })
    : makeFrame({ crs: opts.crs ?? null, units });
  const coordinate_provenance = { canonical: 'WCS', bbox_original: bounds, frame, offset_strategy: strategy, importer: IMPORTER };
  return {
    header: { acadver: headerVar(pairs, '$ACADVER'), insunits, units, codepage: headerVar(pairs, '$DWGCODEPAGE'), coordinate_provenance },
    frame, layers, blocks, features, warnings,
  };
}

// ── src/write.js ──

// @gcu/dxf writer — Document → R2000 (AC1015) ASCII.
//
// The symmetric half of the provenance contract: it restores WORLD coordinates. Features
// from read() are already world (canonical), so the default writes them verbatim; if a
// consumer worked in a local frame, pass { fromLocal:true } and the doc's Frame and the
// writer re-adds the offset via toWorld — the structural fix for the silent-shift bug.
//
// Emits the scaffolding strict readers want (HEADER with $ACADVER/$INSUNITS/$HANDSEED,
// a LTYPE+LAYER TABLES section, unique handles, EOF), round-trips XDATA and blocks, and
// maps the bulge-native model back out (arc → ARC via arcFromBulge, planar polyline →
// LWPOLYLINE, non-planar → 3D POLYLINE). Punted (null-geometry) features are not
// re-emitted — they had no geometry to write. (Subclass 100 markers are a v0.2 hardening.)


const DEG$write = Math.PI / 180;
const UNIT_CODE = { in: 1, ft: 2, mm: 4, cm: 5, m: 6, um: 8, dm: 14 };
const normDeg = (rad) => ((rad / DEG$write) % 360 + 360) % 360;
const identity = (p) => p;

function write(doc, opts = {}) {
  const toW = (opts.fromLocal && doc.frame) ? (p) => toWorld(p, doc.frame) : identity;
  const out = [];
  const push = (code, value) => out.push({ code, value });

  // Handle generation: preserve source handles, assign fresh ones (above the max) where absent.
  let max = 0;
  const scan = (props) => { const h = props?.handle; if (h) { const n = parseInt(h, 16); if (Number.isFinite(n) && n > max) max = n; } };
  for (const f of doc.features) scan(f.properties);
  for (const b of Object.values(doc.blocks || {})) for (const f of b.features) scan(f.properties);
  let hc = max;
  const gen = (existing) => existing || (++hc).toString(16).toUpperCase();

  emitHeader();
  emitTables();
  emitBlocks();
  push(0, 'SECTION'); push(2, 'ENTITIES');
  for (const f of doc.features) emitEntity(f, toW);
  push(0, 'ENDSEC');
  push(0, 'EOF');
  return serializePairs(out);

  // ── emit helpers (hoisted; close over out/push/gen/max) ──────────────────────────

  function emitCommon(props) {
    push(5, gen(props.handle));
    push(8, props.layer ?? '0');
    if (props.linetype) push(6, props.linetype);
    for (const cp of colorToPairs(props.color || { mode: 'bylayer' })) out.push(cp);
    if (props.lineweight != null) push(370, props.lineweight);
  }

  function emitXdata(props) {
    if (!props.xdata) return;
    for (const [app, items] of Object.entries(props.xdata)) { push(1001, app); for (const it of items) out.push({ code: it.code, value: it.value }); }
  }

  function emitHeader() {
    push(0, 'SECTION'); push(2, 'HEADER');
    push(9, '$ACADVER'); push(1, doc.header?.acadver || 'AC1015');
    push(9, '$INSUNITS'); push(70, UNIT_CODE[doc.header?.units || doc.frame?.units || 'm'] ?? 0);
    push(9, '$HANDSEED'); push(5, (max + 0x10000).toString(16).toUpperCase());
    push(0, 'ENDSEC');
  }

  function emitTables() {
    const names = new Set(['0']);
    for (const f of doc.features) if (f.properties?.layer) names.add(f.properties.layer);
    for (const n of Object.keys(doc.layers || {})) names.add(n);
    push(0, 'SECTION'); push(2, 'TABLES');
    push(0, 'TABLE'); push(2, 'LTYPE'); push(70, 1);
    push(0, 'LTYPE'); push(5, gen()); push(2, 'CONTINUOUS'); push(70, 0); push(3, 'Solid line'); push(72, 65); push(73, 0); push(40, 0);
    push(0, 'ENDTAB');
    push(0, 'TABLE'); push(2, 'LAYER'); push(70, names.size);
    for (const n of names) {
      const ld = doc.layers?.[n];
      push(0, 'LAYER'); push(5, gen()); push(2, n); push(70, 0);
      push(62, (ld?.color && ld.color.mode === 'aci') ? ld.color.index : 7);
      push(6, ld?.linetype || 'CONTINUOUS');
    }
    push(0, 'ENDTAB');
    push(0, 'ENDSEC');
  }

  function emitBlocks() {
    push(0, 'SECTION'); push(2, 'BLOCKS');
    for (const b of Object.values(doc.blocks || {})) {
      push(0, 'BLOCK'); push(5, gen()); push(8, '0'); push(2, b.name); push(70, 0);
      push(10, b.base?.[0] || 0); push(20, b.base?.[1] || 0); push(30, b.base?.[2] || 0); push(3, b.name);
      for (const f of b.features) emitEntity(f, identity);     // block body stays in block-local coords
      push(0, 'ENDBLK'); push(5, gen());
    }
    push(0, 'ENDSEC');
  }

  function emitEntity(f, tw) {
    if (!f.geometry) return;                                  // punted nulls aren't re-emitted
    const g = f.geometry, props = f.properties || {};
    switch (f.type) {
      case 'line': {
        const v = g.vertices, a = tw([v[0], v[1], v[2]]), b = tw([v[3], v[4], v[5]]);
        push(0, 'LINE'); emitCommon(props);
        push(10, a[0]); push(20, a[1]); push(30, a[2]); push(11, b[0]); push(21, b[1]); push(31, b[2]);
        emitXdata(props); break;
      }
      case 'polyline': emitPolyline(f, tw); break;
      case 'arc': {
        const v = g.vertices, p0 = tw([v[0], v[1], v[2]]), p1 = tw([v[3], v[4], v[5]]), bl = g.bulges ? g.bulges[0] : 0;
        const a = arcFromBulge([p0[0], p0[1]], [p1[0], p1[1]], bl);
        let sa = a.startAngle, ea = a.endAngle; if (bl < 0) [sa, ea] = [ea, sa];   // DXF ARC is CCW
        push(0, 'ARC'); emitCommon(props);
        push(10, a.center[0]); push(20, a.center[1]); push(30, p0[2]); push(40, a.radius);
        push(50, normDeg(sa)); push(51, normDeg(ea)); emitXdata(props); break;
      }
      case 'circle': {
        const c = tw(g.center);
        push(0, 'CIRCLE'); emitCommon(props); push(10, c[0]); push(20, c[1]); push(30, c[2]); push(40, g.radius); emitXdata(props); break;
      }
      case 'point': {
        const p = tw(g.position);
        push(0, 'POINT'); emitCommon(props); push(10, p[0]); push(20, p[1]); push(30, p[2]); emitXdata(props); break;
      }
      case 'text': {
        const p = tw(g.position);
        push(0, 'TEXT'); emitCommon(props);
        push(10, p[0]); push(20, p[1]); push(30, p[2]); push(40, g.height || 1); push(1, g.value || '');
        if (g.rotation) push(50, g.rotation);
        emitXdata(props); break;
      }
      case 'attdef': {
        const p = tw(g.position);
        push(0, 'ATTDEF'); emitCommon(props);
        push(10, p[0]); push(20, p[1]); push(30, p[2]); push(40, g.height || 1);
        push(1, g.value || ''); push(2, g.tag || ''); push(3, g.prompt || g.tag || '');
        if (g.rotation) push(50, g.rotation); push(70, 0);
        emitXdata(props); break;
      }
      case 'face': {
        const v = g.vertices, n = v.length / 3;
        push(0, '3DFACE'); emitCommon(props);
        for (let k = 0; k < 4; k++) { const i = Math.min(k, n - 1) * 3; const w = tw([v[i], v[i + 1], v[i + 2]]); push(10 + k, w[0]); push(20 + k, w[1]); push(30 + k, w[2]); }
        emitXdata(props); break;
      }
      case 'insert': emitInsert(f, tw); break;
    }
  }

  function emitPolyline(f, tw) {
    const g = f.geometry, props = f.properties || {}, v = g.vertices, n = v.length / 3;
    const z0 = n ? v[2] : 0;
    let planar = true; for (let i = 0; i < n; i++) if (v[i * 3 + 2] !== z0) { planar = false; break; }
    if (planar) {
      push(0, 'LWPOLYLINE'); emitCommon(props); push(90, n); push(70, g.closed ? 1 : 0); if (z0) push(38, z0);
      for (let i = 0; i < n; i++) { const w = tw([v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]); push(10, w[0]); push(20, w[1]); if (g.bulges && g.bulges[i]) push(42, g.bulges[i]); }
      emitXdata(props);
    } else {
      push(0, 'POLYLINE'); emitCommon(props); push(66, 1); push(70, 8 | (g.closed ? 1 : 0));
      push(10, 0); push(20, 0); push(30, 0); emitXdata(props);
      for (let i = 0; i < n; i++) { const w = tw([v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]); push(0, 'VERTEX'); push(5, gen()); push(8, props.layer ?? '0'); push(10, w[0]); push(20, w[1]); push(30, w[2]); push(70, 32); if (g.bulges && g.bulges[i]) push(42, g.bulges[i]); }
      push(0, 'SEQEND'); push(5, gen());
    }
  }

  function emitInsert(f, tw) {
    const g = f.geometry, props = f.properties || {}, t = g.transform, pos = tw(t.position);
    const hasAttr = props.attribs?.length;
    push(0, 'INSERT'); emitCommon(props); if (hasAttr) push(66, 1);
    push(2, g.block); push(10, pos[0]); push(20, pos[1]); push(30, pos[2]);
    push(41, t.scale[0]); push(42, t.scale[1]); push(43, t.scale[2]); push(50, t.rotation);
    emitXdata(props);
    if (hasAttr) {
      for (const at of props.attribs) {
        const ap = tw(at.position || pos);
        push(0, 'ATTRIB'); push(5, gen()); push(8, props.layer ?? '0');
        push(10, ap[0]); push(20, ap[1]); push(30, ap[2]); push(40, 1); push(1, at.value); push(2, at.tag); push(70, 0);
      }
      push(0, 'SEQEND'); push(5, gen());
    }
  }
}

// ── src/explode.js ──

// @gcu/dxf block resolver — the opt-in derived view.
//
// The canonical Document keeps blocks compact (a BlockDef + lightweight INSERTs), the
// spine-principle "small auditable thing". explode() is the DERIVED "give me the legion"
// view: it composes each INSERT's transform over its block definition to produce flat
// world geometry, recursing through nested inserts with a cyclic-reference guard. You
// opt into it; nothing bakes it at import.

const DEG$explode = Math.PI / 180;

// 4×4 affine, row-major. World = Translate(insertion) · RotZ · Scale · Translate(−base).
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function matMul(a, b) {
  const m = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]; m[r * 4 + c] = s; }
  return m;
}

function apply(m, [x, y, z]) {
  return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
}

function insertMatrix(t, base = [0, 0, 0]) {
  const c = Math.cos(t.rotation * DEG$explode), s = Math.sin(t.rotation * DEG$explode);
  const [sx, sy, sz] = t.scale, [px, py, pz] = t.position, [bx, by, bz] = base;
  const T = [1, 0, 0, px, 0, 1, 0, py, 0, 0, 1, pz, 0, 0, 0, 1];
  const R = [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const S = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  const B = [1, 0, 0, -bx, 0, 1, 0, -by, 0, 0, 1, -bz, 0, 0, 0, 1];
  return matMul(matMul(matMul(T, R), S), B);
}

const scaleX = (m) => Math.hypot(m[0], m[4], m[8]);   // uniform-scale factor for radius

function transformFeature(f, M) {
  const g = f.geometry;
  if (g.kind === 'polyline' || g.kind === 'face') {
    const v = new Float64Array(g.vertices.length);
    for (let i = 0; i < v.length; i += 3) { const w = apply(M, [g.vertices[i], g.vertices[i + 1], g.vertices[i + 2]]); v[i] = w[0]; v[i + 1] = w[1]; v[i + 2] = w[2]; }
    return { ...f, geometry: { ...g, vertices: v } };       // bulges survive: rotation + uniform scale preserve tan(θ/4)
  }
  if (g.kind === 'circle') return { ...f, geometry: { ...g, center: apply(M, g.center), radius: g.radius * scaleX(M) } };
  if (g.kind === 'point') return { ...f, geometry: { ...g, position: apply(M, g.position) } };
  return f;
}

function walk(features, blocks, M, stack, warnings, out) {
  for (const f of features) {
    const g = f.geometry;
    if (g && g.kind === 'insert') {
      const name = g.block;
      if (stack.includes(name)) { warnings.push({ entity: 'INSERT', reason: `cyclic block reference: ${name}` }); continue; }
      const blk = blocks[name];
      if (!blk) { warnings.push({ entity: 'INSERT', reason: `undefined block: ${name}` }); continue; }
      if (g.transform.scale[0] !== g.transform.scale[1]) warnings.push({ entity: 'INSERT', reason: `non-uniform scale on '${name}' distorts arcs/circles` });
      walk(blk.features, blocks, matMul(M, insertMatrix(g.transform, blk.base)), [...stack, name], warnings, out);
    } else if (g) out.push(transformFeature(f, M));
    else out.push(f);                                        // null-geometry punt passes through
  }
}

// Resolve every INSERT into transformed flat geometry. Returns a new Document with no
// inserts (exploded:true), accumulating any cyclic / undefined-block / non-uniform-scale
// warnings onto the existing log.
function explode(doc, _opts = {}) {
  const warnings = [], out = [];
  walk(doc.features, doc.blocks || {}, ident(), [], warnings, out);
  return { ...doc, features: out, exploded: true, warnings: [...(doc.warnings || []), ...warnings] };
}

// ── src/scene.js ──

// scene — extract VIEWER-shaped geometry from a Document: one merged mesh
// (3DFACE soup + polyface/polygon meshes), strings (polylines with bulges
// sampled to chords, lines, arcs, circles), and points — each tagged with its
// DXF layer. This is the bridge a 3D viewer (micro's condenser engine) builds
// layers from; the Document itself stays the canonical, lossless model.

// sample one bulge span into chord points (excluding p0, including p1):
// ~24 chords for a full circle, never fewer than 2 for a visible arc
function sampleSpan(p0, p1, bulge, z0, z1, out) {
  const arc = arcFromBulge(p0, p1, bulge);
  if (!arc) { out.push(p1[0], p1[1], z1); return; }
  const n = Math.max(2, Math.ceil((Math.abs(arc.sweep) / TAU) * 24));
  const a0 = arc.startAngle;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const a = a0 + arc.sweep * t;
    out.push(arc.center[0] + arc.radius * Math.cos(a), arc.center[1] + arc.radius * Math.sin(a), z0 + (z1 - z0) * t);
  }
}

// → { mesh: {vertices,triangles}|null, strings: [{layer,pts:Float64Array}],
//     points: [{layer,x,y,z}], layers: [names], counts, bbox: [min3,max3]|null }
function extractScene(doc) {
  const flat = doc.exploded ? doc : explode(doc);
  const mv = [], mt = [];
  const strings = [], points = [];
  const layerSet = new Set();
  const layerColors = {};                                  // layer name → [r,g,b] | null (first resolved wins)
  let meshColor;                                           // uniform across every face → the mesh tint; mixed → null

  for (const f of flat.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const layer = (f.properties && f.properties.layer) || '0';
    const rgb = colorToRgb(f.properties && f.properties.color, layer, doc.layers);
    if (!(layer in layerColors) || (layerColors[layer] == null && rgb)) layerColors[layer] = rgb;

    const foldMeshColor = () => {
      if (meshColor === undefined) meshColor = rgb;
      else if (meshColor && (!rgb || meshColor[0] !== rgb[0] || meshColor[1] !== rgb[1] || meshColor[2] !== rgb[2])) meshColor = null;
    };
    if (g.kind === 'mesh') {
      const base = mv.length / 3;
      for (let i = 0; i < g.vertices.length; i++) mv.push(g.vertices[i]);
      for (let i = 0; i < g.triangles.length; i++) mt.push(base + g.triangles[i]);
      layerSet.add(layer);
      foldMeshColor();
    } else if (g.kind === 'face') {
      const v = g.vertices;
      const base = mv.length / 3;
      for (let i = 0; i < v.length; i++) mv.push(v[i]);
      const nV = v.length / 3;
      if (nV >= 3) mt.push(base, base + 1, base + 2);
      if (nV === 4) mt.push(base, base + 2, base + 3);
      layerSet.add(layer);
      foldMeshColor();
    } else if (g.kind === 'polyline') {
      const v = g.vertices;
      const nV = v.length / 3;
      if (nV < 2) continue;
      const pts = [v[0], v[1], v[2]];
      const spans = g.closed ? nV : nV - 1;
      for (let i = 0; i < spans; i++) {
        const a = i, b = (i + 1) % nV;
        const bulge = g.bulges ? g.bulges[a] || 0 : 0;
        sampleSpan([v[a * 3], v[a * 3 + 1]], [v[b * 3], v[b * 3 + 1]], bulge, v[a * 3 + 2], v[b * 3 + 2], pts);
      }
      strings.push({ layer, color: rgb, pts: Float64Array.from(pts) });
      layerSet.add(layer);
    } else if (g.kind === 'circle') {
      const n = 32, pts = [];
      const z = g.center[2] || 0;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * TAU;
        pts.push(g.center[0] + g.radius * Math.cos(a), g.center[1] + g.radius * Math.sin(a), z);
      }
      strings.push({ layer, color: rgb, pts: Float64Array.from(pts) });
      layerSet.add(layer);
    } else if (g.kind === 'point') {
      points.push({ layer, color: rgb, x: g.position[0], y: g.position[1], z: g.position[2] || 0 });
      layerSet.add(layer);
    }
    // text / attdef / hatch metadata: not scene geometry
  }

  // the shared bbox over everything extracted
  let bbox = null;
  const grow = (x, y, z) => {
    if (!bbox) bbox = [x, y, z, x, y, z];
    else {
      if (x < bbox[0]) bbox[0] = x; if (y < bbox[1]) bbox[1] = y; if (z < bbox[2]) bbox[2] = z;
      if (x > bbox[3]) bbox[3] = x; if (y > bbox[4]) bbox[4] = y; if (z > bbox[5]) bbox[5] = z;
    }
  };
  for (let i = 0; i < mv.length; i += 3) grow(mv[i], mv[i + 1], mv[i + 2]);
  for (const s of strings) for (let i = 0; i < s.pts.length; i += 3) grow(s.pts[i], s.pts[i + 1], s.pts[i + 2]);
  for (const p of points) grow(p.x, p.y, p.z);

  return {
    mesh: mt.length ? { vertices: Float64Array.from(mv), triangles: Uint32Array.from(mt), color: meshColor || null } : null,
    strings, points,
    layers: [...layerSet].sort(),
    layerColors,
    counts: { triangles: mt.length / 3, strings: strings.length, points: points.length },
    bbox,
  };
}

// ── src/main.js ──

// @gcu/dxf — module manifest. Build concat order. v0.1 foundation primitives are in
// place (tokenize: the group-code pair spine; arc: bulge↔arc, the throughline; color:
// the un-flattened colour model); the reader (read.js), writer (write.js), and block
// resolver (explode.js) build on these.

export {
  parsePairs,
  serializePairs,
  valueKind,
  TAU,
  arcFromBulge,
  bulgeFromArc,
  arcMidpoint,
  resolveColor,
  colorToPairs,
  aciToRgb,
  colorToRgb,
  read,
  write,
  explode,
  extractScene,
};

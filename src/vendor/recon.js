// ⚠ VENDORED — DO NOT EDIT. @gcu/recon, copied from ../auditable/ext/recon/index.js (built from its src/ by @gcu/build).
// Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/recon — Reconnaissance for data: a general, heuristic-driven sniffer that scouts a sample of tabular data and produces an annotated manifest — delimiter, types, semantic roles, units, analytes, spatial grid facet — via a registry of heuristics. Geoscience detection is one registerable pack. Inference only; zero dependencies.

// ── src/detect.js ──

// @gcu/recon — bootstrap detection: delimiter, base column types, the sniff context.
// Zero-dep; NULL_SENTINELS mirrors @gcu/sluice's (recon stays standalone).

const NULL_SENTINELS = new Set([
  '', 'NA', 'NaN', 'na', 'nan', 'N/A', 'n/a', 'null', 'NULL', '*', '-',
  '-999', '-99', '#N/A', 'VOID', 'void', '-1.0e+32', '-1e+32', '1e+31', '-9999', '-99999',
]);

const DELIMITERS = [',', '\t', ';', '|', ' '];

// Pick the delimiter that splits the sample into the most, most-consistent columns.
function detectDelimiter(lines) {
  let best = ',', bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => l.split(d).length);
    if (counts.length === 0 || counts[0] < 2) continue;
    const allSame = counts.every((c) => c === counts[0]);
    const score = allSame ? counts[0] * 1000 + counts.length : counts[0];
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

const unquote = (s) => s.trim().replace(/^["']|["']$/g, '');

// Build the sniff context from raw sample lines.
function buildContext(lines, { delimiter, comment = '#' } = {}) {
  const clean = lines.filter((l) => l !== '' && !(comment && l.startsWith(comment)));
  if (clean.length === 0) return { delimiter: delimiter || ',', header: [], sampleRows: [], columnCount: 0, baseTypes: [] };
  const delim = delimiter || detectDelimiter(clean.slice(0, 20));
  const header = clean[0].split(delim).map(unquote);
  const columnCount = header.length;
  const sampleRows = clean.slice(1).map((l) => l.split(delim).map(unquote));

  // Base type detection: numeric / categorical / id (BMA-style num vs non-num counts).
  const num = new Array(columnCount).fill(0);
  const nonNum = new Array(columnCount).fill(0);
  const distinct = Array.from({ length: columnCount }, () => new Set());
  for (const row of sampleRows) {
    for (let c = 0; c < columnCount; c++) {
      const v = row[c] ?? '';
      if (NULL_SENTINELS.has(v)) continue;
      distinct[c].add(v);
      if (!isNaN(Number(v))) num[c]++; else nonNum[c]++;
    }
  }
  const n = sampleRows.length;
  const baseTypes = header.map((_, c) => {
    const total = num[c] + nonNum[c];
    if (total === 0) return 'numeric';
    // All-numeric → numeric, even if (near-)unique. A fine-resolution grade is
    // all-distinct numbers but is NOT an id; id-ness is a ROLE (the `id`
    // heuristic, name + cardinality), orthogonal to the base type. Typing a
    // grade as `id` here would make parseCsv read it as a string → stats break.
    if (nonNum[c] === 0) return 'numeric';
    if (num[c] === 0) return 'categorical';
    return num[c] / total > 0.8 ? 'numeric' : 'categorical';
  });

  return { delimiter: delim, header, sampleRows, columnCount, baseTypes, distinct: distinct.map((s) => s.size), rowSample: n };
}

// ── src/naming.js ──

// @gcu/recon — column-NAME analysis: coordinate roles, units, analytes.
// Standalone detectors (exported; useful + testable on their own).

// XYZ / DXYZ name patterns (harvested from BMA).
const XYZ_PATTERNS = {
  x: [/^x$/i, /^xc$/i, /^x[_-]?cent(re|er)?$/i, /^mid[_-]?x$/i, /^centroid[_-]?x$/i, /^east(ing)?$/i, /^x[_-]?coord$/i, /^xcenter$/i, /^xmid$/i, /^xblock$/i],
  y: [/^y$/i, /^yc$/i, /^y[_-]?cent(re|er)?$/i, /^mid[_-]?y$/i, /^centroid[_-]?y$/i, /^north(ing)?$/i, /^y[_-]?coord$/i, /^ycenter$/i, /^ymid$/i, /^yblock$/i],
  z: [/^z$/i, /^zc$/i, /^z[_-]?cent(re|er)?$/i, /^mid[_-]?z$/i, /^centroid[_-]?z$/i, /^elev(ation)?$/i, /^rl$/i, /^z[_-]?coord$/i, /^zcenter$/i, /^zmid$/i, /^zblock$/i, /^level$/i, /^bench$/i],
};
const DXYZ_PATTERNS = {
  dx: [/^dx$/i, /^xinc$/i, /^xsize$/i, /^dimx$/i, /^xlen$/i, /^x[_-]?dim$/i, /^x[_-]?size$/i, /^size[_-]?x$/i],
  dy: [/^dy$/i, /^yinc$/i, /^ysize$/i, /^dimy$/i, /^ylen$/i, /^y[_-]?dim$/i, /^y[_-]?size$/i, /^size[_-]?y$/i],
  dz: [/^dz$/i, /^zinc$/i, /^zsize$/i, /^dimz$/i, /^zlen$/i, /^z[_-]?dim$/i, /^z[_-]?size$/i, /^size[_-]?z$/i],
};

// guessCoords — identify X/Y/Z (and dX/dY/dZ) columns among numeric columns by name,
// with a first-3-numeric positional fallback for X/Y/Z. Returns { cols, confidence }.
function guessCoords(header, types) {
  const isNum = (i) => !types || types[i] === 'numeric' || types[i] === 'id';
  const cols = {}; const confidence = {};
  for (const axis of ['x', 'y', 'z']) {
    for (const pat of XYZ_PATTERNS[axis]) {
      const i = header.findIndex((h, idx) => isNum(idx) && pat.test(h.trim()));
      if (i >= 0) { cols[axis] = header[i]; confidence[axis] = 0.9; break; }
    }
  }
  for (const axis of ['dx', 'dy', 'dz']) {
    for (const pat of DXYZ_PATTERNS[axis]) {
      const i = header.findIndex((h, idx) => isNum(idx) && pat.test(h.trim()));
      if (i >= 0) { cols[axis] = header[i]; confidence[axis] = 0.9; break; }
    }
  }
  if (!(cols.x && cols.y && cols.z)) {
    const numCols = header.filter((_, i) => isNum(i));
    if (numCols.length >= 3 && !cols.x && !cols.y && !cols.z) {
      cols.x = numCols[0]; cols.y = numCols[1]; cols.z = numCols[2];
      confidence.x = confidence.y = confidence.z = 0.3;  // positional fallback
    }
  }
  return { cols, confidence };
}

// detectUnit — parse a physical unit from a column name. Returns { unit, confidence } | null.
const UNIT_SUFFIXES = [
  [/(_|\b)(g[_/]?t|gpt|gt)$/i, 'g/t'], [/(_|\b)ppm$/i, 'ppm'], [/(_|\b)ppb$/i, 'ppb'],
  [/(_|\b)(pct|pc|perc(ent)?)$/i, '%'], [/(_|\b)(g[_/]?cm3|gcm3|sg|dens(ity)?)$/i, 'g/cm3'],
  [/(_|\b)(m|metres?|meters?)$/i, 'm'], [/(_|\b)(rl)$/i, 'm'], [/(_|\b)(deg|degrees?)$/i, 'deg'],
];
function detectUnit(name) {
  // Bracketed/parenthetical unit wins (explicit): "Au (g/t)", "FE [%]".
  const br = name.match(/[([{]\s*([^)\]}]+?)\s*[)\]}]\s*$/);
  if (br) {
    const u = normalizeUnit(br[1]);
    if (u) return { unit: u, confidence: 0.95 };
  }
  for (const [re, unit] of UNIT_SUFFIXES) {
    if (re.test(name)) return { unit, confidence: 0.8 };
  }
  if (/(^|_)%$/.test(name) || name.endsWith('%')) return { unit: '%', confidence: 0.9 };
  return null;
}
function normalizeUnit(raw) {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  const map = { 'g/t': 'g/t', gpt: 'g/t', 'gt': 'g/t', '%': '%', pct: '%', percent: '%', ppm: 'ppm', ppb: 'ppb', 'g/cm3': 'g/cm3', gcm3: 'g/cm3', sg: 'g/cm3', m: 'm', deg: 'deg' };
  return map[s] || (/^[a-z%/0-9]+$/.test(s) ? raw.trim() : null);
}

// detectAnalyte — element symbol or common oxide from a column name. { analyte, confidence } | null.
const ELEMENTS = new Set(['Au', 'Ag', 'Cu', 'Pb', 'Zn', 'Fe', 'Ni', 'Co', 'Mo', 'U', 'Sn', 'W', 'As', 'Sb', 'Bi', 'Cd', 'Cr', 'Mn', 'V', 'Ti', 'S', 'C', 'P', 'K', 'Na', 'Ca', 'Mg', 'Al', 'Si', 'Hg', 'Te', 'Se', 'Ba', 'Sr', 'Li', 'Be', 'Pt', 'Pd', 'Rh', 'Ir', 'Os', 'Ru', 'Re', 'Ta', 'Nb', 'Zr', 'Hf', 'Ga', 'Ge', 'In', 'Tl', 'Sc', 'Y', 'La', 'Ce', 'Nd', 'Th']);
const OXIDES = new Set(['SiO2', 'Al2O3', 'Fe2O3', 'FeO', 'CaO', 'MgO', 'K2O', 'Na2O', 'TiO2', 'MnO', 'P2O5', 'Cr2O3', 'SO3', 'LOI', 'BaO', 'SrO']);
const ELEM_LC = new Map([...ELEMENTS].map((e) => [e.toLowerCase(), e]));
const OX_LC = new Map([...OXIDES].map((o) => [o.toLowerCase(), o]));

function detectAnalyte(name) {
  // strip a leading/trailing unit-ish or descriptor token, then test the core token(s).
  const tokens = name.split(/[_\s\-.]+/).filter(Boolean);
  for (const tok of tokens) {
    if (OXIDES.has(tok)) return { analyte: tok, confidence: 0.95 };
    if (OX_LC.has(tok.toLowerCase())) return { analyte: OX_LC.get(tok.toLowerCase()), confidence: 0.85 };
    if (ELEMENTS.has(tok)) return { analyte: tok, confidence: 0.95 };
    if (ELEM_LC.has(tok.toLowerCase())) return { analyte: ELEM_LC.get(tok.toLowerCase()), confidence: 0.8 };
  }
  return null;
}

// ── src/geometry.js ──

// @gcu/recon — grid geometry inference (the scan-phase). A sluice-protocol
// accumulator collects per-axis coord material; inferGeometry interprets it into
// a spatial facet. computeGeometry logic harvested from BMA's worker.

const DEFAULT_CAP = 200000;
const round10 = (v) => Number(v.toPrecision(10));   // collapse float noise for spacing equality

// geometryAccumulator(coordCols) — a sluice-protocol accumulator over ROWS.
// coordCols: { x?, y?, z?, dx?, dy?, dz? } (column names). Collects, per axis:
// capped distinct coords, extent, ordering transitions, sample count; plus
// distinct dim values for dX/dY/dZ. State is structuredClone-transferable.
function geometryAccumulator(coordCols, { cap = DEFAULT_CAP } = {}) {
  const axes = ['x', 'y', 'z'].filter((a) => coordCols[a]);
  const dims = ['dx', 'dy', 'dz'].filter((a) => coordCols[a]);
  const newAxis = () => ({ distinct: {}, dn: 0, overflow: false, min: Infinity, max: -Infinity, prev: null, transitions: 0, count: 0 });
  return {
    create: () => ({
      coordCols, cap,
      axes: Object.fromEntries(axes.map((a) => [a, newAxis()])),
      dims: Object.fromEntries(dims.map((a) => [a, { distinct: {}, overflow: false }])),
    }),
    push: (s, row) => {
      for (const a of axes) {
        const v = row[coordCols[a]];
        if (!Number.isFinite(v)) continue;
        const ax = s.axes[a];
        ax.count++;
        if (v < ax.min) ax.min = v;
        if (v > ax.max) ax.max = v;
        if (ax.prev !== null && v !== ax.prev) ax.transitions++;
        ax.prev = v;
        if (!ax.overflow) {
          const k = String(round10(v));
          if (!(k in ax.distinct)) { if (ax.dn >= s.cap) ax.overflow = true; else { ax.distinct[k] = 1; ax.dn++; } }
        }
      }
      for (const a of dims) {
        const v = row[coordCols[a]];
        if (!Number.isFinite(v) || v <= 0) continue;
        const dm = s.dims[a];
        if (!dm.overflow) { const k = String(round10(v)); if (!(k in dm.distinct)) { if (Object.keys(dm.distinct).length >= s.cap) dm.overflow = true; else dm.distinct[k] = 1; } }
      }
    },
    merge: (a, b) => {
      const out = { coordCols: a.coordCols, cap: a.cap, axes: {}, dims: {} };
      for (const ax in a.axes) {
        const x = a.axes[ax], y = b.axes[ax] || newAxis();
        const distinct = { ...x.distinct };
        let dn = x.dn, overflow = x.overflow || y.overflow;
        for (const k in y.distinct) { if (!(k in distinct)) { if (dn >= a.cap) overflow = true; else { distinct[k] = 1; dn++; } } }
        out.axes[ax] = { distinct, dn, overflow, min: Math.min(x.min, y.min), max: Math.max(x.max, y.max), prev: null, transitions: x.transitions + y.transitions, count: x.count + y.count };
      }
      for (const d in a.dims) {
        const distinct = { ...a.dims[d].distinct };
        for (const k in (b.dims[d] || { distinct: {} }).distinct) distinct[k] = 1;
        out.dims[d] = { distinct, overflow: a.dims[d].overflow || (b.dims[d] && b.dims[d].overflow) };
      }
      return out;
    },
    result: (s) => {
      const axes = {};
      for (const a in s.axes) {
        const ax = s.axes[a];
        axes[a] = { values: Object.keys(ax.distinct).map(Number).sort((p, q) => p - q), min: ax.min, max: ax.max, transitions: ax.transitions, count: ax.count, overflow: ax.overflow };
      }
      const dims = {};
      for (const d in s.dims) dims[d] = Object.keys(s.dims[d].distinct).map(Number).sort((p, q) => p - q);
      return { axes, dims };
    },
  };
}

// inferGeometry(accResult) → spatial facet (gridded | scattered).
function inferGeometry(accResult, { rotation } = {}) {
  const { axes, dims } = accResult;
  const present = ['x', 'y', 'z'].filter((a) => axes[a] && axes[a].count > 0);
  if (present.length < 3) {
    return { kind: 'scattered', coordCols: present };
  }
  const per = {};
  let anySub = false;
  for (const a of present) {
    const dimKey = a === 'x' ? 'dx' : a === 'y' ? 'dy' : 'dz';
    per[a] = computeAxis(axes[a], dims[dimKey]);
    if (per[a].isSubBlocked) anySub = true;
    if (per[a].size == null) return { kind: 'scattered', coordCols: present };
  }
  // ordering: most transitions = fastest-varying = innermost
  const order = present.slice().sort((p, q) => axes[q].transitions - axes[p].transitions).map((a) => a.toUpperCase());
  return {
    kind: 'gridded',
    origin: [per.x.origin, per.y.origin, per.z.origin],
    size: [per.x.size, per.y.size, per.z.size],
    count: [per.x.count, per.y.count, per.z.count],
    rotation: rotation || [1, 0, 0, 0, 1, 0, 0, 0, 1],
    order: { fastest: order[0], middle: order[1], slowest: order[2] },
    subBlocked: anySub,
    subBlocks: anySub ? Object.fromEntries(present.map((a) => [a, per[a].subBlockSizes])) : null,
  };
}

// Per-axis grid inference from collected distinct coords (+ optional dim values).
function computeAxis(axisData, dimValues) {
  const sorted = axisData.values;
  const min = axisData.min, max = axisData.max;
  if (sorted.length <= 1) return { origin: min, max, size: null, count: 1, isSubBlocked: false, subBlockSizes: [] };

  // spacing-frequency histogram
  const spacingCounts = {};
  for (let i = 1; i < sorted.length; i++) {
    const d = round10(sorted[i] - sorted[i - 1]);
    if (d > 0) spacingCounts[d] = (spacingCounts[d] || 0) + 1;
  }
  const spacings = Object.entries(spacingCounts).map(([s, c]) => ({ size: Number(s), count: c })).sort((a, b) => b.count - a.count);

  let parentSize = null, subBlockSizes = [], isSubBlocked = false;
  if (spacings.length === 1) {
    parentSize = spacings[0].size;
  } else if (spacings.length > 1) {
    const total = spacings.reduce((s, x) => s + x.count, 0);
    const significant = spacings.filter((s) => s.count / total > 0.02);
    if (significant.length === 1) {
      parentSize = significant[0].size;
    } else {
      const bySize = significant.slice().sort((a, b) => b.size - a.size);
      const candidate = bySize[0].size;
      const subs = [];
      for (const s of bySize.slice(1)) {
        const ratio = candidate / s.size, r = Math.round(ratio);
        if (r >= 2 && Math.abs(ratio - r) < 0.05) subs.push({ size: s.size, ratio: r, count: s.count });
      }
      if (subs.length > 0) { parentSize = candidate; subBlockSizes = subs; isSubBlocked = true; }
      else parentSize = spacings[0].size;
    }
  }

  // explicit dim column overrides spacing inference
  if (dimValues && dimValues.length > 0) {
    const uniq = dimValues;
    const maxDim = uniq[uniq.length - 1];
    if (uniq.length === 1) { parentSize = uniq[0]; isSubBlocked = false; subBlockSizes = []; }
    else { parentSize = maxDim; isSubBlocked = true; subBlockSizes = uniq.slice(0, -1).map((d) => ({ size: d, ratio: Math.round(maxDim / d) })); }
  }

  const count = parentSize ? Math.round((max - min) / parentSize) + 1 : sorted.length;
  return { origin: min, max, size: parentSize, count, isSubBlocked, subBlockSizes };
}

// ── src/heuristics.js ──

// @gcu/recon — built-in heuristic packs. Each heuristic: { name, pack, detect(ctx) }
// returning Annotation[] = { target, key, value, confidence, source }. target is a
// column name or '$table'. Heuristics are pure functions of the sniff context.


const BOOL_SET = new Set(['0', '1', 'true', 'false', 'yes', 'no', 'y', 'n', 't', 'f']);
const colValues = (ctx, c) => ctx.sampleRows.map((r) => r[c]).filter((v) => v !== undefined && v !== '');

// ── core pack ─────────────────────────────────────────────────────────
const typeH = {
  name: 'type', pack: 'core',
  detect: (ctx) => ctx.header.map((name, c) => ({ target: name, key: 'type', value: ctx.baseTypes[c], confidence: 0.85, source: 'type' })),
};

const constantH = {
  // constant-ness is orthogonal to role (a plan-section Z is constant AND coord-z),
  // so it gets its own key rather than competing for 'role'.
  name: 'constant', pack: 'core',
  detect: (ctx) => ctx.header
    .map((name, c) => (ctx.distinct && ctx.distinct[c] === 1 && ctx.sampleRows.length > 1)
      ? { target: name, key: 'constant', value: true, confidence: 0.9, source: 'constant' } : null)
    .filter(Boolean),
};

const booleanH = {
  name: 'boolean', pack: 'core',
  detect: (ctx) => ctx.header.map((name, c) => {
    const vals = colValues(ctx, c);
    if (vals.length === 0) return null;
    return vals.every((v) => BOOL_SET.has(String(v).toLowerCase()))
      ? { target: name, key: 'role', value: 'flag', confidence: 0.8, source: 'boolean' } : null;
  }).filter(Boolean),
};

const dateH = {
  name: 'date', pack: 'core',
  detect: (ctx) => ctx.header.map((name, c) => {
    const byName = /(^|[_\s])(date|datetime|timestamp|dt)([_\s]|$)/i.test(name);
    const vals = colValues(ctx, c).slice(0, 20);
    const parseable = vals.length > 0 && vals.every((v) => /\d{4}-\d{2}-\d{2}/.test(v) || (isNaN(Number(v)) && !isNaN(Date.parse(v))));
    if (byName && parseable) return { target: name, key: 'role', value: 'date', confidence: 0.85, source: 'date' };
    if (byName) return { target: name, key: 'role', value: 'date', confidence: 0.6, source: 'date' };
    if (parseable && /\d{4}-\d{2}-\d{2}/.test(vals[0] || '')) return { target: name, key: 'role', value: 'date', confidence: 0.6, source: 'date' };
    return null;
  }).filter(Boolean),
};

const idH = {
  name: 'id', pack: 'core',
  detect: (ctx) => ctx.header.map((name, c) => {
    const idName = /(^|[_\s])(id|hole|bhid|dhid|holeid|sampleid|sample_id|key)([_\s]|$)/i.test(name) || /id$/i.test(name);
    const highCard = ctx.distinct && ctx.sampleRows.length >= 8 && ctx.distinct[c] >= ctx.sampleRows.length * 0.98;
    if (ctx.baseTypes[c] === 'id' || (idName && highCard)) {
      return { target: name, key: 'role', value: 'id', confidence: idName && highCard ? 0.9 : 0.6, source: 'id' };
    }
    return null;
  }).filter(Boolean),
};

const corePack = [typeH, constantH, booleanH, dateH, idH];

// ── geo pack ──────────────────────────────────────────────────────────
const coordsH = {
  name: 'coords', pack: 'geo',
  detect: (ctx) => {
    const { cols, confidence } = guessCoords(ctx.header, ctx.baseTypes);
    const out = [];
    for (const axis of ['x', 'y', 'z']) {
      if (cols[axis]) out.push({ target: cols[axis], key: 'role', value: 'coord-' + axis, confidence: confidence[axis], source: 'coords' });
    }
    for (const axis of ['dx', 'dy', 'dz']) {
      if (cols[axis]) out.push({ target: cols[axis], key: 'role', value: 'size-' + axis, confidence: confidence[axis] || 0.9, source: 'coords' });
    }
    return out;
  },
};

const unitsH = {
  name: 'units', pack: 'geo',
  detect: (ctx) => ctx.header.map((name) => {
    const u = detectUnit(name);
    return u ? { target: name, key: 'unit', value: u.unit, confidence: u.confidence, source: 'units' } : null;
  }).filter(Boolean),
};

const analyteH = {
  name: 'analyte', pack: 'geo',
  // Coord-aware: a column already detected as a coordinate/size axis is NOT an
  // analyte — resolves single-letter element clashes (a "Y" axis vs Yttrium, "V"
  // vs Vanadium, etc.). coordsH runs first in the geo pack, so its role
  // annotations are already in ctx.annotations.
  detect: (ctx) => {
    const coords = new Set(ctx.annotations
      .filter((a) => a.key === 'role' && /^(coord|size)-/.test(a.value))
      .map((a) => a.target));
    return ctx.header.map((name) => {
      if (coords.has(name)) return null;
      const a = detectAnalyte(name);
      return a ? { target: name, key: 'analyte', value: a.analyte, confidence: a.confidence, source: 'analyte' } : null;
    }).filter(Boolean);
  },
};

const geoPack = [coordsH, unitsH, analyteH];

// ── src/recon.js ──

// @gcu/recon — the registry + the sniff() runner that assembles the annotated
// manifest from heuristic output.


// Mutable default registry (plugin-over-hardwire: register more packs at will).
const defaultHeuristics = [...corePack, ...geoPack];

function registerHeuristic(h) {
  if (!h || typeof h.detect !== 'function') throw new Error('recon: heuristic needs a detect() function');
  defaultHeuristics.push(h);
  return h;
}

// sniff(lines, opts) — sample-phase inference. opts:
//   delimiter   — override delimiter detection
//   heuristics  — explicit heuristic list (else defaultHeuristics)
//   packs       — filter defaultHeuristics by pack name (e.g. ['core'])
function sniff(lines, opts = {}) {
  const ctx = buildContext(lines, opts);
  ctx.annotations = [];

  let heuristics = opts.heuristics || defaultHeuristics;
  if (opts.packs) heuristics = heuristics.filter((h) => opts.packs.includes(h.pack));

  for (const h of heuristics) {
    let found = [];
    try { found = h.detect(ctx) || []; } catch { found = []; }
    for (const ann of found) ctx.annotations.push({ ...ann, source: ann.source || h.name });
  }

  return assemble(ctx);
}

function assemble(ctx) {
  // best annotation per (target,key) by confidence
  const best = new Map();           // `${target} ${key}` -> annotation
  for (const ann of ctx.annotations) {
    const k = ann.target + ' ' + ann.key;
    const cur = best.get(k);
    if (!cur || (ann.confidence ?? 0) > (cur.confidence ?? 0)) best.set(k, ann);
  }
  const pick = (target, key) => best.get(target + ' ' + key);

  const columns = ctx.header.map((name, c) => {
    const col = { name, type: ctx.baseTypes[c], confidence: {} };
    const t = pick(name, 'type'); if (t) { col.type = t.value; col.confidence.type = t.confidence; }
    const role = pick(name, 'role'); if (role) { col.role = role.value; col.confidence.role = role.confidence; }
    const unit = pick(name, 'unit'); if (unit) { col.unit = unit.value; col.confidence.unit = unit.confidence; }
    const analyte = pick(name, 'analyte'); if (analyte) { col.analyte = analyte.value; col.confidence.analyte = analyte.confidence; }
    const cst = pick(name, 'constant'); if (cst) { col.constant = true; col.confidence.constant = cst.confidence; }
    return col;
  });

  // coordCols from role annotations (coord-x / size-dx / …)
  const coordCols = {};
  for (const col of columns) {
    if (!col.role) continue;
    const m = col.role.match(/^coord-([xyz])$/);
    if (m) coordCols[m[1]] = col.name;
    const d = col.role.match(/^size-(d[xyz])$/);
    if (d) coordCols[d[1]] = col.name;
  }

  return {
    delimiter: ctx.delimiter,
    header: ctx.header,
    rowSample: ctx.rowSample,
    columns,
    coordCols,
    facets: { spatial: null },        // filled by inferGeometry after a coord scan
    annotations: ctx.annotations,
  };
}

// ── src/main.js ──

// @gcu/recon — reconnaissance for data: a general, heuristic-driven sniffer.
//
// Scouts a sample of tabular data (and, for geometry, a coord scan) and produces
// an annotated manifest — delimiter, header, types, semantic roles, units,
// analytes, spatial facet — via a registry of heuristics. Geoscience detection is
// one registerable pack, not hardcoded. Inference only: no mutation, no reorder,
// no format reading (sources are sluice/archive/omf). Zero-dep.
//
// Module manifest (build concat order):
//   detect.js     — delimiter, base types, the sniff context, NULL_SENTINELS
//   naming.js     — column-name analysis: coords, units, analytes (standalone detectors)
//   geometry.js   — geometryAccumulator (sluice-protocol) + inferGeometry
//   heuristics.js — corePack + geoPack
//   recon.js      — registry + sniff() runner + manifest assembly

export {
  NULL_SENTINELS,
  detectDelimiter,
  buildContext,
  XYZ_PATTERNS,
  DXYZ_PATTERNS,
  guessCoords,
  detectUnit,
  detectAnalyte,
  geometryAccumulator,
  inferGeometry,
  corePack,
  geoPack,
  defaultHeuristics,
  registerHeuristic,
  sniff,
};

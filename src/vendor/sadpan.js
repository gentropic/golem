// ⚠ VENDORED — DO NOT EDIT. @gcu/sadpan, DataFrame-style tables and series, copied from
// ../auditable/ext/sadpan/index.js (built from its src/ by @gcu/build). Re-vendor by copying that file here.
// golem uses series() for summary statistics.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: ext/sadpan/src/  Build: node ext/sadpan/build.js
// @gcu/sadpan — Lightweight dataframe library for Auditable
// Column-oriented store, verb methods, pandas-style wrapper.

// -- series.js --

// series.js — Series + BooleanMask

class BooleanMask {
  constructor(values) { this._values = values; }
  __and__(other) { return new BooleanMask(this._values.map((v, i) => v && other._values[i])); }
  __or__(other) { return new BooleanMask(this._values.map((v, i) => v || other._values[i])); }
  __invert__() { return new BooleanMask(this._values.map(v => !v)); }
  __len__() { return this._values.length; }
  __bool__() { return this._values.some(v => v); }
  get length() { return this._values.length; }
}

class Series {
  constructor(values, name) {
    // Coerce non-Array iterables (natra ndarrays, TypedArrays, Sets…)
    // into a plain JS Array so the .map / .filter / .reduce surface
    // on Series works regardless of input shape. Cheap; Series sizes
    // in notebook workloads are nowhere near hot-loop hot.
    if (values != null
        && !Array.isArray(values)
        && typeof values !== 'string'
        && typeof values === 'object'
        && typeof values[Symbol.iterator] === 'function') {
      values = Array.from(values);
    }
    this._values = values;
    this._name = name || null;
    // Surface as `<class 'Series'>` to adder's type() / str(type(x))
    this.__adderClass__ = 'Series';
  }
  get values() { return this._values; }
  get name() { return this._name; }

  // aggregation
  sum() { let s = 0; for (const v of this._values) if (v != null) s += v; return s; }
  mean() { let s = 0, n = 0; for (const v of this._values) if (v != null) { s += v; n++; } return n ? s / n : NaN; }
  median() {
    const sorted = this._values.filter(v => v != null).sort((a, b) => a - b);
    const n = sorted.length;
    if (!n) return NaN;
    return n % 2 ? sorted[n >> 1] : (sorted[(n >> 1) - 1] + sorted[n >> 1]) / 2;
  }
  std() {
    const m = this.mean();
    let s = 0, n = 0;
    for (const v of this._values) if (v != null) { s += (v - m) ** 2; n++; }
    return n > 1 ? Math.sqrt(s / (n - 1)) : 0;
  }
  variance() {
    const m = this.mean();
    let s = 0, n = 0;
    for (const v of this._values) if (v != null) { s += (v - m) ** 2; n++; }
    return n > 1 ? s / (n - 1) : 0;
  }
  min() { let m = Infinity; for (const v of this._values) if (v != null && v < m) m = v; return m === Infinity ? NaN : m; }
  max() { let m = -Infinity; for (const v of this._values) if (v != null && v > m) m = v; return m === -Infinity ? NaN : m; }
  count() { let n = 0; for (const v of this._values) if (v != null) n++; return n; }

  // inspection
  unique() { return [...new Set(this._values)]; }
  nunique() { return new Set(this._values).size; }
  valueCounts() {
    const counts = new Map();
    for (const v of this._values) counts.set(v, (counts.get(v) || 0) + 1);
    return counts;
  }

  // transform
  map(fn) { return new Series(this._values.map(fn), this._name); }
  apply(fn) { return new Series(this._values.map(fn), this._name); }
  clip(lo, hi) { return new Series(this._values.map(v => v == null ? v : Math.max(lo, Math.min(hi, v))), this._name); }
  round(n = 0) { const f = 10 ** n; return new Series(this._values.map(v => v == null ? v : Math.round(v * f) / f), this._name); }
  abs() { return new Series(this._values.map(v => v == null ? v : Math.abs(v)), this._name); }
  log() { return new Series(this._values.map(v => v == null ? v : Math.log(v)), this._name); }
  exp() { return new Series(this._values.map(v => v == null ? v : Math.exp(v)), this._name); }
  sqrt() { return new Series(this._values.map(v => v == null ? v : Math.sqrt(v)), this._name); }
  cumsum() {
    let s = 0;
    return new Series(this._values.map(v => { if (v != null) s += v; return s; }), this._name);
  }
  diff() {
    return new Series(this._values.map((v, i) => i === 0 ? null : (v != null && this._values[i - 1] != null ? v - this._values[i - 1] : null)), this._name);
  }
  sort(ascending = true) {
    const sorted = this._values.slice().sort((a, b) => a - b);
    return new Series(ascending ? sorted : sorted.reverse(), this._name);
  }
  isna() { return new BooleanMask(this._values.map(v => v == null || v !== v)); }
  isnull() { return this.isna(); }   // pandas exposes both names
  notna() { return new BooleanMask(this._values.map(v => v != null && v === v)); }
  notnull() { return this.notna(); }
  isin(vals) { const s = new Set(vals); return new BooleanMask(this._values.map(v => s.has(v))); }
  astype(type) {
    if (type === 'number' || type === 'float') return new Series(this._values.map(Number), this._name);
    if (type === 'string' || type === 'str') return new Series(this._values.map(String), this._name);
    return this;
  }

  // dunders for adder operator dispatch
  __add__(other) { const ov = other instanceof Series ? other._values : null; return new Series(this._values.map((v, i) => v + (ov ? ov[i] : other)), this._name); }
  __sub__(other) { const ov = other instanceof Series ? other._values : null; return new Series(this._values.map((v, i) => v - (ov ? ov[i] : other)), this._name); }
  __mul__(other) { const ov = other instanceof Series ? other._values : null; return new Series(this._values.map((v, i) => v * (ov ? ov[i] : other)), this._name); }
  __truediv__(other) { const ov = other instanceof Series ? other._values : null; return new Series(this._values.map((v, i) => v / (ov ? ov[i] : other)), this._name); }
  __neg__() { return new Series(this._values.map(v => -v), this._name); }
  __gt__(other) { const ov = other instanceof Series ? other._values : null; return new BooleanMask(this._values.map((v, i) => v > (ov ? ov[i] : other))); }
  __ge__(other) { const ov = other instanceof Series ? other._values : null; return new BooleanMask(this._values.map((v, i) => v >= (ov ? ov[i] : other))); }
  __lt__(other) { const ov = other instanceof Series ? other._values : null; return new BooleanMask(this._values.map((v, i) => v < (ov ? ov[i] : other))); }
  __le__(other) { const ov = other instanceof Series ? other._values : null; return new BooleanMask(this._values.map((v, i) => v <= (ov ? ov[i] : other))); }
  __eq__(other) { const ov = other instanceof Series ? other._values : null; return new BooleanMask(this._values.map((v, i) => v === (ov ? ov[i] : other))); }
  __ne__(other) { const ov = other instanceof Series ? other._values : null; return new BooleanMask(this._values.map((v, i) => v !== (ov ? ov[i] : other))); }
  __len__() { return this._values.length; }

  [Symbol.iterator]() { return this._values[Symbol.iterator](); }

  _repr_html_() {
    const n = this._values.length;
    const maxRows = 20;
    const show = Math.min(n, maxRows);
    const name = this._name || 'value';
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '<table style="border-collapse:collapse;font-family:var(--mono,monospace);font-size:12px">';
    html += `<tr><th style="padding:3px 8px;border-bottom:2px solid var(--fg-dim,#666);text-align:left">${esc(name)}</th></tr>`;
    for (let i = 0; i < show; i++) {
      const v = this._values[i];
      const text = v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, '')) : esc(String(v));
      const align = typeof v === 'number' ? 'right' : 'left';
      html += `<tr><td style="padding:2px 8px;border-bottom:1px solid var(--bg-cell,#333);text-align:${align}">${text}</td></tr>`;
    }
    html += '</table>';
    if (n > maxRows) html += `<div style="font-size:11px;color:var(--fg-dim,#888);margin-top:4px">\u2026 ${n} values</div>`;
    return html;
  }
}

// -- table.js --

// table.js — Table class (column-oriented store)


class Table {
  constructor(columns, names) {
    this._columns = columns;
    this._names = names || Object.keys(columns);
    this._nrows = this._names.length > 0 ? columns[this._names[0]].length : 0;
  }

  // --- inspection ---
  numRows() { return this._nrows; }
  numCols() { return this._names.length; }
  columnNames() { return this._names.slice(); }
  array(col) { return this._columns[col]; }

  objects() {
    const rows = [];
    for (let i = 0; i < this._nrows; i++) {
      const row = {};
      for (const n of this._names) row[n] = this._columns[n][i];
      rows.push(row);
    }
    return rows;
  }

  print(n) {
    const rows = this.objects();
    const slice = n != null ? rows.slice(0, n) : rows;
    const header = this._names.join('\t');
    const body = slice.map(r => this._names.map(n => r[n] == null ? '' : String(r[n])).join('\t')).join('\n');
    return header + '\n' + body;
  }

  // --- selection ---
  select(...cols) {
    const c = {};
    for (const n of cols) c[n] = this._columns[n];
    return new Table(c, cols);
  }

  drop(...cols) {
    const s = new Set(cols);
    return this.select(...this._names.filter(n => !s.has(n)));
  }

  rename(map) {
    const c = {}, names = [];
    for (const n of this._names) {
      const nn = map[n] || n;
      c[nn] = this._columns[n];
      names.push(nn);
    }
    return new Table(c, names);
  }

  // --- filtering ---
  filter(fn) {
    const idx = [];
    for (let i = 0; i < this._nrows; i++) {
      const row = {};
      for (const n of this._names) row[n] = this._columns[n][i];
      if (fn(row, i)) idx.push(i);
    }
    return this._take(idx);
  }

  slice(start, end) {
    if (end === undefined) end = this._nrows;
    if (start < 0) start = Math.max(0, this._nrows + start);
    if (end < 0) end = Math.max(0, this._nrows + end);
    const c = {};
    for (const n of this._names) c[n] = this._columns[n].slice(start, end);
    return new Table(c, this._names.slice());
  }

  sample(n) {
    const idx = [];
    const pool = Array.from({ length: this._nrows }, (_, i) => i);
    for (let i = 0; i < Math.min(n, this._nrows); i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      idx.push(pool[i]);
    }
    return this._take(idx);
  }

  dedupe(...cols) {
    if (cols.length === 0) cols = this._names;
    const seen = new Set(), idx = [];
    for (let i = 0; i < this._nrows; i++) {
      const key = cols.map(c => this._columns[c][i]).join('\x00');
      if (!seen.has(key)) { seen.add(key); idx.push(i); }
    }
    return this._take(idx);
  }

  // --- sorting ---
  orderby(...keys) {
    const idx = Array.from({ length: this._nrows }, (_, i) => i);
    idx.sort((a, b) => {
      for (const k of keys) {
        let col, dir = 1;
        if (typeof k === 'string') { col = k; }
        else { col = Object.keys(k)[0]; dir = k[col] === 'desc' ? -1 : 1; }
        const va = this._columns[col][a], vb = this._columns[col][b];
        if (va < vb) return -dir;
        if (va > vb) return dir;
      }
      return 0;
    });
    return this._take(idx);
  }

  // --- derivation ---
  assign(cols) {
    const c = {};
    for (const n of this._names) c[n] = this._columns[n];
    const names = this._names.slice();
    for (const [k, v] of Object.entries(cols)) {
      c[k] = v;
      if (!names.includes(k)) names.push(k);
    }
    return new Table(c, names);
  }

  derive(exprs) {
    const cols = {};
    for (const [name, fn] of Object.entries(exprs)) {
      const arr = new Array(this._nrows);
      for (let i = 0; i < this._nrows; i++) {
        const row = {};
        for (const n of this._names) row[n] = this._columns[n][i];
        arr[i] = fn(row, i);
      }
      cols[name] = arr;
    }
    return this.assign(cols);
  }

  // --- aggregation ---
  rollup(exprs) {
    const c = {}, names = [];
    for (const [name, fn] of Object.entries(exprs)) {
      c[name] = [fn(this._columns[name] || this._collectRows())];
      names.push(name);
    }
    return new Table(c, names);
  }

  groupby(...cols) {
    return new GroupBy(this, cols);
  }

  // --- reshape ---
  pivot(keys, values, agg) {
    if (typeof keys === 'string') keys = [keys];
    if (typeof values === 'string') values = [values];
    // collect unique pivot keys
    const pivotCol = keys[keys.length - 1];
    const rowKeys = keys.slice(0, -1);
    const pivotVals = [...new Set(this._columns[pivotCol])];

    const groups = new Map();
    for (let i = 0; i < this._nrows; i++) {
      const rk = rowKeys.map(k => this._columns[k][i]).join('\x00');
      if (!groups.has(rk)) groups.set(rk, { keyVals: rowKeys.map(k => this._columns[k][i]), buckets: new Map() });
      const g = groups.get(rk);
      const pv = this._columns[pivotCol][i];
      if (!g.buckets.has(pv)) g.buckets.set(pv, {});
      for (const v of values) {
        if (!g.buckets.get(pv)[v]) g.buckets.get(pv)[v] = [];
        g.buckets.get(pv)[v].push(this._columns[v][i]);
      }
    }

    const outCols = {};
    const outNames = [...rowKeys];
    for (const n of rowKeys) outCols[n] = [];
    for (const pv of pivotVals) {
      for (const v of values) {
        const colName = values.length === 1 ? String(pv) : `${v}_${pv}`;
        outNames.push(colName);
        outCols[colName] = [];
      }
    }

    for (const [, g] of groups) {
      for (let ki = 0; ki < rowKeys.length; ki++) outCols[rowKeys[ki]].push(g.keyVals[ki]);
      for (const pv of pivotVals) {
        for (const v of values) {
          const colName = values.length === 1 ? String(pv) : `${v}_${pv}`;
          const arr = g.buckets.get(pv)?.[v];
          outCols[colName].push(arr ? agg(arr) : null);
        }
      }
    }
    return new Table(outCols, outNames);
  }

  fold(cols, opts = {}) {
    const keyName = opts.key || 'key';
    const valueName = opts.value || 'value';
    const keep = this._names.filter(n => !cols.includes(n));
    const outCols = {};
    for (const n of keep) outCols[n] = [];
    outCols[keyName] = [];
    outCols[valueName] = [];

    for (let i = 0; i < this._nrows; i++) {
      for (const col of cols) {
        for (const n of keep) outCols[n].push(this._columns[n][i]);
        outCols[keyName].push(col);
        outCols[valueName].push(this._columns[col][i]);
      }
    }
    return new Table(outCols, [...keep, keyName, valueName]);
  }

  // --- combine ---
  concat(...tables) {
    const c = {};
    for (const n of this._names) {
      c[n] = this._columns[n].slice();
      for (const t of tables) {
        c[n] = c[n].concat(t._columns[n] || new Array(t._nrows).fill(null));
      }
    }
    return new Table(c, this._names.slice());
  }

  join(right, on, opts) { return join(this, right, on, opts); }
  join_left(right, on, opts) { return join(this, right, on, { ...opts, how: 'left' }); }
  join_right(right, on, opts) { return join(this, right, on, { ...opts, how: 'right' }); }
  join_full(right, on, opts) { return join(this, right, on, { ...opts, how: 'full' }); }
  semijoin(right, on) { return semijoin(this, right, on); }
  antijoin(right, on) { return antijoin(this, right, on); }

  // --- export ---
  toCSV(opts = {}) {
    const sep = opts.sep || ',';
    const lines = [this._names.join(sep)];
    for (let i = 0; i < this._nrows; i++) {
      lines.push(this._names.map(n => {
        const v = this._columns[n][i];
        return v == null ? '' : String(v);
      }).join(sep));
    }
    return lines.join('\n');
  }

  toJSON(orient) {
    if (orient === 'columns') {
      const out = {};
      for (const n of this._names) out[n] = this._columns[n].slice();
      return out;
    }
    return this.objects();
  }

  // --- internal ---
  _take(indices) {
    const c = {};
    for (const n of this._names) {
      const src = this._columns[n];
      c[n] = indices.map(i => src[i]);
    }
    return new Table(c, this._names.slice());
  }

  _collectRows() {
    const rows = [];
    for (let i = 0; i < this._nrows; i++) {
      const row = {};
      for (const n of this._names) row[n] = this._columns[n][i];
      rows.push(row);
    }
    return rows;
  }
}

// -- groupby.js --

// groupby.js — GroupBy (split-apply-combine via Map)


class GroupBy {
  constructor(table, keys) {
    this._table = table;
    this._keys = keys;
    this._groups = null;
  }

  _build() {
    if (this._groups) return this._groups;
    const groups = new Map();
    const t = this._table;
    for (let i = 0; i < t._nrows; i++) {
      const gk = this._keys.map(k => t._columns[k][i]).join('\x00');
      if (!groups.has(gk)) groups.set(gk, {
        keyVals: this._keys.map(k => t._columns[k][i]),
        indices: [],
      });
      groups.get(gk).indices.push(i);
    }
    this._groups = groups;
    return groups;
  }

  rollup(exprs) {
    const groups = this._build();
    const t = this._table;
    const cols = {};
    const names = [...this._keys, ...Object.keys(exprs)];
    for (const n of names) cols[n] = [];

    for (const [, g] of groups) {
      for (let ki = 0; ki < this._keys.length; ki++) {
        cols[this._keys[ki]].push(g.keyVals[ki]);
      }
      for (const [name, fn] of Object.entries(exprs)) {
        const srcCol = t._columns[name];
        if (srcCol) {
          cols[name].push(fn(g.indices.map(i => srcCol[i])));
        } else {
          cols[name].push(fn(g.indices.map(i => {
            const row = {};
            for (const n of t._names) row[n] = t._columns[n][i];
            return row;
          })));
        }
      }
    }
    return new Table(cols, names);
  }

  count() {
    return this.rollup({ count: a => a.length });
  }
}

// -- join.js --

// join.js — join / semijoin / antijoin (hash join)


function join(left, right, on, opts = {}) {
  const how = opts.how || 'inner';
  const lkey = Array.isArray(on) ? on[0] : on;
  const rkey = Array.isArray(on) ? on[1] : on;

  // build hash of right table
  const rmap = new Map();
  for (let i = 0; i < right._nrows; i++) {
    const k = right._columns[rkey][i];
    if (!rmap.has(k)) rmap.set(k, []);
    rmap.get(k).push(i);
  }

  const lIdx = [], rIdx = [];
  const rMatched = new Set();
  for (let i = 0; i < left._nrows; i++) {
    const k = left._columns[lkey][i];
    const matches = rmap.get(k);
    if (matches) {
      for (const j of matches) { lIdx.push(i); rIdx.push(j); rMatched.add(j); }
    } else if (how === 'left' || how === 'full') {
      lIdx.push(i); rIdx.push(-1);
    }
  }
  if (how === 'right' || how === 'full') {
    for (let j = 0; j < right._nrows; j++) {
      if (!rMatched.has(j)) {
        lIdx.push(-1); rIdx.push(j);
      }
    }
  }

  // assemble output columns
  const c = {}, names = [];
  for (const n of left._names) {
    c[n] = lIdx.map(i => i >= 0 ? left._columns[n][i] : null);
    names.push(n);
  }
  for (const n of right._names) {
    if (n === rkey && rkey === lkey) continue;
    const out = names.includes(n) ? n + '_r' : n;
    c[out] = rIdx.map(j => j >= 0 ? right._columns[n][j] : null);
    names.push(out);
  }
  return new Table(c, names);
}

function semijoin(left, right, on) {
  const rkey = Array.isArray(on) ? on[1] : on;
  const lkey = Array.isArray(on) ? on[0] : on;
  const rset = new Set(right._columns[rkey]);
  return left.filter(row => rset.has(row[lkey]));
}

function antijoin(left, right, on) {
  const rkey = Array.isArray(on) ? on[1] : on;
  const lkey = Array.isArray(on) ? on[0] : on;
  const rset = new Set(right._columns[rkey]);
  return left.filter(row => !rset.has(row[lkey]));
}

// -- io.js --

// io.js — CSV parse/serialize


function csv(text, opts = {}) {
  const sep = opts.sep || ',';
  const lines = text.trim().split('\n');
  if (lines.length === 0) return new Table({}, []);
  const header = opts.header !== false;
  const names = header
    ? lines[0].split(sep).map(s => s.trim().replace(/^"|"$/g, ''))
    : lines[0].split(sep).map((_, i) => `col${i}`);
  const start = header ? 1 : 0;
  const cols = {};
  for (const n of names) cols[n] = [];

  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(sep);
    for (let j = 0; j < names.length; j++) {
      let v = (vals[j] || '').trim().replace(/^"|"$/g, '');
      const num = Number(v);
      cols[names[j]].push(v === '' ? null : isNaN(num) ? v : num);
    }
  }
  return new Table(cols, names);
}

function toCSV(table, opts = {}) {
  return table.toCSV(opts);
}

// -- accessors.js --

// accessors.js — pandas-shape indexers (iloc, loc, at, iat) + RangeIndex.
//
// Pandas exposes four indexer accessors on DataFrames and Series. Each
// has slightly different semantics — they're kept as separate classes
// here rather than one indexer-with-modes so the resolution rules read
// straight off each class. All accessors return:
//
//   scalar row + scalar col  → scalar value
//   scalar row + plural col  → Series (row vector)
//   plural row + scalar col  → Series (column vector)
//   plural row + plural col  → DataFrame
//
// "Plural" = slice or list. The `_Selector` shape captures both the
// resolved index list and whether the original key was scalar — needed
// to decide return shape after resolution.
//
// iloc / iat treat keys as integer positions (negative = from end);
// loc / at treat keys as labels. With sadpan's default RangeIndex
// (rows labelled 0..n-1) the two collapse for row indexing; they diverge
// for columns where iloc takes integer position and loc takes column
// name. at / iat are scalar-only specialisations that raise on slices
// or lists — same as pandas.
//
// Importers: api.js wires `get iloc()` / `get loc()` etc. on DataFrame
// and Series; series.js needs only a subset (no column dimension).

// ── Internal selector shape ──
//
// _Selector = { indices: number[], scalar: boolean }
//   - indices: resolved positions in the underlying dimension
//   - scalar:  true iff the key was a single value (informs return type)

function _isSlice(k) { return k != null && k._slice === true; }
function _isPyKwargs(k) { return k != null && typeof k === 'object' && k._kw === true; }

function _resolveSliceToIndices(slice, n) {
  // Python-style slice with clamping: `arr[2:7]` on a 5-element array
  // yields indices [2, 3, 4] (not [2,3,4,5,6]). Both bounds clip to
  // [0, n] (or [-1, n-1] when step<0).
  const step = slice.step != null ? slice.step : 1;
  if (step === 0) throw new Error('slice step cannot be zero');
  let lo, hi;
  if (step > 0) {
    lo = slice.lower != null ? (slice.lower < 0 ? n + slice.lower : slice.lower) : 0;
    hi = slice.upper != null ? (slice.upper < 0 ? n + slice.upper : slice.upper) : n;
    if (lo < 0) lo = 0;
    if (hi > n) hi = n;
  } else {
    lo = slice.lower != null ? (slice.lower < 0 ? n + slice.lower : slice.lower) : n - 1;
    hi = slice.upper != null ? (slice.upper < 0 ? n + slice.upper : slice.upper) : -1;
    if (lo > n - 1) lo = n - 1;
    if (hi < -1) hi = -1;
  }
  const out = [];
  if (step > 0) for (let i = lo; i < hi; i += step) out.push(i);
  else for (let i = lo; i > hi; i += step) out.push(i);
  return out;
}

// ── iloc / iat — integer-position resolution ──

function _resolveByPosition(key, n) {
  if (typeof key === 'number') {
    const i = key < 0 ? n + key : key;
    if (i < 0 || i >= n) throw new Error(`positional index ${key} out of bounds for axis of length ${n}`);
    return { indices: [i], scalar: true };
  }
  if (_isSlice(key)) {
    return { indices: _resolveSliceToIndices(key, n), scalar: false };
  }
  if (Array.isArray(key)) {
    const idx = key.map(k => {
      if (typeof k !== 'number') throw new Error(`iloc list must contain integers, got ${typeof k}`);
      return k < 0 ? n + k : k;
    });
    return { indices: idx, scalar: false };
  }
  throw new Error(`unsupported iloc key type: ${typeof key}`);
}

// ── loc / at — label-based column resolution; row index lookup ──

function _resolveColByLabel(key, names) {
  if (typeof key === 'string') {
    const i = names.indexOf(key);
    if (i < 0) throw new Error(`column '${key}' not in DataFrame`);
    return { indices: [i], scalar: true };
  }
  if (_isSlice(key)) {
    // Pandas treats loc slices as INCLUSIVE on both ends, by label.
    // With default RangeIndex columns are anonymous → fall back to
    // integer positions when bounds are numeric, otherwise to label
    // lookup (find name → use that index).
    const lo = key.lower != null ? _labelToPos(key.lower, names) : 0;
    const hi = key.upper != null ? _labelToPos(key.upper, names) : names.length - 1;
    const step = key.step != null ? key.step : 1;
    const indices = [];
    if (step > 0) for (let i = lo; i <= hi; i += step) indices.push(i);
    else for (let i = lo; i >= hi; i += step) indices.push(i);
    return { indices, scalar: false };
  }
  if (Array.isArray(key)) {
    return {
      indices: key.map(k => _labelToPos(k, names)),
      scalar: false,
    };
  }
  throw new Error(`unsupported loc col key type: ${typeof key}`);
}

function _labelToPos(label, names) {
  if (typeof label === 'number') {
    const i = label < 0 ? names.length + label : label;
    if (i < 0 || i >= names.length) throw new Error(`column position ${label} out of bounds`);
    return i;
  }
  const i = names.indexOf(label);
  if (i < 0) throw new Error(`column '${label}' not in DataFrame`);
  return i;
}

// BooleanMask / boolean-array detection — accepts sadpan's BooleanMask
// shape ({_values: boolean[]}) or a plain JS array of booleans.
function _isBoolMask(key) {
  if (key && key._values && Array.isArray(key._values)
      && key._values.length > 0
      && typeof key._values[0] === 'boolean') return true;
  if (Array.isArray(key) && key.length > 0 && typeof key[0] === 'boolean') return true;
  return false;
}
function _maskToIndices(key) {
  const vals = key._values || key;
  const out = [];
  for (let i = 0; i < vals.length; i++) if (vals[i]) out.push(i);
  return out;
}

// Row resolution for loc: with default RangeIndex (rows 0..n-1) this is
// the same as positional resolution. When sadpan grows a real Index
// type with custom labels, this is the layer that needs to look up
// the label → position mapping.
function _resolveRowByLabel(key, n, index) {
  if (_isBoolMask(key)) {
    return { indices: _maskToIndices(key), scalar: false };
  }
  if (index && index._isRangeIndex !== true) {
    // Custom index — look up label
    if (typeof key === 'number' || typeof key === 'string') {
      const i = index._lookup(key);
      if (i < 0) throw new Error(`row label '${key}' not in index`);
      return { indices: [i], scalar: true };
    }
    if (Array.isArray(key)) {
      return {
        indices: key.map(k => {
          const i = index._lookup(k);
          if (i < 0) throw new Error(`row label '${k}' not in index`);
          return i;
        }),
        scalar: false,
      };
    }
    if (_isSlice(key)) {
      // Inclusive label slice — map to positions then iterate
      const lo = key.lower != null ? index._lookup(key.lower) : 0;
      const hi = key.upper != null ? index._lookup(key.upper) : n - 1;
      const step = key.step != null ? key.step : 1;
      const indices = [];
      if (step > 0) for (let i = lo; i <= hi; i += step) indices.push(i);
      else for (let i = lo; i >= hi; i += step) indices.push(i);
      return { indices, scalar: false };
    }
  }
  // Default RangeIndex — fall through to positional, but loc slices are
  // INCLUSIVE on both ends (pandas semantic).
  if (_isSlice(key)) {
    const lo = key.lower != null ? (key.lower < 0 ? n + key.lower : key.lower) : 0;
    const hi = key.upper != null ? (key.upper < 0 ? n + key.upper : key.upper) : n - 1;
    const step = key.step != null ? key.step : 1;
    const indices = [];
    if (step > 0) for (let i = lo; i <= hi; i += step) indices.push(i);
    else for (let i = lo; i >= hi; i += step) indices.push(i);
    return { indices, scalar: false };
  }
  return _resolveByPosition(key, n);
}

// ── DataFrame indexers ──
//
// All four follow the same shape: __getitem__(key) resolves into row
// and column selectors, then `_project(rows, cols)` materialises.

class _DfIndexer {
  constructor(df, resolveRow, resolveCol, scalarOnly) {
    this._df = df;
    this._resolveRow = resolveRow;
    this._resolveCol = resolveCol;
    this._scalarOnly = !!scalarOnly;
  }

  __getitem__(key) {
    const tbl = this._df._tbl;
    const names = tbl.columnNames();
    const nrows = tbl.numRows();
    const rowKey = Array.isArray(key) && key.length === 2 ? key[0] : key;
    const colKey = Array.isArray(key) && key.length === 2 ? key[1] : null;

    const rowSel = this._resolveRow(rowKey, nrows, this._df._index);
    // _resolveCol signatures differ: position-based takes a length,
    // label-based takes the names array (it needs the names to look up
    // labels). Branch on which resolver was wired in.
    const colSel = colKey != null
      ? this._resolveColInternal(colKey, names)
      : { indices: names.map((_, i) => i), scalar: false };

    if (this._scalarOnly && (!rowSel.scalar || !colSel.scalar)) {
      throw new Error('at/iat only accept scalar keys');
    }

    return this._project(rowSel, colSel);
  }

  _resolveColInternal(key, names) {
    // Integer-position resolvers want a length; label resolvers want
    // the names array. Detect by reference equality (the factories
    // wire either _resolveByPosition or _resolveColByLabel).
    if (this._resolveCol === _resolveByPosition) return this._resolveCol(key, names.length);
    return this._resolveCol(key, names);
  }

  __setitem__(key, value) {
    const tbl = this._df._tbl;
    const names = tbl.columnNames();
    const nrows = tbl.numRows();
    const rowKey = Array.isArray(key) && key.length === 2 ? key[0] : key;
    const colKey = Array.isArray(key) && key.length === 2 ? key[1] : null;

    const rowSel = this._resolveRow(rowKey, nrows, this._df._index);
    const colSel = colKey != null
      ? this._resolveColInternal(colKey, names)
      : { indices: names.map((_, i) => i), scalar: false };

    // Broadcast value to the selection. Scalar value → fill every
    // selected cell; iterable → must match selection cardinality.
    const isIterable = value != null
      && typeof value !== 'string'
      && typeof value[Symbol.iterator] === 'function';

    if (!isIterable) {
      for (const ri of rowSel.indices) {
        for (const ci of colSel.indices) {
          const colName = names[ci];
          tbl._columns[colName][ri] = value;
        }
      }
      return;
    }

    const flat = [...value];
    // Single-column case: flat values map to rows
    if (colSel.indices.length === 1) {
      const colName = names[colSel.indices[0]];
      if (flat.length !== rowSel.indices.length) {
        throw new Error(`length mismatch: assigning ${flat.length} values to ${rowSel.indices.length} rows`);
      }
      for (let i = 0; i < flat.length; i++) {
        tbl._columns[colName][rowSel.indices[i]] = flat[i];
      }
      return;
    }
    // Single-row case: flat values map to cols
    if (rowSel.indices.length === 1) {
      if (flat.length !== colSel.indices.length) {
        throw new Error(`length mismatch: assigning ${flat.length} values to ${colSel.indices.length} columns`);
      }
      for (let i = 0; i < flat.length; i++) {
        const colName = names[colSel.indices[i]];
        tbl._columns[colName][rowSel.indices[0]] = flat[i];
      }
      return;
    }
    throw new Error('multi-row multi-col assignment from iterable not supported — pass a scalar instead');
  }

  // Materialise the selection. Return type depends on scalarness:
  //   scalar+scalar → value
  //   scalar+plural → Series (row vector, one element per selected col)
  //   plural+scalar → Series (column vector)
  //   plural+plural → DataFrame
  _project(rowSel, colSel) {
    const tbl = this._df._tbl;
    const names = tbl.columnNames();

    if (rowSel.scalar && colSel.scalar) {
      const ri = rowSel.indices[0];
      const ci = colSel.indices[0];
      return tbl._columns[names[ci]][ri];
    }

    if (rowSel.scalar) {
      // Row vector across selected columns → Series indexed by col name
      const ri = rowSel.indices[0];
      const values = colSel.indices.map(ci => tbl._columns[names[ci]][ri]);
      return this._df._makeSeriesLike(values, colSel.indices.map(ci => names[ci]));
    }

    if (colSel.scalar) {
      // Column vector → Series with the column name
      const ci = colSel.indices[0];
      const colName = names[ci];
      const values = rowSel.indices.map(ri => tbl._columns[colName][ri]);
      return this._df._makeSeriesLike(values, null, colName);
    }

    // Both plural → DataFrame
    const outCols = {};
    const outNames = [];
    for (const ci of colSel.indices) {
      const colName = names[ci];
      outNames.push(colName);
      outCols[colName] = rowSel.indices.map(ri => tbl._columns[colName][ri]);
    }
    return this._df._makeFrameLike(outCols, outNames);
  }
}

// ── Series indexers (one-dim) ──
//
// Series.iloc[i], Series.iloc[i:j], Series.iloc[[i, j]]. loc differs
// only when the series has a custom index; with default RangeIndex
// it's positional.

class _SeriesIndexer {
  constructor(series, resolve, scalarOnly) {
    this._s = series;
    this._resolve = resolve;
    this._scalarOnly = !!scalarOnly;
  }

  __getitem__(key) {
    const values = this._s._values;
    const sel = this._resolve(key, values.length, this._s._index);
    if (this._scalarOnly && !sel.scalar) {
      throw new Error('at/iat only accept scalar keys');
    }
    if (sel.scalar) return values[sel.indices[0]];
    return this._s._makeLike(sel.indices.map(i => values[i]));
  }

  __setitem__(key, value) {
    const values = this._s._values;
    const sel = this._resolve(key, values.length, this._s._index);
    if (this._scalarOnly && !sel.scalar) {
      throw new Error('at/iat only accept scalar keys');
    }
    const isIterable = value != null
      && typeof value !== 'string'
      && typeof value[Symbol.iterator] === 'function';
    if (!isIterable) {
      for (const i of sel.indices) values[i] = value;
      return;
    }
    const flat = [...value];
    if (flat.length !== sel.indices.length) {
      throw new Error(`length mismatch: assigning ${flat.length} values to ${sel.indices.length} positions`);
    }
    for (let i = 0; i < flat.length; i++) values[sel.indices[i]] = flat[i];
  }
}

// ── RangeIndex / labelled Index ──

class _RangeIndex {
  constructor(n) { this._n = n; this._isRangeIndex = true; }
  get name() { return null; }
  get size() { return this._n; }
  get values() { return this.tolist(); }
  __len__() { return this._n; }
  __getitem__(key) {
    if (typeof key === 'number') {
      const i = key < 0 ? this._n + key : key;
      if (i < 0 || i >= this._n) throw new Error(`index ${key} out of bounds`);
      return i;
    }
    if (_isSlice(key)) {
      return _resolveSliceToIndices(key, this._n);
    }
    throw new Error(`unsupported index key: ${typeof key}`);
  }
  __iter__() { return this[Symbol.iterator](); }
  *[Symbol.iterator]() { for (let i = 0; i < this._n; i++) yield i; }
  tolist() { const a = new Array(this._n); for (let i = 0; i < this._n; i++) a[i] = i; return a; }
  toString() { return `RangeIndex(start=0, stop=${this._n}, step=1)`; }
}

// Labelled index — kept for when sadpan gets explicit row labels.
// _lookup(label) returns the position or -1.
class _Index {
  constructor(labels, name) {
    this._labels = Array.isArray(labels) ? labels.slice() : [...labels];
    this._name = name || null;
    this._lut = new Map();
    for (let i = 0; i < this._labels.length; i++) this._lut.set(this._labels[i], i);
  }
  get name() { return this._name; }
  get size() { return this._labels.length; }
  get values() { return this._labels.slice(); }
  __len__() { return this._labels.length; }
  __getitem__(key) {
    if (typeof key === 'number') {
      const i = key < 0 ? this._labels.length + key : key;
      return this._labels[i];
    }
    if (_isSlice(key)) {
      return _resolveSliceToIndices(key, this._labels.length).map(i => this._labels[i]);
    }
    throw new Error(`unsupported index key: ${typeof key}`);
  }
  _lookup(label) {
    return this._lut.has(label) ? this._lut.get(label) : -1;
  }
  *[Symbol.iterator]() { yield* this._labels; }
  tolist() { return this._labels.slice(); }
  toString() { return `Index(${this._labels.length} labels)`; }
}

// ── Factory functions — wire up the indexers for a given DataFrame ──

function makeIloc(df) {
  return new _DfIndexer(df, _resolveByPosition, _resolveByPosition, false);
}
function makeLoc(df) {
  return new _DfIndexer(df, _resolveRowByLabel, _resolveColByLabel, false);
}
function makeAt(df) {
  return new _DfIndexer(df, _resolveRowByLabel, _resolveColByLabel, true);
}
function makeIat(df) {
  return new _DfIndexer(df, _resolveByPosition, _resolveByPosition, true);
}

function makeSeriesIloc(series) {
  return new _SeriesIndexer(series, _resolveByPosition, false);
}
function makeSeriesLoc(series) {
  return new _SeriesIndexer(series, _resolveRowByLabel, false);
}
function makeSeriesAt(series) {
  return new _SeriesIndexer(series, _resolveRowByLabel, true);
}
function makeSeriesIat(series) {
  return new _SeriesIndexer(series, _resolveByPosition, true);
}

// -- api.js --

// api.js — factories, op helpers, DataFrame wrapper, registration







// ── plt lookup ──
//
// `df.plot(...)` proxies to plt without taking a hard dep on @gcu/plot.
// We probe window._auditableExtensions['plt'] (the adder extension slot)
// and fall back to window._importCache for direct module instances.
function _findPlt() {
  if (typeof window === 'undefined') return null;
  if (window._auditableExtensions?.plt) return window._auditableExtensions.plt;
  if (window._importCache) {
    for (const mod of Object.values(window._importCache)) {
      if (mod && typeof mod.subplots === 'function' && typeof mod.plot === 'function') return mod;
    }
  }
  return null;
}

// ── html helpers ──

function _escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _fmtNum(v) { return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, ''); }

// ── factories ──

function table(columns) {
  return new Table(columns);
}

function from(rows) {
  if (!rows || rows.length === 0) return new Table({}, []);
  const names = Object.keys(rows[0]);
  const columns = {};
  for (const n of names) columns[n] = [];
  for (const row of rows) {
    for (const n of names) columns[n].push(row[n] !== undefined ? row[n] : null);
  }
  return new Table(columns, names);
}

function series(values, name) {
  return new Series(values, name);
}

function concat(...tables) {
  if (tables.length === 0) return new Table({}, []);
  if (tables.length === 1 && Array.isArray(tables[0])) tables = tables[0];
  return tables[0].concat(...tables.slice(1));
}

function merge(left, right, on, opts) {
  return join(left, right, on, opts);
}

// ── op helpers ──

const op = {
  sum: (arr) => { let s = 0; for (const v of arr) if (v != null) s += v; return s; },
  mean: (arr) => { let s = 0, n = 0; for (const v of arr) if (v != null) { s += v; n++; } return n ? s / n : NaN; },
  median: (arr) => {
    const sorted = arr.filter(v => v != null).sort((a, b) => a - b);
    const n = sorted.length;
    if (!n) return NaN;
    return n % 2 ? sorted[n >> 1] : (sorted[(n >> 1) - 1] + sorted[n >> 1]) / 2;
  },
  min: (arr) => { let m = Infinity; for (const v of arr) if (v != null && v < m) m = v; return m === Infinity ? NaN : m; },
  max: (arr) => { let m = -Infinity; for (const v of arr) if (v != null && v > m) m = v; return m === -Infinity ? NaN : m; },
  std: (arr) => {
    const m = op.mean(arr);
    let s = 0, n = 0;
    for (const v of arr) if (v != null) { s += (v - m) ** 2; n++; }
    return n > 1 ? Math.sqrt(s / (n - 1)) : 0;
  },
  variance: (arr) => {
    const m = op.mean(arr);
    let s = 0, n = 0;
    for (const v of arr) if (v != null) { s += (v - m) ** 2; n++; }
    return n > 1 ? s / (n - 1) : 0;
  },
  count: (arr) => { let n = 0; for (const v of arr) if (v != null) n++; return n; },
  first: (arr) => arr.length > 0 ? arr[0] : null,
  last: (arr) => arr.length > 0 ? arr[arr.length - 1] : null,
  quantile: (arr, p) => {
    const sorted = arr.filter(v => v != null).sort((a, b) => a - b);
    if (sorted.length === 0) return NaN;
    const i = p * (sorted.length - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  },
};

// ── DataFrame wrapper (for adder pandas API) ──

class DataFrame {
  constructor(data, columns, _index) {
    // pandas signature: DataFrame(data=None, index=None, columns=None, ...)
    // Adder calls it as:
    //   pd.DataFrame({...})                            → positional dict
    //   pd.DataFrame([{}, {}])                         → list of records
    //   pd.DataFrame(data=arr, columns=[...])          → kwargs only
    //   pd.DataFrame(arr, columns=[...])               → mixed
    // adder lands kwargs as a trailing {_kw: true, …} obj — could be in
    // any param slot depending on how the user typed it.
    let kw = null;
    for (const arg of [data, columns, _index]) {
      if (arg && typeof arg === 'object' && arg._kw) { kw = arg; break; }
    }
    if (kw) {
      data = kw.data !== undefined ? kw.data : data;
      columns = kw.columns !== undefined ? kw.columns : columns;
    }
    // Pull data out of natra ndarray / Float64Array with shape
    if (data && Array.isArray(data.shape) && data.shape.length === 2) {
      const nrows = data.shape[0];
      const ncols = data.shape[1];
      // Get a flat row-major Float64Array view (or null for unsupported)
      let flat = null;
      if (data instanceof Float64Array) flat = data;
      else if (data.data instanceof Float64Array) flat = data.data;
      else if (data._nd && data._arr) {
        // natra wrapper — read from WASM arena
        const a = data._arr;
        if (a.memory && a.memory.buffer && a.dtype === 'f64' && typeof a.ptr === 'number') {
          flat = new Float64Array(a.memory.buffer, a.ptr, nrows * ncols);
        } else if (a.data instanceof Float64Array) {
          flat = a.data;
        }
      } else if (typeof data.tolist === 'function') {
        // Last-resort: nested array via tolist
        const rows = data.tolist();
        if (Array.isArray(rows) && Array.isArray(rows[0])) {
          flat = new Float64Array(nrows * ncols);
          for (let i = 0; i < nrows; i++) {
            for (let j = 0; j < ncols; j++) flat[i * ncols + j] = rows[i][j];
          }
        }
      }
      if (flat) {
        const names = Array.isArray(columns) && columns.length === ncols
          ? columns.slice()
          : Array.from({ length: ncols }, (_, i) => String(i));
        const cols = {};
        for (let j = 0; j < ncols; j++) {
          const col = new Array(nrows);
          for (let i = 0; i < nrows; i++) col[i] = flat[i * ncols + j];
          cols[names[j]] = col;
        }
        this._tbl = new Table(cols, names);
        this.__adderClass__ = 'DataFrame';
        return;
      }
    }
    if (!data) this._tbl = new Table({}, []);
    else if (data instanceof Table) this._tbl = data;
    else if (Array.isArray(data)) this._tbl = from(data);
    else if (typeof data === 'object') this._tbl = table(data);
    // If columns is provided (and we built from a dict), rename to honor it.
    if (Array.isArray(columns) && data && !Array.isArray(data)
        && !(data instanceof Table)
        && Object.keys(data).length === columns.length) {
      const oldNames = this._tbl.columnNames();
      const map = {};
      for (let i = 0; i < columns.length; i++) map[oldNames[i]] = columns[i];
      this._tbl = this._tbl.rename(map);
    }
    this.__adderClass__ = 'DataFrame';
  }

  // dunders for adder
  __getitem__(key) {
    if (typeof key === 'string') return new WrapperSeries(this._tbl.array(key), key);
    if (Array.isArray(key)) return new DataFrame(this._tbl.select(...key));
    if (key instanceof BooleanMask) {
      const idx = [];
      for (let i = 0; i < key._values.length; i++) if (key._values[i]) idx.push(i);
      return new DataFrame(this._tbl._take(idx));
    }
    if (key && key._slice) {
      const start = key.lower || 0;
      const end = key.upper != null ? key.upper : this._tbl.numRows();
      return new DataFrame(this._tbl.slice(start, end));
    }
    return new WrapperSeries(this._tbl.array(key), key);
  }

  __setitem__(key, value) {
    if (value instanceof Series) value = value._values;
    // Coerce any iterable that isn't a JS Array (TypedArray, natra
    // ndarray, etc.) to a plain Array via Array.from. Scalars and
    // strings broadcast to fill every row. Without the coercion, a
    // natra-backed Series passed in would land as the WHOLE object
    // repeated nrows times — every cell rendering as [object Object].
    if (value != null
        && typeof value !== 'string'
        && typeof value[Symbol.iterator] === 'function') {
      if (!Array.isArray(value)) value = Array.from(value);
    } else {
      value = new Array(this._tbl.numRows()).fill(value);
    }
    this._tbl = this._tbl.assign({ [key]: value });
  }

  __len__() { return this._tbl.numRows(); }
  __contains__(key) { return this._tbl.columnNames().includes(key); }
  __repr__() { return this._tbl.print(10); }
  __str__() { return this._tbl.print(10); }

  _repr_html_() {
    const names = this._tbl.columnNames();
    const n = this._tbl.numRows();
    const maxRows = 20;
    const show = Math.min(n, maxRows);
    let html = '<table style="border-collapse:collapse;font-family:var(--mono,monospace);font-size:12px">';
    html += '<tr>' + names.map(c => `<th style="padding:3px 8px;border-bottom:2px solid var(--fg-dim,#666);text-align:left">${_escHtml(c)}</th>`).join('') + '</tr>';
    for (let i = 0; i < show; i++) {
      html += '<tr>' + names.map(c => {
        const v = this._tbl._columns[c][i];
        const align = typeof v === 'number' ? 'right' : 'left';
        const text = v == null ? '' : typeof v === 'number' ? _fmtNum(v) : _escHtml(String(v));
        return `<td style="padding:2px 8px;border-bottom:1px solid var(--bg-cell,#333);text-align:${align}">${text}</td>`;
      }).join('') + '</tr>';
    }
    html += '</table>';
    if (n > maxRows) html += `<div style="font-size:11px;color:var(--fg-dim,#888);margin-top:4px">\u2026 ${n} rows \u00d7 ${names.length} columns</div>`;
    else html += `<div style="font-size:11px;color:var(--fg-dim,#888);margin-top:4px">${n} rows \u00d7 ${names.length} columns</div>`;
    return html;
  }
  [Symbol.iterator]() { return this._tbl.columnNames()[Symbol.iterator](); }

  // properties (JS getters — work in both JS and adder)
  get shape() { return [this._tbl.numRows(), this._tbl.numCols()]; }
  get columns() { return this._tbl.columnNames(); }
  get ndim() { return 2; }
  get size() { return this._tbl.numRows() * this._tbl.numCols(); }
  get empty() { return this._tbl.numRows() === 0; }
  get dtypes() {
    // Best-effort dtype inference per column from the first non-null
    // sample — matches pandas's `df.dtypes` quick scan well enough
    // for `df.dtypes` printouts. Returns a Series of dtype strings.
    const names = this._tbl.columnNames();
    const types = names.map(c => {
      const arr = this._tbl.array(c);
      for (const v of arr) {
        if (v == null) continue;
        if (typeof v === 'number') return Number.isInteger(v) ? 'int64' : 'float64';
        if (typeof v === 'boolean') return 'bool';
        return 'object';
      }
      return 'object';
    });
    return new WrapperSeries(types, 'dtype');
  }
  get index() {
    if (!this._index) this._index = new _RangeIndex(this._tbl.numRows());
    return this._index;
  }
  // pandas exposes `.values` AND `.to_numpy()` (the latter is the
  // preferred name post-1.0). Same data shape: 2D nested list when
  // columns mix types, flat-typed otherwise. Returning a JS array of
  // arrays keeps consumers (natra.array, plt, sklearn) happy.
  get values() { return this._toNested(); }
  to_numpy(opts) {
    // opts.dtype / opts.copy are matplotlib-side hints; not honored here.
    return this._toNested();
  }
  _toNested() {
    const tbl = this._tbl;
    const names = tbl.columnNames();
    const nrows = tbl.numRows();
    const rows = new Array(nrows);
    for (let i = 0; i < nrows; i++) {
      const r = new Array(names.length);
      for (let j = 0; j < names.length; j++) r[j] = tbl._columns[names[j]][i];
      rows[i] = r;
    }
    return new _NumpyLikeArray2D(rows, names.length);
  }
  // pandas-shape indexers — lazy single-instance per DataFrame.
  get iloc() { if (!this._iloc) this._iloc = makeIloc(this); return this._iloc; }
  get loc()  { if (!this._loc)  this._loc  = makeLoc(this);  return this._loc;  }
  get at()   { if (!this._at)   this._at   = makeAt(this);   return this._at;   }
  get iat()  { if (!this._iat)  this._iat  = makeIat(this);  return this._iat;  }

  // Construction helpers used by the indexers — kept on the DataFrame
  // so the accessors don't need to import api.js (would be circular).
  _makeSeriesLike(values, indexLabels, name) {
    const s = new WrapperSeries(values, name || null);
    if (indexLabels) s._index = new _Index(indexLabels);
    return s;
  }
  _makeFrameLike(columns, names) {
    return new DataFrame(new Table(columns, names));
  }

  // Minimal `.plot()` — proxies to plt when available. Real matplotlib's
  // df.plot has dozens of kwargs (kind, ax, x, y, secondary_y, …); we
  // cover the common shapes (x=col, y=col, kind='line'|'scatter'|'bar')
  // and let users drop to plt directly for anything else.
  plot(opts) {
    const kw = (opts && opts._kw) ? opts : (opts || {});
    const kind = kw.kind || 'line';
    const xCol = kw.x;
    const yCol = kw.y;
    const plt = _findPlt();
    if (!plt) throw new Error('plt extension not loaded — call load("@gcu/plot") first');

    const tbl = this._tbl;
    const x = xCol ? tbl.array(xCol) : Array.from({ length: tbl.numRows() }, (_, i) => i);

    if (kind === 'scatter') {
      if (!yCol) throw new Error("df.plot(kind='scatter') requires y=");
      return plt.scatter(x, tbl.array(yCol), kw);
    }
    if (kind === 'bar') {
      const cols = yCol ? (Array.isArray(yCol) ? yCol : [yCol]) : tbl.columnNames().filter(n => n !== xCol);
      // Single bar series only for now — matplotlib's grouped bar is fiddly.
      return plt.bar(x, tbl.array(cols[0]), kw);
    }
    if (kind === 'hist') {
      const cols = yCol ? (Array.isArray(yCol) ? yCol : [yCol]) : tbl.columnNames();
      return plt.hist(tbl.array(cols[0]), kw);
    }
    // default: line plot — one column or many
    const cols = yCol ? (Array.isArray(yCol) ? yCol : [yCol]) : tbl.columnNames().filter(n => n !== xCol);
    if (cols.length === 1) return plt.plot(x, tbl.array(cols[0]), kw);
    // multiple columns → add each as a separate trace on a shared axes
    const sub = plt.subplots();
    const ax = sub.ax || sub[1];
    for (const c of cols) ax.plot(x, tbl.array(c), { ...kw, label: c });
    return (sub.fig || sub[0]).show();
  }

  // methods
  head(n) {
    if (n && typeof n === 'object' && n._kw) n = n.n;
    if (n == null) n = 5;
    return new DataFrame(this._tbl.slice(0, n));
  }
  tail(n) {
    if (n && typeof n === 'object' && n._kw) n = n.n;
    if (n == null) n = 5;
    return new DataFrame(this._tbl.slice(-n));
  }

  sort_values(by, opts) {
    let ascending = true;
    if (opts && opts._kw) ascending = opts.ascending !== false;
    else if (opts !== undefined) ascending = opts !== false;
    if (typeof by === 'string') by = [by];
    if (ascending) return new DataFrame(this._tbl.orderby(...by));
    return new DataFrame(this._tbl.orderby(...by.map(b => ({ [b]: 'desc' }))));
  }

  assign(cols) {
    // support both JS object and adder kwargs
    if (cols && cols._kw) {
      const { _kw, ...rest } = cols;
      cols = rest;
    }
    let tbl = this._tbl;
    for (const [k, v] of Object.entries(cols)) {
      let arr = v;
      if (typeof v === 'function') {
        const df = new DataFrame(tbl);
        arr = v(df);
      }
      if (arr instanceof Series) arr = arr._values;
      if (!Array.isArray(arr)) arr = new Array(tbl.numRows()).fill(arr);
      tbl = tbl.assign({ [k]: arr });
    }
    return new DataFrame(tbl);
  }

  groupby(by) {
    if (typeof by === 'string') by = [by];
    return new WrapperGroupBy(this._tbl.groupby(...by), by);
  }

  merge(right, opts) {
    let on = null, how = 'inner';
    if (opts && opts._kw) { on = opts.on; how = opts.how || 'inner'; }
    else if (typeof opts === 'string') { on = opts; }
    else if (opts) { on = opts.on; how = opts.how || 'inner'; }
    return new DataFrame(join(this._tbl, right._tbl, on, { how }));
  }

  semijoin(right, opts) {
    let on = null;
    if (opts && opts._kw) on = opts.on;
    else if (typeof opts === 'string') on = opts;
    else if (opts) on = opts.on;
    return new DataFrame(semijoin(this._tbl, right._tbl, on));
  }

  antijoin(right, opts) {
    let on = null;
    if (opts && opts._kw) on = opts.on;
    else if (typeof opts === 'string') on = opts;
    else if (opts) on = opts.on;
    return new DataFrame(antijoin(this._tbl, right._tbl, on));
  }

  filter(fn) { return new DataFrame(this._tbl.filter(fn)); }

  drop_duplicates(opts) {
    let subset = null;
    if (opts && opts._kw) subset = opts.subset;
    else if (opts) subset = opts.subset || opts;
    if (subset) return new DataFrame(this._tbl.dedupe(...(Array.isArray(subset) ? subset : [subset])));
    return new DataFrame(this._tbl.dedupe());
  }

  sample(opts) {
    let n = null, frac = null;
    if (opts && opts._kw) { n = opts.n; frac = opts.frac; }
    else if (typeof opts === 'number') n = opts;
    if (frac != null) n = Math.max(1, Math.floor(this._tbl.numRows() * frac));
    return new DataFrame(this._tbl.sample(n || 1));
  }

  dropna(opts) {
    let subset = null;
    if (opts && opts._kw) subset = opts.subset;
    const cols = subset || this._tbl.columnNames();
    return new DataFrame(this._tbl.filter((row) => {
      for (const c of cols) { const v = row[c]; if (v == null || v !== v) return false; }
      return true;
    }));
  }

  fillna(value) {
    const cols = {};
    for (const c of this._tbl.columnNames()) {
      const arr = this._tbl.array(c);
      cols[c] = arr.map(v => (v == null || v !== v) ? value : v);
    }
    return new DataFrame(table(cols));
  }

  select(...cols) { return new DataFrame(this._tbl.select(...cols)); }

  drop(labels, opts) {
    // pandas signatures we support:
    //   df.drop('col')                    → axis=1 default (columns)
    //   df.drop(['c1','c2'])
    //   df.drop('col', axis=1)
    //   df.drop(columns=['c1','c2'])      → infers axis=1
    //   df.drop(3, axis=0)                → drop row by label (RangeIndex → position)
    //   df.drop(index=[0,1])              → infers axis=0
    let axis = 1;
    let toRemove = labels;
    // Adder kwargs may arrive as the first arg (drop(columns=...)) or
    // as a trailing arg (drop('col', axis=1)).
    const kw = (opts && opts._kw) ? opts
             : (labels && typeof labels === 'object' && labels._kw) ? labels
             : null;
    if (kw) {
      if (kw.axis != null) axis = kw.axis;
      if (kw.columns != null) { axis = 1; toRemove = kw.columns; }
      else if (kw.index != null) { axis = 0; toRemove = kw.index; }
      else if (kw === labels && kw.labels != null) { toRemove = kw.labels; }
    }

    if (axis === 0) {
      // Drop rows. With default RangeIndex (labels 0..n-1) labels and
      // positions coincide; for custom indices we'd look up via _index.
      const rows = new Set(Array.isArray(toRemove) ? toRemove : [toRemove]);
      const keep = [];
      for (let i = 0; i < this._tbl.numRows(); i++) {
        if (!rows.has(i)) keep.push(i);
      }
      return new DataFrame(this._tbl._take(keep));
    }
    // axis === 1 — drop columns
    const cols = Array.isArray(toRemove) ? toRemove : [toRemove];
    return new DataFrame(this._tbl.drop(...cols));
  }

  rename(opts) {
    let columns = null;
    if (opts && opts._kw) columns = opts.columns;
    else columns = opts;
    return new DataFrame(this._tbl.rename(columns));
  }

  describe() {
    const numCols = this._tbl.columnNames().filter(n => {
      const arr = this._tbl.array(n);
      return arr.some(v => typeof v === 'number');
    });
    const stats = { stat: ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'] };
    for (const col of numCols) {
      const arr = this._tbl.array(col).filter(v => v != null && typeof v === 'number');
      stats[col] = [
        arr.length,
        op.mean(arr),
        op.std(arr),
        op.min(arr),
        op.quantile(arr, 0.25),
        op.quantile(arr, 0.5),
        op.quantile(arr, 0.75),
        op.max(arr),
      ];
    }
    return new DataFrame(table(stats));
  }

  apply(fn) {
    const result = {};
    for (const c of this._tbl.columnNames()) {
      result[c] = fn(new WrapperSeries(this._tbl.array(c), c));
    }
    return result;
  }

  pipe(fn, ...args) { return fn(this, ...args); }
  copy(opts) {
    // pandas's `deep` defaults to True; we always deep-copy because our
    // Table stores plain arrays per column and shallow-sharing them is
    // a footgun (mutations leak between "copies"). The `deep` kwarg is
    // accepted but ignored.
    const cols = {};
    for (const n of this._tbl.columnNames()) cols[n] = this._tbl.array(n).slice();
    return new DataFrame(new Table(cols, this._tbl.columnNames()));
  }
  to_records() { return this._tbl.objects(); }
  to_dict(orient) {
    if (orient === 'records') return this.to_records();
    const result = {};
    for (const c of this._tbl.columnNames()) result[c] = this._tbl.array(c).slice();
    return result;
  }
  // pandas signatures:
  //   df.to_csv()                  → return CSV text (sync)
  //   df.to_csv("path.csv")        → write to VFS, return Promise<null>
  //   df.to_csv("path.csv", sep=';', index=False) → as above with kwargs
  //   df.to_csv(sep=';')           → return CSV text with custom sep
  // Relative paths land under /projects/self/ (the notebook's project dir);
  // absolute paths (starting with /) are passed through verbatim.
  to_csv(pathOrOpts, opts) {
    let path = null;
    let kw = {};
    if (pathOrOpts != null && typeof pathOrOpts === 'object' && pathOrOpts._kw) {
      kw = pathOrOpts;
    } else {
      path = pathOrOpts;
      if (opts && opts._kw) kw = opts;
    }
    const text = this._tbl.toCSV(kw);
    if (path == null || path === '') return text;
    if (typeof path !== 'string') {
      throw new TypeError(`to_csv: expected path string, got ${typeof path}`);
    }
    if (typeof window === 'undefined' || !window._notebookVFS) {
      throw new Error('to_csv: VFS not available (no window._notebookVFS)');
    }
    const abs = path.startsWith('/') ? path : '/projects/self/' + path;
    return window._notebookVFS.writeFile(abs, text).then(() => null);
  }

  // Transpose — swap rows and columns. Column names become the row
  // index (we don't have a real index yet, so they map to integer-
  // labelled columns 0..nrows-1; the ORIGINAL column names get
  // collected and exposed via the result's `.index`). pandas's
  // df.T is the same operation.
  transpose() {
    const tbl = this._tbl;
    const names = tbl.columnNames();
    const nrows = tbl.numRows();
    const newColNames = [];
    for (let i = 0; i < nrows; i++) newColNames.push(String(i));
    const newCols = {};
    for (let i = 0; i < nrows; i++) {
      newCols[newColNames[i]] = names.map(n => tbl._columns[n][i]);
    }
    const out = new DataFrame(new Table(newCols, newColNames));
    out._index = new _Index(names);
    return out;
  }
  get T() { return this.transpose(); }

  // pandas internal — return a DataFrame with only the numeric columns.
  // sklearn / pandas code uses this to filter object / string columns
  // before fitting; pandas itself uses it for many built-in reductions.
  _get_numeric_data() {
    const numCols = this._tbl.columnNames().filter(n => {
      const arr = this._tbl.array(n);
      return arr.some(v => typeof v === 'number');
    });
    return new DataFrame(this._tbl.select(...numCols));
  }

  // pandas.DataFrame.corr(method='pearson') — pairwise Pearson
  // correlation between numeric columns. Returns a DataFrame indexed
  // by column name with the correlation matrix.
  corr(opts) {
    const _method = (opts && opts._kw && opts.method) || (typeof opts === 'string' ? opts : 'pearson');
    if (_method !== 'pearson') throw new Error('df.corr: only pearson is supported');
    // Numeric-only columns
    const numCols = this._tbl.columnNames().filter(n => {
      const arr = this._tbl.array(n);
      return arr.some(v => typeof v === 'number');
    });
    const colArrs = numCols.map(n => this._tbl.array(n).map(v => typeof v === 'number' ? v : NaN));
    const n = colArrs.length;
    // Pairwise Pearson r — n×n grid.
    const _r = (a, b) => {
      let sa = 0, sb = 0, k = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === a[i] && b[i] === b[i]) { sa += a[i]; sb += b[i]; k++; }
      }
      if (k === 0) return NaN;
      const ma = sa / k, mb = sb / k;
      let num = 0, da2 = 0, db2 = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === a[i] && b[i] === b[i]) {
          const da = a[i] - ma, db = b[i] - mb;
          num += da * db; da2 += da * da; db2 += db * db;
        }
      }
      return num / Math.sqrt(da2 * db2);
    };
    const cols = {};
    for (let i = 0; i < n; i++) {
      const colName = numCols[i];
      cols[colName] = [];
      for (let j = 0; j < n; j++) cols[colName].push(i === j ? 1 : _r(colArrs[i], colArrs[j]));
    }
    const out = new DataFrame(new Table(cols, numCols));
    out._index = new _Index(numCols);
    return out;
  }

  // pandas null detection — `isnull()` and `notna()` return a same-shape
  // DataFrame of booleans. `isnull().sum()` then yields per-column counts
  // (Series), and `.sum().sum()` reduces to a scalar.
  isnull() {
    const cols = {};
    for (const c of this._tbl.columnNames()) {
      cols[c] = this._tbl.array(c).map(v => v == null || (typeof v === 'number' && v !== v));
    }
    return new DataFrame(new Table(cols, this._tbl.columnNames()));
  }
  isna() { return this.isnull(); }
  notnull() {
    const cols = {};
    for (const c of this._tbl.columnNames()) {
      cols[c] = this._tbl.array(c).map(v => !(v == null || (typeof v === 'number' && v !== v)));
    }
    return new DataFrame(new Table(cols, this._tbl.columnNames()));
  }
  notna() { return this.notnull(); }

  // sum / mean / min / max / count along axis. axis=0 (default) reduces
  // each column → Series indexed by column name; axis=1 reduces each row
  // → Series of length nrows. Matches pandas default behavior.
  sum(axis) {
    if (axis && axis._kw) axis = axis.axis;
    axis = axis == null ? 0 : axis;
    if (axis === 0) {
      const out = [];
      for (const c of this._tbl.columnNames()) {
        out.push(this._tbl.array(c).reduce((s, v) => s + (v != null && typeof v !== 'boolean' ? v : v === true ? 1 : 0), 0));
      }
      const s = new WrapperSeries(out, null);
      s._index = new _Index(this._tbl.columnNames());
      return s;
    }
    if (axis === 1) {
      const out = [];
      const names = this._tbl.columnNames();
      for (let i = 0; i < this._tbl.numRows(); i++) {
        let s = 0;
        for (const c of names) {
          const v = this._tbl._columns[c][i];
          s += v != null && typeof v !== 'boolean' ? v : v === true ? 1 : 0;
        }
        out.push(s);
      }
      return new WrapperSeries(out, null);
    }
    throw new Error(`unsupported axis: ${axis}`);
  }
  mean(axis) {
    if (axis && axis._kw) axis = axis.axis;
    axis = axis == null ? 0 : axis;
    if (axis === 0) {
      const out = [];
      for (const c of this._tbl.columnNames()) {
        const arr = this._tbl.array(c);
        const nums = arr.filter(v => v != null && typeof v === 'number');
        out.push(nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : NaN);
      }
      const s = new WrapperSeries(out, null);
      s._index = new _Index(this._tbl.columnNames());
      return s;
    }
    throw new Error(`unsupported axis: ${axis}`);
  }
}

// ── _NumpyLikeArray2D — minimal numpy.ndarray stand-in for DataFrame.values
//                       / DataFrame.to_numpy() output ──
//
// Returns from df.values / df.to_numpy(). Provides the `.shape`, `.ndim`,
// `.size`, `.dtype` attributes that pandas's values/to_numpy promise (so
// downstream `arr.shape[0]` works) plus integer-position __getitem__ /
// __setitem__ that handle both single-axis and 2D tuple subscripts.
//
// Not a real ndarray — for proper numpy ops, callers should still pass
// this to `np.array(...)` to convert. We're matching the duck-shape for
// the common print-and-inspect patterns in scientific notebooks.

class _NumpyLikeArray2D {
  constructor(rows, ncols) {
    this._rows = rows;
    this.shape = [rows.length, ncols];
    this.ndim = 2;
    this.size = rows.length * ncols;
    this.dtype = 'object';
    // Python-side `type(x)` reads __adderClass__ from adder's
    // pyTypeName helper; without it every JS class shows as 'object'.
    this.__adderClass__ = 'ndarray';
    // Flat row-major Float64 view so learn / natra / scitra's input
    // dispatchers recognize this as a numpy-ndarray-shape object (they
    // check for `.data instanceof Float64Array && .shape`). Without it
    // these libraries fall through to "named-columns object" and treat
    // `_rows` as a feature name, which fails validation.
    let allNumeric = true;
    for (const row of rows) {
      for (const v of row) { if (typeof v !== 'number') { allNumeric = false; break; } }
      if (!allNumeric) break;
    }
    if (allNumeric) {
      const flat = new Float64Array(rows.length * ncols);
      for (let i = 0; i < rows.length; i++) {
        for (let j = 0; j < ncols; j++) flat[i * ncols + j] = rows[i][j];
      }
      // Hide internal _rows from key-iteration so sklearn-style probing
      // doesn't see it as a feature column.
      Object.defineProperty(this, '_rows', { value: rows, enumerable: false });
      Object.defineProperty(this, 'data', { value: flat, enumerable: false });
    }
  }

  __getitem__(key) {
    const nrows = this._rows.length;
    const ncols = this.shape[1];
    if (Array.isArray(key) && key.length === 2) {
      const [rk, ck] = key;
      // scalar [i, j] — return the cell
      if (typeof rk === 'number' && typeof ck === 'number') {
        const r = rk < 0 ? nrows + rk : rk;
        const c = ck < 0 ? ncols + ck : ck;
        return this._rows[r][c];
      }
      // scalar row + slice/list col → row vector
      if (typeof rk === 'number' && ck && ck._slice) {
        const r = rk < 0 ? nrows + rk : rk;
        const lo = ck.lower != null ? ck.lower : 0;
        const hi = ck.upper != null ? Math.min(ck.upper, ncols) : ncols;
        return this._rows[r].slice(lo, hi);
      }
      // slice row + scalar col → column vector
      if (rk && rk._slice && typeof ck === 'number') {
        const lo = rk.lower != null ? rk.lower : 0;
        const hi = rk.upper != null ? Math.min(rk.upper, nrows) : nrows;
        const c = ck < 0 ? ncols + ck : ck;
        const out = [];
        for (let i = lo; i < hi; i++) out.push(this._rows[i][c]);
        return out;
      }
      // slice row + slice col → 2D sub-array
      if (rk && rk._slice && ck && ck._slice) {
        const r0 = rk.lower != null ? rk.lower : 0;
        const r1 = rk.upper != null ? Math.min(rk.upper, nrows) : nrows;
        const c0 = ck.lower != null ? ck.lower : 0;
        const c1 = ck.upper != null ? Math.min(ck.upper, ncols) : ncols;
        const out = [];
        for (let i = r0; i < r1; i++) out.push(this._rows[i].slice(c0, c1));
        return new _NumpyLikeArray2D(out, c1 - c0);
      }
      throw new Error('unsupported tuple subscript shape on numpy-like array');
    }
    if (typeof key === 'number') {
      return this._rows[key < 0 ? nrows + key : key];
    }
    if (key && key._slice) {
      const lo = key.lower != null ? key.lower : 0;
      const hi = key.upper != null ? Math.min(key.upper, nrows) : nrows;
      const out = this._rows.slice(lo, hi);
      return new _NumpyLikeArray2D(out, ncols);
    }
    throw new Error(`unsupported key type on numpy-like array: ${typeof key}`);
  }

  __setitem__(key, value) {
    if (Array.isArray(key) && key.length === 2 && typeof key[0] === 'number' && typeof key[1] === 'number') {
      const r = key[0] < 0 ? this._rows.length + key[0] : key[0];
      const c = key[1] < 0 ? this.shape[1] + key[1] : key[1];
      this._rows[r][c] = value;
      return;
    }
    throw new Error('unsupported setitem on numpy-like array');
  }

  __len__() { return this._rows.length; }
  *[Symbol.iterator]() { yield* this._rows; }
  tolist() { return this._rows.map(r => r.slice()); }
  __repr__() { return `array(${JSON.stringify(this._rows.slice(0, 5))}${this._rows.length > 5 ? ', ...' : ''})`; }
  __str__() { return this.__repr__(); }
  toString() { return this.__repr__(); }
}

// ── WrapperSeries — extends Series with pandas-shape API ──
//
// Indexers and properties (.iloc / .loc / .at / .iat / .index / .size /
// .ndim / .to_numpy) live on the wrapper rather than the base Series
// so the bare query-style Series stays minimal. plot() also routes
// here via _findPlt.

class WrapperSeries extends Series {
  constructor(values, name) { super(values, name); }
  sort_values(ascending = true) { return this.sort(ascending); }
  value_counts() { return this.valueCounts(); }

  get ndim() { return 1; }
  get size() { return this._values.length; }
  get empty() { return this._values.length === 0; }
  get dtype() {
    for (const v of this._values) {
      if (v == null) continue;
      if (typeof v === 'number') return Number.isInteger(v) ? 'int64' : 'float64';
      if (typeof v === 'boolean') return 'bool';
      return 'object';
    }
    return 'object';
  }
  get shape() { return [this._values.length]; }
  get index() {
    if (!this._index) this._index = new _RangeIndex(this._values.length);
    return this._index;
  }
  to_numpy(_opts) { return this._values.slice(); }

  get iloc() { if (!this._iloc) this._iloc = makeSeriesIloc(this); return this._iloc; }
  get loc()  { if (!this._loc)  this._loc  = makeSeriesLoc(this);  return this._loc;  }
  get at()   { if (!this._at)   this._at   = makeSeriesAt(this);   return this._at;   }
  get iat()  { if (!this._iat)  this._iat  = makeSeriesIat(this);  return this._iat;  }

  // Used by Series-side indexers when projecting a sub-Series.
  _makeLike(values) { return new WrapperSeries(values, this._name); }

  // pandas-shape __getitem__ — supports:
  //   s[i]                 → scalar by position (default RangeIndex)
  //   s[label]             → scalar by label (custom Index)
  //   s[slice]             → sub-Series
  //   s[boolean_mask]      → filtered sub-Series
  //   s[[i1, i2, ...]]     → fancy indexing → sub-Series
  __getitem__(key) {
    if (key instanceof BooleanMask) {
      const out = [];
      for (let i = 0; i < this._values.length; i++) if (key._values[i]) out.push(this._values[i]);
      return this._makeLike(out);
    }
    if (key && key._slice) return this.iloc.__getitem__(key);
    if (Array.isArray(key)) return this.iloc.__getitem__(key);
    if (this._index && this._index._isRangeIndex !== true && typeof key !== 'number') {
      // Custom-indexed series: lookup by label
      return this.loc.__getitem__(key);
    }
    return this._values[key < 0 ? this._values.length + key : key];
  }

  __setitem__(key, value) {
    if (key && key._slice) return this.iloc.__setitem__(key, value);
    if (Array.isArray(key)) return this.iloc.__setitem__(key, value);
    if (this._index && this._index._isRangeIndex !== true && typeof key !== 'number') {
      return this.loc.__setitem__(key, value);
    }
    this._values[key < 0 ? this._values.length + key : key] = value;
  }

  plot(opts) {
    const kw = (opts && opts._kw) ? opts : (opts || {});
    const plt = _findPlt();
    if (!plt) throw new Error('plt extension not loaded — call load("@gcu/plot") first');
    const x = this._index && this._index._isRangeIndex !== true
      ? this._index.tolist()
      : Array.from({ length: this._values.length }, (_, i) => i);
    const kind = kw.kind || 'line';
    if (kind === 'bar') return plt.bar(x, this._values, kw);
    if (kind === 'hist') return plt.hist(this._values, kw);
    if (kind === 'scatter') return plt.scatter(x, this._values, kw);
    return plt.plot(x, this._values, kw);
  }
}

// ── WrapperGroupBy ──

class WrapperGroupBy {
  constructor(groupby, keys) {
    this._gb = groupby;
    this._keys = keys;
  }

  agg(exprs) {
    // map string aggregation names to op functions
    const mapped = {};
    for (const [name, fn] of Object.entries(exprs)) {
      mapped[name] = typeof fn === 'function' ? fn : op[fn];
    }
    return new DataFrame(this._gb.rollup(mapped));
  }

  mean() {
    const t = this._gb._table;
    const numCols = t.columnNames().filter(n => !this._keys.includes(n));
    const exprs = {};
    for (const c of numCols) exprs[c] = op.mean;
    return new DataFrame(this._gb.rollup(exprs));
  }

  sum() {
    const t = this._gb._table;
    const numCols = t.columnNames().filter(n => !this._keys.includes(n));
    const exprs = {};
    for (const c of numCols) exprs[c] = op.sum;
    return new DataFrame(this._gb.rollup(exprs));
  }

  count() { return new DataFrame(this._gb.count()); }
}

// ── top-level wrapper functions ──

// pandas.read_csv accepts a path/URL/file-like and reads the CSV text.
// Conditionally async — returns a Promise only when we actually need
// to fetch (http/https URL) or read VFS (absolute path). Inline CSV
// text returns a DataFrame synchronously so existing JS callers don't
// need to await. Adder users always await and get the right thing
// either way.
function read_csv(source, opts) {
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return (async () => {
        const resp = await fetch(trimmed);
        if (!resp.ok) throw new Error(`read_csv: HTTP ${resp.status} fetching ${trimmed}`);
        return new DataFrame(csv(await resp.text(), opts));
      })();
    }
    if (trimmed.startsWith('/') && typeof window !== 'undefined' && window._notebookVFS) {
      return (async () => {
        const text = await window._notebookVFS.readFile(trimmed, 'text');
        return new DataFrame(csv(text, opts));
      })();
    }
    // Bare filename — looks like a file path, not CSV text. Treat as
    // a VFS lookup under /projects/self/. Heuristic: single line, no commas
    // / tabs / semicolons, ends with a CSV-ish extension. Otherwise
    // assume the user passed inline CSV text and let csv() parse it.
    if (!trimmed.includes('\n') && !trimmed.includes(',')
        && !trimmed.includes('\t') && !trimmed.includes(';')
        && /\.(csv|tsv|txt)$/i.test(trimmed)
        && typeof window !== 'undefined' && window._notebookVFS) {
      return (async () => {
        const abs = '/projects/self/' + trimmed;
        try {
          const text = await window._notebookVFS.readFile(abs, 'text');
          return new DataFrame(csv(text, opts));
        } catch (e) {
          throw new Error(`read_csv: could not read '${trimmed}' from ${abs} — drop the file into the notebook's filesystem first`);
        }
      })();
    }
  }
  return new DataFrame(csv(source, opts));
}

function where(mask, a, b) {
  if (!(mask instanceof BooleanMask)) return mask ? a : b;
  return new Series(mask._values.map((v, i) => {
    const av = a instanceof Series ? a._values[i] : a;
    const bv = b instanceof Series ? b._values[i] : b;
    return v ? av : bv;
  }));
}

// ── registration ──

// pandas.plotting submodule — used as `import pandas.plotting as pd_plot`.
// Currently exposes scatter_matrix (pairwise scatter + diagonal hist),
// the only one Pyrcz-style notebooks reach for in practice.
const plotting = {
  scatter_matrix(df, opts) {
    const kw = (opts && opts._kw) ? opts : (opts || {});
    const plt = _findPlt();
    if (!plt) throw new Error('scatter_matrix: plt not loaded — call load("@gcu/plot") first');
    if (!df || !df._tbl) throw new Error('scatter_matrix: expected a DataFrame');
    const numCols = df._tbl.columnNames().filter(n => {
      const a = df._tbl.array(n);
      return a.some(v => typeof v === 'number');
    });
    const n = numCols.length;
    // Touching cells (gap 1px so the frames don't visually merge into
    // a single thick line) — matches pandas' scatter_matrix density.
    const sub = plt.subplots(n, n, { figsize: kw.figsize, gap: 1 });
    const axes = sub.axes || (Array.isArray(sub) ? sub[1] : []);
    // Per-edge margins (NOT uniform) so the plot area fills the cell:
    // only the left col reserves space for y-tick labels, only the
    // bottom row reserves space for x-tick labels, inner cells get
    // tight zero-margin rendering and span their full cell. The figure
    // itself carries the column names (set via _rowLabels/_colLabels
    // below) so per-cell axis labels aren't needed.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const ax = Array.isArray(axes[i]) ? axes[i][j] : axes[i * n + j];
        if (!ax) continue;
        ax._margins = {
          left:   j === 0       ? 22 : 0,
          right:  0,
          top:    0,
          bottom: i === n - 1   ? 18 : 0,
        };
        if (i !== n - 1) ax._hideXTicks = true;
        if (j !== 0) ax._hideYTicks = true;
        if (i === j) ax.hist(df._tbl.array(numCols[i]), { color: kw.color || '#4488ff' });
        else ax.scatter(df._tbl.array(numCols[j]), df._tbl.array(numCols[i]),
          { alpha: kw.alpha != null ? kw.alpha : 0.5, color: kw.color || '#4488ff' });
      }
    }
    // Column names live OUTSIDE the n×n grid (figure edges), matching
    // pandas: one column name per row on the left, one per column
    // along the bottom — never duplicated as per-cell axis labels.
    const fig = sub.fig || sub[0];
    fig._rowLabels = numCols.slice();
    fig._colLabels = numCols.slice();
    return fig.show();
  },
};

const sadpanModule = {
  // JS API
  table, from, csv, series, concat, merge, semijoin, antijoin, op,
  Table, Series, BooleanMask, GroupBy,
  // DataFrame wrapper API (for adder)
  DataFrame, read_csv, where, WrapperSeries, WrapperGroupBy,
  // pandas.plotting submodule
  plotting,
  // pandas-shape constants and helpers
  NaN: Number.NaN,
  NA: Number.NaN,   // pandas's NA marker — same scalar value for our purposes
  Index: _Index,
  RangeIndex: _RangeIndex,
  // pd.isna / pd.notna helpers
  isna: (v) => v == null || (typeof v === 'number' && v !== v),
  notna: (v) => !(v == null || (typeof v === 'number' && v !== v)),
};

if (typeof window !== 'undefined') {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/sadpan',
      version: '0.1.0',
      description: 'Column-oriented dataframe library',
      exports: { sadpan: sadpanModule },
    });
  } else {
    if (!window._auditableExtensions) window._auditableExtensions = {};
    window._auditableExtensions['sadpan'] = sadpanModule;
  }
}

export { table, from, csv, series, concat, merge, semijoin, antijoin, op,
  Table, Series, BooleanMask, GroupBy, DataFrame, read_csv, where };

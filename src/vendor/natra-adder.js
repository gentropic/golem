// ⚠ VENDORED — DO NOT EDIT. @gcu/natra's adder bridge (numpy-shaped module), copied from ../auditable/ext/natra/adder.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// natra/adder — numpy-compatible ndarray bridge for adder (Python) cells
// Registers as window._auditableExtensions['natra'] and ['numpy'].
// Uses cell hooks for implicit per-cell arena scoping.
//
// No static import of natra/index.js — in the browser, this module runs
// from a blob URL where relative imports can't resolve. Instead we find
// the already-loaded natra factory from _importCache (browser) or use
// dynamic import (Node.js tests).

// ── Module state ──

let _ctx = null;       // natra context (lazy-initialized)
let _activeOps = null;  // current cell's scope ops (set by hook)
let _initPromise = null;
let _natraFn = null;   // cached reference to natra() factory

// ── host attach (no window, no relative import) ──
// A host that is not the notebook — a Web Worker, a single-file app — hands the
// bridge its natra library instead of letting it search window._importCache or
// import('./index.js') (which a blob worker cannot resolve). Accepts the factory
// (`natra`) or the module that exports it. Call before the first array op.
export function attachNatra(lib) {
  const fn = typeof lib === 'function' ? lib : lib && lib.natra;
  if (typeof fn !== 'function') throw new TypeError('attachNatra: expected the natra factory or a module exporting `natra`');
  if (_ctx || _initPromise) throw new Error('attachNatra: natra is already initialized — attach before the first array op');
  _natraFn = fn;
}

// Arena scoping outside the notebook. The notebook scopes natra memory per CELL
// through window._adderCellHooks; a host with no cells scopes per RUN:
//   const s = await beginNatraScope();   … run(code, …) …   endNatraScope(s, keep);
// `keep` are NdArray values to survive (promoted out of the arena), e.g. the
// run's result values; everything else allocated in the run is freed. A fresh
// worker per run makes this optional (the arena dies with the worker).
export async function beginNatraScope() {
  await _ensureCtx();
  const { arena, ops } = _ctx._beginCellScope();
  const prevOps = _activeOps;
  _activeOps = ops;
  return { arena, prevOps };
}
export function endNatraScope(token, keep = []) {
  if (!token || !_ctx) return [];
  const live = keep.filter((v) => _isNd(v) && v._arr._arena === token.arena);
  const promoted = _ctx._endCellScope(token.arena, live.map((v) => v._arr));
  live.forEach((v, i) => { v._arr = promoted[i]; });
  _activeOps = token.prevOps;
  return keep;
}

async function _ensureCtx() {
  if (_ctx) return _ctx;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!_natraFn) {
      // browser: find natra in import cache (must be pre-loaded via load())
      if (typeof window !== 'undefined' && window._importCache) {
        for (const mod of Object.values(window._importCache)) {
          if (mod && typeof mod.natra === 'function') { _natraFn = mod.natra; break; }
        }
        if (!_natraFn) throw new Error('natra not loaded \u2014 call load("./ext/natra/index.js") first');
      } else {
        // Node.js tests: dynamic import (relative path resolves from this file)
        const mod = await import('./index.js');
        _natraFn = mod.natra;
      }
    }
    _ctx = await _natraFn();
    _registerHook();
    // The cell hook only fires from cell N+1 onward — the current
    // cell already passed `before()` while _ctx was still null, so
    // _activeOps wasn't set. Open a scope inline so this cell can
    // complete. The after-hook for this cell is a no-op (its hookState
    // was null), so the arena just lingers until the next cell's
    // `before` starts a fresh one. Minor leak, acceptable bootstrap.
    if (!_activeOps) {
      const { ops } = _ctx._beginCellScope();
      _activeOps = ops;
    }
    return _ctx;
  })();
  return _initPromise;
}

// ── Helpers ──

function _ops() {
  if (_activeOps) return _activeOps;
  throw new Error('natra: no active cell scope — operations must run inside a cell or with np.scope()');
}

function _raw(v) {
  if (v && v._nd) return v._arr;
  // sadpan's _NumpyLikeArray2D (from df.values / df.to_numpy) — convert
  // via tolist() into nested JS array, then promote through ctx.array.
  if (_ctx && v && typeof v.tolist === 'function' && Array.isArray(v.shape)) {
    return _ctx.array(v.tolist());
  }
  // Float64Array (or TypedArray) carrying an own `.shape` — common
  // when learn's transformers return a flat ndarray with shape tacked
  // on. Preserve the shape via ctx.array's opts.shape so matmul / dot
  // operate on the correct 2D form instead of seeing a flat 1D vector.
  if (_ctx && ArrayBuffer.isView(v) && Array.isArray(v.shape) && v.shape.length > 1) {
    return _ctx.array(Array.from(v), { shape: v.shape.slice() });
  }
  // Coerce plain JS arrays / TypedArrays into a natra ndarray so the
  // reduction ops (max/min/sum/mean/etc.) work on lists from outside
  // natra (e.g. plt.hist counts, user-built lists). Requires _ctx to
  // already exist — if it doesn't, return as-is and let the op fail.
  if (_ctx && (Array.isArray(v) || ArrayBuffer.isView(v))) {
    return _ctx.array(Array.isArray(v) ? v : Array.from(v));
  }
  return v;
}

function _isNd(v) {
  return v && v._nd === true;
}

// ── numpy-style printing (numpy's arrayprint: floatmode 'maxprec', precision 8,
// linewidth 75, threshold 1000, edgeitems 3). Twin copy in ext/line/adder.js —
// keep the two identical; test/numpy-parity holds both to real numpy.

function _npShortPos(x) {              // shortest unique, at most 8 fraction digits, trailing '.'
  let s = String(Math.abs(x));
  if (/e/.test(s)) s = Math.abs(x).toFixed(8);
  let [ip, fp = ''] = s.split('.');
  if (fp.length > 8) { [ip, fp = ''] = Math.abs(x).toFixed(8).split('.'); }
  fp = fp.replace(/0+$/, '');
  return [(x < 0 || Object.is(x, -0) ? '-' : '') + ip, fp];
}
function _npShortSci(x) {              // [int, frac, exp-digits, exp-sign]
  let s = Math.abs(x).toExponential();
  let [m, e] = s.split('e');
  let [ip, fp = ''] = m.split('.');
  if (fp.length > 8) { [m, e] = Math.abs(x).toExponential(8).split('e'); [ip, fp = ''] = m.split('.'); }
  fp = fp.replace(/0+$/, '');
  return [(x < 0 || Object.is(x, -0) ? '-' : '') + ip, fp, String(Math.abs(+e)), +e < 0 ? '-' : '+'];
}

function _npFloatFormatter(vals) {
  const fin = vals.filter(Number.isFinite);
  const nz = fin.filter((v) => v !== 0).map(Math.abs);
  let exp = false;
  if (nz.length) {
    const mx = Math.max(...nz), mn = Math.min(...nz);
    exp = mx >= 1e8 || mn < 1e-4 || mx / mn > 1e3;
  }
  let padL = 0, padR = 0, fmt;
  if (exp) {
    const parts = fin.map(_npShortSci);
    const prec = Math.max(0, ...parts.map((p) => p[1].length));
    const expSize = Math.max(2, ...parts.map((p) => p[2].length));
    padL = Math.max(0, ...parts.map((p) => p[0].length));
    padR = expSize + 2 + prec;
    fmt = (x) => {
      let [m, e] = Math.abs(x).toExponential(prec).split('e');
      if (prec === 0) m += '.';
      const [ip, fp] = m.split('.');
      const ii = (x < 0 || Object.is(x, -0) ? '-' : '') + ip;
      return ii.padStart(padL) + '.' + fp + 'e' + (+e < 0 ? '-' : '+') + String(Math.abs(+e)).padStart(expSize, '0');
    };
  } else {
    const parts = fin.map(_npShortPos);
    padL = Math.max(0, ...parts.map((p) => p[0].length));
    padR = Math.max(0, ...parts.map((p) => p[1].length));
    fmt = (x) => { const [ip, fp] = _npShortPos(x); return ip.padStart(padL) + '.' + fp.padEnd(padR); };
  }
  if (fin.length !== vals.length) {
    const neg = vals.some((v) => v === -Infinity) ? 1 : 0;
    padL = Math.max(padL, 3 - (padR + 1), 3 + neg - (padR + 1));
  }
  return (x) => {
    if (Number.isFinite(x)) return fmt(x);
    const s = Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
    return s.padStart(padL + padR + 1);
  };
}

// data: flat array of numbers; shape: dims; bool: print as True/False; repr: array(...) form
function _npFormat(data, shape, bool, repr) {
  const size = shape.reduce((a, b) => a * b, 1);
  if (size === 0) return repr ? `array([], dtype=${bool ? 'bool' : 'float64'})` : '[]';
  const prefix = repr ? 'array(' : '', suffix = repr ? ')' : '';
  const sep = repr ? ', ' : ' ';
  const width = 75 - suffix.length;
  const summary = size > 1000, EDGE = 3;
  const strides = shape.map((_, i) => shape.slice(i + 1).reduce((a, b) => a * b, 1));
  // the values that will be shown decide the padding
  const shown = [];
  const collect = (axis, off) => {
    if (axis === shape.length) { shown.push(data[off]); return; }
    const n = shape[axis];
    const idx = summary && n > 2 * EDGE ? [0, 1, 2, n - 3, n - 2, n - 1] : [...Array(n).keys()];
    for (const i of idx) collect(axis + 1, off + i * strides[axis]);
  };
  collect(0, 0);
  const f = bool ? (x) => (x ? ' True' : 'False') : _npFloatFormatter(shown);
  const extend = (s, line, word, lw, nlp) => {
    let wrap = line.length + word.length > lw;
    if (line.length <= nlp.length) wrap = false;
    if (wrap) { s += line.replace(/\s+$/, '') + '\n'; line = nlp; }
    return [s, line + word];
  };
  const rec = (axis, off, hang, cw) => {
    if (axis === shape.length) return f(data[off]);
    const left = shape.length - axis, nextHang = hang + ' ', nextW = cw - 1;
    const n = shape[axis];
    const showSum = summary && 2 * EDGE < n;
    const lead = showSum ? EDGE : 0, trail = showSum ? EDGE : n;
    let s = '';
    if (left === 1) {
      const ew = cw - Math.max(sep.trimEnd().length, 1);
      let line = hang;
      for (let i = 0; i < lead; i++) { [s, line] = extend(s, line, rec(axis + 1, off + i * strides[axis], nextHang, nextW), ew, hang); line += sep; }
      if (showSum) { [s, line] = extend(s, line, '...', ew, hang); line += sep; }
      for (let i = trail; i > 1; i--) { [s, line] = extend(s, line, rec(axis + 1, off + (n - i) * strides[axis], nextHang, nextW), ew, hang); line += sep; }
      [s, line] = extend(s, line, rec(axis + 1, off + (n - 1) * strides[axis], nextHang, nextW), ew, hang);
      s += line;
    } else {
      const lsep = sep.trimEnd() + '\n'.repeat(left - 1);
      for (let i = 0; i < lead; i++) s += hang + rec(axis + 1, off + i * strides[axis], nextHang, nextW) + lsep;
      if (showSum) s += hang + '...' + lsep;
      for (let i = trail; i > 1; i--) s += hang + rec(axis + 1, off + (n - i) * strides[axis], nextHang, nextW) + lsep;
      s += hang + rec(axis + 1, off + (n - 1) * strides[axis], nextHang, nextW);
    }
    return '[' + s.slice(hang.length) + ']';
  };
  return prefix + rec(0, 0, ' ' + ' '.repeat(prefix.length), width) + suffix;
}

// numpy's rounding: scale by 10^d, round half to even, scale back (so 0.125 → 0.12)
function _rintEven(x) {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x), d = x - f;
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
  return r === 0 && (x < 0 || Object.is(x, -0)) ? -0 : r;
}
function _npRoundScalar(x, dec) {
  if (!dec) return _rintEven(x);
  if (dec > 0) { const p = 10 ** dec; return _rintEven(x * p) / p; }
  const p = 10 ** -dec; return _rintEven(x / p) * p;
}

// boolean arrays: natra is float64 throughout, so a mask keeps 0/1 data (mask indexing,
// sums and where keep working) and _bool decides how it reads back: tolist, indexing,
// printing, and numpy's bool∘bool arithmetic
function _flat(arr) { const v = _ctx.toArray(arr); return Array.isArray(v) ? v.flat(Infinity) : [v]; }
function _deepBool(v) { return Array.isArray(v) ? v.map(_deepBool) : v !== 0; }
function _boolOp(a, o, fn) {
  const x = _flat(a._arr), y = _isNd(o) ? _flat(o._arr) : null;
  if (y && y.length !== x.length) throw new RangeError(`operands could not be broadcast together with shapes [${a.shape}] [${o.shape}]`);
  const ob = o !== 0 && o !== false;
  const out = x.map((v, i) => (fn(v !== 0, y ? y[i] !== 0 : ob) ? 1 : 0));
  return _makeNd(_ctx.array(out, { shape: a.shape }), true);
}
function _logic(a, o, fn, sym) {
  const ob = _isNd(o) ? o._bool : typeof o === 'boolean';
  if (!a._bool || !ob) throw new TypeError(`'${sym}' on float arrays: numpy refuses (ufunc not supported for float64); use it on boolean arrays`);
  return _boolOp(a, o, fn);
}
// reductions: axis positionally or by keyword, ddof by keyword; anything else raises
function _redOpts(axis, kw) {
  if (axis && axis._kw) { kw = axis; axis = undefined; }
  let ddof = 0;
  if (kw) {
    if (kw.axis !== undefined && kw.axis !== null) axis = kw.axis;
    if (kw.ddof !== undefined) ddof = kw.ddof;
    for (const k of Object.keys(kw)) {
      if (k !== '_kw' && k !== 'axis' && k !== 'ddof') throw new TypeError(`unsupported keyword argument '${k}' (natra bridge)`);
    }
  }
  return { axis: axis === null ? undefined : axis, ddof };
}
function _variance(a, axis, kw) {
  const { axis: ax, ddof } = _redOpts(axis, kw);
  const raw = _raw(a);
  const m = _ops().mean(raw, ax);
  const diff = _ops().sub(raw, m);
  const sq = _ops().mul(diff, diff);
  const r = _ops().sum(sq, ax);
  const shape = raw.shape;
  const n = ax === undefined ? shape.reduce((p, q) => p * q, 1) : shape[ax < 0 ? ax + shape.length : ax];
  const den = n - ddof;
  if (typeof r === 'number') return den > 0 ? r / den : NaN;
  return _makeNd(_ops().map(r, (v) => (den > 0 ? v / den : NaN)));
}
function _std(a, axis, kw) {
  const v = _variance(a, axis, kw);
  if (typeof v === 'number') return Math.sqrt(v);
  return _makeNd(_ops().map(v._arr, Math.sqrt));
}
function _round(a, decimals) {
  let d = decimals;
  if (d && d._kw) d = d.decimals;
  d = d ?? 0;
  if (!Number.isInteger(d)) throw new TypeError('decimals must be an integer');
  const _r = (x) => {
    if (typeof x === 'number') return _npRoundScalar(x, d);
    if (Array.isArray(x)) return x.map(_r);
    if (ArrayBuffer.isView(x)) {
      const out = Array.from(x, (v) => _npRoundScalar(v, d));
      if (Array.isArray(x.shape)) out.shape = x.shape.slice();
      return out;
    }
    return x;
  };
  if (_isNd(a)) return _makeNd(_ops().map(a._arr, (v) => _npRoundScalar(v, d)));
  return _r(a);
}

// ── NdArray wrapper ──

function _makeNd(arr, isBool) {
  const nd = {
    _nd: true,
    _arr: arr,
    _bool: !!isBool,
    // Surface as `<class 'ndarray'>` to adder's type() builtin —
    // matches numpy's reporting closely enough for the common
    // `print(type(x))` debugging pattern.
    __adderClass__: 'ndarray',
    get shape() { return [...arr.shape]; },
    get ndim() { return arr.ndim; },
    get dtype() { return nd._bool ? 'bool' : arr.dtype; },
    get size() { return arr.length; },
    get T() { return _makeNd(arr.T); },

    // arithmetic dunders
    // numpy: bool + bool is OR, bool * bool is AND, bool - bool and -bool raise
    __add__(other) { return nd._bool && _isNd(other) && other._bool ? _boolOp(nd, other, (a, b) => a || b) : _makeNd(_ops().add(arr, _raw(other))); },
    __radd__(other) { return _makeNd(_ops().add(_raw(other), arr)); },
    __sub__(other) {
      if (nd._bool && _isNd(other) && other._bool) throw new TypeError('numpy boolean subtract, the `-` operator, is not supported, use the bitwise_xor, the `^` operator, or the logical_xor function instead.');
      return _makeNd(_ops().sub(arr, _raw(other)));
    },
    __rsub__(other) { return _makeNd(_ops().sub(_raw(other), arr)); },
    __mul__(other) { return nd._bool && _isNd(other) && other._bool ? _boolOp(nd, other, (a, b) => a && b) : _makeNd(_ops().mul(arr, _raw(other))); },
    __rmul__(other) { return _makeNd(_ops().mul(_raw(other), arr)); },
    __truediv__(other) { return _makeNd(_ops().div(arr, _raw(other))); },
    __rtruediv__(other) { return _makeNd(_ops().div(_raw(other), arr)); },
    __matmul__(other) { return _makeNd(_ops().matmul(arr, _raw(other))); },
    __rmatmul__(other) { return _makeNd(_ops().matmul(_raw(other), arr)); },
    __neg__() {
      if (nd._bool) throw new TypeError('numpy boolean negative, the `-` operator, is not supported, use the `~` operator or the logical_not function instead.');
      return _makeNd(_ops().neg(arr));
    },
    __abs__() { return _makeNd(_ops().map(arr, Math.abs), nd._bool); },
    __invert__() {
      if (!nd._bool) throw new TypeError("ufunc 'invert' not supported for float64 (numpy refuses ~ on floats)");
      return _boolOp(nd, nd, (a) => !a);
    },
    __and__(o) { return _logic(nd, o, (a, b) => a && b, '&'); },
    __rand__(o) { return _logic(nd, o, (a, b) => a && b, '&'); },
    __or__(o) { return _logic(nd, o, (a, b) => a || b, '|'); },
    __ror__(o) { return _logic(nd, o, (a, b) => a || b, '|'); },
    __xor__(o) { return _logic(nd, o, (a, b) => !a !== !b, '^'); },
    __rxor__(o) { return _logic(nd, o, (a, b) => !a !== !b, '^'); },

    // comparison dunders (return mask arrays)
    __eq__(other) { return _makeNd(_ops().eq(arr, _raw(other)), true); },
    __ne__(other) { return _makeNd(_ops().ne(arr, _raw(other)), true); },
    __lt__(other) { return _makeNd(_ops().lt(arr, _raw(other)), true); },
    __le__(other) { return _makeNd(_ops().le(arr, _raw(other)), true); },
    __gt__(other) { return _makeNd(_ops().gt(arr, _raw(other)), true); },
    __ge__(other) { return _makeNd(_ops().ge(arr, _raw(other)), true); },

    // container dunders
    __len__() { return arr.shape[0]; },
    __bool__() { if (arr.length !== 1) throw new Error('truth value of array with more than one element is ambiguous'); return _ctx.get(arr, 0) !== 0; },

    // subscript
    __getitem__(key) {
      if (typeof key === 'number') {
        if (arr.ndim === 1) return nd._el(_ctx.get(arr, key < 0 ? key + arr.shape[0] : key));
        return _makeNd(arr.slice(key < 0 ? key + arr.shape[0] : key), nd._bool);
      }
      if (key && key._slice) {
        const lower = key.lower ?? 0;
        const upper = key.upper ?? arr.shape[0];
        const step = key.step ?? 1;
        return _makeNd(arr.slice([lower < 0 ? lower + arr.shape[0] : lower, upper < 0 ? upper + arr.shape[0] : upper, step]), nd._bool);
      }
      if (Array.isArray(key)) {
        // tuple indexing (multi-dimensional)
        const sliceArgs = key.map((k, d) => {
          if (typeof k === 'number') return k < 0 ? k + arr.shape[d] : k;
          if (k && k._slice) {
            const lower = k.lower ?? 0;
            const upper = k.upper ?? arr.shape[d];
            const step = k.step ?? 1;
            return [lower < 0 ? lower + arr.shape[d] : lower, upper < 0 ? upper + arr.shape[d] : upper, step];
          }
          return null; // full slice
        });
        const result = arr.slice(...sliceArgs);
        // if all dimensions were integer-indexed, we have a [1] array — return scalar
        if (result.ndim === 1 && result.length === 1 && sliceArgs.every(s => typeof s === 'number')) {
          return nd._el(_ctx.get(result, 0));
        }
        return _makeNd(result, nd._bool);
      }
      // boolean mask indexing
      if (_isNd(key)) return _makeNd(_ops().compress(arr, key._arr), nd._bool);
      throw new Error(`unsupported index type: ${typeof key}`);
    },

    __setitem__(key, val) {
      if (typeof key === 'number') {
        const idx = key < 0 ? key + arr.shape[0] : key;
        if (arr.ndim === 1) {
          _ctx.set(arr, _isNd(val) ? _ctx.get(val._arr, 0) : val, idx);
        } else {
          throw new Error('multi-dimensional setitem not yet supported');
        }
        return;
      }
      if (Array.isArray(key)) {
        // tuple indexing
        const indices = key.map((k, d) => {
          if (typeof k !== 'number') throw new Error('setitem with slices not yet supported');
          return k < 0 ? k + arr.shape[d] : k;
        });
        _ctx.set(arr, _isNd(val) ? _ctx.get(val._arr, 0) : val, ...indices);
        return;
      }
      throw new Error(`unsupported setitem key type: ${typeof key}`);
    },

    // display
    _el(x) { return nd._bool ? x !== 0 : x; },
    __repr__() { return _npFormat(_flat(arr), arr.shape, nd._bool, true); },
    __str__() { return _npFormat(_flat(arr), arr.shape, nd._bool, false); },
    toString() { return nd.__str__(); },
    _repr_html_() { return _htmlTable(arr); },

    // methods
    sum(axis) {
      const a = axis?._kw ? axis.axis : axis;
      const r = _ops().sum(arr, a);
      return typeof r === 'number' ? r : _makeNd(r);
    },
    mean(axis) {
      const a = axis?._kw ? axis.axis : axis;
      const r = _ops().mean(arr, a);
      return typeof r === 'number' ? r : _makeNd(r);
    },
    min(axis) {
      const a = axis?._kw ? axis.axis : axis;
      const r = _ops().min(arr, a);
      return typeof r === 'number' ? r : _makeNd(r);
    },
    max(axis) {
      const a = axis?._kw ? axis.axis : axis;
      const r = _ops().max(arr, a);
      return typeof r === 'number' ? r : _makeNd(r);
    },
    std(axis, kw) { return _std(nd, axis, kw); },
    var(axis, kw) { return _variance(nd, axis, kw); },
    round(decimals) { return _round(nd, decimals); },
    reshape(...s) {
      const shape = s.length === 1 && Array.isArray(s[0]) ? s[0] : s;
      return _makeNd(arr.reshape(shape));
    },
    flatten() { return _makeNd(arr.reshape([arr.length]), nd._bool); },
    copy() { return _makeNd(_ctx.copy(arr), nd._bool); },
    tolist() { return nd._bool ? _deepBool(_ctx.toArray(arr)) : _ctx.toArray(arr); },
    dot(other) {
      const r = _ops().dot(arr, _raw(other));
      return typeof r === 'number' ? r : _makeNd(r);
    },
    diag() { return _makeNd(arr.diag()); },
    argmin() {
      const vals = _ctx.toArray(arr).flat();
      let mi = 0;
      for (let i = 1; i < vals.length; i++) if (vals[i] < vals[mi]) mi = i;
      return mi;
    },
    argmax() {
      const vals = _ctx.toArray(arr).flat();
      let mi = 0;
      for (let i = 1; i < vals.length; i++) if (vals[i] > vals[mi]) mi = i;
      return mi;
    },

    // iteration (for Python for-loops)
    [Symbol.iterator]() {
      let i = 0;
      const len = arr.shape[0];
      return {
        next() {
          if (i >= len) return { done: true };
          const idx = i++;
          if (arr.ndim === 1) return { value: nd._el(_ctx.get(arr, idx)), done: false };
          return { value: _makeNd(arr.slice(idx), nd._bool), done: false };
        }
      };
    },
  };
  return nd;
}

// ── HTML table display ──

function _htmlTable(arr) {
  const fmtVal = v => {
    if (Number.isNaN(v)) return 'nan';
    if (v === Infinity) return 'inf';
    if (v === -Infinity) return '-inf';
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return String(v);
    const a = Math.abs(v);
    if (a >= 1e8 || (a !== 0 && a < 1e-4)) return v.toExponential(4);
    return v.toFixed(4).replace(/\.?0+$/, '');
  };

  if (arr.ndim === 1) {
    const MAX = 20;
    const data = _ctx.toArray(arr);
    const show = data.length <= MAX ? data : [...data.slice(0, 10), '...', ...data.slice(-5)];
    return `<code>array([${show.map(v => typeof v === 'string' ? v : fmtVal(v)).join(', ')}])</code>`;
  }
  if (arr.ndim === 2) {
    const [rows, cols] = arr.shape;
    const MAX_R = 20, MAX_C = 10;
    let html = '<table style="border-collapse:collapse;font-family:monospace;font-size:0.85em">';
    const rShow = rows <= MAX_R ? rows : 10;
    for (let i = 0; i < rShow; i++) {
      html += '<tr>';
      const cShow = cols <= MAX_C ? cols : 6;
      for (let j = 0; j < cShow; j++) {
        html += `<td style="padding:2px 6px;text-align:right">${fmtVal(_ctx.get(arr, i, j))}</td>`;
      }
      if (cols > MAX_C) html += '<td style="padding:2px 6px">…</td>';
      html += '</tr>';
    }
    if (rows > MAX_R) html += `<tr><td colspan="${Math.min(cols, MAX_C) + (cols > MAX_C ? 1 : 0)}" style="text-align:center">⋮</td></tr>`;
    html += '</table>';
    return html;
  }
  return `<code>${arr.toString()}</code>`;
}

// ── Cell hook ──

let _hookRegistered = false;

function _registerHook() {
  if (_hookRegistered) return;
  _hookRegistered = true;
  if (typeof window === 'undefined') return;
  window._adderCellHooks = window._adderCellHooks || [];
  window._adderCellHooks.push({
    before(scope, cell) {
      if (!_ctx) return null;
      const { arena, ops } = _ctx._beginCellScope();
      _activeOps = ops;
      return arena;
    },
    after(arena, defines, scope) {
      if (!arena) return;
      // collect raw descriptors for defined NdArrays
      const keep = [];
      for (const v of Object.values(defines)) {
        if (_isNd(v) && v._arr._arena === arena) keep.push(v._arr);
      }
      const promoted = _ctx._endCellScope(arena, keep);
      // update wrapper references to promoted descriptors
      let pi = 0;
      for (const v of Object.values(defines)) {
        if (_isNd(v) && v._arr._arena === arena) v._arr = promoted[pi++];
      }
      _activeOps = null;
    },
  });
}

// Numpy parity: np.zeros(3) accepts a scalar (= 1D shape of length 3).
// natra's underlying ctx expects an array; wrap scalars before passing
// through. Applied to zeros/ones/full and any other shape-taking constructor.
// Transpose a 2D array-of-arrays (used by corrcoef's rowvar=False path).
function _transposeRows(rows) {
  if (rows.length === 0) return [];
  const ncols = rows[0].length;
  const out = [];
  for (let j = 0; j < ncols; j++) {
    const col = [];
    for (let i = 0; i < rows.length; i++) col.push(rows[i][j]);
    out.push(col);
  }
  return out;
}

function _normShape(shape) {
  return typeof shape === 'number' ? [shape] : shape;
}

// ── Module API ──

const _module = {
  // numpy scalar constants
  NaN: Number.NaN,
  nan: Number.NaN,   // numpy exposes both spellings
  Inf: Number.POSITIVE_INFINITY,
  inf: Number.POSITIVE_INFINITY,
  NINF: Number.NEGATIVE_INFINITY,
  pi: Math.PI,
  e: Math.E,
  newaxis: null,     // numpy.newaxis is None; used as a placeholder in slicing

  // array creation (sync permPtr before perm alloc to avoid overwriting arena scratch)
  async array(data) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.array(data)); },
  async zeros(shape) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.zeros(_normShape(shape))); },
  async ones(shape) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.ones(_normShape(shape))); },
  async full(shape, v) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.full(_normShape(shape), v)); },
  async eye(n) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.eye(n)); },
  async linspace(start, stop, num) {
    if (num?._kw) num = num.num ?? 50;
    const ctx = await _ensureCtx(); ctx._syncPerm();
    return _makeNd(ctx.linspace(start, stop, num ?? 50));
  },
  async arange(start, stop, step) {
    const ctx = await _ensureCtx(); ctx._syncPerm();
    if (stop === undefined) { stop = start; start = 0; }
    return _makeNd(ctx.arange(start, stop, step ?? 1));
  },

  // math functions (element-wise)
  abs(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.abs)) : Math.abs(a); },
  sqrt(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.sqrt)) : Math.sqrt(a); },
  exp(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.exp)) : Math.exp(a); },
  log(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.log)) : Math.log(a); },
  sin(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.sin)) : Math.sin(a); },
  cos(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.cos)) : Math.cos(a); },
  tan(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.tan)) : Math.tan(a); },

  // reductions — async so we can ensure the natra ctx is initialized
  // before any _ops() call. The natra cell hook only sets _activeOps
  // when _ctx already exists; cells that hit a reduction first (e.g.
  // `np.mean(df.values)` after a sadpan-only workflow) would otherwise
  // throw `no active cell scope` because nothing triggered the lazy
  // ctx init. The await pulls in _ensureCtx, which both initializes
  // _ctx AND (via its bootstrap branch) installs _activeOps for the
  // current cell.
  async sum(a, axis) {
    await _ensureCtx();
    const ax = axis?._kw ? axis.axis : axis;
    const r = _ops().sum(_raw(a), ax);
    return typeof r === 'number' ? r : _makeNd(r);
  },
  async mean(a, axis) {
    await _ensureCtx();
    const ax = axis?._kw ? axis.axis : axis;
    const r = _ops().mean(_raw(a), ax);
    return typeof r === 'number' ? r : _makeNd(r);
  },
  async min(a, axis) {
    await _ensureCtx();
    const ax = axis?._kw ? axis.axis : axis;
    const r = _ops().min(_raw(a), ax);
    return typeof r === 'number' ? r : _makeNd(r);
  },
  async max(a, axis) {
    await _ensureCtx();
    const ax = axis?._kw ? axis.axis : axis;
    const r = _ops().max(_raw(a), ax);
    return typeof r === 'number' ? r : _makeNd(r);
  },

  // numpy-shaped extras commonly hit by ported notebooks
  // np.average(a, axis=None, weights=None) — weighted mean. Without
  // weights it's equivalent to np.mean.
  average(a, axisOrKw, weights) {
    let axis = axisOrKw, w = weights;
    if (axisOrKw?._kw) { axis = axisOrKw.axis; w = axisOrKw.weights; }
    const raw = _raw(a);
    if (w === undefined || w === null) {
      const r = _ops().mean(raw, axis);
      return typeof r === 'number' ? r : _makeNd(r);
    }
    const wRaw = _raw(w);
    const num = _ops().sum(_ops().mul(raw, wRaw), axis);
    const den = _ops().sum(wRaw, axis);
    if (typeof num === 'number' && typeof den === 'number') return num / den;
    return _makeNd(_ops().div(num, den));
  },
  // np.percentile(a, q) — q in [0,100]. Returns scalar (q scalar) or
  // array (q list). Linear interpolation, matches numpy's default.
  async percentile(a, q) {
    const raw = _raw(a);
    const ctx = await _ensureCtx();
    const flat = typeof ctx.toArray === 'function' ? ctx.toArray(raw).flat() : Array.from(raw);
    flat.sort((x, y) => x - y);
    const _pick = (qq) => {
      const idx = (qq / 100) * (flat.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      if (lo === hi) return flat[lo];
      return flat[lo] + (flat[hi] - flat[lo]) * (idx - lo);
    };
    if (Array.isArray(q)) return q.map(_pick);
    return _pick(q);
  },
  // np.median(a) — equivalent to percentile(a, 50)
  median(a) { return this.percentile(a, 50); },
  // np.sort(a) — ascending, returns new ndarray
  async sort(a) {
    const raw = _raw(a);
    // natra's raw arr is a WASM-arena descriptor — use toArray to read.
    const ctx = await _ensureCtx();
    const flat = typeof ctx.toArray === 'function' ? ctx.toArray(raw).flat() : Array.from(raw);
    flat.sort((x, y) => x - y);
    return _makeNd(ctx.array(flat));
  },
  // np.log10(a)
  log10(a) {
    return _isNd(a) ? _makeNd(_ops().map(a._arr, Math.log10)) : Math.log10(a);
  },
  // np.logspace(start, stop, num=50, base=10) — log-spaced points between
  // base**start and base**stop inclusive.
  async logspace(start, stop, num, base) {
    if (start?._kw) {
      const kw = start;
      start = kw.start; stop = kw.stop;
      num = kw.num ?? 50; base = kw.base ?? 10;
    }
    num = num ?? 50; base = base ?? 10;
    const ctx = await _ensureCtx(); ctx._syncPerm();
    const lin = ctx.linspace(start, stop, num);
    return _makeNd(_ops().map(lin, (v) => Math.pow(base, v)));
  },
  // np.var / np.std (axis, ddof; keywords or positional axis)
  var(a, axis, kw) { return _variance(a, axis, kw); },
  std(a, axis, kw) { return _std(a, axis, kw); },
  isnan(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, (v) => (Number.isNaN(v) ? 1 : 0)), true) : Number.isNaN(a); },
  isfinite(a) { return _isNd(a) ? _makeNd(_ops().map(a._arr, (v) => (Number.isFinite(v) ? 1 : 0)), true) : Number.isFinite(a); },
  logical_not(a) { return _isNd(a) ? _boolOp(a, a, (x) => !x) : !a; },

  // np.power(x, y) — element-wise x**y. Both can be arrays or scalars.
  power(x, y) {
    if (_isNd(y)) {
      if (!_isNd(x)) return _makeNd(_ops().map(y._arr, (v) => Math.pow(x, v)));
      const xs = _flat(x._arr), ys = _flat(y._arr);
      if (xs.length !== ys.length) throw new RangeError(`operands could not be broadcast together with shapes [${x.shape}] [${y.shape}]`);
      return _makeNd(_ctx.array(xs.map((v, i) => Math.pow(v, ys[i])), { shape: x.shape }));
    }
    if (_isNd(x)) return _makeNd(_ops().map(x._arr, (v) => Math.pow(v, y)));
    return Math.pow(x, y);
  },
  // numpy spells the rounding function `np.around` AND `np.round_`
  // (both aliases for round). Provide both.
  around(a, decimals) { return this.round(a, decimals); },
  round_(a, decimals) { return this.round(a, decimals); },
  // np.round(a, decimals=0) — element-wise round, optionally to N decimal
  // places. Recurses into nested arrays so a 2D corr matrix from
  // np.corrcoef stays 2D after rounding.
  // numpy rounding: scale by 10^decimals, half to even, scale back (0.125 → 0.12)
  round(a, decimals) { return _round(a, decimals); },
  // np.corrcoef(x, y=None, rowvar=True) — Pearson correlation matrix.
  // Three input shapes (mirroring numpy):
  //   x=2D ndarray, rowvar=True (default)  → each row is a variable
  //   x=2D ndarray, rowvar=False           → each column is a variable
  //                                           (sadpan DataFrame → numpy
  //                                           convention)
  //   x=1D, y=1D                            → 2×2 matrix
  // DataFrame inputs are also accepted (auto-converts to 2D via
  // _toNested). Result is a JS array of arrays (n×n).
  corrcoef(x, y, opts) {
    // Adder kwargs may land in y or opts position.
    let rowvar = true;
    if (y != null && typeof y === 'object' && y._kw) {
      if (y.rowvar != null) rowvar = y.rowvar;
      if (y.y != null) y = y.y;
      else y = null;
    } else if (opts != null && opts._kw) {
      if (opts.rowvar != null) rowvar = opts.rowvar;
    }

    // Coerce input to 2D array-of-arrays
    let rows;
    if (Array.isArray(x) && Array.isArray(x[0])) {
      rows = x;  // already 2D nested
    } else if (x && x._tbl && typeof x.to_numpy === 'function') {
      // sadpan DataFrame → returns _NumpyLikeArray2D wrapper. Use
      // tolist() to get a plain nested-array form.
      const arr2d = x.to_numpy();
      rows = arr2d && typeof arr2d.tolist === 'function' ? arr2d.tolist() : arr2d;
    } else if (!_isNd(x) && x && typeof x.tolist === 'function' && Array.isArray(x.tolist())) {
      // _NumpyLikeArray2D passed directly
      rows = x.tolist();
    } else if (_isNd(x) && x.ndim === 2) {
      // natra 2D — convert via toArray
      const ctx2 = _ctx;
      if (ctx2 && typeof ctx2.toArray === 'function') rows = ctx2.toArray(x._arr);
      else throw new Error('np.corrcoef: cannot convert natra 2D');
    } else {
      // 1D path — two vectors
      const _toJs = (v) => {
        if (Array.isArray(v)) return v;
        if (_isNd(v)) return _flat(v._arr);
        if (ArrayBuffer.isView(v)) return Array.from(v);
        return v;
      };
      const xs = _toJs(x);
      const ys = _toJs(y);
      if (!Array.isArray(ys)) throw new Error('np.corrcoef: pass 2D matrix or two 1D vectors');
      rows = [xs, ys];
      rowvar = true;
    }

    // After rowvar handling, `vars` is an array where each element is
    // the values of one variable (length = #observations).
    const vars = rowvar ? rows : _transposeRows(rows);
    const n = vars.length;
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
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(i === j ? 1 : _r(vars[i], vars[j]));
      out.push(row);
    }
    return _makeNd(_ctx.array(out));
  },

  // linear algebra helpers
  dot(a, b) {
    // numpy.dot is overloaded by ndim:
    //   1D × 1D → inner product (scalar)
    //   2D × 2D → matrix multiply
    //   N-D × 1-D → sum-product over last axis
    // For our common case (2D × 2D from sklearn outputs) we dispatch
    // to matmul; 1D × 1D goes to ops.dot (the inner-product fast path).
    const ra = _raw(a);
    const rb = _raw(b);
    const an = ra && Array.isArray(ra.shape) ? ra.shape.length : 1;
    const bn = rb && Array.isArray(rb.shape) ? rb.shape.length : 1;
    if (an === 2 && bn === 2) return _makeNd(_ops().matmul(ra, rb));
    if (an === 2 && bn === 1) return _makeNd(_ops().matmul(ra, rb));
    if (an === 1 && bn === 2) return _makeNd(_ops().matmul(ra, rb));
    const r = _ops().dot(ra, rb);
    return typeof r === 'number' ? r : _makeNd(r);
  },
  matmul(a, b) { return _makeNd(_ops().matmul(_raw(a), _raw(b))); },
  where(cond, a, b) {
    // Three input shapes commonly arrive here:
    //   - natra ndarray condition → use the native op (vectorized)
    //   - sadpan BooleanMask / Series / plain JS array → element-wise loop
    //     in JS (cheap for the array sizes scientific notebooks pass in)
    //   - scalar bool → just pick a or b
    if (typeof cond === 'boolean') return cond ? a : b;
    if (_isNd(cond)) return _makeNd(_ops().where(cond._arr, _raw(a), _raw(b)));

    const condArr = (cond && cond._values) ? cond._values
                  : (Array.isArray(cond) ? cond
                  : null);
    if (!condArr) throw new Error(`np.where: unsupported condition type ${typeof cond}`);

    const getElt = (v) => {
      if (v == null) return () => v;
      if (v._values) return (i) => v._values[i];
      if (Array.isArray(v)) return (i) => v[i];
      return () => v;
    };
    const fa = getElt(a);
    const fb = getElt(b);
    const out = new Array(condArr.length);
    for (let i = 0; i < condArr.length; i++) out[i] = condArr[i] ? fa(i) : fb(i);
    return out;
  },

  // linalg namespace
  linalg: {
    solve(a, b) { return _makeNd(_ops().solve(_raw(a), _raw(b))); },
    inv(a) { return _makeNd(_ops().inv(_raw(a))); },
    cholesky(a) { return _makeNd(_ops().cholesky(_raw(a))); },
    // numpy reads the LOWER triangle by default (UPLO='L'); values ascending
    eigh(a, kw) {
      const uplo = (kw && kw._kw && kw.UPLO) || (typeof kw === 'string' ? kw : 'L');
      if (uplo !== 'L' && uplo !== 'U') throw new RangeError("UPLO argument must be 'L' or 'U'");
      const M = _ctx.toArray(_raw(a));
      const n = M.length;
      const S = M.map((row, i) => row.map((v, j) => (j > i ? (uplo === 'L' ? M[j][i] : v) : (j < i && uplo === 'U' ? M[j][i] : v))));
      const [w, v] = _ops().eigh(_ctx.array(S));
      const ws = _flat(w), V = _ctx.toArray(v);
      const order = [...Array(n).keys()].sort((p, q) => ws[p] - ws[q]);
      return [_makeNd(_ctx.array(order.map((k) => ws[k]))), _makeNd(_ctx.array(V.map((row) => order.map((k) => row[k]))))];
    },
    // general eig would need a nonsymmetric solver: refuse rather than answer eigh
    eig() { throw new Error('np.linalg.eig is not supported by the natra bridge (only eigh, for symmetric matrices)'); },
    det(a) { return _ops().det(_raw(a)); },
    norm(a) { return _ops().norm(_raw(a)); },
  },

  // random namespace
  random: {
    async seed(n) { const ctx = await _ensureCtx(); ctx.seed(n); },
    async rand(...shape) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.random(shape)); },
    async randn(...shape) { const ctx = await _ensureCtx(); ctx._syncPerm(); return _makeNd(ctx.randn(shape)); },
    async uniform(low, high, shape) {
      if (low?._kw) { shape = low.size; high = low.high ?? 1; low = low.low ?? 0; }
      const ctx = await _ensureCtx();
      const arr = ctx.random(_normShape(shape || [1]));
      // scale: low + arr * (high - low)
      const ops = _ops();
      const scaled = ops.add(ops.mul(arr, high - low), low);
      return _makeNd(scaled);
    },
    async normal(loc, scale, shape) {
      if (loc?._kw) { shape = loc.size; scale = loc.scale ?? 1; loc = loc.loc ?? 0; }
      const ctx = await _ensureCtx();
      const arr = ctx.randn(_normShape(shape || [1]));
      const ops = _ops();
      const scaled = ops.add(ops.mul(arr, scale ?? 1), loc ?? 0);
      return _makeNd(scaled);
    },
    async lognormal(mean, sigma, shape) {
      if (mean?._kw) { shape = mean.size; sigma = mean.sigma ?? 1; mean = mean.mean ?? 0; }
      const ctx = await _ensureCtx();
      const arr = ctx.randn(_normShape(shape || [1]));
      const ops = _ops();
      // exp(mean + sigma * z) where z ~ N(0,1)
      const scaled = ops.exp(ops.add(ops.mul(arr, sigma ?? 1), mean ?? 0));
      return _makeNd(scaled);
    },
  },

  // context manager for explicit scoping
  scope() {
    return {
      __enter__() {
        if (!_ctx) throw new Error('natra not initialized — call an array creation function first');
        const { arena, ops } = _ctx._beginCellScope();
        const prevOps = _activeOps;
        _activeOps = ops;
        return { _arena: arena, _prevOps: prevOps };
      },
      __exit__(scopeObj) {
        if (!scopeObj) return false;
        _activeOps = scopeObj._prevOps;
        _ctx._endCellScope(scopeObj._arena, []);
        return false;
      },
    };
  },

  // constants
  pi: Math.PI,
  e: Math.E,
  inf: Infinity,
  nan: NaN,
  newaxis: null,

  // type helpers
  float64: 'f64',
  ndarray: 'ndarray',
};

// ── Registration ──
// Adder cell hooks (window._adderCellHooks) stay on a side channel — they're
// adder-internals (arena lifecycle), not a generic Auditable extension hook
// surface. The cross-language exports go through the manifest API.

if (typeof window !== 'undefined') {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/natra',
      version: '0.1.0',
      description: 'Numpy-compatible ndarray wrapper for adder cells',
      exports: { natra: _module },
    });
  } else {
    window._auditableExtensions = window._auditableExtensions || {};
    window._auditableExtensions['natra'] = _module;
  }
}

export { _module as natraAdder };

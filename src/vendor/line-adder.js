// ⚠ VENDORED — DO NOT EDIT. @gcu/line's adder bridge (numpy-shaped module), copied from ../auditable/ext/line/adder.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// vec/adder — TypedArray-backed numerical bridge for adder (Python) cells.
// Registers as window._auditableExtensions['vec'].
//
// Unlike natra (which has wasm + bump-allocator scope discipline), vec is
// pure JS with GC-managed lifetimes — no scope hook, no arena. The only
// async element is the one-time module resolution: in Node we dynamic-
// import './index.js'; in the browser we scan _importCache for the
// already-loaded namespace (since blob-URL ES modules can't resolve
// relative imports). After the first creation call, all dunder methods
// run synchronously.
//
// Users alias at import time: `import vec as np` (Auditable's convention
// is to register modules under their package name; aliasing is the
// user's job).

// ── module resolution ──

let _vec = null;
let _initPromise = null;

function _isVecModule(mod) {
  return mod
    && typeof mod.NdArray === 'function'
    && typeof mod.eigSym3 === 'function'
    && typeof mod.matmul === 'function';
}

// the notebook's import cache, scanned synchronously (line may be load()-ed after the bridge)
function _fromImportCache() {
  if (typeof window === 'undefined' || !window._importCache) return null;
  for (const mod of Object.values(window._importCache)) if (_isVecModule(mod)) return mod;
  return null;
}

// A host that is not the notebook (a Web Worker, a single-file app) hands the
// bridge its library instead of letting it search window._importCache or
// import('./index.js'), which a blob worker cannot resolve. Idempotent; the last
// attach wins. (line-attach-spec.md)
export function attachLine(lib) {
  if (!_isVecModule(lib)) throw new TypeError('attachLine: expected the @gcu/line module');
  _vec = lib;
  _initPromise = Promise.resolve(lib);
  return _module;
}

async function _ensureVec() {
  if (_vec) return _vec;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const found = _fromImportCache();
    if (found) { _vec = found; return _vec; }
    if (typeof window !== 'undefined' && window._importCache) {
      throw new Error('line not loaded — call load("./ext/line/index.js") first');
    }
    // Node tests / Deno / Bun: dynamic import resolves from this file.
    _vec = await import('./index.js');
    return _vec;
  })();
  return _initPromise;
}

// Synchronous access. Resolves from the import cache when the library arrived
// after the bridge, so the FIRST numpy-shaped call of a run can be np.mean([…])
// — no array has to be created first any more (line-attach-spec §3).
function _v() {
  if (!_vec) { const found = _fromImportCache(); if (found) _vec = found; }
  if (!_vec) {
    throw new Error('line not attached — the host calls attachLine(lib), or the notebook load()s @gcu/line first');
  }
  return _vec;
}

// ── helpers ──

function _isVa(v) { return v && v._va === true; }

function _unwrap(v) {
  if (_isVa(v)) return v._arr;
  if (typeof v === 'number') return v;
  const vec = _v();
  if (v instanceof vec.NdArray) return v;
  if (Array.isArray(v)) return vec.from(v);
  return v;
}

function _wrap(v) {
  if (typeof v === 'number') return v;
  const vec = _v();
  if (v instanceof vec.NdArray) return new LineArray(v);
  return v;
}

// ── numpy-style printing (numpy's arrayprint: floatmode 'maxprec', precision 8,
// linewidth 75, threshold 1000, edgeitems 3). Twin copy in ext/natra/adder.js —
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

// ── LineArray wrapper ──

class LineArray {
  // isBool: line is float64 throughout, so a boolean array keeps 0/1 data (sums and
  // where keep working) and the flag decides how it reads back: tolist, indexing,
  // printing, and numpy's bool∘bool arithmetic
  constructor(nd, isBool) {
    const vec = _v();
    if (!(nd instanceof vec.NdArray)) {
      throw new TypeError('LineArray expects an NdArray');
    }
    this._va = true;
    this._arr = nd;
    this._bool = !!isBool;
  }

  get shape() { return [...this._arr.shape]; }
  get ndim()  { return this._arr.ndim; }
  get dtype() { return this._bool ? 'bool' : this._arr.dtype; }
  get size()  { return this._arr.size; }
  get T()     { return new LineArray(_v().transpose(this._arr)); }

  // numpy: bool + bool is OR, bool * bool is AND, bool - bool and -bool raise
  __add__(o)      { return _bothBool(this, o) ? _boolOp(this, o, (a, b) => a || b) : new LineArray(_v().add(this._arr, _unwrap(o))); }
  __radd__(o)     { return new LineArray(_v().add(_unwrap(o), this._arr)); }
  __sub__(o)      { _noBoolSub(this, o); return new LineArray(_v().sub(this._arr, _unwrap(o))); }
  __rsub__(o)     { return new LineArray(_v().sub(_unwrap(o), this._arr)); }
  __mul__(o)      { return _bothBool(this, o) ? _boolOp(this, o, (a, b) => a && b) : new LineArray(_v().mul(this._arr, _unwrap(o))); }
  __rmul__(o)     { return new LineArray(_v().mul(_unwrap(o), this._arr)); }
  __truediv__(o)  { return new LineArray(_v().div(this._arr, _unwrap(o))); }
  __rtruediv__(o) { return new LineArray(_v().div(_unwrap(o), this._arr)); }
  __pow__(o)      { return new LineArray(_v().pow(this._arr, _unwrap(o))); }
  __rpow__(o)     { return new LineArray(_v().pow(_unwrap(o), this._arr)); }
  __matmul__(o)   { return new LineArray(_v().matmul(this._arr, _unwrap(o))); }
  __rmatmul__(o)  { return new LineArray(_v().matmul(_unwrap(o), this._arr)); }
  __neg__()       { if (this._bool) throw new TypeError('numpy boolean negative, the `-` operator, is not supported, use the `~` operator or the logical_not function instead.'); return new LineArray(_v().neg(this._arr)); }
  __invert__()    { if (!this._bool) throw new TypeError("ufunc 'invert' not supported for float64 (numpy refuses ~ on floats)"); return _boolOp(this, this, (a) => !a); }
  __and__(o)      { return _logic(this, o, (a, b) => a && b, '&'); }
  __rand__(o)     { return _logic(this, o, (a, b) => a && b, '&'); }
  __or__(o)       { return _logic(this, o, (a, b) => a || b, '|'); }
  __ror__(o)      { return _logic(this, o, (a, b) => a || b, '|'); }
  __xor__(o)      { return _logic(this, o, (a, b) => !a !== !b, '^'); }
  __rxor__(o)     { return _logic(this, o, (a, b) => !a !== !b, '^'); }
  __abs__()       { return new LineArray(_v().abs(this._arr), this._bool); }

  __len__() { return this._arr.shape[0]; }
  __bool__() {
    if (this._arr.size !== 1) {
      throw new Error('truth value of array with more than one element is ambiguous');
    }
    return this._arr.data[0] !== 0;
  }
  _el(x) { return this._bool ? x !== 0 : x; }

  __getitem__(key) {
    const arr = this._arr;
    if (typeof key === 'number') {
      const idx = key < 0 ? key + arr.shape[0] : key;
      if (arr.ndim === 1) return this._el(arr.get(idx));
      if (arr.ndim === 2) return new LineArray(arr.row(idx), this._bool);
      return new LineArray(_takeAxis0(arr, idx), this._bool);
    }
    if (key && key._slice) return new LineArray(_sliceAxis0(arr, key), this._bool);
    if (Array.isArray(key)) {
      const r = _tupleIndex(arr, key);
      return _isVa(r) ? new LineArray(r._arr, this._bool) : this._el(r);
    }
    throw new Error(`unsupported index type: ${typeof key}`);
  }

  __setitem__(key, value) {
    const arr = this._arr;
    if (typeof key === 'number') {
      const idx = key < 0 ? key + arr.shape[0] : key;
      if (arr.ndim === 1) {
        arr.data[idx] = _isVa(value) ? value._arr.data[0] : value;
        return;
      }
      if (arr.ndim === 2) {
        const cols = arr.shape[1];
        const off = idx * cols;
        if (typeof value === 'number') {
          for (let j = 0; j < cols; j++) arr.data[off + j] = value;
        } else if (_isVa(value)) {
          if (value._arr.size !== cols) {
            throw new RangeError(`cannot assign size ${value._arr.size} into row of length ${cols}`);
          }
          for (let j = 0; j < cols; j++) arr.data[off + j] = value._arr.data[j];
        } else {
          throw new TypeError('row assignment requires number or LineArray');
        }
        return;
      }
      throw new Error(`setitem on ${arr.ndim}D not supported in v1`);
    }
    if (Array.isArray(key)) {
      if (key.length !== arr.ndim) {
        throw new RangeError(`expected ${arr.ndim} indices, got ${key.length}`);
      }
      let off = 0;
      for (let i = 0; i < key.length; i++) {
        const k = key[i];
        if (typeof k !== 'number') throw new Error('setitem with slices not supported in v1');
        const idx = k < 0 ? k + arr.shape[i] : k;
        off += idx * arr.strides[i];
      }
      arr.data[off] = _isVa(value) ? value._arr.data[0] : value;
      return;
    }
    throw new Error(`unsupported setitem key type: ${typeof key}`);
  }

  __eq__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a === b ? 1 : 0), true); }
  __ne__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a !== b ? 1 : 0), true); }
  __lt__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a <  b ? 1 : 0), true); }
  __le__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a <= b ? 1 : 0), true); }
  __gt__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a >  b ? 1 : 0), true); }
  __ge__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a >= b ? 1 : 0), true); }

  __repr__() { return _npFormat(this._arr.data, this._arr.shape, this._bool, true); }
  __str__() { return _npFormat(this._arr.data, this._arr.shape, this._bool, false); }
  toString() { return this.__str__(); }

  sum(opts)   { return _wrap(_v().sum (this._arr, _axisOpts(opts))); }
  mean(opts)  { return _wrap(_v().mean(this._arr, _axisOpts(opts))); }
  min(opts)   { return _wrap(_v().min (this._arr, _axisOpts(opts))); }
  max(opts)   { return _wrap(_v().max (this._arr, _axisOpts(opts))); }
  std(opts, kw) { return _wrap(_v().std (this._arr, _axisOpts(opts, kw))); }
  var(opts, kw) { return _wrap(_v().variance(this._arr, _axisOpts(opts, kw))); }
  prod(opts)  { return _wrap(_v().prod(this._arr, _axisOpts(opts))); }
  argmin(opts){ return _wrap(_v().argmin(this._arr, _axisOpts(opts))); }
  argmax(opts){ return _wrap(_v().argmax(this._arr, _axisOpts(opts))); }
  cumsum(opts){ return new LineArray(_v().cumsum(this._arr, _axisOpts(opts))); }
  cumprod(opts){ return new LineArray(_v().cumprod(this._arr, _axisOpts(opts))); }
  clip(lo, hi){ return new LineArray(_v().clip(this._arr, lo, hi)); }
  round(decimals) { return _module.round(this, decimals); }
  norm()      { return _v().norm(this._arr); }

  reshape(...shapeArgs) {
    const shape = shapeArgs.length === 1 && Array.isArray(shapeArgs[0])
      ? shapeArgs[0] : shapeArgs;
    return new LineArray(_v().reshape(this._arr, shape));
  }
  flatten()    { return new LineArray(_v().flatten(this._arr), this._bool); }
  copy()       { return new LineArray(_v().copy(this._arr), this._bool); }
  tolist()     { return this._bool ? _deepBool(this._arr.toArray()) : this._arr.toArray(); }
  dot(other)   { return _wrap(_v().dot(this._arr, _unwrap(other))); }
  transpose()  { return new LineArray(_v().transpose(this._arr)); }

  [Symbol.iterator]() {
    const arr = this._arr;
    let i = 0;
    const len = arr.shape[0];
    return {
      next: () => {
        if (i >= len) return { value: undefined, done: true };
        const idx = i++;
        if (arr.ndim === 1) return { value: this._el(arr.data[idx]), done: false };
        if (arr.ndim === 2) return { value: new LineArray(arr.row(idx), this._bool), done: false };
        return { value: new LineArray(_takeAxis0(arr, idx), this._bool), done: false };
      },
    };
  }
}

// ── internal helpers ──

// reductions: axis positionally or by keyword, ddof by keyword; anything else raises
function _axisOpts(opts, kw) {
  if (opts && opts._kw) { kw = opts; opts = undefined; }
  const out = {};
  if (typeof opts === 'number') out.axis = opts;
  else if (opts && typeof opts === 'object') Object.assign(out, opts);
  if (kw) {
    if (kw.axis !== undefined && kw.axis !== null) out.axis = kw.axis;
    if (kw.ddof !== undefined) out.ddof = kw.ddof;
    for (const k of Object.keys(kw)) {
      if (k !== '_kw' && k !== 'axis' && k !== 'ddof') throw new TypeError(`unsupported keyword argument '${k}' (line bridge)`);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function _deepBool(v) { return Array.isArray(v) ? v.map(_deepBool) : v !== 0; }
function _bothBool(a, o) { return a._bool && _isVa(o) && o._bool; }
function _boolOp(a, o, fn) {
  const x = a._arr.data, y = _isVa(o) ? o._arr.data : null;
  if (y && y.length !== x.length) throw new RangeError(`operands could not be broadcast together with shapes [${a._arr.shape}] [${o._arr.shape}]`);
  const ob = o !== 0 && o !== false;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = fn(x[i] !== 0, y ? y[i] !== 0 : ob) ? 1 : 0;
  return new LineArray(new (_v().NdArray)(out, a._arr.shape), true);
}
function _noBoolSub(a, o) {
  if (_bothBool(a, o)) throw new TypeError('numpy boolean subtract, the `-` operator, is not supported, use the bitwise_xor, the `^` operator, or the logical_xor function instead.');
}
function _logic(a, o, fn, sym) {
  const ob = _isVa(o) ? o._bool : typeof o === 'boolean';
  if (!a._bool || !ob) throw new TypeError(`'${sym}' on float arrays: numpy refuses (ufunc not supported for float64); use it on boolean arrays`);
  return _boolOp(a, o, fn);
}

function _takeAxis0(arr, idx) {
  if (arr.ndim < 1) throw new RangeError('cannot index 0-D array');
  const dim0 = arr.shape[0];
  if (idx < 0 || idx >= dim0) {
    throw new RangeError(`index ${idx} out of bounds for axis 0 size ${dim0}`);
  }
  const innerShape = arr.shape.slice(1);
  let innerSize = 1;
  for (let i = 0; i < innerShape.length; i++) innerSize *= innerShape[i];
  const out = new Float64Array(innerSize);
  const off = idx * innerSize;
  for (let i = 0; i < innerSize; i++) out[i] = arr.data[off + i];
  return new (_v().NdArray)(out, innerShape);
}

function _sliceAxis0(arr, slc) {
  const range = {
    start: slc.lower ?? undefined,
    end:   slc.upper ?? undefined,
    step:  slc.step  ?? undefined,
  };
  const ranges = new Array(arr.ndim).fill(null);
  ranges[0] = range;
  return _v().slice(arr, ranges);
}

function _tupleIndex(arr, key) {
  if (key.length > arr.ndim) {
    throw new RangeError(`too many indices: got ${key.length}, ${arr.ndim}D array`);
  }
  if (key.length === arr.ndim && key.every(k => typeof k === 'number')) {
    const idx = key.map((k, i) => k < 0 ? k + arr.shape[i] : k);
    return arr.get(...idx);
  }
  const ranges = new Array(arr.ndim).fill(null);
  const collapsed = new Array(arr.ndim).fill(false);
  for (let i = 0; i < key.length; i++) {
    const k = key[i];
    if (typeof k === 'number') {
      const idx = k < 0 ? k + arr.shape[i] : k;
      ranges[i] = { start: idx, end: idx + 1 };
      collapsed[i] = true;
    } else if (k && k._slice) {
      ranges[i] = {
        start: k.lower ?? undefined,
        end:   k.upper ?? undefined,
        step:  k.step  ?? undefined,
      };
    } else if (k === null || k === undefined) {
      // full axis
    } else {
      throw new Error(`unsupported tuple index element: ${typeof k}`);
    }
  }
  let sliced = _v().slice(arr, ranges);
  const newShape = [];
  for (let i = 0; i < sliced.ndim; i++) {
    if (!collapsed[i]) newShape.push(sliced.shape[i]);
  }
  if (newShape.length === sliced.ndim) return new LineArray(sliced);
  if (newShape.length === 0) return sliced.data[0];
  return new LineArray(_v().reshape(sliced, newShape));
}

function _cmp(arr, other, fn) {
  const out = new Float64Array(arr.size);
  if (typeof other === 'number') {
    const d = arr.data;
    for (let i = 0; i < arr.size; i++) out[i] = fn(d[i], other);
    return new (_v().NdArray)(out, arr.shape);
  }
  const vec = _v();
  const o = other instanceof vec.NdArray ? other : null;
  if (!o) throw new TypeError('comparison requires number or NdArray');
  if (o.size !== arr.size) {
    throw new RangeError(`comparison shape mismatch: [${arr.shape.join(',')}] vs [${o.shape.join(',')}]`);
  }
  const ad = arr.data, od = o.data;
  for (let i = 0; i < arr.size; i++) out[i] = fn(ad[i], od[i]);
  return new vec.NdArray(out, arr.shape);
}

// numpy.linalg.eigh: symmetric from the LOWER triangle (UPLO='L', numpy's default),
// values ascending, eigenvectors as columns in the same order
function _eigh(A, kw) {
  const uplo = (kw && kw._kw && kw.UPLO) || (typeof kw === 'string' ? kw : 'L');
  if (uplo !== 'L' && uplo !== 'U') throw new RangeError("UPLO argument must be 'L' or 'U'");
  const M = _unwrap(A);
  if (M.ndim !== 2 || M.shape[0] !== M.shape[1]) throw new RangeError(`eigh requires a square 2D matrix, got [${M.shape}]`);
  const n = M.shape[0], d = new Float64Array(M.data);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (uplo === 'U') d[j * n + i] = d[i * n + j]; else d[i * n + j] = d[j * n + i];
  }
  const vec = _v();
  const { values, vectors } = vec.eigSym(new vec.NdArray(d, [n, n]));
  const order = [...Array(n).keys()].sort((a, b) => values.data[a] - values.data[b]);
  const w = new Float64Array(n), V = new Float64Array(n * n);
  order.forEach((src, k) => {
    w[k] = values.data[src];
    for (let r = 0; r < n; r++) V[r * n + k] = vectors.data[r * n + src];
  });
  return [new LineArray(new vec.NdArray(w, [n])), new LineArray(new vec.NdArray(V, [n, n]))];
}

// numpy.linalg.lstsq → (x, residuals, rank, s). rcond=None means eps·max(m, n);
// residuals is the squared 2-norm of b − Ax when rank == n and m > n, else empty.
function _lstsq(A, b, kw) {
  const vec = _v();
  const M = _unwrap(A), y = _unwrap(b);
  if (M.ndim !== 2) throw new RangeError(`lstsq: A must be 2D, got ${M.ndim}D`);
  if (y.ndim !== 1) throw new RangeError('lstsq: only a 1D b is supported by the line bridge');
  const m = M.shape[0], n = M.shape[1];
  if (y.size !== m) throw new RangeError(`lstsq: incompatible dimensions ${m} and ${y.size}`);
  let rcond = kw && kw._kw ? kw.rcond : kw;
  if (rcond === undefined || rcond === null || rcond === -1) rcond = Number.EPSILON * Math.max(m, n);
  const { U, s, V } = vec.svd(M);
  const sv = Array.from(s.data), k = sv.length;
  const cut = rcond * Math.max(0, ...sv);
  const rank = sv.filter((x) => x > cut).length;
  // x = V · diag(1/s) · Uᵀ b over the singular values above the cutoff
  const ucols = U.shape[1], vcols = V.shape[1];
  const x = new Float64Array(n);
  for (let j = 0; j < k; j++) {
    if (!(sv[j] > cut)) continue;
    let ub = 0;
    for (let i = 0; i < m; i++) ub += U.data[i * ucols + j] * y.data[i];
    const c = ub / sv[j];
    for (let r = 0; r < n; r++) x[r] += V.data[r * vcols + j] * c;
  }
  let res;
  if (rank === n && m > n) {
    let ss = 0;
    for (let i = 0; i < m; i++) {
      let ax = 0;
      for (let j = 0; j < n; j++) ax += M.data[i * n + j] * x[j];
      ss += (y.data[i] - ax) ** 2;
    }
    res = new vec.NdArray(new Float64Array([ss]), [1]);
  } else res = new vec.NdArray(new Float64Array(0), [0]);
  return [
    new LineArray(new vec.NdArray(x, [n])),
    new LineArray(res),
    rank,
    new LineArray(new vec.NdArray(new Float64Array(sv), [k])),
  ];
}

// ── module exports ──
// Creation methods are async (they trigger the one-time module resolution
// on first call). Once initialized, every dunder method on LineArray runs
// synchronously. After the first await np.array(...) succeeds, vec is
// fully bound and the rest of the API behaves as if it were sync — though
// adder cells still need to await any further np.* helper calls because
// they're declared async at the binding level.

const _module = {
  async array(data) { await _ensureVec(); return new LineArray(_v().from(data)); },
  async zeros(shape) { await _ensureVec(); return new LineArray(_v().zeros(shape)); },
  async ones(shape)  { await _ensureVec(); return new LineArray(_v().ones(shape)); },
  async full(shape, value) { await _ensureVec(); return new LineArray(_v().full(shape, value)); },
  async eye(n) { await _ensureVec(); return new LineArray(_v().eye(n)); },
  async arange(start, stop, step) {
    await _ensureVec();
    if (stop === undefined) { stop = start; start = 0; }
    return new LineArray(_v().range(start, stop, step ?? 1));
  },
  async linspace(a, b, n) {
    await _ensureVec();
    if (n?._kw) n = n.num ?? 50;
    return new LineArray(_v().linspace(a, b, n ?? 50));
  },

  abs:  (a) => _isVa(a) ? new LineArray(_v().abs (a._arr)) : Math.abs(a),
  sqrt: (a) => _isVa(a) ? new LineArray(_v().sqrt(a._arr)) : Math.sqrt(a),
  exp:  (a) => _isVa(a) ? new LineArray(_v().exp (a._arr)) : Math.exp(a),
  log:  (a) => _isVa(a) ? new LineArray(_v().log (a._arr)) : Math.log(a),
  sin:  (a) => _isVa(a) ? new LineArray(_v().sin (a._arr)) : Math.sin(a),
  cos:  (a) => _isVa(a) ? new LineArray(_v().cos (a._arr)) : Math.cos(a),
  tan:  (a) => _isVa(a) ? new LineArray(_v().tan (a._arr)) : Math.tan(a),
  asin: (a) => _isVa(a) ? new LineArray(_v().asin(a._arr)) : Math.asin(a),
  acos: (a) => _isVa(a) ? new LineArray(_v().acos(a._arr)) : Math.acos(a),
  atan: (a) => _isVa(a) ? new LineArray(_v().atan(a._arr)) : Math.atan(a),
  floor:(a) => _isVa(a) ? new LineArray(_v().floor(a._arr)) : Math.floor(a),
  ceil: (a) => _isVa(a) ? new LineArray(_v().ceil(a._arr)) : Math.ceil(a),
  // numpy rounding: scale by 10^decimals, half to even, scale back (0.125 → 0.12)
  round: (a, decimals) => {
    let d = decimals;
    if (d && d._kw) d = d.decimals;
    d = d ?? 0;
    if (!Number.isInteger(d)) throw new TypeError('decimals must be an integer');
    if (!_isVa(a)) return _npRoundScalar(_unwrap(a), d);
    const x = a._arr.data, out = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = _npRoundScalar(x[i], d);
    return new LineArray(new (_v().NdArray)(out, a._arr.shape));
  },
  around: (a, decimals) => _module.round(a, decimals),
  rint: (a) => _module.round(a, 0),
  sign: (a) => _isVa(a) ? new LineArray(_v().sign(a._arr)) : Math.sign(a),
  isnan:    (a) => _isVa(a) ? new LineArray(_v().isnan(a._arr), true)    : Number.isNaN(a),
  isfinite: (a) => _isVa(a) ? new LineArray(_v().isfinite(a._arr), true) : Number.isFinite(a),
  logical_not: (a) => _isVa(a) ? _boolOp(a, a, (x) => !x) : !a,

  // binary element-wise
  atan2:   (y, x) => new LineArray(_v().atan2(_unwrap(y), _unwrap(x))),
  hypot:   (a, b) => new LineArray(_v().hypot(_unwrap(a), _unwrap(b))),
  maximum: (a, b) => new LineArray(_v().maximum(_unwrap(a), _unwrap(b))),
  minimum: (a, b) => new LineArray(_v().minimum(_unwrap(a), _unwrap(b))),
  eq: (a, b) => new LineArray(_v().eq(_unwrap(a), _unwrap(b)), true),
  ne: (a, b) => new LineArray(_v().ne(_unwrap(a), _unwrap(b)), true),
  lt: (a, b) => new LineArray(_v().lt(_unwrap(a), _unwrap(b)), true),
  le: (a, b) => new LineArray(_v().le(_unwrap(a), _unwrap(b)), true),
  gt: (a, b) => new LineArray(_v().gt(_unwrap(a), _unwrap(b)), true),
  ge: (a, b) => new LineArray(_v().ge(_unwrap(a), _unwrap(b)), true),
  equal: (a, b) => _module.eq(a, b), not_equal: (a, b) => _module.ne(a, b),
  less: (a, b) => _module.lt(a, b), less_equal: (a, b) => _module.le(a, b),
  greater: (a, b) => _module.gt(a, b), greater_equal: (a, b) => _module.ge(a, b),

  // selection
  where: (cond, a, b) => new LineArray(_v().where(_unwrap(cond), _unwrap(a), _unwrap(b))),
  clip:  (a, lo, hi)  => new LineArray(_v().clip(_unwrap(a), lo, hi)),

  sum:  (a, opts, kw) => _wrap(_v().sum (_unwrap(a), _axisOpts(opts, kw))),
  mean: (a, opts, kw) => _wrap(_v().mean(_unwrap(a), _axisOpts(opts, kw))),
  min:  (a, opts, kw) => _wrap(_v().min (_unwrap(a), _axisOpts(opts, kw))),
  max:  (a, opts, kw) => _wrap(_v().max (_unwrap(a), _axisOpts(opts, kw))),
  std:  (a, opts, kw) => _wrap(_v().std (_unwrap(a), _axisOpts(opts, kw))),
  var:  (a, opts, kw) => _wrap(_v().variance(_unwrap(a), _axisOpts(opts, kw))),
  prod: (a, opts, kw) => _wrap(_v().prod(_unwrap(a), _axisOpts(opts, kw))),
  cumsum:  (a, opts) => new LineArray(_v().cumsum(_unwrap(a), _axisOpts(opts))),
  cumprod: (a, opts) => new LineArray(_v().cumprod(_unwrap(a), _axisOpts(opts))),
  argmin:  (a, opts) => _wrap(_v().argmin(_unwrap(a), _axisOpts(opts))),
  argmax:  (a, opts) => _wrap(_v().argmax(_unwrap(a), _axisOpts(opts))),
  trace:   (A) => _v().trace(_unwrap(A)),

  dot:    (a, b) => _wrap(_v().dot(_unwrap(a), _unwrap(b))),
  matmul: (a, b) => new LineArray(_v().matmul(_unwrap(a), _unwrap(b))),

  reshape: (a, ...shapeArgs) => {
    const s = shapeArgs.length === 1 && Array.isArray(shapeArgs[0]) ? shapeArgs[0] : shapeArgs;
    return new LineArray(_v().reshape(_unwrap(a), s));
  },
  transpose: (a) => new LineArray(_v().transpose(_unwrap(a))),
  flatten:   (a) => new LineArray(_v().flatten(_unwrap(a))),
  copy:      (a) => new LineArray(_v().copy(_unwrap(a))),
  diag:      (a, k) => new LineArray(_v().diag(_unwrap(a), k ?? 0)),
  outer:     (a, b) => new LineArray(_v().outer(_unwrap(a), _unwrap(b))),
  tril:      (A, k) => new LineArray(_v().tril(_unwrap(A), k ?? 0)),
  triu:      (A, k) => new LineArray(_v().triu(_unwrap(A), k ?? 0)),
  concat:    (arrays, axis) => new LineArray(_v().concat(arrays.map(_unwrap), axis ?? 0)),
  stack:     (arrays, axis) => new LineArray(_v().stack(arrays.map(_unwrap), axis ?? 0)),

  linalg: {
    solve:    (A, b) => new LineArray(_v().solve(_unwrap(A), _unwrap(b))),
    inv:      (A)    => new LineArray(_v().inv(_unwrap(A))),
    det:      (A)    => _v().det(_unwrap(A)),
    cholesky: (A)    => new LineArray(_v().cholesky(_unwrap(A))),
    norm:     (a)    => _v().norm(_unwrap(a)),
    lstsq:    (A, b, kw) => _lstsq(A, b, kw),
    eigh:     (A, kw) => _eigh(A, kw),
    eigh3:    (A) => {
      const { values, vectors } = _v().eigSym3(_unwrap(A));
      return [new LineArray(values), new LineArray(vectors)];
    },
  },

  pi:  Math.PI,
  e:   Math.E,
  inf: Infinity,
  nan: NaN,
  newaxis: null,
  float64: 'f64',
  ndarray: 'ndarray',
  LineArray,
};

// ── resolution at load (no top-level await: the bridge stays a valid classic script) ──
// Notebook: line already in the import cache → attached now, before any cell runs.
// Node: the relative import, in the background; `lineReady` resolves when attached.
// A blob worker: that import fails quietly and the host calls attachLine(lib).
let lineReady;
{
  const found = _fromImportCache();
  if (found) { attachLine(found); lineReady = Promise.resolve(_module); }
  else if (typeof window !== 'undefined' && window._importCache) lineReady = Promise.resolve(_module);   // the notebook will load() it later
  else if (typeof importScripts === 'function') lineReady = Promise.resolve(_module);   // a worker: no request; the host attaches
  else lineReady = import('./index.js').then((m) => (_vec ? _module : attachLine(m)), () => _module);
}

// ── registration ──

if (typeof window !== 'undefined') {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/line',
      version: '0.3.0',
      description: 'Linear algebra for JS — adder bridge',
      exports: { line: _module },
    });
  } else {
    window._auditableExtensions = window._auditableExtensions || {};
    window._auditableExtensions['line'] = _module;
  }
}

export { _module as vecAdder, LineArray, lineReady };

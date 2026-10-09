// ⚠ VENDORED — DO NOT EDIT. @gcu/line's adder bridge (numpy-shaped module), copied from ../auditable/ext/line/adder.js at auditable 6fd9b601 (9 Oct 2026, MIT).
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

// ── LineArray wrapper ──

class LineArray {
  constructor(nd) {
    const vec = _v();
    if (!(nd instanceof vec.NdArray)) {
      throw new TypeError('LineArray expects an NdArray');
    }
    this._va = true;
    this._arr = nd;
  }

  get shape() { return [...this._arr.shape]; }
  get ndim()  { return this._arr.ndim; }
  get dtype() { return this._arr.dtype; }
  get size()  { return this._arr.size; }
  get T()     { return new LineArray(_v().transpose(this._arr)); }

  __add__(o)      { return new LineArray(_v().add(this._arr, _unwrap(o))); }
  __radd__(o)     { return new LineArray(_v().add(_unwrap(o), this._arr)); }
  __sub__(o)      { return new LineArray(_v().sub(this._arr, _unwrap(o))); }
  __rsub__(o)     { return new LineArray(_v().sub(_unwrap(o), this._arr)); }
  __mul__(o)      { return new LineArray(_v().mul(this._arr, _unwrap(o))); }
  __rmul__(o)     { return new LineArray(_v().mul(_unwrap(o), this._arr)); }
  __truediv__(o)  { return new LineArray(_v().div(this._arr, _unwrap(o))); }
  __rtruediv__(o) { return new LineArray(_v().div(_unwrap(o), this._arr)); }
  __pow__(o)      { return new LineArray(_v().pow(this._arr, _unwrap(o))); }
  __rpow__(o)     { return new LineArray(_v().pow(_unwrap(o), this._arr)); }
  __matmul__(o)   { return new LineArray(_v().matmul(this._arr, _unwrap(o))); }
  __rmatmul__(o)  { return new LineArray(_v().matmul(_unwrap(o), this._arr)); }
  __neg__()       { return new LineArray(_v().neg(this._arr)); }
  __abs__()       { return new LineArray(_v().abs(this._arr)); }

  __len__() { return this._arr.shape[0]; }
  __bool__() {
    if (this._arr.size !== 1) {
      throw new Error('truth value of array with more than one element is ambiguous');
    }
    return this._arr.data[0] !== 0;
  }

  __getitem__(key) {
    const arr = this._arr;
    if (typeof key === 'number') {
      const idx = key < 0 ? key + arr.shape[0] : key;
      if (arr.ndim === 1) return arr.get(idx);
      if (arr.ndim === 2) return new LineArray(arr.row(idx));
      return new LineArray(_takeAxis0(arr, idx));
    }
    if (key && key._slice) return new LineArray(_sliceAxis0(arr, key));
    if (Array.isArray(key)) return _tupleIndex(arr, key);
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

  __eq__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a === b ? 1 : 0)); }
  __ne__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a !== b ? 1 : 0)); }
  __lt__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a <  b ? 1 : 0)); }
  __le__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a <= b ? 1 : 0)); }
  __gt__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a >  b ? 1 : 0)); }
  __ge__(o) { return new LineArray(_cmp(this._arr, _unwrap(o), (a, b) => a >= b ? 1 : 0)); }

  __repr__() { return this._arr.toString(); }
  __str__() { return this._arr.toString(); }

  sum(opts)   { return _wrap(_v().sum (this._arr, _axisOpts(opts))); }
  mean(opts)  { return _wrap(_v().mean(this._arr, _axisOpts(opts))); }
  min(opts)   { return _wrap(_v().min (this._arr, _axisOpts(opts))); }
  max(opts)   { return _wrap(_v().max (this._arr, _axisOpts(opts))); }
  std(opts)   { return _wrap(_v().std (this._arr, _axisOpts(opts))); }
  var(opts)   { return _wrap(_v().variance(this._arr, _axisOpts(opts))); }
  prod(opts)  { return _wrap(_v().prod(this._arr, _axisOpts(opts))); }
  argmin(opts){ return _wrap(_v().argmin(this._arr, _axisOpts(opts))); }
  argmax(opts){ return _wrap(_v().argmax(this._arr, _axisOpts(opts))); }
  cumsum(opts){ return new LineArray(_v().cumsum(this._arr, _axisOpts(opts))); }
  cumprod(opts){ return new LineArray(_v().cumprod(this._arr, _axisOpts(opts))); }
  clip(lo, hi){ return new LineArray(_v().clip(this._arr, lo, hi)); }
  norm()      { return _v().norm(this._arr); }

  reshape(...shapeArgs) {
    const shape = shapeArgs.length === 1 && Array.isArray(shapeArgs[0])
      ? shapeArgs[0] : shapeArgs;
    return new LineArray(_v().reshape(this._arr, shape));
  }
  flatten()    { return new LineArray(_v().flatten(this._arr)); }
  copy()       { return new LineArray(_v().copy(this._arr)); }
  tolist()     { return this._arr.toArray(); }
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
        if (arr.ndim === 1) return { value: arr.data[idx], done: false };
        if (arr.ndim === 2) return { value: new LineArray(arr.row(idx)), done: false };
        return { value: new LineArray(_takeAxis0(arr, idx)), done: false };
      },
    };
  }
}

// ── internal helpers ──

function _axisOpts(opts) {
  if (opts === undefined || opts === null) return undefined;
  if (typeof opts === 'number') return { axis: opts };
  if (opts._kw) return { axis: opts.axis };
  return opts;
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
  round:(a) => _isVa(a) ? new LineArray(_v().round(a._arr)) : Math.round(a),
  sign: (a) => _isVa(a) ? new LineArray(_v().sign(a._arr)) : Math.sign(a),
  isnan:    (a) => _isVa(a) ? new LineArray(_v().isnan(a._arr))    : (Number.isNaN(a) ? 1 : 0),
  isfinite: (a) => _isVa(a) ? new LineArray(_v().isfinite(a._arr)) : (Number.isFinite(a) ? 1 : 0),

  // binary element-wise
  atan2:   (y, x) => new LineArray(_v().atan2(_unwrap(y), _unwrap(x))),
  hypot:   (a, b) => new LineArray(_v().hypot(_unwrap(a), _unwrap(b))),
  maximum: (a, b) => new LineArray(_v().maximum(_unwrap(a), _unwrap(b))),
  minimum: (a, b) => new LineArray(_v().minimum(_unwrap(a), _unwrap(b))),
  eq: (a, b) => new LineArray(_v().eq(_unwrap(a), _unwrap(b))),
  ne: (a, b) => new LineArray(_v().ne(_unwrap(a), _unwrap(b))),
  lt: (a, b) => new LineArray(_v().lt(_unwrap(a), _unwrap(b))),
  le: (a, b) => new LineArray(_v().le(_unwrap(a), _unwrap(b))),
  gt: (a, b) => new LineArray(_v().gt(_unwrap(a), _unwrap(b))),
  ge: (a, b) => new LineArray(_v().ge(_unwrap(a), _unwrap(b))),

  // selection
  where: (cond, a, b) => new LineArray(_v().where(_unwrap(cond), _unwrap(a), _unwrap(b))),
  clip:  (a, lo, hi)  => new LineArray(_v().clip(_unwrap(a), lo, hi)),

  sum:  (a, opts) => _wrap(_v().sum (_unwrap(a), _axisOpts(opts))),
  mean: (a, opts) => _wrap(_v().mean(_unwrap(a), _axisOpts(opts))),
  min:  (a, opts) => _wrap(_v().min (_unwrap(a), _axisOpts(opts))),
  max:  (a, opts) => _wrap(_v().max (_unwrap(a), _axisOpts(opts))),
  std:  (a, opts) => _wrap(_v().std (_unwrap(a), _axisOpts(opts))),
  var:  (a, opts) => _wrap(_v().variance(_unwrap(a), _axisOpts(opts))),
  prod: (a, opts) => _wrap(_v().prod(_unwrap(a), _axisOpts(opts))),
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
    lstsq:    (A, b) => new LineArray(_v().lstsq(_unwrap(A), _unwrap(b))),
    eigh:     (A) => {
      const { values, vectors } = _v().eigSym(_unwrap(A));
      return [new LineArray(values), new LineArray(vectors)];
    },
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

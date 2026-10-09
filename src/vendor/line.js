// ⚠ VENDORED — DO NOT EDIT. @gcu/line, copied from ../auditable/ext/line/index.js at auditable 4e4b7363 (9 Oct 2026, MIT).
// Pure JS ndarray and dense linear algebra; loaded only inside the Python worker, for numpy. Re-vendor by copying that file here.

// @gcu/line — Linear algebra for JS (TypedArray-based ndarray + BLAS-1/2 + small dense linalg).
// Auto-generated from ext/line/src/ — do not edit directly.
//
// API surface (named exports below at file end):
//   NdArray, shapeProduct, computeStrides
//   zeros, ones, full, range, linspace, eye, from
//   add, sub, mul, div, pow, neg, abs, sqrt, log, exp, sin, cos, tan
//   reshape, flatten, copy, slice
//   broadcastShapes, broadcastStrides, broadcastBinary, shapesEqual
//   sum, mean, max, min, std, variance, var_, norm, dot
//   matmul, transpose, det2, det3, det4, inv2, inv3, inv4
//   solve, det, inv, cholesky, solveCholesky, lstsq
//   eigSym3, eigSym

// ── ndarray.js ──

// NdArray — contiguous row-major Float64Array with shape metadata.
//
// Always contiguous: shape changes (reshape, slice, transpose, row/col) produce
// new arrays. No views, no buffer sharing. This keeps inner loops flat-iterating
// the backing Float64Array — exactly the shape V8 inlines and vectorizes hardest.

function shapeProduct(shape) {
  let n = 1;
  for (let i = 0; i < shape.length; i++) n *= shape[i];
  return n;
}

function computeStrides(shape) {
  const n = shape.length;
  const strides = new Array(n);
  let s = 1;
  for (let i = n - 1; i >= 0; i--) {
    strides[i] = s;
    s *= shape[i];
  }
  return strides;
}

function validateShape(shape) {
  if (!Array.isArray(shape)) {
    throw new TypeError(`shape must be an array, got ${typeof shape}`);
  }
  for (let i = 0; i < shape.length; i++) {
    const d = shape[i];
    if (!Number.isInteger(d) || d < 0) {
      throw new RangeError(`shape[${i}] must be a non-negative integer, got ${d}`);
    }
  }
}

class NdArray {
  constructor(data, shape) {
    if (!(data instanceof Float64Array)) {
      throw new TypeError('NdArray data must be Float64Array');
    }
    validateShape(shape);
    const size = shapeProduct(shape);
    if (data.length !== size) {
      throw new RangeError(
        `data length ${data.length} does not match shape product ${size} (shape=[${shape.join(',')}])`
      );
    }
    this.data = data;
    this.shape = shape.slice();
    this.strides = computeStrides(this.shape);
    this.size = size;
    this.ndim = shape.length;
    this.dtype = 'f64';
  }

  get(...indices) {
    if (indices.length !== this.ndim) {
      throw new RangeError(`expected ${this.ndim} indices, got ${indices.length}`);
    }
    let off = 0;
    for (let i = 0; i < indices.length; i++) {
      const ix = indices[i];
      const dim = this.shape[i];
      if (!Number.isInteger(ix) || ix < 0 || ix >= dim) {
        throw new RangeError(`index ${ix} out of bounds for axis ${i} with size ${dim}`);
      }
      off += ix * this.strides[i];
    }
    return this.data[off];
  }

  set(...args) {
    if (args.length !== this.ndim + 1) {
      throw new RangeError(`expected ${this.ndim} indices + 1 value, got ${args.length} args`);
    }
    let off = 0;
    for (let i = 0; i < this.ndim; i++) {
      const ix = args[i];
      const dim = this.shape[i];
      if (!Number.isInteger(ix) || ix < 0 || ix >= dim) {
        throw new RangeError(`index ${ix} out of bounds for axis ${i} with size ${dim}`);
      }
      off += ix * this.strides[i];
    }
    this.data[off] = args[this.ndim];
  }

  row(i) {
    if (this.ndim !== 2) {
      throw new RangeError(`row() requires 2D array, got ${this.ndim}D`);
    }
    const cols = this.shape[1];
    if (!Number.isInteger(i) || i < 0 || i >= this.shape[0]) {
      throw new RangeError(`row index ${i} out of bounds for shape [${this.shape.join(',')}]`);
    }
    const out = new Float64Array(cols);
    const off = i * cols;
    for (let j = 0; j < cols; j++) out[j] = this.data[off + j];
    return new NdArray(out, [cols]);
  }

  col(j) {
    if (this.ndim !== 2) {
      throw new RangeError(`col() requires 2D array, got ${this.ndim}D`);
    }
    const rows = this.shape[0];
    const cols = this.shape[1];
    if (!Number.isInteger(j) || j < 0 || j >= cols) {
      throw new RangeError(`col index ${j} out of bounds for shape [${this.shape.join(',')}]`);
    }
    const out = new Float64Array(rows);
    for (let i = 0; i < rows; i++) out[i] = this.data[i * cols + j];
    return new NdArray(out, [rows]);
  }

  toArray() {
    if (this.ndim === 0) return this.data[0];
    if (this.ndim === 1) return Array.from(this.data);
    return _nestArray(this.data, this.shape, 0, 0);
  }

  toString() {
    return `NdArray(${_formatNested(this.data, this.shape, 0, 0)}, shape=[${this.shape.join(',')}])`;
  }
}

function _nestArray(data, shape, axis, offset) {
  const dim = shape[axis];
  if (axis === shape.length - 1) {
    const out = new Array(dim);
    for (let i = 0; i < dim; i++) out[i] = data[offset + i];
    return out;
  }
  let stride = 1;
  for (let k = axis + 1; k < shape.length; k++) stride *= shape[k];
  const out = new Array(dim);
  for (let i = 0; i < dim; i++) {
    out[i] = _nestArray(data, shape, axis + 1, offset + i * stride);
  }
  return out;
}

function _formatNested(data, shape, axis, offset) {
  const dim = shape[axis];
  if (axis === shape.length - 1) {
    const parts = new Array(dim);
    for (let i = 0; i < dim; i++) parts[i] = String(data[offset + i]);
    return '[' + parts.join(', ') + ']';
  }
  let stride = 1;
  for (let k = axis + 1; k < shape.length; k++) stride *= shape[k];
  const parts = new Array(dim);
  for (let i = 0; i < dim; i++) {
    parts[i] = _formatNested(data, shape, axis + 1, offset + i * stride);
  }
  return '[' + parts.join(', ') + ']';
}

// ── shape.js ──

// Shape ops + broadcast helpers.


function reshape(a, newShape) {
  validateShape(newShape);
  const target = shapeProduct(newShape);
  if (target !== a.size) {
    throw new RangeError(
      `cannot reshape array of size ${a.size} into shape [${newShape.join(',')}] (size ${target})`
    );
  }
  return new NdArray(new Float64Array(a.data), newShape);
}

function flatten(a) {
  return new NdArray(new Float64Array(a.data), [a.size]);
}

function copy(a) {
  return new NdArray(new Float64Array(a.data), a.shape);
}

// slice(a, ranges) — ranges is an array of per-axis specs.
//   null / undefined / missing → full axis
//   { start?, end?, step? }    → standard slice (defaults: 0, axis size, 1)
function slice(a, ranges) {
  if (!Array.isArray(ranges)) {
    throw new TypeError('slice ranges must be an array');
  }
  if (ranges.length > a.ndim) {
    throw new RangeError(`too many slice ranges: got ${ranges.length}, array has ${a.ndim} axes`);
  }
  const starts = new Array(a.ndim);
  const steps = new Array(a.ndim);
  const newShape = new Array(a.ndim);
  for (let axis = 0; axis < a.ndim; axis++) {
    const r = ranges[axis];
    const dim = a.shape[axis];
    if (r === null || r === undefined) {
      starts[axis] = 0;
      steps[axis] = 1;
      newShape[axis] = dim;
      continue;
    }
    let start = r.start === undefined ? 0 : r.start;
    let end = r.end === undefined ? dim : r.end;
    let step = r.step === undefined ? 1 : r.step;
    if (step === 0) throw new RangeError(`slice step on axis ${axis} cannot be zero`);
    if (start < 0) start = Math.max(0, dim + start);
    if (end < 0) end = Math.max(0, dim + end);
    if (start > dim) start = dim;
    if (end > dim) end = dim;
    let len;
    if (step > 0) {
      len = end > start ? Math.ceil((end - start) / step) : 0;
    } else {
      len = end < start ? Math.ceil((start - end) / -step) : 0;
    }
    starts[axis] = start;
    steps[axis] = step;
    newShape[axis] = len;
  }
  const outSize = shapeProduct(newShape);
  const out = new Float64Array(outSize);
  if (outSize === 0) return new NdArray(out, newShape);

  const idx = new Array(a.ndim).fill(0);
  for (let i = 0; i < outSize; i++) {
    let off = 0;
    for (let axis = 0; axis < a.ndim; axis++) {
      off += (starts[axis] + idx[axis] * steps[axis]) * a.strides[axis];
    }
    out[i] = a.data[off];
    for (let axis = a.ndim - 1; axis >= 0; axis--) {
      idx[axis]++;
      if (idx[axis] < newShape[axis]) break;
      idx[axis] = 0;
    }
  }
  return new NdArray(out, newShape);
}

// Broadcast helpers ---------------------------------------------------------

// Compute broadcast shape from two input shapes. Right-aligned; each axis must
// match exactly or one side must be 1. Throws on mismatch.
function broadcastShapes(shapeA, shapeB) {
  const nd = Math.max(shapeA.length, shapeB.length);
  const out = new Array(nd);
  for (let i = 0; i < nd; i++) {
    const a = i < nd - shapeA.length ? 1 : shapeA[i - (nd - shapeA.length)];
    const b = i < nd - shapeB.length ? 1 : shapeB[i - (nd - shapeB.length)];
    if (a === b) out[i] = a;
    else if (a === 1) out[i] = b;
    else if (b === 1) out[i] = a;
    else {
      throw new RangeError(
        `cannot broadcast shapes [${shapeA.join(',')}] and [${shapeB.join(',')}]`
      );
    }
  }
  return out;
}

// Compute the strides used to *read* an operand at the broadcast shape.
// Axes where the source has size 1 but the target has size >1 use stride 0
// (re-read the same element). Leading missing axes are also stride 0.
function broadcastStrides(srcShape, srcStrides, targetShape) {
  const nd = targetShape.length;
  const lead = nd - srcShape.length;
  const out = new Array(nd);
  for (let i = 0; i < nd; i++) {
    if (i < lead) {
      out[i] = 0;
      continue;
    }
    const srcDim = srcShape[i - lead];
    const tgtDim = targetShape[i];
    if (srcDim === tgtDim) out[i] = srcStrides[i - lead];
    else if (srcDim === 1) out[i] = 0;
    else {
      throw new RangeError(
        `incompatible broadcast: source axis ${i - lead} (size ${srcDim}) -> target axis ${i} (size ${tgtDim})`
      );
    }
  }
  return out;
}

// Apply a binary scalar op across two arrays via broadcast-strided iteration.
// Used by ops.js as the slow-path. fn(aVal, bVal) -> resultVal.
function broadcastBinary(a, b, fn) {
  const targetShape = broadcastShapes(a.shape, b.shape);
  const aStr = broadcastStrides(a.shape, a.strides, targetShape);
  const bStr = broadcastStrides(b.shape, b.strides, targetShape);
  const size = shapeProduct(targetShape);
  const out = new Float64Array(size);
  if (size === 0) return new NdArray(out, targetShape);

  const nd = targetShape.length;
  const idx = new Array(nd).fill(0);
  for (let i = 0; i < size; i++) {
    let aOff = 0, bOff = 0;
    for (let axis = 0; axis < nd; axis++) {
      aOff += idx[axis] * aStr[axis];
      bOff += idx[axis] * bStr[axis];
    }
    out[i] = fn(a.data[aOff], b.data[bOff]);
    for (let axis = nd - 1; axis >= 0; axis--) {
      idx[axis]++;
      if (idx[axis] < targetShape[axis]) break;
      idx[axis] = 0;
    }
  }
  return new NdArray(out, targetShape);
}

// Shape equality check (cheap).
function shapesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// concat(arrays, axis = 0) — joins arrays along an existing axis. Shapes must
// match exactly except along `axis`.

function concat(arrays, axis = 0) {
  if (!Array.isArray(arrays) || arrays.length === 0) {
    throw new TypeError('concat requires a non-empty array of NdArrays');
  }
  const ndim = arrays[0].ndim;
  if (axis < 0) axis = ndim + axis;
  if (axis < 0 || axis >= ndim) {
    throw new RangeError(`axis ${axis} out of bounds for ndim ${ndim}`);
  }
  const baseShape = arrays[0].shape;
  let totalAxis = 0;
  for (const arr of arrays) {
    if (arr.ndim !== ndim) {
      throw new RangeError(`concat: ndim mismatch (${arr.ndim} vs ${ndim})`);
    }
    for (let i = 0; i < ndim; i++) {
      if (i === axis) continue;
      if (arr.shape[i] !== baseShape[i]) {
        throw new RangeError(
          `concat: shape mismatch on axis ${i} (${arr.shape[i]} vs ${baseShape[i]})`
        );
      }
    }
    totalAxis += arr.shape[axis];
  }
  const outShape = baseShape.slice();
  outShape[axis] = totalAxis;
  const outSize = shapeProduct(outShape);
  const out = new Float64Array(outSize);

  let outerSize = 1;
  for (let i = 0; i < axis; i++) outerSize *= outShape[i];
  let innerSize = 1;
  for (let i = axis + 1; i < ndim; i++) innerSize *= outShape[i];

  for (let outer = 0; outer < outerSize; outer++) {
    let outAxisOff = 0;
    for (const arr of arrays) {
      const arrAxis = arr.shape[axis];
      const arrOff = outer * arrAxis * innerSize;
      const outOff = outer * totalAxis * innerSize + outAxisOff * innerSize;
      const span = arrAxis * innerSize;
      for (let i = 0; i < span; i++) out[outOff + i] = arr.data[arrOff + i];
      outAxisOff += arrAxis;
    }
  }
  return new NdArray(out, outShape);
}

// stack(arrays, axis = 0) — joins arrays along a NEW axis. All input shapes
// must match exactly. Result has ndim+1 dimensions.

function stack(arrays, axis = 0) {
  if (!Array.isArray(arrays) || arrays.length === 0) {
    throw new TypeError('stack requires a non-empty array of NdArrays');
  }
  const ndim = arrays[0].ndim;
  for (const arr of arrays) {
    if (!shapesEqual(arr.shape, arrays[0].shape)) {
      throw new RangeError(`stack: all arrays must have the same shape`);
    }
  }
  const targetNdim = ndim + 1;
  if (axis < 0) axis = targetNdim + axis;
  if (axis < 0 || axis > ndim) {
    throw new RangeError(`stack axis ${axis} out of bounds for ndim+1=${targetNdim}`);
  }
  const newShape = arrays[0].shape.slice();
  newShape.splice(axis, 0, arrays.length);
  const out = new Float64Array(shapeProduct(newShape));

  let outerSize = 1;
  for (let i = 0; i < axis; i++) outerSize *= newShape[i];
  let innerSize = 1;
  for (let i = axis + 1; i < newShape.length; i++) innerSize *= newShape[i];
  const k = arrays.length;

  for (let outer = 0; outer < outerSize; outer++) {
    for (let kk = 0; kk < k; kk++) {
      const srcOff = outer * innerSize;
      const dstOff = outer * k * innerSize + kk * innerSize;
      for (let i = 0; i < innerSize; i++) out[dstOff + i] = arrays[kk].data[srcOff + i];
    }
  }
  return new NdArray(out, newShape);
}

// ── creation.js ──

// Creation helpers — every function returns a freshly-allocated NdArray.


function _normalizeShape(shape) {
  if (typeof shape === 'number') return [shape];
  if (Array.isArray(shape)) return shape;
  throw new TypeError(`shape must be a number or array, got ${typeof shape}`);
}

function zeros(shape) {
  const sh = _normalizeShape(shape);
  validateShape(sh);
  return new NdArray(new Float64Array(shapeProduct(sh)), sh);
}

function ones(shape) {
  const sh = _normalizeShape(shape);
  validateShape(sh);
  const data = new Float64Array(shapeProduct(sh));
  data.fill(1);
  return new NdArray(data, sh);
}

function full(shape, value) {
  const sh = _normalizeShape(shape);
  validateShape(sh);
  const data = new Float64Array(shapeProduct(sh));
  data.fill(value);
  return new NdArray(data, sh);
}

function range(start, end, step) {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  if (step === undefined) step = 1;
  if (step === 0) throw new RangeError('range step must be non-zero');
  const n = Math.max(0, Math.ceil((end - start) / step));
  const data = new Float64Array(n);
  for (let i = 0; i < n; i++) data[i] = start + i * step;
  return new NdArray(data, [n]);
}

function linspace(a, b, n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`linspace count must be a non-negative integer, got ${n}`);
  }
  const data = new Float64Array(n);
  if (n === 1) {
    data[0] = a;
  } else if (n > 1) {
    const step = (b - a) / (n - 1);
    for (let i = 0; i < n; i++) data[i] = a + i * step;
  }
  return new NdArray(data, [n]);
}

function eye(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`eye size must be a non-negative integer, got ${n}`);
  }
  const data = new Float64Array(n * n);
  for (let i = 0; i < n; i++) data[i * n + i] = 1;
  return new NdArray(data, [n, n]);
}

function from(source, shape) {
  // Two modes:
  //   from(nestedArray)         -> auto-detect shape
  //   from(flatIterable, shape) -> reshape flat
  if (source instanceof NdArray) {
    const data = new Float64Array(source.data);
    return new NdArray(data, source.shape);
  }
  if (shape === undefined) {
    if (!Array.isArray(source)) {
      throw new TypeError('from() with no shape requires an array');
    }
    const detected = _detectShape(source);
    const data = new Float64Array(shapeProduct(detected));
    _flattenInto(source, data, 0, detected, 0);
    return new NdArray(data, detected);
  }
  const sh = _normalizeShape(shape);
  validateShape(sh);
  const size = shapeProduct(sh);
  const data = new Float64Array(size);
  let i = 0;
  for (const v of source) {
    if (i >= size) throw new RangeError(`source has more than ${size} elements`);
    data[i++] = v;
  }
  if (i !== size) {
    throw new RangeError(`source has ${i} elements, expected ${size} for shape [${sh.join(',')}]`);
  }
  return new NdArray(data, sh);
}

function _detectShape(arr) {
  const shape = [];
  let cur = arr;
  while (Array.isArray(cur)) {
    shape.push(cur.length);
    cur = cur.length > 0 ? cur[0] : null;
  }
  return shape;
}

function _flattenInto(arr, out, axis, shape, offset) {
  const dim = shape[axis];
  if (Array.isArray(arr) && arr.length !== dim) {
    throw new RangeError(`ragged array: axis ${axis} expected size ${dim}, got ${arr.length}`);
  }
  if (axis === shape.length - 1) {
    for (let i = 0; i < dim; i++) {
      const v = arr[i];
      if (typeof v !== 'number') {
        throw new TypeError(`expected number at deepest level, got ${typeof v}`);
      }
      out[offset + i] = v;
    }
    return;
  }
  let stride = 1;
  for (let k = axis + 1; k < shape.length; k++) stride *= shape[k];
  for (let i = 0; i < dim; i++) {
    if (!Array.isArray(arr[i])) {
      throw new TypeError(`expected array at axis ${axis + 1}, got ${typeof arr[i]}`);
    }
    _flattenInto(arr[i], out, axis + 1, shape, offset + i * stride);
  }
}

// ── ops.js ──

// Element-wise binary and unary operations.
//
// Binary ops use three-arm dispatch:
//   1. Scalar  (one operand is number)        → tight flat loop
//   2. Shape-equal (both NdArray, same shape) → tight flat loop, V8 vectorizes
//   3. Broadcast (compatible different shapes)→ stride-iterated slow path
//
// Each op is written out explicitly (no shared callback indirection) so V8
// can inline the inner operation.



// ===== add =====

function add(a, b) {
  if (typeof b === 'number') return _addScalar(a, b);
  if (typeof a === 'number') return _addScalar(b, a);
  if (shapesEqual(a.shape, b.shape)) {
    const out = new Float64Array(a.size);
    const ad = a.data, bd = b.data;
    for (let i = 0; i < a.size; i++) out[i] = ad[i] + bd[i];
    return new NdArray(out, a.shape);
  }
  return broadcastBinary(a, b, (x, y) => x + y);
}

function _addScalar(arr, s) {
  const out = new Float64Array(arr.size);
  const d = arr.data;
  for (let i = 0; i < arr.size; i++) out[i] = d[i] + s;
  return new NdArray(out, arr.shape);
}

// ===== sub =====

function sub(a, b) {
  if (typeof b === 'number') {
    const out = new Float64Array(a.size);
    const d = a.data;
    for (let i = 0; i < a.size; i++) out[i] = d[i] - b;
    return new NdArray(out, a.shape);
  }
  if (typeof a === 'number') {
    const out = new Float64Array(b.size);
    const d = b.data;
    for (let i = 0; i < b.size; i++) out[i] = a - d[i];
    return new NdArray(out, b.shape);
  }
  if (shapesEqual(a.shape, b.shape)) {
    const out = new Float64Array(a.size);
    const ad = a.data, bd = b.data;
    for (let i = 0; i < a.size; i++) out[i] = ad[i] - bd[i];
    return new NdArray(out, a.shape);
  }
  return broadcastBinary(a, b, (x, y) => x - y);
}

// ===== mul =====

function mul(a, b) {
  if (typeof b === 'number') return _mulScalar(a, b);
  if (typeof a === 'number') return _mulScalar(b, a);
  if (shapesEqual(a.shape, b.shape)) {
    const out = new Float64Array(a.size);
    const ad = a.data, bd = b.data;
    for (let i = 0; i < a.size; i++) out[i] = ad[i] * bd[i];
    return new NdArray(out, a.shape);
  }
  return broadcastBinary(a, b, (x, y) => x * y);
}

function _mulScalar(arr, s) {
  const out = new Float64Array(arr.size);
  const d = arr.data;
  for (let i = 0; i < arr.size; i++) out[i] = d[i] * s;
  return new NdArray(out, arr.shape);
}

// ===== div =====

function div(a, b) {
  if (typeof b === 'number') {
    const out = new Float64Array(a.size);
    const d = a.data;
    for (let i = 0; i < a.size; i++) out[i] = d[i] / b;
    return new NdArray(out, a.shape);
  }
  if (typeof a === 'number') {
    const out = new Float64Array(b.size);
    const d = b.data;
    for (let i = 0; i < b.size; i++) out[i] = a / d[i];
    return new NdArray(out, b.shape);
  }
  if (shapesEqual(a.shape, b.shape)) {
    const out = new Float64Array(a.size);
    const ad = a.data, bd = b.data;
    for (let i = 0; i < a.size; i++) out[i] = ad[i] / bd[i];
    return new NdArray(out, a.shape);
  }
  return broadcastBinary(a, b, (x, y) => x / y);
}

// ===== pow =====

function pow(a, b) {
  if (typeof b === 'number') {
    const out = new Float64Array(a.size);
    const d = a.data;
    for (let i = 0; i < a.size; i++) out[i] = Math.pow(d[i], b);
    return new NdArray(out, a.shape);
  }
  if (typeof a === 'number') {
    const out = new Float64Array(b.size);
    const d = b.data;
    for (let i = 0; i < b.size; i++) out[i] = Math.pow(a, d[i]);
    return new NdArray(out, b.shape);
  }
  if (shapesEqual(a.shape, b.shape)) {
    const out = new Float64Array(a.size);
    const ad = a.data, bd = b.data;
    for (let i = 0; i < a.size; i++) out[i] = Math.pow(ad[i], bd[i]);
    return new NdArray(out, a.shape);
  }
  return broadcastBinary(a, b, (x, y) => Math.pow(x, y));
}

// ===== unary =====

function neg(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = -d[i];
  return new NdArray(out, a.shape);
}

function abs(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.abs(d[i]);
  return new NdArray(out, a.shape);
}

function sqrt(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.sqrt(d[i]);
  return new NdArray(out, a.shape);
}

function log(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.log(d[i]);
  return new NdArray(out, a.shape);
}

function exp(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.exp(d[i]);
  return new NdArray(out, a.shape);
}

function sin(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.sin(d[i]);
  return new NdArray(out, a.shape);
}

function cos(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.cos(d[i]);
  return new NdArray(out, a.shape);
}

function tan(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.tan(d[i]);
  return new NdArray(out, a.shape);
}

function asin(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.asin(d[i]);
  return new NdArray(out, a.shape);
}

function acos(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.acos(d[i]);
  return new NdArray(out, a.shape);
}

function atan(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.atan(d[i]);
  return new NdArray(out, a.shape);
}

function floor(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.floor(d[i]);
  return new NdArray(out, a.shape);
}

function ceil(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.ceil(d[i]);
  return new NdArray(out, a.shape);
}

function round(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.round(d[i]);
  return new NdArray(out, a.shape);
}

function sign(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Math.sign(d[i]);
  return new NdArray(out, a.shape);
}

function isnan(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Number.isNaN(d[i]) ? 1 : 0;
  return new NdArray(out, a.shape);
}

function isfinite(a) {
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) out[i] = Number.isFinite(d[i]) ? 1 : 0;
  return new NdArray(out, a.shape);
}

// ===== additional binary ops =====
//
// These use a helper with three-arm dispatch (scalar / shape-equal / broadcast).
// V8 inlines small monomorphic callbacks for the helper; vec's hottest binary
// ops (add, sub, mul, div, pow above) stay written out explicitly.

function _binary(a, b, fn) {
  if (typeof b === 'number') {
    const out = new Float64Array(a.size);
    const d = a.data;
    for (let i = 0; i < a.size; i++) out[i] = fn(d[i], b);
    return new NdArray(out, a.shape);
  }
  if (typeof a === 'number') {
    const out = new Float64Array(b.size);
    const d = b.data;
    for (let i = 0; i < b.size; i++) out[i] = fn(a, d[i]);
    return new NdArray(out, b.shape);
  }
  if (shapesEqual(a.shape, b.shape)) {
    const out = new Float64Array(a.size);
    const ad = a.data, bd = b.data;
    for (let i = 0; i < a.size; i++) out[i] = fn(ad[i], bd[i]);
    return new NdArray(out, a.shape);
  }
  return broadcastBinary(a, b, fn);
}

function atan2(y, x)   { return _binary(y, x, Math.atan2); }
function hypot(a, b)   { return _binary(a, b, Math.hypot); }
function maximum(a, b) { return _binary(a, b, (x, y) => x > y ? x : y); }
function minimum(a, b) { return _binary(a, b, (x, y) => x < y ? x : y); }

function eq(a, b) { return _binary(a, b, (x, y) => x === y ? 1 : 0); }
function ne(a, b) { return _binary(a, b, (x, y) => x !== y ? 1 : 0); }
function lt(a, b) { return _binary(a, b, (x, y) => x <  y ? 1 : 0); }
function le(a, b) { return _binary(a, b, (x, y) => x <= y ? 1 : 0); }
function gt(a, b) { return _binary(a, b, (x, y) => x >  y ? 1 : 0); }
function ge(a, b) { return _binary(a, b, (x, y) => x >= y ? 1 : 0); }

// ── selection.js ──

// Selection helpers — where (element-wise ternary), clip (clamp to range).



// where(cond, a, b) — out[i] = cond[i] ? a[i] : b[i].
//
// `cond` must be an NdArray; truthiness is the standard JS rule (non-zero,
// non-NaN). `a` and `b` may be either NdArrays with the same shape as cond,
// or scalars. Full broadcasting between cond/a/b is not supported in v1;
// shape-equal or scalar arguments only.

function where(cond, a, b) {
  if (!(cond instanceof NdArray)) {
    throw new TypeError('where: cond must be an NdArray');
  }
  const aIsScalar = typeof a === 'number';
  const bIsScalar = typeof b === 'number';
  if (!aIsScalar && !(a instanceof NdArray)) {
    throw new TypeError('where: a must be NdArray or number');
  }
  if (!bIsScalar && !(b instanceof NdArray)) {
    throw new TypeError('where: b must be NdArray or number');
  }
  if (!aIsScalar && !shapesEqual(cond.shape, a.shape)) {
    throw new RangeError(
      `where: a shape [${a.shape.join(',')}] must match cond shape [${cond.shape.join(',')}]`
    );
  }
  if (!bIsScalar && !shapesEqual(cond.shape, b.shape)) {
    throw new RangeError(
      `where: b shape [${b.shape.join(',')}] must match cond shape [${cond.shape.join(',')}]`
    );
  }
  const out = new Float64Array(cond.size);
  const cd = cond.data;
  const ad = aIsScalar ? null : a.data;
  const bd = bIsScalar ? null : b.data;
  for (let i = 0; i < cond.size; i++) {
    out[i] = cd[i] ? (aIsScalar ? a : ad[i]) : (bIsScalar ? b : bd[i]);
  }
  return new NdArray(out, cond.shape);
}

// clip(a, lo, hi) — clamp each element to the range [lo, hi].
// lo and hi are scalars in v1.

function clip(a, lo, hi) {
  if (!(a instanceof NdArray)) {
    throw new TypeError('clip: a must be an NdArray');
  }
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError('clip: lo and hi must be numbers');
  }
  const out = new Float64Array(a.size);
  const d = a.data;
  for (let i = 0; i < a.size; i++) {
    const v = d[i];
    out[i] = v < lo ? lo : v > hi ? hi : v;
  }
  return new NdArray(out, a.shape);
}

// ── reduce.js ──

// Reductions — sum/mean/max/min/std/var with optional axis,
// dot (overloaded by ndim), norm.
//
// Without axis: returns a scalar number.
// With { axis: i }: returns an NdArray with that axis removed.



function _normalizeAxis(axis, ndim) {
  if (axis < 0) axis = ndim + axis;
  if (axis < 0 || axis >= ndim) {
    throw new RangeError(`axis ${axis} out of bounds for ndim ${ndim}`);
  }
  return axis;
}

// Generic per-axis reducer. init/combine/finalize define the operation.
//   init: starting accumulator value.
//   combine(acc, value): fold step.
//   finalize(acc, count): final transform per output cell.
function _reduceAxis(arr, axis, init, combine, finalize) {
  axis = _normalizeAxis(axis, arr.ndim);
  const reduceSize = arr.shape[axis];

  let outerSize = 1;
  for (let i = 0; i < axis; i++) outerSize *= arr.shape[i];
  let innerSize = 1;
  for (let i = axis + 1; i < arr.ndim; i++) innerSize *= arr.shape[i];

  const outShape = arr.shape.slice(0, axis).concat(arr.shape.slice(axis + 1));
  const out = new Float64Array(outerSize * innerSize);
  const d = arr.data;

  for (let outer = 0; outer < outerSize; outer++) {
    const outerOff = outer * reduceSize * innerSize;
    for (let inner = 0; inner < innerSize; inner++) {
      let acc = init;
      const baseOff = outerOff + inner;
      for (let r = 0; r < reduceSize; r++) {
        acc = combine(acc, d[baseOff + r * innerSize]);
      }
      out[outer * innerSize + inner] = finalize(acc, reduceSize);
    }
  }
  return new NdArray(out, outShape);
}

// ---------- sum ----------
//
// Hot path: 4 parallel accumulators so V8 can use independent
// arithmetic units and auto-vectorize to AVX f64x4. ~3.5× speedup
// vs single accumulator on n ≥ 512. Sub-arrays smaller than 4 fall
// through the tail loop. See test/vec-v8-winking-bench.mjs.

function sum(a, opts) {
  if (opts && opts.axis !== undefined) {
    return _reduceAxis(a, opts.axis, 0, (x, y) => x + y, (x) => x);
  }
  const d = a.data;
  const n = a.size;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  const n4 = n - (n & 3);
  let i = 0;
  for (; i < n4; i += 4) {
    s0 += d[i  ];
    s1 += d[i+1];
    s2 += d[i+2];
    s3 += d[i+3];
  }
  let acc = (s0 + s1) + (s2 + s3);
  for (; i < n; i++) acc += d[i];
  return acc;
}

// ---------- mean ----------

function mean(a, opts) {
  if (opts && opts.axis !== undefined) {
    return _reduceAxis(a, opts.axis, 0, (x, y) => x + y, (x, n) => x / n);
  }
  if (a.size === 0) return NaN;
  return sum(a) / a.size;
}

// ---------- max / min ----------

function max(a, opts) {
  if (opts && opts.axis !== undefined) {
    return _reduceAxis(a, opts.axis, -Infinity, (x, y) => (y > x ? y : x), (x) => x);
  }
  if (a.size === 0) return -Infinity;
  let m = a.data[0];
  const d = a.data;
  for (let i = 1; i < a.size; i++) if (d[i] > m) m = d[i];
  return m;
}

function min(a, opts) {
  if (opts && opts.axis !== undefined) {
    return _reduceAxis(a, opts.axis, Infinity, (x, y) => (y < x ? y : x), (x) => x);
  }
  if (a.size === 0) return Infinity;
  let m = a.data[0];
  const d = a.data;
  for (let i = 1; i < a.size; i++) if (d[i] < m) m = d[i];
  return m;
}

// ---------- variance / standard deviation ----------
// Two-pass: numerically stable, easy to reason about. ddof default 0 (population).
// opts: { axis?, ddof? }

function _varAllAxes(a, ddof) {
  const n = a.size;
  const denom = n - ddof;
  if (denom <= 0) return NaN;
  const m = mean(a);  // mean() inherits sum's unrolled-4 form
  const d = a.data;
  // Unrolled-4 sum-of-squared-deviations
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  const n4 = n - (n & 3);
  let i = 0;
  for (; i < n4; i += 4) {
    const x0 = d[i  ] - m;
    const x1 = d[i+1] - m;
    const x2 = d[i+2] - m;
    const x3 = d[i+3] - m;
    s0 += x0 * x0;
    s1 += x1 * x1;
    s2 += x2 * x2;
    s3 += x3 * x3;
  }
  let s = (s0 + s1) + (s2 + s3);
  for (; i < n; i++) {
    const x = d[i] - m;
    s += x * x;
  }
  return s / denom;
}

function _varAxis(arr, axis, ddof) {
  axis = _normalizeAxis(axis, arr.ndim);
  const reduceSize = arr.shape[axis];
  const denom = reduceSize - ddof;
  let outerSize = 1;
  for (let i = 0; i < axis; i++) outerSize *= arr.shape[i];
  let innerSize = 1;
  for (let i = axis + 1; i < arr.ndim; i++) innerSize *= arr.shape[i];
  const outShape = arr.shape.slice(0, axis).concat(arr.shape.slice(axis + 1));
  const out = new Float64Array(outerSize * innerSize);
  const d = arr.data;

  for (let outer = 0; outer < outerSize; outer++) {
    const outerOff = outer * reduceSize * innerSize;
    for (let inner = 0; inner < innerSize; inner++) {
      const baseOff = outerOff + inner;
      let s = 0;
      for (let r = 0; r < reduceSize; r++) s += d[baseOff + r * innerSize];
      const m = s / reduceSize;
      let ss = 0;
      for (let r = 0; r < reduceSize; r++) {
        const x = d[baseOff + r * innerSize] - m;
        ss += x * x;
      }
      out[outer * innerSize + inner] = denom > 0 ? ss / denom : NaN;
    }
  }
  return new NdArray(out, outShape);
}

function variance(a, opts) {
  const ddof = (opts && opts.ddof !== undefined) ? opts.ddof : 0;
  if (opts && opts.axis !== undefined) return _varAxis(a, opts.axis, ddof);
  return _varAllAxes(a, ddof);
}

// Alias for the more numpy-ish name.

function std(a, opts) {
  const v = variance(a, opts);
  if (typeof v === 'number') return Math.sqrt(v);
  const out = new Float64Array(v.size);
  for (let i = 0; i < v.size; i++) out[i] = Math.sqrt(v.data[i]);
  return new NdArray(out, v.shape);
}

// ---------- norm ----------
// L2 norm of the flattened array. Returns scalar.
//
// Same V8-winking pattern as sum — 4 parallel accumulators.
// Beats alpack-f64 dnrm2 by ~1.4× at n=32k and ~2.1× at n=262k
// (V8 auto-vectorizes to AVX f64x4 vs Wasm SIMD's f64x2).

function norm(a) {
  const d = a.data;
  const n = a.size;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  const n4 = n - (n & 3);
  let i = 0;
  for (; i < n4; i += 4) {
    s0 += d[i  ] * d[i  ];
    s1 += d[i+1] * d[i+1];
    s2 += d[i+2] * d[i+2];
    s3 += d[i+3] * d[i+3];
  }
  let s = (s0 + s1) + (s2 + s3);
  for (; i < n; i++) s += d[i] * d[i];
  return Math.sqrt(s);
}

// ---------- dot ----------
// 1D · 1D → scalar
// 2D · 1D → 1D NdArray (matrix-vector)
// 1D · 2D → 1D NdArray (vector-matrix)
// 2D · 2D → delegates to matmul (imported lazily to avoid module init order)

function dot(a, b) {
  // 1D · 1D — V8-winked unrolled-4. At n=32k, beats vec's previous
  // single-accumulator form by ~3× and matches alpack's wasm SIMD.
  if (a.ndim === 1 && b.ndim === 1) {
    if (a.size !== b.size) {
      throw new RangeError(`dot: 1D length mismatch ${a.size} vs ${b.size}`);
    }
    const ad = a.data, bd = b.data;
    const n = a.size;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    const n4 = n - (n & 3);
    let i = 0;
    for (; i < n4; i += 4) {
      s0 += ad[i  ] * bd[i  ];
      s1 += ad[i+1] * bd[i+1];
      s2 += ad[i+2] * bd[i+2];
      s3 += ad[i+3] * bd[i+3];
    }
    let s = (s0 + s1) + (s2 + s3);
    for (; i < n; i++) s += ad[i] * bd[i];
    return s;
  }
  // 2D · 1D — matrix-vector. Inner loop unrolled-4 over the column axis.
  // ~1.5-2× over the previous naive form across n=64..4096.
  if (a.ndim === 2 && b.ndim === 1) {
    const m = a.shape[0], n = a.shape[1];
    if (n !== b.size) {
      throw new RangeError(`dot: shape [${m},${n}] cannot multiply vector of length ${b.size}`);
    }
    const out = new Float64Array(m);
    const ad = a.data, bd = b.data;
    const n4 = n - (n & 3);
    for (let i = 0; i < m; i++) {
      const aRow = i * n;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      let j = 0;
      for (; j < n4; j += 4) {
        s0 += ad[aRow + j  ] * bd[j  ];
        s1 += ad[aRow + j+1] * bd[j+1];
        s2 += ad[aRow + j+2] * bd[j+2];
        s3 += ad[aRow + j+3] * bd[j+3];
      }
      let s = (s0 + s1) + (s2 + s3);
      for (; j < n; j++) s += ad[aRow + j] * bd[j];
      out[i] = s;
    }
    return new NdArray(out, [m]);
  }
  // 1D · 2D — vector-matrix. Column-major reduction; the inner loop
  // strides through B by N which is harder for V8 to auto-vectorize,
  // but the unrolled-4 form still helps via parallel accumulators.
  if (a.ndim === 1 && b.ndim === 2) {
    const m = b.shape[0], n = b.shape[1];
    if (a.size !== m) {
      throw new RangeError(`dot: vector length ${a.size} cannot multiply [${m},${n}]`);
    }
    const out = new Float64Array(n);
    const ad = a.data, bd = b.data;
    const m4 = m - (m & 3);
    for (let j = 0; j < n; j++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      let k = 0;
      for (; k < m4; k += 4) {
        s0 += ad[k  ] * bd[ k    * n + j];
        s1 += ad[k+1] * bd[(k+1) * n + j];
        s2 += ad[k+2] * bd[(k+2) * n + j];
        s3 += ad[k+3] * bd[(k+3) * n + j];
      }
      let s = (s0 + s1) + (s2 + s3);
      for (; k < m; k++) s += ad[k] * bd[k * n + j];
      out[j] = s;
    }
    return new NdArray(out, [n]);
  }
  if (a.ndim === 2 && b.ndim === 2) {
    // 2D · 2D dot is matmul — delegate to the register-tiled kernel.
    return matmul(a, b);
  }
  throw new RangeError(`dot: unsupported ndim combination (${a.ndim}, ${b.ndim})`);
}

// ---------- prod ----------

function prod(a, opts) {
  if (opts && opts.axis !== undefined) {
    return _reduceAxis(a, opts.axis, 1, (x, y) => x * y, (x) => x);
  }
  let acc = 1;
  const d = a.data;
  for (let i = 0; i < a.size; i++) acc *= d[i];
  return acc;
}

// ---------- cumsum / cumprod ----------
// With axis: returns array of same shape with running sum/product along that axis.
// Without axis: numpy convention — flatten, return 1D running result.

function _cumAxis(arr, axis, init, combine) {
  axis = _normalizeAxis(axis, arr.ndim);
  const reduceSize = arr.shape[axis];
  let outerSize = 1;
  for (let i = 0; i < axis; i++) outerSize *= arr.shape[i];
  let innerSize = 1;
  for (let i = axis + 1; i < arr.ndim; i++) innerSize *= arr.shape[i];
  const out = new Float64Array(arr.size);
  const d = arr.data;
  for (let outer = 0; outer < outerSize; outer++) {
    const outerOff = outer * reduceSize * innerSize;
    for (let inner = 0; inner < innerSize; inner++) {
      let acc = init;
      for (let r = 0; r < reduceSize; r++) {
        const idx = outerOff + r * innerSize + inner;
        acc = combine(acc, d[idx]);
        out[idx] = acc;
      }
    }
  }
  return new NdArray(out, arr.shape);
}

function cumsum(a, opts) {
  if (opts && opts.axis !== undefined) return _cumAxis(a, opts.axis, 0, (x, y) => x + y);
  const out = new Float64Array(a.size);
  const d = a.data;
  let acc = 0;
  for (let i = 0; i < a.size; i++) { acc += d[i]; out[i] = acc; }
  return new NdArray(out, [a.size]);
}

function cumprod(a, opts) {
  if (opts && opts.axis !== undefined) return _cumAxis(a, opts.axis, 1, (x, y) => x * y);
  const out = new Float64Array(a.size);
  const d = a.data;
  let acc = 1;
  for (let i = 0; i < a.size; i++) { acc *= d[i]; out[i] = acc; }
  return new NdArray(out, [a.size]);
}

// ---------- argmin / argmax ----------
// Without axis: scalar (flat index).
// With axis: NdArray of indices with that axis removed.

function _argAxis(arr, axis, mode) {
  axis = _normalizeAxis(axis, arr.ndim);
  const reduceSize = arr.shape[axis];
  let outerSize = 1;
  for (let i = 0; i < axis; i++) outerSize *= arr.shape[i];
  let innerSize = 1;
  for (let i = axis + 1; i < arr.ndim; i++) innerSize *= arr.shape[i];
  const outShape = arr.shape.slice(0, axis).concat(arr.shape.slice(axis + 1));
  const out = new Float64Array(outerSize * innerSize);
  const d = arr.data;
  for (let outer = 0; outer < outerSize; outer++) {
    const outerOff = outer * reduceSize * innerSize;
    for (let inner = 0; inner < innerSize; inner++) {
      const baseOff = outerOff + inner;
      let bestIdx = 0;
      let bestVal = d[baseOff];
      if (mode === 'min') {
        for (let r = 1; r < reduceSize; r++) {
          const v = d[baseOff + r * innerSize];
          if (v < bestVal) { bestVal = v; bestIdx = r; }
        }
      } else {
        for (let r = 1; r < reduceSize; r++) {
          const v = d[baseOff + r * innerSize];
          if (v > bestVal) { bestVal = v; bestIdx = r; }
        }
      }
      out[outer * innerSize + inner] = bestIdx;
    }
  }
  return new NdArray(out, outShape);
}

function argmin(a, opts) {
  if (opts && opts.axis !== undefined) return _argAxis(a, opts.axis, 'min');
  if (a.size === 0) throw new RangeError('argmin of empty array');
  let mi = 0;
  const d = a.data;
  for (let i = 1; i < a.size; i++) if (d[i] < d[mi]) mi = i;
  return mi;
}

function argmax(a, opts) {
  if (opts && opts.axis !== undefined) return _argAxis(a, opts.axis, 'max');
  if (a.size === 0) throw new RangeError('argmax of empty array');
  let mi = 0;
  const d = a.data;
  for (let i = 1; i < a.size; i++) if (d[i] > d[mi]) mi = i;
  return mi;
}

// ---------- trace ----------
// Sum of the diagonal of a 2D matrix (square or rectangular).

function trace(A) {
  if (A.ndim !== 2) {
    throw new RangeError(`trace requires 2D array, got ${A.ndim}D`);
  }
  const m = A.shape[0], n = A.shape[1];
  const k = Math.min(m, n);
  let s = 0;
  const d = A.data;
  for (let i = 0; i < k; i++) s += d[i * n + i];
  return s;
}

// ── linalg-mul.js ──

// Matrix multiplication, transpose, and closed-form det/inv for 2×2, 3×3, 4×4.


// ---------- matmul ----------
// 2D × 2D matrix multiplication using a 4×4 register-blocked microkernel.
// Sixteen scalar accumulators per output tile sit in V8's xmm registers
// across the entire k-loop, so the inner loop is 16 fused multiply-adds
// of register-resident values per k step — no spilling for typical N.
//
// Performance vs the previous i,k,j form (test/line-gemm-bench.mjs):
//   N=64    line.matmul: 178 → 83 μs    (2.1× faster)
//   N=256   line.matmul: 12303 → 4469 μs (2.8× faster)
//   N=1024  line.matmul: 769ms → 330ms   (2.3× faster)
//
// And vs alpack's hand-coded wasm SIMD (2x2 microkernel using f64x2):
//   N=512    JS 4x4: 39.6 ms,  alpack: 42.4 ms — JS WINS 1.06×
//   N=1024   JS 4x4: 330 ms,   alpack: 335 ms  — JS WINS 1.02×
//
// V8 auto-vectorizes the 4×4 structure across the j-axis (4-wide AVX),
// so the JS form effectively runs a wider SIMD than Wasm's f64x2 spec
// ceiling. At medium N (32-256) alpack's tuned SIMD still wins by
// 1.8-2.5×; at very large N memory bandwidth dominates and the wider
// AVX puts JS ahead.
//
// Tails: scalar fallback for M%4 rows, N%4 columns — keeps the
// algorithm correct for arbitrary dimensions.

function matmul(A, B) {
  if (A.ndim !== 2 || B.ndim !== 2) {
    throw new RangeError(`matmul requires 2D arrays, got ${A.ndim}D × ${B.ndim}D`);
  }
  const M = A.shape[0], K = A.shape[1];
  const Kb = B.shape[0], N = B.shape[1];
  if (K !== Kb) {
    throw new RangeError(`matmul inner dim mismatch: [${M},${K}] × [${Kb},${N}]`);
  }
  const C = new Float64Array(M * N);
  const ad = A.data, bd = B.data;
  const M4 = M - (M & 3);
  const N4 = N - (N & 3);
  // Main 4×4 tile body
  for (let i = 0; i < M4; i += 4) {
    const a0Row =  i      * K;
    const a1Row = (i + 1) * K;
    const a2Row = (i + 2) * K;
    const a3Row = (i + 3) * K;
    for (let j = 0; j < N4; j += 4) {
      let c00 = 0, c01 = 0, c02 = 0, c03 = 0;
      let c10 = 0, c11 = 0, c12 = 0, c13 = 0;
      let c20 = 0, c21 = 0, c22 = 0, c23 = 0;
      let c30 = 0, c31 = 0, c32 = 0, c33 = 0;
      for (let k = 0; k < K; k++) {
        const a0 = ad[a0Row + k];
        const a1 = ad[a1Row + k];
        const a2 = ad[a2Row + k];
        const a3 = ad[a3Row + k];
        const bRow = k * N;
        const b0 = bd[bRow + j    ];
        const b1 = bd[bRow + j + 1];
        const b2 = bd[bRow + j + 2];
        const b3 = bd[bRow + j + 3];
        c00 += a0 * b0; c01 += a0 * b1; c02 += a0 * b2; c03 += a0 * b3;
        c10 += a1 * b0; c11 += a1 * b1; c12 += a1 * b2; c13 += a1 * b3;
        c20 += a2 * b0; c21 += a2 * b1; c22 += a2 * b2; c23 += a2 * b3;
        c30 += a3 * b0; c31 += a3 * b1; c32 += a3 * b2; c33 += a3 * b3;
      }
      const c0 =  i      * N + j;
      const c1 = (i + 1) * N + j;
      const c2 = (i + 2) * N + j;
      const c3 = (i + 3) * N + j;
      C[c0    ] = c00; C[c0 + 1] = c01; C[c0 + 2] = c02; C[c0 + 3] = c03;
      C[c1    ] = c10; C[c1 + 1] = c11; C[c1 + 2] = c12; C[c1 + 3] = c13;
      C[c2    ] = c20; C[c2 + 1] = c21; C[c2 + 2] = c22; C[c2 + 3] = c23;
      C[c3    ] = c30; C[c3 + 1] = c31; C[c3 + 2] = c32; C[c3 + 3] = c33;
    }
    // Tail columns (N % 4) — 4 rows × 1 column at a time
    for (let j = N4; j < N; j++) {
      let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
      for (let k = 0; k < K; k++) {
        const bv = bd[k * N + j];
        c0 += ad[a0Row + k] * bv;
        c1 += ad[a1Row + k] * bv;
        c2 += ad[a2Row + k] * bv;
        c3 += ad[a3Row + k] * bv;
      }
      C[ i      * N + j] = c0;
      C[(i + 1) * N + j] = c1;
      C[(i + 2) * N + j] = c2;
      C[(i + 3) * N + j] = c3;
    }
  }
  // Tail rows (M % 4) — scalar i,k,j for the leftover ≤3 rows
  for (let i = M4; i < M; i++) {
    const aRow = i * K;
    const oRow = i * N;
    for (let k = 0; k < K; k++) {
      const aik = ad[aRow + k];
      const bRow = k * N;
      for (let j = 0; j < N; j++) {
        C[oRow + j] += aik * bd[bRow + j];
      }
    }
  }
  return new NdArray(C, [M, N]);
}

// ---------- transpose ----------
// 2D only in v1. Returns a new contiguous array with axes swapped.

function transpose(A) {
  if (A.ndim !== 2) {
    throw new RangeError(`transpose v1 requires 2D, got ${A.ndim}D`);
  }
  const m = A.shape[0], n = A.shape[1];
  const out = new Float64Array(m * n);
  const d = A.data;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      out[j * m + i] = d[i * n + j];
    }
  }
  return new NdArray(out, [n, m]);
}

// ---------- closed-form determinants ----------

function _checkSquare(A, size, name) {
  if (A.ndim !== 2 || A.shape[0] !== size || A.shape[1] !== size) {
    throw new RangeError(`${name} requires a ${size}×${size} matrix, got [${A.shape.join(',')}]`);
  }
}

function det2(A) {
  _checkSquare(A, 2, 'det2');
  const d = A.data;
  return d[0] * d[3] - d[1] * d[2];
}

function det3(A) {
  _checkSquare(A, 3, 'det3');
  const d = A.data;
  // Sarrus / Laplace along row 0.
  const a = d[0], b = d[1], c = d[2];
  const e = d[3], f = d[4], g = d[5];
  const h = d[6], i = d[7], j = d[8];
  return a * (f * j - g * i) - b * (e * j - g * h) + c * (e * i - f * h);
}

function det4(A) {
  _checkSquare(A, 4, 'det4');
  const d = A.data;
  const a00 = d[0],  a01 = d[1],  a02 = d[2],  a03 = d[3];
  const a10 = d[4],  a11 = d[5],  a12 = d[6],  a13 = d[7];
  const a20 = d[8],  a21 = d[9],  a22 = d[10], a23 = d[11];
  const a30 = d[12], a31 = d[13], a32 = d[14], a33 = d[15];

  // 2×2 sub-determinants from rows 2,3 (reused).
  const s01 = a20 * a31 - a21 * a30;
  const s02 = a20 * a32 - a22 * a30;
  const s03 = a20 * a33 - a23 * a30;
  const s12 = a21 * a32 - a22 * a31;
  const s13 = a21 * a33 - a23 * a31;
  const s23 = a22 * a33 - a23 * a32;

  // det via expansion along row 0 grouped by 2×2 minors of (a1*, s_*).
  return (
      a00 * (a11 * s23 - a12 * s13 + a13 * s12)
    - a01 * (a10 * s23 - a12 * s03 + a13 * s02)
    + a02 * (a10 * s13 - a11 * s03 + a13 * s01)
    - a03 * (a10 * s12 - a11 * s02 + a12 * s01)
  );
}

// ---------- closed-form inverses ----------
// All throw on singular matrices (det == 0). Caller can wrap in try/catch.

function _singularError(name) {
  return new Error(`${name}: matrix is singular (determinant is zero)`);
}

function inv2(A) {
  _checkSquare(A, 2, 'inv2');
  const d = A.data;
  const det = d[0] * d[3] - d[1] * d[2];
  if (det === 0) throw _singularError('inv2');
  const k = 1 / det;
  const out = new Float64Array(4);
  out[0] =  d[3] * k;
  out[1] = -d[1] * k;
  out[2] = -d[2] * k;
  out[3] =  d[0] * k;
  return new NdArray(out, [2, 2]);
}

function inv3(A) {
  _checkSquare(A, 3, 'inv3');
  const d = A.data;
  const a = d[0], b = d[1], c = d[2];
  const e = d[3], f = d[4], g = d[5];
  const h = d[6], i = d[7], j = d[8];
  // Cofactors (signed minors).
  const c00 =  (f * j - g * i);
  const c01 = -(e * j - g * h);
  const c02 =  (e * i - f * h);
  const det = a * c00 + b * c01 + c * c02;
  if (det === 0) throw _singularError('inv3');
  const c10 = -(b * j - c * i);
  const c11 =  (a * j - c * h);
  const c12 = -(a * i - b * h);
  const c20 =  (b * g - c * f);
  const c21 = -(a * g - c * e);
  const c22 =  (a * f - b * e);
  const k = 1 / det;
  const out = new Float64Array(9);
  // adjugate = transpose of cofactor matrix; inverse = adjugate / det.
  out[0] = c00 * k; out[1] = c10 * k; out[2] = c20 * k;
  out[3] = c01 * k; out[4] = c11 * k; out[5] = c21 * k;
  out[6] = c02 * k; out[7] = c12 * k; out[8] = c22 * k;
  return new NdArray(out, [3, 3]);
}

// ---------- diag / outer / tril / triu ----------

// diag(a, k = 0):
//   1D input → 2D matrix with `a` placed on the k-th diagonal (k>0 above
//   the main diagonal, k<0 below). Off-diagonal entries are zero.
//   2D input → 1D vector of the k-th diagonal.

function diag(a, k = 0) {
  if (a.ndim === 1) {
    const n = a.size + Math.abs(k);
    const out = new Float64Array(n * n);
    for (let i = 0; i < a.size; i++) {
      const row = k >= 0 ? i : i - k;
      const col = k >= 0 ? i + k : i;
      out[row * n + col] = a.data[i];
    }
    return new NdArray(out, [n, n]);
  }
  if (a.ndim === 2) {
    const m = a.shape[0], n = a.shape[1];
    const len = k >= 0 ? Math.min(m, n - k) : Math.min(m + k, n);
    if (len <= 0) return new NdArray(new Float64Array(0), [0]);
    const out = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      const row = k >= 0 ? i : i - k;
      const col = k >= 0 ? i + k : i;
      out[i] = a.data[row * n + col];
    }
    return new NdArray(out, [len]);
  }
  throw new RangeError(`diag requires 1D or 2D, got ${a.ndim}D`);
}

// outer(a, b) — outer product of two 1D vectors. out[i, j] = a[i] * b[j].

function outer(a, b) {
  if (a.ndim !== 1 || b.ndim !== 1) {
    throw new RangeError(`outer requires two 1D vectors, got ${a.ndim}D × ${b.ndim}D`);
  }
  const m = a.size, n = b.size;
  const out = new Float64Array(m * n);
  const ad = a.data, bd = b.data;
  for (let i = 0; i < m; i++) {
    const ai = ad[i];
    for (let j = 0; j < n; j++) out[i * n + j] = ai * bd[j];
  }
  return new NdArray(out, [m, n]);
}

// tril(A, k = 0) — keep entries on/below the k-th diagonal, zero the rest.
// k > 0 keeps additional bands above; k < 0 zeroes bands at and above main.

function tril(A, k = 0) {
  if (A.ndim !== 2) throw new RangeError(`tril requires 2D, got ${A.ndim}D`);
  const m = A.shape[0], n = A.shape[1];
  const out = new Float64Array(m * n);
  const d = A.data;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (j - i <= k) out[i * n + j] = d[i * n + j];
    }
  }
  return new NdArray(out, [m, n]);
}

// triu(A, k = 0) — keep entries on/above the k-th diagonal, zero the rest.

function triu(A, k = 0) {
  if (A.ndim !== 2) throw new RangeError(`triu requires 2D, got ${A.ndim}D`);
  const m = A.shape[0], n = A.shape[1];
  const out = new Float64Array(m * n);
  const d = A.data;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (j - i >= k) out[i * n + j] = d[i * n + j];
    }
  }
  return new NdArray(out, [m, n]);
}

function inv4(A) {
  _checkSquare(A, 4, 'inv4');
  const d = A.data;
  const a00 = d[0],  a01 = d[1],  a02 = d[2],  a03 = d[3];
  const a10 = d[4],  a11 = d[5],  a12 = d[6],  a13 = d[7];
  const a20 = d[8],  a21 = d[9],  a22 = d[10], a23 = d[11];
  const a30 = d[12], a31 = d[13], a32 = d[14], a33 = d[15];

  // 2×2 sub-dets from rows 0,1.
  const t01 = a00 * a11 - a01 * a10;
  const t02 = a00 * a12 - a02 * a10;
  const t03 = a00 * a13 - a03 * a10;
  const t12 = a01 * a12 - a02 * a11;
  const t13 = a01 * a13 - a03 * a11;
  const t23 = a02 * a13 - a03 * a12;

  // 2×2 sub-dets from rows 2,3.
  const s01 = a20 * a31 - a21 * a30;
  const s02 = a20 * a32 - a22 * a30;
  const s03 = a20 * a33 - a23 * a30;
  const s12 = a21 * a32 - a22 * a31;
  const s13 = a21 * a33 - a23 * a31;
  const s23 = a22 * a33 - a23 * a32;

  const det = t01 * s23 - t02 * s13 + t03 * s12 + t12 * s03 - t13 * s02 + t23 * s01;
  if (det === 0) throw _singularError('inv4');
  const k = 1 / det;

  // Adjugate via the standard 4×4 inverse formula expressed in t_ij / s_ij.
  const out = new Float64Array(16);
  out[0]  = ( a11 * s23 - a12 * s13 + a13 * s12) * k;
  out[1]  = (-a01 * s23 + a02 * s13 - a03 * s12) * k;
  out[2]  = ( a31 * t23 - a32 * t13 + a33 * t12) * k;
  out[3]  = (-a21 * t23 + a22 * t13 - a23 * t12) * k;

  out[4]  = (-a10 * s23 + a12 * s03 - a13 * s02) * k;
  out[5]  = ( a00 * s23 - a02 * s03 + a03 * s02) * k;
  out[6]  = (-a30 * t23 + a32 * t03 - a33 * t02) * k;
  out[7]  = ( a20 * t23 - a22 * t03 + a23 * t02) * k;

  out[8]  = ( a10 * s13 - a11 * s03 + a13 * s01) * k;
  out[9]  = (-a00 * s13 + a01 * s03 - a03 * s01) * k;
  out[10] = ( a30 * t13 - a31 * t03 + a33 * t01) * k;
  out[11] = (-a20 * t13 + a21 * t03 - a23 * t01) * k;

  out[12] = (-a10 * s12 + a11 * s02 - a12 * s01) * k;
  out[13] = ( a00 * s12 - a01 * s02 + a02 * s01) * k;
  out[14] = (-a30 * t12 + a31 * t02 - a32 * t01) * k;
  out[15] = ( a20 * t12 - a21 * t02 + a22 * t01) * k;

  return new NdArray(out, [4, 4]);
}

// ── linalg-solve.js ──

// Linear systems: LU + partial pivoting, Cholesky for SPD, det / inv via LU.
//
// Targets well-conditioned dense matrices up to ~200×200 in pure JS. For
// ill-conditioned or large systems, fall back to natra+alpack (pivoted QR/SVD).


function _checkSquare2D(A, name) {
  if (A.ndim !== 2 || A.shape[0] !== A.shape[1]) {
    throw new RangeError(`${name} requires a square 2D matrix, got [${A.shape.join(',')}]`);
  }
  return A.shape[0];
}

// ---------- LU decomposition with partial pivoting ----------
// Returns { lu, perm, sign } where:
//   lu   — Float64Array (n×n) with U on/above diagonal and L below
//          (L's diagonal is implicitly 1).
//   perm — Int32Array of length n; row i of P*A is original row perm[i].
//   sign — +1 or -1 depending on parity of row swaps.

function _luDecompose(A) {
  const n = _checkSquare2D(A, 'lu');
  const lu = new Float64Array(A.data);
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  let sign = 1;

  for (let k = 0; k < n; k++) {
    // Find pivot row.
    let pivot = k;
    let pivotVal = Math.abs(lu[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i * n + k]);
      if (v > pivotVal) {
        pivotVal = v;
        pivot = i;
      }
    }
    if (pivotVal === 0) {
      throw new Error('lu: matrix is singular');
    }
    if (pivot !== k) {
      // Swap rows k and pivot.
      for (let j = 0; j < n; j++) {
        const tmp = lu[k * n + j];
        lu[k * n + j] = lu[pivot * n + j];
        lu[pivot * n + j] = tmp;
      }
      const tp = perm[k];
      perm[k] = perm[pivot];
      perm[pivot] = tp;
      sign = -sign;
    }
    // Eliminate below the pivot.
    const pivotElem = lu[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const m = lu[i * n + k] / pivotElem;
      lu[i * n + k] = m;
      for (let j = k + 1; j < n; j++) {
        lu[i * n + j] -= m * lu[k * n + j];
      }
    }
  }
  return { lu, perm, sign, n };
}

// Solve a system using a precomputed LU decomposition, against a single rhs vector.
function _luSolveVec(luData, n, perm, b) {
  // Apply permutation: y[i] = b[perm[i]].
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b[perm[i]];
  // Forward solve L y = b' (L has unit diagonal).
  for (let i = 0; i < n; i++) {
    let s = x[i];
    for (let j = 0; j < i; j++) s -= luData[i * n + j] * x[j];
    x[i] = s;
  }
  // Back solve U x = y.
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= luData[i * n + j] * x[j];
    x[i] = s / luData[i * n + i];
  }
  return x;
}

// ---------- solve(A, b) ----------
// Returns x such that A x = b. b can be 1D (returns 1D) or 2D (multi-rhs, returns 2D).

function solve(A, b) {
  const n = _checkSquare2D(A, 'solve');
  const { lu, perm } = _luDecompose(A);

  if (b.ndim === 1) {
    if (b.size !== n) {
      throw new RangeError(`solve: b length ${b.size} does not match A size ${n}`);
    }
    const x = _luSolveVec(lu, n, perm, b.data);
    return new NdArray(x, [n]);
  }
  if (b.ndim === 2) {
    if (b.shape[0] !== n) {
      throw new RangeError(`solve: b row count ${b.shape[0]} does not match A size ${n}`);
    }
    const m = b.shape[1];
    const out = new Float64Array(n * m);
    const col = new Float64Array(n);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) col[i] = b.data[i * m + j];
      const x = _luSolveVec(lu, n, perm, col);
      for (let i = 0; i < n; i++) out[i * m + j] = x[i];
    }
    return new NdArray(out, [n, m]);
  }
  throw new RangeError(`solve: b must be 1D or 2D, got ${b.ndim}D`);
}

// ---------- det(A) ----------

function det(A) {
  const n = _checkSquare2D(A, 'det');
  let lu, sign;
  try {
    ({ lu, sign } = _luDecompose(A));
  } catch (e) {
    if (e.message.includes('singular')) return 0;
    throw e;
  }
  let p = sign;
  for (let i = 0; i < n; i++) p *= lu[i * n + i];
  return p;
}

// ---------- inv(A) ----------

function inv(A) {
  const n = _checkSquare2D(A, 'inv');
  const { lu, perm } = _luDecompose(A);
  const out = new Float64Array(n * n);
  const col = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    col.fill(0);
    col[j] = 1;
    const x = _luSolveVec(lu, n, perm, col);
    for (let i = 0; i < n; i++) out[i * n + j] = x[i];
  }
  return new NdArray(out, [n, n]);
}

// ---------- Cholesky ----------
// A = L L^T for symmetric positive-definite A. Returns L (lower triangular).
// Throws if A is not SPD.

function cholesky(A) {
  const n = _checkSquare2D(A, 'cholesky');
  const L = new Float64Array(n * n);
  const ad = A.data;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = ad[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (s <= 0) {
          throw new Error('cholesky: matrix is not positive definite');
        }
        L[i * n + j] = Math.sqrt(s);
      } else {
        L[i * n + j] = s / L[j * n + j];
      }
    }
  }
  return new NdArray(L, [n, n]);
}

// ---------- solveCholesky(L, b) ----------
// Given L from cholesky(A), solve A x = b in two triangular solves:
//   forward:  L y = b
//   backward: L^T x = y

function solveCholesky(L, b) {
  const n = _checkSquare2D(L, 'solveCholesky');
  if (b.ndim !== 1 || b.size !== n) {
    throw new RangeError(`solveCholesky: b must be 1D of length ${n}, got ${b.ndim}D shape [${b.shape.join(',')}]`);
  }
  const ld = L.data;
  const x = new Float64Array(n);
  // Forward L y = b.
  for (let i = 0; i < n; i++) {
    let s = b.data[i];
    for (let j = 0; j < i; j++) s -= ld[i * n + j] * x[j];
    x[i] = s / ld[i * n + i];
  }
  // Backward L^T x = y. L^T[i][j] = L[j][i].
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= ld[j * n + i] * x[j];
    x[i] = s / ld[i * n + i];
  }
  return new NdArray(x, [n]);
}

// ── linalg-qr.js ──

// QR decomposition via Householder reflections.
//
// For an m×n matrix A, computes Q (orthogonal) and R (upper triangular)
// such that A = QR. Two modes:
//   'thin'    (default) — Q: m×k, R: k×n where k = min(m,n)
//   'full'    — Q: m×m, R: m×n
//
// Used by:
//   - lstsq (alternative to normal-equations for ill-conditioned A^T A)
//   - downstream stats fits where conditioning matters


function qr(A, opts = {}) {
  if (A.ndim !== 2) throw new RangeError(`qr requires 2D array, got ${A.ndim}D`);
  const m = A.shape[0], n = A.shape[1];
  const mode = opts.mode || 'thin';
  const k = Math.min(m, n);

  // Work in a mutable copy of A — becomes R at the end (upper part).
  const R = new Float64Array(A.data);
  // Q starts as identity. Accumulates Householder reflectors.
  const Q = new Float64Array(m * m);
  for (let i = 0; i < m; i++) Q[i * m + i] = 1;

  // Reusable Householder vector buffer.
  const v = new Float64Array(m);

  for (let j = 0; j < k; j++) {
    // Compute Householder vector that zeros R[j+1:, j].
    // First, norm of R[j:, j].
    let normSq = 0;
    for (let i = j; i < m; i++) {
      const x = R[i * n + j];
      normSq += x * x;
    }
    if (normSq === 0) continue;  // already zero column
    const norm = Math.sqrt(normSq);
    // Choose sign(alpha) opposite to R[j,j] to avoid cancellation.
    const r_jj = R[j * n + j];
    const alpha = r_jj >= 0 ? -norm : norm;
    // v = R[j:, j]; v[0] -= alpha
    for (let i = j; i < m; i++) v[i - j] = R[i * n + j];
    v[0] -= alpha;
    let vNormSq = 0;
    for (let i = 0; i < m - j; i++) vNormSq += v[i] * v[i];
    if (vNormSq === 0) continue;
    const invHalfVNorm = 2 / vNormSq;

    // Apply reflector to R: R[j:, j:] = (I - β v vᵀ) R[j:, j:]
    // For each column c ≥ j: scale = β (vᵀ R[j:, c]); R[j:, c] -= scale * v
    for (let c = j; c < n; c++) {
      let dot = 0;
      for (let i = 0; i < m - j; i++) dot += v[i] * R[(j + i) * n + c];
      const scale = invHalfVNorm * dot;
      for (let i = 0; i < m - j; i++) R[(j + i) * n + c] -= scale * v[i];
    }
    // Apply reflector to Q from the right: Q[:, j:] = Q[:, j:] (I - β v vᵀ)
    // For each row r of Q: scale = β (Q[r, j:] · v); Q[r, j+i] -= scale * v[i]
    for (let r = 0; r < m; r++) {
      let dot = 0;
      for (let i = 0; i < m - j; i++) dot += Q[r * m + (j + i)] * v[i];
      const scale = invHalfVNorm * dot;
      for (let i = 0; i < m - j; i++) Q[r * m + (j + i)] -= scale * v[i];
    }
  }

  if (mode === 'full') {
    return { Q: new NdArray(Q, [m, m]), R: new NdArray(R, [m, n]) };
  }
  // Thin: return Q[:, :k] and R[:k, :].
  const Qt = new Float64Array(m * k);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < k; j++) Qt[i * k + j] = Q[i * m + j];
  }
  const Rt = new Float64Array(k * n);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < n; j++) Rt[i * n + j] = R[i * n + j];
  }
  return { Q: new NdArray(Qt, [m, k]), R: new NdArray(Rt, [k, n]) };
}

// ── linalg-svd.js ──

// Singular Value Decomposition via one-sided Jacobi rotations.
//
// For an m×n matrix A, computes U (m×k), s (length k), V (n×k) with
// A = U @ diag(s) @ Vᵀ, where k = min(m, n). Singular values are
// returned in descending order.
//
// Algorithm: one-sided Jacobi (Hari-Veselić / de Rijk) — iteratively
// rotate column pairs (p, q) of A so that the resulting columns become
// orthogonal. After convergence, ||A[:, j]|| = σ_j and A[:, j] / σ_j =
// U[:, j]. The accumulated rotation matrix is V.
//
// Pros: simple, accurate, no bidiagonalization phase. Robust for
//       near-rank-deficient matrices.
// Cons: O(m n² × sweeps) where typical sweeps = 5-10. Slower than
//       LAPACK's dgesvd at large n but fine for n < ~500.
//
// References: Demmel & Veselić 1992 ("Jacobi's method is more accurate
// than QR"). LAPACK dgesvj for the canonical implementation.


function svd(A, opts = {}) {
  if (A.ndim !== 2) throw new RangeError(`svd requires 2D array, got ${A.ndim}D`);
  const m = A.shape[0], n = A.shape[1];

  if (m < n) {
    // Compute SVD of Aᵀ (n × m, tall), then swap U and V.
    // A = U Σ Vᵀ  ⇒  Aᵀ = V Σ Uᵀ.
    const Atdata = new Float64Array(n * m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) Atdata[j * m + i] = A.data[i * n + j];
    }
    const At = new NdArray(Atdata, [n, m]);
    const r = svd(At, opts);
    return { U: r.V, s: r.s, V: r.U };
  }

  // m ≥ n. Output shapes: U: m×n, s: n, V: n×n.
  const tol = opts.tol ?? 1e-14;
  const maxSweeps = opts.maxSweeps ?? 30;

  // Working copy of A's columns. At the end its columns are σ_j u_j.
  const W = new Float64Array(A.data);
  // V starts as identity n×n.
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let offDiag = 0;  // sum of |apq|² / (app·aqq) over pairs — convergence proxy
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        // Compute <a_p, a_p>, <a_q, a_q>, <a_p, a_q> using columns of W
        let app = 0, aqq = 0, apq = 0;
        for (let i = 0; i < m; i++) {
          const ap = W[i * n + p];
          const aq = W[i * n + q];
          app += ap * ap;
          aqq += aq * aq;
          apq += ap * aq;
        }
        // Skip if already (nearly) orthogonal, or one column is zero
        if (app === 0 || aqq === 0) continue;
        const offMeasure = apq * apq / (app * aqq);
        offDiag += offMeasure;
        if (offMeasure < tol * tol) continue;

        // Rotation that diagonalizes the 2x2 Gram sub-matrix [[app, apq], [apq, aqq]].
        // tan(2θ) = 2·apq / (app - aqq). We use the stable form.
        const tau = (aqq - app) / (2 * apq);
        let t;
        if (Math.abs(tau) > 1e15) {
          t = 0.5 / tau;  // very small rotation
        } else if (tau >= 0) {
          t = 1 / (tau + Math.sqrt(1 + tau * tau));
        } else {
          t = 1 / (tau - Math.sqrt(1 + tau * tau));
        }
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        // Apply rotation to columns p, q of W
        for (let i = 0; i < m; i++) {
          const wp = W[i * n + p];
          const wq = W[i * n + q];
          W[i * n + p] = c * wp - s * wq;
          W[i * n + q] = s * wp + c * wq;
        }
        // Apply same rotation to columns p, q of V
        for (let i = 0; i < n; i++) {
          const vp = V[i * n + p];
          const vq = V[i * n + q];
          V[i * n + p] = c * vp - s * vq;
          V[i * n + q] = s * vp + c * vq;
        }
      }
    }
    if (offDiag < tol * tol) break;
  }

  // Extract singular values and U columns
  const sigma = new Float64Array(n);
  const U = new Float64Array(m * n);
  for (let j = 0; j < n; j++) {
    let normSq = 0;
    for (let i = 0; i < m; i++) {
      const v = W[i * n + j];
      normSq += v * v;
    }
    const sj = Math.sqrt(normSq);
    sigma[j] = sj;
    if (sj > 0) {
      for (let i = 0; i < m; i++) U[i * n + j] = W[i * n + j] / sj;
    }
    // else: zero singular value — leave U column zero (rare; could fill
    // with an orthogonal vector for full rank, but thin SVD doesn't need it)
  }

  // Sort by descending singular value
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => sigma[b] - sigma[a]);
  const sSorted = new Float64Array(n);
  const USorted = new Float64Array(m * n);
  const VSorted = new Float64Array(n * n);
  for (let newJ = 0; newJ < n; newJ++) {
    const oldJ = order[newJ];
    sSorted[newJ] = sigma[oldJ];
    for (let i = 0; i < m; i++) USorted[i * n + newJ] = U[i * n + oldJ];
    for (let i = 0; i < n; i++) VSorted[i * n + newJ] = V[i * n + oldJ];
  }

  return {
    U: new NdArray(USorted, [m, n]),
    s: new NdArray(sSorted, [n]),
    V: new NdArray(VSorted, [n, n]),
  };
}

// Moore-Penrose pseudoinverse via SVD.
// A⁺ = V diag(1/σ_i, 0 if σ_i < threshold) Uᵀ
// `rcond` (relative condition cutoff) defaults to max(m,n) × machine eps.
function pinv(A, opts = {}) {
  if (A.ndim !== 2) throw new RangeError('pinv requires 2D array');
  const m = A.shape[0], n = A.shape[1];
  const { U, s, V } = svd(A, opts);
  const k = s.shape[0];
  const sd = s.data;
  const ud = U.data;
  const vd = V.data;
  const rcond = opts.rcond ?? Math.max(m, n) * Number.EPSILON;
  const sMax = sd[0];  // sorted descending
  const cutoff = rcond * sMax;

  // Build V·diag(1/σ) as n×k.
  const VS = new Float64Array(n * k);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      const s_j = sd[j];
      VS[i * k + j] = s_j > cutoff ? vd[i * k + j] / s_j : 0;
    }
  }
  // result = VS @ Uᵀ → shape n × m
  const out = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let p = 0; p < k; p++) sum += VS[i * k + p] * ud[j * k + p];
      out[i * m + j] = sum;
    }
  }
  return new NdArray(out, [n, m]);
}

// Numerical rank — number of singular values above threshold.
function matrix_rank(A, opts = {}) {
  const { s } = svd(A, opts);
  const m = A.shape[0], n = A.shape[1];
  const sMax = s.data[0];
  const tol = opts.tol ?? Math.max(m, n) * sMax * Number.EPSILON;
  let r = 0;
  for (let i = 0; i < s.data.length; i++) if (s.data[i] > tol) r++;
  return r;
}

// ── linalg-norms.js ──

// Vector and matrix norms, plus utility products (cross, kron) and
// matrix_power. Small additions that round out the numpy.linalg surface.




// ── vector norms ────────────────────────────────────────────────────
//
// vecNorm(x, ord) for 1D arrays. Supported orders:
//   2 (default) — Euclidean (L2). Matches reduce.js's `norm`.
//   1           — sum of absolute values (L1, "Manhattan")
//   Infinity    — max absolute value (L∞, "Chebyshev")
//  -Infinity    — min absolute value (rare but in numpy.linalg)
//   p > 0       — (Σ|x_i|^p)^(1/p)

function vecNorm(x, ord = 2) {
  if (x.ndim !== 1) {
    throw new RangeError(`vecNorm requires 1D array, got ${x.ndim}D`);
  }
  const d = x.data;
  const n = x.size;
  if (ord === 2) {
    // Unrolled-4 like reduce.js's norm
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    const n4 = n - (n & 3);
    let i = 0;
    for (; i < n4; i += 4) {
      s0 += d[i  ] * d[i  ];
      s1 += d[i+1] * d[i+1];
      s2 += d[i+2] * d[i+2];
      s3 += d[i+3] * d[i+3];
    }
    let s = (s0 + s1) + (s2 + s3);
    for (; i < n; i++) s += d[i] * d[i];
    return Math.sqrt(s);
  }
  if (ord === 1) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.abs(d[i]);
    return s;
  }
  if (ord === Infinity) {
    let m = 0;
    for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > m) m = v; }
    return m;
  }
  if (ord === -Infinity) {
    if (n === 0) return Infinity;
    let m = Infinity;
    for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v < m) m = v; }
    return m;
  }
  if (typeof ord === 'number' && ord > 0) {
    // General p-norm
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.pow(Math.abs(d[i]), ord);
    return Math.pow(s, 1 / ord);
  }
  throw new RangeError(`vecNorm: unsupported ord ${ord}`);
}

// ── matrix norms ────────────────────────────────────────────────────
//
// matNorm(A, ord) for 2D arrays. Supported orders:
//   'fro' (default) — Frobenius: sqrt(Σ a_ij²)
//   1               — max column sum of abs values (induced 1-norm)
//   Infinity        — max row sum of abs values (induced ∞-norm)
//   2               — largest singular value (spectral norm)
//  -1, -Infinity, -2 — corresponding minima (numpy supports these)
//   'nuc'           — nuclear norm = sum of singular values

function matNorm(A, ord = 'fro') {
  if (A.ndim !== 2) {
    throw new RangeError(`matNorm requires 2D array, got ${A.ndim}D`);
  }
  const m = A.shape[0], n = A.shape[1];
  const d = A.data;

  if (ord === 'fro') {
    let s = 0;
    for (let i = 0; i < m * n; i++) s += d[i] * d[i];
    return Math.sqrt(s);
  }
  if (ord === 1) {
    // max over j of Σ_i |a_ij|
    let best = 0;
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = 0; i < m; i++) s += Math.abs(d[i * n + j]);
      if (s > best) best = s;
    }
    return best;
  }
  if (ord === -1) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = 0; i < m; i++) s += Math.abs(d[i * n + j]);
      if (s < best) best = s;
    }
    return best;
  }
  if (ord === Infinity) {
    let best = 0;
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += Math.abs(d[i * n + j]);
      if (s > best) best = s;
    }
    return best;
  }
  if (ord === -Infinity) {
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += Math.abs(d[i * n + j]);
      if (s < best) best = s;
    }
    return best;
  }
  if (ord === 2) {
    // Largest singular value
    const { s } = svd(A);
    return s.data[0];
  }
  if (ord === -2) {
    const { s } = svd(A);
    return s.data[s.shape[0] - 1];
  }
  if (ord === 'nuc') {
    const { s } = svd(A);
    let sum = 0;
    for (let i = 0; i < s.size; i++) sum += s.data[i];
    return sum;
  }
  throw new RangeError(`matNorm: unsupported ord ${ord}`);
}

// ── cross product (3D vectors only) ─────────────────────────────────

function cross(a, b) {
  if (a.ndim !== 1 || b.ndim !== 1) {
    throw new RangeError('cross: both args must be 1D');
  }
  if (a.size !== 3 || b.size !== 3) {
    throw new RangeError(`cross: only 3D vectors supported (got ${a.size}, ${b.size})`);
  }
  const ad = a.data, bd = b.data;
  const out = new Float64Array(3);
  out[0] = ad[1] * bd[2] - ad[2] * bd[1];
  out[1] = ad[2] * bd[0] - ad[0] * bd[2];
  out[2] = ad[0] * bd[1] - ad[1] * bd[0];
  return new NdArray(out, [3]);
}

// ── Kronecker product ───────────────────────────────────────────────
//
// For A (m × n) and B (p × q), returns kron(A, B) of shape (m·p × n·q).
// (kron(A, B))[i·p + k, j·q + l] = A[i, j] * B[k, l]

function kron(A, B) {
  // Support 1D inputs by promoting to row vectors
  let Ah, Aw, Ad;
  if (A.ndim === 1) { Ah = 1; Aw = A.size; Ad = A.data; }
  else if (A.ndim === 2) { Ah = A.shape[0]; Aw = A.shape[1]; Ad = A.data; }
  else throw new RangeError(`kron: arrays must be 1D or 2D, got ${A.ndim}D`);
  let Bh, Bw, Bd;
  if (B.ndim === 1) { Bh = 1; Bw = B.size; Bd = B.data; }
  else if (B.ndim === 2) { Bh = B.shape[0]; Bw = B.shape[1]; Bd = B.data; }
  else throw new RangeError(`kron: arrays must be 1D or 2D, got ${B.ndim}D`);

  const Oh = Ah * Bh, Ow = Aw * Bw;
  const out = new Float64Array(Oh * Ow);
  for (let i = 0; i < Ah; i++) {
    for (let j = 0; j < Aw; j++) {
      const aij = Ad[i * Aw + j];
      const rowBase = i * Bh;
      const colBase = j * Bw;
      for (let k = 0; k < Bh; k++) {
        for (let l = 0; l < Bw; l++) {
          out[(rowBase + k) * Ow + (colBase + l)] = aij * Bd[k * Bw + l];
        }
      }
    }
  }
  // Promote both 1D inputs to result of same dimensionality as inputs:
  // numpy.kron returns 1D if both inputs are 1D, 2D otherwise.
  if (A.ndim === 1 && B.ndim === 1) {
    return new NdArray(out, [Ow]);
  }
  return new NdArray(out, [Oh, Ow]);
}

// ── matrix_power ────────────────────────────────────────────────────
//
// For a square matrix A and integer k, returns A^k. Uses
// exponentiation-by-squaring. k = 0 returns identity; k < 0 uses inv(A).

function matrix_power(A, k) {
  if (A.ndim !== 2 || A.shape[0] !== A.shape[1]) {
    throw new RangeError('matrix_power requires a square 2D matrix');
  }
  if (!Number.isInteger(k)) {
    throw new RangeError(`matrix_power: exponent must be an integer, got ${k}`);
  }
  const n = A.shape[0];

  if (k === 0) {
    const I = new Float64Array(n * n);
    for (let i = 0; i < n; i++) I[i * n + i] = 1;
    return new NdArray(I, [n, n]);
  }
  if (k < 0) {
    // Need inv() — lazy import to avoid circular deps
    // (linalg-solve imports linalg-mul, which we're using here too)
    return matrix_power(_inv(A), -k);
  }
  if (k === 1) {
    return new NdArray(new Float64Array(A.data), [n, n]);
  }

  // Exponentiation by squaring
  let base = new NdArray(new Float64Array(A.data), [n, n]);
  // Start result = I
  const Idata = new Float64Array(n * n);
  for (let i = 0; i < n; i++) Idata[i * n + i] = 1;
  let result = new NdArray(Idata, [n, n]);
  let exp = k;
  while (exp > 0) {
    if (exp & 1) result = matmul(result, base);
    exp >>= 1;
    if (exp > 0) base = matmul(base, base);
  }
  return result;
}

// Local copy of inv to avoid circular import. Only invoked for negative
// powers (rare path); we'd rather inline a tiny version than restructure.
function _inv(A) {
  const n = A.shape[0];
  // Augment [A | I] and Gauss-Jordan
  const aug = new Float64Array(n * 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i * 2 * n + j] = A.data[i * n + j];
    aug[i * 2 * n + (n + i)] = 1;
  }
  for (let i = 0; i < n; i++) {
    // pivot — find max abs in column i below row i
    let piv = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(aug[r * 2 * n + i]) > Math.abs(aug[piv * 2 * n + i])) piv = r;
    }
    if (piv !== i) {
      for (let c = 0; c < 2 * n; c++) {
        const t = aug[i * 2 * n + c];
        aug[i * 2 * n + c] = aug[piv * 2 * n + c];
        aug[piv * 2 * n + c] = t;
      }
    }
    const pivot = aug[i * 2 * n + i];
    if (pivot === 0) throw new Error('matrix_power: singular matrix, no inverse');
    const invPivot = 1 / pivot;
    for (let c = 0; c < 2 * n; c++) aug[i * 2 * n + c] *= invPivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = aug[r * 2 * n + i];
      if (factor !== 0) {
        for (let c = 0; c < 2 * n; c++) aug[r * 2 * n + c] -= factor * aug[i * 2 * n + c];
      }
    }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i * n + j] = aug[i * 2 * n + (n + j)];
  }
  return new NdArray(out, [n, n]);
}

// ── triangular solve ────────────────────────────────────────────────
//
// solve_triangular(L, b, { lower: true }) — solves Lx = b for lower-triangular L
// solve_triangular(U, b, { lower: false }) — solves Ux = b for upper-triangular U
// Used internally by QR-based lstsq, Cholesky-based solve, etc.

function solve_triangular(T, b, opts = {}) {
  if (T.ndim !== 2 || T.shape[0] !== T.shape[1]) {
    throw new RangeError('solve_triangular requires a square 2D matrix');
  }
  if (b.ndim !== 1 || b.size !== T.shape[0]) {
    throw new RangeError(`solve_triangular: RHS size mismatch`);
  }
  const n = T.shape[0];
  const td = T.data;
  const x = new Float64Array(b.data);
  const lower = opts.lower !== false;  // default true
  if (lower) {
    // Forward substitution
    for (let i = 0; i < n; i++) {
      let sum = x[i];
      for (let j = 0; j < i; j++) sum -= td[i * n + j] * x[j];
      const diag = td[i * n + i];
      if (diag === 0) throw new Error('solve_triangular: zero on diagonal');
      x[i] = sum / diag;
    }
  } else {
    // Back substitution
    for (let i = n - 1; i >= 0; i--) {
      let sum = x[i];
      for (let j = i + 1; j < n; j++) sum -= td[i * n + j] * x[j];
      const diag = td[i * n + i];
      if (diag === 0) throw new Error('solve_triangular: zero on diagonal');
      x[i] = sum / diag;
    }
  }
  return new NdArray(x, [n]);
}

// ── linalg-lstsq.js ──

// Least squares — solves x = argmin_x ||Ax - b||_2 for overdetermined
// systems (m ≥ n).
//
// Three methods, selected via opts.method:
//
//   'qr'     (default) — A = Q R, solve R x = Qᵀ b via back substitution.
//                        Condition number κ(A). Numerically stable.
//   'normal'           — Solve AᵀA x = Aᵀb via Cholesky. Faster (~2× for
//                        well-conditioned problems) but condition number
//                        is κ(A)² — unstable for ill-conditioned A.
//   'svd'              — A = U Σ Vᵀ, x = V (Σ⁻¹ Uᵀ b). Most robust;
//                        handles rank-deficient A (uses pinv with rcond).
//                        Slower than QR by ~2×.
//
// Returns x (1D NdArray of length n). Cost summary (m×n, m ≥ n):
//   normal: O(m n² + n³) — Cholesky + matmul AᵀA
//   qr:     O(m n²)       — Householder QR + triangular solve
//   svd:    O(m n² + n³ · sweeps) — Jacobi SVD







function lstsq(A, b, opts = {}) {
  if (A.ndim !== 2) {
    throw new RangeError(`lstsq: A must be 2D, got ${A.ndim}D`);
  }
  if (b.ndim !== 1) {
    throw new RangeError(`lstsq: b must be 1D in v1, got ${b.ndim}D`);
  }
  const m = A.shape[0], n = A.shape[1];
  if (b.size !== m) {
    throw new RangeError(`lstsq: b length ${b.size} does not match A row count ${m}`);
  }
  if (m < n) {
    throw new RangeError(`lstsq: underdetermined (m=${m} < n=${n}); v1 only handles m >= n`);
  }
  const method = opts.method ?? 'qr';

  if (method === 'normal') {
    return _lstsqNormal(A, b, m, n);
  }
  if (method === 'qr') {
    return _lstsqQR(A, b, m, n);
  }
  if (method === 'svd') {
    return _lstsqSVD(A, b, m, n, opts);
  }
  throw new RangeError(`lstsq: unknown method "${method}" (expected 'qr', 'normal', or 'svd')`);
}

// Normal equations: A^T A x = A^T b → Cholesky factor and back-solve.
// Condition number κ(A)² — unstable for ill-conditioned A but fastest path.
function _lstsqNormal(A, b, m, n) {
  const At = transpose(A);
  const AtA = matmul(At, A);
  const Atb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += At.data[i * m + j] * b.data[j];
    Atb[i] = s;
  }
  const L = cholesky(AtA);
  return solveCholesky(L, new NdArray(Atb, [n]));
}

// QR-based: A = Q R (thin, m×n × n×n). Solve R x = Qᵀ b.
// Condition number κ(A) — much more stable than normal equations.
function _lstsqQR(A, b, m, n) {
  const { Q, R } = qr(A);  // thin: Q is m×n, R is n×n upper triangular
  // Qᵀ b — manual mat-vec
  const Qtb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += Q.data[j * n + i] * b.data[j];
    Qtb[i] = s;
  }
  return solve_triangular(R, new NdArray(Qtb, [n]), { lower: false });
}

// SVD-based: A = U Σ Vᵀ, x = V Σ⁻¹ Uᵀ b. Skips singular values below
// rcond × σ_max so rank-deficient A still yields the minimum-norm
// least-squares solution.
function _lstsqSVD(A, b, m, n, opts) {
  const { U, s, V } = svd(A);
  const rcond = opts.rcond ?? Math.max(m, n) * Number.EPSILON;
  const sMax = s.data[0];
  const cutoff = rcond * sMax;
  // Uᵀ b
  const Utb = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < m; j++) acc += U.data[j * n + i] * b.data[j];
    Utb[i] = acc;
  }
  // Σ⁻¹ Uᵀ b (truncated)
  for (let i = 0; i < n; i++) {
    Utb[i] = s.data[i] > cutoff ? Utb[i] / s.data[i] : 0;
  }
  // V · (Σ⁻¹ Uᵀ b)
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < n; j++) acc += V.data[i * n + j] * Utb[j];
    x[i] = acc;
  }
  return new NdArray(x, [n]);
}

// ── linalg-eigen.js ──

// Symmetric eigendecomposition: closed-form 3×3 (Cardano) + general N×N (Jacobi).
//
// Both return { values: NdArray[n], vectors: NdArray[n,n] } where vectors[:,i]
// is the unit eigenvector corresponding to values[i]. Values are sorted in
// descending order. Vectors form an orthonormal basis (within numerical
// precision).


function _checkSymSquare(A, name) {
  if (A.ndim !== 2 || A.shape[0] !== A.shape[1]) {
    throw new RangeError(`${name} requires a square 2D matrix, got [${A.shape.join(',')}]`);
  }
  return A.shape[0];
}

// ---------- eigSym3 (Cardano closed-form) ----------
// Specialized for the 3×3 symmetric case. Used for stress tensors, structural
// fabric, moment-of-inertia, etc. Returns eigenvalues sorted descending and
// orthonormal eigenvectors as columns.

function eigSym3(A) {
  if (_checkSymSquare(A, 'eigSym3') !== 3) {
    throw new RangeError(`eigSym3 requires 3×3, got ${A.shape[0]}×${A.shape[1]}`);
  }
  const d = A.data;
  const a = d[0], b = d[1], c = d[2];
  const dd = d[4], e = d[5];
  const f = d[8];
  // (b == d[3], c == d[6], e == d[7] in a symmetric matrix; we ignore those.)

  // Smith (1961) closed-form eigenvalue algorithm.
  const p1 = b * b + c * c + e * e;
  let lam1, lam2, lam3;
  if (p1 === 0) {
    // Already diagonal.
    lam1 = a; lam2 = dd; lam3 = f;
  } else {
    const q = (a + dd + f) / 3;
    const p2 = (a - q) * (a - q) + (dd - q) * (dd - q) + (f - q) * (f - q) + 2 * p1;
    const p = Math.sqrt(p2 / 6);
    // B = (A - q*I) / p
    const B00 = (a  - q) / p;
    const B11 = (dd - q) / p;
    const B22 = (f  - q) / p;
    const B01 = b / p, B02 = c / p, B12 = e / p;
    // det(B) / 2
    const detB = (
      B00 * (B11 * B22 - B12 * B12)
    - B01 * (B01 * B22 - B12 * B02)
    + B02 * (B01 * B12 - B11 * B02)
    );
    let r = detB / 2;
    if (r < -1) r = -1;
    if (r >  1) r =  1;
    const phi = Math.acos(r) / 3;
    lam1 = q + 2 * p * Math.cos(phi);
    lam3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
    lam2 = 3 * q - lam1 - lam3;
  }
  // Sort descending.
  let l1 = lam1, l2 = lam2, l3 = lam3;
  if (l1 < l2) { const t = l1; l1 = l2; l2 = t; }
  if (l2 < l3) { const t = l2; l2 = l3; l3 = t; }
  if (l1 < l2) { const t = l1; l1 = l2; l2 = t; }

  // Full-degeneracy short-circuit: when all three eigenvalues are equal,
  // every direction is an eigenvector. Identity is a valid orthonormal basis.
  const scale = Math.max(Math.abs(l1), Math.abs(l3), 1);
  if (Math.abs(l1 - l3) < 1e-12 * scale) {
    return {
      values: new NdArray(new Float64Array([l1, l2, l3]), [3]),
      vectors: new NdArray(new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), [3, 3]),
    };
  }

  // Compute v3 first (smallest eigenvalue). For non-degenerate cases, this
  // is unambiguous (rank-2 null space → unique eigenvector).
  let v3 = _eigVec3(a, b, c, dd, e, f, l3);
  let v1 = _eigVec3(a, b, c, dd, e, f, l1);

  // Orthogonalize v1 against v3 (Gram-Schmidt). Resolves ambiguity in the
  // partially-degenerate case (λ1 == λ2): v1 is any vector in a 2D
  // eigenspace, and we pick the component orthogonal to v3.
  const dot13 = v1[0] * v3[0] + v1[1] * v3[1] + v1[2] * v3[2];
  v1[0] -= dot13 * v3[0];
  v1[1] -= dot13 * v3[1];
  v1[2] -= dot13 * v3[2];
  let n1 = Math.hypot(v1[0], v1[1], v1[2]);
  if (n1 < 1e-10) {
    // v1 collapsed onto v3 — pick any unit vector orthogonal to v3.
    const seed = (Math.abs(v3[0]) < Math.abs(v3[1]) && Math.abs(v3[0]) < Math.abs(v3[2]))
      ? [1, 0, 0]
      : (Math.abs(v3[1]) < Math.abs(v3[2]))
        ? [0, 1, 0]
        : [0, 0, 1];
    v1 = _cross(v3, seed);
    n1 = Math.hypot(v1[0], v1[1], v1[2]);
  }
  v1[0] /= n1; v1[1] /= n1; v1[2] /= n1;

  // v2 = v3 × v1 (right-handed orthonormal basis; v1, v3 are unit and
  // orthogonal, so the cross product is also unit-length).
  const v2 = _cross(v3, v1);

  // Pack vectors as columns of a 3×3 matrix.
  const V = new Float64Array(9);
  V[0] = v1[0]; V[1] = v2[0]; V[2] = v3[0];
  V[3] = v1[1]; V[4] = v2[1]; V[5] = v3[1];
  V[6] = v1[2]; V[7] = v2[2]; V[8] = v3[2];

  return {
    values: new NdArray(new Float64Array([l1, l2, l3]), [3]),
    vectors: new NdArray(V, [3, 3]),
  };
}

function _eigVec3(a, b, c, dd, e, f, lam) {
  // (A - λI) rows.
  const r0 = [a - lam, b, c];
  const r1 = [b, dd - lam, e];
  const r2 = [c, e, f - lam];
  // Rank-2 case: cross product of any two non-parallel rows lies in the null
  // space. Try all three pairs, pick the largest-magnitude (most numerically
  // stable) one.
  const c01 = _cross(r0, r1);
  const c02 = _cross(r0, r2);
  const c12 = _cross(r1, r2);
  const m01 = c01[0]*c01[0] + c01[1]*c01[1] + c01[2]*c01[2];
  const m02 = c02[0]*c02[0] + c02[1]*c02[1] + c02[2]*c02[2];
  const m12 = c12[0]*c12[0] + c12[1]*c12[1] + c12[2]*c12[2];
  let best = c01, bestM = m01;
  if (m02 > bestM) { best = c02; bestM = m02; }
  if (m12 > bestM) { best = c12; bestM = m12; }
  if (bestM > 1e-20) {
    const n = Math.sqrt(bestM);
    return [best[0] / n, best[1] / n, best[2] / n];
  }
  // Rank ≤ 1 case (eigenvalue has multiplicity ≥ 2). Find the row with
  // largest magnitude — it spans the row space. Return any vector orthogonal
  // to it; the caller will Gram-Schmidt against other eigenvectors to
  // disambiguate within the multi-dimensional eigenspace.
  const m_r0 = r0[0]*r0[0] + r0[1]*r0[1] + r0[2]*r0[2];
  const m_r1 = r1[0]*r1[0] + r1[1]*r1[1] + r1[2]*r1[2];
  const m_r2 = r2[0]*r2[0] + r2[1]*r2[1] + r2[2]*r2[2];
  let nz, mNz;
  if (m_r0 >= m_r1 && m_r0 >= m_r2) { nz = r0; mNz = m_r0; }
  else if (m_r1 >= m_r2) { nz = r1; mNz = m_r1; }
  else { nz = r2; mNz = m_r2; }
  if (mNz < 1e-20) {
    // Rank 0: (A - λI) is zero — eigenspace is all of R^3.
    return [1, 0, 0];
  }
  // Pick a canonical basis vector with smallest |nz| component (most
  // perpendicular to nz), so the cross product is well-conditioned.
  const ax = Math.abs(nz[0]), ay = Math.abs(nz[1]), az = Math.abs(nz[2]);
  const seed = (ax <= ay && ax <= az) ? [1, 0, 0]
            : (ay <= az)               ? [0, 1, 0]
            :                            [0, 0, 1];
  const ortho = _cross(nz, seed);
  const oN = Math.hypot(ortho[0], ortho[1], ortho[2]);
  return [ortho[0] / oN, ortho[1] / oN, ortho[2] / oN];
}

function _cross(u, v) {
  return [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
}

// ---------- eigSym (Jacobi rotations) ----------
// Iteratively applies Givens rotations to zero out off-diagonal elements.
// Quadratic convergence — typically 5-10 sweeps for matrices up to ~100×100.
// Caller can pass { maxSweeps, tol } in opts.

function eigSym(A, opts) {
  const n = _checkSymSquare(A, 'eigSym');
  const maxSweeps = (opts && opts.maxSweeps) || 50;
  const tol = (opts && opts.tol) || 1e-12;

  // Working copy of A (will diagonalize in place).
  const D = new Float64Array(A.data);
  // Eigenvector accumulator V starts as identity.
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // Sum of squares of off-diagonal elements.
    let off = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        off += D[p * n + q] * D[p * n + q];
      }
    }
    if (off < tol * tol) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = D[p * n + q];
        if (Math.abs(apq) < 1e-15) continue;
        const app = D[p * n + p];
        const aqq = D[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = (theta >= 0)
          ? 1 / (theta + Math.sqrt(theta * theta + 1))
          : 1 / (theta - Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        // Update diagonal entries.
        D[p * n + p] = app - t * apq;
        D[q * n + q] = aqq + t * apq;
        D[p * n + q] = 0;
        D[q * n + p] = 0;

        // Update other rows/cols. For i != p, q:
        //   new D[i,p] = c * D[i,p] - s * D[i,q]
        //   new D[i,q] = s * D[i,p_old] + c * D[i,q]
        for (let i = 0; i < n; i++) {
          if (i === p || i === q) continue;
          const ip = D[i * n + p];
          const iq = D[i * n + q];
          D[i * n + p] = c * ip - s * iq;
          D[i * n + q] = s * ip + c * iq;
          D[p * n + i] = D[i * n + p];
          D[q * n + i] = D[i * n + q];
        }

        // Update eigenvector accumulator V.
        for (let i = 0; i < n; i++) {
          const ip = V[i * n + p];
          const iq = V[i * n + q];
          V[i * n + p] = c * ip - s * iq;
          V[i * n + q] = s * ip + c * iq;
        }
      }
    }
  }

  // Extract eigenvalues from D's diagonal, sort descending, permute V's columns.
  const indexed = new Array(n);
  for (let i = 0; i < n; i++) indexed[i] = { val: D[i * n + i], idx: i };
  indexed.sort((a, b) => b.val - a.val);

  const values = new Float64Array(n);
  const vectors = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    values[j] = indexed[j].val;
    const srcCol = indexed[j].idx;
    for (let i = 0; i < n; i++) vectors[i * n + j] = V[i * n + srcCol];
  }

  return {
    values: new NdArray(values, [n]),
    vectors: new NdArray(vectors, [n, n]),
  };
}

export {
  // ndarray
  NdArray, shapeProduct, computeStrides,
  // shape
  reshape, flatten, copy, slice, concat, stack,
  broadcastShapes, broadcastStrides, broadcastBinary, shapesEqual,
  // creation
  zeros, ones, full, range, linspace, eye, from,
  // ops (binary + unary)
  add, sub, mul, div, pow,
  neg, abs, sqrt, log, exp, sin, cos, tan,
  asin, acos, atan,
  floor, ceil, round, sign,
  isnan, isfinite,
  atan2, hypot, maximum, minimum,
  eq, ne, lt, le, gt, ge,
  // selection
  where, clip,
  // reduce
  sum, mean, max, min, std, variance, variance as var_, norm, dot,
  prod, cumsum, cumprod, argmin, argmax, trace,
  // linalg-mul
  matmul, transpose,
  det2, det3, det4,
  inv2, inv3, inv4,
  diag, outer, tril, triu,
  // linalg-solve
  solve, det, inv, cholesky, solveCholesky,
  // linalg-qr
  qr,
  // linalg-svd
  svd, pinv, matrix_rank,
  // linalg-norms
  vecNorm, matNorm, cross, kron, matrix_power, solve_triangular,
  // linalg-lstsq
  lstsq,
  // linalg-eigen
  eigSym3, eigSym,
};

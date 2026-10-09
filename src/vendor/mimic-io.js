// ⚠ VENDORED — DO NOT EDIT. @gcu/mimic-io (estimator serialisation, a dependency of learn), copied from ../auditable/ext/mimic-io/index.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/mimic-io — JSON serialization format for sklearn-shaped fitted estimators. Human-readable, language-independent, security-bounded via closed class registry, signable byte-for-byte via canonical serialization.

// ── src/typed-array.js ──

// @gcu/mimic-io — typed-array codec
//
// The `{ $dtype, $shape, $data }` form (spec §5) packs homogeneous numeric
// arrays as base64-encoded raw bytes. ~2.5× smaller than JSON arrays of
// decimal floats and substantially faster to parse (no per-element
// string→number).
//
// Endianness: little-endian on both sides. Host TypedArrays are host-
// endian; on the (vanishingly rare) big-endian browser we'd byte-swap
// here, but every consumer-relevant target is LE.

const DTYPES = {
  // name → { ctor, bytesPerElement, jsLossy: boolean }
  // jsLossy means values can lose precision when read into Number — currently
  // only int64/uint64. JS implementations may reject these or use BigInt;
  // we reject by default (consumer can override). See spec §5.2.
  float64: { ctor: Float64Array, bytes: 8, jsLossy: false },
  float32: { ctor: Float32Array, bytes: 4, jsLossy: false },
  int32:   { ctor: Int32Array,   bytes: 4, jsLossy: false },
  uint32:  { ctor: Uint32Array,  bytes: 4, jsLossy: false },
  int16:   { ctor: Int16Array,   bytes: 2, jsLossy: false },
  uint16:  { ctor: Uint16Array,  bytes: 2, jsLossy: false },
  int8:    { ctor: Int8Array,    bytes: 1, jsLossy: false },
  uint8:   { ctor: Uint8Array,   bytes: 1, jsLossy: false },
  // bool packs each element as one byte (0 or 1), not bit-packed. Spec §5.5.
  bool:    { ctor: Uint8Array,   bytes: 1, jsLossy: false, isBool: true },
  // int64/uint64 require BigInt typed arrays in JS for precision preservation.
  int64:   { ctor: BigInt64Array,  bytes: 8, jsLossy: true },
  uint64:  { ctor: BigUint64Array, bytes: 8, jsLossy: true },
};

/**
 * True if a value looks like a typed-array reference `{ $dtype, $shape,
 * $data }`. Used by the load path to decide between this codec and a
 * plain JSON array of numbers (both are valid per §5.3).
 */
function isTypedArrayRef(v) {
  return v != null && typeof v === 'object'
    && typeof v.$dtype === 'string'
    && Array.isArray(v.$shape)
    && typeof v.$data === 'string';
}

/**
 * Encode a typed array (or a plain array if you really want, but the spec's
 * threshold is "homogeneous numeric, length ≥ 16 or rank ≥ 2") into the
 * `{ $dtype, $shape, $data }` form.
 *
 * @param {TypedArray|BigInt64Array|BigUint64Array} arr
 * @param {number[]} [shape] — defaults to [arr.length]
 * @returns {{ $dtype: string, $shape: number[], $data: string }}
 */
function encodeTypedArray(arr, shape) {
  const dtype = _dtypeOf(arr);
  if (!dtype) throw new Error(`encodeTypedArray: unsupported typed-array kind`);
  const resolvedShape = shape ?? [arr.length];
  const elementCount = resolvedShape.reduce((a, b) => a * b, 1);
  if (elementCount !== arr.length) {
    throw new Error(
      `encodeTypedArray: shape ${JSON.stringify(resolvedShape)} ` +
      `claims ${elementCount} elements; array has ${arr.length}`,
    );
  }
  // Convert to a Uint8Array view over the same memory, then base64.
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  return {
    $dtype: dtype,
    $shape: resolvedShape,
    $data: _bytesToBase64(bytes),
  };
}

/**
 * Decode a typed-array reference into a real typed array. Supports either
 * the `{ $dtype, $shape, $data }` form or a plain JSON array of numbers
 * (which is returned as a Float64Array — the spec is agnostic about exact
 * type for the plain-array form).
 *
 * @param {object|number[]} ref
 * @param {object} [opts]
 * @param {boolean} [opts.rejectBigInt=true] — if false, int64/uint64 load
 *        into BigInt64Array/BigUint64Array. If true (default), int64/uint64
 *        refs throw because most consumers can't handle BigInt values cleanly.
 * @returns {TypedArray|BigInt64Array|BigUint64Array}
 */
function decodeTypedArray(ref, opts = {}) {
  const rejectBigInt = opts.rejectBigInt ?? true;
  if (Array.isArray(ref)) return new Float64Array(ref);
  if (!isTypedArrayRef(ref)) {
    throw new Error('decodeTypedArray: input is neither a typed-array ref nor a plain array');
  }
  const spec = DTYPES[ref.$dtype];
  if (!spec) throw new Error(`decodeTypedArray: unsupported dtype "${ref.$dtype}"`);
  if (spec.jsLossy && rejectBigInt) {
    throw new Error(
      `decodeTypedArray: dtype "${ref.$dtype}" requires BigInt typed arrays; ` +
      `pass { rejectBigInt: false } to opt in to BigInt loading`,
    );
  }
  const bytes = _base64ToBytes(ref.$data);
  const elementCount = ref.$shape.reduce((a, b) => a * b, 1);
  const expected = elementCount * spec.bytes;
  if (bytes.byteLength !== expected) {
    throw new Error(
      `decodeTypedArray: decoded ${bytes.byteLength} bytes; ` +
      `expected ${expected} (${elementCount} × ${spec.bytes} for ${ref.$dtype})`,
    );
  }
  // Construct a typed-array view over a fresh, aligned buffer. SubtleCrypto
  // and BigInt typed arrays require contiguous, aligned buffers; copying via
  // .slice() guarantees both.
  const aligned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer;
  return new spec.ctor(aligned);
}

function _dtypeOf(arr) {
  if (arr instanceof Float64Array) return 'float64';
  if (arr instanceof Float32Array) return 'float32';
  if (arr instanceof Int32Array)   return 'int32';
  if (arr instanceof Uint32Array)  return 'uint32';
  if (arr instanceof Int16Array)   return 'int16';
  if (arr instanceof Uint16Array)  return 'uint16';
  if (arr instanceof Int8Array)    return 'int8';
  if (arr instanceof Uint8Array)   return 'uint8';
  if (typeof BigInt64Array !== 'undefined' && arr instanceof BigInt64Array)   return 'int64';
  if (typeof BigUint64Array !== 'undefined' && arr instanceof BigUint64Array) return 'uint64';
  return null;
}

// Browser-side: btoa/atob exist as globals and handle "binary string" input.
// We avoid `Buffer` to keep this zero-deps and bundle-able for the browser.
function _bytesToBase64(bytes) {
  let s = '';
  // Chunk to avoid call-stack overflow on huge arrays (apply has an arg limit).
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function _base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ── src/registry.js ──

// @gcu/mimic-io — class registry (spec §2.3, §6.3)
//
// The registry is the security boundary: load(json) only instantiates
// classes the consumer has registered. Custom classes register at
// runtime via `register(class_id, EstimatorClass, schema?)`. Default
// state is empty — a fresh consumer can't load anything until it
// registers what it knows.
//
// Per spec §6.3, the registry is per-consumer, not global. Each
// `createRegistry()` returns a fresh map; the default exported
// `defaultRegistry` is one such, shared by direct callers of
// `register(...)` for convenience. Libraries that want isolation make
// their own.

/**
 * @typedef {Object} RegistryEntry
 * @property {Function} ClassCtor   — the constructor (or factory)
 * @property {object|null} schema   — JSON Schema for params + fitted
 *                                    (optional; null means no validation)
 * @property {string[]} aliases     — additional module identifiers
 *                                    accepted on load
 */

/** Build a fresh registry. Each entry is keyed by class identifier
 *  (e.g. "DecisionTreeClassifier"); multiple module identifiers map
 *  to the same class via aliases. */
function createRegistry() {
  const byClass = new Map(); // class_id → entry
  return {
    /**
     * Register a class for load. `class_id` is the canonical name
     * (e.g. "DecisionTreeClassifier"); `module` is the module identifier
     * (e.g. "@gcu/learn.tree" or "sklearn.tree") — the same class can be
     * registered multiple times under different modules.
     */
    register(class_id, ClassCtor, opts = {}) {
      if (!class_id || typeof class_id !== 'string') {
        throw new Error('register: class_id must be a non-empty string');
      }
      if (typeof ClassCtor !== 'function') {
        throw new Error(`register: ClassCtor for "${class_id}" must be a function`);
      }
      const existing = byClass.get(class_id);
      if (existing && existing.ClassCtor !== ClassCtor) {
        // Re-registration with a different ctor — overwrite but warn.
        // Consumers may want strict mode; for now, last-write-wins.
      }
      byClass.set(class_id, {
        ClassCtor,
        schema: opts.schema ?? null,
        aliases: opts.modules ?? (opts.module ? [opts.module] : []),
      });
    },
    /** Look up a class entry by `class` field. */
    get(class_id) { return byClass.get(class_id); },
    /** True if registered. */
    has(class_id) { return byClass.has(class_id); },
    /** All registered class identifiers (debugging / introspection). */
    list() { return [...byClass.keys()].sort(); },
    /** Remove a registration. Returns true if removed. */
    unregister(class_id) { return byClass.delete(class_id); },
  };
}

/** Shared default registry for `register(...)` and direct
 *  `load(...)` callers. Library authors who need isolation create
 *  their own via `createRegistry()`. */
const defaultRegistry = createRegistry();

/** Convenience: register into the default registry. */
function register(class_id, ClassCtor, opts) {
  defaultRegistry.register(class_id, ClassCtor, opts);
}

// ── src/v1-normalize.js ──

// @gcu/mimic-io — v1 → v2 in-memory normalization (spec §3.5)
//
// arborist has been writing mimic-io v1 since its initial release. v1's
// top-level shape is flat — fields like `algorithm`, `criterion`, `mode`,
// `tree`, `bonsai` live directly under the root rather than under
// `params` / `fitted` / `metadata`.
//
// This module transforms a parsed v1 JSON object into the equivalent v2
// shape so the rest of the load pipeline doesn't have to special-case it.
// The transform is data-only (no instantiation); the load layer takes the
// resulting v2 dict and routes it through the registry as usual.
//
// v1 covers DecisionTreeClassifier and DecisionTreeRegressor only —
// arborist never emitted anything else. mode="classification" maps to
// DecisionTreeClassifier; mode="regression" maps to DecisionTreeRegressor.

/**
 * @param {object} v1 — parsed v1 JSON object (the top-level dict)
 * @returns {object} — equivalent v2 dict
 */
function normalizeV1(v1) {
  if (v1.version !== 1) {
    throw new Error(`normalizeV1: expected version 1, got ${v1.version}`);
  }
  if (v1.format !== 'mimic-io') {
    throw new Error(`normalizeV1: not a mimic-io file (format="${v1.format}")`);
  }
  // mode determines classifier vs regressor.
  const isReg = v1.mode === 'regression';
  const class_id = isReg ? 'DecisionTreeRegressor' : 'DecisionTreeClassifier';

  const v2 = {
    format: 'mimic-io',
    version: 2,
    class: class_id,
    // Synthetic module identifier — there is no arborist class id in v1.
    // Consumers may treat "arborist" as an alias for "@gcu/learn.tree".
    module: 'arborist',
    params: {
      criterion: v1.criterion ?? (isReg ? 'variance' : 'gini'),
      // _mode is a synthetic field — underscore-prefixed to mark it as a
      // v1-bridge artifact rather than a real sklearn param. The class id
      // already encodes mode, but we keep it for downstream code that
      // expects to read it.
      _mode: v1.mode ?? (isReg ? 'regression' : 'classification'),
    },
    fitted: {
      n_features_in_: v1.n_features,
      tree_: v1.tree,  // parallel-array structure carries over unchanged
    },
    metadata: {},
  };

  if (Array.isArray(v1.feature_names)) {
    v2.fitted.feature_names_in_ = v1.feature_names;
  }
  if (Array.isArray(v1.class_names)) {
    v2.fitted.classes_ = v1.class_names;
    v2.fitted.n_classes_ = v1.n_classes ?? v1.class_names.length;
  } else if (Number.isFinite(v1.n_classes)) {
    v2.fitted.n_classes_ = v1.n_classes;
  }
  if (v1.target_name != null) {
    v2.metadata.target_name = v1.target_name;
  }
  if (v1.bonsai && typeof v1.bonsai === 'object') {
    v2.metadata.bonsai = v1.bonsai;
  }
  if (v1.exported_at) {
    v2.metadata.fitted_at = v1.exported_at;
  }
  if (v1.algorithm && v1.algorithm !== 'CART') {
    // Note non-CART algorithms in metadata so consumers can see them;
    // we don't try to handle them (arborist has only ever emitted CART).
    v2.metadata.v1_algorithm = v1.algorithm;
  }

  // Drop metadata if empty for cleanliness.
  if (Object.keys(v2.metadata).length === 0) delete v2.metadata;

  return v2;
}

/** True if a parsed object looks like a v1 mimic-io file. */
function isV1(obj) {
  return obj && typeof obj === 'object'
    && obj.format === 'mimic-io'
    && obj.version === 1;
}

// ── src/dump-load.js ──

// @gcu/mimic-io — top-level dump / load
//
// dump(estimator) walks the estimator's exposed `params` (hyperparameters
// at construction time) and trailing-underscore fitted attributes into a
// v2 mimic-io JSON dict. Recursive for nested estimators (Pipeline steps,
// ensemble.estimators_, ColumnTransformer branches).
//
// load(json, registry?) looks up the `class` field in the registry,
// instantiates with `params`, then assigns fitted attributes. Recursive
// in the same shape.
//
// Typed-array references in `fitted` decode to real TypedArrays. Plain
// JSON arrays of numbers also accepted as semantically equivalent
// (spec §5.3).


const FORMAT_TAG = 'mimic-io';
const VERSION = 2;

/**
 * Custom error thrown when load encounters an unsupported class.
 * Distinct from generic Error so callers can catch specifically.
 */
class MimicIOUnsupportedClass extends Error {
  constructor(class_id, module_id) {
    super(`this consumer does not implement ${class_id} from ${module_id ?? '<unknown module>'}`);
    this.name = 'MimicIOUnsupportedClass';
    this.class_id = class_id;
    this.module_id = module_id;
  }
}

/**
 * Build a v2 mimic-io JSON dict from a fitted estimator-shaped object.
 *
 * The estimator must expose:
 *   - `constructor.name` or an explicit `_class_id` field → the class
 *     identifier
 *   - `get_params()` returning the hyperparameter dict (or a `_params`
 *     field as fallback)
 *   - Trailing-underscore attributes for fitted state (`coef_`,
 *     `tree_`, `n_features_in_`, etc.)
 *
 * Or — and this is the load-without-class path — a plain JS object
 * matching the v2 shape directly is also accepted. Useful for testing
 * and for callers building the JSON by hand.
 *
 * @param {object} est — a fitted estimator or v2-shaped dict
 * @param {object} [opts]
 * @param {string} [opts.module] — module identifier to write into the
 *   `module` field. Defaults to "<unknown>" when the estimator doesn't
 *   carry one.
 * @returns {object} v2 mimic-io JSON dict
 */
function dump(est, opts = {}) {
  if (est == null || typeof est !== 'object') {
    throw new Error('dump: input must be an object');
  }

  // Pre-shaped path: caller hands us a v2 dict directly.
  if (est.format === FORMAT_TAG && (est.version === 2 || est.version === 1)) {
    return _dumpV2Tree(est);
  }

  const class_id = est._class_id ?? est.constructor?.name;
  if (!class_id || class_id === 'Object') {
    throw new Error(
      'dump: cannot determine class identifier — set est._class_id or wrap ' +
      'in a class with a meaningful constructor.name, or pass a pre-shaped ' +
      'v2 dict.',
    );
  }
  const module_id = opts.module ?? est._module ?? '<unknown>';

  const params = typeof est.get_params === 'function'
    ? est.get_params(/* deep = */ false)
    : (est._params ?? {});

  // Collect trailing-underscore attributes as the fitted block.
  const fitted = {};
  for (const key of Object.keys(est)) {
    if (key.endsWith('_') && !key.startsWith('_')) {
      fitted[key] = _encodeValue(est[key]);
    }
  }

  const out = {
    format: FORMAT_TAG,
    version: VERSION,
    class: class_id,
    module: module_id,
    params: _encodeParams(params),
    fitted,
  };
  if (est.metadata_) out.metadata = est.metadata_;
  return out;
}

/**
 * Load a v2 (or v1) mimic-io JSON dict into a constructed estimator.
 *
 * Lookup follows: parse → optional v1→v2 normalize → registry lookup by
 * `class` → instantiate with `params` → assign fitted attributes.
 *
 * @param {object|string} input — parsed JSON object or a JSON string
 * @param {object} [opts]
 * @param {ReturnType<createRegistry>} [opts.registry] — defaults to
 *   `defaultRegistry`
 * @param {boolean} [opts.rejectBigInt=true] — see decodeTypedArray
 * @returns {object} a fresh estimator instance (or the v2 dict if no
 *   constructor was registered and opts.strict=false)
 */
function load(input, opts = {}) {
  const registry = opts.registry ?? defaultRegistry;
  const rejectBigInt = opts.rejectBigInt ?? true;
  const strict = opts.strict ?? true;

  const root = typeof input === 'string' ? JSON.parse(input) : input;

  // v1 normalization happens before anything else — by the time we hit
  // the registry the data is in v2 shape.
  const v2 = isV1(root) ? normalizeV1(root) : root;

  if (v2.format !== FORMAT_TAG) {
    throw new Error(`load: not a mimic-io file (format="${v2.format}")`);
  }
  if (v2.version !== VERSION) {
    throw new Error(`load: unsupported version ${v2.version} (this loader handles v${VERSION})`);
  }

  return _loadOne(v2, registry, rejectBigInt, strict);
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _loadOne(node, registry, rejectBigInt, strict) {
  const class_id = node.class;
  const module_id = node.module;
  const entry = registry.get(class_id);

  if (!entry) {
    if (strict) throw new MimicIOUnsupportedClass(class_id, module_id);
    // Non-strict: return the decoded dict as-is. Caller deals.
    return _decodeBlock(node, registry, rejectBigInt, strict);
  }

  // Decode params (recursively — nested estimators in hyperparameters).
  const params = _decodeParams(node.params ?? {}, registry, rejectBigInt, strict);
  // Instantiate. The constructor signature is per-class-specific; the
  // sklearn convention is "store hyperparameters only, no work" — so
  // passing the params dict as a single argument is enough for most
  // estimators. Custom registrations can override by passing a factory.
  const est = new entry.ClassCtor(params);

  // Decode fitted state.
  const fitted = node.fitted;
  if (fitted != null && fitted !== false && typeof fitted === 'object') {
    for (const key of Object.keys(fitted)) {
      est[key] = _decodeValue(fitted[key], registry, rejectBigInt, strict);
    }
  }

  // Preserve metadata on `metadata_` for round-trip.
  if (node.metadata) est.metadata_ = node.metadata;
  return est;
}

// Walk a value that came from `fitted` or a hyperparameter slot:
//   - Nested mimic-io block → recursive load (instantiated estimator)
//   - Typed-array ref → decoded TypedArray
//   - Plain array → walk element-wise (may contain nested blocks)
//   - Plain object → walk values (preserves shape, no class instantiation)
//   - Scalar → pass through
function _decodeValue(v, registry, rejectBigInt, strict) {
  if (v == null) return v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    return v.map(x => _decodeValue(x, registry, rejectBigInt, strict));
  }
  if (isTypedArrayRef(v)) {
    return decodeTypedArray(v, { rejectBigInt });
  }
  if (v.format === FORMAT_TAG && v.version === VERSION) {
    // Nested estimator block — recurse.
    return _loadOne(v, registry, rejectBigInt, strict);
  }
  // Plain object — walk values, preserve shape (e.g. Pipeline's named_steps).
  const out = {};
  for (const k of Object.keys(v)) {
    out[k] = _decodeValue(v[k], registry, rejectBigInt, strict);
  }
  return out;
}

// Params can contain nested mimic-io blocks (e.g. BaggingClassifier's
// base_estimator). For unfitted nested params, `fitted` is null.
function _decodeParams(params, registry, rejectBigInt, strict) {
  if (params == null || typeof params !== 'object') return params;
  if (Array.isArray(params)) {
    return params.map(p => _decodeValue(p, registry, rejectBigInt, strict));
  }
  const out = {};
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v != null && typeof v === 'object' && v.format === FORMAT_TAG
        && v.version === VERSION && v.fitted == null) {
      // Unfitted nested estimator — instantiate from params only.
      const entry = registry.get(v.class);
      if (!entry) {
        if (strict) throw new MimicIOUnsupportedClass(v.class, v.module);
        out[k] = _decodeBlock(v, registry, rejectBigInt, strict);
        continue;
      }
      const nestedParams = _decodeParams(v.params ?? {}, registry, rejectBigInt, strict);
      out[k] = new entry.ClassCtor(nestedParams);
    } else {
      out[k] = _decodeValue(v, registry, rejectBigInt, strict);
    }
  }
  return out;
}

// Used when strict=false and a class isn't registered — return a decoded
// dict so caller can inspect it without instantiation.
function _decodeBlock(node, registry, rejectBigInt, strict) {
  const out = {
    format: node.format,
    version: node.version,
    class: node.class,
    module: node.module,
    params: _decodeParams(node.params ?? {}, registry, rejectBigInt, strict),
    fitted: node.fitted ? _decodeValue(node.fitted, registry, rejectBigInt, strict) : node.fitted,
  };
  if (node.metadata) out.metadata = node.metadata;
  return out;
}

// Walk an already-v2 JSON tree (estimator-shape dict) and produce a clean
// copy with typed arrays normalized to refs. Used when caller passes a
// pre-shaped v2 dict to dump().
function _dumpV2Tree(node) {
  const out = {
    format: node.format,
    version: node.version,
    class: node.class,
    module: node.module,
    params: _encodeParams(node.params ?? {}),
    fitted: node.fitted == null ? node.fitted : _encodeValue(node.fitted),
  };
  if (node.metadata) out.metadata = node.metadata;
  return out;
}

// Walk a value for the dump path — typed arrays become refs, nested
// mimic-io-shaped subobjects pass through with their typed arrays also
// encoded.
function _encodeValue(v) {
  if (v == null) return v;
  if (typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    // Real typed array — encode.
    return encodeTypedArray(v);
  }
  if (Array.isArray(v)) {
    return v.map(_encodeValue);
  }
  if (v.format === FORMAT_TAG) {
    // Already-shaped nested mimic-io block — recurse via the tree walker.
    return _dumpV2Tree(v);
  }
  const out = {};
  for (const k of Object.keys(v)) out[k] = _encodeValue(v[k]);
  return out;
}

function _encodeParams(params) {
  if (params == null || typeof params !== 'object') return params;
  return _encodeValue(params);
}

// ── src/canonical.js ──

// @gcu/mimic-io — canonical serialization (spec §3.4)
//
// Signing a JSON file byte-for-byte requires a stable encoding both
// producer and verifier agree on. JSON has multiple semantically-
// equivalent serializations (key order, whitespace, integer-vs-decimal
// float text), so non-canonical JSON can round-trip identically through
// parse/stringify yet have different bytes — breaking any Ed25519
// signature over the bytes.
//
// Canonical form, per spec §3.4:
//   - UTF-8, no BOM
//   - LF line endings (no CRLF)
//   - Sorted object keys at every level (lexicographic byte order)
//   - 2-space indent for nested objects/arrays
//   - One element per line in arrays, except short arrays of pure
//     scalars (numbers, strings, booleans, null) which inline when they
//     fit in ≤ 80 columns including indent
//   - Integers: bare decimal, no leading zeros, no trailing `.0`
//   - Floats: shortest round-trippable decimal form (JS's default
//     Number.toString() is exactly this; Python's repr(float) too)
//   - NaN / Infinity / -Infinity: emitted as JSON `null`, with a
//     `metadata.nan_indices` entry recording positions (round-trip
//     preserves them, and signing covers them through the metadata)
//   - Trailing newline at end-of-file

const INDENT = '  ';
const INLINE_THRESHOLD = 80;

/**
 * Serialize a JSON-compatible value into canonical form. The return is
 * a string ready for hashing/signing.
 *
 * Caller is responsible for ensuring NaN / Infinity are pre-substituted
 * with null + recorded in metadata. canonicalize itself emits them as
 * null without complaint, on the theory that the producer's encode
 * step should handle this — but defensively, an opts.rejectNonFinite
 * flag exists to fail loudly.
 *
 * @param {*} value
 * @param {object} [opts]
 * @param {boolean} [opts.rejectNonFinite=false]
 * @returns {string}
 */
function canonicalize(value, opts = {}) {
  const rejectNonFinite = !!opts.rejectNonFinite;
  const lines = [];
  _emit(value, 0, lines, rejectNonFinite, null);
  return lines.join('\n') + '\n';
}

function _emit(value, depth, lines, rejectNonFinite, _pathHint) {
  if (value === null) {
    _append(lines, depth, 'null');
    return;
  }
  if (typeof value === 'boolean') {
    _append(lines, depth, value ? 'true' : 'false');
    return;
  }
  if (typeof value === 'number') {
    _append(lines, depth, _formatNumber(value, rejectNonFinite));
    return;
  }
  if (typeof value === 'string') {
    _append(lines, depth, _formatString(value));
    return;
  }
  if (Array.isArray(value)) {
    _emitArray(value, depth, lines, rejectNonFinite);
    return;
  }
  if (typeof value === 'object') {
    _emitObject(value, depth, lines, rejectNonFinite);
    return;
  }
  throw new Error(`canonicalize: unsupported value type ${typeof value}`);
}

function _emitArray(arr, depth, lines, rejectNonFinite) {
  if (arr.length === 0) {
    _append(lines, depth, '[]');
    return;
  }
  // Try inline form for short arrays of pure scalars.
  const inline = _maybeInlineArray(arr, depth, rejectNonFinite);
  if (inline !== null) {
    _append(lines, depth, inline);
    return;
  }
  // Block form: one element per line.
  _append(lines, depth, '[');
  for (let i = 0; i < arr.length; i++) {
    _emit(arr[i], depth + 1, lines, rejectNonFinite, `[${i}]`);
    const last = lines[lines.length - 1];
    if (i < arr.length - 1) lines[lines.length - 1] = last + ',';
  }
  _append(lines, depth, ']');
}

function _maybeInlineArray(arr, depth, rejectNonFinite) {
  // Only attempt inline if every element is a scalar.
  for (const v of arr) {
    if (v !== null && typeof v !== 'number' && typeof v !== 'string' &&
        typeof v !== 'boolean') return null;
  }
  const parts = arr.map(v => {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return _formatNumber(v, rejectNonFinite);
    return _formatString(v);
  });
  const inline = '[' + parts.join(', ') + ']';
  const indented = INDENT.repeat(depth) + inline;
  if (indented.length <= INLINE_THRESHOLD) return inline;
  return null;
}

function _emitObject(obj, depth, lines, rejectNonFinite) {
  const keys = Object.keys(obj).sort();
  if (keys.length === 0) {
    _append(lines, depth, '{}');
    return;
  }
  _append(lines, depth, '{');
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    const keyStr = _formatString(k) + ': ';
    // For scalar values we keep the key + value on one line; for nested
    // we put the key on its own line.
    if (_isScalar(v)) {
      const scalar = (v === null) ? 'null'
        : typeof v === 'boolean' ? (v ? 'true' : 'false')
        : typeof v === 'number' ? _formatNumber(v, rejectNonFinite)
        : _formatString(v);
      const trailing = i < keys.length - 1 ? ',' : '';
      _append(lines, depth + 1, keyStr + scalar + trailing);
    } else if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
      // Try inline for short scalar arrays / empty containers.
      if (Array.isArray(v) && v.length === 0) {
        const trailing = i < keys.length - 1 ? ',' : '';
        _append(lines, depth + 1, keyStr + '[]' + trailing);
        continue;
      }
      if (!Array.isArray(v) && Object.keys(v).length === 0) {
        const trailing = i < keys.length - 1 ? ',' : '';
        _append(lines, depth + 1, keyStr + '{}' + trailing);
        continue;
      }
      if (Array.isArray(v)) {
        const inline = _maybeInlineArray(v, depth + 1, rejectNonFinite);
        if (inline !== null) {
          const trailing = i < keys.length - 1 ? ',' : '';
          _append(lines, depth + 1, keyStr + inline + trailing);
          continue;
        }
      }
      _append(lines, depth + 1, keyStr.trimEnd());
      _emit(v, depth + 1, lines, rejectNonFinite, k);
      // Append the value to the previous "key:" line: object_open or array_open
      // is on its own line; merge "key:" with the opening token. We do this by
      // popping the last two lines and rejoining.
      // Simpler approach: emit the opener inline with the key.
      // -- the current implementation produces:
      //    "key:"
      //    "{"
      //    ...
      // which is also valid canonical form; pretty-printers vary. To match
      // common conventions, post-process: if the line after key-line starts
      // with `{` or `[` at the same indent, merge them.
      const lastIdx = lines.length - 1;
      const keyLineIdx = _findKeyLine(lines, lastIdx, keyStr.trimEnd());
      _mergeKeyAndOpener(lines, keyLineIdx);
      if (i < keys.length - 1) {
        lines[lines.length - 1] = lines[lines.length - 1] + ',';
      }
    }
  }
  _append(lines, depth, '}');
}

function _isScalar(v) {
  return v === null || typeof v === 'boolean' || typeof v === 'number'
    || typeof v === 'string';
}

function _formatNumber(n, rejectNonFinite) {
  if (!Number.isFinite(n)) {
    if (rejectNonFinite) {
      throw new Error(
        `canonicalize: non-finite number ${n}; pre-substitute with null + ` +
        `metadata.nan_indices, or pass opts.rejectNonFinite=false to emit null`,
      );
    }
    return 'null';
  }
  // Integer fast path — emit without trailing .0
  if (Number.isInteger(n)) return n.toString();
  // JS's default Number.toString() is the shortest round-trippable form
  // for finite floats (per ECMA-262 §7.1.17). That's what we want.
  return n.toString();
}

function _formatString(s) {
  // JSON escape — minimum required. JS's JSON.stringify(s) handles this
  // correctly and produces canonical escapes for control chars.
  return JSON.stringify(s);
}

function _append(lines, depth, content) {
  lines.push(INDENT.repeat(depth) + content);
}

function _findKeyLine(lines, fromIdx, keyPrefix) {
  for (let i = fromIdx; i >= 0; i--) {
    if (lines[i].trimStart().startsWith(keyPrefix)) return i;
  }
  return -1;
}

function _mergeKeyAndOpener(lines, keyLineIdx) {
  if (keyLineIdx < 0 || keyLineIdx + 1 >= lines.length) return;
  const keyLine = lines[keyLineIdx];
  const nextLine = lines[keyLineIdx + 1];
  // The opener line is either at indent (depth) `{` or `[` exactly; merge.
  const nextTrimmed = nextLine.trimStart();
  if (nextTrimmed === '{' || nextTrimmed === '[') {
    lines[keyLineIdx] = keyLine + ' ' + nextTrimmed;
    lines.splice(keyLineIdx + 1, 1);
  }
}

// ── src/main.js ──

// @gcu/mimic-io — package entry point
//
// Public surface (per SPEC-mimic-io.md):
//   - dump(estimator, opts?)            — produce a v2 JSON dict
//   - load(json, opts?)                 — instantiate from v2 (or v1) JSON
//   - register(class_id, Ctor, opts?)   — register in defaultRegistry
//   - createRegistry()                  — fresh, isolated registry
//   - defaultRegistry                   — shared registry for register()
//   - canonicalize(value, opts?)        — canonical serialization for signing
//   - encodeTypedArray / decodeTypedArray — typed-array codec helpers
//   - MimicIOUnsupportedClass           — thrown when load can't find a class
//   - normalizeV1 / isV1                — v1 → v2 data-only transform

export {
  dump,
  load,
  MimicIOUnsupportedClass,
  register,
  createRegistry,
  defaultRegistry,
  canonicalize,
  encodeTypedArray,
  decodeTypedArray,
  isTypedArrayRef,
  normalizeV1,
  isV1,
};

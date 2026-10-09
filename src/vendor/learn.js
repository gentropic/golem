// ⚠ VENDORED — DO NOT EDIT. @gcu/learn (sklearn-shaped estimators; its tree .compile() uses new Function and is refused in the worker), copied from ../auditable/ext/learn/index.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// @gcu/learn — bundled from src/
// SPDX-License-Identifier: MIT
// Auto-generated — do not edit; edit src/ and rerun build.js.

import { NdArray, cholesky, lstsq, solveCholesky, svd } from '@gcu/line';
import { MimicIOUnsupportedClass, createRegistry, dump as _mioDump, isV1, load as _mioLoad, normalizeV1 } from '@gcu/mimic-io';
import { KDTree, ndtri } from '@gcu/scitra';

// ── util/random.js ──

// Seedable RNG. mulberry32 — small, fast, 2^32 period. Matches the
// convention used by arborist (validation.js) and @gcu/scitra so seeds
// are interchangeable across the GCU stack.
//
// Pre-seeded RNG instances are not accepted as random_state inputs (the
// fourth JS-imposed deviation in SPEC-learn §3.6); pass an integer.

function mulberry32(seed) {
  let s = (seed | 0) >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resolve a random_state value into a uniform [0, 1) sampler.
 * `null` / `undefined` returns Math.random; an integer seeds mulberry32;
 * any other type raises (per SPEC-learn §3.6 deviation 4).
 */
function makeRng(random_state) {
  if (random_state == null) return Math.random;
  if (typeof random_state === 'number' && Number.isInteger(random_state)) {
    return mulberry32(random_state);
  }
  throw new TypeError(
    `random_state must be an integer or null; got ${typeof random_state}. ` +
    `(Pre-seeded RNG instances are not accepted; see SPEC-learn §3.6.)`,
  );
}

// Box-Muller cached-pair normal sampler.
function makeNormalSampler(uniform) {
  let cached = null;
  return function () {
    if (cached !== null) { const v = cached; cached = null; return v; }
    let u1, u2;
    do { u1 = uniform(); } while (u1 === 0);
    u2 = uniform();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    cached = z1;
    return z0;
  };
}

// ── util/checks.js ──

// Input validation primitives shared across estimators.
//
// Two principles:
//   1) Validate at the API boundary (fit/predict/transform). Internal
//      helpers trust their inputs.
//   2) Errors are clear and name the offending field. NaN/Inf checks are
//      gated by tags (an estimator with `allow_nan: true` skips them).

class ValidationError extends Error {
  constructor(msg) { super(msg); this.name = 'ValidationError'; }
}

/**
 * Capture sklearn's `feature_names_in_` attribute on a fitted estimator
 * when the asMatrix result carries column names (input was a sadpan
 * Table, DataFrame, or named-column object). No-op otherwise.
 *
 * Estimators call this at end-of-fit, after validation, to thread the
 * column names from the boundary to the fitted state. Cheap and
 * idempotent; dump/load preserves it through mimic-io's default codec.
 */
function captureFeatureNames(est, X_info) {
  if (X_info && X_info.feature_names) {
    est.feature_names_in_ = X_info.feature_names.slice();
  }
}

// ────────────────────────────────────────────────────────────────────
// Table-shaped input helpers (used by asMatrix and from_table)
// ────────────────────────────────────────────────────────────────────

/**
 * Detect what kind of table-shaped input `df` is. Returns one of:
 *   'table'  — sadpan Table (numRows + array + columnNames)
 *   'df'     — sadpan DataFrame (columns array + __getitem__ + .shape)
 *   'plain'  — plain JS object with named array-like columns
 *   null     — none of the above
 */
function detectTable(df) {
  if (df == null || typeof df !== 'object') return null;
  if (Array.isArray(df) || ArrayBuffer.isView(df)) return null;
  if (typeof df.numRows === 'function'
      && typeof df.array === 'function'
      && typeof df.columnNames === 'function') return 'table';
  if (Array.isArray(df.columns)
      && typeof df.__getitem__ === 'function'
      && Array.isArray(df.shape) && df.shape.length === 2) return 'df';
  // Plain object: same heuristic as asMatrix's _looksLikeNamedColumns_checks.
  const keys = Object.keys(df);
  if (keys.length === 0) return null;
  if (keys.includes('data') && keys.includes('shape')) return null;
  const first = df[keys[0]];
  if (first == null || typeof first.length !== 'number') return null;
  return 'plain';
}

/** Get the list of column names for a table-shaped input. */
function tableColumns(df, kind) {
  if (kind === 'table') return df.columnNames();
  if (kind === 'df') return df.columns;
  return Object.keys(df);
}

/** Get the row count of a table-shaped input. */
function tableNumRows(df, kind) {
  if (kind === 'table') return df.numRows();
  if (kind === 'df') return df.shape[0];
  // plain
  const keys = Object.keys(df);
  return df[keys[0]].length;
}

/**
 * Extract a single column by name. Returns the raw column data (any
 * array-like). Caller decides whether to coerce to numeric or treat
 * as labels.
 */
function tableColumn(df, kind, name) {
  if (kind === 'table') return df.array(name);
  if (kind === 'df') {
    const series = df.__getitem__(name);
    return series.values;
  }
  return df[name];
}

// Coerce X to a 2D Float64Array view. Accepts:
//   - Float64Array with `.shape` set (natra-shaped): pass through
//   - 2D Array of Arrays of numbers: flatten + record shape
//   - { data: TypedArray, shape: [n, m] }: pass through with shape
//   - sadpan Table (numRows + array + columnNames): stack columns
//   - sadpan DataFrame (shape + columns + __getitem__):  stack columns
//   - plain JS object with named numeric-array columns ({a: [...], b: [...]}):
//     stack in declaration order
// Returns { data: Float64Array, shape: [n, m], feature_names? }.
// `feature_names` is set only when input carried column names — estimators
// pick it up to populate sklearn's `feature_names_in_` attribute.
function asMatrix(X, { name = 'X', allow_nan = false } = {}) {
  if (X == null) {
    throw new ValidationError(`${name}: input is ${X}`);
  }
  // Already in our normalized form.
  if (X instanceof Float64Array && Array.isArray(X.shape) && X.shape.length === 2) {
    if (!allow_nan) _checkFiniteFlat_checks(X, name);
    const out = { data: X, shape: X.shape };
    if (X.feature_names) out.feature_names = X.feature_names;
    return out;
  }
  // { data, shape } shape (natra-style ndarray with extra fields).
  if (typeof X === 'object' && X.data instanceof Float64Array
      && Array.isArray(X.shape) && X.shape.length === 2) {
    const total = X.shape[0] * X.shape[1];
    if (X.data.length < total) {
      throw new ValidationError(
        `${name}: data length ${X.data.length} < shape product ${total}`);
    }
    if (!allow_nan) _checkFiniteFlat_checks(X.data, name, total);
    const out = { data: X.data, shape: [X.shape[0], X.shape[1]] };
    if (X.feature_names) out.feature_names = X.feature_names;
    return out;
  }
  // sadpan Table — duck-type: numRows() + array(name) + columnNames().
  if (typeof X === 'object'
      && typeof X.numRows === 'function'
      && typeof X.array === 'function'
      && typeof X.columnNames === 'function') {
    const cols = X.columnNames();
    return _stackNamedColumns_checks(name, cols, c => X.array(c), X.numRows(), allow_nan);
  }
  // sadpan DataFrame — duck-type: .columns array + __getitem__(name) →
  // Series w/ .values, plus .shape array.
  if (typeof X === 'object'
      && Array.isArray(X.columns)
      && typeof X.__getitem__ === 'function'
      && Array.isArray(X.shape) && X.shape.length === 2) {
    const cols = X.columns;
    return _stackNamedColumns_checks(name, cols,
      c => X.__getitem__(c).values, X.shape[0], allow_nan);
  }
  // 2D nested array (rows of columns).
  if (Array.isArray(X) && X.length > 0 && Array.isArray(X[0])) {
    const n = X.length;
    const m = X[0].length;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const row = X[i];
      if (!Array.isArray(row) || row.length !== m) {
        throw new ValidationError(
          `${name}: row ${i} has length ${row?.length ?? '?'}, expected ${m}`);
      }
      for (let j = 0; j < m; j++) {
        const v = +row[j];
        if (!allow_nan && !Number.isFinite(v)) {
          throw new ValidationError(`${name}: non-finite value at row ${i} col ${j}`);
        }
        out[i * m + j] = v;
      }
    }
    return { data: out, shape: [n, m] };
  }
  // Plain JS object with named columns: { col1: [...], col2: [...] }.
  // Skip for {data, shape} which is handled above. Detect by: not an
  // array, not a typed array, has at least one own property whose value
  // is an array of numbers.
  if (typeof X === 'object'
      && !ArrayBuffer.isView(X)
      && !Array.isArray(X)
      && _looksLikeNamedColumns_checks(X)) {
    const cols = Object.keys(X);
    const n = X[cols[0]].length;
    return _stackNamedColumns_checks(name, cols, c => X[c], n, allow_nan);
  }
  // 1D array fallback — sklearn raises here, recommending reshape(-1, 1).
  if (Array.isArray(X) || (X.constructor && X.constructor.name.endsWith('Array'))) {
    throw new ValidationError(
      `${name}: expected 2D input (samples × features). Got 1D; reshape ` +
      `to a 2D array of shape (n, 1) for single-feature data.`);
  }
  throw new ValidationError(`${name}: unrecognized shape (${typeof X})`);
}

function _looksLikeNamedColumns_checks(obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  // First column must be array-like with a length.
  const first = obj[keys[0]];
  if (first == null) return false;
  if (typeof first.length !== 'number') return false;
  // Reject if it looks like {data, shape} (handled earlier) — keys would be
  // exactly 'data' and 'shape'. Also reject Series (already detected via
  // duck-type elsewhere).
  if (keys.includes('data') && keys.includes('shape')) return false;
  return true;
}

// Stack named columns into a row-major Float64Array. `getCol(name)` returns
// the column data (any array-like). Validates that all columns share the
// same length and that values are finite (when allow_nan=false).
function _stackNamedColumns_checks(name, cols, getCol, n, allow_nan) {
  const m = cols.length;
  if (m === 0) {
    throw new ValidationError(`${name}: input has no columns`);
  }
  const out = new Float64Array(n * m);
  for (let j = 0; j < m; j++) {
    const col = getCol(cols[j]);
    if (col == null || typeof col.length !== 'number') {
      throw new ValidationError(`${name}: column '${cols[j]}' is not array-like`);
    }
    if (col.length !== n) {
      throw new ValidationError(
        `${name}: column '${cols[j]}' has length ${col.length}, expected ${n}`);
    }
    for (let i = 0; i < n; i++) {
      const v = +col[i];
      if (!allow_nan && !Number.isFinite(v)) {
        throw new ValidationError(
          `${name}: non-finite value in column '${cols[j]}' at row ${i}`);
      }
      out[i * m + j] = v;
    }
  }
  return { data: out, shape: [n, m], feature_names: cols.slice() };
}

// Coerce y to a 1D Float64Array. Accepts plain Array, Float64Array,
// Int32Array, sadpan Series (anything with .values), etc.
function asVector(y, { name = 'y', allow_nan = false } = {}) {
  if (y == null) throw new ValidationError(`${name}: input is ${y}`);
  if (y instanceof Float64Array) {
    if (!allow_nan) _checkFiniteFlat_checks(y, name);
    return y;
  }
  if (ArrayBuffer.isView(y) && !(y instanceof DataView)) {
    const out = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) out[i] = y[i];
    if (!allow_nan) _checkFiniteFlat_checks(out, name);
    return out;
  }
  if (Array.isArray(y)) {
    const out = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) {
      const v = +y[i];
      if (!allow_nan && !Number.isFinite(v)) {
        throw new ValidationError(`${name}: non-finite value at index ${i}`);
      }
      out[i] = v;
    }
    return out;
  }
  // sadpan Series duck-type: anything carrying a .values array. Catches
  // both DataFrame.__getitem__ output and explicit Series instances.
  if (typeof y === 'object' && Array.isArray(y.values)) {
    return asVector(y.values, { name, allow_nan });
  }
  throw new ValidationError(`${name}: unrecognized shape (${typeof y})`);
}

// Verify n_features matches what the estimator saw at fit time.
function checkNFeatures(est, X_shape, { name = 'X' } = {}) {
  if (est.n_features_in_ == null) return;
  if (X_shape[1] !== est.n_features_in_) {
    throw new ValidationError(
      `${name} has ${X_shape[1]} features, but ${est.constructor.name} ` +
      `was fitted with ${est.n_features_in_} features`);
  }
}

function _checkFiniteFlat_checks(arr, name, len) {
  const n = len ?? arr.length;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(arr[i])) {
      throw new ValidationError(`${name}: non-finite value at flat index ${i}`);
    }
  }
}

// ── base.js ──

// BaseEstimator + mixins + clone + check_is_fitted.
//
// Mirrors scikit-learn's `sklearn.base` to the letter, modulo the four
// JS-imposed deviations listed in SPEC-learn §3.6:
//   1. No keyword arguments — fit/predict take a trailing options object.
//   2. No pickle — dump/load go through @gcu/mimic-io.
//   3. No scipy.sparse — dense ndarrays only.
//   4. random_state accepts integer or null only.
//
// Hyperparameter convention. sklearn introspects the constructor signature
// to know what the hyperparameters are. JS doesn't expose that without
// transpilation, so we use a property-based convention:
//
//   - Hyperparameters are own enumerable properties with no leading or
//     trailing underscore. The constructor sets them, never modifies them
//     thereafter.
//   - Fitted attributes have a trailing underscore (mean_, coef_, tree_,
//     n_features_in_, etc.). check_is_fitted scans for at least one.
//   - Internal state has a leading underscore (_predict_interpreted, etc.)
//     and is preserved by clone but not exposed in get_params or
//     check_is_fitted.
//
// Estimators that need explicit control over what get_params returns set
// `static _param_keys = [...]` on the class. Useful when an estimator
// stores derived/cached values on `this` for hot-path lookup.

// ────────────────────────────────────────────────────────────────────
// NotFittedError
// ────────────────────────────────────────────────────────────────────

class NotFittedError extends Error {
  constructor(estimator_or_name) {
    const name = typeof estimator_or_name === 'string'
      ? estimator_or_name
      : estimator_or_name?.constructor?.name ?? 'estimator';
    super(
      `This ${name} instance is not fitted yet. Call 'fit' with appropriate ` +
      `arguments before using this estimator.`,
    );
    this.name = 'NotFittedError';
  }
}

// ────────────────────────────────────────────────────────────────────
// BaseEstimator
// ────────────────────────────────────────────────────────────────────

class BaseEstimator {
  /**
   * Return the hyperparameter dict.
   *
   * @param {boolean} [deep=true] — when true, recursively expands nested
   *   estimator hyperparameters using the dotted double-underscore notation
   *   (`pipeline__step__param`). When false, returns only the top-level
   *   hyperparameters with nested estimators as opaque references.
   */
  get_params(deep = true) {
    const keys = _paramKeys_base(this);
    const out = {};
    for (const key of keys) {
      const v = this[key];
      out[key] = v;
      if (deep && _isEstimator_base(v) && typeof v.get_params === 'function') {
        const sub = v.get_params(true);
        for (const sk of Object.keys(sub)) {
          out[`${key}__${sk}`] = sub[sk];
        }
      }
    }
    return out;
  }

  /**
   * Set hyperparameters in place. Returns this for chaining.
   *
   * Accepts dotted double-underscore notation for nested estimators
   * (`{ 'forest__max_depth': 8 }`), splitting on `__` and walking the
   * nested structure to call set_params on the right sub-estimator.
   */
  set_params(params) {
    if (params == null) return this;
    const valid = new Set(_paramKeys_base(this));

    // Group nested params by their root key to avoid re-walking for each
    // sub-key (a Pipeline with 5 params on the same step shouldn't dispatch
    // 5 times).
    const direct = {};
    const nested = {};
    for (const key of Object.keys(params)) {
      const idx = key.indexOf('__');
      if (idx === -1) {
        direct[key] = params[key];
      } else {
        const root = key.slice(0, idx);
        const sub = key.slice(idx + 2);
        if (!nested[root]) nested[root] = {};
        nested[root][sub] = params[key];
      }
    }

    for (const key of Object.keys(direct)) {
      if (!valid.has(key)) {
        throw new Error(
          `Invalid parameter '${key}' for estimator ${this.constructor.name}. ` +
          `Valid parameters are: ${[...valid].sort().join(', ')}.`,
        );
      }
      this[key] = direct[key];
    }

    for (const root of Object.keys(nested)) {
      if (!valid.has(root)) {
        throw new Error(
          `Invalid parameter '${root}' for estimator ${this.constructor.name}. ` +
          `Valid parameters are: ${[...valid].sort().join(', ')}.`,
        );
      }
      const sub = this[root];
      if (!_isEstimator_base(sub) || typeof sub.set_params !== 'function') {
        throw new Error(
          `Parameter '${root}' on ${this.constructor.name} is not an estimator; ` +
          `cannot set nested params on it.`,
        );
      }
      sub.set_params(nested[root]);
    }

    return this;
  }

  /**
   * Capability flags. Subclasses override to set tags. The base returns the
   * sklearn-default tag dict; mixins override individual flags.
   */
  __sklearn_tags__() {
    return {
      requires_y: false,
      allow_nan: false,
      binary_only: false,
      multioutput: false,
      pairwise: false,
      requires_positive_X: false,
      requires_positive_y: false,
      non_deterministic: false,
      poor_score: false,
      no_validation: false,
      stateless: false,
      // Set by mixins when they apply. Estimators inheriting from no
      // mixin (e.g. raw transformers extending BaseEstimator directly)
      // get an empty estimator_type and check_estimator falls back to
      // probing `_estimator_type` on the class.
      estimator_type: this.constructor._estimator_type ?? null,
    };
  }

  /**
   * Default fit_transform: fit then transform, threading the same opts
   * object through both. Subclasses override only when there's a fused
   * implementation that's faster than sequential.
   */
  fit_transform(X, y, opts) {
    if (typeof this.transform !== 'function') {
      throw new Error(
        `${this.constructor.name} does not implement transform(); cannot ` +
        `default-implement fit_transform.`,
      );
    }
    return this.fit(X, y, opts).transform(X);
  }

  /**
   * Opt-in JIT-compile for performance per SPEC §6.5. No-op default —
   * tree-family estimators (DecisionTree*, RandomForest*, ExtraTrees*,
   * GradientBoosting*) override to compile their fitted trees into JS
   * functions and rewire predict/predict_proba to dispatch through them.
   *
   * Returns this for chaining: est.fit(X, y).compile().predict(X).
   */
  compile() {
    return this;
  }

  /** Stable string identity for debugging and registry lookup. */
  toString() {
    const params = this.get_params(false);
    const parts = Object.keys(params).sort().map(k => {
      const v = params[k];
      if (v == null) return `${k}=null`;
      if (typeof v === 'string') return `${k}='${v}'`;
      if (typeof v === 'object') return `${k}=<${v.constructor?.name ?? 'object'}>`;
      return `${k}=${v}`;
    });
    return `${this.constructor.name}(${parts.join(', ')})`;
  }
}

BaseEstimator._estimator_type = null;

// ────────────────────────────────────────────────────────────────────
// Mixins
// ────────────────────────────────────────────────────────────────────
//
// JS doesn't have multiple inheritance, but sklearn's mixins are just bags
// of methods + a tag override. We expose them as helpers that subclasses
// invoke explicitly:
//
//   class StandardScaler extends BaseEstimator {
//     static _estimator_type = 'transformer';
//     // ... fit/transform ...
//   }
//   Object.assign(StandardScaler.prototype, TransformerMixin);
//
// The tag override and default scorer come along for free.

const ClassifierMixin = {
  /** Mean accuracy on (X, y). */
  score(X, y, opts) {
    const yhat = this.predict(X);
    return _accuracy_base(asArray1d(y), asArray1d(yhat), opts?.sample_weight);
  },
  /**
   * log of predict_proba, clipped to avoid -Infinity on zero-probability cells.
   * Subclasses with a more accurate log-domain pathway (e.g. GMM via
   * log-responsibilities) override; the default works for any classifier
   * that exposes predict_proba.
   */
  predict_log_proba(X) {
    if (typeof this.predict_proba !== 'function') {
      throw new Error(
        `${this.constructor.name}.predict_log_proba: predict_proba not implemented`);
    }
    const proba = this.predict_proba(X);
    return _logProbaInPlace_base(proba);
  },
  __sklearn_tags__() {
    const base = BaseEstimator.prototype.__sklearn_tags__.call(this);
    return { ...base, requires_y: true, estimator_type: 'classifier' };
  },
};

const RegressorMixin = {
  /** R² coefficient of determination. */
  score(X, y, opts) {
    const yhat = this.predict(X);
    return _r2_base(asArray1d(y), asArray1d(yhat), opts?.sample_weight);
  },
  __sklearn_tags__() {
    const base = BaseEstimator.prototype.__sklearn_tags__.call(this);
    return { ...base, requires_y: true, estimator_type: 'regressor' };
  },
};

const TransformerMixin = {
  /**
   * Default fit_transform — overridden here because TransformerMixin's
   * version threads through the y argument when fit accepts it. (Most
   * transformers ignore y; some — TargetEncoder, supervised PCA — don't.)
   */
  fit_transform(X, y, opts) {
    return this.fit(X, y, opts).transform(X);
  },
  __sklearn_tags__() {
    const base = BaseEstimator.prototype.__sklearn_tags__.call(this);
    return { ...base, requires_y: false, estimator_type: 'transformer' };
  },
};

const ClusterMixin = {
  /**
   * Default scorer for clusterers is silhouette over the fitted labels.
   * Implementations override when a non-silhouette default makes sense
   * (GaussianMixture overrides with average log-likelihood).
   *
   * Returns NaN when fewer than 2 distinct clusters survive noise filtering
   * (sklearn behaviour: silhouette is undefined for a single-cluster
   * partition). y is ignored — silhouette is unsupervised.
   */
  score(X, _y, _opts) {
    if (this.labels_ == null) {
      throw new Error(`${this.constructor.name}.score: not fitted`);
    }
    // Use fresh predictions for X if predict is available (e.g. KMeans on
    // held-out data). For partition-only clusterers (Agglomerative, DBSCAN)
    // the score is over fit_predict, which is the labels we already have.
    const labels = typeof this.predict === 'function'
      ? this.predict(X)
      : this.labels_;
    return silhouette_score(X, labels);
  },
  fit_predict(X, y, opts) {
    return this.fit(X, y, opts).labels_;
  },
  __sklearn_tags__() {
    const base = BaseEstimator.prototype.__sklearn_tags__.call(this);
    return { ...base, requires_y: false, estimator_type: 'clusterer' };
  },
};

// ────────────────────────────────────────────────────────────────────
// clone
// ────────────────────────────────────────────────────────────────────

/**
 * Build a fresh, unfitted copy of `estimator` with the same hyperparameters.
 *
 * Recursively clones nested-estimator hyperparameters (the Pipeline case).
 * Non-estimator hyperparameters are deep-copied if they're plain
 * arrays/objects/typed arrays; primitives pass through by value.
 *
 * Estimators with custom cloning needs override `__sklearn_clone__()` to
 * return a fresh instance directly.
 */
function clone(estimator) {
  if (estimator == null) return estimator;
  if (Array.isArray(estimator)) return estimator.map(clone);
  if (typeof estimator !== 'object') return estimator;

  // Override hook (spec §3.6).
  if (typeof estimator.__sklearn_clone__ === 'function') {
    return estimator.__sklearn_clone__();
  }

  // Estimator: recreate via constructor with cloned params.
  if (_isEstimator_base(estimator)) {
    const Ctor = estimator.constructor;
    const params = estimator.get_params(false);
    const clonedParams = {};
    for (const key of Object.keys(params)) {
      clonedParams[key] = clone(params[key]);
    }
    return new Ctor(clonedParams);
  }

  // Plain object / typed array — deep-copy.
  if (ArrayBuffer.isView(estimator) && !(estimator instanceof DataView)) {
    return new estimator.constructor(estimator);
  }
  // Plain object: copy own enumerable keys recursively.
  const out = {};
  for (const k of Object.keys(estimator)) out[k] = clone(estimator[k]);
  return out;
}

// ────────────────────────────────────────────────────────────────────
// check_is_fitted
// ────────────────────────────────────────────────────────────────────

/**
 * Raise NotFittedError if `estimator` is not fitted.
 *
 * Default: scan for any own enumerable trailing-underscore attribute.
 * Estimators that need a different signal (e.g. a fitted attribute that
 * doesn't end in `_`) override `__sklearn_is_fitted__()` to return a bool.
 */
function check_is_fitted(estimator, attributes = null) {
  if (estimator == null || typeof estimator !== 'object') {
    throw new TypeError('check_is_fitted: input is not an estimator');
  }
  // Override hook (spec §3.6).
  if (typeof estimator.__sklearn_is_fitted__ === 'function') {
    if (estimator.__sklearn_is_fitted__()) return;
    throw new NotFittedError(estimator);
  }
  // Specific attribute(s) requested.
  if (attributes != null) {
    const names = Array.isArray(attributes) ? attributes : [attributes];
    for (const name of names) {
      if (estimator[name] === undefined || estimator[name] === null) {
        throw new NotFittedError(estimator);
      }
    }
    return;
  }
  // Default: any trailing-underscore attribute counts.
  for (const k of Object.keys(estimator)) {
    if (k.endsWith('_') && !k.startsWith('_')) return;
  }
  throw new NotFittedError(estimator);
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

// Resolve the hyperparameter key list. Either explicit via static
// _param_keys, or convention-based (own enumerable, no leading/trailing
// underscore).
function _paramKeys_base(est) {
  const Ctor = est.constructor;
  if (Ctor && Array.isArray(Ctor._param_keys)) return Ctor._param_keys;
  const out = [];
  for (const k of Object.keys(est)) {
    if (k.startsWith('_') || k.endsWith('_')) continue;
    out.push(k);
  }
  return out;
}

// Heuristic: object with a get_params method is an estimator.
function _isEstimator_base(v) {
  return v != null && typeof v === 'object' && typeof v.get_params === 'function';
}

// Mixin score-helpers operate on plain 1D arrays. Coerce typed arrays /
// nested arrays into a flat numeric array. Tolerant — used in score()
// where input has already been validated by predict().
function asArray1d(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (ArrayBuffer.isView(v)) return Array.from(v);
  return [v];
}

function _accuracy_base(y_true, y_pred, weights) {
  const n = y_true.length;
  if (n === 0) return 0;
  if (weights == null) {
    let hits = 0;
    for (let i = 0; i < n; i++) if (y_true[i] === y_pred[i]) hits++;
    return hits / n;
  }
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const w = +weights[i];
    den += w;
    if (y_true[i] === y_pred[i]) num += w;
  }
  return den === 0 ? 0 : num / den;
}

// log of a row-major Float64Array with .shape, clipped at 1e-12 to avoid
// -Infinity. Returns a fresh Float64Array with the same shape.
function _logProbaInPlace_base(proba) {
  const out = new Float64Array(proba.length);
  for (let i = 0; i < proba.length; i++) {
    const p = proba[i];
    out[i] = p < 1e-12 ? Math.log(1e-12) : Math.log(p);
  }
  if (proba.shape) out.shape = proba.shape.slice();
  return out;
}

function _r2_base(y_true, y_pred, weights) {
  const n = y_true.length;
  if (n === 0) return 0;
  let mean = 0, w_sum = 0;
  if (weights == null) {
    for (let i = 0; i < n; i++) mean += y_true[i];
    mean /= n; w_sum = n;
  } else {
    for (let i = 0; i < n; i++) {
      const w = +weights[i];
      mean += w * y_true[i];
      w_sum += w;
    }
    mean = w_sum === 0 ? 0 : mean / w_sum;
  }
  let ss_res = 0, ss_tot = 0;
  if (weights == null) {
    for (let i = 0; i < n; i++) {
      const d = y_true[i] - y_pred[i];
      const t = y_true[i] - mean;
      ss_res += d * d;
      ss_tot += t * t;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const w = +weights[i];
      const d = y_true[i] - y_pred[i];
      const t = y_true[i] - mean;
      ss_res += w * d * d;
      ss_tot += w * t * t;
    }
  }
  if (ss_tot === 0) return ss_res === 0 ? 1 : 0;
  return 1 - ss_res / ss_tot;
}

// ── serialize.js ──

// dump/load wrappers around @gcu/mimic-io.
//
// learnRegistry is a per-library registry isolated from mimic-io's
// defaultRegistry — mixing learn estimators with arborist or sklearn JSON
// is intentional but requires the consumer to register what they want to
// allow. Per spec §6.3 of SPEC-mimic-io.md, registries are per-consumer,
// not global.
//
// Each estimator module self-registers at load time (side effect on
// import). preprocessing.js, tree.js, etc. each end with:
//
//   learnRegistry.register('StandardScaler', StandardScaler,
//     { module: '@gcu/learn.preprocessing' });
//
// dump(est) writes "@gcu/learn.<submodule>" into the module field; load(j)
// looks up the class against learnRegistry. Pass `{ registry: ... }` to
// load against a different registry — useful for cross-library round-trips.


/** Per-library registry. Estimator modules populate this on import. */
const learnRegistry = createRegistry();

const FORMAT_TAG = 'mimic-io';
const VERSION = 2;

/**
 * Serialize a fitted @gcu/learn estimator to a v2 mimic-io JSON dict.
 *
 * The estimator's module identifier defaults to "@gcu/learn" if not set
 * by the caller. Estimator modules are encouraged to set est._module to
 * their submodule path (e.g. "@gcu/learn.preprocessing") so cross-library
 * loaders can route correctly.
 *
 * Custom serialization: estimators that own their codec (Pipeline, etc.)
 * implement `_toMimicIo(opts)` returning a v2 dict directly. dump checks
 * for this hook and uses it in preference to mimic-io's default walker.
 *
 * @param {object} est — a fitted estimator
 * @param {object} [opts]
 * @param {string} [opts.module] — override the module identifier
 * @returns {object} v2 mimic-io JSON dict
 */
function dump(est, opts = {}) {
  if (typeof est?._toMimicIo === 'function') {
    return est._toMimicIo(opts);
  }
  const module_id = opts.module ?? est?._module ?? '@gcu/learn';
  return _mioDump(est, { ...opts, module: module_id });
}

/**
 * Load a v2 (or v1) mimic-io JSON dict into a fresh estimator instance.
 *
 * Custom deserialization: classes that own their codec implement a
 * static `_fromMimicIo(json, opts)` method. load() resolves the class
 * through the registry, then dispatches to that hook when present in
 * preference to mimic-io's default reconstruction.
 *
 * @param {object|string} input — parsed JSON object or a JSON string
 * @param {object} [opts]
 * @param {ReturnType<createRegistry>} [opts.registry] — defaults to
 *   learnRegistry; pass mimic-io's defaultRegistry or a custom one for
 *   cross-library loads.
 * @param {boolean} [opts.strict=true] — throw MimicIOUnsupportedClass on
 *   unknown classes (default) vs returning the decoded dict as-is.
 * @returns {object} the loaded estimator
 */
function load(input, opts = {}) {
  const registry = opts.registry ?? learnRegistry;
  // Pre-parse to check for the _fromMimicIo hook before delegating.
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  const v2 = (root && isV1(root)) ? normalizeV1(root) : root;
  if (v2 && v2.format === FORMAT_TAG && v2.version === VERSION) {
    const entry = registry.get(v2.class);
    if (entry?.ClassCtor && typeof entry.ClassCtor._fromMimicIo === 'function') {
      return entry.ClassCtor._fromMimicIo(v2, { ...opts, registry });
    }
  }
  return _mioLoad(v2 ?? input, { ...opts, registry });
}

// Re-export the unsupported-class error so callers can catch specifically
// without having to import @gcu/mimic-io directly.

// ── check_estimator.js ──

// check_estimator — the conformance gate.
//
// JS port of scikit-learn's `sklearn.utils.estimator_checks.check_estimator`,
// scoped to the contract @gcu/learn promises (SPEC-learn §3.6). Every
// estimator that ships in @gcu/learn must pass it. Users implementing
// custom estimators against the BaseEstimator contract should also run it.
//
// What it checks (one method per check, in stable order):
//
//   1. Construction stores only hyperparameters, no fitted attrs.
//   2. __sklearn_tags__() returns the documented shape.
//   3. _estimator_type is one of the known values.
//   4. get_params(false) round-trips through set_params.
//   5. clone() returns an independent unfitted instance with same params.
//   6. fit(X, y) returns this.
//   7. fit produces at least one trailing-underscore attribute.
//   8. check_is_fitted raises before fit and passes after.
//   9. transform / predict / predict_proba shapes match conventions.
//  10. predict_proba rows sum to one (classifiers).
//  11. score returns a finite number.
//  12. dump → load preserves predictions exactly on a held-out batch.
//  13. predicting on different n_features raises a clear error.
//  14. fitting on NaN raises ValidationError when allow_nan=false.
//
// Usage:
//   check_estimator(new StandardScaler());                   // throw on first
//   check_estimator(StandardScaler);                         // ctor form too
//   const errs = check_estimator(est, { collect: true });    // collect all




const VALID_ESTIMATOR_TYPES = new Set([
  'classifier', 'regressor', 'transformer', 'clusterer', 'density_estimator', null,
]);

const VALID_TAG_KEYS = new Set([
  'requires_y', 'allow_nan', 'binary_only', 'multioutput',
  'pairwise', 'requires_positive_X', 'requires_positive_y',
  'non_deterministic', 'poor_score', 'no_validation', 'stateless',
  'estimator_type',
]);

/**
 * Run the conformance suite against an estimator (or an estimator class).
 *
 * @param {object|Function} target — an estimator instance, or its class
 * @param {object} [opts]
 * @param {boolean} [opts.collect=false] — return list of violations
 *   instead of throwing on first failure
 * @param {number}  [opts.seed=42]       — RNG seed for synthetic data
 * @param {number}  [opts.n_samples=30]  — synthetic sample count
 * @param {number}  [opts.n_features=4]  — synthetic feature count
 * @param {number}  [opts.n_classes=3]   — synthetic class count (classifiers)
 * @returns {string[]|undefined} list of violations (when collect=true)
 */
function check_estimator(target, opts = {}) {
  const { collect = false, seed = 42 } = opts;
  const errors = [];
  const fail = (check, msg) => {
    const line = `${check}: ${msg}`;
    if (collect) errors.push(line);
    else throw new Error(`check_estimator: ${line}`);
  };

  // Resolve to fresh instance + class.
  const Ctor = typeof target === 'function' ? target : target.constructor;
  let est0;
  try {
    est0 = typeof target === 'function' ? new target() : clone(target);
  } catch (e) {
    fail('construct', `default-construction failed: ${e.message}`);
    return collect ? errors : undefined;
  }

  // 1. Construction stores only hyperparameters.
  for (const k of Object.keys(est0)) {
    if (k.endsWith('_') && !k.startsWith('_')) {
      fail('construct', `fitted attribute '${k}' present after construction`);
    }
  }

  // 2. __sklearn_tags__ shape.
  let tags;
  try { tags = est0.__sklearn_tags__(); }
  catch (e) { fail('tags', `__sklearn_tags__ threw: ${e.message}`); return _ret_check_estimator(collect, errors); }
  if (tags == null || typeof tags !== 'object') {
    fail('tags', '__sklearn_tags__ must return an object');
    return _ret_check_estimator(collect, errors);
  }
  for (const k of Object.keys(tags)) {
    if (!VALID_TAG_KEYS.has(k)) {
      fail('tags', `unknown tag key '${k}' (typo? see SPEC §3.6 for valid keys)`);
    }
  }

  // 3. estimator_type valid.
  const etype = tags.estimator_type ?? Ctor._estimator_type ?? null;
  if (!VALID_ESTIMATOR_TYPES.has(etype)) {
    fail('tags', `unknown estimator_type '${etype}'`);
  }

  // 4. get_params round-trip via set_params.
  const params0 = est0.get_params(false);
  try {
    const est_round = new Ctor(params0);
    const params1 = est_round.get_params(false);
    for (const k of Object.keys(params0)) {
      if (!_paramEquals_check_estimator(params0[k], params1[k])) {
        fail('get_params', `param '${k}' differs after constructor round-trip`);
      }
    }
  } catch (e) {
    fail('get_params', `round-trip failed: ${e.message}`);
  }
  // set_params back-and-forth.
  try {
    const est_set = new Ctor();
    est_set.set_params(params0);
    for (const k of Object.keys(params0)) {
      if (!_paramEquals_check_estimator(params0[k], est_set[k])) {
        fail('set_params', `param '${k}' not assigned by set_params`);
      }
    }
  } catch (e) {
    fail('set_params', `set_params(get_params()) failed: ${e.message}`);
  }

  // 5. clone independence.
  try {
    const c = clone(est0);
    if (c === est0) fail('clone', 'returned same object reference');
    const before = est0.get_params(false);
    // Mutate only if there's a finite numeric param to perturb. Skip NaN
    // (sentinel for missing_values etc.) since NaN+1=NaN and NaN!==NaN
    // would falsely report a clone leak.
    for (const k of Object.keys(before)) {
      if (typeof before[k] === 'number' && Number.isFinite(before[k])) {
        c[k] = before[k] + 1;
        if (est0[k] !== before[k]) {
          fail('clone', `mutating clone's '${k}' affected the original`);
        }
        break;
      }
    }
  } catch (e) {
    fail('clone', `clone failed: ${e.message}`);
  }

  // 6-14: data-driven checks. Skip when the estimator declares it as
  // stateless (no fit) or no_validation (skip data shape checks).
  if (tags.stateless) return _ret_check_estimator(collect, errors);

  const { X, y, X2 } = _makeData_check_estimator({ ...opts, requires_positive_X: tags.requires_positive_X }, etype);
  const est = clone(est0);

  // 8a. check_is_fitted raises before fit.
  try {
    check_is_fitted(est);
    fail('check_is_fitted', 'did not raise NotFittedError before fit');
  } catch (e) {
    if (!(e instanceof NotFittedError)) {
      fail('check_is_fitted', `raised non-NotFittedError before fit: ${e.message}`);
    }
  }

  // 6. fit returns this.
  let fit_result;
  try { fit_result = est.fit(X, y); }
  catch (e) { fail('fit', `threw: ${e.message}`); return _ret_check_estimator(collect, errors); }
  if (fit_result !== est) fail('fit', 'did not return this');

  // 7. fit produces at least one trailing-underscore attribute.
  let any_fitted = false;
  for (const k of Object.keys(est)) {
    if (k.endsWith('_') && !k.startsWith('_')) { any_fitted = true; break; }
  }
  if (!any_fitted && typeof est.__sklearn_is_fitted__ !== 'function') {
    fail('fit', 'no trailing-underscore attribute set by fit (and no __sklearn_is_fitted__ override)');
  }

  // 8b. check_is_fitted passes after fit.
  try { check_is_fitted(est); }
  catch (e) { fail('check_is_fitted', `raised after fit: ${e.message}`); }

  // 9. transform / predict shape conventions. Gate on estimator_type so
  // an estimator that exposes both methods (Pipeline) only gets tested
  // against the path appropriate to its role: transformers test
  // transform; classifiers/regressors/clusterers test predict.
  const expects_transform = etype === 'transformer';
  const expects_predict = etype === 'classifier' || etype === 'regressor'
                       || etype === 'clusterer';
  if (expects_transform && typeof est.transform === 'function') {
    try {
      const Xt = est.transform(X2);
      if (!_isMatrix_check_estimator(Xt)) fail('transform', 'output is not a matrix');
      else if (Xt.shape[0] !== X2.shape[0]) {
        fail('transform', `output rows ${Xt.shape[0]} != input rows ${X2.shape[0]}`);
      }
    } catch (e) { fail('transform', `threw: ${e.message}`); }
  }
  if (expects_predict && typeof est.predict === 'function') {
    try {
      const yhat = est.predict(X2);
      if (yhat == null) fail('predict', 'returned null');
      else if (yhat.length !== X2.shape[0]) {
        fail('predict', `output length ${yhat.length} != input rows ${X2.shape[0]}`);
      }
    } catch (e) { fail('predict', `threw: ${e.message}`); }
  }

  // 10. predict_proba rows sum to one (classifiers only).
  if (etype === 'classifier' && typeof est.predict_proba === 'function') {
    try {
      const P = est.predict_proba(X2);
      const n = X2.shape[0];
      const m = (P.shape ?? [n, P.length / n])[1];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < m; j++) sum += P[i * m + j] ?? P[i]?.[j];
        if (Math.abs(sum - 1) > 1e-6) {
          fail('predict_proba', `row ${i} sums to ${sum}, expected 1.0`);
          break;
        }
      }
    } catch (e) { fail('predict_proba', `threw: ${e.message}`); }
  }

  // 11. score returns a finite number.
  if (typeof est.score === 'function' && y != null) {
    try {
      const s = est.score(X, y);
      if (!Number.isFinite(s)) fail('score', `returned non-finite ${s}`);
    } catch (e) { fail('score', `threw: ${e.message}`); }
  }

  // 12. dump → load round-trip preserves predictions/transforms.
  try {
    const json = dump(est);
    const reloaded = load(json);
    if (expects_predict && typeof est.predict === 'function') {
      const a = est.predict(X2);
      const b = reloaded.predict(X2);
      if (!_arrayCloseExact_check_estimator(a, b)) {
        fail('dump/load', 'predictions differ after round-trip');
      }
    }
    if (expects_transform && typeof est.transform === 'function') {
      const a = est.transform(X2);
      const b = reloaded.transform(X2);
      if (!_arrayCloseExact_check_estimator(a, b)) {
        fail('dump/load', 'transforms differ after round-trip');
      }
    }
  } catch (e) { fail('dump/load', `failed: ${e.message}`); }

  // Resolve which method to drive these data-validation checks against.
  const probe_fn = expects_transform && typeof est.transform === 'function'
    ? (X) => est.transform(X)
    : expects_predict && typeof est.predict === 'function'
    ? (X) => est.predict(X)
    : null;

  // 13. wrong n_features raises.
  if (probe_fn) {
    const wrong_X = { data: new Float64Array(X.shape[0] * (X.shape[1] + 1)),
                      shape: [X.shape[0], X.shape[1] + 1] };
    try {
      probe_fn(wrong_X);
      fail('n_features', 'did not raise on n_features mismatch');
    } catch (_) { /* expected */ }
  }

  // 14. NaN handling per allow_nan tag.
  if (!tags.allow_nan && probe_fn) {
    const nan_X = { data: new Float64Array(X.shape[0] * X.shape[1]),
                    shape: [X.shape[0], X.shape[1]] };
    nan_X.data.set(X.data);
    nan_X.data[0] = NaN;
    try {
      probe_fn(nan_X);
      fail('allow_nan', 'allow_nan=false but accepted NaN input without raising');
    } catch (_) { /* expected */ }
  }

  return _ret_check_estimator(collect, errors);
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _ret_check_estimator(collect, errors) { return collect ? errors : undefined; }

function _isMatrix_check_estimator(v) {
  if (v == null || typeof v !== 'object') return false;
  if (Array.isArray(v.shape) && v.shape.length === 2) return true;
  if (v.data instanceof Float64Array && Array.isArray(v.shape)) return true;
  return false;
}

function _paramEquals_check_estimator(a, b) {
  if (a === b) return true;
  // NaN-aware equality — sklearn's missing_values=NaN convention runs
  // through this comparator; NaN !== NaN by default.
  if (typeof a === 'number' && typeof b === 'number'
      && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_paramEquals_check_estimator(a[i], b[i])) return false;
    return true;
  }
  // Object: compare own keys.
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!_paramEquals_check_estimator(a[k], b[k])) return false;
  return true;
}

function _arrayCloseExact_check_estimator(a, b) {
  if (a == null || b == null) return a === b;
  const la = a.length ?? a.data?.length ?? 0;
  const lb = b.length ?? b.data?.length ?? 0;
  if (la !== lb) return false;
  const da = a.data ?? a;
  const db = b.data ?? b;
  for (let i = 0; i < la; i++) {
    if (da[i] !== db[i] && !(Number.isNaN(da[i]) && Number.isNaN(db[i]))) return false;
  }
  return true;
}

// Deterministic synthetic data per estimator_type. n × m features,
// classifier targets are integer-coded, regressor targets are floats.
// X2 is a held-out batch for predict/transform shape checks.
function _makeData_check_estimator(opts, etype) {
  const n = opts.n_samples ?? 30;
  const m = opts.n_features ?? 4;
  const k = opts.n_classes ?? 3;
  const seed = opts.seed ?? 42;
  const rnd = mulberry32(seed);

  const X = { data: new Float64Array(n * m), shape: [n, m] };
  for (let i = 0; i < n * m; i++) X.data[i] = (rnd() - 0.5) * 4;
  const X2 = { data: new Float64Array(10 * m), shape: [10, m] };
  for (let i = 0; i < 10 * m; i++) X2.data[i] = (rnd() - 0.5) * 4;
  // Shift to non-negative when the estimator requires it (NMF, etc.).
  if (opts.requires_positive_X) {
    let min_v = 0;
    for (const v of X.data) if (v < min_v) min_v = v;
    for (const v of X2.data) if (v < min_v) min_v = v;
    const shift = -min_v + 0.1;
    for (let i = 0; i < X.data.length; i++) X.data[i] += shift;
    for (let i = 0; i < X2.data.length; i++) X2.data[i] += shift;
  }

  let y;
  if (etype === 'classifier') {
    y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = i % k;
  } else if (etype === 'regressor') {
    y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = X.data[i * m] + 2 * X.data[i * m + 1];
  } else {
    y = null;
  }
  return { X, y, X2 };
}

// ── metrics.js ──

// Classification + regression metrics. Pure functions, no estimator
// coupling — every metric takes (y_true, y_pred, opts) and returns a
// number or a plain object.
//
// Sklearn-compatible at the contract level (`sklearn.metrics`). Same
// names, same averaging conventions, same multi-class rules. v0.1 ships
// 1D-output regression only — multi-output is out of scope (SPEC §3.6
// deviation 4 / §9 "multi-output meta-estimators").
//
// Sample weights: every metric accepts opts.sample_weight as a 1D array
// of the same length as y_true. When omitted, weights are uniform.
//
// zero_division: where division by zero is possible (precision with no
// predicted positives, recall with no actual positives), the
// zero_division opt determines the result. Defaults to 0; pass 1 to
// match the "perfect" interpretation, or NaN to surface the missing
// signal.


// ────────────────────────────────────────────────────────────────────
// Classification
// ────────────────────────────────────────────────────────────────────

/**
 * Fraction (or count, when normalize=false) of correctly predicted samples.
 *
 *   opts.normalize     (bool, default true)
 *   opts.sample_weight (1D array, optional)
 */
function accuracy_score(y_true, y_pred, opts = {}) {
  const yt = _asArr_metrics(y_true, 'y_true');
  const yp = _asArr_metrics(y_pred, 'y_pred');
  _checkSameLength_metrics(yt, yp);
  const w = opts.sample_weight ?? null;
  const normalize = opts.normalize ?? true;
  if (w == null) {
    let hits = 0;
    for (let i = 0; i < yt.length; i++) if (yt[i] === yp[i]) hits++;
    return normalize ? (yt.length === 0 ? 0 : hits / yt.length) : hits;
  }
  if (w.length !== yt.length) {
    throw new ValidationError(
      `accuracy_score: sample_weight length ${w.length} != y length ${yt.length}`);
  }
  let num = 0, den = 0;
  for (let i = 0; i < yt.length; i++) {
    den += +w[i];
    if (yt[i] === yp[i]) num += +w[i];
  }
  return normalize ? (den === 0 ? 0 : num / den) : num;
}

/**
 * Macro-averaged recall (mean of per-class recall).
 *
 *   opts.adjusted      (bool, default false) — re-scale so chance = 0
 *   opts.sample_weight (1D array, optional)
 */
function balanced_accuracy_score(y_true, y_pred, opts = {}) {
  const { recall } = _perClassPRF_metrics(y_true, y_pred, opts);
  if (recall.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < recall.length; i++) sum += recall[i];
  let bacc = sum / recall.length;
  if (opts.adjusted) {
    const chance = 1 / recall.length;
    bacc = (bacc - chance) / (1 - chance);
  }
  return bacc;
}

/**
 * Confusion matrix C where C[i, j] is the count of true class i predicted
 * as class j.
 *
 *   opts.labels        (array, optional) — class label order; defaults to
 *                       sorted union of y_true ∪ y_pred
 *   opts.sample_weight (1D array, optional)
 *   opts.normalize     ('true' | 'pred' | 'all' | null, default null)
 *
 * Returns { matrix: number[][], labels: array }.
 */
function confusion_matrix(y_true, y_pred, opts = {}) {
  const yt = _asArr_metrics(y_true, 'y_true');
  const yp = _asArr_metrics(y_pred, 'y_pred');
  _checkSameLength_metrics(yt, yp);
  const labels = opts.labels ?? _uniqueLabels_metrics(yt, yp);
  const idx = new Map();
  for (let i = 0; i < labels.length; i++) idx.set(labels[i], i);
  const k = labels.length;
  const M = Array.from({ length: k }, () => new Array(k).fill(0));
  const w = opts.sample_weight ?? null;
  if (w != null && w.length !== yt.length) {
    throw new ValidationError(
      `confusion_matrix: sample_weight length ${w.length} != y length ${yt.length}`);
  }
  for (let i = 0; i < yt.length; i++) {
    const r = idx.get(yt[i]);
    const c = idx.get(yp[i]);
    if (r === undefined || c === undefined) continue;
    M[r][c] += w == null ? 1 : +w[i];
  }
  if (opts.normalize) {
    const norm = opts.normalize;
    if (norm === 'true') {
      for (let r = 0; r < k; r++) {
        let s = 0;
        for (let c = 0; c < k; c++) s += M[r][c];
        if (s > 0) for (let c = 0; c < k; c++) M[r][c] /= s;
      }
    } else if (norm === 'pred') {
      for (let c = 0; c < k; c++) {
        let s = 0;
        for (let r = 0; r < k; r++) s += M[r][c];
        if (s > 0) for (let r = 0; r < k; r++) M[r][c] /= s;
      }
    } else if (norm === 'all') {
      let s = 0;
      for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) s += M[r][c];
      if (s > 0) for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) M[r][c] /= s;
    } else {
      throw new ValidationError(
        `confusion_matrix: normalize must be 'true' | 'pred' | 'all' | null`);
    }
  }
  return { matrix: M, labels };
}

/**
 * Per-class precision averaged according to opts.average.
 *
 *   opts.labels        (array, optional)
 *   opts.pos_label     (any, default 1) — for binary average
 *   opts.average       ('binary' | 'micro' | 'macro' | 'weighted' | null,
 *                       default 'binary')
 *   opts.sample_weight (1D array, optional)
 *   opts.zero_division (number, default 0) — value when TP+FP == 0
 *
 * Returns a number for averaged variants, or an array (one per label)
 * when average=null.
 */
function precision_score(y_true, y_pred, opts = {}) {
  return _aggregatePRF_metrics(y_true, y_pred, opts, 'precision');
}

/** Per-class recall, see precision_score for opts. */
function recall_score(y_true, y_pred, opts = {}) {
  return _aggregatePRF_metrics(y_true, y_pred, opts, 'recall');
}

/** Harmonic mean of precision and recall (β=1). */
function f1_score(y_true, y_pred, opts = {}) {
  return _aggregatePRF_metrics(y_true, y_pred, opts, 'f1');
}

/**
 * Sklearn-shape per-class report: precision/recall/f1/support per class
 * plus accuracy / macro avg / weighted avg.
 *
 * Returns an object keyed by label (and the special 'accuracy', 'macro avg',
 * 'weighted avg' entries). Values are { precision, recall, f1, support }.
 */
function classification_report(y_true, y_pred, opts = {}) {
  const labels = opts.labels ?? _uniqueLabels_metrics(_asArr_metrics(y_true), _asArr_metrics(y_pred));
  const stats = _perClassPRF_metrics(y_true, y_pred, { ...opts, labels });
  const out = {};
  let total_support = 0;
  let macro_p = 0, macro_r = 0, macro_f = 0;
  let weighted_p = 0, weighted_r = 0, weighted_f = 0;
  for (let i = 0; i < labels.length; i++) {
    const support = stats.support[i];
    total_support += support;
    out[String(labels[i])] = {
      precision: stats.precision[i],
      recall: stats.recall[i],
      f1: stats.f1[i],
      support,
    };
    macro_p += stats.precision[i];
    macro_r += stats.recall[i];
    macro_f += stats.f1[i];
    weighted_p += stats.precision[i] * support;
    weighted_r += stats.recall[i] * support;
    weighted_f += stats.f1[i] * support;
  }
  const k = labels.length || 1;
  out['accuracy'] = accuracy_score(y_true, y_pred, opts);
  out['macro avg'] = {
    precision: macro_p / k, recall: macro_r / k, f1: macro_f / k,
    support: total_support,
  };
  out['weighted avg'] = total_support === 0 ? {
    precision: 0, recall: 0, f1: 0, support: 0,
  } : {
    precision: weighted_p / total_support,
    recall: weighted_r / total_support,
    f1: weighted_f / total_support,
    support: total_support,
  };
  return out;
}

/**
 * Cohen's kappa: agreement above chance.
 *
 *   opts.weights ('linear' | 'quadratic' | null, default null)
 *   opts.labels, opts.sample_weight
 */
function cohen_kappa_score(y1, y2, opts = {}) {
  const { matrix: M, labels } = confusion_matrix(y1, y2, opts);
  const k = labels.length;
  if (k === 0) return 0;
  let total = 0;
  for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) total += M[r][c];
  if (total === 0) return 0;
  // Marginals.
  const row_sum = new Array(k).fill(0);
  const col_sum = new Array(k).fill(0);
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      row_sum[r] += M[r][c];
      col_sum[c] += M[r][c];
    }
  }
  // Build weight matrix. None: 0 on diagonal, 1 off; linear: |i-j| / (k-1);
  // quadratic: (i-j)² / (k-1)².
  const W = Array.from({ length: k }, () => new Array(k).fill(0));
  const wmode = opts.weights ?? null;
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      if (wmode == null) W[r][c] = r === c ? 0 : 1;
      else if (wmode === 'linear') W[r][c] = Math.abs(r - c) / Math.max(1, k - 1);
      else if (wmode === 'quadratic') {
        const d = (r - c) / Math.max(1, k - 1);
        W[r][c] = d * d;
      } else throw new ValidationError(`cohen_kappa_score: weights must be 'linear' | 'quadratic' | null`);
    }
  }
  let observed = 0, expected = 0;
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      observed += W[r][c] * M[r][c];
      expected += W[r][c] * row_sum[r] * col_sum[c] / total;
    }
  }
  if (expected === 0) return 1;
  return 1 - observed / expected;
}

/**
 * Matthews correlation coefficient (multi-class generalization).
 * Returns 0 when any required marginal is zero (matches sklearn).
 */
function matthews_corrcoef(y_true, y_pred, opts = {}) {
  const { matrix: M, labels } = confusion_matrix(y_true, y_pred, opts);
  const k = labels.length;
  if (k === 0) return 0;
  let n = 0;
  const t = new Array(k).fill(0);  // row sums (true totals per class)
  const p = new Array(k).fill(0);  // col sums (pred totals per class)
  let trace = 0;
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      n += M[r][c];
      t[r] += M[r][c];
      p[c] += M[r][c];
      if (r === c) trace += M[r][c];
    }
  }
  if (n === 0) return 0;
  let dot_tp = 0, sq_t = 0, sq_p = 0;
  for (let i = 0; i < k; i++) {
    dot_tp += t[i] * p[i];
    sq_t += t[i] * t[i];
    sq_p += p[i] * p[i];
  }
  const num = trace * n - dot_tp;
  const den_a = n * n - sq_p;
  const den_b = n * n - sq_t;
  if (den_a <= 0 || den_b <= 0) return 0;
  return num / Math.sqrt(den_a * den_b);
}

// ────────────────────────────────────────────────────────────────────
// Regression
// ────────────────────────────────────────────────────────────────────

/**
 * Coefficient of determination R². Best is 1.0; can be negative.
 *
 *   opts.sample_weight (1D array, optional)
 *
 * Convention: when y_true is constant, R² = 1.0 if predictions match
 * exactly (zero residual), 0.0 otherwise. Matches sklearn.
 */
function r2_score(y_true, y_pred, opts = {}) {
  const yt = _asNumArr_metrics(y_true);
  const yp = _asNumArr_metrics(y_pred);
  _checkSameLength_metrics(yt, yp);
  const w = opts.sample_weight ?? null;
  const n = yt.length;
  if (n === 0) return 0;

  let mean = 0, w_sum = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) mean += yt[i];
    mean /= n; w_sum = n;
  } else {
    if (w.length !== n) throw new ValidationError(
      `r2_score: sample_weight length ${w.length} != y length ${n}`);
    for (let i = 0; i < n; i++) { mean += +w[i] * yt[i]; w_sum += +w[i]; }
    mean = w_sum === 0 ? 0 : mean / w_sum;
  }
  let ss_res = 0, ss_tot = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) {
      const d = yt[i] - yp[i]; const t = yt[i] - mean;
      ss_res += d * d; ss_tot += t * t;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const d = yt[i] - yp[i]; const t = yt[i] - mean;
      ss_res += +w[i] * d * d; ss_tot += +w[i] * t * t;
    }
  }
  if (ss_tot === 0) return ss_res === 0 ? 1 : 0;
  return 1 - ss_res / ss_tot;
}

/**
 * Mean squared error.
 *
 *   opts.sample_weight (1D array, optional)
 *   opts.squared       (bool, default true) — when false, returns RMSE.
 *                       Use root_mean_squared_error explicitly in new code.
 */
function mean_squared_error(y_true, y_pred, opts = {}) {
  const yt = _asNumArr_metrics(y_true);
  const yp = _asNumArr_metrics(y_pred);
  _checkSameLength_metrics(yt, yp);
  const w = opts.sample_weight ?? null;
  const n = yt.length;
  if (n === 0) return 0;
  let sum = 0, w_sum = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) { const d = yt[i] - yp[i]; sum += d * d; }
    w_sum = n;
  } else {
    if (w.length !== n) throw new ValidationError(
      `mean_squared_error: sample_weight length ${w.length} != y length ${n}`);
    for (let i = 0; i < n; i++) {
      const d = yt[i] - yp[i]; sum += +w[i] * d * d; w_sum += +w[i];
    }
  }
  const mse = w_sum === 0 ? 0 : sum / w_sum;
  return (opts.squared ?? true) ? mse : Math.sqrt(mse);
}

/** Root mean squared error. Sklearn 1.4+ canonical name. */
function root_mean_squared_error(y_true, y_pred, opts = {}) {
  return mean_squared_error(y_true, y_pred, { ...opts, squared: false });
}

/** Mean absolute error. */
function mean_absolute_error(y_true, y_pred, opts = {}) {
  const yt = _asNumArr_metrics(y_true);
  const yp = _asNumArr_metrics(y_pred);
  _checkSameLength_metrics(yt, yp);
  const w = opts.sample_weight ?? null;
  const n = yt.length;
  if (n === 0) return 0;
  let sum = 0, w_sum = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) sum += Math.abs(yt[i] - yp[i]);
    w_sum = n;
  } else {
    if (w.length !== n) throw new ValidationError(
      `mean_absolute_error: sample_weight length ${w.length} != y length ${n}`);
    for (let i = 0; i < n; i++) {
      sum += +w[i] * Math.abs(yt[i] - yp[i]); w_sum += +w[i];
    }
  }
  return w_sum === 0 ? 0 : sum / w_sum;
}

/**
 * Mean absolute percentage error: mean(|y_true - y_pred| / max(eps, |y_true|)).
 * Returns a fraction (sklearn convention) — multiply by 100 for percent.
 */
function mean_absolute_percentage_error(y_true, y_pred, opts = {}) {
  const yt = _asNumArr_metrics(y_true);
  const yp = _asNumArr_metrics(y_pred);
  _checkSameLength_metrics(yt, yp);
  const w = opts.sample_weight ?? null;
  const n = yt.length;
  if (n === 0) return 0;
  const eps = Number.EPSILON;
  let sum = 0, w_sum = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) {
      sum += Math.abs(yt[i] - yp[i]) / Math.max(eps, Math.abs(yt[i]));
    }
    w_sum = n;
  } else {
    if (w.length !== n) throw new ValidationError(
      `mean_absolute_percentage_error: sample_weight length ${w.length} != y length ${n}`);
    for (let i = 0; i < n; i++) {
      sum += +w[i] * Math.abs(yt[i] - yp[i]) / Math.max(eps, Math.abs(yt[i]));
      w_sum += +w[i];
    }
  }
  return w_sum === 0 ? 0 : sum / w_sum;
}

/**
 * Explained variance score: 1 - Var(y_true - y_pred) / Var(y_true).
 * Differs from R² by the absence of a mean-shift correction in the residual.
 */
function explained_variance_score(y_true, y_pred, opts = {}) {
  const yt = _asNumArr_metrics(y_true);
  const yp = _asNumArr_metrics(y_pred);
  _checkSameLength_metrics(yt, yp);
  const w = opts.sample_weight ?? null;
  const n = yt.length;
  if (n === 0) return 0;

  let yt_mean = 0, w_sum = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) yt_mean += yt[i];
    yt_mean /= n; w_sum = n;
  } else {
    if (w.length !== n) throw new ValidationError(
      `explained_variance_score: sample_weight length ${w.length} != y length ${n}`);
    for (let i = 0; i < n; i++) { yt_mean += +w[i] * yt[i]; w_sum += +w[i]; }
    yt_mean = w_sum === 0 ? 0 : yt_mean / w_sum;
  }
  // residuals + their mean
  let res_mean = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) res_mean += yt[i] - yp[i];
    res_mean /= n;
  } else {
    for (let i = 0; i < n; i++) res_mean += +w[i] * (yt[i] - yp[i]);
    res_mean = w_sum === 0 ? 0 : res_mean / w_sum;
  }
  let var_y = 0, var_res = 0;
  if (w == null) {
    for (let i = 0; i < n; i++) {
      const dy = yt[i] - yt_mean;
      const dr = (yt[i] - yp[i]) - res_mean;
      var_y += dy * dy; var_res += dr * dr;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dy = yt[i] - yt_mean;
      const dr = (yt[i] - yp[i]) - res_mean;
      var_y += +w[i] * dy * dy; var_res += +w[i] * dr * dr;
    }
  }
  if (var_y === 0) return var_res === 0 ? 1 : 0;
  return 1 - var_res / var_y;
}

// ────────────────────────────────────────────────────────────────────
// Clustering
// ────────────────────────────────────────────────────────────────────

/**
 * Mean silhouette coefficient over all samples — the canonical default
 * scorer for clusterers (sklearn convention, SPEC §3.6).
 *
 * For each sample i:
 *   a(i) = mean distance to other samples in the same cluster
 *   b(i) = min over other clusters of (mean distance to samples in that cluster)
 *   s(i) = (b(i) - a(i)) / max(a(i), b(i))
 *
 * Returns NaN when fewer than 2 clusters are present or when fewer than
 * 2 valid samples remain after filtering noise/singleton clusters.
 *
 *   opts.metric  (string, default 'euclidean') — only 'euclidean' supported
 *
 * Noise labels of -1 (DBSCAN convention) are excluded before scoring.
 *
 * Complexity: O(n² × m). Pre-allocates a single n×n distance matrix; for
 * the in-browser scale this is fine up to ~10K samples.
 */
function silhouette_score(X, labels, opts = {}) {
  const samples = silhouette_samples(X, labels, opts);
  if (samples.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i];
  return s / samples.length;
}

/**
 * Per-sample silhouette coefficients in the same order as the input
 * (after filtering noise labels of -1). Returns Float64Array of length
 * (n - n_noise).
 */
function silhouette_samples(X, labels, opts = {}) {
  const metric = opts.metric ?? 'euclidean';
  if (metric !== 'euclidean') {
    throw new ValidationError(
      `silhouette_samples: metric='${metric}' — only 'euclidean' supported in v0.2`);
  }
  const { data, shape } = asMatrix(X);
  const [n_full, m] = shape;
  const labels_full = _asArr_metrics(labels, 'labels');
  if (labels_full.length !== n_full) {
    throw new ValidationError(
      `silhouette_samples: labels length ${labels_full.length} != n_samples ${n_full}`);
  }

  // Drop noise samples (label -1, DBSCAN convention). Build compacted
  // row-major view.
  const keep = [];
  for (let i = 0; i < n_full; i++) {
    if (labels_full[i] !== -1) keep.push(i);
  }
  const n = keep.length;
  if (n < 2) return new Float64Array(0);

  const lab = new Int32Array(n);
  const pts = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    lab[i] = labels_full[keep[i]] | 0;
    const off = keep[i] * m;
    for (let j = 0; j < m; j++) pts[i * m + j] = data[off + j];
  }

  // Unique labels and per-cluster sizes.
  const labelSet = new Map();  // label → cluster index in [0, K)
  const sizes = [];
  for (let i = 0; i < n; i++) {
    if (!labelSet.has(lab[i])) {
      labelSet.set(lab[i], labelSet.size);
      sizes.push(0);
    }
    sizes[labelSet.get(lab[i])]++;
  }
  const K = sizes.length;
  if (K < 2) return new Float64Array(0);

  // Per-sample cluster index.
  const ci = new Int32Array(n);
  for (let i = 0; i < n; i++) ci[i] = labelSet.get(lab[i]);

  // Sum of distances from each sample to each cluster (n × K).
  const sumDist = new Float64Array(n * K);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0;
      for (let k = 0; k < m; k++) {
        const d = pts[i * m + k] - pts[j * m + k];
        s += d * d;
      }
      const d = Math.sqrt(s);
      sumDist[i * K + ci[j]] += d;
      sumDist[j * K + ci[i]] += d;
    }
  }

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const own = ci[i];
    const ownSize = sizes[own];
    if (ownSize <= 1) { out[i] = 0; continue; }  // singleton — undefined, sklearn returns 0
    const a = sumDist[i * K + own] / (ownSize - 1);
    let b = Infinity;
    for (let c = 0; c < K; c++) {
      if (c === own) continue;
      const meanD = sumDist[i * K + c] / sizes[c];
      if (meanD < b) b = meanD;
    }
    const denom = Math.max(a, b);
    out[i] = denom === 0 ? 0 : (b - a) / denom;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

// Coerce y to a JS array of (possibly non-numeric) labels. Strings, ints,
// any value works as long as === comparison is meaningful.
function _asArr_metrics(y, name = 'y') {
  if (y == null) throw new ValidationError(`${name}: input is ${y}`);
  if (Array.isArray(y)) return y;
  if (ArrayBuffer.isView(y)) return Array.from(y);
  throw new ValidationError(`${name}: unrecognized shape (${typeof y})`);
}

// Coerce y to a Float64Array view for regression metrics.
function _asNumArr_metrics(y) {
  if (y == null) throw new ValidationError(`y: input is ${y}`);
  if (y instanceof Float64Array) return y;
  if (ArrayBuffer.isView(y) && !(y instanceof DataView)) {
    const out = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) out[i] = y[i];
    return out;
  }
  if (Array.isArray(y)) {
    const out = new Float64Array(y.length);
    for (let i = 0; i < y.length; i++) out[i] = +y[i];
    return out;
  }
  throw new ValidationError(`y: unrecognized shape (${typeof y})`);
}

function _checkSameLength_metrics(a, b) {
  if (a.length !== b.length) {
    throw new ValidationError(
      `metrics: y_true (length ${a.length}) and y_pred (length ${b.length}) must match`);
  }
}

// Sorted union of unique labels across two arrays. Stringifies for set
// dedup, then casts back through the original arrays' first-seen value
// to preserve type (so int labels stay ints, string labels stay strings).
function _uniqueLabels_metrics(a, b) {
  const seen = new Map();  // string-key → original value
  for (const v of a) { const k = _labelKey_metrics(v); if (!seen.has(k)) seen.set(k, v); }
  for (const v of b) { const k = _labelKey_metrics(v); if (!seen.has(k)) seen.set(k, v); }
  return [...seen.values()].sort(_labelCmp_metrics);
}

function _labelKey_metrics(v) {
  return typeof v === 'string' ? `s:${v}` : `n:${v}`;
}

function _labelCmp_metrics(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// Per-class precision/recall/f1/support arrays, in the order of `labels`
// (resolved from opts.labels or sorted union of inputs).
function _perClassPRF_metrics(y_true, y_pred, opts = {}) {
  const yt = _asArr_metrics(y_true);
  const yp = _asArr_metrics(y_pred);
  _checkSameLength_metrics(yt, yp);
  const labels = opts.labels ?? _uniqueLabels_metrics(yt, yp);
  const idx = new Map();
  for (let i = 0; i < labels.length; i++) idx.set(labels[i], i);
  const w = opts.sample_weight ?? null;
  const k = labels.length;
  const tp = new Array(k).fill(0);
  const fp = new Array(k).fill(0);
  const fn = new Array(k).fill(0);
  const support = new Array(k).fill(0);
  for (let i = 0; i < yt.length; i++) {
    const ti = idx.get(yt[i]);
    const pi = idx.get(yp[i]);
    const wi = w == null ? 1 : +w[i];
    if (ti !== undefined) support[ti] += wi;
    if (ti === pi && ti !== undefined) tp[ti] += wi;
    else {
      if (pi !== undefined) fp[pi] += wi;
      if (ti !== undefined) fn[ti] += wi;
    }
  }
  const zero = opts.zero_division ?? 0;
  const precision = new Array(k);
  const recall = new Array(k);
  const f1 = new Array(k);
  for (let i = 0; i < k; i++) {
    const denP = tp[i] + fp[i];
    const denR = tp[i] + fn[i];
    precision[i] = denP === 0 ? zero : tp[i] / denP;
    recall[i] = denR === 0 ? zero : tp[i] / denR;
    const denF = precision[i] + recall[i];
    f1[i] = denF === 0 ? zero : 2 * precision[i] * recall[i] / denF;
  }
  return { precision, recall, f1, support, labels };
}

function _aggregatePRF_metrics(y_true, y_pred, opts, which) {
  const labels = opts.labels ?? _uniqueLabels_metrics(_asArr_metrics(y_true), _asArr_metrics(y_pred));
  const stats = _perClassPRF_metrics(y_true, y_pred, { ...opts, labels });
  const arr = stats[which];
  // Preserve explicit `average: null` (sklearn's "return per-class") —
  // `??` would collapse it into the 'binary' default.
  const average = 'average' in opts ? opts.average : 'binary';
  if (average == null) return arr;

  if (average === 'binary') {
    const pos = opts.pos_label ?? 1;
    let i = labels.indexOf(pos);
    if (i === -1) {
      // Match sklearn: not finding pos_label in binary mode raises.
      throw new ValidationError(
        `${which}_score(average='binary'): pos_label=${pos} not found in y_true. ` +
        `Set average='macro' / 'micro' / 'weighted' for multi-class problems.`);
    }
    return arr[i];
  }
  if (average === 'macro') {
    if (arr.length === 0) return 0;
    let s = 0; for (const v of arr) s += v; return s / arr.length;
  }
  if (average === 'weighted') {
    let total_support = 0;
    for (const s of stats.support) total_support += s;
    if (total_support === 0) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i] * stats.support[i];
    return s / total_support;
  }
  if (average === 'micro') {
    // Recompute totals globally rather than averaging per-class scores.
    let TP = 0, FP = 0, FN = 0;
    const yt = _asArr_metrics(y_true);
    const yp = _asArr_metrics(y_pred);
    const idx = new Map();
    for (let i = 0; i < labels.length; i++) idx.set(labels[i], i);
    const w = opts.sample_weight ?? null;
    for (let i = 0; i < yt.length; i++) {
      const ti = idx.get(yt[i]);
      const pi = idx.get(yp[i]);
      const wi = w == null ? 1 : +w[i];
      if (ti === pi && ti !== undefined) TP += wi;
      else {
        if (pi !== undefined) FP += wi;
        if (ti !== undefined) FN += wi;
      }
    }
    const zero = opts.zero_division ?? 0;
    if (which === 'precision') return (TP + FP) === 0 ? zero : TP / (TP + FP);
    if (which === 'recall') return (TP + FN) === 0 ? zero : TP / (TP + FN);
    // f1 micro
    const p = (TP + FP) === 0 ? zero : TP / (TP + FP);
    const r = (TP + FN) === 0 ? zero : TP / (TP + FN);
    return (p + r) === 0 ? zero : 2 * p * r / (p + r);
  }
  throw new ValidationError(
    `${which}_score: unknown average='${average}' (use 'binary' | 'micro' | 'macro' | 'weighted' | null)`);
}

// ── model_selection.js ──

// Splitters + cross-validation. The infrastructure layer that every
// estimator's evaluation flows through.
//
// Splitters share a uniform contract: a class with a `split(X, y, opts?)`
// generator method yielding [train_idx, test_idx] (or [train_idx,
// test_idx, n_dropped] for SpatialKFold). Indices are Int32Arrays for
// efficient row gather later.
//
// cross_val_score / cross_validate consume that contract — they don't
// know whether the splitter is k-fold, leave-one-out, group-aware, or
// spatial. New splitters land by implementing the same shape.




// ────────────────────────────────────────────────────────────────────
// train_test_split
// ────────────────────────────────────────────────────────────────────

/**
 * Split `X` and `y` into train/test subsets.
 *
 *   opts.test_size     (number, default 0.25) — fraction (0,1) or count
 *   opts.train_size    (number, optional) — overrides test_size
 *   opts.shuffle       (bool, default true)
 *   opts.stratify      (1D array, optional) — preserve class frequencies
 *   opts.random_state  (int|null, default null)
 *
 * Returns [X_train, X_test, y_train, y_test]. X is split as a row gather
 * (preserves shape and is allocator-friendly); y is split as a 1D vector.
 *
 * y may be omitted to split X alone — returns [X_train, X_test].
 */
function train_test_split(X, y, opts = {}) {
  // Allow `train_test_split(X, opts)` shorthand (no y).
  if (y != null && typeof y === 'object' && !Array.isArray(y) && !ArrayBuffer.isView(y)
      && (y.test_size != null || y.train_size != null || y.shuffle != null
          || y.stratify != null || y.random_state != null)) {
    opts = y; y = null;
  }
  // Permit NaN at the split boundary — train_test_split is upstream of
  // any imputation in a typical pipeline.
  const { data: Xd, shape } = asMatrix(X, { allow_nan: true });
  const n = shape[0];
  const m = shape[1];
  const yv = y == null ? null : asVector(y, { allow_nan: true });
  if (yv != null && yv.length !== n) {
    throw new ValidationError(
      `train_test_split: y length ${yv.length} != n_samples ${n}`);
  }
  const n_test = _resolveSplitCount_model_selection(n, opts);
  const n_train = n - n_test;
  if (n_train < 1 || n_test < 1) {
    throw new ValidationError(
      `train_test_split: degenerate split (n_train=${n_train}, n_test=${n_test})`);
  }
  const shuffle = opts.shuffle ?? true;
  const rng = opts.random_state == null ? null : mulberry32(opts.random_state);
  let train_idx, test_idx;
  if (opts.stratify != null) {
    if (!shuffle) {
      throw new ValidationError(
        `train_test_split: stratify requires shuffle=true`);
    }
    const strat = _asLabelArray_model_selection(opts.stratify);
    if (strat.length !== n) {
      throw new ValidationError(
        `train_test_split: stratify length ${strat.length} != n_samples ${n}`);
    }
    [train_idx, test_idx] = _stratifiedSplit_model_selection(strat, n_train, n_test, rng);
  } else {
    const indices = _arange_model_selection(n);
    if (shuffle) _shuffleInPlace_model_selection(indices, rng);
    train_idx = indices.slice(0, n_train);
    test_idx = indices.slice(n_train);
  }
  const X_train = _gatherRows_model_selection(Xd, n, m, train_idx);
  const X_test = _gatherRows_model_selection(Xd, n, m, test_idx);
  if (yv == null) return [X_train, X_test];
  const y_train = _gatherValues_model_selection(yv, train_idx);
  const y_test = _gatherValues_model_selection(yv, test_idx);
  return [X_train, X_test, y_train, y_test];
}

// ────────────────────────────────────────────────────────────────────
// KFold
// ────────────────────────────────────────────────────────────────────

class KFold {
  constructor({ n_splits = 5, shuffle = false, random_state = null } = {}) {
    if (n_splits < 2) {
      throw new ValidationError(`KFold: n_splits=${n_splits} must be >= 2`);
    }
    this.n_splits = n_splits;
    this.shuffle = shuffle;
    this.random_state = random_state;
  }

  get_n_splits() { return this.n_splits; }

  *split(X, _y, _opts) {
    // Splitters care about shape only — NaN values pass through.
    const { shape } = asMatrix(X, { allow_nan: true });
    const n = shape[0];
    if (n < this.n_splits) {
      throw new ValidationError(
        `KFold: cannot have n_splits=${this.n_splits} > n_samples=${n}`);
    }
    const indices = _arange_model_selection(n);
    if (this.shuffle) {
      const rng = this.random_state == null ? null : mulberry32(this.random_state);
      _shuffleInPlace_model_selection(indices, rng);
    }
    // Sklearn convention: split into n_splits chunks with the first
    // (n % n_splits) folds carrying one extra element.
    const base = Math.floor(n / this.n_splits);
    const extra = n % this.n_splits;
    let start = 0;
    for (let f = 0; f < this.n_splits; f++) {
      const size = base + (f < extra ? 1 : 0);
      const test = indices.slice(start, start + size);
      const train = _concatExcept_model_selection(indices, start, start + size);
      yield [train, test];
      start += size;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// StratifiedKFold
// ────────────────────────────────────────────────────────────────────

class StratifiedKFold {
  constructor({ n_splits = 5, shuffle = false, random_state = null } = {}) {
    if (n_splits < 2) {
      throw new ValidationError(`StratifiedKFold: n_splits=${n_splits} must be >= 2`);
    }
    this.n_splits = n_splits;
    this.shuffle = shuffle;
    this.random_state = random_state;
  }

  get_n_splits() { return this.n_splits; }

  *split(X, y, _opts) {
    if (y == null) {
      throw new ValidationError(`StratifiedKFold: y is required`);
    }
    const { shape } = asMatrix(X, { allow_nan: true });
    const n = shape[0];
    const yArr = _asLabelArray_model_selection(y);
    if (yArr.length !== n) {
      throw new ValidationError(
        `StratifiedKFold: y length ${yArr.length} != n_samples ${n}`);
    }
    // Group indices by class; assign each class's indices to folds in
    // round-robin order so per-fold class counts differ by ≤ 1.
    const byClass = new Map();
    for (let i = 0; i < n; i++) {
      const c = yArr[i];
      if (!byClass.has(c)) byClass.set(c, []);
      byClass.get(c).push(i);
    }
    for (const [c, arr] of byClass) {
      if (arr.length < this.n_splits) {
        throw new ValidationError(
          `StratifiedKFold: class ${c} has ${arr.length} samples but ` +
          `n_splits=${this.n_splits}; cannot stratify.`);
      }
    }
    const rng = this.shuffle && this.random_state != null
      ? mulberry32(this.random_state) : null;
    if (this.shuffle) {
      for (const arr of byClass.values()) _shuffleInPlace_model_selection(arr, rng);
    }
    const test_per_fold = Array.from({ length: this.n_splits }, () => []);
    for (const arr of byClass.values()) {
      for (let i = 0; i < arr.length; i++) {
        test_per_fold[i % this.n_splits].push(arr[i]);
      }
    }
    const all = new Set(_arange_model_selection(n));
    for (let f = 0; f < this.n_splits; f++) {
      const test_set = new Set(test_per_fold[f]);
      const test = Int32Array.from(test_per_fold[f]).sort();
      const train_arr = [];
      for (const i of all) if (!test_set.has(i)) train_arr.push(i);
      train_arr.sort((a, b) => a - b);
      yield [Int32Array.from(train_arr), test];
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// GroupKFold
// ────────────────────────────────────────────────────────────────────

class GroupKFold {
  constructor({ n_splits = 5 } = {}) {
    if (n_splits < 2) {
      throw new ValidationError(`GroupKFold: n_splits=${n_splits} must be >= 2`);
    }
    this.n_splits = n_splits;
  }

  get_n_splits() { return this.n_splits; }

  *split(X, _y, opts = {}) {
    const groups = opts.groups;
    if (groups == null) {
      throw new ValidationError(`GroupKFold.split: opts.groups is required`);
    }
    const { shape } = asMatrix(X, { allow_nan: true });
    const n = shape[0];
    const g = _asLabelArray_model_selection(groups);
    if (g.length !== n) {
      throw new ValidationError(
        `GroupKFold: groups length ${g.length} != n_samples ${n}`);
    }
    // Bucket sample indices by group, then assign whole groups to folds
    // greedily — biggest group to lightest fold (matches sklearn's
    // GroupKFold balancing heuristic for fold-size variance).
    const byGroup = new Map();
    for (let i = 0; i < n; i++) {
      const k = g[i];
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(i);
    }
    const groupKeys = [...byGroup.keys()];
    if (groupKeys.length < this.n_splits) {
      throw new ValidationError(
        `GroupKFold: n_splits=${this.n_splits} > n_groups=${groupKeys.length}`);
    }
    // Sort groups by size descending; assign each to the currently smallest
    // fold (by total samples).
    groupKeys.sort((a, b) => byGroup.get(b).length - byGroup.get(a).length);
    const fold_assignment = new Array(this.n_splits).fill(0).map(() => []);
    const fold_sizes = new Array(this.n_splits).fill(0);
    for (const key of groupKeys) {
      let smallest = 0;
      for (let f = 1; f < this.n_splits; f++) {
        if (fold_sizes[f] < fold_sizes[smallest]) smallest = f;
      }
      fold_assignment[smallest].push(key);
      fold_sizes[smallest] += byGroup.get(key).length;
    }
    for (let f = 0; f < this.n_splits; f++) {
      const test_keys = new Set(fold_assignment[f]);
      const test = [];
      const train = [];
      for (let i = 0; i < n; i++) {
        if (test_keys.has(g[i])) test.push(i);
        else train.push(i);
      }
      yield [Int32Array.from(train), Int32Array.from(test)];
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// SpatialKFold
// ────────────────────────────────────────────────────────────────────

/**
 * Spatial cross-validation with an exclusion buffer around each fold's
 * test set (SPEC §5.1).
 *
 *   opts.n_splits         (int, default 5)
 *   opts.exclusion_radius (number, default 0) — units of xyz
 *   opts.shuffle          (bool, default true)
 *   opts.random_state     (int|null)
 *   opts.stratify         (1D array, optional) — class-balance the fold
 *                          assignment
 *
 * split(X, y, { xyz }) yields [train_idx, test_idx, n_dropped].
 *
 * exclusion_radius=0 reduces to standard KFold (no buffer applied).
 *
 * Brute-force O(n²) distance computation. Per spec §5.1, this is
 * acceptable for n < 5000; switch to a KDTree above that (lands with the
 * KNeighbors v0.2 work).
 */
class SpatialKFold {
  constructor({
    n_splits = 5,
    exclusion_radius = 0,
    shuffle = true,
    random_state = null,
    stratify = null,
  } = {}) {
    if (n_splits < 2) {
      throw new ValidationError(`SpatialKFold: n_splits=${n_splits} must be >= 2`);
    }
    if (exclusion_radius < 0) {
      throw new ValidationError(
        `SpatialKFold: exclusion_radius=${exclusion_radius} must be >= 0`);
    }
    this.n_splits = n_splits;
    this.exclusion_radius = exclusion_radius;
    this.shuffle = shuffle;
    this.random_state = random_state;
    this.stratify = stratify;
  }

  get_n_splits() { return this.n_splits; }

  *split(X, y, opts = {}) {
    const xyz = opts.xyz;
    if (xyz == null) {
      throw new ValidationError(
        `SpatialKFold.split: opts.xyz is required (an [n, 1|2|3] coordinate array)`);
    }
    const { data: xyzd, shape: xyzShape } = asMatrix(xyz, { name: 'xyz' });
    const { shape } = asMatrix(X, { allow_nan: true });
    const n = shape[0];
    if (xyzShape[0] !== n) {
      throw new ValidationError(
        `SpatialKFold: xyz n_rows ${xyzShape[0]} != n_samples ${n}`);
    }
    const dim = xyzShape[1];
    if (dim < 1 || dim > 3) {
      throw new ValidationError(
        `SpatialKFold: xyz dimension ${dim} must be 1, 2, or 3`);
    }
    const r2 = this.exclusion_radius * this.exclusion_radius;

    // Fold assignment: stratified only when this.stratify is explicitly
    // set. Auto-stratifying on y would break regression workflows (the
    // whole point of SpatialKFold for continuous targets is the spatial
    // buffer, not stratification).
    const stratifyArr = this.stratify ?? null;
    const rng = this.random_state == null ? null : mulberry32(this.random_state);
    let fold_id;  // Int32Array[n]
    if (stratifyArr != null) {
      fold_id = _stratifiedFoldAssignment_model_selection(stratifyArr, this.n_splits, rng);
    } else {
      const indices = _arange_model_selection(n);
      if (this.shuffle) _shuffleInPlace_model_selection(indices, rng);
      fold_id = new Int32Array(n);
      const base = Math.floor(n / this.n_splits);
      const extra = n % this.n_splits;
      let start = 0;
      for (let f = 0; f < this.n_splits; f++) {
        const size = base + (f < extra ? 1 : 0);
        for (let k = start; k < start + size; k++) fold_id[indices[k]] = f;
        start += size;
      }
    }

    for (let f = 0; f < this.n_splits; f++) {
      const test_arr = [];
      for (let i = 0; i < n; i++) if (fold_id[i] === f) test_arr.push(i);
      const test = Int32Array.from(test_arr);

      // For each non-test sample, find min squared distance to any test
      // sample. Drop if below r²; keep otherwise.
      const train_arr = [];
      let n_dropped = 0;
      for (let i = 0; i < n; i++) {
        if (fold_id[i] === f) continue;
        if (r2 === 0) { train_arr.push(i); continue; }
        let min_d2 = Infinity;
        const off_i = i * dim;
        for (let k = 0; k < test.length; k++) {
          const j = test[k];
          const off_j = j * dim;
          let d2 = 0;
          for (let d = 0; d < dim; d++) {
            const diff = xyzd[off_i + d] - xyzd[off_j + d];
            d2 += diff * diff;
            if (d2 >= min_d2) break;
          }
          if (d2 < min_d2) { min_d2 = d2; if (min_d2 < r2) break; }
        }
        if (min_d2 >= r2) train_arr.push(i);
        else n_dropped++;
      }
      yield [Int32Array.from(train_arr), test, n_dropped];
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// cross_val_score / cross_validate
// ────────────────────────────────────────────────────────────────────

/**
 * Run cross-validation, returning per-fold scores.
 *
 *   opts.cv            (splitter | int, default KFold(5))
 *   opts.scoring       (function, optional) — (estimator, X, y) → number;
 *                       defaults to estimator.score
 *   opts.sample_weight (1D array, optional) — split alongside X/y
 *   opts.split_opts    (object, optional) — passed through to cv.split
 *                       (e.g. { groups, xyz } for GroupKFold/SpatialKFold)
 *   opts.refit         (bool, default true) — when false, skip clone+fit and
 *                       score the already-fitted estimator on each fold's
 *                       test set. The only sklearn-API divergence in @gcu/learn
 *                       (SPEC §5.4): useful for honest k-fold scoring of a
 *                       bonsai-edited tree or any pre-trained model from disk.
 *
 * Returns Float64Array of length n_splits.
 */
function cross_val_score(estimator, X, y, opts = {}) {
  const { scores } = _cvLoop_model_selection(estimator, X, y, opts, /* multi= */ false);
  return scores;
}

/**
 * Run cross-validation collecting multiple metrics + optional train scores.
 *
 *   opts.cv, opts.scoring, opts.sample_weight, opts.split_opts as above
 *   opts.scoring may be { name: fn, ... } for multiple metrics
 *   opts.return_train_score (bool, default false)
 *   opts.refit (bool, default true) — see cross_val_score. When false,
 *     fit_time is 0 for every fold and train_<name> equals the score on
 *     the full training fold (no in-fold retraining occurred).
 *
 * Returns { test_score | test_<name>, [train_score | train_<name>],
 *           fit_time, score_time, n_dropped (when SpatialKFold) }.
 */
function cross_validate(estimator, X, y, opts = {}) {
  return _cvLoop_model_selection(estimator, X, y, opts, /* multi= */ true);
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _cvLoop_model_selection(estimator, X, y, opts, multi) {
  // Probe the estimator's tags to decide whether to accept NaN inputs.
  // Pipelines that include an imputer set allow_nan=true; we mustn't
  // reject NaN at the CV boundary in that case.
  const allow_nan = _estAllowsNan_model_selection(estimator);
  const { data: Xd, shape } = asMatrix(X, { allow_nan });
  const n = shape[0], m = shape[1];
  const yv = y == null ? null : asVector(y, { allow_nan });
  if (yv != null && yv.length !== n) {
    throw new ValidationError(`cross_val: y length ${yv.length} != n_samples ${n}`);
  }
  const cv = _resolveCv_model_selection(opts.cv);
  const splitOpts = opts.split_opts ?? {};
  const scoringDict = _resolveScoring_model_selection(opts.scoring, multi);
  const returnTrain = opts.return_train_score ?? false;
  const refit = opts.refit ?? true;

  // refit=false requires a fitted estimator since we won't retrain. Fail
  // fast with a clear error rather than letting predict throw downstream.
  if (!refit) {
    try {
      check_is_fitted(estimator);
    } catch (_) {
      throw new ValidationError(
        'cross_val: refit=false requires a fitted estimator; got an unfitted one.');
    }
  }

  const X_envelope = { data: Xd, shape };
  const fold_results = [];
  for (const tup of cv.split(X_envelope, yv, splitOpts)) {
    const train_idx = tup[0];
    const test_idx = tup[1];
    const n_dropped = tup[2];

    const X_train = _gatherRows_model_selection(Xd, n, m, train_idx);
    const X_test = _gatherRows_model_selection(Xd, n, m, test_idx);
    const y_train = yv == null ? null : _gatherValues_model_selection(yv, train_idx);
    const y_test = yv == null ? null : _gatherValues_model_selection(yv, test_idx);

    let est, fit_time;
    if (refit) {
      est = clone(estimator);
      const t_fit = _now_model_selection();
      est.fit(X_train, y_train);
      fit_time = _now_model_selection() - t_fit;
    } else {
      // Use the as-passed (fitted) estimator. fit_time is 0 since no fit
      // happened. The estimator's frozen state is the same on every fold —
      // we're scoring it on the test partition only, which is exactly the
      // refit=false contract (SPEC §5.4).
      est = estimator;
      fit_time = 0;
    }

    const t_score = _now_model_selection();
    const test_scores = {};
    const train_scores = {};
    for (const name of Object.keys(scoringDict)) {
      const fn = scoringDict[name];
      test_scores[name] = fn(est, X_test, y_test);
      if (returnTrain) train_scores[name] = fn(est, X_train, y_train);
    }
    const score_time = _now_model_selection() - t_score;

    fold_results.push({
      test_scores, train_scores, fit_time, score_time, n_dropped,
    });
  }

  if (!multi) {
    const out = new Float64Array(fold_results.length);
    for (let i = 0; i < out.length; i++) {
      // Single-metric: pull the only key.
      const k = Object.keys(fold_results[i].test_scores)[0];
      out[i] = fold_results[i].test_scores[k];
    }
    return { scores: out };
  }

  // Multi-metric: collect per-name arrays.
  const out = {};
  const metricNames = Object.keys(fold_results[0].test_scores);
  for (const name of metricNames) {
    out[`test_${name}`] = new Float64Array(fold_results.length);
    if (returnTrain) out[`train_${name}`] = new Float64Array(fold_results.length);
    for (let i = 0; i < fold_results.length; i++) {
      out[`test_${name}`][i] = fold_results[i].test_scores[name];
      if (returnTrain) out[`train_${name}`][i] = fold_results[i].train_scores[name];
    }
  }
  out.fit_time = Float64Array.from(fold_results.map(f => f.fit_time));
  out.score_time = Float64Array.from(fold_results.map(f => f.score_time));
  if (fold_results.some(f => f.n_dropped !== undefined)) {
    out.n_dropped = Int32Array.from(fold_results.map(f => f.n_dropped ?? 0));
  }
  return out;
}

// Probe the estimator's __sklearn_tags__() for allow_nan. Returns false
// if the estimator doesn't expose tags (defensive default).
function _estAllowsNan_model_selection(est) {
  if (est == null) return false;
  if (typeof est.__sklearn_tags__ === 'function') {
    try { return !!est.__sklearn_tags__().allow_nan; } catch (_) { return false; }
  }
  return false;
}

function _resolveCv_model_selection(cv) {
  if (cv == null) return new KFold({ n_splits: 5 });
  if (typeof cv === 'number') return new KFold({ n_splits: cv });
  if (cv.split && typeof cv.split === 'function') return cv;
  throw new ValidationError(
    `cross_val: cv must be a splitter (with .split) or an integer; got ${typeof cv}`);
}

function _resolveScoring_model_selection(scoring, multi) {
  // Default: use estimator.score.
  if (scoring == null) {
    return { score: (est, X, y) => est.score(X, y) };
  }
  if (typeof scoring === 'function') {
    return { score: scoring };
  }
  if (multi && typeof scoring === 'object') {
    const out = {};
    for (const name of Object.keys(scoring)) {
      const fn = scoring[name];
      if (typeof fn !== 'function') {
        throw new ValidationError(
          `cross_validate: scoring['${name}'] must be a function`);
      }
      out[name] = fn;
    }
    return out;
  }
  throw new ValidationError(
    `cross_val: scoring must be a function${multi ? ' or {name: fn, …}' : ''}`);
}

function _resolveSplitCount_model_selection(n, opts) {
  const train_size = opts.train_size;
  let test_size = opts.test_size;
  if (train_size != null && test_size != null) {
    // Both given: as long as they're consistent, use them; else error.
  }
  if (train_size != null && test_size == null) {
    const t = train_size > 1 ? train_size : Math.round(train_size * n);
    return Math.max(0, n - t);
  }
  if (test_size == null) test_size = 0.25;  // sklearn default
  return test_size > 1 ? Math.floor(test_size) : Math.round(test_size * n);
}

function _stratifiedSplit_model_selection(strat, n_train, n_test, rng) {
  const byClass = new Map();
  for (let i = 0; i < strat.length; i++) {
    const c = strat[i];
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c).push(i);
  }
  const train = [];
  const test = [];
  for (const [, arr] of byClass) {
    _shuffleInPlace_model_selection(arr, rng);
    // Per-class proportional split.
    const k_test = Math.max(1, Math.round(arr.length * n_test / strat.length));
    for (let i = 0; i < arr.length; i++) {
      if (i < k_test) test.push(arr[i]); else train.push(arr[i]);
    }
  }
  // Adjust to exact total counts (rounding may be off by a few).
  while (test.length > n_test) train.push(test.pop());
  while (train.length > n_train) test.push(train.pop());
  train.sort((a, b) => a - b);
  test.sort((a, b) => a - b);
  return [Int32Array.from(train), Int32Array.from(test)];
}

function _stratifiedFoldAssignment_model_selection(strat, n_splits, rng) {
  const arr = _asLabelArray_model_selection(strat);
  const n = arr.length;
  const byClass = new Map();
  for (let i = 0; i < n; i++) {
    const c = arr[i];
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c).push(i);
  }
  const fold_id = new Int32Array(n);
  for (const [, idxs] of byClass) {
    _shuffleInPlace_model_selection(idxs, rng);
    for (let k = 0; k < idxs.length; k++) {
      fold_id[idxs[k]] = k % n_splits;
    }
  }
  return fold_id;
}

function _arange_model_selection(n) {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function _shuffleInPlace_model_selection(arr, rng) {
  const r = rng ?? Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

function _concatExcept_model_selection(indices, lo, hi) {
  // Return a copy of `indices` with [lo, hi) excised.
  const out = new Int32Array(indices.length - (hi - lo));
  let w = 0;
  for (let i = 0; i < lo; i++) out[w++] = indices[i];
  for (let i = hi; i < indices.length; i++) out[w++] = indices[i];
  return out;
}

function _gatherRows_model_selection(Xd, n, m, indices) {
  const k = indices.length;
  const out = new Float64Array(k * m);
  for (let i = 0; i < k; i++) {
    const src = indices[i] * m;
    const dst = i * m;
    for (let j = 0; j < m; j++) out[dst + j] = Xd[src + j];
  }
  out.shape = [k, m];
  return out;
}

function _gatherValues_model_selection(yv, indices) {
  const k = indices.length;
  const out = new Float64Array(k);
  for (let i = 0; i < k; i++) out[i] = yv[indices[i]];
  return out;
}

function _asLabelArray_model_selection(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (ArrayBuffer.isView(v)) return Array.from(v);
  throw new ValidationError(`expected 1D array of labels; got ${typeof v}`);
}

function _now_model_selection() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now() / 1000  // sklearn returns seconds
    : Date.now() / 1000;
}

// ────────────────────────────────────────────────────────────────────
// from_table — extract sklearn-shape inputs from a sadpan/DataFrame-like
// ────────────────────────────────────────────────────────────────────

/**
 * Build (X, y, groups, xyz) tuples from a table-shaped input. Per
 * SPEC-learn §3.5.
 *
 * @param {object} df  — sadpan Table, sadpan DataFrame, or plain
 *                       JS object with named array-like columns
 * @param {object} opts
 * @param {string|null}    [opts.target]   — column name for y
 * @param {string[]|null}  [opts.features] — column names for X (default:
 *                       all columns except target/group/xyz)
 * @param {string|null}    [opts.group]    — column name for groups
 * @param {string[]|null}  [opts.xyz]      — column names for spatial coords
 *
 * @returns {object}
 *   X            { data, shape, feature_names } — same shape asMatrix returns
 *   y            Float64Array (or null) — int-encoded when target was string-typed
 *   groups       Array of raw group values (or null)
 *   xyz          { data, shape } 2D — or null
 *   feature_names string[] — actual feature column names
 *   classes      string[] — original class labels in encoded order, when
 *                target was string-typed; null otherwise
 */
function from_table(df, opts = {}) {
  const kind = detectTable(df);
  if (kind == null) {
    throw new ValidationError(
      'from_table: input is not a sadpan Table, DataFrame, or named-column object');
  }
  const all_cols = tableColumns(df, kind);
  const n = tableNumRows(df, kind);
  const target = opts.target ?? null;
  const group = opts.group ?? null;
  const xyz_cols = opts.xyz ?? null;

  // Default features: all columns except target / group / xyz.
  let features = opts.features ?? null;
  if (features == null) {
    const exclude = new Set();
    if (target) exclude.add(target);
    if (group) exclude.add(group);
    if (Array.isArray(xyz_cols)) for (const c of xyz_cols) exclude.add(c);
    features = all_cols.filter(c => !exclude.has(c));
  }
  for (const c of features) {
    if (!all_cols.includes(c)) {
      throw new ValidationError(`from_table: feature '${c}' not in input columns`);
    }
  }

  // Build X by stacking feature columns numerically.
  const X_data = new Float64Array(n * features.length);
  for (let j = 0; j < features.length; j++) {
    const col = tableColumn(df, kind, features[j]);
    for (let i = 0; i < n; i++) {
      const v = +col[i];
      if (!Number.isFinite(v)) {
        throw new ValidationError(
          `from_table: non-finite value in feature '${features[j]}' at row ${i}`);
      }
      X_data[i * features.length + j] = v;
    }
  }
  X_data.shape = [n, features.length];
  const X = { data: X_data, shape: [n, features.length], feature_names: features.slice() };

  // y: extract target, auto-encode if string-typed.
  let y = null;
  let classes = null;
  if (target != null) {
    if (!all_cols.includes(target)) {
      throw new ValidationError(`from_table: target '${target}' not in input columns`);
    }
    const raw = tableColumn(df, kind, target);
    const isString = raw.length > 0 && typeof raw[0] === 'string';
    if (isString) {
      const seen = new Map();
      const order = [];
      for (let i = 0; i < n; i++) {
        const v = raw[i];
        if (!seen.has(v)) { seen.set(v, true); order.push(v); }
      }
      order.sort();
      const idx = new Map();
      for (let c = 0; c < order.length; c++) idx.set(order[c], c);
      const enc = new Float64Array(n);
      for (let i = 0; i < n; i++) enc[i] = idx.get(raw[i]);
      y = enc;
      classes = order;
    } else {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = +raw[i];
      y = out;
    }
  }

  // groups: raw values (splitter compares with === / Map keys).
  let groups = null;
  if (group != null) {
    if (!all_cols.includes(group)) {
      throw new ValidationError(`from_table: group '${group}' not in input columns`);
    }
    const raw = tableColumn(df, kind, group);
    groups = Array.from(raw);
  }

  // xyz: stack 1-3 columns.
  let xyz = null;
  if (Array.isArray(xyz_cols)) {
    if (xyz_cols.length < 1 || xyz_cols.length > 3) {
      throw new ValidationError(
        `from_table: xyz must list 1-3 columns; got ${xyz_cols.length}`);
    }
    for (const c of xyz_cols) {
      if (!all_cols.includes(c)) {
        throw new ValidationError(`from_table: xyz column '${c}' not in input columns`);
      }
    }
    const xyz_data = new Float64Array(n * xyz_cols.length);
    for (let j = 0; j < xyz_cols.length; j++) {
      const col = tableColumn(df, kind, xyz_cols[j]);
      for (let i = 0; i < n; i++) xyz_data[i * xyz_cols.length + j] = +col[i];
    }
    xyz_data.shape = [n, xyz_cols.length];
    xyz = { data: xyz_data, shape: [n, xyz_cols.length] };
  }

  return {
    X, y, groups, xyz,
    feature_names: features.slice(),
    classes,
  };
}

// ── preprocessing.js ──

// Preprocessing: feature scaling, encoding, discretization, power
// transformation. The workhorse transformers most ML workflows rely on.
//
// All transformers in this module return a Float64Array with `.shape`
// set as an own property (`[n, m]`). The asMatrix helper accepts this
// shape on input, so estimator outputs flow into other estimator inputs
// without copy.
//
// Conventions:
//   - Scalers (Standard/MinMax/Robust/MaxAbs) preserve column count.
//   - Encoders (Label/Ordinal/OneHot) accept arbitrary value types
//     (strings, ints, floats) and emit numeric output.
//   - OneHotEncoder expands columns; get_feature_names_out reports them.
//   - All transformers self-register on import for mimic-io load.




const MODULE_ID_PREPROCESSING = '@gcu/learn.preprocessing';

// ────────────────────────────────────────────────────────────────────
// StandardScaler
// ────────────────────────────────────────────────────────────────────

/**
 * Standardize features by removing the mean and scaling to unit variance.
 *
 * Sklearn-compatible (`sklearn.preprocessing.StandardScaler`). Same
 * defaults, same fitted-attribute names, same numerical convention.
 *
 * Hyperparameters:
 *   - with_mean (bool, default true) — center before scaling
 *   - with_std  (bool, default true) — scale to unit variance
 *
 * Fitted attributes:
 *   - mean_              (Float64Array, m) — per-feature mean
 *   - scale_             (Float64Array, m) — per-feature scaling factor
 *   - var_               (Float64Array, m) — per-feature variance
 *   - n_samples_seen_    (number)          — number of training samples
 *   - n_features_in_     (number)          — number of input features
 *
 * Numerical convention. Variance is the population estimate (divide by
 * n), matching sklearn's default. When a feature has zero variance,
 * `scale_` for that feature is set to 1.0 — `transform` then returns
 * `(x - mean)` (or `0` when `with_mean=true`), avoiding division by zero.
 */
class StandardScaler extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.with_mean = params.with_mean ?? true;
    this.with_std = params.with_std ?? true;
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 1) throw new ValidationError('StandardScaler.fit: X has 0 samples');

    const mean = new Float64Array(m);
    if (this.with_mean || this.with_std) {
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) mean[j] += data[off + j];
      }
      const inv_n = 1 / n;
      for (let j = 0; j < m; j++) mean[j] *= inv_n;
    }

    const variance = new Float64Array(m);
    if (this.with_std) {
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) {
          const d = data[off + j] - mean[j];
          variance[j] += d * d;
        }
      }
      const inv_n = 1 / n;
      for (let j = 0; j < m; j++) variance[j] *= inv_n;
    }

    const scale = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const v = variance[j];
      // Match sklearn: zero-variance features get scale=1 (no scaling).
      scale[j] = (this.with_std && v > 0) ? Math.sqrt(v) : 1.0;
    }

    this.mean_ = mean;
    this.scale_ = scale;
    this.var_ = variance;
    this.n_samples_seen_ = n;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    const mean = this.mean_;
    const scale = this.scale_;
    const center = this.with_mean;
    const norm = this.with_std;

    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        let v = data[off + j];
        if (center) v -= mean[j];
        if (norm) v /= scale[j];
        out[off + j] = v;
      }
    }
    out.shape = [n, m];
    return out;
  }

  inverse_transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    const mean = this.mean_;
    const scale = this.scale_;
    const uncenter = this.with_mean;
    const unnorm = this.with_std;

    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        let v = data[off + j];
        if (unnorm) v *= scale[j];
        if (uncenter) v += mean[j];
        out[off + j] = v;
      }
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(StandardScaler.prototype, TransformerMixin);
StandardScaler._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// MinMaxScaler
// ────────────────────────────────────────────────────────────────────

/**
 * Scale features to a given range (default [0, 1]).
 *
 * Hyperparameters:
 *   - feature_range  ([min, max], default [0, 1])
 *
 * Fitted attributes:
 *   - data_min_, data_max_, data_range_  (Float64Array, m)
 *   - scale_, min_                        (Float64Array, m)
 *   - n_samples_seen_, n_features_in_
 *
 * For zero-range features (data_max == data_min), scale_ = 1 and
 * min_ = feature_range[0] — transform returns the lower bound.
 */
class MinMaxScaler extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.feature_range = params.feature_range ?? [0, 1];
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 1) throw new ValidationError('MinMaxScaler.fit: X has 0 samples');
    const [r_lo, r_hi] = this.feature_range;
    if (!(r_lo < r_hi)) {
      throw new ValidationError(
        `MinMaxScaler: feature_range must satisfy lo<hi; got [${r_lo}, ${r_hi}]`);
    }
    const data_min = new Float64Array(m);
    const data_max = new Float64Array(m);
    for (let j = 0; j < m; j++) { data_min[j] = Infinity; data_max[j] = -Infinity; }
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        const v = data[off + j];
        if (v < data_min[j]) data_min[j] = v;
        if (v > data_max[j]) data_max[j] = v;
      }
    }
    const data_range = new Float64Array(m);
    const scale = new Float64Array(m);
    const min_ = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      data_range[j] = data_max[j] - data_min[j];
      const s = data_range[j] === 0 ? 1 : (r_hi - r_lo) / data_range[j];
      scale[j] = s;
      min_[j] = r_lo - data_min[j] * s;
    }
    this.data_min_ = data_min;
    this.data_max_ = data_max;
    this.data_range_ = data_range;
    this.scale_ = scale;
    this.min_ = min_;
    this.n_samples_seen_ = n;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) out[off + j] = data[off + j] * this.scale_[j] + this.min_[j];
    }
    out.shape = [n, m];
    return out;
  }

  inverse_transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) out[off + j] = (data[off + j] - this.min_[j]) / this.scale_[j];
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(MinMaxScaler.prototype, TransformerMixin);
MinMaxScaler._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// MaxAbsScaler
// ────────────────────────────────────────────────────────────────────

/**
 * Scale each feature by its maximum absolute value. Output ranges in
 * [-1, 1]; zeros and signs preserved (useful for sparsity-friendly
 * downstream methods, even though we don't ship sparse matrices).
 *
 * Fitted attributes:
 *   - max_abs_, scale_           (Float64Array, m)
 *   - n_samples_seen_, n_features_in_
 *
 * Zero max_abs collapses scale_ to 1 (transform returns 0 for that col).
 */
class MaxAbsScaler extends BaseEstimator {
  constructor(_params = {}) {
    super();
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    const max_abs = new Float64Array(m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        const a = Math.abs(data[off + j]);
        if (a > max_abs[j]) max_abs[j] = a;
      }
    }
    const scale = new Float64Array(m);
    for (let j = 0; j < m; j++) scale[j] = max_abs[j] === 0 ? 1 : max_abs[j];
    this.max_abs_ = max_abs;
    this.scale_ = scale;
    this.n_samples_seen_ = n;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) out[off + j] = data[off + j] / this.scale_[j];
    }
    out.shape = [n, m];
    return out;
  }

  inverse_transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) out[off + j] = data[off + j] * this.scale_[j];
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(MaxAbsScaler.prototype, TransformerMixin);
MaxAbsScaler._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// RobustScaler
// ────────────────────────────────────────────────────────────────────

/**
 * Scale features using median (centering) and inter-quartile range
 * (scaling), robust to outliers.
 *
 * Hyperparameters:
 *   - with_centering   (bool, default true)
 *   - with_scaling     (bool, default true)
 *   - quantile_range   ([lo, hi], default [25.0, 75.0]) — percentiles
 *
 * Fitted attributes: center_, scale_  (Float64Array, m).
 * Zero-IQR features get scale_ = 1.
 */
class RobustScaler extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.with_centering = params.with_centering ?? true;
    this.with_scaling = params.with_scaling ?? true;
    this.quantile_range = params.quantile_range ?? [25.0, 75.0];
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 1) throw new ValidationError('RobustScaler.fit: X has 0 samples');
    const [q_lo, q_hi] = this.quantile_range;
    if (!(q_lo < q_hi) || q_lo < 0 || q_hi > 100) {
      throw new ValidationError(
        `RobustScaler: quantile_range must be [lo, hi] in [0,100]; got [${q_lo}, ${q_hi}]`);
    }
    const center = new Float64Array(m);
    const scale = new Float64Array(m);
    const col = new Float64Array(n);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) col[i] = data[i * m + j];
      const sorted = Array.from(col).sort((a, b) => a - b);
      if (this.with_centering) center[j] = _quantile_preprocessing(sorted, 50);
      if (this.with_scaling) {
        const lo = _quantile_preprocessing(sorted, q_lo);
        const hi = _quantile_preprocessing(sorted, q_hi);
        const iqr = hi - lo;
        scale[j] = iqr === 0 ? 1 : iqr;
      } else {
        scale[j] = 1;
      }
    }
    this.center_ = center;
    this.scale_ = scale;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    const c = this.with_centering;
    const s = this.with_scaling;
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        let v = data[off + j];
        if (c) v -= this.center_[j];
        if (s) v /= this.scale_[j];
        out[off + j] = v;
      }
    }
    out.shape = [n, m];
    return out;
  }

  inverse_transform(X) {
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    const c = this.with_centering;
    const s = this.with_scaling;
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        let v = data[off + j];
        if (s) v *= this.scale_[j];
        if (c) v += this.center_[j];
        out[off + j] = v;
      }
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(RobustScaler.prototype, TransformerMixin);
RobustScaler._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// LabelEncoder
// ────────────────────────────────────────────────────────────────────

/**
 * Encode target labels to integer values 0..k-1.
 *
 * Operates on 1D arrays (y), not 2D matrices (X). For per-column
 * encoding of features use OrdinalEncoder. classes_ stores the original
 * labels in sorted order.
 */
class LabelEncoder extends BaseEstimator {
  constructor(_params = {}) {
    super();
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(y, _opts) {
    const arr = _asLabelArray1d_preprocessing(y);
    const classes = _uniqueSorted_preprocessing(arr);
    this.classes_ = classes;
    return this;
  }

  transform(y) {
    if (this.classes_ == null) throw new ValidationError('LabelEncoder: not fitted');
    const arr = _asLabelArray1d_preprocessing(y);
    const idx = new Map();
    for (let i = 0; i < this.classes_.length; i++) idx.set(this.classes_[i], i);
    const out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!idx.has(v)) {
        throw new ValidationError(
          `LabelEncoder: unknown label '${v}' at index ${i}; ` +
          `known labels are [${this.classes_.join(', ')}]`);
      }
      out[i] = idx.get(v);
    }
    return out;
  }

  fit_transform(y) {
    return this.fit(y).transform(y);
  }

  inverse_transform(yEnc) {
    if (this.classes_ == null) throw new ValidationError('LabelEncoder: not fitted');
    const arr = _asLabelArray1d_preprocessing(yEnc);
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const k = arr[i] | 0;
      if (k < 0 || k >= this.classes_.length) {
        throw new ValidationError(
          `LabelEncoder.inverse_transform: encoded value ${k} out of range [0, ${this.classes_.length})`);
      }
      out[i] = this.classes_[k];
    }
    return out;
  }
}

LabelEncoder._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// OrdinalEncoder
// ────────────────────────────────────────────────────────────────────

/**
 * Encode each column of X to integer 0..k_j-1 based on the column's
 * unique values.
 *
 * Hyperparameters:
 *   - categories       'auto' | array of arrays  (per-column known labels)
 *   - handle_unknown   'error' | 'use_encoded_value'  (default 'error')
 *   - unknown_value    number (default NaN; required when handle_unknown='use_encoded_value')
 *
 * Fitted attributes:
 *   - categories_      array of per-column arrays (sorted unique labels)
 *   - n_features_in_
 */
class OrdinalEncoder extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.categories = params.categories ?? 'auto';
    this.handle_unknown = params.handle_unknown ?? 'error';
    this.unknown_value = params.unknown_value ?? NaN;
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const cols = _columnsToArrays_preprocessing(X);
    let categories;
    if (this.categories === 'auto') {
      categories = cols.map(c => _uniqueSorted_preprocessing(c));
    } else {
      if (!Array.isArray(this.categories) || this.categories.length !== cols.length) {
        throw new ValidationError(
          `OrdinalEncoder: categories must be 'auto' or array of length n_features (${cols.length})`);
      }
      categories = this.categories.map(arr => arr.slice());
    }
    this.categories_ = categories;
    this.n_features_in_ = cols.length;
    const names = _columnNamesOf_preprocessing(X);
    if (names) this.feature_names_in_ = names;
    return this;
  }

  transform(X) {
    if (this.categories_ == null) throw new ValidationError('OrdinalEncoder: not fitted');
    const cols = _columnsToArrays_preprocessing(X);
    if (cols.length !== this.n_features_in_) {
      throw new ValidationError(
        `OrdinalEncoder.transform: X has ${cols.length} features, expected ${this.n_features_in_}`);
    }
    const n = cols[0].length;
    const m = cols.length;
    const out = new Float64Array(n * m);
    for (let j = 0; j < m; j++) {
      const idx = new Map();
      const cats = this.categories_[j];
      for (let k = 0; k < cats.length; k++) idx.set(cats[k], k);
      for (let i = 0; i < n; i++) {
        const v = cols[j][i];
        if (idx.has(v)) {
          out[i * m + j] = idx.get(v);
        } else if (this.handle_unknown === 'use_encoded_value') {
          out[i * m + j] = this.unknown_value;
        } else {
          throw new ValidationError(
            `OrdinalEncoder: unknown category '${v}' in column ${j} at row ${i}`);
        }
      }
    }
    out.shape = [n, m];
    return out;
  }

  inverse_transform(X) {
    if (this.categories_ == null) throw new ValidationError('OrdinalEncoder: not fitted');
    const { data, shape } = asMatrix(X);
    if (shape[1] !== this.n_features_in_) {
      throw new ValidationError(
        `OrdinalEncoder.inverse_transform: X has ${shape[1]} features, expected ${this.n_features_in_}`);
    }
    const [n, m] = shape;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Array(m);
      for (let j = 0; j < m; j++) {
        const k = data[i * m + j] | 0;
        const cats = this.categories_[j];
        row[j] = (k >= 0 && k < cats.length) ? cats[k] : null;
      }
      out[i] = row;
    }
    return out;
  }
}

Object.assign(OrdinalEncoder.prototype, TransformerMixin);
OrdinalEncoder._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// OneHotEncoder
// ────────────────────────────────────────────────────────────────────

/**
 * One-hot expand each input column to len(categories_[col]) binary
 * columns. Output is dense (no scipy.sparse — see SPEC §3.6 dev #3).
 *
 * Hyperparameters:
 *   - categories       'auto' | array of arrays
 *   - drop             null | 'first' | 'if_binary'  (omit one column per feature)
 *   - handle_unknown   'error' | 'ignore'  (default 'error'; 'ignore' = all-zero row)
 *
 * Fitted attributes:
 *   - categories_, drop_idx_  (Int32Array — index into categories_[j], or -1)
 *   - n_features_in_, n_features_out_
 */
class OneHotEncoder extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.categories = params.categories ?? 'auto';
    this.drop = params.drop ?? null;
    this.handle_unknown = params.handle_unknown ?? 'error';
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const cols = _columnsToArrays_preprocessing(X);
    let categories;
    if (this.categories === 'auto') {
      categories = cols.map(c => _uniqueSorted_preprocessing(c));
    } else {
      if (!Array.isArray(this.categories) || this.categories.length !== cols.length) {
        throw new ValidationError(
          `OneHotEncoder: categories must be 'auto' or array of length n_features (${cols.length})`);
      }
      categories = this.categories.map(arr => arr.slice());
    }
    const drop_idx = new Int32Array(cols.length);
    drop_idx.fill(-1);
    if (this.drop === 'first') {
      for (let j = 0; j < cols.length; j++) drop_idx[j] = 0;
    } else if (this.drop === 'if_binary') {
      for (let j = 0; j < cols.length; j++) if (categories[j].length === 2) drop_idx[j] = 0;
    } else if (this.drop != null) {
      throw new ValidationError(
        `OneHotEncoder: drop must be null | 'first' | 'if_binary'; got '${this.drop}'`);
    }
    let n_out = 0;
    for (let j = 0; j < cols.length; j++) {
      n_out += categories[j].length - (drop_idx[j] >= 0 ? 1 : 0);
    }
    this.categories_ = categories;
    this.drop_idx_ = drop_idx;
    this.n_features_in_ = cols.length;
    this.n_features_out_ = n_out;
    const names = _columnNamesOf_preprocessing(X);
    if (names) this.feature_names_in_ = names;
    return this;
  }

  transform(X) {
    if (this.categories_ == null) throw new ValidationError('OneHotEncoder: not fitted');
    const cols = _columnsToArrays_preprocessing(X);
    if (cols.length !== this.n_features_in_) {
      throw new ValidationError(
        `OneHotEncoder.transform: X has ${cols.length} features, expected ${this.n_features_in_}`);
    }
    const n = cols[0].length;
    const out = new Float64Array(n * this.n_features_out_);
    // Per-feature output column offsets.
    const offsets = new Int32Array(cols.length);
    let acc = 0;
    for (let j = 0; j < cols.length; j++) {
      offsets[j] = acc;
      acc += this.categories_[j].length - (this.drop_idx_[j] >= 0 ? 1 : 0);
    }
    for (let j = 0; j < cols.length; j++) {
      const cats = this.categories_[j];
      const drop = this.drop_idx_[j];
      const idx = new Map();
      for (let k = 0; k < cats.length; k++) idx.set(cats[k], k);
      for (let i = 0; i < n; i++) {
        const v = cols[j][i];
        if (!idx.has(v)) {
          if (this.handle_unknown === 'ignore') continue;
          throw new ValidationError(
            `OneHotEncoder: unknown category '${v}' in column ${j} at row ${i}`);
        }
        const k = idx.get(v);
        if (k === drop) continue;
        const col_idx = drop >= 0 && k > drop ? k - 1 : k;
        out[i * this.n_features_out_ + offsets[j] + col_idx] = 1;
      }
    }
    out.shape = [n, this.n_features_out_];
    return out;
  }

  inverse_transform(X) {
    if (this.categories_ == null) throw new ValidationError('OneHotEncoder: not fitted');
    const { data, shape } = asMatrix(X);
    if (shape[1] !== this.n_features_out_) {
      throw new ValidationError(
        `OneHotEncoder.inverse_transform: X has ${shape[1]} columns, expected ${this.n_features_out_}`);
    }
    const [n, m_out] = shape;
    const offsets = new Int32Array(this.n_features_in_);
    let acc = 0;
    for (let j = 0; j < this.n_features_in_; j++) {
      offsets[j] = acc;
      acc += this.categories_[j].length - (this.drop_idx_[j] >= 0 ? 1 : 0);
    }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Array(this.n_features_in_);
      for (let j = 0; j < this.n_features_in_; j++) {
        const cats = this.categories_[j];
        const drop = this.drop_idx_[j];
        const w = cats.length - (drop >= 0 ? 1 : 0);
        let chosen = -1;
        for (let k = 0; k < w; k++) {
          if (data[i * m_out + offsets[j] + k] > 0.5) { chosen = k; break; }
        }
        if (chosen === -1 && drop >= 0) {
          // No bit set + drop active → it's the dropped category.
          row[j] = cats[drop];
        } else if (chosen === -1) {
          row[j] = null;  // handle_unknown='ignore' produced an all-zero row
        } else {
          // Map the column index back to the original category index.
          const k = drop >= 0 && chosen >= drop ? chosen + 1 : chosen;
          row[j] = cats[k];
        }
      }
      out[i] = row;
    }
    return out;
  }

  /**
   * Output column names: "<input_feature_<j>>_<category>" by default.
   * Pass a string array of input feature names to use those instead.
   */
  get_feature_names_out(input_features = null) {
    if (this.categories_ == null) {
      throw new ValidationError('OneHotEncoder: not fitted');
    }
    const names = [];
    for (let j = 0; j < this.n_features_in_; j++) {
      const base = input_features?.[j] ?? `x${j}`;
      const cats = this.categories_[j];
      const drop = this.drop_idx_[j];
      for (let k = 0; k < cats.length; k++) {
        if (k === drop) continue;
        names.push(`${base}_${cats[k]}`);
      }
    }
    return names;
  }
}

Object.assign(OneHotEncoder.prototype, TransformerMixin);
OneHotEncoder._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// KBinsDiscretizer
// ────────────────────────────────────────────────────────────────────

/**
 * Bin continuous features into intervals (ordinal output).
 *
 * Hyperparameters:
 *   - n_bins    int | array (default 5; per-feature when array)
 *   - strategy  'uniform' | 'quantile'  (default 'quantile')
 *   - encode    'ordinal' (only — 'onehot' deferred to v0.2)
 *
 * Fitted attributes:
 *   - bin_edges_  array of per-column Float64Array of edges (length k+1)
 *   - n_bins_     Int32Array of per-column actual bin counts
 */
class KBinsDiscretizer extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_bins = params.n_bins ?? 5;
    this.strategy = params.strategy ?? 'quantile';
    this.encode = params.encode ?? 'ordinal';
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (this.encode !== 'ordinal') {
      throw new ValidationError(
        `KBinsDiscretizer: encode='${this.encode}' not supported in v0.1 (use 'ordinal')`);
    }
    const n_bins = _resolveNBins_preprocessing(this.n_bins, m);
    const bin_edges = new Array(m);
    const actual_bins = new Int32Array(m);
    const col = new Float64Array(n);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) col[i] = data[i * m + j];
      const k = n_bins[j];
      if (k < 2) {
        throw new ValidationError(
          `KBinsDiscretizer: n_bins[${j}]=${k} must be >= 2`);
      }
      let edges;
      if (this.strategy === 'uniform') {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < n; i++) {
          if (col[i] < lo) lo = col[i];
          if (col[i] > hi) hi = col[i];
        }
        edges = new Float64Array(k + 1);
        for (let i = 0; i <= k; i++) edges[i] = lo + (hi - lo) * i / k;
      } else if (this.strategy === 'quantile') {
        const sorted = Array.from(col).sort((a, b) => a - b);
        edges = new Float64Array(k + 1);
        for (let i = 0; i <= k; i++) edges[i] = _quantile_preprocessing(sorted, 100 * i / k);
      } else {
        throw new ValidationError(
          `KBinsDiscretizer: strategy='${this.strategy}' must be 'uniform' | 'quantile'`);
      }
      // Collapse degenerate edges (zero-width bins) — sklearn warns + collapses.
      const unique = [edges[0]];
      for (let i = 1; i < edges.length; i++) {
        if (edges[i] > unique[unique.length - 1]) unique.push(edges[i]);
      }
      bin_edges[j] = Float64Array.from(unique);
      actual_bins[j] = unique.length - 1;
    }
    this.bin_edges_ = bin_edges;
    this.n_bins_ = actual_bins;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  /**
   * Output feature names: same as input (ordinal encoding preserves columns).
   * Falls back to `feature_names_in_` when input_features is null.
   */
  get_feature_names_out(input_features = null) {
    if (this.bin_edges_ == null) throw new ValidationError('KBinsDiscretizer: not fitted');
    const names = input_features ?? this.feature_names_in_;
    if (names) return names.slice();
    const out = new Array(this.n_features_in_);
    for (let j = 0; j < this.n_features_in_; j++) out[j] = `x${j}`;
    return out;
  }

  transform(X) {
    if (this.bin_edges_ == null) throw new ValidationError('KBinsDiscretizer: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let j = 0; j < m; j++) {
      const edges = this.bin_edges_[j];
      const k = this.n_bins_[j];
      for (let i = 0; i < n; i++) {
        const v = data[i * m + j];
        // Find which bin (0..k-1). Clip to first/last bin for outliers.
        let bin = 0;
        for (let b = 1; b < k; b++) {
          if (v >= edges[b]) bin = b; else break;
        }
        out[i * m + j] = bin;
      }
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(KBinsDiscretizer.prototype, TransformerMixin);
KBinsDiscretizer._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// PowerTransformer (Yeo-Johnson)
// ────────────────────────────────────────────────────────────────────

/**
 * Power transform (Yeo-Johnson only in v0.1) to make data more
 * Gaussian-like. Lambda fit per feature via golden-section search on
 * the log-likelihood.
 *
 * Hyperparameters:
 *   - method        'yeo-johnson'  (only; Box-Cox excluded as it requires
 *                    strictly positive input)
 *   - standardize   bool (default true) — apply zero-mean unit-variance
 *                    after the power transform, like sklearn does
 *
 * Fitted attributes:
 *   - lambdas_      Float64Array, m
 *   - mean_, scale_ (Float64Array, m) — when standardize=true
 *   - n_features_in_
 */
class PowerTransformer extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.method = params.method ?? 'yeo-johnson';
    this.standardize = params.standardize ?? true;
    this._module = MODULE_ID_PREPROCESSING;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (this.method !== 'yeo-johnson') {
      throw new ValidationError(
        `PowerTransformer: method='${this.method}' not supported in v0.1 (use 'yeo-johnson')`);
    }
    const lambdas = new Float64Array(m);
    const col = new Float64Array(n);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) col[i] = data[i * m + j];
      lambdas[j] = _fitYeoJohnsonLambda_preprocessing(col);
    }
    this.lambdas_ = lambdas;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    if (this.standardize) {
      // Apply transform once, then fit a StandardScaler on the result.
      const Xt = this._yeoJohnsonForward(data, n, m);
      const mean = new Float64Array(m);
      const variance = new Float64Array(m);
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) mean[j] += Xt[off + j];
      }
      const inv_n = 1 / n;
      for (let j = 0; j < m; j++) mean[j] *= inv_n;
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) {
          const d = Xt[off + j] - mean[j];
          variance[j] += d * d;
        }
      }
      for (let j = 0; j < m; j++) variance[j] *= inv_n;
      const scale = new Float64Array(m);
      for (let j = 0; j < m; j++) scale[j] = variance[j] > 0 ? Math.sqrt(variance[j]) : 1;
      this.mean_ = mean;
      this.scale_ = scale;
    }
    return this;
  }

  transform(X) {
    if (this.lambdas_ == null) throw new ValidationError('PowerTransformer: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const Xt = this._yeoJohnsonForward(data, n, m);
    if (this.standardize) {
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) {
          Xt[off + j] = (Xt[off + j] - this.mean_[j]) / this.scale_[j];
        }
      }
    }
    Xt.shape = [n, m];
    return Xt;
  }

  inverse_transform(X) {
    if (this.lambdas_ == null) throw new ValidationError('PowerTransformer: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        let v = data[off + j];
        if (this.standardize) v = v * this.scale_[j] + this.mean_[j];
        out[off + j] = _yeoJohnsonInverse_preprocessing(v, this.lambdas_[j]);
      }
    }
    out.shape = [n, m];
    return out;
  }

  _yeoJohnsonForward(data, n, m) {
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        out[off + j] = _yeoJohnson_preprocessing(data[off + j], this.lambdas_[j]);
      }
    }
    return out;
  }
}

Object.assign(PowerTransformer.prototype, TransformerMixin);
PowerTransformer._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

// Linear-interpolation quantile from a sorted array; q in [0, 100].
function _quantile_preprocessing(sorted, q) {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Coerce 1D input to a JS array (preserves arbitrary value types).
function _asLabelArray1d_preprocessing(y) {
  if (y == null) throw new ValidationError('input is null/undefined');
  if (Array.isArray(y)) return y;
  if (ArrayBuffer.isView(y)) return Array.from(y);
  throw new ValidationError(`expected 1D array; got ${typeof y}`);
}

// Sorted unique values from a 1D array. Numbers sort numerically;
// strings lexicographically; mixed types compared via String() coercion.
function _uniqueSorted_preprocessing(arr) {
  const seen = new Set();
  for (const v of arr) seen.add(v);
  const u = [...seen];
  // If all numeric, sort numerically; else lexicographic on String().
  const allNumeric = u.every(v => typeof v === 'number');
  if (allNumeric) u.sort((a, b) => a - b);
  else u.sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  return u;
}

// Convert input X to per-column JS arrays. Preserves arbitrary value
// types — encoders work on strings/ints/floats uniformly.
// Accepts: 2D nested array, Float64Array.shape, {data,shape}, sadpan
// Table, sadpan DataFrame, plain {col: array} object.
function _columnsToArrays_preprocessing(X) {
  // Table-shaped (Table / DataFrame / named columns): preserve raw types.
  const kind = detectTable(X);
  if (kind) {
    const names = tableColumns(X, kind);
    return names.map(n => Array.from(tableColumn(X, kind, n)));
  }
  if (Array.isArray(X) && X.length > 0 && Array.isArray(X[0])) {
    const n = X.length;
    const m = X[0].length;
    const cols = Array.from({ length: m }, () => new Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) cols[j][i] = X[i][j];
    }
    return cols;
  }
  // Fall back to numeric matrix shape.
  const { data, shape } = asMatrix(X);
  const [n, m] = shape;
  const cols = Array.from({ length: m }, () => new Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) cols[j][i] = data[i * m + j];
  }
  return cols;
}

// Extract column names from an X input, or null if X doesn't carry them.
function _columnNamesOf_preprocessing(X) {
  const kind = detectTable(X);
  if (kind) return tableColumns(X, kind).slice();
  if (X && X.feature_names) return X.feature_names.slice();
  return null;
}

function _resolveNBins_preprocessing(spec, m) {
  if (typeof spec === 'number') {
    const out = new Int32Array(m);
    out.fill(spec);
    return out;
  }
  if (Array.isArray(spec) || ArrayBuffer.isView(spec)) {
    if (spec.length !== m) {
      throw new ValidationError(
        `KBinsDiscretizer: n_bins array length ${spec.length} != n_features ${m}`);
    }
    const out = new Int32Array(m);
    for (let j = 0; j < m; j++) out[j] = spec[j] | 0;
    return out;
  }
  throw new ValidationError(`KBinsDiscretizer: n_bins must be int or array`);
}

// Yeo-Johnson forward transform.
function _yeoJohnson_preprocessing(x, lambda) {
  if (x >= 0) {
    if (lambda === 0) return Math.log1p(x);
    return (Math.pow(x + 1, lambda) - 1) / lambda;
  } else {
    if (lambda === 2) return -Math.log1p(-x);
    return -(Math.pow(-x + 1, 2 - lambda) - 1) / (2 - lambda);
  }
}

// Yeo-Johnson inverse.
function _yeoJohnsonInverse_preprocessing(y, lambda) {
  if (y >= 0) {
    if (lambda === 0) return Math.expm1(y);
    return Math.pow(y * lambda + 1, 1 / lambda) - 1;
  } else {
    if (lambda === 2) return -Math.expm1(-y);
    return -(Math.pow(-y * (2 - lambda) + 1, 1 / (2 - lambda)) - 1);
  }
}

// Maximum-likelihood lambda for Yeo-Johnson via golden-section search
// over [-2, 2]. Returns the lambda that maximizes the log-likelihood
// of the transformed column being normally distributed.
function _fitYeoJohnsonLambda_preprocessing(col) {
  const n = col.length;
  // Precompute log-Jacobian helper sum (for the standard YJ likelihood).
  let log_jac_const = 0;
  for (let i = 0; i < n; i++) log_jac_const += Math.sign(col[i]) * Math.log(Math.abs(col[i]) + 1);

  const ll = (lambda) => {
    // Transform the column, compute variance, then likelihood.
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) {
      const t = _yeoJohnson_preprocessing(col[i], lambda);
      sum += t; sq += t * t;
    }
    const mean = sum / n;
    const variance = Math.max(1e-300, sq / n - mean * mean);
    return -n / 2 * Math.log(variance) + (lambda - 1) * log_jac_const;
  };

  // Golden-section search maximizing ll over [-2, 2].
  const phi = (Math.sqrt(5) - 1) / 2;  // ≈ 0.618
  let a = -2, b = 2;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let llc = ll(c), lld = ll(d);
  for (let iter = 0; iter < 100; iter++) {
    if (Math.abs(b - a) < 1e-6) break;
    if (llc > lld) {
      b = d; d = c; lld = llc;
      c = b - phi * (b - a);
      llc = ll(c);
    } else {
      a = c; c = d; llc = lld;
      d = a + phi * (b - a);
      lld = ll(d);
    }
  }
  return (a + b) / 2;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('StandardScaler', StandardScaler, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('MinMaxScaler', MinMaxScaler, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('MaxAbsScaler', MaxAbsScaler, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('RobustScaler', RobustScaler, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('LabelEncoder', LabelEncoder, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('OrdinalEncoder', OrdinalEncoder, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('OneHotEncoder', OneHotEncoder, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('KBinsDiscretizer', KBinsDiscretizer, { module: MODULE_ID_PREPROCESSING });
learnRegistry.register('PowerTransformer', PowerTransformer, { module: MODULE_ID_PREPROCESSING });

// ── tree.js ──

// CART decision trees — DecisionTreeClassifier + DecisionTreeRegressor.
//
// Sklearn-compatible (`sklearn.tree.DecisionTreeClassifier` /
// `DecisionTreeRegressor`). Exhaustive split search; Gini for
// classification, squared-error for regression. Numeric features only in
// v0.1 (categorical splits land with the arborist port for v0.2).
//
// Storage: parallel arrays (children_left, children_right, feature,
// threshold, impurity, n_node_samples, value) — directly mimic-io-
// serializable, sklearn-shape, ready for AIR `compileTree` (SPEC §6.5)
// in v0.2.
//
// Performance: per @gcu/line discipline (SPEC §6.4). Pre-sorted feature
// columns once at fit-time, active-sample mask filter per node, tight
// scalar accumulator inner loop. Re-sort-per-node would be ~6× slower at
// realistic sizes. Hot path uses Float64Array and Int32Array exclusively.
//
// Hyperparameters supported:
//   - criterion       'gini'           (classifier) / 'squared_error' (regressor)
//   - splitter        'best' (default — exhaustive)
//                   | 'random' (one random threshold per feature; for ExtraTrees)
//   - max_depth       int | null       (no limit when null)
//   - min_samples_split int             default 2
//   - min_samples_leaf  int             default 1
//   - max_features    null|int|'sqrt'|'log2'  (random feature subsampling per node)
//   - random_state    int|null
//
// Hyperparameters still deferred:
//   - class_weight, min_weight_fraction_leaf, max_leaf_nodes,
//     min_impurity_decrease, ccp_alpha, monotonic_cst.





const MODULE_ID_TREE = '@gcu/learn.tree';

// ────────────────────────────────────────────────────────────────────
// DecisionTreeClassifier
// ────────────────────────────────────────────────────────────────────

class DecisionTreeClassifier extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.criterion = params.criterion ?? 'gini';
    this.splitter = params.splitter ?? 'best';
    this.max_depth = params.max_depth ?? null;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_TREE;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data: Xd, shape } = X_info;
    const yv = asVector(y);
    if (yv.length !== shape[0]) {
      throw new ValidationError(
        `DecisionTreeClassifier.fit: y length ${yv.length} != n_samples ${shape[0]}`);
    }
    if (this.criterion !== 'gini') {
      throw new ValidationError(
        `DecisionTreeClassifier: criterion='${this.criterion}' not supported in v0.1 (use 'gini')`);
    }
    // Encode classes to dense ints 0..k-1.
    const { classes, encoded } = _encodeClasses_tree(yv);
    this.classes_ = classes;
    this.n_classes_ = classes.length;
    this.n_features_in_ = shape[1];
    captureFeatureNames(this, X_info);

    const tree = _buildTree_tree(Xd, encoded, shape[0], shape[1], this.n_classes_, {
      mode: 'classifier',
      splitter: this.splitter,
      max_depth: this.max_depth,
      min_samples_split: this.min_samples_split,
      min_samples_leaf: this.min_samples_leaf,
      max_features: _resolveMaxFeatures_tree(this.max_features, shape[1]),
      random_state: this.random_state,
    });
    this.tree_ = tree;
    this.feature_importances_ = _featureImportances_tree(tree, shape[1]);
    return this;
  }

  predict(X) {
    const { data: Xd, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const n = shape[0];
    const m = shape[1];
    const out = new Float64Array(n);
    const k = this.n_classes_;
    const value_stride = k;
    for (let i = 0; i < n; i++) {
      const leaf = _walkTree_tree(this.tree_, Xd, i, m);
      // Argmax over the k class counts.
      const off = leaf * value_stride;
      let best = 0, bestN = -Infinity;
      for (let c = 0; c < k; c++) {
        if (this.tree_.value[off + c] > bestN) { best = c; bestN = this.tree_.value[off + c]; }
      }
      out[i] = this.classes_[best];
    }
    return out;
  }

  predict_proba(X) {
    const { data: Xd, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const n = shape[0];
    const m = shape[1];
    const k = this.n_classes_;
    const out = new Float64Array(n * k);
    const value_stride = k;
    for (let i = 0; i < n; i++) {
      const leaf = _walkTree_tree(this.tree_, Xd, i, m);
      const off_v = leaf * value_stride;
      let total = 0;
      for (let c = 0; c < k; c++) total += this.tree_.value[off_v + c];
      const inv = total === 0 ? 0 : 1 / total;
      for (let c = 0; c < k; c++) out[i * k + c] = this.tree_.value[off_v + c] * inv;
    }
    out.shape = [n, k];
    return out;
  }
}

Object.assign(DecisionTreeClassifier.prototype, ClassifierMixin);
DecisionTreeClassifier._estimator_type = 'classifier';

// ────────────────────────────────────────────────────────────────────
// DecisionTreeRegressor
// ────────────────────────────────────────────────────────────────────

class DecisionTreeRegressor extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.criterion = params.criterion ?? 'squared_error';
    this.splitter = params.splitter ?? 'best';
    this.max_depth = params.max_depth ?? null;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_TREE;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data: Xd, shape } = X_info;
    const yv = asVector(y);
    if (yv.length !== shape[0]) {
      throw new ValidationError(
        `DecisionTreeRegressor.fit: y length ${yv.length} != n_samples ${shape[0]}`);
    }
    if (this.criterion !== 'squared_error') {
      throw new ValidationError(
        `DecisionTreeRegressor: criterion='${this.criterion}' not supported in v0.1 (use 'squared_error')`);
    }
    this.n_features_in_ = shape[1];
    captureFeatureNames(this, X_info);

    const tree = _buildTree_tree(Xd, yv, shape[0], shape[1], 1, {
      mode: 'regressor',
      splitter: this.splitter,
      max_depth: this.max_depth,
      min_samples_split: this.min_samples_split,
      min_samples_leaf: this.min_samples_leaf,
      max_features: _resolveMaxFeatures_tree(this.max_features, shape[1]),
      random_state: this.random_state,
    });
    this.tree_ = tree;
    this.feature_importances_ = _featureImportances_tree(tree, shape[1]);
    return this;
  }

  predict(X) {
    const { data: Xd, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const n = shape[0];
    const m = shape[1];
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const leaf = _walkTree_tree(this.tree_, Xd, i, m);
      out[i] = this.tree_.value[leaf];
    }
    return out;
  }
}

Object.assign(DecisionTreeRegressor.prototype, RegressorMixin);
DecisionTreeRegressor._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// Tree construction
// ────────────────────────────────────────────────────────────────────

// Returns a plain object with parallel arrays. mimic-io's typed-array
// codec handles per-field serialization on dump/load.
//
//   children_left  Int32Array     -1 for leaves
//   children_right Int32Array     -1 for leaves
//   feature        Int32Array     -2 for leaves (sentinel)
//   threshold      Float64Array   NaN for leaves
//   impurity       Float64Array
//   n_node_samples Int32Array
//   value          Float64Array   length = n_nodes * value_stride
//   value_stride   number          (n_classes for classifier, 1 for regressor)
//   n_outputs      number          1 (multi-output deferred)
//   max_depth      number          observed max depth (root = 0)
//   node_count     number          == children_left.length
function _buildTree_tree(Xd, y, n_total, m, n_classes, opts) {
  const mode = opts.mode;
  const splitter = opts.splitter ?? 'best';
  const max_depth = opts.max_depth ?? Infinity;
  const min_samples_split = opts.min_samples_split;
  const min_samples_leaf = opts.min_samples_leaf;
  const max_features = opts.max_features;
  const rng = opts.random_state == null ? null : mulberry32(opts.random_state);
  const value_stride = mode === 'classifier' ? n_classes : 1;
  if (splitter !== 'best' && splitter !== 'random') {
    throw new ValidationError(
      `tree: splitter='${splitter}' must be 'best' | 'random'`);
  }

  // Pre-sort indices per feature once. sorted_idx[j] is an Int32Array of
  // length n_total, holding global sample indices ordered by X[:, j].
  const sorted_idx = new Array(m);
  for (let j = 0; j < m; j++) sorted_idx[j] = _argsortColumn_tree(Xd, n_total, m, j);

  // Active mask scratch (reused across nodes; size n_total bytes).
  const mask = new Uint8Array(n_total);

  // Pre-extracted scratch for "active-in-feature-order" walks; reused per
  // node so we don't allocate inside the loop. Two parallel arrays:
  //   active_x: Float64Array of feature values (in sorted order)
  //   active_y: Float64Array of label / target values (in sorted order)
  const active_x = new Float64Array(n_total);
  const active_y = new Float64Array(n_total);

  // Parallel-array tree being built. Grow lazily as a JS array of node
  // descriptors; convert to typed arrays at the end.
  const nodes = [];
  // Worklist of pending nodes: { node_id, indices, depth }.
  // We push children right-after-left so leftmost gets popped first
  // (gives a sane, reproducible left-leaning traversal).
  const work = [];

  // Initialize root indices.
  const root_indices = new Int32Array(n_total);
  for (let i = 0; i < n_total; i++) root_indices[i] = i;
  nodes.push(_emptyNode_tree());
  work.push({ node_id: 0, indices: root_indices, depth: 0 });

  while (work.length) {
    const { node_id, indices, depth } = work.pop();
    const n = indices.length;

    // Compute node statistics.
    const stats = _computeNodeStats_tree(y, indices, n, n_classes, mode);
    nodes[node_id].n_samples = n;
    nodes[node_id].impurity = stats.impurity;
    nodes[node_id].value = stats.value;  // Float64Array of length value_stride

    // Stopping conditions → leaf.
    if (depth >= max_depth || n < min_samples_split || stats.impurity === 0) continue;

    // Build active mask for this node.
    for (let i = 0; i < n_total; i++) mask[i] = 0;
    for (let i = 0; i < n; i++) mask[indices[i]] = 1;

    // Choose features (random subsample if max_features < m).
    const features = _chooseFeatures_tree(m, max_features, rng);

    let best_gain = 0;
    let best_feature = -1;
    let best_threshold = NaN;
    let best_l_impurity = 0;
    let best_r_impurity = 0;
    let best_n_left = 0;

    for (const f of features) {
      // Walk sorted_idx[f], filter by mask, into active_x / active_y.
      const sx = sorted_idx[f];
      let len = 0;
      for (let p = 0; p < n_total; p++) {
        const i = sx[p];
        if (mask[i]) {
          active_x[len] = Xd[i * m + f];
          active_y[len] = y[i];
          len++;
        }
      }
      if (len < 2) continue;

      // splitter='random' (ExtraTrees-style): one random threshold per
      // feature, evaluate the resulting split. Way faster than 'best'
      // (no per-position sweep), produces higher-variance trees that
      // average out well in an ensemble.
      if (splitter === 'random') {
        const f_min = active_x[0];
        const f_max = active_x[len - 1];
        if (f_min === f_max) continue;
        const r = rng ?? Math.random;
        const threshold = f_min + r() * (f_max - f_min);
        // Locate split index k = number of samples with active_x <= threshold.
        let k_split = 0;
        while (k_split < len && active_x[k_split] <= threshold) k_split++;
        const n_left = k_split;
        const n_right = len - k_split;
        if (n_left < min_samples_leaf || n_right < min_samples_leaf) continue;
        let l_imp, r_imp;
        if (mode === 'classifier') {
          const left_counts = new Float64Array(n_classes);
          const right_counts = new Float64Array(n_classes);
          for (let i = 0; i < n_left; i++) left_counts[active_y[i] | 0]++;
          for (let i = n_left; i < len; i++) right_counts[active_y[i] | 0]++;
          let l_sumsq = 0, r_sumsq = 0;
          for (let c = 0; c < n_classes; c++) {
            l_sumsq += left_counts[c] * left_counts[c];
            r_sumsq += right_counts[c] * right_counts[c];
          }
          l_imp = 1 - l_sumsq / (n_left * n_left);
          r_imp = 1 - r_sumsq / (n_right * n_right);
        } else {
          let l_sum = 0, l_sq = 0, r_sum = 0, r_sq = 0;
          for (let i = 0; i < n_left; i++) { l_sum += active_y[i]; l_sq += active_y[i] * active_y[i]; }
          for (let i = n_left; i < len; i++) { r_sum += active_y[i]; r_sq += active_y[i] * active_y[i]; }
          const l_mean = l_sum / n_left, r_mean = r_sum / n_right;
          l_imp = Math.max(0, l_sq / n_left - l_mean * l_mean);
          r_imp = Math.max(0, r_sq / n_right - r_mean * r_mean);
        }
        const weighted = (n_left * l_imp + n_right * r_imp) / n;
        const gain = stats.impurity - weighted;
        if (gain > best_gain) {
          best_gain = gain;
          best_feature = f;
          best_threshold = threshold;
          best_l_impurity = l_imp;
          best_r_impurity = r_imp;
          best_n_left = n_left;
        }
        continue;  // skip the exhaustive sweep below
      }

      // Sweep candidate splits ('best' path). Compute impurity for
      // left/right after each transition between distinct feature values.
      if (mode === 'classifier') {
        const left_counts = new Float64Array(n_classes);
        const right_counts = new Float64Array(n_classes);
        // Initialize right_counts from stats.value (which is class counts).
        for (let c = 0; c < n_classes; c++) right_counts[c] = stats.value[c];
        let n_left = 0;
        let n_right = n;
        for (let k = 0; k < len - 1; k++) {
          const cls = active_y[k] | 0;
          left_counts[cls]++;
          right_counts[cls]--;
          n_left++;
          n_right--;
          if (active_x[k] === active_x[k + 1]) continue;
          if (n_left < min_samples_leaf || n_right < min_samples_leaf) continue;
          // Gini: 1 - Σ (count/total)²
          let l_sumsq = 0, r_sumsq = 0;
          for (let c = 0; c < n_classes; c++) {
            l_sumsq += left_counts[c] * left_counts[c];
            r_sumsq += right_counts[c] * right_counts[c];
          }
          const l_imp = 1 - l_sumsq / (n_left * n_left);
          const r_imp = 1 - r_sumsq / (n_right * n_right);
          const weighted = (n_left * l_imp + n_right * r_imp) / n;
          const gain = stats.impurity - weighted;
          if (gain > best_gain) {
            best_gain = gain;
            best_feature = f;
            best_threshold = (active_x[k] + active_x[k + 1]) / 2;
            best_l_impurity = l_imp;
            best_r_impurity = r_imp;
            best_n_left = n_left;
          }
        }
      } else {
        // squared_error: maintain left/right sum and sum_sq.
        let l_sum = 0, l_sq = 0, r_sum = 0, r_sq = 0;
        for (let k = 0; k < len; k++) { r_sum += active_y[k]; r_sq += active_y[k] * active_y[k]; }
        let n_left = 0;
        let n_right = n;
        for (let k = 0; k < len - 1; k++) {
          const v = active_y[k];
          l_sum += v; l_sq += v * v;
          r_sum -= v; r_sq -= v * v;
          n_left++; n_right--;
          if (active_x[k] === active_x[k + 1]) continue;
          if (n_left < min_samples_leaf || n_right < min_samples_leaf) continue;
          const l_mean = l_sum / n_left;
          const r_mean = r_sum / n_right;
          const l_imp = Math.max(0, l_sq / n_left - l_mean * l_mean);
          const r_imp = Math.max(0, r_sq / n_right - r_mean * r_mean);
          const weighted = (n_left * l_imp + n_right * r_imp) / n;
          const gain = stats.impurity - weighted;
          if (gain > best_gain) {
            best_gain = gain;
            best_feature = f;
            best_threshold = (active_x[k] + active_x[k + 1]) / 2;
            best_l_impurity = l_imp;
            best_r_impurity = r_imp;
            best_n_left = n_left;
          }
        }
      }
    }

    if (best_feature === -1) continue;  // no useful split → leaf

    // Partition indices into left / right.
    const left_indices = new Int32Array(best_n_left);
    const right_indices = new Int32Array(n - best_n_left);
    let li = 0, ri = 0;
    for (let i = 0; i < n; i++) {
      const idx = indices[i];
      if (Xd[idx * m + best_feature] <= best_threshold) left_indices[li++] = idx;
      else right_indices[ri++] = idx;
    }
    // Sanity (defensive — partition counts should match best_n_left).
    if (li !== best_n_left) {
      // Threshold rounding edge case — equal-valued samples on the boundary.
      // Use the actual partition.
      const truncated_left = left_indices.subarray(0, li);
      const truncated_right = right_indices.subarray(0, ri);
      const left_id = nodes.length; nodes.push(_emptyNode_tree());
      const right_id = nodes.length; nodes.push(_emptyNode_tree());
      nodes[node_id].feature = best_feature;
      nodes[node_id].threshold = best_threshold;
      nodes[node_id].left = left_id;
      nodes[node_id].right = right_id;
      work.push({ node_id: right_id, indices: Int32Array.from(truncated_right), depth: depth + 1 });
      work.push({ node_id: left_id, indices: Int32Array.from(truncated_left), depth: depth + 1 });
      continue;
    }

    const left_id = nodes.length; nodes.push(_emptyNode_tree());
    const right_id = nodes.length; nodes.push(_emptyNode_tree());
    nodes[node_id].feature = best_feature;
    nodes[node_id].threshold = best_threshold;
    nodes[node_id].left = left_id;
    nodes[node_id].right = right_id;
    work.push({ node_id: right_id, indices: right_indices, depth: depth + 1 });
    work.push({ node_id: left_id, indices: left_indices, depth: depth + 1 });
  }

  // Convert to parallel arrays.
  const node_count = nodes.length;
  const children_left = new Int32Array(node_count);
  const children_right = new Int32Array(node_count);
  const feature = new Int32Array(node_count);
  const threshold = new Float64Array(node_count);
  const impurity = new Float64Array(node_count);
  const n_node_samples = new Int32Array(node_count);
  const value = new Float64Array(node_count * value_stride);
  let observed_max_depth = 0;

  // Walk depth-first to record node depth (for max_depth observation).
  const depth_arr = new Int32Array(node_count);
  const stack = [{ id: 0, d: 0 }];
  while (stack.length) {
    const { id, d } = stack.pop();
    depth_arr[id] = d;
    if (d > observed_max_depth) observed_max_depth = d;
    if (nodes[id].left !== -1) stack.push({ id: nodes[id].left, d: d + 1 });
    if (nodes[id].right !== -1) stack.push({ id: nodes[id].right, d: d + 1 });
  }

  for (let id = 0; id < node_count; id++) {
    children_left[id] = nodes[id].left;
    children_right[id] = nodes[id].right;
    feature[id] = nodes[id].feature;
    threshold[id] = nodes[id].threshold;
    impurity[id] = nodes[id].impurity;
    n_node_samples[id] = nodes[id].n_samples;
    if (nodes[id].value) {
      const v = nodes[id].value;
      const off = id * value_stride;
      for (let s = 0; s < value_stride; s++) value[off + s] = v[s];
    }
  }

  return {
    children_left, children_right, feature, threshold,
    impurity, n_node_samples, value,
    value_stride, n_outputs: 1, n_classes,
    max_depth: observed_max_depth, node_count,
  };
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _emptyNode_tree() {
  return {
    left: -1, right: -1, feature: -2, threshold: NaN,
    impurity: 0, n_samples: 0, value: null,
  };
}

// argsort one column of a row-major X.
function _argsortColumn_tree(Xd, n, m, j) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  // Plain JS sort on Int32Array uses numeric compare with our function.
  const arr = Array.from(idx);
  arr.sort((a, b) => Xd[a * m + j] - Xd[b * m + j]);
  for (let i = 0; i < n; i++) idx[i] = arr[i];
  return idx;
}

// Compute (impurity, value) for a node given its sample indices.
//   classifier: value = Float64Array of class counts (length n_classes),
//               impurity = Gini of class proportions.
//   regressor:  value = Float64Array of length 1 (the mean),
//               impurity = MSE around the mean.
function _computeNodeStats_tree(y, indices, n, n_classes, mode) {
  if (mode === 'classifier') {
    const counts = new Float64Array(n_classes);
    for (let i = 0; i < n; i++) counts[y[indices[i]] | 0]++;
    let sumsq = 0;
    for (let c = 0; c < n_classes; c++) sumsq += counts[c] * counts[c];
    const impurity = n === 0 ? 0 : 1 - sumsq / (n * n);
    return { impurity, value: counts };
  }
  // regressor
  let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const v = y[indices[i]];
    sum += v; sq += v * v;
  }
  const mean = n === 0 ? 0 : sum / n;
  const impurity = n === 0 ? 0 : Math.max(0, sq / n - mean * mean);
  const value = new Float64Array(1);
  value[0] = mean;
  return { impurity, value };
}

// Walk the tree from root for sample i. Returns the leaf node id.
function _walkTree_tree(tree, Xd, i, m) {
  let node = 0;
  while (tree.children_left[node] !== -1) {
    const f = tree.feature[node];
    const t = tree.threshold[node];
    if (Xd[i * m + f] <= t) node = tree.children_left[node];
    else node = tree.children_right[node];
  }
  return node;
}

// Resolve max_features hyperparameter to an integer count.
function _resolveMaxFeatures_tree(spec, m) {
  if (spec == null) return m;
  if (typeof spec === 'number') {
    if (Number.isInteger(spec)) return Math.max(1, Math.min(m, spec));
    // Float = fraction.
    return Math.max(1, Math.min(m, Math.floor(spec * m)));
  }
  if (spec === 'sqrt') return Math.max(1, Math.floor(Math.sqrt(m)));
  if (spec === 'log2') return Math.max(1, Math.floor(Math.log2(m)));
  if (spec === 'auto') return m;  // sklearn legacy alias
  throw new ValidationError(
    `tree: max_features must be null | int | float | 'sqrt' | 'log2'; got ${spec}`);
}

// Pick which feature indices to consider at a node. When max_features ==
// m, returns 0..m-1; otherwise samples without replacement using rng.
function _chooseFeatures_tree(m, max_features, rng) {
  if (max_features >= m) {
    const out = new Int32Array(m);
    for (let j = 0; j < m; j++) out[j] = j;
    return out;
  }
  // Reservoir-sample max_features from 0..m-1.
  const r = rng ?? Math.random;
  const all = new Int32Array(m);
  for (let j = 0; j < m; j++) all[j] = j;
  // Fisher-Yates partial shuffle: pull max_features unique entries.
  for (let i = 0; i < max_features; i++) {
    const j = i + Math.floor(r() * (m - i));
    const t = all[i]; all[i] = all[j]; all[j] = t;
  }
  return all.subarray(0, max_features);
}

// Encode unique class labels to dense ints 0..k-1. Returns {classes, encoded}
// where classes is the sorted unique label array and encoded is a
// Float64Array of length n with the integer-encoded labels.
function _encodeClasses_tree(yv) {
  const seen = new Map();  // raw → int
  const order = [];
  for (let i = 0; i < yv.length; i++) {
    const v = yv[i];
    if (!seen.has(v)) { seen.set(v, true); order.push(v); }
  }
  // Sort to get deterministic class order (sklearn convention).
  order.sort((a, b) => a - b);
  const idx = new Map();
  for (let c = 0; c < order.length; c++) idx.set(order[c], c);
  const encoded = new Float64Array(yv.length);
  for (let i = 0; i < yv.length; i++) encoded[i] = idx.get(yv[i]);
  return { classes: Float64Array.from(order), encoded };
}

// Gain-weighted feature importance, normalized to sum to 1.
// At each internal node: importance += n_node_samples * impurity -
//   left_n * left_imp - right_n * right_imp, attributed to feature[node].
function _featureImportances_tree(tree, m) {
  const imp = new Float64Array(m);
  const cl = tree.children_left;
  const cr = tree.children_right;
  for (let i = 0; i < tree.node_count; i++) {
    if (cl[i] === -1) continue;
    const f = tree.feature[i];
    const ns = tree.n_node_samples[i];
    const lns = tree.n_node_samples[cl[i]];
    const rns = tree.n_node_samples[cr[i]];
    imp[f] += ns * tree.impurity[i]
            - lns * tree.impurity[cl[i]]
            - rns * tree.impurity[cr[i]];
  }
  let total = 0;
  for (let j = 0; j < m; j++) total += imp[j];
  if (total > 0) for (let j = 0; j < m; j++) imp[j] /= total;
  return imp;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('DecisionTreeClassifier', DecisionTreeClassifier, { module: MODULE_ID_TREE });
learnRegistry.register('DecisionTreeRegressor', DecisionTreeRegressor, { module: MODULE_ID_TREE });

// ── compositional.js ──

// Compositional transforms — CLR, ILR, ALR. The pieces that justify
// @gcu/learn for assay / chemometrics / geomet workflows (SPEC §1.2).
//
// Geochemical assays are compositional data: rows sum to a constant
// (100% or 1.0) and live on the simplex. Standard linear methods on raw
// compositions are theoretically wrong (Aitchison 1986) and empirically
// misleading; the standard fix is to log-ratio transform first.
//
// Transforms:
//   - CLR (centred log-ratio):   clr(x)_i = log(x_i) - mean(log(x))
//                                Symmetric, preserves dimensionality (D out).
//                                Output rows sum to zero.
//   - ILR (isometric log-ratio): Helmert-basis projection of CLR.
//                                Outputs D-1 orthonormal coordinates.
//                                Use when distance-based methods need
//                                Euclidean coordinates (KMeans, KNN, PCA).
//   - ALR (additive log-ratio):  alr(x)_i = log(x_i / x_d)  (i ≠ d)
//                                Outputs D-1 columns, drops the
//                                denominator. Use when one component is
//                                a natural reference (e.g. SiO2).
//
// Zero handling: log(0) is undefined, so input zeros must be replaced
// before transformation. Multiplicative replacement is the default per
// Aitchison: replace zeros with 0.65 × detection_limit and rescale the
// non-zero portion of each row to preserve the unit sum. ROS (regression
// on order statistics) lands in v0.2 with BDLImputer.




const MODULE_ID_COMPOSITIONAL = '@gcu/learn.compositional';

// ────────────────────────────────────────────────────────────────────
// CLR
// ────────────────────────────────────────────────────────────────────

class CLR extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.zero_replacement = params.zero_replacement ?? 'multiplicative';
    this.detection_limit = params.detection_limit ?? 0.001;
    this._module = MODULE_ID_COMPOSITIONAL;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X, { allow_nan: false });
    const { shape } = X_info;
    this.n_features_in_ = shape[1];
    this.n_features_out_ = shape[1];
    this.detection_limit_ = _resolveDetectionLimit_compositional(
      this.detection_limit, shape[1]);
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X, { allow_nan: false });
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const replaced = this.zero_replacement === 'multiplicative'
      ? _multiplicativeReplace_compositional(data, n, m, this.detection_limit_)
      : data;
    const out = new Float64Array(n * m);
    const log_x = new Float64Array(m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      let mean_log = 0;
      for (let j = 0; j < m; j++) {
        const v = replaced[off + j];
        if (v <= 0) {
          throw new ValidationError(
            `CLR.transform: non-positive value at row ${i} col ${j}; ` +
            `enable zero_replacement='multiplicative' or pre-impute zeros.`);
        }
        const lv = Math.log(v);
        log_x[j] = lv;
        mean_log += lv;
      }
      mean_log /= m;
      for (let j = 0; j < m; j++) out[off + j] = log_x[j] - mean_log;
    }
    out.shape = [n, m];
    return out;
  }

  inverse_transform(Z) {
    // clr_inv(z) = softmax(z) per row.
    const { data, shape } = asMatrix(Z, { allow_nan: false });
    checkNFeatures(this, shape, { name: 'Z' });
    const [n, m] = shape;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      // Subtract max for numerical stability.
      let zmax = -Infinity;
      for (let j = 0; j < m; j++) if (data[off + j] > zmax) zmax = data[off + j];
      let denom = 0;
      for (let j = 0; j < m; j++) { out[off + j] = Math.exp(data[off + j] - zmax); denom += out[off + j]; }
      const inv = denom === 0 ? 0 : 1 / denom;
      for (let j = 0; j < m; j++) out[off + j] *= inv;
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(CLR.prototype, TransformerMixin);
CLR._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// ILR
// ────────────────────────────────────────────────────────────────────

class ILR extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.zero_replacement = params.zero_replacement ?? 'multiplicative';
    this.detection_limit = params.detection_limit ?? 0.001;
    this._module = MODULE_ID_COMPOSITIONAL;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X, { allow_nan: false });
    const { shape } = X_info;
    if (shape[1] < 2) {
      throw new ValidationError(
        `ILR.fit: needs at least 2 features (got ${shape[1]})`);
    }
    this.n_features_in_ = shape[1];
    this.n_features_out_ = shape[1] - 1;
    this.detection_limit_ = _resolveDetectionLimit_compositional(
      this.detection_limit, shape[1]);
    // Precompute Helmert basis V of shape (D-1) × D.
    this.helmert_ = _helmertBasis_compositional(shape[1]);
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X, { allow_nan: false });
    checkNFeatures(this, shape, { name: 'X' });
    const [n, D] = shape;
    const Dm1 = D - 1;
    const replaced = this.zero_replacement === 'multiplicative'
      ? _multiplicativeReplace_compositional(data, n, D, this.detection_limit_)
      : data;
    const V = this.helmert_;
    const out = new Float64Array(n * Dm1);
    const log_x = new Float64Array(D);
    for (let i = 0; i < n; i++) {
      const off_in = i * D;
      const off_out = i * Dm1;
      let mean_log = 0;
      for (let j = 0; j < D; j++) {
        const v = replaced[off_in + j];
        if (v <= 0) {
          throw new ValidationError(
            `ILR.transform: non-positive value at row ${i} col ${j}; ` +
            `enable zero_replacement='multiplicative' or pre-impute zeros.`);
        }
        const lv = Math.log(v);
        log_x[j] = lv;
        mean_log += lv;
      }
      mean_log /= D;
      // CLR row, then project: ilr_i = sum_j V[i, j] * clr_j
      for (let k = 0; k < Dm1; k++) {
        let acc = 0;
        const off_V = k * D;
        for (let j = 0; j < D; j++) acc += V[off_V + j] * (log_x[j] - mean_log);
        out[off_out + k] = acc;
      }
    }
    out.shape = [n, Dm1];
    return out;
  }

  inverse_transform(Z) {
    const { data, shape } = asMatrix(Z, { allow_nan: false });
    if (shape[1] !== this.n_features_out_) {
      throw new ValidationError(
        `ILR.inverse_transform: Z has ${shape[1]} columns, expected ${this.n_features_out_}`);
    }
    const [n, Dm1] = shape;
    const D = Dm1 + 1;
    const V = this.helmert_;  // (D-1) × D
    const out = new Float64Array(n * D);
    const clr_row = new Float64Array(D);
    for (let i = 0; i < n; i++) {
      const off_in = i * Dm1;
      // CLR coords = V^T * z
      for (let j = 0; j < D; j++) {
        let acc = 0;
        for (let k = 0; k < Dm1; k++) acc += V[k * D + j] * data[off_in + k];
        clr_row[j] = acc;
      }
      // softmax → composition
      const off_out = i * D;
      let zmax = -Infinity;
      for (let j = 0; j < D; j++) if (clr_row[j] > zmax) zmax = clr_row[j];
      let denom = 0;
      for (let j = 0; j < D; j++) { out[off_out + j] = Math.exp(clr_row[j] - zmax); denom += out[off_out + j]; }
      const inv = denom === 0 ? 0 : 1 / denom;
      for (let j = 0; j < D; j++) out[off_out + j] *= inv;
    }
    out.shape = [n, D];
    return out;
  }
}

Object.assign(ILR.prototype, TransformerMixin);
ILR._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// ALR
// ────────────────────────────────────────────────────────────────────

class ALR extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.zero_replacement = params.zero_replacement ?? 'multiplicative';
    this.detection_limit = params.detection_limit ?? 0.001;
    // Default: use the last column as denominator.
    this.denominator = params.denominator ?? -1;
    this._module = MODULE_ID_COMPOSITIONAL;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X, { allow_nan: false });
    const { shape } = X_info;
    if (shape[1] < 2) {
      throw new ValidationError(
        `ALR.fit: needs at least 2 features (got ${shape[1]})`);
    }
    this.n_features_in_ = shape[1];
    this.n_features_out_ = shape[1] - 1;
    let d = this.denominator;
    if (d < 0) d = shape[1] + d;  // -1 → last column
    if (d < 0 || d >= shape[1]) {
      throw new ValidationError(
        `ALR.fit: denominator=${this.denominator} out of range for ${shape[1]} features`);
    }
    this.denominator_ = d;
    this.detection_limit_ = _resolveDetectionLimit_compositional(
      this.detection_limit, shape[1]);
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X, { allow_nan: false });
    checkNFeatures(this, shape, { name: 'X' });
    const [n, D] = shape;
    const replaced = this.zero_replacement === 'multiplicative'
      ? _multiplicativeReplace_compositional(data, n, D, this.detection_limit_)
      : data;
    const d = this.denominator_;
    const Dm1 = D - 1;
    const out = new Float64Array(n * Dm1);
    for (let i = 0; i < n; i++) {
      const off_in = i * D;
      const off_out = i * Dm1;
      const v_d = replaced[off_in + d];
      if (v_d <= 0) {
        throw new ValidationError(
          `ALR.transform: non-positive denominator value at row ${i}; ` +
          `enable zero_replacement='multiplicative' or pre-impute zeros.`);
      }
      const log_d = Math.log(v_d);
      let w = 0;
      for (let j = 0; j < D; j++) {
        if (j === d) continue;
        const v = replaced[off_in + j];
        if (v <= 0) {
          throw new ValidationError(
            `ALR.transform: non-positive value at row ${i} col ${j}`);
        }
        out[off_out + w++] = Math.log(v) - log_d;
      }
    }
    out.shape = [n, Dm1];
    return out;
  }

  inverse_transform(Z) {
    const { data, shape } = asMatrix(Z, { allow_nan: false });
    if (shape[1] !== this.n_features_out_) {
      throw new ValidationError(
        `ALR.inverse_transform: Z has ${shape[1]} columns, expected ${this.n_features_out_}`);
    }
    const [n, Dm1] = shape;
    const D = Dm1 + 1;
    const d = this.denominator_;
    const out = new Float64Array(n * D);
    for (let i = 0; i < n; i++) {
      const off_in = i * Dm1;
      const off_out = i * D;
      // exp(z), and 1 at the denominator slot, then normalize.
      let denom = 1;  // contribution from the implicit 1 at slot d
      let r = 0;
      for (let j = 0; j < D; j++) {
        if (j === d) { out[off_out + j] = 1; continue; }
        const v = Math.exp(data[off_in + r++]);
        out[off_out + j] = v;
        denom += v;
      }
      const inv = 1 / denom;
      for (let j = 0; j < D; j++) out[off_out + j] *= inv;
    }
    out.shape = [n, D];
    return out;
  }
}

Object.assign(ALR.prototype, TransformerMixin);
ALR._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _resolveDetectionLimit_compositional(spec, m) {
  if (typeof spec === 'number') {
    const out = new Float64Array(m);
    out.fill(spec);
    return out;
  }
  if (Array.isArray(spec) || ArrayBuffer.isView(spec)) {
    if (spec.length !== m) {
      throw new ValidationError(
        `compositional: detection_limit array length ${spec.length} != n_features ${m}`);
    }
    const out = new Float64Array(m);
    for (let j = 0; j < m; j++) out[j] = +spec[j];
    return out;
  }
  throw new ValidationError(
    `compositional: detection_limit must be a number or array; got ${typeof spec}`);
}

// Multiplicative replacement (Martín-Fernández et al., 2003): replace
// zeros with 0.65 × detection_limit, then rescale the non-zero portion
// of the row so the sum is preserved. Returns a fresh Float64Array.
function _multiplicativeReplace_compositional(data, n, m, dl) {
  const out = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    const off = i * m;
    let row_sum = 0;
    let replaced_sum = 0;
    let nonzero_sum = 0;
    // Decide replacements + accumulate sums.
    for (let j = 0; j < m; j++) {
      const v = data[off + j];
      row_sum += v;
      if (v <= 0) {
        const r = 0.65 * dl[j];
        out[off + j] = r;
        replaced_sum += r;
      } else {
        out[off + j] = v;
        nonzero_sum += v;
      }
    }
    if (replaced_sum === 0) continue;  // no zeros to replace
    if (nonzero_sum === 0) {
      // All-zero row — leave the small replacements; they'll renormalize
      // any downstream consumer that expects unit sum.
      continue;
    }
    // Rescale non-zero entries so the row sum equals row_sum (preserving
    // the original total). Replaced entries keep their imputed values.
    const target_nonzero = row_sum - replaced_sum;
    const scale = target_nonzero / nonzero_sum;
    if (scale > 0 && Number.isFinite(scale)) {
      for (let j = 0; j < m; j++) {
        if (data[off + j] > 0) out[off + j] *= scale;
      }
    }
  }
  return out;
}

// Helmert basis V of shape (D-1) × D, row k contains the k-th contrast.
// Standard construction:
//   V[k, i] =  +1/sqrt((k+1)(k+2)),  for i ∈ 0..k
//   V[k, k+1] = -(k+1)/sqrt((k+1)(k+2))
//   V[k, i] = 0 elsewhere
// Each row has unit norm; rows are mutually orthogonal.
function _helmertBasis_compositional(D) {
  const Dm1 = D - 1;
  const V = new Float64Array(Dm1 * D);
  for (let k = 0; k < Dm1; k++) {
    const denom = Math.sqrt((k + 1) * (k + 2));
    const pos = 1 / denom;
    const neg = -(k + 1) / denom;
    const off = k * D;
    for (let i = 0; i <= k; i++) V[off + i] = pos;
    V[off + k + 1] = neg;
    // Remaining entries default to 0.
  }
  return V;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('CLR', CLR, { module: MODULE_ID_COMPOSITIONAL });
learnRegistry.register('ILR', ILR, { module: MODULE_ID_COMPOSITIONAL });
learnRegistry.register('ALR', ALR, { module: MODULE_ID_COMPOSITIONAL });

// ── pipeline.js ──

// Pipeline — sequential composition of transformers ending in any
// estimator (transformer or predictor).
//
// Sklearn-compatible (`sklearn.pipeline.Pipeline`). Same constructor
// shape (list of `[name, estimator]` tuples), same fit/transform/predict
// routing, same `set_params({'step__param': value})` dispatch (handled
// by BaseEstimator's dotted-name machinery — Pipeline doesn't need to
// override).
//
// Serialization: Pipeline opts in to a custom mimic-io codec via
// `_toMimicIo` / `_fromMimicIo` hooks (recognized by learn's dump/load
// wrappers in serialize.js). Each child estimator is dumped as a nested
// mimic-io v2 block within the params.steps array; reload reconstructs
// the chain by loading each child individually. Without this hook the
// default mimic-io walker would lose the children's class identity.


// Note: alias-renamed imports (`as _foo`) get dropped by the concat
// build, so we use the unrenamed names. They resolve to serialize.js's
// dump/load in both ESM dev and the bundled build.


const MODULE_ID_PIPELINE = '@gcu/learn.pipeline';
const MODULE_ID_COMPOSE = '@gcu/learn.compose';

// ────────────────────────────────────────────────────────────────────
// Pipeline
// ────────────────────────────────────────────────────────────────────

class Pipeline extends BaseEstimator {
  /**
   * @param {object} params
   * @param {Array<[string, object]>} params.steps — ordered chain of
   *   (name, estimator) pairs. Last step may be a predictor (has
   *   .predict) or a transformer (has .transform); earlier steps must
   *   all be transformers (have both .fit and .transform).
   */
  constructor(params = {}) {
    super();
    this.steps = params.steps ?? [];
    this._module = MODULE_ID_PIPELINE;
  }

  /** Lookup map { name → estimator } over the current steps array. */
  get named_steps() {
    const out = {};
    for (const [name, est] of this.steps) out[name] = est;
    return out;
  }

  /**
   * Pipeline.get_params(deep=true) returns the sklearn shape: `steps`
   * itself, each step under its name, and `<name>__<param>` for each
   * nested hyperparameter. Custom override because BaseEstimator's
   * convention-based scan only sees `steps` (the array) and doesn't
   * walk into it.
   */
  get_params(deep = true) {
    const out = { steps: this.steps };
    if (!deep) return out;
    for (const [name, est] of this.steps) {
      out[name] = est;
      if (typeof est?.get_params === 'function') {
        const sub = est.get_params(true);
        for (const k of Object.keys(sub)) out[`${name}__${k}`] = sub[k];
      }
    }
    return out;
  }

  /**
   * set_params accepts:
   *   - 'steps': replace the entire chain
   *   - '<step_name>': replace a single step's estimator instance
   *   - '<step_name>__<param>': dotted-name dispatch into a nested step
   */
  set_params(params) {
    if (params == null) return this;
    const stepNames = new Set(this.steps.map(([n]) => n));
    const direct = {};
    const byStep = {};
    for (const key of Object.keys(params)) {
      const idx = key.indexOf('__');
      if (idx === -1) {
        if (key === 'steps') direct.steps = params[key];
        else if (stepNames.has(key)) direct[key] = params[key];
        else throw new Error(
          `Invalid parameter '${key}' for Pipeline. Valid: ` +
          `steps, ${[...stepNames].join(', ')}.`);
      } else {
        const root = key.slice(0, idx);
        const sub = key.slice(idx + 2);
        if (!stepNames.has(root)) throw new Error(
          `Invalid parameter '${root}' for Pipeline (no such step). ` +
          `Valid steps: ${[...stepNames].join(', ')}.`);
        if (!byStep[root]) byStep[root] = {};
        byStep[root][sub] = params[key];
      }
    }
    if ('steps' in direct) this.steps = direct.steps;
    // Replace whole steps when bare-named.
    for (const name of Object.keys(direct)) {
      if (name === 'steps') continue;
      const i = this.steps.findIndex(([n]) => n === name);
      if (i !== -1) this.steps[i] = [name, direct[name]];
    }
    // Dispatch nested params.
    for (const name of Object.keys(byStep)) {
      const i = this.steps.findIndex(([n]) => n === name);
      const step = this.steps[i][1];
      if (typeof step.set_params !== 'function') {
        throw new Error(
          `Step '${name}' on Pipeline is not an estimator (no set_params)`);
      }
      step.set_params(byStep[name]);
    }
    return this;
  }

  fit(X, y, opts) {
    _validateSteps_pipeline(this.steps);
    let Xt = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      const est = this.steps[i][1];
      Xt = est.fit(Xt, y, opts).transform(Xt);
    }
    // Last step: fit only (no transform expected for predictors).
    const last = this.steps[this.steps.length - 1][1];
    last.fit(Xt, y, opts);
    // Mark fitted with at least one trailing-underscore attr.
    this.n_features_in_ = _firstFeatureCount_pipeline(X);
    // Inherit feature_names_in_ from the raw X first (covers Tables /
    // DataFrames / plain named-column objects). Fall back to the first
    // step's feature_names_in_ if the first step captured them but X
    // itself didn't carry names directly. sklearn convention:
    // pipeline-level feature_names_in_ mirrors the input column names,
    // not the post-transform ones.
    const x_names = _firstFeatureNames_pipeline(X);
    if (x_names) {
      this.feature_names_in_ = x_names;
    } else {
      const first = this.steps[0][1];
      if (first?.feature_names_in_) {
        this.feature_names_in_ = first.feature_names_in_.slice();
      }
    }
    return this;
  }

  transform(X) {
    _validateSteps_pipeline(this.steps);
    let Xt = X;
    for (const [, est] of this.steps) {
      if (typeof est.transform !== 'function') {
        throw new ValidationError(
          `Pipeline.transform: step '${_nameOf_pipeline(est)}' has no .transform; ` +
          `final step must be a transformer for transform() to apply.`);
      }
      Xt = est.transform(Xt);
    }
    return Xt;
  }

  predict(X) {
    _validateSteps_pipeline(this.steps);
    let Xt = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      Xt = this.steps[i][1].transform(Xt);
    }
    const last = this.steps[this.steps.length - 1][1];
    if (typeof last.predict !== 'function') {
      throw new ValidationError(
        `Pipeline.predict: final step '${this.steps.at(-1)[0]}' has no .predict`);
    }
    return last.predict(Xt);
  }

  predict_proba(X) {
    let Xt = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      Xt = this.steps[i][1].transform(Xt);
    }
    const last = this.steps[this.steps.length - 1][1];
    if (typeof last.predict_proba !== 'function') {
      throw new ValidationError(
        `Pipeline.predict_proba: final step '${this.steps.at(-1)[0]}' has no .predict_proba`);
    }
    return last.predict_proba(Xt);
  }

  predict_log_proba(X) {
    let Xt = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      Xt = this.steps[i][1].transform(Xt);
    }
    const last = this.steps[this.steps.length - 1][1];
    if (typeof last.predict_log_proba !== 'function') {
      throw new ValidationError(
        `Pipeline.predict_log_proba: final step '${this.steps.at(-1)[0]}' has no .predict_log_proba`);
    }
    return last.predict_log_proba(Xt);
  }

  decision_function(X) {
    let Xt = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      Xt = this.steps[i][1].transform(Xt);
    }
    const last = this.steps[this.steps.length - 1][1];
    if (typeof last.decision_function !== 'function') {
      throw new ValidationError(
        `Pipeline.decision_function: final step '${this.steps.at(-1)[0]}' has no .decision_function`);
    }
    return last.decision_function(Xt);
  }

  score(X, y, opts) {
    let Xt = X;
    for (let i = 0; i < this.steps.length - 1; i++) {
      Xt = this.steps[i][1].transform(Xt);
    }
    const last = this.steps[this.steps.length - 1][1];
    if (typeof last.score !== 'function') {
      throw new ValidationError(
        `Pipeline.score: final step '${this.steps.at(-1)[0]}' has no .score`);
    }
    return last.score(Xt, y, opts);
  }

  __sklearn_tags__() {
    const base = BaseEstimator.prototype.__sklearn_tags__.call(this);
    // Output-shape tags (estimator_type, requires_y, multioutput) come
    // from the LAST step — that's the predictor/transformer that
    // determines what fit/predict produces.
    // Input-shape tags (allow_nan, requires_positive_X) come from the
    // FIRST step — that's what receives the raw X. A Pipeline starting
    // with SimpleImputer should report allow_nan=true even if its
    // final classifier doesn't accept NaN itself.
    if (!this.steps || this.steps.length === 0) return base;
    const last = this.steps[this.steps.length - 1][1];
    const first = this.steps[0][1];
    const lastTags = typeof last?.__sklearn_tags__ === 'function'
      ? last.__sklearn_tags__() : {};
    const firstTags = typeof first?.__sklearn_tags__ === 'function'
      ? first.__sklearn_tags__() : {};
    return {
      ...base,
      ...lastTags,
      // Input-gated tags override.
      allow_nan: firstTags.allow_nan ?? lastTags.allow_nan ?? base.allow_nan,
      requires_positive_X: firstTags.requires_positive_X
        ?? lastTags.requires_positive_X ?? base.requires_positive_X,
    };
  }

  /**
   * Recursive clone — produces a fresh Pipeline with cloned children.
   * Required because the default base.clone() relies on get_params(false)
   * round-trip through the constructor, but Pipeline's `steps` contains
   * estimator instances that themselves need recursive cloning.
   */
  __sklearn_clone__() {
    const cloned = this.steps.map(([name, est]) => {
      // Each child estimator gets cloned via its own __sklearn_clone__
      // hook or the standard get_params/constructor path.
      const Ctor = est.constructor;
      const params = typeof est.get_params === 'function'
        ? est.get_params(false) : {};
      const childClone = typeof est.__sklearn_clone__ === 'function'
        ? est.__sklearn_clone__()
        : new Ctor(params);
      return [name, childClone];
    });
    return new Pipeline({ steps: cloned });
  }

  /**
   * Custom mimic-io encoder: dump each child estimator as a nested v2
   * block inside params.steps. Without this hook, mimic-io's default
   * walker would lose the children's class identity.
   */
  _toMimicIo() {
    const stepsEncoded = this.steps.map(([name, est]) => [name, dump(est)]);
    const out = {
      format: 'mimic-io',
      version: 2,
      class: 'Pipeline',
      module: this._module,
      params: { steps: stepsEncoded },
    };
    // Pipeline's own fitted state is n_features_in_ + feature_names_in_;
    // everything else load-bearing lives in the encoded children.
    if (this.n_features_in_ !== undefined) {
      out.fitted = { n_features_in_: this.n_features_in_ };
      if (this.feature_names_in_) {
        out.fitted.feature_names_in_ = this.feature_names_in_.slice();
      }
    } else {
      out.fitted = null;
    }
    return out;
  }

  /**
   * Custom mimic-io decoder: load each child estimator from its v2
   * block. Counterpart to _toMimicIo above.
   */
  static _fromMimicIo(json, opts = {}) {
    const stepsRaw = json.params?.steps ?? [];
    const steps = stepsRaw.map(([name, childBlock]) => {
      // Each childBlock is itself a mimic-io v2 dict — load it.
      const child = load(childBlock, opts);
      return [name, child];
    });
    const pipe = new Pipeline({ steps });
    if (json.fitted?.n_features_in_ !== undefined) {
      pipe.n_features_in_ = json.fitted.n_features_in_;
    }
    if (json.fitted?.feature_names_in_) {
      pipe.feature_names_in_ = json.fitted.feature_names_in_.slice();
    }
    return pipe;
  }
}

Pipeline._estimator_type = null;  // resolved at runtime via final step

// ────────────────────────────────────────────────────────────────────
// make_pipeline
// ────────────────────────────────────────────────────────────────────

/**
 * Convenience constructor: build a Pipeline from a sequence of
 * estimator instances, naming each step from its class name (lowercased,
 * with collision suffixes when the same class appears twice).
 *
 *   make_pipeline(new StandardScaler(), new DecisionTreeClassifier())
 *   // → Pipeline([['standardscaler', sc], ['decisiontreeclassifier', tree]])
 */
function make_pipeline(...estimators) {
  const counts = {};
  const steps = estimators.map(est => {
    const base = (est.constructor?.name ?? 'step').toLowerCase();
    counts[base] = (counts[base] ?? 0);
    const name = counts[base] === 0 ? base : `${base}-${counts[base]}`;
    counts[base]++;
    return [name, est];
  });
  return new Pipeline({ steps });
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _validateSteps_pipeline(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new ValidationError(`Pipeline: steps must be a non-empty array of [name, estimator] tuples`);
  }
  for (let i = 0; i < steps.length; i++) {
    const tup = steps[i];
    if (!Array.isArray(tup) || tup.length !== 2 || typeof tup[0] !== 'string') {
      throw new ValidationError(
        `Pipeline: step ${i} must be a [string, estimator] tuple; got ${JSON.stringify(tup)}`);
    }
    const est = tup[1];
    if (est == null || typeof est !== 'object') {
      throw new ValidationError(`Pipeline: step '${tup[0]}' is not an estimator`);
    }
    if (i < steps.length - 1 && typeof est.transform !== 'function') {
      throw new ValidationError(
        `Pipeline: intermediate step '${tup[0]}' has no .transform; ` +
        `every step except the last must be a transformer.`);
    }
  }
}

function _nameOf_pipeline(est) {
  return est?.constructor?.name ?? '<unknown>';
}

function _firstFeatureCount_pipeline(X) {
  if (X == null) return undefined;
  if (Array.isArray(X.shape) && X.shape.length === 2) return X.shape[1];
  if (X.data instanceof Float64Array && Array.isArray(X.shape)) return X.shape[1];
  if (Array.isArray(X) && X.length > 0 && Array.isArray(X[0])) return X[0].length;
  // sadpan Table / DataFrame / plain named-column object.
  const kind = detectTable(X);
  if (kind) return tableColumns(X, kind).length;
  return undefined;
}

// Same trio for "first column names" — used by Pipeline to inherit
// feature_names_in_ from the input when the first step doesn't set it.
function _firstFeatureNames_pipeline(X) {
  if (X == null) return null;
  if (X.feature_names) return X.feature_names.slice();
  if (X instanceof Float64Array && X.feature_names) return X.feature_names.slice();
  const kind = detectTable(X);
  if (kind) return tableColumns(X, kind).slice();
  return null;
}

// ────────────────────────────────────────────────────────────────────
// ColumnTransformer
// ────────────────────────────────────────────────────────────────────

/**
 * Apply different transformers to different columns of X, then
 * horizontally stack the results.
 *
 * Constructor:
 *   new ColumnTransformer({
 *     transformers: [
 *       ['numeric', new StandardScaler(), [0, 1, 2]],
 *       ['categorical', new OneHotEncoder(), [3, 4]],
 *     ],
 *     remainder: 'drop' | 'passthrough',     // default 'drop'
 *   })
 *
 * Column selectors are integer arrays of column indices in v0.1
 * (string column names defer to sadpan integration). Output is the
 * concatenation of each transformer's transform(X[:, cols]) in
 * declaration order, optionally followed by the remainder columns.
 *
 * fit_transform routes through each step's fit_transform when defined
 * (avoids redundant double-fit cost).
 *
 * inverse_transform is intentionally not provided — it's not unique in
 * general (which dropped/added/reshaped columns came from where?). For
 * the special case where every transformer preserves column count and
 * order, inverse_transform per-step is straightforward and the user
 * can roll their own.
 */
class ColumnTransformer extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.transformers = params.transformers ?? [];
    this.remainder = params.remainder ?? 'drop';
    this._module = MODULE_ID_COMPOSE;
  }

  get named_transformers_() {
    const out = {};
    for (const [name, t] of this.transformers) out[name] = t;
    return out;
  }

  fit(X, y, opts) {
    _validateColumnTransformers_pipeline(this.transformers);
    const shape = _shapeOf_pipeline(X);
    this.n_features_in_ = shape[1];
    const x_names = _firstFeatureNames_pipeline(X);
    if (x_names) this.feature_names_in_ = x_names;
    const used = new Set();
    for (const [name, t, cols] of this.transformers) {
      _validateCols_pipeline(cols, shape[1], name);
      for (const c of cols) used.add(c);
      t.fit(_gatherCols_pipeline(X, shape, cols), y, opts);
    }
    if (this.remainder === 'passthrough') {
      this._remainder_cols_ = [];
      for (let j = 0; j < shape[1]; j++) if (!used.has(j)) this._remainder_cols_.push(j);
    } else if (this.remainder !== 'drop') {
      throw new ValidationError(
        `ColumnTransformer: remainder='${this.remainder}' must be 'drop' | 'passthrough'`);
    }
    return this;
  }

  transform(X) {
    if (this.n_features_in_ === undefined) {
      throw new ValidationError('ColumnTransformer: not fitted');
    }
    const shape = _shapeOf_pipeline(X);
    const blocks = [];
    for (const [, t, cols] of this.transformers) {
      blocks.push(t.transform(_gatherCols_pipeline(X, shape, cols)));
    }
    if (this.remainder === 'passthrough' && this._remainder_cols_?.length) {
      blocks.push(_gatherColsNumeric_pipeline(X, shape, this._remainder_cols_));
    }
    return _hstack_pipeline(blocks, shape[0]);
  }

  /**
   * Output feature names: each transformer's `get_feature_names_out` (or a
   * synthesized `name__x0`, `name__x1`, ... fallback for transformers without
   * one) prefixed by `<transformer_name>__`. Remainder columns use their
   * input names if available, else `remainder__x<j>`.
   */
  get_feature_names_out(input_features = null) {
    if (this.n_features_in_ === undefined) {
      throw new ValidationError('ColumnTransformer: not fitted');
    }
    const x_names = input_features ?? this.feature_names_in_;
    const inputNameOf = (j) => x_names?.[j] ?? `x${j}`;
    const out = [];
    for (const [name, t, cols] of this.transformers) {
      let sub_names;
      if (typeof t.get_feature_names_out === 'function') {
        const sub_in = cols.map(inputNameOf);
        sub_names = t.get_feature_names_out(sub_in);
      } else {
        // No get_feature_names_out — fall back to passthrough-shaped names
        // using the slice's input names.
        sub_names = cols.map(inputNameOf);
      }
      for (const sn of sub_names) out.push(`${name}__${sn}`);
    }
    if (this.remainder === 'passthrough' && this._remainder_cols_?.length) {
      for (const j of this._remainder_cols_) {
        out.push(`remainder__${inputNameOf(j)}`);
      }
    }
    return out;
  }

  fit_transform(X, y, opts) {
    _validateColumnTransformers_pipeline(this.transformers);
    const shape = _shapeOf_pipeline(X);
    this.n_features_in_ = shape[1];
    const x_names = _firstFeatureNames_pipeline(X);
    if (x_names) this.feature_names_in_ = x_names;
    const used = new Set();
    const blocks = [];
    for (const [name, t, cols] of this.transformers) {
      _validateCols_pipeline(cols, shape[1], name);
      for (const c of cols) used.add(c);
      const slice = _gatherCols_pipeline(X, shape, cols);
      const out = typeof t.fit_transform === 'function'
        ? t.fit_transform(slice, y, opts)
        : t.fit(slice, y, opts).transform(slice);
      blocks.push(out);
    }
    if (this.remainder === 'passthrough') {
      this._remainder_cols_ = [];
      for (let j = 0; j < shape[1]; j++) if (!used.has(j)) this._remainder_cols_.push(j);
      if (this._remainder_cols_.length) {
        blocks.push(_gatherColsNumeric_pipeline(X, shape, this._remainder_cols_));
      }
    } else if (this.remainder !== 'drop') {
      throw new ValidationError(
        `ColumnTransformer: remainder='${this.remainder}' must be 'drop' | 'passthrough'`);
    }
    return _hstack_pipeline(blocks, shape[0]);
  }

  __sklearn_clone__() {
    const cloned = this.transformers.map(([name, t, cols]) => {
      const Ctor = t.constructor;
      const params = typeof t.get_params === 'function' ? t.get_params(false) : {};
      const tc = typeof t.__sklearn_clone__ === 'function'
        ? t.__sklearn_clone__()
        : new Ctor(params);
      return [name, tc, [...cols]];
    });
    return new ColumnTransformer({ transformers: cloned, remainder: this.remainder });
  }

  _toMimicIo() {
    const transformersEncoded = this.transformers.map(
      ([name, t, cols]) => [name, dump(t), Array.from(cols)],
    );
    const out = {
      format: 'mimic-io',
      version: 2,
      class: 'ColumnTransformer',
      module: this._module,
      params: {
        transformers: transformersEncoded,
        remainder: this.remainder,
      },
    };
    if (this.n_features_in_ !== undefined) {
      out.fitted = {
        n_features_in_: this.n_features_in_,
        _remainder_cols_: this._remainder_cols_ ?? null,
      };
      if (this.feature_names_in_) {
        out.fitted.feature_names_in_ = this.feature_names_in_.slice();
      }
    } else {
      out.fitted = null;
    }
    return out;
  }

  static _fromMimicIo(json, opts = {}) {
    const transformers = (json.params?.transformers ?? []).map(
      ([name, childBlock, cols]) => [name, load(childBlock, opts), [...cols]],
    );
    const ct = new ColumnTransformer({
      transformers,
      remainder: json.params?.remainder ?? 'drop',
    });
    if (json.fitted?.n_features_in_ !== undefined) {
      ct.n_features_in_ = json.fitted.n_features_in_;
      if (json.fitted._remainder_cols_) ct._remainder_cols_ = json.fitted._remainder_cols_;
    }
    if (json.fitted?.feature_names_in_) {
      ct.feature_names_in_ = json.fitted.feature_names_in_.slice();
    }
    return ct;
  }
}

ColumnTransformer._estimator_type = 'transformer';
Object.assign(ColumnTransformer.prototype, {
  __sklearn_tags__: function () {
    const base = BaseEstimator.prototype.__sklearn_tags__.call(this);
    return { ...base, estimator_type: 'transformer' };
  },
});

/**
 * Convenience constructor: build a ColumnTransformer from
 * `(transformer, columns)` pairs, naming each step from class name.
 *
 *   make_column_transformer(
 *     [new StandardScaler(), [0, 1, 2]],
 *     [new OneHotEncoder(), [3, 4]],
 *   )
 */
function make_column_transformer(...pairs) {
  const counts = {};
  const transformers = pairs.map(([t, cols]) => {
    if (!Array.isArray(cols)) {
      throw new ValidationError(
        `make_column_transformer: each pair must be [transformer, columns]; got ${typeof cols}`);
    }
    const base = (t.constructor?.name ?? 'step').toLowerCase();
    counts[base] = (counts[base] ?? 0);
    const name = counts[base] === 0 ? base : `${base}-${counts[base]}`;
    counts[base]++;
    return [name, t, cols];
  });
  return new ColumnTransformer({ transformers });
}

// ────────────────────────────────────────────────────────────────────
// ColumnTransformer helpers
// ────────────────────────────────────────────────────────────────────

function _validateColumnTransformers_pipeline(transformers) {
  if (!Array.isArray(transformers)) {
    throw new ValidationError(
      `ColumnTransformer: transformers must be an array of [name, est, cols] tuples`);
  }
  for (let i = 0; i < transformers.length; i++) {
    const tup = transformers[i];
    if (!Array.isArray(tup) || tup.length !== 3 || typeof tup[0] !== 'string') {
      throw new ValidationError(
        `ColumnTransformer: transformer ${i} must be [name, est, cols]; got ${JSON.stringify(tup)}`);
    }
  }
}

function _validateCols_pipeline(cols, m, name) {
  if (!Array.isArray(cols) && !(ArrayBuffer.isView(cols) && !(cols instanceof DataView))) {
    throw new ValidationError(
      `ColumnTransformer: '${name}' columns must be an array of int indices`);
  }
  for (const c of cols) {
    if (!Number.isInteger(c) || c < 0 || c >= m) {
      throw new ValidationError(
        `ColumnTransformer: '${name}' column index ${c} out of range [0, ${m})`);
    }
  }
}

// Determine [n, m] for any supported X shape without coercing to numeric
// (so mixed-type inputs survive ColumnTransformer's column routing).
function _shapeOf_pipeline(X) {
  if (X == null) throw new ValidationError('ColumnTransformer: X is null');
  if (X.data instanceof Float64Array && Array.isArray(X.shape) && X.shape.length === 2) {
    return X.shape;
  }
  if (X instanceof Float64Array && Array.isArray(X.shape) && X.shape.length === 2) {
    return X.shape;
  }
  if (Array.isArray(X) && X.length > 0 && Array.isArray(X[0])) {
    return [X.length, X[0].length];
  }
  // sadpan Table / DataFrame / plain named-column object.
  const kind = detectTable(X);
  if (kind) return [tableNumRows(X, kind), tableColumns(X, kind).length];
  throw new ValidationError(
    `ColumnTransformer: X must be a 2D nested array, Float64Array with .shape, or a sadpan Table/DataFrame`);
}

// Slice columns. Preserves arbitrary value types when X is a 2D nested
// array (returns 2D nested array), uses the numeric fast path when X is
// a Float64Array (returns Float64Array.shape).
function _gatherCols_pipeline(X, shape, cols) {
  const [n] = shape;
  const k = cols.length;
  if (Array.isArray(X) && Array.isArray(X[0])) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Array(k);
      for (let c = 0; c < k; c++) row[c] = X[i][cols[c]];
      out[i] = row;
    }
    return out;
  }
  // Sadpan tables: extract by column-name, preserving raw types.
  const kind = detectTable(X);
  if (kind) {
    const names = tableColumns(X, kind);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = new Array(k);
    for (let c = 0; c < k; c++) {
      const col = tableColumn(X, kind, names[cols[c]]);
      for (let i = 0; i < n; i++) out[i][c] = col[i];
    }
    return out;
  }
  return _gatherColsNumeric_pipeline(X, shape, cols);
}

// Numeric column slicing (Float64Array output). Used for the
// remainder='passthrough' path. Accepts 2D nested arrays (coerces each
// value to number) or Float64Array.shape (direct gather).
function _gatherColsNumeric_pipeline(X, shape, cols) {
  const [n, m] = shape;
  const k = cols.length;
  const out = new Float64Array(n * k);
  if (Array.isArray(X) && Array.isArray(X[0])) {
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) out[i * k + c] = +X[i][cols[c]];
    }
  } else if (detectTable(X)) {
    const kind = detectTable(X);
    const names = tableColumns(X, kind);
    for (let c = 0; c < k; c++) {
      const col = tableColumn(X, kind, names[cols[c]]);
      for (let i = 0; i < n; i++) out[i * k + c] = +col[i];
    }
  } else {
    const data = X.data ?? X;
    for (let i = 0; i < n; i++) {
      const off_in = i * m;
      const off_out = i * k;
      for (let c = 0; c < k; c++) out[off_out + c] = +data[off_in + cols[c]];
    }
  }
  out.shape = [n, k];
  return out;
}

function _hstack_pipeline(blocks, n) {
  let total = 0;
  for (const b of blocks) {
    const w = b.shape ? b.shape[1] : (b.data?.shape?.[1] ?? 0);
    total += w;
  }
  const out = new Float64Array(n * total);
  let col_off = 0;
  for (const b of blocks) {
    const data = b.data ?? b;
    const w = b.shape ? b.shape[1] : 0;
    for (let i = 0; i < n; i++) {
      const off_in = i * w;
      const off_out = i * total + col_off;
      for (let c = 0; c < w; c++) out[off_out + c] = data[off_in + c];
    }
    col_off += w;
  }
  out.shape = [n, total];
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('Pipeline', Pipeline, { module: MODULE_ID_PIPELINE });
learnRegistry.register('ColumnTransformer', ColumnTransformer, { module: MODULE_ID_COMPOSE });

// ── cluster.js ──

// Clustering — KMeans + AgglomerativeClustering.
//
// Sklearn-compatible at the contract level (`sklearn.cluster.KMeans`,
// `sklearn.cluster.AgglomerativeClustering`). Same hyperparameter
// names, fitted-attribute names, and result conventions. KMeans
// follows @gcu/line discipline (SPEC §6.4): typed arrays for X /
// centroids / labels, monomorphic scalar accumulators, no allocations
// in the assign or update hot paths.
//
// Performance notes (per SPEC §6.1):
//   - KMeans assign step is n × k squared-distance — the textbook tight
//     loop. We use the row-major X with stride-m gathers; centroid
//     state stays in a Float64Array of length k*m.
//   - AgglomerativeClustering uses Lance-Williams updates over a flat
//     n×n distance matrix (O(n²) memory). Acceptable up to n ≈ 5000
//     in browser memory; above that, sklearn's nearest-neighbour-graph
//     variant is the right answer (deferred until a workflow demands it).





// Cross-package: scitra's KDTree for the eps-radius queries DBSCAN needs.

const MODULE_ID_CLUSTER = '@gcu/learn.cluster';

// ────────────────────────────────────────────────────────────────────
// KMeans
// ────────────────────────────────────────────────────────────────────

class KMeans extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_clusters = params.n_clusters ?? 8;
    this.init = params.init ?? 'k-means++';
    this.n_init = params.n_init ?? 10;
    this.max_iter = params.max_iter ?? 300;
    this.tol = params.tol ?? 1e-4;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_CLUSTER;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < this.n_clusters) {
      throw new ValidationError(
        `KMeans: n_clusters=${this.n_clusters} > n_samples=${n}`);
    }
    const k = this.n_clusters;
    // Run the algorithm n_init times with different seeds, keep the
    // best (lowest inertia) result. Seeds derive from random_state so
    // the whole fit is reproducible.
    const baseSeed = this.random_state == null
      ? Math.floor(Math.random() * 0x7fffffff)
      : this.random_state;
    let best = null;
    for (let trial = 0; trial < this.n_init; trial++) {
      const rng = mulberry32(baseSeed + trial);
      const centroids = this._initCentroids(data, n, m, k, rng);
      const result = _lloyd_cluster(data, n, m, k, centroids, this.max_iter, this.tol);
      if (best == null || result.inertia < best.inertia) best = result;
    }
    this.cluster_centers_ = best.centroids;
    this.cluster_centers_.shape = [k, m];
    this.labels_ = best.labels;
    this.inertia_ = best.inertia;
    this.n_iter_ = best.n_iter;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    const { data, shape } = asMatrix(X);
    if (this.cluster_centers_ == null) {
      throw new ValidationError('KMeans: not fitted');
    }
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_clusters;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best_d = Infinity, best_c = 0;
      const off_x = i * m;
      for (let c = 0; c < k; c++) {
        const off_c = c * m;
        let d = 0;
        for (let j = 0; j < m; j++) {
          const diff = data[off_x + j] - this.cluster_centers_[off_c + j];
          d += diff * diff;
        }
        if (d < best_d) { best_d = d; best_c = c; }
      }
      out[i] = best_c;
    }
    return out;
  }

  transform(X) {
    // Distance matrix to each centroid (sklearn's KMeans.transform).
    const { data, shape } = asMatrix(X);
    if (this.cluster_centers_ == null) {
      throw new ValidationError('KMeans: not fitted');
    }
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_clusters;
    const out = new Float64Array(n * k);
    for (let i = 0; i < n; i++) {
      const off_x = i * m;
      for (let c = 0; c < k; c++) {
        const off_c = c * m;
        let d = 0;
        for (let j = 0; j < m; j++) {
          const diff = data[off_x + j] - this.cluster_centers_[off_c + j];
          d += diff * diff;
        }
        out[i * k + c] = Math.sqrt(d);
      }
    }
    out.shape = [n, k];
    return out;
  }

  /** Initialize centroids per the chosen strategy. */
  _initCentroids(data, n, m, k, rng) {
    const init = this.init;
    if (init === 'random') {
      // Sample k distinct rows uniformly.
      const idx = _sampleWithoutReplacement_cluster(n, k, rng);
      const centroids = new Float64Array(k * m);
      for (let c = 0; c < k; c++) {
        const src = idx[c] * m;
        const dst = c * m;
        for (let j = 0; j < m; j++) centroids[dst + j] = data[src + j];
      }
      return centroids;
    }
    if (init === 'k-means++') return _kmeansPlusPlusInit_cluster(data, n, m, k, rng);
    if (Array.isArray(init) || init instanceof Float64Array) {
      // Allow user-supplied initial centroids (k × m).
      const arr = init instanceof Float64Array ? init
        : Float64Array.from(Array.isArray(init[0]) ? init.flat() : init);
      if (arr.length !== k * m) {
        throw new ValidationError(
          `KMeans: init array length ${arr.length} != n_clusters*n_features (${k*m})`);
      }
      return arr;
    }
    throw new ValidationError(
      `KMeans: init='${init}' must be 'k-means++' | 'random' | array`);
  }
}

Object.assign(KMeans.prototype, ClusterMixin);
KMeans._estimator_type = 'clusterer';

// ────────────────────────────────────────────────────────────────────
// Lloyd's algorithm (KMeans inner loop)
// ────────────────────────────────────────────────────────────────────

function _lloyd_cluster(data, n, m, k, centroids_init, max_iter, tol) {
  const centroids = new Float64Array(centroids_init);
  const labels = new Float64Array(n);
  const sums = new Float64Array(k * m);     // accumulator for update step
  const counts = new Int32Array(k);          // samples per cluster
  let prev_inertia = Infinity;
  let inertia = 0;
  let iter = 0;
  for (iter = 0; iter < max_iter; iter++) {
    // ── Assign step ──
    inertia = 0;
    for (let i = 0; i < n; i++) {
      let best_d = Infinity, best_c = 0;
      const off_x = i * m;
      for (let c = 0; c < k; c++) {
        const off_c = c * m;
        let d = 0;
        for (let j = 0; j < m; j++) {
          const diff = data[off_x + j] - centroids[off_c + j];
          d += diff * diff;
        }
        if (d < best_d) { best_d = d; best_c = c; }
      }
      labels[i] = best_c;
      inertia += best_d;
    }
    // ── Convergence check ──
    // Skip on iter 0 — prev_inertia is +Infinity then, and the
    // tolerance comparison incorrectly satisfies on Infinity arithmetic.
    if (iter > 0 && Math.abs(prev_inertia - inertia)
                    <= tol * Math.max(1, Math.abs(prev_inertia))) {
      break;
    }
    prev_inertia = inertia;
    // ── Update step ──
    for (let s = 0; s < sums.length; s++) sums[s] = 0;
    for (let c = 0; c < k; c++) counts[c] = 0;
    for (let i = 0; i < n; i++) {
      const c = labels[i] | 0;
      counts[c]++;
      const off_x = i * m;
      const off_s = c * m;
      for (let j = 0; j < m; j++) sums[off_s + j] += data[off_x + j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;  // empty cluster — leave centroid in place
      const inv = 1 / counts[c];
      const off = c * m;
      for (let j = 0; j < m; j++) centroids[off + j] = sums[off + j] * inv;
    }
  }
  return { centroids, labels, inertia, n_iter: iter + 1 };
}

// ────────────────────────────────────────────────────────────────────
// k-means++ initialization
// ────────────────────────────────────────────────────────────────────

function _kmeansPlusPlusInit_cluster(data, n, m, k, rng) {
  const centroids = new Float64Array(k * m);
  // Pick first center uniformly at random.
  const i0 = Math.floor(rng() * n);
  for (let j = 0; j < m; j++) centroids[j] = data[i0 * m + j];
  // For each subsequent center, sample with probability ∝ squared
  // distance to the nearest existing centroid.
  const min_d2 = new Float64Array(n);
  for (let i = 0; i < n; i++) min_d2[i] = Infinity;
  _updateMinD2_cluster(min_d2, data, n, m, centroids, 0);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) total += min_d2[i];
    let r = rng() * total;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      r -= min_d2[i];
      if (r <= 0) { pick = i; break; }
    }
    for (let j = 0; j < m; j++) centroids[c * m + j] = data[pick * m + j];
    _updateMinD2_cluster(min_d2, data, n, m, centroids, c);
  }
  return centroids;
}

function _updateMinD2_cluster(min_d2, data, n, m, centroids, c) {
  const off_c = c * m;
  for (let i = 0; i < n; i++) {
    const off_x = i * m;
    let d = 0;
    for (let j = 0; j < m; j++) {
      const diff = data[off_x + j] - centroids[off_c + j];
      d += diff * diff;
    }
    if (d < min_d2[i]) min_d2[i] = d;
  }
}

function _sampleWithoutReplacement_cluster(n, k, rng) {
  const out = new Int32Array(k);
  const all = new Int32Array(n);
  for (let i = 0; i < n; i++) all[i] = i;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const t = all[i]; all[i] = all[j]; all[j] = t;
    out[i] = all[i];
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// AgglomerativeClustering
// ────────────────────────────────────────────────────────────────────

class AgglomerativeClustering extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_clusters = params.n_clusters ?? 2;
    this.linkage = params.linkage ?? 'ward';
    this.metric = params.metric ?? 'euclidean';
    this._module = MODULE_ID_CLUSTER;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < this.n_clusters) {
      throw new ValidationError(
        `AgglomerativeClustering: n_clusters=${this.n_clusters} > n_samples=${n}`);
    }
    if (this.metric !== 'euclidean') {
      throw new ValidationError(
        `AgglomerativeClustering: metric='${this.metric}' not supported in v0.1 (use 'euclidean')`);
    }
    const linkage_idx = ['single', 'complete', 'average', 'ward'].indexOf(this.linkage);
    if (linkage_idx === -1) {
      throw new ValidationError(
        `AgglomerativeClustering: linkage='${this.linkage}' must be 'ward' | 'single' | 'complete' | 'average'`);
    }
    this.labels_ = _agglomerative_cluster(data, n, m, this.n_clusters, this.linkage);
    this.n_clusters_ = this.n_clusters;
    this.n_leaves_ = n;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }
}

Object.assign(AgglomerativeClustering.prototype, ClusterMixin);
AgglomerativeClustering._estimator_type = 'clusterer';

// ────────────────────────────────────────────────────────────────────
// Lance-Williams agglomerative algorithm
// ────────────────────────────────────────────────────────────────────
//
// Maintains a flat n×n distance matrix (only the upper triangle is
// meaningful; the diagonal is +Inf to avoid self-merges). For Ward
// linkage we work with squared distances so the update formula stays
// linear in the squared inputs:
//
//   d²(merged, k) = ((|A|+|k|) d²(A,k) + (|B|+|k|) d²(B,k) - |k| d²(A,B))
//                   / (|A|+|B|+|k|)
//
// For 'single'/'complete'/'average' we work with raw distances and
// apply min/max/weighted-mean respectively.

function _agglomerative_cluster(data, n, m, n_clusters, linkage) {
  const ward = linkage === 'ward';
  const D = new Float64Array(n * n);
  // Initialize pairwise distances. Upper triangle holds d (or d² for ward);
  // the diagonal stays at +Inf so it never wins a min query.
  for (let i = 0; i < n; i++) D[i * n + i] = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let d2 = 0;
      const off_i = i * m;
      const off_j = j * m;
      for (let k = 0; k < m; k++) {
        const diff = data[off_i + k] - data[off_j + k];
        d2 += diff * diff;
      }
      const v = ward ? d2 : Math.sqrt(d2);
      D[i * n + j] = v;
      D[j * n + i] = v;
    }
  }
  const sizes = new Int32Array(n);
  for (let i = 0; i < n; i++) sizes[i] = 1;
  // membership[i] = current cluster id for original sample i (root id).
  const membership = new Int32Array(n);
  for (let i = 0; i < n; i++) membership[i] = i;
  // alive[i] is 1 if cluster i still exists.
  const alive = new Uint8Array(n);
  alive.fill(1);

  let n_active = n;
  while (n_active > n_clusters) {
    // Find the closest pair (a, b) with a < b among alive clusters.
    let best = Infinity, ba = -1, bb = -1;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue;
        const v = D[i * n + j];
        if (v < best) { best = v; ba = i; bb = j; }
      }
    }
    if (ba === -1) break;  // no merges left

    // Merge bb into ba.
    const sa = sizes[ba], sb = sizes[bb];
    for (let i = 0; i < n; i++) {
      if (membership[i] === bb) membership[i] = ba;
    }
    sizes[ba] = sa + sb;

    // Lance-Williams update for distances from the merged cluster.
    for (let kk = 0; kk < n; kk++) {
      if (!alive[kk] || kk === ba || kk === bb) continue;
      const sk = sizes[kk];
      const dak = D[ba * n + kk];
      const dbk = D[bb * n + kk];
      const dab = D[ba * n + bb];
      let dnew;
      if (linkage === 'single')   dnew = Math.min(dak, dbk);
      else if (linkage === 'complete') dnew = Math.max(dak, dbk);
      else if (linkage === 'average')  dnew = (sa * dak + sb * dbk) / (sa + sb);
      else /* ward */ {
        // Squared-distance update.
        dnew = ((sa + sk) * dak + (sb + sk) * dbk - sk * dab) / (sa + sb + sk);
      }
      D[ba * n + kk] = dnew;
      D[kk * n + ba] = dnew;
    }
    alive[bb] = 0;
    n_active--;
  }

  // Relabel surviving clusters to 0..n_clusters-1.
  const label_map = new Map();
  let next = 0;
  const labels = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = membership[i];
    if (!label_map.has(c)) label_map.set(c, next++);
    labels[i] = label_map.get(c);
  }
  return labels;
}

// ────────────────────────────────────────────────────────────────────
// DBSCAN
// ────────────────────────────────────────────────────────────────────

/**
 * Density-Based Spatial Clustering of Applications with Noise.
 *
 * Hyperparameters:
 *   - eps          (number, default 0.5) — radius of the neighborhood
 *   - min_samples  (int,    default 5)   — points required to form a core
 *   - metric       'euclidean'           (only one in v0.2)
 *
 * Fitted attributes:
 *   - labels_                (Float64Array, n) — cluster id 0..k-1, or -1 for noise
 *   - core_sample_indices_   (Int32Array)      — indices of core points
 *   - components_            (Float64Array)    — coordinates of core points
 *   - n_features_in_
 *
 * Algorithm: standard DBSCAN. Builds a KDTree over X for fast
 * eps-radius neighbor queries (scitra.query_ball_point), then BFS-
 * expands clusters from core points. fit-only — sklearn's DBSCAN has no
 * predict method either.
 */
class DBSCAN extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.eps = params.eps ?? 0.5;
    this.min_samples = params.min_samples ?? 5;
    this.metric = params.metric ?? 'euclidean';
    this._module = MODULE_ID_CLUSTER;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (this.metric !== 'euclidean') {
      throw new ValidationError(
        `DBSCAN: metric='${this.metric}' not supported in v0.2 (use 'euclidean')`);
    }
    if (this.eps <= 0) {
      throw new ValidationError(`DBSCAN: eps=${this.eps} must be > 0`);
    }
    // Build KDTree.
    const points = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Array(m);
      for (let j = 0; j < m; j++) row[j] = data[i * m + j];
      points[i] = row;
    }
    const tree = new KDTree(points);
    // Pre-compute eps-neighbors for each point (kept for the BFS).
    const neighbors = new Array(n);
    const isCore = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const idx = tree.query_ball_point(points[i], this.eps);
      neighbors[i] = idx;
      if (idx.length >= this.min_samples) isCore[i] = 1;
    }
    // Assign cluster labels via BFS from each unvisited core point.
    const labels = new Float64Array(n);
    labels.fill(-1);
    let cluster_id = 0;
    const queue = [];
    for (let i = 0; i < n; i++) {
      if (labels[i] !== -1 || !isCore[i]) continue;
      // Start a new cluster.
      labels[i] = cluster_id;
      queue.length = 0;
      for (const j of neighbors[i]) if (j !== i) queue.push(j);
      while (queue.length > 0) {
        const j = queue.pop();
        if (labels[j] === -1) labels[j] = cluster_id;
        else if (labels[j] !== cluster_id) continue;  // already in another cluster
        if (isCore[j]) {
          // Add j's neighbors not yet in this cluster.
          for (const k of neighbors[j]) {
            if (labels[k] !== cluster_id) queue.push(k);
          }
        }
      }
      cluster_id++;
    }
    // Expose core sample data.
    const core_arr = [];
    for (let i = 0; i < n; i++) if (isCore[i]) core_arr.push(i);
    const core_indices = Int32Array.from(core_arr);
    const components = new Float64Array(core_indices.length * m);
    for (let i = 0; i < core_indices.length; i++) {
      const src = core_indices[i] * m;
      const dst = i * m;
      for (let j = 0; j < m; j++) components[dst + j] = data[src + j];
    }
    components.shape = [core_indices.length, m];
    this.labels_ = labels;
    this.core_sample_indices_ = core_indices;
    this.components_ = components;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }
}

Object.assign(DBSCAN.prototype, ClusterMixin);
DBSCAN._estimator_type = 'clusterer';

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('KMeans', KMeans, { module: MODULE_ID_CLUSTER });
learnRegistry.register('AgglomerativeClustering', AgglomerativeClustering, { module: MODULE_ID_CLUSTER });
learnRegistry.register('DBSCAN', DBSCAN, { module: MODULE_ID_CLUSTER });

// ── decomposition.js ──

// Decomposition — PCA via @gcu/line's SVD.
//
// Sklearn-compatible at the contract level (`sklearn.decomposition.PCA`).
// Same hyperparameter names, fitted-attribute names, sign convention
// (per-component sign-flipped so the largest absolute loading is
// positive — matches sklearn).
//
// Numerical convention. Population variance (divide by n) when
// converting singular values to explained_variance_, matching sklearn's
// default since 0.20.





// Import @gcu/line for SVD. Cross-package relative path; build.js
// rewrites to '../line/index.js' for the bundle.

const MODULE_ID_DECOMP = '@gcu/learn.decomposition';

// ────────────────────────────────────────────────────────────────────
// PCA
// ────────────────────────────────────────────────────────────────────

/**
 * Principal Component Analysis via Singular Value Decomposition.
 *
 * Hyperparameters:
 *   - n_components  (int | null, default null = min(n_samples, n_features))
 *   - whiten        (bool, default false) — divide projections by
 *                   sqrt(explained_variance) so output has unit variance
 *                   per component
 *
 * Fitted attributes:
 *   - components_              (Float64Array, shape [n_components, n_features])
 *                              Each row is a principal axis. Sign-flipped
 *                              per-component so the max-magnitude entry is
 *                              positive (sklearn convention; deterministic).
 *   - explained_variance_      (Float64Array, n_components)
 *                              Variance along each principal axis.
 *   - explained_variance_ratio_(Float64Array, n_components) — fraction of total.
 *   - singular_values_         (Float64Array, n_components)
 *   - mean_                    (Float64Array, n_features)
 *   - n_components_, n_features_in_, n_samples_
 *
 * Algorithm: center X, compute SVD of centered X, take the first
 * n_components singular vectors as principal axes. Single line.svd()
 * call — no iterative refinement needed for the in-browser scale.
 */
class PCA extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_components = params.n_components ?? null;
    this.whiten = params.whiten ?? false;
    this._module = MODULE_ID_DECOMP;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 2) {
      throw new ValidationError(
        `PCA: n_samples=${n} must be >= 2 (no variance to decompose)`);
    }
    const k_max = Math.min(n, m);
    const k = this.n_components == null ? k_max
      : Math.min(this.n_components | 0, k_max);
    if (k < 1) {
      throw new ValidationError(
        `PCA: n_components=${this.n_components} resolved to ${k} (must be >= 1)`);
    }

    // Center X.
    const mean = new Float64Array(m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) mean[j] += data[off + j];
    }
    const inv_n = 1 / n;
    for (let j = 0; j < m; j++) mean[j] *= inv_n;
    const Xc = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) Xc[off + j] = data[off + j] - mean[j];
    }

    // SVD: Xc = U * diag(s) * V^T  (line returns V as [m, k_full] with
    // right singular vectors as columns).
    const Xc_nd = new NdArray(Xc, [n, m]);
    const { s, V } = svd(Xc_nd);
    const k_full = s.shape[0];
    const k_use = Math.min(k, k_full);

    // Components_: row c is the c-th right singular vector = V column c.
    // Sign flip: pick the entry with largest |.| in each component, force
    // it positive. Sklearn does this so two PCA fits agree on sign.
    const components = new Float64Array(k_use * m);
    for (let c = 0; c < k_use; c++) {
      let max_idx = 0, max_val = 0;
      for (let j = 0; j < m; j++) {
        const v = V.data[j * k_full + c];
        const av = Math.abs(v);
        if (av > max_val) { max_val = av; max_idx = j; }
      }
      const flip = V.data[max_idx * k_full + c] < 0 ? -1 : 1;
      for (let j = 0; j < m; j++) components[c * m + j] = flip * V.data[j * k_full + c];
    }
    components.shape = [k_use, m];

    // Explained variance: s² / n  (population variance — sklearn uses
    // (n-1) divisor for the "unbiased" version; we follow the more
    // recent sklearn convention of n in fit_transform path).
    const explained_variance = new Float64Array(k_use);
    for (let c = 0; c < k_use; c++) {
      explained_variance[c] = s.data[c] * s.data[c] / Math.max(1, n - 1);
    }
    // Total variance via the trace of the centred-X covariance.
    let total_var = 0;
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) total_var += Xc[off + j] * Xc[off + j];
    }
    total_var /= Math.max(1, n - 1);
    const explained_variance_ratio = new Float64Array(k_use);
    for (let c = 0; c < k_use; c++) {
      explained_variance_ratio[c] = total_var === 0 ? 0
        : explained_variance[c] / total_var;
    }
    const singular_values = new Float64Array(k_use);
    for (let c = 0; c < k_use; c++) singular_values[c] = s.data[c];

    this.components_ = components;
    this.explained_variance_ = explained_variance;
    this.explained_variance_ratio_ = explained_variance_ratio;
    this.singular_values_ = singular_values;
    this.mean_ = mean;
    this.n_components_ = k_use;
    this.n_features_in_ = m;
    this.n_samples_ = n;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X);
    if (this.components_ == null) throw new ValidationError('PCA: not fitted');
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_components_;
    const out = new Float64Array(n * k);
    for (let i = 0; i < n; i++) {
      const off_x = i * m;
      for (let c = 0; c < k; c++) {
        let acc = 0;
        const off_c = c * m;
        for (let j = 0; j < m; j++) {
          acc += (data[off_x + j] - this.mean_[j]) * this.components_[off_c + j];
        }
        out[i * k + c] = acc;
      }
    }
    if (this.whiten) {
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < k; c++) {
          const s = Math.sqrt(this.explained_variance_[c]);
          out[i * k + c] = s > 0 ? out[i * k + c] / s : 0;
        }
      }
    }
    out.shape = [n, k];
    return out;
  }

  inverse_transform(Z) {
    const { data, shape } = asMatrix(Z);
    if (this.components_ == null) throw new ValidationError('PCA: not fitted');
    if (shape[1] !== this.n_components_) {
      throw new ValidationError(
        `PCA.inverse_transform: Z has ${shape[1]} columns, expected ${this.n_components_}`);
    }
    const [n, k] = shape;
    const m = this.n_features_in_;
    const out = new Float64Array(n * m);
    // X = Z @ components_  + mean (un-whiten if applicable first).
    for (let i = 0; i < n; i++) {
      const off_z = i * k;
      const off_x = i * m;
      for (let j = 0; j < m; j++) {
        let acc = 0;
        for (let c = 0; c < k; c++) {
          let zv = data[off_z + c];
          if (this.whiten) zv *= Math.sqrt(this.explained_variance_[c]);
          acc += zv * this.components_[c * m + j];
        }
        out[off_x + j] = acc + this.mean_[j];
      }
    }
    out.shape = [n, m];
    return out;
  }

  /** Output feature names: "pc0", "pc1", ... — input_features ignored. */
  get_feature_names_out(_input_features = null) {
    if (this.components_ == null) throw new ValidationError('PCA: not fitted');
    const k = this.n_components_;
    const out = new Array(k);
    for (let i = 0; i < k; i++) out[i] = `pc${i}`;
    return out;
  }

  /** Total log-likelihood of X under the fitted Gaussian model. (Diagnostic.) */
  score_samples(X) {
    // Sklearn implements this via the probabilistic-PCA formula. For v0.1
    // we expose a simpler version: per-sample reconstruction loss.
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const Z = this.transform(X);
    const X_back = this.inverse_transform(Z);
    const n = shape[0], m = shape[1];
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const off = i * m;
      for (let j = 0; j < m; j++) {
        const d = data[off + j] - X_back[off + j];
        s += d * d;
      }
      out[i] = -s;
    }
    return out;
  }
}

Object.assign(PCA.prototype, TransformerMixin);
PCA._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// TruncatedSVD
// ────────────────────────────────────────────────────────────────────

/**
 * Like PCA but without mean-centering. Standard for LSA over tf-idf
 * matrices and any setting where the data is already non-negative or
 * sparsity-positive (centering would destroy sparsity in sklearn's
 * sparse-matrix world; here it's mostly a semantic distinction —
 * TruncatedSVD operates on raw X).
 *
 * Hyperparameters:
 *   - n_components  (int, default 2) — must be < min(n_samples, n_features)
 *
 * Fitted attributes (sklearn-shape):
 *   - components_              [n_components, n_features]
 *   - explained_variance_      Float64Array(n_components)
 *   - explained_variance_ratio_
 *   - singular_values_
 *   - n_features_in_, n_samples_
 *
 * transform = X @ components_.T (no mean subtraction).
 */
class TruncatedSVD extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_components = params.n_components ?? 2;
    this._module = MODULE_ID_DECOMP;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 2) throw new ValidationError('TruncatedSVD: n_samples must be >= 2');
    const k_max = Math.min(n, m);
    const k = Math.min(this.n_components | 0, k_max);
    if (k < 1) throw new ValidationError(
      `TruncatedSVD: n_components=${this.n_components} resolved to ${k}`);

    const X_nd = new NdArray(new Float64Array(data), [n, m]);
    const { s, V } = svd(X_nd);
    const k_full = s.shape[0];
    const k_use = Math.min(k, k_full);

    // Components_: row c is V column c with sklearn sign convention.
    const components = new Float64Array(k_use * m);
    for (let c = 0; c < k_use; c++) {
      let max_idx = 0, max_val = 0;
      for (let j = 0; j < m; j++) {
        const v = V.data[j * k_full + c];
        const av = Math.abs(v);
        if (av > max_val) { max_val = av; max_idx = j; }
      }
      const flip = V.data[max_idx * k_full + c] < 0 ? -1 : 1;
      for (let j = 0; j < m; j++) components[c * m + j] = flip * V.data[j * k_full + c];
    }
    components.shape = [k_use, m];

    const ev = new Float64Array(k_use);
    const sv = new Float64Array(k_use);
    for (let c = 0; c < k_use; c++) {
      sv[c] = s.data[c];
      ev[c] = s.data[c] * s.data[c] / Math.max(1, n - 1);
    }
    // Total variance via Frobenius norm of X (not centered).
    let total_var = 0;
    for (let i = 0; i < n * m; i++) total_var += data[i] * data[i];
    total_var /= Math.max(1, n - 1);
    const ratio = new Float64Array(k_use);
    for (let c = 0; c < k_use; c++) {
      ratio[c] = total_var === 0 ? 0 : ev[c] / total_var;
    }

    this.components_ = components;
    this.explained_variance_ = ev;
    this.explained_variance_ratio_ = ratio;
    this.singular_values_ = sv;
    this.n_components_ = k_use;
    this.n_features_in_ = m;
    this.n_samples_ = n;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    const { data, shape } = asMatrix(X);
    if (this.components_ == null) throw new ValidationError('TruncatedSVD: not fitted');
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_components_;
    const out = new Float64Array(n * k);
    for (let i = 0; i < n; i++) {
      const off_x = i * m;
      for (let c = 0; c < k; c++) {
        let acc = 0;
        const off_c = c * m;
        for (let j = 0; j < m; j++) acc += data[off_x + j] * this.components_[off_c + j];
        out[i * k + c] = acc;
      }
    }
    out.shape = [n, k];
    return out;
  }

  inverse_transform(Z) {
    const { data, shape } = asMatrix(Z);
    if (this.components_ == null) throw new ValidationError('TruncatedSVD: not fitted');
    if (shape[1] !== this.n_components_) {
      throw new ValidationError(
        `TruncatedSVD.inverse_transform: Z has ${shape[1]} columns, expected ${this.n_components_}`);
    }
    const [n, k] = shape;
    const m = this.n_features_in_;
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off_z = i * k;
      const off_x = i * m;
      for (let j = 0; j < m; j++) {
        let acc = 0;
        for (let c = 0; c < k; c++) acc += data[off_z + c] * this.components_[c * m + j];
        out[off_x + j] = acc;
      }
    }
    out.shape = [n, m];
    return out;
  }
}

Object.assign(TruncatedSVD.prototype, TransformerMixin);
TruncatedSVD._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// NMF — Non-negative Matrix Factorization
// ────────────────────────────────────────────────────────────────────

/**
 * Decompose a non-negative X into W H, both non-negative.
 *
 * Hyperparameters:
 *   - n_components   (int, default 2)
 *   - init           'random' | 'nndsvd' (default 'nndsvd')
 *   - max_iter       (int, default 200)
 *   - tol            (number, default 1e-4) — relative tolerance on Frobenius
 *   - random_state   (int|null) — only used by init='random'
 *   - beta_loss      'frobenius' (only) — KL/IS deferred
 *
 * Fitted attributes:
 *   - components_         (Float64Array, shape [n_components, n_features]) — H
 *   - n_components_, n_iter_, reconstruction_err_, n_features_in_
 *
 * Algorithm: multiplicative-update rules (Lee & Seung 2001) for the
 * Frobenius objective ‖X - WH‖²_F:
 *   W ← W ⊙ (X H^T) / (W H H^T + eps)
 *   H ← H ⊙ (W^T X) / (W^T W H + eps)
 * Update both per iteration; converge when relative change in the
 * reconstruction error drops below tol.
 *
 * `transform` solves for W given a held-out X via the multiplicative
 * update with H frozen — converges in a few iterations.
 */
class NMF extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_components = params.n_components ?? 2;
    this.init = params.init ?? 'nndsvd';
    this.max_iter = params.max_iter ?? 200;
    this.tol = params.tol ?? 1e-4;
    this.random_state = params.random_state ?? null;
    this.beta_loss = params.beta_loss ?? 'frobenius';
    this._module = MODULE_ID_DECOMP;
  }

  fit(X, _y, _opts) {
    if (this.beta_loss !== 'frobenius') {
      throw new ValidationError(
        `NMF: beta_loss='${this.beta_loss}' not supported in v0.2 (use 'frobenius')`);
    }
    this.fit_transform(X);
    return this;
  }

  fit_transform(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    // Validate non-negativity at the boundary.
    for (let i = 0; i < data.length; i++) {
      if (data[i] < 0) {
        throw new ValidationError(
          `NMF: input must be non-negative; got ${data[i]} at flat index ${i}`);
      }
    }
    const k = Math.max(1, Math.min(this.n_components | 0, Math.min(n, m)));
    let W, H;
    if (this.init === 'nndsvd') {
      ({ W, H } = _nmfNndsvdInit_decomposition(data, n, m, k));
    } else if (this.init === 'random') {
      const rng = mulberry32(this.random_state ?? Math.floor(Math.random() * 0x7fffffff));
      W = new Float64Array(n * k);
      H = new Float64Array(k * m);
      for (let i = 0; i < W.length; i++) W[i] = rng();
      for (let i = 0; i < H.length; i++) H[i] = rng();
    } else {
      throw new ValidationError(
        `NMF: init='${this.init}' must be 'random' | 'nndsvd'`);
    }
    const eps = 1e-10;
    let prev_err = Infinity;
    let iter = 0;
    let err = 0;
    for (iter = 0; iter < this.max_iter; iter++) {
      // H ← H ⊙ (W^T X) / (W^T W H + eps)
      const WtX = _matmul_decomposition(W, n, k, true, data, n, m, false);   // (k × m)
      const WtW = _matmul_decomposition(W, n, k, true, W, n, k, false);      // (k × k)
      const WtWH = _matmul_decomposition(WtW, k, k, false, H, k, m, false);  // (k × m)
      for (let i = 0; i < k * m; i++) H[i] *= WtX[i] / (WtWH[i] + eps);
      // W ← W ⊙ (X H^T) / (W H H^T + eps)
      const XHt = _matmul_decomposition(data, n, m, false, H, k, m, true);   // (n × k)
      const HHt = _matmul_decomposition(H, k, m, false, H, k, m, true);      // (k × k)
      const WHHt = _matmul_decomposition(W, n, k, false, HHt, k, k, false);  // (n × k)
      for (let i = 0; i < n * k; i++) W[i] *= XHt[i] / (WHHt[i] + eps);
      // Compute reconstruction error.
      err = _reconstructionError_decomposition(data, n, m, W, H, k);
      // Skip convergence check on iter 0: prev_err is +Infinity then,
      // and Infinity arithmetic incorrectly satisfies the tolerance.
      if (iter > 0 && Math.abs(prev_err - err) <= this.tol * Math.max(1, prev_err)) {
        iter++;
        break;
      }
      prev_err = err;
    }
    H.shape = [k, m];
    this.components_ = H;
    this.n_components_ = k;
    this.n_iter_ = iter;
    this.reconstruction_err_ = err;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    W.shape = [n, k];
    return W;
  }

  transform(X) {
    if (this.components_ == null) throw new ValidationError('NMF: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < 0) throw new ValidationError(
        `NMF.transform: input must be non-negative; got ${data[i]}`);
    }
    const k = this.n_components_;
    const H = this.components_;
    const eps = 1e-10;
    // Initialize W with column means of X / mean(H) per component.
    const W = new Float64Array(n * k);
    for (let i = 0; i < W.length; i++) W[i] = 0.5;
    // A few multiplicative updates with H frozen.
    for (let iter = 0; iter < 100; iter++) {
      const XHt = _matmul_decomposition(data, n, m, false, H, k, m, true);
      const HHt = _matmul_decomposition(H, k, m, false, H, k, m, true);
      const WHHt = _matmul_decomposition(W, n, k, false, HHt, k, k, false);
      let max_delta = 0;
      for (let i = 0; i < n * k; i++) {
        const new_w = W[i] * XHt[i] / (WHHt[i] + eps);
        const d = Math.abs(new_w - W[i]);
        if (d > max_delta) max_delta = d;
        W[i] = new_w;
      }
      if (max_delta < 1e-6) break;
    }
    W.shape = [n, k];
    return W;
  }

  inverse_transform(W) {
    if (this.components_ == null) throw new ValidationError('NMF: not fitted');
    const { data, shape } = asMatrix(W);
    if (shape[1] !== this.n_components_) {
      throw new ValidationError(
        `NMF.inverse_transform: W has ${shape[1]} columns, expected ${this.n_components_}`);
    }
    const [n, k] = shape;
    const m = this.n_features_in_;
    // X ≈ W @ H
    const out = _matmul_decomposition(data, n, k, false, this.components_, k, m, false);
    out.shape = [n, m];
    return out;
  }
}

// Snapshot NMF's class-defined fit_transform before Object.assign
// overwrites it with TransformerMixin's default. NMF computes W as a
// side-effect of fit, so fit_transform shouldn't go through the
// default fit().transform() path.
const _nmfFitTransform_decomposition = NMF.prototype.fit_transform;
Object.assign(NMF.prototype, TransformerMixin);
NMF.prototype.fit_transform = _nmfFitTransform_decomposition;
// Tag override: NMF requires non-negative X.
NMF.prototype.__sklearn_tags__ = function () {
  const base = TransformerMixin.__sklearn_tags__.call(this);
  return { ...base, requires_positive_X: true };
};
NMF._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// NMF helpers
// ────────────────────────────────────────────────────────────────────

// NNDSVD init (Boutsidis & Gallopoulos 2008): use the SVD of X to seed
// W and H with positive values that respect the data structure better
// than random init. Greatly accelerates convergence.
function _nmfNndsvdInit_decomposition(X, n, m, k) {
  const X_nd = new NdArray(new Float64Array(X), [n, m]);
  const { s, V } = svd(X_nd);
  // line.svd doesn't expose U directly with shape [n, k]. Recompute U
  // from X = U Σ V^T → U = X V Σ⁻¹  (only first k columns).
  const k_full = s.shape[0];
  const k_use = Math.min(k, k_full);
  const U = new Float64Array(n * k_use);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k_use; c++) {
      let acc = 0;
      for (let j = 0; j < m; j++) acc += X[i * m + j] * V.data[j * k_full + c];
      U[i * k_use + c] = s.data[c] === 0 ? 0 : acc / s.data[c];
    }
  }
  const W = new Float64Array(n * k);
  const H = new Float64Array(k * m);
  // Component 0: positive part of leading singular vectors.
  const sqrt_s0 = Math.sqrt(s.data[0]);
  for (let i = 0; i < n; i++) W[i * k] = sqrt_s0 * Math.abs(U[i * k_use]);
  for (let j = 0; j < m; j++) H[j] = sqrt_s0 * Math.abs(V.data[j * k_full]);
  // Components 1..k-1: positive part of u and v separately, choose the
  // pair (uPos·vPos vs uNeg·vNeg) with larger Frobenius score.
  for (let c = 1; c < k; c++) {
    const sc = c < k_full ? s.data[c] : 0;
    const sqrt_sc = Math.sqrt(sc);
    let posU_norm2 = 0, negU_norm2 = 0, posV_norm2 = 0, negV_norm2 = 0;
    for (let i = 0; i < n; i++) {
      const u = c < k_use ? U[i * k_use + c] : 0;
      if (u > 0) posU_norm2 += u * u; else negU_norm2 += u * u;
    }
    for (let j = 0; j < m; j++) {
      const v = c < k_full ? V.data[j * k_full + c] : 0;
      if (v > 0) posV_norm2 += v * v; else negV_norm2 += v * v;
    }
    const pos_score = Math.sqrt(posU_norm2 * posV_norm2);
    const neg_score = Math.sqrt(negU_norm2 * negV_norm2);
    const usePos = pos_score >= neg_score;
    const u_norm = Math.sqrt(usePos ? posU_norm2 : negU_norm2);
    const v_norm = Math.sqrt(usePos ? posV_norm2 : negV_norm2);
    const sigma = sqrt_sc * Math.sqrt(usePos ? pos_score : neg_score);
    const uScale = u_norm > 0 ? sigma / u_norm : 0;
    const vScale = v_norm > 0 ? sigma / v_norm : 0;
    for (let i = 0; i < n; i++) {
      const u = c < k_use ? U[i * k_use + c] : 0;
      const ui = usePos ? Math.max(0, u) : Math.max(0, -u);
      W[i * k + c] = ui * uScale;
    }
    for (let j = 0; j < m; j++) {
      const v = c < k_full ? V.data[j * k_full + c] : 0;
      const vj = usePos ? Math.max(0, v) : Math.max(0, -v);
      H[c * m + j] = vj * vScale;
    }
  }
  // Replace any all-zero columns of W (or rows of H) with small random
  // positive values to avoid the multiplicative update getting stuck at 0.
  const eps0 = 1e-6;
  for (let c = 0; c < k; c++) {
    let max_w = 0; for (let i = 0; i < n; i++) if (W[i * k + c] > max_w) max_w = W[i * k + c];
    if (max_w === 0) for (let i = 0; i < n; i++) W[i * k + c] = eps0;
    let max_h = 0; for (let j = 0; j < m; j++) if (H[c * m + j] > max_h) max_h = H[c * m + j];
    if (max_h === 0) for (let j = 0; j < m; j++) H[c * m + j] = eps0;
  }
  return { W, H };
}

// Generic dense matmul: A is [aRows, aCols], B is [bRows, bCols], with
// optional transposes on either side. Returns Float64Array of shape
// [outRows, outCols] where the dimensions account for transposes.
function _matmul_decomposition(A, aRows, aCols, aT, B, bRows, bCols, bT) {
  const M = aT ? aCols : aRows;
  const K1 = aT ? aRows : aCols;
  const N = bT ? bRows : bCols;
  const K2 = bT ? bCols : bRows;
  if (K1 !== K2) throw new ValidationError(
    `_matmul_decomposition: inner dim mismatch ${K1} vs ${K2}`);
  const out = new Float64Array(M * N);
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      let s = 0;
      for (let p = 0; p < K1; p++) {
        const av = aT ? A[p * aCols + i] : A[i * aCols + p];
        const bv = bT ? B[j * bCols + p] : B[p * bCols + j];
        s += av * bv;
      }
      out[i * N + j] = s;
    }
  }
  return out;
}

function _reconstructionError_decomposition(X, n, m, W, H, k) {
  let err = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let acc = 0;
      for (let c = 0; c < k; c++) acc += W[i * k + c] * H[c * m + j];
      const d = X[i * m + j] - acc;
      err += d * d;
    }
  }
  return Math.sqrt(err);
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('PCA', PCA, { module: MODULE_ID_DECOMP });
learnRegistry.register('TruncatedSVD', TruncatedSVD, { module: MODULE_ID_DECOMP });
learnRegistry.register('NMF', NMF, { module: MODULE_ID_DECOMP });

// ── linear_model.js ──

// Linear models — LinearRegression, Ridge, Lasso, ElasticNet,
// LogisticRegression.
//
// Sklearn-compatible at the contract level. Closed-form solvers for
// LinearRegression / Ridge via @gcu/line's lstsq + cholesky-solve;
// coordinate descent for Lasso / ElasticNet; Newton-Raphson IRLS for
// binary LogisticRegression and gradient descent for multinomial.
//
// v0.2 scope: single-output regression only (multi-output / multi-task
// variants deferred). Sample weights handled by per-residual weighting
// in the regressors; class weights for LogisticRegression deferred.
//
// Numerical convention. Penalties follow sklearn's per-sample scaling:
// the Lasso objective is `(1/(2n)) * ||y - Xβ||² + α * ||β||_1`. Ridge
// uses `||y - Xβ||² + α * ||β||²` (NOT divided by n — matches sklearn).
// LogisticRegression uses `C^-1 / 2 * ||β||² + log_loss(y, Xβ)`, also
// matches sklearn's parameterization.





// Cross-package import — build.js rewrites to '../line/index.js'.

const MODULE_ID_LINEAR = '@gcu/learn.linear_model';

// ────────────────────────────────────────────────────────────────────
// LinearRegression
// ────────────────────────────────────────────────────────────────────

/**
 * Ordinary least-squares linear regression.
 *
 * Hyperparameters:
 *   - fit_intercept (bool, default true)
 *
 * Fitted attributes:
 *   - coef_           (Float64Array, n_features) — slope per feature
 *   - intercept_      (number)                    — bias term, 0 when fit_intercept=false
 *   - n_features_in_, n_samples_seen_
 *
 * Algorithm: solves (X^T X) β = X^T y via line.lstsq (which uses QR /
 * SVD under the hood — handles rank-deficient X without a special path).
 * For fit_intercept=true, the intercept is fit by appending a constant
 * column to X and solving jointly, then peeling the intercept off.
 */
class LinearRegression extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.fit_intercept = params.fit_intercept ?? true;
    this._module = MODULE_ID_LINEAR;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `LinearRegression.fit: y length ${yv.length} != n_samples ${n}`);
    }
    let X_aug, m_aug;
    if (this.fit_intercept) {
      // Append a leading column of 1s so the intercept solves jointly.
      X_aug = new Float64Array(n * (m + 1));
      m_aug = m + 1;
      for (let i = 0; i < n; i++) {
        X_aug[i * m_aug] = 1;
        for (let j = 0; j < m; j++) X_aug[i * m_aug + 1 + j] = data[i * m + j];
      }
    } else {
      X_aug = data;
      m_aug = m;
    }
    const X_nd = new NdArray(X_aug, [n, m_aug]);
    const y_nd = new NdArray(yv instanceof Float64Array ? yv : Float64Array.from(yv), [n]);
    const beta = lstsq(X_nd, y_nd);
    if (this.fit_intercept) {
      this.intercept_ = beta.data[0];
      this.coef_ = new Float64Array(m);
      for (let j = 0; j < m; j++) this.coef_[j] = beta.data[1 + j];
    } else {
      this.intercept_ = 0;
      this.coef_ = new Float64Array(m);
      for (let j = 0; j < m; j++) this.coef_[j] = beta.data[j];
    }
    this.n_features_in_ = m;
    this.n_samples_seen_ = n;
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    if (this.coef_ == null) throw new ValidationError('LinearRegression: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = this.intercept_;
      const off = i * m;
      for (let j = 0; j < m; j++) acc += data[off + j] * this.coef_[j];
      out[i] = acc;
    }
    return out;
  }
}

Object.assign(LinearRegression.prototype, RegressorMixin);
LinearRegression._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// Ridge
// ────────────────────────────────────────────────────────────────────

/**
 * Ridge regression — least-squares with L2 regularization.
 *
 * Hyperparameters:
 *   - alpha         (number, default 1.0) — L2 strength
 *   - fit_intercept (bool, default true)
 *
 * Fitted attributes: coef_, intercept_, n_features_in_, n_samples_seen_.
 *
 * Algorithm: when fit_intercept=true, center X and y first (so the
 * intercept doesn't get penalized — matches sklearn). Then solve
 * (X^T X + α I) β = X^T y via Cholesky factorization of the regularized
 * Gram matrix.
 */
class Ridge extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.alpha = params.alpha ?? 1.0;
    this.fit_intercept = params.fit_intercept ?? true;
    this._module = MODULE_ID_LINEAR;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `Ridge.fit: y length ${yv.length} != n_samples ${n}`);
    }
    if (this.alpha < 0) {
      throw new ValidationError(`Ridge: alpha must be >= 0; got ${this.alpha}`);
    }
    // Center X and y so the intercept term isn't regularized.
    let X_c, y_c, x_mean, y_mean;
    if (this.fit_intercept) {
      x_mean = new Float64Array(m);
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) x_mean[j] += data[off + j];
      }
      const inv_n = 1 / n;
      for (let j = 0; j < m; j++) x_mean[j] *= inv_n;
      y_mean = 0;
      for (let i = 0; i < n; i++) y_mean += yv[i];
      y_mean *= inv_n;
      X_c = new Float64Array(n * m);
      for (let i = 0; i < n; i++) {
        const off = i * m;
        for (let j = 0; j < m; j++) X_c[off + j] = data[off + j] - x_mean[j];
      }
      y_c = new Float64Array(n);
      for (let i = 0; i < n; i++) y_c[i] = yv[i] - y_mean;
    } else {
      x_mean = new Float64Array(m);  // zeros
      y_mean = 0;
      X_c = data instanceof Float64Array ? data : Float64Array.from(data);
      y_c = yv instanceof Float64Array ? yv : Float64Array.from(yv);
    }
    // Build Gram = X^T X (m × m), regularize, Cholesky-solve.
    const gram = new Float64Array(m * m);
    for (let j = 0; j < m; j++) {
      for (let k = j; k < m; k++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += X_c[i * m + j] * X_c[i * m + k];
        gram[j * m + k] = s;
        gram[k * m + j] = s;
      }
    }
    for (let j = 0; j < m; j++) gram[j * m + j] += this.alpha;
    // Build X^T y (length m).
    const xty = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X_c[i * m + j] * y_c[i];
      xty[j] = s;
    }
    // Cholesky-solve (gram + αI) β = X^T y.
    const gram_nd = new NdArray(gram, [m, m]);
    const L = cholesky(gram_nd);
    const xty_nd = new NdArray(xty, [m]);
    const beta = solveCholesky(L, xty_nd);

    this.coef_ = new Float64Array(m);
    for (let j = 0; j < m; j++) this.coef_[j] = beta.data[j];
    if (this.fit_intercept) {
      let inter = y_mean;
      for (let j = 0; j < m; j++) inter -= x_mean[j] * this.coef_[j];
      this.intercept_ = inter;
    } else {
      this.intercept_ = 0;
    }
    this.n_features_in_ = m;
    this.n_samples_seen_ = n;
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    if (this.coef_ == null) throw new ValidationError('Ridge: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = this.intercept_;
      const off = i * m;
      for (let j = 0; j < m; j++) acc += data[off + j] * this.coef_[j];
      out[i] = acc;
    }
    return out;
  }
}

Object.assign(Ridge.prototype, RegressorMixin);
Ridge._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// Lasso
// ────────────────────────────────────────────────────────────────────

/**
 * Lasso — least-squares with L1 regularization. Coordinate descent
 * with soft-thresholding.
 *
 * Hyperparameters:
 *   - alpha         (number, default 1.0)
 *   - fit_intercept (bool, default true)
 *   - max_iter      (int, default 1000)
 *   - tol           (number, default 1e-4) — duality-gap-like stopping
 *   - selection     ('cyclic' | 'random', default 'cyclic')
 *   - random_state  (int|null) — only consulted when selection='random'
 *
 * Fitted attributes: coef_, intercept_, n_iter_, n_features_in_.
 *
 * Algorithm: cyclic coordinate descent with soft-thresholding update
 *   β_j ← S(X_j^T r + ||X_j||² β_j, α n) / ||X_j||²
 * where S(z, t) = sign(z) max(0, |z| - t). r is the residual y - Xβ.
 */
class Lasso extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.alpha = params.alpha ?? 1.0;
    this.fit_intercept = params.fit_intercept ?? true;
    this.max_iter = params.max_iter ?? 1000;
    this.tol = params.tol ?? 1e-4;
    this.selection = params.selection ?? 'cyclic';
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_LINEAR;
  }

  fit(X, y, _opts) {
    return _fitElasticNet_linear_model(this, X, y, this.alpha, 1.0);
  }

  predict(X) {
    if (this.coef_ == null) throw new ValidationError('Lasso: not fitted');
    return _linearPredict_linear_model(this, X);
  }
}

Object.assign(Lasso.prototype, RegressorMixin);
Lasso._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// ElasticNet
// ────────────────────────────────────────────────────────────────────

/**
 * ElasticNet — combined L1 + L2 regularization.
 *
 *   objective = (1/(2n)) ||y - Xβ||² + α(l1 ||β||_1 + 0.5(1-l1) ||β||²)
 *
 * Hyperparameters:
 *   - alpha         (number, default 1.0) — total regularization strength
 *   - l1_ratio      (number in [0,1], default 0.5) — balance between L1 / L2
 *   - fit_intercept, max_iter, tol, selection, random_state — as Lasso
 *
 * l1_ratio=1 reduces to Lasso; l1_ratio=0 reduces to Ridge (with the
 * sklearn-style per-sample-scaled objective).
 */
class ElasticNet extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.alpha = params.alpha ?? 1.0;
    this.l1_ratio = params.l1_ratio ?? 0.5;
    this.fit_intercept = params.fit_intercept ?? true;
    this.max_iter = params.max_iter ?? 1000;
    this.tol = params.tol ?? 1e-4;
    this.selection = params.selection ?? 'cyclic';
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_LINEAR;
  }

  fit(X, y, _opts) {
    if (this.l1_ratio < 0 || this.l1_ratio > 1) {
      throw new ValidationError(
        `ElasticNet: l1_ratio must be in [0, 1]; got ${this.l1_ratio}`);
    }
    return _fitElasticNet_linear_model(this, X, y, this.alpha, this.l1_ratio);
  }

  predict(X) {
    if (this.coef_ == null) throw new ValidationError('ElasticNet: not fitted');
    return _linearPredict_linear_model(this, X);
  }
}

Object.assign(ElasticNet.prototype, RegressorMixin);
ElasticNet._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// LogisticRegression
// ────────────────────────────────────────────────────────────────────

/**
 * Logistic regression — binary via Newton-Raphson IRLS, multinomial
 * via gradient descent.
 *
 * Hyperparameters:
 *   - penalty       ('l2' | 'none', default 'l2')
 *   - C             (number, default 1.0) — inverse regularization
 *                   strength (sklearn convention: smaller C → stronger penalty)
 *   - fit_intercept (bool, default true)
 *   - max_iter      (int, default 100)
 *   - tol           (number, default 1e-4)
 *   - solver        ('lbfgs', default — the only one we ship in v0.2;
 *                   actual implementation is IRLS for binary, gradient
 *                   descent for multinomial)
 *   - multi_class   ('auto' | 'ovr' | 'multinomial', default 'auto')
 *
 * Fitted attributes:
 *   - coef_         (Float64Array, shape [n_classes_eff, n_features])
 *                   (n_classes_eff = 1 for binary, n_classes for multinomial)
 *   - intercept_    (Float64Array, length n_classes_eff)
 *   - classes_      (sorted unique class labels)
 *   - n_iter_       (int)
 *   - n_features_in_
 */
class LogisticRegression extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.penalty = params.penalty ?? 'l2';
    this.C = params.C ?? 1.0;
    this.fit_intercept = params.fit_intercept ?? true;
    this.max_iter = params.max_iter ?? 100;
    this.tol = params.tol ?? 1e-4;
    this.solver = params.solver ?? 'lbfgs';
    this.multi_class = params.multi_class ?? 'auto';
    this._module = MODULE_ID_LINEAR;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `LogisticRegression.fit: y length ${yv.length} != n_samples ${n}`);
    }
    if (this.penalty !== 'l2' && this.penalty !== 'none') {
      throw new ValidationError(
        `LogisticRegression: penalty='${this.penalty}' not supported in v0.2 ` +
        `(use 'l2' or 'none')`);
    }
    const { classes, encoded } = _encodeClasses_linear_model(yv);
    this.classes_ = classes;
    const K = classes.length;
    const isBinary = K === 2 && this.multi_class !== 'multinomial';
    const lambda = this.penalty === 'l2' ? 1 / Math.max(1e-300, this.C) : 0;

    if (isBinary) {
      const { beta, n_iter } = _logRegBinaryIRLS_linear_model(
        data, encoded, n, m, lambda,
        this.fit_intercept, this.max_iter, this.tol);
      // coef_ shape [1, m], intercept_ shape [1]
      this.coef_ = new Float64Array(m);
      for (let j = 0; j < m; j++) this.coef_[j] = beta[this.fit_intercept ? j + 1 : j];
      this.coef_.shape = [1, m];
      this.intercept_ = new Float64Array(1);
      this.intercept_[0] = this.fit_intercept ? beta[0] : 0;
      this.n_iter_ = n_iter;
    } else {
      const { W, n_iter } = _logRegMultinomialGD_linear_model(
        data, encoded, n, m, K, lambda,
        this.fit_intercept, this.max_iter, this.tol);
      // W shape [K, m + (1 if intercept else 0)] — first col is intercept.
      this.coef_ = new Float64Array(K * m);
      this.intercept_ = new Float64Array(K);
      const stride = this.fit_intercept ? m + 1 : m;
      for (let c = 0; c < K; c++) {
        if (this.fit_intercept) this.intercept_[c] = W[c * stride];
        for (let j = 0; j < m; j++) {
          this.coef_[c * m + j] = W[c * stride + (this.fit_intercept ? j + 1 : j)];
        }
      }
      this.coef_.shape = [K, m];
      this.n_iter_ = n_iter;
    }
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  decision_function(X) {
    if (this.coef_ == null) throw new ValidationError('LogisticRegression: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    // K_eff = how many decision rows the coef_ matrix carries: 1 for binary,
    // n_classes for multinomial. mimic-io drops the .shape property on
    // Float64Array round-trip, so derive it from length / n_features_in_.
    const K_eff = this.coef_.length / m;
    const out = new Float64Array(n * K_eff);
    for (let i = 0; i < n; i++) {
      const off_x = i * m;
      for (let c = 0; c < K_eff; c++) {
        let acc = this.intercept_[c];
        const off_c = c * m;
        for (let j = 0; j < m; j++) acc += data[off_x + j] * this.coef_[off_c + j];
        out[i * K_eff + c] = acc;
      }
    }
    out.shape = [n, K_eff];
    return out;
  }

  predict_proba(X) {
    const z = this.decision_function(X);
    const m = this.n_features_in_;
    const K_eff = this.coef_.length / m;
    const n = z.length / K_eff;
    const K = this.classes_.length;
    if (K === 2 && K_eff === 1) {
      const out = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        const p = 1 / (1 + Math.exp(-z[i]));
        out[i * 2] = 1 - p;
        out[i * 2 + 1] = p;
      }
      out.shape = [n, 2];
      return out;
    }
    // Multinomial softmax.
    const out = new Float64Array(n * K);
    for (let i = 0; i < n; i++) {
      let zmax = -Infinity;
      for (let c = 0; c < K; c++) if (z[i * K + c] > zmax) zmax = z[i * K + c];
      let denom = 0;
      for (let c = 0; c < K; c++) {
        const e = Math.exp(z[i * K + c] - zmax);
        out[i * K + c] = e;
        denom += e;
      }
      const inv = 1 / denom;
      for (let c = 0; c < K; c++) out[i * K + c] *= inv;
    }
    out.shape = [n, K];
    return out;
  }

  predict(X) {
    const proba = this.predict_proba(X);
    const K = this.classes_.length;
    const n = proba.length / K;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0, bestP = -1;
      for (let c = 0; c < K; c++) {
        if (proba[i * K + c] > bestP) { best = c; bestP = proba[i * K + c]; }
      }
      out[i] = this.classes_[best];
    }
    return out;
  }
}

Object.assign(LogisticRegression.prototype, ClassifierMixin);
LogisticRegression._estimator_type = 'classifier';

// ────────────────────────────────────────────────────────────────────
// Internals — coordinate descent, IRLS, helpers
// ────────────────────────────────────────────────────────────────────

// Shared coordinate-descent fit for Lasso/ElasticNet. l1 = l1_ratio.
function _fitElasticNet_linear_model(est, X, y, alpha, l1) {
  const X_info = asMatrix(X);
  const { data, shape } = X_info;
  const yv = asVector(y);
  const [n, m] = shape;
  if (yv.length !== n) {
    throw new ValidationError(`fit: y length ${yv.length} != n_samples ${n}`);
  }
  // Center X / y when fit_intercept (so intercept isn't penalized).
  let X_c, y_c, x_mean, y_mean;
  if (est.fit_intercept) {
    x_mean = new Float64Array(m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) x_mean[j] += data[off + j];
    }
    const inv_n = 1 / n;
    for (let j = 0; j < m; j++) x_mean[j] *= inv_n;
    y_mean = 0;
    for (let i = 0; i < n; i++) y_mean += yv[i];
    y_mean *= inv_n;
    X_c = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) X_c[off + j] = data[off + j] - x_mean[j];
    }
    y_c = new Float64Array(n);
    for (let i = 0; i < n; i++) y_c[i] = yv[i] - y_mean;
  } else {
    x_mean = new Float64Array(m);
    y_mean = 0;
    X_c = data instanceof Float64Array ? data : Float64Array.from(data);
    y_c = yv instanceof Float64Array ? yv : Float64Array.from(yv);
  }
  // Pre-compute column squared-norms.
  const xx = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const v = X_c[i * m + j];
      s += v * v;
    }
    xx[j] = s;
  }
  // Initialize residual r = y - X β  with β = 0 → r = y.
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = y_c[i];
  const beta = new Float64Array(m);
  // Penalty constants (sklearn-style, scaled by n).
  const l1_term = alpha * l1 * n;
  const l2_term = alpha * (1 - l1) * n;
  // Coordinate ordering helper.
  const rng = est.selection === 'random' && est.random_state != null
    ? mulberry32(est.random_state) : null;
  const order = new Int32Array(m);
  for (let j = 0; j < m; j++) order[j] = j;

  let n_iter = 0;
  for (let iter = 0; iter < est.max_iter; iter++) {
    n_iter = iter + 1;
    if (est.selection === 'random' && rng) {
      for (let i = m - 1; i > 0; i--) {
        const k = Math.floor(rng() * (i + 1));
        const t = order[i]; order[i] = order[k]; order[k] = t;
      }
    }
    let max_delta = 0;
    for (let p = 0; p < m; p++) {
      const j = order[p];
      const xx_j = xx[j];
      if (xx_j === 0) continue;
      // Compute X_j · r + xx_j * β_j (residual including current β_j contrib).
      let z = 0;
      for (let i = 0; i < n; i++) z += X_c[i * m + j] * r[i];
      z += xx_j * beta[j];
      // Soft-threshold with combined L1/L2.
      let new_beta;
      if (z > l1_term) new_beta = (z - l1_term) / (xx_j + l2_term);
      else if (z < -l1_term) new_beta = (z + l1_term) / (xx_j + l2_term);
      else new_beta = 0;
      const delta = new_beta - beta[j];
      if (delta !== 0) {
        for (let i = 0; i < n; i++) r[i] -= X_c[i * m + j] * delta;
        beta[j] = new_beta;
      }
      const adelta = Math.abs(delta);
      if (adelta > max_delta) max_delta = adelta;
    }
    if (max_delta < est.tol) break;
  }

  est.coef_ = beta;
  est.intercept_ = est.fit_intercept ? _intercept_linear_model(y_mean, x_mean, beta, m) : 0;
  est.n_iter_ = n_iter;
  est.n_features_in_ = m;
  est.n_samples_seen_ = n;
  captureFeatureNames(est, X_info);
  return est;
}

function _intercept_linear_model(y_mean, x_mean, beta, m) {
  let inter = y_mean;
  for (let j = 0; j < m; j++) inter -= x_mean[j] * beta[j];
  return inter;
}

function _linearPredict_linear_model(est, X) {
  const { data, shape } = asMatrix(X);
  checkNFeatures(est, shape, { name: 'X' });
  const [n, m] = shape;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = est.intercept_;
    const off = i * m;
    for (let j = 0; j < m; j++) acc += data[off + j] * est.coef_[j];
    out[i] = acc;
  }
  return out;
}

// Binary IRLS: maximize ℓ(β) - λ/2 ||β||² with logistic loss.
//   p_i = sigmoid(η_i),  η = X̃β
//   gradient = X̃^T (p - y) + λ β
//   Hessian  = X̃^T diag(p(1-p)) X̃ + λ I
// Newton step: β_new = β - H^{-1} gradient.
function _logRegBinaryIRLS_linear_model(X, y, n, m, lambda, fit_intercept, max_iter, tol) {
  const m_aug = fit_intercept ? m + 1 : m;
  // Build augmented design matrix.
  const X_aug = new Float64Array(n * m_aug);
  for (let i = 0; i < n; i++) {
    if (fit_intercept) X_aug[i * m_aug] = 1;
    for (let j = 0; j < m; j++) X_aug[i * m_aug + (fit_intercept ? j + 1 : j)] = X[i * m + j];
  }
  const beta = new Float64Array(m_aug);  // start at 0
  const eta = new Float64Array(n);
  const p = new Float64Array(n);
  const w = new Float64Array(n);
  const grad = new Float64Array(m_aug);
  const H = new Float64Array(m_aug * m_aug);
  let n_iter = 0;
  for (let iter = 0; iter < max_iter; iter++) {
    n_iter = iter + 1;
    // η = X̃β; p = sigmoid(η); w = p(1-p)
    for (let i = 0; i < n; i++) {
      let e = 0;
      const off = i * m_aug;
      for (let j = 0; j < m_aug; j++) e += X_aug[off + j] * beta[j];
      eta[i] = e;
      const pi = 1 / (1 + Math.exp(-e));
      p[i] = pi;
      w[i] = pi * (1 - pi);
    }
    // gradient = X̃^T (p - y) + λ β  (don't penalize intercept)
    for (let j = 0; j < m_aug; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X_aug[i * m_aug + j] * (p[i] - y[i]);
      const reg_j = (fit_intercept && j === 0) ? 0 : lambda * beta[j];
      grad[j] = s + reg_j;
    }
    // Hessian = X̃^T diag(w) X̃ + λ I (skip intercept on regularizer)
    for (let a = 0; a < m_aug; a++) {
      for (let b = a; b < m_aug; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += X_aug[i * m_aug + a] * w[i] * X_aug[i * m_aug + b];
        H[a * m_aug + b] = s;
        H[b * m_aug + a] = s;
      }
    }
    for (let j = 0; j < m_aug; j++) {
      if (!(fit_intercept && j === 0)) H[j * m_aug + j] += lambda;
    }
    // Solve H δ = grad → β -= δ
    const H_nd = new NdArray(H, [m_aug, m_aug]);
    const grad_nd = new NdArray(grad, [m_aug]);
    let delta;
    try {
      const L = cholesky(H_nd);
      delta = solveCholesky(L, grad_nd);
    } catch (_) {
      // Hessian non-PD (unlikely with positive λ); fall back to lstsq.
      delta = lstsq(H_nd, grad_nd);
    }
    let max_delta = 0;
    for (let j = 0; j < m_aug; j++) {
      beta[j] -= delta.data[j];
      const a = Math.abs(delta.data[j]);
      if (a > max_delta) max_delta = a;
    }
    if (max_delta < tol) break;
  }
  return { beta, n_iter };
}

// Multinomial logistic regression via gradient descent with line search.
// Minimizes -log-likelihood + (λ/2) ||W||² (sklearn-style penalty).
function _logRegMultinomialGD_linear_model(X, y, n, m, K, lambda, fit_intercept, max_iter, tol) {
  const m_aug = fit_intercept ? m + 1 : m;
  const X_aug = new Float64Array(n * m_aug);
  for (let i = 0; i < n; i++) {
    if (fit_intercept) X_aug[i * m_aug] = 1;
    for (let j = 0; j < m; j++) X_aug[i * m_aug + (fit_intercept ? j + 1 : j)] = X[i * m + j];
  }
  const W = new Float64Array(K * m_aug);
  const eta = new Float64Array(n * K);
  const probs = new Float64Array(n * K);
  let n_iter = 0;
  let lr = 1.0;
  let prev_loss = Infinity;
  for (let iter = 0; iter < max_iter; iter++) {
    n_iter = iter + 1;
    // η = X̃ W^T  (n × K)
    for (let i = 0; i < n; i++) {
      const off_x = i * m_aug;
      for (let c = 0; c < K; c++) {
        let s = 0;
        const off_w = c * m_aug;
        for (let j = 0; j < m_aug; j++) s += X_aug[off_x + j] * W[off_w + j];
        eta[i * K + c] = s;
      }
    }
    // Softmax probabilities + cross-entropy loss.
    let loss = 0;
    for (let i = 0; i < n; i++) {
      let zmax = -Infinity;
      for (let c = 0; c < K; c++) if (eta[i * K + c] > zmax) zmax = eta[i * K + c];
      let denom = 0;
      for (let c = 0; c < K; c++) {
        const e = Math.exp(eta[i * K + c] - zmax);
        probs[i * K + c] = e;
        denom += e;
      }
      const inv = 1 / denom;
      const yi = y[i] | 0;
      for (let c = 0; c < K; c++) probs[i * K + c] *= inv;
      loss -= Math.log(Math.max(1e-300, probs[i * K + yi]));
    }
    loss += 0.5 * lambda * _l2NormSq_linear_model(W, fit_intercept ? m_aug : 0, m_aug, K);
    if (Math.abs(prev_loss - loss) < tol * Math.max(1, Math.abs(prev_loss))) break;
    prev_loss = loss;
    // Gradient of loss w.r.t. W: G[c, j] = sum_i (probs[i,c] - I[y_i=c]) x[i,j] + λ W[c,j]
    const G = new Float64Array(K * m_aug);
    for (let c = 0; c < K; c++) {
      for (let j = 0; j < m_aug; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const r = probs[i * K + c] - (y[i] === c ? 1 : 0);
          s += r * X_aug[i * m_aug + j];
        }
        const reg = (fit_intercept && j === 0) ? 0 : lambda * W[c * m_aug + j];
        G[c * m_aug + j] = s + reg;
      }
    }
    // Update with simple step + lr backoff if loss didn't go down.
    for (let i = 0; i < W.length; i++) W[i] -= lr * G[i] / n;
  }
  return { W, n_iter };
}

function _l2NormSq_linear_model(W, intercept_offset, stride, K) {
  let s = 0;
  for (let c = 0; c < K; c++) {
    for (let j = intercept_offset > 0 ? 1 : 0; j < stride; j++) {
      const v = W[c * stride + j];
      s += v * v;
    }
  }
  return s;
}

// Encode unique class labels to dense ints. Identical to tree.js's helper —
// kept inline to avoid reaching across module boundaries during build concat.
function _encodeClasses_linear_model(yv) {
  const seen = new Map();
  const order = [];
  for (let i = 0; i < yv.length; i++) {
    const v = yv[i];
    if (!seen.has(v)) { seen.set(v, true); order.push(v); }
  }
  order.sort((a, b) => a - b);
  const idx = new Map();
  for (let c = 0; c < order.length; c++) idx.set(order[c], c);
  const encoded = new Float64Array(yv.length);
  for (let i = 0; i < yv.length; i++) encoded[i] = idx.get(yv[i]);
  return { classes: Float64Array.from(order), encoded };
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('LinearRegression', LinearRegression, { module: MODULE_ID_LINEAR });
learnRegistry.register('Ridge', Ridge, { module: MODULE_ID_LINEAR });
learnRegistry.register('Lasso', Lasso, { module: MODULE_ID_LINEAR });
learnRegistry.register('ElasticNet', ElasticNet, { module: MODULE_ID_LINEAR });
learnRegistry.register('LogisticRegression', LogisticRegression, { module: MODULE_ID_LINEAR });

// ── ensemble.js ──

// Ensembles — RandomForest, ExtraTrees, Bagging.
//
// Sklearn-compatible at the contract level. v0.2 ships these single-
// threaded; the worker-pool n_jobs > 1 variant lands later (per SPEC
// §6.2) once util/workers.js exists.
//
// Tree-family ensembles (RandomForest, ExtraTrees) reuse the
// DecisionTree{Classifier,Regressor} infrastructure from tree.js.
// Bagging is generic over any base estimator following the standard
// fit/predict contract.
//
// All three classes serialize via mimic-io with a custom codec hook —
// the fitted state holds an array of fitted child estimators, and the
// default mimic-io walker can't preserve their class identity. The
// hook mirrors Pipeline / ColumnTransformer's pattern.






const MODULE_ID_ENSEMBLE = '@gcu/learn.ensemble';

// ────────────────────────────────────────────────────────────────────
// Shared infrastructure
// ────────────────────────────────────────────────────────────────────

// Bootstrap-sample row indices with replacement.
function _bootstrapIndices_ensemble(n, n_samples, rng) {
  const out = new Int32Array(n_samples);
  for (let i = 0; i < n_samples; i++) out[i] = Math.floor(rng() * n);
  return out;
}

// Sample row indices without replacement (sklearn's max_samples<n with bootstrap=False).
function _subsampleIndices_ensemble(n, n_samples, rng) {
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  for (let i = 0; i < n_samples; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx.subarray(0, n_samples);
}

function _gatherRows_ensemble(Xd, n, m, indices) {
  const k = indices.length;
  const out = new Float64Array(k * m);
  for (let i = 0; i < k; i++) {
    const src = indices[i] * m;
    const dst = i * m;
    for (let j = 0; j < m; j++) out[dst + j] = Xd[src + j];
  }
  out.shape = [k, m];
  return out;
}

function _gatherValues_ensemble(yv, indices) {
  const k = indices.length;
  const out = new Float64Array(k);
  for (let i = 0; i < k; i++) out[i] = yv[indices[i]];
  return out;
}

// Resolve max_samples to integer count.
//
// Sklearn distinguishes int vs float here (1 = 1 sample, 1.0 = 100%).
// JS has no int/float type distinction (1 === 1.0), so we treat any
// value in (0, 1] as a fraction and anything > 1 as a count. The
// practical effect: max_samples=1 means "100% of samples"; to draw
// exactly 1 sample, pass max_samples=2 (which then clips to n=1 only
// when n=1 — useless edge case for ensembles anyway).
function _resolveMaxSamples_ensemble(spec, n) {
  if (spec == null) return n;
  if (typeof spec === 'number') {
    if (spec <= 1) return Math.max(1, Math.min(n, Math.round(spec * n)));
    return Math.max(1, Math.min(n, Math.floor(spec)));
  }
  throw new ValidationError(`max_samples must be number|null; got ${spec}`);
}

// Sorted union of class labels across all child estimators (handles the
// case where a bootstrap sample misses a class entirely).
function _unionClasses_ensemble(estimators) {
  const seen = new Set();
  for (const est of estimators) {
    if (est.classes_) for (const c of est.classes_) seen.add(c);
  }
  return Float64Array.from([...seen].sort((a, b) => a - b));
}

// ────────────────────────────────────────────────────────────────────
// _ForestBase — shared scaffolding for RandomForest + ExtraTrees
// ────────────────────────────────────────────────────────────────────

function _fitForest_ensemble(est, X, y, opts) {
  const X_info = asMatrix(X);
  const { data: Xd, shape } = X_info;
  const yv = y == null ? null : asVector(y);
  const [n, m] = shape;
  if (yv != null && yv.length !== n) {
    throw new ValidationError(`fit: y length ${yv.length} != n_samples ${n}`);
  }
  const baseSeed = est.random_state == null
    ? Math.floor(Math.random() * 0x7fffffff)
    : est.random_state;
  const rng = mulberry32(baseSeed);
  const n_samples = _resolveMaxSamples_ensemble(est.max_samples, n);
  const estimators = [];
  for (let t = 0; t < est.n_estimators; t++) {
    const tree_seed = (rng() * 0x7fffffff) | 0;
    const tree_rng = mulberry32(tree_seed);
    let X_t, y_t;
    if (est.bootstrap) {
      const idx = _bootstrapIndices_ensemble(n, n_samples, tree_rng);
      X_t = _gatherRows_ensemble(Xd, n, m, idx);
      y_t = yv == null ? null : _gatherValues_ensemble(yv, idx);
    } else if (n_samples < n) {
      const idx = _subsampleIndices_ensemble(n, n_samples, tree_rng);
      X_t = _gatherRows_ensemble(Xd, n, m, idx);
      y_t = yv == null ? null : _gatherValues_ensemble(yv, idx);
    } else {
      X_t = X; y_t = y;
    }
    const tree = opts.makeTree(tree_seed);
    tree.fit(X_t, y_t);
    estimators.push(tree);
  }
  est.estimators_ = estimators;
  est.n_features_in_ = m;
  captureFeatureNames(est, X_info);
  if (opts.classifier) {
    est.classes_ = _unionClasses_ensemble(estimators);
    est.n_classes_ = est.classes_.length;
  }
  return est;
}

function _forestPredictProba_ensemble(est, X) {
  const { shape } = asMatrix(X);
  checkNFeatures(est, shape, { name: 'X' });
  const n = shape[0];
  const k = est.classes_.length;
  const out = new Float64Array(n * k);
  // For each tree, accumulate its probability output averaged across the
  // forest. Map per-tree class indices to the union via a per-tree
  // remap when necessary.
  const inv_t = 1 / est.estimators_.length;
  for (const t of est.estimators_) {
    const proba = t.predict_proba(X);
    const t_classes = t.classes_;
    const k_t = t_classes.length;
    // Build remap: position c in t.classes_ → position in est.classes_.
    const remap = new Int32Array(k_t);
    for (let c = 0; c < k_t; c++) {
      remap[c] = est.classes_.indexOf(t_classes[c]);
    }
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k_t; c++) {
        out[i * k + remap[c]] += proba[i * k_t + c] * inv_t;
      }
    }
  }
  out.shape = [n, k];
  return out;
}

function _forestPredictClassifier_ensemble(est, X) {
  const proba = _forestPredictProba_ensemble(est, X);
  const n = proba.length / est.classes_.length;
  const k = est.classes_.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bestP = -1;
    for (let c = 0; c < k; c++) {
      if (proba[i * k + c] > bestP) { best = c; bestP = proba[i * k + c]; }
    }
    out[i] = est.classes_[best];
  }
  return out;
}

function _forestPredictRegressor_ensemble(est, X) {
  const { shape } = asMatrix(X);
  checkNFeatures(est, shape, { name: 'X' });
  const n = shape[0];
  const out = new Float64Array(n);
  for (const t of est.estimators_) {
    const yh = t.predict(X);
    for (let i = 0; i < n; i++) out[i] += yh[i];
  }
  const inv = 1 / est.estimators_.length;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

// ────────────────────────────────────────────────────────────────────
// RandomForestClassifier
// ────────────────────────────────────────────────────────────────────

class RandomForestClassifier extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_estimators = params.n_estimators ?? 100;
    this.criterion = params.criterion ?? 'gini';
    this.max_depth = params.max_depth ?? null;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? 'sqrt';
    this.bootstrap = params.bootstrap ?? true;
    this.max_samples = params.max_samples ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y) {
    return _fitForest_ensemble(this, X, y, {
      classifier: true,
      makeTree: (seed) => new DecisionTreeClassifier({
        criterion: this.criterion,
        splitter: 'best',
        max_depth: this.max_depth,
        min_samples_split: this.min_samples_split,
        min_samples_leaf: this.min_samples_leaf,
        max_features: this.max_features,
        random_state: seed,
      }),
    });
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('RandomForestClassifier: not fitted');
    return _forestPredictClassifier_ensemble(this, X);
  }

  predict_proba(X) {
    if (!this.estimators_) throw new ValidationError('RandomForestClassifier: not fitted');
    return _forestPredictProba_ensemble(this, X);
  }

  __sklearn_clone__() {
    return new RandomForestClassifier(this.get_params(false));
  }

  _toMimicIo() {
    return _ensembleEncode_ensemble(this, 'RandomForestClassifier');
  }

  static _fromMimicIo(json, opts = {}) {
    return _ensembleDecode_ensemble(RandomForestClassifier, json, opts, /* classifier */ true);
  }
}

Object.assign(RandomForestClassifier.prototype, ClassifierMixin);
RandomForestClassifier._estimator_type = 'classifier';

// ────────────────────────────────────────────────────────────────────
// RandomForestRegressor
// ────────────────────────────────────────────────────────────────────

class RandomForestRegressor extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_estimators = params.n_estimators ?? 100;
    this.criterion = params.criterion ?? 'squared_error';
    this.max_depth = params.max_depth ?? null;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? 1.0;
    this.bootstrap = params.bootstrap ?? true;
    this.max_samples = params.max_samples ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y) {
    return _fitForest_ensemble(this, X, y, {
      classifier: false,
      makeTree: (seed) => new DecisionTreeRegressor({
        criterion: this.criterion,
        splitter: 'best',
        max_depth: this.max_depth,
        min_samples_split: this.min_samples_split,
        min_samples_leaf: this.min_samples_leaf,
        max_features: this.max_features,
        random_state: seed,
      }),
    });
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('RandomForestRegressor: not fitted');
    return _forestPredictRegressor_ensemble(this, X);
  }

  __sklearn_clone__() {
    return new RandomForestRegressor(this.get_params(false));
  }

  _toMimicIo() {
    return _ensembleEncode_ensemble(this, 'RandomForestRegressor');
  }

  static _fromMimicIo(json, opts = {}) {
    return _ensembleDecode_ensemble(RandomForestRegressor, json, opts, /* classifier */ false);
  }
}

Object.assign(RandomForestRegressor.prototype, RegressorMixin);
RandomForestRegressor._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// ExtraTreesClassifier / ExtraTreesRegressor
// ────────────────────────────────────────────────────────────────────

class ExtraTreesClassifier extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_estimators = params.n_estimators ?? 100;
    this.criterion = params.criterion ?? 'gini';
    this.max_depth = params.max_depth ?? null;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? 'sqrt';
    // ExtraTrees uses bootstrap=False by default (sklearn convention) — the
    // randomness comes from random thresholds, not bootstrap sampling.
    this.bootstrap = params.bootstrap ?? false;
    this.max_samples = params.max_samples ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y) {
    return _fitForest_ensemble(this, X, y, {
      classifier: true,
      makeTree: (seed) => new DecisionTreeClassifier({
        criterion: this.criterion,
        splitter: 'random',
        max_depth: this.max_depth,
        min_samples_split: this.min_samples_split,
        min_samples_leaf: this.min_samples_leaf,
        max_features: this.max_features,
        random_state: seed,
      }),
    });
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('ExtraTreesClassifier: not fitted');
    return _forestPredictClassifier_ensemble(this, X);
  }

  predict_proba(X) {
    if (!this.estimators_) throw new ValidationError('ExtraTreesClassifier: not fitted');
    return _forestPredictProba_ensemble(this, X);
  }

  __sklearn_clone__() {
    return new ExtraTreesClassifier(this.get_params(false));
  }

  _toMimicIo() { return _ensembleEncode_ensemble(this, 'ExtraTreesClassifier'); }
  static _fromMimicIo(json, opts = {}) {
    return _ensembleDecode_ensemble(ExtraTreesClassifier, json, opts, true);
  }
}

Object.assign(ExtraTreesClassifier.prototype, ClassifierMixin);
ExtraTreesClassifier._estimator_type = 'classifier';

class ExtraTreesRegressor extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_estimators = params.n_estimators ?? 100;
    this.criterion = params.criterion ?? 'squared_error';
    this.max_depth = params.max_depth ?? null;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? 1.0;
    this.bootstrap = params.bootstrap ?? false;
    this.max_samples = params.max_samples ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y) {
    return _fitForest_ensemble(this, X, y, {
      classifier: false,
      makeTree: (seed) => new DecisionTreeRegressor({
        criterion: this.criterion,
        splitter: 'random',
        max_depth: this.max_depth,
        min_samples_split: this.min_samples_split,
        min_samples_leaf: this.min_samples_leaf,
        max_features: this.max_features,
        random_state: seed,
      }),
    });
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('ExtraTreesRegressor: not fitted');
    return _forestPredictRegressor_ensemble(this, X);
  }

  __sklearn_clone__() {
    return new ExtraTreesRegressor(this.get_params(false));
  }

  _toMimicIo() { return _ensembleEncode_ensemble(this, 'ExtraTreesRegressor'); }
  static _fromMimicIo(json, opts = {}) {
    return _ensembleDecode_ensemble(ExtraTreesRegressor, json, opts, false);
  }
}

Object.assign(ExtraTreesRegressor.prototype, RegressorMixin);
ExtraTreesRegressor._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// BaggingClassifier / BaggingRegressor — generic bagging
// ────────────────────────────────────────────────────────────────────

/**
 * Generic bagging ensemble. Takes any base estimator that follows the
 * standard fit/predict (and optionally predict_proba) contract.
 *
 * Hyperparameters:
 *   - estimator (any unfitted estimator instance — used as the prototype
 *     to clone for each bag; default: DecisionTreeClassifier())
 *   - n_estimators, max_samples, max_features=1.0 (no per-bag feature
 *     subsampling in v0.2 — adds complexity, defer to v0.3),
 *     bootstrap=true, bootstrap_features=false (deferred), random_state.
 */
class BaggingClassifier extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.estimator = params.estimator ?? new DecisionTreeClassifier();
    this.n_estimators = params.n_estimators ?? 10;
    this.max_samples = params.max_samples ?? 1.0;
    this.bootstrap = params.bootstrap ?? true;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y) {
    return _fitForest_ensemble(this, X, y, {
      classifier: true,
      makeTree: (seed) => _cloneEstWithSeed_ensemble(this.estimator, seed),
    });
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('BaggingClassifier: not fitted');
    if (typeof this.estimators_[0].predict_proba === 'function') {
      return _forestPredictClassifier_ensemble(this, X);
    }
    // Fall back to majority vote if the base estimator lacks predict_proba.
    return _majorityVote_ensemble(this, X);
  }

  predict_proba(X) {
    if (!this.estimators_) throw new ValidationError('BaggingClassifier: not fitted');
    if (typeof this.estimators_[0].predict_proba !== 'function') {
      throw new ValidationError(
        'BaggingClassifier.predict_proba: base estimator has no predict_proba');
    }
    return _forestPredictProba_ensemble(this, X);
  }

  __sklearn_clone__() {
    const Ctor = this.estimator.constructor;
    const params = typeof this.estimator.get_params === 'function'
      ? this.estimator.get_params(false) : {};
    return new BaggingClassifier({
      ...this.get_params(false),
      estimator: new Ctor(params),
    });
  }

  _toMimicIo() {
    const out = _ensembleEncode_ensemble(this, 'BaggingClassifier');
    out.params.estimator = dump(this.estimator);
    return out;
  }
  static _fromMimicIo(json, opts = {}) {
    const params = { ...json.params };
    if (params.estimator) params.estimator = load(params.estimator, opts);
    return _ensembleDecodeFromParams_ensemble(BaggingClassifier, json, params, opts, true);
  }
}

Object.assign(BaggingClassifier.prototype, ClassifierMixin);
BaggingClassifier._estimator_type = 'classifier';

class BaggingRegressor extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.estimator = params.estimator ?? new DecisionTreeRegressor();
    this.n_estimators = params.n_estimators ?? 10;
    this.max_samples = params.max_samples ?? 1.0;
    this.bootstrap = params.bootstrap ?? true;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y) {
    return _fitForest_ensemble(this, X, y, {
      classifier: false,
      makeTree: (seed) => _cloneEstWithSeed_ensemble(this.estimator, seed),
    });
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('BaggingRegressor: not fitted');
    return _forestPredictRegressor_ensemble(this, X);
  }

  __sklearn_clone__() {
    const Ctor = this.estimator.constructor;
    const params = typeof this.estimator.get_params === 'function'
      ? this.estimator.get_params(false) : {};
    return new BaggingRegressor({
      ...this.get_params(false),
      estimator: new Ctor(params),
    });
  }

  _toMimicIo() {
    const out = _ensembleEncode_ensemble(this, 'BaggingRegressor');
    out.params.estimator = dump(this.estimator);
    return out;
  }
  static _fromMimicIo(json, opts = {}) {
    const params = { ...json.params };
    if (params.estimator) params.estimator = load(params.estimator, opts);
    return _ensembleDecodeFromParams_ensemble(BaggingRegressor, json, params, opts, false);
  }
}

Object.assign(BaggingRegressor.prototype, RegressorMixin);
BaggingRegressor._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

// Clone an estimator and inject a fresh random_state seed (when the
// estimator accepts one). Used by BaggingClassifier/Regressor to give
// each bag's child a distinct seed so they're not identical clones.
function _cloneEstWithSeed_ensemble(template, seed) {
  const Ctor = template.constructor;
  const params = typeof template.get_params === 'function' ? template.get_params(false) : {};
  if ('random_state' in params) params.random_state = seed;
  return new Ctor(params);
}

// Majority-vote prediction (used by BaggingClassifier when the base
// estimator has no predict_proba). Each tree's predict() output is one
// vote per sample.
function _majorityVote_ensemble(est, X) {
  const { shape } = asMatrix(X);
  const n = shape[0];
  const counts = new Array(n).fill(null).map(() => new Map());
  for (const t of est.estimators_) {
    const yh = t.predict(X);
    for (let i = 0; i < n; i++) {
      const k = yh[i];
      counts[i].set(k, (counts[i].get(k) ?? 0) + 1);
    }
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let best = null, bestN = -1;
    for (const [k, c] of counts[i]) if (c > bestN) { best = k; bestN = c; }
    out[i] = best;
  }
  return out;
}

// Generic mimic-io encoder for tree-family ensembles. Children are
// dumped one-by-one through learn's dump (so they round-trip via the
// registered DecisionTree* classes).
function _ensembleEncode_ensemble(est, class_name) {
  const params = est.get_params(false);
  const out = {
    format: 'mimic-io',
    version: 2,
    class: class_name,
    module: est._module,
    params,
  };
  if (est.estimators_) {
    out.fitted = {
      estimators_: est.estimators_.map(e => dump(e)),
      n_features_in_: est.n_features_in_,
    };
    if (est.classes_) {
      out.fitted.classes_ = Array.from(est.classes_);
      out.fitted.n_classes_ = est.n_classes_;
    }
  } else {
    out.fitted = null;
  }
  return out;
}

function _ensembleDecode_ensemble(Ctor, json, opts, classifier) {
  const inst = new Ctor(json.params ?? {});
  return _ensembleHydrate_ensemble(inst, json, opts, classifier);
}

function _ensembleDecodeFromParams_ensemble(Ctor, json, params, opts, classifier) {
  const inst = new Ctor(params);
  return _ensembleHydrate_ensemble(inst, json, opts, classifier);
}

function _ensembleHydrate_ensemble(inst, json, opts, classifier) {
  if (json.fitted) {
    inst.estimators_ = (json.fitted.estimators_ ?? []).map(j => load(j, opts));
    inst.n_features_in_ = json.fitted.n_features_in_;
    if (classifier && json.fitted.classes_) {
      inst.classes_ = Float64Array.from(json.fitted.classes_);
      inst.n_classes_ = json.fitted.n_classes_;
    }
  }
  return inst;
}

// ────────────────────────────────────────────────────────────────────
// GradientBoostingRegressor
// ────────────────────────────────────────────────────────────────────

/**
 * Stagewise additive regression with squared-error loss.
 *
 *   F_0(x) = mean(y)
 *   for m = 1..n_estimators:
 *     residuals = y - F_{m-1}(X)
 *     tree_m fit to residuals
 *     F_m(x) = F_{m-1}(x) + learning_rate * tree_m.predict(x)
 *
 * v0.2 ships squared_error loss only. Subsample / early-stopping /
 * staged_predict / monitor_ deferred to v0.3.
 *
 * Hyperparameters:
 *   - loss              'squared_error' (only)
 *   - learning_rate     (default 0.1)
 *   - n_estimators      (default 100)
 *   - max_depth         (default 3 — weak learners)
 *   - min_samples_split (default 2)
 *   - min_samples_leaf  (default 1)
 *   - max_features      (default null — all features)
 *   - random_state      (int|null)
 */
class GradientBoostingRegressor extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.loss = params.loss ?? 'squared_error';
    this.learning_rate = params.learning_rate ?? 0.1;
    this.n_estimators = params.n_estimators ?? 100;
    this.max_depth = params.max_depth ?? 3;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y, _opts) {
    if (this.loss !== 'squared_error') {
      throw new ValidationError(
        `GradientBoostingRegressor: loss='${this.loss}' not supported in v0.2 (use 'squared_error')`);
    }
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `GradientBoostingRegressor.fit: y length ${yv.length} != n_samples ${n}`);
    }
    // Init = mean(y).
    let init_value = 0;
    for (let i = 0; i < n; i++) init_value += yv[i];
    init_value /= n;
    // Working predictions F_m(x_i) — start at init_value.
    const F = new Float64Array(n);
    F.fill(init_value);
    const baseSeed = this.random_state == null
      ? Math.floor(Math.random() * 0x7fffffff)
      : this.random_state;
    const rng = mulberry32(baseSeed);

    const estimators = [];
    const train_score = new Float64Array(this.n_estimators);

    for (let stage = 0; stage < this.n_estimators; stage++) {
      // Residuals = -gradient of squared error / 2 = y - F.
      const residuals = new Float64Array(n);
      for (let i = 0; i < n; i++) residuals[i] = yv[i] - F[i];

      const tree_seed = (rng() * 0x7fffffff) | 0;
      const tree = new DecisionTreeRegressor({
        criterion: 'squared_error',
        splitter: 'best',
        max_depth: this.max_depth,
        min_samples_split: this.min_samples_split,
        min_samples_leaf: this.min_samples_leaf,
        max_features: this.max_features,
        random_state: tree_seed,
      });
      tree.fit(X, residuals);
      const yhat = tree.predict(X);
      // Update F.
      for (let i = 0; i < n; i++) F[i] += this.learning_rate * yhat[i];
      // Track training MSE.
      let mse = 0;
      for (let i = 0; i < n; i++) { const d = yv[i] - F[i]; mse += d * d; }
      train_score[stage] = mse / n;
      estimators.push(tree);
    }

    this.estimators_ = estimators;
    this.init_value_ = init_value;
    this.train_score_ = train_score;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    if (!this.estimators_) throw new ValidationError('GradientBoostingRegressor: not fitted');
    const { shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const n = shape[0];
    const out = new Float64Array(n);
    out.fill(this.init_value_);
    for (const tree of this.estimators_) {
      const yh = tree.predict(X);
      for (let i = 0; i < n; i++) out[i] += this.learning_rate * yh[i];
    }
    return out;
  }

  __sklearn_clone__() {
    return new GradientBoostingRegressor(this.get_params(false));
  }

  _toMimicIo() {
    return _gbEncode_ensemble(this, 'GradientBoostingRegressor', /* classifier */ false);
  }
  static _fromMimicIo(json, opts = {}) {
    return _gbDecode_ensemble(GradientBoostingRegressor, json, opts, /* classifier */ false);
  }
}

Object.assign(GradientBoostingRegressor.prototype, RegressorMixin);
GradientBoostingRegressor._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// GradientBoostingClassifier
// ────────────────────────────────────────────────────────────────────

/**
 * Multinomial (or binary) gradient boosting with cross-entropy loss.
 *
 *   F_0[k] = log(prior[k])  (log-prior init)
 *   for m = 1..n_estimators:
 *     for each class k:
 *       p[i, k] = softmax(F_m[i, :])[k]
 *       g[i] = y_one_hot[i, k] - p[i, k]   (negative gradient)
 *       tree_{m,k} fit to g
 *       leaf_value adjustment via Newton step:
 *         γ_l = (K-1)/K * Σ_{i ∈ leaf} g[i] / Σ_{i ∈ leaf} |g[i]|(1-|g[i]|)
 *       F_m[i, k] += learning_rate * γ_{leaf(i)}
 *
 * v0.2 ships log_loss only. We use the simpler per-leaf identity-update
 * (no Newton refinement — slightly slower convergence than sklearn but
 * conceptually clean and adequate for this scale). Trees fit to raw
 * gradients then their predictions are scaled by learning_rate.
 *
 * Fitted: estimators_ (length n_estimators × n_classes when multinomial,
 *         length n_estimators × 1 when binary), classes_, init_value_
 *         (Float64Array of log-priors per class), n_features_in_.
 */
class GradientBoostingClassifier extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.loss = params.loss ?? 'log_loss';
    this.learning_rate = params.learning_rate ?? 0.1;
    this.n_estimators = params.n_estimators ?? 100;
    this.max_depth = params.max_depth ?? 3;
    this.min_samples_split = params.min_samples_split ?? 2;
    this.min_samples_leaf = params.min_samples_leaf ?? 1;
    this.max_features = params.max_features ?? null;
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_ENSEMBLE;
  }

  fit(X, y, _opts) {
    if (this.loss !== 'log_loss') {
      throw new ValidationError(
        `GradientBoostingClassifier: loss='${this.loss}' not supported in v0.2 (use 'log_loss')`);
    }
    const X_info = asMatrix(X);
    const { shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `GradientBoostingClassifier.fit: y length ${yv.length} != n_samples ${n}`);
    }
    const { classes, encoded } = _encodeClassesEnsemble_ensemble(yv);
    const K = classes.length;
    // Init = log of class priors.
    const counts = new Float64Array(K);
    for (let i = 0; i < n; i++) counts[encoded[i] | 0]++;
    const init_value = new Float64Array(K);
    for (let c = 0; c < K; c++) init_value[c] = Math.log(Math.max(1e-300, counts[c] / n));
    // Working logits F[n, K]. Store flat row-major.
    const F = new Float64Array(n * K);
    for (let i = 0; i < n; i++) for (let c = 0; c < K; c++) F[i * K + c] = init_value[c];
    const baseSeed = this.random_state == null
      ? Math.floor(Math.random() * 0x7fffffff)
      : this.random_state;
    const rng = mulberry32(baseSeed);

    // estimators_ stored as 2D: [n_estimators][K] (binary still has K=2 here
    // — sklearn special-cases binary to use K=1 trees, but K=2 is simpler
    // and the predictions match modulo the softmax normalization).
    const estimators = [];
    const probs = new Float64Array(n * K);
    const grad = new Float64Array(n);

    for (let stage = 0; stage < this.n_estimators; stage++) {
      // Compute softmax probabilities row by row.
      for (let i = 0; i < n; i++) {
        let max = -Infinity;
        for (let c = 0; c < K; c++) if (F[i * K + c] > max) max = F[i * K + c];
        let denom = 0;
        for (let c = 0; c < K; c++) {
          const e = Math.exp(F[i * K + c] - max);
          probs[i * K + c] = e;
          denom += e;
        }
        const inv = 1 / denom;
        for (let c = 0; c < K; c++) probs[i * K + c] *= inv;
      }
      const stage_trees = new Array(K);
      for (let c = 0; c < K; c++) {
        // Gradient = y_one_hot[:, c] - p[:, c]
        for (let i = 0; i < n; i++) {
          grad[i] = ((encoded[i] | 0) === c ? 1 : 0) - probs[i * K + c];
        }
        const tree_seed = (rng() * 0x7fffffff) | 0;
        const tree = new DecisionTreeRegressor({
          criterion: 'squared_error',
          splitter: 'best',
          max_depth: this.max_depth,
          min_samples_split: this.min_samples_split,
          min_samples_leaf: this.min_samples_leaf,
          max_features: this.max_features,
          random_state: tree_seed,
        });
        tree.fit(X, grad);
        stage_trees[c] = tree;
      }
      // Apply this stage's trees to F.
      for (let c = 0; c < K; c++) {
        const yh = stage_trees[c].predict(X);
        for (let i = 0; i < n; i++) F[i * K + c] += this.learning_rate * yh[i];
      }
      estimators.push(stage_trees);
    }

    this.estimators_ = estimators;
    this.classes_ = classes;
    this.n_classes_ = K;
    this.init_value_ = init_value;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  decision_function(X) {
    if (!this.estimators_) throw new ValidationError('GradientBoostingClassifier: not fitted');
    const { shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const n = shape[0];
    const K = this.n_classes_;
    const out = new Float64Array(n * K);
    for (let i = 0; i < n; i++) for (let c = 0; c < K; c++) out[i * K + c] = this.init_value_[c];
    for (const stage_trees of this.estimators_) {
      for (let c = 0; c < K; c++) {
        const yh = stage_trees[c].predict(X);
        for (let i = 0; i < n; i++) out[i * K + c] += this.learning_rate * yh[i];
      }
    }
    out.shape = [n, K];
    return out;
  }

  predict_proba(X) {
    const F = this.decision_function(X);
    const n = F.length / this.n_classes_;
    const K = this.n_classes_;
    const out = new Float64Array(n * K);
    for (let i = 0; i < n; i++) {
      let max = -Infinity;
      for (let c = 0; c < K; c++) if (F[i * K + c] > max) max = F[i * K + c];
      let denom = 0;
      for (let c = 0; c < K; c++) {
        const e = Math.exp(F[i * K + c] - max);
        out[i * K + c] = e;
        denom += e;
      }
      const inv = 1 / denom;
      for (let c = 0; c < K; c++) out[i * K + c] *= inv;
    }
    out.shape = [n, K];
    return out;
  }

  predict(X) {
    const P = this.predict_proba(X);
    const K = this.n_classes_;
    const n = P.length / K;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0, bestP = -1;
      for (let c = 0; c < K; c++) {
        if (P[i * K + c] > bestP) { best = c; bestP = P[i * K + c]; }
      }
      out[i] = this.classes_[best];
    }
    return out;
  }

  __sklearn_clone__() {
    return new GradientBoostingClassifier(this.get_params(false));
  }

  _toMimicIo() {
    return _gbEncode_ensemble(this, 'GradientBoostingClassifier', /* classifier */ true);
  }
  static _fromMimicIo(json, opts = {}) {
    return _gbDecode_ensemble(GradientBoostingClassifier, json, opts, /* classifier */ true);
  }
}

Object.assign(GradientBoostingClassifier.prototype, ClassifierMixin);
GradientBoostingClassifier._estimator_type = 'classifier';

// ────────────────────────────────────────────────────────────────────
// GradientBoosting helpers
// ────────────────────────────────────────────────────────────────────

function _encodeClassesEnsemble_ensemble(yv) {
  const seen = new Map();
  const order = [];
  for (let i = 0; i < yv.length; i++) {
    const v = yv[i];
    if (!seen.has(v)) { seen.set(v, true); order.push(v); }
  }
  order.sort((a, b) => a - b);
  const idx = new Map();
  for (let c = 0; c < order.length; c++) idx.set(order[c], c);
  const encoded = new Float64Array(yv.length);
  for (let i = 0; i < yv.length; i++) encoded[i] = idx.get(yv[i]);
  return { classes: Float64Array.from(order), encoded };
}

function _gbEncode_ensemble(est, class_name, classifier) {
  const params = est.get_params(false);
  const out = {
    format: 'mimic-io',
    version: 2,
    class: class_name,
    module: est._module,
    params,
  };
  if (est.estimators_) {
    if (classifier) {
      // estimators_ is [n_estimators][n_classes].
      out.fitted = {
        estimators_: est.estimators_.map(stage => stage.map(t => dump(t))),
        classes_: Array.from(est.classes_),
        n_classes_: est.n_classes_,
        init_value_: Array.from(est.init_value_),
        n_features_in_: est.n_features_in_,
      };
    } else {
      out.fitted = {
        estimators_: est.estimators_.map(t => dump(t)),
        init_value_: est.init_value_,
        n_features_in_: est.n_features_in_,
      };
      if (est.train_score_) out.fitted.train_score_ = Array.from(est.train_score_);
    }
  } else {
    out.fitted = null;
  }
  return out;
}

function _gbDecode_ensemble(Ctor, json, opts, classifier) {
  const inst = new Ctor(json.params ?? {});
  if (!json.fitted) return inst;
  inst.n_features_in_ = json.fitted.n_features_in_;
  if (classifier) {
    inst.estimators_ = (json.fitted.estimators_ ?? []).map(
      stage => stage.map(j => load(j, opts)));
    inst.classes_ = Float64Array.from(json.fitted.classes_);
    inst.n_classes_ = json.fitted.n_classes_;
    inst.init_value_ = Float64Array.from(json.fitted.init_value_);
  } else {
    inst.estimators_ = (json.fitted.estimators_ ?? []).map(j => load(j, opts));
    inst.init_value_ = json.fitted.init_value_;
    if (json.fitted.train_score_) inst.train_score_ = Float64Array.from(json.fitted.train_score_);
  }
  return inst;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('RandomForestClassifier', RandomForestClassifier, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('RandomForestRegressor', RandomForestRegressor, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('ExtraTreesClassifier', ExtraTreesClassifier, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('ExtraTreesRegressor', ExtraTreesRegressor, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('BaggingClassifier', BaggingClassifier, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('BaggingRegressor', BaggingRegressor, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('GradientBoostingClassifier', GradientBoostingClassifier, { module: MODULE_ID_ENSEMBLE });
learnRegistry.register('GradientBoostingRegressor', GradientBoostingRegressor, { module: MODULE_ID_ENSEMBLE });

// ── impute.js ──

// Imputation — SimpleImputer, KNNImputer, BDLImputer.
//
// Two flavors of missingness:
//   - generic (NaN markers): SimpleImputer, KNNImputer
//   - censored (below-detection-limit): BDLImputer (geo-distinctive,
//     SPEC §5.3)
//
// The two are conceptually distinct and shouldn't be conflated:
// generic missing means "we don't know the value"; censored missing
// means "we know the value is small but not how small". For assay
// data, mixing them produces statistically wrong downstream estimates.




// Cross-package: scitra's ndtri (inverse normal CDF) for lognormal ROS.

const MODULE_ID_IMPUTE = '@gcu/learn.impute';

// ────────────────────────────────────────────────────────────────────
// SimpleImputer
// ────────────────────────────────────────────────────────────────────

/**
 * Per-column imputation with mean / median / most_frequent / constant.
 *
 * Hyperparameters:
 *   - missing_values  (number, default NaN) — value treated as missing
 *   - strategy        ('mean' | 'median' | 'most_frequent' | 'constant')
 *   - fill_value      (number, used by strategy='constant'; default 0)
 *   - keep_empty_features (bool, default false) — whether to keep all-missing
 *                     columns in output (filled with 0 / fill_value)
 *
 * Fitted attributes:
 *   - statistics_     (Float64Array, n_features)
 *   - n_features_in_, n_samples_seen_
 */
class SimpleImputer extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.missing_values = params.missing_values ?? NaN;
    this.strategy = params.strategy ?? 'mean';
    this.fill_value = params.fill_value ?? 0;
    this.keep_empty_features = params.keep_empty_features ?? false;
    this._module = MODULE_ID_IMPUTE;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X, { allow_nan: true });
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 1) throw new ValidationError('SimpleImputer.fit: X has 0 samples');
    const isMissingNaN = Number.isNaN(this.missing_values);
    const isMissing = (v) => isMissingNaN ? Number.isNaN(v) : v === this.missing_values;
    const stats = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const col = [];
      for (let i = 0; i < n; i++) {
        const v = data[i * m + j];
        if (!isMissing(v)) col.push(v);
      }
      if (col.length === 0) {
        // All-missing column — fill_value (or 0 for non-constant strategies).
        stats[j] = this.strategy === 'constant' ? this.fill_value : 0;
        continue;
      }
      switch (this.strategy) {
        case 'mean': {
          let s = 0; for (const v of col) s += v;
          stats[j] = s / col.length;
          break;
        }
        case 'median': {
          col.sort((a, b) => a - b);
          const mid = col.length >> 1;
          stats[j] = (col.length & 1) ? col[mid] : 0.5 * (col[mid - 1] + col[mid]);
          break;
        }
        case 'most_frequent': {
          const counts = new Map();
          for (const v of col) counts.set(v, (counts.get(v) ?? 0) + 1);
          let best = col[0], bestN = 0;
          for (const [v, c] of counts) if (c > bestN) { best = v; bestN = c; }
          stats[j] = best;
          break;
        }
        case 'constant':
          stats[j] = this.fill_value;
          break;
        default:
          throw new ValidationError(
            `SimpleImputer: strategy='${this.strategy}' must be 'mean'|'median'|'most_frequent'|'constant'`);
      }
    }
    this.statistics_ = stats;
    this.n_features_in_ = m;
    this.n_samples_seen_ = n;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    if (this.statistics_ == null) throw new ValidationError('SimpleImputer: not fitted');
    const { data, shape } = asMatrix(X, { allow_nan: true });
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const isMissingNaN = Number.isNaN(this.missing_values);
    const out = new Float64Array(n * m);
    for (let i = 0; i < n; i++) {
      const off = i * m;
      for (let j = 0; j < m; j++) {
        const v = data[off + j];
        const missing = isMissingNaN ? Number.isNaN(v) : v === this.missing_values;
        out[off + j] = missing ? this.statistics_[j] : v;
      }
    }
    out.shape = [n, m];
    return out;
  }

}

Object.assign(SimpleImputer.prototype, TransformerMixin);
// Override AFTER the mixin so allow_nan: true sticks (Object.assign
// would otherwise overwrite the class's __sklearn_tags__ method).
SimpleImputer.prototype.__sklearn_tags__ = function () {
  const base = TransformerMixin.__sklearn_tags__.call(this);
  return { ...base, allow_nan: true };
};
SimpleImputer._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// KNNImputer
// ────────────────────────────────────────────────────────────────────

/**
 * KNN imputation. For each row with missing values, finds the
 * `n_neighbors` closest training rows under nan_euclidean distance
 * (which ignores features missing in either operand and rescales by
 * present-feature count), then averages those neighbors' values to
 * fill the missing cells.
 *
 * Hyperparameters:
 *   - n_neighbors    (int, default 5)
 *   - weights        ('uniform' | 'distance', default 'uniform')
 *   - missing_values (number, default NaN)
 *   - keep_empty_features (bool, default false)
 *
 * Fitted attributes: fit_X_, mask_fit_X_, n_features_in_.
 *
 * Algorithm: brute-force O(n_train × n_test × m). KDTree integration
 * deferred — nan_euclidean isn't a standard KDTree metric and writing
 * a custom one for v0.2 isn't justified at the n where browser
 * imputation runs (≤ a few thousand samples).
 */
class KNNImputer extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_neighbors = params.n_neighbors ?? 5;
    this.weights = params.weights ?? 'uniform';
    this.missing_values = params.missing_values ?? NaN;
    this.keep_empty_features = params.keep_empty_features ?? false;
    this._module = MODULE_ID_IMPUTE;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X, { allow_nan: true });
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (n < 1) throw new ValidationError('KNNImputer.fit: X has 0 samples');
    const isMissingNaN = Number.isNaN(this.missing_values);
    const mask = new Uint8Array(n * m);  // 1 = present, 0 = missing
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const v = data[i * m + j];
        const missing = isMissingNaN ? Number.isNaN(v) : v === this.missing_values;
        mask[i * m + j] = missing ? 0 : 1;
      }
    }
    this.fit_X_ = new Float64Array(data);  // copy to detach from caller
    this.mask_fit_X_ = mask;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  transform(X) {
    if (this.fit_X_ == null) throw new ValidationError('KNNImputer: not fitted');
    const { data, shape } = asMatrix(X, { allow_nan: true });
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const fit_data = this.fit_X_;
    const fit_mask = this.mask_fit_X_;
    const fit_n = fit_data.length / m;
    const isMissingNaN = Number.isNaN(this.missing_values);
    const out = new Float64Array(n * m);
    out.set(data);  // start with the original values
    out.shape = [n, m];

    const k = this.n_neighbors;
    // Per-row processing.
    for (let i = 0; i < n; i++) {
      // Find which features are missing in this row.
      const missing_cols = [];
      for (let j = 0; j < m; j++) {
        const v = data[i * m + j];
        const missing = isMissingNaN ? Number.isNaN(v) : v === this.missing_values;
        if (missing) missing_cols.push(j);
      }
      if (missing_cols.length === 0) continue;
      // For each missing column, find the k nearest training rows that
      // have a present value for THAT column. Compute distance using
      // nan_euclidean (ignoring features missing in either side).
      for (const target_col of missing_cols) {
        const dists = [];
        for (let r = 0; r < fit_n; r++) {
          if (!fit_mask[r * m + target_col]) continue;  // training row missing for target
          let sumsq = 0;
          let n_present = 0;
          for (let j = 0; j < m; j++) {
            if (j === target_col) continue;  // exclude the target column itself
            const xv = data[i * m + j];
            const yv = fit_data[r * m + j];
            const x_present = !(isMissingNaN ? Number.isNaN(xv) : xv === this.missing_values);
            if (!x_present || !fit_mask[r * m + j]) continue;
            const d = xv - yv;
            sumsq += d * d;
            n_present++;
          }
          if (n_present === 0) {
            // No common present features — skip this candidate.
            continue;
          }
          // nan_euclidean: scale by present-feature factor.
          const dist = Math.sqrt((m - 1) / n_present * sumsq);
          dists.push({ r, dist });
        }
        if (dists.length === 0) {
          // Fallback: column mean from training data.
          let s = 0, c = 0;
          for (let r = 0; r < fit_n; r++) {
            if (fit_mask[r * m + target_col]) { s += fit_data[r * m + target_col]; c++; }
          }
          out[i * m + target_col] = c > 0 ? s / c : 0;
          continue;
        }
        // Sort by distance, take top-k.
        dists.sort((a, b) => a.dist - b.dist);
        const top = dists.slice(0, Math.min(k, dists.length));
        // Aggregate.
        if (this.weights === 'distance') {
          let num = 0, den = 0;
          for (const t of top) {
            const w = t.dist === 0 ? 1e12 : 1 / t.dist;
            num += w * fit_data[t.r * m + target_col];
            den += w;
          }
          out[i * m + target_col] = den > 0 ? num / den : 0;
        } else {
          let s = 0;
          for (const t of top) s += fit_data[t.r * m + target_col];
          out[i * m + target_col] = s / top.length;
        }
      }
    }
    return out;
  }

}

Object.assign(KNNImputer.prototype, TransformerMixin);
KNNImputer.prototype.__sklearn_tags__ = function () {
  const base = TransformerMixin.__sklearn_tags__.call(this);
  return { ...base, allow_nan: true };
};
KNNImputer._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// BDLImputer (geo-distinctive)
// ────────────────────────────────────────────────────────────────────

/**
 * Below-detection-limit imputation. Distinct from generic imputation
 * because the missingness is informative (the value exists; we just
 * know it's small).
 *
 * Hyperparameters:
 *   - detection_limits  (number | array, default 0.001) — per-column
 *                       detection limits. Scalar broadcasts to all cols.
 *   - strategy          'multiplicative' (default; replace BDL with
 *                       0.65 × DL — Aitchison's compositional default)
 *                     | 'half' (replace BDL with 0.5 × DL — simpler
 *                       convention used widely outside compositional
 *                       data analysis)
 *                     | 'lognormal_ros' (fit lognormal MLE to above-
 *                       detection values, impute below-detection from
 *                       the lower tail using Blom-style plotting
 *                       positions and the fitted CDF)
 *   - random_state      (int|null) — only used by lognormal_ros to seed
 *                       plotting-position offsets if needed
 *
 * Convention. Zero values are treated as BDL markers — matches
 * @gcu/learn.compositional's _multiplicativeReplace. Negative values
 * are NOT supported (would conflate BDL with measurement error). For
 * lognormal_ros, columns with all-zero or single-non-zero values fall
 * back to multiplicative replacement (insufficient data for MLE).
 *
 * Fitted attributes:
 *   - detection_limits_  (Float64Array, n_features)
 *   - lognormal_params_  (Array of {mu, sigma} per column; only set when
 *                       strategy='lognormal_ros')
 *   - n_features_in_, n_samples_seen_
 *
 * Inverse transform is not defined — once a BDL value is imputed, the
 * original "below detection" status is lost.
 */
class BDLImputer extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.detection_limits = params.detection_limits ?? 0.001;
    this.strategy = params.strategy ?? 'multiplicative';
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_IMPUTE;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X, { allow_nan: false });
    const { data, shape } = X_info;
    const [n, m] = shape;
    const dl = _resolveDLArray_impute(this.detection_limits, m);
    this.detection_limits_ = dl;
    this.n_features_in_ = m;
    this.n_samples_seen_ = n;
    captureFeatureNames(this, X_info);
    if (this.strategy === 'lognormal_ros') {
      // Fit lognormal MLE per column to above-detection values.
      this.lognormal_params_ = new Array(m);
      for (let j = 0; j < m; j++) {
        const above = [];
        for (let i = 0; i < n; i++) {
          const v = data[i * m + j];
          if (v > 0) above.push(v);
        }
        if (above.length < 2) {
          this.lognormal_params_[j] = null;  // fallback to multiplicative
          continue;
        }
        let log_sum = 0;
        for (const v of above) log_sum += Math.log(v);
        const mu = log_sum / above.length;
        let var_sum = 0;
        for (const v of above) {
          const d = Math.log(v) - mu;
          var_sum += d * d;
        }
        const sigma = Math.sqrt(var_sum / above.length);
        this.lognormal_params_[j] = { mu, sigma, n_above: above.length };
      }
    } else if (this.strategy !== 'multiplicative' && this.strategy !== 'half') {
      throw new ValidationError(
        `BDLImputer: strategy='${this.strategy}' must be 'multiplicative'|'half'|'lognormal_ros'`);
    }
    return this;
  }

  transform(X) {
    if (this.detection_limits_ == null) throw new ValidationError('BDLImputer: not fitted');
    const { data, shape } = asMatrix(X, { allow_nan: false });
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const dl = this.detection_limits_;
    const out = new Float64Array(n * m);
    out.set(data);
    if (this.strategy === 'multiplicative') {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          if (out[i * m + j] === 0) out[i * m + j] = 0.65 * dl[j];
        }
      }
    } else if (this.strategy === 'half') {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          if (out[i * m + j] === 0) out[i * m + j] = 0.5 * dl[j];
        }
      }
    } else if (this.strategy === 'lognormal_ros') {
      // For each column, find BDL positions and impute from the lower tail.
      // Blom plotting positions: p_i = (i - 0.375) / (n_below + 0.25), i = 1..n_below
      // Map to standard normal quantiles via ndtri, then to lognormal:
      //   x_i = exp(mu + sigma * z_i)
      // Constrain to (0, DL_j) — clip if mu/sigma yields values above DL_j.
      for (let j = 0; j < m; j++) {
        const params = this.lognormal_params_[j];
        // Collect BDL positions for this column.
        const bdl_positions = [];
        for (let i = 0; i < n; i++) {
          if (out[i * m + j] === 0) bdl_positions.push(i);
        }
        if (bdl_positions.length === 0) continue;
        if (!params) {
          // Fallback to multiplicative replacement.
          for (const i of bdl_positions) out[i * m + j] = 0.65 * dl[j];
          continue;
        }
        const { mu, sigma } = params;
        const n_below = bdl_positions.length;
        // Generate plotting-position quantile values (one per BDL position),
        // then assign sequentially to maintain reproducibility.
        for (let r = 0; r < n_below; r++) {
          const p = (r + 0.625) / (n_below + 0.25);  // Blom-like
          const z = ndtri(p);
          let v = Math.exp(mu + sigma * z);
          // Clip to (0, DL_j) since BDL means we know v < DL_j.
          if (v >= dl[j]) v = 0.65 * dl[j];
          if (v <= 0) v = 0.65 * dl[j];
          out[bdl_positions[r] * m + j] = v;
        }
      }
    }
    out.shape = [n, m];
    return out;
  }

  // Tag exposes that we *don't* allow NaN — only zeros are BDL markers.
}

Object.assign(BDLImputer.prototype, TransformerMixin);
BDLImputer._estimator_type = 'transformer';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function _resolveDLArray_impute(spec, m) {
  if (typeof spec === 'number') {
    const out = new Float64Array(m);
    out.fill(spec);
    return out;
  }
  if (Array.isArray(spec) || ArrayBuffer.isView(spec)) {
    if (spec.length !== m) {
      throw new ValidationError(
        `BDLImputer: detection_limits length ${spec.length} != n_features ${m}`);
    }
    const out = new Float64Array(m);
    for (let j = 0; j < m; j++) out[j] = +spec[j];
    return out;
  }
  throw new ValidationError(
    `BDLImputer: detection_limits must be number or array; got ${typeof spec}`);
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('SimpleImputer', SimpleImputer, { module: MODULE_ID_IMPUTE });
learnRegistry.register('KNNImputer', KNNImputer, { module: MODULE_ID_IMPUTE });
learnRegistry.register('BDLImputer', BDLImputer, { module: MODULE_ID_IMPUTE });

// ── neighbors.js ──

// k-Nearest Neighbors — KNeighborsClassifier + KNeighborsRegressor.
//
// Backed by @gcu/scitra's KDTree (no re-implementation; reuse the
// existing well-tested spatial index). The tree is rebuilt from
// `fit_X_` on load — KDTree itself isn't serializable, but the
// underlying point cloud is.
//
// Distance metric: Euclidean only in v0.2 (KDTree's default and only
// metric). Manhattan / Chebyshev / Minkowski deferred — they need a
// different KDTree implementation that's not currently in scitra.




// Cross-package: scitra's KDTree.

const MODULE_ID_NEIGHBORS = '@gcu/learn.neighbors';

// ────────────────────────────────────────────────────────────────────
// KNeighborsClassifier
// ────────────────────────────────────────────────────────────────────

/**
 * Classifier based on k nearest training samples (Euclidean distance).
 *
 * Hyperparameters:
 *   - n_neighbors  (int, default 5)
 *   - weights      ('uniform' | 'distance', default 'uniform')
 *
 * Fitted attributes: fit_X_, fit_y_ (encoded), classes_,
 *                    n_features_in_, _kdtree (rebuilt on load).
 *
 * predict_proba returns a normalized class-frequency table over the
 * k-NN neighborhood (uniform-weighted; distance-weighted variant
 * accumulates inverse-distance weights instead).
 */
class KNeighborsClassifier extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_neighbors = params.n_neighbors ?? 5;
    this.weights = params.weights ?? 'uniform';
    this._module = MODULE_ID_NEIGHBORS;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `KNeighborsClassifier.fit: y length ${yv.length} != n_samples ${n}`);
    }
    const { classes, encoded } = _encodeClasses_neighbors(yv);
    this.fit_X_ = new Float64Array(data);
    this.fit_y_ = encoded;
    this.classes_ = classes;
    this.n_features_in_ = m;
    this._kdtree = _buildKDTree_neighbors(this.fit_X_, n, m);
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    const proba = this.predict_proba(X);
    const k = this.classes_.length;
    const n = proba.length / k;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0, bestP = -1;
      for (let c = 0; c < k; c++) {
        if (proba[i * k + c] > bestP) { best = c; bestP = proba[i * k + c]; }
      }
      out[i] = this.classes_[best];
    }
    return out;
  }

  predict_proba(X) {
    if (this._kdtree == null) throw new ValidationError('KNeighborsClassifier: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = Math.min(this.n_neighbors, this._kdtree.n);
    const K = this.classes_.length;
    // Batch-query KDTree.
    const points = _toRowArray_neighbors(data, n, m);
    const { dist, idx } = this._kdtree.queryBatch(points, k);
    const out = new Float64Array(n * K);
    for (let i = 0; i < n; i++) {
      let total = 0;
      for (let r = 0; r < k; r++) {
        const ni = idx[i * k + r];
        const c = this.fit_y_[ni] | 0;
        const w = this.weights === 'distance'
          ? (dist[i * k + r] === 0 ? 1e12 : 1 / dist[i * k + r])
          : 1;
        out[i * K + c] += w;
        total += w;
      }
      const inv = total === 0 ? 0 : 1 / total;
      for (let c = 0; c < K; c++) out[i * K + c] *= inv;
    }
    out.shape = [n, K];
    return out;
  }

  __sklearn_clone__() {
    return new KNeighborsClassifier(this.get_params(false));
  }

  _toMimicIo() {
    return _knnEncode_neighbors(this, 'KNeighborsClassifier', /* classifier */ true);
  }

  static _fromMimicIo(json, opts = {}) {
    return _knnDecode_neighbors(KNeighborsClassifier, json, opts, /* classifier */ true);
  }
}

Object.assign(KNeighborsClassifier.prototype, ClassifierMixin);
KNeighborsClassifier._estimator_type = 'classifier';

// ────────────────────────────────────────────────────────────────────
// KNeighborsRegressor
// ────────────────────────────────────────────────────────────────────

class KNeighborsRegressor extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_neighbors = params.n_neighbors ?? 5;
    this.weights = params.weights ?? 'uniform';
    this._module = MODULE_ID_NEIGHBORS;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `KNeighborsRegressor.fit: y length ${yv.length} != n_samples ${n}`);
    }
    this.fit_X_ = new Float64Array(data);
    this.fit_y_ = new Float64Array(yv);
    this.n_features_in_ = m;
    this._kdtree = _buildKDTree_neighbors(this.fit_X_, n, m);
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    if (this._kdtree == null) throw new ValidationError('KNeighborsRegressor: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = Math.min(this.n_neighbors, this._kdtree.n);
    const points = _toRowArray_neighbors(data, n, m);
    const { dist, idx } = this._kdtree.queryBatch(points, k);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (this.weights === 'distance') {
        let num = 0, den = 0;
        for (let r = 0; r < k; r++) {
          const w = dist[i * k + r] === 0 ? 1e12 : 1 / dist[i * k + r];
          num += w * this.fit_y_[idx[i * k + r]];
          den += w;
        }
        out[i] = den === 0 ? 0 : num / den;
      } else {
        let s = 0;
        for (let r = 0; r < k; r++) s += this.fit_y_[idx[i * k + r]];
        out[i] = s / k;
      }
    }
    return out;
  }

  __sklearn_clone__() {
    return new KNeighborsRegressor(this.get_params(false));
  }

  _toMimicIo() {
    return _knnEncode_neighbors(this, 'KNeighborsRegressor', /* classifier */ false);
  }

  static _fromMimicIo(json, opts = {}) {
    return _knnDecode_neighbors(KNeighborsRegressor, json, opts, /* classifier */ false);
  }
}

Object.assign(KNeighborsRegressor.prototype, RegressorMixin);
KNeighborsRegressor._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

// Build a KDTree from a flat Float64Array. KDTree's constructor expects
// either an array of arrays OR a flat Float64Array with an opts object
// declaring n + d. We use the array-of-arrays path for simplicity.
function _buildKDTree_neighbors(data, n, m) {
  return new KDTree(_toRowArray_neighbors(data, n, m));
}

// Reshape a flat Float64Array (length n*m) into an array of m-length rows.
function _toRowArray_neighbors(data, n, m) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = new Array(m);
    const off = i * m;
    for (let j = 0; j < m; j++) row[j] = data[off + j];
    rows[i] = row;
  }
  return rows;
}

function _encodeClasses_neighbors(yv) {
  const seen = new Map();
  const order = [];
  for (let i = 0; i < yv.length; i++) {
    const v = yv[i];
    if (!seen.has(v)) { seen.set(v, true); order.push(v); }
  }
  order.sort((a, b) => a - b);
  const idx = new Map();
  for (let c = 0; c < order.length; c++) idx.set(order[c], c);
  const encoded = new Float64Array(yv.length);
  for (let i = 0; i < yv.length; i++) encoded[i] = idx.get(yv[i]);
  return { classes: Float64Array.from(order), encoded };
}

// mimic-io codec: save the fit point cloud + targets; rebuild the
// KDTree on load (KDTree itself isn't serializable — it's an in-memory
// index over the points).
function _knnEncode_neighbors(est, class_name, classifier) {
  const params = est.get_params(false);
  const out = {
    format: 'mimic-io',
    version: 2,
    class: class_name,
    module: est._module,
    params,
  };
  if (est.fit_X_) {
    out.fitted = {
      fit_X_: est.fit_X_,
      fit_y_: est.fit_y_,
      n_features_in_: est.n_features_in_,
    };
    if (classifier) out.fitted.classes_ = Array.from(est.classes_);
  } else {
    out.fitted = null;
  }
  return out;
}

function _knnDecode_neighbors(Ctor, json, opts, classifier) {
  const inst = new Ctor(json.params ?? {});
  if (json.fitted) {
    inst.fit_X_ = json.fitted.fit_X_;  // already a Float64Array post-mimic-io decode
    inst.fit_y_ = json.fitted.fit_y_;
    inst.n_features_in_ = json.fitted.n_features_in_;
    if (classifier) inst.classes_ = Float64Array.from(json.fitted.classes_);
    const n = inst.fit_X_.length / inst.n_features_in_;
    inst._kdtree = _buildKDTree_neighbors(inst.fit_X_, n, inst.n_features_in_);
  }
  return inst;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('KNeighborsClassifier', KNeighborsClassifier, { module: MODULE_ID_NEIGHBORS });
learnRegistry.register('KNeighborsRegressor', KNeighborsRegressor, { module: MODULE_ID_NEIGHBORS });

// ── mixture.js ──

// Gaussian Mixture Models — soft clustering / density estimation via EM.
//
// Sklearn-compatible (`sklearn.mixture.GaussianMixture`). v0.2 ships
// covariance_type='full' only (the most general); 'tied' / 'diag' /
// 'spherical' are simpler special cases that fall out of the same EM
// loop and land in v0.3.
//
// Numerical strategy. We store `precisions_cholesky_` (sklearn shape):
// the upper-triangular U such that Σ⁻¹ = U Uᵀ, computed once per M-step
// from the covariance Cholesky factor L (Σ = L Lᵀ → U = L⁻ᵀ). With this,
//   log N(x | μ, Σ) = -½ (m log 2π) + ½ log|Σ⁻¹| - ½ ‖Uᵀ(x - μ)‖²
// which avoids ever forming Σ⁻¹ explicitly and gives cheap log-density.





// Cross-package: line.cholesky for the precision factor.

const MODULE_ID_MIXTURE = '@gcu/learn.mixture';

// ────────────────────────────────────────────────────────────────────
// GaussianMixture
// ────────────────────────────────────────────────────────────────────

class GaussianMixture extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_components = params.n_components ?? 1;
    this.covariance_type = params.covariance_type ?? 'full';
    this.tol = params.tol ?? 1e-3;
    this.reg_covar = params.reg_covar ?? 1e-6;
    this.max_iter = params.max_iter ?? 100;
    this.n_init = params.n_init ?? 1;
    this.init_params = params.init_params ?? 'kmeans';
    this.random_state = params.random_state ?? null;
    this._module = MODULE_ID_MIXTURE;
  }

  fit(X, _y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const [n, m] = shape;
    if (this.covariance_type !== 'full') {
      throw new ValidationError(
        `GaussianMixture: covariance_type='${this.covariance_type}' not supported in v0.2 (use 'full')`);
    }
    if (n < this.n_components) {
      throw new ValidationError(
        `GaussianMixture: n_components=${this.n_components} > n_samples=${n}`);
    }
    const baseSeed = this.random_state == null
      ? Math.floor(Math.random() * 0x7fffffff)
      : this.random_state;

    let best = null;
    for (let trial = 0; trial < this.n_init; trial++) {
      const rng = mulberry32(baseSeed + trial);
      const result = _emFit_mixture(
        data, n, m, this.n_components, this.tol, this.reg_covar,
        this.max_iter, this.init_params, rng);
      if (best == null || result.lower_bound > best.lower_bound) best = result;
    }
    this.weights_ = best.weights;
    this.means_ = best.means; this.means_.shape = [this.n_components, m];
    this.covariances_ = best.covariances;
    this.precisions_cholesky_ = best.precisions_cholesky;
    this.converged_ = best.converged;
    this.n_iter_ = best.n_iter;
    this.lower_bound_ = best.lower_bound;
    this.n_features_in_ = m;
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    const proba = this.predict_proba(X);
    const k = this.n_components;
    const n = proba.length / k;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0, bestP = -1;
      for (let c = 0; c < k; c++) {
        if (proba[i * k + c] > bestP) { best = c; bestP = proba[i * k + c]; }
      }
      out[i] = best;
    }
    return out;
  }

  predict_proba(X) {
    if (this.weights_ == null) throw new ValidationError('GaussianMixture: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_components;
    const log_resp = _computeLogResp_mixture(
      data, n, m, k, this.weights_, this.means_, this.precisions_cholesky_);
    // Convert log-responsibilities to probabilities (already normalized).
    const out = new Float64Array(n * k);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) out[i * k + c] = Math.exp(log_resp[i * k + c]);
    }
    out.shape = [n, k];
    return out;
  }

  /** log-responsibilities directly — more accurate than log(predict_proba). */
  predict_log_proba(X) {
    if (this.weights_ == null) throw new ValidationError('GaussianMixture: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_components;
    const log_resp = _computeLogResp_mixture(
      data, n, m, k, this.weights_, this.means_, this.precisions_cholesky_);
    log_resp.shape = [n, k];
    return log_resp;
  }

  score_samples(X) {
    if (this.weights_ == null) throw new ValidationError('GaussianMixture: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    return _logProbX_mixture(data, n, m, this.n_components,
      this.weights_, this.means_, this.precisions_cholesky_);
  }

  score(X, _y, _opts) {
    const ll = this.score_samples(X);
    let s = 0; for (let i = 0; i < ll.length; i++) s += ll[i];
    return s / ll.length;
  }

}

const _gmmScore_mixture = GaussianMixture.prototype.score;
Object.assign(GaussianMixture.prototype, ClusterMixin);
// Override after the mixin: GMM's default scorer is average log-likelihood,
// not silhouette (ClusterMixin's default). And ClusterMixin's fit_predict
// returns this.labels_, but GaussianMixture computes labels via predict().
GaussianMixture.prototype.score = _gmmScore_mixture;
GaussianMixture.prototype.fit_predict = function (X, y, opts) {
  return this.fit(X, y, opts).predict(X);
};
GaussianMixture._estimator_type = 'clusterer';

// ────────────────────────────────────────────────────────────────────
// EM core
// ────────────────────────────────────────────────────────────────────

// Returns { weights, means, covariances, precisions_cholesky,
//           converged, n_iter, lower_bound }.
function _emFit_mixture(X, n, m, k, tol, reg_covar, max_iter, init_params, rng) {
  // ── Initialize ──
  const means = init_params === 'kmeans'
    ? _kmeansPlusPlusMeans_mixture(X, n, m, k, rng)
    : _randomMeans_mixture(X, n, m, k, rng);
  // Initial covariances = sample covariance, replicated k times.
  const cov0 = _sampleCov_mixture(X, n, m, reg_covar);
  const covariances = new Array(k);
  for (let c = 0; c < k; c++) covariances[c] = cov0.slice();
  const weights = new Float64Array(k).fill(1 / k);
  let precisions_cholesky = _computePrecisionsCholesky_mixture(covariances, m, reg_covar);

  let prev_lb = -Infinity;
  let converged = false;
  let iter = 0;
  let lower_bound = -Infinity;
  for (iter = 0; iter < max_iter; iter++) {
    // ── E-step: log-responsibilities + log-likelihood per sample ──
    const log_resp = _computeLogResp_mixture(X, n, m, k, weights, means, precisions_cholesky);
    // ── M-step ──
    const Nk = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) Nk[c] += Math.exp(log_resp[i * k + c]);
    }
    // Update weights.
    for (let c = 0; c < k; c++) weights[c] = Math.max(1e-300, Nk[c] / n);
    // Update means.
    means.fill(0);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) {
        const r = Math.exp(log_resp[i * k + c]);
        for (let j = 0; j < m; j++) means[c * m + j] += r * X[i * m + j];
      }
    }
    for (let c = 0; c < k; c++) {
      const inv = 1 / Math.max(1e-300, Nk[c]);
      for (let j = 0; j < m; j++) means[c * m + j] *= inv;
    }
    // Update covariances.
    for (let c = 0; c < k; c++) {
      covariances[c].fill(0);
      const inv = 1 / Math.max(1e-300, Nk[c]);
      for (let i = 0; i < n; i++) {
        const r = Math.exp(log_resp[i * k + c]);
        for (let a = 0; a < m; a++) {
          const da = X[i * m + a] - means[c * m + a];
          for (let b = a; b < m; b++) {
            const db = X[i * m + b] - means[c * m + b];
            covariances[c][a * m + b] += r * da * db;
          }
        }
      }
      // Symmetrize + regularize.
      for (let a = 0; a < m; a++) {
        for (let b = a; b < m; b++) {
          covariances[c][a * m + b] *= inv;
          if (a === b) covariances[c][a * m + b] += reg_covar;
          covariances[c][b * m + a] = covariances[c][a * m + b];
        }
      }
    }
    precisions_cholesky = _computePrecisionsCholesky_mixture(covariances, m, reg_covar);
    // Recompute the lower bound (log-likelihood) from the post-update params.
    lower_bound = _logLikelihood_mixture(X, n, m, k, weights, means, precisions_cholesky);
    if (Math.abs(lower_bound - prev_lb) < tol) { converged = true; iter++; break; }
    prev_lb = lower_bound;
  }

  return {
    weights, means, covariances, precisions_cholesky,
    converged, n_iter: iter, lower_bound,
  };
}

// k-means++ initialization for means (mirrors cluster.js's _kmeansPlusPlusInit
// but produces just the centroids with no full Lloyd loop).
function _kmeansPlusPlusMeans_mixture(X, n, m, k, rng) {
  const means = new Float64Array(k * m);
  const i0 = Math.floor(rng() * n);
  for (let j = 0; j < m; j++) means[j] = X[i0 * m + j];
  const min_d2 = new Float64Array(n);
  for (let i = 0; i < n; i++) min_d2[i] = Infinity;
  _updateMinD2_mix_mixture(min_d2, X, n, m, means, 0);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) total += min_d2[i];
    let r = rng() * total;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      r -= min_d2[i];
      if (r <= 0) { pick = i; break; }
    }
    for (let j = 0; j < m; j++) means[c * m + j] = X[pick * m + j];
    _updateMinD2_mix_mixture(min_d2, X, n, m, means, c);
  }
  return means;
}

function _updateMinD2_mix_mixture(min_d2, X, n, m, means, c) {
  const off_c = c * m;
  for (let i = 0; i < n; i++) {
    let d = 0;
    const off_x = i * m;
    for (let j = 0; j < m; j++) {
      const diff = X[off_x + j] - means[off_c + j];
      d += diff * diff;
    }
    if (d < min_d2[i]) min_d2[i] = d;
  }
}

function _randomMeans_mixture(X, n, m, k, rng) {
  const means = new Float64Array(k * m);
  for (let c = 0; c < k; c++) {
    const i = Math.floor(rng() * n);
    for (let j = 0; j < m; j++) means[c * m + j] = X[i * m + j];
  }
  return means;
}

// Sample covariance of X with regularization on the diagonal.
function _sampleCov_mixture(X, n, m, reg) {
  const mean = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) mean[j] += X[i * m + j];
  }
  const inv_n = 1 / n;
  for (let j = 0; j < m; j++) mean[j] *= inv_n;
  const cov = new Float64Array(m * m);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < m; a++) {
      const da = X[i * m + a] - mean[a];
      for (let b = a; b < m; b++) {
        cov[a * m + b] += da * (X[i * m + b] - mean[b]);
      }
    }
  }
  for (let a = 0; a < m; a++) {
    for (let b = a; b < m; b++) {
      cov[a * m + b] *= inv_n;
      if (a === b) cov[a * m + b] += reg;
      cov[b * m + a] = cov[a * m + b];
    }
  }
  return cov;
}

// For each component, compute U such that Σ⁻¹ = U Uᵀ.
// line.cholesky returns lower-triangular L with Σ = L Lᵀ. The precision
// factor U = L⁻ᵀ — we solve L Y = I for Y then transpose (or equivalently
// invert L via back-substitution). For the small per-component matrices
// here, the simplest correct path is: invert L via forward-solve, then
// the resulting matrix is L⁻¹ (lower triangular). Take transpose → U.
function _computePrecisionsCholesky_mixture(covariances, m, reg_covar) {
  const out = new Array(covariances.length);
  for (let c = 0; c < covariances.length; c++) {
    let cov = covariances[c];
    let L;
    let attempts = 0;
    while (attempts < 5) {
      try {
        L = cholesky(new NdArray(cov, [m, m]));
        break;
      } catch (_) {
        // Non-PD — boost regularization and retry.
        cov = cov.slice();
        for (let a = 0; a < m; a++) cov[a * m + a] += reg_covar * Math.pow(10, attempts + 1);
        attempts++;
      }
    }
    if (!L) throw new ValidationError(
      `GaussianMixture: covariance for component ${c} is not positive-definite ` +
      `even after regularization boost. Try a larger reg_covar.`);
    // L_inv: invert lower triangular via column-wise forward substitution.
    const Linv = new Float64Array(m * m);
    for (let col = 0; col < m; col++) {
      // Solve L * x = e_col for x.
      const x = new Float64Array(m);
      x[col] = 1 / L.data[col * m + col];
      for (let i = col + 1; i < m; i++) {
        let s = 0;
        for (let j = col; j < i; j++) s += L.data[i * m + j] * x[j];
        x[i] = -s / L.data[i * m + i];
      }
      for (let i = 0; i < m; i++) Linv[i * m + col] = x[i];
    }
    // U = L⁻ᵀ → upper triangular (since L⁻¹ is lower triangular, transpose).
    const U = new Float64Array(m * m);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) U[i * m + j] = Linv[j * m + i];
    }
    out[c] = U;
  }
  return out;
}

// Compute log-responsibilities log P(component_c | x_i) for each (i, c).
// Output shape: [n * k] row-major.
function _computeLogResp_mixture(X, n, m, k, weights, means, precisions_cholesky) {
  // log_prob[i, c] = log w_c + log N(x_i | mu_c, Sigma_c)
  const log_prob = _logProbWeighted_mixture(X, n, m, k, weights, means, precisions_cholesky);
  const out = new Float64Array(n * k);
  for (let i = 0; i < n; i++) {
    let lmax = -Infinity;
    for (let c = 0; c < k; c++) if (log_prob[i * k + c] > lmax) lmax = log_prob[i * k + c];
    let denom = 0;
    for (let c = 0; c < k; c++) denom += Math.exp(log_prob[i * k + c] - lmax);
    const log_denom = lmax + Math.log(denom);
    for (let c = 0; c < k; c++) out[i * k + c] = log_prob[i * k + c] - log_denom;
  }
  return out;
}

// log P(x_i | params) — the marginal log-density over the mixture.
function _logProbX_mixture(X, n, m, k, weights, means, precisions_cholesky) {
  const log_prob = _logProbWeighted_mixture(X, n, m, k, weights, means, precisions_cholesky);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let lmax = -Infinity;
    for (let c = 0; c < k; c++) if (log_prob[i * k + c] > lmax) lmax = log_prob[i * k + c];
    let denom = 0;
    for (let c = 0; c < k; c++) denom += Math.exp(log_prob[i * k + c] - lmax);
    out[i] = lmax + Math.log(denom);
  }
  return out;
}

// Mean log-likelihood of X under the fitted mixture.
function _logLikelihood_mixture(X, n, m, k, weights, means, precisions_cholesky) {
  const ll = _logProbX_mixture(X, n, m, k, weights, means, precisions_cholesky);
  let s = 0; for (let i = 0; i < n; i++) s += ll[i];
  return s / n;
}

// log-prob plus log-weight per (sample, component). Uses precision Cholesky
// for fast log-density:
//   log N(x | μ, Σ) = -½ m log(2π) + log|U|_diag - ½ ‖Uᵀ(x - μ)‖²
// where Σ⁻¹ = U Uᵀ and log|Σ|^{-½} = sum(log diag(U)).
function _logProbWeighted_mixture(X, n, m, k, weights, means, precisions_cholesky) {
  const out = new Float64Array(n * k);
  const log_2pi = Math.log(2 * Math.PI);
  for (let c = 0; c < k; c++) {
    const U = precisions_cholesky[c];
    const log_det_prec_half = _logDiagSum_mixture(U, m);  // log |U| (since U is upper-tri)
    const log_w_c = Math.log(Math.max(1e-300, weights[c]));
    const norm_const = -0.5 * m * log_2pi + log_det_prec_half + log_w_c;
    for (let i = 0; i < n; i++) {
      // Compute Uᵀ * (x_i - μ_c) = (m-vector). U is upper tri.
      let sumsq = 0;
      for (let r = 0; r < m; r++) {
        // (Uᵀ d)[r] = sum_a U[a, r] * d[a]
        let s = 0;
        for (let a = 0; a <= r; a++) {
          s += U[a * m + r] * (X[i * m + a] - means[c * m + a]);
        }
        sumsq += s * s;
      }
      out[i * k + c] = norm_const - 0.5 * sumsq;
    }
  }
  return out;
}

function _logDiagSum_mixture(M, m) {
  let s = 0;
  for (let i = 0; i < m; i++) s += Math.log(Math.abs(M[i * m + i]));
  return s;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('GaussianMixture', GaussianMixture, { module: MODULE_ID_MIXTURE });

// ── cross_decomposition.js ──

// PLS regression — Partial Least Squares for high-dimensional / collinear
// design matrices. The chemometrics workhorse: when X is wide and the
// columns are correlated (typical of geochem assays / spectroscopy /
// drillhole composites), OLS overfits and PLS regularizes by projecting
// X onto a small set of latent components that maximize covariance
// with y.
//
// Sklearn-compatible (`sklearn.cross_decomposition.PLSRegression`) for
// the single-output case. PLS2 (multi-target y) is the natural next
// step but the scaffolding for multi-output regressors (which we don't
// yet have anywhere else) lands together with that — deferred.




const MODULE_ID_CROSS_DECOMP = '@gcu/learn.cross_decomposition';

// ────────────────────────────────────────────────────────────────────
// PLSRegression
// ────────────────────────────────────────────────────────────────────

/**
 * PLS1 regression via NIPALS.
 *
 * Hyperparameters:
 *   - n_components  (int, default 2)
 *   - scale         (bool, default true) — standardize X and y
 *   - max_iter      (int, default 500)   — power iteration cap (per component)
 *   - tol           (number, default 1e-6) — convergence tolerance for w
 *
 * Fitted attributes (sklearn-shape, single-output):
 *   - x_weights_     (Float64Array, [n_features, n_components])  W
 *   - x_loadings_    (Float64Array, [n_features, n_components])  P
 *   - x_scores_      (Float64Array, [n_samples, n_components])   T
 *   - y_loadings_    (Float64Array, [n_components])              q
 *   - x_rotations_   (Float64Array, [n_features, n_components])  W (P^T W)^-1
 *   - coef_          (Float64Array, [n_features])
 *   - intercept_     (number)
 *   - n_iter_        (Array of int per component)
 *   - x_mean_, x_std_, y_mean_, y_std_, n_features_in_
 *
 * Algorithm (PLS1, single y):
 *   for c = 1..n_components:
 *     w_c = X^T y / ‖X^T y‖
 *     t_c = X w_c
 *     p_c = X^T t_c / (t_c^T t_c)
 *     q_c = y^T t_c / (t_c^T t_c)
 *     X ← X - t_c p_c^T   (deflate)
 *     y ← y - t_c q_c     (deflate)
 *   coef = W (P^T W)^-1 q
 */
class PLSRegression extends BaseEstimator {
  constructor(params = {}) {
    super();
    this.n_components = params.n_components ?? 2;
    this.scale = params.scale ?? true;
    this.max_iter = params.max_iter ?? 500;
    this.tol = params.tol ?? 1e-6;
    this._module = MODULE_ID_CROSS_DECOMP;
  }

  fit(X, y, _opts) {
    const X_info = asMatrix(X);
    const { data, shape } = X_info;
    const yv = asVector(y);
    const [n, m] = shape;
    if (yv.length !== n) {
      throw new ValidationError(
        `PLSRegression.fit: y length ${yv.length} != n_samples ${n}`);
    }
    const k_max = Math.min(n, m);
    const k = Math.min(this.n_components | 0, k_max);
    if (k < 1) throw new ValidationError(
      `PLSRegression: n_components=${this.n_components} resolved to ${k}`);

    // Center (and optionally scale) X and y.
    const x_mean = new Float64Array(m);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) x_mean[j] += data[i * m + j];
    const inv_n = 1 / n;
    for (let j = 0; j < m; j++) x_mean[j] *= inv_n;
    let y_mean = 0; for (let i = 0; i < n; i++) y_mean += yv[i]; y_mean *= inv_n;

    const x_std = new Float64Array(m).fill(1);
    let y_std = 1;
    if (this.scale) {
      // Standard deviation with (n - 1) divisor (ddof=1, sklearn convention).
      for (let j = 0; j < m; j++) {
        let v = 0;
        for (let i = 0; i < n; i++) {
          const d = data[i * m + j] - x_mean[j];
          v += d * d;
        }
        v /= Math.max(1, n - 1);
        x_std[j] = v > 0 ? Math.sqrt(v) : 1;
      }
      let v = 0;
      for (let i = 0; i < n; i++) { const d = yv[i] - y_mean; v += d * d; }
      v /= Math.max(1, n - 1);
      y_std = v > 0 ? Math.sqrt(v) : 1;
    }
    // Working copies (residual matrices).
    const Xw = new Float64Array(n * m);
    const yw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) Xw[i * m + j] = (data[i * m + j] - x_mean[j]) / x_std[j];
      yw[i] = (yv[i] - y_mean) / y_std;
    }

    // NIPALS — extract up to n_components. Track the actual number we
    // managed to extract (we may stop early if y-residual converges to
    // zero before k components, which causes PtW to go singular).
    const W_full = new Float64Array(m * k);
    const P_full = new Float64Array(m * k);
    const T_full = new Float64Array(n * k);
    const Q_full = new Float64Array(k);
    const n_iter_full = new Array(k);
    let actual_k = 0;

    for (let c = 0; c < k; c++) {
      // PLS1 has a closed-form weight vector: w = X^T y (then normalize).
      let w_norm = 0;
      const w = new Float64Array(m);
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += Xw[i * m + j] * yw[i];
        w[j] = s;
        w_norm += s * s;
      }
      w_norm = Math.sqrt(w_norm);
      if (w_norm < this.tol) break;  // X effectively orthogonal to y residual
      for (let j = 0; j < m; j++) w[j] /= w_norm;

      // t = X w
      const t = new Float64Array(n);
      let tt = 0;
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < m; j++) s += Xw[i * m + j] * w[j];
        t[i] = s;
        tt += s * s;
      }
      if (tt < this.tol) break;

      // p = X^T t / (t^T t)
      const p = new Float64Array(m);
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += Xw[i * m + j] * t[i];
        p[j] = s / tt;
      }
      // q = y^T t / (t^T t)
      let q = 0;
      for (let i = 0; i < n; i++) q += yw[i] * t[i];
      q /= tt;

      // Deflate X and y.
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) Xw[i * m + j] -= t[i] * p[j];
        yw[i] -= t[i] * q;
      }

      // Store column c of W, P, T, Q (using k stride).
      for (let j = 0; j < m; j++) W_full[j * k + c] = w[j];
      for (let j = 0; j < m; j++) P_full[j * k + c] = p[j];
      for (let i = 0; i < n; i++) T_full[i * k + c] = t[i];
      Q_full[c] = q;
      n_iter_full[c] = 1;  // PLS1 weight has closed form; no power iteration loop
      actual_k = c + 1;
    }

    // Truncate to actual_k columns (compact column layout to avoid
    // singularity in PtW when n_components > effective rank).
    const eff_k = actual_k > 0 ? actual_k : 1;
    const W = new Float64Array(m * eff_k);
    const P = new Float64Array(m * eff_k);
    const T = new Float64Array(n * eff_k);
    const Q = new Float64Array(eff_k);
    const n_iter = new Array(eff_k);
    for (let j = 0; j < m; j++) {
      for (let c = 0; c < eff_k; c++) W[j * eff_k + c] = W_full[j * k + c];
      for (let c = 0; c < eff_k; c++) P[j * eff_k + c] = P_full[j * k + c];
    }
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < eff_k; c++) T[i * eff_k + c] = T_full[i * k + c];
    }
    for (let c = 0; c < eff_k; c++) {
      Q[c] = Q_full[c];
      n_iter[c] = n_iter_full[c] ?? 1;
    }
    // From here on, k refers to the actual component count.
    const k_use = eff_k;

    // x_rotations = W (P^T W)^-1 — the projection that maps X_new to scores.
    // For a small (k_use × k_use) inverse we use a direct solve.
    const PtW = new Float64Array(k_use * k_use);
    for (let a = 0; a < k_use; a++) {
      for (let b = 0; b < k_use; b++) {
        let s = 0;
        for (let j = 0; j < m; j++) s += P[j * k_use + a] * W[j * k_use + b];
        PtW[a * k_use + b] = s;
      }
    }
    const PtW_inv = _invertSmallMatrix_cross_decomposition(PtW, k_use);
    const x_rotations = new Float64Array(m * k_use);
    for (let j = 0; j < m; j++) {
      for (let c = 0; c < k_use; c++) {
        let s = 0;
        for (let p_idx = 0; p_idx < k_use; p_idx++) s += W[j * k_use + p_idx] * PtW_inv[p_idx * k_use + c];
        x_rotations[j * k_use + c] = s;
      }
    }

    // coef on the (centered/scaled) data: coef_scaled = x_rotations @ Q
    const coef_scaled = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let c = 0; c < k_use; c++) s += x_rotations[j * k_use + c] * Q[c];
      coef_scaled[j] = s;
    }
    // Undo standardization to get coef on the original scale.
    const coef = new Float64Array(m);
    for (let j = 0; j < m; j++) coef[j] = coef_scaled[j] * (y_std / x_std[j]);

    // Intercept = y_mean - X_mean . coef
    let intercept = y_mean;
    for (let j = 0; j < m; j++) intercept -= x_mean[j] * coef[j];

    this.x_weights_ = W;       this.x_weights_.shape = [m, k_use];
    this.x_loadings_ = P;      this.x_loadings_.shape = [m, k_use];
    this.x_scores_ = T;        this.x_scores_.shape = [n, k_use];
    this.y_loadings_ = Q;
    this.x_rotations_ = x_rotations; this.x_rotations_.shape = [m, k_use];
    this.coef_ = coef;
    this.intercept_ = intercept;
    this.n_iter_ = n_iter;
    this.x_mean_ = x_mean;
    this.x_std_ = x_std;
    this.y_mean_ = y_mean;
    this.y_std_ = y_std;
    this.n_features_in_ = m;
    this.n_components_ = k_use;
    captureFeatureNames(this, X_info);
    return this;
  }

  predict(X) {
    if (this.coef_ == null) throw new ValidationError('PLSRegression: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = this.intercept_;
      for (let j = 0; j < m; j++) acc += data[i * m + j] * this.coef_[j];
      out[i] = acc;
    }
    return out;
  }

  transform(X) {
    if (this.x_rotations_ == null) throw new ValidationError('PLSRegression: not fitted');
    const { data, shape } = asMatrix(X);
    checkNFeatures(this, shape, { name: 'X' });
    const [n, m] = shape;
    const k = this.n_components_;
    const out = new Float64Array(n * k);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < k; c++) {
        let acc = 0;
        for (let j = 0; j < m; j++) {
          acc += (data[i * m + j] - this.x_mean_[j]) / this.x_std_[j]
               * this.x_rotations_[j * k + c];
        }
        out[i * k + c] = acc;
      }
    }
    out.shape = [n, k];
    return out;
  }
}

Object.assign(PLSRegression.prototype, RegressorMixin);
PLSRegression._estimator_type = 'regressor';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

// Invert a small (k × k) matrix via Gauss-Jordan elimination with
// partial pivoting. k is bounded by n_components which is typically
// small (≤ 10), so this is fine.
function _invertSmallMatrix_cross_decomposition(A, k) {
  const aug = new Float64Array(k * 2 * k);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) aug[i * 2 * k + j] = A[i * k + j];
    aug[i * 2 * k + k + i] = 1;
  }
  for (let i = 0; i < k; i++) {
    // Pivot.
    let max_row = i;
    for (let r = i + 1; r < k; r++) {
      if (Math.abs(aug[r * 2 * k + i]) > Math.abs(aug[max_row * 2 * k + i])) max_row = r;
    }
    if (max_row !== i) {
      for (let c = 0; c < 2 * k; c++) {
        const t = aug[i * 2 * k + c];
        aug[i * 2 * k + c] = aug[max_row * 2 * k + c];
        aug[max_row * 2 * k + c] = t;
      }
    }
    const pivot = aug[i * 2 * k + i];
    if (Math.abs(pivot) < 1e-14) {
      throw new ValidationError(
        `PLSRegression: singular matrix in coefficient computation`);
    }
    for (let c = 0; c < 2 * k; c++) aug[i * 2 * k + c] /= pivot;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const factor = aug[r * 2 * k + i];
      for (let c = 0; c < 2 * k; c++) aug[r * 2 * k + c] -= factor * aug[i * 2 * k + c];
    }
  }
  const inv = new Float64Array(k * k);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) inv[i * k + j] = aug[i * 2 * k + k + j];
  return inv;
}

// ────────────────────────────────────────────────────────────────────
// Self-registration
// ────────────────────────────────────────────────────────────────────

learnRegistry.register('PLSRegression', PLSRegression, { module: MODULE_ID_CROSS_DECOMP });

// ── compile.js ──

// Tree compilation — emit native-JS predict functions from fitted
// decision trees. Implements SPEC §6.5's `.compile()` performance
// tier for the tree family (DecisionTree*, RandomForest*, ExtraTrees*,
// GradientBoosting*).
//
// Pragmatic implementation note. The spec proposes routing through
// AIR's lower→emit pipeline so tree compilation reuses the same
// machinery as adder/Soft. For v0.2 we instead emit JS source strings
// directly and `new Function`-them. Same V8 outcome (JIT'd nested
// branches with literal thresholds, exactly the shape Treelite emits
// to C). Less plumbing while AIR's API for synthetic-IR construction
// stabilizes; can be retargeted to AIR in v0.3 without API changes.
//
// Public surface:
//   - compileTreeValue(tree)   → fn(x: Float64Array, off: int) → leaf value (for regressor)
//   - compileTreeClass(tree, classes_) → fn(x, off) → predicted class label
//   - compileTreeLeaf(tree)    → fn(x, off) → leaf node id
//
// All compiled functions take (x, off) where x is a flat Float64Array
// (the full row-major X matrix) and off is the row offset (i * m).
// This avoids per-row slicing — the caller iterates rows by stepping
// off by m each time.


// ────────────────────────────────────────────────────────────────────
// Source emitters
// ────────────────────────────────────────────────────────────────────

/** Emit JS source that walks `tree` and returns the leaf value (regressor). */
function compileTreeValue(tree) {
  // Single `return <ternary>;` shape: smaller function body than nested
  // if/else blocks, keeps V8's inliner happy past deeper trees.
  const body = 'return ' + _emitNodeTernary_compile(tree, 0, (leaf_id) => String(tree.value[leaf_id])) + ';';
  // eslint-disable-next-line no-new-func
  return new Function('x', 'off', body);
}

/**
 * Emit JS source that walks `tree` and returns the predicted class label.
 * The argmax class index per leaf is precomputed and inlined as a literal.
 *
 * @param {object} tree    — fitted tree object
 * @param {Float64Array} classes — sorted class labels
 */
function compileTreeClass(tree, classes) {
  // Precompute argmax class index per leaf.
  const stride = tree.value_stride;
  const k = stride;  // n_classes
  const labelOf = (leaf_id) => {
    const off = leaf_id * stride;
    let best = 0, bestN = -Infinity;
    for (let c = 0; c < k; c++) {
      if (tree.value[off + c] > bestN) { best = c; bestN = tree.value[off + c]; }
    }
    return classes[best];
  };
  const body = 'return ' + _emitNodeTernary_compile(tree, 0, (leaf_id) => String(labelOf(leaf_id))) + ';';
  return new Function('x', 'off', body);
}

/** Emit JS source that returns the leaf node id (for predict_proba lookup). */
function compileTreeLeaf(tree) {
  const body = 'return ' + _emitNodeTernary_compile(tree, 0, (leaf_id) => String(leaf_id)) + ';';
  return new Function('x', 'off', body);
}

// Recursive node emitter, ternary form:
//   `(x[off+f] <= t ? <left-expr> : <right-expr>)`
// Each leaf is rendered as a literal expression by `leafToValue`.
// Single-expression form keeps the function small — V8's inliner uses
// function-source size as one heuristic, and nested if/else blocks
// generate multiple statements + multiple returns that bloat the AST.
function _emitNodeTernary_compile(tree, node_id, leafToValue) {
  if (tree.children_left[node_id] === -1) {
    return leafToValue(node_id);
  }
  const f = tree.feature[node_id];
  const t_str = _floatLiteral_compile(tree.threshold[node_id]);
  return (
    '(x[off+' + f + ']<=' + t_str + '?' +
    _emitNodeTernary_compile(tree, tree.children_left[node_id], leafToValue) +
    ':' +
    _emitNodeTernary_compile(tree, tree.children_right[node_id], leafToValue) +
    ')'
  );
}

// Format a float to a JS literal preserving precision. Integer-valued
// floats stay as ints (cleaner output); everything else uses the
// shortest round-trippable representation (Number.prototype.toString
// returns this by default).
function _floatLiteral_compile(v) {
  if (!Number.isFinite(v)) {
    if (Number.isNaN(v)) return 'NaN';
    return v > 0 ? 'Infinity' : '-Infinity';
  }
  return String(v);
}

// ────────────────────────────────────────────────────────────────────
// .compile() helpers — install on the tree-family estimator classes
// ────────────────────────────────────────────────────────────────────

/**
 * Wire `.compile()` onto the tree-family estimators. Idempotent: calling
 * twice replaces the compiled functions. Called from main.js at module
 * load.
 *
 * Each estimator type gets a custom compile() that:
 *   - builds compiled per-tree functions
 *   - rewires `predict` (and `predict_proba` where applicable) to
 *     dispatch through them
 *   - preserves the original predict as `_predict_interpreted`
 *     (sklearn-shape diagnostic hook)
 *
 * compile() returns `this` for chaining: `est.fit(X, y).compile().predict(X)`.
 */
function installCompile({
  DecisionTreeClassifier, DecisionTreeRegressor,
  RandomForestClassifier, RandomForestRegressor,
  ExtraTreesClassifier, ExtraTreesRegressor,
  GradientBoostingRegressor,
}) {
  // BaseEstimator default already exists as a no-op (added separately).
  // Below: tree-family overrides.

  // ── DecisionTreeRegressor ──
  DecisionTreeRegressor.prototype.compile = function () {
    if (!this.tree_) throw new ValidationError('compile: not fitted');
    const fn = compileTreeValue(this.tree_);
    this._compiled_predict_value = fn;
    this._predict_interpreted = this._predict_interpreted ?? this.predict;
    this.predict = function (X) {
      const Xa = _asFlat_compile(X, this.n_features_in_);
      const n = Xa.length / this.n_features_in_;
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = fn(Xa, i * this.n_features_in_);
      return out;
    };
    return this;
  };

  // ── DecisionTreeClassifier ──
  DecisionTreeClassifier.prototype.compile = function () {
    if (!this.tree_) throw new ValidationError('compile: not fitted');
    const classFn = compileTreeClass(this.tree_, this.classes_);
    const leafFn = compileTreeLeaf(this.tree_);
    this._compiled_predict_class = classFn;
    this._compiled_predict_leaf = leafFn;
    this._predict_interpreted = this._predict_interpreted ?? this.predict;
    this._predict_proba_interpreted = this._predict_proba_interpreted ?? this.predict_proba;
    this.predict = function (X) {
      const Xa = _asFlat_compile(X, this.n_features_in_);
      const n = Xa.length / this.n_features_in_;
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = classFn(Xa, i * this.n_features_in_);
      return out;
    };
    // For proba we still need the per-leaf normalized counts; precompute
    // a row per leaf and stash on the instance.
    const k = this.n_classes_;
    const stride = this.tree_.value_stride;
    const node_count = this.tree_.node_count;
    const leaf_proba = new Float64Array(node_count * k);
    for (let id = 0; id < node_count; id++) {
      let total = 0;
      for (let c = 0; c < k; c++) total += this.tree_.value[id * stride + c];
      const inv = total === 0 ? 0 : 1 / total;
      for (let c = 0; c < k; c++) leaf_proba[id * k + c] = this.tree_.value[id * stride + c] * inv;
    }
    this._leaf_proba = leaf_proba;
    this.predict_proba = function (X) {
      const Xa = _asFlat_compile(X, this.n_features_in_);
      const n = Xa.length / this.n_features_in_;
      const out = new Float64Array(n * k);
      for (let i = 0; i < n; i++) {
        const leaf = leafFn(Xa, i * this.n_features_in_);
        const off_l = leaf * k;
        for (let c = 0; c < k; c++) out[i * k + c] = leaf_proba[off_l + c];
      }
      out.shape = [n, k];
      return out;
    };
    return this;
  };

  // ── RandomForestRegressor ──
  RandomForestRegressor.prototype.compile = function () {
    if (!this.estimators_) throw new ValidationError('compile: not fitted');
    const fns = this.estimators_.map(t => compileTreeValue(t.tree_));
    this._compiled_tree_values = fns;
    this._predict_interpreted = this._predict_interpreted ?? this.predict;
    this.predict = function (X) {
      const Xa = _asFlat_compile(X, this.n_features_in_);
      const n = Xa.length / this.n_features_in_;
      const out = new Float64Array(n);
      const inv_t = 1 / fns.length;
      for (let i = 0; i < n; i++) {
        const off = i * this.n_features_in_;
        let s = 0;
        for (let t = 0; t < fns.length; t++) s += fns[t](Xa, off);
        out[i] = s * inv_t;
      }
      return out;
    };
    return this;
  };

  // ── RandomForestClassifier ──
  RandomForestClassifier.prototype.compile = function () {
    if (!this.estimators_) throw new ValidationError('compile: not fitted');
    const fns = this.estimators_.map(t => compileTreeLeaf(t.tree_));
    // Precompute per-tree per-leaf probability rows in the *forest* class
    // space (since each tree may have a different classes_ subset, we
    // remap via the union classes).
    const K = this.classes_.length;
    const tree_leaf_proba = new Array(this.estimators_.length);
    for (let t = 0; t < this.estimators_.length; t++) {
      const tree = this.estimators_[t].tree_;
      const tree_classes = this.estimators_[t].classes_;
      const k_t = tree_classes.length;
      const node_count = tree.node_count;
      const leaf_proba = new Float64Array(node_count * K);
      // Map this tree's class index → forest class index.
      const remap = new Int32Array(k_t);
      for (let c = 0; c < k_t; c++) {
        remap[c] = this.classes_.indexOf(tree_classes[c]);
      }
      for (let id = 0; id < node_count; id++) {
        let total = 0;
        for (let c = 0; c < k_t; c++) total += tree.value[id * tree.value_stride + c];
        const inv = total === 0 ? 0 : 1 / total;
        for (let c = 0; c < k_t; c++) {
          leaf_proba[id * K + remap[c]] = tree.value[id * tree.value_stride + c] * inv;
        }
      }
      tree_leaf_proba[t] = leaf_proba;
    }
    this._predict_interpreted = this._predict_interpreted ?? this.predict;
    this._predict_proba_interpreted = this._predict_proba_interpreted ?? this.predict_proba;
    this.predict_proba = function (X) {
      const Xa = _asFlat_compile(X, this.n_features_in_);
      const n = Xa.length / this.n_features_in_;
      const out = new Float64Array(n * K);
      const inv_t = 1 / fns.length;
      for (let i = 0; i < n; i++) {
        const off = i * this.n_features_in_;
        for (let t = 0; t < fns.length; t++) {
          const leaf = fns[t](Xa, off);
          const off_l = leaf * K;
          const lp = tree_leaf_proba[t];
          for (let c = 0; c < K; c++) out[i * K + c] += lp[off_l + c] * inv_t;
        }
      }
      out.shape = [n, K];
      return out;
    };
    const classes = this.classes_;
    this.predict = function (X) {
      const proba = this.predict_proba(X);
      const n = proba.length / K;
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let best = 0, bestP = -1;
        for (let c = 0; c < K; c++) {
          if (proba[i * K + c] > bestP) { best = c; bestP = proba[i * K + c]; }
        }
        out[i] = classes[best];
      }
      return out;
    };
    return this;
  };

  // ── ExtraTrees{Classifier,Regressor} share the RF compile path ──
  ExtraTreesClassifier.prototype.compile = RandomForestClassifier.prototype.compile;
  ExtraTreesRegressor.prototype.compile = RandomForestRegressor.prototype.compile;

  // ── GradientBoostingRegressor ──
  GradientBoostingRegressor.prototype.compile = function () {
    if (!this.estimators_) throw new ValidationError('compile: not fitted');
    const fns = this.estimators_.map(t => compileTreeValue(t.tree_));
    const lr = this.learning_rate;
    const init = this.init_value_;
    this._compiled_tree_values = fns;
    this._predict_interpreted = this._predict_interpreted ?? this.predict;
    this.predict = function (X) {
      const Xa = _asFlat_compile(X, this.n_features_in_);
      const n = Xa.length / this.n_features_in_;
      const out = new Float64Array(n);
      out.fill(init);
      for (let i = 0; i < n; i++) {
        const off = i * this.n_features_in_;
        let s = init;
        for (let t = 0; t < fns.length; t++) s += lr * fns[t](Xa, off);
        out[i] = s;
      }
      return out;
    };
    return this;
  };

  // GradientBoostingClassifier compile is more involved (per-stage per-class
  // trees + softmax) — defer to v0.3.
}

// Coerce X to a flat Float64Array, validating feature count.
function _asFlat_compile(X, m) {
  if (X == null) throw new ValidationError('compile.predict: X is null');
  if (X instanceof Float64Array && X.length % m === 0) return X;
  if (X.data instanceof Float64Array && Array.isArray(X.shape) && X.shape[1] === m) {
    return X.data;
  }
  if (Array.isArray(X) && X.length > 0 && Array.isArray(X[0])) {
    if (X[0].length !== m) throw new ValidationError(
      `compile.predict: X has ${X[0].length} features, expected ${m}`);
    const out = new Float64Array(X.length * m);
    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < m; j++) out[i * m + j] = X[i][j];
    }
    return out;
  }
  throw new ValidationError('compile.predict: unrecognized X shape');
}

// ── namespace barrels (sklearn-shaped) ──
const base = {
  BaseEstimator,
  ClassifierMixin, RegressorMixin, TransformerMixin, ClusterMixin,
  clone, check_is_fitted, NotFittedError,
};
const preprocessing = {
  StandardScaler, MinMaxScaler, MaxAbsScaler, RobustScaler,
  LabelEncoder, OrdinalEncoder, OneHotEncoder,
  KBinsDiscretizer, PowerTransformer,
};
const tree = { DecisionTreeClassifier, DecisionTreeRegressor };
const cluster = { KMeans, AgglomerativeClustering, DBSCAN };
const decomposition = { PCA, TruncatedSVD, NMF };
const compositional = { CLR, ILR, ALR };
const pipeline = { Pipeline, make_pipeline };
const compose = { ColumnTransformer, make_column_transformer };
const model_selection = {
  train_test_split, KFold, StratifiedKFold, GroupKFold, SpatialKFold,
  cross_val_score, cross_validate, from_table,
};
const metrics = {
  accuracy_score, balanced_accuracy_score,
  precision_score, recall_score, f1_score,
  confusion_matrix, classification_report,
  cohen_kappa_score, matthews_corrcoef,
  r2_score, mean_squared_error, root_mean_squared_error,
  mean_absolute_error, mean_absolute_percentage_error,
  explained_variance_score,
};
const utils = {
  check_estimator,
  random: { mulberry32, makeRng, makeNormalSampler },
  compile: { compileTreeValue, compileTreeClass, compileTreeLeaf },
  validation: { check_is_fitted, NotFittedError },
};
const linear_model = {
  LinearRegression, Ridge, Lasso, ElasticNet, LogisticRegression,
};
const ensemble = {
  RandomForestClassifier, RandomForestRegressor,
  ExtraTreesClassifier, ExtraTreesRegressor,
  BaggingClassifier, BaggingRegressor,
  GradientBoostingClassifier, GradientBoostingRegressor,
};
const impute = {
  SimpleImputer, KNNImputer, BDLImputer,
};
const neighbors = {
  KNeighborsClassifier, KNeighborsRegressor,
};
const mixture = { GaussianMixture };
const cross_decomposition = { PLSRegression };

// The .compile() override for the tree family (SPEC §6.5), as src/main.js does it.
// Without this call the bundle shipped the base no-op and every tree stayed interpreted.
installCompile({
  DecisionTreeClassifier, DecisionTreeRegressor,
  RandomForestClassifier, RandomForestRegressor,
  ExtraTreesClassifier, ExtraTreesRegressor,
  GradientBoostingRegressor,
});

// ── exports ──
export {
  // base
  BaseEstimator,
  ClassifierMixin, RegressorMixin, TransformerMixin, ClusterMixin,
  clone, check_is_fitted, NotFittedError,
  // serialize
  dump, load, learnRegistry,
  // check_estimator
  check_estimator,
  // util/random
  mulberry32, makeRng, makeNormalSampler,
  // metrics
  accuracy_score, balanced_accuracy_score,
  precision_score, recall_score, f1_score,
  confusion_matrix, classification_report,
  cohen_kappa_score, matthews_corrcoef,
  r2_score, mean_squared_error, root_mean_squared_error,
  mean_absolute_error, mean_absolute_percentage_error,
  explained_variance_score,
  // model_selection
  train_test_split, KFold, StratifiedKFold, GroupKFold, SpatialKFold,
  cross_val_score, cross_validate, from_table,
  // preprocessing
  StandardScaler, MinMaxScaler, MaxAbsScaler, RobustScaler,
  LabelEncoder, OrdinalEncoder, OneHotEncoder,
  KBinsDiscretizer, PowerTransformer,
  // tree
  DecisionTreeClassifier, DecisionTreeRegressor,
  // compositional
  CLR, ILR, ALR,
  // pipeline + compose
  Pipeline, make_pipeline,
  ColumnTransformer, make_column_transformer,
  // cluster
  KMeans, AgglomerativeClustering, DBSCAN,
  // decomposition
  PCA, TruncatedSVD, NMF,
  // linear_model
  LinearRegression, Ridge, Lasso, ElasticNet, LogisticRegression,
  // ensemble
  RandomForestClassifier, RandomForestRegressor,
  ExtraTreesClassifier, ExtraTreesRegressor,
  BaggingClassifier, BaggingRegressor,
  GradientBoostingClassifier, GradientBoostingRegressor,
  // impute
  SimpleImputer, KNNImputer, BDLImputer,
  // neighbors
  KNeighborsClassifier, KNeighborsRegressor,
  // mixture
  GaussianMixture,
  // cross_decomposition
  PLSRegression,
  // compile
  installCompile, compileTreeValue, compileTreeClass, compileTreeLeaf,
  // namespace barrels
  base, preprocessing, tree, cluster, decomposition, compositional,
  pipeline, compose, model_selection, metrics, utils, linear_model, ensemble,
  impute, neighbors, mixture, cross_decomposition,
};

// ⚠ VENDORED — DO NOT EDIT. @gcu/learn's adder bridge (sklearn-shaped module), copied from ../auditable/ext/learn/adder.js at auditable 6fd9b601 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// @gcu/learn — adder cell bridge.
//
// Per SPEC §2.4: registers as `learn` under `_auditableExtensions`, so
// adder cells can write source-compatible scikit-learn imports with a
// single namespace edit (`s/sklearn/learn/`):
//
//   from learn.tree import DecisionTreeClassifier
//   from learn.preprocessing import StandardScaler
//   from learn.model_selection import KFold, cross_val_score
//   from learn.metrics import accuracy_score
//   from learn import dump, load
//
// adder's import machinery walks the dotted path through the namespace
// objects (preprocessing, tree, …) which are plain JS objects. No
// __getattr__ trick needed because every submodule is exposed directly
// as a property.
//
// No static `import * as _learn from './index.js'` — in the browser this
// module is hosted at a blob URL where relative imports can't resolve.
// Mirrors the natra/adder.js pattern: in browser, pick up the bundle
// from window._importCache (must be load()-ed first); in Node tests,
// fall back to a dynamic relative import.

// NO TOP-LEVEL AWAIT (a classic-script worker can't have one): the library is
// found synchronously in the notebook, attached by a host (`attachLearn`), or —
// in Node — imported in the background; `learnReady` resolves when it is there.

const _module = {};
// submodules (sklearn-shape namespaces), top-level helpers, and flat re-exports of
// the most-used classes (`from learn import Pipeline` beside `from learn.pipeline import …`)
const _NAMES = [
  'base',
  'preprocessing',
  'tree',
  'cluster',
  'decomposition',
  'compositional',
  'pipeline',
  'compose',
  'model_selection',
  'metrics',
  'utils',
  'linear_model',
  'ensemble',
  'impute',
  'neighbors',
  'mixture',
  'cross_decomposition',
  'dump',
  'load',
  'clone',
  'check_is_fitted',
  'check_estimator',
  'NotFittedError',
  'learnRegistry',
  'mulberry32',
  'makeRng',
  'BaseEstimator',
  'ClassifierMixin',
  'RegressorMixin',
  'TransformerMixin',
  'ClusterMixin',
  'Pipeline',
  'make_pipeline',
  'ColumnTransformer',
  'make_column_transformer'
];
let _learn = null;
// fill the Python-facing module from the library (idempotent: the last attach wins)
export function attachLearn(lib) {
  if (!lib || !lib.BaseEstimator || !lib.Pipeline) throw new TypeError('attachLearn: expected the @gcu/learn module');
  _learn = lib;
  for (const k of _NAMES) _module[k] = lib[k];
  return _module;
}

let learnReady;
if (typeof window !== 'undefined' && window._importCache) {
  const found = window._importCache['@gcu/learn']
    || Object.values(window._importCache).find(m => m && m.BaseEstimator && m.Pipeline);
  if (!found) {
    throw new Error('@gcu/learn not loaded — call load("@gcu/learn") first');
  }
  attachLearn(found);
  learnReady = Promise.resolve(_module);
} else if (typeof importScripts === 'function') {
  learnReady = Promise.resolve(_module);   // a worker: no request; the host calls attachLearn(lib)
} else {
  // Node (tests, scripts): import beside this file.
  learnReady = import('./index.js').then((m) => (_learn ? _module : attachLearn(m)), () => _module);
}

// ── Registration ──
// Auditable's manifest API is preferred when available (auto-validates
// the extension shape); fall back to the legacy slot for older runtimes.
if (typeof window !== 'undefined') {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/learn',
      version: '0.1.0',
      description: 'sklearn-compatible classical ML for adder cells',
      exports: { learn: _module },
    });
  } else {
    window._auditableExtensions = window._auditableExtensions || {};
    window._auditableExtensions['learn'] = _module;
  }
}

export { _module as learnAdder, learnReady };

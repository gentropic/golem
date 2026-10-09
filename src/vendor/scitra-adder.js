// ⚠ VENDORED — DO NOT EDIT. @gcu/scitra's adder bridge (scipy-shaped module), copied from ../auditable/ext/scitra/adder.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// @gcu/scitra — adder cell bridge.
//
// Registers as `scitra` under `_auditableExtensions`. Adder cells can
// write scipy-shaped imports after a one-line namespace edit
// (`s/scipy/scitra/`) — the ipynb bridge does the rewrite automatically:
//
//   from scitra.stats import norm
//   from scitra.spatial import KDTree
//   from scitra.spatial.distance import cdist, pdist, squareform
//   from scitra.optimize import least_squares, curve_fit
//   from scitra.special import erf, gamma
//
// adder's import machinery walks the dotted path through namespace
// objects, all of which are plain JS objects on _module — same pattern
// as @gcu/learn's bridge.
//
// No static `import * as _scitra from './index.js'` — in the browser this
// module runs from a blob URL where relative imports don't resolve.
// Mirrors natra/adder.js + learn/adder.js: in browser, pick up the
// bundle from window._importCache; in Node tests, fall back to a
// dynamic relative import.

//
// NO TOP-LEVEL AWAIT (a classic-script worker can't have one): the library is
// found synchronously in the notebook, attached by a host (`attachScitra`), or —
// in Node — imported in the background; `scitraReady` resolves when it is there.

const _module = {};
const _NAMES = [
  // submodules (scipy-shape namespaces)
  'stats', 'spatial', 'optimize', 'special', 'random',
  // top-level conveniences, mirroring scitra/index.js's flat re-exports
  'KDTree', 'gaussian_kde', 'curve_fit', 'least_squares',
];
let _scitra = null;
// fill the Python-facing module from the library (idempotent: the last attach wins)
export function attachScitra(lib) {
  if (!lib || !lib.stats || !lib.optimize) throw new TypeError('attachScitra: expected the @gcu/scitra module');
  _scitra = lib;
  for (const k of _NAMES) _module[k] = lib[k];
  return _module;
}

let scitraReady;
if (typeof window !== 'undefined' && window._importCache) {
  const found = window._importCache['@gcu/scitra']
    || Object.values(window._importCache).find(m => m && m.stats && m.spatial && m.optimize);
  if (!found) {
    throw new Error('@gcu/scitra not loaded — call load("@gcu/scitra") first');
  }
  attachScitra(found);
  scitraReady = Promise.resolve(_module);
} else if (typeof importScripts === 'function') {
  scitraReady = Promise.resolve(_module);   // a worker: no request; the host calls attachScitra(lib)
} else {
  // Node (tests, scripts): import beside this file.
  scitraReady = import('./index.js').then((m) => (_scitra ? _module : attachScitra(m)), () => _module);
}

// ── Registration ──
// Auditable's manifest API is preferred; fall back to the legacy slot
// for older runtimes (matches sadpan / learn / natra).
if (typeof window !== 'undefined') {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/scitra',
      version: '0.1.0',
      description: 'scipy-shaped primitives for adder cells',
      exports: { scitra: _module },
    });
  } else {
    window._auditableExtensions = window._auditableExtensions || {};
    window._auditableExtensions['scitra'] = _module;
  }
}

export { _module as scitraAdder, scitraReady };

// ⚠ VENDORED — DO NOT EDIT. @gcu/scitra, copied from ../auditable/ext/scitra/index.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// @gcu/scitra — scipy-shaped scientific-computing primitives.
// Auto-generated from ext/scitra/src/ — do not edit directly.
//
// v0.1 API surface:
//   util.special: erf, erfc, erfinv, ndtri, lgamma, gamma, lbeta
//   util.random:  mulberry32, makeRng, makeNormalSampler
//   stats:        norm, lognorm (scipy-shaped frozen + functional)
//                 weighted_mean/var/std/percentile/median, ecdf, histogram, moments
//                 normal_score_transform (with weights, ties, BDL, tail extrap)
//                 gaussian_kde (1D, scipy-parity bw_method)
//   spatial:      cdist, pdist, squareform (9 metrics + custom)
//                 KDTree (k-NN, query_ball_point, query_pairs)
//   optimize:     least_squares (Levenberg-Marquardt), curve_fit

// ── util/special.js ──

// Special functions used by stats.distributions and friends.
//
// Implementations are well-known closed-form approximations published in
// Numerical Recipes / Abramowitz & Stegun / by Acklam.
//
// Accuracy: erf via A&S 7.1.26 → max abs error ≈ 1.5e-7. ndtri via
// Acklam → max relative error ≈ 1.15e-9 (so absolute error scales with
// the result, e.g. ndtri(0.975) ≈ 1.96 has ~2e-9 absolute error). lgamma
// via Lanczos → ~1e-15 for x > 0.5.
//
// Sufficient for statistical inference at any practical sample size.
// Pegged to scipy's API but not scipy's numerical accuracy.

// ── erf and erfc ─────────────────────────────────────────────────────
//
// Chebyshev-based approximation good to 1.5e-7 for all x. Source:
// Numerical Recipes 3e §6.2 (algorithm 6.2.6, fitted on |t| ≤ 4 with
// double-precision coefficients).

function erf(x) {
  if (x === 0) return 0;
  if (!Number.isFinite(x)) {
    if (x === Infinity) return 1;
    if (x === -Infinity) return -1;
    return NaN;
  }
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  // Abramowitz & Stegun 7.1.26 — max error ≈ 1.5e-7
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const y = 1.0 - (((((
        1.061405429  * t
      - 1.453152027) * t
      + 1.421413741) * t
      - 0.284496736) * t
      + 0.254829592) * t) * Math.exp(-ax * ax);
  return sign * y;
}

function erfc(x) {
  return 1 - erf(x);
}

// ── inverse normal CDF (probit / Φ⁻¹) ──────────────────────────────
//
// Peter Acklam's algorithm — rational approximation good to ~1.15e-9
// over the whole tail. http://home.online.no/~pjacklam/notes/invnorm/
//
// Used directly for Normal.ppf and via change-of-variable for everything
// else's ppf.

const _A_special = [
  -3.969683028665376e+01,
   2.209460984245205e+02,
  -2.759285104469687e+02,
   1.383577518672690e+02,
  -3.066479806614716e+01,
   2.506628277459239e+00,
];
const _B_special = [
  -5.447609879822406e+01,
   1.615858368580409e+02,
  -1.556989798598866e+02,
   6.680131188771972e+01,
  -1.328068155288572e+01,
];
const _C_special = [
  -7.784894002430293e-03,
  -3.223964580411365e-01,
  -2.400758277161838e+00,
  -2.549732539343734e+00,
   4.374664141464968e+00,
   2.938163982698783e+00,
];
const _D_special = [
   7.784695709041462e-03,
   3.224671290700398e-01,
   2.445134137142996e+00,
   3.754408661907416e+00,
];

const PLOW = 0.02425;
const PHIGH = 1.0 - PLOW;

function ndtri(p) {
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p < 0 || p > 1 || !Number.isFinite(p)) return NaN;

  let q, r;
  if (p < PLOW) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((_C_special[0]*q+_C_special[1])*q+_C_special[2])*q+_C_special[3])*q+_C_special[4])*q+_C_special[5]) /
           ((((_D_special[0]*q+_D_special[1])*q+_D_special[2])*q+_D_special[3])*q+1);
  }
  if (p <= PHIGH) {
    q = p - 0.5;
    r = q * q;
    return (((((_A_special[0]*r+_A_special[1])*r+_A_special[2])*r+_A_special[3])*r+_A_special[4])*r+_A_special[5])*q /
           (((((_B_special[0]*r+_B_special[1])*r+_B_special[2])*r+_B_special[3])*r+_B_special[4])*r+1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((_C_special[0]*q+_C_special[1])*q+_C_special[2])*q+_C_special[3])*q+_C_special[4])*q+_C_special[5]) /
          ((((_D_special[0]*q+_D_special[1])*q+_D_special[2])*q+_D_special[3])*q+1);
}

// inverse erf, derived from inverse normal CDF:
//   erf(x) = 2*Φ(x*√2) − 1   ⇒   erfinv(y) = ndtri((y+1)/2) / √2
function erfinv(y) {
  if (y === 0) return 0;
  if (y === 1) return Infinity;
  if (y === -1) return -Infinity;
  if (y < -1 || y > 1) return NaN;
  return ndtri((y + 1) / 2) / Math.SQRT2;
}

// ── log-gamma, gamma, beta ────────────────────────────────────────────
//
// Lanczos approximation — accurate to ~1e-15 for x > 0.5; for 0 < x < 0.5
// uses Euler reflection. Used by Beta/Gamma/Chi2/T/F distributions
// (post-v0.1). Pre-shipped here because it's small (~30 LOC) and the
// reflection formula benefits from being co-located.

const _LG_G_special = 7;
const _LG_C_special = [
   0.99999999999980993,
   676.5203681218851,
  -1259.1392167224028,
   771.32342877765313,
  -176.61502916214059,
   12.507343278686905,
  -0.13857109526572012,
   9.9843695780195716e-6,
   1.5056327351493116e-7,
];

function lgamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = _LG_C_special[0];
  const t = x + _LG_G_special + 0.5;
  for (let i = 1; i < _LG_C_special.length; i++) a += _LG_C_special[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gamma(x) {
  return Math.exp(lgamma(x));
}

function lbeta(a, b) {
  return lgamma(a) + lgamma(b) - lgamma(a + b);
}

// ── util/random.js ──

// Seedable random number generation.
//
// mulberry32 is a small, fast, high-quality PRNG with 2^32 period.
// Same algorithm used by arborist (validation.js) and @gcu/learn —
// keeping the convention consistent across the GCU stack means seeds
// are interchangeable.
//
// Convention: `random_state` is a uint32 seed, or null for non-deterministic
// runs. Pre-seeded RNG instances are not accepted (matches arborist + learn).

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

// Returns a [0, 1) uniform sampler. If random_state is null, uses
// Math.random; otherwise seeds a fresh mulberry32.
function makeRng(random_state) {
  if (random_state === null || random_state === undefined) return Math.random;
  return mulberry32(random_state);
}

// Box-Muller transform: two uniforms → two independent standard normals.
// We cache the second draw in a closure so consecutive .normal() calls
// pay the trig cost amortized over two samples.
function makeNormalSampler(random_state) {
  const u = makeRng(random_state);
  let cached = null;
  return function normal() {
    if (cached !== null) {
      const v = cached;
      cached = null;
      return v;
    }
    // Marsaglia polar method — avoids transcendentals on the rejection
    // branch, ~1.27× faster than classical Box-Muller in V8 microbenches.
    let x, y, s;
    do {
      x = 2 * u() - 1;
      y = 2 * u() - 1;
      s = x * x + y * y;
    } while (s >= 1 || s === 0);
    const factor = Math.sqrt(-2 * Math.log(s) / s);
    cached = y * factor;
    return x * factor;
  };
}

// ── util/backend.js ──

// Optional acceleration backends.
//
// scitra is zero-deps by default. When natra is loaded (which brings
// alpack-compiled BLAS via Wasm SIMD), specific hot paths can dispatch
// through it for a 5-10× speedup on large matmuls. Discovery uses the
// shared @gcu/registry protocol — see ext/gcu-registry/SPEC.md for the
// full convention. Summary:
//
//   • Provider (natra) self-registers at the end of its factory:
//       globalThis.__gcu__.providers.natra = instance
//   • Consumer (scitra, here) does a lazy lookup at the call site,
//       falling through to its inline path if the registry is empty.
//   • Tests and node scripts can override via setBackend({ natra }),
//       which wins over the registry.
//
// All public scitra functions stay synchronous; backend lookups happen
// lazily at the call site, so this module never blocks the bundle.

let _explicit_backend = { natra: undefined };

function setBackend(b) {
  if (b && typeof b === 'object') {
    Object.assign(_explicit_backend, b);
  }
}

function clearBackend() {
  _explicit_backend = { natra: undefined };
}

// Returns a configured natra instance — must expose .scope/.array/.toTypedArray.
// Resolution order:
//   1. Explicit setBackend({ natra }) — wins over everything.
//   2. globalThis.__gcu__.providers.natra (registry, version 1).
//   3. null (no backend; consumers fall back to inline).
function getNatra() {
  if (_explicit_backend.natra !== undefined) return _explicit_backend.natra;
  const root = globalThis.__gcu__;
  if (!root || root.version !== 1) return null;
  const candidate = root.providers?.natra;
  if (candidate
      && typeof candidate.scope === 'function'
      && typeof candidate.array === 'function'
      && typeof candidate.toTypedArray === 'function') {
    return candidate;
  }
  return null;
}

// Threshold tuned via test/scitra-cdist-bench.mjs. Below n*m = 250k,
// the gemm trick's wasm FFI overhead can match or even slightly beat
// its SIMD win (at small d, ~0.97× speedup at 200×200 d=3). At and
// above 250k we see consistent 1.34× to 4.84× wins, scaling with d:
//
//   |   size     | d  | inline (ms) | gemm (ms) | speedup |
//   |------------|----|-------------|-----------|---------|
//   |  500×500   |  3 |    1.41     |   1.05    | 1.34×   |
//   | 1000×1000  |  3 |    6.26     |   3.64    | 1.72×   |
//   |  500×500   | 10 |    2.86     |   1.17    | 2.45×   |
//   | 1000×1000  | 10 |   11.49     |   4.17    | 2.76×   |
//   |  500×500   | 50 |   12.93     |   2.67    | 4.84×   |
const GEMM_NM_THRESHOLD = 250_000;

// ── stats/distributions.js ──

// Statistical distributions, scipy-shaped.
//
// Each distribution exposes both:
//   - "frozen" instances:  d = norm(loc, scale); d.pdf(x); d.cdf(x); ...
//   - functional form:     norm.pdf(x, loc, scale)
//
// Inputs (`x`, `samples`) are scalars, JS arrays, or typed arrays. Outputs
// are scalars when inputs are scalars, Float64Array otherwise. natra/vec
// ndarrays are accepted by duck-typing on `.data` (Float64Array view) and
// are returned as plain Float64Array — the caller wraps if they want to
// keep the natra type.



const SQRT_2PI = Math.sqrt(2 * Math.PI);
const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const SQRT_2 = Math.SQRT2;

// ── helpers ──────────────────────────────────────────────────────────

function _toF64_distributions(x) {
  if (typeof x === 'number') return null;            // scalar — caller handles
  if (x instanceof Float64Array) return x;
  if (x && x.data instanceof Float64Array) return x.data;  // natra/vec
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return Float64Array.from(x);
  throw new TypeError('expected number, array, Float64Array, or ndarray');
}

function _vec1_distributions(x, fn) {
  if (typeof x === 'number') return fn(x);
  const xa = _toF64_distributions(x);
  const out = new Float64Array(xa.length);
  for (let i = 0; i < xa.length; i++) out[i] = fn(xa[i]);
  return out;
}

// ── Normal ───────────────────────────────────────────────────────────

const _normPdf_distributions = (x, loc = 0, scale = 1) =>
  Math.exp(-0.5 * ((x - loc) / scale) ** 2) / (scale * SQRT_2PI);

const _normLogPdf_distributions = (x, loc = 0, scale = 1) => {
  const z = (x - loc) / scale;
  return -0.5 * z * z - Math.log(scale) - LOG_SQRT_2PI;
};

const _normCdf_distributions = (x, loc = 0, scale = 1) =>
  0.5 * (1 + erf((x - loc) / (scale * SQRT_2)));

const _normSf_distributions = (x, loc = 0, scale = 1) =>
  0.5 * erf(-(x - loc) / (scale * SQRT_2)) + 0.5;

const _normPpf_distributions = (p, loc = 0, scale = 1) => loc + scale * ndtri(p);

const _normIsf_distributions = (p, loc = 0, scale = 1) => loc - scale * ndtri(p);

function _normRvs_distributions(size, loc = 0, scale = 1, opts = {}) {
  const sampler = makeNormalSampler(opts.random_state ?? null);
  if (typeof size === 'number') {
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = loc + scale * sampler();
    return out;
  }
  // size = undefined → single draw
  return loc + scale * sampler();
}

function _normFit_distributions(samples, opts = {}) {
  const xa = _toF64_distributions(samples);
  const n = xa.length;
  if (n === 0) throw new RangeError('fit: empty sample');
  let s = 0;
  for (let i = 0; i < n; i++) s += xa[i];
  const mean = s / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = xa[i] - mean;
    ss += d * d;
  }
  // MLE std uses n in the denominator (population, not sample).
  // scipy.stats.norm.fit returns MLE; we match.
  const std = Math.sqrt(ss / n);
  return { loc: mean, scale: std };
}

class _NormFrozen_distributions {
  constructor(loc, scale) {
    if (scale <= 0) throw new RangeError('Normal: scale must be > 0');
    this.loc = loc;
    this.scale = scale;
  }
  pdf(x)    { return _vec1_distributions(x, v => _normPdf_distributions(v, this.loc, this.scale)); }
  logpdf(x) { return _vec1_distributions(x, v => _normLogPdf_distributions(v, this.loc, this.scale)); }
  cdf(x)    { return _vec1_distributions(x, v => _normCdf_distributions(v, this.loc, this.scale)); }
  sf(x)     { return _vec1_distributions(x, v => _normSf_distributions(v, this.loc, this.scale)); }
  ppf(p)    { return _vec1_distributions(p, v => _normPpf_distributions(v, this.loc, this.scale)); }
  isf(p)    { return _vec1_distributions(p, v => _normIsf_distributions(v, this.loc, this.scale)); }
  rvs(size, opts) { return _normRvs_distributions(size, this.loc, this.scale, opts); }
  mean()     { return this.loc; }
  median()   { return this.loc; }
  var()      { return this.scale * this.scale; }
  std()      { return this.scale; }
  entropy()  { return 0.5 * Math.log(2 * Math.PI * Math.E * this.scale * this.scale); }
}

function norm(loc = 0, scale = 1) {
  return new _NormFrozen_distributions(loc, scale);
}
norm.pdf    = (x, loc, scale) => _vec1_distributions(x, v => _normPdf_distributions(v, loc ?? 0, scale ?? 1));
norm.logpdf = (x, loc, scale) => _vec1_distributions(x, v => _normLogPdf_distributions(v, loc ?? 0, scale ?? 1));
norm.cdf    = (x, loc, scale) => _vec1_distributions(x, v => _normCdf_distributions(v, loc ?? 0, scale ?? 1));
norm.sf     = (x, loc, scale) => _vec1_distributions(x, v => _normSf_distributions(v, loc ?? 0, scale ?? 1));
norm.ppf    = (p, loc, scale) => _vec1_distributions(p, v => _normPpf_distributions(v, loc ?? 0, scale ?? 1));
norm.isf    = (p, loc, scale) => _vec1_distributions(p, v => _normIsf_distributions(v, loc ?? 0, scale ?? 1));
norm.rvs    = (size, loc, scale, opts) => _normRvs_distributions(size, loc ?? 0, scale ?? 1, opts);
norm.fit    = (samples, opts) => _normFit_distributions(samples, opts);

// ── LogNormal ────────────────────────────────────────────────────────
//
// scipy parameterization: lognorm(s, loc=0, scale=exp(μ)).
//   s     = standard deviation of underlying normal (σ)
//   loc   = location offset (rarely non-zero in practice)
//   scale = exp(μ), the geometric mean of the distribution
//
// log-pdf, ppf etc. derived from Normal via change of variable:
//   X ~ LogNorm(σ, exp(μ)) ⇔ log((X-loc)/scale) ~ Normal(0, σ)

const _lnormPdf_distributions = (x, s, loc = 0, scale = 1) => {
  const z = (x - loc) / scale;
  if (z <= 0) return 0;
  const u = Math.log(z);
  return Math.exp(-0.5 * (u / s) ** 2) / (scale * z * s * SQRT_2PI);
};

const _lnormLogPdf_distributions = (x, s, loc = 0, scale = 1) => {
  const z = (x - loc) / scale;
  if (z <= 0) return -Infinity;
  const u = Math.log(z);
  return -0.5 * (u / s) ** 2 - Math.log(scale) - Math.log(z) - Math.log(s) - LOG_SQRT_2PI;
};

const _lnormCdf_distributions = (x, s, loc = 0, scale = 1) => {
  const z = (x - loc) / scale;
  if (z <= 0) return 0;
  return _normCdf_distributions(Math.log(z), 0, s);
};

const _lnormSf_distributions = (x, s, loc = 0, scale = 1) => {
  const z = (x - loc) / scale;
  if (z <= 0) return 1;
  return _normSf_distributions(Math.log(z), 0, s);
};

const _lnormPpf_distributions = (p, s, loc = 0, scale = 1) =>
  loc + scale * Math.exp(_normPpf_distributions(p, 0, s));

const _lnormIsf_distributions = (p, s, loc = 0, scale = 1) =>
  loc + scale * Math.exp(_normIsf_distributions(p, 0, s));

function _lnormRvs_distributions(size, s, loc = 0, scale = 1, opts = {}) {
  const sampler = makeNormalSampler(opts.random_state ?? null);
  if (typeof size === 'number') {
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = loc + scale * Math.exp(s * sampler());
    return out;
  }
  return loc + scale * Math.exp(s * sampler());
}

function _lnormFit_distributions(samples, opts = {}) {
  // floc default = 0 (most common case: pure log-normal). If caller
  // wants to fix loc != 0 they can pre-shift.
  const floc = opts.floc ?? 0;
  const xa = _toF64_distributions(samples);
  const n = xa.length;
  if (n === 0) throw new RangeError('fit: empty sample');
  // Take logs of (x - floc), then fit a Normal.
  const logs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const z = xa[i] - floc;
    if (z <= 0) throw new RangeError('lognorm.fit: all (x - floc) must be > 0');
    logs[i] = Math.log(z);
  }
  const { loc: mu, scale: sigma } = _normFit_distributions(logs);
  return { s: sigma, loc: floc, scale: Math.exp(mu) };
}

class _LNormFrozen_distributions {
  constructor(s, loc, scale) {
    if (s <= 0) throw new RangeError('LogNormal: s must be > 0');
    if (scale <= 0) throw new RangeError('LogNormal: scale must be > 0');
    this.s = s;
    this.loc = loc;
    this.scale = scale;
  }
  pdf(x)    { return _vec1_distributions(x, v => _lnormPdf_distributions(v, this.s, this.loc, this.scale)); }
  logpdf(x) { return _vec1_distributions(x, v => _lnormLogPdf_distributions(v, this.s, this.loc, this.scale)); }
  cdf(x)    { return _vec1_distributions(x, v => _lnormCdf_distributions(v, this.s, this.loc, this.scale)); }
  sf(x)     { return _vec1_distributions(x, v => _lnormSf_distributions(v, this.s, this.loc, this.scale)); }
  ppf(p)    { return _vec1_distributions(p, v => _lnormPpf_distributions(v, this.s, this.loc, this.scale)); }
  isf(p)    { return _vec1_distributions(p, v => _lnormIsf_distributions(v, this.s, this.loc, this.scale)); }
  rvs(size, opts) { return _lnormRvs_distributions(size, this.s, this.loc, this.scale, opts); }
  mean() {
    return this.loc + this.scale * Math.exp(0.5 * this.s * this.s);
  }
  median() {
    return this.loc + this.scale;  // exp(median of underlying normal = 0) = 1
  }
  var() {
    const ss = this.s * this.s;
    return this.scale * this.scale * Math.exp(ss) * (Math.exp(ss) - 1);
  }
  std() {
    return Math.sqrt(this.var());
  }
}

function lognorm(s, loc = 0, scale = 1) {
  return new _LNormFrozen_distributions(s, loc, scale);
}
lognorm.pdf    = (x, s, loc, scale) => _vec1_distributions(x, v => _lnormPdf_distributions(v, s, loc ?? 0, scale ?? 1));
lognorm.logpdf = (x, s, loc, scale) => _vec1_distributions(x, v => _lnormLogPdf_distributions(v, s, loc ?? 0, scale ?? 1));
lognorm.cdf    = (x, s, loc, scale) => _vec1_distributions(x, v => _lnormCdf_distributions(v, s, loc ?? 0, scale ?? 1));
lognorm.sf     = (x, s, loc, scale) => _vec1_distributions(x, v => _lnormSf_distributions(v, s, loc ?? 0, scale ?? 1));
lognorm.ppf    = (p, s, loc, scale) => _vec1_distributions(p, v => _lnormPpf_distributions(v, s, loc ?? 0, scale ?? 1));
lognorm.isf    = (p, s, loc, scale) => _vec1_distributions(p, v => _lnormIsf_distributions(v, s, loc ?? 0, scale ?? 1));
lognorm.rvs    = (size, s, loc, scale, opts) => _lnormRvs_distributions(size, s, loc ?? 0, scale ?? 1, opts);
lognorm.fit    = (samples, opts) => _lnormFit_distributions(samples, opts);

// ── Student's t-distribution ─────────────────────────────────────────
//
// scipy parameterization: t(df, loc=0, scale=1) — df=degrees of freedom.
//
// pdf and cdf use the regularized incomplete beta function, which we
// implement here via the Lentz-style continued fraction (Numerical
// Recipes §6.4). Accuracy ~1e-10 across the typical df range (1..1e6).
// ppf is bisection on cdf — robust but ~30 iterations per call.

// Continued fraction for the incomplete beta function I_x(a,b).
function _betacf_distributions(a, b, x) {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a, b).
function _betai_distributions(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b)
    + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return bt * _betacf_distributions(a, b, x) / a;
  return 1 - bt * _betacf_distributions(b, a, 1 - x) / b;
}

function _tPdf_distributions(x, df, loc, scale) {
  const z = (x - loc) / scale;
  const c = Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI);
  return c * Math.pow(1 + z * z / df, -(df + 1) / 2) / scale;
}
function _tLogPdf_distributions(x, df, loc, scale) {
  const z = (x - loc) / scale;
  return lgamma((df + 1) / 2) - lgamma(df / 2)
       - 0.5 * Math.log(df * Math.PI)
       - ((df + 1) / 2) * Math.log(1 + z * z / df)
       - Math.log(scale);
}
function _tCdf_distributions(x, df, loc, scale) {
  const z = (x - loc) / scale;
  if (!isFinite(z)) return z > 0 ? 1 : 0;
  const tt = df / (df + z * z);
  const half = 0.5 * _betai_distributions(df / 2, 0.5, tt);
  return z >= 0 ? 1 - half : half;
}
function _tSf_distributions(x, df, loc, scale) { return 1 - _tCdf_distributions(x, df, loc, scale); }

function _tPpf_distributions(p, df, loc, scale) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return loc;
  // Symmetric — solve for |z| then sign by direction.
  // Robust bracket [-50, 50] holds well for df ≥ 1.
  let lo = -50, hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const c = _tCdf_distributions(mid, df, 0, 1);
    if (Math.abs(c - p) < 1e-12) {
      lo = hi = mid; break;
    }
    if (c < p) lo = mid;
    else hi = mid;
  }
  return loc + scale * (lo + hi) / 2;
}
function _tIsf_distributions(p, df, loc, scale) { return _tPpf_distributions(1 - p, df, loc, scale); }

class _TFrozen_distributions {
  constructor(df, loc, scale) {
    this.df = df; this.loc = loc; this.scale = scale;
    this.__adderClass__ = 't_frozen';
  }
  pdf(x)    { return _vec1_distributions(x, v => _tPdf_distributions(v, this.df, this.loc, this.scale)); }
  logpdf(x) { return _vec1_distributions(x, v => _tLogPdf_distributions(v, this.df, this.loc, this.scale)); }
  cdf(x)    { return _vec1_distributions(x, v => _tCdf_distributions(v, this.df, this.loc, this.scale)); }
  sf(x)     { return _vec1_distributions(x, v => _tSf_distributions(v, this.df, this.loc, this.scale)); }
  ppf(p)    { return _vec1_distributions(p, v => _tPpf_distributions(v, this.df, this.loc, this.scale)); }
  isf(p)    { return _vec1_distributions(p, v => _tIsf_distributions(v, this.df, this.loc, this.scale)); }
  mean()    { return this.df > 1 ? this.loc : NaN; }
  median()  { return this.loc; }
  var()     { return this.df > 2 ? this.scale * this.scale * this.df / (this.df - 2) : NaN; }
  std()     { return Math.sqrt(this.var()); }
}

function t(df, loc = 0, scale = 1) {
  return new _TFrozen_distributions(df, loc, scale);
}
t.pdf    = (x, df, loc, scale) => _vec1_distributions(x, v => _tPdf_distributions(v, df, loc ?? 0, scale ?? 1));
t.logpdf = (x, df, loc, scale) => _vec1_distributions(x, v => _tLogPdf_distributions(v, df, loc ?? 0, scale ?? 1));
t.cdf    = (x, df, loc, scale) => _vec1_distributions(x, v => _tCdf_distributions(v, df, loc ?? 0, scale ?? 1));
t.sf     = (x, df, loc, scale) => _vec1_distributions(x, v => _tSf_distributions(v, df, loc ?? 0, scale ?? 1));
t.ppf    = (p, df, loc, scale) => _vec1_distributions(p, v => _tPpf_distributions(v, df, loc ?? 0, scale ?? 1));
t.isf    = (p, df, loc, scale) => _vec1_distributions(p, v => _tIsf_distributions(v, df, loc ?? 0, scale ?? 1));

// ── stats/descriptives.js ──

// Weighted descriptive statistics.
//
// All functions accept (x, w?, opts?) where w defaults to uniform.
// NaN handling is opt-in via opts.nan: 'omit' (default) | 'propagate' | 'raise'.
//
// Weights are interpreted as frequency weights — the effective sample
// size is sum(w), and ddof reduces that for unbiased variance. This
// matches numpy.cov(weights=...) and scipy.stats.DescrStatsW conventions.
//
// Inputs duck-type natra/vec ndarrays via `.data`.

function _toF64_descriptives(x) {
  if (x instanceof Float64Array) return x;
  if (x && x.data instanceof Float64Array) return x.data;
  // natra's adder wrapper: {_nd: true, _arr: <descriptor>}. The descriptor
  // shape varies — WASM-arena (memory + ptr + length + dtype) or plain
  // data-backed (data: Float64Array). Handle both.
  if (x && x._nd && x._arr) {
    const a = x._arr;
    if (a.memory && a.memory.buffer && a.dtype === 'f64' && typeof a.ptr === 'number') {
      return new Float64Array(a.memory.buffer, a.ptr, a.length);
    }
    if (a.data instanceof Float64Array) {
      return a.length != null ? a.data.subarray(0, a.length) : a.data;
    }
  }
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return Float64Array.from(x);
  throw new TypeError('expected array, Float64Array, or ndarray');
}

// Drop-NaN: returns aligned (x', w') where any NaN in x[i] OR w[i] removes
// the pair. For 'propagate', returns null. For 'raise', throws.
function _handleNaN_descriptives(x, w, mode) {
  if (mode === 'propagate') {
    for (let i = 0; i < x.length; i++) {
      if (Number.isNaN(x[i]) || (w && Number.isNaN(w[i]))) return null;
    }
    return { x, w };
  }
  if (mode === 'raise') {
    for (let i = 0; i < x.length; i++) {
      if (Number.isNaN(x[i]) || (w && Number.isNaN(w[i]))) {
        throw new Error('NaN in input (mode = "raise")');
      }
    }
    return { x, w };
  }
  // 'omit' — filter aligned NaNs.
  const keep = new Uint8Array(x.length);
  let nKeep = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isNaN(x[i]) && (!w || !Number.isNaN(w[i]))) {
      keep[i] = 1; nKeep++;
    }
  }
  if (nKeep === x.length) return { x, w };
  const xc = new Float64Array(nKeep);
  const wc = w ? new Float64Array(nKeep) : null;
  for (let i = 0, k = 0; i < x.length; i++) {
    if (keep[i]) {
      xc[k] = x[i];
      if (wc) wc[k] = w[i];
      k++;
    }
  }
  return { x: xc, w: wc };
}

function _prep_descriptives(x, w, opts) {
  const nan = (opts && opts.nan) || 'omit';
  const xa = _toF64_descriptives(x);
  let wa = null;
  if (w !== undefined && w !== null) {
    wa = _toF64_descriptives(w);
    if (wa.length !== xa.length) {
      throw new RangeError(`weight length ${wa.length} != value length ${xa.length}`);
    }
  }
  return _handleNaN_descriptives(xa, wa, nan);
}

// ── moments ─────────────────────────────────────────────────────────

function weighted_mean(x, w, opts) {
  const r = _prep_descriptives(x, w, opts);
  if (!r) return NaN;
  const xa = r.x, wa = r.w;
  const n = xa.length;
  if (n === 0) return NaN;
  if (!wa) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xa[i];
    return s / n;
  }
  let sx = 0, sw = 0;
  for (let i = 0; i < n; i++) { sx += wa[i] * xa[i]; sw += wa[i]; }
  if (sw === 0) return NaN;
  return sx / sw;
}

function weighted_var(x, w, opts) {
  const ddof = (opts && opts.ddof !== undefined) ? opts.ddof : 1;
  const r = _prep_descriptives(x, w, opts);
  if (!r) return NaN;
  const xa = r.x, wa = r.w;
  const n = xa.length;
  if (n === 0) return NaN;
  if (!wa) {
    if (n - ddof <= 0) return NaN;
    let s = 0;
    for (let i = 0; i < n; i++) s += xa[i];
    const m = s / n;
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const d = xa[i] - m;
      ss += d * d;
    }
    return ss / (n - ddof);
  }
  // Weighted with frequency-weight semantics.
  let sx = 0, sw = 0;
  for (let i = 0; i < n; i++) { sx += wa[i] * xa[i]; sw += wa[i]; }
  if (sw === 0) return NaN;
  const m = sx / sw;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = xa[i] - m;
    ss += wa[i] * d * d;
  }
  if (sw - ddof <= 0) return NaN;
  return ss / (sw - ddof);
}

function weighted_std(x, w, opts) {
  return Math.sqrt(weighted_var(x, w, opts));
}

// ── percentile / median ─────────────────────────────────────────────
//
// q is in [0, 100] to match numpy/scipy convention. Pass an array for
// multiple quantiles in one pass.
//
// Methods:
//   'linear' (default) — interpolate between adjacent values.
//   'lower'            — pick value at cum_w just below q.
//   'higher'           — pick value at cum_w just above q.

function _percentileSingle_descriptives(xs, ws, qFrac, method) {
  const n = xs.length;
  let totalW = 0;
  for (let i = 0; i < n; i++) totalW += ws[i];
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => xs[a] - xs[b]);
  // Plotting position: midpoint of cumulative weight. For uniform weights
  // this reduces to (k + 0.5) / n — the "Hazen" rule, matching numpy's
  // 'midpoint'-style behaviour on odd-length samples (median lands on the
  // middle element exactly).
  const pp = new Float64Array(n);
  let cum = 0;
  for (let k = 0; k < n; k++) {
    pp[k] = (cum + 0.5 * ws[idx[k]]) / totalW;
    cum += ws[idx[k]];
  }
  if (n === 1) return xs[idx[0]];
  if (qFrac <= pp[0]) return xs[idx[0]];
  if (qFrac >= pp[n - 1]) return xs[idx[n - 1]];
  // Binary search for bracketing pair where pp[lo] <= qFrac < pp[lo+1].
  let lo = 0, hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pp[mid] <= qFrac) lo = mid; else hi = mid;
  }
  if (method === 'lower') return xs[idx[lo]];
  if (method === 'higher') return xs[idx[lo + 1]];
  const dp = pp[lo + 1] - pp[lo];
  if (dp === 0) return xs[idx[lo]];
  const t = (qFrac - pp[lo]) / dp;
  return xs[idx[lo]] + t * (xs[idx[lo + 1]] - xs[idx[lo]]);
}

function weighted_percentile(x, w, q, opts) {
  const method = (opts && opts.method) || 'linear';
  const r = _prep_descriptives(x, w, opts);
  if (!r) {
    if (typeof q === 'number') return NaN;
    return new Float64Array(q.length).fill(NaN);
  }
  const xa = r.x;
  const wa = r.w || (() => { const u = new Float64Array(xa.length); u.fill(1); return u; })();
  if (xa.length === 0) {
    if (typeof q === 'number') return NaN;
    return new Float64Array(q.length).fill(NaN);
  }
  if (typeof q === 'number') {
    return _percentileSingle_descriptives(xa, wa, q / 100, method);
  }
  const qa = _toF64_descriptives(q);
  const out = new Float64Array(qa.length);
  for (let i = 0; i < qa.length; i++) {
    out[i] = _percentileSingle_descriptives(xa, wa, qa[i] / 100, method);
  }
  return out;
}

function weighted_median(x, w, opts) {
  return weighted_percentile(x, w, 50, opts);
}

// ── ECDF ────────────────────────────────────────────────────────────
//
// Returns { x_sorted, F } where F is the cumulative weight up to and
// including each sorted x. F[i] is the fraction of total weight at or
// below x_sorted[i]; values are in (0, 1].

function ecdf(x, w, opts) {
  const r = _prep_descriptives(x, w, opts);
  if (!r) return { x_sorted: new Float64Array(0), F: new Float64Array(0) };
  const xa = r.x;
  const wa = r.w;
  const n = xa.length;
  if (n === 0) return { x_sorted: new Float64Array(0), F: new Float64Array(0) };
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => xa[a] - xa[b]);
  const x_sorted = new Float64Array(n);
  const F = new Float64Array(n);
  let totalW = 0;
  if (wa) {
    for (let i = 0; i < n; i++) totalW += wa[i];
  } else {
    totalW = n;
  }
  let cum = 0;
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    x_sorted[k] = xa[i];
    cum += wa ? wa[i] : 1;
    F[k] = cum / totalW;
  }
  return { x_sorted, F };
}

// ── histogram ───────────────────────────────────────────────────────

function histogram(x, opts = {}) {
  const xa = _toF64_descriptives(x);
  const wa = opts.weights ? _toF64_descriptives(opts.weights) : null;
  if (wa && wa.length !== xa.length) {
    throw new RangeError('weights length must match x length');
  }
  const nan = opts.nan || 'omit';
  const r = _handleNaN_descriptives(xa, wa, nan);
  if (!r) {
    return { counts: new Float64Array(0), edges: new Float64Array(0) };
  }
  const xs = r.x;
  const ws = r.w;
  const n = xs.length;

  let lo, hi;
  if (opts.range) {
    [lo, hi] = opts.range;
  } else {
    lo = Infinity; hi = -Infinity;
    for (let i = 0; i < n; i++) {
      if (xs[i] < lo) lo = xs[i];
      if (xs[i] > hi) hi = xs[i];
    }
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
  }
  const nbins = opts.bins ?? 10;
  const edges = new Float64Array(nbins + 1);
  const step = (hi - lo) / nbins;
  for (let k = 0; k <= nbins; k++) edges[k] = lo + k * step;

  const counts = new Float64Array(nbins);
  for (let i = 0; i < n; i++) {
    const v = xs[i];
    if (v < lo || v > hi) continue;
    let bin = Math.floor((v - lo) / step);
    if (bin === nbins) bin = nbins - 1;  // include right edge
    counts[bin] += ws ? ws[i] : 1;
  }
  if (opts.density) {
    let total = 0;
    for (let k = 0; k < nbins; k++) total += counts[k];
    if (total > 0) {
      const norm = 1 / (total * step);
      for (let k = 0; k < nbins; k++) counts[k] *= norm;
    }
  }
  return { counts, edges };
}

// ── higher moments ──────────────────────────────────────────────────
//
// Returns { mean, var, skewness, kurtosis } where kurtosis is the
// excess kurtosis (Pearson — fisher=true convention; subtracts 3).

function moments(x, opts) {
  const r = _prep_descriptives(x, null, opts);
  if (!r) return { mean: NaN, var: NaN, skewness: NaN, kurtosis: NaN };
  const xa = r.x;
  const n = xa.length;
  if (n === 0) return { mean: NaN, var: NaN, skewness: NaN, kurtosis: NaN };
  let s = 0;
  for (let i = 0; i < n; i++) s += xa[i];
  const m = s / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = xa[i] - m;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n; m3 /= n; m4 /= n;
  const std = Math.sqrt(m2);
  return {
    mean: m,
    var: m2,
    skewness: std === 0 ? 0 : m3 / (std * std * std),
    kurtosis: m2 === 0 ? 0 : m4 / (m2 * m2) - 3,
  };
}

// scipy.stats.gmean(a) — geometric mean = exp(mean(log(a))). All values
// must be positive (returns NaN if any are ≤ 0).
function gmean(x) {
  const xa = _toF64_descriptives(x);
  if (xa.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < xa.length; i++) {
    if (xa[i] <= 0) return NaN;
    s += Math.log(xa[i]);
  }
  return Math.exp(s / xa.length);
}

// scipy.stats.hmean(a) — harmonic mean = n / sum(1/a). All values must
// be positive (returns NaN if any are ≤ 0).
function hmean(x) {
  const xa = _toF64_descriptives(x);
  if (xa.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < xa.length; i++) {
    if (xa[i] <= 0) return NaN;
    s += 1 / xa[i];
  }
  return xa.length / s;
}

// scipy.stats.ttest_ind(a, b) — Welch's t-test for two independent
// samples (default scipy behavior since 1.0). Returns the t-statistic
// and two-sided p-value. We compute Welch's t (unequal variances) and
// the Welch-Satterthwaite degrees of freedom; p-value via the Student-t
// CDF (lives in distributions.js).
//
// Returns { statistic, pvalue } — also array-indexable as [t, p] to
// match scipy's named-tuple result for `t, p = stats.ttest_ind(a, b)`
// destructuring.
function ttest_ind(a, b, opts) {
  const xa = _toF64_descriptives(a);
  const xb = _toF64_descriptives(b);
  const n1 = xa.length, n2 = xb.length;
  if (n1 < 2 || n2 < 2) return { statistic: NaN, pvalue: NaN };
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n1; i++) s1 += xa[i];
  for (let i = 0; i < n2; i++) s2 += xb[i];
  const m1 = s1 / n1, m2 = s2 / n2;
  let v1 = 0, v2 = 0;
  for (let i = 0; i < n1; i++) v1 += (xa[i] - m1) ** 2;
  for (let i = 0; i < n2; i++) v2 += (xb[i] - m2) ** 2;
  v1 /= (n1 - 1); v2 /= (n2 - 1);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return _statResult_descriptives(0, 1);
  const tstat = (m1 - m2) / se;
  // Welch-Satterthwaite df approximation
  const num = (v1 / n1 + v2 / n2) ** 2;
  const den = (v1 * v1) / (n1 * n1 * (n1 - 1)) + (v2 * v2) / (n2 * n2 * (n2 - 1));
  const df = den === 0 ? n1 + n2 - 2 : num / den;
  // Two-sided p-value via Student-t CDF — lazy import to avoid the
  // distributions.js → descriptives.js cycle at module-eval time.
  const { _betai_for_t } = _ttestBetaiBridge_descriptives();
  const tt = df / (df + tstat * tstat);
  const p = _betai_for_t(df / 2, 0.5, tt);   // 2-sided
  return _statResult_descriptives(tstat, p);
}

function _statResult_descriptives(statistic, pvalue) {
  // Indexable AND named — supports both `r.statistic` / `r.pvalue` and
  // `t, p = ttest_ind(...)` tuple unpacking in adder.
  const r = [statistic, pvalue];
  r.statistic = statistic;
  r.pvalue = pvalue;
  return r;
}

// Tiny duplicate of the incomplete-beta CF — distributions.js owns the
// full implementation, but importing it here would create a cycle
// (distributions.js imports from special.js, which descriptives.js
// also uses). Cheap to maintain a separate copy of ~25 lines.
function _ttestBetaiBridge_descriptives() {
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // lgamma comes from util/special.js — but we shouldn't import here
    // (cycle risk). Use Stirling's approximation as a fallback; the
    // accuracy is ~1e-8 for our use, fine for p-values.
    const lg = (n) => {
      // Stirling
      const x = n;
      return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI)
           + 1 / (12 * x);
    };
    const bt = Math.exp(lg(a + b) - lg(a) - lg(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
  return { _betai_for_t: betai };
}

// ── stats/transform.js ──

// Statistical transforms — normal score, Box-Cox, Yeo-Johnson.
//
// normal_score_transform converts samples to standard-normal scores by
// rank → plotting position → inverse normal CDF. The shape (tie handling,
// plotting position, tail extrapolation, BDL replacement) follows GSLIB
// conventions used in mining geology, parameterized via opts.
//
// Returns { y, table, inverse } where:
//   y         — Float64Array of standard-normal scores aligned with input
//   table     — { x_sorted, y_sorted, w_sorted } the lookup used internally
//   inverse   — callable that maps standard-normal scores back to the
//               original-units distribution (for backtransforming
//               simulation results)



function _toF64_transform(x) {
  if (x instanceof Float64Array) return x;
  if (x && x.data instanceof Float64Array) return x.data;
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return Float64Array.from(x);
  throw new TypeError('expected array, Float64Array, or ndarray');
}

// Plotting positions: rank i (1-indexed) of n becomes a probability p in (0, 1).
// Standard formulas, all of shape (i - a) / (n + 1 - 2a) for some a:
//   hazen   a = 0.5  → (i - 0.5) / n        [mining default]
//   blom    a = 3/8  → (i - 3/8) / (n + 1/4)
//   tukey   a = 1/3  → (i - 1/3) / (n + 1/3)
//   weibull a = 0    → i / (n + 1)
const _PLOT_POS_A_transform = { hazen: 0.5, blom: 0.375, tukey: 1/3, weibull: 0 };

function _plottingPosition_transform(i, n, name) {
  const a = _PLOT_POS_A_transform[name];
  if (a === undefined) throw new Error(`unknown plot_pos: ${name}`);
  return (i + 1 - a) / (n + 1 - 2 * a);  // i is 0-indexed → use i+1
}

// Tail extrapolation models for the inverse table at p < F[0] or p > F[n-1].
// Returns the extrapolated value in original units.
function _extrapTail_transform(p, F, vals, model, opts) {
  const lower = p < F[0];
  if (model === 'linear') {
    // Linear in p → x via local slope at the endpoint.
    if (lower) {
      // Slope between (F[0], vals[0]) and (F[1], vals[1])
      if (F.length < 2) return vals[0];
      const slope = (vals[1] - vals[0]) / (F[1] - F[0]);
      // Extrapolate to p, but clip to a user-supplied minimum.
      const xMin = opts.tail_min ?? -Infinity;
      const x = vals[0] + slope * (p - F[0]);
      return Math.max(x, xMin);
    } else {
      const n = F.length;
      if (n < 2) return vals[n - 1];
      const slope = (vals[n - 1] - vals[n - 2]) / (F[n - 1] - F[n - 2]);
      const xMax = opts.tail_max ?? Infinity;
      const x = vals[n - 1] + slope * (p - F[n - 1]);
      return Math.min(x, xMax);
    }
  }
  if (model === 'power') {
    // Heavy-tail extrapolation: x ∝ -log(1-p)^α for upper tail. Rare in
    // mining; supported with a user-supplied alpha (default 1.5).
    const alpha = opts.tail_alpha ?? 1.5;
    if (lower) {
      const xMin = opts.tail_min ?? 0;
      const last = vals[0];
      const lastP = F[0];
      const ratio = (-Math.log(1 - p)) / (-Math.log(1 - lastP));
      return xMin + (last - xMin) * Math.pow(ratio, 1 / alpha);
    } else {
      const xMax = opts.tail_max ?? Infinity;
      const n = F.length;
      const last = vals[n - 1];
      const lastP = F[n - 1];
      // Scaled tail decay
      const ratio = (-Math.log(1 - p)) / (-Math.log(1 - lastP));
      const x = last + (xMax - last) * (1 - 1 / Math.pow(ratio, 1 / alpha));
      return Math.min(Math.max(x, last), xMax);
    }
  }
  if (model === 'hyperbolic') {
    // Hyperbolic tail (Krige-Roby style for heavily-skewed assay data).
    // Implemented as a special case of power with alpha=1 unless overridden.
    return _extrapTail_transform(p, F, vals, 'power',
      { ...opts, tail_alpha: opts.tail_alpha ?? 1.0 });
  }
  if (lower) return vals[0];
  return vals[F.length - 1];
}

// Tie handling — resolves duplicate x values when assigning ranks.
//   midpoint — all duplicates get the average rank (default; matches
//              GSLIB and most published kriging code)
//   jitter   — add a tiny random nudge to break ties
//   random   — randomize the order within tied groups
function _resolveTies_transform(xs, mode, rng) {
  const n = xs.length;
  // Stable sort indices by xs.
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => xs[a] - xs[b]);
  if (mode === 'jitter') {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = xs[i] + (rng() - 0.5) * 1e-12;
    }
    // Re-sort with jitter applied.
    idx.sort((a, b) => out[a] - out[b]);
    return idx;
  }
  if (mode === 'random') {
    // Group consecutive ties, shuffle each group.
    let i = 0;
    while (i < n) {
      let j = i + 1;
      while (j < n && xs[idx[j]] === xs[idx[i]]) j++;
      // Fisher-Yates shuffle of idx[i..j)
      for (let k = j - 1; k > i; k--) {
        const r = i + Math.floor(rng() * (k - i + 1));
        const t = idx[k]; idx[k] = idx[r]; idx[r] = t;
      }
      i = j;
    }
    return idx;
  }
  // 'midpoint' — return idx as-is, ranks computed via averaging below
  return idx;
}

// Average ranks for ties: each tied group gets the same rank, equal to
// the average of the ranks they would have received.
function _averageRanks_transform(idx, xs) {
  const n = idx.length;
  const ranks = new Float64Array(n);  // ranks aligned to idx-order, 0-indexed
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && xs[idx[j]] === xs[idx[i]]) j++;
    // average rank of group [i, j) in 0-indexed is (i + j - 1) / 2
    const avg = (i + j - 1) / 2;
    for (let k = i; k < j; k++) ranks[k] = avg;
    i = j;
  }
  return ranks;
}

function normal_score_transform(x, opts = {}) {
  const xa = _toF64_transform(x);
  const w = opts.weights ? _toF64_transform(opts.weights) : null;
  if (w && w.length !== xa.length) {
    throw new RangeError('weights length must match x length');
  }
  const tieMode = opts.tie || 'midpoint';
  const plotPos = opts.plot_pos || 'hazen';
  const tail = opts.tail || 'linear';
  const rng = makeRng(opts.random_state ?? null);

  // BDL (below-detection-limit) handling — replace values <= bdl.value with
  // either bdl.value/2 or bdl.value*fraction, before transform. Matches
  // GSLIB's BDL convention.
  let xs = xa;
  if (opts.bdl && opts.bdl.value !== undefined) {
    const v = opts.bdl.value;
    const replace = opts.bdl.replace || 'half';
    const replacement =
      replace === 'half' ? v / 2 :
      replace === 'fraction' ? v * (opts.bdl.fraction ?? 0.5) :
      replace;
    xs = new Float64Array(xa.length);
    for (let i = 0; i < xa.length; i++) {
      xs[i] = xa[i] <= v ? replacement : xa[i];
    }
  }

  // Sort indices, handle ties
  const idx = _resolveTies_transform(xs, tieMode, rng);
  const n = xs.length;

  // Compute weighted plotting positions if weights given, else uniform.
  const F = new Float64Array(n);
  if (w) {
    let totalW = 0;
    for (let i = 0; i < n; i++) totalW += w[i];
    let cum = 0;
    for (let k = 0; k < n; k++) {
      // midpoint of k-th sample's weight contribution
      const wi = w[idx[k]];
      cum += wi;
      F[k] = (cum - 0.5 * wi) / totalW;  // hazen-like for weighted
    }
  } else {
    if (tieMode === 'midpoint') {
      // Average-rank-based plotting positions
      const ranks = _averageRanks_transform(idx, xs);
      for (let k = 0; k < n; k++) {
        F[k] = _plottingPosition_transform(ranks[k], n, plotPos);
      }
    } else {
      for (let k = 0; k < n; k++) {
        F[k] = _plottingPosition_transform(k, n, plotPos);
      }
    }
  }

  // Build forward result: y[i] = ndtri(F at sorted-position-of-i)
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    y[idx[k]] = ndtri(F[k]);
  }

  // Build the lookup table for inverse: x_sorted ↔ F (and its derived y).
  const x_sorted = new Float64Array(n);
  const y_sorted = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    x_sorted[k] = xs[idx[k]];
    y_sorted[k] = ndtri(F[k]);
  }

  const inverse = (yQuery) => {
    if (typeof yQuery === 'number') return _invOne_transform(yQuery, x_sorted, y_sorted, F, tail, opts);
    const ya = _toF64_transform(yQuery);
    const out = new Float64Array(ya.length);
    for (let i = 0; i < ya.length; i++) {
      out[i] = _invOne_transform(ya[i], x_sorted, y_sorted, F, tail, opts);
    }
    return out;
  };

  return {
    y,
    table: { x_sorted, y_sorted, F },
    inverse,
  };
}

// Inverse a single y: convert to p via Φ, look up in F, interpolate x_sorted.
function _invOne_transform(yq, x_sorted, y_sorted, F, tail, opts) {
  const n = x_sorted.length;
  if (n === 0) return NaN;
  // Convert y to p (cdf of standard normal) — but it's faster to find by
  // y_sorted directly since that's monotone.
  // Find first y_sorted[k] >= yq
  let lo = 0, hi = n - 1;
  // Exact-endpoint cases bypass tail extrapolation (otherwise the local
  // erf approximation would inject ~1.5e-7 of error into clean roundtrips).
  if (yq === y_sorted[0]) return x_sorted[0];
  if (yq === y_sorted[n - 1]) return x_sorted[n - 1];
  if (yq < y_sorted[0]) {
    const p = 0.5 * (1 + _erfApprox_transform(yq / Math.SQRT2));
    return _extrapTail_transform(p, F, x_sorted, tail, opts);
  }
  if (yq > y_sorted[n - 1]) {
    const p = 0.5 * (1 + _erfApprox_transform(yq / Math.SQRT2));
    return _extrapTail_transform(p, F, x_sorted, tail, opts);
  }
  // Binary search for the bracketing pair
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (y_sorted[mid] <= yq) lo = mid; else hi = mid;
  }
  // Linear interpolate in (y_sorted[lo], y_sorted[lo+1])
  const dy = y_sorted[lo + 1] - y_sorted[lo];
  if (dy === 0) return x_sorted[lo];
  const t = (yq - y_sorted[lo]) / dy;
  return x_sorted[lo] + t * (x_sorted[lo + 1] - x_sorted[lo]);
}

// Local copy of erf (we don't want a circular import on special.js by way
// of distributions; this is fine here since we just need the standard form
// for the rare extrapolation lookup).
function _erfApprox_transform(x) {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const y = 1.0 - (((((
        1.061405429  * t
      - 1.453152027) * t
      + 1.421413741) * t
      - 0.284496736) * t
      + 0.254829592) * t) * Math.exp(-ax * ax);
  return sign * y;
}

// ── stats/kde.js ──

// 1D Gaussian kernel density estimation.
//
// Mirrors scipy.stats.gaussian_kde for univariate data. v0.1 ships 1D only;
// multivariate is on the roadmap (~50 LOC for diagonal bandwidth).
//
// Bandwidth selection:
//   'scott'      h = n^(-1/5) * sigma             [scipy default]
//   'silverman'  h = (n*3/4)^(-1/5) * sigma       [Silverman's rule of thumb]
//   <number>     fixed bandwidth in data units (sigma * factor for scipy parity)
//   <function>   custom bandwidth callable: fn(kde) → factor  (scipy parity)
//
// In scipy parity mode, the bandwidth is `factor * sigma` where `factor`
// comes from one of the rules above. We follow that convention so that
// passing 'scott' or 'silverman' here produces identical numbers.


function _toF64_kde(x) {
  if (x instanceof Float64Array) return x;
  if (x && x.data instanceof Float64Array) return x.data;
  if (Array.isArray(x) || ArrayBuffer.isView(x)) return Float64Array.from(x);
  throw new TypeError('expected array, Float64Array, or ndarray');
}

function _stdDev_kde(xs, weights) {
  const n = xs.length;
  if (!weights) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[i];
    const m = s / n;
    let ss = 0;
    for (let i = 0; i < n; i++) { const d = xs[i] - m; ss += d * d; }
    return Math.sqrt(ss / (n - 1));  // ddof=1, matches scipy
  }
  let sw = 0, sx = 0;
  for (let i = 0; i < n; i++) { sw += weights[i]; sx += weights[i] * xs[i]; }
  const m = sx / sw;
  let ss = 0, sw2 = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i] - m;
    ss += weights[i] * d * d;
    sw2 += weights[i] * weights[i];
  }
  // Bessel-style correction for weighted variance (matches scipy's _neff
  // adjustment with reliability weights).
  const neff = (sw * sw) / sw2;
  return Math.sqrt(ss / sw * neff / (neff - 1));
}

const _NORM_CONST_1D_kde = 1 / Math.sqrt(2 * Math.PI);

function gaussian_kde(dataset, opts = {}) {
  const xs = _toF64_kde(dataset);
  const n = xs.length;
  if (n < 2) {
    throw new Error('gaussian_kde requires at least 2 data points');
  }
  const weights = opts.weights ? _toF64_kde(opts.weights) : null;
  if (weights) {
    if (weights.length !== n) throw new RangeError('weights length mismatch');
    let sum = 0;
    for (let i = 0; i < n; i++) sum += weights[i];
    if (sum === 0) throw new Error('weights sum to zero');
    // Normalize weights to sum to 1 (scipy convention).
    const norm = 1 / sum;
    const w2 = new Float64Array(n);
    for (let i = 0; i < n; i++) w2[i] = weights[i] * norm;
    return _build_kde(xs, w2, opts);
  }
  return _build_kde(xs, null, opts);
}

function _build_kde(xs, weights, opts) {
  const n = xs.length;
  // Effective sample size: n for unweighted, 1/sum(w²) for weighted (after
  // weights have been normalized to sum to 1). Matches scipy's neff.
  let neff = n;
  if (weights) {
    let s2 = 0;
    for (let i = 0; i < n; i++) s2 += weights[i] * weights[i];
    neff = 1 / s2;
  }

  const sigma = _stdDev_kde(xs, weights);
  const bwMethod = opts.bw_method ?? 'scott';
  let factor;
  if (bwMethod === 'scott') {
    factor = Math.pow(neff, -1 / 5);
  } else if (bwMethod === 'silverman') {
    factor = Math.pow(neff * 3 / 4, -1 / 5);
  } else if (typeof bwMethod === 'number') {
    factor = bwMethod;  // fixed scalar factor (sigma multiplier)
  } else if (typeof bwMethod === 'function') {
    factor = bwMethod({ n, neff, sigma, dataset: xs });
  } else {
    throw new Error(`unknown bw_method: ${bwMethod}`);
  }
  const h = factor * sigma;
  if (!(h > 0)) throw new Error('bandwidth resolved to non-positive value');

  // Precompute reciprocal for hot loops.
  const inv2h2 = 1 / (2 * h * h);
  const norm = _NORM_CONST_1D_kde / h;

  function pdf(points) {
    if (typeof points === 'number') return _pdfOne(points);
    const pa = _toF64_kde(points);
    const out = new Float64Array(pa.length);
    for (let i = 0; i < pa.length; i++) out[i] = _pdfOne(pa[i]);
    return out;
  }

  function _pdfOne(x) {
    let s = 0;
    if (weights) {
      for (let i = 0; i < n; i++) {
        const d = x - xs[i];
        s += weights[i] * Math.exp(-d * d * inv2h2);
      }
      return norm * s;
    }
    for (let i = 0; i < n; i++) {
      const d = x - xs[i];
      s += Math.exp(-d * d * inv2h2);
    }
    return (norm / n) * s;
  }

  // logpdf — implemented as log(pdf) for v0.1. Numerically stable
  // log-sum-exp can land in v0.2 if a use case demands it.
  function logpdf(points) {
    const p = pdf(points);
    if (typeof p === 'number') return Math.log(p);
    const out = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) out[i] = Math.log(p[i]);
    return out;
  }

  // CDF via trapezoidal rule on a fine grid covering ±5h around the data.
  function cdf(points) {
    if (typeof points === 'number') return _cdfOne(points);
    const pa = _toF64_kde(points);
    const out = new Float64Array(pa.length);
    for (let i = 0; i < pa.length; i++) out[i] = _cdfOne(pa[i]);
    return out;
  }

  function _cdfOne(x) {
    // Closed form: each kernel is a normal CDF; sum the contributions.
    // CDF_i(x) = Φ((x - xs[i]) / h)
    let s = 0;
    if (weights) {
      for (let i = 0; i < n; i++) s += weights[i] * _Phi_kde((x - xs[i]) / h);
      return s;
    }
    for (let i = 0; i < n; i++) s += _Phi_kde((x - xs[i]) / h);
    return s / n;
  }

  function resample(size, opts2 = {}) {
    const m = size ?? n;
    const out = new Float64Array(m);
    const rng = opts2.random_state !== undefined
      ? _mulberry32_kde(opts2.random_state)
      : Math.random;
    // Sample-with-replacement-then-jitter — Marsaglia polar for the gaussian.
    let cached = NaN;
    const norm01 = () => {
      if (!Number.isNaN(cached)) { const v = cached; cached = NaN; return v; }
      let u, v, s;
      do {
        u = 2 * rng() - 1;
        v = 2 * rng() - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const f = Math.sqrt(-2 * Math.log(s) / s);
      cached = v * f;
      return u * f;
    };
    if (weights) {
      // Build cumulative for weighted sampling
      const cum = new Float64Array(n);
      let c = 0;
      for (let i = 0; i < n; i++) { c += weights[i]; cum[i] = c; }
      for (let k = 0; k < m; k++) {
        const r = rng() * c;
        // Binary search for insertion
        let lo = 0, hi = n;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cum[mid] < r) lo = mid + 1; else hi = mid;
        }
        out[k] = xs[Math.min(lo, n - 1)] + h * norm01();
      }
    } else {
      for (let k = 0; k < m; k++) {
        const i = Math.floor(rng() * n);
        out[k] = xs[Math.min(i, n - 1)] + h * norm01();
      }
    }
    return out;
  }

  return {
    pdf,
    logpdf,
    cdf,
    resample,
    evaluate: pdf,        // scipy alias
    factor,               // bandwidth factor
    bandwidth: h,         // bandwidth in data units (sigma * factor)
    n,
    neff,
    dataset: xs,
    weights,
  };
}

// Standard normal CDF — uses our local erf approximation. Accuracy ~1.5e-7
// is fine for KDE work (the kernel sum dominates error budget anyway).
function _Phi_kde(z) {
  return 0.5 * (1 + _erfApprox_kde(z / Math.SQRT2));
}

function _erfApprox_kde(x) {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + 0.3275911 * ax);
  const y = 1.0 - (((((
        1.061405429  * t
      - 1.453152027) * t
      + 1.421413741) * t
      - 0.284496736) * t
      + 0.254829592) * t) * Math.exp(-ax * ax);
  return sign * y;
}

// mulberry32 for deterministic resample. Inlined to avoid pulling random.js
// circularly through this module's public surface.
function _mulberry32_kde(seed) {
  let s = (seed | 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Suppress unused import warning in some bundlers — ndtri may be useful
// in a future quantile() addition.
void ndtri;

// ── spatial/distance.js ──

// Pairwise distance matrices.
//
// scipy.spatial.distance parity for the distance functions that actually
// matter in geoscience and stats work: euclidean, sqeuclidean, manhattan
// (cityblock), chebyshev, minkowski, mahalanobis, cosine, correlation,
// hamming. Anisotropy via a per-axis weight vector — the geological case
// of using rotated/scaled distances for variograms (handled at a higher
// level by callers, e.g. by transforming inputs before calling cdist).
//
// Inputs:
//   X, Y — arrays of vectors, shape (n, d). Accepted forms:
//     • Float64Array (flat row-major) + opts.n + opts.d
//     • Array of arrays (each inner array length d)
//     • ndarray-like { data: Float64Array, shape: [n, d] }
//
// Outputs:
//   cdist(X, Y) → Float64Array of length nX * nY (row-major)
//   pdist(X)    → Float64Array of length nX*(nX-1)/2 (upper triangle,
//                  scipy-compatible packed form)
//   squareform(d) → expand pdist to full nX×nX matrix and back
//
// Acceleration: when nX*nY ≥ GEMM_NM_THRESHOLD and natra is registered
// as a backend, euclidean/sqeuclidean dispatch through the gemm trick
// (D² = ‖X‖² + ‖Y‖² − 2XYᵀ) for a 5-10× speedup. Opt-out via
// opts.backend = 'inline'.


function _normalize_distance(X, opts) {
  if (X instanceof Float64Array) {
    if (opts && opts.n !== undefined && opts.d !== undefined) {
      return { data: X, n: opts.n, d: opts.d };
    }
    throw new TypeError('Flat Float64Array requires opts.n and opts.d');
  }
  if (X && X.data instanceof Float64Array && Array.isArray(X.shape)) {
    if (X.shape.length !== 2) throw new RangeError('expected 2D ndarray');
    return { data: X.data, n: X.shape[0], d: X.shape[1] };
  }
  if (Array.isArray(X)) {
    if (X.length === 0) return { data: new Float64Array(0), n: 0, d: 0 };
    const d = Array.isArray(X[0]) ? X[0].length : X[0].length;
    const n = X.length;
    const out = new Float64Array(n * d);
    for (let i = 0; i < n; i++) {
      const row = X[i];
      for (let j = 0; j < d; j++) out[i * d + j] = row[j];
    }
    return { data: out, n, d };
  }
  throw new TypeError('expected ndarray, flat Float64Array, or array of arrays');
}

// ── kernel functions ─────────────────────────────────────────────────
//
// Each metric kernel takes pointers (a, b, d, w?) and returns the distance.
// We dispatch once outside the inner loop and inline the metric body.

function _euclid_distance(a, b, d, w) {
  let s = 0;
  if (w) {
    for (let k = 0; k < d; k++) {
      const t = a[k] - b[k];
      s += w[k] * t * t;
    }
  } else {
    for (let k = 0; k < d; k++) {
      const t = a[k] - b[k];
      s += t * t;
    }
  }
  return Math.sqrt(s);
}

function _sqeuclid_distance(a, b, d, w) {
  let s = 0;
  if (w) {
    for (let k = 0; k < d; k++) {
      const t = a[k] - b[k];
      s += w[k] * t * t;
    }
  } else {
    for (let k = 0; k < d; k++) {
      const t = a[k] - b[k];
      s += t * t;
    }
  }
  return s;
}

function _manhattan_distance(a, b, d, w) {
  let s = 0;
  if (w) {
    for (let k = 0; k < d; k++) s += w[k] * Math.abs(a[k] - b[k]);
  } else {
    for (let k = 0; k < d; k++) s += Math.abs(a[k] - b[k]);
  }
  return s;
}

function _chebyshev_distance(a, b, d) {
  let m = 0;
  for (let k = 0; k < d; k++) {
    const t = Math.abs(a[k] - b[k]);
    if (t > m) m = t;
  }
  return m;
}

function _minkowski_distance(a, b, d, w, p) {
  let s = 0;
  if (w) {
    for (let k = 0; k < d; k++) {
      s += w[k] * Math.pow(Math.abs(a[k] - b[k]), p);
    }
  } else {
    for (let k = 0; k < d; k++) {
      s += Math.pow(Math.abs(a[k] - b[k]), p);
    }
  }
  return Math.pow(s, 1 / p);
}

function _hamming_distance(a, b, d, w) {
  let s = 0, total = 0;
  if (w) {
    for (let k = 0; k < d; k++) {
      total += w[k];
      if (a[k] !== b[k]) s += w[k];
    }
    return total > 0 ? s / total : 0;
  }
  for (let k = 0; k < d; k++) if (a[k] !== b[k]) s++;
  return s / d;
}

function _cosine_distance(a, b, d) {
  let dot = 0, na = 0, nb = 0;
  for (let k = 0; k < d; k++) {
    dot += a[k] * b[k];
    na += a[k] * a[k];
    nb += b[k] * b[k];
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag === 0 ? 0 : 1 - dot / mag;
}

function _correlation_distance(a, b, d) {
  let ma = 0, mb = 0;
  for (let k = 0; k < d; k++) { ma += a[k]; mb += b[k]; }
  ma /= d; mb /= d;
  let dot = 0, na = 0, nb = 0;
  for (let k = 0; k < d; k++) {
    const x = a[k] - ma, y = b[k] - mb;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag === 0 ? 0 : 1 - dot / mag;
}

// Mahalanobis: distance with an inverse covariance matrix VI (d×d).
// (a-b)ᵀ VI (a-b) — passed flat, row-major, length d*d.
function _mahalanobis_distance(a, b, d, VI) {
  // diff = a - b
  const diff = new Float64Array(d);
  for (let k = 0; k < d; k++) diff[k] = a[k] - b[k];
  // tmp = VI · diff
  let s = 0;
  for (let i = 0; i < d; i++) {
    let row = 0;
    const base = i * d;
    for (let j = 0; j < d; j++) row += VI[base + j] * diff[j];
    s += diff[i] * row;
  }
  return Math.sqrt(s);
}

// ── public API ───────────────────────────────────────────────────────

function _resolveMetric_distance(metric) {
  if (typeof metric === 'function') return { fn: metric, kind: 'custom' };
  switch (metric) {
    case undefined:
    case 'euclidean':       return { fn: _euclid_distance, kind: 'simple' };
    case 'sqeuclidean':     return { fn: _sqeuclid_distance, kind: 'simple' };
    case 'cityblock':
    case 'manhattan':       return { fn: _manhattan_distance, kind: 'simple' };
    case 'chebyshev':       return { fn: _chebyshev_distance, kind: 'noweight' };
    case 'minkowski':       return { fn: _minkowski_distance, kind: 'minkowski' };
    case 'hamming':         return { fn: _hamming_distance, kind: 'simple' };
    case 'cosine':          return { fn: _cosine_distance, kind: 'noweight' };
    case 'correlation':     return { fn: _correlation_distance, kind: 'noweight' };
    case 'mahalanobis':     return { fn: _mahalanobis_distance, kind: 'mahalanobis' };
    default:
      throw new Error(`unknown metric: ${metric}`);
  }
}

// Gemm-accelerated euclidean / sqeuclidean. Uses ‖X−Y‖² = ‖X‖² + ‖Y‖² − 2XYᵀ.
// Returns Float64Array of length n*m, or null if dispatch failed.
//
// Centering: ‖X−Y‖² is invariant under translation, so we shift both X
// and Y by the centroid of their union before the gemm trick. This kills
// the catastrophic cancellation that hits when input magnitudes are large
// (e.g. UTM coordinates). Cost is O(nd + md), negligible vs the O(nmd)
// main work.
function _cdistEuclideanGemm_distance(Xn, Yn, natra, squared) {
  try {
    // Compute joint centroid across X and Y per axis.
    const d = Xn.d;
    const c = new Float64Array(d);
    const total = Xn.n + Yn.n;
    for (let i = 0; i < Xn.n; i++) {
      const base = i * d;
      for (let k = 0; k < d; k++) c[k] += Xn.data[base + k];
    }
    for (let j = 0; j < Yn.n; j++) {
      const base = j * d;
      for (let k = 0; k < d; k++) c[k] += Yn.data[base + k];
    }
    for (let k = 0; k < d; k++) c[k] /= total;

    // Build centered copies (in JS — natra.array() will copy them into wasm).
    const Xc = new Float64Array(Xn.n * d);
    for (let i = 0; i < Xn.n; i++) {
      const base = i * d;
      for (let k = 0; k < d; k++) Xc[base + k] = Xn.data[base + k] - c[k];
    }
    const Yc = new Float64Array(Yn.n * d);
    for (let j = 0; j < Yn.n; j++) {
      const base = j * d;
      for (let k = 0; k < d; k++) Yc[base + k] = Yn.data[base + k] - c[k];
    }

    return natra.scope((s) => {
      const X = natra.array(Xc, { shape: [Xn.n, d] });
      const Y = natra.array(Yc, { shape: [Yn.n, d] });
      const XYt = s.matmul(X, Y.T);  // n × m
      const xy = natra.toTypedArray(XYt);
      // Row norms ‖Xᶜ[i]‖²
      const xnorm = new Float64Array(Xn.n);
      for (let i = 0; i < Xn.n; i++) {
        let sm = 0;
        const base = i * d;
        for (let k = 0; k < d; k++) {
          const v = Xc[base + k];
          sm += v * v;
        }
        xnorm[i] = sm;
      }
      // Col norms ‖Yᶜ[j]‖²
      const ynorm = new Float64Array(Yn.n);
      for (let j = 0; j < Yn.n; j++) {
        let sm = 0;
        const base = j * d;
        for (let k = 0; k < d; k++) {
          const v = Yc[base + k];
          sm += v * v;
        }
        ynorm[j] = sm;
      }
      const out = new Float64Array(Xn.n * Yn.n);
      if (squared) {
        for (let i = 0; i < Xn.n; i++) {
          const xi = xnorm[i];
          const baseRow = i * Yn.n;
          for (let j = 0; j < Yn.n; j++) {
            let v = xi + ynorm[j] - 2 * xy[baseRow + j];
            if (v < 0) v = 0;  // numerical noise — squared distances are non-negative
            out[baseRow + j] = v;
          }
        }
      } else {
        for (let i = 0; i < Xn.n; i++) {
          const xi = xnorm[i];
          const baseRow = i * Yn.n;
          for (let j = 0; j < Yn.n; j++) {
            let v = xi + ynorm[j] - 2 * xy[baseRow + j];
            if (v < 0) v = 0;
            out[baseRow + j] = Math.sqrt(v);
          }
        }
      }
      return out;
    });
  } catch (e) {
    return null;
  }
}

function cdist(X, Y, opts = {}) {
  const metric = opts.metric || 'euclidean';
  const { fn, kind } = _resolveMetric_distance(metric);
  const Xn = _normalize_distance(X, opts);
  const Yn = _normalize_distance(Y, opts);
  if (Xn.d !== Yn.d) {
    throw new RangeError(`dim mismatch: X.d=${Xn.d}, Y.d=${Yn.d}`);
  }
  // Try gemm acceleration on the cheap-to-decompose metrics. Skip if the
  // user explicitly forced inline, or if weights are present (gemm trick
  // doesn't compose cleanly with per-axis weights — would need a scaled
  // inner product instead).
  const canGemm = (metric === 'euclidean' || metric === 'sqeuclidean')
    && !opts.w
    && opts.backend !== 'inline'
    && Xn.n * Yn.n >= GEMM_NM_THRESHOLD;
  if (canGemm) {
    const natra = getNatra();
    if (natra) {
      const result = _cdistEuclideanGemm_distance(Xn, Yn, natra, metric === 'sqeuclidean');
      if (result) return result;
    }
  }
  const d = Xn.d;
  const out = new Float64Array(Xn.n * Yn.n);
  const w = opts.w ? Float64Array.from(opts.w) : null;
  const p = opts.p ?? 2;
  const VI = opts.VI ? (opts.VI instanceof Float64Array ? opts.VI : Float64Array.from(opts.VI)) : null;
  const ai = new Float64Array(d);
  const bi = new Float64Array(d);

  for (let i = 0; i < Xn.n; i++) {
    for (let k = 0; k < d; k++) ai[k] = Xn.data[i * d + k];
    for (let j = 0; j < Yn.n; j++) {
      for (let k = 0; k < d; k++) bi[k] = Yn.data[j * d + k];
      let v;
      if (kind === 'simple') v = fn(ai, bi, d, w);
      else if (kind === 'noweight') v = fn(ai, bi, d);
      else if (kind === 'minkowski') v = fn(ai, bi, d, w, p);
      else if (kind === 'mahalanobis') {
        if (!VI) throw new Error('mahalanobis requires opts.VI');
        v = fn(ai, bi, d, VI);
      } else {
        // custom metric — pass slices as plain arrays (scipy parity)
        v = fn(ai, bi);
      }
      out[i * Yn.n + j] = v;
    }
  }
  return out;
}

function pdist(X, opts = {}) {
  const metric = opts.metric || 'euclidean';
  const { fn, kind } = _resolveMetric_distance(metric);
  const Xn = _normalize_distance(X, opts);
  const d = Xn.d;
  const n = Xn.n;
  const w = opts.w ? Float64Array.from(opts.w) : null;
  const p = opts.p ?? 2;
  const VI = opts.VI ? (opts.VI instanceof Float64Array ? opts.VI : Float64Array.from(opts.VI)) : null;
  const out = new Float64Array((n * (n - 1)) / 2);
  const ai = new Float64Array(d);
  const bi = new Float64Array(d);

  let idx = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < d; k++) ai[k] = Xn.data[i * d + k];
    for (let j = i + 1; j < n; j++) {
      for (let k = 0; k < d; k++) bi[k] = Xn.data[j * d + k];
      let v;
      if (kind === 'simple') v = fn(ai, bi, d, w);
      else if (kind === 'noweight') v = fn(ai, bi, d);
      else if (kind === 'minkowski') v = fn(ai, bi, d, w, p);
      else if (kind === 'mahalanobis') {
        if (!VI) throw new Error('mahalanobis requires opts.VI');
        v = fn(ai, bi, d, VI);
      } else {
        v = fn(ai, bi);
      }
      out[idx++] = v;
    }
  }
  return out;
}

// Convert between condensed (pdist) and square forms.
//   squareform(packed) → full n×n Float64Array (n*n length, row-major)
//   squareform(square) → packed n*(n-1)/2 vector
//
// Shape inference: prefer packed→square (the common usage from pdist).
// Pass opts.checks = false to skip integrity checks. Pass opts.force =
// 'tovector' to force square→packed when input could be either.
function squareform(arr, opts = {}) {
  if (!(arr instanceof Float64Array || ArrayBuffer.isView(arr) || Array.isArray(arr))) {
    throw new TypeError('squareform expects Float64Array or Array');
  }
  const len = arr.length;
  // Could it be a packed form k*(k-1)/2 for some k ≥ 2?
  const kFloat = (1 + Math.sqrt(1 + 8 * len)) / 2;
  const kRound = Math.round(kFloat);
  const looksPacked = len > 0
    && Math.abs(kFloat - kRound) < 1e-9
    && kRound * (kRound - 1) / 2 === len
    && kRound >= 2;
  // Could it be a square n*n?
  const sqRoot = Math.round(Math.sqrt(len));
  const looksSquare = sqRoot * sqRoot === len;

  if (opts.force === 'tovector' || (!looksPacked && looksSquare)) {
    // Square → packed (upper triangle).
    const n = sqRoot;
    const out = new Float64Array((n * (n - 1)) / 2);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) out[idx++] = arr[i * n + j];
    }
    return out;
  }
  if (looksPacked) {
    const n = kRound;
    const out = new Float64Array(n * n);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        out[i * n + j] = arr[idx];
        out[j * n + i] = arr[idx];
        idx++;
      }
    }
    return out;
  }
  throw new RangeError(`length ${len} is not a valid square or pdist size`);
}

// ── spatial/kdtree.js ──

// KDTree — k-dimensional binary tree for fast nearest-neighbor and
// radius queries. Mirrors scipy.spatial.KDTree's API for the methods that
// matter (query, query_ball_point, query_pairs).
//
// Build: O(n log n) via median-of-axis splits, axis cycles by depth.
// Query: O(log n) average for low d; degrades for d > ~10. For our typical
// use cases (geological 2D/3D coordinates), this is exactly the right tool.
//
// Storage layout:
//   nodes are flat arrays for cache-friendliness:
//     splitDim[i]   — int8 axis of the split, or -1 for leaf
//     splitVal[i]   — float median value on that axis
//     leftIdx[i]    — index of left child node, or -1
//     rightIdx[i]   — index of right child node, or -1
//     leafStart[i]  — for leaves, index into perm of the first point
//     leafEnd[i]    —                                 (exclusive)
//   perm — Int32Array of length n giving the permutation of point indices
//          assigned to each leaf (contiguous run [leafStart, leafEnd))

function _normalize_kdtree(X) {
  if (X instanceof Float64Array) {
    throw new TypeError('flat Float64Array requires opts.n + opts.d (use the constructor opts)');
  }
  if (X && X.data instanceof Float64Array && Array.isArray(X.shape) && X.shape.length === 2) {
    return { data: X.data, n: X.shape[0], d: X.shape[1] };
  }
  if (Array.isArray(X)) {
    if (X.length === 0) return { data: new Float64Array(0), n: 0, d: 0 };
    const d = X[0].length;
    const n = X.length;
    const out = new Float64Array(n * d);
    for (let i = 0; i < n; i++) {
      const row = X[i];
      for (let j = 0; j < d; j++) out[i * d + j] = row[j];
    }
    return { data: out, n, d };
  }
  throw new TypeError('expected ndarray or array of arrays');
}

// Quickselect: partition arr[lo..hi) so that the element at position k
// is the k-th smallest, with all smaller to its left and larger to right.
// arr is a permutation of point indices; we compare on data[idx*d + axis].
function _quickselect_kdtree(perm, lo, hi, k, data, d, axis) {
  while (lo < hi - 1) {
    // Pivot via median-of-three to avoid worst case on sorted input.
    // Note: `>>` has LOWER precedence than `+` in JS — the parens around
    // the shift operand are REQUIRED. Without them this becomes
    // `(lo + (hi - lo - 1)) >> 1`, which can land OUTSIDE [lo, hi) and
    // corrupts perm at positions outside the active range when the
    // pivot-swap happens. Caused a subtle but serious kNN bug where
    // points ended up in the wrong subtree.
    const mid = lo + ((hi - lo - 1) >>> 1);
    const a = data[perm[lo] * d + axis];
    const b = data[perm[mid] * d + axis];
    const c = data[perm[hi - 1] * d + axis];
    let pivotIdx;
    if (a < b) {
      if (b < c) pivotIdx = mid;
      else if (a < c) pivotIdx = hi - 1;
      else pivotIdx = lo;
    } else {
      if (a < c) pivotIdx = lo;
      else if (b < c) pivotIdx = hi - 1;
      else pivotIdx = mid;
    }
    const pivotVal = data[perm[pivotIdx] * d + axis];
    // Move pivot to end
    let tmp = perm[pivotIdx]; perm[pivotIdx] = perm[hi - 1]; perm[hi - 1] = tmp;
    let store = lo;
    for (let i = lo; i < hi - 1; i++) {
      if (data[perm[i] * d + axis] < pivotVal) {
        tmp = perm[i]; perm[i] = perm[store]; perm[store] = tmp;
        store++;
      }
    }
    tmp = perm[store]; perm[store] = perm[hi - 1]; perm[hi - 1] = tmp;
    if (store === k) return;
    if (store < k) lo = store + 1;
    else hi = store;
  }
}

// Min-heap by distance (for query results — keeps the k smallest).
// Used as max-heap by inverting comparisons (so the root is the farthest
// of the current top-k, easily ejectable).
class _MaxHeap_kdtree {
  constructor(k) {
    this.k = k;
    this.dist = new Float64Array(k);
    this.idx = new Int32Array(k);
    this.size = 0;
  }
  top() { return this.dist[0]; }
  topIdx() { return this.idx[0]; }
  push(d, i) {
    if (this.size < this.k) {
      this.dist[this.size] = d;
      this.idx[this.size] = i;
      this.size++;
      this._up(this.size - 1);
      return;
    }
    if (d < this.dist[0]) {
      this.dist[0] = d;
      this.idx[0] = i;
      this._down(0);
    }
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.dist[i] > this.dist[p]) {
        this._swap(i, p); i = p;
      } else break;
    }
  }
  _down(i) {
    const n = this.size;
    while (true) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < n && this.dist[l] > this.dist[m]) m = l;
      if (r < n && this.dist[r] > this.dist[m]) m = r;
      if (m === i) break;
      this._swap(i, m); i = m;
    }
  }
  _swap(a, b) {
    let t = this.dist[a]; this.dist[a] = this.dist[b]; this.dist[b] = t;
    let ti = this.idx[a]; this.idx[a] = this.idx[b]; this.idx[b] = ti;
  }
  // Drain into sorted ascending arrays
  drain() {
    const n = this.size;
    const ds = new Float64Array(n);
    const is = new Int32Array(n);
    // Repeatedly extract max into the back of the result
    for (let k = n - 1; k >= 0; k--) {
      ds[k] = this.dist[0];
      is[k] = this.idx[0];
      this.size--;
      if (this.size > 0) {
        this.dist[0] = this.dist[this.size];
        this.idx[0] = this.idx[this.size];
        this._down(0);
      }
    }
    return { dist: ds, idx: is };
  }
}

class KDTree {
  constructor(data, opts = {}) {
    const { data: pts, n, d } = _normalize_kdtree(data);
    this._data = pts;
    this._n = n;
    this._d = d;
    this._leafsize = opts.leafsize ?? 16;

    // Initial permutation [0, 1, ..., n-1].
    this._perm = new Int32Array(n);
    for (let i = 0; i < n; i++) this._perm[i] = i;

    // Pre-allocate node arrays. A balanced k-d tree on n points with
    // leafsize L has at most ~2*ceil(n/L) - 1 nodes; round up generously.
    const cap = Math.max(1, 4 * Math.ceil(n / Math.max(1, this._leafsize)));
    this._splitDim = new Int8Array(cap);
    this._splitVal = new Float64Array(cap);
    this._leftIdx = new Int32Array(cap);
    this._rightIdx = new Int32Array(cap);
    this._leafStart = new Int32Array(cap);
    this._leafEnd = new Int32Array(cap);
    this._nodeCount = 0;
    this._cap = cap;

    if (n > 0) {
      this._root = this._build(0, n, 0);
    } else {
      this._root = -1;
    }
  }

  get n() { return this._n; }
  get d() { return this._d; }
  get data() { return this._data; }

  _ensureCap() {
    if (this._nodeCount < this._cap) return;
    const newCap = this._cap * 2;
    const grow = (arr, ctor) => {
      const out = new ctor(newCap);
      out.set(arr);
      return out;
    };
    this._splitDim = grow(this._splitDim, Int8Array);
    this._splitVal = grow(this._splitVal, Float64Array);
    this._leftIdx = grow(this._leftIdx, Int32Array);
    this._rightIdx = grow(this._rightIdx, Int32Array);
    this._leafStart = grow(this._leafStart, Int32Array);
    this._leafEnd = grow(this._leafEnd, Int32Array);
    this._cap = newCap;
  }

  _build(lo, hi, depth) {
    this._ensureCap();
    const nodeId = this._nodeCount++;
    const len = hi - lo;
    if (len <= this._leafsize) {
      this._splitDim[nodeId] = -1;
      this._leafStart[nodeId] = lo;
      this._leafEnd[nodeId] = hi;
      this._leftIdx[nodeId] = -1;
      this._rightIdx[nodeId] = -1;
      return nodeId;
    }
    // Choose axis with largest spread (more robust than cycling).
    const data = this._data, d = this._d, perm = this._perm;
    let bestAxis = 0, bestSpread = -1;
    for (let a = 0; a < d; a++) {
      let lo2 = Infinity, hi2 = -Infinity;
      for (let i = lo; i < hi; i++) {
        const v = data[perm[i] * d + a];
        if (v < lo2) lo2 = v;
        if (v > hi2) hi2 = v;
      }
      const spread = hi2 - lo2;
      if (spread > bestSpread) { bestSpread = spread; bestAxis = a; }
    }
    if (bestSpread === 0) {
      // All points coincide on every axis — make a leaf.
      this._splitDim[nodeId] = -1;
      this._leafStart[nodeId] = lo;
      this._leafEnd[nodeId] = hi;
      this._leftIdx[nodeId] = -1;
      this._rightIdx[nodeId] = -1;
      return nodeId;
    }
    const axis = bestAxis;
    const mid = (lo + hi) >> 1;
    _quickselect_kdtree(perm, lo, hi, mid, data, d, axis);
    const splitVal = data[perm[mid] * d + axis];
    this._splitDim[nodeId] = axis;
    this._splitVal[nodeId] = splitVal;
    // Build children — depth+1 cycles axis if you want to use it instead of spread.
    this._leftIdx[nodeId] = this._build(lo, mid, depth + 1);
    this._rightIdx[nodeId] = this._build(mid, hi, depth + 1);
    return nodeId;
  }

  // Squared euclidean dist from point at perm[i] to query point q.
  _sqDist(i, q) {
    const data = this._data, d = this._d;
    const base = i * d;
    let s = 0;
    for (let k = 0; k < d; k++) {
      const t = data[base + k] - q[k];
      s += t * t;
    }
    return s;
  }

  // Find k nearest neighbors. Returns { dist, idx } both length k (or
  // shorter if n < k).
  query(point, kArg = 1, opts = {}) {
    const k = Math.min(kArg, this._n);
    const q = point instanceof Float64Array ? point : Float64Array.from(point);
    if (q.length !== this._d) {
      throw new RangeError(`query dim ${q.length} != tree dim ${this._d}`);
    }
    if (k === 0) {
      return { dist: new Float64Array(0), idx: new Int32Array(0) };
    }
    const heap = new _MaxHeap_kdtree(k);
    this._knn(this._root, q, heap, opts.distance_upper_bound);
    const drained = heap.drain();
    if (opts.p === 2 || opts.p === undefined) {
      // Convert squared-dist to euclidean.
      for (let i = 0; i < drained.dist.length; i++) drained.dist[i] = Math.sqrt(drained.dist[i]);
    }
    return drained;
  }

  // Batch kNN — run a query for each of m points, return flat result arrays.
  // points: m×d, accepted as Array<Array<number>>, ndarray { data, shape },
  // or flat Float64Array + opts.m + opts.d.
  // Returns { dist, idx } where each is m*k flat (row-major, m rows of k each).
  queryBatch(points, kArg = 1, opts = {}) {
    let pts, m, d;
    if (points instanceof Float64Array) {
      if (opts.m === undefined || opts.d === undefined) {
        throw new TypeError('queryBatch: flat Float64Array requires opts.m and opts.d');
      }
      pts = points; m = opts.m; d = opts.d;
    } else if (points && points.data instanceof Float64Array && Array.isArray(points.shape)) {
      if (points.shape.length !== 2) {
        throw new RangeError('queryBatch: expected 2D ndarray');
      }
      pts = points.data; m = points.shape[0]; d = points.shape[1];
    } else if (Array.isArray(points)) {
      m = points.length;
      d = m > 0 ? points[0].length : this._d;
      pts = new Float64Array(m * d);
      for (let i = 0; i < m; i++) {
        const row = points[i];
        for (let j = 0; j < d; j++) pts[i * d + j] = row[j];
      }
    } else {
      throw new TypeError('queryBatch: expected ndarray, flat Float64Array, or array of arrays');
    }
    if (d !== this._d) {
      throw new RangeError(`queryBatch: dim ${d} != tree dim ${this._d}`);
    }
    const k = Math.min(kArg, this._n);
    const outDist = new Float64Array(m * k);
    const outIdx = new Int32Array(m * k);
    if (k === 0) return { dist: outDist, idx: outIdx };
    // Reusable buffers — one query at a time so we don't blow scratch
    const q = new Float64Array(d);
    const heap = new _MaxHeap_kdtree(k);
    const p = opts.p ?? 2;
    for (let i = 0; i < m; i++) {
      // Copy row i into q
      const base = i * d;
      for (let j = 0; j < d; j++) q[j] = pts[base + j];
      // Reset heap state — reuse arrays in place
      heap.size = 0;
      this._knn(this._root, q, heap, opts.distance_upper_bound);
      const drained = heap.drain();
      const outBase = i * k;
      if (p === 2) {
        for (let j = 0; j < drained.dist.length; j++) {
          outDist[outBase + j] = Math.sqrt(drained.dist[j]);
          outIdx[outBase + j] = drained.idx[j];
        }
      } else {
        for (let j = 0; j < drained.dist.length; j++) {
          outDist[outBase + j] = drained.dist[j];
          outIdx[outBase + j] = drained.idx[j];
        }
      }
    }
    return { dist: outDist, idx: outIdx };
  }

  _knn(nodeId, q, heap, distUpper) {
    if (nodeId < 0) return;
    if (this._splitDim[nodeId] === -1) {
      // Leaf — scan all
      const lo = this._leafStart[nodeId];
      const hi = this._leafEnd[nodeId];
      for (let i = lo; i < hi; i++) {
        const sq = this._sqDist(this._perm[i], q);
        if (distUpper !== undefined && sq > distUpper * distUpper) continue;
        heap.push(sq, this._perm[i]);
      }
      return;
    }
    const axis = this._splitDim[nodeId];
    const splitVal = this._splitVal[nodeId];
    const diff = q[axis] - splitVal;
    const near = diff < 0 ? this._leftIdx[nodeId] : this._rightIdx[nodeId];
    const far = diff < 0 ? this._rightIdx[nodeId] : this._leftIdx[nodeId];
    this._knn(near, q, heap, distUpper);
    // Visit far subtree only if its bounding plane is closer than current worst.
    const bound = diff * diff;
    if (heap.size < heap.k || bound < heap.top()) {
      if (distUpper !== undefined && bound > distUpper * distUpper) return;
      this._knn(far, q, heap, distUpper);
    }
  }

  // All points within radius r of the query point. Returns Int32Array of indices.
  query_ball_point(point, r) {
    const q = point instanceof Float64Array ? point : Float64Array.from(point);
    if (q.length !== this._d) {
      throw new RangeError(`query dim ${q.length} != tree dim ${this._d}`);
    }
    const r2 = r * r;
    const out = [];
    this._ball(this._root, q, r2, out);
    return Int32Array.from(out);
  }

  _ball(nodeId, q, r2, out) {
    if (nodeId < 0) return;
    if (this._splitDim[nodeId] === -1) {
      const lo = this._leafStart[nodeId];
      const hi = this._leafEnd[nodeId];
      for (let i = lo; i < hi; i++) {
        if (this._sqDist(this._perm[i], q) <= r2) out.push(this._perm[i]);
      }
      return;
    }
    const axis = this._splitDim[nodeId];
    const splitVal = this._splitVal[nodeId];
    const diff = q[axis] - splitVal;
    if (diff < 0) {
      this._ball(this._leftIdx[nodeId], q, r2, out);
      if (diff * diff <= r2) this._ball(this._rightIdx[nodeId], q, r2, out);
    } else {
      this._ball(this._rightIdx[nodeId], q, r2, out);
      if (diff * diff <= r2) this._ball(this._leftIdx[nodeId], q, r2, out);
    }
  }

  // All pairs of points within distance r. Returns array of [i, j] pairs (i < j).
  query_pairs(r) {
    const out = [];
    const r2 = r * r;
    for (let i = 0; i < this._n; i++) {
      const q = new Float64Array(this._d);
      for (let k = 0; k < this._d; k++) q[k] = this._data[i * this._d + k];
      const ball = [];
      this._ball(this._root, q, r2, ball);
      for (const j of ball) {
        if (j > i) out.push([i, j]);
      }
    }
    return out;
  }
}

// ── optimize/lstsq.js ──

// Nonlinear least squares — Levenberg-Marquardt + curve_fit wrapper.
//
// Mirrors scipy.optimize.least_squares (LM-only for v0.1) and
// scipy.optimize.curve_fit. v0.1 ships:
//   • Unbounded LM (no box constraints)
//   • Numerical Jacobian via forward differences (analytic Jacobian
//     accepted via opts.jac)
//   • Exit codes mirror scipy's status field: 0 max iter, 1 gradient
//     tol, 2 parameter tol, 3 residual tol, -1 fatal error
//
// Algorithm (Marquardt 1963):
//   r = f(x)
//   J = ∂r/∂x
//   solve (JᵀJ + λ diag(JᵀJ)) δ = -Jᵀr     ← scipy's "scaled-LM" form
//   if rho > 0: accept, λ = max(λ/ν, λmin)
//   else: reject, λ = min(λ*ν, λmax)
// We use the more standard λI form below since it converges fine for
// well-conditioned problems and is simpler to reason about.

// Solve (A + λI) δ = b in-place via Cholesky. A is m×m (flat row-major).
// Returns δ as Float64Array, or null if not positive-definite (caller
// should bump λ and retry).
function _cholSolve_lstsq(A, b, m, lambda) {
  const L = new Float64Array(m * m);
  // Compute A_aug = A + λI in L (Cholesky destination).
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * m + j];
      if (i === j) s += lambda;
      for (let k = 0; k < j; k++) s -= L[i * m + k] * L[j * m + k];
      if (i === j) {
        if (s <= 0) return null;  // not PD
        L[i * m + j] = Math.sqrt(s);
      } else {
        L[i * m + j] = s / L[j * m + j];
      }
    }
  }
  // Forward substitute: L y = b
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * m + k] * y[k];
    y[i] = s / L[i * m + i];
  }
  // Back substitute: Lᵀ x = y
  const x = new Float64Array(m);
  for (let i = m - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < m; k++) s -= L[k * m + i] * x[k];
    x[i] = s / L[i * m + i];
  }
  return x;
}

// Numerical Jacobian via forward differences.
// J[i,j] = (f(x + h e_j)[i] - f(x)[i]) / h
function _numJac_lstsq(fun, x, fx, opts) {
  const n = x.length;
  const m = fx.length;
  const J = new Float64Array(m * n);
  const eps = opts && opts.diff_step !== undefined ? opts.diff_step : Math.sqrt(Number.EPSILON);
  const xp = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < n; k++) xp[k] = x[k];
    const h = Math.max(Math.abs(x[j]), 1) * eps;
    xp[j] = x[j] + h;
    const fxp = fun(xp);
    for (let i = 0; i < m; i++) J[i * n + j] = (fxp[i] - fx[i]) / h;
  }
  return J;
}

// JᵀJ — n×n result, J is m×n
function _jtj_lstsq(J, m, n) {
  const out = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < m; k++) s += J[k * n + i] * J[k * n + j];
      out[i * n + j] = s;
      out[j * n + i] = s;
    }
  }
  return out;
}

// Jᵀr — n result, J is m×n, r is m
function _jtr_lstsq(J, r, m, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < m; k++) s += J[k * n + i] * r[k];
    out[i] = s;
  }
  return out;
}

function _norm2sq_lstsq(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return s;
}

function _toF64_lstsq(x) {
  if (x instanceof Float64Array) return x;
  if (x && x.data instanceof Float64Array) return x.data;
  return Float64Array.from(x);
}

function least_squares(fun, x0, opts = {}) {
  const x = Float64Array.from(_toF64_lstsq(x0));
  const n = x.length;

  const jacFn = typeof opts.jac === 'function' ? opts.jac : null;
  const ftol = opts.ftol ?? 1e-8;
  const xtol = opts.xtol ?? 1e-8;
  const gtol = opts.gtol ?? 1e-8;
  const maxNfev = opts.max_nfev ?? 100 * n;
  const verbose = opts.verbose ?? 0;

  // Apply args trick: many problems pass extra arguments via closures, but
  // mirror scipy's `args` shorthand.
  const args = opts.args || [];
  const evaluate = args.length > 0
    ? (xx) => _toF64_lstsq(fun(xx, ...args))
    : (xx) => _toF64_lstsq(fun(xx));
  const evalJac = args.length > 0
    ? (jacFn ? (xx) => _toF64_lstsq(jacFn(xx, ...args)) : null)
    : (jacFn ? (xx) => _toF64_lstsq(jacFn(xx)) : null);

  let nfev = 0, njev = 0;
  let r = evaluate(x); nfev++;
  const m = r.length;
  if (m < n) {
    throw new Error(`least_squares requires m ≥ n (got m=${m}, n=${n})`);
  }
  let cost = 0.5 * _norm2sq_lstsq(r);

  // Initial Jacobian
  let J;
  if (evalJac) {
    J = evalJac(x);
    if (J.length !== m * n) throw new Error(`jac shape mismatch: ${J.length} vs ${m * n}`);
    njev++;
  } else {
    J = _numJac_lstsq(evaluate, x, r, opts);
    nfev += n;
  }

  let lambda = opts.lambda0 ?? 1e-3;
  const lambdaInc = 10;
  const lambdaDec = 10;
  const lambdaMin = 1e-12;
  const lambdaMax = 1e12;

  let status = 0;       // 0 = max iter (default)
  let iter = 0;

  while (true) {
    if (nfev >= maxNfev) { status = 0; break; }

    const A = _jtj_lstsq(J, m, n);
    const g = _jtr_lstsq(J, r, m, n);

    // Gradient norm convergence: ‖Jᵀr‖_∞ < gtol
    let gMax = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(g[i]);
      if (a > gMax) gMax = a;
    }
    if (gMax < gtol) { status = 1; break; }

    // Solve (A + λI) δ = -g
    let deltaTried = false;
    let xNew, rNew, costNew, accepted = false;
    while (!accepted) {
      const negG = new Float64Array(n);
      for (let i = 0; i < n; i++) negG[i] = -g[i];
      const delta = _cholSolve_lstsq(A, negG, n, lambda);
      if (!delta) {
        lambda = Math.min(lambda * lambdaInc, lambdaMax);
        if (lambda >= lambdaMax) { status = -1; break; }
        continue;
      }
      deltaTried = true;
      // Check parameter step convergence
      let stepNorm = 0, xNorm = 0;
      for (let i = 0; i < n; i++) { stepNorm += delta[i] * delta[i]; xNorm += x[i] * x[i]; }
      stepNorm = Math.sqrt(stepNorm);
      xNorm = Math.sqrt(xNorm);
      if (stepNorm < xtol * (xNorm + xtol)) { status = 2; break; }

      xNew = new Float64Array(n);
      for (let i = 0; i < n; i++) xNew[i] = x[i] + delta[i];
      rNew = evaluate(xNew); nfev++;
      costNew = 0.5 * _norm2sq_lstsq(rNew);

      if (costNew < cost) {
        // Accept; reduce λ for next iteration
        accepted = true;
        lambda = Math.max(lambda / lambdaDec, lambdaMin);
        // Residual-tol convergence
        if (Math.abs(cost - costNew) < ftol * cost) { status = 3; }
      } else {
        // Reject; increase λ and retry
        lambda = Math.min(lambda * lambdaInc, lambdaMax);
        if (lambda >= lambdaMax) { status = -1; break; }
      }
    }

    if (status !== 0 && status !== -1) {
      // Apply the step and exit
      if (accepted) {
        for (let i = 0; i < n; i++) x[i] = xNew[i];
        r = rNew;
        cost = costNew;
      }
      break;
    }
    if (status === -1) break;

    // Apply step
    for (let i = 0; i < n; i++) x[i] = xNew[i];
    r = rNew;
    cost = costNew;

    // Recompute Jacobian
    if (evalJac) { J = evalJac(x); njev++; }
    else { J = _numJac_lstsq(evaluate, x, r, opts); nfev += n; }

    iter++;
    if (verbose >= 2) {
      const gNorm = Math.sqrt(_norm2sq_lstsq(g));
      console.log(`iter=${iter} cost=${cost.toExponential(4)} |g|=${gNorm.toExponential(2)} λ=${lambda.toExponential(2)}`);
    }
  }

  return {
    x,
    fun: r,
    cost,
    jac: J,
    nfev,
    njev,
    status,
    success: status > 0,
    message: _statusMessage_lstsq(status),
    optimality: _gradMaxAbs_lstsq(_jtr_lstsq(J, r, m, n)),
  };
}

function _gradMaxAbs_lstsq(g) {
  let m = 0;
  for (let i = 0; i < g.length; i++) {
    const a = Math.abs(g[i]); if (a > m) m = a;
  }
  return m;
}

function _statusMessage_lstsq(s) {
  switch (s) {
    case 0: return 'maximum number of function evaluations reached';
    case 1: return '`gtol` termination condition is satisfied';
    case 2: return '`xtol` termination condition is satisfied';
    case 3: return '`ftol` termination condition is satisfied';
    case -1: return 'numerical breakdown (lambda saturated)';
    default: return 'unknown';
  }
}

// curve_fit — high-level wrapper over least_squares.
// Mirrors scipy.optimize.curve_fit:
//   model: (xdata, ...params) → ydata
//   xdata: independent variable, shape (m,) or (m, k)
//   ydata: observed dependent variable, shape (m,)
//   p0:    initial parameter guess, shape (n,)
// Returns { popt, pcov, ... }
function curve_fit(model, xdata, ydata, p0, opts = {}) {
  const ya = _toF64_lstsq(ydata);
  const m = ya.length;
  const sigma = opts.sigma ? _toF64_lstsq(opts.sigma) : null;

  // Residual function for least_squares.
  // r_i = (model(x_i, *p) - y_i) / sigma_i
  let xa;
  if (Array.isArray(xdata) && Array.isArray(xdata[0])) {
    // 2D: pass per-row to model
    xa = xdata;
  } else {
    xa = _toF64_lstsq(xdata);
  }

  const residual = (params) => {
    const r = new Float64Array(m);
    if (Array.isArray(xa)) {
      // Multi-input; call model row-by-row
      for (let i = 0; i < m; i++) {
        const yi = model(xa[i], ...params);
        r[i] = sigma ? (yi - ya[i]) / sigma[i] : yi - ya[i];
      }
    } else {
      // Single-input; vectorize via per-element call (model can also accept arrays)
      const ymodel = model(xa, ...params);
      const ymf = _toF64_lstsq(ymodel);
      for (let i = 0; i < m; i++) {
        r[i] = sigma ? (ymf[i] - ya[i]) / sigma[i] : ymf[i] - ya[i];
      }
    }
    return r;
  };

  const result = least_squares(residual, p0, opts);

  // Covariance estimate: pcov ≈ s² (JᵀJ)⁻¹  where s² = 2*cost / (m - n)
  const n = result.x.length;
  let pcov = null;
  if (m > n) {
    const A = _jtj_lstsq(result.jac, m, n);
    const I = new Float64Array(n);
    pcov = new Float64Array(n * n);
    // Invert A column-by-column via Cholesky solve
    for (let j = 0; j < n; j++) {
      const e = new Float64Array(n);
      e[j] = 1;
      const col = _cholSolve_lstsq(A, e, n, 0);
      if (!col) { pcov = null; break; }
      for (let i = 0; i < n; i++) pcov[i * n + j] = col[i];
    }
    if (pcov) {
      const s2 = sigma ? 1 : (2 * result.cost) / (m - n);
      for (let i = 0; i < pcov.length; i++) pcov[i] *= s2;
    }
  }

  return {
    popt: result.x,
    pcov,
    nfev: result.nfev,
    njev: result.njev,
    status: result.status,
    success: result.success,
    message: result.message,
    cost: result.cost,
  };
}

export {
  // util/special
  erf, erfc, erfinv, ndtri, lgamma, gamma, lbeta,
  // util/random
  mulberry32, makeRng, makeNormalSampler,
  // util/backend
  setBackend, clearBackend, getNatra, GEMM_NM_THRESHOLD,
  // stats/distributions
  norm, lognorm, t,
  // stats/descriptives
  weighted_mean, weighted_var, weighted_std,
  weighted_percentile, weighted_median,
  ecdf, histogram, moments,
  gmean, hmean, ttest_ind,
  // stats/transform
  normal_score_transform,
  // stats/kde
  gaussian_kde,
  // spatial/distance
  cdist, pdist, squareform,
  // spatial/kdtree
  KDTree,
  // optimize/lstsq
  least_squares, curve_fit,
};

// Namespaced barrel for scipy-style imports.
export const stats = {
  norm, lognorm, t,
  weighted_mean, weighted_var, weighted_std,
  weighted_percentile, weighted_median,
  ecdf, histogram, moments,
  gmean, hmean, ttest_ind,
  normal_score_transform,
  gaussian_kde,
};
export const spatial = {
  cdist, pdist, squareform,
  distance: { cdist, pdist, squareform },
  KDTree,
  kdtree: { KDTree },
};
export const optimize = { least_squares, curve_fit };
export const special = { erf, erfc, erfinv, ndtri, lgamma, gamma, lbeta };
export const random = { mulberry32, makeRng, makeNormalSampler };

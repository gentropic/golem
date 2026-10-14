// ⚠ VENDORED — DO NOT EDIT. @gcu/sluice src/accumulator.js, copied from ../auditable/ext/sluice/src/accumulator.js at auditable 3a7b253c.
// golem vendors sluice's accumulator modules only (src/engine/stream.js): its runner builds expressions with new Function,
// which golem does not ship outside the Python worker.

// @gcu/sluice — the Accumulator protocol + simple value-accumulators.
//
// Accumulator<State, Out> = {
//   create()                      -> State          // fresh, allocation-light
//   push(state, value, weight=1)  -> void           // hot path: mutate in place
//   merge(a, b)                   -> State           // combine partial states (parallel/chunked)
//   result(state)                 -> Out             // finalize
// }
// State is plain, structuredClone-transferable data — that is the whole
// serialization story (worker transfer + cache write are free).
//
// Value-accumulators take *values* and are row-agnostic. The row-level fan-out
// (collect/groupBy/binned, see combinators.js) carries row->value extractors.

// Validate/normalize a custom accumulator so it's first-class.
export function accumulator(spec) {
  for (const k of ['create', 'push', 'merge', 'result']) {
    if (typeof spec[k] !== 'function') {
      throw new Error(`sluice: accumulator needs a ${k}() function`);
    }
  }
  return { create: spec.create, push: spec.push, merge: spec.merge, result: spec.result };
}

// count() — number of items (weighted: sum of weights).
export function count() {
  return {
    create: () => ({ n: 0 }),
    push: (s, _v, w = 1) => { s.n += w; },
    merge: (a, b) => ({ n: a.n + b.n }),
    result: (s) => s.n,
  };
}

// sum() — weighted sum of finite values, plus a plain count of contributing values.
export function sum() {
  return {
    create: () => ({ n: 0, sum: 0 }),
    push: (s, v, w = 1) => { if (Number.isFinite(v)) { s.n += 1; s.sum += v * w; } },
    merge: (a, b) => ({ n: a.n + b.n, sum: a.sum + b.sum }),
    result: (s) => ({ count: s.n, sum: s.sum }),
  };
}

// extent() — min/max only (cheap, no moments).
export function extent() {
  return {
    create: () => ({ n: 0, min: Infinity, max: -Infinity }),
    push: (s, v) => { if (Number.isFinite(v)) { s.n++; if (v < s.min) s.min = v; if (v > s.max) s.max = v; } },
    merge: (a, b) => ({ n: a.n + b.n, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) }),
    result: (s) => ({ count: s.n, min: s.n ? s.min : null, max: s.n ? s.max : null }),
  };
}

// welford() — unweighted single-pass mean/variance/std + bias-corrected
// skewness/kurtosis (count/min/max/m1..m4). push() ignores weight (welford is
// unweighted; for weighted mean/variance use weightedStats()). merge() uses the
// Pébay (2008) parallel moment-combination formulas — NOT term-wise addition.
export function welford() {
  return {
    create: () => ({ n: 0, min: Infinity, max: -Infinity, m1: 0, m2: 0, m3: 0, m4: 0, zeros: 0 }),
    push: (s, v) => {
      if (!Number.isFinite(v)) return;
      if (v === 0) s.zeros++;
      if (v < s.min) s.min = v;
      if (v > s.max) s.max = v;
      const n = ++s.n;
      const delta = v - s.m1;
      const delta_n = delta / n;
      const delta_n2 = delta_n * delta_n;
      const term1 = delta * delta_n * (n - 1);
      s.m4 += term1 * delta_n2 * (n * n - 3 * n + 3) + 6 * delta_n2 * s.m2 - 4 * delta_n * s.m3;
      s.m3 += term1 * delta_n * (n - 2) - 3 * delta_n * s.m2;
      s.m2 += term1;
      s.m1 += delta_n;
    },
    merge: combineMoments,
    result: (s) => {
      const n = s.n;
      const variance = n > 1 ? s.m2 / (n - 1) : null;
      const std = variance !== null ? Math.sqrt(variance) : null;
      let skewness = null;
      if (n > 2 && s.m2 > 0) {
        skewness = (Math.sqrt(n) * s.m3) / Math.pow(s.m2, 1.5);
        skewness *= Math.sqrt(n * (n - 1)) / (n - 2);
      }
      let kurtosis = null;
      if (n > 3 && s.m2 > 0) {
        kurtosis = (n * s.m4) / (s.m2 * s.m2) - 3;
        kurtosis = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * kurtosis + 6);
      }
      return {
        count: n, zeros: s.zeros,
        min: n > 0 ? s.min : null, max: n > 0 ? s.max : null,
        mean: n > 0 ? s.m1 : null, variance, std, skewness, kurtosis,
      };
    },
  };
}

// Pébay parallel combination of two moment partitions (count/mean=m1/M2/M3/M4).
function combineMoments(a, b) {
  if (a.n === 0) return { ...b };
  if (b.n === 0) return { ...a };
  const nA = a.n, nB = b.n, n = nA + nB;
  const d = b.m1 - a.m1;       // mean difference
  const d2 = d * d, d3 = d2 * d, d4 = d2 * d2;
  const m1 = a.m1 + d * nB / n;
  const m2 = a.m2 + b.m2 + d2 * nA * nB / n;
  const m3 = a.m3 + b.m3
    + d3 * nA * nB * (nA - nB) / (n * n)
    + 3 * d * (nA * b.m2 - nB * a.m2) / n;
  const m4 = a.m4 + b.m4
    + d4 * nA * nB * (nA * nA - nA * nB + nB * nB) / (n * n * n)
    + 6 * d2 * (nA * nA * b.m2 + nB * nB * a.m2) / (n * n)
    + 4 * d * (nA * b.m3 - nB * a.m3) / n;
  return {
    n, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max),
    m1, m2, m3, m4, zeros: a.zeros + b.zeros,
  };
}

// weightedStats() — weighted count/mean/variance/std (no higher moments).
// For declustering, volume/density weighting, etc. Variance uses the
// frequency-weight convention (denominator wSum - 1; reduces to welford for w=1).
export function weightedStats() {
  return {
    create: () => ({ n: 0, wSum: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity }),
    push: (s, v, w = 1) => {
      if (!Number.isFinite(v) || !(w > 0)) return;
      if (v < s.min) s.min = v;
      if (v > s.max) s.max = v;
      s.n++;
      const wSumOld = s.wSum;
      s.wSum += w;
      const meanOld = s.mean;
      s.mean = meanOld + (w / s.wSum) * (v - meanOld);
      s.m2 += w * (v - meanOld) * (v - s.mean);
      void wSumOld;
    },
    merge: (a, b) => {
      if (a.wSum === 0) return { ...b };
      if (b.wSum === 0) return { ...a };
      const wSum = a.wSum + b.wSum;
      const d = b.mean - a.mean;
      const mean = a.mean + d * b.wSum / wSum;
      const m2 = a.m2 + b.m2 + d * d * a.wSum * b.wSum / wSum;
      return { n: a.n + b.n, wSum, mean, m2, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
    },
    result: (s) => {
      const variance = s.wSum > 1 ? s.m2 / (s.wSum - 1) : null;
      return {
        count: s.n, weight: s.wSum,
        min: s.n ? s.min : null, max: s.n ? s.max : null,
        mean: s.n ? s.mean : null, variance, std: variance !== null ? Math.sqrt(variance) : null,
      };
    },
  };
}

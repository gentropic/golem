// ⚠ VENDORED — DO NOT EDIT. @gcu/sluice src/histogram.js, copied from ../auditable/ext/sluice/src/histogram.js at auditable 3a7b253c.
// golem vendors sluice's accumulator modules only (src/engine/stream.js): its runner builds expressions with new Function,
// which golem does not ship outside the Python worker.

// @gcu/sluice — fixed-bin weighted histogram (dense Float64Array counts).
// Bounded by construction. Float64Array state is structuredClone-transferable.

export function histogram({ min, max, bins }) {
  if (!(bins > 0) || !(max > min)) {
    throw new Error('sluice: histogram needs bins > 0 and max > min');
  }
  const width = (max - min) / bins;
  return {
    create: () => ({ min, max, bins, width, counts: new Float64Array(bins), under: 0, over: 0, n: 0 }),
    push: (s, v, w = 1) => {
      if (!Number.isFinite(v)) return;
      s.n++;
      let idx = Math.floor((v - s.min) / s.width);
      if (idx < 0) { s.under += w; return; }
      if (idx >= s.bins) { s.over += w; return; }
      s.counts[idx] += w;
    },
    merge: (a, b) => {
      if (a.bins !== b.bins || a.min !== b.min || a.max !== b.max) {
        throw new Error('sluice: histogram merge needs matching {min,max,bins}');
      }
      const counts = new Float64Array(a.bins);
      for (let i = 0; i < a.bins; i++) counts[i] = a.counts[i] + b.counts[i];
      return { min: a.min, max: a.max, bins: a.bins, width: a.width, counts, under: a.under + b.under, over: a.over + b.over, n: a.n + b.n };
    },
    result: (s) => {
      const edges = new Array(s.bins + 1);
      for (let i = 0; i <= s.bins; i++) edges[i] = s.min + i * s.width;
      return { edges, counts: Array.from(s.counts), under: s.under, over: s.over, count: s.n };
    },
  };
}

// Cumulative-from-top: out[i] = sum_{j >= i} counts[j]. The grade-tonnage shape
// (tonnage at-or-above each cutoff). A small util; the GT *node* composes it.
export function cumulativeFromTop(counts) {
  const n = counts.length;
  const out = new Float64Array(n);
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) { acc += counts[i]; out[i] = acc; }
  return out;
}

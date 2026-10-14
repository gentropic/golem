// ⚠ VENDORED — DO NOT EDIT. @gcu/sluice src/tdigest.js, copied from ../auditable/ext/sluice/src/tdigest.js at auditable 3a7b253c.
// golem vendors sluice's accumulator modules only (src/engine/stream.js): its runner builds expressions with new Function,
// which golem does not ship outside the Python worker.

// @gcu/sluice — t-digest streaming approximate quantiles.
//
// Chosen over P² because it MERGES cleanly (the parallel-scan requirement).
// result() ships plain centroids; quantileFromCentroids() answers any p later
// — the "worker accumulates → ships centroids → client queries arbitrary p
// without re-scanning" pattern.

const DEFAULT_COMPRESSION = 100;
const BUFFER_SIZE = 2000;

// tdigest() accumulator. State: { centroids:[{mean,count}], buffer:[v…], totalCount, k }.
// push() ignores weight (weighted quantiles are out of scope for v1).
export function tdigest({ compression = DEFAULT_COMPRESSION } = {}) {
  return {
    create: () => ({ centroids: [], buffer: [], totalCount: 0, k: compression }),
    push: (s, v) => {
      if (!Number.isFinite(v)) return;
      s.buffer.push(v);
      s.totalCount++;
      if (s.buffer.length >= BUFFER_SIZE) flush(s);
    },
    merge: (a, b) => {
      const k = a.k || b.k || DEFAULT_COMPRESSION;
      const entries = [
        ...a.centroids.map((c) => ({ mean: c.mean, count: c.count })),
        ...a.buffer.map((v) => ({ mean: v, count: 1 })),
        ...b.centroids.map((c) => ({ mean: c.mean, count: c.count })),
        ...b.buffer.map((v) => ({ mean: v, count: 1 })),
      ];
      entries.sort((x, y) => x.mean - y.mean);
      const total = a.totalCount + b.totalCount;
      return { centroids: compress(entries, total, k), buffer: [], totalCount: total, k };
    },
    result: (s) => {
      flush(s);
      return { count: s.totalCount, centroids: s.centroids.map((c) => [c.mean, c.count]) };
    },
  };
}

function flush(s) {
  if (s.buffer.length === 0) return;
  s.buffer.sort((a, b) => a - b);
  const merged = [];
  let bi = 0, ci = 0;
  while (bi < s.buffer.length || ci < s.centroids.length) {
    if (bi < s.buffer.length && (ci >= s.centroids.length || s.buffer[bi] <= s.centroids[ci].mean)) {
      merged.push({ mean: s.buffer[bi], count: 1 }); bi++;
    } else {
      merged.push({ mean: s.centroids[ci].mean, count: s.centroids[ci].count }); ci++;
    }
  }
  s.buffer = [];
  s.centroids = compress(merged, s.totalCount, s.k);
}

function compress(centroids, totalCount, k) {
  if (centroids.length <= 1) return centroids;
  const out = [{ mean: centroids[0].mean, count: centroids[0].count }];
  let cum = centroids[0].count;
  for (let i = 1; i < centroids.length; i++) {
    const c = centroids[i];
    const last = out[out.length - 1];
    const q = cum / totalCount;
    const maxSize = Math.max(1, Math.floor(4 * k * q * (1 - q)));
    if (last.count + c.count <= maxSize) {
      const nc = last.count + c.count;
      last.mean += (c.mean - last.mean) * c.count / nc;
      last.count = nc;
    } else {
      out.push({ mean: c.mean, count: c.count });
    }
    cum += c.count;
  }
  return out;
}

// Query a quantile from shipped/cached centroids ([[mean,count]…]) + total count.
export function quantileFromCentroids(centroids, totalCount, q) {
  const n = centroids.length;
  if (n === 0 || totalCount === 0) return null;
  if (n === 1) return centroids[0][0];
  if (q <= 0) return centroids[0][0];
  if (q >= 1) return centroids[n - 1][0];
  const target = q * totalCount;
  let cum = 0;
  for (let i = 0; i < n; i++) {
    const cMean = centroids[i][0], cCount = centroids[i][1];
    const mid = cum + cCount / 2;
    if (target < mid) {
      if (i === 0) return cMean;
      const pMean = centroids[i - 1][0], pCount = centroids[i - 1][1];
      const prevMid = cum - pCount / 2;
      const t = (target - prevMid) / (mid - prevMid);
      return pMean + t * (cMean - pMean);
    }
    cum += cCount;
  }
  return centroids[n - 1][0];
}

// Convenience: quantile of a live tdigest state.
export function quantile(state, q) {
  flush(state);
  return quantileFromCentroids(state.centroids.map((c) => [c.mean, c.count]), state.totalCount, q);
}

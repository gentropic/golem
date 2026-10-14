// ⚠ VENDORED — DO NOT EDIT. @gcu/sluice src/categorical.js, copied from ../auditable/ext/sluice/src/categorical.js at auditable 3a7b253c.
// golem vendors sluice's accumulator modules only (src/engine/stream.js): its runner builds expressions with new Function,
// which golem does not ship outside the Python worker.

// @gcu/sluice — categorical accumulators: exact-with-cap value counts +
// cardinality. Mining domains are small (tens), so exact-with-cap beats
// probabilistic (HLL) here; the `overflow` flag signals when the cap was hit.

const DEFAULT_LIMIT = 500;

// topK() — value -> weighted count, distinct count, overflow flag.
// result().top(k) returns the k most frequent [value, count] pairs.
export function topK({ limit = DEFAULT_LIMIT } = {}) {
  return {
    create: () => ({ counts: {}, distinct: 0, overflow: false, limit }),
    push: (s, v, w = 1) => {
      if (v === null || v === undefined || v === '') return;
      const key = String(v);
      if (Object.prototype.hasOwnProperty.call(s.counts, key)) {
        s.counts[key] += w;
      } else if (s.distinct < s.limit) {
        s.counts[key] = w;
        s.distinct++;
      } else {
        s.overflow = true;
      }
    },
    merge: (a, b) => mergeCounts(a, b),
    result: (s) => ({
      counts: s.counts,
      distinct: s.distinct,
      overflow: s.overflow,
      top: (k) => Object.entries(s.counts).sort((x, y) => y[1] - x[1]).slice(0, k),
    }),
  };
}

// cardinality() — same machinery, result exposes just distinct/overflow.
export function cardinality({ limit = DEFAULT_LIMIT } = {}) {
  const tk = topK({ limit });
  return {
    create: tk.create,
    push: tk.push,
    merge: tk.merge,
    result: (s) => ({ distinct: s.distinct, overflow: s.overflow }),
  };
}

function mergeCounts(a, b) {
  const limit = a.limit || b.limit || DEFAULT_LIMIT;
  const counts = { ...a.counts };
  let distinct = Object.keys(counts).length;
  let overflow = a.overflow || b.overflow;
  for (const key in b.counts) {
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] += b.counts[key];
    } else if (distinct < limit) {
      counts[key] = b.counts[key];
      distinct++;
    } else {
      overflow = true;
    }
  }
  return { counts, distinct, overflow, limit };
}

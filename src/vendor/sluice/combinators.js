// ⚠ VENDORED — DO NOT EDIT. @gcu/sluice src/combinators.js, copied from ../auditable/ext/sluice/src/combinators.js at auditable 3a7b253c.
// golem vendors sluice's accumulator modules only (src/engine/stream.js): its runner builds expressions with new Function,
// which golem does not ship outside the Python worker.

// @gcu/sluice — combinators: the row-level fan-out layer. Each returns an
// Accumulator (same protocol), so they nest freely. They carry row->value
// extractors; the value-accumulators they wrap stay row-agnostic.
//
// weight: a combinator-level { weight: row => w } option, applied to every
// sub-accumulator that uses it.

// collect({ name: [acc, row => value], … }, { weight? }) — analyze many columns
// in one pass. State {name: subState}; result {name: subOut}.
export function collect(spec, { weight } = {}) {
  const names = Object.keys(spec);
  return {
    create: () => {
      const st = {};
      for (const name of names) st[name] = spec[name][0].create();
      return st;
    },
    push: (st, row, w = 1) => {
      const ww = weight ? weight(row) : w;
      for (const name of names) {
        const [acc, extract] = spec[name];
        acc.push(st[name], extract(row), ww);
      }
    },
    merge: (a, b) => {
      const st = {};
      for (const name of names) st[name] = spec[name][0].merge(a[name], b[name]);
      return st;
    },
    result: (st) => {
      const out = {};
      for (const name of names) out[name] = spec[name][0].result(st[name]);
      return out;
    },
  };
}

// groupBy(row => key, () => acc, { maxGroups, weight }) — stratified accumulation.
// State { groups: {key: subState}, overflow }. result { groups: {key: subOut}, overflow }.
export function groupBy(keyOf, accFactory, { maxGroups = 500, weight } = {}) {
  const acc = accFactory();
  return {
    create: () => ({ groups: {}, overflow: false }),
    push: (st, row, w = 1) => {
      const key = String(keyOf(row));
      let sub = st.groups[key];
      if (sub === undefined) {
        if (Object.keys(st.groups).length >= maxGroups) { st.overflow = true; return; }
        sub = acc.create();
        st.groups[key] = sub;
      }
      acc.push(sub, row, weight ? weight(row) : w);
    },
    merge: (a, b) => {
      const groups = {};
      for (const key in a.groups) groups[key] = a.groups[key];
      let overflow = a.overflow || b.overflow;
      for (const key in b.groups) {
        if (key in groups) {
          groups[key] = acc.merge(groups[key], b.groups[key]);
        } else if (Object.keys(groups).length < maxGroups) {
          groups[key] = b.groups[key];
        } else {
          overflow = true;
        }
      }
      return { groups, overflow };
    },
    result: (st) => {
      const out = {};
      for (const key in st.groups) out[key] = acc.result(st.groups[key]);
      return { groups: out, overflow: st.overflow };
    },
  };
}

// binned(row => coord, opts, () => acc) — accumulate a sub-accumulator per spatial
// bin. opts = { min, max, bins } (dense Float64-indexed) or { binWidth } (sparse).
// Swath plots, binned profiles. Each bin reports its center + the sub-result.
export function binned(coordOf, opts, accFactory, { weight } = {}) {
  const acc = accFactory();
  const dense = opts.bins !== undefined && opts.min !== undefined && opts.max !== undefined;
  if (dense) {
    const { min, max, bins } = opts;
    const width = (max - min) / bins;
    return {
      create: () => ({ min, max, bins, width, cells: new Array(bins).fill(null), under: 0, over: 0 }),
      push: (st, row, w = 1) => {
        const c = coordOf(row);
        if (!Number.isFinite(c)) return;
        let idx = Math.floor((c - st.min) / st.width);
        if (idx < 0) { st.under++; return; }
        if (idx >= st.bins) { st.over++; return; }
        if (st.cells[idx] === null) st.cells[idx] = acc.create();
        acc.push(st.cells[idx], row, weight ? weight(row) : w);
      },
      merge: (a, b) => {
        const cells = new Array(a.bins).fill(null);
        for (let i = 0; i < a.bins; i++) {
          if (a.cells[i] && b.cells[i]) cells[i] = acc.merge(a.cells[i], b.cells[i]);
          else cells[i] = a.cells[i] || b.cells[i];
        }
        return { min: a.min, max: a.max, bins: a.bins, width: a.width, cells, under: a.under + b.under, over: a.over + b.over };
      },
      result: (st) => st.cells
        .map((sub, i) => sub === null ? null : { center: st.min + (i + 0.5) * st.width, value: acc.result(sub) })
        .filter((x) => x !== null),
    };
  }
  const binWidth = opts.binWidth;
  if (!(binWidth > 0)) throw new Error('sluice: binned needs {min,max,bins} or {binWidth>0}');
  return {
    create: () => ({ binWidth, bins: {} }),
    push: (st, row, w = 1) => {
      const c = coordOf(row);
      if (!Number.isFinite(c)) return;
      const idx = Math.floor(c / st.binWidth);
      if (st.bins[idx] === undefined) st.bins[idx] = acc.create();
      acc.push(st.bins[idx], row, weight ? weight(row) : w);
    },
    merge: (a, b) => {
      const bins = {};
      for (const k in a.bins) bins[k] = a.bins[k];
      for (const k in b.bins) bins[k] = (k in bins) ? acc.merge(bins[k], b.bins[k]) : b.bins[k];
      return { binWidth: a.binWidth, bins };
    },
    result: (st) => Object.keys(st.bins)
      .map(Number).sort((x, y) => x - y)
      .map((idx) => ({ center: (idx + 0.5) * st.binWidth, value: acc.result(st.bins[idx]) })),
  };
}

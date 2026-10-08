// The open table: a synthetic drillhole set, a histogram and a downhole variogram after compositing.
// Sample data, labelled as such in every result it reaches.
import { S, T, fmt } from './core.js';

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function makeData() {
  const r = mulberry(20261008), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()), rows = [], MU = { GRD: Math.log(.25), BRX: Math.log(.8), DYK: Math.log(.03) };
  for (let h = 1; h <= 8; h++) {
    const depth = 90 + 2 * Math.floor(r() * 20), L = h % 2 ? 1 : 2; let y = g(), lith = 'GRD', buf = [];
    for (let d = 0; d < depth; d++) {
      if (r() < .05) lith = lith === 'GRD' ? (r() < .7 ? 'BRX' : 'DYK') : 'GRD';
      y = .92 * y + Math.sqrt(1 - .92 * .92) * g();
      const cu = Math.exp(MU[lith] + .6 * y + .15 * g());
      buf.push({ lith, cu, au: cu * .4 * Math.exp(.35 * g()) });
      if (buf.length === L) {
        const cuM = buf.reduce((s, b) => s + b.cu, 0) / L, auM = buf.reduce((s, b) => s + b.au, 0) / L;
        rows.push({ hole: 'DH-0' + h, from: d + 1 - L, to: d + 1, lith: buf[0].lith, cu: +cuM.toFixed(3), au: auM < .02 ? -.01 : +auM.toFixed(3) });
        buf = [];
      }
    }
  }
  return rows;
}
export function stats(v) {
  const s = [...v].sort((a, b) => a - b), n = s.length, mean = s.reduce((a, b) => a + b, 0) / n, va = s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { n, mean, sd: Math.sqrt(va), va, min: s[0], med: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, max: s[n - 1] };
}
export const UNIT = { cu: '%', au: 'g/t' }, COL = { cu: 'Cu', au: 'Au' };
// the precondition "a table is open": asked once, then satisfied as a plan step the args remember
function needData(a, trace) {
  if (S.data) return null;
  if (!a.auto) return { prompt: 'No table is open. Open the sample table first?', options: [{ label: 'open assays.csv', value: true }], set: (x, v) => { x.auto = v; } };
  S.data = makeData(); trace.push('open assays.csv (precondition, added to the plan)');
  return null;
}
T.open = a => {
  S.data = makeData();
  const d = S.data, holes = new Set(d.map(r => r.hole)).size, n1 = d.filter(r => r.to - r.from === 1).length, neg = d.filter(r => r.au < 0).length;
  return {
    read: ['open table', { v: 'assays.csv' }],
    body: [
      { t: 'kv', rows: [['rows', `${d.length} samples in ${holes} holes`], ['columns', 'hole (id) · from, to (m) · lith (category) · cu (%) · au (g/t)'], ['lengths', `${n1} samples of 1 m, ${d.length - n1} of 2 m`], ['lith', [...new Set(d.map(r => r.lith))].join(', ')]] },
      ...(neg ? [{ t: 'note', text: `${neg} Au values are −0.01. That looks like a below-detection code. Statistics leave them out until you say what they mean.` }] : []),
      { t: 'src', text: 'synthetic table generated for this mock · sadpan + tare checks' }
    ],
    trace: ['read assays.csv → typed columns', 'tare: intervals contiguous, no overlaps', `tare: ${neg} negative Au values flagged`], py: 'dh = read_csv("assays.csv")'
  };
};
T.hist = a => {
  const trace = [], ask = needData(a, trace);
  const read = ['histogram of', { v: COL[a.col] }, { v: a.log ? 'log scale' : 'linear scale', key: 'log', alts: [false, true], cur: !!a.log }];
  if (ask) return { read, ask, body: [], trace: ['blocked: needs an open table'] };
  const raw = S.data.map(r => r[a.col]), v = raw.filter(x => x > 0), st = stats(v), f = a.log ? Math.log10 : x => x, lo = a.log ? f(st.min) : 0, hi = f(st.max), nb = 18, bins = new Array(nb).fill(0);
  v.forEach(x => { bins[Math.min(nb - 1, Math.floor((f(x) - lo) / (hi - lo) * nb))]++; });
  const inv = t => a.log ? Math.pow(10, t) : t;
  trace.push(`select ${a.col}; drop ${raw.length - v.length} non-positive values`, `bin into ${nb} ${a.log ? 'log10' : 'linear'} classes`);
  return {
    read, amend: 'hist',
    body: [
      { t: 'bars', label: `Histogram of ${COL[a.col]}`, bins, ticks: [0, .5, 1].map(t => fmt(inv(lo + t * (hi - lo)), 2)) },
      { t: 'kv', rows: [['n', String(st.n)], ['mean', `${fmt(st.mean, 3)} ${UNIT[a.col]}`], ['median', `${fmt(st.med, 3)} ${UNIT[a.col]}`], ['cv', fmt(st.sd / st.mean, 3)], ['range', `${fmt(st.min, 3)} to ${fmt(st.max, 3)} ${UNIT[a.col]}`]] },
      { t: 'src', text: 'sadpan · sample-count weighted, not declustered' }
    ],
    trace, py: `plot.hist(dh["${a.col}"][dh["${a.col}"] > 0], bins=${nb}${a.log ? ', log=True' : ''})`
  };
};
T.vario = a => {
  const trace = [], read = ['downhole variogram of', { v: COL[a.col] }];
  let ask = needData(a, trace);
  if (!ask && !a.comp) {
    const n1 = S.data.filter(r => r.to - r.from === 1).length;
    ask = { prompt: `A variogram needs samples of equal length. This table has ${n1} samples of 1 m and ${S.data.length - n1} of 2 m. Composite to what length?`, options: [2, 3, 4].map(v => ({ label: v + ' m', value: v })), set: (x, v) => { x.comp = v; } };
  }
  if (ask) return { read, ask, body: [], trace: ['blocked: precondition not met'] };
  read.push('composited to', { v: a.comp + ' m', key: 'comp', alts: [2, 3, 4], cur: a.comp });
  const L = a.comp, byHole = {};
  S.data.forEach(r => { if (r[a.col] > 0) (byHole[r.hole] = byHole[r.hole] || []).push(r); });
  const comps = {}; let nc = 0; const all = [];
  Object.entries(byHole).forEach(([h, rs]) => {
    const end = Math.max(...rs.map(r => r.to)), out = [];
    for (let k = 0; (k + 1) * L <= end; k++) {
      let w = 0, sum = 0;
      rs.forEach(r => { const o = Math.min(r.to, (k + 1) * L) - Math.max(r.from, k * L); if (o > 0) { w += o; sum += o * r[a.col]; } });
      out.push(w >= L / 2 ? sum / w : null);
      if (w >= L / 2) { nc++; all.push(sum / w); }
    }
    comps[h] = out;
  });
  const sill = stats(all).va, lags = [];
  for (let k = 1; k <= 12; k++) {
    let s2 = 0, np = 0;
    Object.values(comps).forEach(c => { for (let i = 0; i + k < c.length; i++) if (c[i] != null && c[i + k] != null) { s2 += (c[i] - c[i + k]) ** 2; np++; } });
    if (np) lags.push({ h: k * L, g: s2 / (2 * np), np });
  }
  const hx = lags[lags.length - 1].h, gy = Math.max(sill, ...lags.map(l => l.g)) * 1.1;
  trace.push(`drop non-positive ${a.col} values`, `composite to ${L} m, length weighted, keep ≥ 50% coverage → ${nc} composites`, `pair composites down each hole at lags of ${L} m → ${lags.length} lags`);
  return {
    read,
    body: [
      { t: 'curve', label: `Downhole variogram of ${COL[a.col]}`, points: lags.map(l => ({ x: l.h, y: l.g })), xmax: hx, ymax: gy, ylabel: fmt(gy, 2), ref: { y: sill, label: `variance ${fmt(sill, 3)}` }, xticks: [lags[0].h, lags[Math.floor(lags.length / 2)].h, hx].map(h => ({ x: h, label: `${h} m` })) },
      { t: 'kv', rows: [['composites', `${nc} at ${L} m`], ['first lag', `γ(${L} m) = ${fmt(lags[0].g, 3)}, ${fmt(lags[0].g / sill * 100, 3)}% of the variance, ${lags[0].np} pairs`], ['last lag', `γ(${hx} m) = ${fmt(lags[lags.length - 1].g, 3)}, ${lags[lags.length - 1].np} pairs`]] },
      { t: 'src', text: '@gcu/drillhole → gsjs · experimental only, no model fitted' }
    ],
    trace, py: `comp = drillhole.composite(dh[dh["${a.col}"] > 0], ${L})\ngsjs.variogram(comp, "${a.col}", direction="downhole", lag=${L}, nlags=12)`
  };
};

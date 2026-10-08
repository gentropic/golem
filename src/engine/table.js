// The open table: a synthetic drillhole set and a histogram with summary statistics.
// Sample data, labelled as such in every result it reaches.
import { S, tool, frame, fmt } from './core.js';
import { series } from '../vendor/sadpan.js';

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
// summary statistics through @gcu/sadpan (vendored): sample standard deviation, median of the sorted values
export function stats(v) {
  const s = series(v), sd = s.std();
  return { n: s.count(), mean: s.mean(), sd, va: sd * sd, min: s.min(), med: s.median(), max: s.max() };
}
export const UNIT = { cu: '%', au: 'g/t' }, COL = { cu: 'Cu', au: 'Au' };
const colOf = w => w[0] === 'c' ? 'cu' : 'au';
// the precondition "a table is open": asked once, then satisfied as a plan step the args remember
function needData(a, trace) {
  if (S.data) return null;
  if (!a.auto) return { prompt: 'No table is open. Open the sample table first?', options: [{ label: 'open assays.csv', value: true }], set: (x, v) => { x.auto = v; } };
  S.data = makeData(); trace.push('open assays.csv (precondition, added to the plan)');
  return null;
}
tool({
  name: 'open', rank: 50,
  skill: { group: 'Table', title: 'Open and validate', on: 'sadpan · tare', about: 'Typed columns, interval checks, flags for suspicious codes.', examples: ['open assays.csv'] },
  read: (text, q) => /^open (.+\.csv|the sample|sample|assays)$/.test(q) ? {} : null,
  run: () => {
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
  }
});
frame({
  name: 'open', label: 'Open', words: ['open', 'load'], theme: ['table'], required: ['theme'], roles: {},
  words_pt: ['abrir', 'abre', 'carregar', 'carrega'], label_pt: 'Abrir',
  bind: () => ({ tool: 'open', args: {} })
});
tool({
  name: 'hist', rank: 51,
  skill: { group: 'Table', title: 'Histogram', on: 'sadpan · @gcu/plot', about: 'Amend it afterwards with “log scale”.', examples: ['histogram of cu'] },
  read: (text, q) => { const m = /^hist(?:ogram)? (?:of )?(cu|au|copper|gold)( (?:in )?log(?: scale)?)?$/.exec(q); return m ? { col: colOf(m[1]), log: !!m[2] } : null; },
  amend: [{ arg: 'log', match: /^(?:in )?(log|linear)(?: scale)?$/, value: m => m[1] === 'log' }],
  topic: a => [COL[a.col] + ' histogram', 3],
  run: a => {
    const trace = [], ask = needData(a, trace);
    const read = ['histogram of', { v: COL[a.col] }, { v: a.log ? 'log scale' : 'linear scale', key: 'log', alts: [false, true], cur: !!a.log }];
    if (ask) return { read, ask, body: [], trace: ['blocked: needs an open table'] };
    const raw = S.data.map(r => r[a.col]), v = raw.filter(x => x > 0), st = stats(v), f = a.log ? Math.log10 : x => x, lo = a.log ? f(st.min) : 0, hi = f(st.max), nb = 18, bins = new Array(nb).fill(0);
    v.forEach(x => { bins[Math.min(nb - 1, Math.floor((f(x) - lo) / (hi - lo) * nb))]++; });
    const inv = t => a.log ? Math.pow(10, t) : t;
    trace.push(`select ${a.col}; drop ${raw.length - v.length} non-positive values`, `bin into ${nb} ${a.log ? 'log10' : 'linear'} classes`);
    return {
      read,
      body: [
        { t: 'bars', label: `Histogram of ${COL[a.col]}`, bins, ticks: [0, .5, 1].map(t => fmt(inv(lo + t * (hi - lo)), 2)) },
        { t: 'kv', rows: [['n', String(st.n)], ['mean', `${fmt(st.mean, 3)} ${UNIT[a.col]}`], ['median', `${fmt(st.med, 3)} ${UNIT[a.col]}`], ['cv', fmt(st.sd / st.mean, 3)], ['range', `${fmt(st.min, 3)} to ${fmt(st.max, 3)} ${UNIT[a.col]}`]] },
        { t: 'src', text: '@gcu/sadpan · vendored · sample-count weighted' }
      ],
      trace, py: `plot.hist(dh["${a.col}"][dh["${a.col}"] > 0], bins=${nb}${a.log ? ', log=True' : ''})`
    };
  }
});
// "histogram of cu", "plot a histogram of gold in log scale"
frame({
  name: 'plot', label: 'Plot', words: ['plot', 'draw', 'show', 'display'], elidable: true,
  theme: ['plot'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for'], types: ['variable'] }, scale: { preps: ['in', 'on', 'with'], types: ['scale'] } },
  words_pt: ['plotar', 'plota', 'mostrar', 'mostra', 'desenhar', 'desenha'], label_pt: 'Plotar',
  bind: c => {
    const kind = c.theme[0] && c.theme[0].value, v = c.roles.of && c.roles.of[0]; if (!kind || !v || !v.value) return null;
    const col = v.value.toLowerCase();
    return kind === 'histogram' ? { tool: 'hist', args: { col, log: !!(c.roles.scale && c.roles.scale[0].value === 'log') } } : null;
  }
});

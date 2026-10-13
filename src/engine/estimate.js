// Estimates with ranges: arithmetic over intervals by simulation, units carried through, the seed kept
// in the plan. "2.7 ± 0.1 t/m3 * 1.35 Mm3", "(120 to 180) * (0.4 to 0.6) / 7". Percentiles are called
// percentiles: mining and petroleum read P10/P90 the opposite way round.
import { amend, noun, tool, fmt } from './core.js';
import { U } from './units.js';

const RUNS = 10000, Z95 = 1.6448536269514722;
const PREFIX = { k: 1e3, M: 1e6, G: 1e9, m: 1e-3, u: 1e-6, 'µ': 1e-6 };
const RATIO = new Set(Object.values(U).filter(x => x.dim === 'R').map(x => x.name)), ratioF = name => Object.values(U).find(x => x.name === name).f;
const BASE = { L: { L: 1 }, M: { M: 1 }, R: {}, A: { L: 2 }, V: { L: 3 }, P: { M: 1, L: -1, t: -2 }, t: { t: 1 } };
const dimMul = (a, b, k = 1) => { const r = { ...a }; for (const x in b) { r[x] = (r[x] || 0) + k * b[x]; if (!r[x]) delete r[x]; } return r; };
const dimEq = (a, b) => Object.keys({ ...a, ...b }).every(k => (a[k] || 0) === (b[k] || 0));
const dimPow = (d, n) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v * n]).filter(x => x[1]));
// a unit word: the table's word, or a prefixed one (Mt, kt, Mm3, ml); never temperature
export function unitWord(w) {
  const hit = U[w] || U[w.toLowerCase()]; if (hit && hit.dim !== 'T') return { name: hit.name, scale: 1, f: hit.f, dim: BASE[hit.dim] };
  const p = PREFIX[w[0]], rest = w.slice(1), r = p && rest && (U[rest] || (rest.length > 1 ? U[rest.toLowerCase()] : null));
  if (r && r.dim !== 'T') return { name: r.name, scale: p, f: r.f * p, dim: BASE[r.dim] };
  return null;
}
// a quantity: samples in its displayed unit; SI value = sample × scale × Π f(word)^exp
const Q = (samples, words = new Map(), scale = 1, dim = {}, f = 1) => ({ samples, words, scale, dim, f });
const wordsMul = (a, b, k = 1) => { const r = new Map(a); for (const [w, e] of b) { const n = (r.get(w) || 0) + k * e; if (n) r.set(w, n); else r.delete(w); } return r; };
const mul = (a, b) => Q(a.samples.map((x, i) => x * b.samples[i]), wordsMul(a.words, b.words), a.scale * b.scale, dimMul(a.dim, b.dim), a.f * b.f);
const div = (a, b) => Q(a.samples.map((x, i) => x / b.samples[i]), wordsMul(a.words, b.words, -1), a.scale / b.scale, dimMul(a.dim, b.dim, -1), a.f / b.f);
const unitName = words => { const pos = [...words].filter(x => x[1] > 0), neg = [...words].filter(x => x[1] < 0), part = ([w, e]) => w + (Math.abs(e) === 1 ? '' : Math.abs(e) === 2 ? '²' : Math.abs(e) === 3 ? '³' : '^' + Math.abs(e)); return pos.map(part).join('·') + (neg.length ? (pos.length ? '/' : '1/') + neg.map(part).join('·') : ''); };
// a result is shown with a prefix when its scale is one (Mt), else the scale folds into the numbers
function settle(q) {
  const words = new Map(q.words); let scale = q.scale;
  if ([...words].some(([w]) => RATIO.has(w)) && [...words].some(([w]) => !RATIO.has(w))) for (const [w, e] of [...words]) if (RATIO.has(w)) { scale *= Math.pow(ratioF(w), e); words.delete(w); }
  q = { ...q, words, scale };
  if (q.scale === 1) return { ...q, unit: unitName(q.words) };
  const only = [...q.words].length === 1 && [...q.words][0][1] === 1 ? [...q.words][0][0] : null, pre = Object.entries(PREFIX).find(([, v]) => Math.abs(v / q.scale - 1) < 1e-9);
  if (only && pre && pre[0] !== 'u') return { ...q, unit: pre[0] + only };
  return { ...q, samples: q.samples.map(x => x * q.scale), scale: 1, unit: unitName(q.words) };
}

/* ── sampling (mulberry32, Box–Muller), the seed from args ── */
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const normal = r => { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function drawRange(node, r, a) {
  const out = new Float64Array(RUNS);
  if (node.pm) {
    const how = a.pm || 'normal';
    for (let i = 0; i < RUNS; i++) out[i] = how === 'normal' ? node.a + node.b * normal(r) : node.a - node.b + 2 * node.b * r();
    return { out, mean: node.a, how: how === 'normal' ? `normal, mean ${fmt(node.a)}, sd ${fmt(node.b)}` : `uniform ${fmt(node.a - node.b)} to ${fmt(node.a + node.b)}` };
  }
  const how = a.dist || 'uniform', lo = Math.min(node.a, node.b), hi = Math.max(node.a, node.b);
  if (how === 'uniform') { for (let i = 0; i < RUNS; i++) out[i] = lo + (hi - lo) * r(); return { out, mean: (lo + hi) / 2, how: `uniform ${fmt(lo)} to ${fmt(hi)}` }; }
  if (how === 'normal') { const m = (lo + hi) / 2, sd = (hi - lo) / (2 * Z95); for (let i = 0; i < RUNS; i++) out[i] = m + sd * normal(r); return { out, mean: m, how: `normal with ${fmt(lo)} and ${fmt(hi)} as the 5th and 95th percentiles` }; }
  if (lo <= 0) throw { refuse: `a lognormal range needs positive bounds; ${fmt(lo)} to ${fmt(hi)} is not` };
  const m = (Math.log(lo) + Math.log(hi)) / 2, sd = (Math.log(hi) - Math.log(lo)) / (2 * Z95);
  for (let i = 0; i < RUNS; i++) out[i] = Math.exp(m + sd * normal(r));
  return { out, mean: Math.exp(m + sd * sd / 2), how: `lognormal with ${fmt(lo)} and ${fmt(hi)} as the 5th and 95th percentiles` };
}

/* ── the parser: calc's grammar plus range literals, units after numbers, and named variables ── */
const NUM = '(\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)';
const RANGE_RE = new RegExp(`${NUM}\\s*(?:to|–|\\.\\.\\.?)\\s*${NUM}|${NUM}\\s*(?:±|\\+-|\\+/-)\\s*${NUM}|between\\s+${NUM}\\s+and\\s+${NUM}`, 'i');
const FN = { sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10 };
class Parser {
  constructor(src, vars) { this.s = src.replace(/\s+/g, ' ').replace(/×/g, '*').replace(/÷/g, '/').trim(); this.i = 0; this.vars = vars; this.ranges = []; }
  ws() { while (this.s[this.i] === ' ') this.i++; }
  peek(re) { this.ws(); const m = re.exec(this.s.slice(this.i)); return m && m.index === 0 ? m : null; }
  take(re) { const m = this.peek(re); if (m) this.i += m[0].length; return m; }
  fail(msg) { throw { syntax: msg }; }
  parse() { const n = this.expr(); this.ws(); if (this.i < this.s.length) this.fail(`unexpected "${this.s.slice(this.i, this.i + 12)}"`); return n; }
  expr() { let n = this.term(); let m; while ((m = this.take(/^[+\-−]/))) n = { t: 'op', op: m[0] === '+' ? '+' : '-', a: n, b: this.term() }; return n; }
  term() { let n = this.pow(); let m; while ((m = this.take(/^[*\/]/))) n = { t: 'op', op: m[0], a: n, b: this.pow() }; return n; }
  pow() { const b = this.unary(); if (this.take(/^\^/)) { const e = this.unary(); if (e.t !== 'num' || e.unit) this.fail('a power must be a plain number'); return { t: 'pow', a: b, n: e.v }; } return b; }
  unary() { if (this.take(/^[-−]/)) return { t: 'neg', a: this.unary() }; return this.primary(); }
  unit() {
    const save = this.i, m = this.take(/^([a-zA-Zµ°%][a-zA-Z0-9µ°²³]*)/); if (!m) return null;
    if (/^(to|and|per|where|if|with|is|e)$/i.test(m[1]) || FN[m[1]] || this.vars[m[1]]) { this.i = save; return null; }
    const w = unitWord(m[1]); if (!w) throw { word: m[1] };
    const words = new Map([[w.name, 1]]); let scale = w.scale, f = w.f, dim = w.dim;
    const d = this.take(/^\s*(?:\/|per)\s*(\d+(?:\.\d+)?)?\s*([a-zA-Zµ°%][a-zA-Z0-9µ°²³]*)/);
    if (d) { const w2 = unitWord(d[2]); if (!w2) throw { word: d[2] }; words.set(w2.name, (words.get(w2.name) || 0) - 1); if (!words.get(w2.name)) words.delete(w2.name); scale = scale / w2.scale / (d[1] ? +d[1] : 1); f = f / w2.f / (d[1] ? +d[1] : 1); dim = dimMul(dim, w2.dim, -1); }
    return { words, scale, f, dim, text: this.s.slice(save, this.i).trim() };
  }
  number() { const m = this.take(new RegExp('^' + NUM)); return m ? +m[1] : null; }
  primary() {
    if (this.take(/^\(/)) { const n = this.expr(); if (!this.take(/^\)/)) this.fail('a bracket that never closes'); const u = this.unit(); return u ? { t: 'op', op: '*', a: n, b: { t: 'num', v: 1, unit: u } } : n; }
    if (this.take(/^between\s/i)) { const a = this.number(); if (a == null) this.fail('"between" needs two numbers'); const u1 = this.unit(); if (!this.take(/^and\s/i)) this.fail('"between" needs "and"'); const b = this.number(); if (b == null) this.fail('"between" needs two numbers'); const u = this.unit() || u1; return this.range(a, b, false, u); }
    const w = this.take(/^([a-zA-Z_]\w*)\s*(?=\()/); if (w) { if (!FN[w[1]]) this.fail(`no function called ${w[1]}`); this.take(/^\(/); const n = this.expr(); if (!this.take(/^\)/)) this.fail('a bracket that never closes'); return { t: 'fn', fn: w[1], a: n }; }
    const v = this.take(/^([a-zA-Z_]\w*)/); if (v) { if (this.vars[v[1]]) return this.vars[v[1]]; if (unitWord(v[1])) this.fail(`a unit "${v[1]}" with no number before it`); throw { word: v[1] }; }
    const a = this.number(); if (a == null) this.fail(`unexpected "${this.s.slice(this.i, this.i + 12) || 'end'}"`);
    const u1 = this.unit();
    if (this.take(/^(?:to|–|\.\.\.?)\s/i) || this.peek(/^(?:to|–|\.\.\.?)/)) { this.take(/^(?:to|–|\.\.\.?)/); const b = this.number(); if (b == null) this.fail('a range needs a second number'); const u = this.unit() || u1; return this.range(a, b, false, u); }
    if (this.take(/^(?:±|\+-|\+\/-)/)) { const b = this.number(); if (b == null) this.fail('± needs a number after it'); const u = this.unit() || u1; return this.range(a, b, true, u); }
    return { t: 'num', v: a, unit: u1 };
  }
  range(a, b, pm, unit) { const n = { t: 'range', a, b, pm, unit, text: pm ? `${a} ± ${b}` : `${a} to ${b}` }; this.ranges.push(n); return n; }
}
const CONST = v => Q(new Float64Array(RUNS).fill(v));
function evaluate(n, r, a, ctx) {
  switch (n.t) {
    case 'num': { const q = n.unit ? Q(CONST(n.v).samples, n.unit.words, n.unit.scale, n.unit.dim, n.unit.f) : CONST(n.v); q.mean = n.v; return q; }
    case 'range': { const d = drawRange(n, r, a); ctx.inputs.push(`${n.text}${n.unit ? ' ' + n.unit.text : ''}: ${d.how}`); const q = Q(d.out, n.unit ? n.unit.words : new Map(), n.unit ? n.unit.scale : 1, n.unit ? n.unit.dim : {}, n.unit ? n.unit.f : 1); q.mean = d.mean; return q; }
    case 'neg': { const q = evaluate(n.a, r, a, ctx); return { ...q, samples: q.samples.map(x => -x), mean: q.mean == null ? undefined : -q.mean }; }
    case 'fn': { const q = evaluate(n.a, r, a, ctx); if (Object.keys(q.dim).length) throw { refuse: `${n.fn}() takes a plain number, not a quantity in ${unitName(q.words)}` }; return Q(q.samples.map(FN[n.fn])); }
    case 'pow': { const q = evaluate(n.a, r, a, ctx); if (!Number.isInteger(n.n)) { if (Object.keys(q.dim).length) throw { refuse: 'a fractional power of a quantity with units' }; return Q(q.samples.map(x => Math.pow(x, n.n))); } return { ...Q(q.samples.map(x => Math.pow(x, n.n)), new Map([...q.words].map(([w, e]) => [w, e * n.n])), Math.pow(q.scale, n.n), dimPow(q.dim, n.n), Math.pow(q.f, n.n)), mean: n.a.t === 'num' ? Math.pow(n.a.v, n.n) : undefined }; }
    case 'op': {
      const x = evaluate(n.a, r, a, ctx), y = evaluate(n.b, r, a, ctx);
      if (n.op === '*') return { ...mul(x, y), mean: x.mean != null && y.mean != null ? x.mean * y.mean : undefined };
      if (n.op === '/') return { ...div(x, y), mean: x.mean != null && n.b.t === 'num' ? x.mean / n.b.v : undefined };
      if (!dimEq(x.dim, y.dim)) throw { refuse: `${n.op === '+' ? 'adding' : 'subtracting'} ${unitName(y.words) || 'a plain number'} ${n.op === '+' ? 'to' : 'from'} ${unitName(x.words) || 'a plain number'}: the dimensions differ` };
      const conv = (y.scale * y.f) / (x.scale * x.f);   // y in x's unit
      const s = x.samples.map((v, i) => n.op === '+' ? v + y.samples[i] * conv : v - y.samples[i] * conv);
      return { ...Q(s, x.words, x.scale, x.dim, x.f), mean: x.mean != null && y.mean != null ? (n.op === '+' ? x.mean + y.mean * conv : x.mean - y.mean * conv) : undefined };
    }
    default: throw { syntax: 'unknown node' };
  }
}
const pct = (sorted, p) => { const k = (sorted.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k); return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo); };

const seedOf = () => Math.floor(Math.random() * 2 ** 31);
// a ranged expression ("(120 to 180) * 0.5", "x = a * b where a is 9 to 11"): the estimate language's front, a recogniser
export function estimateOf(text) {
  const m = /^(?:estimate |range of )?(.+?)(?:\s+(?:where|if|with|given)\s+(.+))?$/i.exec(text.trim()); if (!m) return null;
  let expr = m[1], name = null, vars = null;
  const eq = /^([a-zA-Z_]\w*)\s*=\s*(.+)$/.exec(expr); if (eq) { name = eq[1]; expr = eq[2]; }
  if (m[2]) { vars = {}; for (const part of m[2].split(/\s+and\s+(?=(?:the\s+)?\w+\s+is\s)/i)) { const v = /^(?:the\s+)?([a-zA-Z_]\w*)\s+is\s+(.+)$/i.exec(part.trim()); if (!v) return null; vars[v[1]] = v[2]; } }
  if (!RANGE_RE.test(expr) && !(vars && Object.values(vars).some(v => RANGE_RE.test(v)))) return null;
  if (!/^[\w\s.()^*\/+\-−±×÷%°µ²³…–=]+$/.test(expr)) return null;
  return { expr, ...(name ? { name } : {}), ...(vars ? { vars } : {}), seed: seedOf() };
}

tool({
  name: 'estimate',
  skill: { group: 'Compute', title: 'Estimates with ranges', on: 'own sampler', about: 'Arithmetic over ranges by simulation: "a to b" uniform (or normal, lognormal, as a slot), "a ± b" normal. Units carried through; mean and the 10th, 50th and 90th percentiles; the seed stays in the plan.', examples: ['2.7 ± 0.1 t/m3 * 1.35 Mm3', '(120 to 180) * (0.4 to 0.6) / 7', 'fuel = consumption * trip where consumption is 9 to 11 l per 100 km and trip is 400 to 450 km'] },
  topic: a => [a.name ? `Estimate of ${a.name}` : 'Range estimate', 1],
  run: a => {
    const read = ['estimate', { v: a.name ? `${a.name} = ${a.expr}` : a.expr }];
    const refuse = (text, why) => ({ read, body: [{ t: 'note', kind: 'err', text }], trace: [why] });
    let tree, P;
    try {
      const vars = {};
      for (const [k, v] of Object.entries(a.vars || {})) { const p = new Parser(v, {}); vars[k] = p.parse(); }
      P = new Parser(a.expr, vars); tree = P.parse();
      for (const k in vars) { const p2 = new Parser(a.vars[k], {}); p2.parse(); P.ranges.push(...p2.ranges); }
    } catch (e) { if (e.word) return refuse(`I do not know "${e.word}": not a unit I have, nor a name given with "where ${e.word} is …".`, `unknown word ${e.word}`); if (e.syntax) return null; throw e; }
    const ranges = P.ranges.filter((x, i, arr) => arr.indexOf(x) === i), reversed = ranges.find(x => !x.pm && x.a > x.b);
    if (reversed && !a.swap) return { read, body: [], ask: { prompt: `${reversed.text}: the upper bound is below the lower. Read it as ${fmt(reversed.b)} to ${fmt(reversed.a)}?`, options: [{ label: `${fmt(reversed.b)} to ${fmt(reversed.a)}`, value: true }], set: (x, v) => { x.swap = v; } }, trace: ['blocked: bounds reversed'] };
    const hasTo = ranges.some(x => !x.pm), hasPm = ranges.some(x => x.pm);
    if (hasTo) read.push({ v: a.dist || 'uniform', key: 'dist', alts: ['uniform', 'normal', 'lognormal'], cur: a.dist || 'uniform' });
    if (hasPm) read.push({ v: `± as ${a.pm || 'normal'}`, key: 'pm', alts: ['normal', 'uniform'], cur: a.pm || 'normal' });
    const r = rng(a.seed), ctx = { inputs: [] };
    let q; try { q = evaluate(tree, r, a, ctx); } catch (e) { if (e.refuse) return refuse(`I cannot compute that: ${e.refuse}.`, 'refused: ' + e.refuse); throw e; }
    const out = settle(q), s = Float64Array.from(out.samples).sort(), mean = s.reduce((x, y) => x + y, 0) / s.length, p10 = pct(s, .1), p50 = pct(s, .5), p90 = pct(s, .9), unit = out.unit ? ' ' + out.unit : '';
    const exact = q.mean != null ? q.mean * (out.scale === 1 && q.scale !== 1 ? q.scale : 1) : null;
    const nb = 18, lo = s[0], hi = s[s.length - 1], bins = new Array(nb).fill(0); s.forEach(x => { bins[Math.min(nb - 1, Math.floor((x - lo) / Math.max(1e-300, hi - lo) * nb))]++; });
    const sd = Math.sqrt(s.reduce((acc, x) => acc + (x - mean) ** 2, 0) / s.length);
    return {
      read, value: p50,
      body: [
        { t: 'big', v: fmt(p50, 4), unit: `${out.unit || ''} median (50th percentile)`.trim() },
        { t: 'kv', rows: [['mean', `${fmt(mean, 4)}${unit}${exact != null ? ` (exact ${fmt(exact, 5)}: the mean of a product or sum of independent inputs)` : ''}`], ['10th percentile', `${fmt(p10, 4)}${unit}`], ['90th percentile', `${fmt(p90, 4)}${unit}`], ['spread', `sd ${fmt(sd, 3)}${unit}, cv ${fmt(sd / Math.abs(mean), 3)}`]] },
        { t: 'bars', label: `${RUNS.toLocaleString('en-GB')} runs${unit}`, bins, ticks: [fmt(lo, 3), fmt((lo + hi) / 2, 3), fmt(hi, 3)] },
        { t: 'list', items: ctx.inputs },
        { t: 'sub', text: `Inputs are drawn independently. ${RUNS.toLocaleString('en-GB')} runs from seed ${a.seed}; the same seed gives the same numbers again. Percentiles are percentiles: the 10th is the low end.` }
      ],
      trace: [`parse: ${ranges.length} range${ranges.length === 1 ? '' : 's'}${a.vars ? ', ' + Object.keys(a.vars).length + ' named' : ''}`, ...ctx.inputs.map(x => 'draw ' + x), `evaluate over ${RUNS} runs → unit ${out.unit || 'none'}`, `sort → percentiles 10/50/90 = ${fmt(p10, 4)}, ${fmt(p50, 4)}, ${fmt(p90, 4)}`],
      py: `estimate.range(${JSON.stringify(a.expr)}, vars=${JSON.stringify(a.vars || {})}, runs=${RUNS}, seed=${a.seed})`
    };
  }
});
// "uniform", "assume normal"
noun({ amend: true, type: 'dist', words: { uniform: ['uniform', 'uniform ranges', 'flat'], normal: ['normal', 'normal ranges', 'gaussian'], lognormal: ['lognormal', 'log-normal'] }, words_pt: { uniform: ['uniforme'], normal: ['normal'], lognormal: ['lognormal'] } });
amend({ tools: ['estimate'], name: 'estdist', label: 'Distribution', words: ['assume', 'assuming', 'use'], elidable: true, theme: ['dist'], required: ['theme'], roles: {}, bind: (c, a) => ({ args: { ...a, dist: c.theme[0].value } }) });

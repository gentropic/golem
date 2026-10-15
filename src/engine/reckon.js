// Reckoning, the old-fashioned way (SPEC 13: reasoning without a model). Two pieces:
//
// Dimensional search: "how long to drill 300 m at 25 m/h", "how heavy is 1000 m3 at 2.7 t/m3", "how far in 3 h at
// 5 km/h". The question says the dimension it wants (or "in hours" does); the request's quantities are multiplied and
// divided, each used once or not at all, until the dimension comes out. Combinations that use every quantity win; when
// more than one does, the card asks which, and runs none until one is picked. Units through golem's own table.
//
// Declared formulas, solvable for any term: tonnage, contained metal, strip ratio, the two-product recovery, break-even
// cutoff, lithostatic pressure, Darcy's law, Stokes settling. A formula is an equation as data (its residual); a slot
// says which term is unknown ("solve for"), the others are asked, and a root search over the term's range finds the
// value. Where the equation has more than one root in range, the card says so and shows each.
import { S, tool, frame, noun, fmt } from './core.js';
import { calc } from './calc.js';
import { parseUnit } from './units.js';
import { numberAsk, firstNeed } from './forms.js';

/* ── dimensions ─────────────────────────────────────────────── */
// golem's unit dimensions ('L', 'M/V', 'L/t', …) as exponent vectors over length, mass, time, temperature
const BASE = { L: { L: 1 }, M: { M: 1 }, t: { T: 1 }, A: { L: 2 }, V: { L: 3 }, R: {}, T: { K: 1 }, P: { M: 1, L: -1, T: -2 } };
const add = (a, b, k = 1) => { const o = { ...a }; for (const [x, e] of Object.entries(b)) { o[x] = (o[x] || 0) + k * e; if (!o[x]) delete o[x]; } return o; };
export function vecOf(dim) {
  if (dim == null) return null;
  const [num, den] = String(dim).split('/'); if (!BASE[num] || (den && !BASE[den])) return null;
  return den ? add(BASE[num], BASE[den], -1) : { ...BASE[num] };
}
const same = (a, b) => { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); for (const k of ks) if ((a[k] || 0) !== (b[k] || 0)) return false; return true; };
const DIM_WORD = { t: 'time', L: 'length', M: 'mass', V: 'volume', A: 'area', R: 'ratio', 'L/t': 'speed', 'M/V': 'density' };
// the unit a result is shown in: the one asked for, else one of the request's own with that dimension, else a usual one
function showUnit(vec, siValue, asked, quantities) {
  if (asked) { const u = parseUnit(asked); if (u && same(vecOf(u.dim), vec)) return { unit: asked, f: u.f }; }
  const usual = [['t', s => s < 60 ? 's' : s < 3600 ? 'min' : s < 72 * 3600 ? 'h' : 'day'], ['L', s => s >= 1000 ? 'km' : 'm'], ['M', s => s >= 1000 ? 't' : 'kg'], ['V', () => 'm3'], ['A', s => s >= 1e6 ? 'km2' : 'm2'], ['R', () => '%']];
  for (const [d, pick] of usual) if (same(vec, vecOf(d))) { const unit = pick(Math.abs(siValue)), u = parseUnit(unit); return { unit, f: u.f }; }
  const own = quantities.find(q => same(vecOf(q.dim), vec)); if (own) return { unit: own.unit, f: own.f };
  return { unit: Object.entries(vec).map(([k, e]) => ({ L: 'm', M: 'kg', T: 's', K: 'K' }[k] + (e !== 1 ? e : ''))).join('·') || '', f: 1 };
}
// the quantities in a request: a number and the unit after it, as golem's unit table reads it ("25 m/h", "2.7 t/m3",
// "1.2 %"); a number with no unit is a count
export function quantitiesOf(text) {
  const out = [], words = String(text).replace(/(\d)([a-zµ%])/gi, '$1 $2').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const n = /^-?\d+(?:[.,]\d+)?$/.test(words[i]) ? +words[i].replace(',', '.') : null; if (n == null) continue;
    let best = null;
    for (let k = Math.min(3, words.length - i - 1); k >= 1; k--) { const w = words.slice(i + 1, i + 1 + k).join(' ').replace(/[,;.]$/, ''), u = parseUnit(w); if (u && !u.amb && vecOf(u.dim)) { best = { unit: w, u, k }; break; } }
    if (best) { out.push({ n, unit: best.unit, dim: best.u.dim, f: best.u.f, si: n * best.u.f }); i += best.k; } else out.push({ n, unit: '', dim: 'R', f: 1, si: n });
  }
  return out;
}
// every way of multiplying and dividing the quantities (each used once or not at all) that gives the dimension wanted
export function combos(qs, want) {
  const out = [], e = new Array(qs.length).fill(0);
  const walk = i => {
    if (i === qs.length) { if (e.every(x => x === 0)) return; let v = {}; e.forEach((x, j) => { if (x) v = add(v, vecOf(qs[j].dim), x); }); if (!want || same(v, want)) out.push({ e: [...e], vec: v, used: e.filter(Boolean).length }); return; }
    for (const x of [1, -1, 0]) { e[i] = x; walk(i + 1); }
  };
  walk(0);
  const most = Math.max(0, ...out.map(c => c.used));
  return out.filter(c => c.used === most);
}
const termOf = (qs, e) => { const up = qs.filter((_, j) => e[j] > 0).map(q => `${fmt(q.n)}${q.unit ? ' ' + q.unit : ''}`), down = qs.filter((_, j) => e[j] < 0).map(q => `${fmt(q.n)}${q.unit ? ' ' + q.unit : ''}`); return `${up.length ? up.join(' × ') : '1'}${down.length ? ' ÷ ' + (down.length > 1 ? `(${down.join(' × ')})` : down[0]) : ''}`; };
const valueOf = (qs, e) => qs.reduce((v, q, j) => e[j] ? v * Math.pow(q.si, e[j]) : v, 1);

tool({
  name: 'reckon',
  skill: { group: 'Compute', title: 'Reckon by dimensions', on: 'own dimensional analysis · golem units', about: 'Questions answered from their quantities alone: the dimension asked for (how long, how far, how heavy, what volume, or "in hours") found by multiplying and dividing what was given, each once. One way: the answer, with its equation. More than one: a choice, never a guess.', examples: ['how long to drill 300 m at 25 m/h', 'how heavy is 1000 m3 at 2.7 t/m3', 'how far in 3 h at 5 km/h', 'how much copper in 2700 t at 1.2 %'] },
  topic: a => [`Reckon: ${a.text}`, 1],
  run: a => {
    const qs = quantitiesOf(a.text), want = a.want ? vecOf(a.want) : a.in ? vecOf((parseUnit(a.in) || {}).dim) : null;
    const read = [a.want ? `${DIM_WORD[a.want] || a.want} for` : 'reckon', { v: a.text }, ...(a.in ? ['in', { v: a.in }] : [])];
    if (qs.length < 2) return { read, body: [{ t: 'note', kind: 'err', text: 'I need at least two quantities with their units to reckon from, as in "300 m at 25 m/h".' }], trace: [`quantities: ${qs.length}`] };
    const cs = combos(qs, want);
    const qline = `quantities: ${qs.map(q => `${fmt(q.n)}${q.unit ? ' ' + q.unit : ''} (${q.unit ? DIM_WORD[q.dim] || q.dim : 'a count'})`).join(', ')}`;
    if (!cs.length) return { read, body: [{ t: 'note', kind: 'err', text: `No product or quotient of ${qs.map(q => `${fmt(q.n)} ${q.unit}`.trim()).join(', ')} gives ${want ? DIM_WORD[a.want] || 'that dimension' : 'an answer'}. I do not guess the missing quantity.` }], trace: [qline, 'dimension search: nothing matches'] };
    const pick = a.pick != null ? cs.find(c => c.e.join() === a.pick) : cs.length === 1 ? cs[0] : null;
    if (!pick) return { read, body: [{ t: 'note', text: `${cs.length} ways of combining these give ${want ? DIM_WORD[a.want] || 'that dimension' : 'an answer'}. Which one is meant?` }, { t: 'list', items: cs.map(c => termOf(qs, c.e)) }],
      ask: { prompt: 'Which one?', options: cs.map(c => { const v = valueOf(qs, c.e), s = showUnit(c.vec, v, a.in, qs); return { label: `${termOf(qs, c.e)} = ${fmt(v / s.f, 5)} ${s.unit}`, value: c.e.join() }; }), set: (x, v) => { x.pick = v; } },
      trace: [qline, `dimension search: ${cs.length} combinations use every quantity`, 'wait: which one'] };
    const si = valueOf(qs, pick.e), s = showUnit(pick.vec, si, a.in, qs), v = si / s.f;
    return { read, value: v,
      body: [{ t: 'big', v: fmt(v, 5), unit: s.unit }, { t: 'kv', rows: [['as', `${termOf(qs, pick.e)} = ${fmt(v, 5)} ${s.unit}`], ['dimension', DIM_WORD[Object.keys(DIM_WORD).find(d => same(vecOf(d), pick.vec))] || Object.entries(pick.vec).map(([k, e]) => `${k}^${e}`).join(' ') || 'none'], ...(cs.length === 1 && a.pick == null ? [['found', 'the only product or quotient of all the quantities with that dimension']] : [])] },
        { t: 'src', text: 'own dimensional analysis · golem units · exact factors' }],
      trace: [qline, `dimension search over ${3 ** qs.length - 1} products and quotients → ${termOf(qs, pick.e)}`, `in SI: ${fmt(si, 6)}, shown in ${s.unit}`], py: `${termOf(qs, pick.e).replace(/×/g, '*').replace(/÷/g, '/')}  # in ${s.unit}` };
  }
});

/* ── declared formulas, solvable for any term ───────────────── */
// vars: key → { label, unit (shown), lo, hi (the range searched for a root), offer?, words (what the term is called) }
// eq(v) → the residual, zero when the equation holds; show: the equation as written
export const FORMULAS = {
  tonnage: { title: 'Tonnage', words: ['tonnage formula', 'tonnage equation'], show: 'T = V · ρ', vars: { T: { label: 'tonnage', unit: 't', lo: 1e-6, hi: 1e15, words: ['tonnage', 'tonnes', 'mass'] }, V: { label: 'volume', unit: 'm³', lo: 1e-6, hi: 1e15, words: ['volume'] }, rho: { label: 'density', unit: 't/m³', lo: 0.1, hi: 25, words: ['density'] } }, eq: v => v.T - v.V * v.rho },
  metal: { title: 'Contained metal', words: ['contained metal', 'metal content'], show: 'M = T · g / 100', vars: { M: { label: 'metal', unit: 't', lo: 1e-9, hi: 1e12, words: ['metal', 'contained metal'] }, T: { label: 'tonnage', unit: 't', lo: 1e-6, hi: 1e15, words: ['tonnage', 'ore'] }, g: { label: 'grade', unit: '%', lo: 1e-9, hi: 100, words: ['grade'] } }, eq: v => v.M - v.T * v.g / 100 },
  strip: { title: 'Strip ratio', words: ['strip ratio', 'stripping ratio'], show: 'SR = W / O', vars: { SR: { label: 'strip ratio', unit: 't/t', lo: 1e-6, hi: 1e4, words: ['strip ratio', 'ratio'] }, W: { label: 'waste', unit: 't', lo: 1e-6, hi: 1e15, words: ['waste'] }, O: { label: 'ore', unit: 't', lo: 1e-6, hi: 1e15, words: ['ore'] } }, eq: v => v.SR * v.O - v.W },
  twoproduct: { title: 'Two-product recovery', words: ['two-product recovery', 'two product formula', 'two-product formula', 'recovery formula'], show: 'R = 100 · c (f − t) / (f (c − t))',
    vars: { R: { label: 'recovery', unit: '%', lo: 0, hi: 100, words: ['recovery'] }, f: { label: 'feed grade', unit: '%', lo: 1e-9, hi: 100, words: ['feed', 'feed grade', 'head grade'] }, c: { label: 'concentrate grade', unit: '%', lo: 1e-9, hi: 100, words: ['concentrate', 'concentrate grade'] }, t: { label: 'tail grade', unit: '%', lo: 0, hi: 100, words: ['tail', 'tails', 'tail grade', 'tailings grade'] } },
    eq: v => v.R * v.f * (v.c - v.t) - 100 * v.c * (v.f - v.t) },
  cutoff: { title: 'Break-even cutoff', words: ['break-even cutoff', 'breakeven cutoff', 'cutoff formula', 'cut-off formula'], show: 'g = 100 · (Cp + Cga) / (R/100 · (P − Cs))',
    vars: { g: { label: 'cutoff grade', unit: '% metal', lo: 1e-9, hi: 100, words: ['grade', 'cutoff', 'cutoff grade'] }, P: { label: 'metal price', unit: 'per t of metal', lo: 1e-6, hi: 1e9, words: ['price', 'metal price'] }, R: { label: 'recovery', unit: '%', lo: 1e-6, hi: 100, words: ['recovery'] }, Cp: { label: 'processing cost', unit: 'per t of ore', lo: 0, hi: 1e6, words: ['processing', 'processing cost'] }, Cga: { label: 'G&A cost', unit: 'per t of ore', lo: 0, hi: 1e6, offer: [{ label: '0 (none)', value: 0 }], words: ['g&a', 'overhead'] }, Cs: { label: 'selling cost', unit: 'per t of metal', lo: 0, hi: 1e9, offer: [{ label: '0 (none)', value: 0 }], words: ['selling cost'] } },
    eq: v => v.g * (v.R / 100) * (v.P - v.Cs) - 100 * (v.Cp + v.Cga) },
  lithostatic: { title: 'Lithostatic pressure', words: ['lithostatic pressure', 'overburden pressure'], show: 'P = ρ · g₀ · h / 1000  (g₀ = 9.80665 m/s²)', vars: { P: { label: 'pressure', unit: 'MPa', lo: 1e-9, hi: 1e6, words: ['pressure'] }, rho: { label: 'density', unit: 't/m³', lo: 0.1, hi: 25, offer: [{ label: '2.7 (average crust)', value: 2.7 }], words: ['density'] }, h: { label: 'depth', unit: 'm', lo: 1e-6, hi: 1e6, words: ['depth'] } }, eq: v => v.P - v.rho * 9.80665 * v.h / 1000 },
  darcy: { title: "Darcy's law", words: ["darcy's law", 'darcy law', 'darcy'], show: 'Q = K · A · i', vars: { Q: { label: 'flow', unit: 'm³/s', lo: 1e-15, hi: 1e6, words: ['flow', 'discharge'] }, K: { label: 'hydraulic conductivity', unit: 'm/s', lo: 1e-15, hi: 10, words: ['conductivity', 'hydraulic conductivity', 'k'] }, A: { label: 'area', unit: 'm²', lo: 1e-9, hi: 1e12, words: ['area'] }, i: { label: 'hydraulic gradient', unit: 'm/m', lo: 1e-9, hi: 100, words: ['gradient', 'hydraulic gradient'] } }, eq: v => v.Q - v.K * v.A * v.i },
  stokes: { title: 'Stokes settling', words: ['stokes settling', "stokes' law", 'stokes law', 'settling velocity'], show: 'v = (ρp − ρf) · g₀ · d² / (18 μ)',
    vars: { v: { label: 'settling velocity', unit: 'm/s', lo: 1e-15, hi: 100, words: ['velocity', 'settling velocity'] }, rp: { label: 'particle density', unit: 'kg/m³', lo: 1, hi: 25000, offer: [{ label: '2650 (quartz)', value: 2650 }], words: ['particle density'] }, rf: { label: 'fluid density', unit: 'kg/m³', lo: 0, hi: 25000, offer: [{ label: '1000 (water)', value: 1000 }], words: ['fluid density'] }, d: { label: 'grain diameter', unit: 'm', lo: 1e-9, hi: 1, words: ['diameter', 'grain size', 'grain diameter'] }, mu: { label: 'viscosity', unit: 'Pa·s', lo: 1e-9, hi: 1e6, offer: [{ label: '0.001 (water at 20 °C)', value: 0.001 }], words: ['viscosity'] } },
    eq: v => 18 * v.mu * v.v - (v.rp - v.rf) * 9.80665 * v.d * v.d }
};
// every root of eq in [lo, hi] for one term, the others fixed: a scan for sign changes (in log steps where the range spans
// decades), then bisection on each to 1e-12 relative
export function roots(F, key, known) {
  const r = F.vars[key], f = x => { try { return F.eq({ ...known, [key]: x }); } catch (e) { return NaN; } }, out = [];
  // a term with no range (a taught formula's): both signs, by decades from 1e-9 to 1e12, and zero
  const N = 2000, logs = r.lo > 0 && r.hi / r.lo > 1e3, mag = i => 1e-9 * Math.pow(1e21, i / N);
  const xs = r.lo == null ? [...Array.from({ length: N + 1 }, (_, i) => -mag(N - i)), 0, ...Array.from({ length: N + 1 }, (_, i) => mag(i))] : Array.from({ length: N + 1 }, (_, i) => logs ? r.lo * Math.pow(r.hi / r.lo, i / N) : r.lo + (r.hi - r.lo) * i / N);
  let x0 = xs[0], y0 = f(x0); if (y0 === 0) out.push(x0);
  for (let i = 1; i < xs.length; i++) {
    const x1 = xs[i], y1 = f(x1);
    if (y1 === 0) out.push(x1);
    else if (isFinite(y0) && isFinite(y1) && y0 !== 0 && Math.sign(y0) !== Math.sign(y1)) {
      let a = x0, b = x1, fa = y0; for (let k = 0; k < 200 && Math.abs(b - a) > 1e-12 * Math.max(1, Math.abs(a)); k++) { const m = (a + b) / 2, fm = f(m); if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
      out.push((a + b) / 2);
    }
    x0 = x1; y0 = y1;
  }
  return out.filter((x, i) => i === 0 || Math.abs(x - out[i - 1]) > 1e-9 * Math.max(1, Math.abs(x)));
}
// a declared formula, or one taught on this device (lore.js: S.formulas[name] = { result, expr, vars }): result = expr
export function formulaOf(name) {
  if (FORMULAS[name]) return FORMULAS[name];
  const u = S.formulas && S.formulas[name]; if (!u) return null;
  const vars = { [u.result]: { label: u.label || u.result.replace(/_/g, ' '), unit: '', words: [u.result.replace(/_/g, ' ')] } };
  for (const v of u.vars) vars[v] = { label: v.replace(/_/g, ' '), unit: '', words: [v.replace(/_/g, ' '), v] };
  return { title: name, taught: true, words: [name], show: `${u.result} = ${u.expr}`, vars, eq: x => x[u.result] - calc(u.expr, x) };
}
const allFormulas = () => ({ ...FORMULAS, ...Object.fromEntries(Object.keys(S.formulas || {}).map(k => [k, formulaOf(k)])) });
tool({
  name: 'formula',
  skill: { group: 'Compute', title: 'Formulas, solved for any term', on: 'declared equations · own root search', about: 'Tonnage, contained metal, strip ratio, the two-product recovery, break-even cutoff, lithostatic pressure, Darcy\'s law and Stokes settling, each solved for whichever term you leave out: the others are asked, and the root found by a search over the term\'s range. More than one root is said, not chosen.', examples: ['two-product recovery', 'solve the cutoff formula for price', 'stokes settling for diameter', 'what formulas do you know'] },
  topic: a => [formulaOf(a.formula) ? formulaOf(a.formula).title : 'Formula', 1],
  run: a => {
    const F = formulaOf(a.formula); if (!F) return { read: ['formula', { v: a.formula }], body: [{ t: 'note', kind: 'err', text: `There is no formula called ${a.formula} on this device any more.` }], trace: ['no such formula'] };
    const keys = Object.keys(F.vars), solve = keys.includes(a.solve) ? a.solve : keys[0];
    const read = [F.title, 'solved for', { v: F.vars[solve].label, key: 'solve', alts: keys, cur: solve }];
    const qs = keys.filter(k => k !== solve).map(k => ({ key: k, ask: numberAsk(`${F.vars[k].label[0].toUpperCase() + F.vars[k].label.slice(1)}${F.vars[k].unit ? ', ' + F.vars[k].unit : ''}?`, { offer: F.vars[k].offer || [], min: F.vars[k].lo, max: F.vars[k].hi }) }));
    const known = keys.filter(k => k !== solve && a[k] != null).map(k => [F.vars[k].label, `${fmt(a[k])} ${F.vars[k].unit}`]);
    const need = firstNeed(a, qs);
    if (need) return { read, body: [{ t: 'kv', rows: [['equation', F.show], ...known] }], ask: need, trace: ['blocked: a term is missing'] };
    const vals = Object.fromEntries(keys.filter(k => k !== solve).map(k => [k, a[k]])), rs = roots(F, solve, vals), V = F.vars[solve];
    if (!rs.length) return { read, body: [{ t: 'note', kind: 'err', text: `No ${V.label} between ${fmt(V.lo)} and ${fmt(V.hi)} ${V.unit} satisfies ${F.show} with these values.` }, { t: 'kv', rows: known }], trace: [`root search for ${solve} in [${V.lo}, ${V.hi}]: no sign change`] };
    const x = rs[0], check = F.eq({ ...vals, [solve]: x });
    return { read, value: x,
      body: [{ t: 'big', v: fmt(x, 6), unit: `${V.unit}, ${V.label}` }, ...(rs.length > 1 ? [{ t: 'note', kind: 'warn', text: `${rs.length} values satisfy the equation in range: ${rs.map(r => fmt(r, 6)).join(', ')}. The first is shown; I do not choose between them.` }] : []),
        { t: 'kv', rows: [['equation', F.show], ...known, ['check', `residual ${fmt(check, 3)} with ${V.label} = ${fmt(x, 8)}`]] }, { t: 'src', text: 'declared equation · root search: a scan for sign changes, then bisection' }],
      trace: [`${F.show}, unknown ${solve}`, `scan of [${V.lo}, ${V.hi}] in 2000 steps → ${rs.length} root${rs.length > 1 ? 's' : ''}`, `bisection → ${fmt(x, 10)}`], py: `scipy.optimize.brentq(lambda ${solve}: ${F.show.split('=')[1].trim()}, ...)  # ${F.title}` };
  }
});
tool({
  name: 'formulas',
  topic: () => ['Formulas', .5],
  run: () => ({ read: ['the formulas I can solve'], body: [{ t: 'kv', rows: Object.values(allFormulas()).map(F => [F.title + (F.taught ? ' (taught here)' : ''), `${F.show} · terms: ${Object.values(F.vars).map(v => v.label).join(', ')}`]) }, { t: 'chips', items: Object.values(allFormulas()).map(F => F.words[0]) }], trace: [`${Object.keys(FORMULAS).length} declared formulas, ${Object.keys(S.formulas || {}).length} taught on this device`] })
});

/* ── what reads them ─────────────────────────────────────────── */
// dimensional questions: the question word says the dimension; the request after it is free text whose quantities count
const DIMQ = [
  ['t', ['how long', 'how long to', 'how long does it take to', 'how long will it take to', 'how long would it take to', 'how much time', 'time to', 'time for'], ['quanto tempo', 'quanto tempo para', 'quanto tempo leva para', 'em quanto tempo']],
  ['L', ['how far', 'how deep', 'what distance', 'how far is'], ['qual a distância', 'quão longe', 'que distância']],
  ['M', ['how heavy', 'how heavy is', 'how much does', 'what mass', 'what tonnage', 'what is the tonnage of', 'how much ore', 'how much metal', 'how much copper', 'how much gold'], ['quanto pesa', 'qual a massa', 'qual a tonelagem', 'quanto metal']],
  ['V', ['what volume', 'how much volume', 'what is the volume of'], ['qual o volume', 'que volume']],
  [null, ['reckon', 'work out', 'how much', 'how many'], ['calcula', 'quanto', 'quantos']]
];
for (const [dim, words, words_pt] of DIMQ) frame({
  name: `reckon${dim || ''}`, label: 'Reckon', words, theme: ['text'], required: ['theme'], roles: {}, words_pt, label_pt: 'Calcular',
  bind: c => {
    let text = String(c.theme[0].value).trim(), into = null;
    const m = /\s+in\s+(\S+(?:\s+\S+)?)\s*\??$/i.exec(text); if (m && parseUnit(m[1]) && vecOf(parseUnit(m[1]).dim)) { into = m[1]; text = text.slice(0, m.index); }
    text = text.replace(/\?\s*$/, '').replace(/^(?:in|is|of|for|to|the)\s+/i, '').replace(/,\s*$/, '').trim();
    if (quantitiesOf(text).filter(q => q.unit).length < 1 || quantitiesOf(text).length < 2) return null;
    return { tool: 'reckon', args: { text, ...(dim ? { want: dim } : {}), ...(into ? { in: into } : {}) } };
  }
});
// formulas: "two-product recovery", "solve the cutoff formula for price", "stokes settling for diameter", "darcy's law"
const FORMULA_PT = { twoproduct: ['recuperação de dois produtos', 'fórmula de dois produtos'], tonnage: ['fórmula da tonelagem'], metal: ['metal contido'], strip: ['relação estéril-minério', 'razão de remoção'], cutoff: ['teor de corte de equilíbrio'], lithostatic: ['pressão litostática'], darcy: ['lei de darcy'], stokes: ['lei de stokes', 'velocidade de sedimentação'] };
noun(() => ({ type: 'formulaname', exact: true, words: Object.fromEntries(Object.entries(allFormulas()).map(([k, F]) => [k, F.words])), words_pt: { ...Object.fromEntries(Object.keys(S.formulas || {}).map(k => [k, [k]])), ...FORMULA_PT } }));
noun(() => { const words = {}; for (const F of Object.values(allFormulas())) for (const V of Object.values(F.vars)) for (const w of V.words) words[w] = [w]; return { type: 'formulavar', words }; });
noun({ type: 'formulalist', words: { all: ['what formulas do you know', 'which formulas do you know', 'the formulas', 'formulas'] }, words_pt: { all: ['quais fórmulas você conhece', 'as fórmulas', 'fórmulas'] } });
frame({
  name: 'formula', label: 'Formula', words: ['solve', 'solve the', 'use', 'use the', 'compute'], elidable: true, theme: ['formulaname'], required: ['theme'], roles: { for: { preps: ['for'], types: ['formulavar'] } },
  words_pt: ['resolve', 'usa'], label_pt: 'Fórmula',
  bind: c => { const f = c.theme[0].value, F = formulaOf(f); if (!F) return null; const w = c.roles.for && c.roles.for[0].value, key = w ? Object.keys(F.vars).find(k => F.vars[k].words.includes(w)) : null; if (w && !key) return null; return { tool: 'formula', args: { formula: f, ...(key ? { solve: key } : {}) } }; }
});
frame({
  name: 'formulas', label: 'Formulas', words: ['list', 'show'], elidable: true, theme: ['formulalist'], required: ['theme'], roles: {}, words_pt: ['lista', 'mostra'], label_pt: 'Fórmulas',
  bind: () => ({ tool: 'formulas', args: {} })
});

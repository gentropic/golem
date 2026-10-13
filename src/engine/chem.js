// Molar mass, conversion factors and element fractions from a parsed formula over the IUPAC weights;
// the periodic table lookup. No mineral names: the minerals pack is not here, so a formula is required.
import { tool, frame, noun, shape, postmod, fmt } from './core.js';
import { ELEMENTS, ELEMENTS_SOURCE } from './data/elements.js';
import { UNIT_TABLE } from './units.js';

const BY_SYMBOL = new Map(ELEMENTS.map(e => [e[1], e])), BY_NAME = new Map(ELEMENTS.map(e => [e[2], e])), BY_Z = new Map(ELEMENTS.map(e => [e[0], e]));
BY_NAME.set('aluminum', BY_SYMBOL.get('Al')); BY_NAME.set('sulphur', BY_SYMBOL.get('S')); BY_NAME.set('cesium', BY_SYMBOL.get('Cs'));
const SRC = { t: 'src', text: `${ELEMENTS_SOURCE} · src/engine/data/elements.js` };
// the common oxide for a reported element; two entries make a slot
const OXIDES = { Fe: ['Fe2O3', 'FeO'], Mn: ['MnO', 'MnO2'], Cu: ['CuO', 'Cu2O'], U: ['U3O8', 'UO2'], Si: ['SiO2'], Al: ['Al2O3'], Ca: ['CaO'], Mg: ['MgO'], Na: ['Na2O'], K: ['K2O'], P: ['P2O5'], Ti: ['TiO2'], Cr: ['Cr2O3'], Ni: ['NiO'], Zn: ['ZnO'], Pb: ['PbO'], Sn: ['SnO2'], W: ['WO3'], V: ['V2O5'], Co: ['CoO'], Li: ['Li2O'], Ba: ['BaO'], Sr: ['SrO'], Zr: ['ZrO2'], Nb: ['Nb2O5'], Ta: ['Ta2O5'], Th: ['ThO2'], Ce: ['CeO2'], S: ['SO3'], C: ['CO2'], Mo: ['MoO3'], Sb: ['Sb2O3'], As: ['As2O3'], Bi: ['Bi2O3'], Rb: ['Rb2O'], Cs: ['Cs2O'], Be: ['BeO'], B: ['B2O3'], Y: ['Y2O3'], La: ['La2O3'], Hf: ['HfO2'], Ga: ['Ga2O3'], Ge: ['GeO2'], Re: ['ReO2'] };

/* ── the formula parser: elements, counts (decimals allowed), brackets, hydrates ── */
// returns { counts: Map(symbol → n), text } or throws { bad: message }
export function parseFormula(src) {
  let s = src.trim().replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => '₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).replace(/\s+/g, '');
  if (!s) throw { bad: 'an empty formula' };
  // a lowercase formula gets its capitals back, two-letter symbols first; an upper-case one is taken as typed
  if (s === s.toLowerCase()) s = recase(s);
  const parts = s.split(/[·*]|\.(?=\d*H2O$)/), counts = new Map();
  const add = (m, k) => { for (const [el, n] of m) counts.set(el, (counts.get(el) || 0) + n * k); };
  for (const part of parts) {
    const m = /^(\d+(?:\.\d+)?)?(.+)$/.exec(part); if (!m) throw { bad: `an empty part in "${src}"` };
    add(group(m[2], src), m[1] ? +m[1] : 1);
  }
  return { counts, text: parts.join('·') };
}
function group(s, src) {
  let i = 0; const out = new Map(), add = (m, k) => { for (const [el, n] of m) out.set(el, (out.get(el) || 0) + n * k); };
  const num = () => { const m = /^\d+(?:\.\d+)?/.exec(s.slice(i)); if (!m) return 1; i += m[0].length; return +m[0]; };
  while (i < s.length) {
    const c = s[i];
    if (c === '(' || c === '[') { let depth = 1, j = i + 1; while (j < s.length && depth) { if (s[j] === '(' || s[j] === '[') depth++; else if (s[j] === ')' || s[j] === ']') depth--; j++; } if (depth) throw { bad: `a bracket that never closes in "${src}"` }; const inner = group(s.slice(i + 1, j - 1), src); i = j; add(inner, num()); continue; }
    const m = /^[A-Z][a-z]?/.exec(s.slice(i)); if (!m) throw { bad: `"${s.slice(i, i + 3)}" in "${src}": a symbol starts with a capital letter` };
    let sym = m[0]; if (!BY_SYMBOL.has(sym)) { sym = sym[0]; if (!BY_SYMBOL.has(sym) || m[0].length === 2) { if (BY_SYMBOL.has(sym)) { i += 1; add(new Map([[sym, 1]]), num()); continue; } throw { bad: `"${m[0]}" in "${src}" is not an element symbol` }; } }
    i += sym.length; add(new Map([[sym, 1]]), num());
  }
  return out;
}
function recase(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2), one = s[i];
    if (/^[a-z]{2}$/.test(two) && BY_SYMBOL.has(two[0].toUpperCase() + two[1])) { out += two[0].toUpperCase() + two[1]; i += 2; }
    else if (/^[a-z]$/.test(one)) { if (!BY_SYMBOL.has(one.toUpperCase())) throw { bad: `"${one}" is not an element symbol` }; out += one.toUpperCase(); i += 1; }
    else { out += one; i += 1; }
  }
  return out;
}
export function molarMass(counts) {
  const rows = []; let total = 0;
  for (const [sym, n] of counts) { const e = BY_SYMBOL.get(sym); if (e[3] == null) throw { bad: `${e[2]} (${sym}) has no standard atomic weight: it has no stable isotope` }; total += n * e[3]; rows.push({ sym, name: e[2], n, w: e[3], m: n * e[3] }); }
  return { total, rows };
}
const pretty = s => s.replace(/(\d+(?:\.\d+)?)/g, d => [...d].map(c => c === '.' ? '.' : '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''));
const elementOf = w => { const s = w.trim(); return BY_SYMBOL.get(s) || BY_SYMBOL.get(s[0].toUpperCase() + s.slice(1).toLowerCase()) || BY_NAME.get(s.toLowerCase()) || null; };
const sameCase = (text, q, m, i) => { const at = q.indexOf(m[i], m.index); return at < 0 ? m[i] : text.slice(at, at + m[i].length); };

tool({
  name: 'chem',
  skill: { group: 'Compute', title: 'Molar mass and conversion factors', on: 'IUPAC weights (data file)', about: 'Molar mass of a formula with the breakdown; element-to-oxide factors and the reverse; how much of an element a formula holds; the periodic table by symbol, name or number. A mineral name is not read: give the formula.', examples: ['molar mass of CuFeS2', 'fe to fe2o3', 'convert 45.2% fe2o3 to fe', 'how much cu in CuFeS2', 'atomic mass of fe', 'element 26'] },
  topic: a => [a.ask === 'element' ? 'Periodic table' : a.ask === 'mass' ? 'Molar mass' : 'Conversion factor', 1],
  run: a => {
    const refuse = (read, text, why) => ({ read, body: [{ t: 'note', kind: 'err', text }, SRC], trace: [why] });
    const formulaOf = s => { const e = elementOf(s); return e && /^[A-Za-z]+$/.test(s) && (s.length > 2 || BY_NAME.has(s.toLowerCase())) ? e[1] : s; };
    if (a.ask === 'element') {
      const e = /^\d+$/.test(a.which) ? BY_Z.get(+a.which) : elementOf(a.which);
      if (!e) return refuse(['element', { v: a.which }], `No element called "${a.which}".`, 'no such element');
      return { read: ['element', { v: e[2] }], value: e[3], body: [{ t: 'big', v: e[3] == null ? '—' : fmt(e[3], 5), unit: e[3] == null ? 'no standard atomic weight' : 'g/mol, standard atomic weight' }, { t: 'kv', rows: [['symbol', e[1]], ['atomic number', String(e[0])], ['name', e[2]], ...(e[3] == null ? [['longest-lived isotope', `mass number ${e[4]}: not a weight, and not used as one`]] : [])] }, SRC], trace: [`elements[${e[0]}] → ${e[1]}`], py: `periodictable.${e[1]}.mass` };
    }
    if (a.ask === 'mass') {
      let f; try { f = parseFormula(a.formula); } catch (e) { return refuse(['molar mass of', { v: a.formula }], `I cannot read ${e.bad}.`, 'formula: rejected'); }
      let mm; try { mm = molarMass(f.counts); } catch (e) { return refuse(['molar mass of', { v: pretty(f.text) }], `${e.bad}.`, 'no weight'); }
      return { read: ['molar mass of', { v: pretty(f.text) }], value: mm.total, copy: fmt(mm.total, 6), body: [{ t: 'big', v: fmt(mm.total, 6), unit: 'g/mol' }, { t: 'table', head: ['Element', 'Count', 'Atomic weight', 'Contribution', 'Mass %'], num: [1, 2, 3, 4], rows: mm.rows.map(r => [`${r.sym} ${r.name}`, fmt(r.n), fmt(r.w, 5), fmt(r.m, 6), fmt(r.m / mm.total * 100, 4)]) }, ...(a.formula === a.formula.toLowerCase() && /[a-z]/.test(a.formula) ? [{ t: 'note', text: `Read "${a.formula}" as ${pretty(f.text)}, two-letter symbols first. Type the capitals if another reading was meant.` }] : []), SRC], trace: [`parse "${a.formula}" → ${[...f.counts].map(([k, v]) => k + ':' + v).join(' ')}`, ...mm.rows.map(r => `${r.n} × ${r.w} = ${fmt(r.m, 6)}`), `Σ = ${fmt(mm.total, 6)} g/mol`], py: `chem.mass("${f.text}")` };
    }
    if (a.ask === 'fraction') {
      const e = elementOf(a.element); if (!e) return refuse(['fraction of', { v: a.element }], `No element called "${a.element}".`, 'no such element');
      let f; try { f = parseFormula(a.formula); } catch (x) { return refuse(['fraction of', { v: e[1] }, 'in', { v: a.formula }], `I cannot read ${x.bad}. If that is a mineral name, give its formula: the minerals pack is not in golem yet.`, 'formula: rejected'); }
      let mm; try { mm = molarMass(f.counts); } catch (x) { return refuse(['fraction of', { v: e[1] }, 'in', { v: pretty(f.text) }], `${x.bad}.`, 'no weight'); }
      const r = mm.rows.find(x => x.sym === e[1]); if (!r) return refuse(['fraction of', { v: e[1] }, 'in', { v: pretty(f.text) }], `${pretty(f.text)} has no ${e[2]} in it.`, 'element absent');
      const frac = r.m / mm.total;
      return { read: ['fraction of', { v: e[1] }, 'in', { v: pretty(f.text) }], value: frac, body: [{ t: 'big', v: fmt(frac * 100, 4), unit: `% ${e[2]} by mass` }, { t: 'kv', rows: [['formula mass', `${fmt(mm.total, 6)} g/mol`], [`${e[1]} in it`, `${fmt(r.n)} × ${fmt(r.w, 5)} = ${fmt(r.m, 6)} g/mol`], ['as g/t', `${fmt(frac * 1e6, 5)} g/t of ${e[1]} in pure ${pretty(f.text)}`]] }, SRC], trace: [`parse "${a.formula}"`, `${fmt(r.m, 6)} ÷ ${fmt(mm.total, 6)} = ${fmt(frac, 6)}`], py: `chem.fraction("${e[1]}", "${f.text}")` };
    }
    // factor: M(to) × n_from(in from) / (M(from) × n_shared(in to)), for the element the two share
    const fromF = formulaOf(a.from), fromE = elementOf(a.from);
    let to = a.to, slot = null;
    if (to === 'oxide') {
      const e = fromE; if (!e) return refuse(['factor', { v: a.from }, 'to oxide'], `"${a.from}" is not an element, so there is no oxide to pick.`, 'no element');
      const ox = OXIDES[e[1]]; if (!ox) return refuse(['factor', { v: e[1] }, 'to oxide'], `I have no common oxide listed for ${e[2]}. Name it: "${e[1].toLowerCase()} to ${e[1]}O".`, 'no oxide listed');
      to = ox[0]; slot = { v: to, key: 'to', alts: ox, cur: to };
    } else if (fromE && OXIDES[fromE[1]] && OXIDES[fromE[1]].length > 1 && OXIDES[fromE[1]].includes(formulaOf(to))) slot = { v: formulaOf(to), key: 'to', alts: OXIDES[fromE[1]], cur: formulaOf(to) };
    const toF = formulaOf(to);
    let pf, pt; try { pf = parseFormula(fromF); pt = parseFormula(toF); } catch (e) { return refuse(['factor', { v: a.from }, 'to', { v: to }], `I cannot read ${e.bad}.`, 'formula: rejected'); }
    const shared = [...pf.counts.keys()].filter(k => pt.counts.has(k));
    if (!shared.length) return refuse(['factor', { v: pretty(pf.text) }, 'to', { v: pretty(pt.text) }], `${pretty(pf.text)} and ${pretty(pt.text)} share no element, so no factor converts one to the other.`, 'no shared element');
    if (shared.length > 1 && !(pf.counts.size === 1)) return refuse(['factor', { v: pretty(pf.text) }, 'to', { v: pretty(pt.text) }], `${pretty(pf.text)} and ${pretty(pt.text)} share ${shared.join(', ')}; say which element the factor is for, as "fraction of X in …".`, 'ambiguous');
    const el = shared[0];
    let mf, mt; try { mf = molarMass(pf.counts); mt = molarMass(pt.counts); } catch (e) { return refuse(['factor', { v: pretty(pf.text) }, 'to', { v: pretty(pt.text) }], `${e.bad}.`, 'no weight'); }
    const factor = (mt.total / pt.counts.get(el)) / (mf.total / pf.counts.get(el));
    const read = ['factor', { v: pretty(pf.text) }, 'to', slot || { v: pretty(pt.text) }];
    const rows = [['factor', `${fmt(factor, 5)}: ${pretty(pt.text)} = ${pretty(pf.text)} × ${fmt(factor, 5)}`], ['reverse', `${fmt(1 / factor, 5)}: ${pretty(pf.text)} = ${pretty(pt.text)} × ${fmt(1 / factor, 5)}`], ['by', `M(${pretty(pt.text)}) ÷ ${fmt(pt.counts.get(el))} ${el} = ${fmt(mt.total / pt.counts.get(el), 6)}; M(${pretty(pf.text)}) ÷ ${fmt(pf.counts.get(el))} ${el} = ${fmt(mf.total / pf.counts.get(el), 6)}`]];
    if (a.value != null) { const u = a.unit || ''; read.unshift({ v: `${fmt(a.value)} ${u}`.trim() }); return { read, value: a.value * factor, body: [{ t: 'big', v: fmt(a.value * factor, 5), unit: `${u} ${pretty(pt.text)}`.trim() }, { t: 'kv', rows }, SRC], trace: [`factor ${pretty(pf.text)} → ${pretty(pt.text)} = ${fmt(factor, 6)}`, `${a.value} × ${fmt(factor, 6)} = ${fmt(a.value * factor, 6)}`], py: `${a.value} * chem.factor("${pf.text}", "${pt.text}")` }; }
    return { read, value: factor, copy: fmt(factor, 5), body: [{ t: 'big', v: fmt(factor, 5), unit: `× ${pretty(pf.text)} gives ${pretty(pt.text)}` }, { t: 'kv', rows }, SRC], trace: [`M(${pt.text}) = ${fmt(mt.total, 6)}, M(${pf.text}) = ${fmt(mf.total, 6)}`, `shared element ${el}: ${pf.counts.get(el)} in ${pf.text}, ${pt.counts.get(el)} in ${pt.text}`, `factor = ${fmt(factor, 6)}`], py: `chem.factor("${pf.text}", "${pt.text}")` };
  }
});
/* ── what reads it: formulas as typed ("CuFeS2", "fe2o3"), elements by symbol or name, "element 26" ── */
// as typed, with capitals: CuFeS2, NaCl, Fe2O3, Ca(OH)2, CuSO4·5H2O, Fe0.9S (parseFormula checks it when bound)
shape({ type: 'formula', re: String.raw`(?=[^a-z]*[A-Z][^A-Z]*[A-Z0-9])[A-Z(][A-Za-z0-9().·]*[A-Za-z0-9)]`, flags: '' });
// lowercase: only runs of real element symbols with counts, so an unknown word is not a formula: fe2o3, cuo, h2o
const SYMS = ELEMENTS.map(e => e[1].toLowerCase()).sort((a, b) => b.length - a.length).join('|');
// with a count, or short (cuo, nacl): longer plain words spelled in symbols ("python" is P Y Th O N) stay words
shape({ type: 'formula', re: `(?=[a-z.]*\\d|[a-z]{2,4}(?![a-z\\d]))(?:(?:${SYMS})\\d*(?:\\.\\d+)?){2,}` });
// symbols that are English words (in, as, at, no, be, he, so) and single letters stay out; the names cover them
// and symbols that are units (cm, mg, pa, cd, pt, ga): "9 cm" is a length, not curium
const PLAIN = new Set(['in', 'as', 'at', 'no', 'be', 'he', 'so', 'is', 'am', 'pm', 'or', 'es', 'md', 'ga', ...UNIT_TABLE.flatMap(u => u.words.map(w => w.toLowerCase()))]);
noun({ type: 'element', words: Object.fromEntries(ELEMENTS.map(e => [e[1], [e[2], ...(e[1].length > 1 && !PLAIN.has(e[1].toLowerCase()) ? [e[1].toLowerCase()] : [])]])),
  words_pt: Object.fromEntries(ELEMENTS.map(e => [e[1], [e[2], ...(e[1].length > 1 && !PLAIN.has(e[1].toLowerCase()) ? [e[1].toLowerCase()] : [])]])) });
noun({ type: 'chemword', words: { mass: ['molar mass', 'molecular mass', 'molecular weight', 'formula weight', 'formula mass'], atomicmass: ['atomic mass', 'atomic weight'], number: ['atomic number'], element: ['element', 'element number', 'the element'], oxide: ['oxide', 'its oxide'] },
  words_pt: { mass: ['massa molar', 'peso molecular'], atomicmass: ['massa atômica', 'massa atomica'], number: ['número atômico', 'numero atomico'], element: ['elemento'], oxide: ['óxido', 'oxido'] } });
postmod({ prep: '', heads: ['chemword'], attr: 'n', quantity: true });   // "element 26"
const CHEM = ['formula', 'element'];
const chemOf = n => n.type === 'element' ? n.value : n.type === 'formula' ? n.value : null;
// "molar mass of CuFeS2", "atomic mass of fe", "atomic number of iron", "element 26", "what element is 26"
frame({
  name: 'chemfact', label: 'Chemistry', words: ['what element is', 'which element is'], elidable: true, theme: ['chemword', 'quantity:bare'], required: [],
  roles: { of: { preps: ['of', 'for'], types: CHEM } }, label_pt: 'Química',
  bind: c => {
    const w = c.theme.find(t => t.type === 'chemword'), n = c.theme.find(t => t.type === 'quantity'), of = c.roles.of && c.roles.of[0];
    if (w && w.value === 'mass' && of) return { tool: 'chem', args: { ask: 'mass', formula: chemOf(of) } };
    if (w && (w.value === 'atomicmass' || w.value === 'number') && of && of.type === 'element') return { tool: 'chem', args: { ask: 'element', which: of.value } };
    const z = (w && w.value === 'element' && w.attrs.n) || (!w && n); if (z && Number.isInteger(z.n) && z.n >= 1 && z.n <= 118 && !of) return { tool: 'chem', args: { ask: 'element', which: String(z.n) } };
    return null;
  }
});
// "how much cu in CuFeS2", "what fraction of fe is in fe2o3"
frame({
  name: 'chemfrac', label: 'Fraction', words: ['how much', 'what fraction of', 'fraction of', 'percent of', '% of', 'how much of'], theme: ['element'], required: ['theme', 'in'],
  roles: { in: { preps: ['in', 'of'], types: ['formula', 'text'] } }, words_pt: ['quanto', 'quanto de', 'fração de'], label_pt: 'Fração',   // text: a mineral name reaches the tool, which says where minerals live
  bind: c => ({ tool: 'chem', args: { ask: 'fraction', element: c.theme[0].value.toLowerCase(), formula: c.roles.in[0].value } })
});
// "convert 45.2% fe2o3 to fe", "fe to fe2o3", "factor from cu to cuo", "fe to oxide"
frame({
  name: 'chemfactor', label: 'Conversion factor', words: ['convert', 'factor', 'conversion factor', 'factor from'], elidable: true, theme: ['quantity:*', 'quantity:bare', 'formula', 'element'], required: ['to'],
  roles: { of: { preps: ['', 'of'], types: CHEM }, to: { preps: ['to', 'as', 'into', 'in'], types: [...CHEM, 'chemword'] } }, label_pt: 'Fator de conversão',
  bind: c => {
    const th = c.theme[0], to = c.roles.to[0], from = c.roles.of ? c.roles.of[0] : th && th.type !== 'quantity' ? th : null;
    if (!from || (to.type === 'chemword' && to.value !== 'oxide')) return null;
    const q = th && th.type === 'quantity' ? th : null, toV = to.type === 'chemword' ? 'oxide' : chemOf(to);
    return { tool: 'chem', args: { ask: 'factor', ...(q ? { value: q.n, unit: q.unit } : {}), from: chemOf(from), to: toV } };
  }
});

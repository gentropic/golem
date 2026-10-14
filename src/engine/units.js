// Unit conversion with dimension checks. The factors are @gcu/units' (exact where a definition makes them so, since
// 14 Oct 2026); golem keeps the words people type for each unit and composes "oz per short ton" from two of them.
// Mass is in kilograms here (the package's grams ÷ 1000), so a pressure stays kg / (m·s²) in the estimator.
import { unit, tool, frame, fmt } from './core.js';
import { UNITS } from '../vendor/units.js';

export const U = {};
export const UNIT_TABLE = [];
const BASE = { M: 1e-3 };   // golem's base over the package's, by dimension
const u = (dim, key, ...n) => { const p = UNITS[key]; if (!p) throw new Error(`@gcu/units has no ${key}`); const f = p.mul * (BASE[dim] || 1), off = p.off;
  UNIT_TABLE.push({ dim, f, ...(off != null ? { off } : {}), name: n[0], words: n }); n.forEach(k => { U[k] = { dim, f, ...(off != null ? { off } : {}), name: n[0] }; }); };
u('L', 'm', 'm', 'meter', 'metre'); u('L', 'km', 'km', 'kilometer', 'kilometre'); u('L', 'cm', 'cm'); u('L', 'mm', 'mm');
u('L', 'ft', 'ft', 'foot', 'feet'); u('L', 'in', 'inch', 'inches', '"'); u('L', 'mi', 'mi', 'mile'); u('L', 'yd', 'yd', 'yard');
u('M', 'g', 'g', 'gram'); u('M', 'kg', 'kg', 'kilogram'); u('M', 't', 't', 'tonne', 'metric ton'); u('M', 'lb', 'lb', 'lbs', 'pound');
u('M', 'ozt', 'troy oz', 'ozt', 'troy ounce'); u('M', 'oz', 'oz (av)', 'avoirdupois oz');
u('M', 'st', 'short ton', 'st', 'ton'); u('M', 'lt_mass', 'long ton'); u('M', 'ct', 'ct', 'carat');
u('R', 'g/t', 'g/t', 'gpt'); u('R', 'ppm', 'ppm'); u('R', 'ppb', 'ppb'); u('R', 'pct', '%', 'percent', 'pct');
u('A', 'm2', 'm²', 'm2'); u('A', 'km2', 'km²', 'km2', 'sq km', 'square kilometer', 'square km'); u('A', 'ha', 'ha', 'hectare');
u('A', 'acre', 'acre'); u('A', 'mi2', 'sq mi', 'square mile', 'mi2', 'mi²');
u('V', 'L', 'L', 'l', 'liter', 'litre'); u('V', 'm3', 'm³', 'm3', 'cubic meter'); u('V', 'cm3', 'cm³', 'cm3', 'cc');
u('V', 'ft3', 'ft³', 'ft3', 'cubic foot', 'cubic feet'); u('V', 'gal', 'gal', 'gallon'); u('V', 'bbl', 'bbl', 'barrel');
u('P', 'Pa', 'Pa', 'pa'); u('P', 'kPa', 'kPa', 'kpa'); u('P', 'MPa', 'MPa', 'mpa'); u('P', 'psi', 'psi'); u('P', 'bar', 'bar');
u('t', 's', 's', 'sec', 'second'); u('t', 'min', 'min', 'minute'); u('t', 'h', 'h', 'hr', 'hour'); u('t', 'day', 'day');
u('T', 'C', '°C', 'c', '°c', 'celsius'); u('T', 'F', '°F', 'f', '°f', 'fahrenheit'); u('T', 'K', 'K', 'k', 'kelvin');
export const DIM = { L: 'length', M: 'mass', R: 'mass ratio', T: 'temperature', A: 'area', V: 'volume', P: 'pressure', t: 'time' };
// compound units the parser should know as single words (parseUnit composes them from the table)
export const COMPOUNDS = ['g/cm3', 'g/cc', 'lb/ft3', 'oz per short ton', 'oz/t', 'troy oz per short ton', 't/m3', 'kg/m3'];
const byName = new Map(UNIT_TABLE.map(x => [x.name, U[x.words[0]]]));

function unit1(s, oz) {
  s = s.trim();
  if (/^(oz|ounces?)$/.test(s)) return { ...U[oz === 'av' ? 'oz (av)' : 'troy oz'], amb: true };
  return U[s] || byName.get(s) || U[s.replace(/s$/, '')] || null;
}
export function parseUnit(s, oz) {
  s = s.trim().replace(/\s+/g, ' ');
  const one = unit1(s, oz);
  if (one) return { dim: one.dim, f: one.f, off: one.off || 0, name: one.name, amb: one.amb };
  const m = s.match(/^(.+?)\s*(?: per |\/)\s*(.+)$/);
  if (!m) return null;
  const a = unit1(m[1], oz), b = unit1(m[2], oz);
  if (!a || !b || a.dim === 'T' || b.dim === 'T') return null;
  return { dim: a.dim === 'M' && b.dim === 'M' ? 'R' : a.dim + '/' + b.dim, f: a.f / b.f, off: 0, name: a.name + ' / ' + b.name, amb: a.amb || b.amb };
}
export const dimName = d => DIM[d] || d.split('/').map(x => DIM[x] || x).join(' per ');

tool({
  name: 'convert',
  skill: { group: 'Compute', title: 'Unit conversion', on: '@gcu/units', about: 'Grades, lengths, masses, areas, pressures, temperatures. Refuses mismatched dimensions.', examples: ['0.35 oz per short ton in g/t', '2.7 g/cm3 in lb/ft3', '1500 psi in mpa', '5 km in kg'] },
  topic: a => [a.from + ' → ' + a.to, 1],
  run: a => {
    const oz = a.oz || (/ per |\//.test(a.from) ? 'troy' : 'av');
    const f = parseUnit(a.from, oz), t = parseUnit(a.to, oz);
    if (!f || !t) return null;
    const read = ['convert', { v: fmt(a.v) }, { v: f.name }, 'to', { v: t.name }];
    if (f.amb || t.amb) read.push({ v: 'oz = ' + (oz === 'troy' ? 'troy' : 'avoirdupois'), key: 'oz', alts: ['troy', 'av'], cur: oz });
    if (f.dim !== t.dim) return { read, body: [{ t: 'note', kind: 'err', text: `${f.name} is a ${dimName(f.dim)} and ${t.name} is a ${dimName(t.dim)}. No conversion exists between them.` }], trace: ['units: dimension check failed'] };
    const out = (a.v + f.off) * f.f / t.f - t.off;
    return {
      read, value: out,
      body: [{ t: 'big', v: fmt(out), unit: t.name }, { t: 'src', text: `@gcu/units · vendored · exact factors · dimension: ${dimName(f.dim)}` }],
      trace: [`units.parse("${a.from}") → ${dimName(f.dim)}, factor ${fmt(f.f, 9)}`, `units.parse("${a.to}") → factor ${fmt(t.f, 9)}`, `${fmt(a.v)} × ${fmt(f.f, 9)} ÷ ${fmt(t.f, 9)} = ${fmt(out, 9)}`],
      py: `units.convert(${a.v}, "${f.name}", "${t.name}")`
    };
  }
});
frame({
  name: 'convert', label: 'Convert', words: ['convert', 'change', 'express', 'put', 'how many', 'how much'], elidable: true,
  theme: ['quantity:*'], required: ['theme', 'unit'], roles: { unit: { preps: ['in', 'to', 'as', 'into'], types: ['unit'] } },
  words_pt: ['converter', 'converte', 'converta', 'passar', 'passa'], label_pt: 'Converter',
  bind: c => { const q = c.theme[0], to = c.roles.unit && c.roles.unit[0]; return q && q.type === 'quantity' && to && q.unit !== 'mesh' && to.unit !== 'mesh' ? { tool: 'convert', args: { v: q.n, from: q.unit, to: to.unit } } : null; }
});
// long forms the conversion table does not list but parseUnit knows
for (const [u, dim, words] of [['yd', 'length', ['yard', 'yards']], ['in', 'length', ['inch', 'inches']], ['ft', 'length', ['foot']], ['mi', 'length', ['mile']], ['m', 'length', ['metre', 'meter', 'meters']], ['km', 'length', ['kilometre', 'kilometres', 'kilometer', 'kilometers']]]) unit({ unit: u, dim, words });

// Unit conversion with dimension checks. A small table until @gcu/units stands under it.
import { tool, frame, fmt } from './core.js';

export const U = {};
export const UNIT_TABLE = [];
const u = (dim, f, ...n) => { UNIT_TABLE.push({ dim, f, name: n[0], words: n }); n.forEach(k => { U[k] = { dim, f, name: n[0] }; }); };
u('L', 1, 'm', 'meter', 'metre'); u('L', 1000, 'km', 'kilometer', 'kilometre'); u('L', .01, 'cm'); u('L', .001, 'mm');
u('L', .3048, 'ft', 'foot', 'feet'); u('L', .0254, 'inch', 'inches', '"'); u('L', 1609.344, 'mi', 'mile'); u('L', .9144, 'yd', 'yard');
u('M', 1e-3, 'g', 'gram'); u('M', 1, 'kg', 'kilogram'); u('M', 1000, 't', 'tonne', 'metric ton'); u('M', .45359237, 'lb', 'lbs', 'pound');
u('M', .0311034768, 'troy oz', 'ozt', 'troy ounce'); u('M', .028349523125, 'oz (av)', 'avoirdupois oz');
u('M', 907.18474, 'short ton', 'st', 'ton'); u('M', 1016.0469088, 'long ton'); u('M', 2e-4, 'ct', 'carat');
u('R', 1e-6, 'g/t', 'gpt'); u('R', 1e-6, 'ppm'); u('R', 1e-9, 'ppb'); u('R', .01, '%', 'percent', 'pct');
u('A', 1, 'm²', 'm2'); u('A', 1e6, 'km²', 'km2', 'sq km', 'square kilometer', 'square km'); u('A', 1e4, 'ha', 'hectare');
u('A', 4046.8564224, 'acre'); u('A', 2589988.110336, 'sq mi', 'square mile', 'mi2', 'mi²');
u('V', 1e-3, 'L', 'l', 'liter', 'litre'); u('V', 1, 'm³', 'm3', 'cubic meter'); u('V', 1e-6, 'cm³', 'cm3', 'cc');
u('V', .028316846592, 'ft³', 'ft3', 'cubic foot', 'cubic feet'); u('V', .003785411784, 'gal', 'gallon'); u('V', .158987294928, 'bbl', 'barrel');
u('P', 1, 'Pa', 'pa'); u('P', 1e3, 'kPa', 'kpa'); u('P', 1e6, 'MPa', 'mpa'); u('P', 6894.757293168, 'psi'); u('P', 1e5, 'bar');
u('t', 1, 's', 'sec', 'second'); u('t', 60, 'min', 'minute'); u('t', 3600, 'h', 'hr', 'hour'); u('t', 86400, 'day');
[['°C', 1, 273.15, 'c', '°c', 'celsius'], ['°F', 5 / 9, 459.67, 'f', '°f', 'fahrenheit'], ['K', 1, 0, 'k', 'kelvin']]
  .forEach(([name, f, off, ...n]) => { UNIT_TABLE.push({ dim: 'T', f, off, name, words: n }); n.forEach(k => { U[k] = { dim: 'T', f, off, name }; }); });
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
  name: 'convert', rank: 100,
  skill: { group: 'Compute', title: 'Unit conversion', on: '@gcu/units', about: 'Grades, lengths, masses, areas, pressures, temperatures. Refuses mismatched dimensions.', examples: ['0.35 oz per short ton in g/t', '2.7 g/cm3 in lb/ft3', '1500 psi in mpa', '5 km in kg'] },
  read: (text, q) => { const m = /^(?:convert )?(-?[\d.,]*\d) ?(.+?) (?:in|to|as|into) (.+)$/.exec(q); return m ? { v: parseFloat(m[1].replace(/,/g, '')), from: m[2], to: m[3] } : null; },
  amend: [{ arg: 'to', match: /^(?:and |now |same (?:but )?)?(?:in|to|as) (.+)$/ }],
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
      body: [{ t: 'big', v: fmt(out), unit: t.name }, { t: 'src', text: `@gcu/units · exact factors · dimension: ${dimName(f.dim)}` }],
      trace: [`units.parse("${a.from}") → ${dimName(f.dim)}, factor ${fmt(f.f, 9)}`, `units.parse("${a.to}") → factor ${fmt(t.f, 9)}`, `${fmt(a.v)} × ${fmt(f.f, 9)} ÷ ${fmt(t.f, 9)} = ${fmt(out, 9)}`],
      py: `units.convert(${a.v}, "${f.name}", "${t.name}")`
    };
  }
});
frame({
  name: 'convert', label: 'Convert', words: ['convert', 'change'], elidable: true,
  theme: ['quantity:*'], required: ['theme', 'unit'], roles: { unit: { preps: ['in', 'to', 'as', 'into'], types: ['unit'] } },
  words_pt: ['converter', 'converte', 'converta', 'passar', 'passa'], label_pt: 'Converter',
  bind: c => { const q = c.theme[0], to = c.roles.unit && c.roles.unit[0]; return q && q.type === 'quantity' && to && q.unit !== 'mesh' && to.unit !== 'mesh' ? { tool: 'convert', args: { v: q.n, from: q.unit, to: to.unit } } : null; }
});

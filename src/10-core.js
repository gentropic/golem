'use strict';
/* ── utilities ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, sig = 6) => {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e12)) return x.toExponential(4);
  return Number(x.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: 8 });
};
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const T = {};   // tools: (args, card) => result | null

/* ── units ─────────────────────────────────────────────────── */
const U = {};
const u = (dim, f, ...n) => n.forEach(k => { U[k] = { dim, f, name: n[0] }; });
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
  .forEach(([name, f, off, ...n]) => n.forEach(k => { U[k] = { dim: 'T', f, off, name }; }));
const DIM = { L: 'length', M: 'mass', R: 'mass ratio', T: 'temperature', A: 'area', V: 'volume', P: 'pressure', t: 'time' };

function unit1(s, oz) {
  s = s.trim();
  if (/^(oz|ounces?)$/.test(s)) return { ...U[oz === 'av' ? 'oz (av)' : 'troy oz'], amb: true };
  return U[s] || U[s.replace(/s$/, '')] || null;
}
function parseUnit(s, oz) {
  s = s.trim().replace(/\s+/g, ' ');
  const one = unit1(s, oz);
  if (one) return { dim: one.dim, f: one.f, off: one.off || 0, name: one.name, amb: one.amb };
  const m = s.match(/^(.+?)\s*(?: per |\/)\s*(.+)$/);
  if (!m) return null;
  const a = unit1(m[1], oz), b = unit1(m[2], oz);
  if (!a || !b || a.dim === 'T' || b.dim === 'T') return null;
  return { dim: a.dim === 'M' && b.dim === 'M' ? 'R' : a.dim + '/' + b.dim, f: a.f / b.f, off: 0, name: a.name + ' / ' + b.name, amb: a.amb || b.amb };
}
const dimName = d => DIM[d] || d.split('/').map(x => DIM[x] || x).join(' per ');

T.convert = a => {
  const oz = a.oz || (/ per |\//.test(a.from) ? 'troy' : 'av');
  const f = parseUnit(a.from, oz), t = parseUnit(a.to, oz);
  if (!f || !t) return null;
  const read = ['convert', { v: fmt(a.v) }, { v: f.name }, 'to', { v: t.name }];
  if (f.amb || t.amb) read.push({ v: 'oz = ' + (oz === 'troy' ? 'troy' : 'avoirdupois'), key: 'oz', alts: ['troy', 'av'], cur: oz });
  if (f.dim !== t.dim) return { read, html: `<div class="note err">${esc(f.name)} is a ${dimName(f.dim)} and ${esc(t.name)} is a ${dimName(t.dim)}. No conversion exists between them.</div>`, trace: ['units: dimension check failed'] };
  const out = (a.v + f.off) * f.f / t.f - t.off;
  return {
    read, value: out, amend: 'unit',
    html: `<div class="big">${fmt(out)} <small>${esc(t.name)}</small></div><div class="src">@gcu/units · exact factors · dimension: ${dimName(f.dim)}</div>`,
    trace: [`units.parse("${a.from}") → ${dimName(f.dim)}, factor ${fmt(f.f, 9)}`, `units.parse("${a.to}") → factor ${fmt(t.f, 9)}`, `${fmt(a.v)} × ${fmt(f.f, 9)} ÷ ${fmt(t.f, 9)} = ${fmt(out, 9)}`],
    py: `units.convert(${a.v}, "${f.name}", "${t.name}")`
  };
};

/* ── arithmetic: recursive descent, no eval ────────────────── */
const FN = { sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, sin: x => Math.sin(rad(x)), cos: x => Math.cos(rad(x)), tan: x => Math.tan(rad(x)), asin: x => deg(Math.asin(x)), acos: x => deg(Math.acos(x)), atan: x => deg(Math.atan(x)) };
function calc(src) {
  const s = src.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
  let i = 0;
  const pk = () => s[i];
  const paren = () => { i++; const v = expr(); if (pk() !== ')') throw 0; i++; return v; };
  function atom() {
    if (pk() === '(') return paren();
    if (pk() === '-') { i++; return -pow(); }
    const w = /^[a-z]+/.exec(s.slice(i));
    if (w) {
      i += w[0].length;
      if (w[0] === 'pi') return Math.PI;
      if (w[0] === 'e') return Math.E;
      if (!FN[w[0]] || pk() !== '(') throw 0;
      return FN[w[0]](paren());
    }
    const n = /^\d*\.?\d+(e[-+]?\d+)?/.exec(s.slice(i));
    if (!n) throw 0;
    i += n[0].length; return parseFloat(n[0]);
  }
  function pow() { const b = atom(); if (pk() === '^') { i++; return Math.pow(b, pow()); } return b; }
  function term() { let v = pow(); while (pk() === '*' || pk() === '/') { const o = s[i++], r = pow(); v = o === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (pk() === '+' || pk() === '-') { const o = s[i++], r = term(); v = o === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (i < s.length) throw 0;
  return v;
}
T.calc = a => {
  let v; try { v = calc(a.x); } catch (e) { return null; }
  if (typeof v !== 'number' || isNaN(v)) return null;
  return { read: ['evaluate', { v: a.x }, 'trig in degrees'], value: v, html: `<div class="big">${fmt(v, 10)}</div>`, trace: [`expr.parse("${a.x}")`, `evaluate → ${v}`], py: a.x.replace(/\^/g, '**') };
};

/* ── dates ─────────────────────────────────────────────────── */
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONRE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const DOWRE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)';
const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtDate = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
function findDate(s) {
  const now = day0(new Date());
  const add = n => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const md = (d, mo, y) => { let dt = new Date(y ? +y : now.getFullYear(), mo, d); if (!y && dt < now) dt = new Date(now.getFullYear() + 1, mo, d); return dt; };
  const mi = w => MON.indexOf(w.slice(0, 3));
  let m;
  if ((m = /\b(\d{4})-(\d\d)-(\d\d)\b/.exec(s))) return { d: new Date(+m[1], m[2] - 1, +m[3]), m };
  if ((m = new RegExp('\\b(?:on )?(?:the )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?' + MONRE + '(?: (\\d{4}))?\\b').exec(s))) return { d: md(+m[1], mi(m[2]), m[3]), m };
  if ((m = new RegExp('\\b(?:on )?' + MONRE + ' (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b').exec(s))) return { d: md(+m[2], mi(m[1]), m[3]), m };
  if ((m = /\btoday\b/.exec(s))) return { d: now, m };
  if ((m = /\btomorrow\b/.exec(s))) return { d: add(1), m };
  if ((m = /\bin (\d+) (day|week)s?\b/.exec(s))) return { d: add(m[1] * (m[2] === 'week' ? 7 : 1)), m };
  if ((m = new RegExp('\\b(?:on )?(next )?' + DOWRE + '\\b').exec(s))) {
    let n = (DOW.indexOf(m[2].slice(0, 3)) - now.getDay() + 7) % 7 || 7;
    if (m[1]) n += 7;
    return { d: add(n), m };
  }
  return null;
}
function findTime(s) {
  let m = /\b(?:at )?noon\b/.exec(s);
  if (m) return { h: 12, mi: 0, m };
  m = /\bat (\d{1,2})(?::(\d\d))? ?(am|pm)?\b/.exec(s) || /\b(\d{1,2}):(\d\d) ?(am|pm)?\b/.exec(s) || /\b(\d{1,2})() ?(am|pm)\b/.exec(s);
  if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return { h, mi, m };
}
T.daysUntil = a => {
  const f = findDate(a.s); if (!f) return null;
  const n = Math.round((f.d - day0(new Date())) / 864e5);
  return { read: ['days from', { v: 'today' }, 'to', { v: fmtDate(f.d) }], value: n, html: `<div class="big">${n} <small>day${Math.abs(n) === 1 ? '' : 's'}</small></div><div class="sub">${Math.floor(Math.abs(n) / 7)} weeks and ${Math.abs(n) % 7} days</div>`, trace: [`dates.parse("${a.s}") → ${f.d.toDateString()}`, 'difference in whole days'], py: `(date("${iso(f.d)}") - date.today()).days` };
};
T.weekday = a => {
  const f = findDate(a.s); if (!f) return null;
  return { read: ['weekday of', { v: fmtDate(f.d) }], html: `<div class="big">${f.d.toLocaleDateString('en-GB', { weekday: 'long' })}</div>`, trace: [`dates.parse("${a.s}")`, 'Gregorian weekday'], py: `date("${iso(f.d)}").strftime("%A")` };
};

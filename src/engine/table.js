// The open table: a real delimited file typed by @gcu/recon, or the synthetic sample; a histogram; and
// table questions in controlled English answered through @gcu/sadpan and @gcu/sift (all vendored).
// Sample data stays labelled as sample data; a file is named on every card that reads it.
import { S, T, tool, frame, amend, noun, shape, postmod, qmod, compound, condition, fmt, checksOf } from './core.js';
import { mineralsTable } from './minerals.js';
import { qcSample } from './qaqc.js';
import { DOCUMENT } from './interchange.js';
import { series } from '../vendor/sadpan.js';
import { sniff, detectAnalyte, NULL_SENTINELS } from '../vendor/recon.js';
import { parsePredicate, evaluatePredicate, predicateToString } from '../vendor/sift.js';
import { parseUnit } from './units.js';

/* ── the sample ────────────────────────────────────────────── */
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
const SAMPLE_COLS = [{ name: 'hole', type: 'categorical' }, { name: 'from', type: 'numeric', unit: 'm' }, { name: 'to', type: 'numeric', unit: 'm' }, { name: 'lith', type: 'categorical' }, { name: 'cu', type: 'numeric', unit: '%', analyte: 'Cu' }, { name: 'au', type: 'numeric', unit: 'g/t', analyte: 'Au' }];
export const sampleTable = () => ({ name: 'assays.csv', source: 'sample', hash: 'sample', rows: makeData(), roles: { hole: 'hole', from: 'from', to: 'to' }, cols: SAMPLE_COLS });

/* ── a file: delimited text → a typed table ────────────────── */
export const ELEMENT = { Cu: 'copper', Au: 'gold', Ag: 'silver', Fe: 'iron', Ni: 'nickel', Zn: 'zinc', Pb: 'lead', Co: 'cobalt', Mn: 'manganese', Al: 'aluminium', S: 'sulfur', As: 'arsenic', Mo: 'molybdenum', U: 'uranium', Li: 'lithium', Sn: 'tin', W: 'tungsten', Cr: 'chromium', Ti: 'titanium', P: 'phosphorus' };
export function parseDelimited(text, delim) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}
const isSentinel = v => v === '' || NULL_SENTINELS.has(String(v).trim());
const ROLE = { hole: /^(hole|holeid|hole_id|bhid|dhid|dh|drillhole|collar)$/i, from: /^(from|depth_from|from_m|depthfrom|start)$/i, to: /^(to|depth_to|to_m|depthto|end)$/i };
// recon types the columns from a sample of lines; the parse then follows those types
export function tableFromText(name, text, hash) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return null;
  const m = sniff(lines.slice(0, 300));
  const grid = parseDelimited(text, m.delimiter), header = grid[0].map(h => h.trim());
  const cols = header.map((h, i) => { const c = m.columns.find(x => x.name === h) || { type: 'categorical' }; const an = detectAnalyte(h); return { name: h, type: c.type === 'numeric' ? 'numeric' : 'categorical', unit: c.unit, analyte: an ? an.analyte : undefined, i }; });
  const rows = grid.slice(1).map(r => { const o = {}; cols.forEach(c => { const raw = (r[c.i] ?? '').trim(); o[c.name] = isSentinel(raw) ? null : c.type === 'numeric' ? (isNaN(+raw) ? null : +raw) : raw; }); return o; });
  const roles = {}; for (const [k, re] of Object.entries(ROLE)) { const c = cols.find(x => re.test(x.name)); if (c) roles[k] = c.name; }
  if (!(roles.from && roles.to)) { delete roles.from; delete roles.to; }
  return { name, source: 'file', hash, rows, cols: cols.map(({ i, ...c }) => c), roles, delimiter: m.delimiter };
}
export const openTable = t => { S.table = t; return t; };
// a column by what the person called it: its name, its analyte symbol or element name, or a unique start
// the words people use for the usual non-grade columns, by the column name's start: "lithology" for lith
const COLSYN = [[/^lith/i, ['lithology', 'lithologies', 'litho', 'rock type', 'rock types', 'rock']], [/^(hole|bhid|dhid)/i, ['hole id', 'hole ids', 'drillhole', 'drill hole']]];
const colWords = name => COLSYN.filter(([re]) => re.test(name)).flatMap(([, w]) => w);
export function colOf(word, table = S.table) {
  if (!table) return null;
  const w = String(word).trim().toLowerCase();
  const byName = table.cols.find(c => c.name.toLowerCase() === w); if (byName) return byName;
  const bySyn = table.cols.filter(c => colWords(c.name).includes(w)); if (bySyn.length === 1) return bySyn[0];
  const an = detectAnalyte(w) ? detectAnalyte(w).analyte : Object.keys(ELEMENT).find(k => ELEMENT[k] === w);
  if (an) { const c = table.cols.find(c => c.analyte === an); if (c) return c; }
  const starts = table.cols.filter(c => c.name.toLowerCase().startsWith(w));
  return starts.length === 1 ? starts[0] : null;
}
const colNames = t => t.cols.map(c => c.name).join(', ');
const shown = w => { const c = colOf(w, S.table || { cols: SAMPLE_COLS }); return c ? (c.analyte || c.name) : w; };
const srcLine = t => t.source === 'sample' ? `${t.name} · synthetic sample data, generated, not from a real deposit` : t.source === 'device' ? `the ${t.name} · ${t.rows.length} rows · a table on this device` : `${t.name}${t.sheet && t.from === 'xlsx' ? ' · sheet ' + t.sheet : ''} · ${t.rows.length} rows · ${t.from === 'xlsx' ? 'read by @gcu/sheet, ' : t.from === 'dm' ? 'read by @gcu/dm, ' : t.from === 'parquet' ? 'read by @gcu/parquet, ' : ''}typed by @gcu/recon`;

/* ── statistics, weighted or not ───────────────────────────── */
export function stats(v) {
  const s = series(v), sd = s.std();
  return { n: s.count(), mean: s.mean(), sd, va: sd * sd, min: s.min(), med: s.median(), max: s.max() };
}
// weighted mean, standard deviation and quantiles; with equal weights these agree with stats()
function wstats(v, w) {
  const W = w.reduce((a, b) => a + b, 0), mean = v.reduce((a, x, i) => a + x * w[i], 0) / W;
  const va = v.reduce((a, x, i) => a + w[i] * (x - mean) ** 2, 0) / W * (v.length / Math.max(1, v.length - 1));
  const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
  const q = p => { let acc = 0; for (const i of idx) { acc += w[i]; if (acc / W >= p) return v[i]; } return v[idx[idx.length - 1]]; };
  let min = Infinity, max = -Infinity; for (const x of v) { if (x < min) min = x; if (x > max) max = x; }   // a loop: spreading a column of 100,000s overflows the stack
  return { n: v.length, mean, sd: Math.sqrt(va), va, min, max, med: q(.5), q, W };
}

/* ── the precondition: a table is open ─────────────────────── */
// established by opening the sample, or a file this device has seen
condition('table', {
  holds: () => !!S.table,
  prompt: 'No table is open. Open {one} first?',
  many: 'No table is open. Open one first?',
  // name: the table as the prompt says it; label: the option's button
  establish: () => [{ label: 'open assays.csv', name: 'assays.csv, the sample', tool: 'open', args: {} }, ...Object.entries(S.tables).filter(([, t]) => t.rows.length).map(([k]) => ({ label: `open the ${k}`, name: `the ${k}`, tool: 'open', args: { device: k } })), ...Object.values(S.files).map(f => ({ label: `open ${f.name}`, name: f.name, tool: 'open', args: { file: { name: f.name, hash: f.hash } } }))]
});
tool({
  name: 'open', post: ['table'],
  skill: { group: 'Table', title: 'Open and validate', on: '@gcu/recon · sheet · dm · parquet', about: 'A CSV, TSV, xlsx, Parquet or Datamine .dm from your files, typed by recon: numbers, categories, units, analytes, hole and interval columns. A workbook with several sheets asks which.', examples: ['open assays.csv'] },
  topic: () => null,
  run: a => {
    let t;
    if (a.device === 'minerals') t = mineralsTable();
    else if (a.device === 'qc') t = qcSample();   // the synthetic QC sample (qaqc.js)   // a pack, not device state: the minerals as a table (minerals.js)
    else if (a.device) {
      const d = S.tables[a.device]; if (!d || !d.rows.length) return { read: ['open table', { v: a.device }], body: [{ t: 'note', kind: 'err', text: `The ${a.device} is empty. Say "log 5 km run" first.` }], trace: ['device table: empty'] };
      t = { name: a.device, source: 'device', hash: a.device, rows: d.rows.map(r => ({ ...r })), cols: d.cols.map(c => ({ ...c })), roles: {} };
    } else if (a.file) {
      // a drawing, a YAML or a geometry file is not a table: it opens as its conversion
      if (DOCUMENT.test(a.file.name)) return T.convertFile({ file: a.file });
      const f = S.files[a.file.hash];
      if (!f) return { read: ['open table', { v: a.file.name }], body: [{ t: 'note', kind: 'err', text: `${a.file.name} is not kept on this device. Open it again from your files.` }], trace: ['file: not in the device store'] };
      if (a.sheet) a.file = { ...a.file, sheet: a.sheet };
      if (f.tables && !a.file.sheet) return { read: ['open table', { v: a.file.name }], body: [{ t: 'kv', rows: [['sheets', Object.keys(f.tables).join(', ')]] }], ask: { prompt: `${a.file.name} has ${Object.keys(f.tables).length} sheets. Which one?`, options: Object.keys(f.tables).map(k => ({ label: k, value: k })), set: (x, v) => { x.file = { ...x.file, sheet: v }; } }, trace: ['blocked: several sheets'] };
      if (f.tables && !f.tables[a.file.sheet]) return { read: ['open table', { v: a.file.name }], body: [{ t: 'note', kind: 'err', text: `${a.file.name} has no sheet called ${a.file.sheet}. It has ${Object.keys(f.tables).join(', ')}.` }], trace: ['sheet: not found'] };
      t = tableFromText(a.file.name, f.tables ? f.tables[a.file.sheet] : f.text, a.file.hash);
      if (t) { t.from = f.from || null; t.sheet = f.tables ? a.file.sheet : f.sheet || null; t.lost = f.lost || null; t.convTrace = f.convTrace || null; }
      if (!t) return { read: ['open table', { v: a.file.name }], body: [{ t: 'note', kind: 'err', text: `${a.file.name} has no table in it: fewer than two lines.` }], trace: ['recon: nothing to type'] };
    } else t = sampleTable();
    openTable(t);
    const n1 = t.roles.from ? t.rows.filter(r => r[t.roles.to] - r[t.roles.from] === 1).length : 0, holes = t.roles.hole ? new Set(t.rows.map(r => r[t.roles.hole])).size : 0;
    const bdl = t.cols.filter(c => c.type === 'numeric').map(c => [c.name, t.rows.filter(r => r[c.name] != null && r[c.name] < 0).length]).filter(x => x[1]);
    const nulls = t.rows.reduce((n, r) => n + Object.values(r).filter(v => v == null).length, 0);
    const rows = [['rows', `${t.rows.length}${holes ? ` samples in ${holes} holes` : ''}`], ['columns', t.cols.map(c => `${c.name} (${c.type === 'numeric' ? (c.unit || 'number') : 'category'}${c.analyte ? ', ' + c.analyte : ''})`).join(' · ')]];
    if (t.roles.from) rows.push(['intervals', `${t.roles.from} to ${t.roles.to}${t.roles.hole ? ' by ' + t.roles.hole : ''}; ${n1} samples of 1 m`]);
    const trace = [...(t.convTrace || []), t.source === 'sample' ? 'generate the sample table' : t.source === 'device' ? `device table ${t.name}: ${t.rows.length} rows` : `recon.sniff(${t.name}) → delimiter "${t.delimiter}", ${t.cols.length} columns typed`, `roles: ${Object.entries(t.roles).map(([k, v]) => `${k} = ${v}`).join(', ') || 'none found'}`, `tare: ${nulls} blank or sentinel cells, ${bdl.map(([c, n]) => `${n} negative ${c}`).join(', ') || 'no negative codes'}`];
    return {
      read: ['open table', { v: t.name }, ...(t.sheet && t.from === 'xlsx' ? [{ v: `sheet ${t.sheet}`, key: 'sheet', alts: Object.keys((S.files[t.hash] || {}).tables || {}).length > 1 ? Object.keys(S.files[t.hash].tables) : [t.sheet], cur: t.sheet }] : [])],
      body: [{ t: 'kv', rows }, ...(t.from ? [{ t: 'note', text: `Converted from ${t.from === 'xlsx' ? 'xlsx by @gcu/sheet' : t.from === 'parquet' ? 'Parquet by @gcu/parquet' : 'Datamine .dm by @gcu/dm'} when the file was opened${t.lost && t.lost.length ? '; ' + t.lost.join('; ') : ''}.` }] : []), ...(bdl.length ? [{ t: 'note', text: `${bdl.map(([c, n]) => `${n} ${c} values are negative`).join('; ')}. That looks like a below-detection code. Statistics leave them out until you choose a policy on a card.` }] : []), ...checksOf(t), { t: 'src', text: srcLine(t) }],
      trace, py: t.source === 'device' ? `dh = device.table("${t.name}")` : `dh = read_csv("${t.name}")`
    };
  }
});
frame({
  name: 'open', label: 'Open', words: ['open', 'load', 'show me', 'use'], theme: ['table', 'file', 'devtable'], required: ['theme'], roles: {},
  words_pt: ['abrir', 'abre', 'carregar', 'carrega'], label_pt: 'Abrir',
  bind: c => {
    const t = c.theme[0], v = t && t.value; if (t && t.type === 'devtable') return { tool: 'open', args: { device: v } };
    const f = v && Object.values(S.files).find(f => f.name.toLowerCase() === String(v).toLowerCase()); return f ? { tool: 'open', args: { file: { name: f.name, hash: f.hash } } } : { tool: 'open', args: {} };
  }
});

/* ── values of a column, with the below-detection policy ───── */
// numbers of a column after the policy: exclude (default) | half | limit | zero for negative codes
function column(rows, col, bdl = 'exclude') {
  const out = [], skipped = { null: 0, bdl: 0 };
  for (const r of rows) {
    const v = r[col];
    if (v == null) { skipped.null++; continue; }
    if (v < 0) { skipped.bdl++; if (bdl === 'exclude') continue; out.push(bdl === 'zero' ? 0 : bdl === 'half' ? -v / 2 : -v); continue; }
    out.push(v);
  }
  return { v: out, skipped };
}
const BDL = ['exclude', 'half', 'limit', 'zero'];
const bdlSlot = (a, skipped) => skipped.bdl ? [{ v: `below detection: ${a.bdl || 'exclude'}`, key: 'bdl', alts: BDL, cur: a.bdl || 'exclude' }] : [];

tool({
  name: 'hist', pre: ['table'],
  skill: { group: 'Table', title: 'Histogram', on: '@gcu/sadpan · @gcu/plot', about: 'Any numeric column of the open table. Amend it afterwards with “log scale”.', examples: ['histogram of cu'] },
  topic: a => [`${shown(a.col)} histogram`, 3],
  run: a => {
    const trace = [], c = colOf(a.col); if (!c) return null;
    if (c.type !== 'numeric') return { read: ['histogram of', { v: c.name }], body: [{ t: 'note', kind: 'err', text: `${c.name} is a category, not a number. Try "count by ${c.name}".` }], trace: [...trace, 'column is categorical'] };
    const unit = c.unit || '';
    let rows = S.table.rows, whereText = null;
    if (a.where) { let p; try { p = whereOf(a.where, S.table); } catch (e) { return { read: ['histogram of', { v: c.name }, 'where'], body: [{ t: 'note', kind: 'err', text: e.message }], trace: [...trace, 'where: rejected'] }; }
      rows = rows.filter(r => evaluatePredicate(p.pred, k => r[k])); whereText = predicateToString(p.pred); trace.push(`sift: ${whereText} → ${rows.length} of ${S.table.rows.length} rows`); }
    const { v: all, skipped } = column(rows, c.name, a.bdl), v = all.filter(x => x > 0);
    const read = ['histogram of', { v: c.name }, ...(whereText ? ['where', { v: whereText }] : []), { v: a.log ? 'log scale' : 'linear scale', key: 'log', alts: [false, true], cur: !!a.log }, ...bdlSlot(a, skipped)];
    if (v.length < 2) return { read, body: [{ t: 'note', kind: 'err', text: `${c.name} has ${v.length} positive value${v.length === 1 ? '' : 's'}; nothing to bin.` }], trace };
    const st = stats(v), f = a.log ? Math.log10 : x => x, lo = a.log ? f(st.min) : 0, hi = f(st.max), nb = 18, bins = new Array(nb).fill(0);
    v.forEach(x => { bins[Math.min(nb - 1, Math.floor((f(x) - lo) / Math.max(1e-12, hi - lo) * nb))]++; });
    const inv = t => a.log ? Math.pow(10, t) : t;
    trace.push(`select ${c.name}; skip ${skipped.null} blank, ${skipped.bdl} below-detection (${a.bdl || 'exclude'}), ${all.length - v.length} non-positive`, `bin into ${nb} ${a.log ? 'log10' : 'linear'} classes`);
    return {
      read,
      body: [
        { t: 'bars', label: `Histogram of ${c.name}`, bins, ticks: [0, .5, 1].map(t => fmt(inv(lo + t * (hi - lo)), 2)), lo: inv(lo), hi: inv(hi), log: !!a.log, xlabel: unit ? `${c.name} (${unit})` : c.name, ylabel: 'samples' },
        { t: 'kv', rows: [['n', String(st.n)], ['mean', `${fmt(st.mean, 3)} ${unit}`], ['median', `${fmt(st.med, 3)} ${unit}`], ['cv', fmt(st.sd / st.mean, 3)], ['range', `${fmt(st.min, 3)} to ${fmt(st.max, 3)} ${unit}`]] },
        { t: 'src', text: `@gcu/sadpan · vendored · sample-count weighted · ${srcLine(S.table)}` }
      ],
      trace, py: `plot.hist(dh${whereText ? `.query('${whereText}')` : ''}["${c.name}"][dh["${c.name}"] > 0], bins=${nb}${a.log ? ', log=True' : ''})`
    };
  }
});
// "histogram of cu", "plot a histogram of fe in log scale"
frame({
  name: 'plot', label: 'Plot', words: ['plot', 'draw', 'show', 'show me', 'display'], elidable: true,
  theme: ['plot'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for'], types: ['variable'] }, scale: { preps: ['in', 'on', 'with'], types: ['scale'] }, where: { preps: ['where', 'with', 'if', 'when'], types: ['cond'] } },
  words_pt: ['plotar', 'plota', 'mostrar', 'mostra', 'desenhar', 'desenha'], label_pt: 'Plotar',
  bind: c => {
    const kind = c.theme[0] && c.theme[0].value, v = c.roles.of && c.roles.of[0]; if (!kind || !v || !v.value) return null;
    return kind === 'histogram' ? { tool: 'hist', args: { col: v.value, log: !!(c.roles.scale && c.roles.scale[0].value === 'log'), ...(c.roles.where ? { where: c.roles.where[0].cond } : {}) } } : null;
  }
});

/* ── table questions in controlled English ─────────────────── */
const num = s => /^-?\d+(\.\d+)?$/.test(s) ? s : `"${s.replace(/"/g, '')}"`;
const lit = (table, colName, s) => { if (/^-?\d+(\.\d+)?$/.test(s)) return s; const c = table.cols.find(x => x.name === colName); if (c && c.type === 'categorical') { const hit = table.rows.map(r => r[colName]).find(v => v != null && String(v).toLowerCase() === s.toLowerCase()); if (hit != null) return num(String(hit)); } return num(s); };
// A condition as the grammar read it ({ and | or | not | col, op, val | vals }) → a sift predicate source, columns
// resolved by colOf: "cu > 0.5 and lith is BRX" → cu > 0.5 && lith == "BRX". A value with a unit is converted to the
// column's unit, or refused. A string is a predicate source already (cards written before 14 Oct 2026).
const SIFT_OP = { above: '>', below: '<', atleast: '>=', atmost: '<=', equals: '==', differs: '!=' };
function inUnit(x, col) {
  if (!x.unit || (col.unit && x.unit.toLowerCase() === col.unit.toLowerCase())) return x.n;
  const a = parseUnit(x.unit), b = col.unit && parseUnit(col.unit);
  if (a && b && a.dim === b.dim) return +(x.n * a.f / b.f).toPrecision(12);
  throw new Error(`${col.name} is in ${col.unit || 'no unit'}; ${x.n} ${x.unit} does not convert to it`);
}
export function condToSift(c, table) {
  if (c.or) return c.or.map(x => `(${condToSift(x, table)})`).join(' || ');
  if (c.and) return c.and.map(x => condToSift(x, table)).join(' && ');
  if (c.not) return `!(${condToSift(c.not, table)})`;
  const col = colOf(c.col.value, table); if (!col) throw new Error(`no column called "${c.col.value}"; the table has ${colNames(table)}`);
  // a number column compared with a word is refused: "cu equal to banana" is not a question with an answer of 0 rows
  // a word that names another number column compares the two ("from < to"); otherwise a number column takes a number
  const other = x => x.n == null && x.s && col.type === 'numeric' ? colOf(x.s, table) : null;
  const v = x => { if (x.n != null) return String(inUnit(x, col)); const o = other(x); if (o && o.type === 'numeric') return o.name; if (col.type === 'numeric') throw new Error(`${col.name} holds numbers; "${x.s}" is not one`); return lit(table, col.name, x.s); };
  if (c.op === 'between') return `(${col.name} >= ${v(c.vals[0])} && ${col.name} <= ${v(c.vals[1])})`;
  if (c.op === 'in') return `(${c.vals.map(x => `${col.name} == ${v(x)}`).join(' || ')})`;
  if (c.op === 'blank' || c.op === 'present') return `${col.name} ${c.op === 'blank' ? '==' : '!='} null`;
  return `${col.name} ${SIFT_OP[c.op]} ${v(c.val)}`;
}
export const whereSrc = (w, table) => typeof w === 'string' ? w : condToSift(w, table);
export const whereOf = (w, table) => ({ pred: parsePredicate(whereSrc(w, table)) });
const aggLabel = a => a === 'var' ? 'variance' : a === 'cv' ? 'cv' : a;
function aggregate(agg, v, w) {
  if (!v.length) return null;
  if (agg === 'count') return v.length;
  const st = w ? wstats(v, w) : stats(v);
  if (agg === 'median') return st.med;
  if (/^p\d/.test(agg)) { const p = +agg.slice(1) / 100; if (w) return st.q(p); const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; }
  if (agg === 'sum') return w ? v.reduce((a, x, i) => a + x * w[i], 0) : v.reduce((a, b) => a + b, 0);
  if (agg === 'var') return st.va;
  if (agg === 'cv') return st.sd / st.mean;
  return st[agg];
}
tool({
  name: 'query', pre: ['table'],
  skill: { group: 'Table', title: 'Table questions', on: '@gcu/sift · @gcu/sadpan', about: 'Means, medians, percentiles, counts, lists and correlations in controlled English, with where and by.', examples: ['mean cu by lith where au > 0.1', 'how many samples where cu > 0.5 and lith is BRX', 'top 5 rows sorted by au descending', 'check intervals'] },
  topic: a => a.kind === 'agg' ? [`${a.cols.map(shown).join(', ')} ${a.aggs.map(aggLabel).join(', ')}`, 2] : [`${a.kind} ${a.cols ? a.cols.map(shown).join(', ') : ''}`.trim(), 2],
  run: a => {
    const trace = [];
    const refuse = (read, text) => ({ read, body: [{ t: 'note', kind: 'err', text }, { t: 'src', text: S.table ? srcLine(S.table) : '' }], trace: [...trace, 'stop'] });
    const T = S.table, R = T.roles;
    const want = (a.cols || []).map(w => [w, colOf(w)]), missing = want.find(([, c]) => !c);
    if (missing) return refuse([a.kind, { v: missing[0] }], `No column called "${missing[0]}". The table has ${colNames(T)}.`);
    const cols = want.map(([, c]) => c);
    const bys = (a.by || []).map(w => [w, colOf(w)]), missingBy = bys.find(([, c]) => !c);
    if (missingBy) return refuse([a.kind, 'by', { v: missingBy[0] }], `No column called "${missingBy[0]}". The table has ${colNames(T)}.`);
    const by = bys.map(([, c]) => c);
    let rows = T.rows, whereText = null;
    if (a.where) {
      let p; try { p = whereOf(a.where, T); } catch (e) { return refuse([a.kind, 'where', { v: typeof a.where === 'string' ? a.where : 'that condition' }], e.message); }
      rows = rows.filter(r => evaluatePredicate(p.pred, c => r[c])); whereText = predicateToString(p.pred);
      trace.push(`sift: ${p.src} → ${rows.length} of ${T.rows.length} rows`);
    }
    const weight = a.weight || (R.from && a.kind === 'agg' ? 'length' : 'count');
    const read = [];
    const weightSlot = R.from && a.kind === 'agg' ? [{ v: `weighted by ${weight}`, key: 'weight', alts: ['length', 'count'], cur: weight }] : [];
    const src = { t: 'src', text: `@gcu/sift · @gcu/sadpan · vendored · ${srcLine(T)}` };
    const groups = by.length ? [...rows.reduce((m, r) => { const k = by.map(c => r[c.name] ?? '(blank)').join(' / '); (m.get(k) || m.set(k, []).get(k)).push(r); return m; }, new Map())] : [[null, rows]];
    if (a.kind === 'count') {
      read.push('count rows', ...(by.length ? ['by', { v: by.map(c => c.name).join(' and ') }] : []), ...(whereText ? ['where', { v: whereText }] : []));
      if (!by.length) return { read, value: rows.length, body: [{ t: 'big', v: String(rows.length), unit: 'rows' }, src], trace: [...trace, `count → ${rows.length}`], py: `len(dh${whereText ? `.query('${whereText}')` : ''})` };
      const out = groups.map(([k, g]) => [k, g.length]).sort((x, y) => y[1] - x[1]);
      return { read, body: [{ t: 'table', head: [by.map(c => c.name).join(' / '), 'rows'], num: [false, true], rows: out.map(([k, n]) => [k, String(n)]) }, ...(a.view !== 'table' && out.length >= 2 && out.length <= 20 ? [{ t: 'hbars', rows: out.map(([k, n]) => [k, n, String(n)]) }] : []), src], trace: [...trace, `group by ${by.map(c => c.name).join(', ')} → ${out.length} groups`], py: `dh.groupby(${JSON.stringify(by.map(c => c.name))}).size()` };
    }
    if (a.kind === 'distinct') {
      const c = cols[0], counts = new Map(); rows.forEach(r => { const k = r[c.name] ?? '(blank)'; counts.set(k, (counts.get(k) || 0) + 1); });
      const out = [...counts].sort((x, y) => y[1] - x[1]);
      read.push('distinct values of', { v: c.name }, ...(whereText ? ['where', { v: whereText }] : []));
      return { read, body: [{ t: 'table', head: [c.name, 'rows'], num: [false, true], rows: out.map(([k, n]) => [String(k), String(n)]) }, src], trace: [...trace, `distinct ${c.name} → ${out.length} values`], py: `dh["${c.name}"].value_counts()` };
    }
    if (a.kind === 'list') {
      let out = rows; const sc = a.sort ? colOf(a.sort) : null;
      if (a.sort && !sc) return refuse(['list rows sorted by', { v: a.sort }], `No column called "${a.sort}". The table has ${colNames(T)}.`);
      if (sc) out = [...out].sort((x, y) => (x[sc.name] == null) - (y[sc.name] == null) || (a.desc ? (y[sc.name] > x[sc.name] ? 1 : -1) : (x[sc.name] > y[sc.name] ? 1 : -1)));
      out = out.slice(0, a.limit || 20);
      read.push('list', { v: `${out.length} rows` }, ...(whereText ? ['where', { v: whereText }] : []), ...(sc ? ['sorted by', { v: sc.name + (a.desc ? ' descending' : '') }] : []));
      return { read, body: [{ t: 'table', head: T.cols.map(c => c.name), num: T.cols.map(c => c.type === 'numeric'), rows: out.map(r => T.cols.map(c => r[c.name] == null ? '' : typeof r[c.name] === 'number' ? fmt(r[c.name], 6) : String(r[c.name]))) }, { t: 'sub', text: `${out.length} of ${rows.length} rows shown.` }, src], trace: [...trace, `${sc ? `sort by ${sc.name}${a.desc ? ' descending' : ''}; ` : ''}take ${out.length}`], py: `dh${sc ? `.sort_values("${sc.name}", ascending=${!a.desc})` : ''}.head(${a.limit || 20})` };
    }
    if (a.kind === 'corr') {
      const [x, y] = cols; if (x.type !== 'numeric' || y.type !== 'numeric') return refuse(['correlation of', { v: x.name }, 'and', { v: y.name }], 'Correlation needs two numeric columns.');
      const pairs = rows.map(r => [r[x.name], r[y.name]]).filter(([p, q]) => p != null && q != null && p >= 0 && q >= 0);
      if (pairs.length < 3) return refuse(['correlation of', { v: x.name }, 'and', { v: y.name }], 'Fewer than three rows have both values.');
      const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length, my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
      const sxy = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0), sxx = pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0), syy = pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0), r = sxy / Math.sqrt(sxx * syy);
      read.push('correlation of', { v: x.name }, 'and', { v: y.name }, ...(whereText ? ['where', { v: whereText }] : []));
      return { read, value: r, body: [{ t: 'big', v: fmt(r, 3), unit: 'Pearson r' }, { t: 'sub', text: `${pairs.length} rows with both values; negative codes left out.` }, src], trace: [...trace, `pairs → ${pairs.length}`, `pearson r = ${fmt(r, 6)}`], py: `dh[["${x.name}", "${y.name}"]].corr()` };
    }
    if (a.kind === 'check') {
      if (!(R.hole && R.from && R.to)) return refuse(['check intervals'], `This table has no hole, from and to columns that recon could name (found: ${Object.entries(R).map(([k, v]) => `${k} = ${v}`).join(', ') || 'none'}).`);
      const byHole = new Map(); rows.forEach(r => { const k = r[R.hole]; (byHole.get(k) || byHole.set(k, []).get(k)).push(r); });
      const out = [], issues = []; let gaps = 0, overlaps = 0, bad = 0;
      for (const [h, rs] of byHole) {
        const s = [...rs].sort((x, y) => x[R.from] - y[R.from]); let g = 0, o = 0, b = 0, len = 0, prev = null;
        for (const r of s) { const f = r[R.from], t = r[R.to]; if (f == null || t == null || t <= f) { b++; continue; } len += t - f; if (prev != null) { if (f > prev + 1e-9) { g++; issues.push([h, 'gap', `${fmt(prev)} to ${fmt(f)}`]); } else if (f < prev - 1e-9) { o++; issues.push([h, 'overlap', `${fmt(f)} to ${fmt(Math.min(t, prev))}`]); } } prev = Math.max(prev ?? -Infinity, t); }
        gaps += g; overlaps += o; bad += b; out.push([h, s.length, fmt(len), g, o, b]);
      }
      read.push('check intervals of', { v: T.name });
      return { read, body: [{ t: 'kv', rows: [['holes', String(byHole.size)], ['gaps', String(gaps)], ['overlaps', String(overlaps)], ['bad intervals', `${bad} (missing or to ≤ from)`]] }, { t: 'table', head: [R.hole, 'rows', 'length', 'gaps', 'overlaps', 'bad'], num: [false, true, true, true, true, true], rows: out.map(r => r.map(String)) }, ...(issues.length ? [{ t: 'table', head: ['hole', 'issue', 'where'], rows: issues.slice(0, 40) }] : []), src], trace: [...trace, `sort by ${R.from} within ${R.hole}`, `walk intervals: ${gaps} gaps, ${overlaps} overlaps, ${bad} bad`], py: `tare.intervals(dh, hole="${R.hole}", frm="${R.from}", to="${R.to}")` };
    }
    // agg
    const bad = cols.find(c => c.type !== 'numeric'); if (bad) return refuse([a.aggs.join(', '), 'of', { v: bad.name }], `${bad.name} is a category, not a number. Try "count by ${bad.name}" or "distinct ${bad.name}".`);
    const skipped = { null: 0, bdl: 0 };
    const cell = (g, c, agg) => { const vs = [], ws = []; for (const r of g) { const v = r[c.name]; if (v == null) { skipped.null++; continue; } let x = v; if (v < 0) { skipped.bdl++; if ((a.bdl || 'exclude') === 'exclude') continue; x = a.bdl === 'zero' ? 0 : a.bdl === 'half' ? -v / 2 : -v; } vs.push(x); if (weight === 'length') ws.push(Math.max(0, r[R.to] - r[R.from]) || 0); } return aggregate(agg, vs, weight === 'length' ? ws : null); };
    const head = [...(by.length ? [by.map(c => c.name).join(' / ')] : []), ...cols.flatMap(c => a.aggs.map(g => `${aggLabel(g)} ${c.name}${c.unit ? ' (' + c.unit + ')' : ''}`))];
    const table = groups.map(([k, g]) => [...(by.length ? [k] : []), ...cols.flatMap(c => a.aggs.map(agg => cell(g, c, agg)))]);
    read.push(a.aggs.map(aggLabel).join(' and '), 'of', { v: cols.map(c => c.name).join(' and ') }, ...(by.length ? ['by', { v: by.map(c => c.name).join(' and ') }] : []), ...(whereText ? ['where', { v: whereText }] : []), ...weightSlot, ...bdlSlot(a, skipped));
    trace.push(`skip ${skipped.null} blank, ${skipped.bdl} below-detection (${a.bdl || 'exclude'})`, `${weight === 'length' ? `length-weighted over ${R.from}–${R.to}` : 'sample-count weighted'}: ${a.aggs.join(', ')} of ${cols.map(c => c.name).join(', ')}${by.length ? ' by ' + by.map(c => c.name).join(', ') : ''}`);
    const py = `dh${whereText ? `.query('${whereText}')` : ''}${by.length ? `.groupby(${JSON.stringify(by.map(c => c.name))})` : ''}[${JSON.stringify(cols.map(c => c.name))}].agg(${JSON.stringify(a.aggs)})`;
    if (!by.length && cols.length === 1 && a.aggs.length === 1) {
      const v = table[0][0];
      return { read, value: v, body: [v == null ? { t: 'note', kind: 'err', text: 'No usable values after the filter.' } : { t: 'big', v: fmt(v, 4), unit: a.aggs[0] === 'count' ? 'rows' : a.aggs[0] === 'cv' ? '' : cols[0].unit || '' }, { t: 'sub', text: `${rows.length} rows${skipped.bdl ? `, ${skipped.bdl} below detection ${a.bdl === 'exclude' || !a.bdl ? 'left out' : 'as ' + a.bdl}` : ''}.` }, src], trace, py };
    }
    const fmtCell = v => v == null ? '' : fmt(v, 4);
    const sorted = by.length && a.aggs.length === 1 && cols.length === 1 ? [...table].sort((x, y) => (y[1] ?? -Infinity) - (x[1] ?? -Infinity)) : table;
    return { read, body: [{ t: 'table', head, num: head.map((_, i) => i > 0 || !by.length), rows: sorted.map(r => r.map((v, i) => i === 0 && by.length ? String(v) : fmtCell(v))) }, ...(a.view !== 'table' && by.length && cols.length === 1 && a.aggs.length === 1 && sorted.length >= 2 && sorted.length <= 20 ? [{ t: 'hbars', rows: sorted.filter(r => r[1] != null).map(r => [String(r[0]), r[1], fmt(r[1], 3)]) }] : []), src], trace, py };
  }
});
/* ── the words of a table: its columns, statistics, and what a question is about ─── */
const numericVar = c => c.type === 'numeric' && !/^(from|to|x|y|z|east|north|elev)/i.test(c.name);
// columns that are not grades (hole, lith, from, to): what a question groups by, lists or sorts by
noun(() => {
  const cols = S.table ? S.table.cols.filter(c => !numericVar(c)).map(c => c.name) : ['hole', 'lith', 'from', 'to'];
  const words = Object.fromEntries(cols.map(n => [n, [n.toLowerCase(), ...colWords(n)]]));
  return { type: 'column', words, generic: ['field', 'fields'], words_pt: words, generic_pt: ['campo', 'campos'] };
});
// the values of the category columns ("BRX", "GRD"), so a condition can name them: "lith BRX", "lith is brx"
noun(() => {
  const T0 = S.table; if (!T0) return null;
  const vals = [...new Set(T0.cols.filter(c => c.type === 'categorical' && c.name !== T0.roles.hole).flatMap(c => [...new Set((T0.rows.length ? T0.rows : T0.sampleRows || []).map(r => r[c.name]).filter(v => v != null).map(String))].slice(0, 60)))]
    .filter(v => /^[\w.-]+$/.test(v) && !/^\d/.test(v));
  return vals.length ? { type: 'catvalue', exact: true, words: Object.fromEntries(vals.map(v => [v, [v.toLowerCase()]])), words_pt: Object.fromEntries(vals.map(v => [v, [v.toLowerCase()]])) } : null;
});
// the values of the hole column, as written: "in DH-03"
noun(() => {
  const T0 = S.table, h = T0 && T0.roles.hole; if (!h) return null;
  const ids = [...new Set((T0.rows.length ? T0.rows : T0.sampleRows || []).map(r => r[h]).filter(v => v != null).map(String))];
  return { type: 'holeid', exact: true, words: Object.fromEntries(ids.map(v => [v, [v.toLowerCase()]])), words_pt: Object.fromEntries(ids.map(v => [v, [v.toLowerCase()]])) };
});
noun({ type: 'devtable', words: { log: ['log', 'my log', 'the log'] }, words_pt: { log: ['log', 'meu log', 'registro'] } });
noun({ type: 'stat', words: { mean: ['mean', 'average', 'avg'], median: ['median'], sum: ['sum', 'total'], min: ['min', 'minimum', 'lowest', 'smallest'], max: ['max', 'maximum', 'highest', 'largest'],
  std: ['std', 'stdev', 'standard deviation', 'sd'], var: ['variance'], cv: ['cv', 'coefficient of variation'] },
  words_pt: { mean: ['média', 'media'], median: ['mediana'], sum: ['soma', 'total'], min: ['mínimo', 'minimo', 'menor'], max: ['máximo', 'maximo', 'maior'], std: ['desvio padrão', 'desvio padrao'], var: ['variância', 'variancia'], cv: ['cv', 'coeficiente de variação'] } });
shape({ type: 'stat', re: String.raw`p\d{1,2}` });                                       // p90
postmod({ prep: 'of', heads: ['stat'], attr: 'of', mod: 'variable' });                    // "mean of cu"
compound({ mod: 'stat', heads: ['variable', 'column'], attr: 'stat', echo: true });       // "mean cu", "the average copper grade"; "mean litho" reaches the tool, which says it is a category
noun({ type: 'sample', words: {}, generic: ['samples', 'sample', 'rows', 'row', 'records', 'intervals', 'interval', 'assays'], generic_pt: ['amostras', 'amostra', 'linhas', 'linha', 'registros', 'intervalos'] });
qmod({ head: 'sample', attr: 'limit', dims: ['bare'] });                                    // "top 5 rows"
noun({ type: 'order', words: { desc: ['descending', 'desc', 'highest first', 'largest first', 'decreasing'], asc: ['ascending', 'asc', 'lowest first', 'smallest first', 'increasing'] }, words_pt: { desc: ['decrescente'], asc: ['crescente'] } });
noun({ type: 'weightkind', words: { length: ['length', 'interval length'], count: ['count', 'sample count'] }, words_pt: { length: ['comprimento'], count: ['contagem'] } });
noun({ type: 'view', words: { chart: ['chart', 'a chart', 'bar chart', 'graph'], table: ['a table'] }, words_pt: { chart: ['gráfico', 'grafico'], table: ['tabela'] } });
noun({ type: 'corr', words: { corr: ['correlation', 'corr', 'correlation coefficient', 'pearson correlation'] }, words_pt: { corr: ['correlação', 'correlacao'] } });
noun({ type: 'ivcheck', words: { intervals: ['intervals', 'interval', 'overlaps', 'gaps', 'interval overlaps', 'from and to'] }, words_pt: { intervals: ['intervalos', 'sobreposições'] } });

/* ── what reads a question: "mean cu by lith where au > 0.1", "how many samples have au above 1" ── */
// a condition is the grammar's (cu > 0.5 and lith is BRX), after "where", "with", "having"; grouping and sorting are columns
const COLS = ['variable', 'column'];
const COND = { preps: ['where', 'with', 'if', 'when'], types: ['cond'] };
// "for samples with au above 0.1", "the samples where cu > 1": a condition on the rows a question is about
const SUBSET = { preps: ['for', 'of', 'in', 'among', 'across', 'over'], types: ['sample'] };
for (const prep of ['with', 'where']) postmod({ prep, heads: ['sample'], attr: 'where', mod: 'cond' });
const condOf = c => { const w = c.roles.where && c.roles.where[0]; if (w) return w.cond; const s = [...c.theme, ...(c.roles.subset || [])].find(n => n.type === 'sample' && n.attrs && n.attrs.where); return s ? s.attrs.where.cond : null; };
const common = c => {
  const out = {}, by = (c.roles.by || []).map(n => n.value), w = condOf(c), wt = c.roles.weighted && c.roles.weighted[0], v = c.roles.as && c.roles.as[0];
  if (by.length) out.by = by; if (w) out.where = w; if (wt) out.weight = wt.value; if (v) out.view = v.value;
  return out;
};
frame({
  name: 'agg', label: 'Table question', words: ['calculate', 'compute', 'give me', 'show', 'get', 'find', 'tell me'], elidable: true, theme: ['variable', 'column', 'stat'], required: ['theme'],
  roles: { by: { preps: ['by', 'per', 'across', 'for', 'in'], types: COLS }, where: COND, subset: SUBSET, weighted: { preps: ['weighted'], types: ['weightkind'] }, as: { preps: ['as', 'in'], types: ['view'] } },
  words_pt: ['calcula', 'calcule', 'mostra', 'mostre'], label_pt: 'Pergunta à tabela',
  bind: c => {
    const aggs = [], cols = [];
    for (const n of c.theme) {
      if (n.type === 'stat') { aggs.push(n.value); if (n.attrs.of) cols.push(n.attrs.of); }
      else if (n.value) { cols.push(n.value); if (n.attrs.stat) aggs.push(n.attrs.stat); }
    }
    const ag = [...new Set(aggs)], co = [...new Set(cols)];
    return ag.length && co.length ? { tool: 'query', args: { kind: 'agg', aggs: ag, cols: co, ...common(c) } } : null;
  }
});
frame({
  name: 'count', label: 'Count', words: ['count', 'how many', 'number of', 'count the', 'total number of'], theme: ['sample'], required: [],
  roles: { by: { preps: ['by', 'per', 'across', 'for', 'in'], types: COLS }, where: COND },
  words_pt: ['conta', 'conte', 'quantas', 'quantos', 'número de'], label_pt: 'Contar',
  bind: c => ({ tool: 'query', args: { kind: 'count', ...common(c) } })
});
frame({
  name: 'rows', label: 'Rows', words: ['show', 'list', 'show me', 'top', 'display', 'give me'], theme: ['sample'], required: ['theme'],
  // "sorted by au descending", "with the highest au", "by lowest cu"
  roles: { where: COND, sort: { preps: ['sort', 'by'], types: COLS }, order: { preps: [''], types: ['order'] }, highest: { preps: ['highest'], types: COLS }, lowest: { preps: ['lowest'], types: COLS } },
  words_pt: ['mostra', 'lista', 'mostre', 'liste'], label_pt: 'Linhas',
  bind: c => { const hi = c.roles.highest && c.roles.highest[0], lo = c.roles.lowest && c.roles.lowest[0], s = (c.roles.sort && c.roles.sort[0]) || hi || lo, o = c.roles.order && c.roles.order[0], lim = c.theme[0].attrs.limit, w = condOf(c);
    if ([c.roles.sort, hi, lo].filter(Boolean).length > 1) return null;
    return { tool: 'query', args: { kind: 'list', limit: lim ? lim.n : 20, ...(w ? { where: w } : {}), ...(s ? { sort: s.value, desc: hi ? true : lo ? false : !!o && o.value === 'desc' } : {}) } }; }
});
frame({
  name: 'distinct', label: 'Values', words: ['distinct', 'unique', 'values of', 'distinct values of', 'unique values of', 'list the values of', 'categories of'], theme: COLS, required: ['theme'], roles: { where: COND },
  words_pt: ['valores de', 'valores distintos de'], label_pt: 'Valores',
  bind: c => c.theme.length === 1 ? { tool: 'query', args: { kind: 'distinct', cols: [c.theme[0].value], ...common(c) } } : null
});
frame({
  name: 'corr', label: 'Correlation', words: ['calculate', 'compute'], elidable: true, theme: ['corr'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'between', 'for'], types: ['variable'] }, where: COND },
  label_pt: 'Correlação',
  bind: c => c.roles.of.length === 2 ? { tool: 'query', args: { kind: 'corr', cols: c.roles.of.map(n => n.value), ...common(c) } } : null
});
frame({
  name: 'ivcheck', label: 'Check intervals', words: ['check', 'validate', 'check the', 'look for'], theme: ['ivcheck'], required: ['theme'], roles: { by: { preps: ['by', 'per'], types: COLS } },
  words_pt: ['verifica', 'verifique', 'confere'], label_pt: 'Verificar intervalos',
  bind: c => ({ tool: 'query', args: { kind: 'check', ...(c.roles.by ? { by: [c.roles.by[0].value] } : {}) } })
});
// "and median": another statistic for the same question
amend({ tools: ['query'], name: 'addagg', label: 'And', words: [], elidable: true, theme: ['stat'], required: ['theme'], roles: {},
  bind: (c, a) => a.kind === 'agg' && !a.aggs.includes(c.theme[0].value) ? { args: { ...a, aggs: [...a.aggs, c.theme[0].value] } } : null });

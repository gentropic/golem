// Tables too large to hold (SPEC 13.7): a CSV or TSV over 20 MB is typed from its first megabyte by recon, like any
// table, and its questions are answered by scanning the whole file as a job, through @gcu/sluice's accumulators
// (mergeable, never holding the rows): Welford and weighted moments, t-digest quantiles, histograms. The shell runs the
// job over the file it keeps (setRunner('scan', …)); the scan itself, scanTable(), is here and plain, so Node runs it too.
//
// What needs every row at once (row lists, sorting, correlation, interval checks, a skill on every row, export) says so
// on a streamed table instead of answering from the first megabyte.
import { S, T, fmt, result } from './core.js';
import { colOf, whereSrc, tableFromText, openTable } from './table.js';
import { parsePredicate, evaluatePredicate, predicateToString } from '../vendor/sift.js';
import { NULL_SENTINELS } from '../vendor/recon.js';
import { weightedStats } from '../vendor/sluice/accumulator.js';
import { tdigest, quantile } from '../vendor/sluice/tdigest.js';
import { histogram } from '../vendor/sluice/histogram.js';

export const STREAM_OVER = 20e6;   // bytes: larger text tables are streamed, not held
const HEAD = 1 << 20;              // what is read to type the columns

/* ── opening: the head types the table; the file stays where the shell keeps it ── */
// → { table } or { err }. A file whose fields quote the delimiter is refused: the scan splits on it.
export function streamedTable(name, size, headText, hash) {
  const head = headText.length >= HEAD ? headText.slice(0, headText.lastIndexOf('\n') + 1) : headText;
  const t = tableFromText(name, head, hash);
  if (!t) return { err: `${name} has no table in its first megabyte: fewer than two lines.` };
  const q = new RegExp(`"[^"\\n]*${t.delimiter === '\t' ? '\\t' : t.delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"\\n]*"`);
  if (q.test(head)) return { err: `${name} quotes its delimiter inside fields; golem streams only plain CSV and TSV. Under 20 MB it opens whole.` };
  const header = head.split(/\r?\n/)[0].split(t.delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  return { table: { ...t, source: 'file', streamed: true, size, header, sampleRows: t.rows, rows: [], headRows: t.rows.length } };
}

/* ── the scan: plain, async, over a stream of bytes ── */
async function* linesOf(stream) {
  const reader = stream.getReader(), dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += typeof value === 'string' ? value : dec.decode(value, { stream: true });
      const parts = buf.split('\n'); buf = parts.pop();
      for (const l of parts) yield l.endsWith('\r') ? l.slice(0, -1) : l;
    }
    buf += dec.decode(); if (buf) yield buf.endsWith('\r') ? buf.slice(0, -1) : buf;
  } finally { reader.releaseLock(); }
}
async function* rowsOf(open, req) {
  let first = true;
  for await (const line of linesOf(open())) {
    if (first) { first = false; continue; }
    if (!line.trim()) continue;
    const f = line.split(req.delimiter), row = {};
    req.header.forEach((h, i) => { const raw = (f[i] ?? '').trim().replace(/^"|"$/g, ''); row[h] = NULL_SENTINELS.has(raw) ? null : req.types[h] === 'numeric' ? (raw === '' || isNaN(+raw) ? null : +raw) : raw; });
    yield row;
  }
}
const policy = (v, bdl, skipped) => { if (v == null) { skipped.null++; return null; } if (v < 0) { skipped.bdl++; return bdl === 'exclude' ? null : bdl === 'zero' ? 0 : bdl === 'half' ? -v / 2 : -v; } return v; };
// req: { delimiter, header, types, kind: agg | count | distinct | hist, cols, by, where, weight, from, to, bdl, aggs, log }
export async function scanTable(open, req) {
  const t0 = Date.now(), pred = req.where ? parsePredicate(req.where) : null, bdl = req.bdl || 'exclude', skipped = { null: 0, bdl: 0 };
  let rows = 0, matched = 0;
  const keyOf = r => (req.by || []).map(c => r[c] ?? '(blank)').join(' / ');
  if (req.kind === 'hist') {
    // two passes: the range of the positive values, then 18 bins over it (log10 when asked)
    const f = req.log ? Math.log10 : x => x; let lo = Infinity, hi = -Infinity, n = 0;
    for await (const r of rowsOf(open, req)) { rows++; if (pred && !evaluatePredicate(pred, k => r[k])) continue; matched++; const v = policy(r[req.cols[0]], bdl, skipped); if (v == null || !(v > 0)) continue; n++; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (n < 2) return { rows, matched, n, skipped, ms: Date.now() - t0 };
    const start = req.log ? f(lo) : 0, end = f(hi), H = histogram({ min: start, max: end + (end - start) * 1e-9 || 1, bins: 18 }), hs = H.create(), W = weightedStats(), ws = W.create(), D = tdigest(), ds = D.create();
    for await (const r of rowsOf(open, req)) { if (pred && !evaluatePredicate(pred, k => r[k])) continue; const v = policy(r[req.cols[0]], 'exclude', { null: 0, bdl: 0 }); const x = v; if (x == null || !(x > 0)) continue; H.push(hs, f(x)); W.push(ws, x, 1); D.push(ds, x); }
    return { rows, matched, n, skipped, lo: start, hi: end, bins: H.result(hs).counts, stats: { ...W.result(ws), median: quantile(ds, 0.5) }, ms: Date.now() - t0 };
  }
  const groups = new Map(), distinct = new Map(), WS = weightedStats(), TD = tdigest(); let overflow = false;
  for await (const r of rowsOf(open, req)) {
    rows++; if (pred && !evaluatePredicate(pred, k => r[k])) continue; matched++;
    if (req.kind === 'count') { const k = keyOf(r); groups.set(k, (groups.get(k) || 0) + 1); continue; }
    if (req.kind === 'distinct') { const k = r[req.cols[0]] ?? '(blank)'; if (distinct.has(k)) distinct.set(k, distinct.get(k) + 1); else if (distinct.size < 1000) distinct.set(k, 1); else overflow = true; continue; }
    const k = keyOf(r); let g = groups.get(k);
    if (!g) { g = Object.fromEntries(req.cols.map(c => [c, { w: WS.create(), d: TD.create(), sum: 0 }])); groups.set(k, g); }
    const w = req.weight === 'length' ? (r[req.to] != null && r[req.from] != null ? r[req.to] - r[req.from] : null) : 1;
    for (const c of req.cols) { const v = policy(r[c], bdl, skipped); if (v == null || w == null || !(w > 0)) continue; WS.push(g[c].w, v, w); TD.push(g[c].d, v); g[c].sum += v * w; }
  }
  if (req.kind === 'count') return { rows, matched, groups: [...groups].map(([key, n]) => ({ key, n })), ms: Date.now() - t0 };
  if (req.kind === 'distinct') return { rows, matched, values: [...distinct].sort((x, y) => y[1] - x[1]), overflow, ms: Date.now() - t0 };
  const cell = (c, agg) => {
    const s = WS.result(c.w); if (!s.count) return null;
    if (agg === 'mean') return s.mean; if (agg === 'sum') return c.sum; if (agg === 'min') return s.min; if (agg === 'max') return s.max; if (agg === 'count') return s.count;
    if (agg === 'std') return s.std; if (agg === 'var') return s.variance; if (agg === 'cv') return s.std != null && s.mean ? s.std / s.mean : null;
    if (agg === 'median') return quantile(c.d, 0.5); if (/^p\d/.test(agg)) return quantile(c.d, +agg.slice(1) / 100);
    return null;
  };
  return { rows, matched, skipped, groups: [...groups].map(([key, g]) => ({ key, cells: Object.fromEntries(req.cols.map(c => [c, Object.fromEntries(req.aggs.map(a => [a, cell(g[c], a)]))])) })), ms: Date.now() - t0 };
}

/* ── the tools on a streamed table: the question becomes a scan job; the card waits for it ── */
const mb = n => `${fmt(n / 1e6, 3)} MB`;
const srcOf = t => ({ t: 'src', text: `${t.name} · ${mb(t.size)}, read whole by a scan (@gcu/sluice) · columns typed by @gcu/recon from the first ${t.headRows.toLocaleString('en-US')} rows` });
const aggLabel = a => a === 'var' ? 'variance' : a;
const APPROX = a => a === 'median' || /^p\d/.test(a);
function request(a, T0) {
  const want = (a.cols || []).map(w => [w, colOf(w, T0)]), miss = want.find(([, c]) => !c) || (a.by || []).map(w => [w, colOf(w, T0)]).find(([, c]) => !c);
  if (miss) return { err: `No column called "${miss[0]}". The table has ${T0.cols.map(c => c.name).join(', ')}.` };
  let where = null; if (a.where) { try { where = whereSrc(a.where, T0); parsePredicate(where); } catch (e) { return { err: e.message }; } }
  return { req: { hash: T0.hash, delimiter: T0.delimiter, header: T0.header, types: Object.fromEntries(T0.cols.map(c => [c.name, c.type])), cols: want.map(([, c]) => c.name), by: (a.by || []).map(w => colOf(w, T0).name), where, bdl: a.bdl || 'exclude' } };
}
const waiting = (read, T0) => ({ read, body: [{ t: 'note', text: `Reading all ${mb(T0.size)} of ${T0.name}…` }, srcOf(T0)], trace: ['scan: queued over the whole file'] });
const noRunner = (read, T0) => ({ read, body: [{ t: 'note', kind: 'err', text: `${T0.name} is not on this device any more, or nothing here can read it. Open it again from your files.` }], trace: ['scan: no runner or no file'] });
function streamedQuery(a) {
  const T0 = S.table, R = T0.roles;
  const refuse = text => ({ read: [a.kind], body: [{ t: 'note', kind: 'err', text }, srcOf(T0)], trace: ['streamed table: stop'] });
  if (['list', 'corr', 'check'].includes(a.kind)) return refuse(`${T0.name} is ${mb(T0.size)}, read as a stream, not held: ${a.kind === 'list' ? 'listing and sorting rows' : a.kind === 'corr' ? 'a correlation' : 'an interval check'} needs every row at once. Means, medians, counts, values and histograms work.`);
  const q = request(a, T0); if (q.err) return refuse(q.err);
  const weight = a.kind === 'agg' ? (a.weight || (R.from ? 'length' : 'count')) : 'count';
  const req = { ...q.req, kind: a.kind, aggs: a.aggs || [], weight, from: R.from || null, to: R.to || null };
  const whereText = req.where ? predicateToString(parsePredicate(req.where)) : null;
  const read = a.kind === 'count' ? ['count rows', ...(req.by.length ? ['by', { v: req.by.join(' and ') }] : [])] : a.kind === 'distinct' ? ['distinct values of', { v: req.cols[0] }] : [a.aggs.map(aggLabel).join(' and '), 'of', { v: req.cols.join(' and ') }, ...(req.by.length ? ['by', { v: req.by.join(' and ') }] : [])];
  if (whereText) read.push('where', { v: whereText });
  if (a.kind === 'agg' && R.from) read.push({ v: `weighted by ${weight}`, key: 'weight', alts: ['length', 'count'], cur: weight });
  const r = result('scan', req);
  if (r === undefined) return { ...waiting(read, T0), pending: { job: 'scan', req } };
  if (r === null || r.error) return noRunner(read, T0);
  const trace = [`scan ${T0.name}: ${r.rows.toLocaleString('en-US')} rows in ${(r.ms / 1000).toFixed(1)} s`, ...(whereText ? [`sift: ${whereText} → ${r.matched.toLocaleString('en-US')} rows`] : [])];
  if (a.kind === 'count') {
    if (!req.by.length) return { read, value: r.matched, body: [{ t: 'big', v: r.matched.toLocaleString('en-US'), unit: 'rows' }, srcOf(T0)], trace };
    const out = [...r.groups].sort((x, y) => y.n - x.n);
    return { read, body: [{ t: 'table', head: [req.by.join(' / '), 'rows'], num: [false, true], rows: out.map(g => [g.key, g.n.toLocaleString('en-US')]) }, srcOf(T0)], trace };
  }
  if (a.kind === 'distinct') return { read, body: [{ t: 'table', head: [req.cols[0], 'rows'], num: [false, true], rows: r.values.map(([k, n]) => [String(k), n.toLocaleString('en-US')]) }, ...(r.overflow ? [{ t: 'note', text: 'More than 1,000 distinct values: the first 1,000 seen are counted.' }] : []), srcOf(T0)], trace };
  const bad = req.cols.find(c => req.types[c] !== 'numeric'); if (bad) return refuse(`${bad} is a category, not a number. Try "count by ${bad}" or "distinct ${bad}".`);
  trace.push(`skip ${r.skipped.null} blank, ${r.skipped.bdl} below-detection (${req.bdl})`, `${weight === 'length' ? `length-weighted over ${R.from}–${R.to}` : 'sample-count weighted'} moments (weightedStats)`);
  const approx = a.aggs.some(APPROX), notes = approx ? [{ t: 'note', text: `Medians and percentiles come from a t-digest: approximate, and counted by sample${weight === 'length' ? ', not by length (the digest takes no weights)' : ''}.` }] : [];
  const unit = c => { const k = S.table.cols.find(x => x.name === c); return k && k.unit ? ` (${k.unit})` : ''; };
  if (!req.by.length && req.cols.length === 1 && a.aggs.length === 1) { const v = r.groups[0] && r.groups[0].cells[req.cols[0]][a.aggs[0]]; return { read, value: v, body: [v == null ? { t: 'note', kind: 'err', text: 'No usable values after the filter.' } : { t: 'big', v: (APPROX(a.aggs[0]) ? '≈ ' : '') + fmt(v, 4), unit: unit(req.cols[0]).replace(/[()\s]/g, '') }, ...notes, srcOf(T0)], trace }; }
  const head = [...(req.by.length ? [req.by.join(' / ')] : []), ...req.cols.flatMap(c => a.aggs.map(g => `${aggLabel(g)}${APPROX(g) ? ' ≈' : ''} ${c}${unit(c)}`))];
  const rows = r.groups.map(g => [...(req.by.length ? [g.key] : []), ...req.cols.flatMap(c => a.aggs.map(x => g.cells[c][x] == null ? '' : fmt(g.cells[c][x], 4)))]);
  return { read, body: [{ t: 'table', head, num: head.map((_, i) => i >= (req.by.length ? 1 : 0)), rows }, ...notes, srcOf(T0)], trace };
}
function streamedHist(a) {
  const T0 = S.table, c = colOf(a.col, T0); if (!c) return null;
  const read = ['histogram of', { v: c.name }, { v: a.log ? 'log scale' : 'linear scale', key: 'log', alts: [false, true], cur: !!a.log }];
  if (c.type !== 'numeric') return { read, body: [{ t: 'note', kind: 'err', text: `${c.name} is a category, not a number. Try "count by ${c.name}".` }], trace: ['column is categorical'] };
  const q = request({ cols: [a.col], where: a.where, bdl: a.bdl }, T0); if (q.err) return { read, body: [{ t: 'note', kind: 'err', text: q.err }], trace: ['stop'] };
  const req = { ...q.req, kind: 'hist', log: !!a.log }, r = result('scan', req);
  if (r === undefined) return { ...waiting(read, T0), pending: { job: 'scan', req } };
  if (r === null || r.error) return noRunner(read, T0);
  if (r.n < 2) return { read, body: [{ t: 'note', kind: 'err', text: `${c.name} has ${r.n} positive value${r.n === 1 ? '' : 's'}; nothing to bin.` }], trace: ['scan: too few values'] };
  const inv = x => a.log ? Math.pow(10, x) : x, unit = c.unit || '';
  return { read, body: [{ t: 'bars', label: `Histogram of ${c.name}`, bins: r.bins, ticks: [0, .5, 1].map(t => fmt(inv(r.lo + t * (r.hi - r.lo)), 2)), lo: inv(r.lo), hi: inv(r.hi), log: !!a.log, xlabel: unit ? `${c.name} (${unit})` : c.name, ylabel: 'rows' },
    { t: 'kv', rows: [['n', r.n.toLocaleString('en-US')], ['mean', `${fmt(r.stats.mean, 3)} ${unit}`], ['median ≈', `${fmt(r.stats.median, 3)} ${unit} (t-digest)`], ['range', `${fmt(r.stats.min, 3)} to ${fmt(r.stats.max, 3)} ${unit}`]] }, srcOf(T0)],
    trace: [`scan ${T0.name}: ${r.rows.toLocaleString('en-US')} rows, two passes (range, then 18 ${a.log ? 'log10' : 'linear'} bins) in ${(r.ms / 1000).toFixed(1)} s`] };
}
function streamedOpen(a) {
  const f = S.files[a.file.hash], s = streamedTable(f.name, f.size, f.head, f.hash);
  if (s.err) return { read: ['open table', { v: f.name }], body: [{ t: 'note', kind: 'err', text: s.err }], trace: ['recon: the first megabyte'] };
  const t = openTable(s.table), rows = [['size', `${mb(t.size)}, read as a stream`], ['columns', t.cols.map(c => `${c.name} (${c.type === 'numeric' ? (c.unit || 'number') : 'category'}${c.analyte ? ', ' + c.analyte : ''})`).join(' · ')]];
  if (t.roles.from) rows.push(['intervals', `${t.roles.from} to ${t.roles.to}${t.roles.hole ? ' by ' + t.roles.hole : ''}`]);
  return { read: ['open table', { v: t.name }], body: [{ t: 'kv', rows }, { t: 'note', text: `Too large to hold: questions about it read the whole file each time (means, medians, counts, values, histograms). Columns were typed from its first ${t.headRows.toLocaleString('en-US')} rows.` }, srcOf(t)],
    trace: [`recon.sniff(${t.name}, first ${mb(f.head.length)}) → delimiter "${t.delimiter}", ${t.cols.length} columns typed`, 'rows: not held; scanned per question'], py: `dh = stream_csv("${t.name}")` };
}
// the table tools, taught about streamed tables; the rest refuse on one
const base = { open: T.open, query: T.query, hist: T.hist, apply: T.apply, tableExport: T.tableExport };
T.open = a => a && a.file && S.files[a.file.hash] && S.files[a.file.hash].streamed ? streamedOpen(a) : base.open(a);
T.query = a => S.table && S.table.streamed ? streamedQuery(a) : base.query(a);
T.hist = a => S.table && S.table.streamed ? streamedHist(a) : base.hist(a);
for (const k of ['apply', 'tableExport']) T[k] = a => S.table && S.table.streamed
  ? { read: [k === 'apply' ? 'a skill on every row' : 'export the table'], body: [{ t: 'note', kind: 'err', text: `${S.table.name} is ${mb(S.table.size)}, read as a stream, not held: ${k === 'apply' ? 'a skill on every row' : 'writing it out again'} is not offered for it.` }], trace: ['streamed table: stop'] }
  : base[k](a);

// Real files: a CSV through recon's typing, table questions in controlled English, table nouns for the
// parser, and replay with the file kept on the device. Expected values are recomputed here from the
// fixture by plain arithmetic, independently of the engine's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as g from '../src/engine/index.js';

const CSV = readFileSync(new URL('./fixtures/holes.csv', import.meta.url), 'utf8');
const last = () => g.S.cards[g.S.cards.length - 1];
const ask = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
// the fixture as plain rows, for independent expectations
const ROWS = CSV.trim().split('\n').slice(1).map(l => { const [h, f, t, lith, cu, au, fe, d] = l.split(','); const n = s => s === '-99' ? null : +s; return { h, f: +f, t: +t, lith, cu: n(cu), au: n(au), fe: n(fe), d: +d }; });
const wmean = (rs, k) => { const v = rs.filter(r => r[k] != null && r[k] >= 0); const W = v.reduce((s, r) => s + (r.t - r.f), 0); return v.reduce((s, r) => s + r[k] * (r.t - r.f), 0) / W; };
const mean = (rs, k) => { const v = rs.filter(r => r[k] != null && r[k] >= 0).map(r => r[k]); return v.reduce((a, b) => a + b, 0) / v.length; };

test('a CSV opens through recon with typed columns, units, analytes and roles', () => {
  g.reset();
  const o = g.openFile('holes.csv', CSV);
  assert.equal(o.kind, 'card');
  const t = g.S.table;
  assert.equal(t.name, 'holes.csv'); assert.equal(t.rows.length, 28); assert.equal(t.source, 'file');
  assert.deepEqual(t.roles, { hole: 'HOLEID', from: 'FROM', to: 'TO' });
  assert.equal(t.cols.find(c => c.name === 'CU_PCT').analyte, 'Cu');
  assert.equal(t.cols.find(c => c.name === 'AU_PPM').unit, 'ppm');
  assert.equal(t.cols.find(c => c.name === 'LITHO').type, 'categorical');
  assert.equal(t.rows[13].CU_PCT, null, '-99 is a sentinel, read as blank');
  assert.ok(g.textOf(o.card).includes('typed by @gcu/recon'));
  assert.ok(g.textOf(o.card).includes('below-detection'), 'negative codes are called out');
});

test('table questions: aggregates, where, by, weighting, counts, lists, distinct, correlation', () => {
  g.reset(); g.openFile('holes.csv', CSV);
  let c = ask('mean cu');
  assert.equal(c.tool, 'query');
  assert.ok(Math.abs(c.res.value - wmean(ROWS, 'cu')) < 1e-9, 'length-weighted by default when intervals exist');
  assert.ok(c.res.read.some(s => s.key === 'weight'), 'the weighting is a slot');
  c = ask('mean cu weighted by count');
  assert.ok(Math.abs(c.res.value - mean(ROWS, 'cu')) < 1e-9);
  c = ask('mean copper by litho where au > 0.1');
  const brx = ROWS.filter(r => r.au != null && r.au > 0.1 && r.lith === 'BRX');
  const row = c.res.body[0].rows.find(r => r[0] === 'BRX');
  assert.ok(row, 'grouped table has a BRX row');
  assert.ok(Math.abs(+row[1] - wmean(brx, 'cu')) < 1e-3, `BRX mean ${row[1]} vs ${wmean(brx, 'cu')}`);
  assert.ok(c.res.body.some(b => b.t === 'hbars'), 'a bar chart for a grouped single aggregate');
  c = ask('how many samples where cu > 0.5 and litho is BRX');
  assert.equal(c.res.value, ROWS.filter(r => r.cu != null && r.cu > 0.5 && r.lith === 'BRX').length);
  c = ask('count by litho');
  assert.deepEqual(c.res.body[0].rows.map(r => r[0]).sort(), ['BRX', 'DYK', 'GRD']);
  c = ask('top 3 rows sorted by au descending');
  assert.equal(c.res.body[0].rows.length, 3);
  assert.equal(c.res.body[0].rows[0][5], '0.8', 'highest gold first');
  c = ask('distinct litho');
  assert.equal(c.res.body[0].rows.length, 3);
  c = ask('correlation of cu and au');
  assert.ok(c.res.value > 0.9, 'copper and gold move together in the fixture');
  c = ask('median and p90 of fe');
  assert.equal(c.res.body[0].head.length, 2);
  c = ask('mean of nothing');
  assert.equal(c.rung, 'none', 'a word that names no column is no reading');
  c = ask('mean litho');
  assert.ok(g.textOf(c).includes('is a category'));
});

test('interval checks find the gap and the overlap in DH-004', () => {
  g.reset(); g.openFile('holes.csv', CSV);
  const c = ask('check intervals');
  const kv = Object.fromEntries(c.res.body[0].rows);
  assert.equal(kv.gaps, '1'); assert.equal(kv.overlaps, '1'); assert.equal(kv.holes, '4');
  const issues = c.res.body[2].rows;
  assert.deepEqual(issues.map(r => r[1]).sort(), ['gap', 'overlap']);
  assert.ok(issues.every(r => r[0] === 'DH-004'));
});

test('the parser learns the table nouns: a histogram of a column it never heard of', () => {
  g.reset(); g.openFile('holes.csv', CSV);
  const c = ask('histogram of fe');
  assert.equal(c.tool, 'hist');
  assert.equal(c.args.col, 'FE');
  assert.ok(c.res.trace[0].startsWith('clause: '), 'read by the grammar, through the table nouns');
  const d = ask('histogram of iron in log scale');
  assert.equal(d.args.col, 'FE'); assert.equal(d.args.log, true);
  const e = ask('what is the histogram of density');
  assert.equal(e.args.col, 'DENSITY');
});

test('amendments on a table question: by, where, weighting, another aggregate', () => {
  g.reset(); g.openFile('holes.csv', CSV);
  ask('mean cu');
  let c = ask('by litho'); assert.equal(c.rung, 'context'); assert.deepEqual(c.args.by, ['litho']);
  c = ask('where fe > 12'); assert.equal(c.rung, 'context'); assert.equal(c.args.where, 'fe > 12');
  c = ask('weighted by count'); assert.equal(c.args.weight, 'count');
  c = ask('and median'); assert.deepEqual(c.args.aggs, ['mean', 'median']);
});

test('a session with a file replays from the device store, and says so when the file is gone', () => {
  g.reset(); g.openFile('holes.csv', CSV); ask('mean cu by litho');
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  assert.ok(saved.files[g.hashOf(CSV)], 'the file travels with the device state');
  g.reset(); g.hydrate(saved);
  assert.equal(g.S.cards.length, 2); assert.equal(g.S.table.name, 'holes.csv');
  assert.ok(g.textOf(g.S.cards[1]).includes('BRX'));
  delete saved.files[g.hashOf(CSV)];
  g.reset(); g.hydrate(saved);
  assert.ok(g.textOf(g.S.cards[0]).includes('not kept on this device'));
  assert.equal(g.S.table, null);
  assert.ok(g.S.cards[1].res.ask, 'the next card asks for a table instead of pretending');
});

test('the sample table still answers the old questions', () => {
  g.reset();
  const c = ask('histogram of cu');
  assert.ok(c.res.ask); g.answer(c, 0);
  assert.ok(g.textOf(c).includes('median'));
  assert.equal(ask('mean cu by lith').res.body[0].rows.length, 3);
  assert.equal(g.current().name, 'assays.csv: Cu histogram, Cu mean');
});

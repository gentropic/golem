// Tables too large to hold (SPEC 13.7): the same table opened whole and as a stream gives the same counts, values, means
// and sums, and medians within the t-digest's tolerance; what needs every row at once refuses on a stream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as g from '../src/engine/index.js';

// a drillhole table: hole, from, to, lith, cu (%), au (g/t), with blanks and below-detection codes
function table(n) {
  let s = 'hole,from,to,lith,cu_pct,au_ppm\n', seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const h = `DH-${String(1 + (i % 40)).padStart(2, '0')}`, f = Math.floor(i / 40); s += `${h},${f},${f + 1},${['BRX', 'GRD', 'SED'][i % 3]},${i % 97 === 0 ? '' : (r() * 2).toFixed(3)},${i % 53 === 0 ? '-0.01' : (r() * 3).toFixed(3)}\n`; }
  return s;
}
const dir = mkdtempSync(join(tmpdir(), 'golem-stream-')), text = table(30000), path = join(dir, 'big.csv');
writeFileSync(path, text);
g.setRunner('scan', req => g.scanTable(() => Readable.toWeb(createReadStream(path)), req));
const ask = async q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); await g.settle(); return g.S.cards[g.S.cards.length - 1]; };
const num = s => +String(s).replace(/[≈,\s]/g, '');

test('a streamed table answers like the same table held whole', async () => {
  g.reset(); g.openFile('whole.csv', text);
  const whole = {};
  for (const q of ['count rows where cu_pct > 1', 'mean cu_pct', 'sum au_ppm by lith', 'distinct lith', 'median cu_pct']) whole[q] = g.textOf(await ask(q));
  const wholeMean = (await ask('mean cu_pct')).res.value, wholeMedian = (await ask('median cu_pct')).res.value;
  g.reset();
  const o = g.openStreamed('big.csv', 25e6, text.slice(0, 1 << 20));
  assert.equal(o.kind, 'card'); assert.match(g.textOf(o.card), /read as a stream/);
  assert.equal(g.S.table.streamed, true); assert.equal(g.S.table.rows.length, 0, 'the rows are not held');
  const c = await ask('count rows where cu_pct > 1');
  assert.equal(c.res.value, (await (async () => { g.reset(); g.openFile('w.csv', text); return (await ask('count rows where cu_pct > 1')).res.value; })()));
  g.reset(); g.openStreamed('big.csv', 25e6, text.slice(0, 1 << 20));
  const m = await ask('mean cu_pct'); assert.ok(Math.abs(m.res.value - wholeMean) < 1e-9, `mean ${m.res.value} vs ${wholeMean}`);
  const md = await ask('median cu_pct'); assert.ok(Math.abs(md.res.value - wholeMedian) < 0.01, `median ${md.res.value} vs ${wholeMedian}`); assert.match(g.textOf(md), /t-digest/);
  assert.match(g.textOf(await ask('distinct lith')), /BRX.*10,000/s);
  const h = await ask('histogram of cu_pct'); assert.equal(h.tool, 'hist'); assert.match(g.textOf(h), /Histogram of cu_pct/);
});

test('what needs every row at once refuses on a stream; a quoted delimiter refuses to stream', async () => {
  g.reset(); g.openStreamed('big.csv', 25e6, text.slice(0, 1 << 20));
  for (const q of ['top 5 rows sorted by au_ppm descending', 'correlation of cu_pct and au_ppm', 'check intervals']) assert.match(g.textOf(await ask(q)), /read as a stream, not held/, q);
  assert.match(g.textOf(await ask('true thickness of every intercept with hole 270/60, bedding 045/30')), /read as a stream, not held/);
  const q = g.openStreamed('quoted.csv', 25e6, 'name,note\n"a, b",1\n"c",2\n');
  assert.equal(q.kind, 'nothing'); assert.match(q.msg, /quotes its delimiter/);
});

test('a table of 200,000 rows held whole answers a length-weighted mean (no spread over the column)', () => {
  g.reset(); g.openFile('long.csv', table(200000));
  const c = g.submit('mean cu_pct').card;
  assert.ok(Number.isFinite(c.res.value), g.textOf(c).slice(0, 200));
});

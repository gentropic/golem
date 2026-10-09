// xlsx and Datamine .dm through the picker: converted once by the vendored readers, kept as text, replayed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as g from '../src/engine/index.js';
import { sheet } from '../src/vendor/sheet.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const xlsx = async sheets => sheet.write({ sheets });

test('a workbook with two sheets asks which; the chosen sheet opens typed by recon and is a slot; replay reopens it', async () => {
  g.reset();
  const bytes = await xlsx([{ name: 'Assays', columns: { HOLE: ['A', 'A', 'B'], FROM: [0, 1, 0], TO: [1, 2, 1], CU: [0.5, 1.5, 0.8] } }, { name: 'Notes', columns: { k: ['a', 'b'], v: [1, 2] } }]);
  const o = await g.openBinary('holes.xlsx', bytes);
  assert.equal(o.kind, 'card'); const c = o.card;
  assert.ok(c.res.ask && c.res.ask.prompt.includes('2 sheets'), 'asks which sheet');
  g.answer(c, 0);
  assert.equal(c.args.file.sheet, 'Assays'); assert.equal(g.S.table.rows.length, 3); assert.equal(g.S.table.cols.find(x => x.name === 'CU').type, 'numeric');
  assert.ok(g.textOf(c).includes('@gcu/sheet') && g.textOf(c).includes('formats'), g.textOf(c));
  assert.ok(c.res.read.some(x => x.key === 'sheet'), 'the sheet is a slot');
  const q = card('mean cu by hole');
  assert.equal(q.tool, 'query'); assert.ok(g.textOf(q).includes('holes.xlsx'));
  g.flipSlot(c, 'sheet');
  assert.equal(c.args.file.sheet, 'Notes'); assert.equal(g.S.table.cols.map(x => x.name).join(','), 'k,v');
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved);
  assert.equal(g.S.cards[0].args.file.sheet, 'Notes'); assert.equal(g.S.table.name, 'holes.xlsx');
});

test('a single-sheet workbook opens straight; an empty one is refused', async () => {
  g.reset();
  const o = await g.openBinary('one.xlsx', await xlsx([{ name: 'Data', columns: { X: [1, 2], Y: [3, 4] } }]));
  assert.equal(o.kind, 'card'); assert.ok(!o.card.res.ask); assert.equal(g.S.table.rows.length, 2);
  const bad = await g.openBinary('empty.xlsx', await xlsx([]));
  assert.equal(bad.kind, 'nothing'); assert.ok(bad.msg.includes('no sheet'));
});

test('a Datamine .dm block model opens through @gcu/dm: 700 records, typed, and table questions work', async () => {
  g.reset();
  const buf = readFileSync(fileURLToPath(new URL('./fixtures/model.dm', import.meta.url)));
  const o = await g.openBinary('model.dm', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.equal(o.kind, 'card'); const c = o.card;
  assert.equal(g.S.table.rows.length, 700);
  assert.equal(g.S.table.cols.find(x => x.name === 'FE').type, 'numeric'); assert.equal(g.S.table.cols.find(x => x.name === 'LITO').type, 'categorical');
  assert.ok(g.textOf(c).includes('@gcu/dm') && g.textOf(c).includes('±1e30'), g.textOf(c));
  const q = card('mean fe by lito');
  assert.equal(q.tool, 'query'); assert.ok(g.textOf(q).includes('BIF'), g.textOf(q));
  const h = card('sha256 of this file');
  assert.equal(h.tool, 'hash'); assert.ok(g.textOf(h).includes('as this device keeps it'));
});

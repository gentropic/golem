// YAML ↔ JSON, WKT ↔ GeoJSON, DXF → GeoJSON or WKT, and Parquet both ways for the open table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as g from '../src/engine/index.js';
import { openFile, openBinary } from '../src/engine/engine.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const kv = (c, k) => c.res.body.filter(b => b.t === 'kv').flatMap(b => b.rows).find(r => r[0] === k)[1];
const note = c => c.res.body.filter(b => b.t === 'note').map(b => b.text).join(' ');

test('JSON to YAML and back: the strict subset, every string quoted, the same value both ways', () => {
  g.reset();
  const value = { hole: 'DH-12', depth: 240.5, n: 3, ok: true, none: null, tags: ['no', 'yes'], nested: { a: [] } };
  const y = card('json to yaml: ' + JSON.stringify(value));
  assert.equal(y.tool, 'convertText'); assert.equal(y.args.from, 'json');
  assert.ok(y.res.value.includes('hole: "DH-12"') && y.res.value.includes('  - "no"'), y.res.value);
  assert.equal(y.res.file.name, 'converted.yaml');
  const back = card('yaml to json:\n' + y.res.value);
  assert.deepEqual(JSON.parse(back.res.value), value);
  g.submit('as yaml'); assert.equal(g.S.cards.at(-1).args.to, 'yaml', 'the target amends');
});

test('YAML outside the strict subset is refused with its line, not guessed', () => {
  g.reset();
  const c = card('yaml to json: hole: DH-12');
  assert.ok(note(c).includes('line 1') && note(c).includes('quoted'), note(c));
  assert.equal(c.res.value, undefined);
});

test('WKT to GeoJSON and back; an SRID is said to be dropped; several lines make a collection', () => {
  g.reset();
  const p = card('wkt to geojson: POINT (30 10)');
  assert.deepEqual(JSON.parse(p.res.value), { type: 'Point', coordinates: [30, 10] });
  const s = card('wkt to geojson: SRID=31983;POINT (600000 7700000)');
  assert.ok(note(s).includes('SRID 31983'), note(s)); assert.ok(!('srid' in JSON.parse(s.res.value)));
  const many = card('wkt to geojson:\nPOINT (1 2)\nLINESTRING (0 0, 1 1)');
  assert.equal(JSON.parse(many.res.value).features.length, 2);
  const w = card('as wkt: {"type": "Feature", "properties": {"id": 1}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [10, 5]]}}');
  assert.equal(w.args.from, 'geojson', 'sniffed'); assert.equal(w.res.value.trim(), 'LINESTRING (0 0, 10 5)');
  assert.ok(note(w).includes('properties'), 'what WKT cannot hold is said');
  const bad = card('wkt to yaml: POINT (1 2)');
  assert.ok(note(bad).includes('can become GeoJSON'), note(bad));
});

test('a DXF from the picker becomes GeoJSON, with curves and units stated; WKT is a slot; replay reopens it', () => {
  g.reset();
  const o = openFile('pit.dxf', readFileSync(new URL('./fixtures/pit.dxf', import.meta.url), 'utf8'));
  const c = o.card; assert.equal(c.tool, 'convertFile');
  const fc = JSON.parse(c.res.value);
  assert.equal(fc.features.length, 3);
  assert.deepEqual(fc.features[0].geometry, { type: 'LineString', coordinates: [[0, 0], [10, 5]] }, '2-D stays 2-D');
  assert.equal(fc.features[1].geometry.type, 'Polygon'); assert.equal(fc.features[1].geometry.coordinates[0].length, 65);
  assert.deepEqual(fc.features[2].geometry.coordinates, [100.5, 200.25]);
  assert.ok(kv(c, 'units').startsWith('m, as the file states'));
  assert.ok(note(c).includes('1 circle written as points'));
  g.flipSlot(c, 'to'); assert.equal(c.args.to, 'wkt'); assert.ok(c.res.value.startsWith('LINESTRING (0 0, 10 5)\nPOLYGON ('));
  assert.equal(card('open pit.dxf').tool, 'open', 'open by name reads the file');
  assert.ok(g.S.cards.at(-1).res.value.includes('FeatureCollection'));
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved);
  assert.ok(g.S.cards[0].res.value.startsWith('LINESTRING'), 'replayed from the kept text');
});

test('the open table as Parquet, saved as bytes, and a Parquet file opens back as the same table', async () => {
  g.reset();
  card('open assays.csv');
  const c = card('the table as parquet');
  assert.equal(c.tool, 'tableExport'); assert.equal(c.res.file.name, 'assays.parquet');
  assert.ok(c.res.file.bytes instanceof Uint8Array && c.res.file.bytes.length > 1000);
  assert.ok(g.textOf(c).includes('sample data'), 'still labelled as sample data');
  const rows = g.S.table.rows.length, cu = g.S.table.rows.reduce((s, r) => s + (r.cu || 0), 0);
  const o = await openBinary('assays.parquet', c.res.file.bytes);
  assert.equal(g.S.table.rows.length, rows); assert.equal(g.S.table.rows.reduce((s, r) => s + (r.cu || 0), 0), cu);
  assert.ok(g.textOf(o.card).includes('@gcu/parquet'));
});

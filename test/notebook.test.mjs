// The field notebook: stations, attitudes and samples written to a device table at the open station; a compass reading
// at a station with a position corrected to true north there; the summary, the table, the GeoJSON; undo and replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const pin = () => { g.clock.now = () => new Date(2026, 9, 15, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };
const fresh = () => { g.reset(); pin(); g.newSession(); };
const card = q => { const o = g.submit(q); return o.card || o.cards[o.cards.length - 1]; };
const rows = () => (g.S.tables.field ? g.S.tables.field.rows : []);

test('every way of saying it reads through the grammar', () => {
  fresh();
  for (const [q, tool] of [['station 14', 'station'], ['station BH-3 at -19.92, -43.94', 'station'], ['new station 15', 'station'], ['estação 16', 'station'], ['ponto 17', 'station'],
    ['add bedding 045/30', 'fieldAdd'], ['add a joint 120/80', 'fieldAdd'], ['add lineation 200/30', 'fieldAdd'], ['add bedding 040/30 to station 14', 'fieldAdd'],
    ['sample S-14-a', 'fieldAdd'], ['add sample S-14-b weathered BRX', 'fieldAdd'],
    ['summary of station 14', 'fieldSummary'], ['station 14 summary', 'fieldSummary'], ['show station 14', 'fieldSummary'], ['resumo da estação 14', 'fieldSummary'], ['the field notebook', 'fieldSummary'],
    ['export the field notebook as geojson', 'fieldExport'], ['export the field notebook as csv', 'fieldExport'], ['open the field notebook', 'open']]) {
    const c = card(q); assert.equal(c.tool, tool, q); assert.equal(c.rung, 'grammar', q);
  }
  // what read before still does: a number with a unit is not a station
  assert.equal(card('true thickness of a 14m intercept, hole 270/60, bedding 045/30').tool, 'thickness');
  assert.equal(card('2 km in miles').tool, 'convert');
});

test('adding needs an open station; rows go to the station that is open, or the one named', () => {
  fresh();
  const none = card('add bedding 045/30');
  assert.match(g.textOf(none), /No station is open: start one where you stand with "station 14"/); assert.equal(rows().length, 0);
  card('station 14'); card('add bedding 045/30'); card('add sample S-14-a weathered BRX');
  card('station 15 at -20, -44'); card('add bedding 050/34'); card('add joint 120/80 to station 14');
  const at14 = rows().filter(r => r.station === '14' && r.feature !== 'station');
  assert.deepEqual(at14.map(r => r.feature), ['bedding', 'sample', 'joint']);
  assert.deepEqual(rows().find(r => r.sample), { ...rows().find(r => r.sample), sample: 'S-14-A', note: 'weathered BRX' });
  assert.equal(rows().find(r => r.station === '15' && r.feature === 'bedding').lat, -20, 'a row carries its station\'s position');
  assert.equal(rows().find(r => r.feature === 'bedding').north, 'as typed', 'a typed attitude is kept as typed');
});

test('a station without coordinates asks for one fix, and keeps it', () => {
  fresh();
  const c = card('station 14');
  assert.equal(c.res.capture.kind, 'position');
  g.capture(c, { lat: -19.92, lon: -43.94, acc: 6, at: +new Date(2026, 9, 15, 10, 5) });
  const st = rows().find(r => r.feature === 'station');
  assert.deepEqual([st.lat, st.lon, st.acc, st.via], [-19.92, -43.94, 6, 'position fix']);
  assert.equal(c.res.capture, null, 'answered');
});

test('a compass reading added at a station is true north there (WMM), magnetic where the station has no place', () => {
  fresh();
  const m = card('measure bedding'); g.capture(m, { alpha: 100, beta: 30, gamma: 0, acc: 3, at: +new Date(2026, 9, 15, 10, 1) });   // 080/30 magnetic
  card('station 14');
  let a = card(`add #${m.id}`);
  assert.match(g.textOf(a), /080\/30 dip direction\/dip, bedding/); assert.match(g.textOf(a), /magnetic \(the station has no position\)/);
  card('station 15 at -19.92, -43.94');
  a = card(`add #${m.id}`);
  const r = rows().filter(x => x.feature === 'bedding').pop();
  assert.ok(r.azimuth > 54 && r.azimuth < 60, `080 magnetic less about 23° west declination (${r.azimuth})`); assert.match(r.north, /^true \(WMM at the station/);
  assert.match(g.textOf(a), /from phone compass, card #01/);
  // a plane typed on a card can be added too; a card that is neither is not read as one
  const p = card('plane 120/55'); card(`add #${p.id}`); assert.equal(rows().pop().azimuth, 120);
  assert.notEqual(card(`add #${a.id}`).tool, 'fieldAdd');
});

test('the summary: a net, counts, the mean of each kind of plane; the notebook opens as a table and saves as GeoJSON', () => {
  fresh();
  card('station 14 at -19.92, -43.94'); card('add bedding 045/30'); card('add bedding 050/34'); card('add bedding 040/28'); card('add lineation 200/30'); card('sample S-14-a');
  const s = card('station 14 summary'), t = g.textOf(s);
  assert.match(t, /planes 3/); assert.match(t, /lines 1/); assert.match(t, /samples S-14-A/); assert.match(t, /mean bedding 04\d\/3\d from 3, α95/);
  const net = s.res.body.find(b => b.t === 'net'); assert.equal(net.planes.length, 3); assert.equal(net.lines.length, 1);
  card('open the field notebook'); assert.equal(g.S.table.name, 'field');
  assert.match(g.textOf(card('mean dip by feature')), /bedding/);
  const e = card('export the field notebook as geojson'), gj = JSON.parse(e.res.file.text);
  assert.equal(gj.type, 'FeatureCollection'); assert.equal(gj.features.length, 6);
  assert.deepEqual(gj.features[1].geometry, { type: 'Point', coordinates: [-43.94, -19.92] }); assert.equal(gj.features[1].properties.feature, 'bedding');
  assert.equal(e.res.file.name, 'field-notebook.geojson');
});

test('undo removes the row; the notebook is device state and the cards replay', () => {
  fresh();
  card('station 14'); card('add bedding 045/30'); card('add joint 120/80');
  g.undo(); assert.deepEqual(rows().map(r => r.feature), ['station', 'bedding']);
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  g.reset(); pin(); g.hydrate(saved);
  assert.deepEqual(rows().map(r => r.feature), ['station', 'bedding']);
  assert.match(g.textOf(g.S.cards[1]), /Added to station 14/);
});

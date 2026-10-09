// Places, distance, UTM, sun and moon: the checks from the skills spec and the round trips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('one degree of longitude on the equator is 111.32 km; bearings; a saved place reads; antipodes refuse', () => {
  g.reset();
  const c = card('distance from 0,0 to 0,1');
  assert.equal(c.tool, 'distance'); near(c.res.value, 111319.49, 0.01, 'metres');
  const d = card('distance from -19.92,-43.94 to -6.07,-50.16');
  near(d.res.value / 1000, 1673.5, 1, 'Belo Horizonte to Carajás');
  // Geoscience Australia's Vincenty test line: Flinders Peak to Buninyong, 54 972.271 m, forward azimuth 306° 52′ 05.37″
  const ga = g.vincenty(-(37 + 57 / 60 + 3.72030 / 3600), 144 + 25 / 60 + 29.52440 / 3600, -(37 + 39 / 60 + 10.15610 / 3600), 143 + 55 / 60 + 35.38390 / 3600);
  near(ga.s, 54972.271, 0.002, 'Flinders Peak to Buninyong'); near(ga.a1, 306 + 52 / 60 + 5.37 / 3600, 1e-5, 'forward azimuth');
  assert.ok(g.textOf(d).includes('not by road'));
  card('home is -19.92, -43.94');
  const h = card('distance from home to -6.07,-50.16');
  near(h.res.value, d.res.value, 1e-6, 'the saved place');
  const ask = card('distance from home to carajas');
  assert.ok(ask.res.ask && ask.res.ask.prompt.includes('Where is carajas'));
  g.submit('-6.07, -50.16');
  near(ask.res.value, d.res.value, 1e-6, 'answered with coordinates');
  assert.ok(g.textOf(card('distance from 0,0 to 0.5,179.7')).includes('antipodal'));
  const r = g.vincenty(-19.92, -43.94, -6.07, -50.16);
  assert.ok(r.a1 > 320 && r.a1 < 340, `initial bearing north-west: ${r.a1}`);
});

test('0, -45 in utm is zone 23, E 500000, N 0; the meridian arc to 45° N; round trips close to a millimetre; zone edge slot', () => {
  g.reset();
  const c = card('0, -45 in utm');
  assert.equal(c.tool, 'utm'); assert.deepEqual(c.res.value.map(Math.round), [500000, 0]); assert.ok(c.res.body[0].v.startsWith('23N'), c.res.body[0].v);
  const m = g.toUTM(45, 3, 31);   // on the central meridian of zone 31: northing = k0 × meridian arc
  near(m.northing, 0.9996 * 4984944.378, 0.01, 'meridian arc'); near(m.easting, 500000, 1e-6, 'on the meridian');
  for (const [lat, lon] of [[-19.92, -43.94], [51.5, -0.12], [-33.9, 151.2], [60.2, 5.3], [78.2, 15.6]]) {
    const u = g.toUTM(lat, lon), back = g.fromUTM(u.zone, u.hemisphere, u.easting, u.northing);
    near(back.lat, lat, 1e-8, 'lat round trip'); near(back.lon, lon, 1e-8, 'lon round trip');
  }
  assert.equal(g.toUTM(60.2, 5.3).zone, 32, 'the Norway exception'); assert.equal(g.toUTM(78.2, 15.6).zone, 33, 'Svalbard');
  const bh = card('-19.92, -43.94 in utm');
  assert.ok(bh.res.body[0].v.startsWith('23K'), bh.res.body[0].v);
  near(bh.res.value[1], 7796000, 2000, 'Belo Horizonte northing, roughly');
  const inv = card('utm 23k 611000 7797000 to lat long');
  near(inv.res.value[0], -19.92, 0.01, 'back to latitude'); near(inv.res.value[1], -43.94, 0.01, 'back to longitude');
  const edge = card('10, 11.9 in utm');
  assert.ok(edge.res.read.some(x => x.key === 'zoneForced' && x.alts.length === 2), 'half a degree from a zone edge: a slot');
  g.flipSlot(edge, 'zoneForced');
  assert.equal(edge.args.zoneForced, 33);
  const noBand = card('utm 23 611000 7797000 to lat long');
  assert.ok(noBand.res.ask && /hemisphere/.test(noBand.res.ask.prompt)); g.answer(noBand, 0);
  near(noBand.res.value[0], -19.92, 0.01, 'southern');
});

test('sun: sunrise and sunset by NOAA for a pinned day; the zone from the place name; no sunset in a polar summer', () => {
  g.reset(); g.clock.now = () => new Date(2026, 9, 8, 10, 0);
  card('belo horizonte is -19.92, -43.94');
  const c = card('sunrise today in belo horizonte');
  assert.equal(c.tool, 'sun');
  // NOAA for 8 Oct 2026 at 19.92 S, 43.94 W: sunrise about 05:42, sunset about 17:54 local (UTC−3)
  const rows = c.res.body.find(b => b.t === 'kv').rows, at = k => rows.find(r => r[0] === k)[1];
  assert.ok(/^05:(3\d|4\d)$/.test(at('sunrise')), at('sunrise')); assert.ok(/^17:(4\d|5\d)$/.test(at('sunset')), at('sunset'));
  assert.ok(g.textOf(c).includes('America/Sao Paulo'));
  const utc = card('sun times tomorrow at -19.92, -43.94');
  assert.ok(g.textOf(utc).includes('times are UTC'));
  g.submit('in sao paulo time');
  assert.equal(g.S.cards[g.S.cards.length - 1].args.zone, 'America/Sao_Paulo');
  const polar = card('sunset on 21 dec 2026 at -78, 20');
  assert.ok(g.textOf(polar).includes('does not set'));
  const eq = g.solar(Date.UTC(2026, 2, 20, 12), 0, 0);   // equinox: day length near 12 h plus refraction
  near(8 * eq.ha / 60, 12.1, 0.1, 'equinox day length');
  g.clock.now = () => new Date();
});

test('moon phase from the mean cycle: a known full moon lands within a day; the card says it is approximate', () => {
  g.reset();
  const c = card('moon phase on 2026-03-03');   // full moon 3 Mar 2026 (11:38 UTC)
  assert.equal(c.tool, 'moon'); assert.equal(c.res.body[0].v, 'full moon'); assert.ok(c.res.value > 0.97, String(c.res.value));
  assert.equal(card('moon phase on 2026-02-17').res.body[0].v, 'new moon');   // new moon 17 Feb 2026
  assert.ok(g.textOf(c).includes('half a day'));
});

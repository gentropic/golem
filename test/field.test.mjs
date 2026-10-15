// Field capture: a plane or a line measured with the phone, and a position. The device angles are W3C
// deviceorientation (α about up, β the top edge raised, γ the right side down); the answers are checked against cases
// worked by hand, because bearing's own compass.planeFromDeviceOrientation reads them the opposite way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { fromDevice } from '../src/engine/field.js';

const pin = () => { g.clock.now = () => new Date(2026, 9, 14, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };
const round = ([a, b]) => [Math.round(((a % 360) + 360) % 360), Math.round(b)];

test('the phone\'s angles to a plane and a line, by hand', () => {
  assert.deepEqual(round(fromDevice('plane', 0, 30, 0)), [180, 30], 'facing north, top edge raised: the plane dips south');
  assert.deepEqual(round(fromDevice('plane', 100, 30, 0)), [80, 30], 'top edge toward 260 and raised: it dips toward 080');
  assert.deepEqual(round(fromDevice('plane', 0, 0, 30)), [90, 30], 'facing north, right side down: it dips east');
  assert.deepEqual(round(fromDevice('plane', 0, 0, 0))[1], 0, 'flat: no dip');
  assert.deepEqual(round(fromDevice('line', 0, -30, 0)), [0, 30], 'top edge north and lowered: the line plunges north');
  assert.deepEqual(round(fromDevice('line', 100, 30, 0)), [80, 30], 'a line read from either end: lower hemisphere');
});

test('measure waits for a reading, keeps it in args, and replays it unmeasured', () => {
  g.reset(); pin(); g.newSession();
  for (const [q, what, name] of [['measure bedding', 'plane', 'bedding'], ['measure a lineation', 'line', 'lineation'], ['compass', 'plane', undefined], ['take a reading of the fold axis', 'line', 'fold axis']]) {
    const c = g.submit(q).card; assert.equal(c.tool, 'measure', q); assert.equal(c.args.what, what, q); assert.equal(c.args.name, name, q);
    assert.ok(c.res.capture, `${q}: the card asks for a reading`); assert.match(g.textOf(c), /needs a phone's compass/);
  }
  g.reset(); pin(); g.newSession();
  const c = g.submit('measure bedding').card;
  g.capture(c, { alpha: 100, beta: 30, gamma: 0, acc: 3, spread: 0.4, at: Date.UTC(2026, 9, 14, 13) });
  assert.equal(c.res.capture, undefined, 'answered: no longer waiting');
  assert.match(g.textOf(c), /080\/30 dip direction\/dip \(magnetic\)/); assert.match(g.textOf(c), /compass accuracy high/);
  // the reading is the session's: serialized, hydrated, recomputed
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); pin(); g.hydrate(saved);
  assert.match(g.textOf(g.S.cards[0]), /080\/30/);
});

test('with a home saved the reading is corrected to true north, and the correction is kept', () => {
  g.reset(); pin(); g.newSession(); g.submit('home is -19.92, -43.94');
  const c = g.submit('measure bedding').card;
  g.capture(c, { alpha: 100, beta: 30, gamma: 0, acc: 2, at: Date.UTC(2026, 9, 14, 13) });
  assert.ok(c.args.north && c.args.north.decl < -20 && c.args.north.decl > -25, `declination at home kept in args (${c.args.north && c.args.north.decl})`);
  assert.match(g.textOf(c), /057\/30 dip direction\/dip \(true\)/); assert.match(g.textOf(c), /080\/30 magnetic/);
});

test('declination here waits for a position, then is the declination there', () => {
  g.reset(); pin(); g.newSession();
  const c = g.submit('declination here').card;
  assert.equal(c.res.capture.kind, 'position');
  g.capture(c, { lat: -23.52, lon: -46.19, acc: 5, at: Date.UTC(2026, 9, 14, 13) });
  assert.equal(c.args.here, undefined); assert.equal(c.args.lat, -23.52);
  assert.match(g.textOf(c), /declination at -23\.52, -46\.19 here, ±5 m/); assert.match(g.textOf(c), /° west/);
});

test('a reading from a phone\'s browser is the same arithmetic, says where it came from, and has no accuracy', () => {
  g.reset(); pin(); g.newSession();
  const c = g.submit('measure bedding').card;
  g.capture(c, { alpha: 100, beta: 30, gamma: 0, acc: null, spread: 0.6, at: Date.UTC(2026, 9, 14, 13), via: 'browser' });
  assert.equal(c.args.reading.via, 'browser');
  assert.match(g.textOf(c), /080\/30 dip direction\/dip \(magnetic\)/); assert.match(g.textOf(c), /compass accuracy not reported: the browser does not say/);
  assert.match(g.textOf(c), /deviceorientation, north-referenced/);
});

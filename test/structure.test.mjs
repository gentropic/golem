// Structural geometry over bearing, and declination from wmm: the checks from SPEC-skills, recomputed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('apparent dip: 30° true dip on a section 45° from the dip direction is 22.2°', () => {
  g.reset();
  const c = card('apparent dip of 000/30 on a section at 045');
  assert.equal(c.tool, 'apparent'); near(c.res.value, 22.21, 0.01, 'apparent dip');
  near(card('apparent dip of 000/30 on a section at 000').res.value, 30, 1e-9, 'along the dip direction');
  near(card('apparent dip of 000/30 on a section at 090').res.value, 0, 1e-9, 'along the strike');
});

test('three-point problem: (0,0,100), (100,0,100), (0,100,0) is a plane dipping 45° north', () => {
  g.reset();
  const c = card('plane through 0,0,100 and 100,0,100 and 0,100,0');
  assert.equal(c.tool, 'threepoint'); assert.equal(c.res.body[0].v, '000/45');
  assert.ok(g.textOf(card('plane through 0,0,0 and 1,1,1 and 2,2,2')).includes('on one line'));
});

test('intersection of 090/45 and 270/45 is a horizontal north-south line; parallel planes refuse', () => {
  g.reset();
  const c = card('intersection of 090/45 and 270/45');
  assert.equal(c.tool, 'intersect'); near(c.res.value, 0, 1e-9, 'plunge');
  assert.ok(['000/00', '180/00'].includes(c.res.body[0].v), c.res.body[0].v);
  assert.ok(g.textOf(card('intersection of 090/45 and 090/45')).includes('parallel'));
});

test('rake: a line at rake 90 on a plane is its dip line; a line off the plane is refused', () => {
  g.reset();
  const c = card('line at rake 90 on 150/40');
  assert.equal(c.tool, 'rake'); assert.equal(c.res.body[0].v, '150/40');
  const r = card('rake of 150/40 on 150/40'); near(r.res.value, 90, 1e-6, 'rake of the dip line');
  assert.ok(g.textOf(card('rake of 000/00 on 150/40')).includes('off the plane'));
});

test('oriented core: alpha 90 is the plane perpendicular to the hole; a vertical hole is refused', () => {
  g.reset();
  const c = card('core alpha 90 beta 123 in hole 270/60');
  assert.equal(c.tool, 'core'); assert.equal(c.res.body[0].v, '090/30');
  // a horizontal hole trending north: beta 0 puts the ellipse apex at the bottom, so the plane dips down-hole
  assert.equal(card('core alpha 45 beta 0 in hole 000/00').res.body[0].v, '000/45');
  assert.equal(card('core alpha 45 beta 180 in hole 000/00').res.body[0].v, '180/45', 'beta 180: the apex is at the top, the plane dips up-hole');
  assert.ok(g.textOf(card('core alpha 40 beta 230 in hole 000/90')).includes('vertical hole'));
});

test('fisher mean of lines 000/00 and 090/00 is 045/00; of planes it is a plane', () => {
  g.reset();
  const c = card('mean of 000/00 and 090/00');
  assert.equal(c.tool, 'fmean');
  g.flipSlot(c, 'kind'); assert.equal(c.args.kind, 'lines'); assert.equal(c.res.body[0].v, '045/00');
  const p = card('mean of 120/35, 130/40 and 125/38');
  assert.equal(p.args.kind, 'planes'); near(+p.res.body[0].v.split('/')[1], 38, 2, 'mean dip');
  assert.ok(g.textOf(p).includes('α95'));
});

test('declination from wmm: NOAA\'s first test point, a bearing, and the open questions', () => {
  g.reset();
  const c = card('declination at 80, 0 on 2025-01-01');
  assert.equal(c.tool, 'declination'); near(c.res.value, 1.2815, 1e-3, 'declination at 80N 0E, 2025.0');
  const b = card('045 magnetic to true at 80, 0 on 2025-01-01'); near(b.res.value, 46.2815, 1e-3, 'magnetic to true');
  const t = card('045 true to magnetic at 80, 0 on 2025-01-01'); near(t.res.value, 43.7185, 1e-3, 'true to magnetic');
  assert.ok(g.textOf(card('declination here')).includes('Where?'));
  assert.ok(g.textOf(card('045 magnetic to grid at 80, 0')).includes('Grid north'));
  const far = card('declination at 80, 0 on 2040-01-01'); assert.ok(g.textOf(far).includes('outside'), 'a date outside the model window is flagged');
});

// Core and sample arithmetic: the checks from the skills spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('sample mass: 1 m of whole NQ core at 2.7 g/cm³ is 4.80 kg; half core halves it; no density asks', () => {
  g.reset();
  const c = card('mass of 1 m of nq core at 2.7');
  assert.equal(c.tool, 'coremass'); near(c.res.value, Math.PI / 4 * 4.76 * 4.76 * 100 * 2.7 / 1000, 1e-9, 'NQ whole');
  near(card('half nq, 1.5 m, sg 2.9').res.value, Math.PI / 4 * 4.76 * 4.76 * 150 * 2.9 / 2000, 1e-9, 'half NQ 1.5 m');
  assert.ok(g.textOf(card('mass of 1 m of hq core')).includes('At what density'));
});

test('sieve: 200 mesh is 75 µm and back; a size off the table is refused', () => {
  g.reset();
  assert.equal(card('200 mesh in microns').res.value, 75);
  assert.equal(card('75 um in mesh').res.value, 200);
  assert.ok(g.textOf(card('201 mesh in microns')).includes('not in the sieve table'));
});

test('specific gravity: 120.5 g in air and 75.2 g in water is 2.66; swapped readings are refused', () => {
  g.reset();
  near(card('sg from 120.5 g in air and 75.2 g in water').res.value, 120.5 / 45.3, 1e-9, 'SG');
  assert.ok(g.textOf(card('sg from 75.2 g in air and 120.5 g in water')).includes('swapped'));
});

test('RQD: pieces 12, 8, 25, 4, 31 and 9 cm in a 100 cm run give 68% RQD, fair, and 89% recovery', () => {
  g.reset();
  const c = card('rqd of 12, 8, 25, 4, 31 and 9 cm in a 100 cm run');
  assert.equal(c.tool, 'rqd'); near(c.res.value, 68, 1e-9, 'RQD');
  const text = g.textOf(c);
  assert.ok(text.includes('89') && text.includes('fair'), text.slice(0, 160));
  near(card('recovery of 50 and 50 cm in a 1 m run').res.value, 100, 1e-9, 'a metre run in metres');
  assert.ok(g.textOf(card('rqd of 60 and 60 cm in a 100 cm run')).includes('more than'));
});

// Reckoning: answers from dimensions alone (one way computed, several asked), and declared formulas solved for any term,
// each checked against the arithmetic done by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { quantitiesOf, combos, vecOf, roots, FORMULAS } from '../src/engine/reckon.js';

const fresh = () => { g.reset(); g.newSession(); };
const say = q => { const o = g.submit(q); return o.card || g.S.cards[g.S.cards.length - 1]; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} ≈ ${b}`);

test('quantities and dimensions', () => {
  assert.deepEqual(quantitiesOf('drill 300 m at 25 m/h').map(q => [q.n, q.unit, q.dim]), [[300, 'm', 'L'], [25, 'm/h', 'L/t']]);
  assert.deepEqual(vecOf('M/V'), { M: 1, L: -3 }); assert.deepEqual(vecOf('L/t'), { L: 1, T: -1 });
  const qs = quantitiesOf('300 m at 25 m/h'); assert.deepEqual(combos(qs, vecOf('t')).map(c => c.e), [[1, -1]]);
});

test('one way: the answer, with its equation', () => {
  fresh();
  for (const [q, v, unit] of [['how long to drill 300 m at 25 m/h', 12, 'h'], ['how long does it take to drill 300 m at 25 m/h', 12, 'h'], ['how heavy is 1000 m3 at 2.7 t/m3', 2700, 't'],
    ['how far in 3 h at 5 km/h', 15, 'km'], ['how long to move 5000 t at 400 t/h', 12.5, 'h'], ['what volume is 2700 t at 2.7 t/m3', 1000, 'm3'], ['how long to drill 300 m at 25 m/h in minutes', 720, 'minutes'],
    ['quanto tempo para furar 300 m a 25 m/h', 12, 'h']]) {
    const c = say(q); assert.equal(c.tool, 'reckon', q); assert.equal(c.rung, 'grammar', q); near(c.res.value, v, 1e-9, q); assert.equal(c.res.body[0].unit, unit, q);
  }
  assert.match(g.textOf(say('how long to drill 300 m at 25 m/h')), /300 m ÷ 25 m\/h = 12 h/);
});

test('several ways: asked, none run until one is picked; none: said, not guessed', () => {
  fresh();
  const c = say('how much copper in 2700 t at 1.2 %');
  assert.equal(c.res.ask.options.length, 2); assert.equal(c.res.value, undefined, 'nothing computed yet');
  g.answer(c, 0); near(c.res.value, 32.4, 1e-9, '2700 t × 1.2 %'); assert.equal(c.res.body[0].unit, 't');
  const n = say('how long to drill 300 m at 2.7 t/m3'); assert.match(g.textOf(n), /No product or quotient .* gives time\. I do not guess/);
  // what read before still does
  assert.equal(say('how long is the permian').tool, 'timescale'); assert.equal(say('how many km did i run this month').tool, 'logQuery'); assert.equal(say('how much is 2 + 2').tool, 'calc');
});

test('formulas solved for any term, checked by hand', () => {
  fresh();
  let c = say('two-product recovery'); assert.equal(c.args.solve, undefined); for (const v of ['2.1', '28', '0.3']) say(v);
  near(c.res.value, 100 * 28 * 1.8 / (2.1 * 27.7), 1e-9, 'R');
  g.flipSlot(c, 'solve'); assert.equal(c.args.solve, 'f'); say('86.6426'); near(c.res.value, 2.1, 1e-4, 'feed grade from R');
  c = say('solve the cutoff formula for price'); for (const v of ['0.3', '90', '15', '0', '0']) say(v); near(c.res.value, 1500 / 0.27, 1e-9, 'break-even price');
  c = say('stokes settling for diameter'); for (const v of ['0.001', '2650', '1000', '0.001']) say(v); near(c.res.value, Math.sqrt(18 * 0.001 * 0.001 / (1650 * 9.80665)), 1e-6, 'Stokes d');
  c = say('lithostatic pressure'); for (const v of ['2.7', '1000']) say(v); near(c.res.value, 2.7 * 9.80665, 1e-9, 'P at 1 km');
  assert.match(g.textOf(say('what formulas do you know')), /Two-product recovery/);
  // more than one root is said, not chosen
  const two = roots({ vars: { x: { lo: -10, hi: 10 } }, eq: v => v.x * v.x - 4 }, 'x', {}); assert.equal(two.length, 2); near(two[0], -2, 1e-9, 'root'); near(two[1], 2, 1e-9, 'root');
  assert.equal(Object.keys(FORMULAS).length, 8);
});

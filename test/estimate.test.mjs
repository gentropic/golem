// Estimates with ranges: the check from the skills spec, units through the algebra, refusals, replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const kv = (c, k) => c.res.body.find(b => b.t === 'kv').rows.find(r => r[0] === k)[1];
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);

test('uniform 2.6 to 2.9 t/m3 × uniform 1.2 to 1.5 Mm3: mean 3.7125 Mt within 0.5%, shown in Mt', () => {
  g.reset();
  const c = card('2.6 to 2.9 t/m3 * 1.2 to 1.5 Mm3');
  assert.equal(c.tool, 'estimate');
  const mean = parseFloat(kv(c, 'mean'));
  near(mean, 3.7125, 0.005, 'simulated mean');
  assert.ok(kv(c, 'mean').includes('exact 3.7125'), kv(c, 'mean'));
  assert.ok(kv(c, 'mean').includes(' Mt'), 'the unit settles to Mt');
  assert.ok(c.res.read.some(x => x.key === 'dist'), 'the distribution is a slot');
  const again = g.T.estimate(JSON.parse(JSON.stringify(c.args)));
  assert.equal(again.value, c.res.value, 'the same seed replays the same median');
  g.submit('normal');
  const n = g.S.cards[g.S.cards.length - 1];
  assert.equal(n.args.dist, 'normal'); near(parseFloat(kv(n, 'mean')), 3.7125, 0.01, 'normal keeps the mean');
});

test('(120 to 180) * (0.4 to 0.6) / 7 and 2.7 ± 0.1 t/m3 * 1.35 Mm3: plain numbers and ± as normal', () => {
  g.reset();
  const c = card('(120 to 180) * (0.4 to 0.6) / 7');
  near(parseFloat(kv(c, 'mean')), 150 * 0.5 / 7, 0.01, 'mean');
  assert.ok(!c.res.body[0].unit.startsWith(' '), 'dimensionless');
  const pm = card('2.7 ± 0.1 t/m3 * 1.35 Mm3');
  near(parseFloat(kv(pm, 'mean')), 3.645, 0.005, 'mean of a ± product');
  assert.ok(pm.res.read.some(x => x.key === 'pm'));
  const p10 = parseFloat(kv(pm, '10th percentile')), p90 = parseFloat(kv(pm, '90th percentile'));
  assert.ok(p10 < 3.645 && p90 > 3.645 && p90 - p10 > 0.2 && p90 - p10 < 0.5, `${p10} ${p90}`);
});

test('named variables and a unit with a number in it: fuel in litres', () => {
  g.reset();
  const c = card('fuel = consumption * trip where consumption is 9 to 11 l per 100 km and trip is 400 to 450 km');
  assert.equal(c.args.name, 'fuel');
  near(parseFloat(kv(c, 'mean')), 10 * 425 / 100, 0.01, 'litres');
  assert.ok(kv(c, 'mean').includes(' L'), kv(c, 'mean'));
  assert.equal(g.current().name, 'Estimate of fuel');
});

test('refusals: mixed dimensions, an unknown word, lognormal with a zero bound; reversed bounds ask', () => {
  g.reset();
  assert.ok(g.textOf(card('2 to 3 km + 4 to 5 kg')).includes('dimensions differ'));
  assert.ok(g.textOf(card('2 to 3 widgets * 4')).includes('do not know "widgets"'));
  const ln = card('0 to 3 * 2'); g.submit('lognormal');
  assert.ok(g.textOf(g.S.cards[g.S.cards.length - 1]).includes('positive bounds'));
  assert.equal(ln.tool, 'estimate');
  const rev = card('450 to 400 km * 2');
  assert.ok(rev.res.ask && rev.res.ask.prompt.includes('below the lower'));
  g.answer(rev, 0);
  assert.equal(rev.args.swap, true); near(parseFloat(kv(rev, 'mean')), 850, 0.01, 'swapped');
  assert.equal(card('14 * cos(22) + 3^2').tool, 'calc', 'plain arithmetic is untouched');
  const pct = card('10 to 20 % * 1500 t');
  near(parseFloat(kv(pct, 'mean')), 225, 0.01, 'a ratio times a mass is a mass'); assert.ok(kv(pct, 'mean').includes(' t'), kv(pct, 'mean'));
  assert.ok(kv(card('10 to 20 % * 2'), 'mean').includes(' %'), 'a ratio alone stays a ratio');
  assert.equal(card('working days between 1 oct and 20 dec').tool, 'workdays', 'other "between" readers come first');
});

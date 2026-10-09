// The form card (decision matrix) and the declared formulas (Gy, cutoff, NSR, equivalents).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const say = q => { const o = g.submit(q); assert.equal(o.kind, 'answered', `${q}: ${o.kind} ${o.msg || ''}`); return o.card; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('decision matrix: options, criteria, weights and scores asked in order; totals, bars, sensitivity; answers are slots', () => {
  g.reset();
  const c = card('help me decide between perth, vancouver and santiago');
  assert.equal(c.tool, 'decide'); assert.deepEqual(c.args.options, ['perth', 'vancouver', 'santiago']);
  assert.ok(c.res.ask.prompt.startsWith('Which criteria'));
  say('cost, weather and work');
  assert.deepEqual(c.args.criteria, ['cost', 'weather', 'work']);
  assert.ok(c.res.ask.prompt.includes('cost weigh'));
  say('4'); say('2'); say('5');
  assert.equal(c.args['w:work'], 5);
  assert.ok(c.res.ask.prompt.startsWith('Score perth on cost'));
  for (const s of [3, 4, 4, 2, 3, 5, 5, 4, 2]) say(String(s));   // perth 3,4,4 · vancouver 2,3,5 · santiago 5,4,2
  assert.ok(!c.res.ask, 'all answered');
  // perth 12+8+20=40, vancouver 8+6+25=39, santiago 20+8+10=38
  assert.equal(c.res.value, 'perth'); assert.equal(c.res.body[0].v, 'Highest score: perth');
  assert.ok(c.res.body.some(b => b.t === 'hbars' && b.rows.length === 3));
  const sens = c.res.body.find(b => b.t === 'sub').text;
  assert.ok(sens.includes('cost weighed 3 instead of 4') && sens.includes('vancouver'), sens);   // 3: perth 36, vancouver 37, santiago 33
  assert.ok(c.res.read.some(x => x.key === 'w:cost' && x.alts.length === 5), 'weights are slots');
  g.flipSlot(c, 'w:cost');
  assert.equal(c.args['w:cost'], 5); assert.equal(c.res.value, 'perth & santiago', 'a tie at 43'); assert.ok(c.res.body[0].v.startsWith('Tie'));
  g.submit('santiago on work is 5');
  const last = g.S.cards[g.S.cards.length - 1];
  assert.equal(last.args['s:santiago|work'], 5); assert.equal(last.res.value, 'santiago');   // 25+8+25 = 58
  assert.ok(!g.textOf(c).match(/you should|choose|recommend/i), 'no advice');
  const replay = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(replay);
  assert.equal(g.S.cards[0].res.value, 'perth & santiago', 'replayed with the flipped weight');
});

test('a form\'s open question does not swallow a different command', () => {
  g.reset();
  card('compare these options');
  const o = g.submit('25 c in f');
  assert.equal(o.kind, 'card'); assert.equal(o.card.tool, 'convert');
});

test('cutoff grade: (14 + 3) / (0.88 × 9000) is 0.2146 % Cu once the selling cost is answered; per oz gives g/t', () => {
  g.reset();
  const c = card('cutoff grade for copper at 9000 usd/t, 88% recovery, processing 14 usd/t, g&a 3 usd/t');
  assert.equal(c.tool, 'cutoff'); assert.ok(c.res.ask.prompt.startsWith('Selling cost'));
  say('0');
  near(c.res.value, 17 / (0.88 * 9000) * 100, 1e-6, 'cutoff %'); assert.ok(c.res.body[0].unit.startsWith('% copper'));
  const au = card('cutoff grade for gold at 2300 usd/oz, 92% recovery, processing 25 usd/t');
  say('0 (none)'); say('0');
  near(au.res.value, 25 / (0.92 * 2300) * 31.1034768, 1e-6, 'cutoff g/t'); assert.ok(au.res.body[0].unit.startsWith('g/t'));
  const bare = card('cutoff grade for copper');
  assert.ok(bare.res.ask.prompt.startsWith('Price')); say('8000 per t'); assert.equal(bare.args.price, 8000); say('90'); say('12'); say('0'); say('0');
  near(bare.res.value, 12 / (0.9 * 8000) * 100, 1e-6, 'asked all the way');
});

test('NSR and copper equivalent from grades and prices, with the terms asked and the factor shown', () => {
  g.reset();
  const n = card('nsr for 0.8% cu and 0.3 g/t au at 9000 usd/t and 2300 usd/oz');
  assert.equal(n.tool, 'nsr'); assert.equal(n.args.els.length, 2); assert.equal(n.args.els[1].price, 2300);
  say('90'); say('96.5'); say('200');            // cu recovery, payable, refining per t
  say('85'); say('100 (all payable)'); say('0 (none)');   // au
  say('20'); say('5');                           // treatment, transport per t ore
  const cu = 0.008 * 0.9 * 0.965 * (9000 - 200), au = 0.3 / 31.1034768 * 0.85 * 1 * 2300;
  near(n.res.value, cu + au - 25, 1e-6, 'NSR');
  const e = card('cueq of 0.8% cu and 0.3 g/t au at 9000 usd/t and 2300 usd/oz');
  assert.equal(e.args.lead, 'cu'); say('100 (no recovery adjustment)'); say('100 (no recovery adjustment)');
  const auVal = 0.3 / 31.1034768 * 2300, perPct = 0.01 * 9000;
  near(e.res.value, 0.8 + auVal / perPct, 1e-6, 'CuEq'); assert.ok(g.textOf(e).includes('1 g/t au'));
});

test('Gy: the error of a 1 kg sample at 2 mm, the terms offered and answered; the mass for a precision', () => {
  g.reset();
  const c = card('sampling error for a 1 kg sample at 2 mm from a 20 kg lot, 2% chalcopyrite');
  assert.equal(c.tool, 'gy'); assert.equal(c.args.a, 0.02); assert.equal(c.args.d_cm, 0.2); assert.equal(c.args.ml, 20000);
  assert.ok(c.res.ask.prompt.includes('chalcopyrite'));
  say('4.2'); say('2.7 (common silicate gangue)'); say('0.1'); say('0.5 (Gy)'); say('0.5 (Gy, for most ores)'); say('0.25 (unsized material)');
  const a = 0.02, cfac = ((1 - a) / a) * ((1 - a) * 4.2 + a * 2.7), l = Math.sqrt(0.01 / 0.2), var_ = 0.5 * 0.25 * cfac * l * 0.2 ** 3 * (1 / 1000 - 1 / 20000);
  near(c.res.value, Math.sqrt(var_), 1e-9, 'σ');
  assert.ok(g.textOf(c).includes('fundamental error only'));
  const m = card('sample mass for 5% precision at 10 mm');
  say('2 (95%, the usual quote)'); say('2'); say('4.2'); say('2.7'); say('0.1'); say('0.5'); say('0.5'); say('0.25'); say('very large (the 1/ML term drops)');
  const a2 = 0.02, c2 = ((1 - a2) / a2) * ((1 - a2) * 4.2 + a2 * 2.7), l2 = Math.sqrt(0.01 / 1), ms = 1 / ((0.025 ** 2) / (0.5 * 0.25 * c2 * l2 * 1));
  near(m.res.value, ms, 1e-6, 'Ms'); assert.ok(m.res.body[0].unit.startsWith('kg'));
});

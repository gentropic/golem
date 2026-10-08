// Engine tests: the smoke test's queries run against src/engine/ in Node, no browser. Plus session
// naming, replay through serialize/hydrate, slot flips, answers, undo and again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

// [query, expected rung of the last card, text the card must contain]
export const STEPS = [
  ['new session', null, null],
  ['0.35 oz per short ton in g/t', 'grammar', '12 g/t'],
  ['in ppm', 'context', '12 ppm'],
  ['true thickness of a 14 m intercept, hole 270/60, bedding 045/30', 'grammar', '12.97'],
  ['2.7 g/cm3 in lb/ft3', 'grammar', '168.555'],
  ['5 km in kg', 'grammar', 'No conversion exists'],
  ['25 c in f', 'grammar', '77'],
  ['14 * cos(22) + 3^2', 'grammar', '21.98057396'],
  ['what day is 15 nov 2027', 'grammar', 'Monday'],
  ['population density of mongolia in people per square mile', 'grammar', '5.46'],
  ['and chile', 'context', '64.1'],
  ['in people per km2', 'context', '24.7'],
  ['landlocked countries by population', 'grammar', 'Zambia'],
  ['density of chalcopyrite', 'grammar', '4.1–4.3'],
  ['what is a skiplist', 'grammar', 'ch. 4 Skiplists'],
  ['check: owing to the fact that the samples were lost by the lab', 'grammar', 'Omit needless words'],
  ['remember that hole 12 collar was resurveyed in march', 'grammar', 'Stored on this device'],
  ['what do you know about hole 12', 'grammar', 'resurveyed'],
  ['write me a poem about kriging', 'no reading', 'I do not guess'],
  ['why', 'context', 'grammar: no rule matched'],
  ['new session', null, null],
  ['vario of cu', 'no reading', 'vario means variogram'],
  ['vario means variogram', 'grammar', 'Learned'],
  ['vario of cu', 'taught', 'No table is open'],
  ['yes', 'taught', 'Composite to what length'],
  ['2', 'taught', 'composites'],
  ['histogram of cu', 'grammar', 'median'],
  ['log scale', 'context', 'log scale'],
  ['export as script', 'grammar', 'drillhole.composite']
];
const RUNG = { grammar: 'grammar', context: 'context', taught: 'taught', none: 'no reading' };
const last = () => g.S.cards[g.S.cards.length - 1];

test('the smoke queries read and compute as the browser test expects', () => {
  g.reset();
  for (const [q, rung, text] of STEPS) {
    g.submit(q);
    if (rung === null) continue;
    const c = last();
    assert.ok(c, `a card for "${q}"`);
    assert.equal(RUNG[c.rung], rung, `rung of "${q}"`);
    assert.ok(g.textOf(c).includes(text), `"${q}" → …${text}… in: ${g.textOf(c).slice(0, 200)}`);
  }
  assert.equal(g.current().name, 'assays.csv: Cu histogram, Cu variogram');
});

test('a session replays from its specs through serialize and hydrate', () => {
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  assert.equal(saved.ss.length, 2);
  assert.ok(saved.ss[1].cards.every(c => !('res' in c)), 'results are not stored');
  g.reset();
  assert.ok(g.hydrate(saved));
  assert.equal(g.S.cards.length, 6);
  assert.equal(g.S.aliases.vario, 'variogram');
  assert.equal(g.current().name, 'assays.csv: Cu histogram, Cu variogram');
  assert.ok(g.textOf(g.S.cards[4]).includes('median'));
});

test('a slot flip recomputes the card in place', () => {
  g.reset(); g.submit('true thickness of a 14 m intercept, hole 200/60, bedding 045/30');
  const c = last(), before = c.res.value;
  g.flipSlot(c, 'conv');
  assert.equal(c.args.conv, 'sd');
  assert.notEqual(c.res.value, before);
  assert.ok(g.textOf(c).includes('strike/dip'));
  g.flipSlot(c, 'conv');
  assert.equal(c.res.value, before);
});

test('an open question is answered by option, and args carry the answer', () => {
  g.reset(); g.submit('variogram of cu');
  const c = last();
  assert.ok(c.res.ask, 'asks to open the table');
  g.answer(c, 0);
  assert.equal(c.args.auto, true);
  assert.ok(c.res.ask && /Composite/.test(c.res.ask.prompt), 'then asks the composite length');
  g.answer(c, 1);
  assert.equal(c.args.comp, 3);
  assert.ok(!c.res.ask);
  assert.ok(g.textOf(c).includes('composites'));
});

test('undo, again, rename and the no-reading card', () => {
  g.reset();
  g.submit('25 c in f'); g.submit('14 * 2');
  assert.equal(g.S.cards.length, 2);
  assert.equal(g.submit('undo').kind, 'undo');
  assert.equal(g.S.cards.length, 1);
  assert.equal(g.submit('again').kind, 'card');
  assert.equal(g.S.cards.length, 2);
  assert.equal(last().raw, '25 c in f');
  assert.equal(g.submit('name this session friday lab run').kind, 'rename');
  assert.equal(g.current().name, 'friday lab run');
  assert.equal(g.current().auto, false);
  const o = g.submit('frobnicate the samples');
  assert.equal(o.card.rung, 'none');
  const chips = o.card.res.body.find(b => b.t === 'chips');
  assert.ok(chips && chips.items.length, 'nearest skills are offered');
});

test('the clock can be pinned, and dates follow it', () => {
  g.reset();
  g.clock.now = () => new Date(2026, 9, 8);   // 8 Oct 2026, a Thursday
  g.submit('days until 25 december');
  assert.equal(last().res.value, 78);
  g.submit('what day is friday');
  assert.ok(g.textOf(last()).includes('Friday'));
  g.clock.now = () => new Date();
});

test('every result is plain data: no HTML strings, args survive JSON', () => {
  g.reset();
  for (const [q] of STEPS) g.submit(q);
  for (const c of g.S.cards) {
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(c.args))), JSON.stringify(c.args), `args of "${c.raw}" are plain JSON`);
    for (const b of c.res.body) for (const v of Object.values(b)) if (typeof v === 'string') assert.ok(!/<[a-z]+[ >]/.test(v), `no markup in "${c.raw}": ${v.slice(0, 60)}`);
  }
});

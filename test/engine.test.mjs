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
  ['wkt to geojson: POINT (30 10)', 'grammar', '"Point"'],
  ['14 * cos(22) + 3^2', 'grammar', '21.98057396'],
  ['what day is 15 nov 2027', 'grammar', 'Monday'],
  ['population density of mongolia in people per square mile', 'grammar', '5.46'],
  ['and chile', 'context', '64.1'],
  ['in people per km2', 'context', '24.7'],
  ['landlocked countries by population', 'grammar', 'Zambia'],
  ['capital of brazil', 'grammar', 'Brasília'],
  ['what is a skiplist', 'grammar', 'ch. 4 Skiplists'],
  ['check: owing to the fact that the samples were lost by the lab', 'grammar', 'Omit needless words'],
  ['remember that hole 12 collar was resurveyed in march', 'grammar', 'Stored on this device'],
  ['what do you know about hole 12', 'grammar', 'resurveyed'],
  ['write me a poem about kriging', 'no reading', 'I do not guess'],
  ['why', 'context', 'grammar: no rule matched'],
  ['new session', null, null],
  ['pop of mongolia', 'no reading', 'pop means population'],
  ['pop means population', 'grammar', 'Learned'],
  ['pop of mongolia', 'taught', '3,300,000'],
  ['histogram of cu', 'grammar', 'No table is open'],
  ['yes', 'grammar', 'median'],
  ['histogram of au', 'grammar', 'median'],
  ['log scale', 'context', 'log scale'],
  ['export as script', 'grammar', 'plot.hist']
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
  assert.equal(g.current().name, 'assays.csv: Au histogram, Cu histogram');
});

test('a session replays from its specs through serialize and hydrate', () => {
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  assert.equal(saved.ss.length, 2);
  assert.ok(saved.ss[1].cards.every(c => !('res' in c)), 'results are not stored');
  g.reset();
  assert.ok(g.hydrate(saved));
  assert.equal(g.S.cards.length, 7);
  assert.equal(g.S.aliases.pop, 'population');
  assert.equal(g.current().name, 'assays.csv: Au histogram, Cu histogram');
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
  g.reset(); g.submit('histogram of cu');
  const c = last();
  assert.ok(c.res.ask && /No table is open/.test(c.res.ask.prompt), 'asks to open the table');
  g.answer(c, 0);
  assert.deepEqual(c.args.plan, [{ label: 'open assays.csv', tool: 'open', args: {} }], 'the chosen step lives in args');
  assert.ok(!c.res.ask);
  assert.ok(g.textOf(c).includes('median'));
  assert.ok(c.res.trace[0].startsWith('plan: open assays.csv'), 'the step shows in the plan');
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

test('declarations drive the catalog, the names and the amendments', () => {
  const rows = g.skills();
  assert.equal(rows.length, 48);
  assert.deepEqual([...new Set(rows.map(r => r.group))], ['Compute', 'Field', 'Table', 'Knowledge', 'Device', 'Session']);
  assert.equal(rows.filter(r => r.live).length, 41);
  for (const name of Object.keys(g.T)) assert.ok(g.toolByName(name), `a declaration for ${name}`);
  assert.deepEqual(g.tagOf({ tool: 'hist', args: { col: 'au' } }), ['Au histogram', 3]);
  assert.ok(g.toolByName('convert').amend.length === 1 && g.toolByName('fact').amend.length === 2);
});

test('the ontology derives from the declarations and is plain JSON', () => {
  const o = g.ontology();
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(o))), JSON.stringify(o));
  assert.deepEqual(o.verbs.map(v => v.name).sort(), ['convert', 'date', 'define', 'export', 'list', 'lookup', 'open', 'plot', 'timer']);
  assert.ok(o.verbs.every(v => !('bind' in v)), 'bind functions stay in the engine');
  assert.ok(o.units.some(u => u.unit === 'oz per short ton'));
  assert.ok(o.nouns.find(n => n.type === 'country').words.Mongolia);
});

test('the clause parser reads the bare phrases and closed questions; the regex rules keep the rest', () => {
  g.reset();
  const byClause = new Set(['0.35 oz per short ton in g/t', '2.7 g/cm3 in lb/ft3', '5 km in kg', '25 c in f', 'population density of mongolia in people per square mile', 'landlocked countries by population', 'capital of brazil', 'what is a skiplist', 'histogram of au', 'export as script', 'pop of mongolia', 'histogram of cu']);
  for (const [q, rung] of STEPS) {
    const o = g.submit(q);
    if (rung === null || o.kind !== 'card' || o.card.rung === 'none' || o.card.rung === 'context') continue;
    const viaClause = o.card.res.trace.some(t => t.startsWith('clause: '));
    assert.equal(viaClause, byClause.has(q), `"${q}" read by ${viaClause ? 'clause' : 'the regex rules'}: ${o.card.res.trace[0]}`);
  }
  const asked = g.submit('what is the capital of brazil?').card;
  assert.equal(asked.tool, 'fact');
  assert.ok(g.textOf(asked).includes('Brasília'));
  const which = g.submit('which countries are landlocked').card;
  assert.equal(which.tool, 'factList');
  const none = g.submit('write me a poem about kriging').card;
  assert.ok(none.res.trace.some(t => /^clause: reject/.test(t)), 'the no-reading card records the parser verdict');
});

test('timers read like a person says them, and a bare timer asks for how long', () => {
  g.reset();
  for (const [q, sec] of [['set a timer for 5 min', 300], ['start a 30 minutes timer', 1800], ['30 minute timer', 1800], ['timer for 30 minutes', 1800], ['remind me in 20 minutes', 1200], ['countdown 90 seconds', 90], ['set a timer for half an hour', 1800], ['start a timer for an hour', 3600]]) {
    const c = g.submit(q).card;
    assert.equal(c.tool, 'timer', `"${q}" is a timer: ${c.res.trace[0]}`);
    assert.equal(c.args.sec, sec, `"${q}" → ${sec} s`);
  }
  const bare = g.submit('start a timer').card;
  assert.equal(bare.rung, 'none');
  assert.ok(g.textOf(bare).includes('Not enough to act on'), 'the parser read it and says what is missing');
});

test('the planner offers every way to establish a condition, and replay runs the chosen step', () => {
  g.reset();
  g.openFile('holes.csv', 'HOLEID,FROM,TO,CU\nA,0,1,0.5\nA,1,2,1.5\n');
  g.submit('new session');
  const c = g.submit('mean cu').card;
  assert.ok(c.res.ask, 'no table in the new session: asks');
  assert.deepEqual(c.res.ask.options.map(o => o.label), ['open assays.csv', 'open holes.csv']);
  g.answer(c, 1);
  assert.equal(c.args.plan[0].tool, 'open'); assert.equal(c.args.plan[0].args.file.name, 'holes.csv');
  assert.equal(g.S.table.name, 'holes.csv');
  assert.ok(Math.abs(c.res.value - 1.0) < 1e-9, 'length-weighted mean of the two rows');
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  g.reset(); g.hydrate(saved);
  assert.equal(g.S.table.name, 'holes.csv', 'replay ran the plan step');
  assert.ok(Math.abs(g.S.cards[0].res.value - 1.0) < 1e-9);
  const old = { id: 1, raw: 'histogram of cu', tool: 'hist', args: { col: 'cu', auto: true }, rung: 'grammar' };
  g.reset(); g.hydrate({ cur: 1, sid: 1, ss: [{ id: 1, name: 'x', auto: true, cards: [old] }] });
  assert.ok(g.textOf(g.S.cards[0]).includes('median'), 'a card from before the planner still replays');
});

test('every result is plain data: no HTML strings, args survive JSON', () => {
  g.reset();
  for (const [q] of STEPS) g.submit(q);
  for (const c of g.S.cards) {
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(c.args))), JSON.stringify(c.args), `args of "${c.raw}" are plain JSON`);
    for (const b of c.res.body) for (const v of Object.values(b)) if (typeof v === 'string') assert.ok(!/<[a-z]+[ >]/.test(v), `no markup in "${c.raw}": ${v.slice(0, 60)}`);
  }
});

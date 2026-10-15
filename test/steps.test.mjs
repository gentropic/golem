// A request in steps (SPEC 13.6, the planner's sequence): "open assays.csv then mean cu by lith" is two cards, the
// second read after the first ran (so "lith" is a column); a payload that says "then" stays whole; a step that does not
// read stops the chain on its own card; the steps replay as the cards they are; the preview names them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const pin = () => { g.clock.now = () => new Date(2026, 9, 14, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };
const run = q => { g.reset(); pin(); g.newSession(); return g.submit(q); };
const tools = o => o.cards.map(c => c.tool);

test('steps run in order, each read after the one before it', () => {
  let o = run('open assays.csv then mean cu by lith');
  assert.equal(o.kind, 'cards'); assert.deepEqual(tools(o), ['open', 'query']);
  assert.match(g.textOf(o.cards[1]), /BRX/, 'the second step read the column the first opened');
  assert.match(o.cards[1].res.trace[0], /plan: step 2 of 2/);
  o = run('open assays.csv, then histogram of au and then log scale');
  assert.deepEqual(tools(o), ['open', 'hist', 'hist']); assert.equal(o.cards[2].rung, 'context', 'a step may amend the one before');
  assert.deepEqual(tools(run('2 km in miles then 25 c in f')), ['convert', 'convert']);
  assert.deepEqual(tools(run('remind me to call the lab on friday at 9 then set a timer for 5 min')), ['event', 'timer']);
  g.setLanguage('pt'); assert.deepEqual(tools(run('abre assays.csv depois histograma de cu')), ['open', 'hist']); g.setLanguage('en');
});

test('a payload that says "then" stays whole; "next" is a date, not a step', () => {
  assert.equal(run('word count: we went in then left').card.tool, 'wordcount');
  assert.equal(run('check: owing to the fact that we came then we left').card.tool, 'lint');
  assert.equal(run('what day is next friday').card.tool, 'weekday');
});

test('a step that does not read stops the chain there; the steps replay as cards', () => {
  const o = run('open assays.csv then write me a poem then mean cu');
  assert.deepEqual(tools(o), ['open', 'none'], 'the third step does not run');
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  run('open assays.csv then mean cu by lith'); const two = JSON.parse(JSON.stringify(g.serialize()));
  g.reset(); pin(); g.hydrate(two); assert.deepEqual(g.S.cards.map(c => c.tool), ['open', 'query']);
  g.reset(); pin(); g.hydrate(saved); assert.equal(g.S.cards.length, 2);
});

test('the preview names the steps before anything runs', () => {
  g.reset(); pin(); g.newSession();
  const p = g.preview('open assays.csv then mean cu by lith');
  assert.equal(p.steps, 2); assert.match(p.echo, /open assays\.csv → mean cu by lith/); assert.equal(g.S.cards.length, 0);
  // a word that is a column only once the table is open (the sample's columns are all words golem knows already)
  assert.match(g.preview('open assays.csv then histogram of cu_ppm').echo, /step 2 is read once step 1 has run/, 'a step that reads only after the open says so');
});

/* ── the plan, checked before it runs (effects and post on the declarations) ── */
test('what a tool does beyond its card is declared, and an unknown effect is refused', () => {
  const d = n => g.toolByName(n);
  assert.deepEqual(d('open').post, ['table']);
  for (const n of ['logAdd', 'place', 'remember', 'teach', 'recipeSave', 'recipeForget']) assert.deepEqual(d(n).effects, ['device'], n);
  for (const n of ['event', 'timer', 'alarm']) assert.deepEqual(d(n).effects, ['handoff'], n);
  for (const n of ['tableExport', 'convertText', 'convertFile']) assert.deepEqual(d(n).effects, ['save'], n);
  // a tool that can undo what it did wrote something, so it says so
  for (const t of g.TOOLS.filter(t => t.undo)) assert.ok((t.effects || []).includes('device'), `${t.name} has undo but no device effect`);
  assert.ok(Object.keys(g.EFFECTS).length === 3);
});

test('a plan with a step that does not read runs none of it', () => {
  g.reset(); pin(); g.newSession();
  const plan = g.planOf(['remind me to call the lab on friday at 9', 'write me a poem']);
  assert.equal(plan.stop.n, 2); assert.equal(plan.stop.why, 'none');
  const p = g.preview('remind me to call the lab on friday at 9 then write me a poem then set a timer for 5 min');
  assert.equal(p.rung, 'none'); assert.match(p.echo, /step 2, "write me a poem", does not read: none would run/);
  const o = g.submit('remind me to call the lab on friday at 9 then write me a poem then set a timer for 5 min');
  assert.equal(o.kind, 'card'); assert.equal(o.card.tool, 'planStop'); assert.equal(g.S.cards.length, 1, 'only the card that says why');
  assert.match(g.textOf(o.card), /Step 2 of 3, "write me a poem", does not read\. None of the steps ran/);
});

test('a step that needs what a later step provides is out of order: nothing runs, and the reordered plan is offered', () => {
  g.reset(); pin(); g.newSession();
  const o = g.submit('histogram of cu then open assays.csv');
  assert.equal(o.card.tool, 'planStop'); assert.equal(o.card.args.why, 'order'); assert.equal(o.card.args.by, 2);
  assert.match(g.textOf(o.card), /needs a table, and step 2 is what provides it: say that step first/);
  assert.deepEqual(o.card.res.body.find(b => b.t === 'chips').items, ['open assays.csv then histogram of cu']);
  assert.equal(g.S.table, null, 'the open did not run');
  const two = g.submit('open assays.csv then histogram of cu'); assert.deepEqual(two.cards.map(c => c.tool), ['open', 'hist'], 'the offered order runs');
  // the stop card is a card like any other: it replays from its args
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); pin(); g.hydrate(saved);
  assert.equal(g.S.cards[0].tool, 'planStop'); assert.match(g.textOf(g.S.cards[0]), /say that step first/);
});

test('the preview says what each step does beyond its card', () => {
  g.reset(); pin(); g.newSession();
  let p = g.preview('remind me to call the lab on friday at 9 then set a timer for 5 min');
  assert.deepEqual(p.notes, ['step 1 hands off to another app on a tap', 'step 2 hands off to another app on a tap']);
  p = g.preview('open assays.csv then export as tsv'); assert.ok(p.notes.includes('step 2 offers a file to save'), p.echo);
  p = g.preview('log 5 km run then total run by week'); assert.ok(p.notes.includes('step 1 writes to this device'), p.echo);
  // a session command is a step too; an amendment reads against the card the step before it will make
  assert.deepEqual(g.planOf(['new session', '2 km in miles']).steps.map(s => s.now), [true, true]);
  const a = g.planOf(['open assays.csv', 'histogram of au', 'log scale']); assert.equal(a.stop, undefined); assert.equal(a.steps[2].tool, 'hist');
});

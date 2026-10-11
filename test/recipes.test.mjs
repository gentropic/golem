// Recipes: a session's steps saved with the subjects that may change, run again into a session of its own,
// stopped at the first step that no longer reads, and run over every kept table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { openFile } from '../src/engine/engine.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const HOLES = 'hole,from,to,cu,au\nA,0,1,0.5,0.1\nA,1,2,1.5,0.7\nB,0,1,0.8,0.9\n';
function saved() {
  g.reset();
  card('open assays.csv'); card('mean cu by lith where au > 0.5'); card('histogram of cu');
  const s = card('save this as a recipe called cu check');
  assert.equal(s.tool, 'recipeSave'); assert.ok(s.res.ask, 'asks which subjects change');
  assert.deepEqual(s.res.ask.options.map(o => o.label), ['assays.csv', 'cu', 'lith', 'au', 'all of them', 'none']);
  return s;
}

test('save: the session\'s steps, the subjects found in them, and the ones that change chosen by the person', () => {
  const s = saved();
  assert.equal(g.submit('cu').kind, 'answered');
  assert.deepEqual(s.args.params, ['cu']); assert.equal(s.args.steps.length, 3);
  assert.ok(g.textOf(s).includes('run cu check for cu'));
  assert.deepEqual(Object.keys(g.S.recipes), ['cu check']);
  const typed = saved(); g.submit('assays.csv, au'); assert.deepEqual(typed.args.params, ['assays.csv', 'au'], 'several, typed');
  assert.ok(g.textOf(card('recipes')).includes('cu check'));
});

test('run: a new session named after the recipe and its bindings, every step re-read with the new column', () => {
  saved(); g.submit('cu');
  const o = g.submit('run cu check for au');
  assert.equal(o.kind, 'recipe'); assert.equal(g.current().name, 'cu check: au');
  assert.deepEqual(g.S.cards.map(c => c.raw), ['open assays.csv', 'mean au by lith where au > 0.5', 'histogram of au']);
  assert.deepEqual(g.S.cards[1].args.cols, ['au']); assert.equal(g.S.cards[2].args.col, 'au');
  const saved1 = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved1);
  assert.equal(g.S.cards.length, 3, 'the recipe\'s session replays like any other'); assert.ok(g.S.recipes['cu check'], 'recipes are device state');
});

test('a step that no longer reads stops the run there, with a card that says which and why; nothing is skipped', () => {
  saved(); g.submit('cu');
  const o = g.submit('run cu check for ag');
  assert.match(o.msg, /stopped at step 2 of 3/);
  assert.deepEqual(g.S.cards.map(c => c.tool), ['open', 'query', 'recipeStop']);
  const stop = g.textOf(g.S.cards.at(-1));
  assert.ok(stop.includes('Step 2 of 3') && stop.includes('No column called "ag"') && stop.includes('do not skip'), stop);
  assert.equal(g.submit('run cu check for au and ag').kind, 'nothing', 'more values than parameters is refused');
});

test('a new table binds the open step; failed cards are not saved as steps', () => {
  g.reset(); openFile('holes.csv', HOLES);
  card('mean ag by hole'); card('mean cu by hole');
  const s = card('save this as recipe hole means'); g.submit('all of them');
  assert.deepEqual(s.args.steps.map(x => x.raw), ['open holes.csv', 'mean cu by hole'], 'the failed ag card is left out');
  card('open assays.csv');
  g.submit('run hole means for au on assays.csv');
  assert.equal(g.current().name, 'hole means: au, assays.csv');
  assert.equal(g.S.table.name, 'assays.csv'); assert.deepEqual(g.S.cards[1].args.cols, ['au']);
});

test('batch: every kept table, one row each with the last value or where it stopped; the open table is put back', () => {
  g.reset(); openFile('other.csv', 'hole,from,to,zn\nC,0,1,3\n'); openFile('holes.csv', HOLES);
  card('mean cu by hole');
  g.S.cards.splice(0, 1);   // keep the session to the holes table and its question
  card('save this as recipe hole means'); g.submit('holes.csv');
  card('open holes.csv');
  const b = card('run hole means on every table');
  assert.equal(b.tool, 'recipeBatch'); assert.equal(b.res.value, 1);
  const rows = b.res.body.find(x => x.t === 'table').rows;
  assert.deepEqual(rows.map(r => [r[0], r[1]]), [['other.csv', 'stopped at step 2'], ['holes.csv', 'ran']]);
  assert.ok(rows[0][2].includes('cu'), rows[0][2]);
  assert.equal(g.S.table.name, 'holes.csv');
  card('save this as recipe fixed table'); g.submit('none');
  assert.ok(g.textOf(card('run fixed table on every table')).includes('does not take the table'));
  assert.ok(g.textOf(card('forget recipe fixed table')).includes('Forgot')); assert.ok(!g.S.recipes['fixed table']);
});

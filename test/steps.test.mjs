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
});

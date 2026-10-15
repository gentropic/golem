// Inference: a small Datalog with proofs, and Steno's principles over what was said of the units.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { infer, proofOf, keyOf } from '../src/engine/logic.js';

const fresh = () => { g.reset(); g.newSession(); };
const say = q => { const o = g.submit(q); return o.card || g.S.cards[g.S.cards.length - 1]; };

test('Datalog: rules applied until nothing new follows; every conclusion has its derivation', () => {
  const rules = [{ name: 'step', head: { rel: 'r', args: ['X', 'Y'] }, body: [{ rel: 'e', args: ['X', 'Y'] }] }, { name: 'chain', head: { rel: 'r', args: ['X', 'Z'] }, body: [{ rel: 'r', args: ['X', 'Y'] }, { rel: 'r', args: ['Y', 'Z'] }] }];
  const k = infer([{ rel: 'e', args: ['a', 'b'] }, { rel: 'e', args: ['b', 'c'] }, { rel: 'e', args: ['c', 'd'] }], rules);
  assert.ok(k.has('r(a,d)')); assert.ok(!k.has('r(d,a)'));
  assert.deepEqual(proofOf(k, 'r(a,d)').filter(s => s.said !== undefined).map(s => keyOf(s.fact)), ['e(a,b)', 'e(b,c)', 'e(c,d)'], 'it rests on what was said');
});

test('Steno: superposition, cross-cutting, inclusions, and what follows through them', () => {
  fresh();
  for (const [q, rel] of [['the sandstone overlies the granite', 'overlies'], ['the dyke cuts the sandstone', 'cuts'], ['the conglomerate contains clasts of the granite', 'encloses'], ['the basalt is younger than the dyke', 'said_younger'], ['the granite is cut by the shale', 'cuts'], ['the limestone underlies the granite', 'overlies'], ['o folhelho sobrepõe o calcário', 'overlies']]) {
    const c = say(q); assert.equal(c.tool, 'strataSay', q); assert.equal(c.args.rel, rel, q);
  }
  assert.deepEqual([g.S.strata[4].a, g.S.strata[4].b], ['shale', 'granite'], 'a passive form is turned round');
  assert.deepEqual([g.S.strata[5].a, g.S.strata[5].b], ['granite', 'limestone']);
  const o = g.textOf(say('the order of the units'));
  assert.match(o, /youngest first/); assert.match(o, /I cannot tell the ages of/);
  let a = say('is the granite older than the dyke'); assert.equal(a.res.value, true);
  assert.match(g.textOf(a), /dyke cuts sandstone: as said .* cross-cutting .* sandstone overlies granite: as said .* superposition/);
  a = say('is the dyke older than the granite'); assert.equal(a.res.value, false); assert.match(g.textOf(a), /No dyke is younger than granite/);
  a = say('is the conglomerate older than the dyke'); assert.equal(a.res.value, null); assert.match(g.textOf(a), /I cannot tell/);
  assert.match(g.textOf(say('why is the basalt younger than the limestone')), /^why is basalt younger than limestone Because/);
  assert.match(g.textOf(say('is the quartzite older than the dyke')), /Nothing was said about quartzite/);
});

test('a contradiction is said, with the chain that makes it; undo takes it back; the facts are the device\'s', () => {
  fresh();
  say('the sandstone overlies the granite'); say('the dyke cuts the sandstone');
  const c = say('the granite overlies the dyke');
  assert.match(g.textOf(c), /That contradicts what was said before/);
  assert.match(g.textOf(say('the order')), /contradicts itself/);
  g.undo(); g.undo(); assert.equal(g.S.strata.length, 2); assert.doesNotMatch(g.textOf(say('the order')), /contradicts/);
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved); assert.equal(g.S.strata.length, 2);
});

test('truth maintenance: a card keeps what it read through, and is marked, never rewritten, when that changes', async () => {
  const { staleOf, staleCards } = await import('../src/engine/tms.js');
  fresh();
  say('granite is 2.7 t/m3'); const a = say('how heavy is 1000 m3 of granite');
  assert.deepEqual(a.uses, { granite: '2.7 t/m3' }); assert.deepEqual(staleOf(a), []);
  const b = say('granite is 2.65 t/m3');
  assert.match(g.textOf(b), /1 earlier card read with the old value: their answers stay as they were/); assert.match(g.textOf(b), /#02 how heavy is 1000 m3 of granite/);
  assert.equal(a.res.value, 2700, 'the old answer stays'); assert.deepEqual(staleOf(a), [{ key: 'granite', was: '2.7 t/m3', now: '2.65 t/m3' }]);
  assert.match(g.textOf(say('which cards are out of date')), /granite = 2\.7 t\/m3; it is now 2\.65 t\/m3/);
  assert.equal(say('how heavy is 1000 m3 of granite').res.value, 2650, 'run again, it reads the new value');
  // formulas too; and it survives a replay, and other sessions are searched
  say('define the formula core recovery as recovered / drilled * 100'); const f = say('core recovery'); say('2'); say('2.5');
  assert.deepEqual(f.uses, { 'formula core recovery': 'recovered / drilled * 100' });
  assert.match(g.textOf(say('redefine core recovery as recovered / drilled * 99')), /1 earlier card read with the old formula/);
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved);
  assert.equal(staleCards().length, 2); g.newSession(); assert.equal(staleCards().length, 2, 'from another session too');
  say('forget granite'); assert.match(staleCards().map(x => x.stale.map(s => s.now === null ? 'forgotten' : s.now).join()).join(' '), /forgotten/);
});

// Learning on the device: what did not read is kept and can be taught from; a correction offers the word that changed;
// a guess picked offers the repaired word and ranks that tool first next time. Nothing is kept until the person says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const pin = () => { g.clock.now = () => new Date(2026, 9, 15, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };
const fresh = () => { g.reset(); pin(); g.newSession(); };

test('what did not read goes on the list, counted; what reads comes off it', () => {
  fresh();
  g.submit('write me a poem'); g.submit('Write me  a poem'); g.submit('5 klicks in miles');
  assert.deepEqual(g.S.misses.map(m => [m.q, m.n]), [['write me a poem', 2], ['5 klicks in miles', 1]]);
  assert.equal(g.S.misses[0].last, '2026-10-15');
  g.submit('2 km in miles'); assert.equal(g.S.misses.length, 2, 'a request that reads is not a miss');
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved);
  assert.equal(g.S.misses.length, 2, 'the list is the device\'s, kept with it');
});

test('a correction offers the stretch that changed, when the old one has a word golem does not know', () => {
  fresh();
  g.submit('5 klicks in miles'); const o = g.submit('5 km in miles');
  assert.equal(o.card.tool, 'convert'); assert.deepEqual(o.teach, { word: 'klicks', means: 'km' });
  assert.equal(g.S.aliases.klicks, undefined, 'offered, not kept');
  // the offer reads as the teach frame, and from then on the word does
  g.submit('klicks means km'); assert.equal(g.S.aliases.klicks, 'km');
  const t = g.submit('3 klicks in miles'); assert.equal(t.card.tool, 'convert'); assert.equal(t.card.rung, 'taught');
  // a different number is a different question, not a word; two unrelated requests are a rephrasing
  fresh(); g.submit('write me a poem'); assert.equal(g.submit('2 km in miles').teach, undefined);
  fresh(); g.submit('5 klicks in miles'); g.submit('2 km in miles'); assert.equal(g.submit('3 km in miles').teach, undefined);
});

test('a guess picked offers its repaired word, and that tool ranks first in the next guesses', () => {
  fresh();
  g.submit('open assays.csv'); const o = g.submit('histogrm of cu'); assert.equal(o.card.tool, 'guess');
  const p = g.answer(o.card, 0);
  assert.equal(o.card.tool, 'hist'); assert.deepEqual(p.teach, { word: 'histogrm', means: 'histogram' });
  assert.deepEqual(g.S.picks, { hist: 1 }); assert.equal(g.S.misses.length, 0, 'picked: off the list');
  // typed, the pick is the same
  const o2 = g.submit('histogrm of au'); const a = g.submit(o2.card.res.ask.options[0].label);
  assert.equal(a.kind, 'answered'); assert.deepEqual(a.teach, { word: 'histogrm', means: 'histogram' }); assert.deepEqual(g.S.picks, { hist: 2 });
});

test('teaching from the list: pick a request, say what it means, and it is kept only if that reads', () => {
  fresh();
  g.submit('write me a poem'); g.submit('dens of granite');
  const l = g.submit("what couldn't you read"); assert.equal(l.card.tool, 'misses');
  assert.match(g.textOf(l.card), /2 requests did not read/);
  assert.deepEqual(l.card.res.ask.options.map(o => o.label), ['dens of granite', 'write me a poem'], 'most often, then most recent');
  g.submit('write me a poem');                                       // picks it from the list
  assert.match(g.textOf(l.card), /What should "write me a poem" read as/);
  g.submit('a sonnet please');                                       // does not read: refused, asked again
  assert.match(g.textOf(l.card), /"a sonnet please" does not read either/); assert.equal(g.S.aliases['write me a poem'], undefined);
  g.submit('2 km in miles');
  assert.match(g.textOf(l.card), /Learned\. "write me a poem" now reads as "2 km in miles"/);
  assert.equal(g.S.aliases['write me a poem'], '2 km in miles'); assert.deepEqual(g.S.misses.map(m => m.q), ['dens of granite']);
  assert.equal(g.submit('write me a poem').card.tool, 'convert');
  // forgetting the list
  const f = g.submit('forget what you could not read'); assert.match(g.textOf(f.card), /Forgotten: 1 request/); assert.equal(g.S.misses.length, 0);
  assert.equal(g.submit('o que você não entendeu').card.tool, 'misses');
});

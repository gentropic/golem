// Text tools: counts and readability, key sentences, diff. Payloads come from the raw input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const kv = (c, k) => c.res.body.filter(b => b.t === 'kv').flatMap(b => b.rows).find(r => r[0] === k)[1];
const PARA = 'The quick brown fox jumps over the lazy dog. It was not amused by the fox at all!\n\nLater, the dog slept. The fox did not return that night, and nobody saw it again.';

test('word count: words, sentences, paragraphs, the longest sentence, and Flesch scores labelled as estimates', () => {
  g.reset();
  const c = card('word count: ' + PARA);
  assert.equal(c.tool, 'wordcount'); assert.equal(c.res.value, 34);
  assert.equal(kv(c, 'sentences'), '4'); assert.equal(kv(c, 'paragraphs'), '2');
  assert.ok(kv(c, 'longest sentence').startsWith('12 words'), kv(c, 'longest sentence'));
  assert.ok(kv(c, 'Flesch reading ease').startsWith('about ') && kv(c, 'Flesch reading ease').includes('estimate'));
  assert.ok(g.textOf(c).includes('estimated by rule'));
  g.submit('portuguese');
  const pt = g.S.cards[g.S.cards.length - 1];
  assert.equal(pt.args.lang, 'pt'); assert.ok(g.textOf(pt).includes('No readability score')); assert.equal(pt.res.value, 34, 'the counts stand');
  const multi = card('how readable is this\n' + PARA);
  assert.equal(multi.res.value, 34, 'a multi-line input: the first line is the command');
  assert.equal(g.syllables('amused'), 2); assert.equal(g.syllables('table'), 2); assert.equal(g.syllables('the'), 1); assert.equal(g.syllables('mineral'), 3);
});

test('summarise: six or more sentences give the top three by TextRank in source order; fewer refuse; n amends', () => {
  g.reset();
  const text = 'Copper grades in the breccia are high. The breccia hosts most of the copper in the deposit. Gold is low everywhere. Sampling was done at one metre. The breccia copper grades were checked by duplicates. Weather delayed the drilling by a week. Duplicates confirmed the copper grades in the breccia.';
  const c = card('summarise this: ' + text);
  assert.equal(c.tool, 'extract');
  const items = c.res.body.find(b => b.t === 'list').items;
  assert.equal(items.length, 3);
  const pos = items.map(i => +/sentence (\d+) of 7/.exec(i)[1]);
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b), 'source order');
  assert.ok(items.some(i => i.includes('breccia')), items.join(' | '));
  assert.ok(!items.some(i => i.includes('Weather')), 'the off-topic sentence is not picked');
  g.submit('2 sentences');
  assert.equal(g.S.cards[g.S.cards.length - 1].res.body.find(b => b.t === 'list').items.length, 2);
  assert.ok(g.textOf(card('summarise this: One. Two. Three.')).includes('short enough'));
  assert.ok(g.textOf(c).includes('Nothing was rewritten'));
});

test('diff: Myers by line with a --- separator, by word for one-liners, unit as a slot, identical blocks', () => {
  g.reset();
  const c = card('diff these:\nalpha\nbeta\ngamma\n---\nalpha\ngamma\ndelta');
  assert.equal(c.tool, 'diff'); assert.equal(c.args.unit, 'line');
  assert.equal(c.res.value, 2);
  assert.equal(c.res.body.find(b => b.t === 'pre').text, '  alpha\n- beta\n  gamma\n+ delta');
  const w = card('diff these: the quick brown fox\n---\nthe slow brown fox');
  assert.equal(w.args.unit, 'word'); assert.ok(w.res.body.find(b => b.t === 'pre').text.includes('[-quick-]{+slow+}'));
  g.submit('by character');
  assert.equal(g.S.cards[g.S.cards.length - 1].args.unit, 'character');
  assert.equal(card('diff these: same\n---\nsame').res.body[0].v, 'Identical');
  assert.ok(g.textOf(card('diff these: no separator here')).includes('three dashes'));
  assert.deepEqual(g.myers(['a', 'b', 'c'], ['a', 'c', 'd']).map(o => o[0]).join(''), '=-=+');
});

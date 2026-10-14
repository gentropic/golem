// The book packs (SPEC 13.8): the samples that ship, and gcu-library's ods and elements-of-style packs compiled from the
// sibling clone (skipped when it is not there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as g from '../src/engine/index.js';
import { compileOds, compileStrunk, plain } from '../src/engine/packs.js';

const LIB = fileURLToPath(new URL('../../gcu-library/dist/', import.meta.url)), have = existsSync(LIB + 'ods.gcudat') && existsSync(LIB + 'elements-of-style.gcudat');
const text = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return g.textOf(o.card); };

test('the samples: a locator for a term, and checks citing the 1918 numbering (10 active voice, 11 positive form, 13 needless words)', () => {
  g.useBook('ods', null); g.useBook('elements-of-style', null); g.reset(); g.newSession();
  assert.match(text('what is a skiplist'), /ch\. 4 Skiplists/);
  const t = text('check: owing to the fact that the samples were lost by the lab, the assay was not important');
  assert.match(t, /13\. Omit needless words/); assert.match(t, /10\. Use the active voice/); assert.match(t, /11\. Put statements in positive form/);
});

test('the packs: a term with the paragraph that defines it; checks from the rules and chapter V, each cited', { skip: !have && 'no sibling gcu-library clone' }, async () => {
  const ods = await compileOds(readFileSync(LIB + 'ods.gcudat')), st = await compileStrunk(readFileSync(LIB + 'elements-of-style.gcudat'));
  assert.ok(Object.keys(ods.terms).length > 150, 'a term index, not a handful');
  assert.equal(st.rules[13], 'Omit needless words.'); assert.equal(st.rules[10], 'Use the active voice.');
  assert.ok(st.phrases.some(p => p.find === 'owing to the fact that' && p.rule === 13));
  assert.ok(st.entries.some(e => e.term === 'Data'));
  g.useBook('ods', ods); g.useBook('elements-of-style', st); g.reset(); g.newSession();
  const s = text('define sentinel');
  assert.match(s, /Chapter 4, Skiplists · The Basic Structure/); assert.match(s, /called the sentinel/);
  assert.match(text('what is a treap'), /Treap: A Randomized Binary Search Tree/);
  const c = text('check: the data is interesting, owing to the fact that it rained');
  assert.match(c, /V\. Interesting/); assert.match(c, /13\. Omit needless words/);
  g.useBook('ods', null); g.useBook('elements-of-style', null);
});

test('passages read as text: tags gone, entities and TeX made plain', () => {
  assert.equal(plain('a <em>skiplist</em> has <span class="math inline">\\(O(\\log n)\\)</span> time &amp; more'), 'a skiplist has O(log n) time & more');
  assert.equal(plain('U=<span class="math inline">\\(\\{0,\\ldots,2^w-1\\}\\)</span>'), 'U={0,…,2^w-1}');
});

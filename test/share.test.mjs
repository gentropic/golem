// The bytes a signature covers and the notebook a session becomes (the signing itself is the shell's: test/share.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { canonical, unsigned, notebookOf } from '../src/engine/share.js';

test('canonical bytes do not depend on key order; the signature is not part of what it signs', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 'x' }] }), canonical({ a: [2, { c: 'x', d: 3 }], b: 1 }));
  assert.equal(canonical({ a: undefined, b: null }), '{"b":null}');
  assert.deepEqual(unsigned({ golem: 'session', signature: { sig: 'x' } }), { golem: 'session' });
});

test('a session as a notebook: each card as Markdown, its Python line as an illustrative code cell', () => {
  g.reset(); g.newSession(); g.submit('2 km in miles'); g.submit('how long to drill 300 m at 25 m/h');
  const o = g.submit('export as notebook'), f = o.card.res.file;
  assert.equal(o.card.tool, 'exportNotebook'); assert.match(f.name, /\.ipynb$/);
  const nb = f.notebook, md = nb.cells.filter(c => c.cell_type === 'markdown').map(c => c.source.join(''));
  assert.equal(nb.nbformat, 4); assert.match(md[0], /metadata\.golem/);
  assert.ok(md.some(m => m.includes('### #01 · 2 km in miles') && m.includes('**1.24274** mi')));
  assert.ok(md.some(m => m.includes('300 m ÷ 25 m/h = 12 h') && m.includes('<details><summary>How')));
  const code = nb.cells.filter(c => c.cell_type === 'code'); assert.ok(code.length >= 1 && code.every(c => c.metadata.golem.illustrative));
  assert.equal(notebookOf({ name: 'x' }, [], '2026-10-15').cells.length, 1);
});

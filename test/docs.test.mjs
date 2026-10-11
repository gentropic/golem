// Search my documents: kept text files cut into passages, searched by @gcu/librarian, passages returned as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as g from '../src/engine/index.js';
import { openFile } from '../src/engine/engine.js';
import { passages } from '../src/engine/docs.js';

const NOTES = readFileSync(new URL('./fixtures/notes.md', import.meta.url), 'utf8');
const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };

test('passages: by heading, then by paragraph; a fenced block stays whole; HTML headings count', () => {
  const ps = passages('notes.md', NOTES);
  assert.equal(ps.length, 4);
  assert.deepEqual(ps.map(p => [p.title, p.line]), [['Field notes', 3], ['Field notes › Collar check', 7], ['Field notes › Collar check', 9], ['Field notes › Assays', 17]]);
  assert.ok(ps[2].body.startsWith('```') && ps[2].body.includes('DH-14'), 'the blank line inside the fence does not split it');
  const h = passages('m.html', '<h1>Manual</h1><p>Open a <b>dm</b> file &amp; pick it.</p><script>x()</script><h2>Units</h2><p>g/t</p>');
  assert.deepEqual(h.map(p => [p.title, p.body]), [['Manual', 'Open a dm file & pick it.'], ['Manual › Units', 'g/t']]);
  assert.equal(passages('a.txt', 'one\ntwo\n\nthree').length, 2);
});

test('a document opens as kept and searchable; a .txt with a table still opens as a table', () => {
  g.reset();
  const c = openFile('notes.md', NOTES).card;
  assert.equal(c.tool, 'docOpen'); assert.equal(c.res.value, 4); assert.equal(g.S.files[c.args.file.hash].kind, 'doc');
  assert.equal(openFile('t.txt', 'hole,cu\nA,1\nB,2\n').card.tool, 'open');
  assert.equal(openFile('memo.txt', 'Call the lab about the gold assays.\n\nAsk for the duplicates.').card.tool, 'docOpen');
});

test('search: ranked passages with where they are and the matched words marked, verbatim', () => {
  g.reset(); openFile('notes.md', NOTES);
  const c = card('find resurvey in my documents');
  assert.equal(c.tool, 'docSearch'); assert.equal(c.res.value, 1);
  const m = c.res.body.find(b => b.t === 'marked');
  assert.equal(m.text, passages('notes.md', NOTES)[1].body, 'the passage as written');
  assert.deepEqual(m.spans.map(([s, e]) => m.text.slice(s, e)), ['resurvey']);
  assert.ok(g.textOf(c).includes('notes.md · Field notes › Collar check · line 7'));
  const w = card('where did i write about core loss?');
  assert.equal(w.args.query, 'core loss'); assert.ok(g.textOf(w).includes('line 17'));
  const fz = card('find colars in my documents');
  assert.equal(fz.res.value, 1, 'one edit away still finds it');
  const none = card('find xylophone in my documents');
  assert.equal(none.res.value, 0); assert.ok(g.textOf(none).includes('Nothing in 1 document'));
});

test('a passage opens whole; next and previous amend it; with nothing kept, search says how to add a file', () => {
  g.reset(); openFile('notes.md', NOTES);
  const p = card('show passage 2 of notes.md');
  assert.equal(p.tool, 'docPassage'); assert.ok(p.res.value.startsWith('The resurvey'));
  g.submit('next'); assert.equal(g.S.cards.at(-1).args.n, 3);
  assert.ok(g.textOf(card('show passage 9 of notes.md')).includes('has 4 passages'));
  g.reset();
  assert.ok(g.textOf(card('find resurvey in my documents')).includes('No documents are kept'));
});

test('replay: a session with a search reopens against the kept files', () => {
  g.reset(); openFile('notes.md', NOTES); card('find gold in my documents');
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved);
  assert.equal(g.S.cards.at(-1).tool, 'docSearch'); assert.equal(g.S.cards.at(-1).res.value, 1);
});

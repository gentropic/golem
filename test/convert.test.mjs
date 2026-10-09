// Conversions without a format reader: hashes, encodings, the table written out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };

test('sha256: abc is the FIPS test vector; the empty string and a longer text agree with known digests', () => {
  g.reset();
  const c = card('sha256: abc');
  assert.equal(c.tool, 'hash');
  assert.equal(c.res.value, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(g.sha256(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(g.sha256(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
  assert.equal(g.sha256(new TextEncoder().encode('a'.repeat(1000))), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  assert.ok(g.textOf(card('sha256 of this file')).includes('No file is open'));
  g.openFile('holes.csv', 'HOLEID,FROM,TO,CU\nA,0,1,0.5\n');
  const f = card('sha256 of this file');
  assert.equal(f.res.value, g.sha256(new TextEncoder().encode('HOLEID,FROM,TO,CU\nA,0,1,0.5\n')));
  assert.equal(card('sha256 of holes.csv').res.value, f.res.value);
});

test('base64, hex and URL encoding go both ways; bad input is refused; non-UTF-8 bytes are shown as hex', () => {
  g.reset();
  assert.equal(card('base64 decode: SGVsbG8=').res.value, 'Hello');
  assert.equal(card('base64 encode: Hello').res.value, 'SGVsbG8=');
  assert.equal(card('base64: golem').res.value, 'Z29sZW0=', 'encode is the default');
  assert.equal(card('hex encode: golem').res.value, '676f6c656d');
  assert.equal(card('decode hex 676f6c656d').res.value, 'golem');
  assert.equal(card('url encode: a b&c').res.value, 'a%20b%26c');
  assert.equal(card('url decode: a%20b%26c+d').res.value, 'a b&c d');
  assert.ok(g.textOf(card('base64 decode: not*base64')).includes('not base64'));
  assert.equal(card('hex decode: ff').res.value, 'ff', 'a lone 0xff is not UTF-8, so the hex comes back');
  assert.equal(card('base64 encode: héllo').res.value, 'aMOpbGxv', 'UTF-8 bytes, not Latin-1');
  const c = card('base64 encode: SGVsbG8=');
  g.submit('decode');
  assert.equal(g.S.cards[g.S.cards.length - 1].res.value, 'Hello', 'the op is an amendment');
  assert.equal(c.tool, 'encode');
});

test('the table as CSV, TSV or JSON: quoting, nulls, the sample label, and a save action', () => {
  g.reset();
  g.openFile('holes.csv', 'HOLEID,FROM,TO,CU,LITH\nA,0,1,0.5,"BRX, mixed"\nA,1,2,,BRX\n');
  const c = card('the table as csv');
  assert.equal(c.tool, 'tableExport');
  assert.equal(c.res.value, 'HOLEID,FROM,TO,CU,LITH\nA,0,1,0.5,"BRX, mixed"\nA,1,2,,BRX\n');
  assert.equal(c.res.file.name, 'holes.csv');
  assert.ok(c.res.body.some(b => b.t === 'actions' && b.items.some(i => i.act === 'save')));
  g.submit('as json');
  const j = JSON.parse(g.S.cards[g.S.cards.length - 1].res.value);
  assert.equal(j.length, 2); assert.equal(j[1].CU, null); assert.equal(j[0].LITH, 'BRX, mixed');
  assert.equal(card('export the table as tsv').res.value.split('\n')[1], 'A\t0\t1\t0.5\tBRX, mixed');
  g.submit('new session');
  const ask = card('the table as json');
  assert.ok(ask.res.ask, 'no table: the planner asks');
  g.answer(ask, 0);
  assert.ok(g.textOf(ask).includes('sample'), 'the sample is labelled');
  assert.equal(card('export as script').tool, 'export', 'the script export is untouched');
});

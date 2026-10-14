// The Factbook (SPEC 13.8): the sample that ships, and gcu-library's pack read from the sibling clone (skipped when it is
// not there), checked field by field against the pack's own records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as g from '../src/engine/index.js';
import { factbookFromGcudat, readGcudat, untar } from '../src/engine/packs.js';

const LIB = fileURLToPath(new URL('../../gcu-library/', import.meta.url)), have = existsSync(LIB + 'dist/factbook.gcudat');
const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const text = q => g.textOf(card(q));

test('the sample: 14 countries, lookups, ranked and filtered lists, and a refusal for a country it does not hold', () => {
  g.useFactbook(null); g.reset(); g.newSession();
  assert.deepEqual(g.factbookInfo(), { kind: 'sample', version: 'sample', count: 14, profiles: true });
  assert.match(text('capital of chile'), /Santiago/);
  assert.match(text('the 3 largest countries'), /Canada.*Brazil.*Australia/s);
  assert.match(text('the 2 smallest countries by population'), /Mongolia.*Ireland/s);
  const pop = card('countries with population above 100 million');
  assert.equal(pop.args.by, 'population'); assert.match(g.textOf(pop), /Indonesia.*Brazil.*Japan/s);
  assert.match(text('countries in europe by area'), /Germany.*Portugal.*Ireland/s);
  assert.match(text('landlocked countries by population'), /Zambia.*Kazakhstan.*Mongolia/s);
  assert.match(text('countries where population is above banana'), /is a number/);
});

test('the pack: read from its .gcudat, every field as published, names by alias and by the browser, two Congos named by neither', { skip: !have && 'no sibling gcu-library clone' }, async () => {
  const bytes = readFileSync(LIB + 'dist/factbook.gcudat');
  assert.equal((await readGcudat(bytes)).manifest.name, 'factbook');
  const pack = await factbookFromGcudat(bytes, readFileSync(LIB + 'dist/factbook-full.gcudat'));
  const info = g.useFactbook(pack); g.reset(); g.newSession();
  assert.equal(info.count, 254); assert.equal(info.profiles, true);
  const rec = n => pack.records.find(r => r.name === n);
  for (const [q, name, field] of [['population of the usa', 'United States', 'population'], ['area of japan', 'Japan', 'area_km2'], ['population of ivory coast', "Côte d'Ivoire", 'population'], ['population of myanmar', 'Burma', 'population']]) {
    const c = card(q); assert.equal(c.args.country, name, q);
    assert.ok(g.textOf(c).includes(Math.round(rec(name)[field]).toLocaleString('en-US')), `${q}: the pack's figure`);
  }
  assert.match(text('government of france'), new RegExp(rec('France').government));
  assert.match(text('the 5 most populous countries in south america'), /Brazil.*Colombia/s);
  assert.match(text('landlocked countries by population'), /Ethiopia/);
  assert.equal(card('population of congo').rung, 'none', '"congo" is two countries');
  assert.match(text('population of the republic of the congo'), /Congo \(Brazzaville\)/);
  g.useFactbook(null);
});

test('untar reads ustar entries by name', () => {
  const enc = new TextEncoder(), h = new Uint8Array(512), body = enc.encode('{"a":1}');
  h.set(enc.encode('./x.json')); h.set(enc.encode(body.length.toString(8).padStart(11, '0')), 124); h[156] = 48;
  const t = new Uint8Array(512 * 3); t.set(h); t.set(body, 512);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(untar(t)['x.json'])), { a: 1 });
});

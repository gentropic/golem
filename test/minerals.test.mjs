// Minerals: the sample of 42 that ships (labelled), and gcu-library's pack of every species Wikidata lists when the
// sibling clone is there. Lookups, properties, searches by element and class, the table, Portuguese; nothing filled in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as g from '../src/engine/index.js';
import { useMinerals } from '../src/engine/minerals.js';

const fresh = () => { g.reset(); g.newSession(); };
const card = q => g.submit(q).card;
const PACK = new URL('../../gcu-library/data/minerals/', import.meta.url);

test('the sample: lookups, properties and what Wikidata lacks, said to be missing', () => {
  useMinerals(null); fresh();
  for (const [q, tool] of [['chalcopyrite', 'mineral'], ['what is quartz', 'mineral'], ['tell me about barite', 'mineral'], ['gold', 'mineral'], ['hardness of quartz', 'mineral'], ['density of pyrite', 'mineral'],
    ['crystal system of galena', 'mineral'], ['minerals with Cu and S', 'mineralsWith'], ['sulfides with Cu', 'mineralsWith'], ['silicates with Al and K', 'mineralsWith'], ['open the minerals', 'open'],
    ['calcopirita', 'mineral'], ['dureza do quartzo', 'mineral'], ['minerais com cobre', 'mineralsWith']]) {
    const c = card(q); assert.equal(c.tool, tool, q); assert.equal(c.rung, 'grammar', q);
  }
  const c = card('chalcopyrite'), t = g.textOf(c);
  assert.match(t, /CuFeS2/); assert.match(t, /Mohs hardness 3\.5/); assert.match(t, /density not in Wikidata/); assert.match(t, /sulfides and sulfosalts \(Nickel-Strunz 2\.CB\.10a\)/);
  assert.match(t, /the sample of 42 that ships \(the pack has 6304; Packs installs it\)/, 'the sample says it is one');
  assert.equal(card('hardness of quartz').res.value, '7'); assert.match(g.textOf(card('gold')), /native gold/);
  const w = card('minerals with Cu and S'); assert.deepEqual(w.res.body.find(b => b.t === 'table').rows.map(r => r[0]).sort(), ['bornite', 'chalcocite', 'chalcopyrite', 'covellite']);
  // what read before still does
  assert.equal(card('molar mass of CuFeS2').tool, 'chem'); assert.equal(card('what is a skiplist').tool, 'define');
  assert.equal(card('sampling error for a 1 kg sample at 2 mm from a 20 kg lot, 2% chalcopyrite').tool, 'gy');
});

test('the minerals as a table: every table question', () => {
  useMinerals(null); fresh();
  card('open the minerals'); assert.equal(g.S.table.name, 'minerals'); assert.equal(g.S.table.rows.length, 42);
  assert.match(g.textOf(card('count where hardness > 6')), /\d+ rows/);
  assert.match(g.textOf(card('mean density by class')), /sulfides and sulfosalts/);
});

test('the pack, when the sibling clone has it: every species, and the parser still quick', { skip: !existsSync(new URL('records.json', PACK)) && 'no gcu-library clone' }, () => {
  const ds = JSON.parse(readFileSync(new URL('dataset.json', PACK), 'utf8')), records = JSON.parse(readFileSync(new URL('records.json', PACK), 'utf8'));
  useMinerals({ version: ds.version, retrieved: ds.retrieved, records }); fresh();
  const t0 = performance.now(); const c = card('bismuthinite'); const ms = performance.now() - t0;
  assert.equal(c.tool, 'mineral'); assert.match(g.textOf(c), /Bi2S3/); assert.match(g.textOf(c), /gcu-library minerals pack/);
  const t1 = performance.now(); for (const q of ['2 km in miles', 'hardness of quartz', 'minerals with Bi and Te']) card(q); const per = (performance.now() - t1) / 3;
  assert.ok(per < 400, `a request reads in ${Math.round(per)} ms with ${records.length} mineral names (the first, ${Math.round(ms)} ms, builds the parser)`);
  assert.ok(card('minerals with Bi and Te').res.value > 20);
  useMinerals(null);
});

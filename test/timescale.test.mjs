// The geologic timescale pack: the checks from the skills spec, and the chart's own consistency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { TIMESCALE } from '../src/engine/data/timescale.js';
import { RANKS, parentOf, childrenOf, atAge } from '../src/engine/timescale.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };

test('the chart is whole: every non-eon unit has a parent, ranks nest, and every age is covered', () => {
  assert.equal(TIMESCALE.length, 171);
  for (const u of TIMESCALE) {
    if (u.r !== 'eon') { const p = parentOf(u); assert.ok(p, `${u.n} has a parent`); assert.ok(RANKS.indexOf(p.r) < RANKS.indexOf(u.r)); }
    assert.ok(u.b > u.t, `${u.n} base above top`);
  }
  for (const ma of [0, 0.01, 1, 66, 250, 541, 2500, 4031, 4500]) assert.ok(atAge(ma).length >= 1, `${ma} Ma is on the chart`);
  assert.deepEqual(childrenOf(TIMESCALE.find(u => u.n === 'Triassic')).map(k => k.n), ['Early Triassic', 'Middle Triassic', 'Late Triassic']);
});

test('how old is the permian: 298.9 to 251.9 Ma, within the Paleozoic', () => {
  g.reset();
  const c = card('how old is the permian');
  assert.equal(c.tool, 'timescale');
  assert.ok(c.res.trace[0].startsWith('clause: '), 'read by the grammar through the chron noun');
  const text = g.textOf(c);
  assert.ok(text.includes('298.9') && text.includes('251.902'), text.slice(0, 120));
  assert.ok(text.includes('Paleozoic era, Phanerozoic eon'));
  assert.ok(text.includes('Carboniferous') && text.includes('Triassic'), 'neighbours');
  assert.ok(g.textOf(card('the jurassic')).includes('201.4'), 'a bare unit name is a date request');
  assert.ok(g.textOf(card('what is the triassic')).includes('251.902'));
});

test('250 Ma is in the Induan (the 2023 chart moved the Olenekian base to 249.9 Ma); 4600 Ma is off the chart', () => {
  g.reset();
  const c = card('what period is 250 ma');
  assert.equal(c.res.body[0].v, 'Induan');
  assert.equal(card('what age is 248 ma').res.body[0].v, 'Olenekian');
  const text = g.textOf(c);
  assert.ok(text.includes('Early Triassic') && text.includes('Triassic') && text.includes('Mesozoic'));
  assert.ok(g.textOf(card('4600 ma')).includes('outside the chart'));
  assert.equal(card('2.5 ga').res.body[0].v, 'Siderian');
});

test('duration, before, after, subdivisions, and retired names', () => {
  g.reset();
  const k = TIMESCALE.find(u => u.n === 'Cretaceous');
  assert.ok(Math.abs(card('how long was the cretaceous').res.value - (k.b - k.t)) < 1e-9, 'duration from the chart (143.1 to 66 Ma on the 2023 chart)');
  assert.equal(card('what came before the jurassic').res.body[0].v, 'Triassic');
  assert.equal(card('what comes after the jurassic').res.body[0].v, 'Cretaceous');
  const s = card('stages of the triassic');
  assert.deepEqual(s.res.body[0].rows.map(r => r[0]), ['Induan', 'Olenekian', 'Anisian', 'Ladinian', 'Carnian', 'Norian', 'Rhaetian']);
  assert.ok(g.textOf(card('how old is the tertiary')).includes('retired'));
  assert.ok(g.textOf(card('what came before the hadean')).includes('oldest'));
});

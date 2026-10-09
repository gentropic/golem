// Molar mass and conversion factors: the checks from the skills spec, the parser's edges, the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { ELEMENTS } from '../src/engine/data/elements.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('the table is whole: 118 elements, Z in order, weights only where IUPAC gives one', () => {
  assert.equal(ELEMENTS.length, 118);
  ELEMENTS.forEach((e, i) => { assert.equal(e[0], i + 1); assert.ok(/^[A-Z][a-z]?$/.test(e[1])); assert.ok((e[3] == null) !== (e[4] == null), e[1]); });
  assert.equal(ELEMENTS.filter(e => e[3] == null).length, 34, 'Tc, Pm, Po to Ac, Np to Og');
});

test('molar mass of CuFeS2 is 183.51 g/mol; hydrates and brackets; lowercase gets its capitals back', () => {
  g.reset();
  const c = card('molar mass of CuFeS2');
  assert.equal(c.tool, 'chem'); near(c.res.value, 183.51, 0.01, 'CuFeS2');
  near(card('molar mass of CuSO4·5H2O').res.value, 249.68, 0.01, 'hydrate');
  near(card('molar mass of CuSO4.5H2O').res.value, 249.68, 0.01, 'hydrate with a dot');
  near(card('molar mass of Ca(OH)2').res.value, 74.092, 0.01, 'brackets');
  near(card('molar mass of Fe0.9S').res.value, 0.9 * 55.845 + 32.06, 0.01, 'a decimal count');
  const low = card('molar mass of cufes2');
  near(low.res.value, 183.51, 0.01, 'lowercase'); assert.ok(g.textOf(low).includes('two-letter symbols first'));
  assert.ok(g.textOf(card('molar mass of Xx2O')).includes('not an element symbol'));
  assert.ok(g.textOf(card('molar mass of TcO2')).includes('no stable isotope'));
});

test('factors: fe to fe2o3 is 1.4297, cu to cuo 1.2518, a value converts, oxide is a slot, no shared element refuses', () => {
  g.reset();
  near(card('fe to fe2o3').res.value, 1.4297, 0.0002, 'Fe → Fe2O3');
  near(card('cu to cuo').res.value, 1.2518, 0.0002, 'Cu → CuO');
  const v = card('convert 45.2% fe2o3 to fe');
  near(v.res.value, 45.2 / 1.4297, 0.01, '45.2% Fe2O3 as Fe'); assert.ok(v.res.body[0].unit.startsWith('%'));
  const ox = card('fe to oxide');
  assert.ok(ox.res.read.some(x => x.key === 'to' && x.alts.includes('FeO')), 'oxide is a slot');
  near(ox.res.value, 1.4297, 0.0002, 'defaults to Fe2O3');
  g.submit('as FeO');
  near(g.S.cards[g.S.cards.length - 1].res.value, 71.844 / 55.845, 0.0002, 'FeO');
  assert.ok(g.textOf(card('fe to cuo')).includes('share no element'));
  near(card('iron to fe2o3').res.value, 1.4297, 0.0002, 'the element name reads too');
  assert.equal(card('25 c in f').tool, 'convert', 'unit conversions are untouched');
  assert.equal(card('5 km in kg').tool, 'convert');
});

test('fractions and the periodic table: cu in CuFeS2 is 34.63%; element 26; atomic mass of fe; technetium has none', () => {
  g.reset();
  const c = card('how much cu in CuFeS2');
  near(c.res.value * 100, 34.63, 0.01, 'Cu fraction');
  assert.ok(g.textOf(card('how much cu in chalcopyrite')).includes('minerals pack'));
  assert.ok(g.textOf(card('how much au in CuFeS2')).includes('no gold'));
  const e = card('element 26'); assert.equal(e.res.value, 55.845); assert.ok(g.textOf(e).includes('iron'));
  assert.equal(card('atomic mass of fe').res.value, 55.845);
  assert.equal(card('atomic weight of gold').res.value, 196.97);
  const tc = card('atomic mass of technetium'); assert.equal(tc.res.value, null); assert.ok(g.textOf(tc).includes('not used as one'));
});

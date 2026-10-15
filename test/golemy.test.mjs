// What makes golem a golem: shaped by words (taught values and formulas), keeping to standing orders, checking itself,
// and showing every word it obeys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const fresh = () => { g.reset(); g.newSession(); };
const say = q => { const o = g.submit(q); return o.card || g.S.cards[g.S.cards.length - 1]; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} ≈ ${b}`);

test('a value taught reads as its quantity everywhere; forgotten, it does not', () => {
  fresh();
  const v = say('granite is 2.7 t/m3'); assert.equal(v.tool, 'value'); assert.equal(g.S.aliases.granite, '2.7 t/m3');
  const c = say('granite in lb/ft3'); assert.equal(c.tool, 'convert'); assert.equal(c.rung, 'taught'); near(c.res.value, 168.555, 1e-5, 'lb/ft3');
  const r = say('how heavy is 1000 m3 of granite'); assert.equal(r.tool, 'reckon'); near(r.res.value, 2700, 1e-12, 't');
  say('the ore density is 2.85 t/m3'); near(say('how heavy is 500 m3 at ore density').res.value, 1425, 1e-12, 't');
  assert.equal(say('home is -19.92, -43.94').tool, 'place', 'a place is still a place');
  say('forget granite'); assert.equal(g.S.aliases.granite, undefined); assert.equal(say('granite in lb/ft3').tool, 'none');
  g.undo(); g.undo(); assert.equal(g.S.aliases.granite, '2.7 t/m3', 'undoing the forget brings it back');
});

test('a formula taught is solved for any term; a bad one is refused', () => {
  fresh();
  const d = say('define the formula core recovery as recovered / drilled * 100'); assert.equal(d.tool, 'defineFormula'); assert.deepEqual(g.S.formulas['core recovery'].vars, ['recovered', 'drilled']);
  let c = say('core recovery'); say('2.7'); say('3'); near(c.res.value, 90, 1e-9, 'recovery');
  c = say('solve core recovery for drilled'); say('90'); say('2.7'); near(c.res.value, 3, 1e-9, 'drilled');
  assert.match(g.textOf(say('what formulas do you know')), /core recovery \(taught here\)/);
  assert.match(g.textOf(say('define the formula nothing as 2 + 2')), /has no terms to solve for/);
  assert.match(g.textOf(say('define the formula bad as x +* y')), /not an expression I can read/);
  assert.equal(say('define skiplist').tool, 'define', 'the definitions keep "define"');
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved); assert.ok(g.S.formulas['core recovery'], 'kept with the device');
});

test('standing orders: kept, checked on open and on every row written, listed, forgotten', () => {
  fresh();
  say('open assays.csv');
  const o = say('flag rows with cu > 2.5'); assert.equal(o.tool, 'order'); assert.match(g.textOf(o), /In the open table, assays\.csv, 1 row of 688 breaks it: DH-02 20–22/);
  say('require rows with from < to'); assert.equal(g.S.orders.length, 2);
  const op = say('open assays.csv'); assert.deepEqual(op.res.body.filter(b => b.kind === 'warn').map(b => b.text), ['Standing order 1, "warn when cu > 2.5": 1 row of 688 breaks it: DH-02 20–22.']);
  say('station 14'); say('open the field notebook'); say('flag rows with lat is blank');
  assert.match(g.textOf(say('add bedding 045/30')), /Standing order 3, "warn when lat is blank": the row just written breaks it/);
  assert.match(g.textOf(say('standing orders')), /every row needs from < to/);
  say('forget standing order 1'); assert.equal(g.S.orders.length, 2); assert.match(g.textOf(say('standing orders')), /order 1 every row needs from < to 2 warn when lat is blank/);
  say('open assays.csv'); assert.equal(say('marca as linhas com cu > 2').tool, 'order');
  // two columns compared, in any table question too
  assert.match(g.textOf(say('open assays.csv') && say('count where from >= to')), /0 rows/);
});

test('check yourself: every known answer, and nothing in the session touched', () => {
  fresh(); say('2 km in miles');
  const c = say('check yourself'), t = g.textOf(c);
  assert.equal(c.tool, 'selftest'); assert.match(t, /^check myself (\d+) of \1 checks pass/); assert.match(t, /SHA-256 of "abc" ba7816bf…f20015ad ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad pass/);
  assert.equal(g.S.cards.length, 2, 'only its own card'); assert.equal(g.language(), 'en', 'the language is put back');
  assert.equal(say('autoteste').tool, 'selftest');
});

test('the words golem knows: by a word, from the parser\'s own ontology, taught ones included', () => {
  fresh(); say('granite is 2.7 t/m3');
  assert.match(g.textOf(say('what words do you know')), /commands \d+, with \d+ ways to say them/);
  const d = g.textOf(say('what words do you know for density')); assert.match(d, /a mineral property density/); assert.match(d, /a country property \(Factbook\) population density/);
  assert.match(g.textOf(say('what words do you know for granite')), /taught granite reads as "2\.7 t\/m3"/);
  assert.match(g.textOf(say('words for zzzq')), /I know no word with "zzzq" in it/);
  assert.equal(say('que palavras você conhece para densidade').tool, 'words');
});

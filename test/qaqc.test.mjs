// Assay QC as rules: the planted failures of the synthetic sample found, each with its reasons; a file without certified
// values asks for them; 2-2s caught; a batch with no standard is unchecked, not passed; nothing assumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const fresh = () => { g.reset(); g.newSession(); };
const say = q => { const o = g.submit(q); return o.card || g.S.cards[g.S.cards.length - 1]; };
const verdicts = c => Object.fromEntries(c.res.body.find(b => b.t === 'table').rows.map(r => [r[0], r[1]]));

test('the QC sample: the planted failures, and why', () => {
  fresh();
  say('open the qc sample'); const c = say('check the qc');
  assert.match(g.textOf(c), /Blank limit for cu/); say('0.01');
  assert.match(g.textOf(c), /Duplicate threshold/); say('10');
  assert.deepEqual(verdicts(c), { B01: 'passing', B02: 'to review', B03: 'suspect', B04: 'passing', B05: 'suspect', B06: 'passing' });
  const t = g.textOf(c);
  assert.match(t, /STD-A in B03: 0\.58 against 0\.5 ± 0\.02, z = 4; 1-3s/); assert.match(t, /blank B05-BLK in B05: 0\.031, above the limit of 0\.01/);
  assert.match(t, /HARD 23\.1 %/); assert.match(t, /STD-A: 0\.5 ± 0\.02 \(the table\)/); assert.match(t, /synthetic QC sample/);
  assert.deepEqual([c.args.blankLimit, c.args.hard], [0.01, 10], 'the answers are the card\'s, for replay');
});

test('a file with no certified values asks for them; 2-2s; a batch with no standard is unchecked', () => {
  fresh();
  const csv = ['sample_id,job,qc_type,std_id,au', 'S1,J1,sample,,1.2', 'S2,J1,STD,OREAS-1,0.53', 'S3,J1,STD,OREAS-1,0.54', 'S4,J2,sample,,0.8', 'S5,J2,STD,OREAS-1,0.50', 'S6,J3,sample,,0.4', 'S7,J3,blank,,0.002'].join('\n');
  g.openFile('lab.csv', csv); const c = say('check the qc');
  assert.match(g.textOf(c), /Certified au value of OREAS-1, and its SD/); say('0.5 ± 0.01');
  say('0.01');
  const v = verdicts(c);
  assert.equal(v.J1, 'suspect', '0.53 and 0.54 are both beyond 2 SD, the same side: 2-2s'); assert.match(g.textOf(c), /2-2s/);
  assert.equal(v.J2, 'passing'); assert.equal(v.J3, 'unchecked: no standard');
  assert.deepEqual(c.args.cert, { 'OREAS-1': [0.5, 0.01] });
});

test('a table without control samples or batches is refused, not guessed', () => {
  fresh(); say('open assays.csv');
  assert.match(g.textOf(say('check the qc')), /no column that marks standards, blanks or duplicates/);
});

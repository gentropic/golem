// Field compute over a table: the thickness skill on every intercept, bound through columns or constants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test('constants fill what the table lacks; the factor matches the single-value tool; a hole filter; a missing binding is named', () => {
  g.reset();
  g.openFile('holes.csv', 'HOLEID,FROM,TO,CU\nA,0,2,0.5\nA,2,5,1.5\nB,0,4,0.8\n');
  const one = card('true thickness of a 14 m intercept, hole 270/60, bedding 045/30'), factor = one.res.value / 14;
  const c = card('true thickness of every intercept with hole 270/60, bedding 045/30');
  assert.equal(c.tool, 'apply');
  near(c.res.value, (2 + 3 + 4) * factor, 1e-9, 'total true thickness');
  assert.equal(c.res.body.find(b => b.t === 'table').rows.length, 3);
  const a = card('true thickness of every intercept in a with hole 270/60, bedding 045/30');
  near(a.res.value, 5 * factor, 1e-9, 'hole A only');
  const w = card('true thickness of every intercept where cu > 1 with hole 270/60, bedding 045/30');
  near(w.res.value, 3 * factor, 1e-9, 'where');
  const bare = card('true thickness of every intercept');
  assert.ok(g.textOf(bare).includes('hole orientation') && g.textOf(bare).includes('with hole 270/60'), g.textOf(bare));
  g.submit('new session');
  assert.ok(card('true thickness of every intercept with hole 270/60, bedding 045/30').res.ask, 'no table: the planner asks');
});

test('columns bind the hole and the plane per row; rows that cannot be filled are listed; apparent dip per plane', () => {
  g.reset();
  g.openFile('struct.csv', 'HOLE,FROM,TO,AZI,INCL,DIPDIR,DIP\nA,0,2,270,-60,45,30\nA,2,5,270,-60,,\nB,0,4,90,-45,180,20\n');
  const c = card('true thickness of every intercept');
  assert.equal(c.tool, 'apply');
  const rows = c.res.body.find(b => b.t === 'table').rows;
  assert.equal(rows.length, 2); assert.ok(g.textOf(c).includes('row 2: no plane'));
  assert.ok(g.textOf(c).includes('negative inclinations read as down'));
  const f1 = card('true thickness of a 2 m intercept, hole 270/60, bedding 045/30').res.value;
  near(parseFloat(rows[0][6]), f1, 1e-3, 'first row equals the single-value tool');
  const app = card('apparent dip of each plane on a section at 090');
  assert.equal(app.tool, 'apply'); assert.equal(app.res.body.find(b => b.t === 'table').rows.length, 2);
  const single = card('apparent dip of 045/30 on a section at 090').res.value;
  near(parseFloat(app.res.body.find(b => b.t === 'table').rows[0][3]), single, 0.05, 'row one apparent dip, shown to three figures');
});

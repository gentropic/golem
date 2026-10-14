// The log: a device table written from cards, asked in plain words, opened as the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const pin = () => { g.clock.now = () => new Date(2026, 9, 8, 10, 0); };   // Thu 8 Oct 2026
const unpin = () => { g.clock.now = () => new Date(); };

test('log rows: quantity, activity, date; the running total this week converts units; undo removes; corrections rewrite', () => {
  g.reset(); pin();
  const a = card('log 30 min run');
  assert.equal(a.tool, 'logAdd'); assert.deepEqual([a.args.value, a.args.unit, a.args.activity, a.args.date], [30, 'min', 'run', '2026-10-08']);
  assert.ok(g.textOf(a).includes('New activity: run'));
  const b = card('log 5 km run yesterday');
  assert.equal(b.args.date, '2026-10-07'); assert.equal(b.args.unit, 'km');
  assert.ok(g.textOf(b).includes('1 in another dimension left out'), g.textOf(b));
  const w = card('log weight 78.4 kg'); assert.equal(w.args.activity, 'weight'); assert.equal(w.args.value, 78.4);
  const c = card('log 2000 m run on 6 oct note: easy pace');
  assert.equal(c.args.date, '2026-10-06'); assert.equal(c.args.note, 'easy pace');
  assert.ok(g.textOf(c).includes('7 m') || g.textOf(c).includes('7,000 m'), g.textOf(c));   // 5 km + 2000 m this week, in m
  assert.equal(g.logTable().rows.length, 4);
  g.submit('that was 6 km');
  const last = g.S.cards[g.S.cards.length - 1];
  assert.equal(last.args.value, 6); assert.equal(last.args.unit, 'km'); assert.equal(g.logTable().rows.length, 4, 'a correction rewrites the row');
  g.undo();
  assert.equal(g.logTable().rows.length, 4, 'undoing the correction restores the row'); assert.equal(g.logTable().rows.find(r => r.id === c.args.id).value, 2000);
  g.undo();
  assert.equal(g.logTable().rows.length, 3, 'undo removes the row');
  const saved = JSON.parse(JSON.stringify(g.serialize())); g.reset(); g.hydrate(saved);
  assert.equal(g.logTable().rows.length, 3, 'rows travel with the device state and replay does not duplicate them');
  unpin();
});

test('log questions: sums in a unit, counts, means by week; an activity never logged is not a reading', () => {
  g.reset(); pin();
  card('log 5 km run yesterday'); card('log 3000 m run on 6 oct'); card('log 10 km run on 29 sep'); card('log 30 min run'); card('log weight 78.4 kg on 29 sep'); card('log weight 78 kg');
  const km = card('how many km did i run this month');
  assert.equal(km.tool, 'logQuery'); assert.equal(km.res.value, 8, '29 Sep is last month'); assert.ok(g.textOf(km).includes('1 left out'));
  assert.equal(card('how many km did i run this week').res.value, 8);
  assert.equal(card('how often did i run this month').res.value, 3);
  assert.equal(card('how many km did i run this year').res.value, 18);
  assert.equal(card('total run in miles this month').res.value.toFixed(3), (8 / 1.609344).toFixed(3));
  const mw = card('mean weight by week');
  assert.equal(mw.tool, 'logQuery');
  const rows = mw.res.body.find(b => b.t === 'table').rows;
  assert.equal(rows.length, 2); assert.equal(rows[0][1], '78.4'); assert.equal(rows[1][1], '78');
  assert.equal(card('mean weight since 1 oct').res.value, 78);
  // a usual activity never logged reads, says so and offers one to log; an unusual one is still not a reading
  const swim = card('how many km did i swim this month');
  assert.equal(swim.tool, 'logQuery'); assert.match(g.textOf(swim), /Nothing logged as swim this month[\s\S]*log 5 km swim/);
  assert.notEqual(card('how many km did i paddle this month').tool, 'logQuery', 'never logged and not a usual activity: not read by the log');
  unpin();
});

test('open the log makes it the table, so table questions work on it; an empty log refuses', () => {
  g.reset(); pin();
  assert.ok(g.textOf(card('open the log')).includes('empty'));
  card('log 5 km run yesterday'); card('log 3 km run'); card('log weight 78 kg');
  const o = card('open the log');
  assert.equal(o.tool, 'open'); assert.equal(g.S.table.source, 'device'); assert.equal(g.S.table.rows.length, 3);
  const q = card('count by activity');
  assert.equal(q.tool, 'query');
  assert.ok(g.textOf(q).includes('run') && g.textOf(q).includes('2'), g.textOf(q));
  g.submit('new session');
  const ask = card('mean value');
  assert.ok(ask.res.ask.options.some(x => x.label === 'open the log'), 'the planner offers the log');
  unpin();
});

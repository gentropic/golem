// Working days, rosters and time zones: the checks from the skills spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const pin = () => { g.clock.now = () => new Date(2026, 9, 8, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };   // Thu 8 Oct 2026
const unpin = () => { g.clock.now = () => new Date(); g.clock.zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone; };

test('is 21 apr 2027 a working day: no, Tiradentes; weekdays-only says yes', () => {
  g.reset(); pin();
  const c = card('is 21 apr 2027 a working day');
  assert.equal(c.tool, 'workdays'); assert.equal(c.res.value, false);
  assert.ok(g.textOf(c).includes('Tiradentes'));
  g.submit('weekdays only');
  const w = g.S.cards[g.S.cards.length - 1];
  assert.equal(w.args.cal, 'weekdays'); assert.equal(w.res.value, true);
  assert.equal(card('is 10 oct 2026 a working day').res.value, false, 'a Saturday');
  unpin();
});

test('working days until 20 dec from 8 Oct 2026, with the holidays named; N working days from a date', () => {
  g.reset(); pin();
  const c = card('working days until 20 dec');
  // 9 Oct to 20 Dec 2026: 73 days, 51 weekdays; 12 Oct (Mon), 2 Nov (Mon) and 20 Nov (Fri) are holidays; 15 Nov is a Sunday
  assert.equal(c.res.value, 48, g.textOf(c));
  const t = g.textOf(c);
  assert.ok(t.includes('Aparecida') && t.includes('Finados') && t.includes('Consciência Negra') && !t.includes('Proclamação'), t);
  g.submit('weekdays only');
  assert.equal(g.S.cards[g.S.cards.length - 1].res.value, 51);
  // Mon 12 Oct is a holiday; 15 working days after it: 13-16 Oct (4), 19-23 (5), 26-30 (5), 2 Nov is Finados, 3 Nov is the 15th
  assert.equal(card('15 working days from monday').res.value, '2026-11-03');
  assert.equal(card('1 working day from friday').res.value, '2026-10-13', 'Fri 9 Oct → Tue 13 Oct, over the weekend and the holiday');
  assert.equal(card('next working day').res.value, '2026-10-09');
  assert.ok(g.textOf(card('working days until yesterdayish')).includes('cannot read'));
  assert.equal(card('working days between 1 oct and 20 dec').res.value, 53, 'the start is read backwards when it lands after the end');
  assert.equal(card('when is easter 2027').res.value, '2027-03-28');
  assert.equal(card('when is carnival 2027').res.value, '2027-02-09');
  assert.equal(card('when is christmas').res.value, '2026-12-25');
  unpin();
});

test('rosters: 14 on 14 off from 6 oct, am i off at christmas; next swing from the last roster', () => {
  g.reset(); pin();
  const c = card('14 on 14 off from 6 oct, am i off at christmas');
  assert.equal(c.tool, 'roster');
  // 6 Oct + 14 → off 20 Oct..2 Nov, on 3..16 Nov, off 17..30 Nov, on 1..14 Dec, off 15..28 Dec → 25 Dec is off
  assert.equal(c.res.value, false); assert.ok(g.textOf(c).includes('Off'));
  const n = card('next swing');
  assert.equal(n.res.value, true, 'today, 8 Oct, is on');
  assert.ok(g.textOf(n).includes('Tue, 20 Oct 2026'), g.textOf(n));
  assert.equal(card('am i off on 21 oct').res.value, false);
  g.submit('new session');
  assert.ok(g.textOf(card('next swing')).includes('No roster'));
  unpin();
});

test('9am sao paulo in perth is 20:00 the same day; now in a zone; aliases, offsets and unknown places', () => {
  g.reset(); pin();
  const c = card('9am sao paulo in perth');
  assert.equal(c.tool, 'zone'); assert.equal(c.res.value, '20:00');
  assert.ok(c.res.body[0].unit.includes('the same day'), c.res.body[0].unit);
  assert.equal(card('14:30 utc to my time').res.value, '11:30');
  assert.equal(card('23:00 perth in belo horizonte').res.value, '12:00');
  assert.ok(card('23:00 belo horizonte in perth').res.body[0].unit.includes('the next day'));
  const now = card('what time is it in vancouver');
  assert.equal(now.res.value, '06:00', 'Thu 8 Oct 2026 10:00 BRT is 13:00 UTC, 06:00 PDT');
  assert.equal(card('noon utc+8 in utc').res.value, '04:00');
  assert.ok(g.textOf(card('9am atlantis in perth')).includes('do not know'));
  unpin();
});

test('overlap of 9 to 17 in belo horizonte and perth: none; with vancouver and sao paulo: 5 hours', () => {
  g.reset(); pin();
  const none = card('overlap of 9 to 17 in belo horizonte and perth');
  assert.equal(none.tool, 'overlap'); assert.equal(none.res.value, 0);
  const some = card('overlap of 9 to 17 in sao paulo and vancouver');   // BRT −3, PDT −7: 4 hours apart → 13:00 to 17:00 BRT
  assert.equal(some.res.value, 4, g.textOf(some));
  assert.ok(g.textOf(some).includes('13:00 to 17:00'));
  unpin();
});

// Explainers: the checks from the skills spec, and the parsers' edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const explained = (q, kind) => { const c = card(q); assert.equal(c.tool, 'explain', q); assert.equal(c.args.kind, kind, q); return c; };

test('cron: 0 9 * * 1-5 is "At 09:00, Monday to Friday", with the next three runs', () => {
  g.reset(); g.clock.now = () => new Date(2026, 9, 8, 10, 0);   // Thursday 8 Oct 2026, 10:00
  const c = explained('explain cron: 0 9 * * 1-5', 'cron');
  assert.equal(c.res.value, 'At 09:00, Monday to Friday');
  const next = c.res.body.find(b => b.t === 'kv').rows.map(r => r[1]);
  assert.deepEqual(next, ['Fri 9 Oct 2026, 09:00', 'Mon 12 Oct 2026, 09:00', 'Tue 13 Oct 2026, 09:00']);
  assert.equal(explained('cron */15 * * * *', 'cron').res.value, 'Every 15 minutes');
  assert.equal(explained('explain this: 0 */2 * * *', 'cron').res.value, 'At minute 0 past every 2nd hour');
  assert.equal(explained('explain cron: 30 6 1,15 * *', 'cron').res.value, 'At 06:30, on day 1 and day 15 of the month');
  const both = explained('explain cron: 0 0 1 jan mon', 'cron');
  assert.ok(both.res.value.includes('either matches'), both.res.value);
  assert.ok(g.textOf(explained('explain cron: 0 25 * * *', 'cron')).includes('outside 0 to 23'));
  const six = explained('explain cron: 0 0 9 * * 1-5', 'cron');
  assert.equal(six.res.value, 'At 09:00, Monday to Friday');
  assert.ok(six.res.read.some(x => x.key === 'six'), 'six fields are a slot');
  g.clock.now = () => new Date();
});

test('time: 1700000000 is 2023-11-14 22:13:20 UTC; digit count picks the unit; ISO goes back to epoch', () => {
  g.reset();
  const c = explained('what is 1700000000', 'time');
  assert.equal(c.res.body[0].v, '2023-11-14 22:13:20 UTC');
  assert.ok(!c.res.read.some(x => x.key === 'unit'), 'ten digits are seconds, no slot');
  assert.equal(explained('explain time: 1700000000000', 'time').res.body[0].v, '2023-11-14 22:13:20 UTC');
  const odd = explained('what is 170000000000', 'time');
  assert.ok(odd.res.read.some(x => x.key === 'unit'), 'twelve digits make the unit a slot');
  g.submit('in milliseconds');
  assert.equal(g.S.cards[g.S.cards.length - 1].args.unit, 'ms');
  assert.equal(explained('explain time: 2023-11-14T22:13:20Z', 'time').res.value, 1700000000);
  assert.notEqual(card('what is granite').tool, 'explain', 'a word is not a time');
});

test('chmod: 754 is rwxr-xr--, and back; special bits are named', () => {
  g.reset();
  const c = explained('chmod 754', 'chmod');
  assert.equal(c.res.body[0].v, 'rwxr-xr--');
  assert.equal(explained('explain mode rwxr-xr--', 'chmod').res.body[0].v, '754');
  assert.ok(g.textOf(explained('chmod 4755', 'chmod')).includes('setuid'));
  assert.equal(explained('chmod rwsr-sr-t', 'chmod').res.body[0].v, '7755');
});

test('url: scheme, host, port, path segments, decoded query and flags', () => {
  g.reset();
  const c = explained('explain url: https://user:pw@example.org:8443/a/b%20c?q=1&x=hello%20world#top', 'url');
  const text = g.textOf(c);
  for (const s of ['example.org', '8443', 'not the default 443', '1. a', '2. b c', 'q = 1', 'x = hello world', 'top', 'credentials', 'non-default port']) assert.ok(text.includes(s), s);
  assert.equal(explained('https://example.org/', 'url').res.body[0].rows.find(r => r[0] === 'port')[1], '443 (default for https)');
  assert.ok(g.textOf(explained('explain url: not a url', 'url')).includes('not a URL'));
});

test('regex: ^\\d{3}-\\d{2}$ reads as a table, a sentence, and seeded examples that the real RegExp agrees with', () => {
  g.reset();
  const c = explained('explain regex: ^\\d{3}-\\d{2}$', 'regex');
  const rows = c.res.body[0].rows;
  assert.deepEqual(rows.map(r => r[0]), ['^', '{3}', '· \\d', '-', '{2}', '· \\d', '$']);
  assert.equal(c.res.body[1].text, 'Matches the start of the text, then a digit (0 to 9) 3 times, then the text "-", then a digit (0 to 9) 2 times, then the end of the text.');
  const kv = c.res.body.find(b => b.t === 'kv' && b.rows[0][0] === 'matches');
  const yes = kv.rows[0][1].match(/"[^"]*"/g).map(s => s.slice(1, -1)), no = kv.rows[1][1].match(/"[^"]*"/g).map(s => s.slice(1, -1));
  assert.equal(yes.length, 3); assert.ok(yes.every(s => /^\d{3}-\d{2}$/.test(s)), yes);
  assert.ok(no.length >= 1 && no.every(s => !/^\d{3}-\d{2}$/.test(s)), no);
  const again = g.T.explain(JSON.parse(JSON.stringify(c.args)));
  assert.deepEqual(again.body.find(b => b.t === 'kv' && b.rows[0][0] === 'matches'), kv, 'the same seed gives the same examples');
  const named = explained('explain regex: /(?<year>\\d{4})-(?:0[1-9]|1[0-2])(?=.)/i', 'regex');
  const t = g.textOf(named);
  assert.ok(t.includes('named "year"') && t.includes('not captured') && t.includes('followed by') && t.includes('ignore case'), t.slice(0, 300));
  assert.ok(g.textOf(explained('explain regex: (?P<y>\\d)', 'regex')).includes('Python and PCRE'));
  assert.ok(g.textOf(explained('explain regex: a**', 'regex')).includes('rejects'));
  assert.notEqual(card('what is a skiplist').tool, 'explain', 'plain words are not a regex');
});

// How much a command may vary and still read: each group is one call, said several ways (politeness, question
// forms, word order, arguments listed or said first, a colon, number words, fractions, synonyms). Every phrasing
// must reach the clause parser and bind to the same { tool, args } as the first, with no refusal on the card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const pin = () => { g.clock.now = () => new Date(2026, 9, 13, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };
const refusal = c => (c.res.body || []).find(b => b.t === 'note' && b.kind === 'err');

const GROUPS = [
  ['what golem can do', [
    'what can you do',
    'what can you do?',
    'help',
    'what skills do you have',
    'hey golem, what else can you do?']],
  ['true thickness', [
    'true thickness of a 14 m intercept, hole 270/60, bedding 045/30',
    'what is the true thickness of a 14 m intercept with hole 270/60 and bedding 045/30?',
    'could you work out the true thickness for me: 14 m intercept, hole 270/60, bedding 045/30',
    'true thickness of a 14m intercept in a hole at 270/60 through bedding at 045/30',
    'true thickness, bedding 045/30, hole 270/60, 14 m intercept',
    'true thickness of a fourteen metre intercept, hole 270/60, bedding 045/30']],
  ['calendar event', [
    'remind me to send the samples to the lab on friday at 9',
    'remind me on friday at 9 to send the samples to the lab',
    'hey golem, could you remind me to send the samples to the lab on friday at 9am please',
    'remind me to send the samples to the lab, on friday, at 9']],
  ['an hour and a half', [
    'schedule core shed visit on 20 oct at 14:30 for 90 minutes',
    'schedule core shed visit on 20 oct at 2:30 pm for an hour and a half',
    'schedule core shed visit on 20 oct at 2:30 pm for one and a half hours']],
  ['working days between', [
    'working days between 1 nov and 20 dec',
    'how many working days are there between 1 nov and 20 dec?']],
  ['roster', [
    '14 on 14 off from 6 oct, am i off on 25 dec',
    'on a 14 on 14 off roster starting 6 oct, am i off on 25 dec?']],
  ['time zones', [
    '9am sao paulo in perth',
    'what time is 9 am in sao paulo in perth?',
    'when it is 9am in sao paulo, what time is it in perth']],
  ['time now', ['what time is it in vancouver', 'what time is it in vancouver right now']],
  ['apparent dip', [
    'apparent dip of 000/30 on a section at 045',
    'what is the apparent dip of a 000/30 plane on a 045 section']],
  ['intersection', ['intersection of 090/45 and 270/45', 'where do 090/45 and 270/45 intersect']],
  ['chemistry factor', ['convert 45.2% fe2o3 to fe', 'how much fe is in 45.2% fe2o3']],
  ['fe to fe2o3', ['fe to fe2o3', 'fe to fe2o3 factor']],
  ['core mass', [
    'mass of 1 m of nq core at 2.7',
    'mass of 1 m of nq core at a density of 2.7',
    'what does 1 m of nq core weigh at a density of 2.7']],
  ['landlocked', ['landlocked countries by population', 'which countries are landlocked, sorted by population']],
  ['ranked countries', ['the 3 largest countries', 'list the 3 biggest countries', 'what are the 3 largest countries?', 'show me the 3 largest countries please']],
  ['countries by a condition', ['countries with population above 100 million', 'countries where population is above 100 million', 'which countries have a population over 100 million', 'countries having population greater than 100 million']],
  ['unit first', ['0.35 oz per short ton in g/t', 'how many g/t is 0.35 oz per short ton']],
  ['weekday', ['what day is 15 nov 2027', 'please tell me what day 15 nov 2027 is']],
];
const TABLE = [
  ['mean with a condition', [
    'mean cu by lith where au > 0.1',
    'what is the average copper per lithology for samples with au above 0.1?',
    'mean of cu grouped by lith where au is over 0.1']],
  ['count with two conditions', [
    'how many samples where cu > 0.5 and lith is BRX',
    'count the samples with cu over 0.5 and lith BRX',
    'how many samples are there where cu is greater than 0.5 and lith is brx']],
  ['top rows', ['top 5 rows sorted by au descending', 'show me the 5 rows with the highest au']],
];

for (const [name, qs] of [...GROUPS, ...TABLE]) test(`phrasings: ${name}`, () => {
  g.reset(); pin();
  const table = TABLE.some(t => t[0] === name);
  let first = null;
  for (const q of qs) {
    g.reset(); g.newSession(); if (table) g.submit('open assays.csv');
    const o = g.submit(q); assert.equal(o.kind, 'card', q);
    const c = o.card;
    assert.notEqual(c.rung, 'none', `${q}: no reading`);
    assert.ok(c.res.trace[0].startsWith('clause:'), `${q}: read by the clause parser`);
    assert.ok(!refusal(c), `${q}: ${refusal(c) && refusal(c).text}`);
    const call = JSON.stringify({ tool: c.tool, args: c.args });
    if (!first) first = call; else assert.equal(call, first, q);
  }
});

test('conditions: or, not, between, in, blank reach sift as written; a word against a number column is refused', () => {
  g.reset(); pin(); g.submit('open assays.csv');
  const src = q => g.whereSrc(g.submit(q).card.args.where, g.S.table);
  assert.match(src('count samples where cu between 0.2 and 0.8 or au over 1'), /^\(\(cu >= 0\.2 && cu <= 0\.8\)\) \|\| \(au > 1\)$/i);
  assert.match(src('count samples where lith is not BRX and not au below 0.1'), /^lith != "BRX" && !\(au < 0\.1\)$/i);
  assert.match(src('count samples where lith in BRX, GRD'), /^\(lith == "BRX" \|\| lith == "GRD"\)$/i);
  assert.match(src('count samples where au is blank'), /^au == null$/i);
  const c = g.submit('count samples where cu is banana').card;
  assert.ok(refusal(c) && /holds numbers/.test(refusal(c).text), 'refused, not 0 rows');
  const h = g.submit('histogram of cu where lith is BRX').card;
  assert.equal(h.tool, 'hist'); assert.ok(!refusal(h)); assert.ok(g.textOf(h).includes('where'));
});

test('preview: the reading as you type, dry — no card, no state, the same order as submit', () => {
  g.reset(); pin(); g.newSession();
  const p = q => g.preview(q);
  assert.deepEqual(p('2 km in'), { rung: 'partial', echo: 'Convert 2 km; unit ___' });
  assert.equal(p('2 km in miles').rung, 'grammar');
  assert.equal(p('14 * cos(22)').echo, 'expression: 14 * cos(22)');
  assert.equal(p('undo').rung, 'context');
  assert.equal(p('zzz'), null, 'what would be no reading shows nothing');
  g.submit('2 km in miles');
  const before = JSON.stringify(g.serialize());
  assert.match(p('in feet').echo, /^amends #01: Convert 2 km; unit ft$/);
  assert.equal(JSON.stringify(g.serialize()), before, 'nothing changed');
  assert.equal(g.S.cards.length, 1);
  g.submit('open assays.csv');
  assert.ok(g.completions('mean cu by l').some(c => c.word === 'lith'));
  assert.ok(g.completions('2 km in ').every(c => c.kind === 'unit'), 'units of the same dimension');
});

test('guess: no exact reading offers repaired readings, runs none until one is picked, and keeps the mark', () => {
  g.reset(); pin(); g.newSession();
  const c = g.submit('population mongolia').card;
  assert.equal(c.tool, 'guess'); assert.equal(c.rung, 'guess');
  assert.deepEqual(c.res.ask.options.map(o => o.label), ['Look up population of mongolia']);
  assert.ok(g.textOf(c).includes('assumed a preposition'), 'the card says what the reading changed');
  assert.equal(g.S.cards.length, 1, 'nothing ran');
  g.answer(c, 0);
  assert.equal(c.tool, 'fact'); assert.equal(c.rung, 'guess'); assert.equal(c.args.country, 'Mongolia');
  assert.match(c.res.trace[0], /^guess: read as Look up population/);
  const saved = JSON.parse(JSON.stringify(g.serialize()));
  assert.ok(JSON.stringify(saved).includes('"rung":"guess"'), 'the mark travels with the session');
  // typed: "yes" picks the only offer; off-topic lines draw none
  const d = g.submit('gimme histogram cu').card; assert.equal(d.tool, 'guess');
  assert.equal(g.submit('yes').kind, 'answered'); assert.equal(d.tool, 'hist');
  for (const q of ['banana', 'what is the weather like in perth', 'tell me a joke', 'who are you']) assert.equal(g.submit(q).card.rung, 'none', q);
});

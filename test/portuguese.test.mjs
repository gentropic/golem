// Portuguese: golem reads pt-BR as well as English, the person's language first. Every Portuguese starter reads; a
// phrase in either language reads whatever the interface's language; the other language never repairs a typo into its
// own words ("decode" is not the Portuguese "decide"); dates, units, places and countries read in Portuguese.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { STARTERS, STARTERS_PT } from '../src/engine/skills.js';

const pin = () => { g.clock.now = () => new Date(2026, 9, 14, 10, 0); g.clock.zone = () => 'America/Sao_Paulo'; };
const reads = (q, setup) => { g.reset(); pin(); g.newSession(); if (setup) g.submit(setup); const o = g.submit(q); return o.kind !== 'card' ? o.kind : o.card.rung; };

test('every Portuguese starter reads in Portuguese, and every English one still reads', () => {
  g.setLanguage('pt');
  for (const [grp, items] of STARTERS_PT) for (const [title, q] of items) assert.equal(reads(q), 'grammar', `${grp} / ${title}: ${q}`);
  for (const [grp, items] of STARTERS) for (const [title, q] of items) assert.equal(reads(q), 'grammar', `${grp} / ${title} (English, Portuguese first): ${q}`);
  g.setLanguage('en');
});

test('Portuguese reads with English first, too; the answers agree with the English phrasing', () => {
  g.setLanguage('en');
  const pairs = [['converte 5 km para milhas', '5 km in miles'], ['25 graus celsius em fahrenheit', '25 c in f'], ['que dia é 15 de novembro de 2027', 'what day is 15 nov 2027'],
    ['densidade populacional da mongólia', 'population density of mongolia'], ['qual a idade do permiano', 'how old is the permian'], ['quanto tempo durou o cretáceo', 'how long was the cretaceous'],
    ['quantos dias úteis até 20 de dezembro', 'working days until 20 dec']];
  for (const [pt, en] of pairs) {
    g.reset(); pin(); g.newSession(); const a = g.submit(pt).card; g.reset(); pin(); g.newSession(); const b = g.submit(en).card;
    assert.equal(a.rung, 'grammar', pt); assert.equal(a.tool, b.tool, pt); assert.deepEqual(a.res.value, b.res.value, `${pt} = ${en}`);
  }
});

test('session commands, here, and a reminder on a weekday in Portuguese', () => {
  g.setLanguage('pt');
  assert.equal(reads('nova sessão'), 'new-session');
  g.reset(); pin(); g.newSession(); g.submit('25 graus celsius em fahrenheit'); assert.equal(g.submit('desfaz').kind, 'undo');
  g.reset(); pin(); g.newSession(); const d = g.submit('declinação aqui').card; assert.equal(d.tool, 'declination'); assert.equal(d.res.capture.kind, 'position');
  g.reset(); pin(); g.newSession(); const e = g.submit('me lembra de mandar as amostras pro laboratório na sexta às 9').card;
  assert.equal(e.tool, 'event'); assert.match(g.textOf(e), /Fri, 16 Oct 2026 at 09:00/);
  g.setLanguage('en');
});

test('the other language reads only what is written: no typo repairs into its words', () => {
  g.setLanguage('en');
  g.reset(); pin(); g.newSession(); g.submit('base64 encode: SGVsbG8='); g.submit('decode');
  assert.equal(g.S.cards[g.S.cards.length - 1].res.value, 'Hello', '"decode" amends the card; it is not the Portuguese "decide"');
  g.setLanguage('pt');
  g.reset(); pin(); g.newSession(); assert.equal(g.submit('write me a poem about kriging').card.rung, 'none', 'nothing reads it in either language');
  g.setLanguage('en');
});

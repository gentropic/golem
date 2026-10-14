// The geologic timescale: the ICS chart as a records pack (data/timescale.js). Ages, bounds, ranks,
// what a unit sits in, what came before and after, what it is subdivided into, and which unit an age
// in Ma falls in. Lookups only; the chart is the answer.
import { tool, frame, noun, unit, fmt } from './core.js';
import { TIMESCALE, TIMESCALE_SOURCE } from './data/timescale.js';

export const RANKS = ['eon', 'era', 'period', 'epoch', 'age'];
const RANK_WORD = { system: 'period', series: 'epoch', stage: 'age', erathem: 'era', eonothem: 'eon' };
const RETIRED = {
  tertiary: 'retired from the chart in 2004: use Paleogene (66 to 23.03 Ma) and Neogene (23.03 to 2.58 Ma)',
  precambrian: 'an informal name for everything before the Phanerozoic: the Hadean, Archean and Proterozoic eons',
  'upper pleistocene': 'called Late Pleistocene on the chart', 'middle pleistocene': 'the Chibanian age on the chart', 'lower pleistocene': 'the Gelasian and Calabrian ages on the chart',
  'upper cretaceous': 'called Late Cretaceous on the chart', 'lower cretaceous': 'called Early Cretaceous on the chart', 'upper jurassic': 'called Late Jurassic on the chart', 'lower jurassic': 'called Early Jurassic on the chart',
  'carboniferous': null
};
const ri = u => RANKS.indexOf(u.r);
const within = (x, u) => x.t >= u.t - 1e-9 && x.b <= u.b + 1e-9;
export const unitByName = name => { const n = String(name).trim().toLowerCase().replace(/^the /, ''); return TIMESCALE.find(u => u.n.toLowerCase() === n) || null; };
export const parentOf = u => { let best = null; for (const p of TIMESCALE) { if (ri(p) >= ri(u) || !within(u, p)) continue; if (!best || ri(best) < ri(p)) best = p; } return best; };
export const chainOf = u => { const out = []; let p = parentOf(u); while (p) { out.push(p); p = parentOf(p); } return out; };
export const childrenOf = u => { const inside = TIMESCALE.filter(x => ri(x) > ri(u) && within(x, u)); if (!inside.length) return []; const r = Math.min(...inside.map(ri)); return inside.filter(x => ri(x) === r).sort((a, b) => b.b - a.b); };   // oldest first
const sameRank = u => TIMESCALE.filter(x => x.r === u.r);
export const beforeOf = u => sameRank(u).find(x => Math.abs(x.t - u.b) < 1e-6) || null;
export const afterOf = u => sameRank(u).find(x => Math.abs(x.b - u.t) < 1e-6) || null;
// the units an age in Ma falls in, one per rank, eon first
export const atAge = ma => RANKS.map(r => TIMESCALE.find(u => u.r === r && ((ma > u.t && ma <= u.b) || (ma === 0 && u.t === 0)))).filter(Boolean);
const span = u => `${fmt(u.b)} to ${fmt(u.t)} Ma`;
const SRC = { t: 'src', text: TIMESCALE_SOURCE };
const UNITRE = '(.+?)(?: (?:period|epoch|era|eon|age|stage|series|system))?';

tool({
  name: 'timescale',
  skill: { group: 'Knowledge', title: 'Geologic timescale', on: 'ICS chart · Macrostrat · CC BY 4.0', about: 'Ages and bounds of every unit on the chart, what it sits in, what came before and after, and which unit an age falls in.', examples: ['how old is the permian', 'what period is 250 ma', 'how long was the cretaceous', 'stages of the triassic'] },
  topic: a => [a.unit ? `${a.unit} (timescale)` : 'Timescale', 1],
  run: a => {
    if (a.age != null) {
      const units = atAge(a.age), read = ['units of the chart at', { v: `${fmt(a.age)} Ma` }];
      if (!units.length) return { read, body: [{ t: 'note', kind: 'err', text: `${fmt(a.age)} Ma is outside the chart, which runs from 4567 Ma (Hadean) to now.` }, SRC], trace: ['no unit contains that age'] };
      const finest = units[units.length - 1];
      return { read, body: [{ t: 'big', v: finest.n, unit: finest.r }, { t: 'kv', rows: units.map(u => [u.r, `${u.n} (${span(u)})`]) }, SRC], trace: [`timescale.at(${a.age}) → ${units.map(u => u.n).join(' > ')}`], py: `data("timescale").at(${a.age})` };
    }
    const u = unitByName(a.unit), key = String(a.unit).trim().toLowerCase().replace(/^the /, '');
    if (!u) {
      const why = RETIRED[key]; if (!why) return null;
      return { read: ['timescale unit', { v: a.unit }], body: [{ t: 'note', kind: 'err', text: `"${a.unit}" is not a unit on the chart: ${why}.` }, SRC], trace: ['timescale.find → none; a known old name'] };
    }
    const read = [{ v: a.ask || 'age', key: 'ask', alts: ['age', 'duration', 'before', 'after', 'children'], cur: a.ask || 'age' }, 'of', { v: u.n }];
    // "stages of the triassic" asks for a rank; "subdivisions of" takes the next rank down
    const kids = a.rank ? TIMESCALE.filter(x => x.r === a.rank && ri(x) > ri(u) && within(x, u)).sort((x, y) => y.b - x.b) : childrenOf(u), chain = chainOf(u), bef = beforeOf(u), aft = afterOf(u), dur = u.b - u.t;
    const trace = [`timescale.find("${a.unit}") → ${u.n} (${u.r}, ${span(u)})`, `within: ${chain.map(p => p.n).join(' > ') || 'nothing above'} (by containment)`];
    if (a.ask === 'duration') return { read, value: dur, body: [{ t: 'big', v: fmt(dur, 4), unit: 'Myr' }, { t: 'kv', rows: [['from', `${fmt(u.b)} Ma`], ['to', `${fmt(u.t)} Ma`], ['rank', u.r]] }, SRC], trace: [...trace, `${fmt(u.b)} − ${fmt(u.t)} = ${fmt(dur, 5)} Myr`], py: `data("timescale")["${u.n}"].duration` };
    if (a.ask === 'before' || a.ask === 'after') {
      const n = a.ask === 'before' ? bef : aft;
      if (!n) return { read, body: [{ t: 'note', text: `${u.n} is the ${a.ask === 'before' ? 'oldest' : 'youngest'} ${u.r} on the chart.` }, SRC], trace };
      return { read, body: [{ t: 'big', v: n.n, unit: n.r }, { t: 'kv', rows: [['span', span(n)], ['duration', `${fmt(n.b - n.t, 4)} Myr`], ['boundary', `${fmt(a.ask === 'before' ? u.b : u.t)} Ma`]] }, SRC], trace: [...trace, `${a.ask}: the ${u.r} sharing the ${fmt(a.ask === 'before' ? u.b : u.t)} Ma boundary`], py: `data("timescale")["${u.n}"].${a.ask}` };
    }
    if (a.ask === 'children') {
      if (!kids.length) return { read, body: [{ t: 'note', text: `${u.n} has no subdivisions on the chart.` }, SRC], trace };
      return { read, body: [{ t: 'table', head: [kids[0].r, 'from (Ma)', 'to (Ma)', 'Myr'], num: [false, true, true, true], rows: kids.map(k => [k.n, fmt(k.b), fmt(k.t), fmt(k.b - k.t, 4)]) }, ...(kids.length <= 20 ? [{ t: 'hbars', rows: kids.map(k => [k.n, k.b - k.t, `${fmt(k.b - k.t, 3)} Myr`]) }] : []), { t: 'sub', text: `${kids.length} ${kids[0].r}s, oldest first.` }, SRC], trace: [...trace, `children: the ${kids[0].r}s inside it`], py: `data("timescale")["${u.n}"].children` };
    }
    return {
      read, value: dur,
      body: [{ t: 'big', v: span(u), unit: u.r }, { t: 'kv', rows: [['duration', `${fmt(dur, 4)} Myr`], ['within', chain.map(p => `${p.n} ${p.r}`).join(', ') || 'nothing above'], ['before', bef ? `${bef.n} (${span(bef)})` : 'nothing older of this rank'], ['after', aft ? `${aft.n} (${span(aft)})` : 'nothing younger of this rank'], ...(kids.length ? [['subdivided into', kids.map(k => k.n).join(', ')]] : [])] },
        ...(kids.length >= 2 && kids.length <= 20 ? [{ t: 'hbars', rows: kids.map(k => [k.n, k.b - k.t, `${fmt(k.b - k.t, 3)} Myr`]) }] : []), SRC],
      trace: [...trace, `neighbours of rank ${u.r} by shared boundary`], py: `data("timescale")["${u.n}"]`
    };
  }
});
// "how old is the permian", "when was the jurassic", "the permian", "what is the triassic"
frame({
  name: 'date', label: 'Date', words: ['how old is', 'when was', 'when is', 'date', 'age of'], elidable: true,
  theme: ['chron'], required: ['theme'], roles: {},
  words_pt: ['quando foi', 'idade de', 'idade do', 'idade da', 'qual a idade de', 'qual a idade do', 'qual a idade da', 'qual é a idade do', 'qual é a idade da', 'datar', 'data'], label_pt: 'Datar',
  bind: c => { const t = c.theme[0]; return t && t.value ? { tool: 'timescale', args: { unit: t.value } } : null; }
});
/* ── what reads the rest: duration, before and after, subdivisions, an age in Ma ── */
const unitArg = c => c.theme[0] && c.theme[0].value;
for (const [name, words, ask, words_pt] of [
  ['chronlength', ['how long was', 'how long is', 'how long did', 'duration of', 'length of', 'how long did it last'], 'duration', ['quanto durou', 'quanto tempo durou', 'quanto tempo dura', 'duração de', 'duração do', 'duração da', 'qual a duração do', 'qual a duração da']],
  ['chronbefore', ['what came before', 'what comes before', 'what was before', 'which came before', 'what is before', 'before'], 'before', ['o que veio antes de', 'antes de']],
  ['chronafter', ['what came after', 'what comes after', 'what was after', 'which came after', 'what is after', 'after'], 'after', ['o que veio depois de', 'depois de']]
]) frame({ name, label: 'Timescale', words, theme: ['chron'], required: ['theme'], roles: {}, words_pt, label_pt: 'Escala do tempo', bind: c => unitArg(c) ? { tool: 'timescale', args: { unit: unitArg(c), ask } } : null });
noun({ type: 'chronpart', words: { age: ['stages', 'ages'], epoch: ['epochs', 'series'], period: ['periods', 'systems'], era: ['eras'], parts: ['subdivisions', 'parts', 'divisions', 'units'] },
  words_pt: { age: ['andares', 'idades'], epoch: ['épocas', 'epocas'], period: ['períodos', 'periodos'], era: ['eras'], parts: ['subdivisões', 'subdivisoes'] } });
frame({
  name: 'chronparts', label: 'Timescale', words: ['list', 'show'], elidable: true, theme: ['chronpart'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'in', 'within'], types: ['chron'] } }, label_pt: 'Escala do tempo',
  bind: c => ({ tool: 'timescale', args: { unit: c.roles.of[0].value, ask: 'children', ...(c.theme[0].value === 'parts' ? {} : { rank: c.theme[0].value }) } })
});
unit({ unit: 'Ma', dim: 'geologic age', words: ['ma', 'myr', 'my', 'million years ago', 'million years', 'mya'] });
unit({ unit: 'Ga', dim: 'geologic age', words: ['ga', 'billion years ago', 'billion years', 'gya'] });
frame({
  name: 'chronage', label: 'Timescale', words: ['what period is', 'which period is', 'what epoch is', 'what era is', 'what age is', 'what stage is', 'what unit is', 'what was at', 'what period was', 'which period contains'],
  elidable: true, theme: ['quantity:geologic age'], required: ['theme'], roles: {}, words_pt: ['que período é', 'qual período é'], label_pt: 'Escala do tempo',
  bind: c => { const q = c.theme[0]; return q.unit ? { tool: 'timescale', args: { age: q.n * (q.unit === 'Ga' ? 1000 : 1) } } : null; }
});
// names retired from the chart are nouns too, so the card can say what replaced them
noun({ type: 'chron', words: Object.fromEntries(Object.keys(RETIRED).map(k => [k, [k]])), words_pt: Object.fromEntries(Object.keys(RETIRED).map(k => [k, [k]])) });

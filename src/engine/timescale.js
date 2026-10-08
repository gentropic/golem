// The geologic timescale: the ICS chart as a records pack (data/timescale.js). Ages, bounds, ranks,
// what a unit sits in, what came before and after, what it is subdivided into, and which unit an age
// in Ma falls in. Lookups only; the chart is the answer.
import { tool, frame, fmt } from './core.js';
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
  name: 'timescale', rank: 75,
  skill: { group: 'Knowledge', title: 'Geologic timescale', on: 'ICS chart · Macrostrat · CC BY 4.0', about: 'Ages and bounds of every unit on the chart, what it sits in, what came before and after, and which unit an age falls in.', examples: ['how old is the permian', 'what period is 250 ma', 'how long was the cretaceous', 'stages of the triassic'] },
  read: (text, q) => {
    let m;
    if ((m = new RegExp(`^(?:how old is|when was|when is|age of|dates? of|bounds of)(?: the)? ${UNITRE}$`).exec(q))) return { unit: m[1] };
    if ((m = new RegExp(`^(?:how long (?:was|is|did)|duration of|length of)(?: the)? ${UNITRE}(?: last)?$`).exec(q))) return { unit: m[1], ask: 'duration' };
    if ((m = new RegExp(`^(?:what|which) (?:came|comes|was|is) (before|after)(?: the)? ${UNITRE}$`).exec(q))) return { unit: m[2], ask: m[1] };
    if ((m = new RegExp(`^(?:stages|ages|epochs|periods|eras|series|systems|subdivisions|parts|divisions) of(?: the)? ${UNITRE}$`).exec(q))) return { unit: m[1], ask: 'children' };
    if ((m = /^(?:(?:what|which) (?:period|epoch|era|eon|age|stage|unit|time) (?:is|was|contains|had) )?(\d+(?:\.\d+)?) ?(ma|myr|ga|million years(?: ago)?|billion years(?: ago)?)$/.exec(q))) return { age: +m[1] * (/^(ga|billion)/.test(m[2]) ? 1000 : 1) };
    return null;
  },
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
    const kids = childrenOf(u), chain = chainOf(u), bef = beforeOf(u), aft = afterOf(u), dur = u.b - u.t;
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
  words_pt: ['quando foi', 'idade de', 'datar', 'data'], label_pt: 'Datar',
  bind: c => { const t = c.theme[0]; return t && t.value ? { tool: 'timescale', args: { unit: t.value } } : null; }
});

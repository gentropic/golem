// The words golem obeys, shown (SPEC 13: nothing hidden). "what words do you know for density": every command whose
// words carry it, every thing (noun) and unit it names, and what was taught on this device, from the live ontology —
// the same one the parser reads with, so what is listed is what reads (the open table's columns and an installed
// pack's names included). Without a word: how many of each, and where to start.
import { S, tool, frame, FRAMES } from './core.js';
import { ontology } from './ontology.js';
import { examples } from './skills.js';

const has = (ws, t) => (ws || []).some(w => String(w).toLowerCase().includes(t));
const show = (ws, n = 5) => { const u = [...new Set(ws)]; return u.slice(0, n).join(', ') + (u.length > n ? `, … (${u.length})` : ''); };
const TYPE = { variable: 'a column of the open table', plot: 'a kind of plot', country: 'a country', mineral: 'a mineral', element: 'an element', plane: 'a plane', measurable: 'something to measure', chron: 'a unit of the timescale', unit: 'a unit', activity: 'a logged activity', devtable: 'a table on this device',
  mineralprop: 'a mineral property', property: 'a country property (Factbook)', formulavar: 'a term of a formula', formulaname: 'a formula', sgword: 'a density word', fieldnb: 'the field notebook', taughtthing: 'something taught here', mineralclass: 'a class of minerals', format: 'a file format', north: 'a north', period: 'a period of time' };
tool({
  name: 'words',
  skill: { group: 'Session', title: 'The words golem knows', on: 'the ontology the parser reads', about: 'Every command, thing and unit golem reads, and what you taught it, searchable by a word: what is listed is exactly what reads.', examples: ['what words do you know for density', 'what words do you know'] },
  topic: a => [a.about ? `Words: ${a.about}` : 'Words', .2],
  run: a => {
    const o = ontology(), t = a.about ? String(a.about).toLowerCase().trim() : null;
    const taught = [...Object.entries(S.aliases).map(([k, v]) => ['taught', k, `reads as "${v}"`]), ...Object.entries(S.formulas || {}).map(([k, f]) => ['taught formula', k, `${f.result} = ${f.expr}`])];
    if (!t) {
      const nouns = o.nouns.reduce((s, n) => s + Object.values(n.words || {}).reduce((x, w) => x + w.length, 0) + (n.generic || []).length, 0);
      const units = o.units.reduce((s, u) => s + u.words.length, 0);
      return { read: ['the words I know'], value: o.verbs.length,
        body: [{ t: 'kv', rows: [['commands', `${o.verbs.length}, with ${o.verbs.reduce((s, v) => s + (v.words || []).length, 0)} ways to say them in English and ${o.verbs.reduce((s, v) => s + (v.words_pt || []).length, 0)} in Portuguese`], ['things', `${nouns} words for ${o.nouns.length} kinds of thing`], ['units', `${units} words for ${o.units.length} units`], ['taught on this device', taught.length ? taught.map(r => r[1]).join(', ') : 'nothing yet ("pop means population", "granite is 2.7 t/m3")']] },
          { t: 'sub', text: 'Ask for a word to see where it reads: "what words do you know for density".' }, { t: 'chips', items: ['what words do you know for density', 'what words do you know for station', 'what can you do'] }],
        trace: ['ontology(): the parser\'s own'] };
    }
    const rows = [];
    // a command by its label once (two frames may share one), its words that carry the term first
    const seen = new Set();
    for (const v of o.verbs) if (has(v.words, t) || has(v.words_pt, t) || has([v.label], t)) {
      const ws = [...v.words || [], ...v.words_pt || []], hit = ws.filter(w => w.toLowerCase().includes(t)), label = v.label || v.name;
      if (seen.has(label) && !hit.length) continue; seen.add(label);
      rows.push(['command', label, show([...hit, ...(v.words || [])])]);
    }
    for (const n of o.nouns) {
      const keys = Object.entries(n.words || {}).filter(([k, ws]) => String(k).toLowerCase().includes(t) || has(ws, t) || has((n.words_pt || {})[k], t));
      if (keys.length) rows.push(['thing', TYPE[n.type] || n.type, show(keys.flatMap(([k, ws]) => [k, ...ws, ...((n.words_pt || {})[k] || [])]).filter(w => String(w).toLowerCase().includes(t)), 6)]);
      if (has(n.generic, t)) rows.push(['thing', TYPE[n.type] || n.type, show(n.generic.filter(w => w.toLowerCase().includes(t)))]);
    }
    for (const u of o.units) if (has(u.words, t) || has(u.words_pt, t)) rows.push(['unit', `${u.unit} (${u.dim})`, show(u.words)]);
    for (const r of taught) if (r[1].includes(t) || r[2].toLowerCase().includes(t)) rows.push(r);
    const ex = examples().filter(e => e.toLowerCase().includes(t)).slice(0, 6);
    const read = ['the words I know for', { v: t }];
    if (!rows.length) return { read, value: 0, body: [{ t: 'note', text: `I know no word with "${t}" in it. Teach me one: "${t} means …", or "${t} is 2.7 t/m3".` }], trace: ['ontology(): no match'] };
    return { read, value: rows.length, body: [{ t: 'table', head: ['', 'what', 'words'], rows: rows.slice(0, 40) }, ...(rows.length > 40 ? [{ t: 'sub', text: `The first 40 of ${rows.length}.` }] : []), ...(ex.length ? [{ t: 'lbl', text: 'Try' }, { t: 'chips', items: ex }] : [])],
      trace: [`ontology(): ${rows.length} entries with "${t}"`] };
  }
});
// "what words do you know", "what words do you know for density", "words for station", "que palavras você conhece para densidade"
frame({
  name: 'words', label: 'Words', words: ['what words do you know', 'which words do you know', 'what words do you understand', 'list the words', 'words'], theme: [], required: [],
  roles: { about: { preps: ['for', 'about', 'with'], types: ['text'] } },
  words_pt: ['que palavras você conhece', 'quais palavras você conhece', 'palavras'], label_pt: 'Palavras',
  bind: c => { const w = c.roles.about && c.roles.about[0] && String(c.roles.about[0].value).trim(); return { tool: 'words', args: w ? { about: w } : {} }; }
});
export const frameCount = () => FRAMES.length;

// Knowledge from packs: a Factbook sample, an ODS term index,
// and a style check from The Elements of Style (1918). All sample data, labelled as such.
import { T, tool, frame, unit, fmt } from './core.js';
import { parseUnit } from './units.js';

/* ── records: Factbook sample (rounded) ────────────────────── */
export const FB = [['Australia', 'Canberra', 7741220, 26.8e6, 0], ['Brazil', 'Brasília', 8515770, 220.1e6, 0], ['Canada', 'Ottawa', 9984670, 38.8e6, 0], ['Chile', 'Santiago', 756102, 18.7e6, 0],
  ['Germany', 'Berlin', 357022, 84.1e6, 0], ['Indonesia', 'Jakarta', 1904569, 281.6e6, 0], ['Ireland', 'Dublin', 70273, 5.2e6, 0], ['Japan', 'Tokyo', 377915, 123.2e6, 0],
  ['Kazakhstan', 'Astana', 2724900, 20.3e6, 1], ['Mongolia', 'Ulaanbaatar', 1564116, 3.3e6, 1], ['Peru', 'Lima', 1285216, 32.6e6, 0], ['Portugal', 'Lisbon', 92090, 10.2e6, 0],
  ['South Africa', 'Pretoria', 1219090, 60.4e6, 0], ['Zambia', 'Lusaka', 752618, 20.8e6, 1]];
export const fbFind = n => FB.find(r => r[0].toLowerCase() === n.trim().toLowerCase().replace(/^the /, ''));
const FBSRC = { t: 'src', text: 'factbook pack · 14-country rounded sample in this mock' };
const FIELDS = ['capital', 'population', 'area', 'density'];
tool({
  name: 'fact',
  skill: { group: 'Knowledge', title: 'Records', on: 'factbook pack', about: 'Lookups, unit changes and filters across records.', examples: ['population density of mongolia in people per square mile', 'landlocked countries by population', 'area of brazil in square miles'] },
  amend: [
    { arg: 'unit', match: /^(?:and |now |same (?:but )?)?(?:in|to|as) (.+)$/, when: a => /area|density/.test(a.field) },
    { arg: 'country', match: /^(?:and|same for|what about|now|and for)(?: the)? (.+)$/, value: m => fbFind(m[1]) ? m[1] : null }
  ],
  topic: a => [fbFind(a.country)[0] + ' ' + a.field, 2],
  run: a => {
    const r = fbFind(a.country); if (!r) return null;
    const read = [a.field, 'of', { v: r[0] }], trace = [`factbook.get("${r[0]}")`]; let big, py = `data("factbook")["${r[0]}"].${a.field}`;
    if (a.field === 'capital') big = { t: 'big', v: r[1] };
    else if (a.field === 'population') big = { t: 'big', v: fmt(r[3], 4), unit: 'people' };
    else if (a.field === 'area') {
      let un = a.unit && parseUnit(a.unit); if (!un || un.dim !== 'A') un = parseUnit('km²');
      read.push('in', { v: un.name }); big = { t: 'big', v: fmt(r[2] * 1e6 / un.f, 5), unit: un.name };
      trace.push(`area ${fmt(r[2], 9)} km² → ${un.name}`); py = `units.convert(${py}, "km²", "${un.name}")`;
    } else {
      const mi = /mi/.test(a.unit || ''), v = r[3] / r[2] * (mi ? 2.589988110336 : 1), per = mi ? 'sq mi' : 'km²';
      read.push('in', { v: 'people / ' + per }); big = { t: 'big', v: fmt(v, 3), unit: `people per ${per}` };
      trace.push(`population ${fmt(r[3], 4)} ÷ area ${fmt(r[2], 9)} km²`, mi ? 'units: per km² → per sq mi' : 'no unit change');
      py = `c = data("factbook")["${r[0]}"]\nunits.convert(c.population / c.area, "1/km²", "1/${per}")`;
    }
    return { read, body: [big, FBSRC], trace, py };
  }
});
tool({
  name: 'factList',
  topic: () => ['Landlocked countries', 2],
  run: a => {
    const k = a.by === 'population' ? 3 : 2, rows = FB.filter(r => r[4]).sort((x, y) => y[k] - x[k]);
    return {
      read: ['filter countries where', { v: 'landlocked' }, 'sort by', { v: a.by, key: 'by', alts: ['area', 'population'], cur: a.by }],
      body: [{ t: 'table', head: ['Country', 'Area km²', 'Population'], num: [false, true, true], rows: rows.map(r => [r[0], fmt(r[2], 9), fmt(r[3], 4)]) }, { t: 'sub', text: `${rows.length} of ${FB.length} records match.` }, FBSRC],
      trace: ['factbook.records → 14', 'filter landlocked = true', `sort by ${a.by}, descending`], py: `data("factbook").filter(landlocked=True).sort("${a.by}", desc=True)`
    };
  }
});

/* ── text: ODS term index + Strunk (1918) check ────────────── */
export const ODS = { skiplist: ['4 Skiplists', '4.1 The Basic Structure'], 'hash table': ['5 Hash Tables', '5.1 ChainedHashTable'], 'binary heap': ['10 Heaps', '10.1 BinaryHeap'], treap: ['7 Random Binary Search Trees', '7.2 Treap'], 'scapegoat tree': ['8 Scapegoat Trees', '8.1 ScapegoatTree'], 'red-black tree': ['9 Red-Black Trees', '9.2 RedBlackTree'], 'b-tree': ['14 External Memory Searching', '14.2 B-Trees'] };
export const ODSA = { 'skip list': 'skiplist', heap: 'binary heap', 'red black tree': 'red-black tree', btree: 'b-tree', 'b tree': 'b-tree', hashtable: 'hash table' };
tool({
  name: 'define',
  skill: { group: 'Knowledge', title: 'Definitions', on: 'ods pack', about: 'Finds where a term is defined and opens the reader there.', examples: ['what is a skiplist'] },
  topic: a => [a.term, 2],
  run: a => {
    const t = a.term.replace(/s$/, ''), k = ODS[t] ? t : ODSA[t];
    if (k) return {
      read: ['find the definition of', { v: k }],
      body: [{ t: 'big', v: `Open Data Structures, ch. ${ODS[k][0]}`, size: 17 }, { t: 'sub', text: `Defined in §${ODS[k][1]}.` }, { t: 'note', text: 'The app shows the defining passage here and opens the reader at that section. This mock carries only the locator.' },
        { t: 'actions', items: [{ href: 'https://gentropic.github.io/gcu-library/read.html?book=ods', label: 'Open in the library reader' }] }, { t: 'src', text: 'ods pack · CC BY 2.5 · Pat Morin · sample term index' }],
      trace: [`index.lookup("${k}") across installed packs`, 'hit: ods, glossary facet'], py: `library.define("${k}")`
    };
    return null;
  }
});
const LINT = [
  [/\bthe question as to whether\b/gi, 13, 'whether'], [/\bthere is no doubt but that\b/gi, 13, 'no doubt'], [/\bused for fuel purposes\b/gi, 13, 'used for fuel'],
  [/\bin a hasty manner\b/gi, 13, 'hastily'], [/\bthis is a subject which\b/gi, 13, 'this subject'], [/\bowing to the fact that\b/gi, 13, 'since'],
  [/\bin spite of the fact that\b/gi, 13, 'though'], [/\bcall your attention to the fact that\b/gi, 13, 'remind you'], [/\bthe fact that\b/gi, 13, 'recast without it'],
  [/\bnot honest\b/gi, 12, 'dishonest'], [/\bnot important\b/gi, 12, 'trifling'], [/\bdid not remember\b/gi, 12, 'forgot'], [/\bdid not pay any attention to\b/gi, 12, 'ignored'], [/\bdid not have much confidence in\b/gi, 12, 'distrusted'],
  [/\b(?:is|are|was|were|be|been|being) (?:\w{3,}ed|lost|taken|given|made|done|found|sent|written|shown)\b(?: by\b)?/gi, 11, 'name who did it']
];
const RULE = { 11: 'Use the active voice.', 12: 'Put statements in positive form.', 13: 'Omit needless words.' };
tool({
  name: 'lint',
  skill: { group: 'Knowledge', title: 'Style check', on: 'elements-of-style pack', about: 'Rules compiled into a checker that cites the rule.', examples: ['check: owing to the fact that the samples were lost by the lab, there is no doubt but that the assay was not important'] },
  topic: () => ['Style check', 2],
  run: a => {
    const hits = [];
    LINT.forEach(([re, rule, fix]) => { re.lastIndex = 0; let m; while ((m = re.exec(a.text))) if (!hits.some(h => m.index < h.e && m.index + m[0].length > h.s)) hits.push({ s: m.index, e: m.index + m[0].length, rule, fix }); });
    hits.sort((x, y) => x.s - y.s);
    return {
      read: ['check text against', { v: 'The Elements of Style (1918)' }],
      body: [{ t: 'marked', text: a.text, spans: hits.map(h => [h.s, h.e]) },
        hits.length ? { t: 'table', head: ['Found', 'Rule', 'Try'], rows: hits.map(h => [a.text.slice(h.s, h.e), `${h.rule}. ${RULE[h.rule]}`, h.fix]) } : { t: 'note', kind: 'ok', text: 'No rule in the pack matched this text.' },
        { t: 'src', text: `elements-of-style pack · public domain · ${LINT.length} patterns compiled from rules 11 to 13` }],
      trace: [`style.rules("elements-of-style") → ${LINT.length} patterns`, `scan ${a.text.length} characters → ${hits.length} matches`], py: `style.check(text, pack="elements-of-style")`
    };
  }
});

/* ── clause frames over this knowledge ── */
// "what is the capital of brazil", "population density of mongolia in people per square mile"
frame({
  name: 'lookup', label: 'Look up', words: ['lookup', 'look up', 'get', 'find'], elidable: true,
  theme: ['property'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for'], types: ['country'] }, unit: { preps: ['in', 'as'], types: ['unit'] } },
  words_pt: ['consultar', 'consulta', 'buscar', 'busca'], label_pt: 'Consultar',
  bind: c => {
    const p = c.theme[0] && c.theme[0].value, of = c.roles.of && c.roles.of[0], unit = c.roles.unit && c.roles.unit[0]; if (!p || !of) return null;
    const field = p === 'population density' ? 'density' : p;
    if (of.type === 'country' && FIELDS.includes(field)) return { tool: 'fact', args: { field, country: of.value.toLowerCase(), unit: unit ? unit.unit : undefined } };
    return null;
  }
});
// "what is a skiplist", "define treap", "treap"
frame({
  name: 'define', label: 'Define', words: ['define', 'explain', 'describe'], elidable: true,
  theme: ['term'], required: ['theme'], roles: {},
  words_pt: ['definir', 'define', 'defina', 'explicar', 'explica', 'descrever', 'descreve'], label_pt: 'Definir',
  bind: c => { const t = c.theme[0]; return t && t.value ? { tool: 'define', args: { term: t.value } } : null; }
});
// "landlocked countries by population", "which countries are landlocked"
frame({
  name: 'list', label: 'List', words: ['list', 'rank'], elidable: true,
  theme: ['country'], required: ['theme'], roles: { by: { preps: ['by'], types: ['property'] } },
  words_pt: ['listar', 'lista', 'ordenar', 'ordena'], label_pt: 'Listar',
  bind: c => {
    const t = c.theme[0], by = c.roles.by && c.roles.by[0].value; if (!t || !t.attrs || t.attrs.filter !== 'landlocked') return null;
    if (by && by !== 'area' && by !== 'population') return null;
    return { tool: 'factList', args: { by: by || 'area' } };
  }
});
// "check: …", "review this: …"
frame({
  name: 'lint', label: 'Check', words: ['check', 'lint', 'review', 'proofread', 'style check'], theme: [], required: ['text'], roles: { text: { preps: [':'], types: ['text'] } },
  words_pt: ['revisa', 'revise', 'confere', 'confira'], label_pt: 'Revisar',
  bind: c => { const t = c.roles.text && c.roles.text[0]; return t && t.type === 'text' ? { tool: 'lint', args: { text: t.value } } : null; }
});
// areas the records are asked in: parseUnit knows them, the grammar learns their words here
for (const [u, words] of [['mi2', ['square miles', 'square mile', 'sq mi', 'mi2']], ['km2', ['square kilometres', 'square kilometers', 'square km', 'sq km', 'km2']], ['ha', ['hectares', 'hectare', 'ha']], ['acres', ['acres', 'acre']]]) unit({ unit: u, dim: 'area', words });

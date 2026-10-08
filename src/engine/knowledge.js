// Knowledge from packs: a Factbook sample, minerals with an identification key, an ODS term index,
// and a style check from The Elements of Style (1918). All sample data, labelled as such.
import { T, tool, frame, fmt } from './core.js';
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
  name: 'fact', rank: 70,
  skill: { group: 'Knowledge', title: 'Records', on: 'factbook pack', about: 'Lookups, unit changes and filters across records.', examples: ['population density of mongolia in people per square mile', 'landlocked countries by population', 'area of brazil in square miles'] },
  read: (text, q) => { const m = /^(?:what is |what's )?(?:the )?(capital|population density|density|population|area) of (.+?)(?: in (.+))?$/.exec(q); return m ? { field: m[1] === 'population density' ? 'density' : m[1], country: m[2], unit: m[3] } : null; },
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
  name: 'factList', rank: 72,
  read: (text, q) => { const m = /^(?:which |list |show )?landlocked countries(?: (?:by|sorted by) (area|population))?$/.exec(q); return m ? { by: m[1] || 'area' } : null; },
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

/* ── minerals: properties + identification key ─────────────── */
export const MIN = {
  pyrite: ['FeS₂', '6–6.5', '4.9–5.2', 'greenish black', 'm', 'dark', 3, 'n', 'n', 'yellow'], chalcopyrite: ['CuFeS₂', '3.5–4', '4.1–4.3', 'greenish black', 'm', 'dark', 2, 'n', 'n', 'yellow'],
  galena: ['PbS', '2.5', '7.4–7.6', 'lead grey', 'm', 'dark', 2, 'n', 'n', 'grey'], magnetite: ['Fe₃O₄', '5.5–6.5', '5.2', 'black', 'm', 'dark', 3, 'y', 'n', 'black'],
  hematite: ['Fe₂O₃', '5.5–6.5', '5.3', 'red-brown', 'm', 'red', 3, 'n', 'n', 'grey'], molybdenite: ['MoS₂', '1–1.5', '4.6–4.7', 'bluish grey', 'm', 'dark', 1, 'n', 'n', 'grey'],
  gold: ['Au', '2.5–3', '19.3 when pure', 'golden yellow', 'm', 'gold', 2, 'n', 'n', 'yellow'], sphalerite: ['ZnS', '3.5–4', '3.9–4.1', 'brown to pale yellow', 'n', 'brown', 2, 'n', 'n', 'brown'],
  quartz: ['SiO₂', '7', '2.65', 'white', 'n', 'white', 3, 'n', 'n', 'clear'], calcite: ['CaCO₃', '3', '2.71', 'white', 'n', 'white', 2, 'n', 'y', 'clear'],
  fluorite: ['CaF₂', '4', '3.18', 'white', 'n', 'white', 2, 'n', 'n', 'clear'], malachite: ['Cu₂CO₃(OH)₂', '3.5–4', '3.6–4.0', 'light green', 'n', 'green', 2, 'n', 'y', 'green']
};
const MATTR = { lus: 4, st: 5, hard: 6, mag: 7, hcl: 8, col: 9 };
const KEYQ = {
  lus: ['What is the lustre?', { m: 'metallic', n: 'non-metallic' }],
  st: ['What colour is the streak on a porcelain plate?', { dark: 'black or dark grey', red: 'red-brown', gold: 'golden yellow', white: 'white', green: 'green', brown: 'brown to pale yellow' }],
  hard: ['How hard is it?', { 1: 'a fingernail scratches it', 2: 'a knife scratches it', 3: 'a knife does not scratch it' }],
  col: ['What colour is a fresh surface?', { yellow: 'brass or golden yellow', grey: 'grey to silver', black: 'black', clear: 'colourless or pale', brown: 'brown', green: 'green' }],
  mag: ['Does a magnet pick it up?', { y: 'yes', n: 'no' }], hcl: ['Does it fizz in dilute HCl?', { y: 'yes', n: 'no' }]
};
const MPROPS = ['formula', 'hardness', 'density', 'streak'];
const minCard = n => { const m = MIN[n]; return [{ t: 'kv', rows: [['formula', m[0]], ['hardness', `${m[1]} Mohs`], ['density', `${m[2]} g/cm³`], ['streak', m[3]], ['lustre', m[4] === 'm' ? 'metallic' : 'non-metallic']] }, { t: 'src', text: 'minerals pack (proposed) · 12 minerals in this mock' }]; };
tool({
  name: 'mineral', rank: 71,
  read: (text, q) => { const m = /^(?:what is |what's )?(?:the )?(density|hardness|formula|streak) of (\w+)$/.exec(q); return m ? { prop: m[1], name: m[2] } : null; },
  topic: a => [a.name, 2],
  run: a => {
    const m = MIN[a.name]; if (!m) return null;
    const i = MPROPS.indexOf(a.prop), unit = a.prop === 'density' ? 'g/cm³' : a.prop === 'hardness' ? 'Mohs' : undefined;
    if (i < 0) return { read: ['describe mineral', { v: a.name }], body: minCard(a.name), trace: [`minerals.get("${a.name}")`], py: `data("minerals")["${a.name}"]` };
    return { read: [a.prop, 'of mineral', { v: a.name }], body: [{ t: 'big', v: m[i], unit }, { t: 'src', text: 'minerals pack (proposed)' }], trace: [`minerals.get("${a.name}").${a.prop}`], py: `data("minerals")["${a.name}"].${a.prop}` };
  }
});
tool({
  name: 'key', rank: 73,
  skill: { group: 'Field', title: 'Mineral key', on: 'minerals pack', about: 'golem asks the questions and narrows the candidates.', examples: ['identify a mineral', 'density of chalcopyrite'] },
  read: (text, q) => /^(?:identify|key out|id)(?: a| this| the)? (?:mineral|rock|sample)$|^what mineral is this$/.test(q) ? {} : null,
  topic: () => ['Mineral key', 3],
  run: a => {
    a.ans = a.ans || {};
    const cand = Object.keys(MIN).filter(n => Object.entries(a.ans).every(([k, v]) => String(MIN[n][MATTR[k]]) === String(v)));
    const read = ['identify a mineral', ...Object.entries(a.ans).map(([k, v]) => ({ v: KEYQ[k][1][v] }))];
    const trace = [`minerals pack → ${Object.keys(MIN).length} candidates`, ...Object.entries(a.ans).map(([k, v]) => `keep ${k} = ${v}`), `${cand.length} left`];
    let best = null, bn = 1;
    Object.keys(MATTR).forEach(k => { if (k in a.ans) return; const n = new Set(cand.map(c => MIN[c][MATTR[k]])).size; if (n > bn) { bn = n; best = k; } });
    if (cand.length > 1 && best) {
      const vals = [...new Set(cand.map(c => String(MIN[c][MATTR[best]])))];
      return { read, trace, body: [{ t: 'sub', text: `${cand.length} candidates: ${cand.join(', ')}` }],
        ask: { prompt: KEYQ[best][0], options: vals.map(v => ({ label: KEYQ[best][1][v], value: v })), set: (x, v) => { x.ans = { ...x.ans, [best]: v }; } } };
    }
    const n = Object.keys(a.ans).length;
    return { read, trace, body: [{ t: 'big', v: cand.join(' or ') }, { t: 'sub', text: `Reached in ${n} question${n === 1 ? '' : 's'}. Each question was the one that split the remaining candidates most.` }, ...(cand.length === 1 ? minCard(cand[0]) : [])], py: `key("minerals").identify(${JSON.stringify(a.ans)})` };
  }
});

/* ── text: ODS term index + Strunk (1918) check ────────────── */
export const ODS = { skiplist: ['4 Skiplists', '4.1 The Basic Structure'], 'hash table': ['5 Hash Tables', '5.1 ChainedHashTable'], 'binary heap': ['10 Heaps', '10.1 BinaryHeap'], treap: ['7 Random Binary Search Trees', '7.2 Treap'], 'scapegoat tree': ['8 Scapegoat Trees', '8.1 ScapegoatTree'], 'red-black tree': ['9 Red-Black Trees', '9.2 RedBlackTree'], 'b-tree': ['14 External Memory Searching', '14.2 B-Trees'] };
export const ODSA = { 'skip list': 'skiplist', heap: 'binary heap', 'red black tree': 'red-black tree', btree: 'b-tree', 'b tree': 'b-tree', hashtable: 'hash table' };
tool({
  name: 'define', rank: 120,
  skill: { group: 'Knowledge', title: 'Definitions', on: 'ods pack', about: 'Finds where a term is defined and opens the reader there.', examples: ['what is a skiplist'] },
  read: (text, q) => { const m = /^(?:what is|what's|define|explain|describe)(?: an?| the)? (.+)$/.exec(q); return m ? { term: m[1] } : null; },
  topic: a => [a.term, 2],
  run: a => {
    const t = a.term.replace(/s$/, ''), k = ODS[t] ? t : ODSA[t];
    if (k) return {
      read: ['find the definition of', { v: k }],
      body: [{ t: 'big', v: `Open Data Structures, ch. ${ODS[k][0]}`, size: 17 }, { t: 'sub', text: `Defined in §${ODS[k][1]}.` }, { t: 'note', text: 'The app shows the defining passage here and opens the reader at that section. This mock carries only the locator.' },
        { t: 'actions', items: [{ href: 'https://gentropic.github.io/gcu-library/read.html?book=ods', label: 'Open in the library reader' }] }, { t: 'src', text: 'ods pack · CC BY 2.5 · Pat Morin · sample term index' }],
      trace: [`index.lookup("${k}") across installed packs`, 'hit: ods, glossary facet'], py: `library.define("${k}")`
    };
    if (MIN[t]) return T.mineral({ name: t });
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
  name: 'lint', rank: 80,
  skill: { group: 'Knowledge', title: 'Style check', on: 'elements-of-style pack', about: 'Rules compiled into a checker that cites the rule.', examples: ['check: owing to the fact that the samples were lost by the lab, there is no doubt but that the assay was not important'] },
  read: text => { const m = /^(?:check|lint|review)(?: this| the)?(?: text| sentence| paragraph)?[:,]? (.+)$/i.exec(text); return m ? { text: m[1] } : null; },
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
// "density of chalcopyrite", "what is the capital of brazil", "population density of mongolia in people per square mile"
frame({
  name: 'lookup', label: 'Look up', words: ['lookup', 'look up', 'get', 'find'], elidable: true,
  theme: ['property'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for'], types: ['mineral', 'country'] }, unit: { preps: ['in', 'as'], types: ['unit'] } },
  words_pt: ['consultar', 'consulta', 'buscar', 'busca'], label_pt: 'Consultar',
  bind: c => {
    const p = c.theme[0] && c.theme[0].value, of = c.roles.of && c.roles.of[0], unit = c.roles.unit && c.roles.unit[0]; if (!p || !of) return null;
    const field = p === 'population density' ? 'density' : p;
    if (of.type === 'country' && FIELDS.includes(field)) return { tool: 'fact', args: { field, country: of.value.toLowerCase(), unit: unit ? unit.unit : undefined } };
    if (of.type === 'mineral' && MPROPS.includes(p)) return { tool: 'mineral', args: { prop: p, name: of.value } };
    return null;
  }
});
// "what is a skiplist", "define treap", "chalcopyrite"
frame({
  name: 'define', label: 'Define', words: ['define', 'explain', 'describe'], elidable: true,
  theme: ['term', 'mineral'], required: ['theme'], roles: {},
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
frame({
  name: 'identify', label: 'Identify', words: ['identify', 'key out', 'id'], theme: ['mineral'], required: ['theme'], roles: {},
  words_pt: ['identificar', 'identifica'], label_pt: 'Identificar',
  bind: c => { const t = c.theme[0]; return t && t.generic ? { tool: 'key', args: {} } : null; }
});

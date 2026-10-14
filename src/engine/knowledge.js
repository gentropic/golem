// Knowledge from packs: an ODS term index and a style check from The Elements of Style (1918), sample data labelled as such.
// The Factbook is factbook.js.
import { T, tool, frame, unit, fmt } from './core.js';
import { parseUnit } from './units.js';

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
      body: [{ t: 'big', v: `Open Data Structures, ch. ${ODS[k][0]}`, size: 17 }, { t: 'sub', text: `Defined in §${ODS[k][1]}.` }, { t: 'note', text: 'With the ods pack installed, the defining passage shows here. This build carries only the locator.' },
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
// "what is a skiplist", "define treap", "treap"
frame({
  name: 'define', label: 'Define', words: ['define', 'explain', 'describe'], elidable: true,
  theme: ['term'], required: ['theme'], roles: {},
  words_pt: ['definir', 'define', 'defina', 'explicar', 'explica', 'descrever', 'descreve'], label_pt: 'Definir',
  bind: c => { const t = c.theme[0]; return t && t.value ? { tool: 'define', args: { term: t.value } } : null; }
});
// "check: …", "review this: …"
frame({
  name: 'lint', label: 'Check', words: ['check', 'lint', 'review', 'proofread', 'style check'], theme: [], required: ['text'], roles: { text: { preps: [':'], types: ['text'] } },
  words_pt: ['revisa', 'revise', 'confere', 'confira'], label_pt: 'Revisar',
  bind: c => { const t = c.roles.text && c.roles.text[0]; return t && t.type === 'text' ? { tool: 'lint', args: { text: t.value } } : null; }
});
// areas the records are asked in: parseUnit knows them, the grammar learns their words here
for (const [u, words] of [['mi2', ['square miles', 'square mile', 'sq mi', 'mi2']], ['km2', ['square kilometres', 'square kilometers', 'square km', 'sq km', 'km2']], ['ha', ['hectares', 'hectare', 'ha']], ['acres', ['acres', 'acre']]]) unit({ unit: u, dim: 'area', words });

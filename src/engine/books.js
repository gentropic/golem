// Books from packs (SPEC 13.8): definitions from Open Data Structures, a style check from The Elements of Style (1918).
// Each works from a small sample that ships with golem, or from the gcu-library pack once the shell has installed it and
// handed its compiled index here (useBook). Packs are compiled at install by packs.js; only the index is kept.
import { tool, frame, noun } from './core.js';

const READER = 'https://gentropic.org/gcu-library/read.html?book=';

/* ── Open Data Structures: where a term is defined ───────────── */
// the sample: a locator per term, no passage
const ODS_SAMPLE = { skiplist: ['4 Skiplists', '4.1 The Basic Structure'], 'hash table': ['5 Hash Tables', '5.1 ChainedHashTable'], 'binary heap': ['10 Heaps', '10.1 BinaryHeap'], treap: ['7 Random Binary Search Trees', '7.2 Treap'],
  'scapegoat tree': ['8 Scapegoat Trees', '8.1 ScapegoatTree'], 'red-black tree': ['9 Red-Black Trees', '9.2 RedBlackTree'], 'b-tree': ['14 External Memory Searching', '14.2 B-Trees'] };
const ODS_ALIAS = { 'skip list': 'skiplist', heap: 'binary heap', 'red black tree': 'red-black tree', btree: 'b-tree', 'b tree': 'b-tree', hashtable: 'hash table' };
let ODS = null;   // the installed pack's index: { title, author, license, version, terms: { term: { chapter, chapterTitle, section, passage } } }
const termKey = t => { const k = String(t).toLowerCase().trim(); const all = ODS ? ODS.terms : ODS_SAMPLE; return all[k] ? k : all[k.replace(/s$/, '')] ? k.replace(/s$/, '') : ODS_ALIAS[k] && all[ODS_ALIAS[k]] ? ODS_ALIAS[k] : null; };
tool({
  name: 'define',
  skill: { group: 'Knowledge', title: 'Definitions', on: 'ods pack', about: 'Where a term is defined in Open Data Structures, with the defining passage when the pack is installed, and the reader one tap away.', examples: ['what is a skiplist', 'define sentinel', 'treap'] },
  topic: a => [a.term, 2],
  run: a => {
    const k = termKey(a.term); if (!k) return null;
    if (!ODS) return {
      read: ['find the definition of', { v: k }],
      body: [{ t: 'big', v: `Open Data Structures, ch. ${ODS_SAMPLE[k][0]}`, size: 17 }, { t: 'sub', text: `Defined in §${ODS_SAMPLE[k][1]}.` }, { t: 'note', text: 'With the ods pack installed (Packs and this device), the defining passage shows here. This build carries only the locator.' },
        { t: 'actions', items: [{ href: READER + 'ods', label: 'Open in the library reader' }] }, { t: 'src', text: 'ods pack · CC BY 2.5 · Pat Morin · the sample term index that ships with golem' }],
      trace: [`index.lookup("${k}") across installed packs`, 'hit: the sample index (locator only)'], py: `library.define("${k}")`
    };
    const d = ODS.terms[k], where = `Chapter ${d.chapter}, ${d.chapterTitle}${d.section ? ` · ${d.section}` : ''}`;
    return {
      read: ['find the definition of', { v: k }],
      body: [{ t: 'lbl', text: where }, { t: 'sub', text: d.passage }, { t: 'actions', items: [{ href: READER + 'ods', label: 'Open the book in the library reader' }] },
        { t: 'src', text: `${ODS.title} · ${ODS.author} · ${ODS.license} · the passage as published · installed on this device` }],
      trace: [`index.lookup("${k}") in ods ${ODS.version || ''}`.trim(), `hit: ${where}`, 'passage: the paragraph where the term is first set in italics, or the first of its chapter or section'], py: `library.define("${k}", pack="ods")`
    };
  }
});
noun(() => {
  const words = {}; if (ODS) for (const t of Object.keys(ODS.terms)) words[t] = [t];
  else { for (const k of Object.keys(ODS_SAMPLE)) words[k] = [k]; for (const [a, k] of Object.entries(ODS_ALIAS)) words[k].push(a); }
  return { type: 'term', words, generic: ['term', 'word'], words_pt: words, generic_pt: ['termo', 'palavra'] };
});
// "what is a skiplist", "define treap", "treap"
frame({
  name: 'define', label: 'Define', words: ['define', 'explain', 'describe'], elidable: true,
  theme: ['term'], required: ['theme'], roles: {},
  words_pt: ['definir', 'define', 'defina', 'explicar', 'explica', 'descrever', 'descreve'], label_pt: 'Definir',
  bind: c => { const t = c.theme[0]; return t && t.value ? { tool: 'define', args: { term: t.value } } : null; }
});

/* ── The Elements of Style: a check that cites the book ──────── */
// the sample: a few phrases of rules 10, 11 and 13 (the 1918 numbering)
const SAMPLE_RULES = { 10: 'Use the active voice.', 11: 'Put statements in positive form.', 13: 'Omit needless words.' };
const SAMPLE_PHRASES = [['the question as to whether', 'whether', 13], ['there is no doubt but that', 'no doubt', 13], ['used for fuel purposes', 'used for fuel', 13], ['in a hasty manner', 'hastily', 13],
  ['this is a subject which', 'this subject', 13], ['owing to the fact that', 'since', 13], ['in spite of the fact that', 'though', 13], ['call your attention to the fact that', 'remind you', 13], ['the fact that', 'recast without it', 13],
  ['not honest', 'dishonest', 11], ['not important', 'trifling', 11], ['did not remember', 'forgot', 11], ['did not pay any attention to', 'ignored', 11], ['did not have much confidence in', 'distrusted', 11]].map(([find, t, rule]) => ({ find, try: t, rule }));
let STRUNK = null;   // the installed pack: { title, rules: { n: text }, phrases: [{ find, try, rule }], entries: [{ term, advice }] }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// the passive: a form of "be" and a past participle (golem's own reading of rule 10, which the book states but does not list)
const PASSIVE = /\b(?:is|are|was|were|be|been|being) (?:\w{3,}ed|lost|taken|given|made|done|found|sent|written|shown)\b(?: by\b)?/gi;
function checks() {
  const rules = STRUNK ? STRUNK.rules : SAMPLE_RULES, phrases = STRUNK ? STRUNK.phrases : SAMPLE_PHRASES;
  const out = phrases.map(p => ({ re: new RegExp(`\\b${esc(p.find).replace(/\s+/g, '\\s+')}\\b`, 'gi'), cite: `${p.rule}. ${rules[p.rule] || ''}`.trim(), fix: p.try, kind: 'rule' }));
  out.push({ re: PASSIVE, cite: `10. ${rules[10] || 'Use the active voice.'}`, fix: 'name who did it', kind: 'rule' });
  // chapter V: each expression, with the book's advice (good in its place, often obtruding: "consider")
  if (STRUNK) for (const e of STRUNK.entries) { const term = e.term.replace(/,\s*(vb|n|adj)\.?$/i, '').trim(); if (term.length < 3) continue; out.push({ re: new RegExp(`\\b${esc(term).replace(/\s+/g, '\\s+')}\\b`, 'gi'), cite: `V. ${e.term}`, fix: e.advice, kind: 'consider' }); }
  return out;
}
tool({
  name: 'lint',
  skill: { group: 'Knowledge', title: 'Style check', on: 'elements-of-style pack', about: 'The rules and expressions of The Elements of Style (1918), compiled into a checker that cites rule or entry for each find. A sample ships; the full book installs on request.', examples: ['check: owing to the fact that the samples were lost by the lab, there is no doubt but that the assay was not important'] },
  topic: () => ['Style check', 2],
  run: a => {
    const C = checks(), hits = [];
    for (const c of C) { c.re.lastIndex = 0; let m; while ((m = c.re.exec(a.text))) if (!hits.some(h => m.index < h.e && m.index + m[0].length > h.s)) hits.push({ s: m.index, e: m.index + m[0].length, ...c }); }
    hits.sort((x, y) => x.s - y.s);
    const rules = hits.filter(h => h.kind === 'rule'), consider = hits.filter(h => h.kind === 'consider');
    return {
      read: ['check text against', { v: 'The Elements of Style (1918)' }],
      body: [{ t: 'marked', text: a.text, spans: hits.map(h => [h.s, h.e]) },
        rules.length ? { t: 'table', head: ['Found', 'Rule', 'Try'], rows: rules.map(h => [a.text.slice(h.s, h.e), h.cite, h.fix]) } : { t: 'note', kind: 'ok', text: 'No rule matched this text.' },
        ...(consider.length ? [{ t: 'lbl', text: 'Words and expressions the book warns about' }, { t: 'table', head: ['Found', 'Entry', 'The book says'], rows: consider.map(h => [a.text.slice(h.s, h.e), h.cite, h.fix]) }] : []),
        { t: 'src', text: STRUNK ? `${STRUNK.title} · ${STRUNK.author} · public domain · ${STRUNK.phrases.length} phrases from its rules, ${STRUNK.entries.length} entries of chapter V, and golem's reading of rule 10 · installed on this device`
          : `elements-of-style · public domain · ${SAMPLE_PHRASES.length} phrases from rules 11 and 13 and golem's reading of rule 10, the sample that ships with golem` }],
      trace: [`style.rules(${STRUNK ? 'elements-of-style, installed' : 'the sample'}) → ${C.length} checks`, `scan ${a.text.length} characters → ${rules.length} rule${rules.length === 1 ? '' : 's'}, ${consider.length} to consider`], py: `style.check(text, pack="elements-of-style")`
    };
  }
});
// "check: …", "review this: …"
frame({
  name: 'lint', label: 'Check', words: ['check', 'lint', 'review', 'proofread', 'style check'], theme: [], required: ['text'], roles: { text: { preps: [':'], types: ['text'] } },
  words_pt: ['revisa', 'revise', 'confere', 'confira'], label_pt: 'Revisar',
  bind: c => { const t = c.roles.text && c.roles.text[0]; return t && t.type === 'text' ? { tool: 'lint', args: { text: t.value } } : null; }
});

// a book pack compiled at install (packs.js), or null for the sample
export function useBook(slug, compiled) {
  if (slug === 'ods') ODS = compiled || null;
  else if (slug === 'elements-of-style') STRUNK = compiled || null;
  else throw new Error(`golem has no use for the ${slug} pack yet`);
  return bookInfo(slug);
}
export const bookInfo = slug => { const b = slug === 'ods' ? ODS : slug === 'elements-of-style' ? STRUNK : null; return b ? { kind: 'pack', version: b.version, title: b.title, count: slug === 'ods' ? Object.keys(b.terms).length : b.phrases.length + b.entries.length } : { kind: 'sample' }; };

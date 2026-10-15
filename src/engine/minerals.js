// Minerals (SPEC 13.8, packs as tables): mineral species from Wikidata, through gcu-library's minerals pack. A sample of 42
// common species ships (data/minerals-sample.js, copied from the pack and labelled); the pack, installed from Packs, has
// every species Wikidata lists (6304 on 15 Oct 2026). A mineral is looked up by name ("chalcopyrite", "hardness of
// quartz"); minerals are found by their elements and class ("minerals with Cu and S", "sulfides with Bi"); the whole set
// opens as a table ("open the minerals") for every table question ("count where hardness > 6 and density < 3"). What
// Wikidata does not have stays empty and is said to be missing: nothing is estimated.
import { tool, frame, noun, fmt } from './core.js';
import { MINERALS_SAMPLE } from './data/minerals-sample.js';

const CLASSES = ['elements', 'sulfides and sulfosalts', 'halides', 'oxides', 'carbonates and nitrates', 'borates', 'sulfates', 'phosphates', 'silicates', 'organic compounds'];
let DATA = null, BY = new Map();
// a pack as installed: { version, retrieved, records }
export function useMinerals(pack) {
  DATA = pack ? { kind: 'pack', version: pack.version, retrieved: pack.retrieved, of: pack.records.length, records: pack.records } : { kind: 'sample', version: 'sample', retrieved: MINERALS_SAMPLE.retrieved, of: MINERALS_SAMPLE.of, records: MINERALS_SAMPLE.records };
  BY = new Map(); for (const r of DATA.records) for (const n of namesOf(r)) if (!BY.has(n)) BY.set(n, r);
  return mineralsInfo();
}
export const mineralsInfo = () => ({ kind: DATA.kind, version: DATA.version, count: DATA.records.length });
// the names a record answers to: its own, its Portuguese one, without "native" ("gold"), and the usual spellings
const ALIAS = { baryte: ['barite'], 'native gold': ['gold'], 'native silver': ['silver'], 'native copper': ['copper'], 'native sulfur': ['sulfur', 'sulphur'] };
const namesOf = r => [...new Set([r.name, r.name_pt, ...(ALIAS[r.name.toLowerCase()] || [])].filter(Boolean).map(n => n.toLowerCase()))];
useMinerals(null);
export const mineralRecords = () => DATA.records;
const SRC = () => ({ t: 'src', text: DATA.kind === 'pack' ? `Wikidata · CC0 · retrieved ${DATA.retrieved} · gcu-library minerals pack ${DATA.version}` : `Wikidata · CC0 · retrieved ${DATA.retrieved} · the sample of ${DATA.records.length} that ships (the pack has ${DATA.of}; Packs installs it)` });
const MISSING = 'not in Wikidata';
const hard = r => r.hardness_min == null ? MISSING : r.hardness_min === r.hardness_max ? fmt(r.hardness_min, 3) : `${fmt(r.hardness_min, 3)} to ${fmt(r.hardness_max, 3)}`;
const dens = r => r.density == null ? MISSING : `${fmt(r.density, 4)} g/cm³${r.density_range ? ` (Wikidata gives ${fmt(r.density_range[0], 4)} to ${fmt(r.density_range[1], 4)})` : ''}`;
const PROPS = { formula: 'formula', hardness: 'Mohs hardness', density: 'density', system: 'crystal system', class: 'class', symbol: 'IMA symbol', elements: 'elements' };
const valueOf = (r, p) => p === 'hardness' ? hard(r) : p === 'density' ? dens(r) : p === 'elements' ? (r.elements.length ? r.elements.join(', ') : MISSING) : p === 'class' ? (r.class ? `${r.class} (Nickel-Strunz ${r.strunz})` : MISSING) : r[p] == null ? MISSING : String(r[p]);

/* ── one mineral ─────────────────────────────────────────────── */
tool({
  name: 'mineral',
  skill: { group: 'Knowledge', title: 'Minerals', on: 'gcu-library minerals pack · Wikidata', about: 'Mineral species by name: formula, elements, Nickel-Strunz class, crystal system, Mohs hardness and density where Wikidata has them; minerals found by their elements and class; the whole set opened as a table. A sample of 42 ships; the pack has every species Wikidata lists.', examples: ['chalcopyrite', 'hardness of quartz', 'minerals with Cu and S', 'sulfides with Bi', 'open the minerals'] },
  topic: a => [a.name, 2],
  run: a => {
    const r = BY.get(String(a.name).toLowerCase());
    if (!r) return { read: ['mineral', { v: a.name }], body: [{ t: 'note', kind: 'err', text: `${a.name} is not in ${DATA.kind === 'pack' ? 'the minerals pack' : `the sample of ${DATA.records.length}; the minerals pack (Packs) has ${DATA.of}`}.` }, SRC()], trace: ['no such mineral'] };
    const p = a.prop && PROPS[a.prop] ? a.prop : null;
    const rows = Object.entries(PROPS).filter(([k]) => k !== 'formula' && k !== p).map(([k, label]) => [label, valueOf(r, k)]);
    if (r.mindat) rows.push(['Mindat', `mineral ${r.mindat}`]);
    rows.push(['Wikidata', r.id]);
    const big = p ? { t: 'big', v: valueOf(r, p), unit: `${PROPS[p]} of ${r.name}`, size: valueOf(r, p).length > 24 ? 18 : undefined } : { t: 'big', v: r.formula || MISSING, unit: r.name };
    const chips = [...(r.formula && !/[,?☐◻]/.test(r.formula) ? [`molar mass of ${r.formula}`] : []), ...(r.elements.length ? [`minerals with ${r.elements.filter(e => e !== 'O' && e !== 'H').slice(0, 3).join(' and ')}`] : [])].filter(c => !/with $/.test(c));
    return { read: p ? [PROPS[p], 'of', { v: r.name }] : ['mineral', { v: r.name }], value: p ? valueOf(r, p) : r.formula,
      body: [big, ...(p ? [{ t: 'sub', text: `${r.name}: ${r.formula || MISSING}` }] : []), { t: 'kv', rows }, ...(chips.length ? [{ t: 'chips', items: chips }] : []), SRC()],
      trace: [`minerals: "${a.name}" → ${r.name} (${r.id})`, p ? `${p}: ${valueOf(r, p)}` : 'every field Wikidata has'], py: `minerals.get("${r.name}")${p ? `["${p}"]` : ''}` };
  }
});

/* ── minerals by element and class ───────────────────────────── */
tool({
  name: 'mineralsWith',
  topic: a => [`Minerals with ${(a.elements || []).join(' ')}`, 1],
  run: a => {
    const els = a.elements || [], cls = a.class || null;
    const hits = DATA.records.filter(r => els.every(e => r.elements.includes(e)) && (!cls || r.class === cls) && (!a.only || r.elements.every(e => els.includes(e) || e === 'O' || e === 'H')));
    const read = ['minerals', ...(cls ? [{ v: cls }] : []), ...(els.length ? ['with', { v: els.join(', ') }] : [])];
    if (!hits.length) return { read, value: 0, body: [{ t: 'note', text: `None ${DATA.kind === 'sample' ? `in the sample of ${DATA.records.length} (the minerals pack has ${DATA.of})` : 'in the minerals pack'}.` }, SRC()], trace: [`${DATA.records.length} minerals, none with ${els.join(', ')}`] };
    const shown = hits.slice(0, 40);
    return { read, value: hits.length,
      body: [{ t: 'big', v: String(hits.length), unit: `mineral${hits.length === 1 ? '' : 's'}${DATA.kind === 'sample' ? ` in the sample of ${DATA.records.length}` : ''}` },
        { t: 'table', head: ['mineral', 'formula', 'class', 'system', 'hardness', 'density'], rows: shown.map(r => [r.name, r.formula || '', r.class || '', r.system || '', r.hardness_min == null ? '' : hard(r), r.density == null ? '' : fmt(r.density, 4)]) },
        ...(hits.length > shown.length ? [{ t: 'sub', text: `The first ${shown.length} by name. "open the minerals" makes all of them a table to ask.` }] : []), SRC()],
      trace: [`${DATA.records.length} minerals → ${hits.length} with ${els.join(', ') || 'any element'}${cls ? `, class ${cls}` : ''}`], py: `minerals.where(elements=${JSON.stringify(els)}${cls ? `, cls="${cls}"` : ''})` };
  }
});

// the set as a table for the table tools ("open the minerals"): numbers as numbers, the elements as one column of symbols
export function mineralsTable() {
  return { name: 'minerals', source: 'device', hash: 'minerals', roles: {},
    cols: [{ name: 'name', type: 'category' }, { name: 'formula', type: 'category' }, { name: 'class', type: 'category' }, { name: 'system', type: 'category' }, { name: 'hardness', type: 'numeric' }, { name: 'hardness_max', type: 'numeric' }, { name: 'density', type: 'numeric', unit: 'g/cm3' }, { name: 'elements', type: 'category' }, { name: 'symbol', type: 'category' }],
    rows: DATA.records.map(r => ({ name: r.name, formula: r.formula, class: r.class, system: r.system, hardness: r.hardness_min, hardness_max: r.hardness_max, density: r.density, elements: r.elements.join(' '), symbol: r.symbol })) };
}
export const mineralsSource = () => SRC().text;

/* ── what reads them ─────────────────────────────────────────── */
noun(() => { const en = {}, pt = {}; for (const r of DATA.records) { const pn = (r.name_pt || '').toLowerCase(); en[r.name] = namesOf(r).filter(n => n !== pn || n === r.name.toLowerCase()); pt[r.name] = namesOf(r); } return { type: 'mineral', exact: true, words: en, words_pt: pt }; });
// the one-letter element symbols, which the element noun leaves out (they are units and words elsewhere): only a
// mineral search takes them ("minerals with Cu and S"); I is left out, it is the pronoun
noun({ type: 'elsym', exact: true, words: Object.fromEntries('H B C N O F P S K V Y U W'.split(' ').map(e => [e, [e.toLowerCase()]])), words_pt: Object.fromEntries('H B C N O F P S K V Y U W'.split(' ').map(e => [e, [e.toLowerCase()]])) });
noun({ type: 'mineralprop', words: { formula: ['formula', 'chemical formula'], hardness: ['hardness', 'mohs hardness', 'mohs'], density: ['density', 'specific gravity'], system: ['crystal system', 'system'], class: ['class', 'strunz class', 'mineral class'], symbol: ['ima symbol', 'symbol', 'abbreviation'], elements: ['elements'] },
  words_pt: { formula: ['fórmula', 'formula'], hardness: ['dureza'], density: ['densidade'], system: ['sistema cristalino'], class: ['classe'], symbol: ['símbolo'], elements: ['elementos'] } });
noun({ type: 'mineralclass', words: { any: ['minerals', 'mineral species'], 'sulfides and sulfosalts': ['sulfides', 'sulphides', 'sulfosalts'], oxides: ['oxides'], silicates: ['silicates'], carbonates: ['carbonates'], sulfates: ['sulfates', 'sulphates'], phosphates: ['phosphates'], halides: ['halides'], borates: ['borates'], elements: ['native elements'] },
  words_pt: { any: ['minerais'], 'sulfides and sulfosalts': ['sulfetos'], oxides: ['óxidos'], silicates: ['silicatos'], carbonates: ['carbonatos'], sulfates: ['sulfatos'], phosphates: ['fosfatos'], halides: ['haletos'], borates: ['boratos'], elements: ['elementos nativos'] } });
noun({ type: 'devtable', words: { minerals: ['the minerals', 'minerals table', 'the minerals table', 'mineral table'] }, words_pt: { minerals: ['os minerais', 'tabela de minerais'] } });
const CLASS_OF = { any: null, carbonates: 'carbonates and nitrates' };
// "chalcopyrite", "what is chalcopyrite", "tell me about quartz"
frame({
  name: 'mineral', label: 'Mineral', words: ['tell me about', 'look up', 'show'], elidable: true, theme: ['mineral'], required: ['theme'], roles: {},
  words_pt: ['me fala sobre', 'mostra'], label_pt: 'Mineral',
  bind: c => c.theme.length === 1 && c.theme[0].value ? { tool: 'mineral', args: { name: c.theme[0].value } } : null
});
// "hardness of quartz", "the density of pyrite", "formula of chalcopyrite"
frame({
  name: 'mineralProp', label: 'Mineral', words: [], elidable: true, theme: ['mineralprop'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for'], types: ['mineral'] } },
  words_pt: [], label_pt: 'Mineral',
  bind: c => { const of = c.roles.of && c.roles.of[0]; return of && of.value ? { tool: 'mineral', args: { name: of.value, prop: c.theme[0].value } } : null; }
});
// "minerals with Cu and S", "which minerals have bismuth", "sulfides with Bi", "silicates with Be"
frame({
  name: 'mineralsWith', label: 'Minerals with', words: ['which', 'list', 'show', 'find'], elidable: true, theme: ['mineralclass'], required: ['theme', 'with'],
  roles: { with: { preps: ['with', 'containing', 'that have', 'have', 'having', 'that contain'], types: ['element', 'elsym'] } },
  words_pt: ['quais', 'lista', 'mostra'], label_pt: 'Minerais com',
  bind: c => { const els = (c.roles.with || []).map(n => n.value).filter(Boolean), k = c.theme[0].value; if (!els.length) return null; const cls = k in CLASS_OF ? CLASS_OF[k] : k; return { tool: 'mineralsWith', args: { elements: els, ...(cls ? { class: cls } : {}) } }; }
});
export { CLASSES };

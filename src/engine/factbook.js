// The Factbook (SPEC 13.8): the rounded 14-country sample that ships with golem, or gcu-library's factbook pack once it is
// installed on this device (the shell keeps it, and hands it here with useFactbook()). Lookups of every field, with
// units through @gcu/units; lists ranked, by region, and filtered by the grammar's conditions ("population above 100
// million"); "landlocked" only where the data says it (the sample, or the pack with its full profiles).
import { tool, frame, noun, compound, qmod, fmt } from './core.js';
import { parseUnit } from './units.js';

/* ── the data in use ─────────────────────────────────────────── */
// the sample: [name, iso2, region, capital, area km², population, landlocked]
const SAMPLE_ROWS = [['Australia', 'au', 'australia-oceania', 'Canberra', 7741220, 26.8e6, 0], ['Brazil', 'br', 'south-america', 'Brasília', 8515770, 220.1e6, 0],
  ['Canada', 'ca', 'north-america', 'Ottawa', 9984670, 38.8e6, 0], ['Chile', 'cl', 'south-america', 'Santiago', 756102, 18.7e6, 0], ['Germany', 'de', 'europe', 'Berlin', 357022, 84.1e6, 0],
  ['Indonesia', 'id', 'east-n-southeast-asia', 'Jakarta', 1904569, 281.6e6, 0], ['Ireland', 'ie', 'europe', 'Dublin', 70273, 5.2e6, 0], ['Japan', 'jp', 'east-n-southeast-asia', 'Tokyo', 377915, 123.2e6, 0],
  ['Kazakhstan', 'kz', 'central-asia', 'Astana', 2724900, 20.3e6, 1], ['Mongolia', 'mn', 'east-n-southeast-asia', 'Ulaanbaatar', 1564116, 3.3e6, 1], ['Peru', 'pe', 'south-america', 'Lima', 1285216, 32.6e6, 0],
  ['Portugal', 'pt', 'europe', 'Lisbon', 92090, 10.2e6, 0], ['South Africa', 'za', 'africa', 'Pretoria', 1219090, 60.4e6, 0], ['Zambia', 'zm', 'africa', 'Lusaka', 752618, 20.8e6, 1]];
const SAMPLE = { kind: 'sample', version: 'sample', records: SAMPLE_ROWS.map(([name, iso2, region, capital, area, population, ll]) => ({ name, id: iso2, iso2, region, capital, capitalFull: capital, area, population, landlocked: !!ll, gdp: null, government: null, coords: null, background: null })) };
let DATA = SAMPLE, BY = new Map();
// a pack as installed: { name, version, attribution, license, records: [the pack's records], profiles?: { id: { landlocked, coastline } } }
const toNum = v => typeof v === 'number' && isFinite(v) ? v : null;
const capitalOf = c => c ? String(c).split(';')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim() : null;
function normalize(p) {
  const prof = p.profiles || null;
  return { kind: 'pack', version: p.version, attribution: p.attribution, license: p.license, profiles: !!prof,
    records: p.records.filter(r => r && r.name).map(r => ({ name: r.name, id: r.id, iso2: r.iso2 || null, region: r.region || null, capital: capitalOf(r.capital), capitalFull: r.capital || null,
      area: toNum(r.area_km2), population: toNum(r.population), gdp: toNum(r.gdp_ppp_usd), government: r.government || null, coords: Array.isArray(r.coordinates) ? r.coordinates : null,
      background: r.background || null, landlocked: prof ? (prof[r.id] ? !!prof[r.id].landlocked : null) : null, coastline: prof && prof[r.id] ? prof[r.id].coastline : null })) };
}
export function useFactbook(pack) { DATA = pack ? normalize(pack) : SAMPLE; index(); return factbookInfo(); }
export const factbookInfo = () => ({ kind: DATA.kind, version: DATA.version, count: DATA.records.length, profiles: DATA.kind === 'sample' || !!DATA.profiles });
// what the full profiles add, kept small: the pack's factbook-full records → { id: { landlocked, coastline } }
export function profilesOf(fullRecords) {
  const out = {};
  for (const r of fullRecords) {
    const c = r && r.profile && r.profile.Geography && r.profile.Geography.Coastline && r.profile.Geography.Coastline.text; if (!c) continue;
    const km = /^([\d,.]+)\s*km/.exec(c); out[r.id] = { landlocked: /landlocked/i.test(c) || (km && parseFloat(km[1].replace(/,/g, '')) === 0), coastline: c.split(/\s*note\b/i)[0].trim() };
  }
  return out;
}

/* ── names: the record's own, its forms without "The" or what is in brackets, aliases, and the browser's names by ISO code ── */
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const ALIAS = { 'United States': ['usa', 'u.s.', 'united states of america'], 'United Kingdom': ['uk', 'britain', 'great britain'], Burma: ['myanmar'], Turkey: ['turkiye'],
  'Czechia': ['czech republic'], 'Eswatini': ['swaziland'], 'Cabo Verde': ['cape verde'], 'Holy See (Vatican City)': ['vatican'], 'Timor-Leste': ['east timor'], "Côte d'Ivoire": ['ivory coast'],
  // two Congos: each by its full names; "congo" alone is both, so it names neither
  DRC: ['democratic republic of the congo', 'dr congo', 'congo kinshasa', 'congo'], 'Congo (Brazzaville)': ['republic of the congo', 'congo brazzaville', 'congo'] };
const display = lang => { try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch (e) { return null; } };
const EN = display('en'), PT = display('pt');
function formsOf(name) { const n = fold(name), out = [n]; const nb = n.replace(/\s*\(.*\)\s*/g, ' ').trim(); if (nb !== n) out.push(nb); for (const x of [...out]) if (/^the /.test(x)) out.push(x.slice(4)); return out; }
function wordsOf(r, D) {
  const out = new Set(formsOf(r.name)); for (const a of (D === EN ? ALIAS[r.name] : null) || []) out.add(fold(a));
  if (D && r.iso2) { let d = null; try { d = D.of(r.iso2.toUpperCase()); } catch (e) { d = null; } if (d && d.toUpperCase() !== r.iso2.toUpperCase()) for (const f of formsOf(d)) out.add(f); }
  return [...out].filter(w => w.length > 1);
}
// a word two records share names neither (no guessing): "congo" is two countries
function wordTable(D) {
  const seen = new Map();
  for (const r of DATA.records) for (const w of wordsOf(r, D)) seen.set(w, seen.has(w) && seen.get(w) !== r.name ? null : r.name);
  const words = {}; for (const [w, n] of seen) if (n) (words[n] ??= []).push(w);
  return words;
}
let WORDS_EN = {}, WORDS_PT = {};
function index() { BY = new Map(DATA.records.map(r => [r.name, r])); WORDS_EN = wordTable(EN); WORDS_PT = wordTable(PT); for (const r of DATA.records) for (const w of WORDS_EN[r.name] || []) BY.set(w, r); }
index();
export const fbFind = n => { if (!n) return null; const k = fold(String(n)).replace(/^the /, ''); return BY.get(n) || BY.get(k) || BY.get('the ' + k) || null; };

/* ── fields ──────────────────────────────────────────────────── */
const REGION = { 'south-america': 'South America', europe: 'Europe', africa: 'Africa', 'australia-oceania': 'Australia and Oceania', 'central-america-n-caribbean': 'Central America and the Caribbean',
  antarctica: 'Antarctica', 'central-asia': 'Central Asia', 'middle-east': 'Middle East', 'north-america': 'North America', 'east-n-southeast-asia': 'East and Southeast Asia', 'south-asia': 'South Asia' };
const usd = v => v >= 1e12 ? `${fmt(v / 1e12, 4)} trillion` : v >= 1e9 ? `${fmt(v / 1e9, 4)} billion` : v >= 1e6 ? `${fmt(v / 1e6, 4)} million` : fmt(v, 6);
// a field's value for a record (numbers in the Factbook's units: km², people, US dollars), or null where it says nothing
export const FIELD = {
  capital: { label: 'capital', get: r => r.capital },
  population: { label: 'population', get: r => r.population, num: true },
  area: { label: 'area', get: r => r.area, num: true, dim: 'A' },
  density: { label: 'population density', get: r => r.population != null && r.area ? r.population / r.area : null, num: true, derived: 'population ÷ area' },
  gdp: { label: 'GDP (PPP)', get: r => r.gdp, num: true },
  gdppc: { label: 'GDP (PPP) per person', get: r => r.gdp != null && r.population ? r.gdp / r.population : null, num: true, derived: 'GDP (PPP) ÷ population' },
  government: { label: 'government', get: r => r.government },
  region: { label: 'region', get: r => r.region && REGION[r.region] },
  background: { label: 'background', get: r => r.background },
  location: { label: 'location', get: r => r.coords && `${fmt(r.coords[0], 4)}, ${fmt(r.coords[1], 4)} (the country's centre)` },
  coastline: { label: 'coastline', get: r => r.coastline || null },
};
const FIELD_OF = { 'population density': 'density', density: 'density' };
export const fieldOf = v => FIELD_OF[v] || (FIELD[v] ? v : null);
const srcBlock = () => ({ t: 'src', text: DATA.kind === 'sample' ? 'factbook · a rounded 14-country sample that ships with golem; the full pack installs under Packs and this device'
  : `factbook ${DATA.version} · CIA World Factbook · public domain (CC0) · installed on this device` });
// a number field as shown, with its unit: area in the unit asked for, density per km² or per square mile
function shown(field, v, unitWord) {
  if (field === 'area') { let u = unitWord && parseUnit(unitWord); if (!u || u.dim !== 'A') u = parseUnit('km²'); return { v: u.name === 'km²' ? Math.round(v).toLocaleString('en-US') : fmt(v * 1e6 / u.f, 6), unit: u.name, note: u.name !== 'km²' ? `area ${fmt(v, 9)} km² → ${u.name}` : null }; }
  if (field === 'density') { const mi = /mi/.test(unitWord || ''); return { v: fmt(v * (mi ? 2.589988110336 : 1), 3), unit: `people per ${mi ? 'sq mi' : 'km²'}`, note: mi ? 'per km² → per sq mi' : null }; }
  if (field === 'population') return { v: Math.round(v).toLocaleString('en-US'), unit: 'people' };   // as published
  if (field === 'gdp') return { v: usd(v), unit: 'US dollars, PPP' };
  if (field === 'gdppc') return { v: fmt(v, 4), unit: 'US dollars per person, PPP' };
  return { v: fmt(v, 6) };
}
tool({
  name: 'fact',
  skill: { group: 'Knowledge', title: 'Records', on: 'factbook pack', about: 'Every field of every country in the Factbook: capital, population, area, density, GDP, government, region, background. Lists ranked, by region and filtered by conditions. A sample ships; the full pack installs on request.', examples: ['population density of mongolia in people per square mile', 'landlocked countries by population', 'area of brazil in square miles', 'the 5 most populous countries in south america', 'countries with population above 100 million'] },
  topic: a => { const r = fbFind(a.country); return [(r ? r.name : a.country) + ' ' + a.field, 2]; },
  run: a => {
    const r = fbFind(a.country), field = fieldOf(a.field), F = field && FIELD[field]; if (!F) return null;
    if (!r) return { read: [F.label, 'of', { v: a.country }], body: [{ t: 'note', kind: 'err', text: `${a.country} is not in the ${DATA.kind === 'sample' ? 'sample of 14 countries; the full Factbook installs under Packs and this device' : 'Factbook'}.` }, srcBlock()], trace: [`factbook.find("${a.country}") → none`] };
    const read = [F.label, 'of', { v: r.name }], trace = [`factbook.get("${r.name}")`], v = F.get(r);
    if (v == null) return { read, body: [{ t: 'note', kind: 'err', text: `The Factbook gives no ${F.label} for ${r.name}.` }, srcBlock()], trace: [...trace, `${field}: none`] };
    if (field === 'background') return { read, body: [{ t: 'sub', text: v }, srcBlock()], trace: [...trace, 'background: the passage as published'], py: `data("factbook")["${r.name}"].background` };
    if (!F.num) return { read, body: [{ t: 'big', v: String(v), size: String(v).length > 40 ? 17 : undefined }, ...(field === 'capital' && r.capitalFull && r.capitalFull !== v ? [{ t: 'sub', text: r.capitalFull }] : []), srcBlock()], trace, py: `data("factbook")["${r.name}"].${field}` };
    const s = shown(field, v, a.unit);
    if (field === 'area' || field === 'density') read.push('in', { v: s.unit.replace(/^people per /, 'people / ') });
    if (F.derived) trace.push(`${F.derived}: ${field === 'density' ? `${fmt(r.population, 4)} ÷ ${fmt(r.area, 9)} km²` : `${usd(r.gdp)} ÷ ${fmt(r.population, 4)}`}`);
    if (s.note) trace.push(s.note);
    return { read, value: v, body: [{ t: 'big', v: s.v, unit: s.unit }, srcBlock()], trace, py: `data("factbook")["${r.name}"].${field}` };
  }
});

/* ── lists: ranked, by region, filtered ──────────────────────── */
const SIFT = { above: (x, y) => x > y, below: (x, y) => x < y, atleast: (x, y) => x >= y, atmost: (x, y) => x <= y, equals: (x, y) => x === y, differs: (x, y) => x !== y };
// a condition the grammar read, over records: numbers in the Factbook's units (an area with its unit is converted)
function test(c, r) {
  if (c.or) return c.or.some(x => test(x, r)); if (c.and) return c.and.every(x => test(x, r)); if (c.not) return !test(c.not, r);
  const field = fieldOf(c.col.value), F = field && FIELD[field]; if (!F) throw new Error(`the Factbook has no field "${c.col.value}"`);
  const v = F.get(r); if (c.op === 'blank') return v == null; if (c.op === 'present') return v != null; if (v == null) return false;
  const num = x => { if (x.n == null) throw new Error(`${F.label} is a number; "${x.s}" is not one`); if (!x.unit || field !== 'area') return x.n; const u = parseUnit(x.unit); if (!u || u.dim !== 'A') throw new Error(`${x.unit} is not an area`); return x.n * u.f / 1e6; };
  if (c.op === 'between') return v >= num(c.vals[0]) && v <= num(c.vals[1]);
  if (c.op === 'in') return c.vals.some(x => String(v).toLowerCase() === String(x.s ?? x.n).toLowerCase());
  if (!F.num) { if (c.op !== 'equals' && c.op !== 'differs') throw new Error(`${F.label} is not a number`); const eq = String(v).toLowerCase() === String(c.val.s ?? c.val.n).toLowerCase(); return c.op === 'equals' ? eq : !eq; }
  return SIFT[c.op](v, num(c.val));
}
const condText = c => c.or ? c.or.map(condText).join(' or ') : c.and ? c.and.map(condText).join(' and ') : c.not ? `not (${condText(c.not)})` : `${c.col.value} ${{ above: '>', below: '<', atleast: '≥', atmost: '≤', equals: '=', differs: '≠', between: 'between', in: 'in', blank: 'is blank', present: 'is not blank' }[c.op]}${c.val ? ' ' + (c.val.s ?? c.val.n + (c.val.unit ? ' ' + c.val.unit : '')) : c.vals ? ' ' + c.vals.map(x => x.s ?? x.n).join(', ') : ''}`;
tool({
  name: 'factList',
  topic: a => [a.filter && a.filter.landlocked !== false && !a.where && !a.region ? 'Landlocked countries' : 'Countries', 2],
  run: a => {
    // cards from before 14 Oct 2026 carry only { by }: the landlocked list
    const landlocked = a.filter ? !!a.filter.landlocked : true, by = fieldOf(a.by || 'area'), F = FIELD[by], desc = a.order !== 'asc';
    const read = ['countries', ...(landlocked ? ['that are', { v: 'landlocked' }] : []), ...(a.region ? ['in', { v: REGION[a.region] || a.region }] : []), ...(a.where ? ['where', { v: condText(a.where) }] : []), 'by', { v: F.label, key: 'by', alts: ['area', 'population', 'density', 'gdp', 'gdppc'], cur: by }, ...(a.limit ? ['top', { v: String(a.limit) }] : [])];
    if (landlocked && !factbookInfo().profiles) return { read, body: [{ t: 'note', kind: 'err', text: 'The installed Factbook does not say which countries are landlocked. Add its full profiles under Packs and this device.' }, srcBlock()], trace: ['filter landlocked: not in this data'] };
    let rows = DATA.records;
    try { rows = rows.filter(r => (!landlocked || r.landlocked) && (!a.region || r.region === a.region) && (!a.where || test(a.where, r))); }
    catch (e) { return { read, body: [{ t: 'note', kind: 'err', text: e.message }, srcBlock()], trace: ['condition: rejected'] }; }
    const known = rows.filter(r => F.get(r) != null), unknown = rows.length - known.length;
    known.sort((x, y) => desc ? F.get(y) - F.get(x) : F.get(x) - F.get(y));
    const shownRows = a.limit ? known.slice(0, a.limit) : known;
    const cols = [...new Set([by, 'area', 'population'])].filter(k => FIELD[k].num);
    return {
      read,
      body: [{ t: 'table', head: ['Country', ...cols.map(k => k === 'area' ? 'Area km²' : FIELD[k].label[0].toUpperCase() + FIELD[k].label.slice(1))], num: [false, ...cols.map(() => true)],
        rows: shownRows.map(r => [r.name, ...cols.map(k => { const v = FIELD[k].get(r); return v == null ? '—' : k === 'gdp' ? usd(v) : k === 'population' || k === 'area' ? Math.round(v).toLocaleString('en-US') : fmt(v, 4); })]) },
        { t: 'sub', text: `${a.limit && known.length > a.limit ? `The first ${shownRows.length} of ${known.length} that match` : `${known.length} match`}, of ${DATA.records.length} records${unknown ? `; ${unknown} more match but give no ${F.label}` : ''}.` }, srcBlock()],
      trace: [`factbook.records → ${DATA.records.length}`, ...(landlocked ? ['filter landlocked'] : []), ...(a.region ? [`filter region = ${a.region}`] : []), ...(a.where ? [`filter ${condText(a.where)}`] : []), `sort by ${by}, ${desc ? 'descending' : 'ascending'}${a.limit ? `, first ${a.limit}` : ''}`],
      py: `data("factbook")${landlocked ? '.filter(landlocked=True)' : ''}${a.region ? `.filter(region="${a.region}")` : ''}.sort("${by}", desc=${desc ? 'True' : 'False'})${a.limit ? `[:${a.limit}]` : ''}`
    };
  }
});

/* ── what reads them ─────────────────────────────────────────── */
noun(() => ({ type: 'country', exact: true, words: WORDS_EN, generic: ['country', 'countries', 'nation', 'nations', 'territory', 'territories'], words_pt: WORDS_PT, generic_pt: ['país', 'pais', 'países', 'paises'] }));
noun({ type: 'region', exact: true, words: { 'south-america': ['south america'], europe: ['europe'], africa: ['africa'], 'australia-oceania': ['oceania', 'australia and oceania'], 'central-america-n-caribbean': ['central america', 'the caribbean', 'caribbean', 'central america and the caribbean'],
  antarctica: ['antarctica'], 'central-asia': ['central asia'], 'middle-east': ['the middle east', 'middle east'], 'north-america': ['north america'], 'east-n-southeast-asia': ['east asia', 'southeast asia', 'east and southeast asia'], 'south-asia': ['south asia'] },
  words_pt: { 'south-america': ['américa do sul', 'america do sul'], europe: ['europa'], africa: ['áfrica', 'africa'], 'australia-oceania': ['oceania'], 'central-america-n-caribbean': ['américa central', 'caribe'], antarctica: ['antártida'], 'central-asia': ['ásia central'], 'middle-east': ['oriente médio'], 'north-america': ['américa do norte'], 'east-n-southeast-asia': ['sudeste asiático', 'leste asiático'], 'south-asia': ['sul da ásia'] } });
noun({ type: 'property', words: { capital: ['capital', 'capital city'], population: ['population', 'inhabitants', 'number of people'], area: ['area', 'land area', 'size'], 'population density': ['population density'],
  gdp: ['gdp', 'gdp ppp', 'economy', 'economic output'], gdppc: ['gdp per capita', 'gdp per person', 'gdp per head', 'income per person'], government: ['government', 'government type', 'form of government', 'political system'],
  region: ['region', 'continent'], background: ['background', 'history', 'overview'], location: ['location', 'coordinates'], coastline: ['coastline', 'coast'] },
  generic: ['property', 'value'],
  words_pt: { capital: ['capital'], population: ['população', 'populacao'], area: ['área', 'area'], 'population density': ['densidade populacional', 'densidade de população'], gdp: ['pib'], gdppc: ['pib per capita'], government: ['governo'], region: ['região', 'regiao'], background: ['história', 'historia'], location: ['localização'], coastline: ['litoral', 'costa'] }, generic_pt: ['propriedade', 'valor'] });
noun({ type: 'filter', words: { landlocked: ['landlocked'] }, words_pt: { landlocked: ['sem litoral', 'sem costa'] } });
compound({ mod: 'filter', heads: ['country'], attr: 'filter', echo: true });
// "the 5 largest countries", "the most populous countries": a ranking said as an adjective
noun({ type: 'rank', words: { largest: ['largest', 'biggest'], smallest: ['smallest'], populous: ['most populous', 'most populated'], unpopulous: ['least populous', 'least populated'], dense: ['most densely populated', 'densest'], richest: ['richest', 'wealthiest'], poorest: ['poorest'] },
  words_pt: { largest: ['maiores'], smallest: ['menores'], populous: ['mais populosos'], richest: ['mais ricos'], poorest: ['mais pobres'] } });
compound({ mod: 'rank', heads: ['country'], attr: 'rank', echo: true });
qmod({ head: 'country', attr: 'limit', dims: ['bare'] });   // "5 countries"
const RANK = { largest: ['area', 'desc'], smallest: ['area', 'asc'], populous: ['population', 'desc'], unpopulous: ['population', 'asc'], dense: ['density', 'desc'], richest: ['gdppc', 'desc'], poorest: ['gdppc', 'asc'] };
// "population density of mongolia in people per square mile", "capital of brazil", "gdp of chile"
frame({
  name: 'lookup', label: 'Look up', words: ['lookup', 'look up', 'get', 'find'], elidable: true,
  theme: ['property'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for', 'in'], types: ['country'] }, unit: { preps: ['in', 'as'], types: ['unit'] } },
  words_pt: ['consultar', 'consulta', 'buscar', 'busca'], label_pt: 'Consultar',
  bind: c => {
    const p = c.theme[0] && c.theme[0].value, of = c.roles.of && c.roles.of[0], unit = c.roles.unit && c.roles.unit[0], field = p && fieldOf(p); if (!field || !of || of.type !== 'country' || !of.value) return null;
    return { tool: 'fact', args: { field, country: of.value, unit: unit ? unit.unit : undefined } };
  }
});
// "landlocked countries by population", "the 5 largest countries in africa", "countries with population above 100 million"
frame({
  name: 'list', label: 'List', words: ['list', 'rank', 'show', 'show me', 'which are the'], elidable: true,
  theme: ['country'], required: ['theme'], roles: { by: { preps: ['by', 'sort'], types: ['property'] }, in: { preps: ['in', 'of', 'from'], types: ['region'] }, where: { preps: ['where', 'with', 'having'], types: ['cond'] } },
  words_pt: ['listar', 'lista', 'ordenar', 'ordena'], label_pt: 'Listar',
  bind: c => {
    const t = c.theme[0]; if (!t || c.theme.length > 1 || t.value) return null;   // a list is of countries, not of one
    const at = t.attrs || {}, rank = at.rank && RANK[at.rank], w = c.roles.where && c.roles.where[0], region = c.roles.in && c.roles.in[0].value;
    // sorted by what was asked for, else by the ranking, else by the number the condition names ("population above 100 million")
    const firstCol = x => x.col ? x.col.value : x.and ? firstCol(x.and[0]) : x.or ? firstCol(x.or[0]) : x.not ? firstCol(x.not) : null, condField = w && fieldOf(firstCol(w.cond));
    const by = c.roles.by ? fieldOf(c.roles.by[0].value) : !rank && condField && FIELD[condField].num ? condField : null;
    if (!at.filter && !rank && !w && !region && !by) return null;
    if (c.roles.by && (!by || !FIELD[by].num)) return null;
    return { tool: 'factList', args: { by: by || (rank ? rank[0] : 'area'), order: rank ? rank[1] : 'desc', filter: { landlocked: at.filter === 'landlocked' }, ...(region ? { region } : {}), ...(w ? { where: w.cond } : {}), ...(at.limit ? { limit: at.limit.n } : {}) } };
  }
});

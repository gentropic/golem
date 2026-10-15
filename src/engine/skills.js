// The catalog: skills derived from the declarations, planned skills named here, and the packs golem
// knows about. Examples feed the Skills tab, the "nearest skills" suggestions and the teach vocabulary.
import { TOOLS, tool, frame } from './core.js';

// skills named but not built: a row in the catalog, nothing in the tool table
tool({ name: 'algebra', planned: true, skill: { group: 'Compute', title: 'Step-by-step algebra', on: 'new package', about: 'Solve and show the derivation. The monorepo has no symbolic algebra yet.', examples: [] } });
tool({ name: 'munsell', planned: true, skill: { group: 'Field', title: 'Munsell from camera', on: '@gcu/swatch', about: 'Point at a rock, get the nearest chip.', examples: [] } });
tool({ name: 'kinematic', planned: true, skill: { group: 'Field', title: 'Kinematic check', on: 'daylight', about: 'Planar, wedge and toppling tests against a slope face.', examples: [] } });
tool({ name: 'transform', planned: true, skill: { group: 'Table', title: 'Transform by example', on: 'new package', about: 'Show two examples (BH-001A → 1) and it derives the rule for the column.', examples: [] } });
tool({ name: 'report', planned: true, skill: { group: 'Table', title: 'Report paragraph', on: 'templates', about: 'A method paragraph written from the plan parameters.', examples: [] } });
tool({ name: 'mapdial', planned: true, skill: { group: 'Device', title: 'Map, dial, share', on: 'lead-acid intent', about: 'Show a place, start a call, share the last result.', examples: [] } });

// Row: [id, name, size · licence, status (live | samp | plan), description]
export const PACKS = [
  ['timescale', 'International Chronostratigraphic Chart', 'ICS 2023 · Macrostrat · CC BY 4.0', 'live', 'Every unit of the chart: bounds, rank, parents, neighbours, subdivisions.'],
  ['factbook', 'CIA World Factbook', '2.8 MB · CC0', 'samp', 'Records: lookup, convert, filter, rank.'],
  ['factbook-full', 'Factbook, full profiles', '2.3 MB · CC0', 'samp', 'Installed with the factbook when asked: which countries are landlocked, and their coastlines. More fields later.'],
  ['ods', 'Open Data Structures', '1.9 MB · CC BY 2.5', 'samp', 'Definitions: where a term is defined, with the defining passage once installed. Listings can run in adder later.'],
  ['minerals', 'Mineral species (Wikidata)', '254 kB · CC0', 'samp', 'Every mineral species Wikidata lists: formula, elements, class, crystal system; hardness and density where Wikidata has them. Lookups, searches by element, and a table to ask.'],
  ['elements-of-style', 'The Elements of Style (1918)', '36 kB · public domain', 'samp', 'Its rules and the expressions of chapter V, compiled into a text checker that cites them.'],
  ['rtow · rtnw · rtrol', 'Ray Tracing series', '11.5 MB · CC0', 'plan', 'Reader only until a term index is built.'],
  ['arcr', 'arcr / gewgaw manual', '26 kB · CC0', 'plan', 'Reader only.'],
  ['geonames', 'Gazetteer', 'proposed · check licence', 'plan', 'Places, coordinates, distances.'],
  ['wikidata-core', 'Wikidata subset', 'proposed · check licence', 'plan', 'Who, what, when and where as structured facts.'],
  ['usgs-mcs', 'USGS commodity summaries', 'proposed · check licence', 'plan', 'Production and reserves by country.'],
  ['wordnet', 'WordNet', 'proposed · check licence', 'plan', 'Synonyms for the parser, so fewer words need teaching.']
];
const GROUPS = ['Compute', 'Field', 'Table', 'Knowledge', 'Device', 'Session'];
// the Skills tab, grouped, in declaration order; computed on demand so every module has registered
export const skills = () => GROUPS.flatMap(g => TOOLS.filter(d => d.skill && d.skill.group === g).map(d => ({ group: g, title: d.skill.title, on: d.skill.on, about: d.skill.about, examples: d.skill.examples || [], live: !d.planned })));
export const examples = () => skills().flatMap(s => s.examples);
// "what can you do": the catalog as a card, a group per row, one example of each group to tap, and the full list a tap away
tool({
  name: 'abilities',
  skill: { group: 'Session', title: 'What I can do', on: 'the catalog', about: 'The skills that run here, by group, with one to try from each.', examples: ['what can you do'] },
  run: () => {
    const rows = skills(), live = rows.filter(s => s.live), plan = rows.length - live.length;
    const by = GROUPS.map(g => [g, live.filter(s => s.group === g)]).filter(([, l]) => l.length);
    return { read: ['list the skills'], value: live.length,
      body: [{ t: 'big', v: String(live.length), unit: 'skills run here' }, { t: 'sub', text: `${plan} more are planned. Each one reads plain words; none of them calls a model.` },
        { t: 'kv', rows: by.map(([g, l]) => [g.toLowerCase(), l.map(s => s.title).join(' · ')]) },
        { t: 'lbl', text: 'one to try from each' }, { t: 'chips', items: by.map(([, l]) => (l.find(s => s.examples.length) || { examples: [] }).examples[0]).filter(Boolean) },
        { t: 'actions', items: [{ act: 'skills', label: 'All skills, with examples' }] }],
      trace: [`catalog → ${live.length} live, ${plan} planned`] };
  }
});
frame({ name: 'abilities', label: 'What I can do', words: ['what can you do', 'what can i ask', 'what do you do', 'what can i do here', 'what are your skills', 'what skills do you have', 'help', 'skills', 'list the skills', 'list skills', 'show the skills', 'show me what you can do', 'what else can you do'],
  theme: [], required: [], roles: {}, words_pt: ['o que você faz', 'o que voce faz', 'o que você sabe fazer', 'ajuda', 'habilidades'], label_pt: 'O que sei fazer', bind: () => ({ tool: 'abilities', args: {} }) });
let VOCAB = null;
export const vocab = () => VOCAB || (VOCAB = new Set(examples().filter(e => !/ means /.test(e)).join(' ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3)));
// the example chips in the dock
// the welcome of an empty session: one line of what, one query that shows it
// the welcome's starters, by what they are for: [group, [[title, query], …]]
export const STARTERS = [
  ['In the field', [['True thickness', 'true thickness of a 14 m intercept, hole 270/60, bedding 045/30'], ['Declination here', 'declination at -19.92, -43.94'], ['Apparent dip', 'apparent dip of 000/30 on a section at 045'], ['Field notebook', 'the field notebook']]],
  ['Lab and tables', [['A table to try (sample data)', 'open assays.csv'], ['Core mass', 'mass of 1 m of nq core at 2.7'], ['Molar mass', 'molar mass of CuFeS2']]],
  ['Units and numbers', [['Convert a grade', '0.35 oz per short ton in g/t'], ['With uncertainty', '2.7 ± 0.1 t/m3 * 1.35 Mm3'], ['Run some Python', 'run this: sum(x * x for x in range(10))']]],
  ['Every day', [['Set a reminder', 'remind me to send the samples to the lab on friday at 9'], ['Two time zones', '9am sao paulo in perth'], ['What can you do?', 'what can you do']]],
];
// the same, for the Portuguese interface: each one reads in Portuguese (test/portuguese.test.mjs)
export const STARTERS_PT = [
  ['No campo', [['Espessura verdadeira', 'espessura verdadeira de 14 m, furo 270/60, acamamento 045/30'], ['Declinação', 'declinação em -19.92, -43.94'], ['Medir com o celular', 'mede o acamamento'], ['Caderneta de campo', 'a caderneta']]],
  ['Laboratório e tabelas', [['Uma tabela para testar (dados de amostra)', 'abre assays.csv'], ['Massa molar', 'massa molar de CuFeS2'], ['Histograma', 'histograma de cu']]],
  ['Unidades e números', [['Converter', 'converte 5 km para milhas'], ['Temperatura', '25 graus celsius em fahrenheit'], ['Dias úteis', 'quantos dias úteis até 20 de dezembro']]],
  ['Dia a dia', [['Lembrete', 'me lembra de mandar as amostras pro laboratório na sexta às 9'], ['Que horas são', 'que horas são em perth'], ['O que você faz?', 'o que você faz']]],
];
export const SUGGESTIONS = ['pop means population', 'histogram of cu', 'log scale', 'population density of mongolia in people per square mile', 'and chile', 'set a timer for 5 min', 'what is a skiplist', 'why', 'export as script', 'undo'];

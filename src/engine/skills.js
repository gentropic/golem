// The catalog: skills derived from the declarations, planned skills named here, and the packs golem
// knows about. Examples feed the Skills tab, the "nearest skills" suggestions and the teach vocabulary.
import { TOOLS, tool } from './core.js';

// skills named but not built: a row in the catalog, nothing in the tool table
tool({ name: 'algebra', planned: true, skill: { group: 'Compute', title: 'Step-by-step algebra', on: 'new package', about: 'Solve and show the derivation. The monorepo has no symbolic algebra yet.', examples: [] } });
tool({ name: 'compass', planned: true, skill: { group: 'Field', title: 'Compass capture', on: 'lead-acid sensors', about: 'Measure a plane with the phone and add it to a set by voice or text.', examples: [] } });
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
let VOCAB = null;
export const vocab = () => VOCAB || (VOCAB = new Set(examples().filter(e => !/ means /.test(e)).join(' ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3)));
// the example chips in the dock
// the welcome of an empty session: one line of what, one query that shows it
export const STARTERS = [['Convert a grade', '0.35 oz per short ton in g/t'], ['True thickness', 'true thickness of a 14 m intercept, hole 270/60, bedding 045/30'], ['Look at a table (sample data)', 'open assays.csv'], ['Run some Python', 'run this: sum(x * x for x in range(10))'], ['Set a reminder', 'remind me to send the samples to the lab on friday at 9'], ['What can you do?', 'what can you do']];
export const SUGGESTIONS = ['pop means population', 'histogram of cu', 'log scale', 'population density of mongolia in people per square mile', 'and chile', 'set a timer for 5 min', 'what is a skiplist', 'why', 'export as script', 'undo'];

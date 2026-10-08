// The catalog: skills with examples, and the packs golem knows about. Examples feed the Skills tab,
// the "nearest skills" suggestions and the teach vocabulary.
// Row: [group, name, builds on, in mock (1) or planned (0), description, examples]
export const SKILLS = [
  ['Compute', 'Unit conversion', '@gcu/units', 1, 'Grades, lengths, masses, areas, pressures, temperatures. Refuses mismatched dimensions.', ['0.35 oz per short ton in g/t', '2.7 g/cm3 in lb/ft3', '1500 psi in mpa', '5 km in kg']],
  ['Compute', 'Arithmetic', '@gcu/expr', 1, 'Parsed and evaluated, never eval. Trigonometry in degrees.', ['14 * cos(22) + 3^2', 'sqrt(2) * 84']],
  ['Compute', 'Dates', 'built in', 1, 'Day counts and weekdays.', ['days until 25 december', 'what day is 15 nov 2027']],
  ['Compute', 'Step-by-step algebra', 'new package', 0, 'Solve and show the derivation. The monorepo has no symbolic algebra yet.', []],
  ['Field', 'True thickness', '@gcu/bearing', 1, 'Intercept length, hole orientation and plane give thickness and a stereonet.', ['true thickness of a 14 m intercept, hole 270/60, bedding 045/30']],
  ['Field', 'Stereonet', '@gcu/bearing', 1, 'Planes and poles, equal area, lower hemisphere.', ['plot plane 120/55']],
  ['Field', 'Mineral key', 'minerals pack', 1, 'golem asks the questions and narrows the candidates.', ['identify a mineral', 'density of chalcopyrite']],
  ['Field', 'Compass capture', 'lead-acid sensors', 0, 'Measure a plane with the phone and add it to a set by voice or text.', []],
  ['Field', 'Munsell from camera', '@gcu/swatch', 0, 'Point at a rock, get the nearest chip.', []],
  ['Field', 'Kinematic check', 'daylight', 0, 'Planar, wedge and toppling tests against a slope face.', []],
  ['Table', 'Open and validate', 'sadpan · tare', 1, 'Typed columns, interval checks, flags for suspicious codes.', ['open assays.csv']],
  ['Table', 'Histogram', 'sadpan · @gcu/plot', 1, 'Amend it afterwards with “log scale”.', ['histogram of cu']],
  ['Table', 'Variogram', '@gcu/drillhole · gsjs', 1, 'A missing precondition becomes a question, then a step in the plan.', ['variogram of cu']],
  ['Table', 'Transform by example', 'new package', 0, 'Show two examples (BH-001A → 1) and it derives the rule for the column.', []],
  ['Table', 'Report paragraph', 'templates', 0, 'A method paragraph written from the plan parameters.', []],
  ['Knowledge', 'Records', 'factbook pack', 1, 'Lookups, unit changes and filters across records.', ['population density of mongolia in people per square mile', 'landlocked countries by population', 'area of brazil in square miles']],
  ['Knowledge', 'Definitions', 'ods pack', 1, 'Finds where a term is defined and opens the reader there.', ['what is a skiplist']],
  ['Knowledge', 'Style check', 'elements-of-style pack', 1, 'Rules compiled into a checker that cites the rule.', ['check: owing to the fact that the samples were lost by the lab, there is no doubt but that the assay was not important']],
  ['Knowledge', 'Your documents', 'librarian · glass', 0, 'Retrieval over files you add. Returns the passage and its location.', []],
  ['Device', 'Calendar event', 'lead-acid intent', 1, 'Fills the event and hands it to your calendar app.', ['remind me to send the samples to the lab on friday at 9', 'schedule core shed visit tomorrow at 14:30 for 2 hours']],
  ['Device', 'Timer and alarm', 'lead-acid intent', 1, 'Handed to the Clock app.', ['set a timer for 5 min', 'set an alarm for 6:15']],
  ['Device', 'Map, dial, share', 'lead-acid intent', 0, 'Show a place, start a call, share the last result.', []],
  ['Session', 'Explain', 'plan', 1, 'Shows the plan behind the last answer.', ['why']],
  ['Session', 'Amend, repeat, undo', 'dispatch-meta', 1, 'Change the last card without retyping it.', ['in feet', 'log scale', 'and chile', 'again', 'undo']],
  ['Session', 'Teach a word', 'lexicon', 1, 'Stays on the device.', ['vario means variogram']],
  ['Session', 'Notes', 'glass', 1, 'Remembers only what you ask it to.', ['remember that hole 12 collar was resurveyed in march', 'what do you know about hole 12']],
  ['Session', 'Sessions and history', 'plan store', 1, 'Sessions name themselves from the tools that ran. Search covers all of them.', ['new session', 'name this session friday lab run', 'history']],
  ['Session', 'Export the plan', 'adder', 1, 'The session as a script. Every line is a tool call it made.', ['export as script']]
];
// Row: [id, name, size · licence, status (live | samp | plan), description]
export const PACKS = [
  ['factbook', 'CIA World Factbook', '2.8 MB · CC0', 'samp', 'Records: lookup, convert, filter, rank.'],
  ['factbook-full', 'Factbook, full profiles', '2.3 MB · CC0', 'plan', 'Deeper filters, such as exports and resources.'],
  ['ods', 'Open Data Structures', '1.9 MB · CC BY 2.5', 'samp', 'Term index into the reader. Listings can run in adder.'],
  ['elements-of-style', 'The Elements of Style (1918)', '36 kB · public domain', 'live', 'Rules compiled into a text checker.'],
  ['rtow · rtnw · rtrol', 'Ray Tracing series', '11.5 MB · CC0', 'plan', 'Reader only until a term index is built.'],
  ['arcr', 'arcr / gewgaw manual', '26 kB · CC0', 'plan', 'Reader only.'],
  ['minerals', 'Mineral properties and key', 'proposed', 'samp', 'Properties plus an identification key. 12 minerals here.'],
  ['geonames', 'Gazetteer', 'proposed · check licence', 'plan', 'Places, coordinates, distances.'],
  ['wikidata-core', 'Wikidata subset', 'proposed · check licence', 'plan', 'Who, what, when and where as structured facts.'],
  ['usgs-mcs', 'USGS commodity summaries', 'proposed · check licence', 'plan', 'Production and reserves by country.'],
  ['wordnet', 'WordNet', 'proposed · check licence', 'plan', 'Synonyms for the parser, so fewer words need teaching.']
];
export const ALLEX = SKILLS.flatMap(s => s[5]);
export const VOCAB = new Set(ALLEX.filter(e => !/ means /.test(e)).join(' ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3));
// the example chips in the dock
export const SUGGESTIONS = ['vario means variogram', 'variogram of cu', 'histogram of cu', 'log scale', 'identify a mineral', 'population density of mongolia in people per square mile', 'and chile', 'set a timer for 5 min', 'what is a skiplist', 'why', 'export as script', 'undo'];

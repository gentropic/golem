// Words for knowledge the packs carry: the units areas are asked in. The Factbook is factbook.js; definitions and the
// style check are books.js.
import { unit } from './core.js';

// areas the records are asked in: parseUnit knows them, the grammar learns their words here
for (const [u, words] of [['mi2', ['square miles', 'square mile', 'sq mi', 'mi2']], ['km2', ['square kilometres', 'square kilometers', 'square km', 'sq km', 'km2']], ['ha', ['hectares', 'hectare', 'ha']], ['acres', ['acres', 'acre']]]) unit({ unit: u, dim: 'area', words });

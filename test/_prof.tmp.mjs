import * as g from '../src/engine/index.js';
import { ontology } from '../src/engine/ontology.js';
g.reset(); g.newSession(); g.submit('2 km in miles');
let t = performance.now(); for (let i = 0; i < 20; i++) ontology(); console.log('ontology()', ((performance.now() - t) / 20).toFixed(2), 'ms');
const o = ontology(); t = performance.now(); for (let i = 0; i < 20; i++) JSON.stringify(o); console.log('stringify', ((performance.now() - t) / 20).toFixed(2), 'ms', (JSON.stringify(o).length / 1024).toFixed(0), 'kB');

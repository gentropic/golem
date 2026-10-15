// reading time over a fixed set of requests: the mean of 3 passes after a warm-up, ms per request
import * as g from '../src/engine/index.js';
const Q = ['2 km in miles', '25 c in f', 'how long to drill 300 m at 25 m/h', 'open assays.csv', 'mean cu by lith', 'histogram of au', 'log scale', 'chalcopyrite', 'station 14', 'add bedding 045/30', 'true thickness of a 14 m intercept, hole 270/60, bedding 045/30', 'what day is next friday', 'write me a poem', 'molar mass of CuFeS2', 'declination at -19.92, -43.94'];
const pass = () => { g.reset(); g.newSession(); const t = performance.now(); for (const q of Q) g.submit(q); return (performance.now() - t) / Q.length; };
pass(); const r = [pass(), pass(), pass()];
console.log(`${(r.reduce((a, b) => a + b) / 3).toFixed(1)} ms per request (${r.map(x => x.toFixed(1)).join(', ')})`);

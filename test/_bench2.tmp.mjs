// the composer's preview while typing: each keystroke a preview of the text so far, no tool run between them
import * as g from '../src/engine/index.js';
g.reset(); g.newSession(); g.submit('open assays.csv');
const text = 'mean cu by lith where au > 0.1';
const pass = () => { const t = performance.now(); for (let i = 1; i <= text.length; i++) g.preview(text.slice(0, i)); return (performance.now() - t) / text.length; };
pass(); const r = [pass(), pass(), pass()];
console.log(`preview: ${(r.reduce((a, b) => a + b) / 3).toFixed(2)} ms per keystroke`);

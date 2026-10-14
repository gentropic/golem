// Where the device keeps golem (SPEC 13.9), in a browser: state saved by the build before 14 Oct 2026 in localStorage
// moves into @gcu/vfs over IndexedDB once; a change survives a reload; and a change a closing tab could not finish
// writing to IndexedDB comes back from the journal. Run with `npm test`; set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as g from '../src/engine/index.js';

const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'golem.html')).href;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

// a state as the old build left it: one session named "from localStorage" with a card, and a taught word
g.reset(); g.newSession(); g.renameSession(g.current().id, 'from localStorage'); g.submit('2 km in miles'); g.submit('pop means population');
const legacy = JSON.stringify(g.serialize());

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext(), page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('golem.mock.v2', s); sessionStorage.setItem('seeded', '1'); } }, legacy);
const ready = async () => { await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(250); };
const idb = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('golem'); r.onsuccess = () => { const tx = r.result.transaction('files'); const all = tx.objectStore('files').getAll(); all.onsuccess = () => res(all.result.filter(x => x.type === 'file').map(x => x.path)); }; r.onerror = () => res([]); }));

await page.goto(url); await ready();
const name = await page.textContent('#sname'), ls = await page.evaluate(() => Object.keys(localStorage).filter(k => /golem\.(mock|state)/.test(k)));
const paths = await idb();
check(name === 'from localStorage' && paths.includes('/meta.json') && paths.some(p => p.startsWith('/sessions/')), `the old localStorage state comes back and moves into IndexedDB (${paths.length} files)`);
check(ls.length === 0, `the old localStorage copy is gone once moved (${ls.join(', ') || 'none left'})`);

// a change survives a reload
await page.fill('#q', 'density of chalcopyrite'); await page.press('#q', 'Enter'); await page.waitForTimeout(50);
await page.reload(); await ready();
const cards = await page.locator('#stream .card').count();
check(cards === 3, `a card added just before a reload is there after it (${cards} cards)`);

// a write the closing tab could not finish: the journal is newer than IndexedDB, and wins
await page.evaluate(() => {
  const r = indexedDB.open('golem');
  return new Promise(res => { r.onsuccess = () => { const tx = r.result.transaction('files'); const q = tx.objectStore('files').get('/meta.json'); q.onsuccess = () => res(q.result); }; });
}).then(async rec => {
  const meta = JSON.parse(typeof rec.content === 'string' ? rec.content : new TextDecoder().decode(rec.content));
  await page.evaluate(m => {
    const s = { id: m.cur, name: 'from the journal', auto: false, example: false, created: Date.now(), updated: Date.now(), cards: [] };
    localStorage.setItem('golem.journal', JSON.stringify({ at: m.at + 1000, meta: { v: 1, cur: m.cur, sid: m.sid }, device: { aliases: {}, facts: [], tables: {}, recipes: {} }, session: s }));
  }, meta);
});
await page.reload(); await ready();
check((await page.textContent('#sname')) === 'from the journal', 'a change only the journal holds wins on reload');

// a session exported from the drawer and opened again with the paperclip comes back as a session of its own
await page.evaluate(() => document.querySelector('#menu, #sname')?.click()); await page.waitForTimeout(150);
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-exp]').first().click()]);
const file = await dl.path(), fname = dl.suggestedFilename();
const before = await page.locator('#dlist [data-s]').count();
const input = page.locator('#file'); await input.setInputFiles({ name: fname, mimeType: 'application/json', buffer: readFileSync(file) }); await page.waitForTimeout(300);
const after = await page.locator('#dlist [data-s]').count();
check(/\.golem\.json$/.test(fname) && after === before + 1, `export downloads ${fname}; opening it adds a session (${before} → ${after})`);
// a fresh device, quick queries and a reload before the first save lands in IndexedDB: the journal alone brings them back
const ctx2 = await browser.newContext(), p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push(e.message));
await p2.goto(url); await p2.waitForSelector('html[data-ready]');
for (const q of ['new session', '2 km in miles', 'in feet', '25 c in f', 'what day is 15 nov 2027']) { await p2.fill('#q', q); await p2.press('#q', 'Enter'); await p2.waitForTimeout(20); }
const n0 = await p2.locator('#stream .card').count();
await p2.reload(); await p2.waitForSelector('html[data-ready]'); await p2.waitForSelector('#stream .card');
const n1 = await p2.locator('#stream .card').count();
check(n0 === 4 && n1 === 4, `quick queries and a reload on a fresh device keep every card (${n0} → ${n1})`);
errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close();
if (failed || errors.length) { console.log('\nstorage test failed'); process.exit(1); }
console.log('\nstorage test passed');

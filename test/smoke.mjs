// Smoke test: load dist/golem.html in a browser, type queries, check the last card.
// Run with `npm test`. Set CHROMIUM_PATH if Playwright's own browser is not installed.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'golem.html');
// [query, expected rung of the last card, text the last card must contain]
const STEPS = [
  ['new session', null, null],
  ['0.35 oz per short ton in g/t', 'grammar', '12 g/t'],
  ['in ppm', 'context', '12 ppm'],
  ['true thickness of a 14 m intercept, hole 270/60, bedding 045/30', 'grammar', '12.97'],
  ['2.7 g/cm3 in lb/ft3', 'grammar', '168.555'],
  ['5 km in kg', 'grammar', 'No conversion exists'],
  ['25 c in f', 'grammar', '77'],
  ['14 * cos(22) + 3^2', 'grammar', '21.98057396'],
  ['what day is 15 nov 2027', 'grammar', 'Monday'],
  ['population density of mongolia in people per square mile', 'grammar', '5.46'],
  ['and chile', 'context', '64.1'],
  ['in people per km2', 'context', '24.7'],
  ['landlocked countries by population', 'grammar', 'Zambia'],
  ['capital of brazil', 'grammar', 'Brasília'],
  ['what is a skiplist', 'grammar', 'ch. 4 Skiplists'],
  ['check: owing to the fact that the samples were lost by the lab', 'grammar', 'Omit needless words'],
  ['remember that hole 12 collar was resurveyed in march', 'grammar', 'Stored on this device'],
  ['what do you know about hole 12', 'grammar', 'resurveyed'],
  ['write me a poem about kriging', 'no reading', 'I do not guess'],
  ['why', 'context', 'grammar: no rule matched'],
  ['new session', null, null],
  ['pop of mongolia', 'no reading', 'pop means population'],
  ['pop means population', 'grammar', 'Learned'],
  ['pop of mongolia', 'taught', '3,300,000'],
  ['histogram of cu', 'grammar', 'No table is open'],
  ['yes', 'grammar', 'median'],
  ['histogram of au', 'grammar', 'median'],
  ['log scale', 'context', 'log scale'],
  ['export as script', 'grammar', 'plot.hist'],
  ['how old is the permian', 'grammar', '298.9'],
  ['explain cron: 0 9 * * 1-5', 'grammar', 'At 09:00, Monday to Friday'],
  ['chmod 754', 'grammar', 'rwxr-xr--'],
  ['sha256: abc', 'grammar', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['the table as tsv', 'grammar', 'Save assays.tsv'],
  ['is 21 apr 2027 a working day', 'grammar', 'Tiradentes'],
  ['9am sao paulo in perth', 'grammar', '20:00'],
  ['2.6 to 2.9 t/m3 * 1.2 to 1.5 Mm3', 'grammar', 'exact 3.7125'],
  ['molar mass of CuFeS2', 'grammar', '183.51'],
  ['word count: the quick brown fox jumps over the lazy dog. it was not amused.', 'grammar', 'Flesch'],
  ['cutoff grade for copper at 9000 usd/t, 88% recovery, processing 14 usd/t, g&a 3 usd/t', 'grammar', 'Selling cost'],
  ['0', 'grammar', '0.2146'],
  ['log 5 km run', 'grammar', 'Logged'],
  ['how many km did i run this week', 'grammar', '5'],
  ['0, -45 in utm', 'grammar', '23N 500,000 E 0 N'],
  ['distance from 0,0 to 0,1', 'grammar', '111.3']
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('page error: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + file);
await page.waitForSelector('#stream .card');

let failed = 0;
for (const [q, rung, text] of STEPS) {
  await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(40);
  if (rung === null) continue;
  const got = await page.evaluate(() => { const c = [...document.querySelectorAll('#stream .card')].pop(); return c ? { rung: c.querySelector('.rung').textContent, text: c.textContent.replace(/\s+/g, ' ') } : null; });
  const ok = got && got.rung === rung && got.text.includes(text);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${q}${ok ? '' : `\n       wanted [${rung}] …${text}…\n       got    [${got && got.rung}] ${got && got.text.slice(0, 160)}`}`);
}
const name = await page.textContent('#sname');
const nameOk = name === 'assays.csv: Au histogram, Cu histogram';
console.log(`${nameOk ? 'ok  ' : 'FAIL'} session auto-name: ${name}`);
await page.reload(); await page.waitForSelector('#stream .card');
const kept = await page.locator('#stream .card').count();
console.log(`${kept === 22 ? 'ok  ' : 'FAIL'} session replays after reload: ${kept} cards`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`${overflow <= 0 ? 'ok  ' : 'FAIL'} no horizontal overflow at 420 px`);
// a real file through the picker, then a table question on it
await page.setInputFiles('#file', join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'holes.csv'));
await page.waitForTimeout(150);
const opened = await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent);
const fileOk = /typed by @gcu\/recon/.test(opened);
console.log(`${fileOk ? 'ok  ' : 'FAIL'} a CSV opens through the picker`);
await page.fill('#q', 'mean cu by litho'); await page.press('#q', 'Enter'); await page.waitForTimeout(60);
const grouped = await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent);
const queryOk = /BRX/.test(grouped) && /holes\.csv/.test(grouped);
await page.fill('#q', 'true thickness of every intercept with hole 270/60, bedding 045/30'); await page.press('#q', 'Enter'); await page.waitForTimeout(60);
const applied = await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent);
const applyOk = /true thickness over/.test(applied);
console.log(`${applyOk ? 'ok  ' : 'FAIL'} a skill applied to every intercept`);
if (!applyOk) failed++;
console.log(`${queryOk ? 'ok  ' : 'FAIL'} a grouped mean on the opened file`);
if (!fileOk || !queryOk) failed++;
// the dm fixture after the CSV questions, since opening it replaces the open table
await page.setInputFiles('#file', join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'model.dm'));
await page.waitForTimeout(300);
const dmText = await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent);
const dmOk = /700/.test(dmText) && /@gcu\/dm/.test(dmText);
console.log(`${dmOk ? 'ok  ' : 'FAIL'} a Datamine .dm opens through the picker`);
if (!dmOk) failed++;
// a DXF through the picker opens as its conversion, not as a table
await page.setInputFiles('#file', join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pit.dxf'));
await page.waitForTimeout(300);
const dxfText = await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent);
const dxfOk = /FeatureCollection/.test(dxfText) && /@gcu\/dxf/.test(dxfText);
console.log(`${dxfOk ? 'ok  ' : 'FAIL'} a DXF opens through the picker as GeoJSON`);
if (!dxfOk) failed++;
// a Markdown file is kept as a document and searched; the matched word is marked in the passage
await page.setInputFiles('#file', join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'notes.md'));
await page.waitForTimeout(300);
await page.fill('#q', 'find resurvey in my documents'); await page.press('#q', 'Enter');
await page.waitForTimeout(300);
const docMark = await page.evaluate(() => { const c = [...document.querySelectorAll('#stream .card')].pop(); const m = c.querySelector('mark'); return m ? m.textContent + ' | ' + c.textContent : c.textContent; });
const docOk = docMark.startsWith('resurvey | ') && /notes\.md · Field notes › Collar check · line 7/.test(docMark);
console.log(`${docOk ? 'ok  ' : 'FAIL'} a Markdown file is searched, the match marked${docOk ? '' : ': ' + docMark.slice(0, 200)}`);
if (!docOk) failed++;
// Python in a fresh worker built from the page itself: the card starts as running and is replaced when adder answers
await page.fill('#q', 'run this: x = sum(range(10))\nprint("total", x)\nx * 2'); await page.press('#q', 'Enter');
const pyText = await page.waitForFunction(() => { const c = [...document.querySelectorAll('#stream .card')].pop(); return c && /total 45/.test(c.textContent) && /90/.test(c.textContent) ? c.textContent : null; }, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
// compiled by AIR in the real worker (new Function is allowed there, principle 9), not a quiet fallback
const pyOk = !!pyText && /compiled by AIR/.test(pyText);
console.log(`${pyOk ? 'ok  ' : 'FAIL'} Python runs in a worker, compiled by AIR${pyOk ? '' : ': ' + (await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent)).slice(0, 300)}`);
if (!pyOk) failed++;
// a matplotlib figure: plot draws in the worker, the draw list crosses as JSON, the shell replays it on a canvas
await page.fill('#q', 'run this: import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.title("squares")\nplt.show()'); await page.press('#q', 'Enter');
const inked = await page.waitForFunction(() => {
  const cv = [...document.querySelectorAll('#stream .card')].pop()?.querySelector('canvas[data-fig]'); if (!cv || !cv.width) return null;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n > 1000 ? n : null;
}, null, { timeout: 8000 }).then(h => h.jsonValue(), () => 0);
console.log(`${inked ? 'ok  ' : 'FAIL'} a figure drawn on the card${inked ? ` (${inked} pixels inked)` : ''}`);
if (!inked) failed++;
// numpy: natra compiles its Wasm kernels with atra inside the blob worker
await page.fill('#q', 'run this: import numpy as np\nnp.round(np.array([1.0, 0.3333, 0.6667]), 2)'); await page.press('#q', 'Enter');
const npText = await page.waitForFunction(() => { const c = [...document.querySelectorAll('#stream .card')].pop(); return c && /array\(\[1\.\s+, 0\.33, 0\.67\]\)/.test(c.textContent) ? c.textContent : null; }, null, { timeout: 8000 }).then(h => h.jsonValue(), () => null);
console.log(`${npText ? 'ok  ' : 'FAIL'} numpy in a real worker${npText ? '' : ': ' + (await page.evaluate(() => [...document.querySelectorAll('#stream .card')].pop().textContent)).slice(0, 240)}`);
if (!npText) failed++;
errors.forEach(e => console.log('FAIL ' + e));
await browser.close();
if (failed || !nameOk || kept !== 22 || overflow > 0 || errors.length) { console.log('\nsmoke test failed'); process.exit(1); }
console.log('\nsmoke test passed');

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
  ['how old is the permian', 'grammar', '298.9']
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
console.log(`${kept === 8 ? 'ok  ' : 'FAIL'} session replays after reload: ${kept} cards`);
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
console.log(`${queryOk ? 'ok  ' : 'FAIL'} a grouped mean on the opened file`);
if (!fileOk || !queryOk) failed++;
errors.forEach(e => console.log('FAIL ' + e));
await browser.close();
if (failed || !nameOk || kept !== 8 || overflow > 0 || errors.length) { console.log('\nsmoke test failed'); process.exit(1); }
console.log('\nsmoke test passed');

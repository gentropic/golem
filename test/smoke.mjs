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
  ['density of chalcopyrite', 'grammar', '4.1–4.3'],
  ['what is a skiplist', 'grammar', 'ch. 4 Skiplists'],
  ['check: owing to the fact that the samples were lost by the lab', 'grammar', 'Omit needless words'],
  ['remember that hole 12 collar was resurveyed in march', 'grammar', 'Stored on this device'],
  ['what do you know about hole 12', 'grammar', 'resurveyed'],
  ['write me a poem about kriging', 'no reading', 'I do not guess'],
  ['why', 'context', 'grammar: no rule matched'],
  ['new session', null, null],
  ['vario of cu', 'no reading', 'vario means variogram'],
  ['vario means variogram', 'grammar', 'Learned'],
  ['vario of cu', 'taught', 'No table is open'],
  ['yes', 'taught', 'Composite to what length'],
  ['2', 'taught', 'composites'],
  ['histogram of cu', 'grammar', 'median'],
  ['log scale', 'context', 'log scale'],
  ['export as script', 'grammar', 'drillhole.composite']
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
const nameOk = name === 'assays.csv: Cu histogram, Cu variogram';
console.log(`${nameOk ? 'ok  ' : 'FAIL'} session auto-name: ${name}`);
await page.reload(); await page.waitForSelector('#stream .card');
const kept = await page.locator('#stream .card').count();
console.log(`${kept === 6 ? 'ok  ' : 'FAIL'} session replays after reload: ${kept} cards`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`${overflow <= 0 ? 'ok  ' : 'FAIL'} no horizontal overflow at 420 px`);
errors.forEach(e => console.log('FAIL ' + e));
await browser.close();
if (failed || !nameOk || kept !== 6 || overflow > 0 || errors.length) { console.log('\nsmoke test failed'); process.exit(1); }
console.log('\nsmoke test passed');

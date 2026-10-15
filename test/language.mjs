// The interface in Portuguese: a pt-BR browser opens golem in Portuguese (the page, the welcome's starters, the cards'
// frame, the About view), a Portuguese question reads, English still reads, and the switch in the sidebar goes back to
// English and is kept on the device. Run with `npm test`; set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'golem.html')).href;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(url); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
const ask = async q => { await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(250); return page.locator('#stream .card').last(); };

check(await page.getAttribute('html', 'lang') === 'pt-BR', 'a pt-BR browser opens golem in Portuguese');
const welcome = await page.textContent('#welcome');
check(/Pergunte, calcule/.test(welcome) && /No campo/.test(welcome) && /espessura verdadeira/.test(welcome), 'the welcome and its starters are in Portuguese');
check(await page.getAttribute('#q', 'placeholder') === 'Pergunte, calcule ou peça' && /Nova sessão/.test(await page.textContent('#newsess')), 'the box and the sidebar are in Portuguese');
const c = await ask('converte 5 km para milhas'); const txt = await c.textContent();
check(/3\.10686/.test(txt) && /gramática/.test(txt) && /lido como/.test(txt) && /copiar/.test(txt), `a Portuguese question reads, in a Portuguese frame (${txt.replace(/\s+/g, ' ').slice(0, 70)})`);
check(/0\.8 km/.test(await (await ask('800 m in km')).textContent()), 'English still reads with Portuguese first');
// the answers in Portuguese: the reading's words, the labels, a sentence with values; a table's own columns untouched
check(/converter/.test(txt) && /para/.test(txt), `the reading's words are Portuguese (${txt.replace(/\s+/g, ' ').slice(0, 60)})`);
const st = await (await ask('o arenito sobrepõe o granito')).textContent();
check(/Guardado: arenito sobrepõe granito, então arenito é mais jovem que granito \(superposição/.test(st), `a sentence with values, in Portuguese (${st.replace(/\s+/g, ' ').slice(0, 90)})`);
const mi = await (await ask('dureza do quartzo')).textContent();
check(/sistema cristalino/.test(mi) && /densidade/.test(mi), 'key-value labels in Portuguese');
await ask('abre assays.csv'); const tb = await (await ask('média de cu por lith')).textContent();
check(/lith/.test(tb) && !/lito\b/.test(tb), 'a table\'s own column names are left as they are');
await page.evaluate(() => document.querySelector('[data-tab="about"]').click()); await page.waitForTimeout(100);
check(await page.isVisible('.notes[data-lang="pt"]') && !(await page.isVisible('.notes[data-lang="en"]')), 'the About view is the Portuguese one');
await page.evaluate(() => document.querySelector('[data-tab="ask"]').click());

// the switch: back to English, kept across a reload
await page.click('#lang'); await page.waitForTimeout(150);
check(await page.getAttribute('html', 'lang') === 'en' && await page.getAttribute('#q', 'placeholder') === 'Ask, compute, or act' && /read as/.test(await page.locator('#stream .card').first().textContent()), 'the switch turns the page and the cards to English');
await page.reload(); await page.waitForSelector('html[data-ready]');
check(await page.getAttribute('html', 'lang') === 'en' && (await page.textContent('#lang-k')) === 'English', 'the choice is kept on the device');

errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close();
if (failed || errors.length) { console.log('\nlanguage test failed'); process.exit(1); }
console.log('\nlanguage test passed');

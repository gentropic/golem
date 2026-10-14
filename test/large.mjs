// Tables too large to hold (SPEC 13.7), in a browser: a 25 MB CSV picked through the paperclip opens as a stream, a
// question scans the whole file as a job, the file is kept on the device so a reload can scan it again, and what needs
// every row at once refuses. Run with `npm test`; set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'golem.html')).href;
const dir = mkdtempSync(join(tmpdir(), 'golem-large-')), path = join(dir, 'drillholes-large.csv');
{ const parts = ['hole,from,to,lith,cu_pct,au_ppm\n']; let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 800000; i++) { const f = Math.floor(i / 500); parts.push(`DH-${String(1 + (i % 500)).padStart(3, '0')},${f},${f + 1},${['BRX', 'GRD', 'SED'][i % 3]},${(r() * 2).toFixed(4)},${(r() * 3).toFixed(4)}\n`); }
  writeFileSync(path, parts.join('')); }
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const ready = async () => { await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200); };
const last = () => page.locator('#stream .card').last().textContent();
const ask = async (q, done = /rows in|request|not held|Histogram/) => { await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForFunction(re => { const c = [...document.querySelectorAll('#stream .card')].pop(); return c && new RegExp(re).test(c.textContent) && !/Reading all/.test(c.textContent); }, done.source, { timeout: 60000 }).catch(() => {}); return last(); };

await page.goto(url); await ready();
await page.setInputFiles('#file', path); await page.waitForTimeout(1500);
const opened = await last();
check(/read as a stream/.test(opened), `a ${Math.round(statSync(path).size / 1e6)} MB CSV opens as a stream`);
const mean = await ask('mean cu_pct', /cu_pct|No usable/);
check(/\d/.test(mean) && !/Reading all/.test(mean), `a question scans the whole file (${mean.replace(/\s+/g, ' ').slice(0, 90)})`);
const cnt = await ask('count rows by lith', /BRX/);
check(/266,667/.test(cnt), 'a grouped count over every row (BRX: 266,667 of 800,000)');
check(/read as a stream, not held/.test(await ask('top 5 rows sorted by au_ppm descending', /not held/)), 'listing rows refuses on a stream');
await page.reload(); await ready();
const again = await ask('median au_ppm', /au_ppm|not on this device/);
check(/t-digest/.test(again) && !/not on this device/.test(again), 'after a reload the kept file is scanned again');
errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close();
if (failed || errors.length) { console.log('\nlarge test failed'); process.exit(1); }
console.log('\nlarge test passed');

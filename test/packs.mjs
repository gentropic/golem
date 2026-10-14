// The Factbook pack (SPEC 13.8), in a browser: installed from the library on request (the library is gcu-library's files
// from the sibling clone, served in place of the network), checked against the registry's SHA-256, kept on the device
// across a reload, removed, installed from a .gcudat file with no request, and refused when the bytes do not match.
// Skipped when ../gcu-library is not there. Run with `npm test`; set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), LIB = join(here, '..', '..', 'gcu-library');
if (!existsSync(join(LIB, 'registry.json'))) { console.log('skip: no sibling gcu-library clone'); process.exit(0); }
const url = pathToFileURL(join(here, '..', 'dist', 'golem.html')).href;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext(), page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
let tamper = false, served = [];
await ctx.route('https://gentropic.github.io/gcu-library/**', route => {
  const path = new URL(route.request().url()).pathname.replace(/^\/gcu-library\//, ''); served.push(path);
  const f = join(LIB, path); if (!existsSync(f)) return route.fulfill({ status: 404 });
  let body = readFileSync(f); if (tamper && path.endsWith('.gcudat')) { body = Buffer.from(body); body[body.length - 1] ^= 1; }
  return route.fulfill({ status: 200, body, headers: { 'access-control-allow-origin': '*', 'content-type': path.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
});
const ready = async () => { await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200); };
const ask = async q => { await page.evaluate(() => document.querySelector('[data-tab="ask"]').click()); await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(150); return page.locator('#stream .card').last().textContent(); };
const packs = () => page.evaluate(() => document.querySelector('[data-tab="packs"]').click());

await page.goto(url); await ready();
check(!(await ask('population of the usa')).includes('338'), 'before installing, the sample has no United States');
await packs(); await page.click('#fb-install-full');
await page.waitForFunction(() => /Installed: 254 countries/.test(document.getElementById('v-packs').textContent), null, { timeout: 30000 }).catch(() => {});
const note = await page.textContent('#v-packs'), reqs = await page.textContent('#st-req');
check(/Installed: 254 countries, with the full profiles/.test(note) && reqs === '3 requests', `installed from the library with its full profiles (${reqs}: ${served.join(', ')})`);
check((await ask('population of the usa')).includes('338,016,259'), 'the United States, as the Factbook publishes it');
check((await ask('landlocked countries by population')).includes('Ethiopia'), 'landlocked, from the full profiles');
await page.reload(); await ready();
check((await ask('what is the gdp per capita of norway')).includes('92,140'), 'still installed after a reload');
await packs(); await page.click('#fb-remove'); await page.waitForTimeout(200);
check(!(await ask('population of the usa')).includes('338'), 'removed: the sample answers again');

// from a file: no request
served = []; const before = await page.textContent('#st-req');
await page.setInputFiles('#file', join(LIB, 'dist', 'factbook.gcudat')); await page.waitForTimeout(800);
check((await ask('capital of france')).includes('Paris') && served.length === 0 && (await page.textContent('#st-req')) === before, 'installed from a .gcudat file, with no request');
await packs(); await page.click('#fb-remove'); await page.waitForTimeout(200);

// a download that does not match the registry is refused
tamper = true; await page.click('#fb-install');
await page.waitForFunction(() => /Not installed/.test(document.getElementById('v-packs').textContent), null, { timeout: 30000 }).catch(() => {});
check(/did not match the registry's checksum/.test(await page.textContent('#v-packs')), 'a download that does not match its checksum is refused');

// the book packs: Open Data Structures from the library, The Elements of Style from a file
tamper = false; served = [];
await packs(); await page.click('[data-pk-install="ods"]');
await page.waitForFunction(() => /Installed: d+ terms/.test(document.getElementById('v-packs').textContent), null, { timeout: 30000 }).catch(() => {});
check(served.includes('dist/ods.gcudat'), `ods installed from the library (${served.join(', ')})`);
check((await ask('define sentinel')).includes('called the sentinel'), 'a definition shows the passage that defines the term');
await page.setInputFiles('#file', join(LIB, 'dist', 'elements-of-style.gcudat')); await page.waitForTimeout(500);
const style = await ask('check: the data is interesting and owing to the fact that it rained we left');
check(/V. Interesting/.test(style) && /13. Omit needless words/.test(style), 'the style check cites the rules and chapter V of the installed book');
await page.reload(); await ready();
check((await ask('define sentinel')).includes('called the sentinel'), 'the books stay installed after a reload');
await packs(); await page.click('[data-pk-remove="ods"]'); await page.waitForTimeout(200);
check(!(await ask('what is a skiplist')).includes('In this chapter'), 'removed: the sample term index answers again');
errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close();
if (failed || errors.length) { console.log('\npacks test failed'); process.exit(1); }
console.log('\npacks test passed');

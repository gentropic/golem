// Settings and What golem keeps, in a browser: a setting set in the view is copied into the next card read (and a card
// read before keeps what it had), a setting said leaves a card, the decimal mark follows the language and the setting
// (only on the page: what is copied keeps the point), forgetting from the inventory stays forgotten across a reload,
// a backup restores everything, and erasing starts golem again. Run with `npm test`; set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'golem.html')).href;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ locale: 'en-GB', viewport: { width: 1200, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(url); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
const tab = async k => { await page.evaluate(k => document.querySelector(`.sfoot [data-tab="${k}"], .tabs [data-tab="${k}"]`).click(), k); await page.waitForTimeout(120); };
const ask = async q => { await tab('ask'); await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(250); return page.locator('#stream .card').last(); };
const text = async l => (await l.textContent()).replace(/\s+/g, ' ');

// a plane before and after "strike/dip" is chosen in the view
const before = await text(await ask('plot plane 120/55'));
await tab('settings');
check(await page.isVisible('#pf-plane') && await page.isVisible('#st-theme') && await page.isVisible('#st-lang'), 'Settings shows the conventions, the theme and the language');
await page.selectOption('#pf-plane', '"sd"'); await page.waitForTimeout(150);
const after = await text(await ask('plot plane 120/55'));
check(/dip direction\/dip/.test(before) && /strike\/dip \(right-hand\)/.test(after) && /toward 210/.test(after), `a plane read after the setting is strike/dip; the one before is not (${after.slice(0, 80)})`);
check(/settings: plane notation/.test(after), 'the card says it was read with a setting');
const first = page.locator('#stream .card').nth(-2);
check(/dip direction\/dip/.test(await text(first)), 'the card read before keeps what it was read with');

// said: a card; a fixed declination with its value in a box
const said = await text(await ask('set declination to -22'));
check(/Set\. Declination: fixed, 22° west/.test(said), `a setting said leaves a card (${said.slice(0, 60)})`);
await tab('settings');
check(await page.inputValue('[data-pref-free="decl"]') === '-22', 'the view shows the value said');

// the decimal mark: on the page only
await page.selectOption('#pf-numbers', '"comma"'); await page.waitForTimeout(150);
const conv = await ask('5 km in miles');
check(/3,10686/.test(await text(conv)), 'with a decimal comma, the page writes 3,10686');
await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }; });
await conv.locator('[data-act="copyans"]').click(); await page.waitForTimeout(100);
const copied = await page.evaluate(() => window.__copied);
check(copied == null || /3,10686/.test(copied), `what is copied is what the page shows (${copied})`);
await tab('settings'); await page.selectOption('#pf-numbers', '"point"'); await page.waitForTimeout(100);

// What golem keeps: taught things listed, one forgotten, still forgotten after a reload (the card that taught it is
// replayed, but writes nothing again)
await ask('pop means population'); await ask('granite is 2.7 t/m3'); await ask('home is -19.92, -43.94');
await tab('kept');
const kept = await page.textContent('#v-kept');
check(/pop → population/.test(kept) && /granite = 2\.7 t\/m3/.test(kept) && /home: -19\.92, -43\.94/.test(kept) && /Plane notation: strike\/dip/.test(kept), 'What golem keeps lists the words, values, places and settings');
await page.click('[data-forget="words"][data-key="\\"pop\\""]'); await page.waitForTimeout(400);
check(!/pop → population/.test(await page.textContent('#v-kept')), 'a word is forgotten');
await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
await tab('kept');
const again = await page.textContent('#v-kept');
check(!/pop → population/.test(again) && /granite = 2\.7/.test(again), 'it stays forgotten after a reload; the rest stays');

// a backup: saved, the device changed, restored from the file
await tab('kept');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kp="backup"]')]);
const path = await dl.path(), backup = JSON.parse(readFileSync(path, 'utf8'));
check(backup.golem === 'device' && backup.sessions.length >= 1 && backup.device.prefs.plane === 'sd' && !!backup.signature, `the backup holds the sessions, the device state and the settings, signed (${dl.suggestedFilename()})`);
await page.click('[data-forget="values"][data-key="\\"granite\\""]'); await page.waitForTimeout(300);
await page.setInputFiles('#restore-f', path); await page.waitForTimeout(400);
check(/Restore from a file/.test(await page.textContent('#v-kept')) && /Signed by key/.test(await page.textContent('#v-kept')), 'a backup is offered, its signature checked, nothing replaced yet');
await page.click('[data-confirm="restore"]'); await page.click('[data-confirm="restore"]'); await page.waitForTimeout(400);
await tab('kept');
check(/granite = 2\.7/.test(await page.textContent('#v-kept')), 'restoring brings back what the file held');

// erasing: two taps, then golem as on a first visit
await page.click('[data-confirm="erase"]');
check(/cannot be undone/.test(await page.textContent('#v-kept')), 'erasing asks for a second tap');
await page.click('[data-confirm="erase"]'); await page.waitForSelector('html[data-ready]', { timeout: 10000 }); await page.waitForTimeout(400);
await tab('kept');
const fresh = await page.textContent('#v-kept');
check(!/granite = 2.7/.test(fresh) && !/Plane notation: strike/.test(fresh), 'after erasing, nothing is kept');

errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close();
if (failed || errors.length) { console.log('\nsettings test failed'); process.exit(1); }
console.log('\nsettings test passed');

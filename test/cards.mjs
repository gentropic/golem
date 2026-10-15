// The card's own actions and the keyboard (a first-class stream): copy the answer, edit the question, pin (kept across a
// reload, listed at the top), branch a new session, and moving between cards without the mouse. Run with `npm test`;
// set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const url = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'golem.html')).href;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, geolocation: { latitude: -23.52, longitude: -46.19, accuracy: 8 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write', 'geolocation']);
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(url); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
const ask = async q => { await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(250); };
await ask('2 km in miles'); await ask('25 c in f'); await ask('how old is the permian');
const card = n => page.locator('#stream .card').nth(n);

// copy: the answer's text, not the question
await card(0).locator('[data-act="copyans"]').click(); await page.waitForTimeout(150);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(/1\.24274/.test(clip) && !/2 km in miles/.test(clip), `copy puts the answer on the clipboard (${clip.replace(/\s+/g, ' ').slice(0, 50)})`);

// keyboard: Escape in the empty box goes to the last card; k moves up; p pins the focused card; e puts its question back
await page.focus('#q'); await page.keyboard.press('Escape');
check(await page.evaluate(() => document.activeElement.classList.contains('card') && document.activeElement.dataset.id === '3'), 'Escape in the empty box focuses the last card');
await page.keyboard.press('k'); await page.keyboard.press('p'); await page.waitForTimeout(100);
check(await card(1).getAttribute('data-pinned') === '1' && /#02 25 c in f/.test(await page.textContent('#pins')), 'k moves up a card and p pins it; the pin is listed at the top');
await page.keyboard.press('e');
check(await page.inputValue('#q') === '25 c in f' && await page.evaluate(() => document.activeElement.id === 'q'), 'e puts the question back in the box');
await page.fill('#q', '');

// the pin is part of the session: it is still there after a reload
await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
check(await card(1).getAttribute('data-pinned') === '1' && !(await page.isHidden('#pins')), 'a pin survives a reload');

// branch: a new session with the cards up to that one, the original untouched
await card(1).locator('[data-act="branch"]').click(); await page.waitForTimeout(200);
check(await page.locator('#stream .card').count() === 2 && /25 c in f/.test(await card(1).textContent()), 'branch opens a new session with the cards up to that one');
const listed = await page.evaluate(() => document.querySelectorAll('#dlist .srow').length);
check(listed >= 4, `the branch is a session of its own in the sidebar (${listed} listed)`);

// a request in steps: each step a card, the preview naming them first
await page.fill('#q', '2 km in miles then 25 c in f'); await page.waitForTimeout(250);
const pv = await page.textContent('#pv');
const n0 = await page.locator('#stream .card').count(); await page.press('#q', 'Enter'); await page.waitForTimeout(300);
check(/2 steps/.test(pv) && (await page.locator('#stream .card').count()) === n0 + 2 && /2 steps, in order/.test(await page.textContent('#status')), `a request in steps makes a card per step (${pv.trim()})`);

// a file dropped on the window opens as the paperclip would
await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['hole,cu\nA,0.5\nB,0.9\n'], 'dropped.csv', { type: 'text/csv' })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true })); });
await page.waitForTimeout(400);
check(/dropped\.csv/.test(await page.locator('#stream .card').last().textContent()), 'a file dropped on the window opens');

// no width scrolls sideways (the composer's hint once pushed the column past the window between 860 and 950 px), and a
// histogram is a chart drawn by plot
await ask('open assays.csv'); await ask('histogram of cu');
check(await page.evaluate(() => { const c = document.querySelector('#stream .card:last-child canvas[data-chart]'); return !!c && c.width > 0; }), 'a histogram is drawn as a chart');
const wide = [];
for (const w of [390, 700, 870, 900, 1200, 1700]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(250); const sw = await page.evaluate(() => document.documentElement.scrollWidth); if (sw > w) wide.push(`${w}: ${sw}`); }
check(!wide.length, `nothing scrolls sideways from 390 to 1700 px${wide.length ? ' (' + wide.join(', ') + ')' : ''}`);

// field capture in a phone's browser, not only in the app: north-referenced orientation events (faked here as a phone's
// browser sends them: deviceorientationabsolute in Chrome, an absolute deviceorientation elsewhere) and the geolocation
await page.setViewportSize({ width: 1200, height: 900 });
await ask('measure bedding');
await page.evaluate(() => { const o = { alpha: 100, beta: 30, gamma: 0, absolute: true }; for (let i = 0; i < 5; i++) { window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', o)); window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', o)); } });
await page.waitForTimeout(100);
const liveTxt = await page.locator('#stream .card').last().locator('.capture .live').textContent();
check(/^080[/]30/.test(liveTxt.trim()), `the browser's compass shows live (${liveTxt.trim()})`);
await page.locator('#stream .card').last().locator('[data-act="take"]').click(); await page.waitForTimeout(200);
const measured = await page.locator('#stream .card').last().textContent();
check(/080[/]30/.test(measured) && /not reported: the browser does not say/.test(measured), 'a reading taken in the browser is the card, marked as from the browser');
await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta: 30, gamma: 0, absolute: false })));
await ask('measure a joint'); await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta: 30, gamma: 0, absolute: false })));
await page.waitForTimeout(100);
const rel = (await page.locator('#stream .card').last().locator('.capture .live').textContent()).trim();
check(!/^[0-9]{3}[/]/.test(rel), `an orientation not tied to north is not a compass (${rel})`);
await ask('declination here');
await page.locator('#stream .card').last().locator('[data-act="take"]').click(); await page.waitForTimeout(800);
const here = await page.locator('#stream .card').last().textContent();
check(/declination at -23.52, -46.19/.test(here) && /° west/.test(here), `declination here takes the browser's position (${here.replace(/[ ]+/g, ' ').slice(0, 70)})`);

errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close();
if (failed || errors.length) { console.log('\ncards test failed'); process.exit(1); }
console.log('\ncards test passed');

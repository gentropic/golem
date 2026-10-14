// The lead-acid hand-offs (SPEC 13.10), on the desktop: lead-acid's bench (auditable ext/leadacid/bench.js) mocks the
// native layer under the real shim, validates every intent against the plugin's schema and records it. The event, timer
// and alarm cards hand their fields over; a phone with no app for one says so. Skipped without the sibling clone.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), BENCH = join(here, '..', '..', 'auditable', 'ext', 'leadacid', 'bench.js');
if (!existsSync(BENCH)) { console.log('skip: no sibling auditable clone'); process.exit(0); }
// served over http: the bench answers /native/** on the page's own origin, which a file:// page does not have
const server = createServer((req, res) => { const p = join(here, '..', 'dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '') || 'golem.html'); if (!existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(readFileSync(p)); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/golem.html?bench`;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext(), page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await ctx.addInitScript(() => { window.__benchFixtures = { intent: { 'clock.alarm': false } }; });   // this "phone" has no alarm app
await ctx.addInitScript({ content: readFileSync(BENCH, 'utf8') });
await page.goto(url); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
check((await page.textContent('#st-where')) === 'in the lead-acid shell', 'golem sees the shell');
const handOff = async q => {
  await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(150);
  const card = page.locator('#stream .card').last(); await card.locator('[data-act="handoff"]').click(); await page.waitForTimeout(300);
  return { note: await card.locator('.note').last().textContent(), sent: await page.evaluate(() => window.__bench.intents.slice(-1)[0] || null) };
};
const ev = await handOff('remind me to call the lab on friday at 9');
check(ev.sent && ev.sent.name === 'calendar.insert' && ev.sent.fields.title === 'Call the lab' && /T09:00$/.test(ev.sent.fields.begin) && /T10:00$/.test(ev.sent.fields.end) && /Handed to the other app/.test(ev.note),
  `the event hands calendar.insert its title, begin and end (${JSON.stringify(ev.sent && ev.sent.fields)})`);
const tm = await handOff('set a timer for 5 min');
check(tm.sent && tm.sent.name === 'clock.timer' && tm.sent.fields.seconds === 300, `the timer hands clock.timer 300 seconds (${JSON.stringify(tm.sent && tm.sent.fields)})`);
const before = await page.evaluate(() => window.__bench.intents.length);
const al = await handOff('set an alarm for 6:15');
check(/No app on this phone takes clock\.alarm/.test(al.note) && (await page.evaluate(() => window.__bench.intents.length)) === before, `a phone with no alarm app says so (${al.note})`);
errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close(); server.close();
if (failed || errors.length) { console.log('\nleadacid test failed'); process.exit(1); }
console.log('\nleadacid test passed');

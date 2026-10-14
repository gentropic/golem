// The lead-acid hand-offs (SPEC 13.10), on the desktop: lead-acid's bench (auditable ext/leadacid/bench.js) mocks the
// native layer under the real shim, validates every intent against the plugin's schema and records it. The event, timer
// and alarm cards hand their fields over; a phone with no app for one says so; the packs drawer knows the app has no network. Skipped without the sibling clone.
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
// this "phone" has no alarm app; its recognizer hears "2 km in miles"
await ctx.addInitScript(() => { window.__benchFixtures = { intent: { 'clock.alarm': false }, speech: { script: [[120, 'partial', { text: '2 km' }], [120, 'result', { alternatives: [{ text: '2 km in miles', confidence: 0.93 }] }]] } }; });
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
// saving: the WebView drops downloads, so the event's .ics is published to Downloads through the shell
await page.fill('#q', 'remind me to call the lab on friday at 9'); await page.press('#q', 'Enter'); await page.waitForTimeout(150);
await page.locator('#stream .card').last().locator('[data-act="save"]').click(); await page.waitForTimeout(300);
const pub = await page.evaluate(() => { const p = window.__bench.published.slice(-1)[0]; return p && { name: p.name, collection: p.collection, mime: p.mime, text: new TextDecoder().decode(p.bytes) }; });
check(pub && pub.name === 'call-the-lab.ics' && pub.collection === 'Downloads' && pub.mime === 'text/calendar' && /BEGIN:VCALENDAR/.test(pub.text), `Save .ics publishes to Downloads (${pub && pub.name}, ${pub && pub.collection})`);
// voice: the mic fills the box with what the on-device recognizer heard and runs nothing; "say" reads a card aloud
// with an offline voice; "read every answer aloud" speaks each new card
await page.fill('#q', ''); const cardsBefore = await page.locator('#stream .card').count();
check(await page.isVisible('#mic'), 'the mic shows where the phone has an offline recognizer');
await page.click('#mic'); await page.waitForTimeout(600);
const heard = await page.inputValue('#q'), speechReq = await page.evaluate(() => window.__bench.speech.slice(-1)[0] || null);
check(heard === '2 km in miles' && (await page.locator('#stream .card').count()) === cardsBefore && speechReq && speechReq.lang === 'en-US', `the mic puts what it heard in the box and runs nothing (${JSON.stringify(heard)})`);
await page.press('#q', 'Enter'); await page.waitForTimeout(200);
const last = page.locator('#stream .card').last();
await last.locator('[data-act="say"]').click(); await page.waitForTimeout(200);
const spoken = await page.evaluate(() => window.__bench.spoken.slice(-1)[0] || null);
check(spoken && /1\.24274/.test(spoken.text) && !/@gcu/.test(spoken.text), `say reads the answer aloud, without its sources (${spoken && spoken.text})`);
await page.evaluate(() => document.querySelector('[data-tab="packs"]').click()); await page.waitForTimeout(150);
await page.click('#say-all'); await page.evaluate(() => document.querySelector('[data-tab="ask"]').click());
const n0 = await page.evaluate(() => window.__bench.spoken.length);
await page.fill('#q', '25 c in f'); await page.press('#q', 'Enter'); await page.waitForTimeout(300);
check((await page.evaluate(() => window.__bench.spoken.slice(-1)[0].text)).includes('77') && (await page.evaluate(() => window.__bench.spoken.length)) === n0 + 1, 'with "read every answer aloud" a new card is spoken');

// "Open with golem": a CSV shared to the running app opens as a table, as the paperclip would; shared text goes in the box
await page.evaluate(() => {
  const csv = 'hole,from,to,cu\nA,0,1,0.5\nA,1,2,0.7\nB,0,1,1.1\n', bytes = new TextEncoder().encode(csv);
  window.__bench.files['share:assays-mine.csv'] = bytes;
  window.__bench.intake([{ kind: 'file', token: 'share:assays-mine.csv', name: 'assays-mine.csv', size: bytes.length, mime: 'text/csv' }]);
});
await page.waitForTimeout(600);
const shared = await page.locator('#stream .card').last().textContent();
check(/assays-mine\.csv/.test(shared) && /3 samples|3 rows/.test(shared), `a CSV shared to the app opens as a table (${shared.replace(/\s+/g, ' ').slice(0, 80)})`);
await page.evaluate(() => window.__bench.intake([{ kind: 'text', text: 'mean cu by hole' }])); await page.waitForTimeout(300);
check(await page.inputValue('#q') === 'mean cu by hole', 'shared text goes into the box, not run');
await page.fill('#q', '');

// field capture: a plane from the phone's fused orientation (the bench's synthetic rotation vector), and one position fix
await page.fill('#q', 'measure bedding'); await page.press('#q', 'Enter'); await page.waitForTimeout(700);
const cap = page.locator('#stream .card').last();
check(/\d{3}\/\d{2}\s*magnetic/.test(await cap.locator('.capture .live').textContent()), `a card waiting for a plane shows the compass live (${(await cap.locator('.capture .live').textContent()).trim()})`);
await cap.locator('[data-act="take"]').click(); await page.waitForTimeout(200);
check(/measured bedding with the phone/.test(await cap.textContent()) && /dip direction\/dip \(magnetic\)/.test(await cap.textContent()) && !(await cap.locator('.capture').count()), 'Take reading turns it into the measured plane');
await page.fill('#q', 'declination here'); await page.press('#q', 'Enter'); await page.waitForTimeout(200);
const hereCard = page.locator('#stream .card').last();
await hereCard.locator('[data-act="take"]').click(); await page.waitForTimeout(1600);
check(/declination at -23\.52, -46\.19 here, ±5 m/.test(await hereCard.textContent()), `Use my position takes one fix into the card (${(await hereCard.locator('.read').textContent()).replace(/\s+/g, ' ')})`);

// the app has no network permission: no service worker, no library buttons, packs through the paperclip
await page.evaluate(() => document.querySelector('[data-tab="packs"]').click()); await page.waitForTimeout(200);
const drawer = await page.textContent('#v-packs');
check(/Installed as an Android app/.test(drawer) && !/Install from the library|Check for updates/.test(drawer) && /open it with the paperclip/.test(drawer), 'in the app the drawer offers the paperclip, not the library or updates');
check((await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))) === 0, 'in the app no service worker is registered');
errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close(); server.close();
if (failed || errors.length) { console.log('\nleadacid test failed'); process.exit(1); }
console.log('\nleadacid test passed');

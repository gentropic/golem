// The installable app (SPEC 13.11), in a browser: dist/ served over http://localhost (a secure context, so the worker
// registers), the manifest, the worker taking control, golem answering offline after a reload, and an update that
// arrives only when "Check for updates" is pressed. Run with `npm test`; set CHROMIUM_PATH as for the smoke test.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
let html = readFileSync(join(dist, 'golem.html'), 'utf8'), hits = [];
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '') || 'golem.html';
  hits.push(path);
  if (path === 'golem.html') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }); res.end(html); return; }
  const f = join(dist, path); if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext(), page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));

await page.goto(base + 'golem.html');
const man = await (await page.request.get(base + 'manifest.webmanifest')).json();
check(man.display === 'standalone' && man.icons.some(i => i.purpose === 'maskable') && man.start_url === './golem.html', 'the manifest: standalone, a maskable icon, golem.html as the start');
check(await page.evaluate(() => !!document.querySelector('link[rel="manifest"]')), 'the page links the manifest');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); await page.waitForTimeout(300);
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the worker installs and controls the page after one reload');

// offline: the shell comes from the worker's cache, and golem answers
await ctx.setOffline(true); hits = [];
await page.reload(); await page.waitForTimeout(400);
await page.fill('#q', '2 km in miles'); await page.press('#q', 'Enter'); await page.waitForTimeout(200);
const offline = await page.locator('#stream .card').last().textContent();
check(offline.includes('1.24274') && hits.length === 0, `offline: the page loads from the cache and answers (${hits.length} requests reached the server)`);
await ctx.setOffline(false);

// a new golem on the server changes nothing until "Check for updates"
html = html.replace('<title>GCU golem</title>', '<title>GCU golem (new)</title>'); hits = [];
await page.reload(); await page.waitForTimeout(300);
check((await page.title()) === 'GCU golem' && !hits.includes('golem.html'), 'a reload keeps the cached golem; the new one is not fetched on its own');
await page.click('nav [data-tab="packs"]').catch(() => {}); await page.evaluate(() => { const b = document.querySelector('[data-tab="packs"]'); if (b) b.click(); });
await page.click('#sw-check'); await page.waitForSelector('#sw-apply', { timeout: 10000 }).catch(() => {});
const req = await page.textContent('#st-req');
check(await page.isVisible('#sw-apply') && req === '1 request', `"Check for updates" finds the new golem and the header counts the request (${req})`);
await Promise.all([page.waitForEvent('load'), page.click('#sw-apply')]); await page.waitForTimeout(300);
check((await page.title()) === 'GCU golem (new)', 'reloading applies it');

// the installed app's shortcut: ?new opens a new session and drops the query from the address
const before = await page.evaluate(() => document.querySelectorAll('#dlist [data-s]').length);
await page.goto(base + 'golem.html?new'); await page.waitForTimeout(300);
const after = await page.evaluate(() => document.querySelectorAll('#dlist [data-s]').length);
check(page.url() === base + 'golem.html' && await page.isVisible('.welcome'), `the New session shortcut opens a new session (${before} → ${after} sessions listed)`);
errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close(); server.close();
if (failed || errors.length) { console.log('\npwa test failed'); process.exit(1); }
console.log('\npwa test passed');

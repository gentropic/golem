// Sharing a session so it can be checked: the session file and the notebook are signed with this device's key (a
// WebCrypto key kept in IndexedDB, in a browser), and opened again they say whether they are unchanged; a file edited
// after it was signed says so. The notebook carries the session in its metadata and comes back as it. Served on
// localhost (IndexedDB and WebCrypto as a person's browser has them). Run with `npm test`; CHROMIUM_PATH as for smoke.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const server = createServer(async (q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(DIST, p)); r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/golem.html`;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const dir = await mkdtemp(join(tmpdir(), 'golem-share-'));
await page.goto(url); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(200);
const ask = async q => { await page.fill('#q', q); await page.press('#q', 'Enter'); await page.waitForTimeout(250); };
const status = () => page.textContent('#status');
const download = async click => { const [d] = await Promise.all([page.waitForEvent('download'), click()]); const p = join(dir, d.suggestedFilename()); await d.saveAs(p); return { p, text: await readFile(p, 'utf8'), name: d.suggestedFilename() }; };

await ask('new session'); await ask('2 km in miles'); await ask('how long to drill 300 m at 25 m/h');
// the notebook: Markdown and code cells, the session in its metadata, signed
await ask('export as notebook');
const nb = await download(() => page.locator('#stream .card').last().locator('[data-act="save"]').dispatchEvent('click'));
const j = JSON.parse(nb.text), g = j.metadata.golem;
check(/\.ipynb$/.test(nb.name) && j.nbformat === 4 && j.cells.some(c => c.cell_type === 'code') && j.cells.some(c => c.cell_type === 'markdown' && c.source.join('').includes('300 m ÷ 25 m/h = 12 h')), `a notebook with the cards as cells (${nb.name}, ${j.cells.length} cells)`);
check(g && g.golem === 'session' && g.signature && g.signature.alg === 'ECDSA-P256-SHA256' && /browser/.test(g.signature.security), 'the notebook carries the session, signed with this browser\'s key');
// opened again: the session comes back, signed and unchanged
await page.setInputFiles('#file', nb.p); await page.waitForTimeout(800);
check(/Signed by key [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} \(browser.*unchanged since it was signed/.test(await status()), `the notebook opens as its session, signed and unchanged (${(await status()).slice(0, 90)})`);
check(/12/.test(await page.locator('#stream .card').nth(1).textContent()), 'and its cards are recomputed');
// edited after signing: said
g.session.cards[0].args.n = 3; await writeFile(join(dir, 'edited.ipynb'), JSON.stringify(j));
await page.setInputFiles('#file', join(dir, 'edited.ipynb')); await page.waitForTimeout(800);
check(/signature does not match: the file was changed after key/.test(await status()), 'a notebook edited after it was signed says so');
// the session file from the drawer: signed too; the fingerprint under Packs is the one the import named
const sid = await page.evaluate(() => { const b = document.querySelector('[data-exp]'); return b && b.dataset.exp; });
const sf = await download(() => page.evaluate(id => document.querySelector(`[data-exp="${id}"]`).click(), sid));
check(/\.golem\.json$/.test(sf.name) && JSON.parse(sf.text).signature, `the session file is signed (${sf.name})`);
await page.setInputFiles('#file', sf.p); await page.waitForTimeout(800);
const fp = (/key ([0-9a-f ]{19})/.exec(await status()) || [])[1];
await page.evaluate(() => document.querySelector('[data-tab="packs"], #tab-packs') && document.querySelector('[data-tab="packs"], #tab-packs').click());
await page.waitForTimeout(600);
check(fp && (await page.textContent('#v-packs')).includes(fp), `Packs shows this device's key, the one that signed (${fp})`);

errors.forEach(e => console.log('FAIL page error: ' + e));
await browser.close(); server.close();
if (failed || errors.length) { console.log('\nshare test failed'); process.exit(1); }
console.log('\nshare test passed');

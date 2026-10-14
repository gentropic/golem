// The shell: wiring, tabs, the session drawer, storage, and the sleep switch. Everything that touches
// the DOM or the browser lives here or in render.js; the engine never does.
import { S } from '../engine/core.js';
import { submit, flipSlot, answer, seedExamples, openFile, openBinary, openStreamed, preview } from '../engine/engine.js';
import { scanTable, STREAM_OVER } from '../engine/stream.js';
import { completions } from '../engine/reading.js';
import { useFactbook, factbookInfo } from '../engine/factbook.js';
import { factbookFromGcudat, factbookProfiles, readGcudat, compileOds, compileStrunk } from '../engine/packs.js';
import { useBook, bookInfo } from '../engine/books.js';
import { BINARY } from '../engine/formats.js';
import { setRunner, onJobDone } from '../engine/core.js';
import { sessions, current, newSession, openSession, renameSession, deleteSession, searchHistory, parts, hydrate, onChange, exportSession, importSession } from '../engine/sessions.js';
import { openStore, putBlob, getBlob } from './store.js';
import { skills, PACKS, STARTERS } from '../engine/skills.js';
import { shell } from '../vendor/leadacid.js';
import { escHtml, pad, cardEl } from './render.js';
import { registerGcuSw } from '../vendor/sw-register.js';

const $ = id => document.getElementById(id);
const THEME = 'golem.theme', FOLD = 'golem.side';
const narrow = () => window.matchMedia('(max-width: 860px)').matches;
let awake = true, statusT;

function status(msg) { $('status').textContent = msg; clearTimeout(statusT); statusT = setTimeout(() => { $('status').textContent = ''; }, 5000); }
function showTab(t) {
  ['ask', 'skills', 'packs', 'about'].forEach(k => { $('v-' + k).hidden = k !== t; });
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('.navbtn[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t));
}
function tick() {
  document.querySelectorAll('[data-end]').forEach(el => {
    const s = Math.ceil((+el.dataset.end - Date.now()) / 1000);
    el.textContent = s <= 0 ? 'done' : String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  });
}
setInterval(tick, 500);

/* ── the stream ── */
function renderBar() { $('sname').textContent = current().name; }
function renderStream(focus) {
  $('stream').innerHTML = '';
  S.cards.forEach(c => $('stream').appendChild(cardEl(c)));
  $('exlbl').hidden = !current().example; welcome(); tick(); renderBar(); renderPacks(); showTab('ask');
  const el = focus && $('stream').querySelector(`[data-id="${focus}"]`);
  if (el) el.scrollIntoView({ block: 'start' }); else $('v-ask').scrollTop = S.cards.length > 1 ? $('v-ask').scrollHeight : 0;
}
function welcome() { $('welcome').hidden = S.cards.length > 0; }
function replaceCard(c, focusKey) {
  const old = $('stream').querySelector(`[data-id="${c.id}"]`); if (!old) return;
  const open = !!old.querySelector('details.trace[open]'), fresh = cardEl(c);
  old.dataset.rung = fresh.dataset.rung; old.replaceChildren(...fresh.childNodes);
  if (open) old.querySelector('details.trace').open = true;
  if (focusKey) { const s = old.querySelector(`.slot[data-key="${focusKey}"]`); if (s) s.focus({ preventScroll: true }); }
}
let ready = false;   // the device state is back (see the start, below): until then a query would land in a session about to be replaced
function run(raw) {
  if (!ready) { status('Opening your sessions…'); return; }
  if (!awake) { status('Asleep. Tap wake at the top right.'); return; }
  show(submit(raw));
}
function show(o) {
  switch (o.kind) {
    case 'new-session': renderStream(); status('New session.'); break;
    case 'recipe': renderStream(); status(o.msg); break;
    case 'drawer': openDrawer(); break;
    case 'rename': status(`Session named “${o.name}”.`); break;
    case 'answered': replaceCard(o.card); status(`Answered #${pad(o.card.id)}: ${o.label}`); break;
    case 'undo': { const el = $('stream').querySelector(`[data-id="${o.card.id}"]`); if (el) el.remove(); welcome(); status(`Removed #${pad(o.card.id)}: ${o.card.raw}`); break; }
    case 'nothing': status(o.msg); break;
    case 'card': { const el = cardEl(o.card); $('stream').appendChild(el); welcome(); showTab('ask'); el.scrollIntoView({ block: 'start', behavior: 'smooth' }); break; }
  }
  tick(); renderPacks();
}

/* ── catalog and packs ── */
function renderSkills() {
  const rows = skills(), live = rows.filter(s => s.live).length; let h = `<h1 class="vhead">Skills</h1><div class="sub">${live} skills run here. ${rows.length - live} more are planned from packages that already exist or are named here. Tap an example to run it.</div>`, g = '';
  rows.forEach(s => {
    if (s.group !== g) { h += `<div class="lbl">${escHtml(s.group)}</div>`; g = s.group; }
    h += `<div class="item"><h3>${escHtml(s.title)} <span class="tag ${s.live ? 'live' : 'plan'}">${s.live ? 'live' : 'planned'}</span></h3><p>${escHtml(s.about)}</p><div class="from">${escHtml(s.on)}</div>${s.examples.length ? `<div class="opts">${s.examples.map(x => `<button class="chip" type="button" data-q="${escHtml(x)}" style="white-space:normal;text-align:left">${escHtml(x)}</button>`).join('')}</div>` : ''}</div>`;
  });
  $('v-skills').innerHTML = h;
}
// The installed app (SPEC 13.11). A service worker keeps golem.html, the manifest and the icons for offline use and makes
// no request on its own; "Check for updates" asks it to, and the header counts that request (principle 6). Opened as a
// file there is no worker, and nothing to install or update. Inside the lead-acid shell (the Android app) there is none either:
// the app has no network permission, a new version is a new APK, and the library is reached through .gcudat files.
const inApp = shell.present;
const OFFLINE_APP = 'This app has no network permission, so the library is out of reach from here: download the .gcudat from gcu-library in a browser and open it with the paperclip.';
let requests = 0, update = { at: null, ready: false, note: '' };
// Saving a file: a download in a browser; in the app (whose WebView drops downloads) lead-acid publishes it to Downloads,
// under the name Android gave it ("x (1).ics" when x.ics is there).
async function saveFile(name, data, mime) {
  if (inApp) {
    try { const r = await shell.publish(name, typeof data === 'string' ? new TextEncoder().encode(data) : data, { collection: 'Downloads', mime }); status(`Saved ${r.name || name} to Downloads.`); }
    catch (e) { status(`Not saved: ${e.message}`); }
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); status(`Saved ${name}.`);
}
const countRequest = () => { requests++; $('st-req').textContent = `${requests} request${requests === 1 ? '' : 's'}`; };
const sw = inApp ? { supported: false, checkNow: async () => null, applyUpdate() {} } : registerGcuSw({ url: 'sw.js', persist: true, onUpdateAvailable: () => { update.ready = true; renderPacks(); } });
async function checkUpdates() {
  countRequest(); update.note = 'Checking…'; renderPacks();
  const r = await sw.checkNow();
  update.at = Date.now();
  update.note = !r ? 'No worker controls this page yet. Reload once, then check again.' : r.changed ? '' : 'golem is up to date.';
  if (r && r.changed) update.ready = true;
  renderPacks();
}
function appItem() {
  if (inApp) return '<div class="item"><h3>This app</h3><p>Installed as an Android app through lead-acid. It has no network permission and checks for nothing: a new version comes as a new APK.</p></div>';
  if (!sw.supported) return '<div class="item"><h3>This app</h3><p>Opened as a file, so there is nothing to install or update. Served over https, golem installs as an app and works offline.</p></div>';
  const at = update.at ? ` Last checked ${new Date(update.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : '';
  return `<div class="item"><h3>This app</h3><p>Kept on this device and works offline. It looks for a new version only when you ask; that is one request to where golem came from.${at}</p>`
    + `<div class="opts">${update.ready ? '<button class="btn go" type="button" id="sw-apply">Reload to the new golem</button>' : '<button class="btn" type="button" id="sw-check">Check for updates</button>'}${update.note ? `<span class="sub">${escHtml(update.note)}</span>` : ''}</div></div>`;
}
// The Factbook pack (SPEC 13.8), installed on request: from gcu-library (one request for its registry, one per pack, each
// checked against the registry's SHA-256) or from a .gcudat file opened with the paperclip. Kept by store.js under /packs/.
const LIBRARY = 'https://gentropic.org/gcu-library/';
let packNote = '', packBusy = false;
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
async function fetchPack(entry) {
  countRequest();
  const r = await fetch(new URL(entry.url, LIBRARY)); if (!r.ok) throw new Error(`the library answered ${r.status} for ${entry.name}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (entry.integrity && crypto.subtle) { const want = entry.integrity.replace(/^sha256-/, ''), got = b64(await crypto.subtle.digest('SHA-256', bytes)); if (got !== want) throw new Error(`${entry.name} did not match the registry's checksum, so it was not installed`); }
  return bytes;
}
// the library's registry (one request): a lookup of its entries by name
async function registry() {
  countRequest();
  const reg = await (await fetch(new URL('registry.json', LIBRARY))).json(), list = reg.packs || reg.entries || reg;
  return n => (Array.isArray(list) ? list : Object.values(list)).find(e => e && e.name === n);
}
async function installFactbook(full) {
  if (packBusy) return; packBusy = true; packNote = 'Installing…'; renderPacks();
  try {
    const find = await registry();
    const fb = find('factbook'), ff = full ? find('factbook-full') : null; if (!fb || (full && !ff)) throw new Error('the library lists no factbook pack');
    const pack = await factbookFromGcudat(await fetchPack(fb), ff ? await fetchPack(ff) : null);
    await keepFactbook(pack);
  } catch (e) { packNote = `Not installed: ${e.message}.`; }
  packBusy = false; renderPacks();
}
async function keepFactbook(pack) {
  await store.writePack('factbook', pack);
  const i = useFactbook(pack); packNote = `Installed: ${i.count} countries${pack.profiles ? ', with the full profiles' : ''}.`; status(packNote);
}
// the book packs: compiled at install into the index golem uses (packs.js), kept, handed to books.js
const BOOKS = {
  ods: { compile: compileOds, size: '1.9 MB', sample: 'A sample term index ships: where a term is defined, without the passage.', installed: i => `Installed: ${i.count} terms with their defining passages.`, removed: 'Removed. The sample term index answers again.' },
  'elements-of-style': { compile: compileStrunk, size: '36 kB', sample: 'A sample of rules 10, 11 and 13 ships.', installed: i => `Installed: ${i.count} checks from its rules and chapter V.`, removed: 'Removed. The sample checks answer again.' },
};
const bookNote = {};
async function keepBook(slug, compiled) { await store.writePack(slug, compiled); bookNote[slug] = BOOKS[slug].installed(useBook(slug, compiled)); status(bookNote[slug]); }
async function installBook(slug) {
  if (packBusy) return; packBusy = true; bookNote[slug] = 'Installing…'; renderPacks();
  try { const e = (await registry())(slug); if (!e) throw new Error(`the library lists no ${slug} pack`); await keepBook(slug, await BOOKS[slug].compile(await fetchPack(e))); }
  catch (err) { bookNote[slug] = `Not installed: ${err.message}.`; }
  packBusy = false; renderPacks();
}
async function removeBook(slug) { await store.removePack(slug); useBook(slug, null); bookNote[slug] = BOOKS[slug].removed; renderPacks(); }
function bookItem(slug) {
  const i = bookInfo(slug), B = BOOKS[slug];
  const acts = i.kind === 'sample' ? (inApp ? `<span class="sub">${OFFLINE_APP}</span>` : `<button class="btn go" type="button" data-pk-install="${slug}">Install from the library (${B.size})</button>`) : `<button class="btn" type="button" data-pk-remove="${slug}">Remove</button>`;
  return `<p>${i.kind === 'sample' ? B.sample : `Installed: version ${escHtml(i.version || '')}, kept on this device.`}</p><div class="opts">${store && store.kind === 'idb' ? acts : '<span class="sub">This browser gives golem no IndexedDB, so a pack cannot be kept.</span>'}${bookNote[slug] ? `<span class="sub">${escHtml(bookNote[slug])}</span>` : ''}</div>`;
}
async function removeFactbook() { await store.removePack('factbook'); useFactbook(null); packNote = 'Removed. The 14-country sample answers again.'; renderPacks(); }
// a .gcudat opened with the paperclip: the factbook, or its full profiles for the factbook already installed
async function openPackFile(name, bytes) {
  const p = await readGcudat(bytes);
  if (p.manifest.name === 'factbook') return keepFactbook(await factbookFromGcudat(bytes));
  if (BOOKS[p.manifest.name]) return keepBook(p.manifest.name, await BOOKS[p.manifest.name].compile(bytes));
  if (p.manifest.name === 'factbook-full') {
    const cur = await store.readPack('factbook'); if (!cur) throw new Error('install the factbook pack first; these are its full profiles');
    return keepFactbook({ ...cur, profiles: await factbookProfiles(bytes) });
  }
  throw new Error(`golem has no use for the ${p.manifest.name} pack yet`);
}
function factbookItem() {
  const i = factbookInfo();
  const state = i.kind === 'sample' ? 'The 14-country sample ships with golem.' : `Installed: version ${escHtml(i.version)}, ${i.count} countries${i.profiles ? ', with the full profiles' : ''}. Kept on this device.`;
  const acts = inApp ? `${i.kind === 'sample' ? '' : '<button class="btn" type="button" id="fb-remove">Remove</button>'}<span class="sub">${OFFLINE_APP}</span>`
    : i.kind === 'sample'
    ? `<button class="btn go" type="button" id="fb-install">Install from the library (2.8 MB)</button><button class="btn" type="button" id="fb-install-full">With full profiles (5.1 MB)</button>`
    : `${i.profiles ? '' : '<button class="btn" type="button" id="fb-install-full">Add the full profiles (5.1 MB)</button>'}<button class="btn" type="button" id="fb-remove">Remove</button>`;
  return `<p>${state}${inApp ? '' : ' Installing makes one request to the library for its list and one per pack; a .gcudat file opened with the paperclip installs with none.'}</p><div class="opts">${store && store.kind === 'idb' ? acts : '<span class="sub">This browser gives golem no IndexedDB, so a pack cannot be kept.</span>'}${packNote ? `<span class="sub">${escHtml(packNote)}</span>` : ''}</div>`;
}
function renderPacks() {
  const lab = { live: 'installed', samp: 'sample', plan: 'not wired' };
  let h = '<h1 class="vhead">Packs and this device</h1><div class="sub">golem knows what its installed packs hold. These are the gcu-library entries plus packs worth adding.</div><div class="lbl">Library</div>';
  const fbi = factbookInfo();
  PACKS.forEach(([id, name, meta, st, d]) => {
    if (id === 'factbook') st = fbi.kind === 'sample' ? 'samp' : 'live';
    if (id === 'factbook-full') st = fbi.kind === 'pack' && fbi.profiles ? 'live' : 'plan';
    if (BOOKS[id]) st = bookInfo(id).kind === 'pack' ? 'live' : 'samp';
    h += `<div class="item"><h3>${escHtml(name)} <span class="tag ${st}">${lab[st]}</span></h3><p>${escHtml(d)}</p>${id === 'factbook' ? factbookItem() : BOOKS[id] ? bookItem(id) : ''}<div class="from">${escHtml(id)} · ${escHtml(meta)}</div></div>`;
  });
  const al = Object.entries(S.aliases);
  h += `<div class="lbl">On this device</div><div class="item"><h3>Taught words</h3><p>${al.length ? al.map(([k, v]) => `${escHtml(k)} → ${escHtml(v)}`).join('<br>') : 'None yet. Try “pop means population”.'}</p></div><div class="item"><h3>Notes</h3><p>${S.facts.length ? S.facts.map(escHtml).join('<br>') : 'None yet. Try “remember that …”.'}</p></div><div class="item"><h3>Open table</h3><p>${S.table ? `${escHtml(S.table.name)} · ${S.table.rows.length} rows · ${S.table.source === 'sample' ? 'sample data' : 'from your files'}` : 'None.'}</p></div><div class="item"><h3>Files on this device</h3><p>${Object.values(S.files).length ? Object.values(S.files).map(f => `${escHtml(f.name)} · ${(f.size / 1024).toFixed(0)} kB`).join('<br>') : 'None yet. Tap the paperclip to open a CSV.'}</p></div>`;
  h += appItem();
  $('v-packs').innerHTML = h;
  for (const [id, fn] of [['fb-install', () => installFactbook(false)], ['fb-install-full', () => installFactbook(true)], ['fb-remove', removeFactbook]]) { const b = $(id); if (b) b.addEventListener('click', fn); }
  const ck = $('sw-check'), ap = $('sw-apply');
  if (ck) ck.addEventListener('click', checkUpdates);
  if (ap) ap.addEventListener('click', () => sw.applyUpdate());
}

/* ── the drawer: sessions and history ── */
let ren = null, del = null;
const when = t => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
function renderDrawer() {
  const q = $('hq').value.trim(); let h;
  if (q) {
    const hits = searchHistory(q);
    h = `<div class="lbl">${hits.length} match${hits.length === 1 ? '' : 'es'} in history</div>` + hits.slice(0, 40).map(({ session: s, card: c }) => `<div class="srow"><button class="open hit" type="button" data-s="${s.id}" data-c="${c.id}">&gt; ${escHtml(c.raw)}</button><div class="meta"><span>${escHtml(s.name)}</span></div></div>`).join('');
  } else {
    const cur = current(), day = 864e5, today = new Date().setHours(0, 0, 0, 0), age = t => t >= today ? 'Today' : t >= today - 6 * day ? 'This week' : 'Earlier';
    let g = ''; h = '';
    [...sessions()].sort((x, y) => y.updated - x.updated || y.id - x.id).forEach(s => {
      if (age(s.updated) !== g) { g = age(s.updated); h += `<div class="lbl">${g}</div>`; }
      const name = ren === s.id ? `<input class="ren" data-id="${s.id}" value="${escHtml(s.name)}" aria-label="Session name. Leave empty to name it automatically.">` : `<button class="open" type="button" data-s="${s.id}" title="${escHtml(s.name)}">${escHtml(s.name)}</button>`;
      h += `<div class="srow" aria-current="${s === cur}">${name}<div class="meta"><span>${s.cards.length} card${s.cards.length === 1 ? '' : 's'} · ${when(s.updated)}</span>${s.example ? '<span class="tag samp">example</span>' : ''}<span class="acts"><button class="link" type="button" data-ren="${s.id}">rename</button><button class="link" type="button" data-exp="${s.id}">export</button><button class="link" type="button" data-del="${s.id}">${del === s.id ? 'confirm delete' : 'delete'}</button></span></div></div>`;
    });
  }
  $('dlist').innerHTML = h;
  const i = $('dlist').querySelector('.ren'); if (i) { i.focus(); i.select(); }
}
// on a wide screen the sidebar is always there; on a narrow one it slides over the stream
function openDrawer() { ren = del = null; renderDrawer(); if (narrow()) $('app').classList.add('nav'); else { fold(false); $('hq').focus(); } }
function closeDrawer() { $('app').classList.remove('nav'); }
function fold(on) { $('app').classList.toggle('folded', on); try { localStorage.setItem(FOLD, on ? 'folded' : 'open'); } catch (e) { /* storage is optional */ } }
function toggleSide() { if (narrow()) { if ($('app').classList.contains('nav')) closeDrawer(); else openDrawer(); } else fold(!$('app').classList.contains('folded')); }
try { if (localStorage.getItem(FOLD) === 'folded') $('app').classList.add('folded'); } catch (e) { /* storage is optional */ }
function commitName(inp) { ren = null; renameSession(+inp.dataset.id, inp.value); renderDrawer(); }

/* ── storage ── */
// saved on the device through store.js (@gcu/vfs over IndexedDB): a moment after each change, and at once when the page
// is hidden, so a closed tab keeps its last card
// (a moment after the last change, but never more than a second behind while changes keep coming)
let store = null, saveT = 0, firstUnsaved = 0;
function persist() {
  if (!store) return;
  store.journal(parts());
  const now = Date.now(); if (!firstUnsaved) firstUnsaved = now;
  clearTimeout(saveT); saveT = setTimeout(() => { firstUnsaved = 0; store.save(parts()); }, now - firstUnsaved > 1000 ? 0 : 80);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && store) { clearTimeout(saveT); firstUnsaved = 0; store.save(parts()); } });
onChange(() => { renderBar(); persist(); if (!$('hq').value.trim() && ren == null) renderDrawer(); });

/* ── theme: auto follows the system; a choice is kept on this device ── */
const THEMES = ['auto', 'light', 'dark'];
let theme = 'auto';
function applyTheme(t) { if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; $('theme-k').textContent = t; }
try { const t = localStorage.getItem(THEME); if (THEMES.includes(t)) theme = t; } catch (e) { /* storage is optional */ }
applyTheme(theme);
$('theme').addEventListener('click', () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; applyTheme(theme); try { localStorage.setItem(THEME, theme); } catch (e) { /* storage is optional */ } });

/* ── wiring ── */
/* ── Python: adder in a fresh Web Worker per run, built from the page itself; no network ── */
const PY_WORKER_SRC = /*__PY_WORKER__*/'';
setRunner('python', req => new Promise(done => {
  if (!PY_WORKER_SRC || typeof Worker === 'undefined') { done({ stdout: '', stderr: '', value: null, error: { type: 'RunnerError', message: 'this page has no Python worker', line: null }, ms: 0, trace: null }); return; }
  const url = URL.createObjectURL(new Blob([PY_WORKER_SRC], { type: 'text/javascript' })), w = new Worker(url);
  const end = r => { clearTimeout(kill); w.terminate(); URL.revokeObjectURL(url); done(r); };
  const kill = setTimeout(() => end({ stdout: '', stderr: '', value: null, error: { type: 'BudgetExceeded', message: `no answer in ${req.ms / 1000 + 1} s, so the worker was stopped`, line: null }, ms: req.ms + 1000, trace: null }), req.ms + 1000);
  w.onmessage = e => end(e.data);
  w.onerror = e => { e.preventDefault(); end({ stdout: '', stderr: '', value: null, error: { type: 'RunnerError', message: e.message || 'the worker failed', line: null }, ms: 0, trace: null }); };
  w.postMessage(req);
}));
onJobDone(c => { replaceCard(c); });
// scans of large tables: over the File just picked, or the Blob kept for it (SPEC 13.7)
const BIG = {};
setRunner('scan', async req => { const b = BIG[req.hash] || (BIG[req.hash] = await getBlob(req.hash)); if (!b) return { error: 'not kept' }; return scanTable(() => b.stream(), req); });

$('f').addEventListener('submit', e => { e.preventDefault(); const v = $('q').value; $('q').value = ''; grow(); updatePreview(); run(v); });
function grow() { const q = $('q'); q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, window.innerHeight * 0.4) + 'px'; }
$('q').addEventListener('input', grow);
let recall = -1;
$('q').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); recall = -1; $('f').requestSubmit(); return; }
  // Tab takes the first completion, only while a word is half typed: otherwise Tab moves on, as it should
  if (e.key === 'Tab' && !e.shiftKey && !$('sg').hidden && /\S$/.test($('q').value)) { const b = $('sg').querySelector('[data-w]'); if (b) { e.preventDefault(); complete(b.dataset.w); return; } }
  const q = $('q'), past = S.cards.map(c => c.raw);
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && past.length && (q.value === '' || recall >= 0) && !q.value.includes('\n')) {
    const i = e.key === 'ArrowUp' ? (recall < 0 ? past.length - 1 : Math.max(0, recall - 1)) : recall < 0 ? -1 : recall + 1;
    if (e.key === 'ArrowDown' && recall < 0) return;
    e.preventDefault(); recall = i < past.length ? i : -1; q.value = recall < 0 ? '' : past[recall]; grow(); updatePreview();
    q.setSelectionRange(q.value.length, q.value.length);
  }
});
$('q').addEventListener('input', () => { recall = -1; });
// As you type: what golem would read (the echo, dry: nothing runs), and what may come next. A reading that would be
// "no reading" shows nothing; the card says that, with reasons, when it is run.
let pvTimer = 0;
function updatePreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    const v = $('q').value, pv = $('pv'), sg = $('sg');
    let p = null, c = [];
    if (awake && v.trim()) { try { p = preview(v); } catch (e) { p = null; } if (!v.includes('\n')) c = completions(v); }
    pv.hidden = !p;
    if (p) {
      pv.dataset.rung = p.rung;
      const text = p.rung === 'ambiguous' ? `${p.readings.length} readings: ${p.readings.join(' | ')}` : p.rung === 'partial' ? `so far: ${p.echo}` : p.echo;
      pv.querySelector('span').textContent = text; pv.title = text;
    }
    sg.hidden = !c.length;
    sg.innerHTML = c.map(x => `<button type="button" class="chip" data-w="${escHtml(x.word)}" title="${escHtml(x.kind.replace(/^role:/, ''))}">${escHtml(x.word)}</button>`).join('');
  }, 90);
}
function complete(w) { const q = $('q'); q.value = q.value.replace(/\S*$/, '') + w + ' '; grow(); q.focus(); q.setSelectionRange(q.value.length, q.value.length); updatePreview(); }
$('q').addEventListener('input', updatePreview);
$('sg').addEventListener('mousedown', e => e.preventDefault());   // the textarea keeps the focus
$('sg').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) complete(b.dataset.w); });
function newBlank() { newSession(); renderStream(); renderDrawer(); closeDrawer(); status('New session.'); $('q').focus(); }
const typing = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === 'Escape') { if ($('app').classList.contains('nav')) closeDrawer(); else if (document.activeElement === $('hq') && $('hq').value) { $('hq').value = ''; renderDrawer(); } else if (document.activeElement !== $('q')) $('q').focus(); return; }
  if (mod && e.shiftKey && k === 'o') { e.preventDefault(); newBlank(); return; }
  if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); openDrawer(); $('hq').focus(); $('hq').select(); return; }
  if (mod && !e.shiftKey && (k === 'b' || e.key === '\\')) { e.preventDefault(); toggleSide(); return; }
  if (!mod && !e.altKey && e.key === '/' && !typing(document.activeElement)) { e.preventDefault(); showTab('ask'); $('q').focus(); }
});
// a file from the picker (the lead-acid shell routes <input type=file> to the system picker): text in, a card out
$('attach').addEventListener('click', () => { if (awake) $('file').click(); });
$('file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (f.size > STREAM_OVER) {   // a text table too large to hold: kept as it is, typed from its head, scanned per question
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) { status(`That file is over 20 MB. golem streams large CSV and TSV tables; a ${f.name.split('.').pop()} that large is not read.`); e.target.value = ''; return; }
    f.slice(0, 1 << 20).text().then(async head => {
      const o = openStreamed(f.name, f.size, head); if (o.kind !== 'card') { show(o); return; }
      BIG[o.hash] = f; show(o); status(`Opened ${f.name} as a stream.`);
      await putBlob(o.hash, f).catch(() => status(`${f.name} could not be kept on this device; it works until the page closes.`));
    }, () => status('Could not read that file.'));
    e.target.value = ''; return;
  }
  if (/\.gcudat$/i.test(f.name)) {   // a pack: installed, not opened as a table
    f.arrayBuffer().then(buf => openPackFile(f.name, new Uint8Array(buf))).then(() => renderPacks(), err => status(`Not installed: ${err.message}.`));
    e.target.value = ''; return;
  }
  if (/\.golem\.json$/i.test(f.name)) {   // a session exported from golem: it comes back as a session of its own
    f.text().then(t => { let s = null; try { s = importSession(JSON.parse(t)); } catch (err) { s = null; } if (!s) { status('That is not a golem session file.'); return; } renderStream(); renderDrawer(); status(`Imported "${s.name}".`); }, () => status('Could not read that file.'));
    e.target.value = ''; return;
  }
  if (BINARY.test(f.name)) f.arrayBuffer().then(buf => openBinary(f.name, buf)).then(o => { show(o); if (o.kind === 'card') status(`Opened ${f.name}.`); }, () => status('Could not read that file.'));
  else f.text().then(text => { show(openFile(f.name, text)); status(`Opened ${f.name}.`); }, () => status('Could not read that file.'));
  e.target.value = '';
});
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
document.querySelector('.sfoot').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { showTab(b.dataset.tab); closeDrawer(); } });
$('starts').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) run(b.dataset.q); });
$('v-skills').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) run(b.dataset.q); });
$('v-packs').addEventListener('click', e => { const b = e.target.closest('[data-pk-install],[data-pk-remove]'); if (!b) return; if (b.dataset.pkInstall) installBook(b.dataset.pkInstall); else removeBook(b.dataset.pkRemove); });
$('stream').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const c = S.cards.find(x => x.id === +b.closest('.card').dataset.id), act = b.dataset.act;
  if (act === 'run') return run(b.dataset.q);
  if (!awake) return status('Asleep. Tap wake at the top right.');
  if (act === 'slot') { flipSlot(c, b.dataset.key); replaceCard(c, b.dataset.key); }
  else if (act === 'answer') { answer(c, +b.dataset.i); replaceCard(c); }
  else if (act === 'handoff') {
    // inside lead-acid: the allowlisted intent, the other app opens for the person to confirm; in a browser: what it would do
    const say = (text, kind) => { const n = document.createElement('div'); n.className = 'note ' + kind; n.textContent = text; b.replaceWith(n); };
    const send = b.dataset.send && JSON.parse(b.dataset.send);
    if (!shell.present || !send) { say(b.dataset.msg, 'ok'); return; }
    b.disabled = true;
    shell.intent.send(send.name, send.fields).then(() => say(`Handed to the other app (${send.name}). Confirm it there; nothing more comes back to golem.`, 'ok'),
      e => say(e && e.status === 503 ? `No app on this phone takes ${send.name}.` : e && e.status === 400 ? `The shell refused the ${e.field || 'request'}: ${e.message || ''}` : `The hand-off failed: ${(e && e.message) || e}`, 'err'));
  }
  else if (act === 'save' && c.res.file) {
    const f = c.res.file; saveFile(f.name, f.bytes || f.text, f.mime);
  }
  else if (act === 'copy') {
    const fail = () => { const p = document.createElement('pre'); p.textContent = c.res.copy; b.closest('.ans').appendChild(p); status('Copy was blocked here. The text is shown so you can select it.'); };
    try { navigator.clipboard.writeText(c.res.copy).then(() => status('Copied.'), fail); } catch (err) { fail(); }
  }
  tick(); renderPacks();
});
$('power').addEventListener('click', () => {
  awake = !awake; $('app').classList.toggle('asleep', !awake); $('st-on').textContent = awake ? 'awake' : 'asleep'; $('q').disabled = !awake;
  $('power').textContent = awake ? 'sleep' : 'wake'; $('power').setAttribute('aria-pressed', String(!awake));
  status(awake ? 'Awake.' : 'Asleep. Nothing runs until you wake it.');
});
$('menu').addEventListener('click', openDrawer);
$('sname').addEventListener('click', openDrawer);
$('dclose').addEventListener('click', closeDrawer);
$('scrim').addEventListener('click', closeDrawer);
$('newsess').addEventListener('click', newBlank);
$('newtop').addEventListener('click', newBlank);
$('fold').addEventListener('click', () => fold(true));
$('hq').addEventListener('input', renderDrawer);
$('hq').addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('dlist').querySelector('.open[data-s]'); if (b) { e.preventDefault(); b.click(); } } });
$('dlist').addEventListener('keydown', e => { if (e.target.classList.contains('ren') && e.key === 'Enter') commitName(e.target); });
$('dlist').addEventListener('focusout', e => { if (e.target.classList.contains('ren') && ren != null) commitName(e.target); });
$('dlist').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.s) { openSession(+b.dataset.s); renderStream(b.dataset.c); renderDrawer(); closeDrawer(); }
  else if (b.dataset.ren) { ren = +b.dataset.ren; del = null; renderDrawer(); }
  else if (b.dataset.exp) {   // the session as a file of its own; the paperclip opens it again
    const d = exportSession(+b.dataset.exp), slug = (d.session.name || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
    saveFile(`${slug}.golem.json`, JSON.stringify(d, null, 1), 'application/json');
  }
  else if (b.dataset.del) {
    const id = +b.dataset.del;
    if (del !== id) { del = id; renderDrawer(); return; }
    deleteSession(id); del = null; renderStream(); renderDrawer();
  }
});
$('starts').innerHTML = STARTERS.map(([t, q]) => `<button class="start" type="button" data-q="${escHtml(q)}"><b>${escHtml(t)}</b><span>${escHtml(q)}</span></button>`).join('');

/* ── start: restore saved sessions, or seed two examples ── */
renderSkills();
if (shell.present) $('st-where').textContent = 'in the lead-acid shell';
// the device's sessions come back from the store (moved from localStorage once, the first time), or two examples are seeded
(async () => {
  store = await openStore();
  const fb = await store.readPack('factbook').catch(() => null); if (fb) useFactbook(fb);   // before the sessions replay, so their cards read it
  for (const slug of Object.keys(BOOKS)) { const b = await store.readPack(slug).catch(() => null); if (b) useBook(slug, b); }
  const got = await store.load().catch(() => null);
  if (!(got && hydrate(got.state)) && !sessions().length) seedExamples();
  if (got && got.migrated) store.save(parts());
  // the "New session" shortcut of the installed app
  if (new URLSearchParams(location.search).has('new')) { newSession(); try { history.replaceState(null, '', location.pathname); } catch (e) { /* file:// */ } }
  renderStream(); renderDrawer(); renderPacks();
  $('status').textContent = store.kind === 'none' ? 'This browser keeps nothing for golem: sessions last until the page closes.' : '';
  ready = true; document.documentElement.dataset.ready = '1';   // tests wait for this
})();

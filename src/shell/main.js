// The shell: wiring, tabs, the session drawer, storage, and the sleep switch. Everything that touches
// the DOM or the browser lives here or in render.js; the engine never does.
import { S } from '../engine/core.js';
import { submit, flipSlot, answer, seedExamples, openFile, openBinary } from '../engine/engine.js';
import { BINARY } from '../engine/formats.js';
import { setRunner, onJobDone } from '../engine/core.js';
import { sessions, current, newSession, openSession, renameSession, deleteSession, searchHistory, serialize, hydrate, onChange } from '../engine/sessions.js';
import { skills, PACKS, STARTERS } from '../engine/skills.js';
import { shell } from '../vendor/leadacid.js';
import { escHtml, pad, cardEl } from './render.js';

const $ = id => document.getElementById(id);
const KEY = 'golem.mock.v2', THEME = 'golem.theme', FOLD = 'golem.side';
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
function run(raw) {
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
  const rows = skills(), live = rows.filter(s => s.live).length; let h = `<h1 class="vhead">Skills</h1><div class="sub">${live} skills run in this mock. ${rows.length - live} more are planned from packages that already exist or are named here. Tap an example to run it.</div>`, g = '';
  rows.forEach(s => {
    if (s.group !== g) { h += `<div class="lbl">${escHtml(s.group)}</div>`; g = s.group; }
    h += `<div class="item"><h3>${escHtml(s.title)} <span class="tag ${s.live ? 'live' : 'plan'}">${s.live ? 'in mock' : 'planned'}</span></h3><p>${escHtml(s.about)}</p><div class="from">${escHtml(s.on)}</div>${s.examples.length ? `<div class="opts">${s.examples.map(x => `<button class="chip" type="button" data-q="${escHtml(x)}" style="white-space:normal;text-align:left">${escHtml(x)}</button>`).join('')}</div>` : ''}</div>`;
  });
  $('v-skills').innerHTML = h;
}
function renderPacks() {
  const lab = { live: 'in mock', samp: 'sample in mock', plan: 'not wired' };
  let h = '<h1 class="vhead">Packs and this device</h1><div class="sub">golem knows what its installed packs hold. These are the gcu-library entries plus packs worth adding.</div><div class="lbl">Library</div>';
  PACKS.forEach(([id, name, meta, st, d]) => { h += `<div class="item"><h3>${escHtml(name)} <span class="tag ${st}">${lab[st]}</span></h3><p>${escHtml(d)}</p><div class="from">${escHtml(id)} · ${escHtml(meta)}</div></div>`; });
  const al = Object.entries(S.aliases);
  h += `<div class="lbl">On this device</div><div class="item"><h3>Taught words</h3><p>${al.length ? al.map(([k, v]) => `${escHtml(k)} → ${escHtml(v)}`).join('<br>') : 'None yet. Try “pop means population”.'}</p></div><div class="item"><h3>Notes</h3><p>${S.facts.length ? S.facts.map(escHtml).join('<br>') : 'None yet. Try “remember that …”.'}</p></div><div class="item"><h3>Open table</h3><p>${S.table ? `${escHtml(S.table.name)} · ${S.table.rows.length} rows · ${S.table.source === 'sample' ? 'sample data' : 'from your files'}` : 'None.'}</p></div><div class="item"><h3>Files on this device</h3><p>${Object.values(S.files).length ? Object.values(S.files).map(f => `${escHtml(f.name)} · ${(f.size / 1024).toFixed(0)} kB`).join('<br>') : 'None yet. Tap the paperclip to open a CSV.'}</p></div>`;
  $('v-packs').innerHTML = h;
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
      h += `<div class="srow" aria-current="${s === cur}">${name}<div class="meta"><span>${s.cards.length} card${s.cards.length === 1 ? '' : 's'} · ${when(s.updated)}</span>${s.example ? '<span class="tag samp">example</span>' : ''}<span class="acts"><button class="link" type="button" data-ren="${s.id}">rename</button><button class="link" type="button" data-del="${s.id}">${del === s.id ? 'confirm delete' : 'delete'}</button></span></div></div>`;
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
function persist() { try { localStorage.setItem(KEY, JSON.stringify(serialize())); } catch (e) { /* storage is optional */ } }
function restore() { try { return hydrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return false; } }
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

$('f').addEventListener('submit', e => { e.preventDefault(); const v = $('q').value; $('q').value = ''; grow(); run(v); });
function grow() { const q = $('q'); q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, window.innerHeight * 0.4) + 'px'; }
$('q').addEventListener('input', grow);
let recall = -1;
$('q').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); recall = -1; $('f').requestSubmit(); return; }
  const q = $('q'), past = S.cards.map(c => c.raw);
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && past.length && (q.value === '' || recall >= 0) && !q.value.includes('\n')) {
    const i = e.key === 'ArrowUp' ? (recall < 0 ? past.length - 1 : Math.max(0, recall - 1)) : recall < 0 ? -1 : recall + 1;
    if (e.key === 'ArrowDown' && recall < 0) return;
    e.preventDefault(); recall = i < past.length ? i : -1; q.value = recall < 0 ? '' : past[recall]; grow();
    q.setSelectionRange(q.value.length, q.value.length);
  }
});
$('q').addEventListener('input', () => { recall = -1; });
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
  if (f.size > 20e6) { status('That file is over 20 MB. golem reads smaller tables for now.'); e.target.value = ''; return; }
  if (BINARY.test(f.name)) f.arrayBuffer().then(buf => openBinary(f.name, buf)).then(o => { show(o); if (o.kind === 'card') status(`Opened ${f.name}.`); }, () => status('Could not read that file.'));
  else f.text().then(text => { show(openFile(f.name, text)); status(`Opened ${f.name}.`); }, () => status('Could not read that file.'));
  e.target.value = '';
});
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
document.querySelector('.sfoot').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { showTab(b.dataset.tab); closeDrawer(); } });
$('starts').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) run(b.dataset.q); });
$('v-skills').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) run(b.dataset.q); });
$('stream').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const c = S.cards.find(x => x.id === +b.closest('.card').dataset.id), act = b.dataset.act;
  if (act === 'run') return run(b.dataset.q);
  if (!awake) return status('Asleep. Tap wake at the top right.');
  if (act === 'slot') { flipSlot(c, b.dataset.key); replaceCard(c, b.dataset.key); }
  else if (act === 'answer') { answer(c, +b.dataset.i); replaceCard(c); }
  else if (act === 'handoff') { const n = document.createElement('div'); n.className = 'note ok'; n.textContent = b.dataset.msg; b.replaceWith(n); }
  else if (act === 'save' && c.res.file) {
    const f = c.res.file, url = URL.createObjectURL(new Blob([f.bytes || f.text], { type: f.mime })), a = document.createElement('a');
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); status(`Saved ${f.name}.`);
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
if (!restore()) seedExamples();
renderStream(); renderDrawer();
$('status').textContent = '';

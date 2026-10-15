// The shell: wiring, tabs, the session drawer, storage, and the sleep switch. Everything that touches
// the DOM or the browser lives here or in render.js; the engine never does.
import { S } from '../engine/core.js';
import { submit, flipSlot, answer, capture, seedExamples, openFile, openBinary, openStreamed, preview } from '../engine/engine.js';
import { scanTable, STREAM_OVER } from '../engine/stream.js';
import { completions } from '../engine/reading.js';
import { fromDevice } from '../engine/field.js';
import { conversions } from '../vendor/bearing.js';
import { useFactbook, factbookInfo } from '../engine/factbook.js';
import { factbookFromGcudat, factbookProfiles, readGcudat, compileOds, compileStrunk } from '../engine/packs.js';
import { useBook, bookInfo } from '../engine/books.js';
import { BINARY } from '../engine/formats.js';
import { setRunner, onJobDone } from '../engine/core.js';
import { sessions, current, newSession, openSession, renameSession, deleteSession, searchHistory, parts, hydrate, onChange, exportSession, importSession, pinCard, branchSession } from '../engine/sessions.js';
import { openStore, putBlob, getBlob } from './store.js';
import { skills, PACKS, STARTERS, STARTERS_PT } from '../engine/skills.js';
import { shell } from '../vendor/leadacid.js';
import { escHtml, pad, cardEl, drawCharts } from './render.js';
import { registerGcuSw } from '../vendor/sw-register.js';
import { t, plural, setUiLang, uiLang, applyStatic } from './i18n.js';
import { setLanguage } from '../engine/reading.js';

const $ = id => document.getElementById(id);
const THEME = 'golem.theme', FOLD = 'golem.side', LANG = 'golem.lang';
const narrow = () => window.matchMedia('(max-width: 860px)').matches;
let awake = true, statusT;

// a message in the person's language: t() on a sentence that is already translated leaves it as it is
function status(msg) { $('status').textContent = t(msg); clearTimeout(statusT); statusT = setTimeout(() => { $('status').textContent = ''; }, 5000); }
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
// a session's name as shown: the default one in the person's language, any other as it is
const nameOf = s => s.name === 'New session' ? t('New session') : s.name;
function renderBar() { $('sname').textContent = nameOf(current()); }
function renderStream(focus) {
  $('stream').innerHTML = '';
  S.cards.forEach(c => $('stream').appendChild(cardEl(c))); drawCharts($('stream')); armCaptures();
  $('exlbl').hidden = !current().example; welcome(); tick(); renderBar(); renderPacks(); showTab('ask');
  const el = focus && $('stream').querySelector(`[data-id="${focus}"]`);
  if (el) el.scrollIntoView({ block: 'start' }); else $('v-ask').scrollTop = S.cards.length > 1 ? $('v-ask').scrollHeight : 0;
}
function welcome() { $('welcome').hidden = S.cards.length > 0; renderPins(); }
// the pinned cards of this session, a tap away at the top of the stream
function renderPins() {
  const pins = S.cards.filter(c => c.pinned);
  $('pins').hidden = !pins.length;
  $('pins').innerHTML = pins.length ? `<span class="lbl">${t('pinned')}</span>${pins.map(c => `<button class="chip" type="button" data-goto="${c.id}">#${pad(c.id)} ${escHtml(c.raw.length > 40 ? c.raw.slice(0, 39) + '…' : c.raw)}</button>`).join('')}` : '';
}
const cardOf = id => $('stream').querySelector(`.card[data-id="${id}"]`);
function copyText(text, where) {
  const fail = () => { const p = document.createElement('pre'); p.textContent = text; (where || $('stream')).appendChild(p); status('Copy was blocked here. The text is shown so you can select it.'); };
  try { navigator.clipboard.writeText(text).then(() => status('Copied.'), fail); } catch (err) { fail(); }
}
// a card's own actions, from its footer or the keyboard: copy the answer, edit the question, pin, branch
function cardAction(c, act) {
  const el = cardOf(c.id);
  // the answer as a person would paste it: the tool's own copy text, or what the card shows minus sources and buttons
  const answerText = () => el ? [...el.querySelector('.ans').children].filter(n => !n.matches('.src, .opts')).map(n => n.innerText.trim()).filter(Boolean).join('\n') : '';
  if (act === 'copyans') copyText(c.res.copy || answerText(), el && el.querySelector('.ans'));
  else if (act === 'edit') { const q = $('q'); q.value = c.raw; q.dispatchEvent(new Event('input')); q.focus(); q.setSelectionRange(q.value.length, q.value.length); status('Back in the box: change it and press Enter. The answer comes as a new card.'); }
  else if (act === 'pin') { const on = pinCard(c); replaceCard(c); renderPins(); status(t(on ? 'Pinned #{n}.' : 'Unpinned #{n}.', { n: pad(c.id) })); }
  else if (act === 'branch') { const s = branchSession(c.id); renderStream(); renderDrawer(); status(t('A new session, "{name}", with the cards up to #{n}.', { name: s.name, n: pad(c.id) })); }
}
// moving between cards from the keyboard: j / k or the arrows when the box is not focused; c, e, p act on the focused card;
// / or Escape goes back to the box
document.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // handled here, the event stops: the general Escape below would send the focus straight back to the box
  if (typing) { if (e.key === 'Escape' && t.id === 'q' && !t.value && S.cards.length && !$('sg').children.length) { e.preventDefault(); e.stopImmediatePropagation(); cardOf(S.cards[S.cards.length - 1].id).focus(); } return; }
  if ($('v-ask').hidden || $('app').classList.contains('nav')) return;
  const cards = [...$('stream').querySelectorAll('.card')], at = cards.indexOf(t.closest ? t.closest('.card') : null);
  const go = i => { const el = cards[Math.max(0, Math.min(cards.length - 1, i))]; if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); } };
  if (e.key === 'j' || e.key === 'ArrowDown') { if (!cards.length) return; e.preventDefault(); go(at < 0 ? cards.length - 1 : at + 1); }
  else if (e.key === 'k' || e.key === 'ArrowUp') { if (!cards.length) return; e.preventDefault(); go(at < 0 ? cards.length - 1 : at - 1); }
  else if (e.key === '/' || e.key === 'Escape') { e.preventDefault(); $('q').focus(); }
  else if (at >= 0 && { c: 1, e: 1, p: 1 }[e.key]) { e.preventDefault(); const c = S.cards.find(x => x.id === +cards[at].dataset.id); if (c) cardAction(c, { c: 'copyans', e: 'edit', p: 'pin' }[e.key]); }
});
function replaceCard(c, focusKey) {
  const old = $('stream').querySelector(`[data-id="${c.id}"]`); if (!old) return;
  const open = !!old.querySelector('details.trace[open]'), fresh = cardEl(c);
  old.dataset.rung = fresh.dataset.rung; old.replaceChildren(...fresh.childNodes);
  if (fresh.dataset.pinned) old.dataset.pinned = '1'; else delete old.dataset.pinned;
  drawCharts(old);
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
    case 'rename': status(t('Session named “{name}”.', { name: o.name })); break;
    case 'answered': replaceCard(o.card); status(t('Answered #{n}: {label}', { n: pad(o.card.id), label: o.label })); break;
    case 'undo': { const el = $('stream').querySelector(`[data-id="${o.card.id}"]`); if (el) el.remove(); welcome(); status(t('Removed #{n}: {raw}', { n: pad(o.card.id), raw: o.card.raw })); break; }
    case 'nothing': status(o.msg); break;
    case 'card': {
      const el = cardEl(o.card); $('stream').appendChild(el); drawCharts(el); welcome(); armCaptures(); if (voice.all) say(el); showTab('ask'); el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      // for a screen reader: what was read and the start of the answer, once
      const ans = el.querySelector('.ans'), read = el.querySelector('.read');
      $('sr').textContent = `#${pad(o.card.id)}, ${(read ? read.innerText : o.card.raw).replace(/\s+/g, ' ')}. ${ans ? ans.innerText.replace(/\s+/g, ' ').slice(0, 220) : ''}`;
      break;
    }
    // a request in steps: each step's card, in order; a chain that stopped says where
    case 'cards': {
      if (o.fresh) renderStream();
      else for (const c of o.cards) { const el = cardEl(c); $('stream').appendChild(el); drawCharts(el); if (voice.all) say(el); }
      welcome(); armCaptures(); showTab('ask');
      const first = o.cards[0] && cardOf(o.cards[0].id); if (first) first.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const stop = o.cards[o.cards.length - 1], asks = stop && stop.res.ask && !['none', 'guess'].includes(stop.rung);
      status(o.cards.length === o.steps && !asks ? t('{n} steps, in order.', { n: o.steps }) : t(asks ? 'Step {k} of {n} asks a question; the rest did not run.' : 'Stopped at step {k} of {n}: that step did not read.', { k: o.cards.length || 1, n: o.steps }));
      break;
    }
  }
  tick(); renderPacks();
}

/* ── catalog and packs ── */
function renderSkills() {
  const rows = skills(), live = rows.filter(s => s.live).length; let h = `<h1 class="vhead">${t('Skills')}</h1><div class="sub">${t('{live} skills run here. {planned} more are planned from packages that already exist or are named here. Tap an example to run it.', { live, planned: rows.length - live })}${uiLang() === 'pt' ? ' ' + t('Skill descriptions and answers are in English for now.') : ''}</div>`, g = '';
  rows.forEach(s => {
    if (s.group !== g) { h += `<div class="lbl">${escHtml(t(s.group))}</div>`; g = s.group; }
    h += `<div class="item"><h3>${escHtml(s.title)} <span class="tag ${s.live ? 'live' : 'plan'}">${t(s.live ? 'live' : 'planned')}</span></h3><p>${escHtml(s.about)}</p><div class="from">${escHtml(s.on)}</div>${s.examples.length ? `<div class="opts">${s.examples.map(x => `<button class="chip" type="button" data-q="${escHtml(x)}" style="white-space:normal;text-align:left">${escHtml(x)}</button>`).join('')}</div>` : ''}</div>`;
  });
  $('v-skills').innerHTML = h;
}
// The installed app (SPEC 13.11). A service worker keeps golem.html, the manifest and the icons for offline use and makes
// no request on its own; "Check for updates" asks it to, and the header counts that request (principle 6). Opened as a
// file there is no worker, and nothing to install or update. Inside the lead-acid shell (the Android app) there is none either:
// the app has no network permission, a new version is a new APK, and the library is reached through .gcudat files.
const inApp = shell.present;
const OFFLINE_APP = () => t('This app has no network permission, so the library is out of reach from here: download the .gcudat from gcu-library in a browser and open it with the paperclip.');
let requests = 0, update = { at: null, ready: false, note: '' };
// Saving a file: a download in a browser; in the app (whose WebView drops downloads) lead-acid publishes it to Downloads,
// under the name Android gave it ("x (1).ics" when x.ics is there).
async function saveFile(name, data, mime) {
  if (inApp) {
    try { const r = await shell.publish(name, typeof data === 'string' ? new TextEncoder().encode(data) : data, { collection: 'Downloads', mime }); status(t('Saved {name} to Downloads.', { name: r.name || name })); }
    catch (e) { status(t('Not saved: {e}', { e: e.message })); }
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); status(t('Saved {name}.', { name }));
}
const requestText = () => t(requests === 1 ? '{n} request' : '{n} requests', { n: requests });
const countRequest = () => { requests++; $('st-req').textContent = requestText(); };
const sw = inApp ? { supported: false, checkNow: async () => null, applyUpdate() {} } : registerGcuSw({ url: 'sw.js', persist: true, onUpdateAvailable: () => { update.ready = true; renderPacks(); } });
async function checkUpdates() {
  countRequest(); update.note = t('Checking…'); renderPacks();
  const r = await sw.checkNow();
  update.at = Date.now();
  update.note = !r ? t('No worker controls this page yet. Reload once, then check again.') : r.changed ? '' : t('golem is up to date.');
  if (r && r.changed) update.ready = true;
  renderPacks();
}
/* ── voice, in the app only: the phone's on-device recognizer in, its offline voices out. A browser's speech services
   may send the audio away, so the page never uses them. What is heard goes into the box, read by the preview; it runs
   when the person presses Enter, like anything typed. ── */
const VOICE = 'golem.say';
const voice = { hear: false, say: false, all: false };
try { voice.all = localStorage.getItem(VOICE) === 'all'; } catch (e) { /* storage is optional */ }
// the language golem listens and speaks in: the interface's (pt-BR or en-US)
const speechLang = () => uiLang() === 'pt' ? 'pt-BR' : 'en-US', langName = () => uiLang() === 'pt' ? 'português' : 'English';
const data = d => typeof d === 'string' ? (() => { try { return JSON.parse(d); } catch (e) { return {}; } })() : (d || {});
// what the phone offers in the person's language (checked again when the language changes)
function voiceSupport() {
  if (!inApp) return;
  shell.speech.support(speechLang()).then(s => { voice.hear = !!(s && s.onDevice && s.language && s.language.installed); $('mic').hidden = !voice.hear; renderPacks(); }).catch(() => {});
}
if (inApp) {
  voiceSupport();
  shell.tts.support().then(v => { if (v && v.available && v.offlineVoices) { voice.say = true; document.documentElement.dataset.say = '1'; renderPacks(); } }).catch(() => {});
}
// the words the recognizer should expect: the open table's columns and categories, and the units golem knows by name
const biasWords = () => [...(S.table ? S.table.cols.map(c => c.name) : []), ...(S.table ? S.table.cols.flatMap(c => c.values || []).slice(0, 40) : []), 'g/t', 'ppm', 'dip direction', 'trend', 'plunge'].slice(0, 80);
let listening = null;
async function listen() {
  if (listening) { listening.stop(); return; }
  const q = $('q'), put = t => { q.value = t; q.dispatchEvent(new Event('input')); };
  try {
    listening = await shell.speech.listen({ lang: speechLang(), bias: biasWords() });
    $('mic').setAttribute('aria-pressed', 'true'); status('Listening. Tap the mic again to stop.');
    listening.on('partial', d => put(data(d).text || ''))
      .on('result', d => { const a = data(d).alternatives || [], t = a.length ? a[0].text : ''; put(t); q.focus(); status(t ? 'Heard. The reading is under the box; press Enter to run it.' : 'Nothing heard.'); })
      .on('error', d => status(t('The recognizer stopped: {code}.', { code: data(d).code || 'error' })))
      .onClose(() => { listening = null; $('mic').setAttribute('aria-pressed', 'false'); });
  } catch (e) {
    listening = null; $('mic').setAttribute('aria-pressed', 'false');
    status(e.status === 403 ? t('Voice needs the microphone: allow it in the dialog, or in the app\'s settings.') : e.status === 503 ? t('This phone has no offline recognizer for {lang}. Its language pack for offline speech is in the system settings.', { lang: langName() }) : t('Voice failed: {e}', { e: e.message }));
  }
}
$('mic').addEventListener('click', () => { if (awake) listen(); });
// a card said aloud: what was read, then the answer's first lines, without sources
function spokenOf(el) {
  const read = el.querySelector('.read'), ans = [...el.querySelector('.ans').children].filter(n => !n.matches('.src, .opts, .lbl, figure, svg, canvas'));
  return [read ? read.innerText.replace(/^(read as|lido como)\s*/i, '').replace(/⇄/g, '') : '', ...ans.slice(0, 2).map(n => n.innerText)].join('. ').replace(/\s+/g, ' ').slice(0, 400);
}
function say(el) { if (voice.say && el) shell.tts.speak(spokenOf(el), { lang: speechLang(), queue: 'flush' }).catch(e => status(e.status === 503 ? t('No offline voice for {lang} on this phone.', { lang: langName() }) : t('Could not speak: {e}', { e: e.message }))); }
function voiceItem() {
  if (!inApp) return '';
  const hear = voice.hear ? t('The mic in the box listens with the phone\'s own recognizer, offline; what it hears goes into the box for you to check.') : t('No offline recognizer for {lang} on this phone, so there is no mic.', { lang: langName() });
  const out = voice.say ? `${t('Answers can be read aloud with the phone\'s offline voices.')}</p><div class="opts"><button class="btn${voice.all ? ' go' : ''}" type="button" id="say-all" aria-pressed="${voice.all}">${t(voice.all ? 'Reading every answer aloud' : 'Read every answer aloud')}</button></div>` : t('No offline voice for {lang}, so nothing is read aloud.', { lang: langName() }) + '</p>';
  return `<div class="item"><h3>${t('Voice')}</h3><p>${hear} ${out}</div>`;
}
/* ── field capture, in the app or a phone's browser: the phone's orientation for a plane or a line, one position fix. A card that waits
   for a reading (res.capture) shows it live; the reading taken goes into the card's args (capture() in the engine). ── */
if (inApp) document.documentElement.dataset.app = '1';
const ACCW = { 3: 'high', 2: 'medium', 1: 'low', 0: 'unreliable', '-1': 'no sensor' };
let orient = null, samples = [];
const pendingCaptures = () => S.cards.filter(c => c.res && c.res.capture && ['plane', 'line'].includes(c.res.capture.kind));
const angle = (u, v) => Math.acos(Math.max(-1, Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2])))) * 180 / Math.PI;
const vecOf = (what, al, be, ga) => { const [x, y] = fromDevice(what, al, be, ga); return what === 'line' ? conversions.lineToDcos(x, y) : conversions.planeToDcos(x, y); };
// The compass: in the app, lead-acid's fused rotation vector, with Android's accuracy; in a phone's browser, the events
// that say where north is (deviceorientationabsolute in Chrome, an absolute deviceorientation in Firefox, Safari's
// webkitCompassHeading once a tap allows motion), which carry no accuracy. Events relative to wherever the phone
// started are not a compass, and are not used. golem listens at once: Chrome has requestPermission too but already
// allows motion, and sends an event only when the reading changes. Only when nothing has come does it ask for the tap
// (Safari); a desktop has the events and never fires them, and after a while it says so.
const webCompass = !inApp && typeof DeviceOrientationEvent !== 'undefined';
const webFix = !inApp && !!navigator.geolocation;
const askable = webCompass && typeof DeviceOrientationEvent.requestPermission === 'function';
let compassAllowed = !askable;
if (inApp || webCompass) document.documentElement.dataset.compass = '1';
if (inApp || webFix) document.documentElement.dataset.fix = '1';
function browserOrientation(cb) {
  const ev = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  const h = e => {
    if (e.beta == null || e.gamma == null) return;
    let alpha = e.alpha;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) alpha = (360 - e.webkitCompassHeading) % 360;
    else if (alpha == null || (ev === 'deviceorientation' && !e.absolute)) return;
    cb({ alpha, beta: e.beta, gamma: e.gamma, accuracy: null });
  };
  window.addEventListener(ev, h);
  return { close() { window.removeEventListener(ev, h); } };
}
const liveAll = text => $('stream').querySelectorAll('.capture:not([data-kind="position"]) .live').forEach(l => { l.textContent = text; });
const sample = o => { samples.push({ alpha: o.alpha, beta: o.beta, gamma: o.gamma, acc: o.accuracy, t: Date.now() }); samples = samples.filter(s => s.t > Date.now() - 1000); paintCaptures(); };
// keep the compass running while a card on screen waits for a plane or a line, and only then
async function armCaptures() {
  if (!inApp && !webCompass) return;
  const want = pendingCaptures().length > 0;
  if (!want && orient) { orient.close(); orient = null; samples = []; return; }
  if (!want || orient) { paintCaptures(); return; }
  if (!inApp) {
    const mine = orient = browserOrientation(o => { compassAllowed = true; sample(o); });
    if (!compassAllowed) liveAll(t('Tap Take reading to turn the compass on.')); else quiet(mine);
    return;
  }
  try {
    orient = await shell.orientation({ rateHz: 20 });
    orient.on(sample).onClose(() => { orient = null; });
  } catch (e) { orient = null; liveAll(t('The compass is not available here.')); }
}
function paintCaptures() {
  const s = samples[samples.length - 1];
  for (const c of pendingCaptures()) {
    const live = cardOf(c.id) && cardOf(c.id).querySelector('.capture .live'); if (!live || !s) continue;
    const [x, y] = fromDevice(c.res.capture.kind, s.alpha, s.beta, s.gamma);
    live.innerHTML = `${String(Math.round(((x % 360) + 360) % 360)).padStart(3, '0')}/${String(Math.round(y)).padStart(2, '0')}<small>${escHtml(t('magnetic · compass {acc}', { acc: t(ACCW[s.acc] || 'not reported') }))}</small>`;
  }
}
const quiet = mine => setTimeout(() => { if (orient === mine && !samples.length) liveAll(t('The compass is not available here.')); }, 2500);
// Safari asks before it hands a page the motion sensors, and only from a tap: the first tap asks, the next one measures
async function allowCompass() {
  try { compassAllowed = (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch (e) { compassAllowed = false; }
  if (!compassAllowed) { status(t('The compass needs the motion permission: allow it for this site in the browser.')); return; }
  armCaptures(); quiet(orient); status(t('Compass on: hold the phone still, then take the reading.'));
}
// the steadiest reading of the last second: the sample nearest the others, and how far the farthest was
function takeReading(c) {
  const kind = c.res.capture.kind;
  if (!inApp && !compassAllowed && !samples.length) { allowCompass(); return; }
  if (!samples.length) { status('No reading from the compass yet: hold the phone still a moment.'); return; }
  const vs = samples.map(s => vecOf(kind, s.alpha, s.beta, s.gamma));
  let best = 0, bestSum = Infinity;
  vs.forEach((v, i) => { const sum = vs.reduce((a, w) => a + angle(v, w), 0); if (sum < bestSum) { bestSum = sum; best = i; } });
  const s = samples[best], spread = Math.max(...vs.map(w => angle(vs[best], w)));
  capture(c, { alpha: s.alpha, beta: s.beta, gamma: s.gamma, acc: s.acc, spread: Math.round(spread * 10) / 10, at: s.t, ...(inApp ? {} : { via: 'browser' }) });
  replaceCard(c); armCaptures(); status(spread > 2 ? 'Measured. The phone moved while measuring; hold it still for a steadier reading.' : 'Measured.');
}
// One position fix: the first good one in 15 seconds, or the best of them. In the app, lead-acid's gnss; in a browser, its
// geolocation with high accuracy (the browser may ask its own location service for it; golem sends nothing).
function browserFix(got, fail) {
  const id = navigator.geolocation.watchPosition(p => got({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp }),
    e => fail(e.code === 1 ? Object.assign(new Error(e.message), { status: 403 }) : new Error(e.message || 'no fix')), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  return { close() { navigator.geolocation.clearWatch(id); } };
}
async function takePosition(c) {
  const live = cardOf(c.id) && cardOf(c.id).querySelector('.capture .live'), show = t => { if (live) live.textContent = t; };
  let best = null, st = null;
  try {
    if (inApp) st = await shell.gnss.location({ minMs: 1000 });
    show(t('Waiting for a fix…'));
    await new Promise((done, fail) => {
      const stop = setTimeout(done, 15000);
      const got = f => { if (f.lat == null) return; if (!best || (f.acc != null && f.acc < best.acc)) best = f; show(`±${Math.round(f.acc)} m…`); if (f.acc != null && f.acc <= 20) { clearTimeout(stop); done(); } };
      if (inApp) st.on('fix', d => got(data(d)));
      else st = browserFix(got, e => { clearTimeout(stop); if (best) done(); else fail(e); });
    });
  } catch (e) { show(''); status(e.status === 403 || (e.info && e.info.error === 'permission') ? (inApp ? t('Position needs the location permission: allow it in the dialog, or in the app\'s settings.') : t('Position needs the location permission: allow it for this site in the browser.')) : t('No position: {e}', { e: e.message })); return; }
  finally { if (st) st.close(); }
  if (!best) { show(t('No fix. Go where the sky is open and try again.')); return; }
  capture(c, { lat: best.lat, lon: best.lon, acc: best.acc, at: best.t || Date.now() }); replaceCard(c); status(t('Position taken, ±{m} m.', { m: Math.round(best.acc) }));
}
function appItem() {
  if (inApp) return `<div class="item"><h3>${t('This app')}</h3><p>${t('Installed as an Android app through lead-acid. It has no network permission and checks for nothing: a new version comes as a new APK.')}</p></div>`;
  if (!sw.supported) return `<div class="item"><h3>${t('This app')}</h3><p>${t('Opened as a file, so there is nothing to install or update. Served over https, golem installs as an app and works offline.')}</p></div>`;
  const at = update.at ? t(' Last checked {time}.', { time: new Date(update.at).toLocaleTimeString(uiLang() === 'pt' ? 'pt-BR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) }) : '';
  return `<div class="item"><h3>${t('This app')}</h3><p>${t('Kept on this device and works offline. It looks for a new version only when you ask; that is one request to where golem came from.')}${at}</p>`
    + `<div class="opts">${update.ready ? `<button class="btn go" type="button" id="sw-apply">${t('Reload to the new golem')}</button>` : `<button class="btn" type="button" id="sw-check">${t('Check for updates')}</button>`}${update.note ? `<span class="sub">${escHtml(update.note)}</span>` : ''}</div></div>`;
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
  if (packBusy) return; packBusy = true; packNote = t('Installing…'); renderPacks();
  try {
    const find = await registry();
    const fb = find('factbook'), ff = full ? find('factbook-full') : null; if (!fb || (full && !ff)) throw new Error('the library lists no factbook pack');
    const pack = await factbookFromGcudat(await fetchPack(fb), ff ? await fetchPack(ff) : null);
    await keepFactbook(pack);
  } catch (e) { packNote = t('Not installed: {e}.', { e: e.message }); }
  packBusy = false; renderPacks();
}
async function keepFactbook(pack) {
  await store.writePack('factbook', pack);
  const i = useFactbook(pack); packNote = t('Installed: {n} countries{full}.', { n: i.count, full: pack.profiles ? t(', with the full profiles') : '' }); status(packNote);
}
// the book packs: compiled at install into the index golem uses (packs.js), kept, handed to books.js
const BOOKS = {
  ods: { compile: compileOds, size: '1.9 MB', sample: 'A sample term index ships: where a term is defined, without the passage.', installed: i => t('Installed: {n} terms with their defining passages.', { n: i.count }), removed: 'Removed. The sample term index answers again.' },
  'elements-of-style': { compile: compileStrunk, size: '36 kB', sample: 'A sample of rules 10, 11 and 13 ships.', installed: i => t('Installed: {n} checks from its rules and chapter V.', { n: i.count }), removed: 'Removed. The sample checks answer again.' },
};
const bookNote = {};
async function keepBook(slug, compiled) { await store.writePack(slug, compiled); bookNote[slug] = BOOKS[slug].installed(useBook(slug, compiled)); status(bookNote[slug]); }
async function installBook(slug) {
  if (packBusy) return; packBusy = true; bookNote[slug] = t('Installing…'); renderPacks();
  try { const e = (await registry())(slug); if (!e) throw new Error(`the library lists no ${slug} pack`); await keepBook(slug, await BOOKS[slug].compile(await fetchPack(e))); }
  catch (err) { bookNote[slug] = t('Not installed: {e}.', { e: err.message }); }
  packBusy = false; renderPacks();
}
async function removeBook(slug) { await store.removePack(slug); useBook(slug, null); bookNote[slug] = t(BOOKS[slug].removed); renderPacks(); }
function bookItem(slug) {
  const i = bookInfo(slug), B = BOOKS[slug];
  const acts = i.kind === 'sample' ? (inApp ? `<span class="sub">${OFFLINE_APP()}</span>` : `<button class="btn go" type="button" data-pk-install="${slug}">${t('Install from the library ({size})', { size: B.size })}</button>`) : `<button class="btn" type="button" data-pk-remove="${slug}">${t('Remove')}</button>`;
  return `<p>${i.kind === 'sample' ? t(B.sample) : escHtml(t('Installed: version {v}, kept on this device.', { v: i.version || '' }))}</p><div class="opts">${store && store.kind === 'idb' ? acts : `<span class="sub">${t('This browser gives golem no IndexedDB, so a pack cannot be kept.')}</span>`}${bookNote[slug] ? `<span class="sub">${escHtml(bookNote[slug])}</span>` : ''}</div>`;
}
async function removeFactbook() { await store.removePack('factbook'); useFactbook(null); packNote = t('Removed. The 14-country sample answers again.'); renderPacks(); }
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
  const state = i.kind === 'sample' ? t('The 14-country sample ships with golem.') : escHtml(t('Installed: version {v}, {n} countries{full}. Kept on this device.', { v: i.version, n: i.count, full: i.profiles ? t(', with the full profiles') : '' }));
  const acts = inApp ? `${i.kind === 'sample' ? '' : `<button class="btn" type="button" id="fb-remove">${t('Remove')}</button>`}<span class="sub">${OFFLINE_APP()}</span>`
    : i.kind === 'sample'
    ? `<button class="btn go" type="button" id="fb-install">${t('Install from the library (2.8 MB)')}</button><button class="btn" type="button" id="fb-install-full">${t('With full profiles (5.1 MB)')}</button>`
    : `${i.profiles ? '' : `<button class="btn" type="button" id="fb-install-full">${t('Add the full profiles (5.1 MB)')}</button>`}<button class="btn" type="button" id="fb-remove">${t('Remove')}</button>`;
  return `<p>${state}${inApp ? '' : t(' Installing makes one request to the library for its list and one per pack; a .gcudat file opened with the paperclip installs with none.')}</p><div class="opts">${store && store.kind === 'idb' ? acts : `<span class="sub">${t('This browser gives golem no IndexedDB, so a pack cannot be kept.')}</span>`}${packNote ? `<span class="sub">${escHtml(packNote)}</span>` : ''}</div>`;
}
function renderPacks() {
  const lab = { live: t('installed'), samp: t('sample'), plan: t('not wired') };
  let h = `<h1 class="vhead">${t('Packs and this device')}</h1><div class="sub">${t('golem knows what its installed packs hold. These are the gcu-library entries plus packs worth adding.')}</div><div class="lbl">${t('Library')}</div>`;
  const fbi = factbookInfo();
  PACKS.forEach(([id, name, meta, st, d]) => {
    if (id === 'factbook') st = fbi.kind === 'sample' ? 'samp' : 'live';
    if (id === 'factbook-full') st = fbi.kind === 'pack' && fbi.profiles ? 'live' : 'plan';
    if (BOOKS[id]) st = bookInfo(id).kind === 'pack' ? 'live' : 'samp';
    h += `<div class="item"><h3>${escHtml(name)} <span class="tag ${st}">${lab[st]}</span></h3><p>${escHtml(d)}</p>${id === 'factbook' ? factbookItem() : BOOKS[id] ? bookItem(id) : ''}<div class="from">${escHtml(id)} · ${escHtml(meta)}</div></div>`;
  });
  const al = Object.entries(S.aliases);
  h += `<div class="lbl">${t('On this device')}</div><div class="item"><h3>${t('Taught words')}</h3><p>${al.length ? al.map(([k, v]) => `${escHtml(k)} → ${escHtml(v)}`).join('<br>') : t('None yet. Try “pop means population”.')}</p></div><div class="item"><h3>${t('Notes')}</h3><p>${S.facts.length ? S.facts.map(escHtml).join('<br>') : t('None yet. Try “remember that …”.')}</p></div><div class="item"><h3>${t('Open table')}</h3><p>${S.table ? escHtml(t('{name} · {n} rows · {source}', { name: S.table.name, n: S.table.rows.length, source: t(S.table.source === 'sample' ? 'sample data' : 'from your files') })) : t('None.')}</p></div><div class="item"><h3>${t('Files on this device')}</h3><p>${Object.values(S.files).length ? Object.values(S.files).map(f => `${escHtml(f.name)} · ${(f.size / 1024).toFixed(0)} kB`).join('<br>') : t('None yet. Tap the paperclip to open a CSV.')}</p></div>`;
  h += voiceItem() + appItem();
  $('v-packs').innerHTML = h;
  for (const [id, fn] of [['fb-install', () => installFactbook(false)], ['fb-install-full', () => installFactbook(true)], ['fb-remove', removeFactbook]]) { const b = $(id); if (b) b.addEventListener('click', fn); }
  const ck = $('sw-check'), ap = $('sw-apply');
  if (ck) ck.addEventListener('click', checkUpdates);
  if (ap) ap.addEventListener('click', () => sw.applyUpdate());
  const sa = $('say-all'); if (sa) sa.addEventListener('click', () => { voice.all = !voice.all; try { localStorage.setItem(VOICE, voice.all ? 'all' : ''); } catch (e) { /* storage is optional */ } renderPacks(); });
}

/* ── the drawer: sessions and history ── */
let ren = null, del = null;
const when = ms => { const d = new Date(ms), n = new Date(), loc = uiLang() === 'pt' ? 'pt-BR' : 'en-GB'; return d.toDateString() === n.toDateString() ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }); };
function renderDrawer() {
  const q = $('hq').value.trim(); let h;
  if (q) {
    const hits = searchHistory(q);
    h = `<div class="lbl">${t(hits.length === 1 ? '{n} match in history' : '{n} matches in history', { n: hits.length })}</div>` + hits.slice(0, 40).map(({ session: s, card: c }) => `<div class="srow"><button class="open hit" type="button" data-s="${s.id}" data-c="${c.id}">&gt; ${escHtml(c.raw)}</button><div class="meta"><span>${escHtml(s.name)}</span></div></div>`).join('');
  } else {
    const cur = current(), day = 864e5, today = new Date().setHours(0, 0, 0, 0), age = ms => t(ms >= today ? 'Today' : ms >= today - 6 * day ? 'This week' : 'Earlier');
    let g = ''; h = '';
    // yours by when they were last used, then the examples golem seeded on the first visit
    const all = [...sessions()].sort((x, y) => y.updated - x.updated || y.id - x.id);
    [...all.filter(s => !s.example), ...all.filter(s => s.example)].forEach(s => {
      const grp = s.example ? t('Examples') : age(s.updated);
      if (grp !== g) { g = grp; h += `<div class="lbl">${g}</div>`; }
      const name = ren === s.id ? `<input class="ren" data-id="${s.id}" value="${escHtml(s.name)}" aria-label="${t('Session name. Leave empty to name it automatically.')}">` : `<button class="open" type="button" data-s="${s.id}" title="${escHtml(nameOf(s))}">${escHtml(nameOf(s))}</button>`;
      h += `<div class="srow" aria-current="${s === cur}">${name}<div class="meta"><span>${t(s.cards.length === 1 ? '{n} card' : '{n} cards', { n: s.cards.length })} · ${when(s.updated)}</span>${s.example ? `<span class="tag samp">${t('example')}</span>` : ''}<span class="acts"><button class="link" type="button" data-ren="${s.id}">${t('rename')}</button><button class="link" type="button" data-exp="${s.id}">${t('export')}</button><button class="link" type="button" data-del="${s.id}">${t(del === s.id ? 'confirm delete' : 'delete')}</button></span></div></div>`;
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

/* ── language: the device's, or the choice kept on this device. golem reads both; the interface is the chosen one ── */
function applyLanguage(l) {
  setUiLang(l); setLanguage(l); applyStatic(document);
  $('lang-k').textContent = l === 'pt' ? 'Português' : 'English';
  $('st-req').textContent = requestText(); applyTheme(theme); renderPower(); renderStarters(); renderSkills(); voiceSupport();
  if (ready) { renderStream(); renderDrawer(); renderPacks(); }
}
let lang = (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
try { const l = localStorage.getItem(LANG); if (l === 'en' || l === 'pt') lang = l; } catch (e) { /* storage is optional */ }
$('lang').addEventListener('click', () => { lang = lang === 'pt' ? 'en' : 'pt'; try { localStorage.setItem(LANG, lang); } catch (e) { /* storage is optional */ } applyLanguage(lang); });
/* ── theme: auto follows the system; a choice is kept on this device ── */
const THEMES = ['auto', 'light', 'dark'];
let theme = 'auto';
function applyTheme(th) { if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th; $('theme-k').textContent = t(th); drawCharts(); }
// charts read the theme's colours and the column's width when drawn: draw them again when either changes
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawCharts());
let redrawT; window.addEventListener('resize', () => { clearTimeout(redrawT); redrawT = setTimeout(() => drawCharts(), 150); });
try { const t = localStorage.getItem(THEME); if (THEMES.includes(t)) theme = t; } catch (e) { /* storage is optional */ }
applyTheme(theme);
applyLanguage(lang);
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
$('file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) openPicked(f); e.target.value = ''; });
// a file from the paperclip, dropped on the window, or shared to the app ("Open with golem"): one way in
function openPicked(f) {
  if (!awake) return status('Asleep. Tap wake at the top right.');
  if (!ready) return status('Opening your sessions…');
  if (f.size > STREAM_OVER) {   // a text table too large to hold: kept as it is, typed from its head, scanned per question
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) { status(t('That file is over 20 MB. golem streams large CSV and TSV tables; a {ext} that large is not read.', { ext: f.name.split('.').pop() })); return; }
    f.slice(0, 1 << 20).text().then(async head => {
      const o = openStreamed(f.name, f.size, head); if (o.kind !== 'card') { show(o); return; }
      BIG[o.hash] = f; show(o); status(t('Opened {name} as a stream.', { name: f.name }));
      await putBlob(o.hash, f).catch(() => status(t('{name} could not be kept on this device; it works until the page closes.', { name: f.name })));
    }, () => status('Could not read that file.'));
    return;
  }
  if (/\.gcudat$/i.test(f.name)) {   // a pack: installed, not opened as a table
    f.arrayBuffer().then(buf => openPackFile(f.name, new Uint8Array(buf))).then(() => renderPacks(), err => status(t('Not installed: {e}.', { e: err.message })));
    return;
  }
  if (/\.golem\.json$/i.test(f.name)) {   // a session exported from golem: it comes back as a session of its own
    f.text().then(txt => { let s = null; try { s = importSession(JSON.parse(txt)); } catch (err) { s = null; } if (!s) { status('That is not a golem session file.'); return; } renderStream(); renderDrawer(); status(t('Imported "{name}".', { name: s.name })); }, () => status('Could not read that file.'));
    return;
  }
  if (BINARY.test(f.name)) f.arrayBuffer().then(buf => openBinary(f.name, buf)).then(o => { show(o); if (o.kind === 'card') status(t('Opened {name}.', { name: f.name })); }, () => status('Could not read that file.'));
  else f.text().then(text => { show(openFile(f.name, text)); status(t('Opened {name}.', { name: f.name })); }, () => status('Could not read that file.'));
}
// dropped on the window (a desktop browser)
window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.documentElement.dataset.drop = '1'; } });
window.addEventListener('dragleave', e => { if (!e.relatedTarget) delete document.documentElement.dataset.drop; });
window.addEventListener('drop', e => { delete document.documentElement.dataset.drop; const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); openPicked(f); });
// shared to the app or opened with it (lead-acid's intake): a file opens as the paperclip would; shared text goes in the box
if (inApp) shell.intake(async d => {
  if (d.kind === 'text' || (d.text && !d.token)) { const q = $('q'); q.value = String(d.text || ''); q.dispatchEvent(new Event('input')); q.focus(); status('Shared text is in the box: press Enter to run it.'); return; }
  try { const bytes = await d.blob.arrayBuffer(); const until = () => ready ? openPicked(new File([bytes], d.name || 'shared', { type: d.mime || '' })) : setTimeout(until, 100); until(); }
  catch (e) { status(t('Could not read the shared file: {e}', { e: e.message })); }
}).catch(() => {});
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
document.querySelector('.sfoot').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { showTab(b.dataset.tab); closeDrawer(); } });
$('starts').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) run(b.dataset.q); });
$('v-skills').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) run(b.dataset.q); });
$('v-packs').addEventListener('click', e => { const b = e.target.closest('[data-pk-install],[data-pk-remove]'); if (!b) return; if (b.dataset.pkInstall) installBook(b.dataset.pkInstall); else removeBook(b.dataset.pkRemove); });
$('pins').addEventListener('click', e => { const b = e.target.closest('[data-goto]'); const el = b && cardOf(+b.dataset.goto); if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); } });
$('stream').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const c = S.cards.find(x => x.id === +b.closest('.card').dataset.id), act = b.dataset.act;
  if (act === 'run') return run(b.dataset.q);
  if (!awake) return status('Asleep. Tap wake at the top right.');
  if (act === 'slot') { flipSlot(c, b.dataset.key); replaceCard(c, b.dataset.key); }
  else if (act === 'answer') { answer(c, +b.dataset.i); replaceCard(c); }
  else if (act === 'skills') showTab('skills');
  else if (['copyans', 'edit', 'pin', 'branch'].includes(act)) cardAction(c, act);
  else if (act === 'say') say(b.closest('.card'));
  else if (act === 'take' && c.res.capture) { if (c.res.capture.kind === 'position') takePosition(c); else takeReading(c); }
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
function renderPower() { $('st-on').textContent = t(awake ? 'awake' : 'asleep'); $('power').textContent = t(awake ? 'sleep' : 'wake'); $('power').setAttribute('aria-pressed', String(!awake)); }
$('power').addEventListener('click', () => {
  awake = !awake; $('app').classList.toggle('asleep', !awake); $('q').disabled = !awake; renderPower();
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
function renderStarters() { $('starts').innerHTML = (uiLang() === 'pt' ? STARTERS_PT : STARTERS).map(([g, items]) => `<section class="sgroup"><h2>${escHtml(g)}</h2>${items.map(([t, q]) => `<button class="start" type="button" data-q="${escHtml(q)}"><b>${escHtml(t)}</b><span>${escHtml(q)}</span></button>`).join('')}</section>`).join(''); }
renderStarters();

/* ── start: restore saved sessions, or seed two examples ── */
renderSkills();
if (shell.present) { $('st-where').dataset.tEn = 'in the lead-acid shell'; $('st-where').textContent = t('in the lead-acid shell'); }
// the device's sessions come back from the store (moved from localStorage once, the first time), or two examples are seeded
(async () => {
  store = await openStore();
  const fb = await store.readPack('factbook').catch(() => null); if (fb) useFactbook(fb);   // before the sessions replay, so their cards read it
  for (const slug of Object.keys(BOOKS)) { const b = await store.readPack(slug).catch(() => null); if (b) useBook(slug, b); }
  const got = await store.load().catch(() => null);
  // a first visit: the examples are kept in the sidebar, and golem opens on the welcome in a session of its own
  if (!(got && hydrate(got.state)) && !sessions().length) { seedExamples(); newSession(); }
  if (got && got.migrated) store.save(parts());
  // the "New session" shortcut of the installed app
  if (new URLSearchParams(location.search).has('new')) { newSession(); try { history.replaceState(null, '', location.pathname); } catch (e) { /* file:// */ } }
  renderStream(); renderDrawer(); renderPacks();
  $('status').textContent = store.kind === 'none' ? t('This browser keeps nothing for golem: sessions last until the page closes.') : '';
  ready = true; document.documentElement.dataset.ready = '1';   // tests wait for this
})();

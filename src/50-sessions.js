/* ── sessions: stored as plans, replayed on open, named from their tools ── */
let SS = [], cur = null, sid = 0, ren = null, del = null;
const KEY = 'golem.mock.v2';
const spec = c => ({ id: c.id, raw: c.raw, tool: c.tool, args: c.args, rung: c.rung, amends: c.amends, ms: c.ms });
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ cur: cur.id, sid, aliases: S.aliases, facts: S.facts, ss: SS.map(s => ({ ...s, cards: s.cards.map(spec) })) })); } catch (e) { /* storage is optional */ }
}
function tagOf(c) {
  const a = c.args;
  switch (c.tool) {
    case 'convert': return [a.from + ' → ' + a.to, 1];
    case 'calc': return ['Arithmetic', .5];
    case 'daysUntil': case 'weekday': return ['Dates', .5];
    case 'thickness': return ['True thickness', 3];
    case 'plane': return ['Stereonet ' + p3(a.a1) + '/' + p2(a.a2), 2];
    case 'hist': return [COL[a.col] + ' histogram', 3];
    case 'vario': return [COL[a.col] + ' variogram', 3];
    case 'fact': return [fbFind(a.country)[0] + ' ' + a.field, 2];
    case 'factList': return ['Landlocked countries', 2];
    case 'mineral': return [a.name, 2];
    case 'key': return ['Mineral key', 3];
    case 'define': return [a.term, 2];
    case 'lint': return ['Style check', 2];
    case 'event': return [a.title, 2];
    case 'timer': return ['Timer', 1];
    case 'alarm': return ['Alarm', 1];
    case 'remember': case 'recall': return ['Notes', 1];
    default: return null;
  }
}
function autoName(cards) {
  const table = cards.some(c => ['open', 'hist', 'vario'].includes(c.tool)), w = new Map();
  cards.forEach((c, i) => {
    if (table && !['hist', 'vario'].includes(c.tool)) return;
    const t = tagOf(c); if (t) w.set(t[0], (w.get(t[0]) || 0) + t[1] + i * 1e-3);
  });
  const top = [...w.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]);
  if (table) return 'assays.csv' + (top.length ? ': ' + top.slice(0, 2).join(', ') : '');
  if (!top.length) return 'New session';
  const two = top.slice(0, 2).join(', ');
  return two.length > 40 ? top[0] : two;
}
function renderBar() { $('sname').textContent = cur.name; }
function touch() { cur.updated = Date.now(); if (cur.auto) cur.name = autoName(S.cards); renderBar(); persist(); }
function load(s, focus) {
  cur = s; const specs = s.cards;
  S.cards = []; s.cards = S.cards; S.data = null; S.n = 0; $('stream').innerHTML = '';
  specs.forEach(c => {
    let res = null; try { res = T[c.tool](c.args); } catch (e) { res = null; }
    if (!res) return;
    const card = { ...spec(c), res }; S.cards.push(card); S.n = Math.max(S.n, card.id); $('stream').appendChild(cardEl(card));
  });
  $('exlbl').hidden = !s.example; tick(); renderBar(); renderPacks(); showTab('ask');
  const el = focus && $('stream').querySelector(`[data-id="${focus}"]`);
  if (el) el.scrollIntoView({ block: 'start' }); else $('v-ask').scrollTop = 0;
}
function newSession(example) {
  const s = { id: ++sid, name: 'New session', auto: true, example: !!example, created: Date.now(), updated: Date.now(), cards: [] };
  SS.push(s); load(s); persist(); return s;
}
const when = t => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
function renderDrawer() {
  const q = $('hq').value.trim().toLowerCase(); let h;
  if (q) {
    const hits = []; SS.forEach(s => s.cards.forEach(c => { if (c.raw.toLowerCase().includes(q)) hits.push([s, c]); }));
    h = `<div class="lbl">${hits.length} match${hits.length === 1 ? '' : 'es'} in history</div>` + hits.slice(0, 40).map(([s, c]) => `<div class="srow"><button class="open" type="button" data-s="${s.id}" data-c="${c.id}" style="font:13px var(--mono)">&gt; ${esc(c.raw)}</button><div class="meta"><span>${esc(s.name)}</span></div></div>`).join('');
  } else {
    h = '<div class="lbl">Sessions</div>' + [...SS].sort((x, y) => y.updated - x.updated || y.id - x.id).map(s => `<div class="srow" aria-current="${s === cur}">${ren === s.id ? `<input class="ren" data-id="${s.id}" value="${esc(s.name)}" aria-label="Session name. Leave empty to name it automatically.">` : `<button class="open" type="button" data-s="${s.id}">${esc(s.name)}</button>`}<div class="meta"><span>${s.cards.length} card${s.cards.length === 1 ? '' : 's'} · ${when(s.updated)}</span>${s.auto ? '<span class="tag plan">auto name</span>' : ''}${s.example ? '<span class="tag samp">example</span>' : ''}<button class="link" type="button" data-ren="${s.id}">rename</button><button class="link" type="button" data-del="${s.id}">${del === s.id ? 'confirm delete' : 'delete'}</button></div></div>`).join('');
  }
  $('dlist').innerHTML = h;
  const i = $('dlist').querySelector('.ren'); if (i) { i.focus(); i.select(); }
}
function openDrawer() { ren = del = null; $('hq').value = ''; renderDrawer(); $('drawer').hidden = false; $('scrim').hidden = false; }
function closeDrawer() { $('drawer').hidden = true; $('scrim').hidden = true; }
function commitName(inp) {
  const s = SS.find(x => x.id === +inp.dataset.id), v = inp.value.trim(); if (!s) return;
  if (v) { s.name = v; s.auto = false; } else { s.auto = true; s.name = autoName(s.cards); }
  ren = null; renderBar(); persist(); renderDrawer();
}
$('menu').addEventListener('click', openDrawer);
$('sname').addEventListener('click', openDrawer);
$('dclose').addEventListener('click', closeDrawer);
$('scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });
$('newsess').addEventListener('click', () => { newSession(); closeDrawer(); status('New session.'); $('q').focus(); });
$('hq').addEventListener('input', renderDrawer);
$('dlist').addEventListener('keydown', e => { if (e.target.classList.contains('ren') && e.key === 'Enter') commitName(e.target); });
$('dlist').addEventListener('focusout', e => { if (e.target.classList.contains('ren') && ren != null) commitName(e.target); });
$('dlist').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.s) { const s = SS.find(x => x.id === +b.dataset.s); load(s, b.dataset.c); persist(); closeDrawer(); }
  else if (b.dataset.ren) { ren = +b.dataset.ren; del = null; renderDrawer(); }
  else if (b.dataset.del) {
    const id = +b.dataset.del;
    if (del !== id) { del = id; renderDrawer(); return; }
    SS = SS.filter(x => x.id !== id); del = null;
    if (cur.id === id) { if (SS.length) load([...SS].sort((x, y) => y.updated - x.updated)[0]); else newSession(); }
    persist(); renderDrawer();
  }
});

/* ── start: restore saved sessions, or seed two examples ───── */
function seed() {
  SS = []; sid = 0;
  newSession(true); ['open assays.csv', 'histogram of cu', 'log scale', 'variogram of cu', '2 m'].forEach(x => submit(x, true));
  newSession(true); ['0.35 oz per short ton in g/t', 'true thickness of a 14 m intercept, hole 270/60, bedding 045/30', 'remind me to send the samples to the lab on friday at 9', 'vario of cu'].forEach(x => submit(x, true));
  $('v-ask').scrollTop = 0; $('status').textContent = '';
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || !Array.isArray(d.ss) || !d.ss.length) return false;
    SS = d.ss; sid = d.sid || Math.max(...SS.map(s => s.id)); S.aliases = d.aliases || {}; S.facts = d.facts || [];
    load(SS.find(s => s.id === d.cur) || SS[0]); return true;
  } catch (e) { return false; }
}
renderSkills(); renderPacks();
if (!restore()) seed();

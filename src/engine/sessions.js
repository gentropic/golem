// Sessions: stored as plans (card specs), replayed on open, named from the tools that ran.
// The shell persists whatever `serialize()` returns and feeds it back through `hydrate()`.
import { S, toolByName, runTool, startJobs, clearResults } from './core.js';

let SS = [], cur = null;
let sid = 0;
const listeners = [];
// the shell registers here to persist and redraw after any change to the session store
export const onChange = fn => { listeners.push(fn); };
const changed = () => listeners.forEach(f => f());

// what a session keeps of a card: enough to recompute it, and nothing else
export const spec = c => ({ id: c.id, raw: c.raw, tool: c.tool, args: c.args, rung: c.rung, amends: c.amends, ms: c.ms, ...(c.pinned ? { pinned: true } : {}) });

// what a card contributes to its session's name: [label, weight], from the tool's declaration
export function tagOf(c) { const d = toolByName(c.tool); return d && d.topic ? d.topic(c.args) : null; }
export function autoName(cards) {
  const opened = cards.find(c => c.tool === 'open'), table = opened || cards.some(c => ['hist', 'query'].includes(c.tool)), w = new Map();
  const tname = opened && opened.args.file ? opened.args.file.name : 'assays.csv';
  cards.forEach((c, i) => {
    if (table && !['hist', 'query'].includes(c.tool)) return;
    const t = tagOf(c); if (t) w.set(t[0], (w.get(t[0]) || 0) + t[1] + i * 1e-3);
  });
  const top = [...w.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]);
  if (table) return tname + (top.length ? ': ' + top.slice(0, 2).join(', ') : '');
  if (!top.length) return 'New session';
  const two = top.slice(0, 2).join(', ');
  return two.length > 40 ? top[0] : two;
}
// the current session changed: refresh its automatic name and tell the shell
export function touch() { cur.updated = Date.now(); if (cur.auto) cur.name = autoName(S.cards); changed(); }

// open a session: clear the working state and recompute every card from its spec
export function load(s) {
  cur = s; const specs = s.cards;
  S.cards = []; s.cards = S.cards; S.table = null; S.n = 0; S.clause = null;
  specs.forEach(c => {
    let res = null; try { res = runTool(c.tool, c.args); } catch (e) { res = null; }
    if (!res) return;
    const card = { ...spec(c), res }; S.cards.push(card); S.n = Math.max(S.n, card.id);
  });
  const loaded = S.cards;
  startJobs(loaded, card => { card.res = runTool(card.tool, card.args); });
  return S.cards;
}
export function openSession(id) { const s = SS.find(x => x.id === id); if (!s) return null; load(s); changed(); return s; }
export function newSession(example) {
  const s = { id: ++sid, name: 'New session', auto: true, example: !!example, created: Date.now(), updated: Date.now(), cards: [] };
  SS.push(s); load(s); changed(); return s;
}
// an empty name hands the session back to automatic naming
export function renameSession(id, name) {
  const s = SS.find(x => x.id === id); if (!s) return null;
  const v = name.trim();
  if (v) { s.name = v; s.auto = false; } else { s.auto = true; s.name = autoName(s.cards); }
  changed(); return s;
}
export function deleteSession(id) {
  SS = SS.filter(x => x.id !== id);
  if (cur && cur.id === id) { if (SS.length) load([...SS].sort((x, y) => y.updated - x.updated)[0]); else newSession(); }
  changed();
}
// a pinned card stays at hand at the top of its session; the pin is part of the session's plan, so it travels with it
export function pinCard(c) { if (c.pinned) delete c.pinned; else c.pinned = true; cur.updated = Date.now(); changed(); return !!c.pinned; }
// a new session with this session's cards up to and including one: the same plan, recomputed, to go another way from there
export function branchSession(cardId) {
  const from = cur, keep = from.cards.filter(c => c.id <= cardId).map(spec);
  const s = { id: ++sid, name: 'New session', auto: true, example: false, created: Date.now(), updated: Date.now(), cards: keep };
  SS.push(s); load(s); s.name = autoName(S.cards) + (autoName(S.cards) === from.name ? ' (branch)' : ''); changed(); return s;
}
// substring match over what was typed, across every session
export function searchHistory(q) {
  q = q.trim().toLowerCase(); const hits = [];
  if (q) SS.forEach(s => s.cards.forEach(c => { if (c.raw.toLowerCase().includes(q)) hits.push({ session: s, card: c }); }));
  return hits;
}
export const sessions = () => SS;
export const current = () => cur;

export function serialize() {
  // files under a megabyte travel with the device state; larger ones stay in memory and say so on replay
  const files = Object.fromEntries(Object.entries(S.files).filter(([, f]) => f.text.length <= 1e6));
  return { cur: cur && cur.id, sid, aliases: S.aliases, facts: S.facts, files, tables: S.tables, recipes: S.recipes, misses: S.misses, picks: S.picks, formulas: S.formulas, orders: S.orders, ss: SS.map(s => ({ ...s, cards: s.cards.map(spec) })) };
}
// the same state in parts, for a store that keeps each session and each file on its own (the shell's @gcu/vfs), with no
// size cap on files; hydrate() takes the parts put back together ({ cur, sid, ...device, files, ss })
export function parts() {
  return { meta: { v: 1, cur: cur && cur.id, sid }, device: { aliases: S.aliases, facts: S.facts, tables: S.tables, recipes: S.recipes, misses: S.misses, picks: S.picks, formulas: S.formulas, orders: S.orders },
    sessions: SS.map(s => ({ ...s, cards: s.cards.map(spec) })), files: S.files };
}
// A session as a file of its own ("<name>.golem.json"): its card specs and the files they read, so it replays on another
// device. Importing gives it a new id and keeps the files it brings that this device does not have.
export function exportSession(id) {
  const s = SS.find(x => x.id === id); if (!s) return null;
  const hashes = new Set(), walk = v => { if (v && typeof v === 'object') { if (typeof v.hash === 'string' && S.files[v.hash]) hashes.add(v.hash); Object.values(v).forEach(walk); } };
  s.cards.forEach(c => walk(c.args));
  const { id: _, ...rest } = s;
  return { golem: 'session', v: 1, session: { ...rest, cards: s.cards.map(spec) }, files: Object.fromEntries([...hashes].map(h => [h, S.files[h]])) };
}
export function importSession(d) {
  if (!d || d.golem !== 'session' || !d.session || !Array.isArray(d.session.cards)) return null;
  for (const [h, f] of Object.entries(d.files || {})) if (!S.files[h] && f && f.hash === h) S.files[h] = f;
  const s = { ...d.session, id: ++sid, example: false, updated: Date.now() };
  SS.push(s); load(s); changed(); return s;
}
export function hydrate(d) {
  if (!d || !Array.isArray(d.ss) || !d.ss.length) return false;
  SS = d.ss; sid = d.sid || Math.max(...SS.map(s => s.id)); S.aliases = d.aliases || {}; S.facts = d.facts || []; S.files = d.files || {}; S.tables = d.tables || {}; S.recipes = d.recipes || {}; S.misses = d.misses || []; S.picks = d.picks || {}; S.formulas = d.formulas || {}; S.orders = d.orders || [];
  load(SS.find(s => s.id === d.cur) || SS[0]); return true;
}
// forget everything: sessions, device state, working state (tests start here)
export function reset() {
  SS = []; cur = null; sid = 0; S.cards = []; S.n = 0; S.aliases = {}; S.facts = []; S.files = {}; S.tables = {}; S.recipes = {}; S.misses = []; S.picks = {}; S.formulas = {}; S.orders = []; S.table = null; S.clause = null; clearResults();
}

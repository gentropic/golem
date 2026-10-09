// Sessions: stored as plans (card specs), replayed on open, named from the tools that ran.
// The shell persists whatever `serialize()` returns and feeds it back through `hydrate()`.
import { S, toolByName, runTool } from './core.js';

let SS = [], cur = null;
let sid = 0;
const listeners = [];
// the shell registers here to persist and redraw after any change to the session store
export const onChange = fn => { listeners.push(fn); };
const changed = () => listeners.forEach(f => f());

// what a session keeps of a card: enough to recompute it, and nothing else
export const spec = c => ({ id: c.id, raw: c.raw, tool: c.tool, args: c.args, rung: c.rung, amends: c.amends, ms: c.ms });

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
  return { cur: cur && cur.id, sid, aliases: S.aliases, facts: S.facts, files, ss: SS.map(s => ({ ...s, cards: s.cards.map(spec) })) };
}
export function hydrate(d) {
  if (!d || !Array.isArray(d.ss) || !d.ss.length) return false;
  SS = d.ss; sid = d.sid || Math.max(...SS.map(s => s.id)); S.aliases = d.aliases || {}; S.facts = d.facts || []; S.files = d.files || {};
  load(SS.find(s => s.id === d.cur) || SS[0]); return true;
}
// forget everything: sessions, device state, working state (tests start here)
export function reset() {
  SS = []; cur = null; sid = 0; S.cards = []; S.n = 0; S.aliases = {}; S.facts = []; S.files = {}; S.table = null; S.clause = null;
}

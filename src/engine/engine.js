// The entry point: submit(raw) reads a request and returns what happened. Cards are recomputed in
// place by rerun(); answers and slot flips go through it, so args stay the only state that matters.
import { S, T, runTool, toolByName, startJobs } from './core.js';
import './units.js';
import './calc.js';
import './dates.js';
import './orientation.js';
import './table.js';
import './knowledge.js';
import './device.js';
import './structure.js';
import './geo.js';
import './timescale.js';
import './sample.js';
import './explain.js';
import './convert.js';
import './calendar.js';
import './estimate.js';
import './chem.js';
import './text.js';
import './forms.js';
import './econ.js';
import './log.js';
import './places.js';
import './sky.js';
import './apply.js';
import './python.js';
import { DOCUMENT } from './interchange.js';
import { convertBinary } from './formats.js';
import './notes.js';
import { norm, grammar, context, taught } from './reading.js';
import { current, newSession, renameSession, touch } from './sessions.js';

export function addCard(raw, r, ms) {
  const c = { id: ++S.n, raw, tool: r.tool, args: r.args, rung: r.rung, amends: r.amends, res: r.res, ms };
  S.cards.push(c); touch(); startJobs([c], rerun); return c;
}
export function rerun(c) {
  const t0 = performance.now(); c.res = runTool(c.tool, c.args); c.ms = performance.now() - t0; touch(); startJobs([c], rerun); return c;
}
// an ambiguous slot cycles through its alternatives
export function flipSlot(c, key) {
  const s = c.res.read.find(x => x.key === key); if (!s || !s.alts) return null;
  c.args[s.key] = s.alts[(s.alts.indexOf(s.cur) + 1) % s.alts.length]; return rerun(c);
}
// an open question answered by option index
export function answer(c, i) {
  const o = c.res.ask && c.res.ask.options[i]; if (!o) return null;
  c.res.ask.set(c.args, o.value); rerun(c); return o;
}
export function undo() {
  const c = S.cards.pop(); if (!c) return null;
  const d = toolByName(c.tool); if (d && d.undo) d.undo(c.args);
  if (c.amends) { const prev = S.cards.find(x => x.id === c.amends); if (prev) rerun(prev); }   // an amendment undone: the card it amended stands again
  touch(); return c;
}

// Outcomes: { kind: 'empty' | 'new-session' | 'drawer' | 'rename', name | 'answered', card, label
//             | 'undo', card | 'nothing', msg | 'card', card }
export function submit(raw) {
  raw = raw.trim(); if (!raw) return { kind: 'empty' };
  const t0 = performance.now(), text = norm(raw), q = text.toLowerCase(), last = S.cards[S.cards.length - 1];
  let m;
  if (/^(start )?(a )?new session$/.test(q)) { newSession(); return { kind: 'new-session' }; }
  if (!current()) newSession();
  if (/^(sessions|history|menu)$/.test(q)) return { kind: 'drawer' };
  if ((m = /^(?:(?:name|call|rename) this(?: session)?|rename(?: the)? session)(?: to| as)? (.+)$/.exec(q))) { const name = text.slice(-m[1].length); renameSession(current().id, name); return { kind: 'rename', name }; }
  if (last && last.res.ask) {
    const os = last.res.ask.options, o = os.find(x => x.label.toLowerCase() === q || String(x.value) === q) || os.find(x => x.label.length >= 3 && (x.label.toLowerCase().startsWith(q) || q.includes(x.label.toLowerCase()))) || (os.length === 1 && /^(yes|ok|okay|sure|do it|go)$/.test(q) ? os[0] : null);
    if (o) { last.res.ask.set(last.args, o.value); rerun(last); return { kind: 'answered', card: last, label: o.label }; }
    if (last.res.ask.parse) { const v = last.res.ask.parse(text); if (v != null) { last.res.ask.set(last.args, v); rerun(last); return { kind: 'answered', card: last, label: Array.isArray(v) ? v.join(', ') : String(v) }; } }
  }
  if (/^undo( that)?$/.test(q)) { const c = undo(); return c ? { kind: 'undo', card: c } : { kind: 'nothing', msg: 'Nothing to undo.' }; }
  if (/^(again|repeat|rerun|do it again)$/.test(q)) return last ? submit(last.raw) : { kind: 'nothing', msg: 'Nothing to repeat.' };
  const r = context(q, last) || grammar(text, q, 'grammar', raw) || taught(text, q, raw) || { tool: 'none', args: { q }, rung: 'none', res: T.none({ q }) };
  return { kind: 'card', card: addCard(raw, r, performance.now() - t0) };
}

// a 32-bit FNV-1a of the text: the key of a file in the device store, and what a card remembers of it
export function hashOf(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
// a file the person picked: kept on the device by hash, opened as a card
export function openFile(name, text) {
  if (!current()) newSession();
  const t0 = performance.now(), hash = hashOf(text);
  S.files[hash] = { name, hash, text, size: text.length };
  // a drawing, a YAML or a geometry file is converted, not opened as a table
  if (DOCUMENT.test(name)) { const args = { file: { name, hash } }, res = T.convertFile(args); return { kind: 'card', card: addCard(`open ${name}`, { tool: 'convertFile', args, rung: 'grammar', res }, performance.now() - t0) }; }
  const args = { file: { name, hash } }, res = T.open(args);
  return { kind: 'card', card: addCard(`open ${name}`, { tool: 'open', args, rung: 'grammar', res }, performance.now() - t0) };
}

// an xlsx or .dm from the picker: converted to text per table by the vendored readers, kept, then opened
export async function openBinary(name, buffer) {
  if (!current()) newSession();
  const t0 = performance.now();
  let conv; try { conv = await convertBinary(name, buffer); } catch (e) { return { kind: 'nothing', msg: `Could not read ${name}: ${e.message}.` }; }
  const names = Object.keys(conv.tables), text = conv.tables[names[0]], hash = hashOf(names.map(n => n + '\n' + conv.tables[n]).join('\n'));
  S.files[hash] = { name, hash, text, size: names.reduce((s, n) => s + conv.tables[n].length, 0), from: conv.from, lost: conv.lost, convTrace: conv.trace, ...(names.length > 1 ? { tables: conv.tables } : { sheet: names[0] }) };
  const args = { file: { name, hash } }, res = T.open(args);
  return { kind: 'card', card: addCard(`open ${name}`, { tool: 'open', args, rung: 'grammar', res }, performance.now() - t0) };
}

// two example sessions for a first visit
export function seedExamples() {
  newSession(true); ['open assays.csv', 'histogram of cu', 'log scale', 'histogram of au'].forEach(x => submit(x));
  newSession(true); ['0.35 oz per short ton in g/t', 'true thickness of a 14 m intercept, hole 270/60, bedding 045/30', 'remind me to send the samples to the lab on friday at 9', 'pop of mongolia'].forEach(x => submit(x));
}

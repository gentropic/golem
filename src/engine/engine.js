// The entry point: submit(raw) reads a request and returns what happened. Cards are recomputed in
// place by rerun(); answers and slot flips go through it, so args stay the only state that matters.
import { S, T, runTool, toolByName, startJobs, tool, CONDITIONS, EFFECTS, clock, iso } from './core.js';
import './units.js';
import './calc.js';
import './dates.js';
import './orientation.js';
import './table.js';
import './knowledge.js';
import './factbook.js';
import './books.js';
import './device.js';
import './structure.js';
import './geo.js';
import './field.js';
import './notebook.js';
import './minerals.js';
import './reckon.js';
import './share.js';
import './lore.js';
import './orders.js';
import './selftest.js';
import './vocab.js';
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
import { DOCTEXT } from './docs.js';
import { bindingsOf, runSteps } from './recipes.js';
import { tableFromText } from './table.js';
import { convertBinary } from './formats.js';
import './notes.js';
import { noteMiss, clearMiss, correctionOf, teachOfPick, notePick, setReader } from './learn.js';
import { norm, grammar, context, taught, sessionRead, readingOf, guessRead, clauseEngine } from './reading.js';
import { makeSession } from '../vendor/dispatch.js';
import { current, newSession, renameSession, touch } from './sessions.js';
import { streamedTable } from './stream.js';   // last: it wraps the table tools the modules above registered

export function addCard(raw, r, ms) {
  const c = { id: ++S.n, raw, tool: r.tool, args: r.args, rung: r.rung, amends: r.amends, res: r.res, ms };
  if (r.cmd !== undefined) Object.defineProperty(c, 'cmd', { value: r.cmd, writable: true, enumerable: false });   // the clause command, for amendments; not stored
  S.cards.push(c); touch(); startJobs([c], rerun); return c;
}
// what a request taught as a whole must be: something that reads by itself (learn.js checks it before keeping it)
setReader(q => { const r = readingOf(q, null); return r && r.tool && ['grammar', 'taught'].includes(r.rung) && r.tool !== 'misses' ? r.echo : null; });
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
  // a guess picked: the card becomes that tool's card, still marked as a guess (the rung is kept with the session)
  if (c.tool === 'guess') {
    const k = c.args.cands[o.value], from = c.args.cands.length;
    c.tool = k.tool; c.args = JSON.parse(JSON.stringify(k.args)); rerun(c);
    if (c.res) c.res.trace.unshift(`guess: read as ${k.echo}${k.changes.length ? ' (' + k.changes.join('; ') + ')' : ''}, picked from ${from}`);
    // the pick is learned from: the tool counts for the next guesses, and the repaired word is offered to teach
    notePick(k.tool); clearMiss(c.raw); touch();
    const teach = teachOfPick(k); return teach ? { ...o, teach } : o;
  }
  c.res.ask.set(c.args, o.value); rerun(c); return o;
}
// A reading from the device (a compass reading, a position) for a card that asked for one (res.capture): it goes into
// the card's args through the tool's own setter, so the session keeps it and a replay shows it again, unmeasured.
export function capture(c, v) {
  const k = c && c.res && c.res.capture; if (!k || v == null || typeof v !== 'object') return null;
  k.set(c.args, JSON.parse(JSON.stringify(v))); rerun(c); touch(); return c;
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
  // the session's own commands, read by the clause parser over the session frames
  const s = sessionRead(raw);
  if (s && s.session === 'new') { newSession(); return { kind: 'new-session' }; }
  if (!current()) newSession();
  if (s && s.session === 'drawer') return { kind: 'drawer' };
  if (s && s.session === 'rename') { renameSession(current().id, s.name); return { kind: 'rename', name: s.name }; }
  if (last && last.res.ask) {
    // a typed list ("a, b") is an answer of several, before any one option is matched loosely inside it
    const many = last.res.ask.parse && /,|\band\b/.test(q) ? last.res.ask.parse(text) : null;
    if (Array.isArray(many) && many.length > 1) { last.res.ask.set(last.args, many); rerun(last); return { kind: 'answered', card: last, label: many.join(', ') }; }
    // an option by its label, as the card wrote it; "yes" when there is only one
    const os = last.res.ask.options, o = os.find(x => x.label.toLowerCase() === q) || os.find(x => x.label.length >= 3 && (x.label.toLowerCase().startsWith(q) || q.includes(x.label.toLowerCase()))) || (os.length === 1 && s && s.session === 'yes' ? os[0] : null);
    if (o && last.tool === 'guess') { const p = answer(last, os.indexOf(o)); return { kind: 'answered', card: last, label: o.label, ...(p && p.teach ? { teach: p.teach } : {}) }; }
    if (o) { last.res.ask.set(last.args, o.value); rerun(last); return { kind: 'answered', card: last, label: o.label }; }
    if (last.res.ask.parse) { const v = last.res.ask.parse(text); if (v != null) { last.res.ask.set(last.args, v); rerun(last); return { kind: 'answered', card: last, label: Array.isArray(v) ? v.join(', ') : String(v) }; } }
  }
  if (s && s.session === 'undo') { const c = undo(); return c ? { kind: 'undo', card: c } : { kind: 'nothing', msg: 'Nothing to undo.' }; }
  if (s && s.session === 'again') return last ? submit(last.raw) : { kind: 'nothing', msg: 'Nothing to repeat.' };
  if (s && s.session === 'yes') return { kind: 'nothing', msg: last && last.res.ask ? 'Which one? Tap an option or type it.' : 'Nothing is waiting for a yes.' };
  // a saved recipe by name: replayed with the new subjects into a session of its own (a batch on every table is a card)
  if (s && s.session === 'recipe') return runRecipe(S.recipes[s.name], s.rest);
  // a request in steps ("open assays.csv then mean cu by lith"): only when the whole does not read as one command
  const steps = stepsOf(raw, last); if (steps) return chain(steps, raw);
  // a whole command first; then what amends the last card ("in feet", "2 sentences"); then the words taught on this device
  const r = grammar(text, q, 'grammar', raw) || context(q, last, raw) || taught(text, q, raw) || guessRead(raw) || { tool: 'none', args: { q }, rung: 'none', res: T.none({ q }) };
  // learned from (learn.js): what did not read goes on the device's list; what read comes off it, and when it follows
  // something that did not read, the stretch that changed is offered as a word to teach
  if (r.rung === 'none' || r.rung === 'guess') noteMiss(raw, iso(clock.now())); else clearMiss(raw);
  const teach = r.rung === 'none' || r.rung === 'guess' ? null : correctionOf(last, raw);
  return { kind: 'card', card: addCard(raw, r, performance.now() - t0), ...(teach ? { teach } : {}) };
}

/* ── the planner's sequence: steps said in order ── */
// Where a request is cut into steps: at "then" ("and then", ", then"; "depois", "em seguida"), as the clause tokenizer
// finds the word (never inside a quoted value). Only when the whole does not read as one command, so a payload that
// happens to say "then" ("word count: we went in then left") stays whole; and only when the first step reads alone.
const STEP_WORDS = new Set(['then', 'afterwards', 'depois', 'então', 'em seguida']);
function stepsOf(raw, last) {
  const { toks } = clauseEngine().tokenize(raw, { names: {} }), cuts = [];
  toks.forEach((tk, i) => {
    if (!tk.senses.some(x => x.cat === 'THEN') || !STEP_WORDS.has(raw.slice(tk.s, tk.e).toLowerCase())) return;
    let from = tk.s; for (let j = i - 1; j >= 0 && toks[j].senses.some(x => x.cat === 'CONJ' || x.cat === 'COMMA'); j--) from = toks[j].s;
    cuts.push([from, tk.e]);
  });
  if (!cuts.length) return null;
  const pieces = []; let at = 0;
  for (const [a, b] of cuts) { pieces.push(raw.slice(at, a)); at = b; }
  pieces.push(raw.slice(at));
  const out = pieces.map(p => p.trim().replace(/^[,;]\s*|[,;]\s*$/g, '')).filter(Boolean);
  if (out.length < 2) return null;
  const done = p => { const v = previewOne(p); return !!v && v.rung !== 'partial' && v.rung !== 'ambiguous'; };
  // the grammar read a sequence: the steps it saw
  if (['en', 'pt'].some(l => { const r = clauseEngine(l).understand(raw, makeSession([])); return r.status === 'ok' && r.commands.length > 1; })) return out;
  // the whole reads as one command: steps only if every one reads alone (a payload that says "then" stays whole)
  const whole = previewOne(raw);
  if (whole && whole.rung !== 'partial') return out.every(done) ? out : null;
  // the whole does not read: steps if the first one does (the later ones read after it runs)
  return done(out[0]) ? out : null;
}
// The plan, checked before any of it runs: every step is read now, against the state as it is, and against the step
// before it (an amendment such as "log scale" reads against the card that step will make). What a step needs (`pre`)
// is met when it holds now or an earlier step establishes it (`post`); what each step does beyond its card
// (`effects`) is said. A step that does not read now may still read once an earlier step has run, but only when one
// could change what reads (it establishes something: open makes the columns words), or when the step before it could
// not be read ahead either; otherwise nothing runs. A step needing what only a later step establishes is out of order.
// → { steps: [{ raw, tool?, echo?, now, needs, post, effects, after? }], stop?: { n, raw, why, readings?, by? } }
export function planOf(pieces) {
  const steps = [], have = new Set(); let prev = S.cards[S.cards.length - 1] || null, changes = 0, blind = false;
  for (const [i, p] of pieces.entries()) {
    const s = sessionRead(p); if (s && s.session) { steps.push({ raw: p, session: s.session, now: true, needs: [], post: [], effects: [] }); if (s.session === 'new') prev = null; continue; }
    let r = null; try { r = readingOf(p, prev); } catch (e) { r = null; }
    if (r && r.tool && ['grammar', 'context', 'taught'].includes(r.rung)) {
      const d = toolByName(r.tool) || {}, post = d.post || [];
      const needs = (d.pre || []).filter(c => !have.has(c) && !(CONDITIONS[c] && CONDITIONS[c].holds()));
      const by = needs.length && pieces.slice(i + 1).findIndex((q, j) => { try { const x = readingOf(q, null); return x && x.tool && ((toolByName(x.tool) || {}).post || []).some(c => needs.includes(c)); } catch (e) { return false; } });
      if (needs.length && by >= 0) return { steps, stop: { n: i + 1, raw: p, why: 'order', needs, by: i + by + 2 } };
      steps.push({ raw: p, tool: r.tool, echo: r.echo, now: true, needs, post, effects: d.effects || [] });
      post.forEach(c => have.add(c)); if (post.length) changes = i + 1;
      prev = { id: 0, raw: p, tool: r.tool, args: r.args, rung: r.rung, res: { read: [] } }; blind = false;
    } else if (changes || blind) {
      steps.push({ raw: p, now: false, needs: [], post: [], effects: [], after: changes || i }); prev = null; blind = true;
    } else return { steps, stop: { n: i + 1, raw: p, why: r && r.rung === 'ambiguous' ? 'ambiguous' : 'none', readings: r && r.readings } };
  }
  return { steps };
}
// what the preview and the card say about a plan: its effects and what waits for an earlier step
function planNotes(plan) {
  const out = [];
  plan.steps.forEach((s, i) => {
    for (const e of s.effects) out.push(`step ${i + 1} ${EFFECTS[e]}`);
    if (s.needs.length) out.push(`step ${i + 1} asks for a ${s.needs.join(', ')} first`);
    if (!s.now) out.push(`step ${i + 1} is read once step ${s.after} has run`);
  });
  return out;
}
// the card a plan ends with when it was stopped before anything ran
tool({
  name: 'planStop',
  run: a => {
    const why = a.why === 'order' ? `needs a ${a.needs.join(', ')}, and step ${a.by} is what provides it: say that step first`
      : a.why === 'ambiguous' ? `reads more than one way (${(a.readings || []).join(' | ')})` : 'does not read';
    return { read: ['plan of', { v: String(a.of) }, 'steps, stopped at step', { v: String(a.n) }],
      body: [{ t: 'note', kind: 'err', text: `Step ${a.n} of ${a.of}, "${a.raw}", ${why}. None of the steps ran: I check a plan before running any of it.` },
        ...(a.order ? [{ t: 'chips', items: [a.order] }] : [])],
      trace: [`plan: "${a.whole}" checked, step ${a.n} ${a.why === 'order' ? 'out of order' : a.why === 'ambiguous' ? 'ambiguous' : 'does not read'}; nothing ran`] };
  }
});
// Each step is read and run after the one before it, so the second reads what the first opened ("lith" is a column
// only once the table is open). The plan is checked first (planOf): one that cannot run as said runs nothing. A step
// read once the one before it has run that then does not read, or one that asks a question, stops the chain there.
function chain(pieces, raw) {
  const plan = planOf(pieces);
  if (plan.stop) {
    const st = plan.stop, order = st.why === 'order' ? [pieces[st.by - 1], ...pieces.filter((_, k) => k !== st.by - 1)].join(' then ') : null;
    const args = { whole: raw, of: pieces.length, n: st.n, raw: st.raw, why: st.why, ...(st.needs ? { needs: st.needs, by: st.by } : {}), ...(st.readings ? { readings: st.readings } : {}), ...(order ? { order } : {}) };
    return { kind: 'card', card: addCard(raw, { tool: 'planStop', args, rung: 'none', res: T.planStop(args) }, 0) };
  }
  const cards = []; let fresh = false;
  for (const [i, p] of pieces.entries()) {
    const o = submit(p);
    if (o.kind === 'new-session') { fresh = true; continue; }
    if (o.kind !== 'card') break;
    o.card.res.trace.unshift(`plan: step ${i + 1} of ${pieces.length} of "${raw}"`); cards.push(o.card);
    if (['none', 'guess'].includes(o.card.rung) || o.card.res.ask) break;
  }
  return { kind: 'cards', cards, fresh, steps: pieces.length };
}

// What the composer would do with this text, without doing it: submit()'s order, dry. → { rung, echo } or null.
// A request in steps previews as its steps.
export function preview(raw) {
  raw = raw.trim(); if (!raw) return null;
  const steps = stepsOf(raw); if (!steps) return previewOne(raw);
  const plan = planOf(steps), st = plan.stop;
  if (st) return { rung: 'none', echo: `${steps.length} steps; step ${st.n}, "${st.raw}", ${st.why === 'order' ? `needs what step ${st.by} provides` : st.why === 'ambiguous' ? 'reads more than one way' : 'does not read'}: none would run`, steps: steps.length, stop: st.n };
  const notes = planNotes(plan);
  return { rung: 'grammar', echo: `${steps.length} steps: ${steps.join(' → ')}${notes.length ? ' · ' + notes.join('; ') : ''}`, steps: steps.length, notes };
}
function previewOne(raw) {
  raw = raw.trim(); if (!raw) return null;
  const text = norm(raw), q = text.toLowerCase(), last = S.cards[S.cards.length - 1];
  const s = sessionRead(raw);
  if (s && ['new', 'drawer', 'rename', 'undo', 'again', 'recipe'].includes(s.session)) return { rung: 'context', echo: s.echo };
  if (last && last.res.ask) {
    const os = last.res.ask.options, o = os.find(x => x.label.toLowerCase() === q) || os.find(x => x.label.length >= 3 && (x.label.toLowerCase().startsWith(q) || q.includes(x.label.toLowerCase()))) || (os.length === 1 && s && s.session === 'yes' ? os[0] : null);
    if (o) return { rung: 'context', echo: `answers #${String(last.id).padStart(2, '0')}: ${o.label}` };
  }
  return readingOf(raw, last);
}

// run a recipe: a new session named after it and its bindings, one card per step, stopping at the first
// step that does not read, with a card that says which and why
function runRecipe(recipe, rest) {
  const b = bindingsOf(recipe, rest); if (b.err) return { kind: 'nothing', msg: b.err };
  const s = newSession(); renameSession(s.id, `${recipe.name}: ${b.bindings.length ? b.bindings.map(x => x.to).join(', ') : 'as saved'}`);
  const out = runSteps(recipe, b.bindings, (spec, res) => { if (res) addCard(spec.raw, { tool: spec.tool, args: spec.args, rung: 'grammar', res }, 0); });
  if (out.stop) { const args = { name: recipe.name, n: out.stop.n, of: recipe.steps.length, raw: out.stop.raw, why: out.stop.why }; addCard(`recipe ${recipe.name}: stopped`, { tool: 'recipeStop', args, rung: 'grammar', res: T.recipeStop(args) }, 0); }
  return { kind: 'recipe', session: s, msg: out.stop ? `${recipe.name} stopped at step ${out.stop.n} of ${recipe.steps.length}.` : `Ran ${recipe.name}: ${out.ran} steps, in a session of its own.` };
}

// a 32-bit FNV-1a of the text: the key of a file in the device store, and what a card remembers of it
export function hashOf(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
// a .txt is a table when recon finds columns; split on spaces, only when every line has the same number of fields
function tabular(name, text, hash) {
  const t = tableFromText(name, text, hash); if (!t || t.cols.length < 2) return false;
  if (t.delimiter !== ' ') return true;
  const counts = new Set(text.split(/\r?\n/).filter(l => l.trim()).map(l => l.trim().split(/\s+/).length));
  return counts.size === 1;
}
// a file the person picked: kept on the device by hash, opened as a card
// a text table too large to hold (over 20 MB): kept by the shell, typed from its head, scanned per question (stream.js)
export function openStreamed(name, size, head) {
  if (!current()) newSession();
  const t0 = performance.now(), hash = hashOf(`${name}:${size}:${head.slice(0, 65536)}`);
  const s = streamedTable(name, size, head, hash); if (s.err) return { kind: 'nothing', msg: s.err };
  S.files[hash] = { name, hash, size, streamed: true, head: head.slice(0, 1 << 20), text: '' };
  const args = { file: { name, hash } }, res = T.open(args);
  return { kind: 'card', card: addCard(`open ${name}`, { tool: 'open', args, rung: 'grammar', res }, performance.now() - t0), hash };
}
export function openFile(name, text) {
  if (!current()) newSession();
  const t0 = performance.now(), hash = hashOf(text);
  S.files[hash] = { name, hash, text, size: text.length };
  // Markdown, HTML or prose is kept as a document to search; a .txt that holds a table opens as one
  if (DOCTEXT.test(name) && !(/\.txt$/i.test(name) && tabular(name, text, hash))) {
    S.files[hash].kind = 'doc';
    const args = { file: { name, hash } }, res = T.docOpen(args);
    return { kind: 'card', card: addCard(`open ${name}`, { tool: 'docOpen', args, rung: 'grammar', res }, performance.now() - t0) };
  }
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

// The reading ladder: context (amendments, meta-intents), grammar (the clause parser, then the regex
// rules the declarations carry), taught words (device lexicon rewrites, then grammar again). Plus the
// tools that talk about the session itself: none, why, export.
import { S, T, TOOLS, FRAMES, tool, frame, amend, session, noun, toolByName, runTool, iso } from './core.js';
import { examples, vocab } from './skills.js';
import { ontology } from './ontology.js';
import { calcOf } from './calc.js';
import { estimateOf } from './estimate.js';
import { createEngine, makeSession, ENGLISH, PORTUGUESE } from '../vendor/dispatch.js';

// The languages golem reads, the person's first: a phrase reads in whichever it is in ("converte 5 km para mi" or
// "convert 5 km to mi"), and a tie goes to the person's. The shell sets it (the device's language, or the choice).
const LOCALES = { en: ENGLISH, pt: PORTUGUESE };
let order = ['en', 'pt'];
export function setLanguage(l) { order = l === 'pt' ? ['pt', 'en'] : ['en', 'pt']; }
export const language = () => order[0];
// an engine per language over the same ontology, rebuilt when the ontology changes
function enginesFor(cache, o) { const key = JSON.stringify(o); if (cache.key !== key) { cache.key = key; cache.E = {}; } return loc => cache.E[loc] || (cache.E[loc] = createEngine(o, LOCALES[loc])); }

export const norm = s => s.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');

/* ── rung 2, first half: the clause parser over golem's ontology ── */
const clauses = {};
// rebuilt whenever what it reads changes: the open table's columns, kept files, saved places, logged activities
export const clauseEngine = (loc = order[0]) => enginesFor(clauses, ontology())(loc);
const clauseSession = () => makeSession([]);   // no memory of its own: what came before is the cards', read by the context rung
// The parser's verdict on a text, then the frame's bind(): a frame may answer { tool, args }, or
// { clarify } when the reading is whole but a value is missing, which becomes a clarify verdict too.
// Only the first command of a sequence is read here; a request in steps is cut and read step by step by submit() (stepsOf in engine.js).
// When the grammar finds several readings, each is bound: if exactly one names a tool that takes it, that is the
// reading ("python" is a verb and a format; only the verb has a tool for "python\n<code>"), and the trace says so.
const bindOf = cmd => { const f = FRAMES.find(x => x.name === cmd.verb), b = f && f.bind(cmd); return b && !b.clarify ? b : null; };
// in the person's language, then the other; the first that binds a tool is the reading, else the person's verdict. The
// other language counts only as written: its typo repairs would turn an English word into a Portuguese one ("decode"
// into "decide") ahead of the rungs that read it as meant
const repaired = r => (r.diag && r.diag.notes || []).some(n => /^read ".*" as ".*"$/.test(n)) || (r.diag && r.diag.repairs && r.diag.repairs.length > 0);
function verdictOf(text, session, opts, engine) {
  if (engine) return verdictIn(engine, text, session, opts);
  const first = verdictIn(clauseEngine(order[0]), text, session, opts); if (first.b) return first;
  const second = verdictIn(clauseEngine(order[1]), text, session, opts); return second.b && !repaired(second.r) ? second : first;
}
function verdictIn(E, text, session, opts) {
  let r = E.understand(text, session, opts);
  if (r.status === 'ambiguous' && r.alternatives) {
    const bound = r.alternatives.map((cmds, k) => ({ cmds, echo: r.readings[k], b: bindOf(cmds[0]) })).filter(x => x.b);
    const takers = bound.filter((x, i) => bound.findIndex(y => JSON.stringify(y.b) === JSON.stringify(x.b)) === i);   // the same call twice is one reading
    if (takers.length !== 1) return { r };
    const t = takers[0];
    r = { status: 'ok', commands: t.cmds, echo: t.echo, diag: { ...r.diag, notes: [...r.diag.notes, `${r.readings.length} readings; only "${t.echo.replace(/\.$/, '')}" names a tool that takes it`] } };
    return { r, b: t.b };
  }
  if (r.status !== 'ok') return { r };
  const cmd = r.commands[0], f = FRAMES.find(x => x.name === cmd.verb), b = f && f.bind(cmd), echo = r.echo.replace(/\.$/, '');
  if (!b) return { r: { status: 'clarify', reasons: [`I read "${echo}" but no tool takes that`], partial: [echo], diag: r.diag } };
  if (b.clarify) return { r: { status: 'clarify', reasons: [b.clarify], partial: [echo], diag: r.diag } };
  return { r, b };
}
export function clauseRead(text, rung) {
  const { r, b } = verdictOf(text, clauseSession());
  if (!b) return { verdict: r };
  const res = runTool(b.tool, b.args); if (!res) return { verdict: r };
  res.trace.unshift(`clause: ${r.echo}`, ...r.diag.notes.map(n => `clause: ${n}`));
  return { tool: b.tool, args: b.args, rung, res, cmd: r.commands[0] };
}
const describeVerdict = r => `clause: ${r.status}${r.reasons ? ' — ' + r.reasons.join('; ') : r.readings ? ' — ' + r.readings.join(' | ') : ''}`;

/* ── rung 2, second half: expressions, read by their own parsers (dispatch SPEC: arithmetic stays outside the grammar) ── */
// The words in front ("please", "what is", "calculate") are found by the clause tokenizer, never by a pattern: the
// expression starts at the first token the lexicon does not know as a filler, a question word or a calculating verb.
function expressionOf(raw) {
  const { toks } = clauseEngine().tokenize(raw, { names: {} });
  let k = 0; while (k < toks.length && toks[k].senses.some(s => s.cat === 'WHCOP' || s.cat === 'COLON' || (s.cat === 'VERB' && s.verb === 'calc'))) k++;
  return k < toks.length ? raw.slice(toks[k].s, toks[toks.length - 1].e).trim() : null;   // to the last word kept: trailing fillers ("for me") and punctuation go
}
function expressionRead(raw, rung) {
  const x = expressionOf(raw); if (!x) return null;
  for (const [tool, args] of [['calc', calcOf(x)], ['estimate', estimateOf(x)]]) {
    if (!args) continue;
    const res = runTool(tool, args); if (res) { res.trace.unshift(`expression: "${x}"`); return { tool, args, rung, res }; }
  }
  return null;
}
export function grammar(text, q, rung, raw) {
  const c = clauseRead(raw || text, rung); if (c.tool) return c;   // the parser reads what was typed: a payload keeps its line breaks
  return expressionRead(raw || text, rung);
}
/* ── the context rung: what amends the last card ── */
// The clause command behind a card: kept when the card was read, recovered from its words when it was replayed (an
// amendment from the command it amended). null when the card was not read by the grammar.
export function commandOf(card) {
  if (card.cmd !== undefined) return card.cmd;
  let cmd = null;
  if (card.amends) { const base = S.cards.find(x => x.id === card.amends), bc = base && commandOf(base); if (bc) { const s = makeSession([]); s.last = bc; const v = verdictOf(card.raw, s, { fragment: true }); if (v.b) cmd = v.r.commands[0]; } }
  else if (card.rung !== 'none') { const v = verdictOf(card.raw, makeSession([])); if (v.b && v.b.tool === card.tool) cmd = v.r.commands[0]; }
  Object.defineProperty(card, 'cmd', { value: cmd, writable: true, enumerable: false });
  return cmd;
}
// what an amendment changes: the arguments its reading sets differently from the reading of the card as it stands,
// laid over the card's own arguments (so a flipped slot or an answered question stays)
function changed(card, before, after) {
  const args = JSON.parse(JSON.stringify(card.args));
  for (const k of new Set([...Object.keys(after), ...Object.keys(before || {})])) {
    if (JSON.stringify(after[k]) === JSON.stringify((before || {})[k])) continue;
    if (after[k] === undefined) delete args[k]; else args[k] = after[k];
  }
  return args;
}
// a fragment of the last command: "in feet", "and chile", "log scale", "by lith", "where au > 1", "tomorrow"
function fragmentRead(raw, last, dry) {
  const base = commandOf(last); if (!base) return null;
  const s = makeSession([]); s.last = base;
  const { r, b } = verdictOf(raw, s, { fragment: true }); if (!b || b.tool !== last.tool) return null;
  if (dry) return { amends: last.id, echo: r.echo };
  const before = bindOf(base), args = changed(last, before && before.tool === last.tool ? before.args : null, b.args);
  const res = runTool(last.tool, args); if (!res) return null;
  res.trace.unshift(`clause: amends #${String(last.id).padStart(2, '0')}: ${r.echo}`);
  return { tool: last.tool, args, rung: 'context', amends: last.id, res, cmd: r.commands[0] };
}
// an amendment frame of the last card's tool: "2 sentences", "trace it", "next passage", "why"
let amendEngines = {};
function amendEngine(tool) {
  const frames = FRAMES.filter(f => f.amends && (f.amends.includes(tool) || f.amends.includes('*'))), o = ontology(frames), key = JSON.stringify(o);
  const cache = amendEngines[tool] || (amendEngines[tool] = {});
  return { frames, at: enginesFor(cache, o) };
}
function amendRead(raw, last, dry) {
  for (const loc of order) { const r = amendIn(raw, last, dry, loc, loc !== order[0]); if (r) return r; }
  return null;
}
function amendIn(raw, last, dry, loc, exact) {
  const { frames, at } = amendEngine(last.tool), E = at(loc);
  // a leading "and" joins the amendment to the card ("and median"); the tokenizer says where the rest starts
  const { toks } = E.tokenize(raw, { names: {} }); const text = toks.length > 1 && toks[0].senses.some(x => x.cat === 'CONJ') ? raw.slice(toks[1].s) : raw;
  const take = cmd => { const f = frames.find(x => x.name === cmd.verb), out = f && f.bind(cmd, last.args, last); return out ? { tool: out.tool || last.tool, args: out.args } : null; };
  const pick = r => { if (r.status === 'ok') return take(r.commands[0]); if (r.status === 'ambiguous' && r.alternatives) { const all = r.alternatives.map(c => take(c[0])).filter(Boolean); if (all.length === 1) return all[0]; } return null; };
  // with its verb ("trace it", "assume normal"), or as a fragment of one of the frames ("in milliseconds", "by character")
  let r = E.understand(text, makeSession([])), hit = pick(r);
  for (const f of frames) { if (hit) break; const s = makeSession([]); s.last = { verb: f.name, theme: [], roles: {} }; const rf = E.understand(text, s, { fragment: true }); hit = pick(rf); if (hit) r = rf; }
  if (!hit || (exact && repaired(r))) return null;
  if (dry) return { amends: last.id, echo: r.echo || r.readings[0] };
  const res = runTool(hit.tool, hit.args); if (!res) return null;
  res.trace.unshift(`clause: amends #${String(last.id).padStart(2, '0')}: ${(r.echo || r.readings[0]).replace(/\.$/, '')}`);
  return { tool: hit.tool, args: hit.args, rung: 'context', amends: last.id, res, cmd: hit.tool === last.tool ? commandOf(last) : null };
}
export function context(q, last, raw) {
  if (!last) return null;
  // the tool's own amendments are the more specific reading, so they go first; then the last command with a part changed
  return amendRead(raw || q, last) || fragmentRead(raw || q, last);
}
/* ── reading as you type: the same order as submit(), dry — nothing runs, nothing is added ── */
// → { rung, echo, amends? } when the text reads whole; { rung: 'partial', echo } when it reads so far (a hole where the
// rest goes); { rung: 'ambiguous', readings } when several readings survive and no tool settles it; null otherwise.
// It may promise a reading the tool then refuses (a value out of range); it never hides one submit() would find.
const clean = e => e.replace(/\.$/, '');
export function readingOf(raw, last) {
  if (!raw.trim()) return null;
  const v = verdictOf(raw, clauseSession());
  if (v.b) return { rung: 'grammar', echo: clean(v.r.echo) };
  const x = expressionOf(raw); if (x && (calcOf(x) || estimateOf(x))) return { rung: 'grammar', echo: `expression: ${x}` };
  const a = last && (amendRead(raw, last, true) || fragmentRead(raw, last, true)); if (a) return { rung: 'context', echo: `amends #${String(a.amends).padStart(2, '0')}: ${clean(a.echo)}`, amends: a.amends };
  if (Object.keys(S.aliases).length) {
    let t2 = ' ' + raw + ' '; Object.entries(S.aliases).forEach(([k, w]) => { t2 = t2.replace(new RegExp('(?<=\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)', 'gi'), w); });
    if (t2.trim() !== raw.trim()) { const t = verdictOf(t2.trim(), clauseSession()); if (t.b) return { rung: 'taught', echo: clean(t.r.echo) }; }
  }
  if (v.r.status === 'ambiguous') return { rung: 'ambiguous', readings: v.r.readings.map(clean) };
  const p = clauseEngine().preview(raw, makeSession([]));
  return p && !p.complete ? { rung: 'partial', echo: clean(p.echo) } : null;
}
// what may come next, from the grammar and the frames: role words, things of the open roles' types, verbs
export const completions = (raw, n = 6) => { try { return clauseEngine().suggest(raw, makeSession([]), n); } catch (e) { return []; } };
/* ── rung 3: taught words rewrite the query, then the grammar reads it again ── */
export function taught(text, q, raw) {
  let q2 = ' ' + q + ' ', t2 = ' ' + text + ' ';
  Object.entries(S.aliases).forEach(([k, v]) => { const re = new RegExp('(?<=\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)', 'gi'); q2 = q2.replace(re, v); t2 = t2.replace(re, v); });
  q2 = q2.trim(); if (q2 === q) return null;
  const r = grammar(t2.trim(), q2, 'taught', null);
  if (r) r.res.trace.unshift(`lexicon: "${q}" → "${q2}"`);
  return r;
}
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1])); return d[a.length][b.length]; }

/* ── rung 4: no exact reading; the grammar's repair pass offers readings that change the text slightly ── */
// Repairs are costed: an ignored word, an assumed preposition, an argument out of order, a one-letter slip. Within a
// budget of 3, the cheapest readings a tool takes (up to three) are offered on a "guess" card, each with what it
// changed. None runs until it is picked: a tap, or typing its words. Measured on 31 natural misses (14 Oct 2026):
// the right reading was offered first in 13, only wrong ones in 1; 1 of 20 off-topic lines drew an offer.
// (A statistical model trained from the frames was tried as well and added one hit and one wrong offer for 3 s of
// training; dispatch keeps it as an experiment, golem does not use it.)
const GUESS_BUDGET = 3;
// dispatch's echo ("True thickness true thickness; of 12 m; in hole 270/60") as a phrase: the frame's label once, its
// parts in order. Nothing runs to describe a guess: some tools write device state.
function phraseOf(echo) {
  const [head, ...rest] = echo.replace(/\.$/, '').split('; ');
  const w = head.split(' '), h = w.length % 2 === 0 && w.slice(0, w.length / 2).join(' ').toLowerCase() === w.slice(w.length / 2).join(' ').toLowerCase() ? w.slice(0, w.length / 2).join(' ') : head;
  return [h, ...rest].join(' ');
}
// what the reading changed, word by word: a typed word it reads as a near one, or one it leaves out (not the small words
// a reading rephrases anyway)
const GLUE = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'into', 'at', 'on', 'by', 'for', 'with', 'and', 'or', 'is', 'are', 'me', 'i', 'my', 'you', 'your', 'it', 'this', 'that',
  'do', 'did', 'does', 'can', 'how', 'where', 'when', 'which', 'who', 'about', 'please', 'what', 'whats']);
function changesOf(raw, phrase) {
  const has = new Set(phrase.toLowerCase().split(/[^a-z0-9./]+/).filter(Boolean)), out = [];
  for (const t of raw.toLowerCase().split(/[^a-z0-9./]+/).filter(Boolean)) {
    if (has.has(t) || /^[\d./]+$/.test(t) || GLUE.has(t)) continue;
    // a typo only for words long enough to have one: "convrt", "lithh"; a short word that is not there was left out
    const near = t.length < 4 ? null : [...has].filter(x => x.length >= 3 && !/^[\d./]+$/.test(x) && Math.abs(x.length - t.length) <= 2).map(x => [x, lev(x, t)]).filter(([, d]) => d > 0 && d <= (t.length >= 7 ? 2 : 1)).sort((a, b) => a[1] - b[1])[0];
    out.push(near ? `"${t}" read as "${near[0]}"` : `"${t}" left out`);
  }
  return out;
}
export function guessesOf(raw) {
  const E = clauseEngine(), r = E.understand(raw, clauseSession(), { repair: { budget: GUESS_BUDGET } });
  const cmds = r.status === 'ok' ? r.commands.slice(0, 1) : r.status === 'clarify' && r.repaired && r.commands ? r.commands.slice(0, 1) : r.status === 'ambiguous' ? (r.alternatives || []).map(a => a[0]) : [];
  const changes = (r.diag && r.diag.repairs) || [];
  const out = [], seen = new Set();
  for (const c of cmds) {
    const b = bindOf(c); if (!b) continue;
    const k = JSON.stringify(b); if (seen.has(k)) continue; seen.add(k);
    const echo = phraseOf(E.echo(c));
    out.push({ tool: b.tool, args: b.args, echo, changes: [...new Set([...changes, ...changesOf(raw, echo)])] });
  }
  return out.slice(0, 3);
}
export function guessRead(raw) {
  const cands = guessesOf(raw); if (!cands.length) return null;
  const args = { q: raw, cands }, res = runTool('guess', args);
  return res ? { tool: 'guess', args, rung: 'guess', res } : null;
}
tool({
  name: 'guess',
  run: a => ({
    read: ['no exact reading of', { v: a.q }],
    body: [{ t: 'note', text: `I could not read that as written. ${a.cands.length > 1 ? 'Each reading below changes it' : 'The reading below changes it'} slightly; pick one to run it, or rephrase. I do not run a guess on my own.` },
      { t: 'list', items: a.cands.map(c => `${c.echo}${c.changes.length ? ` (${c.changes.join('; ')})` : ''}`) }],
    ask: { prompt: a.cands.length > 1 ? 'Run one of these?' : 'Run it?', options: a.cands.map((c, i) => ({ label: c.echo, value: i })), set: () => {} },
    trace: ['grammar: no exact reading', `repair (budget ${GUESS_BUDGET}): ${a.cands.length} reading${a.cands.length > 1 ? 's' : ''} a tool takes`, ...a.cands.map(c => `offer: ${c.echo} — ${c.changes.join('; ') || 'as written'}`), 'wait: nothing runs until one is picked']
  })
});
/* ── rung 5: nothing read the query. Say so, show the nearest skills, offer to learn the unknown word ── */
tool({
  name: 'none',
  run: a => {
    // nearest by the words that carry meaning: "of" in common is no reason to suggest a skill
    const qt = new Set(a.q.split(/[^a-z0-9]+/).filter(t => t && !GLUE.has(t)));
    const near = examples().map(e => { const et = e.toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !GLUE.has(t)); return { e, s: et.filter(t => qt.has(t)).length / Math.sqrt(et.length * (qt.size || 1)) }; }).filter(x => x.s > 0 && !/ means /.test(x.e)).sort((x, y) => y.s - x.s).slice(0, 3);
    let teach = null;
    for (const t of a.q.split(/[^a-z]+/)) {
      if (t.length < 3 || vocab().has(t) || S.aliases[t]) continue;
      const c = [...vocab()].find(v => v.length > t.length && v.startsWith(t)) || [...vocab()].find(v => Math.abs(v.length - t.length) <= 1 && lev(v, t) === 1);
      if (c) { teach = `${t} means ${c}`; break; }
    }
    const verdict = verdictOf(a.q, makeSession([])).r;
    const partial = verdict.status === 'clarify' && verdict.partial ? verdict.partial.join(' / ').replace(/\.$/, '') : null;
    return {
      read: partial ? ['read so far', { v: partial }] : [],
      body: [partial ? { t: 'note', kind: 'err', text: `Not enough to act on: ${verdict.reasons.join('; ')}. I do not guess.` } : { t: 'note', kind: 'err', text: 'No reading, so no answer. I do not guess.' },
        ...(near.length ? [{ t: 'lbl', text: 'Nearest skills' }, { t: 'chips', items: near.map(x => x.e) }] : [{ t: 'sub', text: 'Nothing close. This lists what I can do:' }, { t: 'chips', items: ['what can you do'] }]),
        ...(teach ? [{ t: 'lbl', text: 'Teach me the word' }, { t: 'chips', items: [teach] }] : [])],
      trace: ['context: no open question, no amendment fits', describeVerdict(verdict), 'grammar: no rule matched', 'lexicon: no taught phrase applies', 'stop']
    };
  }
});
tool({
  name: 'why',
  skill: { group: 'Session', title: 'Explain', on: 'plan', about: 'Shows the plan behind the last answer.', examples: ['why'] },
  run: a => {
    const c = S.cards.find(x => x.id === a.ref);
    return { read: ['explain card', { v: '#' + String(c.id).padStart(2, '0') }], body: [{ t: 'steps', items: c.res.trace }, { t: 'sub', text: 'These are the steps that ran, with their inputs. I can show how an answer was computed. I cannot say why the data looks the way it does.' }], trace: ['plan.of(card) → steps'] };
  }
});
tool({ name: 'amend', skill: { group: 'Session', title: 'Amend, repeat, undo', on: 'dispatch-meta', about: 'Change the last card without retyping it.', examples: ['in feet', 'log scale', 'and chile', 'again', 'undo'] } });
tool({ name: 'sessions', skill: { group: 'Session', title: 'Sessions and history', on: 'plan store', about: 'Sessions name themselves from the tools that ran. Search covers all of them.', examples: ['new session', 'name this session friday lab run', 'history'] } });
tool({
  name: 'export',
  skill: { group: 'Session', title: 'Export the plan', on: 'adder', about: 'The session as a script. Every line is a tool call it made.', examples: ['export as script'] },
  run: () => {
    const body = S.cards.filter(c => c.res.py).map(c => `# ${c.raw}\n${c.res.py}`).join('\n\n');
    const src = `# golem session, exported ${iso(new Date())}\n# every line is a tool call the session made\nfrom gcu import *\n\n${body || '# nothing to export yet'}`;
    return { read: ['export session as', { v: 'adder script' }], copy: src, body: [{ t: 'pre', text: src }, { t: 'actions', items: [{ act: 'copy', label: 'Copy script' }] }, { t: 'src', text: 'plan → adder · names are illustrative, the real packages decide the API' }], trace: ['collect the tool call behind each card', 'emit as adder source'] };
  }
});
frame({
  name: 'export', label: 'Export', words: ['export', 'save', 'write', 'give me'], elidable: true, theme: ['table'], required: ['as'], roles: { as: { preps: ['as', 'to', 'in'], types: ['format'] } },
  words_pt: ['exportar', 'exporta', 'salvar', 'salva'], label_pt: 'Exportar',
  // csv, tsv, json and parquet are the open table as a file; script and notebook are the session as code
  bind: c => { const as = c.roles.as && c.roles.as[0] && c.roles.as[0].value; return ['csv', 'tsv', 'json', 'parquet'].includes(as) ? { tool: 'tableExport', args: { fmt: as } } : ['script', 'notebook'].includes(as) ? { tool: 'export', args: {} } : null; }
});
// "why", "show the plan": the steps behind the last card, whatever its tool
amend({ tools: ['*'], name: 'why', label: 'Why', words: ['why', 'how', 'how so', 'show the plan', 'show me the plan', 'show the trace', 'show the work', 'show me the work', 'what did you do', 'explain that'], theme: [], required: [], roles: {},
  words_pt: ['por quê', 'por que', 'como', 'mostra o plano'], label_pt: 'Por quê', bind: (c, a, card) => ({ tool: 'why', args: { ref: card.id } }) });
/* ── the session's own commands: read first, by a parser of their own ── */
noun({ amend: true, type: 'history', words: { all: ['sessions', 'history', 'menu', 'my sessions', 'the history', 'the sessions', 'all sessions'] }, words_pt: { all: ['sessões', 'histórico', 'menu'] } });
session({ name: 'newsession', label: 'New session', words: ['new session', 'start a new session', 'start new session', 'start a session', 'a new session', 'fresh session', 'start over', 'start afresh'], theme: [], required: [], roles: {},
  words_pt: ['nova sessão', 'nova sessao', 'começar de novo'], label_pt: 'Nova sessão', bind: () => ({ session: 'new' }) });
session({ name: 'drawer', label: 'Sessions', words: ['show', 'open', 'list'], elidable: true, theme: ['history'], required: ['theme'], roles: {}, words_pt: ['mostra', 'abre'], label_pt: 'Sessões', bind: () => ({ session: 'drawer' }) });
session({ name: 'rename', label: 'Name session', words: ['name this session', 'name this', 'call this session', 'call this', 'rename this session', 'rename this', 'rename the session', 'rename session', 'name the session'], lead: ['to', 'as'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['chama esta sessão de', 'renomeia a sessão para'], label_pt: 'Nomear sessão', bind: c => ({ session: 'rename', name: c.theme[0].value.trim() }) });
session({ name: 'undo', label: 'Undo', words: ['undo', 'undo that', 'take that back', 'scratch that', 'remove that', 'never mind'], theme: [], required: [], roles: {}, words_pt: ['desfaz', 'desfazer'], label_pt: 'Desfazer', bind: () => ({ session: 'undo' }) });
session({ name: 'again', label: 'Again', words: ['again', 'repeat', 'rerun', 'do it again', 'repeat that', 'one more time', 'run it again'], theme: [], required: [], roles: {}, words_pt: ['de novo', 'repete'], label_pt: 'De novo', bind: () => ({ session: 'again' }) });
session({ name: 'yes', label: 'Yes', words: ['yes', 'ok', 'okay', 'sure', 'do it', 'go', 'go ahead', 'yes please', 'yep', 'yeah', 'please do', 'that one'], theme: [], required: [], roles: {}, words_pt: ['sim', 'pode', 'isso'], label_pt: 'Sim', bind: () => ({ session: 'yes' }) });
const sessionEngines = {};
export function sessionRead(raw) {
  const frames = FRAMES.filter(f => f.session), at = enginesFor(sessionEngines, ontology(frames));
  for (const loc of order) {
    const r = at(loc).understand(raw, makeSession([]));
    if (r.status !== 'ok' || (loc !== order[0] && repaired(r))) continue;
    const cmd = r.commands[0], f = frames.find(x => x.name === cmd.verb), b = f && f.bind(cmd); if (b) return { ...b, echo: r.echo.replace(/\.$/, '') };
  }
  return null;
}

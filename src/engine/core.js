// The engine's shared ground: working state, the tool table, declarations, and small helpers.
// Nothing under src/engine/ touches a DOM, a window, or storage; the shell does that.

// Working state. `cards` is the current session's cards (specs plus live results), `table` the open
// table, `aliases` the taught words, `facts` the notes and `files` the opened files by hash (those three
// belong to the device, not a session). `clause` is the parser's session, rebuilt when a session is opened.
// `misses` (what did not read) and `picks` (guesses picked, by tool) are the device's too: learn.js. So are `formulas`
// (taught: lore.js), `orders` (standing orders: orders.js) and `strata` (what was said of the units' ages: strata.js).
export const S = { cards: [], n: 0, aliases: {}, facts: [], files: {}, tables: {}, recipes: {}, misses: [], picks: {}, formulas: {}, orders: [], strata: [], table: null, clause: null };

// The tool table: T.name = args => Result | null. A tool returns null when its arguments do not apply.
//   Result = { read: (string | Slot)[], body: Block[], trace: string[], py?, value?, ask?, copy? }
//   Block  = { t: 'big' | 'sub' | 'note' | 'src' | 'lbl' | 'kv' | 'table' | 'list' | 'steps' | 'pre' | 'marked'
//              | 'chips' | 'actions' | 'net' | 'bars' | 'curve', ... }   — plain data; the shell renders it
//   Slot   = { v, key?, alts?, cur? }   — a slot with alts is an ambiguous reading the person can flip
//   Ask    = { prompt, options: [{ label, value }], set(args, value) }
// Everything a tool needs to recompute lives in its args, which are plain JSON.
export const T = {};

// Declarations. One per tool, and one per skill that is not a tool (planned skills, session commands).
// Everything else derives from them: the grammar's rule order, the amendment table, session names,
// the Skills tab, the clause ontology.
//   name                                  the tool's name in T (and in card specs)
//   run(args) → Result | null             the tool itself; absent for planned skills and session rows
//   read(text, q) → args | null, rank     the rule that reads a query into args; lower rank tries first
//   amend: [{ arg, match, value?, when? }] phrases that change one argument of the last card
//   topic(args) → [label, weight]         what a card contributes to its session's name
//   skill: { group, title, on, about, examples }   a row in the Skills tab (one row may cover several tools)
//   planned: true                         a skill named but not built
//   pre: ['table']                        the conditions it needs (condition() below)
// What a tool does beyond its card, declared so a plan can be checked before it runs (SPEC 13.6):
//   post: ['table']                       the conditions it establishes: a later step's `pre` is met by it, and a
//                                         later step may read only once it has run (open makes the columns words)
//   effects: ['device' | 'handoff' | 'save']   writes to this device (the log, places, notes, taught words, recipes);
//                                         offers to hand something to another app, or a file to save, on a tap
export const EFFECTS = { device: 'writes to this device', handoff: 'hands off to another app on a tap', save: 'offers a file to save' };
export const TOOLS = [];
export function tool(d) {
  for (const e of d.effects || []) if (!EFFECTS[e]) throw new Error(`tool ${d.name} declares an unknown effect ${e}`);
  TOOLS.push(d); if (d.run) T[d.name] = d.run; return d;
}
export const toolByName = name => TOOLS.find(d => d.name === name);

// Clause verb frames: what the parser reads, and how a reading becomes a tool call.
//   name, words, theme, roles, required, elidable, words_pt, label, label_pt   the frame, as the ontology wants it
//   bind(cmd) → { tool, args } | null     a parsed command (verb, theme, roles) into a tool and its args
export const FRAMES = [];
export function frame(f) { FRAMES.push(f); return f; }
// An amendment frame reads only against the last card, of the tools it names ('*': any): "2 sentences", "trace it".
//   amend({ tools, name, words, theme, roles, …, bind(cmd, args, card) → { args } | { tool, args } | null })
// Amendments that change one of a frame's roles need none: "in feet" is the last command with its unit changed.
export const amend = f => frame({ ...f, amends: f.tools });
// A session frame acts on the session, not through a tool: bind(cmd) → { session: 'new' | 'drawer' | 'rename' | 'undo' | 'again' | 'recipe' | 'yes', … }
export const session = f => frame({ ...f, session: true });
// The words a file contributes beside its frames, gathered into the ontology by ontology():
//   noun({ type, words, generic, words_pt, generic_pt })   a type of thing; a function returning one is
//                                                           called each time (a noun that follows the open table)
//   shape({ type, re })                                     a token shape that is a thing of that type (270/60)
//   postmod({ prep, heads, attr, quantity })                a modifier after a noun ("cu above 0.5")
export const LEXICON = { nouns: [], shapes: [], postmods: [], units: [], qmods: [], compounds: [] };
export const noun = n => { LEXICON.nouns.push(n); return n; };
export const shape = s => { LEXICON.shapes.push(s); return s; };
export const postmod = p => { LEXICON.postmods.push(p); return p; };
//   unit({ unit, dim, words })   a unit only the grammar needs ("15 working days"); qmod({ head, attr, dims }) "045 magnetic"
export const unit = u => { LEXICON.units.push(u); return u; };
export const qmod = q => { LEXICON.qmods.push(q); return q; };
//   compound({ mod, heads, attr, echo })   a noun that modifies another before it ("mean cu")
export const compound = c => { LEXICON.compounds.push(c); return c; };

// Conditions a tool may declare in `pre`. Each knows whether it holds now and how it can be established:
// a list of steps { label, tool, args }. When a tool's condition is unmet, runTool() asks which step to
// take; the answer is stored in args.plan and runs before the tool, on every rerun and on replay.
//   condition('table', { holds, prompt, establish: () => [{ label, tool, args }] })
export const CONDITIONS = {};
export function condition(name, c) { CONDITIONS[name] = c; return c; }
const readOf = r => r.read.map(x => typeof x === 'string' ? x : x.v).join(' ');
// Jobs: a tool that needs an asynchronous runner (Python in a worker) returns res.pending = { job, req }.
// The engine starts the job, keeps the plain-JSON result under the request's key, and recomputes the card,
// which then finds it through result(job, req). Results are working state: replay runs the job again.
const RUNNERS = {}, RESULTS = new Map(), INFLIGHT = new Map(), DONE = [];
export function setRunner(job, fn) { RUNNERS[job] = fn; }
export function onJobDone(fn) { DONE.push(fn); }
const keyOf = (job, req) => job + ':' + JSON.stringify(req);
// undefined: not run yet (start it); null: no runner here; otherwise the kept result
export function result(job, req) { const k = keyOf(job, req); if (RESULTS.has(k)) return RESULTS.get(k); return RUNNERS[job] ? undefined : null; }
export function clearResults() { RESULTS.clear(); }
export function startJobs(cards, redo) {
  for (const c of cards) {
    const p = c.res && c.res.pending; if (!p || !RUNNERS[p.job]) continue;
    const k = keyOf(p.job, p.req);
    if (!INFLIGHT.has(k)) INFLIGHT.set(k, Promise.resolve().then(() => RUNNERS[p.job](p.req)).then(r => r, e => ({ stdout: '', stderr: '', value: null, error: { type: 'RunnerError', message: String(e && e.message || e), line: null }, ms: 0, trace: null })).then(r => { RESULTS.set(k, r); INFLIGHT.delete(k); }));
    INFLIGHT.get(k).then(() => { if (c.res && c.res.pending) { redo(c); DONE.forEach(f => f(c)); } });
  }
}
// every job started so far has finished and its cards are recomputed (tests wait on this)
export async function settle() { while (INFLIGHT.size) await Promise.all([...INFLIGHT.values()]); await Promise.resolve(); await Promise.resolve(); }
// A generation, bumped whenever state that the parser's nouns read may have changed: a tool ran (it may open a table or
// teach a word), a session changed, a pack was installed. The parsers are rebuilt only when it moves (reading.js), so a
// reading, or a preview while typing, does not rebuild and compare the whole vocabulary each time.
export const STATE = { gen: 0 };
export const bump = () => { STATE.gen++; };
export function runTool(name, args) {
  const d = toolByName(name);
  if (!d || !d.run) return null;
  bump();
  if (args && args.auto === true && !args.plan) args.plan = [{ label: 'open assays.csv', tool: 'open', args: {} }];   // cards from before the planner
  const steps = (args && args.plan) || [], traces = [];
  for (const s of steps) { const r = T[s.tool] && T[s.tool](s.args); if (r) traces.push(`plan: ${s.label} → ${readOf(r)}`); else traces.push(`plan: ${s.label} failed`); }
  for (const c of d.pre || []) {
    const C = CONDITIONS[c]; if (!C) throw new Error(`tool ${name} needs an unknown condition ${c}`);
    if (C.holds()) continue;
    const options = C.establish();
    if (!options.length) return { read: [name], body: [{ t: 'note', kind: 'err', text: C.none || `${c} is needed and nothing here can provide it.` }], trace: [...traces, `blocked: ${c} (precondition, no step can establish it)`] };
    return { read: [name], body: [], trace: [...traces, `blocked: ${c} (precondition)`],
      ask: { prompt: options.length === 1 ? C.prompt.replace('{one}', options[0].name || options[0].label) : C.many || C.prompt.replace('{one}', 'which?'), options: options.map(o => ({ label: o.label, value: o })), set: (a, v) => { a.plan = [...(a.plan || []), { label: v.label, tool: v.tool, args: v.args }]; } } };
  }
  const res = T[name](args); bump();
  if (res && traces.length) res.trace.unshift(...traces);
  return res;
}

// The clock, so tests can pin "today".
export const clock = { now: () => new Date(), zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone };

export const fmt = (x, sig = 6) => {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e12)) return x.toExponential(4);
  return Number(x.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: 8 });
};
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;
export const p3 = x => String(Math.round(x) % 360).padStart(3, '0');
export const p2 = x => String(Math.round(x)).padStart(2, '0');
// a quantity node from the parser as a number in a base unit, given the unit's factor
export const qty = (node, f) => node && node.type === 'quantity' ? node.n * f(node.unit) : null;

// Checks that run whenever a table opens or a row is written to a device table (standing orders, orders.js): each
// f(table, rows) → blocks for the card that opened or wrote it; rows, when given, are the ones just written.
export const CHECKS = [];

// A sentence that carries values: the English, and its template and values, so the shell can say it in Portuguese
// (shell/i18n-answers.js): { t: 'note', ...said('Added to station {station}: {n} there.', { station, n }) }
export const said = (tpl, params = {}) => ({ text: tpl.replace(/\{(\w+)\}/g, (m, k) => params[k] != null ? String(params[k]) : m), tpl, params });
export const checksOf = (table, rows) => { try { return CHECKS.flatMap(f => f(table, rows)); } catch (e) { return []; } };

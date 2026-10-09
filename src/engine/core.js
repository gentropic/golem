// The engine's shared ground: working state, the tool table, declarations, and small helpers.
// Nothing under src/engine/ touches a DOM, a window, or storage; the shell does that.

// Working state. `cards` is the current session's cards (specs plus live results), `table` the open
// table, `aliases` the taught words, `facts` the notes and `files` the opened files by hash (those three
// belong to the device, not a session). `clause` is the parser's session, rebuilt when a session is opened.
export const S = { cards: [], n: 0, aliases: {}, facts: [], files: {}, table: null, clause: null };

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
export const TOOLS = [];
export function tool(d) { TOOLS.push(d); if (d.run) T[d.name] = d.run; return d; }
export const toolByName = name => TOOLS.find(d => d.name === name);

// Clause verb frames: what the parser reads, and how a reading becomes a tool call.
//   name, words, theme, roles, required, elidable, words_pt, label, label_pt   the frame, as the ontology wants it
//   bind(cmd) → { tool, args } | null     a parsed command (verb, theme, roles) into a tool and its args
export const FRAMES = [];
export function frame(f) { FRAMES.push(f); return f; }

// Conditions a tool may declare in `pre`. Each knows whether it holds now and how it can be established:
// a list of steps { label, tool, args }. When a tool's condition is unmet, runTool() asks which step to
// take; the answer is stored in args.plan and runs before the tool, on every rerun and on replay.
//   condition('table', { holds, prompt, establish: () => [{ label, tool, args }] })
export const CONDITIONS = {};
export function condition(name, c) { CONDITIONS[name] = c; return c; }
const readOf = r => r.read.map(x => typeof x === 'string' ? x : x.v).join(' ');
export function runTool(name, args) {
  const d = toolByName(name);
  if (!d || !d.run) return null;
  if (args && args.auto === true && !args.plan) args.plan = [{ label: 'open assays.csv', tool: 'open', args: {} }];   // cards from before the planner
  const steps = (args && args.plan) || [], traces = [];
  for (const s of steps) { const r = T[s.tool] && T[s.tool](s.args); if (r) traces.push(`plan: ${s.label} → ${readOf(r)}`); else traces.push(`plan: ${s.label} failed`); }
  for (const c of d.pre || []) {
    const C = CONDITIONS[c]; if (!C) throw new Error(`tool ${name} needs an unknown condition ${c}`);
    if (C.holds()) continue;
    const options = C.establish();
    if (!options.length) return { read: [name], body: [{ t: 'note', kind: 'err', text: C.none || `${c} is needed and nothing here can provide it.` }], trace: [...traces, `blocked: ${c} (precondition, no step can establish it)`] };
    return { read: [name], body: [], trace: [...traces, `blocked: ${c} (precondition)`],
      ask: { prompt: options.length === 1 ? C.prompt.replace('{one}', options[0].label) : C.prompt.replace('{one}', 'which?'), options: options.map(o => ({ label: o.label, value: o })), set: (a, v) => { a.plan = [...(a.plan || []), { label: v.label, tool: v.tool, args: v.args }]; } } };
  }
  const res = T[name](args);
  if (res && traces.length) res.trace.unshift(...traces);
  return res;
}

// The clock, so tests can pin "today".
export const clock = { now: () => new Date() };

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

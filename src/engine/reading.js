// The reading ladder: context (amendments, meta-intents), grammar (the clause parser, then the regex
// rules the declarations carry), taught words (device lexicon rewrites, then grammar again). Plus the
// tools that talk about the session itself: none, why, export.
import { S, T, TOOLS, FRAMES, tool, frame, toolByName, runTool, iso } from './core.js';
import { examples, vocab } from './skills.js';
import { ontology } from './ontology.js';
import { createEngine, makeSession, ENGLISH } from '../vendor/dispatch.js';

export const norm = s => s.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');

/* ── rung 2, first half: the clause parser over golem's ontology ── */
let clause = null, clauseFor = null;
// rebuilt whenever what it reads changes: the open table's columns, kept files, saved places, logged activities
export const clauseEngine = () => { const o = ontology(), key = JSON.stringify(o); if (!clause || clauseFor !== key) { clause = createEngine(o, ENGLISH); clauseFor = key; } return clause; };
const clauseSession = () => S.clause || (S.clause = makeSession([]));
// The parser's verdict on a text, then the frame's bind(): a frame may answer { tool, args }, or
// { clarify } when the reading is whole but a value is missing, which becomes a clarify verdict too.
// Only the first command of a sequence is taken for now; "then" chains are a plan the planner does not build yet.
// When the grammar finds several readings, each is bound: if exactly one names a tool that takes it, that is the
// reading ("python" is a verb and a format; only the verb has a tool for "python\n<code>"), and the trace says so.
const bindOf = cmd => { const f = FRAMES.find(x => x.name === cmd.verb), b = f && f.bind(cmd); return b && !b.clarify ? b : null; };
function verdictOf(text, session) {
  let r = clauseEngine().understand(text, session);
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
  return { tool: b.tool, args: b.args, rung, res };
}
const describeVerdict = r => `clause: ${r.status}${r.reasons ? ' — ' + r.reasons.join('; ') : r.readings ? ' — ' + r.readings.join(' | ') : ''}`;

/* ── rung 2, second half: the regex rules the declarations carry, by rank ── */
const readers = () => TOOLS.filter(d => d.read).sort((a, b) => a.rank - b.rank);
export function grammar(text, q, rung, raw) {
  const c = clauseRead(raw || text, rung); if (c.tool) return c;   // the parser reads what was typed: a payload keeps its line breaks
  for (const d of readers()) {
    const args = d.read(text, q, raw); if (!args) continue;
    const res = runTool(d.name, args); if (res) return { tool: d.name, args, rung, res };
  }
  return null;
}
/* ── rung 1: "why", or an amendment the last card's tool declares ── */
export function context(q, last) {
  if (!last) return null;
  if (/^(why|how|how so|show (me )?(the )?(plan|trace|work|steps))$/.test(q)) return { tool: 'why', args: { ref: last.id }, rung: 'context', amends: last.id, res: T.why({ ref: last.id }) };
  const d = toolByName(last.tool); if (!d || !d.amend) return null;
  for (const am of d.amend) {
    if (am.when && !am.when(last.args)) continue;
    const m = am.match.exec(q); if (!m) continue;
    const v = am.value ? am.value(m, last.args) : m[1]; if (v == null) continue;
    const args = { ...last.args, [am.arg]: v }, res = runTool(last.tool, args);
    if (res) return { tool: last.tool, args, rung: 'context', amends: last.id, res };
  }
  return null;
}
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

/* ── rung 5: nothing read the query. Say so, show the nearest skills, offer to learn the unknown word ── */
tool({
  name: 'none',
  run: a => {
    const qt = new Set(a.q.split(/[^a-z0-9]+/).filter(Boolean));
    const near = examples().map(e => { const et = e.toLowerCase().split(/[^a-z0-9]+/); return { e, s: et.filter(t => qt.has(t)).length / Math.sqrt(et.length * (qt.size || 1)) }; }).filter(x => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3);
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
        ...(near.length ? [{ t: 'lbl', text: 'Nearest skills' }, { t: 'chips', items: near.map(x => x.e) }] : [{ t: 'sub', text: 'Nothing close. The Skills tab lists what I can do.' }]),
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

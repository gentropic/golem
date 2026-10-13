// Run and trace Python with adder, on the device. The tool itself stays synchronous: a first run returns a
// "running" card carrying a job, the runner (a Web Worker in the page, adder in-process in the tests)
// answers later, and the card is recomputed from the kept result. Replay reruns the code, which is
// deterministic: a fresh interpreter each time, no network, no clock, a seeded random.
import { tool, frame, result, fmt } from './core.js';
import { importNotebook } from '../vendor/ipynb.js';

const BUDGET = { steps: 2000000, ms: 5000 };
// in the worker: natra (numpy), scitra (scipy), sadpan (pandas), learn (sklearn), plot (matplotlib, as plt), line
const NOT_YET = {};
// numpy → natra and friends, through @gcu/ipynb's own substitution table
export function rewriteForGcu(code) {
  try {
    const nb = JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { language: 'python', name: 'python3' } }, cells: [{ cell_type: 'code', metadata: {}, source: code }] });
    const r = importNotebook(nb), cell = r.cells.find(c => c.type === 'adder');
    // the bridge adds a notebook theming line after a matplotlib import; it is not the person's code, so it goes
    const out = cell ? cell.code.split('\n').filter(l => !/#\s*auditable:\s*ipynb-theme-inject\b/.test(l)).join('\n') : code;
    return { code: out, rewrites: r.rewrites || [] };
  } catch (e) { return { code, rewrites: [] }; }
}
const HEAD = /^(?:run|run this|run it|python|py|execute|exec|eval(?:uate)?(?: this)?|what does this print|trace|trace this|step through(?: this)?)$/i;

tool({
  name: 'python',
  skill: { group: 'Compute', title: 'Run and trace Python', on: '@gcu/adder', about: 'Python run on the device by adder, compiled to JavaScript through AIR (tree-walked when tracing, or when the compiler declines a construct): output, the last value, the error with its line. "trace it" adds a table of lines and the variables they changed. No network, no page access, a statement budget; numpy, pandas, scipy, sklearn and matplotlib imports are rewritten to the GCU names (natra, sadpan, scitra, learn, plt) and shown; figures come back as drawings on the card.', examples: ['run this: print(sum(range(10)))', 'run this: import plt; plt.plot([1, 2, 3], [1, 4, 9]); plt.show()', 'trace this: a = 1; b = a * 2; a = a + b'] },
  amend: [{ arg: 'trace', match: /^(?:trace it|trace|step through it|show the steps)$/, value: () => true }, { arg: 'trace', match: /^(?:no trace|just run it)$/, value: () => false }],
  topic: () => ['Python', 1],
  run: a => {
    const { code, rewrites } = rewriteForGcu(a.code), lines = code.split('\n').length;
    const read = [a.trace ? 'trace' : 'run', { v: `${lines} line${lines === 1 ? '' : 's'} of Python` }, 'with', { v: 'adder' }];
    const req = { code, trace: !!a.trace, ...BUDGET }, r = result('python', req);
    const subs = rewrites.length ? [{ t: 'kv', rows: [['imports rewritten', rewrites.map(x => `${x.original} → ${x.rewritten}`).join(', ')]] }] : [];
    const limits = `no network, no page access · budget ${BUDGET.steps.toLocaleString('en-GB')} statements, ${BUDGET.ms / 1000} s`;
    const src = { t: 'src', text: `@gcu/adder · ${limits}` };
    if (r === undefined) return { read, body: [{ t: 'note', text: 'Running in a sandbox…' }, ...subs, src], pending: { job: 'python', req }, trace: ['adder: queued in a fresh interpreter'], py: a.code };
    if (r === null) return { read, body: [{ t: 'note', kind: 'err', text: 'Python is not available in this build: no runner is attached.' }], trace: ['no python runner'], py: a.code };
    const body = [];
    if (r.stdout) body.push({ t: 'pre', text: r.stdout.length > 20000 ? r.stdout.slice(0, 20000) + '\n… (output cut at 20,000 characters)' : r.stdout });
    if (r.value != null) body.push({ t: 'kv', rows: [['value', r.value, { mono: true }]] });
    if (r.error) {
      const gcu = r.error.type === 'ModuleNotFoundError' && /'([\w.]+)'/.exec(r.error.message), mod = gcu && gcu[1].split('.')[0];
      const why = r.error.type === 'BudgetExceeded' ? ` The run stopped after ${r.error.message}; golem does not run code without a limit.` : mod && NOT_YET[mod] ? ` ${NOT_YET[mod]}.` : r.error.type === 'ModuleNotFoundError' && mod === 'js' ? ' The js module is switched off here: Python cannot reach the page.' : '';
      body.push({ t: 'note', kind: 'err', text: `${r.error.type}: ${r.error.message}${r.error.line ? ` (line ${r.error.line})` : ''}.${why}` });
    }
    (r.figures || []).forEach((f, i) => { const title = (f.ops.find(o => o[0] === 'fillText' && /[A-Za-z]/.test(o[1])) || [])[1]; body.push({ t: 'figure', w: f.width, h: f.height, ops: f.ops, label: `Figure ${i + 1}${title ? ': ' + title : ''}` }); });
    if (r.figuresCut) body.push({ t: 'note', text: `${r.figuresCut} more figure${r.figuresCut === 1 ? '' : 's'} not shown: too large to keep on the card.` });
    if (!r.stdout && r.value == null && !r.error && !(r.figures || []).length) body.push({ t: 'note', kind: 'ok', text: 'Ran without output.' });
    if (r.stderr) body.push({ t: 'pre', text: r.stderr });
    if (r.trace) body.push({ t: 'lbl', text: `Trace, ${r.trace.length} step${r.trace.length === 1 ? '' : 's'}${r.traceCut ? ', the first 200 recorded' : ''}` }, { t: 'table', head: ['After line', 'Changed'], num: [true, false], rows: r.trace.map(([l, ch]) => [String(l), ch || '—']) });
    // which engine ran: compiled through AIR, or tree-walked (and why, when AIR was not the one)
    const how = r.engine === 'air' ? 'compiled by AIR' : r.engine === 'tree' ? `tree-walking${r.engineWhy ? ` (${r.engineWhy.slice(0, 80)})` : ''}` : 'adder';
    body.push(...subs, { ...src, text: `@gcu/adder, ${how} · ${limits} · ran in ${fmt(r.ms)} ms` });
    return { read, value: r.value, copy: r.stdout || r.value || '', body, trace: [`adder.run(${lines} lines${a.trace ? ', trace' : ''}) in a fresh interpreter`, `engine: ${r.engine || 'adder'}${r.engineWhy ? ` (${r.engineWhy})` : ''}`, r.error ? `raised ${r.error.type}` : 'finished', `${fmt(r.ms)} ms`], py: a.code };
  }
});
/* ── what reads it: "run this:" or "trace this:", then the code after the colon or on the next lines ── */
const payload = c => { const t = c.roles.text && c.roles.text[0]; return t && t.type === 'text' ? t.value.replace(/\r\n/g, '\n') : null; };
for (const [name, words, words_pt, trace] of [
  ['python', ['run', 'python', 'py', 'execute', 'exec', 'eval', 'evaluate', 'what does this print'], ['roda', 'rode', 'rodar', 'executa', 'execute', 'executar', 'avalia', 'avalie'], false],
  ['pytrace', ['trace', 'step through'], ['rastreia', 'rastreie', 'passo a passo'], true]
]) frame({
  name, label: trace ? 'Trace' : 'Run', words, theme: [], required: ['text'], roles: { text: { preps: [':'], types: ['text'] } },
  words_pt, label_pt: trace ? 'Rastrear' : 'Rodar',
  bind: c => payload(c) ? { tool: 'python', args: { code: payload(c), trace } } : null
});

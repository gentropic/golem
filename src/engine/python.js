// Run and trace Python with adder, on the device. The tool itself stays synchronous: a first run returns a
// "running" card carrying a job, the runner (a Web Worker in the page, adder in-process in the tests)
// answers later, and the card is recomputed from the kept result. Replay reruns the code, which is
// deterministic: a fresh interpreter each time, no network, no clock, a seeded random.
import { tool, result, fmt } from './core.js';
import { payloadOf } from './text.js';
import { importNotebook } from '../vendor/ipynb.js';

const BUDGET = { steps: 2000000, ms: 5000 };
const GCU_STACK = new Set(['natra', 'sadpan', 'scitra', 'plot', 'learn']);
// numpy → natra and friends, through @gcu/ipynb's own substitution table
export function rewriteForGcu(code) {
  try {
    const nb = JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { language: 'python', name: 'python3' } }, cells: [{ cell_type: 'code', metadata: {}, source: code }] });
    const r = importNotebook(nb), cell = r.cells.find(c => c.type === 'adder');
    return { code: cell ? cell.code : code, rewrites: r.rewrites || [] };
  } catch (e) { return { code, rewrites: [] }; }
}
const HEAD = /^(?:run|run this|run it|python|py|execute|exec|eval(?:uate)?(?: this)?|what does this print|trace|trace this|step through(?: this)?)$/i;

tool({
  name: 'python', rank: 41,
  skill: { group: 'Compute', title: 'Run and trace Python', on: '@gcu/adder', about: 'Python run on the device by adder, a pure-JS interpreter: output, the last value, the error with its line. "trace it" adds a table of lines and the variables they changed. No network, no page access, a statement budget; numpy, pandas and scipy imports are rewritten to the GCU names and shown.', examples: ['run this: print(sum(range(10)))', 'trace this: a = 1\\nfor i in range(3):\\n    a *= 2'] },
  read: (text, q, raw) => { const p = payloadOf(raw || text); if (!p || !p.body || !HEAD.test(p.head)) return null; return { code: p.body.replace(/\r\n/g, '\n'), trace: /^(?:trace|step)/i.test(p.head) }; },
  amend: [{ arg: 'trace', match: /^(?:trace it|trace|step through it|show the steps)$/, value: () => true }, { arg: 'trace', match: /^(?:no trace|just run it)$/, value: () => false }],
  topic: () => ['Python', 1],
  run: a => {
    const { code, rewrites } = rewriteForGcu(a.code), lines = code.split('\n').length;
    const read = [a.trace ? 'trace' : 'run', { v: `${lines} line${lines === 1 ? '' : 's'} of Python` }, 'with', { v: 'adder' }];
    const req = { code, trace: !!a.trace, ...BUDGET }, r = result('python', req);
    const subs = rewrites.length ? [{ t: 'kv', rows: [['imports rewritten', rewrites.map(x => `${x.original} → ${x.rewritten}`).join(', ')]] }] : [];
    const src = { t: 'src', text: `@gcu/adder, tree-walking · no network, no page access · budget ${BUDGET.steps.toLocaleString('en-GB')} statements, ${BUDGET.ms / 1000} s` };
    if (r === undefined) return { read, body: [{ t: 'note', text: 'Running in a sandbox…' }, ...subs, src], pending: { job: 'python', req }, trace: ['adder: queued in a fresh interpreter'], py: a.code };
    if (r === null) return { read, body: [{ t: 'note', kind: 'err', text: 'Python is not available in this build: no runner is attached.' }], trace: ['no python runner'], py: a.code };
    const body = [];
    if (r.stdout) body.push({ t: 'pre', text: r.stdout.length > 20000 ? r.stdout.slice(0, 20000) + '\n… (output cut at 20,000 characters)' : r.stdout });
    if (r.value != null) body.push({ t: 'kv', rows: [['value', r.value, { mono: true }]] });
    if (r.error) {
      const gcu = r.error.type === 'ModuleNotFoundError' && /'([\w.]+)'/.exec(r.error.message), mod = gcu && gcu[1].split('.')[0];
      const why = r.error.type === 'BudgetExceeded' ? ` The run stopped after ${r.error.message}; golem does not run code without a limit.` : mod && GCU_STACK.has(mod) ? ` ${mod} is part of the GCU stack, which golem does not carry yet.` : r.error.type === 'ModuleNotFoundError' && mod === 'js' ? ' The js module is switched off here: Python cannot reach the page.' : '';
      body.push({ t: 'note', kind: 'err', text: `${r.error.type}: ${r.error.message}${r.error.line ? ` (line ${r.error.line})` : ''}.${why}` });
    }
    if (!r.stdout && r.value == null && !r.error) body.push({ t: 'note', kind: 'ok', text: 'Ran without output.' });
    if (r.stderr) body.push({ t: 'pre', text: r.stderr });
    if (r.trace) body.push({ t: 'lbl', text: `Trace, ${r.trace.length} step${r.trace.length === 1 ? '' : 's'}${r.traceCut ? ', the first 200 recorded' : ''}` }, { t: 'table', head: ['After line', 'Changed'], num: [true, false], rows: r.trace.map(([l, ch]) => [String(l), ch || '—']) });
    body.push(...subs, { ...src, text: `${src.text} · ran in ${fmt(r.ms)} ms` });
    return { read, value: r.value, copy: r.stdout || r.value || '', body, trace: [`adder.run(${lines} lines${a.trace ? ', trace' : ''}) in a fresh interpreter`, r.error ? `raised ${r.error.type}` : 'finished', `${fmt(r.ms)} ms`], py: a.code };
  }
});

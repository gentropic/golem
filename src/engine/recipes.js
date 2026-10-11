// Recipes (A9): a session's plan saved under a name, with the subjects that may change between runs.
// A recipe is stored as card specs, plain JSON like a session; running it replays every step with the
// new subjects into a new session, and stops at the first step that no longer reads. Nothing is skipped
// and nothing is guessed. Recipes live on the device, like taught words.
import { S, tool, runTool } from './core.js';
import { listOf } from './forms.js';

// cards that are about the session or about recipes are not steps
const NOT_STEPS = new Set(['none', 'why', 'recipeSave', 'recipeList', 'recipeBatch', 'recipeForget', 'recipeStop']);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = v => new RegExp(`(^|[^\\p{L}\\p{N}_])${esc(v)}(?=$|[^\\p{L}\\p{N}_])`, 'giu');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the subjects of a plan: the table it opens, and the open table's columns its steps name
export function subjects(steps, cols) {
  const out = [], seen = new Set(), add = (kind, value) => { const k = kind + ':' + value.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ kind, value }); } };
  const strings = v => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
  for (const s of steps) {
    if (s.tool === 'open') add('table', s.args.file ? s.args.file.name : 'assays.csv');
    for (const str of strings(s.tool === 'open' ? {} : s.args)) for (const c of cols) if (word(c).test(str)) add('column', c);
  }
  return out;
}

// a step with the bindings applied: [{ from, to, kind }] → { tool, args, raw } or { err }
function bind(step, bindings) {
  let args = JSON.parse(JSON.stringify(step.args)), raw = step.raw;
  for (const b of bindings) {
    if (b.from.toLowerCase() === b.to.toLowerCase()) continue;
    if (b.kind === 'table') {
      if (step.tool !== 'open') continue;
      const f = Object.values(S.files).find(x => x.name.toLowerCase() === b.to.toLowerCase());
      // the sample table is not a kept file; naming it opens the sample
      if (!f && b.to.toLowerCase() === 'assays.csv') { args = {}; raw = 'open assays.csv'; continue; }
      if (!f) return { err: `${b.to} is not kept on this device. Open it with the paperclip first.` };
      args = { ...args, file: { name: f.name, hash: f.hash } }; delete args.sheet; raw = `open ${f.name}`;
      continue;
    }
    const swap = v => typeof v === 'string' ? v.replace(word(b.from), (m, pre) => pre + b.to) : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
    args = swap(args); raw = raw.replace(word(b.from), (m, pre) => pre + b.to);
  }
  return { tool: step.tool, args, raw };
}
const failed = res => !res ? 'nothing reads it any more' : res.ask ? `it asks a question: ${res.ask.prompt}` : (res.body || []).find(x => x.t === 'note' && x.kind === 'err') ? res.body.find(x => x.t === 'note' && x.kind === 'err').text : null;

// run a recipe's steps with bindings; `emit(spec, res)` receives each step that ran (the caller keeps
// them as cards or not). → { ran, stop: { n, raw, why } | null, last }
export function runSteps(recipe, bindings, emit) {
  let ran = 0, last = null;
  for (const [i, step] of recipe.steps.entries()) {
    const b = bind(step, bindings);
    if (b.err) return { ran, stop: { n: i + 1, raw: step.raw, why: b.err }, last };
    let res = null; try { res = runTool(b.tool, b.args); } catch (e) { res = null; }
    if (emit) emit(b, res);
    const why = failed(res);
    if (why) return { ran, stop: { n: i + 1, raw: b.raw, why }, last };
    ran++; last = { spec: b, res };
  }
  return { ran, stop: null, last };
}

// "for au", "on holes.csv", "for au and ag on holes.csv" → bindings against the recipe's parameters
export function bindingsOf(recipe, text) {
  const values = listOf(text.replace(/^(?:for|on|with|using)\s+/i, '').replace(/\s+(?:on|for|with|using)\s+/gi, ', '));
  const params = recipe.subjects.filter(s => recipe.params.includes(s.value)), out = [];
  const tables = params.filter(p => p.kind === 'table'), cols = params.filter(p => p.kind === 'column');
  for (const v of values) {
    const p = /\.\w{1,8}$/.test(v) ? tables.shift() : cols.shift();
    if (!p) return { err: `${recipe.name} has ${params.length ? `${plural(params.length, 'parameter')}: ${params.map(x => x.value).join(', ')}` : 'no parameters'}, and "${v}" is one more than it takes.` };
    out.push({ kind: p.kind, from: p.value, to: v });
  }
  return { bindings: out };
}
export const recipeNamed = name => S.recipes[name.toLowerCase()] || null;
// the longest saved name at the start of `text`: "cu check for au" → [recipe, "for au"]
export function recipeAt(text) {
  const t = text.trim().toLowerCase(), names = Object.keys(S.recipes).sort((a, b) => b.length - a.length);
  const n = names.find(x => t === x || t.startsWith(x + ' ')); return n ? [S.recipes[n], text.trim().slice(n.length).trim()] : null;
}

/* ── save ───────────────────────────────────────────────────── */
tool({
  name: 'recipeSave', rank: 30,
  skill: { group: 'Session', title: 'Recipes', on: 'session plans', about: 'Save this session\'s steps under a name, choose which subjects change between runs (the file, the columns), then run it again for other ones, or on every kept table. A step that no longer reads stops the run there; nothing is skipped or guessed.', examples: ['save this as a recipe called cu check', 'run cu check for au', 'run cu check on every table', 'recipes'] },
  read: (text) => {
    const m = /^(?:save|keep|make)\s+(?:this|this session|the session|it)\s+(?:as\s+)?(?:a\s+)?recipe(?:\s+(?:called|named))?\s+(.+)$/i.exec(text.trim()) || /^save\s+(?:as\s+)?(?:a\s+)?recipe\s+(?:called\s+|named\s+)?(.+)$/i.exec(text.trim());
    if (!m) return null;
    // a card that failed (an error, an open question) is not a step
    const steps = S.cards.filter(c => !NOT_STEPS.has(c.tool) && !failed(c.res)).map(c => ({ tool: c.tool, args: JSON.parse(JSON.stringify(c.args)), raw: c.raw }));
    return { name: m[1].trim().replace(/^["'“]|["'”]$/g, '').toLowerCase(), steps, cols: S.table ? S.table.cols.map(c => c.name) : [] };
  },
  topic: a => [`recipe ${a.name}`, 1],
  run: a => {
    const read = ['save recipe', { v: a.name }];
    if (!a.steps.length) return { read, body: [{ t: 'note', kind: 'err', text: 'This session has no steps to save. Ask something first, then save it as a recipe.' }], trace: ['steps: none'] };
    const subs = subjects(a.steps, a.cols), rows = [['steps', a.steps.map((s, i) => `${i + 1}. ${s.raw}`).join('  ')]];
    if (subs.length && !a.params) return {
      read, body: [{ t: 'kv', rows: [...rows, ['subjects', subs.map(s => s.value).join(', ')]] }],
      ask: { prompt: `Which should change between runs? Tap one, or type several separated by commas.`, options: [...subs.map(s => ({ label: s.value, value: [s.value] })), ...(subs.length > 1 ? [{ label: 'all of them', value: subs.map(s => s.value) }] : []), { label: 'none', value: [] }], parse: s => { const xs = listOf(s).map(x => subs.find(y => y.value.toLowerCase() === x.toLowerCase())); return xs.length && xs.every(Boolean) ? xs.map(x => x.value) : null; }, set: (x, v) => { x.params = v; } },
      trace: [`${plural(a.steps.length, 'step')}`, `subjects: ${subs.map(s => `${s.kind} ${s.value}`).join(', ')}`]
    };
    const params = a.params || [];
    S.recipes[a.name] = { name: a.name, steps: a.steps, subjects: subs, params };
    const ps = subs.filter(s => params.includes(s.value)), fixed = subs.filter(s => !params.includes(s.value));
    const example = ps.length ? `run ${a.name} ${ps.some(p => p.kind === 'column') ? 'for ' + ps.filter(p => p.kind === 'column').map(p => p.value).join(' and ') : ''}${ps.some(p => p.kind === 'table') ? ' on ' + ps.find(p => p.kind === 'table').value : ''}`.replace(/\s+/g, ' ').trim() : `run ${a.name}`;
    return {
      read, value: a.name,
      body: [{ t: 'kv', rows: [...rows, ['changes between runs', ps.map(s => s.value).join(', ') || 'nothing; every run is the same'], ['fixed', fixed.map(s => s.value).join(', ') || 'nothing else']] }, { t: 'note', text: `Kept on this device. Run it with the same subjects or new ones, for example "${example}"${ps.some(p => p.kind === 'table') ? ', or on every kept table' : ''}.` }, { t: 'chips', items: [example] }],
      trace: [`${plural(a.steps.length, 'step')} saved as "${a.name}"`, `parameters: ${params.join(', ') || 'none'}`]
    };
  }
});

// the card a run ends with when a step did not read: which step, and why
tool({
  name: 'recipeStop',
  run: a => ({ read: ['recipe', { v: a.name }, 'stopped at step', { v: String(a.n) }], body: [{ t: 'note', kind: 'err', text: `Step ${a.n} of ${a.of}, "${a.raw}": ${a.why.replace(/\.+$/, '')}. The steps after it were not run; I do not skip a step or guess a replacement.` }], trace: [`step ${a.n}: ${a.why}`] })
});

/* ── list and forget ────────────────────────────────────────── */
tool({
  name: 'recipeList', rank: 30,
  read: text => /^(?:my |the |list |show )*recipes$/i.test(text.trim()) ? {} : null,
  topic: () => ['recipes', 1],
  run: () => {
    const rs = Object.values(S.recipes), read = ['recipes'];
    if (!rs.length) return { read, body: [{ t: 'note', text: 'No recipes are kept yet. After a session you want again, say "save this as a recipe called …".' }], trace: ['recipes: none'] };
    return { read, value: rs.length, body: [{ t: 'table', head: ['Recipe', 'Steps', 'Changes between runs'], num: [false, true, false], rows: rs.map(r => [r.name, String(r.steps.length), r.params.join(', ') || 'nothing']) }, { t: 'chips', items: rs.map(r => `run ${r.name}`) }], trace: [`${plural(rs.length, 'recipe')}`] };
  }
});
tool({
  name: 'recipeForget', rank: 30,
  read: text => { const m = /^(?:forget|delete|remove)\s+(?:the\s+)?recipe\s+(.+)$/i.exec(text.trim()); return m ? { name: m[1].trim().toLowerCase() } : null; },
  run: a => {
    const read = ['forget recipe', { v: a.name }];
    if (!S.recipes[a.name]) return { read, body: [{ t: 'note', text: `There is no recipe called ${a.name}; it may be forgotten already.` }], trace: ['recipe: absent'] };
    delete S.recipes[a.name];
    return { read, body: [{ t: 'note', kind: 'ok', text: `Forgot ${a.name}. Sessions it made are kept.` }], trace: ['recipe: removed'] };
  }
});

/* ── batch: every kept table ────────────────────────────────── */
// tables the device keeps: files that are not documents, drawings or other conversions
const tableFiles = () => Object.values(S.files).filter(f => f.kind !== 'doc' && !/\.(dxf|ya?ml|wkt|geojson)$/i.test(f.name));
tool({
  name: 'recipeBatch', rank: 29,
  read: text => {
    const m = /^run\s+(.+?)\s+on\s+(?:every|each|all(?: the)?)\s+(?:kept\s+)?(?:tables?|files?|csvs?|sheets?)(?:\s+(?:on this device|i have|kept))?$/i.exec(text.trim());
    if (!m || !recipeNamed(m[1])) return null;
    return { name: m[1].trim().toLowerCase(), files: tableFiles().map(f => ({ name: f.name, hash: f.hash })) };
  },
  topic: a => [`${a.name} on every table`, 2],
  run: a => {
    const r = recipeNamed(a.name), read = ['run recipe', { v: a.name }, 'on every kept table'];
    if (!r) return { read, body: [{ t: 'note', kind: 'err', text: `There is no recipe called ${a.name} on this device.` }], trace: ['recipe: absent'] };
    const tp = r.subjects.find(s => s.kind === 'table' && r.params.includes(s.value));
    if (!tp) return { read, body: [{ t: 'note', kind: 'err', text: `${a.name} does not take the table as a parameter, so every run would be the same. Save it again and choose the table as something that changes.` }], trace: ['parameters: no table'] };
    if (!a.files.length) return { read, body: [{ t: 'note', kind: 'err', text: 'No tables are kept on this device. Open them with the paperclip first.' }], trace: ['files: none'] };
    // each run works on the open table; the one open before the batch is put back after it
    const keep = S.table, rows = [], trace = [];
    for (const f of a.files) {
      const out = runSteps(r, [{ kind: 'table', from: tp.value, to: f.name }]);
      const v = out.last && out.last.res ? out.last.res.value : null;
      rows.push([f.name, out.stop ? `stopped at step ${out.stop.n}` : 'ran', out.stop ? out.stop.why : v == null ? '—' : typeof v === 'number' ? String(+v.toPrecision(6)) : String(v).slice(0, 60)]);
      trace.push(`${f.name}: ${out.ran} of ${r.steps.length} steps${out.stop ? `, stopped at ${out.stop.n} (${out.stop.raw})` : ''}`);
    }
    S.table = keep;
    const ok = rows.filter(x => x[1] === 'ran').length;
    return { read, value: ok, body: [{ t: 'big', v: `${ok} of ${a.files.length}`, unit: 'ran to the end' }, { t: 'table', head: ['File', 'Status', 'Last value, or why it stopped'], num: [false, false, false], rows }, { t: 'sub', text: `The last value is the answer of step ${r.steps.length}, "${r.steps[r.steps.length - 1].raw}". Run one file on its own to see every step.` }], trace };
  }
});

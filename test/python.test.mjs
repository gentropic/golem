// Run and trace Python: the card, the job path, the sandbox, replay. adder runs in-process here through the
// same driver the page's worker uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';
import { run } from '../src/vendor/adder/runner.js';
import { pyRepr } from '../src/vendor/adder/builtins.js';
import { adderParse } from '../src/vendor/adder/parse.js';
import { pyRun } from '../src/worker/py-driver.js';

const api = { run, pyRepr, adderParse };
let runs = 0;
g.setRunner('python', req => { runs++; return pyRun(api, req); });
const card = q => { const o = g.submit(q); assert.equal(o.kind, 'card', q); return o.card; };
const ran = async q => { const c = card(q); assert.ok(c.res.pending, 'starts as a pending card'); assert.ok(g.textOf(c).includes('Running')); await g.settle(); assert.ok(!c.res.pending, 'recomputed from the result'); return c; };

test('a run shows output and the last value; the card is recomputed when the job ends', async () => {
  g.reset();
  const c = await ran('run this: x = sum(range(10))\nprint("total", x)\nx * 2');
  assert.equal(c.tool, 'python');
  assert.equal(c.res.body.find(b => b.t === 'pre').text, 'total 45\n');
  assert.equal(c.res.value, '90');
  assert.ok(g.textOf(c).includes('no network'));
  const multi = await ran('python\nfor w in ["a", "b"]:\n    print(w.upper())');
  assert.equal(multi.res.body.find(b => b.t === 'pre').text, 'A\nB\n', 'the payload may follow the first line');
});

test('errors carry their type and line; the budget stops a loop; js and remote imports are refused', async () => {
  g.reset();
  const e = await ran('run this: a = 1\nb = a / 0');
  assert.ok(g.textOf(e).includes('ZeroDivisionError') && g.textOf(e).includes('line 2'), g.textOf(e));
  const loop = await ran('run this: while True: pass');
  assert.ok(g.textOf(loop).includes('BudgetExceeded') && g.textOf(loop).includes('without a limit'), g.textOf(loop));
  assert.ok(g.textOf(await ran('run this: import js')).includes('cannot reach the page'));
  const url = await ran('run this: import "https://example.invalid/x.py" as x');
  assert.ok(g.textOf(url).includes('ModuleNotFoundError'), g.textOf(url));
  assert.ok(g.textOf(await ran('run this: def f(:\n  pass')).includes('SyntaxError'));
});

test('numpy and friends are rewritten to the GCU names and shown; their absence is said plainly', async () => {
  g.reset();
  assert.deepEqual(g.rewriteForGcu('import numpy as np\nfrom scipy.stats import norm').rewrites.map(r => r.rewritten), ['natra', 'scitra.stats']);
  const c = await ran('run this: import numpy as np\nprint(np.pi)');
  const t = g.textOf(c);
  assert.ok(t.includes('numpy → natra') && t.includes('GCU stack, which golem does not carry yet'), t);
  assert.ok((await ran('run this: import math\nmath.sqrt(2)')).res.value.startsWith('1.414'), 'the built-in modules work');
});

test('trace: a table of lines and what changed; "trace it" amends a run; export carries the code; replay reruns', async () => {
  g.reset();
  const t = await ran('trace this: a = 1\nfor i in range(3):\n    a *= 2\na');
  const rows = t.res.body.find(b => b.t === 'table').rows;
  assert.deepEqual(rows[0], ['1', 'a = 1']); assert.ok(rows.some(r => r[1].includes('a = 8')), JSON.stringify(rows));
  assert.equal(t.res.value, '8');
  const r = await ran('run this: n = 3\nn ** 2');
  assert.ok(!r.res.body.some(b => b.t === 'table'));
  g.submit('trace it'); await g.settle();
  const amended = g.S.cards[g.S.cards.length - 1];
  assert.equal(amended.args.trace, true); assert.ok(amended.res.body.some(b => b.t === 'table'));
  const script = card('export as script');
  assert.ok(g.textOf(script).includes('n ** 2'), 'the exported script carries the code itself');
  const before = runs, saved = JSON.parse(JSON.stringify(g.serialize()));
  g.reset(); g.setRunner('python', req => { runs++; return pyRun(api, req); }); g.hydrate(saved); await g.settle();
  assert.ok(runs > before, 'replay ran the code again');
  assert.equal(g.S.cards.find(c => c.args.code === 'n = 3\nn ** 2' && !c.args.trace).res.value, '9');
});

test('without a runner the card says so instead of hanging', () => {
  g.reset(); g.setRunner('python', null);
  const c = card('run this: print(1)');
  assert.ok(g.textOf(c).includes('not available'));
  g.setRunner('python', req => pyRun(api, req));
});

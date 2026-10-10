// Run and trace Python: the card, the job path, the sandbox, the GCU modules, replay. The runner here
// evaluates the very worker text the page embeds (build.mjs pyWorkerSource), in a fresh context per run,
// with only what a worker has: no window, no document, no network helpers handed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as g from '../src/engine/index.js';
import { pyWorkerSource } from '../build.mjs';

const script = new vm.Script(pyWorkerSource(), { filename: 'py-worker.js' });
const worker = req => new Promise(res => {
  const self = { postMessage: r => res(JSON.parse(JSON.stringify(r))) };   // a structured clone, as postMessage gives (plain JSON is all golem sends)
  script.runInContext(vm.createContext({ self, importScripts() { throw new Error('importScripts is not used') }, console, atob, btoa, TextEncoder, TextDecoder, performance, setTimeout, clearTimeout, queueMicrotask }));
  self.onmessage({ data: req });
});
let runs = 0;
g.setRunner('python', req => { runs++; return worker(req); });
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

test('a run is compiled by AIR; a trace, and an error without a line, are tree-walked', async () => {
  g.reset();
  const c = await ran('run this: s = 0\nfor i in range(100000):\n    s += i\ns');
  assert.equal(c.res.value, '4999950000');
  assert.ok(g.textOf(c).includes('compiled by AIR'), g.textOf(c));
  const t = await ran('trace this: a = 1\nb = a * 2');
  assert.ok(g.textOf(t).includes('tree-walking (trace)'), g.textOf(t));
  const loop = await ran('run this: n = 0\nwhile True:\n    n += 1');
  assert.ok(g.textOf(loop).includes('BudgetExceeded') && g.textOf(loop).includes('compiled by AIR'), 'the budget holds in compiled code: ' + g.textOf(loop));
  const undef = await ran('run this: print(nope)');
  assert.ok(g.textOf(undef).includes('NameError') && g.textOf(undef).includes('free name nope'), g.textOf(undef));
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

test('numpy, scipy, pandas, sklearn and matplotlib: rewritten to the GCU names, shown, and answering like the originals', async () => {
  g.reset();
  assert.deepEqual(g.rewriteForGcu('import numpy as np\nfrom scipy.stats import norm').rewrites.map(r => r.rewritten), ['natra', 'scitra.stats']);
  const c = await ran('run this: import numpy as np\nm = np.array([[3.0, 1.0], [1.0, 2.0]])\nprint(np.linalg.inv(m))\nnp.round(np.array([1.0, 0.3333, 0.6667]), 2)');
  const t = g.textOf(c);
  assert.ok(t.includes('numpy → natra') && !c.res.body.some(b => b.kind === 'err'), t);
  assert.equal(c.res.body.find(b => b.t === 'pre').text, '[[ 0.4 -0.2]\n [-0.2  0.6]]\n', 'printed as numpy prints');
  assert.equal(c.res.value, 'array([1.  , 0.33, 0.67])', 'rounded as numpy rounds');
  assert.equal((await ran('run this: import numpy as np\nnp.linalg.eigh(np.array([[2.0, 0.0], [0.0, 3.0]]))[0]')).res.value, 'array([2., 3.])', 'eigenvalues ascending');
  assert.ok((await ran('run this: import math\nmath.sqrt(2)')).res.value.startsWith('1.414'), 'the built-in modules work');
  const sp = await ran('run this: from scipy.stats import norm\nprint(norm.cdf(0))\nnorm.ppf(0.975)');
  assert.ok(g.textOf(sp).includes('scipy.stats → scitra.stats'), g.textOf(sp));
  assert.equal(sp.res.body.find(b => b.t === 'pre').text, '0.5\n'); assert.ok(sp.res.value.startsWith('1.95996'), sp.res.value);
  const pd = await ran('run this: import pandas as pd\nt = pd.table({"a": [1, 2, 3], "b": [4.0, 5.0, 6.0]})\nprint(t)');
  assert.ok(g.textOf(pd).includes('pandas → sadpan') && !pd.res.body.some(b => b.kind === 'err'), g.textOf(pd));
  assert.ok(pd.res.body.find(b => b.t === 'pre').text.includes('"a":3'), 'a sadpan table from Python');
  const fig = await ran('run this: import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9])\nplt.title("squares")\nplt.show()');
  const fb = fig.res.body.find(b => b.t === 'figure');
  assert.ok(fb && fb.w > 0 && fb.h > 0 && fb.ops.length > 10, 'a figure block with a draw list');
  assert.ok(fb.ops.some(o => o[0] === 'fillText' && o[1] === 'squares') && fb.label.includes('squares'), fb.label);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(fb))), JSON.stringify(fb), 'the block is plain JSON');
  assert.ok(!fig.res.body.some(b => b.kind === 'ok'), 'a figure counts as output');
  const tc = await ran('run this: from sklearn.tree import DecisionTreeClassifier\nt = DecisionTreeClassifier().fit([[0.0], [1.0], [2.0], [3.0]], [0, 0, 1, 1])\nlist(t.compile().predict([[0.5], [2.5]]))');
  assert.equal(tc.res.value, '[0, 1]', 'compile() builds the tree\'s predict at run time, allowed in the worker (principle 9): ' + g.textOf(tc));
  const pr = (await ran('run this: from sklearn.linear_model import LinearRegression\nprint(LinearRegression().fit([[1.0], [2.0]], [3.0, 5.0]).coef_, float("inf"))')).res.body.find(b => b.t === 'pre').text;
  assert.ok(/^\[\d/.test(pr) && pr.endsWith(' inf\n') && !pr.includes('{'), 'print shows typed arrays as lists and inf as Python does: ' + pr);
  const ln = await ran('run this: import line as np\nm = np.array([[3.0, 1.0], [1.0, 2.0]])\nnp.linalg.solve(m, np.array([9.0, 8.0])).tolist()');
  assert.equal(ln.res.value, '[2, 3]', 'line is importable by its own name');
  assert.ok(!g.textOf(ln).includes('rewritten'), 'and nothing was rewritten to reach it');
  assert.equal((await ran('run this: import line as np\nnp.mean([1, 2, 3])')).res.value, '2', 'a plain list as the first call: line is attached before the run');
  const lr = await ran('run this: from sklearn.linear_model import LinearRegression\nm = LinearRegression().fit([[1.0], [2.0], [3.0]], [3.0, 5.0, 7.0])\nm.predict([[4.0]])');
  assert.ok(g.textOf(lr).includes('sklearn.linear_model → learn.linear_model'), g.textOf(lr));
  assert.ok(/^\[(8\.99999|9\.0000)/.test(lr.res.value), 'a typed array shown as a list: ' + lr.res.value);
  const km = await ran('run this: from sklearn.cluster import KMeans\nKMeans(n_clusters=2, random_state=0).fit([[0.0, 0.0], [0.1, 0.0], [5.0, 5.0], [5.1, 5.0]]).labels_');
  assert.ok(['[0, 0, 1, 1]', '[1, 1, 0, 0]'].includes(km.res.value), km.res.value);
  const sc = await ran('run this: from sklearn.preprocessing import StandardScaler\nStandardScaler().fit_transform([[1.0], [2.0], [3.0]])');
  assert.ok(/^\[\[-1\.2247.*\], \[0\], \[1\.2247/.test(sc.res.value), '2-D results nest by their shape: ' + sc.res.value);
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
  g.reset(); g.setRunner('python', req => { runs++; return worker(req); }); g.hydrate(saved); await g.settle();
  assert.ok(runs > before, 'replay ran the code again');
  assert.equal(g.S.cards.find(c => c.args.code === 'n = 3\nn ** 2' && !c.args.trace).res.value, '9');
});

test('without a runner the card says so instead of hanging', () => {
  g.reset(); g.setRunner('python', null);
  const c = card('run this: print(1)');
  assert.ok(g.textOf(c).includes('not available'));
  g.setRunner('python', req => worker(req));
});

test('every example on the Python card runs as written, so a tapped chip works', async () => {
  g.reset();
  const d = g.TOOLS.find(t => t.name === 'python');
  for (const ex of d.skill.examples) {
    const c = await ran(ex);
    assert.ok(!c.res.body.some(b => b.kind === 'err'), `${ex}: ${g.textOf(c)}`);
  }
});

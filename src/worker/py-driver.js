// The Python driver: runs adder source under golem's sandbox and returns plain JSON. It imports nothing;
// the caller hands it adder's API, so the same function runs in the page's worker (where the build
// concatenates adder's modules ahead of it) and in-process in the Node tests.
//   pyRun({ run, pyRepr, adderParse }, { code, trace, steps, ms }) → Promise<result>
// result: { stdout, stderr, value, error: { type, message, line } | null, steps, ms, trace, traceCut }

const SHOW = 80, TRACE_MAX = 200, FIG_MAX = 4000000;
const clip = s => s.length > SHOW ? s.slice(0, SHOW - 1) + '…' : s;

// the last top-level statement, when it is a bare expression, becomes an assignment so its value can be shown
function withLast(api, code) {
  let ast; try { ast = api.adderParse(code); } catch (e) { return { code, last: false }; }
  const body = ast && (ast.body || ast.stmts || []), tail = body[body.length - 1];
  if (!tail || tail.type !== 'Expr' || !tail.line) return { code, last: false };
  // a statement before it on the same line (a; b; c): the line cannot be wrapped whole, so no last value
  if (body.length > 1 && body[body.length - 2].line === tail.line) return { code, last: false };
  const lines = code.split('\n'), head = lines.slice(0, tail.line - 1), expr = lines.slice(tail.line - 1).join('\n').replace(/\s+$/, '');
  if (/^\s/.test(expr)) return { code, last: false };
  // the closing bracket on its own line, so a trailing comment cannot swallow it; the expression keeps its line number
  return { code: [...head, `__golem_last__ = (${expr}`, ')'].join('\n'), last: true };
}

export async function pyRun(api, req) {
  const steps = req.steps || 2000000, ms = req.ms || 5000, t0 = Date.now(), out = [], err = [], trace = [];
  const prep = withLast(api, req.code);
  let count = 0, prevLine = null, prevSnap = null, traceCut = false;
  // typed arrays (learn returns Float64Array, with a `shape` for 2-D results) shown as lists, not as JS objects
  const plain = v => { if (!ArrayBuffer.isView(v) || v instanceof DataView) return v; const s = v.shape; if (Array.isArray(s) && s.length === 2 && s[0] * s[1] === v.length) { const out = []; for (let i = 0; i < s[0]; i++) out.push(Array.from(v.subarray(i * s[1], (i + 1) * s[1]))); return out; } return Array.from(v); };
  const repr = v => { try { return clip(api.pyRepr(plain(v))); } catch (e) { return '…'; } };
  const snap = view => { const m = new Map(); try { for (const [k, v] of view.entries()) if (k !== '__golem_last__' && typeof v !== 'function') m.set(k, repr(v)); } catch (e) { /* a frame we cannot read */ } return m; };
  const diff = (a, b) => { const ch = []; for (const [k, v] of b) if (!a || a.get(k) !== v) ch.push(`${k} = ${v}`); return ch; };
  const onStep = req.trace ? ev => {
    count++;
    if (trace.length >= TRACE_MAX) { traceCut = true; return; }
    const now = snap(ev.scope);
    if (prevLine != null) trace.push([prevLine, diff(prevSnap, now).join(', ')]);
    prevLine = ev.line; prevSnap = now;
  } : undefined;
  let scope = null, error = null;
  try {
    scope = await api.run(prep.code, { host: false, remote: false, stdout: s => out.push(String(s)), stderr: s => err.push(String(s)), budget: { steps, ms, onStep } });
  } catch (e) {
    error = { type: e.pyType || (e instanceof SyntaxError ? 'SyntaxError' : e.name || 'Error'), message: String(e.pyMessage || e.message || e).replace(/\s*\(line \d+\)$/, ''), line: e.adderLine || null };
    const m = !error.line && /line (\d+)/.exec(String(e.message)); if (m) error.line = +m[1];
  }
  if (req.trace && prevLine != null && trace.length < TRACE_MAX && scope) { const last = new Map(Object.entries(scope).filter(([k, v]) => k !== '__golem_last__' && typeof v !== 'function').map(([k, v]) => [k, repr(v)])); trace.push([prevLine, diff(prevSnap, last).join(', ')]); }
  const lastV = scope && prep.last ? scope.__golem_last__ : null, isFigure = v => v && typeof v === 'object' && typeof v.toDrawList === 'function';
  const value = lastV !== undefined && lastV !== null && !isFigure(lastV) ? repr(lastV) : null;   // a figure shows as a figure, not as its repr
  // figures the code showed (plot's draw lists, plain JSON), up to FIG_MAX characters in all
  let figures = [], figuresCut = 0;
  if (api.figures) { try { let size = 0; for (const f of api.figures()) { const n = JSON.stringify(f).length; if (size + n > FIG_MAX) { figuresCut++; continue; } size += n; figures.push(f); } } catch (e) { err.push(`figures: ${e.message}\n`); } }
  return { stdout: out.join(''), stderr: err.join(''), value, error, steps: req.trace ? count : null, ms: Date.now() - t0, trace: req.trace ? trace : null, traceCut, figures, figuresCut, budget: { steps, ms } };
}

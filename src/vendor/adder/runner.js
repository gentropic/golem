// @gcu/adder — high-level runtime API (tree-walker path).
// Companion: @gcu/adder/air exports the same API backed by AIR transpilation
// (15-300x faster), at the cost of requiring @gcu/air as a peer dep.

import { adderParse, _adderParseExpr } from './parse.js';
import { adderEval, AdderScope, _setRunOptions, _setBudget, _makeBudget, registerModule, unregisterModule } from './eval.js';
import { adderBuiltins, setAdderVFS, getAdderVFS } from './builtins.js';

// Strip common leading whitespace. Python has no meaningful indentation at the
// module level, so a natural template literal like `\n    def foo(): ...` can
// be safely normalized — and it has to be, otherwise adder's indentation-
// sensitive parser rejects it. Ignores completely-blank lines when computing
// the common indent.
function _dedent(code) {
  if (typeof code !== 'string' || code.indexOf('\n') === -1) return code;
  const lines = code.split('\n');
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^[ \t]*/);
    const n = m ? m[0].length : 0;
    if (n < min) min = n;
    if (min === 0) break;
  }
  if (!Number.isFinite(min) || min === 0) return code;
  return lines.map(l => l.slice(min)).join('\n');
}

// ── IO defaults ──

const _defaultStdout = (s) => {
  if (typeof process !== 'undefined' && process.stdout) process.stdout.write(s);
  else if (typeof globalThis !== 'undefined' && globalThis.console) globalThis.console.log(s.replace(/\n$/, ''));
};
const _defaultStderr = (s) => {
  if (typeof process !== 'undefined' && process.stderr) process.stderr.write(s);
  else if (typeof globalThis !== 'undefined' && globalThis.console) globalThis.console.error(s.replace(/\n$/, ''));
};
const _defaultStdin = () => { throw new AdderRuntimeError('input() called but no stdin was provided'); };

class AdderRuntimeError extends Error {
  constructor(msg) { super(msg); this.name = 'AdderRuntimeError'; }
}

// ── build options into a scope + builtins set ──

// adder's print builtin formats the args (sep, end) and passes a single
// pre-formatted string to the printFn we pass in. Our default printFn just
// forwards to stdout. When the user provides `opts.print`, we REPLACE adder's
// print builtin entirely with their function — giving them access to raw
// args the way Python's print receives them.

function _makePrintFn(opts) {
  const stdout = opts.stdout || _defaultStdout;
  return (s) => stdout(s);
}

function _makeInput(opts) {
  if (opts.input) return opts.input;
  const stdin = opts.stdin || _defaultStdin;
  const stdout = opts.stdout || _defaultStdout;
  return async (prompt) => {
    if (prompt != null) stdout(String(prompt));
    const line = await stdin();
    if (line == null) throw new AdderRuntimeError('EOF while reading input');
    return line;
  };
}

function _makeBindings(opts) {
  const printFn = _makePrintFn(opts);
  const builtins = adderBuiltins(printFn);
  if (opts.print) builtins.print = opts.print;      // user wins; gets raw args
  builtins.input = _makeInput(opts);
  return {
    ...builtins,
    ...(opts.globals || {}),
    ...(opts.locals || {}),
  };
}

function _withVfs(opts, fn) {
  if (!opts.vfs) return fn();
  const prev = getAdderVFS();
  setAdderVFS(opts.vfs);
  try { return fn(); }
  finally { setAdderVFS(prev); }
}

// the sandbox options (host / remote / budget) are module-level state for the
// duration of ONE call, restored on exit like the VFS — so a notebook cell and
// a worker host can share the interpreter without seeing each other's rules
async function _withSandbox(opts, fn) {
  const prevOpts = _setRunOptions({ host: opts.host !== false, remote: opts.remote !== false });
  const prevBudget = _setBudget(_makeBudget(opts.budget));
  try { return await fn(); }
  finally { _setRunOptions(prevOpts); _setBudget(prevBudget); }
}

// Extract a plain object from an AdderScope, skipping names we injected as bindings.
// scope.vars is a Map; iterate to preserve insertion order and skip injected names.
function _scopeToObject(scope, bindings) {
  const result = {};
  if (scope.vars && typeof scope.vars.forEach === 'function') {
    scope.vars.forEach((v, k) => { if (!(k in bindings)) result[k] = v; });
  }
  return result;
}

// ── public API ──

/**
 * Execute adder source as a module. Returns the resulting scope as a plain object
 * mapping bound names to values.
 *
 * @param {string} code - adder source code
 * @param {object} [opts] - execution options
 * @param {object} [opts.globals] - names injected into scope
 * @param {object} [opts.locals] - names injected into scope (take precedence over globals)
 * @param {(...args) => void} [opts.print] - override for print()
 * @param {(s: string) => void} [opts.stdout] - where default print writes to
 * @param {(s: string) => void} [opts.stderr]
 * @param {() => string | Promise<string | null>} [opts.stdin] - reads next line for input()
 * @param {(prompt?) => string | Promise<string>} [opts.input] - override for input()
 * @param {object} [opts.vfs] - @gcu/vfs-shaped VFS for open(), os, pathlib, pathlib.Path
 * @param {boolean} [opts.host=true] - false removes the `js` module (no reach into globalThis)
 * @param {boolean} [opts.remote=true] - false turns off every import path that would call fetch()
 * @param {{steps?: number, ms?: number, onStep?: (ev: {line: number, kind: string, scope: object}) => void}} [opts.budget]
 *   - stop with AdderError('BudgetExceeded') after `steps` statements or `ms` wall-clock; onStep sees every statement
 * @returns {Promise<Record<string, any>>} the module scope
 */
export async function run(code, opts = {}) {
  const ast = adderParse(_dedent(code));
  const scope = new AdderScope();
  const bindings = _makeBindings(opts);
  for (const [k, v] of Object.entries(bindings)) scope.set(k, v);
  return await _withSandbox(opts, () => _withVfs(opts, async () => {
    await adderEval(ast, scope);
    return _scopeToObject(scope, bindings);
  }));
}

/**
 * Evaluate a single adder expression and return its value.
 *
 * @param {string} code - adder expression (not a statement)
 * @param {object} [opts] - same shape as run()
 * @returns {Promise<any>} the expression value
 */
export async function evalExpr(code, opts = {}) {
  const ast = _adderParseExpr(_dedent(code).trim());
  const scope = new AdderScope();
  const bindings = _makeBindings(opts);
  for (const [k, v] of Object.entries(bindings)) scope.set(k, v);
  return await _withSandbox(opts, () => _withVfs(opts, async () => adderEval(ast, scope)));
}

/**
 * Compile once, run many. Useful for REPLs and batch jobs that re-execute
 * the same code with different bindings.
 *
 * @param {string} code - adder source code
 * @returns {{ ast: object, run(opts?): Promise<Record<string, any>> }}
 */
export function compile(code) {
  const ast = adderParse(_dedent(code));
  return {
    ast,
    async run(opts = {}) {
      const scope = new AdderScope();
      const bindings = _makeBindings(opts);
      for (const [k, v] of Object.entries(bindings)) scope.set(k, v);
      return await _withSandbox(opts, () => _withVfs(opts, async () => {
        await adderEval(ast, scope);
        return _scopeToObject(scope, bindings);
      }));
    },
  };
}

/**
 * Test if adder source parses completely. Returns true if the parser
 * would want more input (open block, unclosed bracket, etc.). REPL loops
 * use this to decide whether to prompt for a continuation line.
 *
 * @param {string} code - adder source code
 * @returns {boolean} true if more input is needed
 */
export function isIncomplete(code) {
  if (code == null || code === '' || /^\s*$/.test(code)) return true;
  try {
    adderParse(_dedent(code));
    return false;
  } catch (e) {
    const msg = (e && e.message) || '';
    // Parser error patterns indicating the parser ran out of input mid-construct:
    //   "Expected INDENT, got '' [EOF]"          — block body missing
    //   "Expected X, got '' [NEWLINE]" or [EOF]  — unclosed bracket, missing operand
    //   "Unexpected token: NEWLINE ''"           — trailing comma in collection
    //   "Unexpected end of file"                 — generic EOF
    return /got '' \[|''\s*\(line|\bEOF\b|[Uu]nexpected end/.test(msg);
  }
}

export { AdderRuntimeError, registerModule, unregisterModule };

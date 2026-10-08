// ⚠ VENDORED — DO NOT EDIT. @gcu/sift, copied from ../auditable/ext/sift/index.js (built from its src/ by @gcu/build).
// Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/sift — A safe, structured predicate spec (no eval) with a JS-flavoured string parser — the lib the GCU selection/linking contract rests on.

// ── src/predicate.js ──

// @gcu/sift — predicate: a structured, safe boolean-expression spec for filters
// and cross-surface selections (the selection/linking contract §2).
//
// A predicate is plain JSON (structuredClone-transferable), evaluated by WALKING
// the tree — never eval / new Function — so any surface (even an untrusted one)
// can apply it over its own data. Users TYPE a JS-flavoured string; the emitter
// parses it to the spec; only the spec travels. Full-JS power lives in derived
// columns (owner-evaluated), not here — a user who needs `Math.log(x)` makes a
// derived boolean column and filters on it (a trivial, safe, travelling predicate).
//
// Extracted from strata (its filter engine) once plate became the second
// consumer — the predicate lib the selection/linking contract rests on. strata
// build-inlines this file (staying a self-contained leaf); plate consumes it
// (via strata's re-export); a notebook can load('@gcu/sift') directly. Zero-dep.
//
// Spec shapes:
//   Predicate = { form: 'spec', root: Expr }
//   Expr (boolean): {op:'and'|'or', args:Expr[]} · {op:'not', arg:Expr}
//     · {op:'=='|'!='|'<'|'<='|'>'|'>=', left:Term, right:Term}
//     · {op:'in'|'notin', left:Term, set:Lit[]} · {op:'between', arg:Term, lo:Term, hi:Term}
//     · {op:'isnull'|'notnull', arg:Term} · {op:'truthy', arg:Term}
//   Term (value): {col:string} · {lit:value} · {op:'+'|'-'|'*'|'/', left,right} · {op:'neg', arg}

const COMPARE = new Set(['==', '!=', '<', '<=', '>', '>=']);
const ARITH = new Set(['+', '-', '*', '/']);
const BOOL_OPS = new Set([...COMPARE, 'and', 'or', 'not', 'in', 'notin', 'between', 'isnull', 'notnull', 'truthy']);

function isValueNode(n) {
  return n && (('col' in n) || ('lit' in n) || ARITH.has(n.op) || n.op === 'neg');
}
function isNullLit(n) { return n && ('lit' in n) && n.lit === null; }

// ── evaluator ──────────────────────────────────────────────────────────

/**
 * Evaluate a predicate against one row.
 * @param {object} pred  a Predicate ({form,root}) or a bare Expr
 * @param {(col:string)=>*} get  resolves a column name → the row's value
 * @returns {boolean}
 */
function evaluatePredicate(pred, get) {
  return _bool(pred && pred.root ? pred.root : pred, get);
}

function _val(n, get) {
  if (n == null) return null;
  if ('col' in n) { const v = get(n.col); return v === undefined ? null : v; }
  if ('lit' in n) return n.lit;
  if (n.op === 'neg') { const a = _val(n.arg, get); return a == null ? null : -a; }
  if (ARITH.has(n.op)) {
    const a = _val(n.left, get), b = _val(n.right, get);
    if (a == null || b == null) return null;
    switch (n.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; }
  }
  return null;
}

function _cmp(a, b) { // non-null comparison: numbers numeric, else lexical
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function _truthy(v) { return v != null && v !== false && v !== 0 && v !== ''; }

function _bool(n, get) {
  if (!n || typeof n.op !== 'string') throw new Error('predicate: not a boolean node');
  switch (n.op) {
    case 'and': return n.args.every((x) => _bool(x, get));
    case 'or': return n.args.some((x) => _bool(x, get));
    case 'not': return !_bool(n.arg, get);
    case 'truthy': return _truthy(_val(n.arg, get));
    case 'isnull': return _val(n.arg, get) == null;
    case 'notnull': return _val(n.arg, get) != null;
    case 'in': case 'notin': {
      const v = _val(n.left, get);
      const has = v != null && n.set.includes(v);
      return n.op === 'in' ? has : (v != null && !has);
    }
    case 'between': {
      const v = _val(n.arg, get); if (v == null) return false;
      const lo = _val(n.lo, get), hi = _val(n.hi, get);
      if (lo == null || hi == null) return false;
      return _cmp(v, lo) >= 0 && _cmp(v, hi) <= 0;
    }
    default: {
      if (!COMPARE.has(n.op)) throw new Error('predicate: unknown op "' + n.op + '"');
      const a = _val(n.left, get), b = _val(n.right, get);
      // == / != with a null operand → false (null-checks go through isnull/notnull).
      if (n.op === '==') return a != null && b != null && a === b;
      if (n.op === '!=') return a != null && b != null && a !== b;
      if (a == null || b == null) return false;
      const c = _cmp(a, b);
      switch (n.op) { case '<': return c < 0; case '<=': return c <= 0; case '>': return c > 0; case '>=': return c >= 0; }
    }
  }
}

// ── deps + validate ────────────────────────────────────────────────────

/** The column names a predicate references (for "can this receiver satisfy it?"). */
function predicateColumns(pred) {
  const out = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if ('col' in n) out.add(n.col);
    for (const k of ['arg', 'left', 'right', 'lo', 'hi']) if (n[k]) walk(n[k]);
    if (n.args) n.args.forEach(walk);
  })(pred && pred.root ? pred.root : pred);
  return [...out];
}

/** Shape-check a predicate; throws on a malformed spec. Returns true. */
function validatePredicate(pred) {
  (function v(n, ctx) {
    if (!n || typeof n !== 'object') throw new Error('predicate: expected a node');
    if ('col' in n || 'lit' in n) return;
    if (typeof n.op !== 'string') throw new Error('predicate: node needs an op');
    if (ctx === 'bool' && !BOOL_OPS.has(n.op)) throw new Error('predicate: "' + n.op + '" is not a boolean op');
    if (n.op === 'and' || n.op === 'or') { if (!Array.isArray(n.args)) throw new Error('predicate: and/or needs args[]'); n.args.forEach((a) => v(a, 'bool')); return; }
    if (n.op === 'not' || n.op === 'truthy' || n.op === 'isnull' || n.op === 'notnull' || n.op === 'neg') { v(n.arg, n.op === 'not' ? 'bool' : 'val'); return; }
    if (n.op === 'between') { v(n.arg, 'val'); v(n.lo, 'val'); v(n.hi, 'val'); return; }
    if (n.op === 'in' || n.op === 'notin') { v(n.left, 'val'); if (!Array.isArray(n.set)) throw new Error('predicate: in/notin needs set[]'); return; }
    if (COMPARE.has(n.op) || ARITH.has(n.op)) { v(n.left, 'val'); v(n.right, 'val'); return; }
    throw new Error('predicate: unknown op "' + n.op + '"');
  })(pred && pred.root ? pred.root : pred, 'bool');
  return true;
}

// ── string → spec parser (authoring side only) ─────────────────────────
// A JS-flavoured expression subset: && || ! , == === != !== < <= > >= ,
// + - * / , parens, column idents, number/string/bool/null literals. Anything
// outside (function calls, member access, …) is rejected — that's the safety.
// `x == null` / `x != null` lower to isnull / notnull. A bare term in boolean
// position becomes `truthy` (so a derived boolean column filters as `flag`).

function tokenize(s) {
  const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, out = '';
      while (j < s.length && s[j] !== c) { if (s[j] === '\\') { out += s[j + 1]; j += 2; } else { out += s[j++]; } }
      if (j >= s.length) throw new Error('sift: unterminated string');
      toks.push({ t: 'lit', v: out }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      toks.push({ t: 'num', v: Number(s.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < s.length && /[A-Za-z0-9_$]/.test(s[j])) j++;
      toks.push({ t: 'ident', v: s.slice(i, j) }); i = j; continue;
    }
    const three = s.slice(i, i + 3), two = s.slice(i, i + 2);
    if (three === '===' || three === '!==') { toks.push({ t: 'op', v: three === '===' ? '==' : '!=' }); i += 3; continue; }
    if (['&&', '||', '==', '!=', '<=', '>='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('!<>+-*/'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { toks.push({ t: 'lparen' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rparen' }); i++; continue; }
    throw new Error('sift: unexpected character "' + c + '"');
  }
  return toks;
}

function asBool(node) { return isValueNode(node) ? { op: 'truthy', arg: node } : node; }

/** Parse a filter string → { form:'spec', root }. Throws on disallowed syntax. */
function parsePredicate(str) {
  const toks = tokenize(str);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

  function flatten(op, a, b) { const r = []; for (const x of [a, b]) { if (x.op === op) r.push(...x.args); else r.push(x); } return r; }

  function parseOr() { let l = parseAnd(); while (isOp('||')) { p++; l = { op: 'or', args: flatten('or', l, parseAnd()) }; } return l; }
  function parseAnd() { let l = asBool(parseCmp()); while (isOp('&&')) { p++; l = { op: 'and', args: flatten('and', l, asBool(parseCmp())) }; } return l; }
  function parseCmp() {
    const left = parseAdd();
    if (peek() && peek().t === 'op' && COMPARE.has(peek().v)) {
      const op = peek().v; p++;
      const right = parseAdd();
      if ((op === '==' || op === '!=') && isNullLit(right)) return { op: op === '==' ? 'isnull' : 'notnull', arg: left };
      if ((op === '==' || op === '!=') && isNullLit(left)) return { op: op === '==' ? 'isnull' : 'notnull', arg: right };
      return { op, left, right };
    }
    return left;
  }
  function parseAdd() { let l = parseMul(); while (isOp('+') || isOp('-')) { const op = peek().v; p++; l = { op, left: l, right: parseMul() }; } return l; }
  function parseMul() { let l = parseUnary(); while (isOp('*') || isOp('/')) { const op = peek().v; p++; l = { op, left: l, right: parseUnary() }; } return l; }
  function parseUnary() {
    if (isOp('!')) { p++; return { op: 'not', arg: asBool(parseUnary()) }; }
    if (isOp('-')) { p++; return { op: 'neg', arg: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('sift: unexpected end of expression');
    if (t.t === 'num') { p++; return { lit: t.v }; }
    if (t.t === 'lit') { p++; return { lit: t.v }; }
    if (t.t === 'lparen') { p++; const e = parseOr(); if (!peek() || peek().t !== 'rparen') throw new Error('sift: expected ")"'); p++; return e; }
    if (t.t === 'ident') {
      p++;
      if (t.v === 'true') return { lit: true };
      if (t.v === 'false') return { lit: false };
      if (t.v === 'null') return { lit: null };
      if (peek() && peek().t === 'lparen') throw new Error('sift: function calls are not allowed — use a derived column for full-JS logic');
      return { col: t.v };
    }
    throw new Error('sift: unexpected token "' + (t.v != null ? t.v : t.t) + '"');
  }

  const root = asBool(parseOr());
  if (p < toks.length) throw new Error('sift: unexpected token after expression');
  return { form: 'spec', root };
}

// ── spec → string (for display / audit / round-trip) ───────────────────

const PARENS = new Set(['and', 'or']);

function predicateToString(pred) {
  return _str(pred && pred.root ? pred.root : pred);
}
function _str(n) {
  if (!n) return '';
  if ('col' in n) return n.col;
  if ('lit' in n) { const v = n.lit; return typeof v === 'string' ? JSON.stringify(v) : String(v); }
  switch (n.op) {
    case 'and': return n.args.map(_wrap).join(' && ');
    case 'or': return n.args.map(_wrap).join(' || ');
    case 'not': return '!' + _wrap(n.arg);
    case 'neg': return '-' + _wrap(n.arg);
    case 'truthy': return _str(n.arg);
    case 'isnull': return _str(n.arg) + ' == null';
    case 'notnull': return _str(n.arg) + ' != null';
    case 'in': return _str(n.left) + ' in [' + n.set.map((x) => JSON.stringify(x)).join(', ') + ']';
    case 'notin': return _str(n.left) + ' notin [' + n.set.map((x) => JSON.stringify(x)).join(', ') + ']';
    case 'between': return _str(n.arg) + ' between ' + _str(n.lo) + ' and ' + _str(n.hi);
    default: return _str(n.left) + ' ' + n.op + ' ' + _str(n.right);
  }
}
function _wrap(n) { return n && PARENS.has(n.op) ? '(' + _str(n) + ')' : _str(n); }

// ── src/main.js ──

// @gcu/sift — the safe, structured predicate lib the selection/linking contract
// rests on. One module today (predicate.js); kept as a manifest for symmetry
// with the other concat libs and room to grow (e.g. a set-algebra combinator).
//
// Module manifest (build concat order):
//   predicate.js — structured boolean-expr spec + validator + evaluator + parser

export {
  evaluatePredicate,
  predicateColumns,
  validatePredicate,
  parsePredicate,
  predicateToString,
};

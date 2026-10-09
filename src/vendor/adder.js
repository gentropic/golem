// ⚠ VENDORED — DO NOT EDIT. @gcu/adder (the single-file build, with run and the sandbox options), copied from ../auditable/ext/adder/index.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: ext/adder/src/  Build: node ext/adder/build.js
// @gcu/adder — Pure JS Python interpreter for Auditable
// Python cells, adder/mpy tagged template, tree-walking evaluator.

// -- inlined: ../air/src/types.js (AIR type singletons) --

// @gcu/air — Type system
// Plain objects, no classes. See spec §2.

// --- Singleton type constructors ---

const I8    = Object.freeze({ kind: 'i8' });
const U8    = Object.freeze({ kind: 'u8' });
const I16   = Object.freeze({ kind: 'i16' });
const U16   = Object.freeze({ kind: 'u16' });
const I32   = Object.freeze({ kind: 'i32' });
const U32   = Object.freeze({ kind: 'u32' });
const I64   = Object.freeze({ kind: 'i64' });
const U64   = Object.freeze({ kind: 'u64' });
const F32   = Object.freeze({ kind: 'f32' });
const F64   = Object.freeze({ kind: 'f64' });
const BOOL  = Object.freeze({ kind: 'bool' });
const STRING = Object.freeze({ kind: 'string' });
const VOID  = Object.freeze({ kind: 'void' });
const DYNAMIC = Object.freeze({ kind: 'dynamic' });

function typedArray(element) {
  return Object.freeze({ kind: 'typed_array', element });
}

function array(element) {
  return Object.freeze({ kind: 'array', element });
}

function object(fields) {
  return Object.freeze({ kind: 'object', fields });
}

function func(params, ret) {
  return Object.freeze({ kind: 'function', params, ret });
}

// --- Type annotation mapping (spec §2.2) ---

const TS_TYPE_MAP = {
  // GCU numeric types
  'i8': I8, 'u8': U8, 'i16': I16, 'u16': U16,
  'i32': I32, 'u32': U32, 'i64': I64, 'u64': U64,
  'f32': F32, 'f64': F64, 'bool': BOOL,
  // Standard TS types
  'number': F64, 'boolean': BOOL, 'string': STRING, 'void': VOID,
  // Standard typed array constructors
  'Int8Array': typedArray('i8'), 'Uint8Array': typedArray('u8'),
  'Int16Array': typedArray('i16'), 'Uint16Array': typedArray('u16'),
  'Int32Array': typedArray('i32'), 'Uint32Array': typedArray('u32'),
  'Float32Array': typedArray('f32'), 'Float64Array': typedArray('f64'),
  'BigInt64Array': typedArray('i64'), 'BigUint64Array': typedArray('u64'),
  // GCU typed array aliases
  'i8array': typedArray('i8'), 'u8array': typedArray('u8'),
  'i16array': typedArray('i16'), 'u16array': typedArray('u16'),
  'i32array': typedArray('i32'), 'u32array': typedArray('u32'),
  'f32array': typedArray('f32'), 'f64array': typedArray('f64'),
  'i64array': typedArray('i64'), 'u64array': typedArray('u64'),
};

// Resolve a TS annotation AST node to an AIR type
function resolveAnnotation(node) {
  if (!node) return DYNAMIC;
  const ann = node.typeAnnotation || node;
  switch (ann.type) {
    case 'TSTypeAnnotation':
      return resolveAnnotation(ann.typeAnnotation);
    case 'TSTypeReference':
      return TS_TYPE_MAP[ann.typeName?.name] || DYNAMIC;
    case 'TSNumberKeyword': return F64;
    case 'TSBooleanKeyword': return BOOL;
    case 'TSStringKeyword': return STRING;
    case 'TSVoidKeyword': return VOID;
    case 'TSArrayType': {
      const el = resolveAnnotation(ann.elementType);
      return array(el);
    }
    default: return DYNAMIC;
  }
}

// --- Type predicates ---

function isNumeric(t) {
  const k = t.kind;
  return k === 'i8' || k === 'u8' || k === 'i16' || k === 'u16' ||
         k === 'i32' || k === 'u32' || k === 'i64' || k === 'u64' ||
         k === 'f32' || k === 'f64';
}

function isInteger(t) {
  const k = t.kind;
  return k === 'i8' || k === 'u8' || k === 'i16' || k === 'u16' ||
         k === 'i32' || k === 'u32' || k === 'i64' || k === 'u64';
}

function isFloat(t) {
  return t.kind === 'f32' || t.kind === 'f64';
}

function isSigned(t) {
  const k = t.kind;
  return k === 'i8' || k === 'i16' || k === 'i32' || k === 'i64';
}

function isDynamic(t) {
  return t.kind === 'dynamic';
}

function isConcrete(t) {
  return t.kind !== 'dynamic';
}

// --- Type width (bits) for promotion ---

const TYPE_WIDTH = {
  'i8': 8, 'u8': 8, 'i16': 16, 'u16': 16,
  'i32': 32, 'u32': 32, 'i64': 64, 'u64': 64,
  'f32': 32, 'f64': 64,
};

// Promotion hierarchy lookup
const PROMOTE_RANK = {
  'i8': 0, 'u8': 0, 'i16': 1, 'u16': 1,
  'i32': 2, 'u32': 2, 'i64': 3, 'u64': 3,
  'f32': 4, 'f64': 5,
};

const RANK_TO_SIGNED   = { 0: I8, 1: I16, 2: I32, 3: I64 };
const RANK_TO_UNSIGNED = { 0: U8, 1: U16, 2: U32, 3: U64 };

// --- Arithmetic result type (spec §2.5) ---

function arithmeticResult(lhs, rhs) {
  if (isDynamic(lhs) || isDynamic(rhs)) return DYNAMIC;
  if (!isNumeric(lhs) || !isNumeric(rhs)) return DYNAMIC;

  const lr = PROMOTE_RANK[lhs.kind];
  const rr = PROMOTE_RANK[rhs.kind];

  // Both float
  if (isFloat(lhs) && isFloat(rhs)) {
    return lr >= rr ? lhs : rhs;
  }
  // One float, one integer → float wins
  if (isFloat(lhs)) return lhs;
  if (isFloat(rhs)) return rhs;

  // Both integer — promote narrower, signed wins on same width
  if (lr !== rr) {
    const maxRank = Math.max(lr, rr);
    // use signed if either is signed
    if (isSigned(lhs) || isSigned(rhs)) return RANK_TO_SIGNED[maxRank];
    return RANK_TO_UNSIGNED[maxRank];
  }
  // Same width — signed wins
  if (isSigned(lhs) || isSigned(rhs)) return RANK_TO_SIGNED[lr];
  return RANK_TO_UNSIGNED[lr];
}

// Comparison always → bool
function comparisonResult(lhs, rhs) {
  return BOOL;
}

// Bitwise ops always → i32
function bitwiseResult() {
  return I32;
}

// --- Type equality ---

function typeEq(a, b) {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'typed_array') return a.element === b.element;
  if (a.kind === 'array') return typeEq(a.element, b.element);
  if (a.kind === 'function') {
    if (a.params.length !== b.params.length) return false;
    if (!typeEq(a.ret, b.ret)) return false;
    return a.params.every((p, i) => typeEq(p, b.params[i]));
  }
  if (a.kind === 'object') {
    const aKeys = [...a.fields.keys()].sort();
    const bKeys = [...b.fields.keys()].sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && typeEq(a.fields.get(k), b.fields.get(k)));
  }
  return true;
}

// -- inlined: ../air/src/scope.js (AIR ScopeChain) --

// @gcu/air — ScopeChain (v0.3 §3.3)
//
// Single shared lexical-scope abstraction for everything in AIR that
// tracks names → values across nested scopes. Today three places do
// this independently:
//
//   1. lower/js.js findMutableCaptured — closure-detection scope walker
//      using a `scopes` array of Sets directly.
//   2. emit-js.js Scope — `let` declaration tracker (Set-of-names with
//      a parent pointer).
//   3. lower/js.js ctx.symbols — flat Map<name, ssaId>. Doesn't pop at
//      scope exit, leading to silent type-prop wrongness when an inner
//      scope shadows an outer name (the spec's §2.3 latent bug).
//
// This class is the abstraction the first two migrate to in v0.3. The
// ctx.symbols migration is its own session — adding push/pop semantics
// to a previously-flat lookup is a real behavior change, not a rename.
//
// Design: name → any value (ssa id, boolean, type, …). Each layer is a
// Map so a name can be set to falsy values (null, 0, false). `has`
// distinguishes "name exists with value undefined" from "name not bound".

class ScopeChain {
  /**
   * @param {ScopeChain | null} parent
   */
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  /**
   * Bind a name in THIS scope (does not propagate up).
   */
  set(name, value) {
    this.bindings.set(name, value);
    return this;
  }

  /**
   * Look up a name. Returns the binding from the innermost scope where
   * it exists, or undefined if unbound at every level.
   */
  get(name) {
    if (this.bindings.has(name)) return this.bindings.get(name);
    return this.parent ? this.parent.get(name) : undefined;
  }

  /**
   * True if the name is bound at this scope or any enclosing scope.
   */
  has(name) {
    if (this.bindings.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }

  /**
   * True if the name is bound in any enclosing scope, but NOT in this
   * scope. Used by closure-detection: "is this name visible from outer
   * lexical context, such that an assignment captures it?"
   */
  hasInOuter(name) {
    return this.parent ? this.parent.has(name) : false;
  }

  /**
   * Remove a binding. Walks up the chain and deletes from the innermost
   * scope where the name is bound. Returns true if a binding was removed,
   * false if the name wasn't bound anywhere visible.
   *
   * Used by emit-js's `ctx.exprs` consume semantics — when a single-use
   * SSA value is inlined at its consumer, the entry is deleted from
   * whichever frame registered it.
   */
  delete(name) {
    if (this.bindings.has(name)) { this.bindings.delete(name); return true; }
    return this.parent ? this.parent.delete(name) : false;
  }

  /**
   * Reassign a binding if it already exists somewhere in the chain;
   * otherwise declare it locally. Mirrors emit-js's `store` op semantics:
   * if the name is in scope (any ancestor or this frame), update where
   * it lives; if it's a new name, create the binding in the current frame.
   *
   * Used by the AIR interpreter's `store` op so that
   *
   *   let sum = 0;
   *   for (let i = 0; i < 10; i++) sum = sum + i;
   *
   * correctly updates the outer `sum` instead of declaring a per-iteration
   * local that gets discarded when the loop frame pops.
   */
  setOrExisting(name, value) {
    for (let s = this; s; s = s.parent) {
      if (s.bindings.has(name)) {
        s.bindings.set(name, value);
        return this;
      }
    }
    this.bindings.set(name, value);
    return this;
  }

  /**
   * Return a new child scope with `this` as parent. Caller is responsible
   * for assigning the result somewhere — e.g. `chain = chain.push()`.
   */
  push() {
    return new ScopeChain(this);
  }

  /**
   * Return the parent scope, dropping `this`. Throws if at root.
   */
  pop() {
    if (!this.parent) {
      throw new Error('ScopeChain: cannot pop the root scope');
    }
    return this.parent;
  }

  /**
   * Snapshot every binding visible from this scope, with the innermost
   * value winning for shadowed names. Useful for debugging and for
   * code that needs a flat Map (legacy callers like lower/js.js's
   * `symbol_table: new Map(ctx.symbols)` snapshot).
   */
  flatten() {
    const out = new Map();
    // Walk from root → leaf so inner shadows the outer naturally
    const chain = [];
    for (let s = this; s; s = s.parent) chain.push(s);
    for (let i = chain.length - 1; i >= 0; i--) {
      for (const [k, v] of chain[i].bindings) out.set(k, v);
    }
    return out;
  }

  /**
   * Iterate every binding visible from this scope (innermost wins).
   * Yields [name, value] pairs.
   */
  *entries() {
    yield* this.flatten();
  }

  /**
   * Depth from root. Root is 0, first child is 1, etc.
   */
  depth() {
    let d = 0;
    for (let s = this.parent; s; s = s.parent) d++;
    return d;
  }
}

// -- inlined: ../air/src/lower/base.js (AIR shared LowerCtx) --

// @gcu/air — Shared lowering scaffolding
//
// First step of the lowerer-frontend extraction (spec_inbox/lang/
// air-lowerer-frontend-spec.md). Three lowerers (JS / adder / soft)
// each had their own LowerCtx, mkOp, and id-counter — identical fields
// and methods, divergent only in language-specific extras (mutable-
// capture analysis for JS, sync-function detection for adder, etc.).
//
// This module hosts the common parts; each lowerer extends `BaseLowerCtx`
// with whatever it needs on top. Cross-package consumers (adder, soft)
// inline this file at build time the same way they already inline
// types.js — see their build.js scripts.
//
// Subsequent extraction sessions can lift more shared scaffolding here:
// BinOp dispatch tables (BINARY_OP_MAP), control-flow lowering helpers,
// class-lowering primitives. Today's scope is just the context object.



/**
 * Lowering failure that the wrapper at ext/air/src/api.js treats as
 * "fall back to the tree-walker / opaque path" rather than "real bug,
 * propagate." The `_airFallback: true` marker is the load-bearing
 * contract — every frontend's lowerer should throw this (or a subclass
 * of it) for nodes it can't handle.
 *
 * Lifted to base.js so all frontends share one definition; previously
 * adder + soft each defined their own identical class.
 */
class AirLowerError extends Error {
  constructor(message) {
    super(message);
    this._airFallback = true;
    this.name = 'AirLowerError';
  }
}

/**
 * Per-instance SSA-id generator. Each lowering invocation gets its own,
 * so cell A's ids don't collide with cell B's even when both lowerers
 * share this module.
 */
function makeIdGen() {
  let n = 0;
  return {
    next: () => '%' + (n++),
    reset: () => { n = 0; },
    peek: () => n,
  };
}

/**
 * Build an op record. Mirror of the per-language mkOp helpers each
 * lowerer used to keep — identical except for the type default. We
 * default to DYNAMIC across the board, matching adder/soft's prior
 * behavior; JS's lowerer used to leave type undefined for some ops,
 * but downstream `if (type) types.set(...)` checks make the difference
 * unobservable.
 */
function mkOp(id, op, args, type, loc, extra) {
  const o = { id, op, args, type: type || DYNAMIC, loc };
  if (extra) Object.assign(o, extra);
  return o;
}

/**
 * Shared lowering context. Each lowerer subclasses this to add
 * language-specific fields (mutable-capture set, sync-function set,
 * adder-specific declared tracker, etc.) and provides a per-language
 * `loc(node)` because AST shapes differ.
 *
 * Fields:
 *   ops      — flat list of ops emitted into the current region. Region
 *              lowering swaps ops to a sub-list, lowers the body, and
 *              restores ops to the parent list (regions hold their body
 *              in their own ops array).
 *   symbols  — ScopeChain<name, ssa_id>. Push at function/block
 *              boundaries to scope inner-fn shadows correctly (see F's
 *              ctx.symbols migration). Adder/soft have not yet added
 *              push/pop discipline; today they treat the chain as a
 *              flat root frame.
 *   types    — Map<ssa_id, Type> for value tracking inside the lowerer
 *              (passes do their own; this is the lowerer's local view).
 *   topLevel — true when emitting at the cell's root scope (so let/const
 *              declarations register as cell exports). Each region
 *              lowering toggles to false.
 *   defines  — set of names this cell exports.
 *   imports  — set of free names this cell references but doesn't define
 *              (cross-cell deps).
 *   source   — original source string, for the opaque escape hatch.
 */
class BaseLowerCtx {
  constructor() {
    this.ops = [];
    this.symbols = new ScopeChain();
    this.types = new Map();
    this.topLevel = true;
    this.defines = new Set();
    this.imports = new Set();
    this.source = null;
    this._idGen = makeIdGen();
  }

  emit(op, args, type, loc, extra) {
    const o = mkOp(this._idGen.next(), op, args, type, loc, extra);
    this.ops.push(o);
    if (type) this.types.set(o.id, type);
    return o;
  }

  // Subclasses override to provide language-specific node→{line, col}.
  loc(_node) { return null; }

  /**
   * Synthesize a unique-per-cell identifier with a readable prefix.
   * Used wherever a lowering needs a temporary name visible in emitted
   * JS — e.g. comprehensions' result accumulator, with-block managers,
   * for-of unpacking targets, repeat-loop counters.
   *
   *   ctx.makeTempName('rep')      → '__rep_42'
   *   ctx.makeTempName('with_mgr') → '__with_mgr_43'
   *
   * Convention: `__` prefix marks synthetic names so user code can't
   * accidentally shadow them; the trailing `_N` ties the name to
   * lowering progress and stays stable across re-emits.
   */
  makeTempName(prefix) {
    return `__${prefix}_${this._idGen.peek()}`;
  }

  /**
   * Emit a runtime-helper call: `<namespace>.<method>(<args>)`. Each
   * frontend dispatches differently to its runtime — adder uses
   * `_py.add(a, b)` for dunder semantics, soft uses `_soft.eq(a, b)`
   * for case-insensitive string compare, etc. — but the AIR shape is
   * identical:
   *
   *   load(namespace) → object_get(method) → call(method_id, …args)
   *
   * Frontends keep thin wrappers (e.g. `emitPyCall = (ctx, m, a, l, t) =>
   * ctx.emitNamespacedCall('_py', m, a, l, t)`) for ergonomics, but
   * the canonical path lives here.
   *
   * @param {string} namespace - the runtime helper's variable name
   * @param {string} method    - method to call on the namespace
   * @param {Array<{id: string}>} args - SSA-typed argument ops
   * @param {object|null} loc  - source location
   * @param {object|null} type - result type hint, defaults to DYNAMIC
   */
  emitNamespacedCall(namespace, method, args, loc, type) {
    const ns = this.emit('load', [namespace], DYNAMIC, loc);
    const methodGet = this.emit('object_get', [ns.id, method], DYNAMIC, loc);
    return this.emit(
      'call',
      [methodGet.id, ...args.map(a => a.id)],
      type || DYNAMIC,
      loc,
    );
  }

  /**
   * Coerce a value to a boolean for branching contexts (if / while /
   * and / or / ternary). Default is JS-style pass-through — the if_region
   * op accepts the value as-is. Frontends with non-JS truthiness
   * semantics (Python's _py.truthy with empty-list/empty-dict cases,
   * Soft's case-folding rules) override:
   *
   *   class AdderLowerCtx extends BaseLowerCtx {
   *     truthy(valueOp, loc) {
   *       return this.emitNamespacedCall('_py', 'truthy', [valueOp], loc, BOOL);
   *     }
   *   }
   *
   * Used by lowerIfRegion, lowerLoopRegion, and (soon) phi-select for
   * and/or short-circuiting.
   */
  truthy(valueOp, _loc) { return valueOp; }
}

/**
 * The "two branches, pick a value via phi" pattern that shows up in
 * every ternary-ish construct: JS `cond ? a : b`, adder `a if c else b`,
 * adder `a and b` / `a or b`, soft `X if cond otherwise Y`, etc.
 *
 * Caller provides:
 *   - condId  - SSA id of the (already-truthy-coerced) condition
 *   - thenFn  - callback that lowers the then-branch and returns its
 *               value op; called inside captureOps so its emits become
 *               then_body
 *   - elseFn  - same for else-branch
 *
 * Returns the if_region op, with phi wired so downstream consumers
 * can reference it as a single value.
 */
function emitPhiSelect(ctx, condId, thenFn, elseFn, loc, type) {
  let thenVal = null;
  let elseVal = null;
  const thenBody = captureOps(ctx, () => { thenVal = thenFn(); });
  const elseBody = captureOps(ctx, () => { elseVal = elseFn(); });
  return ctx.emit('if_region', [condId], type || DYNAMIC, loc, {
    then_body: thenBody,
    else_body: elseBody,
    phis: [{ then_val: thenVal.id, else_val: elseVal.id }],
  });
}

/**
 * Run `fn` with `ctx.ops` swapped to a fresh array, capturing whatever ops
 * `fn` emits during its execution. Restore the previous `ctx.ops` and
 * return the captured array.
 *
 * Replaces the save-ops / lower-body / restore-ops idiom that every
 * region-introducing lowering function in all three lowerers used to
 * inline:
 *
 *   const savedOps = ctx.ops;
 *   ctx.ops = [];
 *   for (const s of body) lowerStmt(ctx, s);
 *   const bodyOps = ctx.ops;
 *   ctx.ops = savedOps;
 *
 * Becomes:
 *
 *   const bodyOps = captureOps(ctx, () => {
 *     for (const s of body) lowerStmt(ctx, s);
 *   });
 *
 * Restores `ctx.ops` even if `fn` throws, so partial errors don't leave
 * the lowerer with a stale ops array referencing a half-built region.
 */
function captureOps(ctx, fn) {
  const saved = ctx.ops;
  ctx.ops = [];
  try {
    fn();
    return ctx.ops;
  } finally {
    ctx.ops = saved;
  }
}

/**
 * Lower an `if` / `else` construct into AIR. Frontend-agnostic — picks up
 * the truthy-coercion via `ctx.truthy()` so each language's bool-coercion
 * semantics fold in. Frontend wrapper is just AST-shape adaptation:
 *
 *   function lowerIf(ctx, node) {        // adder
 *     return lowerIfRegion(ctx,
 *       () => lowerExpr_ad(ctx, node.test),
 *       () => { for (const s of node.body) lowerStmt_ad(ctx, s); },
 *       () => { if (node.orelse) for (const s of node.orelse) lowerStmt_ad(ctx, s); },
 *       ctx.loc(node));
 *   }
 *
 * Frontends that need extra phi-tracking, special else-if folding, or
 * other quirks keep their own inline lowerIf — the helper is opt-in.
 */
function lowerIfRegion(ctx, condFn, thenFn, elseFn, loc) {
  const condValue = condFn();
  const cond = ctx.truthy(condValue, loc);
  const thenBody = captureOps(ctx, thenFn);
  const elseBody = captureOps(ctx, elseFn);
  return ctx.emit('if_region', [cond.id], VOID, loc, {
    then_body: thenBody, else_body: elseBody, phis: [],
  });
}

/**
 * Lower a `while`-style loop region. `kind` matches AIR's loop_region
 * extras (`'while'` | `'do_while'` | …) so the emitter picks the right
 * JS construct.
 *
 *   function lowerWhile(ctx, node) {     // soft
 *     return lowerLoopRegion(ctx,
 *       () => lowerExpr_sf(ctx, node.cond),
 *       () => { for (const s of node.body) lowerStmt_sf(ctx, s); },
 *       ctx.loc(node), 'while');
 *   }
 */
function lowerLoopRegion(ctx, condFn, bodyFn, loc, kind = 'while') {
  let truthy = null;
  const testOps = captureOps(ctx, () => {
    truthy = ctx.truthy(condFn(), loc);
  });
  const body = captureOps(ctx, bodyFn);
  return ctx.emit('loop_region', [], VOID, loc, {
    test: testOps,
    test_val: truthy.id,
    body,
    phis: [],
    loop_kind: kind,
  });
}

// -- parse.js --

// adder v2 — tokenizer + recursive-descent parser
// Produces an AST from Python source code. No external dependencies.

// ── escape sequences ──

function _processEscapes(raw) {
  let out = '', i = 0;
  while (i < raw.length) {
    if (raw[i] !== '\\' || i + 1 >= raw.length) { out += raw[i++]; continue; }
    const c = raw[++i];
    switch (c) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case '\\': out += '\\'; break;
      case "'": out += "'"; break;
      case '"': out += '"'; break;
      case '0': out += '\0'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case 'x': out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16)); i += 2; break;
      case 'u': out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16)); i += 4; break;
      case 'U': out += String.fromCodePoint(parseInt(raw.slice(i + 1, i + 9), 16)); i += 8; break;
      default:
        if (c >= '0' && c <= '7') {
          let oct = c;
          if (i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') { oct += raw[++i]; }
          if (i + 1 < raw.length && raw[i + 1] >= '0' && raw[i + 1] <= '7') { oct += raw[++i]; }
          out += String.fromCharCode(parseInt(oct, 8));
        } else {
          out += '\\' + c; // unknown escape — keep as-is
        }
    }
    i++;
  }
  return out;
}

// ── tokenizer ──

const _TWO_OP = new Set(['**', '//', '<<', '>>', '<=', '>=', '==', '!=', '->', ':=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=']);
const _THREE_OP = new Set(['**=', '//=', '<<=', '>>=']);

function adderTokenize(code) {
  const tokens = [];
  const indentStack = [0];
  let pos = 0, line = 1, col = 0;
  let bracketDepth = 0, atBol = true;
  const len = code.length;

  function tok(type, value) { return { type, value, line, col }; }

  while (pos < len) {
    // ── beginning of line: indentation ──
    if (atBol && bracketDepth === 0) {
      let indent = 0;
      while (pos < len && (code[pos] === ' ' || code[pos] === '\t')) {
        indent += code[pos] === '\t' ? (4 - indent % 4) : 1;
        pos++; col++;
      }
      // skip blank / comment-only lines
      if (pos >= len || code[pos] === '\n' || code[pos] === '\r') {
        if (pos < len) { if (code[pos] === '\r' && code[pos + 1] === '\n') pos++; pos++; line++; col = 0; }
        continue;
      }
      if (code[pos] === '#') {
        while (pos < len && code[pos] !== '\n') { pos++; col++; }
        continue;
      }
      // emit INDENT / DEDENT
      const top = indentStack[indentStack.length - 1];
      if (indent > top) {
        indentStack.push(indent);
        tokens.push(tok('INDENT', ''));
      } else {
        while (indentStack[indentStack.length - 1] > indent) {
          indentStack.pop();
          tokens.push(tok('DEDENT', ''));
        }
      }
      atBol = false;
    }

    const ch = code[pos];

    // ── whitespace (non-BOL) ──
    if (ch === ' ' || ch === '\t') { pos++; col++; continue; }

    // ── newline ──
    if (ch === '\n' || ch === '\r') {
      if (bracketDepth === 0) { tokens.push(tok('NEWLINE', '')); atBol = true; }
      if (ch === '\r' && pos + 1 < len && code[pos + 1] === '\n') pos++;
      pos++; line++; col = 0;
      continue;
    }

    // ── line continuation ──
    if (ch === '\\' && pos + 1 < len && (code[pos + 1] === '\n' || code[pos + 1] === '\r')) {
      pos++;
      if (code[pos] === '\r' && pos + 1 < len && code[pos + 1] === '\n') pos++;
      pos++; line++; col = 0;
      continue;
    }

    // ── comment ──
    if (ch === '#') { while (pos < len && code[pos] !== '\n' && code[pos] !== '\r') { pos++; col++; } continue; }

    // ── strings ──
    let prefix = '';
    if (/[fFrRbBuU]/.test(ch)) {
      let j = pos;
      while (j < len && /[fFrRbBuU]/.test(code[j])) j++;
      if (j < len && (code[j] === '"' || code[j] === "'")) {
        prefix = code.slice(pos, j);
        pos = j; col += prefix.length;
      }
    }
    if ((prefix || ch === '"' || ch === "'") && pos < len && (code[pos] === '"' || code[pos] === "'")) {
      const isRaw = /[rR]/.test(prefix);
      const isFstring = /[fF]/.test(prefix);
      const qch = code[pos];
      let triple = false;
      if (pos + 2 < len && code[pos + 1] === qch && code[pos + 2] === qch) {
        triple = true; pos += 3; col += 3;
      } else {
        pos++; col++;
      }

      if (isFstring) {
        // f-string: extract parts
        const parts = [];
        let textBuf = '';
        const endQuote = triple ? qch + qch + qch : qch;
        while (pos < len) {
          if (triple ? (code[pos] === qch && code[pos + 1] === qch && code[pos + 2] === qch) : code[pos] === qch) {
            pos += triple ? 3 : 1; col += triple ? 3 : 1;
            break;
          }
          if (code[pos] === '\n') { if (!triple) break; textBuf += '\n'; pos++; line++; col = 0; continue; }
          if (code[pos] === '{') {
            if (code[pos + 1] === '{') { textBuf += '{'; pos += 2; col += 2; continue; }
            if (textBuf) { parts.push(textBuf); textBuf = ''; }
            pos++; col++; // skip {
            let depth = 1, expr = '', spec = null, conv = null;
            while (pos < len && depth > 0) {
              if (code[pos] === '{') { depth++; expr += code[pos]; }
              else if (code[pos] === '}') { depth--; if (depth > 0) expr += code[pos]; }
              else if (code[pos] === '!' && depth === 1 && 'sra'.includes(code[pos + 1]) && (code[pos + 2] === ':' || code[pos + 2] === '}')) {
                conv = code[pos + 1]; pos += 2; col += 2; continue;
              }
              else if (code[pos] === ':' && depth === 1 && spec === null) {
                spec = ''; pos++; col++;
                while (pos < len && !(code[pos] === '}' && depth === 1)) {
                  if (code[pos] === '{') depth++;
                  if (code[pos] === '}') { depth--; if (depth === 0) break; }
                  spec += code[pos]; pos++; col++;
                }
                continue;
              }
              else { expr += code[pos]; }
              pos++; col++;
            }
            if (code[pos - 1] !== '}' && depth === 0) { /* closing } already consumed */ }
            parts.push({ expr: expr.trim(), spec, conv });
            continue;
          }
          if (code[pos] === '}') {
            if (code[pos + 1] === '}') { textBuf += '}'; pos += 2; col += 2; continue; }
          }
          if (code[pos] === '\\' && !isRaw) {
            textBuf += code[pos] + (code[pos + 1] || '');
            pos += 2; col += 2;
          } else {
            textBuf += code[pos]; pos++; col++;
          }
        }
        if (textBuf) parts.push(textBuf);
        // process escape sequences in text parts
        const processedParts = parts.map(p => typeof p === 'string' ? (isRaw ? p : _processEscapes(p)) : p);
        tokens.push(tok('FSTRING', processedParts));
      } else {
        // regular string
        let raw = '';
        while (pos < len) {
          if (triple ? (code[pos] === qch && code[pos + 1] === qch && code[pos + 2] === qch) : code[pos] === qch) {
            pos += triple ? 3 : 1; col += triple ? 3 : 1;
            break;
          }
          if (code[pos] === '\n') { if (!triple) break; raw += '\n'; pos++; line++; col = 0; continue; }
          if (code[pos] === '\\' && !isRaw) {
            raw += code[pos] + (code[pos + 1] || '');
            pos += 2; col += 2;
          } else {
            raw += code[pos]; pos++; col++;
          }
        }
        tokens.push(tok('STRING', isRaw ? raw : _processEscapes(raw)));
      }
      continue;
    }
    // if prefix consumed but no quote follows, reset — it's an identifier
    if (prefix) { pos -= prefix.length; col -= prefix.length; prefix = ''; }

    // ── numbers ──
    if ((ch >= '0' && ch <= '9') || (ch === '.' && pos + 1 < len && code[pos + 1] >= '0' && code[pos + 1] <= '9')) {
      const start = pos;
      if (ch === '0' && pos + 1 < len) {
        const nx = code[pos + 1];
        if (nx === 'x' || nx === 'X') { pos += 2; while (pos < len && (/[0-9a-fA-F_]/.test(code[pos]))) pos++; }
        else if (nx === 'o' || nx === 'O') { pos += 2; while (pos < len && (/[0-7_]/.test(code[pos]))) pos++; }
        else if (nx === 'b' || nx === 'B') { pos += 2; while (pos < len && (code[pos] === '0' || code[pos] === '1' || code[pos] === '_')) pos++; }
        else { while (pos < len && /[0-9_]/.test(code[pos])) pos++; }
      } else {
        while (pos < len && /[0-9_]/.test(code[pos])) pos++;
      }
      let isFloat = false;
      if (pos < len && code[pos] === '.' && !(code[pos + 1] === '.' && code[pos + 2] === '.')) {
        isFloat = true; pos++;
        while (pos < len && /[0-9_]/.test(code[pos])) pos++;
      }
      if (pos < len && (code[pos] === 'e' || code[pos] === 'E')) {
        isFloat = true; pos++;
        if (pos < len && (code[pos] === '+' || code[pos] === '-')) pos++;
        while (pos < len && /[0-9_]/.test(code[pos])) pos++;
      }
      let isComplex = false;
      if (pos < len && (code[pos] === 'j' || code[pos] === 'J')) { pos++; isComplex = true; }
      const raw = code.slice(start, pos).replace(/_/g, '').replace(/[jJ]$/, '');
      if (isComplex) {
        const coeff = parseFloat(raw) || 0;
        col += pos - start;
        tokens.push(tok('NUMBER', { _complex: true, imag: coeff }));
      } else {
        const value = isFloat ? parseFloat(raw)
          : (raw.startsWith('0x') || raw.startsWith('0X')) ? parseInt(raw.slice(2), 16)
          : (raw.startsWith('0o') || raw.startsWith('0O')) ? parseInt(raw.slice(2), 8)
          : (raw.startsWith('0b') || raw.startsWith('0B')) ? parseInt(raw.slice(2), 2)
          : parseInt(raw, 10);
        col += pos - start;
        tokens.push(tok('NUMBER', value));
      }
      continue;
    }

    // ── identifiers ──
    if (/[a-zA-Z_]/.test(ch)) {
      const start = pos;
      while (pos < len && /[a-zA-Z0-9_]/.test(code[pos])) pos++;
      col += pos - start;
      tokens.push(tok('NAME', code.slice(start, pos)));
      continue;
    }

    // ── operators / punctuation ──
    // ellipsis
    if (ch === '.' && pos + 2 < len && code[pos + 1] === '.' && code[pos + 2] === '.') {
      tokens.push(tok('OP', '...')); pos += 3; col += 3; continue;
    }
    // 3-char ops
    if (pos + 2 < len) {
      const t3 = code.slice(pos, pos + 3);
      if (_THREE_OP.has(t3)) { tokens.push(tok('OP', t3)); pos += 3; col += 3; continue; }
    }
    // 2-char ops
    if (pos + 1 < len) {
      const t2 = code.slice(pos, pos + 2);
      if (_TWO_OP.has(t2)) { tokens.push(tok('OP', t2)); pos += 2; col += 2; continue; }
    }
    // brackets — track depth
    if (ch === '(' || ch === '[' || ch === '{') bracketDepth++;
    if (ch === ')' || ch === ']' || ch === '}') bracketDepth = Math.max(0, bracketDepth - 1);
    tokens.push(tok('OP', ch)); pos++; col++;
  }

  // ── end of file ──
  if (tokens.length && tokens[tokens.length - 1].type !== 'NEWLINE') {
    tokens.push(tok('NEWLINE', ''));
  }
  while (indentStack.length > 1) { indentStack.pop(); tokens.push(tok('DEDENT', '')); }
  tokens.push(tok('EOF', ''));
  return tokens;
}

// ── parser ──

function adderParse(code) {
  return new _Parser(adderTokenize(code)).parseModule();
}

function _adderParseExpr(code) {
  return new _Parser(adderTokenize(code + '\n')).parseExpr();
}

const _AUGASSIGN = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '@=']);

class _Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  peek() { return this.tokens[this.pos] || { type: 'EOF', value: '', line: 0, col: 0 }; }
  advance() { return this.tokens[this.pos++]; }
  at(type, value) { const t = this.peek(); return t.type === type && (value === undefined || t.value === value); }
  eat(type, value) { return this.at(type, value) ? this.advance() : null; }
  expect(type, value) {
    const t = this.eat(type, value);
    if (!t) { const p = this.peek(); throw new SyntaxError(`Expected ${value || type}, got '${p.value}' [${p.type}] (line ${p.line})`); }
    return t;
  }

  // ── module / block / statement list ──

  parseModule() {
    const body = [];
    while (!this.at('EOF')) {
      if (this.eat('NEWLINE')) continue;
      body.push(...this.parseStmt());
    }
    return { type: 'Module', body };
  }

  parseBlock() {
    if (this.at('NEWLINE')) {
      this.advance();
      this.expect('INDENT');
      const stmts = [];
      while (!this.at('DEDENT') && !this.at('EOF')) {
        if (this.eat('NEWLINE')) continue;
        stmts.push(...this.parseStmt());
      }
      this.eat('DEDENT');
      return stmts;
    }
    return this.parseSimpleList();
  }

  parseStmt() {
    const t = this.peek();
    // decorators
    if (t.type === 'OP' && t.value === '@') {
      const decorators = [];
      while (this.at('OP', '@')) {
        this.advance();
        decorators.push(this.parseExpr());
        this.expect('NEWLINE');
      }
      if (this.at('NAME', 'def') || this.at('NAME', 'async')) {
        const s = this.at('NAME', 'async') ? (this.advance(), this.parseDef(true, decorators)) : this.parseDef(false, decorators);
        return [s];
      }
      if (this.at('NAME', 'class')) return [this.parseClass(decorators)];
      throw new SyntaxError(`Expected def or class after decorator (line ${this.peek().line})`);
    }
    // async
    if (t.type === 'NAME' && t.value === 'async') {
      this.advance();
      if (this.at('NAME', 'def')) return [this.parseDef(true)];
      if (this.at('NAME', 'for')) return [this.parseFor(true)];
      if (this.at('NAME', 'with')) return [this.parseWith(true)];
      throw new SyntaxError(`Expected def, for, or with after async (line ${t.line})`);
    }
    // compound statements
    if (t.type === 'NAME') {
      if (t.value === 'if') return [this.parseIf()];
      if (t.value === 'for') return [this.parseFor()];
      if (t.value === 'while') return [this.parseWhile()];
      if (t.value === 'def') return [this.parseDef()];
      if (t.value === 'class') return [this.parseClass()];
      if (t.value === 'try') return [this.parseTry()];
      if (t.value === 'with') return [this.parseWith()];
    }
    return this.parseSimpleList();
  }

  parseSimpleList() {
    const stmts = [this.parseSimple()];
    while (this.eat('OP', ';')) {
      if (this.at('NEWLINE') || this.at('EOF')) break;
      stmts.push(this.parseSimple());
    }
    this.eat('NEWLINE');
    return stmts;
  }

  parseSimple() {
    const t = this.peek();
    if (t.type === 'NAME') {
      switch (t.value) {
        case 'return': return this.parseReturn();
        case 'raise': return this.parseRaise();
        case 'assert': return this.parseAssert();
        case 'import': return this.parseImport();
        case 'from': return this.parseFromImport();
        case 'global': return this.parseGlobalNonlocal('Global');
        case 'nonlocal': return this.parseGlobalNonlocal('Nonlocal');
        case 'del': return this.parseDel();
        case 'pass': this.advance(); return { type: 'Pass', line: t.line, col: t.col };
        case 'break': this.advance(); return { type: 'Break', line: t.line, col: t.col };
        case 'continue': this.advance(); return { type: 'Continue', line: t.line, col: t.col };
        case 'yield': return this.parseYield();
      }
    }
    return this.parseAssignOrExpr();
  }

  // ── simple statements ──

  parseReturn() {
    const t = this.advance();
    let value = null;
    if (!this.at('NEWLINE') && !this.at('OP', ';') && !this.at('EOF')) value = this.parseExprOrStars();
    return { type: 'Return', value, line: t.line, col: t.col };
  }

  parseYield() {
    const t = this.advance(); // 'yield'
    if (this.eat('NAME', 'from')) {
      return { type: 'Expr', value: { type: 'YieldFrom', value: this.parseExpr(), line: t.line, col: t.col }, line: t.line, col: t.col };
    }
    let value = null;
    if (!this.at('NEWLINE') && !this.at('OP', ';') && !this.at('EOF') && !this.at('OP', ')') && !this.at('OP', ']')) {
      value = this.parseExprOrStars();
    }
    return { type: 'Expr', value: { type: 'Yield', value, line: t.line, col: t.col }, line: t.line, col: t.col };
  }

  parseRaise() {
    const t = this.advance();
    let exc = null;
    if (!this.at('NEWLINE') && !this.at('OP', ';') && !this.at('EOF')) exc = this.parseExpr();
    return { type: 'Raise', exc, line: t.line, col: t.col };
  }

  parseAssert() {
    const t = this.advance();
    const test = this.parseExpr();
    let msg = null;
    if (this.eat('OP', ',')) msg = this.parseExpr();
    return { type: 'Assert', test, msg, line: t.line, col: t.col };
  }

  parseImport() {
    const t = this.advance();
    const names = [];
    do {
      // String-literal import: `import "./utils.py" as u`. Alias required — can't
      // derive an identifier from an arbitrary path.
      if (this.at('STRING')) {
        const path = this.advance().value;
        if (!this.eat('NAME', 'as')) {
          throw new Error(`path imports require 'as <alias>' at line ${t.line} (cannot derive a name from "${path}")`);
        }
        const alias = this.expect('NAME').value;
        names.push({ path, alias });
      } else {
        let module = this.expect('NAME').value;
        while (this.eat('OP', '.')) module += '.' + this.expect('NAME').value;
        const alias = this.eat('NAME', 'as') ? this.expect('NAME').value : null;
        names.push({ module, alias });
      }
    } while (this.eat('OP', ','));
    return { type: 'Import', names, line: t.line, col: t.col };
  }

  parseFromImport() {
    const t = this.advance(); // 'from'
    // String-literal from-import: `from "./utils.py" import foo, bar`
    if (this.at('STRING')) {
      const path = this.advance().value;
      this.expect('NAME', 'import');
      if (this.eat('OP', '*')) return { type: 'ImportFrom', path, names: [{ name: '*', alias: null }], line: t.line, col: t.col };
      const names = [];
      const paren = this.eat('OP', '(');
      do {
        const name = this.expect('NAME').value;
        const alias = this.eat('NAME', 'as') ? this.expect('NAME').value : null;
        names.push({ name, alias });
      } while (this.eat('OP', ','));
      if (paren) this.expect('OP', ')');
      return { type: 'ImportFrom', path, names, line: t.line, col: t.col };
    }
    let module = '';
    while (this.at('OP', '.') || this.at('OP', '...')) {
      module += this.advance().value;
    }
    if (this.at('NAME') && this.peek().value !== 'import') {
      module += this.advance().value;
      while (this.eat('OP', '.')) module += '.' + this.expect('NAME').value;
    }
    this.expect('NAME', 'import');
    if (this.eat('OP', '*')) return { type: 'ImportFrom', module, names: [{ name: '*', alias: null }], line: t.line, col: t.col };
    const names = [];
    const paren = this.eat('OP', '(');
    do {
      const name = this.expect('NAME').value;
      const alias = this.eat('NAME', 'as') ? this.expect('NAME').value : null;
      names.push({ name, alias });
    } while (this.eat('OP', ','));
    if (paren) this.expect('OP', ')');
    return { type: 'ImportFrom', module, names, line: t.line, col: t.col };
  }

  parseGlobalNonlocal(nodeType) {
    const t = this.advance();
    const names = [this.expect('NAME').value];
    while (this.eat('OP', ',')) names.push(this.expect('NAME').value);
    return { type: nodeType, names, line: t.line, col: t.col };
  }

  parseDel() {
    const t = this.advance();
    const targets = [this.parseExpr()];
    while (this.eat('OP', ',')) targets.push(this.parseExpr());
    return { type: 'Delete', targets, line: t.line, col: t.col };
  }

  parseAssignOrExpr() {
    const expr = this.parseExprOrStars();
    // augmented assignment
    if (this.at('OP') && _AUGASSIGN.has(this.peek().value)) {
      const op = this.advance().value.slice(0, -1);
      return { type: 'AugAssign', target: this._asTarget(expr), op, value: this.parseExprOrStars(), line: expr.line, col: expr.col };
    }
    // annotation
    if (this.eat('OP', ':')) {
      const annotation = this.parseExpr();
      const value = this.eat('OP', '=') ? this.parseExprOrStars() : null;
      return { type: 'AnnAssign', target: this._asTarget(expr), annotation, value, line: expr.line, col: expr.col };
    }
    // assignment (possibly chained: a = b = val)
    if (this.eat('OP', '=')) {
      const targets = [this._asTarget(expr)];
      let value = this.parseExprOrStars();
      while (this.eat('OP', '=')) {
        targets.push(this._asTarget(value));
        value = this.parseExprOrStars();
      }
      return { type: 'Assign', targets, value, line: expr.line, col: expr.col };
    }
    return { type: 'Expr', value: expr, line: expr.line, col: expr.col };
  }

  _parseForTarget() {
    // parse target for 'for' statement — stops before 'in'
    const first = this._parseTargetAtom();
    if (!this.at('OP', ',')) return first;
    const elts = [first];
    while (this.eat('OP', ',')) {
      if (this.at('NAME', 'in')) break;
      elts.push(this._parseTargetAtom());
    }
    return { type: 'Tuple', elts, line: first.line, col: first.col };
  }

  _parseTargetAtom() {
    if (this.at('OP', '*')) {
      const t = this.advance();
      return { type: 'Starred', value: this._parseTargetAtom(), line: t.line, col: t.col };
    }
    let expr = this.parseAtom();
    // allow postfix: .attr, [sub]
    while (true) {
      if (this.eat('OP', '.')) { expr = { type: 'Attribute', value: expr, attr: this.expect('NAME').value, line: expr.line, col: expr.col }; }
      else if (this.eat('OP', '[')) { const s = this._parseSlice(); this.expect('OP', ']'); expr = { type: 'Subscript', value: expr, slice: s, line: expr.line, col: expr.col }; }
      else break;
    }
    return expr;
  }

  _asTarget(node) {
    switch (node.type) {
      case 'Name': case 'Subscript': case 'Attribute': case 'Starred': return node;
      case 'Tuple': case 'List': return { ...node, elts: node.elts.map(e => this._asTarget(e)) };
      default: throw new SyntaxError(`Invalid assignment target: ${node.type} (line ${node.line})`);
    }
  }

  // ── compound statements ──

  parseIf() {
    const t = this.advance(); // 'if' or 'elif'
    const test = this.parseExpr();
    this.expect('OP', ':');
    const body = this.parseBlock();
    let orelse = [];
    if (this.at('NAME', 'elif')) orelse = [this.parseIf()];
    else if (this.eat('NAME', 'else')) { this.expect('OP', ':'); orelse = this.parseBlock(); }
    return { type: 'If', test, body, orelse, line: t.line, col: t.col };
  }

  parseFor(isAsync = false) {
    const t = this.advance(); // 'for'
    const target = this._asTarget(this._parseForTarget());
    this.expect('NAME', 'in');
    const iter = this.parseExprOrStars();
    this.expect('OP', ':');
    const body = this.parseBlock();
    let orelse = [];
    if (this.eat('NAME', 'else')) { this.expect('OP', ':'); orelse = this.parseBlock(); }
    return { type: 'For', target, iter, body, orelse, isAsync, line: t.line, col: t.col };
  }

  parseWhile() {
    const t = this.advance();
    const test = this.parseExpr();
    this.expect('OP', ':');
    const body = this.parseBlock();
    let orelse = [];
    if (this.eat('NAME', 'else')) { this.expect('OP', ':'); orelse = this.parseBlock(); }
    return { type: 'While', test, body, orelse, line: t.line, col: t.col };
  }

  parseDef(isAsync = false, decorators = []) {
    const t = this.advance(); // 'def'
    const name = this.expect('NAME').value;
    this.expect('OP', '(');
    const params = this._parseFuncParams();
    this.expect('OP', ')');
    let returns = null;
    if (this.eat('OP', '->')) returns = this.parseExpr();
    this.expect('OP', ':');
    const body = this.parseBlock();
    return { type: isAsync ? 'AsyncFunctionDef' : 'FunctionDef', name, ...params, body, decorators, returns, line: t.line, col: t.col };
  }

  _parseFuncParams() {
    const params = [], kwonly = [];
    let vararg = null, kwarg = null, seenStar = false;
    while (!this.at('OP', ')')) {
      if (this.eat('OP', '**')) { kwarg = this.expect('NAME').value; break; }
      if (this.eat('OP', '*')) {
        seenStar = true;
        if (this.at('NAME')) vararg = this.advance().value;
        this.eat('OP', ',');
        continue;
      }
      const pName = this.expect('NAME').value;
      let annotation = null;
      if (this.eat('OP', ':')) annotation = this.parseExpr();
      let def = null;
      if (this.eat('OP', '=')) def = this.parseExpr();
      (seenStar ? kwonly : params).push({ name: pName, default: def, annotation });
      if (!this.eat('OP', ',')) break;
    }
    return { params, vararg, kwonly, kwarg };
  }

  parseClass(decorators = []) {
    const t = this.advance(); // 'class'
    const name = this.expect('NAME').value;
    let bases = [];
    if (this.eat('OP', '(')) {
      while (!this.at('OP', ')')) {
        bases.push(this.parseExpr());
        this.eat('OP', ',');
      }
      this.expect('OP', ')');
    }
    this.expect('OP', ':');
    const body = this.parseBlock();
    return { type: 'ClassDef', name, bases, body, decorators, line: t.line, col: t.col };
  }

  parseTry() {
    const t = this.advance();
    this.expect('OP', ':');
    const body = this.parseBlock();
    const handlers = [];
    while (this.at('NAME', 'except')) {
      this.advance();
      let excType = null, excName = null;
      if (!this.at('OP', ':')) {
        excType = this.parseExpr();
        if (this.eat('NAME', 'as')) excName = this.expect('NAME').value;
      }
      this.expect('OP', ':');
      handlers.push({ type: 'ExceptHandler', excType, name: excName, body: this.parseBlock(), line: t.line });
    }
    let orelse = [];
    if (this.eat('NAME', 'else')) { this.expect('OP', ':'); orelse = this.parseBlock(); }
    let finalbody = [];
    if (this.eat('NAME', 'finally')) { this.expect('OP', ':'); finalbody = this.parseBlock(); }
    return { type: 'Try', body, handlers, orelse, finalbody, line: t.line, col: t.col };
  }

  parseWith(isAsync = false) {
    const t = this.advance();
    const items = [];
    do {
      const contextExpr = this.parseExpr();
      const optionalVar = this.eat('NAME', 'as') ? this._asTarget(this.parseExpr()) : null;
      items.push({ contextExpr, optionalVar });
    } while (this.eat('OP', ','));
    this.expect('OP', ':');
    return { type: 'With', items, body: this.parseBlock(), isAsync, line: t.line, col: t.col };
  }

  // ── expressions ──

  parseExprOrStars() {
    const first = this.parseStarExpr();
    if (!this.at('OP', ',') || this.at('OP', ')') || this.at('OP', ']') || this.at('OP', '}')) return first;
    // check if comma is part of tuple (not a function call separator)
    // in contexts like assignment RHS, commas make tuples
    const elts = [first];
    while (this.eat('OP', ',')) {
      if (this.at('NEWLINE') || this.at('EOF') || this.at('OP', ')') || this.at('OP', ']') ||
          this.at('OP', '}') || this.at('OP', ';') || this.at('OP', '=') || this.at('OP', ':')) break;
      elts.push(this.parseStarExpr());
    }
    if (elts.length === 1) return first;
    return { type: 'Tuple', elts, line: first.line, col: first.col };
  }

  parseStarExpr() {
    if (this.at('OP', '*') && !this._isBinContext()) {
      const t = this.advance();
      return { type: 'Starred', value: this.parseExpr(), line: t.line, col: t.col };
    }
    return this.parseExpr();
  }

  _isBinContext() {
    // star is binary if preceded by a value token
    if (this.pos === 0) return false;
    const prev = this.tokens[this.pos - 1];
    return prev && (prev.type === 'NAME' || prev.type === 'NUMBER' || prev.type === 'STRING' ||
      prev.value === ')' || prev.value === ']' || prev.value === '}');
  }

  parseExpr() {
    if (this.at('NAME', 'lambda')) return this.parseLambda();
    // walrus operator: name := expr
    if (this.peek().type === 'NAME' && this.tokens[this.pos + 1]?.type === 'OP' && this.tokens[this.pos + 1]?.value === ':=') {
      const name = this.advance();
      this.advance(); // :=
      return { type: 'NamedExpr', target: { type: 'Name', id: name.value, line: name.line, col: name.col }, value: this.parseExpr(), line: name.line, col: name.col };
    }
    return this.parseTernary();
  }

  parseTernary() {
    const expr = this.parseOr();
    if (this.eat('NAME', 'if')) {
      const test = this.parseOr();
      this.expect('NAME', 'else');
      const orelse = this.parseExpr();
      return { type: 'IfExp', test, body: expr, orelse, line: expr.line, col: expr.col };
    }
    return expr;
  }

  parseOr() {
    let first = this.parseAnd();
    if (!this.at('NAME', 'or')) return first;
    const values = [first];
    while (this.eat('NAME', 'or')) values.push(this.parseAnd());
    return { type: 'BoolOp', op: 'or', values, line: first.line, col: first.col };
  }

  parseAnd() {
    let first = this.parseNot();
    if (!this.at('NAME', 'and')) return first;
    const values = [first];
    while (this.eat('NAME', 'and')) values.push(this.parseNot());
    return { type: 'BoolOp', op: 'and', values, line: first.line, col: first.col };
  }

  parseNot() {
    if (this.at('NAME', 'not') && !(this.tokens[this.pos + 1]?.value === 'in')) {
      const t = this.advance();
      return { type: 'UnaryOp', op: 'not', operand: this.parseNot(), line: t.line, col: t.col };
    }
    return this.parseCompare();
  }

  parseCompare() {
    let left = this.parseBitOr();
    const ops = [], comparators = [];
    while (this._isCompOp()) {
      ops.push(this._readCompOp());
      comparators.push(this.parseBitOr());
    }
    if (!ops.length) return left;
    return { type: 'Compare', left, ops, comparators, line: left.line, col: left.col };
  }

  _isCompOp() {
    const v = this.peek().value;
    if (['<', '>', '<=', '>=', '==', '!='].includes(v)) return true;
    if (v === 'in' || v === 'is') return true;
    if (v === 'not' && this.tokens[this.pos + 1]?.value === 'in') return true;
    return false;
  }

  _readCompOp() {
    if (this.at('NAME', 'not')) { this.advance(); this.expect('NAME', 'in'); return 'not in'; }
    if (this.at('NAME', 'is')) { this.advance(); if (this.eat('NAME', 'not')) return 'is not'; return 'is'; }
    if (this.at('NAME', 'in')) { this.advance(); return 'in'; }
    return this.advance().value;
  }

  _binLeft(sub, ...ops) {
    let left = sub.call(this);
    while (this.at('OP') && ops.includes(this.peek().value)) {
      const op = this.advance().value;
      left = { type: 'BinOp', left, op, right: sub.call(this), line: left.line, col: left.col };
    }
    return left;
  }

  parseBitOr() { return this._binLeft(this.parseBitXor, '|'); }
  parseBitXor() { return this._binLeft(this.parseBitAnd, '^'); }
  parseBitAnd() { return this._binLeft(this.parseShift, '&'); }
  parseShift() { return this._binLeft(this.parseArith, '<<', '>>'); }
  parseArith() { return this._binLeft(this.parseTerm, '+', '-'); }
  parseTerm() { return this._binLeft(this.parseUnary, '*', '/', '//', '%', '@'); }

  parseUnary() {
    if (this.at('OP', '-') || this.at('OP', '+') || this.at('OP', '~')) {
      const t = this.advance();
      return { type: 'UnaryOp', op: t.value, operand: this.parseUnary(), line: t.line, col: t.col };
    }
    return this.parsePower();
  }

  parsePower() {
    const left = this.parseAwait();
    if (this.eat('OP', '**')) {
      return { type: 'BinOp', left, op: '**', right: this.parseUnary(), line: left.line, col: left.col };
    }
    return left;
  }

  parseAwait() {
    if (this.at('NAME', 'await')) {
      const t = this.advance();
      return { type: 'Await', value: this.parseUnary(), line: t.line, col: t.col };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parseAtom();
    while (true) {
      if (this.eat('OP', '.')) {
        const attr = this.expect('NAME').value;
        expr = { type: 'Attribute', value: expr, attr, line: expr.line, col: expr.col };
      } else if (this.eat('OP', '(')) {
        const { args, keywords } = this._parseCallArgs();
        this.expect('OP', ')');
        expr = { type: 'Call', func: expr, args, keywords, line: expr.line, col: expr.col };
      } else if (this.eat('OP', '[')) {
        const slice = this._parseSlice();
        this.expect('OP', ']');
        expr = { type: 'Subscript', value: expr, slice, line: expr.line, col: expr.col };
      } else break;
    }
    return expr;
  }

  _parseCallArgs() {
    const args = [], keywords = [];
    while (!this.at('OP', ')')) {
      if (this.at('OP', '**')) {
        this.advance();
        keywords.push({ name: null, value: this.parseExpr() });
      } else if (this.at('OP', '*')) {
        this.advance();
        args.push({ type: 'Starred', value: this.parseExpr(), line: this.peek().line, col: this.peek().col });
      } else if (this.peek().type === 'NAME' && this.tokens[this.pos + 1]?.value === '=' && this.tokens[this.pos + 1]?.type === 'OP') {
        // keyword argument — but check it's not ==
        if (this.tokens[this.pos + 1]?.value === '=' && this.tokens[this.pos + 2]?.value !== '=') {
          const name = this.advance().value;
          this.advance(); // =
          keywords.push({ name, value: this.parseExpr() });
        } else {
          args.push(this.parseExpr());
        }
      } else {
        const expr = this.parseExpr();
        // generator expression: sum(x for x in items)
        if (this.at('NAME', 'for')) {
          const generators = this._parseCompIter();
          args.push({ type: 'GeneratorExp', elt: expr, generators, line: expr.line, col: expr.col });
        } else {
          args.push(expr);
        }
      }
      this.eat('OP', ',');
    }
    return { args, keywords };
  }

  _parseSlice() {
    // Parse the first slice or expression. If a comma follows, parse
    // additional items and wrap the whole thing in a Tuple — numpy /
    // pandas style `arr[i, j]`, `df.iloc[0:5, :]` semantics. Python
    // sugar for `arr[(i, j)]` — the runtime forwards the tuple to
    // __getitem__/__setitem__ which the target object (DataFrame, nd-
    // array, etc.) interprets as multi-dim access.
    const first = this._parseSliceItem();
    if (!this.at('OP', ',')) return first;
    const elts = [first];
    while (this.eat('OP', ',')) {
      // Trailing comma allowed (`arr[i,]`) — just stop before the `]`.
      if (this.at('OP', ']')) break;
      elts.push(this._parseSliceItem());
    }
    return { type: 'Tuple', elts, line: first?.line || 0, col: 0 };
  }

  _parseSliceItem() {
    let lower = null;
    if (!this.at('OP', ':') && !this.at('OP', ']') && !this.at('OP', ',')) lower = this.parseExpr();
    if (this.eat('OP', ':')) {
      let upper = null, step = null;
      if (!this.at('OP', ':') && !this.at('OP', ']') && !this.at('OP', ',')) upper = this.parseExpr();
      if (this.eat('OP', ':')) {
        if (!this.at('OP', ']') && !this.at('OP', ',')) step = this.parseExpr();
      }
      return { type: 'Slice', lower, upper, step, line: (lower || this.peek()).line, col: 0 };
    }
    return lower;
  }

  parseAtom() {
    const t = this.peek();

    // keywords
    if (t.type === 'NAME') {
      if (t.value === 'True') { this.advance(); return { type: 'Constant', value: true, line: t.line, col: t.col }; }
      if (t.value === 'False') { this.advance(); return { type: 'Constant', value: false, line: t.line, col: t.col }; }
      if (t.value === 'None') { this.advance(); return { type: 'Constant', value: null, line: t.line, col: t.col }; }
      if (t.value === 'not') {
        // `not` as a unary — but we shouldn't get here normally (parseNot handles it)
        // handle it as a fallback
        this.advance();
        return { type: 'UnaryOp', op: 'not', operand: this.parseNot(), line: t.line, col: t.col };
      }
      this.advance();
      return { type: 'Name', id: t.value, line: t.line, col: t.col };
    }

    // number
    if (t.type === 'NUMBER') { this.advance(); return { type: 'Constant', value: t.value, line: t.line, col: t.col }; }

    // string (with concatenation of adjacent strings)
    if (t.type === 'STRING') {
      this.advance();
      let value = t.value;
      while (this.peek().type === 'STRING') value += this.advance().value;
      return { type: 'Constant', value, line: t.line, col: t.col };
    }

    // f-string
    if (t.type === 'FSTRING') { this.advance(); return this._parseFstring(t); }

    // ellipsis
    if (t.type === 'OP' && t.value === '...') { this.advance(); return { type: 'Constant', value: null, line: t.line, col: t.col }; }

    // parenthesized / tuple / generator
    if (t.type === 'OP' && t.value === '(') {
      this.advance();
      if (this.eat('OP', ')')) return { type: 'Tuple', elts: [], line: t.line, col: t.col };
      const first = this.parseStarExpr();
      if (this.at('NAME', 'for')) {
        const generators = this._parseCompIter();
        this.expect('OP', ')');
        return { type: 'GeneratorExp', elt: first, generators, line: t.line, col: t.col };
      }
      if (this.eat('OP', ',')) {
        const elts = [first];
        while (!this.at('OP', ')')) {
          elts.push(this.parseStarExpr());
          if (!this.eat('OP', ',')) break;
        }
        this.expect('OP', ')');
        return { type: 'Tuple', elts, line: t.line, col: t.col };
      }
      this.expect('OP', ')');
      return first;
    }

    // list / list comprehension
    if (t.type === 'OP' && t.value === '[') {
      this.advance();
      if (this.eat('OP', ']')) return { type: 'List', elts: [], line: t.line, col: t.col };
      const first = this.parseStarExpr();
      if (this.at('NAME', 'for')) {
        const generators = this._parseCompIter();
        this.expect('OP', ']');
        return { type: 'ListComp', elt: first, generators, line: t.line, col: t.col };
      }
      const elts = [first];
      while (this.eat('OP', ',')) {
        if (this.at('OP', ']')) break;
        elts.push(this.parseStarExpr());
      }
      this.expect('OP', ']');
      return { type: 'List', elts, line: t.line, col: t.col };
    }

    // dict / set / comprehension
    if (t.type === 'OP' && t.value === '{') {
      this.advance();
      if (this.eat('OP', '}')) return { type: 'Dict', keys: [], values: [], line: t.line, col: t.col };
      // dict unpacking
      if (this.at('OP', '**')) {
        return this._parseDictBody(t, [], []);
      }
      const first = this.parseExpr();
      if (this.eat('OP', ':')) {
        // dict
        const firstVal = this.parseExpr();
        if (this.at('NAME', 'for')) {
          const generators = this._parseCompIter();
          this.expect('OP', '}');
          return { type: 'DictComp', key: first, value: firstVal, generators, line: t.line, col: t.col };
        }
        return this._parseDictBody(t, [first], [firstVal]);
      }
      // set
      if (this.at('NAME', 'for')) {
        const generators = this._parseCompIter();
        this.expect('OP', '}');
        return { type: 'SetComp', elt: first, generators, line: t.line, col: t.col };
      }
      const elts = [first];
      while (this.eat('OP', ',')) {
        if (this.at('OP', '}')) break;
        elts.push(this.parseExpr());
      }
      this.expect('OP', '}');
      return { type: 'Set', elts, line: t.line, col: t.col };
    }

    throw new SyntaxError(`Unexpected token: ${t.type} '${t.value}' (line ${t.line})`);
  }

  _parseDictBody(startTok, keys, values) {
    while (this.eat('OP', ',')) {
      if (this.at('OP', '}')) break;
      if (this.eat('OP', '**')) {
        keys.push(null);
        values.push(this.parseExpr());
      } else {
        keys.push(this.parseExpr());
        this.expect('OP', ':');
        values.push(this.parseExpr());
      }
    }
    this.expect('OP', '}');
    return { type: 'Dict', keys, values, line: startTok.line, col: startTok.col };
  }

  _parseCompIter() {
    const generators = [];
    while (this.at('NAME', 'for') || this.at('NAME', 'async')) {
      const isAsync = !!this.eat('NAME', 'async');
      this.expect('NAME', 'for');
      const target = this._asTarget(this._parseForTarget());
      this.expect('NAME', 'in');
      const iter = this.parseOr();
      const ifs = [];
      while (this.at('NAME', 'if')) { this.advance(); ifs.push(this.parseOr()); }
      generators.push({ target, iter, ifs, isAsync });
    }
    return generators;
  }

  _parseFstring(tok) {
    const values = [];
    for (const part of tok.value) {
      if (typeof part === 'string') {
        if (part) values.push({ type: 'Constant', value: part, line: tok.line, col: tok.col });
      } else {
        const exprNode = _adderParseExpr(part.expr);
        values.push({
          type: 'FormattedValue', value: exprNode,
          conversion: part.conv || null,
          formatSpec: part.spec || null,
          line: tok.line, col: tok.col,
        });
      }
    }
    return { type: 'JoinedStr', values, line: tok.line, col: tok.col };
  }

  parseLambda() {
    const t = this.advance(); // 'lambda'
    const params = [];
    let vararg = null, kwarg = null;
    while (!this.at('OP', ':')) {
      if (this.eat('OP', '*')) { if (this.at('NAME')) vararg = this.advance().value; this.eat('OP', ','); continue; }
      if (this.eat('OP', '**')) { kwarg = this.expect('NAME').value; break; }
      const name = this.expect('NAME').value;
      const def = this.eat('OP', '=') ? this.parseExpr() : null;
      params.push({ name, default: def });
      this.eat('OP', ',');
    }
    this.expect('OP', ':');
    return { type: 'Lambda', params, vararg, kwarg, body: this.parseExpr(), line: t.line, col: t.col };
  }
}

// -- builtins.js --

// adder v2 — builtins, modules, format specs
// Python built-in functions, method dispatch, and standard modules.
// All functions are sync unless they need to call user-provided callables
// (which are async since the evaluator is async).

// ── PyRange — lazy range ──

class AdderRange {
  constructor(start, stop, step) {
    if (stop === undefined) { this.start = 0; this.stop = start; this.step = 1; }
    else { this.start = start; this.stop = stop; this.step = step || 1; }
    if (this.step === 0) throw new AdderError('ValueError', 'range() arg 3 must not be zero');
    this.length = Math.max(0, Math.ceil((this.stop - this.start) / this.step));
  }
  [Symbol.iterator]() {
    let i = this.start;
    const stop = this.stop, step = this.step;
    return { next() {
      if (step > 0 ? i < stop : i > stop) { const v = i; i += step; return { value: v, done: false }; }
      return { done: true };
    }};
  }
  includes(v) {
    if (typeof v !== 'number' || !Number.isInteger(v)) return false;
    if (this.step > 0) { if (v < this.start || v >= this.stop) return false; }
    else { if (v > this.start || v <= this.stop) return false; }
    return (v - this.start) % this.step === 0;
  }
}

// ── AdderError ──

class AdderError extends Error {
  constructor(pyType, message, adderLine) {
    super(`${pyType}: ${message}${adderLine ? ` (line ${adderLine})` : ''}`);
    this.pyType = pyType;
    this.pyMessage = message;
    this.adderLine = adderLine;
  }
}

// ── Complex number ──

class Complex {
  constructor(real, imag = 0) {
    this.real = typeof real === 'number' ? real : Number(real);
    this.imag = typeof imag === 'number' ? imag : Number(imag);
  }
  __add__(other) {
    if (other instanceof Complex) return new Complex(this.real + other.real, this.imag + other.imag);
    if (typeof other === 'number') return new Complex(this.real + other, this.imag);
  }
  __radd__(left) {
    if (typeof left === 'number') return new Complex(this.real + left, this.imag);
  }
  __sub__(other) {
    if (other instanceof Complex) return new Complex(this.real - other.real, this.imag - other.imag);
    if (typeof other === 'number') return new Complex(this.real - other, this.imag);
  }
  __rsub__(left) {
    if (typeof left === 'number') return new Complex(left - this.real, -this.imag);
  }
  __mul__(other) {
    if (other instanceof Complex) return new Complex(this.real * other.real - this.imag * other.imag, this.real * other.imag + this.imag * other.real);
    if (typeof other === 'number') return new Complex(this.real * other, this.imag * other);
  }
  __rmul__(left) {
    if (typeof left === 'number') return new Complex(this.real * left, this.imag * left);
  }
  __truediv__(other) {
    let or, oi;
    if (other instanceof Complex) { or = other.real; oi = other.imag; }
    else if (typeof other === 'number') { or = other; oi = 0; }
    else return;
    const denom = or * or + oi * oi;
    if (denom === 0) throw new AdderError('ZeroDivisionError', 'complex division by zero');
    return new Complex((this.real * or + this.imag * oi) / denom, (this.imag * or - this.real * oi) / denom);
  }
  __rtruediv__(left) {
    if (typeof left === 'number') return new Complex(left, 0).__truediv__(this);
  }
  __pow__(other) {
    const r = Math.sqrt(this.real * this.real + this.imag * this.imag);
    const theta = Math.atan2(this.imag, this.real);
    if (typeof other === 'number') {
      const newR = Math.pow(r, other);
      const newTheta = other * theta;
      return new Complex(newR * Math.cos(newTheta), newR * Math.sin(newTheta));
    }
    if (other instanceof Complex) {
      const logR = Math.log(r), a = other.real, b = other.imag;
      const newR = Math.exp(a * logR - b * theta);
      const newTheta = b * logR + a * theta;
      return new Complex(newR * Math.cos(newTheta), newR * Math.sin(newTheta));
    }
  }
  __neg__() { return new Complex(-this.real, -this.imag); }
  __abs__() { return Math.sqrt(this.real * this.real + this.imag * this.imag); }
  __eq__(other) {
    if (other instanceof Complex) return this.real === other.real && this.imag === other.imag;
    if (typeof other === 'number') return this.imag === 0 && this.real === other;
    return false;
  }
  __bool__() { return this.real !== 0 || this.imag !== 0; }
  __repr__() {
    if (this.real === 0) return `${this.imag}j`;
    const sign = this.imag >= 0 ? '+' : '';
    return `(${this.real}${sign}${this.imag}j)`;
  }
  __str__() { return this.__repr__(); }
  get conjugate() { return () => new Complex(this.real, -this.imag); }
}

// ── type helpers ──

// type object registry — populated by adderBuiltins()
const _typeObjects = {};

function pyTypeName(v) {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Map) return 'dict';
  if (v instanceof Set) return 'set';
  if (v instanceof AdderRange) return 'range';
  if (v instanceof Complex) return 'complex';
  if (v instanceof Uint8Array) return 'bytes';
  if (typeof v === 'function') return 'function';
  if (v?.__adderClass__) return v.__adderClass__;
  return 'object';
}

function pyBool(v) {
  if (v === false || v === null || v === undefined || v === 0 || v === '' || v !== v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (v instanceof AdderRange) return v.length > 0;
  // check __bool__ dunder
  if (typeof v === 'object' && typeof v.__bool__ === 'function') return !!v.__bool__();
  if (typeof v === 'object' && typeof v.__len__ === 'function') return v.__len__() !== 0;
  return true;
}

// Python spells the non-finite floats inf / -inf / nan, never JS's Infinity / NaN
function _numRepr(v) {
  if (v !== v) return 'nan';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  return String(v);
}

// A typed array prints as the Python list of its elements (learn and friends hand them
// back raw). A float-typed array's integral elements keep their '.0'; a `shape` property
// whose product is the length nests the list row-major. Uint8Array is bytes, not here.
function _isListLikeTyped(v) {
  return ArrayBuffer.isView(v) && !(v instanceof DataView) && !(v instanceof Uint8Array);
}
function _typedRepr(v) {
  const isFloat = v instanceof Float64Array || v instanceof Float32Array;
  const el = (x) => {
    if (typeof x === 'bigint') return String(x);
    if (isFloat && Number.isInteger(x) && Math.abs(x) < 1e16) return Object.is(x, -0) ? '-0.0' : `${x}.0`;
    return _numRepr(x);
  };
  const shape = v.shape;
  const n = v.length;
  if (Array.isArray(shape) && shape.length >= 2 && shape.every((d) => Number.isInteger(d) && d >= 0)
      && shape.reduce((a, b) => a * b, 1) === n) {
    const rec = (axis, off) => {
      if (axis === shape.length - 1) {
        const parts = [];
        for (let i = 0; i < shape[axis]; i++) parts.push(el(v[off + i]));
        return `[${parts.join(', ')}]`;
      }
      const stride = shape.slice(axis + 1).reduce((a, b) => a * b, 1);
      const parts = [];
      for (let i = 0; i < shape[axis]; i++) parts.push(rec(axis + 1, off + i * stride));
      return `[${parts.join(', ')}]`;
    };
    return rec(0, 0);
  }
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(el(v[i]));
  return `[${parts.join(', ')}]`;
}

function pyRepr(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number') return _numRepr(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (_isListLikeTyped(v)) return _typedRepr(v);
  if (v instanceof Map) {
    const items = [...v.entries()].map(([k, val]) => `${pyRepr(k)}: ${pyRepr(val)}`);
    return `{${items.join(', ')}}`;
  }
  if (v instanceof Set) return `{${[...v].map(pyRepr).join(', ')}}` || 'set()';
  if (v instanceof AdderRange) {
    if (v.step === 1) return `range(${v.start}, ${v.stop})`;
    return `range(${v.start}, ${v.stop}, ${v.step})`;
  }
  if (v instanceof Complex) return v.__repr__();
  if (typeof v === 'function') {
    if (v._pyClass) return `<class '${v._pyName || v.name}'>`;
    return `<function ${v._pyName || v.name || '<lambda>'}>`;
  }
  if (typeof v === 'object' && typeof v.__repr__ === 'function') return v.__repr__();
  if (typeof v === 'object' && typeof v.__str__ === 'function') return v.__str__();
  try { return JSON.stringify(v); } catch { return String(v); }
}

function pyStr(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return v;
  if (v instanceof Complex) return v.__str__();
  if (typeof v === 'function' && v._pyClass) return `<class '${v._pyName || v.name}'>`;
  if (typeof v === 'object' && typeof v.__str__ === 'function') return v.__str__();
  return pyRepr(v);
}

// ── iteration helper ──

function* pyIter(obj) {
  if (obj === null || obj === undefined) throw new AdderError('TypeError', `'${pyTypeName(obj)}' object is not iterable`);
  if (Array.isArray(obj) || typeof obj === 'string' || obj instanceof Uint8Array) { for (let i = 0; i < obj.length; i++) yield obj[i]; return; }
  if (obj instanceof Map) { for (const k of obj.keys()) yield k; return; }
  if (obj instanceof Set || obj instanceof AdderRange) { yield* obj; return; }
  if (typeof obj[Symbol.iterator] === 'function') { yield* obj; return; }
  if (typeof obj === 'object' && typeof obj.length === 'number') { for (let i = 0; i < obj.length; i++) yield obj[i]; return; }
  // plain object — iterate keys
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) yield k; return; }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object is not iterable`);
}

// Collect iterable (sync or async) to array
async function pyCollect(obj) {
  if (obj && typeof obj[Symbol.asyncIterator] === 'function') {
    const arr = [];
    for await (const v of obj) arr.push(v);
    return arr;
  }
  return [...pyIter(obj)];
}

// ── format spec ──

function pyFormatValue(value, spec) {
  if (!spec) return pyStr(value);
  // parse spec: [[fill]align][sign][z][#][0][width][grouping_option][.precision][type]
  let fill = ' ', align = '', sign = '', width = 0, precision = -1, ftype = '', grouping = '';
  let i = 0;
  // fill + align
  if (i + 1 < spec.length && '<>^='.includes(spec[i + 1])) { fill = spec[i]; align = spec[i + 1]; i += 2; }
  else if (i < spec.length && '<>^='.includes(spec[i])) { align = spec[i]; i++; }
  // sign
  if (i < spec.length && '+-'.includes(spec[i])) { sign = spec[i]; i++; }
  // zero pad
  if (i < spec.length && spec[i] === '0') { if (!align) { fill = '0'; align = '='; } i++; }
  // width
  while (i < spec.length && spec[i] >= '0' && spec[i] <= '9') { width = width * 10 + (+spec[i]); i++; }
  // grouping
  if (i < spec.length && (spec[i] === ',' || spec[i] === '_')) { grouping = spec[i]; i++; }
  // precision
  if (i < spec.length && spec[i] === '.') { i++; precision = 0; while (i < spec.length && spec[i] >= '0' && spec[i] <= '9') { precision = precision * 10 + (+spec[i]); i++; } }
  // type
  if (i < spec.length) ftype = spec[i];

  let result;
  if (typeof value === 'number' && !Number.isFinite(value) && 'fFeEgG%n'.includes(ftype || 'f')) {
    result = value !== value ? 'nan' : 'inf';
    if ('FEG'.includes(ftype) && ftype) result = result.toUpperCase();
    if (value === -Infinity) result = '-' + result;
    else if (sign === '+') result = '+' + result;
    if (ftype === '%') result += '%';
  } else if (ftype === 'd') {
    result = Math.trunc(Number(value)).toString();
    if (sign === '+' && !result.startsWith('-')) result = '+' + result;
  } else if (ftype === 'f' || ftype === 'F') {
    result = Number(value).toFixed(precision >= 0 ? precision : 6);
    if (sign === '+' && !result.startsWith('-')) result = '+' + result;
  } else if (ftype === 'e' || ftype === 'E') {
    result = Number(value).toExponential(precision >= 0 ? precision : 6);
    if (ftype === 'E') result = result.toUpperCase();
    if (sign === '+' && !result.startsWith('-')) result = '+' + result;
  } else if (ftype === 'g' || ftype === 'G') {
    const p = precision >= 0 ? precision : 6;
    result = Number(value).toPrecision(p || 1);
    if (result.includes('e')) { /* keep */ } else { result = parseFloat(result).toString(); }
    if (ftype === 'G') result = result.toUpperCase();
    if (sign === '+' && !result.startsWith('-')) result = '+' + result;
  } else if (ftype === '%') {
    result = (Number(value) * 100).toFixed(precision >= 0 ? precision : 6) + '%';
    if (sign === '+' && !result.startsWith('-')) result = '+' + result;
  } else if (ftype === 'b') {
    result = Math.trunc(Number(value)).toString(2);
  } else if (ftype === 'o') {
    result = Math.trunc(Number(value)).toString(8);
  } else if (ftype === 'x' || ftype === 'X') {
    result = Math.trunc(Math.abs(Number(value))).toString(16);
    if (ftype === 'X') result = result.toUpperCase();
    if (Number(value) < 0) result = '-' + result;
  } else if (ftype === 'c') {
    result = String.fromCodePoint(Number(value));
  } else if (ftype === 's' || ftype === '') {
    result = typeof value === 'string' ? value : pyStr(value);
    if (precision >= 0) result = result.slice(0, precision);
  } else if (ftype === 'n') {
    result = Number(value).toLocaleString();
  } else {
    // auto: number vs string
    if (typeof value === 'number') {
      result = precision >= 0 ? value.toFixed(precision) : _numRepr(value);
      if (sign === '+' && !result.startsWith('-')) result = '+' + result;
    } else {
      result = pyStr(value);
      if (precision >= 0) result = result.slice(0, precision);
    }
  }

  // grouping
  if (grouping && (ftype === 'd' || ftype === 'f' || ftype === 'F' || ftype === '' || !ftype)) {
    const neg = result.startsWith('-');
    let num = neg ? result.slice(1) : result;
    const dot = num.indexOf('.');
    const intPart = dot >= 0 ? num.slice(0, dot) : num;
    const rest = dot >= 0 ? num.slice(dot) : '';
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
    result = (neg ? '-' : '') + grouped + rest;
  }

  // alignment
  if (!align) align = typeof value === 'string' ? '<' : '>';
  if (width > result.length) {
    const pad = width - result.length;
    if (align === '<') result = result + fill.repeat(pad);
    else if (align === '>') result = fill.repeat(pad) + result;
    else if (align === '^') { const left = Math.floor(pad / 2); result = fill.repeat(left) + result + fill.repeat(pad - left); }
    else if (align === '=') {
      // pad after sign
      const signIdx = (result[0] === '-' || result[0] === '+') ? 1 : 0;
      result = result.slice(0, signIdx) + fill.repeat(pad) + result.slice(signIdx);
    }
  }
  return result;
}

// ── method dispatch ──

function _isNativeClass(fn) {
  try { return /^class[\s{]/.test(Function.prototype.toString.call(fn)); } catch { return false; }
}

function adderGetAttr(obj, attr) {
  // string methods
  if (typeof obj === 'string') return _strMethod(obj, attr);
  // list methods
  if (Array.isArray(obj)) return _listMethod(obj, attr);
  // dict (Map) methods
  if (obj instanceof Map) return _mapMethod(obj, attr);
  // set methods
  if (obj instanceof Set) return _setMethod(obj, attr);
  // numpy-shape Float64Array — common when learn/scitra return a
  // flat ndarray with `.shape` tacked on. Expose the numpy methods
  // (.mean, .var, .std, .sum, .min, .max) and dunder-like shape/ndim/
  // size properties so `x.mean(axis=0)` works on these without each
  // library having to ship its own wrapper class.
  if (obj instanceof Float64Array && Array.isArray(obj.shape)) {
    const v = _ndarrayProp(obj, attr);
    if (v !== undefined) return v;
  }
  // range
  if (obj instanceof AdderRange) {
    if (attr === 'start') return obj.start;
    if (attr === 'stop') return obj.stop;
    if (attr === 'step') return obj.step;
  }
  // plain object (dict with string keys)
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Array) && !(obj instanceof Map) && !(obj instanceof Set)) {
    // check for adder class method on prototype
    if (typeof obj[attr] === 'function') {
      if (_isNativeClass(obj[attr])) return obj[attr];
      // adder functions expect self as first arg — inject it (skip for modules)
      if (obj[attr]._pyFunc && !obj.__adderModule__) {
        const originalFn = obj[attr];
        const fn = (...args) => originalFn(obj, ...args);
        fn._pyFunc = true;
        fn._pyName = `${attr}`;
        return fn;
      }
      const original = obj[attr];
      const fn = original.bind(obj);
      // Function.prototype.bind drops custom properties off the original
      // (`t.cdf`, `t.pdf` etc. — scipy-style "callable namespace" pattern).
      // Copy them over so dotted access (`stats.t.cdf`) still resolves.
      for (const k of Object.getOwnPropertyNames(original)) {
        if (k === 'length' || k === 'name' || k === 'prototype') continue;
        try { fn[k] = original[k]; } catch {}
      }
      fn._pyName = attr;
      return fn;
    }
    // regular property access (before dict-like methods, so getters/own props take priority)
    if (attr in obj) return obj[attr];
    // dict-like attribute access — keys, values, items, get, etc.
    if (_objDictMethods[attr]) return _objDictMethods[attr](obj);
    // __getattr__ dunder
    if (typeof obj.__getattr__ === 'function') return obj.__getattr__(attr);
    throw new AdderError('AttributeError', `'${pyTypeName(obj)}' object has no attribute '${attr}'`);
  }
  // generic
  if (obj !== null && obj !== undefined && attr in obj) {
    const val = obj[attr];
    if (typeof val === 'function') {
      if (_isNativeClass(val)) return val;
      if (val._pyFunc) { const fn = (...args) => val(obj, ...args); fn._pyFunc = true; fn._pyName = attr; return fn; }
      return val.bind(obj);
    }
    return val;
  }
  throw new AdderError('AttributeError', `'${pyTypeName(obj)}' object has no attribute '${attr}'`);
}

function _strMethod(s, attr) {
  const m = {
    upper: () => s.toUpperCase(),
    lower: () => s.toLowerCase(),
    strip: (chars) => chars ? _stripChars(s, chars) : s.trim(),
    lstrip: (chars) => chars ? _lstripChars(s, chars) : s.trimStart(),
    rstrip: (chars) => chars ? _rstripChars(s, chars) : s.trimEnd(),
    split: (sep, maxsplit) => {
      if (sep === undefined || sep === null) return s.trim().split(/\s+/);
      if (maxsplit !== undefined) { const parts = []; let rest = s; for (let i = 0; i < maxsplit; i++) { const idx = rest.indexOf(sep); if (idx < 0) break; parts.push(rest.slice(0, idx)); rest = rest.slice(idx + sep.length); } parts.push(rest); return parts; }
      return s.split(sep);
    },
    rsplit: (sep, maxsplit) => {
      if (sep === undefined || sep === null) return s.trim().split(/\s+/);
      if (maxsplit !== undefined) { const parts = []; let rest = s; for (let i = 0; i < maxsplit; i++) { const idx = rest.lastIndexOf(sep); if (idx < 0) break; parts.unshift(rest.slice(idx + sep.length)); rest = rest.slice(0, idx); } parts.unshift(rest); return parts; }
      return s.split(sep);
    },
    join: (iterable) => [...pyIter(iterable)].join(s),
    replace: (old, nw, count) => {
      if (count === undefined) return s.split(old).join(nw);
      let result = s, n = 0;
      while (n < count) { const idx = result.indexOf(old); if (idx < 0) break; result = result.slice(0, idx) + nw + result.slice(idx + old.length); n++; }
      return result;
    },
    find: (sub, start, end) => { const sl = s.slice(start || 0, end); const i = sl.indexOf(sub); return i < 0 ? -1 : i + (start || 0); },
    rfind: (sub, start, end) => { const sl = s.slice(start || 0, end); const i = sl.lastIndexOf(sub); return i < 0 ? -1 : i + (start || 0); },
    index: (sub, start, end) => { const i = m.find(sub, start, end); if (i < 0) throw new AdderError('ValueError', 'substring not found'); return i; },
    rindex: (sub, start, end) => { const i = m.rfind(sub, start, end); if (i < 0) throw new AdderError('ValueError', 'substring not found'); return i; },
    count: (sub) => { let n = 0, i = 0; while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length || 1; } return n; },
    startswith: (prefix, start, end) => s.slice(start || 0, end).startsWith(prefix),
    endswith: (suffix, start, end) => s.slice(start || 0, end).endsWith(suffix),
    format: (...args) => _strFormat(s, args),
    encode: (encoding) => new TextEncoder().encode(s),
    capitalize: () => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
    title: () => s.replace(/\b\w/g, c => c.toUpperCase()),
    swapcase: () => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(''),
    isdigit: () => s.length > 0 && /^\d+$/.test(s),
    isalpha: () => s.length > 0 && /^[a-zA-Z]+$/.test(s),
    isalnum: () => s.length > 0 && /^[a-zA-Z0-9]+$/.test(s),
    isspace: () => s.length > 0 && /^\s+$/.test(s),
    isupper: () => s.length > 0 && s === s.toUpperCase() && s !== s.toLowerCase(),
    islower: () => s.length > 0 && s === s.toLowerCase() && s !== s.toUpperCase(),
    zfill: (width) => { const neg = s.startsWith('-'); const base = neg ? s.slice(1) : s; const padded = base.padStart(width - (neg ? 1 : 0), '0'); return neg ? '-' + padded : padded; },
    ljust: (width, fill) => s.padEnd(width, fill || ' '),
    rjust: (width, fill) => s.padStart(width, fill || ' '),
    center: (width, fill) => { const f = fill || ' '; const total = width - s.length; if (total <= 0) return s; const left = Math.floor(total / 2); return f.repeat(left) + s + f.repeat(total - left); },
    expandtabs: (tabsize) => s.replace(/\t/g, ' '.repeat(tabsize || 8)),
    partition: (sep) => { const i = s.indexOf(sep); return i < 0 ? [s, '', ''] : [s.slice(0, i), sep, s.slice(i + sep.length)]; },
    rpartition: (sep) => { const i = s.lastIndexOf(sep); return i < 0 ? ['', '', s] : [s.slice(0, i), sep, s.slice(i + sep.length)]; },
    removeprefix: (prefix) => s.startsWith(prefix) ? s.slice(prefix.length) : s,
    removesuffix: (suffix) => s.endsWith(suffix) ? s.slice(0, -suffix.length || s.length) : s,
    splitlines: (keepends) => s.split(/\r?\n|\r/).map((l, i, a) => keepends && i < a.length - 1 ? l + '\n' : l),
    maketrans: () => { throw new AdderError('NotImplementedError', 'str.maketrans is not supported'); },
    translate: () => { throw new AdderError('NotImplementedError', 'str.translate is not supported'); },
  };
  if (attr in m) { const fn = m[attr]; fn._pyName = `str.${attr}`; return fn; }
  throw new AdderError('AttributeError', `'str' object has no attribute '${attr}'`);
}

function _stripChars(s, chars) { const cs = new Set(chars); let l = 0, r = s.length; while (l < r && cs.has(s[l])) l++; while (r > l && cs.has(s[r - 1])) r--; return s.slice(l, r); }
function _lstripChars(s, chars) { const cs = new Set(chars); let l = 0; while (l < s.length && cs.has(s[l])) l++; return s.slice(l); }
function _rstripChars(s, chars) { const cs = new Set(chars); let r = s.length; while (r > 0 && cs.has(s[r - 1])) r--; return s.slice(0, r); }

function _strFormat(s, args) {
  let ai = 0;
  return s.replace(/\{([^}]*)\}/g, (_, spec) => {
    let key, fmt;
    const ci = spec.indexOf(':');
    if (ci >= 0) { key = spec.slice(0, ci); fmt = spec.slice(ci + 1); }
    else { key = spec; fmt = ''; }
    let val;
    if (key === '' || key === undefined) val = args[ai++];
    else if (/^\d+$/.test(key)) val = args[parseInt(key)];
    else val = args[0]?.[key];
    return fmt ? pyFormatValue(val, fmt) : pyStr(val);
  });
}

// 2D ndarray-shape methods (Float64Array + .shape). Each axis-aware
// reduction returns either a scalar (axis=None) or a Float64Array
// per-column (axis=0) / per-row (axis=1) with `.shape` attached.
function _ndarrayProp(obj, attr) {
  // Properties
  if (attr === 'shape') return obj.shape.slice();
  if (attr === 'ndim') return obj.shape.length;
  if (attr === 'size') return obj.length;
  if (attr === 'dtype') return 'float64';
  if (attr === 'T') return _ndarrayTranspose(obj);
  if (attr === 'tolist') {
    const fn = () => _ndarrayToList(obj);
    fn._pyName = 'tolist';
    return fn;
  }
  // Reductions
  const _reduce = (axisRedScalar) => {
    const fn = (axisOrKw) => {
      let axis = axisOrKw;
      if (axisOrKw && typeof axisOrKw === 'object' && axisOrKw._kw) {
        axis = axisOrKw.axis;
      }
      return _ndarrayReduce(obj, axis, axisRedScalar);
    };
    fn._pyName = `ndarray.${attr}`;
    return fn;
  };
  switch (attr) {
    case 'mean':
      return _reduce(_R_MEAN);
    case 'sum':
      return _reduce(_R_SUM);
    case 'var':
      return _reduce(_R_VAR);
    case 'std':
      return _reduce(_R_STD);
    case 'min':
      return _reduce(_R_MIN);
    case 'max':
      return _reduce(_R_MAX);
  }
  return undefined;
}

// Reduction "kinds" — small closures (init, step, finalize).
const _R_SUM  = { init: 0,         step: (s, v) => s + v,                                  fin: (s, n) => s };
const _R_MEAN = { init: 0,         step: (s, v) => s + v,                                  fin: (s, n) => n ? s / n : NaN };
const _R_MIN  = { init: Infinity,  step: (s, v) => v < s ? v : s,                          fin: (s, n) => n ? s : NaN };
const _R_MAX  = { init: -Infinity, step: (s, v) => v > s ? v : s,                          fin: (s, n) => n ? s : NaN };
const _R_VAR  = { mean: true,      step: (m, v) => (v - m) * (v - m),                      fin: (s, n) => n ? s / n : NaN };
const _R_STD  = { mean: true,      step: (m, v) => (v - m) * (v - m),                      fin: (s, n) => n ? Math.sqrt(s / n) : NaN };

function _ndarrayReduce(arr, axis, kind) {
  if (arr.shape.length === 1) {
    return _reduce1D(arr, 0, arr.length, kind);
  }
  const [n, m] = arr.shape;
  if (axis == null) {
    // Reduce over everything → scalar
    return _reduce1D(arr, 0, n * m, kind);
  }
  if (axis === 0) {
    // Per-column (m results)
    const out = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const slice = new Float64Array(n);
      for (let i = 0; i < n; i++) slice[i] = arr[i * m + j];
      out[j] = _reduce1D(slice, 0, n, kind);
    }
    out.shape = [m];
    return out;
  }
  if (axis === 1) {
    // Per-row (n results)
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = _reduce1D(arr, i * m, m, kind);
    }
    out.shape = [n];
    return out;
  }
  throw new AdderError('ValueError', `unsupported axis ${axis}`);
}

function _reduce1D(data, start, len, kind) {
  if (kind.mean) {
    // Two-pass for variance / std — need the mean first.
    let s = 0;
    for (let i = 0; i < len; i++) s += data[start + i];
    const m = len ? s / len : 0;
    let v = 0;
    for (let i = 0; i < len; i++) v += kind.step(m, data[start + i]);
    return kind.fin(v, len);
  }
  let acc = kind.init;
  for (let i = 0; i < len; i++) acc = kind.step(acc, data[start + i]);
  return kind.fin(acc, len);
}

function _ndarrayTranspose(arr) {
  if (arr.shape.length === 1) return arr;
  const [n, m] = arr.shape;
  const out = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) out[j * n + i] = arr[i * m + j];
  }
  out.shape = [m, n];
  return out;
}

function _ndarrayToList(arr) {
  if (arr.shape.length === 1) return Array.from(arr);
  const [n, m] = arr.shape;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = new Array(m);
    for (let j = 0; j < m; j++) row[j] = arr[i * m + j];
    out[i] = row;
  }
  return out;
}

function _listMethod(arr, attr) {
  const m = {
    append: (v) => { arr.push(v); return null; },
    extend: (iterable) => { for (const v of pyIter(iterable)) arr.push(v); return null; },
    insert: (i, v) => { arr.splice(i < 0 ? Math.max(0, arr.length + i) : i, 0, v); return null; },
    remove: (v) => { const i = arr.indexOf(v); if (i < 0) throw new AdderError('ValueError', 'list.remove(x): x not in list'); arr.splice(i, 1); return null; },
    pop: (i) => { if (arr.length === 0) throw new AdderError('IndexError', 'pop from empty list'); return i === undefined ? arr.pop() : arr.splice(i < 0 ? arr.length + i : i, 1)[0]; },
    clear: () => { arr.length = 0; return null; },
    index: (v, start, end) => { const i = arr.indexOf(v, start || 0); if (i < 0 || (end !== undefined && i >= end)) throw new AdderError('ValueError', `${pyRepr(v)} is not in list`); return i; },
    count: (v) => arr.filter(x => x === v).length,
    sort: (key, reverse) => { if (key) { const keyed = arr.map((v, i) => [key(v), i, v]); keyed.sort((a, b) => _pyCompare(a[0], b[0])); const sorted = keyed.map(x => x[2]); arr.length = 0; arr.push(...(reverse ? sorted.reverse() : sorted)); } else { arr.sort((a, b) => _pyCompare(a, b)); if (reverse) arr.reverse(); } return null; },
    reverse: () => { arr.reverse(); return null; },
    copy: () => [...arr],
  };
  if (attr in m) { const fn = m[attr]; fn._pyName = `list.${attr}`; return fn; }
  throw new AdderError('AttributeError', `'list' object has no attribute '${attr}'`);
}

function _mapMethod(map, attr) {
  const m = {
    keys: () => [...map.keys()],
    values: () => [...map.values()],
    items: () => [...map.entries()],
    get: (k, def) => map.has(k) ? map.get(k) : (def !== undefined ? def : null),
    pop: (k, def) => { if (map.has(k)) { const v = map.get(k); map.delete(k); return v; } if (def !== undefined) return def; throw new AdderError('KeyError', pyRepr(k)); },
    setdefault: (k, def) => { if (map.has(k)) return map.get(k); const v = def !== undefined ? def : null; map.set(k, v); return v; },
    update: (other) => { if (other instanceof Map) { for (const [k, v] of other) map.set(k, v); } else if (typeof other === 'object') { for (const k of Object.keys(other)) map.set(k, other[k]); } return null; },
    clear: () => { map.clear(); return null; },
    copy: () => new Map(map),
  };
  if (attr in m) { const fn = m[attr]; fn._pyName = `dict.${attr}`; return fn; }
  if (attr === 'size') return map.size;
  throw new AdderError('AttributeError', `'dict' object has no attribute '${attr}'`);
}

const _objDictMethods = {
  keys: (obj) => { const fn = () => Object.keys(obj); fn._pyName = 'dict.keys'; return fn; },
  values: (obj) => { const fn = () => Object.values(obj); fn._pyName = 'dict.values'; return fn; },
  items: (obj) => { const fn = () => Object.entries(obj); fn._pyName = 'dict.items'; return fn; },
  get: (obj) => { const fn = (k, def) => k in obj ? obj[k] : (def !== undefined ? def : null); fn._pyName = 'dict.get'; return fn; },
  pop: (obj) => { const fn = (k, def) => { if (k in obj) { const v = obj[k]; delete obj[k]; return v; } if (def !== undefined) return def; throw new AdderError('KeyError', pyRepr(k)); }; fn._pyName = 'dict.pop'; return fn; },
  setdefault: (obj) => { const fn = (k, def) => { if (k in obj) return obj[k]; obj[k] = def !== undefined ? def : null; return obj[k]; }; fn._pyName = 'dict.setdefault'; return fn; },
  update: (obj) => { const fn = (other) => { if (other instanceof Map) { for (const [k, v] of other) obj[k] = v; } else if (typeof other === 'object') Object.assign(obj, other); return null; }; fn._pyName = 'dict.update'; return fn; },
  clear: (obj) => { const fn = () => { for (const k of Object.keys(obj)) delete obj[k]; return null; }; fn._pyName = 'dict.clear'; return fn; },
  copy: (obj) => { const fn = () => ({ ...obj }); fn._pyName = 'dict.copy'; return fn; },
};

function _setMethod(set, attr) {
  const m = {
    add: (v) => { set.add(v); return null; },
    remove: (v) => { if (!set.has(v)) throw new AdderError('KeyError', pyRepr(v)); set.delete(v); return null; },
    discard: (v) => { set.delete(v); return null; },
    pop: () => { if (set.size === 0) throw new AdderError('KeyError', 'pop from an empty set'); const v = set.values().next().value; set.delete(v); return v; },
    clear: () => { set.clear(); return null; },
    union: (...others) => { const r = new Set(set); for (const o of others) for (const v of pyIter(o)) r.add(v); return r; },
    intersection: (...others) => { const r = new Set(); for (const v of set) { if (others.every(o => { const s = o instanceof Set ? o : new Set(pyIter(o)); return s.has(v); })) r.add(v); } return r; },
    difference: (...others) => { const r = new Set(set); for (const o of others) for (const v of pyIter(o)) r.delete(v); return r; },
    symmetric_difference: (other) => { const r = new Set(set); for (const v of pyIter(other)) { if (r.has(v)) r.delete(v); else r.add(v); } return r; },
    update: (...others) => { for (const o of others) for (const v of pyIter(o)) set.add(v); return null; },
    issubset: (other) => { const o = other instanceof Set ? other : new Set(pyIter(other)); for (const v of set) if (!o.has(v)) return false; return true; },
    issuperset: (other) => { for (const v of pyIter(other)) if (!set.has(v)) return false; return true; },
    copy: () => new Set(set),
  };
  if (attr in m) { const fn = m[attr]; fn._pyName = `set.${attr}`; return fn; }
  throw new AdderError('AttributeError', `'set' object has no attribute '${attr}'`);
}

function _pyCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ── modules ──

const _mathModule = {
  pi: Math.PI, e: Math.E, tau: Math.PI * 2, inf: Infinity, nan: NaN,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  sqrt: Math.sqrt, exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10,
  pow: Math.pow, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  fabs: Math.abs, copysign: (x, y) => Math.sign(y) * Math.abs(x),
  isnan: Number.isNaN, isinf: (x) => !isFinite(x) && !isNaN(x), isfinite: Number.isFinite,
  radians: (d) => d * Math.PI / 180, degrees: (r) => r * 180 / Math.PI,
  factorial: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  gcd: (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; },
  comb: (n, k) => { if (k < 0 || k > n) return 0; if (k === 0 || k === n) return 1; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); },
  perm: (n, k) => { if (k === undefined) k = n; let r = 1; for (let i = 0; i < k; i++) r *= (n - i); return r; },
  hypot: Math.hypot,
  fsum: (iterable) => { let s = 0; for (const v of pyIter(iterable)) s += v; return s; },
  prod: (iterable, start) => { let r = start !== undefined ? start : 1; for (const v of pyIter(iterable)) r *= v; return r; },
  fmod: (x, y) => x % y,
  remainder: (x, y) => x - Math.round(x / y) * y,
  ldexp: (x, i) => x * Math.pow(2, i),
  frexp: (x) => { if (x === 0) return [0, 0]; const e = Math.ceil(Math.log2(Math.abs(x))); return [x / Math.pow(2, e), e]; },
  modf: (x) => { const i = Math.trunc(x); return [x - i, i]; },
};

const _jsonModule = {
  dumps: (obj, indent) => {
    const replacer = (k, v) => {
      if (v instanceof Map) return Object.fromEntries(v);
      if (v instanceof Set) return [...v];
      return v;
    };
    return JSON.stringify(obj, replacer, indent);
  },
  loads: (s) => JSON.parse(s),
};

const _jsModule = new Proxy({}, {
  get(_, prop) { return typeof globalThis !== 'undefined' ? globalThis[prop] : undefined; },
  has(_, prop) { return typeof globalThis !== 'undefined' && prop in globalThis; },
});

const _randomState = { s: [1, 2, 3, 4] };
function _xoshiro128() {
  const s = _randomState.s;
  const result = (s[0] + s[3]) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
  s[2] ^= t; s[3] = (s[3] << 11) | (s[3] >>> 21);
  return result / 4294967296;
}

const _randomModule = {
  random: () => _xoshiro128(),
  seed: (n) => { n = n >>> 0; _randomState.s = [n, n ^ 0x12345678, n ^ 0x9ABCDEF0, n ^ 0xFEDCBA98]; },
  randint: (a, b) => a + Math.floor(_xoshiro128() * (b - a + 1)),
  uniform: (a, b) => a + _xoshiro128() * (b - a),
  choice: (seq) => { const arr = Array.isArray(seq) ? seq : [...pyIter(seq)]; return arr[Math.floor(_xoshiro128() * arr.length)]; },
  shuffle: (lst) => { for (let i = lst.length - 1; i > 0; i--) { const j = Math.floor(_xoshiro128() * (i + 1)); [lst[i], lst[j]] = [lst[j], lst[i]]; } return null; },
  gauss: (mu, sigma) => {
    let u, v, s;
    do { u = 2 * _xoshiro128() - 1; v = 2 * _xoshiro128() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    return mu + sigma * u * Math.sqrt(-2 * Math.log(s) / s);
  },
  sample: (population, k) => {
    const arr = Array.isArray(population) ? [...population] : [...pyIter(population)];
    const result = [];
    for (let i = 0; i < k; i++) { const j = Math.floor(_xoshiro128() * arr.length); result.push(arr.splice(j, 1)[0]); }
    return result;
  },
};

// ── itertools (lazy async iterables) ──

function _aiter(obj) {
  if (obj && typeof obj[Symbol.asyncIterator] === 'function') return obj;
  return pyIter(obj);
}

const _itertoolsModule = {
  chain: (...iterables) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        for (const it of iterables) for await (const v of _aiter(it)) yield v;
      })();
    },
  }),
  product: (...iterables) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        const arrs = [];
        for (const it of iterables) arrs.push(await pyCollect(it));
        if (arrs.length === 0) { yield []; return; }
        const indices = arrs.map(() => 0);
        while (true) {
          yield indices.map((idx, i) => arrs[i][idx]);
          let i = arrs.length - 1;
          while (i >= 0) { indices[i]++; if (indices[i] < arrs[i].length) break; indices[i] = 0; i--; }
          if (i < 0) break;
        }
      })();
    },
  }),
  combinations: (iterable, r) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        const pool = await pyCollect(iterable);
        const n = pool.length;
        if (r > n) return;
        const indices = Array.from({ length: r }, (_, i) => i);
        yield indices.map(i => pool[i]);
        while (true) {
          let i = r - 1;
          while (i >= 0 && indices[i] === i + n - r) i--;
          if (i < 0) break;
          indices[i]++;
          for (let j = i + 1; j < r; j++) indices[j] = indices[j - 1] + 1;
          yield indices.map(i => pool[i]);
        }
      })();
    },
  }),
  permutations: (iterable, r) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        const pool = await pyCollect(iterable);
        const n = pool.length;
        r = r !== undefined ? r : n;
        if (r > n) return;
        const indices = Array.from({ length: n }, (_, i) => i);
        const cycles = Array.from({ length: r }, (_, i) => n - i);
        yield indices.slice(0, r).map(i => pool[i]);
        while (true) {
          let found = false;
          for (let i = r - 1; i >= 0; i--) {
            cycles[i]--;
            if (cycles[i] === 0) { indices.push(indices.splice(i, 1)[0]); cycles[i] = n - i; }
            else { const j = indices.length - cycles[i]; [indices[i], indices[j]] = [indices[j], indices[i]]; yield indices.slice(0, r).map(i => pool[i]); found = true; break; }
          }
          if (!found) break;
        }
      })();
    },
  }),
  repeat: (value, times) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        if (times === undefined) { while (true) yield value; }
        else { for (let i = 0; i < times; i++) yield value; }
      })();
    },
  }),
  accumulate: (iterable, func) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        let acc, first = true;
        for await (const v of _aiter(iterable)) {
          if (first) { acc = v; first = true; yield acc; first = false; }
          else { acc = func ? func(acc, v) : acc + v; yield acc; }
        }
      })();
    },
  }),
  starmap: (func, iterable) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        for await (const args of _aiter(iterable)) yield await func(...args);
      })();
    },
  }),
  islice: (iterable, ...args) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        let start = 0, stop, step = 1;
        if (args.length === 1) { stop = args[0]; }
        else if (args.length === 2) { start = args[0]; stop = args[1]; }
        else { start = args[0]; stop = args[1]; step = args[2] || 1; }
        let i = 0;
        for await (const v of _aiter(iterable)) {
          if (stop !== undefined && i >= stop) break;
          if (i >= start && (i - start) % step === 0) yield v;
          i++;
        }
      })();
    },
  }),
  zip_longest: (...args) => {
    let fillvalue = null;
    if (args.length > 0 && args[args.length - 1]?._kw) { fillvalue = args.pop().fillvalue ?? null; }
    return {
      [Symbol.asyncIterator]() {
        return (async function*() {
          const arrs = [];
          for (const it of args) arrs.push(await pyCollect(it));
          const maxLen = Math.max(...arrs.map(a => a.length));
          for (let i = 0; i < maxLen; i++) yield arrs.map(a => i < a.length ? a[i] : fillvalue);
        })();
      },
    };
  },
  groupby: (iterable, key) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        let currentKey, currentGroup = [], first = true;
        for await (const item of _aiter(iterable)) {
          const k = key ? key(item) : item;
          if (first || k !== currentKey) {
            if (currentGroup.length > 0) yield [currentKey, currentGroup];
            currentKey = k; currentGroup = [item]; first = false;
          } else { currentGroup.push(item); }
        }
        if (currentGroup.length > 0) yield [currentKey, currentGroup];
      })();
    },
  }),
  count: (start, step) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        let n = start ?? 0;
        const s = step ?? 1;
        while (true) { yield n; n += s; }
      })();
    },
  }),
  cycle: (iterable) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        const saved = [];
        for await (const v of _aiter(iterable)) { saved.push(v); yield v; }
        while (saved.length > 0) { for (const v of saved) yield v; }
      })();
    },
  }),
  pairwise: (iterable) => ({
    [Symbol.asyncIterator]() {
      return (async function*() {
        let prev, hasPrev = false;
        for await (const v of _aiter(iterable)) {
          if (hasPrev) yield [prev, v];
          prev = v; hasPrev = true;
        }
      })();
    },
  }),
};

// ── functools ──

const _functoolsModule = {
  reduce: (func, iterable, initial) => {
    const arr = [...pyIter(iterable)];
    if (initial !== undefined) return arr.reduce((a, b) => func(a, b), initial);
    if (arr.length === 0) throw new AdderError('TypeError', 'reduce() of empty iterable with no initial value');
    return arr.reduce((a, b) => func(a, b));
  },
  partial: (func, ...partialArgs) => {
    const wrapped = (...args) => func(...partialArgs, ...args);
    wrapped._pyName = `partial(${func._pyName || func.name || '?'})`;
    return wrapped;
  },
  lru_cache: (fn) => {
    const cache = new Map();
    const wrapped = (...args) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) return cache.get(key);
      const result = fn(...args);
      cache.set(key, result);
      return result;
    };
    wrapped.cache_clear = () => cache.clear();
    wrapped._pyName = fn._pyName || fn.name;
    return wrapped;
  },
};

// ── collections ──

const _collectionsModule = {
  OrderedDict: (items) => {
    // JS Map preserves insertion order
    if (!items) return new Map();
    return new Map(Array.isArray(items) ? items : Object.entries(items));
  },
  defaultdict: (factory, items) => {
    const map = new Map();
    if (items) { for (const [k, v] of (Array.isArray(items) ? items : Object.entries(items))) map.set(k, v); }
    return new Proxy(map, {
      get(target, prop) {
        if (prop === 'get' || prop === 'has' || prop === 'set' || prop === 'delete' || prop === 'size' || prop === 'keys' || prop === 'values' || prop === 'items' || prop === 'clear' || prop === 'entries' || typeof prop === 'symbol') return Reflect.get(target, prop);
        if (!target.has(prop)) target.set(prop, factory());
        return target.get(prop);
      },
    });
  },
  Counter: (iterable) => {
    const counts = {};
    if (iterable) { for (const v of pyIter(iterable)) counts[v] = (counts[v] || 0) + 1; }
    counts.most_common = (n) => {
      const entries = Object.entries(counts).filter(([k]) => k !== 'most_common' && k !== 'elements' && k !== 'update');
      entries.sort((a, b) => b[1] - a[1]);
      return n !== undefined ? entries.slice(0, n) : entries;
    };
    counts.update = (iterable) => { for (const v of pyIter(iterable)) counts[v] = (counts[v] || 0) + 1; };
    return counts;
  },
  namedtuple: (name, fields) => {
    const fieldNames = typeof fields === 'string' ? fields.split(/[\s,]+/).filter(Boolean) : [...fields];
    return (...args) => {
      const obj = {};
      for (let i = 0; i < fieldNames.length; i++) obj[fieldNames[i]] = args[i];
      obj.__adderClass__ = name;
      obj.__repr__ = () => `${name}(${fieldNames.map(f => `${f}=${pyRepr(obj[f])}`).join(', ')})`;
      return obj;
    };
  },
};

// ── re (regex) ──

// Translate Python regex syntax to JS: (?P<name>...) → (?<name>...), (?P=name) → \k<name>
function _pyRegexToJs(pattern) {
  return pattern.replace(/\(\?P<([^>]+)>/g, '(?<$1>').replace(/\(\?P=([a-zA-Z_]\w*)\)/g, '\\k<$1>');
}

const _reModule = {
  match: (pattern, string) => { const m = string.match(new RegExp(_pyRegexToJs(pattern))); return m ? _reMatch(m) : null; },
  search: (pattern, string) => { const m = string.match(new RegExp(_pyRegexToJs(pattern))); return m ? _reMatch(m) : null; },
  findall: (pattern, string) => { const re = new RegExp(_pyRegexToJs(pattern), 'g'); const r = []; let m; while ((m = re.exec(string))) r.push(m[1] !== undefined ? m[1] : m[0]); return r; },
  sub: (pattern, repl, string, count) => {
    const jsPat = _pyRegexToJs(pattern);
    if (count !== undefined && count > 0) {
      let n = 0;
      return string.replace(new RegExp(jsPat, 'g'), (...args) => n++ < count ? (typeof repl === 'function' ? repl(_reMatch(_reMatchFromArgs(args))) : repl) : args[0]);
    }
    return string.replace(new RegExp(jsPat, 'g'), typeof repl === 'function' ? (...args) => repl(_reMatch(_reMatchFromArgs(args))) : repl);
  },
  split: (pattern, string, maxsplit) => {
    const jsPat = _pyRegexToJs(pattern);
    if (maxsplit !== undefined) {
      const parts = []; let rest = string;
      for (let i = 0; i < maxsplit; i++) {
        const m = rest.match(new RegExp(jsPat));
        if (!m) break;
        parts.push(rest.slice(0, m.index));
        rest = rest.slice(m.index + m[0].length);
      }
      parts.push(rest);
      return parts;
    }
    return string.split(new RegExp(jsPat));
  },
  compile: (pattern) => {
    const jsPat = _pyRegexToJs(pattern);
    const re = new RegExp(jsPat, 'g');
    return {
      match: (s) => { re.lastIndex = 0; const m = re.exec(s); return m && m.index === 0 ? _reMatch(m) : null; },
      search: (s) => { re.lastIndex = 0; const m = re.exec(s); return m ? _reMatch(m) : null; },
      findall: (s) => { re.lastIndex = 0; const r = []; let m; while ((m = re.exec(s))) r.push(m[1] !== undefined ? m[1] : m[0]); return r; },
      sub: (repl, s) => s.replace(new RegExp(jsPat, 'g'), repl),
      split: (s) => s.split(new RegExp(jsPat)),
    };
  },
  escape: (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  IGNORECASE: 'i', I: 'i',
  MULTILINE: 'm', M: 'm',
  DOTALL: 's', S: 's',
};

function _reMatchFromArgs(args) {
  // Reconstruct match object from replace callback args
  const m = [args[0]];
  let i = 1;
  while (i < args.length && typeof args[i] !== 'number') { m.push(args[i]); i++; }
  m.index = args[i]; m.input = args[i + 1];
  if (typeof args[i + 2] === 'object') m.groups = args[i + 2];
  return m;
}

function _reMatch(m) {
  return {
    group: (n) => n === undefined ? m[0] : (typeof n === 'string' ? (m.groups?.[n] ?? null) : m[n]),
    groups: () => m.slice(1),
    groupdict: () => m.groups || {},
    start: () => m.index,
    end: () => m.index + m[0].length,
    span: () => [m.index, m.index + m[0].length],
    string: m.input,
    0: m[0],
  };
}

// ── string module ──

const _stringModule = {
  ascii_lowercase: 'abcdefghijklmnopqrstuvwxyz',
  ascii_uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ascii_letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  hexdigits: '0123456789abcdefABCDEF',
  octdigits: '01234567',
  punctuation: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  whitespace: ' \t\n\r\x0b\x0c',
};

// ── this ──

const _thisModule = {
  s: `The Zen of Python, by Tim Peters

Beautiful is better than ugly.
Explicit is better than implicit.
Simple is better than complex.
Complex is better than complicated.
Flat is better than nested.
Sparse is better than dense.
Readability counts.
Special cases aren't special enough to break the rules.
Although practicality beats purity.
Errors should never pass silently.
Unless explicitly silenced.
In the face of ambiguity, refuse the temptation to guess.
There should be one-- and preferably only one --obvious way to do it.
Although that way may not be obvious at first unless you're Dutch.
Now is better than never.
Although never is often better than *right* now.
If the implementation is hard to explain, it's a bad idea.
If the implementation is easy to explain, it may be a good idea.
Namespaces are one honking great idea -- let's do more of those!`,
};
_thisModule.print = () => _thisModule.s;
_thisModule.gcu = `We set sail on this new stack because there is new knowledge to be gained, and new tools to be built, and they must be built and shared for the progress of all practitioners. For computational science, like geostatistics and all technology, has no conscience of its own. Whether it will become a force for good or ill depends on us, and only if we occupy a position of independence can we help decide whether this new ocean will be a sea of openness or a new terrifying theater of languages that forgot what they were for.

I do not say that we should or will go without the tools that others have built, any more than we go without the knowledge that others have shared, but I do say that geostatistics can be explored and mastered without feeding the fires of flamewar, without repeating the mistakes that man has made in extending his writ around this globe of ours.

There is no strife, no prejudice, no conflict of interest in a file that contains its own source. Its hazards are hostile to us all. Its conquest deserves the best of all practitioners, and its opportunity for open cooperation may never come again.

But why, some say, JavaScript? Why choose this as our language? And they may well ask, why climb the highest mountain? Why, thirty-four years after Deutsch and Journel, rewrite the FORTRAN? Why does Rice play Texas?

We choose to write JavaScript. We choose to write JavaScript... We choose to write JavaScript in this decade and do the other things, not because it is good, but because it is bad; because that goal will serve to organize and measure the best of our energies and skills, because that challenge is one that we are willing to accept, one we are unwilling to postpone, and one we intend to ship, and the others, too.`;

// ── shared cwd + path resolution ──

const _cwd = { value: '/projects/self' };
const _HOME = '/projects/self';

// Expand ~ and resolve relative paths against cwd. Used by open(), Path(), os._resolve().
function _resolvePath(p, pth) {
  if (!p || p === '.') return _cwd.value;
  // ~ expansion
  if (p === '~') return _HOME;
  if (p.startsWith('~/')) p = _HOME + p.slice(1);
  if (pth && !pth.isAbsolute(p)) return pth.join(_cwd.value, p);
  if (pth) return pth.normalize(p);
  // fallback without path utils: just basic join
  if (p.startsWith('/')) return p;
  return _cwd.value + ((_cwd.value === '/') ? '' : '/') + p;
}

// ── sys module ──

const _sysModule = {
  version: '3.12.0 (adder)',
  version_info: [3, 12, 0, 'adder', 0],
  platform: 'auditable',
  maxsize: Number.MAX_SAFE_INTEGER,
  path: ['.', 'lib', '/usr/lib/python'],
  modules: {},
  argv: [''],
  exit: (code) => { throw new AdderError('SystemExit', String(code ?? 0)); },
  stdout: { write(s) { return String(s).length; }, flush() {}, encoding: 'utf-8' },
  stderr: { write(s) { return String(s).length; }, flush() {}, encoding: 'utf-8' },
  getsizeof: () => 0,
  getrecursionlimit: () => 1000,
  setrecursionlimit: () => null,
  executable: '',
  prefix: '/usr',
  exec_prefix: '/usr',
  get home() { return _HOME; },
};

const adderModules = {
  math: _mathModule, json: _jsonModule, js: _jsModule, random: _randomModule,
  itertools: _itertoolsModule, functools: _functoolsModule,
  collections: _collectionsModule, re: _reModule, string: _stringModule,
  this: _thisModule, sys: _sysModule,
};

// ── filesystem exception hierarchy ──

const _excParents = {
  FileNotFoundError: 'OSError', FileExistsError: 'OSError',
  IsADirectoryError: 'OSError', NotADirectoryError: 'OSError',
  PermissionError: 'OSError', IOError: 'OSError',
};

function _mapVFSError(e) {
  const map = { ENOENT: 'FileNotFoundError', EEXIST: 'FileExistsError',
    EISDIR: 'IsADirectoryError', ENOTDIR: 'NotADirectoryError', EACCES: 'PermissionError' };
  return new AdderError(map[e?.code] || 'OSError', e?.message || String(e));
}

// ── file object ──

async function _createAdderFile(vfs, filePath, mode) {
  const isBinary = mode.includes('b');
  const isRead = mode[0] === 'r';
  const isAppend = mode[0] === 'a';

  let _content = null, _buffer = isBinary ? [] : '', _pos = 0, _closed = false;

  if (isRead || isAppend) {
    try {
      _content = await vfs.readFile(filePath, isBinary ? 'bytes' : undefined);
      if (isAppend) _buffer = isBinary ? [_content] : _content;
    } catch (e) {
      if (isRead) throw _mapVFSError(e);
      _content = isBinary ? new Uint8Array(0) : '';
    }
  }

  const f = {
    _path: filePath, _mode: mode,
    __adderClass__: isBinary ? 'BufferedIOBase' : 'TextIOWrapper',

    read(size) {
      if (_closed) throw new AdderError('ValueError', 'I/O operation on closed file');
      if (!isRead) throw new AdderError('IOError', 'not readable');
      if (size != null) { const chunk = _content.slice(_pos, _pos + size); _pos += size; return chunk; }
      const rest = _content.slice(_pos);
      _pos = typeof _content === 'string' ? _content.length : _content.byteLength;
      return rest;
    },

    readline() {
      if (_closed) throw new AdderError('ValueError', 'I/O operation on closed file');
      if (!isRead) throw new AdderError('IOError', 'not readable');
      if (typeof _content !== 'string') throw new AdderError('IOError', 'readline on binary file');
      const nl = _content.indexOf('\n', _pos);
      if (nl === -1) { const line = _content.slice(_pos); _pos = _content.length; return line; }
      const line = _content.slice(_pos, nl + 1);
      _pos = nl + 1;
      return line;
    },

    readlines() {
      if (_closed) throw new AdderError('ValueError', 'I/O operation on closed file');
      if (!isRead) throw new AdderError('IOError', 'not readable');
      const lines = [];
      const len = typeof _content === 'string' ? _content.length : _content.byteLength;
      while (_pos < len) lines.push(f.readline());
      return lines;
    },

    write(data) {
      if (_closed) throw new AdderError('ValueError', 'I/O operation on closed file');
      if (isRead) throw new AdderError('IOError', 'not writable');
      if (isBinary) {
        const chunk = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
        _buffer.push(chunk);
        return chunk.byteLength;
      }
      const s = String(data);
      _buffer += s;
      return s.length;
    },

    writelines(lines) { for (const line of pyIter(lines)) f.write(line); return null; },

    async close() {
      if (_closed) return;
      _closed = true;
      if (!isRead) {
        try {
          if (isBinary) {
            const total = _buffer.reduce((s, b) => s + b.byteLength, 0);
            const result = new Uint8Array(total);
            let off = 0;
            for (const b of _buffer) { result.set(b, off); off += b.byteLength; }
            await vfs.writeFile(filePath, result);
          } else {
            await vfs.writeFile(filePath, _buffer);
          }
        } catch (e) { throw _mapVFSError(e); }
      }
    },

    __enter__() { return f; },
    async __exit__() { await f.close(); return false; },
    __repr__() { return `<_io.${isBinary ? 'BufferedWriter' : 'TextIOWrapper'} name='${filePath}' mode='${mode}'>`; },
    __str__() { return f.__repr__(); },
    __bool__() { return true; },

    [Symbol.iterator]() {
      if (!isRead) throw new AdderError('IOError', 'not readable');
      let iterPos = _pos;
      const content = _content;
      return {
        next() {
          const len = typeof content === 'string' ? content.length : content.byteLength;
          if (iterPos >= len) return { done: true };
          if (typeof content !== 'string') {
            const rest = content.slice(iterPos);
            iterPos = content.byteLength;
            return { value: rest, done: false };
          }
          const nl = content.indexOf('\n', iterPos);
          if (nl === -1) {
            const line = content.slice(iterPos);
            iterPos = content.length;
            return line ? { value: line, done: false } : { done: true };
          }
          const line = content.slice(iterPos, nl + 1);
          iterPos = nl + 1;
          return { value: line, done: false };
        }
      };
    },

    get name() { return filePath; },
    get closed() { return _closed; },
  };

  return f;
}

// ── os module ──

function _createOsModule(getVfs, pth) {
  const _resolve = (p) => _resolvePath(p, pth);

  const osPath = {
    join: (...parts) => pth.join(...parts),
    dirname: (p) => pth.dirname(p),
    basename: (p) => pth.basename(p),
    splitext: (p) => { const ext = pth.extname(p); return ext ? [p.slice(0, -ext.length), ext] : [p, '']; },
    normpath: (p) => pth.normalize(p),
    relpath: (p, start) => pth.relative(start || _cwd.value, p),
    isabs: (p) => pth.isAbsolute(p),
    exists: async (p) => { try { await getVfs().stat(_resolve(p)); return true; } catch { return false; } },
    isfile: async (p) => { try { return (await getVfs().stat(_resolve(p))).type === 'file'; } catch { return false; } },
    isdir: async (p) => { try { return (await getVfs().stat(_resolve(p))).type === 'directory'; } catch { return false; } },
    getsize: async (p) => { try { return (await getVfs().stat(_resolve(p))).size; } catch (e) { throw _mapVFSError(e); } },
    sep: '/',
  };

  const os = {
    sep: '/', linesep: '\n', name: 'posix',
    path: osPath,

    listdir: async (p) => {
      try { return await getVfs().readdir(_resolve(p || '.')); }
      catch (e) { throw _mapVFSError(e); }
    },
    mkdir: async (p) => {
      try { await getVfs().mkdir(_resolve(p)); }
      catch (e) { throw _mapVFSError(e); }
    },
    makedirs: async (p, exist_ok) => {
      if (exist_ok != null && typeof exist_ok === 'object' && exist_ok._kw) exist_ok = exist_ok.exist_ok;
      const resolved = _resolve(p);
      const vfs = getVfs();
      let exists = false;
      try { await vfs.stat(resolved); exists = true; } catch {}
      if (exists && !exist_ok) throw new AdderError('FileExistsError', resolved);
      if (!exists) {
        try { await vfs.mkdir(resolved, { recursive: true }); }
        catch (e) { throw _mapVFSError(e); }
      }
    },
    remove: async (p) => {
      try { await getVfs().unlink(_resolve(p)); }
      catch (e) { throw _mapVFSError(e); }
    },
    unlink: async (p) => {
      try { await getVfs().unlink(_resolve(p)); }
      catch (e) { throw _mapVFSError(e); }
    },
    rmdir: async (p) => {
      try { await getVfs().rmdir(_resolve(p)); }
      catch (e) { throw _mapVFSError(e); }
    },
    rename: async (src, dst) => {
      try { await getVfs().rename(_resolve(src), _resolve(dst)); }
      catch (e) { throw _mapVFSError(e); }
    },
    stat: async (p) => {
      try {
        const info = await getVfs().stat(_resolve(p));
        return { st_size: info.size, st_mtime: info.modified?.getTime() / 1000 || 0,
                 st_mode: info.mode || 0, st_type: info.type };
      } catch (e) { throw _mapVFSError(e); }
    },
    getcwd: () => _cwd.value,
    chdir: (p) => { _cwd.value = _resolve(p); },

    walk: (top) => {
      const resolved = _resolve(top || '.');
      const vfs = getVfs();
      async function* gen(dir) {
        let entries;
        try { entries = await vfs.readdir(dir); } catch { return; }
        const dirs = [], files = [];
        for (const name of entries) {
          const full = dir === '/' ? '/' + name : dir + '/' + name;
          try {
            const info = await vfs.stat(full);
            if (info.type === 'directory') dirs.push(name);
            else files.push(name);
          } catch { files.push(name); }
        }
        yield [dir, dirs, files];
        for (const d of dirs) {
          yield* gen(dir === '/' ? '/' + d : dir + '/' + d);
        }
      }
      return { [Symbol.asyncIterator]() { return gen(resolved); } };
    },
  };

  return os;
}

// ── pathlib module ──

function _createPathClass(getVfs, pth) {
  function _Path(p) {
    if (typeof p === 'object' && p?._path) return p;
    let raw = String(p || '.');
    // expand ~ but don't resolve relative paths (pathlib keeps them relative)
    if (raw === '~') raw = _HOME;
    else if (raw.startsWith('~/')) raw = _HOME + raw.slice(1);
    const _p = pth.normalize(raw);
    // resolve for I/O — relative paths against cwd
    const _abs = () => pth.isAbsolute(_p) ? _p : pth.join(_cwd.value, _p);
    return {
      _path: _p,
      __adderClass__: 'PosixPath',
      get name() { return pth.basename(_p); },
      get stem() { const b = pth.basename(_p); const ext = pth.extname(_p); return ext ? b.slice(0, -ext.length) : b; },
      get suffix() { return pth.extname(_p); },
      get parent() { return _Path(pth.dirname(_p)); },
      get parts() { return _p === '/' ? ['/'] : ['/', ..._p.split('/').filter(Boolean)]; },

      __truediv__(other) { return _Path(pth.join(_p, String(other?._path || other))); },
      __str__() { return _p; },
      __repr__() { return `PosixPath('${_p}')`; },
      __eq__(other) { return _p === (other?._path || String(other)); },
      __hash__() { let h = 0; for (let i = 0; i < _p.length; i++) h = (h * 31 + _p.charCodeAt(i)) | 0; return h; },

      joinpath(...parts) { return _Path(pth.join(_p, ...parts.map(x => x?._path || String(x)))); },
      with_suffix(s) { const ext = pth.extname(_p); const base = ext ? _p.slice(0, -ext.length) : _p; return _Path(base + s); },
      with_name(n) { return _Path(pth.join(pth.dirname(_p), n)); },

      async read_text() { try { return await getVfs().readFile(_abs()); } catch (e) { throw _mapVFSError(e); } },
      async read_bytes() { try { return await getVfs().readFile(_abs(), 'bytes'); } catch (e) { throw _mapVFSError(e); } },
      async write_text(data) { try { await getVfs().writeFile(_abs(), String(data)); } catch (e) { throw _mapVFSError(e); } },
      async write_bytes(data) { try { await getVfs().writeFile(_abs(), data); } catch (e) { throw _mapVFSError(e); } },
      async exists() { return getVfs().exists(_abs()); },
      async is_file() { try { return (await getVfs().stat(_abs())).type === 'file'; } catch { return false; } },
      async is_dir() { try { return (await getVfs().stat(_abs())).type === 'directory'; } catch { return false; } },
      async mkdir(parents, exist_ok) {
        if (parents != null && typeof parents === 'object' && parents._kw) { exist_ok = parents.exist_ok; parents = parents.parents; }
        try { await getVfs().mkdir(_abs(), { recursive: !!parents }); }
        catch (e) { if (exist_ok && e?.code === 'EEXIST') return; throw _mapVFSError(e); }
      },
      async unlink() { try { await getVfs().unlink(_abs()); } catch (e) { throw _mapVFSError(e); } },
      async rename(target) { const t = target?._path || String(target); const ta = pth.isAbsolute(t) ? t : pth.join(_cwd.value, t); try { await getVfs().rename(_abs(), ta); return _Path(t); } catch (e) { throw _mapVFSError(e); } },
      async iterdir() {
        try {
          const entries = await getVfs().readdir(_abs());
          return entries.map(name => _Path(pth.join(_p, name)));
        } catch (e) { throw _mapVFSError(e); }
      },
      async glob(pattern) {
        try { return await getVfs().glob(pth.join(_abs(), pattern)); }
        catch (e) { throw _mapVFSError(e); }
      },
      async touch() { try { await getVfs().touch(_abs()); } catch (e) { throw _mapVFSError(e); } },
      async stat() {
        try {
          const info = await getVfs().stat(_abs());
          return { st_size: info.size, st_mtime: info.modified?.getTime() / 1000 || 0, st_mode: info.mode || 0, st_type: info.type };
        } catch (e) { throw _mapVFSError(e); }
      },
    };
  }
  return _Path;
}

// ── shutil module ──

function _createShutilModule(getVfs) {
  // Resolve user-facing paths (relative-to-cwd, ~ expansion) before
  // passing to VFS — `os` and `os.path` already do this via _resolve;
  // shutil/glob used to skip that step and the raw `data/foo.csv`
  // hit `vfs.resolve` which has no mount for non-absolute paths.
  const r = (p) => _resolvePath(p, _vfsPath);
  return {
    copy: async (src, dst) => { try { await getVfs().cp(r(src), r(dst)); } catch (e) { throw _mapVFSError(e); } },
    copy2: async (src, dst) => { try { await getVfs().cp(r(src), r(dst)); } catch (e) { throw _mapVFSError(e); } },
    copytree: async (src, dst) => { try { await getVfs().cp(r(src), r(dst), { recursive: true }); } catch (e) { throw _mapVFSError(e); } },
    rmtree: async (p) => { try { await getVfs().rm(r(p), { recursive: true }); } catch (e) { throw _mapVFSError(e); } },
    move: async (src, dst) => { try { await getVfs().rename(r(src), r(dst)); } catch (e) { throw _mapVFSError(e); } },
  };
}

// ── glob module ──

function _createGlobModule(getVfs) {
  return {
    glob: async (pattern) => {
      try { return await getVfs().glob(_resolvePath(pattern, _vfsPath)); }
      catch (e) { throw _mapVFSError(e); }
    },
  };
}

// ── fs module registration ──

let _adderVFS = null;
let _vfsPath = null;

function getAdderVFS() { return _adderVFS; }
function _getVfsPath() { return _vfsPath; }

function setAdderVFS(vfsInstance, pathUtils) {
  _adderVFS = vfsInstance;
  if (pathUtils) _vfsPath = pathUtils;
  // reset cwd and module cache for the new VFS
  _cwd.value = _HOME;
  for (const k of Object.keys(_sysModule.modules)) delete _sysModule.modules[k];
  // re-register modules if path available (allows calling setAdderVFS after initial load)
  if (_vfsPath) {
    delete adderModules.os;
    _ensureFsModules();
  }
}

function _ensureFsModules(pathUtils) {
  if (adderModules.os) return;
  if (pathUtils) _vfsPath = pathUtils;
  if (!_vfsPath) {
    try { if (typeof path !== 'undefined' && path.join) _vfsPath = path; } catch {}
  }
  if (!_vfsPath) return;

  const pth = _vfsPath;
  const getVfs = () => {
    if (!_adderVFS) throw new AdderError('RuntimeError', 'filesystem not available — call adder.setVFS(vfsInstance, pathUtils) first');
    return _adderVFS;
  };

  adderModules.os = _createOsModule(getVfs, pth);
  adderModules['os.path'] = adderModules.os.path;
  adderModules.pathlib = { Path: _createPathClass(getVfs, pth) };
  adderModules.shutil = _createShutilModule(getVfs);
  adderModules.glob = _createGlobModule(getVfs);
}

// ── builtins ──

function adderBuiltins(printFn) {
  const builtins = {
    print: (...args) => {
      let sep = ' ', end = '\n';
      // handle keyword args passed as last object with _kw marker
      if (args.length > 0 && args[args.length - 1]?._kw) {
        const kw = args.pop();
        if (kw.sep !== undefined) sep = kw.sep;
        if (kw.end !== undefined) end = kw.end;
      }
      printFn(args.map(pyStr).join(sep) + end);
      return null;
    },
    len: (obj) => {
      if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array) return obj.length;
      if (obj instanceof Map || obj instanceof Set) return obj.size;
      if (obj instanceof AdderRange) return obj.length;
      if (typeof obj === 'object' && obj !== null) {
        if (typeof obj.__len__ === 'function') return obj.__len__();
        if (typeof obj.length === 'number') return obj.length;
        return Object.keys(obj).length;
      }
      throw new AdderError('TypeError', `object of type '${pyTypeName(obj)}' has no len()`);
    },
    range: (a, b, c) => new AdderRange(a, b, c),
    int: (x, base) => { if (x === undefined) return 0; if (base !== undefined) { const n = parseInt(String(x), base); if (isNaN(n)) throw new AdderError('ValueError', `invalid literal for int() with base ${base}: ${pyRepr(String(x))}`); return n; } if (typeof x === 'string') { const n = parseInt(x); if (isNaN(n)) throw new AdderError('ValueError', `invalid literal for int() with base 10: ${pyRepr(x)}`); return n; } return Math.trunc(Number(x)); },
    float: (x) => { if (x === undefined) return 0.0; if (typeof x === 'string') { const s = x.trim().toLowerCase(); if (s === 'inf' || s === '+inf' || s === 'infinity') return Infinity; if (s === '-inf' || s === '-infinity') return -Infinity; if (s === 'nan') return NaN; if (s === '') throw new AdderError('ValueError', `could not convert string to float: ${pyRepr(x)}`); const n = Number(x); if (isNaN(n)) throw new AdderError('ValueError', `could not convert string to float: ${pyRepr(x)}`); return n; } return Number(x); },
    str: (x) => x === undefined ? '' : pyStr(x),
    bool: (x) => x === undefined ? false : pyBool(x),
    list: Object.assign(
      async (x) => x === undefined ? [] : await pyCollect(x),
      { _pyContainerType: 'list' },
    ),
    tuple: async (x) => x === undefined ? [] : await pyCollect(x),
    dict: async (x) => {
      if (x === undefined) return {};
      if (x instanceof Map) return Object.fromEntries(x);
      const arr = Array.isArray(x) ? x : await pyCollect(x);
      if (arr.length && Array.isArray(arr[0])) { const o = {}; for (const [k, v] of arr) o[k] = v; return o; }
      if (typeof x === 'object') return { ...x };
      throw new AdderError('TypeError', `cannot convert '${pyTypeName(x)}' to dict`);
    },
    set: async (x) => x === undefined ? new Set() : new Set(await pyCollect(x)),
    abs: (x) => (typeof x === 'object' && x !== null && typeof x.__abs__ === 'function') ? x.__abs__() : Math.abs(x),
    round: (x, n) => {
      if (n === undefined || n === 0) return Math.round(x);
      const f = Math.pow(10, n);
      return Math.round(x * f) / f;
    },
    max: async (...args) => {
      let key = null;
      if (args.length > 0 && args[args.length - 1]?._kw) { const kw = args.pop(); key = kw.key; }
      const items = args.length === 1 ? await pyCollect(args[0]) : args;
      if (items.length === 0) throw new AdderError('ValueError', 'max() arg is an empty sequence');
      return items.reduce((a, b) => (key ? key(b) > key(a) : b > a) ? b : a);
    },
    min: async (...args) => {
      let key = null;
      if (args.length > 0 && args[args.length - 1]?._kw) { const kw = args.pop(); key = kw.key; }
      const items = args.length === 1 ? await pyCollect(args[0]) : args;
      if (items.length === 0) throw new AdderError('ValueError', 'min() arg is an empty sequence');
      return items.reduce((a, b) => (key ? key(b) < key(a) : b < a) ? b : a);
    },
    sum: async (iterable, start) => { let s = start !== undefined ? start : 0; for (const v of await pyCollect(iterable)) s += v; return s; },
    sorted: async (iterable, key, reverse) => {
      if (key?._kw) { reverse = key.reverse; key = key.key; }
      const arr = await pyCollect(iterable);
      if (key) {
        const keyed = [];
        for (let i = 0; i < arr.length; i++) keyed.push([await key(arr[i]), i, arr[i]]);
        keyed.sort((a, b) => _pyCompare(a[0], b[0]));
        const result = keyed.map(x => x[2]);
        if (reverse) result.reverse();
        return result;
      }
      arr.sort(_pyCompare);
      if (reverse) arr.reverse();
      return arr;
    },
    reversed: async (iterable) => { const arr = await pyCollect(iterable); arr.reverse(); return arr; },
    enumerate: async (iterable, start) => {
      const result = [];
      let i = start || 0;
      for (const v of await pyCollect(iterable)) result.push([i++, v]);
      return result;
    },
    zip: async (...iterables) => {
      if (iterables.length === 0) return [];
      const arrs = []; for (const it of iterables) arrs.push(await pyCollect(it));
      const minLen = Math.min(...arrs.map(a => a.length));
      const result = [];
      for (let i = 0; i < minLen; i++) result.push(arrs.map(a => a[i]));
      return result;
    },
    map: async (fn, ...iterables) => {
      const arr0 = await pyCollect(iterables[0]);
      if (iterables.length === 1) { const r = []; for (const v of arr0) r.push(await fn(v)); return r; }
      const arrs = [arr0]; for (let i = 1; i < iterables.length; i++) arrs.push(await pyCollect(iterables[i]));
      const minLen = Math.min(...arrs.map(a => a.length));
      const result = [];
      for (let i = 0; i < minLen; i++) result.push(await fn(...arrs.map(a => a[i])));
      return result;
    },
    filter: async (fn, iterable) => {
      const result = [];
      for (const v of await pyCollect(iterable)) { if (fn ? pyBool(await fn(v)) : pyBool(v)) result.push(v); }
      return result;
    },
    any: async (iterable) => { for (const v of await pyCollect(iterable)) if (pyBool(v)) return true; return false; },
    all: async (iterable) => { for (const v of await pyCollect(iterable)) if (!pyBool(v)) return false; return true; },
    isinstance: (obj, typeOrTuple) => _pyIsInstance(obj, typeOrTuple),
    type: (obj) => {
      if (obj !== null && obj !== undefined && obj.__adderType__) return obj.__adderType__;
      const name = pyTypeName(obj);
      return _typeObjects[name] || name;
    },
    hasattr: (obj, name) => { try { adderGetAttr(obj, name); return true; } catch { return false; } },
    getattr: (obj, name, def) => { try { return adderGetAttr(obj, name); } catch { if (def !== undefined) return def; throw new AdderError('AttributeError', `'${pyTypeName(obj)}' object has no attribute '${name}'`); } },
    setattr: (obj, name, value) => { obj[name] = value; return null; },
    delattr: (obj, name) => { delete obj[name]; return null; },
    property: (fget) => {
      const prop = { __property__: true, fget, fset: null };
      prop.setter = (fset) => { prop.fset = fset; return prop; };
      return prop;
    },
    staticmethod: (fn) => ({ __staticmethod__: true, fn }),
    classmethod: (fn) => ({ __classmethod__: true, fn }),
    complex: (real, imag) => new Complex(real ?? 0, imag ?? 0),
    callable: (obj) => typeof obj === 'function',
    chr: (n) => String.fromCodePoint(n),
    ord: (c) => { if (typeof c !== 'string' || c.length !== 1) throw new AdderError('TypeError', 'ord() expected a character'); return c.codePointAt(0); },
    hex: (n) => { const v = Math.trunc(n); return v < 0 ? '-0x' + (-v).toString(16) : '0x' + v.toString(16); },
    oct: (n) => { const v = Math.trunc(n); return v < 0 ? '-0o' + (-v).toString(8) : '0o' + v.toString(8); },
    bin: (n) => { const v = Math.trunc(n); return v < 0 ? '-0b' + (-v).toString(2) : '0b' + v.toString(2); },
    repr: pyRepr,
    format: (value, spec) => pyFormatValue(value, spec || ''),
    pow: (x, y, mod) => mod !== undefined ? _modPow(x, y, mod) : Math.pow(x, y),
    divmod: (a, b) => [Math.floor(a / b), ((a % b) + b) % b],
    id: (obj) => { if (typeof obj === 'object' && obj !== null) { if (!obj.__id__) obj.__id__ = ++_idCounter; return obj.__id__; } return 0; },
    hash: (obj) => { if (typeof obj === 'number') return obj; if (typeof obj === 'string') { let h = 0; for (let i = 0; i < obj.length; i++) h = (h * 31 + obj.charCodeAt(i)) | 0; return h; } return 0; },
    iter: (obj) => pyIter(obj),
    next: (iter, def) => { const r = iter.next(); if (r.done) { if (def !== undefined) return def; throw new AdderError('StopIteration', ''); } return r.value; },
    input: () => { throw new AdderError('NotImplementedError', 'input() is not supported in the browser'); },
    issubclass: () => false,
    vars: (obj) => obj ? { ...obj } : {},
    dir: (obj) => obj ? Object.keys(obj).sort() : [],
    object: () => ({}),
    super: () => { throw new AdderError('RuntimeError', 'super() is handled by the evaluator'); },
    ValueError: (msg) => new AdderError('ValueError', msg),
    TypeError: (msg) => new AdderError('TypeError', msg),
    KeyError: (msg) => new AdderError('KeyError', msg),
    IndexError: (msg) => new AdderError('IndexError', msg),
    AttributeError: (msg) => new AdderError('AttributeError', msg),
    RuntimeError: (msg) => new AdderError('RuntimeError', msg),
    StopIteration: (msg) => new AdderError('StopIteration', msg || ''),
    ZeroDivisionError: (msg) => new AdderError('ZeroDivisionError', msg),
    NotImplementedError: (msg) => new AdderError('NotImplementedError', msg),
    AssertionError: (msg) => new AdderError('AssertionError', msg),
    Exception: (msg) => new AdderError('Exception', msg),
    FileNotFoundError: (msg) => new AdderError('FileNotFoundError', msg),
    FileExistsError: (msg) => new AdderError('FileExistsError', msg),
    IsADirectoryError: (msg) => new AdderError('IsADirectoryError', msg),
    NotADirectoryError: (msg) => new AdderError('NotADirectoryError', msg),
    PermissionError: (msg) => new AdderError('PermissionError', msg),
    OSError: (msg) => new AdderError('OSError', msg),
    IOError: (msg) => new AdderError('IOError', msg),
    open: async (pathOrObj, mode) => {
      if (!_adderVFS) throw new AdderError('RuntimeError', 'filesystem not available — call adder.setVFS(vfsInstance, pathUtils) first');
      const raw = pathOrObj?._path ? pathOrObj._path : String(pathOrObj);
      const p = _resolvePath(raw, _vfsPath);
      return _createAdderFile(_adderVFS, p, mode || 'r');
    },
    eval: _builtinEval,
    exec: _builtinExec,
    super: _builtinSuper,
  };
  // Mark conversion builtins as type objects for isinstance()/type()
  for (const name of ['int', 'float', 'str', 'bool', 'list', 'tuple', 'dict', 'set', 'range', 'object', 'complex']) {
    if (builtins[name]) { builtins[name]._pyName = name; builtins[name]._pyClass = true; builtins[name].__name__ = name; _typeObjects[name] = builtins[name]; }
  }
  for (const name of ['ValueError', 'TypeError', 'KeyError', 'IndexError', 'AttributeError',
                       'RuntimeError', 'StopIteration', 'ZeroDivisionError', 'NotImplementedError',
                       'AssertionError', 'Exception', 'FileNotFoundError', 'FileExistsError',
                       'IsADirectoryError', 'NotADirectoryError', 'PermissionError', 'OSError', 'IOError']) {
    if (builtins[name]) { builtins[name]._pyName = name; builtins[name]._pyClass = true; _typeObjects[name] = builtins[name]; }
  }
  return builtins;
}

// Sentinel functions for eval/exec/super — handled specially by the evaluator
const _builtinEval = Object.assign(() => {}, { _pyName: 'eval', _sentinel: 'eval' });
const _builtinExec = Object.assign(() => {}, { _pyName: 'exec', _sentinel: 'exec' });
const _builtinSuper = Object.assign(() => {}, { _pyName: 'super', _sentinel: 'super' });

function _pyIsInstance(obj, typeOrTuple) {
  const types = Array.isArray(typeOrTuple) ? typeOrTuple : [typeOrTuple];
  const name = pyTypeName(obj);
  for (const t of types) {
    if (typeof t === 'string') {
      if (name === t) return true;
    } else if (typeof t === 'function') {
      if (t._pyClass && t._pyName) {
        // type object — match by name
        if (name === t._pyName) return true;
        // walk MRO of the object's adder type
        const objType = obj?.__adderType__;
        if (objType?._pyMRO) {
          for (const mroClass of objType._pyMRO) {
            if (mroClass === t || mroClass._pyName === t._pyName) return true;
          }
        }
        // walk exception parent chain
        if (obj instanceof AdderError) {
          let pt = _excParents[obj.pyType];
          while (pt) { if (pt === t._pyName) return true; pt = _excParents[pt]; }
        }
      } else {
        try { if (obj instanceof t) return true; } catch { /* arrow fn without prototype */ }
      }
    } else if (t === null) {
      if (obj === null) return true;
    }
  }
  return false;
}

function _modPow(base, exp, mod) {
  let result = 1;
  base = ((base % mod) + mod) % mod;
  while (exp > 0) {
    if (exp % 2 === 1) result = (result * base) % mod;
    exp = Math.floor(exp / 2);
    base = (base * base) % mod;
  }
  return result;
}

let _idCounter = 0;

// -- eval.js --

// adder v2 — tree-walking evaluator
// Evaluates AST nodes produced by the parser. All values are native JS values.



// ── scope ──

class AdderScope {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
    this.globals = new Set();
    this.nonlocals = new Set();
  }
  get(name) {
    if (this.globals.has(name)) return this._getGlobal(name);
    if (this.nonlocals.has(name)) return this._getEnclosing(name);
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new AdderError('NameError', `name '${name}' is not defined`);
  }
  set(name, value) {
    if (this.globals.has(name)) { this._setGlobal(name, value); return; }
    if (this.nonlocals.has(name)) { this._setEnclosing(name, value); return; }
    this.vars.set(name, value);
  }
  has(name) {
    if (this.vars.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
  delete(name) { this.vars.delete(name); }
  _getGlobal(name) {
    let s = this; while (s.parent) s = s.parent;
    if (s.vars.has(name)) return s.vars.get(name);
    throw new AdderError('NameError', `name '${name}' is not defined`);
  }
  _setGlobal(name, value) { let s = this; while (s.parent) s = s.parent; s.vars.set(name, value); }
  _getEnclosing(name) {
    let s = this.parent;
    while (s) { if (s.vars.has(name)) return s.vars.get(name); s = s.parent; }
    throw new AdderError('NameError', `name '${name}' is not defined`);
  }
  _setEnclosing(name, value) {
    let s = this.parent;
    while (s) { if (s.vars.has(name)) { s.vars.set(name, value); return; } s = s.parent; }
    throw new AdderError('NameError', `name '${name}' is not defined`);
  }
}

// ── control flow signals ──

class _BreakSignal { }
class _ContinueSignal { }
class _ReturnSignal { constructor(value) { this.value = value; } }

// ── run options (sandbox) ──
// Set per call by the runner (run / evalExpr / compile().run) and restored on
// exit, the way the VFS is. `host: false` hides the `js` module; `remote:
// false` turns off every path that would call fetch(); `budget` stops runaway
// code at statement boundaries and offers a per-statement hook (the trace a
// host like golem hangs its "line + changed names" table from).
let _runOpts = { host: true, remote: true };
function _getRunOptions() { return _runOpts; }
function _setRunOptions(o) { const prev = _runOpts; _runOpts = o || { host: true, remote: true }; return prev; }

// budget: { limit, deadline, onStep, count, spent } — one increment per statement
// node, a wall-clock check every 256, and once exceeded it stays exceeded (code
// that catches BudgetExceeded cannot resume: the next boundary raises again).
let _budget = null;
function _setBudget(b) { const prev = _budget; _budget = b; return prev; }
function _makeBudget(spec) {
  if (!spec) return null;
  const steps = spec.steps != null ? Math.max(1, +spec.steps) : Infinity;
  const ms = spec.ms != null ? Math.max(1, +spec.ms) : Infinity;
  return { limit: steps, deadline: ms === Infinity ? Infinity : _now() + ms, ms, onStep: typeof spec.onStep === 'function' ? spec.onStep : null, count: 0, spent: null };
}
const _now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const _STMT = new Set(['Expr', 'Assign', 'AugAssign', 'AnnAssign', 'If', 'For', 'While', 'With', 'FunctionDef', 'AsyncFunctionDef', 'ClassDef', 'Return', 'Pass', 'Break', 'Continue', 'Import', 'ImportFrom', 'Raise', 'Try', 'Assert', 'Delete', 'Global', 'Nonlocal']);
// the read-only view of the current frame handed to onStep — one object, re-aimed
// per statement (not a copy; the caller copies what it wants)
const _view = {
  scope: null,
  has(name) { return this.scope.vars.has(name); },
  get(name) { return this.scope.vars.get(name); },
  names() { return [...this.scope.vars.keys()]; },
  entries() { return [...this.scope.vars]; },
};
function _tick(node, scope) {
  const b = _budget;
  if (b.spent) throw new AdderError('BudgetExceeded', b.spent, node.line);
  b.count++;
  if (b.count > b.limit) { b.spent = `${b.limit} statements`; throw new AdderError('BudgetExceeded', b.spent, node.line); }
  if (b.deadline !== Infinity && (b.count & 255) === 0 && _now() > b.deadline) { b.spent = `${b.ms} ms`; throw new AdderError('BudgetExceeded', b.spent, node.line); }
  if (b.onStep) { _view.scope = scope; b.onStep({ line: node.line, kind: node.type, scope: _view }); }
}

// ── module registry (sandbox) ──
// A host with no `window` (a worker, a Node test) makes a module importable
// here; `_resolveModule` looks here FIRST, before the built-ins and before
// window._auditableExtensions. Process-wide, like adderModules. Dotted names
// walk into the registered object (`from natra.linalg import inv` → mod.linalg).
const _registered = new Map();
function registerModule(name, mod) {
  if (typeof name !== 'string' || !name) throw new TypeError('registerModule: name must be a non-empty string');
  if (mod == null) throw new TypeError(`registerModule('${name}'): module must be an object`);
  _registered.set(name, mod);
  return mod;
}
function unregisterModule(name) { return _registered.delete(name); }
function _walkDotted(root, name) {
  const dot = name.indexOf('.');
  if (dot === -1) return null;
  let mod = root(name.slice(0, dot));
  if (!mod) return null;
  for (const part of name.slice(dot + 1).split('.')) {
    if (mod == null || (typeof mod !== 'object' && typeof mod !== 'function')) return null;
    mod = mod[part];
  }
  return mod && (typeof mod === 'object' || typeof mod === 'function') ? mod : null;
}

// ── evaluator ──

async function adderEval(node, scope) {
  if (!node) return null;
  if (_budget !== null && node.line != null && _STMT.has(node.type)) _tick(node, scope);
  switch (node.type) {
    case 'Module': return _evalModule(node, scope);
    case 'Expr': return adderEval(node.value, scope);
    case 'Constant': {
      const v = node.value;
      if (v && typeof v === 'object' && v._complex) return new Complex(0, v.imag);
      return v;
    }
    case 'Name': return scope.get(node.id);
    case 'Pass': return null;
    case 'Break': throw new _BreakSignal();
    case 'Continue': throw new _ContinueSignal();
    case 'Return': throw new _ReturnSignal(node.value ? await adderEval(node.value, scope) : null);

    // ── assignments ──
    case 'Assign': {
      const value = await adderEval(node.value, scope);
      for (const target of node.targets) await _assignTarget(target, value, scope);
      return null;
    }
    case 'AugAssign': {
      const current = await _evalTarget(node.target, scope);
      const value = await adderEval(node.value, scope);
      const iDunder = _iDunders[node.op];
      let result;
      if (iDunder && current !== null && typeof current === 'object' && typeof current[iDunder] === 'function') {
        result = current[iDunder](value);
      } else {
        result = _binOp(node.op, current, value, node.line);
      }
      await _assignTarget(node.target, result, scope);
      return null;
    }
    case 'AnnAssign': {
      if (node.value) {
        const value = await adderEval(node.value, scope);
        await _assignTarget(node.target, value, scope);
      }
      return null;
    }

    // ── control flow ──
    case 'If': {
      const test = await adderEval(node.test, scope);
      if (pyBool(test)) { for (const s of node.body) await adderEval(s, scope); }
      else { for (const s of node.orelse) await adderEval(s, scope); }
      return null;
    }
    case 'For': return _evalFor(node, scope);
    case 'While': return _evalWhile(node, scope);
    case 'With': return _evalWith(node, scope);

    // ── functions / classes ──
    case 'FunctionDef': case 'AsyncFunctionDef': {
      let fn = _makeFunction(node, scope);
      for (let i = node.decorators.length - 1; i >= 0; i--) {
        const dec = await adderEval(node.decorators[i], scope);
        fn = await _callValue(dec, [fn], [], node.line);
      }
      fn._pyName = node.name;
      scope.set(node.name, fn);
      return null;
    }
    case 'ClassDef': return _evalClass(node, scope);
    case 'Lambda': return _makeLambda(node, scope);

    // ── exceptions ──
    case 'Try': return _evalTry(node, scope);
    case 'Raise': {
      const exc = node.exc ? await adderEval(node.exc, scope) : null;
      if (exc instanceof AdderError) throw exc;
      if (exc instanceof Error) throw exc;
      if (typeof exc === 'function') throw await _callValue(exc, [], [], node.line);
      throw new AdderError('RuntimeError', exc ? pyStr(exc) : 're-raise outside except', node.line);
    }
    case 'Assert': {
      const test = await adderEval(node.test, scope);
      if (!pyBool(test)) {
        const msg = node.msg ? await adderEval(node.msg, scope) : 'assertion failed';
        throw new AdderError('AssertionError', pyStr(msg), node.line);
      }
      return null;
    }

    // ── scope declarations ──
    case 'Global': { for (const n of node.names) scope.globals.add(n); return null; }
    case 'Nonlocal': { for (const n of node.names) scope.nonlocals.add(n); return null; }
    case 'Delete': { for (const t of node.targets) await _deleteTarget(t, scope); return null; }

    // ── imports ──
    case 'Import': return _evalImport(node, scope);
    case 'ImportFrom': return _evalImportFrom(node, scope);

    // ── expressions ──
    case 'BinOp': {
      const left = await adderEval(node.left, scope);
      const right = await adderEval(node.right, scope);
      return _binOp(node.op, left, right, node.line);
    }
    case 'UnaryOp': {
      const operand = await adderEval(node.operand, scope);
      if (node.op === '-') return typeof operand === 'number' ? -operand : (typeof operand?.__neg__ === 'function' ? operand.__neg__() : -operand);
      if (node.op === '+') return +operand;
      if (node.op === '~') return typeof operand?.__invert__ === 'function' ? operand.__invert__() : ~operand;
      if (node.op === 'not') return !pyBool(operand);
      throw new AdderError('TypeError', `unsupported unary op: ${node.op}`, node.line);
    }
    case 'BoolOp': {
      if (node.op === 'or') {
        let result;
        for (const v of node.values) { result = await adderEval(v, scope); if (pyBool(result)) return result; }
        return result;
      }
      let result;
      for (const v of node.values) { result = await adderEval(v, scope); if (!pyBool(result)) return result; }
      return result;
    }
    case 'Compare': {
      let left = await adderEval(node.left, scope);
      // single comparison: return dunder result directly (e.g. BooleanMask from Series.__gt__)
      if (node.ops.length === 1) {
        const right = await adderEval(node.comparators[0], scope);
        return _compareOp(node.ops[0], left, right);
      }
      // chained comparisons: coerce to boolean (a < b < c → a < b and b < c)
      for (let i = 0; i < node.ops.length; i++) {
        const right = await adderEval(node.comparators[i], scope);
        if (!_compareOp(node.ops[i], left, right)) return false;
        left = right;
      }
      return true;
    }
    case 'IfExp': {
      const test = await adderEval(node.test, scope);
      return pyBool(test) ? adderEval(node.body, scope) : adderEval(node.orelse, scope);
    }

    // ── calls ──
    case 'Call': return _evalCall(node, scope);

    // ── attribute / subscript ──
    case 'Attribute': {
      const obj = await adderEval(node.value, scope);
      return adderGetAttr(obj, node.attr);
    }
    case 'Subscript': return _evalSubscript(node, scope);

    // ── collections ──
    case 'List': { const elts = []; for (const e of node.elts) { if (e.type === 'Starred') { for (const v of pyIter(await adderEval(e.value, scope))) elts.push(v); } else elts.push(await adderEval(e, scope)); } return elts; }
    case 'Tuple': { const elts = []; for (const e of node.elts) { if (e.type === 'Starred') { for (const v of pyIter(await adderEval(e.value, scope))) elts.push(v); } else elts.push(await adderEval(e, scope)); } return elts; }
    case 'Dict': {
      const allStringKeys = node.keys.every(k => k && (k.type === 'Constant' && typeof k.value === 'string') || k === null);
      if (allStringKeys) {
        const obj = {};
        for (let i = 0; i < node.keys.length; i++) {
          if (node.keys[i] === null) { // **unpack
            const src = await adderEval(node.values[i], scope);
            if (src instanceof Map) { for (const [k, v] of src) obj[k] = v; }
            else { Object.assign(obj, src); }
          } else {
            obj[await adderEval(node.keys[i], scope)] = await adderEval(node.values[i], scope);
          }
        }
        return obj;
      }
      const map = new Map();
      for (let i = 0; i < node.keys.length; i++) {
        if (node.keys[i] === null) {
          const src = await adderEval(node.values[i], scope);
          if (src instanceof Map) { for (const [k, v] of src) map.set(k, v); }
          else { for (const k of Object.keys(src)) map.set(k, src[k]); }
        } else {
          map.set(await adderEval(node.keys[i], scope), await adderEval(node.values[i], scope));
        }
      }
      return map;
    }
    case 'Set': {
      const s = new Set();
      for (const e of node.elts) s.add(await adderEval(e, scope));
      return s;
    }

    // ── comprehensions ──
    case 'ListComp': return _evalComp(node, scope, 'list');
    case 'SetComp': return _evalComp(node, scope, 'set');
    case 'DictComp': return _evalComp(node, scope, 'dict');
    case 'GeneratorExp': return _evalGenExpr(node, scope);

    // ── f-strings ──
    case 'JoinedStr': {
      let result = '';
      for (const v of node.values) result += await adderEval(v, scope);
      return result;
    }
    case 'FormattedValue': {
      let val = await adderEval(node.value, scope);
      if (node.conversion === 'r') val = pyRepr(val);
      else if (node.conversion === 's') val = pyStr(val);
      return node.formatSpec ? pyFormatValue(val, node.formatSpec) : pyStr(val);
    }

    // ── await ──
    case 'Await': return await (await adderEval(node.value, scope));
    case 'Yield': throw new AdderError('SyntaxError', 'yield outside function', node.line);
    case 'YieldFrom': throw new AdderError('SyntaxError', 'yield outside function', node.line);
    case 'NamedExpr': { const value = await adderEval(node.value, scope); scope.set(node.target.id, value); return value; }

    // ── starred (in expression context) ──
    case 'Starred': return await adderEval(node.value, scope);

    // ── slice (standalone) ──
    case 'Slice': return { _slice: true, lower: node.lower ? await adderEval(node.lower, scope) : null, upper: node.upper ? await adderEval(node.upper, scope) : null, step: node.step ? await adderEval(node.step, scope) : null };

    default:
      throw new AdderError('RuntimeError', `Unknown AST node type: ${node.type}`, node.line);
  }
}

// ── module execution ──

async function _evalModule(node, scope) {
  let lastExpr = undefined;
  for (let i = 0; i < node.body.length; i++) {
    const stmt = node.body[i];
    if (i === node.body.length - 1 && stmt.type === 'Expr') {
      if (_budget !== null) _tick(stmt, scope);
      lastExpr = await adderEval(stmt.value, scope);
    } else {
      await adderEval(stmt, scope);
    }
  }
  return lastExpr;
}

// ── assignment / target helpers ──

async function _assignTarget(target, value, scope) {
  switch (target.type) {
    case 'Name': scope.set(target.id, value); break;
    case 'Attribute': {
      const obj = await adderEval(target.value, scope);
      // check for @property setter on prototype chain (async — can't use JS setter directly)
      for (let p = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
        const d = Object.getOwnPropertyDescriptor(p, target.attr);
        if (d?.set?._pyFset) { await d.set._pyFset(obj, value); return null; }
        if (d) break;
      }
      obj[target.attr] = value;
      break;
    }
    case 'Subscript': {
      const obj = await adderEval(target.value, scope);
      if (target.slice.type === 'Slice') {
        const lower = target.slice.lower ? await adderEval(target.slice.lower, scope) : null;
        const upper = target.slice.upper ? await adderEval(target.slice.upper, scope) : null;
        const step = target.slice.step ? await adderEval(target.slice.step, scope) : null;
        if (typeof obj?.__setitem__ === 'function') {
          await obj.__setitem__({ _slice: true, lower, upper, step }, value);
        } else {
          _applySliceAssign(obj, lower, upper, step, value, target.line);
        }
        break;
      }
      if (target.slice.type === 'Tuple') {
        const key = [];
        for (const elt of target.slice.elts) {
          key.push(await _evalSliceElt(elt, scope));
        }
        if (obj && typeof obj.__setitem__ === 'function') {
          await obj.__setitem__(key, value);
          break;
        }
        // Generic 2D-ndarray-shape tuple setitem — same shape support
        // as the read path. Lets learn / scitra outputs accept
        // `x[:, 1] = 0.0` etc. without per-library setters.
        if (obj && Array.isArray(obj.shape) && obj.shape.length === 2
            && (obj.data instanceof Float64Array || obj instanceof Float64Array)) {
          const [n, m] = obj.shape;
          const d = obj instanceof Float64Array ? obj : obj.data;
          const rk = key[0], ck = key[1];
          const _bcast = (write, len) => {
            if (value != null && typeof value !== 'string'
                && typeof value[Symbol.iterator] === 'function') {
              const flat = [...value];
              if (flat.length !== len) {
                throw new AdderError('ValueError', `cannot broadcast ${flat.length} values to ${len} positions`);
              }
              for (let i = 0; i < len; i++) write(i, flat[i]);
            } else {
              for (let i = 0; i < len; i++) write(i, value);
            }
          };
          if (typeof rk === 'number' && typeof ck === 'number') {
            d[(rk < 0 ? n + rk : rk) * m + (ck < 0 ? m + ck : ck)] = value;
            break;
          }
          if (rk && rk._slice && typeof ck === 'number') {
            const lo = rk.lower != null ? rk.lower : 0;
            const hi = rk.upper != null ? Math.min(rk.upper, n) : n;
            const j = ck < 0 ? m + ck : ck;
            _bcast((i, v) => { d[(lo + i) * m + j] = v; }, hi - lo);
            break;
          }
          if (typeof rk === 'number' && ck && ck._slice) {
            const i = rk < 0 ? n + rk : rk;
            const lo = ck.lower != null ? ck.lower : 0;
            const hi = ck.upper != null ? Math.min(ck.upper, m) : m;
            _bcast((k, v) => { d[i * m + lo + k] = v; }, hi - lo);
            break;
          }
        }
        throw new AdderError('TypeError',
          `'${pyTypeName(obj)}' object does not support tuple item assignment`,
          target.line);
      }
      const key = await adderEval(target.slice, scope);
      if (obj instanceof Map) obj.set(key, value);
      else if (typeof obj?.__setitem__ === 'function') obj.__setitem__(key, value);
      else if (Array.isArray(obj) || obj instanceof Uint8Array) {
        // Python-style negative indexing on write: arr[-1] is the last
        // element. Without the translation JS just stores a string-keyed
        // '-1' property and the positional slot is left untouched —
        // silently breaks `arr[i], arr[-j] = arr[-j], arr[i]` swaps.
        const idx = key < 0 ? obj.length + key : key;
        obj[idx] = value;
      }
      else obj[key] = value;
      break;
    }
    case 'Tuple': case 'List': {
      const items = [...pyIter(value)];
      const starIdx = target.elts.findIndex(e => e.type === 'Starred');
      if (starIdx >= 0) {
        // starred unpacking
        const before = target.elts.slice(0, starIdx);
        const after = target.elts.slice(starIdx + 1);
        for (let i = 0; i < before.length; i++) await _assignTarget(before[i], items[i], scope);
        const starItems = items.slice(before.length, items.length - after.length);
        await _assignTarget(target.elts[starIdx].value, starItems, scope);
        for (let i = 0; i < after.length; i++) await _assignTarget(after[i], items[items.length - after.length + i], scope);
      } else {
        for (let i = 0; i < target.elts.length; i++) await _assignTarget(target.elts[i], items[i], scope);
      }
      break;
    }
    case 'Starred': await _assignTarget(target.value, value, scope); break;
    default: throw new AdderError('RuntimeError', `Cannot assign to ${target.type}`);
  }
}

async function _evalTarget(target, scope) {
  if (target.type === 'Name') return scope.get(target.id);
  if (target.type === 'Attribute') { const obj = await adderEval(target.value, scope); return obj[target.attr]; }
  if (target.type === 'Subscript') { return _evalSubscript(target, scope); }
  throw new AdderError('RuntimeError', `Cannot read target ${target.type}`);
}

async function _deleteTarget(target, scope) {
  if (target.type === 'Name') { scope.delete(target.id); return; }
  if (target.type === 'Attribute') { const obj = await adderEval(target.value, scope); delete obj[target.attr]; return; }
  if (target.type === 'Subscript') {
    const obj = await adderEval(target.value, scope);
    if (target.slice.type === 'Slice') {
      const lower = target.slice.lower ? await adderEval(target.slice.lower, scope) : null;
      const upper = target.slice.upper ? await adderEval(target.slice.upper, scope) : null;
      const step = target.slice.step ? await adderEval(target.slice.step, scope) : null;
      if (typeof obj?.__delitem__ === 'function') {
        await obj.__delitem__({ _slice: true, lower, upper, step });
      } else {
        _applySliceDelete(obj, lower, upper, step, target.line);
      }
      return;
    }
    const key = await adderEval(target.slice, scope);
    if (obj instanceof Map) obj.delete(key);
    else if (Array.isArray(obj)) {
      const idx = key < 0 ? obj.length + key : key;
      obj.splice(idx, 1);
    }
    else delete obj[key];
    return;
  }
}

// ── binary operations ──

function _binOp(op, left, right, line) {
  // check dunder methods (left operand first, then reflected on right)
  if (left !== null && typeof left === 'object') {
    const dunder = _dunders[op];
    if (dunder && typeof left[dunder] === 'function') return left[dunder](right);
  }
  if (right !== null && typeof right === 'object') {
    const rdunder = _rdunders[op];
    if (rdunder && typeof right[rdunder] === 'function') return right[rdunder](left);
  }
  switch (op) {
    case '+':
      if (typeof left === 'number' && typeof right === 'number') return left + right;
      if (typeof left === 'string' && typeof right === 'string') return left + right;
      if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
      throw new AdderError('TypeError', `unsupported operand type(s) for +: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '-':
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      throw new AdderError('TypeError', `unsupported operand type(s) for -: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '*':
      if (typeof left === 'number' && typeof right === 'number') return left * right;
      if (typeof left === 'string' && typeof right === 'number') return left.repeat(right);
      if (typeof left === 'number' && typeof right === 'string') return right.repeat(left);
      if (Array.isArray(left) && typeof right === 'number') { const r = []; for (let i = 0; i < right; i++) r.push(...left); return r; }
      throw new AdderError('TypeError', `unsupported operand type(s) for *: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '/':
      if (right === 0) throw new AdderError('ZeroDivisionError', 'division by zero', line);
      if (typeof left === 'number' && typeof right === 'number') return left / right;
      throw new AdderError('TypeError', `unsupported operand type(s) for /: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '//':
      if (right === 0) throw new AdderError('ZeroDivisionError', 'integer division or modulo by zero', line);
      if (typeof left === 'number' && typeof right === 'number') return Math.floor(left / right);
      throw new AdderError('TypeError', `unsupported operand type(s) for //: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '%': if (right === 0) throw new AdderError('ZeroDivisionError', 'integer division or modulo by zero', line);
      if (typeof left === 'string') return _strPercentFormat(left, Array.isArray(right) ? right : [right]);
      if (typeof left === 'number' && typeof right === 'number') return ((left % right) + right) % right;
      throw new AdderError('TypeError', `unsupported operand type(s) for %: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '**':
      if (typeof left === 'number' && typeof right === 'number') return Math.pow(left, right);
      throw new AdderError('TypeError', `unsupported operand type(s) for **: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    case '&': return left & right;
    case '|': return left | right;
    case '^': return left ^ right;
    case '<<': return left << right;
    case '>>': return left >> right;
    case '@': throw new AdderError('TypeError', `unsupported operand type(s) for @: '${pyTypeName(left)}' and '${pyTypeName(right)}'`, line);
    default: throw new AdderError('TypeError', `unsupported operator: ${op}`, line);
  }
}

function _strPercentFormat(fmt, args) {
  // Python % formatting: "%s %d" % (arg1, arg2)
  let i = 0;
  return fmt.replace(/%([sd%fegx])/g, (_, code) => {
    if (code === '%') return '%';
    return pyStr(args[i++]);
  });
}

const _dunders = {
  '+': '__add__', '-': '__sub__', '*': '__mul__', '/': '__truediv__',
  '//': '__floordiv__', '%': '__mod__', '**': '__pow__',
  '&': '__and__', '|': '__or__', '^': '__xor__',
  '<<': '__lshift__', '>>': '__rshift__', '@': '__matmul__',
};

const _rdunders = {
  '+': '__radd__', '-': '__rsub__', '*': '__rmul__', '/': '__rtruediv__',
  '//': '__rfloordiv__', '%': '__rmod__', '**': '__rpow__', '@': '__rmatmul__',
};

const _iDunders = {
  '+': '__iadd__', '-': '__isub__', '*': '__imul__', '/': '__itruediv__',
  '//': '__ifloordiv__', '%': '__imod__', '**': '__ipow__',
  '&': '__iand__', '|': '__ior__', '^': '__ixor__',
  '<<': '__ilshift__', '>>': '__irshift__', '@': '__imatmul__',
};

// ── comparison ──

function _compareOp(op, left, right) {
  switch (op) {
    case '==': return _pyEq(left, right);
    case '!=': return typeof left?.__ne__ === 'function' ? left.__ne__(right) : !_pyEq(left, right);
    case '<': return typeof left?.__lt__ === 'function' ? left.__lt__(right) : left < right;
    case '<=': return typeof left?.__le__ === 'function' ? left.__le__(right) : left <= right;
    case '>': return typeof left?.__gt__ === 'function' ? left.__gt__(right) : left > right;
    case '>=': return typeof left?.__ge__ === 'function' ? left.__ge__(right) : left >= right;
    case 'in': return _pyIn(right, left);
    case 'not in': return !_pyIn(right, left);
    case 'is': return left === right;
    case 'is not': return left !== right;
    default: throw new AdderError('TypeError', `unsupported comparison: ${op}`);
  }
}

function _pyEq(a, b) {
  if (a === b) return true;
  if (typeof a?.__eq__ === 'function') return a.__eq__(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_pyEq(a[i], b[i])) return false;
    return true;
  }
  return false;
}

function _pyIn(container, value) {
  if (typeof container === 'string') return container.includes(String(value));
  if (Array.isArray(container)) return container.some(v => _pyEq(v, value));
  if (container instanceof Map) return container.has(value);
  if (container instanceof Set) return container.has(value);
  if (container instanceof AdderRange) return container.includes(value);
  if (typeof container === 'object' && container !== null) {
    if (typeof container.__contains__ === 'function') return container.__contains__(value);
    return value in container;
  }
  throw new AdderError('TypeError', `argument of type '${pyTypeName(container)}' is not iterable`);
}

// ── subscript ──

// Evaluate one element of a tuple subscript. A Slice element produces
// the `{_slice: true, lower, upper, step}` marker object that
// __getitem__/__setitem__ already recognize; everything else evaluates
// as a normal expression. Used by both the read and write paths.
async function _evalSliceElt(elt, scope) {
  if (elt && elt.type === 'Slice') {
    return {
      _slice: true,
      lower: elt.lower ? await adderEval(elt.lower, scope) : null,
      upper: elt.upper ? await adderEval(elt.upper, scope) : null,
      step: elt.step ? await adderEval(elt.step, scope) : null,
    };
  }
  return await adderEval(elt, scope);
}

async function _evalSubscript(node, scope) {
  const obj = await adderEval(node.value, scope);
  if (node.slice.type === 'Slice') {
    const lower = node.slice.lower ? await adderEval(node.slice.lower, scope) : null;
    const upper = node.slice.upper ? await adderEval(node.slice.upper, scope) : null;
    const step = node.slice.step ? await adderEval(node.slice.step, scope) : null;
    if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array)
      return _applySlice(obj, lower, upper, step);
    if (typeof obj?.__getitem__ === 'function')
      return obj.__getitem__({ _slice: true, lower, upper, step });
    return _applySlice(obj, lower, upper, step);
  }
  // Tuple subscript — numpy / pandas multi-dim access. `arr[i, j]` is
  // sugar for `arr[(i, j)]`; pass the array of evaluated items to
  // __getitem__ and let the target (ndarray, DataFrame, etc.) handle.
  // Falls back to a generic 2D ndarray-shape path (`{data, shape}`)
  // when __getitem__ isn't defined — covers learn / scitra outputs.
  if (node.slice.type === 'Tuple') {
    const key = [];
    for (const elt of node.slice.elts) {
      key.push(await _evalSliceElt(elt, scope));
    }
    if (obj && typeof obj.__getitem__ === 'function') return obj.__getitem__(key);
    // Generic 2D-ndarray-shape tuple subscript — accepts either a
    // wrapper `{data: Float64Array, shape}` or a bare Float64Array
    // with `.shape` tacked on (learn's transformer outputs).
    if (obj && Array.isArray(obj.shape) && obj.shape.length === 2
        && (obj.data instanceof Float64Array || obj instanceof Float64Array)) {
      const [n, m] = obj.shape;
      const d = obj instanceof Float64Array ? obj : obj.data;
      const rk = key[0], ck = key[1];
      if (typeof rk === 'number' && typeof ck === 'number') {
        const i = rk < 0 ? n + rk : rk;
        const j = ck < 0 ? m + ck : ck;
        return d[i * m + j];
      }
      if (typeof rk === 'number' && ck && ck._slice) {
        const i = rk < 0 ? n + rk : rk;
        const lo = ck.lower != null ? ck.lower : 0;
        const hi = ck.upper != null ? Math.min(ck.upper, m) : m;
        const out = new Float64Array(hi - lo);
        for (let k = 0; k < hi - lo; k++) out[k] = d[i * m + lo + k];
        out.shape = [out.length];
        return out;
      }
      if (rk && rk._slice && typeof ck === 'number') {
        const lo = rk.lower != null ? rk.lower : 0;
        const hi = rk.upper != null ? Math.min(rk.upper, n) : n;
        const j = ck < 0 ? m + ck : ck;
        const out = new Float64Array(hi - lo);
        for (let i = 0; i < hi - lo; i++) out[i] = d[(lo + i) * m + j];
        out.shape = [out.length];
        return out;
      }
      if (rk && rk._slice && ck && ck._slice) {
        const r0 = rk.lower != null ? rk.lower : 0;
        const r1 = rk.upper != null ? Math.min(rk.upper, n) : n;
        const c0 = ck.lower != null ? ck.lower : 0;
        const c1 = ck.upper != null ? Math.min(ck.upper, m) : m;
        const rows = r1 - r0, cols = c1 - c0;
        const out = new Float64Array(rows * cols);
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) out[i * cols + j] = d[(r0 + i) * m + (c0 + j)];
        }
        out.shape = [rows, cols];
        return out;
      }
    }
    throw new AdderError('TypeError',
      `'${pyTypeName(obj)}' object is not subscriptable with tuple`,
      node.line);
  }
  const key = await adderEval(node.slice, scope);
  if (obj instanceof Map) {
    if (!obj.has(key)) throw new AdderError('KeyError', pyRepr(key), node.line);
    return obj.get(key);
  }
  if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array) {
    const idx = key < 0 ? obj.length + key : key;
    if (idx < 0 || idx >= obj.length) throw new AdderError('IndexError', `${pyTypeName(obj)} index out of range`, node.line);
    return obj[idx];
  }
  if (typeof obj === 'object' && obj !== null) {
    if (typeof obj.__getitem__ === 'function') return obj.__getitem__(key);
    if (key in obj) return obj[key];
    throw new AdderError('KeyError', pyRepr(key), node.line);
  }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object is not subscriptable`, node.line);
}

function _applySlice(obj, lower, upper, step) {
  if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array) {
    const len = obj.length;
    step = step ?? 1;
    if (step === 0) throw new AdderError('ValueError', 'slice step cannot be zero');
    if (step === 1) {
      const l = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
      const u = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
      return typeof obj === 'string' ? obj.slice(l, u) : obj.slice(l, u);
    }
    // general step
    let start, stop;
    if (step > 0) {
      start = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
      stop = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
    } else {
      start = lower == null ? len - 1 : lower < 0 ? Math.max(-1, len + lower) : Math.min(lower, len - 1);
      stop = upper == null ? -1 : upper < 0 ? Math.max(-1, len + upper) : upper;
    }
    const result = [];
    if (step > 0) { for (let i = start; i < stop; i += step) result.push(obj[i]); }
    else { for (let i = start; i > stop; i += step) result.push(obj[i]); }
    return typeof obj === 'string' ? result.join('') : result;
  }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object does not support slicing`);
}

// Compute the index positions a slice covers, in iteration order. Mirrors
// _applySlice's clamping. Returns [] when the slice is empty.
function _sliceIndices(len, lower, upper, step) {
  step = step ?? 1;
  if (step === 0) throw new AdderError('ValueError', 'slice step cannot be zero');
  let start, stop;
  if (step > 0) {
    start = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
    stop = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
  } else {
    start = lower == null ? len - 1 : lower < 0 ? Math.max(-1, len + lower) : Math.min(lower, len - 1);
    stop = upper == null ? -1 : upper < 0 ? Math.max(-1, len + upper) : upper;
  }
  const out = [];
  if (step > 0) { for (let i = start; i < stop; i += step) out.push(i); }
  else { for (let i = start; i > stop; i += step) out.push(i); }
  return out;
}

function _applySliceAssign(obj, lower, upper, step, value, line) {
  if (typeof obj === 'string') {
    throw new AdderError('TypeError', "'str' object does not support item assignment", line);
  }
  if (obj instanceof Uint8Array) {
    throw new AdderError('TypeError', "'bytes' object does not support item assignment", line);
  }
  if (!Array.isArray(obj)) {
    throw new AdderError('TypeError', `'${pyTypeName(obj)}' object does not support slice assignment`, line);
  }
  const rhs = [...pyIter(value)];
  const effectiveStep = step ?? 1;
  if (effectiveStep === 1) {
    // Simple slice — splice handles length changes (shrink / grow / insert).
    const len = obj.length;
    const l = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
    const u = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
    const removeCount = Math.max(0, u - l);
    obj.splice(l, removeCount, ...rhs);
    return;
  }
  // Extended slice — same-length requirement.
  const indices = _sliceIndices(obj.length, lower, upper, step);
  if (rhs.length !== indices.length) {
    throw new AdderError(
      'ValueError',
      `attempt to assign sequence of size ${rhs.length} to extended slice of size ${indices.length}`,
      line,
    );
  }
  for (let k = 0; k < indices.length; k++) obj[indices[k]] = rhs[k];
}

function _applySliceDelete(obj, lower, upper, step, line) {
  if (typeof obj === 'string') {
    throw new AdderError('TypeError', "'str' object doesn't support item deletion", line);
  }
  if (obj instanceof Uint8Array) {
    throw new AdderError('TypeError', "'bytes' object doesn't support item deletion", line);
  }
  if (!Array.isArray(obj)) {
    throw new AdderError('TypeError', `'${pyTypeName(obj)}' object doesn't support slice deletion`, line);
  }
  const effectiveStep = step ?? 1;
  if (effectiveStep === 1) {
    const len = obj.length;
    const l = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
    const u = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
    if (u > l) obj.splice(l, u - l);
    return;
  }
  const indices = _sliceIndices(obj.length, lower, upper, step);
  // Sort descending so each splice doesn't shift the remaining indices.
  indices.sort((a, b) => b - a);
  for (const i of indices) obj.splice(i, 1);
}

// ── function call ──

async function _evalCall(node, scope) {
  const func = await adderEval(node.func, scope);
  const args = [];
  for (const a of node.args) {
    if (a.type === 'Starred') { for (const v of pyIter(await adderEval(a.value, scope))) args.push(v); }
    else args.push(await adderEval(a, scope));
  }
  const kwArgs = [];
  for (const kw of node.keywords) {
    if (kw.name === null) {
      const obj = await adderEval(kw.value, scope);
      if (obj instanceof Map) { for (const [k, v] of obj) kwArgs.push([k, v]); }
      else { for (const k of Object.keys(obj)) kwArgs.push([k, obj[k]]); }
    } else {
      kwArgs.push([kw.name, await adderEval(kw.value, scope)]);
    }
  }
  // special builtins that need caller's scope
  if (func._sentinel === 'super') return _evalSuperCall(args, scope, node.line);
  if (func._sentinel === 'eval') return _evalBuiltinEval(args, scope, node.line);
  if (func._sentinel === 'exec') return _evalBuiltinExec(args, scope, node.line);
  return _callValue(func, args, kwArgs, node.line);
}

// ── call stack for tracebacks ──

const _callStack = [];

async function _callValue(func, args, kwArgs, line) {
  if (typeof func !== 'function') {
    if (typeof func === 'object' && func !== null && typeof func.__call__ === 'function') {
      return _callValue(func.__call__.bind(func), args, kwArgs, line);
    }
    throw new AdderError('TypeError', `'${pyTypeName(func)}' object is not callable`, line);
  }
  const name = func._pyName || func.name || '<anonymous>';
  _callStack.push({ name, line });
  try {
    if (kwArgs.length > 0) {
      if (func._pyFunc) {
        return await func(...args, ...kwArgs.map(([_, v]) => v), { _kw: true, ...Object.fromEntries(kwArgs) });
      }
      const kw = { _kw: true };
      for (const [k, v] of kwArgs) kw[k] = v;
      try {
        return await func(...args, kw);
      } catch (e) {
        if (e instanceof TypeError && /\bnew\b/.test(e.message)) return new func(...args, kw);
        if (e instanceof AdderError || e instanceof _BreakSignal || e instanceof _ContinueSignal || e instanceof _ReturnSignal) throw e;
        throw new AdderError('RuntimeError', e.message || String(e), line);
      }
    }
    return await func(...args);
  } catch (e) {
    if (e instanceof TypeError && /\bnew\b/.test(e.message)) {
      try { return new func(...args); } catch (e2) {
        if (e2 instanceof AdderError) throw e2;
        throw new AdderError('RuntimeError', e2.message || String(e2), line);
      }
    }
    if (e instanceof AdderError) {
      if (!e._tracebackSet) { e._traceback = _callStack.map(f => ({ ...f })); e._tracebackSet = true; }
      throw e;
    }
    if (e instanceof _BreakSignal || e instanceof _ContinueSignal || e instanceof _ReturnSignal) throw e;
    const ae = new AdderError('RuntimeError', e.message || String(e), line);
    ae._traceback = _callStack.map(f => ({ ...f }));
    ae._tracebackSet = true;
    throw ae;
  } finally {
    _callStack.pop();
  }
}

// ── function creation ──

function _hasYield(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'Yield' || node.type === 'YieldFrom') return true;
  // don't descend into nested function/class defs
  if (node.type === 'FunctionDef' || node.type === 'AsyncFunctionDef' || node.type === 'ClassDef' || node.type === 'Lambda') return false;
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) { for (const item of val) { if (_hasYield(item)) return true; } }
    else if (val && typeof val === 'object' && val.type) { if (_hasYield(val)) return true; }
  }
  return false;
}

function _makeFunction(node, scope) {
  const isAsync = node.type === 'AsyncFunctionDef';
  const isGenerator = node.body.some(s => _hasYield(s));

  if (isGenerator) return _makeGeneratorFunction(node, scope);

  const fn = async function (...callArgs) {
    const localScope = new AdderScope(scope);
    // bind parameters
    await _bindParams(node, callArgs, localScope);
    // execute body
    try {
      for (let i = 0; i < node.body.length; i++) {
        const stmt = node.body[i];
        // docstring — skip first string expression
        if (i === 0 && stmt.type === 'Expr' && stmt.value.type === 'Constant' && typeof stmt.value.value === 'string') {
          fn.__doc__ = stmt.value.value;
          continue;
        }
        await adderEval(stmt, localScope);
      }
      return null;
    } catch (e) {
      if (e instanceof _ReturnSignal) return e.value;
      throw e;
    }
  };
  fn._pyFunc = true;
  fn._pyName = node.name;
  return fn;
}

function _makeGeneratorFunction(node, scope) {
  // Generator functions use a _YieldSignal to communicate yield values
  // back to the async-generator wrapper.
  const fn = function (...callArgs) {
    // Return an object that implements both sync and async iteration.
    // We use an async generator internally, exposed via Symbol.asyncIterator.
    // For sync consumers (for..of), we also provide Symbol.iterator
    // that collects eagerly — but the primary path is for-await.
    const genObj = {
      [Symbol.asyncIterator]() {
        return _runGenerator(node, scope, callArgs);
      },
      // sync iterator: collect all values eagerly (used by list(), sorted(), etc.)
      [Symbol.iterator]() {
        throw new AdderError('TypeError', 'Use "for await" or list() with generators');
      },
    };
    return genObj;
  };
  fn._pyFunc = true;
  fn._pyName = node.name;
  fn._isGenerator = true;
  return fn;
}

async function* _runGenerator(node, scope, callArgs) {
  const localScope = new AdderScope(scope);
  await _bindParams(node, callArgs, localScope);
  try {
    for (let i = 0; i < node.body.length; i++) {
      const stmt = node.body[i];
      if (i === 0 && stmt.type === 'Expr' && stmt.value.type === 'Constant' && typeof stmt.value.value === 'string') continue;
      yield* await _evalGenStmt(stmt, localScope);
    }
  } catch (e) {
    if (e instanceof _ReturnSignal) return;
    throw e;
  }
}

async function* _evalGenStmt(node, scope) {
  // Like adderEval but yields instead of throwing for Yield nodes
  switch (node.type) {
    case 'Expr':
      if (node.value.type === 'Yield') {
        yield node.value.value ? await adderEval(node.value.value, scope) : null;
        return;
      }
      if (node.value.type === 'YieldFrom') {
        const iterable = await adderEval(node.value.value, scope);
        if (iterable[Symbol.asyncIterator]) { for await (const v of iterable) yield v; }
        else { for (const v of pyIter(iterable)) yield v; }
        return;
      }
      await adderEval(node, scope);
      return;
    case 'For': {
      const iterable = await adderEval(node.iter, scope);
      let broke = false;
      const iter = iterable[Symbol.asyncIterator] ? iterable : pyIter(iterable);
      for await (const value of iter) {
        await _assignTarget(node.target, value, scope);
        try {
          for (const stmt of node.body) yield* await _evalGenStmt(stmt, scope);
        } catch (e) {
          if (e instanceof _BreakSignal) { broke = true; break; }
          if (e instanceof _ContinueSignal) continue;
          throw e;
        }
      }
      if (!broke) for (const stmt of node.orelse) yield* await _evalGenStmt(stmt, scope);
      return;
    }
    case 'While': {
      let broke = false, iterations = 0;
      while (pyBool(await adderEval(node.test, scope))) {
        if (++iterations > 1000000) throw new AdderError('RuntimeError', 'maximum loop iterations exceeded');
        try {
          for (const stmt of node.body) yield* await _evalGenStmt(stmt, scope);
        } catch (e) {
          if (e instanceof _BreakSignal) { broke = true; break; }
          if (e instanceof _ContinueSignal) continue;
          throw e;
        }
      }
      if (!broke) for (const stmt of node.orelse) yield* await _evalGenStmt(stmt, scope);
      return;
    }
    case 'If': {
      const test = await adderEval(node.test, scope);
      const branch = pyBool(test) ? node.body : node.orelse;
      for (const stmt of branch) yield* await _evalGenStmt(stmt, scope);
      return;
    }
    case 'Try': {
      try {
        for (const stmt of node.body) yield* await _evalGenStmt(stmt, scope);
      } catch (e) {
        if (e instanceof _BreakSignal || e instanceof _ContinueSignal || e instanceof _ReturnSignal) throw e;
        let handled = false;
        for (const handler of node.handlers) {
          let excTypeVal = null;
          if (handler.excType) try { excTypeVal = await adderEval(handler.excType, scope); } catch {}
          if (!handler.excType || _matchException(e, excTypeVal)) {
            if (handler.name) scope.set(handler.name, e);
            handled = true;
            for (const stmt of handler.body) yield* await _evalGenStmt(stmt, scope);
            break;
          }
        }
        if (!handled) { for (const stmt of node.finalbody) yield* await _evalGenStmt(stmt, scope); throw e; }
      }
      for (const stmt of node.finalbody) yield* await _evalGenStmt(stmt, scope);
      return;
    }
    default:
      // non-yielding statements — just eval normally
      await adderEval(node, scope);
  }
}

async function _bindParams(node, callArgs, localScope) {
  const { params, vararg, kwonly, kwarg } = node;
  let positionalIdx = 0;
  let kwObj = null;

  // check if last arg is keyword bag
  if (callArgs.length > 0 && callArgs[callArgs.length - 1]?._kw) {
    kwObj = callArgs.pop();
  }

  // bind positional params
  for (let i = 0; i < params.length; i++) {
    const p = params[i];
    if (positionalIdx < callArgs.length) {
      localScope.set(p.name, callArgs[positionalIdx++]);
    } else if (kwObj && p.name in kwObj) {
      localScope.set(p.name, kwObj[p.name]);
    } else if (p.default) {
      localScope.set(p.name, await adderEval(p.default, localScope));
    } else {
      throw new AdderError('TypeError', `${node.name}() missing required argument: '${p.name}'`);
    }
  }

  // vararg
  if (vararg) {
    localScope.set(vararg, callArgs.slice(positionalIdx));
    positionalIdx = callArgs.length;
  }

  // keyword-only params
  for (const p of kwonly) {
    if (kwObj && p.name in kwObj) {
      localScope.set(p.name, kwObj[p.name]);
    } else if (p.default) {
      localScope.set(p.name, await adderEval(p.default, localScope));
    } else {
      throw new AdderError('TypeError', `${node.name}() missing keyword argument: '${p.name}'`);
    }
  }

  // **kwargs
  if (kwarg) {
    const extra = {};
    if (kwObj) {
      const usedNames = new Set([...params.map(p => p.name), ...kwonly.map(p => p.name), '_kw']);
      for (const k of Object.keys(kwObj)) {
        if (!usedNames.has(k)) extra[k] = kwObj[k];
      }
    }
    localScope.set(kwarg, extra);
  }
}

function _makeLambda(node, scope) {
  const fn = async function (...callArgs) {
    const localScope = new AdderScope(scope);
    let positionalIdx = 0;
    let kwObj = null;
    if (callArgs.length > 0 && callArgs[callArgs.length - 1]?._kw) kwObj = callArgs.pop();
    for (let i = 0; i < node.params.length; i++) {
      const p = node.params[i];
      if (positionalIdx < callArgs.length) localScope.set(p.name, callArgs[positionalIdx++]);
      else if (kwObj && p.name in kwObj) localScope.set(p.name, kwObj[p.name]);
      else if (p.default) localScope.set(p.name, await adderEval(p.default, localScope));
    }
    if (node.vararg) localScope.set(node.vararg, callArgs.slice(positionalIdx));
    if (node.kwarg) {
      const extra = {};
      if (kwObj) { const used = new Set([...node.params.map(p => p.name), '_kw']); for (const k of Object.keys(kwObj)) if (!used.has(k)) extra[k] = kwObj[k]; }
      localScope.set(node.kwarg, extra);
    }
    return adderEval(node.body, localScope);
  };
  fn._pyFunc = true;
  fn._pyName = '<lambda>';
  return fn;
}

// ── class ──

// ── C3 linearization (MRO) ──

function _computeMRO(cls) {
  if (!cls._pyBases || cls._pyBases.length === 0) return [cls];
  const baseMROs = cls._pyBases.map(b => [..._computeMRO(b)]);
  const result = [cls];
  const lists = [...baseMROs, [...cls._pyBases]];
  while (lists.some(l => l.length > 0)) {
    let head = null;
    for (const list of lists) {
      if (list.length === 0) continue;
      const candidate = list[0];
      if (lists.every(l => { const idx = l.indexOf(candidate); return idx <= 0; })) { head = candidate; break; }
    }
    if (!head) throw new AdderError('TypeError', 'Cannot create a consistent method resolution order');
    result.push(head);
    for (const list of lists) { const idx = list.indexOf(head); if (idx !== -1) list.splice(idx, 1); }
  }
  return result;
}

async function _evalClass(node, scope) {
  const bases = [];
  for (const b of node.bases) bases.push(await adderEval(b, scope));

  // evaluate class body in a class scope
  const classScope = new AdderScope(scope);
  for (const stmt of node.body) await adderEval(stmt, classScope);

  // build class
  const classVars = Object.fromEntries(classScope.vars);

  // Detect `class X(list): …` — adder represents Python list/tuple as
  // JS Array, and instances need to BE an Array for native list methods
  // (`append`/`pop`/indexing) to dispatch via adderGetAttr's Array branch.
  // `_pyContainerType` is set on the builtin `list` factory so a base
  // class comparison stays internal (no name-string matching).
  const listBase = bases.find(b => b && b._pyContainerType === 'list');

  // constructor function
  const cls = function (...args) {
    const instance = listBase
      ? Object.assign(args.length > 0 ? [...pyIter(args[0])] : [], { __adderClass__: node.name, __adderType__: cls })
      : Object.create(cls.prototype);
    if (!listBase) {
      instance.__adderClass__ = node.name;
      instance.__adderType__ = cls;
    }
    // copy class variables (non-function, non-property)
    for (const [k, v] of Object.entries(classVars)) {
      if (typeof v !== 'function' && !(v && (v.__property__ || v.__staticmethod__ || v.__classmethod__))) instance[k] = v;
    }
    // call __init__ if present
    if (typeof cls.prototype.__init__ === 'function') {
      const result = cls.prototype.__init__.call(instance, ...args);
      if (result instanceof Promise) return result.then(() => instance);
    }
    return instance;
  };

  cls.prototype = {};
  cls._pyName = node.name;
  cls._pyClass = true;
  cls._pyBases = bases.filter(b => b?._pyClass);

  // MRO: compute and apply
  const mro = _computeMRO(cls);
  cls._pyMRO = mro;

  // copy ONLY own methods from bases in MRO order (reverse = most base first, overridden by closer)
  for (let i = mro.length - 1; i >= 1; i--) {
    const base = mro[i];
    if (!base.prototype || !base._pyOwnMembers) continue;
    for (const key of base._pyOwnMembers) {
      const desc = Object.getOwnPropertyDescriptor(base.prototype, key);
      if (desc) Object.defineProperty(cls.prototype, key, desc);
    }
  }

  // track own members for this class
  for (const [name, value] of Object.entries(classVars)) {
    if (value && value.__property__) {
      const fget = value.fget;
      const fset = value.fset;
      const desc = { get() { return fget(this); }, configurable: true, enumerable: true };
      if (fset) {
        const setFn = function(v) { fset(this, v); };
        setFn._pyFset = fset;
        desc.set = setFn;
      }
      Object.defineProperty(cls.prototype, name, desc);
    } else if (value && value.__staticmethod__) {
      // @staticmethod — no self injection; wrap to strip _pyFunc flag
      const rawFn = value.fn;
      const sm = (...args) => rawFn(...args);
      sm._pyName = `${node.name}.${name}`;
      cls.prototype[name] = sm;
      cls[name] = sm; // accessible as ClassName.method()
    } else if (value && value.__classmethod__) {
      // @classmethod — inject cls as first arg instead of self
      const originalFn = value.fn;
      const cm = function (...args) { return originalFn(cls, ...args); };
      cm._pyName = `${node.name}.${name}`;
      cls.prototype[name] = cm;
      cls[name] = cm; // accessible as ClassName.method()
    } else if (typeof value === 'function') {
      const originalFn = value;
      cls.prototype[name] = function (...args) { return originalFn(this, ...args); };
      cls.prototype[name]._pyName = `${node.name}.${name}`;
      // Python unbound-method access: `ClassName.method(instance, ...args)`
      // should forward to originalFn(instance, ...args). Arrow form is
      // intentional — adderGetAttr's `.bind(obj)` on a regular fn would
      // pin `this` to the class; an arrow ignores `.bind`, so call
      // semantics stay (instance, ...args). Inherited methods still
      // resolve via the prototype chain on instance access; explicit
      // unbound access uses the own-class binding above.
      cls[name] = (...args) => originalFn(...args);
    }
  }

  // copy class variables to constructor (for @classmethod access via cls.attr)
  for (const [k, v] of Object.entries(classVars)) {
    if (typeof v !== 'function' && !(v && (v.__property__ || v.__staticmethod__ || v.__classmethod__))) {
      cls[k] = v;
    }
  }

  // inherit static/class methods (and unbound regular methods) from base
  // constructors. Walk MRO furthest-first so closer bases override deeper
  // ones, and skip any key this class already owns — own definitions in
  // classVars were assigned to `cls[key]` above; overwriting them here
  // would silently route `Subclass.method` to the parent's implementation.
  for (let i = mro.length - 1; i >= 1; i--) {
    const base = mro[i];
    if (!base._pyOwnMembers) continue;
    for (const key of base._pyOwnMembers) {
      if (Object.prototype.hasOwnProperty.call(cls, key)) continue;
      if (key in base && typeof base[key] === 'function') cls[key] = base[key];
    }
  }
  // own static/class methods override inherited (already set above, but re-apply to be safe)
  for (const [name, value] of Object.entries(classVars)) {
    if (value && (value.__staticmethod__ || value.__classmethod__) && cls[name]) { /* already set */ }
  }

  cls._pyOwnMembers = new Set();
  for (const [name, value] of Object.entries(classVars)) {
    if (typeof value === 'function' || (value && (value.__property__ || value.__staticmethod__ || value.__classmethod__))) cls._pyOwnMembers.add(name);
  }

  // set __class__ in class scope so super() works inside methods
  classScope.set('__class__', cls);

  // handle decorators
  let result = cls;
  for (let i = node.decorators.length - 1; i >= 0; i--) {
    const dec = await adderEval(node.decorators[i], scope);
    result = await _callValue(dec, [result], [], node.line);
  }

  scope.set(node.name, result);
  return null;
}

// ── for loop ──

async function _evalFor(node, scope) {
  const iterable = await adderEval(node.iter, scope);
  let broke = false;
  // for-await handles both sync iterables and async generators
  const iter = iterable[Symbol.asyncIterator] ? iterable : pyIter(iterable);
  let _loopCount = 0;
  for await (const value of iter) {
    // yield to event loop periodically to prevent page lockup
    if (++_loopCount % 1000 === 0) await new Promise(r => setTimeout(r, 0));
    await _assignTarget(node.target, value, scope);
    try {
      for (const stmt of node.body) await adderEval(stmt, scope);
    } catch (e) {
      if (e instanceof _BreakSignal) { broke = true; break; }
      if (e instanceof _ContinueSignal) continue;
      throw e;
    }
  }
  if (!broke) {
    for (const stmt of node.orelse) await adderEval(stmt, scope);
  }
  return null;
}

// ── while loop ──

async function _evalWhile(node, scope) {
  let broke = false;
  let iterations = 0;
  const limit = scope.has('__loop_limit__') ? scope.get('__loop_limit__') : 1000000;
  while (pyBool(await adderEval(node.test, scope))) {
    if (limit > 0 && ++iterations > limit) throw new AdderError('RuntimeError', `maximum loop iterations exceeded (${limit})`);
    if (iterations % 1000 === 0) await new Promise(r => setTimeout(r, 0));
    try {
      for (const stmt of node.body) await adderEval(stmt, scope);
    } catch (e) {
      if (e instanceof _BreakSignal) { broke = true; break; }
      if (e instanceof _ContinueSignal) continue;
      throw e;
    }
  }
  if (!broke) {
    for (const stmt of node.orelse) await adderEval(stmt, scope);
  }
  return null;
}

// ── with statement ──

async function _evalWith(node, scope) {
  const managers = [];
  for (const item of node.items) {
    const mgr = await adderEval(item.contextExpr, scope);
    const enter = mgr.__enter__ || mgr.enter;
    const exit = mgr.__exit__ || mgr.exit;
    if (typeof enter !== 'function' || typeof exit !== 'function') {
      throw new AdderError('AttributeError', `'${pyTypeName(mgr)}' does not support the context manager protocol`);
    }
    const value = await enter.call(mgr);
    if (item.optionalVar) await _assignTarget(item.optionalVar, value, scope);
    managers.push({ mgr, exit });
  }
  try {
    for (const stmt of node.body) await adderEval(stmt, scope);
    for (const { mgr, exit } of managers.reverse()) await exit.call(mgr, null, null, null);
  } catch (e) {
    for (const { mgr, exit } of managers.reverse()) {
      const suppress = await exit.call(mgr, e.pyType || 'Exception', e, null);
      if (!suppress) throw e;
    }
  }
  return null;
}

// ── try/except ──

async function _evalTry(node, scope) {
  let caught = false;
  try {
    for (const stmt of node.body) await adderEval(stmt, scope);
  } catch (e) {
    if (e instanceof _BreakSignal || e instanceof _ContinueSignal || e instanceof _ReturnSignal) throw e;
    caught = true;
    let handled = false;
    for (const handler of node.handlers) {
      let excTypeVal = null;
      if (handler.excType) try { excTypeVal = await adderEval(handler.excType, scope); } catch {}
      if (!handler.excType || _matchException(e, excTypeVal)) {
        if (handler.name) scope.set(handler.name, e);
        handled = true;
        try {
          for (const stmt of handler.body) await adderEval(stmt, scope);
        } catch (e2) {
          if (e2 instanceof _BreakSignal || e2 instanceof _ContinueSignal || e2 instanceof _ReturnSignal) throw e2;
          throw e2;
        }
        break;
      }
    }
    if (!handled) {
      // execute finally before re-throwing
      for (const stmt of node.finalbody) await adderEval(stmt, scope);
      throw e;
    }
  }
  if (!caught) {
    // else clause runs if no exception
    for (const stmt of node.orelse) await adderEval(stmt, scope);
  }
  // finally always runs
  for (const stmt of node.finalbody) await adderEval(stmt, scope);
  return null;
}

function _matchException(error, excTypeVal) {
  if (!excTypeVal) return true;
  if (Array.isArray(excTypeVal)) return excTypeVal.some(t => _matchException(error, t));
  if (error instanceof AdderError) {
    const targetName = typeof excTypeVal === 'function' ? (excTypeVal._pyName || excTypeVal.name) :
                       (typeof excTypeVal === 'string' ? excTypeVal : null);
    if (targetName) {
      if (error.pyType === targetName) return true;
      let pt = _excParents[error.pyType];
      while (pt) { if (pt === targetName) return true; pt = _excParents[pt]; }
    }
  }
  // custom class exceptions — walk prototype chain
  if (typeof excTypeVal === 'function' && excTypeVal._pyClass && error !== null && typeof error === 'object') {
    let proto = error;
    while (proto) {
      if (proto.__adderClass__ === (excTypeVal._pyName || excTypeVal.name)) return true;
      proto = Object.getPrototypeOf(proto);
    }
  }
  if (typeof excTypeVal === 'function' && !excTypeVal._pyClass) {
    try { return error instanceof excTypeVal; } catch { /* arrow fn without prototype */ }
  }
  return false;
}

// ── super() / eval() / exec() builtins ──

function _evalSuperCall(args, scope, line) {
  let cls;
  try { cls = scope.get('__class__'); } catch { throw new AdderError('RuntimeError', 'super(): __class__ not found', line); }
  let self;
  try { self = scope.get('self'); } catch { throw new AdderError('RuntimeError', 'super(): self not found', line); }
  const mro = cls._pyMRO || [cls];
  const idx = mro.indexOf(cls);
  if (idx < 0 || idx + 1 >= mro.length) return {};
  // create proxy that delegates to next class in MRO
  return new Proxy({}, {
    get(_, name) {
      // search MRO starting from the class after current
      for (let i = idx + 1; i < mro.length; i++) {
        const base = mro[i];
        if (!base.prototype) continue;
        const desc = Object.getOwnPropertyDescriptor(base.prototype, name);
        if (desc) {
          if (desc.get) return desc.get.call(self);
          if (typeof desc.value === 'function') return (...a) => desc.value.call(self, ...a);
          return desc.value;
        }
      }
      return undefined;
    }
  });
}

async function _evalBuiltinEval(args, scope, line) {
  const code = String(args[0]);
  try {
    const exprAst = _adderParseExpr(code);
    return await adderEval(exprAst, scope);
  } catch (e) {
    if (e instanceof AdderError) throw e;
    throw new AdderError('SyntaxError', e.message || String(e), line);
  }
}

async function _evalBuiltinExec(args, scope, line) {
  const code = String(args[0]);
  try {
    const ast = adderParse(code);
    await adderEval(ast, scope);
  } catch (e) {
    if (e instanceof AdderError) throw e;
    throw new AdderError('SyntaxError', e.message || String(e), line);
  }
  return null;
}

// ── comprehensions ──

function _evalGenExpr(node, scope) {
  // Return an object with async iteration — lazy, not materialized
  return {
    [Symbol.asyncIterator]() {
      return _genExprIter(node, new AdderScope(scope), 0);
    },
  };
}

async function* _genExprIter(node, scope, genIdx) {
  const gen = node.generators[genIdx];
  const iterable = await adderEval(gen.iter, scope);
  const iter = iterable[Symbol.asyncIterator] ? iterable : pyIter(iterable);
  for await (const value of iter) {
    await _assignTarget(gen.target, value, scope);
    let pass = true;
    for (const ifNode of gen.ifs) {
      if (!pyBool(await adderEval(ifNode, scope))) { pass = false; break; }
    }
    if (!pass) continue;
    if (genIdx + 1 < node.generators.length) {
      yield* _genExprIter(node, scope, genIdx + 1);
    } else {
      yield await adderEval(node.elt, scope);
    }
  }
}

async function _evalComp(node, scope, kind) {
  const result = kind === 'list' ? [] : kind === 'set' ? new Set() : {};
  const compScope = new AdderScope(scope);
  await _evalCompIter(node, compScope, result, kind, 0);
  return result;
}

async function _evalCompIter(node, scope, result, kind, genIdx) {
  const gen = node.generators[genIdx];
  const iterable = await adderEval(gen.iter, scope);
  for (const value of pyIter(iterable)) {
    await _assignTarget(gen.target, value, scope);
    // check if filters
    let pass = true;
    for (const ifNode of gen.ifs) {
      if (!pyBool(await adderEval(ifNode, scope))) { pass = false; break; }
    }
    if (!pass) continue;
    if (genIdx + 1 < node.generators.length) {
      await _evalCompIter(node, scope, result, kind, genIdx + 1);
    } else {
      if (kind === 'list') {
        result.push(await adderEval(node.elt, scope));
      } else if (kind === 'set') {
        result.add(await adderEval(node.elt, scope));
      } else {
        const k = await adderEval(node.key, scope);
        const v = await adderEval(node.value, scope);
        result[k] = v;
      }
    }
  }
}

// ── imports ──

function _resolveModule(name) {
  if (_registered.has(name)) return _registered.get(name);
  if (_registered.size) { const m = _walkDotted((r) => _registered.get(r), name); if (m) return m; }
  if (name === 'js' && _runOpts.host === false) return null;   // host access off: `import js` is simply not found
  if (adderModules[name]) return adderModules[name];
  if (typeof window !== 'undefined') {
    if (window._auditableExtensions?.[name]) return window._auditableExtensions[name];
    // Walk dotted path through namespace objects so `from learn.tree
    // import X` resolves via `_auditableExtensions['learn'].tree`. Lets
    // extensions following the sklearn-shaped namespace-object pattern
    // (learn, scitra, sadpan, …) expose submodules without registering
    // each one separately.
    const dot = name.indexOf('.');
    if (dot !== -1) {
      const root = name.slice(0, dot);
      const rest = name.slice(dot + 1).split('.');
      let mod = window._auditableExtensions?.[root];
      for (const part of rest) {
        if (mod == null || typeof mod !== 'object') return null;
        mod = mod[part];
      }
      if (mod && typeof mod === 'object') return mod;
    }
  }
  return null;
}

// Bridge to auditable's installed-extension loader. auditable sets a window hook
// (_auditableResolveModule, in exec.js) that lazy-loads an INSTALLED @gcu extension
// which exports <name> — so `import plt` / `import sadpan` resolve from the embedded
// modules with no bootstrap `load()` cell. Standalone-safe: returns null when the hook
// is absent (Node tests, or a non-auditable host) so adder still runs on its own.
async function _loadAuditableModule(name) {
  if (typeof window === 'undefined' || typeof window._auditableResolveModule !== 'function') return null;
  try { return await window._auditableResolveModule(name); } catch { return null; }
}

// Parse + evaluate source as a fresh module, cache it under cacheKey.
// Shared by _loadVfsModule, _loadHttpModule, _loadDirectModule.
async function _instantiateModule(cacheKey, displayName, source, filePath) {
  const cache = adderModules.sys.modules;
  const ast = adderParse(source);
  const modScope = new AdderScope();
  const builtins = adderBuiltins(() => {});
  const builtinNames = new Set(Object.keys(builtins));
  for (const [k, v] of Object.entries(builtins)) modScope.set(k, v);
  modScope.set('__name__', displayName);
  modScope.set('__file__', filePath);

  // placeholder in cache (handles circular imports)
  const mod = { __adderModule__: true };
  cache[cacheKey] = mod;

  await adderEval(ast, modScope);

  for (const [k, v] of modScope.vars) {
    if (!builtinNames.has(k) && k !== '__name__' && k !== '__file__') mod[k] = v;
  }
  mod.__name__ = displayName;
  mod.__file__ = filePath;

  return mod;
}

async function _loadVfsModule(name) {
  const cache = adderModules.sys.modules;
  if (cache[name]) return cache[name];

  const vfs = getAdderVFS();
  if (!vfs) return null;
  const pth = _getVfsPath();
  if (!pth) return null;

  // search sys.path for name.py or name/__init__.py
  let source = null, filePath = null;
  const cwd = adderModules.os?.getcwd?.() || '/';
  for (let dir of adderModules.sys.path) {
    if (typeof dir !== 'string') continue;
    // skip URL-like entries — those are for _loadHttpModule
    if (/^https?:\/\//.test(dir)) continue;
    // resolve relative entries (e.g. '.') against os.getcwd()
    if (!pth.isAbsolute(dir)) dir = pth.join(cwd, dir);
    const fp = pth.join(dir, name + '.py');
    try { source = await vfs.readFile(fp); filePath = fp; break; } catch {}
    const ip = pth.join(dir, name, '__init__.py');
    try { source = await vfs.readFile(ip); filePath = ip; break; } catch {}
  }
  if (source === null) return null;

  return _instantiateModule(name, name, source, filePath);
}

// Join a base URL with a relative path component. Ensures exactly one '/' between.
function _urlJoin(base, rel) {
  if (!base.endsWith('/')) base += '/';
  return base + rel;
}

async function _loadHttpModule(name) {
  if (typeof fetch !== 'function' || _runOpts.remote === false) return null;
  const cache = adderModules.sys.modules;
  if (cache[name]) return cache[name];

  // Iterate sys.path entries suitable as URL bases:
  //   - absolute URLs ("https://cdn.example.com/")
  //   - relative URL bases ("./", "../lib/") resolved against document.baseURI when available
  let source = null, fetchedUrl = null;
  for (const entry of adderModules.sys.path) {
    if (typeof entry !== 'string') continue;
    let base;
    if (/^https?:\/\//.test(entry)) {
      base = entry;
    } else if (entry.startsWith('./') || entry.startsWith('../') || entry === '.' || entry === '..') {
      base = (typeof document !== 'undefined' && document.baseURI)
        ? new URL(entry === '.' ? './' : (entry === '..' ? '../' : entry), document.baseURI).href
        : null;
    } else {
      // absolute filesystem paths ("/", "/srv/lib/") are VFS territory, skip
      continue;
    }
    if (!base) continue;

    for (const candidate of [_urlJoin(base, name + '.py'), _urlJoin(base, name + '/__init__.py')]) {
      try {
        const resp = await fetch(candidate);
        if (resp.ok) { source = await resp.text(); fetchedUrl = candidate; break; }
      } catch {}
    }
    if (source !== null) break;
  }
  if (source === null) return null;

  return _instantiateModule(name, name, source, fetchedUrl);
}

// Direct import from an explicit path/URL: `import "./foo.py" as foo`.
// Accepts absolute URLs, page-relative URLs, and VFS paths (if VFS is available).
async function _loadDirectModule(path) {
  const cache = adderModules.sys.modules;
  if (cache[path]) return cache[path];

  // Derive a display name from the last path segment (stripped of .py).
  const base = path.split(/[/\\]/).pop() || path;
  const displayName = base.replace(/\.py$/, '') || path;

  let source = null, resolvedPath = path;

  // Absolute or page-relative URL → fetch
  if (/^https?:\/\//.test(path) || path.startsWith('./') || path.startsWith('../') || path.startsWith('/')) {
    if (typeof fetch === 'function' && _runOpts.remote !== false) {
      try {
        const url = /^https?:\/\//.test(path)
          ? path
          : (typeof document !== 'undefined' && document.baseURI)
            ? new URL(path, document.baseURI).href
            : path;
        const resp = await fetch(url);
        if (resp.ok) { source = await resp.text(); resolvedPath = url; }
      } catch {}
    }
    // VFS fallback for absolute paths when fetch failed or unavailable
    if (source === null && path.startsWith('/')) {
      const vfs = getAdderVFS();
      if (vfs) {
        try { source = await vfs.readFile(path); resolvedPath = path; } catch {}
      }
    }
  } else {
    // Bare relative form (no ./ prefix) — try VFS only; HTTP loading is opt-in via ./
    const vfs = getAdderVFS();
    if (vfs) {
      try { source = await vfs.readFile(path); resolvedPath = path; } catch {}
    }
  }

  if (source === null) return null;
  return _instantiateModule(path, displayName, source, resolvedPath);
}

// when remote imports are off and the import could only have come from the
// network (a URL path, or sys.path carrying URL bases), say so in the error
function _remoteNote(nameOrPath) {
  if (_runOpts.remote !== false) return '';
  // a bare '.' / '..' on sys.path is a network base only where document.baseURI exists (the default
  // sys.path starts with '.', and in Node that never meant the network)
  const hasBase = typeof document !== 'undefined' && !!document.baseURI;
  const urlish = (s) => typeof s === 'string' && (/^https?:\/\//.test(s) || s.startsWith('./') || s.startsWith('../') || (hasBase && (s === '.' || s === '..')));
  if (urlish(nameOrPath)) return ' (remote imports are off)';
  const sp = adderModules.sys && adderModules.sys.path;
  return Array.isArray(sp) && sp.some(urlish) ? ' (remote imports are off)' : '';
}

async function _evalImport(node, scope) {
  for (const { module, alias, path } of node.names) {
    if (path) {
      const mod = await _loadDirectModule(path);
      if (!mod) throw new AdderError('ModuleNotFoundError', `cannot load module from '${path}'${_remoteNote(path)}`, node.line);
      scope.set(alias, mod);
      continue;
    }
    let mod = _resolveModule(module);
    if (mod) {
      scope.set(alias || module, mod);
      // import this — print the zen (side effect, like CPython)
      if (module === 'this' && mod.s) { const printFn = scope.has('print') ? scope.get('print') : null; if (printFn) await printFn(mod.s); }
      continue;
    }
    mod = await _loadVfsModule(module);
    if (mod) { scope.set(alias || module, mod); continue; }
    mod = await _loadAuditableModule(module);
    if (mod) { scope.set(alias || module, mod); continue; }
    mod = await _loadHttpModule(module);
    if (mod) { scope.set(alias || module, mod); continue; }
    throw new AdderError('ModuleNotFoundError', `No module named '${module}'${_remoteNote(module)}`, node.line);
  }
  return null;
}

async function _evalImportFrom(node, scope) {
  let mod;
  let displayModule;
  if (node.path) {
    mod = await _loadDirectModule(node.path);
    displayModule = node.path;
  } else {
    mod = _resolveModule(node.module);
    if (!mod) mod = await _loadVfsModule(node.module);
    if (!mod) mod = await _loadAuditableModule(node.module);
    if (!mod) mod = await _loadHttpModule(node.module);
    displayModule = node.module;
  }
  if (!mod) throw new AdderError('ModuleNotFoundError', `No module named '${displayModule}'${_remoteNote(node.path || displayModule)}`, node.line);
  for (const { name, alias } of node.names) {
    if (name === '*') { for (const k of Object.keys(mod)) scope.set(k, mod[k]); }
    else {
      if (!(name in mod)) throw new AdderError('ImportError', `cannot import name '${name}' from '${displayModule}'`, node.line);
      scope.set(alias || name, mod[name]);
    }
  }
  return null;
}

// re-export for cell.js

// -- runtime.js --

// adder transpile runtime — Python semantics helpers called from AIR-emitted JS.
// Small monomorphic functions that V8 inlines. Reuses builtins.js internals.


// ── Arithmetic (preserve Python semantics) ──

function _add(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (typeof a === 'string' && typeof b === 'string') return a + b;
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  // dunder fallback
  if (a !== null && typeof a === 'object' && typeof a.__add__ === 'function') return a.__add__(b);
  if (b !== null && typeof b === 'object' && typeof b.__radd__ === 'function') return b.__radd__(a);
  throw new AdderError('TypeError', `unsupported operand type(s) for +: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

// In-place add used by `+=`. Python semantics: try __iadd__ first; if the
// LHS is a mutable container (list, set), extend it in-place; otherwise
// fall through to _add (creates a new value, caller rebinds via the
// surrounding assignment). Always returns the value to rebind.
function _iadd(a, b) {
  if (a !== null && typeof a === 'object' && typeof a.__iadd__ === 'function') {
    return a.__iadd__(b);
  }
  if (Array.isArray(a)) {
    // list += iterable — Python list.__iadd__ accepts any iterable.
    if (Array.isArray(b)) {
      for (const x of b) a.push(x);
    } else if (typeof b === 'string') {
      for (const ch of b) a.push(ch);
    } else if (b !== null && b !== undefined) {
      for (const x of pyIter(b)) a.push(x);
    }
    return a;
  }
  return _add(a, b);
}

function _sub(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a !== null && typeof a === 'object' && typeof a.__sub__ === 'function') return a.__sub__(b);
  if (b !== null && typeof b === 'object' && typeof b.__rsub__ === 'function') return b.__rsub__(a);
  throw new AdderError('TypeError', `unsupported operand type(s) for -: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _mul(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a * b;
  if (typeof a === 'string' && typeof b === 'number') return a.repeat(b);
  if (typeof a === 'number' && typeof b === 'string') return b.repeat(a);
  if (Array.isArray(a) && typeof b === 'number') { const r = []; for (let i = 0; i < b; i++) r.push(...a); return r; }
  if (typeof a === 'number' && Array.isArray(b)) { const r = []; for (let i = 0; i < a; i++) r.push(...b); return r; }
  if (a !== null && typeof a === 'object' && typeof a.__mul__ === 'function') return a.__mul__(b);
  if (b !== null && typeof b === 'object' && typeof b.__rmul__ === 'function') return b.__rmul__(a);
  throw new AdderError('TypeError', `unsupported operand type(s) for *: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _div(a, b) {
  if (b === 0) throw new AdderError('ZeroDivisionError', 'division by zero');
  if (typeof a === 'number' && typeof b === 'number') return a / b;
  if (a !== null && typeof a === 'object' && typeof a.__truediv__ === 'function') return a.__truediv__(b);
  throw new AdderError('TypeError', `unsupported operand type(s) for /: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _floordiv(a, b) {
  if (b === 0) throw new AdderError('ZeroDivisionError', 'integer division or modulo by zero');
  if (typeof a === 'number' && typeof b === 'number') return Math.floor(a / b);
  if (a !== null && typeof a === 'object' && typeof a.__floordiv__ === 'function') return a.__floordiv__(b);
  throw new AdderError('TypeError', `unsupported operand type(s) for //: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _mod(a, b) {
  if (b === 0) throw new AdderError('ZeroDivisionError', 'integer division or modulo by zero');
  if (typeof a === 'string') return _strPctFormat(a, Array.isArray(b) ? b : [b]);
  if (typeof a === 'number' && typeof b === 'number') return ((a % b) + b) % b;
  if (a !== null && typeof a === 'object' && typeof a.__mod__ === 'function') return a.__mod__(b);
  throw new AdderError('TypeError', `unsupported operand type(s) for %: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _pow(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.pow(a, b);
  if (a !== null && typeof a === 'object' && typeof a.__pow__ === 'function') return a.__pow__(b);
  throw new AdderError('TypeError', `unsupported operand type(s) for **: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _strPctFormat(fmt, args) {
  let i = 0;
  return fmt.replace(/%([sd%fegx])/g, (_, code) => {
    if (code === '%') return '%';
    return pyStr(args[i++]);
  });
}

// ── Comparison ──

function _eq(a, b) {
  if (a === b) return true;
  if (a !== null && typeof a === 'object' && typeof a.__eq__ === 'function') return a.__eq__(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_eq(a[i], b[i])) return false;
    return true;
  }
  return false;
}

function _neq(a, b) {
  if (a !== null && typeof a === 'object' && typeof a.__ne__ === 'function') return a.__ne__(b);
  return !_eq(a, b);
}

function _lt(a, b) {
  if (a !== null && typeof a === 'object' && typeof a.__lt__ === 'function') return a.__lt__(b);
  if (typeof a === 'number' && typeof b === 'number') return a < b;
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  if (Array.isArray(a) && Array.isArray(b)) {
    const min = Math.min(a.length, b.length);
    for (let i = 0; i < min; i++) { if (_lt(a[i], b[i])) return true; if (_lt(b[i], a[i])) return false; }
    return a.length < b.length;
  }
  return a < b;
}

function _lte(a, b) {
  if (a !== null && typeof a === 'object' && typeof a.__le__ === 'function') return a.__le__(b);
  return _lt(a, b) || _eq(a, b);
}

function _gt(a, b) {
  if (a !== null && typeof a === 'object' && typeof a.__gt__ === 'function') return a.__gt__(b);
  return _lt(b, a);
}

function _gte(a, b) {
  if (a !== null && typeof a === 'object' && typeof a.__ge__ === 'function') return a.__ge__(b);
  return _lt(b, a) || _eq(a, b);
}

function _contains(container, value) {
  if (typeof container === 'string') return container.includes(String(value));
  if (Array.isArray(container)) return container.some(v => _eq(v, value));
  if (container instanceof Map) return container.has(value);
  if (container instanceof Set) return container.has(value);
  if (container instanceof AdderRange) return container.includes(value);
  if (container !== null && typeof container === 'object') {
    if (typeof container.__contains__ === 'function') return container.__contains__(value);
    return value in container;
  }
  throw new AdderError('TypeError', `argument of type '${pyTypeName(container)}' is not iterable`);
}

// ── Subscript ──

// 2D ndarray-shape tuple subscript — accepts any object with
// `data: Float64Array` + `shape: [n, m]`. Returns scalar / row /
// column / sub-matrix depending on the key shape. Used by both
// `_py.getitem` and `_py.setitem` so libraries (learn, scitra) that
// return `{data, shape}` are subscriptable with tuple keys without
// each one having to ship its own `__getitem__`.
function _ndarrayTupleGet(obj, key) {
  const [n, m] = obj.shape;
  const d = _ndarrayData(obj);
  const rk = key[0], ck = key[1];
  // scalar + scalar → value
  if (typeof rk === 'number' && typeof ck === 'number') {
    const i = rk < 0 ? n + rk : rk;
    const j = ck < 0 ? m + ck : ck;
    return d[i * m + j];
  }
  // scalar row + slice col → row vector (m or sub)
  if (typeof rk === 'number' && rk._slice == null && ck && ck._slice) {
    const i = rk < 0 ? n + rk : rk;
    const lo = ck.lower != null ? ck.lower : 0;
    const hi = ck.upper != null ? Math.min(ck.upper, m) : m;
    const out = new Float64Array(hi - lo);
    for (let k = 0; k < hi - lo; k++) out[k] = d[i * m + lo + k];
    out.shape = [out.length];
    return out;
  }
  // slice row + scalar col → column vector
  if (rk && rk._slice && typeof ck === 'number') {
    const lo = rk.lower != null ? rk.lower : 0;
    const hi = rk.upper != null ? Math.min(rk.upper, n) : n;
    const j = ck < 0 ? m + ck : ck;
    const out = new Float64Array(hi - lo);
    for (let i = 0; i < hi - lo; i++) out[i] = d[(lo + i) * m + j];
    out.shape = [out.length];
    return out;
  }
  // slice + slice → 2D sub-matrix
  if (rk && rk._slice && ck && ck._slice) {
    const r0 = rk.lower != null ? rk.lower : 0;
    const r1 = rk.upper != null ? Math.min(rk.upper, n) : n;
    const c0 = ck.lower != null ? ck.lower : 0;
    const c1 = ck.upper != null ? Math.min(ck.upper, m) : m;
    const rows = r1 - r0;
    const cols = c1 - c0;
    const out = new Float64Array(rows * cols);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) out[i * cols + j] = d[(r0 + i) * m + (c0 + j)];
    }
    out.shape = [rows, cols];
    return out;
  }
  throw new AdderError('TypeError', `ndarray: unsupported tuple subscript shape`);
}

function _looksLikeNdarray(obj) {
  if (!obj || !Array.isArray(obj.shape) || obj.shape.length !== 2) return false;
  if (obj.data instanceof Float64Array) return true;
  // learn's transformers return a Float64Array directly with `.shape`
  // tacked on as an own property — no wrapping object.
  if (obj instanceof Float64Array) return true;
  return false;
}

function _ndarrayData(obj) {
  return obj instanceof Float64Array ? obj : obj.data;
}

function _getitem(obj, key) {
  if (obj === null || obj === undefined) {
    throw new AdderError('TypeError', `'NoneType' object is not subscriptable`);
  }
  // 2D ndarray with tuple subscript — handle natively so libraries
  // returning `{data: Float64Array, shape: [n, m]}` (learn's transform
  // outputs, etc.) support `x[i, j]` / `x[:, 0]` without needing their
  // own __getitem__.
  if (Array.isArray(key) && _looksLikeNdarray(obj)) {
    return _ndarrayTupleGet(obj, key);
  }
  if (obj instanceof Map) {
    if (!obj.has(key)) throw new AdderError('KeyError', pyRepr(key));
    return obj.get(key);
  }
  if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array) {
    const idx = key < 0 ? obj.length + key : key;
    if (idx < 0 || idx >= obj.length) throw new AdderError('IndexError', `${pyTypeName(obj)} index out of range`);
    return obj[idx];
  }
  if (typeof obj === 'object') {
    if (typeof obj.__getitem__ === 'function') return obj.__getitem__(key);
    if (key in obj) return obj[key];
    throw new AdderError('KeyError', pyRepr(key));
  }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object is not subscriptable`);
}

function _setitem(obj, key, value) {
  if (obj instanceof Map) { obj.set(key, value); return; }
  if (Array.isArray(obj)) {
    const idx = key < 0 ? obj.length + key : key;
    obj[idx] = value;
    return;
  }
  // 2D ndarray with tuple key (`x_trans[:, 1] = 0.0`). Mirrors the
  // getitem path — accepts `{data: Float64Array, shape}` wrappers and
  // bare Float64Arrays-with-shape. Value can be a scalar (broadcast)
  // or an iterable (must match the assigned slice length).
  if (Array.isArray(key) && _looksLikeNdarray(obj)) {
    _ndarrayTupleSet(obj, key, value);
    return;
  }
  if (typeof obj === 'object' && obj !== null) {
    if (typeof obj.__setitem__ === 'function') { obj.__setitem__(key, value); return; }
    obj[key] = value;
    return;
  }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object does not support item assignment`);
}

function _ndarrayTupleSet(obj, key, value) {
  const [n, m] = obj.shape;
  const d = _ndarrayData(obj);
  const rk = key[0], ck = key[1];
  const _broadcast = (write, len) => {
    if (value != null && typeof value !== 'string'
        && typeof value[Symbol.iterator] === 'function') {
      const flat = [...value];
      if (flat.length !== len) {
        throw new AdderError('ValueError', `cannot broadcast ${flat.length} values to ${len} positions`);
      }
      for (let i = 0; i < len; i++) write(i, flat[i]);
    } else {
      for (let i = 0; i < len; i++) write(i, value);
    }
  };

  // scalar + scalar — single cell
  if (typeof rk === 'number' && typeof ck === 'number') {
    const i = rk < 0 ? n + rk : rk;
    const j = ck < 0 ? m + ck : ck;
    d[i * m + j] = value;
    return;
  }
  // slice row + scalar col → column slice
  if (rk && rk._slice && typeof ck === 'number') {
    const lo = rk.lower != null ? rk.lower : 0;
    const hi = rk.upper != null ? Math.min(rk.upper, n) : n;
    const j = ck < 0 ? m + ck : ck;
    _broadcast((i, v) => { d[(lo + i) * m + j] = v; }, hi - lo);
    return;
  }
  // scalar row + slice col → row slice
  if (typeof rk === 'number' && ck && ck._slice) {
    const i = rk < 0 ? n + rk : rk;
    const lo = ck.lower != null ? ck.lower : 0;
    const hi = ck.upper != null ? Math.min(ck.upper, m) : m;
    _broadcast((k, v) => { d[i * m + lo + k] = v; }, hi - lo);
    return;
  }
  // slice + slice → 2D sub-block
  if (rk && rk._slice && ck && ck._slice) {
    const r0 = rk.lower != null ? rk.lower : 0;
    const r1 = rk.upper != null ? Math.min(rk.upper, n) : n;
    const c0 = ck.lower != null ? ck.lower : 0;
    const c1 = ck.upper != null ? Math.min(ck.upper, m) : m;
    const rows = r1 - r0, cols = c1 - c0;
    // Scalar value → fill block
    if (value == null || typeof value === 'number'
        || typeof value === 'string'
        || typeof value[Symbol.iterator] !== 'function') {
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) d[(r0 + i) * m + (c0 + j)] = value;
      }
      return;
    }
    throw new AdderError('TypeError', 'ndarray block assignment from iterable not yet supported');
  }
  throw new AdderError('TypeError', `ndarray: unsupported tuple subscript shape`);
}

function _slice(obj, lower, upper, step) {
  step = step ?? 1;
  if (step === 0) throw new AdderError('ValueError', 'slice step cannot be zero');
  if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Uint8Array) {
    const len = obj.length;
    if (step === 1) {
      const l = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
      const u = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
      return obj.slice(l, u);
    }
    const positive = step > 0;
    let l = lower == null ? (positive ? 0 : len - 1) : lower < 0 ? Math.max(positive ? 0 : -1, len + lower) : Math.min(lower, positive ? len : len - 1);
    let u = upper == null ? (positive ? len : -1) : upper < 0 ? Math.max(positive ? 0 : -1, len + upper) : Math.min(upper, positive ? len : len - 1);
    const result = [];
    if (positive) { for (let i = l; i < u; i += step) result.push(obj[i]); }
    else { for (let i = l; i > u; i += step) result.push(obj[i]); }
    return typeof obj === 'string' ? result.join('') : result;
  }
  if (typeof obj?.__getitem__ === 'function') {
    return obj.__getitem__({ _slice: true, lower, upper, step });
  }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object is not subscriptable`);
}

function _rtSliceIndices(len, lower, upper, step) {
  let start, stop;
  if (step > 0) {
    start = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
    stop = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
  } else {
    start = lower == null ? len - 1 : lower < 0 ? Math.max(-1, len + lower) : Math.min(lower, len - 1);
    stop = upper == null ? -1 : upper < 0 ? Math.max(-1, len + upper) : upper;
  }
  const out = [];
  if (step > 0) { for (let i = start; i < stop; i += step) out.push(i); }
  else { for (let i = start; i > stop; i += step) out.push(i); }
  return out;
}

function _setslice(obj, lower, upper, step, value) {
  if (typeof obj === 'string') {
    throw new AdderError('TypeError', "'str' object does not support item assignment");
  }
  if (obj instanceof Uint8Array) {
    throw new AdderError('TypeError', "'bytes' object does not support item assignment");
  }
  if (typeof obj?.__setitem__ === 'function') {
    obj.__setitem__({ _slice: true, lower, upper, step }, value);
    return;
  }
  if (!Array.isArray(obj)) {
    throw new AdderError('TypeError', `'${pyTypeName(obj)}' object does not support slice assignment`);
  }
  const rhs = [...pyIter(value)];
  const effectiveStep = step ?? 1;
  if (effectiveStep === 0) throw new AdderError('ValueError', 'slice step cannot be zero');
  if (effectiveStep === 1) {
    const len = obj.length;
    const l = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
    const u = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
    const removeCount = Math.max(0, u - l);
    obj.splice(l, removeCount, ...rhs);
    return;
  }
  const indices = _rtSliceIndices(obj.length, lower, upper, effectiveStep);
  if (rhs.length !== indices.length) {
    throw new AdderError(
      'ValueError',
      `attempt to assign sequence of size ${rhs.length} to extended slice of size ${indices.length}`,
    );
  }
  for (let k = 0; k < indices.length; k++) obj[indices[k]] = rhs[k];
}

function _delslice(obj, lower, upper, step) {
  if (typeof obj === 'string') {
    throw new AdderError('TypeError', "'str' object doesn't support item deletion");
  }
  if (obj instanceof Uint8Array) {
    throw new AdderError('TypeError', "'bytes' object doesn't support item deletion");
  }
  if (typeof obj?.__delitem__ === 'function') {
    obj.__delitem__({ _slice: true, lower, upper, step });
    return;
  }
  if (!Array.isArray(obj)) {
    throw new AdderError('TypeError', `'${pyTypeName(obj)}' object doesn't support slice deletion`);
  }
  const effectiveStep = step ?? 1;
  if (effectiveStep === 0) throw new AdderError('ValueError', 'slice step cannot be zero');
  if (effectiveStep === 1) {
    const len = obj.length;
    const l = lower == null ? 0 : lower < 0 ? Math.max(0, len + lower) : Math.min(lower, len);
    const u = upper == null ? len : upper < 0 ? Math.max(0, len + upper) : Math.min(upper, len);
    if (u > l) obj.splice(l, u - l);
    return;
  }
  const indices = _rtSliceIndices(obj.length, lower, upper, effectiveStep);
  indices.sort((a, b) => b - a);
  for (const i of indices) obj.splice(i, 1);
}

// ── Method-call PIC (polymorphic inline cache) ──
//
// `obj.method(args)` in adder lowers to `await _py.callMethod(obj, name,
// siteId, ...args)`. Each call site has a unique siteId allocated by the
// lowerer; the helper keeps a tiny (type → unbound_method) cache keyed
// off siteId. On hit, skip adderGetAttr's type-dispatch chain entirely
// and skip the bound-method closure allocation.
//
// Layout: _PIC[siteId] = { types, methods, next } — arrays of length
// 0..PIC_SIZE. FIFO eviction once full so a 5-way polymorphic site
// (e.g. richards' task-table) cycles instead of going megamorphic.
//
// Class-instance fast path only. Primitives (string, array, Map, …) and
// modules fall through to adderGetAttr because their per-type method
// tables (`_strMethod`, `_listMethod`, etc.) build a fresh closure per
// call — caching one would alias the receiver across instances. The
// adderGetAttr slow path already returns the right closure for these.

const _PIC_SIZE = 4;
const _PIC = [];

// Sync function — the underlying method may be sync OR async, and JS
// `return` preserves that polarity. Wrapping this helper in `async`
// would wrap every return in `Promise.resolve()` even when the method
// is sync, paying the Promise allocation on every method call.
// The caller's `await _py.callMethod(...)` handles both shapes.
function _callMethod(obj, name, siteId, ...args) {
  // Fast path: scan the cache for a matching __adderType__.
  const t = (obj !== null && obj !== undefined) ? obj.__adderType__ : undefined;
  const cache = _PIC[siteId];
  if (cache && t !== undefined) {
    const types = cache.types;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === t) return cache.methods[i].call(obj, ...args);
    }
  }
  // Slow path: full adderGetAttr lookup + call.
  const fn = adderGetAttr(obj, name);
  const result = fn(...args);

  // Populate the cache for class-instance receivers. We cache the
  // wrapper on `t.prototype[name]` (a non-_pyFunc function whose `this`
  // gets bound to the receiver at call time via `.call(obj, ...)`).
  // Skip caching for primitives / dicts / modules — adderGetAttr there
  // returns receiver-bound closures whose identity changes per call.
  if (t !== undefined && t.prototype && typeof t.prototype[name] === 'function') {
    let c = cache;
    if (!c) {
      c = { types: [], methods: [], next: 0 };
      _PIC[siteId] = c;
    }
    if (c.types.length < _PIC_SIZE) {
      c.types.push(t);
      c.methods.push(t.prototype[name]);
    } else {
      // FIFO eviction so a 5-way polymorphic site cycles instead of
      // pinning to the first 4 types it ever saw.
      const idx = c.next;
      c.types[idx] = t;
      c.methods[idx] = t.prototype[name];
      c.next = (idx + 1) % _PIC_SIZE;
    }
  }
  return result;
}

// ── Context manager __exit__ ──

// Called by `with` lowering. When the body completes normally, `exc` is
// null and __exit__ is called with (None, None, None); the return value
// is ignored. When the body raised, `exc` is the error and __exit__ is
// called with (type, exc, None); a truthy return value indicates the
// exception is suppressed (the lowerer checks and only re-raises on
// falsy). __exit__ may be async — we must AWAIT it so the lowered call
// site's `await _py.exitWith(...)` actually waits for side effects
// (e.g. a file open(..., "w") that flushes to the VFS on close).
async function _exitWith(mgr, exc) {
  if (mgr === null || mgr === undefined || typeof mgr.__exit__ !== 'function') {
    throw new AdderError(
      'AttributeError',
      `'${pyTypeName(mgr)}' object has no attribute '__exit__'`,
    );
  }
  if (exc === null || exc === undefined) {
    // Normal-exit path: discard return; CPython does likewise here.
    await mgr.__exit__(null, null, null);
    return false;
  }
  // Exception path: pass (type, value, None) and return suppression flag.
  const excType =
    (exc !== null && typeof exc === 'object' && exc.__class__) ||
    (exc && exc.constructor) ||
    null;
  return await mgr.__exit__(excType, exc, null);
}

// ── Attribute access ──

function _getattr(obj, name) {
  return adderGetAttr(obj, name);
}

function _setattr(obj, name, value) {
  // typeof check accepts both 'object' (instances) and 'function' (adder
  // classes — class-attribute assignment patterns like
  // `Strength.REQUIRED = Strength(0)` deltablue uses for module-level
  // singletons set after the class body has evaluated).
  if (obj !== null && (typeof obj === 'object' || typeof obj === 'function')) {
    obj[name] = value;
  }
}

function _delitem(obj, key) {
  if (obj instanceof Map) { obj.delete(key); return; }
  if (Array.isArray(obj)) {
    const idx = key < 0 ? obj.length + key : key;
    obj.splice(idx, 1);
    return;
  }
  if (obj instanceof Set) { obj.delete(key); return; }
  if (obj !== null && typeof obj === 'object') {
    if (typeof obj.__delitem__ === 'function') { obj.__delitem__(key); return; }
    delete obj[key];
    return;
  }
  throw new AdderError('TypeError', `'${pyTypeName(obj)}' object does not support item deletion`);
}

function _delattr(obj, name) {
  if (obj !== null && typeof obj === 'object') delete obj[name];
}

function _makeDict(keys, values) {
  const m = new Map();
  for (let i = 0; i < keys.length; i++) m.set(keys[i], values[i]);
  return m;
}

function _makeSet(arr) {
  return new Set(arr);
}

// ── Imports ──

async function _import(name) {
  let mod = _resolveModule(name);
  if (mod) return mod;
  mod = await _loadVfsModule(name);
  if (mod) return mod;
  mod = await _loadAuditableModule(name);
  if (mod) return mod;
  mod = await _loadHttpModule(name);
  if (mod) return mod;
  throw new AdderError('ModuleNotFoundError', `No module named '${name}'`);
}

async function _importPath(path) {
  const mod = await _loadDirectModule(path);
  if (mod) return mod;
  throw new AdderError('ModuleNotFoundError', `cannot load module from '${path}'`);
}

async function _importFrom(moduleName, names) {
  // names: array of { name, alias } (or special "*" to expose all)
  let mod = _resolveModule(moduleName);
  if (!mod) mod = await _loadVfsModule(moduleName);
  if (!mod) mod = await _loadAuditableModule(moduleName);
  if (!mod) mod = await _loadHttpModule(moduleName);
  if (!mod) throw new AdderError('ModuleNotFoundError', `No module named '${moduleName}'`);
  return _extractFromImport(mod, names, moduleName);
}

async function _importFromPath(path, names) {
  const mod = await _loadDirectModule(path);
  if (!mod) throw new AdderError('ModuleNotFoundError', `cannot load module from '${path}'`);
  return _extractFromImport(mod, names, path);
}

function _extractFromImport(mod, names, displayName) {
  const result = {};
  for (const { name, alias } of names) {
    if (name === '*') {
      for (const k of Object.keys(mod)) result[k] = mod[k];
    } else {
      if (!(name in mod)) {
        throw new AdderError('ImportError', `cannot import name '${name}' from '${displayName}'`);
      }
      result[alias || name] = mod[name];
    }
  }
  return result;
}

// ── Class creation ──
// Mirrors _evalClass in eval.js, but takes pre-evaluated bases and members.

function _rtComputeMRO(cls) {
  if (!cls._pyBases || cls._pyBases.length === 0) return [cls];
  const baseMROs = cls._pyBases.map(b => [..._rtComputeMRO(b)]);
  const result = [cls];
  const lists = [...baseMROs, [...cls._pyBases]];
  while (lists.some(l => l.length > 0)) {
    let head = null;
    for (const list of lists) {
      if (list.length === 0) continue;
      const candidate = list[0];
      if (lists.every(l => { const idx = l.indexOf(candidate); return idx <= 0; })) { head = candidate; break; }
    }
    if (!head) throw new AdderError('TypeError', 'Cannot create a consistent method resolution order');
    result.push(head);
    for (const list of lists) { const idx = list.indexOf(head); if (idx !== -1) list.splice(idx, 1); }
  }
  return result;
}

function _createClass(name, bases, members) {
  // `class X(list): …` — instance must BE an Array so native list methods
  // (append/pop/indexing) dispatch via adderGetAttr's Array branch. See
  // _evalClass for the mirror-image logic on the tree-walker side.
  const listBase = (bases || []).find(b => b && b._pyContainerType === 'list');
  const cls = function (...args) {
    const instance = listBase
      ? Object.assign(args.length > 0 ? [...pyIter(args[0])] : [], { __adderClass__: name, __adderType__: cls })
      : Object.create(cls.prototype);
    if (!listBase) {
      instance.__adderClass__ = name;
      instance.__adderType__ = cls;
    }
    for (const [k, v] of Object.entries(members)) {
      if (typeof v !== 'function' && !(v && (v.__property__ || v.__staticmethod__ || v.__classmethod__))) {
        instance[k] = v;
      }
    }
    if (typeof cls.prototype.__init__ === 'function') {
      const result = cls.prototype.__init__.call(instance, ...args);
      if (result instanceof Promise) return result.then(() => instance);
    }
    return instance;
  };

  cls.prototype = {};
  cls._pyName = name;
  cls._pyClass = true;
  cls._pyBases = (bases || []).filter(b => b?._pyClass);

  const mro = _rtComputeMRO(cls);
  cls._pyMRO = mro;

  // Inherit methods from MRO
  for (let i = mro.length - 1; i >= 1; i--) {
    const base = mro[i];
    if (!base.prototype || !base._pyOwnMembers) continue;
    for (const key of base._pyOwnMembers) {
      const desc = Object.getOwnPropertyDescriptor(base.prototype, key);
      if (desc) Object.defineProperty(cls.prototype, key, desc);
    }
  }

  for (const [mName, value] of Object.entries(members)) {
    if (value && value.__property__) {
      const fget = value.fget;
      const fset = value.fset;
      const desc = { get() { return fget(this); }, configurable: true, enumerable: true };
      if (fset) {
        const setFn = function(v) { fset(this, v); };
        setFn._pyFset = fset;
        desc.set = setFn;
      }
      Object.defineProperty(cls.prototype, mName, desc);
    } else if (value && value.__staticmethod__) {
      const rawFn = value.fn;
      const sm = (...args) => rawFn(...args);
      sm._pyName = `${name}.${mName}`;
      cls.prototype[mName] = sm;
      cls[mName] = sm;
    } else if (value && value.__classmethod__) {
      const originalFn = value.fn;
      const cm = function (...args) { return originalFn(cls, ...args); };
      cm._pyName = `${name}.${mName}`;
      cls.prototype[mName] = cm;
      cls[mName] = cm;
    } else if (typeof value === 'function') {
      const originalFn = value;
      cls.prototype[mName] = function (...args) { return originalFn(this, ...args); };
      cls.prototype[mName]._pyName = `${name}.${mName}`;
      // Python unbound-method access (`ClassName.method(instance, ...)`).
      // Arrow form so adderGetAttr's `.bind(obj)` doesn't pin `this` to
      // the class. Mirror of the tree-walker's _evalClass branch.
      cls[mName] = (...args) => originalFn(...args);
    }
  }

  for (const [k, v] of Object.entries(members)) {
    if (typeof v !== 'function' && !(v && (v.__property__ || v.__staticmethod__ || v.__classmethod__))) {
      cls[k] = v;
    }
  }

  // Inherit class-level method bindings from MRO bases. Walk furthest-
  // first so closer bases win, and skip keys this class already owns —
  // without the hasOwnProperty guard the parent's binding would silently
  // overwrite the child's own definition.
  for (let i = mro.length - 1; i >= 1; i--) {
    const base = mro[i];
    if (!base._pyOwnMembers) continue;
    for (const key of base._pyOwnMembers) {
      if (Object.prototype.hasOwnProperty.call(cls, key)) continue;
      if (key in base && typeof base[key] === 'function') cls[key] = base[key];
    }
  }

  cls._pyOwnMembers = new Set();
  for (const [mName, value] of Object.entries(members)) {
    if (typeof value === 'function' || (value && (value.__property__ || value.__staticmethod__ || value.__classmethod__))) {
      cls._pyOwnMembers.add(mName);
    }
  }

  return cls;
}

// ── Exception matching (for try/except) ──

// _excParents comes from builtins.js

function _rtMatchException(error, excTypeVal) {
  if (!excTypeVal) return true;
  if (Array.isArray(excTypeVal)) return excTypeVal.some(t => _rtMatchException(error, t));
  if (error instanceof AdderError) {
    const targetName = typeof excTypeVal === 'function'
      ? (excTypeVal._pyName || excTypeVal.name)
      : (typeof excTypeVal === 'string' ? excTypeVal : null);
    if (targetName) {
      if (error.pyType === targetName) return true;
      let pt = _excParents[error.pyType];
      while (pt) { if (pt === targetName) return true; pt = _excParents[pt]; }
    }
  }
  if (typeof excTypeVal === 'function' && excTypeVal._pyClass && error !== null && typeof error === 'object') {
    let proto = error;
    while (proto) {
      if (proto.__adderClass__ === (excTypeVal._pyName || excTypeVal.name)) return true;
      proto = Object.getPrototypeOf(proto);
    }
  }
  if (typeof excTypeVal === 'function' && !excTypeVal._pyClass) {
    try { return error instanceof excTypeVal; } catch { /* arrow fn */ }
  }
  return false;
}

// ── Unary ──

function _neg(a) {
  if (typeof a === 'number') return -a;
  if (a !== null && typeof a === 'object' && typeof a.__neg__ === 'function') return a.__neg__();
  throw new AdderError('TypeError', `bad operand type for unary -: '${pyTypeName(a)}'`);
}

function _pos(a) {
  if (typeof a === 'number') return +a;
  return a;
}

function _invert(a) {
  if (typeof a === 'number') return ~a;
  // dunder fallback so e.g. sadpan's BooleanMask.__invert__ fires
  if (a !== null && typeof a === 'object' && typeof a.__invert__ === 'function') return a.__invert__();
  throw new AdderError('TypeError', `bad operand type for unary ~: '${pyTypeName(a)}'`);
}

// ── Bitwise (with dunder fallback) ──
// Lowered from `&`, `|`, `^` between values whose types AIR can't prove
// are ints. Fast-path real ints to native bitwise; fall through to
// __and__/__or__/__xor__ so libraries like sadpan can overload (their
// BooleanMask combines via these). The constant-fold pass in passes.js
// can short-circuit back to native bitwise once both operands are typed.

function _and_(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a & b;
  if (a !== null && typeof a === 'object' && typeof a.__and__ === 'function') return a.__and__(b);
  if (b !== null && typeof b === 'object' && typeof b.__rand__ === 'function') return b.__rand__(a);
  throw new AdderError('TypeError', `unsupported operand type(s) for &: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _or_(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a | b;
  if (a !== null && typeof a === 'object' && typeof a.__or__ === 'function') return a.__or__(b);
  if (b !== null && typeof b === 'object' && typeof b.__ror__ === 'function') return b.__ror__(a);
  throw new AdderError('TypeError', `unsupported operand type(s) for |: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

function _xor(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a ^ b;
  if (a !== null && typeof a === 'object' && typeof a.__xor__ === 'function') return a.__xor__(b);
  if (b !== null && typeof b === 'object' && typeof b.__rxor__ === 'function') return b.__rxor__(a);
  throw new AdderError('TypeError', `unsupported operand type(s) for ^: '${pyTypeName(a)}' and '${pyTypeName(b)}'`);
}

// ── Function call with kwargs ──

function _call(fn, args, kwargs) {
  if (typeof fn !== 'function') {
    if (fn !== null && typeof fn === 'object' && typeof fn.__call__ === 'function') {
      return fn.__call__(...(args || []));
    }
    throw new AdderError('TypeError', `'${pyTypeName(fn)}' object is not callable`);
  }
  if (kwargs) {
    const kw = { _kw: true, ...kwargs };
    return fn(...(args || []), kw);
  }
  return fn(...(args || []));
}

// ── Iteration helpers ──

// Convert any iterable to an array (for for-of compatibility)
function _iterArray(obj) {
  if (Array.isArray(obj)) return obj;
  if (typeof obj === 'string') return obj;  // strings iterate char-by-char in JS for...of
  // Async iterables can't be materialised synchronously — return a Promise
  // and let the call site `await` it. Returning a sync iterable on the
  // common path keeps that fast path free of microtasks.
  if (obj && typeof obj[Symbol.asyncIterator] === 'function') {
    return (async () => {
      const out = [];
      for await (const v of obj) out.push(v);
      return out;
    })();
  }
  return [...pyIter(obj)];
}

// ── Exceptions ──

function _raise(exc) {
  if (exc instanceof Error) throw exc;
  if (exc instanceof AdderError) throw exc;
  if (typeof exc === 'string') throw new AdderError('Exception', exc);
  throw exc;
}

// ── Export as single namespace ──

const _py = {
  // arithmetic
  add: _add, sub: _sub, mul: _mul, div: _div,
  floordiv: _floordiv, mod: _mod, pow: _pow,
  // in-place: __iadd__ dispatch + list extend semantics for `+=`
  iadd: _iadd,
  // bitwise (with dunder fallback for masks/sets/etc.)
  and_: _and_, or_: _or_, xor: _xor,
  // unary
  neg: _neg, pos: _pos, invert: _invert,
  // comparison
  eq: _eq, neq: _neq, lt: _lt, lte: _lte, gt: _gt, gte: _gte,
  contains: _contains,
  // subscript
  getitem: _getitem, setitem: _setitem, slice: _slice,
  setslice: _setslice, delslice: _delslice,
  // Marker object for slice elements inside a tuple subscript
  // (`arr[i:j, k]` lowers to `getitem(obj, [makeSlice(i,j,null), k])`
  // — the consumer's __getitem__ destructures via `_slice` flag).
  makeSlice: (lower, upper, step) => ({ _slice: true, lower, upper, step }),
  // context manager __exit__ (with statement)
  exitWith: _exitWith,
  // attribute
  getattr: _getattr, setattr: _setattr,
  callMethod: _callMethod,
  delitem: _delitem, delattr: _delattr,
  // dict/set construction
  makeDict: _makeDict, makeSet: _makeSet,
  // call
  call: _call,
  // iteration
  iter: _iterArray,
  // truthiness
  truthy: pyBool,
  // string formatting
  fmt: pyFormatValue,
  str: pyStr,
  repr: pyRepr,
  // exception
  raise: _raise,
  matchException: _rtMatchException,
  // imports
  import: _import,
  importPath: _importPath,
  importFrom: _importFrom,
  importFromPath: _importFromPath,
  // class
  createClass: _createClass,
};

// -- runner.js --

// @gcu/adder — high-level runtime API (tree-walker path).
// Companion: @gcu/adder/air exports the same API backed by AIR transpilation
// (15-300x faster), at the cost of requiring @gcu/air as a peer dep.




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
async function run(code, opts = {}) {
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
async function evalExpr(code, opts = {}) {
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
function compile(code) {
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
function isIncomplete(code) {
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

// -- highlight.js --

// Python syntax tokenizer + completions

const PYTHON_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield',
];

const PYTHON_BUILTINS = [
  'abs', 'all', 'any', 'bin', 'bool', 'bytes', 'callable', 'chr',
  'dict', 'dir', 'divmod', 'enumerate', 'filter', 'float', 'format',
  'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'hex', 'id',
  'input', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list',
  'locals', 'map', 'max', 'min', 'next', 'object', 'oct', 'open',
  'ord', 'pow', 'print', 'range', 'repr', 'reversed', 'round', 'set',
  'setattr', 'slice', 'sorted', 'str', 'sum', 'super', 'tuple', 'type',
  'vars', 'zip',
];

const _kwSet = new Set(PYTHON_KEYWORDS);
const _builtinSet = new Set(PYTHON_BUILTINS);

// string prefixes: f, r, b, u and combinations
const _strPrefixRe = /^[fFrRbBuU]{0,3}$/;

function tokenizePython(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      const start = i;
      while (i < len && (code[i] === ' ' || code[i] === '\t' || code[i] === '\n' || code[i] === '\r')) i++;
      tokens.push({ type: 'ws', text: code.slice(start, i) });
      continue;
    }

    // comment
    if (ch === '#') {
      const start = i;
      while (i < len && code[i] !== '\n') i++;
      tokens.push({ type: 'cmt', text: code.slice(start, i) });
      continue;
    }

    // decorator
    if (ch === '@' && (i === 0 || code[i - 1] === '\n')) {
      const start = i;
      i++;
      while (i < len && /[\w.]/.test(code[i])) i++;
      tokens.push({ type: 'dec', text: code.slice(start, i) });
      continue;
    }

    // strings — handle prefixes and triple/single quotes
    if (ch === '"' || ch === "'" || (_strPrefixRe.test(code.slice(Math.max(0, i - 3), i + 1).replace(/['"]/g, '')) && (code[i + 1] === '"' || code[i + 1] === "'"))) {
      // check for string prefix
      let prefixLen = 0;
      if (ch !== '"' && ch !== "'") {
        let j = i;
        while (j < len && /[fFrRbBuU]/.test(code[j])) j++;
        if (j < len && (code[j] === '"' || code[j] === "'")) {
          prefixLen = j - i;
        } else {
          // not a string, fall through to identifier
          prefixLen = 0;
        }
      }
      if (ch === '"' || ch === "'" || prefixLen > 0) {
        const start = i;
        i += prefixLen;
        if (i < len && (code[i] === '"' || code[i] === "'")) {
          const q = code[i];
          // triple quote?
          if (code[i + 1] === q && code[i + 2] === q) {
            i += 3;
            const end3 = q + q + q;
            while (i < len) {
              if (code[i] === '\\') { i += 2; continue; }
              if (code[i] === q && code[i + 1] === q && code[i + 2] === q) { i += 3; break; }
              i++;
            }
          } else {
            // single quote string
            i++;
            while (i < len && code[i] !== q && code[i] !== '\n') {
              if (code[i] === '\\') { i += 2; continue; }
              i++;
            }
            if (i < len && code[i] === q) i++;
          }
          tokens.push({ type: 'str', text: code.slice(start, i) });
          continue;
        }
      }
    }

    // numbers
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && code[i + 1] >= '0' && code[i + 1] <= '9')) {
      const start = i;
      if (ch === '0' && i + 1 < len && (code[i + 1] === 'x' || code[i + 1] === 'X' || code[i + 1] === 'o' || code[i + 1] === 'O' || code[i + 1] === 'b' || code[i + 1] === 'B')) {
        i += 2;
        while (i < len && /[\da-fA-F_]/.test(code[i])) i++;
      } else {
        while (i < len && /[\d_]/.test(code[i])) i++;
        if (i < len && code[i] === '.') { i++; while (i < len && /[\d_]/.test(code[i])) i++; }
        if (i < len && (code[i] === 'e' || code[i] === 'E')) { i++; if (i < len && (code[i] === '+' || code[i] === '-')) i++; while (i < len && /[\d_]/.test(code[i])) i++; }
      }
      if (i < len && (code[i] === 'j' || code[i] === 'J')) i++;
      tokens.push({ type: 'num', text: code.slice(start, i) });
      continue;
    }

    // identifiers / keywords / builtins
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      while (i < len && /[\w]/.test(code[i])) i++;
      const word = code.slice(start, i);

      // check if this is a string prefix followed by quote
      if (_strPrefixRe.test(word) && i < len && (code[i] === '"' || code[i] === "'")) {
        // rewind and let string handler deal with it
        i = start;
        // manually handle: prefix + string
        const strStart = i;
        i += word.length;
        const q = code[i];
        if (code[i + 1] === q && code[i + 2] === q) {
          i += 3;
          while (i < len) {
            if (code[i] === '\\') { i += 2; continue; }
            if (code[i] === q && code[i + 1] === q && code[i + 2] === q) { i += 3; break; }
            i++;
          }
        } else {
          i++;
          while (i < len && code[i] !== q && code[i] !== '\n') {
            if (code[i] === '\\') { i += 2; continue; }
            i++;
          }
          if (i < len && code[i] === q) i++;
        }
        tokens.push({ type: 'str', text: code.slice(strStart, i) });
        continue;
      }

      const type = _kwSet.has(word) ? 'kw' : _builtinSet.has(word) ? 'fn' : 'id';
      tokens.push({ type, text: code.slice(start, i) });
      continue;
    }

    // operators/punctuation
    const start = i;
    i++;
    tokens.push({ type: 'op', text: code.slice(start, i) });
  }

  return tokens;
}

function pythonCompletions(prefix) {
  const lc = prefix.toLowerCase();
  const results = [];
  for (const kw of PYTHON_KEYWORDS) {
    if (kw.toLowerCase().startsWith(lc)) results.push(kw);
  }
  for (const bi of PYTHON_BUILTINS) {
    if (bi.toLowerCase().startsWith(lc)) results.push(bi);
  }
  return results;
}

// -- air-lower.js --

// @gcu/air — adder (Python) → AIR lowerer
// Translates adder's Python AST into AIR ops. Python semantics preserved via
// calls to _py runtime helpers. Throws AirLowerError for unsupported nodes,
// triggering fallback to the tree-walker.



// Re-export AirLowerError from @gcu/air. Lifted to ext/air/src/lower/base.js
// so all frontends share one definition; the marker `_airFallback: true`
// is the load-bearing contract that AIR's wrapper checks.

// ── _py runtime helper specializations ─────────────────────────────
//
// When the type-prop pass can prove operand types, these rewrites
// replace `_py.method(args)` calls with raw AIR ops — emitted as
// native JS operators, skipping the helper round-trip. The big win
// for typed numeric loops in adder cells.
//
// Used to live in passes.js (hardcoded for both _py and _soft), now
// lives alongside the lowerer that emits the helper calls in the first
// place. Same pattern soft uses for _soft.

const _bothNumeric = (lt, rt) => isNumeric(lt) && isNumeric(rt);

const PY_SPECIALIZATIONS = {
  add: {
    op: 'add',
    // Numbers: same-type addition. Strings: concat. Mixed: skip.
    check: (lt, rt) => {
      if (isNumeric(lt) && isNumeric(rt)) return true;
      if (lt.kind === 'string' && rt.kind === 'string') return true;
      return false;
    },
    resultType: (lt, rt) => {
      if (isNumeric(lt) && isNumeric(rt)) return arithmeticResult(lt, rt);
      return STRING;
    },
  },
  sub: { op: 'sub', check: _bothNumeric, resultType: arithmeticResult },
  mul: { op: 'mul', check: _bothNumeric, resultType: arithmeticResult },
  // div/mod/floordiv stay in helpers: Python raises ZeroDivisionError, JS returns Infinity/NaN
  pow: { op: 'exp', check: _bothNumeric, resultType: arithmeticResult },
  eq:  { op: 'eq',  check: _bothNumeric, resultType: () => BOOL },
  neq: { op: 'neq', check: _bothNumeric, resultType: () => BOOL },
  lt:  { op: 'lt',  check: _bothNumeric, resultType: () => BOOL },
  lte: { op: 'lte', check: _bothNumeric, resultType: () => BOOL },
  gt:  { op: 'gt',  check: _bothNumeric, resultType: () => BOOL },
  gte: { op: 'gte', check: _bothNumeric, resultType: () => BOOL },
  neg: {
    op: 'neg',
    arity: 1,
    check: (t) => isNumeric(t),
    resultType: (t) => t,
  },
  truthy: {
    // _py.truthy(true) → just the value (already bool)
    // _py.truthy(x) where x is numeric → x !== 0 (handled via coerce)
    op: null, arity: 1,
    check: (t) => t.kind === 'bool',
    resultType: () => BOOL,
    passthrough: true,
  },
};

// Register at module-init. Two paths:
//   1. Dev/Node (tests): the import above resolves; registerSpecializations
//      is the function from passes.js. Call it directly.
//   2. Browser bundle: imports get stripped at build time, so
//      `registerSpecializations` is undeclared. Fall back to the window
//      hook AIR exposes at runtime.
const _doRegisterPy = (typeof registerSpecializations === 'function')
  ? registerSpecializations
  : (typeof window !== 'undefined' ? window._airRegisterSpecializations : null);
if (_doRegisterPy) _doRegisterPy('_py', PY_SPECIALIZATIONS);

// ── adder annotation resolver ──
//
// Maps adder type annotations (whatever's after `:` or `->`) to AIR types.
// Annotations are opt-in performance hints; unknown shapes → DYNAMIC, which
// means passes fall back to dataflow inference (current default).
//
// Supported names:
//   - Python: int → i32, float → f64, bool → bool, str → string, None → void
//   - Direct AIR: i8, u8, i16, u16, i32, u32, i64, u64, f32, f64, bool, string,
//                 void, dynamic
//   - Typed arrays: Int32Array, Float64Array, ..., i32array, f64array, ...
//
// Returns DYNAMIC for anything we don't recognise — including subscripts
// (`list[int]`, `dict[str, int]`), unions, generic tuples — so the rest of
// the pipeline keeps working unchanged.
const _ADDER_NAME_TO_TYPE = {
  // Python builtins
  'int': I32, 'float': F64, 'bool': BOOL, 'str': STRING,
  'None': VOID, 'NoneType': VOID,
  // Direct AIR primitive names — same set the JS lowerer recognises
  'i8': I8, 'u8': U8, 'i16': I16, 'u16': U16,
  'i32': I32, 'u32': U32, 'i64': I64, 'u64': U64,
  'f32': F32, 'f64': F64, 'string': STRING, 'void': VOID,
  'dynamic': DYNAMIC,
  // Typed-array constructors (matches TS_TYPE_MAP in types.js)
  'Int8Array': typedArray('i8'), 'Uint8Array': typedArray('u8'),
  'Int16Array': typedArray('i16'), 'Uint16Array': typedArray('u16'),
  'Int32Array': typedArray('i32'), 'Uint32Array': typedArray('u32'),
  'Float32Array': typedArray('f32'), 'Float64Array': typedArray('f64'),
  'BigInt64Array': typedArray('i64'), 'BigUint64Array': typedArray('u64'),
  // GCU typed-array aliases
  'i8array': typedArray('i8'), 'u8array': typedArray('u8'),
  'i16array': typedArray('i16'), 'u16array': typedArray('u16'),
  'i32array': typedArray('i32'), 'u32array': typedArray('u32'),
  'f32array': typedArray('f32'), 'f64array': typedArray('f64'),
  'i64array': typedArray('i64'), 'u64array': typedArray('u64'),
};

function resolveAdderAnnotation(node) {
  if (!node) return DYNAMIC;
  // Bare name: `int`, `float`, `i32`, `Int32Array`, `None`, …
  if (node.type === 'Name' && typeof node.id === 'string') {
    return _ADDER_NAME_TO_TYPE[node.id] ?? DYNAMIC;
  }
  // `None` written as a literal constant in some annotation shapes.
  if (node.type === 'Constant' && node.value === null) return VOID;
  // Subscripts like `list[int]` aren't generic-aware in v1; keep dynamic so
  // the type system doesn't lie about element types.
  return DYNAMIC;
}

// ── SSA counter (shared across lowerer invocations via module state) ──

// ── Lowering context ──
//
// Adder-specific extras over BaseLowerCtx:
//   declared       — names already emitted with `let` at top level (so
//     repeat assignments emit as bare `name = …`, not redeclarations).
//   syncFunctions  — populated by analyseSyncFunctions before any body
//     is lowered. Calls to a name in this set skip the `await` wrapping
//     that adder otherwise emits around every user call (Python's
//     `f()` could yield a coroutine, JS's can't tell at call time).
// loc() reads adder-AST nodes' `node.line` / `node.col` (different
// shape from ESTree's `node.loc.start`).

class AdderLowerCtx extends BaseLowerCtx {
  constructor() {
    super();
    this.declared = new Set();
    this.syncFunctions = new Set();
    // Per-cell counter for `_py.callMethod` polymorphic-inline-cache site IDs.
    // Each `obj.method(...)` call site gets a distinct ID; the runtime helper
    // keys its small (type → method) cache off it. Counter is per-cell, not
    // global, so cache rebuilds when the cell re-runs (intentional — class
    // identities don't survive a re-lower anyway).
    this._callSiteId = 0;
  }
  nextCallSiteId() { return this._callSiteId++; }
  loc(node) {
    return node?.line != null ? { line: node.line, col: node.col || 0 } : null;
  }
  // Python's `bool()` semantics: empty list/dict/string/zero/None are
  // falsy. The _py.truthy runtime helper encodes these correctly; AIR's
  // bare condition check would just JS-coerce, which gets it wrong for
  // empty-list-is-truthy-in-JS-but-falsy-in-Python cases.
  truthy(valueOp, loc) {
    return this.emitNamespacedCall('_py', 'truthy', [valueOp], loc, BOOL);
  }
}

// ── Module-level define collection ──
// Python: any assignment at module level creates a binding in module scope.
// Descends into if/for/while/try/with blocks (no scope) but not def/class.

function collectDefines_ad(stmts, defines) {
  for (const node of stmts || []) {
    switch (node.type) {
      case 'Assign':
        for (const t of node.targets) collectTargetNames(t, defines);
        break;
      case 'AugAssign':
      case 'AnnAssign':
        collectTargetNames(node.target, defines);
        break;
      case 'FunctionDef':
      case 'AsyncFunctionDef':
      case 'ClassDef':
        defines.add(node.name);
        break;
      case 'Import':
        for (const alias of node.names) defines.add(alias.alias || alias.module);
        break;
      case 'ImportFrom':
        for (const alias of node.names) defines.add(alias.alias || alias.name);
        break;
      case 'For': case 'AsyncFor':
        collectTargetNames(node.target, defines);
        collectDefines_ad(node.body, defines);
        if (node.orelse) collectDefines_ad(node.orelse, defines);
        break;
      case 'While':
        collectDefines_ad(node.body, defines);
        if (node.orelse) collectDefines_ad(node.orelse, defines);
        break;
      case 'If':
        collectDefines_ad(node.body, defines);
        if (node.orelse) collectDefines_ad(node.orelse, defines);
        break;
      case 'With': case 'AsyncWith':
        for (const item of node.items) {
          if (item.optionalVar) collectTargetNames(item.optionalVar, defines);
        }
        collectDefines_ad(node.body, defines);
        break;
      case 'Try':
        collectDefines_ad(node.body, defines);
        if (node.handlers) for (const h of node.handlers) {
          if (h.name) defines.add(h.name);
          if (h.body) collectDefines_ad(h.body, defines);
        }
        if (node.orelse) collectDefines_ad(node.orelse, defines);
        if (node.finalbody) collectDefines_ad(node.finalbody, defines);
        break;
    }
  }
}

function collectTargetNames(target, defines) {
  if (!target) return;
  if (target.type === 'Name') { defines.add(target.id); return; }
  if (target.type === 'Tuple' || target.type === 'List') {
    for (const e of target.elts) collectTargetNames(e, defines);
    return;
  }
  if (target.type === 'Starred' && target.value) collectTargetNames(target.value, defines);
}

// ── Sync-function analysis ──
//
// Before any lowering, walk every top-level FunctionDef and decide whether
// it can be emitted as a plain `function` instead of `async function`.
//
// A function is "sync" if (a) its source body contains no `await` expression
// and no `yield`/`yield from`, and (b) every Call in its body whose callee
// is a bare Name resolves to either:
//   - itself (recursion is fine — registers self in the candidate set), or
//   - another function that is also sync (transitive).
//
// Method calls (`obj.x()`), attribute callees, lambdas, list/dict/set/gen
// comprehensions, and any non-Name callee (Attribute, Subscript, Call) are
// all conservatively treated as potentially-async — calling such a target
// disqualifies the enclosing function. Cheap to compute, easy to reason about,
// and `fib`-style recursion qualifies cleanly.
//
// The result is a Set<string> of sync function names. Adder lowering uses
// it to skip the `await` wrapping at known-safe call sites and to set
// `is_async: false` on the func_region.

function _astHasAwaitOrYield(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'Await' || node.type === 'Yield' || node.type === 'YieldFrom') {
    return true;
  }
  // Don't descend into nested function definitions — their async-ness is
  // their own affair.
  if (node.type === 'FunctionDef' || node.type === 'AsyncFunctionDef' ||
      node.type === 'Lambda') {
    return false;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'line' || key === 'col') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const item of v) if (_astHasAwaitOrYield(item)) return true;
    } else if (v && typeof v === 'object') {
      if (_astHasAwaitOrYield(v)) return true;
    }
  }
  return false;
}

function _collectNameCallees(node, out, disqualifyRef) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDef' || node.type === 'AsyncFunctionDef' ||
      node.type === 'Lambda') {
    return;
  }
  if (node.type === 'Call') {
    if (node.func && node.func.type === 'Name') {
      out.push(node.func.id);
    } else {
      // Non-Name callee (attribute, subscript, dynamic) — disqualifies the
      // enclosing function from sync.
      disqualifyRef.value = true;
    }
    // Still walk args / keywords below.
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'line' || key === 'col') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const item of v) _collectNameCallees(item, out, disqualifyRef);
    } else if (v && typeof v === 'object') {
      _collectNameCallees(v, out, disqualifyRef);
    }
  }
}

// Builtins that are definitively sync — i.e. they neither await internally
// nor iterate user iterables nor invoke user callables. Source of truth is
// ext/adder/src/builtins.js: anything declared without `async` and that
// doesn't reach into pyCollect/await is sync. Most primitive constructors,
// inspectors, and conversion helpers qualify; iteration / map / filter /
// list / tuple / dict / set / sorted / max / min / sum / any / all do NOT
// (they need `await pyCollect(...)` to handle async iterables).
//
// Keep this list in lockstep with builtins.js. A user who shadows one of
// these names at module scope (e.g. `async def sum`) is handled: the seed
// below skips names in ctx.defines, so the shadow's sync-ness comes from the
// analysis (or stays conservatively awaited) rather than this list.
const KNOWN_SYNC_BUILTINS = new Set([
  // primitive constructors / converters
  'int', 'float', 'str', 'bool', 'complex', 'bytes', 'chr', 'ord',
  // numeric helpers
  'abs', 'round', 'hex', 'oct', 'bin', 'pow',
  // inspectors
  'len', 'type', 'isinstance', 'issubclass', 'callable',
  'hasattr', 'getattr', 'setattr', 'delattr',
  'id', 'hash', 'repr', 'ascii',
  // iteration constructors that don't materialise — the iter object itself
  // is sync; consumers iterate it via _py.iter which is sync
  'range', 'iter',
  // I/O surfaces that return sync values (the underlying display may be
  // async but adder's `print` discards the result and returns null sync)
  'print',
  // misc
  'globals', 'locals', 'vars', 'dir',
  // exceptions (constructors)
  'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
  'AttributeError', 'NameError', 'StopIteration', 'StopAsyncIteration',
  'RuntimeError', 'ZeroDivisionError', 'NotImplementedError',
  'ImportError', 'ModuleNotFoundError', 'FileNotFoundError',
  'OSError', 'AssertionError', 'ArithmeticError', 'OverflowError',
]);

function analyseSyncFunctions(moduleStmts) {
  // Collect top-level FunctionDefs (only — we don't analyse nested defs;
  // they go through their own per-region analysis when their parent is lowered).
  const funcs = [];
  for (const stmt of moduleStmts) {
    if (stmt.type === 'FunctionDef' || stmt.type === 'AsyncFunctionDef') {
      const hasAwaitOrYield = _astHasAwaitOrYield({ type: 'Block', body: stmt.body });
      const callees = [];
      const disqualifyRef = { value: false };
      _collectNameCallees({ type: 'Block', body: stmt.body }, callees, disqualifyRef);
      // Decorators rewrite the binding to whatever the decorator returns —
      // could be async (e.g. @cached, @memoize that wrap with awaits, or any
      // user decorator). The source-level FunctionDef is one thing; the
      // bound name after decoration is another. We can't statically know
      // what shape the decorated value is, so we conservatively bail out
      // of sync classification.
      const decorated = (stmt.decorators && stmt.decorators.length > 0);
      funcs.push({
        name: stmt.name,
        disqualified: hasAwaitOrYield || disqualifyRef.value || decorated,
        callees,
      });
    }
  }

  // All top-level FunctionDef names — used to decide "external callee".
  const allNames = new Set(funcs.map(f => f.name));

  // Initial candidate set: all functions not pre-disqualified.
  let sync = new Set();
  for (const f of funcs) if (!f.disqualified) sync.add(f.name);

  // Iterate: remove any function that calls a name we don't know is sync.
  // Known-sync builtins (range, len, int, abs, …) are accepted; other
  // external callees (imported, user-shadowed, async builtins like list /
  // sorted / map) are conservatively treated as async, since they go
  // through emitAwaitedCall_ad and produce an await op.
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of funcs) {
      if (!sync.has(f.name)) continue;
      for (const callee of f.callees) {
        // Self-recursion is fine: callee === f.name.
        if (callee === f.name) continue;
        // Other top-level FunctionDefs: must already be in sync.
        if (allNames.has(callee)) {
          if (!sync.has(callee)) { sync.delete(f.name); changed = true; break; }
          continue;
        }
        // Known-sync builtin — accepts.
        if (KNOWN_SYNC_BUILTINS.has(callee)) continue;
        // Anything else (imported, async builtins like sorted/map, params
        // shadowing as call targets) — conservatively async.
        sync.delete(f.name);
        changed = true;
        break;
      }
    }
  }
  return sync;
}

// ── Helper: call a _py runtime method (sync, no await needed) ──
//
// Thin wrapper over BaseLowerCtx.emitNamespacedCall — keeps the existing
// callsite ergonomics while sharing the AIR-shape implementation with
// soft (and any future frontend with a namespaced runtime).

function emitPyCall(ctx, method, args, loc, type) {
  return ctx.emitNamespacedCall('_py', method, args, loc, type);
}

// Emit `_py.iter(src)`, with an `await` when the source value might be an
// async iterable. _iterArray (the runtime helper) returns a Promise<Array>
// for async iterables and a sync iterable otherwise; the await is correct
// for both shapes but forces the enclosing JS function to `async`, which
// would defeat the lowerer's syncFunctions optimization for the common
// case `for x in some_array` / `for x in nums` (varargs).
//
// Heuristic: only insert the await when `src` was itself an awaited call
// (a function call result — could be an async generator). Bare loads,
// constants, list/tuple/set literals, slices, etc. can't be async
// iterables in adder, so the sync path stays sync. Conservative on the
// safe side: if we miss an async-yielding case (e.g. value flowed through
// a Name binding), `for of` on the result iterates to zero items rather
// than crashing — debuggable but not catastrophic.
function emitPyIter(ctx, src, loc, type) {
  const call = emitPyCall(ctx, 'iter', [src], loc, type);
  if (src && src.op === 'await') {
    return ctx.emit('await', [call.id], type || DYNAMIC, loc);
  }
  return call;
}

// User-facing calls (Python funcs / adder builtins) may be async — await them.
// Pass `sync: true` when the callee is statically known to be sync (e.g. a
// user FunctionDef that analyseSyncFunctions classified as sync); the await
// wrapping is then skipped, which is the difference between fib being a
// Promise-allocating loop and a tight sync recursion.
function emitAwaitedCall_ad(ctx, fnId, argIds, loc, type, opts) {
  const call = ctx.emit('call', [fnId, ...argIds], type || DYNAMIC, loc);
  if (opts && opts.sync) return call;
  return ctx.emit('await', [call.id], type || DYNAMIC, loc);
}

// ── Main entry ──

function lowerAdder(ast, source) {
  // SSA id counter lives on the AdderLowerCtx instance now (via
  // BaseLowerCtx's _idGen); no module-level reset.
  const ctx = new AdderLowerCtx();
  ctx.source = source || null;

  if (ast.type !== 'Module') throw new AirLowerError('Expected Module node');

  // Collect all module-scope defines up front (Python module-scope semantics)
  collectDefines_ad(ast.body, ctx.defines);

  // Pre-analyse top-level FunctionDefs to determine which are sync — done
  // before any body is lowered, so recursive call sites and forward
  // references inside other functions can take the no-await fast path.
  for (const name of analyseSyncFunctions(ast.body)) {
    ctx.syncFunctions.add(name);
  }
  // Seed known-sync builtins (range, len, int, abs, …) into the same set so
  // module-level loops like `for i in range(10000)` skip the await on
  // range itself. This is the difference between sum-1..10000 still
  // having an await at iter-construction and being fully sync.
  for (const name of KNOWN_SYNC_BUILTINS) {
    // Don't let the builtin seed shadow a user who redefined the name at
    // module scope (e.g. `async def sum`). For a shadowed name, sync-ness
    // comes from analyseSyncFunctions above (or stays conservatively async →
    // awaited). Seeding it sync unconditionally would skip the await on an
    // async shadow → a Promise leaks through as the value.
    if (!ctx.defines.has(name)) ctx.syncFunctions.add(name);
  }

  // Identify names that will be declared by `function`/`class` syntax —
  // those don't need (and can't have) a `let` pre-declaration.
  const funcOrClassNames = new Set();
  for (const stmt of ast.body) {
    if ((stmt.type === 'FunctionDef' || stmt.type === 'AsyncFunctionDef' ||
         stmt.type === 'ClassDef') && stmt.name) {
      funcOrClassNames.add(stmt.name);
    }
  }

  // Pre-declare every module-level define with `let name;` at the top.
  // This ensures variables defined in nested blocks are visible at module scope.
  for (const name of ctx.defines) {
    if (name === '__lastExpr__') continue;
    if (funcOrClassNames.has(name)) continue; // declared by function/class syntax
    const undef = ctx.emit('const', [undefined], VOID, null);
    ctx.emit('store', [name, undef.id], VOID, null);
    ctx.symbols.set(name, undef.id);
  }

  // Lower each statement; track last Expr for REPL-like display
  let lastExpr = null;
  for (const stmt of ast.body) {
    const result = lowerStmt_ad(ctx, stmt);
    if (stmt.type === 'Expr' && result) lastExpr = result.id;
  }

  // If there's a trailing Expr, store it as __lastExpr__ so the caller can read it
  if (lastExpr) {
    ctx.emit('store', ['__lastExpr__', lastExpr], VOID, null);
    ctx.symbols.set('__lastExpr__', lastExpr);
    ctx.defines.add('__lastExpr__');
  }

  // Build cell module (matching shape from lowerJS)
  const exports = new Map();
  for (const name of ctx.defines) {
    const ssaId = ctx.symbols.get(name);
    const type = ssaId ? (ctx.types.get(ssaId) || DYNAMIC) : DYNAMIC;
    exports.set(name, { ssa_name: ssaId || null, type });
  }

  return {
    ops: ctx.ops,
    // ctx.symbols is a ScopeChain post-base-extraction; flatten to a Map
    // for downstream consumers (validator, debug tools).
    symbol_table: ctx.symbols.flatten(),
    exports,
    imports: new Set(ctx.imports),
    defines: new Set(ctx.defines),
    side_effects: true,
    _lastExpr: lastExpr,
  };
}

// ── Statement lowering ──

function lowerStmt_ad(ctx, node) {
  if (!node) return null;
  const l = ctx.loc(node);

  switch (node.type) {
    case 'Pass': return null;
    case 'Break':
      // for/else and while/else desugaring: when an enclosing loop with
      // an `else` clause registered a breakHook, fire it before the break
      // so the orelse block is skipped on this exit path.
      if (ctx.breakHook) ctx.breakHook(l);
      ctx.emit('break', [], VOID, l);
      return null;
    case 'Continue': ctx.emit('continue', [], VOID, l); return null;
    case 'Expr': return lowerExpr_ad(ctx, node.value);

    case 'Assign': return lowerAssign(ctx, node);
    case 'AugAssign': return lowerAugAssign(ctx, node);
    case 'AnnAssign': return lowerAnnAssign(ctx, node);
    case 'Delete': return lowerDelete(ctx, node);

    case 'Return': {
      const val = node.value ? lowerExpr_ad(ctx, node.value) : ctx.emit('const', [null], VOID, l);
      ctx.emit('return', [val.id], VOID, l);
      return null;
    }

    case 'If': return lowerIf_ad(ctx, node);
    case 'For': return lowerFor_ad(ctx, node);
    case 'While': return lowerWhile_ad(ctx, node);

    case 'FunctionDef':
    case 'AsyncFunctionDef':
      return lowerFuncDef(ctx, node);

    case 'Import': return lowerImport(ctx, node);
    case 'ImportFrom': return lowerImportFrom(ctx, node);

    case 'ClassDef':
      return lowerClassDef(ctx, node);

    case 'Try':
      return lowerTry_ad(ctx, node);

    case 'With':
    case 'AsyncWith':
      return lowerWith(ctx, node);

    case 'Raise': {
      const exc = node.exc ? lowerExpr_ad(ctx, node.exc) : ctx.emit('const', [null], VOID, l);
      emitPyCall(ctx, 'raise', [exc], l, VOID);
      return null;
    }

    case 'Assert': {
      // assert test, msg → if not _py.truthy(test) throw AssertionError(msg)
      const test = lowerExpr_ad(ctx, node.test);
      const truthy = emitPyCall(ctx, 'truthy', [test], l, BOOL);
      // if (!truthy) raise AssertionError
      const thenBody = captureOps(ctx, () => {
        const msg = node.msg ? lowerExpr_ad(ctx, node.msg) : ctx.emit('const', ['assertion failed'], STRING, l);
        emitPyCall(ctx, 'raise', [msg], l, VOID);
      });
      // Emit: if (!_py.truthy(test)) { raise msg }
      const notTruthy = ctx.emit('logical_not', [truthy.id], BOOL, l);
      ctx.emit('if_region', [notTruthy.id], VOID, l, {
        then_body: thenBody, else_body: [], phis: [],
      });
      return null;
    }

    case 'Global':
    case 'Nonlocal':
      // Declaration-only; mark names as already declared so stores don't re-declare.
      // With per-function scope tracking in the emitter, a bare `x = ...` inside
      // the function reassigns the outer binding (global/nonlocal semantics).
      for (const n of node.names) {
        // Track in ctx.symbols to signal "this name exists in enclosing scope"
        if (!ctx.symbols.has(n)) ctx.symbols.set(n, null);
        // Emit a special opaque that marks `decl:name` as set in emitter scope
        ctx.emit('opaque', [`/* ${node.type.toLowerCase()} ${n} */`], VOID, l, { _markDeclared: n });
      }
      return null;

    default:
      throw new AirLowerError(`unsupported statement: ${node.type}`);
  }
}

// ── Expression lowering ──

function lowerExpr_ad(ctx, node) {
  if (!node) return ctx.emit('const', [null], VOID, null);
  const l = ctx.loc(node);

  switch (node.type) {
    case 'Constant': {
      const v = node.value;
      if (v === null) return ctx.emit('const', [null], DYNAMIC, l);
      if (typeof v === 'boolean') return ctx.emit('const', [v], BOOL, l);
      if (typeof v === 'number') {
        const isInt = Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
        return ctx.emit('const', [v], isInt ? I32 : F64, l);
      }
      if (typeof v === 'string') return ctx.emit('const', [v], STRING, l);
      if (v && typeof v === 'object' && v._complex) {
        throw new AirLowerError('complex literal not supported in transpile');
      }
      return ctx.emit('const', [v], DYNAMIC, l);
    }

    case 'Name': {
      const name = node.id;
      if (name === 'True') return ctx.emit('const', [true], BOOL, l);
      if (name === 'False') return ctx.emit('const', [false], BOOL, l);
      if (name === 'None') return ctx.emit('const', [null], DYNAMIC, l);
      // Decide whether this Name needs to come from upstream scope:
      //   - already assigned in this scope (ctx.symbols.has)  → load local
      //   - inside a function/class body referencing a name defined
      //     later at module level (forward ref) → load via closure, no import
      //   - at module level and not yet assigned                → import from
      //     upstream (covers `df = df.rename(...)` re-bind pattern)
      const isForwardRef = !ctx.topLevel && ctx.defines.has(name);
      if (!ctx.symbols.has(name) && !isForwardRef) ctx.imports.add(name);
      return ctx.emit('load', [name], DYNAMIC, l);
    }

    case 'BinOp': return lowerBinOp_ad(ctx, node);
    case 'UnaryOp': return lowerUnaryOp(ctx, node);
    case 'BoolOp': return lowerBoolOp(ctx, node);
    case 'Compare': return lowerCompare_ad(ctx, node);

    case 'Call': return lowerCall_ad(ctx, node);

    case 'Attribute': {
      const obj = lowerExpr_ad(ctx, node.value);
      const name = ctx.emit('const', [node.attr], STRING, l);
      return emitPyCall(ctx, 'getattr', [obj, name], l);
    }

    case 'Subscript': return lowerSubscript(ctx, node);

    case 'List': return lowerListOrTuple(ctx, node);
    case 'Tuple': return lowerListOrTuple(ctx, node);

    case 'Dict': {
      // Plain object if all keys are string constants; otherwise build a Map.
      const allStringKeys = node.keys.every(k =>
        k && k.type === 'Constant' && typeof k.value === 'string');
      if (allStringKeys) {
        const pairs = [];
        for (let i = 0; i < node.keys.length; i++) {
          if (node.keys[i] === null) {
            // **unpack
            const src = lowerExpr_ad(ctx, node.values[i]);
            pairs.push({ spread: true, id: src.id });
          } else {
            const val = lowerExpr_ad(ctx, node.values[i]);
            pairs.push({ key: node.keys[i].value, id: val.id });
          }
        }
        return ctx.emit('object_new', pairs, DYNAMIC, l);
      }
      // Build a Map via _py.makeDict with arrays of keys and values
      const keys = node.keys.map(k => k ? lowerExpr_ad(ctx, k).id : null);
      const values = node.values.map(v => lowerExpr_ad(ctx, v).id);
      const keysArr = ctx.emit('array_new', keys.filter(k => k), DYNAMIC, l);
      const valsArr = ctx.emit('array_new', values, DYNAMIC, l);
      return emitPyCall(ctx, 'makeDict', [keysArr, valsArr], l);
    }

    case 'Set': {
      const elts = node.elts.map(e => lowerExpr_ad(ctx, e).id);
      const arr = ctx.emit('array_new', elts, DYNAMIC, l);
      return emitPyCall(ctx, 'makeSet', [arr], l);
    }

    case 'SetComp':
    case 'DictComp':
    case 'GeneratorExp':
      return lowerComprehension(ctx, node);

    case 'IfExp': {
      // a if cond else b — ternary
      const cond = lowerExpr_ad(ctx, node.test);
      const truthy = ctx.truthy(cond, l);
      return emitPhiSelect(ctx, truthy.id,
        () => lowerExpr_ad(ctx, node.body),
        () => lowerExpr_ad(ctx, node.orelse),
        l, DYNAMIC);
    }

    case 'JoinedStr': {
      // f-string — concat parts
      let result = ctx.emit('const', [''], STRING, l);
      for (const part of node.values) {
        let piece;
        if (part.type === 'Constant') {
          piece = ctx.emit('const', [part.value], STRING, l);
        } else if (part.type === 'FormattedValue') {
          const val = lowerExpr_ad(ctx, part.value);
          let spec;
          if (part.formatSpec == null) {
            spec = ctx.emit('const', [''], STRING, l);
          } else if (typeof part.formatSpec === 'string') {
            // adder parser emits formatSpec as a raw string (e.g. ".2f")
            spec = ctx.emit('const', [part.formatSpec], STRING, l);
          } else {
            spec = lowerExpr_ad(ctx, part.formatSpec);
          }
          piece = emitPyCall(ctx, 'fmt', [val, spec], l, STRING);
        } else {
          throw new AirLowerError(`unexpected JoinedStr part: ${part.type}`);
        }
        result = ctx.emit('add', [result.id, piece.id], STRING, l);
      }
      return result;
    }

    case 'Lambda': return lowerLambda(ctx, node);

    case 'ListComp': return lowerComprehension(ctx, node);

    case 'Await': {
      const val = lowerExpr_ad(ctx, node.value);
      return ctx.emit('await', [val.id], DYNAMIC, l);
    }

    case 'NamedExpr': {
      // walrus: (name := value) — assign then evaluate as the value
      const val = lowerExpr_ad(ctx, node.value);
      const name = node.target.id;
      ctx.emit('store', [name, val.id], VOID, l);
      ctx.symbols.set(name, val.id);
      if (ctx.topLevel) ctx.defines.add(name);
      return val;
    }

    case 'Starred':
      throw new AirLowerError('starred expression in unsupported position');

    case 'Yield': {
      const val = node.value ? lowerExpr_ad(ctx, node.value) : null;
      return ctx.emit('yield', val ? [val.id] : [], DYNAMIC, l);
    }
    case 'YieldFrom': {
      const val = lowerExpr_ad(ctx, node.value);
      return ctx.emit('yield_delegate', [val.id], DYNAMIC, l);
    }

    default:
      throw new AirLowerError(`unsupported expression: ${node.type}`);
  }
}

// ── Binary/unary/bool/compare ops ──

const BINOP_HELPER = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div',
  '//': 'floordiv', '%': 'mod', '**': 'pow',
  '&': 'and_', '|': 'or_', '^': 'xor',  // bitwise — Python has __and__ etc.
  '<<': 'lshift', '>>': 'rshift',
};

function lowerBinOp_ad(ctx, node) {
  const l = ctx.loc(node);
  const lhs = lowerExpr_ad(ctx, node.left);
  const rhs = lowerExpr_ad(ctx, node.right);
  const op = node.op;

  // Shifts: JS i32 matches Python int. No `__lshift__` overloading worth
  // supporting in cell-side code (vs &/|/^ where libraries like sadpan
  // overload them for boolean masks).
  if (op === '<<') return ctx.emit('shift_left', [lhs.id, rhs.id], I32, l);
  if (op === '>>') return ctx.emit('shift_right', [lhs.id, rhs.id], I32, l);
  // &, |, ^ go through `_py.and_` / `or_` / `xor` so dunder methods
  // (`__and__`, `__or__`, `__xor__`) fire — sadpan's BooleanMask combines
  // via these. The runtime helpers fast-path to native bitwise when both
  // operands are real ints, so this isn't a perf hit for normal int code.

  const helper = BINOP_HELPER[op];
  if (!helper) throw new AirLowerError(`unsupported binop: ${op}`);
  return emitPyCall(ctx, helper, [lhs, rhs], l);
}

function lowerUnaryOp(ctx, node) {
  const l = ctx.loc(node);
  const arg = lowerExpr_ad(ctx, node.operand);
  const op = node.op;
  if (op === 'not') {
    // not x → !_py.truthy(x)
    const truthy = emitPyCall(ctx, 'truthy', [arg], l, BOOL);
    return ctx.emit('logical_not', [truthy.id], BOOL, l);
  }
  if (op === '-') return emitPyCall(ctx, 'neg', [arg], l);
  if (op === '+') return emitPyCall(ctx, 'pos', [arg], l);
  if (op === '~') return emitPyCall(ctx, 'invert', [arg], l);
  throw new AirLowerError(`unsupported unary op: ${op}`);
}

function lowerBoolOp(ctx, node) {
  // and / or — short-circuit. Python semantics: return the actual value, not a bool.
  // x and y → (_py.truthy(x) ? y : x)
  // x or y  → (_py.truthy(x) ? x : y)
  // For n-ary, chain: a and b and c → a_and_b-result and c
  const l = ctx.loc(node);
  if (node.values.length < 2) return lowerExpr_ad(ctx, node.values[0]);

  let result = lowerExpr_ad(ctx, node.values[0]);
  for (let i = 1; i < node.values.length; i++) {
    const truthy = ctx.truthy(result, l);
    // and: if truthy(prev) → next else → prev
    // or:  if truthy(prev) → prev else → next
    // The "identity" branch returns prev without emitting anything;
    // emitPhiSelect runs both callbacks inside captureOps so the
    // non-identity branch's lowerExpr_ad becomes its body.
    const prev = result;
    result = emitPhiSelect(ctx, truthy.id,
      node.op === 'and' ? () => lowerExpr_ad(ctx, node.values[i]) : () => prev,
      node.op === 'and' ? () => prev : () => lowerExpr_ad(ctx, node.values[i]),
      l, DYNAMIC);
  }
  return result;
}

const CMP_HELPER = {
  '==': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte',
};

function lowerCompare_ad(ctx, node) {
  const l = ctx.loc(node);
  // Chained compare: a < b < c → (a < b) && (b < c)
  // Note: Python evaluates b only once, but for simplicity we re-evaluate it.
  // This is observable but rare in practice.
  let left = lowerExpr_ad(ctx, node.left);
  let result = null;
  for (let i = 0; i < node.ops.length; i++) {
    const op = node.ops[i];
    const right = lowerExpr_ad(ctx, node.comparators[i]);

    let cmp;
    if (op === 'in') {
      cmp = emitPyCall(ctx, 'contains', [right, left], l, BOOL);
    } else if (op === 'not in') {
      const c = emitPyCall(ctx, 'contains', [right, left], l, BOOL);
      cmp = ctx.emit('logical_not', [c.id], BOOL, l);
    } else if (op === 'is') {
      cmp = ctx.emit('eq', [left.id, right.id], BOOL, l);
    } else if (op === 'is not') {
      cmp = ctx.emit('neq', [left.id, right.id], BOOL, l);
    } else {
      const helper = CMP_HELPER[op];
      if (!helper) throw new AirLowerError(`unsupported compare: ${op}`);
      cmp = emitPyCall(ctx, helper, [left, right], l, BOOL);
    }

    result = result ? ctx.emit('logical_and', [result.id, cmp.id], BOOL, l) : cmp;
    left = right;
  }
  return result;
}

// ── Subscript ──

function lowerSubscript(ctx, node) {
  const l = ctx.loc(node);
  const obj = lowerExpr_ad(ctx, node.value);
  if (node.slice.type === 'Slice') {
    const lower = node.slice.lower ? lowerExpr_ad(ctx, node.slice.lower) : ctx.emit('const', [null], VOID, l);
    const upper = node.slice.upper ? lowerExpr_ad(ctx, node.slice.upper) : ctx.emit('const', [null], VOID, l);
    const step = node.slice.step ? lowerExpr_ad(ctx, node.slice.step) : ctx.emit('const', [null], VOID, l);
    return emitPyCall(ctx, 'slice', [obj, lower, upper, step], l);
  }
  if (node.slice.type === 'Tuple') {
    // numpy / pandas multi-dim subscript — build an array of evaluated
    // items (Slice elements become `_py.makeSlice(lo, hi, step)` marker
    // objects) and pass it to `_py.getitem`. The target __getitem__
    // (natra ndarray, DataFrame, etc.) interprets the array as a tuple.
    const elts = node.slice.elts.map(elt => _lowerSliceElt(ctx, elt, l));
    const tupleKey = ctx.emit('array_new', elts.map(e => e.id), DYNAMIC, l);
    return emitPyCall(ctx, 'getitem', [obj, tupleKey], l);
  }
  const key = lowerExpr_ad(ctx, node.slice);
  return emitPyCall(ctx, 'getitem', [obj, key], l);
}

// Lower one element of a tuple subscript: a Slice becomes a runtime
// `_py.makeSlice` call; anything else lowers as a normal expression.
function _lowerSliceElt(ctx, elt, l) {
  if (elt && elt.type === 'Slice') {
    const lower = elt.lower ? lowerExpr_ad(ctx, elt.lower) : ctx.emit('const', [null], VOID, l);
    const upper = elt.upper ? lowerExpr_ad(ctx, elt.upper) : ctx.emit('const', [null], VOID, l);
    const step = elt.step ? lowerExpr_ad(ctx, elt.step) : ctx.emit('const', [null], VOID, l);
    return emitPyCall(ctx, 'makeSlice', [lower, upper, step], l);
  }
  return lowerExpr_ad(ctx, elt);
}

// ── Call ──

function lowerCall_ad(ctx, node) {
  const l = ctx.loc(node);

  const hasStarred = node.args.some(a => a.type === 'Starred');
  const hasKwargs = node.keywords && node.keywords.length > 0;
  const hasSplatKw = hasKwargs && node.keywords.some(kw => kw.name === null);

  // Lower positional args, spreading any starred ones
  const argIds = [];
  for (const a of node.args) {
    if (a.type === 'Starred') {
      const inner = lowerExpr_ad(ctx, a.value);
      // Emit spread on the iter-converted value so JS ...spread works
      const arr = emitPyCall(ctx, 'iter', [inner], l);
      argIds.push(ctx.emit('spread', [arr.id], DYNAMIC, l).id);
    } else {
      argIds.push(lowerExpr_ad(ctx, a).id);
    }
  }

  // Build kwargs if present
  let kwObjId = null;
  if (hasKwargs) {
    const pairs = [];
    let hasSplat = false;
    for (const kw of node.keywords) {
      if (kw.name === null) {
        // **kw splat
        hasSplat = true;
        const src = lowerExpr_ad(ctx, kw.value);
        pairs.push({ spread: true, id: src.id });
      } else {
        const val = lowerExpr_ad(ctx, kw.value);
        pairs.push({ key: kw.name, id: val.id });
      }
    }
    // Always include _kw: true marker (for adder's calling convention)
    pairs.unshift({ key: '_kw', id: ctx.emit('const', [true], BOOL, l).id });
    kwObjId = ctx.emit('object_new', pairs, DYNAMIC, l).id;
  }

  // Assemble final call. Skip the await when the callee is a Name that
  // analyseSyncFunctions classified as sync — that's the path that makes
  // recursive integer-only functions (fib, ackermann, etc.) actually fast.
  if (node.func.type === 'Attribute') {
    // Fused method call via PIC: `_py.callMethod(obj, name, siteId, ...args)`
    // skips the getattr → bound-method closure → call dance that the legacy
    // emit used. siteId is per-call-site so the runtime cache stays
    // monomorphic for sites that always see the same receiver type.
    const obj = lowerExpr_ad(ctx, node.func.value);
    const nameOp = ctx.emit('const', [node.func.attr], STRING, l);
    const siteIdOp = ctx.emit('const', [ctx.nextCallSiteId()], I32, l);
    const callArgs = [obj, nameOp, siteIdOp];
    for (const id of argIds) callArgs.push({ id });
    if (kwObjId) callArgs.push({ id: kwObjId });
    const call = emitPyCall(ctx, 'callMethod', callArgs, l);
    return ctx.emit('await', [call.id], DYNAMIC, l);
  }

  const isSyncCallee =
    node.func.type === 'Name' &&
    !hasStarred && !hasKwargs &&
    ctx.syncFunctions.has(node.func.id);

  const fn = lowerExpr_ad(ctx, node.func);
  const finalArgs = kwObjId ? [...argIds, kwObjId] : argIds;
  return emitAwaitedCall_ad(ctx, fn.id, finalArgs, l, undefined, { sync: isSyncCallee });
}

// ── Assignment ──

function lowerAssign(ctx, node) {
  const l = ctx.loc(node);
  const value = lowerExpr_ad(ctx, node.value);
  for (const target of node.targets) {
    lowerAssignTarget(ctx, target, value, l);
  }
  return null;
}

function lowerAssignTarget(ctx, target, value, l) {
  if (target.type === 'Name') {
    const name = target.id;
    ctx.emit('store', [name, value.id], VOID, l);
    ctx.symbols.set(name, value.id);
    if (ctx.topLevel) ctx.defines.add(name);
    return;
  }
  if (target.type === 'Tuple' || target.type === 'List') {
    // Tuple/list unpacking: a, b = value, or a, *rest = value
    // First ensure value is an array-like via _py.iter
    const iterArr = emitPyIter(ctx, value, l);
    // Find starred index (if any) — only one allowed
    let starredIdx = -1;
    for (let i = 0; i < target.elts.length; i++) {
      if (target.elts[i].type === 'Starred') {
        if (starredIdx !== -1) throw new AirLowerError('multiple starred targets');
        starredIdx = i;
      }
    }

    if (starredIdx === -1) {
      // Simple: index each
      for (let i = 0; i < target.elts.length; i++) {
        const idx = ctx.emit('const', [i], I32, l);
        const item = emitPyCall(ctx, 'getitem', [iterArr, idx], l);
        lowerAssignTarget(ctx, target.elts[i], item, l);
      }
    } else {
      // Before starred: index 0..starredIdx
      for (let i = 0; i < starredIdx; i++) {
        const idx = ctx.emit('const', [i], I32, l);
        const item = emitPyCall(ctx, 'getitem', [iterArr, idx], l);
        lowerAssignTarget(ctx, target.elts[i], item, l);
      }
      // Starred: slice [starredIdx : len - (n - starredIdx - 1)]
      const afterCount = target.elts.length - starredIdx - 1;
      const startConst = ctx.emit('const', [starredIdx], I32, l);
      const endExpr = afterCount === 0
        ? ctx.emit('const', [null], VOID, l)  // no end → slice to end
        : ctx.emit('const', [-afterCount], I32, l);
      const stepNull = ctx.emit('const', [null], VOID, l);
      const restArr = emitPyCall(ctx, 'slice', [iterArr, startConst, endExpr, stepNull], l);
      lowerAssignTarget(ctx, target.elts[starredIdx].value, restArr, l);
      // After starred: index from end
      for (let i = starredIdx + 1; i < target.elts.length; i++) {
        // negative index: (len - (target.elts.length - i))
        const relIdx = -(target.elts.length - i);
        const idx = ctx.emit('const', [relIdx], I32, l);
        const item = emitPyCall(ctx, 'getitem', [iterArr, idx], l);
        lowerAssignTarget(ctx, target.elts[i], item, l);
      }
    }
    return;
  }
  if (target.type === 'Starred') {
    // Bare starred in assignment — just unwrap to its value
    return lowerAssignTarget(ctx, target.value, value, l);
  }
  if (target.type === 'Attribute') {
    const obj = lowerExpr_ad(ctx, target.value);
    const name = ctx.emit('const', [target.attr], STRING, l);
    emitPyCall(ctx, 'setattr', [obj, name, value], l, VOID);
    return;
  }
  if (target.type === 'Subscript') {
    const obj = lowerExpr_ad(ctx, target.value);
    if (target.slice.type === 'Slice') {
      const lower = target.slice.lower ? lowerExpr_ad(ctx, target.slice.lower) : ctx.emit('const', [null], VOID, l);
      const upper = target.slice.upper ? lowerExpr_ad(ctx, target.slice.upper) : ctx.emit('const', [null], VOID, l);
      const step = target.slice.step ? lowerExpr_ad(ctx, target.slice.step) : ctx.emit('const', [null], VOID, l);
      emitPyCall(ctx, 'setslice', [obj, lower, upper, step, value], l, VOID);
      return;
    }
    if (target.slice.type === 'Tuple') {
      const elts = target.slice.elts.map(elt => _lowerSliceElt(ctx, elt, l));
      const tupleKey = ctx.emit('array_new', elts.map(e => e.id), DYNAMIC, l);
      emitPyCall(ctx, 'setitem', [obj, tupleKey, value], l, VOID);
      return;
    }
    const key = lowerExpr_ad(ctx, target.slice);
    emitPyCall(ctx, 'setitem', [obj, key, value], l, VOID);
    return;
  }
  throw new AirLowerError(`unsupported assign target: ${target.type}`);
}

// Compound-assign helpers (used by lowerAugAssign). `+=` routes to `iadd`
// which dispatches __iadd__ and handles list-extend in-place; other
// compound ops route to their plain binary helpers — Python's __isub__,
// __imul__, etc. are rare on user types and the immutable-rebind behavior
// is the right default. Add entries here as real cases come up.
const IBINOP_HELPER = {
  '+': 'iadd',
};

function lowerAugAssign(ctx, node) {
  // x op= y → x = _py.iop(x, y) for ops with in-place semantics (just `+`
  // for now); falls through to the binary helper for ops without a custom
  // in-place variant. The surrounding assignment to `x` is always emitted
  // because Python's `+=` rebinds the name even when __iadd__ mutates in
  // place (the dunder typically returns self).
  const l = ctx.loc(node);
  // Load current value
  let current;
  if (node.target.type === 'Name') {
    current = ctx.emit('load', [node.target.id], DYNAMIC, l);
  } else if (node.target.type === 'Attribute') {
    const obj = lowerExpr_ad(ctx, node.target.value);
    const name = ctx.emit('const', [node.target.attr], STRING, l);
    current = emitPyCall(ctx, 'getattr', [obj, name], l);
  } else if (node.target.type === 'Subscript') {
    const obj = lowerExpr_ad(ctx, node.target.value);
    if (node.target.slice.type === 'Slice') {
      const lower = node.target.slice.lower ? lowerExpr_ad(ctx, node.target.slice.lower) : ctx.emit('const', [null], VOID, l);
      const upper = node.target.slice.upper ? lowerExpr_ad(ctx, node.target.slice.upper) : ctx.emit('const', [null], VOID, l);
      const step = node.target.slice.step ? lowerExpr_ad(ctx, node.target.slice.step) : ctx.emit('const', [null], VOID, l);
      current = emitPyCall(ctx, 'slice', [obj, lower, upper, step], l);
    } else {
      const key = lowerExpr_ad(ctx, node.target.slice);
      current = emitPyCall(ctx, 'getitem', [obj, key], l);
    }
  } else {
    throw new AirLowerError(`unsupported augassign target: ${node.target.type}`);
  }

  const rhs = lowerExpr_ad(ctx, node.value);
  const op = node.op;
  let result;
  if (op === '&') result = ctx.emit('bitwise_and', [current.id, rhs.id], I32, l);
  else if (op === '|') result = ctx.emit('bitwise_or', [current.id, rhs.id], I32, l);
  else if (op === '^') result = ctx.emit('bitwise_xor', [current.id, rhs.id], I32, l);
  else if (op === '<<') result = ctx.emit('shift_left', [current.id, rhs.id], I32, l);
  else if (op === '>>') result = ctx.emit('shift_right', [current.id, rhs.id], I32, l);
  else {
    const inPlace = IBINOP_HELPER[op];
    const helper = inPlace || BINOP_HELPER[op];
    if (!helper) throw new AirLowerError(`unsupported augassign op: ${op}`);
    const call = emitPyCall(ctx, helper, [current, rhs], l);
    // In-place helpers (`_py.iadd`) dispatch to `__iadd__` which can be an
    // async adder-class method returning a Promise. Wrap with await so the
    // assigned value is always the resolved instance, not a pending Promise
    // that would break the next `+=` (operating on the Promise instead of
    // the instance). For sync paths (numbers, lists, etc.) the await on a
    // non-Promise is a no-op modulo the microtask hop.
    result = inPlace ? ctx.emit('await', [call.id], DYNAMIC, l) : call;
  }

  lowerAssignTarget(ctx, node.target, result, l);
  return null;
}

function lowerAnnAssign(ctx, node) {
  // Annotated assignment: `x: int = 5`. Resolve the annotation; if it's
  // a recognisable AIR type, stamp it onto the SSA value so passes propagate
  // (e.g. `_py.add` → raw `+` when both sides are typed numbers).
  if (!node.value) return null;
  const l = ctx.loc(node);
  const value = lowerExpr_ad(ctx, node.value);
  const ann = resolveAdderAnnotation(node.annotation);
  if (!isDynamic(ann)) value.type = ann;
  lowerAssignTarget(ctx, node.target, value, l);
  return null;
}

function lowerTry_ad(ctx, node) {
  // try: body [except [Type] [as name]: handler] [else: orelse] [finally: finalbody]
  const l = ctx.loc(node);

  // try body (plus else clause appended — represents Python's "run else
  // only when no exception" semantically by treating it as the tail of
  // the try body)
  const tryBody = captureOps(ctx, () => {
    for (const s of node.body) lowerStmt_ad(ctx, s);
    if (node.orelse && node.orelse.length) {
      for (const s of node.orelse) lowerStmt_ad(ctx, s);
    }
  });

  // Catch handlers — build a combined catch body that checks each handler's type
  // Use a single JS catch(__e) that does an if/else chain of _py.matchException.
  let catchParam = null;
  let catchBody = [];
  if (node.handlers && node.handlers.length) {
    catchParam = '__exc';

    // We'll manually build a nested if_region ladder
    function buildHandler(idx) {
      if (idx >= node.handlers.length) {
        // No handler matched — re-throw
        const excLoad = ctx.emit('load', [catchParam], DYNAMIC, l);
        ctx.emit('throw', [excLoad.id], VOID, l);
        return;
      }
      const h = node.handlers[idx];
      if (!h.excType) {
        // bare except: catches everything
        if (h.name) {
          const excLoad = ctx.emit('load', [catchParam], DYNAMIC, l);
          ctx.emit('store', [h.name, excLoad.id], VOID, l);
          ctx.symbols.set(h.name, excLoad.id);
        }
        for (const s of h.body) lowerStmt_ad(ctx, s);
        return;
      }
      const excType = lowerExpr_ad(ctx, h.excType);
      const excLoad = ctx.emit('load', [catchParam], DYNAMIC, l);
      const cond = emitPyCall(ctx, 'matchException', [excLoad, excType], l, BOOL);

      const thenBody = captureOps(ctx, () => {
        if (h.name) {
          const excLoad2 = ctx.emit('load', [catchParam], DYNAMIC, l);
          ctx.emit('store', [h.name, excLoad2.id], VOID, l);
          ctx.symbols.set(h.name, excLoad2.id);
        }
        for (const s of h.body) lowerStmt_ad(ctx, s);
      });
      const elseBody = captureOps(ctx, () => buildHandler(idx + 1));
      ctx.emit('if_region', [cond.id], VOID, l, {
        then_body: thenBody, else_body: elseBody, phis: [],
      });
    }
    catchBody = captureOps(ctx, () => buildHandler(0));
  }

  // Finally
  let finallyBody = [];
  if (node.finalbody && node.finalbody.length) {
    finallyBody = captureOps(ctx, () => {
      for (const s of node.finalbody) lowerStmt_ad(ctx, s);
    });
  }

  return ctx.emit('try_region', [], VOID, l, {
    try_body: tryBody,
    catch_param: catchParam,
    catch_body: catchBody,
    finally_body: finallyBody,
  });
}

function lowerWith(ctx, node) {
  // `with mgr as x: body` lowers to (matching CPython's PEP 343 expansion):
  //     __mgr = mgr
  //     x = await __mgr.__enter__()
  //     try:
  //         body
  //         await _py.exitWith(__mgr, None)  # normal-exit: returns ignored
  //     except BaseException as __e:
  //         if not (await _py.exitWith(__mgr, __e)):
  //             raise
  //
  // For multiple managers `with a, b: body`, each manager wraps the next
  // in its own try (equivalent to nested `with` statements). Built
  // recursively so an inner manager's __exit__ suppression propagates
  // correctly — outer managers see no exception if an inner one suppressed.
  // _py.exitWith returns the (possibly awaited) suppression flag from
  // __exit__; the catch checks it and only re-raises on falsy.
  const l = ctx.loc(node);

  // Recursive lower: items[idx..] wrapping `body`.
  const lowerOne = (idx) => {
    if (idx >= node.items.length) {
      for (const s of node.body) lowerStmt_ad(ctx, s);
      return;
    }
    const item = node.items[idx];

    // __mgr = <expr>;  x = await __mgr.__enter__()
    const mgr = lowerExpr_ad(ctx, item.contextExpr);
    const mgrName = ctx.makeTempName('with_mgr');
    ctx.emit('store', [mgrName, mgr.id], VOID, l);
    ctx.symbols.set(mgrName, mgr.id);
    const mgrLoad = ctx.emit('load', [mgrName], DYNAMIC, l);
    const enterName = ctx.emit('const', ['__enter__'], STRING, l);
    const enterFn = emitPyCall(ctx, 'getattr', [mgrLoad, enterName], l);
    const enterCall = emitAwaitedCall_ad(ctx, enterFn.id, [], l);
    if (item.optionalVar) {
      lowerAssignTarget(ctx, item.optionalVar, enterCall, l);
    }

    // try-body: recurse for next manager (or emit body), then call
    // _py.exitWith(__mgr, null) for the normal-exit path. exitWith may be
    // async (user __exit__ is async-wrapped); await the result.
    const tryBody = captureOps(ctx, () => {
      lowerOne(idx + 1);
      const mgrLoadEx = ctx.emit('load', [mgrName], DYNAMIC, l);
      const noneVal = ctx.emit('const', [null], VOID, l);
      const exitCall = emitPyCall(ctx, 'exitWith', [mgrLoadEx, noneVal], l);
      ctx.emit('await', [exitCall.id], DYNAMIC, l);
    });

    // catch: call exitWith(__mgr, e); await; if not truthy, re-raise.
    const catchParam = ctx.makeTempName('with_exc');
    const catchBody = captureOps(ctx, () => {
      const mgrLoadEx = ctx.emit('load', [mgrName], DYNAMIC, l);
      const eLoad = ctx.emit('load', [catchParam], DYNAMIC, l);
      const exitCall = emitPyCall(ctx, 'exitWith', [mgrLoadEx, eLoad], l);
      const suppress = ctx.emit('await', [exitCall.id], DYNAMIC, l);
      const truthy = emitPyCall(ctx, 'truthy', [suppress], l, BOOL);
      const negated = ctx.emit('logical_not', [truthy.id], BOOL, l);
      const raiseBody = captureOps(ctx, () => {
        const eLoad2 = ctx.emit('load', [catchParam], DYNAMIC, l);
        emitPyCall(ctx, 'raise', [eLoad2], l, VOID);
      });
      ctx.emit('if_region', [negated.id], VOID, l, {
        then_body: raiseBody,
        else_body: [],
      });
    });

    ctx.emit('try_region', [], VOID, l, {
      try_body: tryBody,
      catch_param: catchParam,
      catch_body: catchBody,
      finally_body: [],
    });
  };

  lowerOne(0);
  return null;
}

function lowerClassDef(ctx, node) {
  // Lower class via a _py.createClass runtime helper that mirrors the tree-walker.
  const l = ctx.loc(node);
  const name = node.name;

  // Evaluate bases
  const bases = (node.bases || []).map(b => lowerExpr_ad(ctx, b));
  const basesArr = ctx.emit('array_new', bases.map(b => b.id), DYNAMIC, l);

  // Lower class body as a function that receives an empty object and populates it.
  // The class body is a sequence of statements (method defs, assignments, etc.)
  // that assign to names. We collect them into an object we return.
  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;
  ctx.symbols = ctx.symbols.push();

  const body = captureOps(ctx, () => {
    // Run class body — method defs become locals, assignments become locals
    for (const stmt of node.body) lowerStmt_ad(ctx, stmt);

    // Build the class members dict from the locals
    // We need to track which names were defined in the class body.
    // Use a synthetic approach: collect names via post-analysis of the ops.
    const classMemberNames = [];
    for (const op of ctx.ops) {
      if (op.op === 'store' && typeof op.args[0] === 'string' &&
          !op.args[0].startsWith('__') && !classMemberNames.includes(op.args[0])) {
        classMemberNames.push(op.args[0]);
      }
      // Also catch func_region direct defines
      if (op.op === 'func_region' && op.name && !classMemberNames.includes(op.name)) {
        classMemberNames.push(op.name);
      }
    }
    // Append object literal containing all member names
    const pairs = classMemberNames.map(n => ({
      key: n,
      id: ctx.emit('load', [n], DYNAMIC, l).id,
    }));
    const membersObj = ctx.emit('object_new', pairs, DYNAMIC, l);
    ctx.emit('return', [membersObj.id], VOID, l);
  });

  ctx.topLevel = savedTopLevel;
  ctx.symbols = ctx.symbols.pop();

  // Wrap body in a function: async () => { ...body; return {...} }
  const bodyFn = ctx.emit('func_region', [null], DYNAMIC, l, {
    name: null, params: [], body, ret_type: DYNAMIC,
    is_async: true, is_generator: false,
  });

  // decorators, bottom-up
  const decorators = (node.decorators || []).map(d => lowerExpr_ad(ctx, d));

  // Call class body to get members
  const membersCall = ctx.emit('call', [bodyFn.id], DYNAMIC, l);
  const membersAwaited = ctx.emit('await', [membersCall.id], DYNAMIC, l);

  // _py.createClass(name, bases, members)
  const nameConst = ctx.emit('const', [name], STRING, l);
  let classOp = emitPyCall(ctx, 'createClass', [nameConst, basesArr, membersAwaited], l);

  // Apply decorators bottom-up
  for (let i = decorators.length - 1; i >= 0; i--) {
    const d = decorators[i];
    const call = ctx.emit('call', [d.id, classOp.id], DYNAMIC, l);
    classOp = ctx.emit('await', [call.id], DYNAMIC, l);
  }

  ctx.emit('store', [name, classOp.id], VOID, l);
  ctx.symbols.set(name, classOp.id);
  if (savedTopLevel) ctx.defines.add(name);
  return null;
}

function lowerImport(ctx, node) {
  const l = ctx.loc(node);
  // import a, b as c, d.e as f, "./utils.py" as u
  for (const { module, alias, path } of node.names) {
    let mod;
    let bindName;
    if (path) {
      // Path import: `import "./utils.py" as u`. Alias always present (required by parser).
      const pathConst = ctx.emit('const', [path], STRING, l);
      const call = emitPyCall(ctx, 'importPath', [pathConst], l);
      mod = ctx.emit('await', [call.id], DYNAMIC, l);
      bindName = alias;
    } else {
      const nameConst = ctx.emit('const', [module], STRING, l);
      // _py.import is async (it may need to async-load a module from VFS), so
      // the emitted call must be awaited. Unlike the sync `_py.*` helpers
      // (add, sub, truthy, ...), the result is a Promise, not the module.
      const call = emitPyCall(ctx, 'import', [nameConst], l);
      mod = ctx.emit('await', [call.id], DYNAMIC, l);
      // For dotted names like `a.b`, bind the top-level `a` unless aliased.
      bindName = alias || module.split('.')[0];
    }
    ctx.emit('store', [bindName, mod.id], VOID, l);
    ctx.symbols.set(bindName, mod.id);
    if (ctx.topLevel) ctx.defines.add(bindName);
  }
  return null;
}

function lowerImportFrom(ctx, node) {
  const l = ctx.loc(node);
  // Build names array: [{name, alias}, ...]
  const pairs = node.names.map(({ name, alias }) => {
    const p = [];
    p.push({ key: 'name', id: ctx.emit('const', [name], STRING, l).id });
    if (alias) p.push({ key: 'alias', id: ctx.emit('const', [alias], STRING, l).id });
    else p.push({ key: 'alias', id: ctx.emit('const', [null], VOID, l).id });
    return ctx.emit('object_new', p, DYNAMIC, l);
  });
  const namesArr = ctx.emit('array_new', pairs.map(p => p.id), DYNAMIC, l);
  // Path form: `from "./utils.py" import foo` → _py.importFromPath(path, names).
  // Logical form: `from os import path` → _py.importFrom(module, names).
  let importCall;
  if (node.path) {
    const pathConst = ctx.emit('const', [node.path], STRING, l);
    importCall = emitPyCall(ctx, 'importFromPath', [pathConst, namesArr], l);
  } else {
    const moduleName = ctx.emit('const', [node.module], STRING, l);
    importCall = emitPyCall(ctx, 'importFrom', [moduleName, namesArr], l);
  }
  const result = ctx.emit('await', [importCall.id], DYNAMIC, l);
  // Destructure result into scope: for each name, bind (alias || name) to result[name]
  for (const { name, alias } of node.names) {
    if (name === '*') continue; // wildcard — would need runtime enumeration
    const bindName = alias || name;
    const keyConst = ctx.emit('const', [bindName], STRING, l);
    const val = emitPyCall(ctx, 'getitem', [result, keyConst], l);
    ctx.emit('store', [bindName, val.id], VOID, l);
    ctx.symbols.set(bindName, val.id);
    if (ctx.topLevel) ctx.defines.add(bindName);
  }
  return null;
}

function lowerDelete(ctx, node) {
  const l = ctx.loc(node);
  for (const target of node.targets) {
    if (target.type === 'Name') {
      // Intentional limitation: `del <bare-name>` sets the binding to undefined
      // rather than truly unbinding it (transpiled JS has no `delete localVar`,
      // and a subsequent read would NameError in CPython but reads undefined
      // here). The common cases — `del dict[k]`, slices, attributes — ARE exact
      // (delitem/delslice/delattr below). Bare-name del is rare; the tree-walker
      // fallback covers code that genuinely depends on the unbind.
      const undef = ctx.emit('const', [undefined], VOID, l);
      ctx.emit('store', [target.id, undef.id], VOID, l);
      ctx.symbols.set(target.id, undef.id);
    } else if (target.type === 'Subscript') {
      const obj = lowerExpr_ad(ctx, target.value);
      if (target.slice.type === 'Slice') {
        const lower = target.slice.lower ? lowerExpr_ad(ctx, target.slice.lower) : ctx.emit('const', [null], VOID, l);
        const upper = target.slice.upper ? lowerExpr_ad(ctx, target.slice.upper) : ctx.emit('const', [null], VOID, l);
        const step = target.slice.step ? lowerExpr_ad(ctx, target.slice.step) : ctx.emit('const', [null], VOID, l);
        emitPyCall(ctx, 'delslice', [obj, lower, upper, step], l, VOID);
      } else {
        const key = lowerExpr_ad(ctx, target.slice);
        emitPyCall(ctx, 'delitem', [obj, key], l, VOID);
      }
    } else if (target.type === 'Attribute') {
      const obj = lowerExpr_ad(ctx, target.value);
      const name = ctx.emit('const', [target.attr], STRING, l);
      emitPyCall(ctx, 'delattr', [obj, name], l, VOID);
    } else {
      throw new AirLowerError(`unsupported del target: ${target.type}`);
    }
  }
  return null;
}

// ── Control flow ──

function lowerIf_ad(ctx, node) {
  return lowerIfRegion(ctx,
    () => lowerExpr_ad(ctx, node.test),
    () => { for (const s of node.body) lowerStmt_ad(ctx, s); },
    () => { if (node.orelse) for (const s of node.orelse) lowerStmt_ad(ctx, s); },
    ctx.loc(node));
}

function lowerFor_ad(ctx, node) {
  // for target in iter: body (target may be Name or Tuple/List)
  const l = ctx.loc(node);
  if (node.orelse && node.orelse.length) {
    // for/else desugar via _lowerLoopWithElse, mirroring while/else.
    return _lowerLoopWithElse(ctx, node, l, () => _lowerForLoopBody(ctx, node, l));
  }
  // Any loop is a fresh `break` target — null the outer breakHook for the
  // body so a `break` inside this loop only ends THIS loop, not the outer
  // loop with an else clause.
  return _withClearedBreakHook(ctx, () => _lowerForLoopBody(ctx, node, l));
}

function _withClearedBreakHook(ctx, fn) {
  const prev = ctx.breakHook;
  ctx.breakHook = null;
  try { return fn(); } finally { ctx.breakHook = prev; }
}

function _lowerForLoopBody(ctx, node, l) {
  const iter = lowerExpr_ad(ctx, node.iter);
  const iterArr = emitPyIter(ctx, iter, l);

  // Simple case: target is an Identifier
  if (node.target.type === 'Name') {
    const loopVar = node.target.id;
    const undefOp = ctx.emit('const', [undefined], VOID, l);
    ctx.emit('store', [loopVar, undefOp.id], VOID, l);
    ctx.symbols.set(loopVar, undefOp.id);
    if (ctx.topLevel) ctx.defines.add(loopVar);

    const body = captureOps(ctx, () => {
      for (const s of node.body) lowerStmt_ad(ctx, s);
    });
    return ctx.emit('for_of_region', [iterArr.id], VOID, l, {
      body, phis: [], target_name: loopVar,
    });
  }

  // Tuple/List target: use a synthetic temp variable, unpack in body
  if (node.target.type === 'Tuple' || node.target.type === 'List') {
    const tempName = ctx.makeTempName('forv');
    // Pre-declare each target element at module scope if top-level
    _preDeclareTargetNames(ctx, node.target, l);

    const body = captureOps(ctx, () => {
      // Unpack temp into target
      const tempLoad = ctx.emit('load', [tempName], DYNAMIC, l);
      for (let i = 0; i < node.target.elts.length; i++) {
        const elt = node.target.elts[i];
        const idx = ctx.emit('const', [i], I32, l);
        const item = emitPyCall(ctx, 'getitem', [tempLoad, idx], l);
        lowerAssignTarget(ctx, elt, item, l);
      }
      for (const s of node.body) lowerStmt_ad(ctx, s);
    });
    return ctx.emit('for_of_region', [iterArr.id], VOID, l, {
      body, phis: [], target_name: tempName,
    });
  }

  throw new AirLowerError(`unsupported for-loop target: ${node.target.type}`);
}

function _preDeclareTargetNames(ctx, target, l) {
  if (!target) return;
  if (target.type === 'Name') {
    if (!ctx.symbols.has(target.id)) {
      const undef = ctx.emit('const', [undefined], VOID, l);
      ctx.emit('store', [target.id, undef.id], VOID, l);
      ctx.symbols.set(target.id, undef.id);
      if (ctx.topLevel) ctx.defines.add(target.id);
    }
    return;
  }
  if (target.type === 'Tuple' || target.type === 'List') {
    for (const elt of target.elts) _preDeclareTargetNames(ctx, elt, l);
  }
  if (target.type === 'Starred') _preDeclareTargetNames(ctx, target.value, l);
}

function lowerWhile_ad(ctx, node) {
  const l = ctx.loc(node);
  const hasElse = node.orelse && node.orelse.length;
  if (!hasElse) {
    return _withClearedBreakHook(ctx, () => lowerLoopRegion(ctx,
      () => lowerExpr_ad(ctx, node.test),
      () => { for (const s of node.body) lowerStmt_ad(ctx, s); },
      l, 'while'));
  }

  // while/else desugar: `__broken = False; while test: body (with break →
  // __broken = True; break); if not __broken: orelse`. Inner loops save/
  // restore breakHook via the try/finally so a nested break doesn't fire
  // the outer loop's hook.
  return _lowerLoopWithElse(ctx, node, l, () => {
    lowerLoopRegion(ctx,
      () => lowerExpr_ad(ctx, node.test),
      () => { for (const s of node.body) lowerStmt_ad(ctx, s); },
      l, 'while');
  });
}

function _lowerLoopWithElse(ctx, node, l, lowerLoopFn) {
  const brokenName = ctx.makeTempName('broken');
  const falseVal = ctx.emit('const', [false], BOOL, l);
  ctx.emit('store', [brokenName, falseVal.id], VOID, l);

  const prevHook = ctx.breakHook;
  ctx.breakHook = (brkLoc) => {
    const trueVal = ctx.emit('const', [true], BOOL, l);
    ctx.emit('store', [brokenName, trueVal.id], VOID, brkLoc || l);
  };
  try {
    lowerLoopFn();
  } finally {
    ctx.breakHook = prevHook;
  }

  // if (not __broken) { orelse }
  const loadBroken = ctx.emit('load', [brokenName], BOOL, l);
  const notBroken = ctx.emit('logical_not', [loadBroken.id], BOOL, l);
  const orelseBody = captureOps(ctx, () => {
    for (const s of node.orelse) lowerStmt_ad(ctx, s);
  });
  ctx.emit('if_region', [notBroken.id], VOID, l, {
    then_body: orelseBody, else_body: [], phis: [],
  });
  return null;
}

// ── Functions and lambdas ──

// Detect if a function body contains yield (makes it a generator)
function _containsYield(stmts) {
  for (const s of stmts || []) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'Yield' || s.type === 'YieldFrom') return true;
    // Don't descend into nested functions/classes/lambdas
    if (s.type === 'FunctionDef' || s.type === 'AsyncFunctionDef' ||
        s.type === 'ClassDef' || s.type === 'Lambda') continue;
    for (const key of Object.keys(s)) {
      if (key === 'type' || key === 'line' || key === 'col') continue;
      const v = s[key];
      if (Array.isArray(v)) { if (_containsYield(v)) return true; }
      else if (v && typeof v === 'object' && v.type) {
        if (_containsYield([v])) return true;
      }
    }
  }
  return false;
}

// Build a parameter list + prologue ops that binds positional/vararg/kwonly/kwarg
// Returns { jsParams, prologueOps } where jsParams is the JS function signature
// and prologueOps are ops to emit at the start of the body.
function _buildParamBinding(ctx, node, l) {
  const positionalParams = node.params || [];
  const kwonly = node.kwonly || [];
  const vararg = node.vararg;
  const kwarg = node.kwarg;

  // JS parameters: all positional (with optional defaults inlined as JS default values
  // via a special dynamic mechanism), then one rest parameter for the remaining.
  // For simplicity we collect everything in ...callArgs and bind in the prologue.
  // Naming: use the original Python parameter names in the body.

  // For the simple fast path (no vararg, no kwarg, no kwonly, no defaults), use native
  // JS params directly. This avoids the prologue overhead for common functions.
  const hasAnyDefault = positionalParams.some(p => p.default);
  const hasKwonly = kwonly.length > 0;
  const isSimple = !vararg && !kwarg && !hasKwonly && !hasAnyDefault;

  if (isSimple) {
    // Fast path: native JS params, with handling for a trailing kwargs bag that
    // may be ignored or matched by name. Resolve param annotations so passes
    // can specialise arithmetic and helper calls inside the body.
    const params = positionalParams.map(p => ({
      name: p.name,
      type: resolveAdderAnnotation(p.annotation),
    }));
    // Prologue: strip trailing _kw bag if present (caller may pass kwargs)
    const prologueOps = [];
    return { params, prologueOps, isSimple: true };
  }

  // Complex path: use ...callArgs and bind in prologue.
  // The JS function signature is `function(...__args)`, and we extract from __args.
  const params = [{ name: '...__args', type: DYNAMIC }];

  const prologueOps = captureOps(ctx, () => {
  // _kwObj = (last arg has _kw marker) ? args.pop() : null
  // const _kwObj = (__args.length > 0 && __args[__args.length-1]?._kw) ? __args.pop() : null;
  emitRaw(ctx, `let __kw = null;`, '__kw');
  emitRaw(ctx, `if (__args.length > 0 && __args[__args.length-1] && __args[__args.length-1]._kw) __kw = __args.pop();`);

  // Track parameter names used (for **kwargs exclusion)
  const usedNames = [];

  // Positional parameters
  for (let i = 0; i < positionalParams.length; i++) {
    const p = positionalParams[i];
    usedNames.push(p.name);
    if (p.default) {
      // Evaluate default in case not provided
      const defVal = lowerExpr_ad(ctx, p.default);
      emitRaw(ctx, `let ${p.name} = (__args.length > ${i}) ? __args[${i}] : (__kw && '${p.name}' in __kw ? __kw['${p.name}'] : ${_refExpr(ctx, defVal.id)});`, p.name);
    } else {
      emitRaw(ctx, `let ${p.name} = (__args.length > ${i}) ? __args[${i}] : (__kw && '${p.name}' in __kw ? __kw['${p.name}'] : (() => { throw new Error("${node.name || '<fn>'}() missing required argument: '${p.name}'"); })());`, p.name);
    }
    ctx.symbols.set(p.name, null);
  }

  // *args — vararg
  if (vararg) {
    emitRaw(ctx, `let ${vararg} = __args.slice(${positionalParams.length});`, vararg);
    ctx.symbols.set(vararg, null);
    usedNames.push(vararg);
  }

  // Keyword-only params
  for (const p of kwonly) {
    usedNames.push(p.name);
    if (p.default) {
      const defVal = lowerExpr_ad(ctx, p.default);
      emitRaw(ctx, `let ${p.name} = (__kw && '${p.name}' in __kw) ? __kw['${p.name}'] : ${_refExpr(ctx, defVal.id)};`, p.name);
    } else {
      emitRaw(ctx, `let ${p.name} = (__kw && '${p.name}' in __kw) ? __kw['${p.name}'] : (() => { throw new Error("${node.name || '<fn>'}() missing keyword argument: '${p.name}'"); })();`, p.name);
    }
    ctx.symbols.set(p.name, null);
  }

  // **kwargs — collect remaining
  if (kwarg) {
    const excludeList = [...usedNames, '_kw'].map(n => `'${n}'`).join(',');
    emitRaw(ctx, `let ${kwarg} = {}; if (__kw) { const __used = new Set([${excludeList}]); for (const __k in __kw) if (!__used.has(__k)) ${kwarg}[__k] = __kw[__k]; }`, kwarg);
    ctx.symbols.set(kwarg, null);
  }
  });

  return { params, prologueOps, isSimple: false };
}

// Helper: emit a raw JS line via an 'opaque' op (statement-level)
function emitRaw(ctx, jsLine, declaredName = null) {
  const op = ctx.emit('opaque', [jsLine], VOID, null);
  // When the raw line declares a name (`let X = ...;`), record it on the
  // op so the emitter pushes X into the current scope chain. Without this
  // hook, downstream `store X` ops re-emit `let X = ...` and trigger a
  // temporal-dead-zone shadow (V8: "Cannot access 'X' before initialization").
  if (declaredName) op._markDeclared = declaredName;
}

// Helper: stringify SSA id into a ref that the emitter will resolve.
// Since we're building raw JS strings for prologue, we need the SSA value as a JS expression.
// Approach: emit a store to a synthetic name, then use that name in the raw line.
function _refExpr(ctx, ssaId) {
  // Emit a store to a fresh name, then reference it
  const name = `__tmp_${ssaId.slice(1)}`;
  ctx.emit('store', [name, ssaId], VOID, null);
  ctx.symbols.set(name, ssaId);
  return name;
}

function lowerFuncDef(ctx, node) {
  const l = ctx.loc(node);
  const name = node.name;
  const isGenerator = _containsYield(node.body);

  // Lower decorators (evaluated at def time, applied bottom-up after def)
  const decorators = (node.decorators || []).map(d => lowerExpr_ad(ctx, d));

  // Lower body in nested scope. The save-and-Map-clone idiom we used to
  // run is replaced by ScopeChain push/pop now that ctx.symbols extends
  // BaseLowerCtx — same semantics, less ceremony.
  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;
  ctx.symbols = ctx.symbols.push();

  let params = null;
  let isSimple = null;
  const body = captureOps(ctx, () => {
    // Build parameter binding (prologue + JS params)
    const r = _buildParamBinding(ctx, node, l);
    params = r.params; isSimple = r.isSimple;

    // Emit prologue ops
    for (const op of r.prologueOps) ctx.ops.push(op);

    // Docstring skip (first string expression)
    let startIdx = 0;
    if (node.body.length > 0 && node.body[0].type === 'Expr' &&
        node.body[0].value.type === 'Constant' &&
        typeof node.body[0].value.value === 'string') {
      startIdx = 1;
    }
    for (let i = startIdx; i < node.body.length; i++) lowerStmt_ad(ctx, node.body[i]);
  });

  ctx.topLevel = savedTopLevel;
  ctx.symbols = ctx.symbols.pop();

  // Return type from `-> Type` annotation, if present.
  const retType = node.returns ? resolveAdderAnnotation(node.returns) : DYNAMIC;

  // Carry the function's signature as the op's own type so name-typing at
  // call sites can read off ret_type. Mirrors what the JS lowerer does.
  const fType = func(params.map(p => p.type || DYNAMIC), retType);

  // Sync if analyseSyncFunctions flagged this name AND it's not a generator.
  // The body's lowering above already used ctx.syncFunctions to skip awaits
  // at sync callsites, so the body has zero await ops in the sync case.
  const isSync = !isGenerator && ctx.syncFunctions.has(name);

  const op = ctx.emit('func_region', [name], fType, l, {
    name, params, body, ret_type: retType,
    // Top-level: trust analyseSyncFunctions (it handles decorators, cross-function
    // async, and the await-insertion at call sites). Nested functions are never
    // analysed there, so don't force them async — emit-js's emitFunc promotes to
    // async iff the body actually awaits (the same _bodyHasAwait path generators
    // use). A sync nested function thus emits a plain `function`, usable as a
    // synchronous JS callback.
    is_async: savedTopLevel ? (!isSync && !isGenerator) : false,
    is_generator: isGenerator,
  });

  // Always emit a store so the function name is visible in the enclosing scope.
  // (At module scope, this becomes `let name = funcExpr` via the emitter.
  //  At function scope, nested defs also need to be stored so sibling code can see them.)
  ctx.emit('store', [name, op.id], VOID, l);
  ctx.symbols.set(name, op.id);
  let finalId = op.id;

  // Apply decorators bottom-up: name = decorator(name)
  for (let i = decorators.length - 1; i >= 0; i--) {
    const dec = decorators[i];
    const loadFn = ctx.emit('load', [name], DYNAMIC, l);
    const call = ctx.emit('call', [dec.id, loadFn.id], DYNAMIC, l);
    const awaited = ctx.emit('await', [call.id], DYNAMIC, l);
    ctx.emit('store', [name, awaited.id], VOID, l);
    ctx.symbols.set(name, awaited.id);
    finalId = awaited.id;
  }

  if (ctx.topLevel) {
    ctx.defines.add(name);
    ctx.symbols.set(name, finalId);
  }

  return op;
}

function lowerLambda(ctx, node) {
  const l = ctx.loc(node);
  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;
  ctx.symbols = ctx.symbols.push();

  let params = null;
  const body = captureOps(ctx, () => {
    // Reuse the function param binding logic
    const r = _buildParamBinding(ctx, node, l);
    params = r.params;
    for (const op of r.prologueOps) ctx.ops.push(op);

    const val = lowerExpr_ad(ctx, node.body);
    ctx.emit('return', [val.id], VOID, l);
  });

  ctx.topLevel = savedTopLevel;
  ctx.symbols = ctx.symbols.pop();

  return ctx.emit('func_region', [null], DYNAMIC, l, {
    name: null, params, body, ret_type: DYNAMIC,
    // Lambdas are never async-defs (Python has no `async lambda`). emit-js's
    // emitFunc promotes to async iff the body actually awaits (_bodyHasAwait), so a
    // sync lambda — the common map/filter/sort/Series.apply callback — emits a plain
    // `function`, callable synchronously by JS consumers. (Was hardcoded `true`,
    // which forced an async wrapper, so JS callers got a Promise instead of a value.)
    is_async: false, is_generator: false,
  });
}

// ── List comprehension ──
// [expr for target in iter if cond ...] → loop + array.push

function lowerListOrTuple(ctx, node) {
  const l = ctx.loc(node);
  // If no starred elements, use array_new directly
  const hasStarred = node.elts.some(e => e.type === 'Starred');
  if (!hasStarred) {
    const elts = node.elts.map(e => lowerExpr_ad(ctx, e).id);
    return ctx.emit('array_new', elts, DYNAMIC, l);
  }
  // With starred elements: build via _py.buildList which flattens starred iterables
  const parts = node.elts.map(e => {
    if (e.type === 'Starred') {
      const inner = lowerExpr_ad(ctx, e.value);
      return { spread: true, id: inner.id };
    }
    return { spread: false, id: lowerExpr_ad(ctx, e).id };
  });
  // Emit object with spread markers — use object_new with mixed spread/plain
  // Actually, easier: use _py.buildList with an array of {spread, value} pairs.
  // Simplest JS: emit an array literal with ...spread directly.
  const argIds = [];
  for (const p of parts) {
    if (p.spread) {
      argIds.push(ctx.emit('spread', [p.id], DYNAMIC, l).id);
    } else {
      argIds.push(p.id);
    }
  }
  return ctx.emit('array_new', argIds, DYNAMIC, l);
}

function lowerComprehension(ctx, node) {
  const l = ctx.loc(node);
  const kind = node.type; // 'ListComp' | 'SetComp' | 'DictComp' | 'GeneratorExp'

  // Result storage depends on kind
  let tempName, initOp;
  if (kind === 'ListComp' || kind === 'GeneratorExp') {
    initOp = ctx.emit('array_new', [], DYNAMIC, l);
    tempName = ctx.makeTempName('comp');
  } else if (kind === 'SetComp') {
    const arr = ctx.emit('array_new', [], DYNAMIC, l);
    initOp = emitPyCall(ctx, 'makeSet', [arr], l);
    tempName = ctx.makeTempName('setc');
  } else {
    // DictComp — use a Map
    const empty1 = ctx.emit('array_new', [], DYNAMIC, l);
    const empty2 = ctx.emit('array_new', [], DYNAMIC, l);
    initOp = emitPyCall(ctx, 'makeDict', [empty1, empty2], l);
    tempName = ctx.makeTempName('dictc');
  }
  ctx.emit('store', [tempName, initOp.id], VOID, l);
  ctx.symbols.set(tempName, initOp.id);

  function buildComp(genIdx) {
    if (genIdx >= node.generators.length) {
      // innermost: append/add/set to result
      const loadResult = ctx.emit('load', [tempName], DYNAMIC, l);
      if (kind === 'ListComp' || kind === 'GeneratorExp') {
        const val = lowerExpr_ad(ctx, node.elt);
        ctx.emit('call_method', [loadResult.id, 'push', val.id], VOID, l);
      } else if (kind === 'SetComp') {
        const val = lowerExpr_ad(ctx, node.elt);
        ctx.emit('call_method', [loadResult.id, 'add', val.id], VOID, l);
      } else {
        // DictComp: key and value
        const key = lowerExpr_ad(ctx, node.key);
        const val = lowerExpr_ad(ctx, node.value);
        ctx.emit('call_method', [loadResult.id, 'set', key.id, val.id], VOID, l);
      }
      return;
    }
    const gen = node.generators[genIdx];
    const iter = lowerExpr_ad(ctx, gen.iter);
    const iterArr = emitPyIter(ctx, iter, l);

    let targetName;
    const body = captureOps(ctx, () => {
      // Handle target (Name or Tuple/List for unpacking)
      if (gen.target.type === 'Name') {
        targetName = gen.target.id;
        ctx.symbols.set(targetName, null);
      } else if (gen.target.type === 'Tuple' || gen.target.type === 'List') {
        targetName = ctx.makeTempName('gen');
        _preDeclareTargetNames(ctx, gen.target, l);
        // Unpack inside the loop body
        const tempLoad = ctx.emit('load', [targetName], DYNAMIC, l);
        for (let i = 0; i < gen.target.elts.length; i++) {
          const elt = gen.target.elts[i];
          const idx = ctx.emit('const', [i], I32, l);
          const item = emitPyCall(ctx, 'getitem', [tempLoad, idx], l);
          lowerAssignTarget(ctx, elt, item, l);
        }
      } else {
        throw new AirLowerError('unsupported comprehension target type');
      }

      function withFilters(filterIdx) {
        if (!gen.ifs || filterIdx >= gen.ifs.length) {
          buildComp(genIdx + 1);
          return;
        }
        const cond = lowerExpr_ad(ctx, gen.ifs[filterIdx]);
        const truthy = emitPyCall(ctx, 'truthy', [cond], l, BOOL);
        const thenBody = captureOps(ctx, () => withFilters(filterIdx + 1));
        ctx.emit('if_region', [truthy.id], VOID, l, {
          then_body: thenBody, else_body: [], phis: [],
        });
      }
      withFilters(0);
    });

    ctx.emit('for_of_region', [iterArr.id], VOID, l, {
      body, phis: [], target_name: targetName,
    });
  }

  buildComp(0);

  return ctx.emit('load', [tempName], DYNAMIC, l);
}

// -- cell.js --

// Python cell type handler: parseNames, findUses, execute
// adder v2 — pure JS interpreter, no WASM





// ── parseNames: extract module-scope defines from Python code ──
// Uses the AST to find assignments at module scope — descends into with/for/if/
// try/while (which don't create Python scopes) but NOT into def/class (which do).
// Falls back to regex for unparseable code.

function pythonParseNames(code) {
  try {
    const ast = adderParse(code);
    const defines = new Set();
    _collectDefines(ast.body, defines);
    return defines;
  } catch {
    // parse error — fall back to regex (column-0 only)
    return _parseNamesRegex(code);
  }
}

// Walk AST statements, collecting assignment targets.
// Descends into block statements (with/for/if/try/while) but stops at def/class.
function _collectDefines(stmts, defines) {
  for (const node of stmts) {
    switch (node.type) {
      case 'Assign':
        for (const t of node.targets) _collectTargetNames(t, defines);
        break;
      case 'AugAssign':
        _collectTargetNames(node.target, defines);
        break;
      case 'AnnAssign':
        if (node.value) _collectTargetNames(node.target, defines);
        break;
      case 'FunctionDef':
      case 'AsyncFunctionDef':
        defines.add(node.name);
        break; // don't descend — new scope
      case 'ClassDef':
        defines.add(node.name);
        break; // don't descend — new scope
      case 'Import':
        for (const alias of node.names) defines.add(alias.alias || alias.module);
        break;
      case 'ImportFrom':
        for (const alias of node.names) defines.add(alias.alias || alias.name);
        break;
      case 'For':
      case 'AsyncFor':
        _collectTargetNames(node.target, defines);
        _collectDefines(node.body, defines);
        if (node.orelse) _collectDefines(node.orelse, defines);
        break;
      case 'While':
        _collectDefines(node.body, defines);
        if (node.orelse) _collectDefines(node.orelse, defines);
        break;
      case 'If':
        _collectDefines(node.body, defines);
        if (node.orelse) _collectDefines(node.orelse, defines);
        break;
      case 'With':
      case 'AsyncWith':
        for (const item of node.items) {
          if (item.optionalVar) _collectTargetNames(item.optionalVar, defines);
        }
        _collectDefines(node.body, defines);
        break;
      case 'Try':
        _collectDefines(node.body, defines);
        if (node.handlers) {
          for (const h of node.handlers) {
            if (h.name) defines.add(h.name);
            if (h.body) _collectDefines(h.body, defines);
          }
        }
        if (node.orelse) _collectDefines(node.orelse, defines);
        if (node.finalbody) _collectDefines(node.finalbody, defines);
        break;
      default:
        break;
    }
  }
}

// Extract names from assignment targets (Name, Tuple, List, Starred)
function _collectTargetNames(target, defines) {
  if (!target) return;
  if (target.type === 'Name') { defines.add(target.id); return; }
  if (target.type === 'Tuple' || target.type === 'List') {
    for (const elt of target.elts) _collectTargetNames(elt, defines);
    return;
  }
  if (target.type === 'Starred' && target.value) {
    _collectTargetNames(target.value, defines);
  }
}

// Regex fallback for unparseable code (column-0 only, same as before)
function _parseNamesRegex(code) {
  const defines = new Set();
  const lines = code.split('\n');

  for (const line of lines) {
    if (line.length === 0 || line[0] === ' ' || line[0] === '\t') continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] === '#') continue;

    let m;
    m = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z_]\w*)/);
    if (m) { defines.add(m[1]); continue; }
    m = trimmed.match(/^class\s+([a-zA-Z_]\w*)/);
    if (m) { defines.add(m[1]); continue; }
    m = trimmed.match(/^from\s+\S+\s+import\s+(.+)/);
    if (m) {
      for (const part of m[1].split(',')) {
        const asMatch = part.trim().match(/(\w+)\s+as\s+(\w+)/);
        if (asMatch) defines.add(asMatch[2]);
        else { const name = part.trim().match(/^([a-zA-Z_]\w*)/); if (name) defines.add(name[1]); }
      }
      continue;
    }
    m = trimmed.match(/^import\s+(\w+)(?:\s+as\s+(\w+))?/);
    if (m) { defines.add(m[2] || m[1]); continue; }
    m = trimmed.match(/^(\*?[a-zA-Z_]\w*(?:\s*,\s*\*?[a-zA-Z_]\w*)+)\s*=/);
    if (m && !_isPyKeyword(m[1].split(',')[0].trim().replace(/^\*/, ''))) {
      for (const n of m[1].split(',')) {
        const name = n.trim().replace(/^\*/, '');
        if (name && /^[a-zA-Z_]\w*$/.test(name)) defines.add(name);
      }
      continue;
    }
    m = trimmed.match(/^([a-zA-Z_]\w*)\s*(?::[^=]+=|=)/);
    if (m && !_isPyKeyword(m[1])) { defines.add(m[1]); continue; }
  }
  return defines;
}

const _pyKeywords = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield',
]);

function _isPyKeyword(name) { return _pyKeywords.has(name); }

// ── findUses: walk the AST for Name nodes ──

function pythonFindUses(code, allDefined) {
  const uses = new Set();
  try {
    const ast = adderParse(code);
    _collectNames(ast, allDefined, uses);
  } catch {
    // parse error — fall back to regex scan (better than no DAG wiring)
    for (const name of allDefined) {
      if (new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(code)) uses.add(name);
    }
  }
  return uses;
}

// Note: re-bound names (`df = df.rename(...)`) are intentionally
// included as uses even though they're also in the cell's defines.
// Excluding self-defined names breaks the read-before-write pattern —
// auditable's exec.js builds the cell's upstream scope from cell.uses,
// so if `df` isn't in uses, the cell never sees the upstream value
// even though it reads it on the RHS. Self-cycles in the dep graph
// are deduped by topoSort's needsRun set, so no infinite-loop risk.
function _collectNames(node, allDefined, uses) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Name' && allDefined.has(node.id)) uses.add(node.id);
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) { for (const item of val) _collectNames(item, allDefined, uses); }
    else if (val && typeof val === 'object' && val.type) _collectNames(val, allDefined, uses);
  }
}

// ── execute: run Python cell code ──

async function pythonExecute(code, scopeIn, cell) {
  // capture print output
  const outputParts = [];
  const printFn = (text) => outputParts.push(text);

  // parse
  const ast = adderParse(code);

  // create scope with builtins + upstream variables + cell context
  const scope = new AdderScope();
  const builtins = adderBuiltins(printFn);
  for (const [k, v] of Object.entries(builtins)) scope.set(k, v);
  for (const [k, v] of Object.entries(scopeIn)) scope.set(k, v);

  // inject cell context (ui, std, load, display, etc.) if available
  // these are the same builtins JS code cells get, created by _createCellContext
  const hasCtx = !!cell._ctx;
  if (hasCtx) {
    const ctx = cell._ctx;
    // override print to render directly to the output DOM (not buffered)
    // so print output coexists with canvases and other DOM content
    scope.set('print', (...args) => {
      let sep = ' ', end = '\n';
      if (args.length > 0 && args[args.length - 1]?._kw) { const kw = args.pop(); if (kw.sep !== undefined) sep = kw.sep; if (kw.end !== undefined) end = kw.end; }
      const text = args.map(pyStr).join(sep) + end;
      ctx.display(text.endsWith('\n') ? text.slice(0, -1) : text);
      return null;
    });
    // expose key builtins — skip internal/DOM-only ones
    const expose = ['ui', 'std', 'load', 'install', 'installBinary', 'display', 'invalidation', 'worker', 'workerPool', 'notebook', 'vfs'];
    for (const name of expose) {
      if (ctx[name] !== undefined) scope.set(name, ctx[name]);
    }
  }

  // Wire VFS from auditable runtime (lazy, once)
  if (!getAdderVFS() && typeof window !== 'undefined' && window._notebookVFS) {
    setAdderVFS(window._notebookVFS, window._vfsPath);
  }
  _ensureFsModules();

  // run before-cell hooks
  const _hookStates = [];
  if (typeof window !== 'undefined' && window._adderCellHooks) {
    for (const h of window._adderCellHooks) _hookStates.push(h.before?.(scope, cell) ?? null);
  }

  // parse loop-limit directive
  if (code.includes('# %noloop-limit')) {
    scope.set('__loop_limit__', 0);
  } else {
    const _llm = code.match(/# %loop-limit\s+(\d+)/);
    if (_llm) scope.set('__loop_limit__', parseInt(_llm[1]));
  }

  // evaluate — try transpile path first, fall back to tree-walker on any failure
  let lastExpr;
  let usedTranspile = false;
  let defines = {};

  const _airAdderLower = (typeof window !== 'undefined' && window._airGetLowerer)
    ? window._airGetLowerer('adder')
    : null;
  if (_airAdderLower && typeof window !== 'undefined' && window._airEmit) {
    try {
      const lowered = _airAdderLower(ast, code);
      if (lowered) {
        const air = lowered.air;
        const importNames = [...air.imports];
        const emittedJS = window._airEmit(air, importNames, [], {
          hinted: false,
          cellId: cell.id,
        });
        const AF = Object.getPrototypeOf(async function(){}).constructor;
        const allParams = ['_py', ...importNames];
        const fn = new AF(...allParams, emittedJS);

        // Resolve each import from scope
        const argValues = importNames.map(name => {
          if (scope.vars.has(name)) return scope.vars.get(name);
          return undefined;
        });

        const result = await fn(_py, ...argValues);
        usedTranspile = true;

        // Extract defines (excluding synthetic __lastExpr__)
        if (result && typeof result === 'object') {
          for (const [k, v] of Object.entries(result)) {
            if (k === '__lastExpr__') { lastExpr = v; continue; }
            defines[k] = v;
            scope.set(k, v); // also populate scope for hooks
          }
        }
      }
    } catch (e) {
      if (typeof window !== 'undefined' && window._airDebug) {
        console.warn('[AIR] adder transpile fallback for cell', cell.id, ':', e.message);
      }
      // fall through to tree-walker
      usedTranspile = false;
      defines = {};
    }
  }

  if (!usedTranspile) {
    try {
      lastExpr = await adderEval(ast, scope);
    } catch (e) {
      if (typeof window !== 'undefined' && window._adderCellHooks) {
        for (let i = 0; i < window._adderCellHooks.length; i++) {
          try { window._adderCellHooks[i].after?.(_hookStates[i], {}, scope); } catch {}
        }
      }
      if (e instanceof AdderError) throw e;
      throw e;
    }
    const cellDefines = pythonParseNames(code);
    for (const name of cellDefines) {
      if (scope.vars.has(name)) defines[name] = scope.vars.get(name);
    }
  }

  // run after-cell hooks
  if (typeof window !== 'undefined' && window._adderCellHooks) {
    for (let i = 0; i < window._adderCellHooks.length; i++) {
      window._adderCellHooks[i].after?.(_hookStates[i], defines, scope);
    }
  }

  // build output
  if (hasCtx) {
    // output already rendered to DOM via display() — show last expression too
    if (lastExpr !== undefined && lastExpr !== null) {
      if (typeof lastExpr === 'object' && typeof lastExpr._repr_html_ === 'function') cell._ctx.display(lastExpr);
      else if (typeof lastExpr === 'object' && typeof lastExpr.nodeType === 'number') cell._ctx.display(lastExpr);
      else cell._ctx.display(pyRepr(lastExpr));
    }
    return { defines };
  }
  // no cell context (standalone/test mode) — return output as string
  const parts = [];
  const printOutput = outputParts.join('');
  if (printOutput) parts.push(printOutput.endsWith('\n') ? printOutput.slice(0, -1) : printOutput);
  if (lastExpr !== undefined && lastExpr !== null) {
    parts.push(pyRepr(lastExpr));
  }
  return { defines, output: parts.length ? parts.join('\n') : undefined };
}


function _jsonReplacer(key, value) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}

// -- tag.js --

// adder tagged template + mpy alias
// Pure JS evaluation — no WASM bridge




async function adderTag(strings, ...values) {
  // build code with _v0, _v1 placeholders
  let code = strings[0];
  for (let i = 0; i < values.length; i++) {
    code += '_v' + i + strings[i + 1];
  }

  // dedent: strip common leading whitespace
  const lines = code.split('\n');
  let start = 0;
  if (lines[start].trim() === '') start++;
  let minIndent = Infinity;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const indent = lines[i].match(/^ */)[0].length;
    if (indent < minIndent) minIndent = indent;
  }
  if (minIndent > 0 && minIndent < Infinity) {
    for (let i = start; i < lines.length; i++) {
      if (lines[i].trim() !== '') lines[i] = lines[i].slice(minIndent);
    }
  }
  // trim leading blank line
  if (start > 0 && lines[0].trim() === '') lines.shift();
  // trim trailing blank line
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  code = lines.join('\n');

  // parse
  const ast = adderParse(code);

  // create scope with builtins + injected values
  const scope = new AdderScope();
  const builtins = adderBuiltins(() => {}); // discard print output in tag context
  for (const [k, v] of Object.entries(builtins)) scope.set(k, v);
  for (let i = 0; i < values.length; i++) scope.set('_v' + i, values[i]);

  // evaluate
  await adderEval(ast, scope);

  // extract non-underscore-prefixed names
  const result = {};
  for (const [k, v] of scope.vars) {
    if (!k.startsWith('_') && typeof v !== 'function' || (typeof v === 'function' && v._pyFunc)) {
      if (!k.startsWith('_')) result[k] = v;
    }
  }
  return result;
}

// back-compat alias
const mpy = adderTag;

// -- register.js --

// Registration: cell type, tagged languages, AIR lowerer, plugin metadata.
// Single auditable.registerExtension(manifest) call replaces the legacy
// fan-out across registerCellType / _taggedLanguages / registerPlugin /
// _airRegisterLowerer / window.adder / window.mpy.








const ADDER_VERSION = '0.3.0';

if (typeof window !== 'undefined' && !window._cellTypes?.['adder']) {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/adder',
      version: ADDER_VERSION,
      apiVersion: '0.x',
      description: 'JS-targeting Python dialect — adder cells and tagged template',
      pluginUrl: '@gcu/adder',

      cellType: {
        name: 'adder',
        label: 'adder',
        color: '#4B8BBE',
        shortcut: 'n',
        editDebounce: 500,
        capabilities: {
          executable: true,
          definesScope: true,
          hasOutput: true,
          hasEditor: true,
          builtin: false,
        },
        parseNames: pythonParseNames,
        findUses: pythonFindUses,
        execute: pythonExecute,
        tokenize: tokenizePython,
        completions: (prefix) => pythonCompletions(prefix),
        syntaxCheck: (code) => { try { adderParse(code); return true; } catch { return false; } },
        createEditor: (cell, onChange) => {
          if (!window._ctCreateEditor) return null;
          const wrap = document.createElement('div');
          wrap.className = 'editor-wrap';
          const editor = window._ctCreateEditor(wrap, cell.id, cell.code, 'adder', onChange);
          return {
            el: wrap,
            getCode: () => editor.view.state.doc.toString(),
            setCode: (s) => editor.view.dispatch({ changes: { from: 0, to: editor.view.state.doc.length, insert: s } }),
            focus: () => editor.focus(),
            destroy: () => editor.destroy(),
          };
        },
      },

      taggedLanguages: [
        { name: 'adder', tokenize: tokenizePython, completions: pythonCompletions },
        { name: 'mpy',   tokenize: tokenizePython, completions: pythonCompletions },
      ],

      airLowerer: { language: 'adder', fn: lowerAdder },

      globals: { adder: adderTag, mpy: mpy },
    });
  }
}

const adder = {
  adderTag,
  mpy,
  pythonParseNames,
  pythonFindUses,
  tokenizePython,
  pythonCompletions,
  setVFS: setAdderVFS,
  // the sandbox registrar (spec_inbox/lang/adder-sandbox-spec.md §2.4): make a module
  // importable without window._auditableExtensions — the same call a worker host makes
  registerModule, unregisterModule,
  // the library API (tree-walker) with the sandbox options — host / remote / budget —
  // so a single-file host vendors this bundle as is (golem's worker does)
  run, evalExpr, compile, isIncomplete, AdderRuntimeError,
};

export { adder };

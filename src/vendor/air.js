// ⚠ VENDORED — DO NOT EDIT. @gcu/air (the compiler adder's engine 'auto' uses: Python to JavaScript, run with new Function inside the worker), copied from ../auditable/ext/air/index.js at auditable 5fa5f72e (10 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.
// ⚠ GENERATED FILE — DO NOT EDIT. Source: ext/air/src/  Build: node ext/air/build.js
// @gcu/air — Auditable Intermediate Representation
// SSA IR for JS/TS analysis, type propagation, and optimized emission.

// -- types.js --

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

// -- schema.js --

// @gcu/air — Op schema (v0.3 §3.1)
//
// Single declarative source of truth for what every AIR op contains: how
// many SSA refs, in what shape, whether it has region children, what extras
// it requires, whether it's pure or side-effecting, whether it can be async.
//
// Every pass that walks the IR (countUses, propagateTypes, foldConstants,
// needsAsync, the validator, the pretty-printer) consults the schema via
// the helper functions below, so adding a new op is one row instead of
// editing eight switch statements.
//
// Args shape vocabulary:
//   'ssa'        — bare SSA id string ('%N')
//   'literal'    — JS literal (string/number/bool/undefined/null) for const
//   'name'       — variable name (for load/store/slot_*)
//   'key'        — string key (for object_get/set, call_method)
//   'label'      — label name for break/continue/labeled
//   'kind'       — typed-array element kind for ta_new
//   'meta_name'  — meta target ('new', 'import')
//
// Variadic shapes:
//   'ssa_list'         — args is an array of bare SSA ids (call args, array_new)
//   'pair_list'        — args is an array of { key|spread, id } records (object_new)
//   'name_then_ssas'   — args[0] is name, rest are SSA ids (call_method first
//                        position is the receiver SSA, but call_method is
//                        encoded as [obj_ssa, method_string, ...arg_ssa] so
//                        it gets its own shape)
//   'method_call'      — [ssa, key, ...ssa] for call_method
//   'ta_new_args'      — [kind, ...ssa] for ta_new

const SSA = 'ssa';
const LIT = 'literal';
const NAME = 'name';
const KEY = 'key';
const LABEL = 'label';

const OP_SCHEMA = {
  // ── Constants and primitive loads ──────────────────────────────────
  const: {
    arity: 'fixed', args: [LIT],
    result: 'value', side_effecting: false, can_be_async: false,
  },
  null: {
    arity: 'fixed', args: [],
    result: 'value', side_effecting: false, can_be_async: false,
  },
  load: {
    arity: 'fixed', args: [NAME],
    result: 'value', side_effecting: false, can_be_async: false,
  },
  store: {
    arity: 'fixed', args: [NAME, SSA],
    result: 'void', side_effecting: true, can_be_async: false,
  },
  meta: {
    arity: 'fixed', args: ['meta_name', 'meta_prop'],
    result: 'value', side_effecting: false, can_be_async: false,
  },

  // ── Slot allocation (closure cells for mutable captures) ───────────
  slot_alloc: {
    arity: 'fixed', args: [NAME],
    result: 'value', side_effecting: false, can_be_async: false,
  },
  slot_load: {
    arity: 'fixed', args: [NAME],
    result: 'value', side_effecting: false, can_be_async: false,
  },
  slot_store: {
    arity: 'fixed', args: [NAME, SSA],
    result: 'void', side_effecting: true, can_be_async: false,
  },

  // ── Arithmetic ─────────────────────────────────────────────────────
  add: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  sub: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  mul: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  div: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  mod: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  exp: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },

  // ── Comparison ─────────────────────────────────────────────────────
  eq:  { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  neq: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  lt:  { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  lte: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  gt:  { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  gte: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },

  // ── Bitwise ────────────────────────────────────────────────────────
  bitwise_or:    { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  bitwise_and:   { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  bitwise_xor:   { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  shift_left:    { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  shift_right:   { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  ushift_right:  { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },

  // ── Logical ────────────────────────────────────────────────────────
  logical_and:       { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  logical_or:        { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  nullish_coalesce:  { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },

  // ── Membership ─────────────────────────────────────────────────────
  in:         { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },
  instanceof: { arity: 'fixed', args: [SSA, SSA], result: 'value', side_effecting: false, can_be_async: false },

  // ── Unary ──────────────────────────────────────────────────────────
  neg:         { arity: 'fixed', args: [SSA], result: 'value', side_effecting: false, can_be_async: false },
  unary_plus:  { arity: 'fixed', args: [SSA], result: 'value', side_effecting: false, can_be_async: false },
  logical_not: { arity: 'fixed', args: [SSA], result: 'value', side_effecting: false, can_be_async: false },
  bitwise_not: { arity: 'fixed', args: [SSA], result: 'value', side_effecting: false, can_be_async: false },
  typeof:      { arity: 'fixed', args: [SSA], result: 'value', side_effecting: false, can_be_async: false },
  void:        { arity: 'fixed', args: [SSA], result: 'value', side_effecting: false, can_be_async: false },
  delete:      { arity: 'fixed', args: [SSA], result: 'value', side_effecting: true,  can_be_async: false },

  // ── Member access ──────────────────────────────────────────────────
  object_get: {
    arity: 'fixed', args: [SSA, KEY],
    result: 'value', side_effecting: false, can_be_async: false,
    extras: { optional: 'bool?' },
  },
  object_set: {
    arity: 'fixed', args: [SSA, KEY, SSA],
    result: 'void', side_effecting: true, can_be_async: false,
  },
  array_get: {
    arity: 'fixed', args: [SSA, SSA],
    result: 'value', side_effecting: false, can_be_async: false,
    extras: { optional: 'bool?' },
  },
  array_set: {
    arity: 'fixed', args: [SSA, SSA, SSA],
    result: 'void', side_effecting: true, can_be_async: false,
  },

  // ── Construction ───────────────────────────────────────────────────
  array_new: {
    arity: 'variadic', args: 'ssa_list',
    result: 'value', side_effecting: false, can_be_async: false,
  },
  object_new: {
    arity: 'variadic', args: 'pair_list',
    result: 'value', side_effecting: false, can_be_async: false,
  },
  ta_new: {
    arity: 'variadic', args: 'ta_new_args',  // [kind_string, ...ssa]
    result: 'value', side_effecting: false, can_be_async: false,
  },
  new: {
    arity: 'variadic', args: 'ssa_list',  // [ctor_ssa, ...arg_ssa]
    result: 'value', side_effecting: true, can_be_async: true,
  },

  // ── Calls ──────────────────────────────────────────────────────────
  call: {
    arity: 'variadic', args: 'ssa_list',  // [fn_ssa, ...arg_ssa]
    result: 'value', side_effecting: true, can_be_async: true,
  },
  call_method: {
    arity: 'variadic', args: 'method_call',  // [obj_ssa, method_key, ...arg_ssa]
    result: 'value', side_effecting: true, can_be_async: true,
  },
  await: {
    arity: 'fixed', args: [SSA],
    result: 'value', side_effecting: true, can_be_async: true,
  },
  spread: {
    arity: 'fixed', args: [SSA],
    result: 'value', side_effecting: false, can_be_async: false,
  },
  import: {
    arity: 'fixed', args: [SSA],
    result: 'value', side_effecting: true, can_be_async: true,
  },

  // ── Statements ─────────────────────────────────────────────────────
  throw: {
    arity: 'fixed', args: [SSA],
    result: 'void', side_effecting: true, can_be_async: false,
  },
  debugger: {
    arity: 'fixed', args: [],
    result: 'void', side_effecting: true, can_be_async: false,
  },
  return: {
    arity: 'fixed', args: [SSA],
    result: 'void', side_effecting: true, can_be_async: false,
  },
  break: {
    // args=[] for unlabeled, [label] for labeled
    arity: 'variadic', args: 'label_optional',
    result: 'void', side_effecting: true, can_be_async: false,
  },
  continue: {
    arity: 'variadic', args: 'label_optional',
    result: 'void', side_effecting: true, can_be_async: false,
  },
  yield: {
    // args=[] for `yield` no value, [ssa] for `yield expr`
    arity: 'variadic', args: 'ssa_optional',
    result: 'value', side_effecting: true, can_be_async: false,
  },
  yield_delegate: {
    arity: 'fixed', args: [SSA],
    result: 'value', side_effecting: true, can_be_async: false,
  },

  // ── Region ops ─────────────────────────────────────────────────────
  // if_region — produces a value when used as ternary (else_body present);
  // void as a statement. Conservatively 'value' here.
  if_region: {
    arity: 'fixed', args: [SSA],  // condition
    result: 'value', side_effecting: true, can_be_async: false,  // body decides actual side-effect
    regions: {
      then_body: { scope: 'block' },
      else_body: { scope: 'block', optional: true },
    },
    extras: {
      then_val: 'ssa?',
      else_val: 'ssa?',
      phis: 'phi_list?',
    },
    introduces_scope: true,
  },
  for_region: {
    arity: 'fixed', args: [],
    result: 'void', side_effecting: true, can_be_async: false,
    regions: {
      init: { scope: 'loop' },
      test: { scope: 'loop' },
      update: { scope: 'loop' },
      body: { scope: 'loop' },
    },
    extras: {
      test_val: 'ssa?',
      phis: 'phi_list?',
    },
    introduces_scope: true,
  },
  for_in_region: {
    arity: 'fixed', args: [SSA],  // iterable
    result: 'void', side_effecting: true, can_be_async: false,
    regions: { body: { scope: 'loop' } },
    extras: {
      target_name: 'string?',
      phis: 'phi_list?',
    },
    introduces_scope: true,
  },
  for_of_region: {
    arity: 'fixed', args: [SSA],  // iterable
    result: 'void', side_effecting: true, can_be_async: false,
    regions: { body: { scope: 'loop' } },
    extras: {
      target_name: 'string',  // REQUIRED (no silent _v fallback per v0.3 §3.2)
      phis: 'phi_list?',
    },
    introduces_scope: true,
  },
  loop_region: {
    arity: 'fixed', args: [],
    result: 'void', side_effecting: true, can_be_async: false,
    regions: {
      test: { scope: 'loop', optional: true },
      body: { scope: 'loop' },
      update: { scope: 'loop', optional: true },
    },
    extras: {
      test_val: 'ssa?',
      phis: 'phi_list?',
      kind: 'string?',  // 'while' | 'do_while' | 'condition_first' etc.
    },
    introduces_scope: true,
  },
  switch_region: {
    arity: 'fixed', args: [SSA],  // discriminant
    result: 'void', side_effecting: true, can_be_async: false,
    extras: {
      cases: 'case_list',  // [{ test_ops, test_val?, body }]
    },
    introduces_scope: true,
  },
  try_region: {
    arity: 'fixed', args: [],
    result: 'void', side_effecting: true, can_be_async: false,
    regions: {
      try_body: { scope: 'block' },
      catch_body: { scope: 'block', optional: true },
      finally_body: { scope: 'block', optional: true },
    },
    extras: {
      catch_param: 'string?',
    },
    introduces_scope: true,
  },
  labeled: {
    arity: 'fixed', args: [LABEL],
    result: 'void', side_effecting: true, can_be_async: false,
    regions: { body: { scope: 'block' } },
    extras: {
      is_block: 'bool?',
    },
    introduces_scope: true,
  },
  func_region: {
    // args is [name|null]; name is also kept on op for emit convenience
    arity: 'fixed', args: ['func_name'],
    result: 'value', side_effecting: false, can_be_async: false,  // declaring is pure
    regions: { body: { scope: 'function' } },
    extras: {
      name: 'string?',
      params: 'param_list',
      ret_type: 'type?',
      is_async: 'bool?',
      is_generator: 'bool?',
      is_decl: 'bool?',
    },
    introduces_scope: true,
  },
  class_region: {
    arity: 'fixed', args: ['class_name'],
    result: 'value', side_effecting: false, can_be_async: false,
    extras: {
      name: 'string?',
      members: 'member_list',  // [{ kind, key, value?, body?, ... }]
      superclass: 'ssa?',
    },
    introduces_scope: true,
  },

  // ── Special ────────────────────────────────────────────────────────
  // `opaque` is the relief valve for anything the lowerer can't model.
  // Args[0] is the JS source string; the emitter prints it verbatim.
  // Side effects unknown — conservative: yes; can be async too.
  opaque: {
    arity: 'fixed', args: ['source'],
    result: 'value', side_effecting: true, can_be_async: true,
    extras: {
      _markDeclared: 'string?',  // adder/soft global/nonlocal hint
    },
  },
};

// ── Helper API ────────────────────────────────────────────────────────

/**
 * Iterate every SSA reference an op contains. Replaces per-op switch-style
 * walkers in countUses, type propagation, dead-code elimination, etc.
 *
 * Calls fn(id) for each '%N' SSA reference found in args, region phis,
 * member declarations, switch case test_vals, and `extras` declared as
 * 'ssa'/'ssa?' in the schema.
 *
 * Does NOT recurse into region bodies — callers handle that explicitly via
 * forEachRegion (so they can control traversal order, scope tracking, etc).
 */
function forEachSsaRef(op, fn) {
  const schema = OP_SCHEMA[op.op];
  if (!schema) return;

  // 1. Direct args based on shape
  if (schema.arity === 'fixed') {
    for (let i = 0; i < schema.args.length; i++) {
      if (schema.args[i] === SSA && _isSsaId(op.args[i])) fn(op.args[i]);
    }
  } else if (schema.args === 'ssa_list') {
    for (const a of op.args) if (_isSsaId(a)) fn(a);
  } else if (schema.args === 'pair_list') {
    for (const p of op.args) {
      if (p && _isSsaId(p.id)) fn(p.id);
    }
  } else if (schema.args === 'method_call') {
    // [ssa, key, ...ssa]
    if (_isSsaId(op.args[0])) fn(op.args[0]);
    for (let i = 2; i < op.args.length; i++) {
      if (_isSsaId(op.args[i])) fn(op.args[i]);
    }
  } else if (schema.args === 'ta_new_args') {
    // [kind, ...ssa]
    for (let i = 1; i < op.args.length; i++) {
      if (_isSsaId(op.args[i])) fn(op.args[i]);
    }
  } else if (schema.args === 'label_optional') {
    /* args[0] is label string if present, no SSA */
  } else if (schema.args === 'ssa_optional') {
    if (op.args.length && _isSsaId(op.args[0])) fn(op.args[0]);
  }

  // 2. Extras declared as ssa/ssa?
  if (schema.extras) {
    for (const [key, spec] of Object.entries(schema.extras)) {
      if (spec === 'ssa' || spec === 'ssa?') {
        const v = op[key];
        if (_isSsaId(v)) fn(v);
      }
    }
  }

  // 3. phi lists (then_val/else_val per phi entry)
  if (op.phis) {
    for (const p of op.phis) {
      if (_isSsaId(p.then_val)) fn(p.then_val);
      if (_isSsaId(p.else_val)) fn(p.else_val);
    }
  }

  // 4. Switch case test_vals + member computed-key SSA refs + member-init
  //    values (class members store {value: ssa, computedKeyId: ssa}).
  if (op.cases) {
    for (const c of op.cases) {
      if (_isSsaId(c.test_val)) fn(c.test_val);
    }
  }
  if (op.members) {
    for (const m of op.members) {
      if (_isSsaId(m.value)) fn(m.value);
      if (_isSsaId(m.computedKeyId)) fn(m.computedKeyId);
    }
  }
  if (_isSsaId(op.superclass)) fn(op.superclass);
}

/**
 * Iterate every region of an op. Calls fn(name, ops, scopeKind) for each
 * region declared in the schema. Also walks switch cases' bodies (treated
 * as a synthetic 'cases' region group) and class members' bodies.
 *
 * @param op   the op object
 * @param fn   (name, ops, scopeKind) called per region
 */
function forEachRegion(op, fn) {
  const schema = OP_SCHEMA[op.op];
  if (!schema || !schema.regions) {
    // Switch/class don't have schema.regions; they have synthetic regions.
    if (op.cases) {
      for (let i = 0; i < op.cases.length; i++) {
        const c = op.cases[i];
        if (c.test_ops) fn(`cases[${i}].test_ops`, c.test_ops, 'block');
        if (c.body) fn(`cases[${i}].body`, c.body, 'block');
      }
    }
    if (op.members) {
      for (let i = 0; i < op.members.length; i++) {
        const m = op.members[i];
        if (m.body) fn(`members[${i}].body`, m.body, 'function');
      }
    }
    return;
  }
  for (const [name, info] of Object.entries(schema.regions)) {
    const ops = op[name];
    if (ops) fn(name, ops, info.scope);
  }
  // Switch cases / class members may also coexist with declared regions
  // (e.g. some hypothetical region op with both — none currently). For
  // future-proofing, mirror the synthetic-region branch above.
  if (op.cases) {
    for (let i = 0; i < op.cases.length; i++) {
      const c = op.cases[i];
      if (c.test_ops) fn(`cases[${i}].test_ops`, c.test_ops, 'block');
      if (c.body) fn(`cases[${i}].body`, c.body, 'block');
    }
  }
  if (op.members) {
    for (let i = 0; i < op.members.length; i++) {
      const m = op.members[i];
      if (m.body) fn(`members[${i}].body`, m.body, 'function');
    }
  }
}

/**
 * True if this op type introduces a new lexical scope. Used by ScopeChain
 * (v0.3 step 7) to decide push/pop boundaries.
 */
function introducesScope(op) {
  const schema = OP_SCHEMA[op.op];
  return !!(schema && schema.introduces_scope);
}

/**
 * True if this op has observable side effects — must be kept by DCE even
 * with zero uses.
 */
function isSideEffecting(op) {
  const schema = OP_SCHEMA[op.op];
  return !!(schema && schema.side_effecting);
}

/**
 * True if this op may produce or contain an async point. Used by
 * needsAsync to decide whether the cell wrapper is sync or AsyncFunction.
 */
function canBeAsync(op) {
  const schema = OP_SCHEMA[op.op];
  return !!(schema && schema.can_be_async);
}

/**
 * Returns the list of extras keys that must be present on ops of this
 * type (i.e. extras whose schema spec doesn't end with '?').
 */
function requiredExtras(opName) {
  const schema = OP_SCHEMA[opName];
  if (!schema || !schema.extras) return [];
  return Object.entries(schema.extras)
    .filter(([, spec]) => typeof spec === 'string' && !spec.endsWith('?'))
    .map(([k]) => k);
}

/**
 * Returns the schema row for an op type, or undefined if unknown.
 */
function getSchema(opName) {
  return OP_SCHEMA[opName];
}

/**
 * Compute coverage stats for an AIR module. Walks every op (including
 * inside regions) and counts:
 *   - opCount        total ops
 *   - opaqueCount    ops emitted as 'opaque' (lowering relief valve)
 *   - dynCount       ops whose result type is 'dynamic' (no specialization)
 *   - byKind         { [opName]: count }
 *
 * Cheap (single walk, no allocations per-op beyond the counter map).
 * Stored on `module._airStats` after passes run.
 *
 * Lets future debug panels show "21/26 cells used AIR" / "this cell has
 * 5 opaque ops" as structured data instead of console-spam parsing.
 */
function computeStats(module) {
  let opCount = 0;
  let opaqueCount = 0;
  let dynCount = 0;
  const byKind = Object.create(null);

  function walk(ops) {
    for (const op of ops) {
      opCount++;
      byKind[op.op] = (byKind[op.op] || 0) + 1;
      if (op.op === 'opaque') opaqueCount++;
      if (op.type && op.type.kind === 'dynamic') dynCount++;
      forEachRegion(op, (_n, rops) => walk(rops));
    }
  }
  walk(module.ops);

  return { opCount, opaqueCount, dynCount, byKind };
}

// ── internals ─────────────────────────────────────────────────────────

// Exported so validate.js can share it — both files used to declare local
// copies, which collided at concat-build time. (See test/bundles-smoke.test.mjs.)
function _isSsaId(v) {
  return typeof v === 'string' && v.length > 0 && v[0] === '%';
}

// -- scope.js --

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

// -- lower_base.js --

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

// -- text.js --

// @gcu/air — Textual IR pretty-printer + parser (v0.3 §3.4 + §3.10)
//
// Round-trippable text format for AIR modules. Pretty for humans;
// validator messages and debug logs use it instead of JSON dumps. The
// parser (parseText) is the inverse of prettyPrint — together they
// enable golden-file IR tests, on-disk IR snapshots, and offline tooling
// that can't import the JS lowerer.
//
// Format overview:
//
//   module {
//     defines: [grid, n]
//     imports: [ui, std]
//
//     %0 = const 60
//     store n, %0
//     for_region {
//       init: [
//         %1 = const 0
//         store i, %1
//       ]
//       test: [
//         %2 = lt load(i), load(n)
//       ]
//       test_val: %2
//       update: [
//         %3 = const 1
//         %4 = add load(i), %3
//         store i, %4
//       ]
//       body: [
//         array_set load(grid), load(i), load(i)
//       ]
//     }
//   }


const INDENT = '  ';

/**
 * Pretty-print an AIR module to a string.
 */
function prettyPrint(module) {
  const out = [];
  out.push('module {');
  if (module.defines && [...module.defines].length) {
    out.push(`${INDENT}defines: [${[...module.defines].sort().join(', ')}]`);
  }
  if (module.imports && [...module.imports].length) {
    out.push(`${INDENT}imports: [${[...module.imports].sort().join(', ')}]`);
  }
  out.push('');
  for (const op of module.ops) {
    _printOp(op, INDENT, out);
  }
  out.push('}');
  return out.join('\n');
}

function _printOp(op, prefix, out) {
  const schema = OP_SCHEMA[op.op];
  const head = op.id ? `${op.id} = ` : '';

  // Region ops: print the multi-line block form
  if (schema && (schema.regions || op.cases || op.members)) {
    out.push(`${prefix}${head}${op.op}${_renderArgsInline(op, schema)} {`);
    _printRegionsAndExtras(op, schema, prefix + INDENT, out);
    out.push(`${prefix}}`);
    return;
  }

  // Single-line form: `<id> = <op> <args>`
  out.push(`${prefix}${head}${op.op}${_renderArgsInline(op, schema)}${_renderExtrasInline(op, schema)}`);
}

function _renderArgsInline(op, schema) {
  if (!schema || !op.args) return '';
  if (op.args.length === 0) return '';

  if (schema.arity === 'fixed') {
    const parts = [];
    for (let i = 0; i < op.args.length; i++) {
      parts.push(_renderArg(op.args[i], schema.args[i]));
    }
    return ' ' + parts.join(', ');
  }

  switch (schema.args) {
    case 'ssa_list':
      return ' ' + op.args.map(a => String(a)).join(', ');
    case 'pair_list':
      return ' ' + op.args.map(p => {
        if (!p) return 'null';
        if (p.spread) return `...${p.id}`;
        return `${JSON.stringify(p.key)}: ${p.id}`;
      }).join(', ');
    case 'method_call':
      // [obj, method, ...args]
      if (op.args.length < 2) return ' ' + op.args.map(_lit).join(', ');
      return ` ${op.args[0]}.${op.args[1]}(${op.args.slice(2).join(', ')})`;
    case 'ta_new_args':
      if (op.args.length < 1) return '';
      return ` <${op.args[0]}>(${op.args.slice(1).join(', ')})`;
    case 'label_optional':
      return op.args.length ? ' ' + JSON.stringify(op.args[0]) : '';
    case 'ssa_optional':
      return op.args.length ? ' ' + op.args[0] : '';
    default:
      return ' ' + op.args.map(_lit).join(', ');
  }
}

function _renderArg(v, kind) {
  if (kind === 'ssa') return String(v);
  if (kind === 'name' || kind === 'key' || kind === 'label' ||
      kind === 'meta_name' || kind === 'meta_prop' ||
      kind === 'func_name' || kind === 'class_name' || kind === 'source')
    return JSON.stringify(v);
  if (kind === 'literal') return _lit(v);
  return _lit(v);
}

function _lit(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'bigint') return `${v}n`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof RegExp) return v.toString();
  try { return JSON.stringify(v); } catch { return String(v); }
}

function _renderExtrasInline(op, schema) {
  if (!schema || !schema.extras) return '';
  const parts = [];
  for (const [key, spec] of Object.entries(schema.extras)) {
    const val = op[key];
    if (val === undefined || val === null) continue;
    // Skip 'phi_list?', 'param_list', 'member_list', 'case_list' — these
    // are heavy and printed inside region blocks; if we're here, the op
    // has none of those (no region map), so they shouldn't be present.
    if (spec === 'phi_list?' || spec === 'param_list' || spec === 'member_list' ||
        spec === 'case_list') continue;
    parts.push(`${key}=${_renderExtraValue(val, spec)}`);
  }
  return parts.length ? `  // ${parts.join(', ')}` : '';
}

function _renderExtraValue(val, spec) {
  if (spec === 'ssa' || spec === 'ssa?') return String(val);
  if (spec === 'string' || spec === 'string?') return JSON.stringify(val);
  if (spec === 'bool' || spec === 'bool?') return String(val);
  if (spec === 'type' || spec === 'type?') {
    return val && val.kind ? val.kind : '?';
  }
  return _lit(val);
}

function _printRegionsAndExtras(op, schema, prefix, out) {
  // Print extras first (inline scalars), then regions.
  if (schema && schema.extras) {
    for (const [key, spec] of Object.entries(schema.extras)) {
      const val = op[key];
      if (val === undefined || val === null) continue;
      if (spec === 'phi_list?' || spec === 'phi_list') {
        if (Array.isArray(val) && val.length) {
          out.push(`${prefix}${key}: [`);
          for (const phi of val) {
            const cnt = phi.var
              ? `${phi.var}: then=${phi.then_val ?? '_'} else=${phi.else_val ?? '_'}`
              : JSON.stringify(phi);
            out.push(`${prefix}${INDENT}${cnt}`);
          }
          out.push(`${prefix}]`);
        }
        continue;
      }
      if (spec === 'param_list') {
        out.push(`${prefix}${key}: ${_renderParamList(val)}`);
        continue;
      }
      if (spec === 'member_list') {
        // members printed via forEachRegion's synthetic regions; skip here.
        continue;
      }
      if (spec === 'case_list') {
        // cases printed via forEachRegion below
        continue;
      }
      // Scalar extra
      out.push(`${prefix}${key}: ${_renderExtraValue(val, spec)}`);
    }
  }

  // Regions
  forEachRegion(op, (rname, rops) => {
    if (rops.length === 0) {
      out.push(`${prefix}${rname}: []`);
      return;
    }
    out.push(`${prefix}${rname}: [`);
    for (const child of rops) {
      _printOp(child, prefix + INDENT, out);
    }
    out.push(`${prefix}]`);
  });
}

function _renderParamList(params) {
  if (!Array.isArray(params)) return '?';
  const parts = params.map(p => {
    if (typeof p === 'string') return p;
    if (p && p.name) {
      let s = p.name;
      if (p.type && p.type.kind && p.type.kind !== 'dynamic') s += `: ${p.type.kind}`;
      if (p.default !== undefined) s += ' = …';
      return s;
    }
    return _lit(p);
  });
  return `(${parts.join(', ')})`;
}

// =============================================================================
// Parser — textual IR → AIR module
// =============================================================================
//
// Recursive descent over a small token stream. Handles every shape that
// prettyPrint emits for the in-tree op set: header lines, fixed-arity ssa
// args, ssa_list, pair_list (object_new), method_call (call_method),
// ta_new_args (ta_new), label/ssa optional args, and the region ops
// (if_region, for_region, for_of_region, for_in_region, loop_region,
// switch_region, try_region, labeled, func_region, class_region).
//
// Out of scope for this iteration:
//   - func_region / class_region: prettyPrint emits human-readable shorthand
//     for params (`params: (x)`) and types (`ret_type: dynamic`) that drops
//     structural detail (param type annotations, default-value markers). A
//     strict round-trip would need either a richer text form or accepting
//     the lossy shorthand and reconstructing best-effort. Deferred.
//   - switch_region member bodies and class member bodies use synthetic
//     region names (`cases[0].body`, `members[0].body`) that prettyPrint
//     renders inline; the parser currently doesn't recognize the indexed
//     name form.
// parseText raises AirParseError on these. prettyPrint still renders them
// (validator messages stay informative); round-trip is best-effort for
// modules that contain only the simpler op shapes — sufficient for
// golden-file testing of the common cases.

class AirParseError extends Error {
  constructor(message, line, col) {
    super(`${message} at line ${line}:${col}`);
    this.name = 'AirParseError';
    this.line = line;
    this.col = col;
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────

function tokenize(src) {
  const tokens = [];
  let line = 1, col = 1, i = 0;

  const advance = (n) => {
    for (let k = 0; k < n; k++) {
      if (src[i + k] === '\n') { line++; col = 1; } else { col++; }
    }
    i += n;
  };

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance(1);
      continue;
    }

    // Single-line comment (used for `// extras=…` annotations on inline ops)
    if (ch === '/' && src[i + 1] === '/') {
      // Stash as a token so the parser can pick up extras attached to an op
      const start = i;
      const startLine = line, startCol = col;
      while (i < src.length && src[i] !== '\n') { i++; col++; }
      tokens.push({ type: 'comment', value: src.slice(start + 2, i).trim(), line: startLine, col: startCol });
      continue;
    }

    // Spread `...` must come before single-`.` punct since punct is greedy.
    if (ch === '.' && src[i + 1] === '.' && src[i + 2] === '.') {
      tokens.push({ type: 'spread', line, col });
      advance(3);
      continue;
    }

    // Punctuation. `.` and `<>` are punct so call_method's `%obj.method(args)`
    // and ta_new's `<kind>(args)` round-trip. Numbers consume their own
    // decimal point inside the number branch below before reaching here.
    if ('{}[](),:=.<>'.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, line, col });
      advance(1);
      continue;
    }

    // String literal
    if (ch === '"') {
      const startLine = line, startCol = col;
      let val = '';
      i++; col++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) {
          const e = src[i + 1];
          if (e === 'n') val += '\n';
          else if (e === 't') val += '\t';
          else if (e === 'r') val += '\r';
          else if (e === '\\') val += '\\';
          else if (e === '"') val += '"';
          else if (e === '\'') val += '\'';
          else val += e;
          i += 2; col += 2;
        } else {
          if (src[i] === '\n') { line++; col = 1; } else col++;
          val += src[i++];
        }
      }
      if (src[i] !== '"') throw new AirParseError('unterminated string', startLine, startCol);
      i++; col++;
      tokens.push({ type: 'string', value: val, line: startLine, col: startCol });
      continue;
    }

    // SSA id: %N or %name
    if (ch === '%') {
      const startLine = line, startCol = col;
      let val = '%';
      advance(1);
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) {
        val += src[i++]; col++;
      }
      tokens.push({ type: 'ssa', value: val, line: startLine, col: startCol });
      continue;
    }

    // Number / bigint
    if ((ch >= '0' && ch <= '9') || (ch === '-' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const startLine = line, startCol = col;
      let val = '';
      if (ch === '-') { val += '-'; advance(1); }
      while (i < src.length && /[0-9.eE+\-]/.test(src[i])) { val += src[i++]; col++; }
      if (src[i] === 'n') {
        // BigInt literal
        i++; col++;
        tokens.push({ type: 'bigint', value: BigInt(val), line: startLine, col: startCol });
      } else {
        tokens.push({ type: 'number', value: Number(val), line: startLine, col: startCol });
      }
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      const startLine = line, startCol = col;
      let val = '';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { val += src[i++]; col++; }
      // Special literals
      if (val === 'true' || val === 'false') {
        tokens.push({ type: 'bool', value: val === 'true', line: startLine, col: startCol });
      } else if (val === 'null') {
        tokens.push({ type: 'null', line: startLine, col: startCol });
      } else if (val === 'undefined') {
        tokens.push({ type: 'undefined', line: startLine, col: startCol });
      } else {
        tokens.push({ type: 'ident', value: val, line: startLine, col: startCol });
      }
      continue;
    }

    throw new AirParseError(`unexpected character '${ch}'`, line, col);
  }

  tokens.push({ type: 'eof', line, col });
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────

class Parser {
  constructor(tokens) {
    this.toks = tokens;
    this.pos = 0;
  }
  peek(offset = 0) { return this.toks[this.pos + offset]; }
  next() { return this.toks[this.pos++]; }
  check(type, value) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  eat(type, value) {
    if (!this.check(type, value)) {
      const t = this.peek();
      throw new AirParseError(
        `expected ${type}${value !== undefined ? ` '${value}'` : ''}, got ${t.type}${t.value !== undefined ? ` '${t.value}'` : ''}`,
        t.line, t.col
      );
    }
    return this.next();
  }
  // Consume any number of trailing comment tokens (extras live in comments)
  skipComments() {
    while (this.check('comment')) this.next();
  }
  parseValue() {
    const t = this.peek();
    if (t.type === 'string') return this.next().value;
    if (t.type === 'number') return this.next().value;
    if (t.type === 'bigint') return this.next().value;
    if (t.type === 'bool') return this.next().value;
    if (t.type === 'null') { this.next(); return null; }
    if (t.type === 'undefined') { this.next(); return undefined; }
    if (t.type === 'ident') return this.next().value;
    if (t.type === 'ssa') return this.next().value;
    throw new AirParseError(`expected value, got ${t.type}`, t.line, t.col);
  }
}

function parseText(src) {
  const tokens = tokenize(src);
  const p = new Parser(tokens);

  p.eat('ident', 'module');
  p.eat('punct', '{');

  const module = {
    ops: [],
    defines: new Set(),
    imports: new Set(),
  };

  // Optional header lines
  while (true) {
    p.skipComments();
    if (p.check('ident', 'defines')) {
      p.next(); p.eat('punct', ':'); p.eat('punct', '[');
      while (!p.check('punct', ']')) {
        const name = p.eat('ident').value;
        module.defines.add(name);
        if (p.check('punct', ',')) p.next();
      }
      p.eat('punct', ']');
    } else if (p.check('ident', 'imports')) {
      p.next(); p.eat('punct', ':'); p.eat('punct', '[');
      while (!p.check('punct', ']')) {
        const name = p.eat('ident').value;
        module.imports.add(name);
        if (p.check('punct', ',')) p.next();
      }
      p.eat('punct', ']');
    } else {
      break;
    }
  }

  // Top-level ops
  while (!p.check('punct', '}')) {
    p.skipComments();
    if (p.check('punct', '}')) break;
    const op = parseOp(p);
    if (op) module.ops.push(op);
  }
  p.eat('punct', '}');

  return module;
}

function parseOp(p) {
  // Optional ssa-id assignment
  let id = null;
  if (p.check('ssa') && p.peek(1)?.type === 'punct' && p.peek(1).value === '=') {
    id = p.next().value;
    p.eat('punct', '=');
  }

  const name = p.eat('ident').value;
  const schema = OP_SCHEMA[name];
  if (!schema) {
    throw new AirParseError(`unknown op '${name}'`, p.peek().line, p.peek().col);
  }

  const op = { op: name, args: [], id };
  // Region ops use `name { ... }` shape with regions/extras inside the braces
  const isRegionOp = !!(schema.regions || schema.extras?.cases || schema.extras?.members);

  if (isRegionOp) {
    parseRegionArgsInline(p, op, schema);
    p.eat('punct', '{');
    parseRegionBody(p, op, schema);
    p.eat('punct', '}');
  } else {
    parseInlineArgs(p, op, schema);
    p.skipComments();  // extras printed as `// key=value`
  }

  // Apply schema-default extras
  if (schema.extras) {
    for (const [k, spec] of Object.entries(schema.extras)) {
      if (op[k] === undefined && spec === 'phi_list?') op[k] = [];
    }
  }

  return op;
}

function parseInlineArgs(p, op, schema) {
  if (schema.arity === 'fixed') {
    const expected = schema.args.length;
    if (expected === 0) return;
    for (let i = 0; i < expected; i++) {
      const kind = schema.args[i];
      op.args.push(parseTypedArg(p, kind));
      if (i < expected - 1) p.eat('punct', ',');
    }
    return;
  }

  switch (schema.args) {
    case 'ssa_list':
      // Bare ssa followed by `=` is the NEXT op's assignment header, not
      // an arg of this one. Without this peek, `%0 = array_new` would
      // greedy-consume `%1` from the following line.
      while (p.check('ssa')) {
        const next = p.peek(1);
        if (next && next.type === 'punct' && next.value === '=') break;
        op.args.push(p.next().value);
        if (p.check('punct', ',')) p.next();
        else break;
      }
      break;
    case 'pair_list':
      // `"key": %ssa, ...%spread`
      while (p.check('string') || p.check('spread')) {
        if (p.check('spread')) {
          p.next();
          const id = p.eat('ssa').value;
          op.args.push({ spread: true, id });
        } else {
          const key = p.next().value;
          p.eat('punct', ':');
          const id = p.eat('ssa').value;
          op.args.push({ key, id });
        }
        if (p.check('punct', ',')) p.next();
        else break;
      }
      break;
    case 'method_call':
      // Pretty form: `%obj.method(%a, %b)`. Comma form also accepted.
      op.args.push(p.eat('ssa').value);
      if (p.check('punct', '.')) {
        p.next();
        // Method name: ident or string
        if (p.check('string')) op.args.push(p.next().value);
        else op.args.push(p.eat('ident').value);
        p.eat('punct', '(');
        while (!p.check('punct', ')')) {
          op.args.push(p.eat('ssa').value);
          if (p.check('punct', ',')) p.next();
        }
        p.eat('punct', ')');
      } else if (p.check('punct', ',')) {
        // Comma form: %obj, "method", %a, %b
        p.next();
        op.args.push(p.eat('string').value);
        while (p.check('punct', ',')) {
          p.next();
          op.args.push(p.eat('ssa').value);
        }
      }
      break;
    case 'ta_new_args':
      // Pretty form: `<kind>(%1, %2)`. Comma form: `"kind", %1, %2`.
      if (p.check('punct', '<')) {
        p.next();
        // kind is an ident (like f64, i32) inside angles
        const kind = p.check('string') ? p.next().value : p.eat('ident').value;
        op.args.push(kind);
        p.eat('punct', '>');
        p.eat('punct', '(');
        while (!p.check('punct', ')')) {
          op.args.push(p.eat('ssa').value);
          if (p.check('punct', ',')) p.next();
        }
        p.eat('punct', ')');
      } else {
        op.args.push(parseTypedArg(p, 'kind'));
        while (p.check('punct', ',')) {
          p.next();
          if (p.check('ssa')) op.args.push(p.next().value);
        }
      }
      break;
    case 'label_optional':
      if (p.check('string')) op.args.push(p.next().value);
      break;
    case 'ssa_optional':
      if (p.check('ssa')) op.args.push(p.next().value);
      break;
  }
}

function parseTypedArg(p, kind) {
  if (kind === 'ssa') return p.eat('ssa').value;
  if (kind === 'name' || kind === 'key' || kind === 'label' ||
      kind === 'meta_name' || kind === 'meta_prop' ||
      kind === 'func_name' || kind === 'class_name' || kind === 'source' ||
      kind === 'kind') {
    return p.eat('string').value;
  }
  if (kind === 'literal') return p.parseValue();
  return p.parseValue();
}

function parseRegionArgsInline(p, op, schema) {
  // Some region ops have leading inline args (e.g. if_region's condition,
  // for_of_region's iterable, labeled's name). Parse them like fixed args
  // before the brace.
  if (schema.arity === 'fixed' && schema.args.length > 0) {
    for (let i = 0; i < schema.args.length; i++) {
      op.args.push(parseTypedArg(p, schema.args[i]));
      if (i < schema.args.length - 1) p.eat('punct', ',');
    }
  }
}

function parseRegionBody(p, op, schema) {
  // Inside the braces: extras (key: value) and regions (name: [ops])
  while (!p.check('punct', '}')) {
    p.skipComments();
    if (p.check('punct', '}')) break;

    // Lookahead: ident ':'
    if (!p.check('ident')) {
      throw new AirParseError(`expected key in region body`, p.peek().line, p.peek().col);
    }
    const keyTok = p.next();
    p.eat('punct', ':');

    // Region (`key: [ ... ]`) or scalar extra (`key: <value>`)
    if (p.check('punct', '[')) {
      p.next();
      const ops = [];
      while (!p.check('punct', ']')) {
        p.skipComments();
        if (p.check('punct', ']')) break;
        ops.push(parseOp(p));
      }
      p.eat('punct', ']');
      op[keyTok.value] = ops;
    } else {
      // Scalar extra
      op[keyTok.value] = p.parseValue();
    }
  }
}

// -- validate.js --

// @gcu/air — IR validator (v0.3 §3.2)
//
// Schema-driven shape check. Walks every op in a module and verifies it
// matches its OP_SCHEMA row: known op type, correct arity, required extras
// present, no dangling SSA refs (ids referenced must point to ops that
// exist within the same scope chain).
//
// Off by default in production for performance; opt in via runPasses({
// validate: true }) — wired for the test harness, dev-mode browser
// (?airdebug=1), and one-off debugging.
//
// Bug classes the validator catches at IR-build time, before reaching the
// emitter (see v0.3 §3.2):
//   - lowerForOf forgetting target_name           → arity check fails
//   - lowerUnary emitting `add` with one arg      → arity check fails
//   - missing required extras (e.g. cases for switch_region)
//   - dangling SSA refs (consumer ahead of producer)
//   - unknown op types


class AirValidationError extends Error {
  constructor(errors, ir) {
    const head = errors.slice(0, 5).map(e => '  ' + e).join('\n');
    const more = errors.length > 5 ? `\n  … and ${errors.length - 5} more` : '';
    const irBlock = ir ? `\n\nIR:\n${ir}` : '';
    super(`AIR validation failed (${errors.length} error${errors.length === 1 ? '' : 's'}):\n${head}${more}${irBlock}`);
    this.errors = errors;
    this.ir = ir;
    this.name = 'AirValidationError';
  }
}

/**
 * Validate an AIR module against the schema.
 * Returns array of error strings; empty array means valid.
 *
 * Does NOT throw — caller decides. (validateOrThrow does.)
 *
 * Reference-resolution model: flat-set, not strict scope-aware. Cross-region
 * "result" extras (if_region.then_val pointing into then_body, for_region.
 * test_val pointing into test, phi entries pointing into branch bodies) are
 * legitimate uses but live across scope boundaries. A strict scope-aware
 * walker would reject them as false positives. Flat-set still catches the
 * real bug class — typos, ordering errors, malformed lowering output —
 * without the scope-tracking complexity. Strict scoping is a future
 * enhancement (v0.3 step 7's ScopeChain makes it cheap once landed).
 */
function validateModule(module) {
  const errors = [];

  // Pass 1: collect every SSA id produced anywhere in the module.
  const allIds = new Set();
  const collect = (ops) => {
    for (const op of ops) {
      if (op.id) allIds.add(op.id);
      forEachRegion(op, (_n, rops) => collect(rops));
    }
  };
  collect(module.ops);

  // Pass 2: walk + validate each op against the schema.
  const validate = (ops, path) => {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const opPath = `${path}[${i}]:${op.op}`;
      const schema = OP_SCHEMA[op.op];

      if (!schema) {
        errors.push(`${opPath}: unknown op '${op.op}'`);
        forEachRegion(op, (rname, rops) => validate(rops, `${opPath}.${rname}`));
        continue;
      }

      _checkArity(op, schema, opPath, errors);

      const required = requiredExtras(op.op);
      for (const k of required) {
        if (op[k] === undefined || op[k] === null) {
          errors.push(`${opPath}: missing required extra '${k}'`);
        }
      }

      forEachSsaRef(op, (id) => {
        if (!allIds.has(id)) {
          errors.push(`${opPath}: dangling ref ${id}`);
        }
      });

      forEachRegion(op, (rname, rops) => validate(rops, `${opPath}.${rname}`));
    }
  };

  validate(module.ops, 'root');
  return errors;
}

/**
 * Validate and throw AirValidationError on failure.
 * Used by runPasses when opts.validate === true and by tests.
 */
function validateOrThrow(module, irRenderer) {
  const errors = validateModule(module);
  if (errors.length === 0) return;
  let ir;
  if (typeof irRenderer === 'function') {
    try { ir = irRenderer(module); } catch { /* renderer optional */ }
  }
  throw new AirValidationError(errors, ir);
}

// ── Arity helpers ───────────────────────────────────────────────────

function _checkArity(op, schema, opPath, errors) {
  const args = op.args;
  if (!Array.isArray(args)) {
    errors.push(`${opPath}: args is not an array`);
    return;
  }

  if (schema.arity === 'fixed') {
    const expected = schema.args.length;
    if (args.length !== expected) {
      errors.push(`${opPath}: expected ${expected} args, got ${args.length}`);
    }
    // Soft-check positions: for SSA-typed slots, ensure the value looks
    // like an SSA id ('%N'). For LITERAL/STRING/NAME slots we don't try
    // to validate content semantically — just that they're present.
    for (let i = 0; i < Math.min(args.length, expected); i++) {
      const expectedKind = schema.args[i];
      const v = args[i];
      if (expectedKind === 'ssa') {
        if (!_isSsaId(v)) {
          errors.push(`${opPath}: arg[${i}] expected ssa, got ${_describe(v)}`);
        }
      }
    }
    return;
  }

  // Variadic shapes
  switch (schema.args) {
    case 'ssa_list':
      for (let i = 0; i < args.length; i++) {
        if (!_isSsaId(args[i])) {
          errors.push(`${opPath}: arg[${i}] expected ssa, got ${_describe(args[i])}`);
        }
      }
      break;
    case 'pair_list':
      for (let i = 0; i < args.length; i++) {
        const p = args[i];
        if (!p || typeof p !== 'object') {
          errors.push(`${opPath}: arg[${i}] expected pair record, got ${_describe(p)}`);
          continue;
        }
        if (!('key' in p) && !('spread' in p)) {
          errors.push(`${opPath}: arg[${i}] missing 'key' or 'spread'`);
        }
        if (!_isSsaId(p.id)) {
          errors.push(`${opPath}: arg[${i}].id expected ssa, got ${_describe(p.id)}`);
        }
      }
      break;
    case 'method_call':
      // [obj_ssa, method_key (string), ...arg_ssa]
      if (args.length < 2) {
        errors.push(`${opPath}: expected at least [obj, method], got ${args.length} args`);
      } else {
        if (!_isSsaId(args[0])) {
          errors.push(`${opPath}: arg[0] expected obj ssa, got ${_describe(args[0])}`);
        }
        if (typeof args[1] !== 'string') {
          errors.push(`${opPath}: arg[1] expected method name string, got ${_describe(args[1])}`);
        }
        for (let i = 2; i < args.length; i++) {
          if (!_isSsaId(args[i])) {
            errors.push(`${opPath}: arg[${i}] expected ssa, got ${_describe(args[i])}`);
          }
        }
      }
      break;
    case 'ta_new_args':
      // [kind_string, ...ssa]
      if (args.length < 1) {
        errors.push(`${opPath}: ta_new requires at least element kind`);
      } else {
        if (typeof args[0] !== 'string') {
          errors.push(`${opPath}: arg[0] expected element-kind string, got ${_describe(args[0])}`);
        }
        for (let i = 1; i < args.length; i++) {
          if (!_isSsaId(args[i])) {
            errors.push(`${opPath}: arg[${i}] expected ssa, got ${_describe(args[i])}`);
          }
        }
      }
      break;
    case 'label_optional':
      if (args.length > 1) {
        errors.push(`${opPath}: label_optional accepts 0 or 1 args, got ${args.length}`);
      }
      break;
    case 'ssa_optional':
      if (args.length > 1) {
        errors.push(`${opPath}: ssa_optional accepts 0 or 1 args, got ${args.length}`);
      }
      if (args.length === 1 && !_isSsaId(args[0])) {
        errors.push(`${opPath}: arg[0] expected ssa, got ${_describe(args[0])}`);
      }
      break;
    default:
      errors.push(`${opPath}: schema declares unknown variadic shape '${schema.args}'`);
  }
}

function _describe(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return `string ${JSON.stringify(v.slice(0, 30))}`;
  if (t === 'number' || t === 'boolean') return `${t} ${v}`;
  return t;
}

// -- lower_js.js --

// @gcu/air — JS/TS lowerer: ESTree → AIR
// Spec §7: Lowering ESTree → AIR


// SSA id allocation + the op record builder live on BaseLowerCtx now
// (`ctx._idGen.next()` for ids; `ctx.emit(op, args, type, loc, extra)`
// for everything else). The legacy module-level `_nextId` / `mkOp`
// were dropped during the lowerer-frontend extraction so all three
// in-tree lowerers share one source of truth.

// --- Mutable capture pre-pass (spec §3.3, §7.3) ---

function findMutableCaptured(ast) {
  const captured = new Set();
  // Scope stack uses ScopeChain (v0.3 §3.3): names declared in this scope
  // hold value `true`. We track two chains:
  //   chain        — current lexical scope (pushed for fns AND blocks)
  //   outerFnChain — chain at the boundary of the current function. A
  //                  reassignment is a capture iff the target name is
  //                  declared *in or above* this chain (i.e. outside the
  //                  innermost enclosing function). At module top, this
  //                  chain is null.
  // Without the outerFnChain split, a `s += ...` inside a `for` block of
  // a function looked like a capture (the `for`-block's parent is the
  // function body), and AIR allocated a slot for the local — costing
  // an order of magnitude on hot numeric loops.
  let chain = new ScopeChain();
  let outerFnChain = null;

  function declare(name) { chain.set(name, true); }

  function collectDeclarations(node) {
    if (!node) return;
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        collectPatternNames(decl.id, declare);
      }
    } else if (node.type === 'FunctionDeclaration' && node.id) {
      declare(node.id.name);
    }
  }

  function collectPatternNames(pattern, addFn) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      addFn(pattern.name);
    } else if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties) {
        if (prop.type === 'RestElement') collectPatternNames(prop.argument, addFn);
        else collectPatternNames(prop.value, addFn);
      }
    } else if (pattern.type === 'ArrayPattern') {
      for (const el of pattern.elements) {
        if (!el) continue;
        if (el.type === 'RestElement') collectPatternNames(el.argument, addFn);
        else collectPatternNames(el, addFn);
      }
    } else if (pattern.type === 'AssignmentPattern') {
      collectPatternNames(pattern.left, addFn);
    }
  }

  function walk(node, inFunction) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const n of node) walk(n, inFunction);
      return;
    }

    if (typeof node !== 'object' || !node.type) return;

    // Function boundaries push a new scope
    const isFn = node.type === 'FunctionDeclaration' ||
                 node.type === 'FunctionExpression' ||
                 node.type === 'ArrowFunctionExpression';

    if (isFn) {
      // Snapshot the current chain as the "outer-of-this-function" chain.
      // Capture detection inside this function checks against this snapshot
      // (not the current evolving `chain`), so reassignments to function-
      // local lets — even those declared in an outer block of the same
      // function — don't get flagged as captures.
      const savedOuterFn = outerFnChain;
      outerFnChain = chain;
      chain = chain.push();
      // Params live in the function's outer scope. The body's BlockStatement
      // gets its own scope below (via the isBlock branch), which collects
      // body declarations there. We don't double-collect into the function
      // scope — that would put body lets in BOTH scopes and cause any
      // reassignment inside the function to look like a capture from outside.
      if (node.params) {
        for (const p of node.params) collectPatternNames(p, declare);
      }
      walk(node.body, true);
      chain = chain.pop();
      outerFnChain = savedOuterFn;
      return;
    }

    // Block-introducing forms get their own scope so block-scoped lets and
    // for-init declarations don't leak to the enclosing function / cell as
    // "outer-declared". Without this, `for (let i …)` made `i` visible to
    // inner closures, falsely marking it captured and forcing a slot.
    const isBlock = node.type === 'BlockStatement' ||
                    node.type === 'ForStatement' ||
                    node.type === 'ForInStatement' ||
                    node.type === 'ForOfStatement';
    if (isBlock) {
      chain = chain.push();
      if (node.type === 'BlockStatement') {
        for (const stmt of node.body) collectDeclarations(stmt);
      } else {
        if (node.init && node.init.type === 'VariableDeclaration') collectDeclarations(node.init);
        if (node.left && node.left.type === 'VariableDeclaration') collectDeclarations(node.left);
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' ||
            key === 'typeAnnotation' || key === 'returnType') continue;
        const child = node[key];
        if (child && typeof child === 'object') walk(child, inFunction);
      }
      chain = chain.pop();
      return;
    }

    // Check assignments to variables declared OUTSIDE the current function.
    // A reassignment is a capture iff the target name is in scope from a
    // chain frame at or above the function boundary — not just any outer
    // block within the same function.
    if (inFunction && outerFnChain) {
      if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier') {
        if (outerFnChain.has(node.left.name)) captured.add(node.left.name);
      }
      if (node.type === 'UpdateExpression' && node.argument?.type === 'Identifier') {
        if (outerFnChain.has(node.argument.name)) captured.add(node.argument.name);
      }
    }

    // Recurse into children
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' ||
          key === 'typeAnnotation' || key === 'returnType') continue;
      const child = node[key];
      if (child && typeof child === 'object') walk(child, inFunction);
    }
  }

  // Top-level scope: collect all declarations
  if (ast.type === 'Program') {
    for (const stmt of ast.body) collectDeclarations(stmt);
    walk(ast, false);
  }

  return captured;
}

// --- var hoisting pre-pass (spec §7.2) ---

function findVarDeclarations(body) {
  const vars = new Set();
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (typeof node !== 'object' || !node.type) return;
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      for (const decl of node.declarations) {
        collectPatternNamesSimple(decl.id, vars);
      }
    }
    // Don't descend into functions (var is function-scoped)
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression') return;
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (child && typeof child === 'object') walk(child);
    }
  }
  walk(body);
  return vars;
}

function collectPatternNamesSimple(pattern, set) {
  if (!pattern) return;
  if (pattern.type === 'Identifier') set.add(pattern.name);
  else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) {
      if (prop.type === 'RestElement') collectPatternNamesSimple(prop.argument, set);
      else collectPatternNamesSimple(prop.value, set);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const el of pattern.elements) {
      if (!el) continue;
      if (el.type === 'RestElement') collectPatternNamesSimple(el.argument, set);
      else collectPatternNamesSimple(el, set);
    }
  } else if (pattern.type === 'AssignmentPattern') {
    collectPatternNamesSimple(pattern.left, set);
  }
}

// --- Known typed array constructors ---

const TYPED_ARRAY_CTORS = new Set([
  'Int8Array', 'Uint8Array', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array',
]);

const CTOR_TO_ELEMENT = {
  Int8Array: 'i8', Uint8Array: 'u8', Int16Array: 'i16', Uint16Array: 'u16',
  Int32Array: 'i32', Uint32Array: 'u32', Float32Array: 'f32', Float64Array: 'f64',
  BigInt64Array: 'i64', BigUint64Array: 'u64',
};

// --- Lowering context ---
//
// JS-specific extras over BaseLowerCtx:
//   mutableCaptured — names mutated inside an inner function but declared
//     in an outer scope (closures need slot allocation, not bare lets).
//   slots           — name → SSA id of the slot (closure cell) for each
//     name in mutableCaptured.
// loc() picks line/col from ESTree's `node.loc.start` (other lowerers'
// AST shapes differ).

class LowerCtx extends BaseLowerCtx {
  constructor(mutableCaptured) {
    super();
    this.mutableCaptured = mutableCaptured;
    this.slots = new Map();
  }

  loc(node) {
    return node?.loc?.start ? { line: node.loc.start.line, col: node.loc.start.column } : null;
  }
}

// --- Main lowering entry point ---

function lowerJS(ast, source) {
  // SSA id counter lives on the LowerCtx instance now (via BaseLowerCtx's
  // `_idGen`); no module-level reset needed.

  const mutableCaptured = findMutableCaptured(ast);
  const ctx = new LowerCtx(mutableCaptured);
  ctx.source = source || null;

  if (ast.type !== 'Program') throw new Error('Expected Program node');

  // var hoisting: allocate all var declarations as undefined at top
  const hoistedVars = findVarDeclarations(ast.body);
  for (const name of hoistedVars) {
    const undef = ctx.emit('const', [undefined], VOID, null);
    ctx.emit('store', [name, undef.id], VOID, null);
    ctx.symbols.set(name, undef.id);
  }

  // Allocate slots for mutable captured variables
  for (const name of mutableCaptured) {
    const slot = ctx.emit('slot_alloc', [name], DYNAMIC, null);
    ctx.slots.set(name, slot.id);
  }

  // Lower each statement
  for (const stmt of ast.body) {
    lowerStatement(ctx, stmt);
  }

  // Build cell module
  const exports = new Map();
  for (const name of ctx.defines) {
    const ssaId = ctx.symbols.get(name);
    const type = ssaId ? (ctx.types.get(ssaId) || DYNAMIC) : DYNAMIC;
    exports.set(name, { ssa_name: ssaId || null, type });
  }

  return {
    ops: ctx.ops,
    // Snapshot every visible binding (inner-wins) for downstream consumers
    // that want a flat lookup of names → ssa ids.
    symbol_table: ctx.symbols.flatten(),
    exports,
    imports: new Set(ctx.imports),
    defines: new Set(ctx.defines),
    side_effects: ctx.ops.some(o => o.op === 'opaque' || o.op === 'call' || o.op === 'call_method'),
  };
}

// --- Statement lowering ---

function lowerStatement(ctx, node) {
  if (!node) return;
  const l = ctx.loc(node);

  switch (node.type) {
    case 'VariableDeclaration':
      return lowerVarDecl(ctx, node);

    case 'FunctionDeclaration':
      return lowerFuncDecl(ctx, node);

    case 'ExpressionStatement':
      return lowerExpr(ctx, node.expression);

    case 'IfStatement':
      return lowerIf(ctx, node);

    case 'ForStatement':
      return lowerFor(ctx, node);

    case 'ForInStatement':
      return lowerForIn(ctx, node);

    case 'ForOfStatement':
      return lowerForOf(ctx, node);

    case 'WhileStatement':
      return lowerWhile(ctx, node);

    case 'DoWhileStatement':
      return lowerDoWhile(ctx, node);

    case 'ReturnStatement':
      return lowerReturn(ctx, node);

    case 'BreakStatement':
      ctx.emit('break', [], VOID, l);
      return null;

    case 'ContinueStatement':
      ctx.emit('continue', [], VOID, l);
      return null;

    case 'BlockStatement': {
      // Block scope — lexical declarations inside are not cell-level exports.
      // Wrappers like lowerIf/lowerFor/etc. don't need to set this themselves;
      // their bodies are always either a BlockStatement (handled here) or a
      // single statement (which can't host let/const/class declarations).
      // Push a fresh ctx.symbols frame so block-scoped lets don't leak.
      // Function bodies don't enter this case — they bypass it by iterating
      // node.body.body directly in lowerFuncDecl/Expr (which push their own
      // frame).
      const savedTopLevel = ctx.topLevel;
      ctx.topLevel = false;
      ctx.symbols = ctx.symbols.push();
      for (const s of node.body) lowerStatement(ctx, s);
      ctx.symbols = ctx.symbols.pop();
      ctx.topLevel = savedTopLevel;
      return null;
    }

    case 'EmptyStatement':
      return null;

    case 'ThrowStatement': {
      const arg = lowerExpr(ctx, node.argument);
      ctx.emit('throw', [arg.id], VOID, l);
      return null;
    }

    case 'SwitchStatement':
      return lowerSwitch(ctx, node);

    case 'TryStatement':
      return lowerTry(ctx, node);

    case 'LabeledStatement':
      return lowerLabeled(ctx, node);

    case 'ClassDeclaration':
      return lowerClassDecl(ctx, node);

    case 'DebuggerStatement':
      ctx.emit('debugger', [], VOID, l);
      return null;

    // Opaque fallback for truly unsupported statements
    default:
      return lowerOpaque(ctx, node);
  }
}

// --- Variable declaration ---

function lowerVarDecl(ctx, node) {
  const isTopLevel = ctx.topLevel;

  for (const decl of node.declarations) {
    if (decl.id.type === 'Identifier') {
      // Simple: const x = expr or const x: type = expr
      const name = decl.id.name;
      const annotation = resolveAnnotation(decl.id.typeAnnotation);
      const init = decl.init ? lowerExpr(ctx, decl.init) : ctx.emit('const', [undefined], VOID, ctx.loc(decl));
      const type = isDynamic(annotation) ? (ctx.types.get(init.id) || DYNAMIC) : annotation;

      // Propagate annotation type to the init op so the emitter can hint correctly
      if (!isDynamic(annotation)) init.type = annotation;

      if (ctx.mutableCaptured.has(name)) {
        const slot = ctx.slots.get(name);
        ctx.emit('slot_store', [slot, init.id], VOID, ctx.loc(decl));
      } else {
        ctx.emit('store', [name, init.id], VOID, ctx.loc(decl));
        ctx.symbols.set(name, init.id);
        ctx.types.set(init.id, type);
      }

      if (isTopLevel) ctx.defines.add(name);
    } else {
      // Destructuring pattern
      const init = decl.init ? lowerExpr(ctx, decl.init) : ctx.emit('const', [undefined], VOID, ctx.loc(decl));
      lowerPattern(ctx, decl.id, init, isTopLevel);
    }
  }
}

// --- Destructuring patterns (spec §7.1) ---

function lowerPattern(ctx, pattern, sourceOp, isTopLevel) {
  if (!pattern) return;
  const l = ctx.loc(pattern);

  if (pattern.type === 'Identifier') {
    const name = pattern.name;
    const annotation = resolveAnnotation(pattern.typeAnnotation);
    const type = isDynamic(annotation) ? (ctx.types.get(sourceOp.id) || DYNAMIC) : annotation;

    if (ctx.mutableCaptured.has(name)) {
      const slot = ctx.slots.get(name);
      ctx.emit('slot_store', [slot, sourceOp.id], VOID, l);
    } else {
      ctx.emit('store', [name, sourceOp.id], VOID, l);
      ctx.symbols.set(name, sourceOp.id);
      ctx.types.set(sourceOp.id, type);
    }
    if (isTopLevel) ctx.defines.add(name);
    return;
  }

  if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) {
      if (prop.type === 'RestElement') {
        // ...rest in object destructuring → opaque for now
        const restOp = ctx.emit('opaque', ['/* object rest */'], DYNAMIC, l);
        lowerPattern(ctx, prop.argument, restOp, isTopLevel);
        continue;
      }
      const key = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const get = ctx.emit('object_get', [sourceOp.id, key], DYNAMIC, l);

      if (prop.value.type === 'AssignmentPattern') {
        // Default value: { a = 5 }
        const defaultVal = lowerExpr(ctx, prop.value.right);
        const check = ctx.emit('eq', [get.id, ctx.emit('const', [undefined], VOID, l).id], BOOL, l);
        const selected = ctx.emit('if_region', [check.id], DYNAMIC, l, {
          then_body: [defaultVal],
          else_body: [get],
          phis: [],
        });
        // For simplicity in v1, just use the get and trust runtime
        lowerPattern(ctx, prop.value.left, get, isTopLevel);
      } else {
        lowerPattern(ctx, prop.value, get, isTopLevel);
      }
    }
    return;
  }

  if (pattern.type === 'ArrayPattern') {
    for (let i = 0; i < pattern.elements.length; i++) {
      const el = pattern.elements[i];
      if (!el) continue;
      if (el.type === 'RestElement') {
        const restOp = ctx.emit('opaque', ['/* array rest */'], DYNAMIC, l);
        lowerPattern(ctx, el.argument, restOp, isTopLevel);
        continue;
      }
      const idx = ctx.emit('const', [i], I32, l);
      const get = ctx.emit('array_get', [sourceOp.id, idx.id], DYNAMIC, l);

      if (el.type === 'AssignmentPattern') {
        lowerPattern(ctx, el.left, get, isTopLevel);
      } else {
        lowerPattern(ctx, el, get, isTopLevel);
      }
    }
    return;
  }

  if (pattern.type === 'AssignmentPattern') {
    lowerPattern(ctx, pattern.left, sourceOp, isTopLevel);
    return;
  }
}

// --- Function declaration ---

function lowerFuncDecl(ctx, node) {
  const name = node.id?.name;
  const l = ctx.loc(node);

  const params = node.params.map(p => {
    if (p.type === 'Identifier') {
      const type = resolveAnnotation(p.typeAnnotation);
      return { name: p.name, type };
    }
    return { name: '?', type: DYNAMIC };
  });

  const retType = node.returnType ? resolveAnnotation(node.returnType) : DYNAMIC;

  // Lower function body in a new "scope" context. Push a new ctx.symbols
  // frame so let/const declarations inside the body don't leak to outer
  // reads (the spec §2.3 fix).
  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;
  ctx.symbols = ctx.symbols.push();
  const bodyOps = captureOps(ctx, () => {
    if (node.body?.type === 'BlockStatement') {
      for (const stmt of node.body.body) lowerStatement(ctx, stmt);
    }
  });
  ctx.symbols = ctx.symbols.pop();
  ctx.topLevel = savedTopLevel;

  const fType = func(params.map(p => p.type), retType);
  const op = ctx.emit('func_region', [name], fType, l, {
    name, params, body: bodyOps, ret_type: retType,
    is_async: node.async || false,
    is_generator: node.generator || false,
    // FunctionDeclaration → emit as `function name(...) {}` statement at
    // wherever this op sits, not as an expression. Without the flag, a
    // nested function decl was registered as an inline `function name(){}`
    // expression — body callers found the name unbound.
    is_decl: true,
  });

  if (name && ctx.topLevel) {
    ctx.defines.add(name);
    ctx.symbols.set(name, op.id);
  }

  return op;
}

// --- Control flow ---

function lowerIf(ctx, node) {
  const l = ctx.loc(node);
  const cond = lowerExpr(ctx, node.test);
  const thenBody = captureOps(ctx, () => lowerStatement(ctx, node.consequent));
  const elseBody = captureOps(ctx, () => {
    if (node.alternate) lowerStatement(ctx, node.alternate);
  });
  return ctx.emit('if_region', [cond.id], VOID, l, {
    then_body: thenBody,
    else_body: elseBody,
    phis: [],
  });
}

function lowerFor(ctx, node) {
  const l = ctx.loc(node);

  // for-header let/const are block-scoped — push a fresh ctx.symbols frame
  // so `for (let i …)` doesn't leak `i` into the outer scope, where outer
  // type-prop would then read the loop var's last-iteration ssa id.
  ctx.symbols = ctx.symbols.push();
  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;

  let test = null;
  const initOps = captureOps(ctx, () => {
    if (node.init) {
      if (node.init.type === 'VariableDeclaration') lowerVarDecl(ctx, node.init);
      else lowerExpr(ctx, node.init);
    }
  });
  const testOps = captureOps(ctx, () => {
    if (node.test) test = lowerExpr(ctx, node.test);
  });
  const updateOps = captureOps(ctx, () => {
    if (node.update) lowerExpr(ctx, node.update);
  });
  const bodyOps = captureOps(ctx, () => lowerStatement(ctx, node.body));

  ctx.topLevel = savedTopLevel;
  ctx.symbols = ctx.symbols.pop();

  return ctx.emit('for_region', [], VOID, l, {
    init: initOps,
    test: testOps,
    test_val: test?.id || null,
    update: updateOps,
    body: bodyOps,
    phis: [],
  });
}

function lowerForIn(ctx, node) {
  const l = ctx.loc(node);
  const iter = lowerExpr(ctx, node.right);
  ctx.symbols = ctx.symbols.push();

  // Declare the iteration variable (block-scoped, not top-level)
  if (node.left.type === 'VariableDeclaration') {
    const name = node.left.declarations[0]?.id?.name;
    if (name) {
      ctx.symbols.set(name, null);
    }
  }

  const bodyOps = captureOps(ctx, () => lowerStatement(ctx, node.body));
  ctx.symbols = ctx.symbols.pop();

  return ctx.emit('for_in_region', [iter.id], VOID, l, { body: bodyOps, phis: [] });
}

function lowerForOf(ctx, node) {
  const l = ctx.loc(node);

  // Destructuring loop variables (`for (const [i, s] of …)`, `for (const {a} of …)`)
  // would need a synthetic temp + a destructure in the body, which the IR
  // doesn't model directly. Preserve the source verbatim — the emitter
  // round-trips opaque text and `scanIdentifiers` still picks up cross-cell
  // deps.
  const isPatternTarget =
    (node.left.type === 'VariableDeclaration' &&
     node.left.declarations[0]?.id?.type !== 'Identifier') ||
    (node.left.type !== 'VariableDeclaration' && node.left.type !== 'Identifier');
  if (isPatternTarget) return lowerOpaque(ctx, node);

  const iter = lowerExpr(ctx, node.right);
  ctx.symbols = ctx.symbols.push();

  // Capture the loop variable's name so the emitter can use it instead of
  // falling back to a synthetic `_v`. References inside the body (`s.x`,
  // etc.) emit as bare identifiers, so the for-of header has to bind the
  // same name.
  let targetName = null;
  if (node.left.type === 'VariableDeclaration') {
    const name = node.left.declarations[0]?.id?.name;
    if (name) {
      targetName = name;
      ctx.symbols.set(name, null);
    }
  } else if (node.left.type === 'Identifier') {
    targetName = node.left.name;
  }

  const bodyOps = captureOps(ctx, () => lowerStatement(ctx, node.body));
  ctx.symbols = ctx.symbols.pop();

  return ctx.emit('for_of_region', [iter.id], VOID, l, {
    body: bodyOps, phis: [], target_name: targetName,
  });
}

function lowerWhile(ctx, node) {
  const l = ctx.loc(node);
  let cond = null;
  const testOps = captureOps(ctx, () => { cond = lowerExpr(ctx, node.test); });
  const bodyOps = captureOps(ctx, () => lowerStatement(ctx, node.body));
  return ctx.emit('loop_region', [], VOID, l, {
    test: testOps, test_val: cond.id,
    body: bodyOps, phis: [],
    loop_kind: 'while',
  });
}

function lowerDoWhile(ctx, node) {
  const l = ctx.loc(node);
  const bodyOps = captureOps(ctx, () => lowerStatement(ctx, node.body));
  let cond = null;
  const testOps = captureOps(ctx, () => { cond = lowerExpr(ctx, node.test); });
  return ctx.emit('loop_region', [], VOID, l, {
    test: testOps, test_val: cond.id,
    body: bodyOps, phis: [],
    loop_kind: 'do_while',
  });
}

function lowerSwitch(ctx, node) {
  const l = ctx.loc(node);
  const disc = lowerExpr(ctx, node.discriminant);
  const cases = [];
  for (const c of node.cases) {
    let test = null;
    const testOps = captureOps(ctx, () => {
      if (c.test) test = lowerExpr(ctx, c.test);
    });
    const body = captureOps(ctx, () => {
      for (const stmt of c.consequent) lowerStatement(ctx, stmt);
    });
    cases.push({ test_ops: testOps, test_val: test?.id || null, body });
  }
  return ctx.emit('switch_region', [disc.id], VOID, l, { cases });
}

function lowerTry(ctx, node) {
  const l = ctx.loc(node);

  // try / catch / finally blocks are each their own block scope. Push
  // around each so let-bindings (and the catch param) don't leak.
  ctx.symbols = ctx.symbols.push();
  const tryBody = captureOps(ctx, () => lowerStatement(ctx, node.block));
  ctx.symbols = ctx.symbols.pop();

  let catchParam = null;
  let catchBody = [];
  if (node.handler) {
    ctx.symbols = ctx.symbols.push();
    if (node.handler.param?.type === 'Identifier') {
      catchParam = node.handler.param.name;
      ctx.symbols.set(catchParam, null);
    }
    catchBody = captureOps(ctx, () => lowerStatement(ctx, node.handler.body));
    ctx.symbols = ctx.symbols.pop();
  }

  let finallyBody = [];
  if (node.finalizer) {
    ctx.symbols = ctx.symbols.push();
    finallyBody = captureOps(ctx, () => lowerStatement(ctx, node.finalizer));
    ctx.symbols = ctx.symbols.pop();
  }

  return ctx.emit('try_region', [], VOID, l, {
    try_body: tryBody,
    catch_param: catchParam,
    catch_body: catchBody,
    finally_body: finallyBody,
  });
}

function lowerLabeled(ctx, node) {
  const l = ctx.loc(node);
  // Track whether body was a block — emitter needs to re-wrap in braces so
  // `label: let x = 1;` (a JS strict-mode error) becomes `label: { let x; }`.
  // Loop bodies bring their own braces; we only wrap when the label was on a
  // bare block.
  const isBlock = node.body?.type === 'BlockStatement';
  const body = captureOps(ctx, () => lowerStatement(ctx, node.body));
  return ctx.emit('labeled', [node.label.name], VOID, l, { body, is_block: isBlock });
}

function lowerClassDecl(ctx, node) {
  const l = ctx.loc(node);
  const name = node.id?.name;
  const op = lowerClassNode(ctx, node, l);
  if (name && ctx.topLevel) {
    ctx.defines.add(name);
    ctx.symbols.set(name, op.id);
  }
  return op;
}

function lowerClassExpr(ctx, node) {
  return lowerClassNode(ctx, node, ctx.loc(node));
}

function lowerClassNode(ctx, node, l) {
  const name = node.id?.name || null;
  const superClass = node.superClass ? lowerExpr(ctx, node.superClass) : null;

  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;

  const members = [];
  for (const member of (node.body?.body || [])) {
    const mLoc = ctx.loc(member);

    if (member.type === 'StaticBlock') {
      ctx.symbols = ctx.symbols.push();
      const body = captureOps(ctx, () => {
        for (const stmt of member.body) lowerStatement(ctx, stmt);
      });
      ctx.symbols = ctx.symbols.pop();
      members.push({ kind: 'static_block', body, loc: mLoc });
      continue;
    }

    // MethodDefinition or PropertyDefinition
    const isStatic = member.static || false;
    const isPrivate = member.key?.type === 'PrivateIdentifier';
    const computed = member.computed || false;

    // Key
    let key = null;
    let computedKeyId = null;
    if (isPrivate) {
      key = '#' + member.key.name;
    } else if (computed) {
      const k = lowerExpr(ctx, member.key);
      computedKeyId = k.id;
    } else if (member.key?.type === 'Identifier') {
      key = member.key.name;
    } else if (member.key?.type === 'Literal') {
      key = member.key.value;
    }

    if (member.type === 'PropertyDefinition') {
      // Class field
      const valueId = member.value ? lowerExpr(ctx, member.value).id : null;
      members.push({
        kind: 'field', key, computedKeyId, computed, static: isStatic,
        private: isPrivate, value: valueId, loc: mLoc,
      });
      continue;
    }

    // MethodDefinition — lower value as func_region
    const kind = member.kind || 'method'; // 'constructor', 'method', 'get', 'set'
    const fn = member.value;

    const params = (fn.params || []).map(p => {
      if (p.type === 'Identifier') return { name: p.name, type: resolveAnnotation(p.typeAnnotation) };
      // Destructuring/rest params in methods — use name as placeholder
      return { name: '?', type: DYNAMIC };
    });
    const retType = fn.returnType ? resolveAnnotation(fn.returnType) : DYNAMIC;

    ctx.symbols = ctx.symbols.push();
    const bodyOps = captureOps(ctx, () => {
      if (fn.body?.type === 'BlockStatement') {
        for (const stmt of fn.body.body) lowerStatement(ctx, stmt);
      }
    });
    ctx.symbols = ctx.symbols.pop();

    const fType = func(params.map(p => p.type), retType);
    const fnOp = ctx.emit('func_region', [null], fType, mLoc, {
      name: null, params, body: bodyOps, ret_type: retType,
      is_async: fn.async || false,
      is_generator: fn.generator || false,
      is_method: true,
    });

    members.push({
      kind, key, computedKeyId, computed, static: isStatic,
      private: isPrivate, value: fnOp.id, loc: mLoc,
    });
  }

  ctx.topLevel = savedTopLevel;

  return ctx.emit('class_region', [name], DYNAMIC, l, {
    name,
    super_class: superClass?.id || null,
    members,
  });
}

function lowerReturn(ctx, node) {
  const l = ctx.loc(node);
  const val = node.argument ? lowerExpr(ctx, node.argument) : ctx.emit('const', [undefined], VOID, l);
  return ctx.emit('return', [val.id], VOID, l);
}

// --- Expression lowering ---

function lowerExpr(ctx, node) {
  if (!node) return ctx.emit('const', [undefined], VOID, null);
  const l = ctx.loc(node);

  switch (node.type) {
    case 'Literal':
      return lowerLiteral(ctx, node);

    case 'Identifier':
      return lowerIdentifier(ctx, node);

    case 'BinaryExpression':
      return lowerBinary(ctx, node);

    case 'LogicalExpression':
      return lowerLogical(ctx, node);

    case 'UnaryExpression':
      return lowerUnary(ctx, node);

    case 'UpdateExpression':
      return lowerUpdate(ctx, node);

    case 'AssignmentExpression':
      return lowerAssignment(ctx, node);

    case 'CallExpression':
      return lowerCall(ctx, node);

    case 'MemberExpression':
      return lowerMember(ctx, node);

    case 'ArrayExpression':
      return lowerArrayExpr(ctx, node);

    case 'ObjectExpression':
      return lowerObjectExpr(ctx, node);

    case 'ConditionalExpression':
      return lowerConditional(ctx, node);

    case 'TemplateLiteral':
      return lowerTemplateLiteral(ctx, node);

    case 'TaggedTemplateExpression':
      // Tagged templates have unique call semantics — the tag is invoked with
      // (stringsArray, ...interpolatedValues), where stringsArray carries the
      // raw source segments. AIR's plain `call` op can't represent this, so
      // we keep the original source verbatim. lowerOpaque scans for cross-cell
      // identifier references so dependency tracking still works.
      return lowerOpaque(ctx, node);

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return lowerFuncExpr(ctx, node);

    case 'AwaitExpression': {
      const arg = lowerExpr(ctx, node.argument);
      return ctx.emit('await', [arg.id], DYNAMIC, l);
    }

    case 'NewExpression':
      return lowerNew(ctx, node);

    case 'SpreadElement': {
      const arg = lowerExpr(ctx, node.argument);
      return ctx.emit('spread', [arg.id], DYNAMIC, l);
    }

    case 'SequenceExpression': {
      let last = null;
      for (const expr of node.expressions) last = lowerExpr(ctx, expr);
      return last;
    }

    case 'ParenthesizedExpression':
      return lowerExpr(ctx, node.expression);

    case 'ChainExpression':
      return lowerExpr(ctx, node.expression);

    case 'ClassExpression':
      return lowerClassExpr(ctx, node);

    case 'YieldExpression': {
      const arg = node.argument ? lowerExpr(ctx, node.argument) : null;
      const op = node.delegate ? 'yield_delegate' : 'yield';
      return ctx.emit(op, arg ? [arg.id] : [], DYNAMIC, l);
    }

    case 'ImportExpression': {
      const source = lowerExpr(ctx, node.source);
      return ctx.emit('import', [source.id], DYNAMIC, l);
    }

    case 'MetaProperty':
      return ctx.emit('meta', [node.meta.name, node.property.name], DYNAMIC, l);

    case 'ThisExpression':
      // Lower `this` as a load of the synthetic name 'this'. Emit-js
      // renders `load('this')` as the bare identifier `this`, which JS
      // scopes correctly to the surrounding function/method's receiver.
      // The interpreter binds `'this'` in the function-body scope from
      // the JS-side receiver (see interp.js func_region wrapper).
      return ctx.emit('load', ['this'], DYNAMIC, l);

    default:
      return lowerOpaque(ctx, node);
  }
}

// --- Literal ---

function lowerLiteral(ctx, node) {
  const l = ctx.loc(node);
  const v = node.value;
  if (v === null) return ctx.emit('null', [], DYNAMIC, l);
  if (typeof v === 'number') {
    // Infer type from value: integer if no decimal point and within i32 range
    const isInt = Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
    return ctx.emit('const', [v], isInt ? I32 : F64, l);
  }
  if (typeof v === 'string') return ctx.emit('const', [v], STRING, l);
  if (typeof v === 'boolean') return ctx.emit('const', [v], BOOL, l);
  if (v instanceof RegExp) return ctx.emit('opaque', [node.raw || String(v)], DYNAMIC, l);
  return ctx.emit('const', [v], DYNAMIC, l);
}

// --- Identifier ---

function lowerIdentifier(ctx, node) {
  const l = ctx.loc(node);
  const name = node.name;

  if (name === 'undefined') return ctx.emit('const', [undefined], VOID, l);
  if (name === 'true') return ctx.emit('const', [true], BOOL, l);
  if (name === 'false') return ctx.emit('const', [false], BOOL, l);

  // Mutable captured → slot_load
  if (ctx.mutableCaptured.has(name) && ctx.slots.has(name)) {
    const slot = ctx.slots.get(name);
    return ctx.emit('slot_load', [slot], DYNAMIC, l);
  }

  // Known in symbol table
  if (ctx.symbols.has(name)) {
    return ctx.emit('load', [name], ctx.types.get(ctx.symbols.get(name)) || DYNAMIC, l);
  }

  // Unknown — could be a cell import or global
  ctx.imports.add(name);
  return ctx.emit('load', [name], DYNAMIC, l);
}

// --- Binary operations ---

const BINARY_OP_MAP = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod',
  '==': 'eq', '!=': 'neq', '===': 'eq', '!==': 'neq',
  '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte',
  '|': 'bitwise_or', '&': 'bitwise_and', '^': 'bitwise_xor',
  '<<': 'shift_left', '>>': 'shift_right', '>>>': 'ushift_right',
  '**': 'exp', 'in': 'in', 'instanceof': 'instanceof',
};

// Result type for a binary op given operand types. Shared by lowerBinary
// and the compound-assignment desugaring in lowerAssign so that
// `s += x[i] * y[i]` types consistently with `s = s + (x[i] * y[i])`.
// Without sharing, compound assignment used the LHS's type unconditionally,
// which forced f64-arithmetic-into-an-i32-accumulator paths to be typed
// i32 — causing emit-js to wrap them in `| 0` (i32 truncation).
function binaryResultType(opName, lt, rt) {
  if (opName === 'in' || opName === 'instanceof') return BOOL;
  if (opName === 'eq' || opName === 'neq' || opName === 'lt' || opName === 'lte' ||
      opName === 'gt' || opName === 'gte') return BOOL;
  if (opName === 'bitwise_or' || opName === 'bitwise_and' || opName === 'bitwise_xor' ||
      opName === 'shift_left' || opName === 'shift_right' || opName === 'ushift_right') return I32;
  if (opName === 'exp') return arithmeticResultFn(lt, rt);
  if (isDynamic(lt) || isDynamic(rt)) return DYNAMIC;
  if (opName === 'add' && (lt.kind === 'string' || rt.kind === 'string')) return STRING;
  return arithmeticResultFn(lt, rt);
}

function lowerBinary(ctx, node) {
  const l = ctx.loc(node);
  const opName = BINARY_OP_MAP[node.operator];

  if (opName === 'opaque') return lowerOpaque(ctx, node);

  const lhs = lowerExpr(ctx, node.left);
  const rhs = lowerExpr(ctx, node.right);

  const lt = ctx.types.get(lhs.id) || DYNAMIC;
  const rt = ctx.types.get(rhs.id) || DYNAMIC;

  return ctx.emit(opName, [lhs.id, rhs.id], binaryResultType(opName, lt, rt), l);
}

// --- Logical operations ---
//
// JS short-circuits `&&` / `||` / `??` — RHS evaluates only when LHS
// doesn't determine the result. Lowering the RHS eagerly at the same
// nesting as LHS would make the IR lossy: emit-js used to recover
// short-circuit via ctx.exprs inlining (RHS expression text gets
// inlined into the `_lhs && _rhs` template), but the AIR interpreter
// executes ops in declaration order and would always evaluate RHS.
//
// The faithful representation is if_region with phi (matching adder
// and soft's and/or/coalesce lowering): condition is LHS, taken
// branch evaluates RHS, untaken branch passes LHS through. Phi picks
// the active branch's value.

function lowerLogical(ctx, node) {
  const l = ctx.loc(node);
  const op = node.operator;
  if (op !== '&&' && op !== '||' && op !== '??') return lowerOpaque(ctx, node);
  const lhs = lowerExpr(ctx, node.left);

  if (op === '&&') {
    // a && b → if (a) { return b; } else { return a; }
    return emitPhiSelect(ctx, lhs.id,
      () => lowerExpr(ctx, node.right),  // then: evaluate b
      () => lhs,                            // else: identity (a)
      l, DYNAMIC);
  }
  if (op === '||') {
    // a || b → if (a) { return a; } else { return b; }
    return emitPhiSelect(ctx, lhs.id,
      () => lhs,                            // then: identity
      () => lowerExpr(ctx, node.right),  // else: evaluate b
      l, DYNAMIC);
  }
  // ?? — `a ?? b` is `(a == null) ? b : a` (loose-equal-null catches both
  // null and undefined). Encode as `(a === null) || (a === undefined)`
  // → if-true: b, else: a.
  const nullConst = ctx.emit('const', [null], VOID, l);
  const isNull = ctx.emit('eq', [lhs.id, nullConst.id], BOOL, l);
  const undefConst = ctx.emit('const', [undefined], VOID, l);
  const isUndef = ctx.emit('eq', [lhs.id, undefConst.id], BOOL, l);
  // We want "is nullish" → use logical_or? But we just got rid of flat
  // logical_or. Use phi-select again: if isNull → true, else isUndef.
  // Simpler: compose via if_region with phi.
  const isNullish = emitPhiSelect(ctx, isNull.id,
    () => isNull,    // then: true (already known)
    () => isUndef,   // else: check undef
    l, BOOL);
  return emitPhiSelect(ctx, isNullish.id,
    () => lowerExpr(ctx, node.right),  // then: nullish, use b
    () => lhs,                            // else: not nullish, use a
    l, DYNAMIC);
}

// --- Unary operations ---

function lowerUnary(ctx, node) {
  const l = ctx.loc(node);
  if (node.operator === '-') {
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('neg', [arg.id], ctx.types.get(arg.id) || DYNAMIC, l);
  }
  if (node.operator === '!') {
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('logical_not', [arg.id], BOOL, l);
  }
  if (node.operator === '+') {
    // Unary `+` is a ToNumber coercion in JS (e.g. `+"42" === 42`).
    // Emit as a dedicated unary op — used to be `add` with a single
    // arg, which the emitter rendered as `(arg + undefined)` because
    // emitBinary expected two operands.
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('unary_plus', [arg.id], F64, l);
  }
  if (node.operator === 'typeof') {
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('typeof', [arg.id], STRING, l);
  }
  if (node.operator === 'void') {
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('void', [arg.id], VOID, l);
  }
  if (node.operator === 'delete') {
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('delete', [arg.id], BOOL, l);
  }
  if (node.operator === '~') {
    const arg = lowerExpr(ctx, node.argument);
    return ctx.emit('bitwise_not', [arg.id], I32, l);
  }
  return lowerOpaque(ctx, node);
}

// --- Update expressions (++/--) ---

function lowerUpdate(ctx, node) {
  const l = ctx.loc(node);
  if (node.argument.type !== 'Identifier') return lowerOpaque(ctx, node);

  const name = node.argument.name;
  const current = lowerIdentifier(ctx, node.argument);
  const one = ctx.emit('const', [1], I32, l);
  const opName = node.operator === '++' ? 'add' : 'sub';
  const result = ctx.emit(opName, [current.id, one.id], ctx.types.get(current.id) || DYNAMIC, l);

  if (ctx.mutableCaptured.has(name)) {
    const slot = ctx.slots.get(name);
    ctx.emit('slot_store', [slot, result.id], VOID, l);
  } else {
    ctx.emit('store', [name, result.id], VOID, l);
    ctx.symbols.set(name, result.id);
  }

  return node.prefix ? result : current;
}

// --- Assignment ---

function lowerAssignment(ctx, node) {
  const l = ctx.loc(node);

  if (node.left.type === 'Identifier') {
    const name = node.left.name;
    let val;
    if (node.operator === '=') {
      val = lowerExpr(ctx, node.right);
    } else {
      // Compound assignment: +=, -=, etc. Desugars to `lhs = lhs <op> rhs`,
      // so the result type follows the same rules as the equivalent binary
      // operation — NOT the LHS type unconditionally. Otherwise
      // `let s = 0; s += x[i] * y[i]` (i32 + DYNAMIC) would type as i32
      // and emit-js would wrap it in `| 0` (i32 truncation), corrupting
      // f64 accumulation.
      const current = lowerIdentifier(ctx, node.left);
      const rhs = lowerExpr(ctx, node.right);
      const opMap = { '+=': 'add', '-=': 'sub', '*=': 'mul', '/=': 'div', '%=': 'mod',
                      '|=': 'bitwise_or', '&=': 'bitwise_and', '^=': 'bitwise_xor',
                      '<<=': 'shift_left', '>>=': 'shift_right', '>>>=': 'ushift_right' };
      const opName = opMap[node.operator];
      if (!opName) return lowerOpaque(ctx, node);
      const lt = ctx.types.get(current.id) || DYNAMIC;
      const rt = ctx.types.get(rhs.id) || DYNAMIC;
      val = ctx.emit(opName, [current.id, rhs.id], binaryResultType(opName, lt, rt), l);
    }

    if (ctx.mutableCaptured.has(name)) {
      const slot = ctx.slots.get(name);
      ctx.emit('slot_store', [slot, val.id], VOID, l);
    } else {
      ctx.emit('store', [name, val.id], VOID, l);
      ctx.symbols.set(name, val.id);
    }
    return val;
  }

  if (node.left.type === 'MemberExpression') {
    const obj = lowerExpr(ctx, node.left.object);
    const rhs = lowerExpr(ctx, node.right);
    if (node.left.computed) {
      const key = lowerExpr(ctx, node.left.property);
      ctx.emit('array_set', [obj.id, key.id, rhs.id], VOID, l);
    } else {
      const key = (node.left.property.type === 'PrivateIdentifier' ? '#' : '') + node.left.property.name;
      ctx.emit('object_set', [obj.id, key, rhs.id], VOID, l);
    }
    // Assignment expressions evaluate to their rhs in JS — return `rhs`,
    // not the void store op, so chained assignments like
    // `a[i] = b[j] = c[k] = 0` find a real value at each rhs slot.
    return rhs;
  }

  // Destructuring assignment
  if (node.left.type === 'ObjectPattern' || node.left.type === 'ArrayPattern') {
    const val = lowerExpr(ctx, node.right);
    lowerPattern(ctx, node.left, val, false);
    return val;
  }

  return lowerOpaque(ctx, node);
}

// --- Call expressions ---

function lowerCall(ctx, node) {
  const l = ctx.loc(node);
  const optional = node.optional || false;
  const extra = optional ? { optional } : undefined;

  // Method call: obj.method(args)
  if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
    const obj = lowerExpr(ctx, node.callee.object);
    const method = node.callee.property.name;
    const callerOptional = node.callee.optional || false;
    const args = node.arguments.map(a => lowerExpr(ctx, a));
    return ctx.emit('call_method', [obj.id, method, ...args.map(a => a.id)], DYNAMIC, l,
      (optional || callerOptional) ? { optional, member_optional: callerOptional } : undefined);
  }

  // Regular call: fn(args)
  const fn = lowerExpr(ctx, node.callee);
  const args = node.arguments.map(a => lowerExpr(ctx, a));
  return ctx.emit('call', [fn.id, ...args.map(a => a.id)], DYNAMIC, l, extra);
}

// --- Member expressions ---

function lowerMember(ctx, node) {
  const l = ctx.loc(node);
  const obj = lowerExpr(ctx, node.object);
  const optional = node.optional || false;

  if (node.computed) {
    const key = lowerExpr(ctx, node.property);
    return ctx.emit('array_get', [obj.id, key.id], DYNAMIC, l, optional ? { optional } : undefined);
  }

  const key = (node.property.type === 'PrivateIdentifier' ? '#' : '') + node.property.name;
  return ctx.emit('object_get', [obj.id, key], DYNAMIC, l, optional ? { optional } : undefined);
}

// --- Array/Object expressions ---

function lowerArrayExpr(ctx, node) {
  const l = ctx.loc(node);
  const elements = node.elements.map(el => {
    if (!el) return ctx.emit('const', [undefined], VOID, l);
    return lowerExpr(ctx, el);
  });
  return ctx.emit('array_new', elements.map(e => e.id), DYNAMIC, l);
}

function lowerObjectExpr(ctx, node) {
  const l = ctx.loc(node);
  const pairs = [];
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      // Object spread: { ...obj }
      const spread = lowerExpr(ctx, prop.argument);
      pairs.push({ spread: true, id: spread.id });
      continue;
    }
    const key = prop.key.type === 'Identifier' ? prop.key.name :
                prop.key.type === 'Literal' ? String(prop.key.value) : null;
    if (key === null) return lowerOpaque(ctx, node); // computed key
    const val = lowerExpr(ctx, prop.value);
    pairs.push({ key, id: val.id });
  }
  return ctx.emit('object_new', pairs, DYNAMIC, l);
}

// --- Conditional (ternary) ---

function lowerConditional(ctx, node) {
  const l = ctx.loc(node);
  const cond = lowerExpr(ctx, node.test);
  return emitPhiSelect(ctx, cond.id,
    () => lowerExpr(ctx, node.consequent),
    () => lowerExpr(ctx, node.alternate),
    l, DYNAMIC);
}

// --- Template literals ---

function lowerTemplateLiteral(ctx, node) {
  const l = ctx.loc(node);
  let result = ctx.emit('const', [node.quasis[0].value.cooked || ''], STRING, l);

  for (let i = 0; i < node.expressions.length; i++) {
    const expr = lowerExpr(ctx, node.expressions[i]);
    result = ctx.emit('add', [result.id, expr.id], STRING, l);
    if (node.quasis[i + 1]?.value?.cooked) {
      const tail = ctx.emit('const', [node.quasis[i + 1].value.cooked], STRING, l);
      result = ctx.emit('add', [result.id, tail.id], STRING, l);
    }
  }

  return result;
}

// --- Function expressions ---

function lowerFuncExpr(ctx, node) {
  const name = node.id?.name || null;
  const l = ctx.loc(node);

  const params = node.params.map(p => {
    if (p.type === 'Identifier') {
      return { name: p.name, type: resolveAnnotation(p.typeAnnotation) };
    }
    return { name: '?', type: DYNAMIC };
  });

  const retType = node.returnType ? resolveAnnotation(node.returnType) : DYNAMIC;

  const savedTopLevel = ctx.topLevel;
  ctx.topLevel = false;
  ctx.symbols = ctx.symbols.push();
  const body = node.body;
  const bodyOps = captureOps(ctx, () => {
    if (body.type === 'BlockStatement') {
      for (const stmt of body.body) lowerStatement(ctx, stmt);
    } else {
      // Arrow with expression body
      const val = lowerExpr(ctx, body);
      ctx.emit('return', [val.id], VOID, ctx.loc(body));
    }
  });
  ctx.symbols = ctx.symbols.pop();
  ctx.topLevel = savedTopLevel;

  const fType = func(params.map(p => p.type), retType);
  return ctx.emit('func_region', [name], fType, l, {
    name, params, body: bodyOps, ret_type: retType,
    is_async: node.async || false,
    is_generator: node.generator || false,
  });
}

// --- New expressions ---

function lowerNew(ctx, node) {
  const l = ctx.loc(node);

  // Typed array constructors
  if (node.callee.type === 'Identifier' && TYPED_ARRAY_CTORS.has(node.callee.name)) {
    const element = CTOR_TO_ELEMENT[node.callee.name];
    const args = node.arguments.map(a => lowerExpr(ctx, a));
    return ctx.emit('ta_new', [element, ...args.map(a => a.id)], typedArray(element), l);
  }

  // All other new expressions
  const ctor = lowerExpr(ctx, node.callee);
  const args = node.arguments.map(a => lowerExpr(ctx, a));
  return ctx.emit('new', [ctor.id, ...args.map(a => a.id)], DYNAMIC, l);
}

// --- Opaque fallback ---

function lowerOpaque(ctx, node) {
  const l = ctx.loc(node);
  // Scan the AST subtree for identifier references (conservative dependency)
  // so that opaque regions don't lose cross-cell dependencies.
  scanIdentifiers(ctx, node);
  // Preserve original source text for the emitter
  const src = (ctx.source && node.start != null && node.end != null) ?
    ctx.source.slice(node.start, node.end) : `(void 0) /* opaque: ${node.type} */`;
  return ctx.emit('opaque', [src], DYNAMIC, l);
}

function scanIdentifiers(ctx, node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) scanIdentifiers(ctx, n); return; }
  if (node.type === 'Identifier' && node.name && !ctx.symbols.has(node.name)) {
    ctx.imports.add(node.name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' ||
        key === 'typeAnnotation' || key === 'returnType') continue;
    const child = node[key];
    if (child && typeof child === 'object') scanIdentifiers(ctx, child);
  }
}

// --- Utility: import arithmeticResult ---
// (Already imported at top of file)

// -- passes.js --

// @gcu/air — Optimization passes
// Spec §8: Type propagation, constant folding, DCE, dependency extraction


// Helper: take union of two types — the widest concrete type that can
// represent both. For numeric pairs, delegates to arithmeticResult which
// follows the JS numeric promotion hierarchy (f64 > f32 > i64 > i32 > i16
// > i8, float wins over int at same rank). Without this, loop variables
// initialized as i32 then assigned float in the body would degrade to
// DYNAMIC and lose all type hints downstream — the smart union keeps the
// f64 inference, letting emit-js drop the wrong `| 0` coercion while
// preserving useful info elsewhere.
function unionType(a, b) {
  if (!a) return b || DYNAMIC;
  if (!b) return a;
  if (typeEq(a, b)) return a;
  // Both concrete numeric → widen via JS arithmetic promotion rules.
  if (isConcrete(a) && isConcrete(b) && isNumeric(a) && isNumeric(b)) {
    return arithmeticResult(a, b);
  }
  return DYNAMIC;
}

// Python dict-protocol method names. When `_py.getattr(plainObj, name)` is
// rewritten to a direct property access, these names must be excluded — a
// literal `{}` in JS doesn't have native `.values`/`.keys`/`.items`/etc, so
// dropping the helper would produce `undefined is not a function` at call
// time. Keeping the helper lets `adderGetAttr`'s `_objDictMethods` dispatch
// route them correctly. User-data that shadows these names (e.g.
// `d = {"values": [1,2]}`) still wins because `adderGetAttr` checks
// `attr in obj` before the dict-protocol table.
const _DICT_PROTOCOL_NAMES = new Set([
  'keys', 'values', 'items',
  'get', 'pop', 'popitem', 'setdefault', 'update', 'clear', 'copy', 'fromkeys',
]);

// Infer the element type from an iterable's SSA id.
// Handles: `range(...)` → i32, `_py.iter(range(...))` → i32,
//          Float64Array-typed arrays → f64, etc.
function inferIterableElementType(ssaId, allOps) {
  const op = findOpAnywhere(allOps, ssaId);
  if (!op) return null;

  // Typed array → element type
  if (op.op === 'ta_new' || (op.type && op.type.kind === 'typed_array')) {
    const elName = op.type?.element;
    if (elName === 'f64') return F64;
    if (elName === 'f32') return { kind: 'f32' };
    if (elName && elName !== 'i64' && elName !== 'u64') return I32;
  }

  // Peel off _py.iter(X) or await _py.iter(X) wrapping
  if (op.op === 'await') return inferIterableElementType(op.args[0], allOps);
  if (op.op === 'call') {
    // Check if callee is _py.iter
    const calleeOp = findOpAnywhere(allOps, op.args[0]);
    if (calleeOp && calleeOp.op === 'object_get' && calleeOp.args[1] === 'iter') {
      const rtOp = findOpAnywhere(allOps, calleeOp.args[0]);
      if (rtOp && rtOp.op === 'load' && rtOp.args[0] === '_py') {
        // Recurse into inner: _py.iter(X) has element = element-of(X)
        return inferIterableElementType(op.args[1], allOps);
      }
    }
    // Check if it's a call to `range(...)` — builtin that yields i32
    // The callee is a load of 'range'
    if (calleeOp && calleeOp.op === 'load' && calleeOp.args[0] === 'range') {
      return I32;
    }
  }
  return null;
}

// Typed-array element type lookup
function taElementType(t) {
  if (!t || t.kind !== 'typed_array') return null;
  const k = t.element;
  if (k === 'i8' || k === 'u8' || k === 'i16' || k === 'u16' ||
      k === 'i32' || k === 'u32') return I32;
  if (k === 'i64' || k === 'u64') return DYNAMIC; // BigInt
  if (k === 'f32') return { kind: 'f32' };
  if (k === 'f64') return F64;
  return DYNAMIC;
}

// =============================================================================
// §8.1 — Type propagation (enhanced: tracks name → type across stores/loads)
// =============================================================================

function propagateTypes(module, opts = {}) {
  const types = new Map();     // SSA id → type
  const nameTypes = new Map(); // variable name → current type
  const nameOrigins = new Map(); // variable name → current value SSA id

  // Resolve a value ssa id through load ops (using currently-tracked origins)
  function resolveValue(ssaId) {
    const op = findOpAnywhere(module.ops, ssaId);
    if (!op) return null;
    if (op.op === 'load' && typeof op.args[0] === 'string') {
      const originId = nameOrigins.get(op.args[0]);
      if (originId) return resolveValue(originId);
    }
    return op;
  }

  // Seed nameTypes from imports (cross-cell type flow)
  // opts.importTypes: Map<importName, Type>
  if (opts.importTypes) {
    for (const [name, t] of opts.importTypes) {
      nameTypes.set(name, t);
    }
  }

  function typeOf(id) {
    return types.get(id) || DYNAMIC;
  }

  // When processing a branched region, collect writes so outer scope can
  // union/invalidate. Schema-derived: forEachRegion walks every region
  // declared on the op (incl. switch cases, class methods, try/catch/
  // finally — the legacy walker missed class methods and switch test_ops).
  function collectWrittenNames(ops, writes) {
    for (const op of ops || []) {
      if (op.op === 'store' && typeof op.args[0] === 'string') {
        writes.add(op.args[0]);
      }
      forEachRegion(op, (_name, rops) => collectWrittenNames(rops, writes));
    }
  }

  function propagate(ops) {
    for (const op of ops) {
      // Carry existing type (set at lowering time via annotation or literal)
      if (op.type && !isDynamic(op.type)) {
        types.set(op.id, op.type);
      }

      switch (op.op) {
        case 'const':
          types.set(op.id, op.type);
          break;

        case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'exp': {
          const lt = typeOf(op.args[0]);
          const rt = typeOf(op.args[1]);
          // Always recompute op.type from current operand types — a passes
          // round may have refined operand types beyond what the lowerer
          // saw (e.g. a load whose stored value was re-typed across a
          // for-loop boundary). Without this, an op originally typed i32
          // by the lowerer can stay i32 even when its operands are now
          // DYNAMIC, causing emit-js to wrap an f64 sum in `| 0`.
          if (op.op === 'add' && (lt.kind === 'string' || rt.kind === 'string')) {
            op.type = STRING;
          } else if (isDynamic(lt) || isDynamic(rt)) {
            op.type = DYNAMIC;
          } else if (isNumeric(lt) && isNumeric(rt)) {
            op.type = arithmeticResult(lt, rt);
          }
          types.set(op.id, op.type);
          break;
        }

        case 'neg': {
          const t = typeOf(op.args[0]);
          if (isNumeric(t)) op.type = t;
          types.set(op.id, op.type);
          break;
        }

        case 'bitwise_or': case 'bitwise_and': case 'bitwise_xor':
        case 'shift_left': case 'shift_right': case 'ushift_right':
        case 'bitwise_not':
          op.type = I32;
          types.set(op.id, I32);
          break;

        case 'eq': case 'neq': case 'lt': case 'lte': case 'gt': case 'gte':
        case 'logical_not': case 'in': case 'instanceof':
          op.type = BOOL;
          types.set(op.id, BOOL);
          break;

        case 'logical_and': case 'logical_or': case 'nullish_coalesce': {
          const lt = typeOf(op.args[0]);
          const rt = typeOf(op.args[1]);
          op.type = typeEq(lt, rt) ? lt : DYNAMIC;
          types.set(op.id, op.type);
          break;
        }

        case 'typeof':
          op.type = STRING;
          types.set(op.id, STRING);
          break;

        case 'load': {
          const name = op.args[0];
          // Prefer tracked name type; fallback to op's declared type
          const t = nameTypes.has(name) ? nameTypes.get(name) : (op.type || DYNAMIC);
          op.type = t;
          types.set(op.id, t);
          break;
        }

        case 'store': {
          const name = op.args[0];
          const valId = op.args[1];
          const valType = typeOf(valId);
          // If store has a declared type (from annotation), prefer it.
          // Otherwise inherit the value's type.
          const declared = op.type && !isDynamic(op.type) && op.type.kind !== 'void';
          const t = declared ? op.type : valType;
          nameTypes.set(name, t);
          nameOrigins.set(name, valId);
          types.set(op.id, VOID);
          break;
        }

        case 'slot_load': {
          types.set(op.id, op.type || DYNAMIC);
          break;
        }

        case 'slot_store': {
          types.set(op.id, VOID);
          break;
        }

        case 'object_get': {
          // If the object was produced (possibly through a load chain) by an
          // object_new with a statically-known field matching this key, infer
          // the field's type.
          const objId = op.args[0];
          const key = op.args[1];
          let inferred = op.type || DYNAMIC;
          if (typeof key === 'string' && isDynamic(inferred)) {
            const srcOp = resolveValue(objId);
            if (srcOp && srcOp.op === 'object_new' && Array.isArray(srcOp.args)) {
              for (const pair of srcOp.args) {
                if (pair && pair.key === key && pair.id) {
                  const fieldT = types.get(pair.id);
                  if (fieldT && !isDynamic(fieldT)) inferred = fieldT;
                  break;
                }
              }
            }
          }
          op.type = inferred;
          types.set(op.id, inferred);
          break;
        }
        case 'array_get': {
          types.set(op.id, op.type || DYNAMIC);
          break;
        }

        case 'ta_new': {
          types.set(op.id, op.type);
          break;
        }

        case 'ta_get': {
          // Typed array indexing returns the element type
          const arrT = typeOf(op.args[0]);
          const elT = taElementType(arrT);
          if (elT) { op.type = elT; }
          types.set(op.id, op.type || DYNAMIC);
          break;
        }

        case 'array_new': {
          types.set(op.id, op.type || DYNAMIC);
          break;
        }

        case 'object_new': {
          types.set(op.id, op.type || DYNAMIC);
          break;
        }

        case 'call': case 'call_method': {
          // If the callee carries a function type, use its declared return.
          // The callee's SSA type may be a `func(params, ret)` set on the
          // func_region (e.g. by adder/JS lowering with a `-> Type` annotation),
          // or DYNAMIC. We propagate ret only — params aren't used here.
          let inferred = op.type || DYNAMIC;
          if (isDynamic(inferred) && op.op === 'call' && op.args.length > 0) {
            const calleeT = typeOf(op.args[0]);
            if (calleeT && calleeT.kind === 'function' && calleeT.ret) {
              inferred = calleeT.ret;
            }
          }
          op.type = inferred;
          types.set(op.id, inferred);
          break;
        }

        case 'await': {
          // await unwraps Promise but we don't track Promise<T> explicitly.
          // We carry the inner type through directly: emit-side, async funcs
          // declared with `ret_type: T` return T-when-awaited as the user
          // sees it. So pass through whatever the awaited expression's type
          // resolved to.
          const innerT = typeOf(op.args[0]);
          const t = isDynamic(op.type) ? (innerT || DYNAMIC) : op.type;
          op.type = t;
          types.set(op.id, t);
          break;
        }

        case 'func_region': {
          types.set(op.id, op.type);
          // Recurse into body with a scope snapshot
          const saved = new Map(nameTypes);
          // Seed self-recursion: when the body loads its own name, give it
          // the function's own type so recursive calls infer ret_type
          // correctly (e.g. fib's body calling fib). Without this, the load
          // would default to DYNAMIC and binary helpers wouldn't specialise.
          if (op.name && op.type && op.type.kind === 'function') {
            nameTypes.set(op.name, op.type);
          }
          // Seed params with their declared types
          if (op.params) {
            for (const p of op.params) {
              if (p.type && !isDynamic(p.type)) {
                nameTypes.set(p.name, p.type);
              }
            }
          }
          if (op.body) propagate(op.body);
          // Restore outer scope
          nameTypes.clear();
          for (const [k, v] of saved) nameTypes.set(k, v);
          break;
        }

        case 'class_region': {
          types.set(op.id, op.type || DYNAMIC);
          // Classes don't (currently) contribute to type propagation
          break;
        }

        case 'if_region': {
          // Save types, walk each branch, then union writes.
          const saved = new Map(nameTypes);
          const thenTypes = new Map(saved);

          nameTypes.clear();
          for (const [k, v] of saved) nameTypes.set(k, v);
          if (op.then_body) propagate(op.then_body);
          const afterThen = new Map(nameTypes);

          nameTypes.clear();
          for (const [k, v] of saved) nameTypes.set(k, v);
          if (op.else_body) propagate(op.else_body);
          const afterElse = new Map(nameTypes);

          // Merge: union of both branches, plus original for names written in neither
          nameTypes.clear();
          for (const [k, v] of saved) nameTypes.set(k, v);
          const written = new Set();
          collectWrittenNames(op.then_body || [], written);
          collectWrittenNames(op.else_body || [], written);
          for (const name of written) {
            const t1 = afterThen.has(name) ? afterThen.get(name) : saved.get(name);
            const t2 = afterElse.has(name) ? afterElse.get(name) : saved.get(name);
            nameTypes.set(name, unionType(t1, t2));
          }

          types.set(op.id, op.type || VOID);
          break;
        }

        case 'for_region': {
          if (op.init) propagate(op.init);

          // Type-fixed-point for loop variables. Without this, a variable
          // declared `let x = 0` (i32) and then reassigned `x = expr_f64`
          // inside the body stays inferred as i32 for the *whole* body —
          // including the first iteration's reads — because we only walk
          // the body once. Re-walking with the unioned type seeded lets
          // every read see the widened type. Mandelbrot's `tmp = x*x +
          // x0_f64; x = tmp` regressed without this.
          const writtenNames = new Set();
          collectWrittenNames(op.body || [], writtenNames);
          collectWrittenNames(op.update || [], writtenNames);

          for (let iter = 0; iter < 4; iter++) {
            const before = new Map();
            for (const name of writtenNames) before.set(name, nameTypes.get(name));
            if (op.test) propagate(op.test);
            if (op.body) propagate(op.body);
            if (op.update) propagate(op.update);
            let stable = true;
            for (const name of writtenNames) {
              const prev = before.get(name);
              const u = unionType(prev, nameTypes.get(name));
              if (!prev || !typeEq(u, prev)) stable = false;
              nameTypes.set(name, u);
            }
            if (stable) break;
          }
          types.set(op.id, VOID);
          break;
        }

        case 'loop_region': {
          // Type-fixed-point (see for_region above for rationale).
          const writtenNames = new Set();
          collectWrittenNames(op.body || [], writtenNames);
          for (let iter = 0; iter < 4; iter++) {
            const before = new Map();
            for (const name of writtenNames) before.set(name, nameTypes.get(name));
            if (op.test) propagate(op.test);
            if (op.body) propagate(op.body);
            let stable = true;
            for (const name of writtenNames) {
              const prev = before.get(name);
              const u = unionType(prev, nameTypes.get(name));
              if (!prev || !typeEq(u, prev)) stable = false;
              nameTypes.set(name, u);
            }
            if (stable) break;
          }
          types.set(op.id, VOID);
          break;
        }

        case 'for_in_region': case 'for_of_region': {
          // If the iterable is `_py.iter(range(...))` or `range(...)`, element is i32.
          // This covers the common "for i in range(n)" pattern in transpiled adder.
          if (op.op === 'for_of_region' && op.target_name) {
            const elT = inferIterableElementType(op.args[0], module.ops);
            if (elT) nameTypes.set(op.target_name, elT);
          }
          // Type-fixed-point — same shape as for_region. The loop body runs
          // multiple times at runtime; a variable widened by a body
          // assignment (`total = total + x * 0.5`) needs every read to
          // see the widened type, not just reads after the first assign.
          const writtenNames = new Set();
          collectWrittenNames(op.body || [], writtenNames);
          for (let iter = 0; iter < 4; iter++) {
            const before = new Map();
            for (const name of writtenNames) before.set(name, nameTypes.get(name));
            if (op.body) propagate(op.body);
            let stable = true;
            for (const name of writtenNames) {
              const prev = before.get(name);
              const u = unionType(prev, nameTypes.get(name));
              if (!prev || !typeEq(u, prev)) stable = false;
              nameTypes.set(name, u);
            }
            if (stable) break;
          }
          types.set(op.id, VOID);
          break;
        }

        case 'try_region': {
          if (op.try_body) propagate(op.try_body);
          if (op.catch_body) propagate(op.catch_body);
          if (op.finally_body) propagate(op.finally_body);
          // After try, names written in try/catch could be either's type.
          // Conservatively dynamic.
          const written = new Set();
          collectWrittenNames(op.try_body || [], written);
          collectWrittenNames(op.catch_body || [], written);
          for (const name of written) nameTypes.set(name, DYNAMIC);
          types.set(op.id, VOID);
          break;
        }

        case 'switch_region': {
          // Walk each case with a fresh copy of the entry-time types
          // (cases don't fall through type-info-wise even with fall-through
          // statement semantics — every case starts from the same value
          // env conceptually), then union writes across all cases. Mirrors
          // the if_region branch-merge pattern.
          if (op.cases) {
            const saved = new Map(nameTypes);
            const writtenAcross = new Set();
            const perCaseAfter = [];
            for (const c of op.cases) {
              nameTypes.clear();
              for (const [k, v] of saved) nameTypes.set(k, v);
              if (c.test_ops) propagate(c.test_ops);
              if (c.body) propagate(c.body);
              perCaseAfter.push(new Map(nameTypes));
              if (c.body) collectWrittenNames(c.body, writtenAcross);
            }
            nameTypes.clear();
            for (const [k, v] of saved) nameTypes.set(k, v);
            for (const name of writtenAcross) {
              let merged = saved.get(name);
              for (const after of perCaseAfter) {
                const t = after.has(name) ? after.get(name) : saved.get(name);
                merged = unionType(merged, t);
              }
              nameTypes.set(name, merged);
            }
          }
          types.set(op.id, VOID);
          break;
        }

        default:
          if (!types.has(op.id)) types.set(op.id, op.type || DYNAMIC);
      }
    }
  }

  propagate(module.ops);

  // Update the module's exports map with inferred types
  if (module.exports) {
    for (const [name, exp] of module.exports) {
      if (nameTypes.has(name)) {
        const t = nameTypes.get(name);
        if (t && !isDynamic(t)) {
          exp.type = t;
        }
      }
    }
  }

  return types;
}

// =============================================================================
// §8.2 — Constant folding
// =============================================================================

function foldConstants(module) {
  let changed = false;

  function fold(ops) {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];

      // Schema-derived recursion — picks up regions the legacy walker
      // missed (switch cases, try blocks, class methods) so constants
      // inside them now get folded.
      forEachRegion(op, (_name, rops) => fold(rops));

      // Fold binary ops on constants
      if ((op.op === 'add' || op.op === 'sub' || op.op === 'mul' ||
           op.op === 'div' || op.op === 'mod') && op.args.length === 2) {
        const lhsOp = findOpById(module.ops, op.args[0]);
        const rhsOp = findOpById(module.ops, op.args[1]);
        if (lhsOp?.op === 'const' && rhsOp?.op === 'const' &&
            typeof lhsOp.args[0] === 'number' && typeof rhsOp.args[0] === 'number') {
          let val;
          switch (op.op) {
            case 'add': val = lhsOp.args[0] + rhsOp.args[0]; break;
            case 'sub': val = lhsOp.args[0] - rhsOp.args[0]; break;
            case 'mul': val = lhsOp.args[0] * rhsOp.args[0]; break;
            case 'div': val = lhsOp.args[0] / rhsOp.args[0]; break;
            case 'mod': val = lhsOp.args[0] % rhsOp.args[0]; break;
          }
          if (val !== undefined && isFinite(val)) {
            op.op = 'const';
            op.args = [val];
            op.type = Number.isInteger(val) && val >= -2147483648 && val <= 2147483647 ? I32 : F64;
            changed = true;
          }
        }
      }

      // Fold negation of constant
      if (op.op === 'neg' && op.args.length === 1) {
        const argOp = findOpById(module.ops, op.args[0]);
        if (argOp?.op === 'const' && typeof argOp.args[0] === 'number') {
          op.op = 'const';
          op.args = [-argOp.args[0]];
          changed = true;
        }
      }
    }
  }

  fold(module.ops);
  return changed;
}

// Schema-derived op lookup. Searches every region (declared + synthetic
// switch cases / class members) — this is now a superset of the previous
// hand-rolled walker, but it's safe: looking up an SSA id and finding it
// in a region the previous walker missed only fixes existing bugs.
function findOpById(ops, id) {
  for (const op of ops) {
    if (op.id === id) return op;
    let found = null;
    forEachRegion(op, (_name, rops) => {
      if (!found) { const r = findOpById(rops, id); if (r) found = r; }
    });
    if (found) return found;
  }
  return null;
}

// =============================================================================
// §8.3 — Dead code elimination
// =============================================================================

function eliminateDeadCode(module) {
  // Mark roots: exports, calls, opaques, slot_stores
  const live = new Set();

  function markReachable(ops) {
    for (const op of ops) {
      // Schema-derived "always live" check. side_effecting covers the
      // legacy hand-rolled list (opaque, call, call_method, store, *_set,
      // await, return, break, continue) — plus correctly catches new,
      // throw, debugger, yield, etc. introducesScope covers region ops
      // (if/for/loop/func/class/switch/try/labeled).
      if (isSideEffecting(op) || introducesScope(op)) live.add(op.id);
      forEachRegion(op, (_name, rops) => markReachable(rops));
    }
  }

  markReachable(module.ops);

  // Intentional (mark-only): we mark reachability but don't delete ops here.
  // Pure perf, zero correctness impact — emit-js already skips unreferenced
  // SSA values, so dead ops don't reach the output; physically removing them
  // (a backward-reachability rewrite) is a future optimization, not a fix.
  return live;
}

// =============================================================================
// §8.4 — Dependency extraction
// =============================================================================

function extractDependencies(module) {
  // Extract which names are defined and used
  return {
    defines: new Set(module.defines),
    uses: new Set(module.imports),
  };
}

// =============================================================================
// §8.5 — Hint insertion
// =============================================================================

function insertHints(module, typeMap) {
  function hint(ops) {
    for (const op of ops) {
      if ((op.op === 'add' || op.op === 'sub' || op.op === 'mul' || op.op === 'div' || op.op === 'mod') &&
          isConcrete(op.type) && isNumeric(op.type)) {
        if (!op.meta) op.meta = {};
        op.meta.hint = 'typed';
      }
      // Schema-derived recursion (now also walks try/catch/switch/class bodies)
      forEachRegion(op, (_name, rops) => hint(rops));
    }
  }

  hint(module.ops);
}

// =============================================================================
// §8.7 — Runtime helper specialization
// =============================================================================
// Detect calls to runtime helpers (`_py.add`, `_soft.eq`, etc.) where we can
// prove the operands' types, and replace with raw AIR ops. The emitter then
// outputs direct JS operators, skipping the helper call entirely.
//
// This is the big win for typed numeric loops in adder/Soft — instead of
// `_py.add(a, b)` → `a + b` directly.

// Specialization registry. Each frontend (adder, soft, hypothetical
// future ones) ships its own table and registers it via
// `registerSpecializations(namespace, specs)` at module-init time. The
// dependency direction is now correct: passes.js doesn't need to know
// what frontends exist — frontends opt in to the specialization pass by
// declaring their tables.
//
// Schema of a spec entry:
//   { op, arity?, check, resultType, passthrough?, customEmit? }
//
//   op          — AIR op name to rewrite to, or null for special handling
//   arity       — operand count (default 2)
//   check(...)  — predicate over operand types, returns true if specialization fires
//   resultType  — function or value: result type of the rewritten op
//   passthrough — when true, the op is replaced by its sole arg (e.g. _py.truthy(bool) → bool)
//   customEmit  — when true, specializeRuntimeHelpers does op-specific
//                 rewriting (e.g. between → (v >= lo) && (v <= hi))
const _specsByNamespace = new Map();

/**
 * Register specializations for a runtime helper namespace. Each frontend
 * calls this at module-init time:
 *
 *   registerSpecializations('_py', {
 *     add: { op: 'add', check: bothNumeric, resultType: arithmeticResult },
 *     // ...
 *   });
 *
 * Multiple calls merge — the same namespace can be registered with new
 * methods (e.g. an extension package adding more specializations to
 * `_py`). Later registrations override earlier ones for the same method.
 */
function registerSpecializations(namespace, specs) {
  const existing = _specsByNamespace.get(namespace) || {};
  _specsByNamespace.set(namespace, { ...existing, ...specs });
}

/**
 * Look up the specs for a namespace. Returns null when no frontend has
 * registered that namespace; specializeRuntimeHelpers skips silently.
 */
function getSpecializations(namespace) {
  return _specsByNamespace.get(namespace) || null;
}

// Detect sequences like:
//   %A = load "_py"
//   %B = object_get %A, "methodName"
//   %C = call [%B, arg1, arg2]
// and replace %C with a direct AIR op if specialization applies.
//
// We also handle the adder's "awaited call" pattern:
//   %A = load "_py"
//   %B = object_get %A, "methodName"
//   %C = call [%B, arg1, arg2]
//   %D = await [%C]
// In that case we replace both %C and %D; subsequent uses of %D get redirected to the new op.
// Walks ops in order; for each name, tracks the origin op of its current value.
// If a name has a unique origin, we can trace `load name` back to that origin
// for specialization purposes. If reassigned with different origins, the current
// value can change — we use the most recent.
function computeNameOrigins(allOps) {
  const origins = new Map(); // name → SSA id of the value stored
  const opsById = new Map(); // SSA id → op, for fast lookup
  function visit(ops) {
    for (const op of ops) {
      if (op.id) opsById.set(op.id, op);
      if (op.op === 'store' && typeof op.args[0] === 'string') {
        origins.set(op.args[0], op.args[1]);
      }
      for (const key of ['then_body', 'else_body', 'body', 'init', 'test',
                         'update', 'try_body', 'catch_body', 'finally_body']) {
        if (op[key]) visit(op[key]);
      }
      if (op.cases) for (const c of op.cases) {
        if (c.test_ops) visit(c.test_ops);
        if (c.body) visit(c.body);
      }
    }
  }
  visit(allOps);
  return { origins, opsById };
}

// Resolve an SSA id through load ops to its source op (object_new, array_new, etc.)
function resolveOrigin(ssaId, origins, opsById) {
  let op = opsById.get(ssaId);
  if (!op) return null;
  if (op.op === 'load' && typeof op.args[0] === 'string') {
    const originId = origins.get(op.args[0]);
    if (originId) return resolveOrigin(originId, origins, opsById);
  }
  return op;
}

function specializeRuntimeHelpers(module, types) {
  const replacements = new Map(); // old SSA id → new SSA id (for arg rewrites)
  let changed = false;
  const { origins, opsById } = computeNameOrigins(module.ops);

  // Helper: find op or follow load chains
  function traceOp(ssaId) {
    return resolveOrigin(ssaId, origins, opsById);
  }

  function specialize(ops) {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];

      // Rewrite args through replacements (in case an earlier op was replaced)
      if (op.args) {
        for (let j = 0; j < op.args.length; j++) {
          const a = op.args[j];
          if (typeof a === 'string' && replacements.has(a)) {
            op.args[j] = replacements.get(a);
          }
        }
      }

      // Schema-derived recursion. Specialization runs over every region
      // — including class methods, where _py helper calls inside method
      // bodies were missed by the legacy walker.
      forEachRegion(op, (_name, rops) => specialize(rops));

      // Look for call to a runtime helper method
      if (op.op !== 'call') continue;
      const calleeOp = findOpAnywhere(module.ops, op.args[0]);
      if (!calleeOp || calleeOp.op !== 'object_get') continue;

      const rtOp = findOpAnywhere(module.ops, calleeOp.args[0]);
      if (!rtOp || rtOp.op !== 'load') continue;

      const rtName = rtOp.args[0];
      const specs = getSpecializations(rtName);
      if (!specs) continue;

      const method = calleeOp.args[1];

      // --- Special: getattr on plain objects / typed arrays ---
      // _py.getattr(obj, "name") → obj.name when obj is provably a plain value.
      if (method === 'getattr' && op.args.length === 3) {
        const objId = op.args[1];
        const nameId = op.args[2];
        const nameOp = traceOp(nameId);
        if (nameOp && nameOp.op === 'const' && typeof nameOp.args[0] === 'string') {
          const attrName = nameOp.args[0];
          const objOp = traceOp(objId);
          // Plain object literal → direct dot access (no class dispatch needed)
          // EXCEPT for Python dict-protocol names: a literal {} has no native
          // .values/.keys/.items/.get/etc, so we must keep the helper call so
          // adderGetAttr's _objDictMethods dispatch kicks in.
          // Typed/plain array .length → direct (very common)
          const isPlainObject = objOp && objOp.op === 'object_new';
          const isDictMethodName = isPlainObject && _DICT_PROTOCOL_NAMES.has(attrName);
          const isArrayLength = (objOp?.op === 'array_new' || objOp?.op === 'ta_new') && attrName === 'length';
          if ((isPlainObject && !isDictMethodName) || isArrayLength) {
            op.op = 'object_get';
            op.args = [objId, attrName];
            op.type = isArrayLength ? I32 : DYNAMIC;
            types.set(op.id, op.type);
            changed = true;
            // Absorb trailing await if present
            const nextOp = ops[i + 1];
            if (nextOp && nextOp.op === 'await' && nextOp.args[0] === op.id) {
              nextOp.op = 'const';
              nextOp.args = [undefined];
              nextOp.type = VOID;
              types.set(nextOp.id, VOID);
              replacements.set(nextOp.id, op.id);
            }
            continue;
          }
        }
      }

      // --- Special: getitem specialization ---
      // Plain object literal + const string key → obj.key
      // Plain/typed array + const non-negative index → arr[idx]
      // (Skip the helper's negative-index/dict/dunder handling.)
      if (method === 'getitem' && op.args.length === 3) {
        const objId = op.args[1];
        const idxId = op.args[2];
        const objOp = traceOp(objId);
        const idxOp = traceOp(idxId);

        const isArray = objOp && (objOp.op === 'array_new' || objOp.op === 'ta_new');
        const isObject = objOp && objOp.op === 'object_new';
        const isNonNegNumConst = idxOp?.op === 'const' &&
                                  typeof idxOp.args[0] === 'number' && idxOp.args[0] >= 0;
        const isStringConst = idxOp?.op === 'const' && typeof idxOp.args[0] === 'string';

        let specialized = false;
        if (isArray && isNonNegNumConst) {
          op.op = 'array_get';
          op.args = [objId, idxId];
          op.type = objOp.op === 'ta_new' ? (taElementType(objOp.type) || DYNAMIC) : DYNAMIC;
          specialized = true;
        } else if (isObject && isStringConst) {
          // Dict-as-object: direct property access with string key
          op.op = 'object_get';
          op.args = [objId, idxOp.args[0]];
          op.type = DYNAMIC;
          specialized = true;
        }

        if (specialized) {
          types.set(op.id, op.type);
          changed = true;
          const nextOp = ops[i + 1];
          if (nextOp && nextOp.op === 'await' && nextOp.args[0] === op.id) {
            nextOp.op = 'const';
            nextOp.args = [undefined];
            nextOp.type = VOID;
            types.set(nextOp.id, VOID);
            replacements.set(nextOp.id, op.id);
          }
          continue;
        }
      }

      const spec = specs[method];
      if (!spec) continue;

      // Gather arg types
      const argIds = op.args.slice(1);
      const argTypes = argIds.map(id => types.get(id) || DYNAMIC);
      const arity = spec.arity ?? 2;
      if (argIds.length !== arity) continue;

      // Check if types qualify
      if (!spec.check(...argTypes)) continue;

      // Determine result type
      const resT = spec.resultType(...argTypes);

      // Passthrough: replace the call result with the single arg
      if (spec.passthrough) {
        replacements.set(op.id, argIds[0]);
        // Also replace the outer await if it directly wraps this call
        const nextOp = ops[i + 1];
        if (nextOp && nextOp.op === 'await' && nextOp.args[0] === op.id) {
          replacements.set(nextOp.id, argIds[0]);
        }
        continue;
      }

      // Custom emit (between = v >= lo && v <= hi)
      if (spec.customEmit && method === 'between') {
        const [v, lo, hi] = argIds;
        // Replace in-place with a logical_and wrapping two comparisons.
        // Approach: keep `op` but change it into a `logical_and` that
        // references two new compare ops we insert before it.
        const gteId = '%s' + op.id; // synthetic intermediate
        const lteId = '%s2' + op.id;
        // Rewrite op.op to 'logical_and' with args pointing to stable synthetic IDs.
        // We'll emit two new `ge` and `le` ops right before op in the array.
        const gteOp = { id: gteId, op: 'gte', args: [v, lo], type: BOOL, loc: op.loc };
        const lteOp = { id: lteId, op: 'lte', args: [v, hi], type: BOOL, loc: op.loc };
        ops.splice(i, 0, gteOp, lteOp);
        types.set(gteId, BOOL);
        types.set(lteId, BOOL);
        // Now op is at index i+2; rewrite it to logical_and
        const target = ops[i + 2];
        target.op = 'logical_and';
        target.args = [gteId, lteId];
        target.type = BOOL;
        types.set(target.id, BOOL);
        i += 2; // skip the inserted ops
        continue;
      }

      // Standard case: rewrite the call into a direct AIR op
      // Also absorb a trailing await if present (the op result is sync).
      op.op = spec.op;
      op.args = argIds;
      op.type = resT;
      types.set(op.id, resT);
      changed = true;
      // Fall through to async-absorb handling below
      const nextOp = ops[i + 1];
      if (nextOp && nextOp.op === 'await' && nextOp.args[0] === op.id) {
        // The await is now redundant (we produced a direct value, not a promise)
        replacements.set(nextOp.id, op.id);
        // Replace the await op with a no-op const — cleaner to just remove.
        // But removing shifts indices; instead, turn it into a load of the call result.
        // Simplest: change the await into a store-less pass-through.
        nextOp.op = 'const';  // harmless; DCE should remove
        nextOp.args = [undefined];
        nextOp.type = VOID;
        types.set(nextOp.id, VOID);
      }
    }
  }

  specialize(module.ops);
  return { replacements, changed };
}

// Alias to the schema-derived findOpById so older callers don't need an
// edit. Both used to differ in which regions they walked (findOpById
// missed switch cases; findOpAnywhere missed class members) — the
// schema-derived version is a superset of both and they now collapse
// to one implementation.
const findOpAnywhere = findOpById;

// =============================================================================
// Combined pass runner (v0.3 §3.5)
// =============================================================================
//
// PASSES is the declarative source-of-truth for what runs, in what order,
// and why. runPasses still hand-rolls the orchestration because the
// propagate ↔ specialize fixed-point is genuinely coupled (specialize
// rewrites IR shape, types may need re-propagation) — declarative
// orchestration would either lose that or special-case it back. The table
// exists for:
//
//   - Discoverability: `import { PASSES } from '@gcu/air'` lists every pass
//   - Documentation: each row carries requires/produces/iterates contract
//   - Future validation: tests assert table matches runPasses' behavior
//   - Future Phase 4: atra/Wasm backend can append its own pass schedule
//
// Each row:
//   name        — pass identifier
//   fn          — the pass function
//   iterates    — 'once' | 'fixed_point'
//   requires    — string[] of metadata entries this pass consumes
//   produces    — string[] of metadata entries this pass produces
//   invalidates — string[] of metadata entries other passes' output goes
//                 stale after this runs

const PASSES = [
  {
    name: 'propagateTypes',
    fn: propagateTypes,
    iterates: 'fixed_point',  // re-runs after specialize rewrites IR
    requires: [],             // optional: opts.importTypes
    produces: ['typeMap'],
    invalidates: [],
  },
  {
    name: 'foldConstants',
    fn: foldConstants,
    iterates: 'once',
    requires: [],
    produces: [],
    invalidates: [],
  },
  {
    name: 'specializeRuntimeHelpers',
    fn: specializeRuntimeHelpers,
    iterates: 'fixed_point',
    requires: ['typeMap'],
    produces: [],
    invalidates: ['typeMap'],  // rewrites IR; types may further refine
  },
  {
    name: 'insertHints',
    fn: insertHints,
    iterates: 'once',
    requires: ['typeMap'],
    produces: [],
    invalidates: [],
  },
  {
    name: 'extractDependencies',
    fn: extractDependencies,
    iterates: 'once',
    requires: [],
    produces: ['deps'],
    invalidates: [],
  },
];

function runPasses(module, opts = {}) {
  let typeMap = propagateTypes(module, opts);
  foldConstants(module);
  // Iterate specialize ↔ re-propagate until fixed point (typically 2-3 rounds).
  // Bounded by max_iterations to guard against pathological self-rewriting.
  for (let i = 0; i < 5; i++) {
    const { changed } = specializeRuntimeHelpers(module, typeMap);
    if (!changed) break;
    typeMap = propagateTypes(module, opts);
  }
  insertHints(module, typeMap);
  const deps = extractDependencies(module);
  return { typeMap, deps };
}

// -- emit-js.js --

// @gcu/air — JS emitter (Phase 2)
// Spec §9: AIR → optimized JavaScript
// Walks AIR ops and produces V8-friendly JS with type hints.




// =============================================================================
// Async detection
// =============================================================================

function needsAsync(module) {
  // Schema-derived. canBeAsync(op) consults OP_SCHEMA's `can_be_async`
  // flag; forEachRegion walks every region (incl. try/catch/finally,
  // switch cases, class members) — the legacy walker missed those, so
  // a try-block containing `await` in catch could compile under a sync
  // wrapper and fail at runtime. Conservative on call/call_method/new
  // matches the legacy intent: anything that calls user code may load/
  // install/fetch and want awaiting.
  function check(ops) {
    for (const op of ops) {
      if (canBeAsync(op)) return true;
      let found = false;
      forEachRegion(op, (_name, rops) => { if (!found && check(rops)) found = true; });
      if (found) return true;
    }
    return false;
  }
  return check(module.ops);
}

// =============================================================================
// Use counting — determines which SSA values become let bindings vs inline
// =============================================================================

// Schema-derived. The bespoke 50-line walker this replaces had to
// re-implement op-by-op knowledge of where SSA refs live (object_new pair
// records, switch case test_vals, phi then_val/else_val, class member
// computed keys, etc.). The schema's `forEachSsaRef` knows all that;
// `forEachRegion` handles every region/synthetic-region traversal. Adding
// a new op type is one schema row; this walker picks it up automatically.
function countUses(ops, counts) {
  for (const op of ops) {
    forEachSsaRef(op, (id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    forEachRegion(op, (_name, rops) => countUses(rops, counts));
  }
}

// =============================================================================
// Emit context
// =============================================================================

// Lexical scope for emitted name bindings. Each block-introducing emit
// (for/for-of/for-in/while/do-while/if/switch/try/labeled-block/function)
// pushes a fresh scope around its body; on exit, every name declared
// inside falls out of scope so a sibling region can re-`let` the same
// name. The cell's top-level (root) scope is not popped — exports live
// there and their `let` only needs to be emitted once.
//
// Backed by ScopeChain (v0.3 §3.3) — same shape, shared with lower/js.js
// findMutableCaptured.
class Scope {
  constructor(parent) {
    this._chain = parent ? parent._chain.push() : new ScopeChain();
    this.parent = parent;
  }
  has(name) {
    return this._chain.has(name);
  }
  declare(name) {
    this._chain.set(name, true);
  }
}

class EmitCtx {
  constructor(module, options) {
    this.module = module;
    this.hinted = options.hinted ?? true;
    this.cellId = options.cellId || '?';
    this.cellName = options.cellName || '';

    // Count uses of each SSA name
    this.useCounts = new Map();
    countUses(module.ops, this.useCounts);

    // SSA id → expression string (for inlining single-use values).
    //
    // Backed by ScopeChain (v0.3 §3.3): each region body pushes a fresh
    // frame, popped on exit. Single-use values registered inside a region
    // body are consumed within that region; cross-region reference would
    // resolve to a region-local `_N` JS binding and be a runtime error,
    // so the pop-time invariant warns under dev validator (see popScope).
    this.exprs = new ScopeChain();

    // SSA id → type
    this.types = new Map();

    // Tracks which multi-use SSA ids have been emitted as `let _N = …`
    // bindings. SSA ids are unique across the whole module so this set
    // is module-global — no scoping. Distinct from `scope.declared`
    // which tracks user-named bindings (i, raf, fy, etc).
    this.emitted = new Set();

    // Current lexical scope for named bindings.
    this.scope = new Scope(null);

    this.lines = [];
    this.indent = 0;

    // Loop-context stack for `continue` rewriting. Each entry is either:
    //   - a string label: `continue` should emit `break <label>;` (used by
    //     the for-loop fallback path where update must run before re-check)
    //   - null: `continue` should emit plain `continue;` (native JS loops
    //     handle continue correctly: while/do-while/for-in/for-of, plus
    //     the compact for-loop path)
    // pushLoop/popLoop are called by each loop emitter when entering and
    // leaving its body. The top of the stack is consulted by the 'continue'
    // case in emitOps.
    this.loopStack = [];
    this._forLabelCount = 0;
  }

  line(s) { this.lines.push('  '.repeat(this.indent) + s); }
  push() { this.indent++; }
  pop() { this.indent--; }

  pushLoop(contLabel) { this.loopStack.push(contLabel); }
  popLoop() { this.loopStack.pop(); }
  currentLoopCont() {
    return this.loopStack.length > 0
      ? this.loopStack[this.loopStack.length - 1]
      : null;
  }
  freshForLabel() { return `_forCont${++this._forLabelCount}`; }

  pushScope() {
    this.scope = new Scope(this.scope);
    this.exprs = this.exprs.push();
  }
  popScope() {
    if (!this.scope.parent) throw new Error('popScope: already at root');
    // Invariant: every entry in the popped frame should be consumed
    // (single-use, deleted by ref) or dead (countUses === 0). An
    // unconsumed live entry means the lowerer placed a use cross-region;
    // ref() outside this region would fall through to `_N` referring to
    // a never-emitted binding. We could throw, but that would block
    // lowering progress; instead warn under dev validator and best-effort
    // leave the entry visible to the parent frame so the consumer at
    // least gets the inline expression (not necessarily correctly scoped).
    if (typeof window !== 'undefined' && window._airValidate) {
      for (const [id, expr] of this.exprs.bindings) {
        const uses = this.useCounts.get(id) || 0;
        if (uses > 0) {
          console.warn(
            `[AIR] emit-js consume invariant: ${id} (uses=${uses}) unconsumed at scope pop. expr: ${String(expr).slice(0, 80)}`
          );
        }
      }
    }
    // Promote unconsumed live entries to the parent frame. This is the
    // best-effort recovery: the inline expression text references things
    // that may have been block-scoped, but at least ref() won't return a
    // stale `_N` for a never-emitted binding.
    for (const [id, expr] of this.exprs.bindings) {
      if (this.useCounts.get(id) > 0) this.exprs.parent.set(id, expr);
    }
    this.scope = this.scope.parent;
    this.exprs = this.exprs.pop();
  }

  // Resolve an SSA ref to an expression string.
  // Single-use values are inlined; multi-use values are variable names.
  ref(id) {
    if (!id) return 'undefined';
    if (typeof id !== 'string' || !id.startsWith('%')) return String(id);
    if (this.exprs.has(id)) {
      const uses = this.useCounts.get(id) || 0;
      if (uses <= 1) {
        // Inline: consume the expression (chain-aware delete walks up to
        // wherever the binding was registered).
        const expr = this.exprs.get(id);
        this.exprs.delete(id);
        return expr;
      }
    }
    // Multi-use: must be a let binding, return the variable name
    return this.varName(id);
  }

  varName(id) {
    return '_' + id.slice(1); // %0 → _0
  }

  // Apply V8 type hints to an expression.
  // Wrap the whole result in parens so precedence survives when inlined
  // into an outer expression: `((a+b) | 0)` instead of `(a+b) | 0`.
  hintExpr(expr, type) {
    if (!this.hinted || !type || isDynamic(type)) return expr;
    if (type.kind === 'i32' || type.kind === 'u32') return `((${expr}) | 0)`;
    if (type.kind === 'f32') return `Math.fround(${expr})`;
    return expr;
  }

  // Emit initialization value for a type (V8 initialization discipline)
  initLiteral(type) {
    if (!type || isDynamic(type)) return null;
    if (type.kind === 'f64') return '0.0';
    if (type.kind === 'f32') return 'Math.fround(0)';
    if (type.kind === 'i32' || type.kind === 'u32') return '0';
    return null;
  }
}

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Emit JavaScript code from an AIR module.
 * @param {object} module - AIR cell module (from lowerJS + runPasses)
 * @param {string[]} scopeKeys - upstream variable names (cell params)
 * @param {string[]} injectedNames - builtin names (ui, std, etc.)
 * @param {object} options - { hinted, cellId, cellName }
 * @returns {string} JS function body (to wrap in new Function/AsyncFunction)
 */
function emitJS(module, scopeKeys, injectedNames, options = {}) {
  const ctx = new EmitCtx(module, options);

  ctx.line('"use strict";');

  emitOps(ctx, module.ops);

  // Return exports
  const exports = [...module.defines].sort();
  if (exports.length) {
    ctx.line(`return { ${exports.join(', ')} };`);
  }

  // Source URL
  const slug = ctx.cellName
    ? '-' + ctx.cellName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    : '';
  ctx.line(`//# sourceURL=auditable://cell-${ctx.cellId}${slug}.js`);

  return ctx.lines.join('\n');
}

// =============================================================================
// Op emission
// =============================================================================

function emitOps(ctx, ops) {
  for (const op of ops) {
    emitOp(ctx, op);
  }
}

function emitOp(ctx, op) {
  switch (op.op) {
    case 'const': return emitConst(ctx, op);
    case 'null': return emitInline(ctx, op, 'null');
    case 'load': return emitLoad(ctx, op);
    case 'store': return emitStore(ctx, op);
    case 'slot_alloc': return emitSlotAlloc(ctx, op);
    case 'slot_load': return emitSlotLoad(ctx, op);
    case 'slot_store': return emitSlotStore(ctx, op);
    case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'exp':
      return emitBinary(ctx, op);
    case 'neg': return emitUnary(ctx, op, '-');
    case 'unary_plus': return emitUnary(ctx, op, '+');
    case 'logical_not': return emitUnary(ctx, op, '!');
    case 'bitwise_or': case 'bitwise_and': case 'bitwise_xor':
    case 'shift_left': case 'shift_right': case 'ushift_right':
      return emitBinary(ctx, op);
    case 'eq': case 'neq': case 'lt': case 'lte': case 'gt': case 'gte':
    case 'in': case 'instanceof':
      return emitBinary(ctx, op);
    case 'logical_and': case 'logical_or': case 'nullish_coalesce':
      return emitBinary(ctx, op);
    case 'object_get': return emitObjectGet(ctx, op);
    case 'object_set': return emitObjectSet(ctx, op);
    case 'array_get': return emitArrayGet(ctx, op);
    case 'array_set': return emitArraySet(ctx, op);
    case 'ta_new': return emitTaNew(ctx, op);
    case 'array_new': return emitArrayNew(ctx, op);
    case 'object_new': return emitObjectNew(ctx, op);
    case 'new': return emitNew(ctx, op);
    case 'call': return emitCall(ctx, op);
    case 'call_method': return emitCallMethod(ctx, op);
    case 'await': return emitAwait(ctx, op);
    case 'spread': return emitSpread(ctx, op);
    case 'typeof': return emitPrefixOp(ctx, op, 'typeof ');
    case 'void': return emitPrefixOp(ctx, op, 'void ');
    case 'delete': return emitPrefixOp(ctx, op, 'delete ');
    case 'bitwise_not': return emitUnary(ctx, op, '~');
    case 'import': return emitImport(ctx, op);
    case 'meta': register(ctx, op, `${op.args[0]}.${op.args[1]}`); return;
    case 'throw': { const v = ctx.ref(op.args[0]); ctx.line(`throw ${v};`); return; }
    case 'debugger': ctx.line('debugger;'); return;
    case 'return': return emitReturn(ctx, op);
    case 'break': ctx.line('break;'); return;
    case 'continue': {
      const lbl = ctx.currentLoopCont();
      ctx.line(lbl ? `break ${lbl};` : 'continue;');
      return;
    }
    case 'if_region': return emitIf(ctx, op);
    case 'for_region': return emitFor(ctx, op);
    case 'for_in_region': return emitForIn(ctx, op);
    case 'for_of_region': return emitForOf(ctx, op);
    case 'loop_region': return emitLoop(ctx, op);
    case 'switch_region': return emitSwitch(ctx, op);
    case 'try_region': return emitTry(ctx, op);
    case 'labeled': return emitLabeled(ctx, op);
    case 'func_region': return emitFunc(ctx, op);
    case 'class_region': return emitClass(ctx, op);
    case 'yield': {
      const v = op.args[0] ? ctx.ref(op.args[0]) : '';
      const expr = v ? `(yield ${v})` : '(yield)';
      const uses = ctx.useCounts.get(op.id) || 0;
      if (uses === 0) { ctx.line(`${expr};`); } else { register(ctx, op, expr); }
      return;
    }
    case 'yield_delegate': {
      const v = ctx.ref(op.args[0]);
      const uses = ctx.useCounts.get(op.id) || 0;
      if (uses === 0) { ctx.line(`(yield* ${v});`); } else { register(ctx, op, `(yield* ${v})`); }
      return;
    }
    case 'opaque': return emitOpaque(ctx, op);
    default: return;
  }
}

// --- Inline expression registration ---
// Some ops produce expressions that should be inlined into their consumer.
// We register them in ctx.exprs; when ref() is called, single-use values
// are inlined and multi-use values become let bindings.

const SIDE_EFFECTING = new Set([
  'call', 'call_method', 'await', 'new', 'import',
  'object_set', 'array_set', 'ta_set', 'delete',
]);

function register(ctx, op, expr) {
  const uses = ctx.useCounts.get(op.id) || 0;
  ctx.types.set(op.id, op.type);

  if (uses === 0) {
    if (SIDE_EFFECTING.has(op.op)) {
      // Side-effecting with zero uses: emit as statement
      ctx.line(`${expr};`);
    }
    // Non-side-effecting zero uses: dead value, skip
    ctx.exprs.set(op.id, expr);
    return;
  }

  if (uses === 1) {
    // Single use: inline — defer to ref() call
    ctx.exprs.set(op.id, expr);
    return;
  }

  // Multi-use: emit a let binding now
  ctx.line(`let ${ctx.varName(op.id)} = ${expr};`);
  ctx.emitted.add(op.id);
}

// --- Helpers: force-flush a value to a let binding if it hasn't been emitted ---

function flush(ctx, id) {
  if (!id || !id.startsWith('%')) return;
  if (ctx.emitted.has(id)) return;
  if (ctx.exprs.has(id)) {
    const expr = ctx.exprs.get(id);
    ctx.exprs.delete(id);
    ctx.line(`let ${ctx.varName(id)} = ${expr};`);
    ctx.emitted.add(id);
  }
}

// =============================================================================
// Op emitters
// =============================================================================

const OP_TO_JS = {
  'add': '+', 'sub': '-', 'mul': '*', 'div': '/', 'mod': '%', 'exp': '**',
  'eq': '===', 'neq': '!==', 'lt': '<', 'lte': '<=', 'gt': '>', 'gte': '>=',
  'in': 'in', 'instanceof': 'instanceof',
  'bitwise_or': '|', 'bitwise_and': '&', 'bitwise_xor': '^',
  'shift_left': '<<', 'shift_right': '>>', 'ushift_right': '>>>',
  'logical_and': '&&', 'logical_or': '||', 'nullish_coalesce': '??',
};

function emitConst(ctx, op) {
  const v = op.args[0];
  let expr;
  if (v === undefined) expr = 'undefined';
  else if (v === null) expr = 'null';
  else if (typeof v === 'string') expr = JSON.stringify(v);
  else if (typeof v === 'boolean') expr = String(v);
  else if (typeof v === 'number') {
    // V8 initialization discipline:
    // f64 zero → 0.0 (starts as Double, avoids Smi→Double transition)
    // f32 zero → Math.fround(0) (keeps f32 representation)
    // Everything else: plain number literal (V8 handles Smi fine)
    if (ctx.hinted && op.type?.kind === 'f64' && v === 0) expr = '0.0';
    else if (ctx.hinted && op.type?.kind === 'f64' && Number.isInteger(v)) expr = v + '.0';
    else if (ctx.hinted && op.type?.kind === 'f32' && v === 0) expr = 'Math.fround(0)';
    else expr = String(v);
  }
  else expr = String(v);
  register(ctx, op, expr);
}

function emitInline(ctx, op, expr) {
  register(ctx, op, expr);
}

function emitLoad(ctx, op) {
  const name = op.args[0];
  register(ctx, op, name);
}

function emitStore(ctx, op) {
  const name = op.args[0];
  const valId = op.args[1];
  const val = ctx.ref(valId);

  // First store of a name in the current scope chain emits a fresh
  // `let`; subsequent stores within the same scope emit a bare
  // assignment. Cell-export names (top-level defines) are stored in
  // the root scope and persist for the whole module — they get one
  // `let` and any further updates assign. Block-scoped names live in
  // an inner scope that's popped on exit, so siblings can re-`let`.
  if (ctx.scope.has(name)) {
    ctx.line(`${name} = ${val};`);
  } else {
    ctx.line(`let ${name} = ${val};`);
    ctx.scope.declare(name);
  }
}

function emitSlotAlloc(ctx, op) {
  const name = op.args[0];
  // Slots are mutable-captured variables — emit as let
  ctx.line(`let ${name};`);
  ctx.scope.declare(name);
  // Map the slot id so slot_load/slot_store can find the name
  ctx.exprs.set(op.id, name);
  ctx.types.set(op.id, op.type);
}

function emitSlotLoad(ctx, op) {
  const slotId = op.args[0];
  const name = ctx.exprs.get(slotId) || ctx.ref(slotId);
  register(ctx, op, name);
}

function emitSlotStore(ctx, op) {
  const slotId = op.args[0];
  const valId = op.args[1];
  const name = ctx.exprs.get(slotId) || ctx.ref(slotId);
  const val = ctx.ref(valId);
  ctx.line(`${name} = ${val};`);
}

function emitBinary(ctx, op) {
  const jsOp = OP_TO_JS[op.op];
  const lhs = ctx.ref(op.args[0]);
  const rhs = ctx.ref(op.args[1]);
  let expr = `(${lhs} ${jsOp} ${rhs})`;

  // V8 hints for typed results
  if (ctx.hinted && op.meta?.hint === 'typed') {
    expr = ctx.hintExpr(expr, op.type);
  }

  register(ctx, op, expr);
}

function emitUnary(ctx, op, jsOp) {
  const arg = ctx.ref(op.args[0]);
  register(ctx, op, `${jsOp}(${arg})`);
}

// Prefix keyword ops (typeof, void, delete) — parenthesized so
// member access on the result works: (typeof x).length, not typeof x.length
function emitPrefixOp(ctx, op, jsOp) {
  const arg = ctx.ref(op.args[0]);
  register(ctx, op, `(${jsOp}${arg})`);
}

function emitObjectGet(ctx, op) {
  const obj = ctx.ref(op.args[0]);
  const key = op.args[1]; // string key, not SSA ref
  const dot = op.optional ? '?.' : '.';
  register(ctx, op, `${obj}${dot}${key}`);
}

function emitObjectSet(ctx, op) {
  const obj = ctx.ref(op.args[0]);
  const key = op.args[1];
  const val = ctx.ref(op.args[2]);
  ctx.line(`${obj}.${key} = ${val};`);
}

function emitArrayGet(ctx, op) {
  const arr = ctx.ref(op.args[0]);
  const idx = ctx.ref(op.args[1]);
  // Only coerce the index to i32 when AIR has typed it as an integer.
  // Without the type guard, `obj[stringKey]` got wrapped as
  // `obj[(stringKey) | 0]` → `obj[0]` (since string|0 === 0), so any
  // dynamic property access with a string key silently returned undefined.
  const idxType = ctx.types.get(op.args[1]);
  const hintIdx = ctx.hinted && idxType && isInteger(idxType);
  const idxExpr = hintIdx ? `(${idx}) | 0` : idx;
  const bracket = op.optional ? '?.[' : '[';
  register(ctx, op, `${arr}${bracket}${idxExpr}]`);
}

function emitArraySet(ctx, op) {
  const arr = ctx.ref(op.args[0]);
  const idx = ctx.ref(op.args[1]);
  const val = ctx.ref(op.args[2]);
  ctx.line(`${arr}[${idx}] = ${val};`);
}

function emitTaNew(ctx, op) {
  const element = op.args[0]; // string: 'f64', 'i32', etc.
  const ctorMap = {
    'i8': 'Int8Array', 'u8': 'Uint8Array', 'i16': 'Int16Array', 'u16': 'Uint16Array',
    'i32': 'Int32Array', 'u32': 'Uint32Array', 'f32': 'Float32Array', 'f64': 'Float64Array',
    'i64': 'BigInt64Array', 'u64': 'BigUint64Array',
  };
  const ctor = ctorMap[element] || 'Float64Array';
  const args = op.args.slice(1).map(a => ctx.ref(a));
  register(ctx, op, `new ${ctor}(${args.join(', ')})`);
}

function emitArrayNew(ctx, op) {
  const elements = op.args.map(a => ctx.ref(a));
  register(ctx, op, `[${elements.join(', ')}]`);
}

function emitObjectNew(ctx, op) {
  const pairs = op.args; // array of { key, id } or { spread, id }
  const parts = pairs.map(p => {
    if (p.spread) return `...${ctx.ref(p.id)}`;
    return `${p.key}: ${ctx.ref(p.id)}`;
  });
  register(ctx, op, `{ ${parts.join(', ')} }`);
}

function emitCall(ctx, op) {
  let fn = ctx.ref(op.args[0]);
  // Wrap non-identifier fn expressions in parens so they call correctly:
  // `async () => {...}()` is invalid, `(async () => {...})()` is valid.
  if (!/^[$_a-zA-Z][\w$]*$/.test(fn) && !fn.startsWith('(')) {
    fn = `(${fn})`;
  }
  const args = op.args.slice(1).map(a => ctx.ref(a));
  const paren = op.optional ? '?.(' : '(';
  register(ctx, op, `${fn}${paren}${args.join(', ')})`);
}

function emitCallMethod(ctx, op) {
  const obj = ctx.ref(op.args[0]);
  const method = op.args[1]; // string
  const args = op.args.slice(2).map(a => ctx.ref(a));
  const dot = op.member_optional ? '?.' : '.';
  const paren = op.optional ? '?.(' : '(';
  register(ctx, op, `${obj}${dot}${method}${paren}${args.join(', ')})`);
}

function emitAwait(ctx, op) {
  const arg = ctx.ref(op.args[0]);
  // Parenthesize so member access on the result works correctly:
  // (await expr).prop, not await expr.prop
  register(ctx, op, `(await ${arg})`);
}

function emitSpread(ctx, op) {
  const arg = ctx.ref(op.args[0]);
  register(ctx, op, `...${arg}`);
}

function emitReturn(ctx, op) {
  const val = ctx.ref(op.args[0]);
  ctx.line(`return ${val};`);
}

// =============================================================================
// Regions
// =============================================================================

function emitIf(ctx, op) {
  const cond = ctx.ref(op.args[0]);
  const phi = op.phis && op.phis[0]; // expression-level if (ternary, bool op) has one phi
  let phiVar = null;
  if (phi) {
    // Declare phi variable before the if — value will be assigned in each branch
    phiVar = ctx.varName(op.id);
    ctx.line(`let ${phiVar};`);
  }
  ctx.line(`if (${cond}) {`);
  ctx.push();
  ctx.pushScope();
  if (op.then_body) emitOps(ctx, op.then_body);
  if (phi && phi.then_val) {
    const thenVal = ctx.ref(phi.then_val);
    ctx.line(`${phiVar} = ${thenVal};`);
  }
  ctx.popScope();
  ctx.pop();
  const hasElse = (op.else_body && op.else_body.length) || (phi && phi.else_val);
  if (hasElse) {
    ctx.line('} else {');
    ctx.push();
    ctx.pushScope();
    if (op.else_body) emitOps(ctx, op.else_body);
    if (phi && phi.else_val) {
      const elseVal = ctx.ref(phi.else_val);
      ctx.line(`${phiVar} = ${elseVal};`);
    }
    ctx.popScope();
    ctx.pop();
  }
  ctx.line('}');
  if (phi) {
    // Register phiVar as the expression for this op; mark as emitted
    ctx.exprs.set(op.id, phiVar);
    ctx.emitted.add(op.id);
    ctx.types.set(op.id, op.type);
  }
}

// Combine a sequence of single-statement lines into a comma-separated form
// suitable for a for-header init clause, e.g.
//   ['let i = 0;', 'let j = 0;'] -> 'let i = 0, j = 0'
// Returns null if the lines can't be safely combined (mixed declarators,
// non-trivial statements, multi-line expressions, etc.).
function combineForInit(lines) {
  if (lines.length === 0) return '';
  let kind = null;
  const parts = [];
  for (const line of lines) {
    const m = line.match(/^\s*(let|const|var)\s+(.+);\s*$/);
    if (!m) return null;
    if (kind === null) kind = m[1];
    else if (kind !== m[1]) return null;
    parts.push(m[2]);
  }
  return `${kind} ${parts.join(', ')}`;
}

// Combine simple assignment statements into a comma expression for the
// for-header update clause:
//   ['i = i + 1;', 'j = j + 4;'] -> 'i = i + 1, j = j + 4'
// Rejects anything that contains a declarator keyword or doesn't end with `;`.
function combineForUpdate(lines) {
  if (lines.length === 0) return '';
  const parts = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.endsWith(';')) return null;
    if (/^(let|const|var)\b/.test(t)) return null;
    parts.push(t.slice(0, -1).trim());
  }
  return parts.join(', ');
}

function emitFor(ctx, op) {
  // The whole loop is its own scope: init declarations + body-level lets
  // fall out on exit so a sibling `for (let i …)` (or for-of over the
  // same name) later in the cell starts fresh.
  ctx.pushScope();
  try {
    const captureLines = (fn) => {
      const saved = ctx.lines;
      ctx.lines = [];
      fn();
      const out = ctx.lines;
      ctx.lines = saved;
      return out;
    };

    const initLines = op.init && op.init.length
      ? captureLines(() => emitOps(ctx, op.init)) : [];

    let testExpr = '';
    const testLines = captureLines(() => {
      if (op.test) emitOps(ctx, op.test);
      if (op.test_val) testExpr = ctx.ref(op.test_val);
    });

    const updateLines = op.update && op.update.length
      ? captureLines(() => emitOps(ctx, op.update)) : [];

    const initStr = combineForInit(initLines);
    const updateStr = combineForUpdate(updateLines);
    const compact = initStr !== null && updateStr !== null && testLines.length === 0;

    if (compact) {
      ctx.line(`for (${initStr}; ${testExpr}; ${updateStr}) {`);
      ctx.push();
      ctx.pushLoop(null);  // native for: `continue;` works correctly
      if (op.body) emitOps(ctx, op.body);
      ctx.popLoop();
      ctx.pop();
      ctx.line('}');
      return;
    }

    // Fallback: desugar to `{ init; while (true) { test; <labeled-block>;
    // update } }`. The labeled block around the body lets `continue` inside
    // the body emit `break <label>;` — which exits only the inner block,
    // allowing `update` to run before the next iteration. Without the
    // label, a `continue` would skip the update entirely (causing an
    // infinite loop if the rest of the body depends on the update advancing).
    // The outer `break;` still works as expected: it targets the innermost
    // *loop*, which is the surrounding `while (true)`, terminating the for.
    const contLabel = ctx.freshForLabel();
    ctx.line('{');
    ctx.push();
    for (const l of initLines) ctx.lines.push(l);
    ctx.line('while (true) {');
    ctx.push();
    for (const l of testLines) ctx.lines.push(l);
    if (testExpr) ctx.line(`if (!(${testExpr})) break;`);
    ctx.line(`${contLabel}: {`);
    ctx.push();
    ctx.pushLoop(contLabel);
    if (op.body) emitOps(ctx, op.body);
    ctx.popLoop();
    ctx.pop();
    ctx.line('}');
    for (const l of updateLines) ctx.lines.push(l);
    ctx.pop();
    ctx.line('}');
    ctx.pop();
    ctx.line('}');
  } finally {
    ctx.popScope();
  }
}

function emitForIn(ctx, op) {
  const iter = ctx.ref(op.args[0]);
  ctx.line(`for (const _k in ${iter}) {`);
  ctx.push();
  ctx.pushScope();
  ctx.pushLoop(null);
  if (op.body) emitOps(ctx, op.body);
  ctx.popLoop();
  ctx.popScope();
  ctx.pop();
  ctx.line('}');
}

function emitForOf(ctx, op) {
  const iter = ctx.ref(op.args[0]);
  const target = op.target_name || '_v';
  // Loop variable is scoped to this loop unless it's a cell-export
  // (adder/Soft Python-style loop-var leak); in that case the outer
  // root scope already declares it, so `scope.has()` returns true and
  // we emit `for (target of …)` (no `let`), letting the loop assign
  // to the cell-level binding so the value persists past the loop.
  ctx.pushScope();
  try {
    let kind;
    if (ctx.scope.has(target)) {
      kind = '';
    } else {
      kind = 'let ';
      ctx.scope.declare(target);
    }
    ctx.line(`for (${kind}${target} of ${iter}) {`);
    ctx.push();
    ctx.pushLoop(null);
    if (op.body) emitOps(ctx, op.body);
    ctx.popLoop();
    ctx.pop();
    ctx.line('}');
  } finally {
    ctx.popScope();
  }
}

function emitLoop(ctx, op) {
  if (op.loop_kind === 'do_while') {
    ctx.line('do {');
    ctx.push();
    ctx.pushScope();
    ctx.pushLoop(null);
    if (op.body) emitOps(ctx, op.body);
    ctx.popLoop();
    ctx.popScope();
    ctx.pop();
    if (op.test) emitOps(ctx, op.test);
    const testExpr = op.test_val ? ctx.ref(op.test_val) : 'true';
    ctx.line(`} while (${testExpr});`);
  } else {
    // while loop
    ctx.line('while (true) {');
    ctx.push();
    ctx.pushScope();
    ctx.pushLoop(null);
    if (op.test) emitOps(ctx, op.test);
    if (op.test_val) {
      const testExpr = ctx.ref(op.test_val);
      ctx.line(`if (!(${testExpr})) break;`);
    }
    if (op.body) emitOps(ctx, op.body);
    ctx.popLoop();
    ctx.popScope();
    ctx.pop();
    ctx.line('}');
  }
}

// Body-level await check — does this op list contain an EXPLICIT `await`
// op? Used to promote `function*` to `async function*` (JS rejects await
// inside a sync generator). Conservative: only triggers on explicit
// awaits, not on every `can_be_async` op (calls are can_be_async too, but
// the lowerer's syncFunctions analysis means many calls aren't actually
// awaited — over-promoting here would turn every fib/fact recursion into
// a Promise-returning function and break sync callers).
//
// Doesn't recurse into nested func/class regions — they manage their own
// async-ness.
function _bodyHasAwait(body) {
  if (!body || !body.length) return false;
  for (const op of body) {
    if (op.op === 'await') return true;
    if (op.op === 'func_region' || op.op === 'class_region') continue;
    let found = false;
    forEachRegion(op, (_n, rops) => { if (!found && _bodyHasAwait(rops)) found = true; });
    if (found) return true;
  }
  return false;
}

// Python-style function-local hoisting: any name `store`d anywhere in the
// body (including inside if-branches, loops, try/finally, etc.) becomes a
// function-local binding. Pre-declare them all at function scope so an
// in-region store emits a bare assignment, matching Python semantics
// where `if x: y = 1; return y` doesn't NameError on the `return y` path.
// Intentional limitation: a read on a path that never assigned the local
// returns undefined, whereas CPython raises UnboundLocalError. This only
// diverges on *buggy* code (correct Python never reads an unassigned local);
// the alternative — per-path assignment guards that throw — would defeat the
// whole point of hoisting (the perf win for `if/else assigns both branches`
// patterns like richards' runTask). So we accept the undefined read.
//
// Names already declared by an `opaque(_markDeclared=N)` prologue line
// (adder's param/varargs unpacking) are skipped — those will emit their
// own `let N = …;` declaration, and JS forbids redeclaration of let.
//
// Walk skips into nested func_region / class_region — those have their
// own scope and their own hoist pass when they emit.
function _hoistFunctionLocals(ctx, body) {
  if (!body || !body.length) return;
  const stored = new Set();
  const prologueDeclared = new Set();
  const walk = (ops) => {
    for (const op of ops) {
      if (op.op === 'store' && typeof op.args[0] === 'string') stored.add(op.args[0]);
      if (op.op === 'opaque' && op._markDeclared) prologueDeclared.add(op._markDeclared);
      if (op.op === 'func_region' || op.op === 'class_region') continue;
      forEachRegion(op, (_n, rops) => walk(rops));
    }
  };
  walk(body);
  for (const name of stored) {
    if (prologueDeclared.has(name)) continue;
    if (ctx.scope.has(name)) continue;
    ctx.line(`let ${name};`);
    ctx.scope.declare(name);
  }
}

function emitFunc(ctx, op) {
  // Method func_regions are emitted by emitClassMember, not here
  if (op.is_method) return;

  const name = op.name || '';
  const params = (op.params || []).map(p => p.name).join(', ');
  // Sync generator functions can't use `await` in their body — JS rejects
  // `function* foo() { … await x … }` as a syntax error and requires
  // `async function*` instead. The adder lowerer marks `def gen` as
  // is_generator without is_async, but the lowered body may still emit
  // `await tuple(...)` etc. from runtime-helper calls. Promote to async
  // whenever the body contains any can_be_async op (calls, awaits, etc.)
  // so generator-with-helper-calls compiles.
  const needsAsyncBody = !op.is_async && _bodyHasAwait(op.body);
  const asyncPrefix = (op.is_async || needsAsyncBody) ? 'async ' : '';
  const star = op.is_generator ? '*' : '';

  // Check if this function is stored to a top-level name
  // If so, emit as function declaration or const assignment
  const uses = ctx.useCounts.get(op.id) || 0;

  // Emit as a real `function name(...) {}` declaration whenever the
  // source had a FunctionDeclaration — the binding is hoisted to the
  // enclosing block in JS, and callers reference the name directly.
  // Cell-export functions (top-level FunctionDeclarations) were always
  // handled this way; this branch now also covers nested function decls.
  const emitAsDecl = name && (ctx.module.defines.has(name) || op.is_decl);
  if (emitAsDecl) {
    ctx.line(`${asyncPrefix}function${star} ${name}(${params}) {`);
    ctx.push();
    // Function body is its own scope; pre-declare params so a `let p = …`
    // inside the body emits as `p = …` rather than re-declaring.
    ctx.pushScope();
    for (const p of (op.params || [])) ctx.scope.declare(p.name);
    _hoistFunctionLocals(ctx, op.body);
    if (op.body) emitOps(ctx, op.body);
    ctx.popScope();
    ctx.pop();
    ctx.line('}');
    // Register the function name in the enclosing scope so subsequent
    // stores don't re-declare it.
    ctx.scope.declare(name);
    ctx.exprs.set(op.id, name);
    ctx.types.set(op.id, op.type);
  } else {
    // Anonymous or non-top-level: register as expression
    const savedLines = ctx.lines;
    ctx.lines = [];
    ctx.push();
    ctx.pushScope();
    for (const p of (op.params || [])) ctx.scope.declare(p.name);
    _hoistFunctionLocals(ctx, op.body);
    if (op.body) emitOps(ctx, op.body);
    ctx.popScope();
    ctx.pop();
    const bodyLines = ctx.lines;
    ctx.lines = savedLines;

    const bodyStr = bodyLines.length
      ? '\n' + bodyLines.join('\n') + '\n' + '  '.repeat(ctx.indent)
      : '';

    if (name || op.is_generator) {
      register(ctx, op, `${asyncPrefix}function${star}${name ? ' ' + name : ''}(${params}) {${bodyStr}}`);
    } else {
      register(ctx, op, `${asyncPrefix}(${params}) => {${bodyStr}}`);
    }
  }
}

function emitNew(ctx, op) {
  const ctor = ctx.ref(op.args[0]);
  const args = op.args.slice(1).map(a => ctx.ref(a));
  register(ctx, op, `new ${ctor}(${args.join(', ')})`);
}

function emitImport(ctx, op) {
  const source = ctx.ref(op.args[0]);
  register(ctx, op, `import(${source})`);
}

function emitSwitch(ctx, op) {
  const disc = ctx.ref(op.args[0]);
  ctx.line(`switch (${disc}) {`);
  ctx.push();
  // Each case body is its own block scope so two cases declaring the
  // same name (`case 1: { let x = … } case 2: { let x = … }`) each get
  // their own `let`. Source-level cases that wrap their body in `{}`
  // already get scoping from the BlockStatement op, but the scope
  // pushed here also covers cases whose body is a flat statement list.
  for (const c of op.cases || []) {
    if (c.test_val) {
      if (c.test_ops) emitOps(ctx, c.test_ops);
      const test = ctx.ref(c.test_val);
      ctx.line(`case ${test}:`);
    } else {
      ctx.line('default:');
    }
    ctx.push();
    ctx.pushScope();
    emitOps(ctx, c.body);
    ctx.popScope();
    ctx.pop();
  }
  ctx.pop();
  ctx.line('}');
}

function emitTry(ctx, op) {
  // Each of try / catch / finally is its own block scope. The catch
  // parameter is pre-declared so a body-level `let e = …` would be
  // detected (and emit a fresh declaration in JS, matching semantics).
  ctx.line('try {');
  ctx.push();
  ctx.pushScope();
  if (op.try_body) emitOps(ctx, op.try_body);
  ctx.popScope();
  ctx.pop();
  if (op.catch_param != null || (op.catch_body && op.catch_body.length)) {
    const param = op.catch_param ? `(${op.catch_param})` : '';
    ctx.line(`} catch${param} {`);
    ctx.push();
    ctx.pushScope();
    if (op.catch_param) ctx.scope.declare(op.catch_param);
    if (op.catch_body) emitOps(ctx, op.catch_body);
    ctx.popScope();
    ctx.pop();
  }
  if (op.finally_body && op.finally_body.length) {
    ctx.line('} finally {');
    ctx.push();
    ctx.pushScope();
    emitOps(ctx, op.finally_body);
    ctx.popScope();
    ctx.pop();
  }
  ctx.line('}');
}

function emitLabeled(ctx, op) {
  const label = op.args[0];
  if (op.is_block) {
    ctx.line(`${label}: {`);
    ctx.push();
    ctx.pushScope();
    if (op.body) emitOps(ctx, op.body);
    ctx.popScope();
    ctx.pop();
    ctx.line('}');
  } else {
    ctx.line(`${label}:`);
    if (op.body) emitOps(ctx, op.body);
  }
}

function emitClass(ctx, op) {
  const name = op.name || '';
  const superClass = op.super_class ? ctx.ref(op.super_class) : null;
  const ext = superClass ? ` extends ${superClass}` : '';
  const isDecl = name && ctx.module.defines.has(name);

  // Emit class header
  if (isDecl) {
    ctx.line(`class ${name}${ext} {`);
  } else {
    // For class expressions, capture body into lines then wrap
    var savedForExpr = ctx.lines;
    ctx.lines = [];
  }

  if (!isDecl) ctx.line(`class${name ? ' ' + name : ''}${ext} {`);

  ctx.push();
  for (const m of (op.members || [])) {
    emitClassMember(ctx, m);
  }
  ctx.pop();
  ctx.line('}');

  if (isDecl) {
    ctx.scope.declare(name);
    ctx.exprs.set(op.id, name);
    ctx.types.set(op.id, op.type);
  } else {
    const classLines = ctx.lines;
    ctx.lines = savedForExpr;
    register(ctx, op, classLines.join('\n'));
  }
}

function emitClassMember(ctx, m) {
  if (m.kind === 'static_block') {
    ctx.line('static {');
    ctx.push();
    emitOps(ctx, m.body);
    ctx.pop();
    ctx.line('}');
    return;
  }

  const prefix = m.static ? 'static ' : '';
  const keyStr = m.computed ? `[${ctx.ref(m.computedKeyId)}]` :
                 typeof m.key === 'string' ? m.key : JSON.stringify(m.key);

  if (m.kind === 'field') {
    if (m.value) {
      const val = ctx.ref(m.value);
      ctx.line(`${prefix}${keyStr} = ${val};`);
    } else {
      ctx.line(`${prefix}${keyStr};`);
    }
    return;
  }

  // Method, constructor, getter, setter
  const fnOp = findOpInModule(ctx, m.value);
  const kindPrefix = m.kind === 'get' ? 'get ' : m.kind === 'set' ? 'set ' : '';
  const asyncPrefix = fnOp?.is_async ? 'async ' : '';
  const star = fnOp?.is_generator ? '*' : '';
  const params = fnOp ? (fnOp.params || []).map(p => p.name).join(', ') : '';

  ctx.line(`${prefix}${asyncPrefix}${kindPrefix}${star}${keyStr}(${params}) {`);
  ctx.push();
  if (fnOp?.body) emitOps(ctx, fnOp.body);
  ctx.pop();
  ctx.line('}');
}

function findOpInModule(ctx, id) {
  // Find a func_region op by its SSA id in the module
  function find(ops) {
    for (const op of ops) {
      if (op.id === id) return op;
      if (op.then_body) { const r = find(op.then_body); if (r) return r; }
      if (op.else_body) { const r = find(op.else_body); if (r) return r; }
      if (op.body) { const r = find(op.body); if (r) return r; }
      if (op.init) { const r = find(op.init); if (r) return r; }
      if (op.test) { const r = find(op.test); if (r) return r; }
      if (op.update) { const r = find(op.update); if (r) return r; }
      if (op.try_body) { const r = find(op.try_body); if (r) return r; }
      if (op.catch_body) { const r = find(op.catch_body); if (r) return r; }
      if (op.finally_body) { const r = find(op.finally_body); if (r) return r; }
    }
    return null;
  }
  return find(ctx.module.ops);
}

function emitOpaque(ctx, op) {
  // Opaque regions contain original source text — emit verbatim.
  // Distinguish statement-level (class, try/catch — zero uses) from
  // expression-level (instanceof, **, typeof — have consumers).
  const src = op.args[0] || '(void 0)';
  const uses = ctx.useCounts.get(op.id) || 0;
  // Side signal: mark a name as already declared in the current scope
  // (used by adder/Soft for `nonlocal` / `global` markers AND by adder's
  // function-param prologue where the raw line IS `let X = …;` and X
  // needs to be in scope for later stores). Always emit the line —
  // pure-marker uses produce harmless `/* nonlocal x */` comments.
  if (op._markDeclared) ctx.scope.declare(op._markDeclared);
  if (uses === 0) {
    ctx.line(src);
  } else {
    register(ctx, op, src);
  }
}

// -- interp.js --

// @gcu/air — AIR interpreter (tree-walker, v0)
//
// Walks AIR ops directly without going through emit-js + new Function().
// Use cases:
//   - Sanity-check the JS emitter (run cells through both, compare results)
//   - Foundation for a step debugger (pause at any op, inspect SSA values)
//   - CSP-locked browser builds (no eval, no Function constructor)
//   - Reference for AIR op semantics
//
// v0 scope:
//   - JS cells lowered via lower/js.js (pure JS host, no _py/_soft runtime)
//   - All standard control flow: if/for/while/loop/switch/try/labeled
//   - Functions, closures, methods (`this` binding from JS receiver)
//   - Logical operators (&&/||/??) — short-circuit correct via phi-select
//     lowering (JS lowerer commit 7229363) so emit-js and interp agree
//   - Async/await: every execOp is async, so awaits chain naturally
//   - Schema-driven dispatch via the same OP_SCHEMA the validator uses
//
// v0 NOT supported:
//   - opaque ops (CSP-friendly mode default; throws AirInterpError. Pass
//     options.allowOpaque=true to fall through to eval())
//   - yield / yield_delegate (generators)
//   - Class constructors with state (`new asyncFn()` returns a Promise,
//     not the instance — fix needs a sync/async dispatch split). Classes
//     without an explicit constructor or with default empty ones do work.
//   - Class instance fields (would need constructor wrapping)
//   - Arrow `this` binding — arrows currently see the call-site receiver
//     instead of lexical `this`. Most arrows don't reference `this`.
//   - Adder/Soft runtime (_py/_soft) — JS frontend only
//
// Performance: 6-1000× slower than emit-js depending on workload (see
// test/interp-perf.mjs). Tight arithmetic loops are worst-case; cells
// dominated by JS-native work (array methods, typed arrays) are closer
// to emit-js. Acceptable for tooling; not a production execution path.



class AirInterpError extends Error {
  constructor(message) { super(message); this.name = 'AirInterpError'; }
}

// Control-flow signals used to bubble up break / continue / return / throw
// without allocating exception traces. Plain classes so caller can
// instanceof-check.
class _ReturnSignal { constructor(value) { this.value = value; } }
class _BreakSignal { constructor(label) { this.label = label; } }
class _ContinueSignal { constructor(label) { this.label = label; } }

// Marker for a spread arg in array_new / call — wraps an iterable value
// that consumer ops should expand into their argument list.
class _SpreadValue { constructor(iter) { this.iter = iter; } }

const _TA_CTORS = {
  i8: Int8Array, u8: Uint8Array, i16: Int16Array, u16: Uint16Array,
  i32: Int32Array, u32: Uint32Array, f32: Float32Array, f64: Float64Array,
  i64: BigInt64Array, u64: BigUint64Array,
};

// Expand spread markers in an args array
function _expandArgs(values) {
  const out = [];
  for (const v of values) {
    if (v instanceof _SpreadValue) {
      for (const item of v.iter) out.push(item);
    } else {
      out.push(v);
    }
  }
  return out;
}

class Interpreter {
  /**
   * @param {object} module - AIR module (output of lowerJS + runPasses)
   * @param {object} [options]
   * @param {object} [options.scope] - upstream cell-scope values (name → value)
   * @param {object} [options.globals] - ambient globals (Math, console, etc.)
   * @param {boolean} [options.allowOpaque] - if true, eval() opaque ops
   *   (defeats CSP-friendliness; only enable in trusted-script contexts)
   */
  constructor(module, options = {}) {
    this.module = module;
    // SSA id → JS value
    this.values = new Map();
    // Lexical scope: name → value
    this.scope = new ScopeChain();
    // Ambient host globals
    this.globals = options.globals || _defaultGlobals();
    this.allowOpaque = !!options.allowOpaque;

    // Seed scope with input bindings (cell imports)
    for (const [k, v] of Object.entries(options.scope || {})) {
      this.scope.set(k, v);
    }

    // Pre-compute slot SSA-id → variable-name mapping. Slot ops use the
    // slot_alloc's SSA id as their args[0]; the actual variable name is
    // in slot_alloc's args[0]. emit-js keeps this mapping in ctx.exprs;
    // the interpreter precomputes it so closures (which capture lexical
    // scope, not per-invocation SSA values) can resolve slot names.
    this.slotNames = new Map();
    this._collectSlotNames(module.ops);
  }

  _collectSlotNames(ops) {
    for (const op of ops) {
      if (op.op === 'slot_alloc' && op.id) {
        this.slotNames.set(op.id, op.args[0]);
      }
      forEachRegion(op, (_n, rops) => this._collectSlotNames(rops));
    }
  }

  async run() {
    return await this.execOps(this.module.ops);
  }

  /**
   * Execute a sequence of ops, returning the last value. Records each
   * op's result in `this.values` for downstream `ref()` lookups.
   */
  async execOps(ops) {
    let last;
    for (const op of ops) {
      const v = await this.execOp(op);
      if (op.id) this.values.set(op.id, v);
      last = v;
    }
    return last;
  }

  // SSA id → value lookup
  ref(id) {
    if (id == null) return undefined;
    return this.values.get(id);
  }

  async execOp(op) {
    const args = op.args;
    switch (op.op) {
      // ── Constants & loads ────────────────────────────────────────────
      case 'const': return args[0];
      case 'null':  return null;
      case 'load': {
        const name = args[0];
        if (this.scope.has(name)) return this.scope.get(name);
        if (Object.prototype.hasOwnProperty.call(this.globals, name)) return this.globals[name];
        // Fall through to ambient JS globals (Math, JSON, etc.)
        if (typeof globalThis !== 'undefined' && name in globalThis) return globalThis[name];
        return undefined;
      }
      case 'store': {
        // Reassign the existing binding wherever it lives in the chain,
        // or declare a new binding in the current frame. Mirrors emit-js's
        // "let X = …" (first sight) vs "X = …" (already in scope) split.
        this.scope.setOrExisting(args[0], this.ref(args[1]));
        return undefined;
      }
      case 'meta': {
        // import.meta.X / new.target — best-effort; tests rarely hit
        const root = (typeof globalThis !== 'undefined' && globalThis[args[0]]) || {};
        return root[args[1]];
      }

      // ── Slot allocation (closure cells for mutable captures) ─────────
      // emit-js renders these as bare `let name;` — a regular JS variable
      // closures naturally capture. We mirror that: slots are scope
      // bindings keyed by name. The slot_alloc op's args[0] IS the name;
      // slot_load/slot_store receive the slot_alloc's SSA id (not a name)
      // and we resolve via the precomputed slotNames map.
      case 'slot_alloc': {
        this.scope.set(args[0], undefined);
        return args[0];  // op's value is the variable name
      }
      case 'slot_load': {
        const name = this.slotNames.get(args[0]);
        return name != null ? this.scope.get(name) : undefined;
      }
      case 'slot_store': {
        const name = this.slotNames.get(args[0]);
        if (name != null) {
          // setOrExisting walks up to update the binding wherever it
          // was declared (outer scope where slot_alloc happened), so
          // closures' mutations are visible to the outer scope.
          this.scope.setOrExisting(name, this.ref(args[1]));
        }
        return undefined;
      }

      // ── Arithmetic ───────────────────────────────────────────────────
      case 'add': return this.ref(args[0]) + this.ref(args[1]);
      case 'sub': return this.ref(args[0]) - this.ref(args[1]);
      case 'mul': return this.ref(args[0]) * this.ref(args[1]);
      case 'div': return this.ref(args[0]) / this.ref(args[1]);
      case 'mod': return this.ref(args[0]) % this.ref(args[1]);
      case 'exp': return this.ref(args[0]) ** this.ref(args[1]);
      case 'neg': return -this.ref(args[0]);
      case 'unary_plus': return +this.ref(args[0]);

      // ── Comparison ───────────────────────────────────────────────────
      case 'eq':  return this.ref(args[0]) === this.ref(args[1]);
      case 'neq': return this.ref(args[0]) !== this.ref(args[1]);
      case 'lt':  return this.ref(args[0]) <  this.ref(args[1]);
      case 'lte': return this.ref(args[0]) <= this.ref(args[1]);
      case 'gt':  return this.ref(args[0]) >  this.ref(args[1]);
      case 'gte': return this.ref(args[0]) >= this.ref(args[1]);
      case 'in':         return this.ref(args[0]) in this.ref(args[1]);
      case 'instanceof': return this.ref(args[0]) instanceof this.ref(args[1]);

      // ── Bitwise ──────────────────────────────────────────────────────
      case 'bitwise_or':   return this.ref(args[0])  | this.ref(args[1]);
      case 'bitwise_and':  return this.ref(args[0])  & this.ref(args[1]);
      case 'bitwise_xor':  return this.ref(args[0])  ^ this.ref(args[1]);
      case 'shift_left':   return this.ref(args[0]) << this.ref(args[1]);
      case 'shift_right':  return this.ref(args[0]) >> this.ref(args[1]);
      case 'ushift_right': return this.ref(args[0]) >>> this.ref(args[1]);
      case 'bitwise_not':  return ~this.ref(args[0]);

      // ── Logical (see top-of-file note about short-circuit divergence) ─
      case 'logical_and':       return this.ref(args[0]) && this.ref(args[1]);
      case 'logical_or':        return this.ref(args[0]) || this.ref(args[1]);
      case 'nullish_coalesce':  return this.ref(args[0]) ?? this.ref(args[1]);
      case 'logical_not':       return !this.ref(args[0]);

      // ── Unary ────────────────────────────────────────────────────────
      case 'typeof': return typeof this.ref(args[0]);
      case 'void':   return void this.ref(args[0]);
      case 'delete': return true;  // best-effort; rarely meaningful in cells

      // ── Member access ────────────────────────────────────────────────
      case 'object_get': {
        const obj = this.ref(args[0]);
        if (op.optional && (obj == null)) return undefined;
        return obj?.[args[1]];
      }
      case 'object_set': {
        const obj = this.ref(args[0]);
        obj[args[1]] = this.ref(args[2]);
        return undefined;
      }
      case 'array_get': {
        const obj = this.ref(args[0]);
        const idx = this.ref(args[1]);
        if (op.optional && (obj == null)) return undefined;
        return obj?.[idx];
      }
      case 'array_set': {
        const obj = this.ref(args[0]);
        const idx = this.ref(args[1]);
        obj[idx] = this.ref(args[2]);
        return undefined;
      }

      // ── Construction ─────────────────────────────────────────────────
      case 'array_new': {
        const elements = args.map(id => this.ref(id));
        return _expandArgs(elements);
      }
      case 'object_new': {
        const obj = {};
        for (const pair of args) {
          if (pair && pair.spread) Object.assign(obj, this.ref(pair.id));
          else if (pair) obj[pair.key] = this.ref(pair.id);
        }
        return obj;
      }
      case 'ta_new': {
        const ctor = _TA_CTORS[args[0]];
        if (!ctor) throw new AirInterpError(`unknown typed-array kind: ${args[0]}`);
        const ctorArgs = _expandArgs(args.slice(1).map(id => this.ref(id)));
        return new ctor(...ctorArgs);
      }
      case 'new': {
        const ctor = this.ref(args[0]);
        const ctorArgs = _expandArgs(args.slice(1).map(id => this.ref(id)));
        return new ctor(...ctorArgs);
      }

      // ── Calls ────────────────────────────────────────────────────────
      case 'call': {
        const fn = this.ref(args[0]);
        if (typeof fn !== 'function') {
          throw new TypeError(`interp: callee is not a function (got ${typeof fn})`);
        }
        const callArgs = _expandArgs(args.slice(1).map(id => this.ref(id)));
        return await fn(...callArgs);
      }
      case 'call_method': {
        const obj = this.ref(args[0]);
        const method = args[1];
        const callArgs = _expandArgs(args.slice(2).map(id => this.ref(id)));
        if (op.optional && (obj == null)) return undefined;
        const fn = obj[method];
        if (typeof fn !== 'function') {
          throw new TypeError(`interp: ${method} is not a method of ${typeof obj}`);
        }
        return await fn.apply(obj, callArgs);
      }
      case 'await':  return await this.ref(args[0]);
      case 'spread': return new _SpreadValue(this.ref(args[0]));
      case 'import': return import(this.ref(args[0]));

      // ── Statements (control-flow signals) ─────────────────────────────
      case 'throw':    throw this.ref(args[0]);
      case 'debugger': return undefined;  // no-op
      case 'return':   throw new _ReturnSignal(args.length ? this.ref(args[0]) : undefined);
      case 'break':    throw new _BreakSignal(args[0] || null);
      case 'continue': throw new _ContinueSignal(args[0] || null);
      case 'yield':
      case 'yield_delegate':
        throw new AirInterpError('interp v0: yield/generators not supported');

      // ── Region ops ───────────────────────────────────────────────────
      case 'if_region': {
        const cond = this.ref(args[0]);
        const branch = cond ? op.then_body : op.else_body;
        if (branch && branch.length) await this.execOps(branch);
        // Phi: select value from the taken branch
        if (op.phis && op.phis.length) {
          const phi = op.phis[0];
          if (cond) return phi.then_val ? this.ref(phi.then_val) : undefined;
          return phi.else_val ? this.ref(phi.else_val) : undefined;
        }
        return undefined;
      }

      case 'for_region': {
        this.scope = this.scope.push();
        try {
          if (op.init) await this.execOps(op.init);
          while (true) {
            if (op.test) await this.execOps(op.test);
            const cond = op.test_val ? this.ref(op.test_val) : true;
            if (!cond) break;
            try {
              if (op.body) await this.execOps(op.body);
            } catch (e) {
              if (e instanceof _BreakSignal) return undefined;
              if (!(e instanceof _ContinueSignal)) throw e;
            }
            if (op.update) await this.execOps(op.update);
          }
          return undefined;
        } finally {
          this.scope = this.scope.pop();
        }
      }

      case 'for_of_region': {
        const iter = this.ref(args[0]);
        if (iter == null) return undefined;
        this.scope = this.scope.push();
        try {
          for (const item of iter) {
            if (op.target_name) this.scope.set(op.target_name, item);
            try {
              if (op.body) await this.execOps(op.body);
            } catch (e) {
              if (e instanceof _BreakSignal) return undefined;
              if (e instanceof _ContinueSignal) continue;
              throw e;
            }
          }
          return undefined;
        } finally {
          this.scope = this.scope.pop();
        }
      }

      case 'for_in_region': {
        const iter = this.ref(args[0]);
        if (iter == null) return undefined;
        this.scope = this.scope.push();
        try {
          for (const key in iter) {
            if (op.target_name) this.scope.set(op.target_name, key);
            try {
              if (op.body) await this.execOps(op.body);
            } catch (e) {
              if (e instanceof _BreakSignal) return undefined;
              if (e instanceof _ContinueSignal) continue;
              throw e;
            }
          }
          return undefined;
        } finally {
          this.scope = this.scope.pop();
        }
      }

      case 'loop_region': {
        const isDoWhile = op.loop_kind === 'do_while';
        this.scope = this.scope.push();
        try {
          while (true) {
            if (!isDoWhile) {
              if (op.test) await this.execOps(op.test);
              const cond = op.test_val ? this.ref(op.test_val) : true;
              if (!cond) break;
            }
            try {
              if (op.body) await this.execOps(op.body);
            } catch (e) {
              if (e instanceof _BreakSignal) return undefined;
              if (!(e instanceof _ContinueSignal)) throw e;
            }
            if (isDoWhile) {
              if (op.test) await this.execOps(op.test);
              const cond = op.test_val ? this.ref(op.test_val) : true;
              if (!cond) break;
            }
            if (op.update) await this.execOps(op.update);
          }
          return undefined;
        } finally {
          this.scope = this.scope.pop();
        }
      }

      case 'switch_region': {
        const disc = this.ref(args[0]);
        this.scope = this.scope.push();
        try {
          let matched = false;
          for (const c of op.cases || []) {
            if (!matched) {
              if (c.test_val == null) {
                matched = true;  // default
              } else {
                if (c.test_ops) await this.execOps(c.test_ops);
                if (disc === this.ref(c.test_val)) matched = true;
              }
            }
            if (matched) {
              try {
                if (c.body) await this.execOps(c.body);
              } catch (e) {
                if (e instanceof _BreakSignal) return undefined;
                throw e;
              }
            }
          }
          return undefined;
        } finally {
          this.scope = this.scope.pop();
        }
      }

      case 'try_region': {
        let caughtError = null;
        let caught = false;
        try {
          if (op.try_body) await this.execOps(op.try_body);
        } catch (e) {
          // Control-flow signals propagate through (after finally runs)
          if (e instanceof _ReturnSignal || e instanceof _BreakSignal ||
              e instanceof _ContinueSignal) {
            if (op.finally_body) await this.execOps(op.finally_body);
            throw e;
          }
          caughtError = e;
          caught = true;
        }
        if (caught && op.catch_body) {
          this.scope = this.scope.push();
          if (op.catch_param) this.scope.set(op.catch_param, caughtError);
          try {
            await this.execOps(op.catch_body);
          } catch (e2) {
            if (op.finally_body) await this.execOps(op.finally_body);
            throw e2;
          } finally {
            this.scope = this.scope.pop();
          }
        } else if (caught) {
          // No catch — rethrow after finally
          if (op.finally_body) await this.execOps(op.finally_body);
          throw caughtError;
        }
        if (op.finally_body) await this.execOps(op.finally_body);
        return undefined;
      }

      case 'labeled': {
        const label = args[0];
        try {
          if (op.body) await this.execOps(op.body);
        } catch (e) {
          if (e instanceof _BreakSignal && e.label === label) return undefined;
          if (e instanceof _ContinueSignal && e.label === label) return undefined;
          throw e;
        }
        return undefined;
      }

      case 'func_region': {
        const params = op.params || [];
        const body = op.body || [];
        const capturedScope = this.scope;
        const interp = this;
        // `function` (not arrow) so `this` binds to the JS receiver at
        // call time. Methods invoked via call_method get the correct
        // `obj` here; constructors via `new` get the new instance;
        // free calls get undefined (strict mode). NOTE: arrow functions
        // SHOULD inherit `this` from the lexical scope, but the IR
        // doesn't currently distinguish arrow vs declaration via
        // is_arrow. v0 limitation; arrows that reference `this` in
        // their body will see the call-site receiver instead.
        const fn = async function fn(...callArgs) {
          // Each invocation needs its own SSA-value frame: ssa ids are
          // module-global in the IR, but the same body's ops are
          // re-entered across recursive calls. Without this, fib(10)'s
          // %5 would be clobbered by fib(9)'s %5 and recursion returns
          // the wrong value.
          const savedScope = interp.scope;
          const savedValues = interp.values;
          interp.scope = capturedScope.push();
          interp.values = new Map();
          // Bind `this` from the JS receiver. Methods on prototypes get
          // the right `this` because call_method does fn.apply(obj, args).
          interp.scope.set('this', this);
          // Bind parameters
          for (let i = 0; i < params.length; i++) {
            const p = params[i];
            const name = (typeof p === 'string') ? p : p?.name;
            if (name && name.startsWith('...')) {
              interp.scope.set(name.slice(3), callArgs.slice(i));
              break;
            }
            if (name) interp.scope.set(name, callArgs[i]);
          }
          try {
            await interp.execOps(body);
            return undefined;
          } catch (e) {
            if (e instanceof _ReturnSignal) return e.value;
            throw e;
          } finally {
            interp.scope = savedScope;
            interp.values = savedValues;
          }
        };
        // Function declaration form: also store in current scope by name
        if (op.is_decl && op.name) this.scope.set(op.name, fn);
        return fn;
      }

      case 'class_region': {
        const name = op.name || null;
        const superClass = op.super_class ? this.ref(op.super_class)
                         : op.superclass  ? this.ref(op.superclass)
                         : null;
        const cls = superClass ? class extends superClass {} : class {};
        if (name) Object.defineProperty(cls, 'name', { value: name });

        for (const m of (op.members || [])) {
          const target = m.static ? cls : cls.prototype;
          const key = m.computedKeyId ? this.ref(m.computedKeyId) : m.key;
          if (m.kind === 'method' || m.kind === 'constructor') {
            const fn = this.ref(m.value);
            target[key] = fn;
          } else if (m.kind === 'get' || m.kind === 'set') {
            const fn = this.ref(m.value);
            const desc = Object.getOwnPropertyDescriptor(target, key) ||
                         { configurable: true, enumerable: false };
            if (m.kind === 'get') desc.get = fn;
            else desc.set = fn;
            Object.defineProperty(target, key, desc);
          } else if (m.kind === 'field') {
            // Static field: assign now. Instance fields would need
            // constructor wrapping — deferred.
            if (m.static) cls[key] = m.value ? this.ref(m.value) : undefined;
          }
        }
        if (name) this.scope.set(name, cls);
        return cls;
      }

      // ── Special / opaque ─────────────────────────────────────────────
      case 'opaque': {
        if (this.allowOpaque) {
          // Eval the source string in the current scope. Defeats CSP-friendliness;
          // only enabled when caller opts in. Used for tooling that wants to
          // run arbitrary cells outside the JS emit path.
          const src = String(args[0] || '');
          // eslint-disable-next-line no-eval
          return (0, eval)(src);
        }
        throw new AirInterpError(
          `opaque op encountered (CSP-friendly mode); enable options.allowOpaque to eval. source: ${
            String(args[0] || '').slice(0, 60)}`
        );
      }

      default:
        throw new AirInterpError(`unknown op '${op.op}'`);
    }
  }
}

/**
 * Convenience: create an interpreter, run, return result.
 */
async function interpret(module, options) {
  return new Interpreter(module, options).run();
}

// Default ambient globals — common JS host names that cells reference.
function _defaultGlobals() {
  const g = {};
  if (typeof globalThis === 'undefined') return g;
  // Just a permissive default — interpreter falls through to globalThis
  // anyway in `load`. This is more for the explicit override.
  return g;
}

// -- api.js --

// @gcu/air — Public API
// Clean interface matching existing parseNames/findUses output shapes








// ── Lowerer registry ───────────────────────────────────────────────
// Languages other than JS register themselves here. AIR self-registers
// 'js' below in the browser-init block. Each registered lowerer is a
// function (ast, sourceCode) => airModule (or throws).

const _lowerers = new Map();

/**
 * Register a lowerer for a language. AIR doesn't ship knowledge of any
 * language other than JS; frontends like @gcu/adder and @gcu/soft register
 * their own lowerers here at module init time.
 *
 * @param {string} language - language identifier (e.g. 'adder', 'soft')
 * @param {(ast: object, sourceCode: string) => object} lowerFn - ast + source → AIR module
 */
function registerLowerer(language, lowerFn) {
  if (typeof language !== 'string' || !language) {
    throw new Error('registerLowerer: language must be a non-empty string');
  }
  if (typeof lowerFn !== 'function') {
    throw new Error('registerLowerer: lowerFn must be a function');
  }
  if (_lowerers.has(language)) {
    if (typeof console !== 'undefined') {
      console.warn(`[air] lowerer for "${language}" already registered, replacing`);
    }
  }
  _lowerers.set(language, lowerFn);
}

/**
 * Look up a registered lowerer by language. Returns null if not registered.
 */
function getLowerer(language) {
  return _lowerers.get(language) || null;
}

/**
 * Lower an AST through the registered lowerer for a language. Returns null
 * if no lowerer is registered or if the lowerer throws (debug-logged).
 */
function lower(language, ast, sourceCode) {
  const fn = _lowerers.get(language);
  if (!fn) return null;
  try { return fn(ast, sourceCode); }
  catch (e) {
    if (_airDebug) console.warn(`[air] lower(${language}) failed:`, e.message);
    return null;
  }
}

// Debug logging — true during development, settable via window._airDebug
let _airDebug = (typeof window !== 'undefined') ? (window._airDebug ?? true) : false;

// JS_GLOBALS: ambient names that should not be treated as module imports
// (global intrinsics, browser globals, common environment provisions).
const JS_GLOBALS = new Set([
  'Math', 'console', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'NaN', 'Infinity',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'fetch', 'Response', 'Request', 'Headers', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'FormData',
  'Int8Array', 'Uint8Array', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'SharedArrayBuffer',
  'DataView', 'TextEncoder', 'TextDecoder',
  'WebAssembly', 'Atomics',
  'document', 'window', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage', 'indexedDB',
  'crypto', 'performance', 'queueMicrotask',
  'structuredClone', 'atob', 'btoa',
  'CompressionStream', 'DecompressionStream',
  'Worker', 'MessageChannel', 'MessagePort', 'BroadcastChannel',
  'AbortController', 'AbortSignal',
  'EventSource', 'WebSocket',
  'Image', 'CanvasRenderingContext2D', 'OffscreenCanvas',
  'globalThis', 'self', 'this',
  'arguments',
]);

// Single source of truth for parser options. Downstream tooling (bundlers,
// formatters) that asks AIR for an AST gets byte ranges + source positions
// for free.
const DEFAULT_PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  locations: true,
  ranges: true,
};

// Lazily-created parser instance. Set at browser init (from window.Acorn) or
// on first parseModule() call that provides a parser factory.
let _cachedParser = null;

function _getDefaultParser() {
  if (_cachedParser) return _cachedParser;
  if (typeof window !== 'undefined' && window.Acorn) {
    const { Parser, tsPlugin } = window.Acorn;
    _cachedParser = Parser.extend(tsPlugin());
    return _cachedParser;
  }
  return null;
}

/**
 * Parse a JS/TS module into an ESTree AST with AIR's default options
 * (module source type, locations and ranges enabled). Single source of truth
 * for parser configuration — downstream tooling should call this rather than
 * reinventing the option set.
 *
 * @param {string} code - module source code
 * @param {object} [parser] - Acorn parser instance. Optional in browser
 *   contexts where window.Acorn is available; required otherwise.
 * @returns {object} ESTree Program node
 */
function parseModule(code, parser) {
  const p = parser || _getDefaultParser();
  if (!p) throw new Error('parseModule: no parser available. Pass one explicitly, or ensure window.Acorn is loaded in the browser.');
  return p.parse(code, DEFAULT_PARSE_OPTIONS);
}

/**
 * Analyze a JS/TS module: parse, lower to AIR, run passes, extract defines/uses.
 * Returns { defines, uses, air, ast } on success, or null if parsing/lowering fails.
 *
 * @param {string} code - module source code
 * @param {object} [parser] - Acorn parser instance; optional in browser
 * @param {Set<string>} [allDefined] - if provided, restricts `uses` to names defined
 *   elsewhere in a set of sibling modules (used by Auditable's cell-scope model).
 *   Pass null/undefined for "any free name is a use."
 * @returns {{ defines: Set<string>, uses: Set<string>, air: object, ast: object } | null}
 */
function analyzeModule(code, parser, allDefined) {
  try {
    const ast = parseModule(code, parser);
    const module = lowerJS(ast, code);
    runPasses(module);

    const defines = module.defines;

    // Filter imports to a "uses" set. When allDefined is provided we only count
    // names that appear in it (Auditable's cell-scope semantics); when not,
    // we count every free name that isn't a JS global.
    //
    // Names in `defines` are excluded: a cell's local declarations don't
    // need an upstream value, and including them would wire the local
    // name as a function parameter — colliding with the cell's own
    // declaration ("Identifier X has already been declared" at compile
    // time). Bare assignment `x = ...` in JS is NOT a declaration (only
    // const/let/var is), so cross-cell re-binds aren't affected by this
    // exclusion — they aren't in this cell's `defines` to begin with.
    //
    // This also covers the self-referencing closure case where
    // `const lb = term.lineBuffer({ onSubmit: (line) => lb.prompt() })`
    // would otherwise see `lb` as a free reference inside the inner
    // arrow function (the lowerer hasn't recorded `lb` in symbols yet
    // by the time it walks the init expression).
    const uses = new Set();
    for (const name of module.imports) {
      if (JS_GLOBALS.has(name)) continue;
      if (defines.has(name)) continue;
      if (!allDefined || allDefined.has(name)) uses.add(name);
    }

    return { defines, uses, air: module, ast };
  } catch (e) {
    if (_airDebug) console.warn('[AIR] analyze fallback:', e.message);
    return null;
  }
}

/**
 * Back-compat alias. Prefer `analyzeModule` in new code.
 * @deprecated since 0.2.0 — use analyzeModule
 */
const analyzeCell = analyzeModule;

/**
 * Extract defines only (for cases where we just need the names).
 * Lighter than full analyzeModule — no passes, no use filtering.
 */
function extractDefines(code, parser) {
  try {
    const ast = parseModule(code, parser);
    const module = lowerJS(ast, code);
    return module.defines;
  } catch (e) {
    if (_airDebug) console.warn('[AIR] extractDefines fallback:', e.message);
    return null;
  }
}

/**
 * Extract structured import declarations from an AST. Returns an array of
 * descriptors — consumers (bundler, reactive DAG) decide how to handle each kind.
 *
 *   { kind: 'named',       source, specifiers: [{ imported, local }] }
 *   { kind: 'namespace',   source, local }
 *   { kind: 'default',     source, local }
 *   { kind: 'side-effect', source }
 *
 * For `import defaultExport, { foo } from './x'` both a 'default' and a 'named'
 * descriptor are emitted (one per role) so consumers don't miss either piece.
 *
 * @param {object} ast - ESTree Program node (from parseModule)
 * @returns {Array<object>}
 */
function extractImports(ast) {
  const out = [];
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const source = node.source.value;
    if (node.specifiers.length === 0) { out.push({ kind: 'side-effect', source }); continue; }

    const named = [];
    for (const spec of node.specifiers) {
      switch (spec.type) {
        case 'ImportNamespaceSpecifier':
          out.push({ kind: 'namespace', source, local: spec.local.name });
          break;
        case 'ImportDefaultSpecifier':
          out.push({ kind: 'default', source, local: spec.local.name });
          break;
        case 'ImportSpecifier':
          named.push({
            imported: spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value,
            local: spec.local.name,
          });
          break;
      }
    }
    if (named.length > 0) out.push({ kind: 'named', source, specifiers: named });
  }
  return out;
}

/**
 * Extract structured export declarations from an AST. Returns an array of:
 *
 *   { kind: 'named',             specifiers: [{ local, exported }] }
 *   { kind: 'reexport-named',    source, specifiers: [{ local, exported }] }
 *   { kind: 'reexport-wildcard', source, exported }  // exported is the `as ns` name, or null
 *   { kind: 'declaration',       declaration: <ESTree node> }  // export const/let/function/class
 *   { kind: 'default',           declaration: <ESTree node> }
 *
 * @param {object} ast - ESTree Program node (from parseModule)
 * @returns {Array<object>}
 */
function extractExports(ast) {
  const out = [];
  for (const node of ast.body) {
    switch (node.type) {
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          out.push({ kind: 'declaration', declaration: node.declaration });
        } else if (node.source) {
          out.push({
            kind: 'reexport-named',
            source: node.source.value,
            specifiers: node.specifiers.map(s => ({
              local: s.local.type === 'Identifier' ? s.local.name : s.local.value,
              exported: s.exported.type === 'Identifier' ? s.exported.name : s.exported.value,
            })),
          });
        } else {
          out.push({
            kind: 'named',
            specifiers: node.specifiers.map(s => ({
              local: s.local.type === 'Identifier' ? s.local.name : s.local.value,
              exported: s.exported.type === 'Identifier' ? s.exported.name : s.exported.value,
            })),
          });
        }
        break;
      case 'ExportAllDeclaration':
        out.push({
          kind: 'reexport-wildcard',
          source: node.source.value,
          exported: node.exported ? (node.exported.type === 'Identifier' ? node.exported.name : node.exported.value) : null,
        });
        break;
      case 'ExportDefaultDeclaration':
        out.push({ kind: 'default', declaration: node.declaration });
        break;
    }
  }
  return out;
}

/**
 * Get export types for a module (for fine-grained change detection).
 */
function extractExportTypes(module) {
  if (!module) return null;
  const types = new Map();
  for (const [name, exp] of module.exports) {
    types.set(name, exp.type);
  }
  return types;
}





// --- Browser init: register AIR on window ---
// When loaded in the browser with Acorn available, create the parser
// and set window._air for dag.js and exec.js to pick up.

if (typeof window !== 'undefined' && window.Acorn) {
  // Seed the cached parser; parseModule() and analyzeModule() both see it
  // via _getDefaultParser() when no parser is passed explicitly.
  const { Parser, tsPlugin } = window.Acorn;
  _cachedParser = Parser.extend(tsPlugin());
  window._airAnalyzer = function(code, allDefined) {
    return analyzeModule(code, _cachedParser, allDefined);
  };
  // Phase 2: emitter functions for exec.js
  window._airEmit = emitJS;
  window._airNeedsAsync = needsAsync;

  // v0.3 §3.2: dev-mode validator. URL flag `?airdebug=1` flips it on so
  // notebook authors hit IR-shape bugs at fail-fast time instead of mystery
  // emit-time output. Off by default in production.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('airdebug') === '1') window._airValidate = true;
  } catch { /* file:// or other non-URL contexts — ignore */ }
  window._airValidateModule = validateModule;
  window._airPrettyPrint = prettyPrint;
  // Schema introspection — used by the example_air_ir notebook + any
  // tooling that wants to enumerate op types at runtime.
  window._airOpSchema = OP_SCHEMA;

  // Specialization registry hooks. Frontend bundles (adder, soft) have
  // their imports stripped at build time, so they fall back to these
  // window globals to register their helper-call specializations.
  window._airRegisterSpecializations = registerSpecializations;
  window._airGetSpecializations = getSpecializations;

  // AIR interpreter (v0). Tree-walks AIR ops directly without eval.
  // Mostly useful for tooling: sanity-check the JS emitter, foundation
  // for a future step debugger, CSP-locked builds.
  window._airInterpret = interpret;
  window._airInterpreter = Interpreter;

  // Lowerer registry — frontends register their own lowerers here.
  window._airRegisterLowerer = registerLowerer;
  window._airGetLowerer = function(language) {
    const fn = _lowerers.get(language);
    if (!fn) return null;
    // Wrap to match the legacy adder/soft signature: returns { air, defines } | null,
    // catches errors marked `_airFallback: true` (lowerer's own "this construct
    // is not supported, fall back to the tree-walker" signal). Other errors
    // propagate so real bugs surface instead of being silently swallowed.
    return function(ast, code) {
      try {
        const air = fn(ast, code);
        runPasses(air);
        // v0.3 §3.2: opt-in validator. window._airValidate flips on under
        // ?airdebug=1; tests call validateModule directly. Wraps a real
        // bug as a clear "AIR shape mismatch" error instead of a mystery
        // emit-time exception or silent miscompile.
        if (typeof window !== 'undefined' && window._airValidate) {
          validateOrThrow(air, prettyPrint);
        }
        // v0.3 fold-in: coverage stats. Cheap single walk; lets debug
        // panels report "21/26 ops on AIR fast path, 3 opaque, 8 dyn".
        air._airStats = computeStats(air);
        return { air, defines: air.defines };
      } catch (e) {
        if (e && e._airFallback) return null;
        throw e;
      }
    };
  };

  // AIR self-registers its reference frontend. Other languages (adder, soft,
  // future patra/etc.) live in their own packages and call registerLowerer
  // from their own init.
  registerLowerer('js', lowerJS);

  // Re-run passes on an existing AIR module with given import types.
  // Used by Auditable for cross-cell type flow: the upstream module's export
  // types seed the downstream module's imports. Returns true if anything changed.
  window._airRePropagate = function(air, opts) {
    try {
      runPasses(air, opts || {});
      return true;
    } catch (e) {
      return false;
    }
  };
}

// -- bundle exports (generated) --

export {
  AirInterpError,
  AirLowerError,
  AirParseError,
  AirValidationError,
  BOOL,
  BaseLowerCtx,
  DYNAMIC,
  F32,
  F64,
  I16,
  I32,
  I64,
  I8,
  Interpreter,
  OP_SCHEMA,
  PASSES,
  PROMOTE_RANK,
  STRING,
  ScopeChain,
  TS_TYPE_MAP,
  TYPE_WIDTH,
  U16,
  U32,
  U64,
  U8,
  VOID,
  _isSsaId,
  analyzeCell,
  analyzeModule,
  arithmeticResult,
  array,
  binaryResultType,
  bitwiseResult,
  canBeAsync,
  captureOps,
  comparisonResult,
  computeStats,
  eliminateDeadCode,
  emitJS,
  emitPhiSelect,
  extractDefines,
  extractDependencies,
  extractExportTypes,
  extractExports,
  extractImports,
  foldConstants,
  forEachRegion,
  forEachSsaRef,
  func,
  getLowerer,
  getSchema,
  getSpecializations,
  insertHints,
  interpret,
  introducesScope,
  isConcrete,
  isDynamic,
  isFloat,
  isInteger,
  isNumeric,
  isSideEffecting,
  isSigned,
  lower,
  lowerIfRegion,
  lowerJS,
  lowerLoopRegion,
  makeIdGen,
  mkOp,
  needsAsync,
  object,
  parseModule,
  parseText,
  prettyPrint,
  propagateTypes,
  registerLowerer,
  registerSpecializations,
  requiredExtras,
  resolveAnnotation,
  runPasses,
  specializeRuntimeHelpers,
  typeEq,
  typedArray,
  validateModule,
  validateOrThrow,
};

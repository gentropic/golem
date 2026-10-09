// ⚠ VENDORED — DO NOT EDIT. @gcu/atra (the atra compiler, atra source to Wasm; used by natra), copied from ../auditable/ext/atra/index.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: ext/atra/src/  Build: node ext/atra/build.js
// @auditable/atra — Arithmetic TRAnspiler
// Fortran/Pascal hybrid → WebAssembly bytecode. Single-file compiler.

// -- highlight.js --

// Syntax highlighting — tokenizer + completions for auditable editor integration
//
// These keyword/type/builtin sets define the language's vocabulary. They're shared
// between this module (editor highlighting + completions) and lex.js (compiler tokenizer).

const ATRA_KEYWORDS = new Set([
  'function','subroutine','begin','end','var','const','if','then','else',
  'for','while','do','break','and','or','not','mod','import','export',
  'call','array','true','false','from','tailcall','return',
  'layout','packed','memory','case','of',
]);

const ATRA_TYPES = new Set(['i32','i64','f32','f64','f64x2','f32x4','i32x4','i64x2']);

const ATRA_BUILTINS = new Set([
  'sin','cos','sqrt','abs','floor','ceil','ln','exp','pow',
  'min','max','trunc','nearest','copysign','select',
  'clz','ctz','popcnt','rotl','rotr','memory_size','memory_grow',
  'memory_copy','memory_fill',
]);

const ATRA_VECTOR_TYPES = new Set(['f64x2','f32x4','i32x4','i64x2']);

function tokenizeAtra(code) {
  const tokens = [];
  let i = 0;
  const len = code.length;

  while (i < len) {
    // line comment: ! to end of line
    if (code[i] === '!') {
      const start = i;
      while (i < len && code[i] !== '\n') i++;
      tokens.push({ type: 'cmt', text: code.slice(start, i) });
      continue;
    }
    // numbers (with optional type suffix _f32, _f64, _i32, _i64)
    if (/\d/.test(code[i]) || (code[i] === '.' && i + 1 < len && /\d/.test(code[i + 1]))) {
      const start = i;
      // hex literal: 0x or 0X
      if (code[i] === '0' && i + 1 < len && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        i += 2;
        while (i < len && /[0-9a-fA-F]/.test(code[i])) i++;
        if (code[i] === '_' && i + 3 <= len && /^[fi]/.test(code[i + 1])) {
          const suf = code.slice(i + 1, i + 4);
          if (ATRA_TYPES.has(suf)) i += 4;
        }
        tokens.push({ type: 'num', text: code.slice(start, i) });
        continue;
      }
      while (i < len && /[0-9.]/.test(code[i])) i++;
      if (i < len && /[eE]/.test(code[i])) {
        i++;
        if (i < len && /[+-]/.test(code[i])) i++;
        while (i < len && /\d/.test(code[i])) i++;
      }
      // type suffix: _f32, _f64, _i32, _i64
      if (code[i] === '_' && i + 3 <= len && /^[fi]/.test(code[i + 1])) {
        const suf = code.slice(i + 1, i + 4);
        if (ATRA_TYPES.has(suf)) i += 4;
      }
      tokens.push({ type: 'num', text: code.slice(start, i) });
      continue;
    }
    // character literal: 'A', '\n'
    if (code[i] === "'") {
      const start = i;
      i++; // skip opening quote
      if (i < len && code[i] === '\\') { i++; if (i < len) i++; }
      else if (i < len) i++;
      if (i < len && code[i] === "'") i++; // skip closing quote
      tokens.push({ type: 'num', text: code.slice(start, i) });
      continue;
    }
    // string literal: "hello"
    if (code[i] === '"') {
      const start = i;
      i++; // skip opening quote
      while (i < len && code[i] !== '"') {
        if (code[i] === '\\') { i++; if (i < len) i++; }
        else i++;
      }
      if (i < len) i++; // skip closing quote
      tokens.push({ type: 'str', text: code.slice(start, i) });
      continue;
    }
    // identifiers / keywords
    if (/[a-zA-Z_]/.test(code[i])) {
      const start = i;
      while (i < len && /[\w.]/.test(code[i])) i++;
      const word = code.slice(start, i);
      const lower = word.toLowerCase();
      if (ATRA_KEYWORDS.has(lower) || lower === 'data') {
        tokens.push({ type: 'kw', text: word });
      } else if (ATRA_TYPES.has(lower)) {
        // type names as builtins when followed by (
        if (i < len && code[i] === '(') {
          tokens.push({ type: 'fn', text: word });
        } else {
          tokens.push({ type: 'const', text: word });
        }
      } else if (ATRA_BUILTINS.has(lower) || lower.startsWith('wasm.') ||
                 lower.startsWith('v128.') || (ATRA_VECTOR_TYPES.has(lower.split('.')[0]) && lower.includes('.'))) {
        tokens.push({ type: 'fn', text: word });
      } else if (i < len && code[i] === '(') {
        tokens.push({ type: 'fn', text: word });
      } else {
        tokens.push({ type: 'id', text: word });
      }
      continue;
    }
    // multi-char operators
    if (i + 1 < len) {
      const two = code[i] + code[i + 1];
      if (two === '**' || two === ':=' || two === '+=' || two === '-=' ||
          two === '*=' || two === '/=' || two === '==' || two === '<=' ||
          two === '>=' || two === '<<' || two === '>>') {
        tokens.push({ type: 'op', text: two });
        i += 2;
        continue;
      }
    }
    // single-char operators
    if ('+-*/<>=&|^~@'.includes(code[i])) {
      tokens.push({ type: 'op', text: code[i] });
      i++;
      continue;
    }
    // punctuation
    if ('()[];,:'.includes(code[i])) {
      tokens.push({ type: 'punc', text: code[i] });
      i++;
      continue;
    }
    // whitespace / other
    tokens.push({ type: '', text: code[i] });
    i++;
  }
  return tokens;
}

// ── Builtin signatures ──

const ATRA_BUILTIN_SIGS = {
  sin:      { sig: 'sin(x: f64): f64', desc: 'sine' },
  cos:      { sig: 'cos(x: f64): f64', desc: 'cosine' },
  sqrt:     { sig: 'sqrt(x: f64): f64', desc: 'square root' },
  abs:      { sig: 'abs(x: f64): f64', desc: 'absolute value' },
  floor:    { sig: 'floor(x: f64): f64', desc: 'round down' },
  ceil:     { sig: 'ceil(x: f64): f64', desc: 'round up' },
  ln:       { sig: 'ln(x: f64): f64', desc: 'natural logarithm' },
  exp:      { sig: 'exp(x: f64): f64', desc: 'exponential' },
  pow:      { sig: 'pow(base: f64, exp: f64): f64', desc: 'power' },
  min:      { sig: 'min(a: f64, b: f64): f64', desc: 'minimum' },
  max:      { sig: 'max(a: f64, b: f64): f64', desc: 'maximum' },
  trunc:    { sig: 'trunc(x: f64): f64', desc: 'truncate toward zero' },
  nearest:  { sig: 'nearest(x: f64): f64', desc: 'round to nearest' },
  copysign: { sig: 'copysign(x: f64, y: f64): f64', desc: 'copy sign of y to x' },
  select:   { sig: 'select(a: f64, b: f64, c: i32): f64', desc: 'if c then a else b' },
  clz:      { sig: 'clz(x: i32): i32', desc: 'count leading zeros' },
  ctz:      { sig: 'ctz(x: i32): i32', desc: 'count trailing zeros' },
  popcnt:   { sig: 'popcnt(x: i32): i32', desc: 'population count' },
  rotl:     { sig: 'rotl(x: i32, y: i32): i32', desc: 'rotate left' },
  rotr:     { sig: 'rotr(x: i32, y: i32): i32', desc: 'rotate right' },
  memory_size: { sig: 'memory_size([bank]): i32', desc: 'current memory size in pages' },
  memory_grow: { sig: 'memory_grow([bank,] pages: i32): i32', desc: 'grow memory' },
  memory_copy: { sig: 'memory_copy([dst_bank, src_bank,] dst: i32, src: i32, len: i32)', desc: 'copy memory' },
  memory_fill: { sig: 'memory_fill([bank,] dst: i32, val: i32, len: i32)', desc: 'fill memory' },
};

// ── User-defined name extraction ──

const NAMING_KW = new Set(['var', 'const', 'function', 'subroutine', 'import']);
const STMT_STARTERS = new Set(['begin', 'end', 'then', 'else', 'do', 'of']);
const EXPR_KEYWORDS = new Set(['and', 'or', 'not', 'mod', 'true', 'false', 'array', 'call', 'tailcall']);

function extractAtraNames(code) {
  const tokens = tokenizeAtra(code);
  const functions = [];
  const variables = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'kw') continue;
    const kw = t.text.toLowerCase();

    if (kw === 'function' || kw === 'subroutine' || kw === 'import') {
      // next non-ws should be the name
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === '') j++;
      if (j >= tokens.length || (tokens[j].type !== 'fn' && tokens[j].type !== 'id')) continue;
      const name = tokens[j].text;

      // find opening paren
      let k = j + 1;
      while (k < tokens.length && tokens[k].type === '') k++;
      if (k >= tokens.length || tokens[k].text !== '(') {
        if (kw !== 'import') functions.push({ name, sig: name + '()', desc: kw });
        continue;
      }

      // collect params text
      let paramText = '';
      let depth = 1;
      k++;
      while (k < tokens.length && depth > 0) {
        if (tokens[k].text === '(') depth++;
        else if (tokens[k].text === ')') { depth--; if (depth === 0) break; }
        paramText += tokens[k].text;
        k++;
      }

      // check for return type: ) : TYPE
      let retType = '';
      let m = k + 1;
      while (m < tokens.length && tokens[m].type === '') m++;
      if (m < tokens.length && tokens[m].text === ':') {
        m++;
        while (m < tokens.length && tokens[m].type === '') m++;
        if (m < tokens.length && (tokens[m].type === 'const' || tokens[m].type === 'id')) {
          retType = tokens[m].text;
        }
      }

      const sig = retType ? `${name}(${paramText.trim()}): ${retType}` : `${name}(${paramText.trim()})`;
      functions.push({ name, sig, desc: kw });
      continue;
    }

    if (kw === 'var' || kw === 'const') {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === '') j++;
      if (j < tokens.length && (tokens[j].type === 'id' || tokens[j].type === 'fn')) {
        variables.push({ name: tokens[j].text, kind: kw });
      }
    }
  }

  return { functions, variables };
}

// ── Signature hints ──

function atraSigHint(code, cursor) {
  const tokens = tokenizeAtra(code.slice(0, cursor));

  // compute token offsets
  const offsets = [];
  let pos = 0;
  for (const t of tokens) {
    offsets.push(pos);
    pos += t.text.length;
  }

  // scan backwards for unmatched (
  let depth = 0;
  let parenIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === 'punc') {
      if (tokens[i].text === ')') depth++;
      else if (tokens[i].text === '(') {
        if (depth === 0) { parenIdx = i; break; }
        depth--;
      }
    }
  }
  if (parenIdx < 0) return null;

  // find function name before the (
  let fnIdx = -1;
  for (let i = parenIdx - 1; i >= 0; i--) {
    if (tokens[i].type === '') continue;
    if (tokens[i].type === 'fn' || tokens[i].type === 'id') fnIdx = i;
    break;
  }
  if (fnIdx < 0) return null;

  const fnName = tokens[fnIdx].text.toLowerCase();

  // look up signature
  let sig, desc;
  if (ATRA_BUILTIN_SIGS[fnName]) {
    sig = ATRA_BUILTIN_SIGS[fnName].sig;
    desc = ATRA_BUILTIN_SIGS[fnName].desc;
  } else {
    const names = extractAtraNames(code);
    const fn = names.functions.find(f => f.name.toLowerCase() === fnName);
    if (!fn) return null;
    sig = fn.sig;
    desc = fn.desc || '';
  }

  // count commas at depth 0 for paramIdx
  let paramIdx = 0;
  let d = 0;
  for (let i = parenIdx + 1; i < tokens.length; i++) {
    if (tokens[i].type === 'punc') {
      if (tokens[i].text === '(' || tokens[i].text === '[') d++;
      else if (tokens[i].text === ')' || tokens[i].text === ']') d--;
      else if (tokens[i].text === ',' && d === 0) paramIdx++;
    }
  }

  return { sig, desc, paramIdx, parenPos: offsets[parenIdx] };
}

// ── Layout name/field extraction for completions ──

function extractLayoutNames(code) {
  const tokens = tokenizeAtra(code);
  const names = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'kw' && tokens[i].text.toLowerCase() === 'layout') {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === '') j++;
      // skip optional 'packed'
      if (j < tokens.length && tokens[j].type === 'kw' && tokens[j].text.toLowerCase() === 'packed') {
        j++;
        while (j < tokens.length && tokens[j].type === '') j++;
      }
      if (j < tokens.length && tokens[j].type === 'id') {
        names.push(tokens[j].text);
      }
    }
  }
  return names;
}

function extractLayoutFields(code, layoutName) {
  const tokens = tokenizeAtra(code);
  const fields = [];
  let inLayout = false;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'kw' && tokens[i].text.toLowerCase() === 'layout') {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === '') j++;
      if (j < tokens.length && tokens[j].type === 'kw' && tokens[j].text.toLowerCase() === 'packed') {
        j++;
        while (j < tokens.length && tokens[j].type === '') j++;
      }
      if (j < tokens.length && tokens[j].text === layoutName) {
        inLayout = true;
        i = j;
        continue;
      }
    }
    if (inLayout) {
      if (tokens[i].type === 'kw' && tokens[i].text.toLowerCase() === 'end') {
        break;
      }
      if (tokens[i].type === 'id') fields.push(tokens[i].text);
    }
  }
  return fields;
}

// ── Context-aware completions ──

function atraCompletions(code, cursor, prefix) {
  // backward compat: old callers may pass just (prefix) or nothing
  if (cursor === undefined) {
    const items = [];
    for (const w of ATRA_KEYWORDS) items.push({ text: w, kind: 'kw' });
    for (const w of ATRA_TYPES)    items.push({ text: w, kind: 'const' });
    for (const w of ATRA_BUILTINS) items.push({ text: w, kind: 'fn' });
    return items;
  }

  const beforePrefix = code.slice(0, cursor - prefix.length);
  const tokens = tokenizeAtra(beforePrefix);

  // determine context from last meaningful token
  let context = 'statement';
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.type === '') {
      if (t.text === '\n') break; // newline → statement start
      continue;
    }
    if (t.type === 'punc' && t.text === ':') { context = 'type'; break; }
    if (t.type === 'kw' && NAMING_KW.has(t.text.toLowerCase())) { context = 'naming'; break; }
    if (t.type === 'kw' && STMT_STARTERS.has(t.text.toLowerCase())) break; // statement start
    context = 'expression';
    break;
  }

  if (context === 'naming') return [];
  if (context === 'type') {
    const items = Array.from(ATRA_TYPES).map(w => ({ text: w, kind: 'const' }));
    items.push({ text: 'layout', kind: 'kw' });
    const layoutNames = extractLayoutNames(code);
    for (const n of layoutNames) items.push({ text: n, kind: 'const' });
    return items;
  }

  // Layout field completions: prefix is "LayoutName." → offer field names + __size, __align
  if (prefix.includes('.')) {
    const dotIdx = prefix.lastIndexOf('.');
    const base = prefix.slice(0, dotIdx);
    const layoutNames = extractLayoutNames(code);
    if (layoutNames.includes(base)) {
      const fields = extractLayoutFields(code, base);
      return [
        ...fields.map(f => ({ text: base + '.' + f, kind: 'var' })),
        { text: base + '.__size', kind: 'const' },
        { text: base + '.__align', kind: 'const' },
      ];
    }
  }

  const items = [];
  const { functions, variables } = extractAtraNames(code);

  if (context === 'statement') {
    for (const w of ATRA_KEYWORDS) items.push({ text: w, kind: 'kw' });
    for (const w of ATRA_TYPES)    items.push({ text: w, kind: 'const' });
  } else {
    for (const w of EXPR_KEYWORDS) items.push({ text: w, kind: 'kw' });
    for (const w of ATRA_TYPES)    items.push({ text: w, kind: 'const' });
  }

  for (const w of ATRA_BUILTINS) items.push({ text: w, kind: 'fn' });
  for (const f of functions) items.push({ text: f.name, kind: 'fn' });
  for (const v of variables) items.push({ text: v.name, kind: 'var' });

  // Add layout names to expression/statement completions
  const layoutNames = extractLayoutNames(code);
  for (const n of layoutNames) items.push({ text: n, kind: 'const' });

  return items;
}

// -- lex.js --

// Lexer — tokenizer for the parser
//
// Atra's lexical design borrows from Fortran: ! for line comments, /= for not-equal,
// semicolons as whitespace (optional statement separators). Identifiers can contain dots
// for namespace-style access (e.g. physics.gravity), treated as a single token.


const TOK = {
  NUM: 'num', STR: 'str', ID: 'id', KW: 'kw', OP: 'op', PUNC: 'punc', EOF: 'eof',
};

function lex(source) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  const len = source.length;

  function adv() { if (source[i] === '\n') { line++; col = 1; } else { col++; } i++; }
  function peek() { return i < len ? source[i] : ''; }
  function peek2() { return i + 1 < len ? source[i] + source[i + 1] : source[i] || ''; }

  while (i < len) {
    // skip whitespace and semicolons
    if (' \t\r\n;'.includes(source[i])) { adv(); continue; }
    // comment
    if (source[i] === '!') {
      while (i < len && source[i] !== '\n') adv();
      continue;
    }
    const tl = line, tc = col;
    // number
    if (/\d/.test(source[i]) || (source[i] === '.' && i + 1 < len && /\d/.test(source[i + 1]))) {
      const start = i;
      let isFloat = false;
      // hex literal: 0x or 0X
      if (source[i] === '0' && i + 1 < len && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        adv(); adv(); // skip 0x
        while (i < len && /[0-9a-fA-F]/.test(source[i])) adv();
        let typeSuffix = null;
        if (peek() === '_') {
          const s = source.slice(i + 1, i + 4);
          if (ATRA_TYPES.has(s)) { typeSuffix = s; adv(); adv(); adv(); adv(); }
        }
        const raw = source.slice(start, i);
        tokens.push({ type: TOK.NUM, value: String(Number(raw)), isFloat: false, typeSuffix, line: tl, col: tc });
        continue;
      }
      while (i < len && /\d/.test(source[i])) adv();
      if (peek() === '.' && /\d/.test(source[i + 1] || '')) { isFloat = true; adv(); while (i < len && /\d/.test(source[i])) adv(); }
      if (/[eE]/.test(peek())) { isFloat = true; adv(); if (/[+-]/.test(peek())) adv(); while (i < len && /\d/.test(source[i])) adv(); }
      let typeSuffix = null;
      if (peek() === '_') {
        const s = source.slice(i + 1, i + 4);
        if (ATRA_TYPES.has(s)) { typeSuffix = s; adv(); adv(); adv(); adv(); }
      }
      const raw = source.slice(start, i);
      tokens.push({ type: TOK.NUM, value: raw, isFloat, typeSuffix, line: tl, col: tc });
      continue;
    }
    // character literal: 'A', '\n', '\0', etc.
    if (source[i] === "'") {
      adv(); // skip opening quote
      let ch;
      if (source[i] === '\\') {
        adv(); // skip backslash
        const esc = source[i];
        adv(); // skip escape char
        const escMap = { n: 10, r: 13, t: 9, '0': 0, '\\': 92, "'": 39 };
        if (escMap[esc] === undefined) throw new SyntaxError(`Unknown escape \\${esc} at ${tl}:${tc}`);
        ch = escMap[esc];
      } else {
        ch = source[i].codePointAt(0);
        adv();
      }
      if (source[i] !== "'") throw new SyntaxError(`Unterminated char literal at ${tl}:${tc}`);
      adv(); // skip closing quote
      tokens.push({ type: TOK.NUM, value: String(ch), isFloat: false, typeSuffix: 'i32', line: tl, col: tc });
      continue;
    }
    // string literal: "hello", "line\n"
    if (source[i] === '"') {
      adv(); // skip opening quote
      const chars = [];
      while (i < len && source[i] !== '"') {
        if (source[i] === '\\') {
          adv();
          const esc = source[i];
          const escMap = { n: 10, r: 13, t: 9, '0': 0, '\\': 92, '"': 34 };
          if (escMap[esc] === undefined) throw new SyntaxError(`Unknown escape \\${esc} at ${line}:${col}`);
          chars.push(escMap[esc]);
          adv();
        } else {
          const encoded = new TextEncoder().encode(source[i]);
          for (const b of encoded) chars.push(b);
          adv();
        }
      }
      if (i >= len) throw new SyntaxError(`Unterminated string literal at ${tl}:${tc}`);
      adv(); // skip closing quote
      tokens.push({ type: TOK.STR, value: chars, line: tl, col: tc });
      continue;
    }
    // identifier (dots allowed — namespaces by convention)
    if (/[a-zA-Z_]/.test(source[i])) {
      const start = i;
      while (i < len && /[\w.]/.test(source[i])) adv();
      // Trim trailing dot: partial namespace at EOF (e.g. "name.") shouldn't
      // swallow the dot. This lets the editor recover gracefully mid-typing.
      while (i > start + 1 && source[i - 1] === '.') { i--; col--; }
      let val = source.slice(start, i);
      // Tagged template interpolations become __INTERP_N__ markers in the source text.
      // The parser treats them as identifiers; codegen resolves them to imports.
      if (/^__INTERP_\d+__$/.test(val)) {
        tokens.push({ type: TOK.ID, value: val, interp: true, line: tl, col: tc });
      } else if (ATRA_KEYWORDS.has(val) || ATRA_TYPES.has(val)) {
        tokens.push({ type: TOK.KW, value: val, line: tl, col: tc });
      } else {
        tokens.push({ type: TOK.ID, value: val, line: tl, col: tc });
      }
      continue;
    }
    // multi-char operators
    const tw = peek2();
    if (tw === '**' || tw === ':=' || tw === '+=' || tw === '-=' || tw === '*=' ||
        tw === '==' || tw === '<=' || tw === '>=' || tw === '<<' || tw === '>>') {
      tokens.push({ type: TOK.OP, value: tw, line: tl, col: tc });
      adv(); adv();
      continue;
    }
    // /= — this is not-equal in atra
    if (source[i] === '/' && source[i + 1] === '=') {
      tokens.push({ type: TOK.OP, value: '/=', line: tl, col: tc });
      adv(); adv();
      continue;
    }
    // single-char operators
    if ('+-*/<>=&|^~@'.includes(source[i])) {
      tokens.push({ type: TOK.OP, value: source[i], line: tl, col: tc });
      adv();
      continue;
    }
    // punctuation
    if ('()[];,:'.includes(source[i])) {
      tokens.push({ type: TOK.PUNC, value: source[i], line: tl, col: tc });
      adv();
      continue;
    }
    // skip unknown
    adv();
  }
  tokens.push({ type: TOK.EOF, value: '', line, col });
  return tokens;
}

// -- parse.js --

// Parser — recursive descent + Pratt expressions → AST
//
// Grammar sketch:
//   program    = { constDecl | varDecl | function | subroutine | import | export function }
//   function   = 'function' ID '(' params ')' ':' TYPE [var locals] 'begin' stmts 'end'
//   subroutine = 'subroutine' ID '(' params ')' [var locals] 'begin' stmts 'end'
//   params     = name {',' name} ':' TYPE {',' params}    — comma-separated names share a type
//   stmt       = if | case | for | while | do-while | break | tailcall | call | assign | arrayStore
//   assign     = ID ':=' expr  |  ID '+=' expr  |  ID '/=' expr  (etc.)
//   if         = 'if' '(' expr ')' 'then' stmts ['else' stmts | 'else' if] 'end' 'if'
//   case       = 'case' '(' expr ')' 'of' { label {',' label} ':' stmts } 'else' stmts 'end' 'case'
//   for        = 'for' ID ':=' expr ',' expr [',' step] stmts 'end' 'for'
//   expr       = Pratt expression (see lbp for precedence tower)
//   atom       = number | ID | ID '(' args ')' | ID '[' indices ']' | '(' expr ')'
//              | TYPE '(' args ')'  — type conversion / vector constructor
//              | 'if' '(' expr ')' 'then' expr 'else' expr  — ternary



function parse(tokens) {
  let pos = 0;
  function cur() { return tokens[pos]; }
  function at(type, value) { const t = cur(); return t.type === type && (value === undefined || t.value === value); }
  function eat(type, value) {
    const t = cur();
    if (t.type !== type || (value !== undefined && t.value !== value))
      throw new SyntaxError(`Expected ${value || type} but got "${t.value}" at ${t.line}:${t.col}`);
    pos++;
    return t;
  }
  function maybe(type, value) { if (at(type, value)) { pos++; return true; } return false; }

  function parseProgram() {
    const body = [];
    while (!at(TOK.EOF)) {
      if (at(TOK.KW, 'const') && !isLocalContext()) body.push(parseGlobalConst());
      else if (at(TOK.KW, 'var') && !isLocalContext()) body.push(parseGlobalVar());
      else if (at(TOK.KW, 'function')) body.push(parseFunction());
      else if (at(TOK.KW, 'subroutine')) body.push(parseSubroutine());
      else if (at(TOK.KW, 'import')) body.push(parseImport());
      else if (at(TOK.KW, 'export')) {
        pos++;
        if (at(TOK.KW, 'subroutine')) body.push(parseSubroutine(true));
        else body.push(parseFunction(true));
      }
      else if (at(TOK.KW, 'layout')) body.push(parseLayout());
      else if (at(TOK.KW, 'memory')) body.push(parseMemoryDecl());
      else if (at(TOK.ID, 'data')) body.push(parseDataDecl());
      else throw new SyntaxError(`Unexpected "${cur().value}" at ${cur().line}:${cur().col}`);
    }
    return { type: 'Program', body };
  }

  function isLocalContext() { return false; } // globals only at top level

  function parseLayout() {
    eat(TOK.KW, 'layout');
    const packed = maybe(TOK.KW, 'packed');
    const name = eat(TOK.ID).value;
    const fields = [];
    while (!at(TOK.KW, 'end') && !at(TOK.EOF)) {
      const fnames = [eat(TOK.ID).value];
      while (at(TOK.PUNC, ',') && tokens[pos + 1] && tokens[pos + 1].type === TOK.ID &&
             tokens[pos + 2] && (tokens[pos + 2].value === ',' || tokens[pos + 2].value === ':')) {
        pos++; // skip comma
        fnames.push(eat(TOK.ID).value);
      }
      eat(TOK.PUNC, ':');
      // Accept KW (primitive types) or ID (layout names) in type position
      const ftok = cur();
      let ftype;
      if (ftok.type === TOK.KW) { ftype = eat(TOK.KW).value; }
      else if (ftok.type === TOK.ID) { ftype = eat(TOK.ID).value; }
      else throw new SyntaxError(`Expected type after ':' but got "${ftok.value}" at ${ftok.line}:${ftok.col}`);
      // Optional array count: type[N]
      let arrayCount = null;
      if (at(TOK.PUNC, '[')) {
        pos++; // skip [
        arrayCount = parseInt(eat(TOK.NUM).value, 10);
        eat(TOK.PUNC, ']');
      }
      for (const fn of fnames) fields.push({ name: fn, ftype, arrayCount });
    }
    eat(TOK.KW, 'end');
    maybe(TOK.KW, 'layout'); // optional trailing "layout" after "end"
    return { type: 'LayoutDecl', name, packed: !!packed, fields };
  }

  function parseMemoryDecl() {
    eat(TOK.KW, 'memory');
    const name = eat(TOK.ID).value;
    let pages = null, maxPages = null;
    if (maybe(TOK.PUNC, ':')) {
      pages = parseInt(eat(TOK.NUM).value, 10);
      if (maybe(TOK.PUNC, ',')) {
        maxPages = parseInt(eat(TOK.NUM).value, 10);
      }
    }
    return { type: 'MemoryDecl', name, pages, maxPages };
  }

  function parseDataDecl() {
    eat(TOK.ID, 'data');
    const ptrName = eat(TOK.ID).value;
    eat(TOK.PUNC, ',');
    const lenName = eat(TOK.ID).value;
    eat(TOK.OP, '=');
    // optional memory bank qualifier: data p, n = io "text" (also before a
    // based @offset: data p, n = io @0x19A0 "text").
    let bank = null;
    if (at(TOK.ID) && tokens[pos + 1] &&
        (tokens[pos + 1].type === TOK.STR ||
         (tokens[pos + 1].type === TOK.OP && tokens[pos + 1].value === '@'))) {
      bank = eat(TOK.ID).value;
    }
    // optional based placement: data p, n = @0x19A0 "text" — lands the segment
    // at an explicit byte offset (e.g. above a cart's IO/framebuffer region)
    // instead of packing from 0 upward. ptrName binds to this offset.
    let offset = null;
    if (at(TOK.OP, '@')) {
      eat(TOK.OP, '@');
      offset = Number(eat(TOK.NUM).value);
    }
    const strTok = eat(TOK.STR);
    return { type: 'DataDecl', ptrName, lenName, bank, offset, bytes: strTok.value };
  }

  // Parse function type signature: function(x: f64, y: f64): f64
  function parseFuncTypeSig() {
    eat(TOK.KW, 'function');
    eat(TOK.PUNC, '(');
    const params = at(TOK.PUNC, ')') ? [] : parseParamEntries();
    eat(TOK.PUNC, ')');
    let retType = null;
    if (maybe(TOK.PUNC, ':')) retType = eat(TOK.KW).value;
    return { params, retType };
  }

  function parseGlobalConst() {
    eat(TOK.KW, 'const');
    const name = eat(TOK.ID).value;
    eat(TOK.PUNC, ':');
    const vtype = eat(TOK.KW).value;
    eat(TOK.OP, '=');
    const init = parseExpr(0);
    return { type: 'ConstDecl', name, vtype, init };
  }

  function parseGlobalVar() {
    eat(TOK.KW, 'var');
    const name = eat(TOK.ID).value;
    eat(TOK.PUNC, ':');
    if (at(TOK.KW, 'function')) {
      const funcSig = parseFuncTypeSig();
      let init = null;
      if (maybe(TOK.OP, '=')) init = parseExpr(0);
      return { type: 'VarDecl', name, vtype: 'i32', funcSig, init };
    }
    const vtype = eat(TOK.KW).value;
    let init = null;
    if (maybe(TOK.OP, '=')) init = parseExpr(0);
    return { type: 'VarDecl', name, vtype, init };
  }

  function parseImport() {
    eat(TOK.KW, 'import');
    // import function name(params): retType from 'module'
    // import name = ${interp}
    // import name(params): retType = ${interp}
    if (at(TOK.KW, 'function')) {
      pos++;
    }
    const name = eat(TOK.ID).value;
    let params = [], retType = null, moduleName = 'host', interpIdx = null;
    if (at(TOK.PUNC, '(')) {
      params = parseParamList();
    }
    if (maybe(TOK.PUNC, ':')) {
      retType = eat(TOK.KW).value;
    }
    if (maybe(TOK.OP, '=')) {
      // interpolation marker
      const t = eat(TOK.ID);
      interpIdx = t.value;
    } else if (maybe(TOK.KW, 'from')) {
      // 'module' — we just read the identifier as a string-like thing
      moduleName = eat(TOK.ID).value;
    }
    return { type: 'ImportDecl', name, params, retType, moduleName, interpIdx };
  }

  function parseFunction(exported = false) {
    eat(TOK.KW, 'function');
    const name = eat(TOK.ID).value;
    eat(TOK.PUNC, '(');
    const params = at(TOK.PUNC, ')') ? [] : parseParamEntries();
    eat(TOK.PUNC, ')');
    eat(TOK.PUNC, ':');
    const retType = eat(TOK.KW).value;
    const locals = [];
    if (at(TOK.KW, 'var')) {
      pos++;
      while (!at(TOK.KW, 'begin')) {
        const lnames = [eat(TOK.ID).value];
        while (at(TOK.PUNC, ',') && tokens[pos + 1] && tokens[pos + 1].type === TOK.ID &&
               tokens[pos + 2] && (tokens[pos + 2].value === ',' || tokens[pos + 2].value === ':')) {
          pos++; // skip ,
          lnames.push(eat(TOK.ID).value);
        }
        eat(TOK.PUNC, ':');
        if (at(TOK.KW, 'function')) {
          const funcSig = parseFuncTypeSig();
          for (const ln of lnames) locals.push({ type: 'Local', name: ln, vtype: 'i32', funcSig });
        } else if (at(TOK.KW, 'layout')) {
          pos++; // skip 'layout'
          const layoutName = eat(TOK.ID).value;
          for (const ln of lnames) locals.push({ type: 'Local', name: ln, vtype: 'i32', layoutType: layoutName });
        } else {
          const lt = eat(TOK.KW).value;
          for (const ln of lnames) locals.push({ type: 'Local', name: ln, vtype: lt });
        }
        maybe(TOK.PUNC, ','); // consume comma between local groups
      }
    }
    eat(TOK.KW, 'begin');
    const body = parseStatements('end');
    eat(TOK.KW, 'end');
    return { type: 'Function', name, params, retType, locals, body, exported };
  }

  function parseSubroutine(exported = false) {
    eat(TOK.KW, 'subroutine');
    const name = eat(TOK.ID).value;
    eat(TOK.PUNC, '(');
    const params = at(TOK.PUNC, ')') ? [] : parseParamEntries();
    eat(TOK.PUNC, ')');
    const locals = [];
    if (at(TOK.KW, 'var')) {
      pos++;
      while (!at(TOK.KW, 'begin')) {
        const lnames = [eat(TOK.ID).value];
        while (at(TOK.PUNC, ',') && tokens[pos + 1] && tokens[pos + 1].type === TOK.ID &&
               tokens[pos + 2] && (tokens[pos + 2].value === ',' || tokens[pos + 2].value === ':')) {
          pos++; // skip ,
          lnames.push(eat(TOK.ID).value);
        }
        eat(TOK.PUNC, ':');
        if (at(TOK.KW, 'function')) {
          const funcSig = parseFuncTypeSig();
          for (const ln of lnames) locals.push({ type: 'Local', name: ln, vtype: 'i32', funcSig });
        } else if (at(TOK.KW, 'layout')) {
          pos++; // skip 'layout'
          const layoutName = eat(TOK.ID).value;
          for (const ln of lnames) locals.push({ type: 'Local', name: ln, vtype: 'i32', layoutType: layoutName });
        } else {
          const lt = eat(TOK.KW).value;
          for (const ln of lnames) locals.push({ type: 'Local', name: ln, vtype: lt });
        }
        maybe(TOK.PUNC, ','); // consume comma between local groups
      }
    }
    eat(TOK.KW, 'begin');
    const body = parseStatements('end');
    eat(TOK.KW, 'end');
    return { type: 'Subroutine', name, params, locals, body, exported };
  }

  // Param grouping: "x, y: f64" shares a type across comma-separated names.
  // The lookahead (pos+2 is ',' or ':') distinguishes grouped names from the next param group.
  function parseParamEntries() {
    const params = [];
    while (cur().type === TOK.ID) {
      const names = [eat(TOK.ID).value];
      while (at(TOK.PUNC, ',') && tokens[pos + 1] && tokens[pos + 1].type === TOK.ID &&
             tokens[pos + 2] && (tokens[pos + 2].value === ',' || tokens[pos + 2].value === ':')) {
        pos++; // skip ,
        names.push(eat(TOK.ID).value);
      }
      eat(TOK.PUNC, ':');
      // function type: callback: function(x: f64): f64
      if (at(TOK.KW, 'function')) {
        const funcSig = parseFuncTypeSig();
        for (const n of names) params.push({ type: 'Param', name: n, vtype: 'i32', isArray: false, arrayDims: null, funcSig });
        maybe(TOK.PUNC, ','); // consume comma between param groups
        continue;
      }
      // Memory-qualified: detect ID followed by KW 'array' or KW 'layout'
      let memBank = null;
      if (cur().type === TOK.ID &&
          tokens[pos + 1] && tokens[pos + 1].type === TOK.KW &&
          (tokens[pos + 1].value === 'array' || tokens[pos + 1].value === 'layout')) {
        memBank = eat(TOK.ID).value;
      }
      // layout type: ptr: layout Sphere  (or: ptr: coords layout Sphere)
      if (at(TOK.KW, 'layout')) {
        pos++; // skip 'layout'
        const layoutName = eat(TOK.ID).value;
        for (const n of names) params.push({ type: 'Param', name: n, vtype: 'i32', isArray: false, arrayDims: null, layoutType: layoutName, memBank });
        maybe(TOK.PUNC, ','); // consume comma between param groups
        continue;
      }
      let isArray = false, arrayDims = null;
      if (at(TOK.KW, 'array')) {
        pos++;
        isArray = true;
        if (at(TOK.PUNC, '(')) {
          pos++;
          arrayDims = [];
          arrayDims.push(parseExpr(0));
          while (maybe(TOK.PUNC, ',')) arrayDims.push(parseExpr(0));
          eat(TOK.PUNC, ')');
        }
      }
      const vtype = eat(TOK.KW).value;
      for (const n of names) params.push({ type: 'Param', name: n, vtype, isArray, arrayDims, memBank });
      maybe(TOK.PUNC, ','); // consume comma between param groups
    }
    return params;
  }

  function parseParamList() {
    // simplified param list for imports: name: type, ...
    eat(TOK.PUNC, '(');
    const params = [];
    while (cur().type === TOK.ID) {
      const names = [eat(TOK.ID).value];
      while (at(TOK.PUNC, ',') && tokens[pos + 1] && tokens[pos + 1].type === TOK.ID &&
             tokens[pos + 2] && (tokens[pos + 2].value === ',' || tokens[pos + 2].value === ':')) {
        pos++;
        names.push(eat(TOK.ID).value);
      }
      eat(TOK.PUNC, ':');
      const vtype = eat(TOK.KW).value;
      for (const n of names) params.push({ type: 'Param', name: n, vtype, isArray: false, arrayDims: null });
      maybe(TOK.PUNC, ','); // consume comma between param groups
    }
    eat(TOK.PUNC, ')');
    return params;
  }

  function parseStatements(endKw) {
    const stmts = [];
    while (!at(TOK.KW, endKw) && !at(TOK.EOF)) {
      // also stop at 'else' for if blocks
      if (endKw === 'end' && at(TOK.KW, 'else')) break;
      stmts.push(parseStatement());
    }
    return stmts;
  }

  function parseStatement() {
    if (at(TOK.KW, 'if')) return parseIf();
    if (at(TOK.KW, 'case')) return parseCase();
    if (at(TOK.KW, 'for')) return parseFor();
    if (at(TOK.KW, 'while')) return parseWhile();
    if (at(TOK.KW, 'do')) return parseDoWhile();
    if (at(TOK.KW, 'break')) { pos++; return { type: 'Break' }; }
    if (at(TOK.KW, 'tailcall')) { pos++; const name = eat(TOK.ID).value; eat(TOK.PUNC, '('); const args = parseArgs(); eat(TOK.PUNC, ')'); return { type: 'TailCall', name, args }; }
    if (at(TOK.KW, 'call')) { pos++; const name = at(TOK.KW, 'return') ? (pos++, 'return') : eat(TOK.ID).value; eat(TOK.PUNC, '('); const args = parseArgs(); eat(TOK.PUNC, ')'); return { type: 'Call', name, args }; }

    // assignment or expression statement
    // look ahead: id := / id[...] := / id += etc.
    if (cur().type === TOK.ID) {
      const name = cur().value;
      // check for array store: id[
      if (tokens[pos + 1] && tokens[pos + 1].value === '[') {
        pos++;
        eat(TOK.PUNC, '[');
        const indices = [parseExpr(0)];
        while (maybe(TOK.PUNC, ',')) indices.push(parseExpr(0));
        eat(TOK.PUNC, ']');
        if (at(TOK.OP, ':=')) {
          pos++;
          const value = parseExpr(0);
          return { type: 'ArrayStore', name, indices, value };
        }
        // compound assignment on array
        const cop = cur().value;
        if (cop === '+=' || cop === '-=' || cop === '*=' || cop === '/=') {
          // Note: /= is ambiguous — as a statement start after array access, it's compound assign
          pos++;
          const rhs = parseExpr(0);
          const op = cop[0]; // +, -, *, /
          return { type: 'ArrayStore', name, indices, value: {
            type: 'BinOp', op, left: { type: 'ArrayAccess', name, indices }, right: rhs
          }};
        }
        throw new SyntaxError(`Expected := or compound assignment after array access at ${cur().line}:${cur().col}`);
      }
      if (tokens[pos + 1] && tokens[pos + 1].value === ':=') {
        pos++; pos++;
        const value = parseExpr(0);
        return { type: 'Assign', name, value };
      }
      // compound assignment: +=, -=, *=
      if (tokens[pos + 1] && (tokens[pos + 1].value === '+=' || tokens[pos + 1].value === '-=' || tokens[pos + 1].value === '*=')) {
        const cop = tokens[pos + 1].value;
        const op = cop[0];
        pos++; pos++;
        const rhs = parseExpr(0);
        return { type: 'Assign', name, value: { type: 'BinOp', op, left: { type: 'Ident', name }, right: rhs } };
      }
      // /= compound assignment (only when not in expression context — statement level)
      // Disambiguation: at statement level, id /= expr is compound divide-assign
      // But /= is also not-equal operator. At statement level: id /= expr → divide-assign.
      if (tokens[pos + 1] && tokens[pos + 1].value === '/=') {
        // look further: if this is a standalone statement (id /= expr), treat as compound assign
        const op = '/';
        pos++; pos++;
        const rhs = parseExpr(0);
        return { type: 'Assign', name, value: { type: 'BinOp', op, left: { type: 'Ident', name }, right: rhs } };
      }
    }

    // expression statement (e.g., bare function call)
    const expr = parseExpr(0);
    if (expr.type === 'FuncCall') return { type: 'Call', name: expr.name, args: expr.args };
    throw new SyntaxError(`Unexpected expression statement at ${cur().line}:${cur().col}`);
  }

  // The isElseIf flag controls 'end if' consumption: inner if in an else-if chain
  // lets the outermost if consume the single 'end if'. Without this, each level
  // would eat one 'end' and the nesting would break.
  function parseIf(isElseIf) {
    eat(TOK.KW, 'if');
    eat(TOK.PUNC, '(');
    const cond = parseExpr(0);
    eat(TOK.PUNC, ')');
    eat(TOK.KW, 'then');
    const body = [];
    while (!at(TOK.KW, 'else') && !at(TOK.KW, 'end') && !at(TOK.EOF)) {
      body.push(parseStatement());
    }
    let elseBody = null;
    if (at(TOK.KW, 'else')) {
      const elseLine = cur().line;
      pos++;
      if (at(TOK.KW, 'if') && cur().line === elseLine) {
        // else if chain (same line): inner parseIf handles everything including end if
        elseBody = [parseIf(true)];
      } else {
        elseBody = [];
        while (!at(TOK.KW, 'end') && !at(TOK.EOF)) {
          elseBody.push(parseStatement());
        }
      }
    }
    // Only consume 'end if' at the outermost if (not in else-if chain)
    if (!isElseIf && at(TOK.KW, 'end')) {
      pos++;
      maybe(TOK.KW, 'if');
    }
    return { type: 'If', cond, body, elseBody };
  }

  // case (expr) of  label{, label}: stmts  ...  else stmts  end case
  function parseCase() {
    eat(TOK.KW, 'case');
    eat(TOK.PUNC, '(');
    const selector = parseExpr(0);
    eat(TOK.PUNC, ')');
    eat(TOK.KW, 'of');
    const arms = [];
    while (!at(TOK.KW, 'else') && !at(TOK.KW, 'end') && !at(TOK.EOF)) {
      const labels = [parseExpr(0)];
      while (maybe(TOK.PUNC, ',') && !isCaseColon()) labels.push(parseExpr(0));
      eat(TOK.PUNC, ':');
      const body = [];
      while (!at(TOK.KW, 'else') && !at(TOK.KW, 'end') && !at(TOK.EOF) && !isCaseLabelStart()) {
        body.push(parseStatement());
      }
      arms.push({ labels, body });
    }
    eat(TOK.KW, 'else');
    const elseBody = [];
    while (!at(TOK.KW, 'end') && !at(TOK.EOF)) {
      elseBody.push(parseStatement());
    }
    eat(TOK.KW, 'end');
    maybe(TOK.KW, 'case');
    return { type: 'Case', selector, arms, elseBody };
  }

  // Detect if current position starts a new case label (number or -number followed by : or ,)
  function isCaseLabelStart() {
    const t = cur();
    if (t.type === TOK.NUM || (t.type === TOK.OP && t.value === '-' && tokens[pos + 1] && tokens[pos + 1].type === TOK.NUM)) {
      return scanForCaseColon();
    }
    return false;
  }

  // Look ahead for an unparenthesized ':' (not ':=') — indicates a case label
  function scanForCaseColon() {
    let j = pos, depth = 0;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t.type === TOK.PUNC && t.value === '(') { depth++; j++; continue; }
      if (t.type === TOK.PUNC && t.value === ')') { depth--; j++; continue; }
      if (depth === 0 && t.type === TOK.PUNC && t.value === ':') {
        // ':=' is assignment, not label
        return !(tokens[j + 1] && tokens[j + 1].value === '=');
      }
      if (t.type === TOK.KW && ['if','for','while','do','call','break','case','else','end'].includes(t.value)) return false;
      if (t.type === TOK.EOF) return false;
      j++;
    }
    return false;
  }

  // Check if current token is ',' followed by ':' (end of label list, not another label)
  function isCaseColon() {
    return at(TOK.PUNC, ':') && !(tokens[pos + 1] && tokens[pos + 1].value === '=');
  }

  function parseFor() {
    eat(TOK.KW, 'for');
    const varName = eat(TOK.ID).value;
    eat(TOK.OP, ':=');
    const start = parseExpr(0);
    eat(TOK.PUNC, ',');
    const end = parseExpr(0);
    let step = null;
    if (maybe(TOK.PUNC, ',')) step = parseExpr(0);
    const body = [];
    while (!at(TOK.KW, 'end') && !at(TOK.EOF)) body.push(parseStatement());
    eat(TOK.KW, 'end');
    eat(TOK.KW, 'for');
    return { type: 'For', varName, start, end, step, body };
  }

  function parseWhile() {
    eat(TOK.KW, 'while');
    eat(TOK.PUNC, '(');
    const cond = parseExpr(0);
    eat(TOK.PUNC, ')');
    const body = [];
    while (!at(TOK.KW, 'end') && !at(TOK.EOF)) body.push(parseStatement());
    eat(TOK.KW, 'end');
    eat(TOK.KW, 'while');
    return { type: 'While', cond, body };
  }

  function parseDoWhile() {
    eat(TOK.KW, 'do');
    const body = [];
    while (!at(TOK.KW, 'while') && !at(TOK.EOF)) body.push(parseStatement());
    eat(TOK.KW, 'while');
    eat(TOK.PUNC, '(');
    const cond = parseExpr(0);
    eat(TOK.PUNC, ')');
    return { type: 'DoWhile', cond, body };
  }

  function parseArgs() {
    const args = [];
    if (!at(TOK.PUNC, ')')) {
      args.push(parseExpr(0));
      while (maybe(TOK.PUNC, ',')) args.push(parseExpr(0));
    }
    return args;
  }

  // ── Pratt expression parser ──

  // Binding powers (higher = tighter):
  //   or(2) < and(4) < ==/=/< />/<=/>=(6) < |(8) < ^(10) < &(12)
  //   < <</>> (14) < +/-(16) < */÷/mod(18) < **(22, right-assoc)
  function lbp(tok) {
    if (tok.type === TOK.KW) {
      if (tok.value === 'or') return 2;
      if (tok.value === 'and') return 4;
      if (tok.value === 'mod') return 18;
    }
    if (tok.type === TOK.OP) {
      const v = tok.value;
      if (v === '==' || v === '/=' || v === '<' || v === '>' || v === '<=' || v === '>=') return 6;
      if (v === '|') return 8;
      if (v === '^') return 10;
      if (v === '&') return 12;
      if (v === '<<' || v === '>>') return 14;
      if (v === '+' || v === '-') return 16;
      if (v === '*' || v === '/') return 18;
      if (v === '**') return 22; // right-assoc: parseExpr(bp) not parseExpr(bp+1)
    }
    return 0;
  }

  function parseExpr(minBp) {
    let left = parsePrefix();

    while (true) {
      const t = cur();
      const bp = lbp(t);
      if (bp === 0 || bp < minBp) break;

      // if-expression (ternary): if (cond) then a else b
      // Not handled here — it's a prefix form
      if (t.type === TOK.KW && t.value === 'or') { pos++; left = { type: 'BinOp', op: 'or', left, right: parseExpr(bp + 1) }; continue; }
      if (t.type === TOK.KW && t.value === 'and') { pos++; left = { type: 'BinOp', op: 'and', left, right: parseExpr(bp + 1) }; continue; }
      if (t.type === TOK.KW && t.value === 'mod') { pos++; left = { type: 'BinOp', op: 'mod', left, right: parseExpr(bp + 1) }; continue; }

      if (t.type === TOK.OP) {
        if (t.value === '**') {
          pos++;
          // Right-associativity trick: parseExpr(bp) instead of parseExpr(bp+1)
          // lets 2**3**4 parse as 2**(3**4).
          left = { type: 'BinOp', op: '**', left, right: parseExpr(bp) };
          continue;
        }
        pos++;
        left = { type: 'BinOp', op: t.value, left, right: parseExpr(bp + 1) };
        continue;
      }
      break;
    }
    return left;
  }

  function parsePrefix() {
    const t = cur();

    // parenthesized expression
    if (t.type === TOK.PUNC && t.value === '(') {
      pos++;
      const expr = parseExpr(0);
      eat(TOK.PUNC, ')');
      return expr;
    }

    // case-expression: case (expr) of  label: expr  ...  else expr  end case
    if (t.type === TOK.KW && t.value === 'case') {
      pos++;
      eat(TOK.PUNC, '(');
      const selector = parseExpr(0);
      eat(TOK.PUNC, ')');
      eat(TOK.KW, 'of');
      const arms = [];
      while (!at(TOK.KW, 'else') && !at(TOK.KW, 'end') && !at(TOK.EOF)) {
        const labels = [parseExpr(0)];
        while (maybe(TOK.PUNC, ',') && !isCaseColon()) labels.push(parseExpr(0));
        eat(TOK.PUNC, ':');
        const expr = parseExpr(0);
        arms.push({ labels, expr });
      }
      eat(TOK.KW, 'else');
      const elseExpr = parseExpr(0);
      eat(TOK.KW, 'end');
      maybe(TOK.KW, 'case');
      return { type: 'CaseExpr', selector, arms, elseExpr };
    }

    // if-expression (ternary): if (cond) then a else b
    if (t.type === TOK.KW && t.value === 'if') {
      pos++;
      eat(TOK.PUNC, '(');
      const cond = parseExpr(0);
      eat(TOK.PUNC, ')');
      eat(TOK.KW, 'then');
      const thenExpr = parseExpr(0);
      eat(TOK.KW, 'else');
      const elseExpr = parseExpr(0);
      return { type: 'IfExpr', cond, thenExpr, elseExpr };
    }

    // unary minus
    if (t.type === TOK.OP && t.value === '-') {
      pos++;
      return { type: 'UnaryOp', op: '-', operand: parseExpr(21) };
    }
    // not
    if (t.type === TOK.KW && t.value === 'not') {
      pos++;
      return { type: 'UnaryOp', op: 'not', operand: parseExpr(21) };
    }
    // bitwise not
    if (t.type === TOK.OP && t.value === '~') {
      pos++;
      return { type: 'UnaryOp', op: '~', operand: parseExpr(21) };
    }
    // function reference: @funcname → table index
    if (t.type === TOK.OP && t.value === '@') {
      pos++;
      const name = cur();
      if (name.type !== TOK.ID) throw new SyntaxError(`Expected function name after @ at ${name.line}:${name.col}`);
      pos++;
      // consume dotted parts: @ns.func
      let fullName = name.value;
      while (cur().type === TOK.OP && cur().value === '.' && tokens[pos + 1] && tokens[pos + 1].type === TOK.ID) {
        pos++; // skip dot
        fullName += '.' + cur().value;
        pos++; // skip id
      }
      return { type: 'FuncRef', name: fullName };
    }
    // number literal
    if (t.type === TOK.NUM) {
      pos++;
      return { type: 'NumberLit', value: t.value, isFloat: t.isFloat, typeSuffix: t.typeSuffix };
    }
    // true/false
    if (t.type === TOK.KW && (t.value === 'true' || t.value === 'false')) {
      pos++;
      return { type: 'NumberLit', value: t.value === 'true' ? '1' : '0', isFloat: false, typeSuffix: 'i32' };
    }
    // identifier — may be function call, array access, or plain variable
    if (t.type === TOK.ID) {
      pos++;
      const name = t.value;
      // function call: name(...)
      if (at(TOK.PUNC, '(')) {
        pos++;
        const args = parseArgs();
        eat(TOK.PUNC, ')');
        return { type: 'FuncCall', name, args };
      }
      // array access: name[...]
      if (at(TOK.PUNC, '[')) {
        pos++;
        const indices = [parseExpr(0)];
        while (maybe(TOK.PUNC, ',')) indices.push(parseExpr(0));
        eat(TOK.PUNC, ']');
        return { type: 'ArrayAccess', name, indices };
      }
      return { type: 'Ident', name };
    }
    // type conversion / vector constructor: i32(...), f64(...), f64x2(a, b), etc.
    if (t.type === TOK.KW && ATRA_TYPES.has(t.value) && tokens[pos + 1] && tokens[pos + 1].value === '(') {
      pos++; // skip type keyword
      pos++; // skip (
      const args = parseArgs();
      eat(TOK.PUNC, ')');
      return { type: 'FuncCall', name: t.value, args };
    }
    throw new SyntaxError(`Unexpected token "${t.value}" at ${t.line}:${t.col}`);
  }

  return parseProgram();
}

// -- opcodes.js --

// Opcodes — Wasm opcode constants, type codes, and SIMD ops
//
// The Wasm opcode space is organized by category: control flow at 0x00, variable access
// at 0x20, memory at 0x28, constants at 0x41. Within the arithmetic region (0x45–0xa6),
// opcodes form a type×operation grid: each operation has four variants (i32/i64/f32/f64)
// laid out in contiguous blocks. Two-byte opcodes (0xFC/0xFD prefix) extend the space
// for saturating truncation and SIMD.

// ── Control flow (0x00–0x1b) ──
const OP_UNREACHABLE = 0x00, OP_NOP = 0x01, OP_BLOCK = 0x02, OP_LOOP = 0x03,
  OP_IF = 0x04, OP_ELSE = 0x05, OP_END = 0x0b, OP_BR = 0x0c, OP_BR_IF = 0x0d,
  OP_BR_TABLE = 0x0e, OP_RETURN = 0x0f, OP_CALL = 0x10, OP_CALL_INDIRECT = 0x11,
  OP_RETURN_CALL = 0x12, OP_RETURN_CALL_INDIRECT = 0x13, OP_SELECT = 0x1b,

// ── Variable access (0x20–0x24) ──
  OP_LOCAL_GET = 0x20, OP_LOCAL_SET = 0x21, OP_LOCAL_TEE = 0x22,
  OP_GLOBAL_GET = 0x23, OP_GLOBAL_SET = 0x24,

// ── Memory (0x28–0x40) ──
  OP_I32_LOAD = 0x28, OP_I64_LOAD = 0x29, OP_F32_LOAD = 0x2a, OP_F64_LOAD = 0x2b,
  OP_I32_LOAD8_S = 0x2c, OP_I32_LOAD8_U = 0x2d,
  OP_I32_LOAD16_S = 0x2e, OP_I32_LOAD16_U = 0x2f,
  OP_I32_STORE = 0x36, OP_I64_STORE = 0x37, OP_F32_STORE = 0x38, OP_F64_STORE = 0x39,
  OP_I32_STORE8 = 0x3a, OP_I32_STORE16 = 0x3b,
  OP_MEMORY_SIZE = 0x3f, OP_MEMORY_GROW = 0x40,

// ── Constants (0x41–0x44) ──
  OP_I32_CONST = 0x41, OP_I64_CONST = 0x42, OP_F32_CONST = 0x43, OP_F64_CONST = 0x44,

// ── Comparison (0x45–0x66) — type×operation grid: eqz/eq/ne/lt/gt/le/ge per type ──
  OP_I32_EQZ = 0x45, OP_I32_EQ = 0x46, OP_I32_NE = 0x47,
  OP_I32_LT_S = 0x48, OP_I32_LT_U = 0x49, OP_I32_GT_S = 0x4a, OP_I32_GT_U = 0x4b,
  OP_I32_LE_S = 0x4c, OP_I32_LE_U = 0x4d, OP_I32_GE_S = 0x4e, OP_I32_GE_U = 0x4f,
  OP_I64_EQZ = 0x50, OP_I64_EQ = 0x51, OP_I64_NE = 0x52,
  OP_I64_LT_S = 0x53, OP_I64_LT_U = 0x54, OP_I64_GT_S = 0x55, OP_I64_GT_U = 0x56,
  OP_I64_LE_S = 0x57, OP_I64_LE_U = 0x58, OP_I64_GE_S = 0x59, OP_I64_GE_U = 0x5a,
  OP_F32_EQ = 0x5b, OP_F32_NE = 0x5c, OP_F32_LT = 0x5d, OP_F32_GT = 0x5e, OP_F32_LE = 0x5f, OP_F32_GE = 0x60,
  OP_F64_EQ = 0x61, OP_F64_NE = 0x62, OP_F64_LT = 0x63, OP_F64_GT = 0x64, OP_F64_LE = 0x65, OP_F64_GE = 0x66,

// ── i32 arithmetic (0x67–0x78) ──
  OP_I32_CLZ = 0x67, OP_I32_CTZ = 0x68, OP_I32_POPCNT = 0x69,
  OP_I32_ADD = 0x6a, OP_I32_SUB = 0x6b, OP_I32_MUL = 0x6c,
  OP_I32_DIV_S = 0x6d, OP_I32_DIV_U = 0x6e, OP_I32_REM_S = 0x6f, OP_I32_REM_U = 0x70,
  OP_I32_AND = 0x71, OP_I32_OR = 0x72, OP_I32_XOR = 0x73,
  OP_I32_SHL = 0x74, OP_I32_SHR_S = 0x75, OP_I32_SHR_U = 0x76,
  OP_I32_ROTL = 0x77, OP_I32_ROTR = 0x78,

// ── i64 arithmetic (0x79–0x8a) ──
  OP_I64_CLZ = 0x79, OP_I64_CTZ = 0x7a, OP_I64_POPCNT = 0x7b,
  OP_I64_ADD = 0x7c, OP_I64_SUB = 0x7d, OP_I64_MUL = 0x7e,
  OP_I64_DIV_S = 0x7f, OP_I64_DIV_U = 0x80, OP_I64_REM_S = 0x81, OP_I64_REM_U = 0x82,
  OP_I64_AND = 0x83, OP_I64_OR = 0x84, OP_I64_XOR = 0x85,
  OP_I64_SHL = 0x86, OP_I64_SHR_S = 0x87, OP_I64_SHR_U = 0x88,
  OP_I64_ROTL = 0x89, OP_I64_ROTR = 0x8a,

// ── f32 unary + binary (0x8b–0x98) ──
  OP_F32_ABS = 0x8b, OP_F32_NEG = 0x8c, OP_F32_CEIL = 0x8d, OP_F32_FLOOR = 0x8e,
  OP_F32_TRUNC = 0x8f, OP_F32_NEAREST = 0x90, OP_F32_SQRT = 0x91,
  OP_F32_ADD = 0x92, OP_F32_SUB = 0x93, OP_F32_MUL = 0x94, OP_F32_DIV = 0x95,
  OP_F32_MIN = 0x96, OP_F32_MAX = 0x97, OP_F32_COPYSIGN = 0x98,

// ── f64 unary + binary (0x99–0xa6) ──
  OP_F64_ABS = 0x99, OP_F64_NEG = 0x9a, OP_F64_CEIL = 0x9b, OP_F64_FLOOR = 0x9c,
  OP_F64_TRUNC = 0x9d, OP_F64_NEAREST = 0x9e, OP_F64_SQRT = 0x9f,
  OP_F64_ADD = 0xa0, OP_F64_SUB = 0xa1, OP_F64_MUL = 0xa2, OP_F64_DIV = 0xa3,
  OP_F64_MIN = 0xa4, OP_F64_MAX = 0xa5, OP_F64_COPYSIGN = 0xa6,

// ── Conversions (0xa7–0xc4) ──
  OP_I32_WRAP_I64 = 0xa7,
  OP_I32_TRUNC_F32_S = 0xa8, OP_I32_TRUNC_F64_S = 0xaa,
  OP_I64_EXTEND_I32_S = 0xac, OP_I64_EXTEND_I32_U = 0xad,
  OP_I64_TRUNC_F32_S = 0xae, OP_I64_TRUNC_F64_S = 0xb0,
  OP_F32_CONVERT_I32_S = 0xb2, OP_F32_CONVERT_I64_S = 0xb4,
  OP_F32_DEMOTE_F64 = 0xb6,
  OP_F64_CONVERT_I32_S = 0xb7, OP_F64_CONVERT_I64_S = 0xb9,
  OP_F64_PROMOTE_F32 = 0xbb,
  OP_I32_REINTERPRET_F32 = 0xbc, OP_I64_REINTERPRET_F64 = 0xbd,
  OP_F32_REINTERPRET_I32 = 0xbe, OP_F64_REINTERPRET_I64 = 0xbf,
  OP_I32_EXTEND8_S = 0xc0, OP_I32_EXTEND16_S = 0xc1,
  OP_I64_EXTEND8_S = 0xc2, OP_I64_EXTEND16_S = 0xc3, OP_I64_EXTEND32_S = 0xc4;

// ── FC prefix (0xFC + u32) — saturating truncation ──
const OP_FC_PREFIX = 0xfc;
const OP_I32_TRUNC_SAT_F32_S = 0, OP_I32_TRUNC_SAT_F32_U = 1,
  OP_I32_TRUNC_SAT_F64_S = 2, OP_I32_TRUNC_SAT_F64_U = 3,
  OP_I64_TRUNC_SAT_F32_S = 4, OP_I64_TRUNC_SAT_F32_U = 5,
  OP_I64_TRUNC_SAT_F64_S = 6, OP_I64_TRUNC_SAT_F64_U = 7;

// ── Type codes ──
// Descending from 0x7f: i32, i64, f32, f64, v128. These are negative values in
// signed LEB128, which is how they appear in function signatures and local declarations.
const WASM_I32 = 0x7f, WASM_I64 = 0x7e, WASM_F32 = 0x7d, WASM_F64 = 0x7c;
const WASM_V128 = 0x7b;
const WASM_VOID = 0x40;

// ── SIMD prefix (0xFD + u32) ──
const OP_SIMD_PREFIX = 0xfd;

// SIMD opcode table — keyed by "type.operation" for easy lookup from codegen
const SIMD_OPS = {
  // splat
  'i32x4.splat': 0x11, 'i64x2.splat': 0x12, 'f32x4.splat': 0x13, 'f64x2.splat': 0x14,
  // extract_lane
  'i32x4.extract_lane': 0x1b, 'i64x2.extract_lane': 0x1d, 'f32x4.extract_lane': 0x1f, 'f64x2.extract_lane': 0x21,
  // replace_lane
  'i32x4.replace_lane': 0x1c, 'i64x2.replace_lane': 0x1e, 'f32x4.replace_lane': 0x20, 'f64x2.replace_lane': 0x22,
  // add
  'i32x4.add': 0xae, 'i64x2.add': 0xce, 'f32x4.add': 0xe4, 'f64x2.add': 0xf0,
  // sub
  'i32x4.sub': 0xb1, 'i64x2.sub': 0xd1, 'f32x4.sub': 0xe5, 'f64x2.sub': 0xf1,
  // mul
  'i32x4.mul': 0xb5, 'i64x2.mul': 0xd5, 'f32x4.mul': 0xe6, 'f64x2.mul': 0xf2,
  // div (float only)
  'f32x4.div': 0xe7, 'f64x2.div': 0xf3,
  // neg
  'i32x4.neg': 0xa1, 'i64x2.neg': 0xc1, 'f32x4.neg': 0xe1, 'f64x2.neg': 0xed,
  // abs (float only)
  'f32x4.abs': 0xe0, 'f64x2.abs': 0xec,
  // sqrt (float only)
  'f32x4.sqrt': 0xe3, 'f64x2.sqrt': 0xef,
  // min/max (float only)
  'f32x4.min': 0xe8, 'f64x2.min': 0xf4, 'f32x4.max': 0xe9, 'f64x2.max': 0xf5,
  // comparison — eq
  'i32x4.eq': 0x37, 'i64x2.eq': 0xd6, 'f32x4.eq': 0x41, 'f64x2.eq': 0x47,
  // ne
  'i32x4.ne': 0x38, 'f32x4.ne': 0x42, 'f64x2.ne': 0x48,
  // lt
  'i32x4.lt_s': 0x39, 'i64x2.lt_s': 0xd7, 'f32x4.lt': 0x43, 'f64x2.lt': 0x49,
  // gt
  'i32x4.gt_s': 0x3b, 'i64x2.gt_s': 0xd9, 'f32x4.gt': 0x44, 'f64x2.gt': 0x4a,
  // le
  'i32x4.le_s': 0x3d, 'i64x2.le_s': 0xdb, 'f32x4.le': 0x45, 'f64x2.le': 0x4b,
  // ge
  'i32x4.ge_s': 0x3f, 'i64x2.ge_s': 0xdd, 'f32x4.ge': 0x46, 'f64x2.ge': 0x4c,
  // v128 bitwise
  'v128.not': 0x4d, 'v128.and': 0x4e, 'v128.or': 0x50, 'v128.xor': 0x51,
  // v128 memory
  'v128.load': 0x00, 'v128.store': 0x0b, 'v128.const': 0x0c,
  // relaxed SIMD (0xFD prefix, opcodes > 0x100)
  'f32x4.relaxed_madd': 0x105, 'f32x4.relaxed_nmadd': 0x106,
  'f64x2.relaxed_madd': 0x107, 'f64x2.relaxed_nmadd': 0x108,
};

function wasmType(t) {
  if (t === 'i32') return WASM_I32;
  if (t === 'i64') return WASM_I64;
  if (t === 'f32') return WASM_F32;
  if (t === 'f64') return WASM_F64;
  if (isVector(t)) return WASM_V128;
  throw new Error('Unknown type: ' + t);
}

function typeSize(t) {
  if (t === 'i32' || t === 'f32') return 4;
  if (t === 'i64' || t === 'f64') return 8;
  if (isVector(t)) return 16;
  throw new Error('Unknown type: ' + t);
}

function isVector(t) { return t === 'f64x2' || t === 'f32x4' || t === 'i32x4' || t === 'i64x2'; }
function vectorScalarType(t) {
  if (t === 'f64x2') return 'f64';
  if (t === 'f32x4') return 'f32';
  if (t === 'i32x4') return 'i32';
  if (t === 'i64x2') return 'i64';
  return null;
}

// -- bytewriter.js --

// ByteWriter — binary builder for Wasm output
//
// Wasm uses LEB128 (Little-Endian Base 128) for all integers — a variable-length
// encoding where each byte uses 7 data bits + 1 continuation bit. This keeps
// small values compact (1 byte for 0–127) while still supporting the full range.

class ByteWriter {
  constructor() { this.buf = []; }
  byte(b) { this.buf.push(b & 0xff); }
  bytes(arr) { for (const b of arr) this.byte(b); }
  u32(v) { // LEB128 unsigned
    do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; this.byte(b); } while (v);
  }
  s32(v) { // LEB128 signed
    let more = true;
    while (more) {
      let b = v & 0x7f; v >>= 7;
      if ((v === 0 && !(b & 0x40)) || (v === -1 && (b & 0x40))) more = false; else b |= 0x80;
      this.byte(b);
    }
  }
  s64(v) { // LEB128 signed for i64 (BigInt)
    v = BigInt(v);
    let more = true;
    while (more) {
      let b = Number(v & 0x7fn); v >>= 7n;
      if ((v === 0n && !(b & 0x40)) || (v === -1n && (b & 0x40))) more = false; else b |= 0x80;
      this.byte(b);
    }
  }
  f32(v) { const buf = new ArrayBuffer(4); new DataView(buf).setFloat32(0, v, true); this.bytes(new Uint8Array(buf)); }
  f64(v) { const buf = new ArrayBuffer(8); new DataView(buf).setFloat64(0, v, true); this.bytes(new Uint8Array(buf)); }
  str(s) { const enc = new TextEncoder().encode(s); this.u32(enc.length); this.bytes(enc); }
  // Wasm sections are length-prefixed, but the length isn't known until the content
  // is written. Solution: write into a temporary buffer, measure, then emit id + size + content.
  section(id, contentFn) {
    const inner = new ByteWriter();
    contentFn(inner);
    this.byte(id);
    this.u32(inner.buf.length);
    this.bytes(inner.buf);
  }
  toUint8Array() { return new Uint8Array(this.buf); }
}

// -- codegen.js --

// Codegen — AST → Wasm binary
//
// Single-pass compiler: AST in, Wasm bytes out. No optimization, no intermediate
// representation. Closure-based architecture: emitFunctionBody captures index tables
// (funcIndex, globalIndex, localMap) from the outer codegen scope.
//
// Output follows Wasm binary section ordering: Type(1), Import(2), Function(3),
// Table(4), Memory(5), Global(6), Export(7), Element(9), Code(10).
//
// Most emitters branch on type (f64/f32/i32/i64/vector) because Wasm's instruction
// set is fully typed — there's no polymorphic add, only i32.add, f64.add, etc.




// Nested JS objects → flat "a.b.c" keys. Wasm imports use a two-level namespace
// (module + name), so nested user imports like {physics: {gravity: fn}} need flattening.
function flattenImports(obj, prefix) {
  const flat = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && (k === '__memory' || k === '__memories' || k === 'memory' || k === '__table')) continue;
    const key = prefix ? prefix + '.' + k : k;
    if (typeof v === 'function') flat[key] = v;
    else if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) Object.assign(flat, flattenImports(v, key));
  }
  return flat;
}

function codegen(ast, interpValues, userImports) {
  const w = new ByteWriter();

  // ── Collect info ──
  const globals = [];    // { name, vtype, mutable, init }
  const functions = [];  // AST nodes
  const imports = [];    // { name, moduleName, params, retType, interpIdx }
  const localFuncNames = new Set();

  for (const node of ast.body) {
    if (node.type === 'ConstDecl') globals.push({ name: node.name, vtype: node.vtype, mutable: false, init: node.init });
    else if (node.type === 'VarDecl') {
      const g = { name: node.name, vtype: node.vtype, mutable: true, init: node.init };
      if (node.funcSig) g.funcSig = node.funcSig;
      globals.push(g);
    }
    else if (node.type === 'Function' || node.type === 'Subroutine') { functions.push(node); localFuncNames.add(node.name); }
    else if (node.type === 'ImportDecl') imports.push(node);
    // LayoutDecl and MemoryDecl handled below
  }

  // ── Build layout table ──
  const layouts = {};
  for (const node of ast.body) {
    if (node.type !== 'LayoutDecl') continue;
    const layout = { fields: {}, __align: 1, packed: node.packed };
    let offset = 0;
    for (const f of node.fields) {
      let size, align, fieldLayout;
      if (layouts[f.ftype]) {
        fieldLayout = f.ftype;
        size = layouts[f.ftype].__size;
        align = node.packed ? 1 : layouts[f.ftype].__align;
      } else {
        size = typeSize(f.ftype);
        align = node.packed ? 1 : size;
      }
      if (!node.packed) offset = (offset + align - 1) & ~(align - 1);
      let elemSize = size;
      if (f.arrayCount) size = elemSize * f.arrayCount;
      layout.fields[f.name] = { offset, type: f.ftype, size, elemSize };
      if (fieldLayout) layout.fields[f.name].layout = fieldLayout;
      if (f.arrayCount) layout.fields[f.name].arrayCount = f.arrayCount;
      offset += size;
      if (align > layout.__align) layout.__align = align;
    }
    if (!node.packed) offset = (offset + layout.__align - 1) & ~(layout.__align - 1);
    layout.__size = offset;
    layouts[node.name] = layout;
  }

  function resolveLayoutChain(layoutName, fieldParts) {
    let layout = layouts[layoutName];
    let offset = 0;
    let lastType = null;
    let lastLayout = null;

    for (let i = 0; i < fieldParts.length; i++) {
      const fname = fieldParts[i];
      if (fname === '__size') return { offset: layout.__size, type: 'i32', layout: null };
      if (fname === '__align') return { offset: layout.__align, type: 'i32', layout: null };
      const field = layout.fields[fname];
      if (!field) throw new Error(`Layout ${layoutName} has no field '${fname}'`);
      offset += field.offset;
      lastType = field.type;
      lastLayout = field.layout || null;
      // Array field at terminal position — return array info (pointer, not load)
      if (field.arrayCount && i === fieldParts.length - 1) {
        return { offset, type: field.type, layout: lastLayout,
                 arrayCount: field.arrayCount, elemSize: field.elemSize };
      }
      if (lastLayout && i < fieldParts.length - 1) {
        layout = layouts[lastLayout];
        layoutName = lastLayout;
      }
    }
    return { offset, type: lastType, layout: lastLayout };
  }

  function serializeLayouts() {
    const result = {};
    for (const [name, layout] of Object.entries(layouts)) {
      const obj = {};
      for (const [fname, field] of Object.entries(layout.fields)) {
        if (field.arrayCount) {
          obj[fname] = { offset: field.offset, count: field.arrayCount, elemSize: field.elemSize };
        } else {
          obj[fname] = field.offset;
        }
      }
      obj.__size = layout.__size;
      obj.__align = layout.__align;
      result[name] = obj;
    }
    return result;
  }

  // ── Collect memory declarations ──
  const memories = [];  // { name, pages, maxPages, imported }
  for (const node of ast.body) {
    if (node.type === 'MemoryDecl') {
      memories.push({
        name: node.name,
        pages: node.pages,
        maxPages: node.maxPages,
        imported: node.pages === null,
      });
    }
  }
  const memoryIndex = {};  // name → memory index
  for (let mi = 0; mi < memories.length; mi++) memoryIndex[memories[mi].name] = mi;
  const importedMemories = memories.filter(m => m.imported);
  const localMemories = memories.filter(m => !m.imported);

  // ── Collect data segments ──
  const dataSegments = [];  // { memIndex, offset, bytes }
  let dataOffset = 0;
  const dataConsts = {};    // name → i32 value (compile-time constants)
  for (const node of ast.body) {
    if (node.type === 'DataDecl') {
      const memIdx = node.bank ? memoryIndex[node.bank] : 0;
      // A based decl (`= @0x19A0 "…"`) lands at its explicit offset and does
      // not disturb the running counter; an unbased decl packs from 0 upward.
      const based = node.offset != null;
      const segOffset = based ? node.offset : dataOffset;
      dataConsts[node.ptrName] = segOffset;
      dataConsts[node.lenName] = node.bytes.length;
      dataSegments.push({ memIndex: memIdx, offset: segOffset, bytes: node.bytes });
      if (!based) {
        dataOffset += node.bytes.length;
        // Align to 4 bytes for next segment
        dataOffset = (dataOffset + 3) & ~3;
      }
    }
  }

  // Math builtins: imported from JS Math object. Value = param count.
  const MATH_BUILTINS = { sin: 1, cos: 1, ln: 1, exp: 1, pow: 2, atan2: 2 };
  // Native builtins: map directly to Wasm opcodes, no import needed
  const NATIVE_BUILTINS = new Set([
    'sqrt','abs','floor','ceil','trunc','nearest','copysign',
    'min','max','select',
    'clz','ctz','popcnt','rotl','rotr',
    'memory_size','memory_grow','memory_copy','memory_fill',
    'i32','i64','f32','f64', // type conversions
    'f64x2','f32x4','i32x4','i64x2', // vector constructors
  ]);

  // Scan all function bodies for unresolved calls
  const usedCalls = new Set();
  function scanCalls(stmts) {
    for (const s of stmts) {
      if (s.type === 'Call' || s.type === 'FuncCall') usedCalls.add(s.name);
      if (s.type === 'If') { scanCalls(s.body); if (s.elseBody) scanCalls(s.elseBody); }
      if (s.type === 'Case') { for (const a of s.arms) scanCalls(a.body); scanCalls(s.elseBody); }
      if (s.type === 'For' || s.type === 'While' || s.type === 'DoWhile') scanCalls(s.body);
      // scan expressions
      scanExprCalls(s);
    }
  }
  function scanExprCalls(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FuncCall') usedCalls.add(node.name);
    // ** operator may need pow import (for non-sqrt, non-small-int exponents)
    if (node.type === 'BinOp' && node.op === '**') usedCalls.add('pow');
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(scanExprCalls);
      else if (v && typeof v === 'object' && v.type) scanExprCalls(v);
    }
  }
  for (const fn of functions) scanCalls(fn.body);

  // Auto-import math builtins that are actually used
  const mathImports = [];
  for (const name of usedCalls) {
    if (MATH_BUILTINS[name] !== undefined && !localFuncNames.has(name) && !imports.find(im => im.name === name)) {
      const nParams = MATH_BUILTINS[name];
      const params = [];
      for (let k = 0; k < nParams; k++) params.push({ type: 'Param', name: 'x' + k, vtype: 'f64', isArray: false, arrayDims: null });
      mathImports.push({ name, moduleName: 'math', params, retType: 'f64', interpIdx: null });
    }
  }

  // Auto-import: scan AST for unresolved calls, check userImports then globalThis.
  // Param types default to f64 — inferred from the JS function's .length.
  const flatImports = userImports ? flattenImports(userImports) : {};
  const hostImports = [];
  for (const name of usedCalls) {
    if (localFuncNames.has(name) || NATIVE_BUILTINS.has(name) || name.startsWith('wasm.') ||
        name.startsWith('v128.') || ATRA_VECTOR_TYPES.has(name.split('.')[0]) ||
        MATH_BUILTINS[name] !== undefined || imports.find(im => im.name === name)) continue;
    // check flattened userImports then globalThis
    let fn = flatImports[name];
    if (!fn && typeof globalThis !== 'undefined') fn = globalThis[name];
    if (typeof fn === 'function') {
      const nParams = fn.length;
      const params = [];
      for (let k = 0; k < nParams; k++) params.push({ type: 'Param', name: 'x' + k, vtype: 'f64', isArray: false, arrayDims: null });
      hostImports.push({ name, moduleName: 'host', params, retType: 'f64', interpIdx: null, jsFn: fn });
    }
  }

  const allImports = [...mathImports, ...imports, ...hostImports];

  // Build function index table: imports first, then local functions
  const funcIndex = {};
  let idx = 0;
  for (const im of allImports) { funcIndex[im.name] = idx++; }
  for (const fn of functions) { funcIndex[fn.name] = idx++; }

  // Global index table (+ track funcSig for function-typed globals)
  const globalIndex = {};
  const globalFuncSig = {}; // name → funcSig for function-typed globals
  for (let gi = 0; gi < globals.length; gi++) {
    globalIndex[globals[gi].name] = gi;
    if (globals[gi].funcSig) globalFuncSig[globals[gi].name] = globals[gi].funcSig;
  }

  // ── Scan for function references (bare function names used as values) ──
  const referencedFuncs = new Set();
  function scanFuncRefs(stmts, localNames) {
    for (const s of stmts) scanNodeRefs(s, localNames);
  }
  function scanNodeRefs(node, localNames) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FuncRef' && funcIndex[node.name] !== undefined) {
      referencedFuncs.add(node.name);
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => scanNodeRefs(c, localNames));
      else if (v && typeof v === 'object' && v.type) scanNodeRefs(v, localNames);
    }
  }
  for (const fn of functions) {
    const localNames = new Set();
    for (const p of fn.params) localNames.add(p.name);
    for (const l of fn.locals) localNames.add(l.name);
    if (fn.type === 'Function') localNames.add(fn.name); // return var
    scanFuncRefs(fn.body, localNames);
  }

  // Detect if call_indirect is needed (function-typed params/locals/globals exist)
  let hasIndirectCalls = Object.keys(globalFuncSig).length > 0;
  if (!hasIndirectCalls) {
    for (const fn of functions) {
      if (fn.params.some(p => p.funcSig) || fn.locals.some(l => l.funcSig)) { hasIndirectCalls = true; break; }
    }
  }

  // Build table: explicitly referenced funcs always; if call_indirect used, also explicit imports + local functions.
  // Auto-imports only enter the table if explicitly referenced by bare name.
  const autoImportNames = new Set([...mathImports.map(m => m.name), ...hostImports.map(m => m.name)]);
  let tableFuncSet;
  if (hasIndirectCalls) {
    tableFuncSet = new Set([
      ...imports.map(im => im.name),
      ...functions.map(fn => fn.name),
      ...referencedFuncs,
    ]);
    // Exclude auto-imports that aren't explicitly referenced by bare name
    for (const name of autoImportNames) {
      if (!referencedFuncs.has(name)) tableFuncSet.delete(name);
    }
  } else {
    tableFuncSet = new Set(referencedFuncs);
  }
  const tableFuncs = [...tableFuncSet].sort((a, b) => funcIndex[a] - funcIndex[b]);
  const tableSlot = {}; // funcName → table index
  for (let ti = 0; ti < tableFuncs.length; ti++) tableSlot[tableFuncs[ti]] = ti;

  // ── Build type signatures ── every unique function signature, deduped by sigKey
  function paramWasmType(p) { return p.isArray ? 'i32' : p.vtype; }
  function sigKey(params, retType) {
    return params.map(p => paramWasmType(p)).join(',') + ':' + (retType || '');
  }
  const sigMap = new Map();
  const sigList = []; // [{params, retType}]
  function getOrAddSig(params, retType) {
    const key = sigKey(params, retType);
    if (sigMap.has(key)) return sigMap.get(key);
    const id = sigList.length;
    sigList.push({ params, retType });
    sigMap.set(key, id);
    return id;
  }

  // Register all signatures
  const importSigIds = allImports.map(im => getOrAddSig(im.params, im.retType));
  const funcSigIds = functions.map(fn => {
    const retType = fn.type === 'Subroutine' ? null : fn.retType;
    return getOrAddSig(fn.params, retType);
  });

  // ── Determine memory ──
  // Memory is needed when any function uses arrays or layout-typed params (both are i32 pointers)
  const hasArrays = functions.some(fn =>
    fn.params.some(p => p.isArray || p.layoutType) ||
    fn.locals.some(l => l.layoutType));
  const hasDataSegments = dataSegments.length > 0;
  const hasMemory = memories.length > 0 || hasArrays || hasDataSegments;
  // Legacy single-memory mode: no explicit memory declarations
  const legacyMode = memories.length === 0;
  // Import memory if user explicitly provides it (backward compat — even without arrays)
  const legacyImportMemory = legacyMode && userImports && (userImports.__memory || userImports.__memories);
  // Declare local memory if arrays/layouts used but no import provided
  const legacyLocalMemory = legacyMode && (hasArrays || hasDataSegments) && !legacyImportMemory;

  // ── Emit Wasm binary ──
  // Magic + version
  w.bytes([0x00, 0x61, 0x73, 0x6d]); // \0asm
  w.bytes([0x01, 0x00, 0x00, 0x00]); // version 1

  // Type section (1) — every unique (params → retType) signature
  w.section(1, s => {
    s.u32(sigList.length);
    for (const sig of sigList) {
      s.byte(0x60); // func type
      s.u32(sig.params.length);
      for (const p of sig.params) s.byte(wasmType(paramWasmType(p)));
      if (sig.retType) { s.u32(1); s.byte(wasmType(sig.retType)); }
      else s.u32(0);
    }
  });

  // Import section (2) — math builtins (auto-detected), explicit imports, host functions, memories
  const memImportCount = importedMemories.length + (legacyImportMemory ? 1 : 0);
  if (allImports.length > 0 || memImportCount > 0) {
    w.section(2, s => {
      s.u32(allImports.length + memImportCount);
      for (let ii = 0; ii < allImports.length; ii++) {
        const im = allImports[ii];
        s.str(im.moduleName);
        s.str(im.name);
        s.byte(0x00); // func import
        s.u32(importSigIds[ii]);
      }
      if (legacyImportMemory) {
        // Legacy: single unnamed memory
        s.str('env');
        s.str('memory');
        s.byte(0x02); // memory import
        s.byte(0x00); // no max
        s.u32(1); // initial 1 page
      }
      // Multi-memory: imported banks
      for (const mem of importedMemories) {
        s.str('env');
        s.str(mem.name);
        s.byte(0x02); // memory import
        s.byte(0x00); // no max
        s.u32(1);     // initial 1 page
      }
    });
  }

  // Function section (3)
  w.section(3, s => {
    s.u32(functions.length);
    for (const sigId of funcSigIds) s.u32(sigId);
  });

  // Table section (4) — funcref table for call_indirect (function pointers)
  if (tableFuncs.length > 0) {
    w.section(4, s => {
      s.u32(1); // one table
      s.byte(0x70); // funcref
      s.byte(0x00); // no max
      s.u32(tableFuncs.length); // initial size = number of referenced functions
    });
  }

  // Memory section (5) — local memories
  if (legacyLocalMemory) {
    // Legacy: single local memory
    w.section(5, s => {
      s.u32(1);
      s.byte(0x00); // no max
      s.u32(1); // initial: 1 page (64KB)
    });
  }
  if (localMemories.length > 0) {
    w.section(5, s => {
      s.u32(localMemories.length);
      for (const mem of localMemories) {
        if (mem.maxPages !== null) {
          s.byte(0x01); // has max
          s.u32(mem.pages);
          s.u32(mem.maxPages);
        } else {
          s.byte(0x00); // no max
          s.u32(mem.pages);
        }
      }
    });
  }

  // Global section (6)
  if (globals.length > 0) {
    w.section(6, s => {
      s.u32(globals.length);
      for (const g of globals) {
        s.byte(wasmType(g.vtype));
        s.byte(g.mutable ? 0x01 : 0x00);
        // init expression
        emitConstExpr(s, g.init, g.vtype);
        s.byte(OP_END);
      }
    });
  }

  // Export section (7)
  w.section(7, s => {
    const funcExports = functions.map((fn, i) => ({ name: fn.name, idx: allImports.length + i }));
    const legacyMemExport = legacyLocalMemory ? 1 : 0;
    // Multi-memory: export locally declared memories by name
    const memExports = localMemories.map((mem, i) => ({
      name: mem.name,
      idx: importedMemories.length + i,
    }));
    s.u32(funcExports.length + legacyMemExport + memExports.length);
    for (const e of funcExports) {
      s.str(e.name);
      s.byte(0x00); // func export
      s.u32(e.idx);
    }
    if (legacyMemExport) {
      s.str('memory');
      s.byte(0x02); // memory export
      s.u32(0);
    }
    for (const me of memExports) {
      s.str(me.name);
      s.byte(0x02); // memory export
      s.u32(me.idx);
    }
  });

  // Element section (9) — populate table with function references at offset 0
  if (tableFuncs.length > 0) {
    w.section(9, s => {
      s.u32(1); // one element segment
      s.u32(0); // table index 0
      // offset expression: i32.const 0
      s.byte(OP_I32_CONST); s.s32(0); s.byte(OP_END);
      s.u32(tableFuncs.length);
      for (const fname of tableFuncs) s.u32(funcIndex[fname]);
    });
  }

  // Code section (10) — one body per local function, each with compressed locals + bytecode
  w.section(10, s => {
    s.u32(functions.length);
    for (const fn of functions) {
      const bodyWriter = new ByteWriter();
      emitFunctionBody(bodyWriter, fn);
      s.u32(bodyWriter.buf.length);
      s.bytes(bodyWriter.buf);
    }
  });

  // Data section (11) — string data placed in linear memory
  if (dataSegments.length > 0) {
    w.section(11, s => {
      s.u32(dataSegments.length);
      for (const seg of dataSegments) {
        if (memories.length > 1) {
          s.u32(0x02);           // flags: active, explicit memory index
          s.u32(seg.memIndex);   // memory index
        } else {
          s.u32(0x00);           // flags: active, memory 0
        }
        // offset expression: i32.const <offset>
        s.byte(OP_I32_CONST);
        s.s32(seg.offset);
        s.byte(OP_END);
        // data bytes
        s.u32(seg.bytes.length);
        s.bytes(seg.bytes);
      }
    });
  }

  const bytes = w.toUint8Array();
  const table = tableFuncs.length > 0 ? { ...tableSlot } : null;
  const layoutsMeta = Object.keys(layouts).length > 0 ? serializeLayouts() : null;
  return { bytes, table, layouts: layoutsMeta, multiMemory: memories.length > 1 };

  // ── Helper: emit constant init expression ──
  function emitConstExpr(s, node, vtype) {
    if (!node) {
      // default zero
      if (vtype === 'i32') { s.byte(OP_I32_CONST); s.s32(0); }
      else if (vtype === 'i64') { s.byte(OP_I64_CONST); s.s64(0n); }
      else if (vtype === 'f32') { s.byte(OP_F32_CONST); s.f32(0); }
      else if (vtype === 'f64') { s.byte(OP_F64_CONST); s.f64(0); }
      else if (isVector(vtype)) {
        // v128.const with 16 zero bytes
        s.byte(OP_SIMD_PREFIX); s.u32(SIMD_OPS['v128.const']);
        for (let vi = 0; vi < 16; vi++) s.byte(0);
      }
      return;
    }
    if (node.type === 'Ident' && dataConsts[node.name] !== undefined) {
      s.byte(OP_I32_CONST); s.s32(dataConsts[node.name]);
      return;
    }
    if (node.type === 'NumberLit') {
      const val = parseNumericValue(node, vtype);
      emitTypedConst(s, vtype, val);
      return;
    }
    if (node.type === 'UnaryOp' && node.op === '-' && node.operand.type === 'NumberLit') {
      const val = -parseNumericValue(node.operand, vtype);
      emitTypedConst(s, vtype, val);
      return;
    }
    throw new Error('Global init must be a constant expression');
  }

  function parseNumericValue(node, defaultType) {
    const raw = node.value;
    if (raw.includes('.') || raw.includes('e') || raw.includes('E') || node.isFloat) return parseFloat(raw);
    return parseInt(raw, 10);
  }

  function emitTypedConst(s, vtype, val) {
    if (vtype === 'i32') { s.byte(OP_I32_CONST); s.s32(val | 0); }
    else if (vtype === 'i64') { s.byte(OP_I64_CONST); s.s64(BigInt(val)); }
    else if (vtype === 'f32') { s.byte(OP_F32_CONST); s.f32(val); }
    else if (vtype === 'f64') { s.byte(OP_F64_CONST); s.f64(val); }
  }

  // ── Emit function body ──
  function emitFunctionBody(bw, fn) {
    const isFunc = fn.type === 'Function';
    const retType = isFunc ? fn.retType : null;

    // ── Local layout ── params, declared locals, hidden return variable
    const localMap = {}; // name → { idx, vtype }
    let localIdx = 0;
    for (const p of fn.params) {
      const entry = {
        idx: localIdx++,
        vtype: p.isArray ? 'i32' : p.vtype, // Wasm has no array type; arrays are i32 memory pointers
        isArray: p.isArray,
        arrayDims: p.arrayDims,
        elemType: p.isArray ? p.vtype : null,  // element type for load/store
        memIdx: p.memBank ? (memoryIndex[p.memBank] ?? 0) : 0,
      };
      if (p.funcSig) entry.funcSig = p.funcSig;
      if (p.layoutType) entry.layoutType = p.layoutType;
      localMap[p.name] = entry;
    }
    const declaredLocals = [...fn.locals];
    if (isFunc) {
      // $_return: Fortran convention — assigning to the function name sets the return value.
      // Mapped to a hidden local; the function epilogue reads it with local.get.
      declaredLocals.push({ name: '$_return', vtype: retType });
    }
    for (const loc of declaredLocals) {
      const entry = { idx: localIdx++, vtype: loc.vtype };
      if (loc.funcSig) entry.funcSig = loc.funcSig;
      if (loc.layoutType) entry.layoutType = loc.layoutType;
      localMap[loc.name] = entry;
    }

    // Emit local declarations (only the non-param ones)
    const localTypes = declaredLocals.map(l => l.vtype);
    // Compress: runs of same type
    const localRuns = [];
    for (const lt of localTypes) {
      if (localRuns.length > 0 && localRuns[localRuns.length - 1].type === lt) localRuns[localRuns.length - 1].count++;
      else localRuns.push({ count: 1, type: lt });
    }
    bw.u32(localRuns.length);
    for (const run of localRuns) {
      bw.u32(run.count);
      bw.byte(wasmType(run.type));
    }

    // SIMD helper
    function emitSimd(op) { bw.byte(OP_SIMD_PREFIX); bw.u32(op); }

    // Resolve memory bank argument — Ident node referencing a MemoryDecl
    function resolveMemArg(arg) {
      if (arg.type === 'Ident' && memoryIndex[arg.name] !== undefined) return memoryIndex[arg.name];
      throw new Error(`Expected memory bank name, got ${arg.type}: ${arg.name || '?'}`);
    }

    // ── Compile-time constant evaluator for case labels ──
    function evalConstI32(expr) {
      if (expr.type === 'NumberLit') {
        if (expr.isFloat) throw new Error('Case label must be i32, got float');
        return parseInt(expr.value, 10) | 0;
      }
      if (expr.type === 'UnaryOp' && expr.op === '-') return (-evalConstI32(expr.operand)) | 0;
      if (expr.type === 'BinOp') {
        const l = evalConstI32(expr.left), r = evalConstI32(expr.right);
        switch (expr.op) {
          case '+': return (l + r) | 0;
          case '-': return (l - r) | 0;
          case '*': return (l * r) | 0;
          case '/': if (r === 0) throw new Error('Division by zero in case label'); return (l / r) | 0;
          case 'mod': if (r === 0) throw new Error('Modulo by zero in case label'); return (l % r) | 0;
          case '<<': return (l << r) | 0;
          case '>>': return (l >> r) | 0;
          case '&': return (l & r) | 0;
          case '|': return (l | r) | 0;
          case '^': return (l ^ r) | 0;
          default: throw new Error(`Unsupported operator in case label: ${expr.op}`);
        }
      }
      if (expr.type === 'Ident') {
        const gi = globalIndex[expr.name];
        if (gi !== undefined && !globals[gi].mutable && globals[gi].init)
          return evalConstI32(globals[gi].init);
        throw new Error(`Case label must be a compile-time constant, got: ${expr.name}`);
      }
      throw new Error('Case label must be a compile-time i32 constant');
    }

    // ── Statement emission ──
    let depth = 0; // current block nesting depth
    const breakTargets = []; // stack of {depth} for each enclosing loop's break block

    function emitStmts(stmts) { for (const s of stmts) emitStmt(s); }

    function emitStmt(stmt) {
      switch (stmt.type) {
        case 'Assign': {
          const target = stmt.name;

          // Layout field store: s.radius := ..., rec.point.x := ...
          if (target.includes('.')) {
            const parts = target.split('.');
            const first = parts[0];
            const info = localMap[first] || (globalIndex[first] !== undefined ? { layoutType: globals[globalIndex[first]].layoutType } : null);
            if (info && info.layoutType) {
              const resolved = resolveLayoutChain(info.layoutType, parts.slice(1));
              // emit address: get base pointer + offset
              if (localMap[first]) { bw.byte(OP_LOCAL_GET); bw.u32(localMap[first].idx); }
              else { bw.byte(OP_GLOBAL_GET); bw.u32(globalIndex[first]); }
              if (resolved.offset > 0) {
                bw.byte(OP_I32_CONST); bw.s32(resolved.offset);
                bw.byte(OP_I32_ADD);
              }
              // emit value
              emitExpr(stmt.value, resolved.layout ? 'i32' : resolved.type);
              // emit store
              emitStore(resolved.layout ? 'i32' : resolved.type, info.memIdx || 0);
              break;
            }
          }

          // Assignment to function name = set return variable
          if (isFunc && target === fn.name) {
            emitExpr(stmt.value, retType);
            bw.byte(OP_LOCAL_SET);
            bw.u32(localMap['$_return'].idx);
          } else if (localMap[target]) {
            emitExpr(stmt.value, localMap[target].vtype);
            bw.byte(OP_LOCAL_SET);
            bw.u32(localMap[target].idx);
          } else if (globalIndex[target] !== undefined) {
            emitExpr(stmt.value, globals[globalIndex[target]].vtype);
            bw.byte(OP_GLOBAL_SET);
            bw.u32(globalIndex[target]);
          } else {
            throw new Error(`Undefined variable: ${target}`);
          }
          break;
        }
        case 'ArrayStore': {
          // Layout array field store: p.pos[i] := val
          if (stmt.name.includes('.')) {
            const parts = stmt.name.split('.');
            const first = parts[0];
            const varInfo = localMap[first] || (globalIndex[first] !== undefined ? { layoutType: globals[globalIndex[first]].layoutType, globalIdx: globalIndex[first] } : null);
            if (varInfo && varInfo.layoutType) {
              const resolved = resolveLayoutChain(varInfo.layoutType, parts.slice(1));
              if (resolved.arrayCount) {
                // Emit address: base_ptr + field_offset + index * elemSize
                if (localMap[first]) { bw.byte(OP_LOCAL_GET); bw.u32(localMap[first].idx); }
                else { bw.byte(OP_GLOBAL_GET); bw.u32(varInfo.globalIdx); }
                if (resolved.offset > 0) {
                  bw.byte(OP_I32_CONST); bw.s32(resolved.offset);
                  bw.byte(OP_I32_ADD);
                }
                emitExpr(stmt.indices[0], 'i32');
                bw.byte(OP_I32_CONST); bw.s32(resolved.elemSize);
                bw.byte(OP_I32_MUL);
                bw.byte(OP_I32_ADD);
                // Emit value
                const storeType = resolved.layout ? 'i32' : resolved.type;
                emitExpr(stmt.value, storeType);
                emitStore(storeType, varInfo.memIdx || 0);
                break;
              }
            }
          }
          const info = localMap[stmt.name];
          if (!info) throw new Error(`Undefined array: ${stmt.name}`);
          const elemType = info.elemType || info.vtype;
          // compute address
          emitArrayAddr(stmt.name, stmt.indices, info, elemType);
          // compute value
          emitExpr(stmt.value, elemType);
          // store
          emitStore(elemType, info.memIdx || 0);
          break;
        }
        case 'If': {
          emitExpr(stmt.cond, 'i32');
          bw.byte(OP_IF);
          bw.byte(WASM_VOID);
          depth++;
          emitStmts(stmt.body);
          if (stmt.elseBody) {
            bw.byte(OP_ELSE);
            emitStmts(stmt.elseBody);
          }
          depth--;
          bw.byte(OP_END);
          break;
        }
        case 'For': {
          const vInfo = localMap[stmt.varName];
          if (!vInfo) throw new Error(`Undefined loop variable: ${stmt.varName}`);
          const vt = vInfo.vtype;
          emitExpr(stmt.start, vt);
          bw.byte(OP_LOCAL_SET);
          bw.u32(vInfo.idx);

          const hasStep = stmt.step !== null;

          bw.byte(OP_BLOCK); bw.byte(WASM_VOID); depth++;
          const breakDepth = depth; // break target = this block
          bw.byte(OP_LOOP); bw.byte(WASM_VOID); depth++;
          breakTargets.push(breakDepth);

          // condition check: br_if to break block
          bw.byte(OP_LOCAL_GET); bw.u32(vInfo.idx);
          emitExpr(stmt.end, vt);
          if (!hasStep) {
            emitCmp('>=', vt);
          } else {
            const stepIsNegLit = stmt.step.type === 'UnaryOp' && stmt.step.op === '-' && stmt.step.operand.type === 'NumberLit';
            const stepIsNegConst = stepIsNegLit || (stmt.step.type === 'NumberLit' && parseFloat(stmt.step.value) < 0);
            emitCmp(stepIsNegConst ? '<=' : '>=', vt);
          }
          bw.byte(OP_BR_IF); bw.u32(depth - breakDepth);

          emitStmts(stmt.body);

          // increment
          bw.byte(OP_LOCAL_GET); bw.u32(vInfo.idx);
          if (hasStep) { emitExpr(stmt.step, vt); } else { emitTypedConst(bw, vt, 1); }
          emitAdd(vt);
          bw.byte(OP_LOCAL_SET); bw.u32(vInfo.idx);

          bw.byte(OP_BR); bw.u32(0); // continue to loop
          depth--; bw.byte(OP_END); // end loop
          breakTargets.pop();
          depth--; bw.byte(OP_END); // end block
          break;
        }
        case 'While': {
          bw.byte(OP_BLOCK); bw.byte(WASM_VOID); depth++;
          const breakDepth = depth;
          bw.byte(OP_LOOP); bw.byte(WASM_VOID); depth++;
          breakTargets.push(breakDepth);

          emitExpr(stmt.cond, 'i32');
          bw.byte(OP_I32_EQZ);
          bw.byte(OP_BR_IF); bw.u32(depth - breakDepth);

          emitStmts(stmt.body);

          bw.byte(OP_BR); bw.u32(0); // continue loop
          depth--; bw.byte(OP_END); // end loop
          breakTargets.pop();
          depth--; bw.byte(OP_END); // end block
          break;
        }
        case 'DoWhile': {
          bw.byte(OP_BLOCK); bw.byte(WASM_VOID); depth++;
          const breakDepth = depth;
          bw.byte(OP_LOOP); bw.byte(WASM_VOID); depth++;
          breakTargets.push(breakDepth);

          emitStmts(stmt.body);

          emitExpr(stmt.cond, 'i32');
          bw.byte(OP_BR_IF); bw.u32(0); // continue if true

          depth--; bw.byte(OP_END); // end loop
          breakTargets.pop();
          depth--; bw.byte(OP_END); // end block
          break;
        }
        case 'Case': {
          // Evaluate all labels at compile time, check for duplicates
          const caseArms = [];
          const labelSet = new Set();
          for (const arm of stmt.arms) {
            const labels = arm.labels.map(l => {
              const v = evalConstI32(l);
              if (labelSet.has(v)) throw new Error(`Duplicate case label: ${v}`);
              labelSet.add(v);
              return v;
            });
            caseArms.push({ labels, body: arm.body });
          }

          // Compute min/max for gap-filling
          let minLabel = Infinity, maxLabel = -Infinity;
          for (const a of caseArms) for (const v of a.labels) {
            if (v < minLabel) minLabel = v;
            if (v > maxLabel) maxLabel = v;
          }
          const tableSize = maxLabel - minLabel + 1;

          // Build label-value → arm-index map
          const labelToArm = new Map();
          for (let ai = 0; ai < caseArms.length; ai++)
            for (const v of caseArms[ai].labels) labelToArm.set(v, ai);

          const numArms = caseArms.length;

          // Emit nested blocks: $end, then $arm_N-1 down to $arm_0, then $else
          bw.byte(OP_BLOCK); bw.byte(WASM_VOID); depth++; // $end
          const endDepth = depth;
          for (let ai = numArms - 1; ai >= 0; ai--) {
            bw.byte(OP_BLOCK); bw.byte(WASM_VOID); depth++; // $arm_ai
          }
          bw.byte(OP_BLOCK); bw.byte(WASM_VOID); depth++; // $else

          // Selector: subtract min, emit br_table
          emitExpr(stmt.selector, 'i32');
          if (minLabel !== 0) {
            bw.byte(OP_I32_CONST); bw.s32(minLabel);
            bw.byte(OP_I32_SUB);
          }

          // br_table: inside $else block, depths are:
          //   $else=0, $arm_0=1, $arm_1=2, ..., $arm_N-1=N, $end=N+1
          bw.byte(OP_BR_TABLE);
          bw.u32(tableSize); // label vector count
          for (let i = 0; i < tableSize; i++) {
            const armIdx = labelToArm.get(minLabel + i);
            bw.u32(armIdx !== undefined ? armIdx + 1 : 0); // gap → else (0)
          }
          bw.u32(0); // default → $else

          // End $else block, emit else body, br to $end
          depth--; bw.byte(OP_END);
          emitStmts(stmt.elseBody);
          bw.byte(OP_BR); bw.u32(depth - endDepth);

          // End each arm block, emit body, br to $end (last arm falls through)
          for (let ai = 0; ai < numArms; ai++) {
            depth--; bw.byte(OP_END);
            emitStmts(caseArms[ai].body);
            if (ai < numArms - 1) {
              bw.byte(OP_BR); bw.u32(depth - endDepth);
            }
          }

          depth--; bw.byte(OP_END); // end $end
          break;
        }
        case 'Break': {
          if (breakTargets.length === 0) throw new Error('break outside loop');
          const targetDepth = breakTargets[breakTargets.length - 1];
          bw.byte(OP_BR);
          bw.u32(depth - targetDepth);
          break;
        }
        case 'Call': {
          // Early return: call return(expr) or call return()
          if (stmt.name === 'return') {
            if (isFunc) {
              if (stmt.args.length !== 1) throw new Error('return() in a function requires exactly one argument');
              emitExpr(stmt.args[0], retType);
            } else {
              if (stmt.args.length !== 0) throw new Error('return() in a subroutine takes no arguments');
            }
            bw.byte(OP_RETURN);
            break;
          }
          // wasm.* builtins used as statements (e.g. call wasm.store8(...))
          if (stmt.name.startsWith('wasm.')) {
            emitWasmBuiltin(stmt.name.slice(5), stmt, null);
            break;
          }
          // SIMD namespaced builtins used as statements (e.g. call v128.store(...))
          const callDotIdx = stmt.name.indexOf('.');
          if (callDotIdx !== -1) {
            const callPrefix = stmt.name.slice(0, callDotIdx);
            const callMethod = stmt.name.slice(callDotIdx + 1);
            if (isVector(callPrefix) || callPrefix === 'v128') {
              emitSimdBuiltin(callPrefix, callMethod, stmt, null);
              break;
            }
          }
          // Native builtins used as statements (e.g. call memory_copy(...))
          if (NATIVE_BUILTINS.has(stmt.name)) {
            emitFuncCall(stmt, null);
            break;
          }
          // Indirect call via function-typed variable used as statement
          const callLocalInfo = localMap[stmt.name];
          const callGSig = globalFuncSig[stmt.name];
          if ((callLocalInfo && callLocalInfo.funcSig) || callGSig) {
            emitFuncCall(stmt, null);
            break;
          }
          // subroutine call or function call (result discarded)
          const fIdx = funcIndex[stmt.name];
          if (fIdx === undefined) throw new Error(`Undefined function: ${stmt.name}`);
          for (let ai = 0; ai < stmt.args.length; ai++) {
            // infer param type from declaration
            const paramType = getParamType(stmt.name, ai);
            emitExpr(stmt.args[ai], paramType);
          }
          bw.byte(OP_CALL);
          bw.u32(fIdx);
          break;
        }
        case 'TailCall': {
          const tcName = stmt.name;

          // Indirect tail call via function-typed variable
          const tcLocalInfo = localMap[tcName];
          const tcGSig = globalFuncSig[tcName];
          if ((tcLocalInfo && tcLocalInfo.funcSig) || tcGSig) {
            const sig = (tcLocalInfo && tcLocalInfo.funcSig) || tcGSig;
            const calleeRet = sig.retType || null;
            if (calleeRet !== retType)
              throw new Error(`tailcall type mismatch: ${tcName} returns ${calleeRet || 'void'}, current function returns ${retType || 'void'}`);
            for (let ai = 0; ai < stmt.args.length; ai++) {
              const pt = sig.params[ai] ? (sig.params[ai].isArray ? 'i32' : sig.params[ai].vtype) : 'f64';
              emitExpr(stmt.args[ai], pt);
            }
            if (tcLocalInfo) { bw.byte(OP_LOCAL_GET); bw.u32(tcLocalInfo.idx); }
            else { bw.byte(OP_GLOBAL_GET); bw.u32(globalIndex[tcName]); }
            const indirectSigId = getOrAddSig(sig.params, sig.retType);
            bw.byte(OP_RETURN_CALL_INDIRECT);
            bw.u32(indirectSigId);
            bw.u32(0);
            break;
          }

          // Direct tail call — type validation
          const calleeFn = functions.find(f => f.name === tcName);
          const calleeIm = !calleeFn && allImports.find(i => i.name === tcName);
          const calleeRet = calleeFn ? (calleeFn.type === 'Subroutine' ? null : calleeFn.retType)
                          : calleeIm ? calleeIm.retType : null;
          if (calleeRet !== retType)
            throw new Error(`tailcall type mismatch: ${tcName} returns ${calleeRet || 'void'}, current function returns ${retType || 'void'}`);

          const tcFIdx = funcIndex[tcName];
          if (tcFIdx === undefined) throw new Error(`Undefined function: ${tcName}`);
          for (let ai = 0; ai < stmt.args.length; ai++) {
            emitExpr(stmt.args[ai], getParamType(tcName, ai));
          }
          bw.byte(OP_RETURN_CALL);
          bw.u32(tcFIdx);
          break;
        }
        default:
          throw new Error(`Unknown statement type: ${stmt.type}`);
      }
    }

    function getParamType(funcName, paramIdx) {
      // check local functions
      const fn = functions.find(f => f.name === funcName);
      if (fn && fn.params[paramIdx]) return fn.params[paramIdx].isArray ? 'i32' : fn.params[paramIdx].vtype;
      // check imports
      const im = allImports.find(i => i.name === funcName);
      if (im && im.params[paramIdx]) return im.params[paramIdx].vtype;
      return 'f64'; // default
    }

    function resolveType(name) {
      if (localMap[name]) return localMap[name].vtype;
      if (globalIndex[name] !== undefined) return globals[globalIndex[name]].vtype;
      return null;
    }

    // Type inference fallback: when expectedType is null, guess from AST shape. Default is f64.
    function inferExprType(expr) {
      switch (expr.type) {
        case 'NumberLit': {
          if (expr.typeSuffix) return expr.typeSuffix;
          if (expr.isFloat || expr.value.includes('.') || expr.value.includes('e') || expr.value.includes('E')) return 'f64';
          return 'i32';
        }
        case 'FuncRef': return 'i32';
        case 'Ident': {
          const name = expr.name;
          // Data segment constants are always i32
          if (dataConsts[name] !== undefined) return 'i32';
          if (name.includes('.')) {
            const parts = name.split('.');
            const first = parts[0];
            // Layout constant: Sphere.__size, Sphere.radius
            if (layouts[first]) {
              if (parts[1] === '__size' || parts[1] === '__align') return 'i32';
              const resolved = resolveLayoutChain(first, parts.slice(1));
              return resolved.layout ? 'i32' : resolved.type;
            }
            // Layout-typed variable: v.x, v.center.x
            const info = localMap[first];
            if (info && info.layoutType) {
              const resolved = resolveLayoutChain(info.layoutType, parts.slice(1));
              return resolved.layout ? 'i32' : resolved.type;
            }
          }
          return resolveType(name) || 'f64';
        }
        case 'BinOp': {
          const op = expr.op;
          if (op === '==' || op === '/=' || op === '<' || op === '>' || op === '<=' || op === '>='
            || op === 'and' || op === 'or') return 'i32';
          return inferExprType(expr.left);
        }
        case 'UnaryOp': return inferExprType(expr.operand);
        case 'FuncCall': {
          // type conversions / vector constructors
          if (ATRA_TYPES.has(expr.name)) return expr.name;
          // SIMD namespaced builtins
          const dotIdx = expr.name.indexOf('.');
          if (dotIdx !== -1) {
            const prefix = expr.name.slice(0, dotIdx);
            const method = expr.name.slice(dotIdx + 1);
            if (isVector(prefix)) {
              // extract_lane returns the scalar type
              if (method === 'extract_lane') return vectorScalarType(prefix);
              // splat, replace_lane, add, sub, mul, div, neg, abs, sqrt, eq, etc. return the vector type
              return prefix;
            }
            if (prefix === 'v128') {
              // v128.and/or/xor/not/load/load_at return v128 — infer from first arg
              if (method === 'load' || method === 'load_at') return inferExprType(expr.args[0]) || 'f64x2'; // default to f64x2
              if (['and','or','xor','not'].includes(method)) return inferExprType(expr.args[0]);
              if (method === 'store' || method === 'store_at') return 'i32'; // statements
            }
            if (prefix === 'wasm') {
              // wasm.* builtins: most return the type of their first arg
              // reinterpret/extend/trunc return their target type
              if (method === 'extend_i32_u') return 'i64';
              if (method === 'reinterpret_f64') return 'i64';
              if (method === 'reinterpret_f32') return 'i32';
              if (method === 'reinterpret_i64') return 'f64';
              if (method === 'reinterpret_i32') return 'f32';
              if (method === 'trunc_sat_s' || method === 'trunc_sat_u') return expectedType || 'i32';
              // arithmetic/shift/comparison: infer from first arg
              return expr.args.length > 0 ? inferExprType(expr.args[0]) : 'i32';
            }
          }
          // Indirect call via function-typed variable
          const callInfo = localMap[expr.name];
          if (callInfo && callInfo.funcSig && callInfo.funcSig.retType) return callInfo.funcSig.retType;
          if (globalFuncSig[expr.name] && globalFuncSig[expr.name].retType) return globalFuncSig[expr.name].retType;
          // known return types
          const fn = functions.find(f => f.name === expr.name);
          if (fn && fn.retType) return fn.retType;
          return 'f64';
        }
        case 'ArrayAccess': {
          // Layout array field: p.pos[i] → element type
          if (expr.name.includes('.')) {
            const parts = expr.name.split('.');
            const first = parts[0];
            const varInfo = localMap[first] || (globalIndex[first] !== undefined ? { layoutType: globals[globalIndex[first]].layoutType } : null);
            if (varInfo && varInfo.layoutType) {
              const resolved = resolveLayoutChain(varInfo.layoutType, parts.slice(1));
              if (resolved.arrayCount) return resolved.layout ? 'i32' : resolved.type;
            }
          }
          const info = localMap[expr.name];
          return info ? (info.elemType || info.vtype) : 'f64';
        }
        case 'IfExpr': return inferExprType(expr.thenExpr);
        case 'CaseExpr': return inferExprType(expr.arms[0].expr);
        default: return 'f64';
      }
    }

    // ── Expression emission ──
    function emitExpr(expr, expectedType) {
      const actualType = expectedType || inferExprType(expr);

      switch (expr.type) {
        case 'NumberLit': {
          const t = expectedType || inferExprType(expr);
          const raw = expr.value;
          if (t === 'i32') { bw.byte(OP_I32_CONST); bw.s32(parseInt(raw, 10) | 0); }
          else if (t === 'i64') { bw.byte(OP_I64_CONST); bw.s64(BigInt(parseInt(raw, 10))); }
          else if (t === 'f32') { bw.byte(OP_F32_CONST); bw.f32(parseFloat(raw)); }
          else { bw.byte(OP_F64_CONST); bw.f64(parseFloat(raw)); }
          break;
        }
        case 'FuncRef': {
          const name = expr.name;
          if (tableSlot[name] === undefined) throw new Error(`Unknown function: ${name}`);
          bw.byte(OP_I32_CONST); bw.s32(tableSlot[name]);
          break;
        }
        case 'Ident': {
          const name = expr.name;

          // Data segment constants (ptr, len)
          if (dataConsts[name] !== undefined) {
            bw.byte(OP_I32_CONST); bw.s32(dataConsts[name]);
            break;
          }

          // Dotted layout access: v.x, v.center.x, Sphere.__size, Sphere.radius
          if (name.includes('.')) {
            const parts = name.split('.');
            const first = parts[0];

            // Case 1: Layout constant — Layout.__size, Layout.__align, Layout.field offset
            if (layouts[first]) {
              if (parts[1] === '__size') {
                bw.byte(OP_I32_CONST); bw.s32(layouts[first].__size);
                break;
              }
              if (parts[1] === '__align') {
                bw.byte(OP_I32_CONST); bw.s32(layouts[first].__align);
                break;
              }
              const resolved = resolveLayoutChain(first, parts.slice(1));
              bw.byte(OP_I32_CONST); bw.s32(resolved.offset);
              break;
            }

            // Case 2: Layout-typed variable field access — v.x, v.center.x
            const info = localMap[first] || (globalIndex[first] !== undefined ? { layoutType: globals[globalIndex[first]].layoutType, globalIdx: globalIndex[first] } : null);
            if (info && info.layoutType) {
              const resolved = resolveLayoutChain(info.layoutType, parts.slice(1));
              // emit base pointer
              if (localMap[first]) { bw.byte(OP_LOCAL_GET); bw.u32(localMap[first].idx); }
              else { bw.byte(OP_GLOBAL_GET); bw.u32(info.globalIdx); }
              // add offset
              if (resolved.offset > 0) {
                bw.byte(OP_I32_CONST); bw.s32(resolved.offset);
                bw.byte(OP_I32_ADD);
              }
              // If final field is a nested layout or array, leave pointer on stack
              if (resolved.layout || resolved.arrayCount) break;
              emitLoad(resolved.type, info.memIdx || 0);
              break;
            }
          }

          if (isFunc && name === fn.name) {
            // Fortran convention: bare function name reads the return accumulator
            bw.byte(OP_LOCAL_GET); bw.u32(localMap['$_return'].idx);
          }
          else if (localMap[name]) { bw.byte(OP_LOCAL_GET); bw.u32(localMap[name].idx); }
          else if (globalIndex[name] !== undefined) { bw.byte(OP_GLOBAL_GET); bw.u32(globalIndex[name]); }
          else throw new Error(`Undefined variable: ${name}`);
          break;
        }
        case 'BinOp': {
          const t = expectedType || inferExprType(expr);
          emitBinOp(expr, t);
          break;
        }
        case 'UnaryOp': {
          const t = expectedType || inferExprType(expr);
          if (expr.op === '-') {
            if (t === 'f64') { emitExpr(expr.operand, t); bw.byte(OP_F64_NEG); }
            else if (t === 'f32') { emitExpr(expr.operand, t); bw.byte(OP_F32_NEG); }
            else if (t === 'i32') { bw.byte(OP_I32_CONST); bw.s32(0); emitExpr(expr.operand, t); bw.byte(OP_I32_SUB); }
            else if (t === 'i64') { bw.byte(OP_I64_CONST); bw.s64(0n); emitExpr(expr.operand, t); bw.byte(OP_I64_SUB); }
            else if (isVector(t)) { emitExpr(expr.operand, t); emitSimd(SIMD_OPS[t + '.neg']); }
          } else if (expr.op === 'not') {
            emitExpr(expr.operand, 'i32');
            bw.byte(OP_I32_EQZ);
          } else if (expr.op === '~') {
            emitExpr(expr.operand, t);
            if (t === 'i32') { bw.byte(OP_I32_CONST); bw.s32(-1); bw.byte(OP_I32_XOR); }
            else if (t === 'i64') { bw.byte(OP_I64_CONST); bw.s64(-1n); bw.byte(OP_I64_XOR); }
          } else {
            emitExpr(expr.operand, t);
          }
          break;
        }
        case 'FuncCall': {
          emitFuncCall(expr, expectedType);
          break;
        }
        case 'ArrayAccess': {
          // Layout array field access: p.pos[i], p.vertices[i]
          if (expr.name.includes('.')) {
            const parts = expr.name.split('.');
            const first = parts[0];
            const varInfo = localMap[first] || (globalIndex[first] !== undefined ? { layoutType: globals[globalIndex[first]].layoutType, globalIdx: globalIndex[first] } : null);
            if (varInfo && varInfo.layoutType) {
              const resolved = resolveLayoutChain(varInfo.layoutType, parts.slice(1));
              if (resolved.arrayCount) {
                // Emit: base_ptr + field_offset + index * elemSize
                if (localMap[first]) { bw.byte(OP_LOCAL_GET); bw.u32(localMap[first].idx); }
                else { bw.byte(OP_GLOBAL_GET); bw.u32(varInfo.globalIdx); }
                if (resolved.offset > 0) {
                  bw.byte(OP_I32_CONST); bw.s32(resolved.offset);
                  bw.byte(OP_I32_ADD);
                }
                // + index * elemSize
                emitExpr(expr.indices[0], 'i32');
                bw.byte(OP_I32_CONST); bw.s32(resolved.elemSize);
                bw.byte(OP_I32_MUL);
                bw.byte(OP_I32_ADD);
                // If element is a layout, leave pointer on stack; otherwise load
                if (resolved.layout) break;
                emitLoad(resolved.type, varInfo.memIdx || 0);
                break;
              }
            }
          }
          const info = localMap[expr.name];
          if (!info) throw new Error(`Undefined array: ${expr.name}`);
          const elemType = info.elemType || info.vtype;
          emitArrayAddr(expr.name, expr.indices, info, elemType);
          emitLoad(elemType, info.memIdx || 0);
          break;
        }
        case 'IfExpr': {
          const t = expectedType || inferExprType(expr.thenExpr);
          emitExpr(expr.cond, 'i32');
          bw.byte(OP_IF);
          bw.byte(wasmType(t));
          emitExpr(expr.thenExpr, t);
          bw.byte(OP_ELSE);
          emitExpr(expr.elseExpr, t);
          bw.byte(OP_END);
          break;
        }
        case 'CaseExpr': {
          const t = expectedType || inferExprType(expr.arms[0].expr);
          const wt = wasmType(t);

          // Evaluate labels, check duplicates
          const ceArms = [];
          const ceLabelSet = new Set();
          for (const arm of expr.arms) {
            const labels = arm.labels.map(l => {
              const v = evalConstI32(l);
              if (ceLabelSet.has(v)) throw new Error(`Duplicate case label: ${v}`);
              ceLabelSet.add(v);
              return v;
            });
            ceArms.push({ labels, expr: arm.expr });
          }

          let ceMin = Infinity, ceMax = -Infinity;
          for (const a of ceArms) for (const v of a.labels) {
            if (v < ceMin) ceMin = v;
            if (v > ceMax) ceMax = v;
          }
          const ceTableSize = ceMax - ceMin + 1;
          const ceLabelToArm = new Map();
          for (let ai = 0; ai < ceArms.length; ai++)
            for (const v of ceArms[ai].labels) ceLabelToArm.set(v, ai);
          const ceNumArms = ceArms.length;

          // Outer block (typed) — receives the final value
          bw.byte(OP_BLOCK); bw.byte(wt); // $end (typed)
          for (let ai = ceNumArms - 1; ai >= 0; ai--) {
            bw.byte(OP_BLOCK); bw.byte(WASM_VOID); // $arm_ai
          }
          bw.byte(OP_BLOCK); bw.byte(WASM_VOID); // $else

          // Selector
          emitExpr(expr.selector, 'i32');
          if (ceMin !== 0) {
            bw.byte(OP_I32_CONST); bw.s32(ceMin);
            bw.byte(OP_I32_SUB);
          }

          // br_table
          bw.byte(OP_BR_TABLE);
          bw.u32(ceTableSize);
          for (let i = 0; i < ceTableSize; i++) {
            const armIdx = ceLabelToArm.get(ceMin + i);
            bw.u32(armIdx !== undefined ? armIdx + 1 : 0);
          }
          bw.u32(0); // default → $else

          // end $else, emit else expr, br $end
          bw.byte(OP_END);
          emitExpr(expr.elseExpr, t);
          bw.byte(OP_BR); bw.u32(ceNumArms); // br $end

          // each arm
          for (let ai = 0; ai < ceNumArms; ai++) {
            bw.byte(OP_END);
            emitExpr(ceArms[ai].expr, t);
            if (ai < ceNumArms - 1) {
              bw.byte(OP_BR); bw.u32(ceNumArms - ai - 1); // br $end
            }
          }

          bw.byte(OP_END); // end $end
          break;
        }
        default:
          throw new Error(`Unknown expression type: ${expr.type}`);
      }
    }

    // ── Binary operators ──
    function emitBinOp(expr, t) {
      const op = expr.op;

      // Exponentiation
      if (op === '**') {
        emitPow(expr, t);
        return;
      }

      // Comparison operators return i32
      if (op === '==' || op === '/=' || op === '<' || op === '>' || op === '<=' || op === '>=') {
        const operandType = inferExprType(expr.left);
        emitExpr(expr.left, operandType);
        emitExpr(expr.right, operandType);
        emitCmp(op, operandType);
        return;
      }

      // Logical: and, or
      if (op === 'and') {
        emitExpr(expr.left, 'i32');
        emitExpr(expr.right, 'i32');
        bw.byte(OP_I32_AND);
        return;
      }
      if (op === 'or') {
        emitExpr(expr.left, 'i32');
        emitExpr(expr.right, 'i32');
        bw.byte(OP_I32_OR);
        return;
      }

      emitExpr(expr.left, t);
      emitExpr(expr.right, t);

      if (op === '+') emitAdd(t);
      else if (op === '-') emitSub(t);
      else if (op === '*') emitMul(t);
      else if (op === '/') emitDiv(t);
      else if (op === 'mod') {
        if (t === 'i32') bw.byte(OP_I32_REM_S);
        else if (t === 'i64') bw.byte(OP_I64_REM_S);
        else throw new Error('mod requires integer type');
      }
      else if (op === '&') { if (t === 'i32') bw.byte(OP_I32_AND); else bw.byte(OP_I64_AND); }
      else if (op === '|') { if (t === 'i32') bw.byte(OP_I32_OR); else bw.byte(OP_I64_OR); }
      else if (op === '^') { if (t === 'i32') bw.byte(OP_I32_XOR); else bw.byte(OP_I64_XOR); }
      else if (op === '<<') { if (t === 'i32') bw.byte(OP_I32_SHL); else bw.byte(OP_I64_SHL); }
      else if (op === '>>') { if (t === 'i32') bw.byte(OP_I32_SHR_S); else bw.byte(OP_I64_SHR_S); }
      else throw new Error(`Unknown operator: ${op}`);
    }

    function emitPow(expr, t) {
      // **0.5 → sqrt
      if (expr.right.type === 'NumberLit' && (expr.right.value === '0.5' || expr.right.value === '.5')) {
        emitExpr(expr.left, t);
        if (t === 'f64') bw.byte(OP_F64_SQRT);
        else if (t === 'f32') bw.byte(OP_F32_SQRT);
        return;
      }
      // General: call pow import (works for all cases including **2, **3)
      emitExpr(expr.left, 'f64');
      emitExpr(expr.right, 'f64');
      bw.byte(OP_CALL);
      bw.u32(funcIndex['pow']);
      // Convert result back if needed
      if (t === 'f32') bw.byte(OP_F32_DEMOTE_F64);
    }

    // ── Function call dispatch ──
    // Priority: vector constructors > type conversions > SIMD builtins > native builtins
    //         > wasm.* escape hatch > indirect calls (call_indirect) > regular calls
    function emitFuncCall(expr, expectedType) {
      const name = expr.name;

      // Vector constructors: f64x2(a, b), f32x4(a, b, c, d), etc.
      if (isVector(name)) {
        emitVectorConstructor(name, expr.args);
        return;
      }

      // Scalar type conversions: i32(x), f64(x), etc.
      if (ATRA_TYPES.has(name)) {
        const fromType = inferExprType(expr.args[0]);
        const toType = name;
        emitExpr(expr.args[0], fromType);
        emitConversion(fromType, toType);
        return;
      }

      // SIMD namespaced builtins: f64x2.splat, v128.and, etc.
      const dotIdx = name.indexOf('.');
      if (dotIdx !== -1) {
        const prefix = name.slice(0, dotIdx);
        const method = name.slice(dotIdx + 1);
        if (isVector(prefix) || prefix === 'v128') {
          emitSimdBuiltin(prefix, method, expr, expectedType);
          return;
        }
      }

      // Native builtins — with vector type support
      if (name === 'sqrt') {
        emitExpr(expr.args[0], expectedType);
        if (isVector(expectedType)) { const op = SIMD_OPS[expectedType + '.sqrt']; if (op === undefined) throw new Error('sqrt not supported for ' + expectedType); emitSimd(op); }
        else if (expectedType === 'f32') bw.byte(OP_F32_SQRT);
        else bw.byte(OP_F64_SQRT);
        return;
      }
      if (name === 'abs') {
        emitExpr(expr.args[0], expectedType);
        if (isVector(expectedType)) { const op = SIMD_OPS[expectedType + '.abs']; if (op === undefined) throw new Error('abs not supported for ' + expectedType); emitSimd(op); }
        else if (expectedType === 'f32') bw.byte(OP_F32_ABS);
        else bw.byte(OP_F64_ABS);
        return;
      }
      if (name === 'floor') { emitExpr(expr.args[0], expectedType); if (expectedType === 'f32') bw.byte(OP_F32_FLOOR); else bw.byte(OP_F64_FLOOR); return; }
      if (name === 'ceil') { emitExpr(expr.args[0], expectedType); if (expectedType === 'f32') bw.byte(OP_F32_CEIL); else bw.byte(OP_F64_CEIL); return; }
      if (name === 'trunc') { emitExpr(expr.args[0], expectedType); if (expectedType === 'f32') bw.byte(OP_F32_TRUNC); else bw.byte(OP_F64_TRUNC); return; }
      if (name === 'nearest') { emitExpr(expr.args[0], expectedType); if (expectedType === 'f32') bw.byte(OP_F32_NEAREST); else bw.byte(OP_F64_NEAREST); return; }
      if (name === 'min') {
        if (isVector(expectedType)) {
          emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType);
          const op = SIMD_OPS[expectedType + '.min']; if (op === undefined) throw new Error('min not supported for ' + expectedType); emitSimd(op);
        } else if (expectedType === 'i32' || expectedType === 'i64') {
          // Wasm has no i32.min/i64.min — emit: a b a b lt_s select
          emitExpr(expr.args[0], expectedType);
          emitExpr(expr.args[1], expectedType);
          emitExpr(expr.args[0], expectedType);
          emitExpr(expr.args[1], expectedType);
          bw.byte(expectedType === 'i32' ? OP_I32_LT_S : OP_I64_LT_S);
          bw.byte(OP_SELECT);
        } else {
          emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType);
          if (expectedType === 'f32') bw.byte(OP_F32_MIN);
          else bw.byte(OP_F64_MIN);
        }
        return;
      }
      if (name === 'max') {
        if (isVector(expectedType)) {
          emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType);
          const op = SIMD_OPS[expectedType + '.max']; if (op === undefined) throw new Error('max not supported for ' + expectedType); emitSimd(op);
        } else if (expectedType === 'i32' || expectedType === 'i64') {
          // Wasm has no i32.max/i64.max — emit: a b a b gt_s select
          emitExpr(expr.args[0], expectedType);
          emitExpr(expr.args[1], expectedType);
          emitExpr(expr.args[0], expectedType);
          emitExpr(expr.args[1], expectedType);
          bw.byte(expectedType === 'i32' ? OP_I32_GT_S : OP_I64_GT_S);
          bw.byte(OP_SELECT);
        } else {
          emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType);
          if (expectedType === 'f32') bw.byte(OP_F32_MAX);
          else bw.byte(OP_F64_MAX);
        }
        return;
      }
      if (name === 'copysign') { emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType); if (expectedType === 'f32') bw.byte(OP_F32_COPYSIGN); else bw.byte(OP_F64_COPYSIGN); return; }
      if (name === 'select') {
        // select(a, b, cond) — Wasm select picks a if cond!=0, b otherwise
        const t = expectedType || inferExprType(expr.args[0]);
        emitExpr(expr.args[0], t);
        emitExpr(expr.args[1], t);
        emitExpr(expr.args[2], 'i32');
        bw.byte(OP_SELECT);
        return;
      }
      if (name === 'clz') { emitExpr(expr.args[0], expectedType); if (expectedType === 'i64') bw.byte(OP_I64_CLZ); else bw.byte(OP_I32_CLZ); return; }
      if (name === 'ctz') { emitExpr(expr.args[0], expectedType); if (expectedType === 'i64') bw.byte(OP_I64_CTZ); else bw.byte(OP_I32_CTZ); return; }
      if (name === 'popcnt') { emitExpr(expr.args[0], expectedType); if (expectedType === 'i64') bw.byte(OP_I64_POPCNT); else bw.byte(OP_I32_POPCNT); return; }
      if (name === 'rotl') { emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType); if (expectedType === 'i64') bw.byte(OP_I64_ROTL); else bw.byte(OP_I32_ROTL); return; }
      if (name === 'rotr') { emitExpr(expr.args[0], expectedType); emitExpr(expr.args[1], expectedType); if (expectedType === 'i64') bw.byte(OP_I64_ROTR); else bw.byte(OP_I32_ROTR); return; }
      if (name === 'memory_size') {
        // memory_size() → mem 0; memory_size(bank) → mem by name
        const mIdx = expr.args.length > 0 ? resolveMemArg(expr.args[0]) : 0;
        bw.byte(OP_MEMORY_SIZE); bw.u32(mIdx);
        return;
      }
      if (name === 'memory_grow') {
        // memory_grow(n) → mem 0; memory_grow(bank, n) → mem by name
        if (expr.args.length === 2) {
          const mIdx = resolveMemArg(expr.args[0]);
          emitExpr(expr.args[1], 'i32');
          bw.byte(OP_MEMORY_GROW); bw.u32(mIdx);
        } else {
          emitExpr(expr.args[0], 'i32');
          bw.byte(OP_MEMORY_GROW); bw.u32(0);
        }
        return;
      }
      if (name === 'memory_copy') {
        if (expr.args.length === 5) {
          // memory_copy(dst_bank, src_bank, dest, src, nbytes)
          const dstIdx = resolveMemArg(expr.args[0]);
          const srcIdx = resolveMemArg(expr.args[1]);
          emitExpr(expr.args[2], 'i32');
          emitExpr(expr.args[3], 'i32');
          emitExpr(expr.args[4], 'i32');
          bw.byte(OP_FC_PREFIX); bw.u32(10); bw.u32(dstIdx); bw.u32(srcIdx);
        } else {
          // memory_copy(dest, src, nbytes) — within mem 0
          emitExpr(expr.args[0], 'i32'); emitExpr(expr.args[1], 'i32'); emitExpr(expr.args[2], 'i32');
          bw.byte(OP_FC_PREFIX); bw.u32(10); bw.u32(0); bw.u32(0);
        }
        return;
      }
      if (name === 'memory_fill') {
        if (expr.args.length === 4) {
          // memory_fill(bank, dest, val, nbytes)
          const mIdx = resolveMemArg(expr.args[0]);
          emitExpr(expr.args[1], 'i32');
          emitExpr(expr.args[2], 'i32');
          emitExpr(expr.args[3], 'i32');
          bw.byte(OP_FC_PREFIX); bw.u32(11); bw.u32(mIdx);
        } else {
          // memory_fill(dest, val, nbytes) — mem 0
          emitExpr(expr.args[0], 'i32'); emitExpr(expr.args[1], 'i32'); emitExpr(expr.args[2], 'i32');
          bw.byte(OP_FC_PREFIX); bw.u32(11); bw.u32(0);
        }
        return;
      }

      // wasm.* escape hatch
      if (name.startsWith('wasm.')) {
        emitWasmBuiltin(name.slice(5), expr, expectedType);
        return;
      }

      // Indirect call via function-typed variable
      const localInfo = localMap[name];
      const gSig = globalFuncSig[name];
      if ((localInfo && localInfo.funcSig) || gSig) {
        const sig = (localInfo && localInfo.funcSig) || gSig;
        // Emit arguments using funcSig param types
        for (let ai = 0; ai < expr.args.length; ai++) {
          const pt = sig.params[ai] ? (sig.params[ai].isArray ? 'i32' : sig.params[ai].vtype) : 'f64';
          emitExpr(expr.args[ai], pt);
        }
        // Push the table index (the variable value)
        if (localInfo) { bw.byte(OP_LOCAL_GET); bw.u32(localInfo.idx); }
        else { bw.byte(OP_GLOBAL_GET); bw.u32(globalIndex[name]); }
        // call_indirect type_index table_index
        const indirectSigId = getOrAddSig(sig.params, sig.retType);
        bw.byte(OP_CALL_INDIRECT);
        bw.u32(indirectSigId);
        bw.u32(0); // table index 0
        return;
      }

      // Regular function call
      const fIdx = funcIndex[name];
      if (fIdx === undefined) throw new Error(`Undefined function: ${name}`);
      for (let ai = 0; ai < expr.args.length; ai++) {
        const paramType = getParamType(name, ai);
        emitExpr(expr.args[ai], paramType);
      }
      bw.byte(OP_CALL);
      bw.u32(fIdx);
    }

    function emitWasmBuiltin(op, expr, expectedType) {
      const t = expectedType || 'i32';
      if (op === 'div_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_DIV_U : OP_I32_DIV_U); return; }
      if (op === 'rem_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_REM_U : OP_I32_REM_U); return; }
      if (op === 'shr_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_SHR_U : OP_I32_SHR_U); return; }
      if (op === 'lt_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_LT_U : OP_I32_LT_U); return; }
      if (op === 'gt_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_GT_U : OP_I32_GT_U); return; }
      if (op === 'le_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_LE_U : OP_I32_LE_U); return; }
      if (op === 'ge_u') { emitExpr(expr.args[0], t); emitExpr(expr.args[1], t); bw.byte(t === 'i64' ? OP_I64_GE_U : OP_I32_GE_U); return; }
      if (op === 'reinterpret_f64') { emitExpr(expr.args[0], 'f64'); bw.byte(OP_I64_REINTERPRET_F64); return; }
      if (op === 'reinterpret_f32') { emitExpr(expr.args[0], 'f32'); bw.byte(OP_I32_REINTERPRET_F32); return; }
      if (op === 'reinterpret_i64') { emitExpr(expr.args[0], 'i64'); bw.byte(OP_F64_REINTERPRET_I64); return; }
      if (op === 'reinterpret_i32') { emitExpr(expr.args[0], 'i32'); bw.byte(OP_F32_REINTERPRET_I32); return; }
      if (op === 'extend8_s') { emitExpr(expr.args[0], t); bw.byte(t === 'i64' ? OP_I64_EXTEND8_S : OP_I32_EXTEND8_S); return; }
      if (op === 'extend16_s') { emitExpr(expr.args[0], t); bw.byte(t === 'i64' ? OP_I64_EXTEND16_S : OP_I32_EXTEND16_S); return; }
      if (op === 'extend_i32_u') { emitExpr(expr.args[0], 'i32'); bw.byte(OP_I64_EXTEND_I32_U); return; }
      // Sub-word memory access: wasm.load8_s(addr), wasm.store8(addr, val), etc.
      // These emit i32.load8_s etc. with align=0, offset=0, operating on memory 0.
      if (op === 'load8_s') { emitExpr(expr.args[0], 'i32'); bw.byte(OP_I32_LOAD8_S); bw.u32(0); bw.u32(0); return; }
      if (op === 'load8_u') { emitExpr(expr.args[0], 'i32'); bw.byte(OP_I32_LOAD8_U); bw.u32(0); bw.u32(0); return; }
      if (op === 'load16_s') { emitExpr(expr.args[0], 'i32'); bw.byte(OP_I32_LOAD16_S); bw.u32(0); bw.u32(0); return; }
      if (op === 'load16_u') { emitExpr(expr.args[0], 'i32'); bw.byte(OP_I32_LOAD16_U); bw.u32(0); bw.u32(0); return; }
      if (op === 'store8') { emitExpr(expr.args[0], 'i32'); emitExpr(expr.args[1], 'i32'); bw.byte(OP_I32_STORE8); bw.u32(0); bw.u32(0); return; }
      if (op === 'store16') { emitExpr(expr.args[0], 'i32'); emitExpr(expr.args[1], 'i32'); bw.byte(OP_I32_STORE16); bw.u32(0); bw.u32(0); return; }
      if (op === 'trunc_sat_s') {
        const fromType = inferExprType(expr.args[0]);
        emitExpr(expr.args[0], fromType);
        bw.byte(OP_FC_PREFIX);
        if (t === 'i32' && fromType === 'f32') bw.u32(OP_I32_TRUNC_SAT_F32_S);
        else if (t === 'i32' && fromType === 'f64') bw.u32(OP_I32_TRUNC_SAT_F64_S);
        else if (t === 'i64' && fromType === 'f32') bw.u32(OP_I64_TRUNC_SAT_F32_S);
        else if (t === 'i64' && fromType === 'f64') bw.u32(OP_I64_TRUNC_SAT_F64_S);
        return;
      }
      if (op === 'trunc_sat_u') {
        const fromType = inferExprType(expr.args[0]);
        emitExpr(expr.args[0], fromType);
        bw.byte(OP_FC_PREFIX);
        if (t === 'i32' && fromType === 'f32') bw.u32(OP_I32_TRUNC_SAT_F32_U);
        else if (t === 'i32' && fromType === 'f64') bw.u32(OP_I32_TRUNC_SAT_F64_U);
        else if (t === 'i64' && fromType === 'f32') bw.u32(OP_I64_TRUNC_SAT_F32_U);
        else if (t === 'i64' && fromType === 'f64') bw.u32(OP_I64_TRUNC_SAT_F64_U);
        return;
      }
      throw new Error(`Unknown wasm builtin: wasm.${op}`);
    }

    function emitVectorConstructor(vecType, args) {
      const scalar = vectorScalarType(vecType);
      const laneCount = vecType === 'f32x4' || vecType === 'i32x4' ? 4 : 2;

      if (args.length !== laneCount) throw new Error(`${vecType} constructor expects ${laneCount} args, got ${args.length}`);

      // Check if all args are constant (NumberLit or negative NumberLit)
      const allConst = args.every(a =>
        a.type === 'NumberLit' ||
        (a.type === 'UnaryOp' && a.op === '-' && a.operand.type === 'NumberLit'));

      if (allConst) {
        // Emit v128.const with inline bytes
        emitSimd(SIMD_OPS['v128.const']);
        const abuf = new ArrayBuffer(16);
        const view = new DataView(abuf);
        for (let li = 0; li < laneCount; li++) {
          const a = args[li];
          const raw = a.type === 'NumberLit' ? a.value : a.operand.value;
          const val = a.type === 'UnaryOp' ? -parseFloat(raw) : parseFloat(raw);
          if (scalar === 'f64') view.setFloat64(li * 8, val, true);
          else if (scalar === 'f32') view.setFloat32(li * 4, val, true);
          else if (scalar === 'i32') view.setInt32(li * 4, val | 0, true);
          else if (scalar === 'i64') {
            // BigInt64 as two i32s, little-endian
            const bv = BigInt(Math.trunc(val));
            view.setInt32(li * 8, Number(bv & 0xffffffffn), true);
            view.setInt32(li * 8 + 4, Number((bv >> 32n) & 0xffffffffn), true);
          }
        }
        bw.bytes(new Uint8Array(abuf));
      } else {
        // Splat first arg, then replace_lane for the rest
        emitExpr(args[0], scalar);
        emitSimd(SIMD_OPS[vecType + '.splat']);
        for (let li = 1; li < laneCount; li++) {
          emitExpr(args[li], scalar);
          emitSimd(SIMD_OPS[vecType + '.replace_lane']);
          bw.byte(li);
        }
      }
    }

    // ── SIMD builtins ──
    function emitSimdBuiltin(prefix, method, expr, expectedType) {
      // f64x2.splat(x), i32x4.splat(x), etc.
      if (method === 'splat') {
        const scalar = vectorScalarType(prefix);
        emitExpr(expr.args[0], scalar);
        emitSimd(SIMD_OPS[prefix + '.splat']);
        return;
      }

      // f64x2.extract_lane(v, lane)
      if (method === 'extract_lane') {
        emitExpr(expr.args[0], prefix);
        emitSimd(SIMD_OPS[prefix + '.extract_lane']);
        // lane must be a constant
        if (expr.args[1].type !== 'NumberLit') throw new Error('extract_lane requires constant lane index');
        bw.byte(parseInt(expr.args[1].value, 10));
        return;
      }

      // f64x2.replace_lane(v, lane, x)
      if (method === 'replace_lane') {
        const scalar = vectorScalarType(prefix);
        emitExpr(expr.args[0], prefix); // v128 value
        emitExpr(expr.args[2], scalar); // replacement scalar
        emitSimd(SIMD_OPS[prefix + '.replace_lane']);
        if (expr.args[1].type !== 'NumberLit') throw new Error('replace_lane requires constant lane index');
        bw.byte(parseInt(expr.args[1].value, 10));
        return;
      }

      // f64x2.eq, f64x2.ne, f64x2.lt, f64x2.gt, f64x2.le, f64x2.ge
      if (['eq','ne','lt','gt','le','ge','lt_s','gt_s','le_s','ge_s'].includes(method)) {
        emitExpr(expr.args[0], prefix);
        emitExpr(expr.args[1], prefix);
        const key = prefix + '.' + method;
        const op = SIMD_OPS[key];
        if (op === undefined) throw new Error(`Unknown SIMD op: ${key}`);
        emitSimd(op);
        return;
      }

      // f64x2.neg, f64x2.abs, f64x2.sqrt (unary)
      if (['neg','abs','sqrt'].includes(method)) {
        emitExpr(expr.args[0], prefix);
        const key = prefix + '.' + method;
        const op = SIMD_OPS[key];
        if (op === undefined) throw new Error(`Unknown SIMD op: ${key}`);
        emitSimd(op);
        return;
      }

      // f64x2.add, f64x2.sub, f64x2.mul, f64x2.div, f64x2.min, f64x2.max (binary)
      if (['add','sub','mul','div','min','max'].includes(method)) {
        emitExpr(expr.args[0], prefix);
        emitExpr(expr.args[1], prefix);
        const key = prefix + '.' + method;
        const op = SIMD_OPS[key];
        if (op === undefined) throw new Error(`Unknown SIMD op: ${key}`);
        emitSimd(op);
        return;
      }

      // f64x2.relaxed_madd(a, b, c), f64x2.relaxed_nmadd(a, b, c) (ternary: a*b+c / -(a*b)+c)
      if (['relaxed_madd','relaxed_nmadd'].includes(method)) {
        emitExpr(expr.args[0], prefix);
        emitExpr(expr.args[1], prefix);
        emitExpr(expr.args[2], prefix);
        const key = prefix + '.' + method;
        const op = SIMD_OPS[key];
        if (op === undefined) throw new Error(`Unknown SIMD op: ${key}`);
        emitSimd(op);
        return;
      }

      // v128.and, v128.or, v128.xor (binary bitwise)
      if (prefix === 'v128' && ['and','or','xor'].includes(method)) {
        // Infer operand type from first arg
        const vt = inferExprType(expr.args[0]);
        emitExpr(expr.args[0], vt);
        emitExpr(expr.args[1], vt);
        emitSimd(SIMD_OPS['v128.' + method]);
        return;
      }

      // v128.not (unary bitwise)
      if (prefix === 'v128' && method === 'not') {
        const vt = inferExprType(expr.args[0]);
        emitExpr(expr.args[0], vt);
        emitSimd(SIMD_OPS['v128.not']);
        return;
      }

      // v128.load(arr, i) — load 16 bytes from memory at arr + i * 16
      // Convenience form for the common case of iterating an f64x2-aligned
      // 1D buffer; index `i` is the f64x2 lane index.
      if (prefix === 'v128' && method === 'load') {
        // Compute address: arr + i * 16
        emitExpr(expr.args[0], 'i32'); // base pointer
        emitExpr(expr.args[1], 'i32'); // index
        bw.byte(OP_I32_CONST); bw.s32(16);
        bw.byte(OP_I32_MUL);
        bw.byte(OP_I32_ADD);
        emitSimd(SIMD_OPS['v128.load']); bw.u32(4); bw.u32(0); // align=16
        return;
      }

      // v128.store(arr, i, v) — store 16 bytes to memory at arr + i * 16
      if (prefix === 'v128' && method === 'store') {
        // Compute address
        emitExpr(expr.args[0], 'i32');
        emitExpr(expr.args[1], 'i32');
        bw.byte(OP_I32_CONST); bw.s32(16);
        bw.byte(OP_I32_MUL);
        bw.byte(OP_I32_ADD);
        // Emit value
        const vt = inferExprType(expr.args[2]);
        emitExpr(expr.args[2], vt);
        emitSimd(SIMD_OPS['v128.store']); bw.u32(4); bw.u32(0);
        return;
      }

      // v128.load_at(arr, bytes) — load 16 bytes from memory at arr + bytes
      // (byte-offset addressing for arbitrary 2D / strided access patterns).
      // align hint is 8 since f64 arrays are always 8-byte aligned; runtime
      // takes the fast path automatically when 16-byte alignment lines up
      // and the slow path otherwise — both correct.
      if (prefix === 'v128' && method === 'load_at') {
        emitExpr(expr.args[0], 'i32'); // base pointer
        emitExpr(expr.args[1], 'i32'); // byte offset
        bw.byte(OP_I32_ADD);
        emitSimd(SIMD_OPS['v128.load']); bw.u32(3); bw.u32(0); // align=8
        return;
      }

      // v128.store_at(arr, bytes, v) — store 16 bytes to memory at arr + bytes
      if (prefix === 'v128' && method === 'store_at') {
        emitExpr(expr.args[0], 'i32');
        emitExpr(expr.args[1], 'i32');
        bw.byte(OP_I32_ADD);
        const vt = inferExprType(expr.args[2]);
        emitExpr(expr.args[2], vt);
        emitSimd(SIMD_OPS['v128.store']); bw.u32(3); bw.u32(0); // align=8
        return;
      }

      throw new Error(`Unknown SIMD builtin: ${prefix}.${method}`);
    }

    // ── Type conversion ──
    function emitConversion(from, to) {
      if (from === to) return;
      if (from === 'i32' && to === 'f64') bw.byte(OP_F64_CONVERT_I32_S);
      else if (from === 'i32' && to === 'f32') bw.byte(OP_F32_CONVERT_I32_S);
      else if (from === 'i32' && to === 'i64') bw.byte(OP_I64_EXTEND_I32_S);
      else if (from === 'i64' && to === 'i32') bw.byte(OP_I32_WRAP_I64);
      else if (from === 'i64' && to === 'f64') bw.byte(OP_F64_CONVERT_I64_S);
      else if (from === 'i64' && to === 'f32') bw.byte(OP_F32_CONVERT_I64_S);
      else if (from === 'f64' && to === 'i32') bw.byte(OP_I32_TRUNC_F64_S);
      else if (from === 'f64' && to === 'i64') bw.byte(OP_I64_TRUNC_F64_S);
      else if (from === 'f64' && to === 'f32') bw.byte(OP_F32_DEMOTE_F64);
      else if (from === 'f32' && to === 'f64') bw.byte(OP_F64_PROMOTE_F32);
      else if (from === 'f32' && to === 'i32') bw.byte(OP_I32_TRUNC_F32_S);
      else if (from === 'f32' && to === 'i64') bw.byte(OP_I64_TRUNC_F32_S);
      else throw new Error(`Cannot convert ${from} to ${to}`);
    }

    // ── Memory access ── array addressing: base + index * sizeof(elemType)
    function emitArrayAddr(name, indices, info, elemType) {
      // Base pointer
      bw.byte(OP_LOCAL_GET);
      bw.u32(info.idx);

      const sz = typeSize(elemType);

      if (indices.length === 1) {
        // 1D: base + i * sizeof
        emitExpr(indices[0], 'i32');
        bw.byte(OP_I32_CONST); bw.s32(sz);
        bw.byte(OP_I32_MUL);
        bw.byte(OP_I32_ADD);
      } else if (indices.length === 3 && !info.arrayDims) {
        // 2D with explicit stride: a[i, stride, j] → base + (i*stride + j) * sizeof
        emitExpr(indices[0], 'i32');
        emitExpr(indices[1], 'i32');
        bw.byte(OP_I32_MUL);
        emitExpr(indices[2], 'i32');
        bw.byte(OP_I32_ADD);
        bw.byte(OP_I32_CONST); bw.s32(sz);
        bw.byte(OP_I32_MUL);
        bw.byte(OP_I32_ADD);
      } else if (indices.length === 2 && info.arrayDims && info.arrayDims.length === 2) {
        // 2D with declared dims: a[i, j] → base + (i*dim1 + j) * sizeof
        emitExpr(indices[0], 'i32');
        emitExpr(info.arrayDims[1], 'i32');
        bw.byte(OP_I32_MUL);
        emitExpr(indices[1], 'i32');
        bw.byte(OP_I32_ADD);
        bw.byte(OP_I32_CONST); bw.s32(sz);
        bw.byte(OP_I32_MUL);
        bw.byte(OP_I32_ADD);
      } else {
        throw new Error(`Unsupported array index pattern for ${name}`);
      }
    }

    // Multi-memory memarg encoding: when bit 6 (0x40) of the alignment byte is set,
    // a memory index (LEB128) follows before the offset. When clear, memory 0 is implicit.
    function emitLoad(t, memIdx = 0) {
      const a2 = memIdx > 0 ? (2 | 0x40) : 2;  // align=4 + multi-mem flag
      const a3 = memIdx > 0 ? (3 | 0x40) : 3;  // align=8 + multi-mem flag
      const a4 = memIdx > 0 ? (4 | 0x40) : 4;  // align=16 + multi-mem flag
      if (t === 'i32') { bw.byte(OP_I32_LOAD); bw.u32(a2); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (t === 'i64') { bw.byte(OP_I64_LOAD); bw.u32(a3); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (t === 'f32') { bw.byte(OP_F32_LOAD); bw.u32(a2); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (t === 'f64') { bw.byte(OP_F64_LOAD); bw.u32(a3); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (isVector(t)) { emitSimd(SIMD_OPS['v128.load']); bw.u32(a4); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
    }

    function emitStore(t, memIdx = 0) {
      const a2 = memIdx > 0 ? (2 | 0x40) : 2;
      const a3 = memIdx > 0 ? (3 | 0x40) : 3;
      const a4 = memIdx > 0 ? (4 | 0x40) : 4;
      if (t === 'i32') { bw.byte(OP_I32_STORE); bw.u32(a2); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (t === 'i64') { bw.byte(OP_I64_STORE); bw.u32(a3); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (t === 'f32') { bw.byte(OP_F32_STORE); bw.u32(a2); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (t === 'f64') { bw.byte(OP_F64_STORE); bw.u32(a3); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
      else if (isVector(t)) { emitSimd(SIMD_OPS['v128.store']); bw.u32(a4); if (memIdx > 0) bw.u32(memIdx); bw.u32(0); }
    }

    // ── Comparison + arithmetic helpers ──
    function emitCmp(op, t) {
      if (t === 'f64') {
        if (op === '==') bw.byte(OP_F64_EQ);
        else if (op === '/=') bw.byte(OP_F64_NE);
        else if (op === '<') bw.byte(OP_F64_LT);
        else if (op === '>') bw.byte(OP_F64_GT);
        else if (op === '<=') bw.byte(OP_F64_LE);
        else if (op === '>=') bw.byte(OP_F64_GE);
      } else if (t === 'f32') {
        if (op === '==') bw.byte(OP_F32_EQ);
        else if (op === '/=') bw.byte(OP_F32_NE);
        else if (op === '<') bw.byte(OP_F32_LT);
        else if (op === '>') bw.byte(OP_F32_GT);
        else if (op === '<=') bw.byte(OP_F32_LE);
        else if (op === '>=') bw.byte(OP_F32_GE);
      } else if (t === 'i32') {
        if (op === '==') bw.byte(OP_I32_EQ);
        else if (op === '/=') bw.byte(OP_I32_NE);
        else if (op === '<') bw.byte(OP_I32_LT_S);
        else if (op === '>') bw.byte(OP_I32_GT_S);
        else if (op === '<=') bw.byte(OP_I32_LE_S);
        else if (op === '>=') bw.byte(OP_I32_GE_S);
      } else if (t === 'i64') {
        if (op === '==') bw.byte(OP_I64_EQ);
        else if (op === '/=') bw.byte(OP_I64_NE);
        else if (op === '<') bw.byte(OP_I64_LT_S);
        else if (op === '>') bw.byte(OP_I64_GT_S);
        else if (op === '<=') bw.byte(OP_I64_LE_S);
        else if (op === '>=') bw.byte(OP_I64_GE_S);
      } else if (isVector(t)) {
        // Vector comparisons — map atra ops to SIMD opcode keys
        const isIntVec = (t === 'i32x4' || t === 'i64x2');
        const suffix = isIntVec ? '_s' : '';
        let key;
        if (op === '==') key = t + '.eq';
        else if (op === '/=') key = t + '.ne';
        else if (op === '<') key = t + (isIntVec ? '.lt_s' : '.lt');
        else if (op === '>') key = t + (isIntVec ? '.gt_s' : '.gt');
        else if (op === '<=') key = t + (isIntVec ? '.le_s' : '.le');
        else if (op === '>=') key = t + (isIntVec ? '.ge_s' : '.ge');
        const opcode = SIMD_OPS[key];
        if (opcode === undefined) throw new Error(`Comparison ${op} not supported for ${t}`);
        emitSimd(opcode);
      }
    }

    function emitAdd(t) {
      if (t === 'f64') bw.byte(OP_F64_ADD);
      else if (t === 'f32') bw.byte(OP_F32_ADD);
      else if (t === 'i32') bw.byte(OP_I32_ADD);
      else if (t === 'i64') bw.byte(OP_I64_ADD);
      else if (isVector(t)) emitSimd(SIMD_OPS[t + '.add']);
    }

    function emitSub(t) {
      if (t === 'f64') bw.byte(OP_F64_SUB);
      else if (t === 'f32') bw.byte(OP_F32_SUB);
      else if (t === 'i32') bw.byte(OP_I32_SUB);
      else if (t === 'i64') bw.byte(OP_I64_SUB);
      else if (isVector(t)) emitSimd(SIMD_OPS[t + '.sub']);
    }

    function emitMul(t) {
      if (t === 'f64') bw.byte(OP_F64_MUL);
      else if (t === 'f32') bw.byte(OP_F32_MUL);
      else if (t === 'i32') bw.byte(OP_I32_MUL);
      else if (t === 'i64') bw.byte(OP_I64_MUL);
      else if (isVector(t)) emitSimd(SIMD_OPS[t + '.mul']);
    }

    function emitDiv(t) {
      if (t === 'f64') bw.byte(OP_F64_DIV);
      else if (t === 'f32') bw.byte(OP_F32_DIV);
      else if (t === 'i32') bw.byte(OP_I32_DIV_S);
      else if (t === 'i64') bw.byte(OP_I64_DIV_S);
      else if (isVector(t)) {
        const op = SIMD_OPS[t + '.div'];
        if (!op) throw new Error('Division not supported for ' + t);
        emitSimd(op);
      }
    }

    // ── Emit function body statements ──
    emitStmts(fn.body);

    // ── End of function body: return value ──
    if (isFunc) {
      bw.byte(OP_LOCAL_GET);
      bw.u32(localMap['$_return'].idx);
    }
    bw.byte(OP_END);
  }
}

// -- atra.js --

// Public API — tagged template, .compile, .parse, .dump, .run, self-registration
//
// Pipeline: source → lex → parse → codegen → bytes → WebAssembly.Module → exports





function compileSource(source, interpValues, userImports) {
  const tokens = lex(source);
  const ast = parse(tokens);
  return codegen(ast, interpValues, userImports);
}

function instantiate(bytes, userImports, interpValues) {
  const importObj = {
    math: { sin: Math.sin, cos: Math.cos, ln: Math.log, exp: Math.exp, pow: Math.pow, atan2: Math.atan2 },
    host: {},
  };
  if (userImports) {
    const flat = flattenImports(userImports);
    for (const [k, v] of Object.entries(flat)) importObj.host[k] = v;
  }

  // Interpolated imports
  if (interpValues) {
    for (let i = 0; i < interpValues.length; i++) {
      const v = interpValues[i];
      if (typeof v === 'function') {
        importObj.host['__INTERP_' + i + '__'] = v;
      }
    }
  }

  // Memory
  if (userImports && userImports.__memories) {
    // Multi-memory: each named bank → env.bankname
    if (!importObj.env) importObj.env = {};
    for (const [name, mem] of Object.entries(userImports.__memories)) {
      importObj.env[name] = mem;
    }
  } else if (userImports && userImports.__memory) {
    // Legacy single memory
    if (!importObj.env) importObj.env = {};
    importObj.env.memory = userImports.__memory;
  }

  const mod = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(mod, importObj);
  return instance;
}

function wrapExports(instance, table) {
  const exports = Object.create(instance.exports);
  if (table) exports.__table = table;
  // Nest dotted export names: "physics.gravity" → exports.physics.gravity
  for (const key of Object.keys(instance.exports)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let obj = exports;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = instance.exports[key];
    }
  }
  return exports;
}

function normalizeMemoryImport(userImports) {
  if (!userImports || !userImports.memory) return userImports;
  const mem = userImports.memory;
  if (mem instanceof WebAssembly.Memory) {
    // Single memory (legacy) — keep __memory for backward compat
    if (!userImports.__memory) {
      return Object.assign({}, userImports, { __memory: mem });
    }
    return userImports;
  }
  if (typeof mem === 'object') {
    // Multi-memory: { name: WebAssembly.Memory, ... }
    return Object.assign({}, userImports, { __memories: mem });
  }
  return userImports;
}

function compileAndInstantiate(strings, values, userImports) {
  userImports = normalizeMemoryImport(userImports);
  // Join template strings with interpolation markers
  let source = strings[0];
  for (let i = 0; i < values.length; i++) {
    // Numbers and strings inline directly into source text.
    // Strings act as source inclusion (like #include).
    // Functions become __INTERP_N__ markers, resolved as host imports by codegen.
    if (typeof values[i] === 'number') {
      source += String(values[i]);
    } else if (typeof values[i] === 'string') {
      source += values[i];
    } else {
      source += '__INTERP_' + i + '__';
    }
    source += strings[i + 1];
  }

  const { bytes, table, layouts, multiMemory } = compileSource(source, values, userImports);
  if (multiMemory && !atra.hasMultiMemory) {
    throw new Error('Multi-memory not supported in this environment — requires Chrome 120+, Firefox 125+, or Edge 120+');
  }
  const instance = instantiate(bytes, userImports, values);
  const exports = wrapExports(instance, table);
  if (layouts) exports.__layouts = layouts;
  return exports;
}

function atra(stringsOrOpts, ...values) {
  // Curried form detection: atra({imports})`...` vs atra`...`
  // Tagged templates pass a strings array with a .raw property; a plain object won't have it.
  if (stringsOrOpts && !Array.isArray(stringsOrOpts) && typeof stringsOrOpts === 'object' && !stringsOrOpts.raw) {
    const opts = stringsOrOpts;
    return function(strings, ...vals) {
      return compileAndInstantiate(strings, vals, opts);
    };
  }
  // Direct form: atra`...`
  return compileAndInstantiate(stringsOrOpts, values, null);
}

// Direct compiler access
atra.compile = function(source, userImports) {
  return compileSource(source, null, userImports || null).bytes;
};

atra.parse = function(source) {
  const tokens = lex(source);
  const ast = parse(tokens);
  // Compute layout metadata from LayoutDecl nodes
  ast.layouts = computeLayouts(ast);
  return ast;
};

function computeLayouts(ast) {
  const result = {};
  const layouts = {};
  for (const node of ast.body) {
    if (node.type !== 'LayoutDecl') continue;
    const layout = { fields: {}, __align: 1, packed: node.packed };
    let offset = 0;
    for (const f of node.fields) {
      let size, align, fieldLayout;
      if (layouts[f.ftype]) {
        fieldLayout = f.ftype;
        size = layouts[f.ftype].__size;
        align = node.packed ? 1 : layouts[f.ftype].__align;
      } else {
        size = typeSizeForLayout(f.ftype);
        align = node.packed ? 1 : size;
      }
      if (!node.packed) offset = (offset + align - 1) & ~(align - 1);
      let elemSize = size;
      if (f.arrayCount) size = elemSize * f.arrayCount;
      layout.fields[f.name] = { offset, type: f.ftype, size, elemSize };
      if (fieldLayout) layout.fields[f.name].layout = fieldLayout;
      if (f.arrayCount) layout.fields[f.name].arrayCount = f.arrayCount;
      offset += size;
      if (align > layout.__align) layout.__align = align;
    }
    if (!node.packed) offset = (offset + layout.__align - 1) & ~(layout.__align - 1);
    layout.__size = offset;
    layouts[node.name] = layout;
    // Serialize for JS
    const obj = {};
    for (const [fname, field] of Object.entries(layout.fields)) {
      if (field.arrayCount) {
        obj[fname] = { offset: field.offset, count: field.arrayCount, elemSize: field.elemSize };
      } else {
        obj[fname] = field.offset;
      }
    }
    obj.__size = layout.__size;
    obj.__align = layout.__align;
    result[node.name] = obj;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function typeSizeForLayout(t) {
  if (t === 'i32' || t === 'f32') return 4;
  if (t === 'i64' || t === 'f64') return 8;
  throw new Error('Unknown type in layout: ' + t);
}

atra.dump = function(source) {
  const { bytes } = compileSource(source, null, null);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
};

atra.run = function(source, userImports) {
  userImports = normalizeMemoryImport(userImports);
  const { bytes, table, layouts, multiMemory } = compileSource(source, null, userImports);
  if (multiMemory && !atra.hasMultiMemory) {
    throw new Error('Multi-memory not supported in this environment — requires Chrome 120+, Firefox 125+, or Edge 120+');
  }
  const instance = instantiate(bytes, userImports, null);
  const exports = wrapExports(instance, table);
  if (layouts) exports.__layouts = layouts;
  return exports;
};

// ── Self-registration ──

if (typeof window !== 'undefined') {
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/atra',
      version: '0.1.0',
      taggedLanguage: { name: 'atra', tokenize: tokenizeAtra, completions: atraCompletions, sigHint: atraSigHint },
    });
  } else {
    // bare-language fallback — used when atra is loaded outside Auditable
    if (!window._taggedLanguages) window._taggedLanguages = {};
    window._taggedLanguages.atra = { tokenize: tokenizeAtra, completions: atraCompletions, sigHint: atraSigHint };
  }
}

// ── Feature detection ──

// Probe: can this environment compile a Wasm module with 2 memories?
// Cached boolean — safe to check programmatically: if (!atra.hasMultiMemory) ...
atra.hasMultiMemory = typeof WebAssembly !== 'undefined' && (() => {
  try {
    new WebAssembly.Module(new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x05, 0x05, 0x02, 0x00, 0x01, 0x00, 0x01  // memory section: 2 memories, 1 page each
    ]));
    return true;
  } catch { return false; }
})();

// Attach internals for testing / advanced use
atra._lex = lex;
atra._parse = parse;
atra._tokenize = tokenizeAtra;

export { atra };

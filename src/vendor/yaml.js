// ⚠ VENDORED — DO NOT EDIT. @gcu/yaml, the strict YAML subset (parse to a typed tree, emit canonical text), copied from ../auditable/ext/yaml/index.js at auditable 5fa5f72e (MIT).
// Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/yaml — A strict, auditable subset of YAML 1.2 for hand-authored configuration. Tag-free conforming documents round-trip identically through vanilla YAML parsers. Tags are opaque metadata; no parse-time resolution, no RCE surface.

// ── src/types.js ──

// AST node shape and error class for @gcu/yaml.
//
// Every node is one of:
//   { kind: 'scalar', type: 'null'|'bool'|'int'|'float'|'string', value, ... }
//   { kind: 'map',  entries: [{ key, value }] }
//   { kind: 'seq',  items: [Node] }
//
// All nodes carry:
//   tag                    — string | null
//   leadingComments        — string[]  (comments on lines above the node)
//   trailingComment        — string | null  (same-line trailing)
//   blockTrailingComments  — string[]  (comments attached after the node's region)
//   loc                    — { line, column } 1-based, byte-counted
//
// Scalar nodes may carry hints (not data) for the emitter:
//   radix       — 'hex' | 'oct' | 'bin'                (int only)
//   separators  — true                                  (int only: emit underscores)
//   style       — 'double' | 'single' | 'block-clip'
//                | 'block-strip'                         (string only)

class YamlParseError extends Error {
  constructor(rule, line, column, message, byteRange) {
    super(`[rule ${rule}] line ${line}, col ${column}: ${message}`);
    this.name = 'YamlParseError';
    this.rule = rule;
    this.line = line;
    this.column = column;
    this.byteRange = byteRange || null;
  }
}

function scalar(type, value, opts = {}) {
  return {
    kind: 'scalar',
    type,
    value,
    radix: opts.radix || null,
    separators: opts.separators || false,
    style: opts.style || null,
    tag: opts.tag || null,
    leadingComments: opts.leadingComments || [],
    trailingComment: opts.trailingComment || null,
    blockTrailingComments: opts.blockTrailingComments || [],
    loc: opts.loc || { line: 0, column: 0 },
  };
}

function mapNode(entries, opts = {}) {
  return {
    kind: 'map',
    entries: entries || [],
    tag: opts.tag || null,
    leadingComments: opts.leadingComments || [],
    trailingComment: opts.trailingComment || null,
    blockTrailingComments: opts.blockTrailingComments || [],
    loc: opts.loc || { line: 0, column: 0 },
  };
}

function seqNode(items, opts = {}) {
  return {
    kind: 'seq',
    items: items || [],
    tag: opts.tag || null,
    leadingComments: opts.leadingComments || [],
    trailingComment: opts.trailingComment || null,
    blockTrailingComments: opts.blockTrailingComments || [],
    loc: opts.loc || { line: 0, column: 0 },
  };
}

function mapEntry(key, value) {
  return { key, value };
}

const MAX_DEPTH = 64;

// ── src/lex.js ──

// Lexer for @gcu/yaml.
//
// Two layers:
//   1. preprocess(text) — splits into line records, normalizes CRLF→LF,
//      rejects BOM and bare CR, strips trailing SP, computes indent.
//   2. Scalar / key / tag / comment parsers — pure functions the parser
//      uses to interpret line content.
//
// Block scalar bodies are NOT processed here. The parser captures the body
// lines verbatim from the raw line records.


// ---- 1. Line preprocessing ------------------------------------------------

function preprocess(text) {
  // §4.1 — UTF-8 BOM at start is an error.
  if (text.length > 0 && text.charCodeAt(0) === 0xFEFF) {
    throw new YamlParseError('4.1', 1, 1, 'UTF-8 BOM not permitted');
  }

  // §4.2 — accept LF and CRLF; bare CR is an error. We walk the input
  // character by character to give precise diagnostics for bare CR.
  const out = [];
  let line = 1, col = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0D) {
      if (text.charCodeAt(i + 1) !== 0x0A) {
        throw new YamlParseError('4.2', line, col, 'bare CR not followed by LF');
      }
      // Skip the CR; the LF on the next iteration ends the line.
      continue;
    }
    out.push(text[i]);
    if (c === 0x0A) { line++; col = 1; }
    else { col++; }
  }
  const norm = out.join('');

  // Split into line records.
  const lines = [];
  let cur = '';
  let curLine = 1;
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    if (ch === '\n') {
      lines.push(makeLineRecord(cur, curLine));
      cur = '';
      curLine++;
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) lines.push(makeLineRecord(cur, curLine));
  return lines;
}

function makeLineRecord(raw, lineNumber) {
  // §4.4 — strip trailing SP silently.
  let end = raw.length;
  while (end > 0 && raw.charCodeAt(end - 1) === 0x20) end--;
  const trimmed = raw.slice(0, end);

  // §4.4 — tabs anywhere before the first non-whitespace character are
  // forbidden (and tabs as a separator are forbidden, but the parser checks
  // that against content).
  let indent = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    if (c === 0x20) { indent++; continue; }
    if (c === 0x09) {
      throw new YamlParseError('4.4', lineNumber, i + 1,
        'tab not permitted in indentation');
    }
    break;
  }

  return {
    raw,
    indent,
    content: trimmed.slice(indent),
    lineNumber,
    isBlank: trimmed.length === 0,
  };
}

// ---- 2. Comment splitting -------------------------------------------------

// Splits a line's content into { body, comment }.
//   body:    content with the trailing-comment portion removed and any
//            trailing SP between body and # stripped.
//   comment: the comment text without the # (or null if no comment).
// Respects "..." and '...' boundaries so a # inside a string is not a comment.
// A trailing # must have at least one SP before it (or be at start of content).
function splitComment(content) {
  let inDQ = false, inSQ = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inDQ) {
      if (c === '\\') { i++; continue; }  // skip escaped next char
      if (c === '"') inDQ = false;
      continue;
    }
    if (inSQ) {
      if (c === "'" && content[i + 1] === "'") { i++; continue; }
      if (c === "'") inSQ = false;
      continue;
    }
    if (c === '"') { inDQ = true; continue; }
    if (c === "'") { inSQ = true; continue; }
    if (c === '#') {
      if (i === 0 || content[i - 1] === ' ') {
        let bodyEnd = i;
        while (bodyEnd > 0 && content[bodyEnd - 1] === ' ') bodyEnd--;
        return { body: content.slice(0, bodyEnd), comment: content.slice(i + 1) };
      }
      // # not preceded by SP — part of value. Let the value parser fail on it.
    }
  }
  return { body: content, comment: null };
}

// Returns true if content is a comment-only line (after indent).
function isCommentOnly(content) {
  return content.length > 0 && content[0] === '#';
}

// Extracts the text of a comment-only line (without the leading #).
function commentBody(content) {
  return content.slice(1);
}

// ---- 3. Character classes ------------------------------------------------

function isLetterOrUnderscore(c) {
  return (c >= 0x41 && c <= 0x5A)   // A-Z
      || (c >= 0x61 && c <= 0x7A)   // a-z
      || c === 0x5F;                 // _
}

function isDigit(c) {
  return c >= 0x30 && c <= 0x39;
}

function isBareKeyTail(c) {
  return isLetterOrUnderscore(c) || isDigit(c) || c === 0x2D || c === 0x2E;  // - .
}

function isTagNameTail(c) {
  // §9.2 — tag names exclude the dot.
  return isLetterOrUnderscore(c) || isDigit(c) || c === 0x2D;
}

// ---- 4. Tag parsing ------------------------------------------------------

// If `content` starts with a tag, returns { tag, restAfterTag, tagWidth }.
// `restAfterTag` is `content` with the tag and the SP after it (if any) consumed.
// Returns null if there is no tag. Throws on malformed tag.
function tryParseTag(content, lineNumber, columnBase) {
  if (content[0] !== '!') return null;

  if (content[1] === '!') {
    throw new YamlParseError('9.2', lineNumber, columnBase + 1,
      '!!-prefixed tags not permitted');
  }
  if (content[1] === '<') {
    throw new YamlParseError('9.2', lineNumber, columnBase + 1,
      'verbatim !<...> tags not permitted');
  }
  if (content.length < 2 || !isLetterOrUnderscore(content.charCodeAt(1))) {
    throw new YamlParseError('9.2', lineNumber, columnBase + 1,
      'tag name must begin with letter or underscore');
  }

  let i = 2;
  while (i < content.length && isTagNameTail(content.charCodeAt(i))) i++;
  const tag = content.slice(1, i);

  // After the tag, expect either end-of-content, or exactly one SP then more.
  let rest = content.slice(i);
  if (rest.length > 0 && rest[0] !== ' ') {
    throw new YamlParseError('9.3', lineNumber, columnBase + i + 1,
      'tag must be followed by space or end of line');
  }
  if (rest.length > 0) rest = rest.slice(1);

  return { tag, restAfterTag: rest, tagWidth: i + (content.slice(i).length > 0 ? 1 : 0) };
}

// ---- 5. Bare key detection -----------------------------------------------

function tryParseBareKey(content) {
  if (content.length === 0) return null;
  if (!isLetterOrUnderscore(content.charCodeAt(0))) return null;
  let i = 1;
  while (i < content.length && isBareKeyTail(content.charCodeAt(i))) i++;
  return { key: content.slice(0, i), len: i };
}

// ---- 6. Scalar value parsing ---------------------------------------------

// Parses the "value" text (after `key: ` or `- `).
//   { node }            — scalar AST node
//   { emptySeq: true }  — text was `[]`
//   { emptyMap: true }  — text was `{}`
// Throws on malformed values or unquoted plain scalars.
function parseValueText(text, lineNumber, columnBase) {
  if (text === '[]') return { emptySeq: true };
  if (text === '{}') return { emptyMap: true };

  // Detect any flow-collection use beyond empty (must come before scalar parse
  // so we point at the right column).
  rejectFlowChars(text, lineNumber, columnBase);

  if (text === 'null') {
    return { node: scalar('null', null, { loc: { line: lineNumber, column: columnBase } }) };
  }
  if (text === 'true') {
    return { node: scalar('bool', true, { loc: { line: lineNumber, column: columnBase } }) };
  }
  if (text === 'false') {
    return { node: scalar('bool', false, { loc: { line: lineNumber, column: columnBase } }) };
  }

  if (/^(Null|NULL|~)$/.test(text)) {
    throw new YamlParseError('6.1', lineNumber, columnBase,
      `null must be written as 'null' (got '${text}')`);
  }
  if (/^(True|TRUE|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|y|Y|n|N)$/.test(text)) {
    throw new YamlParseError('6.2', lineNumber, columnBase,
      `booleans must be 'true' or 'false' (got '${text}')`);
  }

  if (text[0] === '"') {
    return { node: parseDoubleQuoted(text, lineNumber, columnBase) };
  }
  if (text[0] === "'") {
    return { node: parseSingleQuoted(text, lineNumber, columnBase) };
  }

  // Try integer first (since "1" parses as int, not float). Then float.
  const intResult = tryParseInt(text);
  if (intResult !== null) {
    if (intResult.error) {
      throw new YamlParseError(intResult.rule, lineNumber, columnBase, intResult.error);
    }
    return {
      node: scalar('int', intResult.value, {
        radix: intResult.radix,
        separators: intResult.separators,
        loc: { line: lineNumber, column: columnBase },
      }),
    };
  }

  const floatResult = tryParseFloat(text);
  if (floatResult !== null) {
    if (floatResult.error) {
      throw new YamlParseError(floatResult.rule, lineNumber, columnBase, floatResult.error);
    }
    return {
      node: scalar('float', floatResult.value, {
        loc: { line: lineNumber, column: columnBase },
      }),
    };
  }

  // No quote, doesn't match null/bool/int/float → plain scalar, rejected.
  throw new YamlParseError('6.5', lineNumber, columnBase,
    `plain (unquoted) scalars not permitted; quote the value`);
}

function rejectFlowChars(text, lineNumber, columnBase) {
  let inDQ = false, inSQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inDQ) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inDQ = false;
      continue;
    }
    if (inSQ) {
      if (c === "'" && text[i + 1] === "'") { i++; continue; }
      if (c === "'") inSQ = false;
      continue;
    }
    if (c === '"') { inDQ = true; continue; }
    if (c === "'") { inSQ = true; continue; }
    if (c === '[' || c === ']' || c === '{' || c === '}') {
      throw new YamlParseError('8.3', lineNumber, columnBase + i,
        'flow collections not permitted except empty [] and {}');
    }
  }
}

// ---- 7. Integer parsing --------------------------------------------------

function tryParseInt(text) {
  if (text.length === 0) return null;

  let sign = 1;
  let s = text;
  // §6.3 — hex/oct/bin allow only leading '-' (not '+').
  if (s[0] === '+') { sign = 1; s = s.slice(1); }
  else if (s[0] === '-') { sign = -1; s = s.slice(1); }

  if (s.length === 0) return null;

  // Hex / Oct / Bin
  if (s[0] === '0' && s.length > 1) {
    const p = s[1];
    if (p === 'x' || p === 'X') return parseRadix(s.slice(2), 16, sign, 'hex', text[0] === '+');
    if (p === 'o' || p === 'O') return parseRadix(s.slice(2), 8, sign, 'oct', text[0] === '+');
    if (p === 'b' || p === 'B') return parseRadix(s.slice(2), 2, sign, 'bin', text[0] === '+');
  }

  // Decimal: 0 alone, or [1-9] then digit/_digit
  if (!/^[0-9]/.test(s)) return null;
  if (s === '0') return { value: 0, radix: null, separators: false };
  if (s[0] === '0') {
    // Could be a float (0.5) or invalid (01). Only reject if it's a pure-digit
    // run that doesn't continue into a float.
    if (/^0[0-9_]/.test(s) && !s.includes('.') && !/[eE]/.test(s)) {
      return { error: 'decimal integers may not have a leading zero', rule: '6.3' };
    }
    return null;  // let the float parser try
  }

  if (!validateUnderscored(s, c => c >= '0' && c <= '9')) {
    // Not a pure integer literal — could still be a float (has '.', 'e', etc.).
    return null;
  }

  const separators = s.includes('_');
  const plain = s.replace(/_/g, '');
  const value = sign * Number(plain);
  if (!Number.isSafeInteger(value)) {
    return { error: 'integer outside safe range (above 2^53)', rule: '6.3' };
  }
  return { value, radix: null, separators };
}

function parseRadix(body, radix, sign, name, hadPlus) {
  if (hadPlus) return { error: `${name} integer cannot have leading '+'`, rule: '6.3' };
  if (body.length === 0) {
    return { error: `${name} integer requires at least one digit`, rule: '6.3' };
  }
  if (body[0] === '_') return { error: 'leading underscore not permitted in number', rule: '6.3' };
  if (body[body.length - 1] === '_') return { error: 'trailing underscore not permitted in number', rule: '6.3' };
  if (body.includes('__')) return { error: 'doubled underscore not permitted in number', rule: '6.3' };

  let valid;
  if (radix === 16) valid = c => /[0-9a-fA-F]/.test(c) || c === '_';
  else if (radix === 8) valid = c => (c >= '0' && c <= '7') || c === '_';
  else valid = c => c === '0' || c === '1' || c === '_';

  for (const c of body) {
    if (!valid(c)) return null;
  }

  const stripped = body.replace(/_/g, '');
  const value = sign * parseInt(stripped, radix);
  if (!Number.isSafeInteger(value)) {
    return { error: `${name} integer outside safe range`, rule: '6.3' };
  }
  return { value, radix: name, separators: body.includes('_') };
}

function validateUnderscored(s, isAllowedDigit) {
  if (s.length === 0) return false;
  if (s[0] === '_' || s[s.length - 1] === '_') return false;
  let prev = null;
  for (const c of s) {
    if (c === '_') {
      if (prev === '_' || prev === null) return false;
    } else if (!isAllowedDigit(c)) {
      return false;
    }
    prev = c;
  }
  return true;
}

// ---- 8. Float parsing ----------------------------------------------------

function tryParseFloat(text) {
  // To be a float, the token must contain '.' or 'e'/'E'.
  let s = text;
  let sign = 1;
  if (s[0] === '+') s = s.slice(1);
  else if (s[0] === '-') { sign = -1; s = s.slice(1); }

  const hasDot = s.includes('.');
  const hasExp = /[eE]/.test(s);
  if (!hasDot && !hasExp) return null;

  // Non-finite forbidden.
  if (/^[+-]?(NaN|nan|Inf|inf|Infinity|infinity|\.inf|\.nan|\.NaN|\.Inf)$/.test(text)) {
    return { error: 'non-finite floats not permitted', rule: '6.4' };
  }

  let i = 0;
  let intPart = '';
  while (i < s.length && /[0-9_]/.test(s[i])) { intPart += s[i]; i++; }

  let dotPresent = false;
  if (s[i] === '.') { dotPresent = true; i++; }

  let fracPart = '';
  while (i < s.length && /[0-9_]/.test(s[i])) { fracPart += s[i]; i++; }

  let expSign = '', expPart = '';
  if (i < s.length && (s[i] === 'e' || s[i] === 'E')) {
    i++;
    if (s[i] === '+' || s[i] === '-') { expSign = s[i]; i++; }
    while (i < s.length && /[0-9_]/.test(s[i])) { expPart += s[i]; i++; }
  }

  if (i !== s.length) return null;

  // Per grammar:
  //   significand = digits "." [digits]   (intPart present, dot present)
  //               | "." digits             (intPart empty, dot present, fracPart non-empty)
  //               | digits                  (with exponent only)
  if (dotPresent) {
    if (intPart === '' && fracPart === '') return null;
  } else {
    if (intPart === '' || expPart === '') return null;
  }

  const digitsRe = c => c >= '0' && c <= '9';
  if (intPart && !validateUnderscored(intPart, digitsRe)) {
    return { error: 'malformed float significand', rule: '6.4' };
  }
  if (fracPart && !validateUnderscored(fracPart, digitsRe)) {
    return { error: 'malformed float fraction', rule: '6.4' };
  }
  if (expPart && !validateUnderscored(expPart, digitsRe)) {
    return { error: 'malformed float exponent', rule: '6.4' };
  }
  if ((s.startsWith('e') || s.startsWith('E')) && intPart === '') {
    return null;
  }

  let assembled = (intPart.replace(/_/g, '') || '0');
  if (dotPresent) assembled += '.' + (fracPart.replace(/_/g, '') || '0');
  if (expPart) assembled += 'e' + expSign + expPart.replace(/_/g, '');

  const value = sign * Number(assembled);
  if (!Number.isFinite(value)) {
    return { error: 'float not finite', rule: '6.4' };
  }
  return { value };
}

// ---- 9. Double-quoted string ---------------------------------------------

function parseDoubleQuoted(text, lineNumber, columnBase) {
  let i = 1;
  const out = [];
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (i !== text.length - 1) {
        throw new YamlParseError('6.5', lineNumber, columnBase + i + 1,
          'unexpected content after closing double quote');
      }
      return scalar('string', out.join(''), {
        style: 'double',
        loc: { line: lineNumber, column: columnBase },
      });
    }
    if (c === '\\') {
      const e = text[i + 1];
      if (e === undefined) {
        throw new YamlParseError('6.5', lineNumber, columnBase + i,
          'incomplete escape sequence');
      }
      if (e === '"') { out.push('"'); i += 2; continue; }
      if (e === '\\') { out.push('\\'); i += 2; continue; }
      if (e === '/') { out.push('/'); i += 2; continue; }
      if (e === 'b') { out.push('\b'); i += 2; continue; }
      if (e === 'f') { out.push('\f'); i += 2; continue; }
      if (e === 'n') { out.push('\n'); i += 2; continue; }
      if (e === 'r') { out.push('\r'); i += 2; continue; }
      if (e === 't') { out.push('\t'); i += 2; continue; }
      if (e === 'u') {
        const hex = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new YamlParseError('6.5', lineNumber, columnBase + i,
            'malformed \\uXXXX escape (needs 4 hex digits)');
        }
        out.push(String.fromCharCode(parseInt(hex, 16)));
        i += 6;
        continue;
      }
      throw new YamlParseError('6.5', lineNumber, columnBase + i,
        `invalid escape sequence \\${e}`);
    }
    const cc = c.charCodeAt(0);
    if (cc < 0x20 || cc === 0x7F) {
      throw new YamlParseError('6.5', lineNumber, columnBase + i,
        'raw control character in double-quoted string; use \\ escape');
    }
    out.push(c);
    i++;
  }
  throw new YamlParseError('6.5', lineNumber, columnBase,
    'unterminated double-quoted string (raw line break inside?)');
}

// ---- 10. Single-quoted string --------------------------------------------

function parseSingleQuoted(text, lineNumber, columnBase) {
  let i = 1;
  const out = [];
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      if (text[i + 1] === "'") {
        out.push("'");
        i += 2;
        continue;
      }
      if (i !== text.length - 1) {
        throw new YamlParseError('6.5', lineNumber, columnBase + i + 1,
          'unexpected content after closing single quote');
      }
      return scalar('string', out.join(''), {
        style: 'single',
        loc: { line: lineNumber, column: columnBase },
      });
    }
    const cc = c.charCodeAt(0);
    if (cc < 0x20 || cc === 0x7F) {
      throw new YamlParseError('6.5', lineNumber, columnBase + i,
        'raw control character in single-quoted string; use double quotes with \\ escape');
    }
    out.push(c);
    i++;
  }
  throw new YamlParseError('6.5', lineNumber, columnBase,
    'unterminated single-quoted string (raw line break inside?)');
}

// ---- 11. Parse a quoted key inline ---------------------------------------

// Used by the parser when a line starts with " or '. Returns
// { key, consumed } where `consumed` is the number of chars read (including
// the closing quote). Throws on malformed quote.
function parseQuotedKey(content, lineNumber, columnBase) {
  const ch = content[0];
  if (ch !== '"' && ch !== "'") return null;

  let i = 1;
  if (ch === '"') {
    while (i < content.length) {
      if (content[i] === '\\') { i += 2; continue; }
      if (content[i] === '"') break;
      const cc = content.charCodeAt(i);
      if (cc < 0x20 || cc === 0x7F) {
        throw new YamlParseError('6.5', lineNumber, columnBase + i,
          'raw control character in double-quoted key');
      }
      i++;
    }
    if (content[i] !== '"') {
      throw new YamlParseError('6.5', lineNumber, columnBase,
        'unterminated double-quoted key');
    }
    const raw = content.slice(0, i + 1);
    const node = parseDoubleQuoted(raw, lineNumber, columnBase);
    return { keyNode: node, consumed: i + 1 };
  } else {
    while (i < content.length) {
      if (content[i] === "'" && content[i + 1] === "'") { i += 2; continue; }
      if (content[i] === "'") break;
      const cc = content.charCodeAt(i);
      if (cc < 0x20 || cc === 0x7F) {
        throw new YamlParseError('6.5', lineNumber, columnBase + i,
          'raw control character in single-quoted key');
      }
      i++;
    }
    if (content[i] !== "'") {
      throw new YamlParseError('6.5', lineNumber, columnBase,
        'unterminated single-quoted key');
    }
    const raw = content.slice(0, i + 1);
    const node = parseSingleQuoted(raw, lineNumber, columnBase);
    return { keyNode: node, consumed: i + 1 };
  }
}

// ── src/parse.js ──

// Parser for @gcu/yaml.
//
// Recursive descent over the line records produced by preprocess().
// Each block (map or sequence) lives at one indent level; entries within a
// block all share that indent. Nested blocks sit at indent + 2.


function parse(text) {
  const lines = preprocess(text);
  if (lines.length === 0) {
    throw new YamlParseError('5.2', 1, 1, 'empty file');
  }

  const ctx = { lines, pos: 0, depth: 0 };

  const fileLeading = [];
  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.isBlank) { ctx.pos++; continue; }
    if (isCommentOnly(ln.content)) {
      fileLeading.push(commentBody(ln.content));
      ctx.pos++;
      continue;
    }
    break;
  }

  if (ctx.pos >= ctx.lines.length) {
    throw new YamlParseError('5.2', 1, 1,
      'file contains only comments/blanks; need a block map or sequence');
  }

  const firstLine = ctx.lines[ctx.pos];
  if (firstLine.indent !== 0) {
    throw new YamlParseError('5.3', firstLine.lineNumber, firstLine.indent + 1,
      'top-level content must start at column 0');
  }
  if (firstLine.content === '---' || firstLine.content === '...'
      || firstLine.content.startsWith('--- ') || firstLine.content.startsWith('... ')) {
    throw new YamlParseError('5.1', firstLine.lineNumber, 1,
      'document-start/end markers (--- / ...) not permitted; single document only');
  }
  // §5.2 — bare top-level scalars are not permitted. Detect by: not a seq
  // dash, and no ':' outside quotes on the first content line.
  if (!startsWithDash(firstLine.content) && !hasMapColonOutsideQuotes(firstLine.content)) {
    throw new YamlParseError('5.2', firstLine.lineNumber, 1,
      'top-level must be a block map or block sequence; bare scalars not permitted');
  }

  const root = parseBlockBody(ctx, 0, fileLeading, null);

  const tail = [];
  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.isBlank) { ctx.pos++; continue; }
    if (isCommentOnly(ln.content)) {
      tail.push(commentBody(ln.content));
      ctx.pos++;
      continue;
    }
    throw new YamlParseError('5.3', ln.lineNumber, ln.indent + 1,
      'unexpected content after root document');
  }
  if (tail.length > 0) {
    root.blockTrailingComments = root.blockTrailingComments.concat(tail);
  }

  return root;
}

// ---- Block body (map or seq) at the given indent --------------------------

function parseBlockBody(ctx, indent, leadingComments, topLevelTag) {
  if (++ctx.depth > MAX_DEPTH) {
    const ln = ctx.lines[ctx.pos] || { lineNumber: 1 };
    throw new YamlParseError('5.4', ln.lineNumber, indent + 1,
      'maximum nesting depth (64) exceeded');
  }

  let pendingComments = leadingComments.slice();
  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.isBlank) { ctx.pos++; continue; }
    if (isCommentOnly(ln.content)) {
      pendingComments.push(commentBody(ln.content));
      ctx.pos++;
      continue;
    }
    if (ln.indent < indent) {
      throw new YamlParseError('5.3', ln.lineNumber, ln.indent + 1,
        `unexpected dedent (expected indent ${indent}, got ${ln.indent})`);
    }
    if (ln.indent > indent) {
      throw new YamlParseError('5.3', ln.lineNumber, ln.indent + 1,
        `unexpected over-indent (expected ${indent}, got ${ln.indent})`);
    }
    break;
  }

  if (ctx.pos >= ctx.lines.length) {
    throw new YamlParseError('5.2', 1, 1,
      'expected map or sequence content but found EOF');
  }

  const firstLine = ctx.lines[ctx.pos];
  const isSeq = startsWithDash(firstLine.content);

  let node;
  if (isSeq) node = parseSeqBlock(ctx, indent, pendingComments, topLevelTag);
  else node = parseMapBlock(ctx, indent, pendingComments, topLevelTag);

  ctx.depth--;
  return node;
}

function startsWithDash(content) {
  return content[0] === '-'
    && (content.length === 1 || content[1] === ' ');
}

// True if a `:` appears outside any `"..."` or `'...'` quoted region.
function hasMapColonOutsideQuotes(content) {
  let inDQ = false, inSQ = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inDQ) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inDQ = false;
      continue;
    }
    if (inSQ) {
      if (c === "'" && content[i + 1] === "'") { i++; continue; }
      if (c === "'") inSQ = false;
      continue;
    }
    if (c === '"') { inDQ = true; continue; }
    if (c === "'") { inSQ = true; continue; }
    if (c === ':') return true;
  }
  return false;
}

// ---- Map block -----------------------------------------------------------

function parseMapBlock(ctx, indent, firstEntryLeading, topLevelTag) {
  const entries = [];
  const seenKeys = new Set();
  let pendingComments = firstEntryLeading.slice();
  let firstLineNumber = ctx.lines[ctx.pos].lineNumber;

  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.isBlank) { ctx.pos++; continue; }
    if (isCommentOnly(ln.content)) {
      pendingComments.push(commentBody(ln.content));
      ctx.pos++;
      continue;
    }
    if (ln.indent < indent) break;
    if (ln.indent > indent) {
      throw new YamlParseError('5.3', ln.lineNumber, ln.indent + 1,
        `unexpected over-indent (expected ${indent})`);
    }
    if (startsWithDash(ln.content)) {
      throw new YamlParseError('8.4', ln.lineNumber, ln.indent + 1,
        'sequence entry not permitted inside a map block');
    }

    const entry = parseMapEntry(ctx, indent, pendingComments);
    pendingComments = [];
    if (seenKeys.has(entry.key.value)) {
      throw new YamlParseError('7.2', entry.key.loc.line, entry.key.loc.column,
        `duplicate map key '${entry.key.value}'`);
    }
    seenKeys.add(entry.key.value);
    entries.push(entry);
  }

  if (entries.length === 0) {
    throw new YamlParseError('5.2', firstLineNumber, indent + 1,
      'block map with no entries');
  }

  if (pendingComments.length > 0) {
    const last = entries[entries.length - 1].value;
    last.blockTrailingComments = last.blockTrailingComments.concat(pendingComments);
  }

  return mapNode(entries, {
    tag: topLevelTag,
    loc: { line: entries[0].key.loc.line, column: indent + 1 },
  });
}

// Parses a single map entry at ctx.lines[ctx.pos] (must be at `indent`).
// Advances ctx.pos past all consumed lines (including nested blocks and
// block scalar bodies).
function parseMapEntry(ctx, indent, leadingComments) {
  const ln = ctx.lines[ctx.pos];
  return parseMapEntryFromContent(ctx, ln.content, ln.lineNumber, indent + 1, indent + 2, leadingComments, /*advanceFirstLine=*/true);
}

// Core map-entry parser. Accepts a content string (already at column `keyCol`)
// and processes it. The "nested indent" for any block value is `nestedIndent`.
// If `advanceFirstLine` is true, ctx.pos is advanced past the current line
// after the inline portion is consumed.
function parseMapEntryFromContent(ctx, content, lineNum, keyCol, nestedIndent, leadingComments, advanceFirstLine) {
  // Key
  let keyNode, keyLen;
  if (content[0] === '"' || content[0] === "'") {
    const r = parseQuotedKey(content, lineNum, keyCol);
    keyNode = r.keyNode;
    keyLen = r.consumed;
  } else {
    const b = tryParseBareKey(content);
    if (!b) {
      throw new YamlParseError('7.1', lineNum, keyCol,
        'expected key (bare identifier or quoted string)');
    }
    keyNode = scalar('string', b.key, { loc: { line: lineNum, column: keyCol } });
    keyLen = b.len;
  }

  if (content[keyLen] !== ':') {
    throw new YamlParseError('7.1', lineNum, keyCol + keyLen,
      `expected ':' after key (got '${content[keyLen] || 'EOL'}')`);
  }

  // After the colon
  let afterColon = content.slice(keyLen + 1);
  const afterColonCol = keyCol + keyLen + 1;

  // Empty: `key:` end of line — nested block follows.
  if (afterColon.length === 0) {
    if (advanceFirstLine) ctx.pos++;
    const value = parseNestedValue(ctx, nestedIndent, lineNum, afterColonCol, null, null);
    value.leadingComments = leadingComments;
    return mapEntry(keyNode, value);
  }

  if (afterColon[0] !== ' ') {
    if (afterColon[0] === '\t') {
      throw new YamlParseError('4.4', lineNum, afterColonCol + 1,
        'tab not permitted as separator after colon');
    }
    throw new YamlParseError('8.2', lineNum, afterColonCol + 1,
      'colon must be followed by a space and a value (or end of line)');
  }

  // Consume one or more SPs as the colon/value separator. The canonical
  // emitter writes exactly one; the parser accepts column-aligned forms.
  let sepLen = 0;
  while (afterColon[sepLen] === ' ') sepLen++;
  const valuePart = afterColon.slice(sepLen);
  const valueCol = afterColonCol + sepLen;

  return finishInlineMapEntry(ctx, keyNode, valuePart, lineNum, valueCol, nestedIndent, leadingComments, advanceFirstLine);
}

function finishInlineMapEntry(ctx, keyNode, valuePart, lineNum, valueCol, nestedIndent, leadingComments, advanceFirstLine) {
  const { body, comment } = splitComment(valuePart);

  if (body.length === 0) {
    if (advanceFirstLine) ctx.pos++;
    const value = parseNestedValue(ctx, nestedIndent, lineNum, valueCol, comment, null);
    value.leadingComments = leadingComments;
    return mapEntry(keyNode, value);
  }

  let tag = null;
  let rest = body;
  if (rest[0] === '!') {
    const t = tryParseTag(rest, lineNum, valueCol);
    tag = t.tag;
    rest = t.restAfterTag;
  }

  if (rest.length === 0) {
    if (advanceFirstLine) ctx.pos++;
    const value = parseNestedValue(ctx, nestedIndent, lineNum, valueCol, comment, tag);
    value.leadingComments = leadingComments;
    return mapEntry(keyNode, value);
  }

  if (rest === '|' || rest === '|-') {
    if (advanceFirstLine) ctx.pos++;
    const chomp = rest === '|-' ? 'strip' : 'clip';
    const value = parseBlockScalar(ctx, nestedIndent, lineNum, chomp);
    if (tag) value.tag = tag;
    value.leadingComments = leadingComments;
    if (comment) value.trailingComment = comment;
    return mapEntry(keyNode, value);
  }
  rejectBadBlockScalar(rest, lineNum, valueCol);

  // Inline value.
  if (advanceFirstLine) ctx.pos++;
  const valueNode = buildValueNode(rest, lineNum, valueCol, tag, leadingComments, comment);
  rejectMixedContent(ctx, nestedIndent - 2);
  return mapEntry(keyNode, valueNode);
}

function buildValueNode(text, lineNum, col, tag, leadingComments, trailingComment) {
  const r = parseValueText(text, lineNum, col);
  let node;
  if (r.emptySeq) node = seqNode([], { loc: { line: lineNum, column: col } });
  else if (r.emptyMap) node = mapNode([], { loc: { line: lineNum, column: col } });
  else node = r.node;

  if (tag) node.tag = tag;
  node.leadingComments = leadingComments;
  if (trailingComment) node.trailingComment = trailingComment;
  return node;
}

function rejectBadBlockScalar(rest, lineNum, col) {
  if (rest === '|+' || /^\|[0-9]/.test(rest)) {
    throw new YamlParseError('6.6', lineNum, col,
      `block scalar form '${rest}' not permitted (only | and |-)`);
  }
  if (rest[0] === '>') {
    throw new YamlParseError('6.6', lineNum, col,
      'folded block scalar (>) not permitted');
  }
}

// Look ahead: if there's an over-indented non-blank/comment line right after,
// that's "value on this line + nested children" = mixed content (§8.4).
function rejectMixedContent(ctx, indent) {
  for (let p = ctx.pos; p < ctx.lines.length; p++) {
    const ln = ctx.lines[p];
    if (ln.isBlank) continue;
    if (isCommentOnly(ln.content)) continue;
    if (ln.indent > indent) {
      throw new YamlParseError('8.4', ln.lineNumber, ln.indent + 1,
        'value given on previous line; indented child not permitted');
    }
    return;
  }
}

// ---- Sequence block ------------------------------------------------------

function parseSeqBlock(ctx, indent, firstEntryLeading, topLevelTag) {
  const items = [];
  let pendingComments = firstEntryLeading.slice();
  let firstLineNumber = ctx.lines[ctx.pos].lineNumber;

  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.isBlank) { ctx.pos++; continue; }
    if (isCommentOnly(ln.content)) {
      pendingComments.push(commentBody(ln.content));
      ctx.pos++;
      continue;
    }
    if (ln.indent < indent) break;
    if (ln.indent > indent) {
      throw new YamlParseError('5.3', ln.lineNumber, ln.indent + 1,
        `unexpected over-indent (expected ${indent})`);
    }
    if (!startsWithDash(ln.content)) {
      throw new YamlParseError('8.4', ln.lineNumber, ln.indent + 1,
        'map entry not permitted inside a sequence block');
    }

    const itemValue = parseSeqEntry(ctx, indent, pendingComments);
    pendingComments = [];
    items.push(itemValue);
  }

  if (items.length === 0) {
    throw new YamlParseError('5.2', firstLineNumber, indent + 1,
      'block sequence with no entries');
  }

  if (pendingComments.length > 0) {
    const last = items[items.length - 1];
    last.blockTrailingComments = last.blockTrailingComments.concat(pendingComments);
  }

  return seqNode(items, {
    tag: topLevelTag,
    loc: { line: firstLineNumber, column: indent + 1 },
  });
}

function parseSeqEntry(ctx, indent, leadingComments) {
  const ln = ctx.lines[ctx.pos];
  const content = ln.content;
  const colBase = indent + 1;

  // Bare `-` alone — nested block follows on indented lines.
  if (content.length === 1) {
    ctx.pos++;
    const value = parseNestedValue(ctx, indent + 2, ln.lineNumber, colBase + 1, null, null);
    value.leadingComments = leadingComments;
    return value;
  }

  // `- value` shapes. Consume one or more SPs after the dash; the canonical
  // emitter writes exactly one, but the parser accepts column-aligned forms.
  let dashSep = 1;
  while (content[dashSep] === ' ') dashSep++;
  const valuePart = content.slice(dashSep);
  const valueCol = colBase + dashSep;

  const { body, comment } = splitComment(valuePart);

  if (body.length === 0) {
    ctx.pos++;
    const value = parseNestedValue(ctx, indent + 2, ln.lineNumber, valueCol, comment, null);
    value.leadingComments = leadingComments;
    return value;
  }

  let tag = null;
  let rest = body;
  let restCol = valueCol;
  if (rest[0] === '!') {
    const t = tryParseTag(rest, ln.lineNumber, valueCol);
    tag = t.tag;
    const consumed = rest.length - t.restAfterTag.length;
    restCol += consumed;
    rest = t.restAfterTag;
  }

  if (rest.length === 0) {
    ctx.pos++;
    const value = parseNestedValue(ctx, indent + 2, ln.lineNumber, valueCol, comment, tag);
    value.leadingComments = leadingComments;
    return value;
  }

  if (rest === '|' || rest === '|-') {
    ctx.pos++;
    const chomp = rest === '|-' ? 'strip' : 'clip';
    const value = parseBlockScalar(ctx, indent + 2, ln.lineNumber, chomp);
    if (tag) value.tag = tag;
    value.leadingComments = leadingComments;
    if (comment) value.trailingComment = comment;
    return value;
  }
  rejectBadBlockScalar(rest, ln.lineNumber, restCol);

  // "- key: value" embedded-map shorthand?
  if (looksLikeMapKey(rest)) {
    // Parse this line as a map entry at indent + 2, and continue collecting
    // further map entries at the same indent.
    // advanceFirstLine=true: the entry parser must consume the opener line
    // BEFORE it looks for a nested block, or `- key:` followed by indented
    // children would see the opener's own shallow indent and reject it.
    const firstEntry = parseMapEntryFromContent(
      ctx, rest, ln.lineNumber, restCol, indent + 4, [], /*advanceFirstLine=*/true
    );
    const trailingFirst = comment;
    if (trailingFirst) firstEntry.value.trailingComment = trailingFirst;

    const entries = [firstEntry];
    const seenKeys = new Set([firstEntry.key.value]);
    let pendingComments = [];

    while (ctx.pos < ctx.lines.length) {
      const nx = ctx.lines[ctx.pos];
      if (nx.isBlank) { ctx.pos++; continue; }
      if (isCommentOnly(nx.content)) {
        pendingComments.push(commentBody(nx.content));
        ctx.pos++;
        continue;
      }
      if (nx.indent < indent + 2) break;
      if (nx.indent > indent + 2) {
        throw new YamlParseError('5.3', nx.lineNumber, nx.indent + 1,
          `unexpected over-indent (expected ${indent + 2})`);
      }
      if (startsWithDash(nx.content)) {
        throw new YamlParseError('8.4', nx.lineNumber, nx.indent + 1,
          'sequence dash not permitted inside an embedded map');
      }
      const entry = parseMapEntry(ctx, indent + 2, pendingComments);
      pendingComments = [];
      if (seenKeys.has(entry.key.value)) {
        throw new YamlParseError('7.2', entry.key.loc.line, entry.key.loc.column,
          `duplicate map key '${entry.key.value}'`);
      }
      seenKeys.add(entry.key.value);
      entries.push(entry);
    }

    if (pendingComments.length > 0) {
      const last = entries[entries.length - 1].value;
      last.blockTrailingComments = last.blockTrailingComments.concat(pendingComments);
    }

    const mn = mapNode(entries, {
      tag,
      loc: { line: ln.lineNumber, column: restCol },
    });
    mn.leadingComments = leadingComments;
    return mn;
  }

  // Plain inline scalar / empty collection.
  ctx.pos++;
  const valueNode = buildValueNode(rest, ln.lineNumber, restCol, tag, leadingComments, comment);
  rejectMixedContent(ctx, indent);
  return valueNode;
}

// True if `text` begins with a bare or quoted key followed by `:`.
function looksLikeMapKey(text) {
  if (text[0] === '"' || text[0] === "'") {
    const qch = text[0];
    let i = 1;
    while (i < text.length) {
      if (qch === '"' && text[i] === '\\') { i += 2; continue; }
      if (qch === "'" && text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
      if (text[i] === qch) { i++; break; }
      i++;
    }
    return text[i] === ':';
  }
  const b = tryParseBareKey(text);
  if (!b) return false;
  return text[b.len] === ':';
}

// ---- Nested value (block following a `key:` or `- ` opener) --------------

function parseNestedValue(ctx, indent, parentLine, parentColumn, parentTrailingComment, topTag) {
  let p = ctx.pos;
  while (p < ctx.lines.length) {
    const ln = ctx.lines[p];
    if (ln.isBlank) { p++; continue; }
    if (isCommentOnly(ln.content)) { p++; continue; }
    break;
  }
  if (p >= ctx.lines.length) {
    throw new YamlParseError('7.3', parentLine, parentColumn,
      'expected nested block but found EOF (use explicit `null` or `""`)');
  }
  const next = ctx.lines[p];
  if (next.indent < indent) {
    throw new YamlParseError('7.3', parentLine, parentColumn,
      'expected nested block but next content is at parent indent or less');
  }
  if (next.indent !== indent) {
    throw new YamlParseError('5.3', next.lineNumber, next.indent + 1,
      `expected indent ${indent} for nested block, got ${next.indent}`);
  }
  const block = parseBlockBody(ctx, indent, [], topTag || null);
  if (parentTrailingComment) {
    block.trailingComment = parentTrailingComment;
  }
  return block;
}

// ---- Block scalar (| or |-) ----------------------------------------------

function parseBlockScalar(ctx, indent, openerLine, chomp) {
  const bodyLines = [];
  const blankIndices = [];

  while (ctx.pos < ctx.lines.length) {
    const ln = ctx.lines[ctx.pos];
    if (ln.isBlank) {
      bodyLines.push('');
      blankIndices.push(bodyLines.length - 1);
      ctx.pos++;
      continue;
    }
    if (ln.indent < indent) break;

    // Slice off `indent` SPs from the raw line, preserving any further chars
    // as content (including extra leading spaces).
    const raw = ln.raw;
    const stripped = raw.length >= indent ? raw.slice(indent) : '';
    // Per §4.4 the raw-line trailing-SP strip applies to non-block contexts;
    // inside a block-scalar body, trailing SP is part of content. Actually
    // §4.4: "Trailing SP on any line outside a "..." or '...' string is
    // stripped silently by the parser". This wording is ambiguous about
    // block scalars; spec example treats them as preserved content lines.
    // We'll preserve everything we slice — this matches the example output.
    bodyLines.push(stripped);
    ctx.pos++;
  }

  if (bodyLines.length === 0) {
    throw new YamlParseError('6.6', openerLine, indent + 1,
      'block scalar body is empty; use `""` for an empty string');
  }

  // Drop trailing blank body lines (they belong to the surrounding context,
  // not the scalar body).
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
    bodyLines.pop();
  }
  if (bodyLines.length === 0) {
    throw new YamlParseError('6.6', openerLine, indent + 1,
      'block scalar body is empty after trimming blanks');
  }

  let value = bodyLines.join('\n');
  if (chomp === 'clip') value += '\n';

  return scalar('string', value, {
    style: 'block-' + chomp,
    loc: { line: openerLine + 1, column: indent + 1 },
  });
}

// ── src/emit.js ──

// Canonical emitter for @gcu/yaml.
//
// Pure function from AST to bytes. No configuration; the canonical form is
// fixed by §12.5:
//   - 2 SP per indent level
//   - LF only, exactly one at EOF, no trailing SP on any line
//   - Strings emit as "..." by default; style='single' → '...'; block scalars
//     emit as | or |- with body at indent + 2
//   - Integers emit in decimal unless radix hint says hex/oct/bin (lowercase)
//   - Floats emit in shortest decimal round-trip form with explicit '.'
//   - Empty collections emit as [] or {}
//   - Tags emit as !name before the tagged value

function emit(ast) {
  if (ast.kind !== 'map' && ast.kind !== 'seq') {
    throw new Error('emit: top-level must be map or seq');
  }
  const out = [];
  // Leading comments on the root (file-level pre-comments) — these were
  // attached to the first entry, so they come out naturally.
  emitBlock(ast, 0, out, ast.tag || null);
  // File-level trailing comments
  for (const c of ast.blockTrailingComments) {
    out.push('#' + c);
  }
  return out.join('\n') + '\n';
}

// ---- Block emitters ------------------------------------------------------

function emitBlock(node, indent, out, /*unused*/ tagOnBlock) {
  if (node.kind === 'map') emitMapBlock(node, indent, out);
  else if (node.kind === 'seq') emitSeqBlock(node, indent, out);
}

function emitMapBlock(map, indent, out) {
  const pad = ' '.repeat(indent);
  for (const entry of map.entries) {
    for (const c of entry.value.leadingComments) {
      out.push(pad + '#' + c);
    }
    emitMapEntry(entry, indent, out);
    for (const c of entry.value.blockTrailingComments) {
      out.push(pad + '#' + c);
    }
  }
}

function emitSeqBlock(seq, indent, out) {
  const pad = ' '.repeat(indent);
  for (const item of seq.items) {
    for (const c of item.leadingComments) {
      out.push(pad + '#' + c);
    }
    emitSeqItem(item, indent, out);
    for (const c of item.blockTrailingComments) {
      out.push(pad + '#' + c);
    }
  }
}

function emitMapEntry(entry, indent, out) {
  const pad = ' '.repeat(indent);
  const keyRepr = emitKey(entry.key);
  const value = entry.value;
  const shape = valueShape(value);
  const tagPart = value.tag ? ' !' + value.tag : '';
  const trailing = value.trailingComment ? '  #' + value.trailingComment : '';

  if (shape === 'inline') {
    out.push(pad + keyRepr + ':' + tagPart + ' ' + emitInlineValue(value) + trailing);
  } else if (shape === 'block-scalar') {
    const opener = value.style === 'block-strip' ? '|-' : '|';
    out.push(pad + keyRepr + ':' + tagPart + ' ' + opener + trailing);
    emitBlockScalarBody(value.value, indent + 2, out);
  } else if (shape === 'nested-map') {
    out.push(pad + keyRepr + ':' + tagPart + trailing);
    emitMapBlock(value, indent + 2, out);
  } else if (shape === 'nested-seq') {
    out.push(pad + keyRepr + ':' + tagPart + trailing);
    emitSeqBlock(value, indent + 2, out);
  }
}

function emitSeqItem(item, indent, out) {
  const pad = ' '.repeat(indent);
  const tagPart = item.tag ? ' !' + item.tag : '';
  const trailing = item.trailingComment ? '  #' + item.trailingComment : '';

  const shape = valueShape(item);

  if (shape === 'inline') {
    if (item.kind === 'scalar') {
      out.push(pad + '-' + tagPart + ' ' + emitScalar(item) + trailing);
    } else {
      // empty map or seq
      const repr = item.kind === 'map' ? '{}' : '[]';
      out.push(pad + '-' + tagPart + ' ' + repr + trailing);
    }
  } else if (shape === 'block-scalar') {
    const opener = item.style === 'block-strip' ? '|-' : '|';
    out.push(pad + '-' + tagPart + ' ' + opener + trailing);
    emitBlockScalarBody(item.value, indent + 2, out);
  } else if (shape === 'nested-map') {
    // Embedded-map form: write first entry inline on dash line.
    emitEmbeddedMap(item, indent, out);
  } else if (shape === 'nested-seq') {
    // Bare dash, nested seq below.
    out.push(pad + '-' + tagPart + trailing);
    emitSeqBlock(item, indent + 2, out);
  }
}

function emitEmbeddedMap(mapNode, indent, out) {
  const pad = ' '.repeat(indent);
  const tagPart = mapNode.tag ? ' !' + mapNode.tag : '';

  const entries = mapNode.entries;
  const first = entries[0];
  const firstVal = first.value;
  const firstKey = emitKey(first.key);

  const firstShape = valueShape(firstVal);
  const firstTrailing = firstVal.trailingComment ? '  #' + firstVal.trailingComment : '';
  const firstValTag = firstVal.tag ? ' !' + firstVal.tag : '';

  if (firstShape === 'inline') {
    out.push(pad + '-' + tagPart + ' ' + firstKey + ':' + firstValTag + ' '
      + emitInlineValue(firstVal) + firstTrailing);
  } else if (firstShape === 'block-scalar') {
    const opener = firstVal.style === 'block-strip' ? '|-' : '|';
    out.push(pad + '-' + tagPart + ' ' + firstKey + ':' + firstValTag + ' '
      + opener + firstTrailing);
    emitBlockScalarBody(firstVal.value, indent + 4, out);
  } else if (firstShape === 'nested-map') {
    out.push(pad + '-' + tagPart + ' ' + firstKey + ':' + firstValTag + firstTrailing);
    emitMapBlock(firstVal, indent + 4, out);
  } else if (firstShape === 'nested-seq') {
    out.push(pad + '-' + tagPart + ' ' + firstKey + ':' + firstValTag + firstTrailing);
    emitSeqBlock(firstVal, indent + 4, out);
  }

  // First entry's block-trailing comments (at the map's indent = indent + 2).
  const subIndent = indent + 2;
  const subPad = ' '.repeat(subIndent);
  for (const c of firstVal.blockTrailingComments) {
    out.push(subPad + '#' + c);
  }

  // Remaining entries at indent + 2.
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    for (const c of entry.value.leadingComments) {
      out.push(subPad + '#' + c);
    }
    emitMapEntry(entry, subIndent, out);
    for (const c of entry.value.blockTrailingComments) {
      out.push(subPad + '#' + c);
    }
  }
}

// ---- Shape classification ------------------------------------------------

function valueShape(value) {
  if (value.kind === 'scalar') {
    if (value.type === 'string'
        && (value.style === 'block-clip' || value.style === 'block-strip')) {
      return 'block-scalar';
    }
    return 'inline';
  }
  if (value.kind === 'map') return value.entries.length === 0 ? 'inline' : 'nested-map';
  if (value.kind === 'seq') return value.items.length === 0 ? 'inline' : 'nested-seq';
}

function emitInlineValue(value) {
  if (value.kind === 'scalar') return emitScalar(value);
  if (value.kind === 'map') return '{}';
  if (value.kind === 'seq') return '[]';
}

// ---- Scalars -------------------------------------------------------------

function emitScalar(s) {
  if (s.type === 'null') return 'null';
  if (s.type === 'bool') return s.value ? 'true' : 'false';
  if (s.type === 'int') return emitInt(s);
  if (s.type === 'float') return emitFloat(s.value);
  if (s.type === 'string') {
    if (s.style === 'single') return emitSingleQuoted(s.value);
    return emitDoubleQuoted(s.value);
  }
  throw new Error('emitScalar: unknown type ' + s.type);
}

function emitDoubleQuoted(value) {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const cc = value.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (cc < 0x20 || cc === 0x7F) {
      out += '\\u' + cc.toString(16).padStart(4, '0');
    } else {
      out += ch;
    }
  }
  return out + '"';
}

function emitSingleQuoted(value) {
  // Single-quoted can't carry control chars; if any are present, fall back to
  // double-quoted (which has escape sequences).
  for (let i = 0; i < value.length; i++) {
    const cc = value.charCodeAt(i);
    if (cc < 0x20 || cc === 0x7F) return emitDoubleQuoted(value);
  }
  return "'" + value.replace(/'/g, "''") + "'";
}

function emitInt(node) {
  const v = node.value;
  let s;
  if (node.radix === 'hex') s = (v < 0 ? '-' : '') + '0x' + Math.abs(v).toString(16);
  else if (node.radix === 'oct') s = (v < 0 ? '-' : '') + '0o' + Math.abs(v).toString(8);
  else if (node.radix === 'bin') s = (v < 0 ? '-' : '') + '0b' + Math.abs(v).toString(2);
  else s = String(v);

  if (node.separators) s = applyGrouping(s, node.radix);
  return s;
}

function applyGrouping(s, radix) {
  let prefix = '';
  let digits = s;
  if (s.startsWith('-')) { prefix = '-'; digits = s.slice(1); }
  if (digits.startsWith('0x') || digits.startsWith('0o') || digits.startsWith('0b')) {
    prefix += digits.slice(0, 2);
    digits = digits.slice(2);
  }
  const groupSize = (radix === 'hex' || radix === 'bin') ? 4 : 3;
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % groupSize === 0) result += '_';
    result += digits[i];
  }
  return prefix + result;
}

function emitFloat(v) {
  let s = String(v);
  if (!/[.eE]/.test(s)) s += '.0';
  return s;
}

// ---- Keys ----------------------------------------------------------------

function emitKey(keyNode) {
  const k = keyNode.value;
  if (keyNode.style !== 'single' && isBareKey(k)) return k;
  if (keyNode.style === 'single') return emitSingleQuoted(k);
  return emitDoubleQuoted(k);
}

function isBareKey(s) {
  if (s.length === 0) return false;
  if (!/[A-Za-z_]/.test(s[0])) return false;
  for (let i = 1; i < s.length; i++) {
    if (!/[A-Za-z0-9_.\-]/.test(s[i])) return false;
  }
  return true;
}

// ---- Block scalar body ---------------------------------------------------

function emitBlockScalarBody(text, indent, out) {
  let body = text;
  // For clip the body ends with \n; for strip it doesn't. The trailing \n
  // would split as an extra empty line, which we don't want as a body line.
  if (body.endsWith('\n')) body = body.slice(0, -1);
  const lines = body.split('\n');
  const pad = ' '.repeat(indent);
  for (const ln of lines) {
    if (ln === '') out.push('');
    else out.push(pad + ln);
  }
}

// ── src/api.js ──

// Public surface for @gcu/yaml.



// Returns null if `text` parses successfully, otherwise the YamlParseError
// instance from the strict parser.
function check(text) {
  try {
    parse(text);
    return null;
  } catch (e) {
    return e;
  }
}

// Parse + emit. Convenience for one-shot canonicalization.
function format(text) {
  return emit(parse(text));
}

// ── src/main.js ──

// @gcu/yaml — Strict subset of YAML 1.2
//
// Module manifest. Each file is a small piece of the pipeline:
//   types.js  — AST node factories, YamlParseError
//   lex.js    — line preprocessor + scalar/key/tag tokenizers
//   parse.js  — recursive-descent parser over lines
//   emit.js   — canonical emitter (pure AST → bytes)
//   api.js    — public surface: parse, emit, check, format

export {
  YamlParseError,
  scalar,
  mapNode,
  seqNode,
  mapEntry,
  MAX_DEPTH,
  preprocess,
  splitComment,
  isCommentOnly,
  commentBody,
  tryParseTag,
  tryParseBareKey,
  parseValueText,
  parseQuotedKey,
  parse,
  emit,
  check,
  format,
};

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

export function adderTokenize(code) {
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

export function adderParse(code) {
  return new _Parser(adderTokenize(code)).parseModule();
}

export function _adderParseExpr(code) {
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

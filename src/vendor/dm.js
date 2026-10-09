// ⚠ VENDORED — DO NOT EDIT. @gcu/dm, the read-only Datamine .dm reader, copied from ../auditable/ext/dm/index.js (MIT).
// Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/dm — Read-only reader for Datamine .DM files (block models, drillholes, wireframes, strings) — SP/EP precision, endianness auto-detection, multi-word alpha, file constants, missing-value sentinels. Zero-dependency, browser-native, windowed (header + per-record) for arbitrarily large files. Format reverse-engineered from public sources (VMine + Maccelari BSD dmfile.h); excluded from copyright under the EU Software Directive.

// ── src/dm.js ──

// @gcu/dm — Datamine .DM file reader (READ-ONLY). Zero-dependency, browser-native.
//
// Provenance / legal: the format is reverse-engineered from two public,
// independent sources — VMine.com's format description (explicitly NOT from
// Constellation/Datamine copyright material) and Jeremy Maccelari's BSD-licensed
// ParaViewGeo `dmfile.h` (1999). The .DM file format is excluded from copyright
// under the EU Software Directive. Full spec + references: SPEC.md. MIT.
//
// Two sub-formats share the .dm extension: Single Precision (SP, 2048-byte pages,
// Float32, 4-byte words) and Extended Precision (EP, 4096-byte pages, Float64,
// 8-byte words). Page 1 = Data Definition (fields); pages 2+ = packed records.
// The last 16 bytes of every page are a legacy security block (skipped). Both
// variants leave 508 usable words per page.

class DMFormatError extends Error {
  constructor(msg) { super(msg); this.name = 'DMFormatError'; }
}

const USABLE_WORDS = 508;      // per page, both SP and EP (16-byte security tail)
const SENTINEL = 0.9e30;       // |value| above this = a Datamine special (missing/inf/trace)

const toDV = (b) => (b instanceof DataView ? b : new DataView(b.buffer ? b.buffer : b, b.byteOffset || 0, b.byteLength));

// Read N words as text: 4 ASCII chars per word (in EP, the first 4 bytes of each
// 8-byte word; the rest is padding). Non-printable bytes dropped; result trimmed.
function readText(dv, off, nWords, ws) {
  let s = '';
  for (let w = 0; w < nWords; w++) {
    const base = off + w * ws;
    for (let b = 0; b < 4; b++) {
      if (base + b >= dv.byteLength) break;
      const ch = dv.getUint8(base + b);
      if (ch >= 32 && ch < 127) s += String.fromCharCode(ch);
    }
  }
  return s.trim();
}

// Recover an EP extended field name (>8, up to 24 chars), or null if the entry
// isn't flagged long. EP-only: SP's 4-byte words have no high half. Leapfrog and
// other modern exporters hide chars 9–24 in bytes a legacy 8-char reader skips,
// flagged by ASCII "LONG" in the high half of the type word — so old readers
// still see a valid 8-char name (the encoding is purely additive). Chars 1–8 =
// low halves of words 0–1; 9–16 = their high halves; 17–24 = word 5 (low then
// high). Internal spaces kept; trailing pad stripped. Reverse-engineered from
// real Leapfrog EP exports (independent byte observation), not from Datamine
// copyright material. See SPEC §3.2.1.
function readLongName(dv, o, ws) {
  if (ws !== 8) return null;                              // EP-only mechanism
  if (o + ws * 5 + 8 > dv.byteLength) return null;        // truncated buffer → legacy path
  const flag = o + ws * 2 + 4;                            // high half of the type word
  const LONG = [0x4C, 0x4F, 0x4E, 0x47];                  // "LONG"
  for (let b = 0; b < 4; b++) if (dv.getUint8(flag + b) !== LONG[b]) return null;
  const segs = [o, o + ws, o + 4, o + ws + 4, o + ws * 5, o + ws * 5 + 4];
  //           low(w0) low(w1) high(w0) high(w1) low(w5)   high(w5)
  let s = '';
  for (const base of segs)
    for (let b = 0; b < 4; b++) {
      const c = dv.getUint8(base + b);
      s += (c >= 32 && c < 127) ? String.fromCharCode(c) : ' ';
    }
  return s.replace(/\s+$/, '') || null;                   // strip trailing pad, keep internal spaces
}

const FMTS = [['sp', 'le'], ['sp', 'be'], ['ep', 'le'], ['ep', 'be']];
const wordSize = (p) => (p === 'ep' ? 8 : 4);
const pageSize = (p) => (p === 'ep' ? 4096 : 2048);
const dateOffOf = (p) => (p === 'ep' ? 192 : 96);

/**
 * Detect { precision: 'sp'|'ep', byteOrder: 'le'|'be' } from the file head
 * (≥ one page recommended), or null if it isn't a recognizable .dm. There's no
 * magic number: validate NVAR (1–500, integral) + a printable first field name.
 */
function detectDM(bytes) {
  const dv = toDV(bytes);
  for (const [precision, byteOrder] of FMTS) {
    const ws = wordSize(precision), isLE = byteOrder === 'le';
    const fcOff = dateOffOf(precision) + ws;                         // NVAR position
    if (fcOff + ws > dv.byteLength) continue;
    const fc = precision === 'ep' ? dv.getFloat64(fcOff, isLE) : dv.getFloat32(fcOff, isLE);
    const n = Math.round(fc);
    if (n < 1 || n > 500 || Math.abs(fc - n) > 0.01) continue;
    const fieldStart = dateOffOf(precision) + ws * 4;
    let printable = fieldStart + 4 <= dv.byteLength;
    for (let b = 0; printable && b < 4; b++) { const c = dv.getUint8(fieldStart + b); if (c < 32 || c >= 127) printable = false; }
    if (printable) return { precision, byteOrder };
  }
  return null;
}

/**
 * Parse the Data Definition (page 1) into a header: field schema, record layout,
 * and counts. `fmt` (from detectDM) is optional — detected if omitted. `bytes`
 * need only cover the first page.
 */
function parseHeader(bytes, fmt) {
  const dv = toDV(bytes);
  const f = fmt || detectDM(bytes);
  if (!f) throw new DMFormatError('not a recognizable .dm file (no SP/EP + endianness matched)');
  const { precision, byteOrder } = f;
  const ws = wordSize(precision), ps = pageSize(precision), isLE = byteOrder === 'le';
  const readNum = precision === 'ep' ? (o) => dv.getFloat64(o, isLE) : (o) => dv.getFloat32(o, isLE);

  const dateOff = dateOffOf(precision);
  const filename = readText(dv, 0, 2, ws);
  const description = readText(dv, precision === 'ep' ? 32 : 16, 20, ws);
  const dateNum = Math.round(readNum(dateOff));
  const nvar = Math.round(readNum(dateOff + ws));
  const lastPage = Math.round(readNum(dateOff + ws * 2));
  const lastRec = Math.round(readNum(dateOff + ws * 3));
  if (nvar < 1 || nvar > 256) throw new DMFormatError(`NVAR out of range: ${nvar}`);

  // Field-definition entries (28 bytes SP / 56 EP each; alpha >4 chars span
  // multiple entries sharing a name with incrementing WORDNO).
  const fieldStart = dateOff + ws * 4, fieldSize = ws * 7;
  const raw = [];
  for (let i = 0; i < nvar; i++) {
    const o = fieldStart + i * fieldSize;
    if (o + fieldSize > ps) break;                                   // single-page DD (spec §3.2)
    raw.push({
      name: readLongName(dv, o, ws) ?? readText(dv, o, 2, ws),   // §3.2.1 EP long names, else legacy 8-char
      type: (readText(dv, o + ws * 2, 1, ws).charAt(0) || 'N').toUpperCase(),
      sw: Math.round(readNum(o + ws * 3)),
      wordno: Math.round(readNum(o + ws * 4)),
      def: readNum(o + ws * 6),
    });
  }

  // Reconstruct logical columns (group entries by name).
  const map = new Map();
  for (const e of raw) {
    if (!map.has(e.name)) map.set(e.name, { name: e.name, type: e.type, entries: [] });
    map.get(e.name).entries.push(e);
  }
  let maxLen = 0;
  const columns = [];
  for (const c of map.values()) {
    const sorted = c.entries.slice().sort((a, b) => a.wordno - b.wordno);
    const sw = sorted.map((e) => e.sw);
    for (const p of sw) if (p > maxLen) maxLen = p;
    const isConstant = sorted[0].sw === 0;
    let constantValue = null;
    if (isConstant) {
      if (c.type === 'A') constantValue = decodeAlphaDefault(sorted, precision, isLE);
      else { const v = sorted[0].def; constantValue = Math.abs(v) > SENTINEL ? null : v; }
    }
    columns.push({ name: c.name, type: c.type, sw, width: c.type === 'A' ? sw.length * 4 : undefined, isConstant, constantValue });
  }

  const recordsPerPage = maxLen > 0 ? Math.floor(USABLE_WORDS / maxLen) : 0;
  const recordCount = lastPage > 1 ? (lastPage - 2) * recordsPerPage + lastRec : lastRec;

  return {
    precision, byteOrder, wordSize: ws, pageSize: ps,
    filename, description, date: dmDate(dateNum),
    nvar, lastPage, lastRec, maxLen, recordsPerPage, recordCount,
    columns,
    schema: columns.map((c) => ({ name: c.name, type: c.type === 'A' ? 'string' : 'number' })),
  };
}

function decodeAlphaDefault(entries, precision, isLE) {
  let s = '';
  const buf = new ArrayBuffer(precision === 'ep' ? 8 : 4);
  const dv = new DataView(buf);
  for (const e of entries) {
    if (precision === 'ep') dv.setFloat64(0, e.def, isLE); else dv.setFloat32(0, e.def, isLE);
    for (let b = 0; b < 4; b++) { const c = dv.getUint8(b); if (c >= 32 && c < 127) s += String.fromCharCode(c); }
  }
  return s.trim();
}

function dmDate(n) {
  if (!n || n < 10000) return null;                                 // 10000×year + 100×month + day
  const year = Math.floor(n / 10000), month = Math.floor((n % 10000) / 100), day = n % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Byte range of record `i` (0-based) in the file — a contiguous slice (records
 *  never span a page). Read it and pass to decodeRecord. */
function recordRange(h, i) {
  const dataPage = Math.floor(i / h.recordsPerPage) + 2;            // 1-based; page 1 = DD
  const recInPage = i % h.recordsPerPage;
  return { offset: (dataPage - 1) * h.pageSize + recInPage * h.maxLen * h.wordSize, length: h.maxLen * h.wordSize };
}

/** Read ONE field of the record whose words begin at byte `recBase` in `dv`:
 *  number | null (missing/sentinel) for numeric columns, trimmed string for
 *  alpha, the header value for constants (no body access). This is the strided
 *  projection primitive — a caller reads a single COLUMN by striding recBase =
 *  pageBase + r·maxLen·wordSize across records, decoding only the field it wants
 *  instead of the whole record. `dv` may span many records (a page run); the
 *  offsets are relative to recBase. */
function readField(dv, h, col, recBase) {
  if (col.isConstant) return col.constantValue;
  const ws = h.wordSize, isLE = h.byteOrder === 'le';
  if (col.type === 'A') {
    let s = '';
    for (const sw of col.sw) { const b0 = recBase + (sw - 1) * ws; for (let b = 0; b < 4; b++) { if (b0 + b >= dv.byteLength) break; const c = dv.getUint8(b0 + b); if (c >= 32 && c < 127) s += String.fromCharCode(c); } }
    return s.trim();
  }
  const off = recBase + (col.sw[0] - 1) * ws;
  if (off + ws > dv.byteLength) return null;
  const v = h.precision === 'ep' ? dv.getFloat64(off, isLE) : dv.getFloat32(off, isLE);
  return Math.abs(v) > SENTINEL ? null : v;
}

/** Decode one record's word slice (from recordRange) into positional values:
 *  number | null (missing/sentinel) for numeric columns, string for alpha. */
function decodeRecord(bytes, h) {
  const dv = toDV(bytes);
  return h.columns.map((col) => readField(dv, h, col, 0));   // record bytes start at 0
}

/**
 * Whole-file convenience: detect + parse + record access over an ArrayBuffer /
 * Uint8Array. For huge files prefer the windowed path (detectDM → parseHeader →
 * recordRange → decodeRecord over a File you slice).
 */
function readDM(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.byteLength < 2048) throw new DMFormatError('file too small for a .dm page');
  const fmt = detectDM(u8.subarray(0, Math.min(4096, u8.byteLength)));
  if (!fmt) throw new DMFormatError('not a recognizable .dm file');
  const h = parseHeader(u8, fmt);
  const sliceRec = (i) => { const { offset, length } = recordRange(h, i); return u8.subarray(offset, offset + length); };
  return {
    filename: h.filename, description: h.description, date: h.date,
    precision: h.precision, byteOrder: h.byteOrder, fields: h.schema, recordCount: h.recordCount, header: h,
    getRecord(i) {
      if (i < 0 || i >= h.recordCount) return null;
      const vals = decodeRecord(sliceRec(i), h);
      const obj = {};
      h.columns.forEach((c, k) => { obj[c.name] = vals[k]; });
      return obj;
    },
    getColumns() {
      const n = h.recordCount;
      const out = {};
      const numArr = h.precision === 'ep' ? Float64Array : Float32Array;
      h.columns.forEach((c, k) => {
        if (c.isConstant) { out[c.name] = c.constantValue; return; }
        out[c.name] = c.type === 'A' ? new Array(n) : new numArr(n);
      });
      for (let i = 0; i < n; i++) {
        const vals = decodeRecord(sliceRec(i), h);
        h.columns.forEach((c, k) => {
          if (c.isConstant) return;
          if (c.type === 'A') out[c.name][i] = vals[k];
          else out[c.name][i] = vals[k] == null ? NaN : vals[k];     // missing → NaN in typed arrays
        });
      }
      return out;
    },
    * [Symbol.iterator]() { for (let i = 0; i < h.recordCount; i++) yield this.getRecord(i); },
  };
}

// ── src/main.js ──

// @gcu/dm — public surface (manifest-is-truth; build.js bundles from here).

export {
  readDM,
  detectDM,
  parseHeader,
  recordRange,
  decodeRecord,
  readField,
  DMFormatError,
};

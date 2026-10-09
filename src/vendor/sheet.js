// ⚠ VENDORED — DO NOT EDIT. @gcu/sheet, copied from ../auditable/ext/sheet/index.js (built from its src/ by @gcu/build, MIT).
// Re-vendor by copying that file here. Reading is asynchronous (DecompressionStream), so golem converts at open time, not in a tool.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/sheet — XLSX file reader and writer in pure JavaScript. Zero runtime dependencies — bundles its own zip and XML handling.

// ── src/zip.js ──

// ── CRC32 ──

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC32_TABLE[i] = c;
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Helpers ──

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deflateRaw(data) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function inflateRaw(data) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function readU16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function readU32(buf, off) { return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0; }

function writeU16(buf, off, val) { buf[off] = val & 0xFF; buf[off + 1] = (val >> 8) & 0xFF; }
function writeU32(buf, off, val) { buf[off] = val & 0xFF; buf[off + 1] = (val >> 8) & 0xFF; buf[off + 2] = (val >> 16) & 0xFF; buf[off + 3] = (val >> 24) & 0xFF; }

// ── Unzip ──

async function unzip(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const entries = new Map();

  // find End of Central Directory (search backwards for signature 0x06054b50)
  let eocdOff = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
    if (readU32(buf, i) === 0x06054B50) { eocdOff = i; break; }
  }
  if (eocdOff === -1) throw new Error('not a ZIP file: EOCD not found');

  const entryCount = readU16(buf, eocdOff + 10);
  let cdOff = readU32(buf, eocdOff + 16);

  for (let e = 0; e < entryCount; e++) {
    if (readU32(buf, cdOff) !== 0x02014B50) throw new Error('bad central directory entry');

    const method = readU16(buf, cdOff + 10);
    const crc = readU32(buf, cdOff + 16);
    const compSize = readU32(buf, cdOff + 20);
    const uncompSize = readU32(buf, cdOff + 24);
    const nameLen = readU16(buf, cdOff + 28);
    const extraLen = readU16(buf, cdOff + 30);
    const commentLen = readU16(buf, cdOff + 32);
    const localOff = readU32(buf, cdOff + 42);

    const name = decoder.decode(buf.subarray(cdOff + 46, cdOff + 46 + nameLen));
    cdOff += 46 + nameLen + extraLen + commentLen;

    // skip directories
    if (name.endsWith('/')) continue;

    // read local file header to find data offset
    const localNameLen = readU16(buf, localOff + 26);
    const localExtraLen = readU16(buf, localOff + 28);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataOff, dataOff + compSize);

    let data;
    if (method === 0) {
      // stored
      data = compressed.slice();
    } else if (method === 8) {
      // deflated
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`unsupported compression method ${method} for ${name}`);
    }

    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`);
    entries.set(name, data);
  }

  return entries;
}

// ── Zip ──

async function zip(entries) {
  // entries: Map<string, Uint8Array> or array of [name, data]
  const items = entries instanceof Map ? [...entries] : entries;
  const localHeaders = [];
  const centralEntries = [];
  let offset = 0;

  for (const [name, raw] of items) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(raw);
    const compressed = await deflateRaw(raw);

    // use deflated only if smaller
    const useDeflate = compressed.length < raw.length;
    const stored = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;

    // local file header (30 + nameLen)
    const local = new Uint8Array(30 + nameBytes.length + stored.length);
    writeU32(local, 0, 0x04034B50);    // signature
    writeU16(local, 4, 20);            // version needed
    writeU16(local, 6, 0);             // flags
    writeU16(local, 8, method);        // compression method
    writeU16(local, 10, 0);            // mod time
    writeU16(local, 12, 0);            // mod date
    writeU32(local, 14, crc);          // CRC-32
    writeU32(local, 18, stored.length);  // compressed size
    writeU32(local, 22, raw.length);     // uncompressed size
    writeU16(local, 26, nameBytes.length);
    writeU16(local, 28, 0);            // extra field length
    local.set(nameBytes, 30);
    local.set(stored, 30 + nameBytes.length);
    localHeaders.push(local);

    // central directory entry (46 + nameLen)
    const central = new Uint8Array(46 + nameBytes.length);
    writeU32(central, 0, 0x02014B50);
    writeU16(central, 4, 20);          // version made by
    writeU16(central, 6, 20);          // version needed
    writeU16(central, 8, 0);           // flags
    writeU16(central, 10, method);
    writeU16(central, 12, 0);          // mod time
    writeU16(central, 14, 0);          // mod date
    writeU32(central, 16, crc);
    writeU32(central, 20, stored.length);
    writeU32(central, 24, raw.length);
    writeU16(central, 28, nameBytes.length);
    writeU16(central, 30, 0);          // extra field length
    writeU16(central, 32, 0);          // comment length
    writeU16(central, 34, 0);          // disk number
    writeU16(central, 36, 0);          // internal attributes
    writeU32(central, 38, 0);          // external attributes
    writeU32(central, 42, offset);     // local header offset
    central.set(nameBytes, 46);
    centralEntries.push(central);

    offset += local.length;
  }

  // End of Central Directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const c of centralEntries) cdSize += c.length;

  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054B50);
  writeU16(eocd, 4, 0);               // disk number
  writeU16(eocd, 6, 0);               // disk with central dir
  writeU16(eocd, 8, items.length);     // entries on this disk
  writeU16(eocd, 10, items.length);    // total entries
  writeU32(eocd, 12, cdSize);          // central dir size
  writeU32(eocd, 16, cdOffset);        // central dir offset
  writeU16(eocd, 20, 0);              // comment length

  // concatenate all parts
  const total = offset + cdSize + 22;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const l of localHeaders) { result.set(l, pos); pos += l.length; }
  for (const c of centralEntries) { result.set(c, pos); pos += c.length; }
  result.set(eocd, pos);

  return result;
}

// ── src/xml.js ──

// ── XML builder ──

function tag(name, attrs, ...children) {
  let s = '<' + name;
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v !== undefined && v !== null) s += ` ${k}="${escape(String(v))}"`;
    }
  }
  if (children.length === 0) return s + '/>';
  s += '>';
  for (const child of children) {
    if (child !== undefined && child !== null) s += String(child);
  }
  return s + `</${name}>`;
}

function escape(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function unescape(str) {
  return str.replace(/&apos;/g, "'").replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

// Strip namespace prefix: "x:row" → "row"
function stripNS(name) {
  const i = name.indexOf(':');
  return i === -1 ? name : name.substring(i + 1);
}

// ── Minimal XML parser ──
// Handles the subset xlsx uses: elements, attributes, text. No CDATA, no DTD.

function parseXml(str) {
  const root = { tag: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;

  while (i < str.length) {
    if (str[i] === '<') {
      // processing instruction
      if (str[i + 1] === '?') {
        i = str.indexOf('?>', i) + 2;
        continue;
      }
      // closing tag
      if (str[i + 1] === '/') {
        i = str.indexOf('>', i) + 1;
        stack.pop();
        continue;
      }
      const end = str.indexOf('>', i);
      const selfClose = str[end - 1] === '/';
      const raw = str.substring(i + 1, selfClose ? end - 1 : end);

      // split tag name from attributes
      const sp = raw.search(/[\s]/);
      const tagName = stripNS(sp === -1 ? raw : raw.substring(0, sp));
      const attrs = {};

      if (sp !== -1) {
        const attrStr = raw.substring(sp);
        const re = /([\w:.+-]+)="([^"]*)"/g;
        let m;
        while ((m = re.exec(attrStr)) !== null) {
          attrs[stripNS(m[1])] = unescape(m[2]);
        }
      }

      const node = { tag: tagName, attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
      i = end + 1;
    } else {
      const next = str.indexOf('<', i);
      const text = next === -1 ? str.substring(i) : str.substring(i, next);
      if (text) stack[stack.length - 1].text += text;
      i = next === -1 ? str.length : next;
    }
  }

  return root.children[0] || root;
}

// ── Tree navigation ──

function find(node, tagName) {
  if (node.tag === tagName) return node;
  for (const child of node.children) {
    const found = find(child, tagName);
    if (found) return found;
  }
  return null;
}

function findAll(node, tagName) {
  const results = [];
  if (node.tag === tagName) results.push(node);
  for (const child of node.children) {
    findAll(child, tagName).forEach(n => results.push(n));
  }
  return results;
}

// ── src/util.js ──

// ── Cell address helpers ──

function colLetter(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function colIndex(letter) {
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1;
}

function cellRef(col, row, absolute) {
  const l = colLetter(col);
  const r = row + 1;
  return absolute ? `$${l}$${r}` : `${l}${r}`;
}

function parseRef(ref) {
  const m = ref.match(/^\$?([A-Z]+)\$?(\d+)$/);
  if (!m) return null;
  return { col: colIndex(m[1]), row: parseInt(m[2]) - 1 };
}

// ── Date conversion ──
// Excel date serial: days since 1899-12-30
// Serial 1 = Jan 1, 1900. Serial 60 = Feb 29, 1900 (doesn't exist — 1900 leap year bug).

const EPOCH = Date.UTC(1899, 11, 31); // Dec 31, 1899 = "serial 0"
const MS_PER_DAY = 86400000;

function dateToSerial(date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((utc - EPOCH) / MS_PER_DAY);
  return days > 59 ? days + 1 : days;
}

function serialToDate(serial) {
  const adjusted = serial > 59 ? serial - 1 : serial;
  return new Date(EPOCH + adjusted * MS_PER_DAY);
}

// ── src/reader.js ──

// ── Shared strings ──

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = parseXml(xml);
  const strings = [];
  for (const si of findAll(doc, 'si')) {
    // simple text: <si><t>text</t></si>
    const t = find(si, 't');
    if (t && si.children.length === 1) {
      strings.push(t.text);
      continue;
    }
    // rich text: <si><r><rPr>...</rPr><t>part</t></r>...</si>
    let text = '';
    for (const r of findAll(si, 'r')) {
      const rt = find(r, 't');
      if (rt) text += rt.text;
    }
    strings.push(text || (t ? t.text : ''));
  }
  return strings;
}

// ── Styles / date detection ──

// built-in date format IDs (14-22)
const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22]);

function parseDateFormats(xml) {
  if (!xml) return new Set();
  const doc = parseXml(xml);
  const dateIds = new Set(BUILTIN_DATE_IDS);

  // custom number formats
  for (const fmt of findAll(doc, 'numFmt')) {
    const id = parseInt(fmt.attrs.numFmtId);
    const code = (fmt.attrs.formatCode || '').toLowerCase();
    // date/time tokens: y, m, d, h, s (but not in # patterns like #,##0)
    if (/[ydhsap]/i.test(code) && !/[#0]/.test(code)) {
      dateIds.add(id);
    } else if (/(?:^|[^#0])m(?:[^#0]|$)/.test(code) && /[ydhs]/i.test(code)) {
      dateIds.add(id);
    }
  }

  // build map: style index → numFmtId
  const styleNumFmts = [];
  const cellXfs = find(doc, 'cellXfs');
  if (cellXfs) {
    for (const xf of findAll(cellXfs, 'xf')) {
      styleNumFmts.push(parseInt(xf.attrs.numFmtId || '0'));
    }
  }

  return { dateIds, styleNumFmts };
}

// ── Workbook / relationships ──

function parseWorkbook(wbXml, relsXml) {
  const wb = parseXml(wbXml);
  const rels = parseXml(relsXml);
  const sheets = [];

  // build relationship map: rId → target path
  const relMap = {};
  for (const rel of findAll(rels, 'Relationship')) {
    relMap[rel.attrs.Id] = rel.attrs.Target;
  }

  for (const sheet of findAll(wb, 'sheet')) {
    const name = sheet.attrs.name;
    const rId = sheet.attrs.id;
    const target = relMap[rId];
    if (target) sheets.push({ name, path: 'xl/' + target });
  }

  return sheets;
}

// ── Worksheet parsing ──

function parseWorksheet(xml, sharedStrings, styles, options) {
  const doc = parseXml(xml);
  const sheetData = find(doc, 'sheetData');
  if (!sheetData) return { columns: {}, headers: [], rows: 0 };

  const { dateIds, styleNumFmts } = styles || { dateIds: new Set(), styleNumFmts: [] };
  const headerRow = (options && options.headerRow) || 1;

  // parse range filter if specified
  let rangeFilter = null;
  if (options && options.range) {
    const parts = options.range.split(':');
    const tl = parseRef(parts[0]);
    const br = parseRef(parts[1]);
    if (tl && br) rangeFilter = { minCol: tl.col, maxCol: br.col, minRow: tl.row, maxRow: br.row };
  }

  // collect raw cells: { col, row, value, type }
  // type: 'n' | 's' | 'b' | 'd' (date numeric)
  const rawCells = [];
  let maxCol = -1;
  let maxRow = -1;

  for (const rowNode of findAll(sheetData, 'row')) {
    for (const c of findAll(rowNode, 'c')) {
      const ref = c.attrs.r;
      if (!ref) continue;
      const parsed = parseRef(ref);
      if (!parsed) continue;
      const { col, row } = parsed;

      // apply range filter
      if (rangeFilter) {
        if (col < rangeFilter.minCol || col > rangeFilter.maxCol) continue;
        if (row < rangeFilter.minRow || row > rangeFilter.maxRow) continue;
      }

      const t = c.attrs.t || '';
      const s = parseInt(c.attrs.s || '0');
      const vNode = find(c, 'v');
      const vText = vNode ? vNode.text : '';

      // Extract formula element
      const fNode = find(c, 'f');
      const formula = fNode ? fNode.text : null;

      let value, type;

      if (t === 's') {
        // shared string
        const idx = parseInt(vText);
        value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        type = 's';
      } else if (t === 'str' || t === 'inlineStr') {
        // inline string
        if (t === 'inlineStr') {
          const is = find(c, 'is');
          const tNode = is ? find(is, 't') : null;
          value = tNode ? tNode.text : '';
        } else {
          value = vText;
        }
        type = 's';
      } else if (t === 'b') {
        value = vText === '1';
        type = 'b';
      } else if (t === 'e') {
        value = vText; // error string like "#REF!"
        type = 's';
      } else {
        // number (or date)
        if (!vText && vText !== '0') continue; // blank cell
        value = parseFloat(vText);
        if (isNaN(value)) continue;
        // check if date format
        const numFmtId = styleNumFmts[s] || 0;
        type = dateIds.has(numFmtId) ? 'd' : 'n';
      }

      rawCells.push({ col, row, value, type, formula });
      if (col > maxCol) maxCol = col;
      if (row > maxRow) maxRow = row;
    }
  }

  if (rawCells.length === 0) return { columns: {}, headers: [], rows: 0 };

  // determine headers
  const headerCells = rawCells.filter(c => c.row === headerRow - 1);
  const allHeadersAreStrings = headerCells.length > 0 &&
    headerCells.every(c => c.type === 's');

  const headers = [];
  const headerMap = {};
  if (allHeadersAreStrings) {
    for (const c of headerCells) {
      headerMap[c.col] = c.value;
    }
  }

  // determine columns present
  const colSet = new Set(rawCells.map(c => c.col));
  const colList = [...colSet].sort((a, b) => a - b);

  for (const col of colList) {
    const name = headerMap[col] || colLetter(col);
    headers.push(name);
  }

  // determine data rows (exclude header row)
  const dataCells = allHeadersAreStrings
    ? rawCells.filter(c => c.row !== headerRow - 1)
    : rawCells;

  // determine row range
  const dataRows = dataCells.map(c => c.row);
  const minDataRow = dataRows.length > 0 ? Math.min(...dataRows) : 0;
  const maxDataRow = dataRows.length > 0 ? Math.max(...dataRows) : 0;
  const rowCount = maxDataRow - minDataRow + 1;

  // group cells by column, determine types
  const colCells = {};
  for (const col of colList) colCells[col] = [];
  for (const c of dataCells) colCells[c.col].push(c);

  const columns = {};
  for (let ci = 0; ci < colList.length; ci++) {
    const col = colList[ci];
    const name = headers[ci];
    const cells = colCells[col];

    // count types
    const typeCounts = { n: 0, s: 0, b: 0, d: 0 };
    for (const c of cells) typeCounts[c.type]++;

    const total = cells.length;
    let colType;
    if (total === 0) {
      colType = 's'; // empty column defaults to string
    } else if (typeCounts.n === total) {
      colType = 'n';
    } else if (typeCounts.d === total) {
      colType = 'd';
    } else if (typeCounts.b === total) {
      colType = 'b';
    } else if (typeCounts.s === total) {
      colType = 's';
    } else {
      colType = 's'; // mixed → string
    }

    // build typed array
    if (colType === 'n' || colType === 'd') {
      const arr = new Float64Array(rowCount);
      arr.fill(NaN);
      for (const c of cells) arr[c.row - minDataRow] = c.value;
      columns[name] = arr;
    } else if (colType === 'b') {
      const arr = new Uint8Array(rowCount);
      for (const c of cells) arr[c.row - minDataRow] = c.value ? 1 : 0;
      columns[name] = arr;
    } else {
      const arr = new Array(rowCount).fill('');
      for (const c of cells) arr[c.row - minDataRow] = String(c.value);
      columns[name] = arr;
    }
  }

  // Build parallel formulas object
  const formulas = {};
  for (let ci = 0; ci < colList.length; ci++) {
    const col = colList[ci];
    const name = headers[ci];
    const cells = colCells[col];
    const hasFormulas = cells.some(c => c.formula);
    if (hasFormulas) {
      const arr = new Array(rowCount).fill(null);
      for (const c of cells) {
        if (c.formula) arr[c.row - minDataRow] = c.formula;
      }
      formulas[name] = arr;
    }
  }

  // Map column letter → header name for formula decompilation
  const colLetterMap = {};
  for (let ci = 0; ci < colList.length; ci++) {
    colLetterMap[colLetter(colList[ci])] = headers[ci];
  }

  return { columns, headers, rows: rowCount, formulas, colLetterMap };
}

// ── Public API ──

async function read(source, options) {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const files = await unzip(bytes);

  const decode = (path) => {
    const data = files.get(path);
    return data ? new TextDecoder().decode(data) : null;
  };

  const sharedStrings = parseSharedStrings(decode('xl/sharedStrings.xml'));
  const styles = parseDateFormats(decode('xl/styles.xml'));

  const wbXml = decode('xl/workbook.xml');
  const relsXml = decode('xl/_rels/workbook.xml.rels');
  if (!wbXml || !relsXml) throw new Error('invalid xlsx: missing workbook');

  const sheetDefs = parseWorkbook(wbXml, relsXml);
  const filterSheet = options && options.sheet;

  const sheets = [];
  for (const def of sheetDefs) {
    if (filterSheet && def.name !== filterSheet) continue;
    const wsXml = decode(def.path);
    if (!wsXml) continue;
    const result = parseWorksheet(wsXml, sharedStrings, styles, options);
    sheets.push({ name: def.name, ...result });
  }

  return { sheets };
}

// ── src/table.js ──

// @gcu/sheet — the TABLE-DOCUMENT adapter.
//
// `read()` already resolves a worksheet into typed columns (Float64Array for
// numbers and dates, Uint8Array for booleans, string arrays otherwise). This
// exposes that as the same table-document shape the rest of GCU speaks —
// { header: { table, columns, count, numericColumns }, rows, at } — so a
// consumer can hand a worksheet to anything that reads a table WITHOUT a
// round-trip through CSV. Types come from Excel; nothing is re-sniffed.
//
// A workbook is not a coordinate system: nothing here infers geometry. A sheet
// is a table. Promoting one to something spatial is the host's explicit act.

const bytesOf = async (source) => {
  if (source instanceof Uint8Array) return source;
  if (source && typeof source.arrayBuffer === 'function') return new Uint8Array(await source.arrayBuffer());
  return new Uint8Array(source);
};

// A cheap look inside: what sheets are in here, and how big are they? Enough to
// draw a picker without committing to a full parse of every sheet.
async function census(source, options) {
  const { sheets } = await read(await bytesOf(source), options);
  return {
    sheets: sheets.map((s) => ({
      name: s.name,
      rows: s.rows,
      columns: s.headers.length,
      headers: s.headers,
      empty: !s.rows || !s.headers.length,
    })),
  };
}

// One worksheet → a table document. `sheet` names it; omitted takes the first.
async function openSheet(source, { sheet = null, headerRow = 1 } = {}) {
  const { sheets } = await read(await bytesOf(source), { sheet: sheet || undefined, headerRow });
  const ws = sheet ? sheets.find((s) => s.name === sheet) : sheets[0];
  if (!ws) throw new Error(`sheet "${sheet}" not found`);
  const columns = ws.headers.map((h, i) => (String(h).trim() || `col${i + 1}`));
  const data = columns.map((name, i) => ws.columns[ws.headers[i]]);
  // a column is numeric because EXCEL says so (Float64Array), not because a
  // string parsed — dates included (they arrive as serial numbers)
  const numericColumns = [];
  columns.forEach((name, i) => { if (data[i] instanceof Float64Array) numericColumns.push({ i, name }); });
  const count = ws.rows || 0;
  const cell = (ci, r) => {
    const col = data[ci];
    if (!col) return '';
    const v = col[r];
    if (v == null) return '';
    if (col instanceof Float64Array) return Number.isNaN(v) ? '' : v;
    if (col instanceof Uint8Array) return v ? 'true' : 'false';
    return v;
  };
  return {
    header: {
      table: true, sheet: ws.name, columns, count,
      numericColumns, mapping: null, grid: null, bbox: null,
    },
    // one row as an array of field values, in column order (the shape every
    // table consumer already reads)
    at: (r) => columns.map((_, ci) => cell(ci, r)),
    // batched iteration, so a host can stream it like any other table
    async *rows({ batch = 4096 } = {}) {
      for (let start = 0; start < count; start += batch) {
        const end = Math.min(count, start + batch);
        const out = [];
        for (let r = start; r < end; r++) out.push(columns.map((_, ci) => cell(ci, r)));
        yield out;
      }
    },
  };
}

// ── src/writer.js ──

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ── Shared strings ──

function buildSharedStrings(sheets) {
  const map = new Map(); // string → index
  const list = [];

  const intern = (s) => {
    if (map.has(s)) return map.get(s);
    const idx = list.length;
    map.set(s, idx);
    list.push(s);
    return idx;
  };

  for (const sheet of sheets) {
    const cols = sheet.columns;
    const colNames = Object.keys(cols);
    // intern header names
    for (const name of colNames) intern(name);
    // intern string values
    for (const name of colNames) {
      const col = cols[name];
      const values = Array.isArray(col) || ArrayBuffer.isView(col) ? col : col.values;
      if (!values) continue;
      for (const v of values) {
        if (typeof v === 'string') intern(v);
      }
    }
  }

  return { map, list };
}

function emitSharedStrings(list) {
  const items = list.map(s => tag('si', null, tag('t', null, escape(s)))).join('');
  return XML_HEADER + tag('sst', {
    xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    count: list.length, uniqueCount: list.length
  }, items);
}

// ── Styles ──

function buildStyles(sheets) {
  // collect unique format codes, assign numFmtId starting at 164
  const formatMap = new Map(); // formatCode → numFmtId
  let nextFmtId = 164;
  let hasDateValues = false;

  for (const sheet of sheets) {
    for (const name of Object.keys(sheet.columns)) {
      const col = sheet.columns[name];
      if (col && typeof col === 'object' && !Array.isArray(col) && !ArrayBuffer.isView(col)) {
        if (col.format) {
          if (!formatMap.has(col.format)) formatMap.set(col.format, nextFmtId++);
        }
      }
      // check for Date values (need default date style)
      const values = Array.isArray(col) || ArrayBuffer.isView(col) ? col : (col ? col.values : null);
      if (values) {
        for (const v of values) {
          if (v instanceof Date) { hasDateValues = true; break; }
        }
      }
    }
  }

  // default date format if Date values found but no explicit format
  const defaultDateFmt = 'yyyy-mm-dd';
  if (hasDateValues && !formatMap.has(defaultDateFmt)) {
    formatMap.set(defaultDateFmt, nextFmtId++);
  }

  // xf entries: index 0 = default, then one per unique format
  // returns { xml, colStyleIndex(col) }
  const fmtEntries = [...formatMap.entries()];

  return { formatMap, fmtEntries, hasDateValues, defaultDateFmt };
}

function emitStyles(styleInfo) {
  const { fmtEntries } = styleInfo;

  let numFmts = '';
  if (fmtEntries.length > 0) {
    const items = fmtEntries.map(([code, id]) =>
      tag('numFmt', { numFmtId: id, formatCode: code })
    ).join('');
    numFmts = tag('numFmts', { count: fmtEntries.length }, items);
  } else {
    numFmts = tag('numFmts', { count: 0 });
  }

  const fonts = tag('fonts', { count: 1 },
    tag('font', null, tag('sz', { val: 11 }), tag('name', { val: 'Calibri' }))
  );
  const fills = tag('fills', { count: 2 },
    tag('fill', null, tag('patternFill', { patternType: 'none' })),
    tag('fill', null, tag('patternFill', { patternType: 'gray125' }))
  );
  const borders = tag('borders', { count: 1 },
    tag('border', null, tag('left'), tag('right'), tag('top'), tag('bottom'), tag('diagonal'))
  );
  const cellStyleXfs = tag('cellStyleXfs', { count: 1 },
    tag('xf', { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0 })
  );

  // cellXfs: index 0 = default, then one per format
  const xfItems = [tag('xf', { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 })];
  for (const [, numFmtId] of fmtEntries) {
    xfItems.push(tag('xf', { numFmtId, fontId: 0, fillId: 0, borderId: 0, xfId: 0, applyNumberFormat: 1 }));
  }
  const cellXfs = tag('cellXfs', { count: xfItems.length }, ...xfItems);

  return XML_HEADER + tag('styleSheet', {
    xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  }, numFmts, fonts, fills, borders, cellStyleXfs, cellXfs);
}

// ── Worksheet ──

function emitWorksheet(sheet, ssMap, styleInfo, tableRIds) {
  const cols = sheet.columns;
  const colNames = Object.keys(cols);
  if (colNames.length === 0) return XML_HEADER + tag('worksheet', {
    xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  }, tag('sheetData'));

  // determine row count
  let rowCount = 0;
  for (const name of colNames) {
    const col = cols[name];
    const values = Array.isArray(col) || ArrayBuffer.isView(col) ? col : (col ? col.values || [] : []);
    if (values.length > rowCount) rowCount = values.length;
  }

  const { formatMap, fmtEntries, defaultDateFmt } = styleInfo;

  // helper: get style index for a column
  const getStyleIdx = (col) => {
    if (col && typeof col === 'object' && !Array.isArray(col) && !ArrayBuffer.isView(col) && col.format) {
      const idx = fmtEntries.findIndex(([code]) => code === col.format);
      return idx >= 0 ? idx + 1 : 0;
    }
    return 0;
  };

  // helper: get date style index
  const dateStyleIdx = () => {
    const idx = fmtEntries.findIndex(([code]) => code === defaultDateFmt);
    return idx >= 0 ? idx + 1 : 0;
  };

  let sharedFormulaIdx = 0;
  const rows = [];

  // header row
  const headerCells = [];
  for (let ci = 0; ci < colNames.length; ci++) {
    const ref = cellRef(ci, 0);
    const ssIdx = ssMap.get(colNames[ci]);
    headerCells.push(tag('c', { r: ref, t: 's' }, tag('v', null, String(ssIdx))));
  }
  rows.push(tag('row', { r: 1 }, ...headerCells));

  // data rows
  for (let ri = 0; ri < rowCount; ri++) {
    const rowCells = [];
    const excelRow = ri + 2; // 1-indexed, after header

    for (let ci = 0; ci < colNames.length; ci++) {
      const ref = cellRef(ci, ri + 1);
      const col = cols[colNames[ci]];
      const values = Array.isArray(col) || ArrayBuffer.isView(col) ? col : (col ? col.values || [] : []);
      const formulas = (col && !Array.isArray(col) && !ArrayBuffer.isView(col)) ? col.formulas : null;
      const sharedFormula = (col && !Array.isArray(col) && !ArrayBuffer.isView(col)) ? col.sharedFormula : null;
      const value = ri < values.length ? values[ri] : null;

      if (value === null || value === undefined) continue;

      const attrs = { r: ref };
      let children = '';

      // handle shared formula
      if (sharedFormula && ri === 0) {
        const fText = sharedFormula.base.startsWith('=') ? sharedFormula.base.slice(1) : sharedFormula.base;
        children += tag('f', { t: 'shared', ref: sharedFormula.ref, si: sharedFormulaIdx }, escape(fText));
      } else if (sharedFormula && ri > 0) {
        children += tag('f', { t: 'shared', si: sharedFormulaIdx });
      }

      // per-cell formula
      if (!sharedFormula && formulas && ri < formulas.length && formulas[ri]) {
        const fText = formulas[ri].startsWith('=') ? formulas[ri].slice(1) : formulas[ri];
        children += tag('f', null, escape(fText));
      }

      // value
      if (value instanceof Date) {
        const serial = dateToSerial(value);
        attrs.s = dateStyleIdx();
        children += tag('v', null, String(serial));
      } else if (typeof value === 'boolean') {
        attrs.t = 'b';
        children += tag('v', null, value ? '1' : '0');
      } else if (typeof value === 'number') {
        const si = getStyleIdx(col);
        if (si > 0) attrs.s = si;
        children += tag('v', null, String(value));
      } else if (typeof value === 'string') {
        attrs.t = 's';
        const ssIdx = ssMap.get(value);
        children += tag('v', null, String(ssIdx));
      }

      rowCells.push(tag('c', attrs, children));
    }

    if (rowCells.length > 0) rows.push(tag('row', { r: excelRow }, ...rowCells));

    // increment shared formula index at end of column processing
    // (handled per-column below instead)
  }

  // count shared formulas used
  for (const name of colNames) {
    const col = cols[name];
    if (col && typeof col === 'object' && !Array.isArray(col) && !ArrayBuffer.isView(col) && col.sharedFormula) {
      sharedFormulaIdx++;
    }
  }

  let wsContent = tag('sheetData', null, ...rows);

  // table parts
  if (tableRIds && tableRIds.length > 0) {
    const parts = tableRIds.map(rId => tag('tablePart', { 'r:id': rId })).join('');
    wsContent += tag('tableParts', { count: tableRIds.length }, parts);
  }

  return XML_HEADER + tag('worksheet', {
    xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  }, wsContent);
}

// ── Tables ──

function emitTable(tableId, tableDef, colNames) {
  const style = tableDef.style || 'TableStyleMedium2';
  const tableCols = [];

  // parse ref to get column range
  const parts = tableDef.ref.split(':');
  const tl = { col: 0, row: 0 };
  const br = { col: colNames.length - 1, row: 0 };
  const refMatch1 = parts[0].match(/([A-Z]+)(\d+)/);
  const refMatch2 = parts[1].match(/([A-Z]+)(\d+)/);
  if (refMatch1 && refMatch2) {
    const startCol = colLetter(0); // we use all columns
  }

  for (let i = 0; i < colNames.length; i++) {
    tableCols.push(tag('tableColumn', { id: i + 1, name: colNames[i] }));
  }

  return XML_HEADER + tag('table', {
    xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    id: tableId, name: tableDef.name, displayName: tableDef.name,
    ref: tableDef.ref, totalsRowShown: 0
  },
    tag('autoFilter', { ref: tableDef.ref }),
    tag('tableColumns', { count: colNames.length }, ...tableCols),
    tag('tableStyleInfo', {
      name: style, showFirstColumn: 0, showLastColumn: 0,
      showRowStripes: 1, showColumnStripes: 0
    })
  );
}

// ── Content Types & Relationships ──

function emitContentTypes(sheetCount, tableCount, hasSharedStrings) {
  const overrides = [];
  overrides.push(tag('Override', {
    PartName: '/xl/workbook.xml',
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
  }));
  for (let i = 1; i <= sheetCount; i++) {
    overrides.push(tag('Override', {
      PartName: `/xl/worksheets/sheet${i}.xml`,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
    }));
  }
  if (hasSharedStrings) {
    overrides.push(tag('Override', {
      PartName: '/xl/sharedStrings.xml',
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml'
    }));
  }
  overrides.push(tag('Override', {
    PartName: '/xl/styles.xml',
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
  }));
  for (let i = 1; i <= tableCount; i++) {
    overrides.push(tag('Override', {
      PartName: `/xl/tables/table${i}.xml`,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml'
    }));
  }

  return XML_HEADER + tag('Types', {
    xmlns: 'http://schemas.openxmlformats.org/package/2006/content-types'
  },
    tag('Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }),
    tag('Default', { Extension: 'xml', ContentType: 'application/xml' }),
    ...overrides
  );
}

function emitRootRels() {
  return XML_HEADER + tag('Relationships', {
    xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships'
  },
    tag('Relationship', {
      Id: 'rId1',
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
      Target: 'xl/workbook.xml'
    })
  );
}

function emitWorkbook(sheets, definedNames) {
  const sheetTags = sheets.map((s, i) =>
    tag('sheet', { name: s.name, sheetId: i + 1, 'r:id': `rId${i + 1}` })
  ).join('');

  let extra = '';
  if (definedNames && definedNames.length > 0) {
    const names = definedNames.map(d =>
      tag('definedName', { name: d.name }, escape(d.formula))
    ).join('');
    extra = tag('definedNames', null, names);
  }

  return XML_HEADER + tag('workbook', {
    xmlns: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  }, tag('sheets', null, sheetTags), extra);
}

function emitWorkbookRels(sheetCount, hasSharedStrings) {
  const rels = [];
  for (let i = 1; i <= sheetCount; i++) {
    rels.push(tag('Relationship', {
      Id: `rId${i}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
      Target: `worksheets/sheet${i}.xml`
    }));
  }
  let nextId = sheetCount + 1;
  if (hasSharedStrings) {
    rels.push(tag('Relationship', {
      Id: `rId${nextId++}`,
      Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
      Target: 'sharedStrings.xml'
    }));
  }
  rels.push(tag('Relationship', {
    Id: `rId${nextId}`,
    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
    Target: 'styles.xml'
  }));

  return XML_HEADER + tag('Relationships', {
    xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships'
  }, ...rels);
}

// ── Public API ──

async function write(workbook) {
  const sheets = workbook.sheets || [];
  const encoder = new TextEncoder();
  const parts = new Map();

  // build shared strings
  const { map: ssMap, list: ssList } = buildSharedStrings(sheets);
  const hasSharedStrings = ssList.length > 0;

  // build styles
  const styleInfo = buildStyles(sheets);

  // count tables across all sheets
  let totalTables = 0;
  let tableId = 1;

  // emit worksheets
  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si];
    const sheetTables = sheet.tables || [];
    const tableRIds = [];

    // emit tables for this sheet
    if (sheetTables.length > 0) {
      const colNames = Object.keys(sheet.columns);

      for (let ti = 0; ti < sheetTables.length; ti++) {
        const tDef = sheetTables[ti];
        const tXml = emitTable(tableId, tDef, colNames);
        parts.set(`xl/tables/table${tableId}.xml`, encoder.encode(tXml));
        tableRIds.push(`rId${ti + 1}`);
        tableId++;
        totalTables++;
      }

      // worksheet rels for tables
      const wsRels = sheetTables.map((_, ti) =>
        tag('Relationship', {
          Id: `rId${ti + 1}`,
          Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/table',
          Target: `../tables/table${totalTables - sheetTables.length + ti + 1}.xml`
        })
      ).join('');
      parts.set(`xl/worksheets/_rels/sheet${si + 1}.xml.rels`,
        encoder.encode(XML_HEADER + tag('Relationships', {
          xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships'
        }, wsRels))
      );
    }

    const wsXml = emitWorksheet(sheet, ssMap, styleInfo, tableRIds);
    parts.set(`xl/worksheets/sheet${si + 1}.xml`, encoder.encode(wsXml));
  }

  // emit shared strings
  if (hasSharedStrings) {
    parts.set('xl/sharedStrings.xml', encoder.encode(emitSharedStrings(ssList)));
  }

  // emit styles
  parts.set('xl/styles.xml', encoder.encode(emitStyles(styleInfo)));

  // emit workbook
  parts.set('xl/workbook.xml', encoder.encode(emitWorkbook(sheets, workbook.definedNames)));
  parts.set('xl/_rels/workbook.xml.rels',
    encoder.encode(emitWorkbookRels(sheets.length, hasSharedStrings)));

  // emit root rels
  parts.set('_rels/.rels', encoder.encode(emitRootRels()));

  // emit content types
  parts.set('[Content_Types].xml',
    encoder.encode(emitContentTypes(sheets.length, totalTables, hasSharedStrings)));

  return zip(parts);
}

// ── src/api.js ──

// Public API — assembles the sheet object from all modules


const sheet = {
  read, write, census, openSheet,
  colLetter, colIndex, cellRef, parseRef,
  dateToSerial, serialToDate,
  // internals for testing
  _crc32: crc32, _zip: zip, _unzip: unzip,
  _tag: tag, _escape: escape, _parseXml: parseXml, _find: find, _findAll: findAll,
};

// ── src/main.js ──

// sheet — ES module entry point (import order doubles as build manifest)
// the table-document adapter (typed columns, no CSV round-trip)

export {
  sheet,
  census,
  openSheet,
};

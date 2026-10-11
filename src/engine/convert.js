// Conversions that need no file format reader: hashes, text encodings both ways, and the open table
// as CSV, TSV or JSON with a save action. Format readers (xlsx, dm, parquet) are the second pass.
import { S, tool, fmt } from './core.js';
import { writeParquet } from '../vendor/parquet.js';

/* ── SHA-256, synchronous, so a card recomputes without a promise ── */
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(bytes) {
  const n = bytes.length, bitLen = n * 8, padded = new Uint8Array(((n + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[n] = 0x80;
  const dv = new DataView(padded.buffer); dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32)); dv.setUint32(padded.length - 4, bitLen >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const rotr = (x, k) => (x >>> k) | (x << (32 - k));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
}
const utf8 = s => new TextEncoder().encode(s);
const fromUtf8 = bytes => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return null; } };
const toHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => { const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t) || t.replace(/=/g, '').length % 4 === 1) return null; try { return Uint8Array.from(atob(t.padEnd(Math.ceil(t.length / 4) * 4, '=')), c => c.charCodeAt(0)); } catch (e) { return null; } };
const sizeOf = bytes => bytes.length < 1024 ? `${bytes.length} bytes` : `${fmt(bytes.length / 1024, 4)} kB`;
const fileNamed = name => Object.values(S.files).find(f => f.name.toLowerCase() === name.toLowerCase());
// what "this file" is: the file behind the open table, else the only file the device holds
const thisFile = () => (S.table && S.table.source === 'file' && S.files[S.table.hash]) || (Object.keys(S.files).length === 1 ? Object.values(S.files)[0] : null);

/* ── hash ───────────────────────────────────────────────────── */
tool({
  name: 'hash', rank: 46,
  skill: { group: 'Compute', title: 'Hashes and encodings', on: 'own SHA-256, TextEncoder', about: 'SHA-256 of a text or an opened file; text to and from base64, hex and URL encoding. Bytes that are not UTF-8 are shown as hex, not guessed.', examples: ['sha256: abc', 'sha256 of this file', 'base64 decode: SGVsbG8=', 'hex encode: golem', 'url decode: a%20b%26c'] },
  read: text => {
    let m = /^(?:sha-?256|hash)(?:\s+of)?(?:\s+(?:this|the)\s+file|\s+file)\s*$/i.exec(text); if (m) return { file: 'this' };
    m = /^(?:sha-?256|hash)\s+of\s+(\S+\.\w{1,6})$/i.exec(text); if (m && fileNamed(m[1])) return { file: m[1] };
    m = /^(?:sha-?256|hash)(?:\s+of)?\s*[:]\s*(.*)$/i.exec(text) || /^(?:sha-?256|hash)\s+of\s+(.+)$/i.exec(text); if (m) return { text: m[1] };
    return null;
  },
  topic: () => ['SHA-256', 1],
  run: a => {
    let bytes, read;
    if (a.file) {
      const f = a.file === 'this' ? thisFile() : fileNamed(a.file);
      if (!f) return { read: ['SHA-256 of', { v: a.file === 'this' ? 'this file' : a.file }], body: [{ t: 'note', kind: 'err', text: a.file === 'this' ? 'No file is open. Open one from your files first, or name it.' : `${a.file} is not kept on this device.` }], trace: ['no file'] };
      bytes = utf8(f.text); read = ['SHA-256 of', { v: f.name }];
    } else { bytes = utf8(a.text); read = ['SHA-256 of', { v: a.text.length > 40 ? a.text.slice(0, 37) + '…' : a.text }]; }
    const hex = sha256(bytes);
    return { read, value: hex, copy: hex, body: [{ t: 'pre', text: hex }, { t: 'kv', rows: [['input', `${sizeOf(bytes)} as UTF-8${a.file ? ', the file\'s text as this device keeps it' : ''}`], ['algorithm', 'SHA-256 (FIPS 180-4), computed here']] }, { t: 'actions', items: [{ act: 'copy', label: 'Copy digest' }] }], trace: [`utf8 → ${bytes.length} bytes`, `sha256 → ${hex.slice(0, 16)}…`], py: a.file ? `hashlib.sha256(open("${a.file === 'this' ? thisFile().name : a.file}", "rb").read()).hexdigest()` : `hashlib.sha256(${JSON.stringify(a.text)}.encode()).hexdigest()` };
  }
});

/* ── text encodings ─────────────────────────────────────────── */
const ENC = { base64: 'base64', b64: 'base64', hex: 'hex', hexadecimal: 'hex', url: 'url', uri: 'url', percent: 'url', urlencode: 'url', urlencoded: 'url' };
tool({
  name: 'encode', rank: 47,
  read: text => {
    let m = /^(?:(encode|decode)\s+(?:this\s+|as\s+|from\s+|to\s+)?)?(base64|b64|hex|hexadecimal|url|uri|percent|urlencoded?)(?:[\s-]*(encode|decode|encoded|decoded))?\s*[:]\s*(.*)$/i.exec(text);
    if (!m) m = /^(?:(encode|decode)\s+(?:this\s+)?(?:as\s+|from\s+|to\s+|in\s+)?)(base64|b64|hex|hexadecimal|url|uri|percent|urlencoded?)\s+(.+)$/i.exec(text) && (x => [x[0], x[1], x[2], null, x[3]])(/^(?:(encode|decode)\s+(?:this\s+)?(?:as\s+|from\s+|to\s+|in\s+)?)(base64|b64|hex|hexadecimal|url|uri|percent|urlencoded?)\s+(.+)$/i.exec(text));
    if (!m) return null;
    const op = ((m[1] || m[3] || 'encode').toLowerCase().replace(/d$/, '')).replace(/^encode$|^decode$/, x => x);
    return { enc: ENC[m[2].toLowerCase()], op: /^dec/.test(op) ? 'decode' : 'encode', text: m[4] };
  },
  amend: [{ arg: 'op', match: /^(encode|decode)(?: it| instead)?$/ }],
  topic: a => [`${a.enc} ${a.op}`, 1],
  run: a => {
    const read = [a.enc, { v: a.op, key: 'op', alts: ['encode', 'decode'], cur: a.op }, { v: a.text.length > 40 ? a.text.slice(0, 37) + '…' : a.text }];
    const refuse = (text, why) => ({ read, body: [{ t: 'note', kind: 'err', text }], trace: [why] });
    let out, rows, trace;
    if (a.op === 'encode') {
      const bytes = utf8(a.text);
      out = a.enc === 'base64' ? b64(bytes) : a.enc === 'hex' ? toHex(bytes) : encodeURIComponent(a.text);
      rows = [['input', `${a.text.length} characters, ${sizeOf(bytes)} as UTF-8`], ['output', `${out.length} characters${a.enc === 'url' ? ' (encodeURIComponent: a space is %20, reserved characters are escaped)' : ''}`]];
      trace = [`utf8 → ${bytes.length} bytes`, `${a.enc} → ${out.length} chars`];
    } else if (a.enc === 'url') {
      try { out = decodeURIComponent(a.text.replace(/\+/g, '%20')); } catch (e) { return refuse('That is not valid URL encoding: a % must be followed by two hex digits.', 'decodeURIComponent: rejected'); }
      rows = [['input', `${a.text.length} characters`], ['output', `${out.length} characters; "+" was read as a space, as in form encoding`]]; trace = ['decodeURIComponent'];
    } else {
      let bytes;
      if (a.enc === 'base64') { bytes = unb64(a.text); if (!bytes) return refuse('That is not base64: only A to Z, a to z, 0 to 9, + and / (or - and _), with = padding, in groups of four.', 'base64: rejected'); }
      else { const h = a.text.replace(/\s+|^0x/gi, ''); if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) return refuse('That is not hex: pairs of 0 to 9 and a to f.', 'hex: rejected'); bytes = Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16)); }
      const s = fromUtf8(bytes);
      if (s === null) { out = toHex(bytes); rows = [['bytes', sizeOf(bytes)], ['text', 'not UTF-8, so the bytes are shown as hex rather than guessed at']]; trace = [`${a.enc} → ${bytes.length} bytes`, 'utf8: invalid']; }
      else { out = s; rows = [['bytes', sizeOf(bytes)], ['text', `${s.length} characters of UTF-8`]]; trace = [`${a.enc} → ${bytes.length} bytes`, 'utf8 → text']; }
    }
    return { read, value: out, copy: out, body: [{ t: 'pre', text: out }, { t: 'kv', rows }, { t: 'actions', items: [{ act: 'copy', label: 'Copy result' }] }], trace, py: a.op === 'encode' ? (a.enc === 'base64' ? `base64.b64encode(${JSON.stringify(a.text)}.encode()).decode()` : a.enc === 'hex' ? `${JSON.stringify(a.text)}.encode().hex()` : `urllib.parse.quote(${JSON.stringify(a.text)}, safe="")`) : (a.enc === 'base64' ? `base64.b64decode(${JSON.stringify(a.text)}).decode()` : a.enc === 'hex' ? `bytes.fromhex(${JSON.stringify(a.text)}).decode()` : `urllib.parse.unquote_plus(${JSON.stringify(a.text)})`) };
  }
});

/* ── the open table as CSV, TSV or JSON ─────────────────────── */
const FMT = { csv: 'csv', tsv: 'tsv', json: 'json', parquet: 'parquet', 'comma separated': 'csv', 'tab separated': 'tsv' };
const cell = (v, delim) => v == null ? '' : typeof v === 'number' ? String(v) : (new RegExp(`[${delim === ',' ? ',' : '\\t'}"\\n]`).test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function tableText(t, fmt) {
  const names = t.cols.map(c => c.name);
  if (fmt === 'json') return JSON.stringify(t.rows.map(r => Object.fromEntries(names.map(n => [n, r[n] === undefined ? null : r[n]]))), null, 1);
  const d = fmt === 'tsv' ? '\t' : ',';
  return [names.join(d), ...t.rows.map(r => names.map(n => cell(r[n], d)).join(d))].join('\n') + '\n';
}
// Parquet: a column of numbers is written as DOUBLE, anything else as text; the bytes go to the save action
function parquetOut(t) {
  const name = `${t.name.replace(/\.\w+$/, '')}.parquet`, lost = [];
  const columnData = t.cols.map(c => {
    const vals = t.rows.map(r => r[c.name] == null ? null : r[c.name]), num = vals.every(v => v === null || typeof v === 'number');
    return { name: c.name, data: num ? vals : vals.map(v => v === null ? null : String(v)), type: num ? 'DOUBLE' : 'STRING' };
  });
  const bytes = new Uint8Array(writeParquet({ columnData }));
  const units = t.cols.filter(c => c.unit); if (units.length) lost.push(`column units (${units.map(c => `${c.name}: ${c.unit}`).join(', ')}) are not written; Parquet has a place for them but no reader agrees on it`);
  if (t.source === 'sample') lost.push('this is the sample table, generated data, and the file says nothing else');
  return {
    read: ['the table', { v: t.name }, 'as', { v: 'Parquet', key: 'fmt', alts: ['csv', 'tsv', 'json', 'parquet'], cur: 'parquet' }],
    file: { name, mime: 'application/vnd.apache.parquet', bytes },
    body: [{ t: 'kv', rows: [['rows', String(t.rows.length)], ['columns', columnData.map(c => `${c.name} (${c.type === 'DOUBLE' ? 'double' : 'text'})`).join(', ')], ['size', sizeOf(bytes)], ['compression', 'Snappy, one row group']] }, ...(lost.length ? [{ t: 'note', text: lost.join('. ') + '.' }] : []), { t: 'actions', items: [{ act: 'save', label: `Save ${name}` }] }, { t: 'src', text: t.source === 'sample' ? 'sample data: generated, labelled as such · written by @gcu/parquet' : `${t.name} as typed by @gcu/recon · written by @gcu/parquet` }],
    trace: [`${t.rows.length} rows × ${t.cols.length} columns → parquet`, `writeParquet → ${bytes.length} bytes`], py: `dh.to_parquet("${name}", index=False)`
  };
}
tool({
  name: 'tableExport', rank: 48, pre: ['table'],
  skill: { group: 'Table', title: 'Table as CSV, TSV, JSON or Parquet', on: 'built in · @gcu/parquet', about: 'The open table written out, with what the format cannot hold stated. Copy or save it; Parquet is saved, not copied.', examples: ['the table as json', 'export the table as tsv', 'the table as parquet'] },
  read: (text, q) => { const m = /^(?:export |save |convert |write |give me )?(?:the |this )?(?:table|file|data|rows)(?: as| to| in)? (csv|tsv|json|parquet|comma separated|tab separated)(?: file| format)?$/.exec(q); return m ? { fmt: FMT[m[1]] } : null; },
  amend: [{ arg: 'fmt', match: /^(?:as |to |in )?(csv|tsv|json|parquet)(?: instead)?$/ }],
  topic: a => [`Table as ${a.fmt === 'parquet' ? 'Parquet' : a.fmt.toUpperCase()}`, 1],
  run: a => {
    if (a.fmt === 'parquet') return parquetOut(S.table);
    const t = S.table, text = tableText(t, a.fmt), base = t.name.replace(/\.\w+$/, ''), name = `${base}.${a.fmt}`;
    const lines = text.split('\n'), preview = lines.slice(0, a.fmt === 'json' ? 12 : 6).join('\n') + (lines.length > (a.fmt === 'json' ? 12 : 6) ? '\n…' : '');
    const lost = [];
    if (a.fmt !== 'json') { const units = t.cols.filter(c => c.unit); if (units.length) lost.push(`column units (${units.map(c => `${c.name}: ${c.unit}`).join(', ')}) have no place in ${a.fmt.toUpperCase()}; they stay in the header names only if they were there`); }
    if (t.source === 'sample') lost.push('this is the sample table, generated data, and the file says nothing else');
    const nulls = t.rows.reduce((n, r) => n + t.cols.filter(c => r[c.name] == null).length, 0);
    if (nulls) lost.push(`${nulls} blank cells are written as ${a.fmt === 'json' ? 'null' : 'empty fields'}`);
    return {
      read: ['the table', { v: t.name }, 'as', { v: a.fmt.toUpperCase(), key: 'fmt', alts: ['csv', 'tsv', 'json', 'parquet'], cur: a.fmt }], value: text, copy: text,
      file: { name, mime: a.fmt === 'json' ? 'application/json' : a.fmt === 'tsv' ? 'text/tab-separated-values' : 'text/csv', text },
      body: [{ t: 'kv', rows: [['rows', String(t.rows.length)], ['columns', t.cols.map(c => c.name).join(', ')], ['size', sizeOf(utf8(text))]] }, { t: 'pre', text: preview }, ...(lost.length ? [{ t: 'note', text: lost.join('. ') + '.' }] : []), { t: 'actions', items: [{ act: 'copy', label: 'Copy' }, { act: 'save', label: `Save ${name}` }] }, { t: 'src', text: t.source === 'sample' ? 'sample data: generated, labelled as such' : `${t.name} as typed by @gcu/recon` }],
      trace: [`${t.rows.length} rows × ${t.cols.length} columns → ${a.fmt}`, `${lines.length - (a.fmt === 'json' ? 0 : 1)} lines, ${utf8(text).length} bytes`], py: a.fmt === 'json' ? `dh.to_json("${name}", orient="records")` : `dh.to_csv("${name}", sep=${a.fmt === 'tsv' ? '"\\t"' : '","'}, index=False)`
    };
  }
});

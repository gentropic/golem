// Binary table formats, converted to text when a file is opened: xlsx through @gcu/sheet (one text per
// sheet), Datamine .dm through @gcu/dm, Parquet through @gcu/parquet. Tools stay synchronous and the device keeps the converted text,
// so a session replays from it. What did not carry over is said on the card.
import { sheet } from '../vendor/sheet.js';
import { readDM } from '../vendor/dm.js';
import { readParquet, parquetInfo } from '../vendor/parquet.js';

export const BINARY = /\.(xlsx|xlsm|dm|parquet)$/i;
const cell = v => v == null || (typeof v === 'number' && isNaN(v)) ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).replace(/[\t\r\n]+/g, ' ');
export const gridText = (headers, rows) => [headers.map(cell).join('\t'), ...rows.map(r => r.map(cell).join('\t'))].join('\n') + '\n';

// → { from, tables: { name: text }, lost: [what did not carry over], trace }
export async function convertBinary(name, buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (/\.xls[xm]$/i.test(name)) {
    const wb = await sheet.read(bytes), tables = {}, lost = [];
    for (const s of wb.sheets) {
      if (!s.rows) continue;
      const rows = Array.from({ length: s.rows }, (_, i) => s.headers.map(h => s.columns[h] ? s.columns[h][i] : null));
      tables[s.name] = gridText(s.headers, rows);
      if (s.formulas && Object.keys(s.formulas).length) lost.push(`${Object.keys(s.formulas).length} formulas in ${s.name} kept only as their values`);
    }
    if (!Object.keys(tables).length) throw new Error(`${name} has no sheet with rows in it`);
    lost.push('cell formats, merged cells and charts do not carry over');
    return { from: 'xlsx', tables, lost, trace: [`sheet.read(${name}) → ${wb.sheets.length} sheet${wb.sheets.length === 1 ? '' : 's'}: ${wb.sheets.map(s => `${s.name} (${s.rows} rows)`).join(', ')}`] };
  }
  if (/\.dm$/i.test(name)) {
    const dm = readDM(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), headers = dm.fields.map(f => f.name);
    const rows = Array.from({ length: dm.recordCount }, (_, i) => { const r = dm.getRecord(i); return headers.map(h => r[h]); });
    return { from: 'dm', tables: { [name.replace(/\.dm$/i, '')]: gridText(headers, rows) }, lost: ['the Datamine missing value (±1e30) is read as blank; field precision is as stored'], trace: [`dm.readDM(${name}) → ${dm.recordCount} records, ${headers.length} fields`] };
  }
  if (/\.parquet$/i.test(name)) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), info = parquetInfo(buf), rows = await readParquet(buf), headers = info.columns.map(c => c.name);
    const lost = [], big = new Set(), nested = new Set(), raw = new Set();
    const val = (h, v) => {
      if (typeof v === 'bigint') { if (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(v); big.add(h); return String(v); }
      if (v instanceof Uint8Array) { raw.add(h); return [...v].map(b => b.toString(16).padStart(2, '0')).join(''); }
      if (v && typeof v === 'object' && !(v instanceof Date)) { nested.add(h); return JSON.stringify(v, (k, x) => typeof x === 'bigint' ? String(x) : x); }
      return v;
    };
    const grid = rows.map(r => headers.map(h => val(h, r[h])));
    if (big.size) lost.push(`integers too large for a JavaScript number in ${[...big].join(', ')} kept as text`);
    if (nested.size) lost.push(`nested values in ${[...nested].join(', ')} written as JSON text`);
    if (raw.size) lost.push(`binary values in ${[...raw].join(', ')} written as hex`);
    lost.push('the Parquet schema types become recon\'s types; key-value metadata does not carry over');
    return { from: 'parquet', tables: { [name.replace(/\.parquet$/i, '')]: gridText(headers, grid) }, lost, trace: [`parquet.read(${name}) → ${info.rowCount} rows, ${headers.length} columns, ${info.codec || 'uncompressed'}`] };
  }
  throw new Error(`${name}: not a format I read (xlsx, dm or parquet)`);
}

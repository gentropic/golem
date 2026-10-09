// Binary table formats, converted to text when a file is opened: xlsx through @gcu/sheet (one text per
// sheet), Datamine .dm through @gcu/dm. Tools stay synchronous and the device keeps the converted text,
// so a session replays from it. What did not carry over is said on the card.
import { sheet } from '../vendor/sheet.js';
import { readDM } from '../vendor/dm.js';

export const BINARY = /\.(xlsx|xlsm|dm)$/i;
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
  throw new Error(`${name}: not a format I read (xlsx or dm)`);
}

// The field notebook: stations, the planes and lines measured at them, and samples, as a device table ("field") that
// every table question can open. "station 14" starts a station where you stand (one fix on a tap) or at coordinates;
// "add bedding 045/30", "add sample S-14-a" and "add #12" (a compass reading or a plane already on a card) write rows at
// the open station. A compass reading at a station with a position is corrected to true north with the World Magnetic
// Model there, on the day it was taken, and the correction is kept with the row. Rows belong to the device, like the
// log; a card writes its row once (by id) and undo removes it. Typed attitudes are kept as typed, north as you read it.
import { S, tool, frame, noun, shape, postmod, condition, fmt, iso, p3, p2, clock, checksOf, said } from './core.js';
import { conversions, statistics } from '../vendor/bearing.js';
import { field as wmm } from '../vendor/wmm.js';
import { fromDevice } from './field.js';
import { oriOf } from './orientation.js';

export const FIELD_COLS = [{ name: 'station', type: 'category' }, { name: 'date', type: 'category' }, { name: 'time', type: 'category' }, { name: 'feature', type: 'category' },
  { name: 'azimuth', type: 'numeric', unit: 'deg' }, { name: 'dip', type: 'numeric', unit: 'deg' }, { name: 'sample', type: 'category' }, { name: 'note', type: 'category' },
  { name: 'lat', type: 'numeric' }, { name: 'lon', type: 'numeric' }, { name: 'acc', type: 'numeric', unit: 'm' }, { name: 'north', type: 'category' }, { name: 'via', type: 'category' }];
export const fieldTable = () => S.tables.field || (S.tables.field = { name: 'field', cols: FIELD_COLS, rows: [] });
const rows = () => (S.tables.field ? S.tables.field.rows : []);
const stationRow = name => rows().find(r => r.feature === 'station' && r.station === name);
// the open station: the last one started on this device
export const stationNow = () => { const s = rows().filter(r => r.feature === 'station'); return s.length ? s[s.length - 1].station : null; };
const LINES = new Set(['line', 'lineation', 'fold axis', 'striation']);
const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const put = row => { const t = fieldTable(), at = t.rows.findIndex(r => r.id === row.id); if (at >= 0) t.rows[at] = row; else t.rows.push(row); return t; };
const SRC = { t: 'src', text: 'the field notebook · a table on this device · nothing leaves it' };
const fmtLL = (lat, lon) => `${fmt(lat, 7)}, ${fmt(lon, 7)}`;

/* ── the precondition: a station is open ───────────────────── */
condition('station', {
  holds: () => !!stationNow(),
  prompt: 'No station is open.', establish: () => [],
  none: 'No station is open: start one where you stand with "station 14", or at coordinates with "station 14 at -19.92, -43.94".'
});

/* ── stations ───────────────────────────────────────────────── */
tool({
  name: 'station', effects: ['device'], post: ['station'],
  skill: { group: 'Field', title: 'Field notebook', on: 'device table · @gcu/bearing · @gcu/wmm', about: 'Stations where you stand or at coordinates; planes, lines and samples added at the open station, compass readings corrected to true north at the station; a summary with a stereonet; the notebook opened as a table and saved as GeoJSON.', examples: ['station 14', 'add bedding 045/30', 'add sample S-14-a', 'station 14 summary', 'export the field notebook as geojson'] },
  topic: a => [`Station ${a.name}`, 2],
  undo: a => { const t = fieldTable(); t.rows = t.rows.filter(r => r.id !== a.id); },
  run: a => {
    const when = new Date(a.at || clock.now()), row = { id: a.id, station: a.name, date: iso(when), time: hhmm(when), feature: 'station', azimuth: null, dip: null, sample: null, note: a.note || null, lat: a.lat ?? null, lon: a.lon ?? null, acc: a.acc ?? null, north: null, via: a.fix ? 'position fix' : a.lat != null ? 'typed' : null };
    const t = put(row), read = ['station', { v: a.name }, ...(a.lat != null ? ['at', { v: fmtLL(a.lat, a.lon) }] : [])];
    const n = t.rows.filter(r => r.feature === 'station').length;
    const capture = a.lat == null ? { kind: 'position', set: (args, v) => { args.lat = +(+v.lat).toFixed(6); args.lon = +(+v.lon).toFixed(6); args.acc = v.acc == null ? null : Math.round(+v.acc); args.fix = true; args.at = +v.at || args.at; } } : null;
    return {
      read, capture,
      body: [...(capture ? [{ t: 'capture', kind: 'position', how: 'The station\'s position: one fix, kept with the station. Without one, the station has no place, and compass readings stay magnetic.' }] : []),
        { t: 'note', kind: 'ok', ...said('Station {name} is open. Stations in the notebook: {n}. Add to it: "add bedding 045/30", "add sample {name}-a".', { name: a.name, n }) },
        { t: 'kv', rows: [['started', `${row.date} ${row.time}`], ['position', a.lat != null ? `${fmtLL(a.lat, a.lon)}${a.acc != null ? ` ±${a.acc} m` : ''}` : 'none yet']] }, SRC],
      trace: [`field.station(${JSON.stringify(a.name)})`, a.lat != null ? `position ${a.fix ? 'from one fix' : 'as typed'}` : 'wait: a position fix, or none'], py: `field.station("${a.name}"${a.lat != null ? `, lat=${a.lat}, lon=${a.lon}` : ''})`
    };
  }
});

/* ── adding to the open station ─────────────────────────────── */
// a row's attitude: typed (as typed), or a compass reading (magnetic as measured; true with WMM at the station's position)
function attitude(a, st) {
  if (a.typed) return { az: a.typed[0], dip: a.typed[1], north: 'as typed', via: 'typed', trace: ['as typed'] };
  if (!a.reading) return null;
  const r = a.reading, [m, dip] = fromDevice(a.what, r.alpha, r.beta, r.gamma), mag = ((m % 360) + 360) % 360;
  if (st && st.lat != null) {
    const d = wmm(st.lat, st.lon, { date: new Date(r.at || clock.now()) }).decl, az = ((mag + d) % 360 + 360) % 360;
    return { az, dip, north: `true (WMM at the station, ${fmt(d, 3)}°)`, via: r.via === 'browser' ? 'browser compass' : 'phone compass', trace: [`device α ${fmt(r.alpha, 5)}° β ${fmt(r.beta, 5)}° γ ${fmt(r.gamma, 5)}° → ${p3(mag)}/${p2(dip)} magnetic`, `+ declination ${fmt(d, 5)}° (WMM at ${fmtLL(st.lat, st.lon)}) → ${p3(az)}/${p2(dip)} true`] };
  }
  return { az: mag, dip, north: 'magnetic (the station has no position)', via: r.via === 'browser' ? 'browser compass' : 'phone compass', trace: [`device α ${fmt(r.alpha, 5)}° β ${fmt(r.beta, 5)}° γ ${fmt(r.gamma, 5)}° → ${p3(mag)}/${p2(dip)} magnetic`, 'north: magnetic (the station has no position)'] };
}
tool({
  name: 'fieldAdd', effects: ['device'], pre: ['station'],
  topic: a => [`Station ${a.station}`, 1],
  undo: a => { const t = fieldTable(); t.rows = t.rows.filter(r => r.id !== a.id); },
  run: a => {
    const st = stationRow(a.station);
    if (!st) return { read: ['add to station', { v: a.station }], body: [{ t: 'note', kind: 'err', text: `There is no station ${a.station} in the notebook. Start it with "station ${a.station}".` }], trace: ['no such station'] };
    const when = new Date((a.reading && a.reading.at) || a.at || clock.now()), at = a.sample ? null : attitude(a, st);
    const row = { id: a.id, station: a.station, date: iso(when), time: hhmm(when), feature: a.feature, azimuth: at ? +at.az.toFixed(1) : null, dip: at ? +at.dip.toFixed(1) : null, sample: a.sample || null, note: a.note || null, lat: st.lat, lon: st.lon, acc: st.acc, north: at ? at.north : null, via: at ? at.via : 'typed' };
    const t = put(row), here = t.rows.filter(r => r.station === a.station && r.feature !== 'station'), orders = checksOf(t, [row]);
    const isLine = LINES.has(a.feature) || a.what === 'line';
    const read = ['add', { v: a.sample ? `sample ${a.sample}` : `${a.feature} ${p3(row.azimuth)}/${p2(row.dip)}` }, 'to station', { v: a.station }];
    const body = [{ t: 'note', kind: 'ok', ...said('Added to station {station}. Entries there: {n}.', { station: a.station, n: here.length }) }, ...orders];
    if (at) body.push({ t: 'big', v: `${p3(row.azimuth)}/${p2(row.dip)}`, unit: `${isLine ? 'trend/plunge' : 'dip direction/dip'}, ${a.feature}` }, isLine ? { t: 'net', planes: [], lines: [{ tr: row.azimuth, pl: row.dip, label: a.feature }] } : { t: 'net', planes: [{ dd: row.azimuth, dip: row.dip }], lines: [] });
    body.push({ t: 'kv', rows: [...(at ? [['north', at.north], ['from', at.via + (a.from ? `, card #${String(a.from).padStart(2, '0')}` : '')]] : []), ...(a.note ? [['note', a.note]] : []), ['station', `${a.station}${st.lat != null ? ` at ${fmtLL(st.lat, st.lon)}` : ', no position'}`]] }, SRC);
    return { read, value: at ? [row.azimuth, row.dip] : a.sample, body, trace: [...(at ? at.trace : [`sample ${a.sample}`]), `field.add(${JSON.stringify({ station: a.station, feature: a.feature, azimuth: row.azimuth, dip: row.dip, sample: row.sample })})`, 'undo removes the row'],
      py: `field.add(station="${a.station}", feature="${a.feature}"${at ? `, azimuth=${row.azimuth}, dip=${row.dip}` : `, sample="${a.sample}"`})` };
  }
});

/* ── a station, or the day, at a glance ─────────────────────── */
const fisher = (items, planes) => {
  if (items.length < 2) return null;
  const st = statistics.fisherStats(items.map(([x, y]) => planes ? conversions.planeToDcos(x, y) : conversions.lineToDcos(x, y))), m = planes ? conversions.dcosToPlane(st.mean) : conversions.dcosToLine(st.mean);
  return { m, n: items.length, a95: items.length >= 3 ? st.alpha95 : null };
};
tool({
  name: 'fieldSummary',
  topic: a => [a.station ? `Station ${a.station}` : 'Field notebook', 2],
  run: a => {
    const all = rows().filter(r => a.station ? r.station === a.station : a.date ? r.date === a.date : true);
    const read = a.station ? ['station', { v: a.station }, 'summary'] : a.date ? ['field notebook on', { v: a.date }] : ['the field notebook'];
    if (!all.length) return { read, body: [{ t: 'note', text: a.station ? `There is no station ${a.station} in the notebook.` : 'The field notebook is empty. Start a station with "station 14".' }, SRC], trace: ['field notebook: nothing to show'] };
    const ent = all.filter(r => r.feature !== 'station' && r.azimuth != null), planes = ent.filter(r => !LINES.has(r.feature)), lines = ent.filter(r => LINES.has(r.feature)), samples = all.filter(r => r.sample);
    const stations = [...new Set(all.map(r => r.station))], byKind = {};
    for (const r of planes) (byKind[r.feature] = byKind[r.feature] || []).push([r.azimuth, r.dip]);
    const kv = [['stations', `${stations.length}: ${stations.join(', ')}`], ['planes', String(planes.length)], ['lines', String(lines.length)], ['samples', samples.length ? samples.map(r => r.sample).join(', ') : 'none']];
    for (const [k, items] of Object.entries(byKind)) { const f = fisher(items, true); if (f) kv.push([`mean ${k}`, `${p3(f.m[0])}/${p2(f.m[1])} from ${f.n}${f.a95 != null ? `, α95 ${fmt(f.a95, 3)}°` : ''}`]); }
    const mixed = new Set(ent.map(r => (r.north || '').split(' ')[0])).size > 1;
    const table = { t: 'table', head: ['station', 'time', 'feature', 'attitude', 'sample', 'north'], rows: all.filter(r => r.feature !== 'station').map(r => [r.station, r.time, r.feature, r.azimuth != null ? `${p3(r.azimuth)}/${p2(r.dip)}` : '', r.sample || '', r.north || '']) };
    return {
      read, value: ent.length,
      body: [{ t: 'net', planes: planes.map(r => ({ dd: r.azimuth, dip: r.dip })), lines: lines.map(r => ({ tr: r.azimuth, pl: r.dip, label: r.feature })) }, { t: 'kv', rows: kv },
        ...(mixed ? [{ t: 'note', kind: 'warn', text: 'These rows mix true and magnetic (or as-typed) north: the means put them together as they are.' }] : []),
        ...(table.rows.length ? [table] : []), { t: 'chips', items: ['open the field notebook', 'export the field notebook as geojson'] }, SRC],
      trace: [`${all.length} rows${a.station ? ` at station ${a.station}` : ''}`, 'bearing.statistics.fisherStats for each kind of plane with 2 or more'], py: `field.summary(${a.station ? `station="${a.station}"` : ''})`
    };
  }
});

/* ── saving the notebook ────────────────────────────────────── */
tool({
  name: 'fieldExport', effects: ['save'],
  topic: () => ['Field notebook', 1],
  run: a => {
    const all = rows(), fmtName = a.fmt === 'csv' ? 'CSV' : 'GeoJSON', read = ['the field notebook as', { v: fmtName, key: 'fmt', alts: ['geojson', 'csv'], cur: a.fmt }];
    if (!all.length) return { read, body: [{ t: 'note', text: 'The field notebook is empty. Start a station with "station 14".' }], trace: ['nothing to save'] };
    const props = r => Object.fromEntries(FIELD_COLS.map(c => c.name).filter(n => n !== 'lat' && n !== 'lon').map(n => [n, r[n] ?? null]));
    let text, name, mime;
    if (a.fmt === 'csv') { const names = FIELD_COLS.map(c => c.name), cell = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v); text = [names.join(','), ...all.map(r => names.map(n => cell(r[n])).join(','))].join('\n') + '\n'; name = 'field-notebook.csv'; mime = 'text/csv'; }
    else { text = JSON.stringify({ type: 'FeatureCollection', features: all.map(r => ({ type: 'Feature', geometry: r.lat != null ? { type: 'Point', coordinates: [r.lon, r.lat] } : null, properties: props(r) })) }, null, 1) + '\n'; name = 'field-notebook.geojson'; mime = 'application/geo+json'; }
    const placed = all.filter(r => r.lat != null).length;
    return { read, value: text, copy: text, file: { name, mime, text },
      body: [{ t: 'pre', text: text.split('\n').slice(0, 12).join('\n') + '\n…' }, { t: 'actions', items: [{ act: 'save', label: `Save ${name}` }] }, { t: 'kv', rows: [['rows', String(all.length)], ['with a position', `${placed} of ${all.length}${a.fmt === 'csv' ? '' : '; the others have no geometry'}`], ['coordinates', 'WGS84 longitude, latitude, as the phone or the typing gave them']] }, SRC],
      trace: [`${all.length} rows → ${fmtName}`], py: `field.export("${a.fmt}")` };
  }
});

/* ── what reads them ─────────────────────────────────────────── */
// "station 14", "new station BH-3", "station 14 at -19.92, -43.94", "estação 14"
shape({ type: 'stationid', re: String.raw`[a-z]{0,4}-?\d{1,5}(?:-[a-z0-9]{1,4})*` });
// "station 14" as a thing rather than a command, for the summary: "summary of station 14", "station 14 summary"
// (a bare "station 14" starts a station; with "summary" after it, it is the summary)
shape({ type: 'stationref', re: String.raw`(?:station|estação|estacao|ponto)\s+[a-z]{0,4}-?\d{1,5}(?:-[a-z0-9]{1,4})*` });
shape({ type: 'stationsum', re: String.raw`(?:station|estação|estacao|ponto)\s+[a-z]{0,4}-?\d{1,5}(?:-[a-z0-9]{1,4})*\s+(?:summary|resumo)` });
const stationOfRef = v => String(v).trim().split(/\s+/)[1].toUpperCase();
// "#12": a card of this session, by its number
shape({ type: 'cardref', re: String.raw`#\d{1,4}` });
noun({ type: 'fieldnb', words: { notebook: ['field notebook', 'the field notebook', 'my field notebook', 'notebook', 'stations', 'the stations'] }, words_pt: { notebook: ['caderneta', 'caderneta de campo', 'a caderneta', 'estações'] } });
postmod({ prep: '', heads: ['measurable'], attr: 'ori', mod: 'orientation' });   // "lineation 30/200"
noun({ type: 'fieldfmt', words: { geojson: ['geojson'], csv: ['csv'] }, words_pt: { geojson: ['geojson'], csv: ['csv'] } });
noun({ type: 'devtable', words: { field: ['field notebook', 'the field notebook', 'my field notebook'] }, words_pt: { field: ['caderneta', 'caderneta de campo', 'a caderneta'] } });
const llOf = n => { const m = n && n.type === 'coords' && /^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(n.value); return m ? { lat: +m[1], lon: +m[2] } : null; };
const idOf = n => n && String(n.type === 'quantity' ? n.n : n.value).trim();
frame({
  name: 'station', label: 'Station', words: ['station', 'new station', 'start station', 'start a station', 'open station'], theme: ['stationid'], required: ['theme'],
  roles: { at: { preps: ['at'], types: ['coords'] } },
  words_pt: ['estação', 'nova estação', 'ponto', 'novo ponto'], label_pt: 'Estação',
  bind: c => stationArgs(idOf(c.theme[0]), c)
});
// the bare form, "station 14" and "station 14 at -19.92, -43.94": the words are one token (the stationref shape, which the
// summary needs), so it is read as that thing said alone
frame({
  name: 'stationBare', label: 'Station', words: [], elidable: true, theme: ['stationref'], required: ['theme'],
  roles: { at: { preps: ['at'], types: ['coords'] } }, words_pt: [], label_pt: 'Estação',
  bind: c => stationArgs(stationOfRef(c.theme[0].value), c)
});
function stationArgs(name, c) { const ll = llOf(c.roles.at && c.roles.at[0]); return name ? { tool: 'station', args: { id: newId(), name: name.toUpperCase(), at: +clock.now(), ...(ll ? { lat: ll.lat, lon: ll.lon } : {}) } } : null; }
// "add bedding 045/30", "add a joint 120/80", "add lineation 30/200: on the hinge", "add #12", "add sample S-14-a"
const entryArgs = (feature, extra) => ({ id: newId(), station: stationNow(), feature, at: +clock.now(), ...extra });
function fromCard(ref) {
  const n = +String(ref).replace('#', ''), c = S.cards.find(x => x.id === n); if (!c) return null;
  if (c.tool === 'measure' && c.args.reading) return entryArgs(c.args.name || (c.args.what === 'line' ? 'line' : 'plane'), { what: c.args.what === 'line' ? 'line' : 'plane', reading: JSON.parse(JSON.stringify(c.args.reading)), from: n });
  if (c.tool === 'plane') return entryArgs('plane', { typed: [c.args.conv === 'sd' ? (c.args.a1 + 90) % 360 : c.args.a1, c.args.a2], from: n });
  return null;
}
frame({
  name: 'fieldAdd', label: 'Add to the station', words: ['add', 'add a', 'add an', 'enter'], theme: ['plane', 'measurable', 'orientation', 'cardref'], required: ['theme'],
  roles: { to: { preps: ['to', 'at'], types: ['stationref', 'stationid'] } },
  words_pt: ['adiciona', 'adicione', 'acrescenta'], label_pt: 'Adicionar à estação',
  bind: c => {
    const th = c.theme[0], to = c.roles.to && (c.roles.to[0].type === 'stationref' ? stationOfRef(c.roles.to[0].value) : idOf(c.roles.to[0]));
    let a = null;
    if (th.type === 'cardref') a = fromCard(th.value);
    else { const o = oriOf(th); if (!o) return null; const feature = th.type === 'orientation' ? 'plane' : String(th.value); a = entryArgs(feature, { what: LINES.has(feature) ? 'line' : 'plane', typed: o }); }
    if (!a) return null;
    if (to) a.station = to.toUpperCase();
    return { tool: 'fieldAdd', args: a };
  }
});
frame({
  name: 'fieldSample', label: 'Sample', words: ['add sample', 'sample', 'took sample', 'bagged sample'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['amostra', 'adiciona amostra', 'coletei a amostra'], label_pt: 'Amostra',
  bind: c => {
    const s = String(c.theme[0].value).trim(), m = /^(\S+)(?:\s*[:,-]\s*|\s+)?(.*)$/.exec(s); if (!m || !/\d/.test(m[1])) return null;
    return { tool: 'fieldAdd', args: entryArgs('sample', { sample: m[1].toUpperCase(), ...(m[2] ? { note: m[2] } : {}) }) };
  }
});
// "summary of station 14", "show station 14", "station 14 summary", "the field notebook": a bare "station 14" stays the
// command that starts a station, so a station is a summary only after a verb or with "summary" after it
const summaryBind = c => { const th = c.theme[0], st = th.type === 'stationref' || th.type === 'stationsum' ? stationOfRef(th.value) : null; return { tool: 'fieldSummary', args: st ? { station: st } : {} }; };
frame({
  name: 'fieldSummary', label: 'Field summary', words: ['summary', 'summary of', 'summarise', 'summarize', 'show'], theme: ['fieldnb', 'stationref'], required: ['theme'], roles: {},
  words_pt: ['resumo', 'resumo da', 'resumo de', 'mostra'], label_pt: 'Resumo de campo', bind: summaryBind
});
frame({
  name: 'fieldSummaryBare', label: 'Field summary', words: [], elidable: true, theme: ['fieldnb', 'stationsum'], required: ['theme'], roles: {},
  words_pt: [], label_pt: 'Resumo de campo', bind: summaryBind
});
frame({
  name: 'fieldExport', label: 'Save the field notebook', words: ['export', 'save', 'download'], theme: ['fieldnb'], required: ['theme'],
  roles: { as: { preps: ['as', 'to', 'in'], types: ['fieldfmt'] } },
  words_pt: ['exporta', 'salva', 'baixa'], label_pt: 'Salvar a caderneta',
  bind: c => ({ tool: 'fieldExport', args: { fmt: c.roles.as ? c.roles.as[0].value : 'geojson' } })
});

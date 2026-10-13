// Formats that are not tables: YAML and JSON both ways (within the strict subset @gcu/yaml reads), WKT and
// GeoJSON both ways (@gcu/wkt), and DXF to GeoJSON or WKT one way (@gcu/dxf). Pasted after a colon, or a
// file from the picker kept on the device. What does not carry over is said on the card.
import { S, tool, frame, fmt } from './core.js';
import { parse as parseYaml, emit, scalar, mapNode, seqNode, mapEntry } from '../vendor/yaml.js';
import { parse as parseWkt, stringify as toWkt } from '../vendor/wkt.js';
import { read as readDxf, explode, arcFromBulge } from '../vendor/dxf.js';

// files the picker opens as a conversion rather than a table
export const DOCUMENT = /\.(dxf|ya?ml|wkt|geojson)$/i;
const kindOfName = name => { const e = (/\.(\w+)$/.exec(name) || [])[1].toLowerCase(); return e === 'yml' ? 'yaml' : e; };
// what each source can become
const TARGETS = { json: ['yaml', 'wkt'], yaml: ['json'], wkt: ['geojson'], geojson: ['wkt', 'yaml'], dxf: ['geojson', 'wkt'] };
const LABEL = { json: 'JSON', yaml: 'YAML', wkt: 'WKT', geojson: 'GeoJSON', dxf: 'DXF' };
const EXT = { json: 'json', yaml: 'yaml', wkt: 'wkt', geojson: 'geojson' };
const MIME = { json: 'application/json', yaml: 'application/yaml', wkt: 'text/plain', geojson: 'application/geo+json' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ── YAML ↔ plain values ────────────────────────────────────── */
function yamlValue(node, lost) {
  if (node.tag) lost.tags++;
  if (node.kind === 'scalar') return node.value;
  if (node.kind === 'seq') return node.items.map(n => yamlValue(n, lost));
  const o = {}; for (const e of node.entries) o[String(e.key.value)] = yamlValue(e.value, lost); return o;
}
function yamlNode(v) {
  if (v === null) return scalar('null', null);
  if (typeof v === 'boolean') return scalar('bool', v);
  if (typeof v === 'number') return Number.isSafeInteger(v) ? scalar('int', v) : scalar('float', v);
  if (typeof v === 'string') return scalar('string', v);
  if (Array.isArray(v)) return seqNode(v.map(yamlNode));
  return mapNode(Object.entries(v).map(([k, x]) => mapEntry(scalar('string', k), yamlNode(x))));
}

/* ── DXF → GeoJSON ──────────────────────────────────────────── */
const ARC_STEPS = 64;   // segments in a full turn when an arc is written as points
const r6 = x => Math.round(x * 1e6) / 1e6;   // points made on an arc are approximate anyway; the drawing's own vertices are not rounded
function dxfFeatures(text) {
  let doc = readDxf(text); const inserts = doc.features.filter(f => f.geometry && f.geometry.kind === 'insert').length;
  if (inserts) doc = explode(doc);
  const out = [], lost = [], skipped = {}; let arcs = 0, circles = 0, xdata = 0, flat = true;
  const pts = v => { const p = []; for (let i = 0; i < v.length; i += 3) { p.push([v[i], v[i + 1], v[i + 2] || 0]); if (v[i + 2]) flat = false; } return p; };
  for (const f of doc.features) {
    const g = f.geometry, props = { layer: f.properties.layer ?? null, entity: f.type };
    if (f.properties.xdata && Object.keys(f.properties.xdata).length) xdata++;
    let geom = null;
    if (!g) { skipped[f.type] = (skipped[f.type] || 0) + 1; continue; }
    if (g.kind === 'polyline') {
      const p = pts(g.vertices), line = [p[0]], n = g.closed ? p.length : p.length - 1;
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[(i + 1) % p.length], arc = g.bulges && g.bulges[i] ? arcFromBulge(a, b, g.bulges[i]) : null;
        if (arc) { arcs++; const k = Math.max(2, Math.ceil(Math.abs(arc.sweep) / (2 * Math.PI) * ARC_STEPS)); for (let j = 1; j < k; j++) { const t = arc.startAngle + arc.sweep * j / k; line.push([r6(arc.center[0] + arc.radius * Math.cos(t)), r6(arc.center[1] + arc.radius * Math.sin(t)), a[2] + (b[2] - a[2]) * j / k]); } }
        line.push(b);
      }
      geom = g.closed && line.length > 3 ? { type: 'Polygon', coordinates: [line] } : { type: 'LineString', coordinates: line };
    } else if (g.kind === 'circle') {
      circles++; const [x, y, z] = g.center; if (z) flat = false;
      const ring = Array.from({ length: ARC_STEPS + 1 }, (_, j) => [r6(x + g.radius * Math.cos(2 * Math.PI * j / ARC_STEPS)), r6(y + g.radius * Math.sin(2 * Math.PI * j / ARC_STEPS)), z || 0]);
      geom = { type: 'Polygon', coordinates: [ring] }; props.radius = g.radius;
    } else if (g.kind === 'point' || g.kind === 'text' || g.kind === 'attdef') {
      if (g.position[2]) flat = false; geom = { type: 'Point', coordinates: [...g.position] };
      if (g.kind !== 'point') props.text = g.value;
    } else if (g.kind === 'face') {
      const p = pts(g.vertices); geom = { type: 'Polygon', coordinates: [[...p, p[0]]] };
    } else if (g.kind === 'mesh') {
      const p = pts(g.vertices), t = g.triangles, polys = [];
      for (let i = 0; i < t.length; i += 3) polys.push([[p[t[i]], p[t[i + 1]], p[t[i + 2]], p[t[i]]]]);
      geom = { type: 'MultiPolygon', coordinates: polys };
    } else { skipped[f.type] = (skipped[f.type] || 0) + 1; continue; }
    out.push({ type: 'Feature', properties: props, geometry: geom });
  }
  // 2-D drawings stay 2-D
  if (flat) { const drop = c => typeof c[0] === 'number' ? c.slice(0, 2) : c.map(drop); for (const f of out) f.geometry.coordinates = drop(f.geometry.coordinates); }
  if (arcs || circles) lost.push(`${[arcs ? plural(arcs, 'arc') : '', circles ? plural(circles, 'circle') : ''].filter(Boolean).join(' and ')} written as points, ${ARC_STEPS} to a full turn (GeoJSON and WKT have no curves)`);
  if (inserts) lost.push(`${plural(inserts, 'block insert')} expanded into plain geometry`);
  if (xdata) lost.push(`XDATA on ${plural(xdata, 'entity')} not carried`);
  for (const [t, n] of Object.entries(skipped)) lost.push(`${n} ${t} ${n === 1 ? 'entity' : 'entities'} with no geometry left out`);
  for (const w of doc.warnings) lost.push(`${w.entity || 'dxf'}: ${w.reason}`);
  lost.push('colours, linetypes and handles not carried');
  return { features: out, lost, units: doc.header.insunits != null ? doc.header.units : null, layers: [...new Set(out.map(f => f.properties.layer).filter(x => x != null))] };
}

/* ── the conversion itself: text of one kind → text of another ── */
// → { out, rows, lost, trace } or { err }
function convert(from, to, text) {
  const lost = [];
  if (from === 'dxf') {
    const d = dxfFeatures(text), rows = [['features', `${d.features.length}`], ['layers', d.layers.join(', ') || 'none named'], ['units', d.units ? `${d.units}, as the file states; coordinates are written unchanged` : 'not stated in the file; coordinates are written unchanged']];
    if (!d.features.length) return { err: 'I found no geometry I can write in that DXF.' };
    const out = to === 'wkt' ? d.features.map(f => toWkt(f.geometry)).join('\n') + '\n' : JSON.stringify({ type: 'FeatureCollection', features: d.features }, null, 1);
    if (to === 'wkt') lost.push('layers and text have no place in WKT; one geometry per line, in the drawing\'s order');
    return { out, rows, lost: [...d.lost, ...lost], trace: [`dxf.read → ${d.features.length} features on ${plural(d.layers.length, 'layer')}`, `→ ${to}`] };
  }
  if (from === 'yaml') {
    let ast; try { ast = parseYaml(text); } catch (e) { return { err: `That is not YAML I read: ${e.message.replace(/^\[rule [^\]]+\] /, '')}. I read the strict subset of @gcu/yaml, in which every string is quoted; that is on purpose, so "no" stays a string and nothing is guessed.` }; }
    const tags = { tags: 0 }, v = yamlValue(ast, tags);
    if (tags.tags) lost.push(`${plural(tags.tags, 'tag')} (like !secret) have no place in JSON and were dropped`);
    lost.push('comments do not carry over');
    return { out: JSON.stringify(v, null, 1), rows: [['shape', shapeOf(v)]], lost, trace: ['yaml.parse → tree', 'tree → JSON'] };
  }
  if (from === 'wkt') {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean), geoms = [];
    for (const [i, l] of lines.entries()) { try { geoms.push(parseWkt(l)); } catch (e) { return { err: `Line ${i + 1} is not WKT I read: ${e.message.replace(/^WKT: /, '')}.` }; } }
    const srids = [...new Set(geoms.map(g => g.srid).filter(x => x != null))];
    if (srids.length) lost.push(`SRID ${srids.join(', ')} has no place in GeoJSON, which assumes WGS 84 longitude and latitude; the coordinates are written unchanged`);
    const strip = g => { const { srid, ...r } = g; return r; };
    const v = geoms.length === 1 ? strip(geoms[0]) : { type: 'FeatureCollection', features: geoms.map(g => ({ type: 'Feature', properties: {}, geometry: strip(g) })) };
    return { out: JSON.stringify(v, null, 1), rows: [['geometries', geoms.map(g => g.type).join(', ')]], lost, trace: [`wkt.parse → ${plural(geoms.length, 'geometry')}`, 'GeoJSON'] };
  }
  // JSON or GeoJSON in
  let v; try { v = JSON.parse(text); } catch (e) { return { err: `That is not JSON: ${e.message}.` }; }
  if (to === 'yaml') return { out: emit(yamlNode(v)), rows: [['shape', shapeOf(v)]], lost: ['the YAML is in the strict subset: every string quoted, two-space indents'], trace: ['JSON.parse', 'yaml.emit'] };
  const geoms = v && v.type === 'FeatureCollection' ? (v.features || []).map(f => f.geometry).filter(Boolean) : v && v.type === 'Feature' ? [v.geometry].filter(Boolean) : v && v.type ? [v] : [];
  if (!geoms.length) return { err: 'That JSON is not GeoJSON: I need a geometry, a Feature or a FeatureCollection.' };
  let out; try { out = geoms.map(g => toWkt(g)).join('\n') + '\n'; } catch (e) { return { err: `That geometry cannot be written as WKT: ${e.message}.` }; }
  if (v.type !== 'Feature' && v.type !== 'FeatureCollection') { /* a bare geometry carries nothing else */ } else lost.push('properties have no place in WKT; one geometry per line');
  return { out, rows: [['geometries', geoms.map(g => g.type).join(', ')]], lost, trace: [`GeoJSON → ${plural(geoms.length, 'geometry')}`, 'wkt.stringify'] };
}
const shapeOf = v => Array.isArray(v) ? `a list of ${v.length}` : v && typeof v === 'object' ? `a map of ${plural(Object.keys(v).length, 'key')}` : `a single ${v === null ? 'null' : typeof v}`;

// the card for a conversion; `read` is the reading line, `name` the file name to save under
function card(read, from, to, text, base, py) {
  const r = convert(from, to, text);
  if (r.err) return { read, body: [{ t: 'note', kind: 'err', text: r.err }], trace: [`${from} → ${to}: refused`] };
  const lines = r.out.split('\n'), preview = lines.slice(0, 14).join('\n') + (lines.length > 14 ? '\n…' : ''), name = `${base}.${EXT[to]}`;
  return {
    read, value: r.out, copy: r.out, file: { name, mime: MIME[to], text: r.out },
    body: [{ t: 'pre', text: preview }, { t: 'kv', rows: [...r.rows, ['size', `${plural(lines.length - (r.out.endsWith('\n') ? 1 : 0), 'line')}, ${fmt(new TextEncoder().encode(r.out).length / 1024, 3)} kB`]] }, ...(r.lost.length ? [{ t: 'note', text: r.lost.join('. ') + '.' }] : []), { t: 'actions', items: [{ act: 'copy', label: 'Copy' }, { act: 'save', label: `Save ${name}` }] }, { t: 'src', text: from === 'dxf' ? 'read by @gcu/dxf' : from === 'yaml' || to === 'yaml' ? '@gcu/yaml, the strict subset' : '@gcu/wkt' }],
    trace: r.trace, py
  };
}
const PY = (from, to) => from === 'yaml' ? 'json.dumps(yaml.safe_load(text), indent=1)' : to === 'yaml' ? 'yaml.safe_dump(json.loads(text))' : from === 'wkt' ? 'shapely.geometry.mapping(shapely.wkt.loads(text))' : from === 'dxf' ? 'ezdxf.readfile(path)  # then entity by entity to GeoJSON' : 'shapely.geometry.shape(json.loads(text)).wkt';

/* ── pasted text ────────────────────────────────────────────── */
const KIND = { json: 'json', yaml: 'yaml', yml: 'yaml', wkt: 'wkt', geojson: 'geojson' };
const sniff = body => /^\s*[[{]/.test(body) ? (/"type"\s*:\s*"(Feature|FeatureCollection|Point|LineString|Polygon|Multi\w+|GeometryCollection)"/.test(body) ? 'geojson' : 'json') : /^\s*(?:SRID=\d+;\s*)?(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\b/i.test(body) ? 'wkt' : 'yaml';
tool({
  name: 'convertText',
  skill: { group: 'Compute', title: 'YAML, JSON, WKT and GeoJSON', on: '@gcu/yaml · wkt · dxf', about: 'JSON to YAML and back (the strict YAML subset, where every string is quoted), WKT to GeoJSON and back, and DXF drawings to GeoJSON or WKT from your files. What does not carry over is said.', examples: ['json to yaml: {"hole": "DH-12", "depth": 240.5}', 'wkt to geojson: POINT (30 10)', 'convert to wkt: {"type": "LineString", "coordinates": [[0, 0], [10, 5]]}'] },
  amend: [{ arg: 'to', match: /^(?:as |to |in )?(json|yaml|wkt|geojson)(?: instead)?$/ }],
  topic: a => [`${LABEL[a.from]} to ${LABEL[a.to]}`, 1],
  run: a => {
    const short = a.text.length > 40 ? a.text.slice(0, 37).replace(/\s+/g, ' ') + '…' : a.text.replace(/\s+/g, ' ');
    const targets = TARGETS[a.from] || [];
    const read = [{ v: LABEL[a.from] }, 'to', { v: LABEL[a.to] || a.to, key: 'to', alts: targets, cur: a.to }, { v: short }];
    if (!targets.includes(a.to)) return { read, body: [{ t: 'note', kind: 'err', text: `${LABEL[a.from]} does not become ${LABEL[a.to] || a.to} here. It can become ${targets.map(t => LABEL[t]).join(' or ')}.` }], trace: [`${a.from} → ${a.to}: no such pair`] };
    return card(read, a.from, a.to, a.text, 'converted', PY(a.from, a.to));
  }
});

/* ── a file the device keeps ────────────────────────────────── */
const fileNamed = name => Object.values(S.files).find(f => f.name.toLowerCase() === name.toLowerCase());
tool({
  name: 'convertFile',
  amend: [{ arg: 'to', match: /^(?:as |to |in )?(json|yaml|wkt|geojson)(?: instead)?$/ }],
  topic: a => [a.file.name, 2],
  run: a => {
    const from = kindOfName(a.file.name), targets = TARGETS[from] || [], to = a.to || targets[0], f = S.files[a.file.hash];
    const read = ['convert', { v: a.file.name }, 'to', { v: LABEL[to] || to, key: 'to', alts: targets, cur: to }];
    if (!f) return { read, body: [{ t: 'note', kind: 'err', text: `${a.file.name} is not kept on this device. Open it again from your files.` }], trace: ['file: not in the device store'] };
    if (!targets.includes(to)) return { read, body: [{ t: 'note', kind: 'err', text: `${LABEL[from] || from} does not become ${LABEL[to] || to} here. It can become ${targets.map(t => LABEL[t]).join(' or ')}.` }], trace: [`${from} → ${to}: no such pair`] };
    return card(read, from, to, f.text, a.file.name.replace(/\.\w+$/, ''), PY(from, to).replace('text', `open("${a.file.name}").read()`));
  }
});
/* ── what reads them: "json to yaml: …", "convert to wkt: …", "pit.dxf to wkt" ── */
const payload = c => { const t = c.roles.text && c.roles.text[0]; return t && t.type === 'text' ? t.value.replace(/\r\n/g, '\n') : null; };
frame({
  name: 'reformat', label: 'Convert', words: ['convert', 'turn', 'change'], elidable: true,
  theme: ['format', 'file'], required: [], roles: { to: { preps: ['to', 'as', 'into', 'in'], types: ['format'] }, text: { preps: [':'], types: ['text'] } },
  words_pt: ['converte', 'converta', 'converter', 'transforma', 'transforme'], label_pt: 'Converter',
  bind: c => {
    const th = c.theme[0], to = c.roles.to && KIND[c.roles.to[0].value], body = payload(c);
    if (body) { const from = th && th.type === 'format' ? KIND[th.value] : sniff(body); return from && to ? { tool: 'convertText', args: { from, to, text: body } } : null; }
    const f = th && th.type === 'file' && th.value && fileNamed(th.value); if (!f || !DOCUMENT.test(f.name)) return null;
    return { tool: 'convertFile', args: { file: { name: f.name, hash: f.hash }, ...(to ? { to } : {}) } };
  }
});

// Structural geometry over @gcu/bearing (vendored): apparent dip, the three-point problem, the line of
// intersection of two planes, rake, oriented core, and the Fisher mean of a set. Every answer draws the
// net. Planes are read as dip direction/dip with the usual strike/dip slot; lines as trend/plunge.
import { frame, noun, postmod, qmod, tool, fmt, rad, deg, p3, p2 } from './core.js';
import { conversions, vec3, statistics } from '../vendor/bearing.js';
import { oriOf } from './orientation.js';

const ORI = '(\\d{1,3})\\s*/\\s*(\\d{1,2})';
const ddOf = (a1, conv) => conv === 'sd' ? (a1 + 90) % 360 : a1;
const planeSlot = (a1, a2, conv, key = 'conv') => ({ v: `${p3(a1)}/${p2(a2)} as ${conv === 'sd' ? 'strike/dip (right-hand)' : 'dip direction/dip'}`, key, alts: ['dd', 'sd'], cur: conv || 'dd' });
const down = v => v[2] > 0 ? vec3.negate(v) : v;   // the lower-hemisphere twin of a vector
const plane = v => conversions.dcosToPlane(down(vec3.normalize(v)));   // a pole → [dd, dip]
const line = v => conversions.dcosToLine(down(vec3.normalize(v)));     // → [trend, plunge]
const ori = (a, b) => `${p3(a)}/${p2(b)}`;
const SRC = { t: 'src', text: '@gcu/bearing · vendored · lower hemisphere, equal area' };

tool({
  name: 'apparent',
  skill: { group: 'Field', title: 'Structural geometry', on: '@gcu/bearing', about: 'Apparent dip, three-point plane, intersection of planes, rake, oriented core, Fisher mean. Planes as dip direction/dip, flip the slot for strike/dip.', examples: ['apparent dip of 000/30 on a section at 045', 'intersection of 090/45 and 270/45', 'plane through 0,0,100 and 100,0,100 and 0,100,0', 'mean of 120/35, 130/40 and 125/38', 'core alpha 40 beta 230 in hole 270/60'] },
  topic: () => ['Apparent dip', 2],
  run: a => {
    const dd = ddOf(a.a1, a.conv), delta = a.az - dd, c = Math.cos(rad(delta)), app = deg(Math.atan(Math.tan(rad(a.a2)) * Math.abs(c)));
    const tr = (c >= 0 ? a.az : a.az + 180) % 360;
    return {
      read: ['apparent dip of', planeSlot(a.a1, a.a2, a.conv), 'on a section at', { v: p3(a.az) }], value: app,
      body: [{ t: 'big', v: fmt(app, 3), unit: '° apparent dip' }, { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [{ tr, pl: app, label: 'apparent' }] }, { t: 'kv', rows: [['plunges toward', p3(tr)], ['section to dip direction', `${fmt(Math.abs(((delta + 180) % 360 + 360) % 360 - 180), 3)}°`], ['true dip', `${p2(a.a2)}° toward ${p3(dd)}`]] }, SRC],
      trace: [`plane → dip direction ${p3(dd)}, dip ${p2(a.a2)}`, `tan(apparent) = tan(${a.a2}°) × |cos(${fmt(delta)}°)| = ${fmt(Math.tan(rad(a.a2)) * Math.abs(c), 5)}`, `apparent dip = ${fmt(app, 5)}°`], py: `bearing.apparent_dip(plane=(${dd}, ${a.a2}), section=${a.az})`
    };
  }
});
tool({
  name: 'threepoint',
  topic: () => ['Three-point plane', 2],
  run: a => {
    const [p1, p2v, p3v] = a.p, v1 = vec3.sub(p2v, p1), v2 = vec3.sub(p3v, p1), n = vec3.cross(v1, v2);
    const read = ['plane through', { v: p1.join(', ') }, { v: p2v.join(', ') }, { v: p3v.join(', ') }];
    if (vec3.length(n) < 1e-9) return { read, body: [{ t: 'note', kind: 'err', text: 'The three points are on one line; no plane is defined.' }], trace: ['cross product of the two edges is zero'] };
    const ang = deg(vec3.angle(v1, v2)), [dd, dip] = plane(n);
    return {
      read, value: dip,
      body: [{ t: 'big', v: ori(dd, dip), unit: 'dip direction/dip' }, { t: 'net', planes: [{ dd, dip }], lines: [] }, { t: 'kv', rows: [['strike', p3(dd + 270)], ['dip', `${fmt(dip, 3)}° toward ${p3(dd)}`], ['triangle', `${fmt(ang, 3)}° between the edges${ang < 10 || ang > 170 ? ' (thin: the dip is poorly constrained)' : ''}`]] }, SRC],
      trace: ['east, north, up coordinates', `edges: ${v1.map(x => fmt(x)).join(', ')} and ${v2.map(x => fmt(x)).join(', ')}`, `normal = edge1 × edge2 = ${n.map(x => fmt(x, 4)).join(', ')}`, 'bearing.dcosToPlane(lower-hemisphere pole)'], py: `bearing.three_point(${JSON.stringify(a.p)})`
    };
  }
});
tool({
  name: 'intersect',
  topic: () => ['Plane intersection', 2],
  run: a => {
    const d1 = ddOf(a.a[0], a.conv), d2 = ddOf(a.b[0], a.conv), n1 = conversions.planeToDcos(d1, a.a[1]), n2 = conversions.planeToDcos(d2, a.b[1]), l = vec3.cross(n1, n2);
    const read = ['intersection of', planeSlot(a.a[0], a.a[1], a.conv), 'and', { v: ori(a.b[0], a.b[1]) }];
    if (vec3.length(l) < 1e-9) return { read, body: [{ t: 'note', kind: 'err', text: 'The planes are parallel; they do not intersect in a line.' }], trace: ['pole × pole is zero'] };
    const [tr, pl] = line(l), horizontal = Math.abs(l[2]) < 1e-9;
    return {
      read, value: pl,
      body: [{ t: 'big', v: ori(tr, pl), unit: 'trend/plunge' }, { t: 'net', planes: [{ dd: d1, dip: a.a[1] }, { dd: d2, dip: a.b[1] }], lines: [{ tr, pl, label: 'line' }] }, { t: 'kv', rows: [['trend', `${p3(tr)}${horizontal ? ` or ${p3(tr + 180)} (horizontal)` : ''}`], ['plunge', `${fmt(pl, 3)}°`]] }, SRC],
      trace: [`poles: ${ori(d1 + 180, 90 - a.a[1])} and ${ori(d2 + 180, 90 - a.b[1])}`, 'line = pole1 × pole2, lower hemisphere', 'bearing.dcosToLine'], py: `bearing.intersection((${d1}, ${a.a[1]}), (${d2}, ${a.b[1]}))`
    };
  }
});
tool({
  name: 'rake',
  topic: () => ['Rake', 1],
  run: a => {
    const dd = ddOf(a.a1, a.conv), n = conversions.planeToDcos(dd, a.a2);
    if (a.rake != null) {
      const [tr, pl] = conversions.rakeToLine(dd, a.a2, a.rake);
      return { read: ['line at rake', { v: `${a.rake}°` }, 'on', planeSlot(a.a1, a.a2, a.conv)], body: [{ t: 'big', v: ori(tr, pl), unit: 'trend/plunge' }, { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [{ tr, pl, label: 'line' }] }, { t: 'kv', rows: [['rake', `${a.rake}° from the strike ${p3(dd + 270)}`]] }, SRC], trace: [`bearing.rakeToLine(${dd}, ${a.a2}, ${a.rake})`], py: `bearing.rake_to_line((${dd}, ${a.a2}), ${a.rake})` };
    }
    const l = conversions.lineToDcos(a.tr, a.pl), off = deg(Math.asin(Math.abs(vec3.dot(n, l))));
    const read = ['rake of', { v: ori(a.tr, a.pl) }, 'on', planeSlot(a.a1, a.a2, a.conv)];
    if (off > 2) return { read, body: [{ t: 'note', kind: 'err', text: `That line is ${fmt(off, 3)}° off the plane; a rake is measured on the plane.` }], trace: [`angle between line and plane = ${fmt(off, 4)}°`] };
    const s = conversions.lineToDcos(dd - 90, 0), r = deg(Math.acos(Math.max(-1, Math.min(1, vec3.dot(s, l)))));
    return { read, value: r, body: [{ t: 'big', v: fmt(r, 3), unit: `° from the strike ${p3(dd + 270)}` }, { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [{ tr: a.tr, pl: a.pl, label: 'line' }] }, SRC], trace: [`strike direction ${p3(dd + 270)} as a unit vector`, `rake = acos(strike · line) = ${fmt(r, 4)}°`, off > 0.01 ? `the line sits ${fmt(off, 3)}° off the plane (measurement noise)` : 'the line lies on the plane'], py: `bearing.rake((${dd}, ${a.a2}), (${a.tr}, ${a.pl}))` };
  }
});
// Oriented core. Convention, stated on the card: alpha is the angle between the core axis and the plane
// (90 = perpendicular to the core); beta is measured clockwise, looking down the hole, from the
// bottom-of-hole reference line to the down-hole apex of the ellipse. Other conventions exist (SPEC-skills,
// open decision 9); the slot will carry them when a second one is wired.
tool({
  name: 'core',
  topic: () => ['Oriented core', 2],
  run: a => {
    const read = ['core', { v: `alpha ${a.alpha}` }, { v: `beta ${a.beta}` }, 'in hole', { v: ori(a.htr, a.hpl) }];
    if (a.hpl >= 89.5) return { read, body: [{ t: 'note', kind: 'err', text: 'In a vertical hole the bottom-of-hole line is undefined, so beta has no reference. Give the hole a plunge below 89.5°.' }], trace: ['bottom-of-hole line undefined'] };
    const d = conversions.lineToDcos(a.htr, a.hpl), g = [0, 0, -1];
    const b = vec3.normalize(vec3.sub(g, vec3.scale(d, vec3.dot(g, d))));   // bottom-of-hole line: down, perpendicular to the axis
    const y = vec3.cross(d, b), u = vec3.sub(vec3.scale(b, Math.cos(rad(a.beta))), vec3.scale(y, Math.sin(rad(a.beta))));   // clockwise looking down-hole
    const e = vec3.add(vec3.scale(d, Math.cos(rad(a.alpha))), vec3.scale(u, Math.sin(rad(a.alpha))));   // the ellipse long axis, down-hole end
    const s = vec3.cross(d, u), n = vec3.cross(e, s), [dd, dip] = plane(n);
    return {
      read, value: dip,
      body: [{ t: 'big', v: ori(dd, dip), unit: 'dip direction/dip' }, { t: 'net', planes: [{ dd, dip }], lines: [{ tr: a.htr, pl: a.hpl, label: 'hole' }] }, { t: 'kv', rows: [['strike', p3(dd + 270)], ['convention', 'alpha from the core axis to the plane; beta clockwise looking down-hole, from the bottom-of-hole line to the ellipse apex']] }, SRC],
      trace: [`hole axis ${ori(a.htr, a.hpl)} as a unit vector`, `bottom-of-hole line = down, projected perpendicular to the axis → ${line(b).map(x => fmt(x)).join('/')}`, `apex direction = bottom-of-hole rotated ${a.beta}° clockwise looking down-hole`, `long axis = cos(${a.alpha}°)·axis + sin(${a.alpha}°)·apex; plane = long axis and the short axis`, 'bearing.dcosToPlane(lower-hemisphere pole)'], py: `bearing.oriented_core(alpha=${a.alpha}, beta=${a.beta}, hole=(${a.htr}, ${a.hpl}))`
    };
  }
});
tool({
  name: 'fmean',
  topic: () => ['Fisher mean', 2],
  run: a => {
    const planes = a.kind === 'planes', dcos = a.items.map(([x, y]) => planes ? conversions.planeToDcos(x, y) : conversions.lineToDcos(x, y));
    const st = statistics.fisherStats(dcos), m = planes ? plane(st.mean) : line(st.mean), n = a.items.length;
    const read = ['mean of', { v: `${n} ${a.kind}`, key: 'kind', alts: ['planes', 'lines'], cur: a.kind }, { v: a.items.map(i => ori(i[0], i[1])).join(', ') }];
    const rows = [['mean', `${ori(m[0], m[1])} (${planes ? 'dip direction/dip' : 'trend/plunge'})`], ['R / n', `${fmt(st.R, 4)} / ${n}`], ['κ', n >= 3 ? fmt(st.kappa, 4) : 'needs 3 or more'], ['α95', n >= 3 ? `${fmt(st.alpha95, 3)}°` : 'needs 3 or more']];
    return {
      read, value: m[1],
      body: [{ t: 'big', v: ori(m[0], m[1]), unit: planes ? 'mean plane' : 'mean line' }, { t: 'net', planes: planes ? a.items.map(([x, y]) => ({ dd: x, dip: y })) : [], lines: planes ? [{ tr: m[0] + 180, pl: 90 - m[1], label: 'mean pole' }] : [...a.items.map(([x, y]) => ({ tr: x, pl: y, label: '' })), { tr: m[0], pl: m[1], label: 'mean' }] }, { t: 'kv', rows }, SRC],
      trace: [`${n} ${planes ? 'poles' : 'lines'} as unit vectors`, 'bearing.statistics.fisherStats → resultant, κ, α95', planes ? 'mean pole → plane' : 'mean vector → line'], py: `bearing.fisher_mean(${JSON.stringify(a.items)}, kind="${a.kind}")`
    };
  }
});
/* ── what reads them ─────────────────────────────────────────── */
const PLANE_T = ['plane', 'orientation'];
noun({ type: 'appdip', words: { apparent: ['apparent dip'] }, words_pt: { apparent: ['mergulho aparente'] } });
noun({ type: 'section', words: { section: ['section', 'cross section', 'cross-section', 'profile'] }, words_pt: { section: ['seção', 'secao', 'perfil'] } });
for (const prep of ['', 'at', 'along']) postmod({ prep, heads: ['section'], attr: 'az', quantity: true });   // "a section at 045"
noun({ type: 'intersection', words: { intersection: ['intersection', 'line of intersection', 'intersection line'] }, words_pt: { intersection: ['interseção', 'intersecao', 'linha de interseção'] } });
noun({ type: 'rake', words: { rake: ['rake', 'pitch'] }, words_pt: { rake: ['rake', 'caimento'] } });
postmod({ prep: '', heads: ['rake'], attr: 'angle', quantity: true });            // "rake 30"
postmod({ prep: 'of', heads: ['rake'], attr: 'line', mod: 'orientation' });       // "rake of 150/40"
qmod({ head: 'rake', attr: 'angle', dims: ['bare', 'angle'] });                   // "a rake of 30"
for (const k of ['alpha', 'beta']) { noun({ type: k, words: { [k]: [k] }, words_pt: { [k]: [k] } }); postmod({ prep: '', heads: [k], attr: 'angle', quantity: true }); }
noun({ type: 'fmean', words: { mean: ['fisher mean', 'mean orientation', 'mean plane', 'mean', 'average'] }, words_pt: { mean: ['média', 'media', 'média de fisher'] } });
const ori2 = n => oriOf(n);
// "apparent dip of 000/30 on a section at 045"
frame({
  name: 'apparent', label: 'Apparent dip', words: ['calculate', 'compute'], elidable: true, theme: ['appdip'], required: ['theme', 'of', 'on'],
  roles: { of: { preps: ['of', 'for'], types: PLANE_T }, on: { preps: ['on', 'along', 'in', 'for'], types: ['section'] } }, label_pt: 'Mergulho aparente',
  bind: c => { const p = c.roles.of[0], o = !p.all && ori2(p), az = c.roles.on[0].attrs && c.roles.on[0].attrs.az; return o && az ? { tool: 'apparent', args: { a1: o[0], a2: o[1], conv: 'dd', az: az.n } } : null; }
});
// "plane through 0,0,100 and 100,0,100 and 0,100,0"
frame({
  name: 'threepoint', label: 'Three-point plane', words: ['plane through', 'a plane through', 'fit a plane through', 'surface through', 'bedding through', 'contact through', 'plane from'], theme: ['point3'], required: ['theme'], roles: {},
  words_pt: ['plano por', 'plano pelos pontos'], label_pt: 'Plano por três pontos',
  bind: c => c.theme.length === 3 ? { tool: 'threepoint', args: { p: c.theme.map(t => t.value.split(',').map(Number)) } } : null
});
// "intersection of 090/45 and 270/45"
frame({
  name: 'intersect', label: 'Intersection', words: ['where do', 'find the'], elidable: true, theme: ['intersection'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'between'], types: PLANE_T } }, label_pt: 'Interseção',
  bind: c => { const [a, b] = c.roles.of.map(ori2); return c.roles.of.length === 2 && a && b ? { tool: 'intersect', args: { a, b, conv: 'dd' } } : null; }
});
// "line at rake 90 on 150/40", "rake 30 on 120/50", "rake of 150/40 on 150/40"
frame({
  name: 'rake', label: 'Rake', words: ['line at', 'line with', 'the line at', 'line at a'], elidable: true, theme: ['rake'], required: ['theme', 'on'], roles: { on: { preps: ['on', 'in', 'within'], types: PLANE_T } }, label_pt: 'Rake',
  bind: c => { const r = c.theme[0].attrs || {}, o = ori2(c.roles.on[0]); if (!o) return null;
    if (r.angle) return { tool: 'rake', args: { rake: r.angle.n, a1: o[0], a2: o[1], conv: 'dd' } };
    const l = r.line && oriOf({ type: 'orientation', value: r.line }); return l ? { tool: 'rake', args: { tr: l[0], pl: l[1], a1: o[0], a2: o[1], conv: 'dd' } } : null; }
});
// "core alpha 40 beta 230 in hole 270/60"
frame({
  name: 'core', label: 'Oriented core', words: ['core', 'oriented core'], theme: ['alpha'], required: ['theme', 'beta', 'in'],
  roles: { beta: { preps: [''], types: ['beta'] }, in: { preps: ['in', 'for', 'from'], types: ['hole'] } }, words_pt: ['testemunho', 'testemunho orientado'], label_pt: 'Testemunho orientado',
  bind: c => { const a = c.theme[0].attrs.angle, b = c.roles.beta[0].attrs.angle, h = oriOf(c.roles.in[0]); return a && b && h ? { tool: 'core', args: { alpha: a.n, beta: b.n, htr: h[0], hpl: h[1] } } : null; }
});
// "mean of 120/35, 130/40 and 125/38", "fisher mean of …"
frame({
  name: 'fmean', label: 'Fisher mean', words: ['calculate', 'compute'], elidable: true, theme: ['fmean'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'for'], types: PLANE_T } }, label_pt: 'Média de Fisher',
  bind: c => { const items = c.roles.of.map(ori2); return items.length >= 2 && items.every(Boolean) ? { tool: 'fmean', args: { items, kind: 'planes' } } : null; }
});

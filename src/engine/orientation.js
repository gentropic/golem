// Orientation: true thickness from an intercept, and planes on a stereonet. @gcu/bearing (vendored) does the
// vectors; the shell draws the `net` block (lower hemisphere, equal area) from the planes and lines it carries.
import { tool, frame, noun, shape, postmod, qmod, fmt, deg, p3, p2, azi } from './core.js';
import { parseUnit } from './units.js';
import { conversions, vec3 } from '../vendor/bearing.js';
const planeDD = a => a.conv === 'sd' ? (a.a1 + 90) % 360 : a.a1;
const convSlot = a => ({ v: `${p3(a.a1)}/${p2(a.a2)} as ${a.conv === 'sd' ? 'strike/dip (right-hand)' : 'dip direction/dip'}`, key: 'conv', alts: ['dd', 'sd'], cur: a.conv || 'dd' });

tool({
  name: 'thickness',
  skill: { group: 'Field', title: 'True thickness', on: '@gcu/bearing', about: 'Intercept length, hole orientation and plane give thickness and a stereonet.', examples: ['true thickness of a 14 m intercept, hole 270/60, bedding 045/30'] },
  topic: () => ['True thickness', 3],
  run: a => {
    const dd = planeDD(a), h = conversions.lineToDcos(a.htr, a.hpl), n = conversions.planeToDcos(dd, a.a2);
    const c = Math.abs(vec3.dot(h, n)), tt = a.len * c, ang = deg(Math.acos(Math.min(1, c)));
    return {
      read: ['true thickness of', { v: fmt(a.len) + ' m' }, 'in hole', { v: `${p3(a.htr)}/${p2(a.hpl)} trend/plunge` }, 'through', convSlot(a)],
      value: tt,
      body: [
        a.units === 'imperial' ? { t: 'big', v: fmt(tt / 0.3048, 4), unit: 'ft true thickness' } : { t: 'big', v: fmt(tt, 4), unit: 'm true thickness' },
        { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [{ tr: a.htr, pl: a.hpl, label: 'hole' }] },
        { t: 'kv', rows: [['hole to pole', `${fmt(ang, 3)}°`], ['hole to plane', `${fmt(90 - ang, 3)}°`], ['factor', `${fmt(c, 4)} of downhole length`], ...(a.units === 'imperial' ? [['in metres', `${fmt(tt, 4)} m`]] : [])] },
        { t: 'src', text: '@gcu/bearing · vendored · lower hemisphere, equal area' }
      ],
      trace: [`bearing.planeToDcos(${p3(dd)}, ${p2(a.a2)}) → pole ${p3(dd + 180)}/${p2(90 - a.a2)}`, `bearing.lineToDcos(${p3(a.htr)}, ${p2(a.hpl)}) → hole axis`, `|hole · pole| = ${fmt(c, 5)}`, `${fmt(a.len)} m × ${fmt(c, 5)} = ${fmt(tt, 5)} m`],
      py: `bearing.true_thickness(${a.len}, hole=(${a.htr}, ${a.hpl}), plane=(${dd}, ${a.a2}))`
    };
  }
});
tool({
  name: 'plane',
  skill: { group: 'Field', title: 'Stereonet', on: '@gcu/bearing', about: 'Planes and poles, equal area, lower hemisphere.', examples: ['plot plane 120/55'] },
  topic: a => ['Stereonet ' + p3(a.a1) + '/' + p2(a.a2), 2],
  run: a => {
    const dd = planeDD(a);
    return {
      read: ['plot plane', convSlot(a)],
      body: [
        { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [] },
        { t: 'kv', rows: [['strike', azi(dd + 270)], ['dip', `${p2(a.a2)}° toward ${azi(dd)}`], ['pole', `${p3(dd + 180)}/${p2(90 - a.a2)}`]] },
        { t: 'src', text: '@gcu/bearing · vendored' }
      ],
      trace: ['plane → great circle and pole', 'equal-area projection, lower hemisphere'], py: `stereonet.plane(${dd}, ${a.a2})`
    };
  }
});
/* ── the words of structure, shared with structure.js and apply.js ─────────────── */
shape({ type: 'orientation', re: String.raw`\d{1,3}\s*/\s*\d{1,2}` });                                   // 045/30, 270 / 60
shape({ type: 'point3', re: String.raw`-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?` });   // 0,0,100
noun({ type: 'hole', words: { hole: ['hole', 'drill hole', 'drillhole', 'borehole'] }, words_pt: { hole: ['furo', 'furo de sonda'] } });
noun({ type: 'plane', words: { bedding: ['bedding', 'bed', 'beds'], vein: ['vein'], foliation: ['foliation'], contact: ['contact'], fault: ['fault'], plane: ['plane'], surface: ['surface'], joint: ['joint'], cleavage: ['cleavage'], shear: ['shear zone', 'shear'] },
  generic: ['plane', 'planes', 'measurement', 'measurements', 'reading', 'readings', 'structures'],
  words_pt: { bedding: ['acamamento', 'estratificação'], vein: ['veio'], foliation: ['foliação', 'foliacao'], contact: ['contato'], fault: ['falha'], plane: ['plano'], joint: ['junta', 'fratura'] }, generic_pt: ['planos', 'medidas'] });
noun({ type: 'intercept', words: {}, generic: ['intercept', 'intercepts', 'interval', 'intervals', 'row', 'rows', 'sample', 'samples', 'core length', 'downhole length', 'drilled length'],
  generic_pt: ['intervalo', 'intervalos', 'intercepto', 'linha', 'linhas', 'amostra', 'amostras'] });
noun({ type: 'thickness', words: { true: ['true thickness', 'true width'] }, words_pt: { true: ['espessura verdadeira', 'espessura real'] } });
for (const head of ['hole', 'plane']) for (const prep of ['', 'at']) postmod({ prep, heads: [head], attr: 'ori', mod: 'orientation' });   // "hole 270/60", "bedding at 045/30", "a 000/30 plane"
qmod({ head: 'intercept', attr: 'length', dims: ['length'] });                                                   // "a 14 m intercept"
export const oriOf = n => { const v = n && (n.type === 'orientation' ? n.value : n.attrs && n.attrs.ori); const m = v && /^(\d{1,3})\s*\/\s*(\d{1,2})$/.exec(String(v)); return m ? [+m[1], +m[2]] : null; };
const metres = q => { if (!q) return null; if (!q.unit) return q.n; const u = parseUnit(q.unit); return u && u.dim === 'L' ? q.n * u.f : null; };
// "true thickness of a 14 m intercept, hole 270/60, bedding 045/30"; "… in hole 270/60 through bedding 045/30"
frame({
  name: 'thickness', label: 'True thickness', words: ['calculate', 'compute', 'work out', 'find', 'get'], elidable: true, theme: ['thickness'], required: ['theme'],
  // the hole and the plane may come with no preposition at all: "true thickness of 46 ft intercept hole 270/60 bedding 045/30"
  roles: { of: { preps: ['of', 'for'], types: ['intercept', 'hole', 'plane', 'quantity:length'] }, in: { preps: ['in', 'down', 'along', 'from', 'with', ''], types: ['hole', 'holeid'] }, through: { preps: ['through', 'across', 'against', 'with', ''], types: ['plane'] },
    where: { preps: ['where'], types: ['cond'] } },
  words_pt: ['calcula', 'calcule'], label_pt: 'Espessura verdadeira',
  bind: c => {
    const all = Object.values(c.roles).flat(), it = all.find(n => n.type === 'intercept'), q = all.find(n => n.type === 'quantity'), h = all.find(n => n.type === 'hole'), p = all.find(n => n.type === 'plane');
    if (it && it.all) {   // every intercept: the tool over each row of the open table, the hole and plane given or from columns
      const id = all.find(n => n.type === 'holeid'), ho = oriOf(h), po = oriOf(p), consts = { ...(ho ? { hole: { az: ho[0], dip: ho[1] } } : {}), ...(po ? { plane: { dd: po[0], dip: po[1] } } : {}) };
      const constText = [h && ho && `hole ${h.attrs.ori}`, p && po && `${p.value} ${p.attrs.ori}`].filter(Boolean).join(', ');
      return { tool: 'apply', args: { skill: 'thickness', ...(id ? { hole: id.value } : {}), ...(c.roles.where ? { where: c.roles.where[0].cond } : {}), ...(constText ? { consts, constText } : {}) } };
    }
    const len = metres(it ? it.attrs.length : q), ho = oriOf(h), po = oriOf(p);
    return len != null && ho && po ? { tool: 'thickness', args: { len, htr: ho[0], hpl: ho[1], a1: po[0], a2: po[1], conv: 'dd' } } : null;
  }
});
// "plot plane 120/55", "stereonet 045/30", "show bedding 045/30"
frame({
  name: 'stereonet', label: 'Stereonet', words: ['plot', 'stereonet', 'stereonet of', 'show', 'draw', 'plot plane'], elidable: true, theme: ['plane', 'orientation'], required: ['theme'], roles: {},
  words_pt: ['estereograma', 'plota', 'mostra'], label_pt: 'Estereograma',
  bind: c => { const o = c.theme.length === 1 && oriOf(c.theme[0]); return o ? { tool: 'plane', args: { a1: o[0], a2: o[1], conv: 'dd' } } : null; }
});

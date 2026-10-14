// Core and sample arithmetic: sample mass from core size, sieve sizes, specific gravity by Archimedes,
// recovery and RQD. The DCDMA core table and the sieve table come from @gcu/units (vendored); the
// arithmetic is golem's own and shown step by step.
import { tool, frame, noun, compound, qmod, postmod, unit, fmt } from './core.js';
import { parseUnit } from './units.js';
import { core, sieve } from '../vendor/units.js';

const SRC = { t: 'src', text: '@gcu/units · vendored · DCDMA core sizes and the sieve table' };
const CODES = '(aq|bq|nq|nq2|nq3|hq|hq3|pq|pq3)';
const NUM = '(\\d+(?:\\.\\d+)?)';

tool({
  name: 'coremass',
  skill: { group: 'Field', title: 'Core and sample arithmetic', on: '@gcu/units', about: 'Sample mass from core size, length, split and density; sieve mesh to microns; specific gravity from mass in air and water; recovery and RQD from piece lengths.', examples: ['mass of 1 m of nq core at 2.7', '200 mesh in microns', 'sg from 120.5 g in air and 75.2 g in water', 'rqd of 12, 8, 25, 4, 31 and 9 cm in a 100 cm run'] },
  topic: () => ['Sample mass', 1],
  run: a => {
    const d = core.diameter(a.code), read = ['mass of', { v: `${fmt(a.length)} m` }, 'of', { v: `${a.split} ${a.code}`, key: 'split', alts: ['whole', 'half', 'quarter'], cur: a.split }, 'core'];
    if (a.density == null) return { read, body: [{ t: 'note', kind: 'err', text: `At what density? Say "at 2.7" (g/cm³). ${a.code} core is ${d.mm} mm across; the density is yours to give.` }, SRC], trace: ['density missing'] };
    const div = a.split === 'half' ? 2 : a.split === 'quarter' ? 4 : 1, vol = Math.PI / 4 * d.cm * d.cm * 100 * a.length / div, g = vol * a.density;
    read.push('at', { v: `${fmt(a.density)} g/cm³` });
    return {
      read, value: g / 1000,
      body: [{ t: 'big', v: fmt(g / 1000, 4), unit: 'kg' }, { t: 'kv', rows: [['core', `${a.code}: ${d.mm} mm diameter (DCDMA)`], ['volume', `${fmt(vol, 5)} cm³ for ${fmt(a.length)} m, ${a.split}`], ['density', `${fmt(a.density)} g/cm³, as given`]] }, SRC],
      trace: [`units.core.diameter("${a.code}") → ${d.cm} cm`, `π/4 × ${d.cm}² × 100 × ${a.length}${div > 1 ? ' ÷ ' + div : ''} = ${fmt(vol, 6)} cm³`, `× ${a.density} g/cm³ = ${fmt(g, 6)} g`], py: `units.core.sampleMass({ code: "${a.code}", length_m: ${a.length}, density_gcm3: ${a.density}, split: "${a.split}" })`
    };
  }
});
tool({
  name: 'sieve',
  topic: () => ['Sieve', 1],
  run: a => {
    if (a.mesh != null) {
      let um; try { um = sieve.toMicrons(a.mesh); } catch (e) { return { read: ['sieve', { v: `${a.mesh} mesh` }], body: [{ t: 'note', kind: 'err', text: `${a.mesh} mesh is not in the sieve table. It has ${sieve.table().map(r => r.mesh).join(', ')}.` }, SRC], trace: ['not in the table'] }; }
      return { read: ['sieve', { v: `${a.mesh} mesh` }, 'in microns'], value: um, body: [{ t: 'big', v: fmt(um), unit: 'µm' }, { t: 'sub', text: `${fmt(um / 1000, 4)} mm. The table is the one @gcu/units ships; Tyler and ASTM series differ by a few microns at some sizes.` }, SRC], trace: [`units.sieve.toMicrons(${a.mesh}) → ${um}`], py: `units.sieve.toMicrons(${a.mesh})` };
    }
    const mesh = sieve.toMesh(a.um), back = sieve.toMicrons(mesh);
    return { read: ['sieve', { v: `${fmt(a.um)} µm` }, 'in mesh'], value: mesh, body: [{ t: 'big', v: String(mesh), unit: 'mesh' }, { t: 'sub', text: back === a.um ? 'An exact table size.' : `The nearest table size is ${mesh} mesh at ${back} µm.` }, SRC], trace: [`units.sieve.toMesh(${a.um}) → ${mesh}`], py: `units.sieve.toMesh(${a.um})` };
  }
});
tool({
  name: 'sg',
  topic: () => ['Specific gravity', 1],
  run: a => {
    const read = ['specific gravity from', { v: `${fmt(a.air)} g in air` }, 'and', { v: `${fmt(a.water)} g in water` }];
    if (a.water >= a.air) return { read, body: [{ t: 'note', kind: 'err', text: 'The mass in water must be less than the mass in air; the sample would float or the readings are swapped.' }], trace: ['air ≤ water'] };
    const sg = a.air / (a.air - a.water);
    return { read, value: sg, body: [{ t: 'big', v: fmt(sg, 4), unit: 'specific gravity' }, { t: 'kv', rows: [['displaced water', `${fmt(a.air - a.water)} g, taken as ${fmt(a.air - a.water)} cm³ at 1.000 g/cm³`], ['assumes', 'no trapped air, water at about 4 °C; at 20 °C the result is 0.2% high']] }], trace: [`${a.air} ÷ (${a.air} − ${a.water}) = ${fmt(sg, 6)}`], py: `${a.air} / (${a.air} - ${a.water})` };
  }
});
const RQD_CLASS = v => v < 25 ? 'very poor' : v < 50 ? 'poor' : v < 75 ? 'fair' : v < 90 ? 'good' : 'excellent';
tool({
  name: 'rqd',
  topic: () => ['RQD', 1],
  run: a => {
    const total = a.pieces.reduce((s, p) => s + p, 0), sound = a.pieces.filter(p => p >= 10), rqd = sound.reduce((s, p) => s + p, 0) / a.run * 100, rec = total / a.run * 100;
    const read = ['RQD of', { v: `${a.pieces.length} pieces` }, 'in a', { v: `${fmt(a.run)} cm run` }];
    if (total > a.run + 1e-9) return { read, body: [{ t: 'note', kind: 'err', text: `The pieces add to ${fmt(total)} cm, more than the ${fmt(a.run)} cm run.` }], trace: ['pieces exceed the run'] };
    return {
      read, value: rqd,
      body: [{ t: 'big', v: fmt(rqd, 3), unit: `% RQD, ${RQD_CLASS(rqd)}` }, { t: 'kv', rows: [['recovery', `${fmt(rec, 3)}% (${fmt(total)} of ${fmt(a.run)} cm)`], ['pieces of 10 cm or more', `${sound.length} of ${a.pieces.length}: ${sound.join(', ')} cm`], ['class', `${RQD_CLASS(rqd)} (Deere, 1964)`]] }],
      trace: [`recovery = ${fmt(total)} ÷ ${fmt(a.run)} = ${fmt(rec, 4)}%`, `RQD = Σ pieces ≥ 10 cm ÷ run = ${sound.reduce((s, p) => s + p, 0)} ÷ ${fmt(a.run)} = ${fmt(rqd, 4)}%`], py: `rqd(${JSON.stringify(a.pieces)}, run_cm=${a.run})`
    };
  }
});
/* ── what reads them ─────────────────────────────────────────── */
// "mass of 1 m of nq core at 2.7", "mass of 1 m of half hq core at 2.7"
noun({ type: 'corecode', words: Object.fromEntries(['aq', 'bq', 'nq', 'nq2', 'nq3', 'hq', 'hq3', 'pq', 'pq3'].map(k => [k.toUpperCase(), [k]])), generic: ['core', 'drill core'], generic_pt: ['testemunho'] });
noun({ type: 'split', words: { whole: ['whole'], half: ['half', 'half-core'], quarter: ['quarter', 'quarter-core'] }, words_pt: { whole: ['inteiro'], half: ['meio'], quarter: ['quarto'] } });
compound({ mod: 'split', heads: ['corecode'], attr: 'split' });
noun({ type: 'coremass', words: { mass: ['mass', 'sample mass', 'core mass', 'weight of core', 'core weight'] }, words_pt: { mass: ['massa', 'massa da amostra'] } });
const toM = q => { if (!q.unit) return q.n; if (q.unit === 'µm') return q.n * 1e-6; const u = parseUnit(q.unit); return u && u.dim === 'L' ? q.n * u.f : null; };
unit({ unit: 'µm', dim: 'length', words: ['µm', 'um', 'micron', 'microns', 'micrometre', 'micrometres', 'micrometer', 'micrometers'] });   // the sieve's unit; @gcu/units has no micron
postmod({ prep: '', heads: ['sgword'], attr: 'value', quantity: true });   // "sg 2.9"
qmod({ head: 'sgword', attr: 'value', dims: ['bare', 'density'] });          // "a density of 2.7"
// "half nq, 1.5 m, sg 2.9": the same question as a list
frame({
  name: 'coremass2', label: 'Sample mass', words: [], elidable: true, theme: ['corecode', 'quantity:length', 'sgword'], required: ['theme'], roles: {}, label_pt: 'Massa da amostra',
  bind: c => { const cc = c.theme.find(n => n.type === 'corecode'), len = c.theme.find(n => n.type === 'quantity'), sg = c.theme.find(n => n.type === 'sgword');
    return cc && cc.value && len && c.theme.length <= 3 ? { tool: 'coremass', args: { length: toM(len), split: (cc.attrs && cc.attrs.split) || 'whole', code: cc.value, density: sg && sg.attrs.value ? sg.attrs.value.n : null } } : null; }
});
frame({
  name: 'coremass', label: 'Sample mass', words: ['calculate', 'compute'], elidable: true, theme: ['coremass'], required: ['theme', 'of'],
  roles: { of: { preps: ['of', 'for'], types: ['quantity:length', 'corecode'] }, at: { preps: ['at', 'with'], types: ['quantity:density', 'quantity:bare', 'sgword'] } }, label_pt: 'Massa da amostra',
  bind: c => {
    const len = c.roles.of.find(n => n.type === 'quantity'), cc = c.roles.of.find(n => n.type === 'corecode'), d = c.roles.at && c.roles.at[0];
    if (!len || !cc || !cc.value) return null;
    const density = !d ? null : d.type === 'quantity' ? d.n : d.attrs && d.attrs.value ? d.attrs.value.n : null; if (d && density == null) return null;
    return { tool: 'coremass', args: { length: toM(len), split: (cc.attrs && cc.attrs.split) || 'whole', code: cc.value, density } };
  }
});
// "what does 1 m of nq core weigh at a density of 2.7", "how much does 2 m of half hq weigh at 2.8"
frame({
  name: 'coreweigh', label: 'Sample mass', words: ['weigh', 'weighs'], theme: ['quantity:length', 'corecode'], required: ['theme'],
  roles: { of: { preps: ['of'], types: ['corecode', 'quantity:length'] }, at: { preps: ['at', 'with'], types: ['quantity:density', 'quantity:bare', 'sgword'] } }, words_pt: ['pesa'], label_pt: 'Massa da amostra',
  bind: c => {
    const all = [...c.theme, ...(c.roles.of || [])], len = all.find(n => n.type === 'quantity'), cc = all.find(n => n.type === 'corecode'), d = c.roles.at && c.roles.at[0];
    if (!len || !cc || !cc.value || all.length !== 2) return null;
    const density = !d ? null : d.type === 'quantity' ? d.n : d.attrs && d.attrs.value ? d.attrs.value.n : null; if (d && density == null) return null;
    return { tool: 'coremass', args: { length: toM(len), split: (cc.attrs && cc.attrs.split) || 'whole', code: cc.value, density } };
  }
});
// "200 mesh in microns", "75 µm in mesh"
unit({ unit: 'mesh', dim: 'mesh', words: ['mesh'] });
noun({ type: 'meshword', words: { mesh: ['mesh'] } });
frame({
  name: 'sieve', label: 'Sieve', words: ['convert'], elidable: true, theme: ['quantity:mesh', 'quantity:length'], required: ['theme', 'to'],
  roles: { to: { preps: ['in', 'to', 'as', 'into'], types: ['unit', 'meshword'] } }, label_pt: 'Peneira',
  bind: c => { const q = c.theme[0], to = c.roles.to[0];
    if (q.unit === 'mesh' && to.type === 'unit' && (to.dim === 'length' || to.unit === 'µm')) return { tool: 'sieve', args: { mesh: q.n } };
    if (q.unit && q.unit !== 'mesh' && (to.type === 'meshword' || to.unit === 'mesh')) { const m = toM(q); return m != null ? { tool: 'sieve', args: { um: Math.round(m * 1e6 * 1000) / 1000 } } : null; }
    return null; }
});
// "sg from 120.5 g in air and 75.2 g in water": a mass in air and a mass in water are units of their own
unit({ unit: 'g in air', dim: 'mass in air', words: ['g in air', 'grams in air', 'gram in air'] });
unit({ unit: 'g in water', dim: 'mass in water', words: ['g in water', 'grams in water', 'gram in water'] });
noun({ type: 'sgword', words: { sg: ['sg', 'specific gravity', 'density', 'relative density'] }, words_pt: { sg: ['densidade', 'peso específico'] } });
frame({
  name: 'sg', label: 'Specific gravity', words: ['calculate', 'compute'], elidable: true, theme: ['sgword'], required: ['theme', 'from'],
  roles: { from: { preps: ['from', 'of', 'with', 'for'], types: ['quantity:mass in air', 'quantity:mass in water'] } }, label_pt: 'Densidade',
  bind: c => { const air = c.roles.from.find(q => q.dim === 'mass in air'), water = c.roles.from.find(q => q.dim === 'mass in water'); return air && water ? { tool: 'sg', args: { air: air.n, water: water.n } } : null; }
});
// "rqd of 12, 8, 25, 4, 31 and 9 cm in a 100 cm run"
noun({ type: 'rqdword', words: { rqd: ['rqd', 'recovery', 'rqd and recovery', 'recovery and rqd'] }, words_pt: { rqd: ['rqd', 'recuperação'] } });
noun({ type: 'corerun', words: {}, generic: ['run', 'core run', 'drill run'], generic_pt: ['manobra'] });
qmod({ head: 'corerun', attr: 'length', dims: ['length'] });
const toCm = (q, unitOf) => { const u = q.unit || unitOf; if (!u) return null; const p = parseUnit(u); return p && p.dim === 'L' ? q.n * p.f * 100 : null; };
frame({
  name: 'rqd', label: 'RQD', words: ['calculate', 'compute'], elidable: true, theme: ['rqdword'], required: ['theme', 'of', 'in'],
  roles: { of: { preps: ['of', 'for', 'from'], types: ['quantity:length', 'coords', 'point3'] }, in: { preps: ['in', 'over', 'for'], types: ['corerun'] } }, label_pt: 'RQD',
  bind: c => {
    const qs = c.roles.of.flatMap(n => n.type === 'quantity' ? [n] : String(n.value).split(',').map(x => ({ type: 'quantity', n: +x.trim(), unit: null })));
    const unitOf = (qs.find(q => q.unit) || {}).unit, pieces = qs.map(q => toCm(q, unitOf)), run = c.roles.in[0].attrs && c.roles.in[0].attrs.length;
    return pieces.length && pieces.every(p => p != null) && run ? { tool: 'rqd', args: { pieces, run: toCm(run) } } : null;
  }
});

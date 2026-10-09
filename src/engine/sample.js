// Core and sample arithmetic: sample mass from core size, sieve sizes, specific gravity by Archimedes,
// recovery and RQD. The DCDMA core table and the sieve table come from @gcu/units (vendored); the
// arithmetic is golem's own and shown step by step.
import { tool, fmt } from './core.js';
import { core, sieve } from '../vendor/units.js';

const SRC = { t: 'src', text: '@gcu/units · vendored · DCDMA core sizes and the sieve table' };
const CODES = '(aq|bq|nq|nq2|nq3|hq|hq3|pq|pq3)';
const NUM = '(\\d+(?:\\.\\d+)?)';

tool({
  name: 'coremass', rank: 76,
  skill: { group: 'Field', title: 'Core and sample arithmetic', on: '@gcu/units', about: 'Sample mass from core size, length, split and density; sieve mesh to microns; specific gravity from mass in air and water; recovery and RQD from piece lengths.', examples: ['mass of 1 m of nq core at 2.7', '200 mesh in microns', 'sg from 120.5 g in air and 75.2 g in water', 'rqd of 12, 8, 25, 4, 31 and 9 cm in a 100 cm run'] },
  read: (text, q) => {
    let m = new RegExp(`^(?:sample )?mass of ${NUM} ?m of (half |quarter |whole )?${CODES}(?: core)?(?: at (?:sg |density |rho )?${NUM})?$`).exec(q);
    if (!m) m = new RegExp(`^(half |quarter |whole )?${CODES}(?: core)?,? ${NUM} ?m,? (?:at |sg |density )${NUM}$`).exec(q) && (m => [m[0], m[3], m[1], m[2], m[4]])(new RegExp(`^(half |quarter |whole )?${CODES}(?: core)?,? ${NUM} ?m,? (?:at |sg |density )${NUM}$`).exec(q));
    if (!m) return null;
    return { length: +m[1], split: (m[2] || 'whole').trim(), code: m[3].toUpperCase(), density: m[4] ? +m[4] : null };
  },
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
  name: 'sieve', rank: 77,
  read: (text, q) => {
    let m = /^(\d+) mesh (?:in|to|as) (?:microns?|um|µm|mm)$/.exec(q); if (m) return { mesh: +m[1] };
    m = new RegExp(`^${NUM} ?(um|µm|microns?|mm) (?:in|to|as) mesh$`).exec(q); return m ? { um: +m[1] * (m[2] === 'mm' ? 1000 : 1) } : null;
  },
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
  name: 'sg', rank: 78,
  read: (text, q) => { const m = new RegExp(`^(?:sg|specific gravity|density) (?:of|from) ${NUM} ?g in air and ${NUM} ?g in water$`).exec(q); return m ? { air: +m[1], water: +m[2] } : null; },
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
  name: 'rqd', rank: 79,
  read: (text, q) => { const m = new RegExp(`^(?:rqd|recovery)(?: and (?:rqd|recovery))? (?:of|for|from) ((?:\\d+(?:\\.\\d+)?,? ?(?:and )?)+?) ?cm (?:in|over|for) (?:a |an )?${NUM} ?(m|cm) run$`).exec(q); if (!m) return null; const pieces = [...m[1].matchAll(/\d+(?:\.\d+)?/g)].map(x => +x[0]); return pieces.length ? { pieces, run: +m[2] * (m[3] === 'm' ? 100 : 1) } : null; },
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

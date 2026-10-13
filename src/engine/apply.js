// Field compute over a table: a single-value skill applied to every row the filter selects, the row's
// columns bound to the skill's arguments through their names, constants filling what no column holds.
// Rows a binding cannot fill are listed, not skipped silently.
import { S, tool, fmt, rad, deg, p3, p2 } from './core.js';
import { whereToSift } from './table.js';
import { evaluatePredicate, predicateToString } from '../vendor/sift.js';
import { conversions, vec3 } from '../vendor/bearing.js';

const ORI = '(\\d{1,3})\\s*/\\s*(\\d{1,2})';
const HOLE_AZ = /^(azimuth|azi|az|brg|bearing|trend|hole_?az(?:i|imuth)?)$/i, HOLE_DIP = /^(incl|inclination|plunge|hole_?dip|hdip)$/i, PLANE_DD = /^(dipdir|dip_?dir|dip_?direction|dd|dipdirection)$/i, PLANE_DIP = /^(dip|dip_?ang(?:le)?|plane_?dip|dipang)$/i;
const colNamed = (T, re) => T.cols.find(c => re.test(c.name) && c.type === 'numeric');
const consts = s => { const out = {}; if (!s) return out; let m; if ((m = new RegExp(`hole ${ORI}`).exec(s))) out.hole = { az: +m[1], dip: +m[2] }; if ((m = new RegExp(`(?:bedding|plane|vein|foliation|contact|fault) ${ORI}`).exec(s))) out.plane = { dd: +m[1], dip: +m[2] }; return out; };

tool({
  name: 'apply', pre: ['table'],
  skill: { group: 'Table', title: 'Field compute over a table', on: '@gcu/bearing · sift', about: 'A single-value skill on every row: true thickness of each intercept from from/to and the hole and plane columns, or apparent dip of each plane on a section. Constants fill what no column holds ("with hole 270/60"); rows that cannot be filled are listed.', examples: ['true thickness of every intercept with hole 270/60, bedding 045/30', 'apparent dip of each plane on a section at 090'] },
  topic: a => [a.skill === 'thickness' ? 'True thickness of intercepts' : 'Apparent dips', 2],
  run: a => {
    const T = S.table, R = T.roles, read = [a.skill === 'thickness' ? 'true thickness of every intercept' : 'apparent dip of every plane', ...(a.hole ? ['in', { v: a.hole }] : [])], c = a.consts || {};
    const refuse = (text, why) => ({ read, body: [{ t: 'note', kind: 'err', text }, { t: 'src', text: `${T.name} · ${T.rows.length} rows` }], trace: [why] });
    let rows = T.rows.map((r, i) => ({ r, i: i + 1 })), whereText = null;
    if (a.hole) { if (!R.hole) return refuse(`${T.name} has no hole column, so "in ${a.hole}" has nothing to match.`, 'no hole column'); rows = rows.filter(x => String(x.r[R.hole]).toLowerCase() === a.hole.toLowerCase()); if (!rows.length) return refuse(`No rows for hole ${a.hole}.`, 'hole: no rows'); }
    if (a.where) { let p; try { p = whereToSift(a.where, T); } catch (e) { return refuse(e.message, 'where: rejected'); } rows = rows.filter(x => evaluatePredicate(p.pred, k => x.r[k])); whereText = predicateToString(p.pred); }
    const binding = [], need = [];
    const planeDD = colNamed(T, PLANE_DD), planeDip = colNamed(T, PLANE_DIP), holeAz = colNamed(T, HOLE_AZ), holeDip = colNamed(T, HOLE_DIP) || (!planeDD ? colNamed(T, PLANE_DIP) : null);
    let getPlane, getHole, getLen;
    if (a.skill === 'thickness') {
      if (R.from && R.to) { getLen = r => r[R.to] - r[R.from]; binding.push(`length = ${R.to} − ${R.from}`); } else need.push('length: no from and to columns');
      if (c.hole) { getHole = () => c.hole; binding.push(`hole = ${p3(c.hole.az)}/${p2(c.hole.dip)} for every row`); }
      else if (holeAz && holeDip) { getHole = r => r[holeAz.name] == null || r[holeDip.name] == null ? null : { az: r[holeAz.name], dip: Math.abs(r[holeDip.name]) }; binding.push(`hole = ${holeAz.name}/${holeDip.name}${T.rows.some(r => r[holeDip.name] < 0) ? ' (negative inclinations read as down)' : ''}`); }
      else need.push('hole orientation: no azimuth and inclination columns; say "with hole 270/60"');
    }
    if (c.plane) { getPlane = () => c.plane; binding.push(`plane = ${p3(c.plane.dd)}/${p2(c.plane.dip)} for every row`); }
    else if (planeDD && planeDip) { getPlane = r => r[planeDD.name] == null || r[planeDip.name] == null ? null : { dd: r[planeDD.name], dip: r[planeDip.name] }; binding.push(`plane = ${planeDD.name}/${planeDip.name}`); }
    else need.push('plane: no dip direction and dip columns; say "with bedding 045/30"');
    if (need.length) return refuse(`I cannot bind every argument from ${T.name}: ${need.join('; ')}.`, 'binding incomplete: ' + need.join('; '));
    const out = [], unfilled = [];
    for (const { r, i } of rows) {
      const pl = getPlane(r); if (!pl) { unfilled.push(`row ${i}: no plane`); continue; }
      if (a.skill === 'thickness') {
        const len = getLen(r), h = getHole(r); if (len == null || isNaN(len)) { unfilled.push(`row ${i}: no length`); continue; } if (!h) { unfilled.push(`row ${i}: no hole orientation`); continue; }
        const cf = Math.abs(vec3.dot(conversions.lineToDcos(h.az, h.dip), conversions.planeToDcos(pl.dd, pl.dip)));
        out.push({ i, r, cells: [...(R.hole ? [String(r[R.hole])] : []), fmt(r[R.from]), fmt(r[R.to]), fmt(len, 4), `${p3(h.az)}/${p2(h.dip)}`, `${p3(pl.dd)}/${p2(pl.dip)}`, fmt(len * cf, 4)], v: len * cf });
      } else {
        const delta = a.az - pl.dd, cs = Math.cos(rad(delta)), app = deg(Math.atan(Math.tan(rad(pl.dip)) * Math.abs(cs))), tr = (cs >= 0 ? a.az : a.az + 180) % 360;
        out.push({ i, r, cells: [...(R.hole ? [String(r[R.hole])] : []), String(i), `${p3(pl.dd)}/${p2(pl.dip)}`, fmt(app, 3), p3(tr)], v: app });
      }
    }
    if (!out.length) return refuse(`No row could be filled: ${unfilled.slice(0, 5).join('; ')}${unfilled.length > 5 ? '…' : ''}.`, 'no row filled');
    const head = a.skill === 'thickness' ? [...(R.hole ? [R.hole] : []), R.from, R.to, 'length', 'hole', 'plane', 'true thickness'] : [...(R.hole ? [R.hole] : []), 'row', 'plane', 'apparent dip', 'plunges toward'];
    const total = out.reduce((s, x) => s + x.v, 0);
    const body = [
      { t: 'big', v: a.skill === 'thickness' ? fmt(total, 4) : fmt(total / out.length, 3), unit: a.skill === 'thickness' ? `m true thickness over ${out.length} intercept${out.length === 1 ? '' : 's'}` : `° mean apparent dip over ${out.length} plane${out.length === 1 ? '' : 's'} on a section at ${p3(a.az)}` },
      { t: 'table', head, num: head.map((h, i) => !(R.hole && i === 0) && h !== 'hole' && h !== 'plane' && h !== 'plunges toward'), rows: out.slice(0, 200).map(x => x.cells) },
      ...(out.length > 200 ? [{ t: 'sub', text: `${out.length} rows computed; the first 200 are shown.` }] : []),
      { t: 'kv', rows: [['binding', binding.join('; ')], ...(whereText ? [['where', whereText]] : []), ['rows', `${out.length} computed${unfilled.length ? `, ${unfilled.length} not filled` : ''} of ${rows.length} selected`]] },
      ...(unfilled.length ? [{ t: 'note', text: `Not filled, left out of the total: ${unfilled.slice(0, 12).join('; ')}${unfilled.length > 12 ? ` and ${unfilled.length - 12} more` : ''}.` }] : []),
      { t: 'src', text: `${T.name} · @gcu/bearing (vendored) on each row · sift for the filter` }
    ];
    return { read: [...read, ...(a.constText ? ['with', { v: a.constText }] : []), ...(a.skill === 'apparent' ? ['on a section at', { v: p3(a.az) }] : [])], value: a.skill === 'thickness' ? total : total / out.length, body, trace: [`select ${rows.length} rows${a.hole ? ' in ' + a.hole : ''}${whereText ? ' where ' + whereText : ''}`, `bind: ${binding.join('; ')}`, `${a.skill} on each row → ${out.length} values, ${unfilled.length} unfilled`], py: `table.apply(dh, skill="${a.skill}", binding=${JSON.stringify(binding)}${a.where ? `, where=${JSON.stringify(a.where)}` : ''})` };
  }
});

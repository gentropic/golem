// Orientation: true thickness from an intercept, and planes on a stereonet. The engine computes; the
// shell draws the `net` block (lower hemisphere, equal area) from the planes and lines it carries.
import { T, fmt, rad, deg, p3, p2 } from './core.js';

export const vLine = (tr, pl) => [Math.sin(rad(tr)) * Math.cos(rad(pl)), Math.cos(rad(tr)) * Math.cos(rad(pl)), -Math.sin(rad(pl))];
export const vPole = (dd, dip) => [Math.sin(rad(dd)) * Math.sin(rad(dip)), Math.cos(rad(dd)) * Math.sin(rad(dip)), Math.cos(rad(dip))];
const planeDD = a => a.conv === 'sd' ? (a.a1 + 90) % 360 : a.a1;
const convSlot = a => ({ v: `${p3(a.a1)}/${p2(a.a2)} as ${a.conv === 'sd' ? 'strike/dip (right-hand)' : 'dip direction/dip'}`, key: 'conv', alts: ['dd', 'sd'], cur: a.conv || 'dd' });

T.thickness = a => {
  const dd = planeDD(a), h = vLine(a.htr, a.hpl), n = vPole(dd, a.a2);
  const c = Math.abs(h[0] * n[0] + h[1] * n[1] + h[2] * n[2]), tt = a.len * c, ang = deg(Math.acos(Math.min(1, c)));
  return {
    read: ['true thickness of', { v: fmt(a.len) + ' m' }, 'in hole', { v: `${p3(a.htr)}/${p2(a.hpl)} trend/plunge` }, 'through', convSlot(a)],
    value: tt,
    body: [
      { t: 'big', v: fmt(tt, 4), unit: 'm true thickness' },
      { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [{ tr: a.htr, pl: a.hpl, label: 'hole' }] },
      { t: 'kv', rows: [['hole to pole', `${fmt(ang, 3)}°`], ['hole to plane', `${fmt(90 - ang, 3)}°`], ['factor', `${fmt(c, 4)} of downhole length`]] },
      { t: 'src', text: '@gcu/bearing · lower hemisphere, equal area' }
    ],
    trace: [`plane → dip direction ${p3(dd)}, dip ${p2(a.a2)}; pole ${p3(dd + 180)}/${p2(90 - a.a2)}`, `hole axis ${p3(a.htr)}/${p2(a.hpl)} as unit vector`, `|hole · pole| = ${fmt(c, 5)}`, `${fmt(a.len)} m × ${fmt(c, 5)} = ${fmt(tt, 5)} m`],
    py: `bearing.true_thickness(${a.len}, hole=(${a.htr}, ${a.hpl}), plane=(${dd}, ${a.a2}))`
  };
};
T.plane = a => {
  const dd = planeDD(a);
  return {
    read: ['plot plane', convSlot(a)],
    body: [
      { t: 'net', planes: [{ dd, dip: a.a2 }], lines: [] },
      { t: 'kv', rows: [['strike', p3(dd + 270)], ['dip', `${p2(a.a2)}° toward ${p3(dd)}`], ['pole', `${p3(dd + 180)}/${p2(90 - a.a2)}`]] },
      { t: 'src', text: '@gcu/bearing' }
    ],
    trace: ['plane → great circle and pole', 'equal-area projection, lower hemisphere'], py: `stereonet.plane(${dd}, ${a.a2})`
  };
};

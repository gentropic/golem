// Arithmetic by recursive descent. No eval, no Function. Trigonometry in degrees.
import { tool, fmt, rad, deg } from './core.js';

const FN = { sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, sin: x => Math.sin(rad(x)), cos: x => Math.cos(rad(x)), tan: x => Math.tan(rad(x)), asin: x => deg(Math.asin(x)), acos: x => deg(Math.acos(x)), atan: x => deg(Math.atan(x)) };
export function calc(src) {
  const s = src.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
  let i = 0;
  const pk = () => s[i];
  const paren = () => { i++; const v = expr(); if (pk() !== ')') throw 0; i++; return v; };
  function atom() {
    if (pk() === '(') return paren();
    if (pk() === '-') { i++; return -pow(); }
    const w = /^[a-z]+/.exec(s.slice(i));
    if (w) {
      i += w[0].length;
      if (w[0] === 'pi') return Math.PI;
      if (w[0] === 'e') return Math.E;
      if (!FN[w[0]] || pk() !== '(') throw 0;
      return FN[w[0]](paren());
    }
    const n = /^\d*\.?\d+(e[-+]?\d+)?/.exec(s.slice(i));
    if (!n) throw 0;
    i += n[0].length; return parseFloat(n[0]);
  }
  function pow() { const b = atom(); if (pk() === '^') { i++; return Math.pow(b, pow()); } return b; }
  function term() { let v = pow(); while (pk() === '*' || pk() === '/') { const o = s[i++], r = pow(); v = o === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (pk() === '+' || pk() === '-') { const o = s[i++], r = term(); v = o === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (i < s.length) throw 0;
  return v;
}
tool({
  name: 'calc', rank: 110,
  skill: { group: 'Compute', title: 'Arithmetic', on: '@gcu/expr', about: 'Parsed and evaluated, never eval. Trigonometry in degrees.', examples: ['14 * cos(22) + 3^2', 'sqrt(2) * 84'] },
  read: (text, q) => { const m = /^(?:what is |what's |calc(?:ulate)? |compute )?([-+*/^().,\d\sa-z×÷]+)$/.exec(q); return m && /\d/.test(m[1]) ? { x: m[1].trim() } : null; },
  topic: () => ['Arithmetic', .5],
  run: a => {
    let v; try { v = calc(a.x); } catch (e) { return null; }
    if (typeof v !== 'number' || isNaN(v)) return null;
    return { read: ['evaluate', { v: a.x }, 'trig in degrees'], value: v, body: [{ t: 'big', v: fmt(v, 10) }], trace: [`expr.parse("${a.x}")`, `evaluate → ${v}`], py: a.x.replace(/\^/g, '**') };
  }
});

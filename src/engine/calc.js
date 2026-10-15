// Arithmetic by recursive descent. No eval, no Function. Trigonometry in degrees.
import { tool, frame, fmt, rad, deg } from './core.js';

const FN = { sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, sin: x => Math.sin(rad(x)), cos: x => Math.cos(rad(x)), tan: x => Math.tan(rad(x)), asin: x => deg(Math.asin(x)), acos: x => deg(Math.acos(x)), atan: x => deg(Math.atan(x)) };
// vars: for a taught formula (lore.js), names to numbers ("recovered / drilled * 100"); without it a name is a function
export function calc(src, vars) {
  const s = src.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
  let i = 0;
  const pk = () => s[i];
  const paren = () => { i++; const v = expr(); if (pk() !== ')') throw 0; i++; return v; };
  function atom() {
    if (pk() === '(') return paren();
    if (pk() === '-') { i++; return -pow(); }
    const w = (vars ? /^[a-z_][a-z0-9_]*/ : /^[a-z]+/).exec(s.slice(i));
    if (w) {
      i += w[0].length;
      if (vars && pk() !== '(' && Object.prototype.hasOwnProperty.call(vars, w[0])) return vars[w[0]];
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
  name: 'calc',
  skill: { group: 'Compute', title: 'Arithmetic', on: '@gcu/expr', about: 'Parsed and evaluated, never eval. Trigonometry in degrees.', examples: ['14 * cos(22) + 3^2', 'sqrt(2) * 84'] },
  topic: () => ['Arithmetic', .5],
  run: a => {
    let v; try { v = calc(a.x); } catch (e) { return null; }
    if (typeof v !== 'number' || isNaN(v)) return null;
    return { read: ['evaluate', { v: a.x }, 'trig in degrees'], value: v, body: [{ t: 'big', v: fmt(v, 10) }], trace: [`expr.parse("${a.x}")`, `evaluate → ${v}`], py: a.x.replace(/\^/g, '**') };
  }
});
// an expression: what the arithmetic parser accepts, with at least one operator or function (a bare number is not a sum)
export const calcOf = x => { const s = x.trim(); if (!/\d/.test(s) || !/[-+*/^×÷(]/.test(s.replace(/^-/, ''))) return null; try { const v = calc(s); return typeof v === 'number' && !isNaN(v) ? { x: s } : null; } catch (e) { return null; } };
// "calculate 14 * cos(22)", "please compute (2 + 3) / 4": the expression is the text after the verb
frame({
  name: 'calc', label: 'Calculate', words: ['calculate', 'compute', 'evaluate', 'work out', 'eval', 'calc'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['calcula', 'calcule', 'quanto é', 'avalia'], label_pt: 'Calcular',
  bind: c => { const a = calcOf(c.theme[0].value); return a ? { tool: 'calc', args: a } : null; }
});
// the names an expression uses that are not functions or constants: a taught formula's terms
export const namesIn = src => { const s = src.toLowerCase().replace(/\s+/g, ''); return [...new Set([...s.matchAll(/[a-z_][a-z0-9_]*/g)].filter(m => s[m.index + m[0].length] !== '(').map(m => m[0]).filter(w => !FN[w] && w !== 'pi' && w !== 'e'))]; };

// What golem is told, kept (SPEC 13: shaped by words). Two kinds beside the taught words of notes.js:
//   a value: "granite is 2.7 t/m3" — a taught word whose meaning is a quantity, so "granite in lb/ft3" and "how heavy is
//     1000 m3 of granite" read with the quantity in its place (the taught rung's rewrite, the quantity checked first);
//   a formula: "define core recovery as recovered / drilled * 100" — result = expression, parsed by calc.js (never eval),
//     kept as S.formulas and solved for any term by reckon.js's formula card, like the declared ones.
// Both are device state, undone by undo, forgotten by "forget granite" / "forget the formula core recovery".
import { S, tool, frame, noun, fmt } from './core.js';
import { parseUnit } from './units.js';
import { calc, namesIn } from './calc.js';
import { staleBlocks } from './tms.js';

const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/* ── values ──────────────────────────────────────────────────── */
tool({
  name: 'value', effects: ['device'],
  skill: { group: 'Session', title: 'Teach a value or a formula', on: 'lexicon · own expression parser', about: 'Tell golem a value ("granite is 2.7 t/m3") and it reads that word as the quantity everywhere; tell it a formula ("define core recovery as recovered / drilled * 100") and it solves it for any term, like the built-in ones. Kept on this device; "forget" removes them.', examples: ['granite is 2.7 t/m3', 'how heavy is 1000 m3 of granite', 'define the formula core recovery as recovered / drilled * 100', 'solve core recovery for drilled'] },
  topic: a => [`${a.name} = ${a.n} ${a.unit}`, .5],
  undo: a => { if (S.aliases[a.name] === `${a.n} ${a.unit}`) delete S.aliases[a.name]; },
  run: a => {
    const was = S.aliases[a.name], now = `${a.n} ${a.unit}`;
    S.aliases[a.name] = now;
    return { read: ['learn that', { v: a.name }, 'is', { v: now }], value: a.n,
      body: [{ t: 'note', kind: 'ok', text: `Learned. "${a.name}" now reads as ${now} on this device${was && was !== now ? ` (it was ${was})` : ''}.` }, ...staleBlocks(a.name), { t: 'chips', items: [`${a.name} in ${parseUnit(a.unit).dim === 'M/V' ? 'lb/ft3' : a.unit}`] }],
      trace: [`lexicon.add(${JSON.stringify(a.name)} → ${JSON.stringify(now)})`, `${a.unit}: a ${parseUnit(a.unit).dim} unit golem knows`] };
  }
});
/* ── formulas ────────────────────────────────────────────────── */
tool({
  name: 'defineFormula', effects: ['device'],
  topic: a => [`Formula: ${a.name}`, 1],
  undo: a => { delete S.formulas[a.name]; },
  run: a => {
    const read = ['define', { v: a.name }, 'as', { v: a.expr }];
    const vars = namesIn(a.expr), result = slug(a.name);
    let ok = vars.length > 0; try { calc(a.expr.toLowerCase(), Object.fromEntries(vars.map(v => [v, 1.5]))); } catch (e) { ok = false; }
    if (!ok) return { read, body: [{ t: 'note', kind: 'err', text: vars.length ? `"${a.expr}" is not an expression I can read: numbers, names, + − × ÷ ^ and functions like sqrt( ).` : `"${a.expr}" has no terms to solve for. Name them, as in "recovered / drilled * 100".` }], trace: ['expression: refused'] };
    if (vars.includes(result)) return { read, body: [{ t: 'note', kind: 'err', text: `The formula's name, ${a.name}, is also one of its terms.` }], trace: ['refused: the result is a term'] };
    S.formulas[a.name] = { result, label: a.name, expr: a.expr.toLowerCase(), vars };
    return { read, value: vars.length,
      body: [{ t: 'note', kind: 'ok', text: `Learned: ${result} = ${a.expr}. I solve it for any of its ${vars.length + 1} terms.` }, ...staleBlocks(`formula ${a.name}`), { t: 'kv', rows: [['terms', [result, ...vars].join(', ')], ['parsed by', 'golem\'s own expression parser, never eval']] },
        { t: 'chips', items: [a.name, ...vars.slice(0, 2).map(v => `solve ${a.name} for ${v.replace(/_/g, ' ')}`)] }],
      trace: [`expr.parse(${JSON.stringify(a.expr)}) → terms ${vars.join(', ')}`, `formula ${JSON.stringify(a.name)}: ${result} = ${a.expr}`] };
  }
});
tool({
  name: 'forget', effects: ['device'],
  topic: a => [`Forget ${a.name}`, .2],
  run: a => {
    const isF = a.kind === 'formula' || (!S.aliases[a.name] && S.formulas[a.name]);
    if (isF) { const had = !!S.formulas[a.name]; if (had && !a.done) { a.was = S.formulas[a.name]; delete S.formulas[a.name]; a.done = true; } return { read: ['forget the formula', { v: a.name }], body: [{ t: 'note', kind: a.was ? 'ok' : 'err', text: a.was ? `Forgotten: the formula ${a.name}.` : `There is no formula called ${a.name}.` }, ...staleBlocks(`formula ${a.name}`)], trace: ['S.formulas'] }; }
    if (!a.done && S.aliases[a.name]) { a.was = S.aliases[a.name]; delete S.aliases[a.name]; a.done = true; }
    return { read: ['forget', { v: a.name }], body: [{ t: 'note', kind: a.was ? 'ok' : 'err', text: a.was ? `Forgotten: "${a.name}" (it read as ${a.was}).` : `I was not taught "${a.name}".` }, ...staleBlocks(a.name)], trace: ['lexicon'] };
  },
  undo: a => { if (!a.was) return; if (typeof a.was === 'string') S.aliases[a.name] = a.was; else S.formulas[a.name] = a.was; }
});

/* ── what reads them ─────────────────────────────────────────── */
// "granite is 2.7 t/m3", "the ore density is 2.85 t/m3", "a core run is 3 m": a name and a quantity whose unit golem knows
frame({
  name: 'value', label: 'Teach a value', words: ['is', 'equals', 'is equal to'], subject: ['text'], theme: ['quantity:*'], required: ['theme', 'subject'], roles: {},
  words_pt: ['é', 'vale'], label_pt: 'Ensinar um valor',
  bind: c => {
    const w = c.roles.subject && c.roles.subject[0], q = c.theme[0]; if (!w || !q || q.type !== 'quantity' || !q.unit) return null;
    const name = String(w.value).toLowerCase().replace(/^(?:the|a|an|my|our)\s+/, '').trim(), u = parseUnit(q.unit);
    if (!name || /\d/.test(name) || name.split(/\s+/).length > 4 || !u || u.amb) return null;
    return { tool: 'value', args: { name, n: q.n, unit: q.unit } };
  }
});
// "define the formula core recovery as recovered / drilled * 100", "let stripping be waste / ore": the words after the verb, cut at
// the first "as", "be" or "=" (a free-text theme takes them all; a bare "define" stays the definitions': "define sentinel")
frame({
  name: 'defineFormula', label: 'Teach a formula', words: ['define the formula', 'define formula', 'new formula', 'teach the formula', 'teach formula', 'let'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['define a fórmula', 'nova fórmula'], label_pt: 'Ensinar uma fórmula',
  bind: c => {
    const m = /^(.+?)\s+(?:as|be|=|como)\s+(.+)$/i.exec(String(c.theme[0].value).trim()); if (!m) return null;
    const name = m[1].toLowerCase().replace(/^(?:the|a|an)\s+/, '').trim(), expr = m[2].trim();
    return name && !/\d/.test(name) && expr ? { tool: 'defineFormula', args: { name, expr } } : null;
  }
});
// "define the formula core recovery as …" again: the name is now a formula (a noun), so the rest is the "as" role
frame({
  name: 'redefineFormula', label: 'Teach a formula', words: ['define the formula', 'define formula', 'redefine the formula', 'redefine', 'teach the formula'], theme: ['formulaname'], required: ['theme', 'as'], roles: { as: { preps: ['as', 'be'], types: ['text'] } },
  words_pt: ['define a fórmula', 'redefine a fórmula'], label_pt: 'Ensinar uma fórmula',
  bind: c => { const name = c.theme[0].value, expr = c.roles.as && String(c.roles.as[0].value).trim(); return S.formulas[name] && expr ? { tool: 'defineFormula', args: { name, expr } } : null; }
});
noun(() => ({ type: 'taughtthing', exact: true, words: { ...Object.fromEntries(Object.keys(S.aliases).map(k => [k, [k]])), ...Object.fromEntries(Object.keys(S.formulas).map(k => [k, [k, `the formula ${k}`]])) } }));
frame({
  name: 'forget', label: 'Forget', words: ['forget', 'unlearn'], theme: ['taughtthing'], required: ['theme'], roles: {},
  words_pt: ['esquece', 'esqueça'], label_pt: 'Esquecer',
  bind: c => { const n = c.theme[0].value; return n ? { tool: 'forget', args: { name: n, kind: S.formulas[n] && !S.aliases[n] ? 'formula' : 'word' } } : null; }
});
export { slug };

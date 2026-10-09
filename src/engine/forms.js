// The form card: a tool that still needs answers asks for them one at a time; each answer lands in
// args and is an editable slot, and the result recomputes when any changes. The decision matrix is the
// first form; the economics formulas use the same helpers.
import { tool } from './core.js';

// an open question answered by a typed number (or an offered option); the whole answer must be the number
export const numberAsk = (prompt, { offer = [], min, max, unit } = {}) => ({
  prompt: `${prompt}${offer.length ? '' : ' Type it below.'}`,
  options: offer.map(o => ({ label: o.label, value: o.value })),
  parse: s => { const m = /^(?:about |around |~)?(-?\d+(?:[.,]\d+)?)\s*(?:[a-zµ%°$][\w%°$/³²]*)?$/i.exec(s.trim()); if (!m) return null; const v = +m[1].replace(',', '.'); return (min != null && v < min) || (max != null && v > max) ? null : v; },
  hint: unit || null
});
// an open question answered by a list: "a, b and c"
export const listAsk = prompt => ({ prompt: `${prompt} Type them below, separated by commas.`, options: [], parse: s => { const xs = listOf(s); return xs.length >= 2 ? xs : null; } });
export const listOf = s => s.split(/\s*,\s*|\s+and\s+|\s+or\s+|\s*;\s*/).map(x => x.trim().replace(/^(?:the|a|an)\s+/i, '')).filter(Boolean);
// the first unanswered question of a list [{ key, ask }] → { key, ask with set } | null
export function firstNeed(a, qs) {
  for (const q of qs) { if (a[q.key] != null) continue; const ask = typeof q.ask === 'function' ? q.ask(a) : q.ask; return { ...ask, set: (x, v) => { x[q.key] = v; } }; }
  return null;
}
const ONE_TO_FIVE = [1, 2, 3, 4, 5].map(n => ({ label: String(n), value: n }));
const slot = (label, key, cur) => ({ v: `${label} ${cur}`, key, alts: [1, 2, 3, 4, 5], cur });

/* ── the decision matrix ────────────────────────────────────── */
tool({
  name: 'decide', rank: 38,
  skill: { group: 'Compute', title: 'Decision matrix', on: 'form card', about: 'Options, criteria, a weight for each criterion and a score for each option on each, asked one at a time; weighted totals, bars, and the smallest single weight change that would change the top option. It reports the highest score and does not say what to do.', examples: ['help me decide between perth, vancouver and santiago', 'compare these options'] },
  read: (text, q) => {
    let m = /^(?:help me |can you help me )?(?:decide|choose|pick|weigh up)(?: between| among| from)? (.+)$/.exec(q);
    if (m) { const at = q.indexOf(m[1]), xs = listOf(text.slice(at)); return xs.length >= 2 ? { options: xs } : null; }
    return /^(?:compare (?:these |the |my )?options|decision matrix|weighted decision|help me decide)$/.test(q) ? {} : null;
  },
  amend: [
    { arg: '_set', match: /^(?:weight (?:of |for )?)?(.+?) (?:weighs|weight|=|is) ([1-5])$/, value: (m, a) => (a.criteria || []).map(c => c.toLowerCase()).includes(m[1].toLowerCase()) ? { key: 'w:' + a.criteria.find(c => c.toLowerCase() === m[1].toLowerCase()), v: +m[2] } : null },
    { arg: '_set', match: /^(.+?) (?:on|for) (.+?) (?:=|is|scores|gets) ([1-5])$/, value: (m, a) => { const o = (a.options || []).find(x => x.toLowerCase() === m[1].toLowerCase()), c = (a.criteria || []).find(x => x.toLowerCase() === m[2].toLowerCase()); return o && c ? { key: `s:${o}|${c}`, v: +m[3] } : null; } }
  ],
  topic: a => ['Decision matrix', 1],
  run: a => {
    if (a._set) { a[a._set.key] = a._set.v; delete a._set; }
    const read = ['decide between', { v: a.options ? a.options.join(', ') : '…' }];
    const qs = [{ key: 'options', ask: listAsk('Which options?') }, { key: 'criteria', ask: listAsk('Which criteria matter?') }];
    for (const c of a.criteria || []) qs.push({ key: 'w:' + c, ask: numberAsk(`How much does ${c} weigh, 1 (least) to 5 (most)?`, { offer: ONE_TO_FIVE, min: 1, max: 5 }) });
    for (const o of a.options || []) for (const c of a.criteria || []) qs.push({ key: `s:${o}|${c}`, ask: numberAsk(`Score ${o} on ${c}, 1 (poor) to 5 (best)?`, { offer: ONE_TO_FIVE, min: 1, max: 5 }) });
    const answered = qs.filter(q => a[q.key] != null).length, need = firstNeed(a, qs);
    if (a.criteria) read.push('by', ...a.criteria.map(c => slot(c, 'w:' + c, a['w:' + c] || '?')).filter(s => s.cur !== '?'));
    if (need) return { read, body: [...(a.criteria ? [{ t: 'kv', rows: [['options', a.options.join(', ')], ['criteria', a.criteria.join(', ')], ['answered', `${answered} of ${qs.length}`]] }] : [])], ask: need, trace: [`form: ${answered} of ${qs.length} answered`, 'blocked: next question'] };
    const W = a.criteria.map(c => a['w:' + c]), totals = a.options.map(o => a.criteria.reduce((s, c, i) => s + W[i] * a[`s:${o}|${c}`], 0));
    const best = Math.max(...totals), top = a.options.filter((o, i) => totals[i] === best);
    const argmax = ws => { const t = a.options.map(o => a.criteria.reduce((s, c, i) => s + ws[i] * a[`s:${o}|${c}`], 0)); const m = Math.max(...t); return a.options.filter((o, i) => t[i] === m).join(' & '); };
    let flip = null;
    a.criteria.forEach((c, i) => { for (const w of [1, 2, 3, 4, 5]) { if (w === W[i]) continue; const ws = W.slice(); ws[i] = w; const who = argmax(ws); if (who !== top.join(' & ') && (!flip || Math.abs(w - W[i]) < flip.d)) flip = { c, from: W[i], to: w, who, d: Math.abs(w - W[i]) }; } });
    const rows = a.options.map((o, i) => [o, ...a.criteria.map(c => `${a[`s:${o}|${c}`]}`), String(totals[i])]);
    return {
      read, value: top.join(' & '),
      body: [
        { t: 'big', v: top.length > 1 ? `Tie: ${top.join(', ')}` : `Highest score: ${top[0]}`, unit: `${best} of ${5 * W.reduce((x, y) => x + y, 0)}` },
        { t: 'table', head: ['Option', ...a.criteria.map((c, i) => `${c} ×${W[i]}`), 'Total'], num: [false, ...a.criteria.map(() => true), true], rows },
        { t: 'hbars', rows: a.options.map((o, i) => [o, totals[i], String(totals[i])]) },
        { t: 'sub', text: flip ? `Sensitivity: if ${flip.c} weighed ${flip.to} instead of ${flip.from}, the highest score would be ${flip.who}. No smaller single weight change does that.` : 'Sensitivity: no single weight change (1 to 5) changes which option scores highest.' },
        { t: 'sub', text: 'Weights and scores are yours; tap one in the reading to change it, or say "cost is 3" or "perth on cost is 4".' }
      ],
      trace: [`weights: ${a.criteria.map((c, i) => `${c} ${W[i]}`).join(', ')}`, ...a.options.map((o, i) => `${o}: ${a.criteria.map((c, j) => `${W[j]}×${a[`s:${o}|${c}`]}`).join(' + ')} = ${totals[i]}`), flip ? `sensitivity: ${flip.c} ${flip.from}→${flip.to} gives ${flip.who}` : 'sensitivity: none'],
      py: `decide.matrix(options=${JSON.stringify(a.options)}, criteria=${JSON.stringify(a.criteria)}, weights=${JSON.stringify(W)}, scores=${JSON.stringify(a.options.map(o => a.criteria.map(c => a[`s:${o}|${c}`])))})`
    };
  }
});

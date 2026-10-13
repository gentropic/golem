// Text tools over a pasted payload: counts and readability, extracted key sentences, and a diff.
// The payload is what follows the first colon, or every line after the first of a multi-line input;
// it is never read as a command. Nothing here rewrites text.
import { tool, frame, amend, noun, qmod, fmt } from './core.js';

// head: the command; body: the payload, from the raw input so lines and case survive
export function payloadOf(raw) {
  const s = raw.trim();
  if (/\n/.test(s)) { const i = s.indexOf('\n'); const head = s.slice(0, i).trim(); if (!/:\s*\S/.test(head) || head.indexOf(':') === head.length - 1) return { head: head.replace(/:$/, '').trim(), body: s.slice(i + 1).trim() }; }
  const i = s.indexOf(':'); if (i < 0) return null;
  return { head: s.slice(0, i).trim(), body: s.slice(i + 1).trim() };
}
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-]*/gu;
export const words = s => s.match(WORD) || [];
export function sentences(s) {
  const out = []; let start = 0; const t = s.replace(/\s+/g, ' ').trim();
  const re = /[.!?…]+["”’)\]]*(?=\s+[\p{Lu}\p{N}"“(\[]|\s*$)/gu; let m;
  while ((m = re.exec(t))) { const piece = t.slice(start, m.index + m[0].length).trim(); if (piece) out.push(piece); start = m.index + m[0].length; }
  const tail = t.slice(start).trim(); if (tail) out.push(tail);
  return out;
}
// an English syllable estimate by rule: vowel groups, less a silent e, at least one
export function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
  let n = (w.replace(/e$/, '').replace(/(?:[^laeiouy]es|ed)$/, '').match(/[aeiouy]{1,2}/g) || []).length;
  if (/[^aeiou]le$/.test(w)) n++;
  return Math.max(1, n);
}
const quote = s => `“${s.length > 160 ? s.slice(0, 157) + '…' : s}”`;

tool({
  name: 'wordcount',
  skill: { group: 'Compute', title: 'Text tools', on: 'own algorithms', about: 'Word count and readability (Flesch, English only, labelled estimates), the key sentences of a text in their original order (TextRank, nothing rewritten), and a diff of two blocks by line, word or character (Myers). The text follows a colon or the first line.', examples: ['word count: the quick brown fox jumps over the lazy dog. it was not amused.', 'summarise this: …', 'diff these: a\\n---\\nb'] },
  topic: () => ['Text', .5],
  run: a => {
    const ws = words(a.text), ss = sentences(a.text), paras = a.text.split(/\n\s*\n/).filter(x => x.trim()).length, chars = a.text.length, nospace = a.text.replace(/\s/g, '').length;
    const longest = ss.reduce((b, s) => words(s).length > words(b).length ? s : b, ss[0] || '');
    const rows = [['characters', `${chars} (${nospace} without spaces)`], ['words', String(ws.length)], ['sentences', String(ss.length)], ['paragraphs', String(paras)], ['mean sentence', ss.length ? `${fmt(ws.length / ss.length, 3)} words` : '—'], ['longest sentence', ss.length ? `${words(longest).length} words: ${quote(longest)}` : '—']];
    const body = [{ t: 'big', v: String(ws.length), unit: `word${ws.length === 1 ? '' : 's'}` }, { t: 'kv', rows }];
    const read = ['count', { v: `${ws.length} words` }, { v: a.lang === 'en' ? 'English' : a.lang === 'pt' ? 'Portuguese' : a.lang, key: 'lang', alts: ['en', 'pt', 'other'], cur: a.lang }];
    const trace = [`words: ${ws.length}, sentences: ${ss.length}, paragraphs: ${paras}`];
    if (a.lang === 'en' && ws.length && ss.length) {
      const syl = ws.reduce((n, w) => n + syllables(w), 0), wps = ws.length / ss.length, spw = syl / ws.length;
      const fre = 206.835 - 1.015 * wps - 84.6 * spw, fk = 0.39 * wps + 11.8 * spw - 15.59;
      body.push({ t: 'kv', rows: [['Flesch reading ease', `about ${Math.round(fre)} (estimate; 60 to 70 reads as plain English, under 30 as academic)`], ['Flesch–Kincaid grade', `about ${Math.round(fk)} (estimate; US school grade)`], ['syllables', `${syl}, estimated by rule (vowel groups), ${fmt(spw, 3)} per word`]] });
      trace.push(`syllables by rule: ${syl}`, `FRE = 206.835 − 1.015 × ${fmt(wps, 4)} − 84.6 × ${fmt(spw, 4)} = ${fmt(fre, 4)}`, `FK = 0.39 × ${fmt(wps, 4)} + 11.8 × ${fmt(spw, 4)} − 15.59 = ${fmt(fk, 4)}`);
    } else if (a.lang !== 'en') { body.push({ t: 'note', text: `No readability score: I have no checked formula for ${a.lang === 'pt' ? 'Portuguese (the Martins et al. 1996 adaptation is not transcribed yet)' : 'that language'}. The counts stand.` }); trace.push('readability: no formula for ' + a.lang); }
    return { read, value: ws.length, body, trace, py: `text.stats(payload, lang="${a.lang}")` };
  }
});

/* ── key sentences by TextRank, in their original order ─────── */
const STOP = new Set('a an the and or but if then else of in on at to for from by with without as is are was were be been being it its this that these those there here he she they we you i me him her them us my your our their his not no yes do does did done have has had having will would shall should can could may might must also than too very so such which who whom whose what when where why how all any each few more most other some only own same into over under again further once'.split(' '));
const content = s => new Set(words(s).map(w => w.toLowerCase()).filter(w => w.length > 2 && !STOP.has(w)));
export function textrank(ss) {
  const n = ss.length, C = ss.map(content), W = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let shared = 0; for (const w of C[i]) if (C[j].has(w)) shared++; const den = Math.log(C[i].size + 1) + Math.log(C[j].size + 1); W[i][j] = W[j][i] = den > 0 ? shared / den : 0; }
  let R = new Array(n).fill(1 / n); const out = W.map(row => row.reduce((x, y) => x + y, 0));
  for (let it = 0; it < 40; it++) { const next = R.map((_, i) => 0.15 / n + 0.85 * W[i].reduce((acc, w, j) => acc + (w && out[j] ? w / out[j] * R[j] : 0), 0)); R = next; }
  return R;
}
tool({
  name: 'extract',
  topic: () => ['Key sentences', 1],
  run: a => {
    const ss = sentences(a.text), read = ['extract', { v: `${a.n} sentence${a.n === 1 ? '' : 's'}` }, 'of', { v: `${ss.length}` }];
    if (ss.length < 6) return { read, body: [{ t: 'note', kind: 'err', text: `${ss.length} sentence${ss.length === 1 ? '' : 's'}: short enough to read as it is.` }], trace: ['fewer than six sentences'] };
    const R = textrank(ss), n = Math.min(a.n, ss.length), top = R.map((r, i) => [r, i]).sort((x, y) => y[0] - x[0]).slice(0, n).map(x => x[1]).sort((x, y) => x - y);
    return { read, value: top.map(i => ss[i]).join(' '), copy: top.map(i => ss[i]).join('\n'), body: [{ t: 'lbl', text: 'Extracted sentences' }, { t: 'list', items: top.map(i => `${quote(ss[i])} (sentence ${i + 1} of ${ss.length})`) }, { t: 'sub', text: 'Nothing was rewritten: these are the source\'s own sentences, in their original order, chosen by TextRank over shared content words.' }, { t: 'actions', items: [{ act: 'copy', label: 'Copy sentences' }] }], trace: [`split → ${ss.length} sentences`, `TextRank, 40 iterations, d = 0.85 → top ${n}: ${top.map(i => i + 1).join(', ')}`, `scores ${top.map(i => fmt(R[i], 3)).join(', ')}`], py: `text.extract(payload, n=${a.n})` };
  }
});

/* ── diff of two blocks, Myers O(ND) ────────────────────────── */
export function myers(a, b) {
  const N = a.length, M = b.length, MAX = N + M, off = MAX + 1, V = new Array(2 * MAX + 3).fill(0), trace = [];
  V[off + 1] = 0;
  outer: for (let d = 0; d <= MAX; d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1, y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      V[off + k] = x;
      if (x >= N && y >= M) break outer;
    }
  }
  const ops = []; let x = N, y = M;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d], k = x - y, pk = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? k + 1 : k - 1, px = v[off + pk], py = px - pk;
    while (x > px && y > py) { ops.push(['=', a[x - 1]]); x--; y--; }
    if (d > 0) { if (x === px) { ops.push(['+', b[py]]); y--; } else { ops.push(['-', a[px]]); x--; } }
  }
  return ops.reverse();
}
const UNITS = ['line', 'word', 'character'];
const split = (s, unit) => unit === 'line' ? s.split(/\r?\n/) : unit === 'word' ? s.split(/(\s+)/).filter(x => x !== '') : [...s];
tool({
  name: 'diff',
  topic: () => ['Diff', 1],
  run: a => {
    if (a.noSep) return { read: ['diff'], body: [{ t: 'note', kind: 'err', text: 'Put a line of three dashes (---) between the two blocks.' }], trace: ['no separator'] };
    const A = split(a.a, a.unit), B = split(a.b, a.unit);
    if (A.length + B.length > 6000) return { read: ['diff'], body: [{ t: 'note', kind: 'err', text: `${A.length + B.length} ${a.unit}s is more than I diff in the page; try by line, or split the text.` }], trace: ['too long'] };
    const ops = myers(A, B), added = ops.filter(o => o[0] === '+').length, removed = ops.filter(o => o[0] === '-').length, same = ops.filter(o => o[0] === '=').length;
    const read = ['diff by', { v: a.unit, key: 'unit', alts: UNITS, cur: a.unit }];
    const view = a.unit === 'line' ? ops.map(([t, s]) => `${t === '=' ? ' ' : t} ${s}`).join('\n') : ops.map(([t, s]) => t === '=' ? s : t === '-' ? `[-${s}-]` : `{+${s}+}`).join(a.unit === 'word' ? '' : '');
    return { read, value: added + removed, copy: view, body: [{ t: 'big', v: added + removed ? `${added} added, ${removed} removed` : 'Identical', unit: `${a.unit}s; ${same} unchanged` }, { t: 'pre', text: view }, { t: 'sub', text: a.unit === 'line' ? 'Lines marked − are only in the first block, + only in the second.' : 'Removed pieces are in [-…-], added ones in {+…+}.' }, { t: 'actions', items: [{ act: 'copy', label: 'Copy diff' }] }], trace: [`split by ${a.unit}: ${A.length} and ${B.length}`, `Myers O(ND) → ${ops.length} operations, D = ${added + removed}`], py: `difflib.unified_diff(a.splitlines(), b.splitlines())` };
  }
});
/* ── what reads them: a head, then the text after a colon or a line break ── */
const payload = c => { const t = c.roles.text && c.roles.text[0]; return t && t.type === 'text' ? t.value.replace(/\r\n/g, '\n') : null; };
const TEXT_ROLE = { text: { preps: [':'], types: ['text'] } };
frame({
  name: 'wordcount', label: 'Count words', words: ['word count', 'count words', 'count the words', 'text stats', 'readability', 'reading level', 'how readable is'], theme: [], required: ['text'], roles: TEXT_ROLE,
  words_pt: ['contar palavras', 'conta as palavras', 'contagem de palavras', 'legibilidade'], label_pt: 'Contar palavras',
  bind: c => payload(c) ? { tool: 'wordcount', args: { text: payload(c), lang: 'en' } } : null
});
frame({
  name: 'extract', label: 'Key sentences', words: ['summarise', 'summarize', 'summary', 'key sentences', 'extract', 'extract the key sentences', 'main points', 'gist'], theme: [], required: ['text'], roles: TEXT_ROLE,
  words_pt: ['resume', 'resuma', 'resumir', 'resumo', 'pontos principais', 'frases principais'], label_pt: 'Frases principais',
  bind: c => payload(c) ? { tool: 'extract', args: { text: payload(c), n: 3 } } : null
});
frame({
  name: 'diff', label: 'Diff', words: ['diff', 'compare', 'difference', 'difference between', 'what changed between', 'what changed in'], theme: [], required: ['text'], roles: TEXT_ROLE,
  words_pt: ['diferença', 'diferença entre', 'compara', 'compare', 'o que mudou entre'], label_pt: 'Diferença',
  bind: c => {
    const p = payload(c); if (!p) return null;
    const parts = p.split(/\n\s*-{3,}\s*\n/);
    return { tool: 'diff', args: parts.length === 2 ? { a: parts[0].trim(), b: parts[1].trim(), unit: /\n/.test(parts[0].trim()) || /\n/.test(parts[1].trim()) ? 'line' : 'word' } : { noSep: true } };
  }
});
/* ── amendments: "portuguese", "2 sentences", "shorter", "by word" ── */
noun({ amend: true, type: 'language', words: { en: ['english'], pt: ['portuguese'], es: ['spanish'], fr: ['french'], de: ['german'], other: ['other', 'another language'] }, words_pt: { en: ['inglês', 'ingles'], pt: ['português', 'portugues'], es: ['espanhol'], fr: ['francês'], de: ['alemão'] } });
amend({ tools: ['wordcount'], name: 'lang', label: 'Language', words: ["it's", 'it is', 'this is'], elidable: true, theme: ['language'], required: [], roles: { in: { preps: ['in'], types: ['language'] } },
  bind: (c, a) => { const l = [...c.theme, ...(c.roles.in || [])][0]; return l ? { args: { ...a, lang: l.value } } : null; } });
noun({ amend: true, type: 'sentences', words: {}, generic: ['sentences', 'sentence'], generic_pt: ['frases', 'frase'] }); qmod({ head: 'sentences', attr: 'n', dims: ['bare'] });
noun({ amend: true, type: 'lengthword', words: { shorter: ['shorter', 'fewer', 'less'], longer: ['longer', 'more'] }, words_pt: { shorter: ['mais curto', 'menos'], longer: ['mais longo', 'mais'] } });
amend({ tools: ['extract'], name: 'extractn', label: 'Sentences', words: [], elidable: true, theme: ['sentences', 'lengthword'], required: ['theme'], roles: {},
  bind: (c, a) => { const t = c.theme[0]; if (t.type === 'sentences') return t.attrs.n ? { args: { ...a, n: t.attrs.n.n } } : null; return { args: { ...a, n: t.value === 'shorter' ? Math.max(1, a.n - 1) : a.n + 1 } }; } });
noun({ amend: true, type: 'diffunit', words: { line: ['lines', 'line'], word: ['words', 'word'], character: ['characters', 'character', 'chars', 'letters'] }, words_pt: { line: ['linhas'], word: ['palavras'], character: ['caracteres'] } });
amend({ tools: ['diff'], name: 'diffunit', label: 'Diff by', words: [], elidable: true, theme: ['diffunit'], required: [], roles: { by: { preps: ['by', 'per'], types: ['diffunit'] } },
  bind: (c, a) => { const u = [...c.theme, ...(c.roles.by || [])][0]; return u ? { args: { ...a, unit: u.value } } : null; } });

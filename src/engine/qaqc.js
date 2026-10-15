// Assay quality control as rules (SPEC 13: golem's first expert system). From the open table's control samples: a
// certified standard more than 3 SD from its certified value fails (1-3s), and two results in a batch beyond 2 SD on the
// same side fail together (2-2s, Westgard); a blank above its limit is contamination; a duplicate pair whose half
// absolute relative difference (HARD) is above the threshold is poor precision. Those facts chain (logic.js) to a verdict
// per batch — suspect, to review, passing, or unchecked when it holds no standard — each with the rules that led to it.
// The certified values, the blank limit and the duplicate threshold are read from the table when it has them
// ("expected", "sd" columns) and asked for when it does not; nothing is assumed. A synthetic QC table ships to try it.
import { S, tool, frame, noun, fmt } from './core.js';
import { infer, proofOf } from './logic.js';
import { numberAsk } from './forms.js';

/* ── the sample: six synthetic batches, labelled as such ─────── */
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function qcSample() {
  const r = rng(20261015), n = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()), rows = [];
  for (let b = 1; b <= 6; b++) {
    const batch = `B${String(b).padStart(2, '0')}`;
    for (let i = 1; i <= 12; i++) rows.push({ sample: `${batch}-${String(i).padStart(3, '0')}`, batch, type: 'sample', standard: null, cu: +(Math.exp(Math.log(0.4) + 0.6 * n())).toFixed(3), expected: null, sd: null, original: null });
    // the certified standard (STD-A: 0.500 % Cu, SD 0.020, as this synthetic sample declares it): B03 is planted 4 SD high
    rows.push({ sample: `${batch}-STD`, batch, type: 'standard', standard: 'STD-A', cu: +(b === 3 ? 0.5 + 4 * 0.02 : 0.5 + 0.02 * 0.8 * n()).toFixed(3), expected: 0.5, sd: 0.02, original: null });
    // a blank: B05 is planted contaminated
    rows.push({ sample: `${batch}-BLK`, batch, type: 'blank', standard: null, cu: b === 5 ? 0.031 : +(0.001 + 0.001 * r()).toFixed(4), expected: null, sd: null, original: null });
    // a duplicate of sample 4: B02 is planted imprecise
    const orig = rows.find(x => x.sample === `${batch}-004`);
    rows.push({ sample: `${batch}-DUP`, batch, type: 'duplicate', standard: null, cu: +(b === 2 ? orig.cu * 1.6 : orig.cu * (1 + 0.04 * n())).toFixed(3), expected: null, sd: null, original: orig.sample });
  }
  return { name: 'qc-sample.csv', source: 'sample', hash: 'qc-sample', rows, roles: {},
    cols: [{ name: 'sample', type: 'categorical' }, { name: 'batch', type: 'categorical' }, { name: 'type', type: 'categorical' }, { name: 'standard', type: 'categorical' }, { name: 'cu', type: 'numeric', unit: '%', analyte: 'Cu' }, { name: 'expected', type: 'numeric', unit: '%' }, { name: 'sd', type: 'numeric', unit: '%' }, { name: 'original', type: 'categorical' }] };
}

/* ── reading the table: which columns say what ──────────────── */
const KIND = [['standard', /^(?:std|standard|crm|srm|certified|ref|reference)s?$/i], ['blank', /^(?:blk|blank|field blank|pulp blank|coarse blank)s?$/i], ['duplicate', /^(?:dup|duplicate|field dup(?:licate)?|pulp dup(?:licate)?|coarse dup(?:licate)?|repeat|replicate)s?$/i]];
const kindOf = v => { if (v == null) return null; const s = String(v).trim(); for (const [k, re] of KIND) if (re.test(s)) return k; return null; };
const colBy = (t, re, not = []) => t.cols.find(c => re.test(c.name) && !not.includes(c.name));
export function qcColumns(t) {
  const type = t.cols.find(c => c.type !== 'numeric' && t.rows.some(r => kindOf(r[c.name])));
  const batch = colBy(t, /^(?:batch|job|lab_?job|certificate|cert(?:_no|ificate_no)?|work_?order|despatch|dispatch)$/i);
  const std = colBy(t, /^(?:standard|std_?id|std|crm|crm_?id|reference|ref_?id|standard_?id)$/i, [type && type.name]);
  const id = colBy(t, /^(?:sample|sample_?id|id|sample_?no|sample_?number)$/i);
  const orig = colBy(t, /^(?:original|parent|dup_?of|duplicate_?of|primary|primary_?id|pair|original_?id)$/i);
  const analytes = t.cols.filter(c => c.type === 'numeric' && (c.analyte || /^[a-z]{1,2}(?:_ppm|_pct|_ppb|_gpt)?$/i.test(c.name)) && !/^(?:expected|sd|from|to)$/i.test(c.name));
  return { type, batch, std, id, orig, analytes };
}
const expCol = (t, el) => colBy(t, new RegExp(`^(?:${el}_)?(?:expected|certified|cert|target|cert_?val(?:ue)?)$`, 'i'));
const sdCol = (t, el) => colBy(t, new RegExp(`^(?:${el}_)?(?:sd|std_?dev|stdev|sigma|1sd)$`, 'i'));

/* ── the rules ───────────────────────────────────────────────── */
const RULES = [
  { name: '1-3s: a standard more than 3 SD from its certified value fails', head: { rel: 'std_fail', args: ['B'] }, body: [{ rel: 'over3', args: ['B', 'R'] }] },
  { name: '2-2s: two standards beyond 2 SD on the same side in a batch fail', head: { rel: 'std_fail', args: ['B'] }, body: [{ rel: 'pair2s', args: ['B', 'R'] }] },
  { name: 'a blank above its limit means contamination', head: { rel: 'contaminated', args: ['B'] }, body: [{ rel: 'blank_high', args: ['B', 'R'] }] },
  { name: 'a duplicate pair above the threshold means poor precision', head: { rel: 'imprecise', args: ['B'] }, body: [{ rel: 'dup_far', args: ['B', 'R'] }] },
  { name: 'a failed standard makes the batch suspect', head: { rel: 'suspect', args: ['B'] }, body: [{ rel: 'std_fail', args: ['B'] }] },
  { name: 'contamination makes the batch suspect', head: { rel: 'suspect', args: ['B'] }, body: [{ rel: 'contaminated', args: ['B'] }] },
  { name: 'poor precision puts the batch to review', head: { rel: 'review', args: ['B'] }, body: [{ rel: 'imprecise', args: ['B'] }] }
];
const SAID = { over3: 'standard', pair2s: 'standards', blank_high: 'blank', dup_far: 'duplicate' };

tool({
  name: 'qaqc', pre: ['table'],
  skill: { group: 'Table', title: 'Assay quality control', on: 'rules · logic.js', about: 'The open table\'s standards, blanks and duplicates checked by rules (1-3s and 2-2s on certified standards, blank limits, duplicate HARD) chained to a verdict per batch, each with its reasons. Certified values, limits and thresholds come from the table or are asked; nothing is assumed. "open the qc sample" has a synthetic one to try.', examples: ['open the qc sample', 'check the qc', 'check the qc for cu'] },
  topic: () => ['QA/QC', 2],
  run: a => {
    const t = S.table, read = ['check the QC of', { v: t.name }, ...(a.el ? ['for', { v: a.el }] : [])];
    const q = qcColumns(t);
    if (!q.type) return { read, body: [{ t: 'note', kind: 'err', text: `${t.name} has no column that marks standards, blanks or duplicates (values like "std", "blank", "dup"). I check control samples only where the table says which they are.` }], trace: ['no QC type column'] };
    if (!q.batch) return { read, body: [{ t: 'note', kind: 'err', text: `${t.name} has no batch column (batch, job, certificate), so I cannot say which results each control sample vouches for.` }], trace: ['no batch column'] };
    const els = q.analytes.map(c => c.name); const el = a.el && els.find(e => e.toLowerCase() === a.el.toLowerCase()) || (els.length === 1 ? els[0] : null);
    if (!el) return { read, body: [{ t: 'kv', rows: [['analytes', els.join(', ') || 'none']] }], ask: { prompt: 'Check the QC for which element?', options: els.map(e => ({ label: e, value: e })), set: (x, v) => { x.el = v; } }, trace: ['which element'] };
    const rows = t.rows.map((r, i) => ({ r, i, k: kindOf(r[q.type.name]), b: String(r[q.batch.name]) }));
    const stds = rows.filter(x => x.k === 'standard'), blanks = rows.filter(x => x.k === 'blank'), dups = rows.filter(x => x.k === 'duplicate');
    const stdName = x => q.std && x.r[q.std.name] != null ? String(x.r[q.std.name]) : 'the standard';
    // certified values: from the table's columns, else asked, one standard at a time
    const ec = expCol(t, el), sc = sdCol(t, el), certOf = s => { const row = stds.find(x => stdName(x) === s && ec && sc && x.r[ec.name] != null && x.r[sc.name] != null); return row ? [row.r[ec.name], row.r[sc.name], 'the table'] : a.cert && a.cert[s] ? [...a.cert[s], 'given'] : null; };
    for (const s of [...new Set(stds.map(stdName))]) if (!certOf(s)) return { read, body: [{ t: 'kv', rows: [['standards', [...new Set(stds.map(stdName))].join(', ')]] }],
      ask: { prompt: `Certified ${el} value of ${s}, and its SD, as on its certificate (as "0.5 ± 0.02")?`, options: [], parse: v => { const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:±|\+\/-|\+-|sd|,)\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(v); return m ? [+m[1].replace(',', '.'), +m[2].replace(',', '.')] : null; }, set: (x, v) => { x.cert = { ...(x.cert || {}), [s]: v }; } }, trace: [`certified value of ${s}: not in the table`] };
    if (blanks.length && a.blankLimit == null) return { read, body: [{ t: 'sub', text: `${blanks.length} blanks. The limit depends on the method's detection limit; it is yours to set.` }], ask: { ...numberAsk(`Blank limit for ${el}, in the column's unit (above it, a blank is contaminated)?`, { min: 0 }), set: (x, v) => { x.blankLimit = v; } }, trace: ['blank limit: asked'] };
    if (dups.length && q.orig && q.id && a.hard == null) return { read, body: [{ t: 'sub', text: `${dups.length} duplicates. Usual HARD limits are about 10 % for pulp and 20 % for field duplicates.` }], ask: { ...numberAsk('Duplicate threshold: the HARD, in percent, above which a pair is poor?', { offer: [{ label: '10 (pulp duplicates)', value: 10 }, { label: '20 (field duplicates)', value: 20 }], min: 0, max: 100 }), set: (x, v) => { x.hard = v; } }, trace: ['duplicate threshold: asked'] };
    // the facts, numerically, then the rules
    const facts = [], notes = {}, say = (rel, b, i, text) => { facts.push({ rel, args: [b, String(i)], said: i }); notes[i] = text; };
    const zs = stds.map(x => { const [e, sd] = certOf(stdName(x)), v = x.r[el]; return { ...x, z: v == null ? null : (v - e) / sd, e, sd, v }; });
    for (const x of zs) if (x.z != null && Math.abs(x.z) > 3) say('over3', x.b, x.i, `${stdName(x)} in ${x.b}: ${fmt(x.v, 4)} against ${fmt(x.e, 4)} ± ${fmt(x.sd, 3)}, z = ${fmt(x.z, 3)}`);
    const byBatch = {}; for (const x of zs) (byBatch[x.b] = byBatch[x.b] || []).push(x);
    for (const [b, xs] of Object.entries(byBatch)) for (let j = 1; j < xs.length; j++) { const p = xs[j - 1], c = xs[j]; if (p.z != null && c.z != null && Math.abs(p.z) > 2 && Math.abs(c.z) > 2 && Math.sign(p.z) === Math.sign(c.z) && Math.abs(c.z) <= 3) say('pair2s', b, c.i, `two ${stdName(c)} results in ${b} beyond 2 SD, the same side: z = ${fmt(p.z, 3)} and ${fmt(c.z, 3)}`); }
    for (const x of blanks) if (x.r[el] != null && x.r[el] > a.blankLimit) say('blank_high', x.b, x.i, `blank ${q.id ? x.r[q.id.name] : `row ${x.i + 1}`} in ${x.b}: ${fmt(x.r[el], 4)}, above the limit of ${fmt(a.blankLimit, 4)}`);
    const hards = [];
    if (q.orig && q.id) for (const x of dups) { const o = t.rows.find(r => r[q.id.name] === x.r[q.orig.name]); if (!o || o[el] == null || x.r[el] == null || o[el] + x.r[el] === 0) continue; const h = 100 * Math.abs(x.r[el] - o[el]) / (o[el] + x.r[el]); hards.push(h); if (h > a.hard) say('dup_far', x.b, x.i, `duplicate ${x.r[q.id.name]} of ${o[q.id.name]} in ${x.b}: ${fmt(o[el], 4)} and ${fmt(x.r[el], 4)}, HARD ${fmt(h, 3)} %`); }
    const known = infer(facts, RULES), batches = [...new Set(rows.map(x => x.b))];
    const verdict = b => known.has(`suspect(${b})`) ? 'suspect' : known.has(`review(${b})`) ? 'to review' : !zs.some(x => x.b === b) ? 'unchecked: no standard' : 'passing';
    const why = b => { const k = known.has(`suspect(${b})`) ? `suspect(${b})` : known.has(`review(${b})`) ? `review(${b})` : null; if (!k) return []; return proofOf(known, k).map(s => s.rule ? s.rule : notes[s.said]).filter(Boolean); };
    const counts = { suspect: 0, 'to review': 0, passing: 0, unchecked: 0 }; batches.forEach(b => { const v = verdict(b); counts[v.startsWith('unchecked') ? 'unchecked' : v]++; });
    const body = [{ t: 'big', v: `${counts.suspect} suspect`, unit: `of ${batches.length} batches · ${counts['to review']} to review · ${counts.passing} passing${counts.unchecked ? ` · ${counts.unchecked} unchecked` : ''}` },
      { t: 'table', head: ['batch', 'verdict', 'because'], tr: [1], rows: batches.map(b => [b, verdict(b), why(b).filter((_, i, a) => i < a.length - 1 || !/makes the batch|puts the batch/.test(_)).join('; ') || (verdict(b) === 'passing' ? 'standards within 2 SD, blanks under the limit, duplicates within the threshold' : '')]) },
      { t: 'kv', rows: [['standards', zs.length ? `${zs.length}, mean z ${fmt(zs.reduce((s, x) => s + (x.z || 0), 0) / zs.length, 3)} (bias ${fmt(100 * zs.reduce((s, x) => s + (x.v - x.e) / x.e, 0) / zs.length, 3)} %)` : 'none'], ['blanks', blanks.length ? `${blanks.length}, limit ${fmt(a.blankLimit, 4)}` : 'none'], ['duplicates', hards.length ? `${hards.length} pairs, median HARD ${fmt([...hards].sort((x, y) => x - y)[Math.floor(hards.length / 2)], 3)} %, limit ${fmt(a.hard, 3)} %` : dups.length ? `${dups.length}, but no column links them to their originals` : 'none'], ['certified values', [...new Set(stds.map(stdName))].map(s => { const c = certOf(s); return `${s}: ${fmt(c[0], 4)} ± ${fmt(c[1], 3)} (${c[2]})`; }).join('; ') || 'none']] },
      ...(t.source === 'sample' ? [{ t: 'note', text: 'This is the synthetic QC sample: its batches, values and certified standard are generated, with failures planted to show the rules.' }] : []),
      { t: 'src', text: `${RULES.length} rules (Westgard 1-3s and 2-2s, blank limit, duplicate HARD), chained by logic.js` }];
    return { read, value: counts.suspect, body, trace: [`columns: type ${q.type.name}, batch ${q.batch.name}${q.std ? `, standard ${q.std.name}` : ''}${q.orig ? `, original ${q.orig.name}` : ''}`, `${facts.length} findings → ${known.size} facts by ${RULES.length} rules`] };
  }
});
// "check the qc", "check the qc for cu", "qaqc", "check the standards and blanks"
noun({ type: 'devtable', words: { qc: ['the qc sample', 'qc sample', 'qc-sample.csv', 'the qc samples'] }, words_pt: { qc: ['a amostra de qc', 'qc-sample.csv'] } });
frame({
  name: 'qaqc', label: 'QA/QC', words: ['check the qc', 'check qc', 'qaqc', 'qa/qc', 'check the qa/qc', 'check the standards', 'check the standards and blanks', 'check the control samples', 'run the qc checks', 'quality control'], theme: [], required: [],
  roles: { for: { preps: ['for', 'of', 'on'], types: ['variable'] } },
  words_pt: ['confere o qa/qc', 'verifica o qa/qc', 'checa os padrões', 'controle de qualidade'], label_pt: 'QA/QC',
  bind: c => ({ tool: 'qaqc', args: c.roles.for && c.roles.for[0] && c.roles.for[0].value ? { el: String(c.roles.for[0].value) } : {} })
});

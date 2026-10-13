// ⚠ VENDORED — DO NOT EDIT. @gcu/dispatch, built from ../auditable/ext/dispatch/src/ by its own build.
// Source of truth: gentropic/auditable ext/dispatch (local clone: ../auditable). Re-vendor by copying
// ext/dispatch/index.js here after 'node ext/dispatch/build.js'. golem uses the grammar rung only:
// createEngine, makeSession, ENGLISH, PORTUGUESE. At auditable ff2d3dfe.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/dispatch — Session-trained natural-language → tool-call dispatch: a Snips-shaped resolver (averaged-perceptron intent + CRF-class slot tagger + gazetteers + deterministic per-kind assemblers) that trains IN THE BROWSER from the host session's own vocabulary in under a second. Tools are declarative (ten kinds) and a grammar rung (clause: case-grammar frames over an Earley chart with costed repairs, en + pt-BR) reads controlled commands before the learners see them; no shipped model, no network, explainable per decision — refusals return empty calls so the host degrades into its command palette. Born from an incubator where this beat a 26M finetuned transformer 50/52 to 3/24 on a frozen yardstick.

// ── src/vocab.js ──

// @gcu/dispatch — session vocabulary + locale banks. NOTHING here is a
// fixture: the host derives the vocabulary from its live session (columns,
// categories, layers), so the dispatcher speaks THIS project's language and
// is rebuilt when the project changes. The locale bank carries the
// language-level closed classes (operators, units, show/hide verbs,
// word-numbers, refusal seeds); `pt-BR` is a future bank, not a feature.

const LOCALES = {
  en: {
    ops: {
      '>': ['above', 'over', 'greater than', 'more than', 'higher than', '>'],
      '>=': ['at least', 'no less than', '>='],
      '<': ['below', 'under', 'less than', 'lower than', '<'],
      '<=': ['at most', 'up to', '<='],
      '=': ['equal to', 'exactly', '=', '=='],
    },
    opWord: { above: '>', over: '>', greater: '>', more: '>', higher: '>', least: '>=', below: '<', under: '<', less: '<', lower: '<', most: '<=', up: '<=', equal: '=', exactly: '=', different: '!=', '>': '>', '<': '<', '=': '=' },
    units: ['percent', '%', 'm', 'meter', 'meters', 'metre', 'metres'],
    hideWords: ['hide', 'remove', 'off', 'rid', 'invisible', 'drop', 'take', 'switch'],
    showWords: ['show', 'back', 'unhide', 'visible', 'on', 'see', 'want'],
    negators: ['don', "don't", 'dont', 'not', 'no'],
    wordNums: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 },
    rangeWords: ['to', 'and', 'between', '-'],
    politeSuffixes: [' please', ' for me'],
    politePrefixes: ['can you '],
    refusals: [
      'what is the average grade', 'how many records are there', 'undo that',
      'save everything', 'what does this column mean', 'email this to the team',
      'close the program', 'rename the project', 'delete everything',
      'make it prettier', 'help me', 'what can you do',
    ],
  },
};

// element/assay lexicon — free synonyms hosts get for commonly named columns
const ELEMENT_LEX = {
  FE: ['iron', 'Fe', 'the iron grade', 'ferro'],
  SIO2: ['silica', 'SiO2', 'the silica'],
  P: ['phosphorus', 'phos'],
  LOI: ['loss on ignition'],
  AL2O3: ['alumina'],
  MN: ['manganese'],
  AU: ['gold', 'Au', 'the gold grade'],
  CU: ['copper', 'Cu'],
  S: ['sulfur', 'the sulfur'],
  MGO: ['MgO', 'magnesia'],
  CAO: ['CaO', 'lime'],
  ZN: ['zinc', 'Zn'],
  NI: ['nickel', 'Ni'],
  AG: ['silver', 'Ag'],
  SG: ['density', 'specific gravity', 'the density'],
  DENS: ['density', 'the density'],
};

// deriveVocab — the host's session → synonym pools.
//   numCols:   ['FE', ...] or { FE: { syn?, lo?, hi?, dec? } }
//   catCols:   { LITO: ['lithology', 'litho'], ... }        (column-name synonyms)
//   catValues: { LITO: { HEMATITE: ['hematite'], ... } }    (per-column value synonyms)
//   layers:    { 'topo.tif': ['the topography', 'topo'], ... }
//   idCols:    ['BHID']                                     (free-string id columns)
function deriveVocab({ numCols = [], catCols = {}, catValues = {}, layers = {}, idCols = [], locale = 'en', aliases = {} } = {}) {
  const L = LOCALES[locale];
  if (!L) throw new Error(`unknown locale ${locale}`);
  const nc = {};
  const entries = Array.isArray(numCols) ? numCols.map((n) => [n, {}]) : Object.entries(numCols);
  for (const [name, cfg] of entries) {
    const syn = [name, ...(cfg.syn || []), ...(ELEMENT_LEX[name.toUpperCase()] || []), ...(aliases[name] || [])];
    nc[name] = { syn: [...new Set(syn)], lo: cfg.lo ?? 0.1, hi: cfg.hi ?? 100, dec: cfg.dec ?? 1 };
  }
  const cc = {};
  for (const [name, syns] of Object.entries(catCols)) cc[name] = [...new Set([name, ...(syns || []), ...(aliases[name] || [])])];
  const cv = {};
  for (const [col, vals] of Object.entries(catValues)) {
    cv[col] = {};
    for (const [v, syns] of Object.entries(vals)) cv[col][v] = [...new Set([...(syns && syns.length ? syns : [v.toLowerCase()]), ...(aliases[v] || [])])];
  }
  const ly = {};
  for (const [file, syns] of Object.entries(layers)) ly[file] = [...new Set([file, ...(syns || []), ...(aliases[file] || [])])];
  return { numCols: nc, catCols: cc, catValues: cv, layers: ly, idCols, locale, L };
}

// ── src/text.js ──

// @gcu/dispatch — text primitives: tokenizer, token shapes, gazetteer spans.
const tokenize = (q) => (q.toLowerCase().match(/[a-z0-9][a-z0-9.\-]*|[^\sa-z0-9]/gi) || []).map((t) => t.replace(/[.,;!?]+$/, '') || t);

const NUM_RE = /^[0-9]+(\.[0-9]+)?$/;
const ID_RE = /^[a-z]+-?[0-9]+$/;
const shape = (t) => (NUM_RE.test(t) ? (t.includes('.') ? 'dec' : 'int') : ID_RE.test(t) ? 'id' : /[0-9]/.test(t) ? 'alnum' : 'alpha');
const num = (t) => (String(t).includes('.') ? +t : parseInt(t, 10));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// build a phrase→value map (multiword synonyms as token-joined keys)
function gazMap(entries) {
  const m = new Map();
  for (const [phrase, val] of entries) m.set(tokenize(phrase).join(' '), val);
  return m;
}
// longest-match spans of a gazetteer map over tokens → [{i, len, val}]
function gazSpans(toks, map) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    for (let len = Math.min(4, toks.length - i); len >= 1; len--) {
      const key = toks.slice(i, i + len).join(' ');
      if (map.has(key)) { out.push({ i, len, val: map.get(key) }); i += len - 1; break; }
    }
  }
  return out;
}
// seeded rng (no Date.now/Math.random — everything reproducible)
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffled(arr, seed) { const r = mulberry32(seed), out = [...arr]; for (let i = out.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; } return out; }
const normText = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── src/features.js ──

// @gcu/dispatch — featurization over a SESSION context. createContext(vocab)
// builds the gazetteers once per session; everything downstream (training,
// inference) reads them through the context, so a new project = a new
// context = a dispatcher fluent in the new vocabulary.

function createContext(vocab) {
  const colEntries = [], catEntries = [], litEntries = [], layEntries = [], opEntries = [];
  for (const [col, c] of Object.entries(vocab.numCols)) for (const s of c.syn) colEntries.push([s, col]);
  for (const [col, syns] of Object.entries(vocab.catCols)) for (const s of syns) catEntries.push([s, col]);
  for (const [col, vals] of Object.entries(vocab.catValues)) for (const [v, syns] of Object.entries(vals)) for (const s of syns) litEntries.push([s, { col, value: v }]);
  for (const [file, syns] of Object.entries(vocab.layers)) for (const s of syns) layEntries.push([s, file]);
  for (const [op, words] of Object.entries(vocab.L.ops)) for (const w of words) opEntries.push([w, op]);
  const gaz = {
    col: gazMap(colEntries), cat: gazMap(catEntries), lit: gazMap(litEntries),
    layer: gazMap(layEntries), op: gazMap(opEntries),
  };
  const unitSet = new Set(vocab.L.units);

  function tokenFeatures(toks) {
    const colS = gazSpans(toks, gaz.col), catS = gazSpans(toks, gaz.cat), litS = gazSpans(toks, gaz.lit), opS = gazSpans(toks, gaz.op), layS = gazSpans(toks, gaz.layer);
    const mark = (spans, tag) => { const m = new Array(toks.length).fill(null); for (const s of spans) for (let k = 0; k < s.len; k++) m[s.i + k] = `${tag}:${typeof s.val === 'object' ? s.val.value : s.val}`; return m; };
    const colM = mark(colS, 'col'), catM = mark(catS, 'cat'), litM = mark(litS, 'lit'), opM = mark(opS, 'op'), layM = mark(layS, 'lay');
    return toks.map((t, i) => {
      const f = [`w=${t}`, `sh=${shape(t)}`, `pw=${toks[i - 1] || '^'}`, `nw=${toks[i + 1] || '$'}`];
      if (colM[i]) f.push('inCol', colM[i]);
      if (catM[i]) f.push('inCat', catM[i]);
      if (litM[i]) f.push('inLit', litM[i]);
      if (opM[i]) f.push('inOp', opM[i]);
      if (layM[i]) f.push('inLay', layM[i]);
      if (unitSet.has(t)) f.push('unit');
      if (colM[i - 1]) f.push('pCol');
      if (opM[i - 1]) f.push('pOp');
      if (litM[i - 1]) f.push('pLit');
      if (NUM_RE.test(toks[i - 1] || '')) f.push('pNum');
      if (NUM_RE.test(toks[i + 1] || '')) f.push('nNum');
      if (opM[i + 1]) f.push('nOp');
      return f;
    });
  }

  function intentFeatures(toks) {
    const per = tokenFeatures(toks);
    const f = new Map();
    const add = (k, v = 1) => f.set(k, (f.get(k) || 0) + v);
    let nNum = 0, hasOp = 0, hasCol = 0, hasLay = 0, hasLit = 0, hasCat = 0, hasUnit = 0;
    for (let i = 0; i < toks.length; i++) {
      add(`u=${toks[i]}`);
      if (i) add(`b=${toks[i - 1]}_${toks[i]}`);
      for (const x of per[i]) if (!x.startsWith('w=') && !x.startsWith('pw=') && !x.startsWith('nw=')) add(`t:${x}`, 0.5);
      if (NUM_RE.test(toks[i])) nNum++;
      if (per[i].includes('inOp')) hasOp = 1;
      if (per[i].includes('inCol')) hasCol = 1;
      if (per[i].includes('inLay')) hasLay = 1;
      if (per[i].includes('inLit')) hasLit = 1;
      if (per[i].includes('inCat')) hasCat = 1;
      if (per[i].includes('unit')) hasUnit = 1;
    }
    // structural signals, weighted up — the hand-computed nonlinearity that
    // makes a single-layer perceptron sufficient (Minsky honored, routed around)
    if (hasOp && hasCol && nNum) add('has:cmp', 2);
    if (hasOp) add('has:op', 1.5);
    if (hasCol) add('has:col', 1.5);
    if (hasLay) add('has:lay', 2);
    if (hasLit) add('has:lit', 2);
    if (hasCat) add('has:cat', 1.5);
    add(`has:nums${Math.min(nNum, 3)}`, 1.5);
    if (hasUnit) add('has:unit', 1.5);
    add('len', Math.min(toks.length, 12) / 12);
    return f;
  }

  return { vocab, gaz, tokenFeatures, intentFeatures, tokenize };
}

// ── src/kinds.js ──

// @gcu/dispatch — the KIND implementations: the plugin boundary. A tool is a
// DECLARATION ({name, kind, ...kind fields}); each kind owns three verbs:
//   render(tool, ctx, R)              → {q, args}   (corpus generation)
//   align(toks, tags, args, ctx, tool) → bool        (training labels, answer-first)
//   assemble(tool, ctx, toks, tags)    → args | null  (inference)
// Assemblers emit the tool's CANONICAL argument shape (clauses arrays, real
// booleans) — hosts get WebMCP-shaped calls, not a model-era flattening.

// ── shared render helpers (R = { rnd, pick, maybe }) ──
const mkR = (rnd) => ({ rnd, pick: (arr) => arr[(rnd() * arr.length) | 0], maybe: (p) => rnd() < p });
const fill = (frame, slots) => frame.replace(/\{(\w+)\}/g, (m, k) => (slots[k] !== undefined ? slots[k] : m));
const politeWrap = (q, R, L) => {
  const k = R.rnd();
  return k < 0.55 ? q : k < 0.7 ? q + L.politeSuffixes[0] : k < 0.8 ? L.politePrefixes[0] + q : k < 0.9 ? cap(q) + '.' : q + (L.politeSuffixes[1] || '');
};
const numVal = (c, R) => { const v = c.lo + R.rnd() * (c.hi - c.lo); return +v.toFixed(c.dec === 1 && R.maybe(0.5) ? 0 : c.dec); };
const pickNumCol = (vocab, R) => { const names = Object.keys(vocab.numCols); const col = R.pick(names); return { col, cfg: vocab.numCols[col] }; };
const catColOf = (tool, vocab) => tool.column || Object.keys(vocab.catValues)[0];

// ── shared align helpers ──
const mkClaim = (toks, tags) => ({
  claim(start, len, tag) { for (let k = 0; k < len; k++) if (tags[start + k] !== 'O') return false; for (let k = 0; k < len; k++) tags[start + k] = tag; return true; },
  claimGaz(map, want, tag, matchFn) {
    for (const s of gazSpans(toks, map)) {
      const hit = matchFn ? matchFn(s.val) : s.val === want;
      if (hit && tags[s.i] === 'O') { for (let k = 0; k < s.len; k++) tags[s.i + k] = tag; return true; }
    }
    return false;
  },
  claimNum(v, tag) {
    for (let i = 0; i < toks.length; i++) if (tags[i] === 'O' && /^[0-9.]+$/.test(toks[i]) && Math.abs(+toks[i] - +v) < 1e-9) { tags[i] = tag; return i; }
    return -1;
  },
});

// ── shared assemble helpers ──
function groupTags(toks, tags) {
  const groups = [];
  for (let i = 0; i < toks.length; i++) {
    if (tags[i] === 'O') continue;
    const last = groups[groups.length - 1];
    if (last && last.tag === tags[i] && last.end === i - 1) { last.end = i; last.words.push(toks[i]); }
    else groups.push({ tag: tags[i], start: i, end: i, words: [toks[i]] });
  }
  return (tag) => groups.filter((x) => x.tag === tag);
}
const normFrom = (map) => (words) => { for (let l = words.length; l >= 1; l--) for (let i = 0; i + l <= words.length; i++) { const k = words.slice(i, i + l).join(' '); if (map.has(k)) return map.get(k); } return null; };
const opFromGroup = (words, L) => {
  if (words.includes('no') && words.includes('less')) return '>=';
  if (words.includes('at') && words.includes('least')) return '>=';
  if (words.includes('at') && words.includes('most')) return '<=';
  if (words.includes('up') && words.includes('to')) return '<=';
  if (words.includes('>') && words.includes('=')) return '>=';   // the tokenizer splits >= into '>' '='
  if (words.includes('<') && words.includes('=')) return '<=';
  for (const w of words) if (L.opWord[w]) return L.opWord[w];
  return null;
};
const showHide = (toks, L) => {
  const H = new Set(L.hideWords), S = new Set(L.showWords), N = new Set(L.negators);
  let hide = toks.some((t) => H.has(t)), show = toks.some((t) => S.has(t));
  if (toks.some((t) => N.has(t))) { const t2 = hide; hide = show; show = t2; }
  return hide && !show ? 'hide' : show ? 'show' : 'hide';
};
const firstNum = (g, toks) => {
  for (const tag of ['VAL', 'POS', 'THICK']) { const v = g(tag)[0]; if (v && Number.isFinite(num(v.words[0]))) return num(v.words[0]); }
  const t = toks.find((x) => NUM_RE.test(x));
  return t !== undefined ? num(t) : null;
};
const lexFind = (toks, values) => {
  for (const [key, spec] of Object.entries(values)) {
    const syns = Array.isArray(spec) ? spec : spec.syn || [];
    for (const s of [key, ...syns]) {
      const seq = tokenize(s);
      for (let i = 0; i + seq.length <= toks.length; i++) if (seq.every((w, k) => toks[i + k] === w)) return key;
    }
  }
  return null;
};

// ── the kinds ──
const KINDS = {
  // {nouns:[...], rowRegister?:bool, idColumn?, idPrefix?, benchRange? (cat col
  //  with numeric levels, e.g. BENCH), depthRange? ({from, to})}
  'comparison-filter': {
    defaultTarget: 120,
    render(tool, ctx, R) {
      const { vocab } = ctx, L = vocab.L;
      const noun = R.pick(tool.nouns);
      const catCol = Object.keys(vocab.catValues)[0];
      const cats = catCol ? vocab.catValues[catCol] : null;
      const opPhrase = (op) => R.pick(L.ops[op]);
      const clPhrase = (syn, op, v) => R.pick([`${syn} ${opPhrase(op)} ${v}`, `${syn} is ${opPhrase(op)} ${v}`, `the ${syn} ${opPhrase(op)} ${v}`]);
      const kind = R.rnd();
      if (tool.idColumn && kind < 0.12) {
        const id = `${tool.idPrefix || 'ID-'}${String(1 + ((R.rnd() * 120) | 0)).padStart(3, '0')}`;
        return { q: R.pick([`samples from hole ${id}`, `only hole ${id}`, `show the intervals of ${id}`, `rows from ${id}`]), args: { clauses: [{ column: tool.idColumn, op: '=', value: id }], join: 'and' } };
      }
      if (kind < 0.35) {
        const { col, cfg } = pickNumCol(vocab, R);
        const syn = R.pick(cfg.syn), op = R.pick(Object.keys(L.ops)), v = numVal(cfg, R);
        const unit = R.maybe(0.2) ? ' ' + R.pick(['percent', '%']) : '';
        const q = R.pick([`filter ${noun} with ${clPhrase(syn, op, v)}${unit}`, `show ${noun} where ${clPhrase(syn, op, v)}${unit}`, `only ${noun} with ${clPhrase(syn, op, v)}${unit}`, `keep ${clPhrase(syn, op, v)}${unit}`, `filter the ${syn} ${opPhrase(op)} ${v}${unit}`, `${clPhrase(syn, op, v)}${unit}`]);
        return { q, args: { clauses: [{ column: col, op, value: v }], join: 'and' } };
      }
      if (cats && kind < 0.5) {
        const v = R.pick(Object.keys(cats)), syn = R.pick(cats[v]);
        const colSyn = R.pick((vocab.catCols && vocab.catCols[catCol]) || [catCol]);
        return { q: R.pick([`filter ${noun} to ${syn}`, `only ${syn} ${noun}`, `keep just the ${syn}`, `${colSyn} is ${syn}`, `${colSyn} = ${syn}`]), args: { clauses: [{ column: catCol, op: '=', value: v }], join: 'and' } };
      }
      if (kind < 0.68) {
        if (tool.depthRange) {
          const a = 10 * ((2 + R.rnd() * 10) | 0), b = a + 10 * ((2 + R.rnd() * 8) | 0);
          return { q: R.pick([`intervals from ${a} to ${b} meters`, `samples between ${a} and ${b} m depth`]), args: { clauses: [{ column: tool.depthRange.from, op: '>=', value: a }, { column: tool.depthRange.to, op: '<=', value: b }], join: 'and' } };
        }
        if (tool.benchRange) {
          const lv = tool.benchLevels || [940, 960, 980, 1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140];
          const i = (R.rnd() * (lv.length - 3)) | 0, a = lv[i], b = lv[i + 1 + ((R.rnd() * (lv.length - i - 2)) | 0)];
          const bn = tool.benchRange.toLowerCase();
          return { q: R.pick([`${tool.nouns[0]} from ${bn} ${a} to ${bn} ${b}`, `${bn}es ${a} to ${b}`, `between ${bn} ${a} and ${b}`, `${tool.nouns[0]} between ${bn} ${a} and ${bn} ${b}`, `from ${bn} ${a} to ${b}`, `${bn} ${a} to ${bn} ${b}`, `keep the ${bn}es from ${a} to ${b}`, `only ${bn}es ${a} to ${b}`]), args: { clauses: [{ column: tool.benchRange, op: '>=', value: a }, { column: tool.benchRange, op: '<=', value: b }], join: 'and' } };
        }
      }
      const A = pickNumCol(vocab, R);
      let B = pickNumCol(vocab, R), guard = 0;
      while (B.col === A.col && guard++ < 5) B = pickNumCol(vocab, R);
      const aOp = R.pick(Object.keys(L.ops)), aV = numVal(A.cfg, R), aSyn = R.pick(A.cfg.syn);
      const catB = cats && R.maybe(0.3);
      const bCl = catB ? { column: catCol, op: '=', value: R.pick(Object.keys(cats)) } : { column: B.col, op: R.pick(Object.keys(L.ops)), value: numVal(B.cfg, R) };
      const bSyn = catB ? R.pick(cats[bCl.value]) : R.pick(B.cfg.syn);
      const bPhrase = catB ? R.pick([`only ${bSyn} ${noun}`, `${bSyn} only`]) : clPhrase(bSyn, bCl.op, bCl.value);
      const join = R.maybe(0.25) ? 'or' : 'and';
      const q = R.pick([`show ${noun} with ${clPhrase(aSyn, aOp, aV)} ${join} ${bPhrase}`, `filter ${noun} with ${clPhrase(aSyn, aOp, aV)} ${join} ${bPhrase}`, `${clPhrase(aSyn, aOp, aV)} ${join} ${bPhrase}`, ...(catB ? [`only ${bSyn}${tool.rowRegister ? ' samples' : ' blocks'} with ${clPhrase(aSyn, aOp, aV)}`] : [])]);
      return { q, args: { clauses: [{ column: A.col, op: aOp, value: aV }, bCl], join } };
    },
    align(toks, tags, args, ctx, tool) {
      const c = mkClaim(toks, tags), L = ctx.vocab.L;
      const cls = args.clauses;
      const isRange = cls.length === 2 && cls[0].column === cls[1].column && cls[0].op === '>=' && cls[1].op === '<=';
      const isDepth = tool.depthRange && cls.length === 2 && cls[0].column === tool.depthRange.from;
      for (const cl of cls) {
        if (ctx.vocab.catValues[cl.column]) { if (!c.claimGaz(ctx.gaz.lit, null, 'CAT', (v) => v.col === cl.column && v.value === cl.value)) return false; continue; }
        if (cl.column === tool.idColumn) { const i = toks.findIndex((t, k) => tags[k] === 'O' && t.toUpperCase() === String(cl.value).toUpperCase()); if (i < 0) return false; tags[i] = 'ID'; continue; }
        if (!isDepth) { if (!c.claimGaz(ctx.gaz.col, cl.column, 'COL') && !c.claimGaz(ctx.gaz.cat, cl.column, 'COL') && tags.indexOf('COL') < 0) return false; }
        if (c.claimNum(cl.value, 'VAL') < 0) return false;
        const opWords = L.ops[cl.op] || [];
        outer: for (const w of opWords) {
          const seq = tokenize(w);
          for (let i = 0; i + seq.length <= toks.length; i++) if (seq.every((s, k) => toks[i + k] === s && tags[i + k] === 'O')) { c.claim(i, seq.length, 'OP'); break outer; }
        }
      }
      if (isRange || isDepth) {
        const vIdx = tags.map((t, i) => (t === 'VAL' ? i : -1)).filter((i) => i >= 0);
        if (vIdx.length >= 2) for (let i = vIdx[0] + 1; i < vIdx[vIdx.length - 1]; i++) if (tags[i] === 'O' && ctx.vocab.L.rangeWords.includes(toks[i])) { tags[i] = 'RNG'; break; }
      }
      return true;
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags), L = ctx.vocab.L;
      const normCol = (w) => normFrom(ctx.gaz.col)(w) || normFrom(ctx.gaz.cat)(w);
      const clauses = [];
      const cols = g('COL'), ops = g('OP'), vals = g('VAL'), rngs = g('RNG');
      const usedV = new Set(), usedO = new Set();
      for (const c of cols) {
        const col = normCol(c.words);
        if (!col) continue;
        const free = () => vals.filter((v) => !usedV.has(v));
        const rng = rngs.find((r) => !r.used && free().some((v) => v.end < r.start) && free().some((v) => v.start > r.end));
        if (rng && free().length >= 2) {
          const v1 = free().filter((v) => v.end < rng.start).sort((a, b) => b.end - a.end)[0];
          const v2 = free().filter((v) => v.start > rng.end).sort((a, b) => a.start - b.start)[0];
          if (v1 && v2) {
            rng.used = true; usedV.add(v1); usedV.add(v2);
            clauses.push({ at: c.start, column: col, op: '>=', value: num(v1.words[0]) });
            clauses.push({ at: v2.start, column: col, op: '<=', value: num(v2.words[0]) });
            continue;
          }
        }
        const op = ops.filter((o) => !usedO.has(o)).sort((a, b) => Math.abs(a.start - c.end) - Math.abs(b.start - c.end))[0];
        const v = vals.filter((x) => !usedV.has(x) && x.start > c.end).sort((a, b) => a.start - b.start)[0]
          || vals.filter((x) => !usedV.has(x)).sort((a, b) => Math.abs(a.start - c.end) - Math.abs(b.start - c.end))[0];
        if (!v) continue;
        usedV.add(v); if (op) usedO.add(op);
        clauses.push({ at: c.start, column: col, op: (op && opFromGroup(op.words, L)) || '>', value: num(v.words[0]) });
      }
      for (const c of g('CAT')) { const hit = normFrom(ctx.gaz.lit)(c.words); if (hit) clauses.push({ at: c.start, column: hit.col, op: '=', value: hit.value }); }
      if (tool.idColumn) for (const c of g('ID')) clauses.push({ at: c.start, column: tool.idColumn, op: '=', value: c.words[0].toUpperCase() });
      if (tool.depthRange && !clauses.length) {
        const rng = rngs.find((r) => !r.used);
        const free = vals.filter((v) => !usedV.has(v));
        if (rng && free.length >= 2) {
          const v1 = free.filter((v) => v.end < rng.start).sort((a, b) => b.end - a.end)[0];
          const v2 = free.filter((v) => v.start > rng.end).sort((a, b) => a.start - b.start)[0];
          if (v1 && v2) {
            clauses.push({ at: v1.start, column: tool.depthRange.from, op: '>=', value: num(v1.words[0]) });
            clauses.push({ at: v2.start, column: tool.depthRange.to, op: '<=', value: num(v2.words[0]) });
          }
        }
      }
      if (!clauses.length) return null;
      clauses.sort((a, b) => a.at - b.at);
      const out = { clauses: clauses.map(({ at, ...cl }) => cl), join: clauses.length > 1 && toks.includes('or') ? 'or' : 'and' };
      return out;
    },
  },

  // {argName:'column', frames:['color by {col}',...], emptyFrames?:[...],
  //  optional?:bool, pools?:['numeric','categorical']}
  'column-pick': {
    defaultTarget: 100,
    render(tool, ctx, R) {
      const { vocab } = ctx;
      if (tool.optional && tool.emptyFrames && R.maybe(0.4)) return { q: R.pick(tool.emptyFrames), args: {} };
      const pools = tool.pools || ['numeric'];
      const names = [...(pools.includes('numeric') ? Object.keys(vocab.numCols) : []), ...(pools.includes('categorical') ? Object.keys(vocab.catCols) : [])];
      const col = R.pick(names);
      const syn = vocab.numCols[col] ? R.pick(vocab.numCols[col].syn) : R.pick(vocab.catCols[col]);
      return { q: fill(R.pick(tool.frames), { col: syn }), args: { [tool.argName || 'column']: col } };
    },
    align(toks, tags, args, ctx, tool) {
      const c = mkClaim(toks, tags);
      const col = args[tool.argName || 'column'];
      if (col === undefined) return true;
      return c.claimGaz(ctx.gaz.col, col, 'COL') || c.claimGaz(ctx.gaz.cat, col, 'COL');
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags);
      const c = g('COL')[0] || g('CAT')[0];
      const col = c && (normFrom(ctx.gaz.col)(c.words) || normFrom(ctx.gaz.cat)(c.words));
      if (col) return { [tool.argName || 'column']: col };
      return tool.optional ? {} : null;
    },
  },

  // {axes: {Z:[words], X:[words], Y:[words]}, posArg?, thickArg?}
  'axis-position': {
    defaultTarget: 120,
    render(tool, ctx, R) {
      const t = R.maybe(0.3) ? 5 * ((1 + R.rnd() * 10) | 0) : null;
      const th = t ? R.pick([` ${t} m thick`, ` ${t} meter thick`, `, ${t} meters thick`]) : '';
      const kind = R.rnd();
      const posArg = tool.posArg || 'position', thickArg = tool.thickArg || 'thickness';
      const mk = (axis, position, q) => ({ q, args: { axis, [posArg]: position, ...(t ? { [thickArg]: t } : {}) } });
      if (kind < 0.55) {
        const z = 900 + 20 * ((R.rnd() * 13) | 0) + R.pick([0, 5, 10, -5]);
        return mk('Z', z, R.pick([`section at elevation ${z}${th}`, `horizontal section at ${z}${th}`, `cut the model at elevation ${z}${th}`, `slice at ${z} elevation${th}`, `put a section on the ${z} elevation${th}`, `give me a${th} section at elevation ${z}`, `plan section at ${z}${th}`]));
      }
      if (kind < 0.8) {
        const x = 100 * ((30 + R.rnd() * 30) | 0);
        return mk('X', x, R.pick([`north-south section at easting ${x}${th}`, `section at easting ${x}${th}`, `cut at easting ${x}${th}`, `NS section on ${x} east${th}`]));
      }
      const y = 100 * ((70 + R.rnd() * 30) | 0);
      return mk('Y', y, R.pick([`east-west section at northing ${y}${th}`, `section at northing ${y}${th}`, `cut at northing ${y}${th}`, `EW section on ${y} north${th}`]));
    },
    align(toks, tags, args, ctx, tool) {
      const c = mkClaim(toks, tags);
      const thickArg = tool.thickArg || 'thickness', posArg = tool.posArg || 'position';
      if (args[thickArg] !== undefined && c.claimNum(args[thickArg], 'THICK') < 0) return false;
      return c.claimNum(args[posArg], 'POS') >= 0;
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags);
      const pos = g('POS')[0] || g('VAL')[0];
      if (!pos) return null;
      let axis = 'Z';
      outer: for (const t of toks) for (const [ax, words] of Object.entries(tool.axes)) if (words.includes(t)) { axis = ax; break outer; }
      const out = { axis, [tool.posArg || 'position']: num(pos.words[0]) };
      const th = g('THICK')[0];
      if (th) out[tool.thickArg || 'thickness'] = num(th.words[0]);
      return out;
    },
  },

  // {argName:'axis', axes:{X:[words],Y:[],Z:[]}, colArg?:'column',
  //  frames:['swath along {ax}'], colFrames:['swath of {col} along {ax}']}
  'axis-pick': {
    defaultTarget: 90,
    render(tool, ctx, R) {
      const axis = R.pick(Object.keys(tool.axes));
      const ax = R.pick(tool.axes[axis]);
      if (!tool.colArg || R.maybe(0.45)) return { q: fill(R.pick(tool.frames), { ax }), args: { [tool.argName || 'axis']: axis } };
      const { col, cfg } = pickNumCol(ctx.vocab, R);
      return { q: fill(R.pick(tool.colFrames), { ax, col: R.pick(cfg.syn) }), args: { [tool.argName || 'axis']: axis, [tool.colArg]: col } };
    },
    align(toks, tags, args, ctx, tool) {
      const c = mkClaim(toks, tags);
      if (tool.colArg && args[tool.colArg] !== undefined) return c.claimGaz(ctx.gaz.col, args[tool.colArg], 'COL');
      return true;
    },
    assemble(tool, ctx, toks, tags) {
      let axis = null;
      outer: for (const t of toks) for (const [ax, words] of Object.entries(tool.axes)) if (words.includes(t)) { axis = ax; break outer; }
      if (!axis) return null;
      const out = { [tool.argName || 'axis']: axis };
      if (tool.colArg) {
        const g = groupTags(toks, tags);
        const c = g('COL')[0];
        const col = c && normFrom(ctx.gaz.col)(c.words);
        if (col) out[tool.colArg] = col;
      }
      return out;
    },
  },

  // {column:'LITO'} → {column, value, visible:bool}
  'category-visibility': {
    defaultTarget: 110,
    render(tool, ctx, R) {
      const col = catColOf(tool, ctx.vocab);
      const vals = ctx.vocab.catValues[col];
      const v = R.pick(Object.keys(vals)), syn = R.pick(vals[v]);
      const show = R.maybe(0.4);
      const q = show
        ? R.pick([`show ${syn}`, `bring back ${syn}`, `turn on ${syn}`, `make ${syn} visible`, `unhide ${syn}`, `put ${syn} back`, `I want to see ${syn} again`, `${cap(syn)} back on`])
        : R.pick([`hide ${syn}`, `take out ${syn}`, `remove the ${syn} blocks`, `turn off ${syn}`, `${cap(syn)} off`, `drop the ${syn} from the view`, `get rid of ${syn}`, `I don't want to see ${syn}`, `make ${syn} invisible`, `switch off ${syn}`]);
      return { q, args: { column: col, value: v, visible: show } };
    },
    align(toks, tags, args, ctx) {
      const c = mkClaim(toks, tags);
      return c.claimGaz(ctx.gaz.lit, null, 'CAT', (v) => v.col === args.column && v.value === args.value);
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags);
      const c = g('CAT')[0];
      const hit = c && normFrom(ctx.gaz.lit)(c.words);
      if (!hit) return null;
      return { column: hit.col, value: hit.value, visible: showHide(toks, ctx.vocab.L) === 'show' };
    },
  },

  // {argName:'layer', frames:['zoom to {layer}',...]}
  'layer-pick': {
    defaultTarget: 70,
    render(tool, ctx, R) {
      const file = R.pick(Object.keys(ctx.vocab.layers));
      const syn = R.pick(ctx.vocab.layers[file].filter((s) => s !== file));
      return { q: fill(R.pick(tool.frames), { layer: syn }), args: { [tool.argName || 'layer']: file } };
    },
    align(toks, tags, args, ctx, tool) {
      return mkClaim(toks, tags).claimGaz(ctx.gaz.layer, args[tool.argName || 'layer'], 'LAYER');
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags);
      const c = g('LAYER')[0];
      const layer = (c && normFrom(ctx.gaz.layer)(c.words)) || normFrom(ctx.gaz.layer)(toks);
      return layer ? { [tool.argName || 'layer']: layer } : null;
    },
  },

  // {} → {layer, action:'show'|'hide'}
  'layer-action': {
    defaultTarget: 80,
    render(tool, ctx, R) {
      const file = R.pick(Object.keys(ctx.vocab.layers));
      const syn = R.pick(ctx.vocab.layers[file].filter((s) => s !== file));
      const show = R.maybe(0.45);
      const q = show
        ? R.pick([`show ${syn}`, `turn on ${syn}`, `bring ${syn} back`, `${cap(syn)} back on`, `make ${syn} visible`, `show ${syn} again`])
        : R.pick([`hide ${syn}`, `turn off ${syn}`, `remove ${syn} from the view`, `${cap(syn)} off`, `I don't want to see ${syn}`, `make ${syn} invisible`]);
      return { q, args: { layer: file, action: show ? 'show' : 'hide' } };
    },
    align(toks, tags, args, ctx) {
      return mkClaim(toks, tags).claimGaz(ctx.gaz.layer, args.layer, 'LAYER');
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags);
      const c = g('LAYER')[0];
      const layer = (c && normFrom(ctx.gaz.layer)(c.words)) || normFrom(ctx.gaz.layer)(toks);
      return layer ? { layer, action: showHide(toks, ctx.vocab.L) } : null;
    },
  },

  // {argName, values:{key: [syn] | {syn:[...], frames:[...]}}, frames:['use {val}',...]}
  'lexicon-pick': {
    defaultTarget: 55,
    render(tool, ctx, R) {
      const key = R.pick(Object.keys(tool.values));
      const spec = tool.values[key];
      const syns = Array.isArray(spec) ? spec : spec.syn || [key];
      const perValueFrames = !Array.isArray(spec) && spec.frames;
      if (perValueFrames) return { q: R.pick(spec.frames), args: { [tool.argName]: key } };
      return { q: fill(R.pick(tool.frames), { val: R.pick(syns) }), args: { [tool.argName]: key } };
    },
    align() { return true; },                                // lexicon at assembly; no tags
    assemble(tool, ctx, toks) {
      const key = lexFind(toks, tool.values);
      return key ? { [tool.argName]: key } : null;
    },
  },

  // {argName, frames:['exaggerate z by {n}'], values?:[...], wordNumbers?:bool}
  'number-arg': {
    defaultTarget: 45,
    render(tool, ctx, R) {
      const n = tool.values ? R.pick(tool.values) : +(0.5 + R.rnd() * 9.5).toFixed(1);
      const L = ctx.vocab.L;
      const asWord = tool.wordNumbers && Number.isInteger(n) && n >= 1 && n <= 9 && R.maybe(0.3);
      const word = asWord ? Object.keys(L.wordNums).find((k) => L.wordNums[k] === n) : null;
      return { q: fill(R.pick(tool.frames), { n: word || n }), args: { [tool.argName]: n } };
    },
    align(toks, tags, args, ctx, tool) {
      const c = mkClaim(toks, tags);
      if (c.claimNum(args[tool.argName], 'VAL') >= 0) return true;
      if (!tool.wordNumbers) return false;
      const wn = ctx.vocab.L.wordNums;
      const wi = toks.findIndex((t, k) => tags[k] === 'O' && wn[t] === args[tool.argName]);
      if (wi < 0) return false;
      tags[wi] = 'VAL';
      return true;
    },
    assemble(tool, ctx, toks, tags) {
      const g = groupTags(toks, tags);
      let n = firstNum(g, toks);
      if (n == null && tool.wordNumbers) { const wn = ctx.vocab.L.wordNums; const w = toks.find((t) => wn[t]); if (w) n = wn[w]; }
      return n != null ? { [tool.argName]: n } : null;
    },
  },

  // {frames:[...]}
  'no-arg': {
    defaultTarget: 30,
    render(tool, ctx, R) {
      return { q: politeWrap(R.pick(tool.frames), R, ctx.vocab.L), args: {} };
    },
    align() { return true; },
    assemble() { return {}; },
  },
};

// ── src/gen.js ──

// @gcu/dispatch — corpus generation: banks × kinds over the session
// vocabulary, answer-first (arguments picked, utterance rendered), seeded,
// deduplicated, with the eval-contamination guard as a first-class option.

function generate(ctx, tools, { seed = 42, targets = {}, refusalTarget = 70, extraRefusals = [], excludeTexts = null } = {}) {
  const R = mkR(mulberry32(seed));
  const seen = new Set();
  const excluded = new Set();
  const out = [];
  const guard = (q) => {
    const key = normText(q);
    if (seen.has(key)) return false;
    if (excludeTexts && excludeTexts.has(key)) { excluded.add(key); return false; }
    seen.add(key);
    return true;
  };
  for (const tool of tools) {
    const kind = KINDS[tool.kind];
    if (!kind) throw new Error(`unknown kind "${tool.kind}" (tool ${tool.name})`);
    const target = targets[tool.name] ?? tool.target ?? kind.defaultTarget;
    let made = 0, tries = 0;
    while (made < target && tries++ < target * 40) {
      const { q, args } = kind.render(tool, ctx, R);
      if (!guard(q)) continue;
      out.push({ q, tool: tool.name, args });
      made++;
    }
  }
  const refusalBank = [...ctx.vocab.L.refusals, ...extraRefusals];
  let made = 0, tries = 0;
  while (made < refusalTarget && tries++ < refusalTarget * 40) {
    const base = R.pick(refusalBank);
    const q = R.maybe(0.4) ? base : R.pick([`${base} please`, `can you ${base}`, `${base}?`, `${cap(base)}.`, `${base} for me`]);
    if (!guard(q)) continue;
    out.push({ q, tool: null, args: null });
    made++;
  }
  return { corpus: out, excluded: [...excluded] };
}

// ── src/train.js ──

// @gcu/dispatch — training: alignment (per kind, answer-first) + two
// averaged perceptrons (multiclass intent incl. REFUSE; structured tagger
// with Viterbi). Pure — takes a corpus, returns a JSON-serializable weight
// table. Seconds on any machine, browser included.

const TAGS = ['O', 'COL', 'OP', 'VAL', 'CAT', 'RNG', 'POS', 'THICK', 'ID', 'LAYER'];
// the tag set a corpus actually uses ('O' first, then sorted) — so a host whose kinds emit other
// tags (the grammar rung's THEME / R_<role>) trains without editing this file
const tagSetOf = (aligned) => ['O', ...new Set(aligned.flatMap((x) => x.tags || []).filter((t) => t !== 'O'))].sort((a, b) => a === 'O' ? -1 : b === 'O' ? 1 : a.localeCompare(b));

function alignCorpus(corpus, ctx, toolsByName) {
  const aligned = [];
  let dropped = 0;
  for (const ex of corpus) {
    const toks = tokenize(ex.q);
    if (ex.tool === null) { aligned.push({ toks, tags: null, intent: 'REFUSE' }); continue; }
    const tool = toolsByName[ex.tool];
    const tags = new Array(toks.length).fill('O');
    const ok = KINDS[tool.kind].align(toks, tags, ex.args, ctx, tool);
    if (!ok) { dropped++; continue; }
    aligned.push({ toks, tags, intent: ex.tool });
  }
  return { aligned, dropped };
}

function trainModels(aligned, ctx, { epochs = 25, tagSet } = {}) {
  const TAGS = tagSet || tagSetOf(aligned);
  // ── intent: averaged multiclass perceptron ──
  const CLASSES = [...new Set(aligned.map((x) => x.intent))].sort();
  const iw = {}, iacc = {};
  for (const c of CLASSES) { iw[c] = new Map(); iacc[c] = new Map(); }
  let it = 1;
  const iscore = (c, f) => { let s = iw[c].get('_bias') || 0; for (const [k, v] of f) s += (iw[c].get(k) || 0) * v; return s; };
  const ibump = (c, f, d) => {
    const W = iw[c], A = iacc[c];
    W.set('_bias', (W.get('_bias') || 0) + d); A.set('_bias', (A.get('_bias') || 0) + d * it);
    for (const [k, v] of f) { W.set(k, (W.get(k) || 0) + d * v); A.set(k, (A.get(k) || 0) + d * v * it); }
  };
  for (let e = 0; e < epochs; e++) {
    let errs = 0;
    for (const ex of shuffled(aligned, 1000 + e)) {
      const f = ctx.intentFeatures(ex.toks);
      let best = null, bs = -Infinity;
      for (const c of CLASSES) { const s = iscore(c, f); if (s > bs) { bs = s; best = c; } }
      if (best !== ex.intent) { ibump(ex.intent, f, 1); ibump(best, f, -1); errs++; }
      it++;
    }
    if (!errs) break;
  }
  const intent = {};
  for (const c of CLASSES) {
    intent[c] = {};
    for (const [k, v] of iw[c]) { const avg = v - (iacc[c].get(k) || 0) / it; if (Math.abs(avg) > 1e-6) intent[c][k] = +avg.toFixed(5); }
  }

  // ── tags: averaged structured perceptron ──
  const tw = {}, tacc = {}, tr = new Map(), tracc = new Map();
  for (const t of TAGS) { tw[t] = new Map(); tacc[t] = new Map(); }
  let tt = 1;
  const T = TAGS.length;
  function decode(per, n) {
    const dp = Array.from({ length: n }, () => new Float64Array(T).fill(-1e9));
    const bp = Array.from({ length: n }, () => new Int32Array(T));
    const emit = (i, t) => { let s = 0; const W = tw[TAGS[t]]; for (const k of per[i]) s += W.get(k) || 0; return s; };
    for (let t = 0; t < T; t++) dp[0][t] = emit(0, t) + (tr.get(`^>${TAGS[t]}`) || 0);
    for (let i = 1; i < n; i++) for (let t = 0; t < T; t++) {
      const e = emit(i, t);
      for (let p = 0; p < T; p++) { const s = dp[i - 1][p] + (tr.get(`${TAGS[p]}>${TAGS[t]}`) || 0) + e; if (s > dp[i][t]) { dp[i][t] = s; bp[i][t] = p; } }
    }
    let best = 0;
    for (let t = 1; t < T; t++) if (dp[n - 1][t] > dp[n - 1][best]) best = t;
    const out = new Array(n);
    for (let i = n - 1, t = best; i >= 0; i--) { out[i] = TAGS[t]; t = bp[i][t]; }
    return out;
  }
  const tagged = aligned.filter((x) => x.tags);
  for (let e = 0; e < epochs; e++) {
    let errs = 0;
    for (const ex of shuffled(tagged, 2000 + e)) {
      const per = ctx.tokenFeatures(ex.toks);
      const pred = decode(per, ex.toks.length);
      for (let i = 0; i < ex.toks.length; i++) {
        if (pred[i] === ex.tags[i]) continue;
        errs++;
        const up = tw[ex.tags[i]], ua = tacc[ex.tags[i]], dn = tw[pred[i]], da = tacc[pred[i]];
        for (const k of per[i]) {
          up.set(k, (up.get(k) || 0) + 1); ua.set(k, (ua.get(k) || 0) + tt);
          dn.set(k, (dn.get(k) || 0) - 1); da.set(k, (da.get(k) || 0) - tt);
        }
        const pg = i ? ex.tags[i - 1] : '^', pp = i ? pred[i - 1] : '^';
        for (const [key, d] of [[`${pg}>${ex.tags[i]}`, 1], [`${pp}>${pred[i]}`, -1]]) {
          tr.set(key, (tr.get(key) || 0) + d); tracc.set(key, (tracc.get(key) || 0) + d * tt);
        }
      }
      tt++;
    }
    if (!errs) break;
  }
  const tag = {}, trans = {};
  for (const t of TAGS) {
    tag[t] = {};
    for (const [k, v] of tw[t]) { const avg = v - (tacc[t].get(k) || 0) / tt; if (Math.abs(avg) > 1e-6) tag[t][k] = +avg.toFixed(5); }
  }
  for (const [k, v] of tr) { const avg = v - (tracc.get(k) || 0) / tt; if (Math.abs(avg) > 1e-6) trans[k] = +avg.toFixed(5); }

  return { tags: TAGS, classes: CLASSES, intent, tag, trans };
}

// ── src/api.js ──

// @gcu/dispatch — the public surface.
//   deriveVocab(session)                         → vocab
//   trainSession({vocab, tools, ...})            → { dispatcher, weights, stats }
//   createDispatcher({vocab, tools, weights})    → { dispatch(q, {surface}) }
// dispatch returns { calls, intent, margin, tags } — calls is [] on refusal
// or failed assembly (the host degrades into its command palette).

function scoreIntents(ctx, weights, toks) {
  const f = ctx.intentFeatures(toks);
  const scores = {};
  for (const [cls, wv] of Object.entries(weights.intent)) {
    let s = wv._bias || 0;
    for (const [k, v] of f) s += (wv[k] || 0) * v;
    scores[cls] = s;
  }
  return scores;
}
function viterbi(ctx, weights, toks) {
  const per = ctx.tokenFeatures(toks);
  const tags = weights.tags;
  const n = toks.length, T = tags.length;
  const emit = (i, t) => { const wv = weights.tag[tags[t]]; if (!wv) return 0; let s = 0; for (const k of per[i]) s += wv[k] || 0; return s; };
  const dp = Array.from({ length: n }, () => new Float64Array(T).fill(-1e9));
  const bp = Array.from({ length: n }, () => new Int32Array(T));
  for (let t = 0; t < T; t++) dp[0][t] = emit(0, t) + (weights.trans[`^>${tags[t]}`] || 0);
  for (let i = 1; i < n; i++) for (let t = 0; t < T; t++) {
    const e = emit(i, t);
    for (let p = 0; p < T; p++) { const s = dp[i - 1][p] + (weights.trans[`${tags[p]}>${tags[t]}`] || 0) + e; if (s > dp[i][t]) { dp[i][t] = s; bp[i][t] = p; } }
  }
  let best = 0;
  for (let t = 1; t < T; t++) if (dp[n - 1][t] > dp[n - 1][best]) best = t;
  const out = new Array(n);
  for (let i = n - 1, t = best; i >= 0; i--) { out[i] = tags[t]; t = bp[i][t]; }
  return out;
}

function createDispatcher({ vocab, tools, weights }) {
  const ctx = createContext(vocab);
  const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const surfaceOf = (t) => t.surface || t.name.split('.')[0];
  function dispatch(query, opts = {}) {
    const toks = tokenize(query);
    if (!toks.length) return { calls: [], intent: 'REFUSE', margin: 0 };
    const scores = scoreIntents(ctx, weights, toks);
    const inScope = opts.surface
      ? ([cls]) => cls === 'REFUSE' || (toolsByName[cls] && surfaceOf(toolsByName[cls]) === opts.surface)
      : () => true;
    const ranked = Object.entries(scores).filter(inScope).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return { calls: [], intent: 'REFUSE', margin: 0 };
    const intent = ranked[0][0];
    const margin = ranked[0][1] - (ranked[1] ? ranked[1][1] : 0);
    if (intent === 'REFUSE') return { calls: [], intent, margin };
    const tool = toolsByName[intent];
    const tags = viterbi(ctx, weights, toks);
    const args = KINDS[tool.kind].assemble(tool, ctx, toks, tags);
    if (!args) return { calls: [], intent, margin, note: 'assembly failed' };
    return { calls: [{ name: intent, arguments: args }], intent, margin, tags };
  }
  return { dispatch, ctx, weights, tools };
}

// the session-trained loop: generate → align → train → dispatcher, in one
// call, fast enough to run at project load.
function trainSession({ vocab, tools, seed = 42, targets, refusalTarget, extraRefusals, excludeTexts, epochs } = {}) {
  const ctx = createContext(vocab);
  const { corpus, excluded } = generate(ctx, tools, { seed, targets, refusalTarget, extraRefusals, excludeTexts });
  const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const { aligned, dropped } = alignCorpus(corpus, ctx, toolsByName);
  const weights = trainModels(aligned, ctx, { epochs });
  const dispatcher = createDispatcher({ vocab, tools, weights });
  return { dispatcher, weights, stats: { corpus: corpus.length, aligned: aligned.length, dropped, excluded } };
}

// ── src/grammar/earley.js ──

// earley.mjs — Earley recogniser + packed semantic evaluation, with optional error-correcting repairs.
//
// chart(R, toks, term, start, opts) recognises the input for grammar R (R[sym] = [{rhs, act}]),
// where term(sym, tok) returns the semantic nodes a terminal symbol yields for a token.
//
// opts.budget (default 0) enables error-correcting parsing (Aho & Peterson 1972): the parser may
//   - skip a token   (cost opts.skip(i), default 1)
//   - substitute a token by a near miss (opts.near(sym, i) → [{ v, cost, to }], default none) — spelling as an edit
//   - insert a terminal the grammar expects (cost opts.insert(sym, i), default Infinity; typically only
//     a few categories are insertable — a preposition, an article). The inserted node comes from
//     opts.fabricate(sym) and is marked { inserted: true }.
// The minimum-cost derivation wins; ties are kept as alternatives. With budget 0 nothing changes.
//
// Returns:
//   derive(sym, i, j)  → [{ v, cost, repairs }] — packed: each (sym, i, j) evaluated once, alternatives
//                        with equal meaning merged keeping the cheaper one, null actions pruned at the span.
//   spans(sym, i)      → end positions j for which sym derives [i, j) within budget
//   furthest, expected()  → diagnostics (where the chart died, what it wanted)
function chart(R, toks, term, start, opts = {}) {
  const budget = opts.budget ?? 0;
  const skipCost = opts.skip ?? (() => 1);
  const insCost = opts.insert ?? (() => Infinity);
  const fabricate = opts.fabricate ?? (() => null);
  const near = opts.near ?? (() => []);
  const nearMin = (sym, i) => { const c = near(sym, i); return c.length ? Math.min(...c.map(x => x.cost)) : Infinity; };
  const n = toks.length;
  const rules = [];
  for (const lhs in R) for (const r of R[lhs]) rules.push({ id: rules.length, lhs, rhs: r.rhs, act: r.act });
  const byLhs = {}; for (const r of rules) (byLhs[r.lhs] ??= []).push(r);
  const isNT = s => s in R;
  const nullable = new Set();
  for (let changed = true; changed;) { changed = false; for (const r of rules) if (!nullable.has(r.lhs) && r.rhs.every(s => nullable.has(s))) { nullable.add(r.lhs); changed = true; } }
  const insertable = sym => !isNT(sym) && budget > 0 && insCost(sym, 0) < Infinity;

  // ---- recognition (items carry cost; same (rule,dot,origin) at a lower cost supersedes) ----
  const S = Array.from({ length: n + 1 }, () => ({ items: [], best: new Map() }));
  const completed = {};                                   // completed[sym][origin] = Map(end → min cost)
  const add = (k, rule, dot, origin, cost) => {
    if (cost > budget) return;
    const key = `${rule.id},${dot},${origin}`;
    const prev = S[k].best.get(key);
    if (prev !== undefined && prev <= cost) return;
    S[k].best.set(key, cost); S[k].items.push({ rule, dot, origin, cost });
  };
  for (const r of byLhs[start]) add(0, r, 0, 0, 0);
  let furthest = 0;
  for (let k = 0; k <= n; k++) {
    const set = S[k];
    if (!set.items.length) break;
    furthest = k;
    for (let x = 0; x < set.items.length; x++) {
      const it = set.items[x];
      if (set.best.get(`${it.rule.id},${it.dot},${it.origin}`) < it.cost) continue;   // superseded
      const next = it.rule.rhs[it.dot];
      if (next === undefined) {
        const m = (completed[it.rule.lhs] ??= {})[it.origin] ??= new Map();
        if (!(m.has(k) && m.get(k) <= it.cost)) m.set(k, it.cost);
        for (const w of S[it.origin].items) if (w.rule.rhs[w.dot] === it.rule.lhs) add(k, w.rule, w.dot + 1, w.origin, w.cost + it.cost);
      } else if (isNT(next)) {
        for (const r of byLhs[next]) add(k, r, 0, k, 0);
        if (nullable.has(next)) add(k, it.rule, it.dot + 1, it.origin, it.cost);
      } else {
        if (k < n && term(next, toks[k]).length) add(k + 1, it.rule, it.dot + 1, it.origin, it.cost);
        else if (k < n && budget > 0) { const nc = nearMin(next, k); if (nc < Infinity) add(k + 1, it.rule, it.dot + 1, it.origin, it.cost + nc); }   // substitute
        if (insertable(next)) add(k, it.rule, it.dot + 1, it.origin, it.cost + insCost(next, k));   // insert the terminal
      }
      if (budget > 0 && k < n) add(k + 1, it.rule, it.dot, it.origin, it.cost + skipCost(k));        // skip the token
    }
  }
  for (const sym of nullable) for (let k = 0; k <= furthest; k++) { const m = (completed[sym] ??= {})[k] ??= new Map(); if (!m.has(k)) m.set(k, 0); }

  // ---- packed min-cost evaluation ----
  // terminal over [i, j): tokens i..j-2 skipped, token j-1 matches; or i === j with an insertion
  const termSpans = (sym, i) => {
    const out = [];
    if (insertable(sym)) out.push(i);
    let c = 0;
    for (let j = i + 1; j <= n; j++) { if (term(sym, toks[j - 1]).length || (budget > 0 && nearMin(sym, j - 1) + c <= budget)) out.push(j); if (budget === 0) break; c += skipCost(j - 1); if (c > budget) break; }
    return out;
  };
  const spans = (sym, i) => isNT(sym) ? [...(completed[sym]?.[i]?.keys() ?? [])] : termSpans(sym, i);
  const dMemo = new Map(), sMemo = new Map();
  const skipsBetween = (i, j) => { let c = 0; const r = []; for (let k = i; k < j; k++) { c += skipCost(k); r.push({ op: 'skip', at: k, word: toks[k].word }); } return { c, r }; };
  function derive(sym, i, j) {
    const key = `${sym}@${i}-${j}`;
    if (dMemo.has(key)) return dMemo.get(key);
    dMemo.set(key, []);
    let out = [];
    if (!isNT(sym)) {
      if (i === j) { const v = fabricate(sym); out = v ? [{ v: { ...v, inserted: true }, cost: insCost(sym, i), repairs: [{ op: 'insert', at: i, sym }] }] : []; }
      else { const { c, r } = skipsBetween(i, j - 1); if (c <= budget) { out = term(sym, toks[j - 1]).map(v => ({ v, cost: c, repairs: r })); if (!out.length && budget > 0) out = near(sym, j - 1).filter(x => c + x.cost <= budget).map(x => ({ v: x.v, cost: c + x.cost, repairs: [...r, { op: 'subst', at: j - 1, word: toks[j - 1].word, to: x.to }] })); } }
    } else if (completed[sym]?.[i]?.has(j)) {
      const seen = new Map();
      for (const r of byLhs[sym]) for (const kids of seq(r, 0, i, j)) {
        const v = r.act(...kids.vs);
        if (v === null) continue;
        const vk = JSON.stringify(v);
        const prev = seen.get(vk);
        if (!prev || kids.cost < prev.cost) seen.set(vk, { v, cost: kids.cost, repairs: kids.repairs });
      }
      out = [...seen.values()];
    }
    dMemo.set(key, out); return out;
  }
  function seq(rule, idx, i, j) {
    const key = `${rule.id},${idx},${i},${j}`;
    if (sMemo.has(key)) return sMemo.get(key);
    let out = [];
    if (idx === rule.rhs.length) out = i === j ? [{ vs: [], cost: 0, repairs: [] }] : [];
    else {
      const sym = rule.rhs[idx];
      for (const e of spans(sym, i)) {
        if (e > j) continue;
        const heads = derive(sym, i, e); if (!heads.length) continue;
        const tails = seq(rule, idx + 1, e, j); if (!tails.length) continue;
        for (const h of heads) for (const t of tails) { const cost = h.cost + t.cost; if (cost <= budget) out.push({ vs: [h.v, ...t.vs], cost, repairs: [...h.repairs, ...t.repairs] }); }
      }
      if (budget > 0) { const best = new Map(); for (const o of out) { const k = JSON.stringify(o.vs); const p = best.get(k); if (!p || o.cost < p.cost) best.set(k, o); } out = [...best.values()]; }
    }
    sMemo.set(key, out); return out;
  }
  const expected = () => [...new Set(S[furthest].items.map(it => it.rule.rhs[it.dot]).filter(s => s !== undefined && !isNT(s)))];
  return { derive, spans, furthest, expected, nullable, skipCost };
}

// ── src/grammar/grammar.js ──

// @gcu/dispatch grammar — the phrase-structure rules of the controlled command language (~50 rules).
// Terminals: CATEGORY or CATEGORY:word. Nonterminals: capitalised. Actions return a node, or null to
// kill the branch (type pruning inside the parse; return {} for a present-but-meaningless node, never
// null for "nothing"). X carries the type-driven helpers the engine derives from the ontology:
// headFirst, identTypes, postmodPreps, postmodQuantity, compound(), postmod(), qmod().
function buildGrammar(X) {
  const R = {};
  const rule = (lhs, rhs, act) => (R[lhs] ??= []).push({ rhs: rhs ? rhs.split(' ') : [], act });

  rule('Program', 'Cmd', c => [c]);
  // closed, value-returning questions are commands with the verb left out: "what is the density of chalcopyrite"
  // reads as "density of chalcopyrite". Open questions (why, how) have no rule here and stay out of scope.
  rule('Program', 'Question', q => [q]);
  rule('Question', 'WHCOP NPList PPs', (_, l, a) => ({ kind: 'cmd', verb: null, args: [{ kind: 'np', list: l }, ...a], question: true }));
  // "which countries are landlocked" = "landlocked countries": the predicate must compound onto the subject
  rule('Question', 'WH Core COP NPList PPs', (_, c, __, l, a) => {
    let n = c; for (const m of l) { const r = X.compound(m, n); if (!r) return null; n = r; }
    return { kind: 'cmd', verb: null, args: [{ kind: 'np', list: [n] }, ...a], question: true };
  });
  rule('Program', 'Cmd THEN Program', (c, _, p) => [c, ...p]);
  rule('Program', 'Cmd CONJ THEN Program', (c, _, __, p) => [c, ...p]);
  rule('Program', 'Cmd COMMA THEN Program', (c, _, __, p) => [c, ...p]);
  rule('Program', 'Cmd COMMA CONJ THEN Program', (c, _, __, ___, p) => [c, ...p]);

  // object comes right after the verb or not at all; everything after is prepositional
  rule('Cmd', 'VERB Theme PPs', (v, t, a) => ({ kind: 'cmd', verb: v.verb, args: [...t, ...a] }));
  rule('Cmd', 'AGAIN Theme PPs', (_, t, a) => ({ kind: 'again', args: [...t, ...a] }));
  rule('Cmd', 'AGAIN BUT Theme PPs', (_, __, t, a) => ({ kind: 'again', args: [...t, ...a] }));
  rule('Cmd', 'AGAIN COMMA BUT Theme PPs', (_, __, ___, t, a) => ({ kind: 'again', args: [...t, ...a] }));

  if (X.subject) rule('Cmd', 'NP VERB Theme PPs', (n, v, t, a) => ({ kind: 'cmd', verb: v.verb, args: [...t, { kind: 'pp', prep: '', canon: ['subject'], val: [n] }, ...a] }));   // "pop means population": only frames that declare a subject
  rule('Cmd', 'VERB PPs LATE NPList', (v, a, _, l) => ({ kind: 'cmd', verb: v.verb, args: [{ kind: 'np', list: l }, ...a] }));   // object after the PPs — a repair, never free
  rule('Cmd', 'LATE PP PPs VERB Theme PPs', (_, p, a, v, t, b) => ({ kind: 'cmd', verb: v.verb, args: [...t, p, ...a, ...b] }));   // arguments before the verb — also a repair
  // no verb: a bare thing, maybe with arguments — "density of chalcopyrite", "2 km in miles", "histogram of cu".
  // The engine binds it to the frames the ontology marks `elidable`; the ontology, not the grammar, says what
  // can be asked for on its own. Two frames surviving is an honest ambiguity, reported as such.
  rule('Cmd', 'NPList PPs', (l, a) => ({ kind: 'cmd', verb: null, args: [{ kind: 'np', list: l }, ...a] }));
  rule('Theme', '', () => []);
  rule('Theme', 'NPList', l => [{ kind: 'np', list: l }]);
  rule('PPs', '', () => []);
  rule('PPs', 'PP PPs', (a, r) => [a, ...r]);

  rule('PP', 'PREP NPList', (p, l) => ({ kind: 'pp', prep: p.word, canon: p.canon, val: l }));
  rule('PP', 'COLON NPList', (_, l) => ({ kind: 'pp', prep: ':', canon: [':'], val: l }));   // "check: …", a payload after a line break
  rule('PP', 'DEMO COLON NPList', (_, __, l) => ({ kind: 'pp', prep: ':', canon: [':'], val: l }));             // "summarise this: …", "diff these: …"
  rule('PP', 'PREP:of DEMO COLON NPList', (_, __, ___, l) => ({ kind: 'pp', prep: ':', canon: [':'], val: l }));   // "word count of this: …"
  rule('PP', 'Date', d => ({ kind: 'pp', prep: '', canon: ['on'], val: [d] }));
  const bareOk = n => X.bareTypes.has(n.type) || (n.type === 'quantity' && (X.bareTypes.has('quantity:*') || X.bareTypes.has(`quantity:${n.dim}`)));
  if (X.bareTypes.size) rule('PP', 'NP', n => bareOk(n) ? { kind: 'pp', prep: '', canon: [''], val: [n] } : null);   // a role with no marker, of a type a frame declares one for                   // a bare date is a time argument: "call him tomorrow"

  rule('NPList', 'NP NPTail', (n, t) => [n, ...t]);
  rule('NPTail', '', () => []);
  rule('NPTail', 'CONJ NP NPTail', (_, n, t) => [n, ...t]);
  rule('NPTail', 'COMMA NP NPTail', (_, n, t) => [n, ...t]);
  rule('NPTail', 'COMMA CONJ NP NPTail', (_, __, n, t) => [n, ...t]);

  rule('NP', 'Core', c => c);
  rule('NP', 'DET Core', (d, c) => ({ ...c, det: d.word }));
  rule('NP', 'DET REF Core', (d, r, c) => ({ ...c, ref: r.word }));
  rule('NP', 'REF Core', (r, c) => ({ ...c, ref: r.word }));
  rule('NP', 'QUANT Core Except', (q, c, e) => c.generic ? { ...c, all: true, except: e } : null);
  rule('NP', 'QUANT DET Core Except', (q, _, c, e) => c.generic ? { ...c, all: true, except: e } : null);   // all the domains / todos os domínios
  rule('NP', 'QUANT Core', (q, c) => c.generic ? null : { ...c, each: true });   // "each hole" where hole names one thing (a column): per hole, for the host
  if (X.headFirst) rule('NP', 'DET Core REF', (d, c, r) => ({ ...c, ref: r.word }));                        // a rodada anterior
  rule('NP', 'PRON', p => ({ type: '*', pron: p.word }));
  rule('NP', 'IDENT', t => t.type ? { type: t.type, name: t.name, generic: false, attrs: {} } : null);
  rule('NP', 'Quantity', q => q);
  rule('NP', 'UNIT', u => ({ type: 'unit', unit: u.unit, dim: u.dim, generic: false, attrs: {} }));   // "in miles": a unit as a thing
  rule('NP', 'TEXT', t => ({ type: 'text', value: t.text, generic: false, attrs: {} }));            // a free-text span (the engine cuts it)
  rule('NP', 'LIT PostMods', (t, pm) => {   // a token shape the ontology declares (270/60, DH-03), with its modifiers ("14 on 14 off from 6 oct")
    const n = { type: t.type, value: t.value, generic: false, attrs: {} };
    for (const m of pm) { const r = X.postmod(n, m); if (!r) return null; Object.assign(n, r); }
    return n;
  });
  rule('NP', 'Date', d => d);
  rule('NP', 'Clock', c => c);
  rule('NP', 'DET Quantity Head', (_, q, h) => X.qmod(q, h));
  rule('NP', 'Quantity Head', (q, h) => X.qmod(q, h));
  rule('Except', '', () => []);
  rule('Except', 'EXCEPT NPList', (_, l) => l);

  rule('Core', 'Head Ident PostMods', (h, id, pm) => {
    const n = { ...h };
    if (h.plural) n.plural = true;
    if (!id.none) { if (!X.identTypes.has(h.type)) return null; n.name = id.name; n.generic = false; }
    for (const m of pm) { const r = X.postmod(n, m); if (!r) return null; Object.assign(n, r); }
    return n;
  });
  rule('Ident', '', () => ({ none: true }));
  rule('Ident', 'IDENT', t => ({ name: t.name }));
  rule('Ident', 'NUM', t => ({ name: String(t.n) }));
  rule('PostMods', '', () => []);
  rule('PostMods', 'PostMod PostMods', (m, r) => [m, ...r]);
  for (const p of X.postmodPreps) {
    if (p === '') {   // a bare modifier: a shaped token or a number right after the noun ("hole 270/60", "rake 30")
      if (X.postmodQuantity.has('')) rule('PostMod', 'Quantity', q => ({ prep: '', q }));
      rule('PostMod', 'LIT', t => ({ prep: '', np: { type: t.type, value: t.value } }));
      continue;
    }
    if (X.postmodQuantity.has(p)) { rule('PostMod', `PREP:${p} Quantity`, (_, q) => ({ prep: p, q })); rule('PostMod', `COP PREP:${p} Quantity`, (_, __, q) => ({ prep: p, q })); }   // "cu above 1", "cu is above 1"
    else rule('PostMod', `PREP:${p} NP`, (_, n) => ({ prep: p, np: n }));
  }
  rule('PostMod', 'PREP:of Quantity', (_, q) => ({ prep: 'of', q, qmod: true }));   // "a search of 200 m" / "busca de 200 m"
  // relative clause: "the variogram (that) I fitted yesterday", "the run we did last week", "the variogram fitted this morning"
  rule('PostMod', 'RelHead VERB When', (_, v, w) => ({ rel: { verb: v.verb, when: w } }));
  rule('PostMod', 'VERB When', (v, w) => w ? { rel: { verb: v.verb, when: w } } : null);          // participle form needs the time to disambiguate
  rule('PostMod', 'PREP:from TIME', (_, t) => ({ rel: { when: t } }));                              // "the run from yesterday"
  rule('PostMod', 'TIME', t => ({ rel: { when: t } }));                                             // "yesterday's" is not modelled; "the run yesterday" is
  rule('PostMod', 'PREP:with CompNP', (_, c) => ({ rel: { cmp: c.cmp } }));                              // "the run with the bigger search"
  rule('RelHead', 'SUBJ', () => ({}));
  rule('RelHead', 'REL SUBJ', () => ({}));
  rule('When', '', () => null);
  rule('When', 'TIME', t => t);
  const compNP = (c, h) => h.type === 'search' || h.type === 'composites' ? { ...h, cmp: { sign: c.sign, sup: c.sup } } : null;
  rule('CompNP', 'COMP Head', compNP); rule('CompNP', 'DET COMP Head', (_, c, h) => compNP(c, h));
  if (X.headFirst) { rule('CompNP', 'Head COMP', (h, c) => compNP(c, h)); rule('CompNP', 'DET Head COMP', (_, h, c) => compNP(c, h)); }   // pt allows both orders
  rule('NP', 'CompNP', c => c);

  const leaf = t => ({ type: t.type, value: t.value, generic: !!t.generic, attrs: {}, ...(t.plural ? { plural: true } : {}) });
  if (X.headFirst) {   // head then modifiers: "variograma esférico", "domínio oeste"
    rule('Head', 'NOUN Mods', (t, ms) => ms.reduce((h, m) => h && X.compound(leaf(m), h), leaf(t)));
    rule('Mods', '', () => []);
    rule('Mods', 'NOUN Mods', (m, r) => [m, ...r]);
  } else {             // modifiers then head: "spherical variogram", "west domain"
    rule('Head', 'NOUN', leaf);
    rule('Head', 'NOUN Head', (a, h) => X.compound(leaf(a), h));
  }

  // dates: a weekday or relative day ("friday", "tomorrow", "next monday"), a day and month with an optional
  // year in either order ("25 december", "oct 16 2026", "16 de outubro de 2026"), an ISO date; a weekday in
  // front of a full date is checked by the host, not here. Clock times: 09:30, 9pm, "9 am", noon, a bare hour.
  const date = o => ({ type: 'date', generic: false, attrs: {}, ...o });
  const dayOf = (n, m, y) => Number.isInteger(n.n) && n.n >= 1 && n.n <= 31 && (!y || (Number.isInteger(y.n) && y.n >= 1000 && y.n <= 9999))
    ? date({ d: n.n, m: m.m, ...(y ? { y: y.n } : {}), value: [n.n, m.word, y && y.n].filter(Boolean).join(' ') }) : null;
  rule('Date', 'DAY', d => date(d.dow != null ? { dow: d.dow, value: d.word } : { off: d.off, value: d.word }));   // off = days from today
  if (X.nextDay) rule('Date', 'THEN:next DAY', (_, d) => d.dow != null ? date({ dow: d.dow, next: true, value: `next ${d.word}` }) : null);
  rule('Date', 'DATE', d => date({ y: d.y, m: d.m, d: d.d, value: d.word }));
  rule('Date', 'NUM MONTH', (n, m) => dayOf(n, m));
  rule('Date', 'NUM MONTH NUM', (n, m, y) => dayOf(n, m, y));
  rule('Date', 'NUM PREP:of MONTH', (n, _, m) => dayOf(n, m));
  rule('Date', 'NUM PREP:of MONTH PREP:of NUM', (n, _, m, __, y) => dayOf(n, m, y));
  rule('Date', 'MONTH NUM', (m, n) => dayOf(n, m));
  rule('Date', 'MONTH NUM NUM', (m, n, y) => dayOf(n, m, y));
  rule('Date', 'MONTH NUM COMMA NUM', (m, n, _, y) => dayOf(n, m, y));
  rule('Date', 'DAY Date', (w, d) => w.dow != null && d.d != null ? { ...d, dow: w.dow, value: `${w.word} ${d.value}` } : null);
  rule('Date', 'DAY COMMA Date', (w, _, d) => w.dow != null && d.d != null ? { ...d, dow: w.dow, value: `${w.word} ${d.value}` } : null);
  const clock = (h, mi, value) => ({ type: 'clock', h, mi, value, generic: false, attrs: {} });
  const hhmm = (h, mi) => `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  rule('Clock', 'CLOCK', c => clock(c.h, c.mi, hhmm(c.h, c.mi)));
  rule('Clock', 'NUM AMPM', (n, a) => { if (!Number.isInteger(n.n) || n.n < 1 || n.n > 12) return null; const pm = /^p/.test(a.word), am = /^a/.test(a.word);
    const h = pm && n.n < 12 ? n.n + 12 : am && n.n === 12 ? 0 : n.n; return clock(h, 0, hhmm(h, 0)); });
  rule('Clock', 'NUM', n => Number.isInteger(n.n) && n.n >= 0 && n.n <= 24 ? clock(n.n, 0, hhmm(n.n, 0)) : null);

  rule('Quantity', 'NUM', t => ({ type: 'quantity', n: t.n, unit: null, dim: 'bare' }));
  rule('Quantity', 'NUM UNIT', (t, u) => ({ type: 'quantity', n: t.n, unit: u.unit, dim: u.dim }));
  rule('Quantity', 'DET UNIT', (d, u) => X.indefinite.includes(d.word) ? { type: 'quantity', n: 1, unit: u.unit, dim: u.dim } : null);   // "an hour", "um minuto"
  return R;
}

// ── src/grammar/locales/en.js ──

// @gcu/dispatch grammar — the English locale bank for the clause parser.
// A locale bank is: the closed-class words by category, a map from each surface preposition to the
// canonical (English) prepositions it can mean, morphology (stem, plural, gender agreement), the time
// and comparative tables, and the phrase table the echo uses. Nothing else about the language lives
// here; domain words come from the ontology.
const ENGLISH = {
  code: 'en', headFirst: false,
  DET: 'the|a|an|this|that|my|our', REF: 'last|previous|latest|current|first|new',
  QUANT: 'all|every|each', EXCEPT: 'except|excluding|minus', CONJ: 'and|or|plus', COMMA: ',',
  PREP: 'with|using|by|per|in|on|for|from|to|at|as|above|below|over|under|of|into|without|against|where|until|till|after|before|since|between|across|through|during|within|around|near|grouped by|weighted by|sorted by|ordered by|having|that have|which have|that has|which has|have|has|>|<|>=|<=|=|≥|≤|greater than|more than|less than|at least|at most|equal to|equals',
  THEN: 'then|afterwards|next', BUT: 'but', PRON: 'it|them|those', AGAIN: 'again|rerun|redo|repeat|same',
  QWORD: 'why|how|what|when|who|is|are|does|do|should|can|could|would',
  // closed questions the grammar reads as commands with the verb left out: a wh-word, a copula, the fused forms
  DEMO: 'this|these|it|that|them|the following|the following text|the text|the two|both',   // before a colon: "summarise this: …"
  WH: 'what|which', COP: 'is|are|was|were', WHCOP: "what is|what's|whats|what are|which is|which are|how much is|how many are",
  TRAIL: 'please|thanks|thank you|pls|plz|cheers|for me|for us',   // politeness that closes a sentence, trimmed from the end of a free text
  FILLER: "please|now|just|kindly|go|ahead|me|us|hey|hi|hello|yo|thanks|thank you|cheers|pls|plz|so|um|uh|er|erm|hmm|well|oh|alright|can you|could you|would you|will you|i want you to|i need you to|i want to|i need|i'd like|i would like|give me|tell me|for me|let us|lets",
  // identity for every English preposition except the comparisons, which share a canon with their words
  preps: { '>': ['above'], 'greater than': ['above'], 'more than': ['above'], '<': ['below'], 'less than': ['below'], '>=': ['atleast'], '≥': ['atleast'], 'at least': ['atleast'],
    '<=': ['atmost'], '≤': ['atmost'], 'at most': ['atmost'], '=': ['equals'], 'equal to': ['equals'], equals: ['equals'],
    'grouped by': ['by'], 'weighted by': ['weighted'], 'sorted by': ['sort'], 'ordered by': ['sort'],
    having: ['where'], 'that have': ['where'], 'which have': ['where'], 'that has': ['where'], 'which has': ['where'], have: ['where'], has: ['where'] },
  // the calendar: weekday numbers (0 = Sunday) or a day relative to today; months; named clock times; am/pm.
  // "sun" is left out on purpose: it is the sun more often than Sunday.
  days: { sunday: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
    today: { rel: 0 }, tonight: { rel: 0 }, tomorrow: { rel: 1 }, yesterday: { rel: -1 } },
  months: { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 },
  clocks: { noon: [12, 0], midday: [12, 0], midnight: [0, 0] },
  // number words, and the fractions people say before a unit
  numbers: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, 'a hundred': 100, dozen: 12, 'a dozen': 12, 'a couple of': 2, 'a few': 3,
    'half an': 0.5, 'half a': 0.5, half: 0.5, 'a quarter of an': 0.25, 'a quarter of a': 0.25, 'quarter of an': 0.25, 'quarter of a': 0.25, 'three quarters of an': 0.75, 'three quarters of a': 0.75, 'an hour and a half': 1.5 },
  AMPM: "am|pm|a.m.|p.m.|o'clock",
  indefinite: ['a', 'an'], newRef: ['new'], firstRef: ['first'],
  phr: { new: 'new', last: 'last', every: 'every', except: 'except', fromRun: 'from run', above: 'above', below: 'below', atleast: 'at least', atmost: 'at most', equals: 'equal to', then: 'Then', assuming: 'assuming', of: 'of', hole: '___', than: 'than' },
  // morphology: a stem both the lexicon and the input are folded through; plural = word ≠ lexeme and ends in s
  stem: w => { let x = w; if (x.length > 4 && /ies$/.test(x)) x = x.slice(0, -3) + 'y'; else if (x.length > 4 && /(ss|sh|ch|x)es$/.test(x)) x = x.slice(0, -2); else if (x.length > 3 && /[^s]s$/.test(x)) x = x.slice(0, -1);
    if (x.length > 5 && /ing$/.test(x)) x = x.slice(0, -3); else if (x.length > 4 && /ed$/.test(x)) x = x.slice(0, -2);
    x = x.replace(/([b-df-hj-np-tv-z])\1$/, '$1'); if (x.length > 3 && /e$/.test(x)) x = x.slice(0, -1); return x; },
  gender: () => 'm', agree: { m: {}, f: {} }, plural: w => /[^s]s$/.test(w),
  // relative clauses and time
  REL: 'that|which|who', SUBJ: 'i|we|you|they', TIME: 'today|yesterday|this morning|this week|last week|this month|last month|earlier',
  times: { today: [0, 1], yesterday: [1, 2], 'this morning': [0, 1], 'this week': [0, 7], 'last week': [7, 14], 'this month': [0, 30], 'last month': [30, 60], earlier: [0, 3650] },   // days ago: [from, to)
  COMP: 'bigger|larger|wider|smaller|narrower|longer|shorter|biggest|largest|widest|smallest|narrowest|longest|shortest',
  comps: { bigger: ['+', 0], larger: ['+', 0], wider: ['+', 0], longer: ['+', 0], smaller: ['-', 0], narrower: ['-', 0], shorter: ['-', 0], biggest: ['+', 1], largest: ['+', 1], widest: ['+', 1], longest: ['+', 1], smallest: ['-', 1], narrowest: ['-', 1], shortest: ['-', 1] },
};

// ── src/grammar/engine.js ──

// @gcu/dispatch grammar — the clause engine. Builds a lexicon from ontology + locale, tokenizes
// (multiword, stems, identifiers, a one-edit typo pre-pass), parses with the Earley chart (strict,
// then with a repair budget), binds the parse to a verb frame (prepositions = role labels, types prune),
// resolves against the session (names, recency, quantifiers, ellipsis), and echoes the reading back.
//
//   understand(text, session, {repair:{budget}}) → { status: ok | ambiguous | clarify | reject | outofscope, … }
//   suggest(text, session) / preview(text, session)   predictive input
//   assemble({verb, theme, roles}, session)          a slot tagger's groups through the same binder
//
// See SPEC.md "The grammar rung" for the pipeline, the verdicts and the ceiling.

function dl(a, b) { // Damerau-Levenshtein
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// ───────────────────────────── engine ─────────────────────────────
function createEngine(ont, locale = ENGLISH) {
  // ---- lexicon from ontology + locale ----
  const LEX = {};
  const add = (words, cat, extra = {}) => { for (const w of words.split('|')) (LEX[w] ??= []).push({ cat, word: w, ...extra }); };
  for (const cat of ['DET', 'REF', 'QUANT', 'EXCEPT', 'CONJ', 'COMMA', 'THEN', 'BUT', 'PRON', 'AGAIN', 'QWORD', 'FILLER', 'REL', 'SUBJ', 'WH', 'COP', 'WHCOP', 'DEMO']) if (locale[cat]) add(locale[cat], cat);
  for (const [w, r] of Object.entries(locale.times)) add(w, 'TIME', { from: r[0], to: r[1] });
  for (const [w, c] of Object.entries(locale.comps)) add(w, 'COMP', { sign: c[0], sup: !!c[1] });
  for (const p of locale.PREP.split('|')) add(p, 'PREP', { canon: locale.preps[p] ?? [p] });
  // the calendar: weekdays and relative days (DAY), months (MONTH), named clock times (CLOCK), am/pm (AMPM)
  for (const [w, d] of Object.entries(locale.days ?? {})) add(w, 'DAY', typeof d === 'number' ? { dow: d } : { off: d.rel });   // off, not rel: rel is a relative clause downstream
  for (const [w, m] of Object.entries(locale.months ?? {})) add(w, 'MONTH', { m });
  for (const [w, c] of Object.entries(locale.clocks ?? {})) add(w, 'CLOCK', { h: c[0], mi: c[1] });
  if (locale.AMPM) add(locale.AMPM, 'AMPM');
  for (const [w, n] of Object.entries(locale.numbers ?? {})) add(w, 'NUM', { n });   // number words: "ninety", "half an", "a quarter of an"
  const L = k => `${k}_${locale.code}`;   // ontology synonym column for this locale, falling back to the default column
  const col = (o, k) => o[L(k)] ?? o[k];
  // a frame may take a subject before its verb ("pop means population"): it binds as the role 'subject'
  const VERBS = Object.fromEntries(ont.verbs.map(v => [v.name, v.subject ? { ...v, roles: { ...v.roles, subject: { preps: ['subject'], types: v.subject } } } : v]));
  for (const v of ont.verbs) add(col(v, 'words').join('|'), 'VERB', { verb: v.name });
  const NOUNS = Object.fromEntries(ont.nouns.map(n => [n.type, n]));
  for (const n of ont.nouns) {
    // exact: proper names (places, files) are matched as written, never a typo repair's or a stem's target
    for (const [value, words] of Object.entries(col(n, 'words') ?? {})) add(words.join('|'), 'NOUN', { type: n.type, value, ...(n.exact ? { exact: true } : {}) });
    if (col(n, 'generic')) add(col(n, 'generic').join('|'), 'NOUN', { type: n.type, value: null, generic: true });
  }
  for (const u of ont.units) add(col(u, 'words').join('|'), 'UNIT', { dim: u.dim, unit: u.unit });
  for (const w of col(ont, 'fillers') ?? []) if (!LEX[w]) add(w, 'FILLER');   // host words that carry nothing ("golem" in "hey golem")
  const MULTI = Object.keys(LEX).filter(k => k.includes(' ')).map(k => k.split(' ')).sort((a, b) => b.length - a.length);
  const SINGLE = Object.keys(LEX).filter(k => !k.includes(' '));
  const CONTENT = new Set(Object.keys(LEX).filter(k => LEX[k].some(s => ['NOUN', 'VERB', 'UNIT'].includes(s.cat) && !s.exact)));
  const STEMS = {};   // stem → senses of content words, so inflected forms nobody listed still resolve
  for (const k of CONTENT) if (!k.includes(' ')) (STEMS[locale.stem(k)] ??= []).push(...LEX[k].filter(s => ['NOUN', 'VERB', 'UNIT'].includes(s.cat) && !s.exact).map(s => ({ ...s, lexeme: k })));
  const NEEDS_ID = new Set(ont.nouns.filter(n => n.needsId).map(n => n.type));

  // ---- type-driven helpers used inside the grammar ----
  const X = {
    headFirst: !!locale.headFirst,
    nextDay: locale.THEN.split('|').includes('next'),
    indefinite: locale.indefinite ?? [],
    subject: ont.verbs.some(v => v.subject),   // some frame takes a subject before its verb
    // a role with no marker ("decode hex 676f", "9am sao paulo in perth"): only things of the types such roles take
    bareTypes: new Set(ont.verbs.flatMap(v => Object.values(v.roles ?? {}).filter(r => r.preps.includes('')).flatMap(r => r.types))),   // "next friday" where the bank has the word
    identTypes: new Set(ont.nouns.filter(n => n.ident).map(n => n.type)),
    postmodPreps: [...new Set(ont.postmods.map(p => p.prep))],
    postmodQuantity: new Set(ont.postmods.filter(p => p.quantity).map(p => p.prep)),
    compound(a, h) {
      if (a.type === h.type && !a.generic && h.generic) return { ...h, value: a.value, generic: false };
      for (const c of ont.compounds) if (c.mod === a.type && c.heads.includes(h.type)) return { ...h, attrs: { ...h.attrs, [c.attr]: a.value ?? '?' } };
      return null;
    },
    postmod(n, m) {
      if (m.rel) { if (!X.identTypes.has(n.type) || n.type === 'search') return null; return { rel: { ...(n.rel ?? {}), ...m.rel }, generic: false }; }
      if (m.qmod) return X.qmod(m.q, n) ? { attrs: { ...n.attrs, [ont.qmods.find(x => x.head === n.type).attr]: m.q }, generic: false } : null;
      for (const p of ont.postmods) {
        if (p.prep !== m.prep || !p.heads.includes(n.type)) continue;
        if (p.quantity) { if (!m.q) continue; return { attrs: { ...n.attrs, [p.attr]: m.q } }; }
        if (m.np && m.np.type === p.mod) return { attrs: { ...n.attrs, [p.attr]: p.byName ? (m.np.name ?? m.np.ref ?? '?') : m.np.value } };
      }
      return null;
    },
    qmod(q, h) {
      for (const m of ont.qmods) if (m.head === h.type && m.dims.includes(q.dim)) return { ...h, attrs: { ...h.attrs, [m.attr]: q }, generic: false };
      return null;
    },
  };
  const R = buildGrammar(X);

  // ---- tokenizer ----
  // pieces of the input with their offsets: a line break or a colon before a space is a COLON (it opens a
  // payload), comparison signs stand alone, a number may carry a sign and thousands separators, and a colon
  // inside a word (09:30) stays in it
  const PIECE = /\r?\n\s*|:(?=\s|$)|[,?!]|[<>]=?|[=≤≥]|-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?:[^\s,?!<>=≤≥:]|:(?!\s|$))+/g;
  const SHAPES = (ont.shapes ?? []).map(x => ({ type: x.type, re: new RegExp(`^(?:${x.re})$`, x.flags ?? 'i'), at: new RegExp(`(?:${x.re})`, (x.flags ?? 'i') + 'y') }));
  // shapes the grammar knows itself: clock times (09:30, 9pm, 9h30) and ISO dates
  const clockOf = w => { let m = /^(\d{1,2}):(\d{2})(am|pm)?$/.exec(w) || /^(\d{1,2})()(am|pm)$/.exec(w) || /^(\d{1,2})h(\d{2})?()$/.exec(w); if (!m) return null;
    let h = +m[1]; const mi = m[2] ? +m[2] : 0; if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; return h <= 24 && mi < 60 && (!m[3] || +m[1] <= 12) ? { cat: 'CLOCK', h, mi } : null; };
  const dateOf = w => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w); return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? { cat: 'DATE', y: +m[1], m: +m[2], d: +m[3] } : null; };
  function tokenize(text, session) {
    const raw = [...text.matchAll(PIECE)].map(m => ({ w: /^\r?\n/.test(m[0]) ? ':' : m[0].toLowerCase(), s: m.index, e: m.index + m[0].replace(/\s+$/, '').length, src: m[0] }));
    for (let k = raw.length - 1; k > 0; k--) if (raw[k].w === ':' && raw[k - 1].w === ':') raw.splice(k, 1);   // "check:\n…" is one break
    const end = raw.at(-1); if (end && end.w.length > 1 && end.w.endsWith('.') && !/^\d|\.\w+\.$/.test(end.w)) { end.w = end.w.slice(0, -1); end.e--; end.src = end.src.replace(/\.(\s*)$/, '$1'); }   // a full stop ends the sentence, not the word (a.m. keeps its own)
    const toks = []; const notes = []; const unknown = [];
    const at = (t, a, b) => Object.assign(t, { s: raw[a].s, e: raw[b - 1].e });
    for (let i = 0; i < raw.length;) {
      let span = null;   // a shape over several pieces, ending where a piece (never a line break) ends
      for (const sh of SHAPES) { sh.at.lastIndex = raw[i].s; const m = sh.at.exec(text); if (!m) continue; const end = raw[i].s + m[0].length, k = raw.findIndex((r, x) => x > i && r.e === end && r.e > r.s); if (k > i && (!span || k > span.k)) span = { k, type: sh.type }; }
      if (span) { const types = SHAPES.filter(sh => { sh.at.lastIndex = raw[i].s; const m = sh.at.exec(text); return m && raw[i].s + m[0].length === raw[span.k].e; }).map(sh => sh.type);
        toks.push(at({ word: text.slice(raw[i].s, raw[span.k].e).toLowerCase(), senses: types.map(type => ({ cat: 'LIT', type, value: text.slice(raw[i].s, raw[span.k].e) })) }, i, span.k + 1)); i = span.k + 1; continue; }
      let hit = null;
      let mwPlural = false;
      for (const mw of MULTI) if (mw.every((w, k) => raw[i + k]?.w === w || (k === mw.length - 1 && raw[i + k] && locale.stem(raw[i + k].w) === locale.stem(w) && LEX[mw.join(' ')].some(x => x.cat === 'NOUN')))) { hit = mw; mwPlural = locale.plural(raw[i + mw.length - 1].w); break; }
      if (hit) { const w = hit.join(' '); if (LEX[w][0].cat !== 'FILLER') toks.push(at({ word: w, senses: mwPlural ? LEX[w].map(x => x.cat === 'NOUN' ? { ...x, plural: true } : x) : LEX[w] }, i, i + hit.length)); i += hit.length; continue; }
      const i0 = i, w = raw[i++].w, src = raw[i0].src.trim();
      if (w === '?' || w === '!') continue;
      if (w === ':') { toks.push(at({ word: ':', senses: [{ cat: 'COLON' }] }, i0, i)); continue; }
      // a filler that is also a unit is the unit right after a number ("75 um"); elsewhere it is a filler ("um, what is …")
      if (LEX[w] && LEX[w][0].cat === 'FILLER' && toks.at(-1)?.senses.some(x => x.cat === 'NUM') && LEX[w].some(x => x.cat === 'UNIT')) { toks.push(at({ word: w, senses: LEX[w].filter(x => x.cat === 'UNIT') }, i0, i)); continue; }
      if (LEX[w]) { if (LEX[w][0].cat !== 'FILLER') { const plural = locale.plural(w); toks.push(at({ word: w, senses: plural ? LEX[w].map(x => x.cat === 'NOUN' ? { ...x, plural } : x) : LEX[w] }, i0, i)); } continue; }
      const lit = [clockOf(w), dateOf(w), ...SHAPES.filter(x => x.re.test(src)).map(x => ({ cat: 'LIT', type: x.type, value: src }))].filter(Boolean);
      // a number glued to a unit the lexicon knows is the two of them: "5km", "45.2%", "2.7g/cm3"
      const glued = !lit.length && /^(-?\d+(?:\.\d+)?)([^\d\s.,-].*)$/.exec(w);
      if (glued && LEX[glued[2]]?.some(s => s.cat === 'UNIT')) { const cut = raw[i0].s + glued[1].length; toks.push({ word: glued[1], senses: [{ cat: 'NUM', n: parseFloat(glued[1]) }], s: raw[i0].s, e: cut }, { word: glued[2], senses: LEX[glued[2]].filter(s => s.cat === 'UNIT'), s: cut, e: raw[i0].e }); continue; }
      const num = /^-?\d+(\.\d+)?$/.test(w) || /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(w) ? [{ cat: 'NUM', n: parseFloat(w.replace(/,/g, '')) }] : [];
      if (lit.length || num.length) { toks.push(at({ word: w, senses: [...num, ...lit] }, i0, i)); continue; }
      if (session?.names?.[w]) { toks.push(at({ word: w, senses: [{ cat: 'IDENT', name: w, type: session.names[w] }] }, i0, i)); continue; }
      if (/^[a-z]+\d+$/.test(w)) { toks.push(at({ word: w, senses: [{ cat: 'IDENT', name: w }] }, i0, i)); continue; }
      const st = STEMS[locale.stem(w)];
      if (st) { const plural = locale.plural(w); toks.push(at({ word: w, senses: st.map(s => ({ ...s, plural })), stemmed: true }, i0, i)); continue; }
      const tol = w.length < 7 ? 1 : 2;
      const cands = SINGLE.filter(k => k.length > 2 && CONTENT.has(k) && dl(w, k) <= tol);   // never repair into a function word
      if (cands.length === 1) { notes.push(`read "${w}" as "${cands[0]}"`); toks.push(at({ word: cands[0], senses: LEX[cands[0]], repaired: w }, i0, i)); continue; }
      if (cands.length > 1) notes.push(`"${w}" could be ${cands.map(c => `"${c}"`).join(' / ')} — not guessing`);
      unknown.push(w); toks.push(at({ word: w, senses: [{ cat: 'UNK' }] }, i0, i));
    }
    while (toks[0]?.senses.every(x => x.cat === 'COMMA')) toks.shift();   // "hey golem, …": the filler went, its comma goes too
    while (toks.at(-1)?.senses.every(x => x.cat === 'COMMA')) toks.pop();
    return { toks, notes, unknown };
  }

  // terminal match: a token yields one node per matching sense (lexical ambiguity lives here)
  const term = (sym, t) => {
    const [cat, word] = sym.split(':');
    return t.senses.filter(s => s.cat === cat && (!word || t.word === word || (cat === 'PREP' && s.canon.includes(word)))).map(s => ({ ...s, word: t.word }));
  };
  const FAB = { PREP: () => ({ cat: 'PREP', word: '∅', canon: ['*'] }), DET: () => ({ cat: 'DET', word: '∅' }), LATE: () => ({ cat: 'LATE' }) };
  // repair costs — a dozen numbers, calibrated by calib.mjs against the mutation benchmark
  const COSTS = { skipFunc: 0.5, skipUnk: 0.6, skipContent: 1.5, skipTagged: 2, skipO: 0.5, insPrep: 1, insPrepTagged: 0.5, insDet: 0.5, order: 1, subst1: 0.4, subst2: 1.2, substKnown: 2 };
  const NEAR_POOL = Object.keys(LEX).filter(k => !k.includes(' ') && LEX[k].some(x => ['NOUN', 'VERB', 'UNIT', 'PREP'].includes(x.cat) && !x.exact));
  const CONTENT_CATS = ['NOUN', 'VERB', 'UNIT', 'NUM', 'IDENT', 'PREP'];
  function makeParser(toks, repair) {
    // repair = { budget, tags?, costs? } — tags (from a slot tagger) shape the costs: cheap to skip an O token,
    // dear to skip a role token, cheap to insert a preposition right before a role span
    let opts = {};
    if (repair?.budget) {
      const K = { ...COSTS, ...(repair.costs ?? {}) };
      const tag = i => repair.tags?.[i] ?? null;
      const nearCache = new Map();
      const nearFor = i => {   // content lexemes within edit distance 2 of this token, once per token
        if (nearCache.has(i)) return nearCache.get(i);
        const w = toks[i].word; const out = [];
        if (w.length >= 2 && !/^\d/.test(w)) {
          for (const k of NEAR_POOL) { if (Math.abs(k.length - w.length) > 2) continue; const d = dl(w, k); if (d >= 1 && d <= 2 && (d === 1 || w.length >= 5)) for (const s of LEX[k]) if (CONTENT_CATS.includes(s.cat) && !s.exact) out.push({ v: { ...s, word: k }, cost: (d === 1 ? K.subst1 : K.subst2) * (toks[i].senses.every(x => x.cat === 'UNK') ? 1 : K.substKnown), to: k }); }
          for (const [name, type] of Object.entries(repair.names ?? {})) { const d = dl(w, name); if (d === 1) out.push({ v: { cat: 'IDENT', name, type, word: name }, cost: K.subst1, to: name }); }
        }
        nearCache.set(i, out); return out;
      };
      opts = { budget: repair.budget,
        skip: i => tag(i) && tag(i) !== 'O' ? K.skipTagged : toks[i].senses.every(x => x.cat === 'UNK') ? K.skipUnk : tag(i) === 'O' ? K.skipO : toks[i].senses.some(x => CONTENT_CATS.includes(x.cat)) ? K.skipContent : K.skipFunc,
        insert: (sym, i) => sym === 'PREP' ? (tag(i)?.startsWith('R_') ? K.insPrepTagged : K.insPrep) : sym === 'DET' ? K.insDet : sym === 'LATE' ? K.order : Infinity,
        near: (sym, i) => { const [cat, word] = sym.split(':'); return nearFor(i).filter(x => x.v.cat === cat && (!word || x.v.word === word)); },
        fabricate: sym => FAB[sym]?.() ?? null };
    }
    const C = chart(R, toks, term, 'Program', opts);
    const parse = (sym, i) => C.spans(sym, i).flatMap(j => C.derive(sym, i, j).map(d => ({ node: d.v, end: j, cost: d.cost, repairs: d.repairs })));
    parse.chart = C;
    return parse;
  }
  const describeRepairs = (toks, repairs) => repairs.map(r => r.op === 'skip' ? `ignored "${r.word}"` : r.op === 'subst' ? `read "${r.word}" as "${r.to}"` : r.sym === 'LATE' ? 'read the arguments out of order' : `assumed ${r.sym === 'PREP' ? 'a preposition' : 'an article'} before "${toks[r.at]?.word ?? 'the end'}"`);
  // human names for the terminals the chart was waiting for
  const EXPECT = { NOUN: 'a thing', VERB: 'a verb', DET: 'an article', PREP: 'a preposition', NUM: 'a number', UNIT: 'a unit', IDENT: 'a name', CONJ: `'${locale.CONJ.split('|')[0]}'`, THEN: `'${locale.THEN.split('|')[0]}'`, COMMA: "','", QUANT: 'a quantifier', REF: `'${locale.REF.split('|')[0]}'`, PRON: 'a pronoun', REL: `'${locale.REL.split('|')[0]}'`, SUBJ: `'${locale.SUBJ.split('|')[0]}'`, TIME: 'a time', COMP: 'a comparative', WH: 'a question word', COP: `'${(locale.COP ?? 'is').split('|')[0]}'`, WHCOP: `'${(locale.WHCOP ?? 'what is').split('|')[0]}'`, EXCEPT: `'${locale.EXCEPT.split('|')[0]}'`, BUT: `'${locale.BUT.split('|')[0]}'`, AGAIN: `'${locale.AGAIN.split('|')[0]}'`, DAY: 'a date', MONTH: 'a date', DATE: 'a date', CLOCK: 'a clock time', AMPM: "'am' or 'pm'", COLON: "':'", LIT: 'a value', DEMO: `'${(locale.DEMO ?? 'this').split('|')[0]}'` };
  const expectName = sym => { const [cat, w] = sym.split(':'); if (cat === 'LATE' || cat === 'TEXT' || (cat === 'LIT' && !(ont.shapes ?? []).length)) return null; return w ? `'${w}'` : (EXPECT[cat] ?? cat); };

  // ---- binding ----
  const typeOf = v => v.type === 'quantity' ? `quantity:${v.dim}` : v.type;
  const typeOk = (want, v) => want === '*' || v.type === '*' || want === typeOf(v) || (v.type === 'quantity' && ((want === 'quantity:*' && v.dim !== 'bare') || (v.dim === 'bare' && want !== 'quantity:*' && want.startsWith('quantity:'))));   // a bare number fits a typed quantity slot (the unit is assumed), never an any-quantity one
  const lbl = verb => VERBS[verb].label.toLowerCase();

  function bind(cmd) {
    if (cmd.verb == null) return bindElided(cmd);
    const F = VERBS[cmd.verb]; const problems = [];
    let alts = [{ verb: cmd.verb, theme: null, roles: {} }];
    for (const a of cmd.args) {
      if (a.kind === 'np') {
        const bad = a.list.filter(n => !F.theme.some(t => typeOk(t, n)));
        if (bad.length) { problems.push(`"${lbl(cmd.verb)}" takes ${F.theme.join('/')}, not ${bad.map(describe).join(', ')}`); return { alts: [], problems }; }
        alts = alts.map(b => b.theme ? null : { ...b, theme: a.list }).filter(Boolean);
        if (!alts.length) problems.push('two things in object position — which one did you mean?');
        continue;
      }
      const byPrep = Object.entries(F.roles).filter(([, r]) => a.canon.includes('*') || r.preps.some(p => a.canon.includes(p)));
      if (!byPrep.length) { problems.push(`"${a.prep}" is not something ${lbl(cmd.verb)} understands`); return { alts: [], problems }; }
      for (const v of a.val) {
        const roles = byPrep.filter(([, r]) => r.types.some(t => typeOk(t, v)));
        if (!roles.length) {
          problems.push(`"${a.prep} ${describe(v)}": after "${a.prep}" ${lbl(cmd.verb)} expects ${byPrep.map(([k, r]) => `${k} (${r.types.join('/')})`).join(' or ')}`);
          return { alts: [], problems };
        }
        alts = alts.flatMap(b => roles.map(([k]) => ({ ...b, roles: { ...b.roles, [k]: [...(b.roles[k] ?? []), v] } })));
      }
    }
    return { alts, problems };
  }

  // no verb was said: try every frame the ontology marks elidable. Readings that bind survive; more than one
  // surviving frame is an ambiguity for the layer above, not a guess here.
  function bindElided(cmd) {
    const frames = ont.verbs.filter(v => v.elidable);
    const theme = cmd.args.find(a => a.kind === 'np');
    const what = theme ? theme.list.map(describe).join(', ') : 'that';
    if (!frames.length) return { alts: [], problems: [`no verb, and nothing in this vocabulary is asked for on its own (${what})`] };
    const alts = [], near = [];
    for (const F of frames) {
      const r = bind({ ...cmd, verb: F.name });
      if (r.alts.length) alts.push(...r.alts);
      else if (theme && theme.list.every(n => F.theme.some(t => typeOk(t, n)))) near.push(...r.problems);   // the thing fit, an argument did not
    }
    if (alts.length) return { alts, problems: [] };
    return { alts: [], problems: near.length ? [...new Set(near)] : [`no verb, and nothing takes ${what} on its own`] };
  }

  // ---- resolution ----
  function resolve(b, session, prev) {
    const missing = []; const notes = [];
    const F = VERBS[b.verb];
    const out = { verb: b.verb, theme: [], roles: {} };
    const fix = (list, slot) => list.flatMap(n => {
      if (n.type === 'quantity') return [n];
      if (n.pron) { const src = prev ?? session.last; if (!src?.theme?.length) { missing.push(`"${n.pron}" — nothing to refer to`); return []; } return src.theme; }
      // every X: the session's Xs; when the session holds none, the quantifier stays for the host ("every intercept" of a table)
      if (n.all) { const pool = session.objects.filter(o => o.type === n.type); if (!pool.length) return [n]; const ex = new Set(n.except.map(e => e.value)); return pool.filter(o => !ex.has(o.value)); }
      const now = session.now ?? 0; const DAY = 86400000;
      const relOk = o => { const r = n.rel; if (!r) return true;
        if (r.verb && o.by && o.by !== r.verb) return false;
        if (r.when && !(now - o.t >= r.when.from * DAY && now - o.t < r.when.to * DAY)) return false;
        return true; };
      if (n.rel && !n.ref) {
        let hits = session.objects.filter(o => o.type === n.type && Object.entries(n.attrs).every(([k, v]) => o.attrs?.[k] === v) && relOk(o));
        if (n.rel.cmp) { const key = o => o.attrs?.search?.n ?? o.attrs?.radius?.n ?? -Infinity; hits = hits.filter(o => key(o) > -Infinity).sort((a, b) => n.rel.cmp.sign === '+' ? key(b) - key(a) : key(a) - key(b)).slice(0, 1); }
        if (!hits.length) { missing.push(`no ${describe(n)} in session`); return []; }
        if (hits.length > 1 && !n.plural) { missing.push(`which ${n.type}? (${hits.map(describe).join(', ')})`); return []; }
        return [...hits].sort((a, b) => a.t - b.t);
      }
      if (n.cmp) {   // "a bigger search": scaled from the last command's value, or the session's extreme
        const last = session.last?.roles?.[slot]?.[0]; const base = last?.type === 'quantity' ? last : last?.attrs?.radius;
        const step = ont.scales?.[slot] ?? 1.5;
        if (n.cmp.sup || !base) { const pool = session.objects.map(o => o.attrs?.search ?? o.attrs?.radius).filter(q => q?.n != null); if (!pool.length) { missing.push(`${describe(n)} — ${P.than} what?`); return []; }
          const q = pool.sort((a, b) => n.cmp.sign === '+' ? b.n - a.n : a.n - b.n)[0]; return [{ ...q }]; }
        return [{ type: 'quantity', n: +(n.cmp.sign === '+' ? base.n * step : base.n / step).toFixed(1), unit: base.unit, dim: base.dim }];
      }
      if (n.ref) {
        const pool = session.objects.filter(o => o.type === n.type && (!n.attrs.variable || o.attrs?.variable === n.attrs.variable) && relOk(o)).sort((x, y) => y.t - x.t);
        const pick = locale.firstRef.includes(n.ref) ? pool.at(-1) : pool[0];
        if (!pick) { missing.push(`no ${n.ref} ${n.type}${n.attrs.variable ? ' for ' + n.attrs.variable : ''} in session`); return []; }
        return [pick];
      }
      if (n.name) { const o = session.objects.find(o => o.name === n.name); if (!o) { missing.push(`${n.type} "${n.name}" not found`); return []; } if (o.type !== n.type) { missing.push(`"${n.name}" is a ${o.type}, not a ${n.type}`); return []; } return [o]; }
      if (slot === 'object' && F.creates) return [{ ...n, fresh: true }];
      if (n.generic && n.value == null) {
        const hits = session.objects.filter(o => o.type === n.type && Object.entries(n.attrs).every(([k, v]) => o.attrs?.[k] === v));
        if (hits.length === 1 || (hits.length > 1 && n.plural)) return [...hits].sort((a, b) => a.t - b.t);   // plural = all of them, oldest first; singular with several matches asks
        if (NEEDS_ID.has(n.type)) {
          if (!hits.length) missing.push(NOUNS[n.type].words ? `which ${n.type}?` : `no ${describe(n)} in session`);
          else missing.push(`which ${n.type}? (${hits.map(describe).join(', ')})`);
          return [];
        }
      }
      return [n];
    });
    if (b.theme) out.theme = fix(b.theme, 'object');
    for (const [k, v] of Object.entries(b.roles)) out.roles[k] = fix(v, k);
    if (F.creates) for (const t of out.theme) { t.by = b.verb; t.t = session.now ?? 0; for (const k of ont.inherit) if (out.roles[k]?.length === 1) t.attrs = { ...t.attrs, [k]: out.roles[k][0].value }; }
    for (const [k, vs] of Object.entries(out.roles)) if (!vs.every(v => F.roles[k].types.some(t => typeOk(t, v)))) return { cmd: out, missing, notes, dead: true };
    if (b.theme && !out.theme.every(t => F.theme.some(ty => typeOk(ty, t)))) return { cmd: out, missing, notes, dead: true };
    for (const r of F.required) {
      if (r === 'theme') { if (!out.theme.length && !missing.length) missing.push(`${lbl(b.verb)} what?`); }
      else if (!out.roles[r]) missing.push(`missing ${r} (${F.roles[r].types.join('/')}) — say "${F.roles[r].preps[0]} …"`);
    }
    if (F.minTheme && out.theme.length + (out.roles.against?.length ?? 0) < F.minTheme) missing.push(`${lbl(b.verb)} needs at least ${F.minTheme} things`);
    for (const s of F.sanity ?? []) for (const v of out.roles[s.role] ?? []) for (const t of out.theme)
      if (v.attrs?.[s.attr] && t.value && v.attrs[s.attr] !== t.value) notes.push(`${describe(v)} was made for ${v.attrs[s.attr]}, this is ${t.value}`);
    for (const [k, vs] of Object.entries(out.roles)) for (const q of vs) if (q.type === 'quantity' && q.dim === 'bare') {
      const want = F.roles[k].types.find(t => t.startsWith('quantity:'))?.split(':')[1];
      const u = ont.units.find(u => u.dim === want); if (u) notes.push(`${P.assuming} ${q.n} ${u.unit}`);
    }
    return { cmd: out, missing, notes };
  }

  // ---- generator: canonical phrase in the active locale (the grammar run backwards, at the level the echo needs) ----
  const P = locale.phr;
  const typeName = t => (col(NOUNS[t] ?? {}, 'generic') ?? [t])[0];                      // "variogram" / "variograma"
  const valueName = (t, v) => t === 'variable' ? v : ((col(NOUNS[t] ?? {}, 'words') ?? {})[v]?.[0] ?? v);   // Cu stays Cu; "west" / "oeste"
  const roleLabel = k => (ont[`roleLabels_${locale.code}`] ?? {})[k] ?? k;
  function describe(n) {
    if (n.type === 'quantity') return `${n.n}${n.unit ? ' ' + n.unit : ''}`;
    if (n.type === 'unit') return n.unit;
    if (n.type === 'text') return n.value.length > 60 ? `"${n.value.slice(0, 57).trimEnd()}…"` : `"${n.value}"`;
    if (n.type === 'date' || n.type === 'clock') return n.value;
    if (n.type === '*') return n.pron ?? 'that';
    if (n.all) return `${locale.agree[locale.gender(typeName(n.type))]?.[P.every] ?? P.every} ${typeName(n.type)}${n.except?.length ? ` ${P.except} ` + n.except.map(describe).join(', ') : ''}`;
    if (n.attrs?.radius) return describe(n.attrs.radius);
    const head = n.value != null ? valueName(n.type, n.value) : typeName(n.type);
    const mods = [];                                                                    // adjective-like modifiers
    if (n.attrs?.model) mods.push(valueName('vmodel', n.attrs.model));
    if (n.attrs?.variable) mods.push(n.attrs.variable);
    if (n.attrs?.domain) mods.push(valueName('domain', n.attrs.domain));
    for (const c of ont.compounds) if (c.echo && n.attrs?.[c.attr] != null) mods.push(valueName(c.mod, n.attrs[c.attr]));   // "landlocked country"
    const g = locale.gender(head); const agree = w => locale.agree[g]?.[w] ?? w;
    const pre = []; if (n.fresh) pre.push(agree(P.new)); if (n.ref) pre.push(locale.firstRef.includes(n.ref) ? n.ref : locale.newRef.includes(n.ref) ? agree(P.new) : agree(P.last));
    if (n.cmp) pre.push(Object.entries(locale.comps).find(([, c]) => c[0] === n.cmp.sign && !!c[1] === n.cmp.sup)?.[0] ?? '');
    const post = [];
    if (n.name) post.push(n.name);
    for (const pm of ont.postmods) if (pm.prep === '' && pm.heads.includes(n.type) && n.attrs?.[pm.attr] != null) { const v = n.attrs[pm.attr]; post.push(typeof v === 'object' ? describe(v) : String(v)); }   // "bedding 045/30": a bare modifier is part of the name
    if (n.attrs?.run) post.push(`${P.fromRun} ${n.attrs.run}`);
    if (n.attrs?.length) post.push(describe(n.attrs.length));
    if (n.attrs?.above) post.push(`${P.above} ${describe(n.attrs.above)}`);
    if (n.attrs?.below) post.push(`${P.below} ${describe(n.attrs.below)}`);
    for (const k of ['atleast', 'atmost', 'equals']) if (n.attrs?.[k]) post.push(`${P[k] ?? k} ${describe(n.attrs[k])}`);
    if (n.rel?.when) post.push(Object.entries(locale.times).find(([, r]) => r[0] === n.rel.when.from && r[1] === n.rel.when.to)?.[0] ?? '');
    if (n.rel?.verb) post.push(`(${col(VERBS[n.rel.verb], 'words')[0]})`);
    const core = locale.headFirst ? [head, ...mods.map(m => /^[A-Z]/.test(m) ? `${P.of} ${m}` : m)] : [...mods, head];   // "variograma esférico de Cu" / "spherical Cu variogram"
    return [...pre, ...core, ...post].join(' ');
  }
  function echo(c) {
    const parts = [c.theme.length ? `${col(VERBS[c.verb], 'label')} ${c.theme.map(describe).join(', ')}` : col(VERBS[c.verb], 'label')];
    // every role the command has, the ontology's order first: two readings that differ only in a role must not echo the same
    for (const k of [...ont.echoOrder, ...Object.keys(c.roles).filter(k => !ont.echoOrder.includes(k)).sort()]) if (c.roles[k]?.length) { const vs = c.roles[k]; const redundant = vs.every(v => v.type === k && describe(v).includes(typeName(v.type))); parts.push(`${redundant ? '' : roleLabel(k) + ' '}${vs.map(describe).join(', ')}`); }
    return parts.join('; ') + '.';
  }

  function smallestDeadSpan(toks, C) {
    let best = null;
    for (const sym of ['Head', 'Core', 'NP', 'PostMod']) for (let i = 0; i < toks.length; i++) for (const j of C.spans(sym, i)) {
      if (j - i < 2 || C.derive(sym, i, j).length) continue;
      if (!best || j - i < best.len) best = { len: j - i, sym, i, j };
    }
    if (!best) return null;
    const words = toks.slice(best.i, best.j).map(t => t.word);
    const types = toks.slice(best.i, best.j).flatMap(t => t.senses.filter(s => s.cat === 'NOUN').map(s => s.type));
    const why = best.sym === 'Head' ? `a ${types[0] ?? 'thing'} does not modify a ${types.at(-1) ?? 'thing'}` : best.sym === 'PostMod' ? 'that modifier does not apply to this kind of thing' : 'these do not combine';
    return { text: words.join(' '), why };
  }
  function islands(toks, parse) {
    const segs = []; let i = 0;
    while (i < toks.length) {
      let best = null;
      for (const sym of ['Cmd', 'PP', 'NPList', 'Quantity']) for (const r of parse(sym, i)) if (r.end > i && (!best || r.end > best.end)) best = { sym, end: r.end };
      if (best) { segs.push({ text: toks.slice(i, best.end).map(t => t.word).join(' '), as: best.sym }); i = best.end; }
      else { const last = segs.at(-1); const w = toks[i].word; if (last && !last.as) last.text += ' ' + w; else segs.push({ text: w, as: null }); i++; }
    }
    return segs;
  }

  function ellipsis(c, session, problems) {
    if (!session.last) { problems.add('nothing to repeat yet'); return null; }
    const L = session.last; const F = VERBS[L.verb];
    const themeNP = c.args.find(a => a.kind === 'np');
    const args = [{ kind: 'np', list: themeNP ? themeNP.list : L.theme }];
    const overridden = new Set();
    for (const a of c.args.filter(a => a.kind === 'pp')) {
      const fits = Object.entries(F.roles).filter(([, r]) => (a.canon.includes('*') || r.preps.some(p => a.canon.includes(p))) && a.val.every(v => r.types.some(t => typeOk(t, v))));
      if (!fits.length && !themeNP && a.val.every(v => F.theme.some(t => typeOk(t, v)))) { args[0] = { kind: 'np', list: a.val }; continue; }
      args.push(a);
      for (const [k] of fits) overridden.add(k);
    }
    for (const [k, v] of Object.entries(L.roles)) if (!overridden.has(k)) args.push({ kind: 'pp', prep: F.roles[k].preps[0], canon: [F.roles[k].preps[0]], val: v });
    return { kind: 'cmd', verb: L.verb, args };
  }

  // A slot of type 'text' takes words verbatim: "remember that …", "remind me to … on friday", "check: …".
  // It opens after the verb of a frame whose theme is text (past an optional lead word such as "that"), after a
  // preposition a text role declares, or after a colon or line break when a role declares ':'. It ends at the
  // end of the input, or (unless it opened at a colon) before a preposition after which the rest still reads.
  // The shortest text that leaves a whole reading wins, wherever it opened: trailing arguments ("on friday at 9")
  // stay arguments, and "search my notes for resurvey" searches for "resurvey".
  // The words inside are never repaired, stemmed or looked up: the span becomes one TEXT token before parsing.
  const TEXT_THEME = new Set(ont.verbs.filter(v => (v.theme ?? []).includes('text')).map(v => v.name));
  const TEXT_PREPS = new Set(ont.verbs.flatMap(v => Object.values(v.roles ?? {}).filter(r => r.types.includes('text')).flatMap(r => r.preps)));
  const TEXT_PREP_FRAMES = {};   // prep → the frames with a text role on it
  for (const v of ont.verbs) for (const r of Object.values(v.roles ?? {})) if (r.types.includes('text')) for (const p of r.preps) (TEXT_PREP_FRAMES[p] ??= []).push(v);
  const MAX_TEXT_CANDS = 160;   // a bound on the strict parses tried with free text, for input nothing reads
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const TRAIL = new RegExp(`(?:[\\s,;]*(?:${(locale.TRAIL ?? 'please').split('|').map(esc).join('|')})\\b|[\\s.?!]+)+$`, 'i');   // what closes a sentence, not a text
  // a bare text role opens after the verb of its frame, or after a noun of that frame's theme type
  const BARE = ont.verbs.filter(v => Object.values(v.roles ?? {}).some(r => r.types.includes('text') && r.preps.includes('')));
  const BARE_VERBS = new Set(BARE.map(v => v.name)), BARE_TYPES = new Set(BARE.flatMap(v => v.theme ?? []));
  const BARE_TEXT = ont.verbs.filter(v => Object.values(v.roles ?? {}).some(r => r.types.includes('text') && r.preps.includes('')));
  const TEXT_SUBJECT = new Set(ont.verbs.filter(v => (v.subject ?? []).includes('text')).map(v => v.name));
  // candidate readings with free text: lists of spans [{ i, from, j }] (tokens i..j replaced, text from 'from'),
  // fewest words of text first; a subject span is the words before the verb of a frame that takes one
  function textCands(toks) {
    const one = textSpans(toks), cands = one.map(s => [s]);
    // the verb as typed (not a typo repair), and a subject with no colon and no verb in it as typed ("pop" is not "top")
    for (let v = 1; v < toks.length; v++) if (!toks[v].repaired && toks[v].senses.some(sn => sn.cat === 'VERB' && TEXT_SUBJECT.has(sn.verb)) && toks.slice(0, v).every(t => t.repaired || !t.senses.some(x => x.cat === 'COLON' || x.cat === 'VERB'))) {
      const subj = { i: 0, from: 0, j: v };
      cands.push([subj], ...one.filter(s => s.i > v).map(s => [subj, s]));
    }
    const len = c => c.reduce((n, s) => n + s.j - s.from, 0);
    return cands.sort((a, b) => len(a) - len(b) || a[0].i - b[0].i).slice(0, MAX_TEXT_CANDS);
  }
  function textSpans(toks) {
    const out = [];
    const said = new Set(toks.flatMap(t => t.senses.filter(s => s.cat === 'VERB').map(s => s.verb)));
    const meant = p => (TEXT_PREP_FRAMES[p] ?? []).some(v => v.elidable || said.has(v.name));
    for (let i = 1; i <= toks.length; i++) {
      let open = null, lead = 0;
      for (const sn of toks[i - 1].senses) {
        if (sn.cat === 'VERB' && TEXT_THEME.has(sn.verb)) { open ??= 'verb'; if (i + 1 < toks.length && (col(VERBS[sn.verb], 'lead') ?? []).includes(toks[i].word)) lead = 1; }
        else if (sn.cat === 'PREP' && sn.canon.some(c => TEXT_PREPS.has(c) && meant(c))) open ??= 'prep';
        else if (sn.cat === 'COLON' && TEXT_PREPS.has(':') && meant(':')) open = 'colon';
        if ((sn.cat === 'VERB' && BARE_VERBS.has(sn.verb)) || (sn.cat === 'NOUN' && BARE_TYPES.has(sn.type))) open ??= 'bare';
      }
      // a bare text role may also start at a word nothing else knows ("… 2% chalcopyrite"), where its frame is said or elidable
      if (!open && i < toks.length && toks[i].senses.every(x => x.cat === 'UNK') && BARE_TEXT.some(v => v.elidable || said.has(v.name))) open = 'bare';
      if (!open || (i === toks.length && open !== 'colon')) continue;
      if (open === 'colon') { out.push({ i, from: i, j: toks.length, colon: toks[i - 1].e }); continue; }   // a payload is everything after the colon
      const from = i + lead;
      const stop = t => t.senses.some(x => x.cat === 'PREP' || x.cat === 'DAY') || (X.nextDay && t.word === 'next');   // where an argument can start
      for (let j = from + 1; j <= toks.length; j++) if (j === toks.length || stop(toks[j])) out.push({ i, from, j });
    }
    return out.sort((a, b) => (a.j - a.from) - (b.j - b.from) || a.i - b.i);
  }
  function textRead(toks, text, session, diag, opts) {
    let fallback = null;
    for (const spans of textCands(toks)) {
      let tt = toks;
      let empty = false;
      for (const { i, from, j, colon } of [...spans].sort((a, b) => b.i - a.i)) {   // right to left, so the indices hold
        // after a colon: everything to the end, as typed. Elsewhere a span that runs to the end takes the words up
        // to the end too (a filler there may be content: "… is ok"), less the closing politeness and punctuation
        // that belong to the sentence ("…, please.", "… hole 12?"); a span that stops early stops at its last word.
        const s0 = colon != null ? colon : toks[from].s;
        const e = colon != null ? text.length : j === toks.length ? text.length - (TRAIL.exec(text)?.[0].length ?? 0) : toks[j - 1].e;
        const t = text.slice(s0, e).trim(); if (!t) { empty = true; break; }
        tt = [...tt.slice(0, i), { word: '«text»', senses: [{ cat: 'TEXT', text: t }], s: s0, e }, ...tt.slice(j)];
      }
      if (empty) continue;
      const full = makeParser(tt)('Program', 0).filter(r => r.end === tt.length).map(r => ({ ...r, repairs: [] }));
      if (!full.length) continue;
      const inside = new Set(spans.flatMap(({ from, j }) => toks.slice(from, j)).flatMap(x => [x.repaired, x.word]).filter(Boolean));
      const d2 = { ...diag, notes: diag.notes.filter(n => ![...inside].some(w => n.startsWith(`read "${w}" as`) || n.startsWith(`"${w}" could be`))), unknown: diag.unknown.filter(w => !inside.has(w)), repairs: [] };
      const r = semantic(full, tt, session, d2, opts);
      if (r.status === 'ok') { Object.assign(diag, d2); return r; }
      if (r.status !== 'reject' && !fallback) fallback = r;
    }
    return fallback;
  }

  const fanout = c => (VERBS[c.verb].distributive && c.theme.length > 1) ? c.theme.map(t => ({ ...c, theme: [t] })) : [c];

  function understand(text, session, opts = {}) {
    const { toks, notes, unknown } = tokenize(text, session);
    const diag = { notes, unknown, coverage: null, parses: 0, repairs: [] };
    if (!toks.length) return { status: 'reject', reasons: ['nothing to parse'], diag };
    const isQ = toks[0].senses.some(s => s.cat === 'QWORD'), isUnk = toks[0].senses.every(s => s.cat === 'UNK');
    const parse = makeParser(toks);
    const strictFull = isUnk ? [] : parse('Program', 0).filter(r => r.end === toks.length).map(r => ({ ...r, repairs: [] }));
    diag.parses = strictFull.length;
    let result = strictFull.length ? semantic(strictFull, toks, session, diag, opts) : null;
    if ((!result || result.status !== 'ok') && (TEXT_THEME.size || TEXT_PREPS.size || TEXT_SUBJECT.size || BARE.length)) {   // a free-text slot, before any repair
      const t = textRead(toks, text, session, diag, opts);
      if (t && (t.status === 'ok' || !result)) return t;
    }
    if ((!result || result.status === 'reject') && opts.repair?.budget) {
      // error-correcting pass: candidate derivations by ascending repair cost; the first tier that survives binding wins
      const P2 = makeParser(toks, { ...opts.repair, names: session.names }); const C2 = P2.chart;
      const all = P2('Program', 0).flatMap(r => { let c = r.cost; const extra = []; for (let k = r.end; k < toks.length; k++) { c += C2.skipCost(k); extra.push({ op: 'skip', at: k, word: toks[k].word }); } return c <= opts.repair.budget && c > 0 ? [{ ...r, cost: c, repairs: [...r.repairs, ...extra] }] : []; });
      for (const cost of [...new Set(all.map(r => r.cost))].sort((a, b) => a - b)) {
        const d2 = { ...diag, repairs: [], repairCost: cost };
        const r2 = semantic(all.filter(r => r.cost === cost), toks, session, d2, opts);
        if (r2.status !== 'reject') { Object.assign(diag, d2); return r2; }
      }
    }
    if (result) return result;
    if (isQ) return { status: 'outofscope', reasons: ['an open question — I read closed ones (what is …, which … are …), the rest needs the tier above'], diag };
    if (isUnk) return { status: 'reject', reasons: [`"${toks[0].word}" is not a verb I know`], diag };
    return semantic([], toks, session, diag, opts);   // no parse at all: chart diagnostics
  }
  function semantic(full, toks, session, diag, opts) {
    const repairsOf = full.map(r => r.repairs); full = full.map(r => r.node);
    if (!full.length) {
      const parse = makeParser(toks); const C = parse.chart;
      diag.coverage = islands(toks, parse);
      const stuck = diag.coverage.filter(s => !s.as).map(s => `"${s.text}"`);
      const got = diag.coverage.filter(s => s.as).map(s => `"${s.text}"`);
      const at = C.furthest;   // the chart died here: this token could not be scanned
      const exp = [...new Set(C.expected().map(expectName).filter(Boolean))].sort();
      diag.expected = exp; diag.stoppedAt = at;
      const where = at < toks.length ? `at "${toks[at].word}"` : 'at the end';
      const reasons = [];
      if (stuck.length) reasons.push(`understood ${got.join(', ') || 'nothing'}; could not place ${stuck.join(', ')}`);
      else if (diag.coverage[0]?.as === 'Cmd' && diag.coverage.length > 1) reasons.push(`understood "${diag.coverage[0].text}"; "${diag.coverage.slice(1).map(r => r.text).join(' ')}" is left over`);
      // the grammar accepted the whole input but the type actions killed every reading: name the smallest span that died
      const dead = at === toks.length ? smallestDeadSpan(toks, C) : null;
      if (dead) reasons.push(`"${dead.text}" fits the grammar but not the types — ${dead.why}`);
      else reasons.push(`stopped ${where}${at < toks.length && !toks[at].senses.some(s => s.cat !== 'UNK') ? ' (unknown word)' : ''}; expected ${exp.length ? exp.join(', ') : 'nothing more'}`);
      return { status: 'reject', reasons, diag };
    }

    const readings = []; const perParse = []; const readingParse = [];
    for (const [pi, prog] of full.entries()) {
      let seqAlts = [[]]; let dead = false; const problems = new Set();
      for (const c of prog) {
        const cmd = c.kind === 'again' ? ellipsis(c, session, problems) : c;
        if (!cmd) { dead = true; break; }
        const { alts, problems: p } = bind(cmd);
        p.forEach(x => problems.add(x));
        if (!alts.length) { dead = true; break; }
        seqAlts = seqAlts.flatMap(s => alts.map(a => [...s, a]));
      }
      perParse.push(problems);
      if (!dead) for (const s of seqAlts) { readings.push(s); readingParse.push(pi); }
    }
    const problems = perParse.sort((a, b) => a.size - b.size)[0] ?? new Set();
    const seen = new Map();
    for (const [ri, r] of readings.entries()) { const k = JSON.stringify(r); if (!seen.has(k)) seen.set(k, { r, pi: readingParse[ri] }); }
    const uniq = [...seen.values()].map(x => x.r); const uniqParse = [...seen.values()].map(x => x.pi);
    if (!uniq.length) return { status: 'reject', reasons: [...problems], diag };

    const resolved = uniq.map(seq => { let prev = null; return seq.map(b => { const r = resolve(b, session, prev); prev = r.cmd; return r; }); });
    const alive = resolved.filter(seq => seq.every(r => !r.dead));
    if (!alive.length) return { status: 'reject', reasons: ['a reference resolved to the wrong kind of thing for every reading'], diag };
    const clean = alive.filter(seq => seq.every(r => !r.missing.length));
    if (!clean.length) {
      const missing = [...new Set(alive.flatMap(seq => seq.flatMap(r => r.missing)))];
      return { status: 'clarify', reasons: missing, partial: alive[0].map(r => echo(r.cmd)), diag };
    }
    const echos = clean.map(seq => seq.map(r => echo(r.cmd)).join(` ${P.then}: `));
    const distinct = [...new Set(echos)];
    // each reading's commands come along, so a host whose tools take only one of them can say which and why
    if (distinct.length > 1) return { status: 'ambiguous', reasons: ['more than one reading survives'], readings: distinct, alternatives: distinct.map(e => clean[echos.indexOf(e)].map(r => r.cmd).flatMap(fanout)), diag };

    const cmds = clean[0].map(r => r.cmd).flatMap(fanout);
    const rawRepairs = repairsOf[uniqParse[resolved.indexOf(clean[0])]] ?? [];
    diag.repairs = describeRepairs(toks, rawRepairs);
    // a repair that discarded words it does not know is a guess, not an understanding: ask, showing what it would do
    const droppedUnknown = rawRepairs.filter(r => r.op === 'skip' && toks[r.at].senses.every(x => x.cat === 'UNK')).map(r => `"${r.word}"`);
    if (droppedUnknown.length) return { status: 'clarify', reasons: [`did not understand ${droppedUnknown.join(', ')} — ignore ${droppedUnknown.length > 1 ? 'them' : 'it'}?`], partial: cmds.map(echo), repaired: true, diag };
    diag.notes.push(...clean[0].flatMap(r => r.notes), ...diag.repairs);
    session.last = cmds.at(-1); session.history.push(...cmds);
    return { status: 'ok', commands: cmds, echo: cmds.map(echo).join(` ${P.then}: `), repaired: diag.repairs.length > 0, diag };
  }

  // ───────────────────────────── predictive input ─────────────────────────────
  // suggest(text): what can come next, filtered by grammar (chart expectations), frame (roles still open)
  // and session (objects of the right type). preview(text): echo of what is understood so far, with a hole.
  const surfacePreps = canon => { const ws = locale.PREP.split('|').filter(w => (locale.preps[w] ?? [w]).includes(canon)); return ws.length ? ws.slice(0, 1) : [canon]; };
  function suggest(text, session, limit = 8) {
    const partial = /\S$/.test(text) ? text.split(/\s+/).at(-1).toLowerCase() : '';
    const head = partial ? text.slice(0, text.length - partial.length) : text;
    const { toks } = tokenize(head, session);
    const out = [];
    const push = (word, kind) => { if (!out.some(o => o.word === word) && (!partial || word.toLowerCase().startsWith(partial))) out.push({ word, kind }); };
    if (!toks.length) { for (const v of ont.verbs) push(col(v, 'words')[0], 'verb'); for (const w of locale.AGAIN.split('|').slice(0, 1)) push(w, 'verb'); return out.slice(0, limit); }
    const C = chart(R, toks, term, 'Program');
    if (C.furthest < toks.length) return [];                             // already broken; nothing sensible follows
    const exp = new Set(C.expected());
    const verbTok = [...toks].reverse().find(t => t.senses.some(s => s.cat === 'VERB'));
    const F = verbTok ? VERBS[verbTok.senses.find(s => s.cat === 'VERB').verb] : null;
    const F0 = F ?? (toks.some(t => t.senses.some(s => s.cat === 'AGAIN')) && session.last ? VERBS[session.last.verb] : null);
    // roles already used in this clause (approximate: by preposition canon since the verb)
    const since = verbTok ? toks.lastIndexOf(verbTok) : 0;
    const usedCanon = toks.slice(since).flatMap(t => t.senses.filter(s => s.cat === 'PREP').flatMap(s => s.canon));
    const open = F0 ? Object.entries(F0.roles).filter(([, r]) => !r.preps.some(p => usedCanon.includes(p))) : [];
    const lastTok = toks.at(-1);
    const inList = lastTok?.senses.some(s => s.cat === 'CONJ' || s.cat === 'COMMA');
    const lastPrep = inList ? [...toks.slice(since)].reverse().find(t => t.senses.some(s => s.cat === 'PREP'))?.senses.find(s => s.cat === 'PREP') : lastTok?.senses.find(s => s.cat === 'PREP');
    const objectsOf = types => session.objects.filter(o => types.some(t => t === '*' || o.type === t));
    const wordsOf = t => { const n = NOUNS[t]; if (!n) return []; return [...Object.keys(col(n, 'words') ?? {}).map(v => valueName(t, v)), ...(col(n, 'generic') ?? []).slice(0, 1)]; };
    const nameOf = o => o.name ?? valueName(o.type, o.value);
    if (lastPrep && F0) {                                                  // after a preposition: things the open roles accept
      const roles = Object.entries(F0.roles).filter(([, r]) => r.preps.some(p => lastPrep.canon.includes(p)));
      for (const [, r] of roles) {
        for (const o of objectsOf(r.types)) push(nameOf(o), 'object');
        for (const t of r.types) { if (t.startsWith('quantity')) { const u = ont.units.find(u => u.dim === t.split(':')[1]); push(`200 ${u ? col(u, 'words')[0] : ''}`.trim(), 'value'); } else for (const w of wordsOf(t)) push(w, 'value'); }
      }
    } else if (F0 && (exp.has('NOUN') || exp.has('DET')) && (since === toks.length - 1 || (inList && !lastPrep))) {   // theme position (or continuing the theme list)
      for (const t of F0.theme) { for (const o of objectsOf([t])) push(nameOf(o), 'object'); for (const w of wordsOf(t)) push(w, 'value'); }
      if (F0.theme.includes('*')) for (const o of session.objects.filter(o => o.name)) push(o.name, 'object');
    }
    if (exp.has('PREP') && F0) for (const [k, r] of open) for (const p of surfacePreps(r.preps[0])) push(p, `role:${roleLabel(k)}`);
    if (exp.has('TIME')) for (const w of Object.keys(locale.times).slice(0, 4)) push(w, 'time');
    if (exp.has('COMP')) for (const w of Object.keys(locale.comps).slice(0, 2)) push(w, 'comparative');
    if (exp.has('SUBJ') || exp.has('REL')) push(locale.SUBJ.split('|')[0], 'relative');
    if (exp.has('CONJ')) push(locale.CONJ.split('|')[0], 'and');
    if (exp.has('THEN')) push(locale.THEN.split('|')[0], 'then');
    if (exp.has('EXCEPT')) push(locale.EXCEPT.split('|')[0], 'except');
    if (exp.has('VERB')) for (const v of ont.verbs) push(col(v, 'words')[0], 'verb');
    return out.slice(0, limit);
  }
  function preview(text, session) {
    const { toks } = tokenize(text, session);
    if (!toks.length) return null;
    const C = chart(R, toks, term, 'Program');
    const ends = C.spans('Cmd', 0).filter(j => j <= toks.length).sort((a, b) => b - a);
    for (const j of ends) {                                                // longest prefix that is a whole command
      for (const { v: c } of C.derive('Cmd', 0, j)) {
        const cmd = c.kind === 'again' ? ellipsis(c, session, new Set()) : c; if (!cmd) continue;
        const { alts } = bind(cmd); if (!alts.length) continue;
        const r = resolve(alts[0], session, null); if (r.dead) continue;
        let e = echo(r.cmd).replace(/\.$/, '');
        const tail = toks.slice(j); const prep = tail.find(t => t.senses.some(s => s.cat === 'PREP'))?.senses.find(s => s.cat === 'PREP');
        const F = VERBS[r.cmd.verb];
        if (prep) { const k = Object.entries(F.roles).find(([, ro]) => ro.preps.some(p => prep.canon.includes(p)))?.[0]; e += `; ${k ? roleLabel(k) : prep.word} ${P.hole}`; }
        else if (r.missing.length) e += `; ${P.hole}`;
        return { echo: e + '.', complete: j === toks.length && !r.missing.length, missing: r.missing };
      }
    }
    return null;
  }
  // assemble: a verb plus role→text groups (e.g. from a slot tagger) go through the same binder and resolver
  // as parsed input, so a statistical tagger's guess still has to type-check before it becomes a call.
  function assemble({ verb, theme, roles }, session) {
    const F = VERBS[verb]; if (!F) return { status: 'reject', reasons: [`unknown verb ${verb}`] };
    const np = text => { const { toks } = tokenize(text, session); if (!toks.length) return null; const C = chart(R, toks, term, 'NPList'); const vs = C.derive('NPList', 0, toks.length); return vs.length ? vs[0].v : null; };
    const args = [];
    if (theme) { const l = np(theme); if (!l) return { status: 'reject', reasons: [`cannot read object "${theme}"`] }; args.push({ kind: 'np', list: l }); }
    for (const [k, text] of Object.entries(roles)) {
      if (!F.roles[k]) return { status: 'reject', reasons: [`${verb} has no role ${k}`] };
      const l = np(text); if (!l) return { status: 'reject', reasons: [`cannot read ${k} "${text}"`] };
      args.push({ kind: 'pp', prep: F.roles[k].preps[0], canon: [F.roles[k].preps[0]], val: l });
    }
    const { alts, problems } = bind({ kind: 'cmd', verb, args });
    if (!alts.length) return { status: 'reject', reasons: problems };
    const r = resolve(alts[0], session, null);
    if (r.dead) return { status: 'reject', reasons: ['type check failed'] };
    if (r.missing.length) return { status: 'clarify', reasons: r.missing };
    const cmds = fanout(r.cmd);
    return { status: 'ok', commands: cmds, echo: cmds.map(echo).join(` ${P.then}: `) };
  }
  return { understand, suggest, preview, assemble, echo, describe, tokenize, LEX, VERBS, NOUNS, ont, locale };
}

// the clock a session is born with when the host gives none: day 20, so relative times
// ("yesterday", "last week") have room to resolve in demos and tests
const DEMO_NOW = 20 * 86400000;
function makeSession(objects = [], now = DEMO_NOW) {
  const names = Object.fromEntries(objects.filter(o => o.name).map(o => [o.name, o.type]));
  return { objects, names, last: null, history: [], now };
}

// ── src/grammar/frames-from.js ──

// @gcu/dispatch grammar — ontology from tool signatures (the adoptMcpTool bridge for the frame kind).
// Input: an MCP-style tool list (name, description, inputSchema with JSON-schema properties).
// Output: clause verb frames + noun types for enums, mergeable into a hand ontology.
// The only thing not in a signature is which preposition introduces which argument; that's a
// small role-name heuristic table, overridable per parameter with "x-preps".

// preposition heuristic by role name (English canon). Locale banks translate from these.
const PREP_BY_ROLE = [
  [/^(domain|zone|region|area|in)$/, ['in', 'for']],
  [/^(source|from|input|data)$/, ['from', 'using']],
  [/^(target|into|output|destination)$/, ['into', 'to']],
  [/^(format|as)$/, ['as', 'to']],
  [/^(threshold|cap|cutoff|limit)$/, ['at', 'to', 'above']],
  [/^(length|size|interval)$/, ['to', 'at', 'by']],
  [/(radius|search|neighbou?rhood)$/, ['with', 'using']],
  [/^(variable|for|of)$/, ['for', 'to', 'on']],
  [/^(against|versus|vs)$/, ['with', 'to', 'against']],
];
const prepsFor = (name, schema) => schema['x-preps'] ?? (PREP_BY_ROLE.find(([re]) => re.test(name))?.[1] ?? ['with', 'using']);

// map a JSON-schema property to a clause type; may mint a noun type for enums
function typeOf(name, p, ont, units) {
  const s = p.type === 'array' ? p.items : p;
  if (s['x-type']) return [s['x-type']];                                   // refers to an existing noun type (variogram, blockmodel, …)
  if (s.enum && s.enum.every(v => ont.nouns.some(n => n.type === v))) return s.enum;   // enum of existing noun types = type union
  if (s.enum) {                                                            // enum → noun type named after the parameter, values = enum
    const type = s['x-noun'] ?? name;
    if (!ont.nouns.some(n => n.type === type)) ont.nouns.push({ type, words: Object.fromEntries(s.enum.map(v => [v, [String(v).toLowerCase()]])), '$from': 'enum' });
    return [type];
  }
  if (s.type === 'number' || s.type === 'integer') {
    const u = units.find(u => u.unit === s['x-unit']);
    const q = u ? `quantity:${u.dim}` : 'quantity:bare';
    const noun = ont.qmods?.find(m => m.head === name && (!u || m.dims.includes(u.dim)));   // "a 200 m search" is also a search
    return noun ? [name, q] : [q];
  }
  if (s.type === 'string') return ['*'];
  return ['*'];
}

function framesFrom(tools, base) {
  const ont = structuredClone(base);
  const generated = [];
  for (const t of tools) {
    const props = t.inputSchema?.properties ?? {};
    const required = t.inputSchema?.required ?? [];
    const words = t['x-words'] ?? [t.name.split('_')[0]];
    const themeName = Object.keys(props).find(k => props[k]['x-theme']) ?? required[0] ?? Object.keys(props)[0];
    const frame = { name: t.name.split('_')[0], label: cap(t.name.split('_')[0]), words, theme: [], required: [], roles: {}, '$from': t.name };
    for (const [k, p] of Object.entries(props)) {
      const types = typeOf(k, p, ont, ont.units);
      if (k === themeName) { frame.theme = types; if (required.includes(k)) frame.required.push('theme'); if (p.type === 'array' && p['x-distributive']) frame.distributive = true; continue; }
      frame.roles[k] = { preps: prepsFor(k, p), types };
      if (required.includes(k)) frame.required.push(k);
    }
    if (t['x-creates']) frame.creates = true;
    if (t['x-min-theme']) frame.minTheme = t['x-min-theme'];
    if (t['x-sanity']) frame.sanity = t['x-sanity'];
    generated.push(frame);
  }
  // generated frames replace hand frames of the same verb, keeping hand locale columns (words_pt …); hand-only verbs are dropped (no tool)
  ont.verbs = generated.map(g => { const h = base.verbs.find(v => v.name === g.name); const loc = Object.fromEntries(Object.entries(h ?? {}).filter(([k]) => /_[a-z]{2}$/.test(k))); return { ...loc, ...g }; });
  return ont;
}

// ── src/grammar/locales/pt.js ──

// @gcu/dispatch grammar — the pt-BR locale bank. Same shape as en.js; `preps` maps each surface
// preposition to the canonical English set it can mean (de = of/from), and the types downstream
// resolve the polysemy. `headFirst` flips the compound order (variograma esférico).
const PORTUGUESE = {
  code: 'pt', headFirst: true,
  DET: 'o|a|os|as|um|uma|uns|umas|este|esta|esse|essa|meu|minha|nosso|nossa',
  REF: 'último|última|ultimo|ultima|últimos|últimas|anterior|atual|primeiro|primeira|novo|nova',
  QUANT: 'todos|todas|todo|toda|cada', EXCEPT: 'exceto|menos|excluindo|tirando|fora', CONJ: 'e|ou|mais', COMMA: ',',
  PREP: 'com|usando|por|em|no|na|nos|nas|para|pra|pro|de|do|da|dos|das|a|ao|à|às|até|como|acima de|abaixo de|sem|contra|dentro de|sobre|onde|agrupado por|ponderado por|ordenado por|que têm|que tem|depois de|antes de|desde|entre|durante|através de|atraves de|perto de|>|<|>=|<=|=|≥|≤|maior que|menor que|pelo menos|no mínimo|no minimo|no máximo|no maximo|igual a',
  THEN: 'depois|então|em seguida|aí', BUT: 'mas|porém|só que', PRON: 'isso|isto|ele|ela|eles|elas',
  AGAIN: 'de novo|novamente|repete|repetir|refaz|refazer|mesmo|mesma|igual|outra vez',
  QWORD: 'por que|porque|como|qual|quais|quando|quem|é|são|será|pode|poderia|deveria|dá',
  DEMO: 'isto|isso|este|esta|estes|estas|o seguinte|o seguinte texto|o texto|os dois|ambos',   // antes dos dois-pontos: "resume isto: …"
  WH: 'qual|quais|que', COP: 'é|são|sao|era|foi|eram|foram', WHCOP: 'qual é|qual e|quais são|quais sao|o que é|o que e|quanto é|quanto e|quanto dá|quanto da|quanto são|quanto sao',
  TRAIL: 'por favor|obrigado|obrigada|valeu|pfv|pf|pra mim|para mim',   // cortesia que fecha a frase, cortada do fim de um texto livre
  FILLER: 'por favor|agora|só|me|favor|pra mim|então|ei|oi|olá|valeu|obrigado|obrigada|beleza|aí|tá|dá pra|dá para|você pode|pode|consegue|queria que você|quero que você|vamos|bora|hum|bom|me diz|me fala|me dá|preciso de|eu preciso de|gostaria de|eu queria',
  preps: {   // surface → canonical set; polysemy is resolved by types downstream
    com: ['with'], usando: ['using'], por: ['by'], em: ['in', 'on'], no: ['in', 'on'], na: ['in', 'on'], nos: ['in', 'on'], nas: ['in', 'on'],
    para: ['for', 'to', 'into'], pra: ['for', 'to', 'into'], pro: ['for', 'to', 'into'], de: ['of', 'from'], do: ['of', 'from'], da: ['of', 'from'], dos: ['of', 'from'], das: ['of', 'from'],
    a: ['to', 'at'], ao: ['to', 'at'], 'à': ['to', 'at'], 'até': ['to'], como: ['as'], 'acima de': ['above', 'over'], 'abaixo de': ['below', 'under'],
    sem: ['without'], contra: ['against'], 'dentro de': ['into'], sobre: ['on'], 'às': ['at', 'to'], onde: ['where'], 'agrupado por': ['by'], 'ponderado por': ['weighted'], 'ordenado por': ['sort'], 'que têm': ['where'], 'que tem': ['where'], 'depois de': ['after'], 'antes de': ['before'], desde: ['since', 'from'], entre: ['between'], durante: ['during'], 'através de': ['through'], 'atraves de': ['through'], 'perto de': ['near'],
    '>': ['above'], 'maior que': ['above'], '<': ['below'], 'menor que': ['below'], '>=': ['atleast'], '≥': ['atleast'], 'pelo menos': ['atleast'], 'no mínimo': ['atleast'], 'no minimo': ['atleast'],
    '<=': ['atmost'], '≤': ['atmost'], 'no máximo': ['atmost'], 'no maximo': ['atmost'], '=': ['equals'], 'igual a': ['equals'],
  },
  days: { domingo: 0, segunda: 1, 'segunda-feira': 1, 'terça': 2, terca: 2, 'terça-feira': 2, 'terca-feira': 2, quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4, sexta: 5, 'sexta-feira': 5, 'sábado': 6, sabado: 6,
    hoje: { rel: 0 }, 'amanhã': { rel: 1 }, amanha: { rel: 1 }, ontem: { rel: -1 } },
  months: { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 },
  clocks: { 'meio-dia': [12, 0], 'meia-noite': [0, 0] },
  numbers: { dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, noventa: 90, cem: 100,
    meia: 0.5, meio: 0.5, 'um quarto de': 0.25, 'uma dúzia de': 12 },
  indefinite: ['um', 'uma', 'uns', 'umas'], newRef: ['novo', 'nova'], firstRef: ['primeiro', 'primeira'],
  phr: { new: 'novo', last: 'último', every: 'todo', except: 'exceto', fromRun: 'da rodada', above: 'acima de', below: 'abaixo de', atleast: 'pelo menos', atmost: 'no máximo', equals: 'igual a', then: 'Depois', assuming: 'assumindo', of: 'de', hole: '___', than: 'que' },
  stem: w => { let x = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (x.length > 5 && /(ando|endo|indo|amos|emos|imos|aram|eram|iram)$/.test(x)) return x.slice(0, -4);
    if (x.length > 3 && /s$/.test(x)) x = x.slice(0, -1);
    if (x.length > 4 && /(ou|eu|iu|ei|ar|er|ir|am|em)$/.test(x)) x = x.slice(0, -2); else if (x.length > 3 && /[aeo]$/.test(x)) x = x.slice(0, -1); return x; },
  gender: w => ({ variograma: 'm', semivariograma: 'm', modelo: 'm', dia: 'm', mapa: 'm' }[w] ?? (/a$/.test(w) ? 'f' : 'm')),
  agree: { m: { novo: 'novo', 'último': 'último', todo: 'todo' }, f: { novo: 'nova', 'último': 'última', todo: 'toda' } }, plural: w => /s$/.test(w),
  REL: 'que', SUBJ: 'eu|a gente|nós|você|voce|vocês', TIME: 'hoje|ontem|hoje de manhã|hoje de manha|essa semana|esta semana|semana passada|esse mês|este mês|mês passado|mes passado|antes',
  times: { hoje: [0, 1], ontem: [1, 2], 'hoje de manhã': [0, 1], 'hoje de manha': [0, 1], 'essa semana': [0, 7], 'esta semana': [0, 7], 'semana passada': [7, 14], 'esse mês': [0, 30], 'este mês': [0, 30], 'mês passado': [30, 60], 'mes passado': [30, 60], antes: [0, 3650] },
  COMP: 'maior|menor|mais larga|mais larg|mais estreita|mais longa|mais curta',
  comps: { maior: ['+', 0], menor: ['-', 0], 'mais larga': ['+', 0], 'mais larg': ['+', 0], 'mais estreita': ['-', 0], 'mais longa': ['+', 0], 'mais curta': ['-', 0] },
};

// ── src/main.js ──

// @gcu/dispatch — module manifest / curated export surface.
// One utterance in, one routed, explainable tool call out — session-trained
// (the model is younger than your coffee), zero-dep, browser-pure, Sealed-
// compatible. See SPEC.md; provenance: the gcu-dispatch incubator.
// the grammar rung (clause): a controlled-command parser — case-grammar verb frames over an Earley
// chart with costed repairs; ontology as data, locale banks for en and pt-BR. SPEC.md "The grammar rung".

export {
  deriveVocab,
  LOCALES,
  ELEMENT_LEX,
  createContext,
  KINDS,
  generate,
  alignCorpus,
  trainModels,
  TAGS,
  tagSetOf,
  createDispatcher,
  trainSession,
  tokenize,
  normText,
  mulberry32,
  createEngine,
  makeSession,
  DEMO_NOW,
  buildGrammar,
  chart,
  framesFrom,
  ENGLISH,
  PORTUGUESE,
};

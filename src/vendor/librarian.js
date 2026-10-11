// ⚠ VENDORED — DO NOT EDIT. @gcu/librarian, the in-process text search (BM25F, fuzzy expansion, snippets, did-you-mean), copied from ../auditable/ext/librarian/index.js at auditable 5fa5f72e (MIT).
// Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js

// ── src/tokenize.js ──

// Tokenizer. Lower-case ASCII split on non-alphanumeric boundaries,
// stopword filter, optional Unicode passthrough so CJK / accented
// terms aren't lost.
//
// Returns positions alongside tokens — `search()` uses them for phrase
// proximity scoring + snippet extraction.

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have',
  'he','her','his','i','if','in','into','is','it','its','of','on','or','our',
  'she','so','than','that','the','their','them','then','there','these','they',
  'this','to','us','was','we','were','what','when','where','which','while',
  'who','will','with','you','your',
]);

// Match runs of ASCII alphanumerics + apostrophes (so "don't" stays one
// token) OR any non-ASCII letter range (covers CJK, accented Latin).
const TOKEN_RE = /[a-z0-9']+|[^\x00-\x7f]+/g;

function tokenize(text, opts = {}) {
  const stop = opts.keepStopwords ? new Set() : STOPWORDS;
  const minLen = opts.minLen != null ? opts.minLen : 2;
  // Diacritic-fold accented Latin to ASCII (NFD → strip combining marks) BEFORE tokenizing.
  // Otherwise TOKEN_RE splits at the accent (`geoestatística` → `geoestat` + `í` + `stica`) and the
  // 1-char diacritic run is dropped by minLen, so the accented word never forms a token. Folding
  // makes it one token (`geoestatistica`) AND lets an unaccented query match an accented doc and
  // vice-versa. CJK is untouched — after folding, accented Latin is plain ASCII (first TOKEN_RE arm),
  // genuinely non-Latin scripts still hit the second arm. NB: token shapes change → consumers reindex.
  const folded = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lower = folded.toLowerCase();
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lower)) != null) {
    let tok = m[0];
    // Strip leading/trailing apostrophes.
    tok = tok.replace(/^'+|'+$/g, '');
    if (!tok) continue;
    if (tok.length < minLen) continue;
    if (stop.has(tok)) continue;
    out.push({ token: tok, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Just the token strings, no positions — used when scoring queries.
function tokenizeStrings(text) {
  return tokenize(text).map((t) => t.token);
}

// ── src/fuzzy.js ──

// Damerau-Levenshtein edit distance, bounded for efficiency: aborts when
// distance exceeds `max`. Used both for the fuzzy-match step at query
// time and for "did you mean?" suggestions when an exact term hits zero
// results.

function editDistance(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Two-row dynamic programming with the Damerau transposition extension.
  // We track three rows for transpositions.
  const prev2 = new Array(lb + 1);
  const prev1 = new Array(lb + 1);
  const curr  = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev1[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        curr[j - 1] + 1,      // insertion
        prev1[j] + 1,         // deletion
        prev1[j - 1] + cost,  // substitution
      );
      // Transposition (Damerau).
      if (i > 1 && j > 1
          && a.charCodeAt(i - 1) === b.charCodeAt(j - 2)
          && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, prev2[j - 2] + cost);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Prune: if the best score in this row already exceeds max, no
    // continuation can recover.
    if (rowMin > max) return max + 1;
    // Slide the rolling window.
    for (let j = 0; j <= lb; j++) { prev2[j] = prev1[j]; prev1[j] = curr[j]; }
  }
  return prev1[lb];
}

// Find every term in `dictionary` within `max` edits of `target`.
// Returns sorted ascending by distance.
function nearTerms(target, dictionary, max) {
  const hits = [];
  for (const term of dictionary) {
    const d = editDistance(target, term, max);
    if (d <= max) hits.push({ term, distance: d });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}

// ── src/csr.js ──

// The unified lean index — a compact, typed-array, CSR-style inverted index
// that is the SOLE index representation. v1's niceties return as opt-in flags
// on this one engine, not as a parallel structure:
//
//   mode      'multi' (default, true per-field BM25F — v1 behaviour) | 'folded'
//             (field boosts folded into one tf dimension; ~45-65× leaner, the
//             weir/large-corpus path). Folded silently changes ranking vs
//             BM25F, so it is a *conscious* opt-in, never the default.
//   storeText default true; keep field text for snippets + doc reconstruction.
//             Off (lean) + a `snippet(docId, fieldName)` callback = consumer
//             supplies snippet text for the top-K only.
//   positions default true; token positions for proximity scoring + snippet
//             alignment. Off (lean) drops the second-largest memory line.
//
// Representation (optional blocks are null unless their flag is on):
//   vocab       Map<term, termId>            dictionary (FST is a later rung)
//   df          Int32Array[V]                doc frequency per term
//   termOffset  Int32Array[V+1]              CSR row pointers into postings
//   postDocs    Int32Array[nnz]              doc ordinal (ascending within a term)
//   postTf      Uint16Array[nnz]             tf (folded: boosted; multi: per-field raw)
//   postField   Uint8Array[nnz] | null       field id (multi only)
//   posOffset   Int32Array[nnz+1] | null     CSR row pointers into pos
//   pos         Int32Array[totalPos] | null  token start offsets
//   docIds      Array[N]                     ordinal -> external id
//   docLen      Int32Array[N]                folded: boosted length (BM25 norm)
//   docFieldLen Int32Array[N*F] | null       multi: per-field token length
//   docText     Array<string[F]> | null      storeText: per-field text
//   docMeta     Array<object> | null          non-field, non-id keys per doc
//   fieldNames  string[]                     declared/inferred field order
//   fieldBoost  Float64Array                 per-field boost
//   fieldAvgLen Float64Array | null          multi: mean tokens per field
//   avg         number                       folded: mean boosted docLen
//
// nnz = total posting entries. Built in two passes (count → fill). Cache-
// friendly (scoring streams contiguous memory) and packs to raw bytes (pack.js).


// Mirror search.js (v1) exactly — the parity gate guards against drift.
const CSR_K1 = 1.5;
const CSR_B = 0.75;
const CSR_PROX_W = 30;
const CSR_PROX_B = 0.2;

function _popcount(n) { let c = 0; while (n) { n &= n - 1; c++; } return c; }

function _cNormFields(spec) {
  const f = spec.fields;
  const norm = {};
  // `fields: 'folded' | 'multi'` is a mode alias (boosts then inferred/1).
  if (typeof f === 'object' && f) {
    for (const [name, conf] of Object.entries(f)) norm[name] = { boost: (conf && conf.boost) || 1 };
  }
  if (Object.keys(norm).length === 0 && spec.docs && spec.docs.length > 0) {
    for (const k of Object.keys(spec.docs[0])) if (k !== 'id') norm[k] = { boost: 1 };
  }
  return norm;
}

function _normalizeSynonyms(spec) {
  const synonyms = {};
  if (spec.synonyms) {
    for (const [k, syns] of Object.entries(spec.synonyms)) {
      synonyms[k.toLowerCase()] = (Array.isArray(syns) ? syns : [syns]).map((s) => String(s).toLowerCase());
    }
  }
  return synonyms;
}

function buildCsrIndex(spec = {}) {
  const docsIn = spec.docs || [];
  const N = docsIn.length;
  const fieldConf = _cNormFields(spec);
  const fieldNames = Object.keys(fieldConf);
  const F = fieldNames.length;
  const fieldBoost = new Float64Array(F);
  for (let f = 0; f < F; f++) fieldBoost[f] = fieldConf[fieldNames[f]].boost;

  // Mode: alias via `fields: 'folded'|'multi'`, else `mode`, default 'multi'.
  let mode = spec.mode;
  if (spec.fields === 'folded' || spec.fields === 'multi') mode = spec.fields;
  if (mode !== 'folded') mode = 'multi';
  const storeText = spec.storeText !== false;        // default true
  const positions = spec.positions !== false;        // default true
  const folded = mode === 'folded';

  // Positions are meaningful (and tf == occurrence count) only in multi mode;
  // folded conflates fields, so its boosted tf != occurrence count and index-
  // driven snippet alignment is impossible. Folded is the lean path anyway —
  // it gets snippets from a callback by query-string match (no positions).
  const keepPos = positions && !folded;

  const vocab = new Map();
  const docIds = new Array(N);
  const docLen = new Int32Array(N);
  const docFieldLen = folded ? null : new Int32Array(N * F);
  const docText = storeText ? new Array(N) : null;
  const docMeta = new Array(N);
  const fieldLenSum = new Float64Array(F);
  let totalRawLen = 0;

  // The build re-tokenizes (two passes) rather than holding every doc's
  // postings at once — peak memory is the output CSR arrays, not O(corpus)
  // postings, so 100k full-body docs survive where the nested-map build OOMs.

  // Pass 1 — vocab, df, per-term posting counts, lengths, stored text/meta.
  // Transient per-doc only: a Map<termId, fieldMask> (discarded each doc).
  const df = [];                 // grows with vocab; -> Int32Array after
  const postCount = [];          // posting entries per term
  for (let d = 0; d < N; d++) {
    const doc = docsIn[d] || {};
    docIds[d] = doc.id;
    const texts = storeText ? new Array(F) : null;
    const seen = new Map();      // termId -> field bitmask (this doc)
    let boostedLen = 0, rawLen = 0;
    for (let f = 0; f < F; f++) {
      const fn = fieldNames[f];
      const text = doc[fn] != null ? String(doc[fn]) : '';
      if (storeText) texts[f] = text;
      const toks = tokenize(text);
      const len = toks.length;
      if (!folded) docFieldLen[d * F + f] = len;
      fieldLenSum[f] += len;
      rawLen += len;
      boostedLen += fieldBoost[f] * len;
      for (const { token } of toks) {
        let id = vocab.get(token);
        if (id === undefined) { id = vocab.size; vocab.set(token, id); df[id] = 0; postCount[id] = 0; }
        seen.set(id, (seen.get(id) || 0) | (1 << f));
      }
    }
    docLen[d] = folded ? Math.round(boostedLen) : rawLen;
    totalRawLen += folded ? boostedLen : rawLen;
    for (const [id, mask] of seen) {
      df[id]++;
      // folded -> one entry per term; multi -> one per distinct field.
      postCount[id] += folded ? 1 : _popcount(mask);
    }
    if (storeText) docText[d] = texts;
    const meta = {};
    for (const [k, v] of Object.entries(doc)) { if (k === 'id' || fieldNames.includes(k)) continue; meta[k] = v; }
    docMeta[d] = meta;
  }

  const V = vocab.size;
  const dfArr = new Int32Array(V);
  for (let t = 0; t < V; t++) dfArr[t] = df[t];
  const termOffset = new Int32Array(V + 1);
  for (let t = 0; t < V; t++) termOffset[t + 1] = termOffset[t] + postCount[t];
  const nnz = termOffset[V];

  // Pass 2 — re-tokenize each doc and fill postings at the CSR cursors.
  // Iterating docs in order keeps postDocs ascending within each term (matches
  // v1's Map-insertion / input order, so tie-breaking is identical).
  const postDocs = new Int32Array(nnz);
  const postTf = new Uint16Array(nnz);
  const postField = folded ? null : new Uint8Array(nnz);
  const entryPos = keepPos ? new Array(nnz) : null;
  const cursor = termOffset.slice(0, V);
  for (let d = 0; d < N; d++) {
    const doc = docsIn[d] || {};
    // Per-doc accumulation (transient): termId -> folded {tf} | multi Map<fid,{tf,pos}>.
    const acc = new Map();
    for (let f = 0; f < F; f++) {
      const fn = fieldNames[f];
      const toks = tokenize(doc[fn] != null ? String(doc[fn]) : '');
      for (const { token, start } of toks) {
        const id = vocab.get(token);
        if (folded) {
          let e = acc.get(id);
          if (!e) { e = { tf: 0 }; acc.set(id, e); }
          e.tf += fieldBoost[f];
        } else {
          let byField = acc.get(id);
          if (!byField) { byField = new Map(); acc.set(id, byField); }
          let e = byField.get(f);
          if (!e) { e = { tf: 0, pos: keepPos ? [] : null }; byField.set(f, e); }
          e.tf++;
          if (keepPos) e.pos.push(start);
        }
      }
    }
    for (const [id, val] of acc) {
      if (folded) {
        const p = cursor[id]++;
        postDocs[p] = d; postTf[p] = Math.min(65535, Math.round(val.tf));
      } else {
        const fids = [...val.keys()].sort((a, b) => a - b);
        for (const fid of fids) {
          const e = val.get(fid);
          const p = cursor[id]++;
          postDocs[p] = d; postTf[p] = Math.min(65535, e.tf); postField[p] = fid;
          if (keepPos) entryPos[p] = e.pos;
        }
      }
    }
  }

  // Position CSR from entryPos (multi + positions only).
  let posOffset = null, pos = null;
  if (keepPos) {
    posOffset = new Int32Array(nnz + 1);
    for (let p = 0; p < nnz; p++) posOffset[p + 1] = posOffset[p] + entryPos[p].length;
    pos = new Int32Array(posOffset[nnz]);
    for (let p = 0; p < nnz; p++) { const arr = entryPos[p]; const base = posOffset[p]; for (let j = 0; j < arr.length; j++) pos[base + j] = arr[j]; }
  }

  let fieldAvgLen = null;
  if (!folded) { fieldAvgLen = new Float64Array(F); for (let f = 0; f < F; f++) fieldAvgLen[f] = N > 0 ? fieldLenSum[f] / N : 0; }
  const avg = N > 0 ? totalRawLen / N : 0;

  // v1-shaped stats object for any external reader.
  const statsFieldAvg = {};
  for (let f = 0; f < F; f++) statsFieldAvg[fieldNames[f]] = fieldAvgLen ? fieldAvgLen[f] : (N > 0 ? fieldLenSum[f] / N : 0);

  // Reconstructable build config — the delta segment (incremental.js) is built
  // with these exact flags so its scoring matches the base.
  const fieldsConf = {};
  for (let f = 0; f < F; f++) fieldsConf[fieldNames[f]] = { boost: fieldBoost[f] };

  return {
    _csr: true, mode, storeText, positions: keepPos,
    N, V, vocab, df: dfArr,
    termOffset, postDocs, postTf, postField, posOffset, pos,
    docIds, docLen, docFieldLen, docText, docMeta,
    fieldNames, fieldBoost, fieldAvgLen, avg,
    synonyms: _normalizeSynonyms(spec),
    snippetFn: typeof spec.snippet === 'function' ? spec.snippet : null,
    stats: { totalDocs: N, avgLen: avg, fieldAvgLen: statsFieldAvg },
    _buildOpts: { mode, storeText, positions, fields: fieldsConf, synonyms: spec.synonyms, snippet: spec.snippet },
  };
}

// ── query-time ─────────────────────────────────────────────────────────────

function _idf(N, df) { return Math.log(1 + (N - df + 0.5) / (df + 0.5)); }

// Expand a query term via synonyms + (optional) fuzzy + prefix, against the
// CSR dictionary. Same weights as v1's _expandTerm. `prefix` (default on) gates
// the prefix scan — search-as-you-type wants it for the partial last word; a
// consumer can pass `prefix:false` to match whole terms only.
function _expand(term, index, fuzzy, prefix) {
  const expanded = [{ term, weight: 1.0 }];
  const has = (t) => index.vocab.has(t);
  const syns = index.synonyms[term];
  if (syns) for (const s of syns) if (has(s)) expanded.push({ term: s, weight: 1.0 });
  if (fuzzy > 0 && !has(term)) {
    // Gate the fuzzy radius by query-term length — a 1-edit match on a short word flips its
    // meaning (cat→bat, mina→mira), so don't fuzz short terms. And steepen the down-weight (0.5 @ d1,
    // 0.2 @ d2) so a fuzzy hit can't outrank a literal/synonym match on a rare term's IDF alone
    // (the sondagem→soldagem false-friend). Conservative fuzzy = typo fallback; the synonym ring
    // above is the precise multilingual mechanism.
    const fz = term.length < 5 ? 0 : term.length < 8 ? Math.min(fuzzy, 1) : fuzzy;
    if (fz > 0) {
      const near = nearTerms(term, index.vocab.keys(), fz);
      for (const { term: t, distance } of near) expanded.push({ term: t, weight: Math.max(0, 0.5 - 0.3 * (distance - 1)) });
    }
  }
  if (prefix && term.length >= 3 && !has(term)) {
    for (const t of index.vocab.keys()) if (t !== term && t.startsWith(term)) expanded.push({ term: t, weight: 0.8 });
  }
  return expanded;
}

// BM25(F) contribution of one (term, doc), plus the per-field breakdown needed
// for snippets/proximity. Walks the term's CSR row from `lo` to `hi`; the row
// is doc-sorted so a doc's field entries are contiguous. Returns the score and
// (when positions are on) [{ fieldId, positions }].
function _scoreTermDoc(index, termId, doc, lo, hi) {
  const N = index.N;
  const idf = _idf(N, index.df[termId]);
  // Find the contiguous block for `doc` via the row (binary search start).
  let s = lo, e = hi;
  // Linear is fine here (rows short in multi mode); but narrow with bsearch.
  while (s < e) { const mid = (s + e) >> 1; if (index.postDocs[mid] < doc) s = mid + 1; else e = mid; }
  let score = 0; const fieldHits = [];
  for (let p = s; p < hi && index.postDocs[p] === doc; p++) {
    const tf = index.postTf[p];
    if (index.mode === 'folded') {
      const denom = tf + CSR_K1 * (1 - CSR_B + CSR_B * index.docLen[doc] / (index.avg || 1));
      score += idf * (tf * (CSR_K1 + 1)) / denom;
    } else {
      const f = index.postField[p];
      const fieldLen = index.docFieldLen[doc * index.fieldNames.length + f] || 0;
      const avgF = index.fieldAvgLen[f] || 1;
      const denom = tf + CSR_K1 * (1 - CSR_B + CSR_B * fieldLen / avgF);
      score += index.fieldBoost[f] * idf * (tf * (CSR_K1 + 1)) / denom;
    }
    if (index.positions) {
      const f = index.mode === 'folded' ? 0 : index.postField[p];
      const positions = index.pos.subarray(index.posOffset[p], index.posOffset[p + 1]);
      fieldHits.push({ fieldId: f, positions });
    }
  }
  return { score, fieldHits };
}

function _cEsc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); }

// Snippet — ports v1's _snippet to CSR. perField: Map<fieldId, [{token, positions}]>.
function _cSnippet(index, doc, perField, contextChars = 80) {
  let best = null;
  for (const [fid, fhits] of perField) {
    if (!fhits.length) continue;
    const p = fhits[0].positions[0];
    if (best == null || p < best.pos) best = { fid, pos: p, fhits };
  }
  if (!best) return '';
  let text = '';
  if (index.storeText && index.docText) text = index.docText[doc][best.fid] || '';
  else if (index.snippetFn) text = String(index.snippetFn(index.docIds[doc], index.fieldNames[best.fid]) || '');
  if (!text) return '';
  const start = Math.max(0, best.pos - contextChars);
  const end = Math.min(text.length, best.pos + contextChars);
  let slice = text.slice(start, end);
  const spans = [];
  for (const { positions } of best.fhits) for (const p of positions) if (p >= start && p < end) spans.push([p - start, Math.min(slice.length, p - start + 30)]);
  if (spans.length > 0) {
    const [s, e] = spans[0];
    const after = slice.slice(e).search(/\s|$/);
    const wordEnd = e + (after >= 0 ? after : 0);
    slice = slice.slice(0, s) + '<mark>' + _cEsc(slice.slice(s, wordEnd)) + '</mark>' + _cEsc(slice.slice(wordEnd));
    slice = (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
  } else {
    slice = _cEsc((start > 0 ? '…' : '') + slice + (end < text.length ? '…' : ''));
  }
  return slice;
}

// Snippet without positions (the lean path): locate the first query token in
// the supplied text by indexOf and mark it. Text comes from storeText or the
// consumer's snippet callback. Used when `positions` is off.
function _snippetFromText(text, queryTokens, contextChars = 80) {
  if (!text) return '';
  const lower = text.toLowerCase();
  let pos = -1, hitTok = '';
  for (const t of queryTokens) { const i = lower.indexOf(t); if (i !== -1 && (pos === -1 || i < pos)) { pos = i; hitTok = t; } }
  if (pos === -1) {
    const head = text.slice(0, contextChars * 2);
    return _cEsc(head) + (text.length > contextChars * 2 ? '…' : '');
  }
  const start = Math.max(0, pos - contextChars), end = Math.min(text.length, pos + contextChars);
  let slice = text.slice(start, end);
  const s = pos - start, e = Math.min(slice.length, s + hitTok.length);
  slice = slice.slice(0, s) + '<mark>' + _cEsc(slice.slice(s, e)) + '</mark>' + _cEsc(slice.slice(e));
  return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '');
}

function _cProximity(perToken) {
  if (perToken.length < 2) return 0;
  let pairs = 0; const all = [];
  for (const { positions } of perToken) for (const p of positions) all.push(p);
  all.sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) if (all[i] - all[i - 1] <= CSR_PROX_W) pairs++;
  return CSR_PROX_B * pairs;
}

function _cPublicDoc(index, doc) {
  const out = { id: index.docIds[doc], ...(index.docMeta ? index.docMeta[doc] : {}) };
  if (index.storeText && index.docText) for (let f = 0; f < index.fieldNames.length; f++) out[index.fieldNames[f]] = index.docText[doc][f];
  return out;
}

// Score one CSR segment (base or delta). Non-recursive; `searchCsr` wraps this
// to merge a base index with its mutable delta.
function _searchOne(index, query, opts = {}) {
  const fuzzy = opts.fuzzy != null ? opts.fuzzy : 1;
  const limit = opts.limit != null ? opts.limit : 10;
  const prefix = opts.prefix != null ? opts.prefix : true;          // on by default
  const filter = typeof opts.filter === 'function' ? opts.filter : null;
  const tokens = tokenizeStrings(query);
  if (tokens.length === 0) return [];

  const docScores = new Map();
  const docHits = new Map();   // doc -> { perField: Map<fid,[{token,positions}]>, perToken: [{term,positions}] }
  const skip = index._deleted;

  for (const tok of tokens) {
    const expansions = _expand(tok, index, fuzzy, prefix);
    // Per-doc best expansion for this token.
    const tokBest = new Map();   // doc -> { score, term, fieldHits }
    for (const { term, weight } of expansions) {
      const termId = index.vocab.get(term);
      if (termId === undefined) continue;
      const lo = index.termOffset[termId], hi = index.termOffset[termId + 1];
      // Walk distinct docs in this row.
      let p = lo;
      while (p < hi) {
        const doc = index.postDocs[p];
        // advance p past this doc's block while scoring it once
        const { score, fieldHits } = _scoreTermDoc(index, termId, doc, lo, hi);
        const cand = weight * score;
        const prev = tokBest.get(doc);
        if ((!prev || cand > prev.score) && cand > 0 && !(skip && skip[doc])) tokBest.set(doc, { score: cand, term, fieldHits });
        // skip to next doc block
        while (p < hi && index.postDocs[p] === doc) p++;
      }
    }
    for (const [doc, b] of tokBest) {
      docScores.set(doc, (docScores.get(doc) || 0) + b.score);
      let dh = docHits.get(doc);
      if (!dh) { dh = { perField: new Map(), perToken: [] }; docHits.set(doc, dh); }
      const merged = [];
      for (const { fieldId, positions } of b.fieldHits) {
        let fh = dh.perField.get(fieldId);
        if (!fh) { fh = []; dh.perField.set(fieldId, fh); }
        fh.push({ token: b.term, positions });
        for (const x of positions) merged.push(x);
      }
      dh.perToken.push({ term: b.term, positions: merged });
    }
  }

  const results = [];
  for (const [doc, score] of docScores) {
    // Scoped search — an optional predicate on the external id (§5). Applied
    // before the limit slice, so the result is the top-K of the filtered set.
    if (filter && !filter(index.docIds[doc])) continue;
    const dh = docHits.get(doc);
    const finalScore = score + (index.positions ? _cProximity(dh.perToken) : 0);
    const out = { id: index.docIds[doc], score: finalScore, doc: _cPublicDoc(index, doc) };
    if (index.positions && (index.storeText || index.snippetFn)) {
      out.snippet = _cSnippet(index, doc, dh.perField);        // position-aligned (v1 parity)
    } else if (index.storeText || index.snippetFn) {
      // Lean path — no positions; mark the first query token in the text.
      let text = '';
      if (index.storeText && index.docText) text = (index.docText[doc] || []).join(' ');
      else text = String(index.snippetFn(index.docIds[doc], index.mode === 'folded' ? null : index.fieldNames[0]) || '');
      out.snippet = _snippetFromText(text, tokens);
    } else { out.snippet = ''; }
    out.hits = _cHitsSummary(index, dh.perField);
    results.push(out);
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Public search — scores the base segment and, if a mutable delta exists,
// the (lazily rebuilt) delta segment, then merges. A doc in the merged top-K
// is in the top-K of its own segment, so slicing each to `limit` before the
// merge is exact.
function searchCsr(index, query, opts = {}) {
  const base = _searchOne(index, query, opts);
  const delta = index._deltaDocs;
  if (!delta || delta.length === 0) return base;
  if (index._deltaDirty || !index._deltaIndex) {
    const di = buildCsrIndex({ docs: delta, ...index._buildOpts });
    di._deleted = new Uint8Array(di.N);
    for (const ord of index._deltaDeleted) if (ord < di.N) di._deleted[ord] = 1;
    index._deltaIndex = di;
    index._deltaDirty = false;
  }
  const dres = _searchOne(index._deltaIndex, query, opts);
  const limit = opts.limit != null ? opts.limit : 10;
  return base.concat(dres).sort((a, b) => b.score - a.score).slice(0, limit);
}

function _cHitsSummary(index, perField) {
  const out = {};
  for (const [fid, fhits] of perField) out[index.fieldNames[fid]] = fhits.map((h) => ({ token: h.token, count: h.positions.length }));
  return out;
}

function suggestCsr(index, query, maxEdits = 2) {
  const tokens = tokenizeStrings(query);
  const suggestions = [];
  for (const t of tokens) {
    if (index.vocab.has(t)) { suggestions.push(t); continue; }
    const near = nearTerms(t, index.vocab.keys(), maxEdits);
    suggestions.push(near.length > 0 ? near[0].term : t);
  }
  return suggestions.join(' ');
}

// ── src/search.js ──

// Query-time search. The nested-Map v1 scorer is RETIRED; search/suggest are
// thin wrappers over the unified CSR engine (csr.js), which implements BM25(F)
// scoring (folded or multi-field), synonym/fuzzy/prefix expansion, proximity,
// snippets, and transparent base+delta merge for incremental indexes.


function search(index, query, opts = {}) {
  return searchCsr(index, query, opts);
}

function suggest(index, query, maxEdits = 2) {
  return suggestCsr(index, query, maxEdits);
}

// ── src/serialize.js ──

// JSON serialise / deserialise for the CSR index — the debug + tiny-docpack
// form. For real persistence use pack()/unpack() (binary, zero-copy reload);
// this JSON form is human-readable and round-trippable, handy for golden files
// and pre-built docpacks shipped as JSON. Typed arrays become plain arrays.

function _arr(ta) { return ta ? Array.from(ta) : null; }

function serialize(index) {
  if (!index || !index._csr) throw new Error('serialize: not a CSR index');
  const terms = new Array(index.V);
  for (const [t, id] of index.vocab) terms[id] = t;
  return {
    version: 2,
    mode: index.mode, storeText: index.storeText, positions: index.positions,
    N: index.N, V: index.V,
    fieldNames: index.fieldNames.slice(),
    fieldBoost: _arr(index.fieldBoost),
    fieldAvgLen: _arr(index.fieldAvgLen),
    avg: index.avg,
    vocab: terms,
    df: _arr(index.df),
    termOffset: _arr(index.termOffset),
    postDocs: _arr(index.postDocs),
    postTf: _arr(index.postTf),
    postField: _arr(index.postField),
    posOffset: _arr(index.posOffset),
    pos: _arr(index.pos),
    docIds: index.docIds,
    docLen: _arr(index.docLen),
    docFieldLen: _arr(index.docFieldLen),
    docText: index.docText || null,
    docMeta: index.docMeta || null,
    synonyms: index.synonyms || {},
  };
}

function deserialize(json, opts = {}) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  const F = o.fieldNames.length;
  const vocab = new Map();
  for (let i = 0; i < o.vocab.length; i++) vocab.set(o.vocab[i], i);
  const fieldAvgLen = o.fieldAvgLen ? Float64Array.from(o.fieldAvgLen) : null;
  const statsFieldAvg = {};
  for (let f = 0; f < F; f++) statsFieldAvg[o.fieldNames[f]] = fieldAvgLen ? fieldAvgLen[f] : 0;
  const fieldBoost = Float64Array.from(o.fieldBoost);
  const fieldsConf = {};
  for (let f = 0; f < F; f++) fieldsConf[o.fieldNames[f]] = { boost: fieldBoost[f] };
  const snippetFn = typeof opts.snippet === 'function' ? opts.snippet : null;
  return {
    _csr: true, mode: o.mode, storeText: o.storeText, positions: o.positions,
    N: o.N, V: o.V, vocab,
    df: Int32Array.from(o.df),
    termOffset: Int32Array.from(o.termOffset),
    postDocs: Int32Array.from(o.postDocs),
    postTf: Uint16Array.from(o.postTf),
    postField: o.postField ? Uint8Array.from(o.postField) : null,
    posOffset: o.posOffset ? Int32Array.from(o.posOffset) : null,
    pos: o.pos ? Int32Array.from(o.pos) : null,
    docIds: o.docIds,
    docLen: Int32Array.from(o.docLen),
    docFieldLen: o.docFieldLen ? Int32Array.from(o.docFieldLen) : null,
    docText: o.docText || null,
    docMeta: o.docMeta || null,
    fieldNames: o.fieldNames.slice(), fieldBoost, fieldAvgLen, avg: o.avg,
    synonyms: o.synonyms || {}, snippetFn,
    stats: { totalDocs: o.N, avgLen: o.avg, fieldAvgLen: statsFieldAvg },
    _buildOpts: { mode: o.mode, storeText: o.storeText, positions: o.positions, fields: fieldsConf, synonyms: o.synonyms, snippet: snippetFn },
  };
}

// ── src/scan.js ──

// The scan path — instant first-keystroke + cold/deep substring fallback.
//
// Orthogonal to the inverted index (no postings, no scoring model): a single
// contiguous lowercased blob of every doc's searchable text plus an offset
// table, scanned with exact `indexOf` (vectorised in V8 — sub-millisecond at
// any size) or bitap (shift-or / Wu-Manber) for typo-tolerant fuzzy substring.
// Near-zero memory beyond the text itself; ~17 MB for 50k excerpts.
//
// Unlike `search()`, the query is treated as ONE substring needle, not
// tokenised — that's what makes it the "as you type" layer (partial words,
// punctuation, mid-token matches all just work).
//
//   buildBlob(docs, opts?) -> { blob, starts, ids, N }
//     docs        [{ id, ...fields }]
//     opts.fields  field names to include (default: every non-id key whose
//                  value is a string or number)
//     blob         all docs' lowercased text, joined by '\n'
//     starts       Int32Array[N+1], char offset of each doc (starts[N] sentinel)
//     ids          ordinal -> external id
//
//   scan(blob, query, { fuzzy?, limit? }) -> [{ id, score, pos }]
//     fuzzy 0  exact substring (indexOf)
//     fuzzy k  bitap, up to k edits, patterns <= 31 chars (longer -> exact)
//     score    occurrence count in the doc; pos = first hit offset within the doc

const MAX_HITS = 5000;        // safety bound on total occurrences scanned
const BITAP_MAX_LEN = 31;     // pattern must fit one 32-bit word (sign bit spare)

function _fieldText(doc, fields) {
  const parts = [];
  for (const fn of fields) {
    const v = doc[fn];
    if (v != null && (typeof v === 'string' || typeof v === 'number')) parts.push(String(v));
  }
  return parts.join(' ');
}

function buildBlob(docs, opts = {}) {
  const list = docs || [];
  const N = list.length;
  // Determine the fields to fold into the blob.
  let fields = opts.fields;
  if (!fields || fields.length === 0) {
    const seen = new Set();
    for (const d of list) {
      for (const k of Object.keys(d || {})) {
        if (k === 'id') continue;
        const v = d[k];
        if (typeof v === 'string' || typeof v === 'number') seen.add(k);
      }
    }
    fields = [...seen];
  }
  const parts = new Array(N);
  const ids = new Array(N);
  const starts = new Int32Array(N + 1);
  let pos = 0;
  for (let d = 0; d < N; d++) {
    const text = _fieldText(list[d] || {}, fields).toLowerCase();
    parts[d] = text;
    ids[d] = (list[d] || {}).id;
    starts[d] = pos;
    pos += text.length + 1;   // +1 for the '\n' separator
  }
  starts[N] = pos;            // sentinel just past the end
  return { blob: parts.join('\n'), starts, ids, N };
}

// Largest doc ordinal d with starts[d] <= pos. starts[N] is a sentinel > any
// valid pos, so the result is always in [0, N).
function _docAt(starts, pos) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function _scanExact(b, needle) {
  const byDoc = new Map();   // doc ordinal -> { count, pos }
  let i = b.blob.indexOf(needle);
  let n = 0;
  while (i !== -1 && n < MAX_HITS) {
    const d = _docAt(b.starts, i);
    let e = byDoc.get(d);
    if (!e) { e = { count: 0, pos: i - b.starts[d] }; byDoc.set(d, e); }
    e.count++;
    i = b.blob.indexOf(needle, i + needle.length);
    n++;
  }
  return byDoc;
}

// Bitap (Wu-Manber approximate matching) — collects every match END index in
// `text` within <= k edits (insertion, deletion, substitution). 0 = match
// convention, OR-mask-then-shift, full match shows as bit m cleared. Patterns
// must be <= 31 chars (one 32-bit word). Two swapped row buffers, no per-char
// allocation. Per text char c with mask M (bit i = 0 where pattern[i] === c):
//   nR[0] = (R[0] | M) << 1
//   nR[d] = ((R[d] | M) << 1)   // match
//         & (R[d-1]     << 1)   // substitution
//         & (nR[d-1]    << 1)   // deletion (skip a pattern char)
//         &  R[d-1]             // insertion (skip a text char)
function _bitapEnds(text, pattern, k) {
  const m = pattern.length;
  const ends = [];
  if (m === 0 || m > BITAP_MAX_LEN) return ends;
  const mask = new Map();
  for (let i = 0; i < m; i++) {
    const c = pattern.charCodeAt(i);
    mask.set(c, (mask.has(c) ? mask.get(c) : ~0) & ~(1 << i));
  }
  let R = new Array(k + 1).fill(~1);
  let nR = new Array(k + 1);
  const matchBit = 1 << m;
  const len = text.length;
  for (let i = 0; i < len && ends.length < MAX_HITS; i++) {
    const cm = mask.has(text.charCodeAt(i)) ? mask.get(text.charCodeAt(i)) : ~0;
    nR[0] = (R[0] | cm) << 1;
    for (let d = 1; d <= k; d++) {
      nR[d] = ((R[d] | cm) << 1) & (R[d - 1] << 1) & (nR[d - 1] << 1) & R[d - 1];
    }
    if ((nR[k] & matchBit) === 0) ends.push(i);
    const swap = R; R = nR; nR = swap;
  }
  return ends;
}

function _scanFuzzy(b, needle, k, m) {
  const ends = _bitapEnds(b.blob, needle, k);
  const byDoc = new Map();
  let lastDoc = -1, lastEnd = -Infinity;
  for (const i of ends) {
    const d = _docAt(b.starts, i);
    // Collapse a run of adjacent end positions (one fuzzy match fires at
    // several consecutive ends) into a single hit per doc.
    if (d === lastDoc && i - lastEnd < m) { lastEnd = i; continue; }
    let e = byDoc.get(d);
    const startPos = Math.max(0, i - m + 1) - b.starts[d];
    if (!e) { e = { count: 0, pos: Math.max(0, startPos) }; byDoc.set(d, e); }
    e.count++;
    lastDoc = d; lastEnd = i;
  }
  return byDoc;
}

function scan(b, query, opts = {}) {
  const fuzzy = opts.fuzzy != null ? opts.fuzzy : 0;
  const limit = opts.limit != null ? opts.limit : 50;
  const needle = String(query || '').toLowerCase().trim();
  if (!needle || !b || !b.blob) return [];

  const byDoc = (fuzzy > 0 && needle.length <= BITAP_MAX_LEN)
    ? _scanFuzzy(b, needle, fuzzy, needle.length)
    : _scanExact(b, needle);

  const out = [];
  for (const [d, e] of byDoc) out.push({ id: b.ids[d], score: e.count, pos: e.pos });
  // Rank by occurrence count, then earliest position.
  out.sort((a, c) => (c.score - a.score) || (a.pos - c.pos));
  return out.slice(0, limit);
}

// ── src/incremental.js ──

// Incremental lifecycle — the segment model in miniature (§4 of the spec): an
// immutable packed CSR base + a small mutable delta + periodic merge. Makes a
// streaming inserter (a feed poller) cost O(doc) per insert instead of the
// O(corpus) of a full rebuild.
//
//   addDoc(index, doc)   append to the delta segment (re-adding an existing id
//                        tombstones the old copy first — last write wins).
//   removeDoc(index, id) tombstone the doc (O(1)); scoring skips it.
//   compact(index)       fold the live delta + drop tombstones into a fresh
//                        packed CSR base, in place. O(corpus), idle work.
//   pendingCompaction(index) -> { delta, tombstones, ratio } — cheap signal
//                        so the consumer knows when compaction is worthwhile.
//
// Search (csr.js searchCsr) transparently merges base + delta and skips
// tombstones, so results always reflect adds/removes between compactions.


// Attach the mutable-segment machinery on first use. The base id→ordinal map
// is built once (O(N)); subsequent adds/removes are O(doc)/O(1).
function _ensureIncr(index) {
  if (index._deltaDocs) return;
  index._deleted = index._deleted || new Uint8Array(index.N);
  index._deltaDocs = [];
  index._deltaDeleted = new Set();
  index._deltaIndex = null;
  index._deltaDirty = false;
  const m = new Map();
  for (let ord = 0; ord < index.N; ord++) m.set(index.docIds[ord], { seg: 'base', ord });
  index._idMap = m;
}

function addDoc(index, doc) {
  if (!index || !index._csr) throw new Error('addDoc: not a CSR index');
  _ensureIncr(index);
  const id = doc.id;
  if (index._idMap.has(id)) removeDoc(index, id);   // update = remove + re-add
  const ord = index._deltaDocs.length;
  index._deltaDocs.push(doc);
  index._idMap.set(id, { seg: 'delta', ord });
  index._deltaDirty = true;                          // delta index needs rebuild
  return index;
}

function removeDoc(index, id) {
  if (!index || !index._csr) throw new Error('removeDoc: not a CSR index');
  _ensureIncr(index);
  const loc = index._idMap.get(id);
  if (!loc) return false;
  if (loc.seg === 'base') {
    index._deleted[loc.ord] = 1;                     // live tombstone, no rebuild
  } else {
    index._deltaDeleted.add(loc.ord);
    if (index._deltaIndex && loc.ord < index._deltaIndex.N) index._deltaIndex._deleted[loc.ord] = 1;
  }
  index._idMap.delete(id);
  return true;
}

function pendingCompaction(index) {
  if (!index || !index._deltaDocs) return { delta: 0, tombstones: 0, ratio: 0 };
  let liveDelta = 0;
  for (let ord = 0; ord < index._deltaDocs.length; ord++) if (!index._deltaDeleted.has(ord)) liveDelta++;
  let tombstones = 0;
  for (let i = 0; i < index._deleted.length; i++) tombstones += index._deleted[i];
  const denom = Math.max(1, index.N);
  return { delta: liveDelta, tombstones, ratio: (liveDelta + tombstones) / denom };
}

// Merge CSR segments into a fresh CSR — directly over typed arrays, no
// re-tokenization, so it works without stored text (the lean path). Each
// segment = { index, deleted: Uint8Array|null }. Drops tombstoned docs and
// renumbers ordinals (base docs first, then delta), keeping postDocs ascending
// within each term. Compaction is the only caller; it is O(corpus) idle work.
function mergeCsr(segments, buildOpts) {
  const segs = segments.filter((s) => s && s.index);
  const ref = segs.length ? segs[0].index : null;
  const folded = buildOpts.mode === 'folded';
  const storeText = buildOpts.storeText !== false;
  const fieldNames = ref ? ref.fieldNames.slice() : [];
  const F = fieldNames.length;
  const fieldBoost = ref ? Float64Array.from(ref.fieldBoost) : new Float64Array(0);
  const keepPos = ref ? ref.positions : false;       // effective positions flag

  // New doc ordinals (live docs only), base segments first.
  const map = [];                                     // [segIdx][oldOrd] -> newOrd | -1
  let newN = 0;
  for (let si = 0; si < segs.length; si++) {
    const idx = segs[si].index, del = segs[si].deleted;
    const row = new Int32Array(idx.N);
    for (let o = 0; o < idx.N; o++) row[o] = (del && del[o]) ? -1 : newN++;
    map.push(row);
  }

  // Union vocab + per-segment term remap.
  const vocab = new Map();
  const termRemap = [];
  for (let si = 0; si < segs.length; si++) {
    const idx = segs[si].index;
    const remap = new Int32Array(idx.V);
    for (const [term, oldId] of idx.vocab) {
      let nid = vocab.get(term);
      if (nid === undefined) { nid = vocab.size; vocab.set(term, nid); }
      remap[oldId] = nid;
    }
    termRemap.push(remap);
  }
  const V = vocab.size;

  // Pass A — posting counts per new term.
  const postCount = new Int32Array(V);
  for (let si = 0; si < segs.length; si++) {
    const idx = segs[si].index, del = segs[si].deleted, remap = termRemap[si];
    for (let t = 0; t < idx.V; t++) {
      const nt = remap[t];
      for (let p = idx.termOffset[t]; p < idx.termOffset[t + 1]; p++) {
        const od = idx.postDocs[p];
        if (del && del[od]) continue;
        postCount[nt]++;
      }
    }
  }
  const termOffset = new Int32Array(V + 1);
  for (let t = 0; t < V; t++) termOffset[t + 1] = termOffset[t] + postCount[t];
  const nnz = termOffset[V];

  // Pass B — fill. Segments in order (base docs lower newOrd) keeps ascending.
  const postDocs = new Int32Array(nnz);
  const postTf = new Uint16Array(nnz);
  const postField = folded ? null : new Uint8Array(nnz);
  const entryPos = keepPos ? new Array(nnz) : null;
  const cursor = termOffset.slice(0, V);
  for (let si = 0; si < segs.length; si++) {
    const idx = segs[si].index, del = segs[si].deleted, remap = termRemap[si], rowMap = map[si];
    for (let t = 0; t < idx.V; t++) {
      const nt = remap[t];
      for (let p = idx.termOffset[t]; p < idx.termOffset[t + 1]; p++) {
        const od = idx.postDocs[p];
        if (del && del[od]) continue;
        const np = cursor[nt]++;
        postDocs[np] = rowMap[od];
        postTf[np] = idx.postTf[p];
        if (!folded) postField[np] = idx.postField[p];
        if (keepPos) entryPos[np] = idx.pos.slice(idx.posOffset[p], idx.posOffset[p + 1]);
      }
    }
  }

  // df by scanning each term row for distinct docs (ascending → count changes).
  const df = new Int32Array(V);
  for (let t = 0; t < V; t++) {
    let last = -1, c = 0;
    for (let p = termOffset[t]; p < termOffset[t + 1]; p++) { if (postDocs[p] !== last) { c++; last = postDocs[p]; } }
    df[t] = c;
  }

  // Doc-level arrays, renumbered.
  const docIds = new Array(newN);
  const docLen = new Int32Array(newN);
  const docFieldLen = folded ? null : new Int32Array(newN * F);
  const docText = storeText ? new Array(newN) : null;
  const docMeta = new Array(newN);
  for (let si = 0; si < segs.length; si++) {
    const idx = segs[si].index, rowMap = map[si];
    for (let o = 0; o < idx.N; o++) {
      const no = rowMap[o];
      if (no < 0) continue;
      docIds[no] = idx.docIds[o];
      docLen[no] = idx.docLen[o];
      if (!folded) for (let f = 0; f < F; f++) docFieldLen[no * F + f] = idx.docFieldLen[o * F + f];
      if (storeText) docText[no] = idx.docText ? idx.docText[o] : null;
      docMeta[no] = idx.docMeta ? idx.docMeta[o] : {};
    }
  }

  // Position CSR + per-field / global length stats.
  let posOffset = null, pos = null;
  if (keepPos) {
    posOffset = new Int32Array(nnz + 1);
    for (let p = 0; p < nnz; p++) posOffset[p + 1] = posOffset[p] + entryPos[p].length;
    pos = new Int32Array(posOffset[nnz]);
    for (let p = 0; p < nnz; p++) { const a = entryPos[p], b = posOffset[p]; for (let j = 0; j < a.length; j++) pos[b + j] = a[j]; }
  }
  let totalLen = 0; for (let o = 0; o < newN; o++) totalLen += docLen[o];
  const avg = newN > 0 ? totalLen / newN : 0;
  let fieldAvgLen = null;
  if (!folded) {
    fieldAvgLen = new Float64Array(F);
    for (let f = 0; f < F; f++) { let s = 0; for (let o = 0; o < newN; o++) s += docFieldLen[o * F + f]; fieldAvgLen[f] = newN > 0 ? s / newN : 0; }
  }
  const statsFieldAvg = {};
  for (let f = 0; f < F; f++) statsFieldAvg[fieldNames[f]] = fieldAvgLen ? fieldAvgLen[f] : 0;

  const fieldsConf = {};
  for (let f = 0; f < F; f++) fieldsConf[fieldNames[f]] = { boost: fieldBoost[f] };

  return {
    _csr: true, mode: ref ? ref.mode : 'multi', storeText, positions: keepPos,
    N: newN, V, vocab, df,
    termOffset, postDocs, postTf, postField, posOffset, pos,
    docIds, docLen, docFieldLen, docText, docMeta,
    fieldNames, fieldBoost, fieldAvgLen, avg,
    synonyms: ref ? ref.synonyms : {},
    snippetFn: ref ? ref.snippetFn : null,
    stats: { totalDocs: newN, avgLen: avg, fieldAvgLen: statsFieldAvg },
    _buildOpts: ref ? ref._buildOpts : buildOpts,
  };
}

function compact(index) {
  if (!index || !index._csr) throw new Error('compact: not a CSR index');
  _ensureIncr(index);
  const opts = index._buildOpts;
  const segs = [{ index, deleted: index._deleted }];
  if (index._deltaDocs.length) {
    const di = buildCsrIndex({ docs: index._deltaDocs, ...opts });
    const del = new Uint8Array(di.N);
    for (const ord of index._deltaDeleted) if (ord < di.N) del[ord] = 1;
    segs.push({ index: di, deleted: del });
  }
  const merged = mergeCsr(segs, opts);
  // Replace base contents in place; reset the delta machinery.
  for (const k of Object.keys(index)) delete index[k];
  Object.assign(index, merged);
  _ensureIncr(index);
  return index;
}

// ── src/index.js ──

// Index construction. The nested-Map v1 representation is RETIRED — the unified
// typed-array CSR engine (csr.js) is the sole index representation. This module
// is now a thin re-export so the public name `buildIndex` is preserved.
//
//   buildIndex(spec)   -> buildCsrIndex (csr.js). Defaults reproduce v1's
//                         behaviour (mode:'multi', storeText, positions); the
//                         lean path opts in via mode:'folded' + storeText/
//                         positions:false. See csr.js for the representation.
//   mergeIndexes(idxs) -> CSR segment merge (incremental.js mergeCsr), the
//                         multi-source / docpack combiner; compact() is its
//                         incremental cousin.


const buildIndex = buildCsrIndex;

function mergeIndexes(indexes) {
  const list = indexes || [];
  const segs = list.map((i) => ({ index: i, deleted: i._deleted || null }));
  const opts = (list[0] && list[0]._buildOpts) || { mode: 'multi' };
  return mergeCsr(segs, opts);
}

// ── src/pack.js ──

// Binary persistence — pack(index) -> ArrayBuffer / unpack(buf) -> index.
//
// v1's serialize() emits JSON (re-inflates every string + array — huge and
// slow). pack writes a length-prefixed binary blob: a small header, the
// dictionary + doc-id/meta/text as encoded strings, and every typed-array
// section copied VERBATIM at an aligned offset. unpack rebuilds the index with
// the typed arrays as zero-copy views over the buffer — one readFile + a few
// `new Int32Array(buf, off, len)`, no re-tokenization, no GC churn. A consumer
// persists this to VFS/OPFS and reloads a 50k-doc index in « 100 ms.
//
// The dictionary + docIds + meta + (optional) stored text are the only parts
// that decode; the postings/length arrays are bytes. Sequential layout with
// deterministic alignment padding — reader and writer walk the same order, so
// no offset index is needed.
//
// A `snippet` callback can't be serialized; pass it back via unpack(buf, {snippet}).


const MAGIC = 0x4c425231;   // 'LBR1'

class _Writer {
  constructor() { this.chunks = []; this.len = 0; }
  _pad(align) { const m = this.len % align; if (m) { const p = align - m; this.chunks.push(new Uint8Array(p)); this.len += p; } }
  u32(x) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0, true); this.chunks.push(b); this.len += 4; }
  f64(x) { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x, true); this.chunks.push(b); this.len += 8; }
  bytes(u8) { this.chunks.push(u8); this.len += u8.length; }
  str(s) { const u8 = new TextEncoder().encode(s == null ? '' : String(s)); this.u32(u8.length); this.bytes(u8); }
  ta(arr) { this._pad(arr.BYTES_PER_ELEMENT); this.bytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); }
  done() { const out = new Uint8Array(this.len); let o = 0; for (const c of this.chunks) { out.set(c, o); o += c.length; } return out.buffer; }
}

class _Reader {
  constructor(buf) { this.buf = buf; this.dv = new DataView(buf); this.off = 0; this.dec = new TextDecoder(); }
  _pad(align) { const m = this.off % align; if (m) this.off += align - m; }
  u32() { const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.off, true); this.off += 8; return v; }
  str() { const n = this.u32(); const s = this.dec.decode(new Uint8Array(this.buf, this.off, n)); this.off += n; return s; }
  ta(Ctor, len) { this._pad(Ctor.BYTES_PER_ELEMENT); const v = new Ctor(this.buf, this.off, len); this.off += v.byteLength; return v; }
}

function pack(index) {
  if (!index || !index._csr) throw new Error('pack: not a CSR index');
  // Fold any pending delta + tombstones so the packed form is the live state.
  if (index._deltaDocs && (index._deltaDocs.length || (index._deleted && index._deleted.some((x) => x)))) compact(index);
  const folded = index.mode === 'folded';
  const positions = !!index.positions;
  const storeText = !!index.storeText;
  const F = index.fieldNames.length;
  const nnz = index.postDocs.length;
  const totalPos = positions ? index.pos.length : 0;

  const w = new _Writer();
  w.u32(MAGIC);
  w.u32((storeText ? 1 : 0) | (positions ? 2 : 0) | (folded ? 4 : 0));
  w.u32(index.N); w.u32(index.V); w.u32(F); w.u32(nnz); w.u32(totalPos);
  w.f64(index.avg);

  // Field config.
  for (let f = 0; f < F; f++) w.str(index.fieldNames[f]);
  for (let f = 0; f < F; f++) w.f64(index.fieldBoost[f]);
  if (!folded) for (let f = 0; f < F; f++) w.f64(index.fieldAvgLen[f]);

  // Dictionary in termId order (decode on load).
  const terms = new Array(index.V);
  for (const [term, id] of index.vocab) terms[id] = term;
  for (let i = 0; i < index.V; i++) w.str(terms[i]);

  // Typed-array sections (verbatim, aligned).
  w.ta(index.df);
  w.ta(index.termOffset);
  w.ta(index.postDocs);
  w.ta(index.postTf);
  if (!folded) w.ta(index.postField);
  if (positions) { w.ta(index.posOffset); w.ta(index.pos); }
  w.ta(index.docLen);
  if (!folded) w.ta(index.docFieldLen);

  // Variable-shape doc data + synonyms as JSON strings.
  w.str(JSON.stringify(index.docIds));
  w.str(JSON.stringify(index.docMeta || []));
  w.str(storeText ? JSON.stringify(index.docText || []) : '');
  w.str(JSON.stringify(index.synonyms || {}));

  return w.done();
}

function unpack(buf, opts = {}) {
  const r = new _Reader(buf);
  if (r.u32() !== MAGIC) throw new Error('unpack: bad magic (not a librarian pack)');
  const flags = r.u32();
  const storeText = !!(flags & 1), positions = !!(flags & 2), folded = !!(flags & 4);
  const N = r.u32(), V = r.u32(), F = r.u32(), nnz = r.u32(), totalPos = r.u32();
  const avg = r.f64();

  const fieldNames = new Array(F);
  for (let f = 0; f < F; f++) fieldNames[f] = r.str();
  const fieldBoost = new Float64Array(F);
  for (let f = 0; f < F; f++) fieldBoost[f] = r.f64();
  let fieldAvgLen = null;
  if (!folded) { fieldAvgLen = new Float64Array(F); for (let f = 0; f < F; f++) fieldAvgLen[f] = r.f64(); }

  const vocab = new Map();
  for (let i = 0; i < V; i++) vocab.set(r.str(), i);

  const df = r.ta(Int32Array, V);
  const termOffset = r.ta(Int32Array, V + 1);
  const postDocs = r.ta(Int32Array, nnz);
  const postTf = r.ta(Uint16Array, nnz);
  const postField = folded ? null : r.ta(Uint8Array, nnz);
  let posOffset = null, pos = null;
  if (positions) { posOffset = r.ta(Int32Array, nnz + 1); pos = r.ta(Int32Array, totalPos); }
  const docLen = r.ta(Int32Array, N);
  const docFieldLen = folded ? null : r.ta(Int32Array, N * F);

  const docIds = JSON.parse(r.str());
  const docMeta = JSON.parse(r.str());
  const dtStr = r.str();
  const docText = storeText ? JSON.parse(dtStr) : null;
  const synonyms = JSON.parse(r.str());

  const statsFieldAvg = {};
  for (let f = 0; f < F; f++) statsFieldAvg[fieldNames[f]] = fieldAvgLen ? fieldAvgLen[f] : 0;
  const fieldsConf = {};
  for (let f = 0; f < F; f++) fieldsConf[fieldNames[f]] = { boost: fieldBoost[f] };
  const mode = folded ? 'folded' : 'multi';
  const snippetFn = typeof opts.snippet === 'function' ? opts.snippet : null;

  return {
    _csr: true, mode, storeText, positions,
    N, V, vocab, df,
    termOffset, postDocs, postTf, postField, posOffset, pos,
    docIds, docLen, docFieldLen, docText, docMeta,
    fieldNames, fieldBoost, fieldAvgLen, avg,
    synonyms, snippetFn,
    stats: { totalDocs: N, avgLen: avg, fieldAvgLen: statsFieldAvg },
    _buildOpts: { mode, storeText, positions, fields: fieldsConf, synonyms, snippet: snippetFn },
  };
}

// ── src/api.js ──

// Public Librarian API. Pure functions; no hidden state.


const Librarian = {
  index: buildIndex,
  search,
  suggest,
  serialize,
  deserialize,
  merge: mergeIndexes,
  tokenize,
  editDistance,
  buildBlob,
  scan,
  addDoc,
  removeDoc,
  compact,
  pendingCompaction,
  pack,
  unpack,
};

// ── src/main.js ──

// @gcu/librarian — ES module entry. Build manifest order = concat order: leaf
// utilities first, then the CSR engine, then modules that build on it, then the
// public api. index.js (a re-export of the CSR engine) sits after csr.js +
// incremental.js since it references both.

export {
  Librarian,
};

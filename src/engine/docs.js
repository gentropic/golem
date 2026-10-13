// Search my documents (A7). Markdown, plain text and HTML opened with the paperclip are kept on the device,
// cut into passages (by heading, then by paragraph) and indexed by @gcu/librarian. A search returns
// passages verbatim with the matched words marked; golem never rewrites them. The index is derived
// from the kept files, so it is rebuilt, never stored, and a session replays against what the device holds.
import { S, tool, frame, noun, postmod } from './core.js';
import { Librarian } from '../vendor/librarian.js';

export const DOCTEXT = /\.(md|markdown|txt|html?)$/i;
const isDoc = f => f.kind === 'doc';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ── text out of a file ─────────────────────────────────────── */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
// HTML to Markdown-shaped lines: headings become # lines, block ends become blank lines, tags go
function htmlLines(html) {
  return unent(html.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(+n)} ${t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}\n\n`)
    .replace(/<(br)\b[^>]*>/gi, '\n').replace(/<\/(p|div|li|tr|pre|blockquote|section|article|table|ul|ol)>/gi, '\n\n').replace(/<[^>]+>/g, '')).split('\n').map(l => l.replace(/[ \t]+/g, ' ').trimEnd());
}
// → [{ n, line, title, body }]: one per paragraph, titled by the heading path above it
export function passages(name, text) {
  const lines = /\.html?$/i.test(name) ? htmlLines(text) : text.replace(/\r\n?/g, '\n').split('\n');
  const md = /\.(md|markdown|html?)$/i.test(name), out = [], path = [];
  let buf = [], start = 0, fence = false;
  const flush = () => { const body = buf.join('\n').trim(); if (body) out.push({ n: out.length + 1, line: start + 1, title: path.filter(Boolean).join(' › '), body }); buf = []; };
  lines.forEach((l, i) => {
    if (md && /^\s*(```|~~~)/.test(l)) { if (!buf.length) start = i; buf.push(l); fence = !fence; return; }
    const h = md && !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) { flush(); path.length = h[1].length - 1; path.push(h[2]); return; }
    if (!fence && !l.trim()) { flush(); return; }
    if (!buf.length) start = i; buf.push(l);
  });
  flush();
  return out;
}

/* ── the index, rebuilt when the kept documents change ──────── */
let cache = { key: null, idx: null, docs: [] };
function index() {
  const files = Object.values(S.files).filter(isDoc), key = files.map(f => f.hash).sort().join(',');
  if (cache.key === key) return cache;
  const docs = files.flatMap(f => passages(f.name, f.text).map(p => ({ id: `${f.hash}:${p.n}`, title: p.title, body: p.body, file: f.name, hash: f.hash, n: p.n, line: p.line })));
  cache = { key, docs, idx: docs.length ? Librarian.index({ docs, fields: { title: { boost: 3 }, body: { boost: 1 } } }) : null, files };
  return cache;
}

// the matched words of a passage as spans, by librarian's own tokenizer; a span whose folded text is
// not the token (an accent that changed the length) is left unmarked rather than misplaced
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function marks(text, tokens) {
  const want = new Set(tokens);
  return Librarian.tokenize(text).filter(t => want.has(t.token) && fold(text.slice(t.start, t.end)).replace(/^'+|'+$/g, '') === t.token).map(t => [t.start, t.end]);
}
// a long passage shows a window around its first marked word
const WINDOW = 320;
function excerpt(text, spans) {
  if (text.length <= WINDOW) return { text, spans };
  const first = spans.length ? spans[0][0] : 0, s = Math.max(0, Math.min(first - 80, text.length - WINDOW)), e = Math.min(text.length, s + WINDOW);
  const head = s > 0 ? '…' : '', cut = head + text.slice(s, e) + (e < text.length ? '…' : '');
  return { text: cut, spans: spans.filter(([a, b]) => a >= s && b <= e).map(([a, b]) => [a - s + head.length, b - s + head.length]) };
}

/* ── a document opened from the picker ──────────────────────── */
tool({
  name: 'docOpen', rank: 90,
  topic: a => [a.file.name, 2],
  run: a => {
    const f = S.files[a.file.hash], read = ['keep document', { v: a.file.name }];
    if (!f) return { read, body: [{ t: 'note', kind: 'err', text: `${a.file.name} is not kept on this device. Open it again from your files.` }], trace: ['file: not in the device store'] };
    const ps = passages(f.name, f.text), heads = [...new Set(ps.map(p => p.title).filter(Boolean))], all = Object.values(S.files).filter(isDoc);
    return {
      read, value: ps.length,
      body: [{ t: 'big', v: String(ps.length), unit: ps.length === 1 ? 'passage' : 'passages' }, { t: 'kv', rows: [['headings', heads.length ? heads.slice(0, 8).join(' · ') + (heads.length > 8 ? ` · and ${heads.length - 8} more` : '') : 'none; passages are paragraphs'], ['size', `${f.text.length} characters`], ['kept', `${plural(all.length, 'document')} on this device, searched together`]] }, { t: 'note', text: 'Kept on this device and searched by word. Ask "find … in my documents".' }, { t: 'src', text: 'indexed by @gcu/librarian, on this device' }],
      trace: [`passages(${f.name}) → ${ps.length}`, `index: ${plural(all.length, 'document')}`]
    };
  }
});

/* ── search ─────────────────────────────────────────────────── */
const SEARCH = [
  /^(?:find|search(?: for)?|look for|look up)\s+(.+?)\s+in\s+(?:my|the)\s+(?:documents|docs|notes|files)$/i,
  /^search\s+(?:my|the)\s+(?:documents|docs|notes|files)\s+for\s+(.+)$/i,
  /^where\s+did\s+i\s+(?:write|read|note|put|see)(?:\s+(?:about|down))?\s+(.+?)\??$/i,
  /^(?:search\s+)?(?:my\s+)?(?:documents|docs)\s*:\s*(.+)$/i
];
tool({
  name: 'docSearch',
  skill: { group: 'Knowledge', title: 'Search my documents', on: '@gcu/librarian', about: 'Markdown, text and HTML files you open are kept on this device and searched by word, with near spellings. Passages come back as written, with the matched words marked and where they are.', examples: ['find resurvey in my documents', 'where did i write about the collar check', 'docs: core loss'] },
  amend: [{ arg: 'limit', match: /^(?:show )?more(?: results)?$/, value: () => 15 }],
  topic: a => [a.query, 1],
  run: a => {
    const read = ['find', { v: a.query }, 'in my documents'], c = index();
    if (!c.idx) return { read, body: [{ t: 'note', kind: 'err', text: 'No documents are kept on this device. Open a Markdown, text or HTML file with the paperclip and I will search it.' }], trace: ['index: empty'] };
    const hits = Librarian.search(c.idx, a.query, { limit: a.limit, fuzzy: 1 });
    const where = `${plural(c.files.length, 'document')}, ${plural(c.docs.length, 'passage')}`;
    if (!hits.length) {
      const s = Librarian.suggest(c.idx, a.query), alt = s && s.toLowerCase() !== a.query.toLowerCase() ? s : null;
      return { read, value: 0, body: [{ t: 'note', text: `Nothing in ${where} matches "${a.query}"${alt ? `. Did you mean "${alt}"?` : '.'}` }, ...(alt ? [{ t: 'chips', items: [`find ${alt} in my documents`] }] : [])], trace: [`librarian.search → 0`, alt ? `suggest → ${alt}` : 'suggest → nothing near'] };
    }
    const body = [{ t: 'sub', text: `${plural(hits.length, 'passage')} from ${where}${hits.length === a.limit ? `; the best ${a.limit} shown` : ''}` }];
    for (const h of hits) {
      const tokens = Object.values(h.hits).flat().map(x => x.token), ex = excerpt(h.doc.body, marks(h.doc.body, tokens));
      body.push({ t: 'lbl', text: `${h.doc.file}${h.doc.title ? ' · ' + h.doc.title : ''} · line ${h.doc.line}` }, { t: 'marked', text: ex.text, spans: ex.spans }, { t: 'chips', items: [`show passage ${h.doc.n} of ${h.doc.file}`] });
    }
    body.push({ t: 'src', text: 'ranked by @gcu/librarian (BM25F, near spellings within one edit); passages as written' });
    return { read, value: hits.length, body, trace: [`index: ${where}`, `librarian.search("${a.query}") → ${hits.length}`, ...hits.map(h => `${h.doc.file}:${h.doc.line} score ${h.score.toFixed(2)}`)] };
  }
});

/* ── one passage, whole ─────────────────────────────────────── */
tool({
  name: 'docPassage',
  amend: [{ arg: 'n', match: /^(next|previous|back)(?: passage| one)?$/, value: (m, a) => a.n + (m[1] === 'next' ? 1 : -1) }],
  topic: a => [a.file.name, 1],
  run: a => {
    const f = S.files[a.file.hash], read = ['passage', { v: String(a.n) }, 'of', { v: a.file.name }];
    if (!f) return { read, body: [{ t: 'note', kind: 'err', text: `${a.file.name} is not kept on this device. Open it again from your files.` }], trace: ['file: not in the device store'] };
    const ps = passages(f.name, f.text), p = ps[a.n - 1];
    if (!p) return { read, body: [{ t: 'note', kind: 'err', text: `${a.file.name} has ${plural(ps.length, 'passage')}; there is no passage ${a.n}.` }], trace: ['passage: out of range'] };
    return {
      read, value: p.body, copy: p.body,
      body: [{ t: 'lbl', text: `${f.name}${p.title ? ' · ' + p.title : ''} · line ${p.line} · passage ${p.n} of ${ps.length}` }, { t: 'pre', text: p.body }, { t: 'chips', items: [...(p.n > 1 ? [`show passage ${p.n - 1} of ${f.name}`] : []), ...(p.n < ps.length ? [`show passage ${p.n + 1} of ${f.name}`] : [])] }, { t: 'actions', items: [{ act: 'copy', label: 'Copy passage' }] }],
      trace: [`passages(${f.name}) → ${ps.length}`, `passage ${p.n}: line ${p.line}`]
    };
  }
});
/* ── what reads them: "find resurvey in my documents", "search my notes for X", "where did i write about X", "docs: X" ── */
noun({ type: 'docs', words: { docs: ['my documents', 'my docs', 'my notes', 'my files', 'the documents', 'the docs', 'documents', 'docs'] }, words_pt: { docs: ['meus documentos', 'minhas notas', 'documentos'] } });
const queryOf = c => { const t = [...c.theme, ...(c.roles.for || []), ...(c.roles.text || [])].find(n => n.type === 'text'); return t ? t.value.trim() : null; };
frame({
  name: 'docsearch', label: 'Search documents', words: ['find', 'search', 'search for', 'look for', 'look up'], elidable: true, theme: ['text', 'docs'], required: ['theme'],
  roles: { in: { preps: ['in', 'through'], types: ['docs'] }, for: { preps: ['for'], types: ['text'] }, text: { preps: [':'], types: ['text'] } }, words_pt: ['procura', 'procure', 'busca', 'busque'], label_pt: 'Procurar',
  bind: c => { const inDocs = c.theme.some(n => n.type === 'docs') || c.roles.in; const q = queryOf(c); return inDocs && q ? { tool: 'docSearch', args: { query: q, limit: 5 } } : null; }
});
frame({
  name: 'docwhere', label: 'Search documents', words: ['where did i write about', 'where did i read about', 'where did i note', 'where did i see', 'where did i put', 'where did i write', 'where did i mention'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['onde eu escrevi sobre', 'onde anotei'], label_pt: 'Procurar',
  bind: c => ({ tool: 'docSearch', args: { query: c.theme[0].value.trim(), limit: 5 } })
});
// "show passage 2 of notes.md"
noun({ type: 'passage', words: {}, generic: ['passage', 'paragraph'], generic_pt: ['trecho', 'parágrafo'] });
postmod({ prep: '', heads: ['passage'], attr: 'n', quantity: true });
frame({
  name: 'docpassage', label: 'Passage', words: ['show', 'open', 'read'], elidable: true, theme: ['passage'], required: ['theme', 'of'], roles: { of: { preps: ['of', 'in', 'from'], types: ['file'] } }, label_pt: 'Trecho',
  bind: c => { const n = c.theme[0].attrs && c.theme[0].attrs.n, f = Object.values(S.files).find(x => isDoc(x) && x.name === c.roles.of[0].value); return n && f ? { tool: 'docPassage', args: { file: { name: f.name, hash: f.hash }, n: n.n } } : null; }
});

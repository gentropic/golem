// Packs as gcu-library ships them: a .gcudat is a gzipped tar holding gcudat.json (the manifest) and the data files
// (gcu-library tools/build-gcudat.mjs). Read here with the platform's own gunzip (DecompressionStream, in browsers and
// in Node) and a small ustar reader; @gcu/archive reads every container, but golem needs only this one.
import { profilesOf } from './factbook.js';

const dec = new TextDecoder();
export async function gunzip(bytes) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
  return new Uint8Array(await out.arrayBuffer());
}
// ustar: 512-byte headers (name at 0, size in octal at 124, type at 156, prefix at 345), the data padded to 512
export function untar(t) {
  const files = {};
  for (let o = 0; o + 512 <= t.length;) {
    const h = t.subarray(o, o + 512); if (h.every(b => b === 0)) break;
    const str = (a, n) => dec.decode(h.subarray(a, a + n)).replace(/\0.*$/s, '');
    const name = (str(345, 155) ? str(345, 155) + '/' : '') + str(0, 100), size = parseInt(str(124, 12).trim() || '0', 8), type = str(156, 1);
    if (type === '0' || type === '' ) files[name.replace(/^\.\//, '')] = t.subarray(o + 512, o + 512 + size);
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
// → { manifest, json(path) }: the manifest parsed, and any JSON file of the pack by its path
export async function readGcudat(bytes) {
  const files = untar(await gunzip(bytes));
  const at = p => files[p] || files[Object.keys(files).find(k => k.endsWith('/' + p)) || ''];
  const m = at('gcudat.json'); if (!m) throw new Error('not a gcudat pack: no gcudat.json inside');
  const manifest = JSON.parse(dec.decode(m));
  return { manifest, json: p => { const f = at(p); if (!f) throw new Error(`the pack has no ${p}`); return JSON.parse(dec.decode(f)); } };
}
// the factbook-full expansion, kept small: which countries are landlocked, and their coastlines
// the minerals pack (gcu-library data/minerals: Wikidata's mineral species), kept as its records: { version, retrieved, records }
export async function mineralsFromGcudat(bytes) {
  const p = await readGcudat(bytes);
  if (p.manifest.name !== 'minerals') throw new Error(`that is the ${p.manifest.name} pack, not the minerals`);
  const index = p.json(p.manifest.index || 'dataset.json'), records = p.json(index.records || 'records.json');
  if (!Array.isArray(records) || !records.length) throw new Error('the minerals pack holds no records');
  return { name: 'minerals', version: p.manifest.version || index.version, retrieved: index.retrieved || null, records };
}
export async function factbookProfiles(fullBytes) {
  const f = await readGcudat(fullBytes); if (f.manifest.name !== 'factbook-full') throw new Error(`that is the ${f.manifest.name} pack, not the factbook's full profiles`);
  const fi = f.json(f.manifest.index || 'dataset.json'), fr = f.json(fi.records || 'records.json');
  return profilesOf(Array.isArray(fr) ? fr : fr.records);
}
// the factbook pack (and its factbook-full expansion) → what useFactbook() takes
export async function factbookFromGcudat(bytes, fullBytes) {
  const p = await readGcudat(bytes);
  if (p.manifest.name !== 'factbook') throw new Error(`that is the ${p.manifest.name} pack, not the factbook`);
  const index = p.json(p.manifest.index || 'dataset.json'), recs = p.json(index.records || 'records.json');
  const records = Array.isArray(recs) ? recs : recs.records;
  if (!Array.isArray(records) || !records.length) throw new Error('the factbook pack holds no records');
  const profiles = fullBytes ? await factbookProfiles(fullBytes) : null;
  return { name: 'factbook', version: p.manifest.version || index.version, attribution: p.manifest.attribution || index.attribution, license: p.manifest.license || index.license, records, ...(profiles ? { profiles } : {}) };
}

/* ── book packs (gcu-library books/<slug>: book.json and HTML chapters), compiled at install into what golem uses ── */
// The chapters are generated HTML (pandoc for ODS, Gutenberg for Strunk), regular enough to read by their tags here;
// only the compiled index is kept, not the book.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…' };
const entities = t => t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);
// TeX in a math span read as text: \(O(\log n)\) → O(log n)
const tex = t => t.replace(/\\[()[\]]/g, '').replace(/\\(log|ln|lg|max|min|sum|lceil|rceil|lfloor|rfloor|ldots|cdots|cdot|times|leq?|geq?|neq|in|infty|mathtt|mathrm|mathbf|textrm|text)\b/g, (m, w) => ({ lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', ldots: '…', cdots: '⋯', cdot: '·', times: '×', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', in: '∈', infty: '∞' })[w] ?? (/^(mathtt|mathrm|mathbf|textrm|text)$/.test(w) ? '' : w)).replace(/\\\{/g, '⦃').replace(/\\\}/g, '⦄').replace(/[{}]/g, '').replace(/⦃/g, '{').replace(/⦄/g, '}').replace(/\\[,;!]/g, ' ').replace(/\\(?=\s|$)/g, '');
export const plain = html => entities(tex(html.replace(/<span class="math[^"]*">([\s\S]*?)<\/span>/g, '$1').replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim();
const book = async bytes => {
  const p = await readGcudat(bytes), b = p.json(p.manifest.index || 'book.json'), files = untar(await gunzip(bytes));
  const file = path => { const k = Object.keys(files).find(x => x === path || x.endsWith('/' + path)); if (!k) throw new Error(`the pack has no ${path}`); return dec.decode(files[k]); };
  return { manifest: p.manifest, book: b, chapters: b.chapters.map((c, i) => ({ n: i + 1, id: c.id, title: plain(c.title), html: file(c.file) })) };
};
const camel = w => w.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const singular = w => w.replace(/(ies)$/, 'y').replace(/(ches|shes|sses|xes)$/, m => m.slice(0, -2)).replace(/([^s])s$/, '$1');
const DEFINING = /\b(called|we call|is called|are called|we say|known as|denote[sd]?|defined?|refer(?:s|red)? to|we use the term|the term|is a|is an|are)\b/i;
const STOPTERM = new Set(['introduction', 'that', 'a member of', 'share', 'remix', 'attribution', 'average', 'proof', 'not', 'all', 'any', 'only', 'one', 'two', 'each', 'every', 'must', 'some', 'never', 'always', 'very', 'exactly', 'and', 'or', 'the', 'is', 'are', 'can', 'cannot', 'does']);
// ODS: a term is where the book sets it in italics, a chapter title, or a structure named in a section heading; each with
// the paragraph that defines it, its chapter and section. The first place a term appears is where it is defined.
export async function compileOds(bytes) {
  const { manifest, book: b, chapters } = await book(bytes);
  if (manifest.name !== 'ods') throw new Error(`that is the ${manifest.name} pack, not ods`);
  const terms = {}, put = (t, where, passage) => { t = t.toLowerCase().replace(/\s+/g, ' ').trim(); if (t.length < 3 || t.length > 40 || STOPTERM.has(t) || terms[t] || !passage) return; terms[t] = { ...where, passage: passage.length > 900 ? passage.slice(0, 900).replace(/\s\S*$/, '') + ' …' : passage }; };
  chapters.forEach((c, ci) => {
    if (ci === 0) return;   // "Why This Book?": about the book, defines nothing
    const n = ci, where = { chapter: n, chapterTitle: c.title, section: null };
    let section = null, firstP = true;
    for (const m of c.html.matchAll(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>|<p>([\s\S]*?)<\/p>/g)) {
      if (m[1]) {
        const title = plain(m[2]); if (m[1] === 'h1') continue;
        section = { title, codes: [...m[2].matchAll(/<code>([A-Za-z][A-Za-z0-9]+)<\/code>/g)].map(x => x[1]) }; firstP = true; continue;
      }
      const html = m[3], text = plain(html), at = { ...where, section: section ? section.title : null };
      if (firstP) { if (!section) put(singular(c.title.toLowerCase()), at, text); else for (const code of section.codes) { put(code, at, text); if (/[a-z][A-Z]/.test(code)) put(camel(code), at, text); } firstP = false; }
      if (DEFINING.test(text)) for (const e of html.matchAll(/<em>([^<]{3,40})<\/em>/g)) { const t = plain(e[1]); if (/^[A-Za-z][A-Za-z -]*$/.test(t) && t.split(' ').length <= 4) put(t, at, text); }
    }
  });
  return { slug: 'ods', title: b.title, author: b.author, license: b.license, source: b.source, version: manifest.version || b.version || null, chapters: chapters.map(c => c.title), terms };
}
// Strunk: the phrase tables of the rules (a needless or negative phrase, and what to write) and the entries of chapter V
// (an expression and the advice), each with the rule or entry it comes from.
export async function compileStrunk(bytes) {
  const { manifest, book: b, chapters } = await book(bytes);
  if (manifest.name !== 'elements-of-style') throw new Error(`that is the ${manifest.name} pack, not elements-of-style`);
  const rules = {}, phrases = [], entries = [];
  for (const c of chapters) {
    let rule = null;
    for (const m of c.html.matchAll(/<h3>\s*(\d+)\.\s*([\s\S]*?)<\/h3>|<tr>\s*<td class="first">([\s\S]*?)<\/td>\s*<td class="second">([\s\S]*?)<\/td>|<p><b>([\s\S]*?)<\/b>([\s\S]*?)<\/p>/g)) {
      if (m[1]) { rule = +m[1]; rules[rule] = plain(m[2]); continue; }
      if (m[3] != null && rule) { const a = plain(m[3]), w = plain(m[4]); if (a.split(' ').length <= 6 && /^[a-z]/.test(a) && !/[.?!]$/.test(a)) phrases.push({ find: a, try: w, rule }); continue; }
      if (m[5] != null && /^V\./.test(c.title)) { const term = plain(m[5]).replace(/\.$/, ''), advice = plain(m[6]); if (term && term.split(' ').length <= 6) entries.push({ term, advice: advice.split(/(?<=[.;])\s/)[0], full: advice }); }
    }
  }
  return { slug: 'elements-of-style', title: b.title, author: b.author, license: b.license, source: b.source, version: manifest.version || b.version || null, rules, phrases, entries };
}

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

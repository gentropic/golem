// Where the device keeps golem (SPEC 13.9): @gcu/vfs over IndexedDB, one file per session, one per opened file, the
// device state and a small meta file, so a session can be exported as itself and nothing has a size cap but the
// browser's. Only what changed is written. When IndexedDB is not there, the whole state goes to localStorage as before;
// when neither is, nothing is kept and the page says so.
// IndexedDB writes are asynchronous and a closing tab may cut one short, so each change is first written to a small
// journal in localStorage (the session in use and the device state, synchronously); the journal is applied on load
// when it is newer than what IndexedDB holds, and cleared once IndexedDB has caught up.
//
//   /meta.json            { v, cur, sid }
//   /device.json          { aliases, facts, tables, recipes }
//   /sessions/<id>.json   a session with its card specs
//   /files/<hash>.json    a file opened on this device
//   /packs/<name>.json    an installed pack (step 8)
import { VFS } from '../vendor/vfs.js';

const LS_KEY = 'golem.state.v2', LS_OLD = 'golem.mock.v2', JOURNAL = 'golem.journal';
function journalOf(parts, at) { const s = parts.sessions.find(x => x.id === parts.meta.cur); return { at, meta: parts.meta, device: parts.device, session: s || null }; }
function readJournal() { try { return JSON.parse(localStorage.getItem(JOURNAL)); } catch (e) { return null; } }


// the state before 14 Oct 2026, in localStorage, if any
function legacy() {
  try { const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_OLD); return raw == null ? null : JSON.parse(raw); } catch (e) { return null; }
}
function dropLegacy() { try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_OLD); } catch (e) { /* */ } }

export async function openStore() {
  let vfs = null;
  try { if (typeof indexedDB !== 'undefined') vfs = await VFS.create({ type: 'idb', name: 'golem' }); } catch (e) { vfs = null; }
  if (vfs) return vfsStore(vfs);
  try { localStorage.setItem('golem.probe', '1'); localStorage.removeItem('golem.probe'); return localStore(); } catch (e) { return noStore(); }
}

function vfsStore(vfs) {
  const written = new Map();   // path → the text last written, so only changes are written again
  const read = async p => { try { return JSON.parse(await vfs.readFile(p)); } catch (e) { return null; } };   // readFile gives text
  const list = async dir => { try { return (await vfs.readdir(dir)).map(e => typeof e === 'string' ? e : e.name); } catch (e) { return []; } };
  const put = async (p, obj) => { const t = JSON.stringify(obj); if (written.get(p) === t) return; await vfs.writeFile(p, t); written.set(p, t); };
  let queue = Promise.resolve(), last = 0;
  return {
    kind: 'idb',
    // synchronous, small: what a closing tab must not lose
    journal(parts) { last = Date.now(); try { localStorage.setItem(JOURNAL, JSON.stringify(journalOf(parts, last))); } catch (e) { /* full or off: IndexedDB still gets it */ } },
    async load() {
      const meta = await read('/meta.json');
      if (!meta) {   // nothing in IndexedDB yet: the earlier localStorage state, then what the journal holds (a first save cut short)
        const old = legacy(), j = readJournal();
        if (!j) return old ? { state: old, migrated: true } : null;
        const base = old || { ss: [] };
        return { state: { ...base, ...j.device, cur: j.meta.cur, sid: Math.max(j.meta.sid || 0, base.sid || 0), files: base.files || {}, ss: [...(base.ss || []).filter(s => !j.session || s.id !== j.session.id), ...(j.session ? [j.session] : [])].sort((a, b) => a.id - b.id) }, migrated: true, journaled: true };
      }
      const device = (await read('/device.json')) || {};
      const ss = [];
      for (const n of await list('/sessions')) { const s = await read('/sessions/' + n); if (s) { ss.push(s); written.set('/sessions/' + n, JSON.stringify(s)); } }
      const files = {};
      for (const n of await list('/files')) { const f = await read('/files/' + n); if (f && f.hash) { files[f.hash] = f; written.set('/files/' + n, JSON.stringify(f)); } }
      ss.sort((a, b) => a.id - b.id);
      let state = { cur: meta.cur, sid: meta.sid, ...device, files, ss };
      const j = readJournal();
      if (j && j.at > (meta.at || 0)) {   // a change IndexedDB did not get: the journal's session and device state win
        state = { ...state, ...j.device, cur: j.meta.cur, sid: Math.max(j.meta.sid || 0, state.sid || 0) };
        if (j.session) state.ss = [...state.ss.filter(s => s.id !== j.session.id), j.session].sort((a, b) => a.id - b.id);
      }
      return { state, journaled: !!j };
    },
    // parts: { meta, device, sessions: [...], files: { hash: f } }; writes are queued, so they land in order
    save(parts) {
      const at = last || Date.now();
      queue = queue.then(async () => {
        await vfs.mkdir('/sessions', { recursive: true }).catch(() => {}); await vfs.mkdir('/files', { recursive: true }).catch(() => {});
        await put('/device.json', parts.device);
        const keepS = new Set(parts.sessions.map(s => `/sessions/${s.id}.json`)), keepF = new Set(Object.keys(parts.files).map(h => `/files/${h}.json`));
        for (const s of parts.sessions) await put(`/sessions/${s.id}.json`, s);
        for (const [h, f] of Object.entries(parts.files)) await put(`/files/${h}.json`, f);
        for (const n of await list('/sessions')) if (!keepS.has('/sessions/' + n)) { await vfs.unlink('/sessions/' + n).catch(() => {}); written.delete('/sessions/' + n); }
        for (const n of await list('/files')) if (!keepF.has('/files/' + n)) { await vfs.unlink('/files/' + n).catch(() => {}); written.delete('/files/' + n); }
        await put('/meta.json', { ...parts.meta, at });   // last: what it records is all written
        dropLegacy();   // moved: the old localStorage copy goes once the device has it
        try { const j = readJournal(); if (j && j.at <= at) localStorage.removeItem(JOURNAL); } catch (e) { /* */ }
      }).catch(() => { /* a failed write leaves the last good copy; the next change tries again */ });
      return queue;
    },
    async readPack(name) { return read(`/packs/${name}.json`); },
    async writePack(name, obj) { await vfs.mkdir('/packs', { recursive: true }).catch(() => {}); await vfs.writeFile(`/packs/${name}.json`, JSON.stringify(obj)); },
    async removePack(name) { await vfs.unlink(`/packs/${name}.json`).catch(() => {}); },
    async usage() { try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; } },
  };
}
// the fallback: everything in one localStorage entry, as before vfs (no packs: they do not fit)
function localStore() {
  return {
    kind: 'local', journal() {},
    async load() { const s = legacy(); return s ? { state: s } : null; },
    save(parts) { try { localStorage.setItem(LS_KEY, JSON.stringify({ ...parts.meta, ...parts.device, files: Object.fromEntries(Object.entries(parts.files).filter(([, f]) => f.text.length <= 1e6)), ss: parts.sessions })); } catch (e) { /* full */ } return Promise.resolve(); },
    async readPack() { return null; }, async writePack() { throw new Error('this browser gives golem no IndexedDB, so a pack cannot be kept'); }, async removePack() {},
    async usage() { return null; },
  };
}
function noStore() {
  return { kind: 'none', journal() {}, async load() { return null; }, save() { return Promise.resolve(); }, async readPack() { return null; }, async writePack() { throw new Error('this browser keeps nothing for golem'); }, async removePack() {}, async usage() { return null; } };
}

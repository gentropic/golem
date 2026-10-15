// What golem keeps on this device, as one inventory (the shell's "What golem keeps" view), and forgetting from it.
// Forgetting here leaves no card: it is the person tidying the device, as deleting a session is. A session that read
// what is forgotten says so when it replays (a word that no longer reads, a file not kept), and its cards keep what
// they were read with (tms.js marks those that used a taught value or formula).
import { S } from './core.js';
import { deviceChanged } from './sessions.js';
import { PREFS, prefLabel } from './prefs.js';

const REL = { overlies: 'overlies', cuts: 'cuts', encloses: 'contains clasts of', said_younger: 'is younger than' };
const bytes = v => new TextEncoder().encode(JSON.stringify(v === undefined ? null : v)).length;
const rowsOf = t => (S.tables[t] ? S.tables[t].rows : []);
const isValue = v => /^-?\d/.test(String(v));   // a taught value reads as a quantity ("2.7 t/m3"); a word, as words
const kb = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;

// → [{ kind, label, items: [{ key, text }], bytes }], in the order the view shows them
export function kept() {
  const al = Object.entries(S.aliases), field = rowsOf('field');
  const kinds = [
    { kind: 'words', label: 'Taught words', items: al.filter(([, v]) => !isValue(v)).map(([k, v]) => ({ key: k, text: `${k} → ${v}` })), data: al.filter(([, v]) => !isValue(v)) },
    { kind: 'values', label: 'Taught values', items: al.filter(([, v]) => isValue(v)).map(([k, v]) => ({ key: k, text: `${k} = ${v}` })), data: al.filter(([, v]) => isValue(v)) },
    { kind: 'formulas', label: 'Taught formulas', items: Object.entries(S.formulas).map(([k, f]) => ({ key: k, text: `${f.result} = ${f.expr}` })), data: S.formulas },
    { kind: 'notes', label: 'Notes', items: S.facts.map((f, i) => ({ key: i, text: f })), data: S.facts },
    { kind: 'places', label: 'Places', items: rowsOf('places').map(r => ({ key: r.name, text: `${r.name}: ${r.lat}, ${r.lon}` })), data: rowsOf('places') },
    { kind: 'stations', label: 'Field notebook', items: field.filter(r => r.feature === 'station').map(s => { const n = field.filter(r => r.station === s.station && r.feature !== 'station').length; return { key: s.station, text: `station ${s.station}, ${s.date}: ${n} ${n === 1 ? 'entry' : 'entries'}` }; }), data: field },
    { kind: 'log', label: 'Log', items: rowsOf('log').map(r => ({ key: r.id, text: `${r.date} ${r.activity}${r.value != null ? ` ${r.value}${r.unit ? ' ' + r.unit : ''}` : ''}` })), data: rowsOf('log') },
    { kind: 'orders', label: 'Standing orders', items: S.orders.map(o => ({ key: o.id, text: `${o.kind === 'must' ? 'every row needs' : 'warn when'} ${o.text}` })), data: S.orders },
    { kind: 'strata', label: 'Relative ages', items: S.strata.map(f => ({ key: f.id, text: `${f.na} ${REL[f.rel] || f.rel} ${f.nb}` })), data: S.strata },
    { kind: 'recipes', label: 'Recipes', items: Object.values(S.recipes).map(r => ({ key: r.name, text: `${r.name}: ${r.steps.length} ${r.steps.length === 1 ? 'step' : 'steps'}` })), data: S.recipes },
    { kind: 'files', label: 'Files', items: Object.values(S.files).map(f => ({ key: f.hash, text: `${f.name}, ${kb(f.size || 0)}` })), size: Object.values(S.files).reduce((s, f) => s + (f.size || 0), 0) },
    { kind: 'misses', label: 'What did not read', items: S.misses.map(m => ({ key: m.q, text: `${m.q} (${m.n}×)` })), data: S.misses },
    { kind: 'picks', label: 'Guesses picked, by skill', items: Object.entries(S.picks).map(([k, n]) => ({ key: k, text: `${k}: ${n}` })), data: S.picks },
    { kind: 'prefs', label: 'Settings changed', items: PREFS.filter(p => S.prefs[p.key] !== undefined).map(p => ({ key: p.key, text: `${p.label}: ${prefLabel(p, S.prefs[p.key])}` })), data: S.prefs },
  ];
  return kinds.map(({ data, size, ...k }) => ({ ...k, bytes: size != null ? size : bytes(data) }));
}

// forget one item of a kind, or the whole kind when key is undefined → how many went
export function forgetKept(kind, key) {
  const all = key === undefined, before = JSON.stringify(kept().find(k => k.kind === kind) || null);
  const drop = (t, keep) => { if (S.tables[t]) S.tables[t].rows = all ? [] : S.tables[t].rows.filter(keep); };
  const n0 = (kept().find(k => k.kind === kind) || { items: [] }).items.length;
  switch (kind) {
    case 'words': case 'values': for (const k of Object.keys(S.aliases)) if ((all ? (kind === 'values') === isValue(S.aliases[k]) : k === key)) delete S.aliases[k]; break;
    case 'formulas': if (all) S.formulas = {}; else delete S.formulas[key]; break;
    case 'notes': if (all) S.facts = []; else S.facts.splice(+key, 1); break;
    case 'places': drop('places', r => r.name !== key); break;
    case 'stations': drop('field', r => r.station !== key); break;
    case 'log': drop('log', r => r.id !== key); break;
    case 'orders': S.orders = all ? [] : S.orders.filter(o => o.id !== key); break;
    case 'strata': S.strata = all ? [] : S.strata.filter(f => f.id !== key); break;
    case 'recipes': if (all) S.recipes = {}; else delete S.recipes[key]; break;
    case 'files': if (all) S.files = {}; else delete S.files[key]; break;
    case 'misses': S.misses = all ? [] : S.misses.filter(m => m.q !== key); break;
    case 'picks': if (all) S.picks = {}; else delete S.picks[key]; break;
    case 'prefs': if (all) S.prefs = {}; else delete S.prefs[key]; break;
    default: return 0;
  }
  const after = kept().find(k => k.kind === kind) || { items: [] };
  if (JSON.stringify(after) !== before) deviceChanged();
  return n0 - after.items.length;
}

// Settings: what the person sets, kept on the device (S.prefs). Two kinds:
//   conventions change what an answer says (how planes are read and written, declination, precision). When golem reads
//     a request, the ones that differ from golem's default are copied into the card's args (stamp()), so the card says
//     which it used, a later change leaves it as it was, and a replay on another device agrees;
//   behaviour changes nothing an answer says: the decimal mark the page writes (the shell does that, as it does the
//     language), learning from what did not read, how old a position fix may be, how golem opens.
// Every setting can be said ("use strike and dip", "set declination to -22") and leaves a card; the Settings view sets
// the same ones without a card.
import { S, T, tool, frame, noun, said } from './core.js';

const num = (lo, hi) => s => { const m = /^[+-]?\d+(?:[.,]\d+)?$/.exec(String(s).trim()); const v = m ? +String(s).trim().replace(',', '.') : NaN; return v >= lo && v <= hi ? v : null; };
const DECL = num(-90, 90), ZONE = s => { const v = num(1, 60)(s); return v != null && Number.isInteger(v) ? v : null; };
// key, group ('answers': a convention; 'device': behaviour), def, options [{ v, label, words }], tools (the tools a
// convention is copied into; style: true for every tool, as args.style), put(args, v) (how a tool takes it), free (a
// value outside the options: a number)
export const PREFS = [
  { key: 'plane', group: 'answers', label: 'Plane notation', def: 'dd',
    options: [{ v: 'dd', label: 'dip direction/dip', words: ['dip direction', 'dd', 'dip direction/dip'] }, { v: 'sd', label: 'strike/dip (right-hand rule)', words: ['strike/dip', 'sd', 'strike', 'strike and dip', 'right-hand rule'] }],
    tools: ['thickness', 'plane', 'apparent', 'intersect', 'rake', 'measure'], put: (a, v) => { if (a.conv == null || a.conv === 'dd') a.conv = v; } },
  { key: 'decl', group: 'answers', label: 'Declination', def: 'wmm',
    options: [{ v: 'wmm', label: 'the World Magnetic Model where the place is known, to true north', words: ['wmm', 'true', 'true north', 'auto'] }, { v: 'none', label: 'none: magnetic north, as measured', words: ['none', 'magnetic', 'magnetic north', 'off'] }],
    free: { parse: DECL, label: v => `fixed, ${Math.abs(v)}° ${v < 0 ? 'west' : 'east'}`, hint: 'a fixed declination in degrees, east positive' },
    tools: ['measure', 'fieldAdd'], put: (a, v) => { a.decl = v; } },
  { key: 'sig', group: 'answers', label: 'Significant figures (at most)', def: 6, style: true,
    options: [3, 4, 5, 6].map(v => ({ v, label: String(v) })), free: { parse: s => { const v = num(2, 6)(s); return Number.isInteger(v) ? v : null; }, label: String } },
  { key: 'bearing', group: 'answers', label: 'Bearings', def: 'azimuth', style: true,
    options: [{ v: 'azimuth', label: 'azimuths (045)', words: ['azimuth','azimuths'] }, { v: 'quadrant', label: 'quadrant bearings (N45°E)', words: ['quadrant','quadrants'] }] },
  { key: 'coords', group: 'answers', label: 'Latitude and longitude', def: 'dd', style: true,
    options: [{ v: 'dd', label: 'decimal degrees', words: ['decimal','decimal degrees','dd'] }, { v: 'dms', label: 'degrees, minutes and seconds', words: ['dms','degrees minutes seconds','degrees minutes and seconds'] }] },
  { key: 'datum', group: 'answers', label: 'UTM datum', def: 'WGS84',
    options: [{ v: 'WGS84', label: 'WGS84', words: ['wgs84','wgs 84'] }, { v: 'SIRGAS 2000', label: 'SIRGAS 2000', words: ['sirgas','sirgas 2000'] }], tools: ['utm'], put: (a, v) => { if (a.place && !a.datum) a.datum = v; } },
  { key: 'zone', group: 'answers', label: 'UTM zone', def: 'auto',
    options: [{ v: 'auto', label: 'the zone the place is in', words: ['auto','automatic'] }], free: { parse: ZONE, label: v => `always zone ${v}`, hint: 'a zone, 1 to 60' },
    tools: ['utm'], put: (a, v) => { if (a.place && !a.zoneForced) a.zoneForced = v; } },
  { key: 'units', group: 'answers', label: 'Distances and thicknesses', def: 'metric',
    options: [{ v: 'metric', label: 'metres and kilometres', words: ['metric','metres','si'] }, { v: 'imperial', label: 'feet and miles', words: ['imperial','feet'] }], tools: ['distance', 'thickness'], put: (a, v) => { a.units = v; } },
  { key: 'numbers', group: 'device', label: 'Decimal mark', def: 'point',
    options: [{ v: 'point', label: 'a point (1,234.5)', words: ['point','dot','decimal point'] }, { v: 'comma', label: 'a comma (1.234,5)', words: ['comma','decimal comma'] }] },
  { key: 'learn', group: 'device', label: 'Learning from what did not read', def: 'on',
    options: [{ v: 'on', label: 'on: kept on this device, offered to teach', words: ['on','yes'] }, { v: 'off', label: 'off: nothing is kept', words: ['off','no'] }] },
  { key: 'fixAge', group: 'device', label: 'Oldest position fix taken', def: 120,
    options: [{ v: 30, label: '30 seconds', words: ['30 s','30 seconds'] }, { v: 120, label: '2 minutes', words: ['2 min','2 minutes'] }, { v: 600, label: '10 minutes', words: ['10 min','10 minutes'] }] },
  { key: 'opens', group: 'device', label: 'When golem opens', def: 'left',
    options: [{ v: 'left', label: 'awake or asleep, as it was left', words: ['as left','left','last'] }, { v: 'awake', label: 'always awake', words: ['awake'] }, { v: 'asleep', label: 'always asleep', words: ['asleep'] }] },
];
export const prefByKey = k => PREFS.find(p => p.key === k);
export const prefOf = k => { const p = prefByKey(k), v = S.prefs[k]; return v === undefined ? p && p.def : v; };
// a value as said: the option's label, or the free value's
export const prefLabel = (p, v) => { const o = p.options.find(x => x.v === v); return o ? o.label : p.free ? p.free.label(v) : String(v); };
// a value from words: an option by its value or label, or a free value
export function prefParse(p, s) {
  const w = String(s).trim().toLowerCase().replace(/^(?:the|a|an)\s+/, '');
  const o = p.options.find(x => String(x.v).toLowerCase() === w || x.label.toLowerCase() === w || (x.words || []).includes(w));
  if (o) return o.v;
  return p.free ? p.free.parse(w) : null;
}
// set without a card (the Settings view); the default is kept as no entry
export function setPref(k, v) { const p = prefByKey(k); if (!p) return false; if (v === p.def) delete S.prefs[k]; else S.prefs[k] = v; return true; }

// The conventions a card is read with: copied into a fresh reading's args before its tool runs (reading.js), only where
// they differ from golem's default, so a card read with the defaults has nothing added. → what was copied, as words.
export function stamp(name, args) {
  if (!args || typeof args !== 'object' || /^prefs?(?:Reset)?$/.test(name)) return [];
  const out = [];
  for (const p of PREFS) {
    if (p.group !== 'answers') continue;
    const v = S.prefs[p.key]; if (v === undefined || v === p.def) continue;
    if (p.style) { args.style = { ...(args.style || {}), [p.key]: v }; out.push(`${p.label.toLowerCase()}: ${prefLabel(p, v)}`); }
    else if (p.tools.includes(name)) { const before = JSON.stringify(args); p.put(args, v); if (JSON.stringify(args) !== before) out.push(`${p.label.toLowerCase()}: ${prefLabel(p, v)}`); }
  }
  return out;
}

/* ── the settings as cards ───────────────────────────────────── */
const NOTE = { answers: 'Cards read from now on use it; cards already made keep what they were read with.', device: 'Answers are unchanged; this is how golem behaves on this device.' };
tool({
  name: 'pref', effects: ['device'],
  skill: { group: 'Session', title: 'Settings', on: 'this device', about: 'How golem reads and writes planes, bearings, coordinates and numbers, the declination it applies, and how it behaves. Say it or set it under Settings. A setting that changes answers is copied into each card read with it.', examples: ['use strike and dip', 'set declination to -22', 'use decimal commas', 'show my settings'] },
  topic: a => ['Settings', .3],
  undo: a => { if (!a.done) return; if (a.was === null) delete S.prefs[a.key]; else S.prefs[a.key] = a.was; },
  run: a => {
    const p = prefByKey(a.key); if (!p) return null;
    if (!a.done) { a.was = S.prefs[a.key] === undefined ? null : S.prefs[a.key]; setPref(a.key, a.value); a.done = true; }
    const was = a.was === null ? p.def : a.was;
    return { read: ['set', { v: p.label.toLowerCase() }, 'to', { v: prefLabel(p, a.value) }], value: a.value,
      body: [{ t: 'note', kind: 'ok', ...said('Set. {setting}: {value}.', { setting: p.label, value: prefLabel(p, a.value) }) }, { t: 'sub', text: NOTE[p.group] },
        { t: 'kv', rows: [['before', prefLabel(p, was)], ['golem\'s default', prefLabel(p, p.def)]] }, { t: 'chips', items: ['show my settings'] }],
      trace: [`prefs.${a.key} = ${JSON.stringify(a.value)}${was !== a.value ? ` (was ${JSON.stringify(was)})` : ' (unchanged)'}`] };
  }
});
tool({
  name: 'prefs',
  topic: () => ['Settings', .3],
  run: a => {
    const rows = PREFS.map(p => [p.label, prefLabel(p, prefOf(p.key)), prefOf(p.key) === p.def ? 'default' : 'set here']);
    const n = Object.keys(S.prefs).length;
    return { read: a.reset ? ['reset the settings to golem\'s defaults'] : ['the settings on this device'], value: n,
      body: [...(a.reset ? [{ t: 'note', kind: 'ok', ...said('Reset: {n} settings back to golem\'s defaults.', { n: Object.keys(a.was).length }) }] : []),
        { t: 'lbl', text: 'Answers' }, { t: 'table', head: ['setting', 'value', ''], rows: rows.filter((_, i) => PREFS[i].group === 'answers'), tr: [0, 1, 2] },
        { t: 'lbl', text: 'This device' }, { t: 'table', head: ['setting', 'value', ''], rows: rows.filter((_, i) => PREFS[i].group === 'device'), tr: [0, 1, 2] },
        { t: 'sub', text: 'Change one by saying it ("use strike and dip", "set significant figures to 4"), or under Settings.' }],
      trace: [a.reset ? 'prefs cleared' : `prefs: ${n} set on this device`] };
  }
});
tool({
  name: 'prefsReset', effects: ['device'],
  topic: () => ['Settings', .3],
  undo: a => { if (a.done) S.prefs = { ...a.was }; },
  run: a => { if (!a.done) { a.was = { ...S.prefs }; S.prefs = {}; a.done = true; } return T.prefs({ reset: true, was: a.was }); }
});

/* ── what reads them ─────────────────────────────────────────── */
// the settings by name: "set declination to -22", "set significant figures to 4", "change the utm zone to 23"
const SETTING = {
  plane: [['planes', 'plane notation', 'plane convention', 'plane format'], ['planos', 'notação dos planos']],
  decl: [['declination', 'magnetic declination', 'declination correction'], ['declinação', 'declinação magnética']],
  sig: [['significant figures', 'sig figs', 'precision'], ['algarismos significativos', 'precisão']],
  bearing: [['bearings', 'bearing notation', 'bearing format'], ['rumos', 'notação dos rumos']],
  coords: [['coordinates', 'coordinate format', 'latitude and longitude'], ['coordenadas', 'formato das coordenadas']],
  datum: [['datum', 'utm datum'], ['datum']],
  zone: [['utm zone', 'zone'], ['zona utm', 'fuso', 'fuso utm']],
  units: [['units', 'unit system', 'distance units'], ['unidades', 'sistema de unidades']],
  numbers: [['numbers', 'decimal mark', 'decimal separator', 'number format'], ['números', 'separador decimal', 'marca decimal']],
  learn: [['learning', 'learning from misses'], ['aprendizado', 'aprendizagem']],
  fixAge: [['oldest position fix', 'position fix age', 'fix age'], ['idade da posição']],
  opens: [['opening', 'how golem opens', 'start up'], ['abertura']],
};
noun({ type: 'setting', words: Object.fromEntries(Object.entries(SETTING).map(([k, [en]]) => [k, en])), words_pt: Object.fromEntries(Object.entries(SETTING).map(([k, [, pt]]) => [k, pt])) });
frame({
  name: 'prefSet', label: 'Set', words: ['set', 'change', 'make'], theme: ['setting'], required: ['theme', 'to'], roles: { to: { preps: ['to', 'as'], types: ['text'] } },
  words_pt: ['muda', 'mude', 'ajusta', 'ajuste', 'põe', 'coloca'], label_pt: 'Ajustar',
  bind: c => {
    const p = prefByKey(c.theme[0].value), to = c.roles.to && String(c.roles.to[0].value); if (!p || !to) return null;
    const v = prefParse(p, to);
    return v == null ? { clarify: `${p.label}: ${p.options.map(o => `"${(o.words || [o.label])[0]}"`).join(', ')}${p.free ? `, or ${p.free.hint || 'a number'}` : ''}` } : { tool: 'pref', args: { key: p.key, value: v } };
  }
});
// a setting by its value: "use strike and dip", "use decimal commas", "switch to quadrant bearings"
const VALUE = {
  'plane:sd': [['strike and dip', 'strike/dip', 'strike dip', 'the right hand rule', 'right hand rule', 'the right-hand rule'], ['direção e mergulho', 'strike e dip', 'regra da mão direita']],
  'plane:dd': [['dip direction and dip', 'dip direction/dip', 'dip direction', 'dip directions'], ['sentido de mergulho', 'direção de mergulho', 'direção do mergulho']],
  'bearing:quadrant': [['quadrant bearings', 'quadrants', 'quadrant notation'], ['quadrantes', 'rumos em quadrante']],
  'bearing:azimuth': [['azimuths', 'azimuth bearings', 'whole circle bearings'], ['azimutes']],
  'coords:dms': [['degrees minutes and seconds', 'degrees minutes seconds', 'dms'], ['graus minutos e segundos', 'gms']],
  'coords:dd': [['decimal degrees'], ['graus decimais']],
  'datum:SIRGAS 2000': [['sirgas 2000', 'sirgas'], ['sirgas 2000', 'sirgas']],
  'datum:WGS84': [['wgs84', 'wgs 84'], ['wgs84', 'wgs 84']],
  'units:metric': [['metric units', 'metric', 'metres', 'meters'], ['unidades métricas', 'sistema métrico', 'metros']],
  'units:imperial': [['imperial units', 'imperial', 'feet and miles', 'feet'], ['unidades imperiais', 'pés e milhas', 'pés']],
  'numbers:comma': [['decimal commas', 'a decimal comma', 'decimal comma'], ['vírgula decimal', 'vírgulas decimais']],
  'numbers:point': [['decimal points', 'a decimal point', 'decimal point'], ['ponto decimal', 'pontos decimais']],
  'decl:none': [['magnetic north', 'no declination'], ['norte magnético', 'sem declinação']],
  'decl:wmm': [['true north', 'the world magnetic model'], ['norte verdadeiro', 'o modelo magnético mundial']],
};
noun({ type: 'prefvalue', words: Object.fromEntries(Object.entries(VALUE).map(([k, [en]]) => [k, en])), words_pt: Object.fromEntries(Object.entries(VALUE).map(([k, [, pt]]) => [k, pt])) });
frame({
  name: 'prefUse', label: 'Use', words: ['use', 'switch to', 'write', 'write in', 'prefer'], theme: ['prefvalue'], required: ['theme'], roles: {},
  words_pt: ['usa', 'use', 'muda para', 'escreve em', 'prefiro'], label_pt: 'Usar',
  bind: c => {
    const [k, ...rest] = String(c.theme[0].value).split(':'), p = prefByKey(k), raw = rest.join(':');
    const v = p && p.options.find(o => String(o.v) === raw); return v ? { tool: 'pref', args: { key: k, value: v.v } } : null;
  }
});
noun({ type: 'settingsnoun', words: { all: ['settings', 'my settings', 'the settings', 'preferences', 'my preferences'] }, words_pt: { all: ['configurações', 'minhas configurações', 'as configurações', 'preferências'] } });
frame({
  name: 'prefs', label: 'Settings', words: ['show', 'list', 'what are'], elidable: true, theme: ['settingsnoun'], required: ['theme'], roles: {},
  words_pt: ['mostra', 'lista', 'quais são'], label_pt: 'Configurações',
  bind: () => ({ tool: 'prefs', args: {} })
});
frame({
  name: 'prefsReset', label: 'Reset settings', words: ['reset', 'restore', 'clear'], theme: ['settingsnoun'], required: ['theme'], roles: {},
  words_pt: ['restaura', 'redefine', 'zera'], label_pt: 'Restaurar configurações',
  bind: () => ({ tool: 'prefsReset', args: {} })
});

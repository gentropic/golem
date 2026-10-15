// Relative ages by Steno's principles (SPEC 13: inference). What you say of the units — "the sandstone overlies the
// granite", "the dyke cuts the sandstone", "the conglomerate contains clasts of the granite", "the basalt is younger than
// the dyke" — is kept on the device (S.strata) as facts; the principles are Datalog rules (logic.js): superposition
// (what overlies is younger, the beds taken as the right way up), cross-cutting relationships (what cuts is younger),
// inclusions (what is enclosed is older), what you said outright, and that "younger" carries through. Asked, golem gives
// the order as far as it follows, says which units it cannot place against each other, answers "is X older than Y" with
// the chain that proves it or says it cannot tell, and reports any contradiction with both chains. Nothing is assumed
// beyond what was said.
import { S, tool, frame, noun } from './core.js';
import { infer, proofOf, keyOf } from './logic.js';

const RULES = [
  { name: 'superposition: what overlies is younger (the beds the right way up)', head: { rel: 'younger', args: ['X', 'Y'] }, body: [{ rel: 'overlies', args: ['X', 'Y'] }] },
  { name: 'cross-cutting relationships: what cuts is younger', head: { rel: 'younger', args: ['X', 'Y'] }, body: [{ rel: 'cuts', args: ['X', 'Y'] }] },
  { name: 'inclusions: what is enclosed is older', head: { rel: 'younger', args: ['X', 'Y'] }, body: [{ rel: 'encloses', args: ['X', 'Y'] }] },
  { name: 'as you said', head: { rel: 'younger', args: ['X', 'Y'] }, body: [{ rel: 'said_younger', args: ['X', 'Y'] }] },
  { name: '"younger than" carries through', head: { rel: 'younger', args: ['X', 'Z'] }, body: [{ rel: 'younger', args: ['X', 'Y'] }, { rel: 'younger', args: ['Y', 'Z'] }] }
];
const SAID = { overlies: 'overlies', cuts: 'cuts', encloses: 'contains clasts of', said_younger: 'is younger than' };
const norm = s => String(s).toLowerCase().replace(/[.?!,;]+$/, '').replace(/^(?:the|a|an|unit|o|os|as|um|uma|unidade)\s+/, '').trim();
const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
// the names as first said ("the Bambuí sandstone" → "Bambuí sandstone"), keyed by their folded form
const names = () => { const m = new Map(); for (const f of S.strata) for (const [k, n] of [[f.a, f.na], [f.b, f.nb]]) if (!m.has(k)) m.set(k, n || k); return m; };
const facts = () => S.strata.map(f => ({ rel: f.rel, args: [f.a, f.b], said: f.id }));
function world() {
  const known = infer(facts(), RULES), units = [...names().keys()], nm = names();
  const younger = (a, b) => known.has(`younger(${a},${b})`);
  const loops = units.filter(u => younger(u, u));
  return { known, units, nm, younger, loops };
}
// a proof as lines a person reads: what was said (with the card it came from), then each rule that follows
function because(w, a, b) {
  const steps = proofOf(w.known, `younger(${a},${b})`), line = s => {
    const [x, y] = s.fact.args.map(u => w.nm.get(u) || u);
    if (s.rule == null) { const said = S.strata.find(f => f.id === s.said); return `${x} ${SAID[s.fact.rel] || s.fact.rel} ${y}: as said${said && said.card ? ` (#${String(said.card).padStart(2, '0')})` : ''}`; }
    return `so ${x} is younger than ${y}: ${s.rule}`;
  };
  return steps.filter(s => !(s.rule && s.rule === 'as you said')).map(line);   // a thing said outright needs no second line
}
// the order as far as it follows: layers, youngest first; units in one layer are not ordered against each other
function layers(w) {
  const left = new Set(w.units.filter(u => !w.loops.includes(u))), out = [];
  while (left.size) {
    const top = [...left].filter(u => ![...left].some(v => v !== u && w.younger(v, u)));
    if (!top.length) break;
    out.push(top); top.forEach(u => left.delete(u));
  }
  return out;
}

tool({
  name: 'strataSay', effects: ['device'],
  skill: { group: 'Field', title: 'Relative ages', on: 'Steno\'s principles as Datalog rules', about: 'Say how the units relate ("the sandstone overlies the granite", "the dyke cuts the sandstone", "the conglomerate contains clasts of the granite") and golem infers their order by superposition, cross-cutting relationships and inclusions, answers "is X older than Y" with the chain that proves it, says what it cannot tell, and points out a contradiction.', examples: ['the sandstone overlies the granite', 'the dyke cuts the sandstone', 'the order of the units', 'is the dyke older than the granite', 'why is the dyke younger than the granite'] },
  topic: a => ['Relative ages', 1],
  undo: a => { S.strata = S.strata.filter(f => f.id !== a.id); },
  run: a => {
    if (!S.strata.some(f => f.id === a.id)) S.strata.push({ id: a.id, rel: a.rel, a: a.a, b: a.b, na: a.na, nb: a.nb, card: a.card || null });
    // every relation is kept with the younger first: what overlies, cuts or encloses (flipped forms were turned round)
    const w = world(), younger = a.na, older = a.nb;
    const body = [{ t: 'note', kind: 'ok', text: `Kept: ${a.na} ${SAID[a.rel]} ${a.nb}, so ${younger} is younger than ${older} (${RULES.find(r => r.body[0].rel === a.rel).name}).` }];
    if (w.loops.length) body.push({ t: 'note', kind: 'err', text: `That contradicts what was said before: ${w.loops.map(u => w.nm.get(u)).join(', ')} would be younger than ${w.loops.length > 1 ? 'themselves' : 'itself'}.` }, { t: 'steps', items: because(w, w.loops[0], w.loops[0]) });
    const ls = layers(w);
    if (!w.loops.length && ls.length > 1) body.push({ t: 'sub', text: `The order so far, youngest first: ${ls.map(l => l.map(u => w.nm.get(u)).join(' / ')).join(' → ')}.` });
    body.push({ t: 'chips', items: ['the order of the units'] });
    return { read: [{ v: a.na }, SAID[a.rel], { v: a.nb }], body, trace: [`fact: ${a.rel}(${a.a}, ${a.b})`, `${w.known.size} facts follow from ${S.strata.length} said, by ${RULES.length} rules`] };
  }
});
tool({
  name: 'strataOrder',
  topic: () => ['Relative ages', 1],
  run: () => {
    if (!S.strata.length) return { read: ['the order of the units'], body: [{ t: 'note', text: 'Nothing said yet. Tell me how the units relate: "the sandstone overlies the granite", "the dyke cuts the sandstone".' }], trace: ['no facts'] };
    const w = world(), ls = layers(w);
    const body = [];
    if (w.loops.length) body.push({ t: 'note', kind: 'err', text: `What was said contradicts itself: ${w.loops.map(u => w.nm.get(u)).join(', ')} would be younger than ${w.loops.length > 1 ? 'themselves' : 'itself'}. Here is how:` }, { t: 'steps', items: because(w, w.loops[0], w.loops[0]) });
    body.push({ t: 'table', head: ['', 'youngest first', ''], rows: ls.map((l, i) => [String(i + 1), l.map(u => w.nm.get(u)).join(' · '), l.length > 1 ? 'not ordered against each other: nothing said decides it' : '']) });
    const pairs = [], all = w.units.filter(u => !w.loops.includes(u));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (!w.younger(all[i], all[j]) && !w.younger(all[j], all[i])) pairs.push(`${w.nm.get(all[i])} and ${w.nm.get(all[j])}`);
    if (pairs.length) body.push({ t: 'sub', text: `I cannot tell the ages of ${pairs.slice(0, 6).join('; ')}${pairs.length > 6 ? `; and ${pairs.length - 6} more pairs` : ''}. A contact, a cut or an inclusion between them would.` });
    return { read: ['the order of the units'], value: ls.length, body: [...body, { t: 'src', text: `Steno's principles as ${RULES.length} rules over ${S.strata.length} things said, on this device` }],
      trace: [`${w.known.size} facts follow from ${S.strata.length} said`, `layered by "younger": ${ls.length} layers`] };
  }
});
tool({
  name: 'strataAsk',
  topic: () => ['Relative ages', 1],
  run: a => {
    const w = world(), x = norm(a.x), y = norm(a.y), nx = w.nm.get(x) || a.x, ny = w.nm.get(y) || a.y, wantOlder = a.q === 'older';
    const read = [a.why ? 'why is' : 'is', { v: nx }, wantOlder ? 'older than' : 'younger than', { v: ny }];
    const missing = [x, y].filter(u => !w.nm.has(u));
    if (missing.length) return { read, body: [{ t: 'note', text: `Nothing was said about ${missing.map(u => u === x ? a.x : a.y).join(' or ')}. I know ${[...w.nm.values()].join(', ') || 'no units yet'}.` }], trace: ['unknown unit'] };
    const yes = wantOlder ? w.younger(y, x) : w.younger(x, y), no = wantOlder ? w.younger(x, y) : w.younger(y, x);
    if (yes && no) return { read, body: [{ t: 'note', kind: 'err', text: 'Both, which means what was said contradicts itself. Both chains:' }, { t: 'steps', items: [...because(w, x, y), ...because(w, y, x)] }], trace: ['contradiction'] };
    if (!yes && !no) return { read, value: null, body: [{ t: 'note', text: `I cannot tell: nothing said links ${nx} and ${ny}, directly or through other units.` }], trace: ['neither follows'] };
    const [p, q] = yes ? (wantOlder ? [y, x] : [x, y]) : (wantOlder ? [x, y] : [y, x]);
    return { read, value: yes,
      body: [{ t: 'big', v: yes ? (a.why ? 'Because' : 'Yes') : 'No', unit: yes ? '' : `${w.nm.get(p)} is younger than ${w.nm.get(q)}` }, { t: 'steps', items: because(w, p, q) }],
      trace: [`younger(${p}, ${q}) follows`, `${because(w, p, q).length} steps`] };
  }
});

/* ── what reads them ─────────────────────────────────────────── */
const REL = [['overlies', ['overlies', 'lies above', 'rests on', 'sits on', 'lies on', 'is on top of', 'covers'], ['sobrepõe', 'está acima de', 'recobre', 'fica sobre'], false],
  ['overlies', ['underlies', 'lies below', 'lies under', 'is beneath', 'lies beneath'], ['está abaixo de', 'fica sob'], true],
  ['cuts', ['cuts', 'intrudes', 'crosscuts', 'cross-cuts', 'cuts across', 'offsets', 'truncates', 'displaces'], ['corta', 'intrude', 'desloca', 'trunca'], false],
  ['cuts', ['is cut by', 'is intruded by', 'is offset by', 'is truncated by'], ['é cortado por', 'é cortada por', 'é intrudido por'], true],
  ['encloses', ['contains clasts of', 'has clasts of', 'contains xenoliths of', 'has xenoliths of', 'has inclusions of', 'contains pebbles of', 'contains fragments of'], ['contém clastos de', 'contém xenólitos de', 'tem clastos de'], false],
  ['said_younger', ['is younger than'], ['é mais jovem que', 'é mais nova que'], false],
  ['said_younger', ['is older than'], ['é mais velho que', 'é mais antigo que', 'é mais velha que', 'é mais antiga que'], true]];
REL.forEach(([rel, words, words_pt, flip], i) => frame({
  name: `strata${i}`, label: 'Relative ages', words, subject: ['text'], theme: ['text'], required: ['theme', 'subject'], roles: {}, words_pt, label_pt: 'Idades relativas',
  bind: c => {
    const s = c.roles.subject && c.roles.subject[0], t = c.theme[0]; if (!s || !t) return null;
    let [na, nb] = [String(s.value).trim(), String(t.value).trim()].map(x => x.replace(/^(?:the|a|an|o|os|as|um|uma)\s+/i, '').replace(/[.?!]+$/, '')); if (flip) [na, nb] = [nb, na];
    const a = norm(na), b = norm(nb); if (!a || !b || a === b || a.split(/\s+/).length > 5 || b.split(/\s+/).length > 5) return null;
    return { tool: 'strataSay', args: { id: newId(), rel, a, b, na, nb } };
  }
}));
noun({ type: 'strataorder', words: { order: ['the order of the units', 'the order', 'the sequence', 'the relative ages', 'relative ages', 'the stratigraphic order', 'the age order', 'the order of events'] }, words_pt: { order: ['a ordem das unidades', 'a ordem', 'as idades relativas', 'a sequência'] } });
frame({ name: 'strataOrder', label: 'Relative ages', words: ['show', 'what is', 'give me', 'work out'], elidable: true, theme: ['strataorder'], required: ['theme'], roles: {}, words_pt: ['mostra', 'qual é'], label_pt: 'Idades relativas', bind: () => ({ tool: 'strataOrder', args: {} }) });
// "is the dyke older than the granite", "why is the dyke younger than the granite": the words after the verb, cut at the comparison
const askBind = why => c => {
  const m = /^(.+?)\s+(older|younger|mais velho|mais velha|mais antigo|mais antiga|mais jovem|mais novo|mais nova)\s+(?:than|que|do que)\s+(.+?)\??$/i.exec(String(c.theme[0].value).trim()); if (!m) return null;
  return { tool: 'strataAsk', args: { x: m[1].replace(/^(?:the|a|an|o|os|as|um|uma)\s+/i, ''), y: m[3].replace(/^(?:the|a|an|o|os|as|um|uma)\s+/i, ''), q: /older|velh|antig/i.test(m[2]) ? 'older' : 'younger', ...(why ? { why: true } : {}) } };
};
frame({ name: 'strataAsk', label: 'Relative ages', words: ['is', 'are'], theme: ['text'], required: ['theme'], roles: {}, words_pt: ['é'], label_pt: 'Idades relativas', bind: askBind(false) });
frame({ name: 'strataWhy', label: 'Relative ages', words: ['why is', 'how do you know', 'prove'], theme: ['text'], required: ['theme'], roles: {}, words_pt: ['por que', 'por que o', 'por que a'], label_pt: 'Idades relativas', bind: askBind(true) });

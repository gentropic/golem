/* ── records: Factbook sample (rounded) ────────────────────── */
const FB = [['Australia', 'Canberra', 7741220, 26.8e6, 0], ['Brazil', 'Brasília', 8515770, 220.1e6, 0], ['Canada', 'Ottawa', 9984670, 38.8e6, 0], ['Chile', 'Santiago', 756102, 18.7e6, 0],
  ['Germany', 'Berlin', 357022, 84.1e6, 0], ['Indonesia', 'Jakarta', 1904569, 281.6e6, 0], ['Ireland', 'Dublin', 70273, 5.2e6, 0], ['Japan', 'Tokyo', 377915, 123.2e6, 0],
  ['Kazakhstan', 'Astana', 2724900, 20.3e6, 1], ['Mongolia', 'Ulaanbaatar', 1564116, 3.3e6, 1], ['Peru', 'Lima', 1285216, 32.6e6, 0], ['Portugal', 'Lisbon', 92090, 10.2e6, 0],
  ['South Africa', 'Pretoria', 1219090, 60.4e6, 0], ['Zambia', 'Lusaka', 752618, 20.8e6, 1]];
const fbFind = n => FB.find(r => r[0].toLowerCase() === n.trim().replace(/^the /, ''));
const FBSRC = '<div class="src">factbook pack · 14-country rounded sample in this mock</div>';
T.fact = a => {
  const r = fbFind(a.country); if (!r) return null;
  const read = [a.field, 'of', { v: r[0] }], trace = [`factbook.get("${r[0]}")`]; let big, py = `data("factbook")["${r[0]}"].${a.field}`;
  if (a.field === 'capital') big = `<div class="big">${r[1]}</div>`;
  else if (a.field === 'population') big = `<div class="big">${fmt(r[3], 4)} <small>people</small></div>`;
  else if (a.field === 'area') {
    let un = a.unit && parseUnit(a.unit); if (!un || un.dim !== 'A') un = parseUnit('km²');
    read.push('in', { v: un.name }); big = `<div class="big">${fmt(r[2] * 1e6 / un.f, 5)} <small>${un.name}</small></div>`;
    trace.push(`area ${fmt(r[2], 9)} km² → ${un.name}`); py = `units.convert(${py}, "km²", "${un.name}")`;
  } else {
    const mi = /mi/.test(a.unit || ''), v = r[3] / r[2] * (mi ? 2.589988110336 : 1), per = mi ? 'sq mi' : 'km²';
    read.push('in', { v: 'people / ' + per }); big = `<div class="big">${fmt(v, 3)} <small>people per ${per}</small></div>`;
    trace.push(`population ${fmt(r[3], 4)} ÷ area ${fmt(r[2], 9)} km²`, mi ? 'units: per km² → per sq mi' : 'no unit change');
    py = `c = data("factbook")["${r[0]}"]\nunits.convert(c.population / c.area, "1/km²", "1/${per}")`;
  }
  return { read, amend: 'fact', html: big + FBSRC, trace, py };
};
T.factList = a => {
  const k = a.by === 'population' ? 3 : 2, rows = FB.filter(r => r[4]).sort((x, y) => y[k] - x[k]);
  return { read: ['filter countries where', { v: 'landlocked' }, 'sort by', { v: a.by, key: 'by', alts: ['area', 'population'], cur: a.by }],
    html: `<div class="tbl"><table><tr><th>Country</th><th class="n">Area km²</th><th class="n">Population</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td class="n">${fmt(r[2], 9)}</td><td class="n">${fmt(r[3], 4)}</td></tr>`).join('')}</table></div><div class="sub">${rows.length} of ${FB.length} records match.</div>${FBSRC}`,
    trace: ['factbook.records → 14', 'filter landlocked = true', `sort by ${a.by}, descending`], py: `data("factbook").filter(landlocked=True).sort("${a.by}", desc=True)` };
};

/* ── minerals: properties + identification key ─────────────── */
const MIN = {
  pyrite: ['FeS₂', '6–6.5', '4.9–5.2', 'greenish black', 'm', 'dark', 3, 'n', 'n', 'yellow'], chalcopyrite: ['CuFeS₂', '3.5–4', '4.1–4.3', 'greenish black', 'm', 'dark', 2, 'n', 'n', 'yellow'],
  galena: ['PbS', '2.5', '7.4–7.6', 'lead grey', 'm', 'dark', 2, 'n', 'n', 'grey'], magnetite: ['Fe₃O₄', '5.5–6.5', '5.2', 'black', 'm', 'dark', 3, 'y', 'n', 'black'],
  hematite: ['Fe₂O₃', '5.5–6.5', '5.3', 'red-brown', 'm', 'red', 3, 'n', 'n', 'grey'], molybdenite: ['MoS₂', '1–1.5', '4.6–4.7', 'bluish grey', 'm', 'dark', 1, 'n', 'n', 'grey'],
  gold: ['Au', '2.5–3', '19.3 when pure', 'golden yellow', 'm', 'gold', 2, 'n', 'n', 'yellow'], sphalerite: ['ZnS', '3.5–4', '3.9–4.1', 'brown to pale yellow', 'n', 'brown', 2, 'n', 'n', 'brown'],
  quartz: ['SiO₂', '7', '2.65', 'white', 'n', 'white', 3, 'n', 'n', 'clear'], calcite: ['CaCO₃', '3', '2.71', 'white', 'n', 'white', 2, 'n', 'y', 'clear'],
  fluorite: ['CaF₂', '4', '3.18', 'white', 'n', 'white', 2, 'n', 'n', 'clear'], malachite: ['Cu₂CO₃(OH)₂', '3.5–4', '3.6–4.0', 'light green', 'n', 'green', 2, 'n', 'y', 'green']
};
const MATTR = { lus: 4, st: 5, hard: 6, mag: 7, hcl: 8, col: 9 };
const KEYQ = {
  lus: ['What is the lustre?', { m: 'metallic', n: 'non-metallic' }],
  st: ['What colour is the streak on a porcelain plate?', { dark: 'black or dark grey', red: 'red-brown', gold: 'golden yellow', white: 'white', green: 'green', brown: 'brown to pale yellow' }],
  hard: ['How hard is it?', { 1: 'a fingernail scratches it', 2: 'a knife scratches it', 3: 'a knife does not scratch it' }],
  col: ['What colour is a fresh surface?', { yellow: 'brass or golden yellow', grey: 'grey to silver', black: 'black', clear: 'colourless or pale', brown: 'brown', green: 'green' }],
  mag: ['Does a magnet pick it up?', { y: 'yes', n: 'no' }], hcl: ['Does it fizz in dilute HCl?', { y: 'yes', n: 'no' }]
};
const minCard = n => { const m = MIN[n]; return `<dl class="kv"><dt>formula</dt><dd>${m[0]}</dd><dt>hardness</dt><dd>${m[1]} Mohs</dd><dt>density</dt><dd>${m[2]} g/cm³</dd><dt>streak</dt><dd>${m[3]}</dd><dt>lustre</dt><dd>${m[4] === 'm' ? 'metallic' : 'non-metallic'}</dd></dl><div class="src">minerals pack (proposed) · 12 minerals in this mock</div>`; };
T.mineral = a => {
  const m = MIN[a.name]; if (!m) return null;
  const i = { formula: 0, hardness: 1, density: 2, streak: 3 }[a.prop], unit = a.prop === 'density' ? ' g/cm³' : a.prop === 'hardness' ? ' Mohs' : '';
  if (i == null) return { read: ['describe mineral', { v: a.name }], html: minCard(a.name), trace: [`minerals.get("${a.name}")`], py: `data("minerals")["${a.name}"]` };
  return { read: [a.prop, 'of mineral', { v: a.name }], html: `<div class="big">${m[i]}<small>${unit}</small></div><div class="src">minerals pack (proposed)</div>`, trace: [`minerals.get("${a.name}").${a.prop}`], py: `data("minerals")["${a.name}"].${a.prop}` };
};
T.key = a => {
  a.ans = a.ans || {};
  const cand = Object.keys(MIN).filter(n => Object.entries(a.ans).every(([k, v]) => String(MIN[n][MATTR[k]]) === String(v)));
  const read = ['identify a mineral', ...Object.entries(a.ans).map(([k, v]) => ({ v: KEYQ[k][1][v] }))];
  const trace = [`minerals pack → ${Object.keys(MIN).length} candidates`, ...Object.entries(a.ans).map(([k, v]) => `keep ${k} = ${v}`), `${cand.length} left`];
  let best = null, bn = 1;
  Object.keys(MATTR).forEach(k => { if (k in a.ans) return; const n = new Set(cand.map(c => MIN[c][MATTR[k]])).size; if (n > bn) { bn = n; best = k; } });
  if (cand.length > 1 && best) {
    const vals = [...new Set(cand.map(c => String(MIN[c][MATTR[best]])))];
    return { read, trace, html: `<div class="sub">${cand.length} candidates: ${cand.join(', ')}</div>`,
      ask: { prompt: KEYQ[best][0], options: vals.map(v => ({ label: KEYQ[best][1][v], value: v })), set: (x, v) => { x.ans = { ...x.ans, [best]: v }; } } };
  }
  const n = Object.keys(a.ans).length;
  return { read, trace, html: `<div class="big">${cand.join(' or ')}</div><div class="sub">Reached in ${n} question${n === 1 ? '' : 's'}. Each question was the one that split the remaining candidates most.</div>${cand.length === 1 ? minCard(cand[0]) : ''}`, py: `key("minerals").identify(${JSON.stringify(a.ans)})` };
};

/* ── text: ODS term index + Strunk (1918) check ────────────── */
const ODS = { skiplist: ['4 Skiplists', '4.1 The Basic Structure'], 'hash table': ['5 Hash Tables', '5.1 ChainedHashTable'], 'binary heap': ['10 Heaps', '10.1 BinaryHeap'], treap: ['7 Random Binary Search Trees', '7.2 Treap'], 'scapegoat tree': ['8 Scapegoat Trees', '8.1 ScapegoatTree'], 'red-black tree': ['9 Red-Black Trees', '9.2 RedBlackTree'], 'b-tree': ['14 External Memory Searching', '14.2 B-Trees'] };
const ODSA = { 'skip list': 'skiplist', heap: 'binary heap', 'red black tree': 'red-black tree', btree: 'b-tree', 'b tree': 'b-tree', hashtable: 'hash table' };
T.define = a => {
  const t = a.term.replace(/s$/, ''), k = ODS[t] ? t : ODSA[t];
  if (k) return { read: ['find the definition of', { v: k }], html: `<div class="big" style="font-size:17px">Open Data Structures, ch. ${ODS[k][0]}</div><div class="sub">Defined in §${ODS[k][1]}.</div><div class="note">The app shows the defining passage here and opens the reader at that section. This mock carries only the locator.</div><div class="opts"><a class="btn" href="https://gentropic.github.io/gcu-library/read.html?book=ods" target="_blank" rel="noopener">Open in the library reader</a></div><div class="src">ods pack · CC BY 2.5 · Pat Morin · sample term index</div>`, trace: [`index.lookup("${k}") across installed packs`, 'hit: ods, glossary facet'], py: `library.define("${k}")` };
  if (MIN[t]) return T.mineral({ name: t });
  return null;
};
const LINT = [
  [/\bthe question as to whether\b/gi, 13, 'whether'], [/\bthere is no doubt but that\b/gi, 13, 'no doubt'], [/\bused for fuel purposes\b/gi, 13, 'used for fuel'],
  [/\bin a hasty manner\b/gi, 13, 'hastily'], [/\bthis is a subject which\b/gi, 13, 'this subject'], [/\bowing to the fact that\b/gi, 13, 'since'],
  [/\bin spite of the fact that\b/gi, 13, 'though'], [/\bcall your attention to the fact that\b/gi, 13, 'remind you'], [/\bthe fact that\b/gi, 13, 'recast without it'],
  [/\bnot honest\b/gi, 12, 'dishonest'], [/\bnot important\b/gi, 12, 'trifling'], [/\bdid not remember\b/gi, 12, 'forgot'], [/\bdid not pay any attention to\b/gi, 12, 'ignored'], [/\bdid not have much confidence in\b/gi, 12, 'distrusted'],
  [/\b(?:is|are|was|were|be|been|being) (?:\w{3,}ed|lost|taken|given|made|done|found|sent|written|shown)\b(?: by\b)?/gi, 11, 'name who did it']
];
const RULE = { 11: 'Use the active voice.', 12: 'Put statements in positive form.', 13: 'Omit needless words.' };
T.lint = a => {
  const hits = [];
  LINT.forEach(([re, rule, fix]) => { re.lastIndex = 0; let m; while ((m = re.exec(a.text))) if (!hits.some(h => m.index < h.e && m.index + m[0].length > h.s)) hits.push({ s: m.index, e: m.index + m[0].length, rule, fix }); });
  hits.sort((x, y) => x.s - y.s);
  let out = '', p = 0; hits.forEach(h => { out += esc(a.text.slice(p, h.s)) + '<mark>' + esc(a.text.slice(h.s, h.e)) + '</mark>'; p = h.e; }); out += esc(a.text.slice(p));
  return { read: ['check text against', { v: 'The Elements of Style (1918)' }],
    html: `<div class="sub" style="color:var(--au-fg)">${out}</div>${hits.length ? `<div class="tbl"><table><tr><th>Found</th><th>Rule</th><th>Try</th></tr>${hits.map(h => `<tr><td>${esc(a.text.slice(h.s, h.e))}</td><td>${h.rule}. ${RULE[h.rule]}</td><td>${h.fix}</td></tr>`).join('')}</table></div>` : '<div class="note ok">No rule in the pack matched this text.</div>'}<div class="src">elements-of-style pack · public domain · ${LINT.length} patterns compiled from rules 11 to 13</div>`,
    trace: [`style.rules("elements-of-style") → ${LINT.length} patterns`, `scan ${a.text.length} characters → ${hits.length} matches`], py: `style.check(text, pack="elements-of-style")` };
};

/* ── device hand-offs (simulated) ──────────────────────────── */
const hand = (label, intent, perm, msg) => `<dl class="kv"><dt>hand-off</dt><dd><code style="font:12px var(--mono)">${intent}</code></dd><dt>permission</dt><dd>${perm}</dd></dl><div class="opts"><button class="btn go" type="button" data-act="handoff" data-msg="${esc(msg)}">${label}</button>`;
T.event = a => {
  const d = new Date(a.date), s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), a.timed ? a.h : 0, a.timed ? a.mi : 0), e = new Date(+s + a.dur * 6e4);
  const hm = x => String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'), st = x => iso(x).replace(/-/g, '') + (a.timed ? 'T' + hm(x).replace(':', '') + '00' : '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GCU//golem mock//EN', 'BEGIN:VEVENT', `UID:${+s}@golem`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
    a.timed ? `DTSTART:${st(s)}` : `DTSTART;VALUE=DATE:${st(s)}`, ...(a.timed ? [`DTEND:${st(e)}`] : []), `SUMMARY:${a.title}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const read = ['new event', { v: a.title }, 'on', { v: fmtDate(s) }];
  if (a.timed) read.push('at', { v: hm(s) }, 'for', { v: a.dur + ' min', key: 'dur', alts: [30, 60, 120], cur: a.dur }); else read.push({ v: 'all day' });
  return { read, copy: ics,
    html: `<div class="big" style="font-size:18px">${esc(a.title)}</div><div class="sub">${fmtDate(s)}${a.timed ? `, ${hm(s)} to ${hm(e)}` : ', all day'}</div>${hand('Add to calendar', 'ACTION_INSERT → CalendarContract.Events', 'none: your calendar app shows the event for you to save', 'On Android this opens your calendar app with these fields filled in. Nothing is sent from the mock.')}<button class="btn" type="button" data-act="copy">Copy .ics</button></div>`,
    trace: [`dates.parse → ${fmtDate(s)}${a.timed ? ' ' + hm(s) : ''}`, 'title = what is left after removing date and time words', 'build intent extras: title, begin, end'], py: `device.calendar.insert(title="${a.title}", begin="${iso(s)}${a.timed ? 'T' + hm(s) : ''}", minutes=${a.dur})` };
};
T.timer = a => {
  if (!a.end) a.end = Date.now() + a.sec * 1000;
  return { read: ['start a timer for', { v: a.sec >= 60 ? fmt(a.sec / 60) + ' min' : a.sec + ' s' }],
    html: `<div class="big" data-end="${a.end}">--:--</div>${hand('Hand to the Clock app', 'AlarmClock.ACTION_SET_TIMER, EXTRA_LENGTH=' + a.sec, 'SET_ALARM, granted at install', 'On Android the Clock app takes over the timer and rings when golem is closed. Here it counts down in the page.')}</div>`,
    trace: [`duration → ${a.sec} s`, 'build intent: ACTION_SET_TIMER'], py: `device.timer(${a.sec})` };
};
T.alarm = a => {
  const t = String(a.h).padStart(2, '0') + ':' + String(a.mi).padStart(2, '0');
  return { read: ['set an alarm at', { v: t }], html: `<div class="big">${t}</div>${hand('Hand to the Clock app', `AlarmClock.ACTION_SET_ALARM, HOUR=${a.h}, MINUTES=${a.mi}`, 'SET_ALARM, granted at install', 'On Android this creates the alarm in the Clock app. Nothing happens in the mock.')}</div>`, trace: [`time → ${t}`, 'build intent: ACTION_SET_ALARM'], py: `device.alarm("${t}")` };
};

/* ── memory + teaching ─────────────────────────────────────── */
T.remember = a => { if (!a.done) { S.facts.push(a.text); a.done = true; } return { read: ['store note', { v: a.text }], html: `<div class="note ok">Stored on this device. ${S.facts.length} note${S.facts.length === 1 ? '' : 's'} in memory.</div>`, trace: ['notes.add(text)', 'index words for recall'], py: `notes.add("${a.text}")` }; };
T.recall = a => {
  const w = a.about.split(/\s+/).filter(Boolean), hit = S.facts.filter(f => w.every(x => f.toLowerCase().includes(x)));
  return { read: ['recall notes about', { v: a.about }], html: hit.length ? `<ul style="margin:0;padding-left:18px">${hit.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : `<div class="note">No stored note mentions “${esc(a.about)}”. I only know what you asked me to remember.</div>`, trace: [`notes.search("${a.about}") → ${hit.length}`], py: `notes.search("${a.about}")` };
};
T.teach = a => { S.aliases[a.word] = a.means; return { read: ['learn that', { v: a.word }, 'means', { v: a.means }], html: `<div class="note ok">Learned. From now on “${esc(a.word)}” reads as “${esc(a.means)}” on this device.</div>`, trace: ['lexicon.add(word → meaning)', 'retrain: instant, the lexicon is a table'] }; };

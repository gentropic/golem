/* ── session state ─────────────────────────────────────────── */
const S = { cards: [], n: 0, aliases: {}, facts: [], data: null, awake: true };

const SKILLS = [
  ['Compute', 'Unit conversion', '@gcu/units', 1, 'Grades, lengths, masses, areas, pressures, temperatures. Refuses mismatched dimensions.', ['0.35 oz per short ton in g/t', '2.7 g/cm3 in lb/ft3', '1500 psi in mpa', '5 km in kg']],
  ['Compute', 'Arithmetic', '@gcu/expr', 1, 'Parsed and evaluated, never eval. Trigonometry in degrees.', ['14 * cos(22) + 3^2', 'sqrt(2) * 84']],
  ['Compute', 'Dates', 'built in', 1, 'Day counts and weekdays.', ['days until 25 december', 'what day is 15 nov 2027']],
  ['Compute', 'Step-by-step algebra', 'new package', 0, 'Solve and show the derivation. The monorepo has no symbolic algebra yet.', []],
  ['Field', 'True thickness', '@gcu/bearing', 1, 'Intercept length, hole orientation and plane give thickness and a stereonet.', ['true thickness of a 14 m intercept, hole 270/60, bedding 045/30']],
  ['Field', 'Stereonet', '@gcu/bearing', 1, 'Planes and poles, equal area, lower hemisphere.', ['plot plane 120/55']],
  ['Field', 'Mineral key', 'minerals pack', 1, 'golem asks the questions and narrows the candidates.', ['identify a mineral', 'density of chalcopyrite']],
  ['Field', 'Compass capture', 'lead-acid sensors', 0, 'Measure a plane with the phone and add it to a set by voice or text.', []],
  ['Field', 'Munsell from camera', '@gcu/swatch', 0, 'Point at a rock, get the nearest chip.', []],
  ['Field', 'Kinematic check', 'daylight', 0, 'Planar, wedge and toppling tests against a slope face.', []],
  ['Table', 'Open and validate', 'sadpan · tare', 1, 'Typed columns, interval checks, flags for suspicious codes.', ['open assays.csv']],
  ['Table', 'Histogram', 'sadpan · @gcu/plot', 1, 'Amend it afterwards with “log scale”.', ['histogram of cu']],
  ['Table', 'Variogram', '@gcu/drillhole · gsjs', 1, 'A missing precondition becomes a question, then a step in the plan.', ['variogram of cu']],
  ['Table', 'Transform by example', 'new package', 0, 'Show two examples (BH-001A → 1) and it derives the rule for the column.', []],
  ['Table', 'Report paragraph', 'templates', 0, 'A method paragraph written from the plan parameters.', []],
  ['Knowledge', 'Records', 'factbook pack', 1, 'Lookups, unit changes and filters across records.', ['population density of mongolia in people per square mile', 'landlocked countries by population', 'area of brazil in square miles']],
  ['Knowledge', 'Definitions', 'ods pack', 1, 'Finds where a term is defined and opens the reader there.', ['what is a skiplist']],
  ['Knowledge', 'Style check', 'elements-of-style pack', 1, 'Rules compiled into a checker that cites the rule.', ['check: owing to the fact that the samples were lost by the lab, there is no doubt but that the assay was not important']],
  ['Knowledge', 'Your documents', 'librarian · glass', 0, 'Retrieval over files you add. Returns the passage and its location.', []],
  ['Device', 'Calendar event', 'lead-acid intent', 1, 'Fills the event and hands it to your calendar app.', ['remind me to send the samples to the lab on friday at 9', 'schedule core shed visit tomorrow at 14:30 for 2 hours']],
  ['Device', 'Timer and alarm', 'lead-acid intent', 1, 'Handed to the Clock app.', ['set a timer for 5 min', 'set an alarm for 6:15']],
  ['Device', 'Map, dial, share', 'lead-acid intent', 0, 'Show a place, start a call, share the last result.', []],
  ['Session', 'Explain', 'plan', 1, 'Shows the plan behind the last answer.', ['why']],
  ['Session', 'Amend, repeat, undo', 'dispatch-meta', 1, 'Change the last card without retyping it.', ['in feet', 'log scale', 'and chile', 'again', 'undo']],
  ['Session', 'Teach a word', 'lexicon', 1, 'Stays on the device.', ['vario means variogram']],
  ['Session', 'Notes', 'glass', 1, 'Remembers only what you ask it to.', ['remember that hole 12 collar was resurveyed in march', 'what do you know about hole 12']],
  ['Session', 'Sessions and history', 'plan store', 1, 'Sessions name themselves from the tools that ran. Search covers all of them.', ['new session', 'name this session friday lab run', 'history']],
  ['Session', 'Export the plan', 'adder', 1, 'The session as a script. Every line is a tool call it made.', ['export as script']]
];
const PACKS = [
  ['factbook', 'CIA World Factbook', '2.8 MB · CC0', 'samp', 'Records: lookup, convert, filter, rank.'],
  ['factbook-full', 'Factbook, full profiles', '2.3 MB · CC0', 'plan', 'Deeper filters, such as exports and resources.'],
  ['ods', 'Open Data Structures', '1.9 MB · CC BY 2.5', 'samp', 'Term index into the reader. Listings can run in adder.'],
  ['elements-of-style', 'The Elements of Style (1918)', '36 kB · public domain', 'live', 'Rules compiled into a text checker.'],
  ['rtow · rtnw · rtrol', 'Ray Tracing series', '11.5 MB · CC0', 'plan', 'Reader only until a term index is built.'],
  ['arcr', 'arcr / gewgaw manual', '26 kB · CC0', 'plan', 'Reader only.'],
  ['minerals', 'Mineral properties and key', 'proposed', 'samp', 'Properties plus an identification key. 12 minerals here.'],
  ['geonames', 'Gazetteer', 'proposed · check licence', 'plan', 'Places, coordinates, distances.'],
  ['wikidata-core', 'Wikidata subset', 'proposed · check licence', 'plan', 'Who, what, when and where as structured facts.'],
  ['usgs-mcs', 'USGS commodity summaries', 'proposed · check licence', 'plan', 'Production and reserves by country.'],
  ['wordnet', 'WordNet', 'proposed · check licence', 'plan', 'Synonyms for the parser, so fewer words need teaching.']
];
const ALLEX = SKILLS.flatMap(s => s[5]);
const VOCAB = new Set(ALLEX.filter(e => !/ means /.test(e)).join(' ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3));

/* ── reading a query ───────────────────────────────────────── */
const norm = s => s.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
function parseEvent(str) {
  const low = str.toLowerCase(), d = findDate(low), t = findTime(low), du = /\bfor (\d+(?:\.\d+)?) ?(h|hr|hrs|hours?|min|mins|minutes?)\b/.exec(low);
  if (!d && !t) return null;
  let title = str;
  [d && d.m, t && t.m, du].filter(Boolean).sort((a, b) => b.index - a.index).forEach(m => { title = title.slice(0, m.index) + title.slice(m.index + m[0].length); });
  title = title.replace(/\s+/g, ' ').trim().replace(/^to /i, '').replace(/\b(on|at|for)$/i, '').trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : 'Event', date: +(d ? d.d : day0(new Date())), timed: !!t, h: t ? t.h : 0, mi: t ? t.mi : 0, dur: du ? Math.round(du[1] * (du[2][0] === 'h' ? 60 : 1)) : 60 };
}
function grammar(text, q, rung) {
  let m, r;
  const go = (tool, args) => { const res = T[tool](args); return res ? { tool, args, rung, res } : null; };
  const col = w => w[0] === 'c' ? 'cu' : 'au';
  if ((m = /^(.+?) means (.+)$/.exec(q))) return go('teach', { word: m[1], means: m[2] });
  if (/^(export|save|give me)\b.*\b(script|notebook|python|adder)$/.test(q)) return go('export', {});
  if ((m = /^(?:set |start )?(?:a )?timer (?:for |of )?(\d+(?:\.\d+)?) ?(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hours?)$/.exec(q))) return go('timer', { sec: Math.round(m[1] * (m[2][0] === 's' ? 1 : m[2][0] === 'm' ? 60 : 3600)) });
  if ((m = /^(?:set )?(?:an )?alarm (?:for |at )?(.+)$/.exec(q) || /^wake me(?: up)? at (.+)$/.exec(q))) { const t = findTime('at ' + m[1]); if (t) return go('alarm', { h: t.h, mi: t.mi }); }
  if ((m = /^(?:remind me to|remind me|add (?:an )?event|new event|schedule)[:,]? (.+)$/.exec(q))) { const e = parseEvent(text.slice(text.length - m[1].length)); if (e) return go('event', e); }
  if (/^remember /.test(q)) return go('remember', { text: text.replace(/^remember (that )?/i, '') });
  if ((m = /^what do you (?:know|remember) about (.+)$/.exec(q))) return go('recall', { about: m[1] });
  if (/^open (.+\.csv|the sample|sample|assays)$/.test(q)) return go('open', {});
  if ((m = /^hist(?:ogram)? (?:of )?(cu|au|copper|gold)( (?:in )?log(?: scale)?)?$/.exec(q))) return go('hist', { col: col(m[1]), log: !!m[2] });
  if ((m = /^(?:downhole )?variogram (?:of )?(cu|au|copper|gold)(?: at (\d) ?m)?$/.exec(q))) return go('vario', { col: col(m[1]), comp: m[2] ? +m[2] : undefined });
  if (/true thickness/.test(q)) {
    const len = /(\d+(?:\.\d+)?) ?m\b/.exec(q), h = /hole (\d{1,3})\/(\d{1,2})/.exec(q), p = /(?:bedding|vein|foliation|plane|contact|fault) (\d{1,3})\/(\d{1,2})/.exec(q);
    if (len && h && p) return go('thickness', { len: +len[1], htr: +h[1], hpl: +h[2], a1: +p[1], a2: +p[2], conv: 'dd' });
  }
  if ((m = /^(?:plot|stereonet(?: of)?|show)(?: plane| bedding)? (\d{1,3})\/(\d{1,2})$/.exec(q))) return go('plane', { a1: +m[1], a2: +m[2], conv: 'dd' });
  if ((m = /^(?:what is |what's )?(?:the )?(capital|population density|density|population|area) of (.+?)(?: in (.+))?$/.exec(q)) && (r = go('fact', { field: m[1] === 'population density' ? 'density' : m[1], country: m[2], unit: m[3] }))) return r;
  if ((m = /^(?:what is |what's )?(?:the )?(density|hardness|formula|streak) of (\w+)$/.exec(q)) && (r = go('mineral', { prop: m[1], name: m[2] }))) return r;
  if ((m = /^(?:which |list |show )?landlocked countries(?: (?:by|sorted by) (area|population))?$/.exec(q))) return go('factList', { by: m[1] || 'area' });
  if (/^(?:identify|key out|id)(?: a| this| the)? (?:mineral|rock|sample)$|^what mineral is this$/.test(q)) return go('key', {});
  if ((m = /^(?:check|lint|review)(?: this| the)?(?: text| sentence| paragraph)?[:,]? (.+)$/i.exec(text))) return go('lint', { text: m[1] });
  if ((m = /^(?:how many )?days (?:until|till|to|before) (.+)$/.exec(q)) && (r = go('daysUntil', { s: m[1] }))) return r;
  if ((m = /^what (?:day|weekday) (?:is|was|will be) (.+)$/.exec(q)) && (r = go('weekday', { s: m[1] }))) return r;
  if ((m = /^(?:convert )?(-?[\d.,]*\d) ?(.+?) (?:in|to|as|into) (.+)$/.exec(q)) && (r = go('convert', { v: parseFloat(m[1].replace(/,/g, '')), from: m[2], to: m[3] }))) return r;
  if ((m = /^(?:what is |what's |calc(?:ulate)? |compute )?([-+*/^().,\d\sa-z×÷]+)$/.exec(q)) && /\d/.test(m[1]) && (r = go('calc', { x: m[1].trim() }))) return r;
  if ((m = /^(?:what is|what's|define|explain|describe)(?: an?| the)? (.+)$/.exec(q)) && (r = go('define', { term: m[1] }))) return r;
  return null;
}
function context(q, last) {
  if (!last) return null;
  let m, res; const am = last.res.amend;
  const go = args => { res = T[last.tool](args); return res ? { tool: last.tool, args, rung: 'context', amends: last.id, res } : null; };
  if (/^(why|how|how so|show (me )?(the )?(plan|trace|work|steps))$/.test(q)) return { tool: 'why', args: { ref: last.id }, rung: 'context', amends: last.id, res: T.why({ ref: last.id }) };
  if ((m = /^(?:and |now |same (?:but )?)?(?:in|to|as) (.+)$/.exec(q))) {
    if (am === 'unit') return go({ ...last.args, to: m[1] });
    if (am === 'fact' && /area|density/.test(last.args.field)) return go({ ...last.args, unit: m[1] });
  }
  if (am === 'hist' && (m = /^(?:in )?(log|linear)(?: scale)?$/.exec(q))) return go({ ...last.args, log: m[1] === 'log' });
  if (am === 'fact' && (m = /^(?:and|same for|what about|now|and for)(?: the)? (.+)$/.exec(q)) && fbFind(m[1])) return go({ ...last.args, country: m[1] });
  return null;
}
function taught(text, q) {
  let q2 = ' ' + q + ' ', t2 = ' ' + text + ' ';
  Object.entries(S.aliases).forEach(([k, v]) => { const re = new RegExp('(?<=\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)', 'gi'); q2 = q2.replace(re, v); t2 = t2.replace(re, v); });
  q2 = q2.trim(); if (q2 === q) return null;
  const r = grammar(t2.trim(), q2, 'taught');
  if (r) r.res.trace.unshift(`lexicon: "${q}" → "${q2}"`);
  return r;
}
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1])); return d[a.length][b.length]; }
T.none = a => {
  const qt = new Set(a.q.split(/[^a-z0-9]+/).filter(Boolean));
  const near = ALLEX.map(e => { const et = e.toLowerCase().split(/[^a-z0-9]+/); return { e, s: et.filter(t => qt.has(t)).length / Math.sqrt(et.length * (qt.size || 1)) }; }).filter(x => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3);
  let teach = null;
  for (const t of a.q.split(/[^a-z]+/)) {
    if (t.length < 3 || VOCAB.has(t) || S.aliases[t]) continue;
    const c = [...VOCAB].find(v => v.length > t.length && v.startsWith(t)) || [...VOCAB].find(v => Math.abs(v.length - t.length) <= 1 && lev(v, t) === 1);
    if (c) { teach = `${t} means ${c}`; break; }
  }
  const chip = x => `<button class="chip" type="button" data-act="run" data-q="${esc(x)}">${esc(x)}</button>`;
  return { read: [], html: `<div class="note err">No reading, so no answer. I do not guess.</div>${near.length ? `<div class="lbl">Nearest skills</div><div class="opts">${near.map(x => chip(x.e)).join('')}</div>` : '<div class="sub">Nothing close. The Skills tab lists what I can do.</div>'}${teach ? `<div class="lbl">Teach me the word</div><div class="opts">${chip(teach)}</div>` : ''}`,
    trace: ['context: no open question, no amendment fits', 'grammar: no rule matched', 'lexicon: no taught phrase applies', 'stop'] };
};
T.why = a => {
  const c = S.cards.find(x => x.id === a.ref);
  return { read: ['explain card', { v: '#' + String(c.id).padStart(2, '0') }], html: `<ol style="margin:0;padding-left:20px;font:12.5px/1.6 var(--mono)">${c.res.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ol><div class="sub">These are the steps that ran, with their inputs. I can show how an answer was computed. I cannot say why the data looks the way it does.</div>`, trace: ['plan.of(card) → steps'] };
};
T.export = () => {
  const body = S.cards.filter(c => c.res.py).map(c => `# ${c.raw}\n${c.res.py}`).join('\n\n');
  const src = `# golem session, exported ${iso(new Date())}\n# every line is a tool call the session made\nfrom gcu import *\n\n${body || '# nothing to export yet'}`;
  return { read: ['export session as', { v: 'adder script' }], copy: src, html: `<pre>${esc(src)}</pre><div class="opts"><button class="btn" type="button" data-act="copy">Copy script</button></div><div class="src">plan → adder · names are illustrative, the real packages decide the API</div>`, trace: ['collect the tool call behind each card', 'emit as adder source'] };
};

/* ── rendering ─────────────────────────────────────────────── */
const RUNG = { grammar: 'grammar', context: 'context', taught: 'taught', none: 'no reading' };
function cardEl(c) {
  const el = document.createElement('article');
  el.className = 'card'; el.dataset.id = c.id;
  const r = c.res, read = r.read.map(x => typeof x === 'string' ? esc(x) : x.alts ? `<button class="slot" type="button" data-act="slot" data-key="${x.key}" title="Tap to change this reading">${esc(x.v)}</button>` : `<span class="slot">${esc(x.v)}</span>`).join(' ');
  const ask = r.ask ? `<div class="note">${esc(r.ask.prompt)}</div><div class="opts">${r.ask.options.map((o, i) => `<button class="btn" type="button" data-act="answer" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>` : '';
  el.innerHTML = `<div class="chead"><span>#${String(c.id).padStart(2, '0')}</span><span class="rung ${c.rung}">${RUNG[c.rung]}</span>${c.amends ? `<span>from #${String(c.amends).padStart(2, '0')}</span>` : ''}<span class="ms">${c.ms < 10 ? c.ms.toFixed(1) : Math.round(c.ms)} ms</span></div>
    <div class="q">${esc(c.raw)}</div>${read ? `<div class="read"><span class="lbl">read as</span> ${read}</div>` : ''}
    <div class="ans">${r.html}${ask}</div>
    <details class="trace"><summary>plan · ${r.trace.length} step${r.trace.length === 1 ? '' : 's'}</summary><ol>${r.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>`;
  return el;
}
let statusT;
function status(msg) { $('status').textContent = msg; clearTimeout(statusT); statusT = setTimeout(() => { $('status').textContent = ''; }, 5000); }
function addCard(raw, r, ms, quiet) {
  const c = { id: ++S.n, raw, tool: r.tool, args: r.args, rung: r.rung, amends: r.amends, res: r.res, ms };
  S.cards.push(c);
  const el = cardEl(c); $('stream').appendChild(el);
  if (!quiet) { showTab('ask'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  tick(); renderPacks(); touch();
}
function rerun(c) {
  const t0 = performance.now(); c.res = T[c.tool](c.args); c.ms = performance.now() - t0;
  const old = $('stream').querySelector(`[data-id="${c.id}"]`), el = cardEl(c);
  old.replaceWith(el); tick(); renderPacks(); touch();
}
function submit(raw, quiet) {
  raw = raw.trim(); if (!raw) return;
  if (!S.awake) { status('Asleep. Tap wake at the top right.'); return; }
  const t0 = performance.now(), text = norm(raw), q = text.toLowerCase(), last = S.cards[S.cards.length - 1];
  let m;
  if (/^(start )?(a )?new session$/.test(q)) { newSession(); status('New session.'); return; }
  if (/^(sessions|history|menu)$/.test(q)) { openDrawer(); return; }
  if ((m = /^(?:(?:name|call|rename) this(?: session)?|rename(?: the)? session)(?: to| as)? (.+)$/.exec(q))) { cur.name = text.slice(-m[1].length); cur.auto = false; touch(); status(`Session named “${cur.name}”.`); return; }
  if (last && last.res.ask) {
    const os = last.res.ask.options, o = os.find(x => x.label.toLowerCase() === q || String(x.value) === q) || os.find(x => x.label.toLowerCase().startsWith(q) || q.includes(x.label.toLowerCase())) || (os.length === 1 && /^(yes|ok|okay|sure|do it|go)$/.test(q) ? os[0] : null);
    if (o) { last.res.ask.set(last.args, o.value); rerun(last); status(`Answered #${String(last.id).padStart(2, '0')}: ${o.label}`); return; }
  }
  if (/^undo( that)?$/.test(q)) {
    const c = S.cards.pop(); if (!c) { status('Nothing to undo.'); return; }
    $('stream').querySelector(`[data-id="${c.id}"]`).remove(); touch(); status(`Removed #${String(c.id).padStart(2, '0')}: ${c.raw}`); return;
  }
  if (/^(again|repeat|rerun|do it again)$/.test(q)) { if (last) submit(last.raw); else status('Nothing to repeat.'); return; }
  const r = context(q, last) || grammar(text, q, 'grammar') || taught(text, q) || { tool: 'none', args: { q }, rung: 'none', res: T.none({ q }) };
  addCard(raw, r, performance.now() - t0, quiet);
}
function tick() {
  document.querySelectorAll('[data-end]').forEach(el => {
    const s = Math.ceil((+el.dataset.end - Date.now()) / 1000);
    el.textContent = s <= 0 ? 'done' : String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  });
}
setInterval(tick, 500);

/* ── tabs, catalog, packs ──────────────────────────────────── */
function showTab(t) {
  ['ask', 'skills', 'packs'].forEach(k => { $('v-' + k).hidden = k !== t; });
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
}
function renderSkills() {
  const live = SKILLS.filter(s => s[3]).length; let h = `<div class="sub">${live} skills run in this mock. ${SKILLS.length - live} more are planned from packages that already exist or are named here. Tap an example to run it.</div>`, g = '';
  SKILLS.forEach(([grp, name, from, on, d, ex]) => {
    if (grp !== g) { h += `<div class="lbl">${grp}</div>`; g = grp; }
    h += `<div class="item"><h3>${name} <span class="tag ${on ? 'live' : 'plan'}">${on ? 'in mock' : 'planned'}</span></h3><p>${d}</p><div class="from">${from}</div>${ex.length ? `<div class="opts">${ex.map(x => `<button class="chip" type="button" data-q="${esc(x)}" style="white-space:normal;text-align:left">${esc(x)}</button>`).join('')}</div>` : ''}</div>`;
  });
  $('v-skills').innerHTML = h;
}
function renderPacks() {
  const lab = { live: 'in mock', samp: 'sample in mock', plan: 'not wired' };
  let h = '<div class="sub">golem knows what its installed packs hold. These are the gcu-library entries plus packs worth adding.</div><div class="lbl">Library</div>';
  PACKS.forEach(([id, name, meta, st, d]) => { h += `<div class="item"><h3>${name} <span class="tag ${st}">${lab[st]}</span></h3><p>${d}</p><div class="from">${id} · ${meta}</div></div>`; });
  const al = Object.entries(S.aliases);
  h += `<div class="lbl">On this device</div><div class="item"><h3>Taught words</h3><p>${al.length ? al.map(([k, v]) => `${esc(k)} → ${esc(v)}`).join('<br>') : 'None yet. Try “vario means variogram”.'}</p></div><div class="item"><h3>Notes</h3><p>${S.facts.length ? S.facts.map(esc).join('<br>') : 'None yet. Try “remember that …”.'}</p></div><div class="item"><h3>Open table</h3><p>${S.data ? `assays.csv · ${S.data.length} rows` : 'None.'}</p></div>`;
  $('v-packs').innerHTML = h;
}

/* ── wiring ────────────────────────────────────────────────── */
$('f').addEventListener('submit', e => { e.preventDefault(); const v = $('q').value; $('q').value = ''; submit(v); });
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
$('v-skills').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) submit(b.dataset.q); });
$('sugg').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) submit(b.dataset.q); });
$('stream').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const c = S.cards.find(x => x.id === +b.closest('.card').dataset.id), act = b.dataset.act;
  if (act === 'run') return submit(b.dataset.q);
  if (!S.awake) return status('Asleep. Tap wake at the top right.');
  if (act === 'slot') { const s = c.res.read.find(x => x.key === b.dataset.key); c.args[s.key] = s.alts[(s.alts.indexOf(s.cur) + 1) % s.alts.length]; rerun(c); }
  else if (act === 'answer') { const o = c.res.ask.options[+b.dataset.i]; c.res.ask.set(c.args, o.value); rerun(c); }
  else if (act === 'handoff') { const n = document.createElement('div'); n.className = 'note ok'; n.textContent = b.dataset.msg; b.replaceWith(n); }
  else if (act === 'copy') {
    const fail = () => { const p = document.createElement('pre'); p.textContent = c.res.copy; b.closest('.ans').appendChild(p); status('Copy was blocked here. The text is shown so you can select it.'); };
    try { navigator.clipboard.writeText(c.res.copy).then(() => status('Copied.'), fail); } catch (err) { fail(); }
  }
});
$('power').addEventListener('click', () => {
  S.awake = !S.awake; $('phone').classList.toggle('asleep', !S.awake); $('st-on').textContent = S.awake ? 'awake' : 'asleep'; $('q').disabled = !S.awake;
  $('power').textContent = S.awake ? 'sleep' : 'wake'; $('power').setAttribute('aria-pressed', String(!S.awake));
  status(S.awake ? 'Awake.' : 'Asleep. Nothing runs until you wake it.');
});
$('sugg').innerHTML = ['vario means variogram', 'variogram of cu', 'histogram of cu', 'log scale', 'identify a mineral', 'population density of mongolia in people per square mile', 'and chile', 'set a timer for 5 min', 'what is a skiplist', 'why', 'export as script', 'undo']
  .map(x => `<button class="chip" type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('');

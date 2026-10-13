// The log: a device table of things done, written from cards and asked about in plain words.
// Rows belong to the device, like notes; a card writes its row once (by id), undo removes it, and
// "open the log" makes it the open table so every table question works on it.
import { S, tool, frame, noun, fmt, iso } from './core.js';
import { parseUnit, dimName } from './units.js';
import { findDate, today, fmtDate, dateWords } from './dates.js';

export const LOG_COLS = [{ name: 'date', type: 'category' }, { name: 'activity', type: 'category' }, { name: 'value', type: 'numeric' }, { name: 'unit', type: 'category' }, { name: 'note', type: 'category' }];
export const logTable = () => S.tables.log || (S.tables.log = { name: 'log', cols: LOG_COLS, rows: [] });
const rows = () => (S.tables.log ? S.tables.log.rows : []);
const UNITRE = /^(\d+(?:\.\d+)?)\s*([a-zµ%°][\w%°/³²]*)?$/;
const unitOf = w => { if (!w) return null; const u = parseUnit(w); return u && !u.amb ? { ...u, word: w } : null; };
const stem = w => w.toLowerCase().replace(/(?:ning|ing|ned|ed|es|s)$/, '');
const same = (a, b) => stem(a) === stem(b);
const toUnit = (v, from, to) => (v * from.f) / to.f;   // same dimension, no temperature here
const weekStart = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const inPeriod = (d, p) => {
  const t = today(), dt = new Date(d + 'T00:00');
  if (!p || p.kind === 'all') return true;
  if (p.kind === 'today') return iso(dt) === iso(t);
  if (p.kind === 'yesterday') return iso(dt) === iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1));
  if (p.kind === 'since') return dt >= new Date(p.from + 'T00:00');
  const shift = p.which === 'last' ? -1 : 0;
  if (p.unit === 'week') { const s = weekStart(t); s.setDate(s.getDate() + 7 * shift); const e = new Date(s); e.setDate(e.getDate() + 7); return dt >= s && dt < e; }
  if (p.unit === 'month') { const s = new Date(t.getFullYear(), t.getMonth() + shift, 1), e = new Date(t.getFullYear(), t.getMonth() + shift + 1, 1); return dt >= s && dt < e; }
  return dt.getFullYear() === t.getFullYear() + shift;
};
const periodText = p => !p || p.kind === 'all' ? 'all time' : p.kind === 'since' ? `since ${fmtDate(new Date(p.from + 'T00:00'))}` : p.kind === 'today' || p.kind === 'yesterday' ? p.kind : `${p.which} ${p.unit}`;
const SRC = { t: 'src', text: 'the log · a table on this device · nothing leaves it' };

/* ── writing ────────────────────────────────────────────────── */
const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
export function readLog(text) {
  let s = text.trim().replace(/^log(?:ged)?\s+/i, ''); if (s === text.trim()) return null;
  let note = null; const nm = /\s+(?:note|notes|--|—)\s*[:]?\s*(.+)$/.exec(s); if (nm) { note = nm[1]; s = s.slice(0, nm.index); }
  let date = iso(today()); const dm = findDate(s.toLowerCase(), { back: true }); if (dm && dm.m[0] && /\b(?:on |yesterday|today|last |ago|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)? (?:of )?[a-z]{3,9}|[a-z]{3,9} \d{1,2})/.test(dm.m[0])) { date = iso(dm.d); s = (s.slice(0, dm.m.index) + ' ' + s.slice(dm.m.index + dm.m[0].length)).replace(/\s+on\s*$/, ' '); }
  const words = s.trim().split(/\s+/).filter(w => !/^(?:of|a|an|the|on|for|at|my|some)$/i.test(w));
  let value = null, unit = null;
  for (let i = 0; i < words.length; i++) {
    const m = UNITRE.exec(words[i]); if (!m) continue;
    const u = unitOf(m[2]) || (!m[2] && i + 1 < words.length ? unitOf(words[i + 1]) : null);
    if (!m[2] && !u) { value = +m[1]; words.splice(i, 1); break; }
    if (!u) continue;
    value = +m[1]; unit = u.word; words.splice(i, m[2] ? 1 : 2); break;
  }
  const activity = words.join(' ').toLowerCase().trim();
  if (!activity) return null;
  return { id: newId(), activity, value, unit, date, note };
}
tool({
  name: 'logAdd',
  skill: { group: 'Device', title: 'Log', on: 'device table', about: 'Log what you did with a quantity and a date, ask totals and means by week or month, and open the log as a table. Rows stay on this device.', examples: ['log 30 min run', 'log 5 km run yesterday', 'log weight 78.4 kg', 'how many km did i run this month', 'mean weight by week', 'open the log'] },
  amend: [{ arg: 'value', match: /^(?:that was|make it|correct(?:ion)?:?|actually) (\d+(?:\.\d+)?)(?: ?([a-zµ%°][\w%°/³²]*))?$/, value: (m, a) => { if (m[2]) a.unit = m[2]; return +m[1]; } }, { arg: 'date', match: /^(?:that was |it was )?(?:on )?(yesterday|today|\d{4}-\d{2}-\d{2}|\d{1,2} \w{3,9}(?: \d{4})?|last \w+)$/, value: m => { const d = findDate(m[1], { back: true }); return d ? iso(d.d) : null; } }],
  topic: a => [`Log: ${a.activity}`, 1],
  undo: a => { const t = logTable(); t.rows = t.rows.filter(r => r.id !== a.id); },
  run: a => {
    const t = logTable(), row = { id: a.id, date: a.date, activity: a.activity, value: a.value, unit: a.unit, note: a.note || null }, at = t.rows.findIndex(r => r.id === a.id);
    if (at >= 0) t.rows[at] = row; else t.rows.push(row);
    t.rows.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
    const isNew = !t.rows.some(r => r.id !== a.id && same(r.activity, a.activity));
    const u = unitOf(a.unit), week = t.rows.filter(r => same(r.activity, a.activity) && inPeriod(r.date, { kind: 'period', which: 'this', unit: 'week' }));
    const comparable = u ? week.filter(r => { const ru = unitOf(r.unit); return ru && ru.dim === u.dim; }) : [];
    const total = comparable.reduce((s, r) => s + toUnit(r.value, unitOf(r.unit), u), 0);
    const read = ['log', ...(a.value != null ? [{ v: `${fmt(a.value)}${a.unit ? ' ' + a.unit : ''}` }] : []), { v: a.activity }, 'on', { v: fmtDate(new Date(a.date + 'T00:00')) }];
    const rowsKv = [['written', `${a.date} · ${a.activity}${a.value != null ? ` · ${fmt(a.value)}${a.unit ? ' ' + a.unit : ''}` : ''}${a.note ? ` · ${a.note}` : ''}`]];
    if (u) rowsKv.push([`${a.activity} this week`, `${fmt(total, 4)} ${a.unit} over ${comparable.length} entr${comparable.length === 1 ? 'y' : 'ies'}${week.length > comparable.length ? ` (${week.length - comparable.length} in another dimension left out)` : ''}`]);
    else rowsKv.push([`${a.activity} this week`, `${week.length} entr${week.length === 1 ? 'y' : 'ies'}`]);
    return { read, value: a.value, body: [{ t: 'note', kind: 'ok', text: `Logged.${isNew ? ` New activity: ${a.activity}.` : ''} ${t.rows.length} row${t.rows.length === 1 ? '' : 's'} in the log.` }, { t: 'kv', rows: rowsKv }, SRC], trace: [`log.add(${JSON.stringify(row)})`, 'undo removes the row; "that was 6 km" corrects it'], py: `log.add(activity="${a.activity}", value=${a.value}, unit=${a.unit ? '"' + a.unit + '"' : 'None'}, date="${a.date}")` };
  }
});

/* ── asking ─────────────────────────────────────────────────── */
const AGG = { 'how many': 'sum', 'how much': 'sum', total: 'sum', sum: 'sum', mean: 'mean', average: 'mean', count: 'count', 'how often': 'count', 'how many times': 'count' };
function readPeriod(s) {
  let m;
  if ((m = /\b(this|last) (week|month|year)\b/.exec(s))) return { p: { kind: 'period', which: m[1], unit: m[2] }, rest: s.replace(m[0], ' ') };
  if ((m = /\bsince (.+)$/.exec(s))) { const d = findDate(m[1], { back: true }); return d ? { p: { kind: 'since', from: iso(d.d) }, rest: s.slice(0, m.index) } : null; }
  if ((m = /\b(today|yesterday)\b/.exec(s))) return { p: { kind: m[1] }, rest: s.replace(m[0], ' ') };
  if ((m = /\b(?:in|over) all time\b|\bever\b/.exec(s))) return { p: { kind: 'all' }, rest: s.replace(m[0], ' ') };
  return { p: { kind: 'all' }, rest: s };
}
tool({
  name: 'logQuery',
  amend: [{ arg: 'by', match: /^by (week|month|day|activity)$/ }, { arg: 'period', match: /^(this|last) (week|month|year)$/, value: m => ({ kind: 'period', which: m[1], unit: m[2] }) }],
  topic: a => [`Log: ${a.activity}`, 1],
  run: a => {
    const all = rows().filter(r => same(r.activity, a.activity) && inPeriod(r.date, a.period));
    const read = [{ v: a.agg }, 'of', { v: a.activity }, a.unit ? { v: 'in ' + a.unit } : '', { v: periodText(a.period), key: 'period', alts: [{ kind: 'period', which: 'this', unit: 'week' }, { kind: 'period', which: 'this', unit: 'month' }, { kind: 'period', which: 'last', unit: 'month' }, { kind: 'period', which: 'this', unit: 'year' }, { kind: 'all' }], cur: a.period }].filter(Boolean);
    if (!all.length) return { read, body: [{ t: 'note', text: `Nothing logged as ${a.activity} ${periodText(a.period)}.` }, SRC], trace: ['log.filter → 0 rows'] };
    let u = a.unit ? unitOf(a.unit) : null;
    if (!u && a.agg !== 'count') { const first = all.find(r => r.unit && unitOf(r.unit)); u = first ? unitOf(first.unit) : null; }
    const usable = a.agg === 'count' ? all : all.filter(r => r.value != null && (u ? (unitOf(r.unit) && unitOf(r.unit).dim === u.dim) : r.unit == null));
    const val = r => u ? toUnit(r.value, unitOf(r.unit), u) : r.value, agg = xs => a.agg === 'count' ? xs.length : a.agg === 'sum' ? xs.reduce((s, r) => s + val(r), 0) : xs.reduce((s, r) => s + val(r), 0) / xs.length;
    const unitText = a.agg === 'count' ? (all.length === 1 ? 'entry' : 'entries') : (u ? u.name : '');
    const left = all.length - usable.length;
    if (a.by) {
      const key = r => a.by === 'activity' ? r.activity : a.by === 'day' ? r.date : a.by === 'week' ? iso(weekStart(new Date(r.date + 'T00:00'))) : r.date.slice(0, 7);
      const groups = new Map(); usable.forEach(r => { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
      const out = [...groups.entries()].sort((x, y) => x[0] < y[0] ? -1 : 1).map(([k, g]) => [a.by === 'week' ? `week of ${fmtDate(new Date(k + 'T00:00'))}` : k, fmt(agg(g), 4), String(g.length)]);
      return { read: [...read, 'by', { v: a.by }], body: [{ t: 'table', head: [a.by, `${a.agg}${unitText ? ' (' + unitText + ')' : ''}`, 'entries'], num: [false, true, true], rows: out }, { t: 'hbars', rows: out.map(r => [r[0], +r[1].replace(/,/g, ''), r[1]]) }, ...(left ? [{ t: 'note', text: `${left} entr${left === 1 ? 'y' : 'ies'} left out: no value, or a unit of another dimension.` }] : []), SRC], trace: [`log.filter(${a.activity}, ${periodText(a.period)}) → ${all.length} rows`, `group by ${a.by} → ${out.length} groups`, `${a.agg}${u ? ' in ' + u.name : ''}`], py: `log.query(activity="${a.activity}", period=${JSON.stringify(a.period)}, agg="${a.agg}", by="${a.by}")` };
    }
    const v = agg(usable);
    return { read, value: v, body: [{ t: 'big', v: fmt(v, 4), unit: `${unitText} ${a.agg === 'count' ? '' : a.agg === 'sum' ? 'in total' : 'on average'}`.trim() }, { t: 'kv', rows: [['entries', `${usable.length} of ${all.length} ${periodText(a.period)}${left ? `; ${left} left out (no value, or another dimension)` : ''}`], ['dates', usable.length ? `${fmtDate(new Date(usable[0].date + 'T00:00'))} to ${fmtDate(new Date(usable[usable.length - 1].date + 'T00:00'))}` : '—'], ...(u ? [['unit', `${u.name} (${dimName(u.dim)}); entries in other ${dimName(u.dim)} units were converted`]] : [])] }, SRC], trace: [`log.filter(${a.activity}, ${periodText(a.period)}) → ${all.length} rows`, `${a.agg}${u ? ' in ' + u.name : ''} over ${usable.length} → ${fmt(v, 6)}`], py: `log.query(activity="${a.activity}", period=${JSON.stringify(a.period)}, agg="${a.agg}"${u ? `, unit="${u.name}"` : ''})` };
  }
});
/* ── what reads them ─────────────────────────────────────────── */
// writing: "log 5 km run yesterday", "log weight 78.4 kg on 29 sep", "log 2000 m run on 6 oct note: easy pace". The words
// after "log" are the entry as typed; readLog splits them into amount, activity, date and note.
frame({
  name: 'logAdd', label: 'Log', words: ['log', 'logged', 'record', 'track', 'log a', 'log my'], theme: ['text'], required: ['theme'], roles: { on: { preps: ['on'], types: ['date', 'holiday'] } },
  words_pt: ['registra', 'registre', 'anota no log'], label_pt: 'Registrar',
  bind: c => {
    const on = c.roles.on && c.roles.on[0], entry = readLog('log ' + c.theme[0].value + (on ? ' on ' + dateWords(on) : '')); return entry ? { tool: 'logAdd', args: entry } : null;
  }
});
// asking: "how many km did i run this month", "how often did i run this month", "total run in miles this month",
// "mean weight by week", "mean weight since 1 oct". The activities are what the log holds, matched as written.
noun(() => { const acts = [...new Set(rows().map(r => r.activity))]; return acts.length ? { type: 'activity', exact: true, words: Object.fromEntries(acts.map(a => [a, [a]])), words_pt: Object.fromEntries(acts.map(a => [a, [a]])) } : null; });
noun({ type: 'period', words: { 'this week': ['this week'], 'last week': ['last week'], 'this month': ['this month'], 'last month': ['last month'], 'this year': ['this year'], 'last year': ['last year'], today: ['today'], yesterday: ['yesterday'], all: ['ever', 'all time', 'in all time', 'over all time'] },
  words_pt: { 'this week': ['esta semana', 'essa semana'], 'last week': ['semana passada'], 'this month': ['este mês', 'esse mês'], 'last month': ['mês passado'], 'this year': ['este ano'], 'last year': ['ano passado'], today: ['hoje'], yesterday: ['ontem'] } });
noun({ type: 'logby', words: { week: ['week', 'weeks'], month: ['month', 'months'], day: ['day', 'days'], activity: ['activity'] }, words_pt: { week: ['semana'], month: ['mês'], day: ['dia'], activity: ['atividade'] } });
const PERIOD = v => v === 'all' ? { kind: 'all' } : v === 'today' || v === 'yesterday' ? { kind: v } : { kind: 'period', which: v.split(' ')[0], unit: v.split(' ')[1] };
for (const [name, words, agg] of [['logSum', ['how many', 'how much', 'total', 'sum of', 'sum'], 'sum'], ['logCount', ['how often', 'how many times'], 'count'], ['logMean', ['mean', 'average'], 'mean']]) frame({
  name, label: 'Log question', words, theme: ['unit'], required: [],
  roles: { what: { preps: ['', 'of'], types: ['activity'] }, in: { preps: ['in'], types: ['unit'] }, when: { preps: [''], types: ['period'] }, since: { preps: ['since', 'from'], types: ['date', 'holiday'] }, by: { preps: ['by', 'per'], types: ['logby'] } },
  label_pt: 'Pergunta ao log',
  bind: c => {
    const act = (c.roles.what || [])[0], u = [...c.theme, ...(c.roles.in || [])].find(n => n.type === 'unit');
    if (!act) return null;
    const since = c.roles.since && findDate(dateWords(c.roles.since[0]), { back: true }), when = c.roles.when && c.roles.when[0];
    const period = since ? { kind: 'since', from: iso(since.d) } : when ? PERIOD(when.value) : { kind: 'all' };
    const a = agg === 'sum' && !u ? 'count' : agg;
    return { tool: 'logQuery', args: { agg: a, activity: act.value, unit: u ? u.unit : null, period, by: c.roles.by ? c.roles.by[0].value : null } };
  }
});

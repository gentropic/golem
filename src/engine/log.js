// The log: a device table of things done, written from cards and asked about in plain words.
// Rows belong to the device, like notes; a card writes its row once (by id), undo removes it, and
// "open the log" makes it the open table so every table question works on it.
import { S, tool, fmt, iso } from './core.js';
import { parseUnit, dimName } from './units.js';
import { findDate, today, fmtDate } from './dates.js';

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
  name: 'logAdd', rank: 35,
  skill: { group: 'Device', title: 'Log', on: 'device table', about: 'Log what you did with a quantity and a date, ask totals and means by week or month, and open the log as a table. Rows stay on this device.', examples: ['log 30 min run', 'log 5 km run yesterday', 'log weight 78.4 kg', 'how many km did i run this month', 'mean weight by week', 'open the log'] },
  read: text => readLog(text),
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
  name: 'logQuery', rank: 34,
  read: (text, q) => {
    const m = /^(how many times|how many|how much|how often|total|sum of|sum|mean|average|count)\s+(.+)$/.exec(q); if (!m) return null;
    let by = null, rest = m[2]; const bm = /\s+by (week|month|day|activity)$/.exec(rest); if (bm) { by = bm[1]; rest = rest.slice(0, bm.index); }
    const per = readPeriod(rest); if (!per) return null;
    const words = per.rest.split(/\s+/).filter(w => w && !/^(?:did|have|i|do|we|of|the|my|in|on|total|times)$/.test(w));
    let unit = null; const ui = words.findIndex(w => unitOf(w)); if (ui >= 0 && m[1] !== 'count' && !/^how often|how many times/.test(m[1])) { unit = words[ui]; words.splice(ui, 1); }
    const activity = words.join(' ').trim(); if (!activity) return null;
    const acts = new Set(rows().map(r => stem(r.activity)));
    if (!acts.has(stem(activity))) return null;   // not a logged activity: let other readers try
    return { agg: unit || m[1] === 'count' || /often|times/.test(m[1]) ? (unit ? AGG[m[1]] : 'count') : AGG[m[1]], activity, unit, period: per.p, by };
  },
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

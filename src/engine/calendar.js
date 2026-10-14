// Working days and rosters over @gcu/plan's calendar engine (vendored), and time zones through Intl.
// The calendar is a slot and is always shown: Brazil's federal holidays, or weekdays only.
import { S, tool, frame, amend, noun, shape, postmod, unit, clock, iso } from './core.js';
import { findDate, findTime, today, day0, fmtDate, dateWords } from './dates.js';
import { isWorkingDay, addWorkingDays, brazilCalendar, federalHolidays } from '../vendor/plan-calendar.js';

const CALS = ['brazil', 'weekdays'], CAL_LABEL = { brazil: 'Brazil, federal holidays', weekdays: 'weekdays only' };
const calendarOf = (kind, y0, y1) => kind === 'weekdays' ? { weekends: [0, 6], holidays: [] } : { weekends: [0, 6], ...brazilCalendar(y0, y1) };
const PLAN_SRC = { t: 'src', text: '@gcu/plan · vendored · working-day calendar and Brazil\'s federal holidays' };
const calSlot = a => ({ v: CAL_LABEL[a.cal || 'brazil'], key: 'cal', alts: CALS, cur: a.cal || 'brazil' });
const holidaysBetween = (cal, a, b) => cal.holidays.filter(h => { const d = new Date(h.date + 'T00:00'); return d >= a && d <= b && ![0, 6].includes(d.getDay()); });
const hName = h => `${h.label} (${fmtDate(new Date(h.date + 'T00:00'))})`;
const DATE = '(.+?)';

/* ── working days ───────────────────────────────────────────── */
tool({
  name: 'workdays',
  skill: { group: 'Compute', title: 'Working days and rosters', on: '@gcu/plan', about: 'Working days until a date or between two, N working days from a date, whether a day is a working day, and on/off rosters. The calendar is a slot: Brazil\'s federal holidays or weekdays only.', examples: ['working days until 20 dec', 'is 21 apr 2027 a working day', '15 working days from monday', '14 on 14 off from 6 oct, am i off at christmas'] },
  topic: () => ['Working days', 1],
  run: a => {
    const dateOf = s => s === 'today' ? today() : (findDate(s) || {}).d;
    const refuse = (s) => ({ read: ['working days', { v: s }], body: [{ t: 'note', kind: 'err', text: `I cannot read "${s}" as a date. Try "20 dec", "2027-04-21" or "next monday".` }], trace: ['date: no reading'] });
    const span = (...ds) => { const ys = ds.map(d => d.getFullYear()); return calendarOf(a.cal || 'brazil', Math.min(...ys) - 1, Math.max(...ys) + 1); };
    if (a.ask === 'is') {
      const d = dateOf(a.date); if (!d) return refuse(a.date);
      const cal = span(d), ok = isWorkingDay(d, cal), hol = cal.holidays.find(h => h.date === iso(d)), why = ok ? 'a weekday and not a holiday' : hol ? `${hol.label}` : 'a weekend';
      return { read: ['is', { v: fmtDate(d) }, 'a working day in', calSlot(a)], value: ok, body: [{ t: 'big', v: ok ? 'Yes' : 'No', unit: why }, PLAN_SRC], trace: [`plan.isWorkingDay("${iso(d)}", ${a.cal || 'brazil'}) → ${ok}`, hol ? `holiday: ${hol.label}` : `weekday ${d.getDay()}`], py: `plan.isWorkingDay("${iso(d)}", cal)` };
    }
    if (a.ask === 'add') {
      const from = dateOf(a.from); if (!from) return refuse(a.from);
      const cal = span(from, new Date(from.getFullYear(), from.getMonth(), from.getDate() + Math.abs(a.n) * 2 * Math.sign(a.n || 1))), d = addWorkingDays(from, a.n, cal);
      const lo = a.n >= 0 ? from : d, hi = a.n >= 0 ? d : from, hols = holidaysBetween(cal, lo, hi), cal0 = Math.round((d - from) / 864e5);
      return { read: [{ v: `${Math.abs(a.n)} working day${Math.abs(a.n) === 1 ? '' : 's'}` }, a.n >= 0 ? 'from' : 'before', { v: fmtDate(from) }, 'in', calSlot(a)], value: iso(d), body: [{ t: 'big', v: fmtDate(d), unit: '' }, { t: 'kv', rows: [['calendar days', String(Math.abs(cal0))], ['holidays skipped', hols.length ? hols.map(hName).join('; ') : 'none in the span'], ['weekends', 'Saturday and Sunday']] }, PLAN_SRC], trace: [`plan.addWorkingDays("${iso(from)}", ${a.n}, ${a.cal || 'brazil'}) → ${iso(d)}`], py: `plan.addWorkingDays("${iso(from)}", ${a.n}, cal)` };
    }
    const to = dateOf(a.to); if (!to) return refuse(a.to);
    let from = a.ask === 'until' ? today() : dateOf(a.from); if (!from) return refuse(a.from);
    if (from > to && a.ask === 'between') { const b = (findDate(a.from, { back: true }) || {}).d; if (b && b <= to) from = b; }
    if (to < from) return { read: ['working days from', { v: fmtDate(from) }, 'to', { v: fmtDate(to) }], body: [{ t: 'note', kind: 'err', text: `${fmtDate(to)} is before ${fmtDate(from)}.` }], trace: ['end before start'] };
    const cal = span(from, to); let n = 0; for (const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1); d <= to; d.setDate(d.getDate() + 1)) if (isWorkingDay(d, cal)) n++;
    const hols = holidaysBetween(cal, new Date(from.getTime() + 864e5), to), total = Math.round((to - from) / 864e5);
    return { read: ['working days from', { v: a.ask === 'until' ? 'today' : fmtDate(from) }, 'to', { v: fmtDate(to) }, 'in', calSlot(a)], value: n, body: [{ t: 'big', v: String(n), unit: `working day${n === 1 ? '' : 's'}` }, { t: 'kv', rows: [['calendar days', `${total}, counting ${fmtDate(to)} and not ${fmtDate(from)}`], ['holidays in the span', hols.length ? hols.map(hName).join('; ') : 'none on a weekday'], ['weekends', 'Saturday and Sunday']] }, PLAN_SRC], trace: [`days after ${iso(from)} up to ${iso(to)}`, `plan.isWorkingDay over ${total} days → ${n}`, `calendar: ${CAL_LABEL[a.cal || 'brazil']}`], py: `plan.workingDays("${iso(from)}", "${iso(to)}", cal)` };
  }
});

/* ── rosters: X on, Y off, from a start date ────────────────── */
const lastRoster = () => { for (let i = S.cards.length - 1; i >= 0; i--) if (S.cards[i].tool === 'roster' && S.cards[i].args.on) return S.cards[i].args; return null; };
tool({
  name: 'roster',
  topic: () => ['Roster', 1],
  run: a => {
    if (a.noRoster) return { read: ['roster'], body: [{ t: 'note', kind: 'err', text: 'No roster in this session. Say it first: "14 on 14 off from 6 oct".' }], trace: ['no roster card to read from'] };
    const start = a.start === 'today' ? today() : (findDate(a.start, { back: true }) || {}).d, date = a.date == null ? null : a.date === 'today' ? today() : (findDate(a.date) || {}).d;
    if (!start || (a.date != null && !date)) return { read: ['roster'], body: [{ t: 'note', kind: 'err', text: `I cannot read "${!start ? a.start : a.date}" as a date.` }], trace: ['date: no reading'] };
    const cycle = a.on + a.off, at = d => { const k = Math.round((day0(d) - start) / 864e5), i = ((k % cycle) + cycle) % cycle; return { k, i, on: i < a.on, swing: Math.floor(k / cycle) }; };
    const read = [{ v: `${a.on} on ${a.off} off` }, 'from', { v: fmtDate(start) }];
    const rows = [], asked = date || today(), s = at(asked), swingStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + s.swing * cycle), onEnd = new Date(swingStart.getFullYear(), swingStart.getMonth(), swingStart.getDate() + a.on - 1), offEnd = new Date(swingStart.getFullYear(), swingStart.getMonth(), swingStart.getDate() + cycle - 1), next = new Date(swingStart.getFullYear(), swingStart.getMonth(), swingStart.getDate() + (s.on ? a.on : cycle));
    rows.push(['this swing', `on ${fmtDate(swingStart)} to ${fmtDate(onEnd)}, off ${fmtDate(new Date(onEnd.getTime() + 864e5))} to ${fmtDate(offEnd)}`], ['next change', `${fmtDate(next)}: ${s.on ? 'off' : 'back on'}`]);
    if (s.k < 0) rows.push(['note', 'that date is before the roster started; the pattern is extended backwards']);
    const big = date ? { t: 'big', v: s.on ? 'On' : 'Off', unit: `${fmtDate(asked)}, day ${s.i + 1} of the ${s.on ? 'on' : 'off'} block` } : { t: 'big', v: fmtDate(next), unit: s.on ? 'first day off' : 'first day back on' };
    if (date) read.push(':', { v: fmtDate(asked) }); else read.push(':', 'next change');
    return { read, value: s.on, body: [big, { t: 'kv', rows }], trace: [`days since start: ${s.k}`, `${s.k} mod ${cycle} = ${s.i} → ${s.on ? 'on' : 'off'}`], py: `((date("${iso(asked)}") - date("${iso(start)}")).days % ${cycle}) < ${a.on}` };
  }
});

/* ── time zones through Intl ────────────────────────────────── */
const ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
const cityOf = z => z.split('/').pop().replace(/_/g, ' ').toLowerCase();
const ALIAS = { utc: 'UTC', gmt: 'UTC', z: 'UTC', zulu: 'UTC', 'belo horizonte': 'America/Sao_Paulo', brasilia: 'America/Sao_Paulo', 'brasília': 'America/Sao_Paulo', rio: 'America/Sao_Paulo', 'rio de janeiro': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', 'são paulo': 'America/Sao_Paulo', brazil: 'America/Sao_Paulo', brasil: 'America/Sao_Paulo', japan: 'Asia/Tokyo', china: 'Asia/Shanghai', beijing: 'Asia/Shanghai', india: 'Asia/Kolkata', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', uk: 'Europe/London', britain: 'Europe/London', england: 'Europe/London', france: 'Europe/Paris', germany: 'Europe/Berlin', spain: 'Europe/Madrid', portugal: 'Europe/Lisbon', italy: 'Europe/Rome', netherlands: 'Europe/Amsterdam', chile: 'America/Santiago', peru: 'America/Lima', colombia: 'America/Bogota', argentina: 'America/Argentina/Buenos_Aires', 'buenos aires': 'America/Argentina/Buenos_Aires', 'south africa': 'Africa/Johannesburg', 'la': 'America/Los_Angeles', nyc: 'America/New_York', 'new york city': 'America/New_York', sf: 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', 'hong kong': 'Asia/Hong_Kong', singapore: 'Asia/Singapore', 'kuala lumpur': 'Asia/Kuala_Lumpur', dubai: 'Asia/Dubai', 'tel aviv': 'Asia/Jerusalem', moscow: 'Europe/Moscow', brisbane: 'Australia/Brisbane', melbourne: 'Australia/Melbourne', sydney: 'Australia/Sydney', perth: 'Australia/Perth', vancouver: 'America/Vancouver', toronto: 'America/Toronto', 'mexico city': 'America/Mexico_City', mexico: 'America/Mexico_City', 'cape town': 'Africa/Johannesburg', johannesburg: 'Africa/Johannesburg', lagos: 'Africa/Lagos', nairobi: 'Africa/Nairobi', cairo: 'Africa/Cairo', 'salt lake city': 'America/Denver', chicago: 'America/Chicago', denver: 'America/Denver', phoenix: 'America/Phoenix', honolulu: 'Pacific/Honolulu', anchorage: 'America/Anchorage', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata', seoul: 'Asia/Seoul', tokyo: 'Asia/Tokyo', manila: 'Asia/Manila', jakarta: 'Asia/Jakarta', bangkok: 'Asia/Bangkok', karachi: 'Asia/Karachi', tehran: 'Asia/Tehran', istanbul: 'Europe/Istanbul', athens: 'Europe/Athens', helsinki: 'Europe/Helsinki', stockholm: 'Europe/Stockholm', oslo: 'Europe/Oslo', dublin: 'Europe/Dublin', zurich: 'Europe/Zurich', vienna: 'Europe/Vienna', warsaw: 'Europe/Warsaw', lima: 'America/Lima', bogota: 'America/Bogota', santiago: 'America/Santiago', caracas: 'America/Caracas', havana: 'America/Havana', auckland: 'Pacific/Auckland', wellington: 'Pacific/Auckland', 'new zealand': 'Pacific/Auckland' };
const HERE = ['here', 'my time', 'local', 'local time', 'me', 'my zone', 'device time'];
// a place name → the zones it may mean: the alias table, then every IANA zone with that city part
export function zonesOf(name) {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(?:in|to|at)\s+/, '');
  if (HERE.includes(n)) return [clock.zone()];
  if (ALIAS[n]) return [ALIAS[n]];
  const direct = ZONES.find(z => z.toLowerCase() === n || z.toLowerCase() === n.replace(/ /g, '_')); if (direct) return [direct];
  const m = /^(?:utc|gmt)\s?([+-]\d{1,2})(?::?(\d{2}))?$/.exec(n); if (m) return [`UTC${m[1][0]}${m[1].slice(1).padStart(2, '0')}:${m[2] || '00'}`];
  const hits = ZONES.filter(z => cityOf(z) === n && !/^Etc\//.test(z));
  return hits;
}
const fixedOffset = zone => { const m = /^UTC([+-]\d\d):(\d\d)$/.exec(zone); return m ? (m[1][0] === '-' ? -1 : 1) * (+m[1].slice(1) * 60 + +m[2]) * 6e4 : null; };
const parts = (zone, t) => { const o = {}, fo = fixedOffset(zone); if (fo != null) { zone = 'UTC'; t += fo; } for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t))) o[p.type] = p.value; return o; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function offsetOf(zone, t) {
  const f = fixedOffset(zone); if (f != null) return f;
  const p = parts(zone, t), asUtc = Date.UTC(+p.year, MONTHS.indexOf(p.month), +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 6e4) * 6e4;
}
// the instant at which a zone's wall clock reads y-m-d h:mi (two passes for the daylight step)
export function instantOf(zone, y, mo, d, h, mi) {
  const wall = Date.UTC(y, mo, d, h, mi); let t = wall - offsetOf(zone, wall); t = wall - offsetOf(zone, t); return t;
}
const fmtOffset = ms => { const s = ms < 0 ? '−' : '+', m = Math.abs(ms) / 6e4; return `UTC${s}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const wall = (zone, t) => { const p = parts(zone, t); return { text: `${p.hour}:${p.minute}`, date: `${p.weekday} ${+p.day} ${p.month} ${p.year}` }; };
const zoneName = z => /^UTC/.test(z) ? z : z.replace(/_/g, ' ');
const dstNote = (zone, t) => { const o = offsetOf(zone, t); if (offsetOf(zone, t - 864e5) !== o) return `${zoneName(zone)} changed its clocks within the last day.`; if (offsetOf(zone, t + 864e5) !== o) return `${zoneName(zone)} changes its clocks within the next day.`; return null; };
const PLACE = '([a-z][a-z .\'\\-]*?(?:\\s?[+-]\\d{1,2}(?::?\\d{2})?)?)';
const zoneSlot = (key, name, zones, cur) => zones.length > 1 ? { v: zoneName(cur), key, alts: zones, cur } : { v: zoneName(cur) };
const refuseZone = (read, name, zones) => ({ read, body: [{ t: 'note', kind: 'err', text: zones.length ? `"${name}" could be ${zones.map(zoneName).join(' or ')}.` : `I do not know a time zone called "${name}". Try a city from the IANA list, like "sao paulo" or "perth", or an offset like "utc+8".` }], trace: ['zone: no match'] });

tool({
  name: 'zone',
  skill: { group: 'Compute', title: 'Time zones', on: 'Intl', about: 'A time in one place as it reads in another, with the offsets used and a note when the clocks change nearby. Cities by their IANA names, plus common aliases.', examples: ['9am sao paulo in perth', 'what time is it in vancouver', '14:30 utc to my time', 'overlap of 9 to 17 in belo horizonte and perth'] },
  topic: () => ['Time zones', 1],
  run: a => {
    const toZ = zonesOf(a.to), to = a.toZone || toZ[0], read = [];
    if (!a.time) {
      if (toZ.length !== 1 && !a.toZone) return refuseZone(['time now in', { v: a.to }], a.to, toZ);
      const t = clock.now().getTime(), w = wall(to, t), note = dstNote(to, t);
      return { read: ['time now in', zoneSlot('toZone', a.to, toZ, to)], value: w.text, body: [{ t: 'big', v: w.text, unit: w.date }, { t: 'kv', rows: [['offset', fmtOffset(offsetOf(to, t))], ['here', `${wall(clock.zone(), t).text} (${zoneName(clock.zone())}, ${fmtOffset(offsetOf(clock.zone(), t))})`]] }, ...(note ? [{ t: 'note', text: note }] : [])], trace: [`Intl.DateTimeFormat(timeZone: "${to}")`, `now = ${new Date(t).toISOString()}`], py: `datetime.now(ZoneInfo("${to}"))` };
    }
    const fromZ = zonesOf(a.from), from = a.fromZone || fromZ[0];
    const tm = a.time === 'noon' ? { h: 12, mi: 0 } : a.time === 'midnight' ? { h: 0, mi: 0 } : findTime('at ' + a.time) || findTime(a.time);
    if (!tm) return { read: ['time', { v: a.time }], body: [{ t: 'note', kind: 'err', text: `I cannot read "${a.time}" as a time of day.` }], trace: ['time: no reading'] };
    if (fromZ.length !== 1 && !a.fromZone) return refuseZone([{ v: a.time }, 'in', { v: a.from }], a.from, fromZ);
    if (toZ.length !== 1 && !a.toZone) return refuseZone([{ v: a.time }, 'in', { v: a.from }, 'to', { v: a.to }], a.to, toZ);
    const day = a.date ? (findDate(a.date) || {}).d : today(); if (!day) return { read: [{ v: a.time }, 'on', { v: a.date }], body: [{ t: 'note', kind: 'err', text: `I cannot read "${a.date}" as a date.` }], trace: ['date: no reading'] };
    const t = instantOf(from, day.getFullYear(), day.getMonth(), day.getDate(), tm.h, tm.mi), wf = wall(from, t), wt = wall(to, t);
    const dayShift = Math.round((Date.UTC(...wt.date.split(' ').slice(1).reverse().map((x, i) => i === 1 ? MONTHS.indexOf(x) : +x)) - Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())) / 864e5);
    const notes = [dstNote(from, t), dstNote(to, t)].filter(Boolean);
    read.push({ v: wf.text }, zoneSlot('fromZone', a.from, fromZ, from), 'to', zoneSlot('toZone', a.to, toZ, to));
    return { read, value: wt.text, body: [{ t: 'big', v: wt.text, unit: `${wt.date}${dayShift ? ` (${dayShift > 0 ? 'the next day' : 'the day before'})` : ' (the same day)'}` }, { t: 'kv', rows: [[zoneName(from), `${wf.text} ${fmtOffset(offsetOf(from, t))}, ${wf.date}`], [zoneName(to), `${wt.text} ${fmtOffset(offsetOf(to, t))}`], ['difference', `${fmtOffset(offsetOf(to, t) - offsetOf(from, t)).replace('UTC', '')} hours`]] }, ...(notes.length ? [{ t: 'note', text: notes.join(' ') }] : [])], trace: [`wall ${iso(day)} ${wf.text} in ${from} → ${new Date(t).toISOString()}`, `offsets: ${from} ${fmtOffset(offsetOf(from, t))}, ${to} ${fmtOffset(offsetOf(to, t))}`], py: `datetime(${day.getFullYear()}, ${day.getMonth() + 1}, ${day.getDate()}, ${tm.h}, ${tm.mi}, tzinfo=ZoneInfo("${from}")).astimezone(ZoneInfo("${to}"))` };
  }
});
tool({
  name: 'overlap',
  topic: () => ['Time zones', 1],
  run: a => {
    const zs = a.places.map(p => ({ name: p, zones: zonesOf(p) })), bad = zs.find(z => z.zones.length !== 1);
    const read = ['overlap of', { v: `${a.from} to ${a.to}` }, 'in', { v: a.places.join(', ') }];
    if (bad) return refuseZone(read, bad.name, bad.zones);
    const t0 = findTime('at ' + a.from), t1 = findTime('at ' + a.to); if (!t0 || !t1) return { read, body: [{ t: 'note', kind: 'err', text: 'I cannot read the hours.' }], trace: ['time: no reading'] };
    const day = today(), windows = zs.map(z => { const s = instantOf(z.zones[0], day.getFullYear(), day.getMonth(), day.getDate(), t0.h, t0.mi), e = instantOf(z.zones[0], day.getFullYear(), day.getMonth(), day.getDate(), t1.h, t1.mi); return { zone: z.zones[0], s, e: e > s ? e : e + 864e5 }; });
    // the day boundary differs by zone, so each window is also tried a day earlier and later
    let best = null;
    for (const shift of [-864e5, 0, 864e5]) { const s = Math.max(windows[0].s, ...windows.slice(1).map(w => w.s + shift)), e = Math.min(windows[0].e, ...windows.slice(1).map(w => w.e + shift)); if (e > s && (!best || e - s > best.e - best.s)) best = { s, e }; }
    const rows = windows.map(w => [zoneName(w.zone), best ? `${wall(w.zone, best.s).text} to ${wall(w.zone, best.e).text} (${fmtOffset(offsetOf(w.zone, best.s))})` : `${a.from} to ${a.to} local (${fmtOffset(offsetOf(w.zone, w.s))})`]);
    const hours = best ? (best.e - best.s) / 36e5 : 0;
    return { read, value: hours, body: [{ t: 'big', v: best ? `${hours % 1 ? hours.toFixed(1) : hours} h` : 'None', unit: best ? `in common each day, ${a.from} to ${a.to} local in each place` : `no hour is ${a.from} to ${a.to} in all of them` }, { t: 'kv', rows }, { t: 'sub', text: `Computed for ${fmtDate(day)}; it moves when any of these places changes its clocks.` }], trace: windows.map(w => `${w.zone}: ${new Date(w.s).toISOString()} to ${new Date(w.e).toISOString()}`).concat(best ? [`intersection: ${new Date(best.s).toISOString()} to ${new Date(best.e).toISOString()}`] : ['empty intersection']), py: `# intersect the UTC windows of ${zs.map(z => z.zones[0]).join(', ')}` };
  }
});
/* ── what reads them ─────────────────────────────────────────── */
const DATE_T = ['date', 'holiday'];
const hm = t => `${t.h}:${String(t.mi).padStart(2, '0')}`;
// working days: "working days until 20 dec", "working days between 1 dec and 20 dec", "15 working days from monday",
// "is 21 apr 2027 a working day", "the next working day after 24 dec"
unit({ unit: 'working days', dim: 'workday', words: ['working days', 'working day', 'business days', 'business day', 'workdays', 'workday'] });
noun({ type: 'daykind', words: { working: ['a working day', 'a business day', 'a work day', 'a workday', 'working day', 'business day'] }, words_pt: { working: ['dia útil', 'dia util', 'um dia útil', 'um dia util'] } });
noun({ type: 'nextwork', words: { next: ['next working day', 'next business day'] }, words_pt: { next: ['próximo dia útil', 'proximo dia util'] } });
frame({
  name: 'workcount', label: 'Working days', words: ['working days', 'business days', 'how many working days', 'how many business days', 'workdays'], theme: [], required: [],
  roles: { until: { preps: ['until', 'till', 'to', 'before'], types: DATE_T }, from: { preps: ['from', 'between', 'since'], types: DATE_T } },
  words_pt: ['dias úteis', 'dias uteis', 'quantos dias úteis', 'quantos dias uteis'], label_pt: 'Dias úteis',
  bind: c => {
    const u = (c.roles.until || []).map(dateWords), f = (c.roles.from || []).map(dateWords);
    if (f.length === 2 && !u.length) return { tool: 'workdays', args: { ask: 'between', from: f[0], to: f[1] } };
    if (f.length === 1 && u.length === 1) return { tool: 'workdays', args: { ask: 'between', from: f[0], to: u[0] } };
    return u.length === 1 && !f.length ? { tool: 'workdays', args: { ask: 'until', to: u[0] } } : null;
  }
});
frame({
  name: 'workadd', label: 'Working days', words: [], elidable: true, theme: ['quantity:workday'], required: ['theme'],
  roles: { from: { preps: ['from', 'after'], types: DATE_T }, before: { preps: ['before'], types: DATE_T } }, label_pt: 'Dias úteis',
  bind: c => { const q = c.theme[0], f = c.roles.from && c.roles.from[0], b = c.roles.before && c.roles.before[0]; if (!q || q.unit !== 'working days' || !Number.isInteger(q.n) || (f && b)) return null;
    return { tool: 'workdays', args: { ask: 'add', n: b ? -q.n : q.n, from: dateWords(f || b) || 'today' } }; }
});
frame({
  name: 'isworkday', label: 'Working day?', words: ['is', 'was', 'will'], theme: DATE_T, required: ['theme', 'as'], roles: { as: { preps: [''], types: ['daykind'] } },
  words_pt: ['é', 'e', 'foi', 'será'], label_pt: 'Dia útil?',
  bind: c => dateWords(c.theme[0]) ? { tool: 'workdays', args: { ask: 'is', date: dateWords(c.theme[0]) } } : null
});
frame({
  name: 'nextworkday', label: 'Next working day', words: [], elidable: true, theme: ['nextwork'], required: ['theme'], roles: { after: { preps: ['after', 'from'], types: DATE_T } }, label_pt: 'Próximo dia útil',
  bind: c => ({ tool: 'workdays', args: { ask: 'add', n: 1, from: dateWords(c.roles.after && c.roles.after[0]) || 'today' } })
});
// time zones: "9am sao paulo in perth", "14:30 utc to my time", "what time is it in vancouver"; a place is an IANA city,
// an alias, "here", or a place saved on this device
noun(() => {
  const names = [...new Set([...ZONES.filter(z => !/^Etc\//.test(z) && z.includes('/')).map(cityOf), ...Object.keys(ALIAS), ...HERE.filter(w => w !== 'me'), 'home', ...(S.tables.places ? S.tables.places.rows.map(r => r.name) : [])])];
  const words = Object.fromEntries(names.map(n => [n, [n]]));
  return { type: 'place', exact: true, words, generic: ['place'], words_pt: { ...words, here: ['here', 'aqui', 'onde estou', 'minha localização'] }, generic_pt: ['lugar'] };
});
shape({ type: 'place', re: String.raw`(?:utc|gmt)\s?[+-]\d{1,2}(?::?\d{2})?` });   // "utc+8", "gmt-3"
// "what time is 9 am in sao paulo in perth", "when it is 9am in sao paulo, what time is it in perth"
noun({ type: 'whattime', words: { ask: ['what time is it', 'what time will it be', "what's the time", 'what is the time', 'what time is that'] }, words_pt: { ask: ['que horas são', 'que horas sao', 'que horas serão'] } });
frame({
  name: 'zone', label: 'Time in', words: ['what time is', 'when it is', "when it's", 'if it is', "if it's", 'convert'], elidable: true, theme: ['clock'], required: ['theme', 'to'],
  roles: { from: { preps: ['', 'from', 'at'], types: ['place'] }, to: { preps: ['in', 'to', 'for', 'as'], types: ['place'] }, on: { preps: ['on'], types: DATE_T }, ask: { preps: [''], types: ['whattime'] } }, label_pt: 'Hora em',
  bind: c => {
    let from = (c.roles.from || []).map(p => p.value), to = (c.roles.to || []).map(p => p.value);
    if (!from.length && to.length === 2) { from = [to[0]]; to = [to[1]]; }
    if (from.length !== 1 || to.length !== 1) return null;
    const d = c.roles.on && dateWords(c.roles.on[0]);
    return { tool: 'zone', args: { time: hm(c.theme[0]), from: from[0], to: to[0], ...(d ? { date: d } : {}) } };
  }
});
frame({
  name: 'timenow', label: 'Time now', words: ['what time is it', 'what is the time', "what's the time", 'current time', 'time now', 'local time', 'time'], theme: [], required: ['in'],
  roles: { in: { preps: ['in', 'at'], types: ['place'] } }, words_pt: ['que horas são', 'que horas sao', 'hora atual', 'horas'], label_pt: 'Hora agora',
  bind: c => ({ tool: 'zone', args: { to: c.roles.in[0].value } })
});
// "overlap of 9 to 17 in belo horizonte and perth"
frame({
  name: 'overlap', label: 'Overlap', words: ['overlap', 'working overlap', 'common hours', 'shared hours', 'hours in common'], theme: [], required: ['of', 'to', 'in'],
  roles: { of: { preps: ['of', 'for', 'between', 'from'], types: ['clock'] }, to: { preps: ['to', 'until', 'till'], types: ['clock'] }, in: { preps: ['in', 'between', 'for', 'across'], types: ['place'] } },
  words_pt: ['sobreposição', 'sobreposicao', 'horas em comum'], label_pt: 'Sobreposição',
  bind: c => c.roles.in.length >= 2 ? { tool: 'overlap', args: { from: hm(c.roles.of[0]), to: hm(c.roles.to[0]), places: c.roles.in.map(p => p.value) } } : null
});
// rosters: "14 on 14 off from 6 oct", "…, am i off at christmas", "am i off on 21 oct", "when is my next swing"
shape({ type: 'roster', re: String.raw`\d{1,2}\s*(?:on|x|/)\s*,?\s*\d{1,2}(?:\s*off)?` });
noun({ type: 'roster', words: {}, generic: ['roster', 'rotation', 'swing roster', 'shift roster'], generic_pt: ['escala', 'escala de trabalho'] });   // "a 14 on 14 off roster"
postmod({ prep: 'from', heads: ['roster'], attr: 'start', mod: 'date' });
postmod({ prep: 'since', heads: ['roster'], attr: 'start', mod: 'date' });
noun({ type: 'rosterq', words: { day: ['am i off', 'am i on', 'am i working', 'am i at work', 'will i be off', 'will i be on', 'will i be working', 'are we off', 'are we on', 'off or on'], next: ['next swing', 'my next swing', 'next change', 'next changeover', 'next days off', 'next day off', 'next days on'] },
  words_pt: { day: ['estou de folga', 'estou trabalhando', 'vou estar de folga', 'vou trabalhar'], next: ['próxima troca', 'proxima troca', 'próxima folga', 'proxima folga'] } });
frame({
  name: 'roster', label: 'Roster', words: ['when is', 'roster'], elidable: true, theme: ['roster', 'rosterq'], required: ['theme'],
  roles: { on: { preps: ['on', 'at', 'for'], types: ['date', 'holiday'] } }, words_pt: ['escala'], label_pt: 'Escala',
  bind: c => {
    const r = c.theme.find(t => t.type === 'roster'), q = c.theme.find(t => t.type === 'rosterq'), on = c.roles.on && dateWords(c.roles.on[0]);
    if (c.theme.length > 2 || (on && !q && r)) return null;
    let base;
    if (r) { const m = /^(\d+)\s*(?:on|x|\/)\s*,?\s*(\d+)/i.exec(r.value); if (!m) return null; base = { on: +m[1], off: +m[2], start: r.attrs.start || 'today' }; }
    else { base = lastRoster(); if (!base) return { tool: 'roster', args: { noRoster: true } }; }
    if (!q) return { tool: 'roster', args: base };
    return { tool: 'roster', args: q.value === 'next' ? { ...base, date: 'today', next: true } : { ...base, date: on || 'today' } };
  }
});
// "with the brazilian calendar", "weekdays only"
noun({ amend: true, type: 'calkind', words: { brazil: ['brazil', 'brazilian', 'the brazilian calendar', 'brazilian calendar', 'brazil calendar', 'brazilian holidays'], weekdays: ['weekdays', 'weekdays only', 'weekday calendar', 'no holidays'] }, words_pt: { brazil: ['calendário brasileiro'], weekdays: ['dias de semana', 'sem feriados'] } });
amend({ tools: ['workdays'], name: 'workcal', label: 'Calendar', words: [], elidable: true, theme: ['calkind'], required: [], roles: { with: { preps: ['with', 'in', 'using', 'on'], types: ['calkind'] } },
  bind: (c, a) => { const k = [...c.theme, ...(c.roles.with || [])][0]; return k ? { args: { ...a, cal: k.value } } : null; } });

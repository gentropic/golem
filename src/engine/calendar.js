// Working days and rosters over @gcu/plan's calendar engine (vendored), and time zones through Intl.
// The calendar is a slot and is always shown: Brazil's federal holidays, or weekdays only.
import { S, tool, clock, iso } from './core.js';
import { findDate, findTime, today, day0, fmtDate } from './dates.js';
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
  name: 'workdays', rank: 85,
  skill: { group: 'Compute', title: 'Working days and rosters', on: '@gcu/plan', about: 'Working days until a date or between two, N working days from a date, whether a day is a working day, and on/off rosters. The calendar is a slot: Brazil\'s federal holidays or weekdays only.', examples: ['working days until 20 dec', 'is 21 apr 2027 a working day', '15 working days from monday', '14 on 14 off from 6 oct, am i off at christmas'] },
  read: (text, q) => {
    let m;
    if ((m = new RegExp(`^(?:how many )?(?:working|business) days (?:until|till|to|before|left until) ${DATE}$`).exec(q))) return { ask: 'until', to: m[1] };
    if ((m = new RegExp(`^(?:how many )?(?:working|business) days (?:between|from) ${DATE} (?:and|to|until|till) ${DATE}$`).exec(q))) return { ask: 'between', from: m[1], to: m[2] };
    if ((m = new RegExp(`^(?:is|was|will) ${DATE} (?:be )?a (?:working|business|work) ?day$`).exec(q))) return { ask: 'is', date: m[1] };
    if ((m = new RegExp(`^(\\d+) (?:working|business) days? (?:from|after) ${DATE}$`).exec(q))) return { ask: 'add', n: +m[1], from: m[2] };
    if ((m = new RegExp(`^(\\d+) (?:working|business) days? (?:before|back from) ${DATE}$`).exec(q))) return { ask: 'add', n: -m[1], from: m[2] };
    if ((m = /^(?:what is |when is )?(?:the )?next (?:working|business) day(?: after (.+))?$/.exec(q))) return { ask: 'add', n: 1, from: m[1] || 'today' };
    return null;
  },
  amend: [{ arg: 'cal', match: /^(?:in |with |using )?(?:the )?(brazil(?:ian)?|weekdays?(?: only)?|no holidays)(?: calendar| holidays)?$/, value: m => /^brazil/.test(m[1]) ? 'brazil' : 'weekdays' }],
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
  name: 'roster', rank: 86,
  read: (text, q) => {
    let m = /^(\d+) on,? (\d+) off(?:,? (?:starting|from|since) (.+?))?(?:[,;]? (?:am i|will i be|are we) (off|on|working|at work)(?: (?:on|at) (.+))?)?$/.exec(q);
    if (m) return { on: +m[1], off: +m[2], start: m[3] || 'today', ...(m[4] ? { date: m[5] || 'today' } : {}) };
    m = /^(?:am i|will i be|are we) (?:off|on|working|at work)(?: (?:on|at) (.+))?$/.exec(q); if (m) { const r = lastRoster(); return r ? { ...r, date: m[1] || 'today' } : { noRoster: true }; }
    m = /^(?:when is (?:the |my )?)?next (?:swing|change|changeover|days? off|days? on)$/.exec(q); if (m) { const r = lastRoster(); return r ? { ...r, date: 'today', next: true } : { noRoster: true }; }
    return null;
  },
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
  name: 'zone', rank: 87,
  skill: { group: 'Compute', title: 'Time zones', on: 'Intl', about: 'A time in one place as it reads in another, with the offsets used and a note when the clocks change nearby. Cities by their IANA names, plus common aliases.', examples: ['9am sao paulo in perth', 'what time is it in vancouver', '14:30 utc to my time', 'overlap of 9 to 17 in belo horizonte and perth'] },
  read: (text, q) => {
    let m;
    if ((m = /^(?:what time is it|what is the time|current time|time now|now)(?: now)? in (.+)$/.exec(q))) return { to: m[1] };
    if ((m = new RegExp(`^(?:what is |what's )?(\\d{1,2}(?::\\d{2})? ?(?:am|pm)?|noon|midnight)(?: (?:on|of) (.+?))?(?: (?:in|at|from))? ${PLACE} (?:in|to|at|for|as) ${PLACE}$`).exec(q))) return { time: m[1], ...(m[2] ? { date: m[2] } : {}), from: m[3], to: m[4] };
    if ((m = new RegExp(`^(?:what is |what's )?${PLACE} (\\d{1,2}(?::\\d{2})? ?(?:am|pm)?|noon|midnight)(?: (?:on|of) (.+?))? (?:in|to|at|for|as) ${PLACE}$`).exec(q))) return { time: m[2], ...(m[3] ? { date: m[3] } : {}), from: m[1], to: m[4] };
    return null;
  },
  amend: [{ arg: 'date', match: /^(?:on |for )?(tomorrow|today|next \w+|\d{1,2} \w{3,9}(?: \d{4})?|\d{4}-\d{2}-\d{2})$/ }],
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
  name: 'overlap', rank: 88,
  read: (text, q) => { const m = new RegExp(`^(?:working )?(?:overlap|common hours|shared hours) (?:of|for|between) (\\d{1,2}(?::\\d{2})?) ?(?:to|-|–) ?(\\d{1,2}(?::\\d{2})?) (?:in|between|for) (.+)$`).exec(q); if (!m) return null; const places = m[3].split(/,\s*|\s+and\s+/).filter(Boolean); return places.length >= 2 ? { from: m[1], to: m[2], places } : null; },
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

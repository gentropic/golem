// Dates and times: day counts, weekdays, and the parsers the calendar tools share.
import { tool, clock, iso } from './core.js';

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONRE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const DOWRE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)';
export const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const today = () => day0(clock.now());
export const fmtDate = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export function findDate(s) {
  const now = today();
  const add = n => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const md = (d, mo, y) => { let dt = new Date(y ? +y : now.getFullYear(), mo, d); if (!y && dt < now) dt = new Date(now.getFullYear() + 1, mo, d); return dt; };
  const mi = w => MON.indexOf(w.slice(0, 3));
  let m;
  if ((m = /\b(\d{4})-(\d\d)-(\d\d)\b/.exec(s))) return { d: new Date(+m[1], m[2] - 1, +m[3]), m };
  if ((m = new RegExp('\\b(?:on )?(?:the )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?' + MONRE + '(?: (\\d{4}))?\\b').exec(s))) return { d: md(+m[1], mi(m[2]), m[3]), m };
  if ((m = new RegExp('\\b(?:on )?' + MONRE + ' (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b').exec(s))) return { d: md(+m[2], mi(m[1]), m[3]), m };
  if ((m = /\btoday\b/.exec(s))) return { d: now, m };
  if ((m = /\btomorrow\b/.exec(s))) return { d: add(1), m };
  if ((m = /\bin (\d+) (day|week)s?\b/.exec(s))) return { d: add(m[1] * (m[2] === 'week' ? 7 : 1)), m };
  if ((m = new RegExp('\\b(?:on )?(next )?' + DOWRE + '\\b').exec(s))) {
    let n = (DOW.indexOf(m[2].slice(0, 3)) - now.getDay() + 7) % 7 || 7;
    if (m[1]) n += 7;
    return { d: add(n), m };
  }
  return null;
}
export function findTime(s) {
  let m = /\b(?:at )?noon\b/.exec(s);
  if (m) return { h: 12, mi: 0, m };
  m = /\bat (\d{1,2})(?::(\d\d))? ?(am|pm)?\b/.exec(s) || /\b(\d{1,2}):(\d\d) ?(am|pm)?\b/.exec(s) || /\b(\d{1,2})() ?(am|pm)\b/.exec(s);
  if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return { h, mi, m };
}
tool({
  name: 'daysUntil', rank: 90,
  skill: { group: 'Compute', title: 'Dates', on: 'built in', about: 'Day counts and weekdays.', examples: ['days until 25 december', 'what day is 15 nov 2027'] },
  read: (text, q) => { const m = /^(?:how many )?days (?:until|till|to|before) (.+)$/.exec(q); return m ? { s: m[1] } : null; },
  topic: () => ['Dates', .5],
  run: a => {
    const f = findDate(a.s); if (!f) return null;
    const n = Math.round((f.d - today()) / 864e5);
    return { read: ['days from', { v: 'today' }, 'to', { v: fmtDate(f.d) }], value: n, body: [{ t: 'big', v: String(n), unit: `day${Math.abs(n) === 1 ? '' : 's'}` }, { t: 'sub', text: `${Math.floor(Math.abs(n) / 7)} weeks and ${Math.abs(n) % 7} days` }], trace: [`dates.parse("${a.s}") → ${f.d.toDateString()}`, 'difference in whole days'], py: `(date("${iso(f.d)}") - date.today()).days` };
  }
});
tool({
  name: 'weekday', rank: 91,
  read: (text, q) => { const m = /^what (?:day|weekday) (?:is|was|will be) (.+)$/.exec(q); return m ? { s: m[1] } : null; },
  topic: () => ['Dates', .5],
  run: a => {
    const f = findDate(a.s); if (!f) return null;
    return { read: ['weekday of', { v: fmtDate(f.d) }], body: [{ t: 'big', v: f.d.toLocaleDateString('en-GB', { weekday: 'long' }) }], trace: [`dates.parse("${a.s}")`, 'Gregorian weekday'], py: `date("${iso(f.d)}").strftime("%A")` };
  }
});

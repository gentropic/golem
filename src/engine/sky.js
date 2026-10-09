// The sun by NOAA's solar position equations (after Meeus), and the moon's phase from the mean
// synodic cycle, labelled with its accuracy. Times are given in the place's zone when the place name
// has one, else in UTC and the card says so.
import { tool, fmt, rad, deg, iso } from './core.js';
import { findDate, today, fmtDate } from './dates.js';
import { zonesOf, offsetOf } from './calendar.js';
import { placeOf } from './places.js';

const COORD = '(-?\\d{1,2}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)';
const whereAsk = (name, key) => ({ prompt: `Where is ${name}? Give its coordinates as "lat, lon". Type them below.`, options: [], parse: s => { const m = new RegExp(`^${COORD}$`).exec(s.trim()); return m ? { lat: +m[1], lon: +m[2] } : null; }, set: (a, v) => { a[key] = v; } });
const pad = x => String(x).padStart(2, '0');
// minutes after midnight UTC → "hh:mm" in a zone, with the day shift
const clockIn = (dayUTC, minutes, zone) => { const t = dayUTC + minutes * 6e4, off = zone ? offsetOf(zone, t) : 0, m = Math.round((t + off) / 6e4), dayMin = ((m % 1440) + 1440) % 1440, shift = Math.floor((t + off - dayUTC) / 864e5); return { text: `${pad(Math.floor(dayMin / 60))}:${pad(dayMin % 60)}${shift === 1 ? ' (next day)' : shift === -1 ? ' (day before)' : ''}`, t };
};
// NOAA solar calculations for a day (UTC midnight) and a place; angles in degrees
export function solar(dayUTC, lat, lon) {
  const JD = dayUTC / 864e5 + 2440587.5, T = (JD - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T), e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C, omega = 125.04 - 1934.136 * T, lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda)))), y = Math.tan(rad(eps / 2)) ** 2;
  const eot = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const noon = 720 - 4 * lon - eot;   // minutes after 0:00 UTC
  const ha = zenith => { const c = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl)); return c > 1 ? null : c < -1 ? Infinity : deg(Math.acos(c)); };
  return { decl, eot, noon, ha: ha(90.833), haCivil: ha(96) };
}
tool({
  name: 'sun', rank: 29,
  skill: { group: 'Device', title: 'Sun and moon', on: 'NOAA equations, mean lunar cycle', about: 'Sunrise, solar noon, sunset, day length and civil twilight for a place and date (about a minute at mid-latitudes); the moon\'s phase from the mean cycle, to about half a day. Places as coordinates or a saved name.', examples: ['sunrise tomorrow in -19.92, -43.94', 'sunset today at home', 'moon phase on 25 dec'] },
  read: (text, q) => { const m = /^(?:(?:when is |what time is )?(sunrise|sunset|solar noon|sun times|sun|daylight|day length|twilight)(?: and (?:sunset|sunrise))?)(?: (today|tomorrow|yesterday|on .+?|next \w+|\d{1,2} \w{3,9}(?: \d{4})?))? (?:in|at) (.+)$/.exec(q); return m ? { what: m[1], date: m[2] || 'today', place: m[3] } : null; },
  amend: [{ arg: 'zone', match: /^(?:in |times in )?(.+?) time$/, value: m => { const z = zonesOf(m[1]); return z.length === 1 ? z[0] : null; } }, { arg: 'date', match: /^(?:on |for )?(today|tomorrow|yesterday|\d{1,2} \w{3,9}(?: \d{4})?|\d{4}-\d{2}-\d{2}|next \w+)$/ }],
  topic: () => ['Sun', 1],
  run: a => {
    const read = [{ v: a.what }, 'on', { v: a.date }, 'at', { v: a.place }], P = a.placeLL || placeOf(a.place);
    if (!P || P.unknown) return { read, body: [], ask: whereAsk(a.place, 'placeLL'), trace: [`place "${a.place}": unknown`] };
    const d = a.date === 'today' ? today() : (findDate(a.date.replace(/^on /, '')) || {}).d; if (!d) return { read, body: [{ t: 'note', kind: 'err', text: `I cannot read "${a.date}" as a date.` }], trace: ['date: no reading'] };
    const zones = a.zone ? [a.zone] : zonesOf(a.place), zone = zones.length === 1 ? zones[0] : null;
    const dayUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), s = solar(dayUTC + 432e5, P.lat, P.lon);
    const rows = [], at = m => clockIn(dayUTC, m, zone).text;
    if (s.ha === null) rows.push(['sun', 'does not rise this day at this latitude']); else if (s.ha === Infinity) rows.push(['sun', 'does not set this day at this latitude']);
    else { rows.push(['sunrise', at(s.noon - 4 * s.ha), { mono: true }], ['solar noon', at(s.noon), { mono: true }], ['sunset', at(s.noon + 4 * s.ha), { mono: true }], ['day length', `${Math.floor(8 * s.ha / 60)} h ${pad(Math.round(8 * s.ha) % 60)} min`]); }
    if (s.haCivil !== null && s.haCivil !== Infinity && s.ha !== null) rows.push(['civil twilight', `${at(s.noon - 4 * s.haCivil)} to ${at(s.noon + 4 * s.haCivil)}`, { mono: true }]);
    else if (s.haCivil === Infinity) rows.push(['civil twilight', 'all night: the sun stays within 6° of the horizon']);
    rows.push(['sun\'s declination', `${fmt(s.decl, 4)}°; equation of time ${fmt(s.eot, 3)} min`]);
    const big = /sunrise/.test(a.what) && s.ha ? at(s.noon - 4 * s.ha) : /sunset/.test(a.what) && s.ha ? at(s.noon + 4 * s.ha) : /noon/.test(a.what) ? at(s.noon) : s.ha === null ? 'No sunrise' : s.ha === Infinity ? 'No sunset' : `${at(s.noon - 4 * s.ha)} to ${at(s.noon + 4 * s.ha)}`;
    return { read: [...read, { v: zone ? zone.replace(/_/g, ' ') : 'UTC' }], value: big, body: [{ t: 'big', v: big, unit: `${fmtDate(d)}, ${zone ? zone.replace(/_/g, ' ') : 'UTC'}` }, { t: 'kv', rows }, ...(zone ? [] : [{ t: 'note', text: `No time zone is known for "${a.place}", so the times are UTC. Say "in sao paulo time" to shift them.` }]), { t: 'src', text: 'NOAA solar position equations (after Meeus) · about a minute at mid-latitudes, less sure near the poles · refraction 0.833°' }], trace: [`place ${P.lat}, ${P.lon}; day ${iso(d)}`, `declination ${fmt(s.decl, 5)}°, EoT ${fmt(s.eot, 4)} min, noon ${fmt(s.noon, 3)} min UTC`, `hour angle ${s.ha === null ? 'none' : s.ha === Infinity ? 'all day' : fmt(s.ha, 5) + '°'}`], py: `sky.sun(lat=${P.lat}, lon=${P.lon}, date="${iso(d)}")` };
  }
});

/* ── the moon's phase from the mean synodic month ───────────── */
const SYNODIC = 29.530588861, NEW0 = Date.UTC(2000, 0, 6, 18, 14);   // a new moon, 6 Jan 2000 18:14 UTC
const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
tool({
  name: 'moon', rank: 30,
  read: (text, q) => { const m = /^(?:moon|moon phase|phase of the moon|lunar phase)(?: (?:on|for) (.+)| (today|tomorrow|tonight))?$/.exec(q); return m ? { date: m[1] || (m[2] === 'tonight' ? 'today' : m[2]) || 'today' } : null; },
  amend: [{ arg: 'date', match: /^(?:on |for )?(today|tomorrow|yesterday|\d{1,2} \w{3,9}(?: \d{4})?|\d{4}-\d{2}-\d{2}|next \w+)$/ }],
  topic: () => ['Moon', 1],
  run: a => {
    const d = a.date === 'today' ? today() : (findDate(a.date) || {}).d, read = ['moon phase on', { v: a.date }];
    if (!d) return { read, body: [{ t: 'note', kind: 'err', text: `I cannot read "${a.date}" as a date.` }], trace: ['date: no reading'] };
    const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12), age = (((t - NEW0) / 864e5) % SYNODIC + SYNODIC) % SYNODIC, frac = (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
    const idx = Math.floor(((age / SYNODIC) * 8 + 0.5) % 8), name = PHASES[idx], cycles = Math.floor((t - NEW0) / 864e5 / SYNODIC);
    const nextNew = NEW0 + (cycles + 1) * SYNODIC * 864e5, thisFull = NEW0 + (cycles + 0.5) * SYNODIC * 864e5, nextFull = thisFull > t ? thisFull : thisFull + SYNODIC * 864e5;
    return { read, value: frac, body: [{ t: 'big', v: name, unit: `${fmt(frac * 100, 3)} % lit, ${fmt(age, 3)} days old` }, { t: 'kv', rows: [['next new moon', fmtDate(new Date(nextNew)) + ' (about)'], ['next full moon', fmtDate(new Date(nextFull)) + ' (about)']] }, { t: 'sub', text: 'From the mean synodic month counted from the new moon of 6 Jan 2000; the true phase can differ by up to about half a day. Meeus\'s periodic terms are not applied.' }], trace: [`age = ((t − 2000-01-06T18:14Z) mod ${SYNODIC} d) = ${fmt(age, 5)} d`, `illuminated fraction = (1 − cos(2π age/P))/2 = ${fmt(frac, 5)}`], py: `sky.moon_phase("${iso(d)}")` };
  }
});

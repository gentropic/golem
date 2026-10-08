// Magnetic declination from @gcu/wmm (vendored WMM2025), and bearings between magnetic and true north.
// A place is coordinates in the request; device location stays off (SPEC-skills 0.7).
import { tool, clock, fmt, iso, p3 } from './core.js';
import { field, MODEL, VALID_FROM, VALID_TO } from '../vendor/wmm.js';
import { findDate, fmtDate } from './dates.js';

const LL = '(-?\\d{1,2}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)';
const whereNote = { t: 'note', kind: 'err', text: 'Where? Give coordinates, as in "declination at -19.92, -43.94". Device location stays off.' };
const dateOf = a => a.date ? new Date(a.date) : clock.now();
const decl = (a) => { const d = dateOf(a), f = field(a.lat, a.lon, { date: d }); return { d, f }; };
const dirWord = x => x < 0 ? 'west' : 'east';
const SRC = f => ({ t: 'src', text: `@gcu/wmm · vendored · ${MODEL}, valid ${VALID_FROM} to ${VALID_TO}${f.valid ? '' : ' · outside the validity window'}` });

tool({
  name: 'declination', rank: 68,
  skill: { group: 'Field', title: 'Magnetic declination', on: '@gcu/wmm', about: 'The World Magnetic Model at a place and date, and magnetic to true bearings.', examples: ['declination at -19.92, -43.94', '045 magnetic to true at -19.92, -43.94'] },
  read: (text, q) => {
    if (/^(?:magnetic )?declination(?: here)?$/.test(q)) return { here: true };
    const m = new RegExp(`^(?:magnetic )?declination (?:at|for|in) ${LL}(?: on (.+))?$`).exec(q); if (!m) return null;
    const args = { lat: +m[1], lon: +m[2] }; if (m[3]) { const d = findDate(m[3]); if (!d) return null; args.date = iso(d.d); } return args;
  },
  topic: () => ['Declination', 2],
  run: a => {
    if (a.here) return { read: ['declination', { v: 'here' }], body: [whereNote], trace: ['no place: device location is off and no coordinates were given'] };
    if (Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180) return null;
    const { d, f } = decl(a);
    return {
      read: ['declination at', { v: `${a.lat}, ${a.lon}` }, 'on', { v: fmtDate(d) }], value: f.decl,
      body: [{ t: 'big', v: `${fmt(Math.abs(f.decl), 3)}° ${dirWord(f.decl)}`, unit: 'declination' },
        ...(f.valid ? [] : [{ t: 'note', kind: 'err', text: `${fmtDate(d)} is outside ${MODEL}'s window (${VALID_FROM} to ${VALID_TO}); the value is extrapolated and may be off.` }]),
        { t: 'kv', rows: [['inclination', `${fmt(f.incl, 3)}°`], ['total intensity', `${fmt(f.f, 5)} nT`], ['horizontal', `${fmt(f.h, 5)} nT`], ['annual change', `${fmt(f.ddot, 3)}°/year in declination`]] }, SRC(f)],
      trace: [`wmm.field(${a.lat}, ${a.lon}, ${fmt(f.year, 6)})`, `declination ${fmt(f.decl, 5)}° (east positive)`], py: `wmm.declination(${a.lat}, ${a.lon}, "${iso(d)}")`
    };
  }
});
tool({
  name: 'bearing', rank: 69,
  read: (text, q) => {
    const m = new RegExp(`^(\\d{1,3}(?:\\.\\d+)?) (magnetic|true|grid) to (magnetic|true|grid)(?: at ${LL}(?: on (.+))?)?$`).exec(q); if (!m) return null;
    const args = { v: +m[1], from: m[2], to: m[3] }; if (m[4]) { args.lat = +m[4]; args.lon = +m[5]; } if (m[6]) { const d = findDate(m[6]); if (!d) return null; args.date = iso(d.d); } return args;
  },
  topic: () => ['Declination', 1],
  run: a => {
    const read = [{ v: p3(a.v) }, a.from, 'to', a.to];
    if (a.from === a.to) return { read, body: [{ t: 'big', v: p3(a.v) }], trace: ['same north on both sides'] };
    if (a.from === 'grid' || a.to === 'grid') return { read, body: [{ t: 'note', kind: 'err', text: 'Grid north needs the UTM convergence at the place, which is not built yet. Magnetic to true and back work.' }], trace: ['grid convergence: not built'] };
    if (a.lat == null) return { read, body: [whereNote], trace: ['declination needs a place'] };
    const { d, f } = decl(a), out = ((a.from === 'magnetic' ? a.v + f.decl : a.v - f.decl) % 360 + 360) % 360;
    return {
      read: [{ v: p3(a.v) }, a.from, 'to', a.to, 'at', { v: `${a.lat}, ${a.lon}` }], value: out,
      body: [{ t: 'big', v: fmt(out, 4), unit: `° ${a.to}` }, { t: 'kv', rows: [['declination', `${fmt(Math.abs(f.decl), 3)}° ${dirWord(f.decl)} on ${fmtDate(d)}`], ['applied', `${a.from} ${a.from === 'magnetic' ? '+' : '−'} declination`]] }, SRC(f)],
      trace: [`wmm.field(${a.lat}, ${a.lon}, ${fmt(f.year, 6)}) → declination ${fmt(f.decl, 5)}°`, `${a.v} ${a.from === 'magnetic' ? '+' : '−'} ${fmt(f.decl, 5)} = ${fmt(out, 5)}`], py: `wmm.to_${a.to}(${a.v}, ${a.lat}, ${a.lon}, "${iso(d)}")`
    };
  }
});

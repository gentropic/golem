// Magnetic declination from @gcu/wmm (vendored WMM2025), and bearings between magnetic and true north.
// A place is coordinates in the request; device location stays off (SPEC-skills 0.7).
import { tool, frame, noun, qmod, clock, fmt, iso, p3, azi, STYLE } from './core.js';
import { field, MODEL, VALID_FROM, VALID_TO } from '../vendor/wmm.js';
import { findDate, fmtDate, dateWords } from './dates.js';

const LL = '(-?\\d{1,2}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)';
const whereNote = { t: 'note', kind: 'err', text: 'Where? Give coordinates, as in "declination at -19.92, -43.94". Device location stays off.' };
const dateOf = a => a.date ? new Date(a.date) : clock.now();
const decl = (a) => { const d = dateOf(a), f = field(a.lat, a.lon, { date: d }); return { d, f }; };
const dirWord = x => x < 0 ? 'west' : 'east';
const SRC = f => ({ t: 'src', text: `@gcu/wmm · vendored · ${MODEL}, valid ${VALID_FROM} to ${VALID_TO}${f.valid ? '' : ' · outside the validity window'}` });

tool({
  name: 'declination',
  skill: { group: 'Field', title: 'Magnetic declination', on: '@gcu/wmm', about: 'The World Magnetic Model at a place and date, and magnetic to true bearings.', examples: ['declination at -19.92, -43.94', '045 magnetic to true at -19.92, -43.94'] },
  topic: () => ['Declination', 2],
  run: a => {
    // "here": the card asks for one position fix (lead-acid's gnss in the app, the browser's geolocation elsewhere; asked
    // for on the tap), kept in args
    if (a.here) return { read: ['declination', { v: 'here' }], capture: { kind: 'position', set: (args, v) => { delete args.here; args.lat = +(+v.lat).toFixed(5); args.lon = +(+v.lon).toFixed(5); args.fix = { acc: v.acc == null ? null : Math.round(+v.acc), at: +v.at || 0 }; } },
      body: [{ t: 'capture', kind: 'position', how: 'One position fix, kept with this card. golem sends it nowhere.' }, { t: 'sub', text: 'Without a position (no location here, or the permission refused), give coordinates, as in "declination at -19.92, -43.94".' }], trace: ['wait: a position fix (the app\'s GNSS or the browser\'s geolocation), or coordinates'] };
    if (Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180) return null;
    const { d, f } = decl(a);
    return {
      read: ['declination at', { v: `${a.lat}, ${a.lon}` }, ...(a.fix ? [{ v: `here, ±${a.fix.acc == null ? '?' : a.fix.acc} m` }] : []), 'on', { v: fmtDate(d) }], value: f.decl,
      body: [{ t: 'big', v: `${fmt(Math.abs(f.decl), 3)}° ${dirWord(f.decl)}`, unit: 'declination' },
        ...(f.valid ? [] : [{ t: 'note', kind: 'err', text: `${fmtDate(d)} is outside ${MODEL}'s window (${VALID_FROM} to ${VALID_TO}); the value is extrapolated and may be off.` }]),
        { t: 'kv', rows: [['inclination', `${fmt(f.incl, 3)}°`], ['total intensity', `${fmt(f.f, 5)} nT`], ['horizontal', `${fmt(f.h, 5)} nT`], ['annual change', `${fmt(f.ddot, 3)}°/year in declination`]] }, SRC(f)],
      trace: [`wmm.field(${a.lat}, ${a.lon}, ${fmt(f.year, 6)})`, `declination ${fmt(f.decl, 5)}° (east positive)`], py: `wmm.declination(${a.lat}, ${a.lon}, "${iso(d)}")`
    };
  }
});
tool({
  name: 'bearing',
  topic: () => ['Declination', 1],
  run: a => {
    const read = [{ v: p3(a.v) }, a.from, 'to', a.to];
    if (a.from === a.to) return { read, body: [{ t: 'big', v: p3(a.v) }], trace: ['same north on both sides'] };
    if (a.from === 'grid' || a.to === 'grid') return { read, body: [{ t: 'note', kind: 'err', text: 'Grid north needs the UTM convergence at the place, which is not built yet. Magnetic to true and back work.' }], trace: ['grid convergence: not built'] };
    if (a.lat == null) return { read, body: [whereNote], trace: ['declination needs a place'] };
    const { d, f } = decl(a), out = ((a.from === 'magnetic' ? a.v + f.decl : a.v - f.decl) % 360 + 360) % 360;
    return {
      read: [{ v: p3(a.v) }, a.from, 'to', a.to, 'at', { v: `${a.lat}, ${a.lon}` }], value: out,
      body: [STYLE.bearing === 'quadrant' ? { t: 'big', v: azi(out), unit: a.to } : { t: 'big', v: fmt(out, 4), unit: `° ${a.to}` }, { t: 'kv', rows: [['declination', `${fmt(Math.abs(f.decl), 3)}° ${dirWord(f.decl)} on ${fmtDate(d)}`], ['applied', `${a.from} ${a.from === 'magnetic' ? '+' : '−'} declination`]] }, SRC(f)],
      trace: [`wmm.field(${a.lat}, ${a.lon}, ${fmt(f.year, 6)}) → declination ${fmt(f.decl, 5)}°`, `${a.v} ${a.from === 'magnetic' ? '+' : '−'} ${fmt(f.decl, 5)} = ${fmt(out, 5)}`], py: `wmm.to_${a.to}(${a.v}, ${a.lat}, ${a.lon}, "${iso(d)}")`
    };
  }
});
/* ── what reads them: "declination at -19.92, -43.94", "045 magnetic to true at -19.92, -43.94" ── */
const llOf = n => { const m = n && n.type === 'coords' && /^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(n.value); return m ? { lat: +m[1], lon: +m[2] } : null; };
const dateArg = n => { if (!n) return {}; const d = findDate(dateWords(n)); return d ? { date: iso(d.d) } : null; };
frame({
  name: 'declination', label: 'Declination', words: ['declination', 'magnetic declination'], theme: [], required: [],
  roles: { at: { preps: ['at', 'for', 'in', ''], types: ['coords', 'place'] }, on: { preps: ['on', 'for'], types: ['date', 'holiday'] } },
  words_pt: ['declinação', 'declinacao', 'declinação magnética'], label_pt: 'Declinação',
  bind: c => { const at = c.roles.at && c.roles.at[0]; if (!at || at.value === 'here') return { tool: 'declination', args: { here: true } }; const ll = llOf(at), d = dateArg(c.roles.on && c.roles.on[0]); return ll && d ? { tool: 'declination', args: { ...ll, ...d } } : null; }
});
noun({ type: 'north', words: { magnetic: ['magnetic', 'magnetic north'], true: ['true', 'true north'], grid: ['grid', 'grid north'] }, words_pt: { magnetic: ['magnético', 'magnetico'], true: ['verdadeiro'], grid: ['quadrícula', 'quadricula'] } });
qmod({ head: 'north', attr: 'bearing', dims: ['bare', 'angle'] });   // "045 magnetic"
frame({
  name: 'bearing', label: 'Bearing', words: ['convert'], elidable: true, theme: ['north'], required: ['theme', 'to'],
  roles: { to: { preps: ['to', 'into', 'as'], types: ['north'] }, at: { preps: ['at', 'for', 'in'], types: ['coords'] }, on: { preps: ['on'], types: ['date', 'holiday'] } }, label_pt: 'Rumo',
  bind: c => { const b = c.theme[0].attrs && c.theme[0].attrs.bearing; if (!b) return null; const ll = llOf(c.roles.at && c.roles.at[0]), d = dateArg(c.roles.on && c.roles.on[0]); if (!d) return null;
    return { tool: 'bearing', args: { v: b.n, from: c.theme[0].value, to: c.roles.to[0].value, ...(ll || {}), ...d } }; }
});

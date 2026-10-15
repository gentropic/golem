// Field capture (SPEC 13, the field skills): a plane or a line measured with the phone, as a compass-clinometer is
// used. The card asks for a reading (res.capture); the shell streams the phone's orientation (in the lead-acid app the
// fused rotation vector, in a phone's browser the north-referenced deviceorientation events) and, when the person takes the reading, hands the device angles back through capture() in engine.js,
// which writes them into args. From then on the card is plain arithmetic over args, like any other: bearing's compass
// functions turn the angles into dip direction/dip or trend/plunge. North is magnetic as measured; with a saved home,
// golem corrects it to true with the World Magnetic Model and keeps the correction in args, so a replay agrees.
import { tool, frame, noun, fmt, p3, p2, S, clock } from './core.js';
import { compass } from '../vendor/bearing.js';
import { field } from '../vendor/wmm.js';
import { fmtDate } from './dates.js';

const ACC = { 3: 'high', 2: 'medium', 1: 'low', 0: 'unreliable: move the phone in a figure of eight to calibrate', '-1': 'no contact with the sensor' };
const KIND = { plane: { label: 'plane', unit: 'dip direction/dip' }, line: { label: 'line', unit: 'trend/plunge' } };
const ori = (a, b) => `${p3(a)}/${p2(b)}`;
// The device's angles (W3C deviceorientation) to a plane or a line: bearing's compass. plane: the screen's normal (the
// device z axis); line: the phone's long edge (the device y axis); lower hemisphere. Until bearing 0.2.4 these read 180°
// off (a phone facing north with its top edge raised 30° gave 000/30; the plane dips 180/30), and golem did the
// arithmetic itself; the cases worked by hand in test/field.test.mjs still hold it.
export const fromDevice = (what, alpha, beta, gamma) => what === 'line' ? compass.lineFromDeviceOrientation(alpha, beta, gamma) : compass.planeFromDeviceOrientation(alpha, beta, gamma);

// what the setter freezes at the moment of the reading: the declination at home, if a home is saved
function declAt(ms) {
  const home = (S.tables.places ? S.tables.places.rows : []).find(r => r.name === 'home'); if (!home) return null;
  const f = field(home.lat, home.lon, { date: ms ? new Date(ms) : clock.now() });
  return { decl: f.decl, lat: home.lat, lon: home.lon };
}

tool({
  name: 'measure',
  skill: { group: 'Field', title: 'Compass capture', on: 'the phone\'s compass · @gcu/bearing', about: 'Measure a plane or a line with the phone, as with a compass-clinometer: lay its back on the plane, or its long edge along the line, and take the reading. On a phone, in the app or the browser; magnetic north, or true with a saved home.', examples: ['measure bedding', 'measure a lineation'] },
  topic: a => [a.what === 'line' ? 'Line measured' : 'Plane measured', 2],
  run: a => {
    const k = KIND[a.what] || KIND.plane, name = a.name || k.label;
    const read = ['measure', { v: name }, 'with the phone'];
    const capture = { kind: a.what === 'line' ? 'line' : 'plane', set: (args, v) => { args.reading = { alpha: +v.alpha, beta: +v.beta, gamma: +v.gamma, acc: v.acc == null ? null : +v.acc, spread: v.spread == null ? null : +v.spread, at: +v.at || 0, ...(v.via === 'browser' ? { via: 'browser' } : {}) }; const d = declAt(args.reading.at); if (d) args.north = d; else delete args.north; } };
    if (!a.reading) return {
      read, capture,
      body: [{ t: 'capture', kind: capture.kind, how: a.what === 'line' ? 'Lay the phone\'s long edge along the line and hold it still.' : 'Lay the phone\'s back flat on the plane, screen up, and hold it still.' },
        { t: 'sub', text: 'Measuring needs a phone\'s compass: the golem app, or a phone\'s browser that tells golem where north is. Elsewhere, type the plane, as in "plane 045/30".' }],
      trace: ['wait: a reading from the phone\'s compass (the app\'s rotation vector, or the browser\'s deviceorientation)']
    };
    const r = a.reading, [n1, m2] = fromDevice(a.what, r.alpha, r.beta, r.gamma), m1 = ((n1 % 360) + 360) % 360, corr = a.north ? a.north.decl : 0, t1 = ((m1 + corr) % 360 + 360) % 360;
    const when = r.at ? new Date(r.at) : null;
    const rows = [['north', a.north ? `true: corrected by ${fmt(Math.abs(corr), 3)}° ${corr < 0 ? 'west' : 'east'} (WMM at home, ${fmt(a.north.lat, 5)}, ${fmt(a.north.lon, 5)})` : 'magnetic, as the phone measured it. Save a home ("home is -19.92, -43.94") and golem corrects to true'],
      ...(a.north ? [['as measured', `${ori(m1, m2)} magnetic`]] : []),
      ['compass accuracy', ACC[r.acc] || (r.via === 'browser' ? 'not reported: the browser does not say' : 'not reported')], ...(r.spread != null ? [['steadiness', `±${fmt(r.spread, 2)}° over the last second`]] : []),
      ...(when ? [['taken', `${fmtDate(when)}, ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`]] : [])];
    const net = a.what === 'line' ? { t: 'net', planes: [], lines: [{ tr: t1, pl: m2, label: name }] } : { t: 'net', planes: [{ dd: t1, dip: m2 }], lines: [] };
    return {
      read: ['measured', { v: name }, 'with the phone'], value: [t1, m2],
      body: [{ t: 'big', v: ori(t1, m2), unit: `${k.unit}${a.north ? ' (true)' : ' (magnetic)'}` }, net, { t: 'kv', rows },
        ...(r.acc != null && r.acc < 2 ? [{ t: 'note', kind: 'err', text: 'The phone reported its compass as low or unreliable when this was taken: move it in a figure of eight, away from steel, and measure again.' }] : []),
        { t: 'src', text: `@gcu/bearing · vendored · the device orientation matrix, ${a.what === 'line' ? 'its long edge' : 'its screen normal'} to the lower hemisphere · ${r.via === 'browser' ? 'the browser\'s deviceorientation, north-referenced' : 'the phone\'s fused rotation vector'}` }],
      trace: [`device orientation α ${fmt(r.alpha, 5)}°, β ${fmt(r.beta, 5)}°, γ ${fmt(r.gamma, 5)}° (accuracy ${r.acc})`, `bearing: device ${a.what === 'line' ? 'y axis' : 'z axis'} in east, north, up → ${ori(m1, m2)} magnetic`, a.north ? `+ declination ${fmt(corr, 5)}° (WMM at home) → ${ori(t1, m2)} true` : 'north: magnetic (no home saved)'],
      py: `bearing.from_device("${a.what === 'line' ? 'line' : 'plane'}", ${fmt(r.alpha, 6)}, ${fmt(r.beta, 6)}, ${fmt(r.gamma, 6)})${a.north ? ` + ${fmt(corr, 6)}  # declination` : ''}`
    };
  }
});

// "measure bedding", "measure a plane", "take a reading of this joint", "measure the lineation", "compass": the noun is what
// was measured, and says whether it is a plane or a line
const LINES = new Set(['line', 'lineation', 'fold axis', 'striation']);
const forms = w => [w, 'a ' + w, 'the ' + w, 'this ' + w];
noun({ type: 'measurable', words: { plane: [...forms('plane'), 'surface'], bedding: forms('bedding'), foliation: forms('foliation'), cleavage: forms('cleavage'), joint: forms('joint'), fault: forms('fault'), contact: forms('contact'), vein: forms('vein'),
    line: forms('line'), lineation: forms('lineation'), 'fold axis': forms('fold axis'), striation: [...forms('striation'), ...forms('slickenline')] },
  words_pt: { plane: ['plano'], bedding: ['acamamento'], foliation: ['foliação'], joint: ['fratura'], fault: ['falha'], contact: ['contato'], vein: ['veio'], line: ['linha'], lineation: ['lineação'], 'fold axis': ['eixo de dobra'], striation: ['estria'] } });
frame({
  name: 'measure', label: 'Measure', words: ['measure', 'take a reading of', 'take a reading', 'capture', 'clino', 'compass', 'measure with the phone'], theme: ['measurable'], required: [],
  roles: {}, words_pt: ['mede', 'medir', 'mede com o celular'], label_pt: 'Medir',
  bind: c => {
    const v = c.theme[0] ? c.theme[0].value : 'plane';
    return { tool: 'measure', args: { what: LINES.has(v) ? 'line' : 'plane', ...(v !== 'plane' && v !== 'line' ? { name: v } : {}) } };
  }
});

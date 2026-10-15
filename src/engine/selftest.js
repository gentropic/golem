// "check yourself" (SPEC 13: things you can trust). A battery of answers known from outside golem's code, run on this
// device without touching the session: exact unit factors by definition, SHA-256's published test vector, NOAA's own
// test point for the World Magnetic Model, a degree of longitude on the WGS84 equator, a molar mass summed by hand from
// the weights table, the compass cases worked by hand, a Fisher mean, dimensional search, a formula solved both ways;
// and every starter read (dry: nothing runs) in both languages. Then what this device holds: the packs and their
// versions. A failure is shown as what was expected and what came out; nothing is hidden or rounded away.
import { tool, frame, fmt } from './core.js';
import { parseUnit } from './units.js';
import { sha256 } from './convert.js';
import { parseFormula, molarMass } from './chem.js';
import { vincenty } from './places.js';
import { fromDevice } from './field.js';
import { quantitiesOf, combos, roots, FORMULAS } from './reckon.js';
import { conversions, statistics } from '../vendor/bearing.js';
import { field as wmm, MODEL } from '../vendor/wmm.js';
import { STARTERS, STARTERS_PT } from './skills.js';
import { readingOf, setLanguage, language } from './reading.js';
import { factbookInfo } from './factbook.js';
import { mineralsInfo } from './minerals.js';
import { bookInfo } from './books.js';

const near = (got, want, tol) => typeof got === 'number' && Math.abs(got - want) <= tol;
const deg = ([a, b]) => `${String(Math.round(((a % 360) + 360) % 360)).padStart(3, '0')}/${String(Math.round(b)).padStart(2, '0')}`;
// [what, source, expected (shown), () => got, ok(got)]
const CHECKS = [
  ['1 mile in metres', 'the international mile (1959)', '1609.344', () => parseUnit('mi').f, g => g === 1609.344],
  ['1 pound in kilograms', 'the avoirdupois pound (1959)', '0.45359237', () => parseUnit('lb').f, g => g === 0.45359237],
  ['1 troy ounce in grams', 'the troy ounce', '31.1034768', () => parseUnit('troy oz').f * 1000, g => near(g, 31.1034768, 1e-9)],
  ['SHA-256 of "abc"', 'FIPS 180-2, appendix B.1', 'ba7816bf…f20015ad', () => String(sha256(new TextEncoder().encode('abc'))), g => g === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['molar mass of CuFeS₂', 'Cu 63.546 + Fe 55.845 + 2 × S 32.06 (CIAAW, the weights table)', '183.511 g/mol', () => molarMass(parseFormula('CuFeS2').counts).total, g => near(g, 63.546 + 55.845 + 2 * 32.06, 1e-9)],
  ['declination at 80° N 0° E, 2025.0', `NOAA's test values for ${MODEL}`, '1.28°', () => wmm(80, 0, { date: new Date(Date.UTC(2025, 0, 1)) }).decl, g => near(g, 1.28, 0.01)],
  ['1° of longitude on the equator', 'WGS84: a × π / 180', '111 319.491 m', () => vincenty(0, 0, 0, 1).s, g => near(g, 6378137 * Math.PI / 180, 1e-3)],
  ['phone facing north, top edge raised 30°', 'worked by hand: the plane dips south', '180/30', () => deg(fromDevice('plane', 0, 30, 0)), g => g === '180/30'],
  ['phone top toward 260°, raised 30°', 'worked by hand', '080/30', () => deg(fromDevice('plane', 100, 30, 0)), g => g === '080/30'],
  ['top edge north, lowered 30° (a line)', 'worked by hand: it plunges north', '000/30', () => deg(fromDevice('line', 0, -30, 0)), g => g === '000/30'],
  ['Fisher mean of lines 000/00 and 090/00', 'symmetry: halfway', '045/00', () => deg(conversions.dcosToLine(statistics.fisherStats([conversions.lineToDcos(0, 0), conversions.lineToDcos(90, 0)]).mean)), g => g === '045/00'],
  ['time to drill 300 m at 25 m/h', 'length ÷ speed', '12 h', () => { const qs = quantitiesOf('300 m at 25 m/h'), [c] = combos(qs, { T: 1 }); return c ? qs.reduce((v, q, j) => c.e[j] ? v * Math.pow(q.si, c.e[j]) : v, 1) / 3600 : null; }, g => near(g, 12, 1e-12)],
  ['two-product recovery, feed 2.1 %, conc 28 %, tail 0.3 %', '100 × 28 × 1.8 / (2.1 × 27.7)', '86.6426 %', () => roots(FORMULAS.twoproduct, 'R', { f: 2.1, c: 28, t: 0.3 })[0], g => near(g, 100 * 28 * 1.8 / (2.1 * 27.7), 1e-6)],
  ['…and back: the feed grade for 86.6426 %', 'the same equation solved for f', '2.1 %', () => roots(FORMULAS.twoproduct, 'f', { R: 100 * 28 * 1.8 / (2.1 * 27.7), c: 28, t: 0.3 })[0], g => near(g, 2.1, 1e-6)],
];
// every starter reads, in its language, without running
function starters() {
  const was = language(), out = [];
  for (const [lang, groups] of [['en', STARTERS], ['pt', STARTERS_PT]]) {
    setLanguage(lang);
    for (const [, items] of groups) for (const [, q] of items) { let r = null; try { r = readingOf(q, null); } catch (e) { r = null; } if (!r || !['grammar', 'context', 'taught'].includes(r.rung)) out.push(`${lang}: ${q}`); }
  }
  setLanguage(was);
  return { n: STARTERS.concat(STARTERS_PT).reduce((s, [, items]) => s + items.length, 0), bad: out };
}

tool({
  name: 'selftest',
  skill: { group: 'Session', title: 'Check yourself', on: 'known answers', about: 'A battery of answers known from outside golem — exact unit factors, SHA-256\'s test vector, NOAA\'s magnetic-model test point, a degree of longitude, the compass cases worked by hand, a formula solved both ways — and every starter read, run on this device. Then the packs it holds, with their versions.', examples: ['check yourself'] },
  topic: () => ['Self-check', .5],
  run: () => {
    const t0 = Date.now(), rows = [], fails = [];
    for (const [what, src, want, f, ok] of CHECKS) {
      let got, pass = false; try { got = f(); pass = !!ok(got); } catch (e) { got = `error: ${e.message || e.bad || e}`; }
      const shown = typeof got === 'number' ? fmt(got, 10) : String(got);
      rows.push([what, want, shown, pass ? 'pass' : 'FAIL']); if (!pass) fails.push(what);
    }
    const st = starters(); if (st.bad.length) fails.push(`${st.bad.length} starters`);
    rows.push([`every starter reads (${st.n})`, 'each one, in its language', st.bad.length ? `${st.bad.length} do not: ${st.bad.join('; ')}` : `${st.n} of ${st.n}`, st.bad.length ? 'FAIL' : 'pass']);
    const fb = factbookInfo(), mi = mineralsInfo(), ods = bookInfo('ods'), sty = bookInfo('elements-of-style');
    const held = [['Factbook', fb.kind === 'pack' ? `pack ${fb.version}, ${fb.count} countries` : `the sample, ${fb.count} countries`], ['minerals', mi.kind === 'pack' ? `pack ${mi.version}, ${mi.count} species` : `the sample, ${mi.count} species`],
      ['Open Data Structures', ods.kind === 'pack' ? `pack ${ods.version || ''}`.trim() : 'the sample index'], ['The Elements of Style', sty.kind === 'pack' ? `pack ${sty.version || ''}`.trim() : 'the sample checks'], ['magnetic model', MODEL]];
    const n = rows.length, bad = rows.filter(r => r[3] === 'FAIL').length;
    return { read: ['check myself'], value: n - bad,
      body: [{ t: 'big', v: `${n - bad} of ${n}`, unit: bad ? `checks pass: ${bad} failed` : 'checks pass' },
        ...(bad ? [{ t: 'note', kind: 'err', text: `Failed: ${fails.join('; ')}. Do not rely on those answers on this device until it is fixed.` }] : [{ t: 'note', kind: 'ok', text: 'Every known answer came out as it should, on this device, just now.' }]),
        { t: 'table', head: ['check', 'expected', 'got', ''], rows }, { t: 'lbl', text: 'What this device holds' }, { t: 'kv', rows: held }],
      trace: [`${CHECKS.length} known answers, ${st.n} starters read dry, in ${Date.now() - t0} ms`, 'no card or session touched'] };
  }
});
frame({
  name: 'selftest', label: 'Check yourself', words: ['check yourself', 'test yourself', 'self test', 'self-test', 'run your checks', 'run a self check', 'are you working', 'are you ok', 'are you okay'], theme: [], required: [], roles: {},
  words_pt: ['verifica a si mesmo', 'se testa', 'autoteste', 'faça um autoteste', 'você está funcionando'], label_pt: 'Autoteste',
  bind: () => ({ tool: 'selftest', args: {} })
});

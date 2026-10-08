// Oracle tests: golem's own arithmetic against the GCU packages it is meant to stand on, imported
// from the sibling clone of gentropic/auditable when it is there (skipped otherwise). SPEC.md section
// 13 step 5 says to check each mock result against the package result before deleting mock code;
// this is that check, kept so the two cannot drift apart unnoticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseUnit } from '../src/engine/units.js';
import { vLine, vPole } from '../src/engine/orientation.js';
import { rad } from '../src/engine/core.js';
import { makeData, composite, downhole, stats } from '../src/engine/table.js';
import * as g from '../src/engine/index.js';

const EXT = new URL('../../auditable/ext/', import.meta.url);
const have = existsSync(fileURLToPath(EXT));
const pkg = async p => (await import(new URL(p, EXT).href));
const close = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${what}: golem ${a} vs package ${b}`);

test('@gcu/units agrees with golem on the units both know (to the package\'s six figures)', { skip: !have && 'no sibling auditable clone' }, async () => {
  const { convert } = await pkg('units/src/main.js');
  // [value, golem from, golem to, units from, units to]
  const cases = [[0.35, 'oz per short ton', 'g/t', 'oz/t', 'g/t'], [2.7, 'g/cm3', 'lb/ft3', 'g/cm3', 'lb/ft3'], [1, 'short ton', 'kg', 'st', 'kg'], [1, 'troy oz', 'g', 'ozt', 'g'],
    [7741220, 'km2', 'ha', 'km2', 'ha'], [100, 'ft', 'm', 'ft', 'm'], [1.5, '%', 'ppm', 'pct', 'ppm'], [3, 'oz (av)', 'g', 'oz', 'g'], [1, 'mi', 'km', 'mi', 'km']].filter(c => c[3] !== 'mi');
  for (const [v, a, b, ua, ub] of cases) {
    const f = parseUnit(a, 'troy'), t = parseUnit(b, 'troy');
    const mine = (v + f.off) * f.f / t.f - t.off;
    close(mine, convert(v, ua, ub), 5e-5, `${v} ${a} → ${b}`);
  }
  // the package has no troy/avoirdupois split, no imperial pressure, no temperature, no sq mi:
  // golem keeps its own table for those. If this starts passing, the package grew and the table can shrink.
  for (const [a, b] of [['psi', 'MPa'], ['C', 'F'], ['km2', 'sq mi']]) assert.throws(() => convert(1, a, b), `units now knows ${a} → ${b}`);
});

test('@gcu/bearing agrees with golem on the thickness factor and the equal-area projection', { skip: !have && 'no sibling auditable clone' }, async () => {
  const { conversions, vec3, equalArea } = await pkg('bearing/index.js');
  for (const [tr, pl, dd, dip] of [[270, 60, 45, 30], [200, 60, 45, 30], [0, 90, 120, 55], [135, 20, 300, 80]]) {
    const h = vLine(tr, pl), n = vPole(dd, dip);
    const mine = Math.abs(h[0] * n[0] + h[1] * n[1] + h[2] * n[2]);
    const theirs = Math.abs(vec3.dot(conversions.lineToDcos(tr, pl), conversions.planeToDcos(dd, dip)));
    close(mine, theirs, 1e-12, `|hole · pole| for hole ${tr}/${pl}, plane ${dd}/${dip}`);
    // golem projects to a disc of radius R with screen y down; bearing to radius √2 with north up
    const r = Math.SQRT2 * Math.sin(rad((90 - pl) / 2)), mx = r * Math.sin(rad(tr)), my = -r * Math.cos(rad(tr));
    const [bx, by] = equalArea.project(conversions.lineToDcos(tr, pl)).map(v => v / Math.SQRT2);
    close(mx, bx, 1e-12, `projection x of ${tr}/${pl}`); close(my, -by, 1e-12, `projection y of ${tr}/${pl}`);
  }
});

test('@gcu/gsjs reproduces golem\'s downhole variogram on the sample table', { skip: !have && 'no sibling auditable clone' }, async () => {
  const { experimental } = await pkg('gsjs/index.js');
  for (const L of [2, 3]) {
    const { comps } = composite(makeData(), 'cu', L), mine = downhole(comps, L);
    const pts = [], hole = [];
    Object.entries(comps).forEach(([h, c], hi) => c.forEach((v, i) => { if (v != null) { pts.push([hi * 1e4, 0, (i + 0.5) * L, v]); hole.push(h); } }));
    const theirs = experimental(pts, { holeId: hole, lags: { size: L, n: 12 }, directions: [{ mode: 'downhole' }], estimator: 'matheron' }).directions[0].lags;
    mine.forEach((l, i) => {
      const t = theirs[i + 2];   // gsjs lag bins: 0 coincident, il ≥ 1 centred at (il − 1) · size
      assert.equal(t.h, l.h, `lag distance ${l.h}`);
      close(l.g, t.gamma, 1e-9, `γ(${l.h} m) at ${L} m composites`);
      assert.equal(t.npair, 2 * l.np, `pairs at ${l.h} m (gamv counts both directions)`);
    });
  }
});

test('@gcu/sadpan agrees with golem\'s summary statistics', { skip: !have && 'no sibling auditable clone' }, async () => {
  const { series } = await pkg('sadpan/src/api.js');
  const v = makeData().map(r => r.cu).filter(x => x > 0), s = series(v), st = stats(v);
  close(st.mean, s.mean(), 1e-12, 'mean'); close(st.med, s.median(), 1e-12, 'median'); close(st.sd, s.std(), 1e-12, 'standard deviation');
  assert.equal(st.min, s.min()); assert.equal(st.max, s.max()); assert.equal(st.n, s.count());
});

test('@gcu/drillhole reproduces golem length-weighted composites', { skip: !have && 'no sibling auditable clone' }, async () => {
  const dh = await pkg('drillhole/index.js');
  const all = makeData(), data = all.filter(r => r.cu > 0), L = 2, holes = [...new Set(all.map(r => r.hole))];
  const mine = composite(all, 'cu', L).comps;
  // vertical holes from the origin: the desurvey is trivial and only the compositing is under test
  const { header, rows } = dh.process({
    collars: holes.map(h => ({ bhid: h, x: 0, y: 0, z: 0, eoh: Math.max(...all.filter(r => r.hole === h).map(r => r.to)) })),
    surveys: holes.map(h => ({ bhid: h, depth: 0, az: 0, dip: 90 })),
    intervals: { bhid: data.map(r => r.hole), from: data.map(r => r.from), to: data.map(r => r.to), cols: [{ name: 'CU', type: 'num', values: data.map(r => r.cu) }] }
  }, { compositeLength: L, minCoverage: 0.5 });
  const col = Object.fromEntries(header.map((k, i) => [k, i]));
  for (const h of holes) {
    // golem keeps only full-length windows; drillhole also emits the short tail, which golem's loop drops
    const theirs = rows.filter(r => r[col.BHID] === h && Math.abs(r[col.TO] - r[col.FROM] - L) < 1e-9).map(r => r[col.CU]);
    const mineVals = mine[h].filter(v => v != null);
    assert.equal(theirs.length, mineVals.length, `composite count for ${h}`);
    theirs.forEach((v, i) => close(mineVals[i], v, 1e-9, `${h} composite ${i}`));
  }
});

test('the engine still answers after the oracles ran', () => { g.reset(); assert.equal(g.submit('2 km in miles').card.tool, 'convert'); });

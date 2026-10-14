// Oracle tests: golem's own arithmetic against the GCU packages it does not vendor yet, imported from
// the sibling clone of gentropic/auditable when it is there (skipped otherwise). SPEC.md section 13
// step 5 says to check each mock result against the package result before deleting mock code; this is
// that check. bearing, sadpan and units passed it and are vendored now (units since 14 Oct 2026: golem's conversion
// factors are the package's; this test holds the vendored copy to the sibling's source).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseUnit } from '../src/engine/units.js';
import * as g from '../src/engine/index.js';

const EXT = new URL('../../auditable/ext/', import.meta.url);
const have = existsSync(fileURLToPath(EXT));
const pkg = async p => (await import(new URL(p, EXT).href));
const close = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${what}: golem ${a} vs package ${b}`);

test('@gcu/units agrees with golem on every unit golem reads (exact factors, to 1e-12)', { skip: !have && 'no sibling auditable clone' }, async () => {
  const { convert } = await pkg('units/src/main.js');
  // [value, golem from, golem to, units from, units to]
  const cases = [[0.35, 'oz per short ton', 'g/t', 'oz/t', 'g/t'], [2.7, 'g/cm3', 'lb/ft3', 'g/cm3', 'lb/ft3'], [1, 'short ton', 'kg', 'st', 'kg'], [1, 'troy oz', 'g', 'ozt', 'g'],
    [7741220, 'km2', 'ha', 'km2', 'ha'], [100, 'ft', 'm', 'ft', 'm'], [1.5, '%', 'ppm', 'pct', 'ppm'], [3, 'oz (av)', 'g', 'oz', 'g'], [1, 'mi', 'km', 'mi', 'km'],
    [1500, 'psi', 'MPa', 'psi', 'MPa'], [100, '°C', '°F', 'C', 'F'], [-40, '°F', 'K', 'F', 'K'], [1, 'sq mi', 'km2', 'mi2', 'km2'], [640, 'acre', 'sq mi', 'acre', 'mi2'],
    [42, 'gal', 'bbl', 'gal', 'bbl'], [1, 'ft3', 'L', 'ft3', 'L'], [90, 'min', 'h', 'min', 'h'], [5, 'ct', 'g', 'ct', 'g'], [1, 'long ton', 'short ton', 'lt_mass', 'st'], [12, 'inch', 'yd', 'in', 'yd']];
  for (const [v, a, b, ua, ub] of cases) {
    const f = parseUnit(a, 'troy'), t = parseUnit(b, 'troy');
    const mine = (v + f.off) * f.f / t.f - t.off;
    close(mine, convert(v, ua, ub), 1e-12, `${v} ${a} → ${b}`);
  }
});

test('the engine still answers after the oracles ran', () => { g.reset(); assert.equal(g.submit('2 km in miles').card.tool, 'convert'); });

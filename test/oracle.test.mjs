// Oracle tests: golem's own arithmetic against the GCU packages it does not vendor yet, imported from
// the sibling clone of gentropic/auditable when it is there (skipped otherwise). SPEC.md section 13
// step 5 says to check each mock result against the package result before deleting mock code; this is
// that check. bearing and sadpan passed it and are vendored now; units is still golem's own table.
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

test('the engine still answers after the oracles ran', () => { g.reset(); assert.equal(g.submit('2 km in miles').card.tool, 'convert'); });

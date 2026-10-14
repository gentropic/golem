// ⚠ VENDORED — DO NOT EDIT. @gcu/units, copied from ../auditable/ext/units/index.js (built from its src/ by @gcu/build).
// Re-vendor by copying that file here. golem uses its conversion factors (src/engine/units.js keeps the words people
// type), the sieve and the DCDMA core tables.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/units — Unit conversion for length, mass, area, volume, angle, grade, density, and magnetic quantities. Sieve mesh conversions, drill core utilities, formatting helpers.

// ── src/convert.js ──

// Unit dimension registry and convert function. Factors are exact where a definition makes them so: the international
// inch, foot, yard and mile (1959), the avoirdupois pound (0.45359237 kg, 1959) and its ounce, the troy ounce
// (31.1034768 g), the short and long tons, the US gallon (231 in³), the oil barrel (42 gal), the psi (lbf/in²,
// standard gravity), the acre (66 × 660 ft). Temperature is affine: a unit carries an offset as well as a factor.

const PI$convert = Math.PI;
const IN = 0.0254, FT = 0.3048, LB_G = 453.59237, OZT_G = 31.1034768, ST_G = 2000 * LB_G, LT_G = 2240 * LB_G;

const UNITS = {
  // length (canonical: m)
  um:  { dim: 'length', mul: 1e-6 },
  mm:  { dim: 'length', mul: 1e-3 },
  cm:  { dim: 'length', mul: 1e-2 },
  m:   { dim: 'length', mul: 1 },
  km:  { dim: 'length', mul: 1e3 },
  in:  { dim: 'length', mul: IN },
  ft:  { dim: 'length', mul: FT },
  yd:  { dim: 'length', mul: 3 * FT },
  mi:  { dim: 'length', mul: 5280 * FT },

  // mass (canonical: g)
  mg:      { dim: 'mass', mul: 1e-3 },
  g:       { dim: 'mass', mul: 1 },
  kg:      { dim: 'mass', mul: 1e3 },
  t:       { dim: 'mass', mul: 1e6 },
  kt:      { dim: 'mass', mul: 1e9 },
  Mt:      { dim: 'mass', mul: 1e12 },
  st:      { dim: 'mass', mul: ST_G },
  lt_mass: { dim: 'mass', mul: LT_G },
  oz:      { dim: 'mass', mul: LB_G / 16 },
  lb:      { dim: 'mass', mul: LB_G },
  ozt:     { dim: 'mass', mul: OZT_G },
  ct:      { dim: 'mass', mul: 0.2 },

  // concentration / grade (canonical: fraction, dimensionless 0–1)
  fraction: { dim: 'grade', mul: 1 },
  ppm:      { dim: 'grade', mul: 1e-6 },
  ppb:      { dim: 'grade', mul: 1e-9 },
  pct:      { dim: 'grade', mul: 1e-2 },
  'g/t':    { dim: 'grade', mul: 1e-6 },
  'mg/kg':  { dim: 'grade', mul: 1e-6 },
  'oz/t':   { dim: 'grade', mul: OZT_G / ST_G },   // troy oz per short ton
  'oz/lt':  { dim: 'grade', mul: OZT_G / LT_G },   // troy oz per long ton

  // density (canonical: g/cm3)
  'g/cm3':  { dim: 'density', mul: 1 },
  'kg/m3':  { dim: 'density', mul: 1e-3 },
  't/m3':   { dim: 'density', mul: 1 },
  'lb/ft3': { dim: 'density', mul: LB_G / (FT * FT * FT * 1e6) },

  // area (canonical: m2)
  mm2: { dim: 'area', mul: 1e-6 },
  cm2: { dim: 'area', mul: 1e-4 },
  m2:  { dim: 'area', mul: 1 },
  ha:  { dim: 'area', mul: 1e4 },
  km2: { dim: 'area', mul: 1e6 },
  ft2: { dim: 'area', mul: FT * FT },
  acre: { dim: 'area', mul: 43560 * FT * FT },
  mi2: { dim: 'area', mul: (5280 * FT) ** 2 },

  // volume (canonical: m3)
  cm3: { dim: 'volume', mul: 1e-6 },
  L:   { dim: 'volume', mul: 1e-3 },
  m3:  { dim: 'volume', mul: 1 },
  ft3: { dim: 'volume', mul: FT * FT * FT },
  gal: { dim: 'volume', mul: 231 * IN * IN * IN },   // US gallon
  bbl: { dim: 'volume', mul: 42 * 231 * IN * IN * IN },   // oil barrel

  // angle (canonical: rad)
  deg:  { dim: 'angle', mul: PI$convert / 180 },
  rad:  { dim: 'angle', mul: 1 },
  grad: { dim: 'angle', mul: PI$convert / 200 },
  mrad: { dim: 'angle', mul: 1e-3 },

  // magnetic field (canonical: T)
  T:  { dim: 'magnetic', mul: 1 },
  mT: { dim: 'magnetic', mul: 1e-3 },
  uT: { dim: 'magnetic', mul: 1e-6 },
  nT: { dim: 'magnetic', mul: 1e-9 },
  Oe: { dim: 'magnetic', mul: 1e-4 },  // 1 Oe = 1 G = 1e-4 T (free space)

  // pressure (canonical: Pa)
  Pa:  { dim: 'pressure', mul: 1 },
  kPa: { dim: 'pressure', mul: 1e3 },
  MPa: { dim: 'pressure', mul: 1e6 },
  GPa: { dim: 'pressure', mul: 1e9 },
  bar: { dim: 'pressure', mul: 1e5 },
  atm: { dim: 'pressure', mul: 101325 },
  psi: { dim: 'pressure', mul: LB_G / 1000 * 9.80665 / (IN * IN) },

  // time (canonical: s)
  s:   { dim: 'time', mul: 1 },
  min: { dim: 'time', mul: 60 },
  h:   { dim: 'time', mul: 3600 },
  day: { dim: 'time', mul: 86400 },

  // temperature (canonical: K) — affine: K = (value + off) × mul
  K:  { dim: 'temperature', mul: 1, off: 0 },
  C:  { dim: 'temperature', mul: 1, off: 273.15 },
  F:  { dim: 'temperature', mul: 5 / 9, off: 459.67 },
};

function convert(value, from, to, opts) {
  const f = UNITS[from], t = UNITS[to];
  if (!f) throw new Error(`unknown unit: ${from}`);
  if (!t) throw new Error(`unknown unit: ${to}`);
  if (f.dim !== t.dim) throw new Error(`incompatible dimensions: ${f.dim} → ${t.dim}`);
  const factor = f.mul / t.mul, fo = f.off || 0, too = t.off || 0;
  // a factor alone for every dimension but temperature, so those results are bit-for-bit what they were
  const one = fo || too ? v => (v + fo) * factor - too : v => v * factor;
  if (typeof value === 'number') return one(value);
  // typed array / array-like (duck-type on .length + indexing)
  const data = value.data || value;
  if (opts?.inplace) {
    for (let i = 0; i < data.length; i++) data[i] = one(data[i]);
    return value;
  }
  if (typeof data.constructor === 'function' && data.constructor !== Object && typeof data.length === 'number') {
    const out = new data.constructor(data.length);
    for (let i = 0; i < data.length; i++) out[i] = one(data[i]);
    return out;
  }
  // plain array
  const out = new Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = one(data[i]);
  return out;
}

// Convenience aliases
const length = {
  cmToMm: v => convert(v, 'cm', 'mm'),
  mmToCm: v => convert(v, 'mm', 'cm'),
  umToCm: v => convert(v, 'um', 'cm'),
  cmToUm: v => convert(v, 'cm', 'um'),
  ftToM:  v => convert(v, 'ft', 'm'),
  mToFt:  v => convert(v, 'm', 'ft'),
  kmToM:  v => convert(v, 'km', 'm'),
  inToCm: v => convert(v, 'in', 'cm'),
};

const mass = {
  kgToG:  v => convert(v, 'kg', 'g'),
  gToKg:  v => convert(v, 'g', 'kg'),
  tToKg:  v => convert(v, 't', 'kg'),
  lbToKg: v => convert(v, 'lb', 'kg'),
  ozToG:  v => convert(v, 'oz', 'g'),
  oztToG: v => convert(v, 'ozt', 'g'),
};

const grade = {
  oztToGt:       v => convert(v, 'oz/t', 'g/t'),
  gtToOzt:       v => convert(v, 'g/t', 'oz/t'),
  gtToPpm:       v => convert(v, 'g/t', 'ppm'),
  gtToPct:       v => convert(v, 'g/t', 'pct'),
  pctToFraction: v => convert(v, 'pct', 'fraction'),
  fractionToPct: v => convert(v, 'fraction', 'pct'),
};

const density = {
  kgm3ToGcm3: v => convert(v, 'kg/m3', 'g/cm3'),
  gcm3ToKgm3: v => convert(v, 'g/cm3', 'kg/m3'),
};

const area = {
  haToM2:  v => convert(v, 'ha', 'm2'),
  km2ToM2: v => convert(v, 'km2', 'm2'),
  m2ToHa:  v => convert(v, 'm2', 'ha'),
};

const volume = {
  cm3ToM3: v => convert(v, 'cm3', 'm3'),
  lToM3:   v => convert(v, 'L', 'm3'),
  m3ToL:   v => convert(v, 'm3', 'L'),
};

const angle = {
  degToRad:  v => convert(v, 'deg', 'rad'),
  radToDeg:  v => convert(v, 'rad', 'deg'),
  gradToRad: v => convert(v, 'grad', 'rad'),
};

const magnetic = {
  nTToT:  v => convert(v, 'nT', 'T'),
  oeToT:  v => convert(v, 'Oe', 'T'),
  uTToNT: v => convert(v, 'uT', 'nT'),
};

// ── src/sieve.js ──

// Tyler / ASTM mesh ↔ µm lookup table

const TABLE = [
  { mesh: 635, aperture_um: 20 },
  { mesh: 500, aperture_um: 25 },
  { mesh: 450, aperture_um: 32 },
  { mesh: 400, aperture_um: 38 },
  { mesh: 325, aperture_um: 45 },
  { mesh: 270, aperture_um: 53 },
  { mesh: 230, aperture_um: 63 },
  { mesh: 200, aperture_um: 75 },
  { mesh: 170, aperture_um: 90 },
  { mesh: 150, aperture_um: 106 },
  { mesh: 120, aperture_um: 125 },
  { mesh: 100, aperture_um: 150 },
  { mesh: 80,  aperture_um: 180 },
  { mesh: 70,  aperture_um: 212 },
  { mesh: 60,  aperture_um: 250 },
  { mesh: 50,  aperture_um: 300 },
  { mesh: 45,  aperture_um: 355 },
  { mesh: 40,  aperture_um: 425 },
  { mesh: 35,  aperture_um: 500 },
  { mesh: 30,  aperture_um: 600 },
  { mesh: 25,  aperture_um: 710 },
  { mesh: 20,  aperture_um: 850 },
  { mesh: 18,  aperture_um: 1000 },
  { mesh: 16,  aperture_um: 1180 },
  { mesh: 14,  aperture_um: 1400 },
  { mesh: 12,  aperture_um: 1700 },
  { mesh: 10,  aperture_um: 2000 },
  { mesh: 8,   aperture_um: 2360 },
  { mesh: 7,   aperture_um: 2800 },
  { mesh: 6,   aperture_um: 3350 },
  { mesh: 5,   aperture_um: 4000 },
  { mesh: 4,   aperture_um: 4750 },
];

// index by mesh number for O(1) lookup
const BY_MESH = {};
for (const row of TABLE) BY_MESH[row.mesh] = row.aperture_um;

const sieve = {
  toMicrons(mesh) {
    const um = BY_MESH[mesh];
    if (um === undefined) throw new Error(`unknown mesh: ${mesh}`);
    return um;
  },

  toMesh(um) {
    // exact match first
    for (const row of TABLE) {
      if (row.aperture_um === um) return row.mesh;
    }
    // nearest
    let best = TABLE[0], bestDist = Math.abs(TABLE[0].aperture_um - um);
    for (let i = 1; i < TABLE.length; i++) {
      const d = Math.abs(TABLE[i].aperture_um - um);
      if (d < bestDist) { best = TABLE[i]; bestDist = d; }
    }
    return { nearest: best.mesh, exact: false, aperture_um: best.aperture_um };
  },

  toCm(mesh) {
    return sieve.toMicrons(mesh) / 10000;
  },

  table() {
    return TABLE.map(r => ({ ...r }));
  },
};

// ── src/core.js ──

// DCDMA wireline diamond core sizes

const PI$core = Math.PI;   // unitVolume uses it; the module stood on the bundle's copy before

const CORES = [
  { code: 'AQ',  core_mm: 27.0, hole_mm: 48.0,  variant: 'standard' },
  { code: 'BQ',  core_mm: 36.5, hole_mm: 60.0,  variant: 'standard' },
  { code: 'NQ',  core_mm: 47.6, hole_mm: 75.7,  variant: 'standard' },
  { code: 'NQ2', core_mm: 50.6, hole_mm: 75.7,  variant: 'oversize' },
  { code: 'NQ3', core_mm: 45.1, hole_mm: 75.7,  variant: 'triple_tube' },
  { code: 'HQ',  core_mm: 63.5, hole_mm: 96.0,  variant: 'standard' },
  { code: 'HQ3', core_mm: 61.1, hole_mm: 96.0,  variant: 'triple_tube' },
  { code: 'PQ',  core_mm: 85.0, hole_mm: 122.6, variant: 'standard' },
  { code: 'PQ3', core_mm: 83.0, hole_mm: 122.6, variant: 'triple_tube' },
];

const BY_CODE = {};
for (const row of CORES) BY_CODE[row.code] = row;

function lookup(code) {
  const row = BY_CODE[code];
  if (!row) throw new Error(`unknown core code: ${code}`);
  return row;
}

function mmToCm(mm) {
  return Math.round(mm * 100) / 1000;
}

const core = {
  diameter(code) {
    const { core_mm } = lookup(code);
    return { mm: core_mm, cm: mmToCm(core_mm) };
  },

  holeDiameter(code) {
    const { hole_mm } = lookup(code);
    return { mm: hole_mm, cm: mmToCm(hole_mm) };
  },

  halfCoreDiameter(code) {
    const { core_mm } = lookup(code);
    const half = core_mm / 2;
    return { mm: Math.round(half * 10) / 10, cm: mmToCm(half) };
  },

  unitVolume(code, opts) {
    const { core_mm } = lookup(code);
    const d_cm = core_mm / 10;
    // cross-sectional area × 100 cm (1 metre of core)
    let cm3 = PI$core / 4 * d_cm * d_cm * 100;
    const split = opts?.split || 'whole';
    if (split === 'half') cm3 /= 2;
    else if (split === 'quarter') cm3 /= 4;
    return {
      cm3_per_m: Math.round(cm3 * 10) / 10,
      m3_per_m: Math.round(cm3 * 1e-6 * 1e9) / 1e9,
    };
  },

  sampleMass({ code, length_m, density_gcm3, split }) {
    const vol = core.unitVolume(code, { split: split || 'whole' });
    const volume_cm3 = vol.cm3_per_m * length_m;
    const mass_g = volume_cm3 * density_gcm3;
    return {
      mass_g: Math.round(mass_g),
      mass_kg: Math.round(mass_g / 100) / 10,
      volume_cm3: Math.round(volume_cm3 * 10) / 10,
    };
  },

  table() {
    return CORES.map(r => ({ ...r }));
  },
};

// ── src/format.js ──

// Format values with unit labels and auto-scaling


const UNICODE = {
  um: 'µm', m2: 'm²', cm2: 'cm²', mm2: 'mm²', km2: 'km²',
  m3: 'm³', cm3: 'cm³', 'g/cm3': 'g/cm³', 'kg/m3': 'kg/m³',
  't/m3': 't/m³', 'lb/ft3': 'lb/ft³',
};

// Auto-scale chains: try each target in order, pick the first that gives a "nice" value
const SCALE_CHAINS = {
  length: [
    { unit: 'km', min: 1, max: Infinity },
    { unit: 'm',  min: 1, max: 1000 },
    { unit: 'cm', min: 1, max: 100 },
    { unit: 'mm', min: 1, max: 10 },
    { unit: 'um', min: 0, max: Infinity },
  ],
  mass: [
    { unit: 'Mt', min: 1, max: Infinity },
    { unit: 'kt', min: 1, max: 1000 },
    { unit: 't',  min: 1, max: 1000 },
    { unit: 'kg', min: 1, max: 1000 },
    { unit: 'g',  min: 1, max: 1000 },
    { unit: 'mg', min: 0, max: Infinity },
  ],
  density: [
    { unit: 'g/cm3', min: 0, max: Infinity },
  ],
  grade: [
    { unit: 'pct', min: 1, max: Infinity },
    { unit: 'g/t', min: 0.001, max: 10000 },
    { unit: 'ppm', min: 0, max: Infinity },
  ],
};

function format(value, unit, opts) {
  const dec = opts?.decimals;
  let displayUnit = unit;
  let displayValue = value;

  if (opts?.auto) {
    const entry = UNITS[unit];
    if (entry) {
      const chain = SCALE_CHAINS[entry.dim];
      if (chain) {
        for (const step of chain) {
          const v = convert(value, unit, step.unit);
          const abs = Math.abs(v);
          if (abs >= step.min && abs < step.max) {
            displayValue = v;
            displayUnit = step.unit;
            break;
          }
        }
      }
    }
  }

  const numStr = dec !== undefined ? displayValue.toFixed(dec) : String(displayValue);
  const label = UNICODE[displayUnit] || displayUnit;

  if (displayUnit === 'pct') return numStr + '%';
  return numStr + ' ' + label;
}

// ── src/main.js ──

// @gcu/units — entry point

export {
  UNITS,
  convert,
  length,
  mass,
  grade,
  density,
  area,
  volume,
  angle,
  magnetic,
  sieve,
  core,
  format,
};

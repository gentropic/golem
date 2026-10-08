// ⚠ VENDORED — DO NOT EDIT. @gcu/wmm, the World Magnetic Model (WMM2025) evaluated from NOAA's coefficients,
// copied from ../auditable/ext/wmm/index.js. Re-vendor by copying that file here when the model is reissued.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: src/  Build: @gcu/build src/main.js
// @gcu/wmm — The World Magnetic Model (WMM2025), evaluated: geodetic position + date → the main geomagnetic field (X, Y, Z, H, F), inclination, declination, grid variation and their secular variation. Zero dependencies, offline, pinned by NOAA's published test values. The one number a compass needs to turn magnetic north into true north.

// ── src/coefficients.js ──

// @gcu/wmm — WMM2025 Gauss coefficients, GENERATED from NOAA/NCEI WMM2025.COF
// (model WMM-2025, epoch 2025.0, released 11/13/2024; public domain). Do not edit by hand:
// regenerate from the COF when the model changes (every five years).
// Rows: [n, m, g (nT), h (nT), gdot (nT/yr), hdot (nT/yr)], Schmidt semi-normalized.
const EPOCH = 2025.0;
const MODEL = "WMM-2025";
const DEGREE = 12;
const COEFFICIENTS = [
  [1, 0, -29351.8, 0.0, 12.0, 0.0],
  [1, 1, -1410.8, 4545.4, 9.7, -21.5],
  [2, 0, -2556.6, 0.0, -11.6, 0.0],
  [2, 1, 2951.1, -3133.6, -5.2, -27.7],
  [2, 2, 1649.3, -815.1, -8.0, -12.1],
  [3, 0, 1361.0, 0.0, -1.3, 0.0],
  [3, 1, -2404.1, -56.6, -4.2, 4.0],
  [3, 2, 1243.8, 237.5, 0.4, -0.3],
  [3, 3, 453.6, -549.5, -15.6, -4.1],
  [4, 0, 895.0, 0.0, -1.6, 0.0],
  [4, 1, 799.5, 278.6, -2.4, -1.1],
  [4, 2, 55.7, -133.9, -6.0, 4.1],
  [4, 3, -281.1, 212.0, 5.6, 1.6],
  [4, 4, 12.1, -375.6, -7.0, -4.4],
  [5, 0, -233.2, 0.0, 0.6, 0.0],
  [5, 1, 368.9, 45.4, 1.4, -0.5],
  [5, 2, 187.2, 220.2, 0.0, 2.2],
  [5, 3, -138.7, -122.9, 0.6, 0.4],
  [5, 4, -142.0, 43.0, 2.2, 1.7],
  [5, 5, 20.9, 106.1, 0.9, 1.9],
  [6, 0, 64.4, 0.0, -0.2, 0.0],
  [6, 1, 63.8, -18.4, -0.4, 0.3],
  [6, 2, 76.9, 16.8, 0.9, -1.6],
  [6, 3, -115.7, 48.8, 1.2, -0.4],
  [6, 4, -40.9, -59.8, -0.9, 0.9],
  [6, 5, 14.9, 10.9, 0.3, 0.7],
  [6, 6, -60.7, 72.7, 0.9, 0.9],
  [7, 0, 79.5, 0.0, -0.0, 0.0],
  [7, 1, -77.0, -48.9, -0.1, 0.6],
  [7, 2, -8.8, -14.4, -0.1, 0.5],
  [7, 3, 59.3, -1.0, 0.5, -0.8],
  [7, 4, 15.8, 23.4, -0.1, 0.0],
  [7, 5, 2.5, -7.4, -0.8, -1.0],
  [7, 6, -11.1, -25.1, -0.8, 0.6],
  [7, 7, 14.2, -2.3, 0.8, -0.2],
  [8, 0, 23.2, 0.0, -0.1, 0.0],
  [8, 1, 10.8, 7.1, 0.2, -0.2],
  [8, 2, -17.5, -12.6, 0.0, 0.5],
  [8, 3, 2.0, 11.4, 0.5, -0.4],
  [8, 4, -21.7, -9.7, -0.1, 0.4],
  [8, 5, 16.9, 12.7, 0.3, -0.5],
  [8, 6, 15.0, 0.7, 0.2, -0.6],
  [8, 7, -16.8, -5.2, -0.0, 0.3],
  [8, 8, 0.9, 3.9, 0.2, 0.2],
  [9, 0, 4.6, 0.0, -0.0, 0.0],
  [9, 1, 7.8, -24.8, -0.1, -0.3],
  [9, 2, 3.0, 12.2, 0.1, 0.3],
  [9, 3, -0.2, 8.3, 0.3, -0.3],
  [9, 4, -2.5, -3.3, -0.3, 0.3],
  [9, 5, -13.1, -5.2, 0.0, 0.2],
  [9, 6, 2.4, 7.2, 0.3, -0.1],
  [9, 7, 8.6, -0.6, -0.1, -0.2],
  [9, 8, -8.7, 0.8, 0.1, 0.4],
  [9, 9, -12.9, 10.0, -0.1, 0.1],
  [10, 0, -1.3, 0.0, 0.1, 0.0],
  [10, 1, -6.4, 3.3, 0.0, 0.0],
  [10, 2, 0.2, 0.0, 0.1, -0.0],
  [10, 3, 2.0, 2.4, 0.1, -0.2],
  [10, 4, -1.0, 5.3, -0.0, 0.1],
  [10, 5, -0.6, -9.1, -0.3, -0.1],
  [10, 6, -0.9, 0.4, 0.0, 0.1],
  [10, 7, 1.5, -4.2, -0.1, 0.0],
  [10, 8, 0.9, -3.8, -0.1, -0.1],
  [10, 9, -2.7, 0.9, -0.0, 0.2],
  [10, 10, -3.9, -9.1, -0.0, -0.0],
  [11, 0, 2.9, 0.0, 0.0, 0.0],
  [11, 1, -1.5, 0.0, -0.0, -0.0],
  [11, 2, -2.5, 2.9, 0.0, 0.1],
  [11, 3, 2.4, -0.6, 0.0, -0.0],
  [11, 4, -0.6, 0.2, 0.0, 0.1],
  [11, 5, -0.1, 0.5, -0.1, -0.0],
  [11, 6, -0.6, -0.3, 0.0, -0.0],
  [11, 7, -0.1, -1.2, -0.0, 0.1],
  [11, 8, 1.1, -1.7, -0.1, -0.0],
  [11, 9, -1.0, -2.9, -0.1, 0.0],
  [11, 10, -0.2, -1.8, -0.1, 0.0],
  [11, 11, 2.6, -2.3, -0.1, 0.0],
  [12, 0, -2.0, 0.0, 0.0, 0.0],
  [12, 1, -0.2, -1.3, 0.0, -0.0],
  [12, 2, 0.3, 0.7, -0.0, 0.0],
  [12, 3, 1.2, 1.0, -0.0, -0.1],
  [12, 4, -1.3, -1.4, -0.0, 0.1],
  [12, 5, 0.6, -0.0, -0.0, -0.0],
  [12, 6, 0.6, 0.6, 0.1, -0.0],
  [12, 7, 0.5, -0.1, -0.0, -0.0],
  [12, 8, -0.1, 0.8, 0.0, 0.0],
  [12, 9, -0.4, 0.1, 0.0, -0.0],
  [12, 10, -0.2, -1.0, -0.1, -0.0],
  [12, 11, -1.3, 0.1, -0.0, 0.0],
  [12, 12, -0.7, 0.2, -0.1, -0.1],
];

// ── src/wmm.js ──

// @gcu/wmm — the World Magnetic Model, evaluated.
//
// Geodetic position + date → the main field (X north, Y east, Z down; nT), its
// derived elements (H, F, inclination I, declination D, grid variation GV) and
// their secular variation. The equations are the WMM technical report's
// (NOAA/NCEI; §"The model"): a degree-12 spherical-harmonic expansion of the
// geomagnetic potential in Schmidt semi-normalized associated Legendre
// functions, evaluated in geocentric spherical coordinates and rotated back
// to the geodetic frame. Coefficients come from the official COF file
// (coefficients.js, generated — never hand-typed) and the twelve published
// test points pin the implementation (test/wmm.test.mjs).
//
// The one number a compass wants is `declination(lat, lon, date)`: add it to a
// magnetic azimuth to get true (east-positive, bearing's convention).

const DEG = Math.PI / 180;
const A_WGS84 = 6378.137;                 // km, semi-major axis
const F_WGS84 = 1 / 298.257223563;        // flattening
const E2 = F_WGS84 * (2 - F_WGS84);       // first eccentricity squared
const A_REF = 6371.2;                     // km, the geomagnetic reference radius

// coefficient tables indexed [n][m]
const G = [], H = [], GD = [], HD = [];
for (let n = 0; n <= DEGREE; n++) { G.push(new Float64Array(n + 1)); H.push(new Float64Array(n + 1)); GD.push(new Float64Array(n + 1)); HD.push(new Float64Array(n + 1)); }
for (const [n, m, g, h, gd, hd] of COEFFICIENTS) { G[n][m] = g; H[n][m] = h; GD[n][m] = gd; HD[n][m] = hd; }

/** A Date (or a decimal year) → decimal year, e.g. 2027-07-02 → 2027.5. */
function decimalYear(date = new Date()) {
  if (typeof date === 'number') return date;
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), next = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (next - start);
}

/** Model validity: [epoch, epoch + 5). Outside it the model still evaluates, with `valid: false`. */
const VALID_FROM = EPOCH;
const VALID_TO = EPOCH + 5;

/**
 * Evaluate the field at geodetic latitude/longitude (degrees), height above the
 * WGS84 ellipsoid (km) and a date (Date or decimal year).
 * → { x, y, z, h, f, incl, decl, gv, xdot, ydot, zdot, hdot, fdot, idot, ddot, year, valid }
 *   nT and nT/yr; angles in degrees, rates in deg/yr. `gv` is null outside |lat| > 55°.
 */
function field(lat, lon, { height = 0, date = new Date() } = {}) {
  const year = decimalYear(date);
  const dt = year - EPOCH;
  const phi = lat * DEG, lam = lon * DEG;

  // geodetic → geocentric spherical (r, phi')
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const rc = A_WGS84 / Math.sqrt(1 - E2 * sphi * sphi);
  const p = (rc + height) * cphi;
  const zc = (rc * (1 - E2) + height) * sphi;
  const r = Math.hypot(p, zc);
  const phic = Math.atan2(zc, p);
  const psi = phic - phi;

  // Schmidt semi-normalized P[n][m](x) and dP/dθ, x = sin φ' = cos θ, s = sin θ
  const x = Math.sin(phic), s = Math.cos(phic);
  const P = [], DP = [];
  for (let n = 0; n <= DEGREE; n++) { P.push(new Float64Array(n + 1)); DP.push(new Float64Array(n + 1)); }
  P[0][0] = 1; DP[0][0] = 0;
  for (let n = 1; n <= DEGREE; n++) {
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        if (n === 1) { P[1][1] = s; DP[1][1] = x; }
        else {
          const k = Math.sqrt((2 * n - 1) / (2 * n));
          P[n][n] = k * s * P[n - 1][n - 1];
          DP[n][n] = k * (x * P[n - 1][n - 1] + s * DP[n - 1][n - 1]);
        }
      } else {
        const d = Math.sqrt(n * n - m * m);
        const q = n - 1 > m - 1 && n >= 2 ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        const p1 = P[n - 1][m], dp1 = DP[n - 1][m];
        const p2 = n >= 2 && m <= n - 2 ? P[n - 2][m] : 0;
        const dp2 = n >= 2 && m <= n - 2 ? DP[n - 2][m] : 0;
        P[n][m] = ((2 * n - 1) * x * p1 - q * p2) / d;
        DP[n][m] = ((2 * n - 1) * (-s * p1 + x * dp1) - q * dp2) / d;
      }
    }
  }

  // sums over the expansion; the derivative wrt φ' is −dP/dθ
  const cml = new Float64Array(DEGREE + 1), sml = new Float64Array(DEGREE + 1);
  for (let m = 0; m <= DEGREE; m++) { cml[m] = Math.cos(m * lam); sml[m] = Math.sin(m * lam); }
  let xp = 0, yp = 0, zp = 0, xpd = 0, ypd = 0, zpd = 0;
  let ar = (A_REF / r) * (A_REF / r);
  for (let n = 1; n <= DEGREE; n++) {
    ar *= A_REF / r;                       // (a/r)^(n+2)
    for (let m = 0; m <= n; m++) {
      const g = G[n][m] + dt * GD[n][m], h = H[n][m] + dt * HD[n][m];
      const gd = GD[n][m], hd = HD[n][m];
      const c = g * cml[m] + h * sml[m], cd = gd * cml[m] + hd * sml[m];
      const sn = g * sml[m] - h * cml[m], snd = gd * sml[m] - hd * cml[m];
      xp += ar * c * DP[n][m];             // −(a/r)^(n+2) · c · dP/dφ'  with dP/dφ' = −dP/dθ
      xpd += ar * cd * DP[n][m];
      yp += ar * m * sn * P[n][m];
      ypd += ar * m * snd * P[n][m];
      zp -= (n + 1) * ar * c * P[n][m];
      zpd -= (n + 1) * ar * cd * P[n][m];
    }
  }
  yp /= s; ypd /= s;                       // 1/cos φ'

  // geocentric → geodetic components
  const cpsi = Math.cos(psi), spsi = Math.sin(psi);
  const X = xp * cpsi - zp * spsi, Z = xp * spsi + zp * cpsi, Y = yp;
  const Xd = xpd * cpsi - zpd * spsi, Zd = xpd * spsi + zpd * cpsi, Yd = ypd;

  const Hh = Math.hypot(X, Y), Ff = Math.hypot(Hh, Z);
  const decl = Math.atan2(Y, X) / DEG, incl = Math.atan2(Z, Hh) / DEG;
  const Hd = (X * Xd + Y * Yd) / Hh, Fd = (X * Xd + Y * Yd + Z * Zd) / Ff;
  const Dd = (X * Yd - Y * Xd) / (Hh * Hh) / DEG, Id = (Hh * Zd - Z * Hd) / (Ff * Ff) / DEG;
  let gv = null;
  if (lat > 55) gv = decl - lon; else if (lat < -55) gv = decl + lon;
  if (gv != null) { gv = ((gv + 180) % 360 + 360) % 360 - 180; }

  return {
    x: X, y: Y, z: Z, h: Hh, f: Ff, incl, decl, gv,
    xdot: Xd, ydot: Yd, zdot: Zd, hdot: Hd, fdot: Fd, idot: Id, ddot: Dd,
    year, valid: year >= VALID_FROM && year < VALID_TO,
  };
}

/** Magnetic declination (degrees, east positive) at a place and date. true = magnetic + declination. */
function declination(lat, lon, date = new Date(), height = 0) {
  return field(lat, lon, { height, date }).decl;
}

// ── src/main.js ──

// @gcu/wmm — module manifest. coefficients.js (GENERATED from NOAA's WMM2025.COF)
// then wmm.js (the evaluation). A zero-dependency leaf: the one number a compass
// needs to turn magnetic north into true north, offline.

export {
  COEFFICIENTS,
  DEGREE,
  EPOCH,
  MODEL,
  field,
  declination,
  decimalYear,
  VALID_FROM,
  VALID_TO,
};

// Places, distance and UTM. A place is coordinates in the request or a name saved on this device
// ("home is -19.92, -43.94"); there is no gazetteer and device location is off, so an unknown name is
// a question, not a guess. Distance is Vincenty's inverse on WGS84; UTM is the Krüger series.
import { S, tool, frame, amend, noun, shape, postmod, fmt, rad, deg } from './core.js';

const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
WGS84.b = WGS84.a * (1 - WGS84.f); WGS84.e2 = WGS84.f * (2 - WGS84.f); WGS84.e = Math.sqrt(WGS84.e2);
export const placesTable = () => S.tables.places || (S.tables.places = { name: 'places', cols: [{ name: 'name', type: 'category' }, { name: 'lat', type: 'numeric' }, { name: 'lon', type: 'numeric' }], rows: [] });
const COORD = '(-?\\d{1,2}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)';
const fmtLL = (lat, lon) => `${fmt(Math.abs(lat), 6)}° ${lat < 0 ? 'S' : 'N'}, ${fmt(Math.abs(lon), 6)}° ${lon < 0 ? 'W' : 'E'}`;
// a place from text: coordinates, or a saved name → { lat, lon, name } | { unknown } | null
export function placeOf(s) {
  if (!s) return null; s = s.trim().replace(/^(?:at|in|from|to)\s+/, '');
  const m = new RegExp(`^${COORD}$`).exec(s); if (m) return { lat: +m[1], lon: +m[2], name: null };
  if (/^(?:here|my location|where i am)$/i.test(s)) return { unknown: s, here: true };
  const row = (S.tables.places ? S.tables.places.rows : []).find(r => r.name === s.toLowerCase()); if (row) return { lat: row.lat, lon: row.lon, name: row.name };
  return { unknown: s };
}
const whereAsk = (name, key) => ({ prompt: `Where is ${name}? Give its coordinates as "lat, lon" (there is no gazetteer here, and device location is off). Type them below.`, options: [], parse: s => { const m = new RegExp(`^${COORD}$`).exec(s.trim()); return m ? { lat: +m[1], lon: +m[2] } : null; }, set: (a, v) => { a[key] = v; } });
const SRC_PLACES = { t: 'src', text: 'places · a table on this device · no gazetteer, no device location' };

/* ── places ─────────────────────────────────────────────────── */
tool({
  name: 'place', effects: ['device'],
  skill: { group: 'Device', title: 'Places, distance and UTM', on: 'own geodesy', about: 'Save a place by coordinates; distance and bearings between two places over the WGS84 ellipsoid (Vincenty); latitude and longitude to UTM and back (Krüger series). No gazetteer: a name you have not saved is asked for.', examples: ['home is -19.92, -43.94', 'distance from -19.92,-43.94 to -6.07,-50.16', '-19.92, -43.94 in utm', 'utm 23k 611000 7797000 to lat long'] },
  topic: () => ['Places', .5],
  undo: a => { const t = placesTable(); t.rows = t.rows.filter(r => r.name !== a.name); },
  run: a => {
    if (Math.abs(a.lat) > 90 || Math.abs(a.lon) > 180) return { read: ['place', { v: a.name }], body: [{ t: 'note', kind: 'err', text: `${a.lat}, ${a.lon} is not a latitude and longitude. Latitude first, −90 to 90; then longitude, −180 to 180.` }], trace: ['coordinates out of range'] };
    const t = placesTable(), at = t.rows.findIndex(r => r.name === a.name); const row = { name: a.name, lat: a.lat, lon: a.lon };
    if (at >= 0) t.rows[at] = row; else t.rows.push(row);
    return { read: ['save place', { v: a.name }, 'at', { v: fmtLL(a.lat, a.lon) }], body: [{ t: 'note', kind: 'ok', text: `Saved on this device. ${t.rows.length} place${t.rows.length === 1 ? '' : 's'}: ${t.rows.map(r => r.name).join(', ')}.` }, SRC_PLACES], trace: [`places.set("${a.name}", ${a.lat}, ${a.lon})`], py: `places.set("${a.name}", lat=${a.lat}, lon=${a.lon})` };
  }
});

/* ── distance: Vincenty's inverse formula on WGS84 ──────────── */
export function vincenty(lat1, lon1, lat2, lon2) {
  const { a, b, f } = WGS84, L = rad(lon2 - lon1), U1 = Math.atan((1 - f) * Math.tan(rad(lat1))), U2 = Math.atan((1 - f) * Math.tan(rad(lat2)));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, sinSig, cosSig, sig, sinAlpha, cos2Alpha, cos2SigM, it = 0;
  do {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sinSig = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sinSig === 0) return { s: 0, a1: 0, a2: 0 };
    cosSig = sU1 * sU2 + cU1 * cU2 * cl; sig = Math.atan2(sinSig, cosSig);
    sinAlpha = cU1 * cU2 * sl / sinSig; cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigM = cos2Alpha ? cosSig - 2 * sU1 * sU2 / cos2Alpha : 0;
    const C = f / 16 * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha)), prev = lam;
    lam = L + (1 - C) * f * sinAlpha * (sig + C * sinSig * (cos2SigM + C * cosSig * (-1 + 2 * cos2SigM * cos2SigM)));
    if (Math.abs(lam - prev) < 1e-12) break;
  } while (++it < 200);
  if (it >= 200) return null;
  const u2 = cos2Alpha * (a * a - b * b) / (b * b), A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))), B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dSig = B * sinSig * (cos2SigM + B / 4 * (cosSig * (-1 + 2 * cos2SigM * cos2SigM) - B / 6 * cos2SigM * (-3 + 4 * sinSig * sinSig) * (-3 + 4 * cos2SigM * cos2SigM)));
  const s = b * A * (sig - dSig), sl = Math.sin(lam), cl = Math.cos(lam);
  const a1 = (deg(Math.atan2(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl)) + 360) % 360, a2 = (deg(Math.atan2(cU1 * sl, -sU1 * cU2 + cU1 * sU2 * cl)) + 360) % 360;
  return { s, a1, a2, it };
}
tool({
  name: 'distance',
  topic: () => ['Distance', 1],
  run: a => {
    const read = ['distance from', { v: a.from }, 'to', { v: a.to }];
    const A = a.fromLL || placeOf(a.from), B = a.toLL || placeOf(a.to);
    for (const [p, key, name] of [[A, 'fromLL', a.from], [B, 'toLL', a.to]]) if (!p || p.unknown) return { read, body: [], ask: whereAsk(name, key), trace: [`place "${name}": unknown`] };
    const r = vincenty(A.lat, A.lon, B.lat, B.lon);
    if (!r) return { read, body: [{ t: 'note', kind: 'err', text: 'The two points are nearly antipodal and Vincenty\'s formula does not converge there. Karney\'s method would; it is not in golem yet.' }], trace: ['vincenty: no convergence'] };
    const km = r.s / 1000;
    return { read, value: r.s, body: [{ t: 'big', v: km >= 100 ? fmt(km, 5) : fmt(km, 4), unit: 'km over the ellipsoid, not by road' }, { t: 'kv', rows: [['from', `${a.from === (A.name || '') ? A.name + ', ' : ''}${fmtLL(A.lat, A.lon)}`], ['to', `${B.name ? B.name + ', ' : ''}${fmtLL(B.lat, B.lon)}`], ['metres', fmt(r.s, 9), { mono: true }], ['initial bearing', `${fmt(r.a1, 4)}° true`], ['final bearing', `${fmt(r.a2, 4)}° true`]] }, { t: 'src', text: 'Vincenty (1975) inverse on WGS84 · converges to a millimetre except near antipodes' }], trace: [`vincenty(${A.lat}, ${A.lon}, ${B.lat}, ${B.lon}) → ${fmt(r.s, 9)} m in ${r.it} iterations`], py: `geodesic.inverse((${A.lat}, ${A.lon}), (${B.lat}, ${B.lon}))` };
  }
});

/* ── UTM by the Krüger series (Karney 2011), WGS84 ──────────── */
const n = WGS84.f / (2 - WGS84.f), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
const AA = WGS84.a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256), K0 = 0.9996;
const ALPHA = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180 - 127 * n5 / 288 + 7891 * n6 / 37800, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440 + 281 * n5 / 630 - 1983433 * n6 / 1935360, 61 * n3 / 240 - 103 * n4 / 140 + 15061 * n5 / 26880 + 167603 * n6 / 181440, 49561 * n4 / 161280 - 179 * n5 / 168 + 6601661 * n6 / 7257600, 34729 * n5 / 80640 - 3418889 * n6 / 1995840, 212378941 * n6 / 319334400];
const BETA = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360 - 81 * n5 / 512 + 96199 * n6 / 604800, n2 / 48 + n3 / 15 - 437 * n4 / 1440 + 46 * n5 / 105 - 1118711 * n6 / 3870720, 17 * n3 / 480 - 37 * n4 / 840 - 209 * n5 / 4480 + 5569 * n6 / 90720, 4397 * n4 / 161280 - 11 * n5 / 504 - 830251 * n6 / 7257600, 4583 * n5 / 161280 - 108847 * n6 / 3991680, 20648693 * n6 / 638668800];
const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
export function utmZone(lat, lon) {
  let z = Math.floor((lon + 180) / 6) + 1;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32;
  if (lat >= 72 && lat < 84) { if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33; else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37; }
  return z;
}
export const bandOf = lat => lat >= 84 || lat < -80 ? null : BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
export function toUTM(lat, lon, zone) {
  const z = zone || utmZone(lat, lon), lon0 = (z - 1) * 6 - 180 + 3, phi = rad(lat), lam = rad(lon - lon0), e = WGS84.e;
  const tau = Math.tan(phi), sig = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau))), taup = tau * Math.sqrt(1 + sig * sig) - sig * Math.sqrt(1 + tau * tau);
  const xip = Math.atan2(taup, Math.cos(lam)), etap = Math.asinh(Math.sin(lam) / Math.sqrt(taup * taup + Math.cos(lam) ** 2));
  let xi = xip, eta = etap, p = 1, q = 0;
  ALPHA.forEach((al, j) => { const k = 2 * (j + 1); xi += al * Math.sin(k * xip) * Math.cosh(k * etap); eta += al * Math.cos(k * xip) * Math.sinh(k * etap); p += k * al * Math.cos(k * xip) * Math.cosh(k * etap); q += k * al * Math.sin(k * xip) * Math.sinh(k * etap); });
  const x = K0 * AA * eta, y = K0 * AA * xi, south = lat < 0;
  const gamma = deg(Math.atan(taup / Math.sqrt(1 + taup * taup) * Math.tan(lam)) + Math.atan2(q, p)), k = K0 * AA / WGS84.a * Math.sqrt(1 - e * e * Math.sin(phi) ** 2) * Math.sqrt(1 + tau * tau) * Math.sqrt(p * p + q * q) / Math.sqrt(taup * taup + Math.cos(lam) ** 2);
  return { zone: z, band: bandOf(lat), hemisphere: south ? 'S' : 'N', easting: 500000 + x, northing: south ? 10000000 + y : y, convergence: gamma, scale: k, lon0 };
}
export function fromUTM(zone, hemisphere, easting, northing) {
  const x = easting - 500000, y = hemisphere === 'S' ? northing - 10000000 : northing, eta = x / (K0 * AA), xi = y / (K0 * AA), e = WGS84.e;
  let xip = xi, etap = eta;
  BETA.forEach((be, j) => { const k = 2 * (j + 1); xip -= be * Math.sin(k * xi) * Math.cosh(k * eta); etap -= be * Math.cos(k * xi) * Math.sinh(k * eta); });
  const sh = Math.sinh(etap), cx = Math.cos(xip), taup = Math.sin(xip) / Math.sqrt(sh * sh + cx * cx), lam = Math.atan2(sh, cx);
  let tau = taup;
  for (let i = 0; i < 10; i++) { const sig = Math.sinh(e * Math.atanh(e * tau / Math.sqrt(1 + tau * tau))), ti = tau * Math.sqrt(1 + sig * sig) - sig * Math.sqrt(1 + tau * tau), d = (taup - ti) / Math.sqrt(1 + ti * ti) * (1 + (1 - e * e) * tau * tau) / ((1 - e * e) * Math.sqrt(1 + tau * tau)); tau += d; if (Math.abs(d) < 1e-14) break; }
  const lon0 = (zone - 1) * 6 - 180 + 3;
  return { lat: deg(Math.atan(tau)), lon: lon0 + deg(lam) };
}
tool({
  name: 'utm',
  topic: () => ['UTM', 1],
  run: a => {
    if (a.place) {
      const read = [{ v: a.place }, 'in UTM'], P = a.placeLL || placeOf(a.place);
      if (!P || P.unknown) return { read, body: [], ask: whereAsk(a.place, 'placeLL'), trace: [`place "${a.place}": unknown`] };
      if (Math.abs(P.lat) > 84 && !a.zoneForced) return { read, body: [{ t: 'note', kind: 'err', text: 'UTM stops at 84° N and 80° S; the polar zones use UPS, which is not here.' }], trace: ['outside UTM'] };
      const natural = utmZone(P.lat, P.lon), z = a.zoneForced || natural, u = toUTM(P.lat, P.lon, z), edge = Math.abs(((P.lon + 180) % 6) - 3) > 2.5, alts = edge ? [natural, (P.lon + 180) % 6 < 3 ? natural - 1 : natural + 1].filter(x => x >= 1 && x <= 60) : [natural];
      const zoneSlot = alts.length > 1 ? { v: `zone ${z}`, key: 'zoneForced', alts, cur: z } : { v: `zone ${z}` };
      return { read: [...read, zoneSlot, { v: 'WGS84', key: 'datum', alts: ['WGS84', 'SIRGAS 2000'], cur: a.datum || 'WGS84' }], value: [u.easting, u.northing], body: [{ t: 'big', v: `${z}${u.band || ''} ${fmt(Math.round(u.easting))} E ${fmt(Math.round(u.northing))} N`, unit: 'metres, to the metre' }, { t: 'kv', rows: [['easting', fmt(u.easting, 10), { mono: true }], ['northing', fmt(u.northing, 10), { mono: true }], ['zone', `${z}${u.band ? ', band ' + u.band : ''}, ${u.hemisphere === 'S' ? 'southern' : 'northern'} hemisphere, central meridian ${u.lon0}°${edge ? '; within half a degree of a zone edge, so the zone is a slot' : ''}`], ['grid convergence', `${fmt(u.convergence, 4)}°`], ['scale factor', fmt(u.scale, 7)], ['datum', `${a.datum || 'WGS84'}; WGS84 and SIRGAS 2000 are equal at this precision. SAD69 and Córrego Alegre are not and are refused.`]] }, { t: 'src', text: 'Transverse Mercator by the Krüger series (Karney 2011), WGS84, k0 0.9996' }], trace: [`zone ${z}, λ0 = ${u.lon0}°`, `krüger forward(${P.lat}, ${P.lon}) → ${fmt(u.easting, 9)}, ${fmt(u.northing, 9)}`], py: `utm.from_latlon(${P.lat}, ${P.lon}${a.zoneForced ? ', force_zone_number=' + z : ''})` };
    }
    const read = ['UTM', { v: `${a.zone}${a.band || ''} ${fmt(a.easting)} ${fmt(a.northing)}` }, 'to latitude and longitude'];
    if (a.zone < 1 || a.zone > 60) return { read, body: [{ t: 'note', kind: 'err', text: `Zone ${a.zone}: zones run 1 to 60.` }], trace: ['zone out of range'] };
    if (!a.band && a.hemisphere == null) return { read, body: [], ask: { prompt: 'Northern or southern hemisphere? (The band letter would say: C to M is south, N to X north.)', options: [{ label: 'southern', value: 'S' }, { label: 'northern', value: 'N' }], set: (x, v) => { x.hemisphere = v; } }, trace: ['blocked: hemisphere unknown'] };
    const hemi = a.hemisphere || (a.band >= 'N' ? 'N' : 'S'), p = fromUTM(a.zone, hemi, a.easting, a.northing), back = toUTM(p.lat, p.lon, a.zone);
    if (Math.abs(p.lat) > 84.5) return { read, body: [{ t: 'note', kind: 'err', text: 'That northing lies beyond the UTM latitude limits.' }], trace: ['outside UTM'] };
    return { read, value: [p.lat, p.lon], body: [{ t: 'big', v: fmtLL(p.lat, p.lon), unit: '' }, { t: 'kv', rows: [['decimal', `${fmt(p.lat, 8)}, ${fmt(p.lon, 8)}`, { mono: true }], ['hemisphere', hemi === 'S' ? `southern${a.band ? ', from band ' + a.band : ''}` : `northern${a.band ? ', from band ' + a.band : ''}`], ['round trip', `${fmt(back.easting, 9)} E ${fmt(back.northing, 9)} N (closes to ${fmt(Math.hypot(back.easting - a.easting, back.northing - a.northing) * 1000, 3)} mm)`], ['datum', 'WGS84 (SIRGAS 2000 is equal at this precision)']] }, { t: 'src', text: 'Transverse Mercator by the Krüger series (Karney 2011), WGS84, k0 0.9996' }], trace: [`krüger inverse(zone ${a.zone}${hemi}, ${a.easting}, ${a.northing}) → ${fmt(p.lat, 10)}, ${fmt(p.lon, 10)}`], py: `utm.to_latlon(${a.easting}, ${a.northing}, ${a.zone}, ${a.band ? '"' + a.band + '"' : 'northern=' + (hemi === 'N')})` };
  }
});
/* ── what reads them ─────────────────────────────────────────── */
shape({ type: 'coords', re: '-?\\d{1,2}(?:\\.\\d+)?\\s*,\\s*-?\\d{1,3}(?:\\.\\d+)?' });   // "-19.92, -43.94"
shape({ type: 'utmcoord', re: '\\d{1,2}\\s?[c-hj-np-x]?\\s+(?:e\\s?)?\\d{5,7}(?:\\.\\d+)?\\s+(?:n\\s?)?\\d{5,8}(?:\\.\\d+)?' });   // "23k 611000 7797000"
noun({ type: 'geographic', words: { latlon: ['lat long', 'lat lon', 'latlong', 'latitude and longitude', 'latitude longitude', 'geographic', 'wgs84', 'degrees'] }, words_pt: { latlon: ['lat long', 'latitude e longitude', 'geográficas', 'geograficas', 'graus'] } });
noun({ type: 'utmword', words: { utm: ['utm'] }, words_pt: { utm: ['utm'] } });
// a place in a role: coordinates, a known name, or (for a name nobody saved) the words, so the card can ask where it is
const PLACE_T = ['coords', 'place', 'text'];
const where = n => n.type === 'coords' ? n.value.replace(/\s+/g, ' ') : String(n.value);
// "home is -19.92, -43.94"
frame({
  name: 'place', label: 'Place', words: ['is', 'is at'], subject: ['text', 'place'], theme: ['coords'], required: ['theme', 'subject'], roles: {},
  words_pt: ['é', 'fica em', 'está em'], label_pt: 'Lugar',
  bind: c => { const n = c.roles.subject[0], m = /^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(c.theme[0].value); return m ? { tool: 'place', args: { name: String(n.value).trim().toLowerCase(), lat: +m[1], lon: +m[2] } } : null; }
});
// "distance from -19.92,-43.94 to -6.07,-50.16", "how far is it from home to the camp", "distance between home and perth"
frame({
  name: 'distance', label: 'Distance', words: ['distance', 'how far', 'how far is it', 'geodesic distance', 'great circle distance'], theme: [], required: ['from'],
  roles: { from: { preps: ['from', 'between'], types: PLACE_T }, to: { preps: ['to'], types: PLACE_T } },
  words_pt: ['distância', 'distancia', 'qual a distância', 'a que distância'], label_pt: 'Distância',
  bind: c => { const f = c.roles.from.map(where), t = (c.roles.to || []).map(where); const [a, b] = f.length === 2 && !t.length ? f : [f[0], t[0]]; return a && b ? { tool: 'distance', args: { from: a, to: b } } : null; }
});
// "-19.92, -43.94 in utm", "home in utm"; "utm 23k 611000 7797000 to lat long"
frame({
  name: 'toutm', label: 'To UTM', words: [], elidable: true, theme: ['coords', 'place'], required: ['theme', 'to'], roles: { to: { preps: ['in', 'to', 'as'], types: ['utmword'] } }, label_pt: 'Para UTM',
  bind: c => ({ tool: 'utm', args: { place: where(c.theme[0]) } })
});
frame({
  name: 'fromutm', label: 'From UTM', words: ['utm', 'convert utm'], elidable: true, theme: ['utmcoord'], required: ['theme'], roles: { to: { preps: ['to', 'in', 'as', 'into'], types: ['geographic'] } }, label_pt: 'De UTM',
  bind: c => { const m = /^(\d{1,2})\s?([c-hj-np-x])?\s+(?:e\s?)?(\d+(?:\.\d+)?)\s+(?:n\s?)?(\d+(?:\.\d+)?)$/i.exec(c.theme[0].value.trim()); return m ? { tool: 'utm', args: { zone: +m[1], band: m[2] ? m[2].toUpperCase() : null, easting: +m[3], northing: +m[4] } } : null; }
});
// "zone 23", "band k"
noun({ amend: true, type: 'utmzone', words: {}, generic: ['zone', 'utm zone'], generic_pt: ['zona', 'fuso'] }); postmod({ prep: '', heads: ['utmzone'], attr: 'n', quantity: true });
amend({ tools: ['utm'], name: 'utmzone', label: 'Zone', words: [], elidable: true, theme: ['utmzone'], required: ['theme'], roles: {}, bind: (c, a) => a.place && c.theme[0].attrs.n ? { args: { ...a, zoneForced: c.theme[0].attrs.n.n } } : null });
noun({ amend: true, type: 'utmband', words: {}, generic: ['band', 'latitude band'], generic_pt: ['banda'] }); postmod({ prep: '', heads: ['utmband'], attr: 'letter', mod: 'bandletter' });
shape({ type: 'bandletter', re: '[c-hj-np-x]' });
amend({ tools: ['utm'], name: 'utmband', label: 'Band', words: [], elidable: true, theme: ['utmband'], required: ['theme'], roles: {}, bind: (c, a) => a.easting != null && c.theme[0].attrs.letter ? { args: { ...a, band: c.theme[0].attrs.letter.toUpperCase() } } : null });

/* ── orientation: true thickness + stereonet ───────────────── */
const p3 = x => String(Math.round(x) % 360).padStart(3, '0'), p2 = x => String(Math.round(x)).padStart(2, '0');
const vLine = (tr, pl) => [Math.sin(rad(tr)) * Math.cos(rad(pl)), Math.cos(rad(tr)) * Math.cos(rad(pl)), -Math.sin(rad(pl))];
const vPole = (dd, dip) => [Math.sin(rad(dd)) * Math.sin(rad(dip)), Math.cos(rad(dd)) * Math.sin(rad(dip)), Math.cos(rad(dip))];
function proj(tr, pl, R) { const r = R * Math.SQRT2 * Math.sin(rad((90 - pl) / 2)); return [r * Math.sin(rad(tr)), -r * Math.cos(rad(tr))]; }
function net(planes, lines) {
  const R = 84, c = 104, lab = (x, y, t) => `<text x="${(c + x + (x > 20 ? -7 : 7)).toFixed(1)}" y="${(c + y - 6).toFixed(1)}" text-anchor="${x > 20 ? 'end' : 'start'}">${esc(t)}</text>`;
  let s = `<svg viewBox="0 0 208 208" width="208" height="208" role="img" aria-label="Lower-hemisphere equal-area stereonet"><circle class="netbg" cx="${c}" cy="${c}" r="${R}"/><path class="grid" d="M${c - 5} ${c}h10M${c} ${c - 5}v10"/><path class="ax" d="M${c} ${c - R}v-7"/><text x="${c}" y="10" text-anchor="middle">N</text>`;
  planes.forEach(p => {
    const sv = [Math.sin(rad(p.dd - 90)), Math.cos(rad(p.dd - 90)), 0], dv = vLine(p.dd, p.dip), pts = [];
    for (let k = 0; k <= 60; k++) {
      const th = Math.PI * k / 60, v = sv.map((x, i) => Math.cos(th) * x + Math.sin(th) * dv[i]);
      const [x, y] = proj(deg(Math.atan2(v[0], v[1])), deg(Math.asin(Math.min(1, Math.max(0, -v[2])))), R);
      pts.push((c + x).toFixed(1) + ' ' + (c + y).toFixed(1));
    }
    const [px, py] = proj(p.dd + 180, 90 - p.dip, R);
    s += `<path class="ln" d="M${pts.join('L')}"/><rect class="pole" x="${(c + px - 3.5).toFixed(1)}" y="${(c + py - 3.5).toFixed(1)}" width="7" height="7"/>${lab(px, py, 'pole')}`;
  });
  lines.forEach(l => { const [x, y] = proj(l.tr, l.pl, R); s += `<circle class="pt" cx="${(c + x).toFixed(1)}" cy="${(c + y).toFixed(1)}" r="4"/>${lab(x, y, l.label)}`; });
  return s + '</svg>';
}
const planeDD = a => a.conv === 'sd' ? (a.a1 + 90) % 360 : a.a1;
const convSlot = a => ({ v: `${p3(a.a1)}/${p2(a.a2)} as ${a.conv === 'sd' ? 'strike/dip (right-hand)' : 'dip direction/dip'}`, key: 'conv', alts: ['dd', 'sd'], cur: a.conv || 'dd' });

T.thickness = a => {
  const dd = planeDD(a), h = vLine(a.htr, a.hpl), n = vPole(dd, a.a2);
  const c = Math.abs(h[0] * n[0] + h[1] * n[1] + h[2] * n[2]), tt = a.len * c, ang = deg(Math.acos(Math.min(1, c)));
  return {
    read: ['true thickness of', { v: fmt(a.len) + ' m' }, 'in hole', { v: `${p3(a.htr)}/${p2(a.hpl)} trend/plunge` }, 'through', convSlot(a)],
    value: tt,
    html: `<div class="big">${fmt(tt, 4)} <small>m true thickness</small></div>${net([{ dd, dip: a.a2 }], [{ tr: a.htr, pl: a.hpl, label: 'hole' }])}
      <dl class="kv"><dt>hole to pole</dt><dd>${fmt(ang, 3)}°</dd><dt>hole to plane</dt><dd>${fmt(90 - ang, 3)}°</dd><dt>factor</dt><dd>${fmt(c, 4)} of downhole length</dd></dl><div class="src">@gcu/bearing · lower hemisphere, equal area</div>`,
    trace: [`plane → dip direction ${p3(dd)}, dip ${p2(a.a2)}; pole ${p3(dd + 180)}/${p2(90 - a.a2)}`, `hole axis ${p3(a.htr)}/${p2(a.hpl)} as unit vector`, `|hole · pole| = ${fmt(c, 5)}`, `${fmt(a.len)} m × ${fmt(c, 5)} = ${fmt(tt, 5)} m`],
    py: `bearing.true_thickness(${a.len}, hole=(${a.htr}, ${a.hpl}), plane=(${dd}, ${a.a2}))`
  };
};
T.plane = a => {
  const dd = planeDD(a);
  return { read: ['plot plane', convSlot(a)], html: `${net([{ dd, dip: a.a2 }], [])}<dl class="kv"><dt>strike</dt><dd>${p3(dd + 270)}</dd><dt>dip</dt><dd>${p2(a.a2)}° toward ${p3(dd)}</dd><dt>pole</dt><dd>${p3(dd + 180)}/${p2(90 - a.a2)}</dd></dl><div class="src">@gcu/bearing</div>`, trace: ['plane → great circle and pole', 'equal-area projection, lower hemisphere'], py: `stereonet.plane(${dd}, ${a.a2})` };
};

/* ── table: synthetic drillholes, histogram, variogram ─────── */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeData() {
  const r = mulberry(20261008), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()), rows = [], MU = { GRD: Math.log(.25), BRX: Math.log(.8), DYK: Math.log(.03) };
  for (let h = 1; h <= 8; h++) {
    const depth = 90 + 2 * Math.floor(r() * 20), L = h % 2 ? 1 : 2; let y = g(), lith = 'GRD', buf = [];
    for (let d = 0; d < depth; d++) {
      if (r() < .05) lith = lith === 'GRD' ? (r() < .7 ? 'BRX' : 'DYK') : 'GRD';
      y = .92 * y + Math.sqrt(1 - .92 * .92) * g();
      const cu = Math.exp(MU[lith] + .6 * y + .15 * g());
      buf.push({ lith, cu, au: cu * .4 * Math.exp(.35 * g()) });
      if (buf.length === L) {
        const cuM = buf.reduce((s, b) => s + b.cu, 0) / L, auM = buf.reduce((s, b) => s + b.au, 0) / L;
        rows.push({ hole: 'DH-0' + h, from: d + 1 - L, to: d + 1, lith: buf[0].lith, cu: +cuM.toFixed(3), au: auM < .02 ? -.01 : +auM.toFixed(3) });
        buf = [];
      }
    }
  }
  return rows;
}
function stats(v) {
  const s = [...v].sort((a, b) => a - b), n = s.length, mean = s.reduce((a, b) => a + b, 0) / n, va = s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return { n, mean, sd: Math.sqrt(va), va, min: s[0], med: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2, max: s[n - 1] };
}
const UNIT = { cu: '%', au: 'g/t' }, COL = { cu: 'Cu', au: 'Au' };
function needData(a, trace) {
  if (S.data) return null;
  if (!a.auto) return { prompt: 'No table is open. Open the sample table first?', options: [{ label: 'open assays.csv', value: true }], set: (x, v) => { x.auto = v; } };
  S.data = makeData(); trace.push('open assays.csv (precondition, added to the plan)');
  return null;
}
T.open = a => {
  S.data = makeData();
  const d = S.data, holes = new Set(d.map(r => r.hole)).size, n1 = d.filter(r => r.to - r.from === 1).length, neg = d.filter(r => r.au < 0).length;
  return {
    read: ['open table', { v: 'assays.csv' }],
    html: `<dl class="kv"><dt>rows</dt><dd>${d.length} samples in ${holes} holes</dd><dt>columns</dt><dd>hole (id) · from, to (m) · lith (category) · cu (%) · au (g/t)</dd><dt>lengths</dt><dd>${n1} samples of 1 m, ${d.length - n1} of 2 m</dd><dt>lith</dt><dd>${[...new Set(d.map(r => r.lith))].join(', ')}</dd></dl>
      ${neg ? `<div class="note">${neg} Au values are −0.01. That looks like a below-detection code. Statistics leave them out until you say what they mean.</div>` : ''}<div class="src">synthetic table generated for this mock · sadpan + tare checks</div>`,
    trace: ['read assays.csv → typed columns', 'tare: intervals contiguous, no overlaps', `tare: ${neg} negative Au values flagged`], py: 'dh = read_csv("assays.csv")'
  };
};
T.hist = a => {
  const trace = [], ask = needData(a, trace);
  const read = ['histogram of', { v: COL[a.col] }, { v: a.log ? 'log scale' : 'linear scale', key: 'log', alts: [false, true], cur: !!a.log }];
  if (ask) return { read, ask, html: '', trace: ['blocked: needs an open table'] };
  const raw = S.data.map(r => r[a.col]), v = raw.filter(x => x > 0), st = stats(v), f = a.log ? Math.log10 : x => x, lo = a.log ? f(st.min) : 0, hi = f(st.max), nb = 18, bins = new Array(nb).fill(0);
  v.forEach(x => { bins[Math.min(nb - 1, Math.floor((f(x) - lo) / (hi - lo) * nb))]++; });
  const W = 340, H = 150, x0 = 30, bw = (W - x0 - 6) / nb, top = Math.max(...bins), inv = t => a.log ? Math.pow(10, t) : t;
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" role="img" aria-label="Histogram of ${COL[a.col]}"><path class="ax" d="M${x0} 6V${H}H${W - 6}"/><text x="${x0 - 4}" y="12" text-anchor="end">${top}</text><text x="${x0 - 4}" y="${H}" text-anchor="end">0</text>`;
  bins.forEach((b, i) => { const h = b / top * (H - 10); s += `<rect class="barfill" x="${(x0 + i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}"/>`; });
  [0, .5, 1].forEach(t => { s += `<text x="${(x0 + t * (W - x0 - 6)).toFixed(1)}" y="${H + 14}" text-anchor="${t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}">${fmt(inv(lo + t * (hi - lo)), 2)}</text>`; });
  s += '</svg>';
  trace.push(`select ${a.col}; drop ${raw.length - v.length} non-positive values`, `bin into ${nb} ${a.log ? 'log10' : 'linear'} classes`);
  return {
    read, amend: 'hist',
    html: `${s}<dl class="kv"><dt>n</dt><dd>${st.n}</dd><dt>mean</dt><dd>${fmt(st.mean, 3)} ${UNIT[a.col]}</dd><dt>median</dt><dd>${fmt(st.med, 3)} ${UNIT[a.col]}</dd><dt>cv</dt><dd>${fmt(st.sd / st.mean, 3)}</dd><dt>range</dt><dd>${fmt(st.min, 3)} to ${fmt(st.max, 3)} ${UNIT[a.col]}</dd></dl><div class="src">sadpan · sample-count weighted, not declustered</div>`,
    trace, py: `plot.hist(dh["${a.col}"][dh["${a.col}"] > 0], bins=${nb}${a.log ? ', log=True' : ''})`
  };
};
T.vario = a => {
  const trace = [], read = ['downhole variogram of', { v: COL[a.col] }];
  let ask = needData(a, trace);
  if (!ask && !a.comp) {
    const n1 = S.data.filter(r => r.to - r.from === 1).length;
    ask = { prompt: `A variogram needs samples of equal length. This table has ${n1} samples of 1 m and ${S.data.length - n1} of 2 m. Composite to what length?`, options: [2, 3, 4].map(v => ({ label: v + ' m', value: v })), set: (x, v) => { x.comp = v; } };
  }
  if (ask) return { read, ask, html: '', trace: ['blocked: precondition not met'] };
  read.push('composited to', { v: a.comp + ' m', key: 'comp', alts: [2, 3, 4], cur: a.comp });
  const L = a.comp, byHole = {};
  S.data.forEach(r => { if (r[a.col] > 0) (byHole[r.hole] = byHole[r.hole] || []).push(r); });
  const comps = {}; let nc = 0; const all = [];
  Object.entries(byHole).forEach(([h, rs]) => {
    const end = Math.max(...rs.map(r => r.to)), out = [];
    for (let k = 0; (k + 1) * L <= end; k++) {
      let w = 0, sum = 0;
      rs.forEach(r => { const o = Math.min(r.to, (k + 1) * L) - Math.max(r.from, k * L); if (o > 0) { w += o; sum += o * r[a.col]; } });
      out.push(w >= L / 2 ? sum / w : null);
      if (w >= L / 2) { nc++; all.push(sum / w); }
    }
    comps[h] = out;
  });
  const sill = stats(all).va, lags = [];
  for (let k = 1; k <= 12; k++) {
    let s2 = 0, np = 0;
    Object.values(comps).forEach(c => { for (let i = 0; i + k < c.length; i++) if (c[i] != null && c[i + k] != null) { s2 += (c[i] - c[i + k]) ** 2; np++; } });
    if (np) lags.push({ h: k * L, g: s2 / (2 * np), np });
  }
  const W = 340, H = 150, x0 = 38, hx = lags[lags.length - 1].h, gy = Math.max(sill, ...lags.map(l => l.g)) * 1.1, X = h => x0 + h / hx * (W - x0 - 10), Y = g => H - g / gy * (H - 10);
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" role="img" aria-label="Downhole variogram of ${COL[a.col]}"><path class="ax" d="M${x0} 6V${H}H${W - 6}"/><path class="ln2" d="M${x0} ${Y(sill).toFixed(1)}H${W - 6}"/><text x="${W - 8}" y="${(Y(sill) - 4).toFixed(1)}" text-anchor="end">variance ${fmt(sill, 3)}</text><text x="${x0 - 4}" y="12" text-anchor="end">${fmt(gy, 2)}</text><text x="${x0 - 4}" y="${H}" text-anchor="end">0</text><path class="ln" d="M${lags.map(l => X(l.h).toFixed(1) + ' ' + Y(l.g).toFixed(1)).join('L')}"/>`;
  lags.forEach(l => { s += `<circle class="pt" cx="${X(l.h).toFixed(1)}" cy="${Y(l.g).toFixed(1)}" r="3.2"/>`; });
  [lags[0].h, lags[Math.floor(lags.length / 2)].h, hx].forEach(h => { s += `<text x="${X(h).toFixed(1)}" y="${H + 14}" text-anchor="middle">${h} m</text>`; });
  s += '</svg>';
  trace.push(`drop non-positive ${a.col} values`, `composite to ${L} m, length weighted, keep ≥ 50% coverage → ${nc} composites`, `pair composites down each hole at lags of ${L} m → ${lags.length} lags`);
  return {
    read,
    html: `${s}<dl class="kv"><dt>composites</dt><dd>${nc} at ${L} m</dd><dt>first lag</dt><dd>γ(${L} m) = ${fmt(lags[0].g, 3)}, ${fmt(lags[0].g / sill * 100, 3)}% of the variance, ${lags[0].np} pairs</dd><dt>last lag</dt><dd>γ(${hx} m) = ${fmt(lags[lags.length - 1].g, 3)}, ${lags[lags.length - 1].np} pairs</dd></dl><div class="src">@gcu/drillhole → gsjs · experimental only, no model fitted</div>`,
    trace, py: `comp = drillhole.composite(dh[dh["${a.col}"] > 0], ${L})\ngsjs.variogram(comp, "${a.col}", direction="downhole", lag=${L}, nlags=12)`
  };
};

// Rendering. The engine hands over plain blocks; this is the only file that turns them into markup.
import { fmt } from '../engine/core.js';
import { conversions, equalArea } from '../vendor/bearing.js';
import { Figure } from '../vendor/plot.js';
import { t, th, tx } from './i18n.js';
import { stationNow } from '../engine/notebook.js';
import { staleOf, staleText } from '../engine/tms.js';

// a card read with a taught value or formula that has changed since (tms.js): said under its reading, with its question
// to run again; the answer itself stays what it was
function staleLine(c) {
  const st = staleOf(c); if (!st.length) return '';
  return `<div class="stale"><span>${escHtml(t('Read with {what}.', { what: st.map(staleText).join('; ') }))}</span> <button class="cact" type="button" data-act="run" data-q="${escHtml(c.raw)}">${t('run again')}</button></div>`;
}

// a measured plane or line, or a typed plane, can go into the field notebook at the open station: the button says
// "add #12 to station 14", which reads like anything typed and copies the card's values into the new card's args
function toStation(c) {
  const st = stationNow(); if (!st || !((c.tool === 'measure' && c.args.reading) || c.tool === 'plane')) return '';
  return `<div class="opts"><button class="btn" type="button" data-act="run" data-q="${escHtml(`add #${c.id} to station ${st}`)}">${escHtml(t('Add to station {name}', { name: st }))}</button></div>`;
}

export const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pad = n => String(n).padStart(2, '0');
const RUNG = { grammar: 'grammar', context: 'context', taught: 'taught', guess: 'guess', none: 'no reading' };

/* ── plots: equal-area stereonet, histogram bars, a curve with a reference line ── */
// a direction-cosine vector to the net: bearing projects to a disc of radius √2 with north up; the net has radius R and y down
const proj = (v, R) => { const [x, y] = equalArea.project(v); return [x * R / Math.SQRT2, -y * R / Math.SQRT2]; };
function svgNet(b) {
  const R = 84, c = 104, lab = (x, y, t) => `<text x="${(c + x + (x > 20 ? -7 : 7)).toFixed(1)}" y="${(c + y - 6).toFixed(1)}" text-anchor="${x > 20 ? 'end' : 'start'}">${escHtml(t)}</text>`;
  let s = `<svg viewBox="0 0 208 208" width="208" height="208" role="img" aria-label="Lower-hemisphere equal-area stereonet"><circle class="netbg" cx="${c}" cy="${c}" r="${R}"/><path class="grid" d="M${c - 5} ${c}h10M${c} ${c - 5}v10"/><path class="ax" d="M${c} ${c - R}v-7"/><text x="${c}" y="10" text-anchor="middle">N</text>`;
  b.planes.forEach(p => {
    const sv = conversions.lineToDcos(p.dd - 90, 0), dv = conversions.lineToDcos(p.dd, p.dip), pts = [];
    for (let k = 0; k <= 60; k++) {
      const th = Math.PI * k / 60, [x, y] = proj(sv.map((e, i) => Math.cos(th) * e + Math.sin(th) * dv[i]), R);
      pts.push((c + x).toFixed(1) + ' ' + (c + y).toFixed(1));
    }
    const [px, py] = proj(conversions.planeToDcos(p.dd, p.dip), R);
    s += `<path class="ln" d="M${pts.join('L')}"/><rect class="pole" x="${(c + px - 3.5).toFixed(1)}" y="${(c + py - 3.5).toFixed(1)}" width="7" height="7"/>${lab(px, py, 'pole')}`;
  });
  b.lines.forEach(l => { const [x, y] = proj(conversions.lineToDcos(l.tr, l.pl), R); s += `<circle class="pt" cx="${(c + x).toFixed(1)}" cy="${(c + y).toFixed(1)}" r="4"/>${lab(x, y, l.label)}`; });
  return s + '</svg>';
}
function svgBars(b) {
  const W = 340, H = 150, x0 = 30, nb = b.bins.length, bw = (W - x0 - 6) / nb, top = Math.max(...b.bins);
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" role="img" aria-label="${escHtml(b.label)}"><path class="ax" d="M${x0} 6V${H}H${W - 6}"/><text x="${x0 - 4}" y="12" text-anchor="end">${top}</text><text x="${x0 - 4}" y="${H}" text-anchor="end">0</text>`;
  b.bins.forEach((n, i) => { const h = n / top * (H - 10); s += `<rect class="barfill" x="${(x0 + i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}"/>`; });
  b.ticks.forEach((t, i) => { const f = i / (b.ticks.length - 1); s += `<text x="${(x0 + f * (W - x0 - 6)).toFixed(1)}" y="${H + 14}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${escHtml(t)}</text>`; });
  return s + '</svg>';
}
/* ── charts: a histogram block drawn by @gcu/plot ── */
// The block stays plain data; the drawing reads the theme's tokens when it happens, so a theme change or a new width
// redraws it (drawCharts). Each bin is a bar of its own, centred between its edges, so a log axis gets them right.
const chartLabel = b => `${b.label}: ${b.bins.length} bins from ${fmt(b.lo, 3)} to ${fmt(b.hi, 3)}${b.log ? ', log scale' : ''}, the tallest ${Math.max(...b.bins)} ${b.ylabel || ''}`.trim();
export function drawChart(cv) {
  const b = JSON.parse(cv.dataset.chart), css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const host = cv.closest('.ans') || cv.parentElement, W = Math.max(260, Math.min(560, (host && host.clientWidth) || 560)), H = Math.round(W * 0.42) + 30;
  const fig = new Figure(1, 1, { figsize: [W, H], facecolor: 'rgba(0,0,0,0)' }), ax = fig.axes[0];
  ax._bgcolor = 'rgba(0,0,0,0)'; ax._textColor = tok('--au-fg-muted'); ax._gridColor = tok('--au-border'); ax._frameColor = tok('--au-rule');
  const n = b.bins.length, edge = i => b.log ? b.lo * Math.pow(b.hi / b.lo, i / n) : b.lo + (b.hi - b.lo) * i / n, color = tok('--au-info');
  for (let i = 0; i < n; i++) { const e0 = edge(i), e1 = edge(i + 1); if (b.bins[i]) ax.bar([(e0 + e1) / 2], [b.bins[i]], { width: (e1 - e0) * 0.94, color }); }
  if (b.log) ax.set_xscale('log');
  ax.set_xlim(b.lo, b.hi);
  if (b.marks) ax.set_ylim(0, Math.max(...b.bins) * 1.14);
  for (const [x, name] of b.marks || []) { ax.axvline(x, { color: tok('--au-action'), linestyle: '--', linewidth: 1 }); ax.text(x, Math.max(...b.bins) * 1.02, name, { color: tok('--au-action'), fontsize: 10, ha: 'center' }); }
  if (b.xlabel) ax.set_xlabel(b.xlabel); if (b.ylabel) ax.set_ylabel(b.ylabel);
  ax.grid(true);
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);   // the CSS sizes it (the column's width, its aspect kept)
  fig.draw(cv.getContext('2d'), { dpr });
}
export function drawCharts(root) { (root || document).querySelectorAll('canvas[data-chart]').forEach(cv => { try { drawChart(cv); } catch (e) { cv.replaceWith(Object.assign(document.createElement('div'), { className: 'note err', textContent: t('The chart could not be drawn: {e}', { e: e.message }) })); } }); }
function svgCurve(b) {
  const W = 340, H = 150, x0 = 38, X = x => x0 + x / b.xmax * (W - x0 - 10), Y = y => H - y / b.ymax * (H - 10);
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" role="img" aria-label="${escHtml(b.label)}"><path class="ax" d="M${x0} 6V${H}H${W - 6}"/>`;
  if (b.ref) s += `<path class="ln2" d="M${x0} ${Y(b.ref.y).toFixed(1)}H${W - 6}"/><text x="${W - 8}" y="${(Y(b.ref.y) - 4).toFixed(1)}" text-anchor="end">${escHtml(b.ref.label)}</text>`;
  s += `<text x="${x0 - 4}" y="12" text-anchor="end">${escHtml(b.ylabel)}</text><text x="${x0 - 4}" y="${H}" text-anchor="end">0</text><path class="ln" d="M${b.points.map(p => X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('L')}"/>`;
  b.points.forEach(p => { s += `<circle class="pt" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2"/>`; });
  b.xticks.forEach(t => { s += `<text x="${X(t.x).toFixed(1)}" y="${H + 14}" text-anchor="middle">${escHtml(t.label)}</text>`; });
  return s + '</svg>';
}

/* ── blocks ── */
function blockHtml(b) {
  switch (b.t) {
    case 'big': return `<div class="big"${b.size ? ` style="font-size:${b.size}px"` : ''}${b.end ? ` data-end="${b.end}"` : ''}>${escHtml(b.v)}${b.unit ? ` <small>${escHtml(t(b.unit))}</small>` : ''}</div>`;
    case 'sub': return `<div class="sub">${escHtml(tx(b))}</div>`;
    case 'note': return `<div class="note${b.kind ? ' ' + b.kind : ''}">${escHtml(tx(b))}</div>`;
    case 'src': return `<div class="src">${escHtml(b.text)}</div>`;
    case 'lbl': return `<div class="lbl">${escHtml(tx(b))}</div>`;
    case 'kv': return `<dl class="kv">${b.rows.map(([k, v, o]) => `<dt>${escHtml(t(k))}</dt><dd>${o && o.mono ? `<code>${escHtml(v)}</code>` : escHtml(t(String(v)))}</dd>`).join('')}</dl>`;
    case 'table': return `<div class="tbl"><table><tr>${b.head.map((h, i) => `<th${b.num && b.num[i] ? ' class="n"' : ''}>${escHtml(th(h))}</th>`).join('')}</tr>${b.rows.map(r => `<tr>${r.map((v, i) => `<td${b.num && b.num[i] ? ' class="n"' : ''}>${escHtml(b.tr && b.tr.includes(i) && typeof v === 'string' ? t(v) : v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
    case 'list': return `<ul class="plain">${b.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`;
    case 'steps': return `<ol class="steps">${b.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ol>`;
    case 'pre': return `<pre>${escHtml(b.text)}</pre>`;
    case 'hbars': { const max = Math.max(...b.rows.map(r => Math.abs(r[1]))) || 1; return `<div class="hbars">${b.rows.map(([k, v, t]) => `<div class="hb"><span class="hk">${escHtml(k)}</span><span class="hbar"><i style="width:${(Math.abs(v) / max * 100).toFixed(1)}%"></i></span><span class="hv">${escHtml(t)}</span></div>`).join('')}</div>`; }
    case 'marked': { let out = '', p = 0; b.spans.forEach(([s, e]) => { out += escHtml(b.text.slice(p, s)) + '<mark>' + escHtml(b.text.slice(s, e)) + '</mark>'; p = e; }); return `<div class="sub marked">${out + escHtml(b.text.slice(p))}</div>`; }
    case 'chips': return `<div class="opts">${b.items.map(q => `<button class="chip" type="button" data-act="run" data-q="${escHtml(q)}">${escHtml(q)}</button>`).join('')}</div>`;
    case 'actions': return `<div class="opts">${b.items.map(i => i.href ? `<a class="btn" href="${escHtml(i.href)}" target="_blank" rel="noopener">${escHtml(i.label)}</a>`
      : `<button class="btn${i.go ? ' go' : ''}" type="button" data-act="${escHtml(i.act)}"${i.msg ? ` data-msg="${escHtml(i.msg)}"` : ''}${i.send ? ` data-send="${escHtml(JSON.stringify(i.send))}"` : ''}>${escHtml(i.label)}</button>`).join('')}</div>`;
    case 'net': return svgNet(b);
    // a reading the card waits for: in the app, a live value and the button that takes it; in a browser, only the words
    case 'capture': return `<div class="capture" data-kind="${escHtml(b.kind)}"><p class="how">${escHtml(b.how || '')}</p><div class="live" aria-live="off">${t(b.kind === 'position' ? 'no fix yet' : 'waiting for the compass…')}</div>${b.kind === 'position' ? `<p class="sub web-only">${t('In a browser the fix comes through the browser, which may ask its own location service for it.')}</p>` : ''}<div class="opts"><button class="btn go" type="button" data-act="take">${t(b.kind === 'position' ? 'Use my position' : 'Take reading')}</button></div></div>`;
    case 'bars': return b.lo != null ? `<figure class="chart"><canvas data-chart="${escHtml(JSON.stringify(b))}" role="img" aria-label="${escHtml(chartLabel(b))}"></canvas></figure>` : svgBars(b);
    case 'figure': return `<figure class="fig"><canvas data-fig width="${+b.w || 400}" height="${+b.h || 300}" role="img" aria-label="${escHtml(b.label || 'Figure')}"></canvas><figcaption>${escHtml(b.label || 'Figure')}</figcaption></figure>`;
    case 'curve': return svgCurve(b);
    default: return `<div class="note err">unknown block ${escHtml(b.t)}</div>`;
  }
}

/* ── a card ── */
export function cardEl(c) {
  const el = document.createElement('article');
  el.className = 'card'; el.dataset.id = c.id; el.dataset.rung = c.rung; el.tabIndex = -1;
  el.setAttribute('aria-label', `#${pad(c.id)}: ${c.raw}`); if (c.pinned) el.dataset.pinned = '1';
  const r = c.res, read = r.read.map(x => typeof x === 'string' ? escHtml(t(x)) : x.alts ? `<button class="slot" type="button" data-act="slot" data-key="${x.key}" title="${escHtml(t('Tap to change this reading'))}" aria-label="${escHtml(t('{v}: tap to read it another way', { v: x.v }))}">${escHtml(x.v)}</button>` : `<span class="slot">${escHtml(x.v)}</span>`).join(' ');
  const ask = r.ask ? `<div class="note">${escHtml(r.ask.prompt)}</div>${r.ask.options.length ? `<div class="opts">${r.ask.options.map((o, i) => `<button class="btn" type="button" data-act="answer" data-i="${i}">${escHtml(o.label)}</button>`).join('')}${r.ask.parse ? `<span class="sub">${t('or type it')}</span>` : ''}</div>` : ''}` : '';
  el.innerHTML = `<div class="q">${escHtml(c.raw)}</div>
    <div class="reply"><div class="chead"><span class="rung ${c.rung}">${t(RUNG[c.rung])}</span><span>#${pad(c.id)}</span>${c.amends ? `<span>${t('from #{n}', { n: pad(c.amends) })}</span>` : ''}<span class="ms">${c.ms < 10 ? c.ms.toFixed(1) : Math.round(c.ms)} ms</span></div>
    ${read ? `<div class="read"><span class="lbl">${t('read as')}</span> ${read}</div>` : ''}${staleLine(c)}
    <div class="ans">${r.body.map(blockHtml).join('')}${ask}${toStation(c)}</div>
    <div class="cfoot"><details class="trace"><summary>${t('how')} · ${r.trace.length} ${t(r.trace.length === 1 ? 'step' : 'steps')}</summary><ol>${r.trace.map(t => `<li>${escHtml(t)}</li>`).join('')}</ol></details>
    <span class="cacts"><button class="cact" type="button" data-act="copyans" title="${escHtml(t('Copy the answer (c)'))}">${t('copy')}</button><button class="cact" type="button" data-act="edit" title="${escHtml(t('Put this question back in the box to change it (e)'))}">${t('edit')}</button><button class="cact" type="button" data-act="pin" aria-pressed="${!!c.pinned}" title="${escHtml(t('Keep this card at the top of the session (p)'))}">${t(c.pinned ? 'pinned' : 'pin')}</button><button class="cact" type="button" data-act="branch" title="${escHtml(t('A new session with the cards up to this one'))}">${t('branch')}</button><button class="cact say" type="button" data-act="say" title="${escHtml(t('Read this answer aloud, with the phone\'s offline voice'))}">${t('say')}</button></span></div></div>`;
  const figs = r.body.filter(b => b.t === 'figure');
  el.querySelectorAll('canvas[data-fig]').forEach((cv, i) => { try { drawFigure(cv, figs[i]); } catch (e) { cv.replaceWith(Object.assign(document.createElement('div'), { className: 'note err', textContent: `The figure could not be drawn: ${e.message}` })); } });
  return el;
}

/* ── figures: plot's draw lists (plain JSON from the Python worker) replayed on a canvas, through allowlists ── */
const FIG_METHODS = new Set(['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform', 'setLineDash']);
const FIG_PROPS = new Set(['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'globalAlpha', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'imageSmoothingEnabled']);
function drawFigure(cv, f) {
  const dpr = window.devicePixelRatio || 1, w = +f.w || 400, h = +f.h || 300;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const op of f.ops || []) {
    const [name, ...args] = op;
    if (name === 'set') { if (FIG_PROPS.has(args[0])) ctx[args[0]] = args[1]; continue; }
    if (name === 'image') { figImage(ctx, ...args); continue; }
    if (!FIG_METHODS.has(name)) throw new Error(`unknown drawing step "${name}"`);
    if (name === 'setTransform') { const [a, b, c, d, e, g] = args; ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, g * dpr); continue; }
    if (name === 'resetTransform') { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); continue; }
    ctx[name](...args);
  }
}
function figImage(ctx, x, y, w, h, cols, rows, b64) {
  const bin = atob(b64), bytes = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== cols * rows * 4) throw new Error('an image of the wrong size');
  const scratch = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
  scratch.getContext('2d').putImageData(new ImageData(bytes, cols, rows), 0, 0);
  const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(scratch, x, y, w, h); ctx.imageSmoothingEnabled = smooth;
}

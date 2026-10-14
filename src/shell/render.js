// Rendering. The engine hands over plain blocks; this is the only file that turns them into markup.
import { fmt } from '../engine/core.js';
import { conversions, equalArea } from '../vendor/bearing.js';

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
    case 'big': return `<div class="big"${b.size ? ` style="font-size:${b.size}px"` : ''}${b.end ? ` data-end="${b.end}"` : ''}>${escHtml(b.v)}${b.unit ? ` <small>${escHtml(b.unit)}</small>` : ''}</div>`;
    case 'sub': return `<div class="sub">${escHtml(b.text)}</div>`;
    case 'note': return `<div class="note${b.kind ? ' ' + b.kind : ''}">${escHtml(b.text)}</div>`;
    case 'src': return `<div class="src">${escHtml(b.text)}</div>`;
    case 'lbl': return `<div class="lbl">${escHtml(b.text)}</div>`;
    case 'kv': return `<dl class="kv">${b.rows.map(([k, v, o]) => `<dt>${escHtml(k)}</dt><dd>${o && o.mono ? `<code>${escHtml(v)}</code>` : escHtml(v)}</dd>`).join('')}</dl>`;
    case 'table': return `<div class="tbl"><table><tr>${b.head.map((h, i) => `<th${b.num && b.num[i] ? ' class="n"' : ''}>${escHtml(h)}</th>`).join('')}</tr>${b.rows.map(r => `<tr>${r.map((v, i) => `<td${b.num && b.num[i] ? ' class="n"' : ''}>${escHtml(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
    case 'list': return `<ul class="plain">${b.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`;
    case 'steps': return `<ol class="steps">${b.items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ol>`;
    case 'pre': return `<pre>${escHtml(b.text)}</pre>`;
    case 'hbars': { const max = Math.max(...b.rows.map(r => Math.abs(r[1]))) || 1; return `<div class="hbars">${b.rows.map(([k, v, t]) => `<div class="hb"><span class="hk">${escHtml(k)}</span><span class="hbar"><i style="width:${(Math.abs(v) / max * 100).toFixed(1)}%"></i></span><span class="hv">${escHtml(t)}</span></div>`).join('')}</div>`; }
    case 'marked': { let out = '', p = 0; b.spans.forEach(([s, e]) => { out += escHtml(b.text.slice(p, s)) + '<mark>' + escHtml(b.text.slice(s, e)) + '</mark>'; p = e; }); return `<div class="sub marked">${out + escHtml(b.text.slice(p))}</div>`; }
    case 'chips': return `<div class="opts">${b.items.map(q => `<button class="chip" type="button" data-act="run" data-q="${escHtml(q)}">${escHtml(q)}</button>`).join('')}</div>`;
    case 'actions': return `<div class="opts">${b.items.map(i => i.href ? `<a class="btn" href="${escHtml(i.href)}" target="_blank" rel="noopener">${escHtml(i.label)}</a>`
      : `<button class="btn${i.go ? ' go' : ''}" type="button" data-act="${escHtml(i.act)}"${i.msg ? ` data-msg="${escHtml(i.msg)}"` : ''}>${escHtml(i.label)}</button>`).join('')}</div>`;
    case 'net': return svgNet(b);
    case 'bars': return svgBars(b);
    case 'figure': return `<figure class="fig"><canvas data-fig width="${+b.w || 400}" height="${+b.h || 300}" role="img" aria-label="${escHtml(b.label || 'Figure')}"></canvas><figcaption>${escHtml(b.label || 'Figure')}</figcaption></figure>`;
    case 'curve': return svgCurve(b);
    default: return `<div class="note err">unknown block ${escHtml(b.t)}</div>`;
  }
}

/* ── a card ── */
export function cardEl(c) {
  const el = document.createElement('article');
  el.className = 'card'; el.dataset.id = c.id; el.dataset.rung = c.rung;
  const r = c.res, read = r.read.map(x => typeof x === 'string' ? escHtml(x) : x.alts ? `<button class="slot" type="button" data-act="slot" data-key="${x.key}" title="Tap to change this reading">${escHtml(x.v)}</button>` : `<span class="slot">${escHtml(x.v)}</span>`).join(' ');
  const ask = r.ask ? `<div class="note">${escHtml(r.ask.prompt)}</div>${r.ask.options.length ? `<div class="opts">${r.ask.options.map((o, i) => `<button class="btn" type="button" data-act="answer" data-i="${i}">${escHtml(o.label)}</button>`).join('')}${r.ask.parse ? '<span class="sub">or type it</span>' : ''}</div>` : ''}` : '';
  el.innerHTML = `<div class="q">${escHtml(c.raw)}</div>
    <div class="reply"><div class="chead"><span class="rung ${c.rung}">${RUNG[c.rung]}</span><span>#${pad(c.id)}</span>${c.amends ? `<span>from #${pad(c.amends)}</span>` : ''}<span class="ms">${c.ms < 10 ? c.ms.toFixed(1) : Math.round(c.ms)} ms</span></div>
    ${read ? `<div class="read"><span class="lbl">read as</span> ${read}</div>` : ''}
    <div class="ans">${r.body.map(blockHtml).join('')}${ask}</div>
    <details class="trace"><summary>plan · ${r.trace.length} step${r.trace.length === 1 ? '' : 's'}</summary><ol>${r.trace.map(t => `<li>${escHtml(t)}</li>`).join('')}</ol></details></div>`;
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

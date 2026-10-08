// Rendering. The engine hands over plain blocks; this is the only file that turns them into markup.
import { fmt, rad, deg } from '../engine/core.js';
import { vLine } from '../engine/orientation.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pad = n => String(n).padStart(2, '0');
const RUNG = { grammar: 'grammar', context: 'context', taught: 'taught', none: 'no reading' };

/* ── plots: equal-area stereonet, histogram bars, variogram curve ── */
function proj(tr, pl, R) { const r = R * Math.SQRT2 * Math.sin(rad((90 - pl) / 2)); return [r * Math.sin(rad(tr)), -r * Math.cos(rad(tr))]; }
function svgNet(b) {
  const R = 84, c = 104, lab = (x, y, t) => `<text x="${(c + x + (x > 20 ? -7 : 7)).toFixed(1)}" y="${(c + y - 6).toFixed(1)}" text-anchor="${x > 20 ? 'end' : 'start'}">${esc(t)}</text>`;
  let s = `<svg viewBox="0 0 208 208" width="208" height="208" role="img" aria-label="Lower-hemisphere equal-area stereonet"><circle class="netbg" cx="${c}" cy="${c}" r="${R}"/><path class="grid" d="M${c - 5} ${c}h10M${c} ${c - 5}v10"/><path class="ax" d="M${c} ${c - R}v-7"/><text x="${c}" y="10" text-anchor="middle">N</text>`;
  b.planes.forEach(p => {
    const sv = [Math.sin(rad(p.dd - 90)), Math.cos(rad(p.dd - 90)), 0], dv = vLine(p.dd, p.dip), pts = [];
    for (let k = 0; k <= 60; k++) {
      const th = Math.PI * k / 60, v = sv.map((x, i) => Math.cos(th) * x + Math.sin(th) * dv[i]);
      const [x, y] = proj(deg(Math.atan2(v[0], v[1])), deg(Math.asin(Math.min(1, Math.max(0, -v[2])))), R);
      pts.push((c + x).toFixed(1) + ' ' + (c + y).toFixed(1));
    }
    const [px, py] = proj(p.dd + 180, 90 - p.dip, R);
    s += `<path class="ln" d="M${pts.join('L')}"/><rect class="pole" x="${(c + px - 3.5).toFixed(1)}" y="${(c + py - 3.5).toFixed(1)}" width="7" height="7"/>${lab(px, py, 'pole')}`;
  });
  b.lines.forEach(l => { const [x, y] = proj(l.tr, l.pl, R); s += `<circle class="pt" cx="${(c + x).toFixed(1)}" cy="${(c + y).toFixed(1)}" r="4"/>${lab(x, y, l.label)}`; });
  return s + '</svg>';
}
function svgBars(b) {
  const W = 340, H = 150, x0 = 30, nb = b.bins.length, bw = (W - x0 - 6) / nb, top = Math.max(...b.bins);
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" role="img" aria-label="${esc(b.label)}"><path class="ax" d="M${x0} 6V${H}H${W - 6}"/><text x="${x0 - 4}" y="12" text-anchor="end">${top}</text><text x="${x0 - 4}" y="${H}" text-anchor="end">0</text>`;
  b.bins.forEach((n, i) => { const h = n / top * (H - 10); s += `<rect class="barfill" x="${(x0 + i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}"/>`; });
  b.ticks.forEach((t, i) => { const f = i / (b.ticks.length - 1); s += `<text x="${(x0 + f * (W - x0 - 6)).toFixed(1)}" y="${H + 14}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${esc(t)}</text>`; });
  return s + '</svg>';
}
function svgCurve(b) {
  const W = 340, H = 150, x0 = 38, X = x => x0 + x / b.xmax * (W - x0 - 10), Y = y => H - y / b.ymax * (H - 10);
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" width="${W}" height="${H + 24}" role="img" aria-label="${esc(b.label)}"><path class="ax" d="M${x0} 6V${H}H${W - 6}"/>`;
  if (b.ref) s += `<path class="ln2" d="M${x0} ${Y(b.ref.y).toFixed(1)}H${W - 6}"/><text x="${W - 8}" y="${(Y(b.ref.y) - 4).toFixed(1)}" text-anchor="end">${esc(b.ref.label)}</text>`;
  s += `<text x="${x0 - 4}" y="12" text-anchor="end">${esc(b.ylabel)}</text><text x="${x0 - 4}" y="${H}" text-anchor="end">0</text><path class="ln" d="M${b.points.map(p => X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join('L')}"/>`;
  b.points.forEach(p => { s += `<circle class="pt" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2"/>`; });
  b.xticks.forEach(t => { s += `<text x="${X(t.x).toFixed(1)}" y="${H + 14}" text-anchor="middle">${esc(t.label)}</text>`; });
  return s + '</svg>';
}

/* ── blocks ── */
function blockHtml(b) {
  switch (b.t) {
    case 'big': return `<div class="big"${b.size ? ` style="font-size:${b.size}px"` : ''}${b.end ? ` data-end="${b.end}"` : ''}>${esc(b.v)}${b.unit ? ` <small>${esc(b.unit)}</small>` : ''}</div>`;
    case 'sub': return `<div class="sub">${esc(b.text)}</div>`;
    case 'note': return `<div class="note${b.kind ? ' ' + b.kind : ''}">${esc(b.text)}</div>`;
    case 'src': return `<div class="src">${esc(b.text)}</div>`;
    case 'lbl': return `<div class="lbl">${esc(b.text)}</div>`;
    case 'kv': return `<dl class="kv">${b.rows.map(([k, v, o]) => `<dt>${esc(k)}</dt><dd>${o && o.mono ? `<code>${esc(v)}</code>` : esc(v)}</dd>`).join('')}</dl>`;
    case 'table': return `<div class="tbl"><table><tr>${b.head.map((h, i) => `<th${b.num && b.num[i] ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr>${b.rows.map(r => `<tr>${r.map((v, i) => `<td${b.num && b.num[i] ? ' class="n"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
    case 'list': return `<ul class="plain">${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'steps': return `<ol class="steps">${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
    case 'pre': return `<pre>${esc(b.text)}</pre>`;
    case 'marked': { let out = '', p = 0; b.spans.forEach(([s, e]) => { out += esc(b.text.slice(p, s)) + '<mark>' + esc(b.text.slice(s, e)) + '</mark>'; p = e; }); return `<div class="sub marked">${out + esc(b.text.slice(p))}</div>`; }
    case 'chips': return `<div class="opts">${b.items.map(q => `<button class="chip" type="button" data-act="run" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
    case 'actions': return `<div class="opts">${b.items.map(i => i.href ? `<a class="btn" href="${esc(i.href)}" target="_blank" rel="noopener">${esc(i.label)}</a>`
      : `<button class="btn${i.go ? ' go' : ''}" type="button" data-act="${esc(i.act)}"${i.msg ? ` data-msg="${esc(i.msg)}"` : ''}>${esc(i.label)}</button>`).join('')}</div>`;
    case 'net': return svgNet(b);
    case 'bars': return svgBars(b);
    case 'curve': return svgCurve(b);
    default: return `<div class="note err">unknown block ${esc(b.t)}</div>`;
  }
}

/* ── a card ── */
export function cardEl(c) {
  const el = document.createElement('article');
  el.className = 'card'; el.dataset.id = c.id;
  const r = c.res, read = r.read.map(x => typeof x === 'string' ? esc(x) : x.alts ? `<button class="slot" type="button" data-act="slot" data-key="${x.key}" title="Tap to change this reading">${esc(x.v)}</button>` : `<span class="slot">${esc(x.v)}</span>`).join(' ');
  const ask = r.ask ? `<div class="note">${esc(r.ask.prompt)}</div><div class="opts">${r.ask.options.map((o, i) => `<button class="btn" type="button" data-act="answer" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>` : '';
  el.innerHTML = `<div class="chead"><span>#${pad(c.id)}</span><span class="rung ${c.rung}">${RUNG[c.rung]}</span>${c.amends ? `<span>from #${pad(c.amends)}</span>` : ''}<span class="ms">${c.ms < 10 ? c.ms.toFixed(1) : Math.round(c.ms)} ms</span></div>
    <div class="q">${esc(c.raw)}</div>${read ? `<div class="read"><span class="lbl">read as</span> ${read}</div>` : ''}
    <div class="ans">${r.body.map(blockHtml).join('')}${ask}</div>
    <details class="trace"><summary>plan · ${r.trace.length} step${r.trace.length === 1 ? '' : 's'}</summary><ol>${r.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>`;
  return el;
}
export { fmt };

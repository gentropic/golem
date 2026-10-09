// ⚠ VENDORED — DO NOT EDIT. @gcu/plot (matplotlib-shaped plotting; figures leave the worker as draw lists), copied from ../auditable/ext/plot/index.js at auditable 774234c3 (9 Oct 2026, MIT).
// Loaded only inside the Python worker. Re-vendor by copying that file here.

// ⚠ GENERATED FILE — DO NOT EDIT. Source: ext/plot/src/  Build: node ext/plot/build.js
// @gcu/plot — Canvas 2D plotting library for Auditable
// Line, scatter, bar, histogram, imshow. GCU dark theme.

// -- style.js --

// Style palette — auditable-native dark by default. Mutated in place
// by `plt.style.use(name)` so all subsequent renders pick up the new
// palette. Per-Axes overrides (`_bgcolor`, `_textColor`, `_gridColor`,
// `_frameColor`) still win; this just changes the fallback colors used
// when an Axes doesn't override.
//
// Notebooks loaded from a .ipynb through @gcu/ipynb get an automatic
// `plt.style.use('default')` injected right after their
// `import matplotlib.pyplot` line, so they render with matplotlib's
// light defaults (matching what their authors saw in Jupyter). Native
// auditable cells keep the dark default unless they call style.use
// themselves.

const _style = {
  bgcolor: '#1a1a1a',
  textColor: '#ccc',
  gridColor: '#333',
  frameColor: '#666',
  // figure-level background. Transparent on dark so the notebook's
  // dark bg shows through; an opaque off-white on the light palette so
  // dark text on the figure surface contrasts properly even when the
  // surrounding notebook is dark.
  figureFacecolor: 'transparent',
  // legend background (rgba for semi-transparent overlay)
  legendBg: 'rgba(30,30,30,0.85)',
  legendBorder: '#555',
};

const _DARK = {
  bgcolor: '#1a1a1a',
  textColor: '#ccc',
  gridColor: '#333',
  frameColor: '#666',
  figureFacecolor: 'transparent',
  legendBg: 'rgba(30,30,30,0.85)',
  legendBorder: '#555',
};

const _LIGHT = {
  bgcolor: '#ffffff',
  textColor: '#333333',
  gridColor: '#cccccc',
  frameColor: '#666666',
  // matplotlib's default figure facecolor is white; the surrounding
  // notebook bg is dark, so we make the figure an opaque card.
  figureFacecolor: '#fafafa',
  legendBg: 'rgba(255,255,255,0.9)',
  legendBorder: '#999999',
};

// matplotlib's style.use accepts a name (or list of names). We honor a
// small set: 'default' / 'classic' / 'matplotlib' → light palette;
// 'dark_background' → dark palette. Anything else is silently ignored
// (matplotlib itself ignores names it doesn't know in some contexts).
function setStyle(name) {
  const names = Array.isArray(name) ? name : [name];
  for (const n of names) {
    const key = String(n || '').toLowerCase();
    if (key === 'default' || key === 'classic' || key === 'matplotlib' ||
        key === 'seaborn' || key === 'seaborn-whitegrid' ||
        key === 'ggplot' || key === 'bmh') {
      Object.assign(_style, _LIGHT);
    } else if (key === 'dark_background') {
      Object.assign(_style, _DARK);
    }
    // unknown style names: leave palette alone
  }
}

// -- scale.js --

// Linear scale with Heckbert nice-number tick generation

function _niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else {
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  }
  return nice * Math.pow(10, exp);
}

class LinearScale {
  constructor(domain, range) {
    this.domain = domain;
    this.range = range;
  }

  transform(v) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const dr = d1 - d0;
    if (dr === 0) return (r0 + r1) / 2;
    return r0 + (v - d0) / dr * (r1 - r0);
  }

  inverse(px) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const rr = r1 - r0;
    if (rr === 0) return (d0 + d1) / 2;
    return d0 + (px - r0) / rr * (d1 - d0);
  }

  ticks(count) {
    if (count == null) count = 5;
    const [lo, hi] = this.domain;
    const range = _niceNum(hi - lo, false);
    const step = _niceNum(range / (count - 1), true);
    const start = Math.ceil(lo / step) * step;
    const end = Math.floor(hi / step) * step;
    const ticks = [];
    // safety: ensure finite loop
    if (step <= 0 || !isFinite(start) || !isFinite(end)) return [lo, hi];
    for (let v = start; v <= end + step * 0.5; v += step) {
      ticks.push(+v.toPrecision(12));
    }
    return ticks;
  }

  tickFormat() {
    const [lo, hi] = this.domain;
    const range = Math.abs(hi - lo);
    if (range === 0) return (v) => String(v);
    const mag = Math.log10(Math.max(Math.abs(lo), Math.abs(hi), 1e-30));
    if (mag > 6 || mag < -3) return (v) => v.toExponential(1);
    const dec = Math.max(0, -Math.floor(Math.log10(range)) + 1);
    return (v) => v.toFixed(Math.min(dec, 6));
  }
}

// Log10 scale — matplotlib's `set_xscale('log')` equivalent. Domain
// must be strictly positive; callers should clamp lo before passing.
// Ticks are integer powers of 10 within the domain.
class LogScale {
  constructor(domain, range) {
    // Clamp lo to a tiny positive value if non-positive (defensive).
    const [d0, d1] = domain;
    this.domain = [d0 > 0 ? d0 : 1e-300, d1 > 0 ? d1 : 1];
    this.range = range;
  }

  transform(v) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    if (v <= 0) return r0;
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    const dr = l1 - l0;
    if (dr === 0) return (r0 + r1) / 2;
    return r0 + (Math.log10(v) - l0) / dr * (r1 - r0);
  }

  inverse(px) {
    const [d0, d1] = this.domain;
    const [r0, r1] = this.range;
    const rr = r1 - r0;
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    if (rr === 0) return Math.pow(10, (l0 + l1) / 2);
    return Math.pow(10, l0 + (px - r0) / rr * (l1 - l0));
  }

  ticks() {
    const [lo, hi] = this.domain;
    const loE = Math.ceil(Math.log10(lo));
    const hiE = Math.floor(Math.log10(hi));
    const ticks = [];
    // Limit decade-count so degenerate domains don't blow up.
    if (hiE - loE > 30) return [lo, hi];
    for (let e = loE; e <= hiE; e++) ticks.push(Math.pow(10, e));
    return ticks;
  }

  tickFormat() {
    return (v) => {
      const e = Math.round(Math.log10(v));
      // Pretty-print integer powers as 10^N.
      if (Math.abs(Math.pow(10, e) - v) / v < 1e-6) {
        if (e >= -3 && e <= 4) return Math.pow(10, e).toString();
        return '10^' + e;
      }
      return v.toExponential(1);
    };
  }
}

// -- color.js --

// Colormaps — perceptual maps interpolate anchor stops sampled from the
// reference palettes (the retired polynomial fits went badly wrong at the
// ends: viridis(1) came out green, coolwarm(1) white).

function _lerpCmap(stops) {
  return (t) => {
    t = Math.max(0, Math.min(1, t));
    const x = t * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(x));
    const f = x - k;
    const c = [0, 1, 2].map((i) => Math.round(stops[k][i] + (stops[k + 1][i] - stops[k][i]) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
}

// Direct-function colormaps for the easy ones — jet, gray, hot, cool
// are well-defined by closed-form ramps.
function _rgb(r, g, b) {
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}

const _cmaps = {
  viridis: _lerpCmap([
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [33, 145, 140],
    [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
  ]),
  coolwarm: _lerpCmap([
    [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249], [221, 221, 221],
    [245, 196, 173], [244, 154, 123], [222, 96, 77], [180, 4, 38],
  ]),
  turbo: _lerpCmap([
    [48, 18, 59], [70, 107, 227], [40, 167, 221], [32, 229, 181], [110, 252, 107],
    [202, 240, 52], [253, 188, 39], [240, 96, 12], [122, 4, 3],
  ]),
  plasma: _lerpCmap([
    [13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137], [219, 92, 104],
    [244, 136, 73], [254, 188, 43], [244, 238, 39], [240, 249, 33],
  ]),
  inferno: _lerpCmap([
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66],
    [245, 125, 21], [250, 193, 39], [245, 240, 132], [252, 255, 164],
  ]),
  magma: _lerpCmap([
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [158, 47, 127], [222, 73, 104],
    [247, 120, 107], [254, 176, 120], [254, 229, 160], [252, 253, 191],
  ]),
  cividis: _lerpCmap([
    [0, 32, 77], [26, 51, 105], [60, 77, 110], [92, 102, 112], [124, 123, 120],
    [155, 148, 115], [187, 173, 108], [222, 202, 92], [255, 234, 70],
  ]),
  // direct-function ramps
  jet: (t) => {
    t = Math.max(0, Math.min(1, t));
    let r, g, b;
    if (t < 0.25) { r = 0; g = t * 4; b = 1; }
    else if (t < 0.5) { r = 0; g = 1; b = 1 - (t - 0.25) * 4; }
    else if (t < 0.75) { r = (t - 0.5) * 4; g = 1; b = 0; }
    else { r = 1; g = 1 - (t - 0.75) * 4; b = 0; }
    return _rgb(r, g, b);
  },
  gray: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(t, t, t); },
  Greys: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(1 - t, 1 - t, 1 - t); },
  hot: (t) => {
    t = Math.max(0, Math.min(1, t));
    return _rgb(Math.min(1, t * 3), Math.max(0, t * 3 - 1), Math.max(0, t * 3 - 2));
  },
  cool: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(t, 1 - t, 1); },
  spring: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(1, t, 1 - t); },
  summer: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(t, 0.5 + t * 0.5, 0.4); },
  autumn: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(1, t, 0); },
  winter: (t) => { t = Math.max(0, Math.min(1, t)); return _rgb(0, t, 1 - 0.5 * t); },
  // Named reversed variants — matplotlib's `_r` suffix convention
  viridis_r: (t) => _cmaps.viridis(1 - t),
  plasma_r: (t) => _cmaps.plasma(1 - t),
  inferno_r: (t) => _cmaps.inferno(1 - t),
  magma_r: (t) => _cmaps.magma(1 - t),
  jet_r: (t) => _cmaps.jet(1 - t),
  gray_r: (t) => _cmaps.gray(1 - t),
};

function getCmap(name) {
  if (typeof name === 'function') return name;
  // an array of colors is a categorical map (matplotlib's ListedColormap):
  // [0,1) splits into equal buckets, one color each
  if (Array.isArray(name)) {
    const n = name.length;
    return (t) => name[Math.max(0, Math.min(n - 1, Math.floor(Math.max(0, Math.min(1, t)) * n)))];
  }
  return _cmaps[name] || _cmaps.viridis;
}

function cmapRgb(name, t) {
  return getCmap(name)(t);
}

function renderColorbar(ctx, x, y, w, h, cmap, vmin, vmax, opts) {
  const cmapFn = getCmap(cmap);
  const n = Math.max(1, Math.floor(h));
  for (let i = 0; i < n; i++) {
    const t = 1 - i / (n - 1);
    ctx.fillStyle = cmapFn(t);
    ctx.fillRect(x, y + i, w, Math.ceil(h / n) + 1);
  }
  // tick labels
  const textColor = opts?.textColor || '#ccc';
  ctx.fillStyle = textColor;
  ctx.font = opts?.font || '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const nticks = opts?.nticks || 5;
  const fmt = opts?.format || ((v) => {
    const range = Math.abs(vmax - vmin);
    if (range === 0) return String(v);
    const mag = Math.log10(Math.max(Math.abs(vmin), Math.abs(vmax), 1e-30));
    if (mag > 6 || mag < -3) return v.toExponential(1);
    const dec = Math.max(0, -Math.floor(Math.log10(range)) + 1);
    return v.toFixed(Math.min(dec, 6));
  });
  for (let i = 0; i < nticks; i++) {
    const t = i / (nticks - 1);
    const val = vmin + (1 - t) * (vmax - vmin);
    const ty = y + t * h;
    ctx.fillText(fmt(val), x + w + 4, ty);
  }
  // label
  if (opts?.label) {
    ctx.save();
    ctx.translate(x + w + 40, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.label, 0, 0);
    ctx.restore();
  }
}

// -- format.js --

// Format string parser: 'r--o' → { color, linestyle, marker }

const _colorChars = { b: '#4488ff', g: '#44bb44', r: '#ee4444', c: '#44dddd', m: '#dd44dd', y: '#dddd44', k: '#000000', w: '#ffffff' };
const _markerChars = new Set(['o', 's', '^', 'v', '<', '>', 'd', '+', 'x', '.']);

function parseFormat(fmt) {
  if (!fmt || typeof fmt !== 'string') return {};
  const result = {};
  let i = 0;
  // check for color char
  if (_colorChars[fmt[i]]) {
    result.color = _colorChars[fmt[i]];
    i++;
  }
  // check for linestyle
  if (fmt[i] === '-') {
    if (fmt[i + 1] === '-') { result.linestyle = '--'; i += 2; }
    else if (fmt[i + 1] === '.') { result.linestyle = '-.'; i += 2; }
    else { result.linestyle = '-'; i++; }
  } else if (fmt[i] === ':') {
    result.linestyle = ':';
    i++;
  }
  // check for marker
  if (_markerChars.has(fmt[i])) {
    result.marker = fmt[i];
    i++;
  }
  return result;
}

function dashArray(linestyle) {
  switch (linestyle) {
    case '--': return [6, 4];
    case '-.': return [6, 2, 2, 2];
    case ':': return [2, 3];
    default: return [];
  }
}

// -- record.js --

// Figures as data: a recording 2D context and its replay.
//
// `recordingContext(w, h)` stands in for a CanvasRenderingContext2D. Every call plot makes on
// it becomes one plain-JSON op, `[name, ...args]`, and every property assignment becomes
// `['set', name, value]`. `replay(ctx, list)` plays the ops back on a real context. Nothing here
// touches the DOM, so a figure can be drawn in a worker or Node and shown somewhere else.
//
// Text widths: every font plot uses is monospace, so `measureText(s)` answers
// s.length × 0.6 × px. That keeps layout identical in every host, Node included.
//
// Ops whose numeric arguments are not finite are dropped, which is what a canvas does with
// them anyway (and JSON could not carry NaN).
//
// One op is not a canvas call: `['image', x, y, w, h, cols, rows, rgbaBase64]`, a whole
// colour-mapped raster (imshow) in one op instead of one fillRect per cell.

const _METHODS = new Set([
  'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'rect',
  'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip', 'fillRect',
  'strokeRect', 'clearRect', 'fillText', 'strokeText', 'translate', 'rotate', 'scale',
  'transform', 'setTransform', 'resetTransform', 'setLineDash',
]);

const _DEFAULTS = {
  fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '10px sans-serif',
  textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, lineCap: 'butt',
  lineJoin: 'miter', lineDashOffset: 0, imageSmoothingEnabled: true,
};

function _fontPx(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || '');
  return m ? +m[1] : 10;
}

function _finiteArgs(args) {
  for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) return false;
  return true;
}

function recordingContext(width, height) {
  const ops = [];
  let state = { ..._DEFAULTS };
  let dash = [];
  const stack = [];
  const target = {
    _plotRecorder: true,
    ops,
    canvas: { width, height },
    measureText(s) {
      return { width: String(s).length * 0.6 * _fontPx(state.font) };
    },
    getLineDash() { return dash.slice(); },
    // the raster op (see the header)
    _image(x, y, w, h, cols, rows, rgba) {
      if (!_finiteArgs([x, y, w, h])) return;
      ops.push(['image', x, y, w, h, cols, rows, _toBase64(rgba)]);
    },
  };
  return new Proxy(target, {
    get(t, name) {
      if (name in t) return t[name];
      if (typeof name === 'string' && _METHODS.has(name)) {
        return (...args) => {
          if (name === 'save') stack.push({ state: { ...state }, dash: dash.slice() });
          if (name === 'restore' && stack.length) { const s = stack.pop(); state = s.state; dash = s.dash; }
          if (name === 'setLineDash') { dash = Array.from(args[0] || []); ops.push(['setLineDash', dash.slice()]); return; }
          if (!_finiteArgs(args)) return;
          ops.push([name, ...args]);
        };
      }
      return state[name];
    },
    set(t, name, value) {
      state[name] = value;
      ops.push(['set', name, value]);
      return true;
    },
  });
}

function isRecordingContext(ctx) {
  return !!(ctx && ctx._plotRecorder);
}

// Play a draw list back on a real 2D context.
function replay(ctx, list) {
  const ops = Array.isArray(list) ? list : list && list.ops;
  if (!Array.isArray(ops)) throw new TypeError('replay: expected a draw list (fig.toDrawList()) or its ops');
  for (const op of ops) {
    const [name, ...args] = op;
    if (name === 'set') { ctx[args[0]] = args[1]; continue; }
    if (name === 'image') { _replayImage(ctx, ...args); continue; }
    if (!_METHODS.has(name)) throw new Error(`replay: unknown op '${name}'`);
    ctx[name](...args);
  }
}

function _replayImage(ctx, x, y, w, h, cols, rows, b64) {
  const bytes = _fromBase64(b64);
  const make = (cw, ch) => (typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(cw, ch)
    : Object.assign(document.createElement('canvas'), { width: cw, height: ch }));
  const scratch = make(cols, rows);
  const sctx = scratch.getContext('2d');
  sctx.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.length), cols, rows), 0, 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, x, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

// 'rgb(r,g,b)' / 'rgba(r,g,b,a)' / '#rgb' / '#rrggbb' → [r, g, b, a] bytes, or null
function parseColorBytes(c) {
  if (typeof c !== 'string') return null;
  let m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 255 : Math.round(+m[4] * 255)];
  m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  return null;
}

function _toBase64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

function _fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// -- axes.js --

// Axes — trace storage, layout computation, canvas rendering






const _defaultColors = ['#c89b3c', '#5ba3b5', '#e07050', '#7a8b99', '#b5854b', '#5bb58b'];

// matplotlib short-form aliases — `c` for color, `ls` for linestyle,
// `lw` for linewidth, etc. We accept both, callers in the wild use
// either. Resolve into canonical names at trace ingress so renderers
// can read a single key.
const _ALIASES = {
  c: 'color',
  ls: 'linestyle',
  lw: 'linewidth',
  ms: 'markersize',
  mec: 'markeredgecolor',
  mfc: 'markerfacecolor',
  mew: 'markeredgewidth',
  // matplotlib's scatter() takes plural `edgecolors` / `linewidths`
  // (because it can color edges per-point); the rest of our renderer
  // reads singular. Alias both forms so user code that types plural
  // doesn't silently lose the edge.
  edgecolors: 'edgecolor',
  linewidths: 'linewidth',
};
function _resolveAliases(o) {
  if (!o) return o;
  for (const [a, k] of Object.entries(_ALIASES)) {
    if (o[a] !== undefined && o[k] === undefined) o[k] = o[a];
  }
  return o;
}

// Coerce inputs from various ndarray libraries (natra's WASM-arena
// descriptor, vec's data-backed shape, plain TypedArrays, native JS
// arrays, lists from adder) into a JS array we can iterate, spread,
// and Math.min/.max over. Used at every trace ingress so plt.hist /
// plt.plot / plt.bar etc. don't have to care about input shape.
function _toArr(x) {
  if (Array.isArray(x)) return x;
  if (x == null) return [];
  // natra adder wrapper: {_nd: true, _arr: <descriptor>}
  if (x._nd && x._arr) {
    const a = x._arr;
    if (a.memory && a.memory.buffer && a.dtype === 'f64' && typeof a.ptr === 'number') {
      return Array.from(new Float64Array(a.memory.buffer, a.ptr, a.length));
    }
    if (a.data) return Array.from(a.data.subarray ? a.data.subarray(0, a.length) : a.data);
  }
  // data-backed ndarray (vec / numpy-like)
  if (x.data && (x.data.buffer || ArrayBuffer.isView(x.data))) {
    return Array.from(x.data.length != null ? x.data.subarray ? x.data.subarray(0, x.length || x.data.length) : x.data : x.data);
  }
  // TypedArray / iterable
  if (ArrayBuffer.isView(x)) return Array.from(x);
  if (typeof x[Symbol.iterator] === 'function') return Array.from(x);
  return [x];
}

class Axes {
  constructor() {
    this._traces = [];
    this._title = null;
    this._xlabel = null;
    this._ylabel = null;
    this._xlim = null;
    this._ylim = null;
    this._grid = false;
    this._gridOpts = {};
    this._legend = false;
    this._legendOpts = {};
    this._colorbar = false;
    this._colorbarOpts = {};
    this._aspect = 'auto';
    this._colorIdx = 0;
  }

  _nextColor() {
    return _defaultColors[this._colorIdx++ % _defaultColors.length];
  }

  plot(x, y, fmtOrOpts, opts) {
    let o = {};
    if (typeof fmtOrOpts === 'string') {
      o = { ...parseFormat(fmtOrOpts), ...opts };
    } else if (fmtOrOpts) {
      o = { ...fmtOrOpts };
      if (o.fmt) Object.assign(o, parseFormat(o.fmt));
    }
    _resolveAliases(o);
    if (!o.color) o.color = this._nextColor();
    // Coerce series-shaped inputs (sadpan WrapperSeries, natra ndarray,
    // TypedArray, etc.) to plain JS arrays so the renderer's .length
    // and [i] reads work. Without this, `plt.plot(df['x'], df['y'])`
    // silently rendered nothing (WrapperSeries has no .length).
    this._traces.push({ type: 'line', x: _toArr(x), y: _toArr(y), opts: o });
    return this;
  }

  scatter(x, y, opts) {
    const o = _resolveAliases({ ...opts });
    if (!o.color) o.color = this._nextColor();
    // Same Series-coercion contract as plot(): a sadpan WrapperSeries
    // has no .length, so without _toArr the dot-render loop did
    // nothing and the axes auto-extent fell back to 0..1.
    this._traces.push({ type: 'scatter', x: _toArr(x), y: _toArr(y), opts: o });
    return this;
  }

  bar(x, heights, opts) {
    const o = _resolveAliases({ ...opts });
    if (!o.color) o.color = this._nextColor();
    this._traces.push({ type: 'bar', x: _toArr(x), heights: _toArr(heights), opts: o });
    return this;
  }

  barh(y, widths, opts) {
    const o = _resolveAliases({ ...opts });
    if (!o.color) o.color = this._nextColor();
    this._traces.push({ type: 'barh', y: _toArr(y), widths: _toArr(widths), opts: o });
    return this;
  }

  hist(data, opts) {
    const o = _resolveAliases({ ...opts });
    if (!o.color) o.color = this._nextColor();
    // Normalize data + bins to JS arrays so ndarray inputs (natra,
    // vec, TypedArrays) work the same as native lists.
    const dataArr = _toArr(data);
    if (o.bins != null && typeof o.bins !== 'number') o.bins = _toArr(o.bins);
    this._traces.push({ type: 'hist', data: dataArr, opts: o });
    return this;
  }

  // matshow — render a 2D matrix as a heatmap. Accepts diverse inputs:
  // a sadpan DataFrame (uses .to_numpy()), a natra ndarray, a
  // Float64Array with .shape, a nested JS array, or already-flat data
  // with shape. Extracts flat data + nx + ny + passes through to imshow.
  matshow(data, opts) {
    const o = _resolveAliases({ ...opts });
    let flat, nx, ny;
    // sadpan DataFrame
    if (data && data._tbl && typeof data.to_numpy === 'function') {
      const arr2d = data.to_numpy();
      ny = arr2d.shape[0];
      nx = arr2d.shape[1];
      flat = arr2d.data instanceof Float64Array ? arr2d.data : Float64Array.from([].concat(...arr2d.tolist()));
    } else if (data instanceof Float64Array && Array.isArray(data.shape) && data.shape.length === 2) {
      ny = data.shape[0]; nx = data.shape[1]; flat = data;
    } else if (data && data.data instanceof Float64Array && Array.isArray(data.shape) && data.shape.length === 2) {
      ny = data.shape[0]; nx = data.shape[1]; flat = data.data;
    } else if (data && data._nd && data._arr && data._arr.ndim === 2) {
      const a = data._arr;
      ny = a.shape[0]; nx = a.shape[1];
      flat = new Float64Array(a.memory.buffer, a.ptr, ny * nx);
    } else if (Array.isArray(data) && Array.isArray(data[0])) {
      ny = data.length;
      nx = data[0].length;
      flat = new Float64Array(ny * nx);
      for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) flat[i * nx + j] = data[i][j];
    } else {
      // Fall back to imshow as-is and let it complain.
      return this.imshow(data, undefined, undefined, opts);
    }
    // matshow defaults to 'upper' origin (row 0 at top) — opposite of
    // imshow's default. honor unless caller explicitly set otherwise.
    if (!o.origin) o.origin = 'upper';
    // Aspect equal so cells render as squares.
    if (this._aspect === 'auto') this._aspect = 'equal';
    return this.imshow(flat, nx, ny, o);
  }

  imshow(data, nx, ny, opts) {
    this._traces.push({ type: 'imshow', data, nx, ny, opts: _resolveAliases({ ...opts }) });
    // default to equal aspect for grid data (matches matplotlib)
    if (this._aspect === 'auto') this._aspect = 'equal';
    return this;
  }

  axhline(y, opts) {
    this._traces.push({ type: 'hline', y, opts: _resolveAliases({ color: '#888', linewidth: 1, ...opts }) });
    return this;
  }

  axvline(x, opts) {
    this._traces.push({ type: 'vline', x, opts: _resolveAliases({ color: '#888', linewidth: 1, ...opts }) });
    return this;
  }

  // vlines(x, ymin, ymax) — vertical line segments. x can be scalar or
  // array. Implemented as line traces (x=[x_i,x_i] y=[ymin,ymax]) so no
  // new trace type is needed.
  vlines(x, ymin, ymax, opts) {
    const xs = _toArr(x);
    const o = _resolveAliases({ ...opts });
    if (!o.color && o.colors) o.color = Array.isArray(o.colors) ? o.colors[0] : o.colors;
    if (!o.color) o.color = this._nextColor();
    for (const xv of xs) {
      this._traces.push({ type: 'line', x: [xv, xv], y: [ymin, ymax], opts: { ...o } });
    }
    return this;
  }

  hlines(y, xmin, xmax, opts) {
    const ys = _toArr(y);
    const o = _resolveAliases({ ...opts });
    if (!o.color && o.colors) o.color = Array.isArray(o.colors) ? o.colors[0] : o.colors;
    if (!o.color) o.color = this._nextColor();
    for (const yv of ys) {
      this._traces.push({ type: 'line', x: [xmin, xmax], y: [yv, yv], opts: { ...o } });
    }
    return this;
  }

  text(x, y, text, opts) {
    this._traces.push({ type: 'text', x, y, text, opts: _resolveAliases({ color: '#ccc', fontsize: 11, ...opts }) });
    return this;
  }

  set_title(text, opts) { this._title = { text, opts }; return this; }
  set_xlabel(text, opts) { this._xlabel = { text, opts }; return this; }
  set_ylabel(text, opts) { this._ylabel = { text, opts }; return this; }
  set_xlim(lo, hi) {
    // matplotlib's set_xlim accepts either set_xlim(lo, hi) or set_xlim([lo, hi]).
    if (Array.isArray(lo) && hi === undefined) { hi = lo[1]; lo = lo[0]; }
    this._xlim = [lo, hi]; return this;
  }
  set_ylim(lo, hi) {
    if (Array.isArray(lo) && hi === undefined) { hi = lo[1]; lo = lo[0]; }
    this._ylim = [lo, hi]; return this;
  }
  set_xscale(scale) { this._xscale = scale; return this; }
  set_yscale(scale) { this._yscale = scale; return this; }
  set_zorder(_n) { /* z-order is per-trace; axes-level ordering not modelled */ return this; }
  set_aspect(aspect) { this._aspect = aspect; return this; }
  // twinx() — return a sister axes that shares this one's x-scale, has
  // its own y-scale, and renders overlaid in the same rect with its
  // y-axis on the right edge. Matches matplotlib's pyplot twinx for
  // dual-y plots (e.g. histogram on left axis, CDF on right axis).
  // The twin is NOT added to the figure's axes grid — its parent
  // renders it as part of its own _render pass.
  twinx() {
    const t = new Axes();
    t._twinOf = this;
    // Inherit x-scale settings so they stay in sync.
    t._xscale = this._xscale;
    t._xlim = this._xlim;
    this._twin = t;
    return t;
  }
  // twiny() in matplotlib shares y not x. Rare in practice; alias to
  // twinx for the common-case "I want two y-axes" intent.
  twiny() { return this.twinx(); }

  legend(opts) { this._legend = true; this._legendOpts = opts || {}; return this; }

  colorbar(opts) { this._colorbar = true; this._colorbarOpts = opts || {}; return this; }

  grid(on, opts) {
    this._grid = on !== false;
    if (opts) this._gridOpts = opts;
    return this;
  }

  // --- rendering ---

  _render(ctx, rect) {
    // Color theme — defaults come from the shared `_style` palette
    // (auditable-native dark unless `plt.style.use('default')` has
    // switched it). Per-Axes overrides (`_bgcolor`, `_textColor`,
    // `_gridColor`, `_frameColor`) still win for callers that want a
    // specific cell to render with custom colors.
    const bgcolor   = this._bgcolor   || _style.bgcolor;
    const textColor = this._textColor || _style.textColor;
    const gridColor = this._gridColor || _style.gridColor;
    const frameColor = this._frameColor || _style.frameColor;
    const font = '11px monospace';
    const smallFont = '10px monospace';

    // compute margins (smaller when tick labels are hidden — caller
    // sets _hideXTicks / _hideYTicks for compact grids like
    // scatter_matrix where inner subplots don't show ticks). Callers
    // that want all subplots in a grid to share a uniform plot area
    // (so cells line up regardless of which one carries the label)
    // pass `_margins = { left, right, top, bottom }` and bypass the
    // label/tick-driven computation.
    let ml, mr, mt, mb;
    if (this._margins) {
      ml = this._margins.left   ?? 42;
      mr = this._margins.right  ?? 12;
      mt = this._margins.top    ?? 8;
      mb = this._margins.bottom ?? 26;
    } else {
      ml = this._hideYTicks ? 6 : (this._ylabel ? 55 : 42);
      mr = this._colorbar ? 70 : 12;
      // Right-side twin axis needs space for its tick labels (+ optional ylabel).
      if (this._twin) mr = Math.max(mr, this._twin._ylabel ? 55 : 42);
      mt = this._title ? 24 : 8;
      mb = this._hideXTicks ? 6 : (this._xlabel ? 38 : 26);
    }

    let plotX = rect.x + ml;
    let plotY = rect.y + mt;
    let plotW = rect.x + rect.w - mr - plotX;
    let plotH = rect.y + rect.h - mb - plotY;
    if (plotW <= 0 || plotH <= 0) return;

    // Save the pre-aspect plot rect so colorbars and other "use the
    // full reserved height" annotations don't shrink along with the
    // shrunken plot area below.
    const fullPlotY = plotY;
    const fullPlotH = plotH;

    // compute data ranges
    let [xlo, xhi] = this._xlim || this._dataExtent('x');
    let [ylo, yhi] = this._ylim || this._dataExtent('y');
    if (xlo === xhi) { xlo -= 0.5; xhi += 0.5; }
    if (ylo === yhi) { ylo -= 0.5; yhi += 0.5; }

    // aspect ratio adjustment.
    // - For an imshow-dominated axes (matshow, correlation matrix, etc.)
    //   "equal" means the cells should be square — we SHRINK the plot
    //   rect to match data aspect, leaving figure bg around it. The old
    //   behavior (expand data range) painted bg-color stripes through
    //   the data area, which looks wrong for matrix plots.
    // - For scatter/line with aspect='equal', expanding the data range
    //   matches matplotlib's behavior (more breathing room around data).
    if (this._aspect === 'equal') {
      const dataW = xhi - xlo;
      const dataH = yhi - ylo;
      const scaleX = plotW / dataW;
      const scaleY = plotH / dataH;
      const hasImshow = this._traces.some(t => t.type === 'imshow');
      if (hasImshow) {
        const scale = Math.min(scaleX, scaleY);
        const newW = dataW * scale;
        const newH = dataH * scale;
        plotX += (plotW - newW) / 2;
        plotY += (plotH - newH) / 2;
        plotW = newW;
        plotH = newH;
      } else if (scaleX < scaleY) {
        const center = (ylo + yhi) / 2;
        const half = (plotH / scaleX) / 2;
        ylo = center - half;
        yhi = center + half;
      } else {
        const center = (xlo + xhi) / 2;
        const half = (plotW / scaleY) / 2;
        xlo = center - half;
        xhi = center + half;
      }
    }

    // Log scale needs strictly-positive bounds; clamp lo to the
    // smallest positive value present in the data (falling back to
    // hi/10 or 1e-9) so set_xscale('log') with auto-extent works on
    // lognormal-shaped data.
    function _logBounds(lo, hi) {
      let l = lo, h = hi;
      if (l <= 0) l = h > 0 ? h / 1e6 : 1e-9;
      if (h <= l) h = l * 10;
      return [l, h];
    }
    const _xScaleCls = this._xscale === 'log' ? LogScale : LinearScale;
    const _yScaleCls = this._yscale === 'log' ? LogScale : LinearScale;
    const [xloS, xhiS] = this._xscale === 'log' ? _logBounds(xlo, xhi) : [xlo, xhi];
    const [yloS, yhiS] = this._yscale === 'log' ? _logBounds(ylo, yhi) : [ylo, yhi];
    const xScale = new _xScaleCls([xloS, xhiS], [plotX, plotX + plotW]);
    const yScale = new _yScaleCls([yloS, yhiS], [plotY + plotH, plotY]); // y flipped

    // axes background
    ctx.fillStyle = bgcolor;
    ctx.fillRect(plotX, plotY, plotW, plotH);

    // grid
    if (this._grid) {
      ctx.strokeStyle = this._gridOpts.color || gridColor;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = this._gridOpts.alpha || 0.8;
      const xticks = xScale.ticks();
      const yticks = yScale.ticks();
      for (const v of xticks) {
        const px = xScale.transform(v);
        ctx.beginPath(); ctx.moveTo(px, plotY); ctx.lineTo(px, plotY + plotH); ctx.stroke();
      }
      for (const v of yticks) {
        const py = yScale.transform(v);
        ctx.beginPath(); ctx.moveTo(plotX, py); ctx.lineTo(plotX + plotW, py); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // render own traces (clipped to plot area)
    const lastCmapTrace = this._renderTraces(ctx, xScale, yScale, plotX, plotY, plotW, plotH);

    // render twin overlay (own traces + right-side y-axis), if present
    if (this._twin) {
      this._twin._renderAsTwin(ctx, xScale, plotX, plotY, plotW, plotH);
    }

    // axes frame
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(plotX, plotY, plotW, plotH);

    // ticks and labels
    ctx.fillStyle = textColor;
    ctx.font = smallFont;
    const xTicks = xScale.ticks();
    const yTicks = yScale.ticks();
    const xFmt = xScale.tickFormat();
    const yFmt = yScale.tickFormat();

    if (!this._hideXTicks) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of xTicks) {
        const px = xScale.transform(v);
        ctx.beginPath(); ctx.moveTo(px, plotY + plotH); ctx.lineTo(px, plotY + plotH + 4); ctx.strokeStyle = frameColor; ctx.stroke();
        ctx.fillText(xFmt(v), px, plotY + plotH + 5);
      }
    }

    if (!this._hideYTicks) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of yTicks) {
        const py = yScale.transform(v);
        ctx.beginPath(); ctx.moveTo(plotX - 4, py); ctx.lineTo(plotX, py); ctx.strokeStyle = frameColor; ctx.stroke();
        ctx.fillText(yFmt(v), plotX - 6, py);
      }
    }

    // title
    if (this._title) {
      ctx.fillStyle = textColor;
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this._title.text, plotX + plotW / 2, plotY - 4);
    }

    // xlabel
    if (this._xlabel) {
      ctx.fillStyle = textColor;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this._xlabel.text, plotX + plotW / 2, plotY + plotH + 22);
    }

    // ylabel
    if (this._ylabel) {
      ctx.save();
      ctx.fillStyle = textColor;
      ctx.font = font;
      ctx.translate(rect.x + 14, plotY + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this._ylabel.text, 0, 0);
      ctx.restore();
    }

    // legend
    if (this._legend) {
      this._renderLegend(ctx, plotX, plotY, plotW, plotH);
    }

    // colorbar — pinned to the right edge of the cell rect (so it
    // stays on the figure's right side even when the plot rect itself
    // shrinks for aspect='equal'+imshow) and uses the full pre-aspect
    // plot height (so it doesn't shrink with the data area).
    if (this._colorbar && lastCmapTrace) {
      const cbW = 12;
      const cbX = rect.x + rect.w - mr + 10;
      let vmin, vmax, cmap;
      if (lastCmapTrace.type === 'imshow') {
        const d = lastCmapTrace.data;
        const nodata = lastCmapTrace.opts.nodata;
        let vals = nodata != null ? d.filter(v => v !== nodata) : d;
        vmin = lastCmapTrace.opts.vmin != null ? lastCmapTrace.opts.vmin : Math.min(...vals);
        vmax = lastCmapTrace.opts.vmax != null ? lastCmapTrace.opts.vmax : Math.max(...vals);
        cmap = lastCmapTrace.opts.cmap || 'viridis';
      } else {
        const c = lastCmapTrace.opts.c;
        vmin = lastCmapTrace.opts.vmin != null ? lastCmapTrace.opts.vmin : Math.min(...c);
        vmax = lastCmapTrace.opts.vmax != null ? lastCmapTrace.opts.vmax : Math.max(...c);
        cmap = lastCmapTrace.opts.cmap || 'viridis';
      }
      renderColorbar(ctx, cbX, fullPlotY, cbW, fullPlotH, cmap, vmin, vmax, {
        textColor, font: smallFont, label: this._colorbarOpts.label,
      });
    }
  }

  // Render this axes' traces into the given plot rect, clipped. Returns
  // the last trace that contributed a colormap (for colorbar rendering).
  // Extracted from _render so it can be shared with the twin overlay path.
  _renderTraces(ctx, xScale, yScale, plotX, plotY, plotW, plotH) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotX, plotY, plotW, plotH);
    ctx.clip();
    let lastCmapTrace = null;
    for (const trace of this._traces) {
      switch (trace.type) {
        case 'imshow': this._renderImshow(ctx, trace, xScale, yScale, plotX, plotY, plotW, plotH); lastCmapTrace = trace; break;
        case 'line': this._renderLine(ctx, trace, xScale, yScale); break;
        case 'scatter': this._renderScatter(ctx, trace, xScale, yScale); if (trace.opts.c && Array.isArray(trace.opts.c)) lastCmapTrace = trace; break;
        case 'bar': this._renderBar(ctx, trace, xScale, yScale, plotY + plotH); break;
        case 'barh': this._renderBarh(ctx, trace, xScale, yScale, plotX); break;
        case 'hist': this._renderHist(ctx, trace, xScale, yScale, plotY + plotH); break;
        case 'hline': this._renderHline(ctx, trace, xScale, yScale, plotX, plotW); break;
        case 'vline': this._renderVline(ctx, trace, xScale, yScale, plotY, plotH); break;
        case 'text': this._renderText(ctx, trace, xScale, yScale); break;
      }
    }
    ctx.restore();
    return lastCmapTrace;
  }

  // Render as a twin overlay — shares the parent's xScale, uses own
  // y-scale, draws the y-axis ticks/label on the right edge of the rect.
  // Title/xlabel/legend belong to parent; only y-state matters here.
  _renderAsTwin(ctx, parentXScale, plotX, plotY, plotW, plotH) {
    // Compute own y-scale (matches the path in _render but for the
    // overlay context — no aspect-ratio adjustment, no grid).
    let [ylo, yhi] = this._ylim || this._dataExtent('y');
    if (!isFinite(ylo) || !isFinite(yhi)) return;
    if (ylo === yhi) { ylo -= 0.5; yhi += 0.5; }
    let yloS = ylo, yhiS = yhi;
    if (this._yscale === 'log') {
      if (yloS <= 0) yloS = yhiS > 0 ? yhiS / 1e6 : 1e-9;
      if (yhiS <= yloS) yhiS = yloS * 10;
    }
    const _yScaleCls = this._yscale === 'log' ? LogScale : LinearScale;
    const yScale = new _yScaleCls([yloS, yhiS], [plotY + plotH, plotY]);

    // Render traces with parent's x-scale + own y-scale.
    this._renderTraces(ctx, parentXScale, yScale, plotX, plotY, plotW, plotH);

    // Right-edge y-axis: ticks + tick labels, drawn outside the plot rect.
    ctx.fillStyle = this._textColor || _style.textColor;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const yTicks = yScale.ticks();
    const yFmt = yScale.tickFormat();
    for (const v of yTicks) {
      const py = yScale.transform(v);
      ctx.strokeStyle = this._frameColor || _style.frameColor;
      ctx.beginPath();
      ctx.moveTo(plotX + plotW, py);
      ctx.lineTo(plotX + plotW + 4, py);
      ctx.stroke();
      ctx.fillText(yFmt(v), plotX + plotW + 6, py);
    }

    // Right ylabel — rotated +90° (mirror of left ylabel's -90°)
    // so the text reads bottom-to-top on the right edge.
    if (this._ylabel) {
      ctx.save();
      ctx.fillStyle = this._textColor || _style.textColor;
      ctx.font = '11px monospace';
      ctx.translate(plotX + plotW + 38, plotY + plotH / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this._ylabel.text, 0, 0);
      ctx.restore();
    }
  }

  _dataExtent(axis) {
    let lo = Infinity, hi = -Infinity;
    for (const trace of this._traces) {
      switch (trace.type) {
        case 'line':
        case 'scatter': {
          const arr = axis === 'x' ? trace.x : trace.y;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] < lo) lo = arr[i];
            if (arr[i] > hi) hi = arr[i];
          }
          break;
        }
        case 'bar': {
          if (axis === 'x') {
            for (const v of trace.x) { if (v < lo) lo = v; if (v > hi) hi = v; }
          } else {
            lo = Math.min(lo, 0);
            for (const v of trace.heights) { if (v > hi) hi = v; if (v < lo) lo = v; }
          }
          break;
        }
        case 'barh': {
          if (axis === 'y') {
            for (const v of trace.y) { if (v < lo) lo = v; if (v > hi) hi = v; }
          } else {
            lo = Math.min(lo, 0);
            for (const v of trace.widths) { if (v > hi) hi = v; if (v < lo) lo = v; }
          }
          break;
        }
        case 'hist': {
          const { bins: binEdges } = this._computeHistBins(trace);
          if (axis === 'x') {
            lo = Math.min(lo, binEdges[0]);
            hi = Math.max(hi, binEdges[binEdges.length - 1]);
          } else {
            const counts = this._computeHistCounts(trace);
            lo = Math.min(lo, 0);
            for (const c of counts) if (c > hi) hi = c;
          }
          break;
        }
        case 'imshow': {
          if (axis === 'x') { lo = Math.min(lo, 0); hi = Math.max(hi, trace.nx); }
          else {
            lo = Math.min(lo, 0); hi = Math.max(hi, trace.ny);
          }
          break;
        }
        case 'hline': {
          if (axis === 'y') { lo = Math.min(lo, trace.y); hi = Math.max(hi, trace.y); }
          break;
        }
        case 'vline': {
          if (axis === 'x') { lo = Math.min(lo, trace.x); hi = Math.max(hi, trace.x); }
          break;
        }
        case 'text': {
          if (axis === 'x') { lo = Math.min(lo, trace.x); hi = Math.max(hi, trace.x); }
          else { lo = Math.min(lo, trace.y); hi = Math.max(hi, trace.y); }
          break;
        }
      }
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    // add padding for non-imshow
    const hasImshow = this._traces.some(t => t.type === 'imshow');
    if (!hasImshow && lo !== hi) {
      const pad = (hi - lo) * 0.05;
      lo -= pad;
      hi += pad;
    }
    return [lo, hi];
  }

  _computeHistBins(trace) {
    const data = trace.data;
    let bins = trace.opts.bins || 10;
    let edges;
    if (Array.isArray(bins)) {
      edges = bins;
    } else {
      const range = trace.opts.range;
      const lo = range ? range[0] : Math.min(...data);
      const hi = range ? range[1] : Math.max(...data);
      const step = (hi - lo) / bins;
      edges = [];
      for (let i = 0; i <= bins; i++) edges.push(lo + i * step);
    }
    return { bins: edges };
  }

  _computeHistCounts(trace) {
    const { bins: edges } = this._computeHistBins(trace);
    const counts = new Array(edges.length - 1).fill(0);
    for (const v of trace.data) {
      for (let i = 0; i < edges.length - 1; i++) {
        if (v >= edges[i] && (i === edges.length - 2 ? v <= edges[i + 1] : v < edges[i + 1])) {
          counts[i]++;
          break;
        }
      }
    }
    return counts;
  }

  // --- trace renderers ---

  _renderLine(ctx, trace, xScale, yScale) {
    const { x, y, opts } = trace;
    if (!x.length) return;
    ctx.strokeStyle = opts.color || '#c89b3c';
    ctx.lineWidth = opts.linewidth || 1.5;
    ctx.setLineDash(dashArray(opts.linestyle));
    ctx.beginPath();
    ctx.moveTo(xScale.transform(x[0]), yScale.transform(y[0]));
    for (let i = 1; i < x.length; i++) {
      ctx.lineTo(xScale.transform(x[i]), yScale.transform(y[i]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // markers
    if (opts.marker) {
      this._drawMarkers(ctx, x, y, xScale, yScale, opts.marker, opts.color || '#c89b3c', opts.markersize || 4);
    }
  }

  _renderScatter(ctx, trace, xScale, yScale) {
    const { x, y, opts } = trace;
    const cArray = Array.isArray(opts.c);
    const cmapFn = cArray ? getCmap(opts.cmap || 'viridis') : null;
    let cMin, cMax;
    if (cArray) {
      cMin = opts.vmin != null ? opts.vmin : Math.min(...opts.c);
      cMax = opts.vmax != null ? opts.vmax : Math.max(...opts.c);
    }
    const sArray = Array.isArray(opts.s);
    // matplotlib's scatter default is s=20 (markersize in points²).
    // Our previous default (s=4) rendered ~4px-wide dots that were
    // hard to see at typical alpha values; bumping to 20 matches
    // matplotlib density and gives `scatter(x, y, alpha=0.2)` enough
    // pixel surface to be visible against a light figure bg.
    const defaultSize = typeof opts.s === 'number' ? opts.s : 20;
    const alpha = opts.alpha != null ? opts.alpha : 1;

    for (let i = 0; i < x.length; i++) {
      const px = xScale.transform(x[i]);
      const py = yScale.transform(y[i]);
      const r = sArray ? Math.sqrt(opts.s[i]) : Math.sqrt(defaultSize);
      ctx.globalAlpha = alpha;
      if (cArray) {
        const t = cMax !== cMin ? (opts.c[i] - cMin) / (cMax - cMin) : 0.5;
        ctx.fillStyle = cmapFn(t);
      } else {
        ctx.fillStyle = opts.c || opts.color || '#c89b3c';
      }
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      if (opts.edgecolor) {
        ctx.strokeStyle = opts.edgecolor;
        ctx.lineWidth = opts.linewidth || 0.5;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  _renderBar(ctx, trace, xScale, yScale, baseline) {
    const { x, heights, opts } = trace;
    const barW = opts.width || 0.8;
    ctx.fillStyle = opts.color || '#c89b3c';
    const alpha = opts.alpha != null ? opts.alpha : 1;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < x.length; i++) {
      const px = xScale.transform(x[i] - barW / 2);
      const pw = xScale.transform(x[i] + barW / 2) - px;
      const py = yScale.transform(heights[i]);
      const py0 = yScale.transform(0);
      ctx.fillRect(px, py, pw, py0 - py);
      if (opts.edgecolor) {
        ctx.strokeStyle = opts.edgecolor;
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pw, py0 - py);
      }
    }
    ctx.globalAlpha = 1;
  }

  _renderBarh(ctx, trace, xScale, yScale, left) {
    const { y, widths, opts } = trace;
    const barH = opts.height || 0.8;
    ctx.fillStyle = opts.color || '#c89b3c';
    const alpha = opts.alpha != null ? opts.alpha : 1;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < y.length; i++) {
      const py = yScale.transform(y[i] + barH / 2);
      const ph = yScale.transform(y[i] - barH / 2) - py;
      const px0 = xScale.transform(0);
      const px = xScale.transform(widths[i]);
      ctx.fillRect(px0, py, px - px0, ph);
      if (opts.edgecolor) {
        ctx.strokeStyle = opts.edgecolor;
        ctx.lineWidth = 1;
        ctx.strokeRect(px0, py, px - px0, ph);
      }
    }
    ctx.globalAlpha = 1;
  }

  _renderHist(ctx, trace, xScale, yScale, baseline) {
    const { bins: edges } = this._computeHistBins(trace);
    const counts = this._computeHistCounts(trace);
    const alpha = trace.opts.alpha != null ? trace.opts.alpha : 0.8;
    ctx.fillStyle = trace.opts.color || '#c89b3c';
    ctx.globalAlpha = alpha;
    for (let i = 0; i < counts.length; i++) {
      const px0 = xScale.transform(edges[i]);
      const px1 = xScale.transform(edges[i + 1]);
      const py = yScale.transform(counts[i]);
      const py0 = yScale.transform(0);
      ctx.fillRect(px0, py, px1 - px0, py0 - py);
      if (trace.opts.edgecolor) {
        ctx.strokeStyle = trace.opts.edgecolor;
        ctx.lineWidth = 1;
        ctx.strokeRect(px0, py, px1 - px0, py0 - py);
      }
    }
    ctx.globalAlpha = 1;
  }

  _renderImshow(ctx, trace, xScale, yScale, plotX, plotY, plotW, plotH) {
    const { data, nx, ny, opts } = trace;
    const nodata = opts.nodata;
    const origin = opts.origin || 'lower';
    const cmapFn = getCmap(opts.cmap || 'viridis');

    // compute vmin/vmax
    let vmin = opts.vmin, vmax = opts.vmax;
    if (vmin == null || vmax == null) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < data.length; i++) {
        if (nodata != null && data[i] === nodata) continue;
        if (data[i] < lo) lo = data[i];
        if (data[i] > hi) hi = data[i];
      }
      if (vmin == null) vmin = lo;
      if (vmax == null) vmax = hi;
    }
    const vr = vmax - vmin || 1;

    // Recording (figures as data): the whole raster as one RGBA 'image' op, not one
    // fillRect per cell. Falls through to the cell loop for a colour string it can't read.
    if (isRecordingContext(ctx) && this._imshowRaster(ctx, data, nx, ny, nodata, origin, cmapFn, vmin, vr, xScale, yScale)) return;

    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const idx = iy * nx + ix;
        const v = data[idx];
        if (nodata != null && v === nodata) continue;
        // data y: origin='lower' → row 0 at y=0 (bottom), origin='upper' → row 0 at y=ny (top)
        const dataY = origin === 'lower' ? iy : (ny - 1 - iy);
        const px0 = xScale.transform(ix);
        const px1 = xScale.transform(ix + 1);
        const pyTop = yScale.transform(dataY + 1); // higher y → smaller pixel (top)
        const pyBot = yScale.transform(dataY);      // lower y → larger pixel (bottom)
        ctx.fillStyle = cmapFn((v - vmin) / vr);
        ctx.fillRect(px0, pyTop, px1 - px0 + 0.5, pyBot - pyTop + 0.5);
      }
    }
  }

  _imshowRaster(ctx, data, nx, ny, nodata, origin, cmapFn, vmin, vr, xScale, yScale) {
    const rgba = new Uint8Array(nx * ny * 4);
    for (let iy = 0; iy < ny; iy++) {
      // image row 0 is the TOP: origin='lower' puts data row ny-1 there
      const row = origin === 'lower' ? ny - 1 - iy : iy;
      for (let ix = 0; ix < nx; ix++) {
        const v = data[iy * nx + ix];
        const o = (row * nx + ix) * 4;
        if (nodata != null && v === nodata) continue;      // transparent
        const c = parseColorBytes(cmapFn((v - vmin) / vr));
        if (!c) return false;
        rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = c[3];
      }
    }
    const x0 = xScale.transform(0), x1 = xScale.transform(nx);
    const yTop = yScale.transform(ny), yBot = yScale.transform(0);
    ctx._image(Math.min(x0, x1), Math.min(yTop, yBot), Math.abs(x1 - x0), Math.abs(yBot - yTop), nx, ny, rgba);
    return true;
  }

  _renderHline(ctx, trace, xScale, yScale, plotX, plotW) {
    const py = yScale.transform(trace.y);
    ctx.strokeStyle = trace.opts.color;
    ctx.lineWidth = trace.opts.linewidth || 1;
    ctx.setLineDash(dashArray(trace.opts.linestyle));
    ctx.beginPath(); ctx.moveTo(plotX, py); ctx.lineTo(plotX + plotW, py); ctx.stroke();
    ctx.setLineDash([]);
  }

  _renderVline(ctx, trace, xScale, yScale, plotY, plotH) {
    const px = xScale.transform(trace.x);
    ctx.strokeStyle = trace.opts.color;
    ctx.lineWidth = trace.opts.linewidth || 1;
    ctx.setLineDash(dashArray(trace.opts.linestyle));
    ctx.beginPath(); ctx.moveTo(px, plotY); ctx.lineTo(px, plotY + plotH); ctx.stroke();
    ctx.setLineDash([]);
  }

  _renderText(ctx, trace, xScale, yScale) {
    const px = xScale.transform(trace.x);
    const py = yScale.transform(trace.y);
    ctx.fillStyle = trace.opts.color;
    ctx.font = `${trace.opts.fontsize || 11}px monospace`;
    ctx.textAlign = trace.opts.ha || 'left';
    ctx.textBaseline = trace.opts.va || 'bottom';
    ctx.fillText(trace.text, px, py);
  }

  _renderLegend(ctx, plotX, plotY, plotW, plotH) {
    const entries = [];
    for (const t of this._traces) {
      if (t.opts.label) entries.push({ label: t.opts.label, color: t.opts.color || '#c89b3c', type: t.type });
    }
    if (!entries.length) return;

    ctx.font = '10px monospace';
    const lineH = 14;
    const padding = 6;
    let maxW = 0;
    for (const e of entries) {
      const w = ctx.measureText(e.label).width;
      if (w > maxW) maxW = w;
    }
    const boxW = maxW + 24 + padding * 2;
    const boxH = entries.length * lineH + padding * 2;

    // position: default top-right
    const loc = this._legendOpts.loc || 'upper right';
    let lx, ly;
    if (loc.includes('right')) lx = plotX + plotW - boxW - 6;
    else if (loc.includes('left')) lx = plotX + 6;
    else lx = plotX + (plotW - boxW) / 2;
    if (loc.includes('upper') || loc.includes('top')) ly = plotY + 6;
    else if (loc.includes('lower') || loc.includes('bottom')) ly = plotY + plotH - boxH - 6;
    else ly = plotY + (plotH - boxH) / 2;

    ctx.fillStyle = _style.legendBg;
    ctx.fillRect(lx, ly, boxW, boxH);
    ctx.strokeStyle = _style.legendBorder;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, ly, boxW, boxH);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < entries.length; i++) {
      const ey = ly + padding + i * lineH + lineH / 2;
      ctx.fillStyle = entries[i].color;
      if (entries[i].type === 'scatter') {
        ctx.beginPath(); ctx.arc(lx + padding + 6, ey, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(lx + padding, ey - 1, 14, 2);
      }
      ctx.fillStyle = _style.textColor;
      ctx.fillText(entries[i].label, lx + padding + 18, ey);
    }
  }

  _drawMarkers(ctx, x, y, xScale, yScale, marker, color, size) {
    ctx.fillStyle = color;
    const r = size / 2;
    for (let i = 0; i < x.length; i++) {
      const px = xScale.transform(x[i]);
      const py = yScale.transform(y[i]);
      switch (marker) {
        case 'o': case '.':
          ctx.beginPath(); ctx.arc(px, py, marker === '.' ? 1.5 : r, 0, Math.PI * 2); ctx.fill(); break;
        case 's':
          ctx.fillRect(px - r, py - r, size, size); break;
        case '^':
          ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px - r, py + r); ctx.lineTo(px + r, py + r); ctx.closePath(); ctx.fill(); break;
        case 'v':
          ctx.beginPath(); ctx.moveTo(px, py + r); ctx.lineTo(px - r, py - r); ctx.lineTo(px + r, py - r); ctx.closePath(); ctx.fill(); break;
        case 'd':
          ctx.beginPath(); ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath(); ctx.fill(); break;
        case '+':
          ctx.strokeStyle = color; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r); ctx.lineTo(px, py + r); ctx.stroke(); break;
        case 'x':
          ctx.strokeStyle = color; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r); ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r); ctx.stroke(); break;
        default:
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

// -- figure.js --

// Figure — canvas management, subplot grid, DPI handling




// Figures shown (or saved) where there is no DOM, in order. plt.shown() / plt.saved() read
// them, plt.close(fig) / plt.close('all') / plt.clf() clear them.
const _shownFigures = [];
const _savedFigures = [];
function _recordShown(fig) {
  if (!_shownFigures.includes(fig)) _shownFigures.push(fig);
}

class Figure {
  constructor(nrows, ncols, opts) {
    this.nrows = nrows || 1;
    this.ncols = ncols || 1;
    const o = opts || {};
    // matplotlib's figsize is in INCHES; the canvas pixel size is
    // figsize * dpi. Default dpi 100. Notebooks like Pyrcz's pass
    // figsize=(7, 7) expecting a 700×700 canvas — without this scale
    // we'd produce a 7×7 px (effectively invisible) canvas.
    //
    // Heuristic: if both dims are ≤ 50, assume inches and scale by
    // dpi. If either is > 50, assume already-pixels (back-compat with
    // JS-side callers that pass pixel values directly).
    const rawSize = o.figsize || [4, 3];
    const dpi = o.dpi || 100;
    const inchesShape = rawSize[0] <= 50 && rawSize[1] <= 50;
    this.width = inchesShape ? rawSize[0] * dpi : rawSize[0];
    this.height = inchesShape ? rawSize[1] * dpi : rawSize[1];
    // Figure facecolor — pulled from the style palette unless explicitly
    // overridden. Dark palette uses 'transparent' (notebook bg shows
    // through); light palette uses an opaque off-white card so dark
    // tick text contrasts even on a dark notebook bg.
    this.facecolor = o.facecolor || _style.figureFacecolor;
    this._suptitle = null;
    // Inter-subplot gap in pixels. Callers that want a tight grid
    // (e.g. sadpan's scatter_matrix on a small figure) pass `gap` (or
    // matplotlib's wspace/hspace) in opts. wspace/hspace land in pixels
    // here; matplotlib's fraction-of-axis-width semantics aren't worth
    // emulating for our flat-layout use case.
    this._gapX = (o.wspace ?? o.gap ?? 10);
    this._gapY = (o.hspace ?? o.gap ?? 10);
    // Figure-level row/col labels — drawn OUTSIDE the subplot grid
    // (to the left of each row and below each column). Used by
    // matrix-shaped plots like sadpan's scatter_matrix where the
    // column names belong on the figure edges, not duplicated as
    // per-cell axis labels.
    this._rowLabels = null;
    this._colLabels = null;

    // create axes grid
    this.axes = [];
    for (let i = 0; i < this.nrows * this.ncols; i++) {
      this.axes.push(new Axes());
    }
  }

  suptitle(text, opts) {
    this._suptitle = { text, opts };
    return this;
  }

  // matplotlib's Figure.subplots_adjust(left, right, top, bottom,
  // wspace, hspace) — adjusts margins between subplots. We don't
  // currently honor these (our subplot layout uses fixed gaps); accept
  // and discard so notebooks that call `fig.subplots_adjust(wspace=0.7)`
  // proceed instead of erroring with no-attribute.
  subplots_adjust(_opts) { return this; }
  tight_layout(_opts) { return this; }

  // In the notebook: a <canvas> node, which its display path picks up. With no DOM (a
  // worker, Node): the figure is recorded for plt.shown() and returned, so the host can
  // draw it (fig.draw / fig.toDrawList / replay).
  show() {
    if (typeof document === 'undefined') { _recordShown(this); return this; }
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const canvas = document.createElement('canvas');
    canvas.width = this.width * dpr;
    canvas.height = this.height * dpr;
    canvas.style.width = this.width + 'px';
    canvas.style.height = this.height + 'px';
    this.draw(canvas.getContext('2d'), { dpr });
    return canvas;
  }

  // Draw the whole figure on anything shaped like a CanvasRenderingContext2D.
  draw(ctx, { dpr = 1 } = {}) {
    if (dpr !== 1) ctx.scale(dpr, dpr);

    // background
    if (this.facecolor !== 'transparent') {
      ctx.fillStyle = this.facecolor;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // suptitle space
    const supH = this._suptitle ? 24 : 0;

    if (this._suptitle) {
      ctx.fillStyle = _style.textColor;
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this._suptitle.text, this.width / 2, 4);
    }

    // Figure-level row/col label gutters. Reserve space outside the
    // subplot grid for these labels so the grid itself shrinks rather
    // than overlapping the labels.
    const rowLabelW = this._rowLabels ? 28 : 0;
    const colLabelH = this._colLabels ? 18 : 0;

    // subplot layout — grid origin shifted by the row-label gutter
    const gapX = this._gapX;
    const gapY = this._gapY;
    const gridX = rowLabelW;
    const gridY = supH;
    const gridW = this.width - rowLabelW;
    const gridH = this.height - supH - colLabelH;
    const cellW = (gridW - gapX * (this.ncols - 1)) / this.ncols;
    const cellH = (gridH - gapY * (this.nrows - 1)) / this.nrows;

    for (let r = 0; r < this.nrows; r++) {
      for (let c = 0; c < this.ncols; c++) {
        const idx = r * this.ncols + c;
        const ax = this.axes[idx];
        const rect = {
          x: gridX + c * (cellW + gapX),
          y: gridY + r * (cellH + gapY),
          w: cellW,
          h: cellH,
        };
        ax._render(ctx, rect);
      }
    }

    // Figure-level edge labels — drawn after subplots so they sit on
    // top of any background fill. Row labels rotate -90° (read bottom-
    // to-top), centered vertically on each row. Col labels read flat,
    // centered horizontally under each column.
    if (this._rowLabels) {
      ctx.save();
      ctx.fillStyle = _style.textColor;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < this.nrows; r++) {
        const label = this._rowLabels[r];
        if (!label) continue;
        const cy = gridY + r * (cellH + gapY) + cellH / 2;
        ctx.save();
        ctx.translate(rowLabelW / 2, cy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
    if (this._colLabels) {
      ctx.fillStyle = _style.textColor;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let c = 0; c < this.ncols; c++) {
        const label = this._colLabels[c];
        if (!label) continue;
        const cx = gridX + c * (cellW + gapX) + cellW / 2;
        const cy = gridY + gridH + colLabelH / 2;
        ctx.fillText(label, cx, cy);
      }
    }
    return ctx;
  }

  // The figure as plain JSON: size, facecolor and the ordered 2D-context ops draw() makes.
  // The same figure gives the same list in every host. replay(ctx, list) draws it.
  toDrawList() {
    const rec = recordingContext(this.width, this.height);
    this.draw(rec);
    return { width: this.width, height: this.height, facecolor: this.facecolor, ops: rec.ops };
  }

  // PNG bytes through OffscreenCanvas (workers in current browsers); rejects where there is none.
  async toPNG({ dpr = 1 } = {}) {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('toPNG needs OffscreenCanvas; use toDrawList() and replay() instead');
    const canvas = new OffscreenCanvas(Math.round(this.width * dpr), Math.round(this.height * dpr));
    this.draw(canvas.getContext('2d'), { dpr });
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  }

  // In the notebook: download a PNG. With no DOM: record { name, figure } for plt.saved()
  // (and the figure for plt.shown()) so the host can offer the file.
  savefig(filename) {
    const name = (typeof filename === 'string' && filename) || 'figure.png';
    if (typeof document === 'undefined') {
      _savedFigures.push({ name, figure: this });
      _recordShown(this);
      return this;
    }
    const canvas = this.show();
    const link = document.createElement('a');
    link.download = name;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}

// -- api.js --

// Public API — subplots() factory, quick one-liners, plt extension registration





// matplotlib stateful interface — plt.xlabel/.ylim/.legend/etc. all
// operate on a global "current axes". subplots() and the _quick()
// wrappers update it. Cells running in sequence share the same
// _currentAx so a stateful sequence like
//   plt.hist(...)        # creates an axes, becomes current
//   plt.xlabel('x')      # sets xlabel on that axes
//   plt.vlines(...)      # adds vertical lines to that axes
// works the same as matplotlib.
let _currentFig = null;
let _currentAx = null;

function _setCurrent(fig, ax) { _currentFig = fig; _currentAx = ax; return ax; }

function subplots(nrows, ncols, opts) {
  // Adder kwarg shapes that arrive here:
  //   plt.subplots()                          → ()
  //   plt.subplots(2, 3)                      → (2, 3)
  //   plt.subplots(figsize=(8,6))             → ({_kw, figsize}) — kwargs in arg 0
  //   plt.subplots(2, 3, figsize=(8,6))       → (2, 3, {_kw, figsize})
  //   plt.subplots(2, 3, sharex=True)         → (2, 3, {_kw, sharex})
  if (nrows && typeof nrows === 'object' && nrows._kw) {
    opts = nrows; nrows = undefined; ncols = undefined;
  } else if (ncols && typeof ncols === 'object' && ncols._kw) {
    opts = ncols; ncols = undefined;
  }
  const nr = nrows || 1;
  const nc = ncols || 1;
  const fig = new Figure(nr, nc, opts);

  if (nr === 1 && nc === 1) {
    _setCurrent(fig, fig.axes[0]);
    // array for adder tuple unpacking, named props for JS destructuring
    return Object.assign([fig, fig.axes[0]], { fig, ax: fig.axes[0] });
  }
  _setCurrent(fig, fig.axes[0]);
  // matplotlib's subplots returns axes as:
  //   nrows=1, ncols=K → flat 1D array [ax1, …, axK]
  //   nrows=R, ncols=1 → flat 1D array [ax1, …, axR]
  //   nrows=R, ncols=K → nested 2D array [[ax1,…,axK], [ax(K+1),…], …]
  // Adder code often destructures the 2D shape literally:
  //   f, ((a, b), (c, d), (e, f)) = plt.subplots(3, 2)
  // so flat-only would break those notebooks.
  let axesShape;
  if (nr === 1 || nc === 1) {
    axesShape = fig.axes.slice();
  } else {
    axesShape = [];
    for (let r = 0; r < nr; r++) {
      const row = [];
      for (let c = 0; c < nc; c++) row.push(fig.axes[r * nc + c]);
      axesShape.push(row);
    }
    // matplotlib's ndarray exposes `.flat` for row-major flat iteration
    // alongside the nested [r][c] view. We mirror that so callers can
    // do `axes.flat[k]` without manually computing row/col from k.
    // Non-enumerable so it doesn't show up in JSON / for..of.
    Object.defineProperty(axesShape, 'flat', {
      value: fig.axes.slice(),
      writable: false,
      enumerable: false,
      configurable: true,
    });
  }
  return Object.assign([fig, axesShape], { fig, axes: axesShape });
}

// quick one-liners — create figure, add trace, return canvas
function _quick(fn) {
  return function (...args) {
    const { fig, ax } = subplots();
    fn(ax, ...args);
    _setCurrent(fig, ax);
    return fig.show();
  };
}

const plot = _quick((ax, x, y, fmtOrOpts, opts) => ax.plot(x, y, fmtOrOpts, opts));
const scatter = _quick((ax, x, y, opts) => ax.scatter(x, y, opts));
const imshow = _quick((ax, data, nx, ny, opts) => ax.imshow(data, nx, ny, opts));
const bar = _quick((ax, x, heights, opts) => ax.bar(x, heights, opts));
const cmap = getCmap;
// matplotlib's matshow renders a 2D matrix as an image with no axes
// inversion — effectively imshow with origin='upper'. We alias for
// the common df.corr().matshow pattern.
const matshow = _quick((ax, data, nx, ny, opts) => ax.imshow(data, nx, ny, opts));

// plt.hist — matplotlib returns (counts, edges, patches). Adder cells
// destructure as `n, bins, patches = plt.hist(...)` or index as
// `result = plt.hist(...); n = result[0]`. We return an array-like
// with both index access and named getters (.counts/.edges/.canvas)
// so JS-side use is also ergonomic.
function hist(data, opts) {
  const { fig, ax } = subplots();
  ax.hist(data, opts);
  // Compute the actual counts + edges that the trace will render with,
  // so the caller sees real values matching the drawn bars.
  const trace = ax._traces[ax._traces.length - 1];
  const { bins: edges } = ax._computeHistBins(trace);
  const counts = ax._computeHistCounts(trace);
  const canvas = fig.show();
  return Object.assign([counts, edges, canvas], {
    counts, edges, canvas,
  });
}

// matplotlib parity stubs — these are no-ops today but nearly every
// Jupyter notebook calls them at the top of cell 1 to configure global
// style. Stubbing keeps the import path running so notebooks proceed
// to the real plotting calls; actual rcParams threading through Figure
// construction is on the ROADMAP.
//
// plt.rc(group, **kwargs) — `plt.rc('font', size=14)`
function rc(_group, _opts) { /* no-op */ }
// plt.rcParams — dict-like assignable bag. `plt.rcParams['figure.figsize'] = (8, 6)`
const rcParams = {};
rcParams.update = function (obj) {
  if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) rcParams[k] = obj[k];
};
// plt.style.use(name) — switches the shared palette. Auditable-native
// default is dark; `plt.style.use('default')` (or 'classic' / a few
// common matplotlib-style names) flips to a light palette. Notebooks
// loaded from a .ipynb through @gcu/ipynb get this call injected
// automatically after `import matplotlib.pyplot as plt`.
const style = {
  use(name) { setStyle(name); },
  available: ['default', 'classic', 'matplotlib', 'dark_background',
              'seaborn', 'seaborn-whitegrid', 'ggplot', 'bmh'],
};
// plt.figure(...) — return a fresh Figure (matplotlib's figure() takes
// figsize=(w,h) and other kwargs; we accept and ignore unsupported ones).
function figure(opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  return new Figure(1, 1, o);
}
// plt.show() — renders the current figure to a canvas and returns it.
// When `plt.show()` is the last expression of an adder cell, adder's
// display path picks up the canvas (via nodeType check) and renders.
// Matplotlib's pyplot also renders implicitly after each cell in
// %matplotlib inline; for now we require an explicit `plt.show()` as
// the trailing statement.
function show() {
  if (!_currentFig) return null;
  return _currentFig.show();
}
// plt.close(fig?) — close a figure (matplotlib reclaims its handle).
// We hold no figure registry, so no-op.
// close(fig) forgets one figure, close() the current one, close('all') every one
function close(fig) {
  const drop = (f) => {
    const i = _shownFigures.indexOf(f);
    if (i >= 0) _shownFigures.splice(i, 1);
    for (let j = _savedFigures.length - 1; j >= 0; j--) if (_savedFigures[j].figure === f) _savedFigures.splice(j, 1);
    if (_currentFig === f) { _currentFig = null; _currentAx = null; }
  };
  if (fig === 'all') { _shownFigures.length = 0; _savedFigures.length = 0; _currentFig = null; _currentAx = null; return; }
  drop(fig && typeof fig === 'object' && !fig._kw ? fig : _currentFig);
}
// The figures shown (or saved) with no DOM, in order, and the savefig calls among them.
function shown() { return _shownFigures.slice(); }
function saved() { return _savedFigures.map((s) => ({ ...s })); }

// plt.subplot(nrows, ncols, index) — matplotlib's per-axes shortcut.
// Also accepts the 3-digit form `plt.subplot(311)` (sugar for 3,1,1).
// Returns the indexed axes and sets it as current. Distinct from
// `subplots(nrows, ncols)` which returns the full grid.
function subplot(...args) {
  let nrows, ncols, index;
  if (args.length === 1 && typeof args[0] === 'number' && args[0] >= 111 && args[0] < 1000) {
    const n = args[0];
    nrows = Math.floor(n / 100);
    ncols = Math.floor((n / 10) % 10);
    index = n % 10;
  } else {
    nrows = args[0] || 1;
    ncols = args[1] || 1;
    index = args[2] || 1;
  }
  const sub = subplots(nrows, ncols);
  const ax = (sub.axes && sub.axes.length) ? sub.axes[index - 1] : sub.ax;
  _setCurrent(sub.fig, ax);
  return ax;
}

// plt.cm — matplotlib's colormap namespace. Each public name is a
// colormap function `(t in [0,1]) → 'rgb(r,g,b)'`. Notebooks reference
// these as `cmap = plt.cm.viridis`. We mirror the names we have in
// getCmap; unknown / dunder access returns undefined so adder's
// attribute probing (__adderClass__, __iter__, etc.) doesn't get
// fooled into thinking every name is a cmap.
const _CMAP_NAMES = [
  'viridis', 'coolwarm', 'turbo',
  'plasma', 'inferno', 'magma', 'cividis',
  'jet', 'gray', 'Greys', 'hot', 'cool',
  'spring', 'summer', 'autumn', 'winter',
  'viridis_r', 'plasma_r', 'inferno_r', 'magma_r', 'jet_r', 'gray_r',
];
const cm = {};
for (const n of _CMAP_NAMES) {
  Object.defineProperty(cm, n, {
    get() { return getCmap(n); },
    enumerable: true,
  });
}
cm.get_cmap = getCmap;

// matplotlib stateful interface — module-level helpers that delegate to
// the current axes. Each lazily creates an axes if none exists yet, so
// `plt.title("x")` as the very first call still works (matches mpl).
function _ax() {
  if (!_currentAx) subplots();
  return _currentAx;
}
function gca() { return _ax(); }
function gcf() { if (!_currentFig) subplots(); return _currentFig; }
function xlabel(text, opts) { _ax().set_xlabel(text, opts); }
function ylabel(text, opts) { _ax().set_ylabel(text, opts); }
function title(text, opts) { _ax().set_title(text, opts); }
function xlim(lo, hi) { _ax().set_xlim(lo, hi); }
function ylim(lo, hi) { _ax().set_ylim(lo, hi); }
function xscale(scale) { _ax().set_xscale(scale); }
function yscale(scale) { _ax().set_yscale(scale); }
function legend(opts) { _ax().legend(opts); }
function grid(on, opts) { _ax().grid(on, opts); }
function vlines(x, ymin, ymax, opts) { _ax().vlines(x, ymin, ymax, opts); }
function hlines(y, xmin, xmax, opts) { _ax().hlines(y, xmin, xmax, opts); }
function axhline(y, opts) { _ax().axhline(y, opts); }
function axvline(x, opts) { _ax().axvline(x, opts); }
function text(x, y, s, opts) { _ax().text(x, y, s, opts); }
// matplotlib subplots_adjust controls figure margins (left/right/top/bottom/wspace/hspace).
// Canvas layout isn't margin-driven the same way; accept and discard.
function subplots_adjust(_opts) { /* no-op */ }
function tight_layout(_opts) { /* no-op */ }
function savefig(filename) { return _currentFig && _currentFig.savefig(filename); }
function clf() { _currentFig = null; _currentAx = null; _shownFigures.length = 0; _savedFigures.length = 0; }
function cla() { _currentAx = null; }

// matplotlib's plt.xticks(ticks, labels) / yticks set tick positions
// and labels on the current axes. Our scale.ticks() drives ticks
// automatically — we accept and discard these calls (visual result
// uses our auto-ticks) so notebooks that call them don't error out.
// Real custom-tick support is on the ROADMAP.
function xticks(_ticks, _labels) { /* no-op; ROADMAPed */ }
function yticks(_ticks, _labels) { /* no-op; ROADMAPed */ }

// plt.colorbar(im, ax=None, **kwargs) — attach a colorbar to the axes
// that holds `im`. matplotlib's `im` is an AxesImage; since our
// ax.matshow/.imshow return the Axes itself (for chaining), `im` will
// usually BE the axes. We accept:
//   - an opts.ax kwarg pointing at a specific Axes
//   - any object with a `.colorbar` method (an Axes)
//   - any object with `.axes` pointing at an Axes (matplotlib-shape)
//   - falls back to the current axes
// Returns the axes (matplotlib returns a Colorbar object, but no
// caller in the GCU stack uses it as anything other than a side-
// effect call).
function colorbar(im, opts) {
  // Adder kwargs land in the trailing arg; pull `ax` out.
  let ax = null;
  if (opts && typeof opts === 'object' && opts.ax) ax = opts.ax;
  else if (im && typeof im === 'object' && typeof im.colorbar === 'function') ax = im;
  else if (im && im.axes && typeof im.axes.colorbar === 'function') ax = im.axes;
  else ax = _ax();
  ax.colorbar(opts && typeof opts === 'object' ? opts : {});
  return ax;
}
// plt.suptitle — sets the figure-level title above all subplots.
// Delegates to the current figure's suptitle method.
function suptitle(text, opts) {
  const fig = gcf();
  return fig && fig.suptitle ? fig.suptitle(text, opts) : null;
}

// The matplotlib-shaped module object, built in every host: a worker or Node registers it
// with adder (registerModule('plt', pltAdder)); the notebook gets it below.
const pltAdder = {
  subplots, subplot, figure, Figure, cmap, cm, plot, scatter, imshow, matshow, hist, bar,
  rc, rcParams, style, show, close, shown, saved, replay,
  gca, gcf, xlabel, ylabel, title, xlim, ylim, xscale, yscale,
  legend, grid, vlines, hlines, axhline, axvline, text,
  subplots_adjust, tight_layout, savefig, clf, cla,
  xticks, yticks, colorbar, suptitle,
};

// register as auditable extension for adder `import plt`
if (typeof window !== 'undefined') {
  const _plt = pltAdder;
  const register = window.auditable?.registerExtension;
  if (register) {
    register({
      name: '@gcu/plot',
      version: '0.1.0',
      description: 'Canvas 2D plotting library \u2014 line, scatter, bar, hist, imshow',
      pluginUrl: '@gcu/plot',
      exports: { plt: _plt },
    });
  } else {
    window._auditableExtensions = window._auditableExtensions || {};
    window._auditableExtensions['plt'] = _plt;
    if (window._auditablePlugins) {
      window._auditablePlugins.set('@gcu/plot', { description: 'Canvas 2D plotting library \u2014 line, scatter, bar, hist, imshow' });
    }
  }
}

export { subplots, plot, scatter, imshow, hist, bar, cmap, Figure, Axes, LinearScale, getCmap, pltAdder, replay, recordingContext };

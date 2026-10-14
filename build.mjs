// Build dist/golem.html: src/shell/index.html with the fonts embedded, then the shell, engine and vendored
// modules in import order inside one classic <script>. No bundler and no transforms of the code itself:
// each module's text goes in verbatim, wrapped in a function so its private names stay private, and its
// exports become plain `const` declarations in the shared scope. The build refuses import cycles, exported
// names declared twice, and the module syntax the wrapping cannot carry (default exports, namespace
// imports, aliased imports, re-exports, `export let`, import.meta, several declarators on one export line).
// It also writes dist/golem.json, the clause ontology the engine derives from its declarations.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const posix = p => p.split(sep).join('/');

// The Python worker, as one classic script: adder's single-file build concatenated as is (its top-level names,
// run, pyRepr and adderParse among them, stay in scope), each library wrapped in a function that returns its
// exports so its private names cannot meet adder's, the registrations, golem's driver, and the message handler.
// The page embeds this text; the Node tests evaluate the same text in a fresh context per run.
// Each bridge is handed its library by the host (attachScitra, attachLine, attachLearn) and makes no request at
// load in a worker. A library's static imports of another @gcu package become bindings from that package's
// wrapper, which must come earlier in the list; the build checks every imported name is really exported.
const PY_LIBS = [['SCITRA', 'vendor/scitra.js'], ['SCITRA_ADDER', 'vendor/scitra-adder.js'], ['SADPAN', 'vendor/sadpan.js'],
  ['LINE', 'vendor/line.js'], ['LINE_ADDER', 'vendor/line-adder.js'],
  ['MIMIC', 'vendor/mimic-io.js'], ['LEARN', 'vendor/learn.js'], ['LEARN_ADDER', 'vendor/learn-adder.js'],
  ['ATRA', 'vendor/atra.js'], ['ALPACK', 'vendor/alpack.js'], ['NATRA', 'vendor/natra.js'], ['NATRA_ADDER', 'vendor/natra-adder.js'],
  ['PLOT', 'vendor/plot.js'], ['AIR', 'vendor/air.js']];
const PY_IMPORTS = { '@gcu/line': 'LINE', '@gcu/scitra': 'SCITRA', '@gcu/mimic-io': 'MIMIC' };
function wrapModule(name, code, rel, exported) {
  const names = [];
  code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[^\n]*$/gm, (_, inner, spec) => {
    const ns = PY_IMPORTS[spec]; if (!ns || !exported[ns]) throw new Error(`build: ${rel}: imports ${spec}, which is not wrapped before it in the Python worker`);
    const binds = inner.split(',').map(x => x.trim()).filter(Boolean).map(x => { const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(x); if (!m) throw new Error(`build: ${rel}: cannot read the import "${x}"`); if (!exported[ns].has(m[1])) throw new Error(`build: ${rel}: ${spec} does not export ${m[1]}`); return m[2] ? `${m[1]}: ${m[2]}` : m[1]; });
    return `const { ${binds.join(', ')} } = ${ns};`;
  });
  code = code.replace(/^export\s*\{([^}]*)\};?[^\n]*$/gm, (_, inner) => { inner.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => { const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(x); if (!m) throw new Error(`build: ${rel}: cannot read the export "${x}"`); names.push([m[2] || m[1], m[1]]); }); return ''; });
  code = code.replace(/^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, id) => { names.push([id, id]); return `${kind} ${id}`; });
  if (/^\s*(?:import|export)\s/m.test(code)) throw new Error(`build: ${rel}: module syntax the worker wrapper cannot carry`);
  exported[name] = new Set(names.map(([k]) => k));
  return `/* ==== src/${rel} ==== */\nconst ${name} = (() => {\n${code}\nreturn { ${names.map(([k, v]) => k === v ? k : `${k}: ${v}`).join(', ')} };\n})();\n`;
}
export function pyWorkerSource() {
  const adder = readFileSync(join(src, 'vendor/adder.js'), 'utf8').replace(/^export\s*\{\s*adder\s*\};?\s*$/m, '');
  if (/^\s*(?:import|export)\s/m.test(adder)) throw new Error('build: module syntax left in vendor/adder.js');
  const driver = readFileSync(join(src, 'worker/py-driver.js'), 'utf8').replace(/^export (async function) /m, '$1 ');
  const exported = {}, libs = PY_LIBS.map(([n, rel]) => wrapModule(n, readFileSync(join(src, rel), 'utf8'), rel, exported)).join('\n');
  const setup = `
/* ==== the worker: register the GCU modules, then answer one request ==== */
SCITRA_ADDER.attachScitra(SCITRA);
adder.registerModule('scitra', SCITRA_ADDER.scitraAdder);
adder.registerModule('sadpan', SADPAN);
LINE_ADDER.attachLine(LINE);
adder.registerModule('line', LINE_ADDER.vecAdder);
// learn's tree models compile their predict with new Function (.compile()): allowed in this worker (principle 9)
LEARN_ADDER.attachLearn(LEARN);
adder.registerModule('learn', LEARN_ADDER.learnAdder);
// numpy: natra, compiling its kernels here with atra from the alpack sources (Wasm built from source, principle 9)
NATRA.attachAtra(ATRA, ALPACK);
NATRA_ADDER.attachNatra(NATRA);
adder.registerModule('natra', NATRA_ADDER.natraAdder);
// matplotlib: plot, whose figures leave the worker as draw lists (plain JSON) that golem's shell replays
adder.registerModule('plt', PLOT.pltAdder);
const figures = () => PLOT.pltAdder.shown().map(f => f.toDrawList());
// AIR: adder compiles the person's Python to JavaScript (engine 'auto'), with the same sandbox; a trace, or code
// the compiler refuses, is tree-walked instead (principle 9: generated code stays inside this worker)
adder.attachAir(AIR);
const resetFigures = () => PLOT.pltAdder.close('all');
self.onmessage = async e => { self.postMessage(await pyRun({ run, pyRepr, adderParse, figures, resetFigures }, e.data)); };
`;
  return "'use strict';\n/* ==== src/vendor/adder.js ==== */\n" + adder + '\n;\n' + libs + '\n/* ==== src/worker/py-driver.js ==== */\n' + driver + setup;
}

export function bundle(entry) {
  const order = [], state = new Map(), varOf = new Map();
  const visit = rel => {
    const abs = join(src, rel);
    if (state.get(abs) === 'done') return;
    if (state.get(abs) === 'visiting') throw new Error(`build: import cycle through src/${rel}`);
    state.set(abs, 'visiting');
    // a minified bundle ends its last line with its export block; that block goes on a line of its own
    const code = readFileSync(abs, 'utf8').replace(/([;}])export\s*\{([^}]*)\};?\s*$/, '$1\nexport {$2};\n'), imports = [];
    for (const line of code.split('\n')) {
      if (!/^\s*import\b/.test(line)) continue;
      if ((line.match(/\bimport\b/g) || []).length > 1) throw new Error(`build: src/${rel}: one import per line`);
      if (/^\s*import\s*\*/.test(line) || /^\s*import\s+[\w$]/.test(line)) throw new Error(`build: src/${rel}: named imports only, no "* as" and no default imports: ${line.trim()}`);
      const m = /^\s*import\s*\{([^}]*)\}\s*from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/.exec(line);
      if (!m) throw new Error(`build: src/${rel}: cannot read import: ${line.trim()}`);
      const dep = posix(relative(src, resolve(dirname(abs), m[2] || m[3])));
      visit(dep);
      if (m[1]) imports.push({ dep, names: m[1].split(',').map(x => x.trim()).filter(Boolean).map(e => { const n = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(e); if (!n) throw new Error(`build: src/${rel}: cannot read import entry "${e}"`); return [n[1], n[2] || n[1]]; }) });
    }
    order.push({ rel, code, imports }); state.set(abs, 'done');
  };
  visit(entry);
  // each module is a function whose exports come back as an object; a module reads what it imports from
  // the objects of the modules it names, so two modules may export the same name
  const parts = order.map(({ rel, code, imports }, i) => {
    if (/^\s*export\s+default\b/m.test(code)) throw new Error(`build: src/${rel}: no default exports`);
    if (/^\s*export\s*(\*|\{[^}]*\}\s*from\b)/m.test(code)) throw new Error(`build: src/${rel}: no re-exports`);
    if (/^\s*export\s+let\b/m.test(code)) throw new Error(`build: src/${rel}: no "export let" (a reassigned export cannot cross the wrapper; export a function that reads it)`);
    if (/\bimport\.meta\b/.test(code)) throw new Error(`build: src/${rel}: import.meta has no meaning in the single file`);
    // best effort: a second declarator after a top-level comma (a comma inside parentheses is a parameter list)
    if (/^export\s+(?:const|var)\s+\w+\s*=\s*[^\n(]*,\s*\w+\s*=[^=>]/m.test(code)) throw new Error(`build: src/${rel}: one declarator per export line`);
    // the module's exports: declarations, and export blocks (with `name as alias`)
    const exports = [];
    for (const m of code.matchAll(/^export\s+(?:async\s+)?(?:const|var|function\*?|class)\s+([\w$]+)/gm)) exports.push([m[1], m[1]]);
    const stripped = code.replace(/^\s*import\s[^\n]*\n/gm, '').replace(/^\s*export\s*\{([^}]*)\};?[^\n]*\n/gm, (_, inner) => {
      for (const e of inner.split(',').map(x => x.trim()).filter(Boolean)) {
        const m = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(e); if (!m) throw new Error(`build: src/${rel}: cannot read export entry "${e}"`);
        exports.push([m[1], m[2] || m[1]]);
      }
      return '';
    }).replace(/^export\s+/gm, '');
    const seen = new Set(); for (const [, a] of exports) { if (seen.has(a)) throw new Error(`build: src/${rel} exports "${a}" twice`); seen.add(a); }
    for (const { dep, names } of imports) for (const [n] of names) if (!order.find(o => o.rel === dep).exports.some(([, a]) => a === n)) throw new Error(`build: src/${rel} imports "${n}", which src/${dep} does not export`);
    order[i].exports = exports;
    const v = `__m${i}`; varOf.set(rel, v);
    const head = imports.map(({ dep, names }) => `const { ${names.map(([n, a]) => n === a ? n : `${n}: ${a}`).join(', ')} } = ${varOf.get(dep)};
`).join('');
    const ret = `
  return { ${exports.map(([n, a]) => n === a ? n : `${a}: ${n}`).join(', ')} };`;
    return `/* ==== src/${rel} ==== */
const ${v} = (() => {
${head}${stripped.trim()}${ret}
})();
`;
  });
  return parts.join('\n');
}

// the two faces, embedded so the page makes no network request
function fontFaces() {
  const dir = join(src, 'shell', 'fonts');
  return readdirSync(dir).filter(f => f.endsWith('.woff2')).sort().map(f => {
    const [fam, w] = f.replace('.woff2', '').split(/-(?=\d)/);
    const family = fam === 'barlow' ? 'Barlow' : 'Space Mono';
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(join(dir, f)).toString('base64')}) format('woff2')}`;
  }).join('\n');
}

// ── the installable app (SPEC 13.11): what installing needs, beside golem.html, which stays the whole app ──
// The mark (an orange square) on Basalt, drawn here: no binary we did not make. Colours are the Switchboard swatches.
const BASALT = '#15171A', ORANGE = '#FB9044', STONE = '#D2D1CE';
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function png(size, mark) {   // mark: the square's side over the icon's
  const bg = rgb(BASALT), fg = rgb(ORANGE), row = size * 4 + 1, raw = Buffer.alloc(row * size);
  const lo = Math.round(size * (1 - mark) / 2), hi = size - lo;
  for (let y = 0; y < size; y++) { raw[y * row] = 0; for (let x = 0; x < size; x++) { const c = x >= lo && x < hi && y >= lo && y < hi ? fg : bg; raw.set([...c, 255], y * row + 1 + x * 4); } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${BASALT}"/><rect x="22" y="22" width="20" height="20" fill="${ORANGE}"/></svg>`;
export const MANIFEST = {
  id: './golem.html', name: 'golem', short_name: 'golem',
  description: 'An assistant with no model at runtime. It reads what you type, or says it cannot. Works offline once installed.',
  start_url: './golem.html', scope: './', display: 'standalone', background_color: BASALT, theme_color: BASALT,
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  shortcuts: [{ name: 'New session', url: './golem.html?new', icons: [{ src: 'icon-192.png', sizes: '192x192' }] }],
};
// The worker's text stays the same from build to build (its cache name is fixed): the browser re-reads sw.js on its own
// about once a day, and an identical file changes nothing. A new golem.html arrives only through "Check for updates".
// Bump SW_CACHE only when the precache list or this config changes.
const SW_CACHE = 'golem-shell-v1';
const SW_PRECACHE = ['./golem.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
async function installable(dir) {
  const { makeSw } = await import(pathToFileURL(join(src, 'vendor', 'sw', 'make.mjs')).href);
  writeFileSync(join(dir, 'sw.js'), makeSw({ app: 'golem', cache: SW_CACHE, precache: SW_PRECACHE, autoCheck: false, navFallback: './golem.html', routes: [] }));
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify(MANIFEST, null, 2) + '\n');
  writeFileSync(join(dir, 'icon.svg'), ICON_SVG + '\n');
  writeFileSync(join(dir, 'icon-192.png'), png(192, 0.34));
  writeFileSync(join(dir, 'icon-512.png'), png(512, 0.34));
  writeFileSync(join(dir, 'icon-maskable-512.png'), png(512, 0.28));   // inside the maskable safe zone (the middle 80%)
}
const HEAD_PWA = `<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(ICON_SVG)}">
<link rel="apple-touch-icon" href="icon-192.png">
<meta name="theme-color" content="${STONE}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${BASALT}" media="(prefers-color-scheme: dark)">
`;

if (process.argv[1] && posix(process.argv[1]).endsWith('/build.mjs')) {
  const shell = readFileSync(join(src, 'shell', 'index.html'), 'utf8');
  if (!shell.includes('/*__FONTS__*/')) throw new Error('build: src/shell/index.html needs a /*__FONTS__*/ marker inside a <style>');
  const js = bundle('shell/main.js').replace("/*__PY_WORKER__*/''", () => JSON.stringify(pyWorkerSource()).replace(/</g, '\\u003c'));
  if (!js.includes('self.onmessage')) throw new Error('build: the Python worker was not embedded (marker missing in src/shell/main.js)');
  // the shell file starts with <title> and <style>; everything after the <!--__BODY__--> marker is the body
  const cut = shell.indexOf("<!--__BODY__-->"); if (cut < 0) throw new Error("build: src/shell/index.html needs a <!--__BODY__--> marker");
  const head = shell.slice(0, cut).replace('/*__FONTS__*/', fontFaces());
  const out = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${HEAD_PWA}${head}</head>\n<body>\n${shell.slice(cut)}\n<script>\n'use strict';\n${js}</script>\n</body>\n</html>\n`;
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'golem.html'), out);
  await installable(join(root, 'dist'));
  const { ontology } = await import(pathToFileURL(join(src, 'engine', 'index.js')).href);
  writeFileSync(join(root, 'dist', 'golem.json'), JSON.stringify(ontology(), null, 2) + '\n');
  console.log(`dist/golem.html  ${(out.length / 1024).toFixed(1)} kB  from ${js.split('/* ==== src/').length - 1} modules · dist/golem.json written · sw.js, manifest and icons for installing`);
}

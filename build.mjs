// Build dist/golem.html: src/shell/index.html with the fonts embedded, then the shell, engine and vendored
// modules in import order inside one classic <script>. No bundler and no transforms of the code itself:
// each module's text goes in verbatim, wrapped in a function so its private names stay private, and its
// exports become plain `const` declarations in the shared scope. The build refuses import cycles, exported
// names declared twice, and the module syntax the wrapping cannot carry (default exports, namespace
// imports, aliased imports, re-exports, `export let`, import.meta, several declarators on one export line).
// It also writes dist/golem.json, the clause ontology the engine derives from its declarations.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
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
  ['PLOT', 'vendor/plot.js']];
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
// learn's tree models have an opt-in .compile() that builds predict functions with new Function, and the bundle
// installs it. golem's principle 9 keeps generated JavaScript out (natra's Wasm, built from source, is allowed), so
// in the worker that method refuses; fit and predict are unaffected.
(function noCompile(seen, v, depth) {
  if (!v || depth > 3 || seen.has(v) || (typeof v !== 'object' && typeof v !== 'function')) return; seen.add(v);
  if (typeof v === 'function' && v.prototype && Object.prototype.hasOwnProperty.call(v.prototype, 'compile') && v !== LEARN.BaseEstimator)
    v.prototype.compile = function () { throw new Error('compile() is not available in golem: it builds code at run time. predict() gives the same answer.'); };
  if (typeof v === 'object') for (const k of Object.keys(v)) noCompile(seen, v[k], depth + 1);
})(new Set(), LEARN, 0);
LEARN_ADDER.attachLearn(LEARN);
adder.registerModule('learn', LEARN_ADDER.learnAdder);
// numpy: natra, compiling its kernels here with atra from the alpack sources (Wasm built from source, principle 9)
NATRA.attachAtra(ATRA, ALPACK);
NATRA_ADDER.attachNatra(NATRA);
adder.registerModule('natra', NATRA_ADDER.natraAdder);
// matplotlib: plot, whose figures leave the worker as draw lists (plain JSON) that golem's shell replays
adder.registerModule('plt', PLOT.pltAdder);
const figures = () => PLOT.pltAdder.shown().map(f => f.toDrawList());
self.onmessage = async e => { self.postMessage(await pyRun({ run, pyRepr, adderParse, figures }, e.data)); };
`;
  return "'use strict';\n/* ==== src/vendor/adder.js ==== */\n" + adder + '\n;\n' + libs + '\n/* ==== src/worker/py-driver.js ==== */\n' + driver + setup;
}

export function bundle(entry) {
  const order = [], state = new Map();
  const visit = rel => {
    const abs = join(src, rel);
    if (state.get(abs) === 'done') return;
    if (state.get(abs) === 'visiting') throw new Error(`build: import cycle through src/${rel}`);
    state.set(abs, 'visiting');
    const code = readFileSync(abs, 'utf8');
    for (const line of code.split('\n')) {
      if (!/^\s*import\b/.test(line)) continue;
      if ((line.match(/\bimport\b/g) || []).length > 1) throw new Error(`build: src/${rel}: one import per line`);
      if (/^\s*import\s*\*/.test(line) || /\bas\b/.test(line.replace(/'[^']*'/g, ''))) throw new Error(`build: src/${rel}: named imports only, no "* as" and no "as" aliases: ${line.trim()}`);
      const m = /from\s+['"](\.[^'"]+)['"]|^\s*import\s+['"](\.[^'"]+)['"]/.exec(line);
      if (!m) throw new Error(`build: src/${rel}: cannot read import: ${line.trim()}`);
      visit(posix(relative(src, resolve(dirname(abs), m[1] || m[2]))));
    }
    order.push({ rel, code }); state.set(abs, 'done');
  };
  visit(entry);
  const owner = new Map();
  const parts = order.map(({ rel, code }) => {
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
    for (const [, name] of exports) { if (owner.has(name)) throw new Error(`build: "${name}" is exported by both src/${owner.get(name)} and src/${rel}`); owner.set(name, rel); }
    const ret = exports.length ? `\n  return { ${exports.map(([n, a]) => n === a ? n : `${a}: ${n}`).join(', ')} };` : '';
    const head = exports.length ? `const { ${exports.map(([, a]) => a).join(', ')} } = ` : '';
    return `/* ==== src/${rel} ==== */\n${head}(() => {\n${stripped.trim()}${ret}\n})();\n`;
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

if (process.argv[1] && posix(process.argv[1]).endsWith('/build.mjs')) {
  const shell = readFileSync(join(src, 'shell', 'index.html'), 'utf8');
  if (!shell.includes('/*__FONTS__*/')) throw new Error('build: src/shell/index.html needs a /*__FONTS__*/ marker inside a <style>');
  const js = bundle('shell/main.js').replace("/*__PY_WORKER__*/''", () => JSON.stringify(pyWorkerSource()).replace(/</g, '\\u003c'));
  if (!js.includes('self.onmessage')) throw new Error('build: the Python worker was not embedded (marker missing in src/shell/main.js)');
  // the shell file starts with <title> and <style>; everything from the first <div class="wrap"> on is the body
  const cut = shell.indexOf('<div class="wrap">');
  const head = shell.slice(0, cut).replace('/*__FONTS__*/', fontFaces());
  const out = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}</head>\n<body>\n${shell.slice(cut)}\n<script>\n'use strict';\n${js}</script>\n</body>\n</html>\n`;
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'golem.html'), out);
  const { ontology } = await import(pathToFileURL(join(src, 'engine', 'index.js')).href);
  writeFileSync(join(root, 'dist', 'golem.json'), JSON.stringify(ontology(), null, 2) + '\n');
  console.log(`dist/golem.html  ${(out.length / 1024).toFixed(1)} kB  from ${js.split('/* ==== src/').length - 1} modules · dist/golem.json written`);
}

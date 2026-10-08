// Build dist/golem.html: src/shell/index.html with the fonts embedded, then the shell, engine and vendored
// modules concatenated in import order inside one classic <script>. No bundler and no transforms beyond
// dropping the import and export keywords, so the output is the source you read. The modules therefore
// share one scope: the build refuses duplicate top-level names, import cycles, and the module syntax a
// concatenation cannot carry (default exports, namespace imports, re-exports, aliased imports, import.meta).
// It also writes dist/golem.json, the clause ontology the engine derives from its declarations.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const posix = p => p.split(sep).join('/');

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
  const names = new Map();
  const parts = order.map(({ rel, code }) => {
    if (/^\s*export\s+default\b/m.test(code)) throw new Error(`build: src/${rel}: no default exports`);
    if (/^\s*export\s*(\*|\{[^}]*\}\s*from\b)/m.test(code)) throw new Error(`build: src/${rel}: no re-exports`);
    if (/\bimport\.meta\b/.test(code)) throw new Error(`build: src/${rel}: import.meta has no meaning in the single file`);
    for (const m of code.matchAll(/^(?:export\s+)?(?:const|let|var|function|class)\s+([\w$]+)/gm)) {
      if (names.has(m[1])) throw new Error(`build: top-level name "${m[1]}" is declared in both src/${names.get(m[1])} and src/${rel}`);
      names.set(m[1], rel);
    }
    const stripped = code.replace(/^\s*import\s[^\n]*\n/gm, '').replace(/^\s*export\s*\{[^}]*\};?[^\n]*\n/gm, '').replace(/^export\s+/gm, '');
    return `/* ==== src/${rel} ==== */\n${stripped.trim()}\n`;
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
  const js = bundle('shell/main.js');
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

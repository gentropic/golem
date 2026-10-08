// Build dist/golem.html: the shell followed by every src/*.js in name order, in one <script>.
// No bundler and no transforms, so the output is the source you read.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const files = readdirSync(src).sort();
const shell = files.filter(f => f.endsWith('.html')).map(f => readFileSync(join(src, f), 'utf8')).join('\n');
const js = files.filter(f => f.endsWith('.js')).map(f => `/* ==== src/${f} ==== */\n` + readFileSync(join(src, f), 'utf8')).join('\n');
// The shell file starts with <title>, fonts and <style>; everything from the first <div class="wrap"> on is the body.
const cut = shell.indexOf('<div class="wrap">');
const out = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${shell.slice(0, cut)}</head>\n<body>\n${shell.slice(cut)}\n<script>\n${js}\n</script>\n</body>\n</html>\n`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'golem.html'), out);
console.log(`dist/golem.html  ${(out.length / 1024).toFixed(1)} kB  from ${files.length} source files`);

// The web app at gentropic.org/golem: copies what the build wrote for serving into the org site's clone
// (../gentropic.github.io/golem/ by default, or the folder given), where a commit and a push publish it.
// Only what a visitor loads: the folder's index, the page, the worker, the manifest and the icons. Nothing is pushed here.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(process.argv[2] || join(root, '..', 'gentropic.github.io'));
const FILES = ['index.html', 'golem.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
if (!existsSync(join(SITE, 'CNAME'))) { console.error(`not the org site's clone: ${SITE}`); process.exit(2); }
const out = join(SITE, 'golem');
mkdirSync(out, { recursive: true });
for (const f of FILES) copyFileSync(join(root, 'dist', f), join(out, f));
console.log(`copied ${FILES.length} files to ${out}: commit and push the site to publish gentropic.org/golem/`);

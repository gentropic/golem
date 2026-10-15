// Sharing a session so it can be checked (SPEC 13: things you can trust). Two pieces the shell builds on:
//
// canonical(v): the session file as bytes that do not depend on key order, which is what a signature covers. The shell
// signs those bytes with a key that never leaves the device (the phone's hardware key in the app, a WebCrypto key kept
// in IndexedDB in a browser) and checks them on import; the engine only says what the bytes are.
//
// The session as a notebook (.ipynb): each card's question, reading, answer, steps and source as Markdown, its Python
// line as a code cell (illustrative: golem's names for the call, not a published API), and the session's own replay
// file in the notebook's metadata (metadata.golem), so golem opens the notebook again as the session and recomputes
// every card from its { tool, args }. That replay is what makes the numbers checkable.
import { S, tool, iso, clock } from './core.js';
import { current, exportSession } from './sessions.js';

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
// a session file without its signature: what was signed
export const unsigned = d => { const { signature, ...rest } = d || {}; return rest; };

/* ── a card as Markdown ──────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function blockMd(b) {
  switch (b.t) {
    case 'big': return `**${b.v}** ${b.unit || ''}`.trim();
    case 'sub': case 'note': case 'lbl': return b.kind === 'err' ? `> ${b.text}` : b.text || '';
    case 'src': return `*${b.text}*`;
    case 'kv': return b.rows.map(([k, v]) => `- ${k}: ${v}`).join('\n');
    case 'table': return [`| ${b.head.map(esc).join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`, ...b.rows.slice(0, 50).map(r => `| ${r.map(esc).join(' | ')} |`), ...(b.rows.length > 50 ? [`\n(${b.rows.length - 50} more rows)`] : [])].join('\n');
    case 'list': case 'steps': return b.items.map((x, i) => `${b.t === 'steps' ? i + 1 + '.' : '-'} ${x}`).join('\n');
    case 'pre': return '```\n' + b.text + '\n```';
    case 'net': return `(a stereonet: ${(b.planes || []).length} plane${(b.planes || []).length === 1 ? '' : 's'}, ${(b.lines || []).length} line${(b.lines || []).length === 1 ? '' : 's'})`;
    case 'bars': case 'curve': case 'figure': return '(a chart; golem draws it when the session is opened)';
    default: return '';
  }
}
const readOf = r => r.read.map(x => typeof x === 'string' ? x : `**${x.v}**`).join(' ');
const cellId = (n, k) => `golem-${String(n).padStart(3, '0')}-${k}`;
const lines = s => s.split('\n').map((l, i, a) => i < a.length - 1 ? l + '\n' : l);
export function notebookOf(sess, cards, at) {
  const cells = [{ cell_type: 'markdown', id: 'golem-head', metadata: {}, source: lines(`# ${sess.name || 'golem session'}\n\nExported from golem on ${at}: ${cards.length} card${cards.length === 1 ? '' : 's'}, each as golem answered it. The Python lines are golem's names for each call, illustrative rather than a published API. The session itself is in this notebook's metadata (\`metadata.golem\`): open the notebook with golem's paperclip and every card is recomputed from what it was given.`) }];
  for (const c of cards) {
    const r = c.res; if (!r) continue;
    const md = [`### #${String(c.id).padStart(2, '0')} · ${c.raw}`, `Read as ${readOf(r)} *(${c.rung})*`, ...r.body.map(blockMd).filter(Boolean),
      ...(r.trace.length ? [`<details><summary>How · ${r.trace.length} step${r.trace.length === 1 ? '' : 's'}</summary>\n\n${r.trace.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n</details>`] : [])].join('\n\n');
    cells.push({ cell_type: 'markdown', id: cellId(c.id, 'md'), metadata: {}, source: lines(md) });
    if (r.py) cells.push({ cell_type: 'code', id: cellId(c.id, 'py'), metadata: { golem: { illustrative: true } }, execution_count: null, outputs: [], source: lines(`# #${String(c.id).padStart(2, '0')} ${c.raw}\n${r.py}`) });
  }
  return { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' }, language_info: { name: 'python' } }, cells };
}

tool({
  name: 'exportNotebook',
  skill: { group: 'Session', title: 'The session as a notebook', on: 'nbformat 4', about: 'The session as a Jupyter notebook: each card as Markdown, its Python line as a code cell, and the session itself in the metadata, so golem reopens it and recomputes every card. Exported session files are signed with this device\'s key, and checked when opened.', examples: ['export as notebook'] },
  topic: () => ['Notebook', .5],
  run: () => {
    const s = current(), cards = S.cards.filter(c => c.tool !== 'exportNotebook'), at = iso(clock.now());
    const nb = notebookOf(s || {}, cards, at), name = `${((s && s.name) || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session'}.ipynb`;
    // the replay file goes in by the shell, which signs it first (golem.json is the same object)
    return { read: ['export session as', { v: 'notebook' }], value: cards.length, file: { name, mime: 'application/x-ipynb+json', notebook: nb, session: s ? s.id : null },
      body: [{ t: 'kv', rows: [['cards', String(cards.length)], ['cells', `${nb.cells.length}: Markdown for each card, a code cell for each Python line`], ['replay', 'the session itself, in metadata.golem, signed with this device\'s key when saved']] }, { t: 'actions', items: [{ act: 'save', label: `Save ${name}` }] }, { t: 'src', text: 'nbformat 4 · opens in Jupyter, auditable, or golem' }],
      trace: [`${cards.length} cards → ${nb.cells.length} cells`, 'metadata.golem: the session file, added and signed when saved'] };
  }
});
export { exportSession };

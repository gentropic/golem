// Standing orders (SPEC 13: a golem keeps to what it was told). "warn me when cu > 30", "every row needs from < to":
// a condition in the grammar's own terms, kept on the device (S.orders), checked every time a table opens and every
// time a row is written to a device table (the log, the field notebook), against any table that has its columns. What
// breaks an order is said on that card, with the rows; nothing else is done about it, and an order whose columns a
// table lacks is not applied to it. "standing orders" lists them; "forget standing order 2" drops one; undo too.
import { S, tool, frame, noun, CHECKS } from './core.js';
import { whereOf } from './table.js';
import { evaluatePredicate } from '../vendor/sift.js';

const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const label = o => `${o.kind === 'must' ? 'every row needs' : 'warn when'} ${o.text}`;
const rowName = (t, r, i) => { const h = t.roles && t.roles.hole, f = t.roles && t.roles.from; return h && f ? `${r[h]} ${r[f]}–${r[t.roles.to]}` : r.station != null ? `station ${r.station}${r.feature && r.feature !== 'station' ? ` ${r.feature}` : ''}` : r.name != null ? String(r.name) : `row ${i + 1}`; };
// the rows of a table that break an order, or null when the order does not apply (a column it names is missing)
export function breaches(o, t, only) {
  let p; try { p = whereOf(o.cond, t).pred; } catch (e) { return null; }
  const rows = only || t.rows, out = [];
  rows.forEach(r => { const i = t.rows.indexOf(r), hit = evaluatePredicate(p, k => r[k]); if (o.kind === 'must' ? !hit : hit) out.push({ i, r }); });
  return out;
}
CHECKS.push((t, only) => {
  if (!S.orders.length || !t || !t.rows) return [];
  const out = [];
  S.orders.forEach((o, n) => {
    const b = breaches(o, t, only); if (!b || !b.length) return;
    const names = b.slice(0, 8).map(x => rowName(t, x.r, x.i));
    out.push({ t: 'note', kind: 'warn', text: `Standing order ${n + 1}, "${label(o)}": ${only ? (b.length === 1 ? 'the row just written breaks it' : `${b.length} rows just written break it`) : `${b.length} row${b.length === 1 ? '' : 's'} of ${t.rows.length} break${b.length === 1 ? 's' : ''} it`}${only && b.length === 1 ? '' : `: ${names.join(', ')}${b.length > names.length ? `, and ${b.length - names.length} more` : ''}`}.` });
  });
  return out;
});

tool({
  name: 'order', effects: ['device'],
  skill: { group: 'Session', title: 'Standing orders', on: 'device · @gcu/sift', about: 'Conditions golem keeps to: "warn me when cu > 30", "every row needs from < to". Checked every time a table opens and every time a row is written to the log or the field notebook, against any table with those columns; what breaks one is said on that card. Kept on this device.', examples: ['warn me when cu > 30', 'every row needs from < to', 'standing orders', 'forget standing order 1'] },
  topic: a => ['Standing order', .5],
  undo: a => { S.orders = S.orders.filter(o => o.id !== a.id); },
  run: a => {
    if (!S.orders.some(o => o.id === a.id)) S.orders.push({ id: a.id, kind: a.kind, cond: a.cond, text: a.text });
    const n = S.orders.findIndex(o => o.id === a.id) + 1, now = S.table ? breaches(a, S.table) : null;
    return { read: ['standing order', { v: String(n) }, ':', { v: label(a) }],
      body: [{ t: 'note', kind: 'ok', text: `Standing order ${n}: ${label(a)}. I check it every time a table opens and every time a row is written to the log or the field notebook, on any table with ${a.text.match(/[a-z_][a-z0-9_]*/gi).filter(w => !/^(and|or|not|is|in|between|blank)$/i.test(w))[0] ? 'those columns' : 'its columns'}.` },
        ...(S.table ? [now == null ? { t: 'sub', text: `The open table, ${S.table.name}, does not have its columns, so it does not apply there.` } : now.length ? { t: 'note', kind: 'warn', text: `In the open table, ${S.table.name}, ${now.length} row${now.length === 1 ? '' : 's'} of ${S.table.rows.length} break${now.length === 1 ? 's' : ''} it: ${now.slice(0, 8).map(x => rowName(S.table, x.r, x.i)).join(', ')}${now.length > 8 ? ', …' : ''}.` } : { t: 'sub', text: `The open table, ${S.table.name}, keeps it: every row.` }] : []),
        { t: 'chips', items: ['standing orders'] }],
      trace: [`order: ${a.kind} ${a.text}`, 'checked on open and on every row written'] };
  }
});
tool({
  name: 'orders',
  topic: () => ['Standing orders', .2],
  run: () => ({ read: ['standing orders'], value: S.orders.length,
    body: S.orders.length ? [{ t: 'table', head: ['', 'order'], rows: S.orders.map((o, i) => [String(i + 1), label(o)]) }, { t: 'chips', items: S.orders.map((_, i) => `forget standing order ${i + 1}`) }] : [{ t: 'note', text: 'None. Give one as "warn me when cu > 30" or "every row needs from < to".' }],
    trace: [`${S.orders.length} on this device`] })
});
tool({
  name: 'orderForget', effects: ['device'],
  topic: () => ['Standing orders', .2],
  undo: a => { if (a.was) S.orders.splice(a.n - 1, 0, a.was); },
  run: a => {
    if (!a.done) { const o = S.orders[a.n - 1]; if (o) { a.was = o; S.orders.splice(a.n - 1, 1); } a.done = true; }
    return { read: ['forget standing order', { v: String(a.n) }], body: [{ t: 'note', kind: a.was ? 'ok' : 'err', text: a.was ? `Forgotten: "${label(a.was)}". ${S.orders.length} left.` : `There is no standing order ${a.n}.` }], trace: ['S.orders'] };
  }
});

/* ── what reads them ─────────────────────────────────────────── */
// the condition as the grammar read it, and the words as said for the label
const condOf = c => c.roles.when && c.roles.when[0] && c.roles.when[0].cond;
const WARN = ['flag rows', 'flag any row', 'flag every row', 'warn me about rows', 'warn about rows', 'warn me of rows', 'alert me to rows', 'flag', 'marca as linhas', 'avisa das linhas', 'me avisa das linhas'], MUST = ['require rows', 'require every row', 'keep rows', 'insist on rows', 'every row must be one', 'exige linhas', 'exige que as linhas'];
frame({
  name: 'orderWarn', label: 'Standing order', words: WARN.slice(0, 8), theme: [], required: ['when'], roles: { when: { preps: ['about', 'of', 'on', 'with', 'where', 'for'], types: ['cond'] } },
  words_pt: WARN.slice(8), label_pt: 'Ordem permanente',
  bind: (c) => { const cond = condOf(c); return cond ? { tool: 'order', args: { id: newId(), kind: 'warn', cond, text: c.roles.when[0].text || condText(cond) } } : null; }
});
frame({
  name: 'orderMust', label: 'Standing order', words: MUST.slice(0, 5), theme: [], required: ['when'], roles: { when: { preps: ['with', 'where'], types: ['cond'] } },
  words_pt: MUST.slice(5), label_pt: 'Ordem permanente',
  bind: (c) => { const cond = condOf(c); return cond ? { tool: 'order', args: { id: newId(), kind: 'must', cond, text: c.roles.when[0].text || condText(cond) } } : null; }
});
// a condition back in words, for the label: the grammar's tree as it reads
const OPW = { above: '>', below: '<', atleast: '>=', atmost: '<=', equals: 'is', differs: 'is not' };
const valW = x => x.n != null ? `${x.n}${x.unit ? ' ' + x.unit : ''}` : x.s;
export function condText(c) {
  if (c.or) return c.or.map(condText).join(' or ');
  if (c.and) return c.and.map(condText).join(' and ');
  if (c.not) return `not ${condText(c.not)}`;
  const col = c.col.value;
  if (c.op === 'between') return `${col} between ${valW(c.vals[0])} and ${valW(c.vals[1])}`;
  if (c.op === 'in') return `${col} in ${c.vals.map(valW).join(', ')}`;
  if (c.op === 'blank' || c.op === 'present') return `${col} is ${c.op === 'blank' ? 'blank' : 'not blank'}`;
  return `${col} ${OPW[c.op] || c.op} ${valW(c.val)}`;
}
noun({ type: 'orderlist', words: { all: ['standing orders', 'my standing orders', 'the standing orders', 'my orders'] }, words_pt: { all: ['ordens permanentes', 'minhas ordens'] } });
frame({
  name: 'orders', label: 'Standing orders', words: ['list', 'show', 'what are'], elidable: true, theme: ['orderlist'], required: ['theme'], roles: {}, words_pt: ['lista', 'mostra'], label_pt: 'Ordens permanentes',
  bind: () => ({ tool: 'orders', args: {} })
});
frame({
  name: 'orderForget', label: 'Forget a standing order', words: ['forget standing order', 'drop standing order', 'cancel standing order', 'forget order'], theme: ['quantity:bare'], required: ['theme'], roles: {},
  words_pt: ['esquece a ordem', 'cancela a ordem'], label_pt: 'Esquecer ordem',
  bind: c => { const q = c.theme[0]; return q && q.type === 'quantity' && !q.unit && Number.isInteger(q.n) && q.n > 0 ? { tool: 'orderForget', args: { n: q.n } } : null; }
});

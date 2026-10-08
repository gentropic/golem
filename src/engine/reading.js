// The reading ladder: context (amendments, meta-intents), grammar (a regex rule table, until the clause
// parser stands here), taught words (device lexicon rewrites, then grammar again). Plus the tools that
// talk about the session itself: none, why, export.
import { S, T, iso } from './core.js';
import { findDate, findTime, today } from './dates.js';
import { fbFind } from './knowledge.js';
import { ALLEX, VOCAB } from './skills.js';

export const norm = s => s.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
function parseEvent(str) {
  const low = str.toLowerCase(), d = findDate(low), t = findTime(low), du = /\bfor (\d+(?:\.\d+)?) ?(h|hr|hrs|hours?|min|mins|minutes?)\b/.exec(low);
  if (!d && !t) return null;
  let title = str;
  [d && d.m, t && t.m, du].filter(Boolean).sort((a, b) => b.index - a.index).forEach(m => { title = title.slice(0, m.index) + title.slice(m.index + m[0].length); });
  title = title.replace(/\s+/g, ' ').trim().replace(/^to /i, '').replace(/\b(on|at|for)$/i, '').trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : 'Event', date: +(d ? d.d : today()), timed: !!t, h: t ? t.h : 0, mi: t ? t.mi : 0, dur: du ? Math.round(du[1] * (du[2][0] === 'h' ? 60 : 1)) : 60 };
}
// Rung 2. Order matters; specific rules before general ones. `text` keeps the person's casing, `q` is lowercase.
export function grammar(text, q, rung) {
  let m, r;
  const go = (tool, args) => { const res = T[tool](args); return res ? { tool, args, rung, res } : null; };
  const col = w => w[0] === 'c' ? 'cu' : 'au';
  if ((m = /^(.+?) means (.+)$/.exec(q))) return go('teach', { word: m[1], means: m[2] });
  if (/^(export|save|give me)\b.*\b(script|notebook|python|adder)$/.test(q)) return go('export', {});
  if ((m = /^(?:set |start )?(?:a )?timer (?:for |of )?(\d+(?:\.\d+)?) ?(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hours?)$/.exec(q))) return go('timer', { sec: Math.round(m[1] * (m[2][0] === 's' ? 1 : m[2][0] === 'm' ? 60 : 3600)) });
  if ((m = /^(?:set )?(?:an )?alarm (?:for |at )?(.+)$/.exec(q) || /^wake me(?: up)? at (.+)$/.exec(q))) { const t = findTime('at ' + m[1]); if (t) return go('alarm', { h: t.h, mi: t.mi }); }
  if ((m = /^(?:remind me to|remind me|add (?:an )?event|new event|schedule)[:,]? (.+)$/.exec(q))) { const e = parseEvent(text.slice(text.length - m[1].length)); if (e) return go('event', e); }
  if (/^remember /.test(q)) return go('remember', { text: text.replace(/^remember (that )?/i, '') });
  if ((m = /^what do you (?:know|remember) about (.+)$/.exec(q))) return go('recall', { about: m[1] });
  if (/^open (.+\.csv|the sample|sample|assays)$/.test(q)) return go('open', {});
  if ((m = /^hist(?:ogram)? (?:of )?(cu|au|copper|gold)( (?:in )?log(?: scale)?)?$/.exec(q))) return go('hist', { col: col(m[1]), log: !!m[2] });
  if ((m = /^(?:downhole )?variogram (?:of )?(cu|au|copper|gold)(?: at (\d) ?m)?$/.exec(q))) return go('vario', { col: col(m[1]), comp: m[2] ? +m[2] : undefined });
  if (/true thickness/.test(q)) {
    const len = /(\d+(?:\.\d+)?) ?m\b/.exec(q), h = /hole (\d{1,3})\/(\d{1,2})/.exec(q), p = /(?:bedding|vein|foliation|plane|contact|fault) (\d{1,3})\/(\d{1,2})/.exec(q);
    if (len && h && p) return go('thickness', { len: +len[1], htr: +h[1], hpl: +h[2], a1: +p[1], a2: +p[2], conv: 'dd' });
  }
  if ((m = /^(?:plot|stereonet(?: of)?|show)(?: plane| bedding)? (\d{1,3})\/(\d{1,2})$/.exec(q))) return go('plane', { a1: +m[1], a2: +m[2], conv: 'dd' });
  if ((m = /^(?:what is |what's )?(?:the )?(capital|population density|density|population|area) of (.+?)(?: in (.+))?$/.exec(q)) && (r = go('fact', { field: m[1] === 'population density' ? 'density' : m[1], country: m[2], unit: m[3] }))) return r;
  if ((m = /^(?:what is |what's )?(?:the )?(density|hardness|formula|streak) of (\w+)$/.exec(q)) && (r = go('mineral', { prop: m[1], name: m[2] }))) return r;
  if ((m = /^(?:which |list |show )?landlocked countries(?: (?:by|sorted by) (area|population))?$/.exec(q))) return go('factList', { by: m[1] || 'area' });
  if (/^(?:identify|key out|id)(?: a| this| the)? (?:mineral|rock|sample)$|^what mineral is this$/.test(q)) return go('key', {});
  if ((m = /^(?:check|lint|review)(?: this| the)?(?: text| sentence| paragraph)?[:,]? (.+)$/i.exec(text))) return go('lint', { text: m[1] });
  if ((m = /^(?:how many )?days (?:until|till|to|before) (.+)$/.exec(q)) && (r = go('daysUntil', { s: m[1] }))) return r;
  if ((m = /^what (?:day|weekday) (?:is|was|will be) (.+)$/.exec(q)) && (r = go('weekday', { s: m[1] }))) return r;
  if ((m = /^(?:convert )?(-?[\d.,]*\d) ?(.+?) (?:in|to|as|into) (.+)$/.exec(q)) && (r = go('convert', { v: parseFloat(m[1].replace(/,/g, '')), from: m[2], to: m[3] }))) return r;
  if ((m = /^(?:what is |what's |calc(?:ulate)? |compute )?([-+*/^().,\d\sa-z×÷]+)$/.exec(q)) && /\d/.test(m[1]) && (r = go('calc', { x: m[1].trim() }))) return r;
  if ((m = /^(?:what is|what's|define|explain|describe)(?: an?| the)? (.+)$/.exec(q)) && (r = go('define', { term: m[1] }))) return r;
  return null;
}
// Rung 1. An amendment of the last card, or "why".
export function context(q, last) {
  if (!last) return null;
  let m, res; const am = last.res.amend;
  const go = args => { res = T[last.tool](args); return res ? { tool: last.tool, args, rung: 'context', amends: last.id, res } : null; };
  if (/^(why|how|how so|show (me )?(the )?(plan|trace|work|steps))$/.test(q)) return { tool: 'why', args: { ref: last.id }, rung: 'context', amends: last.id, res: T.why({ ref: last.id }) };
  if ((m = /^(?:and |now |same (?:but )?)?(?:in|to|as) (.+)$/.exec(q))) {
    if (am === 'unit') return go({ ...last.args, to: m[1] });
    if (am === 'fact' && /area|density/.test(last.args.field)) return go({ ...last.args, unit: m[1] });
  }
  if (am === 'hist' && (m = /^(?:in )?(log|linear)(?: scale)?$/.exec(q))) return go({ ...last.args, log: m[1] === 'log' });
  if (am === 'fact' && (m = /^(?:and|same for|what about|now|and for)(?: the)? (.+)$/.exec(q)) && fbFind(m[1])) return go({ ...last.args, country: m[1] });
  return null;
}
// Rung 3. Taught words rewrite the query, then the grammar reads it again.
export function taught(text, q) {
  let q2 = ' ' + q + ' ', t2 = ' ' + text + ' ';
  Object.entries(S.aliases).forEach(([k, v]) => { const re = new RegExp('(?<=\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)', 'gi'); q2 = q2.replace(re, v); t2 = t2.replace(re, v); });
  q2 = q2.trim(); if (q2 === q) return null;
  const r = grammar(t2.trim(), q2, 'taught');
  if (r) r.res.trace.unshift(`lexicon: "${q}" → "${q2}"`);
  return r;
}
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1])); return d[a.length][b.length]; }
// Rung 5. Nothing read the query: say so, show the nearest skills, offer to learn the unknown word.
T.none = a => {
  const qt = new Set(a.q.split(/[^a-z0-9]+/).filter(Boolean));
  const near = ALLEX.map(e => { const et = e.toLowerCase().split(/[^a-z0-9]+/); return { e, s: et.filter(t => qt.has(t)).length / Math.sqrt(et.length * (qt.size || 1)) }; }).filter(x => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3);
  let teach = null;
  for (const t of a.q.split(/[^a-z]+/)) {
    if (t.length < 3 || VOCAB.has(t) || S.aliases[t]) continue;
    const c = [...VOCAB].find(v => v.length > t.length && v.startsWith(t)) || [...VOCAB].find(v => Math.abs(v.length - t.length) <= 1 && lev(v, t) === 1);
    if (c) { teach = `${t} means ${c}`; break; }
  }
  return {
    read: [],
    body: [{ t: 'note', kind: 'err', text: 'No reading, so no answer. I do not guess.' },
      ...(near.length ? [{ t: 'lbl', text: 'Nearest skills' }, { t: 'chips', items: near.map(x => x.e) }] : [{ t: 'sub', text: 'Nothing close. The Skills tab lists what I can do.' }]),
      ...(teach ? [{ t: 'lbl', text: 'Teach me the word' }, { t: 'chips', items: [teach] }] : [])],
    trace: ['context: no open question, no amendment fits', 'grammar: no rule matched', 'lexicon: no taught phrase applies', 'stop']
  };
};
T.why = a => {
  const c = S.cards.find(x => x.id === a.ref);
  return { read: ['explain card', { v: '#' + String(c.id).padStart(2, '0') }], body: [{ t: 'steps', items: c.res.trace }, { t: 'sub', text: 'These are the steps that ran, with their inputs. I can show how an answer was computed. I cannot say why the data looks the way it does.' }], trace: ['plan.of(card) → steps'] };
};
T.export = () => {
  const body = S.cards.filter(c => c.res.py).map(c => `# ${c.raw}\n${c.res.py}`).join('\n\n');
  const src = `# golem session, exported ${iso(new Date())}\n# every line is a tool call the session made\nfrom gcu import *\n\n${body || '# nothing to export yet'}`;
  return { read: ['export session as', { v: 'adder script' }], copy: src, body: [{ t: 'pre', text: src }, { t: 'actions', items: [{ act: 'copy', label: 'Copy script' }] }, { t: 'src', text: 'plan → adder · names are illustrative, the real packages decide the API' }], trace: ['collect the tool call behind each card', 'emit as adder source'] };
};

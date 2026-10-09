// Explainers: formal notation parsed and described, one row per piece. Cron schedules, epoch times,
// chmod modes, URLs and ECMAScript regular expressions. Each member has a recogniser so a bare
// payload ("what is 1700000000") finds its member; when two accept, the member is a slot.
import { tool, clock, fmt } from './core.js';

const MEMBERS = ['cron', 'time', 'url', 'chmod', 'regex'];
const DOWN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
const utc = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
const local = d => `${DOWN[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const andList = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
// a seeded generator (mulberry32), so the example strings of a regex replay the same
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/* ── cron ───────────────────────────────────────────────────── */
const CRON_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const CRON_FIELDS = [['minute', 0, 59], ['hour', 0, 23], ['day of month', 1, 31], ['month', 1, 12], ['day of week', 0, 7]];
// one field → { star, items: [{ a, b, step }], set: Set of values }; throws a plain message when it does not parse
function cronField(src, [label, lo, hi]) {
  const val = t => { if (/^\d+$/.test(t)) return +t; const n = CRON_NAMES[t.toLowerCase().slice(0, 3)]; if (n == null || !/^[a-z]+$/i.test(t)) throw `"${t}" is not a ${label}`; return n; };
  const items = [], set = new Set();
  for (const part of src.split(',')) {
    const m = /^(\*|\?|[^\/]+)(?:\/(\d+))?$/.exec(part); if (!m) throw `"${part}" is not a ${label} field`;
    const step = m[2] ? +m[2] : 1; let a, b;
    if (m[1] === '*' || m[1] === '?') { a = lo; b = hi; } else if (m[1].includes('-')) { [a, b] = m[1].split('-').map(val); } else { a = val(m[1]); b = m[2] ? hi : a; }
    if (a < lo || b > hi || a > b || step < 1) throw `"${part}" is outside ${lo} to ${hi} for the ${label}`;
    for (let v = a; v <= b; v += step) set.add(label === 'day of week' && v === 7 ? 0 : v);
    items.push({ star: m[1] === '*' || m[1] === '?', a, b, step, all: a === lo && (b === hi || (label === 'day of week' && b >= 6)) });
  }
  return { star: items.length === 1 && items[0].star && items[0].step === 1, items, set, src };
}
const isCron = s => {
  const f = s.trim().split(/\s+/); if (f.length !== 5 && f.length !== 6) return false;
  if (!f.some(x => /[\d*]/.test(x))) return false;
  const five = f.length === 6 ? f.slice(1) : f;
  try { five.forEach((x, i) => cronField(x, CRON_FIELDS[i])); return true; } catch (e) { return false; }
};
const nameOf = (label, v) => label === 'day of week' ? DOWN[v % 7] : label === 'month' ? MONN[v - 1] : label === 'day of month' ? `day ${v}` : label === 'minute' ? String(v) : pad(v);
function cronPhrase(f, label) {
  if (f.star) return null;
  return andList(f.items.map(it => {
    const a = nameOf(label, it.a), b = nameOf(label, it.b), unit = label === 'day of month' ? 'day' : label;
    if (it.step > 1) return `every ${it.step}${it.step === 2 ? 'nd' : it.step === 3 ? 'rd' : 'th'} ${unit}${it.all ? '' : ` from ${a} to ${b}`}`;
    return it.a === it.b ? a : `${a} to ${b}`;
  }));
}
function cronSentence(F) {
  const [mi, h, dom, mon, dow] = F, one = f => f.items.length === 1 && f.items[0].a === f.items[0].b && f.items[0].step === 1, step = f => f.items.length === 1 && f.items[0].step > 1 && f.items[0].all;
  let t;
  if (one(mi) && one(h)) t = `At ${pad(h.items[0].a)}:${pad(mi.items[0].a)}`;
  else if (one(mi) && h.star) t = `At minute ${mi.items[0].a} past every hour`;
  else if (step(mi) && h.star) t = `Every ${mi.items[0].step} minutes`;
  else if (mi.star && h.star) t = 'Every minute';
  else if (mi.star) t = `Every minute of ${one(h) ? 'hour ' + pad(h.items[0].a) : 'hours ' + cronPhrase(h, 'hour')}`;
  else t = `At ${mi.items.every(x => x.step > 1) ? '' : 'minute '}${cronPhrase(mi, 'minute')} past ${h.items.every(x => x.step > 1) ? '' : 'hour '}${cronPhrase(h, 'hour')}`;
  const parts = [t];
  if (!dom.star && !dow.star) parts.push(`on ${cronPhrase(dom, 'day of month')} of the month or on ${cronPhrase(dow, 'day of week')} (either matches)`);
  else if (!dom.star) parts.push(`on ${cronPhrase(dom, 'day of month')} of the month`);
  else if (!dow.star) parts.push(cronPhrase(dow, 'day of week'));
  if (!mon.star) parts.push(`in ${cronPhrase(mon, 'month')}`);
  return parts.join(', ');
}
function cronNext(F, from, n) {
  const [mi, h, dom, mon, dow] = F, hours = [...h.set].sort((a, b) => a - b), mins = [...mi.set].sort((a, b) => a - b), out = [];
  const start = new Date(from); start.setSeconds(0, 0); start.setMinutes(start.getMinutes() + 1);
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 366 * 5 && out.length < n; i++, day.setDate(day.getDate() + 1)) {
    if (!mon.set.has(day.getMonth() + 1)) continue;
    const dayOk = dom.star && dow.star ? true : dom.star ? dow.set.has(day.getDay()) : dow.star ? dom.set.has(day.getDate()) : dom.set.has(day.getDate()) || dow.set.has(day.getDay());
    if (!dayOk) continue;
    for (const hh of hours) for (const mm of mins) { const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm); if (t >= start) { out.push(t); if (out.length === n) return out; } }
  }
  return out;
}
function explainCron(a) {
  let fields = a.payload.trim().split(/\s+/), read = ['explain cron', { v: a.payload.trim() }];
  if (fields.length === 6) {
    const six = a.six || 'seconds';
    read.push({ v: six === 'seconds' ? 'six fields: seconds first' : 'six fields: year last', key: 'six', alts: ['seconds', 'year'], cur: six });
    fields = six === 'seconds' ? fields.slice(1) : fields.slice(0, 5);
  }
  let F; try { F = fields.map((f, i) => cronField(f, CRON_FIELDS[i])); } catch (e) { return { read, body: [{ t: 'note', kind: 'err', text: `${typeof e === 'string' ? e : e.message}. Cron takes minute, hour, day of month, month and day of week.` }], trace: ['cron: field rejected'] }; }
  const sentence = cronSentence(F), next = cronNext(F, clock.now(), 3);
  const rows = F.map((f, i) => [CRON_FIELDS[i][0], f.src, f.star ? 'every ' + CRON_FIELDS[i][0] : cronPhrase(f, CRON_FIELDS[i][0])]);
  const body = [{ t: 'big', v: sentence, unit: '' }, { t: 'table', head: ['Field', 'Value', 'Means'], rows }];
  if (!F[2].star && !F[4].star) body.push({ t: 'note', text: 'Both the day of month and the day of week are restricted. By the classic rule the job runs when either matches, not both.' });
  body.push({ t: 'kv', rows: next.length ? next.map((d, i) => [i ? '' : 'next runs', local(d), { mono: true }]) : [['next runs', 'none in the next five years']] }, { t: 'sub', text: 'Times in this device\'s zone. Names and ?-fields read as in Vixie cron; a six-field form is a slot.' });
  return { read, value: sentence, body, trace: [`cron: ${fields.join(' ')}`, ...F.map((f, i) => `${CRON_FIELDS[i][0]}: {${[...f.set].sort((x, y) => x - y).join(',')}}`), `next: from ${local(clock.now())}`], py: `croniter("${fields.join(' ')}")` };
}

/* ── time: epoch numbers and ISO strings ────────────────────── */
const UNITS = { s: 1e3, ms: 1, us: 1e-3, ns: 1e-6 }, UNIT_BY_DIGITS = { 10: 's', 13: 'ms', 16: 'us', 19: 'ns' }, UNIT_NAME = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' };
const isEpoch = s => /^\d{9,20}$/.test(s.trim());
const isIso = s => /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s.trim()) && !isNaN(new Date(s.trim().replace(' ', 'T')));
function distance(ms) {
  const abs = Math.abs(ms), ago = ms < 0, u = abs < 6e4 ? [abs / 1e3, 'seconds'] : abs < 36e5 ? [abs / 6e4, 'minutes'] : abs < 864e5 ? [abs / 36e5, 'hours'] : abs < 365.25 * 864e5 ? [abs / 864e5, 'days'] : [abs / (365.25 * 864e5), 'years'];
  return `${fmt(u[0], 3)} ${u[1]} ${ago ? 'ago' : 'from now'}`;
}
function explainTime(a) {
  const p = a.payload.trim(), now = clock.now();
  if (isIso(p)) {
    const d = new Date(p.replace(' ', 'T')), hasZone = /Z|[+-]\d{2}:?\d{2}$/.test(p) || !/[T ]/.test(p);
    return { read: ['epoch of', { v: p }], value: Math.floor(d.getTime() / 1000), body: [{ t: 'big', v: String(Math.floor(d.getTime() / 1000)), unit: 'seconds since 1970-01-01 UTC' }, { t: 'kv', rows: [['milliseconds', String(d.getTime()), { mono: true }], ['UTC', utc(d), { mono: true }], ['local', local(d), { mono: true }], ['from now', distance(d - now)]] }, { t: 'sub', text: !/[T ]/.test(p) ? 'A date alone is midnight UTC by the ISO rule, which is why the local time may fall on the day before.' : hasZone ? 'The zone in the text was used.' : 'No zone given, so the time was read in this device\'s zone.' }], trace: [`Date.parse("${p}") → ${d.getTime()} ms`], py: `datetime.fromisoformat("${p}").timestamp()` };
  }
  const digits = p.length, unit = a.unit || UNIT_BY_DIGITS[digits] || 's', ambiguous = !UNIT_BY_DIGITS[digits] || a.unit;
  const read = ['time', { v: p }, 'in', ambiguous ? { v: UNIT_NAME[unit], key: 'unit', alts: Object.keys(UNITS), cur: unit } : { v: UNIT_NAME[unit] }];
  const ms = Number(p) * UNITS[unit];
  if (!isFinite(ms) || Math.abs(ms) > 8.64e15) return { read, body: [{ t: 'note', kind: 'err', text: `${p} ${UNIT_NAME[unit]} is beyond the range a date can hold (about ±285,000 years). Try another unit.` }], trace: ['out of range'] };
  const d = new Date(ms);
  return {
    read, value: ms / 1000,
    body: [{ t: 'big', v: utc(d), unit: '' }, { t: 'kv', rows: [['local', local(d), { mono: true }], ['weekday', DOWN[d.getUTCDay()] + ' (UTC)'], ['from now', distance(ms - now)], ['read as', `${UNIT_NAME[unit]} since 1970-01-01 00:00:00 UTC${ambiguous ? '; ' + digits + ' digits fit no single unit, so the unit is a slot' : ' (' + digits + ' digits)'}`]] }],
    trace: [`${p} × ${UNITS[unit]} ms = ${ms} ms`, `Date(${ms}) → ${d.toISOString()}`], py: `datetime.fromtimestamp(${p} / ${1e3 / UNITS[unit]}, tz=timezone.utc)`
  };
}

/* ── chmod ──────────────────────────────────────────────────── */
const isChmod = s => /^[0-7]{3,4}$/.test(s.trim()) || /^[d\-]?([r\-][w\-][xsS\-]){2}[r\-][w\-][xtT\-]$/.test(s.trim());
function explainChmod(a) {
  const p = a.payload.trim(); let octal, sym;
  if (/^[0-7]{3,4}$/.test(p)) {
    octal = p.padStart(4, '0');
    const [sp, u, g, o] = [...octal].map(Number), tri = (n, s, xs, xS) => (n & 4 ? 'r' : '-') + (n & 2 ? 'w' : '-') + (n & 1 ? (s ? xs : 'x') : (s ? xS : '-'));
    sym = tri(u, sp & 4, 's', 'S') + tri(g, sp & 2, 's', 'S') + tri(o, sp & 1, 't', 'T');
  } else {
    sym = p.replace(/^[d-](?=.{9}$)/, '');
    const val = s => (s[0] === 'r' ? 4 : 0) + (s[1] === 'w' ? 2 : 0) + (/[xst]/.test(s[2]) ? 1 : 0), sp = (/[sS]/.test(sym[2]) ? 4 : 0) + (/[sS]/.test(sym[5]) ? 2 : 0) + (/[tT]/.test(sym[8]) ? 1 : 0);
    octal = `${sp}${val(sym.slice(0, 3))}${val(sym.slice(3, 6))}${val(sym.slice(6, 9))}`;
  }
  const [sp, u, g, o] = [...octal].map(Number), can = n => [n & 4 ? 'read' : null, n & 2 ? 'write' : null, n & 1 ? 'execute (or enter, for a directory)' : null].filter(Boolean), who = [['owner', u], ['group', g], ['others', o]];
  const special = [sp & 4 ? 'setuid: runs with the owner\'s identity' : null, sp & 2 ? 'setgid: runs with the group\'s identity; new files in a directory take its group' : null, sp & 1 ? 'sticky: in a directory only the owner of a file may delete it' : null].filter(Boolean);
  return {
    read: ['chmod', { v: p }], value: octal.replace(/^0/, ''),
    body: [{ t: 'big', v: /^[0-7]+$/.test(p) ? sym : octal.replace(/^0/, ''), unit: /^[0-7]+$/.test(p) ? 'symbolic' : 'octal' }, { t: 'table', head: ['Who', 'Octal', 'May'], rows: who.map(([w, n]) => [w, String(n), can(n).length ? can(n).join(', ') : 'nothing']) }, ...(special.length ? [{ t: 'kv', rows: special.map((s, i) => [i ? '' : 'special bits', s]) }] : [])],
    trace: [`${/^[0-7]+$/.test(p) ? 'octal' : 'symbolic'} → ${octal} / ${sym}`, 'r = 4, w = 2, x = 1; the leading digit is setuid 4, setgid 2, sticky 1'], py: `oct(stat.S_IMODE(0o${octal}))`
  };
}

/* ── url ────────────────────────────────────────────────────── */
const isUrl = s => { try { const u = new URL(s.trim()); return /^[a-z][a-z0-9+.-]*:$/i.test(u.protocol) && (u.host !== '' || /^(mailto|tel|data|file):/.test(u.protocol)); } catch (e) { return false; } };
const DEFAULT_PORT = { 'http:': '80', 'https:': '443', 'ftp:': '21', 'ws:': '80', 'wss:': '443' };
function explainUrl(a) {
  const p = a.payload.trim(); let u; try { u = new URL(p); } catch (e) { return { read: ['explain url', { v: p }], body: [{ t: 'note', kind: 'err', text: `That is not a URL the URL parser accepts: ${e.message}. A scheme like https:// has to be there.` }], trace: ['URL(): rejected'] }; }
  const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const rows = [['scheme', u.protocol.slice(0, -1)]];
  if (u.username || u.password) rows.push(['credentials', `${u.username}${u.password ? ':' + u.password.replace(/./g, '•') : ''}`]);
  if (u.hostname) rows.push(['host', u.hostname]);
  if (u.port || DEFAULT_PORT[u.protocol]) rows.push(['port', u.port ? `${u.port} (not the default${DEFAULT_PORT[u.protocol] ? ' ' + DEFAULT_PORT[u.protocol] : ''})` : `${DEFAULT_PORT[u.protocol]} (default for ${u.protocol.slice(0, -1)})`]);
  const segs = u.pathname.split('/').filter(Boolean).map(dec);
  rows.push(['path', segs.length ? segs.map((s, i) => `${i + 1}. ${s}`).join(' · ') : u.pathname || '(none)']);
  const params = [...u.searchParams.entries()];
  params.forEach(([k, v], i) => rows.push([i ? '' : 'query', `${k} = ${v === '' ? '(empty)' : v}`, { mono: true }]));
  if (u.hash) rows.push(['fragment', dec(u.hash.slice(1))]);
  const flags = [];
  if (u.username || u.password) flags.push('credentials in the URL: they travel in clear and end up in logs');
  if (/(^|\.)xn--/.test(u.hostname)) flags.push('punycode host: the displayed name may differ from the ASCII form');
  if (u.port) flags.push('non-default port');
  if (u.protocol === 'http:') flags.push('plain http: not encrypted');
  return { read: ['explain url', { v: u.hostname || u.protocol }], value: u.href, body: [{ t: 'kv', rows }, ...(flags.length ? [{ t: 'note', text: flags.join('. ') + '.' }] : []), { t: 'sub', text: `${segs.length} path segment${segs.length === 1 ? '' : 's'}, ${params.length} query parameter${params.length === 1 ? '' : 's'}${u.href !== p ? '; normalised form: ' + u.href : ''}` }], trace: [`URL("${p}")`, `host ${u.host || '(none)'}, path ${u.pathname}, query ${u.search || '(none)'}`], py: `urllib.parse.urlsplit("${p}")` };
}

/* ── regex: an own parser for the ECMAScript dialect ────────── */
const META = /[\\^$.|?*+()[\]{}]/;
const isRegex = s => { s = s.trim(); if (/^\/.+\/[gimsuyd]*$/.test(s)) return true; if (!META.test(s) || /\s{2}/.test(s)) return false; try { new RegExp(s); return true; } catch (e) { return false; } };
const ESC = { d: 'a digit (0 to 9)', D: 'anything but a digit', w: 'a word character (letter, digit or underscore)', W: 'anything but a word character', s: 'a whitespace character', S: 'anything but whitespace', b: 'a word boundary', B: 'not a word boundary', n: 'a line feed', r: 'a carriage return', t: 'a tab', f: 'a form feed', v: 'a vertical tab', 0: 'the NUL character' };
const ESC_GEN = { d: '0123456789', w: 'abcxyzABC_019', s: ' ', n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', 0: '\0' };
const PCRE = [[/^\(\?P</, 'a named group as (?P<name>…) is Python and PCRE; ECMAScript writes (?<name>…)'], [/^\(\?[a-zA-Z-]+\)/, 'an inline flag group like (?i) is PCRE; ECMAScript takes flags after the closing slash'], [/^\(\?>/, 'an atomic group (?>…) is PCRE'], [/^\(\?#/, 'a comment group (?#…) is PCRE'], [/^\\[AZzQEG]/, 'the \\A, \\Z, \\z, \\Q, \\E and \\G escapes are PCRE'], [/^[*+?}]\+/, 'a possessive quantifier (*+, ++, ?+) is PCRE']];
class RegexParser {
  constructor(src) { this.s = src; this.i = 0; this.groups = 0; this.names = []; }
  peek(n = 0) { return this.s[this.i + n]; }
  eat(c) { if (this.s[this.i] === c) { this.i++; return true; } return false; }
  fail(msg) { throw new Error(`${msg} at position ${this.i + 1}`); }
  parse() { const n = this.alt(); if (this.i < this.s.length) this.fail(`unmatched "${this.s[this.i]}"`); return n; }
  alt() { const alts = [this.seq()]; while (this.eat('|')) alts.push(this.seq()); return alts.length === 1 ? alts[0] : { t: 'alt', alts }; }
  seq() { const items = []; while (this.i < this.s.length && this.peek() !== '|' && this.peek() !== ')') items.push(this.quantified()); return { t: 'seq', items }; }
  quantified() {
    const atom = this.atom(), m = /^(?:[*+?]|\{(\d+)(,(\d*))?\})/.exec(this.s.slice(this.i)); if (!m) return atom;
    const rest = this.s.slice(this.i); for (const [re, why] of PCRE) if (re.test(rest.slice(m[0].length - 1))) this.fail(why);
    this.i += m[0].length; let min, max;
    if (m[0] === '*') { min = 0; max = Infinity; } else if (m[0] === '+') { min = 1; max = Infinity; } else if (m[0] === '?') { min = 0; max = 1; } else { min = +m[1]; max = m[2] ? (m[3] === '' ? Infinity : +m[3]) : min; }
    if (max < min) this.fail('a quantifier with the maximum below the minimum');
    if (atom.t === 'anchor' || atom.t === 'look') this.fail('a quantifier on an assertion');
    const lazy = this.eat('?');
    return { t: 'rep', min, max, lazy, src: m[0] + (lazy ? '?' : ''), child: atom };
  }
  atom() {
    const c = this.peek(), rest = this.s.slice(this.i);
    for (const [re, why] of PCRE) if (re.test(rest)) this.fail(why);
    if (c === '^' || c === '$') { this.i++; return { t: 'anchor', src: c }; }
    if (c === '.') { this.i++; return { t: 'dot', src: c }; }
    if (c === '(') return this.group();
    if (c === '[') return this.cls();
    if (c === '\\') return this.esc();
    if (c === ')') this.fail('an unmatched ")"');
    if ('*+?'.includes(c)) this.fail(`a quantifier "${c}" with nothing before it`);
    if (c === '{' && /^\{\d+(,\d*)?\}/.test(rest)) this.fail('a counted quantifier with nothing before it');
    this.i++; return { t: 'char', ch: c, src: c };
  }
  group() {
    const start = this.i; this.i++; let kind = 'capture', name = null;
    if (this.eat('?')) {
      if (this.eat(':')) kind = 'nc'; else if (this.eat('=')) kind = 'ahead'; else if (this.eat('!')) kind = 'nahead';
      else if (this.eat('<')) { if (this.eat('=')) kind = 'behind'; else if (this.eat('!')) kind = 'nbehind'; else { const m = /^([A-Za-z_$][\w$]*)>/.exec(this.s.slice(this.i)); if (!m) this.fail('a group name that is not an identifier'); name = m[1]; this.i += m[0].length; } }
      else this.fail(`an unknown group kind "(?${this.peek()}"`);
    }
    const index = kind === 'capture' ? ++this.groups : null; if (name) this.names.push(name);
    const child = this.alt(); if (!this.eat(')')) this.fail('a group that never closes');
    const look = ['ahead', 'nahead', 'behind', 'nbehind'].includes(kind);
    return { t: look ? 'look' : 'group', kind, index, name, child, src: this.s.slice(start, this.i) };
  }
  cls() {
    const start = this.i; this.i++; const neg = this.eat('^'), items = [];
    while (this.peek() !== ']') {
      if (this.i >= this.s.length) this.fail('a character class that never closes');
      let a = this.clsAtom();
      if (this.peek() === '-' && this.peek(1) !== ']' && this.peek(1) !== undefined) { this.i++; const b = this.clsAtom(); if (a.esc || b.esc) this.fail('a range with a class escape in it'); if (a.ch > b.ch) this.fail(`a range out of order "${a.ch}-${b.ch}"`); a = { range: [a.ch, b.ch] }; }
      items.push(a);
    }
    this.i++; return { t: 'class', neg, items, src: this.s.slice(start, this.i) };
  }
  clsAtom() { if (this.eat('\\')) { const c = this.s[this.i++]; if (c === undefined) this.fail('a trailing backslash'); return 'dDwWsS'.includes(c) ? { esc: c } : { ch: ESC_GEN[c] !== undefined && 'nrtfv0'.includes(c) ? ESC_GEN[c] : c }; } return { ch: this.s[this.i++] }; }
  esc() {
    const start = this.i; this.i++; const c = this.s[this.i++]; if (c === undefined) this.fail('a trailing backslash');
    if (/\d/.test(c) && c !== '0') { let n = c; while (/\d/.test(this.peek())) n += this.s[this.i++]; return { t: 'backref', n: +n, src: `\\${n}` }; }
    if (c === 'k' && this.eat('<')) { const m = /^([\w$]+)>/.exec(this.s.slice(this.i)); if (!m) this.fail('a \\k without a group name'); this.i += m[0].length; return { t: 'backref', name: m[1], src: this.s.slice(start, this.i) }; }
    if (c === 'u' || c === 'x') { const m = (c === 'u' ? /^(?:\{([0-9a-fA-F]+)\}|([0-9a-fA-F]{4}))/ : /^([0-9a-fA-F]{2})/).exec(this.s.slice(this.i)); if (m) { this.i += m[0].length; const ch = String.fromCodePoint(parseInt(m[1] || m[2], 16)); return { t: 'char', ch, src: this.s.slice(start, this.i), unicode: true }; } }
    if (c === 'c' && /[A-Za-z]/.test(this.peek())) { const l = this.s[this.i++]; return { t: 'char', ch: String.fromCharCode(l.toUpperCase().charCodeAt(0) - 64), src: `\\c${l}`, unicode: true }; }
    if (ESC[c] !== undefined) return 'bB'.includes(c) ? { t: 'anchor', src: `\\${c}` } : { t: 'esc', c, src: `\\${c}` };
    return { t: 'char', ch: c, src: `\\${c}`, escaped: true };
  }
}
const quote = s => `"${s.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')}"`;
const timesOf = r => (r.min === 0 && r.max === Infinity ? '0 or more times' : r.min === 1 && r.max === Infinity ? '1 or more times' : r.min === 0 && r.max === 1 ? 'optional (0 or 1 times)' : r.max === Infinity ? `${r.min} or more times` : r.min === r.max ? `exactly ${r.min} time${r.min === 1 ? '' : 's'}` : `${r.min} to ${r.max} times`) + (r.lazy ? ', as few as possible' : '');
const clsItem = it => it.range ? `${quote(it.range[0])} to ${quote(it.range[1])}` : it.esc ? ESC[it.esc] : quote(it.ch);
const GROUP_WORDS = { capture: 'a capturing group', nc: 'a group (not captured)', ahead: 'followed by (looked at, not consumed)', nahead: 'not followed by', behind: 'preceded by (looked at, not consumed)', nbehind: 'not preceded by' };
// the meaning of one node, in a phrase; charRun joins neighbouring characters into one literal
function meaning(n, flags) {
  switch (n.t) {
    case 'char': return `the character ${quote(n.ch)}` + (n.unicode ? ` (${n.src})` : '');
    case 'lit': return `the text ${quote(n.text)}`;
    case 'dot': return flags.includes('s') ? 'any character' : 'any character except a line break';
    case 'esc': return ESC[n.c];
    case 'anchor': return n.src === '^' ? (flags.includes('m') ? 'the start of a line' : 'the start of the text') : n.src === '$' ? (flags.includes('m') ? 'the end of a line' : 'the end of the text') : ESC[n.src[1]];
    case 'class': return `${n.neg ? 'any character except' : 'one of'} ${n.items.map(clsItem).join(', ')}`;
    case 'backref': return n.name ? `the same text that group "${n.name}" matched` : `the same text that group ${n.n} matched`;
    case 'group': return n.kind === 'capture' ? `group ${n.index}${n.name ? `, named "${n.name}"` : ''}` : GROUP_WORDS.nc;
    case 'look': return GROUP_WORDS[n.kind];
    case 'rep': return `${timesOf(n)}:`;
    case 'alt': return `one of ${n.alts.length} alternatives`;
    default: return '';
  }
}
function fold(items) {   // neighbouring plain characters become one literal
  const out = []; for (const it of items) { const last = out[out.length - 1]; if (it.t === 'char' && !it.unicode && last && last.t === 'lit') { last.text += it.ch; last.src += it.src; } else if (it.t === 'char' && !it.unicode) out.push({ t: 'lit', text: it.ch, src: it.src }); else out.push(it); } return out;
}
function rows(n, flags, depth, out) {
  const ind = '· '.repeat(depth);
  if (n.t === 'seq') { fold(n.items).forEach(it => rows(it, flags, depth, out)); return; }
  if (n.t === 'alt') { out.push([ind + 'a | b', meaning(n, flags)]); n.alts.forEach((a, i) => { out.push([ind + `· alternative ${i + 1}`, '']); rows(a, flags, depth + 2, out); }); return; }
  if (n.t === 'rep') { out.push([ind + n.src, meaning(n, flags)]); rows(n.child, flags, depth + 1, out); return; }
  if (n.t === 'group' || n.t === 'look') { const open = n.kind === 'capture' ? (n.name ? `(?<${n.name}>` : '(') : n.src.slice(0, n.kind === 'nc' || n.kind === 'ahead' || n.kind === 'nahead' ? 3 : 4); out.push([ind + open + '…)', meaning(n, flags)]); rows(n.child, flags, depth + 1, out); return; }
  out.push([ind + n.src, meaning(n, flags)]);
}
function phrase(n, flags) {
  switch (n.t) {
    case 'seq': { const ps = fold(n.items).map(x => phrase(x, flags)).filter(Boolean); return ps.length ? ps.join(', then ') : 'nothing'; }
    case 'alt': return n.alts.map(a => `(${phrase(a, flags)})`).join(' or ');
    case 'rep': { const c = n.child; const inner = c.t === 'seq' || c.t === 'alt' ? `(${phrase(c, flags)})` : phrase(c, flags); return `${inner} ${n.min === 0 && n.max === 1 ? 'optionally' : n.min === n.max ? (n.min === 1 ? 'once' : `${n.min} times`) : n.max === Infinity ? `${n.min} or more times` : `${n.min} to ${n.max} times`}`; }
    case 'group': return (n.kind === 'capture' ? `(group ${n.index}: ` : '(') + phrase(n.child, flags) + ')';
    case 'look': return `${GROUP_WORDS[n.kind].split(' (')[0]} ${phrase(n.child, flags)}`;
    default: return meaning(n, flags);
  }
}
// strings built from the tree; each is checked against the real RegExp before it is shown
const PRINT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.,:;!@#%&=/';
function gen(n, r, caps, flags) {
  const pick = s => s[Math.floor(r() * s.length)];
  switch (n.t) {
    case 'seq': return n.items.map(x => gen(x, r, caps, flags)).join('');
    case 'alt': return gen(n.alts[Math.floor(r() * n.alts.length)], r, caps, flags);
    case 'rep': { const k = n.min + Math.min(Math.floor(r() * 3), n.max - n.min); let s = ''; for (let i = 0; i < k; i++) s += gen(n.child, r, caps, flags); return s; }
    case 'group': { const s = gen(n.child, r, caps, flags); if (n.index) caps[n.index] = s; if (n.name) caps[n.name] = s; return s; }
    case 'look': return '';
    case 'backref': return caps[n.name || n.n] || '';
    case 'char': return n.ch;
    case 'dot': return pick(PRINT.replace(' ', ''));
    case 'esc': return pick(ESC_GEN[n.c] || 'xyz');
    case 'anchor': return '';
    case 'class': {
      if (!n.neg) { const it = n.items[Math.floor(r() * n.items.length)]; if (!it) return ''; if (it.range) { const a = it.range[0].codePointAt(0), b = it.range[1].codePointAt(0); return String.fromCodePoint(a + Math.floor(r() * (b - a + 1))); } if (it.esc) return pick(ESC_GEN[it.esc.toLowerCase()] || 'xyz'); return it.ch; }
      for (let i = 0; i < 30; i++) { const c = pick(PRINT); if (!new RegExp(n.src, flags.replace(/[gy]/g, '')).test(c)) return c; } return '';
    }
    default: return '';
  }
}
function examplesOf(tree, re, seed, flags) {
  const r = rng(seed), yes = [], no = [], fits = s => { re.lastIndex = 0; return re.test(s); };
  for (let i = 0; i < 40 && yes.length < 3; i++) { const s = gen(tree, r, {}, flags); if (fits(s) && !yes.includes(s)) yes.push(s); }
  const pick = s => s[Math.floor(r() * s.length)];
  for (let i = 0; i < 60 && no.length < 3 && yes.length; i++) {
    const base = yes[Math.floor(r() * yes.length)], k = Math.floor(r() * (base.length + 1)), op = Math.floor(r() * 3);
    const s = op === 0 && base.length ? base.slice(0, k) + pick(PRINT) + base.slice(k + 1) : op === 1 && base.length ? base.slice(0, k) + base.slice(k + 1) : base.slice(0, k) + pick(PRINT) + base.slice(k);
    if (!fits(s) && !no.includes(s)) no.push(s);
  }
  if (!no.length) for (const s of ['', ' ', 'x', '123', 'abc', '-']) if (!fits(s) && no.length < 3) no.push(s);
  return { yes, no };
}
function explainRegex(a) {
  let src = a.payload.trim(), flags = '';
  const m = /^\/(.+)\/([gimsuyd]*)$/.exec(src); if (m) { src = m[1]; flags = m[2]; }
  const read = ['explain regex', { v: m ? a.payload.trim() : src }, { v: 'ECMAScript' }];
  let re, reErr = null; try { re = new RegExp(src, flags); } catch (e) { reErr = e.message.replace(/^Invalid regular expression: /, ''); }
  let tree, P; try { P = new RegexParser(src); tree = P.parse(); } catch (e) {
    const pcre = PCRE.some(([, why]) => e.message.startsWith(why));
    const text = pcre ? `Not ECMAScript: ${e.message}. I read the ECMAScript dialect only.` : reErr ? `The RegExp constructor rejects it: ${reErr}. My own parser stops at ${e.message}.` : `I cannot read ${e.message}. The RegExp constructor accepts the pattern, so this is a gap in my parser, not in your pattern.`;
    return { read, body: [{ t: 'note', kind: 'err', text }], trace: ['own parser: ' + e.message, reErr ? 'RegExp(): ' + reErr : 'RegExp(): accepts it'] };
  }
  if (reErr) return { read, body: [{ t: 'note', kind: 'err', text: `The RegExp constructor rejects it: ${reErr}.` }], trace: ['RegExp(): rejected'] };
  const table = []; rows(tree, flags, 0, table);
  const summary = `Matches ${phrase(tree, flags)}.`;
  const ex = examplesOf(tree, re, a.seed, flags), hasLook = /\(\?<?[=!]/.test(src);
  const body = [{ t: 'table', head: ['Piece', 'Means'], rows: table }, { t: 'sub', text: summary }];
  if (flags) body.push({ t: 'kv', rows: [['flags', [...flags].map(f => ({ g: 'g: all matches', i: 'i: ignore case', m: 'm: ^ and $ at line ends', s: 's: dot matches line breaks', u: 'u: unicode', y: 'y: sticky', d: 'd: match indices' })[f]).join('; ')]] });
  body.push({ t: 'kv', rows: [['matches', ex.yes.length ? ex.yes.map(quote).join('  ') : hasLook ? 'not generated: the pattern has a lookaround' : 'none found by generation', { mono: true }], ['does not match', ex.no.length ? ex.no.map(quote).join('  ') : 'none found: the pattern may match everything', { mono: true }]] });
  body.push({ t: 'src', text: `own parser, ECMAScript dialect · checked against RegExp() · ${P.groups} capturing group${P.groups === 1 ? '' : 's'} · examples from seed ${a.seed}` });
  return { read, value: src, body, trace: [`parse: ${table.length} nodes, ${P.groups} groups${P.names.length ? ' (' + P.names.join(', ') + ')' : ''}`, `RegExp("${src}", "${flags}") accepts it`, `examples: seed ${a.seed}, ${ex.yes.length} matching, ${ex.no.length} not`], py: `re.compile(r"${src}")` };
}

/* ── the declaration ────────────────────────────────────────── */
const RECOG = { cron: isCron, time: s => isEpoch(s) || isIso(s), chmod: isChmod, url: isUrl, regex: isRegex };
const RUN = { cron: explainCron, time: explainTime, chmod: explainChmod, url: explainUrl, regex: explainRegex };
const seedOf = () => Math.floor(Math.random() * 2 ** 31);
tool({
  name: 'explain', rank: 45,
  skill: { group: 'Compute', title: 'Explainers', on: 'own parsers', about: 'Cron schedules, epoch times, chmod modes, URLs and regular expressions, parsed and described piece by piece. A bare payload finds its own kind.', examples: ['explain cron: 0 9 * * 1-5', 'what is 1700000000', 'chmod 754', 'explain regex: ^\\d{3}-\\d{2}$', 'explain url: https://example.org:8443/a/b?q=1#top'] },
  read: text => {
    let m = /^(?:explain|decode|describe)\s+(?:this\s+|the\s+|a\s+)?(regex|regexp|regular expression|cron|crontab|schedule|time|epoch|timestamp|url|link|chmod|mode|permissions?)\s*[:,]?\s*(.+)$/i.exec(text);
    if (m) { const k = { regexp: 'regex', 'regular expression': 'regex', crontab: 'cron', schedule: 'cron', epoch: 'time', timestamp: 'time', link: 'url', mode: 'chmod', permission: 'chmod', permissions: 'chmod' }[m[1].toLowerCase()] || m[1].toLowerCase(); return { kind: k, payload: m[2], ...(k === 'regex' ? { seed: seedOf() } : {}) }; }
    m = /^(?:chmod|mode)\s+(.+)$/i.exec(text); if (m && isChmod(m[1])) return { kind: 'chmod', payload: m[1] };
    m = /^(?:cron|crontab)\s*[:]?\s+(.+)$/i.exec(text); if (m && isCron(m[1])) return { kind: 'cron', payload: m[1] };
    m = /^(?:explain|decode|describe|what is|what's|whats|parse)(?:\s+this)?\s*[:]?\s+(.+)$/i.exec(text); const p = m ? m[1] : text;
    const slashed = /^\/.+\/[gimsuyd]*$/.test(p.trim()), kinds = MEMBERS.filter(k => RECOG[k](p) && (k !== 'regex' || m || slashed)); if (!kinds.length) return null;
    return { kind: kinds[0], payload: p, ...(kinds.length > 1 ? { kinds } : {}), ...(kinds.includes('regex') ? { seed: seedOf() } : {}) };
  },
  amend: [{ arg: 'kind', match: /^as (?:a |an )?(regex|cron|time|epoch|url|chmod)$/, value: m => m[1] === 'epoch' ? 'time' : m[1] }, { arg: 'unit', match: /^(?:in |as )?(seconds|milliseconds|microseconds|nanoseconds|s|ms|us|ns)$/, value: m => ({ seconds: 's', milliseconds: 'ms', microseconds: 'us', nanoseconds: 'ns' })[m[1]] || m[1], when: a => a.kind === 'time' }],
  topic: a => [`Explain ${a.kind}`, 1],
  run: a => {
    if (!RUN[a.kind]) return null;
    const res = RUN[a.kind](a); if (!res) return null;
    if (a.kinds && a.kinds.length > 1) res.read.push({ v: `as ${a.kind}`, key: 'kind', alts: a.kinds, cur: a.kind });
    return res;
  }
});

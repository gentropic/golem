// Learning from the person, on the device (SPEC 13: the language that grows). Nothing is learned silently, and nothing
// is sent: what did not read is kept in a list the person can see and teach from ("what couldn't you read"); a request
// that did not read, followed by one that did and differs in a short stretch, offers to remember that stretch as a word
// ("dens means density"); a guess picked offers the same for the words its repair changed; and the guesses a person picks
// rank first among the next ones (a count per tool, nothing more). Teaching is the taught rung's alias: "convrt" then
// reads as "convert". A whole request can be taught too, but only to something that reads.
import { S, tool, frame, noun } from './core.js';
import { vocab } from './skills.js';

const MAX = 200;
const words = s => String(s).toLowerCase().trim().split(/\s+/).filter(Boolean);
const key = s => words(s).join(' ');
const NUM = /^[\d.,/:+-]+$/;

/* ── what did not read ──────────────────────────────────────── */
export function noteMiss(raw, day) {
  const k = key(raw); if (!k || k.length > 200) return;
  const m = S.misses.find(x => x.q === k);
  if (m) { m.n++; m.last = day; } else S.misses.push({ q: k, n: 1, first: day, last: day });
  if (S.misses.length > MAX) S.misses.splice(0, S.misses.length - MAX);
}
// it reads now (taught, or golem grew): off the list
export function clearMiss(raw) { const k = key(raw), i = S.misses.findIndex(x => x.q === k); if (i >= 0) S.misses.splice(i, 1); }

/* ── a correction: what failed, then what read ──────────────── */
// the stretch that differs between the two, when the rest is the same and the old stretch has a word golem does not
// know: "dens of granite" then "density of granite" → { word: 'dens', means: 'density' }. A different number is a
// different question, not a new word; two requests with nothing in common are a rephrasing, not a correction.
export function correctionOf(prev, raw) {
  if (!prev || !['none', 'guess'].includes(prev.rung) || !prev.raw) return null;
  const a = words(prev.raw), b = words(raw);
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const from = a.slice(i, a.length - j), to = b.slice(i, b.length - j);
  if (!from.length || !to.length || from.length > 3 || to.length > 4 || i + j < 1) return null;
  if (from.every(w => vocab().has(w) || NUM.test(w))) return null;
  const word = from.join(' '); if (S.aliases[word]) return null;
  return { word, means: to.join(' ') };
}
// a guess picked: the words its repair changed ('"convrt" read as "convert"')
export function teachOfPick(cand) {
  for (const c of cand.changes || []) {
    const m = /^"([^"]+)" read as "([^"]+)"$/.exec(c) || /^read "([^"]+)" as "([^"]+)"$/.exec(c);
    if (m && m[1] !== m[2] && !vocab().has(m[1]) && !S.aliases[m[1]]) return { word: m[1], means: m[2] };
  }
  return null;
}
// the person's picks, counted by tool: the next guesses put the most picked first (ties keep the grammar's order)
export function notePick(toolName) { S.picks[toolName] = (S.picks[toolName] || 0) + 1; }
export const rankByPicks = cands => cands.map((c, i) => [c, i]).sort((x, y) => (S.picks[y[0].tool] || 0) - (S.picks[x[0].tool] || 0) || x[1] - y[1]).map(x => x[0]);

/* ── the list, and teaching from it ─────────────────────────── */
// a request taught as a whole reads as what it was taught only if that reads: checked by the caller's reader
let readsAs = () => null;
export function setReader(f) { readsAs = f; }
tool({
  name: 'misses', effects: ['device'],
  skill: { group: 'Session', title: 'What did not read', on: 'device', about: 'The requests golem could not read, kept on this device with how often and when; teach one what it means, and it reads from then on. Picks among guesses and corrections offer the same.', examples: ['what couldn\'t you read', 'forget what you could not read'] },
  topic: () => ['What did not read', .5],
  run: a => {
    const read = ['what did not read'];
    if (a.clear) {
      if (!a.done) { a.cleared = S.misses.length; S.misses.length = 0; a.done = true; }
      return { read: ['forget what did not read'], body: [{ t: 'note', kind: 'ok', text: `Forgotten: ${a.cleared} request${a.cleared === 1 ? '' : 's'}. The list starts again.` }], trace: ['misses cleared'] };
    }
    if (a.pick && a.means) {
      const r = readsAs(a.means);
      if (!r) return { read: ['teach', { v: a.pick }], body: [{ t: 'note', kind: 'err', text: `"${a.means}" does not read either, so I cannot teach it as what "${a.pick}" means. Type it the way golem reads it, as in a starter.` }],
        ask: { prompt: `What should "${a.pick}" read as?`, options: [], parse: s => s.trim() || null, set: (x, v) => { x.means = v; } }, trace: [`"${a.means}": no reading`] };
      if (!a.done) { S.aliases[a.pick] = a.means; clearMiss(a.pick); a.done = true; }
      return { read: ['teach that', { v: a.pick }, 'means', { v: a.means }], body: [{ t: 'note', kind: 'ok', text: `Learned. "${a.pick}" now reads as "${a.means}" (${r}) on this device.` }], trace: [`lexicon.add(${JSON.stringify(a.pick)} → ${JSON.stringify(a.means)})`, `checked: "${a.means}" reads as ${r}`] };
    }
    if (a.pick) return { read: ['teach', { v: a.pick }], body: [{ t: 'sub', text: `Type what "${a.pick}" should read as, the way golem reads it (for example "${'density of granite'}"). I check that it reads before I keep it.` }],
      ask: { prompt: `What should "${a.pick}" read as?`, options: [], parse: s => s.trim() || null, set: (x, v) => { x.means = v; } }, trace: [`teach "${a.pick}": waiting for what it means`] };
    const ms = S.misses.map((m, i) => [m, i]).sort((x, y) => y[0].n - x[0].n || y[1] - x[1]).map(x => x[0]);   // most often, then most recent
    if (!ms.length) return { read, body: [{ t: 'note', kind: 'ok', text: 'Nothing on the list: everything asked on this device has read, or the list was cleared.' }], trace: ['misses: none'] };
    return {
      read, value: ms.length,
      body: [{ t: 'sub', text: `${ms.length} request${ms.length === 1 ? '' : 's'} did not read. They stay on this device. Pick one to teach me what it means; a word I should know is better taught on its own ("pop means population").` },
        { t: 'table', head: ['request', 'times', 'last'], rows: ms.slice(0, 30).map(m => [m.q, String(m.n), m.last]) }, { t: 'chips', items: ['forget what you could not read'] }],
      ask: { prompt: 'Teach one of these?', options: ms.slice(0, 12).map(m => ({ label: m.q, value: m.q })), set: (x, v) => { x.pick = v; } },
      trace: [`misses: ${ms.length} on this device`]
    };
  }
});
noun({ type: 'missnoun', words: { misses: ["what couldn't you read", 'what could you not read', 'what you could not read', "what you couldn't read", "what didn't you understand", 'what did not read', 'what you did not understand'] },
  words_pt: { misses: ['o que você não entendeu', 'o que você não leu', 'o que não leu'] } });
frame({
  name: 'misses', label: 'What did not read', words: ['show', 'list'], elidable: true, theme: ['missnoun'], required: ['theme'], roles: {},
  words_pt: ['mostra', 'lista'], label_pt: 'O que não leu',
  bind: () => ({ tool: 'misses', args: {} })
});
frame({
  name: 'missesClear', label: 'Forget what did not read', words: ['forget', 'clear'], theme: ['missnoun'], required: ['theme'], roles: {},
  words_pt: ['esquece', 'limpa'], label_pt: 'Esquecer o que não leu',
  bind: () => ({ tool: 'misses', args: { clear: true } })
});

// Truth maintenance (SPEC 13: what depends on what). A card that read through device state — a taught word's meaning
// ("granite" read as 2.7 t/m3), a taught formula — keeps what it used (card.uses, saved with the card). When that state
// changes, the card's answer is still true of what it was given, so it is not rewritten; it is marked: "read with
// granite = 2.7 t/m3; it is now 2.65 t/m3", with its question to run again. "which cards are out of date" lists them in
// every session; teaching a new value lists the cards it leaves behind.
import { S, tool, frame } from './core.js';
import { sessions } from './sessions.js';

// what a key means now: a taught word's meaning, a taught formula's expression, or nothing (forgotten)
const nowOf = k => k.startsWith('formula ') ? (S.formulas && S.formulas[k.slice(8)] ? S.formulas[k.slice(8)].expr : null) : (S.aliases[k] ?? null);
export function staleOf(card) {
  if (!card || !card.uses) return [];
  return Object.entries(card.uses).filter(([k, was]) => nowOf(k) !== was).map(([k, was]) => ({ key: k, was, now: nowOf(k) }));
}
// every card, in every session, read with something that has since changed
export function staleCards(key) {
  const out = [];
  for (const s of sessions()) for (const c of s.cards || []) { const st = staleOf(c).filter(x => !key || x.key === key); if (st.length) out.push({ session: s.name || 'untitled', current: s.cards === S.cards, id: c.id, raw: c.raw, stale: st }); }
  return out;
}
export const staleText = x => x.now == null ? `${x.key} = ${x.was}, since forgotten` : `${x.key} = ${x.was}; it is now ${x.now}`;
// the blocks a card that changed something adds: the earlier cards it leaves out of date, each to run again
export function staleBlocks(key) {
  const st = staleCards(key); if (!st.length) return [];
  return [{ t: 'note', kind: 'warn', text: `${st.length} earlier card${st.length === 1 ? '' : 's'} read with the old ${key.startsWith('formula ') ? 'formula' : 'value'}: their answers stay as they were, true of what they were given.` },
    { t: 'list', items: st.slice(0, 8).map(x => `#${String(x.id).padStart(2, '0')} ${x.raw}${x.current ? '' : ` (in “${x.session}”)`}`) }, { t: 'chips', items: [...new Set(st.slice(0, 4).map(x => x.raw))] }];
}
tool({
  name: 'stale',
  skill: { group: 'Session', title: 'What is out of date', on: 'the cards\' own record of what they used', about: 'Cards remember the taught values and formulas they read with; when one changes, they are marked, never silently rewritten, and listed here to run again.', examples: ['which cards are out of date'] },
  topic: () => ['Out of date', .2],
  run: () => {
    const st = staleCards();
    if (!st.length) return { read: ['which cards are out of date'], value: 0, body: [{ t: 'note', kind: 'ok', text: 'None: every card was read with the values and formulas this device holds now.' }], trace: [`${sessions().reduce((n, s) => n + (s.cards || []).length, 0)} cards checked`] };
    return { read: ['which cards are out of date'], value: st.length,
      body: [{ t: 'table', head: ['card', 'session', 'read with'], rows: st.slice(0, 30).map(x => [`#${String(x.id).padStart(2, '0')} ${x.raw}`, x.current ? 'this one' : x.session, x.stale.map(staleText).join('; ')]) }, { t: 'chips', items: [...new Set(st.filter(x => x.current).slice(0, 4).map(x => x.raw))] }],
      trace: [`${st.length} cards read with something that has changed`] };
  }
});
frame({
  name: 'stale', label: 'Out of date', words: ['which cards are out of date', 'what is out of date', 'which cards are stale', 'what is stale', 'out of date cards', 'stale cards'], theme: [], required: [], roles: {},
  words_pt: ['quais cartões estão desatualizados', 'o que está desatualizado'], label_pt: 'Desatualizados',
  bind: () => ({ tool: 'stale', args: {} })
});

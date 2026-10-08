// Notes and taught words. Both belong to the device and are shared by every session.
import { S, tool } from './core.js';

tool({
  name: 'remember', rank: 40,
  skill: { group: 'Session', title: 'Notes', on: 'glass', about: 'Remembers only what you ask it to.', examples: ['remember that hole 12 collar was resurveyed in march', 'what do you know about hole 12'] },
  read: (text, q) => /^remember /.test(q) ? { text: text.replace(/^remember (that )?/i, '') } : null,
  topic: () => ['Notes', 1],
  run: a => {
    if (!a.done) { S.facts.push(a.text); a.done = true; }
    return { read: ['store note', { v: a.text }], body: [{ t: 'note', kind: 'ok', text: `Stored on this device. ${S.facts.length} note${S.facts.length === 1 ? '' : 's'} in memory.` }], trace: ['notes.add(text)', 'index words for recall'], py: `notes.add("${a.text}")` };
  }
});
tool({
  name: 'recall', rank: 41,
  read: (text, q) => { const m = /^what do you (?:know|remember) about (.+)$/.exec(q); return m ? { about: m[1] } : null; },
  topic: () => ['Notes', 1],
  run: a => {
    const w = a.about.split(/\s+/).filter(Boolean), hit = S.facts.filter(f => w.every(x => f.toLowerCase().includes(x)));
    return { read: ['recall notes about', { v: a.about }], body: [hit.length ? { t: 'list', items: hit } : { t: 'note', text: `No stored note mentions “${a.about}”. I only know what you asked me to remember.` }], trace: [`notes.search("${a.about}") → ${hit.length}`], py: `notes.search("${a.about}")` };
  }
});
tool({
  name: 'teach', rank: 10,
  skill: { group: 'Session', title: 'Teach a word', on: 'lexicon', about: 'Stays on the device.', examples: ['dens means density'] },
  read: (text, q) => { const m = /^(.+?) means (.+)$/.exec(q); return m ? { word: m[1], means: m[2] } : null; },
  run: a => {
    S.aliases[a.word] = a.means;
    return { read: ['learn that', { v: a.word }, 'means', { v: a.means }], body: [{ t: 'note', kind: 'ok', text: `Learned. From now on “${a.word}” reads as “${a.means}” on this device.` }], trace: ['lexicon.add(word → meaning)', 'retrain: instant, the lexicon is a table'] };
  }
});

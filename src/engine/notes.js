// Notes and taught words. Both belong to the device and are shared by every session.
import { S, tool, frame } from './core.js';
const textOf = c => c.theme[0] && c.theme[0].type === 'text' ? c.theme[0].value : null;

tool({
  name: 'remember', effects: ['device'],
  skill: { group: 'Session', title: 'Notes', on: 'glass', about: 'Remembers only what you ask it to.', examples: ['remember that hole 12 collar was resurveyed in march', 'what do you know about hole 12'] },
  topic: () => ['Notes', 1],
  run: a => {
    if (!a.done) { S.facts.push(a.text); a.done = true; }
    return { read: ['store note', { v: a.text }], body: [{ t: 'note', kind: 'ok', text: `Stored on this device. ${S.facts.length} note${S.facts.length === 1 ? '' : 's'} in memory.` }], trace: ['notes.add(text)', 'index words for recall'], py: `notes.add("${a.text}")` };
  }
});
tool({
  name: 'recall',
  topic: () => ['Notes', 1],
  run: a => {
    const w = a.about.split(/\s+/).filter(Boolean), hit = S.facts.filter(f => w.every(x => f.toLowerCase().includes(x)));
    return { read: ['recall notes about', { v: a.about }], body: [hit.length ? { t: 'list', items: hit } : { t: 'note', text: `No stored note mentions “${a.about}”. I only know what you asked me to remember.` }], trace: [`notes.search("${a.about}") → ${hit.length}`], py: `notes.search("${a.about}")` };
  }
});
tool({
  name: 'teach', effects: ['device'],
  skill: { group: 'Session', title: 'Teach a word', on: 'lexicon', about: 'Stays on the device.', examples: ['pop means population'] },
  run: a => {
    S.aliases[a.word] = a.means;
    return { read: ['learn that', { v: a.word }, 'means', { v: a.means }], body: [{ t: 'note', kind: 'ok', text: `Learned. From now on “${a.word}” reads as “${a.means}” on this device.` }], trace: ['lexicon.add(word → meaning)', 'retrain: instant, the lexicon is a table'] };
  }
});

// "remember (that) …", "what do you know about …", "pop means population": the words are free text
frame({
  name: 'remember', label: 'Remember', words: ['remember', 'note', 'note down', 'make a note', 'keep in mind'], lead: ['that'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['lembra', 'lembre', 'anota', 'anote', 'guarda', 'guarde'], lead_pt: ['que'], label_pt: 'Lembrar',
  bind: c => textOf(c) ? { tool: 'remember', args: { text: textOf(c) } } : null
});
frame({
  name: 'recall', label: 'Recall', words: ['what do you know about', 'what do you remember about', 'what did i note about', 'recall', 'notes about'], theme: ['text'], required: ['theme'], roles: {},
  words_pt: ['o que você sabe sobre', 'o que voce sabe sobre', 'o que eu anotei sobre'], label_pt: 'Recordar',
  bind: c => textOf(c) ? { tool: 'recall', args: { about: textOf(c).toLowerCase() } } : null
});
frame({
  name: 'teach', label: 'Teach', words: ['means', 'stands for', 'is short for', 'is another word for'], subject: ['text'], theme: ['text'], required: ['theme', 'subject'], roles: {},
  words_pt: ['significa', 'quer dizer', 'é abreviação de'], label_pt: 'Ensinar',
  bind: c => { const w = c.roles.subject && c.roles.subject[0]; return w && textOf(c) ? { tool: 'teach', args: { word: w.value.toLowerCase(), means: textOf(c).toLowerCase() } } : null; }
});

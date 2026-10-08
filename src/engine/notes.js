// Notes and taught words. Both belong to the device and are shared by every session.
import { S, T } from './core.js';

T.remember = a => {
  if (!a.done) { S.facts.push(a.text); a.done = true; }
  return { read: ['store note', { v: a.text }], body: [{ t: 'note', kind: 'ok', text: `Stored on this device. ${S.facts.length} note${S.facts.length === 1 ? '' : 's'} in memory.` }], trace: ['notes.add(text)', 'index words for recall'], py: `notes.add("${a.text}")` };
};
T.recall = a => {
  const w = a.about.split(/\s+/).filter(Boolean), hit = S.facts.filter(f => w.every(x => f.toLowerCase().includes(x)));
  return { read: ['recall notes about', { v: a.about }], body: [hit.length ? { t: 'list', items: hit } : { t: 'note', text: `No stored note mentions “${a.about}”. I only know what you asked me to remember.` }], trace: [`notes.search("${a.about}") → ${hit.length}`], py: `notes.search("${a.about}")` };
};
T.teach = a => {
  S.aliases[a.word] = a.means;
  return { read: ['learn that', { v: a.word }, 'means', { v: a.means }], body: [{ t: 'note', kind: 'ok', text: `Learned. From now on “${a.word}” reads as “${a.means}” on this device.` }], trace: ['lexicon.add(word → meaning)', 'retrain: instant, the lexicon is a table'] };
};

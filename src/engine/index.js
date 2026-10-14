// The engine's surface, for Node tests and anything else that wants golem without a shell.
export { S, T, TOOLS, FRAMES, CONDITIONS, clock, fmt, toolByName, runTool, setRunner, onJobDone, settle, result } from './core.js';
export { rewriteForGcu } from './python.js';
export { submit, rerun, flipSlot, answer, undo, addCard, seedExamples, openFile, openBinary, openStreamed, hashOf, preview } from './engine.js';
export { scanTable, STREAM_OVER } from './stream.js';
export { convertBinary, gridText, BINARY } from './formats.js';
export { sessions, current, newSession, openSession, renameSession, deleteSession, searchHistory, autoName, tagOf, serialize, parts, hydrate, exportSession, importSession, reset, onChange, spec, load } from './sessions.js';
export { skills, examples, vocab, PACKS, SUGGESTIONS } from './skills.js';
export { norm, grammar, context, taught, clauseRead, clauseEngine, readingOf, completions } from './reading.js';
export { ontology } from './ontology.js';
export { useFactbook, factbookInfo, profilesOf, fbFind } from './factbook.js';
export { useBook, bookInfo } from './books.js';
export { tableFromText, colOf, condToSift, whereSrc, stats } from './table.js';
export { sha256, tableText } from './convert.js';
export { zonesOf, offsetOf, instantOf } from './calendar.js';
export { unitWord } from './estimate.js';
export { parseFormula, molarMass } from './chem.js';
export { payloadOf, sentences, syllables, textrank, myers } from './text.js';
export { numberAsk, listAsk, listOf, firstNeed } from './forms.js';
export { readLog, logTable } from './log.js';
export { placeOf, vincenty, toUTM, fromUTM, utmZone } from './places.js';
export { solar } from './sky.js';

// the words of a result, in reading order: what a person would see on the card
export function textOf(c) {
  const r = c.res, out = [];
  out.push(...r.read.map(x => typeof x === 'string' ? x : x.v));
  for (const b of r.body) {
    if (b.t === 'big') out.push(b.v, b.unit || '');
    else if (b.t === 'kv') b.rows.forEach(([k, v]) => out.push(k, v));
    else if (b.t === 'table') out.push(...b.head, ...b.rows.flat());
    else if (b.t === 'list' || b.t === 'steps' || b.t === 'chips') out.push(...b.items);
    else if (b.t === 'hbars') b.rows.forEach(([k, , t]) => out.push(k, t));
    else if (b.t === 'actions') out.push(...b.items.map(i => i.label));
    else if (b.t === 'net' || b.t === 'bars' || b.t === 'curve' || b.t === 'figure') out.push(b.label || '');
    else out.push(b.text || '');
  }
  if (r.ask) out.push(r.ask.prompt, ...r.ask.options.map(o => o.label));
  out.push(...r.trace);
  return out.join(' ');
}

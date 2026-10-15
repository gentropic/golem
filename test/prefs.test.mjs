// Settings (prefs.js) and what golem keeps (keep.js): a convention is copied into the args of a card read after it is
// set, so the card says which it used and replays the same once the setting changes; behaviour settings change no
// answer; settings are said in English or Portuguese and undone like any card; what is kept on the device is listed,
// and forgetting from it stays forgotten when the sessions are replayed; a copy of everything restores it all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/engine/index.js';

const fresh = () => { g.reset(); g.newSession(); };
const say = q => { const o = g.submit(q); return o.card || g.S.cards[g.S.cards.length - 1]; };
const text = c => g.textOf(c).replace(/\s+/g, ' ');

test('a convention is copied into the cards read after it, and only those', () => {
  fresh();
  const before = say('plot plane 120/55');
  assert.equal(before.args.conv, 'dd'); assert.equal(before.args.style, undefined);
  const set = say('use strike and dip');
  assert.equal(set.tool, 'pref'); assert.deepEqual([set.args.key, set.args.value], ['plane', 'sd']);
  const after = say('plot plane 120/55');
  assert.equal(after.args.conv, 'sd');
  assert.match(text(after), /strike\/dip \(right-hand\)/); assert.match(text(after), /toward 210/);
  assert.ok(after.res.trace.some(l => /^settings: plane notation: strike\/dip/.test(l)), 'the card says it was read with a setting');
  // the setting changes back: the card keeps what it was read with, on a rerun and on a replay
  say('use dip direction');
  g.rerun(after); assert.match(text(after), /toward 210/);
  const specs = g.current().cards.map(g.spec); g.load({ ...g.current(), cards: specs });
  assert.match(text(g.S.cards.find(c => c.id === after.id)), /toward 210/);
  assert.match(text(g.S.cards.find(c => c.id === before.id)), /toward 120/);
});

test('a card read with golem\'s defaults has nothing added', () => {
  fresh();
  for (const q of ['plot plane 120/55', '5 km in miles', '-19.92, -43.94 in utm']) {
    const c = say(q); assert.equal(c.args.style, undefined, q); assert.ok(!c.res.trace.some(l => l.startsWith('settings:')), q);
  }
});

test('the written conventions: significant figures, quadrant bearings, degrees minutes and seconds, imperial', () => {
  fresh();
  say('home is -19.92, -43.94');
  say('set significant figures to 3'); say('use quadrant bearings'); say('use dms'); say('use imperial units');
  const d = say('distance from home to -20.1, -44.2');
  assert.deepEqual(d.args.style, { sig: 3, bearing: 'quadrant', coords: 'dms' }); assert.equal(d.args.units, 'imperial');
  assert.match(text(d), /21 miles over the ellipsoid/); assert.match(text(d), /kilometres 33\.7/);
  assert.match(text(d), /S54°W true/);
  assert.match(text(d), /19°55′12\.0″ S, 43°56′24\.0″ W/);
  const tt = say('true thickness of a 14 m intercept, hole 270/60, bedding 045/30');
  assert.match(text(tt), /42\.6 ft true thickness/); assert.match(text(tt), /13 m/);
  const p = say('plot plane 045/30');
  assert.match(text(p), /strike N45°W dip 30° toward N45°E/);
});

test('the declination of the settings: none, or a fixed value, frozen when the reading is taken', () => {
  fresh();
  say('home is -19.92, -43.94');
  say('set declination to -22');
  const m = say('measure bedding');
  assert.equal(m.args.decl, -22);
  g.capture(m, { alpha: 0, beta: 30, gamma: 0, acc: 3 });
  assert.equal(m.args.north.decl, -22); assert.equal(m.args.north.fixed, true);
  assert.match(text(m), /a fixed declination, from the settings/);
  say('use magnetic north');
  const m2 = say('measure bedding'); g.capture(m2, { alpha: 0, beta: 30, gamma: 0, acc: 3 });
  assert.equal(m2.args.north, undefined); assert.match(text(m2), /the settings say not to correct/);
  // the first reading keeps its fixed declination
  g.rerun(m); assert.equal(m.args.north.decl, -22);
});

test('settings said in Portuguese; a value that is not one is a question, not a guess; undo puts the last one back', () => {
  fresh();
  assert.equal(say('muda a declinação para -21').args.value, -21);
  assert.equal(say('usa graus decimais').args.value, 'dd');
  const bad = say('set planes to banana');
  assert.equal(bad.rung, 'none'); assert.match(text(bad), /Plane notation: "dip direction", "strike\/dip"/);
  say('use decimal commas'); assert.equal(g.prefOf('numbers'), 'comma');
  g.submit('undo'); assert.equal(g.prefOf('numbers'), 'auto');
  assert.match(text(say('mostra as configurações')), /Declination fixed, 21° west set here/);
  say('reset the settings'); assert.deepEqual(g.S.prefs, {});
  g.submit('undo'); assert.equal(g.prefOf('decl'), -21);
});

test('learning off: what does not read is not kept', () => {
  fresh();
  say('blorp zork'); assert.equal(g.S.misses.length, 1);
  say('set learning to off'); say('zork blorp');
  assert.equal(g.S.misses.length, 1);
});

test('what golem keeps: listed, forgotten, and still forgotten when the session replays', () => {
  fresh();
  ['pop means population', 'granite is 2.7 t/m3', 'home is -19.92, -43.94', 'station 14', 'add bedding 045/30', 'remember that hole 12 was resurveyed', 'use strike and dip'].forEach(say);
  const k = Object.fromEntries(g.kept().map(x => [x.kind, x]));
  assert.deepEqual(k.words.items.map(i => i.text), ['pop → population']);
  assert.deepEqual(k.values.items.map(i => i.text), ['granite = 2.7 t/m3']);
  assert.deepEqual(k.places.items.map(i => i.key), ['home']);
  assert.match(k.stations.items[0].text, /^station 14, .*: 1 entry$/);
  assert.match(k.prefs.items[0].text, /Plane notation: strike\/dip/);
  assert.ok(k.words.bytes > 0);
  assert.equal(g.forgetKept('words', 'pop'), 1); assert.equal(g.forgetKept('places'), 1);
  // the cards that taught them are replayed, and write nothing again
  const specs = g.current().cards.map(g.spec); g.load({ ...g.current(), cards: specs });
  assert.equal(g.S.aliases.pop, undefined); assert.equal(g.S.aliases.granite, '2.7 t/m3');
  assert.equal((g.S.tables.places || { rows: [] }).rows.length, 0);
  // a session from another device does write: that device learns it
  const s = g.exportSession(g.current().id); g.reset(); g.importSession(JSON.parse(JSON.stringify(s)));
  assert.equal(g.S.aliases.pop, 'population');
});

test('a copy of everything restores the sessions, the device state and the settings', () => {
  fresh();
  ['granite is 2.7 t/m3', 'use quadrant bearings', 'plot plane 120/55'].forEach(say);
  const d = JSON.parse(JSON.stringify(g.exportDevice()));
  assert.equal(d.golem, 'device'); assert.equal(d.device.prefs.bearing, 'quadrant');
  g.reset(); assert.deepEqual(g.S.prefs, {});
  assert.equal(g.importDevice({ golem: 'device', sessions: [], device: {} }), false, 'a backup with no sessions replaces nothing');
  assert.equal(g.importDevice(d), true);
  assert.equal(g.S.aliases.granite, '2.7 t/m3'); assert.equal(g.prefOf('bearing'), 'quadrant');
  assert.match(text(g.S.cards[g.S.cards.length - 1]), /strike N30°E dip 55° toward S60°E/);
});

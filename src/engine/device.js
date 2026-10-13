// Device hand-offs: calendar event, timer, alarm. Simulated in the mock; on Android they become intents.
import { tool, frame, noun, postmod, fmt, iso } from './core.js';
import { findDate, findTime, today, fmtDate, dateWords } from './dates.js';
import { parseUnit } from './units.js';

// the hand-off description every device card carries: the intent, its permission, and the button
const hand = (label, intent, perm, msg) => [{ t: 'kv', rows: [['hand-off', intent, { mono: true }], ['permission', perm]] }, { act: 'handoff', label, msg, go: true }];
function parseEvent(str) {
  const low = str.toLowerCase(), d = findDate(low), t = findTime(low), du = /\bfor (\d+(?:\.\d+)?) ?(h|hr|hrs|hours?|min|mins|minutes?)\b/.exec(low);
  if (!d && !t) return null;
  let title = str;
  [d && d.m, t && t.m, du].filter(Boolean).sort((a, b) => b.index - a.index).forEach(m => { title = title.slice(0, m.index) + title.slice(m.index + m[0].length); });
  title = title.replace(/\s+/g, ' ').trim().replace(/^to /i, '').replace(/\b(on|at|for)$/i, '').trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : 'Event', date: +(d ? d.d : today()), timed: !!t, h: t ? t.h : 0, mi: t ? t.mi : 0, dur: du ? Math.round(du[1] * (du[2][0] === 'h' ? 60 : 1)) : 60 };
}
tool({
  name: 'event',
  skill: { group: 'Device', title: 'Calendar event', on: 'lead-acid intent', about: 'Fills the event and hands it to your calendar app.', examples: ['remind me to send the samples to the lab on friday at 9', 'schedule core shed visit tomorrow at 14:30 for 2 hours'] },
  topic: a => [a.title, 2],
  run: a => {
    const d = new Date(a.date), s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), a.timed ? a.h : 0, a.timed ? a.mi : 0), e = new Date(+s + a.dur * 6e4);
    const hm = x => String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'), st = x => iso(x).replace(/-/g, '') + (a.timed ? 'T' + hm(x).replace(':', '') + '00' : '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GCU//golem mock//EN', 'BEGIN:VEVENT', `UID:${+s}@golem`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
      a.timed ? `DTSTART:${st(s)}` : `DTSTART;VALUE=DATE:${st(s)}`, ...(a.timed ? [`DTEND:${st(e)}`] : []), `SUMMARY:${a.title}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const read = ['new event', { v: a.title }, 'on', { v: fmtDate(s) }];
    if (a.timed) read.push('at', { v: hm(s) }, 'for', { v: a.dur + ' min', key: 'dur', alts: [30, 60, 120], cur: a.dur }); else read.push({ v: 'all day' });
    const [kv, go] = hand('Add to calendar', 'ACTION_INSERT → CalendarContract.Events', 'none: your calendar app shows the event for you to save', 'On Android this opens your calendar app with these fields filled in. Nothing is sent from the mock.');
    return {
      read, copy: ics,
      body: [{ t: 'big', v: a.title, size: 18 }, { t: 'sub', text: `${fmtDate(s)}${a.timed ? `, ${hm(s)} to ${hm(e)}` : ', all day'}` }, kv, { t: 'actions', items: [go, { act: 'copy', label: 'Copy .ics' }] }],
      trace: [`dates.parse → ${fmtDate(s)}${a.timed ? ' ' + hm(s) : ''}`, 'title = what is left after removing date and time words', 'build intent extras: title, begin, end'], py: `device.calendar.insert(title="${a.title}", begin="${iso(s)}${a.timed ? 'T' + hm(s) : ''}", minutes=${a.dur})`
    };
  }
});
tool({
  name: 'timer',
  skill: { group: 'Device', title: 'Timer and alarm', on: 'lead-acid intent', about: 'Handed to the Clock app.', examples: ['set a timer for 5 min', 'set an alarm for 6:15'] },
  topic: () => ['Timer', 1],
  run: a => {
    if (!a.end) a.end = Date.now() + a.sec * 1000;
    const [kv, go] = hand('Hand to the Clock app', 'AlarmClock.ACTION_SET_TIMER, EXTRA_LENGTH=' + a.sec, 'SET_ALARM, granted at install', 'On Android the Clock app takes over the timer and rings when golem is closed. Here it counts down in the page.');
    return {
      read: ['start a timer for', { v: a.sec >= 60 ? fmt(a.sec / 60) + ' min' : a.sec + ' s' }],
      body: [{ t: 'big', v: '--:--', end: a.end }, kv, { t: 'actions', items: [go] }],
      trace: [`duration → ${a.sec} s`, 'build intent: ACTION_SET_TIMER'], py: `device.timer(${a.sec})`
    };
  }
});
// "set a timer for 5 min", "start a 30 minute timer", "30 minute timer", "remind me in 20 minutes"; a bare "start a timer" asks for how long
frame({
  name: 'timer', label: 'Start', words: ['set', 'start', 'remind me in'], elidable: true,
  theme: ['timer', 'quantity:time'], required: ['theme'], roles: { for: { preps: ['for', 'of', 'in'], types: ['quantity:time'] } },
  words_pt: ['cronômetro', 'cronometro', 'timer', 'temporizador', 'me lembra em', 'me avisa em'], label_pt: 'Iniciar',
  bind: c => {
    const t = c.theme[0], q = (t && t.type === 'quantity') ? t : (t && t.attrs && t.attrs.duration) || (c.roles.for && c.roles.for[0]);
    if (!q || q.unit == null) return { clarify: 'for how long? Say "for 30 minutes"' };
    const u = parseUnit(q.unit);
    return u && u.dim === 't' ? { tool: 'timer', args: { sec: Math.round(q.n * u.f) } } : { clarify: `${q.n} ${q.unit} is not a duration` };
  }
});
tool({
  name: 'alarm',
  topic: () => ['Alarm', 1],
  run: a => {
    const t = String(a.h).padStart(2, '0') + ':' + String(a.mi).padStart(2, '0');
    const [kv, go] = hand('Hand to the Clock app', `AlarmClock.ACTION_SET_ALARM, HOUR=${a.h}, MINUTES=${a.mi}`, 'SET_ALARM, granted at install', 'On Android this creates the alarm in the Clock app. Nothing happens in the mock.');
    return { read: ['set an alarm at', { v: t }], body: [{ t: 'big', v: t }, kv, { t: 'actions', items: [go] }], trace: [`time → ${t}`, 'build intent: ACTION_SET_ALARM'], py: `device.alarm("${t}")` };
  }
});
// "remind me to send the samples to the lab on friday at 9": the title as typed, then a date, a time, a length
frame({
  name: 'event', label: 'Event', words: ['remind me to', 'remind me', 'schedule', 'add an event', 'add event', 'new event', 'create an event', 'put on my calendar', 'book'],
  theme: ['text'], required: [],
  roles: { on: { preps: ['on', 'for'], types: ['date', 'holiday'] }, at: { preps: ['at'], types: ['clock'] }, for: { preps: ['for'], types: ['quantity:time'] }, to: { preps: ['to'], types: ['text'] } },   // to: "remind me on friday at 9 to send the samples"
  words_pt: ['me lembra de', 'me lembre de', 'me lembra', 'agenda', 'agende', 'marca', 'marque', 'novo evento'], label_pt: 'Evento',
  bind: c => {
    const title = (c.theme[0] || (c.roles.to || [])[0] || {}).value, on = c.roles.on && c.roles.on[0], at = c.roles.at && c.roles.at[0], du = c.roles.for && c.roles.for[0];
    if (!title) return null;
    if (!on && !at) return { clarify: 'when? Say "on friday", "tomorrow" or "at 9"' };
    const d = on ? findDate(dateWords(on)) : null; if (on && !d) return null;
    const u = du && du.unit ? parseUnit(du.unit) : null, dur = u && u.dim === 't' ? Math.round(du.n * u.f / 60) : du ? Math.round(du.n) : 60;
    return { tool: 'event', args: { title: title[0].toUpperCase() + title.slice(1), date: +(d ? d.d : today()), timed: !!at, h: at ? at.h : 0, mi: at ? at.mi : 0, dur } };
  }
});
// "set an alarm for 6:15", "wake me up at 6", "alarm at 7am"
noun({ type: 'alarm', words: { alarm: ['alarm', 'wake-up alarm'] }, words_pt: { alarm: ['alarme', 'despertador'] } });
frame({
  name: 'alarm', label: 'Alarm', words: ['set', 'wake me up', 'wake me', 'get me up'], elidable: true, theme: ['alarm'], required: ['at'],
  roles: { at: { preps: ['at', 'for'], types: ['clock'] } }, words_pt: ['me acorda', 'me acorde', 'põe', 'coloca'], label_pt: 'Alarme',
  bind: c => { const t = c.roles.at && c.roles.at[0]; return t && t.h < 24 ? { tool: 'alarm', args: { h: t.h, mi: t.mi } } : null; }
});
postmod({ prep: '', heads: ['timer'], attr: 'duration', quantity: true });   // "countdown 90 seconds"

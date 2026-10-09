// Device hand-offs: calendar event, timer, alarm. Simulated in the mock; on Android they become intents.
import { tool, frame, fmt, iso } from './core.js';
import { findDate, findTime, today, fmtDate } from './dates.js';
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
  name: 'event', rank: 32,
  skill: { group: 'Device', title: 'Calendar event', on: 'lead-acid intent', about: 'Fills the event and hands it to your calendar app.', examples: ['remind me to send the samples to the lab on friday at 9', 'schedule core shed visit tomorrow at 14:30 for 2 hours'] },
  read: (text, q) => { const m = /^(?:remind me to|remind me|add (?:an )?event|new event|schedule)[:,]? (.+)$/.exec(q); return m ? parseEvent(text.slice(text.length - m[1].length)) : null; },
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
  name: 'timer', rank: 30,
  skill: { group: 'Device', title: 'Timer and alarm', on: 'lead-acid intent', about: 'Handed to the Clock app.', examples: ['set a timer for 5 min', 'set an alarm for 6:15'] },
  read: (text, q) => {
    let m = /^(?:set |start )?(?:a )?(?:timer|countdown) (?:for |of )?(\d+(?:\.\d+)?) ?(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hours?)$/.exec(q);
    if (m) return { sec: Math.round(m[1] * (m[2][0] === 's' ? 1 : m[2][0] === 'm' ? 60 : 3600)) };
    m = /^(?:set |start )?(?:a )?(?:timer|countdown) (?:for |of )?(half an hour|an hour|a minute|a quarter(?: of an)? hour|quarter of an hour)$/.exec(q);
    return m ? { sec: /half/.test(m[1]) ? 1800 : /quarter/.test(m[1]) ? 900 : /hour/.test(m[1]) ? 3600 : 60 } : null;
  },
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
  name: 'alarm', rank: 31,
  read: (text, q) => { const m = /^(?:set )?(?:an )?alarm (?:for |at )?(.+)$/.exec(q) || /^wake me(?: up)? at (.+)$/.exec(q); const t = m && findTime('at ' + m[1]); return t ? { h: t.h, mi: t.mi } : null; },
  topic: () => ['Alarm', 1],
  run: a => {
    const t = String(a.h).padStart(2, '0') + ':' + String(a.mi).padStart(2, '0');
    const [kv, go] = hand('Hand to the Clock app', `AlarmClock.ACTION_SET_ALARM, HOUR=${a.h}, MINUTES=${a.mi}`, 'SET_ALARM, granted at install', 'On Android this creates the alarm in the Clock app. Nothing happens in the mock.');
    return { read: ['set an alarm at', { v: t }], body: [{ t: 'big', v: t }, kv, { t: 'actions', items: [go] }], trace: [`time → ${t}`, 'build intent: ACTION_SET_ALARM'], py: `device.alarm("${t}")` };
  }
});

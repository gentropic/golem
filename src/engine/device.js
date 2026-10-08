// Device hand-offs: calendar event, timer, alarm. Simulated in the mock; on Android they become intents.
import { T, fmt, iso } from './core.js';
import { fmtDate } from './dates.js';

// the hand-off description every device card carries: the intent, its permission, and the button
const hand = (label, intent, perm, msg) => [{ t: 'kv', rows: [['hand-off', intent, { mono: true }], ['permission', perm]] }, { act: 'handoff', label, msg, go: true }];
T.event = a => {
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
};
T.timer = a => {
  if (!a.end) a.end = Date.now() + a.sec * 1000;
  const [kv, go] = hand('Hand to the Clock app', 'AlarmClock.ACTION_SET_TIMER, EXTRA_LENGTH=' + a.sec, 'SET_ALARM, granted at install', 'On Android the Clock app takes over the timer and rings when golem is closed. Here it counts down in the page.');
  return {
    read: ['start a timer for', { v: a.sec >= 60 ? fmt(a.sec / 60) + ' min' : a.sec + ' s' }],
    body: [{ t: 'big', v: '--:--', end: a.end }, kv, { t: 'actions', items: [go] }],
    trace: [`duration → ${a.sec} s`, 'build intent: ACTION_SET_TIMER'], py: `device.timer(${a.sec})`
  };
};
T.alarm = a => {
  const t = String(a.h).padStart(2, '0') + ':' + String(a.mi).padStart(2, '0');
  const [kv, go] = hand('Hand to the Clock app', `AlarmClock.ACTION_SET_ALARM, HOUR=${a.h}, MINUTES=${a.mi}`, 'SET_ALARM, granted at install', 'On Android this creates the alarm in the Clock app. Nothing happens in the mock.');
  return { read: ['set an alarm at', { v: t }], body: [{ t: 'big', v: t }, kv, { t: 'actions', items: [go] }], trace: [`time → ${t}`, 'build intent: ACTION_SET_ALARM'], py: `device.alarm("${t}")` };
};

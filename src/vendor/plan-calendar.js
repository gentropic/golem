// ⚠ VENDORED — DO NOT EDIT. @gcu/plan's calendar engine and Brazilian holidays, copied from
// ../auditable/ext/plan/src/calendar.js and src/holidays-br.js (MIT). The scheduling half of the package is not here.
// Re-vendor by copying those two files here again and keeping the single export block at the end.

// Calendar engine — all scheduling flows through these functions

// Parse "YYYY-MM-DD" to Date (local midnight)
function _parseDate(d) {
  if (d instanceof Date) return d;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// Format Date to "YYYY-MM-DD"
function _fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Check if a date string falls within a range { start, end }
function _inRange(dateStr, range) {
  return dateStr >= range.start && dateStr <= range.end;
}

// Check if a date is a non-working day
function _isOff(date, calendar, resource) {
  const dow = date.getDay();
  const weekends = calendar.weekends || [0, 6];
  if (weekends.includes(dow)) return true;

  const ds = _fmtDate(date);

  // Calendar holidays
  if (calendar.holidays) {
    for (const h of calendar.holidays) {
      if (h.date === ds) return true;
    }
  }

  // Calendar blocked ranges
  if (calendar.blocked) {
    for (const b of calendar.blocked) {
      if (_inRange(ds, b)) return true;
    }
  }

  // Resource overrides (vacation, leave, etc.)
  if (resource && resource.calendarOverrides) {
    for (const ov of resource.calendarOverrides) {
      if (_inRange(ds, ov)) return true;
    }
  }

  return false;
}

// Is a given date a working day?
function isWorkingDay(date, calendar, resource) {
  return !_isOff(_parseDate(date), calendar, resource);
}

// Add N working days to a date (negative N for backward pass)
function addWorkingDays(date, n, calendar, resource) {
  const d = new Date(_parseDate(date));
  if (n === 0) return d;

  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);

  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (!_isOff(d, calendar, resource)) remaining--;
  }

  return d;
}

// Count working days between two dates (exclusive of end)
function workingDays(start, end, calendar, resource) {
  const s = _parseDate(start);
  const e = _parseDate(end);
  if (s >= e) return 0;

  let count = 0;
  const d = new Date(s);
  while (d < e) {
    if (!_isOff(d, calendar, resource)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Get the next working day on or after date
function nextWorkingDay(date, calendar, resource) {
  const d = new Date(_parseDate(date));
  while (_isOff(d, calendar, resource)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Get all blocked/off days in a range (for rendering)
function getBlockedDays(start, end, calendar, resource) {
  const s = _parseDate(start);
  const e = _parseDate(end);
  const result = [];
  const d = new Date(s);

  while (d <= e) {
    if (_isOff(d, calendar, resource)) {
      const ds = _fmtDate(d);
      let reason = 'weekend';
      const dow = d.getDay();
      const weekends = calendar.weekends || [0, 6];

      if (!weekends.includes(dow)) {
        // Check holidays
        if (calendar.holidays) {
          const h = calendar.holidays.find(h => h.date === ds);
          if (h) { reason = h.label || 'holiday'; }
        }
        // Check blocked
        if (reason === 'weekend' && calendar.blocked) {
          const b = calendar.blocked.find(b => _inRange(ds, b));
          if (b) { reason = b.label || 'blocked'; }
        }
        // Check resource
        if (reason === 'weekend' && resource && resource.calendarOverrides) {
          const ov = resource.calendarOverrides.find(o => _inRange(ds, o));
          if (ov) { reason = ov.label || ov.type || 'unavailable'; }
        }
      }

      result.push({ date: new Date(d), reason });
    }
    d.setDate(d.getDate() + 1);
  }

  return result;
}


// Brazilian holidays — federal, state, and municipal
// Returns arrays of { date: 'YYYY-MM-DD', label } compatible with plan calendar format

// Easter Sunday by anonymous Gregorian algorithm (Computus)
function _easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function _fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function _offset(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Federal holidays (national)
function federalHolidays(year) {
  const easter = _easter(year);
  return [
    { date: `${year}-01-01`, label: 'Confraternização Universal' },
    { date: _fmt(_offset(easter, -48)), label: 'Carnaval (segunda)' },
    { date: _fmt(_offset(easter, -47)), label: 'Carnaval (terça)' },
    { date: _fmt(_offset(easter, -2)), label: 'Sexta-Feira Santa' },
    { date: `${year}-04-21`, label: 'Tiradentes' },
    { date: `${year}-05-01`, label: 'Dia do Trabalho' },
    { date: _fmt(_offset(easter, 60)), label: 'Corpus Christi' },
    { date: `${year}-09-07`, label: 'Independência' },
    { date: `${year}-10-12`, label: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, label: 'Finados' },
    { date: `${year}-11-15`, label: 'Proclamação da República' },
    { date: `${year}-11-20`, label: 'Consciência Negra' },
    { date: `${year}-12-25`, label: 'Natal' },
  ];
}

// State holidays by UF
const STATE_HOLIDAYS = {
  AC: [{ md: '01-23', label: 'Dia do Evangélico' }, { md: '06-15', label: 'Aniversário do Acre' }, { md: '09-05', label: 'Dia da Amazônia' }, { md: '11-17', label: 'Tratado de Petrópolis' }],
  AL: [{ md: '06-24', label: 'São João' }, { md: '06-29', label: 'São Pedro' }, { md: '09-16', label: 'Emancipação de Alagoas' }],
  AP: [{ md: '03-19', label: 'São José' }, { md: '07-25', label: 'São Tiago' }, { md: '10-05', label: 'Criação do Amapá' }],
  AM: [{ md: '09-05', label: 'Elevação do Amazonas' }],
  BA: [{ md: '07-02', label: 'Independência da Bahia' }],
  CE: [{ md: '03-25', label: 'Abolição no Ceará' }],
  DF: [],
  ES: [],
  GO: [],
  MA: [{ md: '07-28', label: 'Adesão do Maranhão' }],
  MT: [],
  MS: [{ md: '10-11', label: 'Criação do MS' }],
  MG: [],
  PA: [{ md: '08-15', label: 'Adesão do Pará' }],
  PB: [{ md: '08-05', label: 'Fundação do Estado' }],
  PR: [{ md: '12-19', label: 'Emancipação do Paraná' }],
  PE: [],
  PI: [{ md: '10-19', label: 'Dia do Piauí' }],
  RJ: [{ md: '04-23', label: 'São Jorge' }],
  RN: [{ md: '10-03', label: 'Mártires de Cunhaú e Uruaçu' }],
  RS: [{ md: '09-20', label: 'Revolução Farroupilha' }],
  RO: [{ md: '01-04', label: 'Criação de Rondônia' }],
  RR: [{ md: '10-05', label: 'Criação de Roraima' }],
  SC: [],
  SE: [{ md: '07-08', label: 'Emancipação de Sergipe' }],
  SP: [{ md: '07-09', label: 'Revolução Constitucionalista' }],
  TO: [{ md: '10-05', label: 'Criação do Tocantins' }],
};

// Municipal holidays — state capitals + mining towns
// { key: [{ md, label }] } — key is 'city-UF' lowercase
const MUNICIPAL_HOLIDAYS = {
  // State capitals
  'rio branco-ac':      [{ md: '12-28', label: 'Aniversário de Rio Branco' }],
  'maceio-al':          [{ md: '12-05', label: 'Aniversário de Maceió' }],
  'macapa-ap':          [{ md: '02-04', label: 'Aniversário de Macapá' }],
  'manaus-am':          [{ md: '10-24', label: 'Aniversário de Manaus' }],
  'salvador-ba':        [{ md: '03-29', label: 'Aniversário de Salvador' }],
  'fortaleza-ce':       [{ md: '04-13', label: 'Aniversário de Fortaleza' }],
  'brasilia-df':        [{ md: '04-21', label: 'Aniversário de Brasília' }],
  'vitoria-es':         [{ md: '09-08', label: 'Aniversário de Vitória' }],
  'goiania-go':         [{ md: '10-24', label: 'Aniversário de Goiânia' }],
  'sao luis-ma':        [{ md: '09-08', label: 'Aniversário de São Luís' }],
  'cuiaba-mt':          [{ md: '04-08', label: 'Aniversário de Cuiabá' }],
  'campo grande-ms':    [{ md: '08-26', label: 'Aniversário de Campo Grande' }],
  'belo horizonte-mg':  [{ md: '12-12', label: 'Aniversário de BH' }],
  'belem-pa':           [{ md: '01-12', label: 'Aniversário de Belém' }],
  'joao pessoa-pb':     [{ md: '08-05', label: 'Aniversário de João Pessoa' }],
  'curitiba-pr':        [{ md: '03-29', label: 'Aniversário de Curitiba' }],
  'recife-pe':          [{ md: '03-12', label: 'Aniversário de Recife' }],
  'teresina-pi':        [{ md: '08-16', label: 'Aniversário de Teresina' }],
  'rio de janeiro-rj':  [{ md: '01-20', label: 'São Sebastião' }, { md: '03-01', label: 'Aniversário do Rio' }],
  'natal-rn':           [{ md: '12-25', label: 'Aniversário de Natal' }],
  'porto alegre-rs':    [{ md: '02-02', label: 'Nossa Senhora dos Navegantes' }],
  'porto velho-ro':     [{ md: '10-02', label: 'Aniversário de Porto Velho' }],
  'boa vista-rr':       [{ md: '06-09', label: 'Aniversário de Boa Vista' }],
  'florianopolis-sc':   [{ md: '03-23', label: 'Aniversário de Florianópolis' }],
  'aracaju-se':         [{ md: '03-17', label: 'Aniversário de Aracaju' }],
  'sao paulo-sp':       [{ md: '01-25', label: 'Aniversário de São Paulo' }],
  'palmas-to':          [{ md: '05-20', label: 'Aniversário de Palmas' }],
  // Mining towns — Carajás region
  'parauapebas-pa':     [{ md: '05-10', label: 'Aniversário de Parauapebas' }],
  'canaa dos carajas-pa': [{ md: '12-27', label: 'Aniversário de Canaã dos Carajás' }],
  'maraba-pa':          [{ md: '04-05', label: 'Aniversário de Marabá' }],
};

// Optional periods — not official holidays but commonly observed
function _optionalPeriods(year) {
  const easter = _easter(year);
  return [
    // Carnival Wednesday (half-day / ponto facultativo)
    { date: _fmt(_offset(easter, -46)), label: 'Quarta de Cinzas (ponto facultativo)' },
    // Day before Carnival
    { date: _fmt(_offset(easter, -49)), label: 'Pré-Carnaval (ponto facultativo)' },
    // Corpus Christi bridge (day after, ponto facultativo)
    { date: _fmt(_offset(easter, 61)), label: 'Pós-Corpus Christi (ponto facultativo)' },
    // Public servant day
    { date: `${year}-10-28`, label: 'Dia do Servidor Público (ponto facultativo)' },
  ];
}

// Main function
// options:
//   uf: 'PA', 'SP', etc. — include state holidays
//   municipality: 'parauapebas-PA', 'sao paulo-SP', etc. — include municipal holidays
//   carnival: true (default) — include carnival Mon+Tue as holidays
//   corpusChristi: true (default) — include Corpus Christi
//   optional: false (default) — include ponto facultativo periods
function brazilHolidays(year, options = {}) {
  const {
    uf = null,
    municipality = null,
    carnival = true,
    corpusChristi = true,
    optional = false,
  } = options;

  let holidays = federalHolidays(year);

  // Filter carnival if disabled
  if (!carnival) {
    holidays = holidays.filter(h => !h.label.startsWith('Carnaval'));
  }

  // Filter Corpus Christi if disabled
  if (!corpusChristi) {
    holidays = holidays.filter(h => h.label !== 'Corpus Christi');
  }

  // State holidays
  const effectiveUf = uf || (municipality ? municipality.split('-').pop().toUpperCase() : null);
  if (effectiveUf && STATE_HOLIDAYS[effectiveUf]) {
    for (const h of STATE_HOLIDAYS[effectiveUf]) {
      holidays.push({ date: `${year}-${h.md}`, label: h.label });
    }
  }

  // Municipal holidays
  if (municipality) {
    const key = municipality.toLowerCase();
    if (MUNICIPAL_HOLIDAYS[key]) {
      for (const h of MUNICIPAL_HOLIDAYS[key]) {
        holidays.push({ date: `${year}-${h.md}`, label: h.label });
      }
    }
  }

  // Optional periods
  if (optional) {
    holidays.push(..._optionalPeriods(year));
  }

  // Sort by date
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  return holidays;
}

// Generate holidays for a range of years
function brazilCalendar(startYear, endYear, options = {}) {
  const holidays = [];
  for (let y = startYear; y <= endYear; y++) {
    holidays.push(...brazilHolidays(y, options));
  }
  return { holidays };
}

// List available municipalities
function brazilMunicipalities() {
  return Object.keys(MUNICIPAL_HOLIDAYS).sort();
}


export { isWorkingDay, addWorkingDays, workingDays, nextWorkingDay, getBlockedDays, brazilHolidays, brazilCalendar, brazilMunicipalities, federalHolidays };

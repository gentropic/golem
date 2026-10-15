// Sampling theory and mine economics as declared formulas. Every term is a slot; a term the person did
// not give is asked for, with the conventional value offered first and never applied on its own. Prices
// are always the person's input. No geostatistics here: these are formulas over given numbers.
import { tool, frame, noun, shape, postmod, qmod, fmt } from './core.js';
import { ELEMENTS } from './data/elements.js';
import { numberAsk, firstNeed } from './forms.js';

const NUM = '(\\d+(?:\\.\\d+)?)';
const TROY = 31.1034768, LB = 0.45359237;
const answered = (a, keys, labels) => keys.filter(k => a[k] != null).map(k => [labels[k], `${fmt(a[k])}`]);

/* ── Gy's fundamental sampling error ────────────────────────── */
const GY_LABELS = { ms: 'sample mass Ms (g)', ml: 'lot mass ML (g)', d: 'top size d (cm)', a: 'mineral mass fraction a', rho_m: 'mineral density ρm (g/cm³)', rho_g: 'gangue density ρg (g/cm³)', dl: 'liberation size dℓ (cm)', b: 'liberation exponent b', f: 'shape factor f', g: 'granulometric factor g', sigma: 'target relative sd σ', k: 'standard deviations' };
const GY_QS = a => [
  { key: 'a', ask: numberAsk('Mass fraction of the mineral of interest in the lot (0 to 1, or a percent)?', { min: 0 }) },
  { key: 'rho_m', ask: numberAsk(`Density of the mineral${a.mineral ? ` (${a.mineral})` : ''}, in g/cm³?`, { min: 0.1 }) },
  { key: 'rho_g', ask: numberAsk('Density of the gangue, in g/cm³?', { offer: [{ label: '2.7 (common silicate gangue)', value: 2.7 }], min: 0.1 }) },
  { key: 'dl', ask: numberAsk('Liberation size dℓ, in mm (the size below which the mineral is free)?', { min: 0 }) },
  { key: 'b', ask: numberAsk('Liberation exponent b?', { offer: [{ label: '0.5 (Gy)', value: 0.5 }], min: 0, max: 3 }) },
  { key: 'f', ask: numberAsk('Shape factor f?', { offer: [{ label: '0.5 (Gy, for most ores)', value: 0.5 }], min: 0, max: 1 }) },
  { key: 'g', ask: numberAsk('Granulometric factor g?', { offer: [{ label: '0.25 (unsized material)', value: 0.25 }], min: 0, max: 1 }) }
];
const gyFactors = a => {
  const frac = a.a > 1 ? a.a / 100 : a.a, c = ((1 - frac) / frac) * ((1 - frac) * a.rho_m + frac * a.rho_g), dcm = a.d_cm, l = Math.min(1, Math.pow((a.dl / 10) / dcm, a.b));
  return { frac, c, l, d3: dcm ** 3 };
};
tool({
  name: 'gy',
  skill: { group: 'Field', title: 'Sampling and economics formulas', on: 'declared formulas', about: 'Gy\'s fundamental sampling error, solved for the error or the sample mass; break-even cutoff grade; net smelter return per tonne and metal equivalents. Every term is a slot; a missing one is asked for, with the convention offered first. Prices are yours.', examples: ['sampling error for a 1 kg sample at 2 mm from a 20 kg lot, 2% chalcopyrite', 'sample mass for 5% precision at 10 mm', 'cutoff grade for copper at 9000 usd/t, 88% recovery, processing 14 usd/t, g&a 3 usd/t', 'cueq of 0.8% cu and 0.3 g/t au at 9000 usd/t and 2300 usd/oz'] },
  topic: () => ['Sampling error', 1],
  run: a => {
    const read = a.solve === 'sigma' ? ['Gy: error of a', { v: `${fmt(a.ms)} g sample` }, 'at', { v: `${fmt(a.d_cm * 10)} mm` }] : ['Gy: sample mass for', { v: `${fmt(a.sigma * 100)} %` }, 'at', { v: `${fmt(a.d_cm * 10)} mm` }];
    const qs = [...(a.solve === 'ms' ? [{ key: 'k', ask: numberAsk('Is that precision one or two standard deviations?', { offer: [{ label: '2 (95%, the usual quote)', value: 2 }, { label: '1', value: 1 }], min: 1, max: 3 }) }] : []), ...GY_QS(a), ...(a.ml == null ? [{ key: 'ml', ask: numberAsk('Lot mass, in g?', { offer: [{ label: 'very large (the 1/ML term drops)', value: Infinity }], min: 1 }) }] : [])];
    const need = firstNeed(a, qs);
    const given = { ...GY_LABELS }, known = answered(a, Object.keys(GY_LABELS).filter(k => a[k] != null && isFinite(a[k])), given);
    if (need) return { read, body: known.length ? [{ t: 'kv', rows: known }] : [], ask: need, trace: ['blocked: a term is missing'] };
    const { frac, c, l, d3 } = gyFactors(a), fg = a.f * a.g * c * l * d3, ml = a.ml === Infinity || a.ml == null ? Infinity : a.ml;
    const rows = [['c, mineralogical factor', `${fmt(c, 4)} g/cm³ = ((1−a)/a)·((1−a)ρm + aρg), a = ${fmt(frac, 4)}`], ['ℓ, liberation factor', `${fmt(l, 4)} = (dℓ/d)^${a.b}${l === 1 ? ' (capped at 1: liberated)' : ''}`], ['f · g', `${a.f} × ${a.g}`], ['d³', `${fmt(d3, 4)} cm³`]];
    if (a.solve === 'sigma') {
      const var_ = fg * (1 / a.ms - (isFinite(ml) ? 1 / ml : 0)), sd = Math.sqrt(Math.max(0, var_));
      return { read, value: sd, body: [{ t: 'big', v: fmt(sd * 100, 3), unit: '% relative standard deviation (one σ)' }, { t: 'kv', rows: [['at two σ', `${fmt(2 * sd * 100, 3)} %`], ...rows, ['masses', `Ms ${fmt(a.ms)} g, ML ${isFinite(ml) ? fmt(ml) + ' g' : 'very large'}`]] }, { t: 'sub', text: 'σ² = f · g · c · ℓ · d³ · (1/Ms − 1/ML). The fundamental error only: grouping, segregation and preparation errors are extra.' }], trace: [`c = ${fmt(c, 6)}`, `ℓ = ${fmt(l, 6)}`, `σ² = ${a.f}·${a.g}·${fmt(c, 4)}·${fmt(l, 4)}·${fmt(d3, 4)}·(1/${a.ms} − ${isFinite(ml) ? '1/' + ml : '0'}) = ${fmt(var_, 6)}`], py: `sampling.gy(ms=${a.ms}, ml=${isFinite(ml) ? ml : 'None'}, d_cm=${a.d_cm}, a=${frac}, rho_m=${a.rho_m}, rho_g=${a.rho_g}, dl_cm=${a.dl / 10}, b=${a.b}, f=${a.f}, g=${a.g})` };
    }
    const sd1 = a.sigma / a.k, inv = sd1 * sd1 / fg + (isFinite(ml) ? 1 / ml : 0), ms = 1 / inv;
    if (ms <= 0) return { read, body: [{ t: 'note', kind: 'err', text: 'The lot is too small for that precision at this top size: even the whole lot would not reach it.' }], trace: ['1/Ms ≤ 0'] };
    return { read, value: ms, body: [{ t: 'big', v: ms >= 1000 ? fmt(ms / 1000, 4) : fmt(ms, 4), unit: ms >= 1000 ? 'kg minimum sample mass' : 'g minimum sample mass' }, { t: 'kv', rows: [['precision', `${fmt(a.sigma * 100)} % at ${a.k} σ, so σ = ${fmt(sd1 * 100, 3)} %`], ...rows, ['lot', isFinite(ml) ? `ML ${fmt(ml)} g` : 'very large: the 1/ML term dropped']] }, { t: 'sub', text: 'Ms = 1 / (σ²/(f·g·c·ℓ·d³) + 1/ML). The fundamental error only.' }], trace: [`σ = ${fmt(sd1, 6)}`, `f·g·c·ℓ·d³ = ${fmt(fg, 6)}`, `Ms = 1/(${fmt(sd1 * sd1, 8)}/${fmt(fg, 6)} + ${isFinite(ml) ? '1/' + ml : '0'}) = ${fmt(ms, 6)} g`], py: `sampling.gy_mass(sigma=${sd1}, d_cm=${a.d_cm}, a=${frac}, rho_m=${a.rho_m}, rho_g=${a.rho_g}, dl_cm=${a.dl / 10}, b=${a.b}, f=${a.f}, g=${a.g})` };
  }
});

/* ── break-even cutoff grade ────────────────────────────────── */
const PRICE = `${NUM} ?(?:usd|us\\$|\\$|dollars?|aud|cad|brl|r\\$|eur|€)?(?: ?(?:per|/) ?(t|tonne|oz|ounce|lb|pound|kg|g))`;
const perUnit = s => /^(t|tonne)$/.test(s) ? 't' : /^(oz|ounce)$/.test(s) ? 'oz' : /^(lb|pound)$/.test(s) ? 'lb' : s;
// a grade in the unit the price implies: price per t of metal → %, per oz → g/t, per lb → %, per kg → kg/t, per g → g/t
const gradeOut = (metalPerT, per) => per === 't' ? [metalPerT * 100, '%'] : per === 'oz' ? [metalPerT * TROY, 'g/t'] : per === 'lb' ? [metalPerT * LB / 1000 * 100, '%'] : per === 'kg' ? [metalPerT, 'kg/t'] : [metalPerT, 'g/t'];
tool({
  name: 'cutoff',
  topic: a => [`Cutoff grade, ${a.metal}`, 1],
  run: a => {
    const read = ['cutoff grade for', { v: a.metal }];
    const qs = [{ key: 'price', ask: numberAsk(`Price of ${a.metal}, per tonne of metal (or say "2300 per oz")?`, { min: 0 }) }, { key: 'recovery', ask: numberAsk('Recovery, in percent?', { min: 0, max: 100 }) }, { key: 'c_process', ask: numberAsk('Processing cost per tonne of ore?', { min: 0 }) }, { key: 'c_ga', ask: numberAsk('G&A per tonne of ore?', { offer: [{ label: '0 (none)', value: 0 }], min: 0 }) }, { key: 'c_sell', ask: numberAsk('Selling cost per unit of metal (refining, transport)?', { offer: [{ label: '0 (none)', value: 0 }], min: 0 }) }];
    const need = firstNeed(a, qs);
    const known = [['price', a.price != null ? `${fmt(a.price)} per ${a.per || 't'}` : null], ['recovery', a.recovery != null ? `${fmt(a.recovery)} %` : null], ['processing', a.c_process != null ? fmt(a.c_process) + ' /t ore' : null], ['G&A', a.c_ga != null ? fmt(a.c_ga) + ' /t ore' : null], ['selling', a.c_sell != null ? fmt(a.c_sell) + ' per unit metal' : null]].filter(r => r[1] != null);
    if (need) { if (need.set && a.price == null) { const base = need.parse; need.parse = s => { const m = /^(\d+(?:\.\d+)?)\s*(?:usd|\$)?\s*(?:per|\/)\s*(t|tonne|oz|ounce|lb|pound|kg|g)$/i.exec(s.trim()); if (m) { return { _price: +m[1], _per: perUnit(m[2].toLowerCase()) }; } return base(s); }; need.set = (x, v) => { if (v && v._price != null) { x.price = v._price; x.per = v._per; } else { x.price = v; x.per = x.per || 't'; } }; } return { read, body: known.length ? [{ t: 'kv', rows: known }] : [], ask: need, trace: ['blocked: a term is missing'] }; }
    const per = a.per || 't', R = a.recovery / 100, net = a.price - a.c_sell;
    if (net <= 0) return { read, body: [{ t: 'note', kind: 'err', text: 'The selling cost is at or above the price: nothing pays.' }], trace: ['P − Cs ≤ 0'] };
    const costs = a.c_process + a.c_ga + (a.c_mine || 0), metalPerT = costs / (R * net), [g, unit] = gradeOut(metalPerT, per);
    return { read: [...read, 'at', { v: `${fmt(a.price)} per ${per}` }], value: g, body: [{ t: 'big', v: fmt(g, 4), unit: `${unit} ${a.metal}, break-even` }, { t: 'kv', rows: [['formula', 'g = (Cp + Cga) / (R · (P − Cs))'], ['costs per t ore', `${fmt(costs)} (processing ${fmt(a.c_process)}${a.c_ga ? ' + G&A ' + fmt(a.c_ga) : ''}${a.c_mine ? ' + mining ' + fmt(a.c_mine) : ''})`], ['value per unit metal', `${fmt(net)} = ${fmt(a.price)} − ${fmt(a.c_sell)}, at ${fmt(a.recovery)} % recovery`], ['metal per t ore', `${fmt(metalPerT, 6)} ${per} per t`]] }, { t: 'sub', text: `A break-even grade: ore at ${fmt(g, 4)} ${unit} pays its processing${a.c_ga ? ' and G&A' : ''} and nothing more. Mining cost is ${a.c_mine ? 'included' : 'not included'}.` }], trace: [`(${fmt(a.c_process)} + ${fmt(a.c_ga)}${a.c_mine ? ' + ' + fmt(a.c_mine) : ''}) / (${R} × (${a.price} − ${a.c_sell})) = ${fmt(metalPerT, 8)} ${per}/t`, `→ ${fmt(g, 6)} ${unit}`], py: `econ.cutoff(price=${a.price}, per="${per}", recovery=${R}, c_process=${a.c_process}, c_ga=${a.c_ga}, c_sell=${a.c_sell})` };
  }
});

/* ── net smelter return per tonne, and metal equivalents ───── */
const GRADE = `${NUM} ?(%|g/t|gpt|ppm|oz/t) ?([a-z]{1,2})`;
const readElements = s => [...s.matchAll(new RegExp(GRADE, 'g'))].map(m => ({ el: m[3], grade: +m[1], unit: m[2] === 'gpt' || m[2] === 'ppm' ? 'g/t' : m[2] }));
const readPrices = s => [...s.matchAll(new RegExp(PRICE, 'g'))].map(m => ({ price: +m[1], per: perUnit(m[2]) }));
// metal per tonne of ore in the price's unit
const metalPerT = (e, per) => { const gpt = e.unit === '%' ? e.grade * 1e4 : e.unit === 'oz/t' ? e.grade * TROY : e.grade; return per === 't' ? gpt / 1e6 : per === 'oz' ? gpt / TROY : per === 'lb' ? gpt / 1000 / LB : per === 'kg' ? gpt / 1000 : gpt; };
tool({
  name: 'nsr',
  topic: a => [a.kind === 'nsr' ? 'NSR' : `${a.lead.toUpperCase()} equivalent`, 1],
  run: a => {
    const read = [a.kind === 'nsr' ? 'NSR for' : `${a.lead.toUpperCase()}-equivalent of`, { v: a.els.map(e => `${fmt(e.grade)} ${e.unit} ${e.el}`).join(', ') }];
    const qs = [];
    a.els.forEach((e, i) => {
      qs.push({ key: `price:${i}`, ask: numberAsk(`Price of ${e.el}, per ${e.unit === '%' ? 'tonne' : 'oz'} of metal?`, { min: 0 }) });
      qs.push({ key: `rec:${i}`, ask: numberAsk(`Recovery of ${e.el}, in percent?`, { offer: a.kind === 'equiv' ? [{ label: '100 (no recovery adjustment)', value: 100 }] : [], min: 0, max: 100 }) });
      if (a.kind === 'nsr') { qs.push({ key: `pay:${i}`, ask: numberAsk(`Payable ${e.el}, in percent of the recovered metal?`, { offer: [{ label: '100 (all payable)', value: 100 }], min: 0, max: 100 }) }); qs.push({ key: `ref:${i}`, ask: numberAsk(`Refining charge on ${e.el}, per unit of metal (same unit as the price)?`, { offer: [{ label: '0 (none)', value: 0 }], min: 0 }) }); }
    });
    if (a.kind === 'nsr') { qs.push({ key: 'treatment', ask: numberAsk('Treatment charge, per tonne of ore?', { offer: [{ label: '0 (none)', value: 0 }], min: 0 }) }); qs.push({ key: 'transport', ask: numberAsk('Transport, per tonne of ore?', { offer: [{ label: '0 (none)', value: 0 }], min: 0 }) }); }
    a.els.forEach((e, i) => { if (e.price != null && a[`price:${i}`] == null) a[`price:${i}`] = e.price; });
    const need = firstNeed(a, qs);
    const known = a.els.flatMap((e, i) => [[`${e.el} price`, a[`price:${i}`] != null ? `${fmt(a[`price:${i}`])} per ${e.per || (e.unit === '%' ? 't' : 'oz')}` : null], [`${e.el} recovery`, a[`rec:${i}`] != null ? fmt(a[`rec:${i}`]) + ' %' : null]]).filter(r => r[1] != null);
    if (need) return { read, body: known.length ? [{ t: 'kv', rows: known }] : [], ask: need, trace: ['blocked: a term is missing'] };
    const parts = a.els.map((e, i) => { const per = e.per || (e.unit === '%' ? 't' : 'oz'), m = metalPerT(e, per), rec = a[`rec:${i}`] / 100, pay = a.kind === 'nsr' ? a[`pay:${i}`] / 100 : 1, ref = a.kind === 'nsr' ? a[`ref:${i}`] : 0, v = m * rec * pay * (a[`price:${i}`] - ref); return { ...e, per, m, rec, pay, ref, v }; });
    if (a.kind === 'nsr') {
      const gross = parts.reduce((s, p) => s + p.v, 0), nsr = gross - a.treatment - a.transport;
      return { read, value: nsr, body: [{ t: 'big', v: fmt(nsr, 4), unit: 'per tonne of ore, net smelter return' }, { t: 'table', head: ['Metal', 'Grade', 'Metal per t', 'Recovery', 'Payable', 'Price − refining', 'Value per t'], num: [false, false, true, true, true, true, true], rows: parts.map(p => [p.el, `${fmt(p.grade)} ${p.unit}`, `${fmt(p.m, 5)} ${p.per}`, `${fmt(p.rec * 100)} %`, `${fmt(p.pay * 100)} %`, `${fmt(a[`price:${parts.indexOf(p)}`] - p.ref)}`, fmt(p.v, 4)]) }, { t: 'kv', rows: [['gross', fmt(gross, 4)], ['less treatment', fmt(a.treatment)], ['less transport', fmt(a.transport)]] }, { t: 'sub', text: 'Per element: grade × recovery × payable × (price − refining); then minus treatment and transport per tonne of ore. Prices and terms are yours; currency as you gave it.' }], trace: parts.map(p => `${p.el}: ${fmt(p.m, 6)} × ${p.rec} × ${p.pay} × ${fmt(a[`price:${parts.indexOf(p)}`] - p.ref)} = ${fmt(p.v, 6)}`).concat([`${fmt(gross, 6)} − ${a.treatment} − ${a.transport} = ${fmt(nsr, 6)}`]), py: `econ.nsr(${JSON.stringify(parts.map(p => ({ el: p.el, grade: p.grade, unit: p.unit, recovery: p.rec, payable: p.pay, price: a[`price:${parts.indexOf(p)}`], refining: p.ref })))}, treatment=${a.treatment}, transport=${a.transport})` };
    }
    const lead = parts.find(p => p.el === a.lead), unitValue = metalPerT({ ...lead, grade: 1 }, lead.per) * lead.rec * a[`price:${parts.indexOf(lead)}`];   // value of 1 unit of lead grade
    const total = parts.reduce((s, p) => s + p.v, 0), eq = total / unitValue;
    const factors = parts.filter(p => p !== lead).map(p => [`1 ${p.unit} ${p.el}`, `${fmt(metalPerT({ ...p, grade: 1 }, p.per) * p.rec * a[`price:${parts.indexOf(p)}`] / unitValue, 4)} ${lead.unit} ${lead.el}`]);
    return { read, value: eq, body: [{ t: 'big', v: fmt(eq, 4), unit: `${lead.unit} ${a.lead.toUpperCase()}-equivalent` }, { t: 'kv', rows: [...parts.map(p => [`${p.el} value per t`, `${fmt(p.v, 4)} (${fmt(p.grade)} ${p.unit} × ${fmt(p.rec * 100)} % × ${fmt(a[`price:${parts.indexOf(p)}`])})`]), ['value of 1 ' + lead.unit + ' ' + lead.el, fmt(unitValue, 4)], ...factors] }, { t: 'sub', text: `Σ value ÷ value of one ${lead.unit} of ${a.lead} at ${fmt(lead.rec * 100)} % recovery. The factor${factors.length === 1 ? '' : 's'} above ${factors.length === 1 ? 'is' : 'are'} what this card used; a published equivalent may use other recoveries and prices.` }], trace: parts.map(p => `${p.el}: ${fmt(p.v, 6)} per t`).concat([`unit value of ${lead.el}: ${fmt(unitValue, 6)}`, `${fmt(total, 6)} ÷ ${fmt(unitValue, 6)} = ${fmt(eq, 6)}`]), py: `econ.equiv(lead="${a.lead}", elements=${JSON.stringify(parts.map(p => ({ el: p.el, grade: p.grade, unit: p.unit, recovery: p.rec, price: a[`price:${parts.indexOf(p)}`] })))})` };
  }
});
/* ── what reads them ─────────────────────────────────────────── */
const EL_NAME = Object.fromEntries(ELEMENTS.map(e => [e[1], e[2]]));
const massG = q => { const f = { kg: 1000, g: 1, t: 1e6, mg: 1e-3 }[q.unit]; return f ? q.n * f : null; };
const sizeCm = q => { const f = { mm: 0.1, cm: 1, m: 100, 'µm': 1e-4 }[q.unit]; return f ? q.n * f : null; };
// Gy: "sampling error for a 1 kg sample at 2 mm from a 20 kg lot, 2% chalcopyrite"; "sample mass for 5% precision at 10 mm"
noun({ type: 'gyword', words: { sigma: ['sampling error', 'fundamental error', 'gy error', 'fundamental sampling error', 'the sampling error'], ms: ['sample mass', 'minimum sample mass', 'gy sample mass'] }, words_pt: { sigma: ['erro de amostragem', 'erro fundamental'], ms: ['massa mínima'] } });
noun({ type: 'gysample', words: {}, generic: ['sample'], generic_pt: ['amostra'] }); qmod({ head: 'gysample', attr: 'mass', dims: ['mass'] });
noun({ type: 'gylot', words: {}, generic: ['lot'], generic_pt: ['lote'] }); qmod({ head: 'gylot', attr: 'mass', dims: ['mass'] });
noun({ type: 'precision', words: { p: ['precision', 'error', 'relative error'] }, words_pt: { p: ['precisão', 'erro'] } }); qmod({ head: 'precision', attr: 'value', dims: ['mass ratio'] });
frame({
  name: 'gy', label: 'Sampling error', words: ['calculate', 'compute'], elidable: true, theme: ['gyword'], required: ['theme', 'at'],
  roles: { for: { preps: ['for', 'of'], types: ['gysample', 'precision'] }, at: { preps: ['at', 'with'], types: ['quantity:length'] }, from: { preps: ['from', 'of', 'in'], types: ['gylot', 'quantity:mass ratio'] }, mineral: { preps: [''], types: ['text', 'mineral'] } },
  label_pt: 'Erro de amostragem',
  bind: c => {
    const w = c.theme[0].value, d = sizeCm(c.roles.at[0]); if (d == null) return null;
    const of = c.roles.for || [], from = c.roles.from || [], s = of.find(n => n.type === 'gysample'), p = of.find(n => n.type === 'precision'), lot = from.find(n => n.type === 'gylot'), pc = from.find(n => n.type === 'quantity'), min = c.roles.mineral && c.roles.mineral[0];
    if (w === 'ms') return p && p.attrs.value ? { tool: 'gy', args: { solve: 'ms', sigma: p.attrs.value.n / 100, d_cm: d } } : null;
    const ms = s && s.attrs.mass && massG(s.attrs.mass); if (!ms) return null;
    const ml = lot && lot.attrs.mass && massG(lot.attrs.mass);
    return { tool: 'gy', args: { solve: 'sigma', ms, d_cm: d, ...(ml ? { ml } : {}), ...(pc && pc.unit === '%' && min ? { a: pc.n / 100, mineral: min.value.trim().toLowerCase() } : {}) } };
  }
});
// prices: "9000 usd/t", "2300 usd/oz", "$14/t"
shape({ type: 'price', re: String.raw`(?:us\$|\$|r\$|€)?\s?\d[\d,]*(?:\.\d+)?\s?(?:usd|us\$|\$|dollars?|aud|cad|brl|r\$|eur|€)?\s?(?:/|per\s)\s?(?:t|tonne|oz|ounce|lb|pound|kg|g)` });
const priceOf = n => { const m = /([\d,]+(?:\.\d+)?)\D*?(?:\/|per\s)\s?(t|tonne|oz|ounce|lb|pound|kg|g)$/i.exec(n.value.trim()); return m ? { price: +m[1].replace(/,/g, ''), per: perUnit(m[2].toLowerCase()) } : null; };
// cutoff: "cutoff grade for copper at 9000 usd/t, 88% recovery, processing 14 usd/t, g&a 3 usd/t"
noun({ type: 'cutoffword', words: { cutoff: ['cutoff grade', 'cut-off grade', 'cutoff', 'cut-off', 'break-even cutoff', 'breakeven cutoff', 'break-even cutoff grade'] }, words_pt: { cutoff: ['teor de corte', 'teor de corte de equilíbrio'] } });
noun({ type: 'costterm', words: { recovery: ['recovery'], c_process: ['processing', 'processing cost', 'process cost', 'milling', 'milling cost'], c_ga: ['g&a', 'g and a', 'general and admin', 'general and administration', 'overhead', 'overheads'], c_sell: ['selling', 'selling cost', 'refining', 'refining charge', 'realisation', 'realization'], c_mine: ['mining', 'mining cost'] },
  words_pt: { recovery: ['recuperação'], c_process: ['processamento', 'beneficiamento'], c_ga: ['g&a', 'administrativo'], c_sell: ['venda', 'refino'], c_mine: ['lavra', 'mineração'] } });
qmod({ head: 'costterm', attr: 'value', dims: ['mass ratio', 'bare'] });                          // "88% recovery"
postmod({ prep: '', heads: ['costterm'], attr: 'value', quantity: true });                   // "recovery 88%"
postmod({ prep: '', heads: ['costterm'], attr: 'price', mod: 'price' });                     // "processing 14 usd/t"
postmod({ prep: 'of', heads: ['costterm'], attr: 'price', mod: 'price' });                   // "processing of 14 usd/t"
frame({
  name: 'cutoff', label: 'Cutoff grade', words: ['calculate', 'compute'], elidable: true, theme: ['cutoffword'], required: ['theme', 'for'],
  roles: { for: { preps: ['for', 'of'], types: ['element'] }, at: { preps: ['at', 'with', ''], types: ['price', 'costterm'] } }, label_pt: 'Teor de corte',
  bind: c => {
    const metal = c.roles.for[0], a = { metal: (EL_NAME[metal.value] || metal.value).toLowerCase() };
    for (const n of c.roles.at || []) {
      if (n.type === 'price') { const p = priceOf(n); if (!p) return null; a.price = p.price; a.per = p.per; continue; }
      const v = n.attrs.value ? n.attrs.value.n : n.attrs.price ? (priceOf({ value: n.attrs.price }) || {}).price : null; if (v == null) return null; a[n.value] = v;
    }
    return { tool: 'cutoff', args: a };
  }
});
// NSR and equivalents: "cueq of 0.8% cu and 0.3 g/t au at 9000 usd/t and 2300 usd/oz", "nsr for 0.8% cu …"
qmod({ head: 'element', attr: 'grade', dims: ['mass ratio'] });                                   // "0.8% cu", "0.3 g/t au"
noun({ type: 'nsrword', words: { nsr: ['nsr', 'net smelter return', 'nsr per tonne', 'nsr per t'] }, words_pt: { nsr: ['nsr', 'retorno líquido de fundição'] } });
shape({ type: 'equiv', re: String.raw`[a-z]{1,2}[- ]?(?:eq|equiv|equivalent)(?:\s+grade)?` });                 // cueq, au-eq, cu equivalent
frame({
  name: 'nsr', label: 'NSR', words: ['calculate', 'compute'], elidable: true, theme: ['nsrword', 'equiv'], required: ['theme', 'of'],
  roles: { of: { preps: ['of', 'for'], types: ['element'] }, at: { preps: ['at', 'with'], types: ['price'] } }, label_pt: 'NSR',
  bind: c => {
    const els = c.roles.of.map(n => n.attrs.grade ? { el: n.value.toLowerCase(), grade: n.attrs.grade.n, unit: n.attrs.grade.unit === 'ppm' ? 'g/t' : n.attrs.grade.unit } : null); if (els.some(e => !e)) return null;
    const prices = (c.roles.at || []).map(priceOf), t = c.theme[0], kind = t.type === 'equiv' ? 'equiv' : 'nsr';
    const a = { kind, els: els.map((e, i) => ({ ...e, ...(prices[i] ? prices[i] : {}) })) };
    if (kind === 'equiv') { a.lead = /^[a-z]{1,2}/i.exec(t.value)[0].toLowerCase(); if (els.length < 2 || !els.some(e => e.el === a.lead)) return null; }
    return { tool: 'nsr', args: a };
  }
});

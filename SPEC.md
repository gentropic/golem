# golem — specification

**Status:** draft 0.1, 8 Oct 2026. Written from the design conversation and the interactive mock in `src/`.
**Working name:** golem (`@gcu/golem`). Not final; see [Open decisions](#14-open-decisions).

golem is an assistant with no model at runtime. A person types a request in plain language; golem reads it with a deterministic ladder of parsers, turns the reading into a plan of tool calls, runs the plan on the device, and shows the answer together with the reading and the plan. It is the GCU candidate for a first published Android app, packaged with lead-acid.

Sections 1 to 11 describe the target. Section 12 says what the mock does today. Section 13 is the path between them.

---

## 1. Principles

1. **No model at runtime.** No LLM, no network inference, no shipped neural weights. The only learners allowed are the ones `@gcu/dispatch` already uses: linear models trained on the device in under a second.
2. **Show the reading.** Every answer displays what the query was read as, with each interpreted slot visible. Ambiguous slots are editable in place.
3. **Refuse instead of guessing.** If no rung reads the query, golem says so, shows the nearest skills, and offers to learn the unknown word. It never answers from a low-confidence reading.
4. **An answer is a plan.** Every card is backed by a list of tool calls with arguments. "Why", "undo", "again", export and session replay are all operations on that plan.
5. **Deterministic replay.** The same plan gives the same answer. A session is stored as its plan and recomputed when opened.
6. **Offline and self-contained.** Zero network requests in normal use. Knowledge arrives as installed packs.
7. **Knowledge is installed, not baked.** What golem knows is the union of its tools and its packs. Breadth grows by adding either.
8. **Single-file deploy.** The web build is one HTML file. The Android build wraps the same file.

### Non-goals

- Open-ended prose: essays, summaries in its own words, general translation, common-sense chat.
- An agent loop with open-ended search. The plan space is bounded by declared tools and their preconditions.
- A replacement for explicit UI. golem sits beside the tools; a failed reading degrades to a list of skills.
- Geostatistics. No variograms, kriging, simulation or resource estimation in golem, by decision (8 Oct 2026). Descriptive statistics of a table are fine.

---

## 2. Pipeline

```
 input text
     │  normalise (trim, collapse spaces, strip final punctuation)
     ▼
 reading ladder ──────────────────────────────────────────────┐
   1 context    open question, amendment, meta-intent         │
   2 grammar    controlled-English parse (clause)             │  first rung that
   3 taught     device lexicon rewrites, then grammar again   │  produces a reading
   4 statistical  @gcu/dispatch, gated by margin + assembly   │  wins
   5 none       stop, nearest skills, offer to learn          │
     ▼                                                        │
 reading = { tool, args, rung, amends? } ◀────────────────────┘
     │
     ▼
 planner     check tool preconditions; an unmet one becomes a plan step
             when a tool can satisfy it, or a question when a value is missing
     ▼
 executor    run each step; collect result, trace and a script line
     ▼
 card        query · rung · read-as slots · answer · plan trace
     ▼
 session     append the card's spec { tool, args, … } to the session plan
```

---

## 3. The reading ladder

| Rung | What reads the query | In the mock |
|---|---|---|
| 1 `context` | An open question on the last card; an amendment of the last card (`in feet`, `log scale`, `and chile`); a meta-intent (`why`, `undo`, `again`) | Implemented in `context()` and at the top of `submit()` |
| 2 `grammar` | The controlled-English parser ("clause": Earley parsing with costed repairs, ontology as data, locale banks). Lives in `auditable/ext/dispatch/src/grammar/` since 8 Oct 2026. Reads imperatives, bare phrases ("density of chalcopyrite", "2 km in miles") and closed questions ("what is …", "which … are …"); open questions stay out of scope by design | A regex rule table in `grammar()` |
| 3 `taught` | Phrases the user taught on this device, applied as rewrites before a second grammar pass | Implemented in `taught()` |
| 4 statistical | `@gcu/dispatch`: perceptron intent, structured-perceptron slots, per-kind assembly, `REFUSE` as a first-class intent | **Not in the mock** |
| 5 `none` | Nothing. Show nearest skills and a teach suggestion | Implemented in `T.none` |

Rules:

- A rung either returns a complete reading or nothing. No rung returns a partial reading for a later rung to finish.
- Rung 4 is accepted only when dispatch's gate passes: intent margin above threshold and assembly succeeded. Otherwise fall to rung 5.
- The rung is shown on the card. In Switchboard terms: grammar is `info`, context is `selected`, taught is `success`, none is `error`. The statistical rung needs its own mark; `warn` is the natural choice because its readings deserve a second look.

### Meta-intents

Operations on the session plan, resolved before anything else:

| Intent | Example | Effect |
|---|---|---|
| answer | `2 m`, `yes`, or tapping an option | Fills the open question on the last card and reruns it in place |
| amend | `in feet`, `log scale`, `and chile` | New card: same tool, one argument changed, linked to its parent |
| explain | `why`, `show the plan` | New card listing the steps and inputs of the previous card |
| repeat | `again` | Resubmits the last query |
| undo | `undo` | Removes the last card from the plan |
| teach | `dens means density` | Adds a rewrite to the device lexicon |
| session | `new session`, `name this session …`, `history` | See section 8 |
| export | `export as script` | Emits the session plan as adder source |

Amendments are declared per tool: a tool result says which amendment family it accepts (`unit`, `hist`, `fact` in the mock). Target: each tool declares its amendable arguments and the phrases that select them, as data.

---

## 4. Contracts

### 4.1 As implemented in the mock

```ts
// A tool takes its arguments and returns a result, or null for "this reading does not apply".
type Tool = (args: object) => Result | null;

type Result = {
  read:  (string | Slot)[];   // the "read as" line: plain words and slots
  html:  string;              // the answer body
  trace: string[];            // ordered plan steps, shown under "plan"
  py?:   string;              // the adder line(s) for export
  value?: number;             // numeric result, when there is one
  amend?: string;             // amendment family this card accepts
  ask?:  Ask;                 // an open question; the card is incomplete until answered
  copy?: string;              // text behind a "copy" button
};

type Slot = { v: string; key?: string; alts?: unknown[]; cur?: unknown };
// A slot with `alts` is an ambiguous reading. Tapping it sets args[key] to the next alternative and reruns.

type Ask = { prompt: string; options: { label: string; value: unknown }[]; set(args, value): void };

type CardSpec = { id: number; raw: string; tool: string; args: object; rung: Rung; amends?: number; ms: number };
type Session  = { id: number; name: string; auto: boolean; example: boolean; created: number; updated: number; cards: CardSpec[] };
```

Two properties matter and must survive the rewrite:

- `args` is plain JSON. Everything needed to recompute a card is in `{ tool, args }`. Answers to questions, slot flips and timer deadlines all live in `args`.
- Tools are pure with respect to `args` plus session state built by earlier cards (the open table). That is what makes replay work.

### 4.2 Target

```ts
type ToolDecl = {
  name: string;                       // 'table.histogram'
  args: Record<string, ArgType>;      // typed, with units where they apply
  pre:  Condition[];                  // e.g. table.open, samples.equalLength
  post: Condition[];                  // what holds afterwards
  amend?: Record<string, string[]>;   // argument → phrases that change it
  topic(args): [label: string, weight: number];   // for session naming, section 8
  run(args, state): Result;
};
```

- Tool declarations are data wherever possible so that the grammar, the dispatch corpus, the skills list and the planner all derive from one source. `@gcu/dispatch` already takes declarative tools in ten kinds; golem's declarations should be a superset that maps onto them.
- `html` becomes a structured answer (value, unit, table, plot spec, note) rendered by the shell, so the engine runs without a DOM. This is also what makes the engine testable in Node.

---

## 5. Planning and preconditions

A tool whose precondition is unmet does not fail. The planner does one of two things:

- **Another tool can establish it** (no table open → `table.open`): add that step to the plan. Ask first when the step has a choice in it.
- **A value is missing** (a timer with no duration, a table question naming no column): ask, with options. The answer is stored in `args` and becomes an editable slot on the card.

Since 8 Oct 2026 the first half is declared data: a tool lists the conditions it needs in `pre` (`hist` and `query` need `table`), and each condition (`condition()` in `src/engine/core.js`) says whether it holds and which steps can establish it, each step a `{ label, tool, args }`. `runTool()` checks the conditions before every run; an unmet one becomes an open question listing the steps (open the sample, or any file this device has seen), the chosen step is stored in `args.plan`, and it runs before the tool on every rerun and on replay, showing in the trace as `plan: …`. A condition nothing can establish is a refusal, not a guess. The second half, a missing value, is still the parser's clarify. What remains of the target is depth: one step per condition today, no search over chains, no `post` conditions, and a plan shown as trace lines rather than an editable DAG.

---

## 6. Skills

Status: **mock** = works in `src/` today; **planned** = named, not built.

| Group | Skill | Status | Builds on |
|---|---|---|---|
| Compute | Unit conversion with dimension checks | mock (own table, checked against `@gcu/units`) | `@gcu/units`, `@gcu/dimensions` |
| Compute | Arithmetic, trig in degrees | mock (own parser) | `@gcu/expr` if it fits, else keep the parser |
| Compute | Dates: day counts, weekdays | mock | built in |
| Compute | Decision matrix: options, criteria, weights and scores asked one at a time as a form, weighted totals, bars, the smallest weight change that flips the top; reports the highest score only | mock (8 Oct 2026); the form card is `firstNeed()` in `src/engine/forms.js`, answers are args and slots | built in |
| Field | Sampling and economics formulas: Gy's fundamental error (for σ or for the sample mass), break-even cutoff grade, NSR per tonne, metal equivalents; every term a slot, conventions offered first and never applied silently | mock (8 Oct 2026) | built in |
| Compute | Text tools: word count and Flesch readability (English, labelled estimates), key sentences by TextRank in source order, a Myers diff by line, word or character | mock (8 Oct 2026); payloads follow a colon or the first line, and the shell input is a growing textarea | built in |
| Compute | Molar mass, element-to-oxide factors, element fractions, the periodic table | mock (8 Oct 2026) over `src/engine/data/elements.js`: IUPAC CIAAW 2024 weights abridged to five figures, source in the file; no mineral names until a minerals pack exists | the periodic table as a records pack |
| Compute | Estimates with ranges: arithmetic over "a to b" and "a ± b" by simulation, units carried through, mean and 10th/50th/90th percentiles, the seed in the plan | mock (own sampler, 8 Oct 2026); distributions are slots | `@gcu/scitra` for the samplers once vendored |
| Compute | Working days and rosters: counts, N working days from a date, is-it-a-working-day, on/off rosters; the calendar is a slot (Brazil federal, weekdays only) | `@gcu/plan` calendar and holidays vendored (8 Oct 2026); municipal calendars and the plan what-ifs are not | `@gcu/plan` |
| Compute | Time zones: a time in one place as it reads in another, now in a place, shared hours across places; named days (Easter, Carnival, Christmas) | mock, Intl only (8 Oct 2026) | built in |
| Compute | Hashes and encodings: SHA-256 of a text or an opened file; base64, hex and URL encoding both ways | mock (own SHA-256, 8 Oct 2026) | Web Crypto is asynchronous, so the digest is computed in the tool |
| Table | The open table as CSV, TSV or JSON, with copy and save | mock (8 Oct 2026); xlsx, dm, parquet and yaml readers are the second pass of conversions | `@gcu/sheet`, `@gcu/dm`, `@gcu/parquet`, `@gcu/yaml` |
| Compute | Explainers: cron schedules, epoch times, chmod modes, URLs, ECMAScript regular expressions | mock (own parsers, 8 Oct 2026); JWT waits for sensitive arguments, PCRE dialect not read | built in |
| Compute | Step-by-step algebra | planned | new package; nothing symbolic was found in the monorepo |
| Field | True thickness from intercept, hole and plane | `@gcu/bearing` vendored | `@gcu/bearing` |
| Field | Stereonet: planes, poles, lines | `@gcu/bearing` vendored (projection); own SVG | `@gcu/bearing`, `@gcu/stereonet` |
| Field | Structural geometry: apparent dip, three-point plane, intersection of planes, rake, oriented core, Fisher mean | `@gcu/bearing` vendored (8 Oct 2026); rotation and rose diagrams planned | `@gcu/bearing` |
| Field | Magnetic declination, magnetic and true bearings | `@gcu/wmm` vendored (8 Oct 2026); grid north needs UTM, planned | `@gcu/wmm` |
| Field | Core and sample arithmetic: sample mass from core size, sieve sizes, specific gravity, recovery and RQD | `@gcu/units` vendored for its DCDMA and sieve tables (8 Oct 2026); the arithmetic is golem's | `@gcu/units` |
| Field | Mineral identification key | removed 8 Oct 2026 until a mineral dataset with a clear licence is chosen | minerals pack; question choice could use `@gcu/learn` trees |
| Field | Compass capture from phone sensors | planned | lead-acid sensor route (does not exist yet) |
| Field | Colour from camera to Munsell | planned | swatch (not found under `ext/`) |
| Field | Kinematic slope check | planned | daylight / `@gcu/bearing` |
| Table | Open, type and validate a table | mock (synthetic data) | `@gcu/recon`, `@gcu/sadpan`, `@gcu/sluice`, `@gcu/dm` |
| Table | Histogram and summary | `@gcu/sadpan` vendored (statistics); own bars | `@gcu/sadpan`, `@gcu/plot` |
| Table | Transform by example | planned | new package |
| Table | Report paragraph from plan parameters | planned | templates; see [Open decisions](#14-open-decisions) on output English |
| Knowledge | Record lookup, conversion, filter, rank | mock (14-row sample) | factbook pack, `@gcu/sift` |
| Knowledge | Term definitions with reader hand-off | mock (locator only) | `@gcu/librarian`, `@gcu/reader-core` |
| Knowledge | Geologic timescale: bounds, ranks, parents, neighbours, subdivisions, the unit at an age | built in (8 Oct 2026) from the ICS chart via Macrostrat, CC BY 4.0, 171 units | the first real records pack; the `golem` facet is this file |
| Knowledge | Style check from a rule pack | mock | elements-of-style pack |
| Knowledge | Search over the user's documents | planned | `@gcu/librarian`, `@gcu/vfs` |
| Device | Calendar event | mock (simulated hand-off) | lead-acid intent route |
| Device | Timer, alarm | mock (simulated hand-off) | lead-acid intent route |
| Device | Map, dial, share | planned | lead-acid intent route; `share` exists today |
| Session | Explain, amend, repeat, undo | mock | section 3 |
| Session | Teach a word | mock | device lexicon |
| Session | Notes: remember and recall | mock | glass later; a table now |
| Session | Sessions, history, auto names | mock | section 8 |
| Session | Export the plan as a script | mock (illustrative API names) | `@gcu/adder` |

Package names in the right-hand column were checked against `gentropic/auditable` `ext/*/package.json` at commit `09c4904`. Two things the design leans on were **not** found under `ext/` at that commit and need locating before they are relied on: the dispatch meta-intent package (`dispatch-meta`) and swatch. The clause grammar was folded into `ext/dispatch/src/grammar/` on 8 Oct 2026 (see `ext/dispatch/SPEC.md`, "The grammar rung").

---

## 7. Packs

golem reads the same `.gcudat` packs as the Auditable Works reader, from the same registry format (`gcu-library/registry.json`). The library today holds one pack of each kind golem can use:

| Kind | Example | What golem does with it |
|---|---|---|
| Records | `factbook` (+ `factbook-full`), the ICS timescale | Lookup, unit conversion, filter, rank, compute across records |
| Text | `ods`, the ray-tracing books, `arcr` | Find where a term is defined, show the passage, open the reader there; run listings in adder |
| Rules | `elements-of-style` (1918, public domain) | Compile rules into a checker that cites the rule |

### The `golem` facet

Each pack may carry a `golem` facet next to its content, emitted by `build-gcudat`:

- **Records:** a schema with field names, synonyms, units and which fields are filterable or rankable.
- **Text:** a glossary (term → anchor of the defining passage), section anchors, and optionally question → passage pairs.
- **Rules:** patterns with the rule they cite and a suggested fix.
- **Keys:** an identification key as a table of entities and attributes plus the question text for each attribute.

The facet is inert data: reviewable, versioned, and covered by the pack's SRI hash like everything else. How facets get authored is an open decision: by algorithm at build time (definitional patterns, BM25, TextRank), by an LLM at build time, or by hand. Whatever authors them, nothing but data ships.

### Proposed packs

The geologic timescale (ICS chart, attribution carried in the pack; accepted 8 Oct 2026), `minerals` (properties and a key; the hand-typed sample was removed 8 Oct 2026, a licensed source is still to be chosen), a gazetteer (GeoNames), a Wikidata subset, USGS commodity summaries, WordNet for parser synonyms. Licences must be verified before any of these enters the registry; none has been checked.

---

## 8. Sessions, history and names

- A **session** is an ordered list of card specs: `{ tool, args, rung, raw, … }`. Results are not stored.
- **Opening** a session clears the working state and replays the specs in order.
- **History search** is a substring match over `raw` across all sessions. A hit opens its session at that card. Target: `@gcu/librarian` for fuzzy and prefix matching.
- **Device state** is separate from sessions: the taught lexicon and notes belong to the device and are shared by all sessions.
- **Storage:** the mock uses `localStorage` under `golem.mock.v2`. Target: `@gcu/vfs` over OPFS or IndexedDB, one file per session, so sessions can be exported, shared as capsules, or synced.

### Auto-naming

Computed from the plan, no model:

1. Each card contributes `[label, weight]` from its tool and arguments (`tagOf()` in the mock).
2. Weights sum per label. A small recency term breaks ties.
3. If the session touched a table, the name is `<table>: <top two table labels>`.
4. Otherwise it is the top two labels joined with a comma, or the top one when two exceed 40 characters.
5. The name updates as cards are added until the user names the session. Clearing the name returns it to automatic.

Mock weights, to be tuned on real use:

| Weight | Tools |
|---|---|
| 3 | histogram, true thickness |
| 2 | stereonet, record lookup, record list, definition, style check, calendar event, table questions, structural geometry, declination |
| 1 | unit conversion, timer, alarm, notes |
| 0.5 | arithmetic, dates |
| none | teach, explain, export, no reading |

---

## 9. Device hand-offs (Android)

Adding to the calendar needs no Google API and no network. golem fills the fields and hands them to an app the user already has.

| Action | Mechanism | Permission |
|---|---|---|
| Event, user confirms | `Intent.ACTION_INSERT` on `CalendarContract.Events.CONTENT_URI` | none |
| Event, silent | `CalendarContract` provider insert | `WRITE_CALENDAR` (runtime) |
| Timer, alarm | `AlarmClock.ACTION_SET_TIMER`, `ACTION_SET_ALARM` | `com.android.alarm.permission.SET_ALARM` (install-time) |
| Show on map | `ACTION_VIEW` with a `geo:` URI | none |
| Dial, message, email | `ACTION_DIAL`, `ACTION_SENDTO` | none |
| New contact | `ContactsContract.Intents.Insert` | none |
| Share a result | `ACTION_SEND` | none |
| Voice input | the lead-acid `speech` plugin: the phone's on-device recognizer only, never the networked one; see `auditable/spec_inbox/lead-acid_and_friends/speech-plugin-spec.md` | `RECORD_AUDIO` (runtime) |

Default to the user-confirms route: the app then requests no dangerous permissions.

**lead-acid gap.** The vendored shim (`ext/leadacid/index.js`) exposes `native`, `stream`, `version`, `keepAwake`, `publish`, `share`, `shareText`, `attest`, `files`, `fileSource`, `fsBackend`. It has no way to start an intent. golem needs one new native route, for example `POST /native/intent/<name>` with a JSON body, where `<name>` comes from a fixed allowlist (`calendar.insert`, `clock.timer`, `clock.alarm`, `map.view`, `dial`, `sendto`, `contact.insert`) and the shell builds the intent itself. The page never passes a raw action string or URI scheme. The shim says its source of truth is the `gentropic/lead-acid` repo, which was not readable when this was written.

**Web fallback.** Outside the shell (`shell.present === false`), a calendar event is offered as an `.ics` file; timers run in the page; the other hand-offs are hidden.

---

## 10. Interface

- **Switchboard 1.3** tokens (`ext/switchboard/switchboard.css`): equipment gray in light, basalt in dark. Barlow for text addressed to the person, Space Mono for anything the machine read or computed. Components read `--au-*` only.
- **An instrument, not a chat.** No bubbles, no avatar, no typing indicator. The stream is a column of readout cards.
- **Card anatomy:** header (card number, rung badge, parent link, time in ms) · the query · "read as" line with slots · answer · open question with options, if any · plan trace, collapsed.
- **Dashed slot** = an ambiguous reading the user can flip. Solid slot = an unambiguous one.
- **Dock:** status line, a row of example chips, the input.
- **Tabs:** Ask, Skills (catalog; examples run on tap), Packs (library, plus device state: taught words, notes, open table).
- **Menu drawer:** new session, session list with rename and two-step delete, history search.
- **The off switch.** The top-right control reads *sleep*. Tapping it puts golem to sleep: input disabled, nothing runs, the control reads *wake*. Plain words, no theatre.

---

## 11. Platform

- **Web:** one HTML file, service worker from `@gcu/sw`, installable as a PWA.
- **Android:** the same file inside the lead-acid shell, published through the Geoscientific Chaos Union Play organisation account.
- **Capability declaration:** `@gcu/seal` output (hash, `capability.json`, CSP, SBOM). The intended declaration is zero network in normal use; pack installation from the registry is the one network path and should be explicit and user-initiated.
- **Locale:** English first. pt-BR arrives as a locale bank for the grammar and for dispatch, the same way dispatch plans it. Taught words are per device and can be in any language.

---

## 12. The mock today

`dist/golem.html` is a working mock: a phone-shaped app plus bench notes. `npm test` drives it through 27 queries.

**Real, computed in the page:** unit conversion with dimension checks; arithmetic by recursive descent (no `eval`); dates; true thickness and the equal-area stereonet; histogram; the Strunk checker (15 patterns from rules 11 to 13 of the 1918 edition); every reading, amendment, taught word, note, session, name and replay.

**Sample data:** `assays.csv` is synthetic (seeded generator, 8 holes, mixed 1 m and 2 m samples). The Factbook is 14 countries with rounded figures. The ODS entry is a hand-made index of 7 terms that gives the chapter and section, not the passage.

**Simulated:** all device hand-offs. The timer counts down in the page.

**Absent:** rung 4 (the statistical dispatcher), multi-step planning (one declared step per condition today), real packs, pt-BR in the shell.

**Declarations** (since 8 Oct 2026): every tool is one declaration (`tool()` in `src/engine/core.js`) carrying its reader, its amendments, its session-name topic and its catalog row; verb frames (`frame()`) say how a parsed command becomes a tool call. The Skills tab, the amendment table, session names and the ontology derive from them.

**The clause parser** (since 8 Oct 2026) is rung 2's first half: `@gcu/dispatch` is vendored under `src/vendor/`, the engine builds the parser from its own ontology, and a reading that binds to a frame becomes the card. The regex rules remain the second half for what the grammar does not cover yet: free text, dates, orientations, arithmetic. The trace says which half read the query.

**Fonts** are embedded by the build; the page makes no network request.

**Real tables** (since 8 Oct 2026): the paperclip opens a CSV or TSV; recon types it; table questions and the histogram work on any numeric column; a session keeps the file on the device (under a megabyte) and replays it, or says the file is gone. Sample data is still labelled sample data.

**Engine and shell** (since 8 Oct 2026): `src/engine/` reads and computes with no DOM, returning results as plain blocks (big value, note, key-values, table, list, steps, plot specs, actions); `src/shell/` renders them. The engine runs in Node, and `test/engine.test.mjs` drives it through the smoke queries, replay, slot flips, answers and undo.

### Known defects and shortcuts

- The grammar is an ordered regex table. Rule order matters and is fragile: `X means Y` is tested first and will swallow any sentence containing " means ".
- Typed answers to an open question match by label prefix or containment. A typed answer that matches no option falls through to a normal reading and can produce a "no reading" card while the question stays open.
- Amendments exist for three families only. `in feet` does nothing after a true-thickness card.
- `oz` is read as troy in a ratio and avoirdupois otherwise. The slot lets the user flip it, but the default is a heuristic.
- `next friday` means the Friday after the coming one. That is one convention of two.
- The passive-voice pattern is crude and will flag some adjectives.
- Taught words cannot be forgotten. Notes cannot be deleted. Deleting a session leaves its notes and taught words in place.
- Replaying a session re-applies its `teach` cards, and a "no reading" card stays a "no reading" card even if the word was taught later.
- Session names: the 40-character cap drops the second label often. Weights are first guesses.
- The export script uses invented API names (`units.convert`, `bearing.true_thickness`, …). They are placeholders until the real packages decide.

---

## 13. Path from mock to app

In order. Each step leaves something that runs.

1. **Engine/shell split.** Done 8 Oct 2026: `src/engine/` with structured results, `src/shell/` rendering them, Node tests for the engine and the browser smoke test for the shell.
2. **Tool declarations as data.** Done 8 Oct 2026: `tool()` and `frame()` declarations; the catalog, amendments, session names and the ontology derive from them. The declaration shape is still JS (readers and amendment matchers are regexes); the ontology they produce is JSON.
3. **Real grammar.** Begun 8 Oct 2026: the clause parser is vendored and reads first; the regex rules read what it cannot yet. To finish, the grammar needs free-text roles, dates, orientations and amendments through ellipsis (listed in `ext/dispatch/SPEC.md`), then the regex rules go. The parser is now the grammar rung of `@gcu/dispatch` (`ext/dispatch/src/grammar/`). clause reads imperatives, bare phrases and closed questions against an ontology; `ext/dispatch/bench/golem.json` is the starting ontology for golem's register and `ext/dispatch/bench/golem-corpus.mjs` its hand corpus. Still outside the grammar and needing their own reading: free-text arguments (`remember that …`, `check: …`, `X means Y`, event titles), absolute dates and clock times, orientations like `270/60`, and arithmetic (a token-shape check routes it to the expression parser). Amendments (`in feet`, `and chile`) can move into clause's ellipsis machinery.
4. **Rung 4.** Generate dispatch tool declarations and a corpus from golem's tool declarations, train on start, gate on margin and assembly.
5. **Real packages under the tools.** Checked 8 Oct 2026 (`test/oracle.test.mjs`, against the sibling clone): golem's conversions, thickness factor, equal-area projection and summary statistics reproduce `@gcu/units`, `@gcu/bearing` and `@gcu/sadpan`. `bearing` and `sadpan` are vendored and in use under the field and table tools. `units` is vendored for its DCDMA core and sieve tables only: its conversion factors are rounded to six figures where golem's are exact, it lacks troy and avoirdupois ounces, imperial pressure, temperature and square miles, and its `core.sampleMass` throws (`PI` undefined); golem keeps its own conversion table and sample-mass arithmetic until the package is fixed upstream, and the oracle test says when that happens. Still to check: `@gcu/recon` for table typing, `@gcu/plot`, `@gcu/librarian` for definitions.
6. **Planner.** Preconditions and effects on the declarations; replace `needData()` and the key's hand-coded questions.
7. **Real files.** Begun 8 Oct 2026: a CSV or TSV through the file picker (the lead-acid shell routes `<input type=file>` to the system picker), typed by `@gcu/recon`, with table questions in controlled English (`SPEC-skills` A2: aggregates, where, by, length weighting, a below-detection policy, counts, lists, distinct values, correlation, interval checks) and the file's columns as parser nouns. Still to do: `.dm`, xlsx and parquet through their packages, and files over 20 MB through `@gcu/sluice`.
8. **Packs.** Install from a registry, define the `golem` facet, build it for `factbook`, `ods` and `elements-of-style`.
9. **Session store** on `@gcu/vfs`; export and import a session as a file.
10. **lead-acid.** The intent route in the shell; the web fallback in the page.
11. **Release.** Service worker, seal artifacts, licence attributions, pt-BR bank, store listing. (Fonts are embedded since 8 Oct 2026.)

---

## 14. Open decisions

1. **Name.** golem, navigator, or something else. Check that `@gcu/golem` and the Play listing name are free.
2. **Where the code lives.** Its own repo consuming `@gcu/*` packages, or `ext/golem` in the auditable monorepo.
3. **Is an LLM allowed at build time?** For authoring grammar corpora, pack facets and paraphrase banks. Runtime stays model-free either way; this decides how packs are made and how the "no LLM" claim is worded.
4. **clause and dispatch: one package or two?** Decided 8 Oct 2026: one package. The grammar is a rung of `@gcu/dispatch`, under `ext/dispatch/src/grammar/`.
5. **Output English.** Answers are currently hand-written templates. A controlled output grammar would make them uniform, and gin was the intended basis, but gin does not exist yet, so nothing here depends on it.
6. **Calendar default.** User-confirms (no permission) is specified. Decide whether silent insert is ever offered.
7. **Statistical-rung badge and threshold.** How a dispatch reading is marked, and where the margin gate sits.
8. **First-release scope.** Which groups from section 6 ship first. The Compute, Field and Device groups work without any file handling.
9. **Pack licences.** Every proposed pack in section 7.

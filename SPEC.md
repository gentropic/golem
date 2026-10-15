# golem — specification

**Status:** draft 0.1, 8 Oct 2026 (revised to 14 Oct). Written from the design conversation and the working prototype in `src/`.
**Working name:** golem (`@gcu/golem`). Not final; see [Open decisions](#14-open-decisions).

golem is an assistant with no model at runtime. A person types a request in plain language; golem reads it with a deterministic ladder of parsers, turns the reading into a plan of tool calls, runs the plan on the device, and shows the answer together with the reading and the plan. It is the GCU candidate for a first published Android app, packaged with lead-acid.

Sections 1 to 11 describe the target. Section 12 says what golem does today. Section 13 is the path between them.

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
9. **Not a sealed build.** golem is a personal assistant, not a tool a company audits, so it does not carry the monorepo's seal attestation (decided 8 Oct 2026). The rules above stand on their own: no network, no model, deterministic replay, and parsers that stay parsers. What this loosens: Wasm built from source in the monorepo (natra's kernels) is allowed; binaries golem did not build are not. Runtime code generation (`eval`, `new Function`) stays out of the engine and the parsers. Inside the Python card's worker it is allowed (decided 10 Oct 2026), for code compiled from the person's own source or model by compilers in the monorepo: adder's AIR path (the default, `engine: 'auto'`, tree-walking a trace or anything the compiler declines), learn's tree `.compile()`, atra to Wasm. The worker is the boundary: no network, adder sandboxed (`host: false`, `remote: false`), a statement budget that holds in compiled code, and a wall-clock kill.

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
   4 guess      the grammar's repair pass, offered; runs on a tap  │  wins
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

| Rung | What reads the query | Today |
|---|---|---|
| 1 `context` | An open question on the last card; an amendment of the last card (`in feet`, `log scale`, `and chile`); a meta-intent (`why`, `undo`, `again`) | Session frames read first; amendments after rung 2, as the tool's amendment frames or a fragment of the last card's clause command |
| 2 `grammar` | The controlled-English parser ("clause": Earley parsing with costed repairs, ontology as data, locale banks). Lives in `auditable/ext/dispatch/src/grammar/` since 8 Oct 2026. Reads imperatives, bare phrases ("density of chalcopyrite", "2 km in miles") and closed questions ("what is …", "which … are …"), with free text, dates, clock times, token shapes and politeness around them; open questions stay out of scope by design | The vendored parser over golem's frames, then the expression parsers for arithmetic |
| 3 `taught` | Phrases the user taught on this device, applied as rewrites before a second grammar pass | Implemented in `taught()` |
| 4 `guess` | The grammar's costed repair pass (an ignored word, an assumed preposition, an argument out of order, a one-letter slip), budget 3: up to three readings a tool takes, offered on a card with what each changed | Implemented in `guessRead()` since 14 Oct 2026. A statistical dispatcher trained from the frames was built and measured first (`auditable/ext/dispatch/bench/loose.mjs`) and is not used: see section 13, step 4 |
| 5 `none` | Nothing. Show nearest skills and a teach suggestion | Implemented in `T.none` |

Rules:

- A rung either returns a complete reading or nothing. No rung returns a partial reading for a later rung to finish.
- Rung 4 never answers by itself. Its card offers readings, each one the grammar made and a tool takes, and runs none until one is picked (a tap, or typing its words; "yes" when there is one). The picked card is that tool's card and keeps the `guess` mark in the session. Off-topic text draws no offer, and the rung falls to 5.
- The rung is shown on the card. In Switchboard terms: grammar is `info`, context is `selected`, taught is `success`, guess is `warn`, none is `error`.

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

Amendments are declared per tool: a tool result says which amendment family it accepts (`unit`, `hist`, `fact` at first). Target: each tool declares its amendable arguments and the phrases that select them, as data.

---

## 4. Contracts

### 4.1 As implemented

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

Since 8 Oct 2026 the first half is declared data: a tool lists the conditions it needs in `pre` (`hist` and `query` need `table`), and each condition (`condition()` in `src/engine/core.js`) says whether it holds and which steps can establish it, each step a `{ label, tool, args }`. `runTool()` checks the conditions before every run; an unmet one becomes an open question listing the steps (open the sample, or any file this device has seen), the chosen step is stored in `args.plan`, and it runs before the tool on every rerun and on replay, showing in the trace as `plan: …`. A condition nothing can establish is a refusal, not a guess. The second half, a missing value, is still the parser's clarify. Since 15 Oct 2026 the other half of a declaration is there too: `post` (the conditions a tool establishes: `open` gives `table`) and `effects` (`device`: writes to this device; `handoff`: offers something to another app on a tap; `save`: offers a file on a tap). A request in steps is checked with them before any of it runs (`planOf` in engine.js): each step is read now, against the step before it (so an amendment reads against the card that step will make); a `pre` an earlier step's `post` meets is met; a step that does not read now waits only when an earlier step could change what reads; a step needing what a later step provides is out of order. A plan that fails the check runs nothing and leaves one `planStop` card saying which step and why (out of order, it offers the reordered request), and the preview says the same, or what each step does beyond its card. What remains of the target is depth: one step per condition, no search over chains, and a plan shown as trace lines rather than an editable DAG.

---

## 6. Skills

Status: **live** = works in `src/` today; **planned** = named, not built.

| Group | Skill | Status | Builds on |
|---|---|---|---|
| Compute | Unit conversion with dimension checks | live (own table, checked against `@gcu/units`) | `@gcu/units`, `@gcu/dimensions` |
| Compute | Arithmetic, trig in degrees | live (own parser) | `@gcu/expr` if it fits, else keep the parser |
| Compute | Dates: day counts, weekdays | live | built in |
| Device | Places saved by coordinates (no gazetteer, device location off: an unknown name is asked for); distance and bearings by Vincenty on WGS84 (Karney where Vincenty fails is not built); UTM both ways by the Krüger series with the zone a slot near an edge; SAD69 and Córrego Alegre refused | live (8 Oct 2026) | built in |
| Device | Sun times by NOAA's equations in the place's zone when its name has one, else UTC and said so; the moon's phase from the mean synodic month, labelled to about half a day | live (8 Oct 2026); Meeus's periodic terms not applied | built in |
| Device | The log: a device table written from cards ("log 5 km run yesterday"), asked in plain words (totals and means by week or month, units converted within a dimension), opened as the table for every table question; undo removes the row, "that was 6 km" rewrites it | live (8 Oct 2026); device tables are `S.tables`, serialised with notes and files | built in |
| Compute | Decision matrix: options, criteria, weights and scores asked one at a time as a form, weighted totals, bars, the smallest weight change that flips the top; reports the highest score only | live (8 Oct 2026); the form card is `firstNeed()` in `src/engine/forms.js`, answers are args and slots | built in |
| Field | Sampling and economics formulas: Gy's fundamental error (for σ or for the sample mass), break-even cutoff grade, NSR per tonne, metal equivalents; every term a slot, conventions offered first and never applied silently | live (8 Oct 2026) | built in |
| Compute | Text tools: word count and Flesch readability (English, labelled estimates), key sentences by TextRank in source order, a Myers diff by line, word or character | live (8 Oct 2026); payloads follow a colon or the first line, and the shell input is a growing textarea | built in |
| Compute | Molar mass, element-to-oxide factors, element fractions, the periodic table | live (8 Oct 2026) over `src/engine/data/elements.js`: IUPAC CIAAW 2024 weights abridged to five figures, source in the file; no mineral names until a minerals pack exists | the periodic table as a records pack |
| Compute | Estimates with ranges: arithmetic over "a to b" and "a ± b" by simulation, units carried through, mean and 10th/50th/90th percentiles, the seed in the plan | live (own sampler, 8 Oct 2026); distributions are slots | `@gcu/scitra` for the samplers once vendored |
| Compute | Reckoning by dimensions ("how long to drill 300 m at 25 m/h", "how heavy is 1000 m3 at 2.7 t/m3"): the question word or "in hours" gives the dimension; the quantities are multiplied and divided, each once, until it comes out; the combinations using every quantity count, one is computed with its equation, several are asked. Declared formulas solved for any term (tonnage, contained metal, strip ratio, two-product recovery, break-even cutoff, lithostatic pressure, Darcy, Stokes): a "solve for" slot, the other terms asked, a root scan and bisection, more than one root said | live (15 Oct 2026), `reckon.js` | own dimensional analysis over golem units |
| Compute | Working days and rosters: counts, N working days from a date, is-it-a-working-day, on/off rosters; the calendar is a slot (Brazil federal, weekdays only) | `@gcu/plan` calendar and holidays vendored (8 Oct 2026); municipal calendars and the plan what-ifs are not | `@gcu/plan` |
| Compute | Time zones: a time in one place as it reads in another, now in a place, shared hours across places; named days (Easter, Carnival, Christmas) | live, Intl only (8 Oct 2026) | built in |
| Compute | Run and trace Python: adder in a fresh Web Worker per run, built from the page itself; `host: false`, `remote: false`, a budget of 2,000,000 statements and 5 s, the worker killed a second later; output, the last value, the error with its line, a trace table; numpy/pandas/scipy imports rewritten by @gcu/ipynb's table and shown | live (9 Oct 2026); adder's single-file build vendored as is, with natra (numpy; it compiles its Wasm kernels in the worker with atra from the alpack sources, Wasm built from source per principle 9), scitra (scipy), sadpan (pandas), learn (sklearn; its tree `.compile()` builds JavaScript and is refused in the worker), plot (matplotlib, as `plt`; figures leave the worker as draw lists, plain JSON, and the shell replays them on a canvas through allowlists) and line (by its own name) registered; the worker is about 1.6 MB of a 2.6 MB page | `@gcu/adder`, `@gcu/ipynb`, `@gcu/natra`, `@gcu/atra`, `@gcu/scitra`, `@gcu/sadpan`, `@gcu/learn`, `@gcu/plot`, `@gcu/line` |
| Compute | Hashes and encodings: SHA-256 of a text or an opened file; base64, hex and URL encoding both ways | live (own SHA-256, 8 Oct 2026) | Web Crypto is asynchronous, so the digest is computed in the tool |
| Table | The open table as CSV, TSV or JSON, with copy and save | live (8 Oct 2026) | built in |
| Table | Field compute over a table: true thickness of every intercept and apparent dip of every plane, the row's columns bound to the skill's arguments by name, constants filling the rest, unfillable rows listed | live (8 Oct 2026); two skills bound so far | `@gcu/bearing` |
| Table | xlsx and Datamine .dm through the picker: converted to text per sheet by the vendored readers when opened (the reader is asynchronous, tools are not), kept on the device, a workbook with several sheets asks which; what did not carry over is said | `@gcu/sheet` and `@gcu/dm` vendored (8 Oct 2026); Parquet read the same way and written from the open table, YAML ↔ JSON within the strict subset, WKT ↔ GeoJSON and DXF → GeoJSON or WKT (11 Oct 2026); writing xlsx not yet (the writer is asynchronous) | `@gcu/parquet`, `@gcu/yaml`, `@gcu/wkt`, `@gcu/dxf` |
| Compute | Explainers: cron schedules, epoch times, chmod modes, URLs, ECMAScript regular expressions | live (own parsers, 8 Oct 2026); JWT waits for sensitive arguments, PCRE dialect not read | built in |
| Compute | Step-by-step algebra | planned | new package; nothing symbolic was found in the monorepo |
| Field | True thickness from intercept, hole and plane | `@gcu/bearing` vendored | `@gcu/bearing` |
| Field | Stereonet: planes, poles, lines | `@gcu/bearing` vendored (projection); own SVG | `@gcu/bearing`, `@gcu/stereonet` |
| Field | Structural geometry: apparent dip, three-point plane, intersection of planes, rake, oriented core, Fisher mean | `@gcu/bearing` vendored (8 Oct 2026); rotation and rose diagrams planned | `@gcu/bearing` |
| Field | Magnetic declination, magnetic and true bearings | `@gcu/wmm` vendored (8 Oct 2026); grid north needs UTM, planned | `@gcu/wmm` |
| Field | Core and sample arithmetic: sample mass from core size, sieve sizes, specific gravity, recovery and RQD | `@gcu/units` vendored for its DCDMA and sieve tables (8 Oct 2026); the arithmetic is golem's | `@gcu/units` |
| Field | Mineral identification key | removed 8 Oct 2026 until a mineral dataset with a clear licence is chosen | minerals pack; question choice could use `@gcu/learn` trees |
| Field | Compass capture from phone sensors | live in the app (14 Oct 2026) and in a phone's browser (15 Oct): a plane or a line, magnetic or true with a home | lead-acid `sensor`, `@gcu/bearing`, `@gcu/wmm` |
| Field | Field notebook: stations ("station 14", where you stand by one fix or at coordinates), attitudes and samples added at the open station ("add bedding 045/30", "add sample S-14-a", "add #12" from a measured or plotted card), compass readings corrected to true north with WMM at the station; a summary with a stereonet and the Fisher mean of each kind of plane; opened as a table; saved as GeoJSON or CSV. QR-coded sample bags are not read yet | live (15 Oct 2026); the `field` device table, `notebook.js`; a station is a declared precondition | `@gcu/bearing`, `@gcu/wmm` |
| Field | Colour from camera to Munsell | planned | swatch (not found under `ext/`) |
| Field | Kinematic slope check | planned | daylight / `@gcu/bearing` |
| Table | Open, type and validate a table | live (synthetic data) | `@gcu/recon`, `@gcu/sadpan`, `@gcu/sluice`, `@gcu/dm` |
| Table | Histogram and summary | `@gcu/sadpan` vendored (statistics); drawn by `@gcu/plot` (14 Oct 2026: real axes, labels, a log axis, the theme's colours; estimates mark their percentiles) | `@gcu/sadpan`, `@gcu/plot` |
| Table | Transform by example | planned | new package |
| Table | Report paragraph from plan parameters | planned | templates; see [Open decisions](#14-open-decisions) on output English |
| Knowledge | Record lookup, conversion, filter, rank | live (14-row sample) | factbook pack, `@gcu/sift` |
| Knowledge | Term definitions with reader hand-off | live (locator only) | `@gcu/librarian`, `@gcu/reader-core` |
| Knowledge | Geologic timescale: bounds, ranks, parents, neighbours, subdivisions, the unit at an age | built in (8 Oct 2026) from the ICS chart via Macrostrat, CC BY 4.0, 171 units | the first real records pack; the `golem` facet is this file |
| Knowledge | Minerals: a species by name (formula, elements, Nickel-Strunz class, crystal system, Mohs hardness and density where Wikidata has them, a missing field said to be missing), a property ("hardness of quartz"), species by element and class ("minerals with Cu and S", "sulfides with Bi"), the whole set as a table ("open the minerals") | live (15 Oct 2026): a labelled sample of 42 ships (`data/minerals-sample.js`, copied from the pack); gcu-library's `minerals` pack (Wikidata, CC0, 6304 species, built by `tools/minerals-convert.mjs`) installs from Packs. With the pack, a request reads in about 50 ms on a desktop instead of 13 | gcu-library `minerals` |
| Knowledge | Style check from a rule pack | live | elements-of-style pack |
| Knowledge | Search over the user's documents | live (11 Oct 2026): Markdown, text and HTML from the picker kept on the device, cut into passages by heading and paragraph, indexed by librarian (rebuilt from the kept files, never stored), passages returned verbatim with the matched words marked; no folder indexing (needs the `tree` plugin's grant), no PDF, no documentation packs yet | `@gcu/librarian`, `@gcu/vfs` |
| Device | Calendar event | live: `calendar.insert` in the app, a `.ics` in a browser (14 Oct 2026) | lead-acid `intent` plugin |
| Device | Timer, alarm | live: `clock.timer`, `clock.alarm` in the app; in a browser the timer counts down in the page (14 Oct 2026) | lead-acid `intent` plugin |
| Device | Map, dial, share | planned | lead-acid intent route; `share` exists today |
| Session | Explain, amend, repeat, undo | live | section 3 |
| Session | Teach a word; learning from the person | live; since 15 Oct 2026 learned from, on the device and never silently: what did not read is kept (`S.misses`, "what couldn't you read") and a request on it can be taught as a whole, only to something that reads; a request that did not read followed by one that did offers the stretch that changed as a word ("klicks means km"); a picked guess offers its repaired word, and the tools picked rank first among the next guesses (`S.picks`) | device lexicon, `learn.js` |
| Session | Notes: remember and recall | live | glass later; a table now |
| Session | Sessions, history, auto names | live | section 8 |
| Session | Recipes | live (11 Oct 2026): a session's steps saved as card specs with the subjects that change (the table, columns), run again into a session of its own with every step re-read and the run stopped at the first step that does not read; batch over every kept table, one row each; recipes are device state | section 8 |
| Session | The session as a notebook, and signed sessions | live (15 Oct 2026): "export as notebook" writes nbformat 4 (each card as Markdown with its steps and source, its Python line as a code cell marked illustrative) with the session itself in `metadata.golem`, so golem reopens the notebook as the session and recomputes every card. Session files and notebooks are signed when saved: ECDSA P-256 over the canonical JSON (`share.js`), with the phone's hardware key in the app (lead-acid `attest`) or a WebCrypto key kept in IndexedDB in a browser (`shell/sign.js`); opening one says whether it is unchanged since a key signed it, and Packs shows this device's key fingerprint. A signature proves integrity, not who holds the key | nbformat, WebCrypto, lead-acid `attest` |
| Session | Export the plan as a script | live (illustrative API names) | `@gcu/adder` |

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
- **Storage:** `@gcu/vfs` over IndexedDB since 14 Oct 2026: `/sessions/<id>.json`, `/files/<hash>.json`, `/device.json`, `/meta.json`, and `/packs/` for installed packs; a journal in `localStorage` covers a write cut short. A session exports as `<name>.golem.json` and imports from a file.

### Auto-naming

Computed from the plan, no model:

1. Each card contributes `[label, weight]` from its tool and arguments (`tagOf()`).
2. Weights sum per label. A small recency term breaks ties.
3. If the session touched a table, the name is `<table>: <top two table labels>`.
4. Otherwise it is the top two labels joined with a comma, or the top one when two exceed 40 characters.
5. The name updates as cards are added until the user names the session. Clearing the name returns it to automatic.

Starting weights, to be tuned on real use:

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
| Voice input | the lead-acid `speech` plugin: the phone's on-device recognizer only, never the networked one. In the app since 14 Oct 2026: the mic in the box fills it with what was heard, and the preview shows the reading; it runs on Enter, like anything typed. Not in a browser, whose speech services may send the audio away | `RECORD_AUDIO` (runtime, asked on the first tap) |
| Compass capture | in the app, the lead-acid `sensor` plugin: the phone's fused rotation vector, with Android's accuracy; in a phone's browser, the north-referenced orientation events (`deviceorientationabsolute`, an absolute `deviceorientation`, Safari's `webkitCompassHeading` after a tap allows motion), with no accuracy, and the reading marked `via: "browser"`; relative-only events are refused. A position: lead-acid `gnss`, or the browser's geolocation. "measure bedding" (a plane, a joint, a lineation…) shows the reading live and takes the steadiest of the last second; the angles go into the card's args, and bearing's matrix and conversions give dip direction/dip or trend/plunge (14 Oct 2026; bearing's compass.planeFromDeviceOrientation read 180° off until 0.2.4, fixed there 15 Oct and used since). Magnetic, or true with a saved home (WMM, kept in args) | none |
| Position | the lead-acid `gnss` plugin: one fix on a tap ("declination here"), kept in the card; the plugin's background logger, its foreground service and notification are removed from golem's manifest | `ACCESS_FINE_LOCATION` (runtime, asked on the first tap) |
| Voice output | the lead-acid `tts` plugin: the phone's offline voices only. A card's "say" reads what was read and the answer, without sources; "read every answer aloud" is a setting on the device | none |

Default to the user-confirms route: the app then requests no dangerous permission but the microphone and location, each only when voice or a position is first used.

**The intent route.** lead-acid's `intent` plugin (verified on the S24+, 2026) is the route this section asked for: `shell.intent.send(name, fields)` with `name` from a fixed allowlist (`calendar.insert`, `clock.timer`, `clock.alarm`, `map.view`, `dial`, `sendto`, `contact.insert`) and typed fields; the shell builds the intent itself, and the page never passes a raw action string or URI scheme.

**Web fallback.** Outside the shell (`shell.present === false`), a calendar event is offered as an `.ics` file; timers run in the page; the other hand-offs are hidden.

---

## 10. Interface

- **Switchboard 1.3** tokens (`ext/switchboard/switchboard.css`): equipment gray in light, basalt in dark. Barlow for text addressed to the person, Space Mono for anything the machine read or computed. Components read `--au-*` only.
- **An instrument, not a chat.** No bubbles, no avatar, no typing indicator. The stream is a column of readout cards.
- **Card anatomy:** header (card number, rung badge, parent link, time in ms) · the query · "read as" line with slots · answer · open question with options, if any · plan trace, collapsed.
- **Dashed slot** = an ambiguous reading the user can flip. Solid slot = an unambiguous one.
- **Dock:** status line, a row of example chips, the input.
- **Tabs:** Ask, Skills (catalog; examples run on tap), Packs (library, plus device state: taught words, notes, open table).
- **Sessions sidebar:** new session, session list grouped by age, rename and two-step delete, history search. On a wide screen it stays beside the conversation; on a narrow one it is a drawer over it.
- **The off switch.** The top-right control reads *sleep*. Tapping it puts golem to sleep: input disabled, nothing runs, the control reads *wake*. Plain words, no theatre.

---

## 11. Platform

- **Web:** one HTML file, which is the whole app; beside it, for installing only, `sw.js` (from `@gcu/sw`), `manifest.webmanifest` and the icons. Installable as a PWA since 14 Oct 2026.
- **Android:** the same file inside the lead-acid shell, published through the Geoscientific Chaos Union Play organisation account.
- **Capability declaration:** a plain statement in the listing and in the app: zero network in normal use; pack installation from the registry is the one network path and should be explicit and user-initiated. golem is not a sealed build (principle 9); `@gcu/seal` is used, if at all, only to sign a field log on request.
- **Locale:** English first. pt-BR arrives as a locale bank for the grammar and for dispatch, the same way dispatch plans it. Taught words are per device and can be in any language.

---

## 12. golem today

`dist/golem.html` is a working prototype: an app with a session sidebar and a centred conversation on wide screens, and the handset layout (drawer, stream, composer, tabs) on narrow ones. `npm test` drives it through 27 queries.

**Real, computed in the page:** unit conversion with dimension checks; arithmetic by recursive descent (no `eval`); dates; true thickness and the equal-area stereonet; histogram; the Strunk checker (15 patterns from rules 11 to 13 of the 1918 edition); every reading, amendment, taught word, note, session, name and replay.

**Sample data:** `assays.csv` is synthetic (seeded generator, 8 holes, mixed 1 m and 2 m samples). The Factbook is 14 countries with rounded figures. The ODS entry is a hand-made index of 7 terms that gives the chapter and section, not the passage.

**Simulated:** all device hand-offs. The timer counts down in the page.

**Absent:** a statistical dispatcher (rung 4 is the grammar's repair pass, offered), multi-step planning (one declared step per condition today), real packs, pt-BR in the shell.

**Declarations** (since 8 Oct 2026): every tool is one declaration (`tool()` in `src/engine/core.js`) carrying its session-name topic and its catalog row; verb frames (`frame()`), amendment frames (`amend()`) and session frames (`session()`) say how a parsed command becomes a tool call, an amended card or a session action. The Skills tab, session names and the ontology derive from them.

**The clause parser reads everything** (since 13 Oct 2026). `@gcu/dispatch` is vendored under `src/vendor/`; the engine builds the parser from its own ontology and rebuilds it whenever the ontology changes (columns, kept files, saved places, logged activities, recipes). The regex readers and the regex amendments are gone. Arithmetic and ranged estimates are read by their own parsers after the grammar, as the dispatch SPEC keeps them. When the grammar finds several readings, golem binds each and takes the one a tool takes; two readings that bind to the same call are one. The trace says what read the query.

**Fonts** are embedded by the build; the page makes no network request.

**Real tables** (since 8 Oct 2026): the paperclip opens a CSV or TSV; recon types it; table questions and the histogram work on any numeric column; a session keeps the file on the device (under a megabyte) and replays it, or says the file is gone. Sample data is still labelled sample data.

**Engine and shell** (since 8 Oct 2026): `src/engine/` reads and computes with no DOM, returning results as plain blocks (big value, note, key-values, table, list, steps, plot specs, actions); `src/shell/` renders them. The engine runs in Node, and `test/engine.test.mjs` drives it through the smoke queries, replay, slot flips, answers and undo.

### Known defects and shortcuts

- Typed answers to an open question match by label prefix or containment. A typed answer that matches no option falls through to a normal reading and can produce a "no reading" card while the question stays open.
- A word nothing in the lexicon knows is no reading, where the old regex readers took any words and refused inside the card ("working days until yesterdayish", "9am atlantis in perth", "mean of nothing"). Unknown place names still reach the card where the role takes text, so it can ask where the place is.
- `oz` is read as troy in a ratio and avoirdupois otherwise. The slot lets the user flip it, but the default is a heuristic.
- `next friday` means the Friday after the coming one. That is one convention of two.
- The passive-voice pattern is crude and will flag some adjectives.
- Taught words cannot be forgotten. Notes cannot be deleted. Deleting a session leaves its notes and taught words in place.
- Replaying a session re-applies its `teach` cards, and a "no reading" card stays a "no reading" card even if the word was taught later.
- Session names: the 40-character cap drops the second label often. Weights are first guesses.
- The export script uses invented API names (`units.convert`, `bearing.true_thickness`, …). They are placeholders until the real packages decide.

---

## 13. Path from prototype to app

In order. Each step leaves something that runs.

1. **Engine/shell split.** Done 8 Oct 2026: `src/engine/` with structured results, `src/shell/` rendering them, Node tests for the engine and the browser smoke test for the shell.
2. **Tool declarations as data.** Done 8 Oct 2026: `tool()` and `frame()` declarations; the catalog, amendments, session names and the ontology derive from them. The ontology they produce is JSON.
3. **Real grammar.** Done 13 Oct 2026: every tool, amendment and session command is read by clause frames; the regex readers are gone. The grammar gained free-text slots (after a verb, a preposition, a colon; a subject before the verb), dates and clock times, token shapes (one piece or several, case-sensitive where they need it), comparisons, number words, fragments for amendments, exact proper names, and fillers, each with a corpus case (`bench/golem-slots.mjs`, `bench/golem-fragments.mjs`). History, before 13 Oct: the clause parser is vendored and reads first; the regex rules read what it cannot yet. To finish, the grammar needs free-text roles, dates, orientations and amendments through ellipsis (listed in `ext/dispatch/SPEC.md`), then the regex rules go. The parser is now the grammar rung of `@gcu/dispatch` (`ext/dispatch/src/grammar/`). clause reads imperatives, bare phrases and closed questions against an ontology; `ext/dispatch/bench/golem.json` is the starting ontology for golem's register and `ext/dispatch/bench/golem-corpus.mjs` its hand corpus. Still outside the grammar and needing their own reading: free-text arguments (`remember that …`, `check: …`, `X means Y`, event titles), absolute dates and clock times, orientations like `270/60`, and arithmetic (a token-shape check routes it to the expression parser). Amendments (`in feet`, `and chile`) can move into clause's ellipsis machinery.
4. **Rung 4.** Done 14 Oct 2026, differently from the plan. The plan was a statistical dispatcher trained from golem's declarations. It was built (`auditable/ext/dispatch/bench/loose.mjs`: sentences generated from the frames, an intent perceptron and a THEME/ARG tagger on the grammar's tokens, guesses rewritten for the grammar to read; 3.4 s to train) and measured on 31 natural phrasings the grammar misses: it read 1. The grammar's own repair pass, offered rather than trusted, put the right reading first for 13, offered only wrong ones for 1, and drew an offer from 1 of 20 off-topic lines. Rung 4 is that offer (`guess`, `warn`, nothing runs until picked). The statistical model waits for real corrections to train on. Also on 14 Oct: the composer shows the reading as you type (`preview()`, dry) and completions from the grammar (`completions()`).
5. **Real packages under the tools.** Done 14 Oct 2026 for the arithmetic. `test/oracle.test.mjs` checks golem against the sibling clone. `bearing` and `sadpan` (8 Oct) and `units` (14 Oct) are vendored and in use under the field, table and conversion tools; `recon` types every table and `librarian` serves document search. For `units`, the package was brought up to golem's needs first (auditable 8837da6e): exact factors where a definition makes them so, troy and avoirdupois ounces, pressure, time, temperature (affine), miles, yards, acres, square miles, gallons, barrels, and a `core` module that runs from source. golem's conversion table now keeps only the words people type, with the package's factors, and the oracle holds the two to 1e-12; the sample-mass card keeps its exact arithmetic over the package's DCDMA table, since `core.sampleMass` rounds to 0.1 cm³ per metre. Still open: definitions read through `librarian` from installed packs (step 8; the card is a locator today). The histogram and estimate cards are drawn by `@gcu/plot` in the page since 14 Oct 2026 (the card keeps plain data; the shell draws it in the theme's colours).
6. **Planner.** Preconditions and effects on the declarations; replace `needData()` and the key's hand-coded questions. Preconditions are declared (`pre`, `condition()`, 8 Oct 2026). Requests in steps, 14 Oct 2026: "open assays.csv then mean cu by lith" runs as its steps (`stepsOf`/`chain` in engine.js), each read after the one before ran, so a later step reads what an earlier one opened; cut at "then" ("and then", "depois", "em seguida") only when the grammar read a sequence, or the whole does not read as one command, or every step reads alone (a payload that says "then" stays whole); a step that does not read or asks a question stops the chain on its card; the preview names the steps. Effects, 15 Oct 2026: `post` and `effects` on the declarations, and the plan checked before it runs (section 5). Still open: a payload that swallows "then" ("log 5 km run then write me a poem" is one log entry, by the rule that keeps payloads whole).
7. **Real files.** Begun 8 Oct 2026: a CSV or TSV through the file picker (the lead-acid shell routes `<input type=file>` to the system picker), typed by `@gcu/recon`, with table questions in controlled English (conditions are the grammar's since 14 Oct 2026) (`SPEC-skills` A2: aggregates, where, by, length weighting, a below-detection policy, counts, lists, distinct values, correlation, interval checks) and the file's columns as parser nouns. `.dm`, xlsx and Parquet followed (8 and 11 Oct 2026). Files over 20 MB, done 14 Oct 2026: a CSV or TSV that large opens as a stream (`src/engine/stream.js`). recon types it from its first megabyte; each question scans the whole file as a job through `@gcu/sluice`'s accumulators (only those are vendored: its runner builds expressions with `new Function`), means and sums weighted as for any table, medians and percentiles from a t-digest, approximate and counted by sample, and said so; histograms in two passes. The file is kept as a Blob in an IndexedDB store of its own, so a reload can scan it again. Row lists, sorting, correlation, interval checks, skills on every row and export refuse on a stream instead of answering from the head; a file that quotes its delimiter is not streamed. Building it found a stack overflow in the length-weighted statistics of any table of a few hundred thousand rows, fixed. Tested by `test/stream.test.mjs` (the same table whole and streamed) and `test/large.mjs` (a 27 MB file in a browser, across a reload).
8. **Packs.** Install from a registry, define the `golem` facet, build it for `factbook`, `ods` and `elements-of-style`.
    - **The book packs** (done 14 Oct 2026), by the same path: `ods` and `elements-of-style` install from the library or from a `.gcudat` file, and are compiled at install into what golem uses (`compileOds`, `compileStrunk` in `src/engine/packs.js`; only the index is kept). Open Data Structures becomes a term index of about 190 terms (where the book sets a term in italics in a defining paragraph, chapter titles, and the structures named in section headings), each with its defining paragraph, chapter and section; the definition card shows the passage. The Elements of Style becomes its rules (as the 1918 edition numbers them), the phrase tables of its rules (needless words, positive form) and the entries of chapter V ("words and expressions commonly misused", shown as "the book says"), each find citing rule or entry; the active voice stays golem's own reading, citing rule 10. The samples still answer until a pack is installed (the sample checker had cited the active voice as rule 11 and positive form as 12; the book numbers them 10 and 11, now corrected). The reader opens the book, not a section: it takes no section parameter yet. Tested by `test/books.test.mjs` and `test/packs.mjs`.
    - **The full Factbook** (asked for and done on 14 Oct 2026), in place of the rounded 14-country sample. Built as below, in `src/engine/factbook.js` (the data in use, names, fields, lists), `src/engine/packs.js` (the `.gcudat` reader: the platform's gunzip and a small ustar reader) and the shell (install, remove, keep). Tested by `test/factbook.test.mjs` (the pack from the sibling clone, field by field) and `test/packs.mjs` (install from the library with the checksum, a reload, removal, a file, a tampered download), with the list and filter forms in the phrasings test. The grammar gained multipliers ("100 million") and "which X <arguments>" questions for it. The source is gcu-library's `factbook` pack (CC0, version 1.1.0, 2.8 MB as `.gcudat`): 254 countries and entities with region, ISO code, capital, government, area, population, GDP (PPP), coordinates and a background paragraph. Its expansion `factbook-full` (2.3 MB) carries the complete profiles, which is where "landlocked" (a coastline of 0 km), languages, elevation and the rest come from.
    - **Words.** Every name becomes an exact country noun, plus the aliases people use (USA, UK, DRC, names without accents). Portuguese names, and English ones the pack lacks, come from the browser's `Intl.DisplayNames` over the ISO code, so no name table ships. Regions are nouns too ("countries in south america"). The parser is rebuilt with 254 more nouns; measure the rebuild and the preview's per-keystroke time before and after.
    - **Questions.** Lookups for every field, with units through `@gcu/units` (area in square miles, density in people per km² or per square mile), derived fields (density, GDP per head), lists and rankings ("the 5 largest countries in africa by area"), and filters through the grammar's conditions ("countries with population above 100 million and area below 500000 km2"). The background is a passage card that says where it comes from. (The pack's coordinates are each country's centre, not its capital's, so they answer "where is", not distances between capitals.)
    - **Labels.** Cards cite the pack, its version and its attribution, and drop "a rounded 14-country sample". Figures are the Factbook's as published; derived ones say how they were derived.
    - **Arrival.** Installing the pack is the one network path, user-initiated (principle 6): from the registry, or from a `.gcudat` file picked on the device. It is kept on the device (in `@gcu/vfs` after step 9, `localStorage` cannot hold it). Until it is installed, the sample stays and says so. It is not bundled (open decision 11, decided 14 Oct 2026).
    - **Test.** The oracle test reads the pack from the sibling gcu-library clone and checks golem's answers for a handful of countries field by field; the phrasings test gains the list and filter forms.
9. **Session store** on `@gcu/vfs`; export and import a session as a file. Done 14 Oct 2026. The shell keeps golem in `@gcu/vfs` over IndexedDB (`src/shell/store.js`): one file per session, one per opened file (no size cap but the browser's), the device state and a meta file; only what changed is written. Each change also goes, synchronously, to a small journal in `localStorage` (the session in use and the device state), applied on load when it is newer than IndexedDB, so a tab closed mid-write loses nothing. The state the earlier builds kept in `localStorage` moves in once. Without IndexedDB the whole state stays in `localStorage` as before; without either, nothing is kept and the page says so. A session exports from the drawer as `<name>.golem.json` with the files its cards read, and the paperclip opens one as a new session. `test/storage.mjs` checks the move, a reload, the journal and the round trip in a browser.
10. **lead-acid.** The intent route in the shell; the web fallback in the page. The page side done 14 Oct 2026: the event, timer and alarm cards carry their hand-off as an allowlisted intent with typed fields (`calendar.insert` with title and local begin and end, or all day; `clock.timer` with seconds; `clock.alarm` with hour and minutes), and inside the shell the button sends it through `shell.intent.send` (the shim re-vendored with it); the other app opens for the person to confirm, and nothing comes back. A phone with no app for it, or a field the shell refuses, says so. In a browser the cards say what the phone would do, and the event saves or copies a `.ics`. `test/leadacid.mjs` runs golem under lead-acid's desktop bench, which validates each intent against the plugin's schema and records it. golem as an app, 14 Oct 2026: lead-acid became a package (`@gcu/lead-acid`: core and plugins as sources, the template, and a command that writes `android/` into the app's own repo, as Capacitor does), and golem's `android/` is the first project made that way (`lead-acid.json`: `org.gentropic.golem`, the `intent` plugin). In the app golem registers no service worker, offers packs through the paperclip (the app has no network permission), and saves files to Downloads through `shell.publish` (a WebView drops downloads); `test/leadacid.mjs` checks all three under the bench. The debug APK builds. The app icon is golem's mark, drawn by the build from the same definition as the PWA's icons (an adaptive icon with a monochrome layer for themed icons). Still to do: install it on a phone and try the hand-offs there.
11. **PWA.** Asked for and done on 14 Oct 2026: the web build installable, and working offline after the first visit. `test/pwa.mjs` serves `dist/` on localhost and checks the manifest, the worker taking control, an offline reload that answers with no request reaching the server, an update that waits for "Check for updates", and the New session shortcut. What was built, by the plan below: the build draws the icons and writes `manifest.webmanifest` and `sw.js` (`@gcu/sw` vendored under `src/vendor/sw/`, `autoCheck: false`); the page registers it through `registerGcuSw`; the header's request counter is real. One change from the plan: `sw.js` is the same file from build to build (its cache name is fixed, `golem-shell-v1`), because browsers re-read `sw.js` on their own about once a day, and a worker that changed with every build would update golem without asking.
    - **Files.** `dist/golem.html` stays the whole app (principle 8). Beside it the build emits only what installing needs: `manifest.webmanifest`, `sw.js` and the icons. Opening `golem.html` from disk keeps working with none of them; registration is skipped where there is no service worker (`file://`).
    - **Service worker.** Generated by `@gcu/sw` (`makeSw`), precaching `golem.html`, the manifest and the icons, cache-first, with no other routes. The cache name carries the build's hash. Registered by `@gcu/sw`'s `registerGcuSw`, vendored, with `persist: true` so the browser keeps sessions, files and taught words.
    - **Manifest.** `display: standalone`; name, short name and description from the capability statement; `theme_color` and `background_color` from the Switchboard tokens, light and dark; a "New session" shortcut. Icons (192, 512 and maskable) drawn from the mark at build time, not committed as binaries we did not make.
    - **Updates.** `@gcu/sw` checks for a new shell over the network, and principle 6 allows no requests in normal use. Proposal: no automatic checks; "Check for updates" under Packs and this device; when a new shell is found, a toast and a coordinated reload of every tab; the request counter in the header counts the check. Open decision 10.
    - **Later, if wanted.** `file_handlers` (a CSV or .dm opened with golem on the desktop), `share_target` (text shared into the composer), both read on the device like any file.
    - **Storage.** Sessions, files and taught words live in `localStorage` today; step 9 moves them to `@gcu/vfs`, which an installed app benefits from most. The PWA does not wait for it.
    - **Test.** The smoke test serves `dist/` over `http://localhost`, checks the manifest, waits for the worker, goes offline (`context.setOffline(true)`), reloads, and expects the app to load and answer with no requests.
    - **Android.** lead-acid stays the path to device intents (calendar, alarms, sensors); the PWA is the web path, and both carry the same `golem.html`.
12. **Release.** Licence attributions, the capability statement, store listing. (Fonts are embedded since 8 Oct 2026; no seal artifacts, see principle 9.) Portuguese, begun 14 Oct 2026: golem reads pt-BR and English, the person's language first (the other only as written, never through its typo repairs); dates, units, geologic units, places and accented country names read in Portuguese; the interface (`shell/i18n.js`: the page, the sidebar, the composer, the cards' frame, the messages, the About view, the starters) is in Portuguese for a pt browser or by the switch in the sidebar. Still English: what the tools answer (the card bodies, about 50 tools), the skills' descriptions and the session names they compute. Decimal commas ("2,7") need the pt locale of `@gcu/dispatch`.

---

## 14. Open decisions

1. **Name.** golem, navigator, or something else. Check that `@gcu/golem` and the Play listing name are free.
2. **Where the code lives.** Its own repo consuming `@gcu/*` packages, or `ext/golem` in the auditable monorepo.
3. **Is an LLM allowed at build time?** For authoring grammar corpora, pack facets and paraphrase banks. Runtime stays model-free either way; this decides how packs are made and how the "no LLM" claim is worded.
4. **clause and dispatch: one package or two?** Decided 8 Oct 2026: one package. The grammar is a rung of `@gcu/dispatch`, under `ext/dispatch/src/grammar/`.
5. **Output English.** Answers are currently hand-written templates. A controlled output grammar would make them uniform, and gin was the intended basis, but gin does not exist yet, so nothing here depends on it.
6. **Calendar default.** User-confirms (no permission) is specified. Decide whether silent insert is ever offered.
7. **Statistical-rung badge and threshold.** Decided 14 Oct 2026: a reading golem was not sure of is marked `guess` in `warn` and runs only when picked; the threshold question went away with the statistical model (the repair pass's budget, 3, is the gate).
8. **First-release scope.** Which groups from section 6 ship first. The Compute, Field and Device groups work without any file handling.
9. **Pack licences.** Every proposed pack in section 7.
10. **Update checks in the PWA.** Decided 14 Oct 2026: manual only. "Check for updates" (Packs and this device) is one request, counted in the header; a new golem waits for "Reload to the new golem". The browser's own daily re-read of `sw.js` is the one request golem cannot switch off; it carries nothing of the person's and, since `sw.js` does not change between builds, changes nothing.
11. **The Factbook in the build.** Decided 14 Oct 2026: installed on request, not bundled. The page stays as it is; the pack is one user-initiated download (or a `.gcudat` file picked on the device), kept on the device; until then the sample answers and says so.


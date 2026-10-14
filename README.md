# golem

An assistant with no model at runtime. You type a request; golem shows what it read, computes the answer with a tool, and keeps the plan. When it cannot read a request it says so.

This repository holds the specification and a working prototype.

- **[SPEC.md](SPEC.md)** is the design: principles, the reading ladder, contracts, skills, packs, sessions, Android hand-offs, what golem does today and does not do, and the open decisions.
- **`dist/golem.html`** is golem. Open it in a browser; it needs no server and no install.

## Try it

Open `dist/golem.html`, then:

- Tap the dashed `045/30 as dip direction/dip` slot on the thickness card. The reading flips to strike/dip and the answer recomputes.
- Run `pop of mongolia`. It has no reading and offers `pop means population`. Tap that, then run `pop of mongolia` again.
- Type `why` after any card, or `export as script`.
- Open the menu (top left) for sessions and history search.
- Ask `how old is the permian`, `what period is 250 ma`, `stages of the triassic`: the ICS chart, 171 units, CC BY 4.0 via Macrostrat.
- With a table open, try `true thickness of every intercept with hole 270/60, bedding 045/30` or `apparent dip of each plane on a section at 090`.
- Open an `.xlsx`, a Parquet file or a Datamine `.dm` with the paperclip: it is converted once, kept, and every table question works on it. `the table as parquet` writes it back out.
- After a session you want again, `save this as a recipe called cu check`, say which subjects change, then `run cu check for au` (a new session) or `run cu check on every table`.
- Open Markdown, text or HTML notes with the paperclip, then `find resurvey in my documents` or `where did i write about core loss`: passages come back as written, with where they are.
- Open a `.dxf` and it becomes GeoJSON or WKT; paste `json to yaml: {…}` or `wkt to geojson: POINT (30 10)` for the rest.
- Try `home is -19.92, -43.94`, `distance from home to -6.07,-50.16`, `-19.92, -43.94 in utm`, `sunrise tomorrow in home`, `moon phase on 25 dec`.
- Try `log 5 km run yesterday`, `how many km did i run this month`, `mean weight by week`, `open the log` then `count by activity`.
- Try `help me decide between perth, vancouver and santiago` (it asks for criteria, weights and scores), `cutoff grade for copper at 9000 usd/t, 88% recovery, processing 14 usd/t, g&a 3 usd/t`, `cueq of 0.8% cu and 0.3 g/t au at 9000 usd/t and 2300 usd/oz`.
- Try `word count: …`, `summarise this: …` (six sentences or more), `diff these:` with the two blocks on the lines below separated by `---`.
- Try `molar mass of CuFeS2`, `fe to fe2o3`, `convert 45.2% fe2o3 to fe`, `how much cu in CuFeS2`, `element 26`.
- Try `2.6 to 2.9 t/m3 * 1.2 to 1.5 Mm3`, `(120 to 180) * (0.4 to 0.6) / 7`, `2.7 ± 0.1 t/m3 * 1.35 Mm3`.
- Try `is 21 apr 2027 a working day`, `working days until 20 dec`, `14 on 14 off from 6 oct, am i off at christmas`, `9am sao paulo in perth`, `when is easter 2027`.
- Try `run this: print(sum(range(10)))`, numpy (`import numpy as np`), or a figure (`python`, then `import matplotlib.pyplot as plt`, `plt.plot([1, 4, 9])`, `plt.show()` on the lines below), or paste several lines after `python` on the first line; `trace it` adds a step table.
- Try `sha256: abc`, `base64 decode: SGVsbG8=`, `the table as json` (it asks to open one first).
- Try `explain cron: 0 9 * * 1-5`, `what is 1700000000`, `chmod 754`, `explain regex: ^\d{3}-\d{2}$`.
- Try `mass of 1 m of nq core at 2.7`, `200 mesh in microns`, `rqd of 12, 8, 25, 4, 31 and 9 cm in a 100 cm run`.
- Try `apparent dip of 000/30 on a section at 045`, `intersection of 090/45 and 270/45`, `core alpha 40 beta 230 in hole 270/60`, `declination at -19.92, -43.94`.
- Tap the paperclip and open a CSV of your own. `mean cu by lith where au > 0.1`, `how many rows where cu > 1`, `top 5 rows sorted by au descending`, `check intervals`, `histogram of fe`: the column names come from the file.
- Tap *sleep* (top right) to put golem to sleep; nothing runs until you tap *wake*.

The Skills tab lists everything that runs, with examples. Each skill is one declaration in `src/engine/`: the tool, the clause frames that read it and amend it, what it contributes to a session name, and the verb frame the clause parser reads it by.

## Build and test

```sh
npm install        # only needed for the test (Playwright)
npm run build        # src/shell/index.html + the modules → dist/golem.html
npm run test:engine  # the engine alone, in Node: the 27 queries, replay, slots, answers, undo, and the
                     # oracle tests against the GCU packages in a sibling auditable clone (skipped if absent)
npm test             # build, engine tests, then drive the page through the same 27 queries
```

The build is concatenation: `src/shell/index.html` with the two typefaces embedded, then the shell, engine and vendored modules in import order inside one `<script>`. Each module's text goes in verbatim inside a function, so its private names stay private; the function returns its exports as an object, and a module that imports names reads them from that object (with `as` aliases if it wants them), so two modules may export the same name. No bundler, no transforms of the code. The build refuses import cycles, an import the other module does not export, and the module syntax the wrapping cannot carry. It also writes `dist/golem.json`, the parser ontology the engine derives from its tool declarations. The built page makes no network request; the one external link is the library reader, opened on tap.

If Playwright has no browser installed, run `npx playwright install chromium` or point `CHROMIUM_PATH` at one.

## Layout

```
SPEC.md                      the specification
build.mjs                    the build: modules concatenated in import order
src/engine/                  no DOM, no storage: everything that reads and computes
  core.js                    working state, the tool table, declarations, helpers
  units.js calc.js dates.js  compute tools
  orientation.js table.js    true thickness and the stereonet; the open table (a file through recon, or the sample), histogram, table questions
  structure.js geo.js        apparent dip, three-point, intersection, rake, oriented core, Fisher mean; declination from wmm
  sample.js timescale.js     core and sample arithmetic; the ICS timescale (data/timescale.js)
  explain.js                 explainers: cron, epoch time, chmod, URL, regex, each with its own parser
  convert.js                 SHA-256, base64/hex/URL encoding, the open table as CSV, TSV or JSON
  calendar.js                working days and rosters over the vendored plan calendar; time zones through Intl
  estimate.js                arithmetic over ranges by simulation, units carried through, the seed in args
  chem.js                    formulas parsed; molar mass, oxide factors, fractions over data/elements.js (IUPAC weights)
  text.js                    payloads after a colon or the first line: word count and readability, TextRank sentences, Myers diff
  python.js                  Python by adder: a pending card, a job, the result kept and the card recomputed
  apply.js                   a skill on every row of the table, columns bound by name, constants for the rest
  formats.js                 xlsx, .dm and Parquet converted to text per table at open time (sheet, dm, parquet vendored)
  recipes.js                 recipes: steps as card specs, subjects, bindings, a run stopped where a step no longer reads, batch
  docs.js                    documents kept on the device, passages by heading and paragraph, librarian search (vendored)
  interchange.js             YAML ↔ JSON (strict subset), WKT ↔ GeoJSON, DXF → GeoJSON or WKT (yaml, wkt, dxf vendored)
  places.js sky.js           saved places, Vincenty distance, Krüger UTM; NOAA sun times, mean-cycle moon phase
  log.js                     the log: a device table written from cards, asked in plain words, opened as the table
  forms.js econ.js           the form card (questions asked in turn, answers as slots) and the decision matrix; Gy, cutoff, NSR, equivalents
  knowledge.js device.js     packs sample, device hand-offs
  notes.js skills.js         notes and taught words; the skills and packs catalog
  reading.js                 the reading ladder: context, grammar (clause, then the rules), taught; none, why, export
  ontology.js                the clause ontology, assembled from units, sample packs and frames
  sessions.js                sessions, replay, auto-naming, serialize and hydrate
  engine.js                  submit, rerun, slot flips, answers, undo
  index.js                   the surface Node tests import
src/vendor/                  copies, never edited here: @gcu/dispatch (the parser), @gcu/bearing, @gcu/sadpan, @gcu/recon, @gcu/sift, @gcu/wmm, @gcu/units (tables only), @gcu/plan (calendar and holidays only), @gcu/sheet, @gcu/dm, @gcu/ipynb (its substitution table), @gcu/adder, @gcu/natra with @gcu/atra and alpack, @gcu/scitra, @gcu/line, @gcu/learn (with @gcu/mimic-io), @gcu/plot and their adder bridges (inside the Python worker only, assembled by `pyWorkerSource()` in build.mjs), the lead-acid shim
src/shell/                   the browser: markup, rendering, wiring, storage
  index.html                 markup, Switchboard tokens, styles, the about page
  fonts/                     Barlow and Space Mono (OFL), embedded by the build
  render.js                  blocks and plots to markup
  main.js                    sidebar (a drawer when narrow), views, theme, storage, the sleep switch
test/engine.test.mjs         engine tests, Node only
test/files.test.mjs          a real CSV: recon typing, table questions, table nouns, replay (fixture in test/fixtures/)
test/structure.test.mjs      the structural geometry and declination checks from the skills spec
test/timescale.test.mjs      the timescale pack: the chart's consistency and the spec's checks
test/sample.test.mjs         core and sample arithmetic checks
test/explain.test.mjs        the explainers: the spec's checks and the parsers' edges
test/convert.test.mjs        hashes against known digests, encodings both ways, the table written out
test/calendar.test.mjs       working days, rosters and time zones on a pinned clock
test/estimate.test.mjs       ranges: the 3.7125 Mt check, units, refusals, replay by seed
test/chem.test.mjs           the elements table is whole; CuFeS2, Fe→Fe2O3, Cu→CuO; hydrates, brackets, refusals
test/text.test.mjs           counts and Flesch, TextRank order, Myers edits, the payload rule
test/forms.test.mjs          the decision matrix end to end, and the formulas with their terms asked
test/log.test.mjs            the log: rows, corrections, undo, replay, questions, opened as a table
test/python.test.mjs         the page's own worker text in a fresh context per run: output, errors, budget, sandbox, scipy and pandas, trace, replay
test/apply.test.mjs          thickness and apparent dip over every row, against the single-value tools
test/formats.test.mjs        xlsx (written by the vendored sheet) and the .dm fixture through openBinary, replay, the sheet slot
test/recipes.test.mjs        save and the subjects asked, run into a new session, the stop rule, a new table bound, batch
test/docs.test.mjs           passages from Markdown and HTML, search with marks, near spellings, the passage card, replay
test/interchange.test.mjs    YAML and JSON both ways, the strict-subset refusal, WKT and GeoJSON, the DXF fixture, Parquet out and back in
test/places.test.mjs         Vincenty against the Geoscience Australia test line, UTM round trips and the meridian arc, sun and moon
test/oracle.test.mjs         golem's arithmetic against the GCU packages it does not vendor
test/smoke.mjs               browser smoke test on the built file
dist/golem.html              the built app (committed, so it opens without a build)
```

## Status

A working prototype. The reading and the tools are real; the packs are small samples, the table is synthetic sample data, and the Android hand-offs are simulated. SPEC.md section 12 has the full list, and section 13 the path to an app.

## Licence

MIT. Change it before the first commit if GCU wants something else for this one.

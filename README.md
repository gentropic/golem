# golem

An assistant with no model at runtime. You type a request; golem shows what it read, computes the answer with a tool, and keeps the plan. When it cannot read a request it says so.

This repository holds the specification and a working mock.

- **[SPEC.md](SPEC.md)** is the design: principles, the reading ladder, contracts, skills, packs, sessions, Android hand-offs, what the mock does and does not do, and the open decisions.
- **`dist/golem.html`** is the mock. Open it in a browser; it needs no server and no install.

## Try it

Open `dist/golem.html`, then:

- Tap the dashed `045/30 as dip direction/dip` slot on the thickness card. The reading flips to strike/dip and the answer recomputes.
- Run `pop of mongolia`. It has no reading and offers `pop means population`. Tap that, then run `pop of mongolia` again.
- Type `why` after any card, or `export as script`.
- Open the menu (top left) for sessions and history search.
- Ask `how old is the permian`, `what period is 250 ma`, `stages of the triassic`: the ICS chart, 171 units, CC BY 4.0 via Macrostrat.
- Try `2.6 to 2.9 t/m3 * 1.2 to 1.5 Mm3`, `(120 to 180) * (0.4 to 0.6) / 7`, `2.7 ± 0.1 t/m3 * 1.35 Mm3`.
- Try `is 21 apr 2027 a working day`, `working days until 20 dec`, `14 on 14 off from 6 oct, am i off at christmas`, `9am sao paulo in perth`, `when is easter 2027`.
- Try `sha256: abc`, `base64 decode: SGVsbG8=`, `the table as json` (it asks to open one first).
- Try `explain cron: 0 9 * * 1-5`, `what is 1700000000`, `chmod 754`, `explain regex: ^\d{3}-\d{2}$`.
- Try `mass of 1 m of nq core at 2.7`, `200 mesh in microns`, `rqd of 12, 8, 25, 4, 31 and 9 cm in a 100 cm run`.
- Try `apparent dip of 000/30 on a section at 045`, `intersection of 090/45 and 270/45`, `core alpha 40 beta 230 in hole 270/60`, `declination at -19.92, -43.94`.
- Tap the paperclip and open a CSV of your own. `mean cu by lith where au > 0.1`, `how many rows where cu > 1`, `top 5 rows sorted by au descending`, `check intervals`, `histogram of fe`: the column names come from the file.
- Tap *sleep* (top right) to put golem to sleep; nothing runs until you tap *wake*.

The Skills tab lists everything that runs, with examples. Each skill is one declaration in `src/engine/`: the tool, the rule that reads it, the phrases that amend it, what it contributes to a session name, and the verb frame the clause parser reads it by.

## Build and test

```sh
npm install        # only needed for the test (Playwright)
npm run build        # src/shell/index.html + the modules → dist/golem.html
npm run test:engine  # the engine alone, in Node: the 27 queries, replay, slots, answers, undo, and the
                     # oracle tests against the GCU packages in a sibling auditable clone (skipped if absent)
npm test             # build, engine tests, then drive the page through the same 27 queries
```

The build is concatenation: `src/shell/index.html` with the two typefaces embedded, then the shell, engine and vendored modules in import order inside one `<script>`. Each module's text goes in verbatim inside a function, so its private names stay private, and its exports become plain declarations the later modules see. No bundler, no transforms of the code. The build refuses import cycles, an export declared twice, and the module syntax the wrapping cannot carry. It also writes `dist/golem.json`, the parser ontology the engine derives from its tool declarations. The built page makes no network request; the one external link is the library reader, opened on tap.

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
  knowledge.js device.js     packs sample, device hand-offs
  notes.js skills.js         notes and taught words; the skills and packs catalog
  reading.js                 the reading ladder: context, grammar (clause, then the rules), taught; none, why, export
  ontology.js                the clause ontology, assembled from units, sample packs and frames
  sessions.js                sessions, replay, auto-naming, serialize and hydrate
  engine.js                  submit, rerun, slot flips, answers, undo
  index.js                   the surface Node tests import
src/vendor/                  copies, never edited here: @gcu/dispatch (the parser), @gcu/bearing, @gcu/sadpan, @gcu/recon, @gcu/sift, @gcu/wmm, @gcu/units (tables only), @gcu/plan (calendar and holidays only), the lead-acid shim
src/shell/                   the browser: markup, rendering, wiring, storage
  index.html                 markup, Switchboard tokens, styles, bench notes
  fonts/                     Barlow and Space Mono (OFL), embedded by the build
  render.js                  blocks and plots to markup
  main.js                    tabs, drawer, storage, the sleep switch
test/engine.test.mjs         engine tests, Node only
test/files.test.mjs          a real CSV: recon typing, table questions, table nouns, replay (fixture in test/fixtures/)
test/structure.test.mjs      the structural geometry and declination checks from the skills spec
test/timescale.test.mjs      the timescale pack: the chart's consistency and the spec's checks
test/sample.test.mjs         core and sample arithmetic checks
test/explain.test.mjs        the explainers: the spec's checks and the parsers' edges
test/convert.test.mjs        hashes against known digests, encodings both ways, the table written out
test/calendar.test.mjs       working days, rosters and time zones on a pinned clock
test/estimate.test.mjs       ranges: the 3.7125 Mt check, units, refusals, replay by seed
test/oracle.test.mjs         golem's arithmetic against the GCU packages it does not vendor
test/smoke.mjs               browser smoke test on the built file
dist/golem.html              the built mock (committed, so it opens without a build)
```

## Status

A mock. The engine is real but small, the data is sample data, and the Android hand-offs are simulated. SPEC.md section 12 has the full list, and section 13 the path to an app.

## Licence

MIT. Change it before the first commit if GCU wants something else for this one.

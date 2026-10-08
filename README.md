# golem

An assistant with no model at runtime. You type a request; golem shows what it read, computes the answer with a tool, and keeps the plan. When it cannot read a request it says so.

This repository holds the specification and a working mock.

- **[SPEC.md](SPEC.md)** is the design: principles, the reading ladder, contracts, skills, packs, sessions, Android hand-offs, what the mock does and does not do, and the open decisions.
- **`dist/golem.html`** is the mock. Open it in a browser; it needs no server and no install.

## Try it

Open `dist/golem.html`, then:

- Tap the dashed `045/30 as dip direction/dip` slot on the thickness card. The reading flips to strike/dip and the answer recomputes.
- Run `vario of cu`. It has no reading and offers `vario means variogram`. Tap that, then run `vario of cu` again and answer its questions.
- Type `why` after any card, or `export as script`.
- Open the menu (top left) for sessions and history search.
- Tap *sleep* (top right) to put golem to sleep; nothing runs until you tap *wake*.

The Skills tab lists everything that runs, with examples.

## Build and test

```sh
npm install        # only needed for the test (Playwright)
npm run build      # src/* → dist/golem.html
npm test           # build, then drive the page through 27 queries
```

The build is concatenation: `src/00-shell.html`, then every `src/*.js` in name order inside one `<script>`. No bundler, no transforms.

If Playwright has no browser installed, run `npx playwright install chromium` or point `CHROMIUM_PATH` at one.

## Layout

```
SPEC.md                      the specification
build.mjs                    the build
src/00-shell.html            markup, Switchboard tokens, styles, bench notes
src/10-core.js               utilities, units, arithmetic, dates
src/20-field-table.js        true thickness, stereonet, synthetic table, histogram, variogram
src/30-knowledge-device.js   records, minerals and key, definitions, style check, device hand-offs, notes
src/40-read-render.js        skills and packs catalog, the reading ladder, cards, tabs, wiring
src/50-sessions.js           sessions, replay, auto-naming, menu drawer, storage, start-up
test/smoke.mjs               browser smoke test
dist/golem.html              the built mock (committed, so it opens without a build)
```

## Status

A mock. The engine is real but small, the data is sample data, and the Android hand-offs are simulated. SPEC.md section 12 has the full list, and section 13 the path to an app.

## Licence

MIT. Change it before the first commit if GCU wants something else for this one.

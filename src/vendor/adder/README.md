# @gcu/adder, the four modules behind `run()`

Copied unedited from `../auditable/ext/adder/src/` at auditable commit 7c0babe5 (9 Oct 2026): `parse.js`, `builtins.js`, `eval.js`, `runner.js`. MIT.

Why the source and not `ext/adder/index.js`: the single-file bundle is the notebook cell-type build and does not carry `run`, `evalExpr` or the sandbox options; those live in `runner.js`, which is the npm entry. golem's build assembles these four files for the Python worker the same way adder's own `build.js` does (strip module syntax, concatenate in import order), and the Node tests import them directly as ES modules.

The engine never imports them: Python runs in a Web Worker in the page and in-process in the tests, through `setRunner('python', …)`.

Re-vendor by copying the four files again. If adder's bundle later carries `run`, this folder can become a plain copy of `index.js`.

// ⚠ VENDORED — DO NOT EDIT. @gcu/ipynb, copied from ../auditable/ext/ipynb/index.js (MIT). golem uses importNotebook
// for its import-substitution table only (numpy → natra, pandas → sadpan, …). Re-vendor by copying that file here.

// @gcu/ipynb — Jupyter .ipynb bridge (import + export with substitution)
// Auto-generated from ext/ipynb/src/ — do not edit directly

// -- substitutions.js --

// Import-rewrite table and Python source rewriter.
//
// Maps Python scientific-stack package names to their @gcu/* equivalents.
// The rewriter recognizes four Python import shapes and rewrites the
// PACKAGE part only; the `as alias` and the imported-names list are
// preserved verbatim so user code continues to use `np`, `pd`, `plt`
// without further changes.
//
// Shapes handled:
//   import X                       →  import Y
//   import X as alias              →  import Y as alias
//   import X.sub (as alias)?       →  import Y.sub (as alias)?   (when X is in table)
//                                  →  import V (as alias)?       (when X.sub is in table — e.g. matplotlib.pyplot)
//   from X import a, b             →  from Y import a, b
//   from X.sub import a            →  from Y.sub import a        (when X is in table)
//                                  →  from V import a            (when X.sub is in table)
//
// Comma-separated `import X, Y` is split and each segment rewritten
// independently. Unknown packages pass through unchanged — the runtime
// will raise ModuleNotFoundError, which is the honest signal for "this
// dependency isn't in the GCU stack yet."

const SUBSTITUTIONS = {
  // Numerical core. natra is ndarray-by-design — has array(), elementwise
  // ops, broadcasting, axis reductions. line lacks the ergonomic ndarray
  // surface (see ROADMAP "line adder adapter that covers numpy basics").
  'numpy': 'natra',

  // DataFrames. sadpan is the auditable-side pandas equivalent.
  'pandas': 'sadpan',

  // Scientific routines. scitra is pandas-shaped (scipy.shaped, actually).
  'scipy': 'scitra',

  // sklearn → learn. The estimator API contract matches.
  'sklearn': 'learn',

  // Plotting. matplotlib.pyplot is the entry point users actually call
  // (`plt.plot(...)`, `plt.show()`); we map the full dotted form, not
  // bare 'matplotlib'. @gcu/plot registers under the name `plt` in
  // adder's extension table, so we map directly to `plt`. After the
  // `as plt` alias is preserved, `import matplotlib.pyplot as plt`
  // becomes `import plt as plt` (effectively `import plt`), giving the
  // user the same `plt.plot(...)` handle they'd write in Jupyter.
  'matplotlib.pyplot': 'plt',
};

// Rewrite all import lines in a Python source string. Returns the
// rewritten source plus a list of {original, rewritten, type} records
// for any substitution that fired (used by callers that want to surface
// the rewrites — e.g. a banner cell on import).
//
// Side effect: when an `import matplotlib.pyplot` line is rewritten,
// we append `plt.style.use('default')` on the next line — matching the
// indent of the import. Notebook authors saw matplotlib's light palette
// in Jupyter; this opts the .ipynb-loaded notebook into that palette
// without changing the auditable-native dark default for cells that
// don't import matplotlib. The injection only fires when the rewrite
// actually mapped `matplotlib.pyplot` → `plt`, so a notebook that uses
// our @gcu/plot directly stays on whatever palette is current.
function rewriteImports(source) {
  const lines = source.split('\n');
  const rewrites = [];
  const out = [];
  for (const line of lines) {
    const { rewritten, applied } = rewriteImportLine(line);
    out.push(rewritten);
    if (applied) rewrites.push(...applied);
    if (applied && applied.some(a => a.original === 'matplotlib.pyplot')) {
      const indentMatch = rewritten.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      // Sentinel comment lets the inverse pass strip this line cleanly
      // on .ipynb export, so the round-trip doesn't leak our injection
      // into the user's source. The user can delete the comment if they
      // want the line preserved as their own style call.
      out.push(`${indent}plt.style.use('default')  # auditable: ipynb-theme-inject`);
    }
  }
  return { source: out.join('\n'), rewrites };
}

// Single-line rewriter. Handles `from X import …` and `import X[, X2]`
// shapes; preserves indentation and trailing comments.
function rewriteImportLine(line) {
  // Preserve leading whitespace (so `    import numpy` inside a function
  // stays at the same indent).
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  const body = line.slice(indent.length);

  // Capture trailing comment for round-trip preservation.
  // We don't honor `#` inside a string literal — Python imports never
  // contain string literals, so this is safe in practice.
  let comment = '';
  const hashAt = body.indexOf('#');
  let code = body;
  if (hashAt >= 0) {
    code = body.slice(0, hashAt).trimEnd();
    comment = body.slice(hashAt);
    if (comment) comment = ' ' + comment;
  }

  // `from X import ...`
  let m = code.match(/^from\s+([\w.]+)\s+import\s+(.+?)\s*$/);
  if (m) {
    const pkg = m[1];
    const rest = m[2];
    const replacement = substitutePackage(pkg);
    if (replacement === null) return { rewritten: line, applied: null };
    return {
      rewritten: `${indent}from ${replacement} import ${rest}${comment}`,
      applied: [{ original: pkg, rewritten: replacement, type: 'from' }],
    };
  }

  // `import X [as A][, Y [as B], …]`
  m = code.match(/^import\s+(.+?)\s*$/);
  if (m) {
    const segments = splitImportSegments(m[1]);
    const newSegs = [];
    const applied = [];
    let anyChange = false;
    for (const seg of segments) {
      const segMatch = seg.match(/^([\w.]+)(\s+as\s+\w+)?$/);
      if (!segMatch) { newSegs.push(seg); continue; }
      const pkg = segMatch[1];
      let asPart = segMatch[2] || '';
      const replacement = substitutePackage(pkg);
      if (replacement === null) {
        newSegs.push(seg);
        continue;
      }
      // Preserve the user's original name binding when no `as` alias
      // was provided. `import scipy` rewritten to `import scitra` would
      // lose the `scipy` name in scope, breaking later code that
      // references `scipy.linalg.lu(...)`. Adding `as scipy` keeps the
      // user's reference name working — only applies to bare (non-
      // dotted) module names since `as foo.bar` isn't valid syntax.
      if (!asPart && !pkg.includes('.')) {
        asPart = ` as ${pkg}`;
      }
      newSegs.push(`${replacement}${asPart}`);
      applied.push({ original: pkg, rewritten: replacement, type: 'import' });
      anyChange = true;
    }
    if (!anyChange) return { rewritten: line, applied: null };
    return {
      rewritten: `${indent}import ${newSegs.join(', ')}${comment}`,
      applied,
    };
  }

  return { rewritten: line, applied: null };
}

// Given a dotted package path, return its substitution (longest matching
// prefix in the table) or null if no substitution applies. So:
//   substitutePackage('matplotlib.pyplot')  → 'plot'    (exact key)
//   substitutePackage('numpy.linalg')       → 'natra.linalg'  (numpy → natra, .linalg kept)
//   substitutePackage('matplotlib')         → null     (no entry, no prefix matches)
function substitutePackage(pkg) {
  if (pkg in SUBSTITUTIONS) return SUBSTITUTIONS[pkg];
  // Try progressively shorter prefixes.
  const parts = pkg.split('.');
  for (let n = parts.length - 1; n >= 1; n--) {
    const prefix = parts.slice(0, n).join('.');
    if (prefix in SUBSTITUTIONS) {
      const rest = parts.slice(n).join('.');
      return `${SUBSTITUTIONS[prefix]}.${rest}`;
    }
  }
  return null;
}

// Split a comma-separated import list, respecting nothing fancy (no
// parens — `import (a, b)` isn't valid Python anyway). Trims each
// segment so `import a , b` produces ['a', 'b'].
function splitImportSegments(s) {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

// -- parse.js --

// .ipynb JSON → array of Auditable cells.
//
// Returns `{ cells, warnings, rewrites }`:
//   cells     — [{ type, code }] in source order, ready for an Auditable
//               notebook to consume (the loader assigns IDs).
//   warnings  — strings describing things we dropped or simplified (magics,
//               raw cells, outputs, shell escapes).
//   rewrites  — flat list of all the substitutions that fired across all
//               code cells, e.g. `{original: 'numpy', rewritten: 'natra'}`.
//
// Cell mapping:
//   ipynb code     → auditable adder cell (Python); imports rewritten via
//                    substitutions.js
//   ipynb markdown → auditable md cell
//   ipynb raw      → auditable md cell wrapping the content in a fenced
//                    block + a warning (Auditable has no equivalent of
//                    Jupyter's raw cell)
//
// What we drop:
//   - cell `outputs` (cells re-run on load anyway)
//   - cell `execution_count`, `metadata`
//   - line magics (`%matplotlib inline`, `%pip install …`) — commented
//   - cell magics (`%%timeit`, `%%capture`) — line commented, body kept
//   - shell escapes (`!pip install`, `!ls`) — commented
//
// Notebook-level metadata (kernelspec, language_info) is examined to
// confirm it's a Python notebook; non-Python kernels emit a warning but
// still import (we just send the code to adder and let it error).


function parseIpynb(jsonText) {
  let nb;
  if (typeof jsonText === 'string') {
    try {
      nb = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`ipynb parse: invalid JSON (${e.message})`);
    }
  } else {
    nb = jsonText;
  }

  const warnings = [];
  const rewrites = [];
  const cells = [];

  // Confirm format. nbformat 3 had a different shape (worksheets); we
  // only handle nbformat 4 + 5.
  const nbformat = nb.nbformat;
  if (nbformat !== undefined && nbformat < 4) {
    warnings.push(`nbformat ${nbformat} is older than 4; import may be incomplete`);
  }

  // Sanity-check kernel. Most notebooks won't have a kernelspec; that's
  // fine — assume Python. Only warn if we can SEE it's not Python.
  const kernel = nb.metadata?.kernelspec?.language;
  if (kernel && kernel.toLowerCase() !== 'python') {
    warnings.push(
      `kernel is "${kernel}" — code cells will be imported as Python ` +
      `(adder cells) and likely fail`,
    );
  }

  for (const cell of nb.cells || []) {
    const source = sourceToString(cell.source);
    if (cell.cell_type === 'markdown') {
      cells.push({ type: 'md', code: source });
    } else if (cell.cell_type === 'code') {
      const { code, cellWarnings, cellRewrites } = processCodeCell(source);
      cells.push({ type: 'adder', code });
      warnings.push(...cellWarnings);
      rewrites.push(...cellRewrites);
    } else if (cell.cell_type === 'raw') {
      warnings.push('raw cell converted to md (no Auditable equivalent)');
      cells.push({
        type: 'md',
        code: '```\n' + source + '\n```\n\n*(imported from a Jupyter raw cell — Auditable has no raw cell type)*',
      });
    } else {
      warnings.push(`unknown cell_type "${cell.cell_type}" skipped`);
    }
  }

  return { cells, warnings, rewrites };
}

// ipynb source can be either a single string or an array of line-fragment
// strings that should be concatenated. The array form is more common.
function sourceToString(s) {
  if (Array.isArray(s)) return s.join('');
  if (typeof s === 'string') return s;
  return '';
}

// Strip outputs / magics from a code cell, rewrite imports.
function processCodeCell(source) {
  const cellWarnings = [];
  // Strip cell magics first (lines starting with `%%` at the top of the
  // cell, possibly preceded by blank lines / comments).
  const lines = source.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('%%')) {
      // Cell magic — keep as comment so the user sees what was there.
      out.push('# ' + line);
      cellWarnings.push(`dropped cell magic: ${trimmed.split(/\s+/)[0]}`);
      continue;
    }
    if (trimmed.startsWith('%')) {
      // Line magic.
      out.push('# ' + line);
      cellWarnings.push(`dropped line magic: ${trimmed.split(/\s+/)[0]}`);
      continue;
    }
    if (trimmed.startsWith('!')) {
      // Shell escape.
      out.push('# ' + line);
      cellWarnings.push(`dropped shell escape: ${trimmed.split(/\s+/)[0]}`);
      continue;
    }
    out.push(line);
  }
  const stripped = out.join('\n');

  // Rewrite imports.
  const { source: rewritten, rewrites: cellRewrites } = rewriteImports(stripped);

  return {
    code: rewritten,
    cellWarnings,
    cellRewrites,
  };
}

// -- serialize.js --

// Auditable cells → .ipynb JSON.
//
// Inverse of parse.js. Python (adder) cells become ipynb code cells with
// imports rewritten back to their numpy/pandas/etc. originals so a
// colleague opening the file in Jupyter sees idiomatic code. Non-Python
// auditable cell types (JS code, html, css) become markdown cells
// containing the source verbatim in a fenced block, with a note that
// they need to be re-executed in Auditable. This is the "honest framing"
// version: the Python parts of your work, intact; everything else
// preserved as text for reference.
//
// Returns a JS object you can JSON.stringify (or pass through directly
// to a file writer). Caller is responsible for serializing.


// Inverse of the substitution table. Built lazily at first use.
let _inverseSubs = null;
function inverseSubs() {
  if (_inverseSubs) return _inverseSubs;
  _inverseSubs = {};
  for (const [py, gcu] of Object.entries(SUBSTITUTIONS)) {
    _inverseSubs[gcu] = py;
  }
  return _inverseSubs;
}

// Same rewriter shape as substitutions.rewriteImports, but using the
// inverse table. Could be unified, but the asymmetry (forward maps
// `numpy.linalg` via prefix; inverse needs to map `natra.linalg` via
// prefix too) is cleanest as a separate dedicated pass.
function rewriteImportsBack(source) {
  const inv = inverseSubs();
  // Strip the auto-injected theme line on export. Matches lines whose
  // trailing comment is the `auditable: ipynb-theme-inject` sentinel
  // we wrote when forward-rewriting `import matplotlib.pyplot`. Users
  // who want to keep the call need only remove the sentinel comment.
  const lines = source.split('\n').filter(
    l => !/#\s*auditable:\s*ipynb-theme-inject\b/.test(l),
  );
  const out = [];
  for (const line of lines) {
    out.push(rewriteImportLineBack(line, inv));
  }
  return out.join('\n');
}

function rewriteImportLineBack(line, inv) {
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  const body = line.slice(indent.length);
  let code = body;
  let comment = '';
  const hashAt = body.indexOf('#');
  if (hashAt >= 0) {
    code = body.slice(0, hashAt).trimEnd();
    comment = body.slice(hashAt);
    if (comment) comment = ' ' + comment;
  }

  let m = code.match(/^from\s+([\w.]+)\s+import\s+(.+?)\s*$/);
  if (m) {
    const pkg = m[1];
    const rest = m[2];
    const replacement = invSub(pkg, inv);
    if (replacement === null) return line;
    return `${indent}from ${replacement} import ${rest}${comment}`;
  }

  m = code.match(/^import\s+(.+?)\s*$/);
  if (m) {
    const segments = m[1].split(',').map(x => x.trim()).filter(Boolean);
    const newSegs = [];
    let anyChange = false;
    for (const seg of segments) {
      const segMatch = seg.match(/^([\w.]+)(\s+as\s+\w+)?$/);
      if (!segMatch) { newSegs.push(seg); continue; }
      const pkg = segMatch[1];
      const asPart = segMatch[2] || '';
      const replacement = invSub(pkg, inv);
      if (replacement === null) {
        newSegs.push(seg);
        continue;
      }
      newSegs.push(`${replacement}${asPart}`);
      anyChange = true;
    }
    if (!anyChange) return line;
    return `${indent}import ${newSegs.join(', ')}${comment}`;
  }

  return line;
}

function invSub(pkg, inv) {
  if (pkg in inv) return inv[pkg];
  const parts = pkg.split('.');
  for (let n = parts.length - 1; n >= 1; n--) {
    const prefix = parts.slice(0, n).join('.');
    if (prefix in inv) {
      const rest = parts.slice(n).join('.');
      return `${inv[prefix]}.${rest}`;
    }
  }
  return null;
}

// Build the .ipynb JSON object from an array of Auditable cells.
//
// cells: [{ type, code }, ...]
// opts:
//   title?     — optional notebook title (added as a leading markdown cell)
//   pythonVer? — e.g. '3.11' for language_info.version (default '3.11')
function serializeIpynb(cells, opts = {}) {
  const out = [];
  for (const cell of cells) {
    if (cell.type === 'adder') {
      out.push({
        cell_type: 'code',
        source: stringToSource(rewriteImportsBack(cell.code || '')),
        metadata: {},
        outputs: [],
        execution_count: null,
      });
    } else if (cell.type === 'md') {
      out.push({
        cell_type: 'markdown',
        source: stringToSource(cell.code || ''),
        metadata: {},
      });
    } else if (cell.type === 'code' || cell.type === 'css' || cell.type === 'html') {
      // Non-Python cells: wrap source as md block with note.
      const lang = cell.type === 'code' ? 'js' : cell.type;
      const wrapped =
        `*(auditable-native ${cell.type} cell — re-execute in Auditable)*\n\n` +
        '```' + lang + '\n' + (cell.code || '') + '\n```\n';
      out.push({
        cell_type: 'markdown',
        source: stringToSource(wrapped),
        metadata: {},
      });
    } else {
      // Unknown cell type — preserve source as code block in a md cell.
      const wrapped =
        `*(auditable cell of type "${cell.type}" — re-execute in Auditable)*\n\n` +
        '```\n' + (cell.code || '') + '\n```\n';
      out.push({
        cell_type: 'markdown',
        source: stringToSource(wrapped),
        metadata: {},
      });
    }
  }

  if (opts.title) {
    out.unshift({
      cell_type: 'markdown',
      source: stringToSource(`# ${opts.title}\n`),
      metadata: {},
    });
  }

  return {
    cells: out,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: opts.pythonVer || '3.11',
        mimetype: 'text/x-python',
        file_extension: '.py',
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

// Convert a string to the array-of-line-fragments form Jupyter prefers.
// Each line keeps its trailing '\n' except the last one (which may or
// may not have a newline). For an empty string, returns [].
function stringToSource(s) {
  if (!s) return [];
  const parts = s.split('\n');
  const out = [];
  for (let i = 0; i < parts.length - 1; i++) {
    out.push(parts[i] + '\n');
  }
  if (parts[parts.length - 1] !== '') {
    out.push(parts[parts.length - 1]);
  }
  return out;
}

// -- api.js --

// Public surface for @gcu/ipynb.




// One-shot import: text → { cells, warnings, rewrites }.
// The auditable side calls this then feeds `cells` into the notebook.
function importNotebook(ipynbText) {
  return parseIpynb(ipynbText);
}

// One-shot export: cells → .ipynb JSON string ready to write to disk.
function exportNotebook(cells, opts = {}) {
  const json = serializeIpynb(cells, opts);
  return JSON.stringify(json, null, 1);
}
export {
  importNotebook, exportNotebook,
  SUBSTITUTIONS,
};

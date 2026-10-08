// The engine's shared ground: working state, the tool table, and small helpers.
// Nothing under src/engine/ touches a DOM, a window, or storage; the shell does that.

// Working state. `cards` is the current session's cards (specs plus live results), `data` the open
// table, `aliases` the taught words and `facts` the notes (both belong to the device, not a session).
export const S = { cards: [], n: 0, aliases: {}, facts: [], data: null };

// The tool table: T.name = args => Result | null. A tool returns null when its arguments do not apply.
//   Result = { read: (string | Slot)[], body: Block[], trace: string[], py?, value?, amend?, ask?, copy? }
//   Block  = { t: 'big' | 'sub' | 'note' | 'src' | 'lbl' | 'kv' | 'table' | 'list' | 'steps' | 'pre' | 'marked'
//              | 'chips' | 'actions' | 'net' | 'bars' | 'curve', ... }   — plain data; the shell renders it
//   Slot   = { v, key?, alts?, cur? }   — a slot with alts is an ambiguous reading the person can flip
//   Ask    = { prompt, options: [{ label, value }], set(args, value) }
// Everything a tool needs to recompute lives in its args, which are plain JSON.
export const T = {};

// The clock, so tests can pin "today".
export const clock = { now: () => new Date() };

export const fmt = (x, sig = 6) => {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e12)) return x.toExponential(4);
  return Number(x.toPrecision(sig)).toLocaleString('en-US', { maximumFractionDigits: 8 });
};
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
export const p3 = x => String(Math.round(x) % 360).padStart(3, '0'), p2 = x => String(Math.round(x)).padStart(2, '0');

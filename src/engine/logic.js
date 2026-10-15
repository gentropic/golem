// A small Datalog (SPEC 13: inference, not only computation). Facts are { rel, args }, rules are { name, head, body },
// a term is a constant or a variable (a string starting with an upper-case letter or "_"). infer() applies the rules
// until nothing new follows (naive evaluation: the fact sets here are a notebook's, tens to hundreds), and keeps for
// every derived fact how it was derived, so proofOf() can say why. No negation, no arithmetic: what follows from what
// was said, and nothing else.
const isVar = t => typeof t === 'string' && /^[A-Z_]/.test(t);
export const keyOf = f => `${f.rel}(${f.args.join(',')})`;
function match(pat, fact, env) {
  if (pat.rel !== fact.rel || pat.args.length !== fact.args.length) return null;
  const e = { ...env };
  for (let i = 0; i < pat.args.length; i++) {
    const p = pat.args[i], v = fact.args[i];
    if (isVar(p)) { if (p in e) { if (e[p] !== v) return null; } else e[p] = v; } else if (p !== v) return null;
  }
  return e;
}
const ground = (pat, env) => ({ rel: pat.rel, args: pat.args.map(a => isVar(a) ? env[a] : a) });
// → Map key → { rel, args, why: { said } | { rule, from: [keys] } }
export function infer(facts, rules, limit = 100000) {
  const known = new Map();
  for (const f of facts) { const k = keyOf(f); if (!known.has(k)) known.set(k, { rel: f.rel, args: f.args, why: { said: f.said ?? null } }); }
  let changed = true, steps = 0;
  while (changed) {
    changed = false;
    const all = [...known.values()];
    for (const r of rules) {
      let envs = [{ env: {}, from: [] }];
      for (const b of r.body) {
        const next = [];
        for (const { env, from } of envs) for (const f of all) { const e = match(b, f, env); if (e) next.push({ env: e, from: [...from, keyOf(f)] }); }
        envs = next; if (!envs.length) break;
      }
      for (const { env, from } of envs) {
        const h = ground(r.head, env), k = keyOf(h);
        if (!known.has(k)) { known.set(k, { ...h, why: { rule: r.name, from } }); changed = true; if (++steps > limit) throw new Error('too many conclusions'); }
      }
    }
  }
  return known;
}
// the derivation of a fact, deepest first: [{ fact, rule | said }], each step once
export function proofOf(known, key, seen = new Set()) {
  const f = known.get(key); if (!f || seen.has(key)) return []; seen.add(key);
  if (f.why.rule == null) return [{ fact: f, said: f.why.said }];
  return [...f.why.from.flatMap(k => proofOf(known, k, seen)), { fact: f, rule: f.why.rule }];
}

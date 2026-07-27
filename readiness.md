# The readiness probe — is x sufficient and y clear, right now?

A tool-agnostic check an AI coding agent (Claude Code, Codex, anything) runs on the **current
conversation** before acting on a non-trivial request. It reads only the transcript in front of you
— no project-specific tooling — so it ports across agents unchanged. It answers one question:

```
readiness = ready | need-x | need-y | need-both
```

where **x** is the context you're conditioned on and **y** is the outcome the user wants
(`y = f(x)`; see [README](README.md)).

## Don't ask "do I feel ready?"

From a single confidence signal you **provably cannot** tell a missing FACT (x) from an ambiguous
GOAL (y) — they are non-identifiable, and a confident-but-wrong read is real (all sampled runs can
agree and still be wrong). So don't introspect a feeling. Run two **structural** probes and a gate.

## Probe y — is the goal clear?

Enumerate **2–3 distinct OUTCOMES** the request could mean — different things you would build or
deliver, **not reworded versions of one thing**. If ≥2 are materially different *and* would change
what you produce → **need-y**. Compare outcomes, not phrasings: listing paraphrases does not detect
ambiguity.

## Probe x — is the context sufficient?

Draft your intended **first action**, then flag every **load-bearing** claim that rests on a fact
you **cannot cite** from the chat, the code in front of you, or retrievable memory (an identifier, a
past decision, a convention). Any such claim → **need-x**. Judge by **citeability, not felt
confidence** — confident-but-uncitable is exactly the failure above.

## VoI gate — applies to both

For each gap found ask: *would resolving it change my FIRST action?* If no → **act anyway**. A
question or a lookup that wouldn't move the decision is friction, not diligence.

## Output

One line, then the follow-through:

```
readiness: <ready | need-x | need-y | need-both>
  gap: <the uncitable fact(s), or the ≥2 distinct outcomes>
```

- **need-x** → retrieve the fact (memory / code / ask), then re-probe.
- **need-y** → offer 2–4 mutually-exclusive directions and let the user pick.
- **need-both** → resolve x first (it sharpens which y-directions are worth offering).
- **ready** → act.

## Wiring it into an agent

- **Claude Code** — drop this file in as a skill, or run it as Step 0 of any task. The fuller,
  Claude-Code-flavored version with `/recall` + `/clarify` hand-offs is
  [`skills/xy-diagnosis.md`](skills/xy-diagnosis.md).
- **Codex** — reference this file from `AGENTS.md` as the pre-action check.
- **Any agent** — paste the four sections (Probe y / Probe x / VoI gate / Output) as a preamble.

## Caveat — this is a self-probe

Structural probing dodges the single-signal blindness above, but it is still *you* reading *your
own* thread. It catches a missing x and an ambiguous y; it does **not** catch an **unknown-unknown**
— a risk outside the option set you generated. For that you need an independent lens, not a better
self-check ([`docs/uu-fresh-lens.md`](docs/uu-fresh-lens.md)).

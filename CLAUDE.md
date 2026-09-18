# yfx — project guide

This repo IS the y=f(x) collaboration framework (see `README.md` for the concept and the
three probes). Working here is meta: you are editing the very tools that shape how a user and
an agent converge. **Apply the framework to itself** — dogfood `/clarify`, `/fresh-lens`, and
the discovery-vs-delivery distinction while building them.

## Read first (the knowledge lives in `docs/`)

A fresh session here starts with an empty memory. The durable knowledge — decisions, rationale,
rejected alternatives, and open questions — is committed as files. **Read these before acting:**

- `docs/convergence-protocol.md` — the protocol; the discovery-vs-delivery modes and their
  opposite defaults; the **Open UU / caveats** block (unresolved, do not silently contradict).
- `docs/uu-fresh-lens.md` — why unknown-unknowns need an *independent* lens, and the cheap-artifact form.
- `docs/mode-detector.md` — the discovery/delivery classifier (validated 8/8) and its caveats.
- `docs/nature-of-f.md` — properties of `f` (drift, self-blindness); the `y ≈ combine(f(x), g(x))`
  reframe and the x-lever/f-lever split. Conceptual, provisional (n=0).
- `docs/open-threads.md` — where this work stands and what's still unresolved. Start here for state.

These docs use `[[wikilinks]]` because they originated as agent memory notes in the private
project where the framework was first developed; treat them as the design record, kept in git
so it travels.

## Repo map

- `skills/` — `recall` (fill x) · `clarify` (sharpen y) · `fresh-lens` (detect mode + audit for UU) · `xy-diagnosis.md` (Step 0) · `memory-provider.md` (symlink to the active provider card)
- `providers/` — memory provider cards (`mem0`, `claude-mem`, `none`). A provider "plugin" is **prose the agent reads**, not a JS adapter: six declared capability axes, switched with `npm run provider <name>`. The `query_language` axis is measured, and `npm test` fails a card that claims more than a run measured.
- `hooks/` — `recall-context.mjs` (UserPromptSubmit, x/y nudge only — it does **not** retrieve; see its header for why the harvest was removed) · `fresh-lens-trigger.mjs` (PreToolUse, exogenous audit trigger at commit boundaries). Both **off by default**, toggle per file header.
- `docs/` — the design record (above).

## Conventions

- **Russian for chat replies to the user only.** Everything else — code, comments, commits, PRs,
  docs — in **English**.
- Keep the framework honest: when you change a probe, check it against its own caveats in `docs/`.
  A change that contradicts a recorded decision must say so and re-argue it, not slip past.
- Both hooks stay dormant unless explicitly toggled; don't wire them on by default.
- Nothing outside `providers/` may name a memory provider. A skill or hook that hardcodes one
  re-couples the framework; route through `skills/memory-provider.md` instead.
- `npm test` runs the hook unit tests and the card claim-vs-measurement checks. Run it before
  committing a change to a card or a hook.

# yfx — the y=f(x) collaboration framework

Tools for fast, honest convergence between a user and an AI agent, framed as **`y = f(x)`**:
you iterate the context/prompt **x** until the output **y** satisfies. Extracted from a private
project where it was developed and validated on real work.

## The concept

Working with an LLM is `y = f(x)`:

- **`f`** — the agent. Roughly fixed in a given session; you don't retrain it, you condition it.
- **`x`** — everything `f` is conditioned on: the prompt, the surrounding context, retrieved
  memory, the code it can see. This is the knob you actually turn.
- **`y`** — the output you want. You rarely get it in one shot; you adjust `x` and re-run until
  `f(x)` lands on a `y` that satisfies.

**Founding premise — every `y` has a reachable `x`.** The whole loop proceeds from the assumption
that for any `y` you want, *some* `x` exists that makes `f(x) = y` — that the target lives in the
image of `f`, and iterating `x` is a search that can in principle succeed. This is a premise, not a
theorem: for a fixed `f`, some `y` may simply be out of range (no prompt gets there), and then the
convergence ritual keeps adjusting `x` forever instead of admitting the `y` is unreachable. That
failure has no exit in the current frame — see the *no decline/null terminal* caveat in
[`docs/convergence-protocol.md`](docs/convergence-protocol.md).

So a session is a loop: read `y`, judge the gap, change `x`, repeat. The thing worth optimizing
is **convergence speed = information gained per round-trip**. The usual bottleneck isn't the model
— it's round-trips wasted because the wrong thing was underspecified. Three failure classes, three
fixes, and knowing *which* one you're in is half the battle:

1. **`x` is deficient** — a load-bearing fact is missing (a past decision, an identifier, a
   convention). The output is wrong but *recoverably* wrong. → **fill x** (`/recall`).
2. **`y` is ambiguous** — the goal admits several valid outcomes and `f` silently picked one.
   This is costlier: `f` does the wrong thing *fast and confidently*. → **sharpen y** (`/clarify`).
   Diagnosing x-vs-y matters because from a single confidence signal the two are provably
   indistinguishable — so you probe both, deliberately (`xy-diagnosis.md`).
3. **Something is outside the frame** — a risk or assumption *neither party voiced*, outside the
   set of interpretations `/clarify` could even list (an **unknown-unknown**). You can't see it
   from inside `f`. → **an independent lens** (`/fresh-lens`), an agent that isn't you.

One more distinction runs through all of it: is `y` **pre-existing** or **being constructed**?
In **delivery** the user already knows `y` (fix this bug, merge that) — converging fast is pure
good. In **discovery** `y` doesn't exist yet for anyone; it's co-constructed through the exchange,
and naming it too early forecloses a better `y` nobody has seen. The two modes want *opposite*
defaults — sharpen vs widen — so mis-reading the mode inverts your behavior. (Mode is a property
of the *move*, not the session, and flips to delivery the moment a direction is committed.)

## The three probes

| Probe | Fixes | When |
| --- | --- | --- |
| **`/recall`** | a missing **x** (context, past decisions, identifiers) | cold topic, or a request that leans on facts you can't cite |
| **`/clarify`** | an ambiguous **y** (several valid outcomes) | underspecified goal, no acceptance criterion |
| **`/fresh-lens`** | what you *can't* see — run by an agent that isn't you | open/design moves, before an irreversible commitment |

`xy-diagnosis.md` is **Step 0**: decide whether you're short on **x** (→ recall) or **y**
(→ clarify) before acting — from one confidence signal alone the two are provably
indistinguishable, so probe both.

`/fresh-lens` is the third leg: `/recall` and `/clarify` act on what you can see; a fresh,
**independent** agent catches the two failure classes invisible from inside `f` —
- **detect** — is this move *discovery* (y is co-constructed, not yet known) or *delivery*
  (y pre-exists)? The two want opposite defaults; misreading inverts your behavior.
- **audit** — surface **unknown-unknowns**: assumptions/axes neither party voiced, outside
  the option set `/clarify` can even enumerate.

Independence is the mechanism: a watcher carrying the executor's priors is blind to exactly
the class it's hired to catch.

## Layout

```
skills/
  recall/        — /recall (fill x)
  clarify/       — /clarify (sharpen y)
  fresh-lens/    — /fresh-lens (detect mode + audit for unknown-unknowns)
  xy-diagnosis.md — Step 0: x-vs-y diagnosis, shared by recall & clarify
hooks/
  recall-context.mjs        — UserPromptSubmit: cheap always-on x-tier (claude-mem auto-search)
  fresh-lens-trigger.mjs    — PreToolUse: exogenous audit trigger at commitment boundaries
docs/
  convergence-protocol.md   — the protocol, discovery-vs-delivery modes, open UU/caveats
  uu-fresh-lens.md          — why UU need an independent lens; the cheap-artifact form
  mode-detector.md          — the discovery/delivery classifier (validated 8/8)
  nature-of-f.md            — properties of f; the y ≈ combine(f(x), g(x)) reframe (provisional)
  open-threads.md           — current state and what's still unresolved
evals/          — L0 blind-label replay harness (classifier vs independent truth)
readiness.md    — the tool-agnostic core probe (is x sufficient / y clear — works in any agent)
examples/
  AGENTS.md     — copy-in Codex wiring for the readiness probe
install.sh      — symlink skills + hooks into ~/.claude/
```

Both hooks are **off by default** (toggle via an env var or a marker file — see each file's
header), so installing them globally is dormant until you opt in per project.

## Getting started

```bash
git clone https://github.com/dmoiseenko/yfx && cd yfx
./install.sh          # symlink skills + hooks into ~/.claude/ (idempotent; --force to replace)
```

That makes the probes available in every project you run Claude in. Alternatively symlink
`skills/` + `hooks/` into a single project's `.claude/`, or copy them by hand — this repo is the
versioned source of truth, the install is just symlinks pointing back here.

**Works with no dependencies:** `/clarify` (pick-a-direction) and `/fresh-lens` (spawns an
independent sub-agent) are pure Claude Code — available immediately. `xy-diagnosis` is the shared
Step-0 method they build on.

**Needs [claude-mem](https://github.com/thedotmack/claude-mem):** `/recall`'s "fill x" step
searches persistent memory via claude-mem's tools; without it installed, `/recall` degrades to the
x/y diagnosis with no retrieval. The `recall-context` hook needs the claude-mem worker too.

**Hooks are off by default.** `install.sh` links them in but they stay dormant until you wire them
in `~/.claude/settings.json` and set each one's opt-in flag (`FRESH_LENS_TRIGGER=1`, or a
`.claude/fresh-lens.on` marker) — the installer prints the exact snippet.

**The portable core (Codex, or any agent):** the skills above are Claude Code packaging, but the
heart of the loop — *is x sufficient, is y clear, right now?* — is one tool-agnostic probe that
reads only the current chat. See [`readiness.md`](readiness.md). To wire it into Codex, copy
[`examples/AGENTS.md`](examples/AGENTS.md) into your project's `AGENTS.md` (self-contained, no
install). Any other agent: paste the probe as a preamble.

**One honest caveat:** the framework was developed and validated on a single private project (n=1).
The concepts and probes transfer; the specific numbers (mode 8/8, recall@k) come from that origin and
aren't a promise for your codebase. Treat the recorded decisions as provisional — see
[`docs/open-threads.md`](docs/open-threads.md).

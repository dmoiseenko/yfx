# yfx — the y=f(x) collaboration framework

Tools for fast, honest convergence between a user and an AI agent, framed as **`y = f(x)`**:
you iterate the context/prompt **x** until the output **y** satisfies. Extracted from a private
project where it was developed and validated on real work.

**In plain words.** yfx is a set of skills and a small mod for [Claude Code](https://claude.com/claude-code).
When a coding agent does the wrong thing, it is usually not the model's fault: either it was
missing a fact it needed (a past decision, a convention, an identifier), or the request could
mean several things and it silently picked one. yfx gives the agent and the user three quick
checks for this — fill the missing context, pick the intended goal, and ask an independent
agent what both of you missed — so fewer rounds are wasted.

**Status:** personal and experimental. Developed and validated on one private project (n=1);
the ideas transfer, the numbers are not a promise for your codebase (see the caveat at the end).

## What it looks like

An illustrative exchange (not a transcript). The request is ambiguous, so `/clarify` names
*which* part is unclear and offers concrete directions instead of guessing:

```text
you:    improve the dashboard

agent:  (/clarify) "Improve" is open on one axis — the goal. Which one?
          1. Speed: the strategy page takes long to render
          2. Information: show a signal the code computes but hides today   ← recommended
          3. Visual polish: header and badges
             (dropped: memory shows they were just reworked)
        Pick one, or tell me another.

you:    2

agent:  [works on option 2 — no wasted round on a direction you didn't want]
```

The other two checks follow the same pattern: `/recall` searches memory before acting when a
needed fact is missing, and `/fresh-lens` hands the plan to a separate agent before an
irreversible step (a commit, a merge) to catch what neither of you said out loud.

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
  memory-provider.md — symlink to the active provider card (npm run provider <name>)
providers/        — memory provider cards: mem0, claude-mem, none (prose, not code)
mods/
  yfx/                      — Claude Code mod: the always-on probes (x/y nudge, the
                              commit-boundary fresh-lens trigger), /yfx toggles on the status
                              line, and in-session user labels of each move's mode (gold tier)
docs/
  convergence-protocol.md   — the protocol, discovery-vs-delivery modes, open UU/caveats
  uu-fresh-lens.md          — why UU need an independent lens; the cheap-artifact form
  mode-detector.md          — the discovery/delivery classifier (validated 8/8)
  nature-of-f.md            — properties of f; the y ≈ combine(f(x), g(x)) reframe (provisional)
  open-threads.md           — current state and what's still unresolved
  portable-core.md          — the frozen tool-agnostic probe for Codex / other agents
evals/          — L0 blind-label replay harness (classifier vs independent truth)
                  + the memory-provider language-bridge eval
scripts/        — use-provider.mjs: switch the active provider card
readiness.md    — the tool-agnostic core probe (frozen: the framework now targets Claude Code only)
examples/
  AGENTS.md     — copy-in Codex wiring for the readiness probe (frozen)
install.sh      — symlink the skills into ~/.claude/
```

## Getting started

```bash
git clone https://github.com/dmoiseenko/yfx && cd yfx
./install.sh          # symlink the skills into ~/.claude/ (idempotent; --force to replace)
```

That makes the skills available in every project you run Claude in; the always-on probes come
with the mod (below). Alternatively symlink `skills/` into a single project's `.claude/`, or copy them by hand — this repo is the
versioned source of truth, the install is just symlinks pointing back here.

**Works with no dependencies:** `/clarify` (pick-a-direction) and `/fresh-lens` (spawns an
independent sub-agent) are pure Claude Code — available immediately. `xy-diagnosis` is the shared
Step-0 method they build on.

**Needs a memory provider:** `/recall`'s "fill x" step searches persistent memory. Which store,
and how to query it, is declared in a **provider card** — prose the agent reads, not an adapter
to implement:

```bash
npm run provider            # show the active card and what's available
npm run provider mem0       # mem0 (default) | claude-mem | none
```

`none` is a supported configuration: `/recall` still runs the diagnosis and falls back to the
code, `git log`, and asking the user. `/clarify` and `/fresh-lens` never needed memory at all.

Cards are **measured, not asserted**. Each declares six capability axes, and the `query_language`
row is backed by an eval — a raw Russian query retrieves 21/24 target memories on mem0 and 0/24
on claude-mem ([`evals/RESULTS-memory-provider.md`](evals/RESULTS-memory-provider.md)).
`npm test` fails if a card claims a capability no run measured.

**The mod.** `mods/yfx` runs inside Claude Code (a plugin of function hooks): it draws, asks,
keeps state, and owns the framework's always-on probes. Install it from a terminal session:

```
/plugin install yfx --marketplace dmoiseenko/yfx
```

Everything in it is off until you turn it on, per project (`/yfx on nudge|lens|labels|all`):

- `nudge` attaches the x/y diagnosis prompt to each substantive prompt you type;
- `lens` hands the model the fresh-lens audit reminder at every commitment boundary
  (`git commit` / merge, `gh pr create` / merge), whatever it feels about the move;
- `labels` (below).

`RECALL_LOOP` / `FRESH_LENS_TRIGGER` (`1` or `0`) override `nudge` / `lens` for a session; the
status line marks that `(env)`. The status line shows only while a probe is on or a variable
decides one; `/yfx` always lists the state. `/yfx on labels` starts asking,
after each substantive turn, whether your prompt was *discovery* or *delivery* (and whether a yfx
skill that fired was useful). Those are the user-supplied labels `evals/README.md` calls the gold
tier. They are kept outside every repository (`~/.claude/yfx/labels/`, one append-only file per
project), so any working session can feed the eval: `/yfx export` copies every project's labels
into this checkout's `evals/out/` (give the path once from another project:
`/yfx export ~/code/yfx`; refused unless that folder is gitignored), for
`RUN=live node evals/score.mjs`.

**Other agents (Codex and others):** a tool-agnostic version of the core probe exists but is
frozen since the framework moved to Claude Code only — see
[`docs/portable-core.md`](docs/portable-core.md).

**One honest caveat:** the framework was developed and validated on a single private project (n=1).
The concepts and probes transfer; the specific numbers (mode 8/8, recall@k) come from that origin and
aren't a promise for your codebase. Treat the recorded decisions as provisional — see
[`docs/open-threads.md`](docs/open-threads.md).

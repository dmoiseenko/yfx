---
name: fresh-lens
description: Run a FRESH, independent agent — separate from you, the executor — to catch what you're structurally blind to. Two modes — detect (classify a move discovery vs delivery to pick the right defaults) and audit (surface unknown-unknowns: assumptions/axes neither party voiced). Invoke on open/design moves or before an irreversible commitment; never on warm directive streams. The third probe alongside /recall (x) and /clarify (y).
---

# /fresh-lens — an independent agent for your own blind spots

`y = f(x)`: `/recall` fills a missing **x**, `/clarify` sharpens an ambiguous **y**.
Both are things *you* do. But two failure classes are invisible from inside `f`:

- **Wrong mode** — you treat a *discovery* move (y is co-constructed, not yet known)
  as *delivery* (y pre-exists) and converge fast on a mediocre y the user never gets
  to reject. You have a systematic pull here: delivery is less work, so you under-call
  discovery.
- **Unknown-unknowns** — goal-risks *outside* the option set you yourself generated.
  `/clarify` only enumerates the interpretations you can already see.

You cannot audit yourself out of either: a watcher carrying your priors is blind to
exactly the class it's hired to catch. **Independence is the mechanism** — this skill
spawns a fresh agent with cold context and no stake in your framing. It is the
"dedicated detector agent separate from the executor" that [xy-diagnosis](../xy-diagnosis.md)
names as a validated pattern.

Both modes are **on-demand and cheap** — fire on genuinely open / design moves, or before
an irreversible commitment. Do NOT fire on warm-context directive streams ("show diff",
"merge both", "add a field to config.ts") — that's over-clarify friction, the binding risk.

---

## Mode: detect — is this move discovery or delivery?

Run when you're unsure which defaults apply (complements the x/y diagnosis).

**How:** spawn `Agent` (subagent_type `claude`, synchronous). Hand it the mandate below
plus the move(s), each with a one-line **warm/cold** context note. It returns rows:
`<id> | discovery|delivery | confidence | <=12-word why`.

**The mandate (paste verbatim; do NOT add your own conclusions — that infects the lens):**

> Classify each MOVE as **discovery** or **delivery**.
> - **delivery** = y already exists (user's head or objectively determined); realize a fixed y; speed is pure good. Includes RETRIEVING/RECALLING an existing fact or artifact (a lookup — "do you have X?", "what did we decide about X?", "recall X"): the answer already exists, so it is delivery even on a cold topic.
> - **discovery** = y does not yet exist for anyone; co-constructed; naming y early forecloses a better unseen y; lever is WIDEN not sharpen.
> - Signals — discovery: open verbs (improve / explore / what-if / should-we / "давай подумаем"), no stateable acceptance, about direction not a named target, user sounds uncertain, cold/novel topic *when the ask is to create or decide something new* (a lookup/recall on a cold topic is NOT discovery — the answer already exists). delivery: imperative + named target, binary/testable acceptance, warm context where y was just established, reference to an existing artifact, retrieving/recalling an existing fact.
> - **Critical rule:** mode is per-MOVE not per-session; a discovery session flips to delivery the moment a candidate y is COMMITTED ("build the thing we just chose" = delivery).
> - **Bias guard:** when genuinely split AND discovery signals are actually present → discovery. Do NOT trigger merely on low confidence — a pre-existing y (pure lookup, named testable target) is delivery regardless of confidence.
> - Output ONLY the table, one row per move, nothing else.

**Then:** apply the mode-conditional defaults — delivery = gather x, sharpen, execute,
verify-first; discovery = resist naming y early, widen candidates, cheap artifact first,
coverage before commitment. (Validated 8/8 on real moves, 2026-07-26.)

---

## Mode: audit — what unknown-unknown are we standing on?

Run on open/design conversations, before committing to a direction that's costly to reverse.

**How:** distill the conversation/design into a file — the decisions, the option set you
offered, what was chosen. Spawn a fresh `Agent` (subagent_type `claude`, synchronous) with
the mandate below. Relay its findings; the user's "I hadn't thought of that" → persist as a
NEW axis (converts the UU into a known-unknown permanently).

**The mandate (paste verbatim; do NOT pre-load it with your own read of the plan):**

> You are a FRESH lens with no stake in the framing. Assume this entire effort targets the
> wrong thing. Surface UNKNOWN-UNKNOWNS: assumptions, framings, or whole axes that NEITHER
> party voiced — outside their current option set. Ranked most-load-bearing first, at most 5.
> For each: the unspoken assumption (one line) / why it might be wrong (the failure it hides)
> / the axis it opens (the question they should be asking but aren't). Drop anything generic
> enough to apply to any such effort — keep only what bites HERE. Do not validate the plan;
> your value is only in what they cannot see.

---

## When NOT to run

- **Warm directive streams** — the move has a named target and y was just established. Just execute.
- **A cheap-to-reverse default exists** — make the call, state the assumption, proceed.
- **You'd only be confirming what you already believe** — a fresh agent primed with your
  conclusions is theater. If you can't hand it cold context, don't run it.

## Triggering (exogenous — not your discretion)

The **audit** mode has a trap: a blind executor can't feel which moves are blind, so the
moves that most need auditing are the confident ones you'd never self-flag. If *you* decide
when to run it, the safeguard inherits your blindness at the trigger. So the trigger is made
exogenous: a PreToolUse hook (`.claude/hooks/fresh-lens-trigger.mjs`) fires at every
**commitment boundary** — `git commit` / `gh pr create` / merge — injecting a reminder to run
the audit before the decision locks, regardless of how confident you feel. It does NOT detect
ambiguity (that would re-import the blindness); it fires on the event. Off by default; enable
with `FRESH_LENS_TRIGGER=1` or `touch .claude/fresh-lens.on`. (Still open: moves that lock a
decision without a commit — see the Open-UU block in [[convergence-protocol]].)

## Relation to the loop

`/recall` (x) and `/clarify` (y) act on what *you* can see. `/fresh-lens` is the probe for
what you *can't* — run by someone who isn't you. Findings that land go to memory
([[uu-fresh-lens]], [[mode-detector]], [[convergence-protocol]]) so the next session starts
with the blind spot already mapped.

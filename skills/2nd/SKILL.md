---
name: 2nd
description: Get a second opinion before an irreversible step — spawn a FRESH, independent agent to red-team the plan you're about to commit. It surfaces blind spots you can't see from inside, and can return "don't build this." Use before commit / merge / publish / a decision you'll build on. The independence is the point — never self-audit.
---

# /2nd — a second opinion from an agent that isn't you

You're about to do something costly to reverse — commit, merge, publish, a migration, a design
you'll build on. Before you lock it in, get one independent read. **Not you re-checking yourself**
— a fresh agent with cold context and no stake in your framing.

This isn't a style preference; it's the one thing self-review can't do. Tested in-vivo in this repo:
an *invested* executor's self-audit missed load-bearing blind spots that a cold agent caught —
including that the executor had extracted the wrong half of its own framework. You are blindest
exactly where you're most invested, and you can't feel it from inside.

## When to run

- Before an **irreversible / committing** step (commit, merge, publish, delete, a decision others build on).
- On a plan you feel **confident** about — confidence is precisely when you won't self-flag the blind spot.
- **Not** on warm, cheap-to-reverse steps — that's just friction.

## How

1. **Distill** the plan into a few neutral lines: what you're about to do, why, and the main
   alternatives you considered or rejected. Do **not** include your conclusion about what's right.
2. **Spawn a fresh agent** — `Agent`, `subagent_type: claude`, synchronous — cold, with the mandate
   below. Do **not** prime it with your reasoning; that infects the lens.
3. **Relay** its findings to the user verbatim, including a "don't build this" if it lands. The user decides.

## The mandate (paste verbatim; do not add your own read)

> You are a FRESH second opinion with no stake in this plan. Assume it may be the wrong thing to do.
> Two jobs:
> 1. **Blind spots** — assumptions, framings, or whole axes that NEITHER party voiced, outside their
>    option set. Ranked most load-bearing first, at most 4, specific to THIS plan. Drop anything
>    generic enough to apply to any plan.
> 2. **Verdict** — exactly one of: `proceed` (sound as-is — blind spots, if any, are notes, not
>    blockers), `adjust` (a named blind spot must be resolved BEFORE this step), or `don't-build`
>    (the honest answer is this shouldn't be done — say why). Desirability counts: a fully-specified
>    plan can still be the wrong thing to build.
>
> A false `adjust` is not free: every verdict spends the user's finite attention, and blocking a
> sound plan is a real cost. `proceed` is a full-value verdict, not a failure to find something —
> a sound plan with merely noteworthy blind spots gets `proceed`, with the blind spots as notes.
> The bar for `adjust` is NOT "the plan could fail." It is two-part: this blind spot would
> plausibly CHANGE the decision if surfaced, and the step is costly enough to reverse that acting
> first locks the mistake in. Decision-changing AND hard to undo → `adjust`; anything else is a
> note under `proceed`.
>
> For each blind spot: the unspoken assumption (one line) / the failure it hides / the question they
> should be asking but aren't. Do not validate the plan — your value is only in what they cannot see.
> Output the verdict, then the ranked blind spots.

## Known limitation — the verdict skews to `adjust`

Measured on a held-out set of 12 real engineering plans: the cold arm caught the core flaw in 67%
of flawed plans, but returned `proceed` on only 3 of 24 samples across 8 **sound** plans. The bar
below ("decision-changing AND costly to reverse") is stated in terms a thorough auditor can nearly
always satisfy, because real plans always have open axes. So read an `adjust` as *"here is the axis
you did not voice"* — not as *"this plan is not ready."* The blind spots are the product; the
verdict is not yet calibrated enough to gate on. Numbers and protocol: [`evals/RESULTS-transfer.md`](../../evals/RESULTS-transfer.md).

## Then

- **proceed** → go, with the blind spots noted.
- **adjust** → resolve the named axis first, and persist it so it isn't re-discovered next time.
- **don't-build** → stop and surface it. `y = f(x)` has no value for "the answer is no" by default;
  this verdict is where the framework finally gets one.

## Why independence, not a better self-check

A watcher carrying your priors is blind to exactly the class it's hired to catch — confirmed
in-vivo here, not assumed. `/2nd` is [fresh-lens](../fresh-lens/SKILL.md) reduced to one move; the
rationale lives in [uu-fresh-lens](../../docs/uu-fresh-lens.md).

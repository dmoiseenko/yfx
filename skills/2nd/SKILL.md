---
name: 2nd
description: Get a second opinion before an irreversible step — spawn a FRESH, independent agent to surface the axes you never voiced, then reconcile them against what you know and escalate the ones you cannot dismiss. Use before commit / merge / publish / a decision you'll build on. The independence is the point — never self-audit.
---

# /2nd — a second opinion from an agent that isn't you

You're about to do something costly to reverse — commit, merge, publish, a migration, a design
you'll build on. Before you lock it in, get one independent read. **Not you re-checking yourself**
— a fresh agent with cold context and no stake in your framing.

This isn't a style preference; it's the one thing self-review can't do. Measured twice in this repo,
including out-of-sample: a cold agent catches load-bearing blind spots an *invested* executor
misses — including, in vivo, that the executor had extracted the wrong half of its own framework.
You are blindest exactly where you're most invested, and you can't feel it from inside.

**The cold agent finds; it does not judge.** That split is the design, and it was earned — see
*Why the verdict is gone* below.

## When to run

- Before an **irreversible / committing** step (commit, merge, publish, delete, a decision others build on).
- On a plan you feel **confident** about — confidence is precisely when you won't self-flag the blind spot.
- **Not** on warm, cheap-to-reverse steps — that's just friction.

## How

1. **Distill** the plan into a few neutral lines: what you're about to do, why, and the main
   alternatives you considered or rejected. Do **not** include your conclusion about what's right.
2. **Spawn a fresh agent** — `Agent`, `subagent_type: claude`, synchronous — cold, with the mandate
   below. Do **not** prime it with your reasoning; that infects the lens.
3. **Reconcile** each axis it returns, using the *Reconciling* rules below. This is your job, not
   the cold agent's — you hold information it does not.
4. **Escalate** what survives reconciliation to the user, verbatim, with your response attached.
   The user decides. Never resolve an escalation on their behalf.

## The mandate (paste verbatim; do not add your own read)

> You are a FRESH second opinion with no stake in this plan. Assume it may be the wrong thing to do.
>
> Your job is to surface **unvoiced axes** — assumptions, framings, or whole dimensions that NEITHER
> party named, outside the option set they were choosing from. Ranked most load-bearing first, at
> most 4, specific to THIS plan. Drop anything generic enough to apply to any plan.
>
> Include, when it applies, the axis they most avoid: whether this should be done at all.
> A fully-specified plan can still be the wrong thing to build, and "should this exist" is an axis
> like any other — name it when the plan takes its own desirability for granted.
>
> For each axis give exactly four things:
> - **assumption** — the unspoken belief, one line.
> - **failure** — what it hides; the concrete way this goes wrong.
> - **question** — what they should be asking but aren't.
> - **changes_if_true** — what would concretely be DIFFERENT about the plan if this axis turned out
>   to matter: a different design, a dropped step, a reordering, or nothing structural.
>
> Do **not** rate severity, priority or risk, and do **not** say whether to proceed. You lack the
> information that judgment needs — reversal cost, stakes, schedule, what these people can absorb.
> Naming the axis and what it would change IS the deliverable. Do not validate the plan; your value
> is only in what they cannot see.
>
> Output the ranked axes and nothing else.

## Reconciling — your half, and its one rule

You hold what the cold agent lacks: whether the axis actually applies here, and what things cost.
It holds what you lack: sight of the axis at all. Neither half is the answer.

For **each** axis, answer only what you can back with evidence:

- **applies / doesn't apply / unsure** — and if it doesn't, the specific reason, checkable by
  someone else. "We already handle that" is not a reason; naming where and how is.
- **cost to resolve now** — minutes, a day, a redesign?
- **cost if it surfaces after this step** — a cheap fix, rework, or unrecoverable?

**Do not rate importance.** That is the judgment your investment corrupts — a self-classifier drifts
toward "proceed, less work for me" the same way it drifts toward delivery ([mode-detector](../../docs/mode-detector.md)).
Cost and applicability are facts you can be wrong about in public. Importance is where the bias hides.

**Escalate to the user when:**
- you cannot dismiss the axis with a checkable reason, **and** late discovery costs more than
  resolving it now; **or**
- the axis questions whether the thing should be done at all — always escalate that one, whatever
  you think. You are the party with the least standing to close it.

Everything else: note it in passing and proceed. That is what keeps this cheap — the user's
attention is a finite budget nothing else meters, and spending it on every axis is how a probe
becomes friction.

## Then

- **Nothing escalated** → go, with the axes noted so they aren't rediscovered next time.
- **Something escalated** → surface it and stop. Persist whatever the user decides, so the axis
  isn't re-litigated from scratch next time.
- **The user says don't build it** → that is a real outcome, not a failure. `y = f(x)` has no value
  for "the answer is no" by default; this path is where the framework gets one. It lives with the
  user because neither `f` nor `g` is positioned to issue it.

## Why the verdict is gone

Earlier versions had the cold agent return `proceed` / `adjust` / `don't-build`. Three attempts to
calibrate that verdict failed in a row: the first never returned `proceed` at all (24/24 samples),
the second over-corrected until agents caught a real flaw and waved it through anyway, and the third
looked fixed on the dataset it was tuned against, then collapsed out-of-sample — **`proceed` on 3 of
24 samples across 8 sound plans**, an 88% false-block rate ([`evals/RESULTS-transfer.md`](../../evals/RESULTS-transfer.md)).

The pattern across all three says the problem was never the wording. A thorough auditor can nearly
always satisfy any severity bar you write, because real plans always have open axes — and severity
depends on reversal cost, stakes and schedule, which a cold agent cannot see by construction. It was
being asked for a judgment its own independence denies it the inputs for.

So the roles are split: `g` finds, you supply cost and applicability, the user adjudicates. The two
halves have **opposite** biases — the cold lens toward "everything blocks" (88%, measured), you
toward "nothing blocks" (the documented delivery drift) — and the disagreement between them is the
signal worth the user's attention. That reconciliation is the first concrete definition of `combine`
in `y ≈ combine(f(x), g(x))` ([nature-of-f](../../docs/nature-of-f.md)), which the framework had left
undefined.

**Status: unvalidated, and precisely so.** Two things are untested, not one:

- The **reconciliation half** has never been measured. The split is an argument from a diagnosed
  failure, not a result.
- The **finding half's** 67% core-recall was measured on the *previous* mandate — the one that also
  asked for a verdict. This wording drops the verdict and adds `changes_if_true`, so that number
  does not automatically carry over.

Both need a **further held-out set**. Re-scoring this revision on the transfer set is explicitly
forbidden by [`evals/PROTOCOL-transfer.md`](../../evals/PROTOCOL-transfer.md) — validating a revision
on the data that motivated it is the exact failure that produced this redesign, and doing it here
would be the fourth instance.

## Why independence, not a better self-check

A watcher carrying your priors is blind to exactly the class it's hired to catch — confirmed
in-vivo here, not assumed, and replicated out-of-sample. `/2nd` is
[fresh-lens](../fresh-lens/SKILL.md) reduced to one move; the rationale lives in
[uu-fresh-lens](../../docs/uu-fresh-lens.md).

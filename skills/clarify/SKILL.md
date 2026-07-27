---
name: clarify
description: Sharpen an ambiguous GOAL (y) before acting — when a request has several valid interpretations, present 2-4 concrete, mutually-exclusive directions and let the user pick one. The y-counterpart to /recall (which fills missing context, x). Invoke when the desired outcome is underspecified — "улучши X", "поправь Y", open scope, or no clear acceptance criterion.
---

# /clarify — sharpen y before acting

`y = f(x)`: you choose `x` (context) to produce `y` (the outcome the user wants).
`/recall` fills a missing **x**; `/clarify` resolves an ambiguous **y**. Use it when
a request admits several reasonable outcomes and guessing wrong is more expensive
than one round-trip.

First confirm you're actually in the **y** branch via the shared
**[x/y diagnosis](../xy-diagnosis.md)**: /clarify is warranted only when
intent-ambiguity is high **and** your knowledge is adequate. If a load-bearing
fact is missing, that's an **x** deficit — run /recall first (it also sharpens
which directions are worth offering below).

## Step 1 — Name the axis of ambiguity

Don't ask "what do you want?" — figure out *which dimension* is underspecified,
then ask about that. Common axes on this project:

| Axis | "улучши дашборд" could mean… |
| --- | --- |
| **Scope** | one strategy page vs the whole dashboard |
| **Metric / goal** | render perf vs new information vs visual polish |
| **Approach** | quick patch vs proper refactor |
| **Surface** | desktop vs mobile; one component vs the design system |
| **Acceptance** | "looks better" vs a concrete, checkable criterion |

If you can't name the axis, the request probably isn't ambiguous — just act.

## Step 2 — Draft candidate directions

From the axis, draft the 3–5 outcomes the request could plausibly mean.

## Step 3 — Vet each candidate against memory (don't skip)

Before offering them, check each candidate against claude-mem — a cheap search
per uncertain candidate (~250ms each; you're already running, so it's nearly
free). This is not "one broad recall for backdrop" — it decides which directions
survive:

- **Already done / recently reworked** → drop it or down-rank it. *(Measured
  failure: offering "polish the leaderboard visuals" when memory shows the badges
  and header styling were just reworked (#8120) — a stale direction.)*
- **Tried and rejected before** → drop it, or surface *why* so the user re-decides
  knowingly instead of re-opening a settled call.
- **A live, unresolved gap** → elevate it, and make it your recommendation *(e.g. a
  signal the code computes but hides — LP-borrow BTC folded into `terminal.btc`
  with no separate field, #6056)*.

The recommendation must be **memory-backed**, not a guess. This is where x and y
interleave: recall doesn't just fill context, it decides which y-directions are
even worth offering.

## Step 4 — Offer the survivors via AskUserQuestion

Call **AskUserQuestion** with:
- a short **header** naming the axis (e.g. "Scope", "Approach");
- the **2–4 surviving, mutually-exclusive options**, each a real outcome with its
  one-line trade-off — not vague labels;
- your memory-backed **recommendation first**, marked, with a reason.

Options must be distinct outcomes the user chooses *between*, not a feature
checklist. If two options aren't really exclusive, you've picked the wrong axis.

## When NOT to clarify

- A reasonable default exists and a wrong guess is cheap to reverse → make the
  call, state the assumption, proceed. Asking then is friction, not care.
- The answer is already in the conversation, the code, or memory → use it (that's
  an `x` lookup via /recall, not a `y` question).
- The choice is conventional (naming, formatting, obvious library) → just pick.

Reserve the question for goal-level forks where your answer changes *what you
build*, not how you phrase it.

## Relation to the loop

The `recall-context` hook nudges you to diagnose, every prompt, whether you lack
**x** (→ /recall) or **y** (→ /clarify). This skill is the y-branch: a small,
deliberate act of turning an ambiguous ask into a chosen direction before you
spend effort in the wrong one.

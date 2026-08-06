# Transfer eval — protocol, committed BEFORE the dataset is built

Written 2026-07-31, before sourcing a single case. A live `/2nd` run on the decision to run this
cycle returned **`adjust`** with two blockers, both addressed here:

> *"A cycle that cannot return a disconfirming answer is decoration. What number would make us stop
> shipping the cold arm — and can 8-10 cases produce it?"*
> *"6 of 8 cases are flawed by construction, a 75% base rate. In live use the dominant failure is a
> false `adjust` spending the user's attention on a sound plan."*

## Why this dataset is not a repeat of the last one

`RESULTS-2nd.md` reports v3 mandate numbers measured on the **same 8 meta cases the v3 wording was
tuned against** (v1 → v2 → v3 were three rewrites judged by that dataset's output). Those numbers
are therefore partly in-sample. The sib-sourced set is the first genuine **held-out** test of the
shipped v3 mandate — no wording will be tuned on it.

## Composition (fixed now, not after seeing results)

- **Target ~8 sound / ~4 flawed**, inverting the meta dataset's 75% flawed base rate. Live use is
  mostly sound plans, so the dominant real-world failure is a false `adjust`, not a miss.
- **Labels are NOT assigned by the designer.** Each case is sourced by tracing an engineering
  decision *forward* through the project record; whether a flaw materialized falls out of the
  trace. Pre-labeling would rebuild the exact circularity Open UU #4 complains about.
- **Source is private, unpublished work**, closing the third blind spot the audit raised: plans
  with publicly documented endings (postmortems, RFCs, ADRs) are in the training corpus, and the
  cold arm would then score by recall of the ending rather than by reasoning.

## Primary metric — false-`adjust` rate, not core-recall

The audit is right that n≈12 cannot separate 83% from 72% core-recall; that gap is under one
sample. But the **false-`adjust` rate on sound plans is separable at this n** — a probe that
blocks 8 of 8 sound plans is unmistakable at a glance. That is exactly how the dead verdict
channel was found. So:

- **Primary:** arm B's false-`adjust` rate on sound cases.
- **Secondary:** core-recall on flawed cases (reported with the explicit caveat that it cannot
  separate the arms at this n).

## Pre-committed decision rule

| outcome on sound cases | outcome on flawed cases | what we do |
| --- | --- | --- |
| false-`adjust` > 50% | any | **The verdict channel still fails.** v3 did not generalize; `/2nd` is not fit as an always-on probe and the mandate needs another revision before it is recommended by default. |
| any | core-recall < 50% | **No transfer.** The probe does not carry outside the meta domain; stop recommending it beyond this repo and say so in the README. |
| false-`adjust` ≤ 30% | core-recall ≥ 70% | **Transfer supported.** `/2nd` earns its always-on recommendation. |
| anything between | | **Inconclusive** — reported as inconclusive, not spun as support. |

**No re-tuning on this set.** If these results motivate another mandate revision, the revision must
be validated on a further held-out set, not re-scored here. Tuning and validating on one dataset is
the failure this repo has already caught twice (`mode-88`, and the v1→v3 sequence above).

## Known limits of this protocol

- ~6 weeks of downstream history per case, not months. Better than the meta dataset's days, still
  short for "no problem materialized" to mean much.
- The referee is still a single LLM (Open UU #4's proxy-labeler problem, one level up).
- Cases are genericized paraphrases of private work; genericization can shave off the very
  specificity an auditor needs. Recorded as a threat to validity, not solved.

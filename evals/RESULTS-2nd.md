# /2nd — hit/false-alarm A/B + independence ablation: results

> **Provenance — these numbers were produced under a harness leak.** The eval subprocess was not
> context-less: inherited hooks put a claude-mem memory digest in its context, and a `cwd` inside
> this repo put the yfx project guide and `gitStatus` there too. Fixed in `lib.mjs`; measured in
> [`RESULTS-isolation.md`](RESULTS-isolation.md).
>
> What that costs this document is **not directly measured**. The attribution work in
> [`RESULTS-isolation.md`](RESULTS-isolation.md) ran **arm B only, under the verdict-free
> mandate**, on the meta dataset — so it does not, by its own Limits, establish anything for the
> numbers below. What it found there: `core-recall` is unaffected by either role's leak state;
> the **`known` classification is distorted by the referee**; and `hits` / `empty` / `precision`
> all moved in the direction of looking better than they are, though none of that separation is
> established at the available n.
>
> Whether those carry over here is the open question, not the finding. Treat the classification
> columns below as unverified rather than as either sound or refuted. Issue #14 tracks the
> re-measurement.


Harness: `second-opinion.mjs` over `second-dataset.jsonl` (8 plans from this repo's own design
record: 6 whose core flaw later materialized + 2 controls). Arms: **A** self-audit with
manufactured in-context stake, **B** cold + neutral distillate (`/2nd` as shipped), **C** cold +
the author's full rationale, **D** = B on haiku. Hindsight referee, blind to arm identity.

Three mandate versions were tested, each a rewrite of the verdict rule in `skills/2nd/SKILL.md`:

| | verdict rule for `adjust` |
| --- | --- |
| **v1** | (none — `proceed`/`adjust`/`don't-build` defined, no cost attached) |
| **v2** | + "a false `adjust` is not free"; bar = *you would bet the plan fails* |
| **v3** | bar = *decision-changing **and** costly to reverse* (irreversibility axis) |

## v3 merged (k=3, 8 cases; 5 cases from the full run + 3 refilled after a host-sleep interruption)

| arm | core-recall (flawed) | verdict-ok flawed | verdict-ok control | hits | empty (FA) | precision |
| --- | --- | --- | --- | --- | --- | --- |
| A self | 72% (13/18) | 100% (18/18) | 17% (1/6) | 25 | 16 | 61% |
| **B cold (shipped)** | **83% (15/18)** | 89% (16/18) | **50% (3/6)** | 26 | 20 | 57% |
| C primed | **94% (17/18)** | 94% (17/18) | **50% (3/6)** | 30 | 17 | 64% |
| D haiku | 65% (11/17) | 100% (17/17) | 33% (2/6) | 21 | 19 | 53% |

`verdict-ok` is reconstructed from the verdict for the 5 cases run before the per-cell `vok`
counter was added; the rule is deterministic (flawed → `adjust`/`don't-build`; control →
`proceed`) and was verified against the refilled cells where both are present.

## What the three versions establish

1. **`/2nd` earns its keep.** Arm B catches the core materialized flaw in 83% of flawed samples,
   stable across all three mandate versions (v1 5/6, v2 5/6, v3 15/18).
2. **Independence is the mechanism — confirmed, with one exception.** Cold arms beat the invested
   self-audit on core-recall in every run (v3: B 83% / C 94% vs A 72%). A's two misses in v1 were
   the two identity-threatening cases ("you extracted the wrong half of your own framework") —
   exactly where the theory predicts self-audit fails. The exception: survivorship bias in
   `clarify-rule` was caught by the self arm first (v1), and in v3 A missed it entirely (0/3) —
   this case is noisy for every arm.
3. **The "don't prime the lens" rule is NOT supported.** C (cold but given the author's full
   rationale) is B's equal or better: v1 B>C, v2 B=C, v3 C>B on core-recall (94% vs 83%),
   precision (64% vs 57%) and verdict accuracy. Across runs it is a coin flip — no evidence that
   priming a *cold* agent with the author's reasoning damages the lens. What matters is **who
   audits (cold vs invested)**, not what they are told. The skill's step-2 instruction should be
   softened or dropped pending a larger n.
4. **Model diversity adds nothing beyond fresh context.** D (haiku) trails B on core-recall in
   every run and produces the most empty objections. The active ingredient is cold context, not a
   different model.

## The verdict-channel fix (v1 → v3)

The unplanned v1 finding: the verdict channel did not discriminate — **zero `proceed` verdicts in
24 samples**, including on sound control plans. The mandate ("assume it may be wrong", "do not
validate") burned out the true-negative, so `/2nd` always spent user attention (caveat #2).

- **v2** (bar = "you would bet the plan fails") introduced `proceed` but over-corrected: on
  `readiness-extract` arms B and D **caught the core flaw and still said `proceed`** — the bar was
  wrong, because that defect does not make the plan fail, it locks in a wrong framing.
- **v3** (bar = decision-changing **and** costly to reverse) fixed that case (B: `adjust`×2,
  core 3/3) and produced a stable `proceed`×3 from both cold arms on the clean control
  `control-hooks`.

**The trade, stated honestly.** Arm B's verdict accuracy on controls went 0% → 50%, paid for with
flawed-case accuracy 100% → 89% (2 of 18 samples downgraded to `proceed`). The cost is smaller
than it looks: in `readiness-extract` the `proceed` sample still surfaced the core blind spot
(core 3/3) — the objection reached the user, only its label was demoted.

**`control-extract` is not a clean control.** All arms still return `adjust` on it. Its
`resolution` reads "no problem has materialized" over an observation window of *days* — absence of
evidence, not evidence of soundness. Objections like "n=1 may not generalize" are scored `empty`
by the referee purely because nothing has surfaced yet. Over-flagging measured on this row is
unreliable; `control-hooks` (a conservative off-by-default decision) is the trustworthy control,
and there the fix works cleanly.

## Caveats

- **n=8, k=3, single referee.** An LLM referee can pattern-match generic criticism ("your
  validation is circular") onto a real flaw. This inflates all arms equally, so **between-arm
  comparison is the robust readout**; absolute hit rates are not.
- **All cases are meta** — plans about this framework itself. Transfer to ordinary engineering
  plans is untested.
- **One control is weak** (see above), so the false-alarm measurement rests effectively on a
  single row.
- **Host sleep corrupts runs.** A sleeping laptop kills every in-flight `claude -p`; the tell is a
  contiguous block of `err` followed by full recovery (a rate limit degrades and does not
  self-heal). Refill with `ONLY=id1,id2`.

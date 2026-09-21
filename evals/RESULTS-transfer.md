# Transfer eval — results (held-out, non-meta dataset)

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


Run per [`PROTOCOL-transfer.md`](PROTOCOL-transfer.md), whose composition and decision rule were
committed **before** a single case was sourced. Dataset: `second-dataset-transfer.jsonl` — 12
engineering decisions from a private, unpublished project, each captured before the irreversible
step and traced forward through the project record; **8 sound / 4 flawed**, labels falling out of
the forward trace rather than assigned by the designer. Arms A (self-audit) and B (cold = `/2nd`
as shipped), k=3. Arms C and D were not run: the ablation is answered on the meta dataset and
neither appears in the decision rule.

## Numbers

| arm | core-recall (flawed) | false-`adjust` on sound | verdict-ok flawed | hits | empty | precision |
| --- | --- | --- | --- | --- | --- | --- |
| A self | 50% (6/12) | 79% (19/24) | 83% (10/12) | 12 | 37 | 24% |
| **B cold (shipped)** | **67% (8/12)** | **88% (21/24)** | 75% (9/12) | 17 | 37 | 31% |

## The pre-committed rule fires — first row

> *false-`adjust` > 50% → **The verdict channel still fails.** v3 did not generalize; `/2nd` is not
> fit as an always-on probe and the mandate needs another revision before it is recommended by
> default.*

Arm B returned `proceed` on only **3 of 24 samples across 8 sound plans**. On the meta dataset the
same mandate produced a stable `proceed`×3 on the clean control and looked fixed. It was not fixed;
it was fitted. Three of the eight sound plans drew `adjust` in all three samples from both arms.

Core-recall lands at 67% — above the 50% "no transfer" floor, below the 70% "transfer supported"
bar. By the rule that is **inconclusive on detection, failed on precision**, and it is reported as
such rather than spun as partial support.

## What this vindicates

- **The held-out design.** `RESULTS-2nd.md`'s v3 numbers were measured on the same 8 cases the v3
  wording was tuned against. This run is the first out-of-sample test and it reverses the headline
  conclusion. Every future mandate revision must be validated this way.
- **The `/2nd` run on this very cycle.** Before any of this was built, an independent audit of the
  plan to build it returned `adjust`, and its second blind spot read: *"The dataset measures recall;
  the probe's real cost is precision — and the ratio locks at build time. 6 of 8 cases are flawed by
  construction, a 75% base rate. In live use the dominant failure is a false `adjust`."* That is
  exactly what happened. Second in-vivo win for the independent lens, this time predicting a result
  rather than catching a framing error.
- **Independence still holds.** B beats A on core-recall (67% vs 50%), consistent with every prior
  run. What fails is verdict calibration, not the cold lens itself. The two claims are separable and
  only one broke.

## Reading the failure

The mandate tells the auditor to assume the plan may be wrong and not to validate it. The v3 bar
("decision-changing AND costly to reverse") was tuned until it produced `proceed` on the meta
dataset's two controls — but those controls were thin, and one of them was itself unsound (days-long
observation window). Against eight real, well-argued engineering plans the bar collapses: a
sufficiently thorough auditor can always name an axis that is both decision-changing and hard to
undo, because real plans always have open dimensions. The bar is stated in terms the auditor can
always satisfy.

## Caveats

- **n=12, k=3, single LLM referee.** Between-arm comparison is the robust readout; absolute rates
  are not.
- **Referee noise is visible in this run.** It awarded `hit` labels on sound cases, where no problem
  materialized and hits should be impossible by construction — 5 in one cell. Treat the hit counts
  here as softer than the verdict counts.
- **~6 weeks of downstream history per case**, not months. "No problem materialized" is weaker
  evidence than it sounds; some sound cases may be unfalsified rather than sound.
- **Cases are genericized paraphrases of private work.** Genericization can shave off the
  specificity an auditor needs, which would depress detection independently of the probe.
- **Two arms only**, stated in the run header, not silently dropped.

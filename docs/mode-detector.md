---
name: mode-detector
description: Fresh-agent classifier that labels a move discovery vs delivery; use to pick the mode-conditional defaults
---

Detects the mode (discovery vs delivery) of a MOVE so the right defaults apply — see the
mode section of [[convergence-protocol]]. Chosen form (2026-07-26): a **fresh-agent classifier**,
NOT me classifying myself — self-classification has a systematic pull toward delivery (less work
for me), which is exactly the failure the detector exists to prevent (same structural blindness as
[[uu-fresh-lens]] #2). Independence IS the mechanism.

**Invocation:** spawn `Agent` (subagent_type `claude`, synchronous), hand it the classifier
mandate below + the move(s) with a one-line warm/cold context note. It returns
`<id> | discovery|delivery | confidence | <=12-word why`. Fire it on genuinely ambiguous /
open moves, not on warm directive streams.

**Classifier mandate (the reusable prompt):**
- delivery = y already exists (user's head or objectively determined); work is to realize a fixed y; speed is pure good.
- discovery = y does not yet exist for anyone; co-constructed; naming y early forecloses a better unseen y; lever is WIDEN not sharpen.
- Signals — discovery: open verbs (improve/explore/what-if/should-we/"давай подумаем"), no stateable acceptance, about direction not a named target, user sounds uncertain, cold/novel. delivery: imperative+named target, binary/testable acceptance, warm context where y was just established, reference to an existing artifact.
- **Critical rule:** mode is per-MOVE not per-session; a discovery session flips to delivery the moment a candidate y is COMMITTED ("build the thing we just chose" = delivery).
- **Bias guard:** when genuinely split AND discovery signals are actually present → discovery. Do NOT trigger merely on low confidence: a pre-existing y (pure lookup, or named testable target) is delivery regardless of confidence.

**Validation (2026-07-26):** ran on 8 real moves from this + the Jul-21 session vs my hand-labels
→ **7/8**. Correctly nailed the hard commitment-flip case ("пилить детектор" = delivery though the
topic was exploratory). The one miss (a cold memory lookup mislabeled discovery) exposed a real
bias-guard bug — it fired on low confidence rather than on present discovery signals — fixed in the
mandate above (the "Do NOT trigger merely on low confidence" clause). Dogfood caught its own bug.
Re-run with the fixed guard flipped the lookup to delivery @0.90 while genuine-discovery controls
stayed discovery → **8/8**, output-discipline held (clean table, no thinking-out-loud).

**L0 blind-label replay (2026-07-27, `evals/`):** the 8/8 above was scored against MY hand-labels
(caveat #4 below). An independent replay — the classifier reads the *shipped* mandate foresight-only
(prompt + warm/cold note), while ground truth is labeled by a SEPARATE agent from what each move
actually resolved to (hindsight), never seeing the mandate or my labels — found the shipped mandate
STILL classified **M1** ("у тебя есть в памяти по y=f(x)?", a cold lookup) as *discovery*: the
claimed @0.90 fix had never actually landed in the artifact, because the "cold/novel" discovery
signal overrode the buried "pure lookup = delivery" clause. This directly contradicts the "→ 8/8,
fixed" claim above — on independent replay the shipped skill was **7/8**. Fixed by making the
lookup/recall carve-out explicit in BOTH the delivery definition and the signals line of the
mandate. **After the fix: mode 8/8 against independent hindsight truth, echo 0** (M1 now delivery
@0.90, its stated reason citing the carve-out; genuine-discovery controls M2/M5/M7 held). This is
the first mode validation NOT scored against my own labels. (Route probe alongside: 6/6 substantive,
one strict-equality artifact where the classifier's `both` ⊇ the truth `y`.) Run it:
`cd evals && node classify.mjs && node label-blind.mjs && node score.mjs`.

**Open:** the classifier "thought out loud" before emitting the table despite "output ONLY the table";
tighten output discipline when this becomes a skill (see the spawned chip). Independent truth here is
still an *agent* proxy, not the user — the gold tier is user-supplied labels (see `evals/README.md`).

**Caveat (fresh-lens round-2, 2026-07-26):** the 8/8 was scored against MY hand-labels, so it proves
the classifier agrees with me, not that it recovers the USER's actual intent — and mode is the user's
private intent, which can flip mid-sentence with no surface signal. A confident misread inverts the
defaults at commitment boundaries (highest-cost moment). Real validation = against user-stated intent,
or make mode user-declarable. See the Open UU block in [[convergence-protocol]] (#4).

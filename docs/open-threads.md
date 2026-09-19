# Open threads & state

Where the y=f(x) work stands, for a session picking it up fresh. Written 2026-07-26.

## How we got here (this session)

Starting from the stored `convergence-protocol` (y=f(x): iterate x until output y satisfies),
we — in order — (1) committed the rule that the agent calls `/clarify` itself on ambiguous
moves; (2) ran a test over ~22 real historical prompts and found the binding risk is
*over*-clarify (friction on warm directives), not under-clarify; (3) built the **fresh-lens**
idea — an independent agent catches what the executor can't — and dogfooded it live (it caught
that an inline self-watcher would be theater); (4) split work into **discovery vs delivery**
modes with opposite defaults; (5) built and validated the **mode detector** (8/8) as a fresh-agent
classifier; (6) packaged both passes into the **`/fresh-lens`** skill; (7) added an **exogenous
commitment-boundary trigger** hook so invocation isn't the executor's discretion; (8) a round-2
fresh-lens audit on the whole effort surfaced 5 new unknown-unknowns; (9) extracted the framework
into this `yfx` repo and removed the skills from the origin project.

## Update 2026-07-27 — L0 testing + founding premise

- **How to test the framework (chosen: L0 blind-label replay).** The problem: every probe except
  the recall retrieval eval (which had an external gold standard) was validated against the
  designer's own labels — the mode "8/8" proves agreement with *me*, not truth (caveat #4). L0
  breaks the circle by splitting three roles that see
  *different information*: the **classifier** reads the shipped mandate foresight-only; an independent
  **truth labeler** sees what the move actually resolved to (hindsight), never the mandate or my
  labels; the **scorer** also measures *echo* (classifier matched my label, but my label was wrong).
  Built in `evals/` (`dataset.jsonl`, `classify.mjs`, `label-blind.mjs`, `score.mjs`,
  `README.md`). The gold tier is still unbuilt: **user-supplied** labels, which is what finally
  answers caveat #4 — the agent labeler is only a proxy.
- **First result.** On the original 8 mode moves + 6 routing prompts: the replay caught that the
  shipped mandate still misread **M1** (cold lookup) as discovery — the "@0.90 fix" from 2026-07-26
  had never landed in the artifact. Fixed with an explicit lookup/recall carve-out. **After the fix:
  mode 8/8 vs independent hindsight truth, echo 0; route 6/6 substantive.** This corrects the
  mode-detector's "8/8 fixed" claim (it was 7/8 on independent replay pre-fix) — see
  `docs/mode-detector.md`.
- **Founding premise now recorded (README).** The whole loop assumes **every `y` has a reachable
  `x`** — that the target lives in the image of `f`. It's a premise, not a theorem: an unreachable
  `y` makes the convergence ritual adjust `x` forever instead of quitting. Directly compounds
  open UU #3 (no decline/null terminal — no exit for an out-of-range `y`).
- **Abstract core extracted + efficacy-tested (`readiness.md`).** Lifted the x/y diagnosis into a
  tool-agnostic probe (`ready | need-x | need-y | need-both`) that reads only the transcript, so it
  ports to Codex (`examples/AGENTS.md`) or any agent. Then tested the sharp question — *does it change
  anything, or is that logic already inside the model?*
  - **Naive A/B** (`evals/readiness-try.mjs`): baseline handed an act/ask/retrieve menu + answer-
    leaking context → **0/9 changed**. But that test was rigged toward null (the menu is half the
    probe; the context leaked the answer).
  - **Fair A/B** (`evals/readiness-fair.mjs`): clean baseline (model just begins its response, an
    independent judge labels the move), neutral context, k samples → **baseline 67% → probe 89%,
    +22 pts**. Value concentrates in *consistency*: on trap-x the baseline is unstable (67% — sometimes
    asks instead of retrieving) while the probe is 100%; on obvious trap-y it's already inside
    (100%/100%). Caveats: judge noise likely inflates the clear-case gap (baseline preamble read as a
    pause); the probe *hurt* once on a subtle trap-y (over-flagged); n=6, k=3.
  - **Read:** the x/y self-probe is modest edge-case insurance, not a transformation — much of it is
    already inside a strong model. The non-redundant value is the independent **fresh-lens (UU)**,
    which a self-check cannot replicate. That's the next focus.

## Next — chosen directions (2026-07-27)

Picked after the efficacy pass: the x/y self-probe is largely internalized in a strong model,
while the independent audit carries the non-redundant value. The in-vivo UU test made it concrete
— a cold agent surfaced load-bearing blind spots the *invested* executor missed (e.g. "you
extracted the self-probe as the core and baked the self-audit blindness back in"). These three
compose into one move: reposition the framework around the independent lens.

1. **Center independence as an architectural principle** — *corrected 2026-07-28 by a live `/2nd`
   run on the repositioning plan itself* (dogfood; verdict `adjust`). The original wording was
   "make fresh-lens the core, demote the x/y probe." The independent audit corrected it:
   - **Pipeline, not ranking.** The independent lens likely wins *because* x/y ran first — it
     red-teams a concrete artifact. x/y (cheap, always-on) is the setup that *feeds* the occasional,
     expensive independent pass. Demoting x/y would break the condition under which the lens wins.
   - **The durable asset is independence-as-architecture**, not "this probe won." x/y also stops
     being redundant off the frontier model, so it stays as the always-on floor.
   - **Open before crowning `/2nd`:** it was promoted on n=1. It needs its own hit / false-alarm
     A/B — the same bar x/y was held to — before it headlines. **PAID 2026-07-31** — see the
     update below and [`evals/RESULTS-2nd.md`](../evals/RESULTS-2nd.md).
2. **`/2nd` — a "second opinion" command.** The fresh-lens made dead-simple: before an irreversible
   step, spawn a fresh cold agent to red-team the current plan. Shipped (`skills/2nd/SKILL.md`).
3. **A "kill / not-worth-building" verdict.** Give the framework a terminal for "the honest answer
   is no" — closes open UU #3. Shipped as `/2nd`'s `don't-build` verdict.

(Not chosen this round: better exogenous triggers — open UU #1.)

## Unresolved — do not silently contradict

**The 5 open UU / caveats** (full text in `convergence-protocol.md` → "Open UU / caveats"):
1. **Trigger blindness** — *partially* addressed: the commit-boundary hook makes the audit
   trigger exogenous. STILL OPEN: decisions that lock via a memory-write (not a git commit), and
   confident non-commitment moves — the hook doesn't cover those.
2. **Attention as a finite budget** — every probe spends the user's engaged attention; nothing
   meters it or distinguishes real assent from fatigue-assent. Unbuilt.
3. **No decline/null terminal** — y=f(x) has no value for "don't build this / the answer is no";
   the convergence ritual manufactures a y for asks that deserve a kill. No abstain outcome, no
   kill-authority. Unbuilt.
4. **Mode is the user's private intent, not a surface property** — the detector's 8/8 is agreement
   with the executor's own labels, not the user's truth. Validate against user-stated intent, or
   make mode user-declarable. Unbuilt.
5. **Memory persist = lock-in priced at zero** — n=1, days old, frozen into standing default.
   Separate *durable rationale* from *active default*; treat these decisions as **provisional**.

## Update 2026-07-28 — the nature of f (new frame, unvalidated)

New conceptual thread in [`docs/nature-of-f.md`](nature-of-f.md). Two moves worth the design record:

- **Two lever classes, only one named so far.** `x`-levers change what `f` is conditioned on
  (`/recall`, `/clarify`); **`f`-levers** change or augment the transformation (model choice, the
  hooks, and `/fresh-lens` — which adds a *second operator alongside `f`*, not more `x`). Refines
  the README's "`x` is the only knob" (true within a session, not the whole story).
- **The equation upgrades to `y ≈ combine( f(x), g(x) )`.** `f` has a knowable drift (precondition
  `x` to cancel it) and is structurally blind to itself (so add independent `g` = `/fresh-lens`,
  `/2nd`). This is the same pipeline finding from below, stated as a model: `f(x)` feeds the artifact
  `g` red-teams; `g` is a second *term*, not a ranking above `f`.
- **Status: argument only, n=0.** It *predicts* `g` adds non-redundant value — exactly what the
  still-owed `/2nd` hit/false-alarm A/B must show. `combine` is undefined (assumes user attention,
  caveat #2). Doesn't touch the reachability / null-terminal gap (caveat #3).

## Update 2026-07-31 — the `/2nd` A/B is paid; two decisions it contradicts

Built `evals/second-opinion.mjs` + `second-dataset.jsonl`: 8 plans from this repo's own design
record, captured **before** the irreversible step, 6 with a materialized core flaw + 2 controls,
scored by a hindsight referee blind to arm identity. Four arms on the **shipped** mandate: A
self-audit *with manufactured in-context stake* (defend first, then audit — this fixes the
"neither arm had real stake" flaw of the earlier subprocess UU test), B cold + distillate (`/2nd`
as shipped), C cold + the author's full rationale, D = B on a weaker model. Full numbers and
caveats: [`evals/RESULTS-2nd.md`](../evals/RESULTS-2nd.md).

- **`/2nd` earns its keep.** Arm B catches the core materialized flaw in **83%** of flawed samples
  (k=3), stable across three mandate revisions. The debt above is paid.
- **Independence confirmed as the mechanism.** Cold arms beat the invested self-audit on
  core-recall in every run (83–94% vs 72%), and A's misses landed on the *identity-threatening*
  cases — exactly where the theory predicts self-audit fails. This is the first evidence for
  `g` in `y ≈ combine(f(x), g(x))` ([[nature-of-f]] was n=0); the frame now has one result under it.
- **Model diversity adds nothing** beyond cold context (D trails B everywhere).

**Contradicted decision #1 — the verdict channel was broken, now fixed.** Unplanned finding: on
the v1 mandate there were **zero `proceed` verdicts in 24 samples**, including on sound control
plans. "Assume it may be wrong / do not validate" burned out the true negative, so `/2nd` *always*
spent user attention — compounding caveat #2. Two rewrites: v2 ("you would bet the plan fails")
over-corrected — arms caught the core flaw and still said `proceed`. v3 ships the working bar:
**decision-changing AND costly to reverse**. Result: stable `proceed`×3 from both cold arms on the
clean control, paid for with flawed-case verdict accuracy 100% → 89%. The cost is partly nominal —
the downgraded samples still *surfaced* the blind spot, only the label demoted.

**Contradicted decision #2 — "don't prime the lens" is unsupported.** `skills/2nd/SKILL.md` step 2
says not to hand the fresh agent your reasoning ("that infects the lens"). Arm C does exactly that
and is B's equal or better (v1 B>C, v2 B=C, v3 C>B — a coin flip across runs). What is load-bearing
is **who audits (cold vs invested)**, not what they are told. **Left in the skill unchanged** — the
data says "no evidence priming hurts", which is not the same as "priming helps", and n is small.
Recorded here so it is not treated as validated. Resolving it needs a larger dataset.

## Update 2026-07-31 (later) — the verdict fix did NOT generalize

Same day, held-out test. The update above reports the verdict channel as fixed by the v3 mandate.
**On out-of-sample data it is not.** Corrected here rather than left standing.

A live `/2nd` run on the decision to run this cycle returned `adjust`, and its blockers shaped the
design: composition fixed in advance at 8 sound / 4 flawed (inverting the meta set's 75%-flawed base
rate), the primary metric switched from core-recall to **false-`adjust` rate**, the decision rule
written down before sourcing, and cases drawn from **private, unpublished** work so the cold arm
cannot be scoring by recall of a published ending. Protocol: [`evals/PROTOCOL-transfer.md`](../evals/PROTOCOL-transfer.md).
Results: [`evals/RESULTS-transfer.md`](../evals/RESULTS-transfer.md).

| arm | core-recall (flawed) | false-`adjust` (sound) |
| --- | --- | --- |
| A self | 50% | 79% |
| B cold (shipped) | 67% | **88%** |

- **The pre-committed rule fires on its first row:** false-`adjust` > 50% ⇒ the verdict channel
  still fails, v3 did not generalize, and `/2nd` is **not fit as an always-on probe**. Arm B
  returned `proceed` on 3 of 24 samples across 8 sound plans. Three sound plans drew `adjust` in
  all three samples from both arms.
- **Why v3 looked fixed:** it was tuned until it produced `proceed` on the meta set's two controls
  — one of which was itself unsound (days-long observation window). The bar ("decision-changing AND
  costly to reverse") is stated in terms a thorough auditor can nearly always satisfy, because real
  plans always have open axes.
- **Core-recall 67%** — above the 50% no-transfer floor, below the 70% transfer-supported bar.
  **Inconclusive on detection, failed on precision.** Reported as such, not spun as partial support.
- **Independence survives.** B > A on core-recall (67% vs 50%), consistent with every prior run.
  Verdict *calibration* broke; the cold lens did not. The two claims are separable and one held.
- **`/2nd` predicted this.** Its second blind spot on this very cycle read: *"the dataset measures
  recall; the probe's real cost is precision — and the ratio locks at build time."* Second in-vivo
  win for the independent lens, this time predicting a result rather than catching a framing error.
- **No re-tuning on this set.** The next mandate revision must be validated on a further held-out
  set. Tuning and validating on one dataset is the failure this repo has now caught three times.
- `skills/2nd/SKILL.md` carries a "Known limitation" note: read an `adjust` as *"here is the axis
  you did not voice"*, not as *"this plan is not ready"*. The mandate itself is unchanged.

## Update 2026-07-31 (latest) — roles split: `g` finds, `f` costs, the user judges

Response to the failure above. Three verdict rewrites failed in a row, and the pattern says the
problem was never the wording: a thorough auditor can satisfy any severity bar, because real plans
always have open axes — and severity needs reversal cost, stakes and schedule, which a cold agent
cannot see **by construction**. `g` was being asked for a judgment its own independence denies it
the inputs for.

So `/2nd` no longer issues a verdict:

- **`g` finds.** Ranked unvoiced axes, each with `changes_if_true` (what would concretely differ),
  explicitly forbidden to rate severity or say whether to proceed. The "should this exist at all"
  axis is named as a finding when the plan takes its own desirability for granted.
- **`f` supplies what `g` lacks** — applicability (with a checkable reason) and cost now vs cost
  late. Explicitly **not** importance: that is where `f`'s documented delivery drift
  ([[mode-detector]]) hides.
- **The user adjudicates**, and only where the two disagree. `f` must always escalate an axis it
  cannot dismiss with evidence, and must *always* escalate "should this be done at all" — it is the
  party with the least standing to close that one.

**This is the first concrete definition of `combine`** ([[nature-of-f]], updated). The two halves
carry opposite biases — `g` toward "everything blocks" (88%, measured), `f` toward "nothing blocks"
— so spending user attention only on the disagreement is what makes it affordable against caveat #2.

**The `don't-build` terminal moved rather than vanished.** It is now a user outcome reached through
escalation, not a verdict `g` issues. Open UU #3 stays addressed, but by a party that can actually
see the stakes.

**Status: unvalidated, twice over.** The reconciliation half has never been measured, *and* the
finding half's 67% was measured on the previous mandate — this one drops the verdict and adds a
field, so that number does not carry over. Both need a **further held-out set**;
`PROTOCOL-transfer.md` forbids re-scoring this revision on the transfer data, and doing it anyway
would be the fourth instance of the failure that caused the redesign. The harness now runs
verdict-free (verdict columns drop out rather than printing a misleading 0%) and still scores older
verdict-bearing mandates, so the recorded runs stay reproducible.

**New open threads from this work:**
- **One control is not a control.** `control-extract`'s "no problem materialized" rests on an
  observation window of *days*; the referee scores "n=1 may not generalize" as `empty` only because
  nothing has surfaced yet. False-alarm measurement effectively rests on the single `control-hooks`
  row. Needs controls with a real observation window.
- **All 8 cases are meta** (plans about this framework). Transfer to ordinary engineering plans
  is untested — the same n=1 caveat the README carries, one level up.
- **The referee is an LLM.** Generic criticism can pattern-match a real flaw; this inflates all
  arms equally, so only *between-arm* comparison is robust. A user-labeled tier is the gold
  standard here too (same as Open UU #4).

**Other threads:**
- **Not installed anywhere active.** The framework currently only works when running Claude
  *inside* this repo. To use it in other projects, install into user-global `~/.claude/`
  (skills + hooks + settings wiring) or symlink — see README "Activating it where you work".
- **Survivorship bias in the /clarify-rule test** — the ~22-prompt sample only contains asks the
  user still brings; the class of asks they stopped bringing is invisible. The "over-clarify is
  the binding risk" conclusion rests on that biased sample.
- **Classifier output discipline** — the mode classifier sometimes "thinks out loud" before the
  table despite instructions; tighten when it hardens into a shipped skill.
- **discovery/delivery not wired to a trigger** — the detector exists as an on-demand pass but
  nothing fires it automatically at move-start.

## Update 2026-09-18 — memory decoupled: a provider is prose, not an adapter

**What changed.** The framework no longer retrieves memory. A memory provider is now a **capability
card** — prose the agent reads (`providers/*.md`, reached via the `skills/memory-provider.md`
symlink) declaring six axes: tool, query language, citable ids, expansion, scope, auto-injection.
Cards ship for `mem0` (default), `claude-mem`, and `none`. There is no adapter interface, no
transport layer, no JS to implement — switching is `npm run provider <name>`.

`hooks/recall-context.mjs` went from 313 lines to 117: the frequency-ranked identifier harvest,
the transcript scrape, the anchorless-prompt skip, the per-session id dedup and the claude-mem
HTTP client are gone. What remains is the x/y nudge, which never needed a provider.

**Why — measured, not argued.** `evals/PROTOCOL-memory-provider.md` was registered before data;
`evals/RESULTS-memory-provider.md` has the run (n=24, gold = identity, queries authored by a
context-less agent that saw only the memory). A pure-Cyrillic query retrieves the target memory in
**0/24** cases on claude-mem and **21/24** on mem0 (ratio 0.00 vs 0.88). The premise the harvest
rested on — "a raw non-English query retrieves ~0%" — is real and **provider-specific**. Keeping
the workaround in shared code would have hardcoded one provider's defect into the framework.

**What this contradicts, stated rather than slipped past.**
- The `recall-context` hook's own design rationale (its header argued the harvest was the point).
- The A/B behind it (+33% diagnostic reasoning, +100% recall intent) was measured on the version
  that **injected memory**. That result does not transfer to the nudge-only hook that now ships.
- `PROTOCOL-memory-provider.md`'s decision rule was written to partition *code* between `core/`
  and `providers/*.mjs`. Prose cards made that framing obsolete mid-run; the amendment at the
  bottom of that file records it. Thresholds were untouched and both providers landed far outside
  the inconclusive band, so no judgment call was made after seeing data.

**Newly open.**
- **The nudge-only hook is unvalidated.** It needs its own A/B; the old one no longer applies.
- **Card-pull is untested.** The whole design assumes an agent hitting an x-deficit will follow
  the link and read the card. Pull was chosen over push precisely because #15105 measured that the
  always-on x/y prompt *suppresses skill invocation* — but that makes compliance the load-bearing
  assumption, and nothing measures it yet. If agents skip the card, the fallback is worse than the
  old hardcoding: they will guess a tool name.
- **claude-mem users lose passive warm-thread retrieval.** They keep the SessionStart digest and
  `/recall`, and get nothing in between. Not measured as a regression; named as a known cost.
- **Still n=1 repository.** This removes the cross-provider question from guesswork, not the
  standing generalizability caveat.

## Update 2026-09-19 — card-pull measured; one claim made and retracted in the same day

The previous entry left two things open. One is now settled, one is not, and the not is the more
useful half.

**Settled: the card is load-bearing and gate 2 is closed.** `evals/RESULTS-card-pull.md`
(n=5/cell, four arms, two gates). Compliance was made observable by giving every arm four memory
tools with identical descriptions and schemas — `memory_search`, `recall_probe_a7f3`,
`search_observations`, `knowledge_lookup` — where only the card names the right one. A single
uniquely-named tool would not have worked: the model sees its own tool list, so naming a tool it
can already see proves nothing about having read anything.

- Control called a decoy **10/10** and the declared tool **0/10** — not the 1-in-4 of a blind
  pick. Without a card the agent reaches for `memory_search` systematically.
- Every arm with a card called the declared tool **1.00**, forced and unforced. The assumption
  the pull design rested on — that an agent follows the link and acts on the card — held.
- The card's other rows transfer too: `ru_query` tracks `declared` row for row (read the card →
  queried in Russian as `query_language: any` says; guessed a decoy → translated to English),
  and nobody invented an id, which `citable_ids: false` asks for.
- **Push suppresses skill invocation**: unforced `skill_used` 0.00 here, 0.20 in an earlier run —
  the only effect that reproduced with the same sign and size. #15105 holds. Push buys the tool
  name and loses the skill carrying the x/y diagnosis and the citation discipline. **Pull beats
  push: identical compliance, and only push pays.**

**Not settled, and retracted: the nudge does not demonstrably repair gate 1.** An earlier clean
run gave `unforced pull` 0.60 on `declared` and `skill_used`, and it was written up as "gate 1
leaks, the nudge repairs it 0.60 → 1.00". The repeat does not reproduce it: unforced `pull` is
1.00 unaided and `nudge` is *lower* on `skill_used` (0.80). Run-to-run spread at n=5 is as large
as the effect attributed to the nudge. **The nudge-only hook's re-validation debt, opened when
retrieval was stripped from it, stays open.**

**The method lesson, which cost more than the result.** Four harness bugs each produced a
confident, plausible, wrong table before being caught, and three of the four were found by a code
review rather than by the author:
- ambient hooks fire inside `claude -p` (`--strict-mcp-config` strips MCP but not hooks, and
  `--settings '{"hooks":{}}'` does not override them) — the claude-mem outage digest leaked into
  an agent's answer and changed its behaviour;
- symlinked skill dirs let the control arm walk `..` back into the real repo and read the real card;
- a card begins with `---`, which `claude -p` parses as a flag — it silently erased a whole arm;
- `null / 0.79` is `0` in JS, so a fully-skipped arm would have been enforced on a card as a
  measured `english_only` verdict.

In a repo that measures agent behaviour, the harness fails more quietly than the thing being
measured. Budget for an independent review of the harness, not only of the finding.

**Newly open.**
- **n is too small.** Every cell is 5 runs, and the retraction above is what that buys. Raise n
  before any cell here is cited as a result.
- **`evals/lib.mjs` has the same ambient-hook leak** and is NOT fixed. Every prior eval —
  the mode classifier, `/2nd`, the transfer set — ran with the claude-mem digest in the context
  of a supposedly context-less subprocess. Fixing it is three lines; deciding whether those
  results need re-running is not, so it is left as an explicit decision rather than folded in.
- **Synthetic task, one model, one day.** One invented three-file project and five Russian
  x-deficit questions. Nothing here separates a property of the framework from a property of the
  model that ran it.

## What shipped (done)

- `/fresh-lens` skill (detect + audit), mandates embedded.
- `fresh-lens-trigger.mjs` commit-boundary hook (verified on 4 input cases; off by default).
- Mode detector validated 8/8 after a bias-guard fix that the dogfood run itself exposed.
- Framework extracted to `yfx`; skills removed from the origin project (recall-context hook kept
  there — it's an independently-useful claude-mem backstop).

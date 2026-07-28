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
     A/B — the same bar x/y was held to — before it headlines.
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

## What shipped (done)

- `/fresh-lens` skill (detect + audit), mandates embedded.
- `fresh-lens-trigger.mjs` commit-boundary hook (verified on 4 input cases; off by default).
- Mode detector validated 8/8 after a bias-guard fix that the dogfood run itself exposed.
- Framework extracted to `yfx`; skills removed from the origin project (recall-context hook kept
  there — it's an independently-useful claude-mem backstop).

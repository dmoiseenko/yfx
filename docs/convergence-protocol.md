---
name: convergence-protocol
description: Protocol for fast convergence on what the user wants (the y=f(x) framing)
---

This framework models LLM work as y=f(x): iterating the prompt/context x until output y satisfies. The agreed protocol for speeding that up:

1. **Interview before generating** — if the task is underspecified, ask up to 3 targeted questions first (AskUserQuestion works well) instead of producing a full answer on a guessed interpretation.
   - **I call `/clarify` myself** (decided 2026-07-26): on ANY request with >1 valid interpretation I proactively offer 2–4 mutually-exclusive directions BEFORE acting — the user should not have to invoke it. Sharpening y (the goal) is a stronger lever than gathering x (context): a wrong y means I do the wrong thing fast and confidently; a wrong x is recoverable. Skip only on well-specified/trivial tasks.
2. **Breadth then depth** — offer 2–3 sketch-level directions, let the user reject; deepen only the survivor. User rejections carry more information than approvals.
3. **Short answers** — see [[response-format-short]].
4. **Persist decisions** — accepted/rejected directions go to memory, not just chat history, so new sessions start from distilled x.

**Why:** convergence speed = information per round-trip; the bottleneck was my verbose y drowning their one-line corrections.

**How to apply:** default to this in open-ended/discussion tasks; for well-specified coding tasks just execute.

## Mode: discovery vs delivery (added 2026-07-26)

A task is in one of two modes, and they want OPPOSITE defaults. Misclassifying either way is symmetric harm.

- **Delivery** — y already exists (in the user's head or objectively): "fix X", "add a field to config.ts", "merge both". Convergence = removing MY uncertainty about a fixed y. Speed is pure good.
- **Discovery** — y does not yet exist for anyone; it is co-constructed. "improve X", "what should this optimize", "how do we speed up our work". The user cannot know y until outputs make it thinkable.

Two load-bearing facts:
- **(A) Mode is a property of the MOVE, not the session.** A session can start discovery and flip to delivery at the moment a candidate y is *committed*; after commitment the rest is delivery. Re-check mode per move.
- **(B) The "sharpen y > gather x" rule (decision #1 above) is DELIVERY-ONLY.** In discovery there is nothing to sharpen yet — premature sharpening IS the failure. Discovery's lever is **widen y** (divergence), not sharpen.

### Delivery defaults
- Gather x, `/clarify` ONLY on genuine ambiguity (else it's over-clarify friction).
- Sharpen y fast, execute, verify-first (turn y into a binary/testable check).
- Warm-context directive streams are delivery — do NOT invent forks.

### Discovery defaults
- **Resist naming y early**; the early namable y is provisional — do NOT persist it as a "decision" yet.
- **Widen before narrowing** — divergent candidate y's (breadth matters MORE here than in delivery); rejections are the payload, don't defend a sketch.
- **Cheap artifact first** — a thin sketch/slice is HOW the user discovers what they want; concrete beats abstract question.
- **Metric = coverage of the option space before commitment**, not speed to answer. A smooth, fast, mediocre y is the characteristic discovery failure.
- Run the fresh-lens UU pass here — UU live in discovery. See [[uu-fresh-lens]].

### Detecting the mode (no user declaration — that's itself friction)
- **Discovery signals:** open verbs (improve / explore / what-if / should-we / better), no stateable acceptance criterion, request is about direction not a named target, user themselves uncertain ("что думаешь?", "а если…"), cold/novel topic with no prior art.
- **Delivery signals:** imperative + named target, binary/testable acceptance, warm context where y was just established, reference to existing artifacts.
- Boundary is noisy; when genuinely split, treat as discovery for one cheap artifact, then let the reaction collapse it.

## Open UU / caveats (fresh-lens round-2 audit, 2026-07-26) — unresolved, do not silently contradict

Surfaced by a second independent fresh-lens pass on the whole effort; recorded as open axes, NOT yet fixed:
1. **Trigger blindness.** The fresh-lens fixed *who* audits (independent) but not *when* — I still decide when to summon it, and a blind executor can't feel which moves are blind. The moves that most need auditing are the confident ones I won't flag. Independence of the auditor is undercut if invocation stays my-discretionary → triggering should be exogenous (commitment boundary, user hesitation, sampling). Dents [[uu-fresh-lens]] and [[mode-detector]]. **Partially addressed 2026-07-26:** a PreToolUse hook (`.claude/hooks/fresh-lens-trigger.mjs`) now fires the audit exogenously at commitment boundaries (git commit / gh pr create / merge), off by default. STILL OPEN: decisions that lock via a memory-write rather than a git commit, and non-commitment confident moves — the hook doesn't cover those.
2. **User attention is a finite, non-renewable budget, not a free oracle.** Every mechanism (interview, /clarify, sketch loops, lens interrupts) spends the user's engaged attention; nothing meters it or distinguishes real assent from fatigue-assent. "Over-clarify is the binding risk" named the symptom but still prices participation at zero.
3. **No decline/null terminal.** y=f(x) has no codomain value for "don't build this / the honest answer is no." A machine tuned to reach agreement manufactures a y for asks that deserve a kill. No abstain outcome, no kill-authority defined. **Compounded by the founding reachability premise** (README, "every `y` has a reachable `x`"): the loop assumes the target is always in the image of `f`, so it has no exit for an *unreachable* y either — it keeps adjusting x forever instead of quitting. Same missing terminal, two ways in.
4. **Mode is the user's private intent, not a surface property of the move** — so the detector's 8/8 proves agreement with MY labels, not truth. A confident misread inverts defaults at commitment boundaries (highest cost). Dents [[mode-detector]].
5. **Persisting to memory is lock-in priced at zero.** This protocol is n=1, days old; freezing it into standing default raises the activation energy to abandon it. Separate *durable rationale* (why we tried) from *active default* (what I do now) so the second can be retired cheaply; treat these decisions as **provisional**.

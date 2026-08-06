# The nature of f — and a second operator

Recorded 2026-07-28. **Status: conceptual, provisional, unvalidated (n=0 — argument only, no
eval yet).** Treat as durable rationale, not active default — see caveat #5 in
[[convergence-protocol]].

## The move that started this

Observation from the user: **"sharpening `y` is still changing `x`, because `x` is the only thing
we control."** The README already says as much (`f` is roughly fixed in a session; `x` is the knob
you turn). Two refinements make it load-bearing rather than a restatement:

1. **"Clarify y = enrich x" holds only in *delivery*.** There `y*` (the true target) is fixed, and
   clarification adds constraint to `x`. In **discovery** `y*` is not fixed: `y* = h(interaction
   history)`. Clarifying doesn't *add to x* — it *relocates the target*. This is the mechanical
   reason the two modes want opposite defaults ([[convergence-protocol]] → discovery vs delivery):
   in delivery you converge on a point, in discovery the point itself is being moved by the act of
   probing.

2. **If the only knob is `x`, the object worth understanding is `f`.** Blind search over `x`
   against an unknown, drifting, stochastic `f` is expensive. Modeling `f` — its biases and its
   blind spots — is where the leverage is. The rest of this note is that model.

## Two classes of lever (the README names only one)

The README says `f` is "roughly fixed… you don't retrain it, you condition it" via `x`. True
*within a session* — but the framework's own artifacts are levers that act on the **transformation**,
not the input:

- **x-levers** — change what `f` is conditioned on: `/recall` (fill x), `/clarify` (sharpen y).
- **f-levers** — change or augment the transformation itself: choosing the model, the hooks in this
  repo (`recall-context`, `fresh-lens-trigger`), and — most importantly — `/fresh-lens`, which does
  **not** modify `x`; it adds a *second, independent operator alongside `f`*.

So the "x is the only knob" claim is a within-session truth, not the whole story. The framework
already reaches for `f`-levers; it just never named them as a distinct class. **This refines the
README's framing rather than contradicting it** (per the repo rule: re-argue, don't slip past).

## Properties of f

`f` is not a mathematical function. Naming what it *is* tells us where to push:

- **Non-stationary** — `f` changes as context accumulates. Really `y = f_t(x_t)`: the transformation
  at turn *t* is not the one at turn *t−1*.
- **Stochastic and non-injective** — one `x` → different `y`; many `x` → one `y`. The inverse problem
  is underdetermined, which is *why* naive search over `x` is costly.
- **Hidden on both sides** — the user doesn't know `f`'s reach; the agent doesn't know `y*`.
  Convergence is mutual model-building, not one-way search.
- **Biased — it has drift / an attractor.** Our own result: self-classification pulls toward
  *delivery* ([[mode-detector]]). That is a property of `f`, not noise — a systematic tilt.
- **Not self-reflective** — `f` cannot see its own blind spots (unknown-unknowns). This is a
  *structural* limit, not laziness: a watcher carrying `f`'s priors is blind to exactly the class it
  is hired to catch ([[uu-fresh-lens]]).

The last two are the leverage points. The first three say why brute-forcing `x` is a bad idea.

## The reframe: y ≈ combine( f(x), g(x) )

Two of `f`'s properties license a specific upgrade to the model:

- **`f` has a knowable drift** → you can *pre-distort* `x` to cancel it. "You tend toward delivery —
  check for discovery" is not new context; it's `x` corrected for a *known property of `f`*. This is
  what preconditioning against a bias looks like inside a fixed `f`.
- **`f` is blind to itself** → no amount of `x` fixes it from inside. The honest response is a
  **second, independent operator `g`** that does not share `f`'s priors. `/fresh-lens` and `/2nd`
  *are* `g`.

So the framework's true equation is not `y = f(x)`. It is:

> **y ≈ combine( f(x), g(x) )**

where `g` is the independent lens and `combine` is the human/agent reconciling the two. `f` carries
the work; `g` carries the part `f` cannot self-audit. The pipeline finding from
[[open-threads]] (`x/y` runs first, feeds the independent pass) is exactly this: `f(x)` produces the
concrete artifact that `g` red-teams. `g` is not a ranking above `f` — it's a second term.

## What this buys, and what it costs

**Buys:** it turns "search `x` against an unknown `f`" into two tractable subproblems —
(a) model `f`'s drift and precondition `x` against it, and (b) add `g` where `f` is structurally
blind. Both are things you can *build*, not just hope for.

**Costs / open:**
- **Unvalidated.** This is an argument, not a result. `y ≈ combine(f(x), g(x))` predicts that `g`
  adds non-redundant value — which is precisely what the still-owed `/2nd` hit/false-alarm A/B must
  show ([[open-threads]]). Until then it's a frame, not a finding.
- **`combine` is undefined.** Who reconciles `f(x)` and `g(x)`, and by what rule, is unspecified —
  it silently assumes user attention to adjudicate, which caveat #2 ([[convergence-protocol]]) says
  is a finite budget priced at zero. **Update 2026-07-31: first concrete definition, from a
  failure.** `/2nd` originally had `g` issue a verdict — i.e. `g` doing `combine`'s job. Measured
  out-of-sample, that verdict blocked 88% of *sound* plans, because severity depends on reversal
  cost, stakes and schedule, which `g` cannot see by construction: independence denies it exactly
  the inputs the judgment needs. The roles are now split — `g` names unvoiced axes and what each
  would change; `f` supplies applicability and cost (facts it can be publicly wrong about, not
  importance, where its delivery drift hides); the user adjudicates. The two halves carry
  **opposite** biases — `g` toward "everything blocks" (88%, measured), `f` toward "nothing blocks"
  (the drift above) — so `combine` spends user attention only where they disagree, which is what
  makes it affordable against caveat #2. See `skills/2nd/SKILL.md` → *Why the verdict is gone*.
  Status: argument from a diagnosed failure, unvalidated.
- **Doesn't touch the reachability premise.** Modeling `f` better doesn't add the missing
  decline/null terminal (caveat #3). An unreachable `y*` is still unreachable; `g`'s job there is to
  *say so*, which is the `don't-build` verdict, not to reach it.

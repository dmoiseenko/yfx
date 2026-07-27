# x/y diagnosis — Step 0 of the recall loop

Before acting on any non-trivial prompt, decide what you're short on: **context
(x)** or **goal clarity (y)**. Do NOT rely on a single "how confident do I feel"
signal — from one predictive distribution it is provably impossible to tell an
epistemic gap (x) from intent ambiguity (y) (non-identifiability,
[2511.04418](https://arxiv.org/html/2511.04418)), and a *confident wrong* answer
is real: all sampled runs can agree and still be wrong
([2602.11619](https://arxiv.org/html/2602.11619)). Run two structured probes,
then a value-of-information gate.

## Probe y — intent / goal

Enumerate **2–3 distinct OUTCOMES** the request could plausibly mean — different
things you would build or deliver, not reworded versions of one thing. If ≥2 are
materially different **and** would change *what you produce* → **y-deficit →
/clarify**.

Probe outcomes, not phrasings: naively prompting for multiple interpretations and
comparing their wording does **not** detect ambiguity
([2505.11679](https://arxiv.org/html/2505.11679v3)). This is INTENT-SIM-lite —
entropy over intents, not over rewordings
([NAACL 2025.306](https://aclanthology.org/2025.findings-naacl.306.pdf)).

## Probe x — facts / context

Draft the plan or answer, then flag every **load-bearing** claim that rests on a
project fact you **cannot cite** from the conversation, the code, or memory (an
identifier, a past decision, a convention). Any such claim → **x-deficit →
/recall**.

Judge by **citeability, not by felt confidence** — confident-but-uncitable is
exactly the failure mode above. Then vet what you recall (drop stale/already-done,
elevate live gaps).

## VoI gate — applies to both

For each detected deficit ask: *would resolving it change my FIRST action?* If no
— act anyway. Recalling or asking something that wouldn't move the decision is
friction, not diligence. (EVPI gating:
[SAGE-Agent 2511.08798](https://arxiv.org/abs/2511.08798) — +7–39% task coverage
with 1.5–2.7× fewer questions; ask only when clarification is expected to improve
the outcome, [NAACL 2025.306](https://aclanthology.org/2025.findings-naacl.306.pdf).)

## Rule of thumb

Ask (**y**) only when intent-ambiguity is HIGH **and** your knowledge is adequate;
retrieve (**x**) when a load-bearing fact is missing; often **both** — recall
first (it sharpens which y-directions are even worth offering), then clarify.

## Research basis

Confirmed via adversarial verification (deep-research, 2026-07). The x/y split is
the same distinction the literature draws four ways: epistemic-vs-aleatoric
([NAACL 2025.306]), specification-vs-model uncertainty
([2511.08798](https://arxiv.org/abs/2511.08798)), vagueness-vs-ambiguity
([2605.01209](https://arxiv.org/pdf/2605.01209)), and Missing-Parameter-vs-
Ambiguous-Action (AgentAbstain). Named methods: INTENT-SIM (intent entropy),
CLAM / Proactive-CoT (prompt-classifier ask-gate), TARG / SR-RAG (retrieve-gate
from a no-context draft), SAGE-Agent / Rao-Daumé (EVPI). A **dedicated detector
agent** separate from the executor (Intent-Agent scaffold) is a validated
pattern — see the tier-3 watcher (task #1).

# PROTOCOL — memory-provider language bridge

**Committed before any data was collected.** Same discipline as
[`PROTOCOL-transfer.md`](PROTOCOL-transfer.md): the design, the metric, and the decision rule
are fixed in advance so the result cannot be read to taste afterwards.

## The question

`skills/recall/SKILL.md` ("Why in-agent, not a subprocess") rests on a measurement:

> a raw non-English query retrieves ~0% of the relevant observations (claude-mem's search
> doesn't bridge languages); a heuristic/glossary reach ~7–13%; a blind `claude -p haiku`
> subprocess ~46%; agent-composed project-aware terms ~55%

The whole harvest machinery in `hooks/recall-context.mjs` — frequency-ranked English identifier
extraction from the transcript, plus the **anchorless-prompt skip** (no Latin token in the prompt
⇒ don't search at all) — exists to work around that 0%.

That measurement was taken against **claude-mem only**. If a different provider bridges
languages, the harvest is not part of the framework's core; it is compensation for one
provider's defect, and it belongs behind the provider boundary.

**Decision this eval feeds:** what goes in `core/` vs `providers/` when the memory layer is
split (chosen direction: measure first, then abstract; claude-mem stays as one provider).

## Design

Roles are separated so no role can re-run another's decision — the L0 discipline from
[`README.md`](README.md):

| role | sees | blind to |
| --- | --- | --- |
| **corpus sampler** (mechanical) | provider DB / list endpoint | everything else — no human picks the rows |
| **query author** (context-less `claude -p`) | ONE memory's text | the provider, the retrieval system, the hypothesis, the other rows, the arms |
| **scorer** (mechanical) | gold id + each arm's returned ids | — |

No designer-written queries. No designer-assigned relevance labels. Gold is **identity**: the
query was authored from memory `M`, so `M` is by construction the answer; a retrieval either
returns `M` in its top-k or it does not.

### Corpus

Per provider, enumerate every memory scoped to this repository, keep rows with enough text to
author a question from, and take a deterministic seeded sample of `N` (default 24).

- claude-mem: `observations WHERE project='yfx'` in `~/.claude-mem/claude-mem.db` (read-only).
- mem0: `/v2/memories/` both lanes (`agent_id=<project>` shared, `user_id=<user>` personal),
  filtered to the repo's `app_id`.

### Arms

Three queries per sampled memory, authored in one call by the blind query author:

| arm | query | what it represents |
| --- | --- | --- |
| `ru_bare` | Russian only, **no Latin token at all** | the anchorless prompt `recall-context.mjs` refuses to search on |
| `ru_anchored` | Russian, Latin identifiers kept where natural | a warm-thread prompt |
| `en` | English translation of the same question | the ceiling |

### Metric

`recall@5` — is the gold memory among the top 5 returned? Plus `MRR@5` as a tie-breaker.
Top-k is 5 because that is what mem0's shipped first-prompt hook uses.

## Decision rule (fixed in advance)

Read the **within-provider ratio** `R = recall@5(ru_bare) / recall@5(en)`, not absolute recall:

- **mem0 `R` ≥ 0.6** ⇒ mem0 bridges languages. The harvest and the anchorless-skip are
  **provider-specific**: they move to `providers/claude-mem.mjs`, and the hook's skip becomes
  conditional on a declared provider capability.
- **mem0 `R` ≈ claude-mem `R`, both ≤ 0.2** ⇒ the language gap is general. Harvest stays in
  `core/`.
- **anything between** ⇒ inconclusive. Report it as inconclusive; do not force a partition on a
  number that did not clear the bar.

## Known confounds — stated before the run, not after

1. **The two corpora are different content.** claude-mem holds titled observations with
   narrative; mem0 holds single-sentence distillates. Absolute recall is **not comparable across
   providers**. Only the within-provider ratio `R` is — it normalizes out corpus difficulty,
   which is exactly why the decision rule reads `R` and not raw recall.
2. **The query author saw the memory text**, so every query is better targeted than a real
   user's would be. This inflates absolute recall in **all three arms equally**, so it moves `R`
   little; but it means the absolute numbers are a ceiling, not a field estimate.
3. **n is one repository.** Consistent with the framework's standing n=1 caveat
   (`docs/open-threads.md`). This eval does not escape it; it only removes the cross-provider
   part of the question from guesswork.
4. **claude-mem's write path is out of quota** during this run (observer allowance exhausted).
   Its read path is unaffected — the worker serves search from local SQLite — so retrieval
   numbers stand, but the corpus is frozen at the last flush.

---

## Amendment, written after the run — the architecture changed under the protocol

The decision rule above partitions **code**: harvest stays in `core/` or moves to
`providers/claude-mem.mjs`. That framing is dead. Mid-work the design moved to provider cards —
a provider "plugin" is prose the agent reads (`providers/*.md`), not a JS adapter — so there is
no `providers/*.mjs` for harvest to move into. It was deleted instead, along with the rest of the
hook's retrieval half.

This is recorded rather than quietly rewritten because the repo's own rule requires it: a change
that contradicts a recorded decision must say so and re-argue it. Two things are worth being
precise about:

**What the eval still decides, and it is smaller than advertised.** Not a code partition — one
row of each provider card: `query_language`. That row is load-bearing anyway (it changes what the
agent does on every recall), and `evals/check-cards.test.mjs` fails the build if a card claims a
bridge no run measured. So the measurement is still spent, just on a narrower claim.

**The thresholds were not touched.** 0.60 / 0.20 and the inconclusive band were fixed before any
data existed and are used exactly as written — both providers landed far outside the band
(0.88 and 0.00), so no judgment call was needed and none was made. Had a provider landed at, say,
0.45, the rule still says *inconclusive*, and the card must say `unmeasured`.

**What was NOT re-run.** The arms, dataset, sampling seed, and metric are unchanged from the
pre-registered design; the amendment changes only what conclusion the numbers feed. No row was
dropped, re-sampled, or re-scored after seeing results.

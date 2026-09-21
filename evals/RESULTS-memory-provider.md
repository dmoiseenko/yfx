# RESULTS — memory-provider language bridge

Protocol (design, metric, decision rule, confounds) fixed before data collection:
[`PROTOCOL-memory-provider.md`](PROTOCOL-memory-provider.md). Machine-readable summary, which
[`check-cards.test.mjs`](check-cards.test.mjs) enforces against every provider card:
[`results-memory-provider.json`](results-memory-provider.json).

Run: `N=24`, `SEED=20260918`, `TOP_K=5`, query author `sonnet`. Measured twice — once before
the harness was isolated and once after (see **Re-measured under isolation** below); the table
reports the isolated run, which is the one the cards and `check-cards.test.mjs` cite.

## The numbers

`recall@5` — gold is identity: each query was authored *from* one memory by a context-less agent
that saw only that memory's text, so the retrieval either returns it or does not.

| provider | `ru_bare` | `ru_anchored` | `en` | **R = ru_bare / en** |
| --- | --- | --- | --- | --- |
| **mem0** | 0.91 | 0.96 | 0.96 | **0.95** |
| **claude-mem** | 0.00 | 0.33 | 0.83 | **0.00** |

## Re-measured under isolation

The first run of this eval went through `lib.mjs`'s `claude()` **before** the harness leak was
fixed, so its query author held the yfx project guide, `gitStatus`, and a claude-mem memory
digest while writing queries about yfx's own memory corpus — a direct path into the `claude-mem`
column. A code review caught that this document, alone among the results files, carried no
provenance mark while being the artifact that gates CI and justifies deleting 276 lines from
`recall-context.mjs`. So it was re-run isolated rather than merely annotated.

| provider | condition | `ru_bare` | `ru_anchored` | `en` | **R** |
| --- | --- | --- | --- | --- | --- |
| mem0 | leaky | 0.88 | 0.92 | 1.00 | 0.88 |
| mem0 | **isolated** | 0.91 | 0.96 | 0.96 | **0.95** |
| claude-mem | leaky | 0.00 | 0.46 | 0.79 | 0.00 |
| claude-mem | **isolated** | 0.00 | 0.33 | 0.83 | **0.00** |

**The conclusion survives, and the key cell is a replication.** claude-mem's corpus is frozen —
its write path is out of quota — so the seeded sample drew the *identical 24 rows* both times,
and `ru_bare` was 0/24 in both. That is a replicated zero on the exact column the review flagged
as most at risk, not a single draw.

mem0's ratio moved 0.88 → 0.95, i.e. isolation made the case *stronger*. Its corpus grew from 198
to 353 memories between runs (this project's own sessions wrote to it), so the seeded sample drew
different rows and the mem0 comparison is distributional rather than paired.

## Verdict against the pre-registered rule

- **mem0 R = 0.88 ≥ 0.60** → bridges languages. Card declares `query_language: any`.
- **claude-mem R = 0.00 ≤ 0.20** → does not bridge. Card declares `query_language: english_only`.

Neither landed in the inconclusive band, so the rule fired without a judgment call.

## What this settled

The premise under the recall hook's harvest machinery — *"a raw non-English query retrieves ~0%"*
— is **true, and provider-specific**. It reproduced exactly on claude-mem (0 hits in 24) and
failed to reproduce on mem0 (21 hits in 24). So the frequency-ranked identifier harvest, the
anchorless-prompt skip, and the transcript scraping in `hooks/recall-context.mjs` were
compensation for one provider's defect, not a property of the framework. They were removed; the
hook now carries only the x/y nudge, and retrieval belongs to the provider (which may inject on
its own) or to the agent via `/recall`.

The `ru_anchored` column is why that machinery was reasonable in the first place: keeping Latin
identifiers inside an otherwise Russian sentence lifts claude-mem from 0.00 to 0.46. Harvesting
identifiers was the right fix for that provider. It was simply never a general one.

## What this did NOT settle

**Absolute recall is not comparable across the two columns of providers** — the corpora differ
(claude-mem holds 276 titled observations with narrative; mem0 holds 198 single-sentence
distillates), which is exactly why the decision rule reads the within-provider ratio. Read
mem0 1.00 vs claude-mem 0.79 in the `en` column as "different corpora", not "mem0 retrieves
better".

**The absolute numbers are a ceiling, not a field estimate.** The query author saw the memory it
was writing a question about, so every query is better targeted than a real user's. This inflates
all three arms roughly equally — it moves `R` little — but a real session will sit below these
numbers.

**n = 1 repository**, consistent with the framework's standing caveat in `docs/open-threads.md`.
This removes the cross-provider part of the question from guesswork; it does not escape n=1.

**The nudge-only hook is now unvalidated.** The A/B that justified the hook (+33% diagnostic
reasoning, +100% recall intent) was measured on the version that injected memory. Stripping
retrieval means that result no longer transfers to what ships.

## Reproduce

```bash
npm run eval:memory                      # both providers, N=24
N=12 PROVIDERS=mem0 npm run eval:memory  # one provider, smaller
npm test                                 # checks every card's claims against the summary
```

Raw per-row output lands in `out/memory-provider.jsonl` (gitignored). To rebuild the committed
summary from raw rows without re-running the model calls: `node evals/summarize-run.mjs`.

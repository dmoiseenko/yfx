---
provider: claude-mem
tool: search
query_language: english_only
citable_ids: true
expansion: two_step
scope: [project]
auto_injection: session_start
measured:
  eval: evals/memory-provider.mjs
  ratio: 0.0
  recall_ru_bare: 0.0
  recall_en: 0.7916666666666666
  n: 24
---

# Memory provider: claude-mem

## Reaching it

Two steps, and both are needed:

1. `search` (or `mem-search`) with English terms → a ranked digest of `#ID`s and titles.
2. `get_observations([IDs])` on the ones that matter → the full text.

Step 1 alone gives you titles, not content. Do not summarize from titles.

## You must compose English terms — this is measured

claude-mem's search **does not bridge languages at all**. A pure-Cyrillic question retrieved the
right observation in **0 of 24** cases (`recall@5` 0.00 against an English ceiling of 0.79 —
ratio **0.00**, `n=24`, `evals/results-memory-provider.json`). Passing the user's Russian prompt
through is not a weak search; it is a guaranteed miss.

Keeping the Latin identifiers inside an otherwise Russian sentence recovers roughly half
(`recall@5` 0.46) — which is why identifiers are the load-bearing part, not the grammar.

So: **compose 5–10 project-aware English search terms** — real symbol names, file names, config
keys (`parseConfig`, `retry.ts`, `MAX_RETRIES`), not a literal translation of the user's words.
Run several focused queries if the topic spans areas. You hold the project vocabulary; a blind
subprocess does not, which is the whole reason recall runs inside you.

## What comes back, and how to cite it

Stable `#ID`s. Use them: cite prior decisions as `#21490` so the user can look them up, and so a
later session can too. This is claude-mem's real advantage over providers that return bare text.

Note that `#S…` ids are session summaries and `#P…` are user prompts — neither is an observation.

## What is already in your context

A digest at `SessionStart`, and it is large — a recent one ran to roughly 21k tokens. It is
already yours; re-searching for what it lists wastes a turn. Read it first, then search for what
it does not cover.

## Writing

Automatic, via a background observer worker. Note that the worker can be down or out of its
provider's inference allowance while **search still works** — retrieval is served from local
SQLite. If capture is broken, memories from the current session will not exist later; say so
rather than assuming they were saved.

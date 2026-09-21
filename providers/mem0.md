---
provider: mem0
tool: mcp__plugin_mem0_mem0__search_memories
query_language: any
citable_ids: false
expansion: none
scope: [repo, dir, mine]
auto_injection: first_prompt
measured:
  eval: evals/memory-provider.mjs
  ratio: 0.9527
  recall_ru_bare: 0.913
  recall_en: 0.9583
  n: 23
---

# Memory provider: mem0

## Reaching it

Call `mcp__plugin_mem0_mem0__search_memories` with a direct question. Arguments that matter:

- `scope` — `repo` (default: this repository's shared memory plus your own preferences), `dir`
  (narrows the shared part to the current directory), `mine` (your preferences alone).
- `category` — one of `project_knowledge`, `decisions_and_constraints`, `workflows`,
  `problems_and_fixes`, `results`. Omit to search everything.
- `top_k`, and `run_id` to restrict to one earlier session.

## Query in the user's language — this is measured, not assumed

mem0's search **bridges languages**. A pure-Cyrillic question with no Latin token at all still
retrieved the right memory in 21 of 23 scored cases (`recall@5` 0.91, against an English ceiling
of 0.96 — ratio **0.95**, `evals/results-memory-provider.json`). A leakier earlier run of the
same eval put the ratio at 0.88; isolating the harness moved it up, not down.

So **do not spend a turn translating the user's request into English identifiers before
searching.** Ask mem0 the question as the user framed it. The English arm is only marginally
better, so if a first search comes back empty or off-topic, retrying in English is a cheap
second move — not a mandatory first one.

## What comes back, and how to cite it

Full memory text, already distilled into sentences. There is **no second fetch** — what search
returns is all there is, so do not look for an expansion step.

There are also **no citable ids**. You cannot write "per #21490". Cite by quoting the memory's
own sentence, briefly, so the user can see exactly what you are relying on — and say it came
from memory rather than from the code in front of you.

## What is already in your context

mem0 injects on its own, but far more narrowly than people expect: **only on the first prompt of
a session**, only if that prompt is at least 20 characters, `top_k=5`, capped at ~4000 characters,
under the heading "Mem0 found these relevant memories from earlier work in this repository:".
`SessionStart` injects **nothing**.

Two consequences. Those five memories are already yours — do not re-search for them. And from the
second prompt onward nothing arrives automatically, so mid-session recall is **your** move, via
`/recall`.

## Writing

Capture is automatic through the plugin's hooks; extraction runs in the background and flushes
periodically, at idle, and at session end. There is no tool for you to add a memory deliberately —
if something must survive and be findable later, commit it to the repo's docs. That is what
`docs/` is for in this project.

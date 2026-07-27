---
name: recall
description: Sharpen an under-specified task BEFORE acting on it. Diagnose whether you lack CONTEXT (x — past decisions, identifiers, rationale → pull from claude-mem) or GOAL clarity (y — several valid outcomes → ask the user to pick a direction). Invoke on a cold topic where prior work would help, when a request references decisions you don't hold, or when the desired outcome is ambiguous.
---

# /recall — sharpen x and y before acting

Work is `y = f(x)`: you choose `x` (the prompt + context you bring) to produce
`y` (the outcome the user actually wants). Two different deficits, two different
tools — and the first job is to tell which one you're short on:

| Deficit | Symptom | Fill it with |
| --- | --- | --- |
| **x** — context | "почему мы выбрали…", "как мы делали…", a reference to a past decision / identifier / rationale you don't hold; the auto-hook surfaced relevant `#IDs` | **memory recall** (below) |
| **y** — goal | "улучши X" / "сделай Y" with several valid interpretations; unclear scope or acceptance criteria | **a pick-a-direction question** (below) |

Often you need both: recall first, then the recovered context makes your
direction options sharper.

## Step 1 — Diagnose (x vs y)

Run the shared **[x/y diagnosis](../xy-diagnosis.md)** first — two structured
probes (distinct *outcomes* for y, *citeability* for x) plus a value-of-
information gate. Don't gate on felt confidence: a single uncertainty signal
provably can't split a context gap (x) from goal ambiguity (y). If the probe
says you lack context, continue below; if it's goal ambiguity, hand off to
**/clarify**; often both (recall first — it sharpens the y-directions).

## Step 2a — Fill x (memory)

1. **Compose 5–10 project-aware English search terms** from the request and the
   conversation — real identifiers, file names, and concepts, not a literal
   translation of the user's words. You have the project vocabulary in context
   (the exact symbol names, file names, and config keys — e.g. `parseConfig`,
   `retry.ts`, `MAX_RETRIES`, `BATCH_SIZE`, …) — use it. This is the whole reason
   recall runs *inside you* and not as a blind subprocess: a context-less model
   guesses generic English, you name the exact symbol.
2. **Search claude-mem** — call the `search` tool (or `mem-search`) with the
   terms; run several focused queries if the topic spans areas. Read the top
   hits.
3. **Fetch the ones that matter** via `get_observations([IDs])` and note the IDs.
4. **Synthesize** the relevant prior decisions/rationale, cited by `#ID`. Don't
   silently re-derive or contradict a decision already made.

## Step 2b — Sharpen y (direction)

If the outcome is ambiguous, hand off to **/clarify**: name the axis of
ambiguity, then present **2–4 concrete, mutually-exclusive directions** via
`AskUserQuestion` (short header, each option with its trade-off, your
recommendation first). Wait for the pick before diving in. Don't ask when a
reasonable default exists and a wrong guess is cheap — make the call, note the
assumption, proceed.

## Step 3 — Act

Proceed with the sharpened `x` (context, cited by `#ID`) and `y` (chosen
direction).

## Why in-agent, not a subprocess

Measured on a real cross-language memory (Russian prompts over an English
codebase): a raw non-English query retrieves ~0% of the relevant observations
(claude-mem's search doesn't bridge languages); a heuristic/glossary reach
~7–13%; a blind `claude -p haiku` subprocess ~46%; **agent-composed project-aware
terms ~55%** — the best, and free, because you already hold the context a
subprocess would have to be re-fed. The cheap
`recall-context` hook covers *warm* threads passively (it harvests the English
identifiers already in the transcript); `/recall` is the active path for *cold*
topics and multi-query recall.

---
name: recall
description: Sharpen an under-specified task BEFORE acting on it. Diagnose whether you lack CONTEXT (x — past decisions, identifiers, rationale → pull from the memory provider) or GOAL clarity (y — several valid outcomes → ask the user to pick a direction). Invoke on a cold topic where prior work would help, when a request references decisions you don't hold, or when the desired outcome is ambiguous.
---

# /recall — sharpen x and y before acting

Work is `y = f(x)`: you choose `x` (the prompt + context you bring) to produce
`y` (the outcome the user actually wants). Two different deficits, two different
tools — and the first job is to tell which one you're short on:

| Deficit | Symptom | Fill it with |
| --- | --- | --- |
| **x** — context | "почему мы выбрали…", "как мы делали…", a reference to a past decision / identifier / rationale you don't hold | **memory recall** (below) |
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

**Read [the provider card](../memory-provider.md) first.** It is short, and it decides the next
three things: which tool to call, whether to query in the user's language or compose English
terms, and whether what comes back can be cited by id. Providers differ enough on all three that
guessing wastes a turn — on one provider a raw Russian question retrieves 21 of 24 target
memories, on another it retrieves 0 of 24 (`evals/RESULTS-memory-provider.md`).

1. **Check what you already have.** Some providers inject memories on their own — the card's
   `auto_injection` row says what and when. Do not search for what is already in your context.
2. **Compose the query as the card directs.**
   - `query_language: any` → ask the question the way the user framed it.
   - `query_language: english_only` → compose 5–10 project-aware English terms: real identifiers,
     file names, config keys (`parseConfig`, `retry.ts`, `MAX_RETRIES`), not a literal
     translation of the user's words. You hold the project vocabulary; use it.
   - Run several focused queries if the topic spans areas.
3. **Expand if the card says to.** `expansion: two_step` means search returns ids and titles, and
   you still need the fetch step — never summarize from titles alone.
4. **Synthesize and attribute.** With `citable_ids: true`, cite by `#ID`. With `citable_ids:
   false`, quote the memory's own sentence briefly. Either way, say it came from memory rather
   than from the code in front of you — and don't silently re-derive or contradict a decision
   already on record.

If no memory is installed, the card is `none` and tells you the honest fallbacks: the code, the
committed docs, `git log`, and — when only the user can close the gap — a question.

## Step 2b — Sharpen y (direction)

If the outcome is ambiguous, hand off to **/clarify**: name the axis of
ambiguity, then present **2–4 concrete, mutually-exclusive directions** via
`AskUserQuestion` (short header, each option with its trade-off, your
recommendation first). Wait for the pick before diving in. Don't ask when a
reasonable default exists and a wrong guess is cheap — make the call, note the
assumption, proceed.

## Step 3 — Act

Proceed with the sharpened `x` (context, attributed) and `y` (chosen direction).

## Why in-agent, not a subprocess

Measured on a real cross-language memory (Russian prompts over an English codebase), against
claude-mem: a raw non-English query retrieves ~0% of the relevant observations; a
heuristic/glossary reach ~7–13%; a blind `claude -p haiku` subprocess ~46%; **agent-composed
project-aware terms ~55%** — the best, and free, because you already hold the context a
subprocess would have to be re-fed.

Two caveats worth carrying. That ladder was measured on **one provider**; a later run
(`evals/RESULTS-memory-provider.md`, n=24) found the 0% floor is claude-mem-specific — mem0
bridges languages and answers a raw Russian question at 0.88 of its English ceiling. The floor
moves per provider; the *ordering* — that you, holding project vocabulary, beat a blind
subprocess — is what generalizes, and it is why recall runs inside you.

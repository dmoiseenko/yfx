# RESULTS — memory audit (2026-11-23)

**Question.** Does the memory a project has accumulated help the agent with no one labelling?
Measured by `evals/memory-audit.mjs` on the one working project that runs the framework daily
(provider: mem0, `auto_injection: first_prompt`). Judge: `sonnet`, isolated (`lib.mjs`), one
call per prompt, 0 judge errors. Per-prompt rows stay in `evals/out/` (private project text);
only aggregates are recorded here.

## How often memory reaches the agent at all (deterministic, no judge)

All transcripts of the project and its worktrees: **30 sessions, 277 substantive prompts the user
typed.**

| | prompts |
| --- | --- |
| memory injected (push) | 28 — every one a session's first prompt (28 of 28 first prompts; 0 later) |
| agent searched memory itself (pull) | 12 |
| **no memory of any kind** | **242 (87%)** |

The card's `auto_injection: first_prompt` holds in live use. Past the first prompt, memory
arrives only if the agent asks, and it searched on 12 of the 277 prompts.

## What the memory that arrived did (judged, all 35 prompts memory reached)

| verdict | push (5 per first prompt) | pull |
| --- | --- | --- |
| used | 5 | 2 |
| redundant (correct, but found in the repo anyway or not needed) | 32 | 19 |
| irrelevant | 96 | 56 |
| stale (contradicted by what the agent saw that turn) | 7 | 0 |
| misled | 0 | 0 |

**7 of 217 memories (3%) were used.** Per prompt: memory **helped on 6 of 35**, was neutral on
29, hurt on 0. Every stale item was pushed, and 6 of the 7 snapshotted *volatile state* — which row leads the
board, which issues are open, which primitives exist today — rather than a durable decision; the
seventh was an earlier result that a re-measurement in the same turn no longer showed. The agent
caught each one because the turn read the live state; a turn that had not would have carried it.

## Where the agent found project history instead (judged, every prompt of the last week)

37 prompts, 2026-11-16..23. On **13 (35%)** the agent recovered project history by its own
effort — an earlier measurement, a decision, a convention — from the project's committed notes,
research journal, backlog, or git/PR history. On 5 of them no memory had reached the agent at
all; on the other 8 the memory that had arrived did not carry what was needed.

**Reading.** In this project the durable memory that actually works is the **committed record**
(notes, journal, backlog), reached with grep. The provider adds little on top: it reaches 13% of
prompts, 3% of what it delivers is used, and the part that goes wrong is volatile state, which
the committed record does not hold and the live state contradicts.

## Limits

- **n = 1 project, one judge model, one pass.** The judge was spot-checked on one prompt against
  a hand reading (it flagged the same stale memory); it is not validated beyond that.
- The judge sees a clipped trace, not the repository: `stale` is only what that turn contradicted,
  and a long turn's clipped middle can hide a `used`.
- `gap` is judged from the trace; it says the history existed and was recovered, not how much the
  recovery cost.

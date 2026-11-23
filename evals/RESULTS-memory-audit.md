# RESULTS — memory audit (2026-11-23)

**Question.** Does the memory a project has accumulated help the agent with no one labelling?
Measured by `evals/memory-audit.mjs` on the one working project that runs the framework daily
(provider: mem0, `auto_injection: first_prompt`). Judge: `sonnet`, isolated (`lib.mjs`), one
call per request, 0 judge errors, 0 memories left unjudged. Per-request rows stay in
`evals/out/` (private project text); only aggregates are recorded here.

A request ("move") is a substantive prompt or a slash command the user typed, plus everything
the agent did until the next one; short follow-ups ("да") continue the request they answer.

## How often memory reaches the agent at all (deterministic, no judge)

All transcripts of the project and its worktrees: **31 sessions, 293 requests.**

| | requests |
| --- | --- |
| memory injected (push) | 28 — every one a session's first request (0 later) |
| agent searched memory itself | 15 (2 more searches were refused by the permission layer) |
| memory reached the request, either way | 38 (13%) |
| **no memory of any kind** | **255 (87%)** |

The card's `auto_injection: first_prompt` holds in live use. Past the first request, memory
arrives only if the agent asks.

## What the memory that arrived did (judged, all 38 requests memory reached)

| verdict | push (5 per first request) | search |
| --- | --- | --- |
| used | 8 | 7 |
| redundant (correct, but found in the repo anyway or not needed) | 22 | 25 |
| irrelevant | 102 | 58 |
| stale (contradicted by what the agent saw that turn) | 8 | 0 |
| misled | 0 | 0 |

**15 of 230 memories (6.5%) were used** — 6% of pushed ones, 8% of searched ones. Per request,
memory **helped on 11 of 38**, was neutral on 27, hurt on 0. Every stale item was pushed: 6 of
the 8 snapshotted *volatile state* (which row leads the board, which issues are open, which
primitives exist), the other 2 were earlier results a re-measurement in the same turn no longer
showed. The agent caught each one because the turn read the live state; a turn that had not would
have carried it.

## Where the agent found project history instead (judged, every request of the last week)

39 requests, 2026-11-16..23; memory reached 14 of them. On **20 (51%)** the agent recovered
project history by its own effort — an earlier measurement, a decision, a convention — from the
project's committed notes, research journal, backlog, or git/PR history. On 10 of those no
memory had reached the agent at all; on the other 10 the memory that had arrived did not carry
what was needed.

**Reading.** In this project the durable memory that actually works is the **committed record**
(notes, journal, backlog), reached with grep. The provider adds little on top: it reaches 13% of
requests, 6.5% of what it delivers is used, and what goes wrong is mostly volatile state, which
the committed record does not hold and the live state contradicts.

## Limits

- **n = 1 project, one judge model, one pass; judge variance unmeasured.** Before a code review
  fixed how requests are cut (slash commands, short follow-ups), a first pass over nearly the
  same week gave a gap on 13 of 37 requests; this pass gives 20 of 39. The cut changed too, so
  the spread can't be split between the two — treat the gap rate as "a third to a half".
- The judge was spot-checked on one request against a hand reading (it flagged the same stale
  memory); it is not validated beyond that.
- The judge sees a clipped trace, not the repository: `stale` is only what that turn contradicted,
  and a long turn's clipped middle can hide a `used`.
- `gap` says the history existed and was recovered, not how much the recovery cost.

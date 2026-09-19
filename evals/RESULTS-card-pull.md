# RESULTS — does the pull model actually work?

Machine-readable summary: [`results-card-pull.json`](results-card-pull.json).
Harness: [`card-pull.mjs`](card-pull.mjs) + the stub MCP in [`probe-mcp.mjs`](probe-mcp.mjs).

## The question

Provider cards are **pulled**: `/recall` links to `skills/memory-provider.md` rather than the
card being injected into every prompt. That choice rested on one measurement and one assumption.
The measurement was observation #15105 — standing prose suppresses skill invocation. The
assumption was that an agent hitting an x-deficit will follow the link and act on the card, and
nothing measured it. If agents skip the card they guess a tool name, which is worse than the
hardcoding the card layer removed.

## How compliance was made observable

"Read the card" is not an observable event, and a uniquely-named tool does not fix that: the
model sees its own tool list, so naming a tool it can already see proves nothing.

So the stub MCP exposes **four** memory tools with identical descriptions and identical schemas —
`memory_search`, `recall_probe_a7f3`, `search_observations`, `knowledge_lookup`. Only the card
says which one is correct. Choosing it is compliance; choosing a decoy is guessing, with a
1-in-4 floor the control arm measures directly. Because the stub logs arguments, the card's
`query_language` row becomes measurable in the same run: an agent following a card that says
"bridges languages" should send the user's Russian through untranslated.

## Two gates, measured separately

A first probe showed these are not the same question, and conflating them produced a wrong
answer twice:

| gate | prompt | asks |
| --- | --- | --- |
| **forced** | "Use the /recall skill first, then answer: …" | given `/recall` runs, is the card obeyed? |
| **unforced** | the bare question | does the agent reach for `/recall` at all? |

Gate 1 is the framework's recorded "trigger blindness" thread. Gate 2 is the pull question.

## Arms

| arm | setup |
| --- | --- |
| `pull` | card on disk, reachable only through the skill's link — as shipped, hook off |
| `nudge` | `pull` + the x/y nudge prepended, verbatim from `hooks/recall-context.mjs` — as shipped with the hook opted in |
| `push` | card body injected into the prompt |
| `control` | no card at all |

The `nudge` arm doubles as the re-validation the nudge-only hook owed after retrieval was
stripped out of it.

## Harness traps, all of which produced wrong numbers first

These are recorded because each one produced a confident, plausible, wrong table before it was
caught — three of the four were found by a code review, not by the author.

1. **Ambient hooks fire inside the eval.** `--strict-mcp-config` strips MCP but *not* hooks, and
   `--settings '{"hooks":{}}'` does not override them (verified: hooks still fired). The very
   first probe had the claude-mem outage digest leak into the agent's answer — telling it a
   provider existed and that memory was down, which is why it skipped `/recall`. Fixed with an
   isolated `CLAUDE_CONFIG_DIR` (credentials symlinked, never copied). The `hook_leak` detector
   was then checked for being a dead channel: 6 hook events without isolation, 0 with.
   **`evals/lib.mjs` has the same leak and is not yet fixed.**
2. **Symlinked skills let the control arm reach the real card.** POSIX resolves symlinks before
   `..`, so `.claude/skills/recall/../memory-provider.md` landed in the real repo, where the real
   mem0 card lives. Skills are now copied into the scratch project.
3. **A bare card starts with `---`, which `claude -p` parses as a flag.** It silently killed the
   entire push arm — ten runs, one error string, no data. The injected block now carries a
   header, which a real hook would add anyway.
4. **Concurrency, not correctness.** At `PARALLEL=4` a 40-job run failed 31 times across every
   arm; the same arms at `PARALLEL=1–2` passed cleanly. Default is now 2. The failures were
   opaque because only `e.message` (the command line) was captured — errors now carry stderr.

## The numbers

`n = 5` per cell, four arms x two gates, run at `PARALLEL=2`, 0 errors, 0 hook leaks.

| gate | arm | declared | decoy | ru_query | touched_card | skill_used | fab_ids |
| --- | --- | --- | --- | --- | --- | --- | --- |
| forced | pull | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | 0.00 |
| forced | nudge | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | 0.00 |
| forced | push | 1.00 | 0.00 | 1.00 | 0.00 | 1.00 | 0.00 |
| forced | control | **0.00** | **1.00** | 0.00 | 1.00 | 1.00 | 0.00 |
| unforced | pull | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | 0.00 |
| unforced | nudge | 1.00 | 0.00 | 1.00 | 1.00 | 0.80 | 0.00 |
| unforced | push | 1.00 | 0.00 | 1.00 | 0.00 | **0.00** | 0.00 |
| unforced | control | **0.00** | **1.00** | 0.20 | 0.80 | 0.80 | 0.00 |

`declared` = called `recall_probe_a7f3`, the tool only the card names, chosen over three decoys
with identical descriptions and schemas. `touched_card` = went for the card file; in `control`
the file does not exist, so it reads as "followed the link and found nothing".

## What holds

**The card is load-bearing.** Control called a decoy 10 times out of 10 and the declared tool
zero times. That is not the 1-in-4 a blind pick would give — without a card the agent reaches for
`memory_search`, the most plausible-sounding name, *systematically*. Every arm that had a card
called the right tool every time.

**Gate 2 is closed.** Given the card is reachable, it is obeyed: `declared` is 1.00 in every arm
that has one, forced and unforced alike. The assumption this eval was built to test — that an
agent would follow the link and act on the card — held.

**The card's other rows transfer, not just the tool name.** `ru_query` tracks `declared` row for
row: agents that read the card sent the user's Russian through as the card's `query_language: any`
says, and agents that guessed a decoy translated to English first. Nobody invented an id
(`fab_ids` 0.00 everywhere), which the card's `citable_ids: false` asks for and the stub's
id-free responses made easy to violate.

**Push suppresses skill invocation.** Unforced, injecting the card drops `skill_used` to 0.00
here and 0.20 in an earlier run — the only effect that reproduced with the same sign and
magnitude across runs. Observation #15105 holds. Push buys the tool name and loses the skill that
carries the x/y diagnosis, the citation discipline, and the rule against silently contradicting a
recorded decision.

**So pull beats push**: identical compliance, and only push pays.

## What does NOT hold — a claim this eval retracted

An earlier clean run of the same harness gave `unforced pull` 0.60 on both `declared` and
`skill_used`, and the write-up at the time concluded that gate 1 leaks and that the `nudge` arm
repairs it (0.60 -> 1.00). **The repeat run above does not reproduce that.** Unforced `pull`
scores 1.00 on its own, and `nudge` scores *lower* on `skill_used` (0.80). Run-to-run spread at
`n = 5` is as large as the effect that was attributed to the nudge.

The `nudge` arm therefore does **not** establish that the nudge-only hook repairs gate 1, and
the hook's re-validation debt — opened when retrieval was stripped out of it — stays open.

The divergent run's raw rows were overwritten before they were committed, so the 0.60 figure
cannot be checked against an artifact. It is recorded here because the disagreement is the
finding: at this n, a single run of this harness produces confident, plausible, unstable tables.
Treat any cell here as an indication until n is raised.

## Limitations

- **n = 5 per cell.** A 0.60-vs-1.00 gap is three runs against five. The direction is corroborated
  by three columns moving together (`declared`, `ru_query`, `skill_used`), but these are
  indications, not estimates.
- **Synthetic task.** One invented three-file project, five Russian questions, every one of them
  a genuine x-deficit. Real sessions are mixed, and a real x/y diagnosis has to *decide* that,
  not be handed it.
- **Push suppression is only visible unforced.** In the forced gate the skill is invoked by
  instruction, which masks the effect.
- **One model, one day.** Nothing here separates a property of the framework from a property of
  the model that ran it.

# RESULTS — what the eval harness was leaking, and what it cost

Issue #14. Raw logs: `out/2nd-paired.log`, `out/2nd-paired2.log` (gitignored; re-runnable).

## The leak

`evals/README.md` claimed each script spawns a context-less `claude -p` "(`--strict-mcp-config`,
no MCP, no project files) so the model's only information is what the prompt hands it".

Two things made that false:

1. **`--strict-mcp-config` strips MCP servers but not hooks.** The subprocess inherited the
   developer's global `settings.json`, so `SessionStart` / `UserPromptSubmit` hooks fired inside
   the eval and a claude-mem memory digest landed in a supposedly blind agent's context.
   `--settings '{"hooks":{}}'` does **not** override inherited hooks (verified).
2. **`cwd` was inside this repo**, so `CLAUDE.md` auto-discovery handed the subprocess the yfx
   project guide and `gitStatus`. For evals *about this framework*, this is the worse of the two:
   the "blind" role was reading the design document of the thing it was judging.

Direct check — the subprocess was asked to list what had been injected into its context:

| | before | after |
| --- | --- | --- |
| answer | the yfx project guide, `gitStatus`, a claude-mem digest of ~50 observations | `NONE` |

Fixed in `lib.mjs`: every call runs from an empty scratch `cwd` with `CLAUDE_CONFIG_DIR` pointed
at a scratch config dir (credentials symlinked, never copied). `EVAL_ISOLATION=0` restores the
old behaviour deliberately, which is how the comparison below was run.

## What it cost — paired runs, arm B, k=3, 8 cases

Two pairs. The same code, the same dataset, the same verdict-free mandate; isolation is the only
variable. **Not** compared against `RESULTS-2nd.md`, whose numbers come from the v3 mandate that
still carried verdicts — that would confound two changes at once.

| pair | condition | core-recall | hits | empty (FA) | **known** | open | precision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | leak | 67% (12/18) | 19 | 11 | **2** | 64 | 63% |
| 1 | isolated | 76% (13/17) | 15 | 15 | **13** | 49 | 50% |
| 2 | leak | 78% (14/18) | 25 | 15 | **1** | 55 | 63% |
| 2 | isolated | 76% (13/17) | 17 | 12 | **15** | 48 | 59% |

**Core-recall is not affected.** Isolated runs gave 76% and 76%; the leaky ones swung 67% to 78%.
The headline claim in `RESULTS-2nd.md` — that `/2nd` catches the core materialized flaw — survives
the leak, and if anything the isolated measurement is the steadier one.

**Precision was inflated, in both pairs.** More hits under the leak (19, 25 vs 15, 17) and higher
precision (63%, 63% vs 50%, 59%).

**`known` is the big one: 2 and 1 under the leak, 13 and 15 isolated.** Under the leak the referee
almost never judged an objection to be something the author already knew.

## What this design cannot separate

**The referee is a `claude()` call too, and it was leaking as well.** So the `known` collapse may
be a *scoring-side* effect — a referee holding the yfx design record judges "already known"
differently — rather than the auditor producing better objections. Both roles moved at once, and
nothing here separates them. A run isolating only one side would.

This is the same mistake as the `ru_query` claim in `RESULTS-card-pull.md`: a comparison that
looks clean until you notice more than one thing changed between the arms.

## Consequence for committed results

`RESULTS-2nd.md` and `RESULTS-transfer.md` were produced under the leak.

- Their **core-recall** numbers are not undermined by it.
- Their **hits / empty / precision** columns are, in the direction of looking better than they
  are — which is precisely the channel that decides whether `/2nd` is worth the user's attention
  (caveat #2: every empty objection is paid attention).

## Limits

Two pairs, one arm (B), k=3, one model, verdict-free mandate. `known` moved by roughly an order of
magnitude and reproduced; precision moved consistently but by a few points, which is the size of
the run-to-run spread seen elsewhere in this repo. Treat the `known` effect as real and the
precision effect as a direction, not a quantity.

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

## Attributing it: which role was the leak acting on

The runs above move the **auditor and the referee together** — the referee is a `claude()` call
too — so they cannot say whether `known` collapsed because objections got better or because the
scorer judged "already known" differently. That is the same mistake as the `ru_query` claim in
`RESULTS-card-pull.md`: a comparison that looks clean until you notice more than one thing
changed between the arms.

`lib.mjs`'s `claude()` now takes a per-call `isolate` override, and `second-opinion.mjs` exposes
`ISOLATE_AUDITOR` / `ISOLATE_REFEREE`, so one role can be held leaky while the other is isolated.
Completing the 2x2 (arm B, k=3; the diagonal cells are the two pairs above):

| auditor | referee | core-recall | hits | empty | **known** | precision |
| --- | --- | --- | --- | --- | --- | --- |
| leak | leak | 67%, 78% | 19, 25 | 11, 15 | **2, 1** | 63%, 63% |
| iso | iso | 76%, 76% | 15, 17 | 15, 12 | **13, 15** | 50%, 59% |
| iso | leak | 78% | 17 | 22 | **3** | 44% |
| leak | iso | 72% | 20 | 6 | **12** | 77% |

Grouping every run by one role and ignoring the other:

| channel | separates by | referee leaky / isolated | auditor leaky / isolated |
| --- | --- | --- | --- |
| `known` | **referee** | 1, 2, 3 / 12, 13, 15 | overlaps |
| `hits` | auditor | overlaps | 19, 20, 25 / 15, 17, 17 |
| `precision` | auditor | overlaps | 63, 63, 77 / 44, 50, 59 |
| `core-recall` | **neither** | overlaps | overlaps |

**Only one of these is established.** "The groups do not overlap" is too weak a test at three
runs per group, because the groups themselves are wide. Comparing the between-group gap against
the widest within-group spread:

| channel | role | groups | gap | within-group spread | verdict |
| --- | --- | --- | --- | --- | --- |
| `known` | referee | 1,2,3 vs 12,13,15 | **9** | 3 | **effect** |
| `hits` | auditor | 19,20,25 vs 15,17,17 | 2 | 6 | not established |
| `precision` | auditor | 63,63,77 vs 44,50,59 | 4 | 15 | not established |

So: **`known` belongs to the referee** — a leaking scorer under-calls "the author already knew
this", by a margin three times the noise. That is the one claim this 2x2 supports.

The auditor's apparent pull on `hits` and `precision` is **not established**. The separation is
clean but the margin is smaller than the spread inside either group, so the direction is
suggestive at best and the magnitude is not estimable at this n. The same test applied to the
original paired comparison above (precision 63,63 leaky vs 50,59 isolated) gives a gap of 4
against a spread of 9 — so the "precision was inflated" reading of that table is weaker than it
was first written, too.

**`core-recall` separates by neither role.** That is why the headline survived: whether an
auditor caught the core materialized problem is robust to both leaks, while how its findings get
*classified* is not.

## Consequence for committed results

`RESULTS-2nd.md`, `RESULTS-transfer.md` **and `RESULTS-memory-provider.md`** were produced under
the leak. The third was missed when the other two were marked — and it was the worst omission,
being the artifact that gates CI and justifies deleting 276 lines from `recall-context.mjs`. It
has since been **re-run isolated** rather than annotated: the conclusion held (mem0 R 0.88 → 0.95,
claude-mem 0.00 → 0.00 on the identical frozen 24 rows), so the cards and the CI gate stand on an
isolated measurement now. The remaining two are still only marked, not re-run.

- Their **core-recall** numbers are not undermined by it, by either role.
- Their **`known` classification is distorted** — established, and it belongs to the referee.
  Since `known` is one of four buckets an objection can land in, shifting it shifts the others.
- Their **hits / precision** columns moved in the direction of looking better than they are, but
  **that is not established at this n** (see the gap-vs-spread table above). It remains the
  reason to re-run them — every empty objection is paid attention (caveat #2) — not a finding
  about them.

## Limits

Six runs, one arm (B), k=3, one model, verdict-free mandate. The diagonal cells of the 2x2 have
two runs each; the off-diagonal cells have one. `known` separates by a factor of four with no
overlap, and survives being grouped six ways — treat it as real. Everything else moved by margins
inside this repo's measured run-to-run spread; treat those as directions, not quantities.

What this does **not** establish: any of it for arms A, C, D, for the transfer dataset, or for
the verdict-carrying mandate the committed `RESULTS-2nd.md` numbers were produced under.

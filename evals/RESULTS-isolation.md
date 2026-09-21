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

**Precision looked better under the leak** — more hits (19, 25 vs 15, 17) and higher precision
(63%, 63% vs 50%, 59%). Read this as a direction only: the attribution section below shows the
gap is smaller than the spread within either condition, so it is not established.

**`known` is the big one: 2 and 1 under the leak, 13 and 15 isolated.** Under the leak the referee
almost never judged an objection to be something the author already knew. The `open` bucket moves
the other way on both pairs (64 → 49, 55 → 48), which raises the obvious objection — that this is
a relabelling between two non-hit buckets rather than a finding about `known`. The 2x2 below is
what settles it, and it does not support that reading.

## Attributing it: which role was the leak acting on

The runs above move the **auditor and the referee together** — the referee is a `claude()` call
too — so they cannot say whether `known` collapsed because objections got better or because the
scorer judged "already known" differently. That is the same mistake as the `ru_query` claim in
`RESULTS-card-pull.md`: a comparison that looks clean until you notice more than one thing
changed between the arms.

`lib.mjs`'s `claude()` now takes a per-call `isolate` override, and `second-opinion.mjs` exposes
`ISOLATE_AUDITOR` / `ISOLATE_REFEREE`, so one role can be held leaky while the other is isolated.
Completing the 2x2 (arm B, k=3; the diagonal cells are the two pairs above):

Every bucket, so the accounting closes — a referee classifies each finding as exactly one of
hit / empty / known / open, so omitting one hides where a shift went:

| auditor | referee | core-recall | hits | empty | **known** | open | total | precision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| leak | leak | 67% | 19 | 11 | **2** | 64 | 96 | 63% |
| leak | leak | 78% | 25 | 15 | **1** | 55 | 96 | 63% |
| iso | iso | 76% | 15 | 15 | **13** | 49 | 92 | 50% |
| iso | iso | 76% | 17 | 12 | **15** | 48 | 92 | 59% |
| iso | leak | 78% | 17 | 22 | **3** | 54 | 96 | 44% |
| leak | iso | 72% | 20 | 6 | **12** | 58 | 96 | 77% |

**Only one channel is established.** "The groups do not overlap" is too weak a test at three runs
per group, because the groups themselves are wide. Grouping all six runs by one role, then
comparing the between-group gap against the widest within-group spread:

| channel | grouped by referee | gap / spread | grouped by auditor | gap / spread |
| --- | --- | --- | --- | --- |
| **`known`** | **1,2,3 vs 12,13,15** | **9 / 3 → effect** | 1,2,12 vs 3,13,15 | overlaps |
| `open` | 54,55,64 vs 48,49,58 | overlaps | 55,58,64 vs 48,49,54 | 1 / 9 → not established |
| `hits` | 17,19,25 vs 15,17,20 | overlaps | 19,20,25 vs 15,17,17 | 2 / 6 → not established |
| `empty` | 11,15,22 vs 6,12,15 | overlaps | 6,11,15 vs 12,15,22 | overlaps |
| `precision` | overlaps | — | 63,63,77 vs 44,50,59 | 4 / 15 → not established |
| `core-recall` | overlaps | — | overlaps | — |

**`known` belongs to the referee**: a leaking scorer under-calls "the author already knew this",
by a margin three times the widest within-group spread. As a share of all findings the same
separation holds — 1.0%, 2.1%, 3.1% leaky against 12.5%, 14.1%, 16.3% isolated. That is the one
claim this 2x2 supports, and it is the only channel in the table that separates by anything.

**It is not merely relabelled from `open`.** Two independent reasons, and the first is arithmetic
the earlier draft of this paragraph got wrong:

- On pair 1 the `open` drop (15) does exceed the `known` rise (11), so relabelling could account
  for it there. **On pair 2 it cannot**: `known` rises by 14 while `open` falls by only 7. Half
  the rise has no `open` to come from. (An earlier version of this sentence claimed the drop
  exceeded the rise on *both* pairs — it does not, and the true numbers argue the conclusion more
  strongly than the false ones did.)
- Across all six runs `open` does **not** separate by the referee (54, 55, 64 leaky vs 48, 49, 58
  isolated — overlapping), and in the off-diagonal cells it moves the wrong way for that story.

**Everything else is not established**, including the auditor's apparent pull on `hits` and
`precision`: those groups separate, but by less than the widest within-group spread (for `hits` the gap merely equals the spread in the isolated group), so the
direction is suggestive at best and the magnitude is not estimable at this n. The same test
applied to the original paired comparison above (precision 63,63 leaky vs 50,59 isolated) gives a
gap of 4 against a spread of 9 — the "precision was inflated" reading of that table is weaker
than it was first written, too.

**`empty` points the same way as `hits` and `precision`, not against them.** An earlier draft of
this paragraph read its highest count (22, an isolated-auditor run) as a counter-example to "the
leak made everything look better" — that inverts it. Grouped by auditor, `empty` is higher in
every isolated run than in every leaky one (12, 15, 22 vs 6, 11, 15): **more** false alarms when
isolated, i.e. the leak looking better, the same direction as the other two. It still does not
separate — the ranges overlap — so it joins them as not established rather than as evidence.

Grouped by the *referee* instead, `empty` has no direction at all (11, 15, 22 leaky vs 15, 12, 6
isolated). Only `known` responds to that axis.

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

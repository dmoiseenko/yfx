# evals/ — L0 blind-label replay

The framework's own caveats (`docs/convergence-protocol.md` → Open UU #4, `docs/mode-detector.md`)
admit the problem: **"8/8" was scored against the designer's own hand-labels** — it proves the
classifier agrees with *me*, not that it recovers the truth. Every probe except the recall
retrieval eval (which had an external gold standard) was validated that way.

L0 breaks that circle by separating three roles that see **different information**, so no role can
just re-run another's decision:

| role | script | sees | blind to |
| --- | --- | --- | --- |
| **classifier** (system under test) | `classify.mjs` | prompt + warm/cold context (**foresight**) | outcome, answer key |
| **truth labeler** (independent) | `label-blind.mjs` | prompt + **what actually happened next** (**hindsight**) | the classifier's rubric/signals, my labels |
| **scorer** | `score.mjs` | both, plus my `prior_claim` | — |

The classifier reads the **shipped** mandate verbatim from `skills/fresh-lens/SKILL.md` (via
`shippedModeMandate()` in `lib.mjs`), so this tests the real artifact and follows it if the skill
text changes.

## Run

```bash
cd evals
node classify.mjs        # -> out/classifier.jsonl   (foresight, shipped mandate)
node label-blind.mjs     # -> out/blind.jsonl        (independent hindsight truth)
node score.mjs           # joins them + measures echo
```

Needs the `claude` CLI on PATH. Each script spawns one context-less `claude -p` per row
(`--strict-mcp-config`, no MCP, no project files) so the model's only information is what the
prompt hands it. `MODEL=haiku` for a cheaper/faster pass; default `sonnet`.

## The three numbers

- **classifier vs blind truth** — the honest accuracy of the shipped classifier.
- **answer-key vs blind truth** — was my hand-label itself right? (low ⇒ the old score was echo.)
- **classifier vs answer-key** — the OLD self-referential score, shown only for contrast.
- **echo** — cases where the classifier matched my label *and my label was wrong*: pure
  agreement-with-me that a self-referential eval would have scored as a win.

**Right direction** = classifier↑ **and** answer-key↑, converging. A high old score next to a low
blind-truth score is the failure the framework warns about: measuring agreement, not truth.

## Gold tier: user labels

`label-blind.mjs` is the *proxy* tier — an independent agent is not the user. The gold tier is
**your** labels: write `out/blind.jsonl` yourself as lines of
`{"id","label","why","source":"user"}` and skip `label-blind.mjs`. `score.mjs` consumes either.
Replacing agent labels with user labels is what finally answers Open UU #4 (mode is the user's
private intent, not a surface property).

## Extending the dataset

The shipped moves are **genericized paraphrases** of the real private-project moves the framework
was validated on — the mode/route character and the warm/cold context are preserved, but domain
nouns were neutralized for public release.

`dataset.jsonl`, one move per line: `{id, task:"mode"|"route", prompt, context, resolution, prior_claim}`.
- `resolution` — a **factual** note of what happened next (enables hindsight labeling). `null` ⇒ the
  labeler falls back to foresight (weaker; marked `agent-foresight` in output).
- `prior_claim` — the label the old self-referential score rested on. Used **only** for echo
  detection; never shown to the classifier or the labeler.

## second-opinion.mjs — /2nd hit/false-alarm A/B + independence ablation

The debt recorded in `docs/open-threads.md`: `/2nd` was promoted on n=1 and owes the same bar
x/y was held to. One dataset (`second-dataset.jsonl`) answers two questions at once:

- **Does /2nd work?** 8 real plans from this framework's own design record, captured at the
  moment before the irreversible step, each with a hindsight `resolution` (6 whose core flaw
  later materialized + 2 clean controls). Objections are scored hit / known / empty / open by a
  hindsight referee blind to arm identity; controls exist so false alarms cost something.
- **Why does it work?** Four arms, same shipped mandate: **A** self-audit with manufactured
  in-context stake (defend first, then audit — fixes the "no real stake" flaw of the earlier
  subprocess UU test), **B** cold + neutral distillate (/2nd as shipped), **C** cold + the
  author's full rationale (separates no-priors from no-stake; tests the "don't prime the lens"
  rule), **D** arm B on a different model (does model diversity add beyond fresh context?).

```bash
node second-opinion.mjs                      # 8 cases x (5 audit + 4 judge) claude -p calls
MODEL=sonnet OTHER_MODEL=haiku node second-opinion.mjs
```

Caveats are in the script header; the big one: an LLM referee can pattern-match generic
criticism ("your validation is circular") onto a real flaw, which inflates all arms equally —
so the between-arm comparison is the robust readout, absolute hit rates less so.

## Known scoring nuance

`score.mjs` uses strict equality. For routing, a classifier answer of `both` on a `y`-labeled move
is scored as a miss even though `both` contains `y` — a routing-diagnosis eval would normally
count `both` as acceptable for non-`act` labels. Tighten if routing becomes the focus.

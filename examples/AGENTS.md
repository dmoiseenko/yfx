# AGENTS.md — example: wire the readiness probe into Codex
#
# Copy this into your project's root AGENTS.md (or merge the section below into an
# existing one). It makes the agent run the tool-agnostic readiness check before
# acting on any non-trivial request. Self-contained — no yfx install needed.
# Full rationale: https://github.com/dmoiseenko/yfx/blob/main/readiness.md

## Before acting: the readiness probe

Before acting on any non-trivial request, check the current conversation for two
deficits, then act / ask / retrieve accordingly. Judge **structurally, not by how
confident you feel** — from one confidence signal a missing fact and an ambiguous
goal are indistinguishable, and a confident-but-wrong read is real.

- **y — is the goal clear?** Enumerate 2–3 distinct OUTCOMES the request could mean
  (different things you'd build, not rewordings). If ≥2 are materially different and
  would change what you produce → **ask the user to pick a direction** before building.
- **x — is the context sufficient?** Draft your intended first action; flag any
  load-bearing claim you **cannot cite** from the chat, the code, or memory (an
  identifier, a past decision, a convention). If any → **retrieve or ask** for that
  fact first. Judge by citeability, not felt confidence.
- **VoI gate** — only ask/retrieve if resolving the gap would change your FIRST
  action; otherwise act. A question that wouldn't move the decision is friction.

When both are satisfied, say nothing and act. Otherwise state the single gap (the
uncitable fact, or the ≥2 outcomes) and resolve it before proceeding.

> This catches a missing x and an ambiguous y — not an unknown-unknown (a risk
> outside the options you generated). For that, run an independent review, not a
> better self-check.

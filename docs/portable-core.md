# The portable core (Codex, or any agent) — frozen

Since 2026-10-06 the framework targets Claude Code only (why: [`open-threads.md`](open-threads.md));
what follows is kept as-is but no longer updated. Moved here from the README on 2026-11-10.

The skills are Claude Code packaging, but the heart of the loop — *is x sufficient, is y clear,
right now?* — is one tool-agnostic probe that reads only the current chat. See
[`readiness.md`](../readiness.md). To wire it into Codex, copy
[`examples/AGENTS.md`](../examples/AGENTS.md) into your project's `AGENTS.md` (self-contained, no
install). Any other agent: paste the probe as a preamble.

# providers/ — memory provider cards

A provider "plugin" here is **prose, not code**. yfx does not retrieve memory; it decides *when*
memory is needed (the x/y diagnosis) and *how to treat what comes back* (cite it, don't silently
contradict it). Reaching the store is the provider's job, and the agent does the reaching.

So a provider card is a **capability declaration** the agent reads: which tool to call, what
comes back, and what the provider cannot do. One file per provider. No adapter, no transport,
no interface to implement.

## Wiring

`skills/memory-provider.md` is a symlink to the active card. Skills link to it relatively
(`../memory-provider.md`), the same way they already link to `../xy-diagnosis.md`, so the path
resolves identically in this checkout and in an installed `~/.claude/`.

```bash
ln -sf ../providers/mem0.md       skills/memory-provider.md   # default
ln -sf ../providers/claude-mem.md skills/memory-provider.md
ln -sf ../providers/none.md       skills/memory-provider.md   # no memory installed
```

**Pulled, not pushed.** The card is reached by link when a skill runs, never injected into every
prompt. That is deliberate: observation #15105 measured that the always-on x/y prompt *suppresses
skill invocation* — prose in the standing budget crowds out tool reach. A linked card costs zero
tokens until memory actually matters.

## What a card must declare

Six axes, because these are where real providers measured differently — not a speculative
interface:

| axis | why it matters to the agent |
| --- | --- |
| **tool** | what to actually call |
| **query language** | whether to search in the user's language or translate to English first |
| **citable ids** | whether `#ID` citations are possible, or prior work must be quoted |
| **expansion** | whether search returns full content or ids needing a second fetch |
| **scope** | how to narrow to this repo / directory / oneself |
| **auto-injection** | what the provider already put in context, so the agent doesn't re-fetch it |

The **query language** row is not a guess: it is measured per provider by
[`evals/memory-provider.mjs`](../evals/memory-provider.mjs) under
[`PROTOCOL-memory-provider.md`](../evals/PROTOCOL-memory-provider.md). A card that claims a
language bridge without that measurement is claiming more than is known.

## Adding a provider

Copy the closest card, fill the six axes, and — if you care whether its language row is true —
add it to `evals/memory-provider.mjs` (it needs `corpus()` and `search()`) and run the eval.

## One trap: links inside a card

A card is read through the symlink at `skills/memory-provider.md`, so a relative link inside it
resolves against `skills/` — but the same link resolves against `providers/` when someone opens
the file directly. Write paths **from the repository root** (`skills/xy-diagnosis.md`), which is
unambiguous either way.

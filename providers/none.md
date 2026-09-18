---
provider: none
tool: (none)
query_language: unmeasured
citable_ids: false
expansion: none
scope: []
auto_injection: none
---

# Memory provider: none

No persistent memory is installed. This is a real, supported configuration — `/clarify`,
`/fresh-lens` and `/2nd` never needed memory, and `/recall` still does useful work without it.

## What the agent should do

**Do not pretend to recall.** There is no store to search, so the x-half of the x/y diagnosis
cannot be *filled* — but it can still be *run*, and running it is the point:

1. Do the diagnosis as written in `skills/xy-diagnosis.md`. It costs nothing and it
   is what separates a context gap from goal ambiguity.
2. If the deficit is **x** (context you cannot cite), you have three honest moves, in order:
   read the code and the committed docs; check `git log` / PR history; **ask the user**. A
   context gap that only the user can close is a question, not a search.
3. If the deficit is **y**, nothing changes — hand off to `/clarify` exactly as normal.
4. Never present a reconstruction as a recalled decision. Without a store there are no prior
   decisions on record, only inferences from the code — say which one you are offering.

## Why this card exists

So that "no memory installed" is a declared configuration rather than a broken one. A skill that
links here gets a definite answer — *there is nothing to search, here is what to do instead* —
instead of naming a tool that does not exist and failing silently.

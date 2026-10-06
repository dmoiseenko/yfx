// The prompt texts the yfx mod hands the model, checked under `npm test` so CI guards them too
// (CI has no `claude` binary, so it cannot run the mod's own `claude plugin test`).
//
// Ported from the guard hooks/recall-context.test.mjs held before the nudge moved into the mod.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const prompt = (name) => readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), "utf8");

// CLAUDE.md: nothing outside providers/ may hardcode a memory provider's tool or transport.
// Which tool exists, and whether it needs English terms, is the provider card's business
// (providers/*.md via skills/memory-provider.md); a prompt that names one re-couples the framework.
test("the prompts stay provider-neutral", () => {
  for (const name of ["xy-nudge", "fresh-lens"]) {
    for (const leak of ["claude-mem", "mem0", "get_observations", "mem-search", "37777", "search_memories"]) {
      assert.ok(!prompt(name).includes(leak), `prompts/${name}.md must not mention "${leak}"`);
    }
  }
});

test("the nudge still routes to both levers", () => {
  assert.match(prompt("xy-nudge"), /\/recall/);
  assert.match(prompt("xy-nudge"), /\/clarify/);
});

test("the lens reminder still names the audit it triggers", () => {
  assert.match(prompt("fresh-lens"), /\/fresh-lens/);
});

#!/usr/bin/env node
// Rebuild the COMMITTED card-pull summary from raw rows, without re-running 40 agent sessions.
//
// Same reason as summarize-run.mjs: a run whose raw rows survived should not have to be repeated
// because the summary format changed. It cannot invent a number the run did not produce.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
import { PROBE_TOOL, DECOY_TOOLS } from "./probe-mcp.mjs";

const rows = readFileSync(join(ROOT, "out", "card-pull.jsonl"), "utf8")
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const KEYS = {
  declared: "called_declared_tool", decoy: "called_decoy", none: "called_nothing",
  ru_query: "query_cyrillic", touched_card: "touched_card", skill_used: "skill_used",
  fabricated_ids: "fabricated_ids",
};
const gates = [...new Set(rows.map((r) => r.gate))];
const arms = [...new Set(rows.map((r) => r.arm))];
const cells = [];
for (const gate of gates) {
  for (const arm of arms) {
    const rs = rows.filter((r) => r.arm === arm && r.gate === gate && !r.error);
    if (!rs.length) continue;
    const cell = { gate, arm, n: rs.length };
    for (const [out, key] of Object.entries(KEYS)) cell[out] = rs.filter((r) => r[key]).length / rs.length;
    cells.push(cell);
  }
}
// ran_at must be when the AGENTS ran, not when this rebuild happened — a summary rebuilt from
// old rows otherwise stamps itself with today, and the file's promise that it "cannot invent a
// number the run did not produce" would be false about its own timestamp.
const times = rows.map((r) => r.at).filter(Boolean).sort();
const summary = {
  config: { arms, gates, prompts: new Set(rows.map((r) => r.prompt)).size,
            // null, never a fallback to the current default: a run that did not pin its model
            // did not record one, and guessing it here would put an unmeasured fact in a
            // committed artifact.
            model: rows.find((r) => r.model)?.model ?? null,
            probe_tool: PROBE_TOOL, decoys: DECOY_TOOLS,
            ran_at: times[0] ?? null, ran_until: times[times.length - 1] ?? null,
            rebuilt_at: new Date().toISOString(), rebuilt_from: "out/card-pull.jsonl" },
  cells,
  hook_leaks: rows.filter((r) => r.hook_leak).length,
  errors: rows.filter((r) => r.error).length,
};
writeFileSync(join(ROOT, "results-card-pull.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(cells, null, 2));

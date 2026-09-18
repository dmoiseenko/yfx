#!/usr/bin/env node
// Rebuild the COMMITTED summary from raw rows, without re-running the model calls.
//
// `memory-provider.mjs` writes both; this exists for when you change how results are summarized,
// or recover a run whose raw rows survived but whose summary did not. Same `summarize()`, same
// data — it cannot invent a number the run did not produce.
//
//   node evals/summarize-run.mjs [N] [SEED] [TOP_K] [MODEL]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarize } from "./memory-provider.mjs";
import { ROOT } from "./lib.mjs";

const rows = readFileSync(join(ROOT, "out", "memory-provider.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l));

const [N = 24, SEED = 20260918, TOP_K = 5, MODEL = "sonnet"] = process.argv.slice(2);
const out = {
  config: {
    N: Number(N), SEED: Number(SEED), TOP_K: Number(TOP_K), model: MODEL,
    arms: ["ru_bare", "ru_anchored", "en"],
    ran_at: new Date().toISOString(),
    rebuilt_from: "out/memory-provider.jsonl",
  },
  providers: summarize(rows),
};
writeFileSync(join(ROOT, "results-memory-provider.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out.providers, null, 2));

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

// Config comes from the CALLER, not from defaults: a rebuild that guessed N=24 for an N=12 run
// would publish a number the run did not produce — which is what the header promises not to do.
// Anything not supplied stays null rather than being invented, and `ran_at` is null because these
// rows predate per-row timestamps; `rebuilt_at` is the only time this script can honestly stamp.
// (summarize-card-pull.mjs takes ran_at from rows[].at; do the same here once rows carry it.)
const arg = (i) => (process.argv[i + 2] === undefined ? null : Number(process.argv[i + 2]));
const out = {
  config: {
    N: arg(0), SEED: arg(1), TOP_K: arg(2), model: process.argv[5] ?? null,
    arms: ["ru_bare", "ru_anchored", "en"],
    ran_at: rows.find((r) => r.at)?.at ?? null,
    rebuilt_at: new Date().toISOString(),
    rebuilt_from: "out/memory-provider.jsonl",
  },
  providers: summarize(rows),
};
writeFileSync(join(ROOT, "results-memory-provider.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out.providers, null, 2));

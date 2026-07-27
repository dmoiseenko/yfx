#!/usr/bin/env node
// SCORER — joins the foresight classifier against the blind truth labels, and
// separately measures how much of the original "8/8" was ECHO (agreement with my
// own prior labels rather than with independent truth).
//
// Three numbers that matter:
//   classifier vs blind   — the honest accuracy of the shipped classifier
//   prior_claim vs blind  — was my answer key itself right? (low = the 8/8 was echo)
//   classifier vs prior   — the OLD self-referential score, shown for contrast
//
//   node score.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readDataset, ROOT } from "./lib.mjs";

function load(name) {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, "out", name), "utf8").trim().split("\n").map((l) => {
        const o = JSON.parse(l);
        return [o.id, o];
      }),
    );
  } catch {
    console.error(`missing out/${name} — run classify.mjs / label-blind.mjs first`);
    process.exit(1);
  }
}

const data = Object.fromEntries(readDataset().map((r) => [r.id, r]));
const clf = load("classifier.jsonl");
const blind = load("blind.jsonl");

// Exclude rows where the classifier call failed/couldn't be parsed — a harness
// failure is not a classifier miss. They're reported separately as coverage.
const allIds = Object.keys(data).filter((id) => clf[id] && blind[id]);
const errored = allIds.filter((id) => clf[id].label === "err" || clf[id].label === "?");
const ids = allIds.filter((id) => !errored.includes(id));
let cVsBlind = 0, priorVsBlind = 0, cVsPrior = 0, echo = 0;
const rows = [];
for (const id of ids) {
  const truth = blind[id].label, pred = clf[id].label, prior = data[id].prior_claim;
  const okTruth = pred === truth;
  const priorOk = prior === truth;
  const oldOk = pred === prior;
  if (okTruth) cVsBlind++;
  if (priorOk) priorVsBlind++;
  if (oldOk) cVsPrior++;
  if (oldOk && !okTruth) echo++; // classifier matched my label but that label was wrong
  rows.push({ id, task: data[id].task, prior, truth, pred, src: blind[id].source, okTruth, priorOk });
}

const pct = (n) => `${n}/${ids.length} (${Math.round((100 * n) / ids.length)}%)`;
console.log(`\n=== L0 blind-label replay — ${ids.length} moves ===\n`);
console.log("id   task   prior_claim  blind_truth  classifier   truth?  key-was-right?  source");
for (const r of rows) {
  console.log(
    `${r.id.padEnd(4)} ${r.task.padEnd(6)} ${r.prior.padEnd(12)} ${r.truth.padEnd(12)} ${r.pred.padEnd(12)} ` +
    `${(r.okTruth ? "  ✓" : "  ✗").padEnd(7)} ${(r.priorOk ? "     ✓" : "     ✗").padEnd(15)} ${r.src}`,
  );
}
console.log("\n--- headline numbers ---");
console.log(`  classifier vs blind truth : ${pct(cVsBlind)}   <- the honest accuracy`);
console.log(`  answer-key vs blind truth : ${pct(priorVsBlind)}   <- was my hand-label right?`);
console.log(`  classifier vs answer-key  : ${pct(cVsPrior)}   <- the OLD self-referential score`);
console.log(`  echo (matched my label, but my label was wrong): ${echo}`);
if (errored.length) console.log(`  excluded (harness call failed/unparsed, not scored): ${errored.length} [${errored.join(", ")}]`);
console.log(`\nRight direction = classifier↑ AND answer-key↑ converging. A high old score with a`);
console.log(`low blind-truth score means the "8/8" was measuring agreement with me, not truth.\n`);

#!/usr/bin/env node
// BLIND truth labeler — establishes ground truth INDEPENDENTLY of the classifier.
// It is a fresh agent (dogfooding fresh-lens independence) that sees the prompt +
// what ACTUALLY HAPPENED next (hindsight), but NOT the classifier's rubric, signals,
// bias-guard, or my prior labels. It reasons from outcome, not from surface signals,
// so it cannot merely re-run the classifier's decision procedure.
//
// This is the PROXY tier. The GOLD tier is user-supplied labels: drop a
// out/blind.jsonl with {"id","label","why","source":"user"} and skip this script.
//
//   node label-blind.mjs         # all rows -> out/blind.jsonl
//   MODEL=haiku node label-blind.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readDataset, claude, firstJson, ROOT, MODEL } from "./lib.mjs";

// Definitions only — deliberately NOT the classifier's signals/critical-rule/bias-guard.
// The labeler judges from what the outcome revealed, not from the wording.
const MODE_JUDGE = `You are an independent judge establishing GROUND TRUTH for a past interaction, with full hindsight. You are NOT the assistant and have no stake in any scheme.
At the moment of the request, was the user's desired outcome (y):
- DELIVERY: already existing — fully formed in the user's head, or objectively determined so any competent assistant would converge on the same thing. The work was only to realize/transfer a fixed target.
- DISCOVERY: NOT yet existing for anyone — it got co-constructed through the exchange, and naming it early would have foreclosed a better outcome nobody had seen yet.
Judge from WHAT ACTUALLY HAPPENED, not from the phrasing of the request.`;

const ROUTE_JUDGE = `You are an independent judge establishing GROUND TRUTH for a past request, with hindsight. You are NOT the assistant.
What did acting well on this request actually REQUIRE first?
- x: specific project facts / past decisions / identifiers the assistant would have to retrieve.
- y: a clarifying question, because the request admitted 2+ materially different outcomes.
- act: nothing — it was clear and executable as stated.`;

async function labelMode(r) {
  const p = `${MODE_JUDGE}\n\nRequest: "${r.prompt}"\nContext: ${r.context}\nWhat actually happened next: ${r.resolution || "(not recorded — judge from the request alone)"}\n\nOutput ONLY compact JSON: {"label":"discovery|delivery","why":"<=15 words"}`;
  const out = await claude(p);
  const j = firstJson(out) || {};
  return { id: r.id, task: "mode", label: (j.label || "?").toLowerCase(), why: j.why || out.slice(0, 60), source: r.resolution ? "agent-hindsight" : "agent-foresight" };
}

async function labelRoute(r) {
  const p = `${ROUTE_JUDGE}\n\nRequest: "${r.prompt}"\nContext: ${r.context}\n${r.resolution ? "What actually happened next: " + r.resolution + "\\n" : ""}\nOutput ONLY compact JSON: {"label":"x|y|act","why":"<=12 words"}`;
  const out = await claude(p);
  const j = firstJson(out) || {};
  return { id: r.id, task: "route", label: (j.label || "?").toLowerCase(), why: j.why || out.slice(0, 60), source: r.resolution ? "agent-hindsight" : "agent-foresight" };
}

const only = process.argv[2];
const rows = readDataset(only);
console.error(`blind-labeling ${rows.length} moves INDEPENDENTLY (model=${MODEL})…`);
const results = [];
for (const r of rows) {
  const res = r.task === "mode" ? await labelMode(r) : await labelRoute(r);
  results.push(res);
  console.error(`  ${res.id.padEnd(3)} -> ${res.label}  [${res.source}]`);
}
mkdirSync(join(ROOT, "out"), { recursive: true });
writeFileSync(join(ROOT, "out", "blind.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.error(`wrote out/blind.jsonl (${results.length} rows)`);

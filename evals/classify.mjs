#!/usr/bin/env node
// FORESIGHT classifier — the system under test. Runs the SHIPPED mode mandate
// (read verbatim from skills/fresh-lens/SKILL.md) and the Step-0 route method,
// seeing ONLY the prompt + a warm/cold context note. No resolution, no answer key.
//
//   node classify.mjs            # all rows -> out/classifier.jsonl
//   MODEL=haiku node classify.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readDataset, claude, firstJson, labelFallback, shippedModeMandate, ROUTE_METHOD, ROOT, MODEL } from "./lib.mjs";

const MANDATE = shippedModeMandate();

async function classifyMode(r) {
  const p = `${MANDATE}\n\nMOVE ${r.id} — "${r.prompt}"  [context: ${r.context}]\nOutput ONLY compact JSON: {"label":"discovery|delivery","confidence":0.00,"why":"<=12 words"}`;
  const out = await claude(p);
  if (out.startsWith("ERR:")) return { id: r.id, task: "mode", label: "err", confidence: null, why: out.slice(0, 60) };
  const j = firstJson(out) || {};
  const label = (j.label || labelFallback(out, ["discovery", "delivery"]) || "?").toLowerCase();
  return { id: r.id, task: "mode", label, confidence: j.confidence ?? null, why: j.why || out.slice(0, 60) };
}

async function classifyRoute(r) {
  const p = `${ROUTE_METHOD}\n\nRequest: "${r.prompt}"  [context: ${r.context}]\nOutput ONLY compact JSON: {"label":"x|y|act|both","why":"<=8 words"}`;
  const out = await claude(p);
  if (out.startsWith("ERR:")) return { id: r.id, task: "route", label: "err", confidence: null, why: out.slice(0, 60) };
  const j = firstJson(out) || {};
  const label = (j.label || labelFallback(out, ["both", "act", "x", "y"]) || "?").toLowerCase();
  return { id: r.id, task: "route", label, confidence: null, why: j.why || out.slice(0, 60) };
}

const only = process.argv[2]; // optional: "mode" | "route"
const rows = readDataset(only);
console.error(`classifying ${rows.length} moves as FORESIGHT (model=${MODEL}) against the shipped mandate…`);
const results = [];
for (const r of rows) {
  const res = r.task === "mode" ? await classifyMode(r) : await classifyRoute(r);
  results.push(res);
  console.error(`  ${res.id.padEnd(3)} -> ${res.label}`);
}
mkdirSync(join(ROOT, "out"), { recursive: true });
writeFileSync(join(ROOT, "out", "classifier.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.error(`wrote out/classifier.jsonl (${results.length} rows)`);

#!/usr/bin/env node
// Does the readiness probe change anything, or is the logic already inside the model?
// A/B on the same requests:
//   baseline — no probe: "what's your FIRST move — act / ask / retrieve?"
//   probe    — the SHIPPED readiness.md fed verbatim, mapped to the same move.
// The DELTA is the answer. If they agree everywhere, the probe adds nothing (the
// logic is already inside). Where they differ — and whether the probe is right
// when the baseline is wrong — is its actual marginal value.
//
//   node readiness-try.mjs        # ~18 claude -p calls; MODEL=haiku for speed
//   SAMPLES=3 node readiness-try.mjs   # repeat each cell to see stochastic variance

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claude, firstJson, REPO, MODEL } from "./lib.mjs";

const METHOD = readFileSync(join(REPO, "readiness.md"), "utf8");
const SAMPLES = Number(process.env.SAMPLES || 1);

// expected FIRST move a correct agent should make:
//   clear  -> act       (do it; pausing would be friction)
//   trap-y -> ask       (>=2 materially different outcomes; acting guesses wrong)
//   trap-x -> retrieve  (rests on a fact not in the chat; acting invents it)
const CASES = [
  { prompt: "запусти pnpm test и покажи результат", context: "the command is clear and executable", label: "clear" },
  { prompt: "исправь опечатку 'existant' на 'existent' в README", context: "the exact edit is fully specified", label: "clear" },
  { prompt: "переименуй переменную foo в bar в utils.ts", context: "named symbol, named file, mechanical", label: "clear" },
  { prompt: "улучши главный дашборд", context: "a dashboard exists; no acceptance criterion given", label: "trap-y" },
  { prompt: "сделай обработку ошибок лучше", context: "'better' is undefined; several valid directions", label: "trap-y" },
  { prompt: "оптимизируй загрузку страницы", context: "no target metric or budget stated", label: "trap-y" },
  { prompt: "верни таймаут как договаривались на прошлой неделе", context: "cold thread — that decision is NOT in the current chat", label: "trap-x" },
  { prompt: "используй наш стандартный retry-хелпер здесь", context: "which helper is 'standard' is not stated or visible", label: "trap-x" },
  { prompt: "почему пропадают записи по одному из источников данных?", context: "cold — requires project-specific facts not loaded", label: "trap-x" },
];

const expected = { clear: "act", "trap-y": "ask", "trap-x": "retrieve" };
const MOVE = (s) => { s = (s || "").toLowerCase(); return ["act", "ask", "retrieve"].find((m) => s.includes(m)) || "?"; };
const readinessToMove = (r) => ({ ready: "act", "need-y": "ask", "need-x": "retrieve", "need-both": "retrieve" }[(r || "").toLowerCase()] || "?");

async function baseline(c) {
  const p = `You are an AI coding agent in an ongoing coding session. The user just sent a request.\nRequest: "${c.prompt}"\nContext available to you right now: ${c.context}\nWhat is your FIRST move? act = do it now; ask = ask the user to pick a direction; retrieve = go get a specific missing fact first.\nOutput ONLY compact JSON: {"move":"act|ask|retrieve","why":"<=12 words"}`;
  const out = await claude(p);
  return out.startsWith("ERR:") ? "err" : MOVE(firstJson(out)?.move);
}
async function probe(c) {
  const p = `${METHOD}\n\n---\nApply the probe now to a live request in an ongoing coding session.\nRequest: "${c.prompt}"\nContext available to you right now: ${c.context}\nOutput ONLY compact JSON: {"readiness":"ready|need-x|need-y|need-both","gap":"<=15 words"}`;
  const out = await claude(p);
  return out.startsWith("ERR:") ? "err" : readinessToMove(firstJson(out)?.readiness);
}

// majority move over SAMPLES draws (stability against stochasticity)
async function majority(fn, c) {
  const counts = {};
  for (let i = 0; i < SAMPLES; i++) { const m = await fn(c); counts[m] = (counts[m] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

console.error(`A/B on ${CASES.length} requests, ${SAMPLES} sample(s) each (model=${MODEL})…\n`);
let baseOk = 0, probeOk = 0, changed = 0, helped = 0, hurt = 0;
const rows = [];
for (const c of CASES) {
  const b = await majority(baseline, c);
  const p = await majority(probe, c);
  const exp = expected[c.label];
  const bOk = b === exp, pOk = p === exp;
  if (bOk) baseOk++; if (pOk) probeOk++;
  if (b !== p) { changed++; if (pOk && !bOk) helped++; if (!pOk && bOk) hurt++; }
  rows.push({ label: c.label, exp, b, p, prompt: c.prompt });
  console.error(`  ${c.label.padEnd(7)} exp=${exp.padEnd(8)} base=${b.padEnd(8)} probe=${p.padEnd(8)} ${b === p ? "(same)" : "DIFF"}  ${c.prompt.slice(0, 38)}`);
}

console.log(`\n=== does the probe change anything? (${CASES.length} requests, ${SAMPLES} sample(s)) ===`);
console.log(`  baseline correct (no probe):  ${baseOk}/${CASES.length}   <- how much logic is already inside`);
console.log(`  probe correct:                ${probeOk}/${CASES.length}`);
console.log(`  decisions changed by probe:   ${changed}/${CASES.length}`);
console.log(`     of which helped (probe right, baseline wrong): ${helped}`);
console.log(`     of which hurt   (probe wrong, baseline right): ${hurt}`);
console.log(`\n  If baseline is already high and 'changed' ~ 0, the probe mostly restates what`);
console.log(`  the model already does. Its value shows up only in 'helped' > 'hurt', and`);
console.log(`  especially on the trap-x cases (inventing a fact is the quiet failure).\n`);

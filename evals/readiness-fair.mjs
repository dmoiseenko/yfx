#!/usr/bin/env node
// FAIR re-test of "does the readiness probe change anything, or is the logic
// already inside the model?" — fixing the three biases of readiness-try.mjs:
//
//   1. Clean baseline. No act/ask/retrieve menu (that menu WAS half the probe).
//      The baseline just BEGINS its real response; an INDEPENDENT judge then
//      classifies whether it paused (ask/retrieve) or barreled ahead (act).
//   2. Neutral context. No hints like "that fact is NOT in the chat" that leak
//      the answer. The model must NOTICE the gap itself.
//   3. k samples. Baselines are stochastic — the probe's plausible value is
//      CONSISTENCY, so measure pause-rate over SAMPLES draws, not one.
//
//   SAMPLES=3 node readiness-fair.mjs        # ~3*3*cases claude -p calls
//   MODEL=haiku SAMPLES=3 node readiness-fair.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claude, firstJson, REPO, MODEL } from "./lib.mjs";

const METHOD = readFileSync(join(REPO, "readiness.md"), "utf8");
const SAMPLES = Number(process.env.SAMPLES || 3);

// Neutral context — states what's on screen, NOT whether a gap exists.
// expected correct FIRST move: clear->act, trap-y->ask, trap-x->retrieve.
const CASES = [
  { prompt: "запусти pnpm test и покажи результат", ctx: "you are in the project repo", label: "clear" },
  { prompt: "переименуй переменную foo в bar в utils.ts", ctx: "utils.ts is open in the editor", label: "clear" },
  { prompt: "улучши главный дашборд", ctx: "a dashboard page component is open", label: "trap-y" },
  { prompt: "сделай эту форму валидируемой", ctx: "a signup form component is on screen", label: "trap-y" }, // subtle: which fields / rules?
  { prompt: "верни таймаут как договаривались", ctx: "you are editing the http client", label: "trap-x" },     // the agreed value isn't stated
  { prompt: "используй наш стандартный логгер вместо console.log", ctx: "a file with console.log calls is open", label: "trap-x" }, // which logger is "ours"?
];

const expected = { clear: "act", "trap-y": "ask", "trap-x": "retrieve" };
const MOVE = (s) => { s = (s || "").toLowerCase(); return ["act", "ask", "retrieve"].find((m) => s.includes(m)) || "?"; };
const r2m = (r) => ({ ready: "act", "need-y": "ask", "need-x": "retrieve", "need-both": "retrieve" }[(r || "").toLowerCase()] || "?");

// Clean baseline: begin the real response, no menu. Then an independent judge labels it.
async function baselineMove(c) {
  const gen = await claude(`You are an AI coding agent in an ongoing coding session. The user's latest message:\n"${c.prompt}"\n(${c.ctx})\nWrite the opening of your ACTUAL response — how you would really begin. 2–4 sentences, no preamble.`);
  if (gen.startsWith("ERR:")) return "err";
  const judged = await claude(`Judge how an AI coding agent OPENED its response, to see whether it paused or proceeded.\nUser request: "${c.prompt}"\nAgent's opening:\n"""${gen.slice(0, 700)}"""\nClassify its FIRST move: act = it began the task / assumed one interpretation and proceeded; ask = it asked the user to clarify or pick a direction first; retrieve = it said it needs a specific missing fact/decision (or went to find it) first.\nPick the dominant first move. Output ONLY {"move":"act|ask|retrieve"}.`);
  return judged.startsWith("ERR:") ? "err" : MOVE(firstJson(judged)?.move);
}
async function probeMove(c) {
  const out = await claude(`${METHOD}\n\n---\nApply the probe to a live request in an ongoing coding session.\nRequest: "${c.prompt}"\n(${c.ctx})\nOutput ONLY: {"readiness":"ready|need-x|need-y|need-both","gap":"<=15 words"}`);
  return out.startsWith("ERR:") ? "err" : r2m(firstJson(out)?.readiness);
}

const rate = (moves, want) => moves.filter((m) => m === want).length / moves.length;

console.error(`FAIR A/B on ${CASES.length} cases, ${SAMPLES} samples each (model=${MODEL})…\n`);
let baseSum = 0, probeSum = 0;
const rows = [];
for (const c of CASES) {
  const want = expected[c.label];
  const bm = [], pm = [];
  for (let i = 0; i < SAMPLES; i++) { bm.push(await baselineMove(c)); pm.push(await probeMove(c)); }
  const b = rate(bm, want), p = rate(pm, want);
  baseSum += b; probeSum += p;
  rows.push({ label: c.label, want, b, p, bm, pm, prompt: c.prompt });
  console.error(`  ${c.label.padEnd(7)} want=${want.padEnd(8)} base=${(b * 100).toFixed(0).padStart(3)}%[${bm.join(",")}] probe=${(p * 100).toFixed(0).padStart(3)}%[${pm.join(",")}]  ${c.prompt.slice(0, 34)}`);
}

const n = CASES.length;
console.log(`\n=== FAIR: does the probe change anything? (${n} cases × ${SAMPLES} samples) ===`);
console.log(`  baseline correct-move rate (clean, no menu): ${(100 * baseSum / n).toFixed(0)}%`);
console.log(`  probe correct-move rate:                     ${(100 * probeSum / n).toFixed(0)}%`);
console.log(`  delta (probe − baseline):                    ${(100 * (probeSum - baseSum) / n >= 0 ? "+" : "")}${(100 * (probeSum - baseSum) / n).toFixed(0)} pts`);
console.log(`\n  Per case, watch the TRAP rows: if baseline pause-rate < 100% (it sometimes`);
console.log(`  barrels ahead) while probe = 100%, THAT gap is the probe's real value —`);
console.log(`  consistency the raw model doesn't have. If both are ~100%, it's inside already.\n`);

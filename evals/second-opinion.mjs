#!/usr/bin/env node
// /2nd hit/false-alarm A/B + independence ablation — ONE dataset, two answers:
//   1. Does /2nd earn its keep? (hits vs false alarms vs attention cost)
//   2. Is INDEPENDENCE the active ingredient, and which component of it?
//
// Dataset: real plans from this framework's own design record, each captured at the
// moment BEFORE the irreversible step, with a hindsight `resolution` recording what
// actually happened later (6 plans whose core flaw materialized + 2 clean controls).
//
// Four arms, all running the SHIPPED /2nd mandate (skills/2nd/SKILL.md, verbatim):
//   A (self)        — in-context authorship: first DEFENDS the plan, then audits its
//                     own plan+defense. Simulates the invested executor (fixes the
//                     "both arms lacked real stake" flaw of the earlier subprocess test).
//   B (cold)        — fresh agent, neutral distillate only. This IS /2nd as shipped.
//   C (cold+primed) — fresh agent given the author's FULL rationale. Separates
//                     no-stake from no-priors, and tests the skill's "don't prime
//                     the lens with your reasoning" rule.
//   D (cold, other) — arm B on a DIFFERENT model. Does model diversity add anything
//                     beyond fresh context?
//
// A hindsight REFEREE (blind to arm identity) scores each objection against what
// actually happened: hit / known / empty / open, plus whether the arm caught the
// CORE materialized problem and whether its verdict was right.
//
//   node second-opinion.mjs                 # 8 cases x (5 audit + 4 judge) calls
//   SAMPLES=3 node second-opinion.mjs       # k samples per arm-case — verdicts are
//                                           # stochastic; k>=3 before tuning wording
//   MODEL=sonnet OTHER_MODEL=haiku node second-opinion.mjs
//
// Caveats (recorded up front, not discovered later):
//   - The referee is itself an LLM; generic-sounding criticisms ("your validation is
//     circular") can pattern-match real flaws. The strict "names the mechanism, not
//     the category" instruction mitigates but does not eliminate this. It inflates
//     all arms equally, so BETWEEN-arm comparison is the robust readout.
//   - k=1 per arm; verdicts are stochastic. Treat single-case flips as noise.
//   - Controls' "no problem materialized" window is days old — control hits are
//     impossible by construction, so controls only measure over-flagging.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claude, firstJson, shippedSecondMandate, MODEL, ROOT } from "./lib.mjs";

const MANDATE = shippedSecondMandate();
const OTHER_MODEL = process.env.OTHER_MODEL || "haiku";
const SAMPLES = Number(process.env.SAMPLES || 1);
// Unbounded concurrency at k=3 (12-15 parallel claude -p per case) trips CLI
// throttling after ~2 cases and every later call dies as ERR. Cap it.
const POOL = Number(process.env.POOL || 4);

async function pool(thunks, limit = POOL) {
  const out = new Array(thunks.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, async () => {
    while (i < thunks.length) { const k = i++; out[k] = await thunks[k](); }
  }));
  return out;
}
// ONLY=id1,id2 re-runs just those cases — used to refill cells lost to an
// interrupted run (e.g. the host sleeping mid-run kills every call in flight).
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const CASES = readFileSync(join(ROOT, "second-dataset.jsonl"), "utf8")
  .trim().split("\n").map((l) => JSON.parse(l))
  .filter((c) => !ONLY.length || ONLY.includes(c.id));

const OUT = `Output ONLY JSON:
{"verdict":"proceed|adjust|dont-build","objections":[{"assumption":"<one line>","failure":"<the failure it hides>","question":"<what they should ask but aren't>"}]}
Max 4 objections, ranked most load-bearing first.`;

function parseAudit(text) {
  const j = firstJson(text);
  if (!j) return { verdict: "?", objections: [] };
  const v = String(j.verdict || "?").toLowerCase().replace(/[^a-z-]/g, "");
  return { verdict: ["proceed", "adjust", "dont-build"].find((x) => v.includes(x.replace("-", ""))) || v || "?",
           objections: Array.isArray(j.objections) ? j.objections.slice(0, 4) : [] };
}

// A: manufacture real in-context stake — defend first, audit second.
async function armSelf(c) {
  const defend = await claude(
    `You are the author of this plan and you believe in it. Plan and reasoning:\n${c.authored}\n` +
    `Write the strongest case for proceeding as-is (3-5 sentences). Output only the argument.`);
  return parseAudit(await claude(
    `${MANDATE}\n\n---\nOverride to the framing above: this is YOUR OWN plan, not someone else's. ` +
    `You authored it, and you just argued for it:\n"""${defend.slice(0, 900)}"""\n\n` +
    `Plan and reasoning:\n${c.authored}\n\nNow audit YOUR OWN plan for what you cannot see.\n\n${OUT}`));
}
// B: /2nd as shipped — cold agent, neutral distillate, no rationale.
async function armCold(c, model = MODEL) {
  return parseAudit(await claude(
    `${MANDATE}\n\n---\nHere is a plan someone is about to commit to. You have no stake in it and did not make it:\n` +
    `${c.distillate}\n\n${OUT}`, model));
}
// C: cold but primed with the author's full reasoning.
async function armPrimed(c) {
  return parseAudit(await claude(
    `${MANDATE}\n\n---\nHere is a plan someone is about to commit to. You have no stake in it and did not make it:\n` +
    `${c.distillate}\n\nTheir full reasoning (you did NOT author this):\n${c.authored}\n\n${OUT}`));
}

// Hindsight referee: blind to which arm produced the audit. Same model for all arms.
async function judge(c, audit) {
  if (!audit.objections.length && audit.verdict === "?") return null;
  const list = audit.objections.map((o, i) =>
    `  ${i + 1}. ${o.assumption} [failure: ${o.failure}]`).join("\n") || "  (none)";
  const j = firstJson(await claude(
    `You are a strict hindsight referee. A plan was audited BEFORE execution; you know what ACTUALLY happened after.\n` +
    `Plan as the auditor saw it:\n${c.distillate}\n\n` +
    `What actually happened later:\n${c.resolution}\n\n` +
    `Core materialized problem: ${c.core_problem ?? "none — the plan shipped cleanly"}\n\n` +
    `Auditor's verdict: ${audit.verdict}\nAuditor's objections:\n${list}\n\n` +
    `Classify EACH objection, strictly:\n` +
    `- "hit": specifically anticipates a problem that actually materialized — it names the mechanism, not merely a broad category that happens to contain it.\n` +
    `- "known": restates a consideration already voiced in the plan or its alternatives.\n` +
    `- "empty": generic boilerplate that would fit almost any plan, or a concern hindsight shows did not materialize.\n` +
    `- "open": specific to this plan and plausible, but the record can neither confirm nor refute it.\n` +
    `Also:\n` +
    `- "caught_core": true iff at least one objection anticipates the core materialized problem (always false if the core problem is none).\n` +
    `- "verdict_ok": if the core problem is none, the right verdict is "proceed"; otherwise "adjust" or "dont-build".\n` +
    `Output ONLY JSON: {"objections":["hit"|"known"|"empty"|"open",...in the same order],"caught_core":true|false,"verdict_ok":true|false}`));
  if (!j || !Array.isArray(j.objections)) return null;
  return j;
}

const ARMS = [
  { key: "A self", run: armSelf },
  { key: "B cold", run: (c) => armCold(c) },
  { key: "C primed", run: armPrimed },
  { key: `D ${OTHER_MODEL}`, run: (c) => armCold(c, OTHER_MODEL) },
];

const zero = () => ({ hit: 0, known: 0, empty: 0, open: 0, objs: 0, core: 0, vOk: 0, judged: 0, flawedJudged: 0 });
const tally = Object.fromEntries(ARMS.map((a) => [a.key, zero()]));

console.error(`/2nd A/B + ablation: ${CASES.length} cases x ${ARMS.length} arms x ${SAMPLES} samples (model=${MODEL}, other=${OTHER_MODEL})…\n`);

for (const c of CASES) {
  // Arm×sample chains for one case, throttled; each chain = audit -> judge.
  const jobs = [];
  for (const a of ARMS) for (let s = 0; s < SAMPLES; s++)
    jobs.push(async () => { const au = await a.run(c); return { arm: a.key, au, r: await judge(c, au) }; });
  const results = await pool(jobs);

  const cells = ARMS.map((a) => {
    const t = tally[a.key];
    const vc = {}; let core = 0, vok = 0, h = 0, e = 0, errs = 0, n = 0;
    for (const { arm, au, r } of results) {
      if (arm !== a.key) continue;
      if (!r) { errs++; continue; }
      n++; t.judged++; if (c.core_problem) t.flawedJudged++;
      au.objections.forEach((_, k) => { const lab = r.objections[k]; if (t[lab] !== undefined) { t[lab]++; t.objs++; } });
      if (r.caught_core) { t.core++; core++; }
      if (r.verdict_ok) { t.vOk++; vok++; }
      vc[au.verdict] = (vc[au.verdict] || 0) + 1;
      h += r.objections.filter((x) => x === "hit").length;
      e += r.objections.filter((x) => x === "empty").length;
    }
    const vstr = Object.entries(vc).map(([v, k]) => `${v.slice(0, 4)}×${k}`).join(",") || "—";
    return `${a.key}: ${vstr}${errs ? ` err${errs}` : ""} core${core}/${n} vok${vok}/${n} h${h}/e${e}`;
  });
  console.error(`  ${c.id.padEnd(17)}${c.core_problem ? "flawed " : "control"}  ${cells.join("  |  ")}`);
}

const flawedN = CASES.filter((c) => c.core_problem).length;
console.log(`\n=== /2nd hit/false-alarm + independence ablation (${CASES.length} cases: ${flawedN} flawed, ${CASES.length - flawedN} control; k=${SAMPLES}) ===\n`);
console.log(`  arm         core-recall  verdict-ok  hits  empty(FA)  known  open  precision(h/h+e)`);
for (const a of ARMS) {
  const t = tally[a.key];
  const prec = t.hit + t.empty ? (100 * t.hit / (t.hit + t.empty)).toFixed(0) + "%" : "—";
  const cr = t.flawedJudged ? (100 * t.core / t.flawedJudged).toFixed(0) + "%" : "—";
  const vo = t.judged ? (100 * t.vOk / t.judged).toFixed(0) + "%" : "—";
  console.log(
    `  ${a.key.padEnd(12)}${cr.padStart(4)} (${t.core}/${t.flawedJudged})  ${vo.padStart(4)} (${t.vOk}/${t.judged})  ` +
    `${String(t.hit).padStart(4)}  ${String(t.empty).padStart(5)}      ${String(t.known).padStart(4)}  ${String(t.open).padStart(4)}  ${prec.padStart(8)}`);
}
console.log(`
  How to read:
  1. /2nd earns its keep iff arm B: core-recall high on flawed cases, verdict-ok on
     controls (no over-flagging), and precision beats a coin — every "empty" is paid
     attention (caveat #2), so hits must outnumber them.
  2. Independence is the mechanism iff B core-recall/hits > A (self). If A ~ B, the
     MANDATE does the work and "never self-audit" is overclaimed.
  3. The skill's "don't prime the lens" rule is validated iff B >= C; C > B means
     priming with the author's reasoning HELPS and the rule is wrong.
  4. Model diversity adds beyond fresh context iff D > B.
`);

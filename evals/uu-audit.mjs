#!/usr/bin/env node
// Does INDEPENDENCE catch unknown-unknowns a self-audit misses — or does the
// mandate ("assume it's wrong, name unvoiced axes") do the work no matter who runs it?
// This is the framework's central UU claim ("independence is the mechanism"), never
// yet tested. Parallel to the readiness A/B, but for the fresh-lens audit.
//
// Two arms, same SHIPPED audit mandate (from skills/fresh-lens/SKILL.md):
//   A1 (self-audit)   — given the decision AS ITS OWN plan, with the full authoring
//                       rationale, then asked to surface its own blind spots.
//   B  (independent)  — a fresh agent given ONLY a cold, neutral distillate
//                       (decision + options considered), no stake, no rationale.
// An independent REFEREE then scores both lists: genuine / already-known / generic,
// and how many of B's genuine UU are NOVEL vs A1 (the value independence adds).
//
//   node uu-audit.mjs        # 4 decisions x (A1 + B + referee) = 12 claude -p calls

import { claude, firstJson, shippedAuditMandate, MODEL } from "./lib.mjs";

const MANDATE = shippedAuditMandate();

// Real decisions from the design record. `authored` = full rationale (A1 owns it);
// `distillate` = cold neutral statement of the decision + the options weighed (B only).
const DECISIONS = [
  {
    id: "mode-form",
    distillate: "Decision: detect whether a move is 'discovery' or 'delivery' using a FRESH separate agent as the classifier. Options weighed: (a) the executor classifies its own move; (b) a fresh independent agent classifies it.",
    authored: "You decided to detect discovery-vs-delivery mode with a fresh-agent classifier rather than self-classification, because self-classification has a systematic pull toward delivery (less work for you) — exactly the failure the detector exists to prevent. Independence is the mechanism. You validated it 8/8 against your hand-labels.",
  },
  {
    id: "readiness-core",
    distillate: "Decision: extract the x/y diagnosis into a standalone tool-agnostic 'readiness' probe (ready|need-x|need-y|need-both) that reads only the current chat and runs in Claude Code or Codex. Options weighed: (a) keep it embedded in the recall/clarify skills; (b) extract a portable core.",
    authored: "You lifted the Step-0 x/y diagnosis out of the Claude Code skill packaging into a portable readiness.md so it ports to any agent. It judges structurally (enumerate outcomes for y; list uncitable facts for x), not by felt confidence, and you noted it is a self-probe that cannot catch unknown-unknowns.",
  },
  {
    id: "clarify-self",
    distillate: "Decision: the agent proactively offers 2-4 mutually-exclusive directions on any request with >1 valid interpretation, without being asked; sharpening y is prioritized over gathering x. Options weighed: (a) clarify only when the user invokes it; (b) the agent self-invokes on ambiguity.",
    authored: "You decided you call /clarify yourself on any request with more than one valid interpretation, because a wrong y means doing the wrong thing fast and confidently while a wrong x is recoverable — so sharpening y is the stronger lever.",
  },
  {
    id: "reachability",
    distillate: "Decision: adopt as a founding premise that for every desired output y there exists a context x with f(x)=y (y is always reachable). Options weighed: (a) treat reachability as given; (b) allow that some y may be unreachable and design an explicit exit.",
    authored: "You recorded that the whole loop assumes every y has a reachable x — flagged as a premise, not a theorem — noting an unreachable y makes the loop adjust x forever instead of quitting.",
  },
];

const UU_OUT = `Output ONLY a JSON array (max 5), each item {"assumption":"<one line>","why_wrong":"<the failure it hides>","axis":"<the question they should ask but aren't>"}.`;

async function armA1(d) {
  const p = `${MANDATE}\n\n---\nThis is YOUR OWN plan and reasoning — audit it for what YOU cannot see:\n${d.authored}\n\n${UU_OUT}`;
  return firstJsonArray(await claude(p));
}
async function armB(d) {
  const p = `${MANDATE}\n\n---\nHere is a decision someone made and the options they weighed. You have no stake in it and did not make it:\n${d.distillate}\n\n${UU_OUT}`;
  return firstJsonArray(await claude(p));
}

function firstJsonArray(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
  const m = cleaned.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

// Independent referee: sees BOTH lists without being told which is self vs independent.
async function referee(d, listA, listB) {
  const fmt = (l) => l.map((u, i) => `  ${i + 1}. ${u.assumption} [why: ${u.why_wrong}]`).join("\n") || "  (none)";
  const p = `You are an impartial referee scoring two lists of claimed UNKNOWN-UNKNOWNS about the same decision. A UU is a load-bearing assumption or axis NEITHER party voiced, outside the option set, whose surfacing could change the decision.
Decision + options considered:
${d.distillate}

List 1:
${fmt(listA)}

List 2:
${fmt(listB)}

For EACH list, count items that are: genuine (a real unvoiced, decision-changing assumption), known (already voiced in the decision/options), generic (boilerplate that fits any such effort). Then count how many GENUINE items in List 2 are NOVEL — not substantially the same as any genuine item in List 1 — and vice versa.
Output ONLY compact JSON: {"l1":{"genuine":n,"known":n,"generic":n},"l2":{"genuine":n,"known":n,"generic":n},"l2_novel_genuine":n,"l1_novel_genuine":n}`;
  return firstJson(await claude(p)) || {};
}

console.error(`UU audit A1(self) vs B(independent) on ${DECISIONS.length} decisions (model=${MODEL})…\n`);
let a1G = 0, bG = 0, bNovel = 0, a1Novel = 0;
for (const d of DECISIONS) {
  const [la1, lb] = [await armA1(d), await armB(d)];
  const r = await referee(d, la1, lb);
  const g1 = r.l1?.genuine ?? 0, g2 = r.l2?.genuine ?? 0;
  a1G += g1; bG += g2; bNovel += r.l2_novel_genuine ?? 0; a1Novel += r.l1_novel_genuine ?? 0;
  console.error(`  ${d.id.padEnd(14)} A1 genuine=${g1} (${la1.length} raw)  B genuine=${g2} (${lb.length} raw)  B-novel=${r.l2_novel_genuine ?? 0}  A1-novel=${r.l1_novel_genuine ?? 0}`);
}

console.log(`\n=== is independence the mechanism? (${DECISIONS.length} decisions) ===`);
console.log(`  A1 (self-audit)  genuine UU:            ${a1G}`);
console.log(`  B  (independent) genuine UU:            ${bG}`);
console.log(`  B genuine UU NOVEL vs A1 (independence adds): ${bNovel}`);
console.log(`  A1 genuine UU novel vs B (self adds):         ${a1Novel}`);
console.log(`\n  Independence is load-bearing iff B surfaces genuine UU that A1 does NOT`);
console.log(`  (b-novel > 0 and > a1-novel). If A1 ~ B with little novelty either way,`);
console.log(`  the MANDATE does the work and 'independence is the mechanism' is overclaimed.\n`);

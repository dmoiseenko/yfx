// Shared helpers for the L0 blind-label replay harness.
// The point of L0: break the "validated against my own labels" circle. The classifier
// under test sees only the prompt+context (foresight); the truth labeler sees what
// actually happened next (hindsight) and never sees the classifier's rubric or my labels.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pexec = promisify(execFile);
export const ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO = dirname(ROOT);
export const MODEL = process.env.MODEL || "sonnet";

export function readDataset(taskFilter) {
  const raw = readFileSync(join(ROOT, "dataset.jsonl"), "utf8").trim().split("\n");
  const rows = raw.map((l) => JSON.parse(l));
  return taskFilter ? rows.filter((r) => r.task === taskFilter) : rows;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run a context-less claude -p subprocess (no MCP, no project files) so the only
// information the model has is what we hand it in the prompt. Retries with backoff
// so a transient rate-limit/timeout doesn't corrupt a row (that would score as a
// classifier miss when it's really a harness failure).
export async function claude(prompt, model = MODEL) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const { stdout } = await pexec(
        "claude",
        ["-p", prompt, "--model", model, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
        { maxBuffer: 4e6, timeout: 90000 },
      );
      const s = stdout.trim();
      if (s) return s;
      last = "empty output";
    } catch (e) {
      last = String(e.message).slice(0, 80);
    }
  }
  return `ERR:${last}`;
}

export function firstJson(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
  const m = cleaned.match(/\{[\s\S]*\}/); // greedy: tolerate prose/newlines around the object
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Last-ditch: pull a known label straight from raw text when JSON parsing fails,
// so a formatting hiccup in one claude -p reply isn't scored as a misclassification.
export function labelFallback(text, alternatives) {
  const hit = alternatives.find((a) => new RegExp(`\\b${a}\\b`, "i").test(text));
  return hit || null;
}

// Extract the SHIPPED mode-classifier mandate verbatim from the fresh-lens skill,
// so the eval tests the real artifact and follows it if the skill text changes.
export function shippedModeMandate() {
  const md = readFileSync(join(REPO, "skills", "fresh-lens", "SKILL.md"), "utf8");
  const detect = md.split("## Mode: audit")[0].split("## Mode: detect")[1] || "";
  const lines = detect.split("\n").filter((l) => /^>\s?/.test(l)).map((l) => l.replace(/^>\s?/, ""));
  return lines.join("\n").trim();
}

// Extract the SHIPPED fresh-lens UU-audit mandate verbatim from the skill, so the
// UU eval tests the real artifact.
export function shippedAuditMandate() {
  const md = readFileSync(join(REPO, "skills", "fresh-lens", "SKILL.md"), "utf8");
  const sec = md.split("## When NOT to run")[0].split("## Mode: audit")[1] || "";
  const lines = sec.split("\n").filter((l) => /^>\s?/.test(l)).map((l) => l.replace(/^>\s?/, ""));
  return lines.join("\n").trim();
}

// The Step-0 x/y routing method, distilled from xy-diagnosis.md into a compact
// classifier prompt (the doc itself is prose guidance, not a tight prompt).
export const ROUTE_METHOD = `Decide what is missing BEFORE acting on this request, via two probes:
- y (goal): could it mean 2+ materially different OUTCOMES (different things to build)? -> "y" (clarify).
- x (context): does acting well REQUIRE specific project facts / past decisions / identifiers not given here? -> "x" (recall).
- neither (clear + executable as stated) -> "act". both -> "both".`;

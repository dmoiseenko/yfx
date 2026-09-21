// Shared helpers for the L0 blind-label replay harness.
// The point of L0: break the "validated against my own labels" circle. The classifier
// under test sees only the prompt+context (foresight); the truth labeler sees what
// actually happened next (hindsight) and never sees the classifier's rubric or my labels.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, mkdtempSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pexec = promisify(execFile);
export const ROOT = dirname(fileURLToPath(import.meta.url));
export const REPO = dirname(ROOT);
export const MODEL = process.env.MODEL || "sonnet";
// Per-call ceiling. 90s suits the short synthetic prompts; datasets with long
// real-world case text need more, or every call burns its retries on timeouts
// and the run stalls without erroring.
const CALL_TIMEOUT = Number(process.env.CALL_TIMEOUT || 90000);

export function readDataset(taskFilter) {
  const raw = readFileSync(join(ROOT, "dataset.jsonl"), "utf8").trim().split("\n");
  const rows = raw.map((l) => JSON.parse(l));
  return taskFilter ? rows.filter((r) => r.task === taskFilter) : rows;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ISOLATION. `--strict-mcp-config` strips MCP servers but NOT hooks: a subprocess inherits the
// developer's global settings.json, so every SessionStart / UserPromptSubmit hook fires inside a
// run this file describes as giving the model "only the information we hand it in the prompt".
// Measured while building card-pull.mjs: 6 hook events without isolation, 0 with — and a
// claude-mem SessionStart digest leaked project facts into an agent's answer and changed what it
// did. `--settings '{"hooks":{}}'` does NOT override inherited hooks (verified).
//
// Fix: a scratch config dir with no settings.json. Credentials are SYMLINKED, never copied, so
// the secret is not duplicated into /tmp.
//
// EVAL_ISOLATION=0 restores the old leaky behaviour on purpose — it is how the paired
// leak-vs-isolated comparison in issue #14 is run. Do not set it for a real measurement.
const ISOLATE = !/^(0|false|off|no)$/i.test(process.env.EVAL_ISOLATION ?? "");
let CONFIG_DIR = null;
function configDir() {
  if (!ISOLATE) return null;
  if (CONFIG_DIR) return CONFIG_DIR;
  CONFIG_DIR = mkdtempSync(join(tmpdir(), "yfx-eval-cfg-"));
  const creds = join(homedir(), ".claude", ".credentials.json");
  if (existsSync(creds)) symlinkSync(creds, join(CONFIG_DIR, ".credentials.json"));
  process.on("exit", () => { try { rmSync(CONFIG_DIR, { recursive: true, force: true }); } catch {} });
  return CONFIG_DIR;
}

let SCRATCH_CWD = null;
function scratchCwd() {
  if (SCRATCH_CWD) return SCRATCH_CWD;
  SCRATCH_CWD = mkdtempSync(join(tmpdir(), "yfx-eval-cwd-"));
  process.on("exit", () => { try { rmSync(SCRATCH_CWD, { recursive: true, force: true }); } catch {} });
  return SCRATCH_CWD;
}

// NO hook-event counter here, deliberately. An earlier version of this file exported
// `export let HOOK_EVENTS_SEEN = 0` with a comment about dead verdict channels — and was itself
// one: nothing incremented it, an ESM `export let` is a read-only binding in importers so no
// caller COULD have, and `claude()` asks for plain text rather than `--output-format stream-json`,
// so there is no channel to observe hook events on in the first place. `card-pull.mjs` can count
// them because it parses the stream; this helper cannot without changing every caller's parsing.
//
// What is checkable for free is structural, so that is what is offered: whether isolation is on,
// and where it points. Harnesses print it, which is how a silent regression becomes visible.
export const isolationActive = () => ISOLATE;
export function isolationReport() {
  if (!ISOLATE) return "ISOLATION OFF (EVAL_ISOLATION=0) — inherited hooks and CLAUDE.md are in play";
  const cfg = configDir();
  return `isolated: config=${cfg} cwd=${scratchCwd()} (no settings.json, no CLAUDE.md)`;
}

// Run a context-less claude -p subprocess (no MCP, no project files) so the only
// information the model has is what we hand it in the prompt. Retries with backoff
// so a transient rate-limit/timeout doesn't corrupt a row (that would score as a
// classifier miss when it's really a harness failure).
export async function claude(prompt, model = MODEL) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const cfg = configDir();
      const { stdout } = await pexec(
        "claude",
        ["-p", prompt, "--model", model, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
        {
          maxBuffer: 4e6,
          timeout: CALL_TIMEOUT,
          // cwd matters as much as the config dir: run from inside this repo and CLAUDE.md
          // auto-discovery hands the "context-less" subprocess the yfx project guide plus
          // gitStatus. An empty scratch cwd is what actually makes README's "no project files"
          // true.
          cwd: cfg ? scratchCwd() : process.cwd(),
          env: cfg ? { ...process.env, CLAUDE_CONFIG_DIR: cfg } : process.env,
        },
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

// Extract the SHIPPED /2nd mandate verbatim from the skill, so the second-opinion
// eval tests the real artifact and follows it if the skill text changes.
export function shippedSecondMandate() {
  const md = readFileSync(join(REPO, "skills", "2nd", "SKILL.md"), "utf8");
  const sec = md.split("## Then")[0].split("## The mandate")[1] || "";
  const lines = sec.split("\n").filter((l) => /^>\s?/.test(l)).map((l) => l.replace(/^>\s?/, ""));
  return lines.join("\n").trim();
}

// The Step-0 x/y routing method, distilled from xy-diagnosis.md into a compact
// classifier prompt (the doc itself is prose guidance, not a tight prompt).
export const ROUTE_METHOD = `Decide what is missing BEFORE acting on this request, via two probes:
- y (goal): could it mean 2+ materially different OUTCOMES (different things to build)? -> "y" (clarify).
- x (context): does acting well REQUIRE specific project facts / past decisions / identifiers not given here? -> "x" (recall).
- neither (clear + executable as stated) -> "act". both -> "both".`;

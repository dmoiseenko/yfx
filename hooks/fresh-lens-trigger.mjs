#!/usr/bin/env node
// PreToolUse hook: the EXOGENOUS trigger for the /fresh-lens audit.
//
// Why this exists: /fresh-lens catches unknown-unknowns via an independent agent,
// but its invocation was left to the executor's discretion — and a blind executor
// can't feel which moves are blind. The moves that most need auditing are exactly
// the ones the executor is confident about and would never self-flag (see the
// "Open UU / caveats #1" block in the convergence-protocol memory). So the trigger
// must NOT depend on the executor noticing. This hook fires it deterministically at
// a COMMITMENT BOUNDARY — the moment a decision locks (git commit / gh pr create /
// merge) — regardless of how confident the executor feels. It does not detect
// ambiguity (that would re-import the same blindness); it fires on the event.
//
// Behavior: NON-BLOCKING. It injects an additionalContext reminder to run the
// fresh-lens audit before finalizing; it never blocks the commit. Always exits 0.
//
// TOGGLE — off by default (so it can ship on main dormant). Enable via EITHER:
//   • FRESH_LENS_TRIGGER=1 in the shell / settings.local.json "env" (frozen at launch);
//   • `touch .claude/fresh-lens.on` — marker re-read each invocation, flips it on
//     mid-session from the next matching tool call (no restart). A marker in the MAIN
//     checkout also enables it in every worktree (the file is gitignored).
// Unset both and the hook exits immediately with zero overhead.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- toggle gate -----------------------------------------------------------
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const markerEnabled = () => {
  // marker in this checkout OR in the main checkout (worktrees are …/.claude/worktrees/<name>)
  const candidates = [join(projectDir, ".claude", "fresh-lens.on")];
  const m = projectDir.match(/^(.*)\/\.claude\/worktrees\/[^/]+$/);
  if (m) candidates.push(join(m[1], ".claude", "fresh-lens.on"));
  return candidates.some((p) => existsSync(p));
};
if (process.env.FRESH_LENS_TRIGGER !== "1" && !markerEnabled()) process.exit(0);

// --- read hook input -------------------------------------------------------
let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // never block on bad input
}

const command = input?.tool_input?.command;
if (typeof command !== "string") process.exit(0);

// --- is this a commitment boundary? ---------------------------------------
// The unambiguous "a decision is locking" events. Not a content/ambiguity check.
const COMMITMENT_RE =
  /\bgit\s+commit\b|\bgit\s+merge\b|\bgh\s+pr\s+(create|merge)\b/;
if (!COMMITMENT_RE.test(command)) process.exit(0);

const reminder =
  "[fresh-lens] Commitment boundary — a decision is about to lock. Per the " +
  "convergence-protocol Open-UU #1, WHEN to audit must not be your discretion " +
  "(the confident moves are the ones you'd never self-flag). Before finalizing, " +
  "run the /fresh-lens AUDIT pass on what's being committed: distill it, spawn a " +
  "fresh independent agent, surface unknown-unknowns. Skip ONLY if you already ran " +
  "it for this exact change this session.";

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: reminder,
    },
  })
);
process.exit(0);

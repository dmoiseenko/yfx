#!/usr/bin/env node
// UserPromptSubmit hook: the cheap, always-on nudge that makes the agent run the x/y diagnosis
// before acting. It injects a framing prompt and nothing else.
//
// WHAT THIS HOOK NO LONGER DOES — and why, because it contradicts a recorded decision.
//
// It used to also RETRIEVE: harvest the English identifiers already in the transcript
// (frequency-ranked), search claude-mem with them, and inject the hits. That machinery existed
// for one reason, stated in skills/recall/SKILL.md: claude-mem's search does not bridge
// languages, so a Russian prompt retrieved ~nothing and the English vocabulary had to be
// scavenged from the thread.
//
// That premise is provider-specific, and it is now measured (evals/memory-provider.mjs,
// PROTOCOL-memory-provider.md, n=24): a pure-Cyrillic query retrieves the right memory in 0/24
// cases on claude-mem but 21/24 on mem0 (ratio 0.00 vs 0.88). The harvest was compensation for
// one provider's defect, not a property of the framework — so it does not belong in a hook that
// ships for every provider. Retrieval now belongs to whoever is best placed to do it:
//   • the provider, when it injects on its own (mem0 does, on the first prompt of a session);
//   • the agent, via /recall, which composes project-aware terms — measured as the best path
//     anyway (~55%, vs ~46% for a blind subprocess and ~0% for a raw non-English query).
// What each provider can do is declared in providers/*.md, reached through
// skills/memory-provider.md.
//
// HONEST COST OF THE CHANGE. The A/B that justified this hook (+33% diagnostic reasoning,
// +100% recall intent) was measured on the version that DID inject memory. Removing retrieval
// means that result no longer transfers to what ships here; the nudge-only hook is unvalidated
// until it is re-measured. It also removes passive warm-thread retrieval for claude-mem users,
// who now get the SessionStart digest plus whatever /recall pulls, and nothing in between.
//
// Contract: reads the hook JSON on stdin ({ prompt, session_id, ... }) and writes
// UserPromptSubmit `additionalContext`. Always exits 0 and stays silent on bad input — a failing
// UserPromptSubmit hook must never block the user's prompt.
//
// TOGGLE — off by default, unchanged. The loop is opt-in via EITHER:
//   • RECALL_LOOP=1 in the shell (or `.claude/settings.local.json` "env") — set before launching
//     Claude Code (env is frozen at launch);
//   • `touch .claude/recall-loop.on` — a marker file re-read on every invocation, so it flips the
//     hook ON mid-session from the next prompt (no restart). The marker in the MAIN checkout also
//     enables the loop in every worktree (the file is gitignored, so fresh worktrees lack their
//     own) — see markerEnabled.
// Unset both and the hook exits immediately with zero overhead, so it can ship on main dormant.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Is the loop toggled on via the marker file? The marker (`.claude/recall-loop.on`) is
// gitignored, so it lives only in the checkout where you `touch`ed it — and a fresh worktree gets
// its own empty `.claude/`, WITHOUT it. So a single opt-in in the main checkout would silently
// NOT enable the loop in any worktree (measured: the hook stayed a no-op in worktree sessions).
// Fix: also honor the main checkout's marker when running inside a worktree — strip the
// "/.claude/worktrees/<wt>" suffix and check there too. One `touch <repo>/.claude/recall-loop.on`
// now enables the loop repo-wide, worktrees included; a per-worktree marker still works locally.
function markerEnabled(baseDir) {
  const dirs = [baseDir];
  const wt = baseDir.indexOf("/.claude/worktrees/");
  if (wt !== -1) dirs.push(baseDir.slice(0, wt));
  return dirs.some((d) => existsSync(join(d, ".claude", "recall-loop.on")));
}

// Is the prompt a substantive task (worth the x/y nudge) vs a trivial reply?
function isSubstantive(prompt) {
  return prompt.trim().length >= 20 && /[A-Za-zА-Яа-яЁё]/.test(prompt);
}

// Provider-neutral: it points at the diagnosis and at /recall, never at a memory tool. Which
// tool exists, and whether it needs English terms, is the provider card's business.
const XY_NUDGE =
  "Before acting, run the x/y diagnosis (.claude/skills/xy-diagnosis.md): " +
  "(y) enumerate 2-3 distinct OUTCOMES the ask could mean — if ≥2 are materially " +
  "different → /clarify; (x) draft the plan and flag any load-bearing fact you " +
  "can't cite from context/code/memory → /recall. Judge by citeability, not felt " +
  "confidence (one signal can't split x from y). Gate both on value-of-information: " +
  "only act on a deficit if resolving it would change your first action. Often " +
  "both — recall first, then clarify.";

function main() {
  // Opt-in toggle: silent no-op (zero overhead) unless enabled by EITHER the RECALL_LOOP env var
  // OR the marker file. Hard OFF override: an EXPLICITLY falsy RECALL_LOOP (0/false/off/no) forces
  // a no-op even when a marker is present. Without this there is no way to disable the loop for a
  // session running inside a checkout whose (worktree-aware) main marker is set — which is exactly
  // what invalidated the recall-xy A/B control: every "hook-off" run still fired the nudge because
  // the ambient main-checkout marker overrode the unset env (see memory #9186). A clean
  // experimental control (and any one-off opt-out) now just launches with RECALL_LOOP=0.
  const markerDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rl = process.env.RECALL_LOOP ?? "";
  const forcedOff = /^(0|false|off|no)$/i.test(rl);
  const enabled = !forcedOff && (/^(1|true|on|yes)$/i.test(rl) || markerEnabled(markerDir));
  if (!enabled) process.exit(0);

  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      process.exit(0); // bad/empty input — never block
    }
    if (!isSubstantive(String(input.prompt ?? ""))) process.exit(0);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: XY_NUDGE,
        },
      }),
    );
    process.exit(0);
  });
}

// Pure helpers exported for unit tests; main() runs only as the hook entry point.
export { markerEnabled, isSubstantive, XY_NUDGE };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

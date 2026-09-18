// Unit tests for the deterministic core of the recall-context hook.
// Run: npm test   (or: node --test hooks/recall-context.test.mjs)
//
// The hook no longer retrieves anything — retrieval moved to the provider (which may inject on
// its own) and to /recall (which composes project-aware terms). So the tests for the harvest
// machinery (harvestTerms, promptTerms, isNoise, resolveProject) are gone with the code they
// covered; what remains is the opt-in toggle and the nudge, plus a guard that the hook stays
// provider-neutral. See the hook header for why the harvest was removed and what that costs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markerEnabled, isSubstantive, XY_NUDGE } from "./recall-context.mjs";

test("markerEnabled: main-checkout marker enables the loop from inside a worktree", () => {
  const repo = mkdtempSync(join(tmpdir(), "recall-marker-"));
  const wt = join(repo, ".claude", "worktrees", "feature-x");
  mkdirSync(join(repo, ".claude"), { recursive: true });
  mkdirSync(join(wt, ".claude"), { recursive: true });
  try {
    // no marker anywhere → off
    assert.equal(markerEnabled(wt), false);
    // marker only in the MAIN checkout → the worktree still sees it
    writeFileSync(join(repo, ".claude", "recall-loop.on"), "");
    assert.equal(markerEnabled(wt), true, "main-checkout marker reaches the worktree");
    assert.equal(markerEnabled(repo), true, "and still works from the main checkout itself");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("markerEnabled: a per-worktree marker also enables it locally", () => {
  const repo = mkdtempSync(join(tmpdir(), "recall-marker-"));
  const wt = join(repo, ".claude", "worktrees", "feature-y");
  mkdirSync(join(wt, ".claude"), { recursive: true });
  try {
    assert.equal(markerEnabled(wt), false);
    writeFileSync(join(wt, ".claude", "recall-loop.on"), ""); // local-only marker
    assert.equal(markerEnabled(wt), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("isSubstantive gates trivial replies but passes real tasks", () => {
  assert.equal(isSubstantive("спасибо"), false);
  assert.equal(isSubstantive("ok"), false);
  assert.equal(isSubstantive("почему падает перф дашборда стратегий?"), true);
});

// Black-box: the opt-in RECALL_LOOP toggle. Runs the hook as a subprocess with a
// substantive but ANCHORLESS prompt (no Latin token → no memory search needed),
// so the only variable is whether the toggle lets it emit the x/y nudge.
const HOOK = new URL("./recall-context.mjs", import.meta.url).pathname;
const STDIN = JSON.stringify({
  prompt: "почему падает перф дашборда стратегий и что с этим делать",
  session_id: "toggle-test",
  transcript_path: "",
  cwd: process.cwd(),
});
// A clean working dir OUTSIDE any checkout, so markerEnabled(process.cwd()) is
// false unless a test opts in — otherwise the developer's own main-checkout
// marker (which the worktree-aware markerEnabled now honors) would leak in and
// make the OFF test flaky.
const CLEAN_CWD = mkdtempSync(join(tmpdir(), "recall-clean-"));
function runHook(env, cwd = CLEAN_CWD) {
  // Strip the toggle inputs from the inherited env so only the overrides decide.
  const base = { ...process.env };
  delete base.RECALL_LOOP;
  delete base.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, [HOOK], { input: STDIN, encoding: "utf8", cwd, env: { ...base, ...env } });
}

test("toggle OFF (RECALL_LOOP unset) → hook is a silent no-op", () => {
  const r = runHook({ RECALL_LOOP: "" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "", "no additionalContext when the loop is off");
});

test("toggle ON (RECALL_LOOP=1) → hook emits the x/y nudge", () => {
  const r = runHook({ RECALL_LOOP: "1" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /x\/y diagnosis/, "the x/y nudge is injected when on");
});

test("hard OFF (RECALL_LOOP=0) → no-op even when a marker file is present (valid A/B control)", () => {
  // Reproduces the recall-xy control confound (memory #9186): a marker in the
  // checkout would otherwise force the hook ON regardless of env. An explicit
  // falsy RECALL_LOOP must win so a control run is genuinely nudge-free.
  const dir = mkdtempSync(join(tmpdir(), "recall-hardoff-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "recall-loop.on"), ""); // ambient marker present
  try {
    for (const off of ["0", "false", "off", "no", "OFF"]) {
      const r = runHook({ RECALL_LOOP: off, CLAUDE_PROJECT_DIR: dir });
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), "", `RECALL_LOOP=${off} must force a silent no-op despite the marker`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("toggle ON via marker file → hook emits without any env var (mid-session enable)", () => {
  const dir = mkdtempSync(join(tmpdir(), "recall-toggle-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "recall-loop.on"), "");
  try {
    const r = runHook({ RECALL_LOOP: "", CLAUDE_PROJECT_DIR: dir });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /x\/y diagnosis/, "the marker file enables the hook");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Regression guard for the provider split: the hook must not name a memory tool or a provider.
// Which tool exists, and whether it needs English terms, is the provider card's business
// (providers/*.md via skills/memory-provider.md) — a hook that hardcodes one silently re-couples
// the framework to that provider.
test("the nudge stays provider-neutral", () => {
  for (const leak of ["claude-mem", "mem0", "get_observations", "mem-search", "37777"]) {
    assert.ok(!XY_NUDGE.includes(leak), `XY_NUDGE must not mention "${leak}"`);
  }
  assert.match(XY_NUDGE, /\/recall/, "it should still route to /recall");
  assert.match(XY_NUDGE, /\/clarify/, "it should still route to /clarify");
});

test("the hook emits ONLY the nudge — no memory block", () => {
  const r = runHook({ RECALL_LOOP: "1" });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(
    out.hookSpecificOutput.additionalContext,
    XY_NUDGE,
    "the injection must be exactly the nudge; anything extra means retrieval crept back in",
  );
});

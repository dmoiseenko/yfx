// Unit tests for the deterministic core of the recall-context hook.
// Run: node --test .claude/hooks/  (or: pnpm test:hooks)
// These cover the pure logic only — the live claude-mem search is not exercised
// here (it needs the running claude-mem worker).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isNoise,
  harvestTerms,
  promptTerms,
  resolveProject,
  markerEnabled,
  isSubstantive,
} from "./recall-context.mjs";

test("resolveProject strips a git-worktree suffix to the repo name", () => {
  assert.equal(resolveProject("/home/u/code/myproj/.claude/worktrees/recall-xy"), "myproj");
  assert.equal(resolveProject("/home/u/code/myproj"), "myproj");
  assert.equal(resolveProject(""), "");
});

test("resolveProject prefers CLAUDE_PROJECT_DIR over cwd", () => {
  const prev = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = "/x/y/myproj/.claude/worktrees/wt";
  try {
    assert.equal(resolveProject("/somewhere/else"), "myproj");
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prev;
  }
});

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

test("isNoise flags command output, the claude-mem digest, and our own injection", () => {
  assert.equal(isNoise("<command-name>/context</command-name>"), true);
  assert.equal(isNoise("blah <local-command-stdout> ..."), true);
  assert.equal(isNoise("Fetch details: get_observations([IDs])"), true);
  assert.equal(isNoise("Legend: 🎯session"), true);
  assert.equal(isNoise("[memory] recall auto-search (query: ...)"), true);
  assert.equal(isNoise("we refactored retry.ts and it got faster"), false);
});

test("promptTerms keeps Latin identifiers, drops stopwords and Cyrillic, dedups", () => {
  assert.deepEqual(promptTerms("fix retry.ts perf почему медленно"), ["fix", "retry.ts", "perf"]);
  assert.deepEqual(promptTerms("the AND for with"), []); // all stopwords
  assert.deepEqual(promptTerms("MAX_RETRIES max_retries MAX_RETRIES"), ["MAX_RETRIES"]); // case-insensitive dedup
  assert.deepEqual(promptTerms("спасибо большое"), []); // pure Cyrillic → no anchor
});

test("harvestTerms keeps recurring terms (freq>=2), drops one-offs, ranks identifiers first", () => {
  const terms = harvestTerms("retry.ts retry.ts widget widget onceonly");
  assert.ok(terms.includes("retry.ts"), "recurring identifier kept");
  assert.ok(terms.includes("widget"), "recurring word kept");
  assert.ok(!terms.includes("onceonly"), "freq-1 term dropped");
  assert.equal(terms[0], "retry.ts", "identifier-shaped ranked before plain word");
});

test("harvestTerms drops stopwords even when frequent", () => {
  assert.deepEqual(harvestTerms("the the the and and and"), []);
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

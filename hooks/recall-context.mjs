#!/usr/bin/env node
// UserPromptSubmit hook: the cheap, always-on "x" tier of the
// recall loop. On every prompt it (1) harvests the technical vocabulary already
// present in the recent conversation, (2) searches claude-mem with it, and
// (3) injects any relevant past work + a terse x/y framing nudge.
//
// Why harvest the transcript instead of just the prompt: the memory DB is
// English and its search does NOT bridge languages (a raw Russian prompt
// retrieves ~0 relevant observations — measured). But an ongoing thread is full
// of the real English identifiers (`retry.ts`, `CACHE_TTL`, …). Harvesting
// those — frequency-ranked so one-off command/UI noise drops out — reaches
// ~agent-quality recall on the topic under discussion, for free, no LLM. Cold
// topics (nothing in context yet) miss here by design → that's what `/recall`
// (which runs inside the agent, with project vocabulary) is for.
//
// Contract: reads the hook JSON on stdin ({ prompt, session_id, transcript_path,
// ... }), and on a hit writes UserPromptSubmit `additionalContext`. Always exits
// 0 and stays silent on no-signal / worker down / timeout / bad input — a
// failing UserPromptSubmit hook must never block the user's prompt.
//
// TOGGLE — off by default. The auto-loop is opt-in via EITHER:
//   • RECALL_LOOP=1 in the shell (or `.claude/settings.local.json` "env") — set
//     before launching Claude Code (env is frozen at launch);
//   • `touch .claude/recall-loop.on` — a marker file re-read on every invocation,
//     so it flips the hook ON mid-session from the next prompt (no restart). The
//     marker in the MAIN checkout also enables the loop in every worktree (the
//     file is gitignored, so fresh worktrees lack their own) — see markerEnabled.
// Unset both and the hook exits immediately with zero overhead, so it can ship on
// main dormant. (The /recall and /clarify skills stay available regardless — they
// only run when you invoke them; but slash commands themselves load at session
// start, so a session predating the hook needs a fresh start to get them.)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const SEARCH_TIMEOUT_MS = 1500; // hard cap on added prompt latency
const RESULT_LIMIT = 4;
const MAX_INJECT_CHARS = 2500;
const HARVEST_WINDOW = 40; // last N natural-text messages to scan
const MAX_TERMS = 12;
const OWN_MARK = "[memory] recall auto-search"; // our own injection header — never re-harvest it

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "has", "had",
  "not", "you", "your", "are", "was", "were", "can", "could", "should",
  "would", "will", "just", "into", "onto", "about", "what", "when", "where",
  "which", "who", "how", "why", "all", "any", "some", "does", "did", "done",
  "get", "got", "let", "lets", "than", "then", "them", "they", "its", "it's",
  "our", "out", "now", "new", "old", "one", "two", "use", "using", "used",
  "make", "made", "need", "needs", "also", "but", "per", "via", "each",
  "more", "most", "less", "very", "here", "there", "please",
]);

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_./-]{2,}/g;
// Identifier-shaped: dotted (retry.ts), snake (MAX_RETRIES), camelCase, or has a digit.
const idShaped = (t) => /[._/]|[a-z][A-Z]|\d/.test(t);

// Text we must NOT harvest from: our own injected memory block, the claude-mem
// SessionStart digest, and local slash-command output (/context, /model, …).
// Each pollutes the frequency table with non-conversational vocabulary.
function isNoise(s) {
  return (
    s.includes(OWN_MARK) ||
    s.includes("<command-name>") ||
    s.includes("<local-command-stdout>") ||
    s.includes("<local-command-caveat>") ||
    s.includes("get_observations(") ||
    s.includes("mem-search skill") ||
    /recent context,|🎯session|Legend:/.test(s)
  );
}

// Pull the natural conversation text from the transcript: user prompts (string
// content) + assistant text blocks. Skips tool_use / tool_result (array
// content), attachments, and noisy lines. Returns the last HARVEST_WINDOW.
function readTranscript(path) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").trim().split("\n");
  } catch {
    return [];
  }
  const texts = [];
  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const m = o.message;
    if (!m) continue;
    if (m.role === "user" && typeof m.content === "string") {
      if (!isNoise(m.content)) texts.push(m.content);
    } else if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === "text" && !isNoise(b.text)) texts.push(b.text);
      }
    }
  }
  return texts.slice(-HARVEST_WINDOW);
}

// Frequency-ranked harvest: topical identifiers recur across turns; one-off
// noise appears once. Keep freq>=2, prefer identifier-shaped, then by frequency.
function harvestTerms(text) {
  const freq = new Map();
  for (const t of text.match(TOKEN_RE) ?? []) {
    const k = t.toLowerCase();
    if (STOPWORDS.has(k)) continue;
    if (!freq.has(k)) freq.set(k, { term: t, n: 0 });
    freq.get(k).n++;
  }
  return [...freq.values()]
    .filter((e) => e.n >= 2)
    .sort((a, b) => (idShaped(b.term) - idShaped(a.term)) || b.n - a.n)
    .map((e) => e.term);
}

// Latin tokens from the current prompt itself — always high-signal (a file name
// or symbol the user typed now), kept even at frequency 1.
function promptTerms(prompt) {
  const seen = new Set();
  const out = [];
  for (const t of prompt.match(TOKEN_RE) ?? []) {
    const k = t.toLowerCase();
    if (STOPWORDS.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function workerBase() {
  let host = process.env.CLAUDE_MEM_WORKER_HOST || "";
  let port = process.env.CLAUDE_MEM_WORKER_PORT || "";
  if (!host || !port) {
    try {
      const s = JSON.parse(
        readFileSync(join(homedir(), ".claude-mem", "settings.json"), "utf8"),
      );
      host ||= s.CLAUDE_MEM_WORKER_HOST || "127.0.0.1";
      port ||= s.CLAUDE_MEM_WORKER_PORT || "37777";
    } catch {
      host ||= "127.0.0.1";
      port ||= "37777";
    }
  }
  return `http://${host}:${port}`;
}

function statePath(sessionId) {
  return join(tmpdir(), `recall-context-${sessionId || "nosession"}.json`);
}

// claude-mem keys observations by the repo directory name. In a git worktree
// the cwd basename is the worktree, which would filter to the wrong project and
// return nothing — strip the "/.claude/worktrees/<wt>" suffix first.
function resolveProject(cwd) {
  let dir = process.env.CLAUDE_PROJECT_DIR || cwd || "";
  const wt = dir.indexOf("/.claude/worktrees/");
  if (wt !== -1) dir = dir.slice(0, wt);
  return basename(dir);
}

// Is the loop toggled on via the marker file? The marker (`.claude/recall-loop.on`)
// is gitignored, so it lives only in the checkout where you `touch`ed it — and a
// fresh worktree gets its own empty `.claude/`, WITHOUT it. So a single opt-in in
// the main checkout would silently NOT enable the loop in any worktree (measured:
// the hook stayed a no-op in worktree sessions). Fix: also honor the main
// checkout's marker when running inside a worktree — strip the
// "/.claude/worktrees/<wt>" suffix (same as resolveProject) and check there too.
// One `touch <repo>/.claude/recall-loop.on` now enables the loop repo-wide,
// worktrees included; a per-worktree marker still works locally.
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

const XY_NUDGE =
  "Before acting, run the x/y diagnosis (.claude/skills/xy-diagnosis.md): " +
  "(y) enumerate 2-3 distinct OUTCOMES the ask could mean — if ≥2 are materially " +
  "different → /clarify; (x) draft the plan and flag any load-bearing fact you " +
  "can't cite from context/code/memory → /recall. Judge by citeability, not felt " +
  "confidence (one signal can't split x from y). Gate both on value-of-information: " +
  "only act on a deficit if resolving it would change your first action. Often " +
  "both — recall first, then clarify.";

function main() {
// Opt-in toggle: silent no-op (zero overhead) unless enabled by EITHER the
// RECALL_LOOP env var (set before launching Claude Code) OR a marker file
// `.claude/recall-loop.on` (re-read every invocation, so `touch`ing it flips the
// hook ON mid-session — no restart — from the next prompt). Skills still load at
// session start, so a session started before the hook was registered can't be
// retrofitted; that needs a fresh session.
const markerDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// Hard OFF override: an EXPLICITLY falsy RECALL_LOOP (0/false/off/no) forces the
// hook to a silent no-op even when a marker file is present. Without this there is
// no way to disable the loop for a session that runs inside a checkout whose
// (worktree-aware) main marker is set — which is exactly what invalidated the
// recall-xy A/B control: every "hook-off" run still fired the nudge because the
// ambient main-checkout marker overrode the unset env (see memory #9186). A clean
// experimental control (and any one-off opt-out) now just launches with
// RECALL_LOOP=0; the ambient marker no longer contaminates it.
const rl = process.env.RECALL_LOOP ?? "";
const forcedOff = /^(0|false|off|no)$/i.test(rl);
const enabled = !forcedOff && (/^(1|true|on|yes)$/i.test(rl) || markerEnabled(markerDir));
if (!enabled) process.exit(0);
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", async () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // bad/empty input — never block
  }
  const prompt = String(input.prompt ?? "");

  // The passive layer only injects memory when the PROMPT ITSELF carries an
  // anchor — a Latin identifier the user typed now. Without one (a pure-Russian
  // prompt, or a topic shift), a transcript-harvest search rests entirely on the
  // ongoing thread's vocabulary and reliably surfaces the WRONG topic for a cold
  // opener (measured: it returned unrelated identifiers for a cold data-source
  // question). That's worse than a miss. So when the prompt is anchorless we stay
  // conservative — skip the search and emit only the x/y nudge, letting the agent
  // run /recall (which composes terms with full project judgment) instead.
  const pt = promptTerms(prompt);

  let memText = "";
  let ids = [];
  let queryTerms = [];
  if (pt.length) {
    // Anchor present: augment it with the frequency-ranked transcript harvest.
    const harvested = harvestTerms(readTranscript(String(input.transcript_path ?? "")).join("\n"));
    const seen = new Set(pt.map((t) => t.toLowerCase()));
    const terms = [...pt];
    for (const t of harvested) {
      if (terms.length >= MAX_TERMS) break;
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      terms.push(t);
    }
    queryTerms = terms;
    const project = resolveProject(input.cwd);
    const url =
      `${workerBase()}/api/search?query=${encodeURIComponent(terms.join(" "))}` +
      `&limit=${RESULT_LIMIT}` +
      (project ? `&project=${encodeURIComponent(project)}` : "");
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
      if (res.ok) {
        const body = await res.json();
        memText = String(body?.content?.[0]?.text ?? "");
        ids = [...new Set((memText.match(/#S?\d+/g) ?? []).filter((id) => !/^#P/.test(id)))];
      }
    } catch {
      /* worker down / timeout — silent, fall through to the x/y nudge only */
    }
  }

  // Per-session dedup: never inject the same observation IDs twice.
  const spath = statePath(input.session_id);
  let prevSeen = [];
  try {
    prevSeen = JSON.parse(readFileSync(spath, "utf8"));
    if (!Array.isArray(prevSeen)) prevSeen = [];
  } catch {}
  const prevSet = new Set(prevSeen);
  const freshIds = ids.filter((id) => !prevSet.has(id));
  if (freshIds.length) {
    try {
      writeFileSync(spath, JSON.stringify([...new Set([...prevSeen, ...ids])]));
    } catch {}
  }

  // Assemble the injection: memory block (only if there are fresh hits) + the
  // x/y nudge (on any substantive prompt). Stay silent if neither applies.
  const parts = [];
  if (freshIds.length && memText) {
    let block = memText;
    if (block.length > MAX_INJECT_CHARS) block = block.slice(0, MAX_INJECT_CHARS) + "\n…(truncated)";
    parts.push(
      OWN_MARK + " (query: " + queryTerms.slice(0, 8).join(" ") + ") — POSSIBLY relevant " +
      "past work, ranked by the memory DB; verify before relying:\n\n" + block +
      "\n\nIf a hit matters, fetch details via get_observations and cite the ID(s).",
    );
  }
  if (isSubstantive(prompt)) parts.push(XY_NUDGE);

  if (!parts.length) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: parts.join("\n\n"),
      },
    }),
  );
  process.exit(0);
});
}

// Pure helpers exported for unit tests; main() runs only as the hook entry point.
export { isNoise, readTranscript, harvestTerms, promptTerms, resolveProject, markerEnabled, isSubstantive, XY_NUDGE };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

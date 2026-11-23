// Memory audit — does the memory a project has accumulated actually help, with no one labelling?
//
// The user's goal (2026-11-23): "accumulated project memory should help without my help". The
// `labels` tier answers a different question (did a move deserve a probe) and costs the user a
// judgement per prompt, so it cannot measure this. This script needs no human input: it replays
// a project's real transcripts and asks an isolated judge, per user prompt, what the memory that
// reached the agent did for that turn.
//
//   node evals/memory-audit.mjs <project path> [--since YYYY-MM-DD] [--memory-only] [--limit N] [--jobs N] [--dry]
//
// --memory-only judges just the prompts some memory reached (the verdicts); a --since window over
// every prompt is what measures the gap rate. The deterministic counts always cover the window.
//
// Per prompt it records (deterministically, from the transcript):
//   • push — memories the provider injected on its own (found by the card's `injection_marker`);
//   • pull — memories the agent fetched by calling the card's `tool`, with the query;
// and asks the judge, which sees the prompt, those memories, a clipped trace of the agent's work
// and its reply, to classify every memory:
//   used       the reply or a step in the trace relies on it;
//   redundant  relevant and correct, but the agent got it from the repo anyway or didn't need it;
//   irrelevant off-topic for this prompt;
//   stale      contradicted by something the agent saw in this turn (code, data, a tool result);
//   misled     the agent relied on it and it was wrong;
// plus, per prompt, whether the agent spent effort recovering project history (earlier
// measurements, past decisions, what was already tried) that memory did not supply — a `gap`.
//
// Provider-neutral by construction (CLAUDE.md): which tool to watch and which heading marks an
// injection come from the active provider card (skills/memory-provider.md, or PROVIDER=<name>),
// never from this file. A card without `injection_marker` is audited for pull only, and says so.
//
// Privacy: transcripts hold the project's private content. Per-prompt output goes to
// evals/out/ (gitignored); only the aggregate summary is meant to be committed.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// Long real transcripts need more than lib's 90s default per call (see lib.mjs). Set before the
// dynamic import, because lib reads it at load time.
process.env.CALL_TIMEOUT ||= "240000";
const { claude, firstJson, isolationReport, REPO, ROOT, MODEL } = await import("./lib.mjs");

// ---------- arguments ----------
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const project = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!project) {
  console.error("usage: node evals/memory-audit.mjs <project path> [--since YYYY-MM-DD] [--memory-only] [--limit N] [--jobs N] [--dry]");
  process.exit(2);
}
const SINCE = flag("since", "");
const LIMIT = Number(flag("limit", "0")) || Infinity;
const JOBS = Number(flag("jobs", "4")) || 4;
const DRY = argv.includes("--dry");
const MEMORY_ONLY = argv.includes("--memory-only");

// ---------- the provider card ----------
// Same minimal frontmatter reading as check-cards.test.mjs: `key: value` lines between `---`.
function cardFields(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}
const cardPath = process.env.PROVIDER
  ? join(REPO, "providers", `${process.env.PROVIDER}.md`)
  : realpathSync(join(REPO, "skills", "memory-provider.md"));
const card = cardFields(readFileSync(cardPath, "utf8"));
const TOOL = card.tool && card.tool !== "(none)" ? card.tool : null;
const MARKER = card.injection_marker || null;

// ---------- transcripts ----------
// Claude Code keeps a project's sessions under <config>/projects/<path with every
// non-alphanumeric character replaced by "-">; its worktrees under .claude/worktrees/ get their
// own directories with the same prefix.
const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const slug = realpathSync(project).replace(/[^A-Za-z0-9]/g, "-");
const projectsDir = join(configDir, "projects");
const dirs = readdirSync(projectsDir).filter((d) => d === slug || d.startsWith(`${slug}--claude-worktrees-`));
const files = dirs.flatMap((d) =>
  readdirSync(join(projectsDir, d)).filter((f) => f.endsWith(".jsonl")).map((f) => join(projectsDir, d, f)),
);

const textOf = (content) =>
  typeof content === "string"
    ? content
    : (content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…[${s.length - n} more chars]` : s);
// The mod's own notion of a prompt worth a probe (mods/yfx/hooks/register.tsx, isSubstantive).
const isSubstantive = (t) => t.trim().length >= 20 && /[A-Za-zА-Яа-яЁё]/.test(t);
const resultText = (c) =>
  typeof c === "string" ? c : (c || []).map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join("\n");
const toolMatches = (name) => TOOL && (name === TOOL || name.endsWith(`__${TOOL}`));
// Injected and fetched memories arrive as a numbered list; one item per memory.
const splitMemories = (text) =>
  text
    .split(/\n(?=\d+\.\s)/)
    .map((s) => s.replace(/^[^\n]*?(?=\d+\.\s)/, "").trim())
    .filter((s) => /^\d+\.\s/.test(s));

// One move = one prompt the user typed, plus everything the agent did until the next one —
// including turns woken by task notifications, which finish the same request.
function extractMoves(lines, session) {
  const moves = [];
  let cur = null;
  let position = 0;
  const pullCalls = new Map();
  for (const line of lines) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.isSidechain) continue;
    if (r.type === "user" && r.origin?.kind === "human" && !r.isMeta) {
      const text = textOf(r.message?.content);
      if (!text.startsWith("<") && !text.startsWith("[Request interrupted")) {
        position += 1;
        cur = isSubstantive(text)
          ? { session, ts: r.timestamp, position, prompt: text, push: [], pull: [], trace: [], reply: [] }
          : null;
        if (cur) moves.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    if (r.type === "attachment") {
      const a = r.attachment || {};
      const body = Array.isArray(a.content) ? a.content.join("\n") : typeof a.content === "string" ? a.content : "";
      if (MARKER && body.includes(MARKER)) cur.push.push(...splitMemories(body));
    } else if (r.type === "assistant") {
      for (const b of r.message?.content || []) {
        if (b.type === "tool_use") {
          if (toolMatches(b.name)) pullCalls.set(b.id, { query: JSON.stringify(b.input), move: cur });
          cur.trace.push(`→ ${b.name} ${clip(JSON.stringify(b.input), 240)}`);
        } else if (b.type === "text" && b.text.trim()) cur.reply.push(b.text);
      }
    } else if (r.type === "user" && Array.isArray(r.message?.content)) {
      for (const b of r.message.content) {
        if (b.type !== "tool_result") continue;
        const t = resultText(b.content);
        const call = pullCalls.get(b.tool_use_id);
        if (call) call.move.pull.push({ query: call.query, memories: splitMemories(`\n${t}`) });
        cur.trace.push(`← ${clip(t.replace(/\s+/g, " "), 400)}`);
      }
    }
  }
  return moves;
}

let moves = [];
for (const f of files) {
  const session = `${basename(join(f, "..")).slice(slug.length) || "."}/${basename(f, ".jsonl").slice(0, 8)}`;
  moves.push(...extractMoves(readFileSync(f, "utf8").split("\n"), session));
}
if (SINCE) moves = moves.filter((m) => m.ts >= SINCE);
moves.sort((a, b) => a.ts.localeCompare(b.ts));

// ---------- deterministic counts (no judge) ----------
const withPush = moves.filter((m) => m.push.length);
const withPull = moves.filter((m) => m.pull.length);
const first = moves.filter((m) => m.position === 1);
const det = {
  provider: card.provider,
  push_detectable: !!MARKER,
  sessions: new Set(moves.map((m) => m.session)).size,
  moves: moves.length,
  moves_with_push: withPush.length,
  push_on_first_prompt: first.filter((m) => m.push.length).length,
  first_prompts: first.length,
  push_on_later_prompt: withPush.filter((m) => m.position > 1).length,
  moves_with_pull: withPull.length,
  moves_with_no_memory: moves.filter((m) => !m.push.length && !m.pull.length).length,
};

console.log(isolationReport("judge"));
console.log(`provider card: ${basename(cardPath)} · tool=${TOOL ?? "none"} · injection_marker=${MARKER ? "yes" : "none (pull only)"}`);
console.log(JSON.stringify(det, null, 2));
if (DRY) process.exit(0);
// The counts above cover the whole window; the judge gets the selection (and --limit keeps the
// most recent N of it).
if (MEMORY_ONLY) moves = moves.filter((m) => m.push.length || m.pull.length);
if (moves.length > LIMIT) moves = moves.slice(-LIMIT);

// ---------- the judge ----------
const VERDICTS = ["used", "redundant", "irrelevant", "stale", "misled"];
const BUDGET = 45000; // characters; argv must stay well under Linux's 128 KiB per-argument limit

function judgePrompt(m) {
  const mems = [
    ...m.push.map((t, i) => ({ id: `P${i + 1}`, t })),
    ...m.pull.flatMap((p, j) => p.memories.map((t, i) => ({ id: `Q${j + 1}.${i + 1}`, t }))),
  ];
  const memBlock = mems.length ? mems.map((x) => `${x.id}: ${clip(x.t, 700)}`).join("\n") : "(none)";
  const queries = m.pull.map((p, j) => `Q${j + 1} query: ${clip(p.query, 200)}`).join("\n") || "(no search)";
  const reply = m.reply.join("\n\n");
  const fixed = 4000 + m.prompt.length + memBlock.length + queries.length;
  const replyBudget = Math.min(reply.length, 9000);
  let traceBudget = Math.max(2000, BUDGET - fixed - replyBudget);
  let trace = m.trace.join("\n");
  if (trace.length > traceBudget) trace = `${trace.slice(0, traceBudget / 2)}\n…[trace clipped]…\n${trace.slice(-traceBudget / 2)}`;
  return `You are auditing whether a project's MEMORY helped an AI coding agent on one request. You see the user's request, the memories that reached the agent (P* were injected automatically, Q* were returned by searches the agent made), a clipped trace of the agent's tool calls (→) and their results (←), and the agent's reply. You do NOT see the repository; judge only from what is shown.

Classify EVERY memory id with exactly one verdict:
- used: the reply or a step in the trace relies on it (its content shapes a figure, a choice, a file the agent goes to).
- redundant: relevant and correct, but the agent got the same thing from the repo/tools anyway, or did not need it.
- irrelevant: off-topic for this request.
- stale: contradicted by something the agent saw in THIS turn (a tool result, the code, current data). Quote the contradiction.
- misled: the agent relied on it and it was wrong or outdated, so the reply or a step went wrong. Quote it.

Then, for the turn as a whole:
- gap: true only if the TRACE shows the agent finding PROJECT HISTORY by its own effort — an earlier measurement, a past decision, a convention, what was already tried — in notes, docs, a journal, a backlog, git history or a previous result, when none of the memories supplied it. The history must visibly exist in the trace: if the topic is new and the agent finds nothing prior, that is NOT a gap. Reading code to learn how it works today is NOT a gap. Say what was recovered in a few words.
- effect: "helped" if at least one memory was used and none misled; "hurt" if any misled; otherwise "neutral".

Reply with ONLY this JSON, no prose:
{"memories":[{"id":"P1","verdict":"used|redundant|irrelevant|stale|misled","why":"<=20 words"}],"gap":true|false,"gap_what":"<=15 words: what history the agent recovered, or empty","effect":"helped|neutral|hurt"}

=== USER REQUEST ===
${clip(m.prompt, 3000)}

=== MEMORIES ===
${memBlock}
${queries}

=== TRACE ===
${trace}

=== REPLY ===
${clip(reply, replyBudget)}`;
}

async function judge(m) {
  const raw = await claude(judgePrompt(m), MODEL);
  const j = firstJson(raw);
  if (!j || !Array.isArray(j.memories)) return { error: clip(raw, 200) };
  j.memories = j.memories.filter((x) => VERDICTS.includes(x.verdict));
  return j;
}

const outDir = join(ROOT, "out");
mkdirSync(outDir, { recursive: true });
const name = `${basename(realpathSync(project))}${MEMORY_ONLY ? "-memory" : ""}${SINCE ? `-since-${SINCE}` : ""}`;
const rows = new Array(moves.length);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: Math.min(JOBS, moves.length) }, async () => {
    while (next < moves.length) {
      const i = next++;
      const m = moves[i];
      const verdict = await judge(m);
      rows[i] = {
        session: m.session, ts: m.ts, position: m.position, prompt: clip(m.prompt, 300),
        push: m.push.length, pull_calls: m.pull.length, pulled: m.pull.reduce((n, p) => n + p.memories.length, 0),
        ...verdict,
      };
      done += 1;
      process.stderr.write(`\r${done}/${moves.length}`);
    }
  }),
);
process.stderr.write("\n");
writeFileSync(join(outDir, `memory-audit-${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

// ---------- summary ----------
const judged = rows.filter((r) => !r.error);
const count = (xs, f) => xs.filter(f).length;
const memVerdicts = Object.fromEntries(
  ["P", "Q"].map((src) => [
    src === "P" ? "push" : "pull",
    Object.fromEntries(VERDICTS.map((v) => [v, judged.flatMap((r) => r.memories).filter((x) => x.id.startsWith(src) && x.verdict === v).length])),
  ]),
);
const withMemory = judged.filter((r) => r.push || r.pulled);
const summary = {
  ...det,
  model: MODEL,
  since: SINCE || null,
  memory_only: MEMORY_ONLY,
  judged: judged.length,
  judge_errors: rows.length - judged.length,
  memory_verdicts: memVerdicts,
  effect_when_memory_present: {
    moves: withMemory.length,
    helped: count(withMemory, (r) => r.effect === "helped"),
    neutral: count(withMemory, (r) => r.effect === "neutral"),
    hurt: count(withMemory, (r) => r.effect === "hurt"),
  },
  gap: {
    all_moves: count(judged, (r) => r.gap === true),
    with_no_memory: count(judged.filter((r) => !r.push && !r.pulled), (r) => r.gap === true),
  },
};
writeFileSync(join(outDir, `memory-audit-${name}-summary.json`), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

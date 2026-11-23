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
// Only these flags take a value; `--dry` and `--memory-only` do not, so a path may follow them.
const VALUED = new Set(["--since", "--limit", "--jobs"]);
const project = argv.find((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
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
// A card names either the full tool (mem0: `mcp__plugin_mem0_mem0__search_memories`) or a bare
// one (claude-mem: `search`). A bare name matches only on the provider's own server, so another
// server's `search` tool is not counted as memory.
const toolMatches = (name) =>
  !!TOOL && (name === TOOL || (name.endsWith(`__${TOOL}`) && name.includes(card.provider)));
// Memories arrive as a numbered list (`1. …\n2. …`), the shape mem0 uses. Items are split only at
// the NEXT number in sequence, so a memory carrying its own "1. step" list stays one item. Text
// with no list ("No matching memories found.", a failure without is_error) is no memory at all;
// a provider with another result shape needs its own splitter (evals/README.md).
const splitMemories = (text) => {
  const items = [];
  for (const part of text.split(/\n(?=\d+\.\s)/)) {
    const n = Number(part.match(/^(\d+)\.\s/)?.[1]);
    if (n === items.length + 1) items.push(part.trim());
    else if (items.length) items[items.length - 1] += `\n${part}`;
  }
  return items;
};
// A slash command the user typed, as `/name args`, or null for anything else in angle brackets.
const commandOf = (text) => {
  const name = text.match(/<command-name>([^<]*)<\/command-name>/)?.[1];
  if (!name) return null;
  const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? "";
  return `${name.trim()} ${args.trim()}`.trim();
};

// One move = one request the user typed, plus everything the agent did until the next one —
// including turns woken by task notifications, which finish the same request. A substantive
// prompt or a slash command (`/recall …`, `/loop`) opens a new move; a short follow-up ("да",
// "ok go") continues the current one, because the work it releases — searches included — belongs
// to the request it answers. Nothing the agent does after the first typed message is dropped.
const SEEN = new Set();
function extractMoves(lines, session) {
  const moves = [];
  let cur = null;
  let position = 0;
  const pullCalls = new Map();
  for (const line of lines) {
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.isSidechain) continue;
    // A forked session's file starts with a copy of its parent's records, same uuids: count each
    // record once across all files, or the copied prompts are audited twice.
    if (r.uuid) {
      if (SEEN.has(r.uuid)) continue;
      SEEN.add(r.uuid);
    }
    if (r.type === "user" && r.origin?.kind === "human" && !r.isMeta) {
      const raw = textOf(r.message?.content);
      const command = commandOf(raw);
      const text = command ?? raw;
      if ((command || !raw.startsWith("<")) && !raw.startsWith("[Request interrupted")) {
        position += 1;
        if (command || isSubstantive(text) || !cur) {
          cur = { session, ts: r.timestamp, position, prompt: text, push: [], pull: [], trace: [], reply: [] };
          moves.push(cur);
        } else {
          cur.trace.push(`[user follow-up] ${clip(text, 200)}`);
        }
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
        // A refused or failed search (is_error) returned no memories, whatever its text says.
        if (call) call.move.pull.push({ query: call.query, failed: !!b.is_error, memories: b.is_error ? [] : splitMemories(`\n${t}`) });
        cur.trace.push(`← ${clip(t.replace(/\s+/g, " "), 400)}`);
      }
    }
  }
  return moves;
}

if (!files.length) {
  console.error(`no transcripts under ${projectsDir} for ${slug} — is the path the one the sessions ran in?`);
  process.exit(1);
}
let moves = [];
for (const f of files) {
  const session = `${basename(join(f, "..")).slice(slug.length) || "."}/${basename(f, ".jsonl").slice(0, 8)}`;
  moves.push(...extractMoves(readFileSync(f, "utf8").split("\n"), session));
}
if (SINCE) moves = moves.filter((m) => m.ts >= SINCE);
moves.sort((a, b) => a.ts.localeCompare(b.ts));

// ---------- deterministic counts (no judge) ----------
// One definition of "memory reached the prompt", used by the counts and the judged summary alike:
// at least one memory arrived, pushed or fetched. A search that returned nothing is a search, not
// memory, and is counted on its own line.
const pulledCount = (m) => m.pull.reduce((n, p) => n + p.memories.length, 0);
const reached = (m) => m.push.length > 0 || pulledCount(m) > 0;
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
  moves_with_search: withPull.length,
  moves_where_search_returned_nothing: withPull.filter((m) => pulledCount(m) === 0).length,
  failed_searches: moves.reduce((n, m) => n + m.pull.filter((p) => p.failed).length, 0),
  moves_memory_reached: moves.filter(reached).length,
  moves_with_no_memory: moves.filter((m) => !reached(m)).length,
};

console.log(isolationReport("judge"));
console.log(`provider card: ${basename(cardPath)} · tool=${TOOL ?? "none"} · injection_marker=${MARKER ? "yes" : "none (pull only)"}`);
console.log(JSON.stringify(det, null, 2));
if (DRY) process.exit(0);
// The counts above cover the whole window; the judge gets the selection (and --limit keeps the
// most recent N of it).
if (MEMORY_ONLY) moves = moves.filter(reached);
if (moves.length > LIMIT) moves = moves.slice(-LIMIT);

// ---------- the judge ----------
const VERDICTS = ["used", "redundant", "irrelevant", "stale", "misled"];
// The prompt goes to `claude -p` as one argv string, and Linux caps one argument at 128 KiB —
// in BYTES, and Cyrillic takes two per character. Stay well under it, measured in bytes.
const MAX_BYTES = 96 * 1024;
const bytes = (s) => Buffer.byteLength(s, "utf8");

function judgePrompt(m) {
  const mems = [
    ...m.push.map((t, i) => ({ id: `P${i + 1}`, t })),
    ...m.pull.flatMap((p, j) => p.memories.map((t, i) => ({ id: `Q${j + 1}.${i + 1}`, t }))),
  ];
  // Every memory must be shown to get a verdict, so a turn with many shrinks each one instead.
  const per = Math.max(160, Math.min(700, Math.floor(20000 / Math.max(1, mems.length))));
  const memBlock = mems.length ? mems.map((x) => `${x.id}: ${clip(x.t, per)}`).join("\n") : "(none)";
  const queries = m.pull.map((p, j) => `Q${j + 1} query: ${clip(p.query, 200)}`).join("\n") || "(no search)";
  const build = (trace, reply) => template(clip(m.prompt, 3000), memBlock, queries, trace, reply);
  let trace = m.trace.join("\n");
  let reply = clip(m.reply.join("\n\n"), 9000);
  let text = build(trace, reply);
  // Shrink the trace's middle first, then the reply, until the prompt fits.
  while (bytes(text) > MAX_BYTES && trace.length > 2000) {
    const keep = Math.floor(trace.length / 4);
    trace = `${trace.slice(0, keep)}\n…[trace clipped]…\n${trace.slice(-keep)}`;
    text = build(trace, reply);
  }
  while (bytes(text) > MAX_BYTES && reply.length > 1000) {
    reply = clip(reply, Math.floor(reply.length / 2));
    text = build(trace, reply);
  }
  return { text, ids: mems.map((x) => x.id) };
}

function template(prompt, memBlock, queries, trace, reply) {
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
${prompt}

=== MEMORIES ===
${memBlock}
${queries}

=== TRACE ===
${trace}

=== REPLY ===
${reply}`;
}

// The judge's verdicts are kept only for ids it was shown; ids it skipped are recorded, not
// guessed. `effect` is derived from the verdicts, never taken from the judge, so the per-prompt
// effect cannot disagree with the verdict table.
async function judge(m) {
  const { text, ids } = judgePrompt(m);
  const raw = await claude(text, MODEL);
  const j = firstJson(raw);
  if (!j || !Array.isArray(j.memories)) return { error: clip(raw, 200) };
  const known = new Set(ids);
  const seen = new Set();
  const memories = j.memories.filter(
    (x) => x && typeof x.id === "string" && known.has(x.id) && VERDICTS.includes(x.verdict) && !seen.has(x.id) && seen.add(x.id),
  );
  const v = (k) => memories.some((x) => x.verdict === k);
  return {
    memories,
    unjudged: ids.filter((id) => !seen.has(id)),
    gap: j.gap === true,
    gap_what: typeof j.gap_what === "string" ? j.gap_what : "",
    effect: v("misled") ? "hurt" : v("used") ? "helped" : "neutral",
  };
}

const outDir = join(ROOT, "out");
mkdirSync(outDir, { recursive: true });
const name = `${basename(realpathSync(project))}${MEMORY_ONLY ? "-memory" : ""}${SINCE ? `-since-${SINCE}` : ""}${
  Number.isFinite(LIMIT) ? `-limit-${LIMIT}` : ""}`;
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
        push: m.push.length, pull_calls: m.pull.length, pulled: pulledCount(m),
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
  memories_unjudged: judged.reduce((n, r) => n + r.unjudged.length, 0),
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
